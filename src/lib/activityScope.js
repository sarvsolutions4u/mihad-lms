import mongoose from 'mongoose';
import { todayISO } from '@/lib/api';

/** Start of a Dubai day, as a Date. */
export const dubaiStart = (iso) => new Date(`${iso}T00:00:00+04:00`);

export function periodFrom(days) {
  const n = Math.min(Math.max(Number(days) || 7, 1), 90);
  const d = new Date(`${todayISO()}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - (n - 1));
  return { days: n, fromISO: d.toISOString().slice(0, 10), fromDate: dubaiStart(d.toISOString().slice(0, 10)) };
}

/**
 * Which events a person may see.
 *   admin   — everything
 *   teacher — their own events, and their students' sign-ins plus anything the
 *             student did in the teacher's subjects (submissions, opening the
 *             teacher's files). Nothing from other trainers' subjects.
 */
export function eventScope(ctx) {
  if (ctx.role === 'admin') return {};
  return {
    $or: [
      { user: ctx.uid },
      {
        user: { $in: ctx.studentIds },
        $or: [
          { type: { $in: ['login', 'logout'] } },
          { type: 'submit', subject: { $in: ctx.subjectIds } },
          { type: 'download', $or: [{ fileOwner: ctx.uid }, { subject: { $in: ctx.subjectIds } }] },
        ],
      },
    ],
  };
}

/** Whose activity a person may see. */
export function peopleScope(ctx) {
  if (ctx.role === 'admin') return {};
  return { _id: { $in: ctx.studentIds }, role: 'student' };
}

const oid = (v) => new mongoose.Types.ObjectId(String(v));

/** Aggregation $match needs real ObjectIds (find() casts them, aggregate doesn't). */
export function castScope(scope) {
  const walk = (v, key) => {
    if (Array.isArray(v)) return v.map((x) => walk(x, key));
    if (v && typeof v === 'object' && !(v instanceof Date) && !(v instanceof mongoose.Types.ObjectId)) {
      return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, walk(x, k.startsWith('$') ? key : k)]));
    }
    if (['user', 'subject', 'fileOwner'].includes(key) && typeof v === 'string' && mongoose.Types.ObjectId.isValid(v)) return oid(v);
    return v;
  };
  return walk(scope, '');
}
