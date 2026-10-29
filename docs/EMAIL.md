# Email (verification, password recovery, price alerts)

Email is **off by default** and gated in three places. All three must be on for email to work.

| Gate | Where | Controls |
| --- | --- | --- |
| `EMAIL_ENABLED` | Vercel env (server-only) | API routes that queue email return 503 / skip queuing; `/api/internal/email-worker` returns `{ ok: true, skipped: true }` without claiming rows or calling Resend. |
| `NEXT_PUBLIC_EMAIL_ENABLED` | Vercel env (UI only) | Greys out email controls and shows `邮件功能开发中，暂不可用`. **`NEXT_PUBLIC_` values are inlined at build time, so changing it needs a redeploy.** |
| `app_settings.email_enabled` | Supabase table row | A `BEFORE INSERT` trigger on `email_outbox` (`email_outbox_00_email_enabled_gate`) drops every new outbox row while this is not `true`. This stops the target-price and weekly-digest triggers. Alert state (`price_alert_states`, episodes) still updates normally, so old alerts don't flood out when email is switched on. |

Each flag is on only when the value is exactly `true`.

While off: registration and sign-in work normally (registration just skips the verification email). Existing queued rows are left in `email_outbox` untouched; the worker resumes them when email is enabled. Using an existing verification or reset link still works.

## Enable steps

1. **Verify a sending domain** at <https://resend.com/domains> (add the DNS records Resend shows and wait for "Verified"). Until then Resend is in testing mode and only delivers to the account owner's address.
2. **Set `RESEND_FROM_EMAIL`** on Vercel (Production and Preview) to an address on the verified domain, e.g. `PriceTracker <noreply@your-domain>`. Confirm `RESEND_API_KEY` is set.
3. **Set `EMAIL_ENABLED=true`** on Vercel (Production and Preview), server-side.
4. **Set `NEXT_PUBLIC_EMAIL_ENABLED=true`** on Vercel (Production and Preview).
5. **Flip the database flag** (SQL editor, as service role / postgres):
   ```sql
   update public.app_settings set value = 'true'::jsonb, updated_at = now() where key = 'email_enabled';
   ```
6. **Redeploy** production (required for `NEXT_PUBLIC_EMAIL_ENABLED` to reach the browser bundle).
7. **Test**
   - Account page: set a contact email → a `verify_contact` row appears in `email_outbox`.
   - Run the worker: `gh workflow run send-emails.yml -R 28CN/PriceTracker`; the run log shows `"sent":1` and the email arrives. Click the link → email verified.
   - `/forgot-password` with that username → reset email arrives.
   - `curl -I -X POST https://<site>/api/auth/recover` no longer returns 503.

## Disable again

Set `EMAIL_ENABLED` and `NEXT_PUBLIC_EMAIL_ENABLED` to anything other than `true` (or remove them), set the DB row back to `'false'::jsonb`, and redeploy.
