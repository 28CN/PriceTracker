-- A crawl request survives even when the current runner cannot start.
begin;

create table if not exists public.crawl_jobs (
  id uuid primary key default gen_random_uuid(),
  requested_by uuid references auth.users(id) on delete set null,
  product_id uuid references public.products(id) on delete cascade,
  link_id uuid references public.tracked_links(id) on delete cascade,
  status text not null default 'pending'
    check (status in ('pending', 'running', 'done', 'failed')),
  runner text,
  last_error text,
  created_at timestamptz not null default now(),
  claimed_at timestamptz,
  finished_at timestamptz
);

create index if not exists crawl_jobs_pending_idx
  on public.crawl_jobs (created_at)
  where status = 'pending';

alter table public.crawl_jobs enable row level security;

create or replace function public.claim_crawl_jobs(candidate_runner text)
returns setof public.crawl_jobs
language plpgsql
security definer
set search_path = ''
as $$
begin
  return query
  with picked as (
    select jobs.id
    from public.crawl_jobs jobs
    where jobs.status = 'pending'
    order by jobs.created_at
    for update skip locked
  )
  update public.crawl_jobs jobs
  set
    status = 'running',
    runner = coalesce(nullif(candidate_runner, ''), 'unknown'),
    claimed_at = now()
  from picked
  where jobs.id = picked.id
  returning jobs.*;
end;
$$;

create or replace function public.finish_crawl_jobs(
  job_ids uuid[],
  final_status text,
  error_text text default ''
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if final_status not in ('pending', 'done', 'failed') then
    raise exception 'Unsupported crawl job status';
  end if;

  if coalesce(array_length(job_ids, 1), 0) = 0 then
    return;
  end if;

  if final_status = 'pending' then
    update public.crawl_jobs
    set
      status = 'pending',
      runner = null,
      claimed_at = null,
      finished_at = null,
      last_error = nullif(error_text, '')
    where id = any(job_ids)
      and status = 'running';
    return;
  end if;

  update public.crawl_jobs
  set
    status = final_status,
    finished_at = now(),
    last_error = nullif(error_text, '')
  where id = any(job_ids)
    and status = 'running';
end;
$$;

revoke all on function public.claim_crawl_jobs(text) from public;
revoke all on function public.finish_crawl_jobs(uuid[], text, text) from public;
grant execute on function public.claim_crawl_jobs(text) to service_role;
grant execute on function public.finish_crawl_jobs(uuid[], text, text) to service_role;

commit;
