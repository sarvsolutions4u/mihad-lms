import mongoose from 'mongoose';
import { dbConnect } from '@/lib/db';
import { StoredFile } from '@/models';
import { requireSession } from '@/lib/auth';
import { r2Configured, R2_MAX_MB } from '@/lib/r2';
import { ok, handleError } from '@/lib/api';

export const dynamic = 'force-dynamic';

/** How much space is used — for the admin Settings page. */
export async function GET() {
  try {
    await requireSession(['admin']);
    await dbConnect();
    const db = mongoose.connection.db;

    const [r2agg, byPurpose, stats, gridfs] = await Promise.all([
      StoredFile.aggregate([{ $match: { status: 'ready' } }, { $group: { _id: null, count: { $sum: 1 }, bytes: { $sum: '$size' } } }]),
      StoredFile.aggregate([{ $match: { status: 'ready' } }, { $group: { _id: '$purpose', count: { $sum: 1 }, bytes: { $sum: '$size' } } }]),
      db.stats(),
      db
        .collection('uploads.files')
        .aggregate([{ $group: { _id: null, count: { $sum: 1 }, bytes: { $sum: '$length' } } }])
        .toArray()
        .catch(() => []),
    ]);

    return ok({
      r2: { configured: r2Configured(), maxMB: R2_MAX_MB, count: r2agg[0]?.count || 0, bytes: r2agg[0]?.bytes || 0, freeGB: 10 },
      byPurpose: byPurpose.map((p) => ({ purpose: p._id, count: p.count, bytes: p.bytes })),
      database: { bytes: (stats.dataSize || 0) + (stats.indexSize || 0), limitBytes: 512 * 1024 * 1024 },
      databaseFiles: { count: gridfs[0]?.count || 0, bytes: gridfs[0]?.bytes || 0 },
    });
  } catch (err) {
    return handleError(err);
  }
}
