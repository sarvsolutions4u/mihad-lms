'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { api, list, create, update, remove, fmtDate, todayISO } from '@/lib/client';
import { useSession } from '@/components/SessionProvider';
import {
  PageHeader, Card, Table, Modal, Field, Select, Badge, Alert, Spinner, Empty, Confirm, Stat, FileLink, FileList, uploadFile, useUploadLimit,
} from '@/components/ui';
import Icon from '@/components/Icon';
import { ACCEPT } from '@/lib/fileTypes';

const toneFor = (s) => ({ paid: 'green', overdue: 'red', partial: 'amber', pending: 'slate' }[s] || 'slate');
const label = (s) => ({ partial: 'part paid' }[s] || s);
const money = (n, c = 'AED') => `${c} ${(Number(n) || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
const balanceOf = (f) => Math.max(0, (f.amount || 0) - (f.paidAmount || 0));
const METHODS = ['cash', 'card', 'bank transfer', 'cheque', 'online', 'other'].map((m) => ({ value: m, label: m[0].toUpperCase() + m.slice(1) }));

const FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'overdue', label: 'Overdue' },
  { key: 'soon', label: 'Due in 7 days' },
  { key: 'unpaid', label: 'Unpaid' },
  { key: 'paid', label: 'Paid' },
];

const blank = { student: '', title: '', amount: '', currency: 'AED', dueDate: '', note: '' };

export default function FeesPage() {
  const { user } = useSession();
  const isAdmin = user?.role === 'admin';

  const [rows, setRows] = useState([]);
  const [students, setStudents] = useState([]);
  const [alerts, setAlerts] = useState(null);
  const [filter, setFilter] = useState('all');
  const [studentId, setStudentId] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [form, setForm] = useState(null);
  const [openId, setOpenId] = useState(null);
  const [confirm, setConfirm] = useState(null);

  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    if (p.get('student')) setStudentId(p.get('student'));
    if (p.get('filter')) setFilter(p.get('filter'));
  }, []);

  async function load() {
    setLoading(true);
    try {
      const calls = [list('fees', { sort: 'dueDate', limit: 1000 })];
      if (isAdmin) calls.push(list('users', { role: 'student', sort: 'name', limit: 1000 }), api.get('/api/alerts'));
      const res = await Promise.all(calls);
      setRows(res[0].items);
      if (isAdmin) {
        setStudents(res[1].items);
        setAlerts(res[2]);
      }
      setError('');
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (user) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin, user]);

  const today = todayISO();
  const in7 = useMemo(() => {
    const d = new Date(`${today}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + 7);
    return d.toISOString().slice(0, 10);
  }, [today]);

  const shown = useMemo(
    () =>
      rows.filter((f) => {
        if (studentId && String(f.student?._id || f.student) !== studentId) return false;
        if (filter === 'overdue') return f.status === 'overdue';
        if (filter === 'soon') return f.status !== 'paid' && f.status !== 'overdue' && f.dueDate && f.dueDate >= today && f.dueDate <= in7;
        if (filter === 'unpaid') return f.status !== 'paid';
        if (filter === 'paid') return f.status === 'paid';
        return true;
      }),
    [rows, filter, studentId, today, in7]
  );

  const totals = useMemo(() => {
    const billed = shown.reduce((s, f) => s + (f.amount || 0), 0);
    const paid = shown.reduce((s, f) => s + (f.paidAmount || 0), 0);
    return { billed, paid, due: shown.reduce((s, f) => s + balanceOf(f), 0) };
  }, [shown]);

  async function save(e) {
    e.preventDefault();
    try {
      const { _id, ...body } = form;
      body.amount = Number(body.amount) || 0;
      for (const k of ['payments', 'attachments', 'paidAmount', 'status', 'createdAt', 'updatedAt', '__v']) delete body[k];
      if (typeof body.student === 'object') body.student = body.student?._id;
      let saved;
      if (_id) saved = await update('fees', _id, body);
      else saved = await create('fees', body);
      setForm(null);
      setNotice(_id ? 'Fee updated' : 'Fee added — record a payment or attach the invoice below.');
      await load();
      if (!_id) setOpenId(saved.item._id);
    } catch (err) {
      setError(err.message);
    }
  }

  if (loading && !rows.length) return <Spinner />;

  const open = rows.find((r) => r._id === openId);
  const studentName = studentId && (students.find((s) => s._id === studentId)?.name || rows.find((r) => String(r.student?._id) === studentId)?.student?.name);

  return (
    <>
      <PageHeader
        title="Fees"
        subtitle={isAdmin ? 'Bills, payments and receipts. Parents see their own child’s records and can download receipts.' : 'Your fee statement and receipts.'}
      >
        {isAdmin && (
          <button className="btn-primary" onClick={() => setForm({ ...blank, student: studentId })}>
            Add fee
          </button>
        )}
      </PageHeader>

      <Alert onClose={() => setError('')}>{error}</Alert>
      <Alert tone="success" onClose={() => setNotice('')}>
        {notice}
      </Alert>

      {isAdmin && alerts && alerts.count > 0 && (
        <div className="mb-5 flex flex-col gap-3 rounded-xl border border-red-200 bg-red-50 px-5 py-4 sm:flex-row sm:items-center">
          <Icon name="bell" className="h-5 w-5 shrink-0 text-red-600" />
          <p className="flex-1 text-sm text-red-900">
            {alerts.overdue.length > 0 && (
              <>
                <strong>{alerts.overdue.length} overdue</strong> ({money(alerts.overdueTotal)})
              </>
            )}
            {alerts.overdue.length > 0 && alerts.dueSoon.length > 0 && ' · '}
            {alerts.dueSoon.length > 0 && (
              <>
                <strong>{alerts.dueSoon.length} due in the next 7 days</strong> ({money(alerts.dueSoonTotal)})
              </>
            )}
          </p>
          <div className="flex gap-2">
            {alerts.overdue.length > 0 && (
              <button className="btn-danger btn-sm" onClick={() => setFilter('overdue')}>
                Show overdue
              </button>
            )}
            {alerts.dueSoon.length > 0 && (
              <button className="btn-ghost btn-sm" onClick={() => setFilter('soon')}>
                Show due soon
              </button>
            )}
          </div>
        </div>
      )}

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1.5">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={`rounded-lg px-3.5 py-2 text-sm font-semibold transition-colors ${
                filter === f.key ? 'bg-maroon text-white' : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-100'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
        {isAdmin && (
          <div className="w-64">
            <Select
              value={studentId}
              onChange={(e) => setStudentId(e.target.value)}
              options={students.map((s) => ({ value: s._id, label: s.name }))}
              placeholder="All students"
            />
          </div>
        )}
      </div>

      {studentName && (
        <p className="mb-3 text-sm text-slate-600">
          Showing fees for <strong>{studentName}</strong>.{' '}
          <button className="font-semibold text-maroon hover:underline" onClick={() => setStudentId('')}>
            Show everyone
          </button>
        </p>
      )}

      <div className="mb-5 grid gap-4 sm:grid-cols-3">
        <Stat label="Billed" value={money(totals.billed)} />
        <Stat label="Received" value={money(totals.paid)} />
        <Stat label="Outstanding" value={money(totals.due)} />
      </div>

      <Card bodyClass="px-5 py-4">
        <Table
          columns={[
            {
              key: 'student',
              header: 'Student',
              render: (r) =>
                r.student?._id ? (
                  <Link href={`/students/${r.student._id}`} className="font-medium text-slate-800 hover:text-maroon hover:underline">
                    {r.student.name}
                  </Link>
                ) : (
                  '—'
                ),
            },
            { key: 'title', header: 'Description' },
            { key: 'amount', header: 'Amount', align: 'right', render: (r) => <span className="whitespace-nowrap">{money(r.amount, r.currency)}</span> },
            { key: 'paidAmount', header: 'Paid', align: 'right', render: (r) => <span className="whitespace-nowrap">{money(r.paidAmount, r.currency)}</span> },
            {
              key: 'balance',
              header: 'Balance',
              align: 'right',
              render: (r) => <span className={`whitespace-nowrap ${balanceOf(r) ? 'font-semibold text-maroon' : 'text-slate-400'}`}>{money(balanceOf(r), r.currency)}</span>,
            },
            { key: 'dueDate', header: 'Due', render: (r) => <span className="whitespace-nowrap">{fmtDate(r.dueDate)}</span> },
            { key: 'status', header: 'Status', render: (r) => <Badge tone={toneFor(r.status)}>{label(r.status)}</Badge> },
            {
              key: 'files',
              header: 'Receipts',
              render: (r) => {
                const n = (r.payments || []).filter((p) => p.receipt?.url).length + (r.attachments || []).length;
                return n ? <Badge tone="maroon">{n} file{n === 1 ? '' : 's'}</Badge> : <span className="text-xs text-slate-400">—</span>;
              },
            },
            {
              key: 'actions',
              header: '',
              align: 'right',
              render: (r) => (
                <div className="flex justify-end gap-2">
                  <button className={isAdmin && r.status !== 'paid' ? 'btn-gold btn-sm' : 'btn-ghost btn-sm'} onClick={() => setOpenId(r._id)}>
                    {isAdmin ? (r.status === 'paid' ? 'View' : 'Payments') : 'View'}
                  </button>
                  {isAdmin && (
                    <>
                      <button className="btn-ghost btn-sm" onClick={() => setForm({ ...r, student: r.student?._id || r.student })}>
                        Edit
                      </button>
                      <button
                        className="btn-danger btn-sm"
                        onClick={() => setConfirm({ message: `Delete "${r.title}" for ${r.student?.name || 'this student'}? Its payments and receipts go too.`, run: () => remove('fees', r._id) })}
                      >
                        Delete
                      </button>
                    </>
                  )}
                </div>
              ),
            },
          ]}
          rows={shown}
          empty={<Empty title="No fee records here" hint={isAdmin ? 'Add a fee, or change the filter.' : 'Nothing to show right now.'} />}
        />
      </Card>

      {/* ---- add / edit ---- */}
      <Modal
        open={!!form}
        onClose={() => setForm(null)}
        title={form?._id ? 'Edit fee' : 'Add fee'}
        wide
        footer={
          <>
            <button className="btn-ghost" onClick={() => setForm(null)}>
              Cancel
            </button>
            <button className="btn-primary" form="fee-form">
              Save
            </button>
          </>
        }
      >
        {form && (
          <form id="fee-form" onSubmit={save} className="space-y-4">
            <Field label="Student">
              <Select
                required
                value={form.student}
                onChange={(e) => setForm({ ...form, student: e.target.value })}
                options={students.map((s) => ({ value: s._id, label: `${s.name}${s.classRoom?.name ? ` — ${s.classRoom.name}` : ''}` }))}
                placeholder="Choose…"
              />
            </Field>
            <Field label="Description">
              <input className="input" required placeholder="GED course fee — instalment 1" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
            </Field>
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Amount">
                <input className="input" type="number" min="0" step="0.01" required value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
              </Field>
              <Field label="Currency">
                <input className="input" value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })} />
              </Field>
              <Field label="Due date" hint="Alerts start 7 days before.">
                <input className="input" type="date" value={form.dueDate || ''} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} />
              </Field>
            </div>
            <Field label="Note for the parent">
              <input className="input" value={form.note || ''} onChange={(e) => setForm({ ...form, note: e.target.value })} />
            </Field>
            <p className="rounded-lg bg-slate-50 px-4 py-3 text-xs text-slate-500">
              Payments and receipts are added from the fee’s <strong>Payments</strong> window — the paid amount and status update by themselves.
            </p>
          </form>
        )}
      </Modal>

      {open && (
        <FeeDetail
          fee={open}
          isAdmin={isAdmin}
          onClose={() => setOpenId(null)}
          onChanged={async (msg) => {
            if (msg) setNotice(msg);
            await load();
          }}
          onError={setError}
        />
      )}

      <Confirm
        open={!!confirm}
        onClose={() => setConfirm(null)}
        message={confirm?.message}
        onConfirm={async () => {
          try {
            await confirm.run();
            setConfirm(null);
            load();
          } catch (e) {
            setError(e.message);
            setConfirm(null);
          }
        }}
      />
    </>
  );
}

