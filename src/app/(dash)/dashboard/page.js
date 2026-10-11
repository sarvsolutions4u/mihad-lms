'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api, fmtDate } from '@/lib/client';
import { useSession } from '@/components/SessionProvider';
import { PageHeader, Card, Stat, Badge, Empty, Spinner, Alert } from '@/components/ui';
import Icon from '@/components/Icon';

export default function DashboardPage() {
  const { user } = useSession();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get('/api/dashboard').then(setData).catch((e) => setError(e.message));
  }, []);

  if (error) return <Alert>{error}</Alert>;
  if (!data) return <Spinner />;

  const greeting = (() => {
    const h = new Date().getHours();
    if (h < 12) return 'Good morning';
    if (h < 17) return 'Good afternoon';
    return 'Good evening';
  })();

  return (
    <>
      <PageHeader
        title={`${greeting}${user?.name ? `, ${user.name.split(' ')[0]}` : ''}`}
        subtitle={`${data.dayName}, ${fmtDate(data.today)} · week beginning ${fmtDate(data.weekOf)}`}
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {data.stats.map((s) => (
          <Stat key={s.label} {...s} />
        ))}
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card title="Today's classes" bodyClass="">
            {data.sections.todayClasses?.length ? (
              <ul className="divide-y divide-slate-100">
                {data.sections.todayClasses.map((slot) => {
                  const link = slot.onlineClassLink || slot.subject?.onlineClassLink || slot.classRoom?.onlineClassLink;
                  return (
                    <li key={slot._id} className="flex items-center gap-4 px-5 py-3.5">
                      <div className="w-24 shrink-0">
                        <p className="text-sm font-bold text-maroon">{slot.startTime}</p>
                        <p className="text-[11px] text-slate-400">{slot.endTime}</p>
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-slate-800">
                          {slot.subject?.name || 'Subject'}
                        </p>
                        <p className="truncate text-xs text-slate-500">
                          {slot.classRoom?.name}
                          {slot.teacher?.name ? ` · ${slot.teacher.name}` : ''}
                          {slot.room ? ` · ${slot.room}` : ''}
                        </p>
                      </div>
                      {link && (
                        <a href={link} target="_blank" rel="noreferrer" className="btn-gold btn-sm">
                          <Icon name="link" className="h-3.5 w-3.5" />
                          Join
                        </a>
                      )}
                    </li>
                  );
                })}
              </ul>
            ) : (
              <Empty title="No classes scheduled today" hint="The timetable is maintained by the administrator." />
            )}
          </Card>

          {data.sections.weekPlans && (
            <Card
              title="This week's lesson plans"
              action={
                <Link href="/lesson-plans" className="text-xs font-semibold text-maroon hover:text-gold-600">
                  View all →
                </Link>
              }
              bodyClass=""
            >
              {data.sections.weekPlans.length ? (
                <ul className="divide-y divide-slate-100">
                  {data.sections.weekPlans.slice(0, 7).map((p) => (
                    <li key={p._id} className="px-5 py-3.5">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-slate-800">{p.title}</p>
                          <p className="truncate text-xs text-slate-500">
                            {p.subject?.name}
                            {p.classRoom?.name ? ` · ${p.classRoom.name}` : ''}
                            {p.teacher?.name ? ` · ${p.teacher.name}` : ''}
                          </p>
                        </div>
                        <div className="flex shrink-0 flex-wrap justify-end gap-1.5">
                          <Badge tone={p.portionCompleted ? 'green' : 'slate'}>
                            {p.portionCompleted ? 'Portion done' : 'In progress'}
                          </Badge>
                          {p.notesGiven && <Badge tone="maroon">Notes given</Badge>}
                          {p.examDone && <Badge tone="gold">Exam done</Badge>}
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <Empty
                  title="No plans uploaded for this week yet"
                  hint={user?.role === 'teacher' ? 'Add your weekly plan from the Lesson Plans page.' : undefined}
                />
              )}
            </Card>
          )}

          {data.sections.upcoming && (
            <Card title="Upcoming deadlines" bodyClass="">
              {data.sections.upcoming.length ? (
                <ul className="divide-y divide-slate-100">
                  {data.sections.upcoming.map((t) => (
                    <li key={t._id} className="flex items-center justify-between gap-3 px-5 py-3.5">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-slate-800">{t.title}</p>
                        <p className="text-xs text-slate-500">
                          {t.subject?.name} · {t.type}
                        </p>
                      </div>
                      <Badge tone="amber">{fmtDate(t.deadline)}</Badge>
                    </li>
                  ))}
                </ul>
              ) : (
                <Empty title="Nothing due right now" />
              )}
            </Card>
          )}
        </div>

        <div className="space-y-6">
          <Card
            title="Announcements"
            action={
              <Link href="/announcements" className="text-xs font-semibold text-maroon hover:text-gold-600">
                All →
              </Link>
            }
            bodyClass=""
          >
            {data.sections.announcements?.length ? (
              <ul className="divide-y divide-slate-100">
                {data.sections.announcements.map((a) => (
                  <li key={a._id} className="px-5 py-3.5">
                    <div className="flex items-center gap-2">
                      {a.pinned && <Badge tone="gold">Pinned</Badge>}
                      <p className="truncate text-sm font-semibold text-slate-800">{a.title}</p>
                    </div>
                    <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-slate-500">{a.body}</p>
                    <p className="mt-1.5 text-[11px] text-slate-400">{fmtDate(a.createdAt)}</p>
                  </li>
                ))}
              </ul>
            ) : (
              <Empty title="No announcements" />
            )}
          </Card>

          {data.sections.children && (
            <Card title="My children" bodyClass="">
              <ul className="divide-y divide-slate-100">
                {data.sections.children.map((c) => (
                  <li key={c._id} className="flex items-center justify-between px-5 py-3.5">
                    <div>
                      <p className="text-sm font-semibold text-slate-800">{c.name}</p>
                      <p className="text-xs text-slate-500">
                        {c.classRoom?.name}
                        {c.admissionNo ? ` · ${c.admissionNo}` : ''}
                      </p>
                    </div>
                    <Link href={`/reports?student=${c._id}`} className="btn-ghost btn-sm">
                      Report
                    </Link>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          {data.sections.recentMarks && (
            <Card title="Recent marks" bodyClass="">
              {data.sections.recentMarks.length ? (
                <ul className="divide-y divide-slate-100">
                  {data.sections.recentMarks.map((m) => (
                    <li key={m._id} className="flex items-center justify-between gap-3 px-5 py-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-slate-800">
                          {m.examTitle || 'Test'}
                        </p>
                        <p className="text-xs text-slate-500">
                          {m.subject?.name}
                          {user?.role === 'parent' && m.student?.name ? ` · ${m.student.name}` : ''}
                        </p>
                      </div>
                      <span className="shrink-0 text-sm font-bold text-maroon">
                        {m.score}
                        <span className="text-slate-400">/{m.maxScore}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <Empty title="No marks recorded yet" />
              )}
            </Card>
          )}

          {data.sections.fees && (
            <Card
              title="Fees"
              action={
                <Link href="/fees" className="text-xs font-semibold text-maroon hover:text-gold-600">
                  Details →
                </Link>
              }
              bodyClass=""
            >
              {data.sections.fees.length ? (
                <ul className="divide-y divide-slate-100">
                  {data.sections.fees.slice(0, 5).map((f) => (
                    <li key={f._id} className="flex items-center justify-between gap-3 px-5 py-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-slate-800">{f.title}</p>
                        <p className="text-xs text-slate-500">
                          {f.student?.name} · due {fmtDate(f.dueDate)}
                        </p>
                      </div>
                      <Badge tone={f.status === 'paid' ? 'green' : f.status === 'overdue' ? 'red' : 'amber'}>
                        {f.status}
                      </Badge>
                    </li>
                  ))}
                </ul>
              ) : (
                <Empty title="No fee records" />
              )}
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
