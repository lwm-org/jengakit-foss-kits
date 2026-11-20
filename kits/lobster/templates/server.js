'use strict';
const express = require('express');
const axios   = require('axios');
const path    = require('path');
const fs      = require('fs');
const crypto  = require('crypto');
const db      = require('./lib/db');
const { sshExec } = require('./lib/tools');

db.initDb();
// Eagerly generate pod keypair so it is ready before the first SSH request
db.getOrCreatePodKeypair().catch(e => console.error('[keypair] Failed to generate:', e.message));

function readTunnelUrl() {
  // Priority: explicit env var > Cloudflare sidecar file > public domain construction
  if (process.env.LOBSTER_TUNNEL_URL) return process.env.LOBSTER_TUNNEL_URL;
  try { return fs.readFileSync('/tunnel/url', 'utf8').trim(); } catch (_) {}
  // Construct from JENGAKIT_PUBLIC_DOMAIN if available (Cloudflare Tunnel)
  const pubDomain = process.env.JENGAKIT_PUBLIC_DOMAIN;
  const slug = process.env.JENGAKIT_APP_SLUG || process.env.HOSTNAME || '';
  if (pubDomain && slug) return `https://${slug}.${pubDomain}`;
  return '';
}

const app  = express();
const PORT = parseInt(process.env.PORT || '3000', 10);

// ── LLM config ────────────────────────────────────────────────────────────────
function resolveUrl(raw) {
  if (!raw) return '';
  try {
    return new URL(raw).toString();
  } catch (_) { return raw; }
}

const LLM_URL      = resolveUrl(process.env.JENGAKIT_LLM_URL || '');
const LLM_TOKEN    = process.env.JENGAKIT_LLM_TOKEN || '';
const ASST_NAME    = process.env.ASSISTANT_NAME || 'Lobster';
const ASST_PERSONA = process.env.ASSISTANT_PERSONALITY
  || 'You are a helpful, concise, and friendly AI assistant.';
function getAdminPassword() {
  return db.getPodConfig('admin_password_override') || process.env.LOBSTER_ADMIN_PASSWORD || 'lobster';
}

function getAutonomy() {
  return db.getPodConfig('autonomy') || process.env.LOBSTER_AUTONOMY || 'Supervised';
}

// ── In-memory store ───────────────────────────────────────────────────────────
const sessions = {};
const memory   = [];
const logs     = [];
let _logId = 0, _memId = 0;

function addLog(level, message) {
  logs.unshift({ id: ++_logId, level, message, ts: new Date().toISOString() });
  if (logs.length > 300) logs.pop();
  console[level === 'error' ? 'error' : 'log'](`[${level.toUpperCase()}] ${message}`);
}

function getSession(id) {
  if (!sessions[id]) sessions[id] = [];
  return sessions[id];
}

