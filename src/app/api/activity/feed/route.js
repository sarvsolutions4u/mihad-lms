import mongoose from 'mongoose';
import { dbConnect } from '@/lib/db';
import { Activity, User, ACTIVITY_TYPES } from '@/models';
import { requireSession } from '@/lib/auth';
import { getActorContext } from '@/lib/access';
import { periodFrom, eventScope, peopleScope } from '@/lib/activityScope';
import { ok, fail, handleError } from '@/lib/api';

export const dynamic = 'force-dynamic';

const GROUPS = {
  signins: ['login', 'logout'],
  uploads: ['upload', 'post'],
  submissions: ['submit'],
  files: ['download'],
  messages: ['doubt', 'message'],
};

/**
 * GET /api/activity/feed?days=7&type=uploads&user=<id>&role=teacher&before=<iso>
 * The event log, newest first (100 per page).
 */
export async function GET(req) {
  try {
    const session = await requireSession(['admin', 'teacher']);
    await dbConnect();
    const ctx = await getActorContext(session);
    const sp = new URL(req.url).searchParams;
    const { fromDate } = periodFrom(sp.get('days'));

    const and = [eventScope(ctx), { at: { $gte: fromDate } }];
    const type = sp.get('type');
    if (GROUPS[type]) and.push({ type: { $in: GROUPS[type] } });
    else if (ACTIVITY_TYPES.includes(type)) and.push({ type });
    const before = sp.get('before');
    if (before && !Number.isNaN(Date.parse(before))) and.push({ at: { $lt: new Date(before) } });

    const user = sp.get('user');
    if (user) {
      if (!mongoose.Types.ObjectId.isValid(user)) return fail('Unknown person', 404);
      if (session.role !== 'admin' && user !== ctx.uid && !ctx.studentIds.includes(user)) return fail('Not one of your students', 403);
      and.push({ user });
    }
    const role = sp.get('role');
    if (session.role === 'admin' && ['student', 'teacher', 'parent', 'admin'].includes(role)) and.push({ role });
    const classRoom = sp.get('classRoom');
    if (classRoom && mongoose.Types.ObjectId.isValid(classRoom)) {
      const inClass = await User.find({ ...peopleScope(ctx), classRoom }).select('_id').lean();
      and.push({ user: { $in: inClass.map((u) => u._id) } });
    }

    const items = await Activity.find({ $and: and })
      .sort({ at: -1 })
      .limit(101)
      .populate({ path: 'user', select: 'name role classRoom', populate: { path: 'classRoom', select: 'name' } })
      .populate('subject', 'name')
      .lean();
    const more = items.length > 100;
    return ok({ items: items.slice(0, 100), more, next: more ? items[99].at : null });
  } catch (err) {
    return handleError(err);
  }
}
