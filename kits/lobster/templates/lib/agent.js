const { getMessages } = require('./db');

const ASSISTANT_NAME = process.env.ASSISTANT_NAME || 'Lobster';
const ASSISTANT_PERSONALITY = process.env.ASSISTANT_PERSONALITY || 'Friendly and helpful AI assistant.';

async function chat(sessionId, userMessage) {
  const LLM_URL = process.env.JENGAKIT_LLM_URL;
  const LLM_TOKEN = process.env.JENGAKIT_LLM_TOKEN;
  const DEPLOY_KEY = process.env.DEPLOY_LLM_API_KEY;

  if (!LLM_URL && !DEPLOY_KEY) {
    return `I'm ${ASSISTANT_NAME}, but I'm not configured with an LLM provider yet. Set JENGAKIT_LLM_URL or DEPLOY_LLM_API_KEY.`;
  }

  const history = getMessages(sessionId, 10);
  const systemPrompt = `You are ${ASSISTANT_NAME}. ${ASSISTANT_PERSONALITY}`;

  const messages = [
    { role: 'system', content: systemPrompt },
    ...history.map(m => ({ role: m.role, content: m.content })),
    { role: 'user', content: userMessage }
  ];

  let endpoint, headers;
  if (LLM_URL) {
    // Use jengakit proxy
    const base = LLM_URL.replace(/\/+$/, '');
    endpoint = base.endsWith('/v1') ? base + '/chat/completions' : base + '/v1/chat/completions';
    headers = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${LLM_TOKEN || ''}`
    };
  } else {
    // Use OpenAI-compatible API with DEPLOY_LLM_API_KEY
    endpoint = 'https://api.openai.com/v1/chat/completions';
    headers = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${DEPLOY_KEY}`
    };
  }

  const model = process.env.DEPLOY_LLM_MODEL || (LLM_URL ? undefined : 'gpt-4o-mini');
  const body = { messages };
  if (model) body.model = model;

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(body)
    });
    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`LLM API error ${response.status}: ${errText.slice(0, 200)}`);
    }
    const data = await response.json();
    // Handle both OpenAI chat format and jengakit proxy format
    const reply = data.choices?.[0]?.message?.content
      || data.response
      || data.content
      || 'No response from LLM.';
    return reply;
  } catch (e) {
    console.error('Agent LLM error:', e.message);
    throw e;
  }
}

module.exports = { chat };
