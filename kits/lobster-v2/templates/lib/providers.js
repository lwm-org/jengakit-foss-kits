/**
 * providers.js — the model-provider abstraction for lobster-v2.
 *
 * The agent talks to ONE completion interface: callLLM(prompt, systemPrompt).
 * By default that's the vendored platform SDK (jengakit_llm — the platform proxy
 * or a direct key), which we never edit. This module lets an operator point the
 * SAME agent at an alternate endpoint purely via env, WITHOUT hardcoding any key
 * or URL in the kit:
 *
 *   LOBSTER_PROVIDER=platform            (default) → jengakit_llm.callLLM
 *   LOBSTER_PROVIDER=ollama              → a local/self-hosted Ollama server
 *     LOBSTER_OLLAMA_URL   (default http://host.docker.internal:11434)
 *     LOBSTER_OLLAMA_MODEL (default llama3.1)
 *   LOBSTER_PROVIDER=openai-compatible   → any OpenAI-shaped /chat/completions
 *     LOBSTER_OPENAI_BASE_URL  (e.g. https://openrouter.ai/api/v1, LM Studio, …)
 *     LOBSTER_OPENAI_API_KEY   (optional for keyless local servers)
 *     LOBSTER_OPENAI_MODEL     (e.g. gpt-4o-mini, meta-llama/llama-3.1-8b-instruct)
 *
 * Doctrine: this is kit code, not platform internals — it only reads env and
 * speaks vendor-neutral HTTP. Adding a provider is adding a case here.
 */
'use strict';

const { callLLM } = require('./jengakit_llm');

// Describe the active provider from an env map (pure — no I/O). Returns
// { name, model, url } for display/selection; the call fn is built separately.
function resolveProvider(env = process.env) {
  const p = (env.LOBSTER_PROVIDER || 'platform').toLowerCase();
  if (p === 'ollama') {
    return { name: 'ollama', url: env.LOBSTER_OLLAMA_URL || 'http://host.docker.internal:11434', model: env.LOBSTER_OLLAMA_MODEL || 'llama3.1' };
  }
  if (p === 'openai-compatible' || p === 'openai') {
    return { name: 'openai-compatible', url: env.LOBSTER_OPENAI_BASE_URL || '', model: env.LOBSTER_OPENAI_MODEL || 'gpt-4o-mini', keyed: !!env.LOBSTER_OPENAI_API_KEY };
  }
  return { name: 'platform', url: env.JENGAKIT_LLM_URL || '(direct/proxy via jengakit_llm)', model: env.JENGAKIT_LLM_MODEL || 'gemini-2.5-flash' };
}

async function _ollama(prompt, systemPrompt, cfg) {
  try {
    const r = await fetch(cfg.url.replace(/\/$/, '') + '/api/generate', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: cfg.model, prompt, system: systemPrompt || '', stream: false }),
    });
    if (!r.ok) { console.warn('[provider:ollama]', r.status); return null; }
    const d = await r.json();
    return d.response || null;
  } catch (e) { console.warn('[provider:ollama] error', e.message); return null; }
}

async function _openai(prompt, systemPrompt, cfg, apiKey) {
  try {
    if (!cfg.url) { console.warn('[provider:openai] LOBSTER_OPENAI_BASE_URL not set'); return null; }
    const messages = [];
    if (systemPrompt) messages.push({ role: 'system', content: systemPrompt });
    messages.push({ role: 'user', content: prompt });
    const headers = { 'Content-Type': 'application/json' };
    if (apiKey) headers.Authorization = 'Bearer ' + apiKey;
    const r = await fetch(cfg.url.replace(/\/$/, '') + '/chat/completions', {
      method: 'POST', headers, body: JSON.stringify({ model: cfg.model, messages }),
    });
    if (!r.ok) { console.warn('[provider:openai]', r.status, (await r.text()).slice(0, 200)); return null; }
    const d = await r.json();
    return (d.choices && d.choices[0] && d.choices[0].message && d.choices[0].message.content) || null;
  } catch (e) { console.warn('[provider:openai] error', e.message); return null; }
}

// Build the callLLM-compatible function for the active provider. Falls back to
// the platform SDK for the default (or unknown) provider.
function resolveLLM(env = process.env) {
  const cfg = resolveProvider(env);
  if (cfg.name === 'ollama') return (p, s) => _ollama(p, s, cfg);
  if (cfg.name === 'openai-compatible') return (p, s) => _openai(p, s, cfg, env.LOBSTER_OPENAI_API_KEY || '');
  return callLLM; // platform default (proxy or direct) — the vendored SDK
}

module.exports = { resolveProvider, resolveLLM, _ollama, _openai };
