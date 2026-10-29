import { emailFrame, escapeHtml } from './email.ts';

export type OutboxRow = {
  id: string;
  user_id: string | null;
  product_id: string | null;
  kind: 'target_price' | 'verify_contact' | 'recover_password' | 'account_notice';
  recipient: string;
  payload: Record<string, unknown>;
  attempt_count: number;
};

type DbResult = { data?: unknown; error: { message: string } | null };
type Thenable = PromiseLike<DbResult>;

/** Minimal slice of the Supabase service-role client this module needs. */
export type OutboxAdmin = {
  rpc(fn: string, args: Record<string, unknown>): Thenable;
  from(table: string): {
    insert(values: Record<string, unknown>): Thenable;
    update(values: Record<string, unknown>): {
      eq(column: string, value: string): Thenable;
    };
  };
};

export type OutboxDeps = {
  admin: OutboxAdmin;
  send: (input: { to: string; subject: string; html: string; text: string }) => Promise<string>;
  absoluteUrl: (path: string) => string;
  randomToken: () => string;
  hashToken: (raw: string) => string;
  now?: () => number;
};

export type OutboxResult = { claimed: number; sent: number; failed: number };

function money(value: unknown): string {
  const amount = Number(value);
  return Number.isFinite(amount)
    ? new Intl.NumberFormat('en-AU', {
        style: 'currency',
        currency: 'AUD'
      }).format(amount)
    : 'the target price';
}

export async function contentFor(row: OutboxRow) {
  const payload = row.payload || {};
  if (row.kind === 'target_price') {
    const itemMap =
      payload.itemsByProduct && typeof payload.itemsByProduct === 'object'
        ? (payload.itemsByProduct as Record<string, unknown>)
        : null;
    const items = itemMap
      ? Object.values(itemMap).filter(
          (item): item is Record<string, unknown> =>
            Boolean(item) && typeof item === 'object' && !Array.isArray(item)
        )
      : [payload];
    const text = items
      .map(
        (item) =>
          `${item.productName} is ${money(item.currentPrice)} at ${item.retailer}. ` +
          `Target: ${money(item.targetPrice)}. ${item.url || ''}`
      )
      .join('\n');
    const rows = items
      .map((item) => {
        const shopUrl = String(item.url || '');
        return `
          <div style="padding:14px 0;border-top:1px solid #e5e9e7">
            <strong style="display:block;font-size:16px">${escapeHtml(item.productName)}</strong>
            <span style="display:block;margin:5px 0;color:#52605a">
              ${escapeHtml(money(item.currentPrice))} at ${escapeHtml(item.retailer || 'a tracked retailer')}
              · target ${escapeHtml(money(item.targetPrice))}
            </span>
            ${shopUrl ? `<a href="${escapeHtml(shopUrl)}" style="color:#356b55;font-weight:700">View at retailer</a>` : ''}
          </div>
        `;
      })
      .join('');
    return {
      subject:
        items.length === 1
          ? `${items[0].productName} reached your target`
          : `${items.length} tracked products reached your targets`,
      text,
      body: `
        <p style="margin:0 0 8px;color:#68736e;font-size:13px">Weekly target-price update</p>
        <h1 style="margin:0 0 12px;font-size:25px;line-height:1.25">Prices worth checking this week</h1>
        ${rows}
      `
    };
  }

  if (row.kind === 'verify_contact') {
    const verifyUrl = String(payload.verifyUrl || '');
    return {
      subject: 'Verify your PriceTracker email',
      text: `Verify your email: ${verifyUrl}`,
      body: `
        <h1 style="margin:0 0 12px;font-size:25px">Verify your email</h1>
        <p style="margin:0 0 18px;line-height:1.6">Confirm this address before using it for password recovery or price alerts.</p>
        <a href="${escapeHtml(verifyUrl)}" style="display:inline-block;padding:11px 16px;border-radius:9px;background:#356b55;color:#ffffff;text-decoration:none;font-weight:700">Verify email</a>
      `
    };
  }

  if (row.kind === 'recover_password') {
    const recoverUrl = String(payload.recoverUrl || '');
    return {
      subject: 'Reset your PriceTracker password',
      text: `Reset your password: ${recoverUrl}`,
      body: `
        <h1 style="margin:0 0 12px;font-size:25px">Reset your password</h1>
        <p style="margin:0 0 18px;line-height:1.6">This link expires in one hour. Ignore this email if you did not request it.</p>
        <a href="${escapeHtml(recoverUrl)}" style="display:inline-block;padding:11px 16px;border-radius:9px;background:#356b55;color:#ffffff;text-decoration:none;font-weight:700">Choose a new password</a>
      `
    };
  }

  return {
    subject: String(payload.subject || 'PriceTracker account notice'),
    text: String(payload.text || 'There is an update to your PriceTracker account.'),
    body: `<p style="margin:0;line-height:1.6">${escapeHtml(
      payload.text || 'There is an update to your PriceTracker account.'
    )}</p>`
  };
}