// ── Middleware ─────────────────────────────────────────────────────────────────
app.use(express.json({ limit: '2mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// ── Health (public — no auth) ─────────────────────────────────────────────────
app.get('/health', (_req, res) =>
  res.json({ status: 'ok', uptime: Math.floor(process.uptime()), name: ASST_NAME }));

// ── Auth ──────────────────────────────────────────────────────────────────────
const _authTokens = new Set();

function parseCookies(req) {
  const cookies = {};
  (req.headers.cookie || '').split(';').forEach(c => {
    const idx = c.indexOf('=');
    if (idx > 0) cookies[c.slice(0, idx).trim()] = c.slice(idx + 1).trim();
  });
  return cookies;
}

function requireAuth(req, res, next) {
  // Allow server-internal calls (channel webhook handlers call /api/chat via localhost)
  const ip = req.ip || req.socket?.remoteAddress || '';
  if (ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1') return next();
  const token = parseCookies(req).lobster_session;
  if (token && _authTokens.has(token)) return next();
  res.status(401).json({ error: 'Unauthorized', login_required: true });
}

// Login / logout — must be registered BEFORE the requireAuth middleware
app.post('/api/auth/login', (req, res) => {
  const { password, username } = req.body || {};
  // Admin check first (no username required — backwards compatible)
  if (password && password === getAdminPassword()) {
    const token = crypto.randomBytes(32).toString('hex');
    _authTokens.add(token);
    res.setHeader('Set-Cookie', `lobster_session=${token}; HttpOnly; SameSite=Strict; Path=/`);
    addLog('info', 'Admin login successful');
    return res.json({ ok: true, role: 'admin' });
  }
  // Users table check
  if (username && password && db.verifyUserPassword(username, password)) {
    const token = crypto.randomBytes(32).toString('hex');
    _authTokens.add(token);
    res.setHeader('Set-Cookie', `lobster_session=${token}; HttpOnly; SameSite=Strict; Path=/`);
    addLog('info', `User login: ${username}`);
    return res.json({ ok: true, role: 'user' });
  }
  return res.status(401).json({ error: 'Invalid credentials' });
});

app.post('/api/auth/logout', (req, res) => {
  const token = parseCookies(req).lobster_session;
  if (token) _authTokens.delete(token);
  res.setHeader('Set-Cookie',
    'lobster_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0');
  res.json({ ok: true });
});

// Protect all remaining /api/* routes
app.use('/api/', requireAuth);

// ── Autonomy ──────────────────────────────────────────────────────────────────
app.post('/api/settings/autonomy', (req, res) => {
  const { autonomy } = req.body || {};
  const valid = ['Supervised', 'Full', 'ReadOnly'];
  if (!autonomy || !valid.includes(autonomy)) return res.status(400).json({ error: 'Invalid autonomy value' });
  db.setPodConfig('autonomy', autonomy);
  res.json({ ok: true, autonomy });
});

// ── Change admin password ─────────────────────────────────────────────────────
app.post('/api/auth/change-admin-password', (req, res) => {
  const { password } = req.body || {};
  if (!password || password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });
  db.setPodConfig('admin_password_override', password);
  addLog('info', 'Admin password updated at runtime');
  res.json({ ok: true });
});

// ── User management ───────────────────────────────────────────────────────────
app.get('/api/users', (req, res) => {
  res.json(db.listUsers());
});

app.post('/api/users', (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: 'username and password required' });
  if (!/^[a-zA-Z0-9_.-]{1,64}$/.test(username)) return res.status(400).json({ error: 'Invalid username' });
  if (password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });
  try {
    const user = db.createUser(username, password);
    res.json(user);
  } catch (e) {
    if (e.message && e.message.includes('UNIQUE')) return res.status(409).json({ error: 'Username already exists' });
    res.status(500).json({ error: 'Failed to create user' });
  }
});

app.put('/api/users/:id/password', (req, res) => {
  const { password } = req.body || {};
  if (!password || password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });
  db.updateUserPassword(parseInt(req.params.id), password);
  res.json({ ok: true });
});

app.delete('/api/users/:id', (req, res) => {
  db.deleteUser(parseInt(req.params.id));
  res.json({ ok: true });
});

// ── Config ────────────────────────────────────────────────────────────────────
app.get('/api/config', (_req, res) => {
  let llm_origin = null;
  try { llm_origin = new URL(LLM_URL).origin; } catch (_) {}
  const sshHosts = db.listSshHosts();
  res.json({
    assistant_name:      ASST_NAME,
    personality:         ASST_PERSONA,
    llm_configured:      !!(LLM_URL && LLM_TOKEN),
    llm_origin,
    provider:            process.env.JENGAKIT_LLM_PROVIDER || 'unknown',
    model:               process.env.JENGAKIT_LLM_MODEL    || 'unknown',
    telegram_configured:  !!process.env.LOBSTER_TELEGRAM_BOT_TOKEN,
    discord_configured:   !!process.env.LOBSTER_DISCORD_BOT_TOKEN,
    signal_configured:    !!(process.env.LOBSTER_SIGNAL_API_URL && process.env.LOBSTER_SIGNAL_NUMBER),
    whatsapp_configured:  !!(process.env.LOBSTER_WHATSAPP_TOKEN && process.env.LOBSTER_WHATSAPP_PHONE_ID),
    tunnel_url:           readTunnelUrl(),
    tunnel_type:          process.env.LOBSTER_CF_TUNNEL_TOKEN
                            ? 'cloudflare'
                            : process.env.JENGAKIT_PUBLIC_DOMAIN ? 'public_domain' : null,
    autonomy:             getAutonomy(),
    admin_password_set:   getAdminPassword() !== 'lobster',
    whatsapp_phone_id:    process.env.LOBSTER_WHATSAPP_PHONE_ID || null,
    signal_api_url:       process.env.LOBSTER_SIGNAL_API_URL    || null,
    signal_number:        process.env.LOBSTER_SIGNAL_NUMBER     || null,
    ssh_hosts_count:      sshHosts.length,
    ssh_enabled:          sshHosts.length > 0,
    runtime_llm_active:   !!(db.getPodConfig('runtime_llm_url')),
    runtime_llm_provider: db.getPodConfig('runtime_llm_provider') || null,
    runtime_llm_model:    db.getPodConfig('runtime_llm_model')    || null,
    runtime_llm_url:      db.getPodConfig('runtime_llm_url')      || null,
  });
});

