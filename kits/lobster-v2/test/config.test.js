/* Runtime configuration store: seeds process.env from the DB at boot, applies
 * saved settings in-process (no restart), and masks secrets in the public view.
 * Run: node config.test.js */
'use strict';
const assert = require('assert');
const config = require('../templates/lib/config.js');

// A minimal in-memory jengakit_db stand-in that records writes.
function fakeDb(rows) {
  const store = {};
  (rows || []).forEach((r) => { store[r.k] = r.v; });
  return {
    exec: async () => {},
    query: async () => Object.keys(store).map((k) => ({ k, v: store[k] })),
    run: async (_sql, params) => { store[params[0]] = params[1]; },
    _store: store,
  };
}

async function main() {
  let n = 0; const ok = (name) => { n++; };

  // publicView masks secrets but exposes non-secret values.
  const view = config.publicView({ LOBSTER_AUTONOMY: 'auto', LOBSTER_TELEGRAM_TOKEN: 'shh' });
  const auto = view.fields.find((f) => f.key === 'LOBSTER_AUTONOMY');
  const tg = view.fields.find((f) => f.key === 'LOBSTER_TELEGRAM_TOKEN');
  assert.strictEqual(auto.value, 'auto');
  assert.strictEqual(tg.secret, true);
  assert.strictEqual(tg.value, '', 'secret value never leaves the server');
  assert.strictEqual(tg.set, true, 'but "is it set" is reported');
  assert.ok(view.groups.some((g) => g.id === 'channels'));
  ok('publicView');

  // load seeds process.env from the DB (DB is source of truth); ignores unknowns.
  delete process.env.LOBSTER_OPENDESIGN_URL;
  await config.load(fakeDb([{ k: 'LOBSTER_OPENDESIGN_URL', v: 'https://d.example.com' }, { k: 'BOGUS', v: 'x' }]));
  assert.strictEqual(process.env.LOBSTER_OPENDESIGN_URL, 'https://d.example.com');
  assert.strictEqual(process.env.BOGUS, undefined);
  delete process.env.LOBSTER_OPENDESIGN_URL;
  ok('load');

  // set persists + applies in-process; empty clears; unknown keys rejected.
  const db = fakeDb();
  await config.set(db, 'LOBSTER_WHATSAPP_TOKEN', 'tok');
  assert.strictEqual(process.env.LOBSTER_WHATSAPP_TOKEN, 'tok');
  assert.strictEqual(db._store.LOBSTER_WHATSAPP_TOKEN, 'tok');
  await config.set(db, 'LOBSTER_WHATSAPP_TOKEN', '');
  assert.strictEqual(process.env.LOBSTER_WHATSAPP_TOKEN, undefined, 'empty clears the env');
  await assert.rejects(() => config.set(db, 'NOT_A_SETTING', 'x'), /unknown setting/);
  ok('set');

  // setMany applies known keys, skips unknown.
  const applied = await config.setMany(fakeDb(), { LOBSTER_AUTONOMY: 'readonly', NOPE: 'y' });
  assert.deepStrictEqual(applied, ['LOBSTER_AUTONOMY']);
  assert.strictEqual(process.env.LOBSTER_AUTONOMY, 'readonly');
  delete process.env.LOBSTER_AUTONOMY;
  ok('setMany');

  console.log('lobster-v2 config: ' + n + ' tests passed');
}

main().catch((e) => { console.error(e); process.exit(1); });
