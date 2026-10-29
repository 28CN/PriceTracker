-- Drop the hand-made legacy RLS policies that predate accounts. They grant
-- every role (including anon) unrestricted read of products / tracked_links /
-- price_history and unrestricted insert into products / tracked_links, which
-- silently overrides the owner-aware policies from 202610150001.
--
-- Public share pages stay covered by the existing narrow policies (role
-- anon, authenticated): "users read visible products|tracked links|price
-- history" -> can_view_product() = owner, or public watchlist and the product's
-- category is public. The crawler and admin routes use the service-role key,
-- which bypasses RLS.
--
-- Policy changes only: no table, column or data changes.

drop policy if exists "Allow public insert" on public.products;
drop policy if exists "Allow public read" on public.products;
drop policy if exists "Allow public insert" on public.tracked_links;
drop policy if exists "Allow public read" on public.tracked_links;
drop policy if exists "Allow public read" on public.price_history;
