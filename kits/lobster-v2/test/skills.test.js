/* Logic tests for lobster-v2 Phase D: the example skills (clock/calc) and the
 * skill install/remove + idempotency contract of the loader. Run: node skills.test.js */
'use strict';
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const clock = require('../templates/skills/clock/skill.js');
const calc = require('../templates/skills/calc/skill.js');
const openDesign = require('../templates/skills/open-design/skill.js');
const { loadSkills } = require('../templates/lib/skills.js');

let n = 0; const test = (name, fn) => { fn(); n++; };

// ── Example skills ────────────────────────────────────────────────────────────
test('clock: _now returns ISO, and formats a valid timezone', () => {
  const fixed = new Date('2026-07-09T12:00:00Z');
  assert.strictEqual(clock._now(fixed), '2026-07-09T12:00:00.000Z');
  assert.ok(/2026/.test(clock._now(fixed, 'America/New_York')));
  assert.ok(/unknown tz/.test(clock._now(fixed, 'Not/AZone')));
});

test('calc: evaluates arithmetic and rejects anything else (no eval)', () => {
  assert.strictEqual(calc._evaluate('2 * (3 + 4)'), 14);
  assert.strictEqual(calc._evaluate('10 / 4'), 2.5);
  assert.throws(() => calc._evaluate('process.exit(1)'), /allowed/);
  assert.throws(() => calc._evaluate('1 +'), /bad expression/);
  assert.throws(() => calc._evaluate('(1+2'), /unbalanced/);
});

test('open-design: _base normalizes the configured URL (trims trailing slash)', () => {
  assert.strictEqual(openDesign._base({ LOBSTER_OPENDESIGN_URL: 'https://d.example.com/' }), 'https://d.example.com');
  assert.strictEqual(openDesign._base({ LOBSTER_OPENDESIGN_URL: '  https://d.example.com  ' }), 'https://d.example.com');
  assert.strictEqual(openDesign._base({}), '');
});

test('open-design: _buildRequest maps to the real API + throws when unconfigured', () => {
  const get = openDesign._buildRequest('https://d.example.com', 'GET', '/api/designs');
  assert.strictEqual(get.url, 'https://d.example.com/api/designs');
  assert.strictEqual(get.options.method, 'GET');
  const post = openDesign._buildRequest('https://d.example.com', 'post', '/api/designs', { name: 'Post', width: 1080 });
  assert.strictEqual(post.options.method, 'POST');
  assert.strictEqual(post.options.headers['Content-Type'], 'application/json');
  assert.deepStrictEqual(JSON.parse(post.options.body), { name: 'Post', width: 1080 });
  assert.throws(() => openDesign._buildRequest('', 'GET', '/api/designs'), /not configured/);
});

test('open-design: exposes read-only + side-effecting tools', () => {
  const names = openDesign.tools.map((t) => t.name);
  assert.ok(['design_list', 'design_get', 'design_templates', 'design_create', 'design_update'].every((x) => names.includes(x)));
  const create = openDesign.tools.find((t) => t.name === 'design_create');
  assert.strictEqual(create.sideEffecting, true);
  const list = openDesign.tools.find((t) => t.name === 'design_list');
  assert.ok(!list.sideEffecting);
});

// ── Skill install / remove / idempotency ──────────────────────────────────────
test('loader: loading the real skills dir is idempotent', () => {
  const dir = path.join(__dirname, '..', 'templates', 'skills');
  const a = loadSkills(dir).tools.map((t) => t.name).sort();
  const b = loadSkills(dir).tools.map((t) => t.name).sort();
  assert.deepStrictEqual(a, b, 'two loads of the same dir must yield the same tools');
  assert.ok(a.indexOf('clock') !== -1 && a.indexOf('calc') !== -1, 'example skills present');
});

test('loader: install adds a tool, remove takes it away', () => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'lob-skills-'));
  // remove state: an empty skills dir exposes nothing
  assert.deepStrictEqual(loadSkills(base).tools, []);
  // install: drop a skill folder in
  const sdir = path.join(base, 'greet');
  fs.mkdirSync(sdir);
  fs.writeFileSync(path.join(sdir, 'skill.js'),
    "module.exports={name:'greet',tools:[{name:'greet',description:'g',run:async()=>'hi'}]};");
  const loaded = loadSkills(base);
  assert.strictEqual(loaded.tools.length, 1);
  assert.strictEqual(loaded.tools[0].name, 'greet');
  // remove: delete the folder → gone again
  fs.rmSync(sdir, { recursive: true, force: true });
  assert.deepStrictEqual(loadSkills(base).tools, []);
  fs.rmSync(base, { recursive: true, force: true });
});

console.log('lobster-v2 skills: ' + n + ' tests passed');
