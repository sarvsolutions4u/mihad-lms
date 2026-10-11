/** Tiny fetch helpers around the JSON API. */

async function request(url, options = {}) {
  const res = await fetch(url, {
    credentials: 'same-origin',
    headers: options.body instanceof FormData ? {} : { 'Content-Type': 'application/json' },
    ...options,
  });

  let data = null;
  try {
    data = await res.json();
  } catch {
    /* non-JSON response */
  }

  if (!res.ok || data?.ok === false) {
    throw new Error(data?.error || `Request failed (${res.status})`);
  }
  return data;
}

export const api = {
  get: (url) => request(url),
  post: (url, body) => request(url, { method: 'POST', body: JSON.stringify(body) }),
  patch: (url, body) => request(url, { method: 'PATCH', body: JSON.stringify(body) }),
  del: (url) => request(url, { method: 'DELETE' }),
  upload: (url, formData) => request(url, { method: 'POST', body: formData }),
};

/** Collection helpers: list('tasks', { classRoom: id }) */
export function list(model, query = {}) {
  const qs = new URLSearchParams(
    Object.entries(query).filter(([, v]) => v !== undefined && v !== null && v !== '')
  ).toString();
  return api.get(`/api/records/${model}${qs ? `?${qs}` : ''}`);
}

export const create = (model, body) => api.post(`/api/records/${model}`, body);
export const update = (model, id, body) => api.patch(`/api/records/${model}/${id}`, body);
export const remove = (model, id) => api.del(`/api/records/${model}/${id}`);

export const fmtDate = (iso) => {
  if (!iso) return '—';
  const d = new Date(`${String(iso).slice(0, 10)}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
};

export const todayISO = () =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Dubai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());

export function weekStartISO(iso) {
  const d = new Date(`${(iso || todayISO()).slice(0, 10)}T00:00:00Z`);
  const dow = d.getUTCDay();
  d.setUTCDate(d.getUTCDate() + (dow === 0 ? -6 : 1 - dow));
  return d.toISOString().slice(0, 10);
}
