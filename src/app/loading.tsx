export default function Loading() {
  return (
    <main aria-label="Loading price tracker">
      <div className="skeleton skeleton-hero" />
      <div className="skeleton-grid">
        <div className="skeleton skeleton-panel" />
        <div className="skeleton skeleton-panel" />
        <div className="skeleton skeleton-panel" />
      </div>
      <span className="visually-hidden">Loading products</span>
    </main>
  );
}
