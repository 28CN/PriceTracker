-- The demo sample list includes everyday Australian staples with Coles or
-- Woolworths links the cloud crawl can reach. Rolled back.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(6);

select ok(
  exists (
    select 1 from public.profiles
    where id = 'd3300000-0000-4000-8000-00000000de30' and is_demo
  ),
  'demo profile exists and is flagged is_demo'
);

select is(
  (
    select count(*)::int from public.products
    where owner_id = 'd3300000-0000-4000-8000-00000000de30'
      and name in (
        'Vegemite Spread 380g',
        'Arnott''s Tim Tam Original 200g',
        'Sanitarium Weet-Bix 1.2kg',
        'Milo Malt Powder 1kg',
        'Arnott''s Shapes Chicken Crimpy 175g',
        'Arnott''s Lemon Crisp 250g',
        'Pic''s Peanut Butter Crunchy 380g',
        'Heinz Baked Beans 420g',
        'L''OR Espresso Ristretto Pods 10 pack',
        'Dairy Farmers Full Cream Milk 2L',
        'Tip Top The One White Sandwich 700g',
        'Western Star Salted Butter 250g',
        'Bulla Creamy Classics Vanilla & Boysenberry 2L',
        'Australian Botanical Soap Sea Salt 200g',
        'Kleenex Complete Clean Toilet Paper 12 pack',
        'OMO Ultimate Laundry Powder 2kg',
        'Morning Fresh Dishwashing Liquid 900mL',
        'Huggies Ultra Dry Nappies Boys Size 4 36 pack',
        'Energizer Max AA Batteries 16 pack'
      )
  ),
  19,
  'demo account has the 19 Australian staple products'
);

select ok(
  (
    select bool_and(has_shop)
    from (
      select exists (
        select 1
        from public.tracked_links tl
        where tl.product_id = p.id
          and tl.is_active
          and (
            tl.url like 'https://www.woolworths.com.au/%'
            or tl.url like 'https://www.coles.com.au/product/%'
          )
      ) as has_shop
      from public.products p
      where p.owner_id = 'd3300000-0000-4000-8000-00000000de30'
        and p.name in (
          'Vegemite Spread 380g',
          'Arnott''s Tim Tam Original 200g',
          'Sanitarium Weet-Bix 1.2kg',
          'Milo Malt Powder 1kg',
          'Arnott''s Shapes Chicken Crimpy 175g',
          'Arnott''s Lemon Crisp 250g',
          'Pic''s Peanut Butter Crunchy 380g',
          'Heinz Baked Beans 420g',
          'L''OR Espresso Ristretto Pods 10 pack',
          'Dairy Farmers Full Cream Milk 2L',
          'Tip Top The One White Sandwich 700g',
          'Western Star Salted Butter 250g',
          'Bulla Creamy Classics Vanilla & Boysenberry 2L',
          'Australian Botanical Soap Sea Salt 200g',
          'Kleenex Complete Clean Toilet Paper 12 pack',
          'OMO Ultimate Laundry Powder 2kg',
          'Morning Fresh Dishwashing Liquid 900mL',
          'Huggies Ultra Dry Nappies Boys Size 4 36 pack',
          'Energizer Max AA Batteries 16 pack'
        )
    ) q
  ),
  'every staple has an active Coles or Woolworths link'
);

select ok(
  exists (
    select 1 from public.categories
    where owner_id = 'd3300000-0000-4000-8000-00000000de30' and name = 'Pantry'
  )
  and exists (
    select 1 from public.categories
    where owner_id = 'd3300000-0000-4000-8000-00000000de30' and name = 'Household'
  )
  and exists (
    select 1 from public.categories
    where owner_id = 'd3300000-0000-4000-8000-00000000de30' and name = 'Toys'
  ),
  'demo list is grouped as Pantry, Household and Toys'
);

select is(
  (
    select count(*)::int from public.categories
    where owner_id = 'd3300000-0000-4000-8000-00000000de30'
      and name in ('Hotwheels', 'Lego', 'Matchbox')
  ),
  0,
  'old demo toy category names are not left empty'
);

select is(
  (
    select count(*)::int
    from public.products p
    join public.categories c on c.id = p.category_id
    where p.owner_id = 'd3300000-0000-4000-8000-00000000de30'
      and c.name = 'Pantry'
      and p.name in (
        'Vegemite Spread 380g',
        'Arnott''s Tim Tam Original 200g',
        'Sanitarium Weet-Bix 1.2kg',
        'Milo Malt Powder 1kg',
        'Arnott''s Shapes Chicken Crimpy 175g',
        'Arnott''s Lemon Crisp 250g',
        'Pic''s Peanut Butter Crunchy 380g',
        'Heinz Baked Beans 420g',
        'L''OR Espresso Ristretto Pods 10 pack',
        'Dairy Farmers Full Cream Milk 2L',
        'Tip Top The One White Sandwich 700g',
        'Western Star Salted Butter 250g',
        'Bulla Creamy Classics Vanilla & Boysenberry 2L'
      )
  ),
  13,
  'food staples are in the Pantry group'
);

select * from finish();
rollback;
