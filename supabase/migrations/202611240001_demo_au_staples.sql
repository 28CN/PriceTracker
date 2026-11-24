-- Add everyday Australian pantry and household staples to the read-only demo
-- account ("View example"), so the scheduled GitHub Actions crawl can start
-- recording real prices for the sample list.
--
-- Shops are Coles and Woolworths, which the cloud crawl has recently priced
-- successfully. Kmart, Target, Big W, Toymate, Bunnings and Chemist Warehouse
-- are skipped when CI=true, so they are not used as the only link for a new
-- staple.
--
-- Insert-only for products, links and price_history. Idempotent: safe to
-- re-apply. Existing goal prices are left as they are. No schema changes,
-- no GRANTs, no deletes of price_history.

do $$
declare
  demo_id constant uuid := 'd3300000-0000-4000-8000-00000000de30';
  pantry_id uuid;
  household_id uuid;
  toys_id uuid;
  item jsonb;
  shop jsonb;
  prod_id uuid;
  new_link uuid;
  src_link uuid;
  src_image text;
begin
  if not exists (
    select 1 from public.profiles p
    where p.id = demo_id and p.is_demo
  ) then
    raise notice 'demo account is not present; skipping staple seed';
    return;
  end if;

  select c.id into pantry_id
  from public.categories c
  where c.owner_id = demo_id and c.name = 'Pantry'
  limit 1;
  if pantry_id is null then
    insert into public.categories (name, owner_id, is_public)
    values ('Pantry', demo_id, true)
    returning id into pantry_id;
  end if;

  select c.id into household_id
  from public.categories c
  where c.owner_id = demo_id and c.name = 'Household'
  limit 1;
  if household_id is null then
    insert into public.categories (name, owner_id, is_public)
    values ('Household', demo_id, true)
    returning id into household_id;
  end if;

  select c.id into toys_id
  from public.categories c
  where c.owner_id = demo_id and c.name = 'Toys'
  limit 1;
  if toys_id is null then
    insert into public.categories (name, owner_id, is_public)
    values ('Toys', demo_id, true)
    returning id into toys_id;
  end if;

  -- Tidy a few existing demo names for the public sample, then group them
  -- under Toys. Only the demo account is touched.
  update public.products
  set name = 'Hot Wheels Basic Car'
  where owner_id = demo_id and name = 'Basic Car';

  update public.products
  set name = 'Hot Wheels Super Rigs'
  where owner_id = demo_id and name = 'Super rigs';

  update public.products
  set name = 'LEGO Minifigures Series 29'
  where owner_id = demo_id and name = 'Minifigures S29';

  update public.products
  set name = 'Matchbox Power Grab'
  where owner_id = demo_id and name = '彩盒';

  update public.products
  set category_id = toys_id
  where owner_id = demo_id
    and name in (
      'Hot Wheels Basic Car',
      'Hot Wheels Super Rigs',
      'LEGO Minifigures Series 29',
      'Matchbox Power Grab'
    )
    and category_id is distinct from toys_id;

  delete from public.categories c
  where c.owner_id = demo_id
    and c.name in ('Hotwheels', 'Lego', 'Matchbox')
    and not exists (
      select 1 from public.products p where p.category_id = c.id
    );

  for item in
    select * from jsonb_array_elements($staples$
[
  {
    "name": "Vegemite Spread 380g",
    "group": "Pantry",
    "goal": 6.50,
    "shops": [
      {"retailer": "Woolworths", "url": "https://www.woolworths.com.au/shop/productdetails/796439/vegemite-spread"},
      {"retailer": "Coles", "url": "https://www.coles.com.au/product/vegemite-spread-380g-5998852"}
    ]
  },
  {
    "name": "Arnott's Tim Tam Original 200g",
    "group": "Pantry",
    "goal": 4.00,
    "shops": [
      {"retailer": "Woolworths", "url": "https://www.woolworths.com.au/shop/productdetails/36066/arnott-s-tim-tam-original-chocolate-biscuits"},
      {"retailer": "Coles", "url": "https://www.coles.com.au/product/arnott's-tim-tam-original-chocolate-biscuits-200g-329607"}
    ]
  },
  {
    "name": "Sanitarium Weet-Bix 1.2kg",
    "group": "Pantry",
    "goal": 5.50,
    "shops": [
      {"retailer": "Woolworths", "url": "https://www.woolworths.com.au/shop/productdetails/200695/weet-bix-breakfast-cereal"},
      {"retailer": "Coles", "url": "https://www.coles.com.au/product/sanitarium-weet-bix-cereal-1.2kg-9393015"}
    ]
  },
  {
    "name": "Milo Malt Powder 1kg",
    "group": "Pantry",
    "goal": 11.00,
    "shops": [
      {"retailer": "Woolworths", "url": "https://www.woolworths.com.au/shop/productdetails/192985/milo-malt-drinking-chocolate-powder-hot-or-cold"},
      {"retailer": "Coles", "url": "https://www.coles.com.au/product/milo-chocolate-malt-powder-hot-or-cold-drink-1kg-3854396"}
    ]
  },
  {
    "name": "Arnott's Shapes Chicken Crimpy 175g",
    "group": "Pantry",
    "goal": 2.50,
    "shops": [
      {"retailer": "Woolworths", "url": "https://www.woolworths.com.au/shop/productdetails/384245/arnott-s-shapes-chicken-crimpy-cracker-biscuits"}
    ]
  },
  {
    "name": "Arnott's Lemon Crisp 250g",
    "group": "Pantry",
    "goal": 2.00,
    "shops": [
      {"retailer": "Woolworths", "url": "https://www.woolworths.com.au/shop/productdetails/36029/arnott-s-lemon-crisp-cream-biscuits"},
      {"retailer": "Coles", "url": "https://www.coles.com.au/product/arnott's-lemon-crisp-cream-biscuits-250g-329414"}
    ]
  },
  {
    "name": "Pic's Peanut Butter Crunchy 380g",
    "group": "Pantry",
    "goal": 4.00,
    "shops": [
      {"retailer": "Woolworths", "url": "https://www.woolworths.com.au/shop/productdetails/360257/pic-s-peanut-butter-crunchy"},
      {"retailer": "Coles", "url": "https://www.coles.com.au/product/pic's-peanut-butter-crunchy-380g-2120207"}
    ]
  },
  {
    "name": "Heinz Baked Beans 420g",
    "group": "Pantry",
    "goal": 1.80,
    "shops": [
      {"retailer": "Woolworths", "url": "https://www.woolworths.com.au/shop/productdetails/6085967/heinz-baked-beans"}
    ]
  },
  {
    "name": "L'OR Espresso Ristretto Pods 10 pack",
    "group": "Pantry",
    "goal": 4.00,
    "shops": [
      {"retailer": "Woolworths", "url": "https://www.woolworths.com.au/shop/productdetails/603799/l-or-espresso-ristretto-coffee-pods-nespresso-compatible"}
    ]
  },
  {
    "name": "Dairy Farmers Full Cream Milk 2L",
    "group": "Pantry",
    "goal": 3.50,
    "shops": [
      {"retailer": "Woolworths", "url": "https://www.woolworths.com.au/shop/productdetails/88436/dairy-farmers-full-cream-milk-full-cream-milk"}
    ]
  },
  {
    "name": "Tip Top The One White Sandwich 700g",
    "group": "Pantry",
    "goal": 3.50,
    "shops": [
      {"retailer": "Woolworths", "url": "https://www.woolworths.com.au/shop/productdetails/713816/tip-top-the-one-white-sandwich-slice-bread-loaf-bakery"}
    ]
  },
  {
    "name": "Western Star Salted Butter 250g",
    "group": "Pantry",
    "goal": 4.50,
    "shops": [
      {"retailer": "Woolworths", "url": "https://www.woolworths.com.au/shop/productdetails/48025/western-star-salted-butter-block-butter-block"}
    ]
  },
  {
    "name": "Bulla Creamy Classics Vanilla & Boysenberry 2L",
    "group": "Pantry",
    "goal": 6.00,
    "shops": [
      {"retailer": "Woolworths", "url": "https://www.woolworths.com.au/shop/productdetails/574618/bulla-creamy-classics-ice-cream-vanilla-boysenberry"},
      {"retailer": "Coles", "url": "https://www.coles.com.au/product/bulla-creamy-classics-vanilla-and-boysenberry-ice-cream-tub-2l-2858336"}
    ]
  },
  {
    "name": "Australian Botanical Soap Sea Salt 200g",
    "group": "Household",
    "goal": 2.40,
    "shops": [
      {"retailer": "Woolworths", "url": "https://www.woolworths.com.au/shop/productdetails/694601/australian-botanical-soap-sea-salt"},
      {"retailer": "Coles", "url": "https://www.coles.com.au/product/australian-botanical-soap-sea-salt-200g-5283092"}
    ]
  },
  {
    "name": "Kleenex Complete Clean Toilet Paper 12 pack",
    "group": "Household",
    "goal": 9.00,
    "shops": [
      {"retailer": "Woolworths", "url": "https://www.woolworths.com.au/shop/productdetails/722/kleenex-complete-clean-double-length-toilet-paper"},
      {"retailer": "Coles", "url": "https://www.coles.com.au/product/kleenex-complete-clean-double-length-toilet-paper-12-pack-3517115"}
    ]
  },
  {
    "name": "OMO Ultimate Laundry Powder 2kg",
    "group": "Household",
    "goal": 15.00,
    "shops": [
      {"retailer": "Woolworths", "url": "https://www.woolworths.com.au/shop/productdetails/208058/omo-ultimate-laundry-detergent-powder"}
    ]
  },
  {
    "name": "Morning Fresh Dishwashing Liquid 900mL",
    "group": "Household",
    "goal": 6.00,
    "shops": [
      {"retailer": "Woolworths", "url": "https://www.woolworths.com.au/shop/productdetails/208112/morning-fresh-dishwashing-liquid-original-original-super-strength"}
    ]
  },
  {
    "name": "Huggies Ultra Dry Nappies Boys Size 4 36 pack",
    "group": "Household",
    "goal": 18.00,
    "shops": [
      {"retailer": "Woolworths", "url": "https://www.woolworths.com.au/shop/productdetails/16614/huggies-ultra-dry-nappies-boys-size-4-10-15kg"},
      {"retailer": "Coles", "url": "https://www.coles.com.au/product/huggies-ultra-dry-nappies-boys-size-4-(10-15kg)-36-pack-6803890"}
    ]
  },
  {
    "name": "Energizer Max AA Batteries 16 pack",
    "group": "Household",
    "goal": 20.00,
    "shops": [
      {"retailer": "Woolworths", "url": "https://www.woolworths.com.au/shop/productdetails/23597/energizer-max-aa-alkaline-batteries"}
    ]
  }
]
$staples$::jsonb)
  loop
    select p.id, p.image_url
    into prod_id, src_image
    from public.products p
    where p.owner_id = demo_id and p.name = item->>'name'
    limit 1;

    if prod_id is null then
      insert into public.products (name, target_price, owner_id, category_id)
      values (
        item->>'name',
        (item->>'goal')::numeric(10,2),
        demo_id,
        case item->>'group'
          when 'Household' then household_id
          else pantry_id
        end
      )
      returning id into prod_id;
    end if;

    for shop in select * from jsonb_array_elements(item->'shops')
    loop
      select tl.id into new_link
      from public.tracked_links tl
      where tl.product_id = prod_id and tl.url = shop->>'url'
      limit 1;

      if new_link is null then
        insert into public.tracked_links (product_id, url, retailer, is_active)
        values (prod_id, shop->>'url', shop->>'retailer', true)
        returning id into new_link;

        select tl.id into src_link
        from public.tracked_links tl
        join public.products p on p.id = tl.product_id
        join public.profiles pr on pr.id = p.owner_id
        where tl.url = shop->>'url'
          and p.owner_id is distinct from demo_id
          and pr.watchlist_visibility = 'public'
          and not pr.is_demo
        order by (
          select count(*) from public.price_history h where h.link_id = tl.id
        ) desc
        limit 1;

        if src_link is not null then
          insert into public.price_history (link_id, price, created_at)
          select new_link, h.price, h.created_at
          from public.price_history h
          where h.link_id = src_link
            and not exists (
              select 1 from public.price_history x where x.link_id = new_link
            );

          update public.tracked_links dest
          set image_url = src.image_url,
              image_candidates = src.image_candidates
          from public.tracked_links src
          where dest.id = new_link
            and src.id = src_link
            and dest.image_url is null
            and src.image_url is not null;
        end if;
      end if;
    end loop;

    -- If a public list already has a picture for the same product name, use it.
    if (select p.image_url from public.products p where p.id = prod_id) is null then
      update public.products dest
      set image_url = src.image_url
      from public.products src
      join public.profiles pr on pr.id = src.owner_id
      where dest.id = prod_id
        and src.owner_id is distinct from demo_id
        and src.name = dest.name
        and src.image_url is not null
        and pr.watchlist_visibility = 'public'
        and not pr.is_demo;
    end if;
  end loop;
end;
$$;
