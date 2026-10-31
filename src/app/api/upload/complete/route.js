import { dbConnect } from '@/lib/db';
import { StoredFile } from '@/models';
import { requireSession } from '@/lib/auth';
import { headObject, deleteObject, getObjectBuffer, putObject, R2_MAX_MB } from '@/lib/r2';
import { stampPdf, isPdf, uploaderLine } from '@/lib/watermark';
import { ok, fail, handleError } from '@/lib/api';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/** Step 2 of an upload: confirm the file really arrived in R2. body: { id } */
export async function POST(req) {
  try {
    const session = await requireSession(['admin', 'teacher', 'student']);
    const { id } = await req.json();
    await dbConnect();

    const meta = await StoredFile.findById(String(id || ''));
    if (!meta) return fail('Upload not found', 404);
    if (String(meta.uploadedBy) !== String(session.uid)) return fail('Not your upload', 403);

    if (meta.status !== 'ready') {
      const head = await headObject(meta.key);
      if (!head) return fail('The file did not reach storage — please try again', 409);
      if (head.size > R2_MAX_MB * 1024 * 1024) {
        await deleteObject(meta.key);
        await meta.deleteOne();
        return fail(`File is larger than ${R2_MAX_MB} MB`, 413);
      }
      meta.size = head.size;
      meta.uploaderName = session.name || '';

      // Course PDFs from a trainer / the office get the Al Mihad + trainer watermark.
      if (isPdf(meta.contentType, meta.name) && meta.purpose === 'general' && ['teacher', 'admin'].includes(session.role)) {
        try {
          const stamped = await stampPdf(await getObjectBuffer(meta.key), { footer: [uploaderLine(session)] });
          if (stamped.ok) {
            await putObject(meta.key, stamped.bytes, 'application/pdf');
            meta.size = stamped.bytes.length;
            meta.watermark = 'done';
          } else {
            meta.watermark = stamped.reason; // 'protected' | 'unreadable'
          }
        } catch (e) {
          console.error('watermark failed', e);
          meta.watermark = 'failed';
        }
      }

      meta.status = 'ready';
      await meta.save();
    }

    return ok({
      url: `/api/files/${meta._id}`,
      fileName: meta.name,
      size: meta.size,
      contentType: meta.contentType,
      watermark: meta.watermark || '',
    });
  } catch (err) {
    return handleError(err);
  }
}
