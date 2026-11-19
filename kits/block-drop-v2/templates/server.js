/**
 * Shared game server — Express static host + Socket.IO room server + leaderboard.
 *
 * Used verbatim by every jengaKIT realtime game kit (crossword-v2, block-drop-v2,
 * …). The game-specific logic lives entirely in the browser (public/); the server
 * is a generic authoritative-roster room relay:
 *   - rooms with a per-room deterministic seed (so all players get the same
 *     puzzle / piece sequence), a host, ready-up, and a play phase;
 *   - opaque state/event relay (the game defines the payloads);
 *   - WebRTC signaling relay for in-room voice/video;
 *   - a persisted leaderboard via the vendored jengakit_db SDK.
 *
 * Doctrine: this kit ships ZERO infra/backend-selection code. Rooms live in this
 * single container's own in-memory socket.io (the kit gets its own container from
 * the platform for free — no docker-in-docker, no cluster wiring here). The
 * leaderboard goes through the jengakit_db SDK, which decides the storage backend
 * from platform-injected env entirely on its own. The kit stays portable across
 * FOSS-local and any cloud host without carrying a line of platform internals.
 */
'use strict';

const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');

const PORT = process.env.PORT || 5000;
const GAME = process.env.GAME_NAME || 'Game';
const MAX_PLAYERS = parseInt(process.env.MAX_PLAYERS || '5', 10);

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' }, pingTimeout: 20000 });

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public'), { maxAge: '1h' }));
app.get('/health', (_req, res) => res.json({ status: 'ok', game: GAME }));
app.get('/', (_req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

// ── Leaderboard via the jengakit_db SDK ─────────────────────────────────────
// The kit ships ZERO backend-selection code: jengakit_db decides SQLite (local,
// the default here) vs a cloud DB entirely from platform-injected env. Rooms are
// this container's own in-memory socket.io — the kit gets its container for free.
const db = require('./lib/jengakit_db');
db.exec("CREATE TABLE IF NOT EXISTS scores (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, score INTEGER NOT NULL, game TEXT DEFAULT '', mode TEXT DEFAULT '', created_at TEXT DEFAULT CURRENT_TIMESTAMP)")
  .catch((e) => console.warn('[lb] init:', e.message));

app.get('/api/leaderboard', async (_req, res) => {
  try { res.json(await db.query('SELECT name, score, game, mode FROM scores ORDER BY score DESC LIMIT 50')); } catch { res.json([]); }
});

const _rl = {};
app.post('/api/leaderboard', async (req, res) => {
  const { name, score, game, mode } = req.body || {};
  if (!name || typeof score !== 'number' || !isFinite(score)) return res.status(400).json({ error: 'name and numeric score required' });
  const ip = req.ip; const now = Date.now();
  if (_rl[ip] && now - _rl[ip] < 3000) return res.status(429).json({ error: 'too fast' });
  _rl[ip] = now;
  try {
    await db.run('INSERT INTO scores (name, score, game, mode) VALUES (?,?,?,?)',
      [String(name).slice(0, 20), Math.floor(score), String(game || GAME).slice(0, 40), String(mode || '').slice(0, 20)]);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Rooms ───────────────────────────────────────────────────────────────────
const ROOMS = {};
function room(id) {
  if (!ROOMS[id]) ROOMS[id] = { id, seed: (Math.floor(Math.random() * 2147483647) | 0) || 1, hostId: null, phase: 'lobby', players: {} };
  return ROOMS[id];
}
function roster(r) {
  return {
    hostId: r.hostId, phase: r.phase, seed: r.seed,
    players: Object.values(r.players).map((p) => ({ id: p.id, name: p.name, color: p.color, ready: p.ready, score: p.score || 0 })),
  };
}
function publicRooms() {
  return Object.values(ROOMS).filter((r) => r.phase === 'lobby').map((r) => ({ id: r.id, players: Object.keys(r.players).length, max: MAX_PLAYERS }));
}
function leave(socket) {
  const r = ROOMS[socket.roomId]; if (!r) return;
  delete r.players[socket.id];
  socket.to(r.id).emit('peer-leave', { id: socket.id });
  if (r.hostId === socket.id) r.hostId = Object.keys(r.players)[0] || null;
  if (Object.keys(r.players).length === 0) delete ROOMS[r.id];
  else io.to(r.id).emit('roster', roster(r));
  socket.roomId = null;
  io.emit('rooms', publicRooms());
}

io.on('connection', (socket) => {
  socket.emit('rooms', publicRooms());

  socket.on('list-rooms', () => socket.emit('rooms', publicRooms()));

  socket.on('join', (d = {}) => {
    const id = String(d.room || 'public').slice(0, 24);
    const r = room(id);
    if (Object.keys(r.players).length >= MAX_PLAYERS) return socket.emit('room-full', { room: id });
    if (r.phase !== 'lobby' && !d.spectate) { /* allow late join into playing rooms too */ }
    socket.roomId = id; socket.join(id);
    r.players[socket.id] = { id: socket.id, name: String(d.name || 'Player').slice(0, 16), color: d.color || '#00d4ff', ready: false, score: 0 };
    if (!r.hostId) r.hostId = socket.id;
    socket.emit('joined', { id: socket.id, seed: r.seed, hostId: r.hostId, phase: r.phase, mode: r.mode || '' });
    socket.to(id).emit('peer-join', { id: socket.id, name: r.players[socket.id].name, color: r.players[socket.id].color });
    io.to(id).emit('roster', roster(r));
    io.emit('rooms', publicRooms());
  });

  socket.on('ready', (d = {}) => {
    const r = ROOMS[socket.roomId]; if (!r || !r.players[socket.id]) return;
    r.players[socket.id].ready = !!d.ready;
    io.to(r.id).emit('roster', roster(r));
  });

  socket.on('start', (d = {}) => {
    const r = ROOMS[socket.roomId]; if (!r || r.hostId !== socket.id) return;
    r.phase = 'playing'; r.mode = String(d.mode || '').slice(0, 20);
    io.to(r.id).emit('started', { seed: r.seed, mode: r.mode });
    io.emit('rooms', publicRooms());
  });

  // Opaque per-frame/per-move relay (game defines the payload).
  socket.on('state', (d) => { if (socket.roomId) socket.to(socket.roomId).emit('state', { from: socket.id, d }); });
  socket.on('event', (d) => { if (socket.roomId) socket.to(socket.roomId).emit('event', { from: socket.id, type: (d && d.type) || '', data: (d && d.data) || null }); });

  socket.on('score', (d = {}) => {
    const r = ROOMS[socket.roomId]; if (!r || !r.players[socket.id]) return;
    r.players[socket.id].score = Math.floor(d.score || 0);
    io.to(r.id).emit('roster', roster(r));
  });

  socket.on('restart', () => {
    const r = ROOMS[socket.roomId]; if (!r || r.hostId !== socket.id) return;
    r.seed = (Math.floor(Math.random() * 2147483647) | 0) || 1; r.phase = 'lobby';
    Object.values(r.players).forEach((p) => { p.ready = false; p.score = 0; });
    io.to(r.id).emit('roster', roster(r));
    io.to(r.id).emit('reset', { seed: r.seed });
  });

  // WebRTC signaling relay (offer/answer/ice), targeted to one peer.
  socket.on('rtc-signal', (d = {}) => { if (d.to) io.to(d.to).emit('rtc-signal', { from: socket.id, data: d.data }); });

  socket.on('disconnect', () => leave(socket));
});

process.on('SIGTERM', () => { io.close(); server.close(() => process.exit(0)); setTimeout(() => process.exit(0), 3000); });
server.listen(PORT, '0.0.0.0', () => console.log(`[server] ${GAME} on :${PORT} (max ${MAX_PLAYERS}/room)`));
