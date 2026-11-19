/**
 * block-core — PURE falling-block engine. No DOM/canvas. Node + browser.
 *
 * Deterministic (seeded 7-bag) so a versus room is FAIR — every player gets the
 * identical piece sequence. Full 7 tetrominoes, matrix rotation + SRS wall
 * kicks, ghost, hold, next-queue, line-clear scoring (100/300/500/800×level),
 * speed ramp, and garbage-row generation for versus. The renderer (game.js)
 * only draws Engine state + calls these methods.
 *
 *   new Engine(seed, {cols,rows})  → e.board, e.cur, e.hold, e.queue, e.score…
 *   e.move(dx) e.rotate(dir) e.softDrop() e.hardDrop() e.step() e.holdPiece()
 *   e.ghostY()  e.addGarbage(n)  e.over
 * Events surface via return values (e.step()/lock return {locked,cleared,garbage}).
 */
(function (global) {
  var COLS = 10, ROWS = 20;
  // Spawn shapes in their SRS box (y down). Index = colour id (1..7).
  var SHAPES = {
    I: { c: 1, n: 4, cells: [[0, 1], [1, 1], [2, 1], [3, 1]] },
    O: { c: 2, n: 2, cells: [[0, 0], [1, 0], [0, 1], [1, 1]] },
    T: { c: 3, n: 3, cells: [[1, 0], [0, 1], [1, 1], [2, 1]] },
    S: { c: 4, n: 3, cells: [[1, 0], [2, 0], [0, 1], [1, 1]] },
    Z: { c: 5, n: 3, cells: [[0, 0], [1, 0], [1, 1], [2, 1]] },
    J: { c: 6, n: 3, cells: [[0, 0], [0, 1], [1, 1], [2, 1]] },
    L: { c: 7, n: 3, cells: [[2, 0], [0, 1], [1, 1], [2, 1]] },
  };
  var TYPES = ['I', 'O', 'T', 'S', 'Z', 'J', 'L'];

  // SRS kick tables (y already flipped to y-DOWN). key: from>to (0=spawn,1=R,2=180,3=L)
  var KICK = {
    JLSTZ: {
      '0>1': [[0, 0], [-1, 0], [-1, -1], [0, 2], [-1, 2]],
      '1>0': [[0, 0], [1, 0], [1, 1], [0, -2], [1, -2]],
      '1>2': [[0, 0], [1, 0], [1, 1], [0, -2], [1, -2]],
      '2>1': [[0, 0], [-1, 0], [-1, -1], [0, 2], [-1, 2]],
      '2>3': [[0, 0], [1, 0], [1, -1], [0, 2], [1, 2]],
      '3>2': [[0, 0], [-1, 0], [-1, 1], [0, -2], [-1, -2]],
      '3>0': [[0, 0], [-1, 0], [-1, 1], [0, -2], [-1, -2]],
      '0>3': [[0, 0], [1, 0], [1, -1], [0, 2], [1, 2]],
    },
    I: {
      '0>1': [[0, 0], [-2, 0], [1, 0], [-2, 1], [1, -2]],
      '1>0': [[0, 0], [2, 0], [-1, 0], [2, -1], [-1, 2]],
      '1>2': [[0, 0], [-1, 0], [2, 0], [-1, -2], [2, 1]],
      '2>1': [[0, 0], [1, 0], [-2, 0], [1, 2], [-2, -1]],
      '2>3': [[0, 0], [2, 0], [-1, 0], [2, -1], [-1, 2]],
      '3>2': [[0, 0], [-2, 0], [1, 0], [-2, 1], [1, -2]],
      '3>0': [[0, 0], [1, 0], [-2, 0], [1, 2], [-2, -1]],
      '0>3': [[0, 0], [-1, 0], [2, 0], [-1, -2], [2, 1]],
    },
  };

  function mulberry32(seed) {
    var s = seed | 0;
    return function () { s = (s + 0x6d2b79f5) | 0; var t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }

  // Rotate a piece's cells to rotation r (0..3) within its n×n box (CW: x'=n-1-y, y'=x).
  function rotatedCells(type, r) {
    var sp = SHAPES[type], cells = sp.cells.map(function (c) { return [c[0], c[1]]; });
    for (var k = 0; k < r; k++) cells = cells.map(function (c) { return [sp.n - 1 - c[1], c[0]]; });
    return cells;
  }

  function Engine(seed, opts) {
    opts = opts || {};
    this.cols = opts.cols || COLS; this.rows = opts.rows || ROWS;
    this.rand = mulberry32((seed | 0) || 1);
    this.board = []; for (var y = 0; y < this.rows; y++) this.board.push(new Array(this.cols).fill(0));
    this.bag = []; this.queue = [];
    this.score = 0; this.lines = 0; this.level = 1; this.over = false;
    this.hold = null; this.holdUsed = false; this.pendingGarbage = 0;
    for (var i = 0; i < 5; i++) this.queue.push(this._next());
    this._spawn();
  }
  Engine.prototype._next = function () {
    if (!this.bag.length) { this.bag = TYPES.slice(); for (var i = this.bag.length - 1; i > 0; i--) { var j = Math.floor(this.rand() * (i + 1)); var t = this.bag[i]; this.bag[i] = this.bag[j]; this.bag[j] = t; } }
    return this.bag.shift();
  };
  Engine.prototype._spawn = function (type) {
    type = type || this.queue.shift();
    this.queue.push(this._next());
    this.cur = { type: type, r: 0, x: (this.cols / 2 | 0) - 2, y: 0 };
    this.holdUsed = false;
    if (this._collides(this.cur)) this.over = true;
  };
  Engine.prototype.minos = function (p) { return rotatedCells(p.type, p.r).map(function (c) { return [p.x + c[0], p.y + c[1]]; }); };
  Engine.prototype._collides = function (p) {
    var m = this.minos(p);
    for (var i = 0; i < m.length; i++) { var x = m[i][0], y = m[i][1]; if (x < 0 || x >= this.cols || y >= this.rows) return true; if (y >= 0 && this.board[y][x]) return true; }
    return false;
  };
  Engine.prototype.move = function (dx) { var p = { type: this.cur.type, r: this.cur.r, x: this.cur.x + dx, y: this.cur.y }; if (!this._collides(p)) { this.cur.x = p.x; return true; } return false; };
  Engine.prototype.rotate = function (dir) {
    if (this.cur.type === 'O') return true;
    var from = this.cur.r, to = (this.cur.r + (dir < 0 ? 3 : 1)) % 4;
    var table = (this.cur.type === 'I') ? KICK.I : KICK.JLSTZ;
    var kicks = table[from + '>' + to] || [[0, 0]];
    for (var i = 0; i < kicks.length; i++) {
      var p = { type: this.cur.type, r: to, x: this.cur.x + kicks[i][0], y: this.cur.y + kicks[i][1] };
      if (!this._collides(p)) { this.cur = p; return true; }
    }
    return false;
  };
  Engine.prototype.ghostY = function () { var p = { type: this.cur.type, r: this.cur.r, x: this.cur.x, y: this.cur.y }; while (!this._collides({ type: p.type, r: p.r, x: p.x, y: p.y + 1 })) p.y++; return p.y; };
  Engine.prototype.softDrop = function () { var p = { type: this.cur.type, r: this.cur.r, x: this.cur.x, y: this.cur.y + 1 }; if (!this._collides(p)) { this.cur.y++; this.score += 1; return true; } return this._lock(); };
  Engine.prototype.hardDrop = function () { var d = this.ghostY() - this.cur.y; this.cur.y = this.ghostY(); this.score += d * 2; return this._lock(); };
  Engine.prototype.step = function () { var p = { type: this.cur.type, r: this.cur.r, x: this.cur.x, y: this.cur.y + 1 }; if (!this._collides(p)) { this.cur.y++; return { locked: false, cleared: 0, garbage: 0 }; } return this._lock(); };
  Engine.prototype.holdPiece = function () {
    if (this.holdUsed) return false;
    var cur = this.cur.type;
    if (this.hold) { var h = this.hold; this.hold = cur; this._spawn(h); } else { this.hold = cur; this._spawn(); }
    this.holdUsed = true; return true;
  };
  Engine.prototype._lock = function () {
    var m = this.minos(this.cur);
    for (var i = 0; i < m.length; i++) { var x = m[i][0], y = m[i][1]; if (y >= 0) this.board[y][x] = SHAPES[this.cur.type].c; else this.over = true; }
    var cleared = this._clear();
    var garbage = cleared >= 2 ? cleared - 1 : 0; // versus: N-line clear sends N-1 rows
    this.lines += cleared;
    this.score += [0, 100, 300, 500, 800][cleared] * this.level;
    this.level = 1 + Math.floor(this.lines / 10);
    if (this.pendingGarbage && cleared === 0) { this._applyGarbage(this.pendingGarbage); this.pendingGarbage = 0; }
    else if (cleared > 0) this.pendingGarbage = Math.max(0, this.pendingGarbage - cleared);
    this._spawn();
    return { locked: true, cleared: cleared, garbage: garbage };
  };
  Engine.prototype._clear = function () {
    var kept = [], cleared = 0;
    for (var y = 0; y < this.rows; y++) { if (this.board[y].every(function (v) { return v; })) cleared++; else kept.push(this.board[y]); }
    while (kept.length < this.rows) kept.unshift(new Array(this.cols).fill(0));
    this.board = kept; return cleared;
  };
  Engine.prototype.addGarbage = function (n) { this.pendingGarbage += n; };
  Engine.prototype._applyGarbage = function (n) {
    for (var g = 0; g < n; g++) {
      var gap = Math.floor(this.rand() * this.cols);
      var row = new Array(this.cols).fill(8); row[gap] = 0; // 8 = garbage colour
      this.board.shift(); this.board.push(row);
    }
    if (this._collides(this.cur)) this.over = true;
  };
  Engine.prototype.dropInterval = function () { return Math.max(90, 1000 - (this.level - 1) * 85); };

  var api = { Engine: Engine, SHAPES: SHAPES, TYPES: TYPES, COLS: COLS, ROWS: ROWS, rotatedCells: rotatedCells };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else global.BlockCore = api;
})(typeof window !== 'undefined' ? window : this);
