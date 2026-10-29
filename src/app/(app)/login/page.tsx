import { redirect } from 'next/navigation';

import AuthPanel from '@/components/AuthPanel';
import { getViewer } from '@/lib/auth';
import { isEmailUiEnabled } from '@/lib/emailFeature';

export const dynamic = 'force-dynamic';

export default async function LoginPage({
  searchParams
}: {
  searchParams: Promise<{ next?: string; demo?: string; created?: string }>;
}) {
  const viewer = await getViewer();
  if (viewer) redirect('/');
  const { next, demo, created } = await searchParams;
  const createdNotice =
    created === '1'
      ? isEmailUiEnabled()
        ? 'Account created. Sign in to start tracking.'
        : 'Account created. Sign in to start tracking. Email features are not available yet, so no verification email was sent.'
      : null;
  const demoNotice =
    demo === 'rate_limited'
      ? 'Lots of people are looking at the example right now. Please try again in a few minutes.'
      : demo === 'unavailable'
        ? 'The example isn’t available right now. Please try again later.'
        : null;

  return (
    <main className="auth-page">
      {demoNotice ? <p className="demo-notice" role="status">{demoNotice}</p> : null}
      {createdNotice ? <p className="demo-notice auth-created-notice" role="status">{createdNotice}</p> : null}
      <AuthPanel mode="login" nextPath={next} />
    </main>
  );
}