async function processRows(rows: OutboxRow[], deps: OutboxDeps): Promise<OutboxResult> {
  const { admin } = deps;
  const now = deps.now ?? Date.now;
  let sent = 0;
  let failed = 0;

  for (const row of rows) {
    try {
      let unsubscribeUrl: string | undefined;
      if (row.kind === 'target_price' && row.user_id) {
        let rawToken = String(row.payload.unsubscribeToken || '');
        if (!rawToken) {
          rawToken = deps.randomToken();
          const expiresAt = new Date(now() + 366 * 24 * 60 * 60 * 1000).toISOString();
          await admin.from('email_verification_tokens').insert({
            user_id: row.user_id,
            email: row.recipient,
            purpose: 'unsubscribe',
            token_hash: deps.hashToken(rawToken),
            expires_at: expiresAt
          });
          row.payload = { ...row.payload, unsubscribeToken: rawToken };
          await admin.from('email_outbox').update({ payload: row.payload }).eq('id', row.id);
        }
        unsubscribeUrl = deps.absoluteUrl(`/unsubscribe?token=${encodeURIComponent(rawToken)}`);
      }

      const content = await contentFor(row);
      const providerId = await deps.send({
        to: row.recipient,
        subject: content.subject,
        text: content.text,
        html: emailFrame(content.body, unsubscribeUrl)
      });
      await admin
        .from('email_outbox')
        .update({
          status: 'sent',
          sent_at: new Date(now()).toISOString(),
          provider_message_id: providerId,
          locked_at: null,
          last_error: null
        })
        .eq('id', row.id);
      sent += 1;
    } catch (sendError) {
      const message = sendError instanceof Error ? sendError.message : 'Unknown email error';
      const permanent = row.attempt_count >= 5;
      const delayMinutes = Math.min(60, 2 ** Math.max(0, row.attempt_count - 1));
      await admin
        .from('email_outbox')
        .update({
          status: permanent ? 'failed' : 'retry',
          next_attempt_at: new Date(now() + delayMinutes * 60_000).toISOString(),
          locked_at: null,
          last_error: message.slice(0, 500)
        })
        .eq('id', row.id);
      failed += 1;
    }
  }

  return { claimed: rows.length, sent, failed };
}

/** Scheduled worker path: claim up to batchSize due rows and send them. */
export async function drainOutbox(deps: OutboxDeps, batchSize = 25): Promise<OutboxResult> {
  const { data, error } = await deps.admin.rpc('claim_email_outbox', {
    batch_size: batchSize
  });
  if (error) throw new Error(error.message);
  return processRows((data || []) as OutboxRow[], deps);
}

/**
 * Immediate path: claim exactly one row by id and send it. If the row is not
 * claimable (already locked, sent, or not due) nothing happens; the scheduled
 * worker remains the retry fallback.
 */
export async function sendOutboxRow(rowId: string, deps: OutboxDeps): Promise<OutboxResult> {
  const { data, error } = await deps.admin.rpc('claim_email_outbox_row', {
    row_id: rowId
  });
  if (error) throw new Error(error.message);
  return processRows((data || []) as OutboxRow[], deps);
}
