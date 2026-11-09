'use client';

import { useEffect, useState } from 'react';
import { MAX_FILE_MB } from '@/lib/fileTypes';

let limitPromise;
/** { mode: 'r2' | 'direct', maxMB } — fetched once per page load. */
export function getUploadLimit() {
  if (!limitPromise) {
    limitPromise = fetch('/api/upload/sign')
      .then((r) => r.json())
      .then((d) => (d?.ok ? { mode: d.mode, maxMB: d.maxMB } : { mode: 'direct', maxMB: MAX_FILE_MB }))
      .catch(() => ({ mode: 'direct', maxMB: MAX_FILE_MB }));
  }
  return limitPromise;
}

export function useUploadLimit() {
  const [limit, setLimit] = useState({ mode: 'direct', maxMB: MAX_FILE_MB });
  useEffect(() => {
    let alive = true;
    getUploadLimit().then((l) => alive && setLimit(l));
    return () => {
      alive = false;
    };
  }, []);
  return limit;
}

async function readJson(res) {
  try {
    return await res.json();
  } catch {
    return null;
  }
}

function putWithProgress(url, file, contentType, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', url);
    xhr.setRequestHeader('Content-Type', contentType);
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress?.(Math.round((e.loaded / e.total) * 100));
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`Upload failed (${xhr.status})`)));
    xhr.onerror = () => reject(new Error('Upload failed — check your connection and try again'));
    xhr.send(file);
  });
}

/**
 * Upload one file. Goes straight to Cloudflare R2 when it is set up (large
 * files are fine), otherwise into the database (4 MB limit).
 * Returns { url, fileName, size }.
 */
export async function uploadFile(file, { purpose, student, onProgress } = {}) {
  if (!file) throw new Error('Choose a file first');

  const signRes = await fetch('/api/upload/sign', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fileName: file.name, size: file.size, purpose, student }),
  });
  const sign = await readJson(signRes);
  if (!signRes.ok || !sign || sign.ok === false) throw new Error(sign?.error || 'Upload failed');

  if (sign.mode === 'r2') {
    await putWithProgress(sign.uploadUrl, file, sign.contentType, onProgress);
    const doneRes = await fetch('/api/upload/complete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: sign.id }),
    });
    const done = await readJson(doneRes);
    if (!doneRes.ok || !done || done.ok === false) throw new Error(done?.error || 'Upload could not be confirmed');
    onProgress?.(100);
    return done;
  }

  // database storage
  if (file.size > sign.maxMB * 1024 * 1024) {
    throw new Error(`"${file.name}" is larger than ${sign.maxMB} MB. Compress it, or paste a Google Drive / YouTube link instead.`);
  }
  const fd = new FormData();
  fd.append('file', file);
  if (purpose) fd.append('purpose', purpose);
  if (student) fd.append('student', student);
  const res = await fetch('/api/upload', { method: 'POST', body: fd });
  const data = await readJson(res);
  if (!res.ok || !data || data.ok === false) {
    throw new Error(data?.error || (res.status === 413 ? `File is larger than ${sign.maxMB} MB` : 'Upload failed'));
  }
  onProgress?.(100);
  return data;
}

