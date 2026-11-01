'use client';

import { useEffect, useState } from 'react';
import { api, list } from '@/lib/client';
import { Modal, Spinner, Empty, Table } from '@/components/ui';

/** Enter or view test marks for one session (kind: test). */
export default function MarksModal({ plan, canEdit, onClose, onSaved, onError }) {
  const [students, setStudents] = useState([]);
  const [scores, setScores] = useState({});
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!plan) return;
    setLoading(true);
    Promise.all([
      list('users', { role: 'student', enrolledIn: plan.subject?._id || plan.subject, sort: 'name', limit: 1000 }),
      list('marks', { lessonPlan: plan._id, limit: 500 }),
    ])
      .then(([s, m]) => {
        const only = (plan.students || []).map((x) => String(x?._id || x));
        const items = only.length ? s.items.filter((st) => only.includes(String(st._id))) : s.items;
        setStudents(items);
        const existing = {};
        for (const row of m.items) {
          existing[String(row.student?._id || row.student)] = { score: row.score, remark: row.remark || '' };
        }
        setScores(
          Object.fromEntries(items.map((st) => [String(st._id), existing[String(st._id)] || { score: '', remark: '' }]))
        );
      })
      .catch((e) => onError(e.message))
      .finally(() => setLoading(false));
  }, [plan, onError]);

  async function save() {
    setBusy(true);
    try {
      await api.post('/api/marks/bulk', {
        lessonPlan: plan._id,
        rows: students.map((s) => ({ student: s._id, ...scores[String(s._id)] })),
      });
      onSaved();
    } catch (e) {
      onError(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={!!plan}
      onClose={onClose}
      wide
      title={plan ? `${plan.examTitle || plan.title} — marks` : ''}
      footer={
        canEdit ? (
          <>
            <button className="btn-ghost" onClick={onClose}>
              Cancel
            </button>
            <button className="btn-primary" onClick={save} disabled={busy || loading}>
              {busy ? 'Saving…' : 'Save marks'}
            </button>
          </>
        ) : (
          <button className="btn-ghost" onClick={onClose}>
            Close
          </button>
        )
      }
    >
      {loading ? (
        <Spinner />
      ) : !students.length ? (
        <Empty title="No students in this class" />
      ) : canEdit ? (
        <div className="space-y-2">
          <p className="mb-3 text-xs text-slate-500">
            Out of {plan?.maxMarks || 100}. Leave a box blank to skip that student.
          </p>
          {students.map((s) => {
            const v = scores[String(s._id)] || { score: '', remark: '' };
            return (
              <div key={s._id} className="grid grid-cols-12 items-center gap-2">
                <p className="col-span-5 truncate text-sm text-slate-700">{s.name}</p>
                <input
                  className="input col-span-2 py-1.5 text-center text-sm"
                  type="number"
                  min="0"
                  max={plan?.maxMarks || undefined}
                  value={v.score}
                  onChange={(e) => setScores({ ...scores, [String(s._id)]: { ...v, score: e.target.value } })}
                />
                <input
                  className="input col-span-5 py-1.5 text-xs"
                  placeholder="Remark"
                  value={v.remark}
                  onChange={(e) => setScores({ ...scores, [String(s._id)]: { ...v, remark: e.target.value } })}
                />
              </div>
            );
          })}
        </div>
      ) : (
        <Table
          columns={[
            { key: 'name', header: 'Student', render: (r) => r.name },
            {
              key: 'score',
              header: 'Score',
              align: 'right',
              render: (r) => {
                const v = scores[String(r._id)];
                return v?.score === '' || v?.score === undefined ? '—' : `${v.score} / ${plan?.maxMarks || 100}`;
              },
            },
          ]}
          rows={students}
        />
      )}
    </Modal>
  );
}
