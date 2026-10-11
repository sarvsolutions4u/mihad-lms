import { dbConnect } from '@/lib/db';
import { User, ClassRoom } from '@/models';
import { requireSession, hashPassword } from '@/lib/auth';
import { readSheet, pick } from '@/lib/sheet';
import { ok, fail, handleError } from '@/lib/api';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * Bulk-create students (and optionally their parent) from an Excel/CSV file.
 *
 * Expected columns (header row, case/space insensitive):
 *   Name | Email | Password | Admission No | Phone |
 *   Parent Name | Parent Email | Parent Phone
 *
 * multipart/form-data: file, classRoom, defaultPassword?
 */
export async function POST(req) {
  try {
    await requireSession(['admin', 'teacher']);
    const form = await req.formData();
    const file = form.get('file');
    const classRoomId = form.get('classRoom');
    const defaultPassword = (form.get('defaultPassword') || 'Student@123').toString();

    if (!file || typeof file === 'string') return fail('Please choose an .xlsx or .csv file', 422);
    if (!classRoomId) return fail('Please choose a class', 422);

    await dbConnect();
    const cls = await ClassRoom.findById(classRoomId).lean();
    if (!cls) return fail('Class not found', 404);

    const buf = Buffer.from(await file.arrayBuffer());
    const rows = await readSheet(buf, file.name || '');

    if (rows === null) return fail('The file has no worksheet', 422);
    if (!rows.length) return fail('The file has no rows below the header', 422);

    const created = [];
    const skipped = [];
    const fallbackHash = await hashPassword(defaultPassword);

    for (const row of rows) {
      const lineNo = row.__line;
      const name = pick(row, 'name', 'studentname', 'fullname');
      const email = pick(row, 'email', 'emailaddress', 'studentemail').toLowerCase();

      if (!name || !email) {
        skipped.push({ line: lineNo, reason: 'Name and Email are both required' });
        continue;
      }

      const exists = await User.findOne({ email }).select('_id').lean();
      if (exists) {
        skipped.push({ line: lineNo, reason: `${email} already exists` });
        continue;
      }

      const pwd = pick(row, 'password');
      const student = await User.create({
        name,
        email,
        passwordHash: pwd ? await hashPassword(pwd) : fallbackHash,
        role: 'student',
        classRoom: classRoomId,
        admissionNo: pick(row, 'admissionno', 'admno', 'rollno', 'rollnumber'),
        phone: pick(row, 'phone', 'mobile', 'contact', 'phonenumber'),
      });

      // Optional parent account, linked to this child
      const pEmail = pick(row, 'parentemail', 'guardianemail').toLowerCase();
      const pName = pick(row, 'parentname', 'guardianname', 'fathername', 'mothername');
      if (pEmail) {
        let parent = await User.findOne({ email: pEmail });
        if (!parent) {
          parent = await User.create({
            name: pName || `Parent of ${name}`,
            email: pEmail,
            passwordHash: fallbackHash,
            role: 'parent',
            phone: pick(row, 'parentphone', 'guardianphone'),
            children: [student._id],
          });
        } else if (!parent.children.some((c) => String(c) === String(student._id))) {
          parent.children.push(student._id);
          await parent.save();
        }
      }

      created.push({ name, email });
    }

    return ok({
      createdCount: created.length,
      skippedCount: skipped.length,
      created,
      skipped,
      defaultPasswordUsed: defaultPassword,
    });
  } catch (err) {
    return handleError(err);
  }
}
