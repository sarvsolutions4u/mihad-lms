'use client';

import { useEffect, useState } from 'react';
import Icon from './Icon';
import { normalizeUrl, meetingApp, embedFor } from '@/lib/links';
import { ACCEPT, MAX_FILE_MB, isStoredFile, downloadUrl, fmtSize } from '@/lib/fileTypes';

/* ---------------------------------------------------------------- */
/* Brand mark — the official Mihad Training logo.                    */
/*   /public/logo.png        full colour, for light backgrounds       */
/*   /public/logo-white.png  reversed, for the maroon sidebar/panels  */
/* ---------------------------------------------------------------- */

export function Logo({ light = true, className = 'h-12 w-auto' }) {
  return (
    /* eslint-disable-next-line @next/next/no-img-element */
    <img
      src={light ? '/logo-white.png' : '/logo.png'}
      alt="Mihad Training — Learn Lead Succeed"
      className={className}
    />
  );
}

/* ---------------------------------------------------------------- */

export function PageHeader({ title, subtitle, children }) {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-maroon">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-slate-500">{subtitle}</p>}
      </div>
      {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
    </div>
  );
}

export function Card({ title, action, children, className = '', bodyClass = 'card-pad' }) {
  return (
    <section className={`card ${className}`}>
      {(title || action) && (
        <header className="flex items-center justify-between gap-3 border-b border-slate-200/80 px-5 py-3.5">
          <h2 className="text-sm font-bold uppercase tracking-wide text-maroon">{title}</h2>
          {action}
        </header>
      )}
      <div className={bodyClass}>{children}</div>
    </section>
  );
}

export function Stat({ label, value, hint }) {
  return (
    <div className="card card-pad">
      <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">{label}</p>
      <p className="mt-2 text-2xl font-bold text-maroon">{value}</p>
      {hint && <p className="mt-1 text-xs text-slate-400">{hint}</p>}
    </div>
  );
}

export function Field({ label, children, hint, className = '' }) {
  return (
    <label className={`block ${className}`}>
      <span className="label">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-slate-400">{hint}</span>}
    </label>
  );
}

export function Select({ options = [], placeholder = 'Select…', ...props }) {
  return (
    <select className="input" {...props}>
      <option value="">{placeholder}</option>
      {options.map((o) => (
        <option key={o.value ?? o} value={o.value ?? o}>
          {o.label ?? o}
        </option>
      ))}
    </select>
  );
}

export function Badge({ tone = 'slate', children }) {
  const tones = {
    slate: 'bg-slate-100 text-slate-700',
    green: 'bg-emerald-100 text-emerald-800',
    red: 'bg-red-100 text-red-700',
    amber: 'bg-amber-100 text-amber-800',
    maroon: 'bg-maroon-50 text-maroon',
    gold: 'bg-gold-50 text-gold-600',
  };
  return <span className={`chip ${tones[tone] || tones.slate}`}>{children}</span>;
}

export function Empty({ title = 'Nothing here yet', hint }) {
  return (
    <div className="py-12 text-center">
      <p className="text-sm font-semibold text-slate-600">{title}</p>
      {hint && <p className="mx-auto mt-1 max-w-sm text-xs text-slate-400">{hint}</p>}
    </div>
  );
}

export function Spinner({ label = 'Loading…' }) {
  return (
    <div className="flex items-center justify-center gap-3 py-12 text-sm text-slate-500">
      <span className="h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-t-maroon" />
      {label}
    </div>
  );
}

