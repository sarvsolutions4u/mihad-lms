import mongoose from 'mongoose';
import { dbConnect } from '@/lib/db';
import { User, Activity, DailyActive } from '@/models';
import { requireSession } from '@/lib/auth';
import { getActorContext } from '@/lib/access';
import { ONLINE_WINDOW_MS } from '@/lib/activity';
import { periodFrom, eventScope, peopleScope, castScope } from '@/lib/activityScope';
import { ok, handleError, todayISO } from '@/lib/api';

export const dynamic = 'force-dynamic';

/**
 * GET /api/activity?days=7&role=student&classRoom=..&q=..
 * One row per person: last sign-in, last seen / online, active minutes (today and
 * in the period), sign-ins, uploads, submissions and files opened.
 *   admin   — everyone
 *   teacher — the students enrolled in their subjects
 */
export async function GET(req) {
  try {
    const session = await requireSession(['admin', 'teacher']);
    await dbConnect();
    const ctx = await getActorContext(session);
    const sp = new URL(req.url).searchParams;
    const { days, fromISO, fromDate } = periodFrom(sp.get('days'));
    const today = todayISO();

    const filter = { ...peopleScope(ctx) };
    const role = sp.get('role');
    if (session.role === 'admin' && ['student', 'teacher', 'parent', 'admin'].includes(role)) filter.role = role;
    if (sp.get('classRoom') && mongoose.Types.ObjectId.isValid(sp.get('classRoom'))) filter.classRoom = sp.get('classRoom');
    const q = (sp.get('q') || '').trim();
    if (q) filter.$or = [{ name: new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') }, { email: new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') }];

    const people = await User.find(filter)
      .select('name email role classRoom admissionNo active lastLoginAt lastSeenAt')
      .populate('classRoom', 'name')
      .sort({ lastSeenAt: -1, name: 1 })
      .limit(600)
      .lean();
    const ids = people.map((p) => p._id);

    const [active, events] = await Promise.all([
      DailyActive.aggregate([
        { $match: { user: { $in: ids }, date: { $gte: fromISO } } },
        {
          $group: {
            _id: '$user',
            minutes: { $sum: '$minutes' },
            today: { $sum: { $cond: [{ $eq: ['$date', today] }, '$minutes', 0] } },
            days: { $sum: 1 },
          },
        },
      ]),
      Activity.aggregate([
        { $match: { $and: [{ user: { $in: ids }, at: { $gte: fromDate } }, castScope(eventScope(ctx))] } },
        { $group: { _id: { user: '$user', type: '$type' }, n: { $sum: 1 } } },
      ]),
    ]);

    const act = Object.fromEntries(active.map((a) => [String(a._id), a]));
    const ev = {};
    for (const e of events) {
      const k = String(e._id.user);
      ev[k] ||= {};
      ev[k][e._id.type] = e.n;
    }
    const now = Date.now();
    const rows = people.map((p) => {
      const a = act[String(p._id)] || {};
      const e = ev[String(p._id)] || {};
      return {
        ...p,
        online: !!p.lastSeenAt && now - new Date(p.lastSeenAt).getTime() < ONLINE_WINDOW_MS,
        activeToday: a.today || 0,
        activeMinutes: a.minutes || 0,
        activeDays: a.days || 0,
        logins: e.login || 0,
        uploads: (e.upload || 0) + (e.post || 0),
        submissions: e.submit || 0,
        opened: e.download || 0,
      };
    });

    return ok({
      days,
      from: fromISO,
      today,
      people: rows,
      totals: {
        people: rows.length,
        online: rows.filter((r) => r.online).length,
        activeToday: rows.filter((r) => r.activeToday > 0).length,
        logins: rows.reduce((s, r) => s + r.logins, 0),
        uploads: rows.reduce((s, r) => s + r.uploads + r.submissions, 0),
        neverSignedIn: rows.filter((r) => !r.lastLoginAt).length,
      },
    });
  } catch (err) {
    return handleError(err);
  }
}
