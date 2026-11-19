/**
 * manage-providers operational skill — a read-only `provider` tool that reports
 * which model provider the agent is using (the platform SDK by default, or an
 * env-selected Ollama / OpenAI-compatible endpoint) and how to switch. Mirrors
 * manage-channels. Ships zero infra code — it only reads the provider config.
 */
'use strict';

const { resolveProvider } = require('../../lib/providers');

function _format(cfg) {
  const lines = [
    'Active model provider: ' + cfg.name,
    '  model: ' + (cfg.model || '(default)'),
    '  endpoint: ' + (cfg.url || '(default)'),
  ];
  lines.push('\nSwitch provider with env (then restart):');
  lines.push('- platform (default): unset LOBSTER_PROVIDER — uses the platform LLM SDK');
  lines.push('- ollama: LOBSTER_PROVIDER=ollama, LOBSTER_OLLAMA_URL, LOBSTER_OLLAMA_MODEL');
  lines.push('- openai-compatible: LOBSTER_PROVIDER=openai-compatible, LOBSTER_OPENAI_BASE_URL, LOBSTER_OPENAI_API_KEY, LOBSTER_OPENAI_MODEL');
  return lines.join('\n');
}

const tool = {
  name: 'provider',
  description: 'Report which LLM provider the assistant is using (platform, ollama, or openai-compatible) and how to switch. Args: {} (no arguments).',
  run: async () => _format(resolveProvider(process.env)),
};

module.exports = { name: 'manage-providers', tools: [tool], _format };
