'use client';

const base = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.7,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
};

const PATHS = {
  dashboard: <><rect x="3" y="3" width="7" height="8" rx="1.5" /><rect x="14" y="3" width="7" height="5" rx="1.5" /><rect x="14" y="11" width="7" height="10" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /></>,
  calendar: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4" /></>,
  check: <><path d="M20 6 9 17l-5-5" /></>,
  plan: <><path d="M5 3h11l4 4v14a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z" /><path d="M15 3v5h5M9 13h6M9 17h4" /></>,
  chart: <><path d="M4 20V10M10 20V4M16 20v-7M22 20H2" /></>,
  folder: <><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" /></>,
  clipboard: <><rect x="6" y="4" width="12" height="17" rx="2" /><path d="M9 4V3h6v1M9 11h6M9 15h4" /></>,
  megaphone: <><path d="M3 11v2a1 1 0 0 0 1 1h3l6 4V6L7 10H4a1 1 0 0 0-1 1Z" /><path d="M17 9a4 4 0 0 1 0 6" /></>,
  wallet: <><rect x="3" y="6" width="18" height="13" rx="2" /><path d="M3 10h18M16 14h2" /></>,
  users: <><circle cx="9" cy="8" r="3.2" /><path d="M2.5 20a6.5 6.5 0 0 1 13 0" /><path d="M17 5.5a3 3 0 0 1 0 5.6M18 20a6.4 6.4 0 0 0-2-4.6" /></>,
  school: <><path d="m12 3 9 5-9 5-9-5 9-5Z" /><path d="M6 11v5c0 1.7 2.7 3 6 3s6-1.3 6-3v-5" /></>,
  cog: <><circle cx="12" cy="12" r="3.2" /><path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1" /></>,
  logout: <><path d="M15 17v2a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7a2 2 0 0 1 2 2v2" /><path d="M20 12H9m11 0-3-3m3 3-3 3" /></>,
  link: <><path d="M10 13a4 4 0 0 0 5.7 0l3-3a4 4 0 1 0-5.7-5.7L11.5 5.8" /><path d="M14 11a4 4 0 0 0-5.7 0l-3 3A4 4 0 0 0 11 19.7l1.4-1.4" /></>,
  plus: <><path d="M12 5v14M5 12h14" /></>,
  menu: <><path d="M4 6h16M4 12h16M4 18h16" /></>,
};

export default function Icon({ name, className = 'h-[18px] w-[18px]' }) {
  const path = PATHS[name] || PATHS.dashboard;
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true" {...base}>
      {path}
    </svg>
  );
}
