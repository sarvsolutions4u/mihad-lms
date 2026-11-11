'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Icon from '../Icon';
import Markdown from './Markdown';
import { uploadFile } from '@/lib/upload';
import { FEEDBACK_TAGS } from '@/lib/courseShared';

/* ------------------------------------------------------------------ */
/* helpers                                                             */
/* ------------------------------------------------------------------ */

/** A playable address for a course audio: built-in files play directly; uploaded ones need a short link. */
export function useFileSrc(url) {
  const [src, setSrc] = useState(url && !String(url).startsWith('/api/files/') ? url : '');
  const [err, setErr] = useState('');
  useEffect(() => {
    if (!url) return setSrc('');
    if (!String(url).startsWith('/api/files/')) return setSrc(url);
    let alive = true;
    fetch(`${url.split('?')[0]}?view=1`, { cache: 'no-store' })
      .then((r) => r.json())
      .then((d) => {
        if (!alive) return;
        if (!d.ok) throw new Error(d.error);
        setSrc(d.url || d.fallbackUrl);
      })
      .catch((e) => alive && setErr(e.message || 'Could not load the audio'));
    return () => {
      alive = false;
    };
  }, [url]);
  return [src, err];
}

/**
 * Chrome saves recordings without their length, so the player can't show the
 * time or let you skip. Asking it to jump far ahead makes it work the length out.
 */
export function RecordingAudio({ src, className = 'h-9 w-full', preload = 'metadata' }) {
  const fix = (e) => {
    const a = e.currentTarget;
    if (a.duration !== Infinity) return;
    const back = () => {
      a.removeEventListener('timeupdate', back);
      a.currentTime = 0;
    };
    a.addEventListener('timeupdate', back);
    a.currentTime = 1e101;
  };
  return <audio src={src} controls preload={preload} onLoadedMetadata={fix} className={className} />;
}

const fmtSecs = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

/** Pick two clear English voices from the browser (used when a line has no recorded audio). */
function pickVoices() {
  if (typeof window === 'undefined' || !window.speechSynthesis) return {};
  const all = window.speechSynthesis.getVoices().filter((v) => /^en[-_]/i.test(v.lang));
  const find = (re) => all.find((v) => re.test(v.name));
  const f = find(/aria|jenny|samantha|google us english|zira|libby|sonia|female|karen|moira|tessa/i) || all[0];
  const m = find(/guy|davis|daniel|google uk english male|david|ryan|male|alex|fred/i) || all.find((v) => v !== f) || f;
  return { f, m };
}

/**
 * Speak one line: its recorded audio if it has one, otherwise the browser's voice.
 * Returns { play(line, rate) → Promise, stop() }.
 */
function useSpeaker() {
  const audio = useRef(null);
  const voices = useRef({});
  useEffect(() => {
    if (typeof window === 'undefined' || !window.speechSynthesis) return;
    const load = () => (voices.current = pickVoices());
    load();
    window.speechSynthesis.addEventListener?.('voiceschanged', load);
    return () => window.speechSynthesis.removeEventListener?.('voiceschanged', load);
  }, []);

  const stop = useCallback(() => {
    if (audio.current) {
      audio.current.onended = null;
      audio.current.onerror = null;
      audio.current.pause();
      audio.current = null;
    }
    if (typeof window !== 'undefined') window.speechSynthesis?.cancel();
  }, []);

  const browserVoice = useCallback(
    (line, rate) =>
      new Promise((resolve) => {
        const synth = window.speechSynthesis;
        if (!synth) return setTimeout(resolve, 1200);
        const u = new SpeechSynthesisUtterance(line.text);
        const v = line.voice === 'm' ? voices.current.m : voices.current.f;
        if (v) u.voice = v;
        u.lang = v?.lang || 'en-US';
        u.rate = rate;
        u.onend = () => resolve();
        u.onerror = () => resolve();
        synth.speak(u);
      }),
    []
  );

  const play = useCallback(
    (line, rate = 1) => {
      stop();
      const src = line.audio && line.audio.startsWith('/courses/') ? line.audio : '';
      if (!src) return browserVoice(line, rate);
      return new Promise((resolve) => {
        const a = new Audio(src);
        a.playbackRate = rate;
        a.preservesPitch = true;
        audio.current = a;
        a.onended = () => resolve();
        a.onerror = () => browserVoice(line, rate).then(resolve);
        a.play().catch(() => browserVoice(line, rate).then(resolve));
      });
    },
    [stop, browserVoice]
  );

  useEffect(() => stop, [stop]);
  return { play, stop };
}

