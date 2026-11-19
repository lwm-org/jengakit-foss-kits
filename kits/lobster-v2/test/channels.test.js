/* Logic tests for lobster-v2 channel skills: inbound parsing, reply chunking,
 * and cryptographic verification (Discord Ed25519, Slack HMAC) — all via each
 * skill's pure exported helpers, no network. Run: node channels.test.js */
'use strict';
const assert = require('assert');
const crypto = require('crypto');

const telegram = require('../templates/skills/telegram/skill.js');
const discord = require('../templates/skills/discord/skill.js');
const slack = require('../templates/skills/slack/skill.js');
const webhook = require('../templates/skills/webhook/skill.js');
const manage = require('../templates/skills/manage-channels/skill.js');

let n = 0; const test = (name, fn) => { fn(); n++; };

// ── Telegram ──────────────────────────────────────────────────────────────
test('telegram: extracts chat id + text from a message update', () => {
  const got = telegram._extract({ message: { chat: { id: 42 }, text: 'hi there' } });
  assert.deepStrictEqual(got, { chatId: 42, text: 'hi there' });
});
test('telegram: ignores non-text / empty updates', () => {
  assert.strictEqual(telegram._extract({ message: { chat: { id: 1 } } }), null);
  assert.strictEqual(telegram._extract({ my_chat_member: {} }), null);
  assert.strictEqual(telegram._extract({ message: { chat: { id: 1 }, text: '   ' } }), null);
});
test('telegram: chunks long replies under the 4096 cap', () => {
  const parts = telegram._chunk('x'.repeat(9000), 4096);
  assert.ok(parts.length >= 3);
  parts.forEach((p) => assert.ok(p.length <= 4096));
  assert.strictEqual(parts.join('').replace(/\s/g, '').length, 9000);
});

// ── Discord ───────────────────────────────────────────────────────────────
test('discord: Ed25519 signature verifies (and rejects tampering)', () => {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
  const jwk = publicKey.export({ format: 'jwk' });
  const pubHex = Buffer.from(jwk.x, 'base64url').toString('hex');
  const ts = '1700000000';
  const body = JSON.stringify({ type: 2, data: { name: 'ask', options: [{ name: 'message', value: 'yo' }] } });
  const sig = crypto.sign(null, Buffer.concat([Buffer.from(ts), Buffer.from(body)]), privateKey).toString('hex');
  assert.strictEqual(discord._verifySig(pubHex, ts, Buffer.from(body), sig), true);
  assert.strictEqual(discord._verifySig(pubHex, ts, Buffer.from(body + 'x'), sig), false, 'tampered body must fail');
  assert.strictEqual(discord._verifySig(pubHex, '1700000001', Buffer.from(body), sig), false, 'wrong ts must fail');
});
test('discord: extracts the command message option', () => {
  assert.strictEqual(discord._extract({ type: 2, data: { options: [{ name: 'message', value: 'hello' }] } }), 'hello');
  assert.strictEqual(discord._extract({ type: 1 }), null, 'PING is not a command');
  assert.strictEqual(discord._extract({ type: 2, data: { options: [] } }), null);
});

// ── Slack ─────────────────────────────────────────────────────────────────
test('slack: HMAC signature verifies (and rejects tampering / stale ts)', () => {
  const secret = 'shh';
  const ts = '1700000000';
  const raw = JSON.stringify({ type: 'event_callback', event: { type: 'message', channel: 'C1', text: 'hi' } });
  const sig = 'v0=' + crypto.createHmac('sha256', secret).update('v0:' + ts + ':' + raw).digest('hex');
  assert.strictEqual(slack._verifySlack(secret, ts, Buffer.from(raw), sig, Number(ts)), true);
  assert.strictEqual(slack._verifySlack(secret, ts, Buffer.from(raw + 'x'), sig, Number(ts)), false, 'tamper fails');
  assert.strictEqual(slack._verifySlack(secret, ts, Buffer.from(raw), sig, Number(ts) + 999), false, 'stale ts fails');
});
test('slack: extracts a real message, ignores bot/subtyped events', () => {
  assert.deepStrictEqual(
    slack._extractEvent({ type: 'event_callback', event: { type: 'message', channel: 'C1', text: 'hey' } }),
    { channel: 'C1', text: 'hey' });
  assert.strictEqual(slack._extractEvent({ type: 'event_callback', event: { type: 'message', bot_id: 'B1', channel: 'C1', text: 'x' } }), null);
  assert.strictEqual(slack._extractEvent({ type: 'event_callback', event: { type: 'message', subtype: 'channel_join', channel: 'C1', text: 'x' } }), null);
});

// ── Generic webhook ───────────────────────────────────────────────────────
test('webhook: auth open when no secret, gated when set', () => {
  const noSecret = { get: () => '', query: {}, headers: {} };
  assert.strictEqual(webhook._checkAuth(noSecret), true);
  process.env.LOBSTER_WEBHOOK_SECRET = 'tok';
  assert.strictEqual(webhook._checkAuth({ get: (k) => (k === 'Authorization' ? 'Bearer tok' : ''), query: {} }), true);
  assert.strictEqual(webhook._checkAuth({ get: () => '', query: { token: 'tok' } }), true);
  assert.strictEqual(webhook._checkAuth({ get: () => '', query: { token: 'nope' }, headers: {} }), false);
  delete process.env.LOBSTER_WEBHOOK_SECRET;
});
test('webhook: extracts text + optional reply_url', () => {
  assert.deepStrictEqual(webhook._extract({ text: 'hi', reply_url: 'https://x' }), { text: 'hi', replyUrl: 'https://x' });
  assert.deepStrictEqual(webhook._extract({ message: 'yo' }), { text: 'yo', replyUrl: null });
  assert.strictEqual(webhook._extract({ text: '  ' }), null);
});

// ── manage-channels ───────────────────────────────────────────────────────
test('manage-channels: reports active/inactive from an env map', () => {
  const rows = manage._status({ LOBSTER_TELEGRAM_TOKEN: 'x' });
  const tg = rows.find((r) => r.name === 'telegram');
  const wa = rows.find((r) => r.name === 'whatsapp');
  const gw = rows.find((r) => r.name === 'webhook');
  assert.strictEqual(tg.active, true);
  assert.strictEqual(wa.active, false);
  assert.deepStrictEqual(wa.missing, ['LOBSTER_WHATSAPP_TOKEN', 'LOBSTER_WHATSAPP_PHONE_ID']);
  assert.strictEqual(gw.active, true, 'generic webhook is always on');
  assert.ok(/telegram.*ACTIVE/.test(manage._format(rows)));
});

test('manage-channels: every status row carries a webhook path (settings UI depends on it)', () => {
  const rows = manage._status({});
  assert.ok(rows.length >= 5);
  rows.forEach((r) => {
    assert.strictEqual(typeof r.webhook, 'string');
    assert.ok(r.webhook.indexOf('/webhook/') === 0, r.name + ' has a /webhook/ path');
    assert.ok(Array.isArray(r.missing));
  });
});

console.log('lobster-v2 channels: ' + n + ' tests passed');
