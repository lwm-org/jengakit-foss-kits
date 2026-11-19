/**
 * GameEngine — Input, multiplayer networking, WebRTC voice/video, lobby/waiting room.
 * Loaded via <script src="engine.js"></script> AFTER socket.io and BEFORE game code.
 *
 * Provides:
 *   LEFT(), RIGHT(), UP(), DOWN(), ACTION() — input helpers (keyboard + touch)
 *   keys[] — raw keyboard state
 *   GameNet  — multiplayer networking (lobby, rooms, waiting room, player sync)
 *   GameRTC  — WebRTC voice/video chat with PiP overlay
 *   GameLobby — lobby/waiting room UI builder
 */
(function(){

// ── Keyboard Input ──────────────────────────────────────────────────────────
var keys = {};
window.keys = keys;

document.addEventListener('keydown', function(e) {
  keys[e.key] = true;
  keys[e.code] = true;
  if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight',' '].indexOf(e.key) >= 0) e.preventDefault();
});
document.addEventListener('keyup', function(e) {
  keys[e.key] = false;
  keys[e.code] = false;
});

document.addEventListener('DOMContentLoaded', function() {
  var cv = document.getElementById('cv');
  if (cv) {
    cv.setAttribute('tabindex', '0');
    cv.focus();
    cv.addEventListener('click', function() { cv.focus(); });
  }
});

window.LEFT  = function() { return keys['ArrowLeft']  || keys['a'] || keys['A'] || window._touchLeft  || false; };
window.RIGHT = function() { return keys['ArrowRight'] || keys['d'] || keys['D'] || window._touchRight || false; };
window.UP    = function() { return keys['ArrowUp']    || keys['w'] || keys['W'] || window._touchUp    || false; };
window.DOWN  = function() { return keys['ArrowDown']  || keys['s'] || keys['S'] || window._touchDown  || false; };
window.ACTION = function() { return keys[' '] || keys['Enter'] || keys['Space'] || window._touchAction || false; };

// ── Game State (lives, difficulty, player name) ─────────────────────────────
var _myName = 'Player', _difficulty = 'medium', _lives = 3;

window.GameState = {
  get lives() { return _lives; },
  set lives(v) { _lives = v; },
  get difficulty() { return _difficulty; },
  set difficulty(v) { _difficulty = v; },
  get playerName() { return _myName; },
  set playerName(v) { _myName = v; },

  // Respawn: reset position, brief invincibility. Returns false if no lives left.
  respawn: function() {
    if (_lives <= 0) return false;
    _lives--;
    return _lives >= 0;
  },

  // Difficulty multipliers for game logic
  get speedMultiplier() {
    return _difficulty === 'easy' ? 0.6 : _difficulty === 'hard' ? 1.5 : 1.0;
  },
  get spawnRate() {
    return _difficulty === 'easy' ? 0.5 : _difficulty === 'hard' ? 1.8 : 1.0;
  },
  get fuelDrain() {
    return _difficulty === 'easy' ? 0.5 : _difficulty === 'hard' ? 1.5 : 1.0;
  }
};

// ── Multiplayer Networking ──────────────────────────────────────────────────
var socket = (typeof io !== 'undefined') ? io() : null;
window.socket = socket;

var _myId = '', _myRoom = '', _otherPlayers = {}, _roomCallbacks = {};
var _waitingPlayers = [], _gameStarted = false, _isSolo = false;
var _onGameStart = null, _onWaitingUpdate = null;
var _playerNames = {}; // playerId → name mapping

window.GameNet = {
  get myId() { return _myId; },
  get myRoom() { return _myRoom; },
  get otherPlayers() { return _otherPlayers; },
  get connected() { return socket && socket.connected; },
  get isSolo() { return _isSolo; },
  get gameStarted() { return _gameStarted; },
  get waitingPlayers() { return _waitingPlayers; },

  // Join a named room (multiplayer) — shows waiting room until game starts
  joinRoom: function(roomId, playerName) {
    if (!socket) return;
    _isSolo = false;
    _gameStarted = false;
    _waitingPlayers = [];
    _myName = playerName || 'Player';
    socket.emit('join_room', roomId);
    socket.emit('player_meta', { name: _myName });
    _myRoom = roomId;
  },

  // Get display name for a player ID
  getPlayerName: function(playerId) {
    if (playerId === _myId) return _myName;
    return _playerNames[playerId] || _otherPlayers[playerId]?.name || ('Player ' + playerId.slice(2,5));
  },

  // Start solo mode (private room with bots, starts immediately)
  startSolo: function(playerName) {
    _isSolo = true;
    _gameStarted = true;
    if (playerName) _myName = playerName;
    if (socket) socket.emit('solo_start');
  },

  // Host signals game should start (multiplayer)
  startGame: function() {
    if (!socket || !_myRoom) return;
    socket.emit('game_start');
  },

  // Register callback for when game actually starts (after waiting room)
  onGameStart: function(callback) {
    _onGameStart = callback;
  },

  // Register callback for waiting room player list updates
  onWaitingUpdate: function(callback) {
    _onWaitingUpdate = callback;
  },

  sendUpdate: function(data) {
    if (!socket || !_myRoom) return;
    data.name = _myName;
    socket.emit('player_update', data);
  },

  sendEvent: function(type, data) {
    if (!socket || !_myRoom) return;
    socket.emit('game_event', { type: type, data: data });
  },

  sendScore: function(points) {
    if (!socket || !_myRoom) return;
    socket.emit('score', { points: points });
  },

  restart: function() {
    if (!socket || !_myRoom) return;
    socket.emit('restart_game');
  },

  onEvent: function(callback) {
    _roomCallbacks.gameEvent = callback;
  },

  onState: function(callback) {
    _roomCallbacks.state = callback;
  }
};

if (socket) {
  socket.on('joined', function(d) {
    _myId = d.playerId;
    _myRoom = d.room;
    if (d.solo) {
      _isSolo = true;
      _gameStarted = true;
    }
    console.log('Joined room:', d.room, 'as', d.playerId, d.solo ? '(solo)' : '(multiplayer)');
  });

  socket.on('player_update', function(d) {
    if (d.playerId !== _myId) {
      _otherPlayers[d.playerId] = d;
      if (d.name) _playerNames[d.playerId] = d.name;
    }
  });

  socket.on('player_meta_update', function(d) {
    if (d.playerId && d.name) _playerNames[d.playerId] = d.name;
  });

  socket.on('player_left', function(d) {
    delete _otherPlayers[d.playerId];
  });

  socket.on('state', function(d) {
    // Update waiting player list + names from server
    if (d.players) {
      _waitingPlayers = d.players;
      if (d.names) {
        for (var pid in d.names) _playerNames[pid] = d.names[pid];
      }
      if (_onWaitingUpdate) _onWaitingUpdate(d.players, d.state);
    }
    if (_roomCallbacks.state) _roomCallbacks.state(d);
  });

  socket.on('game_event', function(d) {
    if (_roomCallbacks.gameEvent) _roomCallbacks.gameEvent(d);
  });

  // Game start signal from server (host clicked start)
  socket.on('game_started', function() {
    _gameStarted = true;
    if (_onGameStart) _onGameStart();
  });

  socket.on('lobby', function(rooms) {
    var el = document.getElementById('room-list');
    if (el && rooms) {
      el.innerHTML = '';
      rooms.forEach(function(r) {
        var div = document.createElement('div');
        div.className = 'room-item';
        div.textContent = r.name + ' (' + r.players + ' players)';
        div.onclick = function() { GameNet.joinRoom(r.id); };
        el.appendChild(div);
      });
    }
  });
}

// ── Waiting Room UI ─────────────────────────────────────────────────────────
window.GameLobby = {
  /**
   * Show the waiting room overlay. Call after GameNet.joinRoom().
   * @param {HTMLElement} container — element to render into (or creates overlay)
   * @param {object} opts — {playerName, roomId, onStart}
   */
  showWaitingRoom: function(container, opts) {
    opts = opts || {};
    var el = container;
    if (!el) {
      el = document.createElement('div');
      el.id = 'waiting-room';
      el.style.cssText = 'position:fixed;inset:0;background:rgba(5,10,18,0.95);z-index:200;display:flex;flex-direction:column;align-items:center;justify-content:center;color:#e0e8f0;font-family:inherit';
      document.body.appendChild(el);
    }

    var roomShort = (_myRoom || opts.roomId || '').slice(0, 12);

    function render(players) {
      var plist = (players || _waitingPlayers || []);
      var html = '<div style="text-align:center">';
      html += '<div style="font-size:24px;margin-bottom:4px">⏳ Waiting for Players</div>';
      html += '<div style="color:#8892a8;font-size:12px;margin-bottom:20px">Match: ' + roomShort + '... | Players: ' + plist.length + '</div>';
      html += '<div style="display:flex;flex-direction:column;gap:8px;min-width:220px">';
      for (var i = 0; i < Math.max(plist.length, 2); i++) {
        var pid = plist[i];
        var isMe = pid === _myId;
        var name = isMe ? (opts.playerName || _myName || 'You') : '';
        if (pid && !isMe) {
          name = _playerNames[pid] || ((_otherPlayers[pid] || {}).name) || ('Player ' + (i + 1));
        }
        if (pid) {
          html += '<div style="background:#1a2636;border:1px solid ' + (isMe ? '#00d4ff' : '#2a3548') + ';border-radius:8px;padding:10px 16px;display:flex;align-items:center;gap:10px">';
          html += '<div style="width:8px;height:8px;border-radius:50%;background:#22c55e"></div>';
          html += '<span>' + name + (isMe ? ' (you)' : '') + '</span>';
          html += '</div>';
        } else {
          html += '<div style="background:#111827;border:1px dashed #2a3548;border-radius:8px;padding:10px 16px;display:flex;align-items:center;gap:10px;color:#556">';
          html += '<div style="width:8px;height:8px;border-radius:50%;background:#555"></div>';
          html += '<span>⏳ Waiting</span>';
          html += '</div>';
        }
      }
      html += '</div>';
      // Start button (visible to all players when 2+ connected)
      if (plist.length >= 1) {
        html += '<button id="waiting-start-btn" style="margin-top:16px;padding:10px 32px;border:none;border-radius:8px;background:linear-gradient(135deg,#00d4ff,#7c3aed);color:#fff;font-size:14px;font-weight:600;cursor:pointer">';
        html += plist.length >= 2 ? 'Start Game (' + plist.length + ' players)' : 'Start with Bots';
        html += '</button>';
      }
      html += '</div>';
      el.innerHTML = html;

      var btn = document.getElementById('waiting-start-btn');
      if (btn) {
        btn.onclick = function() {
          _gameStarted = true;
          GameNet.startGame();
          el.style.display = 'none';
          if (opts.onStart) opts.onStart();
          if (_onGameStart) _onGameStart();
        };
      }
    }

    render();

    // Update UI when players join/leave
    GameNet.onWaitingUpdate(function(players) {
      render(players);
    });

    // Auto-hide when game starts (from another player clicking start)
    GameNet.onGameStart(function() {
      el.style.display = 'none';
      if (opts.onStart) opts.onStart();
    });

    return el;
  },

  hideWaitingRoom: function() {
    var el = document.getElementById('waiting-room');
    if (el) el.style.display = 'none';
  },

  /**
   * Show a room browser overlay with available rooms + create room option.
   * @param {object} opts — {playerName, defaultRooms, onJoin(roomId)}
   */
  showRoomBrowser: function(opts) {
    opts = opts || {};
    var el = document.createElement('div');
    el.id = 'room-browser';
    el.style.cssText = 'position:fixed;inset:0;background:rgba(5,10,18,0.95);z-index:190;display:flex;flex-direction:column;align-items:center;justify-content:center;color:#e0e8f0;font-family:inherit';

    var _rooms = opts.defaultRooms || [
      {id: 'room-1', name: 'Room 1'},
      {id: 'room-2', name: 'Room 2'},
      {id: 'room-3', name: 'Room 3'}
    ];
    var _serverRooms = [];

    function render() {
      var allRooms = _serverRooms.length > 0 ? _serverRooms : _rooms;
      var html = '<div style="text-align:center;max-width:360px">';
      html += '<div style="font-size:22px;font-weight:bold;margin-bottom:16px">Select a Room</div>';
      html += '<div style="display:flex;flex-direction:column;gap:8px;margin-bottom:16px">';
      allRooms.forEach(function(r) {
        var players = r.players || 0;
        html += '<div style="background:#1a2636;border:1px solid #2a3548;border-radius:8px;padding:12px 16px;cursor:pointer;display:flex;justify-content:space-between;align-items:center" onclick="GameLobby._joinRoom(\'' + r.id + '\')">';
        html += '<span style="font-weight:600">' + (r.name || r.id) + '</span>';
        html += '<span style="color:#8892a8;font-size:12px">' + players + ' player' + (players !== 1 ? 's' : '') + '</span>';
        html += '</div>';
      });
      html += '</div>';
      // Create custom room
      html += '<div style="display:flex;gap:6px;margin-bottom:12px">';
      html += '<input id="custom-room-name" placeholder="Custom room name" style="flex:1;background:#111;border:1px solid #444;color:#fff;padding:8px;border-radius:6px;font-size:13px">';
      html += '<button style="padding:8px 16px;border:none;border-radius:6px;background:#2a3548;color:#fff;cursor:pointer;font-size:13px" onclick="GameLobby._joinRoom(document.getElementById(\'custom-room-name\').value||\'custom-\'+Date.now())">Create</button>';
      html += '</div>';
      html += '<button style="padding:8px 16px;border:none;border-radius:6px;background:transparent;color:#8892a8;cursor:pointer;font-size:12px" onclick="document.getElementById(\'room-browser\').remove()">Cancel</button>';
      html += '</div>';
      el.innerHTML = html;
    }

    // Listen for server room list updates
    if (socket) {
      socket.on('lobby', function(rooms) {
        _serverRooms = rooms || [];
        render();
      });
      // Request fresh room list
      socket.emit('get_lobby');
    }

    GameLobby._joinRoom = function(roomId) {
      el.remove();
      if (opts.onJoin) opts.onJoin(roomId);
    };

    render();
    document.body.appendChild(el);
    return el;
  }
};

// ── WebRTC Voice/Video Chat with PiP Overlay ────────────────────────────────
var _localStream = null, _peers = {}, _voiceActive = false, _videoActive = false;
var _remoteStreams = {}, _videoOverlay = null;

var ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' }
];

function _createPeer(targetId, initiator) {
  if (_peers[targetId]) return _peers[targetId];
  var pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
  _peers[targetId] = pc;

  if (_localStream) {
    _localStream.getTracks().forEach(function(track) {
      pc.addTrack(track, _localStream);
    });
  }

  pc.ontrack = function(event) {
    _remoteStreams[targetId] = event.streams[0];
    _updateVideoOverlay();
    // Audio: create audio element for voice
    var existing = document.getElementById('rtc-audio-' + targetId);
    if (!existing) {
      var audio = document.createElement('audio');
      audio.id = 'rtc-audio-' + targetId;
      audio.autoplay = true;
      audio.style.display = 'none';
      document.body.appendChild(audio);
    }
    document.getElementById('rtc-audio-' + targetId).srcObject = event.streams[0];
  };

  pc.onicecandidate = function(event) {
    if (event.candidate && socket) {
      socket.emit('rtc_ice', { target: targetId, candidate: event.candidate });
    }
  };

  pc.onconnectionstatechange = function() {
    if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed') {
      delete _peers[targetId];
      delete _remoteStreams[targetId];
      _updateVideoOverlay();
    }
  };

  if (initiator) {
    pc.createOffer().then(function(offer) {
      return pc.setLocalDescription(offer);
    }).then(function() {
      socket.emit('rtc_offer', { target: targetId, sdp: pc.localDescription });
    }).catch(function(e) { console.warn('RTC offer failed:', e); });
  }

  return pc;
}

