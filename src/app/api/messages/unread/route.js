import { dbConnect } from '@/lib/db';
import { Thread } from '@/models';
import { requireSession } from '@/lib/auth';
import { ok, handleError } from '@/lib/api';
import { threadScope, unreadFilter } from '@/lib/messages';

export const dynamic = 'force-dynamic';

/** GET — { unread, openDoubts } for the menu badge. */
export async function GET() {
  try {
    const session = await requireSession();
    await dbConnect();
    const [unread, openDoubts] = await Promise.all([
      Thread.countDocuments(unreadFilter(session)),
      Thread.countDocuments({ ...threadScope(session), kind: 'doubt', status: 'open' }),
    ]);
    return ok({ unread, openDoubts });
  } catch (err) {
    return handleError(err);
  }
}
