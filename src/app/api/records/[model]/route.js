import mongoose from 'mongoose';
import { dbConnect } from '@/lib/db';
import { MODELS, Subject } from '@/models';
import { enrolledStudentsFilter } from '@/lib/enrol';
import { cleanLinks } from '@/lib/links';
import { requireSession, hashPassword } from '@/lib/auth';
import { getActorContext, POLICY, POPULATE, stripProtected, selectFor } from '@/lib/access';
import { ok, fail, handleError } from '@/lib/api';

export const dynamic = 'force-dynamic';

const isId = (v) => mongoose.Types.ObjectId.isValid(v);

/** Turn ?classRoom=..&status=..&limit=..&sort=.. into a Mongo query. */
function buildQuery(Model, searchParams) {
  const filter = {};
  const paths = Model.schema.paths;

  for (const [key, raw] of searchParams.entries()) {
    if (['limit', 'skip', 'sort', 'q', 'page', 'populate', 'enrolledIn'].includes(key)) continue;
    if (!paths[key]) continue;

    const instance = paths[key].instance;
    const values = raw.split(',').filter(Boolean);

    if (key === 'date' || key === 'weekOf' || key === 'deadline') {
      // support date ranges: ?date=2026-09-01..2026-09-30
      if (raw.includes('..')) {
        const [from, to] = raw.split('..');
        filter[key] = {};
        if (from) filter[key].$gte = from;
        if (to) filter[key].$lte = to;
        continue;
      }
    }

    if (instance === 'Boolean') {
      filter[key] = raw === 'true';
    } else if (instance === 'Number') {
      filter[key] = Number(raw);
    } else if (instance === 'ObjectId' || paths[key].caster?.instance === 'ObjectId') {
      const ids = values.filter(isId);
      if (!ids.length) continue;
      filter[key] = ids.length > 1 ? { $in: ids } : ids[0];
    } else {
      filter[key] = values.length > 1 ? { $in: values } : raw;
    }
  }

  const q = searchParams.get('q');
  if (q) {
    const rx = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    const textFields = Object.keys(paths).filter(
      (p) => paths[p].instance === 'String' && !['passwordHash', '__v'].includes(p)
    );
    if (textFields.length) filter.$or = textFields.map((f) => ({ [f]: rx }));
  }

  return filter;
}

function mergeFilters(base, scope) {
  if (!scope || !Object.keys(scope).length) return base;
  if (!Object.keys(base).length) return scope;
  return { $and: [base, scope] };
}

export async function GET(req, ctxParams) {
  try {
    const params = await ctxParams.params;
    const key = params.model;
    const Model = MODELS[key];
    const policy = POLICY[key];
    if (!Model || !policy) return fail('Unknown collection', 404);

    const session = await requireSession();
    if (!policy.read.includes(session.role)) return fail('You do not have access to this', 403);

    await dbConnect();
    const ctx = await getActorContext(session);

    const { searchParams } = new URL(req.url);
    let filter = mergeFilters(buildQuery(Model, searchParams), policy.scope(ctx));

    // ?enrolledIn=<subjectId> — the students enrolled in a subject
    const enrolledIn = searchParams.get('enrolledIn');
    if (key === 'users' && enrolledIn) {
      const subjects = await Subject.find({ _id: { $in: enrolledIn.split(',').filter(isId) } })
        .select('_id classRoom')
        .lean();
      filter = mergeFilters(filter, enrolledStudentsFilter(subjects));
    }

    const limit = Math.min(Number(searchParams.get('limit')) || 200, 1000);
    const skip = Number(searchParams.get('skip')) || 0;
    const sort = searchParams.get('sort') || '-createdAt';

    let query = Model.find(filter).sort(sort).skip(skip).limit(limit);
    const sel = selectFor(key);
    if (sel) query = query.select(sel);
    for (const p of POPULATE[key] || []) query = query.populate(p, 'name email role title amount classRoom subject deadline onlineClassLink teacher type maxMarks');

    const [items, total] = await Promise.all([query.lean(), Model.countDocuments(filter)]);
    return ok({ items, total });
  } catch (err) {
    return handleError(err);
  }
}

export async function POST(req, ctxParams) {
  try {
    const params = await ctxParams.params;
    const key = params.model;
    const Model = MODELS[key];
    const policy = POLICY[key];
    if (!Model || !policy) return fail('Unknown collection', 404);

    const session = await requireSession();
    if (!policy.write.includes(session.role)) return fail('You do not have permission to add this', 403);

    await dbConnect();
    const ctx = await getActorContext(session);
    const body = cleanLinks(key, stripProtected(await req.json()));

    /* --- collection-specific guards ------------------------------- */

    if (key === 'users') {
      if (!body.password) return fail('A password is required', 422);
      // A teacher may only create students.
      if (session.role === 'teacher' && body.role !== 'student') {
        return fail('Teachers can only create student accounts', 403);
      }
      body.passwordHash = await hashPassword(body.password);
      delete body.password;
      if (body.email) body.email = String(body.email).toLowerCase().trim();
      // a teacher can only enrol a new student into their own subjects
      if (session.role === 'teacher' && Array.isArray(body.subjects)) {
        body.subjects = body.subjects.filter((id) => ctx.subjectIds.includes(String(id)));
      }
      if (body.role !== 'student') delete body.classRoom;
    }

    if (key === 'lessonplans') {
      if (session.role === 'teacher') {
        body.teacher = ctx.uid;
        if (!ctx.subjectIds.includes(String(body.subject))) {
          return fail('You are not assigned to this subject', 403);
        }
      }
    }

    if (['marks', 'tasks', 'resources'].includes(key) && session.role === 'teacher') {
      if (body.subject && !ctx.subjectIds.includes(String(body.subject))) {
        return fail('You are not assigned to this subject', 403);
      }
    }

    if (key === 'submissions' && session.role === 'student') body.student = ctx.uid;
    if (key === 'fees' && Array.isArray(body.payments)) {
      body.payments = body.payments.map((p) => ({ ...p, recordedBy: ctx.uid, recordedAt: new Date() }));
    }

    // stamp the author where the schema has a slot for it
    if (Model.schema.paths.createdBy && !body.createdBy) body.createdBy = ctx.uid;
    if (Model.schema.paths.uploadedBy && !body.uploadedBy) body.uploadedBy = ctx.uid;
    if (Model.schema.paths.enteredBy && !body.enteredBy) body.enteredBy = ctx.uid;
    if (Model.schema.paths.markedBy && !body.markedBy) body.markedBy = ctx.uid;

    const doc = await Model.create(body);
    return ok({ item: doc.toObject() }, { status: 201 });
  } catch (err) {
    return handleError(err);
  }
}
