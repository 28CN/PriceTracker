select tablename || ' | ' || policyname || ' | ' || cmd || ' | ' || permissive
  || ' | ' || array_to_string(array(select unnest(roles) order by 1), ',')
  || ' | ' || coalesce(regexp_replace(qual, '\s+', ' ', 'g'), '-')
  || ' | ' || coalesce(regexp_replace(with_check, '\s+', ' ', 'g'), '-') as l
from pg_policies
where schemaname = 'public'
