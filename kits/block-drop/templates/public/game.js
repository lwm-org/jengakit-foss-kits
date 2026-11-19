/**
 * Block-drop game — canvas render (DPR-crisp) + loop + input + versus.
 * Uses shared infra (Net/Input/Audio/Leaderboard/RTC) + BlockCore + THEME.
 * The engine (block-core.js) is fixed; the LLM only themes it via theme.js.
 * Modes: solo · versus (2–4, seeded-fair pieces, garbage rows, last-standing).
 * Responsive: board fits viewport phone→TV; touch D-pad; keyboard/gamepad.
 */
(function () {
  var GAME = 'Block Drop';
  var mode = 'solo', diff = 'medium';
  var eng = null, over = false, running = false;
  var dropAcc = 0, lastT = 0, moveAcc = 0, softAcc = 0, dasT = 0;
  var cell = 24, DPR = 1;
  var opp = {}; // peerId -> {board,score,name,color,ko}
  var GameName = 'Player';
  var boardCv, boardCx, holdCv, nextCv;

  function $(id) { return document.getElementById(id); }
  function T() { return (typeof THEME !== 'undefined') ? THEME : {}; }
  function pieceColor(c) { var t = T(); return (t.pieceColors && t.pieceColors[c]) || ['#000', '#31c7ef', '#f7d308', '#ad4d9c', '#42b642', '#ef2029', '#5a65ad', '#ef7921'][c] || '#888'; }
  function garbageColor() { return T().garbage || '#5b6472'; }

  // ── Lobby ─────────────────────────────────────────────────────────────────
  window.setDiff = function (d, el) { diff = d; document.querySelectorAll('.diff .focusable').forEach(function (b) { b.classList.remove('active'); }); el.classList.add('active'); };
  window.setMode = function (m, el) { mode = m; document.querySelectorAll('.mode .focusable').forEach(function (b) { b.classList.remove('active'); }); el.classList.add('active'); $('mp-panel').style.display = m === 'solo' ? 'none' : 'block'; };
  function myName() { GameName = ($('pname').value || 'Player').slice(0, 16); }
  function seedFor(s) { var h = 0; for (var i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0; return h || 1; }

  window.playSolo = function () { myName(); begin(seedFor('solo-' + Date.now())); };
  window.joinRoom = function () {
    myName();
    var room = ($('room-id').value || 'lobby').trim().toLowerCase().replace(/[^a-z0-9-]/g, '') || 'lobby';
    Net.join({ room: room, name: GameName, color: '#31c7ef', mode: 'versus' });
    $('lobby').style.display = 'none'; $('waiting').style.display = 'flex'; renderRoster();
  };
  function renderRoster() {
    $('roster').innerHTML = Net.players.map(function (p) { return '<div class="ros-row"><span class="dot" style="background:' + p.color + '"></span><span>' + esc(p.name) + (p.id === Net.id ? ' (you)' : '') + (p.id === Net.hostId ? ' ★' : '') + '</span></div>'; }).join('');
    $('start-btn').style.display = Net.isHost ? '' : 'none';
  }
  window.toggleReady = function () { var me = Net.players.filter(function (p) { return p.id === Net.id; })[0]; Net.ready(!(me && me.ready)); };
  window.hostStart = function () { Net.start('versus'); };
  window.leaveRoom = function () { location.reload(); };

  // ── Start ─────────────────────────────────────────────────────────────────
  function begin(seed) {
    $('lobby').style.display = 'none'; $('waiting').style.display = 'none'; $('gameover').style.display = 'none';
    $('game').style.display = 'flex';
    boardCv = $('board'); boardCx = boardCv.getContext('2d'); holdCv = $('hold'); nextCv = $('next');
    eng = new BlockCore.Engine(seed, { cols: 10, rows: 20 });
    if (diff === 'medium') { eng.pendingGarbage = 0; } if (diff === 'hard') { eng.addGarbage(4); eng._applyGarbage(4); eng.pendingGarbage = 0; }
    if (diff === 'easy') eng.level = 1;
    over = false; running = true; opp = {}; dropAcc = 0; lastT = performance.now();
    Input.stopFocus(); // gameplay: arrows/D-pad drive the piece, not menu focus
    resize(); $('mode-tag').textContent = mode === 'versus' ? 'Versus' : 'Solo';
    $('opp-wrap').style.display = mode === 'versus' ? 'flex' : 'none';
    Audio.startMusic();
    var caps = Input.capsCache || {}; if (document.body.classList.contains('is-touch') || document.body.classList.contains('is-coarse')) Input.mountDpad();
    requestAnimationFrame(loop);
    if (mode === 'versus') { broadcastTimer = setInterval(broadcastBoard, 250); }
  }

  // ── Responsive sizing (fit board 10×20 + side panels; DPR-crisp) ──────────
  function resize() {
    if (!eng) return;
    var vw = window.innerWidth, vh = window.innerHeight;
    // The hold + next panels ALWAYS flank the board, so always reserve their
    // width (narrower on phones) — otherwise they overflow small screens.
    // Wide screens flank the board with hold/next panels (reserve their width);
    // narrow screens (<=560px) stack them in a compact row ABOVE a full-width
    // board (CSS media query), so nothing overflows.
    var sideW = vw > 900 ? 128 : vw > 560 ? 96 : 0;
    var availW = vw * 0.98 - 2 * sideW - 20;
    var landscape = vw >= vh;
    var maxH = vh * (landscape ? 0.84 : sideW ? 0.66 : 0.6);
    cell = Math.max(11, Math.min(Math.floor(maxH / 20), Math.floor(availW / 10), 46));
    DPR = Math.min(window.devicePixelRatio || 1, 3);
    sizeCanvas(boardCv, boardCx, 10 * cell, 20 * cell);
    // Mini piece cell: fit 4 across within the reserved side width (wide), or a
    // sensible fraction of the cell (narrow top strip).
    var mc = cell * 0.7;
    if (sideW) mc = Math.min(mc, (sideW - 14) / 4);
    if (holdCv) sizeCanvas(holdCv, holdCv.getContext('2d'), 4 * mc, 4 * mc);
    if (nextCv) sizeCanvas(nextCv, nextCv.getContext('2d'), 4 * mc, 12 * mc);
    window._miniCell = mc;
  }
  function sizeCanvas(cv, cx, w, h) { cv.style.width = w + 'px'; cv.style.height = h + 'px'; cv.width = Math.floor(w * DPR); cv.height = Math.floor(h * DPR); cx.setTransform(DPR, 0, 0, DPR, 0, 0); }
  window.addEventListener('resize', function () { resize(); });
  window.addEventListener('orientationchange', function () { setTimeout(resize, 200); });

  // ── Render ────────────────────────────────────────────────────────────────
  function drawCell(cx, x, y, s, color, ghost) {
    var px = x * s, py = y * s;
    if (ghost) { cx.strokeStyle = color; cx.globalAlpha = 0.5; cx.lineWidth = 2; cx.strokeRect(px + 2, py + 2, s - 4, s - 4); cx.globalAlpha = 1; return; }
    cx.fillStyle = color; cx.fillRect(px, py, s, s);
    cx.fillStyle = 'rgba(255,255,255,.25)'; cx.fillRect(px, py, s, s * 0.16);
    cx.strokeStyle = 'rgba(0,0,0,.35)'; cx.lineWidth = 1; cx.strokeRect(px + 0.5, py + 0.5, s - 1, s - 1);
  }
  function render() {
    var cx = boardCx; cx.fillStyle = T().bg || '#0b0f1a'; cx.fillRect(0, 0, 10 * cell, 20 * cell);
    cx.strokeStyle = 'rgba(255,255,255,.04)';
    for (var i = 0; i <= 10; i++) { cx.beginPath(); cx.moveTo(i * cell, 0); cx.lineTo(i * cell, 20 * cell); cx.stroke(); }
    for (var j = 0; j <= 20; j++) { cx.beginPath(); cx.moveTo(0, j * cell); cx.lineTo(10 * cell, j * cell); cx.stroke(); }
    if (T().glow) cx.shadowBlur = cell * 0.35; else cx.shadowBlur = 0;
    for (var y = 0; y < 20; y++) for (var x = 0; x < 10; x++) { var v = eng.board[y][x]; if (v) { cx.shadowColor = v === 8 ? garbageColor() : pieceColor(v); drawCell(cx, x, y, cell, v === 8 ? garbageColor() : pieceColor(v)); } }
    // ghost + current
    var gy = eng.ghostY(); var col = pieceColor(BlockCore.SHAPES[eng.cur.type].c);
    cx.shadowBlur = 0;
    eng.minos({ type: eng.cur.type, r: eng.cur.r, x: eng.cur.x, y: gy }).forEach(function (m) { if (m[1] >= 0) drawCell(cx, m[0], m[1], cell, col, true); });
    if (T().glow) cx.shadowBlur = cell * 0.4; cx.shadowColor = col;
    eng.minos(eng.cur).forEach(function (m) { if (m[1] >= 0) drawCell(cx, m[0], m[1], cell, col); });
    cx.shadowBlur = 0;
    drawMini(holdCv, eng.hold ? [eng.hold] : []);
    drawMini(nextCv, eng.queue.slice(0, 3));
    $('score').textContent = eng.score; $('lines').textContent = eng.lines; $('level').textContent = eng.level;
    if (mode === 'versus') renderOpponents();
  }
  function drawMini(cv, types) {
    if (!cv) return; var cx = cv.getContext('2d'), s = window._miniCell || cell * 0.7; cx.clearRect(0, 0, cv.width, cv.height);
    types.forEach(function (t, i) {
      var cells = BlockCore.rotatedCells(t, 0), c = pieceColor(BlockCore.SHAPES[t].c), oy = i * 3.2 + 0.5;
      cells.forEach(function (m) { drawCell(cx, m[0] + 0.4, m[1] + oy, s, c); });
    });
  }
  function renderOpponents() {
    var wrap = $('opp-wrap'); var ids = Object.keys(opp);
    wrap.innerHTML = ids.map(function (id) { return '<div class="opp"><canvas id="opp-' + id + '" width="60" height="120"></canvas><div class="opp-name">' + esc(opp[id].name) + (opp[id].ko ? ' ✗' : '') + '</div></div>'; }).join('') || '<div class="opp-empty">Waiting…</div>';
    ids.forEach(function (id) {
      var c = $('opp-' + id); if (!c) return; var cx = c.getContext('2d'), s = 6; cx.fillStyle = '#0b0f1a'; cx.fillRect(0, 0, 60, 120);
      var b = opp[id].board || []; for (var y = 0; y < b.length; y++) for (var x = 0; x < 10; x++) if (b[y][x]) { cx.fillStyle = b[y][x] === 8 ? garbageColor() : pieceColor(b[y][x]); cx.fillRect(x * s, y * s, s - 1, s - 1); }
    });
  }

  // ── Loop ──────────────────────────────────────────────────────────────────
  function loop(t) {
    if (!running) return;
    var dt = t - lastT; lastT = t;
    // horizontal DAS
    if (Input.held('left') || Input.held('right')) { dasT += dt; if (dasT > 130) { moveAcc += dt; if (moveAcc > 45) { eng.move(Input.held('left') ? -1 : 1); moveAcc = 0; } } }
    else { dasT = 0; moveAcc = 999; }
    if (Input.held('down')) { softAcc += dt; if (softAcc > 45) { var r = eng.softDrop(); softAcc = 0; if (r && r.locked) onLock(r); } }
    dropAcc += dt;
    if (dropAcc >= eng.dropInterval()) { dropAcc = 0; var res = eng.step(); if (res.locked) onLock(res); }
    if (eng.over && !over) return gameOver();
    render();
    requestAnimationFrame(loop);
  }
  function onLock(res) {
    Audio.play('land');
    if (res.cleared) { Audio.play(res.cleared >= 4 ? 'clear' : 'clear'); if (res.cleared >= 4) Audio.play('level'); }
    if (mode === 'versus' && res.garbage > 0) Net.sendEvent('garbage', { rows: res.garbage });
    if (eng.over) gameOver();
  }

  // ── Input ─────────────────────────────────────────────────────────────────
  function wireInput() {
    Input.on('dir', function (d) { if (!running || over) return; if (d === 'left') { eng.move(-1); dasT = 0; moveAcc = 0; } else if (d === 'right') { eng.move(1); dasT = 0; moveAcc = 0; } else if (d === 'up') { eng.rotate(1); Audio.play('drop'); } else if (d === 'down') { var r = eng.softDrop(); if (r && r.locked) onLock(r); } });
    Input.on('act', function (a) { if (!running || over) return; if (a === 'rotate') { eng.rotate(1); Audio.play('drop'); } else if (a === 'drop' || a === 'action') { var r = eng.hardDrop(); Audio.play('drop'); if (r && r.locked) onLock(r); } else if (a === 'hold') { eng.holdPiece(); } });
  }

  // ── Versus net ────────────────────────────────────────────────────────────
  var broadcastTimer = null;
  function broadcastBoard() { if (mode === 'versus' && eng) Net.sendState({ board: compress(eng.board), score: eng.score, name: GameName, ko: eng.over }); }
  function compress(b) { return b.map(function (row) { return row.slice(); }); }
  function wireNet() {
    Net.on('roster', function () { if ($('waiting').style.display !== 'none') renderRoster(); });
    Net.on('started', function (d) { begin(d.seed); });
    Net.on('reset', function () { location.reload(); });
    Net.on('event', function (m) { if (m.type === 'garbage' && running && eng) { eng.addGarbage(m.data.rows); Audio.play('garbage'); } });
    Net.on('state', function (m) { if (m.d && m.d.board) { opp[m.from] = { board: m.d.board, score: m.d.score, name: m.d.name || Net.playerName(m.from), color: '#888', ko: m.d.ko }; checkVersusWin(); } });
    Net.on('peer-leave', function (m) { delete opp[m.from]; });
  }
  function checkVersusWin() {
    if (mode !== 'versus' || over) return;
    var alive = Object.keys(opp).filter(function (id) { return !opp[id].ko; });
    if (!eng.over && alive.length === 0 && Object.keys(opp).length > 0) { win(); }
  }

  // ── End ───────────────────────────────────────────────────────────────────
  function gameOver() {
    if (over) return; over = true; running = false; if (broadcastTimer) clearInterval(broadcastTimer);
    Audio.stopMusic(); Audio.play('lose'); if (mode === 'versus') { broadcastBoard(); }
    finish('Game Over');
  }
  function win() { if (over) return; over = true; running = false; if (broadcastTimer) clearInterval(broadcastTimer); Audio.stopMusic(); Audio.play('win'); finish('🏆 You Win!'); }
  function finish(title) {
    Leaderboard.submit(GameName, eng.score, GAME, mode);
    $('go-title').textContent = title;
    $('go-stats').textContent = 'Score ' + eng.score + ' · ' + eng.lines + ' lines · level ' + eng.level;
    Leaderboard.render('go-lb', { limit: 10, mode: mode });
    $('gameover').style.display = 'flex';
    Input.focusables(); // game-over menu is focus-navigable again
  }
  window.playAgain = function () { $('gameover').style.display = 'none'; if (mode === 'solo') begin(seedFor('solo-' + Date.now())); else if (Net.isHost) Net.restart(); };

  function esc(s) { return String(s == null ? '' : s).replace(/[<>&]/g, function (c) { return { '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c]; }); }

  // ── Boot ──────────────────────────────────────────────────────────────────
  window.addEventListener('DOMContentLoaded', function () {
    Input.capsCache = Input.init(); Net.connect(); wireNet(); wireInput();
    $('title-el').textContent = (T().title || 'BLOCK DROP');
    Leaderboard.render('lb-list', { limit: 8 }); Input.focusables();
    $('voice-btn').onclick = function () { RTC.startVoice().then(function (ok) { $('voice-btn').textContent = ok ? '🎙 On' : 'Voice'; }); };
    $('video-btn').onclick = function () { RTC.startVideo().then(function (ok) { $('video-btn').textContent = ok ? '📹 On' : 'Video'; }); };
    $('mute-btn').onclick = function () { $('mute-btn').textContent = Audio.toggle() ? '🔊' : '🔇'; };
  });
})();
