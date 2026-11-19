/**
 * Shared game server — Express static host + Socket.IO room server + leaderboard.
 *
 * Used verbatim by every jengaKIT realtime game kit (crossword, block-drop, …).
 * The game-specific logic lives entirely in the browser (public/); the server is
 * a generic authoritative-roster room relay:
 *   - rooms with a per-room deterministic seed (so all players get the same
 *     puzzle / piece sequence), a host, ready-up, and a play phase;
 *   - opaque state/event relay (the game defines the payloads);
 *   - WebRTC signaling relay for in-room voice/video;
 *   - a leaderboard (SQLite by default; Postgres via DATABASE_URL when scaled out).
 *
 * Scaling: defaults to one container (in-memory rooms + local SQLite). A multi-
 * container path is documented: set REDIS_URL (socket.io adapter, requires the
 * optional `@socket.io/redis-adapter`+`redis` deps) and DATABASE_URL (Postgres,
 * requires `pg`); both are lazily required so the lean default image is fast.
 * Needs a websocket-capable ingress + sticky sessions when scaled out.
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

// ── Optional multi-container socket.io adapter (scale-out) ──────────────────
if (process.env.REDIS_URL) {
  try {
    const { createAdapter } = require('@socket.io/redis-adapter');
    const { createClient } = require('redis');
    const pub = createClient({ url: process.env.REDIS_URL });
    const sub = pub.duplicate();
    Promise.all([pub.connect(), sub.connect()])
      .then(() => { io.adapter(createAdapter(pub, sub)); console.log('[server] Redis adapter active (multi-replica)'); })
      .catch((e) => console.warn('[server] Redis adapter failed, single-replica only:', e.message));
  } catch (e) {
    console.warn('[server] REDIS_URL set but adapter deps missing (npm i @socket.io/redis-adapter redis):', e.message);
  }
}

// ── Leaderboard store (SQLite default; Postgres when DATABASE_URL is set) ────
const store = createLeaderboardStore();

function createLeaderboardStore() {
  if (process.env.DATABASE_URL) {
    try {
      const { Pool } = require('pg');
      const pool = new Pool({ connectionString: process.env.DATABASE_URL });
      pool.query(
        'CREATE TABLE IF NOT EXISTS scores (id SERIAL PRIMARY KEY, name TEXT NOT NULL, score INTEGER NOT NULL, game TEXT DEFAULT \'\', mode TEXT DEFAULT \'\', created_at TIMESTAMPTZ DEFAULT now())'
      ).catch((e) => console.warn('[lb] pg init failed:', e.message));
      console.log('[server] Leaderboard: Postgres');
      return {
        top: async (limit) => (await pool.query('SELECT name, score, game, mode FROM scores ORDER BY score DESC LIMIT $1', [limit])).rows,
        add: async (name, score, game, mode) => { await pool.query('INSERT INTO scores (name, score, game, mode) VALUES ($1,$2,$3,$4)', [name, score, game, mode]); },
      };
    } catch (e) {
      console.warn('[server] DATABASE_URL set but `pg` missing — falling back to SQLite:', e.message);
    }
  }
  try {
    const Database = require('better-sqlite3');
    const fs = require('fs');
    const dir = path.join(__dirname, 'data');
    fs.mkdirSync(dir, { recursive: true });
    const db = new Database(path.join(dir, 'leaderboard.db'));
    db.exec("CREATE TABLE IF NOT EXISTS scores (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, score INTEGER NOT NULL, game TEXT DEFAULT '', mode TEXT DEFAULT '', created_at TEXT DEFAULT CURRENT_TIMESTAMP)");
    db.exec('CREATE INDEX IF NOT EXISTS idx_scores_rank ON scores(score DESC)');
    console.log('[server] Leaderboard: SQLite');
    const topStmt = db.prepare('SELECT name, score, game, mode FROM scores ORDER BY score DESC LIMIT ?');
    const addStmt = db.prepare('INSERT INTO scores (name, score, game, mode) VALUES (?,?,?,?)');
    return { top: async (limit) => topStmt.all(limit), add: async (n, s, g, m) => { addStmt.run(n, s, g, m); } };
  } catch (e) {
    console.warn('[server] Leaderboard disabled (no store):', e.message);
    return { top: async () => [], add: async () => {} };
  }
}

app.get('/api/leaderboard', async (_req, res) => {
  try { res.json(await store.top(50)); } catch { res.json([]); }
});

const _rl = {};
app.post('/api/leaderboard', async (req, res) => {
  const { name, score, game, mode } = req.body || {};
  if (!name || typeof score !== 'number' || !isFinite(score)) return res.status(400).json({ error: 'name and numeric score required' });
  const ip = req.ip; const now = Date.now();
  if (_rl[ip] && now - _rl[ip] < 3000) return res.status(429).json({ error: 'too fast' });
  _rl[ip] = now;
  try { await store.add(String(name).slice(0, 20), Math.floor(score), String(game || GAME).slice(0, 40), String(mode || '').slice(0, 20)); res.json({ ok: true }); }
  catch (e) { res.status(500).json({ error: e.message }); }
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
