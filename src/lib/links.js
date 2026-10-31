/**
 * Make a typed link safe and clickable.
 *   "zoom.us/j/123"            -> "https://zoom.us/j/123"   (opens the Zoom app)
 *   "meet.google.com/abc-defg" -> "https://meet.google.com/abc-defg"
 *   "zoommtg://…", "msteams:…" -> kept (app links)
 *   "/api/files/…"             -> kept (a file stored in the app)
 *   "javascript:…" / "data:…"  -> removed
 */
export function normalizeUrl(raw) {
  const u = String(raw || '').trim();
  if (!u) return '';
  if (u.startsWith('/api/files/')) return u;
  if (/^(javascript|data|vbscript|file):/i.test(u)) return '';
  if (/^[a-z][a-z0-9+.-]*:/i.test(u)) return u; // has a scheme already
  if (u.startsWith('//')) return `https:${u}`;
  if (u.startsWith('/')) return u; // other in-app path
  return `https://${u}`;
}

/** Fields that hold links, per collection — cleaned on every save. */
export const LINK_FIELDS = {
  classrooms: ['onlineClassLink'],
  subjects: ['onlineClassLink'],
  timetable: ['onlineClassLink'],
  resources: ['url'],
  tasks: ['attachmentUrl'],
  submissions: ['url'],
};

/** Clean link fields (and nested file lists) in a request body in place. */
export function cleanLinks(key, body) {
  for (const f of LINK_FIELDS[key] || []) {
    if (typeof body[f] === 'string') body[f] = normalizeUrl(body[f]);
  }
  for (const listField of ['attachments']) {
    if (Array.isArray(body[listField])) {
      body[listField] = body[listField]
        .map((a) => ({ ...a, url: normalizeUrl(a?.url) }))
        .filter((a) => a.url);
    }
  }
  if (Array.isArray(body.payments)) {
    body.payments = body.payments.map((p) =>
      p?.receipt?.url ? { ...p, receipt: { ...p.receipt, url: normalizeUrl(p.receipt.url) } } : p
    );
  }
  return body;
}

/** The link a learner should use for a timetable slot / subject. */
export function classLinkFor({ slot, subject, classRoom } = {}) {
  return normalizeUrl(
    slot?.onlineClassLink || subject?.onlineClassLink || slot?.subject?.onlineClassLink || classRoom?.onlineClassLink ||
      subject?.classRoom?.onlineClassLink || slot?.classRoom?.onlineClassLink || ''
  );
}

/** Friendly name for the meeting app behind a link. */
export function meetingApp(url) {
  const u = String(url || '').toLowerCase();
  if (u.includes('zoom')) return 'Zoom';
  if (u.includes('meet.google')) return 'Google Meet';
  if (u.includes('teams.microsoft') || u.includes('teams.live') || u.startsWith('msteams')) return 'Teams';
  if (u.includes('webex')) return 'Webex';
  return '';
}

/** Google Drive file id from any Drive / Docs file link, or null. */
export function driveFileId(url) {
  const u = String(url || '');
  if (!/(drive|docs)\.google\.com/i.test(u)) return null;
  const m = u.match(/\/(?:file\/d|document\/d|presentation\/d|spreadsheets\/d)\/([\w-]{20,})/) || u.match(/[?&]id=([\w-]{20,})/);
  return m ? m[1] : null;
}

/** YouTube video id, or null. */
export function youtubeId(url) {
  const u = String(url || '');
  const m =
    u.match(/youtu\.be\/([\w-]{11})/) ||
    u.match(/youtube(?:-nocookie)?\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/|live\/)([\w-]{11})/);
  return m ? m[1] : null;
}

/**
 * How to show a link inside the LMS:
 *   { kind: 'drive', embed }   Drive file (video, PDF, doc…) in Google's viewer
 *   { kind: 'youtube', embed } YouTube video
 *   null                       open normally
 */
export function embedFor(url) {
  const d = driveFileId(url);
  if (d) {
    const u = String(url);
    const kindOf = /docs\.google\.com\/(document|presentation|spreadsheets)\/d\//.exec(u)?.[1];
    const embed = kindOf
      ? `https://docs.google.com/${kindOf}/d/${d}/preview`
      : `https://drive.google.com/file/d/${d}/preview`;
    return { kind: 'drive', embed };
  }
  const y = youtubeId(url);
  if (y) return { kind: 'youtube', embed: `https://www.youtube-nocookie.com/embed/${y}?rel=0&modestbranding=1` };
  return null;
}
