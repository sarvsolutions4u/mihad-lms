'use client';

import { use, useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useSession } from '@/components/SessionProvider';
import { Spinner, Empty } from '@/components/ui';
import Icon from '@/components/Icon';
import Markdown from '@/components/course/Markdown';
import { ConversationPlayer, AudioItem, SpeakingTask } from '@/components/course/Players';
import { FileView } from '@/components/FileViewer';
import { ITEM_KINDS } from '@/lib/courseShared';

export default function CourseItemPage({ params }) {
  const { id, itemId } = use(params);
  const { user } = useSession();
  const [data, setData] = useState(null);
  const [err, setErr] = useState('');
  const [doneNow, setDoneNow] = useState(false);
  const student = user?.role === 'student';
  const marked = useRef(false);

  const load = useCallback(() => {
    fetch(`/api/courses/${id}`, { cache: 'no-store' })
      .then((r) => r.json())
      .then((d) => (d.ok ? setData(d) : setErr(d.error || 'Course not found')))
      .catch(() => setErr('Could not load the course'));
  }, [id]);
  useEffect(() => {
    load();
    marked.current = false;
    setDoneNow(false);
  }, [load, itemId]);

  const report = useCallback(
    (body) => {
      if (!student) return Promise.resolve();
      return fetch(`/api/courses/${id}/progress`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ item: itemId, ...body }) }).catch(() => {});
    },
    [id, itemId, student]
  );
  const markDone = useCallback(() => {
    if (marked.current) return;
    marked.current = true;
    setDoneNow(true);
    report({ done: true });
  }, [report]);

  // opening an item counts as "last visited"
  useEffect(() => {
    if (data && student) report({});
  }, [data, student, report]);

  if (err) return <Empty title={err} />;
  if (!data || !user) return <Spinner />;
  const { course } = data;
  const all = course.units.flatMap((u) => u.items.map((it) => ({ ...it, unit: u })));
  const pos = all.findIndex((i) => i._id === itemId);
  const item = all[pos];
  if (!item) return <Empty title="This activity was removed" />;
  const prev = all[pos - 1];
  const next = all[pos + 1];
  const k = ITEM_KINDS[item.kind] || ITEM_KINDS.notes;
  const isDone = doneNow || (data.progress?.done || []).includes(item._id);

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-3 flex flex-wrap items-center gap-1 text-xs text-slate-500">
        <Link href="/courses" className="hover:text-maroon">
          Courses
        </Link>
        <span>›</span>
        <Link href={`/courses/${id}`} className="font-semibold hover:text-maroon">
          {course.title}
        </Link>
        <span>›</span>
        <span className="truncate">{item.unit.title}</span>
      </div>

      <div className="mb-4 flex items-start gap-3">
        <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${item.kind === 'speaking' ? 'bg-gold-50 text-gold-600' : 'bg-maroon-50 text-maroon'}`}>
          <Icon name={k.icon} className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">
            {k.label} · {pos + 1} of {all.length}
            {item.minutes ? ` · ${item.minutes} min` : ''}
          </p>
          <h1 className="text-xl font-bold text-slate-800">{item.title}</h1>
        </div>
        {student && isDone && (
          <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">
            <Icon name="check" className="h-3.5 w-3.5" /> Done
          </span>
        )}
      </div>

      {item.kind === 'conversation' && <ConversationPlayer key={item._id} item={item} onProgress={report} onDone={markDone} />}
      {item.kind === 'audio' && <AudioItem key={item._id} item={item} onProgress={report} onDone={markDone} />}
      {item.kind === 'notes' && (
        <div className="card p-5">
          <Markdown text={item.body} />
          {student && !isDone && (
            <button type="button" className="btn-primary mt-4" onClick={markDone}>
              <Icon name="check" className="h-4 w-4" /> I’ve read and practised these
            </button>
          )}
        </div>
      )}
      {item.kind === 'file' && (
        <div className="space-y-3">
          {item.body && <Markdown text={item.body} />}
          {item.file?.url ? (
            <div className="h-[70vh]" onPointerDown={markDone}>
              <FileView url={item.file.url} name={item.file.name} />
            </div>
          ) : (
            <Empty title="No file added yet" />
          )}
          {student && !isDone && item.file?.url && (
            <button type="button" className="btn-ghost" onClick={markDone}>
              <Icon name="check" className="h-4 w-4" /> Mark as done
            </button>
          )}
        </div>
      )}
      {item.kind === 'speaking' &&
        (student ? (
          <SpeakingTask courseId={id} item={item} attempts={data.attempts || []} onSent={load} />
        ) : (
          <div className="card space-y-2 p-5">
            <Markdown text={item.prompt} />
            {item.tips && <p className="text-xs text-slate-600">💡 {item.tips}</p>}
            <p className="text-xs text-slate-500">
              Students record up to {Math.round((item.maxSecs || 90) / 60 * 10) / 10} min here. Their recordings appear under <b>Speaking to review</b>.
            </p>
          </div>
        ))}

      <div className="mt-8 flex items-center justify-between gap-3 border-t border-slate-200 pt-4">
        {prev ? (
          <Link href={`/courses/${id}/${prev._id}`} className="btn-ghost btn-sm max-w-[45%]">
            <span className="truncate">← {prev.title}</span>
          </Link>
        ) : (
          <span />
        )}
        {next ? (
          <Link href={`/courses/${id}/${next._id}`} className="btn-primary btn-sm max-w-[55%]" onClick={() => student && item.kind !== 'speaking' && markDone()}>
            <span className="truncate">Next: {next.title} →</span>
          </Link>
        ) : (
          <Link href={`/courses/${id}`} className="btn-primary btn-sm">
            Back to the course
          </Link>
        )}
      </div>
    </div>
  );
}
