import mongoose from 'mongoose';
import { dbConnect } from '@/lib/db';
import { Subject, User, LessonPlan, Task, Resource, Attendance, Mark, Submission, TimetableSlot } from '@/models';
import { requireSession } from '@/lib/auth';
import { getActorContext } from '@/lib/access';
import { enrolledStudentsFilter } from '@/lib/enrol';
import { ok, fail, handleError, todayISO } from '@/lib/api';

export const dynamic = 'force-dynamic';

/**
 * Everything on one subject page.
 *   admin / the subject's teacher: enrolled students with attendance rates,
 *     plans, assignments (with submission counts), resources, timetable
 *   student / parent (if enrolled): the same material, plus their own
 *     attendance and marks in this subject
 */
export async function GET(req, ctxParams) {
  try {
    const { id } = await ctxParams.params;
    if (!mongoose.Types.ObjectId.isValid(id)) return fail('Subject not found', 404);

    const session = await requireSession();
    await dbConnect();
    const ctx = await getActorContext(session);

    const subject = await Subject.findById(id)
      .populate('classRoom', 'name onlineClassLink academicYear')
      .populate('teacher', 'name email phone')
      .lean();
    if (!subject) return fail('Subject not found', 404);

    const isTeacher = session.role === 'teacher' && String(subject.teacher?._id) === ctx.uid;
    const canManage = session.role === 'admin' || isTeacher;
    const isLearner = ['student', 'parent'].includes(session.role) && ctx.subjectIds.includes(String(subject._id));
    if (!canManage && !isLearner) return fail('You are not enrolled in this subject', 403);

    const today = todayISO();
    const [plans, tasks, resources, slots] = await Promise.all([
      LessonPlan.find({ subject: id }).sort({ weekOf: -1, plannedDate: -1 }).limit(30).populate('teacher', 'name').lean(),
      Task.find({ subject: id }).sort({ deadline: -1 }).limit(40).lean(),
      Resource.find({ subject: id }).sort({ createdAt: -1 }).limit(60).populate('uploadedBy', 'name').lean(),
      TimetableSlot.find({ subject: id }).lean(),
    ]);

    const out = { subject, canManage, today, plans, tasks, resources, slots };

    if (canManage) {
      const students = await User.find(enrolledStudentsFilter([subject]))
        .select('name email phone admissionNo classRoom subjects active')
        .populate('classRoom', 'name')
        .sort('name')
        .lean();

      const ids = students.map((s) => s._id);
      const [att, subs] = await Promise.all([
        Attendance.aggregate([
          { $match: { subject: subject._id, student: { $in: ids } } },
          { $sort: { date: -1 } },
          {
            $group: {
              _id: '$student',
              total: { $sum: 1 },
              present: { $sum: { $cond: [{ $in: ['$status', ['present', 'late']] }, 1, 0] } },
              last: { $first: '$status' },
              lastDate: { $first: '$date' },
            },
          },
        ]),
        Submission.aggregate([
          { $match: { task: { $in: tasks.map((t) => t._id) } } },
          { $group: { _id: '$task', count: { $sum: 1 } } },
        ]),
      ]);
      const attBy = Object.fromEntries(att.map((a) => [String(a._id), a]));
      out.students = students.map((s) => {
        const a = attBy[String(s._id)];
        return {
          ...s,
          enrolment: s.subjects?.length ? 'chosen' : 'batch',
          attendance: a ? { total: a.total, present: a.present, pct: Math.round((a.present / a.total) * 100), last: a.last, lastDate: a.lastDate } : null,
        };
      });
      const subBy = Object.fromEntries(subs.map((x) => [String(x._id), x.count]));
      out.tasks = tasks.map((t) => ({ ...t, submissionCount: subBy[String(t._id)] || 0 }));
      out.stats = {
        students: students.length,
        openTasks: tasks.filter((t) => t.deadline && t.deadline >= today).length,
        plansDone: plans.filter((p) => p.portionCompleted).length,
        plans: plans.length,
      };
    } else {
      const [attendance, marks, mySubs, kids] = await Promise.all([
        Attendance.find({ subject: id, student: { $in: ctx.studentIds } }).sort('-date').limit(60).populate('student', 'name').lean(),
        Mark.find({ subject: id, student: { $in: ctx.studentIds } }).sort('-date').populate('student', 'name').lean(),
        Submission.find({ task: { $in: tasks.map((t) => t._id) }, student: { $in: ctx.studentIds } }).lean(),
        User.find({ _id: { $in: ctx.studentIds } }).select('name').lean(),
      ]);
      out.attendance = attendance;
      out.marks = marks;
      out.submissions = mySubs;
      out.learners = kids;
    }

    return ok(out);
  } catch (err) {
    return handleError(err);
  }
}
