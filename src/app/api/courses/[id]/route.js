import mongoose from 'mongoose';
import { dbConnect } from '@/lib/db';
import { Course, CourseProgress, SpeakingAttempt } from '@/models';
import { requireSession } from '@/lib/auth';
import { ok, fail, handleError } from '@/lib/api';
import { courseContext, courseScope, canManage, flatItems, cleanUnits, mergeSubjects } from '@/lib/courses';

export const dynamic = 'force-dynamic';

async function load(session, id) {
  if (!mongoose.Types.ObjectId.isValid(String(id))) return {};
  const ctx = await courseContext(session);
  const course = await Course.findOne({ _id: id, ...courseScope(session, ctx) })
    .populate({ path: 'subjects', select: 'name classRoom teacher', populate: [{ path: 'classRoom', select: 'name' }, { path: 'teacher', select: 'name' }] })
    .populate('createdBy', 'name')
    .lean();
  return { ctx, course };
}

/** GET — the whole course, plus my progress and my speaking attempts (students). */
export async function GET(req, { params }) {
  try {
    const { id } = await params;
    const session = await requireSession(['admin', 'teacher', 'student']);
    await dbConnect();
    const { ctx, course } = await load(session, id);
    if (!course) return fail('Course not found', 404);
    const items = flatItems(course);
    let progress = null;
    let attempts = [];
    if (session.role === 'student') {
      const p = await CourseProgress.findOne({ course: course._id, student: session.uid }).lean();
      const done = (p?.done || []).map((d) => String(d.item)).filter((x) => items.some((i) => String(i._id) === x));
      progress = { done, percent: items.length ? Math.round((done.length / items.length) * 100) : 0, practiceSecs: p?.practiceSecs || 0, lastItem: p?.lastItem || null };
      attempts = await SpeakingAttempt.find({ course: course._id, student: session.uid }).sort({ createdAt: -1 }).populate('reviewedBy', 'name').lean();
    }
    const manage = canManage(session, ctx, course);
    const toReview = manage ? await SpeakingAttempt.countDocuments({ course: course._id, status: 'submitted' }) : 0;
    return ok({ course, progress, attempts, canManage: manage, toReview, mySubjects: session.role === 'teacher' ? ctx.subjectIds : undefined });
  } catch (err) {
    return handleError(err);
  }
}

/** PUT — save the course (details, linked batches, units and items). Admin / the course's trainers. */
export async function PUT(req, { params }) {
  try {
    const { id } = await params;
    const session = await requireSession(['admin', 'teacher']);
    await dbConnect();
    const { ctx, course } = await load(session, id);
    if (!course) return fail('Course not found', 404);
    if (!canManage(session, ctx, course)) return fail('Only this course’s trainers can edit it', 403);
    const b = await req.json();
    const set = {};
    if (b.title !== undefined) {
      set.title = String(b.title || '').trim().slice(0, 160);
      if (!set.title) return fail('Give the course a title', 422);
    }
    for (const [k, max] of [['subtitle', 300], ['description', 5000], ['level', 80], ['category', 80]]) if (b[k] !== undefined) set[k] = String(b[k] || '').slice(0, max);
    if (Array.isArray(b.howTo)) set.howTo = b.howTo.map((x) => String(x).slice(0, 300)).filter(Boolean).slice(0, 10);
    if (b.published !== undefined) set.published = !!b.published;
    if (b.subjects !== undefined) set.subjects = await mergeSubjects(session, ctx, course.subjects, b.subjects);
    if (b.units !== undefined) set.units = cleanUnits(b.units);
    await Course.updateOne({ _id: course._id }, { $set: set }, { runValidators: true });
    return ok({ saved: true });
  } catch (err) {
    return handleError(err);
  }
}

/** DELETE — admin, or the trainer who created it. Progress and practice records go with it. */
export async function DELETE(req, { params }) {
  try {
    const { id } = await params;
    const session = await requireSession(['admin', 'teacher']);
    await dbConnect();
    const { course } = await load(session, id);
    if (!course) return fail('Course not found', 404);
    if (session.role !== 'admin' && String(course.createdBy?._id) !== String(session.uid)) return fail('Only the admin or the trainer who created it can delete this course', 403);
    await Promise.all([Course.deleteOne({ _id: course._id }), CourseProgress.deleteMany({ course: course._id }), SpeakingAttempt.deleteMany({ course: course._id })]);
    return ok({ deleted: id });
  } catch (err) {
    return handleError(err);
  }
}
