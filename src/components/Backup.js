'use client';

import { useEffect, useRef, useState } from 'react';
import { Card } from './ui';
import Icon from './Icon';
import { fmtSize } from '@/lib/fileTypes';

/**
 * Admin → Settings → Backup.
 *
 * Saves EVERYTHING to this computer:
 *   database/<date_time>/<collection>.json   every record (MongoDB Extended JSON), one folder per backup
 *   database/<date_time>/manifest.json       counts, file list, when
 *   files/<purpose>/<id>__<name>             every uploaded file (originals, no watermark copies)
 *
 * Chrome / Edge on a computer: pick a folder once; later backups add a new dated
 * database copy and download only files that aren't in the folder yet.
 * Other browsers: one .zip with everything.
 */

const README = `AL MIHAD LEARNING PORTAL — BACKUP
=================================
database/<date_time>/   every record in the portal, one JSON file per collection
                        (MongoDB Extended JSON: ids and dates kept exactly)
files/<type>/           every uploaded file — notes, papers, student work, receipts, message attachments

Keep this folder private: it contains student details and sign-in data (passwords are stored encrypted).

To restore (a technical person, from the project folder):
  node scripts/restore.mjs "<this folder>"            merge the latest backup back in
  node scripts/restore.mjs "<this folder>" --files    also put the files back in storage
  node scripts/restore.mjs "<this folder>" --replace  make the database exactly like the backup
See README.md → "Backups".
`;

