'use client';

import { useEffect, useMemo, useState } from 'react';
import { list, create, update, remove, fmtDate } from '@/lib/client';
import { useSession } from '@/components/SessionProvider';
import {
  PageHeader, Card, Table, Modal, Field, Select, Badge, Alert, Spinner, Empty, Confirm, Stat,
} from '@/components/ui';

const STATUS = [
  { value: 'pending', label: 'Pending' },
  { value: 'partial', label: 'Part paid' },
  { value: 'paid', label: 'Paid' },
  { value: 'overdue', label: 'Overdue' },
];

const toneFor = (s) => ({ paid: 'green', overdue: 'red', partial: 'amber', pending: 'slate' }[s] || 'slate');

const blank = { student: '', title: '', amount: 0, paidAmount: 0, currency: 'AED', dueDate: '', paidDate: '', status: 'pending', note: '', receiptNo: '' };

export default function FeesPage() {
  const { user } = useSession();
  const isAdmin = user?.role === 'admin';

  const [rows, setRows] = useState([]);
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [form, setForm] = useState(null);
  const [confirm, setConfirm] = useState(null);

  async function load() {
    setLoading(true);
    try {
      const calls = [list('fees', { sort: 'dueDate', limit: 500 })];
      if (isAdmin) calls.push(list('users', { role: 'student', sort: 'name', limit: 1000 }));
      const res = await Promise.all(calls);
      setRows(res[0].items);
      if (isAdmin) setStudents(res[1].items);
      setError('');
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin]);

  const totals = useMemo(() => {
    const billed = rows.reduce((s, f) => s + (f.amount || 0), 0);
    const paid = rows.reduce((s, f) => s + (f.paidAmount || 0), 0);
    return { billed, paid, due: billed - paid };
  }, [rows]);

  async function save(e) {
    e.preventDefault();
    try {
      const { _id, ...body } = form;
      body.amount = Number(body.amount) || 0;
      body.paidAmount = Number(body.paidAmount) || 0;
      if (body.paidAmount >= body.amount && body.amount > 0) body.status = 'paid';
      else if (body.paidAmount > 0) body.status = 'partial';

      if (_id) await update('fees', _id, body);
      else await create('fees', body);
      setForm(null);
      setNotice('Fee record saved');
      load();
    } catch (err) {
      setError(err.message);
    }
  }

  if (loading) return <Spinner />;

  return (
    <>
      <PageHeader
        title="Fees"
        subtitle={isAdmin ? 'Maintained here by the office. Only parents (and admins) can see these records.' : 'Your fee statement.'}
      >
        {isAdmin && (
          <button className="btn-primary" onClick={() => setForm({ ...blank })}>
            Add fee record
          </button>
        )}
      </PageHeader>

      <Alert onClose={() => setError('')}>{error}</Alert>
      <Alert tone="success" onClose={() => setNotice('')}>
        {notice}
      </Alert>

      <div className="mb-5 grid gap-4 sm:grid-cols-3">
        <Stat label="Total billed" value={`AED ${totals.billed.toLocaleString()}`} />
        <Stat label="Received" value={`AED ${totals.paid.toLocaleString()}`} />
        <Stat label="Outstanding" value={`AED ${totals.due.toLocaleString()}`} />
      </div>

      <Card bodyClass="px-5 py-4">
        <Table
          columns={[
            {
              key: 'student',
              header: 'Student',
              render: (r) => <span className="font-medium text-slate-800">{r.student?.name || '—'}</span>,
            },
            { key: 'title', header: 'Description' },
            {
              key: 'amount',
              header: 'Amount',
              align: 'right',
              render: (r) => `${r.currency || 'AED'} ${(r.amount || 0).toLocaleString()}`,
            },
            {
              key: 'paidAmount',
              header: 'Paid',
              align: 'right',
              render: (r) => `${r.currency || 'AED'} ${(r.paidAmount || 0).toLocaleString()}`,
            },
            { key: 'dueDate', header: 'Due', render: (r) => fmtDate(r.dueDate) },
            { key: 'status', header: 'Status', render: (r) => <Badge tone={toneFor(r.status)}>{r.status}</Badge> },
            ...(isAdmin
              ? [
                  {
                    key: 'actions',
                    header: '',
                    align: 'right',
                    render: (r) => (
                      <div className="flex justify-end gap-2">
                        <button className="btn-ghost btn-sm" onClick={() => setForm({ ...r, student: r.student?._id || r.student })}>
                          Edit
                        </button>
                        <button
                          className="btn-danger btn-sm"
                          onClick={() => setConfirm({ message: `Delete "${r.title}"?`, run: () => remove('fees', r._id) })}
                        >
                          Delete
                        </button>
                      </div>
                    ),
                  },
                ]
              : []),
          ]}
          rows={rows}
          empty={<Empty title="No fee records" hint={isAdmin ? 'Add the first record.' : 'Nothing outstanding right now.'} />}
        />
      </Card>

      <Modal
        open={!!form}
        onClose={() => setForm(null)}
        title={form?._id ? 'Edit fee record' : 'Add fee record'}
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
                options={students.map((s) => ({
                  value: s._id,
                  label: `${s.name}${s.classRoom?.name ? ` — ${s.classRoom.name}` : ''}`,
                }))}
                placeholder="Choose…"
              />
            </Field>

            <Field label="Description">
              <input
                className="input"
                required
                placeholder="Term 1 tuition"
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
              />
            </Field>

            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Amount">
                <input
                  className="input"
                  type="number"
                  min="0"
                  step="0.01"
                  required
                  value={form.amount}
                  onChange={(e) => setForm({ ...form, amount: e.target.value })}
                />
              </Field>
              <Field label="Paid so far">
                <input
                  className="input"
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.paidAmount}
                  onChange={(e) => setForm({ ...form, paidAmount: e.target.value })}
                />
              </Field>
              <Field label="Currency">
                <input className="input" value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })} />
              </Field>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Due date">
                <input className="input" type="date" value={form.dueDate || ''} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} />
              </Field>
              <Field label="Paid date">
                <input className="input" type="date" value={form.paidDate || ''} onChange={(e) => setForm({ ...form, paidDate: e.target.value })} />
              </Field>
              <Field label="Status">
                <Select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} options={STATUS} placeholder="" />
              </Field>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Receipt number">
                <input className="input" value={form.receiptNo} onChange={(e) => setForm({ ...form, receiptNo: e.target.value })} />
              </Field>
              <Field label="Note for the parent">
                <input className="input" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
              </Field>
            </div>
          </form>
        )}
      </Modal>

      <Confirm
        open={!!confirm}
        onClose={() => setConfirm(null)}
        message={confirm?.message}
        onConfirm={async () => {
          await confirm.run();
          setConfirm(null);
          load();
        }}
      />
    </>
  );
}