// ── Doctor ────────────────────────────────────────────────────────────────────
app.get('/api/doctor', async (_req, res) => {
  const sshHosts = db.listSshHosts();
  const report = {
    status:         'ok',
    uptime_seconds: Math.floor(process.uptime()),
    node:           process.version,
    memory_entries: memory.length,
    session_count:  Object.keys(sessions).length,
    log_entries:    logs.length,
    llm:  { url: LLM_URL || null, token_set: !!LLM_TOKEN, status: 'unknown' },
    channels: {
      telegram: { enabled: !!process.env.LOBSTER_TELEGRAM_BOT_TOKEN },
      discord:  { enabled: !!process.env.LOBSTER_DISCORD_BOT_TOKEN  },
      signal:   {
        enabled:  !!(process.env.LOBSTER_SIGNAL_API_URL && process.env.LOBSTER_SIGNAL_NUMBER),
        api_url:  process.env.LOBSTER_SIGNAL_API_URL  || null,
        number:   process.env.LOBSTER_SIGNAL_NUMBER   || null,
      },
      whatsapp: {
        enabled:   !!(process.env.LOBSTER_WHATSAPP_TOKEN && process.env.LOBSTER_WHATSAPP_PHONE_ID),
        phone_id:  process.env.LOBSTER_WHATSAPP_PHONE_ID || null,
      },
    },
    tunnel: {
      type:  process.env.LOBSTER_CF_TUNNEL_TOKEN
               ? 'cloudflare'
               : process.env.JENGAKIT_PUBLIC_DOMAIN ? 'public_domain' : null,
      url:   readTunnelUrl(),
      ready: !!readTunnelUrl(),
    },
    ssh: {
      hosts_count: sshHosts.length,
      hosts:       sshHosts.map(h => ({ label: h.label, hostname: h.hostname, port: h.port })),
    },
  };

  const { url: effectiveUrl, token: effectiveToken, model: effectiveModel, source: llmSource, provider: effectiveProvider } = getEffectiveLlmConfig();
  report.llm.provider = effectiveProvider || process.env.JENGAKIT_LLM_PROVIDER || null;
  report.llm.model    = effectiveModel || process.env.JENGAKIT_LLM_MODEL || null;
  report.llm.source   = llmSource;

  if (effectiveUrl && effectiveToken) {
    const t0 = Date.now();
    try {
      const pingBody = llmSource === 'runtime'
        ? { model: effectiveModel, prompt: 'reply with just: pong', stream: false }
        : { prompt: 'reply with just: pong', system_prompt: 'You are a ping-pong bot.' };
      const r = await axios.post(effectiveUrl,
        pingBody,
        { headers: { Authorization: `Bearer ${effectiveToken}`, 'Content-Type': 'application/json' },
          timeout: 20000 });
      report.llm.ping_ms = Date.now() - t0;
      report.llm.status  = (r.data.response || r.data.text) ? 'ok' : 'unexpected_response';
      if (report.llm.status !== 'ok') {
        report.llm.hint = 'LLM responded but with an unexpected format';
        report.status   = 'degraded';
      }
    } catch (e) {
      report.llm.ping_ms = Date.now() - t0;
      const httpStatus   = e.response?.status;
      report.llm.status  =
        e.code === 'ECONNREFUSED'          ? 'connection_refused' :
        e.code === 'ETIMEDOUT'             ? 'timeout' :
        e.message.includes('timeout')      ? 'timeout' :
        httpStatus === 401                 ? 'auth_failed' :
        httpStatus === 404                 ? 'endpoint_not_found' :
        'error';
      report.llm.error  = e.response?.data?.error || e.message;
      report.llm.hint   =
        report.llm.status === 'timeout'            ? 'LLM proxy is slow or overloaded — try again or check provider status' :
        report.llm.status === 'connection_refused'  ? 'LLM proxy is unreachable — check JENGAKIT_LLM_URL or Ollama URL' :
        report.llm.status === 'auth_failed'         ? 'Token rejected — check JENGAKIT_LLM_TOKEN' :
        report.llm.status === 'endpoint_not_found'  ? 'LLM proxy URL path is wrong' :
        'Unexpected error — check the Logs tab for details';
      report.status = 'degraded';
    }
  } else {
    report.llm.status = 'not_configured';
    report.llm.hint   = 'Set JENGAKIT_LLM_URL and JENGAKIT_LLM_TOKEN, or configure a Runtime LLM Override in Settings';
    report.status     = 'degraded';
  }
  res.json(report);
});