const stampNow = () => {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}-${p(d.getMinutes())}`;
};
const safe = (s) => String(s || 'file').replace(/[\\/:*?"<>|\u0000-\u001f]+/g, '_').replace(/\s+/g, ' ').trim().slice(0, 120) || 'file';
export const backupFileName = (f) => `${f.id}__${safe(f.name)}`;

async function getJson(url) {
  const r = await fetch(url, { cache: 'no-store' });
  const d = await r.json().catch(() => ({}));
  if (!r.ok || d.ok === false) throw new Error(d.error || `Request failed (${r.status})`);
  return d;
}

/** Every page of one collection, as JSON text of an array. */
async function exportCollection(name, onDocs) {
  const parts = [];
  let after = '';
  for (;;) {
    const d = await getJson(`/api/backup/data?c=${encodeURIComponent(name)}&limit=1000${after ? `&after=${encodeURIComponent(after)}` : ''}`);
    for (const doc of d.docs) parts.push(JSON.stringify(doc));
    onDocs(d.docs.length);
    if (!d.next) break;
    after = d.next;
  }
  return `[\n${parts.join(',\n')}\n]\n`;
}

/** The original bytes of one uploaded file. */
async function fetchFile(f) {
  const link = await getJson(`/api/backup/file?id=${f.id}`);
  try {
    const r = await fetch(link.url, { cache: 'no-store' });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return new Uint8Array(await r.arrayBuffer());
  } catch (e) {
    if (!link.fallback) throw e; // storage link blocked (CORS) and too big to come through the portal
    const r = await fetch(link.fallback, { cache: 'no-store' });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return new Uint8Array(await r.arrayBuffer());
  }
}

async function subDir(dir, path) {
  let d = dir;
  for (const part of path.split('/').filter(Boolean)) d = await d.getDirectoryHandle(part, { create: true });
  return d;
}
async function writeFile(dir, name, data) {
  const h = await dir.getFileHandle(name, { create: true });
  const w = await h.createWritable();
  await w.write(data);
  await w.close();
}
async function existingSize(dir, name) {
  try {
    const h = await dir.getFileHandle(name);
    return (await h.getFile()).size;
  } catch {
    return -1;
  }
}

/** Run up to n jobs at a time. */
async function pool(items, n, job) {
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(n, items.length) }, async () => {
      while (i < items.length) {
        const item = items[i++];
        await job(item);
      }
    })
  );
}

export default function BackupCard() {
  const [plan, setPlan] = useState(null);
  const [err, setErr] = useState('');
  const [run, setRun] = useState(null); // { phase, done, total, bytes, totalBytes, failed: [], skipped }
  const [result, setResult] = useState(null);
  const cancel = useRef(false);
  const canFolder = typeof window !== 'undefined' && 'showDirectoryPicker' in window;

  const load = () =>
    getJson('/api/backup')
      .then(setPlan)
      .catch((e) => setErr(e.message));
  useEffect(() => {
    load();
  }, []);

  async function start(mode) {
    setErr('');
    setResult(null);
    cancel.current = false;
    let dir = null;
    if (mode === 'folder') {
      try {
        dir = await window.showDirectoryPicker({ id: 'mihad-lms-backup', mode: 'readwrite', startIn: 'documents' });
      } catch {
        return; // picker closed
      }
    }
    const stamp = stampNow();
    const st = { phase: 'Reading the list…', done: 0, total: 0, bytes: 0, totalBytes: 0, failed: [], skipped: 0, saved: 0 };
    const tick = () => setRun({ ...st, failed: [...st.failed] });
    tick();
    try {
      const p = await getJson('/api/backup');
      setPlan(p);
      st.total = p.records;
      st.phase = 'Saving the database…';
      tick();

      // 1. database
      const dbFiles = {};
      for (const c of p.collections) {
        if (cancel.current) throw new Error('Backup cancelled');
        st.phase = `Saving the database — ${c.name}`;
        tick();
        dbFiles[`${c.name}.json`] = await exportCollection(c.name, (n) => {
          st.done += n;
          tick();
        });
      }
      const manifest = {
        portal: 'Al Mihad Learning Portal',
        database: p.database,
        exportedAt: p.at,
        folder: stamp,
        collections: p.collections,
        records: p.records,
        files: p.files.map((f) => ({ ...f, path: `files/${f.purpose}/${backupFileName(f)}` })),
      };
      dbFiles['manifest.json'] = JSON.stringify(manifest, null, 2);

      // 2. files
      const files = p.files;
      st.phase = 'Saving the files…';
      st.done = 0;
      st.total = files.length;
      st.totalBytes = p.fileBytes;
      tick();

      if (mode === 'folder') {
        const dbDir = await subDir(dir, `database/${stamp}`);
        for (const [name, text] of Object.entries(dbFiles)) await writeFile(dbDir, name, text);
        await writeFile(dir, 'README.txt', README);
        await pool(files, 3, async (f) => {
          if (cancel.current) return;
          try {
            const fd = await subDir(dir, `files/${f.purpose}`);
            const name = backupFileName(f);
            if ((await existingSize(fd, name)) === f.size && f.size > 0) {
              st.skipped += 1;
            } else {
              const bytes = await fetchFile(f);
              await writeFile(fd, name, bytes);
              st.saved += 1;
            }
          } catch (e) {
            st.failed.push({ name: f.name, why: e.message });
          }
          st.done += 1;
          st.bytes += f.size;
          tick();
        });
      } else {
        const { Zip, ZipDeflate, ZipPassThrough } = await import('fflate');
        const chunks = [];
        let finished;
        const done = new Promise((resolve, reject) => {
          finished = { resolve, reject };
        });
        const zip = new Zip((e, chunk, final) => {
          if (e) return finished.reject(e);
          chunks.push(chunk);
          if (final) finished.resolve();
        });
        const enc = new TextEncoder();
        const addText = (path, text) => {
          const z = new ZipDeflate(path, { level: 6 });
          zip.add(z);
          z.push(enc.encode(text), true);
        };
        addText('README.txt', README);
        for (const [name, text] of Object.entries(dbFiles)) addText(`database/${stamp}/${name}`, text);
        // one at a time keeps the zip entries in order
        for (const f of files) {
          if (cancel.current) break;
          try {
            const bytes = await fetchFile(f);
            const z = new ZipPassThrough(`files/${f.purpose}/${backupFileName(f)}`);
            zip.add(z);
            z.push(bytes, true);
            st.saved += 1;
          } catch (e) {
            st.failed.push({ name: f.name, why: e.message });
          }
          st.done += 1;
          st.bytes += f.size;
          tick();
        }
        zip.end();
        await done;
        const blob = new Blob(chunks, { type: 'application/zip' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `AlMihad-LMS-backup-${stamp}.zip`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(a.href), 60000);
      }
      if (cancel.current) throw new Error('Backup cancelled — what was saved so far is kept');

      await fetch('/api/backup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ records: p.records, files: st.saved, failed: st.failed.length, mode }),
      }).catch(() => {});
      setResult({ mode, stamp, records: p.records, collections: p.collections.length, saved: st.saved, skipped: st.skipped, failed: st.failed, folder: dir?.name });
      setRun(null);
      load();
    } catch (e) {
      setErr(e.message);
      setRun(null);
    }
  }

  const pct = run ? (run.phase.startsWith('Saving the files') ? (run.total ? Math.round((run.done / run.total) * 100) : 100) : run.total ? Math.round((run.done / run.total) * 100) : 0) : 0;

  return (
    <Card title="Backup" className="lg:col-span-2">
      <div className="space-y-4">
        <p className="text-sm text-slate-600">
          Save a complete copy of the portal on this computer — every student, trainer, parent, attendance, marks, fees, lesson plans, messages and logs, plus every uploaded file.
        </p>

        {plan && (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {[
              ['Records', plan.records.toLocaleString()],
              ['Collections', plan.collections.length],
              ['Files', plan.files.length.toLocaleString()],
              ['Files size', fmtSize(plan.fileBytes)],
            ].map(([l, v]) => (
              <div key={l} className="rounded-lg bg-slate-50 px-3 py-2">
                <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">{l}</p>
                <p className="text-lg font-bold text-maroon">{v}</p>
              </div>
            ))}
          </div>
        )}
        {plan && (
          <p className="text-xs text-slate-500">
            {plan.last ? (
              <>
                Last backup:{' '}
                <b>
                  {new Date(plan.last.at).toLocaleString('en-GB', { timeZone: 'Asia/Dubai', day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                </b>
                {plan.last.by ? ` by ${plan.last.by}` : ''}.
              </>
            ) : (
              <b className="text-amber-700">No backup has been taken yet.</b>
            )}{' '}
            We suggest once a week, and before any big change (new term, bulk upload).
          </p>
        )}

        {err && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{err}</p>}

        {run ? (
          <div className="rounded-lg border border-slate-200 p-4">
            <p className="text-sm font-semibold text-slate-700">{run.phase}</p>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-200">
              <div className="h-full rounded-full bg-gold transition-all" style={{ width: `${pct}%` }} />
            </div>
            <p className="mt-1.5 text-xs text-slate-500">
              {run.phase.startsWith('Saving the files')
                ? `${run.done} of ${run.total} files · ${fmtSize(run.bytes)} of ${fmtSize(run.totalBytes)}${run.skipped ? ` · ${run.skipped} already in the folder` : ''}${run.failed.length ? ` · ${run.failed.length} failed` : ''}`
                : `${run.done.toLocaleString()} of ${run.total.toLocaleString()} records`}
            </p>
            <p className="mt-1 text-[11px] text-slate-400">Keep this page open until it finishes.</p>
            <button
              type="button"
              className="btn-ghost btn-sm mt-2"
              onClick={() => {
                cancel.current = true;
              }}
            >
              Cancel
            </button>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            {canFolder && (
              <button className="btn-primary" onClick={() => start('folder')} disabled={!plan}>
                <Icon name="download" className="h-4 w-4" /> Back up now to a folder
              </button>
            )}
            <button className={canFolder ? 'btn-ghost' : 'btn-primary'} onClick={() => start('zip')} disabled={!plan}>
              <Icon name="download" className="h-4 w-4" /> {canFolder ? 'Download as one .zip' : 'Back up now (.zip)'}
            </button>
          </div>
        )}
        {!run && (
          <p className="text-[11px] text-slate-500">
            {canFolder
              ? 'Folder: choose (or create) a folder such as Documents › Al Mihad LMS Backups. Each backup adds a dated copy of the database and only downloads files that are new since last time.'
              : 'For a folder backup that only downloads new files each time, open this page in Chrome or Edge on a computer.'}{' '}
            Keep backups private — they contain student details.
          </p>
        )}

        {result && (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
            <p className="flex items-center gap-2 font-semibold">
              <Icon name="check" className="h-4 w-4" /> Backup complete
            </p>
            <ul className="mt-1.5 list-disc space-y-0.5 pl-5 text-xs">
              <li>
                {result.records.toLocaleString()} records from {result.collections} collections →{' '}
                {result.mode === 'folder' ? (
                  <code>
                    {result.folder}/database/{result.stamp}
                  </code>
                ) : (
                  <code>AlMihad-LMS-backup-{result.stamp}.zip</code>
                )}
              </li>
              <li>
                {result.saved} file{result.saved === 1 ? '' : 's'} downloaded
                {result.skipped ? `, ${result.skipped} already in the folder` : ''}
              </li>
            </ul>
            {result.failed.length > 0 && (
              <div className="mt-2 rounded bg-white/70 p-2 text-xs text-red-700">
                <p className="font-semibold">{result.failed.length} file(s) could not be saved — run the backup again; already-saved files are skipped:</p>
                <ul className="mt-1 list-disc pl-5">
                  {result.failed.slice(0, 10).map((f, i) => (
                    <li key={i}>
                      {f.name} — {f.why}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>
    </Card>
  );
}
