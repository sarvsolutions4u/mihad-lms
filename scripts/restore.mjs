#!/usr/bin/env node
/**
 * Restore a backup made with Settings → Backup.
 *
 *   node scripts/restore.mjs <backup folder or .zip> [options]
 *
 *   (no options)        merge: every record in the backup is put back (same ids);
 *                       records added since the backup are left alone
 *   --replace           make the database exactly like the backup (collections in the
 *                       backup are emptied first). Asks for confirmation.
 *   --files             also upload the files back to Cloudflare R2 (files already there are skipped)
 *   --only=a,b          only these collections, e.g. --only=users,attendance
 *   --snapshot=<name>   which dated copy inside database/ (default: the newest)
 *   --dry-run           show what would happen, change nothing
 *   --yes               don't ask for confirmation
 *
 * Uses MONGODB_URI (and R2_* for --files) from .env.local / .env / the environment —
 * the same settings as the portal.
 */
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline/promises';
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import { BSON } from 'mongodb';
import { AwsClient } from 'aws4fetch';
import { unzipSync, strFromU8 } from 'fflate';

dotenv.config({ path: '.env.local' });
dotenv.config({ path: '.env' });
const { EJSON } = BSON;

const args = process.argv.slice(2);
const src = args.find((a) => !a.startsWith('--'));
const flag = (name) => args.includes(`--${name}`);
const opt = (name) => (args.find((a) => a.startsWith(`--${name}=`)) || '').split('=').slice(1).join('=');
if (!src) {
  console.log('Usage: node scripts/restore.mjs <backup folder or .zip> [--replace] [--files] [--only=a,b] [--snapshot=name] [--dry-run] [--yes]');
  process.exit(1);
}

/* ---------- read the backup (folder or zip) ---------- */
let entries; // path -> () => Buffer
if (fs.statSync(src).isDirectory()) {
  entries = new Map();
  const walk = (dir, rel = '') => {
    for (const d of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = rel ? `${rel}/${d.name}` : d.name;
      if (d.isDirectory()) walk(path.join(dir, d.name), p);
      else entries.set(p, () => fs.readFileSync(path.join(dir, d.name)));
    }
  };
  walk(src);
} else {
  const z = unzipSync(new Uint8Array(fs.readFileSync(src)));
  entries = new Map(Object.entries(z).map(([p, u8]) => [p, () => Buffer.from(u8)]));
}

const snapshots = [...new Set([...entries.keys()].filter((p) => p.startsWith('database/')).map((p) => p.split('/')[1]))].sort();
if (!snapshots.length) {
  console.error('No database/ folder found — is this an Al Mihad portal backup?');
  process.exit(1);
}
const snap = opt('snapshot') || snapshots[snapshots.length - 1];
if (!snapshots.includes(snap)) {
  console.error(`No snapshot "${snap}". Available: ${snapshots.join(', ')}`);
  process.exit(1);
}
const manifest = JSON.parse(entries.get(`database/${snap}/manifest.json`)().toString('utf8'));
const only = opt('only') ? opt('only').split(',').map((s) => s.trim()) : null;
const collections = manifest.collections.map((c) => c.name).filter((n) => !only || only.includes(n));
const dry = flag('dry-run');
const replace = flag('replace');

console.log(`\nBackup:   ${src}`);
console.log(`Snapshot: ${snap}  (taken ${manifest.exportedAt}, ${manifest.records} records, ${manifest.files.length} files)`);
console.log(`Mode:     ${replace ? 'REPLACE — collections are emptied, then filled from the backup' : 'merge — put back every record from the backup, keep newer ones'}${dry ? '  [dry run]' : ''}`);
console.log(`Into:     ${(process.env.MONGODB_URI || '').replace(/\/\/[^@]*@/, '//***@') || '(MONGODB_URI not set)'}`);
if (!process.env.MONGODB_URI) process.exit(1);

if (!dry && !flag('yes')) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const a = await rl.question(`\nType RESTORE to continue: `);
  rl.close();
  if (a.trim() !== 'RESTORE') {
    console.log('Stopped — nothing changed.');
    process.exit(0);
  }
}

