import { describe, expect, it } from 'vitest';

import { inflight } from './inflight';

describe('inflight', () => {
  it('shares one promise for the same key and forgets it afterwards', async () => {
    const bucket = new Map<string, Promise<number>>();
    let calls = 0;
    const run = () =>
      inflight(bucket, 'same', async () => {
        calls += 1;
        return 1;
      });
    const [a, b] = await Promise.all([run(), run()]);
    expect(a).toBe(1);
    expect(b).toBe(1);
    expect(calls).toBe(1);
    expect(bucket.size).toBe(0);
    await run();
    expect(calls).toBe(2);
  });

  it('does not share a promise across different keys', async () => {
    const bucket = new Map<string, Promise<string>>();
    const seen: string[] = [];
    await Promise.all([
      inflight(bucket, 'a', async () => {
        seen.push('a');
        return 'a';
      }),
      inflight(bucket, 'b', async () => {
        seen.push('b');
        return 'b';
      })
    ]);
    expect(seen.sort()).toEqual(['a', 'b']);
  });
});