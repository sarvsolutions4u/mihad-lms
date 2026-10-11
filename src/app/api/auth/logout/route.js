import { destroySession } from '@/lib/auth';
import { ok } from '@/lib/api';

export const dynamic = 'force-dynamic';

export async function POST() {
  await destroySession();
  return ok({});
}
