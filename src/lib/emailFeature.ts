// Email feature flag. Off unless the value is exactly 'true'.
// - EMAIL_ENABLED (server-only): API routes and the email worker.
// - NEXT_PUBLIC_EMAIL_ENABLED: UI only. Inlined at build time, so a change needs a redeploy.
// The database has its own gate: app_settings key 'email_enabled' (see docs/EMAIL.md).

export const EMAIL_DISABLED_MESSAGE = 'Email features are under development and temporarily unavailable.';

export function flagOn(value: string | undefined): boolean {
  return value === 'true';
}

export function isEmailEnabled(value: string | undefined = process.env.EMAIL_ENABLED): boolean {
  return flagOn(value);
}

export function isEmailUiEnabled(
  value: string | undefined = process.env.NEXT_PUBLIC_EMAIL_ENABLED
): boolean {
  return flagOn(value);
}

export type EmailPrefs = {
  target_price_email?: boolean | null;
  popular_deals_email?: boolean | null;
  personalised_recommendations_email?: boolean | null;
};

/**
 * While email is disabled, an account update may not change the contact email
 * or switch on any email preference. Switching preferences off is allowed.
 */
export function accountUpdateNeedsEmail(
  previous: { contactEmail: string | null; prefs: EmailPrefs | null },
  next: { contactEmail: string | null; prefs: EmailPrefs }
): boolean {
  const before = (previous.contactEmail || '').trim().toLowerCase();
  const after = (next.contactEmail || '').trim().toLowerCase();
  if (after && after !== before) return true;
  const keys: (keyof EmailPrefs)[] = [
    'target_price_email',
    'popular_deals_email',
    'personalised_recommendations_email'
  ];
  return keys.some((key) => next.prefs[key] === true && previous.prefs?.[key] !== true);
}
