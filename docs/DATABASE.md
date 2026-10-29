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
   diffs the public tables/columns with `supabase/snapshot/columns.csv`, a snapshot
   of the live project.
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