// ── Sessions ──────────────────────────────────────────────────────────────────
app.get('/api/sessions', (_req, res) =>
  res.json(Object.entries(sessions).map(([id, msgs]) => ({
    id, message_count: msgs.length,
    last_active: msgs.length ? msgs[msgs.length - 1].ts : null,
  }))));

app.get('/api/sessions/:id/messages', (req, res) =>
  res.json(sessions[req.params.id] || []));

app.delete('/api/sessions/:id', (req, res) => {
  delete sessions[req.params.id];
  addLog('info', `Session cleared: ${req.params.id}`);
  res.json({ ok: true });
});

// ── Memory ────────────────────────────────────────────────────────────────────
app.get('/api/memory', (_req, res) => res.json(memory));

app.post('/api/memory', (req, res) => {
  const { key, value } = req.body || {};
  if (!key || !value) return res.status(400).json({ error: 'key and value required' });
  const existing = memory.find(m => m.key === key);
  if (existing) {
    existing.value = value;
    existing.ts    = new Date().toISOString();
    addLog('info', `Memory updated: ${key}`);
    return res.json(existing);
  }
  const entry = { id: ++_memId, key, value, ts: new Date().toISOString() };
  memory.push(entry);
  addLog('info', `Memory stored: ${key}`);
  res.json(entry);
});

app.delete('/api/memory/:id', (req, res) => {
  const idx = memory.findIndex(m => m.id === parseInt(req.params.id, 10));
  if (idx === -1) return res.status(404).json({ error: 'not found' });
  const [r] = memory.splice(idx, 1);
  addLog('info', `Memory deleted: ${r.key}`);
  res.json({ ok: true });
});

// ── Logs ──────────────────────────────────────────────────────────────────────
app.get('/api/logs', (req, res) => {
  const limit = Math.min(parseInt(req.query.limit || '50', 10), 300);
  res.json(logs.slice(0, limit));
});

