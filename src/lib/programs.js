/** Shared by pages: programme types, session kinds and weekdays. */

export const PROGRAMS = [
  { value: 'academic', label: 'Academic', hint: 'School subjects (GED, IGCSE, NIOS…) — topics planned ahead on a fixed schedule' },
  { value: 'short_term', label: 'Short-term upskilling', hint: 'Courses by hours with day/time slots — topics recorded after each class' },
  { value: 'university', label: 'University & Diploma', hint: 'Planned topics; a one-to-one absence moves the schedule forward' },
];
export const programLabel = (v) => PROGRAMS.find((p) => p.value === v)?.label || 'Academic';
export const programTone = (v) => ({ academic: 'slate', short_term: 'gold', university: 'maroon' }[v] || 'slate');

export const KINDS = [
  { value: 'class', label: 'Class', hint: 'Topic to be taught', tone: 'maroon' },
  { value: 'work', label: 'Work', hint: 'What students will do', tone: 'gold' },
  { value: 'test', label: 'Test', hint: 'Topics in the test', tone: 'red' },
  { value: 'revision', label: 'Revision', hint: 'What will be revised', tone: 'green' },
  { value: 'holiday', label: 'No class', hint: 'Holiday / no session', tone: 'slate' },
];
export const kindOf = (v) => KINDS.find((k) => k.value === v) || KINDS[0];

export const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
export const DAY_INDEX = { Sunday: 0, Monday: 1, Tuesday: 2, Wednesday: 3, Thursday: 4, Friday: 5, Saturday: 6 };

export function addDaysISO(iso, n) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
export const weekdayOf = (iso) => ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][new Date(`${iso}T00:00:00Z`).getUTCDay()];

/** Dates between from..to (inclusive) on the chosen weekdays (max 400). */
export function datesOnDays(from, to, days) {
  const out = [];
  if (!from || !to || !days.length) return out;
  for (let d = from, i = 0; d <= to && i < 400; d = addDaysISO(d, 1), i += 1) if (days.includes(weekdayOf(d))) out.push(d);
  return out;
}

export const fmtTime = (t) => {
  if (!t) return '';
  const [h, m] = t.split(':').map(Number);
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${h < 12 ? 'am' : 'pm'}`;
};
export const fmtRange = (a, b) => (a ? `${fmtTime(a)}${b ? `–${fmtTime(b)}` : ''}` : '');
