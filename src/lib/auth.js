import { SignJWT, jwtVerify } from 'jose';
import { cookies } from 'next/headers';
import bcrypt from 'bcryptjs';

const COOKIE = 'lms_session';
const ALG = 'HS256';

function secretKey() {
  const s = process.env.AUTH_SECRET;
  if (!s) throw new Error('AUTH_SECRET is not set. Add it to .env.local and to Vercel env vars.');
  return new TextEncoder().encode(s);
}

export async function hashPassword(plain) {
  return bcrypt.hash(plain, 10);
}

export async function verifyPassword(plain, hash) {
  return bcrypt.compare(plain, hash);
}

export async function createSession(user) {
  const token = await new SignJWT({
    uid: String(user._id),
    role: user.role,
    name: user.name,
    email: user.email,
  })
    .setProtectedHeader({ alg: ALG })
    .setIssuedAt()
    .setExpirationTime('7d')
    .sign(secretKey());

  (await cookies()).set(COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 7,
  });
  return token;
}

export async function destroySession() {
  (await cookies()).set(COOKIE, '', { httpOnly: true, path: '/', maxAge: 0 });
}

/** Returns { uid, role, name, email } or null. */
export async function getSession() {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secretKey());
    return payload;
  } catch {
    return null;
  }
}

/** Throws a 401-shaped error if not signed in; optionally checks role. */
export async function requireSession(roles) {
  const s = await getSession();
  if (!s) {
    const e = new Error('Not signed in');
    e.status = 401;
    throw e;
  }
  if (roles && roles.length && !roles.includes(s.role)) {
    const e = new Error('You do not have access to this');
    e.status = 403;
    throw e;
  }
  return s;
}
