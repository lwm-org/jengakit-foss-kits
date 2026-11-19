/**
 * manage-channels operational skill — a TOOL (not a channel) that lets the agent
 * report which messaging channels are wired up and how to turn each on/off.
 * Mirrors nanoclaw's manage-channels skill, adapted to a single-container kit.
 *
 * Channels are enabled purely by presence of their config env vars (and a pod
 * restart, since each channel registers its webhook route at boot). This tool is
 * read-only: it reports status and the exact env to set/clear. It ships ZERO
 * infra code — it only inspects process.env.
 */
'use strict';

// Declarative registry: the env var(s) that must be set for each channel to be
// active. Kept next to the channel skills so adding a channel means adding a row.
const CHANNELS = [
  { name: 'whatsapp', requires: ['LOBSTER_WHATSAPP_TOKEN', 'LOBSTER_WHATSAPP_PHONE_ID'], webhook: '/webhook/whatsapp' },
  { name: 'telegram', requires: ['LOBSTER_TELEGRAM_TOKEN'], webhook: '/webhook/telegram' },
  { name: 'discord', requires: ['LOBSTER_DISCORD_PUBLIC_KEY'], webhook: '/webhook/discord' },
  { name: 'slack', requires: ['LOBSTER_SLACK_BOT_TOKEN', 'LOBSTER_SLACK_SIGNING_SECRET'], webhook: '/webhook/slack' },
  { name: 'webhook', requires: [], webhook: '/webhook/generic', note: 'always on; set LOBSTER_WEBHOOK_SECRET to require a token' },
];

// Pure status computation over an env map — testable without process.env.
function _status(env) {
  return CHANNELS.map((c) => {
    const missing = c.requires.filter((k) => !env[k]);
    return {
      name: c.name,
      webhook: c.webhook,
      active: missing.length === 0,
      missing,
      note: c.note || '',
    };
  });
}

function _format(rows) {
  const lines = rows.map((r) => {
    const state = r.active ? 'ACTIVE' : 'inactive';
    const how = r.active
      ? (r.note ? ' — ' + r.note : '')
      : ' — set ' + r.missing.join(' + ') + ' and restart';
    return '- ' + r.name + ' (' + r.webhook + '): ' + state + how;
  });
  return 'Channels:\n' + lines.join('\n') +
    '\n\nTo disable a channel, clear its env var(s) and restart. Config lives in the kit\'s Integrations/env.';
}

const tool = {
  name: 'channels',
  description: 'List the messaging channels (WhatsApp, Telegram, Discord, Slack, generic webhook), whether each is active, and how to enable or disable it. Args: {} (no arguments).',
  run: async () => _format(_status(process.env)),
};

module.exports = { name: 'manage-channels', tools: [tool], _status, _format, CHANNELS };
