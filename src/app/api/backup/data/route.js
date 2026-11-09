import mongoose from 'mongoose';
import { dbConnect } from '@/lib/db';
import { requireSession } from '@/lib/auth';
import { fail, handleError } from '@/lib/api';
import { backupCollections, EJSON } from '@/lib/backup';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * GET /api/backup/data?c=<collection>&after=<EJSON _id>&limit=500 — admin only.
 * One page of a collection in MongoDB Extended JSON (keeps ids and dates exact),
 * in _id order. { docs: [...], next: <EJSON _id of the last doc> | null }
 */
export async function GET(req) {
  try {
    await requireSession(['admin']);
    await dbConnect();
    const sp = new URL(req.url).searchParams;
    const name = sp.get('c') || '';
    if (!(await backupCollections()).includes(name)) return fail('Unknown collection', 404);
    const limit = Math.min(Math.max(Number(sp.get('limit')) || 500, 1), 2000);
    const filter = {};
    if (sp.get('after')) filter._id = { $gt: EJSON.parse(sp.get('after')) };
    const docs = await mongoose.connection.db.collection(name).find(filter).sort({ _id: 1 }).limit(limit).toArray();
    const next = docs.length === limit ? EJSON.stringify(docs[docs.length - 1]._id) : null;
    return new Response(EJSON.stringify({ ok: true, docs, next }, { relaxed: true }), {
      headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'private, no-store' },
    });
  } catch (err) {
    return handleError(err);
  }
}
