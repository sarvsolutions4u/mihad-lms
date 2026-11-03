import mongoose from 'mongoose';
import { dbConnect } from '@/lib/db';
import { User, Activity, DailyActive } from '@/models';
import { requireSession } from '@/lib/auth';
import { getActorContext } from '@/lib/access';
import { ONLINE_WINDOW_MS } from '@/lib/activity';
import { periodFrom, eventScope, castScope } from '@/lib/activityScope';
import { ok, fail, handleError, todayISO } from '@/lib/api';

export const dynamic = 'force-dynamic';

/** One person's activity: daily active minutes for the period, totals and recent events. */
export async function GET(req, ctxParams) {
  try {
    const { id } = await ctxParams.params;
    const session = await requireSession(['admin', 'teacher']);
    if (!mongoose.Types.ObjectId.isValid(id)) return fail('Unknown person', 404);
    await dbConnect();
    const ctx = await getActorContext(session);
    if (session.role !== 'admin' && id !== ctx.uid && !ctx.studentIds.includes(id)) return fail('Not one of your students', 403);

    const { days, fromISO, fromDate } = periodFrom(new URL(req.url).searchParams.get('days') || 30);
    const person = await User.findById(id).select('name email role classRoom admissionNo lastLoginAt lastSeenAt createdAt').populate('classRoom', 'name').lean();
    if (!person) return fail('Unknown person', 404);

    const scope = { $and: [{ user: id, at: { $gte: fromDate } }, eventScope(ctx)] };
    const [daily, counts, events] = await Promise.all([
      DailyActive.find({ user: id, date: { $gte: fromISO } }).select('date minutes first last').sort('date').lean(),
      Activity.aggregate([{ $match: castScope(scope) }, { $group: { _id: '$type', n: { $sum: 1 } } }]),
      Activity.find(scope).sort({ at: -1 }).limit(80).populate('subject', 'name').lean(),
    ]);

    // fill gaps so the chart has one bar per day
    const byDate = Object.fromEntries(daily.map((d) => [d.date, d]));
    const series = [];
    const d = new Date(`${fromISO}T00:00:00Z`);
    for (let i = 0; i < days; i++) {
      const iso = d.toISOString().slice(0, 10);
      series.push({ date: iso, minutes: byDate[iso]?.minutes || 0, first: byDate[iso]?.first || null, last: byDate[iso]?.last || null });
      d.setUTCDate(d.getUTCDate() + 1);
    }
    const c = Object.fromEntries(counts.map((x) => [x._id, x.n]));
    const minutes = series.reduce((s, x) => s + x.minutes, 0);

    return ok({
      person: { ...person, online: !!person.lastSeenAt && Date.now() - new Date(person.lastSeenAt).getTime() < ONLINE_WINDOW_MS },
      days,
      today: todayISO(),
      series,
      totals: {
        minutes,
        activeDays: series.filter((x) => x.minutes > 0).length,
        avgPerActiveDay: series.some((x) => x.minutes) ? Math.round(minutes / series.filter((x) => x.minutes).length) : 0,
        logins: c.login || 0,
        uploads: (c.upload || 0) + (c.post || 0),
        submissions: c.submit || 0,
        opened: c.download || 0,
      },
      events,
    });
  } catch (err) {
    return handleError(err);
  }
}
