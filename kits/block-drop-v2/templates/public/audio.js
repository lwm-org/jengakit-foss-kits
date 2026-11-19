/**
 * Audio — Web Audio synthesized SFX + music. No external assets. Shared kit infra.
 *   Audio.play(name)   name ∈ tick|good|bad|word|win|lose|warn|land|clear|level|garbage|drop
 *   Audio.startMusic() / Audio.stopMusic() / Audio.toggle() → bool (on)
 * Autoplay-safe: the context is created/resumed on the first user gesture.
 */
(function (global) {
  var ctx = null, on = true, master = null, musicTimer = null, step = 0;

  function ac() {
    if (ctx) return ctx;
    try { ctx = new (window.AudioContext || window.webkitAudioContext)(); master = ctx.createGain(); master.gain.value = 0.35; master.connect(ctx.destination); } catch (e) { ctx = null; }
    return ctx;
  }
  function resume() { if (ctx && ctx.state === 'suspended') ctx.resume(); }
  ['pointerdown', 'keydown', 'touchstart'].forEach(function (e) { document.addEventListener(e, function () { ac(); resume(); }, { once: false }); });

  function beep(freq, dur, type, vol, slideTo) {
    if (!on || !ac()) return; resume();
    var o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type || 'square'; o.frequency.value = freq;
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, ctx.currentTime + dur);
    g.gain.value = (vol == null ? 0.3 : vol);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + dur);
    o.connect(g); g.connect(master); o.start(); o.stop(ctx.currentTime + dur);
  }
  function chord(freqs, dur, type) { freqs.forEach(function (f) { beep(f, dur, type || 'triangle', 0.18); }); }

  var SFX = {
    tick: function () { beep(320, 0.04, 'square', 0.12); },
    good: function () { beep(660, 0.08, 'square', 0.25); },
    bad: function () { beep(160, 0.16, 'sawtooth', 0.22, 90); },
    word: function () { chord([523, 659, 784], 0.18); },
    win: function () { [523, 659, 784, 1046].forEach(function (f, i) { setTimeout(function () { beep(f, 0.2, 'triangle', 0.28); }, i * 110); }); },
    lose: function () { [392, 330, 262].forEach(function (f, i) { setTimeout(function () { beep(f, 0.22, 'sawtooth', 0.24, f * 0.7); }, i * 130); }); },
    warn: function () { beep(880, 0.1, 'square', 0.2); },
    land: function () { beep(200, 0.06, 'square', 0.22, 140); },
    clear: function () { chord([440, 660, 880], 0.16); },
    level: function () { [660, 880, 1100].forEach(function (f, i) { setTimeout(function () { beep(f, 0.12, 'triangle', 0.24); }, i * 70); }); },
    garbage: function () { beep(120, 0.12, 'sawtooth', 0.24, 70); },
    drop: function () { beep(300, 0.05, 'square', 0.18, 120); },
  };

  var MELODY = [0, 3, 5, 7, 5, 3, 0, -2, 0, 5, 7, 10, 7, 5, 3, 0];
  function noteFreq(semi) { return 261.63 * Math.pow(2, semi / 12); }

  var Audio = {
    play: function (name) { if (SFX[name]) SFX[name](); },
    startMusic: function () {
      if (musicTimer || !ac()) return; resume();
      musicTimer = setInterval(function () {
        if (!on) return;
        var s = MELODY[step % MELODY.length]; step++;
        beep(noteFreq(s - 12), 0.28, 'triangle', 0.08);
        if (step % 2 === 0) beep(noteFreq(s), 0.14, 'sine', 0.05);
      }, 300);
    },
    stopMusic: function () { if (musicTimer) { clearInterval(musicTimer); musicTimer = null; } },
    toggle: function () { on = !on; if (!on) this.stopMusic(); return on; },
    get on() { return on; },
  };
  global.Audio = Audio;
})(typeof window !== 'undefined' ? window : this);
