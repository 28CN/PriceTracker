-- Database-side email gate. Email is off by default.
-- The flag lives in app_settings (RLS on, no policies: only service_role can
-- read or write it through the API). No data is deleted; rows already queued
-- in email_outbox are left as they are.
insert into public.app_settings (key, value)
values ('email_enabled', 'false'::jsonb)
on conflict (key) do nothing;

create or replace function public.email_enabled()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select s.value = 'true'::jsonb from public.app_settings s where s.key = 'email_enabled'),
    false
  );
$$;

revoke execute on function public.email_enabled() from public, anon, authenticated;
grant execute on function public.email_enabled() to service_role;

-- Gate every new outbox row (target-price trigger, weekly digest trigger and
-- any app insert) in one place. Returning NULL from a BEFORE INSERT trigger
-- skips the row, including the ON CONFLICT DO UPDATE path of the weekly
-- digest. The "00_" prefix makes it fire before the other email_outbox
-- triggers (Postgres fires same-event triggers in name order).
create or replace function public.email_outbox_insert_gate()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.email_enabled() then
    return null;
  end if;
  return new;
end;
$$;

revoke execute on function public.email_outbox_insert_gate() from public, anon, authenticated;
grant execute on function public.email_outbox_insert_gate() to service_role;

drop trigger if exists email_outbox_00_email_enabled_gate on public.email_outbox;
create trigger email_outbox_00_email_enabled_gate
before insert on public.email_outbox
for each row execute function public.email_outbox_insert_gate();
