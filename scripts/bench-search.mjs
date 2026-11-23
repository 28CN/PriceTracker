import { fileURLToPath } from 'node:url';
import { startVitest } from 'vitest/node';

const vitest = await startVitest(
  'test',
  ['scripts/bench-search.vitest.ts'],
  {
    run: true,
    config: false
  },
  {
    resolve: {
      alias: { '@': fileURLToPath(new URL('../src', import.meta.url)) }
    },
    test: {
      environment: 'node',
      include: ['scripts/bench-search.vitest.ts'],
      restoreMocks: true
    }
  }
);

await vitest?.close();
if (process.exitCode && process.exitCode !== 0) {
  process.exit(process.exitCode);
}
