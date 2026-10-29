-- v1.1: weekly/fortnightly promo cycles per retailer, for splitting price
-- history into promo periods. Reference data only; never touches price_history.
-- anchor_weekday is ISO (1 = Monday ... 7 = Sunday); a period starts at local
-- midnight on that weekday in `timezone` and lasts cycle_days days.
-- Retailers without a row use the default: Wednesday, 7 days, Australia/Sydney.
create table if not exists public.retailer_promo_cycles (
  id uuid primary key default gen_random_uuid(),
  retailer text not null check (length(btrim(retailer)) between 1 and 100),
  anchor_weekday smallint not null check (anchor_weekday between 1 and 7),
  cycle_days smallint not null check (cycle_days in (7, 14)),
  timezone text not null default 'Australia/Sydney'
    check (timezone in ('Australia/Sydney','Australia/Melbourne','Australia/Brisbane','Australia/Adelaide',
                        'Australia/Perth','Australia/Hobart','Australia/Darwin','Australia/Canberra')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists retailer_promo_cycles_retailer_ci
  on public.retailer_promo_cycles (lower(btrim(retailer)));

comment on table public.retailer_promo_cycles is
  'Promo cycle per retailer (ISO anchor weekday, 7 or 14 days, IANA timezone). Read-only reference data for the price-insight API.';

alter table public.retailer_promo_cycles enable row level security;

drop policy if exists "anyone reads promo cycles" on public.retailer_promo_cycles;
create policy "anyone reads promo cycles" on public.retailer_promo_cycles
  for select to anon, authenticated
  using (true);

-- Explicit grants (no TRUNCATE for anyone), consistent with 202610290012.
revoke all on public.retailer_promo_cycles from public, anon, authenticated, service_role;
grant select on public.retailer_promo_cycles to anon, authenticated;
grant select, insert, update, delete, references, trigger on public.retailer_promo_cycles to service_role;

insert into public.retailer_promo_cycles (retailer, anchor_weekday, cycle_days) values
  ('Coles', 3, 7),
  ('Woolworths', 3, 7),
  ('Chemist Warehouse', 3, 14),
  ('Priceline', 3, 14),
  ('TerryWhite Chemmart', 3, 14)
on conflict (lower(btrim(retailer))) do nothing;
