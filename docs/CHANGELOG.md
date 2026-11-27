# Changelog

One line per change, newest first: date, who, what (PR or commit).
Who is `owner`, `agy` (Antigravity), or `agent`. Details live in the commit/PR.

- 2026-11-27 · agent+agy · Eat page (/eat): WA and national fast-food deals from OzBargain grouped for everyone / WA only / in the app, this week's regular deals with tomorrow highlighted, and nearest stores within 5 km with a map (#63).
- 2026-11-27 · agent · Fast-food deal feeds for the coming Eat page: 13 chain feeds and the fast-food tag from OzBargain on their own slower clock, same 2-second gaps and conditional GET (#62).
- 2026-11-26 · agent+agy · Price watch page (/watch): buy now (real sales, lowest ever), wait for a sale (sale rhythm and next date), up/down this week, back in stock, not a real sale, all items with lowest ever; linked from This week (#61).
- 2026-11-26 · agent · Opening Deals refreshes OzBargain once the last fetch is 30+ min old (was 55) (#60).
- 2026-11-26 · agent · Hourly scheduler in the database (pg_cron) starts the deals fetch and the Monday/Thursday price crawl; GitHub crons are now late fallbacks that skip when already done (#59).
- 2026-11-26 · agent · New for you skips old deals that were only just fetched (#58).
- 2026-11-26 · agy · Compare: Plan my trip view, what to buy at each shop in the group, with stop subtotals and an all-at-one-shop comparison (#57).
- 2026-11-26 · agent · Deals for you: new-for-you count on the Deals tab and a dashboard card; tap a brand tag to follow or mute it; Ends soon and Most saved; price sparkline on deals for items you track (#56).
- 2026-11-26 · agy · Fewer words, more pictures on logged-in pages: Goal and checked icons, shop-logo gap chips and placeholders, category and section icons (#55).
- 2026-11-26 · agent · Compare by shop group (supermarkets, variety, toys, auto, pharmacy): usually-cheapest shop, items cheaper elsewhere, thumbnails and logos (#54).
- 2026-11-26 · agent · Deals: On my list also catches brands and shows you track (a tag shows why); OzBargain refresh hourly while people look, about every 3 hours otherwise, with conditional GET; "Updated 12 min ago" (#53).
- 2026-11-25 · agent · About is now a how-to Guide; the case study moved to /about/built; new /install page with an Install button (#52).
- 2026-11-25 · agent · Kangaroo hops in from off the shelf; Deals shop names link to shop sites; thumbnail placeholder fix (#51).
- 2026-11-25 · agent · Home shortcut cards (Deals, Compare, Add, About); this changelog and `docs/WORKING-WITH-ANTIGRAVITY.md` (#50).
- 2026-11-25 · agent · Deals: product thumbnails, was vs now and % saved, 3-column grid on desktop (#49).
- 2026-11-25 · agent · Deals page from OzBargain shop feeds (#48).
- 2026-11-25 · agent · Compare shops: Coles vs Woolworths with unit prices (#47).
- 2026-11-25 · agent · Main navigation and a public About page (#46).
