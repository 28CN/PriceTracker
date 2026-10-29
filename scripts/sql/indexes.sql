select tablename || ' | ' || indexname || ' | ' || indexdef as l
from pg_indexes
where schemaname = 'public'
