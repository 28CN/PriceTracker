-- Trigger functions are never meant to be called directly. Triggers still fire
-- after this: Postgres only checks EXECUTE when the trigger is created.
-- RLS helpers and public_profile_by_slug stay callable (already search_path='').
revoke execute on function public.evaluate_target_price_alert() from public, anon, authenticated;
revoke execute on function public.handle_new_auth_user() from public, anon, authenticated;
revoke execute on function public.normalise_weekly_target_outbox() from public, anon, authenticated;
revoke execute on function public.queue_weekly_target_digest() from public, anon, authenticated;

grant execute on function public.evaluate_target_price_alert() to service_role;
grant execute on function public.handle_new_auth_user() to service_role;
grant execute on function public.normalise_weekly_target_outbox() to service_role;
grant execute on function public.queue_weekly_target_digest() to service_role;
