select p.oid::regprocedure::text
  || ' | ' || (case when p.prosecdef then 'definer' else 'invoker' end)
  || ' | anon=' || has_function_privilege('anon', p.oid, 'execute')
  || ' | authenticated=' || has_function_privilege('authenticated', p.oid, 'execute')
  || ' | service_role=' || has_function_privilege('service_role', p.oid, 'execute') as l
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.prokind = 'f'
  and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
