/**
 * jengaKit Platform SDK — LLM Proxy Client
 * Auto-copied by pipeline when LLM usage is detected.
 * Usage: const { callLLM } = require('./lib/llm');
 *        const response = await callLLM('What is 2+2?');
 */
const LLM_URL = process.env.JENGAKIT_LLM_URL;
const LLM_TOKEN = process.env.JENGAKIT_LLM_TOKEN;
const DIRECT_KEY = process.env.DEPLOY_LLM_API_KEY;
// Vendored-copy fix: the upstream default (gemini-2.0-flash) is retired. Use a
// current, env-overridable model for the direct community fallback.
const DIRECT_MODEL = process.env.JENGAKIT_LLM_MODEL || 'gemini-2.5-flash';

async function callLLM(prompt, systemPrompt) {
    // Platform proxy (preferred)
    if (LLM_URL && LLM_TOKEN) {
        try {
            const r = await fetch(LLM_URL, {
                method: 'POST',
                headers: {'Authorization': 'Bearer ' + LLM_TOKEN, 'Content-Type': 'application/json'},
                body: JSON.stringify({prompt: prompt, system_prompt: systemPrompt || ''})
            });
            if (r.ok) {
                const d = await r.json();
                return d.response || d.text || null;
            }
        } catch(e) {
            console.warn('LLM proxy failed:', e.message);
        }
    }
    // Direct fallback (community mode with own API key)
    if (DIRECT_KEY) {
        try {
            const r = await fetch('https://generativelanguage.googleapis.com/v1beta/models/' + DIRECT_MODEL + ':generateContent?key=' + DIRECT_KEY, {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({contents: [{parts: [{text: (systemPrompt ? systemPrompt + '\n\n' : '') + prompt}]}]})
            });
            if (r.ok) {
                const d = await r.json();
                return d.candidates && d.candidates[0] && d.candidates[0].content && d.candidates[0].content.parts && d.candidates[0].content.parts[0] ? d.candidates[0].content.parts[0].text : null;
            }
        } catch(e) {
            console.warn('Direct LLM failed:', e.message);
        }
    }
    return null;
}

module.exports = { callLLM, LLM_URL, LLM_TOKEN };
