export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { installServerTiming } = await import('./lib/installServerTiming');
    installServerTiming();
  }
}
