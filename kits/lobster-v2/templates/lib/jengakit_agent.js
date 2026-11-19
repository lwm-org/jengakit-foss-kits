/**
 * jengaKit Platform SDK — jengakit_agent (general-purpose in-process agent loop).
 *
 * Gives ANY kit a bounded ReAct agent over the simple `callLLM(prompt, system)`
 * completion interface (jengakit_llm). NOT a sandbox/container spawner — the kit
 * is ALREADY an isolated container on the platform, so tools run in-process.
 *
 *   const agent = new Agent({ systemPrompt, tools, autonomy, maxSteps, llm });
 *   const { text, trace } = await agent.run(userText, history, { onEvent });
 *
 * tools: [{ name, description, sideEffecting?, run(args)->string }]
 * autonomy: 'readonly' | 'supervised' | 'auto'   (gates side-effecting tools)
 * llm: async (prompt, systemPrompt) => string    (defaults to jengakit_llm.callLLM)
 *
 * Tool protocol (the model is told this): to call a tool, emit EXACTLY
 *   <use name="TOOLNAME">{"arg":"value"}</use>
 * The loop runs the tool, feeds back <result>…</result>, and repeats until the
 * model answers with no tool call or the step budget is spent.
 *
 * Dual-language SDK: a Python twin lives at jengakit_agent.py.
 */
'use strict';

const USE_RE = /<use\s+name="([a-zA-Z0-9_\-]+)"\s*>([\s\S]*?)<\/use>/;

function toolInstructions(tools) {
  if (!tools.length) return '';
  const list = tools.map(t => `- ${t.name}: ${t.description}${t.sideEffecting ? ' (side-effecting)' : ''}`).join('\n');
  return (
    '\n\n## Tools\nYou can use these tools:\n' + list +
    '\n\nTo use a tool, output EXACTLY one tag and nothing after it:\n' +
    '<use name="TOOLNAME">{"arg":"value"}</use>\n' +
    'Then STOP — you will be given the result and can continue. ' +
    'When you have the final answer for the user, reply normally with NO <use> tag.'
  );
}

class Agent {
  constructor(opts = {}) {
    this.systemPrompt = opts.systemPrompt || 'You are a helpful assistant.';
    this.tools = {};
    (opts.tools || []).forEach(t => { this.tools[t.name] = t; });
    this.autonomy = opts.autonomy || 'auto';
    this.maxSteps = Math.max(1, opts.maxSteps || 6);
    this.llm = opts.llm || null;
  }

  _llm() {
    if (this.llm) return this.llm;
    const { callLLM } = require('./jengakit_llm');
    return callLLM;
  }

  _render(history, user, scratch) {
    var lines = [];
    (history || []).forEach(m => lines.push((m.role === 'user' ? 'User' : 'Assistant') + ': ' + m.content));
    lines.push('User: ' + user);
    scratch.forEach(s => lines.push(s));
    lines.push('Assistant:');
    return lines.join('\n');
  }

  async run(userText, history = [], opts = {}) {
    const onEvent = opts.onEvent || function () {};
    const llm = this._llm();
    const toolList = Object.values(this.tools);
    const system = this.systemPrompt + toolInstructions(toolList);
    const trace = [];
    const scratch = [];

    for (var step = 0; step < this.maxSteps; step++) {
      const prompt = this._render(history, userText, scratch);
      var out;
      try { out = await llm(prompt, system); } catch (e) { out = null; trace.push({ type: 'llm-error', error: String(e && e.message || e) }); }
      if (out == null) { onEvent('error', { message: 'LLM unavailable' }); return { text: '(the assistant is not configured with an LLM yet)', trace, steps: step }; }

      const m = out.match(USE_RE);
      if (!m) { onEvent('answer', { text: out }); trace.push({ type: 'answer', text: out }); return { text: out.trim(), trace, steps: step + 1 }; }

      const name = m[1];
      var args = {};
      try { args = JSON.parse(m[2].trim() || '{}'); } catch (e) { args = { _raw: m[2].trim() }; }
      const tool = this.tools[name];
      trace.push({ type: 'tool-call', name, args });
      onEvent('tool-call', { name, args });

      if (!tool) { scratch.push('<result name="' + name + '">unknown tool</result>'); continue; }

      // Autonomy gate for side-effecting tools.
      if (tool.sideEffecting && this.autonomy === 'readonly') {
        const note = 'BLOCKED by read-only autonomy — would have run ' + name + ' with ' + JSON.stringify(args);
        scratch.push('<result name="' + name + '">' + note + '</result>');
        trace.push({ type: 'tool-blocked', name });
        onEvent('tool-blocked', { name, args });
        continue;
      }
      if (tool.sideEffecting && this.autonomy === 'supervised') onEvent('tool-announce', { name, args });

      var result;
      try { result = await tool.run(args || {}); } catch (e) { result = 'tool error: ' + String(e && e.message || e); }
      result = String(result == null ? '' : result).slice(0, 4000);
      scratch.push('<result name="' + name + '">' + result + '</result>');
      trace.push({ type: 'tool-result', name, result });
      onEvent('tool-result', { name, result });
    }

    // Budget exhausted — one last plain answer.
    var final;
    try { final = await llm(this._render(history, userText, scratch) + '\n(Give your best final answer now, no tools.)', system); } catch (e) { final = null; }
    trace.push({ type: 'budget-exhausted' });
    return { text: (final || 'I reached my step limit before finishing.').trim(), trace, steps: this.maxSteps };
  }
}

module.exports = { Agent, _parseUse: (s) => s.match(USE_RE) };
