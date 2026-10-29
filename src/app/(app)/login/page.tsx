import { redirect } from 'next/navigation';

import AuthPanel from '@/components/AuthPanel';
import { getViewer } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export default async function LoginPage({
  searchParams
}: {
  searchParams: Promise<{ next?: string; demo?: string }>;
}) {
  const viewer = await getViewer();
  if (viewer) redirect('/');
  const { next, demo } = await searchParams;
  const demoNotice =
    demo === 'rate_limited'
      ? 'Too many demo sign-ins from your network. Please try again in a few minutes.'
      : demo === 'unavailable'
        ? 'The demo is unavailable right now. Please try again later.'
        : null;

  return (
    <main className="auth-page">
      {demoNotice ? <p className="demo-notice" role="status">{demoNotice}</p> : null}
      <AuthPanel mode="login" nextPath={next} />
    </main>
  );
}
