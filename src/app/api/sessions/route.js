import mongoose from 'mongoose';
import { dbConnect } from '@/lib/db';
import { LessonPlan, Subject, SESSION_KINDS } from '@/models';
import { requireSession } from '@/lib/auth';
import { getActorContext } from '@/lib/access';
import { cleanLinks } from '@/lib/links';
import { ok, fail, handleError, todayISO } from '@/lib/api';
import { addDays } from '@/lib/schedule';

export const dynamic = 'force-dynamic';

const isDate = (d) => /^\d{4}-\d{2}-\d{2}$/.test(String(d || ''));
const isTime = (t) => !t || /^\d{2}:\d{2}$/.test(String(t));

/**
 * Plan several sessions at once (the lesson planner).
 * body: { subject, students?: [ids], sessions: [{ date, startTime?, endTime?, kind, title?, portion?, attachments? }] }
 * Teachers: their own subjects only. Dates up to a year ahead.
 */
export async function POST(req) {
  try {
    const session = await requireSession(['admin', 'teacher']);
    const body = await req.json();
    await dbConnect();
    const ctx = await getActorContext(session);

    if (!mongoose.Types.ObjectId.isValid(String(body.subject || ''))) return fail('Choose a subject', 422);
    const subject = await Subject.findById(body.subject).select('classRoom teacher').lean();
    if (!subject) return fail('Subject not found', 404);
    if (session.role === 'teacher' && !ctx.subjectIds.includes(String(subject._id))) {
      return fail('You can only plan sessions for your own subjects', 403);
    }

    const rows = Array.isArray(body.sessions) ? body.sessions : [];
    if (!rows.length) return fail('Add at least one session', 422);
    if (rows.length > 400) return fail('Up to 400 sessions at a time', 422);

    const limit = addDays(todayISO(), 366);
    const students = (Array.isArray(body.students) ? body.students : []).filter((id) => mongoose.Types.ObjectId.isValid(String(id)));

    const docs = [];
    for (const [i, r] of rows.entries()) {
      if (!isDate(r.date)) return fail(`Row ${i + 1}: choose a date`, 422);
      if (r.date > limit) return fail(`Row ${i + 1}: sessions can be planned up to one year ahead`, 422);
      if (!isTime(r.startTime) || !isTime(r.endTime)) return fail(`Row ${i + 1}: times must be like 16:00`, 422);
      if (r.startTime && r.endTime && r.endTime <= r.startTime) return fail(`Row ${i + 1}: end time must be after start time`, 422);
      const clean = cleanLinks('lessonplans', { attachments: r.attachments || [] });
      docs.push({
        classRoom: subject.classRoom,
        subject: subject._id,
        teacher: session.role === 'teacher' ? ctx.uid : subject.teacher || ctx.uid,
        students,
        date: r.date,
        startTime: r.startTime || '',
        endTime: r.endTime || '',
        kind: SESSION_KINDS.includes(r.kind) ? r.kind : 'class',
        title: String(r.title || '').slice(0, 200),
        portion: String(r.portion || '').slice(0, 2000),
        maxMarks: Number(r.maxMarks) || 0,
        attachments: clean.attachments,
        status: r.kind === 'holiday' ? 'cancelled' : 'scheduled',
      });
    }

    const created = await LessonPlan.create(docs);
    return ok({ created: created.length, first: docs[0].date, last: docs[docs.length - 1].date }, { status: 201 });
  } catch (err) {
    return handleError(err);
  }
}
