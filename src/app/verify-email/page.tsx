import VerifyEmailPanel from '@/components/VerifyEmailPanel';

export const dynamic = 'force-dynamic';

export default async function VerifyEmailPage({
  searchParams
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  return (
    <main className="auth-page">
      <VerifyEmailPanel token={token || ''} />
    </main>
  );
}
