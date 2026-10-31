import { AwsClient } from 'aws4fetch';

/**
 * Cloudflare R2 (S3-compatible) object storage for uploaded files.
 *
 * Set these in Vercel → Settings → Environment Variables:
 *   R2_ACCOUNT_ID         Cloudflare account id
 *   R2_ACCESS_KEY_ID      R2 API token — Access Key ID
 *   R2_SECRET_ACCESS_KEY  R2 API token — Secret Access Key
 *   R2_BUCKET             bucket name, e.g. mihad-lms-files
 *   R2_ENDPOINT           (optional) override, only for local testing
 *
 * Files never pass through Vercel: the browser uploads straight to R2 with a
 * short-lived signed link, and downloads go through /api/files/<id>, which
 * checks who is asking before redirecting to a 5-minute signed link.
 */

export const R2_MAX_MB = 100;

export function r2Configured() {
  const e = process.env;
  return !!(e.R2_ACCESS_KEY_ID && e.R2_SECRET_ACCESS_KEY && e.R2_BUCKET && (e.R2_ACCOUNT_ID || e.R2_ENDPOINT));
}

let client;
function r2() {
  if (!client) {
    client = new AwsClient({
      accessKeyId: process.env.R2_ACCESS_KEY_ID,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
      service: 's3',
      region: 'auto',
    });
  }
  return client;
}

const endpoint = () =>
  (process.env.R2_ENDPOINT || `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`).replace(/\/$/, '');

const encodeKey = (key) => key.split('/').map(encodeURIComponent).join('/');
export const objectUrl = (key) => `${endpoint()}/${process.env.R2_BUCKET}/${encodeKey(key)}`;

/** A signed URL the browser can use directly (PUT to upload, GET to download). */
export async function presign(method, key, { expires = 600, query = {} } = {}) {
  const url = new URL(objectUrl(key));
  url.searchParams.set('X-Amz-Expires', String(expires));
  for (const [k, v] of Object.entries(query)) url.searchParams.set(k, v);
  const signed = await r2().sign(new Request(url.toString(), { method }), { aws: { signQuery: true } });
  return signed.url;
}

export async function headObject(key) {
  const res = await r2().fetch(objectUrl(key), { method: 'HEAD' });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Storage check failed (${res.status})`);
  return { size: Number(res.headers.get('content-length') || 0), contentType: res.headers.get('content-type') || '' };
}

export async function putObject(key, body, contentType = 'application/octet-stream') {
  const res = await r2().fetch(objectUrl(key), { method: 'PUT', body, headers: { 'Content-Type': contentType } });
  if (!res.ok) throw new Error(`Storage upload failed (${res.status})`);
}

export async function getObjectText(key) {
  const res = await r2().fetch(objectUrl(key));
  if (!res.ok) throw new Error(`Storage read failed (${res.status})`);
  return res.text();
}

export async function deleteObject(key) {
  const res = await r2().fetch(objectUrl(key), { method: 'DELETE' });
  if (!res.ok && res.status !== 404) throw new Error(`Storage delete failed (${res.status})`);
}

/** Content-Disposition value with a safe ASCII fallback + UTF-8 name. */
export function disposition(kind, name) {
  const safe = String(name || 'file').replace(/["\r\n]/g, '');
  return `${kind}; filename="${safe.replace(/[^\x20-\x7E]/g, '_')}"; filename*=UTF-8''${encodeURIComponent(safe)}`;
}
