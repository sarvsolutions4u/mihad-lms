import { NextResponse } from 'next/server';
import { dbConnect } from '@/lib/db';
import { StoredFile, User } from '@/models';
import { requireSession } from '@/lib/auth';
import { findFile, isInline, canOpenFile, deleteFile } from '@/lib/files';
import { presign, disposition, headObject, getObjectBuffer, putObject, listObjects, deleteObject } from '@/lib/r2';
import { stampPdf, isPdf, learnerLine } from '@/lib/watermark';
import { fail, ok, handleError, todayISO } from '@/lib/api';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const LEARNER = ['student', 'parent'];
const learnerFor = (session) => User.findById(session.uid).select('name admissionNo').lean();

/**
 * A student's / parent's own copy of a course PDF, stamped with their name.
 * Kept for the day under _stamped/<date>/ so repeat opens are instant; older
 * days are cleared out whenever a new copy is made.
 */
async function learnerCopyKey(meta, session) {
  const today = todayISO();
  const key = `_stamped/${today}/${meta._id}/${session.uid}.pdf`;
  if (await headObject(key)) return key;

  const stamped = await stampPdf(await getObjectBuffer(meta.key), {
    footer: [learnerLine(await learnerFor(session))],
    diagonal: meta.watermark === 'done' ? '' : 'AL MIHAD TRAINING',
    at: 'top',
  });
  if (!stamped.ok) return null;
  await putObject(key, stamped.bytes, 'application/pdf');

  // tidy up earlier days' copies
  try {
    const old = (await listObjects('_stamped/')).filter((o) => o.key.split('/')[1] < today);
    await Promise.all(old.map((o) => deleteObject(o.key).catch(() => {})));
  } catch {
    /* housekeeping only */
  }
  return key;
}

/**
 * Open (inline) or download (?download=1) a stored file.
 * Files in Cloudflare R2 -> access check, then a redirect to a 5-minute signed link.
 * Older files kept in the database -> streamed from here.
 */
export async function GET(req, ctxParams) {
  try {
    const { id } = await ctxParams.params;
    const session = await requireSession();
    if (!/^[a-f0-9]{32}$/.test(String(id))) return fail('File not found', 404);
    const wantsDownload = new URL(req.url).searchParams.get('download') === '1';

    await dbConnect();
    const meta = await StoredFile.findById(id).lean();
    if (meta) {
      if (meta.status !== 'ready') return fail('This upload did not finish', 404);
      if (!(await canOpenFile(session, meta))) return fail('You do not have access to this file', 403);
      const kind = wantsDownload || !isInline(meta.contentType) ? 'attachment' : 'inline';
      let key = meta.key;
      if (LEARNER.includes(session.role) && meta.purpose === 'general' && isPdf(meta.contentType, meta.name) && meta.watermark !== 'protected') {
        key = (await learnerCopyKey(meta, session)) || meta.key;
      }
      const url = await presign('GET', key, {
        expires: 300,
        query: { 'response-content-disposition': disposition(kind, meta.name), 'response-content-type': meta.contentType },
      });
      return NextResponse.redirect(url, { status: 302, headers: { 'Cache-Control': 'private, no-store' } });
    }

    const found = await findFile(id);
    if (!found) return fail('File not found', 404);
    const { doc, bucket } = found;
    if (!(await canOpenFile(session, doc.metadata))) return fail('You do not have access to this file', 403);

    const chunks = [];
    await new Promise((resolve, reject) => {
      bucket
        .openDownloadStream(id)
        .on('data', (c) => chunks.push(c))
        .on('error', reject)
        .on('end', resolve);
    });
    let body = Buffer.concat(chunks);
    const contentType = doc.metadata?.contentType || 'application/octet-stream';
    if (LEARNER.includes(session.role) && (doc.metadata?.purpose || 'general') === 'general' && isPdf(contentType, doc.filename)) {
      const stamped = await stampPdf(body, {
        footer: [learnerLine(await learnerFor(session))],
        diagonal: doc.metadata?.watermark === 'done' ? '' : 'AL MIHAD TRAINING',
        at: 'top',
      });
      if (stamped.ok) body = stamped.bytes;
    }
    const kind = wantsDownload || !isInline(contentType) ? 'attachment' : 'inline';

    return new Response(body, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Content-Length': String(body.length),
        'Content-Disposition': disposition(kind, doc.filename),
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
