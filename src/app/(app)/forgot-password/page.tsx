import RecoveryPanel from '@/components/RecoveryPanel';

export default function ForgotPasswordPage() {
  return (
    <main className="auth-page">
      <RecoveryPanel mode="request" />
    </main>
  );
}
