# PriceTracker visual design system

Status: active source of truth  
Last updated: 2026-10-14

## 1. Product character

PriceTracker should feel calm, dependable and quietly premium: the clarity of
Linear with the material restraint of Apple. It is a utility first, so decoration
must support scanning prices and status rather than compete with them.

Principles:

- Calm over loud: cool neutrals, muted sage and blue, no neon gradients.
- Layered over flat: translucent surfaces, hairline borders and soft shadows.
- Useful motion only: motion explains hierarchy, state and spatial change.
- Data first: product, current price and retailer remain the strongest hierarchy.
- Familiar controls: every action has a Lucide icon and a readable label or tooltip.

## 2. Colour tokens

Use semantic CSS variables rather than literal colours inside components.

| Token | Light role | Dark role |
| --- | --- | --- |
| `--canvas` | cool off-white page | deep blue-charcoal |
| `--surface` | translucent white | translucent slate |
| `--surface-strong` | opaque raised surface | opaque raised slate |
| `--text` | near-black blue | soft white |
| `--muted` | slate grey | blue-grey |
| `--line` | low-contrast blue-grey | translucent white |
| `--brand` | desaturated indigo | soft periwinkle |
| `--success` | muted emerald | mint |
| `--warning` | muted amber | sand |
| `--danger` | muted rose | coral |

Category colours may use sage, sky, lilac, sand, rose and teal, but only as a
6–12% tint. Body copy must meet WCAG AA contrast. Price and state must never rely
on colour alone.

## 3. Typography

- Primary: Figtree, with system sans-serif fallback.
- Display: 32–48 px, 700–760 weight, tight tracking.
- Page title: 24–32 px, 700 weight.
- Card title: 15–17 px, 650–700 weight.
- Body: 14–15 px, 1.5 line height.
- Meta and labels: 11–13 px, 600 weight where useful.
- Use tabular numerals for all prices and counts.

## 4. Spacing and layout

Use a 4 px base grid. Preferred gaps: 8, 12, 16, 24 and 32 px.

- Main content width: 1180 px.
- Page gutters: 16 px mobile, 24 px tablet, 32 px desktop.
- Cards: 16–20 px inner padding.
- Radius: 14 px controls, 18–22 px cards, full radius for pills.
- Desktop may use two columns; mobile always preserves one clear reading column.

## 5. Surfaces

Glass surfaces use translucent colour plus `backdrop-filter: blur(18px)`. Always
include an opaque fallback colour and a subtle border.

Default card shadow:

`0 1px 2px rgba(15, 23, 42, .04), 0 12px 35px rgba(15, 23, 42, .07)`

Hovered card shadow:

`0 18px 45px rgba(15, 23, 42, .12)`

Avoid strong black shadows, thick borders and nested glass on every child.

## 6. Imagery and illustration

- Real product images remain the first choice because they identify tracked items.
- If a product has no image, show a curated Unsplash photograph selected from its
  category theme. Use fixed `images.unsplash.com` URLs, not random endpoints, so
  cards do not visually change between loads.
- Photographs use a gentle overlay and `object-fit: cover`; retailer/product assets
  that need legibility use `object-fit: contain` on a light pad.
- Background decoration and empty states use original inline SVG geometry. SVGs
  are decorative (`aria-hidden`) unless they communicate state.
- Page ambience uses broad translucent glows and flowing curves. Avoid fine dot
  grids, isolated grey specks and small floating blocks, especially on mobile,
  because they can resemble screen dirt or rendering artefacts.
- Never leave a large empty panel with text alone.

## 7. Iconography

Use `lucide-react` only. Standard sizes:

- 16 px inline and compact controls
- 18 px standard buttons and navigation
- 20–22 px icon-only controls
- 24–32 px feature or empty-state illustrations

Icons use a 1.8–2 px stroke. Icon-only buttons require `aria-label` and `title`.

## 8. Motion

Use Framer Motion for orchestrated mounting and expanding; use CSS transitions for
simple hover, focus and press feedback.

- List entrance: 280–420 ms fade + 10–16 px rise, stagger 45–65 ms.
- Card hover: translateY(-3 px), optional scale up to 1.008.
- Button press: scale(0.97).
- Panels: 180–240 ms fade + 6 px rise.
- Skeleton shimmer: 1.6 s, low contrast.
- Respect `prefers-reduced-motion`; remove transforms and nonessential animation.
- Do not animate live price changes in a way that delays reading.

## 9. Core component rules

- Top bar: sticky glass surface, logo, labelled navigation, theme toggle,
  notifications and refresh.
- Page hero: compact summary, one primary action and subdued inline SVG ambience.
- Category panel: tinted glass, category icon, count and deal status, clear expand
  affordance.
- Product card: image, name, target state, strongest current price and shop, with
  detail rows revealed progressively.
- Forms: grouped fields, persistent labels, icon-led actions and visible focus ring.
- Empty state: useful next action plus custom SVG illustration.
- Loading: page/card-shaped skeletons rather than a centered spinner.

## 10. Theme and accessibility

The theme control cycles light/dark and persists the explicit choice. When no
choice exists, follow the operating system. Set `color-scheme` to keep native
controls consistent.

All interactive elements need keyboard focus, at least a 40 px target where space
allows, and visible hover/focus/disabled states. Decorative images use empty alt
text; meaningful product images use the product name. Keep HTML semantic and do
not replace buttons or headings with generic elements.

## 11. Change protocol

All future visual work must:

1. Reuse or deliberately extend these tokens and rules.
2. Update this document when a new aesthetic decision is agreed.
3. Verify both themes, mobile width, desktop width and reduced motion.
4. Avoid changing data behaviour merely to achieve a visual effect.

## 12. Rendering resilience

Development and production builds use separate Next.js output directories so a
production build cannot invalidate an active local preview. A minimal inline
critical stylesheet must always constrain page width, decorative SVGs and product
images; if the main CSS asset fails, the page should remain readable and images
must never expand to their natural dimensions.
