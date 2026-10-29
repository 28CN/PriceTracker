-- Price inserts were rolling back: the alert triggers read l.stock_status, but that
-- column lived only in the old schema.sql (now removed) and was never applied here.
-- A saved price older than 7 days is also left out of target alerts. Supermarket
-- specials turn over weekly, so an old reading must not count as the current deal.

alter table public.tracked_links
  add column if not exists stock_status text not null default 'unknown';

alter table public.tracked_links
  drop constraint if exists tracked_links_stock_status_check;

alter table public.tracked_links
  add constraint tracked_links_stock_status_check
  check (stock_status in ('unknown', 'in_stock', 'unavailable'));

alter table public.tracked_links
  add column if not exists stock_checked_at timestamptz;

create or replace function public.evaluate_target_price_alert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  tracked_product record;
  current_offer record;
  alert_state record;
  next_episode integer;
  destination text;
  alerts_enabled boolean;
begin
  select
    p.id,
    p.owner_id,
    p.name,
    p.target_price
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
      l.id,
      ph.created_at
    from public.tracked_links l
    join public.price_history ph on ph.link_id = l.id
    where l.product_id = tracked_product.id
      and l.is_active is true
      and (
        l.id = new.link_id
        or coalesce(l.stock_status, 'unknown') <> 'unavailable'
      )
    order by l.id, ph.created_at desc
  ) latest
  where latest.created_at >= now() - interval '7 days'
  order by latest.price asc
  limit 1;

  if current_offer.price is null then
    return new;
  end if;

  select * into alert_state
  from public.price_alert_states s
  where s.product_id = tracked_product.id
  for update;

  if current_offer.price <= tracked_product.target_price
    and coalesce(alert_state.is_below_target, false) is false then
    next_episode := coalesce(alert_state.episode, 0) + 1;

    insert into public.price_alert_states (
      product_id,
      user_id,
      is_below_target,
      episode,
      last_price,
      last_retailer,
      evaluated_at
    )
    values (
      tracked_product.id,
      tracked_product.owner_id,
      true,
      next_episode,
      current_offer.price,
      current_offer.retailer,
      now()
    )
    on conflict (product_id) do update set
      is_below_target = true,
      episode = excluded.episode,
      last_price = excluded.last_price,
      last_retailer = excluded.last_retailer,
      evaluated_at = now();

    select
      a.contact_email,
      n.target_price_email
    into destination, alerts_enabled
    from public.account_private a
    join public.notification_preferences n on n.user_id = a.user_id
    where a.user_id = tracked_product.owner_id
      and a.contact_email_verified_at is not null;

    if destination is not null and alerts_enabled is true then
      insert into public.email_outbox (
        user_id,
        product_id,
        kind,
        recipient,
        payload,
        dedupe_key
      )
      values (
        tracked_product.owner_id,
        tracked_product.id,
        'target_price',
        destination,
        jsonb_build_object(
          'productName', tracked_product.name,
          'targetPrice', tracked_product.target_price,
          'currentPrice', current_offer.price,
          'retailer', current_offer.retailer,
          'url', current_offer.url,
          'episode', next_episode
        ),
        'target:' || tracked_product.id::text || ':' || next_episode::text
      )
      on conflict (dedupe_key) do nothing;
    end if;
  elsif current_offer.price > tracked_product.target_price then
    insert into public.price_alert_states (
      product_id,
      user_id,
      is_below_target,
      episode,
      last_price,
      last_retailer,
      evaluated_at
    )
    values (
      tracked_product.id,
      tracked_product.owner_id,
      false,
      coalesce(alert_state.episode, 0),
      current_offer.price,
      current_offer.retailer,
      now()
    )
    on conflict (product_id) do update set
      is_below_target = false,
      last_price = excluded.last_price,
      last_retailer = excluded.last_retailer,
      evaluated_at = now();
  end if;

  return new;
end;
$$;

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
      l.id,
      ph.created_at
    from public.tracked_links l
    join public.price_history ph on ph.link_id = l.id
    where l.product_id = tracked_product.id
      and l.is_active is true
      and coalesce(l.stock_status, 'unknown') <> 'unavailable'
    order by l.id, ph.created_at desc
  ) latest
  where latest.created_at >= now() - interval '7 days'
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
