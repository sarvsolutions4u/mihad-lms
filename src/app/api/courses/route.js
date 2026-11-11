import { dbConnect } from '@/lib/db';
import { Course, CourseProgress, SpeakingAttempt } from '@/models';
import { requireSession } from '@/lib/auth';
import { ok, fail, handleError } from '@/lib/api';
import { courseContext, courseScope, canManage, flatItems, cleanUnits, mergeSubjects, fromLibrary } from '@/lib/courses';

export const dynamic = 'force-dynamic';

/** GET /api/courses — the courses this person can see, with progress (students) or review counts (staff). */
export async function GET() {
  try {
    const session = await requireSession(['admin', 'teacher', 'student']);
    await dbConnect();
    const ctx = await courseContext(session);
    const courses = await Course.find(courseScope(session, ctx))
      .select('-units.items.body -units.items.lines -units.items.prompt -units.items.tips')
      .populate({ path: 'subjects', select: 'name classRoom teacher', populate: [{ path: 'classRoom', select: 'name' }, { path: 'teacher', select: 'name' }] })
      .sort({ createdAt: -1 })
      .lean();
    const ids = courses.map((c) => c._id);
    let progress = [];
    let pending = [];
    if (session.role === 'student') progress = await CourseProgress.find({ course: { $in: ids }, student: session.uid }).lean();
    else pending = await SpeakingAttempt.aggregate([{ $match: { course: { $in: ids }, status: 'submitted' } }, { $group: { _id: '$course', n: { $sum: 1 } } }]);
    const out = courses.map((c) => {
      const items = flatItems(c);
      const p = progress.find((x) => String(x.course) === String(c._id));
      const done = p ? p.done.filter((d) => items.some((i) => String(i._id) === String(d.item))).length : 0;
      return {
        _id: c._id,
        title: c.title,
        subtitle: c.subtitle,
        level: c.level,
        category: c.category,
        published: c.published,
        libraryKey: c.libraryKey,
        subjects: c.subjects,
        units: (c.units || []).length,
        items: items.length,
        minutes: items.reduce((a, i) => a + (i.minutes || 0), 0),
        done,
        percent: items.length ? Math.round((done / items.length) * 100) : 0,
        lastAt: p?.lastAt || null,
        toReview: pending.find((x) => String(x._id) === String(c._id))?.n || 0,
        canManage: canManage(session, ctx, c),
      };
    });
    return ok({ courses: out });
  } catch (err) {
    return handleError(err);
  }
}

/**
 * POST /api/courses — create a course (admin / trainer)
 *   { library: '<key>', subjects: [...] }   copy a built-in course
 *   { title, subtitle, description, level, subjects }   a new empty course
 */
export async function POST(req) {
  try {
    const session = await requireSession(['admin', 'teacher']);
    await dbConnect();
    const ctx = await courseContext(session);
    const body = await req.json();
    let data;
    if (body.library) {
      data = fromLibrary(body.library);
      if (!data) return fail('Built-in course not found', 404);
    } else {
      const title = String(body.title || '').trim().slice(0, 160);
      if (!title) return fail('Give the course a title', 422);
      data = {
        title,
        subtitle: String(body.subtitle || '').slice(0, 300),
        description: String(body.description || '').slice(0, 5000),
        level: String(body.level || '').slice(0, 80),
        category: String(body.category || '').slice(0, 80),
        units: cleanUnits(body.units || [{ title: 'Unit 1', items: [] }]),
      };
    }
    data.subjects = await mergeSubjects(session, ctx, [], body.subjects);
    if (session.role === 'teacher' && !data.subjects.length) return fail('Choose at least one of your subjects (batches) for this course', 422);
    const c = await Course.create({ ...data, createdBy: session.uid, published: body.published !== false });
    return ok({ course: { _id: String(c._id) } }, { status: 201 });
  } catch (err) {
    return handleError(err);
  }
}
