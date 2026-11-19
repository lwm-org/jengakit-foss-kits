/* Logic tests for lobster-v2: the jengakit_agent ReAct loop + autonomy gate +
 * budget bound, and the skills loader. Run: node core.test.js */
'use strict';
const assert = require('assert');
const path = require('path');
const { Agent } = require('../templates/lib/jengakit_agent.js');
const { loadSkills } = require('../templates/lib/skills.js');

let n = 0; const test = (name, fn) => { fn(); n++; };
const run = async () => {
  await test('ReAct: calls a tool then answers', async () => {
    let turn = 0; const ran = [];
    const llm = async () => { turn++; return turn === 1 ? '<use name="shell">{"cmd":"echo hi"}</use>' : 'done: hi'; };
    const a = new Agent({ systemPrompt: 't', tools: [{ name: 'shell', description: 'x', sideEffecting: true, run: async (x) => { ran.push(x.cmd); return 'hi'; } }], autonomy: 'auto', llm });
    const r = await a.run('go');
    assert.deepStrictEqual(ran, ['echo hi']);
    assert.ok(/done/.test(r.text));
    assert.ok(r.trace.some(t => t.type === 'tool-result'));
  });

  await test('autonomy=readonly BLOCKS a side-effecting tool', async () => {
    let turn = 0; const ran = [];
    const llm = async () => { turn++; return turn === 1 ? '<use name="rm">{"p":"/"}</use>' : 'blocked'; };
    const a = new Agent({ systemPrompt: 't', tools: [{ name: 'rm', description: 'x', sideEffecting: true, run: async () => { ran.push(1); return 'ran'; } }], autonomy: 'readonly', llm });
    const r = await a.run('delete');
    assert.deepStrictEqual(ran, [], 'must NOT execute a side-effecting tool in readonly');
    assert.ok(r.trace.some(t => t.type === 'tool-blocked'));
  });

  await test('non-side-effecting tools run even in readonly', async () => {
    let turn = 0; let ran = 0;
    const llm = async () => { turn++; return turn === 1 ? '<use name="clock">{}</use>' : 'ok'; };
    const a = new Agent({ systemPrompt: 't', tools: [{ name: 'clock', description: 'x', run: async () => { ran++; return 'now'; } }], autonomy: 'readonly', llm });
    await a.run('time?');
    assert.strictEqual(ran, 1);
  });

  await test('bounded: an always-tool-calling model stops at maxSteps', async () => {
    const a = new Agent({ systemPrompt: 't', tools: [{ name: 'noop', description: 'x', run: async () => 'ok' }], maxSteps: 3, llm: async () => '<use name="noop">{}</use>' });
    const r = await a.run('loop');
    assert.ok(r.steps <= 3);
  });

  await test('no LLM → graceful message, never throws', async () => {
    const a = new Agent({ systemPrompt: 't', tools: [], llm: async () => null });
    const r = await a.run('hi');
    assert.ok(typeof r.text === 'string' && r.text.length > 0);
  });

  await test('skills loader returns tools + channels from the whatsapp skill', () => {
    const { tools, channels } = loadSkills(path.join(__dirname, '..', 'templates', 'skills'));
    assert.ok(Array.isArray(tools) && Array.isArray(channels));
    assert.ok(channels.some(c => c.name === 'whatsapp'), 'whatsapp channel skill must load');
  });

  console.log('lobster-v2 core: ' + n + ' tests passed');
};
run().catch(e => { console.error(e); process.exit(1); });
