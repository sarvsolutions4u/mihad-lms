import { destroySession, getSession } from '@/lib/auth';
import { dbConnect } from '@/lib/db';
import { logActivity } from '@/lib/activity';
import { ok } from '@/lib/api';

export const dynamic = 'force-dynamic';

export async function POST(req) {
  const s = await getSession();
  if (s?.uid) {
    try {
      await dbConnect();
      await logActivity({ uid: s.uid, role: s.role, type: 'logout', req });
    } catch {
      /* signing out must always work */
    }
  }
  await destroySession();
  return ok({});
}
