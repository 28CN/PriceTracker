# Legacy preview archive

Status: archived concept, not part of the current main-site roadmap  
Source reviewed: `cursor/beta-shopping-search-18bf` and `feat/beta-lists-search`

## Original idea

The preview explored turning one tracker into two independent shopping lists on
the same deployment, while adding a search-first workflow for discovering shop
products before tracking them. It lived under `/beta` and intentionally left the
main site untouched.

## What was implemented

- A `/beta` chooser for two list types, with the last-used list remembered locally.
- Separate list routes, navigation tabs and management pages.
- A list-specific shop search page and `/api/search` endpoint.
- Search adapters and browser/Google fallbacks for several Australian retailers.
- Adding a search result to a chosen list and category.
- `list_kind` and `image_url` database fields and list-aware product queries.
- Product search cards with retailer details, imagery and result states.
- Supporting crawler and retailer changes needed by the experiment.

## What remained incomplete or unsuitable for main

- Retailer search reliability varied because several shops block cloud requests.
- Search adapters substantially increased maintenance and duplicated crawler logic.
- The list split required a database migration and touched existing product APIs.
- Search result quality, deduplication and exact-product matching needed more work.
- The preview had no mature authentication or ownership model for multiple lists.
- The experimental routes and UI diverged from the simpler main-site workflow.

## Ideas worth revisiting later

1. Optional named lists backed by a general list model rather than two hard-coded
   list kinds.
2. A search-to-track flow for retailers with stable public APIs or structured data.
3. Recently used list memory and quick switching.
4. Product image capture during creation.
5. Shared search/crawler adapters with confidence scoring and deduplication.

## Conditions before revival

- Define whether lists represent people, occasions or arbitrary collections.
- Add authentication/ownership before supporting multiple users.
- Decide which retailers can be supported reliably from the deployment region.
- Design a migration path that does not disturb current products.
- Rebuild the experience using `VISUAL-DESIGN-SYSTEM.md`.

Until those decisions are made, visual and functional work should target the main
`/` and `/manage` experience only.
