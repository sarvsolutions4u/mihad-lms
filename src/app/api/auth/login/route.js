import { dbConnect } from '@/lib/db';
import { User } from '@/models';
import { verifyPassword, createSession } from '@/lib/auth';
import { ok, fail, handleError } from '@/lib/api';

export const dynamic = 'force-dynamic';

export async function POST(req) {
  try {
    const { email, password } = await req.json();
    if (!email || !password) return fail('Email and password are required', 422);

    await dbConnect();
    const user = await User.findOne({ email: String(email).toLowerCase().trim() });
    if (!user || !user.active) return fail('Invalid email or password', 401);

    const good = await verifyPassword(password, user.passwordHash);
    if (!good) return fail('Invalid email or password', 401);

    await createSession(user);
    user.lastLoginAt = new Date();
    await user.save();

    return ok({
      user: { id: String(user._id), name: user.name, email: user.email, role: user.role },
    });
  } catch (err) {
    return handleError(err);
  }
}
