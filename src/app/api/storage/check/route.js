import { r2Configured, putObject, getObjectText, deleteObject, presign } from '@/lib/r2';
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

  const key = '_healthcheck/check.txt';
  try {
    const stamp = new Date().toISOString();
    await putObject(key, stamp, 'text/plain');
    out.write = true;
    out.read = (await getObjectText(key)) === stamp;
    await deleteObject(key);
  } catch (e) {
    out.error = e.message;
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
