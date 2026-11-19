/**
 * Input — one input layer for ALL form factors: desktop keyboard/mouse, phone/
 * tablet touch, and TV 10-foot UI (remote / D-pad / gamepad). Shared kit infra.
 *
 * Unified events (Input.on(evt, cb)):
 *   'dir'  → 'left'|'right'|'up'|'down'   (edge-triggered; also Input.held(dir))
 *   'act'  → 'action'|'rotate'|'drop'|'hold'|'cancel'
 *   'text' → a single A–Z letter (physical or on-screen keyboard)
 *
 * Also:
 *   Input.init()                     — capability detection + body classes
 *   Input.mountDpad()                — on-screen D-pad + buttons (action games)
 *   Input.mountKeyboard(onKey)       — on-screen A–Z keyboard (crossword, touch)
 *   Input.focusables()               — enable arrow/remote/gamepad menu focus nav
 *   Input.held(dir)                  — is a direction currently held
 *
 * Body classes set for CSS: `is-touch` `is-coarse` `has-hover` `is-tv`.
 */
(function (global) {
  var handlers = {}, held = { left: false, right: false, up: false, down: false };
  var padPrev = {}, focusEls = [], focusIdx = 0, focusOn = false, started = false;

  function emit(evt, v) { (handlers[evt] || []).forEach(function (cb) { try { cb(v); } catch (e) { console.warn('[input]', evt, e); } }); }
  function on(evt, cb) { (handlers[evt] = handlers[evt] || []).push(cb); return Input; }

  // ── Capability detection ───────────────────────────────────────────────────
  function detect() {
    var coarse = matchMedia('(pointer:coarse)').matches;
    var hover = matchMedia('(hover:hover)').matches;
    var touch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
    // Heuristic: big screen + no hover ≈ TV.
    var tv = !hover && Math.min(screen.width, screen.height) >= 720 && Math.max(screen.width, screen.height) >= 1280 && !touch;
    document.body.classList.toggle('is-touch', touch);
    document.body.classList.toggle('is-coarse', coarse);
    document.body.classList.toggle('has-hover', hover);
    document.body.classList.toggle('is-tv', tv);
    return { coarse: coarse, hover: hover, touch: touch, tv: tv };
  }

  // ── Keyboard ───────────────────────────────────────────────────────────────
  function keydown(e) {
    var k = e.key;
    if (k === 'ArrowLeft' || k === 'a' || k === 'A') { held.left = true; e.preventDefault(); return dir('left'); }
    if (k === 'ArrowRight' || k === 'd' || k === 'D') { held.right = true; e.preventDefault(); return dir('right'); }
    if (k === 'ArrowUp' || k === 'w' || k === 'W') { held.up = true; e.preventDefault(); return dir('up'); }
    if (k === 'ArrowDown' || k === 's' || k === 'S') { held.down = true; e.preventDefault(); return dir('down'); }
    if (k === ' ' || k === 'Spacebar') { e.preventDefault(); return act('drop'); }
    if (k === 'Enter') { e.preventDefault(); return act('action'); }
    if (k === 'Shift') { return act('hold'); }
    if (k === 'Escape') { return act('cancel'); }
    if (k && k.length === 1 && /[a-zA-Z]/.test(k)) { emit('text', k.toUpperCase()); }
    if (k === 'Backspace') { emit('text', '\b'); }
  }
  function keyup(e) {
    var k = e.key;
    if (k === 'ArrowLeft' || k === 'a' || k === 'A') held.left = false;
    if (k === 'ArrowRight' || k === 'd' || k === 'D') held.right = false;
    if (k === 'ArrowUp' || k === 'w' || k === 'W') held.up = false;
    if (k === 'ArrowDown' || k === 's' || k === 'S') held.down = false;
  }
  function dir(d) { if (focusOn && moveFocus(d)) return; emit('dir', d); }
  function act(a) { if (focusOn && a === 'action') { activateFocus(); return; } if (focusOn && a === 'cancel') { return; } emit('act', a); }

  // ── Gamepad (TV / controllers) ─────────────────────────────────────────────
  var DIRS = { 12: 'up', 13: 'down', 14: 'left', 15: 'right' };
  function pollPads() {
    var pads = navigator.getGamepads ? navigator.getGamepads() : [];
    for (var i = 0; i < pads.length; i++) {
      var p = pads[i]; if (!p) continue;
      var prev = padPrev[i] || {}; var cur = {};
      for (var b = 0; b < p.buttons.length; b++) cur[b] = p.buttons[b].pressed;
      Object.keys(DIRS).forEach(function (b) { if (cur[b] && !prev[b]) dir(DIRS[b]); held[DIRS[b]] = !!cur[b]; });
      var ax = p.axes || [];
      if (ax[0] < -0.6 && !(prev._lx < -0.6)) dir('left'); if (ax[0] > 0.6 && !(prev._lx > 0.6)) dir('right');
      if (ax[1] < -0.6 && !(prev._ly < -0.6)) dir('up'); if (ax[1] > 0.6 && !(prev._ly > 0.6)) dir('down');
      held.left = held.left || ax[0] < -0.5; held.right = held.right || ax[0] > 0.5; held.down = held.down || ax[1] > 0.5;
      if (cur[0] && !prev[0]) act('action');   // A
      if (cur[1] && !prev[1]) act('cancel');    // B
      if (cur[2] && !prev[2]) act('rotate');    // X
      if (cur[3] && !prev[3]) act('hold');      // Y
      if (cur[7] && !prev[7]) act('drop');      // RT
      cur._lx = ax[0]; cur._ly = ax[1]; padPrev[i] = cur;
    }
    requestAnimationFrame(pollPads);
  }

  // ── Menu focus navigation (D-pad / remote operable menus) ──────────────────
  function refreshFocusables() { focusEls = Array.prototype.slice.call(document.querySelectorAll('.focusable:not([disabled])')).filter(function (e) { return e.offsetParent !== null; }); }
  function paintFocus() { focusEls.forEach(function (e, i) { e.classList.toggle('focus-cur', i === focusIdx); }); if (focusEls[focusIdx]) focusEls[focusIdx].focus({ preventScroll: false }); }
  function moveFocus(d) {
    if (!focusEls.length) refreshFocusables();
    if (!focusEls.length) return false;
    if (d === 'up' || d === 'left') focusIdx = (focusIdx - 1 + focusEls.length) % focusEls.length;
    else focusIdx = (focusIdx + 1) % focusEls.length;
    paintFocus(); return true;
  }
  function activateFocus() { var el = focusEls[focusIdx]; if (el) el.click(); }

  // ── On-screen D-pad + buttons (touch action games: block-drop) ─────────────
  function mountDpad() {
    if (document.getElementById('osd')) return;
    var wrap = document.createElement('div'); wrap.id = 'osd'; wrap.className = 'osd';
    wrap.innerHTML =
      '<div class="osd-pad">' +
      '<button class="osd-b" data-h="left" aria-label="left">◀</button>' +
      '<button class="osd-b" data-h="down" aria-label="down">▼</button>' +
      '<button class="osd-b" data-h="right" aria-label="right">▶</button>' +
      '</div><div class="osd-act">' +
      '<button class="osd-b osd-rot" data-a="rotate" aria-label="rotate">⟳</button>' +
      '<button class="osd-b osd-drop" data-a="drop" aria-label="drop">⤓</button>' +
      '<button class="osd-b osd-hold" data-a="hold" aria-label="hold">⇩</button></div>';
    document.body.appendChild(wrap);
    wrap.querySelectorAll('[data-h]').forEach(function (b) {
      var d = b.getAttribute('data-h');
      var press = function (e) { e.preventDefault(); held[d] = true; dir(d); }; var rel = function () { held[d] = false; };
      b.addEventListener('touchstart', press, { passive: false }); b.addEventListener('touchend', rel); b.addEventListener('touchcancel', rel);
      b.addEventListener('mousedown', press); b.addEventListener('mouseup', rel); b.addEventListener('mouseleave', rel);
    });
    wrap.querySelectorAll('[data-a]').forEach(function (b) {
      b.addEventListener('touchstart', function (e) { e.preventDefault(); act(b.getAttribute('data-a')); }, { passive: false });
      b.addEventListener('click', function () { act(b.getAttribute('data-a')); });
    });
  }

  // ── On-screen A–Z keyboard (touch crossword) ───────────────────────────────
  function mountKeyboard(onKey) {
    if (document.getElementById('oskb')) return document.getElementById('oskb');
    var kb = document.createElement('div'); kb.id = 'oskb'; kb.className = 'oskb';
    var rows = ['QWERTYUIOP', 'ASDFGHJKL', 'ZXCVBNM'];
    kb.innerHTML = rows.map(function (r) {
      return '<div class="oskb-row">' + r.split('').map(function (c) { return '<button class="oskb-k" data-k="' + c + '">' + c + '</button>'; }).join('') +
        (r === 'ZXCVBNM' ? '<button class="oskb-k oskb-bk" data-k="\\b">⌫</button>' : '') + '</div>';
    }).join('');
    document.body.appendChild(kb);
    kb.querySelectorAll('[data-k]').forEach(function (b) {
      b.addEventListener('touchstart', function (e) { e.preventDefault(); fire(b.getAttribute('data-k')); }, { passive: false });
      b.addEventListener('click', function () { fire(b.getAttribute('data-k')); });
    });
    function fire(k) { var ch = k === '\\b' ? '\b' : k; emit('text', ch); if (onKey) onKey(ch); }
    return kb;
  }

  var Input = {
    on: on,
    held: function (d) { return !!held[d]; },
    init: function () {
      if (started) return detect(); started = true;
      var caps = detect();
      document.addEventListener('keydown', keydown);
      document.addEventListener('keyup', keyup);
      window.addEventListener('gamepadconnected', function () { document.body.classList.add('is-tv'); });
      requestAnimationFrame(pollPads);
      matchMedia('(pointer:coarse)').addEventListener && matchMedia('(pointer:coarse)').addEventListener('change', detect);
      return caps;
    },
    mountDpad: mountDpad,
    mountKeyboard: mountKeyboard,
    focusables: function () { focusOn = true; refreshFocusables(); focusIdx = 0; if (document.body.classList.contains('is-tv')) paintFocus(); },
    stopFocus: function () { focusOn = false; focusEls.forEach(function (e) { e.classList.remove('focus-cur'); }); },
    refresh: refreshFocusables,
  };
  global.Input = Input;
})(typeof window !== 'undefined' ? window : this);
