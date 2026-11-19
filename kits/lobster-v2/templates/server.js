/**
 * lobster-v2 — a browser-based agentic assistant kit.
 *
 * Doctrine: runs entirely in the browser + this single container (which the
 * jengaKIT platform already isolates — no docker-in-docker). All infra is behind
 * vendored platform SDKs: the model via jengakit_llm, persistence via jengakit_db,
 * the agent loop via jengakit_agent. Tools + channels are added as SKILLS without
 * editing core (nanoclaw's model). The kit ships ZERO hosting/infra-selection code.
 *
 * Multi-user: every deploy requires login (PBKDF2 users in jengakit_db); memory,
 * chat sessions, and the audit trail are all per-user. Web requests are guarded by
 * a session cookie; external channel webhooks authenticate via their own signatures.
 */
'use strict';

const express = require('express');
const path = require('path');
const { execFile } = require('child_process');

const db = require('./lib/jengakit_db');
const { Agent } = require('./lib/jengakit_agent');
const { loadSkills } = require('./lib/skills');
const { resolveLLM, resolveProvider } = require('./lib/providers');
const config = require('./lib/config');
const auth = require('./lib/auth');

// The model provider: the platform SDK by default, or a RUNTIME-selected alternate
// (Ollama, any OpenAI-compatible endpoint). Resolved fresh on every call so a
// provider change made in the Settings UI applies to the next message — no restart.
const callLLM = (prompt, systemPrompt) => resolveLLM()(prompt, systemPrompt);

const PORT = process.env.PORT || 3000;
// Autonomy is runtime config (Settings UI), read per turn — never a build/deploy flag.
function autonomy() { return (process.env.LOBSTER_AUTONOMY || 'supervised').toLowerCase(); } // readonly|supervised|auto

// The running kit version, surfaced in the UI so a user can see what they run.
let VERSION = 'dev';
try { VERSION = require('./package.json').version || 'dev'; } catch (e) { /* default */ }

// Reuse the manage-channels skill's declarative status (active | missing env |
// webhook path) so the settings UI shows the SAME truth the agent tool reports —
// which channels are actually wired vs. merely available. Falls back gracefully.
let channelStatus = null;
try { channelStatus = require('./skills/manage-channels/skill.js')._status; } catch (e) { /* optional */ }

// Persona (name + system prompt) is generated per-deploy into public/persona.js.
let PERSONA = { name: 'Lobster', system: 'You are Lobster, a helpful, concise personal assistant.' };
try { PERSONA = Object.assign(PERSONA, require('./public/persona.js')); } catch (e) { /* default */ }

const app = express();
// Capture the raw request bytes alongside the parsed JSON: signed-webhook
// channels (Discord ed25519, Slack HMAC) MUST verify the signature over the
// exact bytes received, before parsing. Channel-agnostic — no channel names here.
app.use(express.json({ limit: '1mb', verify: (req, _res, buf) => { req.rawBody = buf; } }));

// ── In-process session tokens (re-login after a restart) ───────────────────────
const SESSIONS = new Map(); // token -> { username, role }
function issue(res, user) {
  const token = auth.newToken();
  SESSIONS.set(token, { username: user.username, role: user.role });
  res.setHeader('Set-Cookie', 'lobster_session=' + token + '; HttpOnly; SameSite=Strict; Path=/; Max-Age=604800');
  return token;
}
function whoami(req) {
  const token = auth.parseCookies(req.headers.cookie).lobster_session;
  return (token && SESSIONS.get(token)) || null;
}

