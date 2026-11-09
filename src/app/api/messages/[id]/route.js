import mongoose from 'mongoose';
import { dbConnect } from '@/lib/db';
import { Thread, Message } from '@/models';
import { requireSession } from '@/lib/auth';
import { ok, fail, handleError } from '@/lib/api';
import { logActivity } from '@/lib/activity';
import { canSeeThread, isParticipant, cleanAttachments, previewOf, LEARNER } from '@/lib/messages';

export const dynamic = 'force-dynamic';

async function load(id, session) {
  if (!mongoose.Types.ObjectId.isValid(String(id))) return null;
  const t = await Thread.findById(id)
    .populate('learner', 'name role')
    .populate({ path: 'student', select: 'name admissionNo classRoom', populate: { path: 'classRoom', select: 'name' } })
    .populate('teacher', 'name')
    .populate('subject', 'name')
    .populate('classRoom', 'name')
    .populate('resolvedBy', 'name role')
    .lean();
  return t && canSeeThread(session, t) ? t : null;
}

/** Learners see office replies as "Al Mihad Office"; staff see who wrote them. */
function shape(m, session) {
  const fromOffice = m.role === 'admin';
  const name = fromOffice && LEARNER.includes(session.role) ? 'Al Mihad Office' : m.from?.name || '';
  return { ...m, from: { _id: m.from?._id, name, role: m.role }, mine: String(m.from?._id) === String(session.uid) };
}

async function markRead(id, uid) {
  const user = new mongoose.Types.ObjectId(String(uid));
  await Thread.updateOne({ _id: id }, { $pull: { reads: { user } } });
  await Thread.updateOne({ _id: id }, { $push: { reads: { user, at: new Date() } } });
}

/** GET — the conversation with all its messages (marks it read). */
export async function GET(req, { params }) {
  try {
    const { id } = await params;
    const session = await requireSession();
    await dbConnect();
    const t = await load(id, session);
    if (!t) return fail('Conversation not found', 404);
    const messages = await Message.find({ thread: t._id }).sort({ createdAt: 1 }).populate('from', 'name').lean();
    await markRead(t._id, session.uid);
    return ok({
      thread: { ...t, reads: undefined, mine: isParticipant(session, t) },
      messages: messages.map((m) => shape(m, session)),
    });
  } catch (err) {
    return handleError(err);
  }
}

/** POST — reply { text, attachments } */
export async function POST(req, { params }) {
  try {
    const { id } = await params;
    const session = await requireSession();
    await dbConnect();
    const t = await load(id, session);
    if (!t) return fail('Conversation not found', 404);
    const body = await req.json();
    const text = String(body.text || '').trim().slice(0, 4000);
    const attachments = cleanAttachments(body.attachments);
    if (!text && !attachments.length) return fail('Write a reply first', 422);

    const now = new Date();
    const m = await Message.create({ thread: t._id, from: session.uid, role: session.role, text, attachments });
    const set = { lastMessageAt: now, lastFrom: session.uid, lastText: previewOf(text, null, attachments), reads: [{ user: session.uid, at: now }] };
    // a learner writing again on an answered doubt re-opens it
    if (t.status === 'resolved' && LEARNER.includes(session.role)) Object.assign(set, { status: 'open', resolvedBy: null, resolvedAt: null });
    await Thread.updateOne({ _id: t._id }, { $set: set, $inc: { count: 1 } });

    await logActivity({
      uid: session.uid,
      role: session.role,
      type: 'message',
      name: t.title,
      detail: t.kind === 'doubt' ? (LEARNER.includes(session.role) ? 'Follow-up on a doubt' : 'Answered a doubt') : 'Replied',
      subject: t.subject?._id || undefined,
      req,
    });
    const full = await Message.findById(m._id).populate('from', 'name').lean();
    return ok({ message: shape(full, session) }, { status: 201 });
  } catch (err) {
    return handleError(err);
  }
}

/** PATCH — { status: 'resolved' | 'open' } */
export async function PATCH(req, { params }) {
  try {
    const { id } = await params;
    const session = await requireSession();
    await dbConnect();
    const t = await load(id, session);
    if (!t) return fail('Conversation not found', 404);
    const { status } = await req.json();
    if (!['open', 'resolved'].includes(status)) return fail('Unknown status', 422);
    await Thread.updateOne(
      { _id: t._id },
      { $set: status === 'resolved' ? { status, resolvedBy: session.uid, resolvedAt: new Date() } : { status, resolvedBy: null, resolvedAt: null } }
    );
    return ok({ status });
  } catch (err) {
    return handleError(err);
  }
}
