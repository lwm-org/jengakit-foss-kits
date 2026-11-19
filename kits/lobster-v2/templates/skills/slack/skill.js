/**
 * Slack channel skill (Events API) — first-class in lobster-v2.
 *
 * Registers the Slack Events endpoint: answers the one-time url_verification
 * challenge, verifies every request's HMAC-SHA256 signature against the signing
 * secret, and for each inbound message event funnels the text through the shared
 * agent (deps.runTurn) then replies via chat.postMessage. Acks within Slack's 3s
 * budget and posts the answer asynchronously. No core edits (nanoclaw's model).
 *
 * Config (set by the operator in the kit's Integrations/env):
 *   LOBSTER_SLACK_BOT_TOKEN        — xoxb- bot token (chat:write scope)
 *   LOBSTER_SLACK_SIGNING_SECRET   — app signing secret (verifies requests)
 * In the Slack app: Event Subscriptions → Request URL https://<your-app>/webhook/slack,
 * subscribe to message.channels / message.im, and add the bot to the channel.
 */
'use strict';

const crypto = require('crypto');

const BOT_TOKEN = () => process.env.LOBSTER_SLACK_BOT_TOKEN || '';
const SIGNING = () => process.env.LOBSTER_SLACK_SIGNING_SECRET || '';
const API = process.env.LOBSTER_SLACK_API || 'https://slack.com/api';
const MAX_SKEW = 300; // seconds; reject replayed/stale requests.

// Verify Slack's v0 HMAC signature over `v0:<timestamp>:<rawBody>`.
function _verifySlack(signingSecret, timestamp, rawBody, signature, nowSec) {
  try {
    if (!signingSecret || !timestamp || !signature) return false;
    const now = nowSec != null ? nowSec : Math.floor(Date.now() / 1000);
    if (Math.abs(now - Number(timestamp)) > MAX_SKEW) return false;
    const base = 'v0:' + timestamp + ':' + (Buffer.isBuffer(rawBody) ? rawBody.toString('utf8') : String(rawBody));
    const mac = 'v0=' + crypto.createHmac('sha256', signingSecret).update(base).digest('hex');
    const a = Buffer.from(mac), b = Buffer.from(String(signature));
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  } catch (e) { return false; }
}

// Pull {channel, text} out of an event_callback message event. Ignores bot
// messages, edits, and subtyped (join/leave/etc.) events. Returns null otherwise.
function _extractEvent(body) {
  if (!body || body.type !== 'event_callback' || !body.event) return null;
  const e = body.event;
  if (e.type !== 'message' && e.type !== 'app_mention') return null;
  if (e.subtype || e.bot_id) return null; // skip bot/system messages (prevents loops)
  if (typeof e.text !== 'string' || !e.text.trim()) return null;
  if (!e.channel) return null;
  return { channel: e.channel, text: e.text };
}

async function postMessage(channel, text) {
  if (!BOT_TOKEN()) { console.warn('[slack] not configured — dropping reply'); return; }
  try {
    const r = await fetch(API + '/chat.postMessage', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + BOT_TOKEN(), 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify({ channel, text: String(text || '').slice(0, 39000) }),
    });
    const j = await r.json().catch(() => ({}));
    if (!j.ok) console.warn('[slack] postMessage failed', j.error || r.status);
  } catch (e) { console.warn('[slack] send error', e.message); }
}

function register(app, deps) {
  const active = !!(BOT_TOKEN() && SIGNING());
  console.log('[slack] events at /webhook/slack ' + (active ? '(active)' : '(inactive — set LOBSTER_SLACK_BOT_TOKEN + _SIGNING_SECRET)'));

  app.post('/webhook/slack', async (req, res) => {
    const sig = req.get('X-Slack-Signature');
    const ts = req.get('X-Slack-Request-Timestamp');
    const raw = req.rawBody || Buffer.from(JSON.stringify(req.body || {}));
    if (SIGNING() && !_verifySlack(SIGNING(), ts, raw, sig)) return res.status(401).send('bad signature');

    const body = req.body || {};
    if (body.type === 'url_verification') return res.json({ challenge: body.challenge });

    res.sendStatus(200); // ack within 3s; process async (Slack retries on non-2xx)
    try {
      const msg = _extractEvent(body);
      if (!msg) return;
      const result = await deps.runTurn('[via Slack] ' + msg.text);
      await postMessage(msg.channel, result.text);
    } catch (err) { console.warn('[slack] inbound error', err.message); }
  });
}

module.exports = { name: 'slack', channel: { register }, _verifySlack, _extractEvent, _postMessage: postMessage };
