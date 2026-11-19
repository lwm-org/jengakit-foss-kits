/**
 * Discord channel skill (Interactions endpoint) — first-class in lobster-v2.
 *
 * Discord delivers slash-command interactions over HTTPS, signed with Ed25519.
 * This skill verifies the signature with Node's built-in crypto (no extra deps),
 * answers the PING handshake, and for a command DEFERS immediately (Discord
 * requires a response within 3s) then edits the deferred reply once the agent
 * finishes via the interaction-token follow-up webhook. No bot token or gateway
 * connection needed. No core edits (nanoclaw's skill model).
 *
 * Config (set by the operator in the kit's Integrations/env):
 *   LOBSTER_DISCORD_PUBLIC_KEY  — the application's Ed25519 public key (hex)
 *   LOBSTER_DISCORD_APP_ID      — the application (client) ID, for follow-ups
 * In the Discord Developer Portal set the Interactions Endpoint URL to
 *   https://<your-app>/webhook/discord
 * and register a command (e.g. /ask) with a single "message" string option.
 */
'use strict';

const crypto = require('crypto');

const PUBLIC_KEY = () => process.env.LOBSTER_DISCORD_PUBLIC_KEY || '';
const APP_ID = () => process.env.LOBSTER_DISCORD_APP_ID || '';
const API = process.env.LOBSTER_DISCORD_API || 'https://discord.com/api/v10';
const LIMIT = 2000; // Discord message content cap.

// Interaction / response type constants (Discord API).
const T = { PING: 1, COMMAND: 2, PONG: 1, DEFER: 5, EDIT_FOLLOWUP: 4 };

// Verify the Ed25519 signature over (timestamp + rawBody) using the app key.
function _verifySig(publicKeyHex, timestamp, rawBody, sigHex) {
  try {
    if (!publicKeyHex || !timestamp || !sigHex) return false;
    const key = crypto.createPublicKey({
      key: Buffer.concat([
        Buffer.from('302a300506032b6570032100', 'hex'), // DER SPKI prefix for Ed25519
        Buffer.from(publicKeyHex, 'hex'),
      ]),
      format: 'der', type: 'spki',
    });
    const msg = Buffer.concat([Buffer.from(String(timestamp)), Buffer.from(rawBody)]);
    return crypto.verify(null, msg, key, Buffer.from(sigHex, 'hex'));
  } catch (e) { return false; }
}

// Pull the user's text out of a command interaction (first string option, or the
// "message" option by name). Returns null for non-command / empty.
function _extract(body) {
  if (!body || body.type !== T.COMMAND || !body.data) return null;
  const opts = body.data.options || [];
  const named = opts.find((o) => o.name === 'message' || o.name === 'prompt' || o.name === 'q');
  const first = opts.find((o) => typeof o.value === 'string' && o.value.trim());
  const text = (named && named.value) || (first && first.value) || '';
  return text && text.trim() ? String(text) : null;
}

async function followup(token, content) {
  if (!APP_ID() || !token) { console.warn('[discord] no app id / token — cannot follow up'); return; }
  try {
    const r = await fetch(API + '/webhooks/' + APP_ID() + '/' + token + '/messages/@original', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: String(content || '').slice(0, LIMIT) }),
    });
    if (!r.ok) console.warn('[discord] followup failed', r.status, (await r.text()).slice(0, 200));
  } catch (e) { console.warn('[discord] followup error', e.message); }
}

function register(app, deps) {
  const active = !!PUBLIC_KEY();
  console.log('[discord] interactions at /webhook/discord ' + (active ? '(active)' : '(inactive — set LOBSTER_DISCORD_PUBLIC_KEY)'));

  app.post('/webhook/discord', async (req, res) => {
    const sig = req.get('X-Signature-Ed25519');
    const ts = req.get('X-Signature-Timestamp');
    const raw = req.rawBody || Buffer.from(JSON.stringify(req.body || {}));
    if (!_verifySig(PUBLIC_KEY(), ts, raw, sig)) return res.status(401).send('invalid signature');

    const body = req.body || {};
    if (body.type === T.PING) return res.json({ type: T.PONG });

    const text = _extract(body);
    if (!text) return res.json({ type: T.EDIT_FOLLOWUP, data: { content: 'Send a message with the command.' } });

    // Defer now (beats the 3s deadline), answer via the interaction-token webhook.
    res.json({ type: T.DEFER });
    (async () => {
      try {
        const result = await deps.runTurn('[via Discord] ' + text);
        await followup(body.token, result.text);
      } catch (err) { console.warn('[discord] inbound error', err.message); await followup(body.token, 'Something went wrong.'); }
    })();
  });
}

module.exports = { name: 'discord', channel: { register }, _verifySig, _extract, T };
