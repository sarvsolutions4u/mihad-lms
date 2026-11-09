import { dbConnect } from '@/lib/db';
import { User } from '@/models';
import { requireSession } from '@/lib/auth';
import { ok, handleError } from '@/lib/api';
import { contactsFor, subjectForFile, LEARNER } from '@/lib/messages';

export const dynamic = 'force-dynamic';

const esc = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * GET /api/messages/contacts?file=<fileId>&q=<search>
 * Who the signed-in person can write to. With ?file= (from the viewer) it also
 * suggests the subject that file belongs to, so the doubt goes to its trainer.
 */
export async function GET(req) {
  try {
    const session = await requireSession();
    await dbConnect();
    const sp = new URL(req.url).searchParams;
    if (session.role === 'admin') {
      const q = (sp.get('q') || '').trim();
      const filter = { role: { $in: ['student', 'parent', 'teacher'] }, active: { $ne: false } };
      if (q) filter.$or = [{ name: new RegExp(esc(q), 'i') }, { email: new RegExp(esc(q), 'i') }, { admissionNo: new RegExp(esc(q), 'i') }];
      const people = await User.find(filter).select('name role admissionNo classRoom').populate('classRoom', 'name').sort('name').limit(25).lean();
      return ok({ people });
    }
    const out = await contactsFor(session);
    if (LEARNER.includes(session.role) && (sp.get('file') || sp.get('link'))) out.suggested = await subjectForFile(session, sp.get('file'), sp.get('link'));
    return ok(out);
  } catch (err) {
    return handleError(err);
  }
}
