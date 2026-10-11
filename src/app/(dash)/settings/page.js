'use client';

import { useState } from 'react';
import { api } from '@/lib/client';
import { useSession, roleLabel } from '@/components/SessionProvider';
import { PageHeader, Card, Field, Alert, Spinner } from '@/components/ui';

export default function SettingsPage() {
  const { user, loading } = useSession();
  const [currentPassword, setCurrent] = useState('');
  const [newPassword, setNew] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setError('');
    setNotice('');
    if (newPassword !== confirm) return setError('The two new passwords do not match');
    setBusy(true);
    try {
      await api.post('/api/auth/password', { currentPassword, newPassword });
      setNotice('Your password has been changed');
      setCurrent('');
      setNew('');
      setConfirm('');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <Spinner />;

  return (
    <>
      <PageHeader title="Settings" subtitle="Your account details and password." />

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Your account">
          <dl className="space-y-3 text-sm">
            {[
              ['Name', user?.name],
              ['Email', user?.email],
              ['Role', roleLabel[user?.role] || user?.role],
              ...(user?.classRoom?.name ? [['Class', user.classRoom.name]] : []),
              ...(user?.admissionNo ? [['Admission number', user.admissionNo]] : []),
              ...(user?.children?.length ? [['Children', user.children.map((c) => c.name).join(', ')]] : []),
            ].map(([k, v]) => (
              <div key={k} className="flex justify-between gap-4 border-b border-slate-100 pb-2.5 last:border-0">
                <dt className="text-slate-500">{k}</dt>
                <dd className="text-right font-medium text-slate-800">{v || '—'}</dd>
              </div>
            ))}
          </dl>
        </Card>

        <Card title="Change password">
          <Alert onClose={() => setError('')}>{error}</Alert>
          <Alert tone="success" onClose={() => setNotice('')}>
            {notice}
          </Alert>

          <form onSubmit={submit} className="space-y-4">
            <Field label="Current password">
              <input
                className="input"
                type="password"
                required
                autoComplete="current-password"
                value={currentPassword}
                onChange={(e) => setCurrent(e.target.value)}
              />
            </Field>
            <Field label="New password" hint="At least 6 characters.">
              <input
                className="input"
                type="password"
                required
                autoComplete="new-password"
                value={newPassword}
                onChange={(e) => setNew(e.target.value)}
              />
            </Field>
            <Field label="Confirm new password">
              <input
                className="input"
                type="password"
                required
                autoComplete="new-password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
              />
            </Field>
            <button className="btn-primary" disabled={busy}>
              {busy ? 'Saving…' : 'Change password'}
            </button>
          </form>
        </Card>
      </div>
    </>
  );
}
