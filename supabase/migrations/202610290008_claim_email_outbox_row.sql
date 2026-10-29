-- Claim one specific outbox row (used to send verification / recovery emails
-- immediately after they are queued). Same eligibility and locking rules as
-- claim_email_outbox: only due pending/retry rows, or processing rows whose
-- lock is older than 10 minutes. Returns no row if the row is already being
-- sent, was sent, or is not due, so the scheduled worker and the immediate
-- send can never deliver the same row twice.
create or replace function public.claim_email_outbox_row(row_id uuid)
returns setof public.email_outbox
language sql
security definer
set search_path = ''
as $$
  with candidate as (
    select id
    from public.email_outbox
    where id = row_id
      and (
        (status in ('pending', 'retry') and next_attempt_at <= now())
        or (status = 'processing' and locked_at < now() - interval '10 minutes')
      )
    for update skip locked
  )
  update public.email_outbox o
  set
    status = 'processing',
    locked_at = now(),
    attempt_count = o.attempt_count + 1
  from candidate c
  where o.id = c.id
  returning o.*;
$$;

revoke execute on function public.claim_email_outbox_row(uuid) from public, anon, authenticated;
grant execute on function public.claim_email_outbox_row(uuid) to service_role;
