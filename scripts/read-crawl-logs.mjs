import { createClient } from '@supabase/supabase-js';

// Prints recent crawler notices from public.crawl_events.
//   npm run logs
//   npm run logs -- 200

const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const limit = Math.min(200, Math.max(1, Number(process.argv[2] || 80) || 80));

if (!url || !key) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local.');
  process.exit(1);
}

const supabase = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false }
});

const column = await supabase.from('tracked_links').select('stock_status').limit(1);
if (column.error) {
  console.log(`stock_status column: MISSING (${column.error.message})`);
} else {
  console.log('stock_status column: present');
}

const { data, error } = await supabase
  .from('crawl_events')
  .select('created_at, level, message')
  .order('created_at', { ascending: false })
  .limit(limit);

if (error) {
  console.error(error.message);
  process.exit(1);
}

const rows = data || [];
console.log(`events: ${rows.length}`);
for (const row of rows) {
  const when = String(row.created_at || '').replace('T', ' ').slice(0, 19);
  const message = String(row.message || '').replace(/\s+/g, ' ').trim();
  console.log(`[${when}] ${row.level}: ${message}`);
}
