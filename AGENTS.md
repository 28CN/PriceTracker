# Agent guide for PriceTracker

Read this before changing anything. Then read `README.md`, `docs/DESIGN.md`,
`docs/PERFORMANCE.md`, `docs/ARCHITECTURE.md` and `docs/TESTING.md`.
New to the project? Start with `docs/AGENT-HANDOFF.md`: history, where things
run, open items and what to ask the owner for.

## Project

- Next.js 15 (App Router) + Supabase (Postgres, Auth, RLS) + Vercel. Functions are
  pinned to `hnd1` (Tokyo), next to the database.
- A portfolio project that HR and engineers will read. Practical, with restrained
  novelty. Not showy. Solid engineering with written-down decisions.

## Copy and UI

- Minimal copy: let layout and hierarchy show what things do. Use the `InfoTip`
  component instead of helper text. Keep form labels, accessible names and
  warnings for destructive actions.
- Everyday words a 70-year-old shopper understands. No emoji decoration.
- The user's wished-for price is called **Goal**, never "Target" (Target is a shop).
  Show it once per card.
- Never hide a stale price behind a click. Show it muted with `Last seen <date>`.
- Theme colours only through the variables in `src/app/globals.css`
  (light accent `#6677a8`, dark accent `#e3a45d`). No hard-coded colours in components.
- Charts: outer `.pc-plot`, inner `.pc-canvas` with `aspect-ratio: 560/160`.
  Never use `preserveAspectRatio="none"`.
- Animations are light, quick and elegant, and respect `prefers-reduced-motion`.
- Check every screen at 390px and at desktop width, in light and dark themes.

## Code

- TypeScript strict. Keep pure logic in `src/lib/*.ts` with Vitest tests beside it.
- Do not run Prettier on whole files. Match the existing style (single quotes).
- Before finishing: `npx tsc --noEmit`, `npm run lint`, `npm test` must all pass.

## Database

- Never delete or truncate rows in `price_history`.
- Schema changes only as new files in `supabase/migrations/` with explicit
  `GRANT`s, RLS respected, `security invoker` functions/views and
  `set search_path = ''`. Update `supabase/snapshot/*` and add pgTAP tests in
  `supabase/tests/` when you add a migration.
- Never apply migrations to production from an agent session.

## Git

- One pull request, 3 to 4 short human-style commits.
- Identity: user.name `Ruoilin Li`, user.email `noreply@users.noreply.github.com`.
- No rebase, no force-push, no history rewriting.

## Docs

- English. Never invent numbers: only report measurements you actually took,
  and say how you took them.
