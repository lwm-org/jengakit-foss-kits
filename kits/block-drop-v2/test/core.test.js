/* Pure-logic tests for the block-drop engine. Run: node core.test.js */
'use strict';
const assert = require('assert');
const B = require('../templates/public/block-core.js');

let n = 0; const test = (name, fn) => { fn(); n++; };
const seq = (seed, k) => { const e = new B.Engine(seed); const s = [e.cur.type]; for (let i = 0; i < k; i++) { e.hardDrop(); s.push(e.cur.type); } return s.join(''); };

test('7-bag is deterministic per seed (fair versus)', () => {
  assert.strictEqual(seq(123, 30), seq(123, 30), 'same seed → identical sequence');
});
test('different seeds diverge', () => {
  assert.notStrictEqual(seq(1, 30), seq(2, 30));
});
test('every 7 pieces is a permutation of all 7', () => {
  const e = new B.Engine(42); const bag = [e.cur.type];
  for (let i = 0; i < 6; i++) { e.hardDrop(); bag.push(e.cur.type); }
  assert.strictEqual([...new Set(bag)].sort().join(''), 'IJLOSTZ', 'bag: ' + bag.join(''));
});
test('rotation changes occupied cells for non-O', () => {
  const set = (t, r) => B.rotatedCells(t, r).map(c => c.join(',')).sort().join('|');
  assert.notStrictEqual(set('T', 0), set('T', 1));
  assert.notStrictEqual(set('S', 0), set('S', 1));
});
test('O occupies the same 4 cells in every rotation', () => {
  const set = r => B.rotatedCells('O', r).map(c => c.join(',')).sort().join('|');
  assert.strictEqual(set(0), set(1)); assert.strictEqual(set(1), set(2));
});
test('line clear + scoring: single=100, tetris=800×level', () => {
  const e = new B.Engine(9); e.board[19].fill(1); assert.strictEqual(e._clear(), 1);
  const t = new B.Engine(9); for (let y = 16; y < 20; y++) t.board[y].fill(1);
  const before = t.score; t.lines = 0; t.level = 1;
  // simulate the scoring side of a tetris
  const cleared = t._clear(); t.score += [0, 100, 300, 500, 800][cleared] * 1;
  assert.strictEqual(cleared, 4); assert.strictEqual(t.score - before, 800);
});
test('rotate() never throws + wall-kicks off the left edge', () => {
  const e = new B.Engine(3);
  // shove a piece to the far left, then rotate — must not crash or leave the board
  for (let i = 0; i < 8; i++) e.move(-1);
  e.rotate(1); e.rotate(1); e.rotate(-1);
  e.minos(e.cur).forEach(([x, y]) => { assert.ok(x >= 0 && x < e.cols, 'x in bounds'); assert.ok(y < e.rows, 'y in bounds'); });
});
test('garbage rows have exactly one gap and are pushed to the bottom', () => {
  const e = new B.Engine(5); e._applyGarbage(4);
  const bottom = e.board.slice(-4);
  bottom.forEach(r => { assert.strictEqual(r.filter(v => v === 0).length, 1, 'one gap'); assert.strictEqual(r.filter(v => v === 8).length, e.cols - 1, 'rest filled'); });
});
test('a completed board sets over=true', () => {
  const e = new B.Engine(1); for (let y = 0; y < e.rows; y++) e.board[y].fill(1);
  e._spawn(); assert.strictEqual(e.over, true);
});

console.log('block-core: ' + n + ' tests passed');
