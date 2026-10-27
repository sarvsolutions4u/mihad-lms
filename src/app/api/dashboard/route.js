import { dbConnect } from '@/lib/db';
import {
  User, ClassRoom, Subject, TimetableSlot, Attendance, Fee,
  LessonPlan, Mark, Task, Announcement, Resource, DAYS,
} from '@/models';
import { requireSession } from '@/lib/auth';
import { getActorContext, POLICY } from '@/lib/access';
import { ok, handleError, todayISO, weekStart } from '@/lib/api';
import { refreshOverdueFees } from '@/lib/fees';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const session = await requireSession();
    await dbConnect();
    const ctx = await getActorContext(session);

    const today = todayISO();
    const monday = weekStart(today);
    const dayName = DAYS[(new Date(`${today}T00:00:00Z`).getUTCDay() + 6) % 7];

    const out = { role: session.role, today, weekOf: monday, dayName, stats: [], sections: {} };

    /* ---- announcements visible to me ------------------------------ */
    const annScope = POLICY.announcements.scope(ctx);
    out.sections.announcements = await Announcement.find(annScope)
      .sort({ pinned: -1, createdAt: -1 })
      .limit(5)
      .lean();

    /* ---- today's timetable ---------------------------------------- */
    const ttFilter = { day: dayName };
    if (session.role === 'teacher') ttFilter.$or = [{ teacher: ctx.uid }, { subject: { $in: ctx.subjectIds } }];
    else if (session.role !== 'admin') ttFilter.subject = { $in: ctx.subjectIds };
    out.sections.todayClasses = await TimetableSlot.find(ttFilter)
      .sort('startTime')
      .populate('subject', 'name onlineClassLink')
      .populate('classRoom', 'name onlineClassLink')
      .populate('teacher', 'name')
      .lean();

    /* ---- role-specific numbers ------------------------------------ */
    if (session.role === 'admin') {
      await refreshOverdueFees(today);
      const [students, teachers, parents, classes, subjects, presentToday, totalToday, feesDue] =
        await Promise.all([
          User.countDocuments({ role: 'student', active: true }),
          User.countDocuments({ role: 'teacher', active: true }),
          User.countDocuments({ role: 'parent', active: true }),
          ClassRoom.countDocuments({}),
          Subject.countDocuments({}),
          Attendance.countDocuments({ date: today, status: { $in: ['present', 'late'] } }),
          Attendance.countDocuments({ date: today }),
          Fee.countDocuments({ status: { $in: ['pending', 'partial', 'overdue'] } }),
        ]);

      out.stats = [
        { label: 'Students', value: students },
        { label: 'Teachers', value: teachers },
        { label: 'Parents', value: parents },
        { label: 'Classes', value: classes },
        { label: 'Subjects', value: subjects },
        {
          label: 'Attendance today',
          value: totalToday ? `${Math.round((presentToday / totalToday) * 100)}%` : '—',
          hint: totalToday ? `${presentToday}/${totalToday} marked present` : 'Not marked yet',
        },
        { label: 'Fees outstanding', value: feesDue },
      ];

      out.sections.weekPlans = await LessonPlan.find({ weekOf: monday })
        .populate('subject', 'name')
        .populate('classRoom', 'name')
        .populate('teacher', 'name')
        .sort('classRoom')
        .lean();
    }

    if (session.role === 'teacher') {
      const [mySubjects, myStudents, plans, pending] = await Promise.all([
        Subject.countDocuments({ teacher: ctx.uid }),
        Promise.resolve(ctx.studentIds.length),
        LessonPlan.find({ teacher: ctx.uid, weekOf: monday })
          .populate('subject', 'name')
          .populate('classRoom', 'name')
          .lean(),
        LessonPlan.countDocuments({ teacher: ctx.uid, weekOf: monday, portionCompleted: false }),
      ]);

      out.stats = [
        { label: 'My subjects', value: mySubjects },
        { label: 'Students', value: myStudents },
        { label: 'Plans this week', value: plans.length },
        { label: 'Portions pending', value: pending },
      ];
      out.sections.weekPlans = plans;
      out.sections.myTasks = await Task.find({ subject: { $in: ctx.subjectIds } })
        .sort('-createdAt')
        .limit(5)
        .populate('subject', 'name')
        .lean();
    }

    if (session.role === 'student' || session.role === 'parent') {
      const studentIds = ctx.studentIds;
      const [present, total, upcoming, recentMarks, plans] = await Promise.all([
        Attendance.countDocuments({ student: { $in: studentIds }, status: { $in: ['present', 'late'] } }),
        Attendance.countDocuments({ student: { $in: studentIds } }),
        Task.find({ subject: { $in: ctx.subjectIds }, deadline: { $gte: today } })
          .sort('deadline')
          .limit(5)
          .populate('subject', 'name')
          .lean(),
        Mark.find({ student: { $in: studentIds } })
          .sort('-createdAt')
          .limit(5)
          .populate('subject', 'name')
          .populate('student', 'name')
          .lean(),
        LessonPlan.find({ subject: { $in: ctx.subjectIds }, weekOf: monday })
          .populate('subject', 'name')
          .populate('teacher', 'name')
          .lean(),
      ]);

      const completed = plans.filter((p) => p.portionCompleted).length;

      out.stats = [
        {
          label: 'Attendance',
          value: total ? `${Math.round((present / total) * 100)}%` : '—',
          hint: total ? `${present} of ${total} sessions` : 'No records yet',
        },
        { label: 'Portions done this week', value: `${completed}/${plans.length}` },
        { label: 'Upcoming deadlines', value: upcoming.length },
        { label: 'Resources', value: await Resource.countDocuments(POLICY.resources.scope(ctx)) },
      ];

      out.sections.weekPlans = plans;
      out.sections.upcoming = upcoming;
      out.sections.recentMarks = recentMarks;

      if (session.role === 'parent') {
        const fees = await Fee.find({ student: { $in: studentIds } })
          .populate('student', 'name')
          .sort('dueDate')
          .lean();
        const outstanding = fees
          .filter((f) => f.status !== 'paid')
          .reduce((s, f) => s + (f.amount - (f.paidAmount || 0)), 0);
        out.sections.fees = fees;
        out.stats.push({
          label: 'Fees outstanding',
          value: outstanding > 0 ? `AED ${outstanding.toLocaleString()}` : 'Nil',
        });
        out.sections.children = await User.find({ _id: { $in: studentIds } })
          .select('name admissionNo classRoom')
          .populate('classRoom', 'name')
          .lean();
      }
    }

    return ok(out);
  } catch (err) {
    return handleError(err);
  }
}
