import { dbConnect } from '@/lib/db';
import { User } from '@/models';
import { getSession } from '@/lib/auth';
import { ok, handleError } from '@/lib/api';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const session = await getSession();
    if (!session) return ok({ user: null });

    await dbConnect();
    const user = await User.findById(session.uid)
      .select('name email role classRoom children admissionNo phone')
      .populate('classRoom', 'name onlineClassLink')
      .populate('children', 'name admissionNo classRoom')
      .lean();

    if (!user || user.active === false) return ok({ user: null });
    return ok({ user: { ...user, id: String(user._id) } });
  } catch (err) {
    return handleError(err);
  }
}
