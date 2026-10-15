-- Category-level privacy and one weekly target-price digest.
begin;

alter table public.categories
  add column if not exists is_public boolean not null default true;

create or replace function public.can_view_product(candidate uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.products p
    join public.profiles profile on profile.id = p.owner_id
    left join public.categories c on c.id = p.category_id
    where p.id = candidate
      and (
        p.owner_id = (select auth.uid())
        or (
          profile.watchlist_visibility = 'public'
          and (p.category_id is null or c.is_public is true)
        )
      )
  );
$$;

drop policy if exists "users read visible categories" on public.categories;
create policy "users read visible categories"
on public.categories for select
to anon, authenticated
using (
  owner_id = (select auth.uid())
  or (
    is_public is true
    and exists (
      select 1
      from public.profiles p
      where p.id = categories.owner_id
        and p.watchlist_visibility = 'public'
    )
  )
);

drop policy if exists "users read visible products" on public.products;
create policy "users read visible products"
on public.products for select
to anon, authenticated
using (public.can_view_product(id));

create or replace function public.normalise_weekly_target_outbox()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  local_now timestamp;
  week_key text;
  item jsonb;
  product_key text;
begin
  if new.kind <> 'target_price' then
    return new;
  end if;

  local_now := timezone('Australia/Sydney', now());
  if extract(isodow from local_now) < 3 then
    return null;
  end if;

  week_key := to_char(date_trunc('week', local_now), 'YYYY-MM-DD');
  product_key := coalesce(new.product_id::text, 'initial');
  if new.payload ? 'itemsByProduct' then
    new.product_id := null;
    new.dedupe_key := 'target-weekly:' || new.user_id::text || ':' || week_key;
    new.next_attempt_at := now() + interval '45 minutes';
    return new;
  end if;

  item := jsonb_build_object(
    'productName', new.payload -> 'productName',
    'targetPrice', new.payload -> 'targetPrice',
    'currentPrice', new.payload -> 'currentPrice',
    'retailer', new.payload -> 'retailer',
    'url', new.payload -> 'url'
  );
  new.product_id := null;
  new.dedupe_key := 'target-weekly:' || new.user_id::text || ':' || week_key;
  new.next_attempt_at := now() + interval '45 minutes';
  new.payload := jsonb_build_object(
    'week', week_key,
    'itemsByProduct', jsonb_build_object(product_key, item)
  );
  return new;
end;
$$;

drop trigger if exists email_outbox_normalise_weekly_target on public.email_outbox;
create trigger email_outbox_normalise_weekly_target
before insert on public.email_outbox
for each row execute function public.normalise_weekly_target_outbox();

create or replace function public.queue_weekly_target_digest()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  tracked_product record;
  current_offer record;
  destination text;
  alerts_enabled boolean;
  local_now timestamp;
  week_key text;
  item jsonb;
  outbox_payload jsonb;
begin
  local_now := timezone('Australia/Sydney', now());
  if extract(isodow from local_now) < 3 then
    return new;
  end if;

  select p.id, p.owner_id, p.name, p.target_price
  into tracked_product
  from public.tracked_links l
  join public.products p on p.id = l.product_id
  where l.id = new.link_id;

  if tracked_product.owner_id is null or tracked_product.target_price is null then
    return new;
  end if;

  select latest.price, latest.retailer, latest.url
  into current_offer
  from (
    select distinct on (l.id)
      ph.price,
      l.retailer,
      l.url,
      l.id
    from public.tracked_links l
    join public.price_history ph on ph.link_id = l.id
    where l.product_id = tracked_product.id
      and l.is_active is true
      and coalesce(l.stock_status, 'unknown') <> 'unavailable'
    order by l.id, ph.created_at desc
  ) latest
  order by latest.price asc
  limit 1;

  if current_offer.price is null or current_offer.price > tracked_product.target_price then
    return new;
  end if;

  select a.contact_email, n.target_price_email
  into destination, alerts_enabled
  from public.account_private a
  join public.notification_preferences n on n.user_id = a.user_id
  where a.user_id = tracked_product.owner_id
    and a.contact_email_verified_at is not null;

  if destination is null or alerts_enabled is not true then
    return new;
  end if;

  week_key := to_char(date_trunc('week', local_now), 'YYYY-MM-DD');
  item := jsonb_build_object(
    'productName', tracked_product.name,
    'targetPrice', tracked_product.target_price,
    'currentPrice', current_offer.price,
    'retailer', current_offer.retailer,
    'url', current_offer.url
  );
  outbox_payload := jsonb_build_object(
    'week', week_key,
    'itemsByProduct', jsonb_build_object(tracked_product.id::text, item)
  );

  insert into public.email_outbox as existing (
    user_id,
    product_id,
    kind,
    recipient,
    payload,
    dedupe_key
  )
  values (
    tracked_product.owner_id,
    null,
    'target_price',
    destination,
    outbox_payload,
    'target-weekly:' || tracked_product.owner_id::text || ':' || week_key
  )
  on conflict (dedupe_key) do update set
    payload = jsonb_set(
      existing.payload,
      '{itemsByProduct}',
      coalesce(existing.payload -> 'itemsByProduct', '{}'::jsonb)
        || jsonb_build_object(tracked_product.id::text, item),
      true
    ),
    next_attempt_at = greatest(existing.next_attempt_at, now() + interval '45 minutes')
  where existing.status in ('pending', 'retry');

  return new;
end;
$$;

drop trigger if exists price_history_queue_weekly_target on public.price_history;
create trigger price_history_queue_weekly_target
after insert on public.price_history
for each row execute function public.queue_weekly_target_digest();

update public.notification_preferences
set digest_frequency = 'weekly'
where digest_frequency <> 'weekly';

commit;
