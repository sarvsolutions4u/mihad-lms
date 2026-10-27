import mongoose from 'mongoose';
import { requireSession } from '@/lib/auth';
import { saveFile } from '@/lib/files';
import { ok, fail, handleError } from '@/lib/api';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * Upload one file into the app's own storage.
 *
 * multipart/form-data:
 *   file      the file (max 4 MB)
 *   purpose   'general' (default) | 'fee' | 'submission'
 *   student   for purpose=fee — the student the receipt belongs to
 *
 * Fee files are private: only admins and that student's parents can open them.
 */
export async function POST(req) {
  try {
    const session = await requireSession(['admin', 'teacher', 'student']);
    const form = await req.formData();
    const file = form.get('file');
    if (!file || typeof file === 'string') return fail('No file received', 422);

    const purpose = String(form.get('purpose') || 'general');
    const meta = { uploadedBy: String(session.uid), role: session.role, purpose };

    if (purpose === 'fee') {
      if (session.role !== 'admin') return fail('Only the office can upload fee documents', 403);
      const student = String(form.get('student') || '');
      if (!mongoose.Types.ObjectId.isValid(student)) return fail('Choose the student first', 422);
      meta.student = student;
    }

    const saved = await saveFile(file, meta);
    return ok({ url: saved.url, fileName: saved.name, size: saved.size, contentType: saved.contentType });
  } catch (err) {
    return handleError(err);
  }
}