function _updateVideoOverlay() {
  if (!_videoActive) return;
  if (!_videoOverlay) {
    _videoOverlay = document.createElement('div');
    _videoOverlay.id = 'video-overlay';
    _videoOverlay.style.cssText = 'position:fixed;top:8px;right:8px;z-index:9998;display:flex;flex-direction:column;gap:4px';
    document.body.appendChild(_videoOverlay);
  }

  _videoOverlay.innerHTML = '';

  // Local video (self-view)
  if (_localStream) {
    var localDiv = document.createElement('div');
    localDiv.style.cssText = 'position:relative;width:120px;height:90px;border-radius:8px;overflow:hidden;border:2px solid #00d4ff;background:#000';
    var localVid = document.createElement('video');
    localVid.srcObject = _localStream;
    localVid.autoplay = true;
    localVid.muted = true; // Don't hear yourself
    localVid.playsInline = true;
    localVid.style.cssText = 'width:100%;height:100%;object-fit:cover;transform:scaleX(-1)';
    localDiv.appendChild(localVid);
    var label = document.createElement('div');
    label.style.cssText = 'position:absolute;bottom:2px;left:4px;font-size:9px;color:#fff;background:rgba(0,0,0,0.6);padding:1px 4px;border-radius:3px';
    label.textContent = 'You';
    localDiv.appendChild(label);
    _videoOverlay.appendChild(localDiv);
  }

  // Remote videos
  Object.keys(_remoteStreams).forEach(function(pid) {
    var stream = _remoteStreams[pid];
    if (!stream) return;
    var hasVideo = stream.getVideoTracks().length > 0;
    if (!hasVideo) return; // Audio-only peer, no PiP needed

    var div = document.createElement('div');
    div.style.cssText = 'position:relative;width:120px;height:90px;border-radius:8px;overflow:hidden;border:2px solid #7c3aed;background:#000';
    var vid = document.createElement('video');
    vid.srcObject = stream;
    vid.autoplay = true;
    vid.playsInline = true;
    vid.style.cssText = 'width:100%;height:100%;object-fit:cover';
    div.appendChild(vid);
    var lbl = document.createElement('div');
    lbl.style.cssText = 'position:absolute;bottom:2px;left:4px;font-size:9px;color:#fff;background:rgba(0,0,0,0.6);padding:1px 4px;border-radius:3px';
    lbl.textContent = pid.slice(0, 8);
    div.appendChild(lbl);
    _videoOverlay.appendChild(div);
  });
}

