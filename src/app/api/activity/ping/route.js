import { dbConnect } from '@/lib/db';
import { requireSession } from '@/lib/auth';
import { recordActiveMinute } from '@/lib/activity';
import { ok, handleError } from '@/lib/api';

export const dynamic = 'force-dynamic';

/** Heartbeat from an open tab the person is using — counts active time. */
export async function POST() {
  try {
    const session = await requireSession();
    await dbConnect();
    await recordActiveMinute(session);
    return ok({});
  } catch (err) {
    return handleError(err);
  }
}
