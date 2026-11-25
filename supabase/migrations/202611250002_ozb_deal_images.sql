-- Deal thumbnails: the image URL only (never the image itself), taken from the
-- OzBargain feed or, when missing, the deal page's og:image. Only OzBargain's
-- own image host is allowed, so the page never loads images from elsewhere.
alter table public.ozb_deals
  add column if not exists image_url text;

alter table public.ozb_deals
  drop constraint if exists ozb_deals_image_url_host;
alter table public.ozb_deals
  add constraint ozb_deals_image_url_host check (
    image_url is null
    or (length(image_url) <= 400 and image_url ~ '^https://files\.ozbargain\.com\.au/[A-Za-z0-9/._?=&%-]+$')
  );

-- Grants are table-level (202611250001): anon/authenticated SELECT only,
-- service_role writes. Re-stated so this migration stands on its own.
revoke all on public.ozb_deals from public, anon, authenticated;
grant select on public.ozb_deals to anon, authenticated;
