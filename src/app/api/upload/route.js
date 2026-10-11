import crypto from 'crypto';
import { requireSession } from '@/lib/auth';
import { ok, fail, handleError } from '@/lib/api';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * Upload a file (pdf / doc / ppt / image / video) to Cloudinary's free tier.
 *
 * If the Cloudinary keys are not configured, this returns a clear message —
 * the LMS still works completely, because every upload form also accepts a
 * plain link (Google Drive, OneDrive, YouTube), which costs nothing at all.
 */
export async function POST(req) {
  try {
    await requireSession(['admin', 'teacher']);

    const cloud = process.env.CLOUDINARY_CLOUD_NAME;
    const key = process.env.CLOUDINARY_API_KEY;
    const secret = process.env.CLOUDINARY_API_SECRET;

    if (!cloud || !key || !secret) {
      return fail(
        'File storage is not configured. Paste a Google Drive / OneDrive / YouTube link instead, or add the Cloudinary keys to your environment variables.',
        501
      );
    }

    const form = await req.formData();
    const file = form.get('file');
    if (!file || typeof file === 'string') return fail('No file received', 422);

    const folder = 'mihad-lms';
    const timestamp = Math.round(Date.now() / 1000);
    const signature = crypto
      .createHash('sha1')
      .update(`folder=${folder}&timestamp=${timestamp}${secret}`)
      .digest('hex');

    const payload = new FormData();
    payload.append('file', file);
    payload.append('api_key', key);
    payload.append('timestamp', String(timestamp));
    payload.append('folder', folder);
    payload.append('signature', signature);

    const res = await fetch(`https://api.cloudinary.com/v1_1/${cloud}/auto/upload`, {
      method: 'POST',
      body: payload,
    });
    const data = await res.json();

    if (!res.ok) return fail(data?.error?.message || 'Upload failed', 502);

    return ok({
      url: data.secure_url,
      fileName: file.name,
      resourceType: data.resource_type,
      bytes: data.bytes,
    });
  } catch (err) {
    return handleError(err);
  }
}