// ── DB (per-user memory, sessions, audit — via the DB SDK) ─────────────────────
async function _addColumn(table, col, def) {
  try { await db.exec('ALTER TABLE ' + table + ' ADD COLUMN ' + col + ' ' + def); } catch (e) { /* already present */ }
}
async function initDb() {
  await db.exec("CREATE TABLE IF NOT EXISTS memory (id INTEGER PRIMARY KEY AUTOINCREMENT, user TEXT DEFAULT 'local', k TEXT, v TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP)");
  await db.exec("CREATE TABLE IF NOT EXISTS messages (id INTEGER PRIMARY KEY AUTOINCREMENT, user TEXT DEFAULT 'local', session TEXT DEFAULT 'default', role TEXT, content TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP)");
  await db.exec("CREATE TABLE IF NOT EXISTS audit (id INTEGER PRIMARY KEY AUTOINCREMENT, user TEXT, tool TEXT, args TEXT, result TEXT, autonomy TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP)");
  // Bring older installs' tables up to the multi-user shape (no-op if present).
  await _addColumn('memory', 'user', "TEXT DEFAULT 'local'");
  await _addColumn('messages', 'user', "TEXT DEFAULT 'local'");
  await _addColumn('messages', 'session', "TEXT DEFAULT 'default'");
  await auth.ensureSchema(db);
  // Seed process.env from runtime config (the Settings UI is the source of truth).
  await config.load(db).catch((e) => console.warn('[config] load failed:', e.message));
}
async function remember(user, k, v) { await db.run('INSERT INTO memory (user, k, v) VALUES (?, ?, ?)', [user, String(k).slice(0, 120), String(v).slice(0, 2000)]); }
async function recall(user) { const rows = await db.query('SELECT k, v FROM memory WHERE user = ? ORDER BY id DESC LIMIT 20', [user]); return rows.map((r) => '- ' + r.k + ': ' + r.v).join('\n'); }
async function logMsg(user, session, role, content) { try { await db.run('INSERT INTO messages (user, session, role, content) VALUES (?, ?, ?, ?)', [user, session, role, String(content).slice(0, 8000)]); } catch (e) {} }
async function history(user, session) { const rows = await db.query('SELECT role, content FROM messages WHERE user = ? AND session = ? ORDER BY id DESC LIMIT 10', [user, session]); return rows.reverse(); }
async function audit(user, tool, args, result) {
  try { await db.run('INSERT INTO audit (user, tool, args, result, autonomy) VALUES (?, ?, ?, ?, ?)', [user, tool, JSON.stringify(args || {}).slice(0, 2000), String(result == null ? '' : result).slice(0, 2000), autonomy()]); } catch (e) {}
}

// ── Built-in tools ────────────────────────────────────────────────────────────
function shellTool() {
  return {
    name: 'shell', description: 'Run a short shell command in this sandboxed container. Args: {"cmd":"the command"}.', sideEffecting: true,
    run: (args) => new Promise((resolve) => {
      const cmd = String((args && (args.cmd || args.command || args.c || args._raw)) || '').trim();
      if (!cmd) return resolve('(no command)');
      execFile('/bin/sh', ['-c', cmd], { timeout: 8000, maxBuffer: 256 * 1024 }, (err, stdout, stderr) => {
        resolve(((stdout || '') + (stderr || '') || (err ? 'error: ' + err.message : '(no output)')).slice(0, 3000));
      });
    }),
  };
}
function rememberTool(user) {
  return { name: 'remember', description: 'Save a fact to long-term memory. Args: {"key":"...","value":"..."}.', sideEffecting: true,
    run: async (a) => { await remember(user, a.key || a.k || 'note', a.value || a.v || a._raw || ''); return 'saved'; } };
}

const { tools: skillTools, channels, setups } = loadSkills(path.join(__dirname, 'skills'));
const TOOL_NAMES = ['shell', 'remember'].concat(skillTools.map((t) => t.name));

// Wrap side-effecting tools so every run is written to the audit trail, attributed
// to the acting user. Read-only tools are left untouched.
function withAudit(user, tools) {
  return tools.map((t) => {
    if (!t.sideEffecting) return t;
    const orig = t.run;
    return Object.assign({}, t, { run: async (args) => { const r = await orig(args); await audit(user, t.name, args, r); return r; } });
  });
}

async function buildAgent(user) {
  const mem = await recall(user);
  const system = PERSONA.system + (mem ? '\n\n## What you remember\n' + mem : '') +
    '\n\nYou run inside an isolated container. Be concise. Use tools only when they help.';
  const tools = withAudit(user, [shellTool(), rememberTool(user)].concat(skillTools));
  return new Agent({ systemPrompt: system, tools, autonomy: autonomy(), maxSteps: 6, llm: callLLM });
}

