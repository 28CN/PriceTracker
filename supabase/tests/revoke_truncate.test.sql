-- anon/authenticated hold no TRUNCATE/REFERENCES/TRIGGER on public relations,
-- and default ACLs in public do not grant them. Rolled back.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(3);

select is(
  (select count(*)::int from pg_class c join pg_namespace n on n.oid = c.relnamespace
   cross join (values ('anon'), ('authenticated')) r(role)
   cross join (values ('TRUNCATE'), ('REFERENCES'), ('TRIGGER')) p(priv)
   where n.nspname = 'public' and c.relkind in ('r','p','v','m','f')
     and has_table_privilege(r.role, c.oid, p.priv)),
  0, 'anon/authenticated have no TRUNCATE/REFERENCES/TRIGGER on public relations');

select ok(
  (select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind = 'r') > 0, 'public has tables to check');

select is(
  (select count(*)::int from pg_default_acl d
   join pg_namespace n on n.oid = d.defaclnamespace
   cross join lateral aclexplode(d.defaclacl) a
   where n.nspname = 'public' and d.defaclobjtype = 'r'
     and a.grantee in ('anon'::regrole::oid, 'authenticated'::regrole::oid)
     and a.privilege_type in ('TRUNCATE','REFERENCES','TRIGGER')),
  0, 'public default ACLs grant no TRUNCATE/REFERENCES/TRIGGER to anon/authenticated');

select * from finish();
rollback;