// ── Pod public key ─────────────────────────────────────────────────────────────
app.get('/api/ssh/pubkey', async (_req, res) => {
  try {
    const { publicKey } = await db.getOrCreatePodKeypair();
    res.json({ public_key: publicKey });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── SSH Hosts ─────────────────────────────────────────────────────────────────
app.get('/api/ssh/hosts', (_req, res) => {
  res.json(db.listSshHosts());
});

app.post('/api/ssh/hosts', (req, res) => {
  const { label, hostname, port, username } = req.body || {};
  if (!label || !hostname) return res.status(400).json({ error: 'label and hostname required' });
  try {
    const row = db.addSshHost(
      label.trim(), hostname.trim(),
      parseInt(port, 10) || 22,
      (username || 'root').trim()
    );
    addLog('info', `SSH host added: ${label} → ${hostname}`);
    res.json(row);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.delete('/api/ssh/hosts/:id', (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) return res.status(400).json({ error: 'invalid id' });
  db.deleteSshHost(id);
  addLog('info', `SSH host deleted: id=${id}`);
  res.json({ ok: true });
});

// ── SSH Test Connection ───────────────────────────────────────────────────────
app.post('/api/ssh/test', async (req, res) => {
  const { host_id } = req.body || {};
  if (!host_id) return res.status(400).json({ error: 'host_id required' });
  const hosts = db.listSshHosts();
  const host  = hosts.find(h => h.id === parseInt(host_id, 10));
  if (!host) return res.status(404).json({ error: 'host not found' });
  addLog('info', `SSH test connection to ${host.label} (${host.hostname})`);
  try {
    const result = await sshExec({ hostLabel: host.label, command: 'echo ok', addLog });
    if (result.startsWith('Error:')) {
      return res.status(502).json({ error: result });
    }
    res.json({ ok: true, output: result });
  } catch (e) {
    res.status(502).json({ error: e.message });
  }
});

// ── Runtime LLM config ────────────────────────────────────────────────────────
function getEffectiveLlmConfig() {
  const runtimeUrl      = db.getPodConfig('runtime_llm_url');
  const runtimeModel    = db.getPodConfig('runtime_llm_model');
  const runtimeProvider = db.getPodConfig('runtime_llm_provider');
  if (runtimeUrl && runtimeModel) {
    // Ollama direct: POST {url}/api/generate — returns { response: "..." }
    return {
      url:      `${runtimeUrl.replace(/\/$/, '')}/api/generate`,
      token:    LLM_TOKEN || 'runtime',
      model:    runtimeModel,
      provider: runtimeProvider || 'ollama',
      source:   'runtime',
    };
  }
  return { url: LLM_URL, token: LLM_TOKEN, model: null, provider: process.env.JENGAKIT_LLM_PROVIDER || null, source: 'deploy' };
}

// ── Runtime LLM CRUD routes ───────────────────────────────────────────────────
app.get('/api/llm/runtime', (_req, res) => {
  const url      = db.getPodConfig('runtime_llm_url');
  const model    = db.getPodConfig('runtime_llm_model');
  const provider = db.getPodConfig('runtime_llm_provider');
  if (!url) return res.json({ active: false });
  res.json({ active: true, url, model, provider });
});

app.post('/api/llm/runtime', (req, res) => {
  const { url, model, provider } = req.body || {};
  if (!url || !model) return res.status(400).json({ error: 'url and model required' });
  db.setPodConfig('runtime_llm_url',      url.trim());
  db.setPodConfig('runtime_llm_model',    model.trim());
  db.setPodConfig('runtime_llm_provider', (provider || 'ollama').trim());
  addLog('info', `Runtime LLM set: ${provider || 'ollama'} ${model} @ ${url}`);
  res.json({ ok: true, url: url.trim(), model: model.trim(), provider: provider || 'ollama' });
});

app.delete('/api/llm/runtime', (_req, res) => {
  db.setPodConfig('runtime_llm_url',      '');
  db.setPodConfig('runtime_llm_model',    '');
  db.setPodConfig('runtime_llm_provider', '');
  addLog('info', 'Runtime LLM cleared — using deploy-time default');
  res.json({ ok: true });
});

// Test an Ollama URL (fetch available models)
app.post('/api/llm/test', async (req, res) => {
  const { url } = req.body || {};
  if (!url) return res.status(400).json({ error: 'url required' });
  const base = url.trim().replace(/\/$/, '');
  const t0 = Date.now();
  try {
    const r = await axios.get(`${base}/api/tags`, { timeout: 8000 });
    const models = (r.data?.models || []).map(m => m.name || m.model || m).filter(Boolean);
    res.json({ ok: true, latency_ms: Date.now() - t0, models });
  } catch (e) {
    res.status(502).json({ ok: false, error: e.message });
  }
});

// ── Chat (with SSH ReAct loop) ────────────────────────────────────────────────
const SSH_ACTION_RE = /\[SSH_ACTION\]\s*HOST:\s*(.+?)\s*\nCOMMAND:\s*(.+?)\s*\[\/SSH_ACTION\]/is;

async function callLlm(prompt, systemPrompt) {
  const { url, token, model, source } = getEffectiveLlmConfig();
  const body = source === 'runtime'
    ? { model, prompt: systemPrompt ? `${systemPrompt}\n\n${prompt}` : prompt, stream: false }
    : { prompt, system_prompt: systemPrompt };
  const r = await axios.post(
    url,
    body,
    { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      timeout: 60000 }
  );
  return r.data.response || r.data.text || JSON.stringify(r.data);
}

app.post('/api/chat', async (req, res) => {
  const { message, session = 'default' } = req.body || {};
  if (!message) return res.status(400).json({ error: 'message required' });

  const hist = getSession(session);
  hist.push({ role: 'user', content: message, ts: new Date().toISOString() });
  addLog('info', `[${session}] user: ${message.slice(0, 120)}`);

  const { url: chatUrl, token: chatToken } = getEffectiveLlmConfig();
  if (!chatUrl || !chatToken) {
    const reply = [
      `⚠️ No LLM provider connected.`,
      ``,
      `To enable AI responses:`,
      `• Set a **Runtime LLM Override** in the Setup tab (e.g. point to a local Ollama server)`,
      `• Or redeploy with DEPLOY_LLM_API_KEY / JENGAKIT_LLM_URL`,
      ``,
      `Check the **Doctor** tab for diagnostics.`,
    ].join('\n');
    hist.push({ role: 'assistant', content: reply, ts: new Date().toISOString() });
    return res.json({ reply, session });
  }

  // Build base system prompt with memory
  const memCtx = memory.length
    ? '\n\nLong-term memory (use when relevant):\n'
      + memory.map(m => `- ${m.key}: ${m.value}`).join('\n')
    : '';

  // Add SSH context if hosts are configured
  const sshHosts = db.listSshHosts();
  let sshCtx = '';
  if (sshHosts.length > 0) {
    const hostList = sshHosts.map(h => `  - "${h.label}" → ${h.username}@${h.hostname}:${h.port}`).join('\n');
    const autonomyNote = getAutonomy() === 'Supervised'
      ? 'Before running any SSH command, briefly state what you are about to do (one sentence), then immediately use the SSH_ACTION format. Do NOT ask for permission — just announce and execute.'
      : 'Execute SSH commands immediately using the SSH_ACTION format without preamble.';
    sshCtx = `\n\nSSH ACCESS — You can run commands on these hosts:\n${hostList}\n\nWhen the user asks about system state, metrics, logs, or operations on a known host, use this EXACT format (no other text in the same response):\n[SSH_ACTION]\nHOST: <label or hostname>\nCOMMAND: <shell command>\n[/SSH_ACTION]\n\n${autonomyNote}\nAfter receiving command results, always respond in natural language summarising the output.`;
  }

  const systemPrompt = ASST_PERSONA + memCtx + sshCtx;

  const recent  = hist.slice(-7, -1);
  const ctxText = recent.map(m =>
    `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`).join('\n');

  let currentPrompt = ctxText ? `${ctxText}\nUser: ${message}` : message;
  let reply = '';

  try {
    // ReAct loop: max 5 SSH actions before forcing a final answer
    for (let iter = 0; iter < 5; iter++) {
      reply = await callLlm(currentPrompt, systemPrompt);

      const match = SSH_ACTION_RE.exec(reply);
      if (!match) break;  // No SSH intent — reply is final natural language

      const hostLabel = match[1].trim();
      const command   = match[2].trim();

      addLog('info', `[${session}] SSH intent: host="${hostLabel}" cmd="${command}"`);

      // Validate host is in the allowed list
      const knownHost = sshHosts.find(h =>
        h.label.toLowerCase() === hostLabel.toLowerCase() ||
        h.hostname.toLowerCase() === hostLabel.toLowerCase()
      );
      if (!knownHost) {
        currentPrompt += `\nAssistant attempted SSH on unknown host "${hostLabel}" — not in saved list. Please respond without SSH.`;
        continue;
      }

      const sshResult = await sshExec({ hostLabel, command, addLog });

      // Append result and loop for natural language summary
      currentPrompt += `\nAssistant ran: ${command} on ${hostLabel}\nResult:\n\`\`\`\n${sshResult}\n\`\`\`\nNow provide a clear, concise natural language summary of the results without using the SSH_ACTION format.`;
    }

    hist.push({ role: 'assistant', content: reply, ts: new Date().toISOString() });
    addLog('info', `[${session}] assistant: ${reply.slice(0, 120)}`);
    res.json({ reply, session });
  } catch (e) {
    const errMsg = e.response?.data?.error || e.message;
    addLog('error', `LLM: ${errMsg}`);
    const isTimeout = e.message.includes('timeout') || e.code === 'ETIMEDOUT';
    const reply = isTimeout
      ? `⚠️ The LLM took too long to respond. Check the **Doctor** tab — the provider may be overloaded or unavailable.`
      : `⚠️ LLM error: ${errMsg}. Check the **Doctor** tab for details.`;
    hist.push({ role: 'assistant', content: reply, ts: new Date().toISOString() });
    res.json({ reply, session });
  }
});

// ── Telegram webhook ──────────────────────────────────────────────────────────
app.post('/webhook/telegram', async (req, res) => {
  res.json({ ok: true });
  const msg = req.body?.message;
  if (!msg?.text) return;
  addLog('info', `Telegram: ${msg.text.slice(0, 80)}`);
  try {
    const r = await axios.post(`http://localhost:${PORT}/api/chat`,
      { message: msg.text, session: `tg-${msg.chat.id}` });
    const token = process.env.LOBSTER_TELEGRAM_BOT_TOKEN;
    if (token) {
      await axios.post(`https://api.telegram.org/bot${token}/sendMessage`,
        { chat_id: msg.chat.id, text: r.data.reply }, { timeout: 10000 });
    }
  } catch (e) { addLog('error', `Telegram send: ${e.message}`); }
});

// ── Discord interactions ──────────────────────────────────────────────────────
app.post('/webhook/discord', (req, res) => {
  if (req.body?.type === 1) return res.json({ type: 1 });
  res.json({ ok: true });
});

// ── WhatsApp webhook ──────────────────────────────────────────────────────────
app.get('/webhook/whatsapp', (req, res) => {
  const mode      = req.query['hub.mode'];
  const token     = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];
  const expected  = process.env.LOBSTER_WHATSAPP_VERIFY_TOKEN;
  if (mode === 'subscribe' && token === expected) {
    addLog('info', 'WhatsApp webhook verified');
    return res.status(200).send(challenge);
  }
  res.sendStatus(403);
});

app.post('/webhook/whatsapp', async (req, res) => {
  res.sendStatus(200);
  try {
    const entry  = req.body?.entry?.[0];
    const change = entry?.changes?.[0]?.value;
    const msgs   = change?.messages;
    if (!msgs?.length) return;
    const waToken = process.env.LOBSTER_WHATSAPP_TOKEN;
    const phoneId = process.env.LOBSTER_WHATSAPP_PHONE_ID;
    if (!waToken || !phoneId) return;
    for (const msg of msgs) {
      if (msg.type !== 'text') continue;
      const from = msg.from;
      const text = msg.text?.body;
      if (!from || !text) continue;
      addLog('info', `WhatsApp [${from}]: ${text.slice(0, 80)}`);
      const r = await axios.post(`http://localhost:${PORT}/api/chat`,
        { message: text, session: `wa-${from}` });
      await axios.post(
        `https://graph.facebook.com/v20.0/${phoneId}/messages`,
        { messaging_product: 'whatsapp', to: from, type: 'text', text: { body: r.data.reply } },
        { headers: { Authorization: `Bearer ${waToken}`, 'Content-Type': 'application/json' },
          timeout: 10000 }
      );
    }
  } catch (e) { addLog('error', `WhatsApp: ${e.message}`); }
});

// ── 404 ───────────────────────────────────────────────────────────────────────
app.use((req, res) => {
  if (req.path.startsWith('/api/') || req.path.startsWith('/webhook/')) {
    return res.status(404).json({ error: `${req.method} ${req.path} not found` });
  }
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ── Start ─────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  addLog('info', `${ASST_NAME} gateway running on :${PORT}`);
  addLog('info', `LLM: ${LLM_URL || 'not configured'} | token: ${LLM_TOKEN ? 'set' : 'missing'}`);
  addLog('info', `Channels — Telegram: ${process.env.LOBSTER_TELEGRAM_BOT_TOKEN ? 'ON' : 'off'} | Discord: ${process.env.LOBSTER_DISCORD_BOT_TOKEN ? 'ON' : 'off'} | Signal: ${process.env.LOBSTER_SIGNAL_API_URL ? 'ON' : 'off'} | WhatsApp: ${process.env.LOBSTER_WHATSAPP_TOKEN ? 'ON' : 'off'}`);
  addLog('info', `SSH: ${db.listSshHosts().length} host(s) configured`);
});