// One agent turn, shared by the web chat AND every channel. ctx may be an onEvent
// function (channel back-compat) or { user, session, onEvent }.
async function runTurn(userText, ctx) {
  const onEvent = typeof ctx === 'function' ? ctx : (ctx && ctx.onEvent) || function () {};
  const user = (ctx && ctx.user) || 'channel';
  const session = (ctx && ctx.session) || 'default';
  await logMsg(user, session, 'user', userText);
  const agent = await buildAgent(user);
  const hist = await history(user, session);
  const result = await agent.run(userText, hist, { onEvent });
  await logMsg(user, session, 'assistant', result.text);
  return result;
}

// ── Public routes (no auth) ────────────────────────────────────────────────────
app.get('/health', (_req, res) => res.json({ status: 'ok', assistant: PERSONA.name, version: VERSION }));
app.get('/api/persona', (_req, res) => res.json({ name: PERSONA.name }));

app.post('/api/auth/login', async (req, res) => {
  const { username, password } = req.body || {};
  const user = await authenticateSafe(username, password);
  if (!user) return res.status(401).json({ error: 'invalid credentials' });
  issue(res, user);
  res.json({ username: user.username, role: user.role });
});
async function authenticateSafe(u, p) { try { return await auth.authenticate(db, u, p); } catch (e) { return null; } }

app.post('/api/auth/logout', (req, res) => {
  const token = auth.parseCookies(req.headers.cookie).lobster_session;
  if (token) SESSIONS.delete(token);
  res.setHeader('Set-Cookie', 'lobster_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0');
  res.json({ ok: true });
});

// ── Auth gate: every /api/* below requires a session (channels/webhooks don't) ──
app.use('/api', (req, res, next) => {
  const me = whoami(req);
  if (!me) return res.status(401).json({ error: 'login required' });
  req.user = me;
  next();
});

app.get('/api/auth/me', (req, res) => res.json({ username: req.user.username, role: req.user.role }));

// ── Chat (SSE stream of agent events + the final answer) ───────────────────────
app.post('/api/chat', async (req, res) => {
  const userText = String((req.body && req.body.message) || '').slice(0, 4000);
  const session = String((req.body && req.body.session) || 'default').slice(0, 64);
  if (!userText) return res.status(400).json({ error: 'message required' });
  res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
  const send = (type, data) => res.write('data: ' + JSON.stringify({ type, ...data }) + '\n\n');
  try {
    const result = await runTurn(userText, {
      user: req.user.username, session,
      onEvent: (type, data) => {
        if (type === 'tool-call') send('tool', { name: data.name, args: data.args, phase: 'call' });
        else if (type === 'tool-result') send('tool', { name: data.name, phase: 'result', result: data.result });
        else if (type === 'tool-blocked') send('tool', { name: data.name, phase: 'blocked' });
      },
    });
    send('answer', { text: result.text, steps: result.steps });
  } catch (e) {
    send('answer', { text: 'Something went wrong: ' + (e && e.message || e) });
  }
  res.write('data: [DONE]\n\n'); res.end();
});

app.get('/api/memory', async (req, res) => { try { res.json(await db.query('SELECT k, v, created_at FROM memory WHERE user = ? ORDER BY id DESC LIMIT 50', [req.user.username])); } catch { res.json([]); } });

// Chat sessions for the current user: list threads + fetch one thread's history.
app.get('/api/sessions', async (req, res) => {
  try {
    res.json(await db.query(
      'SELECT session, COUNT(*) AS messages, MAX(created_at) AS last_at, MIN(created_at) AS started_at FROM messages WHERE user = ? GROUP BY session ORDER BY last_at DESC LIMIT 100',
      [req.user.username]));
  } catch { res.json([]); }
});
app.get('/api/sessions/:id', async (req, res) => {
  try { res.json(await db.query('SELECT role, content, created_at FROM messages WHERE user = ? AND session = ? ORDER BY id LIMIT 500', [req.user.username, String(req.params.id).slice(0, 64)])); }
  catch { res.json([]); }
});

