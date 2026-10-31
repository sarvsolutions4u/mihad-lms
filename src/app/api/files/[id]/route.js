import { NextResponse } from 'next/server';
import { dbConnect } from '@/lib/db';
import { StoredFile } from '@/models';
import { requireSession } from '@/lib/auth';
import { findFile, isInline, canOpenFile, deleteFile } from '@/lib/files';
import { presign, disposition } from '@/lib/r2';
import { fail, ok, handleError } from '@/lib/api';

export const dynamic = 'force-dynamic';

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
      const url = await presign('GET', meta.key, {
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
    const body = Buffer.concat(chunks);
    const contentType = doc.metadata?.contentType || 'application/octet-stream';
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
