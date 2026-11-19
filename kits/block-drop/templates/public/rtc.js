/**
 * RTC — in-room WebRTC voice/video mesh with a responsive PiP grid.
 * Shared by all realtime kits. Signals over Net (rtc-signal/peer-join/peer-leave).
 *
 *   RTC.startVoice() / RTC.startVideo()  → Promise<bool> (mic/cam permission)
 *   RTC.stop() / RTC.toggleMute() / RTC.toggleCam()
 *   RTC.active
 *
 * Mesh: every pair connects. Glare is avoided by a deterministic initiator
 * (the peer with the lexicographically-smaller id makes the offer). When a new
 * peer joins after we're live, we (re)establish. Degrades to voice-only if the
 * camera is denied. The PiP grid uses viewport units so it scales phone→TV.
 */
(function (global) {
  var ICE = [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:stun1.l.google.com:19302' }];
  var peers = {}, remote = {}, local = null, voice = false, video = false, muted = false, camOff = false;
  var overlay = null;

  function initiator(otherId) { return String(Net.id) < String(otherId); }

  function ensureOverlay() {
    if (overlay) return overlay;
    overlay = document.createElement('div');
    overlay.id = 'rtc-pip';
    overlay.style.cssText = 'position:fixed;top:calc(env(safe-area-inset-top,0) + 0.5rem);right:calc(env(safe-area-inset-right,0) + 0.5rem);z-index:9998;display:flex;flex-wrap:wrap;gap:0.3rem;max-width:40vw;justify-content:flex-end';
    document.body.appendChild(overlay);
    return overlay;
  }

  function tile(stream, label, self) {
    var d = document.createElement('div');
    d.style.cssText = 'position:relative;width:clamp(84px,11vw,220px);aspect-ratio:4/3;border-radius:8px;overflow:hidden;border:2px solid ' + (self ? '#00d4ff' : '#7c3aed') + ';background:#000';
    var v = document.createElement('video');
    v.autoplay = true; v.playsInline = true; if (self) v.muted = true;
    v.srcObject = stream;
    v.style.cssText = 'width:100%;height:100%;object-fit:cover' + (self ? ';transform:scaleX(-1)' : '');
    d.appendChild(v);
    var l = document.createElement('div');
    l.style.cssText = 'position:absolute;bottom:2px;left:4px;font-size:clamp(9px,1.4vw,13px);color:#fff;background:rgba(0,0,0,.6);padding:0 4px;border-radius:3px';
    l.textContent = label; d.appendChild(l);
    return d;
  }

  function renderOverlay() {
    if (!video) return;
    var el = ensureOverlay(); el.innerHTML = '';
    if (local) el.appendChild(tile(local, 'You', true));
    Object.keys(remote).forEach(function (id) {
      var s = remote[id]; if (s && s.getVideoTracks().length) el.appendChild(tile(s, Net.playerName(id), false));
    });
  }

  function makePeer(id) {
    if (peers[id]) return peers[id];
    var pc = new RTCPeerConnection({ iceServers: ICE });
    peers[id] = pc;
    if (local) local.getTracks().forEach(function (t) { pc.addTrack(t, local); });
    pc.ontrack = function (e) {
      remote[id] = e.streams[0];
      var aud = document.getElementById('rtc-a-' + id);
      if (!aud) { aud = document.createElement('audio'); aud.id = 'rtc-a-' + id; aud.autoplay = true; aud.style.display = 'none'; document.body.appendChild(aud); }
      aud.srcObject = e.streams[0];
      renderOverlay();
    };
    pc.onicecandidate = function (e) { if (e.candidate) Net.signal(id, { ice: e.candidate }); };
    pc.onconnectionstatechange = function () {
      if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected') { dropPeer(id); }
    };
    return pc;
  }

  function offerTo(id) {
    var pc = makePeer(id);
    pc.createOffer().then(function (o) { return pc.setLocalDescription(o); })
      .then(function () { Net.signal(id, { sdp: pc.localDescription }); })
      .catch(function (e) { console.warn('[rtc] offer', e); });
  }

  function dropPeer(id) {
    if (peers[id]) { try { peers[id].close(); } catch (e) {} delete peers[id]; }
    delete remote[id];
    var a = document.getElementById('rtc-a-' + id); if (a) a.remove();
    renderOverlay();
  }

  function connectAll() {
    (Net.players || []).forEach(function (p) { if (p.id !== Net.id && initiator(p.id)) offerTo(p.id); });
  }

  // Signaling
  if (global.Net) {
    Net.on('rtc-signal', function (m) {
      if (!local) return; // not in a call
      var id = m.from, data = m.data || {};
      var pc = makePeer(id);
      if (data.sdp) {
        pc.setRemoteDescription(new RTCSessionDescription(data.sdp)).then(function () {
          if (data.sdp.type === 'offer') return pc.createAnswer().then(function (a) { return pc.setLocalDescription(a).then(function () { Net.signal(id, { sdp: pc.localDescription }); }); });
        }).catch(function (e) { console.warn('[rtc] sdp', e); });
      } else if (data.ice) {
        pc.addIceCandidate(new RTCIceCandidate(data.ice)).catch(function () {});
      }
    });
    Net.on('peer-join', function (d) { if (local && initiator(d.id)) offerTo(d.id); });
    Net.on('peer-leave', function (d) { dropPeer(d.id); });
  }

  function getMedia(constraints) {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) return Promise.reject(new Error('no media devices'));
    return navigator.mediaDevices.getUserMedia(constraints);
  }

  var RTC = {
    get active() { return voice || video; },
    get muted() { return muted; },
    get camOff() { return camOff; },

    startVoice: function () {
      return getMedia({ audio: true }).then(function (s) { local = s; voice = true; connectAll(); return true; })
        .catch(function (e) { console.warn('[rtc] mic denied', e.message); return false; });
    },
    startVideo: function () {
      return getMedia({ audio: true, video: { width: { ideal: 320 }, height: { ideal: 240 }, facingMode: 'user' } })
        .then(function (s) { local = s; video = true; voice = true; renderOverlay(); connectAll(); return true; })
        .catch(function () { return RTC.startVoice(); });
    },
    toggleMute: function () { muted = !muted; if (local) local.getAudioTracks().forEach(function (t) { t.enabled = !muted; }); return muted; },
    toggleCam: function () { camOff = !camOff; if (local) local.getVideoTracks().forEach(function (t) { t.enabled = !camOff; }); renderOverlay(); return camOff; },
    stop: function () {
      if (local) local.getTracks().forEach(function (t) { t.stop(); });
      local = null; voice = video = false;
      Object.keys(peers).forEach(dropPeer);
      if (overlay) { overlay.remove(); overlay = null; }
    },
  };
  global.RTC = RTC;
})(typeof window !== 'undefined' ? window : this);
