-- Hotfix: INSERT ... RETURNING on products failed for normal users because the
-- only SELECT policy is can_view_product(id), a STABLE security definer
-- function whose snapshot cannot see the row being inserted. Add a direct
-- owner-read policy (authenticated only; anon unchanged). No data changes.
-- Independent of 202610290012 (grants); works whichever merges first.
drop policy if exists "users read own products" on public.products;
create policy "users read own products" on public.products
  for select to authenticated
  using (owner_id = (select auth.uid()));
