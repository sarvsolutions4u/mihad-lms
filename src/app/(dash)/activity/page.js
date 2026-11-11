'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api, list } from '@/lib/client';
import { useSession } from '@/components/SessionProvider';
import { PageHeader, Card, Stat, Badge, Alert, Spinner, Empty, Modal, Select, Tabs } from '@/components/ui';
import { PersonActivity, EventRow, SeenStatus, fmtWhen, fmtMins } from '@/components/Activity';

const PERIODS = [
  { value: '1', label: 'Today' },
  { value: '7', label: 'Last 7 days' },
  { value: '30', label: 'Last 30 days' },
];
const ROLES = [
  { value: 'student', label: 'Students' },
  { value: 'teacher', label: 'Teachers' },
  { value: 'parent', label: 'Parents' },
  { value: 'all', label: 'Everyone' },
];
const LOG_TYPES = [
  { value: '', label: 'Everything' },
  { value: 'signins', label: 'Sign-ins' },
  { value: 'uploads', label: 'Uploads & posts' },
  { value: 'submissions', label: 'Submissions' },
  { value: 'files', label: 'Files opened' },
  { value: 'messages', label: 'Doubts & messages' },
];

export default function ActivityPage() {
  const { user } = useSession();
  const isAdmin = user?.role === 'admin';
  const [tab, setTab] = useState('people');
  const [days, setDays] = useState('7');
  const [role, setRole] = useState('student');
  const [classRoom, setClassRoom] = useState('');
  const [q, setQ] = useState('');
  const [classes, setClasses] = useState([]);
  const [data, setData] = useState(null);
  const [feed, setFeed] = useState(null);
  const [type, setType] = useState('');
  const [open, setOpen] = useState(null);
  const [err, setErr] = useState('');

  useEffect(() => {
    list('classrooms', { sort: 'order name', limit: 100 })
      .then((r) => setClasses(r.items))
      .catch(() => {});
  }, []);

  const params = () => {
    const p = new URLSearchParams({ days });
    if (isAdmin && role !== 'all') p.set('role', role);
    if (classRoom) p.set('classRoom', classRoom);
    return p;
  };

  useEffect(() => {
    if (!user || tab !== 'people') return;
    setData(null);
    const p = params();
    if (q.trim()) p.set('q', q.trim());
    const t = setTimeout(() => {
      api
        .get(`/api/activity?${p}`)
        .then(setData)
        .catch((e) => setErr(e.message));
    }, q ? 300 : 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, tab, days, role, classRoom, q]);

  async function loadFeed(before) {
    const p = params();
    if (type) p.set('type', type);
    if (before) p.set('before', before);
    try {
      const r = await api.get(`/api/activity/feed?${p}`);
      setFeed((f) => (before && f ? { ...r, items: [...f.items, ...r.items] } : r));
    } catch (e) {
      setErr(e.message);
    }
  }

  useEffect(() => {
    if (!user || tab !== 'log') return;
    setFeed(null);
    loadFeed();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, tab, days, role, classRoom, type]);

  if (!user) return <Spinner />;
  if (!['admin', 'teacher'].includes(user.role)) return <Empty title="Activity logs are for trainers and the office" />;
  const t = data?.totals;
  const showRole = isAdmin && role === 'all';

  return (
    <>
      <PageHeader
        title="Activity logs"
        subtitle={
          isAdmin
            ? 'Sign-ins, time spent on the portal, uploads, submissions and files opened — for everyone.'
            : 'Sign-ins, time on the portal and work from the students in your subjects.'
        }
      >
        <Select value={days} onChange={(e) => setDays(e.target.value)} options={PERIODS} placeholder="" />
        {isAdmin && <Select value={role} onChange={(e) => setRole(e.target.value)} options={ROLES} placeholder="" />}
        <Select
          value={classRoom}
          onChange={(e) => setClassRoom(e.target.value)}
          options={classes.map((c) => ({ value: c._id, label: c.name }))}
          placeholder="All batches"
        />
      </PageHeader>

      <Alert onClose={() => setErr('')}>{err}</Alert>

      <Tabs
        tabs={[
          { key: 'people', label: 'People' },
          { key: 'log', label: 'Activity log' },
        ]}
        value={tab}
        onChange={setTab}
      />

      {tab === 'people' && (
        <>
          <div className="mb-5 grid grid-cols-2 gap-4 lg:grid-cols-5">
            <Stat label="Online now" value={t ? t.online : '—'} />
            <Stat label="Active today" value={t ? t.activeToday : '—'} hint={t ? `of ${t.people}` : ''} />
            <Stat label="Sign-ins" value={t ? t.logins : '—'} hint={PERIODS.find((p) => p.value === days)?.label} />
            <Stat label="Uploads & submissions" value={t ? t.uploads : '—'} hint={PERIODS.find((p) => p.value === days)?.label} />
            <Stat label="Never signed in" value={t ? t.neverSignedIn : '—'} />
          </div>

          <Card bodyClass="p-0">
            <div className="border-b border-slate-100 px-5 py-3">
              <input className="input max-w-xs py-1.5" placeholder="Search by name or email" value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
            {!data ? (
              <Spinner />
            ) : !data.people.length ? (
              <Empty title="Nobody here" hint={isAdmin ? undefined : 'Students enrolled in your subjects show here.'} />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm sm:min-w-[860px]">
                  <thead>
                    <tr className="border-b border-slate-100 text-left text-[11px] font-bold uppercase tracking-wide text-slate-500">
                      <th className="px-5 py-2.5">Name</th>
                      <th className="px-3 py-2.5">Status</th>
                      <th className="px-3 py-2.5">Last sign-in</th>
                      <th className="hidden sm:table-cell px-3 py-2.5 text-right">Active today</th>
                      <th className="hidden sm:table-cell px-3 py-2.5 text-right">Active ({PERIODS.find((p) => p.value === days)?.label.toLowerCase()})</th>
                      <th className="hidden sm:table-cell px-3 py-2.5 text-right">Sign-ins</th>
                      <th className="hidden sm:table-cell px-3 py-2.5 text-right">Uploads</th>
                      <th className="hidden sm:table-cell px-3 py-2.5 text-right">Submitted</th>
                      <th className="hidden sm:table-cell px-5 py-2.5 text-right">Files opened</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {data.people.map((p) => (
                      <tr key={p._id} className="cursor-pointer hover:bg-slate-50" onClick={() => setOpen(p)}>
                        <td className="px-5 py-2.5">
                          <p className="font-semibold text-slate-800">{p.name}</p>
                          <p className="text-xs text-slate-400">
                            {showRole && <span className="capitalize">{p.role} · </span>}
                            {p.classRoom?.name || p.email}
                          </p>
                        </td>
                        <td className="px-3 py-2.5">
                          <SeenStatus online={p.online} lastSeenAt={p.lastSeenAt} />
                        </td>
                        <td className="px-3 py-2.5 text-xs text-slate-600">{p.lastLoginAt ? fmtWhen(p.lastLoginAt) : <Badge tone="amber">Never</Badge>}</td>
                        <td className="hidden sm:table-cell px-3 py-2.5 text-right font-semibold text-slate-700">{p.activeToday ? fmtMins(p.activeToday) : '—'}</td>
                        <td className="hidden sm:table-cell px-3 py-2.5 text-right text-slate-700">
                          {p.activeMinutes ? fmtMins(p.activeMinutes) : '—'}
                          {p.activeDays > 0 && <span className="block text-[10px] text-slate-400">{p.activeDays} day{p.activeDays === 1 ? '' : 's'}</span>}
                        </td>
                        <td className="hidden sm:table-cell px-3 py-2.5 text-right">{p.logins || '—'}</td>
                        <td className="hidden sm:table-cell px-3 py-2.5 text-right">{p.uploads || '—'}</td>
                        <td className="hidden sm:table-cell px-3 py-2.5 text-right">{p.submissions || '—'}</td>
                        <td className="hidden sm:table-cell px-5 py-2.5 text-right">{p.opened || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
          <p className="mt-3 text-xs text-slate-500">
            Active time counts minutes a portal tab is open and in use (no input for 5 minutes = idle). Click or tap a person for their day-by-day detail.
          </p>
        </>
      )}

      {tab === 'log' && (
        <Card bodyClass="p-0">
          <div className="flex flex-wrap gap-1.5 border-b border-slate-100 px-5 py-3">
            {LOG_TYPES.map((x) => (
              <button
                key={x.value}
                type="button"
                onClick={() => setType(x.value)}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${type === x.value ? 'bg-maroon text-white' : 'border border-slate-200 bg-white text-slate-600'}`}
              >
                {x.label}
              </button>
            ))}
          </div>
          {!feed ? (
            <Spinner />
          ) : feed.items.length ? (
            <>
              <ul className="divide-y divide-slate-100">
                {feed.items.map((e) => (
                  <EventRow key={e._id} e={e} showUser />
                ))}
              </ul>
              {feed.more && (
                <div className="border-t border-slate-100 p-3 text-center">
                  <button className="btn-ghost btn-sm" onClick={() => loadFeed(feed.next)}>
                    Show older
                  </button>
                </div>
              )}
            </>
          ) : (
            <Empty title="Nothing logged in this period" />
          )}
        </Card>
      )}

      {open && (
        <Modal
          open
          wide
          onClose={() => setOpen(null)}
          title="Activity"
          footer={
            <>
              {open.role === 'student' && (
                <Link href={`/students/${open._id}`} className="btn-ghost">
                  Student page
                </Link>
              )}
              <button className="btn-primary" onClick={() => setOpen(null)}>
                Close
              </button>
            </>
          }
        >
          <PersonActivity userId={open._id} />
        </Modal>
      )}
    </>
  );
}