export function Alert({ tone = 'error', children, onClose }) {
  if (!children) return null;
  const tones = {
    error: 'border-red-200 bg-red-50 text-red-800',
    success: 'border-emerald-200 bg-emerald-50 text-emerald-800',
    info: 'border-sky-200 bg-sky-50 text-sky-800',
  };
  return (
    <div className={`mb-4 flex items-start justify-between gap-3 rounded-lg border px-4 py-3 text-sm ${tones[tone]}`}>
      <span>{children}</span>
      {onClose && (
        <button onClick={onClose} className="shrink-0 font-bold opacity-60 hover:opacity-100">
          ×
        </button>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------- */

export function Table({ columns, rows, empty, rowKey = (r) => r._id }) {
  if (!rows?.length) return empty || <Empty />;
  return (
    <div className="-mx-5 overflow-x-auto px-5">
      <table className="w-full min-w-[640px] border-collapse">
        <thead>
          <tr className="border-b border-slate-200">
            {columns.map((c) => (
              <th key={c.key} className={`th ${c.align === 'right' ? 'text-right' : ''}`}>
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((row) => (
            <tr key={rowKey(row)} className="hover:bg-slate-50/70">
              {columns.map((c) => (
                <td key={c.key} className={`td ${c.align === 'right' ? 'text-right' : ''}`}>
                  {c.render ? c.render(row) : row[c.key] ?? '—'}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function Modal({ open, onClose, title, children, footer, wide = false }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === 'Escape' && onClose?.();
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-maroon-950/50 p-4 backdrop-blur-sm">
      <div
        className={`my-8 w-full ${wide ? 'max-w-3xl' : 'max-w-lg'} rounded-xl bg-white shadow-2xl`}
        role="dialog"
        aria-modal="true"
      >
        <header className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <h3 className="text-base font-bold text-maroon">{title}</h3>
          <button
            onClick={onClose}
            className="grid h-8 w-8 place-items-center rounded-lg text-xl text-slate-400 hover:bg-slate-100 hover:text-slate-700"
            aria-label="Close"
          >
            ×
          </button>
        </header>
        <div className="max-h-[70vh] overflow-y-auto px-5 py-5">{children}</div>
        {footer && (
          <footer className="flex justify-end gap-2 border-t border-slate-200 px-5 py-4">{footer}</footer>
        )}
      </div>
    </div>
  );
}

export function Confirm({ open, onClose, onConfirm, message = 'Delete this record?' }) {
  const [busy, setBusy] = useState(false);
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Please confirm"
      footer={
        <>
          <button className="btn-ghost" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button
            className="btn-danger"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await onConfirm();
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy ? 'Deleting…' : 'Delete'}
          </button>
        </>
      }
    >
      <p className="text-sm text-slate-600">{message}</p>
    </Modal>
  );
}

/* ---- uploads ------------------------------------------------------- */

let limitPromise;
/** { mode: 'r2' | 'direct', maxMB } — fetched once per page load. */
export function getUploadLimit() {
  if (!limitPromise) {
    limitPromise = fetch('/api/upload/sign')
      .then((r) => r.json())
      .then((d) => (d?.ok ? { mode: d.mode, maxMB: d.maxMB } : { mode: 'direct', maxMB: MAX_FILE_MB }))
      .catch(() => ({ mode: 'direct', maxMB: MAX_FILE_MB }));
  }
  return limitPromise;
}

export function useUploadLimit() {
  const [limit, setLimit] = useState({ mode: 'direct', maxMB: MAX_FILE_MB });
  useEffect(() => {
    let alive = true;
    getUploadLimit().then((l) => alive && setLimit(l));
    return () => {
      alive = false;
    };
  }, []);
  return limit;
}

async function readJson(res) {
  try {
    return await res.json();
  } catch {
    return null;
  }
}

function putWithProgress(url, file, contentType, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', url);
    xhr.setRequestHeader('Content-Type', contentType);
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress?.(Math.round((e.loaded / e.total) * 100));
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`Upload failed (${xhr.status})`)));
    xhr.onerror = () => reject(new Error('Upload failed — check your connection and try again'));
    xhr.send(file);
  });
}

/**
 * Upload one file. Goes straight to Cloudflare R2 when it is set up (large
 * files are fine), otherwise into the database (4 MB limit).
 * Returns { url, fileName, size }.
 */
export async function uploadFile(file, { purpose, student, onProgress } = {}) {
  if (!file) throw new Error('Choose a file first');

  const signRes = await fetch('/api/upload/sign', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fileName: file.name, size: file.size, purpose, student }),
  });
  const sign = await readJson(signRes);
  if (!signRes.ok || !sign || sign.ok === false) throw new Error(sign?.error || 'Upload failed');

  if (sign.mode === 'r2') {
    await putWithProgress(sign.uploadUrl, file, sign.contentType, onProgress);
    const doneRes = await fetch('/api/upload/complete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: sign.id }),
    });
    const done = await readJson(doneRes);
    if (!doneRes.ok || !done || done.ok === false) throw new Error(done?.error || 'Upload could not be confirmed');
    onProgress?.(100);
    return done;
  }

  // database storage
  if (file.size > sign.maxMB * 1024 * 1024) {
    throw new Error(`"${file.name}" is larger than ${sign.maxMB} MB. Compress it, or paste a Google Drive / YouTube link instead.`);
  }
  const fd = new FormData();
  fd.append('file', file);
  if (purpose) fd.append('purpose', purpose);
  if (student) fd.append('student', student);
  const res = await fetch('/api/upload', { method: 'POST', body: fd });
  const data = await readJson(res);
  if (!res.ok || !data || data.ok === false) {
    throw new Error(data?.error || (res.status === 413 ? `File is larger than ${sign.maxMB} MB` : 'Upload failed'));
  }
  onProgress?.(100);
  return data;
}

/** A file field that accepts EITHER an upload or a pasted link. */
export function FileOrLink({ value, onChange, name = 'Attachment', fileName = '', purpose, student, hint }) {
  const [busy, setBusy] = useState(false);
  const [pct, setPct] = useState(0);
  const [err, setErr] = useState('');
  const [stamp, setStamp] = useState('');
  const limit = useUploadLimit();
  const inputId = `f-${name.replace(/\W+/g, '-').toLowerCase()}`;

  async function upload(file) {
    if (!file) return;
    setBusy(true);
    setPct(0);
    setErr('');
    try {
      const data = await uploadFile(file, { purpose, student, onProgress: setPct });
      setStamp(data.watermark || '');
      onChange(data.url, data.fileName, data.size);
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  const stored = isStoredFile(value);

  return (
    <div>
      <span className="label">{name}</span>
      {stored ? (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2">
          <span className="text-xs font-semibold text-emerald-800">Uploaded:</span>
          <FileLink url={value} name={fileName || 'file'} compact />
          <button type="button" className="ml-auto text-xs font-semibold text-red-700 hover:underline" onClick={() => onChange('', '')}>
            Remove
          </button>
        </div>
      ) : (
        <input
          className="input"
          placeholder="Paste a link (Google Drive, OneDrive, YouTube…) — or upload a file below"
          value={value || ''}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
      <div className="mt-2 flex items-center gap-3">
        <input
          id={inputId}
          type="file"
          accept={ACCEPT}
          onChange={(e) => {
            upload(e.target.files?.[0]);
            e.target.value = '';
          }}
          disabled={busy}
          className="block w-full text-xs text-slate-500 file:mr-3 file:rounded-md file:border-0
                     file:bg-maroon-50 file:px-3 file:py-1.5 file:text-xs file:font-semibold
                     file:text-maroon hover:file:bg-maroon-100"
        />
        {busy && <span className="shrink-0 text-xs font-semibold text-maroon">Uploading… {pct ? `${pct}%` : ''}</span>}
      </div>
      {busy && pct > 0 && (
        <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-slate-200">
          <div className="h-full rounded-full bg-gold transition-all" style={{ width: `${pct}%` }} />
        </div>
      )}
      <p className="mt-1 text-[11px] text-slate-400">{hint || `PDF, Word, Excel, PowerPoint, images, audio or MP4 — up to ${limit.maxMB} MB.`}</p>
      <WatermarkNote status={stamp} />
      {err && <p className="mt-1 text-xs font-medium text-red-700">{err}</p>}
    </div>
  );
}

/** A list of files (multi-attach) — e.g. lesson plan documents, fee invoices. */
export function FileList({ value = [], onChange, name = 'Files', purpose, student }) {
  const [busy, setBusy] = useState(false);
  const [pct, setPct] = useState(0);
  const [err, setErr] = useState('');
  const [stamp, setStamp] = useState('');
  const limit = useUploadLimit();
  const [link, setLink] = useState('');

  async function add(files) {
    setBusy(true);
    setErr('');
    try {
      const added = [];
      for (const f of Array.from(files || [])) {
        setPct(0);
        const d = await uploadFile(f, { purpose, student, onProgress: setPct });
        if (d.watermark) setStamp(d.watermark);
        added.push({ url: d.url, name: d.fileName, size: d.size });
      }
      onChange([...(value || []), ...added]);
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <span className="label">{name}</span>
      {!!value?.length && (
        <ul className="mb-2 space-y-1.5">
          {value.map((f, i) => (
            <li key={`${f.url}-${i}`} className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-1.5">
              <FileLink url={f.url} name={f.name} size={f.size} compact />
              <button
                type="button"
                className="ml-auto text-xs font-semibold text-red-700 hover:underline"
                onClick={() => onChange(value.filter((_, j) => j !== i))}
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}
      <input
        type="file"
        multiple
        accept={ACCEPT}
        disabled={busy}
        onChange={(e) => {
          add(e.target.files);
          e.target.value = '';
        }}
        className="block w-full text-xs text-slate-500 file:mr-3 file:rounded-md file:border-0
                   file:bg-maroon-50 file:px-3 file:py-1.5 file:text-xs file:font-semibold
                   file:text-maroon hover:file:bg-maroon-100"
      />
      <div className="mt-2 flex gap-2">
        <input className="input py-1.5 text-xs" placeholder="…or paste a link" value={link} onChange={(e) => setLink(e.target.value)} />
        <button
          type="button"
          className="btn-ghost btn-sm"
          disabled={!link.trim()}
          onClick={() => {
            onChange([...(value || []), { url: link.trim(), name: link.trim().replace(/^https?:\/\//, '').slice(0, 60) }]);
            setLink('');
          }}
        >
          Add link
        </button>
      </div>
      <p className="mt-1 text-[11px] text-slate-400">
        {busy ? `Uploading… ${pct ? `${pct}%` : ''}` : `You can pick several files at once — up to ${limit.maxMB} MB each. For recorded videos, paste the Google Drive link.`}
      </p>
      <WatermarkNote status={stamp} />
      {err && <p className="mt-1 text-xs font-medium text-red-700">{err}</p>}
    </div>
  );
}

/**
 * Plays a Google Drive / YouTube link inside the LMS.
 * Drive's own "open in new window" button (top-right of its player) is covered,
 * so students watch here rather than in Google Drive.
 */
export function MediaViewer({ url, title, onClose, video = false }) {
  useEffect(() => {
    const onKey = (ev) => ev.key === 'Escape' && onClose?.();
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [onClose]);

  const e = embedFor(url);
  if (!e) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-3 sm:p-6" role="dialog" aria-modal="true" onClick={onClose}>
      <div className="w-full max-w-5xl" onClick={(ev) => ev.stopPropagation()}>
        <div className="mb-2 flex items-center justify-between gap-3 text-white">
          <p className="truncate text-sm font-semibold">{title}</p>
          <button onClick={onClose} className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-2xl hover:bg-white/10" aria-label="Close">
            ×
          </button>
        </div>
        <div
          className={`relative w-full overflow-hidden rounded-xl bg-black ${video || e.kind === 'youtube' ? 'aspect-video' : 'h-[80vh]'}`}
          onContextMenu={(ev) => ev.preventDefault()}
        >
          <iframe
            src={e.embed}
            title={title || 'Viewer'}
            className="absolute inset-0 h-full w-full"
            allow="autoplay; encrypted-media; fullscreen; picture-in-picture"
            allowFullScreen
            referrerPolicy="strict-origin-when-cross-origin"
          />
          {e.kind === 'drive' && (
            // covers Drive's "open in new window" button
            <div className="absolute right-0 top-0 h-14 w-16 cursor-default bg-transparent" aria-hidden onContextMenu={(ev) => ev.preventDefault()} />
          )}
        </div>
        <p className="mt-2 text-center text-[11px] text-white/50">Al Mihad Training — for enrolled students only. Please do not share or record.</p>
      </div>
    </div>
  );
}

/** Open / Download for a stored file, or a Watch/View button for Drive & YouTube links. */
export function FileLink({ url, name, size, compact = false, video = false }) {
  const [viewing, setViewing] = useState(false);
  if (!url) return null;
  const href = normalizeUrl(url);
  const stored = isStoredFile(href);
  const embed = !stored && embedFor(href);
  const isVideo = video || embed?.kind === 'youtube';
  const label =
    name || (stored ? 'File' : embed ? (isVideo ? 'Recorded video' : 'Google Drive file') : href.replace(/^https?:\/\//, '').slice(0, 40));

  if (embed) {
    return (
      <>
        <button
          type="button"
          onClick={() => setViewing(true)}
          className={`inline-flex min-w-0 items-center gap-1.5 text-xs font-semibold text-maroon hover:underline ${
            compact ? '' : 'rounded-lg border border-slate-200 bg-white px-2.5 py-1.5'
          }`}
          title={isVideo ? 'Watch inside the LMS' : 'View inside the LMS'}
        >
          <Icon name={isVideo ? 'play' : 'file'} className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">{isVideo ? `Watch: ${label}` : label}</span>
        </button>
        {viewing && <MediaViewer url={href} title={label} video={isVideo} onClose={() => setViewing(false)} />}
      </>
    );
  }

  return (
    <span className={`inline-flex min-w-0 items-center gap-1.5 ${compact ? '' : 'rounded-lg border border-slate-200 bg-white px-2.5 py-1.5'}`}>
      <Icon name={stored ? 'file' : 'link'} className="h-3.5 w-3.5 shrink-0 text-maroon" />
      <a href={href} target="_blank" rel="noreferrer" className="truncate text-xs font-semibold text-maroon hover:underline" title={label}>
        {label}
      </a>
      {size ? <span className="shrink-0 text-[10px] text-slate-400">{fmtSize(size)}</span> : null}
      {stored && (
        <a href={downloadUrl(href)} className="shrink-0 rounded p-0.5 text-slate-500 hover:bg-slate-100 hover:text-maroon" title="Download" aria-label={`Download ${label}`}>
          <Icon name="download" className="h-3.5 w-3.5" />
        </a>
      )}
    </span>
  );
}

function WatermarkNote({ status }) {
  if (status === 'done')
    return <p className="mt-1 text-[11px] font-medium text-emerald-700">✓ PDF watermarked with Al Mihad and your name. Each student’s copy also carries their own name.</p>;
  if (status === 'protected')
    return <p className="mt-1 text-[11px] font-medium text-amber-700">This PDF is password-protected, so it could not be watermarked. Upload an unprotected copy to add the watermark.</p>;
  if (status === 'unreadable' || status === 'failed')
    return <p className="mt-1 text-[11px] font-medium text-amber-700">The watermark could not be added to this PDF. It was uploaded as it is.</p>;
  return null;
}

/** Opens the online class (Zoom / Meet / Teams) in a new tab — the app takes over from there. */
export function JoinButton({ url, size = 'sm', label }) {
  const href = normalizeUrl(url);
  if (!href) return null;
  const app = meetingApp(href);
  return (
    <a href={href} target="_blank" rel="noreferrer" className={`btn-gold ${size === 'sm' ? 'btn-sm' : ''}`}>
      <Icon name="video" className="h-3.5 w-3.5" />
      {label || (app ? `Join on ${app}` : 'Join class')}
    </a>
  );
}

/** Small tab bar used on detail pages. */
export function Tabs({ tabs, value, onChange }) {
  return (
    <div className="mb-5 flex gap-1 overflow-x-auto border-b border-slate-200">
      {tabs.map((t) => (
        <button
          key={t.key}
          type="button"
          onClick={() => onChange(t.key)}
          className={`-mb-px whitespace-nowrap border-b-2 px-3.5 py-2.5 text-sm font-semibold transition-colors ${
            value === t.key ? 'border-maroon text-maroon' : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          {t.label}
          {t.count !== undefined && t.count !== null && (
            <span className={`ml-1.5 rounded-full px-1.5 py-0.5 text-[10px] ${value === t.key ? 'bg-maroon text-white' : 'bg-slate-100 text-slate-500'}`}>
              {t.count}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}
