import { dbConnect } from '@/lib/db';
import { User } from '@/models';
import { requireSession } from '@/lib/auth';
import { findFile, isInline } from '@/lib/files';
import { fail, ok, handleError } from '@/lib/api';

export const dynamic = 'force-dynamic';

async function canOpen(session, meta = {}) {
  if (meta.purpose !== 'fee') return true; // course material: anyone signed in
  if (session.role === 'admin') return true;
  if (session.role === 'parent') {
    await dbConnect();
    const me = await User.findById(session.uid).select('children').lean();
    return (me?.children || []).some((c) => String(c) === String(meta.student));
  }
  return false;
}

/** Open (inline) or download (?download=1) a stored file. */
export async function GET(req, ctxParams) {
  try {
    const { id } = await ctxParams.params;
    const session = await requireSession();

    const found = await findFile(id);
    if (!found) return fail('File not found', 404);
    const { doc, bucket } = found;

    if (!(await canOpen(session, doc.metadata))) return fail('You do not have access to this file', 403);

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
    const wantsDownload = new URL(req.url).searchParams.get('download') === '1';
    const disposition = wantsDownload || !isInline(contentType) ? 'attachment' : 'inline';
    const safeName = doc.filename.replace(/["\r\n]/g, '');

    return new Response(body, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Content-Length': String(body.length),
        'Content-Disposition': `${disposition}; filename="${safeName.replace(/[^\x20-\x7E]/g, '_')}"; filename*=UTF-8''${encodeURIComponent(safeName)}`,
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
    const found = await findFile(id);
    if (!found) return ok({ deleted: id });
    if (session.role !== 'admin' && String(found.doc.metadata?.uploadedBy) !== String(session.uid)) {
      return fail('Only the person who uploaded this file can remove it', 403);
    }
    await found.bucket.delete(id);
    return ok({ deleted: id });
  } catch (err) {
    return handleError(err);
  }
}
