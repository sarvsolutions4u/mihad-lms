import { User, Subject } from '@/models';
import { enrolledStudentsFilter, subjectIdsForStudent } from '@/lib/enrol';

/**
 * Resolve everything we need to scope queries for the signed-in person:
 *   admin   -> sees everything
 *   teacher -> the subjects assigned to them, their classes, and the students
 *              enrolled in those subjects
 *   student -> only the subjects they are enrolled in (+ their own record)
 *   parent  -> their children, and the subjects their children are enrolled in
 *
 *   classIds     classes the person can see anything in
 *   homeClassIds the student's own class(es) — for class-wide resources
 */
export async function getActorContext(session) {
  const ctx = {
    uid: String(session.uid),
    role: session.role,
    classIds: [],
    homeClassIds: [],
    subjectIds: [],
    studentIds: [],
  };

  if (session.role === 'admin') return ctx;

  if (session.role === 'teacher') {
    const subjects = await Subject.find({ teacher: ctx.uid }).select('_id classRoom').lean();
    ctx.subjectIds = subjects.map((s) => String(s._id));
    ctx.classIds = [...new Set(subjects.map((s) => String(s.classRoom)).filter(Boolean))];
    if (subjects.length) {
      const students = await User.find(enrolledStudentsFilter(subjects)).select('_id').lean();
      ctx.studentIds = students.map((s) => String(s._id));
    }
    return ctx;
  }

  let learners = [];
  if (session.role === 'student') {
    const me = await User.findById(ctx.uid).select('classRoom subjects').lean();
    learners = me ? [me] : [];
    ctx.studentIds = [ctx.uid];
  } else if (session.role === 'parent') {
    const me = await User.findById(ctx.uid).select('children').lean();
    ctx.studentIds = (me?.children || []).map(String);
    learners = await User.find({ _id: { $in: ctx.studentIds } }).select('classRoom subjects').lean();
  }

  const subjectIds = new Set();
  for (const l of learners) (await subjectIdsForStudent(l)).forEach((id) => subjectIds.add(id));
  ctx.subjectIds = [...subjectIds];
  ctx.homeClassIds = [...new Set(learners.map((l) => String(l.classRoom || '')).filter(Boolean))];
  const subjectClasses = ctx.subjectIds.length
    ? await Subject.find({ _id: { $in: ctx.subjectIds } }).select('classRoom').lean()
    : [];
  ctx.classIds = [...new Set([...ctx.homeClassIds, ...subjectClasses.map((s) => String(s.classRoom))])];
  return ctx;
}

/** For learners: items tied to an enrolled subject, or class-wide items of their own class. */
const learnerSubjectScope = (ctx) => ({
  $or: [
    { subject: { $in: ctx.subjectIds } },
    { subject: null, classRoom: { $in: ctx.homeClassIds } },
  ],
});

const ALL = ['admin', 'teacher', 'student', 'parent'];

/**
 * Per-collection rules.
 *   read  : roles allowed to read
 *   write : roles allowed to create / update / delete
 *   scope : extra Mongo filter applied for non-admins
 */
