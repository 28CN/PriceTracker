// Single place that ends a demo session. Swap the endpoint here if a
// dedicated /api/demo/exit route is added later.
export async function exitDemo(): Promise<void> {
  await fetch('/api/auth/logout', { method: 'POST' }).catch(() => undefined);
  window.location.assign('/');
}
