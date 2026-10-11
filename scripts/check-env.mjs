/**
 * Check that the environment variables are readable and well formed.
 *
 *   npm run check
 *
 * Nothing is sent anywhere — this only inspects your local files.
 */

import fs from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });
dotenv.config({ path: '.env' });

const problems = [];
const notes = [];

console.log(`\nChecking environment in:\n  ${process.cwd()}\n`);

/* --- which files exist ------------------------------------------- */
for (const f of ['.env.local', '.env']) {
  const p = path.join(process.cwd(), f);
  if (fs.existsSync(p)) {
    const lines = fs.readFileSync(p, 'utf8').split(/\r?\n/).filter((l) => l.trim() && !l.trim().startsWith('#'));
    console.log(`  found ${f}  (${lines.length} setting${lines.length === 1 ? '' : 's'})`);
  } else {
    console.log(`  no ${f}`);
  }
}

/* --- stray .txt files, the classic Windows trap ------------------- */
for (const f of fs.readdirSync(process.cwd())) {
  if (/^\.env.*\.txt$/i.test(f)) {
    problems.push(`There is a file called "${f}". Windows added .txt — rename it to .env.local`);
  }
}

console.log('');

/* --- MONGODB_URI -------------------------------------------------- */
const uri = process.env.MONGODB_URI;

if (!uri) {
  problems.push('MONGODB_URI is not set at all.');
} else {
  const mask = uri.replace(/\/\/([^:]+):([^@]*)@/, (_, u) => `//${u}:••••••@`);
  console.log(`MONGODB_URI reads as:\n  ${mask}\n`);

  if (/\s/.test(uri)) problems.push('It contains a space or line break. It must be one unbroken line.');
  if (/[<>]/.test(uri)) problems.push('It still contains < or > — replace <db_password> including the angle brackets.');
  if (!/^mongodb(\+srv)?:\/\//.test(uri)) problems.push('It must start with mongodb+srv:// (or mongodb://).');
  if (/^["']|["']$/.test(uri)) problems.push('A stray quote ended up inside the value.');

  const at = (uri.match(/@/g) || []).length;
  if (at === 0) problems.push('There is no @ — the username:password part is missing.');
  if (at > 1) {
    problems.push(
      'There is more than one @ — your password almost certainly contains one. ' +
        'Change the database password in Atlas to letters and numbers only.'
    );
  }

  const creds = uri.split('//')[1]?.split('@')[0] || '';
  if (/[:/?#[\]]/.test(creds.split(':').slice(1).join(':'))) {
    problems.push('The password contains : / ? # [ or ] — change it in Atlas to letters and numbers only.');
  }
  if (creds && !creds.includes(':')) problems.push('No password found — the format is username:password@host');

  const afterHost = uri.split('@')[1] || '';
  const dbPart = afterHost.split('/')[1]?.split('?')[0];
  if (!dbPart) {
    notes.push('No database name. Add mihad_lms between .net/ and ? — it works without, but this keeps things tidy.');
  }
  if (uri.includes('USER:PASSWORD') || uri.includes('cluster0.xxxxx')) {
    problems.push('This is still the example value from .env.example, not your real Atlas string.');
  }
}

/* --- AUTH_SECRET --------------------------------------------------- */
const secret = process.env.AUTH_SECRET;
if (!secret) problems.push('AUTH_SECRET is not set.');
else if (secret.length < 24) problems.push('AUTH_SECRET is too short — generate a long random string.');
else if (secret === 'change-this-to-a-long-random-string') problems.push('AUTH_SECRET is still the placeholder.');
else console.log(`AUTH_SECRET is set (${secret.length} characters)\n`);

/* --- verdict -------------------------------------------------------- */
if (problems.length) {
  console.log('Problems found:\n');
  problems.forEach((p, i) => console.log(`  ${i + 1}. ${p}`));
  console.log('');
  process.exit(1);
}

if (notes.length) {
  console.log('Worth tidying:\n');
  notes.forEach((n) => console.log(`  - ${n}`));
  console.log('');
}

console.log('Environment looks good. Try:  npm run seed\n');
