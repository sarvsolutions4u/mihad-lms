'use client';

import { Suspense, useCallback, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useSession } from '@/components/SessionProvider';
import { PageHeader, Spinner, Empty } from '@/components/ui';
import Icon from '@/components/Icon';
import { ThreadRow, ThreadView, NewMessageDialog, LEARNERS } from '@/components/Messages';
import { list } from '@/lib/client';

const VIEWS = [
  { key: 'all', label: 'All' },
  { key: 'doubt', label: 'Doubts' },
  { key: 'unread', label: 'Unread' },
];

function MessagesInner() {
  const { user } = useSession();
  const router = useRouter();
  const sp = useSearchParams();
  const selected = sp.get('t') || '';
  const isAdmin = user?.role === 'admin';

  const [view, setView] = useState('all');
  const [status, setStatus] = useState('');
  const [box, setBox] = useState('all');
  const [teacher, setTeacher] = useState('');
  const [teachers, setTeachers] = useState([]);
  const [q, setQ] = useState('');
  const [data, setData] = useState(null);
  const [older, setOlder] = useState([]);
  const [composing, setComposing] = useState(false);

  useEffect(() => {
    if (!isAdmin) return;
    list('users', { role: 'teacher', sort: 'name', limit: 200 })
      .then((r) => setTeachers(r.items))
      .catch(() => {});
  }, [isAdmin]);

  const params = useCallback(() => {
    const p = new URLSearchParams();
    if (view === 'doubt') p.set('kind', 'doubt');
    if (view === 'unread') p.set('unread', '1');
    if (status) p.set('status', status);
    if (isAdmin && box === 'mine') p.set('box', 'mine');
    if (isAdmin && teacher) p.set('teacher', teacher);
    if (q.trim()) p.set('q', q.trim());
    return p;
  }, [view, status, box, teacher, q, isAdmin]);

  const load = useCallback(async () => {
    const r = await fetch(`/api/messages?${params()}`, { cache: 'no-store' });
    const d = await r.json();
    if (d.ok) {
      setData(d);
      setOlder([]);
    }
  }, [params]);

  useEffect(() => {
    if (!user) return;
    const t = setTimeout(load, q ? 300 : 0);
    const poll = setInterval(() => document.visibilityState === 'visible' && load(), 30000);
    const onChange = () => load();
    window.addEventListener('messages:changed', onChange);
    return () => {
      clearTimeout(t);
      clearInterval(poll);
      window.removeEventListener('messages:changed', onChange);
    };
  }, [user, load, q]);

  async function more() {
    const p = params();
    const last = older.length ? older[older.length - 1] : data.threads[data.threads.length - 1];
    p.set('before', last.lastMessageAt);
    const d = await (await fetch(`/api/messages?${p}`)).json();
    if (d.ok) setOlder((o) => [...o, ...d.threads]);
  }

  const open = (id) => router.replace(id ? `/messages?t=${id}` : '/messages', { scroll: false });

  if (!user) return <Spinner />;
  const threads = data ? [...data.threads, ...older] : [];
  const subtitle = LEARNERS.includes(user.role)
    ? 'Ask your trainers about anything in your notes. Tip: select text in a PDF or use “Snip & ask”.'
    : user.role === 'teacher'
      ? 'Doubts and messages from the students in your subjects.'
      : 'Every conversation between students, parents, trainers and the office.';

  return (
    <>
      <PageHeader title="Messages & Doubts" subtitle={subtitle}>
        <button className="btn-primary" onClick={() => setComposing(true)}>
          <Icon name="plus" className="h-4 w-4" /> New message
        </button>
      </PageHeader>

      {data && (
        <div className="mb-4 flex flex-wrap gap-2 text-xs">
          <span className="rounded-full bg-red-50 px-3 py-1 font-semibold text-red-700">{data.unread} unread</span>
          <span className="rounded-full bg-gold-50 px-3 py-1 font-semibold text-gold-600">
            {data.openDoubts} open doubt{data.openDoubts === 1 ? '' : 's'}
            {user.role === 'teacher' ? ' waiting for you' : ''}
          </span>
        </div>
      )}

      <div className="card grid h-[calc(100dvh-14rem)] min-h-[480px] grid-cols-1 overflow-hidden lg:grid-cols-[22rem_1fr]">
        <aside className={`flex min-h-0 flex-col border-r border-slate-200 ${selected ? 'hidden lg:flex' : 'flex'}`}>
          <div className="space-y-2 border-b border-slate-200 p-3">
            <div className="flex gap-1">
              {VIEWS.map((v) => (
                <button
                  key={v.key}
                  type="button"
                  onClick={() => setView(v.key)}
                  className={`notap rounded-lg px-3 py-1.5 text-xs font-semibold [@media(pointer:coarse)]:py-2.5 ${view === v.key ? 'bg-maroon text-white' : 'text-slate-600 hover:bg-slate-100'}`}
                >
                  {v.label}
                </button>
              ))}
              <select className="input ml-auto w-auto py-1 text-xs" value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status">
                <option value="">Any status</option>
                <option value="open">Open</option>
                <option value="resolved">Answered</option>
              </select>
            </div>
            {isAdmin && (
              <div className="flex gap-2">
                <select className="input py-1 text-xs" value={box} onChange={(e) => setBox(e.target.value)} aria-label="Which conversations">
                  <option value="all">All conversations</option>
                  <option value="mine">Office inbox</option>
                </select>
                <select className="input py-1 text-xs" value={teacher} onChange={(e) => setTeacher(e.target.value)} aria-label="Trainer">
                  <option value="">All trainers</option>
                  {teachers.map((t) => (
                    <option key={t._id} value={t._id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <input className="input py-1.5 text-sm" placeholder="Search" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {!data ? (
              <Spinner />
            ) : !threads.length ? (
              <Empty title="No conversations here" hint={LEARNERS.includes(user.role) ? 'Open your notes and select a line to raise your first doubt.' : undefined} />
            ) : (
              <ul className="divide-y divide-slate-100">
                {threads.map((t) => (
                  <ThreadRow key={t._id} t={t} me={user} active={t._id === selected} onClick={() => open(t._id)} />
                ))}
                {data.more && older.length === 0 && (
                  <li className="p-3 text-center">
                    <button className="btn-ghost btn-sm" onClick={more}>
                      Show older
                    </button>
                  </li>
                )}
              </ul>
            )}
          </div>
        </aside>
        <section className={`min-h-0 min-w-0 ${selected ? 'flex' : 'hidden lg:flex'} flex-col`}>
          {selected ? (
            <ThreadView key={selected} id={selected} me={user} onBack={() => open('')} onChanged={load} />
          ) : (
            <div className="grid h-full place-items-center p-8 text-center text-sm text-slate-500">
              <div>
                <Icon name="chat" className="mx-auto mb-2 h-8 w-8 text-slate-300" />
                Choose a conversation
              </div>
            </div>
          )}
        </section>
      </div>

      {composing && (
        <NewMessageDialog
          me={user}
          onClose={() => setComposing(false)}
          onCreated={(id) => {
            setComposing(false);
            load();
            open(id);
          }}
        />
      )}
    </>
  );
}

export default function MessagesPage() {
  return (
    <Suspense fallback={<Spinner />}>
      <MessagesInner />
    </Suspense>
  );
}
