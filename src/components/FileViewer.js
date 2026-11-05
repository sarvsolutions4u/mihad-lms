'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Icon from './Icon';
import { fmtSize } from '@/lib/fileTypes';

/**
 * Shows a stored file inside the portal: PDFs page by page (pdf.js), videos,
 * audio and pictures. Course material for students and parents is view-only —
 * no download or print button, right-click and Ctrl+S / Ctrl+P are blocked,
 * and every PDF page carries the student's name (stamped on the server).
 */

const PDFJS = '/pdfjs/pdf.min.mjs';
let pdfjsPromise;
function loadPdfJs() {
  if (!pdfjsPromise) {
    pdfjsPromise = import(/* webpackIgnore: true */ /* turbopackIgnore: true */ PDFJS).then((lib) => {
      lib.GlobalWorkerOptions.workerSrc = '/pdfjs/pdf.worker.min.mjs';
      return lib;
    });
    pdfjsPromise.catch(() => {
      pdfjsPromise = null;
    });
  }
  return pdfjsPromise;
}

const idFrom = (url) => (String(url || '').match(/\/api\/files\/([a-f0-9]{32})/) || [])[1];

/** Blocks the usual "save / print" shortcuts and right-click while a view-only file is open. */
function useViewOnlyGuards(active) {
  useEffect(() => {
    if (!active) return;
    const onKey = (e) => {
      const k = e.key?.toLowerCase();
      if ((e.ctrlKey || e.metaKey) && (k === 's' || k === 'p')) {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    window.addEventListener('keydown', onKey, true);
    const style = document.createElement('style');
    style.textContent = '@media print { body { display: none !important; } }';
    document.head.appendChild(style);
    return () => {
      window.removeEventListener('keydown', onKey, true);
      style.remove();
    };
  }, [active]);
}

/** One PDF page; draws itself when scrolled near, clears itself when far away. */
function PdfPage({ doc, number, width, ratio: initialRatio, onVisible, root }) {
  const holder = useRef(null);
  const [ratio, setRatio] = useState(initialRatio);
  const canvas = useRef(null);
  const [near, setNear] = useState(number <= 2);
  const task = useRef(null);

  useEffect(() => {
    const el = holder.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([e]) => {
        setNear(e.isIntersecting);
      },
      { root, rootMargin: '150% 0px' }
    );
    const seen = new IntersectionObserver(([e]) => e.isIntersecting && onVisible(number), { root, threshold: 0.3 });
    io.observe(el);
    seen.observe(el);
    return () => {
      io.disconnect();
      seen.disconnect();
    };
  }, [number, onVisible, root]);

  useEffect(() => {
    let cancelled = false;
    const c = canvas.current;
    if (!c) return;
    if (!near || !width) {
      c.width = 0;
      c.height = 0;
      return;
    }
    (async () => {
      const page = await doc.getPage(number);
      if (cancelled) return;
      const base = page.getViewport({ scale: 1 });
      setRatio(base.height / base.width);
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const viewport = page.getViewport({ scale: (width / base.width) * dpr });
      c.width = Math.floor(viewport.width);
      c.height = Math.floor(viewport.height);
      task.current?.cancel?.();
      task.current = page.render({ canvasContext: c.getContext('2d'), viewport });
      try {
        await task.current.promise;
      } catch {
        /* cancelled while scrolling */
      }
    })();
    return () => {
      cancelled = true;
      task.current?.cancel?.();
    };
  }, [doc, number, near, width]);

  return (
    <div ref={holder} className="relative mx-auto bg-white shadow-md" style={{ width, height: width * ratio }}>
      <canvas ref={canvas} className="block h-full w-full" />
      {!near && <span className="absolute inset-0 grid place-items-center text-xs text-slate-300">Page {number}</span>}
    </div>
  );
}

function PdfView({ info, viewOnly, onPage }) {
  const box = useRef(null);
  const [doc, setDoc] = useState(null);
  const [ratios, setRatios] = useState([]);
  const [err, setErr] = useState('');
  const [boxWidth, setBoxWidth] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [page, setPage] = useState(1);

  useEffect(() => {
    let alive = true;
    let loaded;
    (async () => {
      try {
        const lib = await loadPdfJs();
        const open = (url) =>
          lib.getDocument({
            url,
            disableRange: true,
            disableStream: true,
            disableAutoFetch: true,
            isEvalSupported: false,
            cMapUrl: '/pdfjs/cmaps/',
            cMapPacked: true,
            standardFontDataUrl: '/pdfjs/standard_fonts/',
            withCredentials: url.startsWith('/'),
          }).promise;
        try {
          loaded = await open(info.url);
        } catch (e) {
          if (!info.fallbackUrl || e?.name === 'PasswordException') throw e;
          loaded = await open(info.fallbackUrl); // e.g. storage link blocked by the browser
        }
        // every page starts with page 1's shape; each corrects itself when drawn
        const first = (await loaded.getPage(1)).getViewport({ scale: 1 });
        if (!alive) return;
        setRatios(Array(loaded.numPages).fill(first.height / first.width));
        setDoc(loaded);
      } catch (e) {
        if (!alive) return;
        setErr(
          e?.name === 'PasswordException'
            ? 'This PDF is password-protected, so it cannot be shown here. Please ask your trainer for an unprotected copy.'
            : 'This PDF could not be opened. Please check your connection and try again.'
        );
      }
    })();
    return () => {
      alive = false;
      loaded?.destroy?.();
    };
  }, [info.url, info.fallbackUrl]);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setBoxWidth(el.clientWidth));
    ro.observe(el);
    setBoxWidth(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  const onVisible = useCallback(
    (n) => {
      setPage(n);
      onPage?.(n);
    },
    [onPage]
  );

  const fit = Math.max(240, Math.min(boxWidth - 24, 900));
  const width = Math.round(fit * zoom);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center justify-center gap-2 border-b border-white/10 bg-slate-900 px-3 py-1.5 text-xs text-white/80">
        <button type="button" className="grid h-7 w-7 place-items-center rounded hover:bg-white/10" onClick={() => setZoom((z) => Math.max(0.5, +(z - 0.25).toFixed(2)))} aria-label="Zoom out">
          −
        </button>
        <span className="w-12 text-center">{Math.round(zoom * 100)}%</span>
        <button type="button" className="grid h-7 w-7 place-items-center rounded hover:bg-white/10" onClick={() => setZoom((z) => Math.min(3, +(z + 0.25).toFixed(2)))} aria-label="Zoom in">
          +
        </button>
        <button type="button" className="rounded px-2 py-1 hover:bg-white/10" onClick={() => setZoom(1)}>
          Fit width
        </button>
        {doc && (
          <span className="ml-2 text-white/60">
            Page {page} of {doc.numPages}
          </span>
        )}
      </div>
      <div
        ref={box}
        className={`min-h-0 flex-1 overflow-auto bg-slate-700 py-3 ${viewOnly ? 'select-none' : ''}`}
        onContextMenu={viewOnly ? (e) => e.preventDefault() : undefined}
        onDragStart={viewOnly ? (e) => e.preventDefault() : undefined}
      >
        {err ? (
          <p className="mx-auto mt-10 max-w-sm rounded-lg bg-white p-4 text-center text-sm text-slate-700">{err}</p>
        ) : !doc ? (
          <p className="mt-16 text-center text-sm text-white/70">Opening…</p>
        ) : (
          <div className="flex flex-col items-center gap-3" style={{ minWidth: width + 24 }}>
            {ratios.map((r, i) => (
              <PdfPage key={i} doc={doc} number={i + 1} width={width} ratio={r} onVisible={onVisible} root={box.current} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function MediaView({ info, viewOnly }) {
  const [src, setSrc] = useState(info.url);
  const block = viewOnly ? { onContextMenu: (e) => e.preventDefault() } : {};
  const fallback = () => info.fallbackUrl && src !== info.fallbackUrl && setSrc(info.fallbackUrl);
  if (info.kind === 'image')
    return (
      <div className="grid h-full place-items-center overflow-auto bg-slate-800 p-3" {...block}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt={info.name} onError={fallback} draggable={!viewOnly} className="max-h-full max-w-full object-contain" />
      </div>
    );
  if (info.kind === 'audio')
    return (
      <div className="grid h-full place-items-center bg-slate-800 p-6" {...block}>
        <audio src={src} controls autoPlay onError={fallback} controlsList={viewOnly ? 'nodownload' : undefined} className="w-full max-w-lg" />
      </div>
    );
  return (
    <div className="grid h-full place-items-center bg-black" {...block}>
      <video
        src={src}
        controls
        autoPlay
        playsInline
        onError={fallback}
        controlsList={viewOnly ? 'nodownload noremoteplayback' : undefined}
        disablePictureInPicture={viewOnly}
        className="max-h-full w-full"
      />
    </div>
  );
}

/** A Word file, converted to a page on the server, in a sandboxed frame (no scripts). */
function DocView({ info, viewOnly }) {
  const [html, setHtml] = useState(null);
  const [err, setErr] = useState('');
  useEffect(() => {
    let alive = true;
    fetch(info.url, { cache: 'no-store' })
      .then(async (r) => {
        if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || 'This document could not be opened');
        const t = await r.text();
        if (alive) setHtml(t);
      })
      .catch((e) => alive && setErr(e.message));
    return () => {
      alive = false;
    };
  }, [info.url]);
  if (err)
    return (
      <div className="mx-auto mt-10 max-w-sm rounded-lg bg-white p-4 text-center text-sm text-slate-700">
        <p>{err}</p>
        {info.downloadUrl && (
          <a href={info.downloadUrl} className="btn-primary mt-3 inline-flex">
            <Icon name="download" className="h-4 w-4" /> Download instead
          </a>
        )}
      </div>
    );
  if (html === null) return <p className="mt-16 text-center text-sm text-white/70">Opening…</p>;
  return (
    <div className="h-full bg-slate-700 p-0 sm:p-3" onContextMenu={viewOnly ? (e) => e.preventDefault() : undefined}>
      <iframe title={info.name} srcDoc={html} sandbox="allow-popups allow-popups-to-escape-sandbox" className="mx-auto block h-full w-full max-w-4xl rounded bg-white" />
    </div>
  );
}

/** The whole viewer: header (name, download if allowed, close) + the file. */
export function FileView({ url, name, onClose, fullPage = false }) {
  const id = idFrom(url);
  const [info, setInfo] = useState(null);
  const [err, setErr] = useState('');

  useEffect(() => {
    let alive = true;
    setInfo(null);
    setErr('');
    fetch(`/api/files/${id}?view=1`, { cache: 'no-store' })
      .then(async (r) => {
        const j = await r.json().catch(() => ({}));
        if (!r.ok || !j.ok) throw new Error(j.error || 'This file could not be opened');
        if (alive) setInfo(j);
      })
      .catch((e) => alive && setErr(e.message));
    return () => {
      alive = false;
    };
  }, [id]);

  const viewOnly = info ? !info.canDownload : false;
  useViewOnlyGuards(viewOnly);

  return (
    <div className={`flex flex-col overflow-hidden bg-slate-900 ${fullPage ? 'h-[calc(100dvh-7rem)] rounded-xl' : 'h-full rounded-xl'}`}>
      <div className="flex items-center gap-3 px-4 py-2.5 text-white">
        <Icon name="file" className="h-4 w-4 shrink-0 text-gold" />
        <p className="min-w-0 flex-1 truncate text-sm font-semibold">{info?.name || name || 'File'}</p>
        {info?.size ? <span className="hidden text-[11px] text-white/50 sm:inline">{fmtSize(info.size)}</span> : null}
        {info?.canDownload && info.downloadUrl && (
          <a href={info.downloadUrl} className="inline-flex items-center gap-1 rounded-lg bg-white/10 px-2.5 py-1.5 text-xs font-semibold hover:bg-white/20">
            <Icon name="download" className="h-3.5 w-3.5" /> Download
          </a>
        )}
        {onClose && (
          <button onClick={onClose} className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-2xl leading-none hover:bg-white/10" aria-label="Close">
            ×
          </button>
        )}
      </div>
      <div className="min-h-0 flex-1">
        {err ? (
          <p className="mx-auto mt-10 max-w-sm rounded-lg bg-white p-4 text-center text-sm text-slate-700">{err}</p>
        ) : !info ? (
          <p className="mt-16 text-center text-sm text-white/70">Opening…</p>
        ) : info.kind === 'pdf' ? (
          <PdfView info={info} viewOnly={viewOnly} />
        ) : info.kind === 'doc' ? (
          <DocView info={info} viewOnly={viewOnly} />
        ) : info.kind === 'other' ? (
          <div className="mx-auto mt-10 max-w-sm rounded-lg bg-white p-5 text-center text-sm text-slate-700">
            <p className="font-semibold">This type of file can’t be shown inside the portal.</p>
            <p className="mt-1 text-xs text-slate-500">PDFs, Word (.docx) files, videos and pictures open here.</p>
            {info.downloadUrl ? (
              <a href={info.downloadUrl} className="btn-primary mt-3 inline-flex">
                <Icon name="download" className="h-4 w-4" /> Download to open it
              </a>
            ) : (
              <p className="mt-2 text-xs text-slate-500">Please ask your trainer for a PDF copy.</p>
            )}
          </div>
        ) : (
          <MediaView info={info} viewOnly={viewOnly} />
        )}
      </div>
      {viewOnly && (
        <p className="bg-slate-900 px-4 py-1.5 text-center text-[10px] text-white/45">
          Al Mihad Training — for enrolled students only. View-only: please do not copy, record or share.
        </p>
      )}
    </div>
  );
}

/** Full-screen pop-up version. */
export function FileViewerModal({ url, name, onClose }) {
  useEffect(() => {
    const onKey = (ev) => ev.key === 'Escape' && onClose?.();
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 bg-black/80 p-0 sm:p-4" role="dialog" aria-modal="true">
      <div className="mx-auto h-full max-w-5xl">
        <FileView url={url} name={name} onClose={onClose} />
      </div>
    </div>
  );
}
