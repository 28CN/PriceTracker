export default function BetaLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="beta-shell">
      <p className="beta-banner">
        Beta — the live home page is unchanged. Delete <code>/beta</code> to drop this experiment.
      </p>
      {children}
    </div>
  );
}