window.GameRTC = {
  get voiceActive() { return _voiceActive; },
  get videoActive() { return _videoActive; },

  startVoice: function() {
    if (!socket || !navigator.mediaDevices) return Promise.resolve(false);
    return navigator.mediaDevices.getUserMedia({ audio: true }).then(function(stream) {
      _localStream = stream;
      _voiceActive = true;
      GameAudio.play('chat');
      Object.keys(_otherPlayers).forEach(function(pid) { _createPeer(pid, true); });
      return true;
    }).catch(function(e) {
      console.warn('Mic access denied:', e.message);
      return false;
    });
  },

  startVideo: function() {
    if (!socket || !navigator.mediaDevices) return Promise.resolve(false);
    return navigator.mediaDevices.getUserMedia({
      audio: true,
      video: { width: { ideal: 160 }, height: { ideal: 120 }, facingMode: 'user' }
    }).then(function(stream) {
      _localStream = stream;
      _videoActive = true;
      _voiceActive = true;
      GameAudio.play('chat');
      _updateVideoOverlay();
      Object.keys(_otherPlayers).forEach(function(pid) { _createPeer(pid, true); });
      return true;
    }).catch(function(e) {
      console.warn('Camera access denied:', e.message);
      // Fallback to voice-only
      return window.GameRTC.startVoice();
    });
  },

  stop: function() {
    if (_localStream) {
      _localStream.getTracks().forEach(function(t) { t.stop(); });
      _localStream = null;
    }
    Object.keys(_peers).forEach(function(pid) {
      _peers[pid].close();
      var aud = document.getElementById('rtc-audio-' + pid);
      if (aud) aud.remove();
    });
    _peers = {};
    _remoteStreams = {};
    _voiceActive = false;
    _videoActive = false;
    if (_videoOverlay) { _videoOverlay.remove(); _videoOverlay = null; }
  },

  getLocalStream: function() { return _localStream; },
  getActivePeers: function() { return Object.keys(_peers); }
};

