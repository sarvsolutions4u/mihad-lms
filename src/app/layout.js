import './globals.css';

export const metadata = {
  title: 'Mihad Training — Learning Portal',
  description:
    'Course plans, attendance, marks, assignments, resources and updates for Al Mihad students, trainers and parents — in one secure place.',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
