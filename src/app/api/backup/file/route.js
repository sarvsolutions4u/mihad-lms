import { NextResponse } from 'next/server';
import { dbConnect } from '@/lib/db';
import { StoredFile } from '@/models';
import { requireSession } from '@/lib/auth';
import { fail, handleError } from '@/lib/api';
import { findFile } from '@/lib/files';
import { presign, getObjectBuffer } from '@/lib/r2';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const STREAM_MAX = 4 * 1024 * 1024; // Vercel's response limit is 4.5 MB

/**
 * GET /api/backup/file?id=<fileId>          → { url, fallback } — the original file, untouched (no watermark copies)
 * GET /api/backup/file?id=<fileId>&stream=1 → the bytes through this site (files up to 4 MB)
 * Admin only.
 */
export async function GET(req) {
  try {
    await requireSession(['admin']);
    await dbConnect();
    const sp = new URL(req.url).searchParams;
    const id = String(sp.get('id') || '');
    if (!/^[a-f0-9]{32}$/.test(id)) return fail('File not found', 404);
    const stream = sp.get('stream') === '1';
    const self = `/api/backup/file?id=${id}&stream=1`;

    const meta = await StoredFile.findById(id).lean();
    if (meta) {
      if (!stream) {
        const url = await presign('GET', meta.key, { expires: 900 });
        return NextResponse.json({ ok: true, url, fallback: (meta.size || 0) <= STREAM_MAX ? self : '' }, { headers: { 'Cache-Control': 'no-store' } });
      }
      if ((meta.size || 0) > STREAM_MAX) return fail('Too large to stream', 413);
      const body = await getObjectBuffer(meta.key);
      return new Response(body, { headers: { 'Content-Type': 'application/octet-stream', 'Content-Length': String(body.length), 'Cache-Control': 'no-store' } });
    }

    const found = await findFile(id);
    if (!found) return fail('File not found', 404);
    if (!stream) return NextResponse.json({ ok: true, url: self, fallback: '' });
    const chunks = [];
    await new Promise((resolve, reject) => {
      found.bucket.openDownloadStream(id).on('data', (c) => chunks.push(c)).on('error', reject).on('end', resolve);
    });
    const body = Buffer.concat(chunks);
    return new Response(body, { headers: { 'Content-Type': 'application/octet-stream', 'Content-Length': String(body.length), 'Cache-Control': 'no-store' } });
  } catch (err) {
    return handleError(err);
  }
}
