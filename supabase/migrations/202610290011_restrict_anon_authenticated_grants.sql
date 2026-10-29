-- P0: anon/authenticated must never TRUNCATE (bypasses RLS), nor hold
-- REFERENCES/TRIGGER on public objects. Table DML is cut down to what RLS
-- allows (same matrix as the explicit-grants migration). Idempotent.
revoke truncate, references, trigger on all tables in schema public from anon, authenticated;

-- Base tables: drop everything, then re-grant only what RLS policies allow.
do $$
declare t record;
begin
  for t in select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
           where n.nspname = 'public' and c.relkind in ('r','p') loop
    execute format('revoke all on public.%I from anon, authenticated', t.relname);
  end loop;
end $$;

grant select on public.products, public.categories, public.tracked_links, public.price_history to anon;
grant select, insert, update, delete on public.products, public.categories, public.tracked_links to authenticated;
grant select on public.price_history to authenticated;
grant select, update on public.profiles, public.account_private, public.crawl_events to authenticated;
grant select, insert, update, delete on public.notification_preferences, public.user_preferences to authenticated;
grant select, insert on public.privacy_consents to authenticated;
grant select on public.user_roles, public.user_security to authenticated;

alter default privileges for role postgres in schema public
  revoke truncate, references, trigger on tables from anon, authenticated;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'supabase_admin') then
    begin
      execute 'alter default privileges for role supabase_admin in schema public
               revoke truncate, references, trigger on tables from anon, authenticated';
    exception when insufficient_privilege then
      raise notice 'skipping supabase_admin default privileges (insufficient privilege)';
    end;
  end if;
end $$;
