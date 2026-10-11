'use client';

import { useEffect, useState } from 'react';

/* ---------------------------------------------------------------- */
/* Brand mark — drop your own /public/logo.png in and it is used     */
/* automatically; otherwise this clean wordmark is shown.            */
/* ---------------------------------------------------------------- */

/* Arch mark — echoes the arched form in the Al Mihad logo. */
export function ArchMark({ className = 'h-9 w-8', tone = 'gold' }) {
  const fill = tone === 'gold' ? '#C9A227' : '#7A1418';
  const line = tone === 'gold' ? '#7A1418' : '#C9A227';
  return (
    <svg viewBox="0 0 36 42" className={className} aria-hidden>
      <path d="M2 42V19C2 10 9.5 4 18 0c8.5 4 16 10 16 19v23z" fill={fill} />
      <path d="M10.5 42V21.5c0-5 3.2-8.6 7.5-10.8 4.3 2.2 7.5 5.8 7.5 10.8V42" fill="none" stroke={line} strokeWidth="2.6" />
      <path d="M18 17.5v24.5" stroke={line} strokeWidth="2" />
    </svg>
  );
}

export function Logo({ compact = false, light = true }) {
  // Probe for /public/logo.png on the client. Starting with the wordmark means
  // no broken-image flash, and an <img> that fails before hydration (where
  // onError never fires) cannot leave a broken icon on screen.
  const [hasLogo, setHasLogo] = useState(false);

  useEffect(() => {
    const img = new window.Image();
    img.onload = () => setHasLogo(true);
    img.onerror = () => setHasLogo(false);
    img.src = '/logo.png';
  }, []);

  if (hasLogo) {
    return (
      /* eslint-disable-next-line @next/next/no-img-element */
      <img src="/logo.png" alt="Al Mihad Training Centre" className={compact ? 'h-8 w-auto' : 'h-11 w-auto'} />
    );
  }

  return (
    <div className="flex items-center gap-2.5">
      <ArchMark className={compact ? 'h-9 w-8' : 'h-11 w-10'} />
      {!compact && (
        <span className="leading-tight">
          <span className={`block text-[15px] font-extrabold tracking-[0.08em] ${light ? 'text-white' : 'text-maroon'}`}>
            AL MIHAD
          </span>
          <span className={`block text-[10px] font-semibold uppercase tracking-[0.2em] ${light ? 'text-gold' : 'text-gold-600'}`}>
            Training Centre
          </span>
        </span>
      )}
    </div>
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

/** A file field that accepts EITHER an upload or a pasted link. */
export function FileOrLink({ value, onChange, name = 'Attachment' }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  async function upload(file) {
    if (!file) return;
    setBusy(true);
    setErr('');
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch('/api/upload', { method: 'POST', body: fd });
      const data = await res.json();
      if (!res.ok || data.ok === false) throw new Error(data.error || 'Upload failed');
      onChange(data.url, data.fileName);
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <span className="label">{name}</span>
      <input
        className="input"
        placeholder="Paste a link (Google Drive, OneDrive, YouTube…)"
        value={value || ''}
        onChange={(e) => onChange(e.target.value)}
      />
      <div className="mt-2 flex items-center gap-3">
        <input
          type="file"
          onChange={(e) => upload(e.target.files?.[0])}
          disabled={busy}
          className="block w-full text-xs text-slate-500 file:mr-3 file:rounded-md file:border-0
                     file:bg-maroon-50 file:px-3 file:py-1.5 file:text-xs file:font-semibold
                     file:text-maroon hover:file:bg-maroon-100"
        />
        {busy && <span className="text-xs text-slate-500">Uploading…</span>}
      </div>
      {err && <p className="mt-1 text-xs text-amber-700">{err}</p>}
    </div>
  );
}
