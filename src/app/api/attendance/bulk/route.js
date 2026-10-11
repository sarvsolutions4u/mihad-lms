import { dbConnect } from '@/lib/db';
import { Attendance } from '@/models';
import { requireSession } from '@/lib/auth';
import { ok, fail, handleError } from '@/lib/api';

export const dynamic = 'force-dynamic';

/**
 * Mark a whole class in one go.
 * body: { classRoom, date, subject?, rows: [{ student, status, remark }] }
 */
export async function POST(req) {
  try {
    const session = await requireSession(['admin']);
    const { classRoom, date, subject, rows } = await req.json();

    if (!classRoom || !date || !Array.isArray(rows)) {
      return fail('classRoom, date and rows are required', 422);
    }

    await dbConnect();

    const ops = rows
      .filter((r) => r.student)
      .map((r) => ({
        updateOne: {
          filter: { student: r.student, date, subject: subject || null },
          update: {
            $set: {
              student: r.student,
              classRoom,
              subject: subject || null,
              date,
              status: r.status || 'present',
              remark: r.remark || '',
              markedBy: session.uid,
            },
          },
          upsert: true,
        },
      }));

    if (!ops.length) return fail('No students to mark', 422);
    const res = await Attendance.bulkWrite(ops, { ordered: false });

    return ok({
      saved: (res.upsertedCount || 0) + (res.modifiedCount || 0) + (res.matchedCount || 0),
    });
  } catch (err) {
    return handleError(err);
  }
}
