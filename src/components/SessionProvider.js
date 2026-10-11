'use client';

import { createContext, useContext, useEffect, useState } from 'react';
import { api } from '@/lib/client';

const SessionCtx = createContext({ user: null, loading: true, refresh: () => {} });

export function SessionProvider({ initialUser = null, children }) {
  const [user, setUser] = useState(initialUser);
  const [loading, setLoading] = useState(!initialUser);

  async function refresh() {
    try {
      const { user: u } = await api.get('/api/auth/me');
      setUser(u);
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!initialUser) refresh();
  }, [initialUser]);

  return <SessionCtx.Provider value={{ user, loading, refresh }}>{children}</SessionCtx.Provider>;
}

export const useSession = () => useContext(SessionCtx);

export const roleLabel = {
  admin: 'Administrator',
  teacher: 'Teacher',
  student: 'Student',
  parent: 'Parent',
};
