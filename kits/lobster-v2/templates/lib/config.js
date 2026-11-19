/**
 * config.js — runtime configuration for lobster-v2.
 *
 * Every user-facing setting (autonomy, model provider, messaging channels,
 * integrations, SSH) is configured AT RUNTIME from inside the running instance's
 * Settings UI, and persisted in the app's OWN database via jengakit_db. A user
 * NEVER has to set an env var, edit a .env, pass a compose flag, or fill a deploy
 * form: the container needs nothing but the Docker engine to boot, and everything
 * else is turned on from the web UI by an admin.
 *
 * Mechanism: settings live in a `config` table. At boot we seed process.env from
 * that table; when an admin saves a setting we write the table AND update
 * process.env in-process. The channels, provider, and tool code all read
 * process.env lazily, so a change takes effect on the very next message — no
 * restart. LOBSTER_* env vars, if present at first boot, only SEED an initial
 * value (backward-compat for older deploys); the database is the source of truth
 * thereafter.
 *
 * Adding a setting = adding a row to FIELDS. `secret:true` values are write-only
 * over the API (reads report only whether a value is set, never the value).
 */
'use strict';

const FIELDS = [
  { key: 'LOBSTER_AUTONOMY', group: 'runtime', label: 'Tool autonomy', type: 'select', options: ['readonly', 'supervised', 'auto'], default: 'supervised', help: 'How freely the assistant may run side-effecting tools.' },

  { key: 'LOBSTER_PROVIDER', group: 'provider', label: 'Model provider', type: 'select', options: ['platform', 'ollama', 'openai-compatible'], default: 'platform', help: 'Where completions run. "platform" uses the built-in model.' },
  { key: 'LOBSTER_OLLAMA_URL', group: 'provider', label: 'Ollama URL', type: 'text', placeholder: 'http://host.docker.internal:11434' },
  { key: 'LOBSTER_OLLAMA_MODEL', group: 'provider', label: 'Ollama model', type: 'text', placeholder: 'llama3.1' },
  { key: 'LOBSTER_OPENAI_BASE_URL', group: 'provider', label: 'OpenAI-compatible base URL', type: 'text', placeholder: 'https://openrouter.ai/api/v1' },
  { key: 'LOBSTER_OPENAI_API_KEY', group: 'provider', label: 'OpenAI-compatible API key', type: 'text', secret: true },
  { key: 'LOBSTER_OPENAI_MODEL', group: 'provider', label: 'OpenAI-compatible model', type: 'text', placeholder: 'gpt-4o-mini' },

  { key: 'LOBSTER_WHATSAPP_TOKEN', group: 'channels', label: 'WhatsApp Cloud API token', type: 'text', secret: true },
  { key: 'LOBSTER_WHATSAPP_PHONE_ID', group: 'channels', label: 'WhatsApp phone number ID', type: 'text' },
  { key: 'LOBSTER_WHATSAPP_VERIFY_TOKEN', group: 'channels', label: 'WhatsApp webhook verify token', type: 'text', placeholder: 'lobster' },
  { key: 'LOBSTER_TELEGRAM_TOKEN', group: 'channels', label: 'Telegram bot token', type: 'text', secret: true },
  { key: 'LOBSTER_TELEGRAM_SECRET', group: 'channels', label: 'Telegram webhook secret (optional)', type: 'text' },
  { key: 'LOBSTER_DISCORD_PUBLIC_KEY', group: 'channels', label: 'Discord application public key', type: 'text' },
  { key: 'LOBSTER_DISCORD_APP_ID', group: 'channels', label: 'Discord application (client) ID', type: 'text' },
  { key: 'LOBSTER_SLACK_BOT_TOKEN', group: 'channels', label: 'Slack bot token (xoxb-)', type: 'text', secret: true },
  { key: 'LOBSTER_SLACK_SIGNING_SECRET', group: 'channels', label: 'Slack signing secret', type: 'text', secret: true },
  { key: 'LOBSTER_WEBHOOK_SECRET', group: 'channels', label: 'Generic webhook secret (optional)', type: 'text', secret: true },

  { key: 'LOBSTER_OPENDESIGN_URL', group: 'integrations', label: 'Open-Design editor URL', type: 'text', placeholder: 'https://design.example.com', help: 'Connect an open-design editor (github.com/clawnify/open-design).' },

  { key: 'LOBSTER_SSH_HOSTS', group: 'ssh', label: 'SSH host allowlist', type: 'text', placeholder: 'web=deploy@10.0.0.5,box', help: 'Enables the ssh tool. Comma-separated allowlist.' },
  { key: 'LOBSTER_SSH_USER', group: 'ssh', label: 'SSH default user', type: 'text', placeholder: 'root' },
  { key: 'LOBSTER_SSH_KEY', group: 'ssh', label: 'SSH private key (PEM)', type: 'textarea', secret: true },
  { key: 'LOBSTER_SSH_PASSWORD', group: 'ssh', label: 'SSH password (if not using a key)', type: 'text', secret: true },
];

const BY_KEY = {};
FIELDS.forEach((f) => { BY_KEY[f.key] = f; });

const GROUPS = [
  { id: 'runtime', label: 'Runtime' },
  { id: 'provider', label: 'Model provider' },
  { id: 'channels', label: 'Channels' },
  { id: 'integrations', label: 'Integrations' },
  { id: 'ssh', label: 'SSH' },
];

async function ensure(db) {
  await db.exec('CREATE TABLE IF NOT EXISTS config (k TEXT PRIMARY KEY, v TEXT, updated_at TEXT DEFAULT CURRENT_TIMESTAMP)');
}

// Seed process.env from the DB so the (env-reading) channels/provider/tools see
// runtime config. A stored value overrides an inherited env value. Boot-once.
async function load(db) {
  await ensure(db);
  let rows = [];
  try { rows = await db.query('SELECT k, v FROM config'); } catch (e) { rows = []; }
  rows.forEach((r) => { if (BY_KEY[r.k] && r.v != null && r.v !== '') process.env[r.k] = r.v; });
  return rows.length;
}

// Persist + apply one setting immediately (no restart). Empty value clears it.
async function set(db, key, value) {
  if (!BY_KEY[key]) throw new Error('unknown setting: ' + key);
  const v = value == null ? '' : String(value);
  await ensure(db);
  await db.run(
    'INSERT INTO config (k, v, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP) ON CONFLICT(k) DO UPDATE SET v = excluded.v, updated_at = CURRENT_TIMESTAMP',
    [key, v]);
  if (v === '') delete process.env[key]; else process.env[key] = v;
  return { key: key, set: v !== '' };
}

// Apply many settings; skips unknown keys. Returns the applied keys.
async function setMany(db, updates) {
  const applied = [];
  for (const key of Object.keys(updates || {})) {
    if (!BY_KEY[key]) continue;
    await set(db, key, updates[key]);
    applied.push(key);
  }
  return applied;
}

// The admin-facing view of current config: secrets masked to a boolean `set`,
// non-secrets carry their value. Grouped for the Settings UI.
function publicView(env = process.env) {
  const fields = FIELDS.map((f) => {
    const raw = env[f.key] || '';
    const base = { key: f.key, group: f.group, label: f.label, type: f.type, secret: !!f.secret, set: !!raw };
    if (f.options) base.options = f.options;
    if (f.placeholder) base.placeholder = f.placeholder;
    if (f.help) base.help = f.help;
    base.value = f.secret ? '' : raw;
    return base;
  });
  return { groups: GROUPS, fields: fields };
}

module.exports = { FIELDS, GROUPS, ensure, load, set, setMany, publicView, _byKey: BY_KEY };
