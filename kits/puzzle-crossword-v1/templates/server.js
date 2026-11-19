const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const fs = require('fs');

const PORT = process.env.PORT || 5000;
const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.get('/health', (req, res) => res.json({ status: 'ok' }));

// ── Leaderboard (SQLite) ────────────────────────────────────────────────────
let db;
try {
  const Database = require('better-sqlite3');
  const dataDir = path.join(__dirname, 'data');
  fs.mkdirSync(dataDir, { recursive: true });
  db = new Database(path.join(dataDir, 'leaderboard.db'));
  db.exec('CREATE TABLE IF NOT EXISTS scores (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, score INTEGER NOT NULL, game TEXT DEFAULT "", created_at TEXT DEFAULT CURRENT_TIMESTAMP)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_scores_rank ON scores(score DESC)');
  console.log('Leaderboard DB ready');
} catch (e) {
  console.warn('Leaderboard disabled:', e.message);
  db = null;
}

app.get('/api/leaderboard', (req, res) => {
  if (!db) return res.json([]);
  try {
    const rows = db.prepare('SELECT name, score, game, created_at FROM scores ORDER BY score DESC LIMIT 50').all();
    res.json(rows);
  } catch (e) { res.json([]); }
});

const _lbLimiter = {};
app.post('/api/leaderboard', (req, res) => {
  if (!db) return res.status(503).json({ error: 'leaderboard unavailable' });
  const { name, score, game } = req.body;
  if (!name || typeof score !== 'number') return res.status(400).json({ error: 'name and score required' });
  // Rate limit: 1 submission per 5s per IP
  const ip = req.ip;
  const now = Date.now();
  if (_lbLimiter[ip] && now - _lbLimiter[ip] < 5000) return res.status(429).json({ error: 'too fast' });
  _lbLimiter[ip] = now;
  try {
    db.prepare('INSERT INTO scores (name, score, game) VALUES (?, ?, ?)').run(String(name).slice(0, 20), Math.floor(score), String(game || '').slice(0, 50));
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Room state ──────────────────────────────────────────────────────────────
const ROOMS = {};

function getOrCreateRoom(roomId) {
  if (!ROOMS[roomId]) {
    ROOMS[roomId] = { name: roomId, players: {}, gameState: { status: 'waiting', scores: {}, tick: 0 } };
  }
  return ROOMS[roomId];
}

function getPlayerNames(room) {
  const names = {};
  if (room.meta) {
    for (const pid of Object.keys(room.players)) {
      names[pid] = (room.meta[pid] || {}).name || pid;
    }
  }
  return names;
}

function emitState(roomId) {
  const room = ROOMS[roomId];
  if (!room) return;
  io.to(roomId).emit('state', {
    state: room.gameState,
    players: Object.keys(room.players),
    names: getPlayerNames(room)
  });
}

function getLobby() {
  return Object.entries(ROOMS).map(([id, r]) => ({
    id, name: r.name, players: Object.keys(r.players).length,
  }));
}

io.on('connection', socket => {
  const playerId = 'p-' + Math.random().toString(36).slice(2, 7);
  socket.playerId = playerId;
  socket.roomId = null;

  socket.emit('lobby', getLobby());

  socket.on('get_lobby', () => {
    socket.emit('lobby', getLobby());
  });

  socket.on('join_room', roomId => {
    const room = getOrCreateRoom(roomId);
    socket.roomId = roomId;
    socket.join(roomId);
    room.players[playerId] = socket;
    room.gameState.scores[playerId] = 0;
    room.gameState.status = 'waiting';
    socket.emit('joined', { playerId, room: roomId });
    emitState(roomId);
    io.emit('lobby', getLobby());
  });

  // Player metadata (name, color) — stored for waiting room display
  socket.on('player_meta', data => {
    if (socket.roomId) {
      const room = ROOMS[socket.roomId];
      if (room) {
        if (!room.meta) room.meta = {};
        room.meta[playerId] = data;
        io.to(socket.roomId).emit('player_meta_update', { playerId, ...data });
        // Re-emit state so waiting room updates with the new name
        emitState(socket.roomId);
      }
    }
  });

  // Game start signal — host tells all players to begin
  socket.on('game_start', () => {
    if (!socket.roomId) return;
    const room = ROOMS[socket.roomId];
    if (room) {
      room.gameState.status = 'playing';
      io.to(socket.roomId).emit('game_started');
    }
  });

  // Solo mode: private room with bots only
  socket.on('solo_start', () => {
    const soloId = 'solo-' + playerId;
    const room = getOrCreateRoom(soloId);
    socket.roomId = soloId;
    socket.join(soloId);
    room.players[playerId] = socket;
    room.gameState.scores[playerId] = 0;
    socket.emit('joined', { playerId, room: soloId, solo: true });
    emitState(soloId);
  });

  socket.on('player_input', data => {
    if (!socket.roomId) return;
    io.to(socket.roomId).emit('input', { playerId, ...data });
  });

  socket.on('player_update', data => {
    if (!socket.roomId) return;
    socket.to(socket.roomId).emit('player_update', { playerId, ...data });
  });

  socket.on('score', data => {
    const room = ROOMS[socket.roomId];
    if (!room) return;
    const pts = (typeof data === 'object' && data.points) ? data.points : 1;
    room.gameState.scores[playerId] = (room.gameState.scores[playerId] || 0) + pts;
    emitState(socket.roomId);
  });

  socket.on('game_event', data => {
    if (!socket.roomId) return;
    socket.to(socket.roomId).emit('game_event', { playerId, ...data });
  });

  socket.on('restart_game', () => {
    const room = ROOMS[socket.roomId];
    if (!room) return;
    room.gameState = { status: 'waiting', scores: {}, tick: 0 };
    Object.keys(room.players).forEach(pid => { room.gameState.scores[pid] = 0; });
    emitState(socket.roomId);
  });

  // ── WebRTC signaling relay ────────────────────────────────────────────────
  socket.on('rtc_offer', data => {
    if (socket.roomId) socket.to(socket.roomId).emit('rtc_offer', { from: playerId, ...data });
  });
  socket.on('rtc_answer', data => {
    if (socket.roomId) socket.to(socket.roomId).emit('rtc_answer', { from: playerId, ...data });
  });
  socket.on('rtc_ice', data => {
    if (socket.roomId) socket.to(socket.roomId).emit('rtc_ice', { from: playerId, ...data });
  });

  socket.on('disconnect', () => {
    if (socket.roomId) {
      const room = ROOMS[socket.roomId];
      if (room) {
        delete room.players[playerId];
        if (room.gameState) delete room.gameState.scores[playerId];
        emitState(socket.roomId);
        io.to(socket.roomId).emit('player_left', { playerId });
        if (Object.keys(room.players).length === 0) delete ROOMS[socket.roomId];
      }
    }
    io.emit('lobby', getLobby());
  });
});

server.listen(PORT, '0.0.0.0', () => console.log('Advanced Game server on port ' + PORT));
