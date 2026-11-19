/**
 * Crossword game — UI + solving + multiplayer. Uses the shared infra
 * (Net/Input/Audio/Leaderboard/RTC) + CrosswordCore + THEME_CONTENT (content.js).
 *
 * The FIX vs v1: the player types letters FREELY (right or wrong); the answer is
 * NEVER leaked on wrong input. You check with the Check button, reveal a
 * cell/word for a penalty, and win when the whole grid is correct.
 *
 * Modes: solo · co-op (shared board, per-player colours + live cursors) ·
 * versus (same puzzle, separate boards, race to 100%). Responsive board + clue
 * layout; touch on-screen keyboard; TV D-pad/remote focus nav.
 */
(function () {
  var GAME = 'Crossword';
  var COLORS = ['#00d4ff', '#f59e0b', '#22c55e', '#ef4444', '#a78bfa'];
  var mode = 'solo', diff = 'easy', myColor = COLORS[0];
  var grid = null, cells = null, sel = null, selDir = 'a';
  var timeLeft = 0, timer = null, score = 0, reveals = 0, active = false;
  var cursors = {}; // peerId -> {r,c,color}

  function $(id) { return document.getElementById(id); }
  function words() { return (typeof THEME_CONTENT !== 'undefined' && THEME_CONTENT[diff]) ? THEME_CONTENT[diff] : (typeof THEME_CONTENT !== 'undefined' ? THEME_CONTENT.easy : []); }
  function total() { return Object.keys(cells || {}).length; }
  function correctCount() { var n = 0; for (var k in cells) if (cells[k].cur && cells[k].cur === cells[k].ans) n++; return n; }

  // ── Lobby ───────────────────────────────────────────────────────────────────
  function setDiff(d, el) { diff = d; document.querySelectorAll('.diff .focusable').forEach(function (b) { b.classList.remove('active'); }); el.classList.add('active'); }
  function setMode(m, el) { mode = m; document.querySelectorAll('.mode .focusable').forEach(function (b) { b.classList.remove('active'); }); el.classList.add('active'); $('mp-panel').style.display = (m === 'solo') ? 'none' : 'block'; }
  window.setDiff = setDiff; window.setMode = setMode;

  window.playSolo = function () { myName(); start(seedFor('solo-' + Date.now())); };

  window.joinRoom = function () {
    myName();
    var room = ($('room-id').value || 'lobby').trim().toLowerCase().replace(/[^a-z0-9-]/g, '') || 'lobby';
    Net.join({ room: room, name: GameName, color: myColor, mode: mode });
    $('mp-status').textContent = 'Joining ' + room + '…';
    showWaiting();
  };

  var GameName = 'Player';
  function myName() { GameName = ($('pname').value || 'Player').slice(0, 16); }
  function seedFor(s) { var h = 0; for (var i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0; return h || 1; }

  function showWaiting() {
    $('lobby').style.display = 'none'; $('waiting').style.display = 'flex';
    renderRoster();
  }
  function renderRoster() {
    var el = $('roster'); if (!el) return;
    el.innerHTML = Net.players.map(function (p) {
      return '<div class="ros-row"><span class="dot" style="background:' + p.color + '"></span><span>' + esc(p.name) + (p.id === Net.id ? ' (you)' : '') + (p.id === Net.hostId ? ' ★' : '') + '</span><span class="ros-rt">' + (p.ready ? '✓' : '…') + '</span></div>';
    }).join('');
    $('start-btn').style.display = Net.isHost ? '' : 'none';
    $('ready-btn').textContent = (myPlayer() && myPlayer().ready) ? 'Not ready' : 'Ready';
  }
  function myPlayer() { return Net.players.filter(function (p) { return p.id === Net.id; })[0]; }

  window.toggleReady = function () { var p = myPlayer(); Net.ready(!(p && p.ready)); };
  window.hostStart = function () { Net.start(mode); };
  window.leaveRoom = function () { location.reload(); };

  // ── Game start / grid ────────────────────────────────────────────────────────
  function start(seed) {
    $('lobby').style.display = 'none'; $('waiting').style.display = 'none'; $('game').style.display = 'flex'; $('gameover').style.display = 'none';
    grid = CrosswordCore.buildGrid(words(), seed);
    cells = {}; for (var k in grid.cells) cells[k] = { r: +k.split(',')[0], c: +k.split(',')[1], ans: grid.cells[k].ans, num: grid.cells[k].num, cur: '', by: '', checked: 0 };
    timeLeft = diff === 'easy' ? 900 : diff === 'hard' ? 300 : 600;
    score = 0; reveals = 0; active = true; sel = null; cursors = {};
    Input.stopFocus(); // gameplay: arrows move the cell selection, not menu focus
    layout(); renderGrid(); renderClues(); startTimer();
    Audio.startMusic();
    $('mode-tag').textContent = mode === 'coop' ? 'Co-op' : mode === 'versus' ? 'Versus' : 'Solo';
    if (mode !== 'solo') pushProgress();
  }

  function layout() {
    // Fit the grid to the available space (responsive: phone → TV).
    var wrap = $('board-wrap');
    var maxW = wrap.clientWidth || window.innerWidth;
    var maxH = (window.innerHeight * (window.innerWidth > window.innerHeight ? 0.7 : 0.52));
    var size = Math.max(18, Math.min(Math.floor(maxW / grid.cols) - 2, Math.floor(maxH / grid.rows) - 2, 64));
    document.documentElement.style.setProperty('--cell', size + 'px');
    document.documentElement.style.setProperty('--cols', grid.cols);
  }
  window.addEventListener('resize', function () { if (active && grid) { layout(); } });
  window.addEventListener('orientationchange', function () { setTimeout(function () { if (active && grid) layout(); }, 200); });

  function renderGrid() {
    var g = $('board'); if (!g) return;
    g.style.gridTemplateColumns = 'repeat(' + grid.cols + ', var(--cell))';
    var html = '';
    for (var r = 0; r < grid.rows; r++) for (var c = 0; c < grid.cols; c++) {
      var k = r + ',' + c, cell = cells[k];
      if (!cell) { html += '<div class="cx-blk"></div>'; continue; }
      var cls = 'cx-cell';
      if (sel && sel === k) cls += ' cx-sel';
      else if (inSelWord(r, c)) cls += ' cx-hl';
      if (cell.checked === 1) cls += ' cx-ok'; else if (cell.checked === -1) cls += ' cx-bad';
      var cur = '';
      for (var pid in cursors) { if (cursors[pid].r === r && cursors[pid].c === c) cur = '<span class="cx-cur" style="background:' + cursors[pid].color + '"></span>'; }
      var style = cell.by ? ' style="color:' + cell.by + '"' : '';
      html += '<div class="' + cls + '" data-k="' + k + '" role="button" tabindex="-1">' +
        (cell.num ? '<span class="cx-num">' + cell.num + '</span>' : '') + cur +
        '<span class="cx-let"' + style + '>' + (cell.cur || '') + '</span></div>';
    }
    g.innerHTML = html;
    Array.prototype.forEach.call(g.querySelectorAll('.cx-cell'), function (el) { el.onclick = function () { selectCell(el.getAttribute('data-k')); }; });
  }

  function inSelWord(r, c) {
    if (!sel) return false; var w = curWord(); if (!w) return false;
    for (var i = 0; i < w.len; i++) { var cr = w.r + (w.dir === 'd' ? i : 0), cc = w.c + (w.dir === 'a' ? i : 0); if (cr === r && cc === c) return true; }
    return false;
  }
  function curWord() {
    if (!sel) return null; var p = sel.split(','), r = +p[0], c = +p[1];
    var matches = grid.words.filter(function (w) {
      for (var i = 0; i < w.len; i++) { var cr = w.r + (w.dir === 'd' ? i : 0), cc = w.c + (w.dir === 'a' ? i : 0); if (cr === r && cc === c && w.dir === selDir) return true; }
      return false;
    });
    return matches[0] || null;
  }

  function selectCell(k) {
    if (!cells[k]) return;
    if (sel === k) { selDir = selDir === 'a' ? 'd' : 'a'; } else { sel = k; }
    renderGrid(); renderClues();
    if (mode !== 'solo') Net.sendState({ cursor: { r: cells[k].r, c: cells[k].c, color: myColor } });
  }

  function renderClues() {
    var ac = '', dn = '';
    grid.words.forEach(function (w) {
      var cw = curWord();
      var actv = cw && cw.num === w.num && cw.dir === w.dir;
      var line = '<div class="clue focusable' + (actv ? ' act' : '') + '" tabindex="0" data-num="' + w.num + '" data-dir="' + w.dir + '">' + w.num + '. ' + esc(w.clue) + '</div>';
      if (w.dir === 'a') ac += line; else dn += line;
    });
    $('clue-across').innerHTML = ac || '<div class="lb-empty">—</div>';
    $('clue-down').innerHTML = dn || '<div class="lb-empty">—</div>';
    document.querySelectorAll('.clue').forEach(function (el) { el.onclick = function () { gotoClue(+el.getAttribute('data-num'), el.getAttribute('data-dir')); }; });
    var cw = curWord();
    $('clue-bar').textContent = cw ? (cw.num + ' ' + (cw.dir === 'a' ? 'Across' : 'Down') + ': ' + cw.clue) : 'Tap a cell, then type. Check when ready.';
  }
  function gotoClue(num, dir) { var w = grid.words.filter(function (x) { return x.num === num && x.dir === dir; })[0]; if (!w) return; sel = w.r + ',' + w.c; selDir = dir; renderGrid(); renderClues(); }

  // ── Typing (free entry — never leaks the answer) ─────────────────────────────
  function typeLetter(ch) {
    if (!active || !sel) return;
    var cell = cells[sel]; if (!cell) return;
    if (ch === '\b') { cell.cur = ''; cell.checked = 0; cell.by = ''; broadcastFill(cell); renderGrid(); return; }
    if (!/^[A-Z]$/.test(ch)) return;
    cell.cur = ch; cell.checked = 0; cell.by = mode === 'coop' ? myColor : '';
    Audio.play('tick');
    broadcastFill(cell);
    advance();
    renderGrid(); renderClues();
    if (correctCount() === total() && allFilled()) win();
  }
  function allFilled() { for (var k in cells) if (!cells[k].cur) return false; return true; }
  function advance() {
    var w = curWord(); if (!w) return; var p = sel.split(','), r = +p[0], c = +p[1];
    for (var i = 0; i < w.len; i++) {
      var cr = w.r + (w.dir === 'd' ? i : 0), cc = w.c + (w.dir === 'a' ? i : 0);
      if ((w.dir === 'a' && cc > c) || (w.dir === 'd' && cr > r)) { if (cells[cr + ',' + cc] && !cells[cr + ',' + cc].cur) { sel = cr + ',' + cc; return; } }
    }
  }
  function moveSel(d) {
    if (!sel) { sel = firstCellKey(); renderGrid(); renderClues(); return; }
    var p = sel.split(','), r = +p[0], c = +p[1], dr = 0, dc = 0;
    if (d === 'left') dc = -1; else if (d === 'right') dc = 1; else if (d === 'up') dr = -1; else dr = 1;
    selDir = (dr !== 0) ? 'd' : 'a';
    for (var step = 1; step < Math.max(grid.rows, grid.cols); step++) {
      var nk = (r + dr * step) + ',' + (c + dc * step);
      if (cells[nk]) { sel = nk; renderGrid(); renderClues(); return; }
    }
  }
  function firstCellKey() { for (var r = 0; r < grid.rows; r++) for (var c = 0; c < grid.cols; c++) if (cells[r + ',' + c]) return r + ',' + c; return null; }

  // ── Check / reveal (no leak until asked) ─────────────────────────────────────
  window.checkBoard = function () {
    var wrong = 0;
    for (var k in cells) { var cell = cells[k]; if (cell.cur) { cell.checked = (cell.cur === cell.ans) ? 1 : -1; if (cell.checked === -1) wrong++; } }
    Audio.play(wrong ? 'bad' : 'good'); renderGrid();
    if (mode !== 'solo') pushProgress();
  };
  window.revealCell = function () {
    if (!active || !sel) return; var cell = cells[sel]; if (!cell) return;
    cell.cur = cell.ans; cell.checked = 1; cell.by = ''; reveals++; score -= 5;
    Audio.play('warn'); broadcastFill(cell); advance(); renderGrid(); renderClues();
    if (correctCount() === total() && allFilled()) win();
  };
  window.revealWord = function () {
    if (!active) return; var w = curWord(); if (!w) return;
    for (var i = 0; i < w.len; i++) { var cr = w.r + (w.dir === 'd' ? i : 0), cc = w.c + (w.dir === 'a' ? i : 0); var cell = cells[cr + ',' + cc]; if (cell) { cell.cur = cell.ans; cell.checked = 1; cell.by = ''; broadcastFill(cell); } }
    reveals++; score -= 15; Audio.play('warn'); renderGrid();
    if (correctCount() === total() && allFilled()) win();
  };

  // ── Multiplayer sync ─────────────────────────────────────────────────────────
  function broadcastFill(cell) { if (mode === 'coop') Net.sendEvent('fill', { r: cell.r, c: cell.c, letter: cell.cur, by: myColor }); }
  function pushProgress() { var pct = Math.round(100 * correctCount() / Math.max(1, total())); Net.sendScore(pct); }

  function wireNet() {
    Net.on('roster', function () { if ($('waiting').style.display !== 'none') renderRoster(); if (active) renderStandings(); });
    Net.on('started', function (d) { start(d.seed); });
    Net.on('reset', function () { location.reload(); });
    Net.on('room-full', function () { $('mp-status').textContent = 'Room is full — try another.'; });
    Net.on('event', function (m) {
      if (m.type === 'fill' && mode === 'coop' && active) {
        var k = m.data.r + ',' + m.data.c, cell = cells[k];
        if (cell) { cell.cur = m.data.letter; cell.by = m.data.by; cell.checked = 0; renderGrid(); if (correctCount() === total() && allFilled()) win(); }
      }
    });
    Net.on('state', function (m) {
      if (m.d && m.d.cursor && mode === 'coop') { cursors[m.from] = m.d.cursor; renderGrid(); }
    });
    Net.on('peer-leave', function (m) { delete cursors[m.from]; renderStandings(); });
  }
  function renderStandings() {
    var el = $('standings'); if (!el || mode === 'solo') { if (el) el.style.display = 'none'; return; }
    el.style.display = 'block';
    var ps = Net.players.slice().sort(function (a, b) { return b.score - a.score; });
    el.innerHTML = ps.map(function (p) { return '<div class="ros-row"><span class="dot" style="background:' + p.color + '"></span><span>' + esc(p.name) + '</span><span class="ros-rt">' + p.score + '%</span></div>'; }).join('');
  }

  // ── Timer / end ──────────────────────────────────────────────────────────────
  function startTimer() {
    if (timer) clearInterval(timer);
    timer = setInterval(function () {
      if (!active) return; timeLeft--;
      var m = Math.floor(timeLeft / 60), s = timeLeft % 60;
      $('timer').textContent = (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s;
      $('timer').classList.toggle('warn', timeLeft <= 60);
      if (timeLeft <= 30 && timeLeft % 10 === 0) Audio.play('warn');
      $('score').textContent = score >= 0 ? score : 0;
      if (timeLeft <= 0) end(false);
    }, 1000);
  }
  function win() { score += Math.max(0, timeLeft) * 2 + 100; end(true); }
  function end(completed) {
    if (!active) return; active = false; if (timer) clearInterval(timer);
    score = Math.max(0, score); Audio.stopMusic(); Audio.play(completed ? 'win' : 'lose');
    Leaderboard.submit(GameName, score, GAME, mode); if (mode !== 'solo') Net.sendScore(Math.round(100 * correctCount() / Math.max(1, total())));
    $('go-title').textContent = completed ? '🎉 Solved!' : "⏱ Time's up";
    $('go-stats').textContent = 'Score ' + score + ' · ' + correctCount() + '/' + total() + ' cells' + (reveals ? ' · ' + reveals + ' reveals' : '');
    Leaderboard.render('go-lb', { limit: 10, mode: mode });
    $('gameover').style.display = 'flex';
    Input.focusables(); // game-over menu is focus-navigable again
  }
  window.playAgain = function () { $('gameover').style.display = 'none'; if (mode === 'solo') start(seedFor('solo-' + Date.now())); else if (Net.isHost) Net.restart(); };

  function esc(s) { return String(s == null ? '' : s).replace(/[<>&]/g, function (c) { return { '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c]; }); }

  // ── Boot ─────────────────────────────────────────────────────────────────────
  window.addEventListener('DOMContentLoaded', function () {
    var caps = Input.init();
    Net.connect(); wireNet();
    // colour swatches
    var sw = $('swatches'); if (sw) sw.innerHTML = COLORS.map(function (c, i) { return '<button class="swatch focusable' + (i === 0 ? ' active' : '') + '" style="background:' + c + '" data-c="' + c + '"></button>'; }).join('');
    document.querySelectorAll('.swatch').forEach(function (b) { b.onclick = function () { myColor = b.getAttribute('data-c'); document.querySelectorAll('.swatch').forEach(function (x) { x.classList.remove('active'); }); b.classList.add('active'); }; });
    Leaderboard.render('lb-list', { limit: 8 });
    Input.focusables();

    Input.on('text', typeLetter);
    Input.on('dir', function (d) { if (active) moveSel(d); });
    Input.on('act', function (a) { if (!active) return; if (a === 'action') { var cw = curWord(); if (cw) { selDir = selDir === 'a' ? 'd' : 'a'; renderGrid(); renderClues(); } } else if (a === 'cancel') { window.checkBoard(); } });
    if (caps.coarse || caps.touch) Input.mountKeyboard();
    // Voice/video
    $('voice-btn').onclick = function () { RTC.startVoice().then(function (ok) { $('voice-btn').textContent = ok ? '🎙 On' : 'Voice'; $('voice-btn').classList.toggle('on', ok); }); };
    $('video-btn').onclick = function () { RTC.startVideo().then(function (ok) { $('video-btn').textContent = ok ? '📹 On' : 'Video'; $('video-btn').classList.toggle('on', ok); }); };
    $('mute-btn').onclick = function () { $('mute-btn').textContent = Audio.toggle() ? '🔊' : '🔇'; };
  });
})();
