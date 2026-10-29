# Database schema

`supabase/migrations/` is the only source of truth for the database schema.
The old hand-run `supabase/schema.sql` was removed; everything it contained is in
`202610010001_baseline_legacy_tables.sql` (plus the later migrations).

## Rules

- Change the schema only by adding a new migration file. Never edit the schema by
  hand in the Supabase dashboard.
- Every migration must be idempotent (`if not exists`, `create or replace`,
  `drop policy if exists` ...). Production was historically patched by hand, so a
  migration may run against a database that already has part of it.
- Never drop or truncate price data (`price_history`).
- When a migration adds/changes/removes a column, update
  `supabase/snapshot/columns.csv` in the same PR.

## Fresh database

```bash
supabase db start          # local Postgres, applies supabase/migrations/ in order
./scripts/check-schema-drift.sh
```

## CI drift check (`schema-drift` job in `.github/workflows/ci.yml`)

1. `supabase db start` builds a throwaway database from migrations only.
2. `scripts/check-schema-drift.sh` re-applies every migration (idempotency) and
   diffs public columns, RLS policies and indexes with `supabase/snapshot/`
   (`columns.csv`, `policies.txt`, `indexes.txt`; queries in `scripts/sql/`).
3. `supabase db lint` checks database functions; a `pg_dump` is uploaded as an artifact.

No production secrets are used. To refresh the snapshot from the live project, run
this read-only query in the SQL editor and save the result as `columns.csv`:

```sql
select c.table_name||','||c.column_name||','||c.data_type||','||c.is_nullable
from information_schema.columns c
join information_schema.tables t using (table_schema, table_name)
where c.table_schema = 'public' and t.table_type = 'BASE TABLE'
order by 1;
```

## Before pushing to production (baseline migration)

`202610010001_baseline_legacy_tables.sql` is dated *before* migrations that were
already applied to production by hand, and production's migration history does not
contain it. Its statements are no-ops there, but `supabase db push` would refuse because it is
older than the last applied migration. Mark it applied first (records history only,
runs no SQL):

```bash
supabase migration repair --status applied 202610010001
```

Production's history currently lists only `20261022155804` (the SQL Editor version of
`202610220001`); the other files were also run by hand. Run `supabase migration list`
first; if they are missing too, record them the same way:

```bash
supabase migration repair --status applied 202610150001 202610150002 202610170001 202610170002 202610220001
supabase migration repair --status reverted 20261022155804   # remote-only duplicate
```

Do **NOT** use `supabase db push --include-all`: it would re-run the baseline and the
other hand-applied migrations against production.

## Snapshot = intended state

The snapshots describe what the migrations build, not necessarily production.
Known difference (2026-10-29): production still has five legacy policies created
by hand — "Allow public insert" on `products`/`tracked_links` and "Allow public
read" on `products`/`tracked_links`/`price_history`. They are not in any migration
or snapshot; PR2.1 drops them.
