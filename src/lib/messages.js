import mongoose from 'mongoose';
import { Thread, Message, Subject, User, Resource, Task, LessonPlan } from '@/models';
import { subjectIdsForStudent, isEnrolled } from '@/lib/enrol';

/**
 * Messages & doubts — who can see and start what
 * ----------------------------------------------
 *   student  ↔ the trainer of any subject they are enrolled in, and the office
 *   parent   ↔ the trainers of their children's subjects, and the office
 *   trainer  ↔ students enrolled in their own subjects, and the office
 *   admin    reads every conversation (the full log) and answers as the office
 *
 * Trainers never see each other's conversations.
 */

const oid = (v) => new mongoose.Types.ObjectId(String(v));
const isId = (v) => mongoose.Types.ObjectId.isValid(String(v || ''));
const same = (a, b) => a != null && b != null && String(a._id || a) === String(b._id || b);

export const LEARNER = ['student', 'parent'];

/** Mongo filter: the conversations this person may read. */
export function threadScope(session) {
  if (session.role === 'admin') return {};
  if (session.role === 'teacher') return { teacher: oid(session.uid) };
  return { learner: oid(session.uid) };
}

export function canSeeThread(session, t) {
  if (!t) return false;
  if (session.role === 'admin') return true;
  if (session.role === 'teacher') return same(t.teacher, session.uid);
  return same(t.learner, session.uid);
}

/** Is this person one of the two sides (so it counts as unread for them)? Admins are "the office". */
export function isParticipant(session, t) {
  if (session.role === 'admin') return !!t.toOffice;
  return canSeeThread(session, t);
}

/** Filter for "unread for me" inside the scope above. */
export function unreadFilter(session) {
  const me = oid(session.uid);
  const base = { lastFrom: { $ne: me }, 'reads.user': { $ne: me } };
  if (session.role === 'admin') return { ...base, toOffice: true };
  return { ...threadScope(session), ...base };
}

/** Students the person speaks for: a student → themself, a parent → their children. */
async function learnerStudents(session) {
  if (session.role === 'student') {
    const me = await User.findById(session.uid).select('name classRoom subjects').lean();
    return me ? [me] : [];
  }
  if (session.role === 'parent') {
    const me = await User.findById(session.uid).select('children').lean();
    return User.find({ _id: { $in: me?.children || [] }, role: 'student' }).select('name classRoom subjects').lean();
  }
  return [];
}

/**
 * Who this person can start a conversation with.
 * Learners: [{ student, studentName, subjects: [{ subject, subjectName, classRoomName, teacher, teacherName }] }]
 * Trainers: their subjects, each with its students. Admin: searched separately.
 */
export async function contactsFor(session) {
  if (LEARNER.includes(session.role)) {
    const kids = await learnerStudents(session);
    const out = [];
    for (const k of kids) {
      const ids = await subjectIdsForStudent(k);
      const subs = await Subject.find({ _id: { $in: ids } })
        .populate('teacher', 'name')
        .populate('classRoom', 'name')
        .sort('name')
        .lean();
      out.push({
        student: String(k._id),
        studentName: k.name,
        subjects: subs.map((s) => ({
          subject: String(s._id),
          subjectName: s.name,
          classRoomName: s.classRoom?.name || '',
          teacher: s.teacher ? String(s.teacher._id) : '',
          teacherName: s.teacher?.name || '',
        })),
      });
    }
    return { learners: out };
  }
  if (session.role === 'teacher') {
    const subs = await Subject.find({ teacher: session.uid }).populate('classRoom', 'name').sort('name').lean();
    const { enrolledStudentsFilter } = await import('@/lib/enrol');
    const subjects = [];
    for (const s of subs) {
      const students = await User.find({ ...enrolledStudentsFilter([s]), active: { $ne: false } })
        .select('name admissionNo')
        .sort('name')
        .lean();
      subjects.push({
        subject: String(s._id),
        subjectName: s.name,
        classRoomName: s.classRoom?.name || '',
        students: students.map((u) => ({ _id: String(u._id), name: u.name, admissionNo: u.admissionNo || '' })),
      });
    }
    return { subjects };
  }
  return {};
}

/**
 * Which subject a course file belongs to — so "Raise a doubt" goes to the
 * right trainer automatically. Only subjects the learner is enrolled in count.
 */
