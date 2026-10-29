-- Explicit execute grants for the demo functions. Since 202610290002 new public
-- functions get no anon/authenticated execute by default.
-- is_demo_user() is used inside RLS policies; the trigger function keeps the
-- same privileges as the other trigger functions (protect_profile_identity()).
-- Grant only; no data changes.
grant execute on function public.is_demo_user() to anon, authenticated, service_role;
grant execute on function public.protect_profile_demo_flag() to anon, authenticated, service_role;
