import mongoose from 'mongoose';
import { dbConnect } from '@/lib/db';
import { Course, CourseProgress, SpeakingAttempt, User, Subject } from '@/models';
import { requireSession } from '@/lib/auth';
import { ok, fail, handleError } from '@/lib/api';
import { courseContext, courseScope, canManage, flatItems } from '@/lib/courses';
import { enrolledStudentsFilter } from '@/lib/enrol';

export const dynamic = 'force-dynamic';

/** GET — every student who has this course, with their progress (trainers of the course / admin). */
export async function GET(req, { params }) {
  try {
    const { id } = await params;
    const session = await requireSession(['admin', 'teacher']);
    await dbConnect();
    if (!mongoose.Types.ObjectId.isValid(String(id))) return fail('Course not found', 404);
    const ctx = await courseContext(session);
    const course = await Course.findOne({ _id: id, ...courseScope(session, ctx) }).lean();
    if (!course || !canManage(session, ctx, course)) return fail('Course not found', 404);
    // a trainer sees the students of their own linked batches; admin sees all
    const subjectIds = session.role === 'admin' ? course.subjects.map(String) : course.subjects.map(String).filter((s) => ctx.subjectIds.includes(s));
    const subjects = await Subject.find({ _id: { $in: subjectIds } }).select('classRoom').lean();
    const students = subjects.length
      ? await User.find({ ...enrolledStudentsFilter(subjects), active: { $ne: false } }).select('name admissionNo classRoom lastSeenAt').populate('classRoom', 'name').sort('name').lean()
      : [];
    const items = flatItems(course);
    const ids = students.map((s) => s._id);
    const [progress, attempts] = await Promise.all([
      CourseProgress.find({ course: course._id, student: { $in: ids } }).lean(),
      SpeakingAttempt.aggregate([
        { $match: { course: course._id, student: { $in: ids } } },
        { $group: { _id: '$student', n: { $sum: 1 }, reviewed: { $sum: { $cond: [{ $eq: ['$status', 'reviewed'] }, 1, 0] } }, avg: { $avg: '$rating' } } },
      ]),
    ]);
    const rows = students.map((s) => {
      const p = progress.find((x) => String(x.student) === String(s._id));
      const a = attempts.find((x) => String(x._id) === String(s._id));
      const done = p ? p.done.filter((d) => items.some((i) => String(i._id) === String(d.item))).length : 0;
      return {
        _id: s._id,
        name: s.name,
        admissionNo: s.admissionNo,
        classRoom: s.classRoom?.name || '',
        done,
        percent: items.length ? Math.round((done / items.length) * 100) : 0,
        practiceMins: Math.round((p?.practiceSecs || 0) / 60),
        lastAt: p?.lastAt || null,
        recordings: a?.n || 0,
        reviewed: a?.reviewed || 0,
        avgRating: a?.avg ? Math.round(a.avg * 10) / 10 : null,
      };
    });
    return ok({ items: items.length, students: rows });
  } catch (err) {
    return handleError(err);
  }
}
