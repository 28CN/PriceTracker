import UnsubscribePanel from '@/components/UnsubscribePanel';

export const dynamic = 'force-dynamic';

export default async function UnsubscribePage({
  searchParams
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  return (
    <main className="auth-page">
      <UnsubscribePanel token={token || ''} />
    </main>
  );
}
