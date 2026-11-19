/**
 * Generic inbound-webhook channel skill — first-class in lobster-v2.
 *
 * The escape hatch for anything without a bespoke skill: POST a message, get the
 * agent's answer back inline, and/or have it delivered to a reply_url. Lets any
 * system (a form, a cron, another app, curl) talk to the agent. No core edits.
 *
 * Config (set by the operator in the kit's Integrations/env):
 *   LOBSTER_WEBHOOK_SECRET  — (optional) shared secret; if set, callers must send
 *                             it as `Authorization: Bearer <secret>` or `?token=`
 *
 * Request  (POST /webhook/generic):
 *   { "text": "hello", "reply_url": "https://..." }   // reply_url optional
 * Response (200):
 *   { "text": "the agent's answer" }
 * If reply_url is present, the same { "text": ... } is also POSTed there.
 */
'use strict';

const SECRET = () => process.env.LOBSTER_WEBHOOK_SECRET || '';

// Authorize a request: allowed when no secret is configured, or the bearer /
// ?token matches. Kept pure for testing.
function _checkAuth(req) {
  const want = SECRET();
  if (!want) return true;
  const auth = (req.get && req.get('Authorization')) || (req.headers && req.headers.authorization) || '';
  const bearer = auth.replace(/^Bearer\s+/i, '');
  const q = (req.query && req.query.token) || '';
  return bearer === want || q === want;
}

// Pull the inbound text + optional reply_url out of the body. Returns null when
// there's no usable text.
function _extract(body) {
  const text = body && (body.text || body.message || body.q);
  if (typeof text !== 'string' || !text.trim()) return null;
  const replyUrl = body && typeof body.reply_url === 'string' ? body.reply_url : null;
  return { text: String(text), replyUrl };
}

function register(app, deps) {
  const active = !!SECRET();
  console.log('[webhook] inbound at /webhook/generic ' + (active ? '(secured)' : '(open — set LOBSTER_WEBHOOK_SECRET to require a token)'));

  app.post('/webhook/generic', async (req, res) => {
    if (!_checkAuth(req)) return res.status(401).json({ error: 'unauthorized' });
    const msg = _extract(req.body);
    if (!msg) return res.status(400).json({ error: 'text required' });
    try {
      const result = await deps.runTurn('[via webhook] ' + msg.text);
      res.json({ text: result.text });
      if (msg.replyUrl) {
        try {
          await fetch(msg.replyUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: result.text }) });
        } catch (e) { console.warn('[webhook] reply_url delivery failed', e.message); }
      }
    } catch (e) { res.status(500).json({ error: e.message }); }
  });
}

module.exports = { name: 'webhook', channel: { register }, _checkAuth, _extract };
