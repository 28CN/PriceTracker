import { redirect } from 'next/navigation';

import AuthPanel from '@/components/AuthPanel';
import { getViewer } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export default async function RegisterPage() {
  const viewer = await getViewer();
  if (viewer) redirect('/manage');

  return (
    <main className="auth-page">
      <AuthPanel mode="register" />
    </main>
  );
}
