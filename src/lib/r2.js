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

const env = (k) => String(process.env[k] || '').trim().replace(/^["']|["']$/g, '');

export function r2Configured() {
  return !!(env('R2_ACCESS_KEY_ID') && env('R2_SECRET_ACCESS_KEY') && bucketName() && (env('R2_ACCOUNT_ID') || env('R2_ENDPOINT')));
}

/** Bucket name, forgiving a pasted URL or stray slashes. */
export function bucketName() {
  return env('R2_BUCKET').replace(/^https?:\/\/[^/]+\//, '').replace(/^\/+|\/+$/g, '');
}

let client;
function r2() {
  if (!client) {
    client = new AwsClient({
      accessKeyId: env('R2_ACCESS_KEY_ID'),
      secretAccessKey: env('R2_SECRET_ACCESS_KEY'),
      service: 's3',
      region: 'auto',
    });
  }
  return client;
}

/**
 * The R2 address. Accepts the plain 32-character Account ID, or the whole
 * "https://<id>.r2.cloudflarestorage.com" link pasted into either variable.
 */
export function endpoint() {
  const explicit = env('R2_ENDPOINT');
  if (explicit && !/r2\.cloudflarestorage\.com/i.test(explicit)) return explicit.replace(/\/+$/, ''); // local testing
  const raw = explicit || env('R2_ACCOUNT_ID');
  const id = (raw.match(/[a-f0-9]{32}/i) || [raw.replace(/^https?:\/\//, '').split('.')[0]])[0].toLowerCase();
  const jurisdiction = (raw.match(/\.(eu|fedramp)\.r2\.cloudflarestorage\.com/i) || [])[1];
  return `https://${id}.${jurisdiction ? `${jurisdiction.toLowerCase()}.` : ''}r2.cloudflarestorage.com`;
}

/** Endpoint host with the account id partly hidden — safe to show in a status message. */
export function endpointHint() {
  try {
    const host = new URL(endpoint()).host;
    return host.replace(/^([a-z0-9]{4})[a-z0-9]+([a-z0-9]{4})\./i, '$1…$2.');
  } catch {
    return '(invalid address)';
  }
}

const encodeKey = (key) => key.split('/').map(encodeURIComponent).join('/');
export const objectUrl = (key) => `${endpoint()}/${bucketName()}/${encodeKey(key)}`;

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

export async function getObjectBuffer(key) {
  const res = await r2().fetch(objectUrl(key));
  if (!res.ok) throw new Error(`Storage read failed (${res.status})`);
  return Buffer.from(await res.arrayBuffer());
}

/** Keys (with LastModified) under a prefix — up to 1000. */
export async function listObjects(prefix) {
  const url = new URL(`${endpoint()}/${bucketName()}`);
  url.searchParams.set('list-type', '2');
  url.searchParams.set('prefix', prefix);
  url.searchParams.set('max-keys', '1000');
  const res = await r2().fetch(url.toString());
  if (!res.ok) throw new Error(`Storage list failed (${res.status})`);
  const xml = await res.text();
  return [...xml.matchAll(/<Contents>([\s\S]*?)<\/Contents>/g)].map((m) => ({
    key: (m[1].match(/<Key>([\s\S]*?)<\/Key>/) || [])[1]?.replace(/&amp;/g, '&') || '',
    modified: (m[1].match(/<LastModified>([\s\S]*?)<\/LastModified>/) || [])[1] || '',
  }));
}
