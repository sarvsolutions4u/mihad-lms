'use client';

import { useEffect, useState } from 'react';
import { list } from '@/lib/client';

/** Loads the reference data nearly every page needs. */
export function useLookups({ students = false } = {}) {
  const [data, setData] = useState({ classes: [], subjects: [], students: [], loading: true, error: '' });

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const calls = [list('classrooms', { sort: 'order name', limit: 100 }), list('subjects', { limit: 500 })];
        if (students) calls.push(list('users', { role: 'student', sort: 'name', limit: 1000 }));
        const res = await Promise.all(calls);
        if (!alive) return;
        setData({
          classes: res[0].items,
          subjects: res[1].items,
          students: students ? res[2].items : [],
          loading: false,
          error: '',
        });
      } catch (e) {
        if (alive) setData((d) => ({ ...d, loading: false, error: e.message }));
      }
    })();
    return () => {
      alive = false;
    };
  }, [students]);

  return data;
}

export const classOptions = (classes) => classes.map((c) => ({ value: c._id, label: c.name }));

export const subjectOptions = (subjects, classId) =>
  subjects
    .filter((s) => !classId || String(s.classRoom?._id || s.classRoom) === String(classId))
    .map((s) => ({ value: s._id, label: s.name }));
