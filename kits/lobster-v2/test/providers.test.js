/* Logic tests for lobster-v2 Phase B: model-provider selection, the reminder
 * scheduler (persistence + fire), and the http/notes tool helpers — via pure
 * exports and a stubbed fetch/db, no network or real DB. Run: node providers.test.js */
'use strict';
const assert = require('assert');

const providers = require('../templates/lib/providers.js');
const scheduler = require('../templates/skills/scheduler/skill.js');
const httpTool = require('../templates/skills/http-tool/skill.js');
const notes = require('../templates/skills/notes/skill.js');
const mgrProviders = require('../templates/skills/manage-providers/skill.js');
const { callLLM } = require('../templates/lib/jengakit_llm.js');

let n = 0; const test = (name, fn) => { fn(); n++; };
const asyncTest = async (name, fn) => { await fn(); n++; };

const run = async () => {
  // ── Providers ─────────────────────────────────────────────────────────────
  test('providers: env selects the active provider descriptor', () => {
    assert.strictEqual(providers.resolveProvider({}).name, 'platform');
    assert.strictEqual(providers.resolveProvider({ LOBSTER_PROVIDER: 'ollama' }).name, 'ollama');
    const oai = providers.resolveProvider({ LOBSTER_PROVIDER: 'openai-compatible', LOBSTER_OPENAI_BASE_URL: 'https://x/v1', LOBSTER_OPENAI_API_KEY: 'k' });
    assert.strictEqual(oai.name, 'openai-compatible');
    assert.strictEqual(oai.keyed, true);
  });

  test('providers: default resolves to the platform SDK callLLM', () => {
    assert.strictEqual(providers.resolveLLM({}), callLLM, 'platform default must be the vendored SDK');
  });

  await asyncTest('providers: ollama call parses the response (stubbed fetch)', async () => {
    const orig = global.fetch;
    global.fetch = async (url, opts) => {
      assert.ok(/\/api\/generate$/.test(url));
      const body = JSON.parse(opts.body);
      assert.strictEqual(body.model, 'llama3.1');
      return { ok: true, json: async () => ({ response: 'pong' }) };
    };
    try {
      const llm = providers.resolveLLM({ LOBSTER_PROVIDER: 'ollama' });
      assert.strictEqual(await llm('ping', 'sys'), 'pong');
    } finally { global.fetch = orig; }
  });

  await asyncTest('providers: openai-compatible call parses choices (stubbed fetch)', async () => {
    const orig = global.fetch;
    global.fetch = async (url, opts) => {
      assert.ok(/\/chat\/completions$/.test(url));
      assert.strictEqual(opts.headers.Authorization, 'Bearer sk-test');
      return { ok: true, json: async () => ({ choices: [{ message: { content: 'hi' } }] }) };
    };
    try {
      const llm = providers.resolveLLM({ LOBSTER_PROVIDER: 'openai-compatible', LOBSTER_OPENAI_BASE_URL: 'https://api.x/v1', LOBSTER_OPENAI_API_KEY: 'sk-test', LOBSTER_OPENAI_MODEL: 'gpt-4o-mini' });
      assert.strictEqual(await llm('yo', ''), 'hi');
    } finally { global.fetch = orig; }
  });

  test('manage-providers: format names the active provider', () => {
    assert.ok(/ollama/.test(mgrProviders._format({ name: 'ollama', model: 'llama3.1', url: 'http://h:11434' })));
  });

  // ── Scheduler ───────────────────────────────────────────────────────────────
  test('scheduler: _due computes absolute timestamps', () => {
    assert.strictEqual(scheduler._due(1000, { in_seconds: 5 }), 6000);
    assert.strictEqual(scheduler._due(1000, { in_minutes: 2 }), 121000);
    assert.strictEqual(scheduler._due(0, { at: 1700000000000 }), 1700000000000);
    assert.strictEqual(scheduler._due(1000, {}), 61000); // default 1 minute
  });

  test('scheduler: _selectDue picks pending jobs past their due time', () => {
    const rows = [
      { id: 1, status: 'pending', due_at: 500 },
      { id: 2, status: 'pending', due_at: 2000 },
      { id: 3, status: 'fired', due_at: 100 },
    ];
    const due = scheduler._selectDue(rows, 1000).map((r) => r.id);
    assert.deepStrictEqual(due, [1]);
  });

  await asyncTest('scheduler: _tick fires due jobs against a fake db', async () => {
    const store = [{ id: 1, text: 'standup', due_at: 500, status: 'pending', act: 0 }];
    const fakeDb = {
      query: async (sql, params) => store.filter((r) => r.status === params[0]),
      run: async (sql, params) => { const r = store.find((x) => x.id === params[params.length - 1]); if (r) { r.status = 'fired'; r.result = params[0]; } },
    };
    scheduler.__setTestDeps(fakeDb, null);
    await scheduler._tick(1000);
    assert.strictEqual(store[0].status, 'fired', 'due job must be marked fired');
    scheduler.__setTestDeps(null, null); // reset
  });

  // ── http tool ───────────────────────────────────────────────────────────────
  test('http-tool: builds GET/POST requests and rejects bad urls', () => {
    const g = httpTool._buildRequest({ url: 'https://api.example.com/x' });
    assert.strictEqual(g.options.method, 'GET');
    const p = httpTool._buildRequest({ url: 'https://api.example.com/x', json: { a: 1 } });
    assert.strictEqual(p.options.method, 'POST');
    assert.strictEqual(p.options.headers['Content-Type'], 'application/json');
    assert.strictEqual(p.options.body, '{"a":1}');
    assert.throws(() => httpTool._buildRequest({ url: 'ftp://nope' }), /valid http/);
    assert.throws(() => httpTool._buildRequest({}), /valid http/);
  });

  test('http tool is side-effecting (autonomy-gated)', () => {
    assert.strictEqual(httpTool.tools[0].sideEffecting, true);
  });

  // ── notes tool ────────────────────────────────────────────────────────────────
  test('notes: builds list vs search queries', () => {
    const list = notes._buildQuery({});
    assert.ok(/ORDER BY id DESC LIMIT 20/.test(list.sql));
    assert.deepStrictEqual(list.params, []);
    const search = notes._buildQuery({ query: 'infra', limit: 5 });
    assert.ok(/LIKE \? OR v LIKE \?/.test(search.sql));
    assert.ok(/LIMIT 5/.test(search.sql));
    assert.deepStrictEqual(search.params, ['%infra%', '%infra%']);
  });

  console.log('lobster-v2 providers+tools: ' + n + ' tests passed');
};
run().catch((e) => { console.error(e); process.exit(1); });
