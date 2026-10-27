import { dbConnect } from '@/lib/db';
import { Subject, User, LessonPlan, Task, Attendance } from '@/models';
import { requireSession } from '@/lib/auth';
import { getActorContext } from '@/lib/access';
import { enrolledStudentsFilter } from '@/lib/enrol';
import { ok, handleError, todayISO, weekStart } from '@/lib/api';

export const dynamic = 'force-dynamic';

/**
 * "My subjects" — the subject cards for the dashboard and the Subjects page.
 *   admin   -> every subject
 *   teacher -> subjects assigned to them
 *   student -> subjects they are enrolled in
 *   parent  -> subjects their children are enrolled in
 */
export async function GET() {
  try {
    const session = await requireSession();
    await dbConnect();
    const ctx = await getActorContext(session);

    const filter =
      session.role === 'admin' ? {} : session.role === 'teacher' ? { teacher: ctx.uid } : { _id: { $in: ctx.subjectIds } };

    const subjects = await Subject.find(filter)
      .populate('classRoom', 'name onlineClassLink order')
      .populate('teacher', 'name')
      .lean();

    const today = todayISO();
    const monday = weekStart(today);
    const manage = session.role === 'admin' || session.role === 'teacher';

    const items = await Promise.all(
      subjects.map(async (s) => {
        const [studentCount, plansThisWeek, plansDone, openTasks] = await Promise.all([
          manage ? User.countDocuments(enrolledStudentsFilter([s])) : Promise.resolve(null),
          LessonPlan.countDocuments({ subject: s._id, weekOf: monday }),
          LessonPlan.countDocuments({ subject: s._id, weekOf: monday, portionCompleted: true }),
          Task.countDocuments({ subject: s._id, deadline: { $gte: today } }),
        ]);
        let attendance = null;
        if (!manage && ctx.studentIds.length) {
          const [present, total] = await Promise.all([
            Attendance.countDocuments({ subject: s._id, student: { $in: ctx.studentIds }, status: { $in: ['present', 'late'] } }),
            Attendance.countDocuments({ subject: s._id, student: { $in: ctx.studentIds } }),
          ]);
          attendance = total ? Math.round((present / total) * 100) : null;
        }
        return { ...s, studentCount, plansThisWeek, plansDone, openTasks, attendance };
      })
    );

    items.sort(
      (a, b) =>
        (a.classRoom?.order || 0) - (b.classRoom?.order || 0) ||
        String(a.classRoom?.name).localeCompare(String(b.classRoom?.name)) ||
        a.name.localeCompare(b.name)
    );

    return ok({ items });
  } catch (err) {
    return handleError(err);
  }
}