// Handle incoming WebRTC signals
if (socket) {
  socket.on('rtc_offer', function(d) {
    if (!_localStream) return;
    var pc = _createPeer(d.from, false);
    pc.setRemoteDescription(new RTCSessionDescription(d.sdp)).then(function() {
      return pc.createAnswer();
    }).then(function(answer) {
      return pc.setLocalDescription(answer);
    }).then(function() {
      socket.emit('rtc_answer', { target: d.from, sdp: pc.localDescription });
    }).catch(function(e) { console.warn('RTC answer failed:', e); });
  });

  socket.on('rtc_answer', function(d) {
    var pc = _peers[d.from];
    if (pc) pc.setRemoteDescription(new RTCSessionDescription(d.sdp)).catch(function(){});
  });

  socket.on('rtc_ice', function(d) {
    var pc = _peers[d.from];
    if (pc && d.candidate) pc.addIceCandidate(new RTCIceCandidate(d.candidate)).catch(function(){});
  });

  // When new players join, offer RTC if voice/video active AND update video overlay
  socket.on('state', function(d) {
    if (!d.players) return;
    if (_voiceActive || _videoActive) {
      d.players.forEach(function(pid) {
        if (pid !== _myId && !_peers[pid] && _localStream) {
          _createPeer(pid, true);
        }
      });
    }
    // Update video overlay when player list changes
    if (_videoActive) setTimeout(_updateVideoOverlay, 500);
  });

  // When a new player sends their first update, initiate RTC if we have active stream
  socket.on('player_update', function() {
    // Already handled above — this triggers on every frame update
  });
}

