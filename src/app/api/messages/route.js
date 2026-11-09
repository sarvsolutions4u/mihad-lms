import mongoose from 'mongoose';
import { dbConnect } from '@/lib/db';
import { Thread, Message, Subject } from '@/models';
import { requireSession } from '@/lib/auth';
import { ok, fail, handleError } from '@/lib/api';
import { logActivity } from '@/lib/activity';
import { threadScope, unreadFilter, isParticipant, resolveRecipients, cleanRef, cleanAttachments, previewOf, LEARNER } from '@/lib/messages';

export const dynamic = 'force-dynamic';

const POP = [
  { path: 'learner', select: 'name role' },
  { path: 'student', select: 'name admissionNo classRoom', populate: { path: 'classRoom', select: 'name' } },
  { path: 'teacher', select: 'name' },
  { path: 'subject', select: 'name' },
  { path: 'classRoom', select: 'name' },
];

const esc = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * GET /api/messages?status=open|resolved&kind=doubt&q=&box=mine|all&teacher=<id>&before=<iso>
 * Conversations newest first. Admin sees every conversation (box=all, the default) or just the office's (box=mine).
 */
export async function GET(req) {
  try {
    const session = await requireSession();
    await dbConnect();
    const sp = new URL(req.url).searchParams;
    const me = new mongoose.Types.ObjectId(String(session.uid));
    const and = [threadScope(session)];
    if (session.role === 'admin' && sp.get('box') === 'mine') and.push({ toOffice: true });
    if (['open', 'resolved'].includes(sp.get('status'))) and.push({ status: sp.get('status') });
    if (['doubt', 'message'].includes(sp.get('kind'))) and.push({ kind: sp.get('kind') });
    if (sp.get('unread') === '1') and.push(unreadFilter(session));
    if (session.role === 'admin' && mongoose.Types.ObjectId.isValid(sp.get('teacher') || '')) and.push({ teacher: sp.get('teacher') });
    const q = (sp.get('q') || '').trim();
    if (q) and.push({ $or: [{ title: new RegExp(esc(q), 'i') }, { lastText: new RegExp(esc(q), 'i') }] });
    const before = sp.get('before');
    if (before && !Number.isNaN(Date.parse(before))) and.push({ lastMessageAt: { $lt: new Date(before) } });

    const limit = 30;
    const rows = await Thread.find({ $and: and }).sort({ lastMessageAt: -1 }).limit(limit + 1).populate(POP).lean();
    const more = rows.length > limit;
    const threads = rows.slice(0, limit).map((t) => {
      const mine = isParticipant(session, t);
      const read = (t.reads || []).some((r) => String(r.user) === String(me));
      return { ...t, reads: undefined, mine, unread: mine && !read && String(t.lastFrom) !== String(me) };
    });

    const [unread, openDoubts] = await Promise.all([
      Thread.countDocuments(unreadFilter(session)),
      Thread.countDocuments({ ...threadScope(session), kind: 'doubt', status: 'open' }),
    ]);
    return ok({ threads, more, next: more ? threads[threads.length - 1].lastMessageAt : null, unread, openDoubts });
  } catch (err) {
    return handleError(err);
  }
}

/**
 * POST /api/messages — start a conversation (or raise a doubt)
 * { kind: 'doubt'|'message', to: {...}, title?, text, ref?, attachments? }
 */
export async function POST(req) {
  try {
    const session = await requireSession();
    await dbConnect();
    const body = await req.json();
    const kind = body.kind === 'doubt' ? 'doubt' : 'message';
    if (kind === 'doubt' && !LEARNER.includes(session.role)) return fail('Only students and parents raise doubts', 403);

    const text = String(body.text || '').trim().slice(0, 4000);
    const ref = cleanRef(body.ref);
    const attachments = cleanAttachments(body.attachments);
    if (!text && !ref?.quote && !ref?.image && !attachments.length) return fail('Write your question first', 422);

    const sides = await resolveRecipients(session, body.to || {});
    let title = String(body.title || '').trim().slice(0, 120);
    if (!title) {
      if (kind === 'doubt' && ref?.fileName) title = `${ref.fileName.replace(/\.[a-z0-9]+$/i, '')}${ref.page ? ` · page ${ref.page}` : ''}`;
      else title = (text || ref?.quote || 'Message').replace(/\s+/g, ' ').slice(0, 70);
    }
    const now = new Date();
    const preview = previewOf(text, ref, attachments);
    const thread = await Thread.create({
      kind,
      title,
      ...sides,
      createdBy: session.uid,
      lastMessageAt: now,
      lastFrom: session.uid,
      lastText: preview,
      count: 1,
      reads: [{ user: session.uid, at: now }],
    });
    await Message.create({ thread: thread._id, from: session.uid, role: session.role, text, ref, attachments });

    const subjectName = sides.subject ? (await Subject.findById(sides.subject).select('name').lean())?.name : '';
    await logActivity({
      uid: session.uid,
      role: session.role,
      type: kind === 'doubt' ? 'doubt' : 'message',
      name: title,
      detail: kind === 'doubt' ? `Asked a doubt${subjectName ? '' : ' (office)'}` : 'New message',
      subject: sides.subject || undefined,
      req,
    });
    return ok({ thread: { _id: String(thread._id) } }, { status: 201 });
  } catch (err) {
    return handleError(err);
  }
}
