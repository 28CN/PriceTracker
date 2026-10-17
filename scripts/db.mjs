import { readFileSync } from 'node:fs';
import { Client } from 'pg';

// Local SQL runner for this Supabase database.
//   node scripts/db.mjs "select now()"
//   node scripts/db.mjs --file supabase/migrations/some.sql
// Reads SUPABASE_DB_URL from the environment or from .env.local.
// Refuses DROP DATABASE, DROP SCHEMA, DROP OWNED, ALTER DATABASE, and TRUNCATE.

const BANNED = [
  { pattern: /\bdrop\s+database\b/i, reason: 'DROP DATABASE' },
  { pattern: /\bdrop\s+schema\b/i, reason: 'DROP SCHEMA' },
  { pattern: /\bdrop\s+owned\b/i, reason: 'DROP OWNED' },
  { pattern: /\balter\s+database\b/i, reason: 'ALTER DATABASE' },
  { pattern: /\btruncate\b/i, reason: 'TRUNCATE' }
];

function loadDatabaseUrl() {
  if (process.env.SUPABASE_DB_URL) return process.env.SUPABASE_DB_URL;
  let text = '';
  try {
    text = readFileSync(new URL('../.env.local', import.meta.url), 'utf8');
  } catch {
    return '';
  }
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq < 1 || trimmed.slice(0, eq).trim() !== 'SUPABASE_DB_URL') continue;
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    return value;
  }
  return '';
}

function assertSafe(sql) {
  if (process.env.DB_SQL_ALLOW_DANGEROUS === '1') return;
  const scanned = sql.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/--.*$/gm, ' ');
  for (const rule of BANNED) {
    if (rule.pattern.test(scanned)) {
      throw new Error(
        `Refusing ${rule.reason}. This runner blocks database-wide destructive SQL.`
      );
    }
  }
}

function readSql() {
  const args = process.argv.slice(2);
  if (args[0] === '--file') {
    if (!args[1]) throw new Error('Pass a SQL file after --file.');
    return readFileSync(args[1], 'utf8');
  }
  if (args.length > 0) return args.join(' ');
  if (process.stdin.isTTY) {
    throw new Error('Pass a SQL string, or --file path/to.sql.');
  }
  return readFileSync(0, 'utf8');
}

function redact(message, connectionString) {
  try {
    const password = new URL(connectionString).password;
    if (password) return message.split(decodeURIComponent(password)).join('***');
  } catch {
    // A password with an unescaped character can make the URL unparsable.
  }
  return message;
}

const connectionString = loadDatabaseUrl();
if (!connectionString || connectionString.includes('REPLACE_WITH_DATABASE_PASSWORD')) {
  console.error(
    'Set SUPABASE_DB_URL in .env.local to the database URI from Supabase → Project Settings → Database.'
  );
  process.exit(1);
}

let sql;
try {
  sql = readSql();
  assertSafe(sql);
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}

const client = new Client({
  connectionString,
  ssl: connectionString.includes('supabase') ? { rejectUnauthorized: false } : undefined
});

try {
  await client.connect();
  const result = await client.query(sql);
  const results = Array.isArray(result) ? result : [result];
  for (const item of results) {
    if (item.rows?.length) {
      const shown = item.rows.slice(0, 200);
      console.log(JSON.stringify(shown, null, 2));
      if (item.rows.length > shown.length) {
        console.log(`… ${item.rows.length - shown.length} more rows`);
      }
    } else if (item.command) {
      console.log(`${item.command} ${item.rowCount ?? 0}`);
    }
  }
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(redact(message, connectionString));
  process.exitCode = 1;
} finally {
  await client.end().catch(() => {});
}
