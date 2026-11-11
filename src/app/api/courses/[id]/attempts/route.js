import mongoose from 'mongoose';
import { dbConnect } from '@/lib/db';
import { Course, SpeakingAttempt, CourseProgress, StoredFile } from '@/models';
import { requireSession } from '@/lib/auth';
import { ok, fail, handleError } from '@/lib/api';
import { logActivity } from '@/lib/activity';
import { courseContext, courseScope, canManage, flatItems } from '@/lib/courses';
import { findFile } from '@/lib/files';

export const dynamic = 'force-dynamic';

const MAX_PER_TASK = 3; // small practice: up to 3 recordings per speaking task

/** GET — speaking recordings for this course: a student's own, or all of them for its trainers. ?status=submitted|reviewed */
export async function GET(req, { params }) {
  try {
    const { id } = await params;
    const session = await requireSession(['admin', 'teacher', 'student']);
    await dbConnect();
    if (!mongoose.Types.ObjectId.isValid(String(id))) return fail('Course not found', 404);
    const ctx = await courseContext(session);
    const course = await Course.findOne({ _id: id, ...courseScope(session, ctx) }).select('subjects createdBy').lean();
    if (!course) return fail('Course not found', 404);
    const filter = { course: course._id };
    if (session.role === 'student') filter.student = session.uid;
    else if (!canManage(session, ctx, course)) return fail('Course not found', 404);
    const st = new URL(req.url).searchParams.get('status');
    if (['submitted', 'reviewed'].includes(st)) filter.status = st;
    const attempts = await SpeakingAttempt.find(filter)
      .sort({ status: 1, createdAt: -1 })
      .limit(300)
      .populate({ path: 'student', select: 'name admissionNo classRoom', populate: { path: 'classRoom', select: 'name' } })
      .populate('reviewedBy', 'name')
      .lean();
    return ok({ attempts });
  } catch (err) {
    return handleError(err);
  }
}

/** POST — a student hands in a speaking-task recording { item, audio: '/api/files/<id>', secs, note } */
export async function POST(req, { params }) {
  try {
    const { id } = await params;
    const session = await requireSession(['student']);
    await dbConnect();
    if (!mongoose.Types.ObjectId.isValid(String(id))) return fail('Course not found', 404);
    const ctx = await courseContext(session);
    const course = await Course.findOne({ _id: id, ...courseScope(session, ctx) }).lean();
    if (!course) return fail('Course not found', 404);
    const b = await req.json();
    const item = flatItems(course).find((i) => String(i._id) === String(b.item));
    if (!item || item.kind !== 'speaking') return fail('Speaking task not found', 404);
    const m = String(b.audio || '').match(/^\/api\/files\/([a-f0-9]{32})$/);
    if (!m) return fail('Record your answer first', 422);
    // the recording must be the student's own upload
    const meta = (await StoredFile.findById(m[1]).lean()) || (await findFile(m[1]))?.doc?.metadata;
    if (!meta || String(meta.uploadedBy) !== String(session.uid)) return fail('Recording not found', 404);
    const count = await SpeakingAttempt.countDocuments({ course: course._id, item: item._id, student: session.uid });
    if (count >= MAX_PER_TASK) return fail(`You can send up to ${MAX_PER_TASK} recordings for each task — practise more in class!`, 429);

    const a = await SpeakingAttempt.create({
      course: course._id,
      item: item._id,
      itemTitle: item.title,
      student: session.uid,
      audio: b.audio,
      secs: Math.max(0, Math.min(600, Math.round(Number(b.secs) || 0))),
      note: String(b.note || '').slice(0, 500),
    });
    const now = new Date();
    await CourseProgress.updateOne({ course: course._id, student: session.uid }, { $set: { lastItem: item._id, lastAt: now } }, { upsert: true });
    await CourseProgress.updateOne({ course: course._id, student: session.uid, 'done.item': { $ne: item._id } }, { $push: { done: { item: item._id, at: now } } });
    const subject = (course.subjects || []).map(String).find((s) => ctx.subjectIds.includes(s));
    await logActivity({ uid: session.uid, role: 'student', type: 'submit', name: `${course.title} — ${item.title}`, detail: 'Speaking practice', subject, req });
    return ok({ attempt: { _id: String(a._id) } }, { status: 201 });
  } catch (err) {
    return handleError(err);
  }
}