/* ------------------------------------------------------------------ */
/* One fee: payments with receipts, invoices, record a payment          */
/* ------------------------------------------------------------------ */

function FeeDetail({ fee, isAdmin, onClose, onChanged, onError }) {
  const studentId = fee.student?._id || fee.student;
  const balance = balanceOf(fee);
  const blankPay = () => ({ amount: balance || '', date: todayISO(), method: 'cash', receiptNo: '', note: '', receipt: null });
  const [pay, setPay] = useState(blankPay());
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [pct, setPct] = useState(0);
  const [err, setErr] = useState('');
  const [removeIdx, setRemoveIdx] = useState(null);
  const limit = useUploadLimit();

  useEffect(() => {
    setPay(blankPay());
    setFile(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fee._id, fee.paidAmount]);

  const existing = () => {
    const list = (fee.payments || []).map(({ _id, ...p }) => ({ _id, ...p }));
    // money recorded before payments were tracked one by one
    if (!list.length && (fee.paidAmount || 0) > 0) {
      list.push({ amount: fee.paidAmount, date: fee.paidDate || '', method: 'other', receiptNo: fee.receiptNo || '', note: 'Paid before payment tracking' });
    }
    return list;
  };

  async function recordPayment(e) {
    e.preventDefault();
    setErr('');
    const amount = Number(pay.amount);
    if (!(amount > 0)) return setErr('Enter the amount received');
    setBusy(true);
    try {
      let receipt;
      if (file) {
        const up = await uploadFile(file, { purpose: 'fee', student: studentId, onProgress: setPct });
        receipt = { url: up.url, name: up.fileName, size: up.size };
      }
      const payment = { amount, date: pay.date, method: pay.method, receiptNo: pay.receiptNo, note: pay.note, ...(receipt ? { receipt } : {}) };
      await update('fees', fee._id, { payments: [...existing(), payment] });
      await onChanged(`Payment of ${money(amount, fee.currency)} recorded${receipt ? ' with receipt' : ''}`);
    } catch (e2) {
      setErr(e2.message);
    } finally {
      setBusy(false);
    }
  }

  async function deletePayment(idx) {
    try {
      const next = existing().filter((_, i) => i !== idx);
      await update('fees', fee._id, { payments: next, ...(next.length ? {} : { paidAmount: 0 }) });
      setRemoveIdx(null);
      await onChanged('Payment removed');
    } catch (e) {
      onError(e.message);
    }
  }

  async function saveAttachments(list) {
    try {
      await update('fees', fee._id, { attachments: list });
      await onChanged('Documents updated');
    } catch (e) {
      onError(e.message);
    }
  }

  const payments = fee.payments?.length ? fee.payments : existing();

  return (
    <Modal open onClose={onClose} wide title={`${fee.title} — ${fee.student?.name || ''}`}>
      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Mini label="Amount" value={money(fee.amount, fee.currency)} />
        <Mini label="Paid" value={money(fee.paidAmount, fee.currency)} />
        <Mini label="Balance" value={money(balance, fee.currency)} strong={balance > 0} />
        <Mini label="Status" value={<Badge tone={toneFor(fee.status)}>{label(fee.status)}</Badge>} sub={fee.dueDate ? `due ${fmtDate(fee.dueDate)}` : ''} />
      </div>
      {fee.note && <p className="mb-4 rounded-lg bg-cream-50 px-4 py-2.5 text-sm text-slate-700">{fee.note}</p>}

      <h4 className="label">Payments</h4>
      {payments.length ? (
        <ul className="mb-5 divide-y divide-slate-100 rounded-lg border border-slate-200">
          {payments.map((p, i) => (
            <li key={p._id || i} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
              <div className="min-w-[8rem]">
                <p className="text-sm font-bold text-maroon">{money(p.amount, fee.currency)}</p>
                <p className="text-xs text-slate-500">
                  {fmtDate(p.date)} · {p.method}
                  {p.receiptNo ? ` · #${p.receiptNo}` : ''}
                </p>
                {p.note && <p className="text-xs text-slate-400">{p.note}</p>}
              </div>
              <div className="flex-1">
                {p.receipt?.url ? (
                  <FileLink url={p.receipt.url} name={p.receipt.name || 'Receipt'} size={p.receipt.size} />
                ) : (
                  <span className="text-xs text-slate-400">No receipt file</span>
                )}
              </div>
              {isAdmin && fee.payments?.length > 0 && (
                removeIdx === i ? (
                  <span className="flex items-center gap-2 text-xs">
                    Remove?
                    <button className="btn-danger btn-sm" onClick={() => deletePayment(i)}>
                      Yes
                    </button>
                    <button className="btn-ghost btn-sm" onClick={() => setRemoveIdx(null)}>
                      No
                    </button>
                  </span>
                ) : (
                  <button className="text-xs font-semibold text-red-700 hover:underline" onClick={() => setRemoveIdx(i)}>
                    Remove
                  </button>
                )
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mb-5 rounded-lg border border-dashed border-slate-300 px-4 py-3 text-sm text-slate-500">No payments recorded yet.</p>
      )}

      {isAdmin && balance > 0 && (
        <form onSubmit={recordPayment} className="mb-5 space-y-3 rounded-xl border border-gold-100 bg-gold-50/50 p-4">
          <h4 className="text-sm font-bold text-maroon">Record a payment</h4>
          <div className="grid gap-3 sm:grid-cols-4">
            <Field label="Amount">
              <input className="input" type="number" min="0.01" step="0.01" required value={pay.amount} onChange={(e) => setPay({ ...pay, amount: e.target.value })} />
            </Field>
            <Field label="Date">
              <input className="input" type="date" required value={pay.date} onChange={(e) => setPay({ ...pay, date: e.target.value })} />
            </Field>
            <Field label="Method">
              <Select value={pay.method} onChange={(e) => setPay({ ...pay, method: e.target.value })} options={METHODS} placeholder="" />
            </Field>
            <Field label="Receipt no">
              <input className="input" value={pay.receiptNo} onChange={(e) => setPay({ ...pay, receiptNo: e.target.value })} />
            </Field>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={`Receipt file (PDF or photo, up to ${limit.maxMB} MB)`}>
              <input
                type="file"
                accept={ACCEPT}
                onChange={(e) => setFile(e.target.files?.[0] || null)}
                className="block w-full text-xs text-slate-500 file:mr-3 file:rounded-md file:border-0 file:bg-maroon-50 file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-maroon hover:file:bg-maroon-100"
              />
            </Field>
            <Field label="Note">
              <input className="input" value={pay.note} onChange={(e) => setPay({ ...pay, note: e.target.value })} />
            </Field>
          </div>
          {err && <p className="text-xs font-medium text-red-700">{err}</p>}
          <div className="flex justify-end">
            <button className="btn-primary" disabled={busy}>
              {busy ? (file && pct < 100 ? `Uploading ${pct}%…` : 'Saving…') : 'Save payment'}
            </button>
          </div>
        </form>
      )}

      <h4 className="label">Invoices & documents</h4>
      {isAdmin ? (
        <FileList value={fee.attachments || []} onChange={saveAttachments} name="" purpose="fee" student={studentId} />
      ) : fee.attachments?.length ? (
        <div className="flex flex-wrap gap-2">
          {fee.attachments.map((a, i) => (
            <FileLink key={i} url={a.url} name={a.name} size={a.size} />
          ))}
        </div>
      ) : (
        <p className="text-sm text-slate-500">None.</p>
      )}
    </Modal>
  );
}

function Mini({ label: l, value, sub, strong }) {
  return (
    <div className="rounded-lg bg-slate-50 px-3 py-2.5">
      <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">{l}</p>
      <div className={`mt-0.5 text-sm font-bold ${strong ? 'text-red-700' : 'text-maroon'}`}>{value}</div>
      {sub && <p className="text-[11px] text-slate-400">{sub}</p>}
    </div>
  );
}
