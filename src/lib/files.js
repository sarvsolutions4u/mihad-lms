import crypto from 'crypto';
import mongoose from 'mongoose';
import { dbConnect } from '@/lib/db';

/**
 * Built-in file storage, kept inside the same MongoDB database (GridFS).
 *
 * Why here and not an outside service: it works with nothing extra to set up,
 * and every download goes through /api/files/<id>, which checks who is signed
 * in — so fee receipts stay private to the office and the parent.
 *
 * Limits: Vercel accepts request bodies up to ~4.5 MB, so files are capped at
 * 4 MB. For long videos or very large files, paste a YouTube / Drive link.
 */

export const MAX_FILE_BYTES = 4 * 1024 * 1024;
const BUCKET = 'uploads';

// Extension -> content type. Anything not listed is refused.
const TYPES = {
  pdf: 'application/pdf',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  csv: 'text/csv',
  ppt: 'application/vnd.ms-powerpoint',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  txt: 'text/plain',
  rtf: 'application/rtf',
  odt: 'application/vnd.oasis.opendocument.text',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  heic: 'image/heic',
  mp3: 'audio/mpeg',
  m4a: 'audio/mp4',
  wav: 'audio/wav',
  mp4: 'video/mp4',
  zip: 'application/zip',
};

// Shown in the browser tab rather than downloaded. Everything else downloads,
// so an uploaded file can never run as a web page on this site.
const INLINE = new Set(['application/pdf', 'image/png', 'image/jpeg', 'image/gif', 'image/webp', 'audio/mpeg', 'video/mp4']);


export function typeFor(fileName = '') {
  const ext = String(fileName).split('.').pop().toLowerCase();
  return TYPES[ext] || null;
}

export const isInline = (contentType) => INLINE.has(contentType);

async function bucket() {
  await dbConnect();
  return new mongoose.mongo.GridFSBucket(mongoose.connection.db, { bucketName: BUCKET });
}

/** Save an uploaded File (from formData) and return its reference. */
export async function saveFile(file, meta = {}) {
  const contentType = typeFor(file.name);
  if (!contentType) {
    const e = new Error('This file type is not allowed. Use PDF, Word, Excel, PowerPoint, images, audio, MP4 or ZIP.');
    e.status = 415;
    throw e;
  }
  if (file.size > MAX_FILE_BYTES) {
    const e = new Error('File is larger than 4 MB. Compress it, or paste a Google Drive / YouTube link instead.');
    e.status = 413;
    throw e;
  }

  let buf = Buffer.from(await file.arrayBuffer());
  if (contentType === 'application/pdf' && meta.purpose === 'general' && ['teacher', 'admin'].includes(meta.role)) {
    const { stampPdf, uploaderLine } = await import('@/lib/watermark');
    const stamped = await stampPdf(buf, { footer: [uploaderLine({ role: meta.role, name: meta.uploaderName })] });
    if (stamped.ok) buf = stamped.bytes;
    meta = { ...meta, watermark: stamped.ok ? 'done' : stamped.reason };
  }
  const id = crypto.randomBytes(16).toString('hex'); // unguessable id
  const b = await bucket();
  const name = String(file.name || 'file').replace(/[\\/]/g, '_').slice(0, 180);

  await new Promise((resolve, reject) => {
    const up = b.openUploadStreamWithId(id, name, { metadata: { ...meta, contentType } });
    up.on('error', reject);
    up.on('finish', resolve);
    up.end(buf);
  });

  return { id, url: `/api/files/${id}`, name, size: buf.length, contentType, watermark: meta.watermark || '' };
}

export async function findFile(id) {
  if (!/^[a-f0-9]{32}$/.test(String(id))) return null;
  const b = await bucket();
  const [doc] = await b.find({ _id: id }).limit(1).toArray();
  return doc ? { doc, bucket: b } : null;
}

/** Remove a file wherever it lives (Cloudflare R2 or the database). */
export async function deleteFile(id) {
  if (!/^[a-f0-9]{32}$/.test(String(id))) return;
  await dbConnect();
  const { StoredFile } = await import('@/models');
  const meta = await StoredFile.findById(id).lean();
  if (meta) {
    const { deleteObject } = await import('@/lib/r2');
    await deleteObject(meta.key).catch(() => {});
    await StoredFile.deleteOne({ _id: id });
    return;
  }
  const found = await findFile(id);
  if (found) await found.bucket.delete(id);
}

/** Who may open a file: fee files only for admins and that student's parents. */
export async function canOpenFile(session, meta = {}) {
  if (meta.purpose !== 'fee') return true; // course material: anyone signed in
  if (session.role === 'admin') return true;
  if (session.role === 'parent') {
    await dbConnect();
    const { User } = await import('@/models');
    const me = await User.findById(session.uid).select('children').lean();
    return (me?.children || []).some((c) => String(c) === String(meta.student));
  }
  return false;
}

export const newFileId = () => crypto.randomBytes(16).toString('hex');

/** "/api/files/<id>" -> "<id>" (or null for outside links) */
export function fileIdFromUrl(url) {
  const m = String(url || '').match(/^\/api\/files\/([a-f0-9]{32})/);
  return m ? m[1] : null;
}
