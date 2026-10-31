import { PDFDocument, StandardFonts, rgb, degrees } from 'pdf-lib';

/**
 * Stamp every page of a PDF with a light diagonal "AL MIHAD TRAINING" mark and
 * a small footer line (e.g. "Trainer: Meera Nair" / "Downloaded by …").
 *
 * Returns { ok: true, bytes } or { ok: false, reason } — password-protected or
 * damaged PDFs are left untouched rather than broken.
 */

// The standard PDF fonts only cover Western characters; anything else (e.g.
// Arabic names) is replaced so stamping never fails.
const safe = (s) =>
  String(s || '')
    .replace(/[–—]/g, '-')
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/…/g, '...')
    .replace(/·/g, '|')
    .replace(/[^\x20-\x7E]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

export async function stampPdf(input, { footer = [], diagonal = 'AL MIHAD TRAINING', at = 'bottom' } = {}) {
  let doc;
  try {
    doc = await PDFDocument.load(input, { updateMetadata: false });
  } catch (e) {
    const protectedPdf = /encrypt/i.test(e?.message || '');
    return { ok: false, reason: protectedPdf ? 'protected' : 'unreadable' };
  }

  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const lines = footer.map(safe).filter(Boolean);
  const mark = safe(diagonal);
  const maroon = rgb(0.478, 0.071, 0.114);

  for (const page of doc.getPages()) {
    const box = page.getCropBox ? page.getCropBox() : page.getMediaBox();
    const { x, y, width, height } = box;

    // diagonal mark across the middle
    if (mark) {
      const size = Math.max(24, Math.min(width, height) / 9);
      const textWidth = bold.widthOfTextAtSize(mark, size);
      const angle = Math.atan2(height, width);
      const cx = x + width / 2;
      const cy = y + height / 2;
      page.drawText(mark, {
        x: cx - (textWidth / 2) * Math.cos(angle) + (size / 3) * Math.sin(angle),
        y: cy - (textWidth / 2) * Math.sin(angle) - (size / 3) * Math.cos(angle),
        size,
        font: bold,
        color: maroon,
        opacity: 0.12,
        rotate: degrees((angle * 180) / Math.PI),
      });
    }

    // small text line(s): bottom-left (trainer) or top-left (who downloaded)
    const fsize = Math.max(6.5, Math.min(8.5, width / 80));
    lines.forEach((line, i) => {
      page.drawText(line, {
        x: x + 18,
        y: at === 'top' ? y + height - 14 - i * (fsize + 2.5) : y + 10 + (lines.length - 1 - i) * (fsize + 2.5),
        size: fsize,
        font: regular,
        color: maroon,
        opacity: 0.55,
      });
    });
  }

  const bytes = await doc.save({ useObjectStreams: false });
  return { ok: true, bytes: Buffer.from(bytes) };
}

export const isPdf = (contentType, name = '') => contentType === 'application/pdf' || /\.pdf$/i.test(name);

/** "31 Oct 2026" in Dubai time */
export const stampDate = () =>
  new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Dubai', day: '2-digit', month: 'short', year: 'numeric' }).format(new Date());

/** Line stamped when a trainer / the office uploads course material. */
export function uploaderLine(session) {
  return session.role === 'teacher'
    ? `Trainer: ${session.name || ''} | Al Mihad Training Centre`
    : 'Al Mihad Training Centre';
}

/** Line stamped on a student's / parent's copy. */
export function learnerLine(user) {
  const who = `${user?.name || 'Student'}${user?.admissionNo ? ` (${user.admissionNo})` : ''}`;
  return `Downloaded by ${who} | ${stampDate()} | For personal study only`;
}
