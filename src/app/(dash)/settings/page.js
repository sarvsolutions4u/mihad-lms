'use client';

import { useEffect, useState } from 'react';
import { fmtSize } from '@/lib/fileTypes';
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

        {user?.role === 'admin' && <StorageCard />}
      </div>
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Admin: how much space is used                                       */
/* ------------------------------------------------------------------ */

const PURPOSE = { general: 'Notes, papers, plans & assignments', submission: 'Student work', fee: 'Fee receipts & invoices' };

function Meter({ used, total }) {
  const pct = total ? Math.min(100, Math.round((used / total) * 100)) : 0;
  return (
    <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-slate-200">
      <div className={`h-full rounded-full ${pct > 85 ? 'bg-red-600' : pct > 60 ? 'bg-amber-500' : 'bg-gold'}`} style={{ width: `${Math.max(pct, used ? 1 : 0)}%` }} />
    </div>
  );
}

function StorageCard() {
  const [u, setU] = useState(null);
  const [check, setCheck] = useState(null);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get('/api/storage/usage').then(setU).catch((e) => setError(e.message));
  }, []);

  async function runCheck() {
    setChecking(true);
    try {
      setCheck(await api.get('/api/storage/check'));
    } catch (e) {
      setError(e.message);
    } finally {
      setChecking(false);
    }
  }

  const GB = 1024 * 1024 * 1024;
  return (
    <Card title="Storage" className="lg:col-span-2">
      <Alert onClose={() => setError('')}>{error}</Alert>
      {!u ? (
        <Spinner />
      ) : (
        <div className="grid gap-6 md:grid-cols-2">
          <div>
            <p className="text-sm font-semibold text-slate-800">
              Uploaded files — Cloudflare R2{' '}
              {u.r2.configured ? (
                <span className="ml-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-800">Connected</span>
              ) : (
                <span className="ml-1 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-800">Not set up</span>
              )}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              {fmtSize(u.r2.bytes) || '0 KB'} in {u.r2.count} file{u.r2.count === 1 ? '' : 's'} · {u.r2.freeGB} GB free, then about $0.015 per GB a month
            </p>
            <Meter used={u.r2.bytes} total={u.r2.freeGB * GB} />
            {!!u.byPurpose.length && (
              <ul className="mt-3 space-y-1 text-xs text-slate-600">
                {u.byPurpose.map((p) => (
                  <li key={p.purpose} className="flex justify-between">
                    <span>{PURPOSE[p.purpose] || p.purpose}</span>
                    <span>
                      {p.count} · {fmtSize(p.bytes)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-3 text-xs text-slate-500">Largest single upload: {u.r2.configured ? u.r2.maxMB : 4} MB.</p>
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-800">Database — MongoDB Atlas (free, 512 MB)</p>
            <p className="mt-1 text-xs text-slate-500">
              {fmtSize(u.database.bytes) || '0 KB'} used for records
              {u.databaseFiles.count ? ` (incl. ${u.databaseFiles.count} older uploaded file${u.databaseFiles.count === 1 ? '' : 's'}, ${fmtSize(u.databaseFiles.bytes)})` : ''}
            </p>
            <Meter used={u.database.bytes} total={u.database.limitBytes} />
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <button className="btn-ghost btn-sm" onClick={runCheck} disabled={checking}>
                {checking ? 'Checking…' : 'Test file storage'}
              </button>
              {check && (
                <span className={`text-xs font-semibold ${check.configured && check.write && check.read && check.cors ? 'text-emerald-700' : 'text-red-700'}`}>
                  {!check.configured
                    ? 'R2 keys not added yet — files are stored in the database (4 MB limit).'
                    : check.write && check.read && check.cors
                      ? 'All good — uploads and downloads work.'
                      : check.error || 'Something is not set up yet.'}
                </span>
              )}
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}
