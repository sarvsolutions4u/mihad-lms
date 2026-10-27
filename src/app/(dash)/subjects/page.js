'use client';

import { useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/client';
import { classLinkFor } from '@/lib/links';
import { useSession } from '@/components/SessionProvider';
import { PageHeader, Alert, Spinner, Empty, Card } from '@/components/ui';
import SubjectCard from '@/components/SubjectCard';

export default function SubjectsPage() {
  const { user } = useSession();
  const [items, setItems] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api
      .get('/api/subjects')
      .then((r) => setItems(r.items))
      .catch((e) => setError(e.message));
  }, []);

  const groups = useMemo(() => {
    const g = new Map();
    for (const s of items || []) {
      const k = s.classRoom?.name || 'No batch';
      if (!g.has(k)) g.set(k, []);
      g.get(k).push(s);
    }
    return [...g.entries()];
  }, [items]);

  if (error) return <Alert>{error}</Alert>;
  if (!items) return <Spinner />;

  const subtitle = {
    admin: 'Every subject, by batch. Open one to see its students, attendance and material.',
    teacher: 'The subjects you teach. Open one to see your students and mark attendance.',
    student: 'The subjects you are enrolled in.',
    parent: 'The subjects your children are enrolled in.',
  }[user?.role];

  return (
    <>
      <PageHeader title={user?.role === 'admin' ? 'Subjects' : 'My subjects'} subtitle={subtitle} />
      {!items.length ? (
        <Card>
          <Empty
            title="No subjects yet"
            hint={user?.role === 'teacher' ? 'The office assigns subjects to teachers under Classes & Subjects.' : undefined}
          />
        </Card>
      ) : (
        <div className="space-y-8">
          {groups.map(([batch, subs]) => (
            <section key={batch}>
              <h2 className="mb-3 text-xs font-bold uppercase tracking-wider text-slate-500">{batch}</h2>
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {subs.map((s) => (
                  <SubjectCard key={s._id} s={s} link={classLinkFor({ subject: s, classRoom: s.classRoom })} />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </>
  );
}
