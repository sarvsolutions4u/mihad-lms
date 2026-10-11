import { dbConnect } from '@/lib/db';
import { User } from '@/models';
import { requireSession, hashPassword, verifyPassword } from '@/lib/auth';
import { ok, fail, handleError } from '@/lib/api';

export const dynamic = 'force-dynamic';

/** Change your own password. */
export async function POST(req) {
  try {
    const session = await requireSession();
    const { currentPassword, newPassword } = await req.json();
    if (!newPassword || newPassword.length < 6) {
      return fail('The new password must be at least 6 characters', 422);
    }

    await dbConnect();
    const user = await User.findById(session.uid);
    if (!user) return fail('Account not found', 404);

    const good = await verifyPassword(currentPassword || '', user.passwordHash);
    if (!good) return fail('Your current password is not correct', 401);

    user.passwordHash = await hashPassword(newPassword);
    await user.save();
    return ok({});
  } catch (err) {
    return handleError(err);
  }
}
