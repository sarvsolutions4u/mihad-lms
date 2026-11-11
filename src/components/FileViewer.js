'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Icon from './Icon';
import { fmtSize } from '@/lib/fileTypes';
import { useSession } from './SessionProvider';
import DoubtDialog from './DoubtDialog';

/**
 * Shows a stored file inside the portal: PDFs page by page (pdf.js), videos,
 * audio and pictures. Course material for students and parents is view-only —
 * no download or print button, right-click, copying and Ctrl+S / Ctrl+P are
 * blocked, and every PDF page carries the student's name (stamped on the server).
 *
 * Students and parents can raise a doubt from here: select text (a "Raise a
 * doubt" button pops up), snip part of a PDF page, or ask about a moment in a video.
 */

const LEARNERS = ['student', 'parent'];

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

/*
 * Keeps text selection tight on PDF pages (ported from pdf.js's own viewer):
 * an invisible "end of content" block follows the selection so dragging over
 * blank space doesn't select the whole rest of the page.
 */
const textLayers = new Map(); // text layer div -> its end-of-content div
let selectionWatch = null;
function registerTextLayer(div) {
  const end = document.createElement('div');
  end.className = 'endOfContent';
  div.append(end);
  textLayers.set(div, end);
  if (selectionWatch) return;
  selectionWatch = new AbortController();
  const { signal } = selectionWatch;
  const reset = (endDiv, layer) => {
    layer.append(endDiv);
    endDiv.style.width = '';
    endDiv.style.height = '';
    layer.classList.remove('selecting');
  };
  let down = false;
  let prevRange = null;
  document.addEventListener('pointerdown', () => (down = true), { signal });
  document.addEventListener('pointerup', () => {
    down = false;
    textLayers.forEach(reset);
  }, { signal });
  window.addEventListener('blur', () => {
    down = false;
    textLayers.forEach(reset);
  }, { signal });
  document.addEventListener('keyup', () => !down && textLayers.forEach(reset), { signal });
  document.addEventListener('selectionchange', () => {
    const sel = document.getSelection();
    if (!sel || sel.rangeCount === 0) return textLayers.forEach(reset);
    const active = new Set();
    const range = sel.getRangeAt(0);
    for (const layer of textLayers.keys()) if (range.intersectsNode(layer)) active.add(layer);
    for (const [layer, endDiv] of textLayers) {
      if (active.has(layer)) layer.classList.add('selecting');
      else reset(endDiv, layer);
    }
    const modifyStart =
      prevRange && (range.compareBoundaryPoints(Range.END_TO_END, prevRange) === 0 || range.compareBoundaryPoints(Range.START_TO_END, prevRange) === 0);
    let anchor = modifyStart ? range.startContainer : range.endContainer;
    if (anchor.nodeType === Node.TEXT_NODE) anchor = anchor.parentNode;
    const layer = anchor?.parentElement?.closest?.('.textLayer');
    const endDiv = textLayers.get(layer);
    if (endDiv && anchor.parentElement) {
      endDiv.style.width = layer.style.width;
      endDiv.style.height = layer.style.height;
      anchor.parentElement.insertBefore(endDiv, modifyStart ? anchor : anchor.nextSibling);
    }
    prevRange = range.cloneRange();
  }, { signal });
}
function unregisterTextLayer(div) {
  textLayers.delete(div);
  if (!textLayers.size && selectionWatch) {
    selectionWatch.abort();
    selectionWatch = null;
  }
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
    // text can be selected (to ask about it) but not copied out of the viewer
    const onCopy = (e) => {
      const n = window.getSelection()?.anchorNode;
      const el = n?.nodeType === 1 ? n : n?.parentElement;
      if (el?.closest?.('[data-viewonly]')) e.preventDefault();
    };
    window.addEventListener('keydown', onKey, true);
    document.addEventListener('copy', onCopy, true);
    document.addEventListener('cut', onCopy, true);
    const style = document.createElement('style');
    style.textContent = '@media print { body { display: none !important; } }';
    document.head.appendChild(style);
    return () => {
      window.removeEventListener('keydown', onKey, true);
      document.removeEventListener('copy', onCopy, true);
      document.removeEventListener('cut', onCopy, true);
      style.remove();
    };
  }, [active]);
}

