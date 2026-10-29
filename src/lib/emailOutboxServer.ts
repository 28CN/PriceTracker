import { createHash, randomBytes } from 'node:crypto';
import { after } from 'next/server';

import { sendEmail } from '@/lib/email';
import { sendOutboxRow, type OutboxAdmin, type OutboxDeps } from '@/lib/emailOutbox';
import { absoluteUrl } from '@/lib/siteUrl';
import { createAdminSupabaseClient } from '@/lib/supabase/admin';

export function outboxDeps(): OutboxDeps {
  return {
    admin: createAdminSupabaseClient() as unknown as OutboxAdmin,
    send: sendEmail,
    absoluteUrl,
    randomToken: () => randomBytes(32).toString('base64url'),
    hashToken: (raw) => createHash('sha256').update(raw).digest('hex')
  };
}

/**
 * Send a just-queued outbox row after the response has been returned.
 * Failures are recorded on the row (retry/backoff) by sendOutboxRow, and
 * anything unexpected is swallowed: the scheduled worker picks it up later.
 */
export function sendOutboxRowAfterResponse(rowId: string | null | undefined): void {
  if (!rowId) return;
  after(async () => {
    try {
      await sendOutboxRow(rowId, outboxDeps());
    } catch (error) {
      console.error('Immediate email send failed; scheduled worker will retry.', {
        rowId,
        error: error instanceof Error ? error.message : 'unknown'
      });
    }
  });
}