/** Record from the microphone. */
export function useRecorder(maxSecs = 90) {
  const [state, setState] = useState('idle'); // idle | recording | done
  const [secs, setSecs] = useState(0);
  const [blob, setBlob] = useState(null);
  const [url, setUrl] = useState('');
  const [error, setError] = useState('');
  const rec = useRef(null);
  const timer = useRef(null);
  const stream = useRef(null);

  const cleanup = () => {
    clearInterval(timer.current);
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
  };

  const stop = useCallback(() => {
    if (rec.current && rec.current.state !== 'inactive') rec.current.stop();
  }, []);

  const start = useCallback(async () => {
    setError('');
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      setError('Recording is not supported in this browser. Please use Chrome, Edge or Safari (iPhone).');
      return;
    }
    try {
      stream.current = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
    } catch {
      setError('Please allow the microphone for this site (the 🔒 / ⓘ icon next to the address), then try again.');
      return;
    }
    const type = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/aac'].find((t) => MediaRecorder.isTypeSupported?.(t)) || '';
    const r = new MediaRecorder(stream.current, type ? { mimeType: type, audioBitsPerSecond: 48000 } : undefined);
    const chunks = [];
    r.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    r.onstop = () => {
      cleanup();
      const b = new Blob(chunks, { type: r.mimeType || type || 'audio/webm' });
      setBlob(b);
      setUrl((old) => {
        if (old) URL.revokeObjectURL(old);
        return URL.createObjectURL(b);
      });
      setState('done');
    };
    rec.current = r;
    setSecs(0);
    setBlob(null);
    r.start(1000);
    setState('recording');
    const t0 = Date.now();
    timer.current = setInterval(() => {
      const s = Math.floor((Date.now() - t0) / 1000);
      setSecs(s);
      if (s >= maxSecs) r.stop();
    }, 250);
  }, [maxSecs]);

  const reset = useCallback(() => {
    setState('idle');
    setBlob(null);
    setSecs(0);
    setUrl((old) => {
      if (old) URL.revokeObjectURL(old);
      return '';
    });
  }, []);

  useEffect(
    () => () => {
      clearInterval(timer.current);
      stream.current?.getTracks().forEach((t) => t.stop());
    },
    []
  );
  return { state, secs, blob, url, error, start, stop, reset };
}

/** Counts practice time while `active`, reporting every 30 s (and when leaving). */
function usePracticeClock(active, onProgress) {
  const pending = useRef(0);
  const cb = useRef(onProgress);
  cb.current = onProgress;
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => {
      if (document.visibilityState !== 'visible') return;
      pending.current += 1;
      if (pending.current >= 30) {
        cb.current?.({ secs: pending.current });
        pending.current = 0;
      }
    }, 1000);
    return () => clearInterval(t);
  }, [active]);
  useEffect(
    () => () => {
      if (pending.current) cb.current?.({ secs: pending.current });
    },
    []
  );
}

/* ------------------------------------------------------------------ */
/* Conversation: listen line by line, slow down, role-play             */
/* ------------------------------------------------------------------ */

const RATES = [
  { v: 1, label: 'Normal' },
  { v: 0.85, label: 'Slower' },
  { v: 0.7, label: 'Slow' },
];