/** One PDF page; draws itself when scrolled near, clears itself when far away. */
function PdfPage({ doc, number, width, ratio: initialRatio, onVisible, root, snipping, onSnip }) {
  const holder = useRef(null);
  const [ratio, setRatio] = useState(initialRatio);
  const canvas = useRef(null);
  const text = useRef(null);
  const [drag, setDrag] = useState(null); // snip rectangle { x0, y0, x1, y1 } in CSS px
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
      if (text.current) {
        unregisterTextLayer(text.current);
        text.current.replaceChildren();
      }
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
        return; /* cancelled while scrolling */
      }
      // invisible text on top of the picture, so the student can select a sentence
      const tl = text.current;
      if (!tl || cancelled) return;
      try {
        const lib = await loadPdfJs();
        const cssViewport = page.getViewport({ scale: width / base.width });
        tl.replaceChildren();
        tl.style.setProperty('--scale-factor', String(width / base.width));
        await new lib.TextLayer({ textContentSource: page.streamTextContent(), container: tl, viewport: cssViewport }).render();
        // the stamps (student name line, diagonal "AL MIHAD TRAINING") are not part of the notes:
        // leave them out of selection, otherwise the rotated mark grabs half the page
        for (const sp of tl.querySelectorAll('span')) {
          const t = sp.textContent || '';
          if (/rotate\(/.test(sp.style.transform || '') || /^(Issued to |Downloaded by |Trainer: )|For personal study only|AL MIHAD TRAINING|Al Mihad Training Centre/.test(t)) {
            sp.classList.add('wm');
          }
        }
        if (!cancelled) registerTextLayer(tl);
      } catch {
        /* scanned pages have no text — snipping still works */
      }
    })();
    return () => {
      cancelled = true;
      task.current?.cancel?.();
      if (text.current) unregisterTextLayer(text.current);
    };
  }, [doc, number, near, width]);

  const at = (e) => {
    const r = holder.current.getBoundingClientRect();
    return { x: Math.min(Math.max(e.clientX - r.left, 0), r.width), y: Math.min(Math.max(e.clientY - r.top, 0), r.height) };
  };
  function finishSnip() {
    const d = drag;
    setDrag(null);
    const c = canvas.current;
    if (!d || !c || !c.width) return;
    const x = Math.min(d.x0, d.x1);
    const y = Math.min(d.y0, d.y1);
    const w = Math.abs(d.x1 - d.x0);
    const h = Math.abs(d.y1 - d.y0);
    if (w < 12 || h < 12) return;
    const k = c.width / holder.current.clientWidth;
    const shrink = Math.min(1, 1600 / (w * k));
    const out = document.createElement('canvas');
    out.width = Math.round(w * k * shrink);
    out.height = Math.round(h * k * shrink);
    const g = out.getContext('2d');
    g.fillStyle = '#fff';
    g.fillRect(0, 0, out.width, out.height);
    g.drawImage(c, x * k, y * k, w * k, h * k, 0, 0, out.width, out.height);
    const dataUrl = out.toDataURL('image/jpeg', 0.85);
    out.toBlob((blob) => blob && onSnip?.({ blob, dataUrl, page: number }), 'image/jpeg', 0.85);
  }

  return (
    <div ref={holder} data-page={number} className="relative mx-auto bg-white shadow-md" style={{ width, height: width * ratio }}>
      <canvas ref={canvas} className="block h-full w-full" />
      <div ref={text} className="textLayer" />
      {!near && <span className="absolute inset-0 grid place-items-center text-xs text-slate-300">Page {number}</span>}
      {snipping && (
        <div
          className="absolute inset-0 z-20 cursor-crosshair touch-none bg-maroon/5"
          onPointerDown={(e) => {
            e.preventDefault();
            e.currentTarget.setPointerCapture(e.pointerId);
            const p = at(e);
            setDrag({ x0: p.x, y0: p.y, x1: p.x, y1: p.y });
          }}
          onPointerMove={(e) => drag && setDrag((d) => ({ ...d, x1: at(e).x, y1: at(e).y }))}
          onPointerUp={finishSnip}
          onPointerCancel={() => setDrag(null)}
        >
          {drag && (
            <div
              className="absolute border-2 border-dashed border-maroon bg-gold/20"
              style={{ left: Math.min(drag.x0, drag.x1), top: Math.min(drag.y0, drag.y1), width: Math.abs(drag.x1 - drag.x0), height: Math.abs(drag.y1 - drag.y0) }}
            />
          )}
        </div>
      )}
    </div>
  );
}

