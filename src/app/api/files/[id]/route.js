import { NextResponse } from 'next/server';
import { dbConnect } from '@/lib/db';
import { StoredFile, User } from '@/models';
import { requireSession } from '@/lib/auth';
import { findFile, isInline, canOpenFile, deleteFile } from '@/lib/files';
import { presign, disposition, headObject, getObjectBuffer, putObject, listObjects, deleteObject } from '@/lib/r2';
import { stampPdf, isPdf, learnerLine } from '@/lib/watermark';
import { fail, ok, handleError, todayISO } from '@/lib/api';
import { logActivity } from '@/lib/activity';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const LEARNER = ['student', 'parent'];
// Vercel caps a function response at 4.5 MB; bigger files are always served by signed link.
const STREAM_MAX = 4 * 1024 * 1024;

const DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const DOC_MAX = 25 * 1024 * 1024;

const esc = (s) => String(s || '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

/**
 * A Word file as a readable page for the viewer. Scripts can't run in it
 * (strict CSP + shown in a sandboxed frame); links other than web/mail are removed.
 */
async function docAsHtml(bytes, { name, issuedTo }) {
  const mammoth = (await import('mammoth')).default;
  const { value } = await mammoth.convertToHtml({ buffer: bytes });
  const body = value
    .replace(/<a\s+href="(?!https?:|mailto:|#)[^"]*"/gi, '<a')
    .replace(/<a\s+href="(https?:[^"]*)"/gi, '<a href="$1" target="_blank" rel="noopener noreferrer"');
  const mark = issuedTo
    ? `<div class="mark" aria-hidden="true">${Array(400).fill(esc(issuedTo)).join(' &nbsp; · &nbsp; ')}</div><p class="issued">${esc(issuedTo)} · Al Mihad Training — for personal study only, do not share</p>`
    : '';
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${esc(name)}</title>
<style>
html,body{margin:0;background:#fff;color:#1f2937;font:16px/1.6 system-ui,-apple-system,"Segoe UI",Roboto,Arial,sans-serif}
main{max-width:820px;margin:0 auto;padding:28px 22px 60px;position:relative;z-index:1}
h1,h2,h3,h4{color:#7a121d;line-height:1.3}
table{border-collapse:collapse;width:100%;margin:12px 0}td,th{border:1px solid #d1d5db;padding:6px 8px;vertical-align:top}td p,th p{margin:0}
img{max-width:100%;height:auto}
.issued{max-width:820px;margin:0 auto;padding:10px 22px 0;font-size:11px;color:#7a121d;opacity:.7}
.mark{position:fixed;inset:-100%;transform:rotate(-30deg);font:600 15px/3.6 system-ui,sans-serif;overflow:hidden;color:#7a121d;opacity:.06;pointer-events:none;z-index:2;word-spacing:6px}
${issuedTo ? 'body{-webkit-user-select:none;user-select:none}@media print{body{display:none}}' : ''}
</style></head><body>${mark}<main>${body || '<p>This document is empty.</p>'}</main></body></html>`;
}

const learnerFor = (session) => User.findById(session.uid).select('name admissionNo').lean();

/** What the in-portal viewer can show. */
function viewKind(contentType = '', name = '') {
  if (isPdf(contentType, name)) return 'pdf';
  if (/^video\//.test(contentType)) return 'video';
  if (/^audio\//.test(contentType)) return 'audio';
  if (/^image\/(png|jpeg|gif|webp)$/.test(contentType)) return 'image';
  if (contentType === DOCX || /\.docx$/i.test(name)) return 'doc';
  return 'other';
}

/**
 * Course material that students and parents may only view inside the portal:
 * PDFs, videos, audio and pictures uploaded by the office or a trainer.
 * (Their own submissions, fee receipts and Word / PowerPoint files stay downloadable.)
 */
const viewOnlyFor = (session, f) => LEARNER.includes(session.role) && f.purpose === 'general' && f.kind !== 'other';

const trainerLine = (f) => (f.uploaderName ? `Trainer: ${f.uploaderName} | Al Mihad Training Centre` : 'Al Mihad Training Centre');

/** Footer lines + diagonal mark for a learner's copy. */
const learnerStamp = async (f, session) => ({
  // PDFs whose trainer watermark didn't go on at upload also get the trainer line here.
  footer: [learnerLine(await learnerFor(session)), ...(f.watermark === 'done' ? [] : [trainerLine(f)])],
  diagonal: f.watermark === 'done' ? '' : 'AL MIHAD TRAINING',
  at: 'top',
});

/**
 * A student's / parent's own copy of a course PDF, stamped with their name.
 * Kept for the day under _stamped/<date>/ so repeat opens are instant; older
 * days are cleared out whenever a new copy is made.
 */
async function learnerCopyKey(f, session) {
  const today = todayISO();
  const key = `_stamped/${today}/${f.id}/${session.uid}.pdf`;
  if (await headObject(key)) return key;

  const stamped = await stampPdf(await getObjectBuffer(f.key), await learnerStamp(f, session));
  if (!stamped.ok) return null;
  await putObject(key, stamped.bytes, 'application/pdf');

  // tidy up earlier days' copies
  try {
    // only ever touches _stamped/<earlier date>/… — never an original file
    const old = (await listObjects('_stamped/')).filter((o) => {
      const [top, day] = o.key.split('/');
      return top === '_stamped' && /^\d{4}-\d{2}-\d{2}$/.test(day) && day < today;
    });
    await Promise.all(old.map((o) => deleteObject(o.key).catch(() => {})));
  } catch {
    /* housekeeping only */
  }
  return key;
}

const needsLearnerCopy = (session, f) => LEARNER.includes(session.role) && f.purpose === 'general' && f.kind === 'pdf' && f.watermark !== 'protected';

/** The file, wherever it lives (Cloudflare R2, or older files in the database). */
async function locate(id) {
  const meta = await StoredFile.findById(id).lean();
  if (meta) {
    if (meta.status !== 'ready') return { missing: 'This upload did not finish' };
    return {
      store: 'r2',
      id: String(meta._id),
      key: meta.key,
      name: meta.name,
      contentType: meta.contentType || 'application/octet-stream',
      size: meta.size || 0,
      purpose: meta.purpose || 'general',
      watermark: meta.watermark || '',
      uploadedBy: meta.uploadedBy,
      uploaderName: meta.uploaderName || '',
      access: meta,
    };
  }
  const found = await findFile(id);
  if (!found) return null;
  const { doc, bucket } = found;
  const m = doc.metadata || {};
  return {
    store: 'db',
    id: String(id),
    bucket,
    name: doc.filename,
    contentType: m.contentType || 'application/octet-stream',
    size: doc.length || 0,
    purpose: m.purpose || 'general',
    watermark: m.watermark || '',
    uploadedBy: m.uploadedBy,
    uploaderName: m.uploaderName || '',
    access: { ...m, _id: id },
  };
}

/** The bytes as this person should see them (learners get their stamped PDF copy). */
async function bytesFor(f, session) {
  let body;
  if (f.store === 'r2') {
    const key = needsLearnerCopy(session, f) ? (await learnerCopyKey(f, session)) || f.key : f.key;
    return getObjectBuffer(key);
  }
  const chunks = [];
  await new Promise((resolve, reject) => {
    f.bucket
      .openDownloadStream(f.id)
      .on('data', (c) => chunks.push(c))
      .on('error', reject)
      .on('end', resolve);
  });
  body = Buffer.concat(chunks);
  if (needsLearnerCopy(session, f)) {
    const stamped = await stampPdf(body, await learnerStamp(f, session));
    if (stamped.ok) body = stamped.bytes;
  }
  return body;
}

async function signedFor(f, session, kind) {
  const key = needsLearnerCopy(session, f) ? (await learnerCopyKey(f, session)) || f.key : f.key;
  return presign('GET', key, {
    expires: 300,
    query: { 'response-content-disposition': disposition(kind, f.name), 'response-content-type': f.contentType },
  });
}

const log = (session, f, detail, req) =>
  logActivity({
    uid: session.uid,
    role: session.role,
    type: 'download',
    name: f.name,
    detail,
    fileId: f.id,
    fileOwner: f.uploadedBy,
    req,
    dedupeMins: 10,
  });

/**
 * GET /api/files/<id>
 *   (plain)      open it — students/parents are sent to the in-portal viewer for course material
 *   ?view=1      JSON for the in-portal viewer: { kind, url, fallbackUrl, canDownload, … }
 *   ?stream=1    the bytes through this site (viewer fallback; files up to 4 MB)
 *   ?download=1  save a copy — not for view-only course material
 */
export async function GET(req, ctxParams) {
  try {
    const { id } = await ctxParams.params;
    const session = await requireSession();
    if (!/^[a-f0-9]{32}$/.test(String(id))) return fail('File not found', 404);
    const q = new URL(req.url).searchParams;
    const mode =
      q.get('view') === '1' ? 'view' : q.get('stream') === '1' ? 'stream' : q.get('html') === '1' ? 'html' : q.get('download') === '1' ? 'download' : 'open';

    await dbConnect();
    const f = await locate(id);
    if (!f) return fail('File not found', 404);
    if (f.missing) return fail(f.missing, 404);
    if (!(await canOpenFile(session, f.access))) return fail('You do not have access to this file', 403);
    f.kind = viewKind(f.contentType, f.name);
    const viewOnly = viewOnlyFor(session, f);
    const noStore = { 'Cache-Control': 'private, no-store' };

    if (mode === 'view') {
      await log(session, f, 'Viewed', req);
      const canStream = f.size <= STREAM_MAX;
      const streamUrl = `/api/files/${f.id}?stream=1`;
      let url = streamUrl;
      if (f.kind === 'doc') url = `/api/files/${f.id}?html=1`;
      else if (f.store === 'r2' && f.kind !== 'other') url = await signedFor(f, session, 'inline');
      return NextResponse.json(
        {
          ok: true,
          id: f.id,
          name: f.name,
          size: f.size,
          contentType: f.contentType,
          kind: f.kind,
          url: f.kind === 'other' ? '' : url,
          fallbackUrl: f.store === 'r2' && canStream && !['other', 'doc'].includes(f.kind) ? streamUrl : '',
          canDownload: !viewOnly,
          downloadUrl: viewOnly ? '' : `/api/files/${f.id}?download=1`,
          protected: f.watermark === 'protected',
        },
        { headers: noStore }
      );
    }

    if (mode === 'html') {
      if (f.kind !== 'doc') return fail('Only Word (.docx) files open this way', 415);
      if (f.size > DOC_MAX) return fail('This Word file is too large to show here', 413);
      const bytes = f.store === 'r2' ? await getObjectBuffer(f.key) : await bytesFor(f, session);
      let html;
      try {
        const me = viewOnly ? await learnerFor(session) : null;
        html = await docAsHtml(bytes, { name: f.name, issuedTo: me ? `Issued to ${me.name}${me.admissionNo ? ` (${me.admissionNo})` : ''}` : '' });
      } catch {
        return fail('This Word file could not be opened. It may be damaged or password-protected.', 422);
      }
      if (Buffer.byteLength(html) > STREAM_MAX) return fail('This Word file has too many large pictures to show here — please save it as a PDF and upload that', 413);
      return new Response(html, {
        status: 200,
        headers: {
          'Content-Type': 'text/html; charset=utf-8',
          'Content-Security-Policy': "default-src 'none'; img-src data:; style-src 'unsafe-inline'; sandbox",
          'X-Content-Type-Options': 'nosniff',
          ...noStore,
        },
      });
    }

    if (mode === 'stream') {
      if (f.size > STREAM_MAX) return fail('This file is too large to stream here — it opens by secure link instead', 413);
      if (f.kind === 'other') return fail('This file cannot be shown in the portal', 415);
      const body = await bytesFor(f, session);
      return new Response(body, {
        status: 200,
        headers: {
          'Content-Type': f.contentType,
          'Content-Length': String(body.length),
          'Content-Disposition': disposition('inline', f.name),
          'X-Content-Type-Options': 'nosniff',
          ...noStore,
        },
      });
    }

    // plain open / download
    if (viewOnly) {
      if (mode === 'download') return fail('This file can be viewed in the portal but not downloaded', 403);
      return NextResponse.redirect(new URL(`/view/${f.id}`, req.url), { status: 302, headers: noStore });
    }
    await log(session, f, mode === 'download' ? 'Downloaded' : 'Opened', req);
    const kind = mode === 'download' || !isInline(f.contentType) ? 'attachment' : 'inline';
    if (f.store === 'r2') {
      return NextResponse.redirect(await signedFor(f, session, kind), { status: 302, headers: noStore });
    }
    const body = await bytesFor(f, session);
    return new Response(body, {
      status: 200,
      headers: {
        'Content-Type': f.contentType,
        'Content-Length': String(body.length),
        'Content-Disposition': disposition(kind, f.name),
        'X-Content-Type-Options': 'nosniff',
        'Cache-Control': 'private, max-age=3600',
      },
    });
  } catch (err) {
    return handleError(err);
  }
}

/** Remove a stored file — its uploader or an admin. */
export async function DELETE(req, ctxParams) {
  try {
    const { id } = await ctxParams.params;
    const session = await requireSession(['admin', 'teacher', 'student']);
    await dbConnect();
    const meta = await StoredFile.findById(id).lean();
    const owner = meta ? meta.uploadedBy : (await findFile(id))?.doc?.metadata?.uploadedBy;
    if (!meta && owner === undefined) return ok({ deleted: id });
    if (session.role !== 'admin' && String(owner) !== String(session.uid)) {
      return fail('Only the person who uploaded this file can remove it', 403);
    }
    await deleteFile(id);
    return ok({ deleted: id });
  } catch (err) {
    return handleError(err);
  }
}