// Audit trail: your own rows, or everyone's for an admin.
app.get('/api/audit', async (req, res) => {
  try {
    const rows = req.user.role === 'admin'
      ? await db.query('SELECT user, tool, args, result, autonomy, created_at FROM audit ORDER BY id DESC LIMIT 200')
      : await db.query('SELECT user, tool, args, result, autonomy, created_at FROM audit WHERE user = ? ORDER BY id DESC LIMIT 200', [req.user.username]);
    res.json(rows);
  } catch { res.json([]); }
});

// Admin: create a user.
app.post('/api/users', async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'admin only' });
  const { username, password, role } = req.body || {};
  try { res.json(await auth.createUser(db, username, password, role)); }
  catch (e) { res.status(400).json({ error: e.message }); }
});

// Runtime configuration — the ONLY place channels/providers/integrations/ssh get
// set. Admin-only. GET returns grouped fields (secrets masked); PUT applies a
// partial update in-process, no restart.
app.get('/api/config', (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'admin only' });
  res.json(config.publicView());
});
app.put('/api/config', async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'admin only' });
  try {
    const applied = await config.setMany(db, (req.body && req.body.updates) || {});
    res.json({ ok: true, applied: applied, config: config.publicView() });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

// Rich channel status for the UI: [{name, active, webhook, missing, note}]. Uses
// the manage-channels registry when present; otherwise reports the loaded channel
// skills as active (they registered a webhook at boot).
function channelStatusList() {
  if (channelStatus) { try { return channelStatus(process.env); } catch (e) { /* fall through */ } }
  return channels.map((c) => ({ name: c.name, active: true, webhook: '', missing: [], note: '' }));
}

// Integrations are skills that reach an EXTERNAL app and need a URL to connect —
// distinct from channels (inbound messaging) and built-in tools. Today: the
// open-design editor. `available` = the skill's tools are loaded in this deploy.
function integrationStatus() {
  return [{
    name: 'open-design',
    label: 'Open-Design editor',
    env: 'LOBSTER_OPENDESIGN_URL',
    url: process.env.LOBSTER_OPENDESIGN_URL || '',
    available: TOOL_NAMES.indexOf('design_list') !== -1,
    configured: !!process.env.LOBSTER_OPENDESIGN_URL,
  }];
}

app.get('/api/channels', (_req, res) => res.json({ channels: channelStatusList() }));
app.get('/api/provider', (_req, res) => res.json(resolveProvider()));
app.get('/api/settings', (req, res) => res.json({
  assistant: PERSONA.name, version: VERSION, user: req.user.username, role: req.user.role,
  autonomy: autonomy(), provider: resolveProvider(),
  channels: channelStatusList(), tools: TOOL_NAMES, integrations: integrationStatus(),
}));

// ── Static app (login page + chat) served after the API routes ─────────────────
app.use(express.static(path.join(__dirname, 'public')));

// Register channel skills (WhatsApp, …). Each wires its own webhook/send and
// funnels inbound messages through the SAME agent via runTurn. These live OUTSIDE
// the /api auth gate — they authenticate via their own signatures/verify tokens.
channels.forEach((c) => { try { c.register(app, { runTurn }); console.log('[channel] registered ' + c.name); } catch (e) { console.warn('[channel] ' + c.name + ' failed: ' + e.message); } });

// Run each skill's boot hook (routes + timers, e.g. the reminder scheduler).
setups.forEach((s) => { try { s.setup(app, { runTurn, db }); console.log('[setup] ran ' + s.name); } catch (e) { console.warn('[setup] ' + s.name + ' failed: ' + e.message); } });

async function boot() {
  const admin = await auth.bootstrapAdmin(db).catch((e) => { console.warn('[auth] bootstrap failed', e.message); return null; });
  if (admin && admin.created) {
    console.log('[auth] created admin user "' + admin.username + '"' + (admin.generated ? ' with generated password: ' + admin.password + ' (set LOBSTER_ADMIN_PASSWORD to pin it)' : ''));
  }
  app.listen(PORT, '0.0.0.0', () => console.log('[lobster-v2] ' + PERSONA.name + ' on :' + PORT + ' (autonomy=' + autonomy() + ', provider=' + resolveProvider().name + ', channels=' + channels.map((c) => c.name).join(',') + ')'));
}
initDb().then(boot).catch((e) => { console.error('db init failed', e); boot(); });