export function ConversationPlayer({ item, onProgress, onDone }) {
  const lines = useMemo(() => item.lines || [], [item.lines]);
  const speakers = useMemo(() => [...new Set(lines.map((l) => l.speaker).filter(Boolean))], [lines]);
  const single = speakers.length <= 1; // a model paragraph → "repeat after me"
  const { play, stop } = useSpeaker();
  const [mode, setMode] = useState('idle'); // idle | listen | roleplay
  const [idx, setIdx] = useState(-1);
  const [rate, setRate] = useState(1);
  const [role, setRole] = useState(speakers[single ? 0 : 1] || speakers[0] || '');
  const [waiting, setWaiting] = useState(-1);
  const [hideMine, setHideMine] = useState(false);
  const [finished, setFinished] = useState(false);
  const [wholeSrc, wholeErr] = useFileSrc(item.audio);
  const run = useRef(0);
  const next = useRef(null);
  const lineRefs = useRef([]);
  const mic = useRecorder(30);

  usePracticeClock(mode !== 'idle', onProgress);

  useEffect(() => {
    if (idx >= 0) lineRefs.current[idx]?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [idx]);

  const halt = useCallback(() => {
    run.current += 1;
    stop();
    next.current?.(false);
    setMode('idle');
    setIdx(-1);
    setWaiting(-1);
  }, [stop]);
  useEffect(() => halt, [halt]);

  const waitForStudent = (i) =>
    new Promise((resolve) => {
      setWaiting(i);
      next.current = (go = true) => {
        next.current = null;
        setWaiting(-1);
        resolve(go);
      };
    });

  async function listen(from = 0) {
    const me = ++run.current;
    setMode('listen');
    for (let i = from; i < lines.length; i++) {
      if (run.current !== me) return;
      setIdx(i);
      await play(lines[i], rate);
      await new Promise((r) => setTimeout(r, 300));
    }
    if (run.current !== me) return;
    setMode('idle');
    setIdx(-1);
    if (!finished) {
      setFinished(true);
      onDone?.();
    }
  }

  async function rolePlay() {
    const me = ++run.current;
    setMode('roleplay');
    mic.reset();
    for (let i = 0; i < lines.length; i++) {
      if (run.current !== me) return;
      setIdx(i);
      const l = lines[i];
      if (single) {
        await play(l, rate); // hear it, then say it yourself
        if (run.current !== me) return;
        if (!(await waitForStudent(i))) return;
      } else if (l.speaker === role) {
        if (!(await waitForStudent(i))) return;
      } else {
        await play(l, rate);
        await new Promise((r) => setTimeout(r, 250));
      }
    }
    if (run.current !== me) return;
    setMode('idle');
    setIdx(-1);
    setFinished(true);
    onDone?.();
  }

  const playOne = async (i) => {
    if (mode !== 'idle') return;
    const me = ++run.current;
    setIdx(i);
    await play(lines[i], rate);
    if (run.current === me) setIdx(-1);
  };

  const sideOf = (sp) => (speakers.indexOf(sp) % 2 === 0 ? 'left' : 'right');

  return (
    <div className="space-y-4">
      {item.body && <p className="text-sm text-slate-600">{item.body}</p>}

      {item.audio && (
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
          <p className="mb-1.5 text-xs font-semibold text-slate-600">Full recording from your trainer</p>
          {wholeErr ? (
            <p className="text-xs text-red-600">{wholeErr}</p>
          ) : wholeSrc ? (
            <audio src={wholeSrc} controls controlsList="nodownload" className="w-full" onEnded={() => !finished && (setFinished(true), onDone?.())} />
          ) : (
            <p className="text-xs text-slate-400">Loading…</p>
          )}
        </div>
      )}

      {/* controls */}
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white p-3">
        {mode === 'idle' ? (
          <>
            <button type="button" className="btn-primary" onClick={() => listen(0)}>
              <Icon name="play" className="h-4 w-4" /> Listen
            </button>
            <button type="button" className="btn-ghost" onClick={rolePlay}>
              <Icon name="mic" className="h-4 w-4" /> {single ? 'Repeat after me' : 'Role-play'}
            </button>
            {!single && (
              <label className="flex items-center gap-1.5 text-xs text-slate-600">
                as
                <select className="input w-auto py-1 text-xs" value={role} onChange={(e) => setRole(e.target.value)}>
                  {speakers.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </>
        ) : (
          <button type="button" className="btn-ghost" onClick={halt}>
            <Icon name="stop" className="h-4 w-4" /> Stop
          </button>
        )}
        <div className="ml-auto flex rounded-lg border border-slate-200 p-0.5" role="group" aria-label="Speed">
          {RATES.map((r) => (
            <button
              key={r.v}
              type="button"
              onClick={() => setRate(r.v)}
              className={`rounded-md px-2.5 py-1 text-xs font-semibold ${rate === r.v ? 'bg-maroon text-white' : 'text-slate-600'}`}
            >
              {r.label}
            </button>
          ))}
        </div>
        {mode === 'roleplay' && !single && (
          <label className="flex w-full items-center gap-1.5 text-xs text-slate-600">
            <input type="checkbox" checked={hideMine} onChange={(e) => setHideMine(e.target.checked)} /> Hide my lines (challenge)
          </label>
        )}
      </div>

      {/* the conversation */}
      <ol className="space-y-2.5">
        {lines.map((l, i) => {
          const right = !single && sideOf(l.speaker) === 'right';
          const active = idx === i;
          const mine = mode === 'roleplay' && (single || l.speaker === role);
          const hidden = mine && hideMine && waiting === i;
          return (
            <li key={i} ref={(el) => (lineRefs.current[i] = el)} className={`flex ${right ? 'justify-end' : 'justify-start'}`}>
              <button
                type="button"
                onClick={() => playOne(i)}
                className={`max-w-[88%] rounded-2xl px-3.5 py-2.5 text-left shadow-sm transition sm:max-w-[75%] ${
                  active ? 'ring-2 ring-gold' : ''
                } ${mine ? 'bg-gold-50' : right ? 'bg-maroon-50' : 'bg-white'} ${mode !== 'idle' ? 'cursor-default' : 'hover:shadow'}`}
                title={mode === 'idle' ? 'Tap to hear this line' : undefined}
              >
                {!single && <span className={`block text-[11px] font-bold ${right ? 'text-maroon' : 'text-slate-500'}`}>{l.speaker}</span>}
                <span className={`block text-[15px] leading-snug text-slate-800 ${hidden ? 'select-none blur-sm' : ''}`}>{l.text}</span>
              </button>
            </li>
          );
        })}
      </ol>

      {/* your turn */}
      {waiting >= 0 && (
        <div className="sticky bottom-3 z-10 rounded-2xl border-2 border-gold bg-white p-4 shadow-lg">
          <p className="text-xs font-bold uppercase tracking-wide text-gold-600">Your turn — say it aloud</p>
          <p className={`mt-1 text-base font-semibold text-slate-800 ${hideMine && !single ? 'select-none blur-sm' : ''}`}>{lines[waiting]?.text}</p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button type="button" className="btn-primary" onClick={() => next.current?.(true)}>
              I said it — next →
            </button>
            <button type="button" className="btn-ghost btn-sm" onClick={() => play(lines[waiting], rate)}>
              <Icon name="play" className="h-3.5 w-3.5" /> Hear it
            </button>
            {mic.state === 'recording' ? (
              <button type="button" className="btn-ghost btn-sm text-red-600" onClick={mic.stop}>
                <Icon name="stop" className="h-3.5 w-3.5" /> Stop ({mic.secs}s)
              </button>
            ) : (
              <button type="button" className="btn-ghost btn-sm" onClick={mic.start} title="Only on this device — not sent to anyone">
                <Icon name="mic" className="h-3.5 w-3.5" /> Record me
              </button>
            )}
            {mic.url && mic.state === 'done' && <RecordingAudio src={mic.url} className="h-8 max-w-[220px]" />}
          </div>
          {mic.error && <p className="mt-2 text-xs text-red-600">{mic.error}</p>}
          <p className="mt-2 text-[11px] text-slate-400">“Record me” lets you hear yourself next to the model. It stays on this device.</p>
        </div>
      )}

      {finished && mode === 'idle' && (
        <p className="flex items-center gap-1.5 text-sm font-semibold text-emerald-700">
          <Icon name="check" className="h-4 w-4" /> Well done! Try it again at a faster speed, or role-play the other person.
        </p>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Listening (an uploaded audio file)                                  */
/* ------------------------------------------------------------------ */

export function AudioItem({ item, onProgress, onDone }) {
  const [src, err] = useFileSrc(item.audio);
  const [playing, setPlaying] = useState(false);
  usePracticeClock(playing, onProgress);
  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <p className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-700">
          <Icon name="headphones" className="h-4 w-4 text-maroon" /> {item.audioName || 'Listen'}
        </p>
        {err ? (
          <p className="text-sm text-red-600">{err}</p>
        ) : src ? (
          <audio
            src={src}
            controls
            controlsList="nodownload"
            onContextMenu={(e) => e.preventDefault()}
            className="w-full"
            onPlay={() => setPlaying(true)}
            onPause={() => setPlaying(false)}
            onEnded={() => {
              setPlaying(false);
              onDone?.();
            }}
          />
        ) : (
          <p className="text-sm text-slate-400">{item.audio ? 'Loading…' : 'No audio added yet.'}</p>
        )}
        <p className="mt-2 text-[11px] text-slate-500">Tip: use the ⋮ menu on the player to change the speed.</p>
      </div>
      {item.body && (
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="mb-1 text-xs font-bold uppercase tracking-wide text-slate-500">Transcript / notes</p>
          <Markdown text={item.body} />
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Speaking task: record → send → trainer's feedback                    */
/* ------------------------------------------------------------------ */

export function Stars({ value = 0, onChange, size = 'h-5 w-5' }) {
  return (
    <span className="inline-flex gap-0.5" role={onChange ? 'radiogroup' : undefined} aria-label={`${value || 0} of 5 stars`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          disabled={!onChange}
          onClick={() => onChange?.(n)}
          className={`${onChange ? 'cursor-pointer' : 'cursor-default'} ${n <= value ? 'text-gold' : 'text-slate-300'}`}
          aria-label={`${n} star${n === 1 ? '' : 's'}`}
        >
          <svg viewBox="0 0 24 24" className={size} fill="currentColor" aria-hidden="true">
            <path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1 6.2L12 17.3 6.5 20.2l1-6.2L3 9.6l6.2-.9L12 3Z" />
          </svg>
        </button>
      ))}
    </span>
  );
}

export function FeedbackView({ a }) {
  const fmt = (d) => new Date(d).toLocaleString('en-GB', { timeZone: 'Asia/Dubai', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
        <span>Sent {fmt(a.createdAt)}</span>
        {a.secs ? <span>· {fmtSecs(a.secs)}</span> : null}
        <span className={`rounded-full px-2 py-0.5 font-semibold ${a.status === 'reviewed' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>
          {a.status === 'reviewed' ? 'Feedback ready' : 'Waiting for your trainer'}
        </span>
      </div>
      <RecordingAudio src={a.audio} />
      {a.note && <p className="text-xs italic text-slate-500">Your note: “{a.note}”</p>}
      {a.status === 'reviewed' && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50/60 p-3">
          <div className="flex flex-wrap items-center gap-2">
            <Stars value={a.rating} />
            <span className="text-xs text-slate-600">
              from {a.reviewedBy?.name || 'your trainer'}
              {a.reviewedAt ? ` · ${fmt(a.reviewedAt)}` : ''}
            </span>
          </div>
          {a.tags?.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {a.tags.map((t) => (
                <span key={t} className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${/^Work on|^Speak more|^Use full|^Add more/.test(t) ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800'}`}>
                  {t}
                </span>
              ))}
            </div>
          )}
          {a.feedback && <p className="mt-2 whitespace-pre-wrap text-sm text-slate-800">{a.feedback}</p>}
        </div>
      )}
    </div>
  );
}

const MAX_PER_TASK = 3;

export function SpeakingTask({ courseId, item, attempts = [], onSent }) {
  const rec = useRecorder(item.maxSecs || 90);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState('');
  const [sent, setSent] = useState(false);
  const mine = attempts.filter((a) => String(a.item) === String(item._id));
  const left = MAX_PER_TASK - mine.length;

  useEffect(() => {
    // mark new feedback as seen
    mine
      .filter((a) => a.status === 'reviewed' && !a.seen)
      .forEach((a) =>
        fetch(`/api/courses/attempts/${a._id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ seen: true }) }).then(() =>
          window.dispatchEvent(new Event('courses:changed'))
        )
      );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attempts]);

  async function send() {
    if (!rec.blob) return;
    setErr('');
    try {
      setBusy('Uploading…');
      const ext = /mp4|aac/.test(rec.blob.type) ? 'm4a' : 'webm';
      const file = new File([rec.blob], `speaking-${item.title.replace(/[^a-z0-9]+/gi, '-').slice(0, 40)}.${ext}`, { type: rec.blob.type });
      const up = await uploadFile(file, { purpose: 'speaking' });
      setBusy('Sending…');
      const r = await fetch(`/api/courses/${courseId}/attempts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ item: item._id, audio: up.url, secs: rec.secs, note }),
      });
      const d = await r.json();
      if (!r.ok || !d.ok) throw new Error(d.error || 'Could not send');
      rec.reset();
      setNote('');
      setSent(true);
      onSent?.();
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy('');
    }
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-gold/50 bg-gold-50/50 p-4">
        <p className="mb-1 text-xs font-bold uppercase tracking-wide text-gold-600">Your task</p>
        <Markdown text={item.prompt} />
        {item.tips && <p className="mt-2 text-xs text-slate-600">💡 {item.tips}</p>}
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4">
        {left <= 0 ? (
          <p className="text-sm text-slate-600">You have sent {MAX_PER_TASK} recordings for this task. Keep practising in class — your trainer’s feedback is below.</p>
        ) : rec.state === 'recording' ? (
          <div className="flex flex-wrap items-center gap-3">
            <span className="inline-flex items-center gap-2 text-sm font-semibold text-red-600">
              <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-red-600" /> Recording {fmtSecs(rec.secs)} / {fmtSecs(item.maxSecs || 90)}
            </span>
            <button type="button" className="btn-primary" onClick={rec.stop}>
              <Icon name="stop" className="h-4 w-4" /> Stop
            </button>
          </div>
        ) : rec.state === 'done' ? (
          <div className="space-y-3">
            <p className="text-sm font-semibold text-slate-700">Listen to your answer ({fmtSecs(rec.secs)}). Happy with it?</p>
            <RecordingAudio src={rec.url} className="w-full" />
            <input className="input" placeholder="A note for your trainer (optional)" value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} />
            <div className="flex flex-wrap gap-2">
              <button type="button" className="btn-primary" onClick={send} disabled={!!busy}>
                {busy || 'Send to my trainer'}
              </button>
              <button type="button" className="btn-ghost" onClick={rec.reset} disabled={!!busy}>
                Record again
              </button>
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-3">
            <button type="button" className="btn-primary" onClick={rec.start}>
              <Icon name="mic" className="h-4 w-4" /> Start recording
            </button>
            <span className="text-xs text-slate-500">
              Up to {fmtSecs(item.maxSecs || 90)} · {left} of {MAX_PER_TASK} recordings left for this task
            </span>
          </div>
        )}
        {rec.error && <p className="mt-2 text-sm text-red-600">{rec.error}</p>}
        {err && <p className="mt-2 text-sm text-red-600">{err}</p>}
        {sent && rec.state === 'idle' && <p className="mt-2 text-sm font-semibold text-emerald-700">Sent! Your trainer will listen and reply with tips.</p>}
      </div>

      {mine.length > 0 && (
        <div className="space-y-3">
          <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Your recordings</p>
          {mine.map((a) => (
            <div key={a._id} className="rounded-xl border border-slate-200 bg-white p-4">
              <FeedbackView a={a} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Trainer: review one recording                                        */
/* ------------------------------------------------------------------ */

export function ReviewCard({ a, onDone, showCourse = false }) {
  const [rating, setRating] = useState(a.rating || 0);
  const [tags, setTags] = useState(a.tags || []);
  const [feedback, setFeedback] = useState(a.feedback || '');
  const [editing, setEditing] = useState(a.status !== 'reviewed');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const fmt = (d) => new Date(d).toLocaleString('en-GB', { timeZone: 'Asia/Dubai', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });

  async function save() {
    setErr('');
    if (!rating) return setErr('Choose 1–5 stars');
    setBusy(true);
    try {
      const r = await fetch(`/api/courses/attempts/${a._id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rating, tags, feedback }),
      });
      const d = await r.json();
      if (!r.ok || !d.ok) throw new Error(d.error || 'Could not save');
      setEditing(false);
      window.dispatchEvent(new Event('courses:changed'));
      onDone?.();
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-sm font-bold text-slate-800">
            {a.student?.name}
            {a.student?.classRoom?.name ? <span className="font-normal text-slate-500"> · {a.student.classRoom.name}</span> : null}
          </p>
          <p className="text-xs text-slate-500">
            {showCourse && a.course?.title ? `${a.course.title} — ` : ''}
            {a.itemTitle} · sent {fmt(a.createdAt)}
            {a.secs ? ` · ${fmtSecs(a.secs)}` : ''}
          </p>
        </div>
        <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${a.status === 'reviewed' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>
          {a.status === 'reviewed' ? `Reviewed${a.reviewedBy?.name ? ` by ${a.reviewedBy.name}` : ''}` : 'To review'}
        </span>
      </div>
      <RecordingAudio src={a.audio} className="mt-3 h-9 w-full" />
      {a.note && <p className="mt-2 text-xs italic text-slate-500">Student’s note: “{a.note}”</p>}

      {editing ? (
        <div className="mt-3 space-y-3 border-t border-slate-100 pt-3">
          <div className="flex items-center gap-3">
            <span className="text-xs font-semibold text-slate-600">Overall</span>
            <Stars value={rating} onChange={setRating} size="h-6 w-6" />
          </div>
          <div className="flex flex-wrap gap-1.5">
            {FEEDBACK_TAGS.map((t) => {
              const on = tags.includes(t);
              return (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTags((x) => (on ? x.filter((y) => y !== t) : [...x, t]))}
                  className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${on ? 'border-maroon bg-maroon text-white' : 'border-slate-200 bg-white text-slate-600 hover:border-maroon'}`}
                >
                  {t}
                </button>
              );
            })}
          </div>
          <textarea
            className="input min-h-[80px]"
            placeholder="A short note: what went well, and one thing to improve (e.g. Say “I have worked here for two years”, not “since two years”)."
            value={feedback}
            onChange={(e) => setFeedback(e.target.value)}
            maxLength={2000}
          />
          {err && <p className="text-xs text-red-600">{err}</p>}
          <div className="flex gap-2">
            <button type="button" className="btn-primary" onClick={save} disabled={busy}>
              {busy ? 'Saving…' : 'Send feedback'}
            </button>
            {a.status === 'reviewed' && (
              <button type="button" className="btn-ghost" onClick={() => setEditing(false)}>
                Cancel
              </button>
            )}
          </div>
        </div>
      ) : (
        <div className="mt-3 border-t border-slate-100 pt-3">
          <div className="flex items-center gap-2">
            <Stars value={rating} />
            <button type="button" className="ml-auto text-xs font-semibold text-maroon" onClick={() => setEditing(true)}>
              Edit feedback
            </button>
          </div>
          {tags.length > 0 && <p className="mt-1 text-xs text-slate-600">{tags.join(' · ')}</p>}
          {feedback && <p className="mt-1 whitespace-pre-wrap text-sm text-slate-700">{feedback}</p>}
        </div>
      )}
    </div>
  );
}
