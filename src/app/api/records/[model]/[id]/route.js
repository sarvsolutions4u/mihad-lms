import { dbConnect } from '@/lib/db';
import { MODELS, Attendance, Mark, Submission, Fee, User } from '@/models';
import { cleanLinks } from '@/lib/links';
import { deleteFile, fileIdFromUrl } from '@/lib/files';
import { requireSession, hashPassword } from '@/lib/auth';
import { getActorContext, POLICY, POPULATE, stripProtected } from '@/lib/access';
import { ok, fail, handleError } from '@/lib/api';

export const dynamic = 'force-dynamic';

async function loadScoped(key, id, session) {
  const Model = MODELS[key];
  const policy = POLICY[key];
  const ctx = await getActorContext(session);
  const scope = policy.scope(ctx);
  const filter = Object.keys(scope).length ? { $and: [{ _id: id }, scope] } : { _id: id };
  const doc = await Model.findOne(filter);
  return { Model, policy, ctx, doc };
}

export async function GET(req, ctxParams) {
  try {
    const params = await ctxParams.params;
    const { model: key, id } = params;
    const policy = POLICY[key];
    if (!MODELS[key] || !policy) return fail('Unknown collection', 404);

    const session = await requireSession();
    if (!policy.read.includes(session.role)) return fail('You do not have access to this', 403);

    await dbConnect();
    const { Model, ctx } = await loadScoped(key, id, session);
    const scope = policy.scope(ctx);
    const filter = Object.keys(scope).length ? { $and: [{ _id: id }, scope] } : { _id: id };

    let q = Model.findOne(filter);
    for (const p of POPULATE[key] || []) q = q.populate(p, 'name email role title');
    const item = await q.lean();
    if (!item) return fail('Not found', 404);
    return ok({ item });
  } catch (err) {
    return handleError(err);
  }
}

export async function PATCH(req, ctxParams) {
  try {
    const params = await ctxParams.params;
    const { model: key, id } = params;
    const policy = POLICY[key];
    if (!MODELS[key] || !policy) return fail('Unknown collection', 404);

    const session = await requireSession();
    if (!policy.write.includes(session.role)) return fail('You do not have permission to edit this', 403);

    await dbConnect();
    const { doc, ctx } = await loadScoped(key, id, session);
    if (!doc) return fail('Not found, or outside your access', 404);

    const body = cleanLinks(key, stripProtected(await req.json()));

    if (key === 'users') {
      // subject enrolment is decided by the office
      if (session.role === 'teacher') delete body.subjects;
      if (body.password) {
        body.passwordHash = await hashPassword(body.password);
        delete body.password;
      }
      if (session.role === 'teacher' && doc.role !== 'student') {
        return fail('Teachers can only edit student accounts', 403);
      }
      if (session.role === 'teacher' && body.role && body.role !== 'student') {
        return fail('Teachers cannot change a role', 403);
      }
      if (body.email) body.email = String(body.email).toLowerCase().trim();
    }

    if (key === 'lessonplans' && session.role === 'teacher' && String(doc.teacher) !== ctx.uid) {
      return fail('This lesson plan belongs to another teacher', 403);
    }

    if (key === 'submissions' && session.role === 'student') {
      if (String(doc.student) !== ctx.uid) return fail('Not your submission', 403);
      delete body.score;
      delete body.feedback;
    }
    if (key === 'submissions' && session.role === 'teacher') {
      // a teacher only grades — the student's work itself is left untouched
      for (const f of Object.keys(body)) if (!['score', 'feedback'].includes(f)) delete body[f];
    }

    if (key === 'fees' && Array.isArray(body.payments)) {
      body.payments = body.payments.map((p) => (p.recordedBy ? p : { ...p, recordedBy: ctx.uid, recordedAt: new Date() }));
    }

    if (key === 'lessonplans' && body.portionCompleted === true && !doc.completedAt) {
      body.completedAt = new Date();
    }

    Object.assign(doc, body);
    await doc.save();
    return ok({ item: doc.toObject() });
  } catch (err) {
    return handleError(err);
  }
}

export async function DELETE(req, ctxParams) {
  try {
    const params = await ctxParams.params;
    const { model: key, id } = params;
    const policy = POLICY[key];
    if (!MODELS[key] || !policy) return fail('Unknown collection', 404);

    const session = await requireSession();
    if (!policy.write.includes(session.role)) return fail('You do not have permission to delete this', 403);

    await dbConnect();
    const { doc, ctx } = await loadScoped(key, id, session);
    if (!doc) return fail('Not found, or outside your access', 404);

    if (key === 'users') {
      if (session.role !== 'admin') return fail('Only an admin can remove an account', 403);
      if (String(doc._id) === ctx.uid) return fail('You cannot delete your own account', 400);
    }
    if (key === 'lessonplans' && session.role === 'teacher' && String(doc.teacher) !== ctx.uid) {
      return fail('This lesson plan belongs to another teacher', 403);
    }

    // Removing a student clears everything that belongs to them.
    if (key === 'users' && doc.role === 'student') {
      const fees = await Fee.find({ student: doc._id }).select('payments attachments').lean();
      const fileIds = fees
        .flatMap((f) => [...(f.payments || []).map((p) => p.receipt?.url), ...(f.attachments || []).map((a) => a.url)])
        .map(fileIdFromUrl)
        .filter(Boolean);
      await Promise.all([
        Attendance.deleteMany({ student: doc._id }),
        Mark.deleteMany({ student: doc._id }),
        Submission.deleteMany({ student: doc._id }),
        Fee.deleteMany({ student: doc._id }),
        User.updateMany({ children: doc._id }, { $pull: { children: doc._id } }),
        ...fileIds.map((fid) => deleteFile(fid).catch(() => {})),
      ]);
    }

    // A deleted fee takes its receipts and invoices with it.
    if (key === 'fees') {
      const ids = [...(doc.payments || []).map((p) => p.receipt?.url), ...(doc.attachments || []).map((a) => a.url)]
        .map(fileIdFromUrl)
        .filter(Boolean);
      await Promise.all(ids.map((fid) => deleteFile(fid).catch(() => {})));
    }

    await doc.deleteOne();
    return ok({ deleted: id });
  } catch (err) {
    return handleError(err);
  }
}
