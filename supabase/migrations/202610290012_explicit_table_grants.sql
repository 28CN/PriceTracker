-- Explicit table-level grants for every table in the public schema.
--
-- Why: from 2026-10-30 Supabase no longer auto-grants new public tables to the
-- Data API roles. Without explicit grants a fresh project, preview branch or
-- `supabase db reset` would leave anon/authenticated/service_role with no
-- table access at all.
--
-- Design: grants mirror the RLS policies exactly. A role gets a privilege on a
-- table only where an RLS policy for that role+command exists, so effective
-- access is identical to production today. TRUNCATE / REFERENCES / TRIGGER are
-- never granted to anon/authenticated (TRUNCATE bypasses RLS).
-- service_role (server-side only, bypasses RLS) keeps full access.
--
-- GRANT is idempotent. This migration only adds privileges; it revokes
-- nothing and touches no rows (price_history data is untouched).

-- service_role: full access on all application tables.
grant select, insert, update, delete, truncate, references, trigger on
  public.profiles,
  public.account_private,
  public.user_security,
  public.user_roles,
  public.notification_preferences,
  public.privacy_consents,
  public.user_preferences,
  public.email_verification_tokens,
  public.price_alert_states,
  public.email_outbox,
  public.email_delivery_events,
  public.auth_rate_limits,
  public.products,
  public.categories,
  public.tracked_links,
  public.price_history,
  public.crawl_events,
  public.app_settings,
  public.crawl_jobs
to service_role;

-- anon: public read of visible catalogue data only (RLS filters rows).
grant select on public.products, public.categories, public.tracked_links, public.price_history to anon;

-- authenticated: per RLS policies.
grant select, insert, update, delete on public.products, public.categories, public.tracked_links to authenticated;
grant select on public.price_history to authenticated;
grant select, update on public.profiles, public.account_private, public.crawl_events to authenticated;
grant select, insert, update, delete on public.notification_preferences, public.user_preferences to authenticated;
grant select, insert on public.privacy_consents to authenticated;
grant select on public.user_roles, public.user_security to authenticated;

-- Intentionally NO anon/authenticated grants (no RLS policies; server-only via
-- service_role / security definer functions): email_verification_tokens,
-- price_alert_states, email_outbox, email_delivery_events, auth_rate_limits,
-- app_settings, crawl_jobs.
