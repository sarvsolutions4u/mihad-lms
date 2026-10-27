import mongoose from 'mongoose';
import { Subject, User } from '@/models';

/**
 * Subject enrolment rules
 * -----------------------
 * A student is enrolled in a subject when EITHER
 *   - the subject is in their `subjects` list, OR
 *   - their `subjects` list is empty and the subject belongs to their class
 *     (so existing students keep seeing every subject of their batch until
 *     the office picks specific subjects for them).
 */

const oid = (v) => new mongoose.Types.ObjectId(String(v));

/** Mongo filter for the students enrolled in any of the given subjects. */
export function enrolledStudentsFilter(subjects) {
  const list = (Array.isArray(subjects) ? subjects : [subjects]).filter(Boolean);
  if (!list.length) return { role: 'student', _id: { $in: [] } };
  const ids = list.map((s) => oid(s._id || s));
  const classIds = [...new Set(list.map((s) => String(s.classRoom?._id || s.classRoom || '')).filter(Boolean))].map(oid);
  return {
    role: 'student',
    $or: [
      { subjects: { $in: ids } },
      ...(classIds.length ? [{ classRoom: { $in: classIds }, 'subjects.0': { $exists: false } }] : []),
    ],
  };
}

/** The subject ids a student (lean doc with classRoom + subjects) is enrolled in. */
export async function subjectIdsForStudent(student) {
  if (!student) return [];
  if (student.subjects?.length) return student.subjects.map((s) => String(s._id || s));
  if (!student.classRoom) return [];
  const subs = await Subject.find({ classRoom: student.classRoom._id || student.classRoom }).select('_id').lean();
  return subs.map((s) => String(s._id));
}

/** Is this student enrolled in this subject? */
export async function isEnrolled(studentId, subject) {
  const filter = { $and: [{ _id: oid(studentId) }, enrolledStudentsFilter([subject])] };
  return !!(await User.exists(filter));
}
