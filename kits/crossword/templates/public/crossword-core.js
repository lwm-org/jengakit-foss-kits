/**
 * crossword-core — PURE crossword grid generation. No DOM. Node + browser.
 *
 * Fixes the v1 engine's two structural bugs:
 *   1) it never DROPS a word — words that can't cross an existing letter are
 *      placed isolated in free rows, so every clue always appears;
 *   2) it is deterministic per seed (all players in a room get the same grid).
 *
 * buildGrid(wordList, seed) → {
 *   cells: { "r,c": { ans: 'A', num: 3|undefined } },   // only real cells
 *   words: [ { word, clue, r, c, dir: 'a'|'d', num, len, isolated } ],
 *   rows, cols
 * }
 * The SOLUTION lives here; the game never reveals it on wrong input (it checks
 * only when the player asks). validateGrid() is used by the tests.
 */
(function (global) {
  function mulberry32(seed) {
    var s = seed | 0;
    return function () {
      s = (s + 0x6d2b79f5) | 0;
      var t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function norm(word) { return String(word || '').toUpperCase().replace(/[^A-Z]/g, ''); }

  function tryPlace(grid, word, r, c, dir) {
    // Returns crossings count if legal at (r,c,dir), else -1.
    var cross = 0;
    for (var i = 0; i < word.length; i++) {
      var cr = r + (dir === 'd' ? i : 0), cc = c + (dir === 'a' ? i : 0);
      var k = cr + ',' + cc, ex = grid[k];
      if (ex !== undefined) {
        if (ex !== word[i]) return -1;
        cross++;
      } else {
        // No perpendicular neighbours unless this cell is a crossing.
        if (dir === 'a') {
          if (grid[(cr - 1) + ',' + cc] !== undefined || grid[(cr + 1) + ',' + cc] !== undefined) return -1;
        } else {
          if (grid[cr + ',' + (cc - 1)] !== undefined || grid[cr + ',' + (cc + 1)] !== undefined) return -1;
        }
        // No touching before the start / after the end.
        if (i === 0) { var pk = dir === 'd' ? (r - 1) + ',' + c : r + ',' + (c - 1); if (grid[pk] !== undefined) return -1; }
        if (i === word.length - 1) { var nk = dir === 'd' ? (r + word.length) + ',' + c : r + ',' + (c + word.length); if (grid[nk] !== undefined) return -1; }
      }
    }
    return cross;
  }

  function commit(grid, placed, w) {
    for (var i = 0; i < w.word.length; i++) {
      var cr = w.r + (w.dir === 'd' ? i : 0), cc = w.c + (w.dir === 'a' ? i : 0);
      grid[cr + ',' + cc] = w.word[i];
    }
    placed.push(w);
  }

  function buildGrid(wordList, seed) {
    var rand = mulberry32((seed | 0) || 1);
    var items = (wordList || []).map(function (w) { return { word: norm(w.word), clue: String(w.clue || '') }; })
      .filter(function (w) { return w.word.length >= 2; });
    // Seeded shuffle then longest-first for denser crossings.
    for (var i = items.length - 1; i > 0; i--) { var j = Math.floor(rand() * (i + 1)); var t = items[i]; items[i] = items[j]; items[j] = t; }
    items.sort(function (a, b) { return b.word.length - a.word.length; });

    var grid = {}, placed = [];
    if (!items.length) return { cells: {}, words: [], rows: 0, cols: 0 };

    // First word horizontal at origin.
    commit(grid, placed, { word: items[0].word, clue: items[0].clue, r: 0, c: 0, dir: 'a' });

    var pending = items.slice(1), progress = true;
    while (pending.length && progress) {
      progress = false;
      var next = [];
      for (var pi = 0; pi < pending.length; pi++) {
        var w = pending[pi], best = null, bestCross = 0;
        for (var li = 0; li < w.word.length; li++) {
          for (var key in grid) {
            if (grid[key] !== w.word[li]) continue;
            var p = key.split(','), gr = +p[0], gc = +p[1];
            // crossing this letter, both orientations
            var candA = { r: gr, c: gc - li, dir: 'a' }, candD = { r: gr - li, c: gc, dir: 'd' };
            [candA, candD].forEach(function (cand) {
              var cr = tryPlace(grid, w.word, cand.r, cand.c, cand.dir);
              if (cr > bestCross) { bestCross = cr; best = { word: w.word, clue: w.clue, r: cand.r, c: cand.c, dir: cand.dir }; }
            });
          }
        }
        if (best) { commit(grid, placed, best); progress = true; } else next.push(w);
      }
      pending = next;
    }

    // Any still-unplaced word: place ISOLATED in a fresh row below everything so
    // no clue is ever lost (the v1 bug was silently dropping these).
    if (pending.length) {
      var maxR = -Infinity, minC = Infinity;
      for (var k in grid) { var q = k.split(','); if (+q[0] > maxR) maxR = +q[0]; if (+q[1] < minC) minC = +q[1]; }
      var row = maxR + 2;
      pending.forEach(function (w) {
        commit(grid, placed, { word: w.word, clue: w.clue, r: row, c: minC, dir: 'a', isolated: true });
        row += 2;
      });
    }

    // Normalise to 0-based.
    var mnR = Infinity, mxR = -Infinity, mnC = Infinity, mxC = -Infinity;
    for (var kk in grid) { var pp = kk.split(','), r = +pp[0], c = +pp[1]; if (r < mnR) mnR = r; if (r > mxR) mxR = r; if (c < mnC) mnC = c; if (c > mxC) mxC = c; }
    var cells = {};
    for (var k2 in grid) { var s = k2.split(','); cells[(+s[0] - mnR) + ',' + (+s[1] - mnC)] = { ans: grid[k2] }; }
    placed.forEach(function (w) { w.r -= mnR; w.c -= mnC; w.len = w.word.length; });

    // Clue numbers: scan order, number each word-start cell once.
    var rows = mxR - mnR + 1, cols = mxC - mnC + 1, num = 1, numAt = {};
    for (var rr = 0; rr < rows; rr++) for (var cc = 0; cc < cols; cc++) {
      var isStart = placed.some(function (w) { return w.r === rr && w.c === cc; });
      if (isStart) { numAt[rr + ',' + cc] = num; if (cells[rr + ',' + cc]) cells[rr + ',' + cc].num = num; num++; }
    }
    placed.forEach(function (w) { w.num = numAt[w.r + ',' + w.c] || 0; });
    placed.sort(function (a, b) { return a.num - b.num; });

    return { cells: cells, words: placed, rows: rows, cols: cols };
  }

  // Used by tests: every input word present + no conflicting crossings.
  function validateGrid(wordList, grid) {
    var errors = [];
    var wanted = (wordList || []).map(function (w) { return norm(w.word); }).filter(function (w) { return w.length >= 2; });
    var got = grid.words.map(function (w) { return w.word; });
    wanted.forEach(function (w) { if (got.indexOf(w) < 0) errors.push('dropped word: ' + w); });
    // Each placed word's cells must match the answer grid.
    grid.words.forEach(function (w) {
      for (var i = 0; i < w.word.length; i++) {
        var cr = w.r + (w.dir === 'd' ? i : 0), cc = w.c + (w.dir === 'a' ? i : 0);
        var cell = grid.cells[cr + ',' + cc];
        if (!cell) { errors.push('missing cell for ' + w.word + '@' + i); break; }
        if (cell.ans !== w.word[i]) { errors.push('crossing conflict in ' + w.word); break; }
      }
    });
    return errors;
  }

  var api = { buildGrid: buildGrid, validateGrid: validateGrid, _norm: norm };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else global.CrosswordCore = api;
})(typeof window !== 'undefined' ? window : this);
