/**
 * WhatsApp channel skill (Meta WhatsApp Cloud API) — first-class in lobster-v2.
 *
 * A self-contained channel skill: it registers its own webhook (verify + inbound)
 * and funnels every inbound message through the shared agent via deps.runTurn,
 * then replies over the Graph API. No core edits — dropping this folder in wires
 * WhatsApp up (nanoclaw's skill model).
 *
 * Config (set by the operator in the kit's Integrations/env):
 *   LOBSTER_WHATSAPP_TOKEN         — Graph API access token
 *   LOBSTER_WHATSAPP_PHONE_ID      — WhatsApp business phone number ID
 *   LOBSTER_WHATSAPP_VERIFY_TOKEN  — webhook verify token (you choose it)
 * Webhook URL to register in Meta: https://<your-app>/webhook/whatsapp
 */
'use strict';

const TOKEN = () => process.env.LOBSTER_WHATSAPP_TOKEN || '';
const PHONE_ID = () => process.env.LOBSTER_WHATSAPP_PHONE_ID || '';
const VERIFY = () => process.env.LOBSTER_WHATSAPP_VERIFY_TOKEN || 'lobster';
const GRAPH = process.env.LOBSTER_WHATSAPP_GRAPH || 'https://graph.facebook.com/v20.0';

async function sendText(to, body) {
  if (!TOKEN() || !PHONE_ID()) { console.warn('[whatsapp] not configured — dropping reply'); return; }
  try {
    const r = await fetch(GRAPH + '/' + PHONE_ID() + '/messages', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + TOKEN(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ messaging_product: 'whatsapp', to, type: 'text', text: { body: String(body).slice(0, 4000) } }),
    });
    if (!r.ok) console.warn('[whatsapp] send failed', r.status, (await r.text()).slice(0, 200));
  } catch (e) { console.warn('[whatsapp] send error', e.message); }
}

function register(app, deps) {
  const active = !!(TOKEN() && PHONE_ID());
  console.log('[whatsapp] webhook at /webhook/whatsapp ' + (active ? '(active)' : '(inactive — set LOBSTER_WHATSAPP_TOKEN + _PHONE_ID)'));

  // Meta webhook verification handshake.
  app.get('/webhook/whatsapp', (req, res) => {
    const q = req.query || {};
    if (q['hub.mode'] === 'subscribe' && q['hub.verify_token'] === VERIFY()) return res.status(200).send(q['hub.challenge']);
    return res.sendStatus(403);
  });

  // Inbound messages → agent → reply.
  app.post('/webhook/whatsapp', async (req, res) => {
    res.sendStatus(200); // ack fast (Meta retries otherwise)
    try {
      const entries = ((req.body && req.body.entry) || []);
      for (const e of entries) {
        for (const ch of (e.changes || [])) {
          const val = ch.value || {};
          for (const m of (val.messages || [])) {
            if (m.type !== 'text' || !m.text) continue;
            const from = m.from, text = m.text.body || '';
            const result = await deps.runTurn('[via WhatsApp] ' + text);
            await sendText(from, result.text);
          }
        }
      }
    } catch (err) { console.warn('[whatsapp] inbound error', err.message); }
  });
}

module.exports = { name: 'whatsapp', channel: { register }, _sendText: sendText };
