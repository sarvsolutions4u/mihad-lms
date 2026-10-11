import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { SessionProvider } from '@/components/SessionProvider';
import Shell from '@/components/Shell';

export const dynamic = 'force-dynamic';

export default async function DashLayout({ children }) {
  const session = await getSession();
  if (!session) redirect('/login');

  return (
    <SessionProvider>
      <Shell>{children}</Shell>
    </SessionProvider>
  );
}
