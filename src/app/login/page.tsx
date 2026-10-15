import { redirect } from 'next/navigation';

import AuthPanel from '@/components/AuthPanel';
import { getViewer } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export default async function LoginPage({
  searchParams
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const viewer = await getViewer();
  if (viewer) redirect('/manage');
  const { next } = await searchParams;

  return (
    <main className="auth-page">
      <AuthPanel mode="login" nextPath={next} />
    </main>
  );
}