/* ---------- database ---------- */
await mongoose.connect(process.env.MONGODB_URI);
const db = mongoose.connection.db;
let total = 0;
for (const name of collections) {
  const file = entries.get(`database/${snap}/${name}.json`);
  if (!file) {
    console.log(`  - ${name}: not in this backup, skipped`);
    continue;
  }
  const docs = EJSON.parse(file().toString('utf8'), { relaxed: true });
  if (dry) {
    console.log(`  ~ ${name}: ${docs.length} records would be ${replace ? 'restored (after emptying)' : 'merged'}`);
    continue;
  }
  const col = db.collection(name);
  if (replace) await col.deleteMany({});
  for (let i = 0; i < docs.length; i += 500) {
    const batch = docs.slice(i, i + 500);
    if (!batch.length) break;
    await col.bulkWrite(
      batch.map((d) => ({ replaceOne: { filter: { _id: d._id }, replacement: d, upsert: true } })),
      { ordered: false }
    );
  }
  total += docs.length;
  console.log(`  ✓ ${name}: ${docs.length}`);
}
if (!dry) console.log(`Database: ${total} records restored.`);

/* ---------- files ---------- */
if (flag('files')) {
  const env = (k) => String(process.env[k] || '').trim();
  const bucket = env('R2_BUCKET').replace(/^https?:\/\/[^/]+\//, '').replace(/^\/+|\/+$/g, '');
  const explicit = env('R2_ENDPOINT');
  let endpoint;
  if (explicit && !/r2\.cloudflarestorage\.com/i.test(explicit)) endpoint = explicit.replace(/\/+$/, '');
  else {
    const raw = explicit || env('R2_ACCOUNT_ID');
    endpoint = `https://${(raw.match(/[a-f0-9]{32}/i) || [raw])[0].toLowerCase()}.r2.cloudflarestorage.com`;
  }
  const aws = new AwsClient({ accessKeyId: env('R2_ACCESS_KEY_ID'), secretAccessKey: env('R2_SECRET_ACCESS_KEY'), service: 's3', region: 'auto' });
  const url = (key) => `${endpoint}/${bucket}/${key.split('/').map(encodeURIComponent).join('/')}`;
  const keys = new Map(
    (entries.get(`database/${snap}/storedfiles.json`) ? EJSON.parse(entries.get(`database/${snap}/storedfiles.json`)().toString('utf8'), { relaxed: true }) : []).map((d) => [
      String(d._id),
      d,
    ])
  );
  const gridMeta = new Map(
    (entries.get(`database/${snap}/uploads.files.json`) ? EJSON.parse(entries.get(`database/${snap}/uploads.files.json`)().toString('utf8'), { relaxed: true }) : []).map((d) => [
      String(d._id),
      d,
    ])
  );
  let up = 0;
  let skip = 0;
  let missing = 0;
  for (const f of manifest.files) {
    const local = entries.get(f.path);
    if (!local) {
      missing += 1;
      continue;
    }
    if (f.store === 'r2') {
      const meta = keys.get(f.id);
      if (!meta?.key) {
        missing += 1;
        continue;
      }
      const head = await aws.fetch(url(meta.key), { method: 'HEAD' });
      if (head.ok && !replace) {
        skip += 1;
        continue;
      }
      if (dry) {
        up += 1;
        continue;
      }
      const bytes = local();
      const signed = await aws.sign(new Request(`${url(meta.key)}?X-Amz-Expires=600`, { method: 'PUT' }), { aws: { signQuery: true } });
      const res = await fetch(signed.url, { method: 'PUT', body: bytes, headers: { 'Content-Type': meta.contentType || 'application/octet-stream', 'Content-Length': String(bytes.length) } });
      if (!res.ok) throw new Error(`Upload of ${f.name} failed (${res.status})`);
      up += 1;
    } else {
      // older files kept inside the database (GridFS)
      const gm = gridMeta.get(f.id);
      const b = new mongoose.mongo.GridFSBucket(db, { bucketName: 'uploads' });
      const exists = await db.collection('uploads.chunks').findOne({ files_id: f.id });
      if (exists && !replace) {
        skip += 1;
        continue;
      }
      if (dry) {
        up += 1;
        continue;
      }
      if (exists) await db.collection('uploads.chunks').deleteMany({ files_id: f.id });
      await db.collection('uploads.files').deleteOne({ _id: f.id });
      await new Promise((resolve, reject) => {
        const w = b.openUploadStreamWithId(f.id, gm?.filename || f.name, { metadata: gm?.metadata });
        w.on('finish', resolve).on('error', reject);
        w.end(local());
      });
      up += 1;
    }
    if ((up + skip) % 25 === 0) process.stdout.write(`  files: ${up} uploaded, ${skip} already there…\r`);
  }
  console.log(`Files: ${up} ${dry ? 'would be ' : ''}uploaded, ${skip} already in storage, ${missing} not in the backup.`);
}

await mongoose.disconnect();
console.log(dry ? '\nDry run finished — nothing changed.' : '\nRestore finished.');
