/* Assistant client — auth gate, per-user chat sessions, streaming agent events
 * with safe markdown, a two-pane settings modal with runtime configuration, and
 * light/dark theming. Vanilla, no build step, responsive, keyboard-friendly. */
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var MD = window.LobsterMD;
  var me = null, session = localStorage.getItem('lobster_session') || newSession();
  var MARK = '<rect width="32" height="32" rx="8" fill="#f0562d"/><path d="M9 20l7-11 7 11" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>';

  function newSession() { var s = 's' + Date.now().toString(36); localStorage.setItem('lobster_session', s); return s; }
  function api(path, opts) { return fetch(path, Object.assign({ headers: { 'Content-Type': 'application/json' } }, opts || {})); }
  function esc(s) { return String(s == null ? '' : s).replace(/[<>&]/g, function (c) { return { '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c]; }); }
  function initial(s) { return (String(s || 'x').trim()[0] || 'x').toUpperCase(); }

  // ── Toasts ─────────────────────────────────────────────────────────────────
  var CHK = '<svg class="tk" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg>';
  function toast(msg, plain) {
    var t = document.createElement('div'); t.className = 'toast';
    t.innerHTML = (plain ? '' : CHK) + '<span>' + esc(msg) + '</span>';
    $('toasts').appendChild(t);
    setTimeout(function () { t.style.transition = 'opacity .2s,transform .2s'; t.style.opacity = '0'; t.style.transform = 'translateY(6px)'; setTimeout(function () { t.remove(); }, 200); }, 2500);
  }

  // ── Theme ────────────────────────────────────────────────────────────────────
  var mq = window.matchMedia ? window.matchMedia('(prefers-color-scheme: light)') : null;
  function effective(pref) { return pref === 'system' ? (mq && mq.matches ? 'light' : 'dark') : pref; }
  function applyTheme(pref) {
    localStorage.setItem('lobster_theme', pref);
    var eff = effective(pref);
    document.documentElement.setAttribute('data-theme', eff);
    var sun = '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>';
    var moon = '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>';
    if ($('themeBtn')) $('themeBtn').innerHTML = eff === 'dark' ? sun : moon;
    document.querySelectorAll('#themeSeg button').forEach(function (b) { b.classList.toggle('on', b.getAttribute('data-theme') === pref); });
  }
  function themePref() { return localStorage.getItem('lobster_theme') || 'system'; }
  applyTheme(themePref());
  if (mq && mq.addEventListener) mq.addEventListener('change', function () { if (themePref() === 'system') applyTheme('system'); });

  // ── Views ────────────────────────────────────────────────────────────────────
  function showLogin() { $('login').classList.remove('hidden'); $('app').classList.add('hidden'); $('lu').focus(); }
  function showApp() {
    $('login').classList.add('hidden'); $('app').classList.remove('hidden');
    if (me) { $('meName').textContent = me.username; $('meAva').textContent = initial(me.username); }
    loadSessions(); loadHistory(); $('input').focus();
  }
  function boot() {
    $('loginMark').innerHTML = MARK; $('sideMark').innerHTML = MARK;
    api('/api/persona').then(function (r) { return r.json(); }).then(function (d) {
      if (d && d.name) { ['title', 'sideName', 'loginName'].forEach(function (id) { $(id).textContent = d.name; }); document.title = d.name; }
    }).catch(function () {});
    api('/api/auth/me').then(function (r) {
      if (r.ok) return r.json().then(function (u) { me = u; showApp(); });
      showLogin();
    }).catch(showLogin);
  }

  // ── Login ────────────────────────────────────────────────────────────────────
  $('loginForm').addEventListener('submit', function (e) {
    e.preventDefault(); $('loginErr').textContent = '';
    api('/api/auth/login', { method: 'POST', body: JSON.stringify({ username: $('lu').value, password: $('lp').value }) })
      .then(function (r) { return r.json().then(function (d) { return { ok: r.ok, d: d }; }); })
      .then(function (res) { if (res.ok) { me = res.d; $('lp').value = ''; showApp(); } else { $('loginErr').textContent = res.d.error || 'Sign-in failed'; } })
      .catch(function () { $('loginErr').textContent = 'Connection error'; });
  });
  $('logout').addEventListener('click', function () { api('/api/auth/logout', { method: 'POST' }).then(function () { me = null; $('log').innerHTML = ''; showLogin(); }); });

  // ── Sessions ─────────────────────────────────────────────────────────────────
  function relTime(s) { return String(s || '').replace('T', ' ').slice(0, 16); }
  function loadSessions() {
    api('/api/sessions').then(function (r) { return r.json(); }).then(function (rows) {
      var box = $('sessions'); box.innerHTML = ''; var seen = false;
      rows.forEach(function (s) {
        if (s.session === session) seen = true;
        var d = document.createElement('div');
        d.className = 'sess' + (s.session === session ? ' active' : '');
        d.textContent = relTime(s.started_at) + ' · ' + s.messages + ' messages'; d.title = s.session;
        d.addEventListener('click', function () { session = s.session; localStorage.setItem('lobster_session', session); loadSessions(); loadHistory(); closeSidebar(); });
        box.appendChild(d);
      });
      if (!seen) { var cur = document.createElement('div'); cur.className = 'sess active'; cur.textContent = 'Current conversation'; box.insertBefore(cur, box.firstChild); }
    }).catch(function () {});
  }
  function loadHistory() {
    $('log').innerHTML = '';
    api('/api/sessions/' + encodeURIComponent(session)).then(function (r) { return r.json(); }).then(function (rows) {
      if (!rows.length) { empty(); return; }
      rows.forEach(function (m) { addMsg(m.role === 'user' ? 'user' : 'bot', m.content); });
    }).catch(empty);
  }
  $('newchat').addEventListener('click', function () { session = newSession(); $('log').innerHTML = ''; empty(); loadSessions(); closeSidebar(); $('input').focus(); });

  var SUGG = ['Summarize my day', 'Run a quick diagnostic', 'Set a reminder for 9am', 'Draft a message for me'];
  function empty() {
    var name = $('title').textContent || 'your assistant';
    var d = document.createElement('div'); d.className = 'empty';
    d.innerHTML = '<div class="glyph"><svg viewBox="0 0 32 32" width="26" height="26">' + MARK + '</svg></div><h2>How can I help?</h2>' +
      '<p>Ask ' + esc(name) + ' to run a command, fetch the web, set a reminder, create a design, or reach you across your channels.</p>' +
      '<div class="sugg">' + SUGG.map(function (s) { return '<button>' + esc(s) + '</button>'; }).join('') + '</div>';
    d.querySelectorAll('.sugg button').forEach(function (b) { b.addEventListener('click', function () { $('input').value = b.textContent; ask(b.textContent); }); });
    $('log').appendChild(d);
  }

  // ── Rendering ────────────────────────────────────────────────────────────────
  function el(cls) { var d = document.createElement('div'); d.className = cls; return d; }
  function scroll() { var l = $('log'); l.scrollTop = l.scrollHeight; }
  function addMsg(role, text) {
    var m = el('msg ' + role);
    var av = el('av');
    if (role === 'bot') { av.innerHTML = '<svg viewBox="0 0 32 32" width="26" height="26" style="border-radius:7px">' + MARK + '</svg>'; av.style.background = 'none'; av.style.border = 'none'; }
    else { av.textContent = (me && me.username ? initial(me.username) : 'U'); }
    m.appendChild(av);
    var c = el('content');
    var who = el('who'); who.textContent = role === 'bot' ? ($('title').textContent || 'Assistant') : (me && me.username || 'You'); c.appendChild(who);
    var body = el('body');
    if (role === 'bot') body.innerHTML = MD.render(text); else body.textContent = text;
    c.appendChild(body); m.appendChild(c); $('log').appendChild(m); scroll(); return body;
  }
  var TICO = '<svg class="tico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>';
  var TCHK = '<svg class="tico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg>';
  var BAN = '<svg class="tico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M5.6 5.6l12.8 12.8"/></svg>';
  function addTool(name, phase, detail) {
    var t = el('tool' + (phase === 'blocked' ? ' blocked' : phase === 'result' ? ' done' : ''));
    if (phase === 'call') t.innerHTML = TICO + '<span>Using <b>' + esc(name) + '</b></span>' + (detail ? '<span class="arg">' + esc(JSON.stringify(detail)) + '</span>' : '');
    else if (phase === 'blocked') t.innerHTML = BAN + '<span><b>' + esc(name) + '</b> blocked — read-only</span>';
    else t.innerHTML = TCHK + '<span><b>' + esc(name) + '</b></span><span class="arg">' + esc(String(detail || '').slice(0, 160)) + '</span>';
    $('log').appendChild(t); scroll();
  }
  function typing() { var t = el('typing'); t.innerHTML = '<i></i><i></i><i></i>'; $('log').appendChild(t); scroll(); return t; }

  async function ask(text) {
    text = String(text || '').trim(); if (!text) return;
    $('input').value = ''; $('input').style.height = 'auto';
    var e = $('log').querySelector('.empty'); if (e) e.remove();
    addMsg('user', text); $('send').disabled = true;
    var think = typing();
    try {
      var res = await api('/api/chat', { method: 'POST', body: JSON.stringify({ message: text, session: session }) });
      if (res.status === 401) { think.remove(); me = null; showLogin(); return; }
      var reader = res.body.getReader(), dec = new TextDecoder(), buf = '', answered = false;
      while (true) {
        var chunk = await reader.read(); if (chunk.done) break;
        buf += dec.decode(chunk.value, { stream: true });
        var lines = buf.split('\n\n'); buf = lines.pop();
        for (var i = 0; i < lines.length; i++) {
          var line = lines[i].replace(/^data: /, ''); if (line === '[DONE]') continue;
          var ev; try { ev = JSON.parse(line); } catch (x) { continue; }
          if (ev.type === 'tool') addTool(ev.name, ev.phase, ev.phase === 'result' ? ev.result : ev.args);
          else if (ev.type === 'answer') { if (think) { think.remove(); think = null; } addMsg('bot', ev.text); answered = true; }
        }
      }
      if (!answered) { if (think) think.remove(); addMsg('bot', '_No response._'); }
      loadSessions();
    } catch (x) { if (think) think.remove(); addMsg('bot', '_Connection error._'); }
    $('send').disabled = false; $('input').focus();
  }

  $('form').addEventListener('submit', function (e) { e.preventDefault(); ask($('input').value); });
  $('input').addEventListener('input', function () { this.style.height = 'auto'; this.style.height = Math.min(168, this.scrollHeight) + 'px'; });
  $('input').addEventListener('keydown', function (e) { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); $('form').requestSubmit(); } });

  // ── Sidebar (mobile) + theme ───────────────────────────────────────────────────
  function closeSidebar() { $('sidebar').classList.remove('open'); $('scrim2').classList.remove('show'); setTimeout(function () { $('scrim2').classList.add('hidden'); }, 150); }
  function openSidebar() { $('scrim2').classList.remove('hidden'); requestAnimationFrame(function () { $('scrim2').classList.add('show'); }); $('sidebar').classList.add('open'); }
  $('menu').addEventListener('click', function () { $('sidebar').classList.contains('open') ? closeSidebar() : openSidebar(); });
  $('scrim2').addEventListener('click', closeSidebar);
  $('themeBtn').addEventListener('click', function () { applyTheme(effective(themePref()) === 'dark' ? 'light' : 'dark'); });
  document.querySelectorAll('#themeSeg button').forEach(function (b) { b.addEventListener('click', function () { applyTheme(b.getAttribute('data-theme')); }); });

  // ── Settings modal ──────────────────────────────────────────────────────────
  function openSettings() { $('settingsOverlay').classList.remove('hidden'); requestAnimationFrame(function () { $('settingsOverlay').classList.add('show'); }); refreshSettings(); }
  function closeSettings() { $('settingsOverlay').classList.remove('show'); setTimeout(function () { $('settingsOverlay').classList.add('hidden'); }, 220); }
  $('openSettings').addEventListener('click', openSettings);
  $('closeSettings').addEventListener('click', closeSettings);
  $('settingsOverlay').addEventListener('click', function (e) { if (e.target === $('settingsOverlay')) closeSettings(); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && $('settingsOverlay').classList.contains('show')) closeSettings(); });
  document.querySelectorAll('#settingsNav .nav-item').forEach(function (n) {
    n.addEventListener('click', function () {
      document.querySelectorAll('#settingsNav .nav-item').forEach(function (x) { x.classList.remove('active'); });
      document.querySelectorAll('.settings-main .panel').forEach(function (p) { p.classList.remove('active'); });
      n.classList.add('active');
      var p = document.querySelector('.panel[data-panel="' + n.getAttribute('data-panel') + '"]');
      if (p) { p.classList.add('active'); document.querySelector('.settings-main').scrollTop = 0; }
    });
  });

  function kv(k, v) { return '<div class="kv"><span>' + esc(k) + '</span><b>' + esc(v) + '</b></div>'; }
  function refreshSettings() {
    api('/api/settings').then(function (r) { return r.json(); }).then(function (s) {
      var isAdmin = s.role === 'admin';
      $('setVersion').textContent = 'v' + (s.version || 'dev');
      $('navConfigure').style.display = isAdmin ? '' : 'none';
      $('navTeam').style.display = isAdmin ? '' : 'none';
      $('setRuntime').innerHTML = kv('Signed in as', s.user + (isAdmin ? ' · admin' : '')) + kv('Autonomy', s.autonomy) + kv('Provider', s.provider.name) + kv('Model', s.provider.model || '—');
      // Channels + integrations as status cards.
      $('setChannels').innerHTML = (s.channels || []).map(function (c) {
        if (typeof c === 'string') c = { name: c, active: true };
        var meta = c.active
          ? ('Webhook <code>' + esc(c.webhook || '') + '</code>')
          : 'Add credentials under Configure to enable';
        return card(initial(c.name), c.name, meta, c.active);
      }).join('');
      $('setIntegrations').innerHTML = (s.integrations || []).map(function (g) {
        if (!g.available) return card('◇', g.label || g.name, 'Not installed in this deploy', false, true);
        var meta = g.configured ? ('Connected · <code>' + esc(g.url) + '</code>') : 'Add the editor URL under Configure to connect';
        return card(initial(g.label || g.name), g.label || g.name, meta, g.configured);
      }).join('') || '<div class="note">No integrations available.</div>';
      $('setTools').innerHTML = (s.tools || []).map(function (t) {
        return '<span class="chip' + (t.indexOf('design_') === 0 ? ' accent' : '') + '">' + esc(t) + '</span>';
      }).join('');
      if (isAdmin) loadConfig();
    }).catch(function () {});
    api('/api/audit').then(function (r) { return r.json(); }).then(function (rows) {
      $('setAudit').innerHTML = rows.length ? rows.slice(0, 50).map(function (a) {
        return '<div class="audit"><b>' + esc(a.tool) + '</b> · ' + esc(a.user) + ' · ' + esc((a.created_at || '').slice(0, 19)) + '<br>' + esc(String(a.args || '').slice(0, 120)) + '</div>';
      }).join('') : '<div class="note">No tool activity yet.</div>';
    }).catch(function () {});
  }
  function card(ic, name, metaHtml, on, dim) {
    return '<div class="scard"' + (dim ? ' style="opacity:.7"' : '') + '><div class="ci">' + esc(ic) + '</div>' +
      '<div class="cmain"><div class="cname">' + esc(name) + '</div><div class="cmeta">' + metaHtml + '</div></div>' +
      '<span class="state ' + (on ? 'on' : 'off') + '">' + (on ? 'Active' : 'Off') + '</span></div>';
  }

  // ── Runtime configuration (admin) ─────────────────────────────────────────────
  var CFG_FIELDS = [];
  function loadConfig() {
    api('/api/config').then(function (r) { return r.ok ? r.json() : null; }).then(function (cfg) {
      if (!cfg) return;
      CFG_FIELDS = cfg.fields || [];
      var byGroup = {}; CFG_FIELDS.forEach(function (f) { (byGroup[f.group] = byGroup[f.group] || []).push(f); });
      var html = '';
      (cfg.groups || []).forEach(function (g) {
        var fs = byGroup[g.id]; if (!fs || !fs.length) return;
        html += '<div class="grp"><div class="grp-title">' + esc(g.label) + '</div>';
        fs.forEach(function (f) {
          var tag = f.secret && f.set ? '<span class="set-tag">configured</span>' : '';
          html += '<div class="cfg-field"><label>' + esc(f.label) + tag + '</label>';
          if (f.type === 'select') {
            html += '<select data-key="' + esc(f.key) + '">' + (f.options || []).map(function (o) {
              return '<option value="' + esc(o) + '"' + (o === f.value ? ' selected' : '') + '>' + esc(o) + '</option>';
            }).join('') + '</select>';
          } else if (f.type === 'textarea') {
            html += '<textarea data-key="' + esc(f.key) + '" data-secret="' + (f.secret ? '1' : '') + '" placeholder="' + esc(f.secret && f.set ? 'configured — leave blank to keep' : (f.placeholder || '')) + '">' + esc(f.value || '') + '</textarea>';
          } else {
            var ph = f.secret && f.set ? 'configured — leave blank to keep' : (f.placeholder || '');
            html += '<input type="' + (f.secret ? 'password' : 'text') + '" data-key="' + esc(f.key) + '" data-secret="' + (f.secret ? '1' : '') + '" value="' + esc(f.value || '') + '" placeholder="' + esc(ph) + '" autocomplete="off">';
          }
          if (f.help) html += '<div class="cfg-help">' + esc(f.help) + '</div>';
          html += '</div>';
        });
        html += '</div>';
      });
      $('setConfig').innerHTML = html;
    }).catch(function () {});
  }
  function fieldMeta(key) { for (var i = 0; i < CFG_FIELDS.length; i++) if (CFG_FIELDS[i].key === key) return CFG_FIELDS[i]; return null; }
  $('saveConfig').addEventListener('click', function () {
    $('configNote').textContent = 'Saving…';
    var updates = {};
    document.querySelectorAll('#setConfig [data-key]').forEach(function (elm) {
      var key = elm.getAttribute('data-key'), meta = fieldMeta(key) || {}, val = elm.value;
      if (elm.getAttribute('data-secret') === '1') { if (val !== '') updates[key] = val; }
      else if (val !== (meta.value || '')) { updates[key] = val; }
    });
    if (!Object.keys(updates).length) { $('configNote').textContent = 'No changes.'; return; }
    api('/api/config', { method: 'PUT', body: JSON.stringify({ updates: updates }) })
      .then(function (r) { return r.json().then(function (d) { return { ok: r.ok, d: d }; }); })
      .then(function (res) {
        if (!res.ok) { $('configNote').textContent = res.d.error || 'Save failed'; return; }
        $('configNote').textContent = '';
        toast('Saved ' + res.d.applied.length + ' setting' + (res.d.applied.length === 1 ? '' : 's') + ' — active now');
        refreshSettings();
      })
      .catch(function () { $('configNote').textContent = 'Error'; });
  });

  $('createUser').addEventListener('click', function () {
    $('userNote').textContent = '';
    api('/api/users', { method: 'POST', body: JSON.stringify({ username: $('nu').value, password: $('np').value }) })
      .then(function (r) { return r.json().then(function (d) { return { ok: r.ok, d: d }; }); })
      .then(function (res) { if (res.ok) { toast('Created ' + res.d.username); $('nu').value = ''; $('np').value = ''; } else { $('userNote').textContent = res.d.error || 'failed'; } })
      .catch(function () { $('userNote').textContent = 'error'; });
  });

  boot();
})();