/** The floating "Raise a doubt" button that appears next to selected text. */
function AskPopup({ sel, onAsk }) {
  if (!sel) return null;
  const w = 150;
  const left = Math.min(Math.max(sel.x - w / 2, 8), window.innerWidth - w - 8);
  const top = Math.min(sel.y + 10, window.innerHeight - 52);
  return (
    <button
      type="button"
      data-ask-popup
      onMouseDown={(e) => e.preventDefault()}
      onClick={onAsk}
      style={{ left, top, width: w }}
      className="fixed z-[55] inline-flex items-center justify-center gap-1.5 rounded-full bg-maroon px-3 py-2 text-xs font-bold text-white shadow-lg ring-2 ring-gold hover:bg-maroon-800"
    >
      <Icon name="help" className="h-4 w-4" /> Raise a doubt
    </button>
  );
}

/** Watch the selection inside `container` (or a frame's document) and report it. */
function useSelectionWatch(getDoc, getBox, enabled, frame) {
  const [sel, setSel] = useState(null);
  useEffect(() => {
    if (!enabled) return;
    let raf = 0;
    let doc = null;
    const check = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const d = getDoc();
        const s = d?.getSelection?.();
        if (!s || s.isCollapsed || !s.rangeCount) return setSel(null);
        const n = s.anchorNode;
        const el = n?.nodeType === 1 ? n : n?.parentElement;
        const box = getBox();
        if (!box || !el || !box.contains(el)) return setSel(null);
        const textSel = s.toString().replace(/[ \t]+/g, ' ').trim();
        if (textSel.length < 2) return setSel(null);
        const r = s.getRangeAt(0).getBoundingClientRect();
        const off = frame?.current ? frame.current.getBoundingClientRect() : { left: 0, top: 0 };
        const pageEl = el.closest?.('[data-page]');
        setSel({ text: textSel.slice(0, 2000), page: pageEl ? Number(pageEl.dataset.page) : undefined, x: off.left + r.left + r.width / 2, y: off.top + r.bottom });
      });
    };
    const attach = () => {
      doc = getDoc();
      if (!doc) return;
      doc.addEventListener('selectionchange', check);
      doc.addEventListener('scroll', check, true);
    };
    attach();
    window.addEventListener('resize', check);
    return () => {
      cancelAnimationFrame(raf);
      doc?.removeEventListener('selectionchange', check);
      doc?.removeEventListener('scroll', check, true);
      window.removeEventListener('resize', check);
    };
  }, [enabled, getDoc, getBox, frame]);
  return [sel, setSel];
}

