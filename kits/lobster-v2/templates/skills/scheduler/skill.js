/**
 * scheduler skill — a real in-process reminder scheduler (the v1 kit's cron was
 * a no-op; this does it properly). The agent gets a `remind` tool; jobs persist
 * in jengakit_db and a boot-time timer fires due ones. Single-container, browser-
 * visible (GET /api/reminders), zero infra — persistence is the SDK's concern.
 *
 * On fire, a reminder can optionally be run through the agent (so "remind me to
 * summarize the news at 9" actually produces something); otherwise it is simply
 * recorded as fired. Everything stays in this one process — no external infra.
 */
'use strict';

const CHECK_MS = 10000; // how often the loop scans for due jobs

// Compute an absolute due timestamp (epoch ms) from tool args (pure/testable):
//   {in_seconds: N} | {in_minutes: N} | {at: <epoch-ms or ISO string>}
function _due(now, args = {}) {
  if (args.in_seconds != null) return now + Math.max(0, Number(args.in_seconds) * 1000);
  if (args.in_minutes != null) return now + Math.max(0, Number(args.in_minutes) * 60000);
  if (args.at != null) {
    const n = Number(args.at);
    const t = isFinite(n) && n > 1e12 ? n : Date.parse(String(args.at));
    if (isFinite(t)) return t;
  }
  return now + 60000; // default: one minute out
}

// Which of the given rows are due at `now` (pure/testable).
function _selectDue(rows, now) {
  return (rows || []).filter((r) => r.status === 'pending' && Number(r.due_at) <= now);
}

let _db = null;
let _runTurn = null;

async function _init(db) {
  await db.exec("CREATE TABLE IF NOT EXISTS reminders (id INTEGER PRIMARY KEY AUTOINCREMENT, text TEXT NOT NULL, due_at INTEGER NOT NULL, status TEXT DEFAULT 'pending', act INTEGER DEFAULT 0, result TEXT DEFAULT '', created_at TEXT DEFAULT CURRENT_TIMESTAMP, fired_at TEXT DEFAULT '')");
}

async function _tick(nowMs) {
  if (!_db) return;
  const now = nowMs != null ? nowMs : Date.now();
  let rows;
  try { rows = await _db.query('SELECT id, text, due_at, status, act FROM reminders WHERE status = ? ORDER BY due_at LIMIT 25', ['pending']); }
  catch (e) { return; }
  for (const r of _selectDue(rows, now)) {
    let result = '';
    if (r.act && _runTurn) {
      try { const out = await _runTurn('[scheduled reminder] ' + r.text); result = (out && out.text) || ''; }
      catch (e) { result = 'error: ' + e.message; }
    }
    try {
      await _db.run("UPDATE reminders SET status = 'fired', fired_at = CURRENT_TIMESTAMP, result = ? WHERE id = ?", [String(result).slice(0, 2000), r.id]);
      console.log('[scheduler] fired reminder #' + r.id + ': ' + r.text);
    } catch (e) { /* leave pending; retried next tick */ }
  }
}

const tool = {
  name: 'remind',
  description: 'Schedule a reminder. Args: {"text":"what to remember","in_minutes":30} or {"in_seconds":N} or {"at":"2026-07-10T09:00:00Z"}. Add "act":true to have the assistant actually run the reminder text when it fires.',
  sideEffecting: true,
  run: async (args = {}) => {
    if (!_db) return 'scheduler not ready';
    const text = String(args.text || args._raw || '').trim();
    if (!text) return 'a reminder text is required';
    const due = _due(Date.now(), args);
    await _db.run('INSERT INTO reminders (text, due_at, act) VALUES (?, ?, ?)', [text.slice(0, 500), due, args.act ? 1 : 0]);
    return 'reminder set for ' + new Date(due).toISOString() + ': ' + text;
  },
};

// Boot hook: wire the db + runTurn, create the table, mount the API, start loop.
function setup(app, deps) {
  _db = deps.db;
  _runTurn = deps.runTurn;
  _init(_db).then(() => {
    setInterval(() => { _tick().catch(() => {}); }, CHECK_MS);
    setTimeout(() => { _tick().catch(() => {}); }, 1500); // an early first scan
    console.log('[scheduler] reminder loop started (every ' + (CHECK_MS / 1000) + 's)');
  }).catch((e) => console.warn('[scheduler] init failed', e.message));

  app.get('/api/reminders', async (_req, res) => {
    try { res.json(await _db.query('SELECT id, text, due_at, status, result, created_at, fired_at FROM reminders ORDER BY id DESC LIMIT 100')); }
    catch { res.json([]); }
  });
}

module.exports = { name: 'scheduler', tools: [tool], setup, _due, _selectDue, _tick, __setTestDeps: (db, rt) => { _db = db; _runTurn = rt; } };
