/**
 * jengaKit Platform SDK — Database (dual-mode: Supabase PostgreSQL or SQLite)
 * Auto-copied by pipeline when database usage is detected.
 * Files named jengakit_* are platform-owned and overwritten on every deploy.
 *
 * Hosted mode (SUPABASE_DB_URL set):
 *   pg Pool connected to PostgreSQL with per-app schema
 *   subscribe() watches for row changes via Supabase Realtime
 *
 * Community mode (no SUPABASE_DB_URL):
 *   better-sqlite3 at DATABASE_PATH
 *   subscribe() is a no-op
 *
 * Usage:
 *   const { query, run, exec, queryOne, subscribe, close, isSupabase } = require('./lib/jengakit_db');
 *
 * INITIALIZATION IS LAZY. The driver handle is created on the first
 * query()/run()/exec()/db.prepare()/db.pool access, not at module-load
 * time. This is required because Next.js's `next build` step ("Collecting
 * page data") forks multiple Node workers via jest-worker. Each worker
 * imports the app's route handlers to inspect their exports, which
 * transitively imports this SDK. If the SDK opened the SQLite handle at
 * module-load time, every worker would race to write `journal_mode = WAL`
 * to the same file header — the winner gets WAL ownership, the rest get
 * SQLITE_BUSY and crash the build. Lazy initialization avoids the race
 * because workers only inspect exports (not call them) during collection.
 *
 * At runtime, behavior is identical: the first incoming request that
 * touches the DB triggers init; subsequent requests reuse the cached
 * _pool / _sqlite handle. Steady-state latency is unchanged.
 */

const SUPABASE_DB_URL = process.env.SUPABASE_DB_URL;
const SUPABASE_SCHEMA = process.env.SUPABASE_SCHEMA || 'public';
const SUPABASE_URL = process.env.SUPABASE_URL || process.env.SUPABASE_KONG_URL;
const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY;
const DB_PATH = process.env.DATABASE_PATH || './data/app.db';

const isSupabase = !!SUPABASE_DB_URL;

let _pool = null;
let _sqlite = null;

// All third-party driver require() calls below are wrapped inside lazy
// _getPool() / _getSqlite() / subscribe() functions so they only fire
// at runtime when the consumer actually asks for that driver. For
// Next.js consumers this is necessary but not sufficient — webpack
// still statically traces every literal require to its target package
// at build time, and would fail with "Module not found" on the
// inverse driver (the one not declared in the kit's package.json).
// The fix lives in each kit's next.config.js as
// experimental.serverComponentsExternalPackages, which tells webpack:
// "do not bundle these; emit the require call as-is and let Node
// resolve it at runtime." See the next.config.js in each Next.js kit.
// At runtime, the inverse driver's require simply never executes
// because the gating isSupabase / DB_PATH conditional bails out
// first.

// ── Lazy driver initialization ─────────────────────────────────────────────

function _getPool() {
  if (_pool) return _pool;
  if (!SUPABASE_DB_URL) return null;
  const { Pool } = require('pg');
  _pool = new Pool({ connectionString: SUPABASE_DB_URL });
  // NOTE: we intentionally do NOT use _pool.on('connect') to issue
  // `SET search_path` — that handler runs the SET as a fire-and-forget
  // promise that pg-pool does not await before handing the client to
  // the requesting query. The race meant CREATE TABLE landed in `public`
  // while the next SELECT (on a different pooled connection that won
  // the race) hit `app_<slug>`, producing "relation X does not exist"
  // intermittently. We also can't rely on the `?options=-c
  // search_path=...` URL parameter — libpq honours it, node-pg
  // silently ignores non-standard URL params. Instead, every helper
  // below acquires a client, awaits the SET, runs the user query, and
  // releases. The connection pool still amortises connect cost; only
  // the SET is per-query (one extra ~1ms statement).
  return _pool;
}

function _getSqlite() {
  if (_sqlite) return _sqlite;
  // fs/path are Node built-ins, safe under webpack — only the third-
  // party driver needs the dynamic-require trick.
  const fs = require('fs');
  const path = require('path');
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  const Database = require('better-sqlite3');
  _sqlite = new Database(DB_PATH);
  _sqlite.pragma('journal_mode = WAL');
  return _sqlite;
}

/** Acquire a connection from the pool with search_path set. Caller must
 *  release. Throws if SUPABASE_DB_URL isn't set. */
async function _withSchemaClient() {
  const pool = _getPool();
  if (!pool) throw new Error('pg pool not configured (SUPABASE_DB_URL missing)');
  const client = await pool.connect();
  try {
    await client.query(`SET search_path TO "${SUPABASE_SCHEMA}", public`);
    return client;
  } catch (err) {
    client.release(err);
    throw err;
  }
}

// ── Query helpers ──────────────────────────────────────────────────────────

