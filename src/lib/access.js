import { User, Subject } from '@/models';

/**
 * Resolve everything we need to scope queries for the signed-in person:
 *   admin   -> sees everything
 *   teacher -> the subjects assigned to them, and those subjects' classes
 *   student -> their own class + their own record
 *   parent  -> their children, and their children's classes
 */
export async function getActorContext(session) {
  const ctx = {
    uid: String(session.uid),
    role: session.role,
    classIds: [],
    subjectIds: [],
    studentIds: [],
  };

  if (session.role === 'admin') return ctx;

  if (session.role === 'teacher') {
    const subjects = await Subject.find({ teacher: ctx.uid }).select('_id classRoom').lean();
    ctx.subjectIds = subjects.map((s) => String(s._id));
    ctx.classIds = [...new Set(subjects.map((s) => String(s.classRoom)).filter(Boolean))];
    const students = await User.find({ role: 'student', classRoom: { $in: ctx.classIds } })
      .select('_id')
      .lean();
    ctx.studentIds = students.map((s) => String(s._id));
    return ctx;
  }

  if (session.role === 'student') {
    const me = await User.findById(ctx.uid).select('classRoom').lean();
    ctx.studentIds = [ctx.uid];
    if (me?.classRoom) ctx.classIds = [String(me.classRoom)];
    const subjects = await Subject.find({ classRoom: { $in: ctx.classIds } }).select('_id').lean();
    ctx.subjectIds = subjects.map((s) => String(s._id));
    return ctx;
  }

  if (session.role === 'parent') {
    const me = await User.findById(ctx.uid).select('children').lean();
    ctx.studentIds = (me?.children || []).map(String);
    const kids = await User.find({ _id: { $in: ctx.studentIds } }).select('classRoom').lean();
    ctx.classIds = [...new Set(kids.map((k) => String(k.classRoom)).filter(Boolean))];
    const subjects = await Subject.find({ classRoom: { $in: ctx.classIds } }).select('_id').lean();
    ctx.subjectIds = subjects.map((s) => String(s._id));
    return ctx;
  }

  return ctx;
}

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
      return { classRoom: { $in: ctx.classIds } };
    },
  },

  users: {
    read: ALL,
    // Admin creates anyone; a teacher may create students (per the brief).
    write: ['admin', 'teacher'],
    scope: (ctx) => {
      if (ctx.role === 'admin') return {};
      if (ctx.role === 'teacher') {
        return { $or: [{ _id: ctx.uid }, { role: 'student', classRoom: { $in: ctx.classIds } }, { role: 'teacher' }] };
      }
      if (ctx.role === 'student') return { _id: ctx.uid };
      // parent: self + own children
      return { _id: { $in: [ctx.uid, ...ctx.studentIds] } };
    },
  },

  timetable: {
    read: ALL,
    write: ['admin'], // "Class time table, attendance ... will be updated by admin"
    scope: (ctx) => (ctx.role === 'admin' ? {} : { classRoom: { $in: ctx.classIds } }),
  },

  attendance: {
    read: ALL,
    write: ['admin'],
    scope: (ctx) => {
      if (ctx.role === 'admin') return {};
      if (ctx.role === 'teacher') return { classRoom: { $in: ctx.classIds } };
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
      return { classRoom: { $in: ctx.classIds } };
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
    scope: (ctx) => (ctx.role === 'admin' ? {} : { classRoom: { $in: ctx.classIds } }),
  },

  tasks: {
    read: ALL,
    write: ['admin', 'teacher'],
    scope: (ctx) => (ctx.role === 'admin' ? {} : { classRoom: { $in: ctx.classIds } }),
  },

  submissions: {
    read: ALL,
    write: ['admin', 'teacher', 'student'],
    scope: (ctx) => {
      if (ctx.role === 'admin') return {};
      if (ctx.role === 'teacher') return {};
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
  announcements: ['classRoom', 'createdBy'],
};

const SELECT = {
  users: 'name email role classRoom subjects children admissionNo phone active createdAt',
  default: '',
};

export function selectFor(key) {
  return SELECT[key] || SELECT.default;
}