function PdfView({ info, viewOnly, onPage, canAsk, onAsk, initialPage }) {
  const box = useRef(null);
  const [snipping, setSnipping] = useState(false);
  const getDoc = useCallback(() => document, []);
  const getBox = useCallback(() => box.current, []);
  const [sel, setSel] = useSelectionWatch(getDoc, getBox, canAsk);
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
        if (initialPage > 1) {
          setTimeout(() => box.current?.querySelector(`[data-page="${Math.min(initialPage, loaded.numPages)}"]`)?.scrollIntoView({ block: 'start' }), 120);
        }
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
      <div className="flex items-center justify-center gap-1.5 whitespace-nowrap border-b border-white/10 bg-slate-900 px-2 py-1.5 text-xs text-white/80 sm:gap-2 sm:px-3">
        <button type="button" className="grid h-9 w-9 place-items-center rounded hover:bg-white/10 sm:h-7 sm:w-7" onClick={() => setZoom((z) => Math.max(0.5, +(z - 0.25).toFixed(2)))} aria-label="Zoom out">
          −
        </button>
        <span className="w-12 text-center">{Math.round(zoom * 100)}%</span>
        <button type="button" className="grid h-9 w-9 place-items-center rounded hover:bg-white/10 sm:h-7 sm:w-7" onClick={() => setZoom((z) => Math.min(3, +(z + 0.25).toFixed(2)))} aria-label="Zoom in">
          +
        </button>
        <button type="button" className="hidden rounded px-2 py-1 hover:bg-white/10 sm:inline" onClick={() => setZoom(1)}>
          Fit width
        </button>
        {doc && (
          <span className="ml-1 text-white/60 sm:ml-2">
            <span className="hidden sm:inline">Page </span>
            {page} / {doc.numPages}
          </span>
        )}
        {canAsk && doc && (
          <button
            type="button"
            onClick={() => setSnipping((v) => !v)}
            className={`ml-auto inline-flex items-center gap-1 rounded-lg px-2.5 py-1 font-semibold ${snipping ? 'bg-gold text-maroon-900' : 'bg-white/10 hover:bg-white/20'}`}
            title="Drag over part of a page to ask about it"
          >
            <Icon name="scissors" className="h-3.5 w-3.5" /> {snipping ? 'Cancel snip' : 'Snip & ask'}
          </button>
        )}
      </div>
      {snipping && (
        <p className="bg-gold px-3 py-1.5 text-center text-xs font-semibold text-maroon-900">Drag over the part of the page you have a doubt about.</p>
      )}
      {canAsk && !snipping && (
        <AskPopup
          sel={sel}
          onAsk={() => {
            onAsk({ quote: sel.text, page: sel.page || page });
            window.getSelection()?.removeAllRanges();
            setSel(null);
          }}
        />
      )}
      <div
        ref={box}
        data-viewonly={viewOnly ? '' : undefined}
        className="min-h-0 flex-1 overflow-auto bg-slate-700 py-3"
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
              <PdfPage
                key={i}
                doc={doc}
                number={i + 1}
                width={width}
                ratio={r}
                onVisible={onVisible}
                root={box.current}
                snipping={snipping}
                onSnip={(snip) => {
                  setSnipping(false);
                  onAsk({ snip, page: snip.page });
                }}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function MediaView({ info, viewOnly, canAsk, onAsk }) {
  const [src, setSrc] = useState(info.url);
  const video = useRef(null);
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
    <div className="relative grid h-full place-items-center bg-black" {...block}>
      {canAsk && (
        <button
          type="button"
          onClick={() => {
            const v = video.current;
            v?.pause();
            onAsk({ seconds: Math.floor(v?.currentTime || 0) });
          }}
          className="absolute right-3 top-3 z-10 inline-flex items-center gap-1.5 rounded-full bg-maroon px-3 py-2 text-xs font-bold text-white shadow-lg ring-2 ring-gold"
        >
          <Icon name="help" className="h-4 w-4" /> Ask about this moment
        </button>
      )}
      <video
        ref={video}
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
function DocView({ info, viewOnly, canAsk, onAsk }) {
  const [html, setHtml] = useState(null);
  const [err, setErr] = useState('');
  const frame = useRef(null);
  const [frameDoc, setFrameDoc] = useState(null);
  const getDoc = useCallback(() => frameDoc, [frameDoc]);
  const getBox = useCallback(() => frameDoc?.body, [frameDoc]);
  const [sel, setSel] = useSelectionWatch(getDoc, getBox, canAsk && !!frameDoc, frame);

  // the page inside the frame can't run scripts; the portal blocks copy / right-click on it
  function onFrameLoad() {
    const d = frame.current?.contentDocument;
    if (!d) return;
    if (viewOnly) {
      const stop = (e) => e.preventDefault();
      d.addEventListener('copy', stop);
      d.addEventListener('cut', stop);
      d.addEventListener('contextmenu', stop);
      d.addEventListener('dragstart', stop);
      d.addEventListener('keydown', (e) => {
        const k = e.key?.toLowerCase();
        if ((e.ctrlKey || e.metaKey) && ['s', 'p'].includes(k)) e.preventDefault();
      });
    }
    setFrameDoc(d);
  }
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
      {/* same-origin so the portal can read the selection; no allow-scripts, so nothing in the document can run */}
      <iframe
        ref={frame}
        title={info.name}
        srcDoc={html}
        onLoad={onFrameLoad}
        sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox"
        className="mx-auto block h-full w-full max-w-4xl rounded bg-white"
      />
      {canAsk && (
        <AskPopup
          sel={sel}
          onAsk={() => {
            onAsk({ quote: sel.text });
            frameDoc?.getSelection()?.removeAllRanges();
            setSel(null);
          }}
        />
      )}
    </div>
  );
}

/** The whole viewer: header (name, download if allowed, close) + the file. */
export function FileView({ url, name, onClose, fullPage = false, initialPage }) {
  const id = idFrom(url);
  const [info, setInfo] = useState(null);
  const [err, setErr] = useState('');
  const { user } = useSession();
  const [ask, setAsk] = useState(null);
  const page = useRef(initialPage || 1);
  const onPage = useCallback((n) => {
    page.current = n;
  }, []);

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
  // students & parents can ask about course material (not their own uploads or receipts)
  const canAsk = !!info && LEARNERS.includes(user?.role) && info.purpose === 'general';
  const openAsk = (extra) => setAsk({ fileId: info.id, fileName: info.name, ...extra });

  return (
    <div className={`flex flex-col overflow-hidden bg-slate-900 ${fullPage ? 'h-[calc(100dvh-7rem)] rounded-xl' : 'h-full rounded-xl'}`}>
      <div className="flex items-center gap-3 px-4 py-2.5 text-white">
        <Icon name="file" className="h-4 w-4 shrink-0 text-gold" />
        <p className="min-w-0 flex-1 truncate text-sm font-semibold">{info?.name || name || 'File'}</p>
        {info?.size ? <span className="hidden text-[11px] text-white/50 sm:inline">{fmtSize(info.size)}</span> : null}
        {canAsk && (
          <button
            type="button"
            onClick={() => openAsk(info.kind === 'pdf' ? { page: page.current } : info.kind === 'video' ? { askTime: true } : {})}
            className="inline-flex items-center gap-1 rounded-lg bg-gold px-2.5 py-1.5 text-xs font-bold text-maroon-900 hover:bg-gold-400"
          >
            <Icon name="help" className="h-3.5 w-3.5" /> <span className="hidden sm:inline">Raise a</span> doubt
          </button>
        )}
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
          <PdfView info={info} viewOnly={viewOnly} canAsk={canAsk} onAsk={openAsk} onPage={onPage} initialPage={initialPage} />
        ) : info.kind === 'doc' ? (
          <DocView info={info} viewOnly={viewOnly} canAsk={canAsk} onAsk={openAsk} />
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
          <MediaView info={info} viewOnly={viewOnly} canAsk={canAsk} onAsk={openAsk} />
        )}
      </div>
      {ask && <DoubtDialog ask={ask} onClose={() => setAsk(null)} />}
      {viewOnly && (
        <p className="bg-slate-900 px-4 py-1.5 text-center text-[10px] text-white/45">
          Al Mihad Training — for enrolled students only. View-only: please do not copy, record or share.
          {canAsk ? ' Select text or use “Snip & ask” to raise a doubt.' : ''}
        </p>
      )}
    </div>
  );
}

/** Full-screen pop-up version. */
export function FileViewerModal({ url, name, onClose, initialPage }) {
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
        <FileView url={url} name={name} onClose={onClose} initialPage={initialPage} />
      </div>
    </div>
  );
}
