import { r2Configured, putObject, getObjectText, deleteObject, presign, endpointHint, bucketName } from '@/lib/r2';
import { ok } from '@/lib/api';

export const dynamic = 'force-dynamic';

/**
 * Is Cloudflare R2 set up correctly? Returns only yes/no answers, never keys.
 *   configured  the four R2_* variables are present
 *   write/read  a tiny test file can be written and read back
 *   cors        the bucket lets this site's browsers upload directly
 */
export async function GET(req) {
  const out = { configured: r2Configured(), write: false, read: false, cors: false, error: '' };
  if (!out.configured) return ok(out);
  out.endpoint = endpointHint();
  out.bucket = bucketName();
  const explain = (e) => {
    const code = e?.cause?.code || '';
    if (code === 'ENOTFOUND' || code === 'EAI_AGAIN') return `Cannot find ${out.endpoint} — R2_ACCOUNT_ID looks wrong (it should be the 32-character Account ID).`;
    if (/\(403\)/.test(e.message)) return 'R2 refused the keys — check R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY, and that the token covers this bucket.';
    if (/\(404\)/.test(e.message)) return `Bucket "${out.bucket}" was not found — check R2_BUCKET.`;
    return `${e.message}${code ? ` (${code})` : ''}`;
  };

  const key = '_healthcheck/check.txt';
  try {
    const stamp = new Date().toISOString();
    await putObject(key, stamp, 'text/plain');
    out.write = true;
    out.read = (await getObjectText(key)) === stamp;
    await deleteObject(key);
  } catch (e) {
    out.error = explain(e);
    return ok(out);
  }

  try {
    const origin = new URL(req.url).origin;
    const url = await presign('PUT', '_healthcheck/cors.txt', { expires: 60 });
    const res = await fetch(url, {
      method: 'OPTIONS',
      headers: { Origin: origin, 'Access-Control-Request-Method': 'PUT', 'Access-Control-Request-Headers': 'content-type' },
    });
    const allow = res.headers.get('access-control-allow-origin');
    out.cors = res.ok && (allow === '*' || allow === origin);
    if (!out.cors) out.error = `Uploads from ${origin} are blocked — add the CORS policy to the bucket.`;
  } catch (e) {
    out.error = `CORS check failed: ${e.message}`;
  }
  return ok(out);
}
