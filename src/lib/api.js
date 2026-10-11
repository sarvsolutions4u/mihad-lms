import { NextResponse } from 'next/server';

export function ok(data, init = {}) {
  return NextResponse.json({ ok: true, ...data }, init);
}

export function fail(message, status = 400) {
  return NextResponse.json({ ok: false, error: message }, { status });
}

export function handleError(err) {
  const status = err?.status || (err?.name === 'ValidationError' ? 422 : 500);
  let message = err?.message || 'Something went wrong';
  if (err?.code === 11000) {
    const field = Object.keys(err.keyValue || {}).join(', ');
    message = `A record with this ${field || 'value'} already exists`;
    return fail(message, 409);
  }
  if (status === 500) console.error(err);
  return fail(message, status);
}

/** "YYYY-MM-DD" for today in the school's timezone (Asia/Dubai by default). */
export function todayISO(tz = 'Asia/Dubai') {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

/** Monday of the week containing `iso` (a "YYYY-MM-DD" string). */
export function weekStart(iso) {
  const d = new Date(`${iso || todayISO()}T00:00:00Z`);
  const dow = d.getUTCDay(); // 0 Sun .. 6 Sat
  const diff = dow === 0 ? -6 : 1 - dow;
  d.setUTCDate(d.getUTCDate() + diff);
  return d.toISOString().slice(0, 10);
}

export function addDaysISO(iso, days) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
