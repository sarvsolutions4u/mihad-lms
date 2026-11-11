import './globals.css';

export const metadata = {
  title: 'Mihad Training — Learning Portal',
  description:
    'Course plans, attendance, marks, assignments, resources and updates for Al Mihad students, trainers and parents — in one secure place.',
  appleWebApp: { capable: true, title: 'Mihad LMS', statusBarStyle: 'default' },
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#7a121d',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