export const POLICY = {
  classrooms: {
    read: ALL,
    write: ['admin'],
    scope: (ctx) => (ctx.role === 'admin' ? {} : { _id: { $in: ctx.classIds } }),
  },

  subjects: {
    read: ALL,
    write: ['admin'],
    scope: (ctx) => {
      if (ctx.role === 'admin') return {};
      if (ctx.role === 'teacher') return { $or: [{ teacher: ctx.uid }, { classRoom: { $in: ctx.classIds } }] };
      return { _id: { $in: ctx.subjectIds } };
    },
  },

  users: {
    read: ALL,
    // Admin creates anyone; a teacher may create students (per the brief).
    write: ['admin', 'teacher'],
    scope: (ctx) => {
      if (ctx.role === 'admin') return {};
      if (ctx.role === 'teacher') {
        return { $or: [{ _id: ctx.uid }, { _id: { $in: ctx.studentIds } }, { role: 'teacher' }] };
      }
      if (ctx.role === 'student') return { _id: ctx.uid };
      // parent: self + own children
      return { _id: { $in: [ctx.uid, ...ctx.studentIds] } };
    },
  },

  timetable: {
    read: ALL,
    write: ['admin'],
    scope: (ctx) => {
      if (ctx.role === 'admin') return {};
      if (ctx.role === 'teacher') return { classRoom: { $in: ctx.classIds } };
      return { subject: { $in: ctx.subjectIds } };
    },
  },

  attendance: {
    read: ALL,
    write: ['admin'], // teachers mark through /api/attendance/bulk (checked per subject)
    scope: (ctx) => {
      if (ctx.role === 'admin') return {};
      if (ctx.role === 'teacher') return { $or: [{ subject: { $in: ctx.subjectIds } }, { student: { $in: ctx.studentIds } }] };
      return { student: { $in: ctx.studentIds } };
    },
  },

  fees: {
    // "fee details also updated by admin which is only viewable to parents"
    read: ['admin', 'parent'],
    write: ['admin'],
    scope: (ctx) => (ctx.role === 'admin' ? {} : { student: { $in: ctx.studentIds } }),
  },

  lessonplans: {
    read: ALL,
    write: ['admin', 'teacher'],
    scope: (ctx) => {
      if (ctx.role === 'admin') return {};
      if (ctx.role === 'teacher') return { $or: [{ teacher: ctx.uid }, { subject: { $in: ctx.subjectIds } }] };
      return { subject: { $in: ctx.subjectIds } };
    },
  },

  marks: {
    read: ALL,
    write: ['admin', 'teacher'],
    scope: (ctx) => {
      if (ctx.role === 'admin') return {};
      if (ctx.role === 'teacher') return { subject: { $in: ctx.subjectIds } };
      return { student: { $in: ctx.studentIds } };
    },
  },

  resources: {
    read: ALL,
    write: ['admin', 'teacher'],
    scope: (ctx) => {
      if (ctx.role === 'admin') return {};
      if (ctx.role === 'teacher') return { classRoom: { $in: ctx.classIds } };
      return learnerSubjectScope(ctx);
    },
  },

  tasks: {
    read: ALL,
    write: ['admin', 'teacher'],
    scope: (ctx) => {
      if (ctx.role === 'admin') return {};
      if (ctx.role === 'teacher') return { classRoom: { $in: ctx.classIds } };
      return { subject: { $in: ctx.subjectIds } };
    },
  },

  submissions: {
    read: ALL,
    write: ['admin', 'teacher', 'student'],
    scope: (ctx) => {
      if (ctx.role === 'admin') return {};
      if (ctx.role === 'teacher') return { student: { $in: ctx.studentIds } };
      return { student: { $in: ctx.studentIds } };
    },
  },

  announcements: {
    read: ALL,
    write: ['admin'],
    scope: (ctx) => {
      if (ctx.role === 'admin') return {};
      const audienceKey = { teacher: 'teachers', student: 'students', parent: 'parents' }[ctx.role];
      return {
        audiences: { $in: ['all', audienceKey] },
        $or: [{ classRoom: null }, { classRoom: { $exists: false } }, { classRoom: { $in: ctx.classIds } }],
      };
    },
  },
};

/** Fields the client is never allowed to set directly. */
export const PROTECTED_FIELDS = ['passwordHash', '_id', '__v', 'createdAt', 'updatedAt'];

export function stripProtected(body) {
  const out = { ...body };
  for (const f of PROTECTED_FIELDS) delete out[f];
  return out;
}

/** Populate rules per collection so lists come back readable. */
export const POPULATE = {
  users: ['classRoom', 'subjects', 'children'],
  subjects: ['classRoom', 'teacher'],
  timetable: ['classRoom', 'subject', 'teacher'],
  attendance: ['student', 'classRoom', 'subject'],
  fees: ['student'],
  lessonplans: ['classRoom', 'subject', 'teacher'],
  marks: ['student', 'subject', 'classRoom', 'lessonPlan'],
  resources: ['classRoom', 'subject', 'uploadedBy'],
  tasks: ['classRoom', 'subject', 'createdBy'],
  submissions: ['task', 'student'],
  // (fees.payments.recordedBy is left as an id)
  announcements: ['classRoom', 'createdBy'],
};

const SELECT = {
  users: 'name email role classRoom subjects children admissionNo phone active createdAt lastLoginAt',
  default: '',
};

export function selectFor(key) {
  return SELECT[key] || SELECT.default;
}
