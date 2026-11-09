import mongoose from 'mongoose';
import { dbConnect } from '@/lib/db';
import { StoredFile, Activity } from '@/models';
import { requireSession } from '@/lib/auth';
import { ok, handleError } from '@/lib/api';
import { logActivity } from '@/lib/activity';
import { backupCollections } from '@/lib/backup';

export const dynamic = 'force-dynamic';

/**
 * GET /api/backup — admin only. What a full backup contains:
 * every collection (with its record count) and every uploaded file.
 */
export async function GET() {
  try {
    await requireSession(['admin']);
    await dbConnect();
    const db = mongoose.connection.db;
    const names = await backupCollections();
    const collections = await Promise.all(names.map(async (name) => ({ name, count: await db.collection(name).countDocuments() })));

    const r2 = await StoredFile.find({ status: 'ready' }).select('name size purpose contentType updatedAt').sort({ _id: 1 }).lean();
    const grid = await db
      .collection('uploads.files')
      .find({})
      .project({ filename: 1, length: 1, metadata: 1, uploadDate: 1 })
      .toArray()
      .catch(() => []);
    const files = [
      ...r2.map((f) => ({ id: String(f._id), name: f.name, size: f.size || 0, purpose: f.purpose || 'general', store: 'r2' })),
      ...grid.map((f) => ({ id: String(f._id), name: f.filename, size: f.length || 0, purpose: f.metadata?.purpose || 'general', store: 'db' })),
    ];

    const last = await Activity.findOne({ type: 'download', detail: 'Full backup' }).sort({ at: -1 }).populate('user', 'name').lean();
    return ok({
      at: new Date().toISOString(),
      database: db.databaseName,
      collections,
      records: collections.reduce((a, c) => a + c.count, 0),
      files,
      fileBytes: files.reduce((a, f) => a + f.size, 0),
      last: last ? { at: last.at, by: last.user?.name || '', name: last.name } : null,
    });
  } catch (err) {
    return handleError(err);
  }
}

/** POST /api/backup — note a finished backup in the activity log. { records, files, failed, mode } */
export async function POST(req) {
  try {
    const session = await requireSession(['admin']);
    await dbConnect();
    const b = await req.json().catch(() => ({}));
    const n = (v) => Math.max(0, Math.floor(Number(v) || 0));
    await logActivity({
      uid: session.uid,
      role: session.role,
      type: 'download',
      name: `Full backup — ${n(b.records)} records, ${n(b.files)} new files${n(b.failed) ? `, ${n(b.failed)} failed` : ''} (${b.mode === 'zip' ? 'zip' : 'folder'})`,
      detail: 'Full backup',
      req,
    });
    return ok({});
  } catch (err) {
    return handleError(err);
  }
}
