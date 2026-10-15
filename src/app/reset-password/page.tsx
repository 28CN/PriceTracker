import RecoveryPanel from '@/components/RecoveryPanel';

export const dynamic = 'force-dynamic';

export default async function ResetPasswordPage({
  searchParams
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  return (
    <main className="auth-page">
      <RecoveryPanel mode="reset" token={token || ''} />
    </main>
  );
}
