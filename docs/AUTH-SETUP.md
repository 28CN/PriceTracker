# Account, Supabase and email setup

Complete these steps in order. Do not paste API keys, database passwords or generated
account passwords into chat, source control, screenshots or issue trackers.

## 1. Revoke the exposed Resend key

The key beginning with `re_Us...` was pasted into chat and must be treated as compromised.

1. Open [Resend API Keys](https://resend.com/api-keys).
2. Delete that key.
3. Create a replacement with sending access.
4. Keep the replacement open only long enough to copy it into local/deployment secrets.

## 2. Back up the existing Supabase data

Before the ownership migration, export these tables from Supabase Table Editor as CSV:

- `products`
- `categories`
- `tracked_links`
- `price_history`
- `crawl_events`
- `app_settings`

Store the exports outside the repository. A paid Supabase project may also use its dashboard
backup facilities, but CSV export is sufficient for the ownership columns changed here.

## 3. Run the database migration

1. Open Supabase.
2. Choose the PriceTracker project.
3. Open **SQL Editor**.
4. Select **New query**.
5. Open `supabase/migrations/202610150001_accounts_and_rls.sql` locally.
6. Copy the entire file into SQL Editor.
7. Select **Run**.
8. Confirm the result says success. If it reports an error, stop and copy only the error
   message (never a key) back into Cursor.

The old products become temporarily hidden after the RLS policies change. The bootstrap step
immediately assigns them to `melody2251`.

## 4. Configure local secrets

Generate three independent random values in PowerShell:

```powershell
$bytes = New-Object byte[] 32
[Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
[Convert]::ToBase64String($bytes)
```

Add these names to `.env.local`; use a different generated value for each secret:

```dotenv
NEXT_PUBLIC_APP_URL=http://localhost:3000
AUTH_RATE_LIMIT_PEPPER=<first-random-value>
EMAIL_WORKER_SECRET=<second-random-value>
BOOTSTRAP_ACCOUNT_TOKEN=<third-random-value>
BOOTSTRAP_ADMIN_EMAIL=<your-real-admin-recovery-email>

RESEND_API_KEY=<new-resend-key>
RESEND_FROM_EMAIL=PriceTracker <alerts@your-verified-domain>
```

Do not replace the existing Supabase or GitHub variables.

## 5. Create the initial accounts and move existing data

After the migration succeeds:

```powershell
npm run bootstrap:accounts
```

The command:

- creates `admin`;
- creates `melody2251`;
- prints a different temporary password for each newly created account;
- requires both passwords to be changed at first login;
- grants only `admin` the administrator role;
- moves all ownerless products and categories to `melody2251`;
- makes the migrated `melody2251` watchlist public and read-only to visitors.

Save the temporary passwords in a password manager immediately. The script does not write
them to a file. Re-running it is safe and does not replace passwords after a completed
bootstrap; an interrupted bootstrap issues a new recoverable temporary password.
Keep `BOOTSTRAP_ACCOUNT_TOKEN` stable: it lets an interrupted bootstrap safely identify and
recover only the accounts it created, without trusting a predictable username or email.

## 6. Configure Supabase Auth

In **Authentication → URL Configuration**:

- Site URL: the production site, for example `https://your-domain.example`
- Redirect URLs:
  - `http://localhost:3000/**`
  - `https://your-domain.example/**`
  - the Vercel preview pattern if previews are used

In **Authentication → Providers → Email**:

- keep email/password authentication enabled;
- disable direct public signups if the dashboard offers a separate **Allow new users to sign
  up** switch. PriceTracker registration uses its rate-limited username adapter;
- set the minimum password length to 15 if the dashboard exposes the setting.

Do not create `admin` or `melody2251` by inserting rows into `auth.users` in SQL.

## 7. Set up a Resend sending domain

1. Open [Resend Domains](https://resend.com/domains).
2. Add a domain or sending subdomain, for example `mail.your-domain.example`.
3. At the DNS provider, add every SPF and DKIM record Resend displays.
4. Wait until Resend marks the domain **Verified**.
5. Set `RESEND_FROM_EMAIL` to an address on that domain.

Resend does not require hand-written dashboard templates. Templates live in the application
and are sent through the API.

For an initial sandbox test before a domain is ready, Resend normally restricts
`onboarding@resend.dev` to the Resend account owner's address. Do not use that sender for
public testing.

## 8. Configure the Resend webhook

After the application has a public URL:

1. Open **Resend → Webhooks → Add Endpoint**.
2. Endpoint URL:
   `https://your-domain.example/api/webhooks/resend`
3. Subscribe to delivered, bounced and complained email events.
4. Copy the webhook signing secret into deployment secrets as
   `RESEND_WEBHOOK_SECRET`.

The webhook records delivery events and disables affected subscriptions after a bounce or
complaint.

## 9. Configure deployment and scheduled delivery

Add all variables from `.env.local.example` to the Vercel project. Use Production, Preview
and Development scopes as appropriate. Never expose service, Resend or worker secrets with a
`NEXT_PUBLIC_` prefix.

In GitHub repository **Settings → Secrets and variables → Actions**, add:

- `APP_URL`: the deployed site URL
- `EMAIL_WORKER_SECRET`: exactly the same value used by the deployment

The `send-emails.yml` workflow drains queued mail every ten minutes and can also be run
manually from the Actions page.

## 10. First-login checklist

1. Sign in as `admin`.
2. Change the temporary password.
3. Open Account settings and set up the authenticator app.
4. Verify the administrator recovery email.
5. Sign out, then sign in as `melody2251`.
6. Change its temporary password.
7. Optionally add and verify its contact email.
8. Confirm `/melody2251` is visible in a private browser window and cannot be edited.
9. Register a separate test user and confirm it cannot read or modify another private list.

Administrator API operations remain locked until the current session reaches Supabase
Authenticator Assurance Level 2 (TOTP verified).