// Auto-translate placeholders: ? ↔ $N depending on driver
function _pgSql(sql, params) {
  // If SQL uses ? placeholders, convert to $1, $2, ... for pg
  if (sql.includes('?') && !sql.match(/\$\d/)) {
    let i = 0;
    sql = sql.replace(/\?/g, () => `$${++i}`);
  }
  return sql;
}
function _sqliteSql(sql) {
  // If SQL uses $1, $2, ... convert to ? for SQLite
  return sql.replace(/\$\d+/g, '?');
}

/**
 * Execute a SQL query and return all rows.
 * Auto-translates placeholders between ? and $N.
 */
async function query(sql, params = []) {
  if (isSupabase) {
    const client = await _withSchemaClient();
    try {
      const res = await client.query(_pgSql(sql, params), params);
      return res.rows;
    } finally {
      client.release();
    }
  }
  return _getSqlite().prepare(_sqliteSql(sql)).all(...params);
}

/** Execute a SQL query and return the first row (or null). */
async function queryOne(sql, params = []) {
  if (isSupabase) {
    const client = await _withSchemaClient();
    try {
      const res = await client.query(_pgSql(sql, params), params);
      return res.rows[0] || null;
    } finally {
      client.release();
    }
  }
  return _getSqlite().prepare(_sqliteSql(sql)).get(...params) || null;
}

/** Execute a SQL statement (INSERT/UPDATE/DELETE). Returns { changes, lastInsertRowid }. */
async function run(sql, params = []) {
  if (isSupabase) {
    const client = await _withSchemaClient();
    try {
      const res = await client.query(_pgSql(sql, params), params);
      return { changes: res.rowCount, lastInsertRowid: null };
    } finally {
      client.release();
    }
  }
  return _getSqlite().prepare(_sqliteSql(sql)).run(...params);
}

/** Execute raw SQL (multi-statement OK for schema creation). */
async function exec(sql) {
  if (isSupabase) {
    const client = await _withSchemaClient();
    try {
      await client.query(sql);
    } finally {
      client.release();
    }
    return;
  }
  _getSqlite().exec(sql);
}

/** Get all rows from a table. */
async function getAll(table) {
  return query(`SELECT * FROM ${table}`);
}

/** Close the database connection. */
function close() {
  if (_pool) { _pool.end(); _pool = null; }
  if (_sqlite) { _sqlite.close(); _sqlite = null; }
}

// ── Realtime (Supabase only) ───────────────────────────────────────────────

/**
 * Subscribe to real-time changes on a table (Supabase Realtime).
 * No-op in community/SQLite mode.
 */
function subscribe(table, callback, event = '*') {
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.log(`[db] Realtime not available (community mode) — skipping subscription to ${table}`);
    return { unsubscribe: () => {} };
  }
  try {
    const { createClient } = require('@supabase/supabase-js');
    const client = createClient(SUPABASE_URL, SUPABASE_KEY, {
      db: { schema: SUPABASE_SCHEMA },
      realtime: { params: { eventsPerSecond: 10 } },
    });
    const channel = client
      .channel(`${table}-changes`)
      .on('postgres_changes', { event, schema: SUPABASE_SCHEMA, table }, callback)
      .subscribe();
    return { unsubscribe: () => client.removeChannel(channel) };
  } catch (e) {
    console.log(`[db] Realtime subscribe failed: ${e.message}`);
    return { unsubscribe: () => {} };
  }
}

// ── Exports ────────────────────────────────────────────────────────────────

module.exports = { query, queryOne, run, exec, getAll, subscribe, close, isSupabase };

// Backwards-compatible raw-driver access. The old eager-init exports
// were:
//   if (_sqlite) module.exports.prepare = (...args) => _sqlite.prepare(...args);
//   if (_pool)   module.exports.pool    = _pool;
//
// We preserve that exact API shape via property getters so existing
// kit code (e.g. kits/nextjs-crud's [table] route, which calls
// `db.prepare(...).all()`) keeps working without any change.
//
// The getter returns:
//   - `prepare`: undefined in pg mode (matches old), a function in sqlite
//     mode that lazily materializes the sqlite handle on first call
//   - `pool`:    undefined in sqlite mode (matches old), the pg Pool
//     instance in pg mode (lazy on first access)
//
// Reading the property does not trigger DB I/O — only invoking
// `prepare(...)` or pool methods does. This preserves the "no I/O at
// import time" guarantee even when a consumer destructures the export.
Object.defineProperty(module.exports, 'prepare', {
  enumerable: true,
  configurable: true,
  get() {
    if (isSupabase) return undefined;
    return (...args) => _getSqlite().prepare(...args);
  },
});
Object.defineProperty(module.exports, 'pool', {
  enumerable: true,
  configurable: true,
  get() {
    if (!isSupabase) return undefined;
    return _getPool();
  },
});