// ── HUD Helper ──────────────────────────────────────────────────────────────
window.updateHUD = function(score, fuel) {
  var el = document.getElementById('hud-score');
  if (el) el.textContent = 'Score: ' + score;
  var fb = document.getElementById('hud-fuel');
  if (fb) fb.style.width = Math.max(0, Math.min(100, fuel)) + '%';
};

// ── Volume/Mute Control ─────────────────────────────────────────────────────
window.GameUI = {
  _muteBtn: null,

  // Add a mute/volume toggle button (fixed position, top-left)
  addMuteButton: function() {
    if (this._muteBtn) return;
    var btn = document.createElement('button');
    btn.id = 'mute-btn';
    btn.style.cssText = 'position:fixed;top:8px;left:8px;z-index:9999;background:rgba(0,0,0,0.6);border:1px solid #444;color:#fff;padding:6px 10px;border-radius:6px;cursor:pointer;font-size:14px';
    btn.textContent = '🔊';
    btn.onclick = function() {
      var on = GameAudio.toggle();
      btn.textContent = on ? '🔊' : '🔇';
    };
    document.body.appendChild(btn);
    this._muteBtn = btn;
  },

  // Render leaderboard into a container element
  renderLeaderboard: function(containerId, limit) {
    var el = document.getElementById(containerId);
    if (!el) return;
    el.innerHTML = '<div style="color:#8892a8;font-size:11px">Loading...</div>';
    fetch('/api/leaderboard').then(function(r) { return r.json(); }).then(function(data) {
      if (!data || !data.length) {
        el.innerHTML = '<div style="color:#556;font-size:11px">No scores yet. Be the first!</div>';
        return;
      }
      var html = '';
      (data || []).slice(0, limit || 10).forEach(function(s, i) {
        html += '<div style="display:flex;justify-content:space-between;font-size:11px;padding:2px 0;border-bottom:1px solid #1e2738">';
        html += '<span style="color:#f59e0b;width:20px">#' + (i + 1) + '</span>';
        html += '<span style="flex:1">' + (s.name || 'Anonymous') + '</span>';
        html += '<span style="color:#00d4ff">' + s.score + '</span></div>';
      });
      el.innerHTML = html;
    }).catch(function() {
      el.innerHTML = '<div style="color:#556;font-size:11px">Leaderboard unavailable</div>';
    });
  },

  // Submit score to leaderboard
  submitScore: function(name, score, game) {
    return fetch('/api/leaderboard', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: name || GameState.playerName, score: Math.floor(score), game: game || '' })
    }).then(function(r) { return r.json(); }).catch(function() { return { ok: false }; });
  }
};

})();
