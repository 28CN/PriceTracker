# Adding a product straight from a shop

Every way in ends at the same page: `/add?url=…&title=…&text=…`. You must be
signed in. If you are not, the sign-in page sends you back to `/add` afterwards.

`/add` cleans the link (`cleanHttpUrl`), fills in the name from the page title,
and refuses pages that list many products (search, specials, categories) with a
short note. A link already on your list shows "Show it" instead of the form.

There is no browser extension. A shop page cannot hand data to another site by
itself, so each way below only opens `/add` with the page's address.

## On a computer: the bookmark button

1. Open **Manage → Add**, or `/add`.
2. Drag **Add to PriceTracker** to the bookmarks bar.
3. On a product page, click the bookmark.

The bookmark is `javascript:` code that sets `location.href` to
`/add?url=<page link>&title=<page title>`. It reads nothing else and sends
nothing anywhere. See `bookmarkletFor` in `src/lib/addTools.ts`.

On the add form you can also paste a link anywhere, or drag one from another
tab and drop it on the form.

## On Android: Share

1. In Chrome, open the site, then **⋮ → Add to home screen → Install**.
2. In a shop's app or in Chrome, tap **Share → PriceTracker**.

The web app manifest (`src/app/manifest.ts`) has a GET `share_target` pointing
at `/add`. Android puts the link in `text`, not `url`, so `/add` picks the first
link out of `text`. Share only appears after the site is installed.

## On iPhone and iPad: a Shortcut

Safari does not support `share_target`, so use the Shortcuts app once:

1. Open **Shortcuts**, tap **+**, and name it **Add to PriceTracker**.
2. Tap **ⓘ**, turn on **Show in Share Sheet**, and set it to receive **URLs**.
3. Add the action **URL Encode** with **Shortcut Input**.
4. Add **Open URLs** with `https://pricetracker-au.vercel.app/add?url=` and
   then the **URL Encoded Text** variable.
5. On a product page in Safari, tap **Share → Add to PriceTracker**.

## This week's specials

The add page shows a row of links to each shop's sale pages: Coles on special,
Woolworths half price, Kmart catalogue, Big W deals, Target deals and the
Chemist Warehouse catalogue. They live in `SPECIALS_LINKS`
(`src/lib/addTools.ts`). Each one returned 200 in a real browser on 24 Nov 2026.
Shops move these pages, so check them again if one stops opening.
