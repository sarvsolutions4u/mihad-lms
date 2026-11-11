import { requireSession } from '@/lib/auth';
import { ok, handleError } from '@/lib/api';
import { LIBRARY } from '@/lib/courses';

export const dynamic = 'force-dynamic';

/** GET /api/courses/library — built-in courses that can be added to the portal. */
export async function GET() {
  try {
    await requireSession(['admin', 'teacher']);
    return ok({
      library: LIBRARY.map((c) => ({
        key: c.key,
        title: c.title,
        subtitle: c.subtitle,
        level: c.level,
        category: c.category,
        units: c.units.map((u) => ({ title: u.title, items: u.items.length })),
        items: c.units.reduce((a, u) => a + u.items.length, 0),
        withAudio: c.units.every((u) => u.items.every((i) => !(i.lines || []).length || i.lines.every((l) => l.audio))),
      })),
    });
  } catch (err) {
    return handleError(err);
  }
}
