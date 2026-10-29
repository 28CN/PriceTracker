-- Hotfix: SECURITY DEFINER functions must only be callable by the service role.
-- All app/crawler call sites use the service-role key. Idempotent.
revoke execute on function public.claim_email_outbox(integer) from public, anon, authenticated;
revoke execute on function public.claim_legacy_data(text) from public, anon, authenticated;
revoke execute on function public.claim_crawl_jobs(text) from public, anon, authenticated;
revoke execute on function public.finish_crawl_jobs(uuid[], text, text) from public, anon, authenticated;
revoke execute on function public.unsubscribe_target_email(text) from public, anon, authenticated;
revoke execute on function public.consume_auth_rate_limit(text, text, integer, integer) from public, anon, authenticated;

grant execute on function public.claim_email_outbox(integer) to service_role;
grant execute on function public.claim_legacy_data(text) to service_role;
grant execute on function public.claim_crawl_jobs(text) to service_role;
grant execute on function public.finish_crawl_jobs(uuid[], text, text) to service_role;
grant execute on function public.unsubscribe_target_email(text) to service_role;
grant execute on function public.consume_auth_rate_limit(text, text, integer, integer) to service_role;

-- New functions created by postgres in public no longer get EXECUTE for
-- anon/authenticated by default. Any future function that must be callable by
-- clients (or used inside RLS policies) needs an explicit grant.
alter default privileges for role postgres in schema public revoke execute on functions from public, anon, authenticated;
alter default privileges for role postgres in schema public grant execute on functions to service_role;
