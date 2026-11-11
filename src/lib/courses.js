import mongoose from 'mongoose';
import { Course, SpeakingAttempt, Subject } from '@/models';
import { getActorContext } from '@/lib/access';
import { COURSE_ITEM_KINDS } from '@/models';
import spokenEnglish from '@/data/course-library/spoken-english-everyday.json';

/**
 * Courses — who sees and manages what
 * -----------------------------------
 *   student  sees published courses linked to a subject they are enrolled in
 *   trainer  manages courses linked to their own subjects (or that they created),
 *            and reviews those students' speaking practice
 *   admin    everything
 */

export const LIBRARY = [spokenEnglish];

const oid = (v) => new mongoose.Types.ObjectId(String(v));

export async function courseContext(session) {
  return getActorContext(session);
}

export function courseScope(session, ctx) {
  if (session.role === 'admin') return {};
  const subs = ctx.subjectIds.map(oid);
  if (session.role === 'teacher') return { $or: [{ subjects: { $in: subs } }, { createdBy: oid(session.uid) }] };
  return { published: true, subjects: { $in: subs } };
}

export function canManage(session, ctx, course) {
  if (session.role === 'admin') return true;
  if (session.role !== 'teacher') return false;
  if (String(course.createdBy?._id || course.createdBy) === String(session.uid)) return true;
  return (course.subjects || []).some((s) => ctx.subjectIds.includes(String(s._id || s)));
}

/** All items in course order, each with its unit. */
export function flatItems(course) {
  const out = [];
  for (const u of course.units || []) for (const it of u.items || []) out.push({ ...it, unitId: String(u._id), unitTitle: u.title });
  return out;
}

/** May this trainer play a student's speaking recording? (it belongs to a course they manage) */
export async function canReviewRecording(session, fileId) {
  const ctx = await getActorContext(session);
  const attempts = await SpeakingAttempt.find({ audio: `/api/files/${fileId}` }).select('course').lean();
  if (!attempts.length) return false;
  const courses = await Course.find({ _id: { $in: attempts.map((a) => a.course) } }).select('subjects createdBy').lean();
  return courses.some((c) => canManage(session, ctx, c));
}

/* ---------- cleaning what the editor sends ---------- */

const str = (v, max = 200) => String(v ?? '').slice(0, max);
const fileUrl = (v) => (/^\/api\/files\/[a-f0-9]{32}$/.test(String(v || '')) ? String(v) : '');
const audioUrl = (v) => (/^\/api\/files\/[a-f0-9]{32}$/.test(String(v || '')) || /^\/courses\/[a-z0-9-]+\/[a-z0-9-]+\.mp3$/.test(String(v || '')) ? String(v) : '');
const keepId = (v) => (mongoose.Types.ObjectId.isValid(String(v || '')) ? oid(v) : undefined);

export function cleanUnits(units) {
  return (Array.isArray(units) ? units : []).slice(0, 40).map((u) => ({
    _id: keepId(u._id),
    key: str(u.key, 40) || undefined,
    title: str(u.title, 160) || 'Untitled unit',
    summary: str(u.summary, 600),
    items: (Array.isArray(u.items) ? u.items : []).slice(0, 60).map((it) => {
      const kind = COURSE_ITEM_KINDS.includes(it.kind) ? it.kind : 'notes';
      return {
        _id: keepId(it._id),
        key: str(it.key, 60) || undefined,
        kind,
        title: str(it.title, 160) || 'Untitled',
        minutes: Math.max(0, Math.min(120, Number(it.minutes) || 0)),
        body: str(it.body, 20000),
        lines:
          kind === 'conversation'
            ? (Array.isArray(it.lines) ? it.lines : []).slice(0, 80).map((l) => ({
                speaker: str(l.speaker, 40),
                voice: ['f', 'm'].includes(l.voice) ? l.voice : '',
                text: str(l.text, 600),
                audio: audioUrl(l.audio),
              }))
            : [],
        audio: audioUrl(it.audio),
        audioName: str(it.audioName, 160),
        file: fileUrl(it.file?.url) ? { url: it.file.url, name: str(it.file.name, 160), size: Number(it.file.size) || 0 } : undefined,
        prompt: str(it.prompt, 3000),
        tips: str(it.tips, 1000),
        maxSecs: Math.max(15, Math.min(300, Number(it.maxSecs) || 90)),
      };
    }),
  }));
}

/** Trainers may only link/unlink their own subjects; links to other trainers' subjects stay as they are. */
export async function mergeSubjects(session, ctx, current = [], requested = []) {
  const want = [...new Set((requested || []).map(String))].filter((id) => mongoose.Types.ObjectId.isValid(id));
  if (session.role === 'admin') {
    const found = await Subject.find({ _id: { $in: want } }).select('_id').lean();
    return found.map((s) => s._id);
  }
  const mine = new Set(ctx.subjectIds);
  const keep = (current || []).map((s) => String(s._id || s)).filter((id) => !mine.has(id));
  const add = want.filter((id) => mine.has(id));
  return [...new Set([...keep, ...add])].map(oid);
}

/** A copy of a built-in course, ready to save. */
export function fromLibrary(key) {
  const c = LIBRARY.find((x) => x.key === key);
  if (!c) return null;
  return {
    title: c.title,
    subtitle: c.subtitle,
    description: c.description,
    howTo: c.howTo || [],
    level: c.level,
    category: c.category,
    libraryKey: c.key,
    units: cleanUnits(c.units),
  };
}
