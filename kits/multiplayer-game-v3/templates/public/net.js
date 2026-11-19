/* ═══════════════════════════════════════════════════════════════════════════
   NETWORK INFRASTRUCTURE — Template-provided. DO NOT generate this file.
   Handles: lobby UI, room join, remote player sync, input relay.
   Game code in index.html uses these globals.
   ═══════════════════════════════════════════════════════════════════════════ */
var socket = typeof io !== 'undefined' ? io() : null;
var myId = null;
var myName = 'Player';
var myColor = '#' + Math.floor(Math.random()*0xffffff).toString(16).padStart(6,'0');
var remotePlayers = {};
var remoteEvents = [];
var inGame = false;
var selectedRoom = null;

if (socket) {
  socket.on('lobby', function(rooms) {
    if (inGame) return;
    var el = document.getElementById('room-list');
    el.innerHTML = '';
    rooms.forEach(function(r) {
      var d = document.createElement('div');
      d.className = 'room-card';
      d.innerHTML = '<span class="rn">' + r.name + '</span><span class="ri">' + r.players + ' player(s)</span>';
      d.onclick = function() { _selectRoom(r.id); };
      el.appendChild(d);
    });
    var nr = document.createElement('div');
    nr.className = 'room-card';
    nr.innerHTML = '<span class="rn">+ New Room</span><span class="ri">Create</span>';
    nr.onclick = function() { _selectRoom('room-' + Date.now()); };
    el.appendChild(nr);
  });

  socket.on('joined', function(data) {
    myId = data.playerId;
    inGame = true;
    document.getElementById('lobby').style.display = 'none';
    document.getElementById('cv').style.display = 'block';
    if (typeof onJoined === 'function') onJoined(data);
  });

  socket.on('player_update', function(data) {
    if (data.playerId === myId) return;
    remotePlayers[data.playerId] = data;
  });

  socket.on('player_left', function(data) {
    delete remotePlayers[data.playerId];
  });

  socket.on('game_event', function(data) {
    if (data.playerId === myId) return;
    data.time = Date.now();
    remoteEvents.push(data);
    if (remoteEvents.length > 60) remoteEvents.shift();
  });

  socket.on('state', function(data) {
    if (typeof onServerState === 'function') onServerState(data);
  });
}

function _selectRoom(roomId) {
  selectedRoom = roomId;
  document.getElementById('name-row').style.display = 'block';
  document.getElementById('name-input').focus();
}

document.getElementById('launch-btn').onclick = function() {
  if (!selectedRoom || !socket) return;
  myName = (document.getElementById('name-input').value || '').trim() || 'Player';
  socket.emit('join_room', selectedRoom);
};

// --- Input state ---
var inputKeys = {left:false, right:false, up:false, down:false, action:false};
document.addEventListener('keydown', function(e) {
  if (e.key==='ArrowLeft'||e.key==='a') inputKeys.left=true;
  if (e.key==='ArrowRight'||e.key==='d') inputKeys.right=true;
  if (e.key==='ArrowUp'||e.key==='w') inputKeys.up=true;
  if (e.key==='ArrowDown'||e.key==='s') inputKeys.down=true;
  if (e.key===' ') { inputKeys.action=true; e.preventDefault(); }
});
document.addEventListener('keyup', function(e) {
  if (e.key==='ArrowLeft'||e.key==='a') inputKeys.left=false;
  if (e.key==='ArrowRight'||e.key==='d') inputKeys.right=false;
  if (e.key==='ArrowUp'||e.key==='w') inputKeys.up=false;
  if (e.key==='ArrowDown'||e.key==='s') inputKeys.down=false;
  if (e.key===' ') inputKeys.action=false;
});
function LEFT(){ return inputKeys.left; }
function RIGHT(){ return inputKeys.right; }
function UP(){ return inputKeys.up; }
function DOWN(){ return inputKeys.down; }
function ACTION(){ return inputKeys.action; }

// Broadcast local player state at 20hz
setInterval(function() {
  if (!inGame || !socket || !myId) return;
  if (typeof getMyState === 'function') {
    var st = getMyState();
    socket.emit('player_update', {x:st.x, y:st.y, score:st.score||0, state:st.state||'alive', extra:{name:myName, color:myColor}});
  }
}, 50);

// Helper: broadcast a game event (shoot, collect, die, etc)
function emitGameEvent(type, data) {
  if (socket) socket.emit('game_event', {type:type, data:data||{}});
}

function updateHUD(score, fuel) {}
