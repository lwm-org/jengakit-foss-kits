const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const PORT = process.env.PORT || 5000;
const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

app.use(express.static(path.join(__dirname, 'public')));
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.get('/health', (req, res) => res.json({ status: 'ok' }));

// --- Room state ---
const ROOMS = {};
const MAX_ROOMS = 10;

function getOrCreateRoom(roomId) {
  if (!ROOMS[roomId]) {
    ROOMS[roomId] = { name: roomId, players: {}, gameState: { status: 'waiting', scores: {}, tick: 0 } };
  }
  return ROOMS[roomId];
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

  socket.on('join_room', roomId => {
    const room = getOrCreateRoom(roomId);
    socket.roomId = roomId;
    socket.join(roomId);
    room.players[playerId] = socket;
    room.gameState.scores[playerId] = 0;

    socket.emit('joined', { playerId, room: roomId });
    io.to(roomId).emit('state', { state: room.gameState, players: Object.keys(room.players) });
    io.emit('lobby', getLobby());
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
    io.to(socket.roomId).emit('state', { state: room.gameState, players: Object.keys(room.players) });
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
    io.to(socket.roomId).emit('state', { state: room.gameState, players: Object.keys(room.players) });
  });

  socket.on('disconnect', () => {
    if (socket.roomId) {
      const room = ROOMS[socket.roomId];
      if (room) {
        delete room.players[playerId];
        if (room.gameState) delete room.gameState.scores[playerId];
        io.to(socket.roomId).emit('state', { state: room.gameState, players: Object.keys(room.players) });
        io.to(socket.roomId).emit('player_left', { playerId });
        if (Object.keys(room.players).length === 0) delete ROOMS[socket.roomId];
      }
    }
    io.emit('lobby', getLobby());
  });
});

server.listen(PORT, '0.0.0.0', () => console.log('Game server on port ' + PORT));
