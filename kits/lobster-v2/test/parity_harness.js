/* Parity harness (JS side): runs the jengakit_agent.js Agent through a named
 * scripted-LLM scenario and prints a normalized JSON summary. The Python twin is
 * driven through the SAME scenarios by tests/test_lobster_agent_parity.py, which
 * asserts the two summaries match. Usage: node parity_harness.js <scenario> */
'use strict';
const { Agent } = require('../templates/lib/jengakit_agent.js');

function scripted(outs) { let i = 0; return function () { return i < outs.length ? outs[i++] : outs[outs.length - 1]; }; }

const SCENARIOS = {
  tool_then_answer: {
    autonomy: 'auto', maxSteps: 6, user: 'go',
    llm: scripted(['<use name="echo">{"x":"hi"}</use>', 'done: hi']),
    tools: [{ name: 'echo', description: 'e', sideEffecting: true, run: () => 'HI' }],
  },
  readonly_block: {
    autonomy: 'readonly', maxSteps: 6, user: 'delete everything',
    llm: scripted(['<use name="rm">{"p":"/"}</use>', 'stopped']),
    tools: [{ name: 'rm', description: 'danger', sideEffecting: true, run: () => 'ran' }],
  },
  budget: {
    autonomy: 'auto', maxSteps: 3, user: 'loop',
    llm: scripted(['<use name="noop">{}</use>']),
    tools: [{ name: 'noop', description: 'n', run: () => 'ok' }],
  },
  no_llm: {
    autonomy: 'auto', maxSteps: 6, user: 'hi',
    llm: function () { return null; }, tools: [],
  },
  unknown_tool: {
    autonomy: 'auto', maxSteps: 6, user: 'go',
    llm: scripted(['<use name="ghost">{}</use>', 'ok']),
    tools: [{ name: 'present', description: 'p', run: () => 'x' }],
  },
};

async function main() {
  const key = process.argv[2];
  const s = SCENARIOS[key];
  if (!s) { console.error('unknown scenario ' + key); process.exit(2); }
  const agent = new Agent({ systemPrompt: 't', tools: s.tools, autonomy: s.autonomy, maxSteps: s.maxSteps, llm: s.llm });
  const r = await agent.run(s.user, []);
  const summary = {
    text: r.text,
    steps: r.steps,
    calls: r.trace.filter((t) => t.type === 'tool-call').map((t) => t.name),
    ran: r.trace.filter((t) => t.type === 'tool-result').map((t) => t.name),
    blocked: r.trace.filter((t) => t.type === 'tool-blocked').map((t) => t.name),
  };
  process.stdout.write(JSON.stringify(summary));
}
main();
