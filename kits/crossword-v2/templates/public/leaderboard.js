/**
 * Leaderboard — fetch / submit / render top scores. Shared kit infra.
 *   Leaderboard.submit(name, score, game, mode) → Promise
 *   Leaderboard.render(containerId, {limit, mode}) → paints top N (responsive rows)
 */
(function (global) {
  var Leaderboard = {
    submit: function (name, score, game, mode) {
      return fetch('/api/leaderboard', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name || 'Player', score: Math.floor(score) || 0, game: game || '', mode: mode || '' }),
      }).then(function (r) { return r.json(); }).catch(function () { return { ok: false }; });
    },
    render: function (containerId, opts) {
      opts = opts || {};
      var el = document.getElementById(containerId); if (!el) return;
      el.innerHTML = '<div class="lb-empty">Loading…</div>';
      return fetch('/api/leaderboard').then(function (r) { return r.json(); }).then(function (rows) {
        rows = (rows || []).filter(function (s) { return !opts.mode || s.mode === opts.mode; }).slice(0, opts.limit || 10);
        if (!rows.length) { el.innerHTML = '<div class="lb-empty">No scores yet — be the first!</div>'; return; }
        el.innerHTML = rows.map(function (s, i) {
          return '<div class="lb-row"><span class="lb-rank">#' + (i + 1) + '</span><span class="lb-name">' +
            String(s.name || 'Player').replace(/[<>&]/g, '') + '</span><span class="lb-score">' + s.score + '</span></div>';
        }).join('');
      }).catch(function () { el.innerHTML = '<div class="lb-empty">Leaderboard unavailable</div>'; });
    },
  };
  global.Leaderboard = Leaderboard;
})(typeof window !== 'undefined' ? window : this);