export async function subjectForFile(session, fileId, link) {
  let url;
  if (/^[a-f0-9]{32}$/.test(String(fileId || ''))) url = new RegExp(`^/api/files/${fileId}`);
  else if (/^https?:\/\//.test(String(link || '')) && String(link).length < 600) url = String(link);
  else return null;
  const [r, t, p] = await Promise.all([
    Resource.find({ url, subject: { $ne: null } }).select('subject').lean(),
    Task.find({ attachmentUrl: url, subject: { $ne: null } }).select('subject').lean(),
    LessonPlan.find({ 'attachments.url': url }).select('subject').lean(),
  ]);
  const ids = [...new Set([...r, ...t, ...p].map((x) => String(x.subject)).filter(Boolean))];
  if (!ids.length) return null;
  const kids = await learnerStudents(session);
  for (const k of kids) {
    const mine = await subjectIdsForStudent(k);
    const hit = ids.find((id) => mine.includes(id));
    if (hit) return { subject: hit, student: String(k._id) };
  }
  return null;
}

const httpError = (msg, status) => Object.assign(new Error(msg), { status });

/**
 * Work out the two sides of a new conversation from what the sender picked.
 *   to.kind = 'trainer' { subject, student? }   (learner → the subject's trainer)
 *           = 'office'  { student? }            (anyone → the office)
 *           = 'student' { student, subject? }   (trainer/admin → a student)
 *           = 'parent'  { parent }              (admin → a parent)
 *           = 'teacher' { teacher }             (admin → a trainer)
 */
export async function resolveRecipients(session, to = {}) {
  const role = session.role;
  const out = { learner: null, student: null, teacher: null, toOffice: false, subject: null, classRoom: null };

  if (LEARNER.includes(role)) {
    const kids = await learnerStudents(session);
    if (!kids.length) throw httpError('No student linked to your account', 403);
    const kid = to.student ? kids.find((k) => same(k._id, to.student)) : kids[0];
    if (!kid) throw httpError('That student is not linked to your account', 403);
    out.learner = session.uid;
    out.student = kid._id;
    if (to.kind === 'office') {
      out.toOffice = true;
      out.classRoom = kid.classRoom || null;
      return out;
    }
    if (to.kind !== 'trainer' || !isId(to.subject)) throw httpError('Choose the subject your question is about', 422);
    const subject = await Subject.findById(to.subject).select('teacher classRoom name').lean();
    if (!subject) throw httpError('Subject not found', 404);
    if (!(await isEnrolled(kid._id, subject))) throw httpError('You can only ask trainers of your own subjects', 403);
    if (!subject.teacher) throw httpError(`No trainer is assigned to ${subject.name} yet — send it to the office instead`, 422);
    out.teacher = subject.teacher;
    out.subject = subject._id;
    out.classRoom = subject.classRoom;
    return out;
  }

  if (role === 'teacher') {
    if (to.kind === 'office') {
      out.teacher = session.uid;
      out.toOffice = true;
      return out;
    }
    if (to.kind !== 'student' || !isId(to.student) || !isId(to.subject)) throw httpError('Choose the subject and the student', 422);
    const subject = await Subject.findById(to.subject).select('teacher classRoom').lean();
    if (!subject || !same(subject.teacher, session.uid)) throw httpError('That is not one of your subjects', 403);
    if (!(await isEnrolled(to.student, subject))) throw httpError('That student is not in this subject', 403);
    out.learner = to.student;
    out.student = to.student;
    out.teacher = session.uid;
    out.subject = subject._id;
    out.classRoom = subject.classRoom;
    return out;
  }

  // admin — writes as the office
  out.toOffice = true;
  if (to.kind === 'teacher' && isId(to.teacher)) {
    const t = await User.findOne({ _id: to.teacher, role: 'teacher' }).select('_id').lean();
    if (!t) throw httpError('Trainer not found', 404);
    out.teacher = t._id;
    return out;
  }
  if (to.kind === 'student' && isId(to.student)) {
    const s = await User.findOne({ _id: to.student, role: 'student' }).select('classRoom').lean();
    if (!s) throw httpError('Student not found', 404);
    out.learner = s._id;
    out.student = s._id;
    out.classRoom = s.classRoom || null;
    return out;
  }
  if (to.kind === 'parent' && isId(to.parent)) {
    const p = await User.findOne({ _id: to.parent, role: 'parent' }).select('children').lean();
    if (!p) throw httpError('Parent not found', 404);
    out.learner = p._id;
    out.student = p.children?.[0] || null;
    return out;
  }
  throw httpError('Choose who to send this to', 422);
}

/** Clean the reference to course material sent with a doubt. */
export function cleanRef(ref) {
  if (!ref || typeof ref !== 'object') return undefined;
  const out = {};
  if (/^[a-f0-9]{32}$/.test(String(ref.fileId || ''))) out.fileId = ref.fileId;
  if (ref.fileName) out.fileName = String(ref.fileName).slice(0, 200);
  if (/^https?:\/\//.test(String(ref.link || '')) && String(ref.link).length < 600) out.link = String(ref.link);
  if (Number(ref.page) > 0) out.page = Math.floor(Number(ref.page));
  if (Number(ref.seconds) >= 0 && ref.seconds !== '' && ref.seconds != null) out.seconds = Math.floor(Number(ref.seconds));
  if (ref.quote) out.quote = String(ref.quote).replace(/\s+\n/g, '\n').trim().slice(0, 2000);
  if (/^\/api\/files\/[a-f0-9]{32}$/.test(String(ref.image || ''))) out.image = ref.image;
  return Object.keys(out).length ? out : undefined;
}

export function cleanAttachments(list) {
  return (Array.isArray(list) ? list : [])
    .filter((a) => /^\/api\/files\/[a-f0-9]{32}$/.test(String(a?.url || '')))
    .slice(0, 5)
    .map((a) => ({ url: a.url, name: String(a.name || 'Attachment').slice(0, 180), size: Number(a.size) || 0 }));
}

/** Short preview for the inbox. */
export function previewOf(text, ref, attachments) {
  const t = String(text || '').replace(/\s+/g, ' ').trim();
  if (t) return t.slice(0, 140);
  if (ref?.quote) return `“${ref.quote.replace(/\s+/g, ' ').slice(0, 120)}”`;
  if (ref?.image) return 'Snip of the notes';
  if (attachments?.length) return `📎 ${attachments[0].name}`;
  return '';
}

/** May this person open a file that was sent in a message? */
export async function canOpenMessageFile(session, fileId) {
  if (session.role === 'admin') return true;
  const url = `/api/files/${fileId}`;
  const msgs = await Message.find({ $or: [{ 'attachments.url': url }, { 'ref.image': url }] })
    .select('thread')
    .limit(20)
    .lean();
  if (!msgs.length) return false;
  const threads = await Thread.find({ _id: { $in: msgs.map((m) => m.thread) } }).lean();
  return threads.some((t) => canSeeThread(session, t));
}
