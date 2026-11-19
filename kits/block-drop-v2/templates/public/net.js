/**
 * Net — Socket.IO room client shared by all jengaKIT realtime game kits.
 * Wraps the server protocol (join/ready/start/state/event/score/rtc) behind a
 * small event API. Loaded after the socket.io CDN, before the game.
 *
 *   Net.connect()                       → open the socket
 *   Net.join({room,name,color})         → join/create a room
 *   Net.ready(bool) / Net.start(mode)   → ready-up / host starts
 *   Net.sendState(obj) / Net.sendEvent(type,data) / Net.sendScore(n)
 *   Net.on(evt, cb)  evt ∈ joined|roster|started|state|event|peer-join|
 *                        peer-leave|rooms|reset|room-full|rtc-signal
 *   Net.id / Net.seed / Net.hostId / Net.isHost / Net.players / Net.room
 */
(function (global) {
  var socket = null;
  var handlers = {};
  var state = { id: '', room: '', seed: 1, hostId: '', players: [], phase: 'lobby', mode: '' };

  function emit(evt, payload) { (handlers[evt] || []).forEach(function (cb) { try { cb(payload); } catch (e) { console.warn('[net] handler', evt, e); } }); }

  var Net = {
    get id() { return state.id; },
    get room() { return state.room; },
    get seed() { return state.seed; },
    get hostId() { return state.hostId; },
    get isHost() { return state.id && state.id === state.hostId; },
    get players() { return state.players; },
    get phase() { return state.phase; },
    get connected() { return !!(socket && socket.connected); },

    playerName: function (id) {
      var p = state.players.filter(function (x) { return x.id === id; })[0];
      return p ? p.name : 'Player';
    },

    connect: function () {
      if (socket) return socket;
      socket = (typeof io !== 'undefined') ? io() : null;
      if (!socket) { console.warn('[net] socket.io not loaded'); return null; }
      socket.on('joined', function (d) { state.id = d.id; state.seed = d.seed; state.hostId = d.hostId; state.phase = d.phase; state.mode = d.mode || ''; emit('joined', d); });
      socket.on('roster', function (d) { state.players = d.players || []; state.hostId = d.hostId; state.phase = d.phase; if (d.seed) state.seed = d.seed; emit('roster', d); });
      socket.on('started', function (d) { state.phase = 'playing'; if (d.seed) state.seed = d.seed; state.mode = d.mode || ''; emit('started', d); });
      socket.on('reset', function (d) { state.phase = 'lobby'; if (d && d.seed) state.seed = d.seed; emit('reset', d); });
      socket.on('state', function (d) { emit('state', d); });
      socket.on('event', function (d) { emit('event', d); });
      socket.on('peer-join', function (d) { emit('peer-join', d); });
      socket.on('peer-leave', function (d) { emit('peer-leave', d); });
      socket.on('rooms', function (d) { emit('rooms', d); });
      socket.on('room-full', function (d) { emit('room-full', d); });
      socket.on('rtc-signal', function (d) { emit('rtc-signal', d); });
      return socket;
    },

    listRooms: function () { if (socket) socket.emit('list-rooms'); },
    join: function (opts) { this.connect(); state.room = (opts && opts.room) || 'public'; if (socket) socket.emit('join', opts || {}); },
    ready: function (r) { if (socket) socket.emit('ready', { ready: !!r }); },
    start: function (mode) { if (socket) socket.emit('start', { mode: mode || '' }); },
    restart: function () { if (socket) socket.emit('restart'); },
    sendState: function (obj) { if (socket) socket.emit('state', obj); },
    sendEvent: function (type, data) { if (socket) socket.emit('event', { type: type, data: data }); },
    sendScore: function (n) { if (socket) socket.emit('score', { score: n }); },
    signal: function (to, data) { if (socket) socket.emit('rtc-signal', { to: to, data: data }); },

    on: function (evt, cb) { (handlers[evt] = handlers[evt] || []).push(cb); return this; },
  };

  global.Net = Net;
})(typeof window !== 'undefined' ? window : this);
