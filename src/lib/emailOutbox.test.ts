// Run with: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  contentFor,
  drainOutbox,
  sendOutboxRow,
  type OutboxDeps,
  type OutboxRow
} from './emailOutbox.ts';

function row(over: Partial<OutboxRow> = {}): OutboxRow {
  return {
    id: 'row-1',
    user_id: 'u1',
    product_id: null,
    kind: 'verify_contact',
    recipient: 'a@example.com',
    payload: { verifyUrl: 'https://x/verify-email?token=t' },
    attempt_count: 1,
    ...over
  };
}

function fakeDeps(rows: OutboxRow[], opts: { sendError?: Error; rpcError?: string } = {}) {
  const calls = {
    rpc: [] as [string, Record<string, unknown>][],
    updates: [] as [string, Record<string, unknown>, string][],
    inserts: [] as [string, Record<string, unknown>][],
    sent: [] as { to: string; subject: string }[]
  };
  const ok = (data?: unknown) => Promise.resolve({ data, error: null });
  const deps: OutboxDeps = {
    admin: {
      rpc(fn, args) {
        calls.rpc.push([fn, args]);
        return opts.rpcError
          ? Promise.resolve({ data: null, error: { message: opts.rpcError } })
          : ok(rows);
      },
      from(table) {
        return {
          insert(values) {
            calls.inserts.push([table, values]);
            return ok();
          },
          update(values) {
            return {
              eq(_c, id) {
                calls.updates.push([table, values, id]);
                return ok();
              }
            };
          }
        };
      }
    },
    async send(input) {
      if (opts.sendError) throw opts.sendError;
      calls.sent.push({ to: input.to, subject: input.subject });
      return 'provider-1';
    },
    absoluteUrl: (p) => `https://site${p}`,
    randomToken: () => 'raw',
    hashToken: (r) => `hash:${r}`,
    now: () => Date.parse('2026-10-29T00:00:00Z')
  };
  return { deps, calls };
}

test('sendOutboxRow claims exactly that row by id via claim_email_outbox_row', async () => {
  const { deps, calls } = fakeDeps([row()]);
  const result = await sendOutboxRow('row-1', deps);
  assert.deepEqual(calls.rpc, [['claim_email_outbox_row', { row_id: 'row-1' }]]);
  assert.deepEqual(result, { claimed: 1, sent: 1, failed: 0 });
  assert.equal(calls.sent[0].subject, 'Verify your PriceTracker email');
  const [, values, id] = calls.updates[0];
  assert.equal(id, 'row-1');
  assert.equal(values.status, 'sent');
  assert.equal(values.provider_message_id, 'provider-1');
  assert.equal(values.locked_at, null);
});

test('sendOutboxRow does nothing when the row is not claimable', async () => {
  const { deps, calls } = fakeDeps([]);
  assert.deepEqual(await sendOutboxRow('row-1', deps), {
    claimed: 0,
    sent: 0,
    failed: 0
  });
  assert.equal(calls.sent.length, 0);
  assert.equal(calls.updates.length, 0);
});

test('send failure marks retry with backoff and unlocks the row', async () => {
  const { deps, calls } = fakeDeps([row({ attempt_count: 3 })], {
    sendError: new Error('Resend returned 403')
  });
  assert.deepEqual(await sendOutboxRow('row-1', deps), {
    claimed: 1,
    sent: 0,
    failed: 1
  });
  const [, values] = calls.updates[0];
  assert.equal(values.status, 'retry');
  assert.equal(values.locked_at, null);
  assert.equal(values.last_error, 'Resend returned 403');
  assert.equal(values.next_attempt_at, '2026-10-29T00:04:00.000Z');
});

test('send failure after 5 attempts is permanent', async () => {
  const { deps, calls } = fakeDeps([row({ attempt_count: 5 })], {
    sendError: new Error('boom')
  });
  await sendOutboxRow('row-1', deps);
  assert.equal(calls.updates[0][1].status, 'failed');
});

test('claim RPC error is thrown so the caller can log it', async () => {
  const { deps } = fakeDeps([], { rpcError: 'permission denied' });
  await assert.rejects(sendOutboxRow('row-1', deps), /permission denied/);
  await assert.rejects(drainOutbox(deps), /permission denied/);
});

test('drainOutbox keeps using claim_email_outbox with batch size 25', async () => {
  const { deps, calls } = fakeDeps([
    row(),
    row({
      id: 'row-2',
      kind: 'recover_password',
      payload: { recoverUrl: 'https://x/r' }
    })
  ]);
  assert.deepEqual(await drainOutbox(deps), { claimed: 2, sent: 2, failed: 0 });
  assert.deepEqual(calls.rpc, [['claim_email_outbox', { batch_size: 25 }]]);
  assert.equal(calls.sent[1].subject, 'Reset your PriceTracker password');
});

test('target_price rows get an unsubscribe token stored hashed', async () => {
  const { deps, calls } = fakeDeps([
    row({
      kind: 'target_price',
      payload: {
        productName: 'Milk',
        targetPrice: 2,
        currentPrice: 1.5,
        retailer: 'coles',
        url: 'https://c'
      }
    })
  ]);
  await drainOutbox(deps);
  assert.equal(calls.inserts[0][1].token_hash, 'hash:raw');
  assert.equal(calls.inserts[0][1].purpose, 'unsubscribe');
});

test('contentFor escapes the recovery link', async () => {
  const c = await contentFor(
    row({
      kind: 'recover_password',
      payload: { recoverUrl: 'https://x/"><script>' }
    })
  );
  assert.ok(!c.body.includes('"><script>'));
});
