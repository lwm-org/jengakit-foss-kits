/* Pure-logic tests for the crossword core. Run: node core.test.js
 * Exits non-zero on failure. No deps. */
'use strict';
const assert = require('assert');
const C = require('../templates/public/crossword-core.js');

const WORDS = [
  { word: 'CODE', clue: 'x' }, { word: 'DATA', clue: 'x' }, { word: 'NODE', clue: 'x' },
  { word: 'BYTE', clue: 'x' }, { word: 'LOOP', clue: 'x' }, { word: 'ARRAY', clue: 'x' },
  { word: 'OBJECT', clue: 'x' }, { word: 'STRING', clue: 'x' }, { word: 'SERVER', clue: 'x' },
  { word: 'ROUTER', clue: 'x' }, { word: 'ZEBRA', clue: 'no obvious cross' }, { word: 'QUARTZ', clue: 'rare letters' },
];

let n = 0;
function test(name, fn) { fn(); n++; }

test('never drops a word (the v1 bug)', () => {
  const g = C.buildGrid(WORDS, 42);
  assert.strictEqual(g.words.length, WORDS.length, 'all words must be placed');
  assert.deepStrictEqual(C.validateGrid(WORDS, g), [], 'grid must be conflict-free + complete');
});

test('deterministic per seed (multiplayer sync)', () => {
  const a = C.buildGrid(WORDS, 777), b = C.buildGrid(WORDS, 777);
  assert.strictEqual(JSON.stringify(a), JSON.stringify(b), 'same seed → identical grid');
});

test('different seeds produce different grids', () => {
  const a = C.buildGrid(WORDS, 1), b = C.buildGrid(WORDS, 2);
  assert.notStrictEqual(JSON.stringify(a), JSON.stringify(b));
});

test('crossings are consistent (shared cells match)', () => {
  const g = C.buildGrid(WORDS, 9);
  g.words.forEach((w) => {
    for (let i = 0; i < w.word.length; i++) {
      const cr = w.r + (w.dir === 'd' ? i : 0), cc = w.c + (w.dir === 'a' ? i : 0);
      assert.strictEqual(g.cells[cr + ',' + cc].ans, w.word[i], 'cell must equal the word letter');
    }
  });
});

test('every word gets a clue number', () => {
  const g = C.buildGrid(WORDS, 5);
  g.words.forEach((w) => assert.ok(w.num >= 1, 'word ' + w.word + ' must be numbered'));
});

test('handles a tiny / degenerate list without throwing', () => {
  assert.ok(C.buildGrid([{ word: 'HI', clue: 'x' }], 3).words.length >= 1);
  assert.deepStrictEqual(C.buildGrid([], 3).words, []);
});

console.log('crossword-core: ' + n + ' tests passed');
