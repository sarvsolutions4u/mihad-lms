import mongoose from 'mongoose';
import { dbConnect } from '@/lib/db';
import { StoredFile } from '@/models';
import { requireSession } from '@/lib/auth';
import { typeFor, newFileId, MAX_FILE_BYTES } from '@/lib/files';
import { r2Configured, presign, R2_MAX_MB } from '@/lib/r2';
import { ok, fail, handleError } from '@/lib/api';

export const dynamic = 'force-dynamic';

/** Which upload route is active, and the size limit to show people. */
export async function GET() {
  try {
    await requireSession();
    return ok(r2Configured() ? { mode: 'r2', maxMB: R2_MAX_MB } : { mode: 'direct', maxMB: MAX_FILE_BYTES / 1024 / 1024 });
  } catch (err) {
    return handleError(err);
  }
}

/**
 * Step 1 of an upload: check the file, then hand the browser a short-lived
 * link to upload it straight to Cloudflare R2.
 * body: { fileName, size, purpose?, student? }
 * If R2 is not set up yet, replies { mode: 'direct' } and the browser falls
 * back to POST /api/upload (stored in the database, 4 MB limit).
 */
export async function POST(req) {
  try {
    const session = await requireSession(['admin', 'teacher', 'student']);
    if (!r2Configured()) return ok({ mode: 'direct', maxMB: MAX_FILE_BYTES / 1024 / 1024 });

    const { fileName, size, purpose = 'general', student } = await req.json();
    const contentType = typeFor(fileName);
    if (!contentType) return fail('This file type is not allowed. Use PDF, Word, Excel, PowerPoint, images, audio, MP4 or ZIP.', 415);
    if (!(Number(size) > 0)) return fail('The file is empty', 422);
    if (Number(size) > R2_MAX_MB * 1024 * 1024) {
      return fail(`File is larger than ${R2_MAX_MB} MB. For long videos, paste a YouTube or Google Drive link instead.`, 413);
    }

    const meta = { purpose: ['fee', 'submission'].includes(purpose) ? purpose : 'general' };
    if (meta.purpose === 'fee') {
      if (session.role !== 'admin') return fail('Only the office can upload fee documents', 403);
      if (!mongoose.Types.ObjectId.isValid(String(student || ''))) return fail('Choose the student first', 422);
      meta.student = student;
    }

    await dbConnect();
    const id = newFileId();
    const name = String(fileName).replace(/[\\/]/g, '_').slice(0, 180);
    const month = new Date().toISOString().slice(0, 7);
    const key = `${meta.purpose}/${month}/${id}/${name.replace(/[^\w.\- ]+/g, '_')}`;

    await StoredFile.create({
      _id: id,
      key,
      name,
      size: Number(size),
      contentType,
      ...meta,
      uploadedBy: session.uid,
      role: session.role,
      status: 'pending',
    });

    const uploadUrl = await presign('PUT', key, { expires: 900 });
    return ok({ mode: 'r2', id, uploadUrl, contentType, maxMB: R2_MAX_MB });
  } catch (err) {
    return handleError(err);
  }
}
