/**
 * Telegram channel skill (Bot API webhook) — first-class in lobster-v2.
 *
 * Self-contained: registers its own webhook, funnels every inbound text message
 * through the shared agent (deps.runTurn), then replies via the Bot API. No core
 * edits — dropping this folder in wires Telegram up (nanoclaw's skill model).
 *
 * Config (set by the operator in the kit's Integrations/env):
 *   LOBSTER_TELEGRAM_TOKEN   — bot token from @BotFather
 *   LOBSTER_TELEGRAM_SECRET  — (optional) secret token you set when calling
 *                              setWebhook; checked against the
 *                              X-Telegram-Bot-Api-Secret-Token request header
 * Register the webhook once (replace <TOKEN>/<HOST>/<SECRET>):
 *   curl "https://api.telegram.org/bot<TOKEN>/setWebhook?url=https://<HOST>/webhook/telegram&secret_token=<SECRET>"
 */
'use strict';

const TOKEN = () => process.env.LOBSTER_TELEGRAM_TOKEN || '';
const SECRET = () => process.env.LOBSTER_TELEGRAM_SECRET || '';
const API = process.env.LOBSTER_TELEGRAM_API || 'https://api.telegram.org';
const LIMIT = 4096; // Telegram's per-message character cap.

// Pull the chat id + text out of a Telegram Update (message or edited_message).
function _extract(update) {
  const m = (update && (update.message || update.edited_message)) || null;
  if (!m || typeof m.text !== 'string' || !m.text.trim()) return null;
  const chatId = m.chat && m.chat.id;
  if (chatId == null) return null;
  return { chatId, text: m.text };
}

// Split a reply into <=LIMIT-char chunks on line/space boundaries where possible.
function _chunk(text, limit = LIMIT) {
  const s = String(text || '');
  if (s.length <= limit) return s ? [s] : [];
  const out = [];
  let rest = s;
  while (rest.length > limit) {
    let cut = rest.lastIndexOf('\n', limit);
    if (cut < limit * 0.5) cut = rest.lastIndexOf(' ', limit);
    if (cut < limit * 0.5) cut = limit;
    out.push(rest.slice(0, cut));
    rest = rest.slice(cut).replace(/^\s+/, '');
  }
  if (rest) out.push(rest);
  return out;
}

async function sendText(chatId, body) {
  if (!TOKEN()) { console.warn('[telegram] not configured — dropping reply'); return; }
  for (const part of _chunk(body)) {
    try {
      const r = await fetch(API + '/bot' + TOKEN() + '/sendMessage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, text: part }),
      });
      if (!r.ok) console.warn('[telegram] send failed', r.status, (await r.text()).slice(0, 200));
    } catch (e) { console.warn('[telegram] send error', e.message); }
  }
}

function register(app, deps) {
  const active = !!TOKEN();
  console.log('[telegram] webhook at /webhook/telegram ' + (active ? '(active)' : '(inactive — set LOBSTER_TELEGRAM_TOKEN)'));

  app.post('/webhook/telegram', async (req, res) => {
    // Optional shared-secret check (Telegram echoes the secret_token header).
    if (SECRET() && req.get('X-Telegram-Bot-Api-Secret-Token') !== SECRET()) return res.sendStatus(403);
    res.sendStatus(200); // ack fast; Telegram retries on non-2xx
    try {
      const msg = _extract(req.body);
      if (!msg) return;
      const result = await deps.runTurn('[via Telegram] ' + msg.text);
      await sendText(msg.chatId, result.text);
    } catch (err) { console.warn('[telegram] inbound error', err.message); }
  });
}

module.exports = { name: 'telegram', channel: { register }, _extract, _chunk, _sendText: sendText };
