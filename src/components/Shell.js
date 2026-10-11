'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import Icon from './Icon';
import { Logo } from './ui';
import { useSession, roleLabel } from './SessionProvider';

const NAV = [
  { href: '/dashboard', label: 'Dashboard', icon: 'dashboard', roles: ['admin', 'teacher', 'student', 'parent'] },
  { href: '/timetable', label: 'Timetable', icon: 'calendar', roles: ['admin', 'teacher', 'student', 'parent'] },
  { href: '/attendance', label: 'Attendance', icon: 'check', roles: ['admin', 'teacher', 'student', 'parent'] },
  { href: '/lesson-plans', label: 'Lesson Plans', icon: 'plan', roles: ['admin', 'teacher', 'student', 'parent'] },
  { href: '/assignments', label: 'Assignments', icon: 'clipboard', roles: ['admin', 'teacher', 'student', 'parent'] },
  { href: '/resources', label: 'Resources', icon: 'folder', roles: ['admin', 'teacher', 'student', 'parent'] },
  { href: '/reports', label: 'Progress Reports', icon: 'chart', roles: ['admin', 'teacher', 'student', 'parent'] },
  { href: '/announcements', label: 'Announcements', icon: 'megaphone', roles: ['admin', 'teacher', 'student', 'parent'] },
  { href: '/fees', label: 'Fees', icon: 'wallet', roles: ['admin', 'parent'] },
  { href: '/people', label: 'People', icon: 'users', roles: ['admin', 'teacher'] },
  { href: '/classes', label: 'Classes & Subjects', icon: 'school', roles: ['admin'] },
  { href: '/settings', label: 'Settings', icon: 'cog', roles: ['admin', 'teacher', 'student', 'parent'] },
];

export default function Shell({ children }) {
  const { user } = useSession();
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);

  const items = NAV.filter((n) => !user || n.roles.includes(user.role));

  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.replace('/login');
    router.refresh();
  }

  const sidebar = (
    <nav className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b border-white/10 px-5 py-4">
        <Logo compact />
        <span className="ml-1 leading-tight">
          <span className="block text-[14px] font-extrabold tracking-[0.08em] text-white">AL MIHAD</span>
          <span className="block text-[9px] uppercase tracking-[0.16em] text-gold">Learning Portal</span>
        </span>
      </div>

      <ul className="flex-1 space-y-0.5 overflow-y-auto px-3 py-4">
        {items.map((item) => {
          const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                onClick={() => setOpen(false)}
                className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                  active
                    ? 'bg-gold text-maroon-900 font-semibold'
                    : 'text-white/75 hover:bg-white/10 hover:text-white'
                }`}
              >
                <Icon name={item.icon} />
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>

      <div className="border-t border-white/10 p-3">
        <div className="mb-2 rounded-lg bg-white/5 px-3 py-2.5">
          <p className="truncate text-sm font-semibold text-white">{user?.name || '—'}</p>
          <p className="text-[11px] uppercase tracking-wide text-gold">
            {roleLabel[user?.role] || ''}
            {user?.classRoom?.name ? ` · ${user.classRoom.name}` : ''}
          </p>
        </div>
        <button
          onClick={logout}
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-white/75 hover:bg-white/10 hover:text-white"
        >
          <Icon name="logout" />
          Sign out
        </button>
      </div>
    </nav>
  );

  return (
    <div className="flex min-h-screen">
      {/* desktop sidebar */}
      <aside className="hidden w-64 shrink-0 bg-gradient-to-b from-maroon to-maroon-800 lg:block">
        <div className="sticky top-0 h-screen">{sidebar}</div>
      </aside>

      {/* mobile drawer */}
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-maroon-950/60" onClick={() => setOpen(false)} />
          <aside className="absolute left-0 top-0 h-full w-72 bg-gradient-to-b from-maroon to-maroon-800 shadow-2xl">{sidebar}</aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-slate-200 bg-white/90 px-4 py-3 backdrop-blur lg:hidden">
          <button
            onClick={() => setOpen(true)}
            className="grid h-9 w-9 place-items-center rounded-lg border border-slate-300 text-slate-600"
            aria-label="Open menu"
          >
            <Icon name="menu" />
          </button>
          <span className="text-sm font-bold text-maroon">Al Mihad Learning Portal</span>
        </header>

        <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">{children}</main>

        <footer className="px-4 pb-6 text-center text-[11px] text-slate-400 sm:px-6 lg:px-8">
          Al Mihad Training Centre · Sharjah — Educate to Innovate
        </footer>
      </div>
    </div>
  );
}
