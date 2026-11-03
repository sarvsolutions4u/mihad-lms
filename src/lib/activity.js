import { Activity, DailyActive, User } from '@/models';
import { todayISO } from '@/lib/api';

/** "Chrome · Windows", "Safari · iPhone" … from the User-Agent header. */
export function deviceFrom(req) {
  const ua = req?.headers?.get?.('user-agent') || '';
  if (!ua) return '';
  const browser = /Edg\//.test(ua)
    ? 'Edge'
    : /OPR\//.test(ua)
      ? 'Opera'
      : /SamsungBrowser/.test(ua)
        ? 'Samsung Internet'
        : /Chrome\//.test(ua)
          ? 'Chrome'
          : /Firefox\//.test(ua)
            ? 'Firefox'
            : /Safari\//.test(ua)
              ? 'Safari'
              : 'Browser';
  const os = /iPhone/.test(ua)
    ? 'iPhone'
    : /iPad/.test(ua)
      ? 'iPad'
      : /Android/.test(ua)
        ? 'Android'
        : /Windows/.test(ua)
          ? 'Windows'
          : /Mac OS X/.test(ua)
            ? 'Mac'
            : /Linux/.test(ua)
              ? 'Linux'
              : '';
  return os ? `${browser} · ${os}` : browser;
}

/**
 * Record one event. Never throws — logging must not break the action itself.
 * dedupeMins: skip if the same person already logged the same type+file recently.
 */
export async function logActivity({ uid, role, type, name = '', detail = '', fileId, fileOwner, subject, req, dedupeMins = 0 }) {
  try {
    if (!uid || !type) return;
    if (dedupeMins && fileId) {
      const since = new Date(Date.now() - dedupeMins * 60 * 1000);
      if (await Activity.exists({ user: uid, type, fileId, at: { $gte: since } })) return;
    }
    await Activity.create({
      user: uid,
      role,
      type,
      name: String(name || '').slice(0, 200),
      detail: String(detail || '').slice(0, 120),
      fileId,
      fileOwner: fileOwner || undefined,
      subject: subject || undefined,
      device: deviceFrom(req),
    });
  } catch (e) {
    console.error('activity log failed', e?.message);
  }
}

/**
 * A heartbeat from an open, in-use tab (sent about once a minute).
 * Counts one active minute per ping, at most one per 50 seconds.
 */
export async function recordActiveMinute(session) {
  const now = new Date();
  const date = todayISO();
  const cutoff = new Date(now.getTime() - 50 * 1000);
  const r = await DailyActive.updateOne({ user: session.uid, date, last: { $lte: cutoff } }, { $inc: { minutes: 1 }, $set: { last: now } });
  if (!r.matchedCount) {
    try {
      await DailyActive.create({ user: session.uid, role: session.role, date, minutes: 1, first: now, last: now });
    } catch {
      /* already pinged in the last 50 s */
    }
  }
  await User.updateOne({ _id: session.uid }, { $set: { lastSeenAt: now } });
}

export const ONLINE_WINDOW_MS = 3 * 60 * 1000;
