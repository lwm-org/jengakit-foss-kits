/* Logic tests for lobster-v2 Phase C: PBKDF2 auth + admin bootstrap, the SSH
 * host allowlist, and the safe markdown renderer (XSS). Pure exports + a tiny
 * in-memory fake db — no real DB or network. Run: node multiuser.test.js */
'use strict';
const assert = require('assert');

const auth = require('../templates/lib/auth.js');
const ssh = require('../templates/skills/ssh/skill.js');
const md = require('../templates/public/md.js');

let n = 0; const test = (name, fn) => { fn(); n++; };
const asyncTest = async (name, fn) => { await fn(); n++; };

// Minimal fake db supporting exactly the queries auth.js issues.
function fakeDb() {
  const users = [];
  return {
    users,
    exec: async () => {},
    run: async (sql, params) => {
      if (/INSERT INTO users/i.test(sql)) users.push({ username: params[0], salt: params[1], hash: params[2], role: params[3] });
    },
    query: async (sql, params) => {
      if (/WHERE role = \?/i.test(sql)) return users.filter((u) => u.role === params[0]);
      if (/WHERE username = \?/i.test(sql)) return users.filter((u) => u.username === params[0]);
      return [];
    },
  };
}

const run = async () => {
  // ── Auth ────────────────────────────────────────────────────────────────────
  test('auth: PBKDF2 hash verifies and rejects wrong password', () => {
    const { salt, hash } = auth.hashPassword('correct horse');
    assert.strictEqual(auth.verifyPassword('correct horse', salt, hash), true);
    assert.strictEqual(auth.verifyPassword('wrong', salt, hash), false);
    assert.notStrictEqual(auth.hashPassword('x').salt, auth.hashPassword('x').salt, 'salt is random per call');
  });

  test('auth: parseCookies handles the session cookie', () => {
    const c = auth.parseCookies('a=1; lobster_session=abc123; b=2');
    assert.strictEqual(c.lobster_session, 'abc123');
    assert.deepStrictEqual(auth.parseCookies(''), {});
  });

  await asyncTest('auth: bootstrapAdmin creates one admin, is idempotent, generates a password', async () => {
    const db = fakeDb();
    const first = await auth.bootstrapAdmin(db, { LOBSTER_ADMIN_USER: 'root' });
    assert.strictEqual(first.created, true);
    assert.strictEqual(first.generated, true);
    assert.ok(first.password && first.password.length >= 8);
    const again = await auth.bootstrapAdmin(db, { LOBSTER_ADMIN_USER: 'root' });
    assert.strictEqual(again.created, false, 'second call must not create another admin');
    assert.strictEqual(db.users.length, 1);
  });

  await asyncTest('auth: bootstrapAdmin honours a supplied password (not generated)', async () => {
    const db = fakeDb();
    const r = await auth.bootstrapAdmin(db, { LOBSTER_ADMIN_PASSWORD: 'sekret1' });
    assert.strictEqual(r.generated, false);
    const who = await auth.authenticate(db, 'admin', 'sekret1');
    assert.ok(who && who.role === 'admin');
    assert.strictEqual(await auth.authenticate(db, 'admin', 'nope'), null);
  });

  await asyncTest('auth: createUser enforces a minimum password length', async () => {
    const db = fakeDb();
    await assert.rejects(auth.createUser(db, 'bob', '123'), /at least 6/);
    const u = await auth.createUser(db, 'bob', 'longenough');
    assert.strictEqual(u.role, 'user');
    assert.ok(await auth.authenticate(db, 'bob', 'longenough'));
  });

  // ── SSH allowlist ─────────────────────────────────────────────────────────────
  test('ssh: allowlist parses labels/users and resolves only allowed hosts', () => {
    const allow = ssh._parseAllowlist('web=deploy@10.0.0.5, 10.0.0.9, admin@box', 'root');
    assert.deepStrictEqual(ssh._resolve('web', allow), { user: 'deploy', host: '10.0.0.5' });
    assert.deepStrictEqual(ssh._resolve('10.0.0.9', allow), { user: 'root', host: '10.0.0.9' });
    assert.deepStrictEqual(ssh._resolve('admin@box', allow), { user: 'admin', host: 'box' });
    assert.strictEqual(ssh._resolve('evil.example.com', allow), null, 'unlisted host denied');
    assert.strictEqual(ssh._resolve('mallory@box', allow), null, 'wrong user denied');
  });

  test('ssh tool is side-effecting and off without an allowlist', async () => {
    assert.strictEqual(ssh.tools[0].sideEffecting, true);
    const saved = process.env.LOBSTER_SSH_HOSTS; delete process.env.LOBSTER_SSH_HOSTS;
    const out = await ssh.tools[0].run({ host: 'x', command: 'id' });
    assert.ok(/not configured/.test(out));
    if (saved != null) process.env.LOBSTER_SSH_HOSTS = saved;
  });

  // ── Markdown safety ────────────────────────────────────────────────────────────
  test('md: escapes HTML — no script injection', () => {
    const html = md.render('Hello <script>alert(1)</script> & <img src=x onerror=1>');
    assert.ok(html.indexOf('<script>') === -1, 'raw <script> must not survive');
    assert.ok(html.indexOf('&lt;script&gt;') !== -1);
    assert.ok(html.indexOf('onerror=1>') === -1);
  });

  test('md: renders bold, inline code, fenced code, and safe links', () => {
    assert.ok(/<strong>bold<\/strong>/.test(md.render('**bold**')));
    assert.ok(/<code>x=1<\/code>/.test(md.render('`x=1`')));
    assert.ok(/<pre><code>line1\nline2<\/code><\/pre>/.test(md.render('```\nline1\nline2\n```')));
    assert.ok(/<a href="https:\/\/x.com"[^>]*>site<\/a>/.test(md.render('[site](https://x.com)')));
  });

  test('md: rejects non-http link schemes', () => {
    const html = md.render('[click](javascript:alert(1))');
    assert.ok(html.indexOf('href="javascript') === -1, 'javascript: links must not become anchors');
  });

  console.log('lobster-v2 multiuser: ' + n + ' tests passed');
};
run().catch((e) => { console.error(e); process.exit(1); });
