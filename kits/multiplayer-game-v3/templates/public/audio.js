/**
 * GameAudio — Web Audio API procedural sound synthesis
 * Load via <script src="audio.js"></script> before game code.
 * Usage: GameAudio.play('shoot'), GameAudio.play('explode'), etc.
 */
(function(){
var ctx=null,muted=false;
function ac(){if(!ctx)try{ctx=new(window.AudioContext||window.webkitAudioContext)}catch(e){return null}if(ctx.state==='suspended')ctx.resume();return ctx}
function osc(type,freq,dur,vol){var c=ac();if(!c)return;var o=c.createOscillator(),g=c.createGain();o.type=type;o.frequency.value=freq;g.gain.setValueAtTime(vol||0.2,c.currentTime);g.gain.exponentialRampToValueAtTime(0.001,c.currentTime+dur);o.connect(g);g.connect(c.destination);o.start();o.stop(c.currentTime+dur)}
function noise(dur,vol,fq){var c=ac();if(!c)return;var sr=c.sampleRate,buf=c.createBuffer(1,sr*dur,sr),d=buf.getChannelData(0);for(var i=0;i<d.length;i++)d[i]=(Math.random()*2-1);var s=c.createBufferSource();s.buffer=buf;var f=c.createBiquadFilter();f.type='lowpass';f.frequency.setValueAtTime(fq||2000,c.currentTime);f.frequency.exponentialRampToValueAtTime(200,c.currentTime+dur*0.8);var g=c.createGain();g.gain.setValueAtTime(vol||0.3,c.currentTime);g.gain.exponentialRampToValueAtTime(0.001,c.currentTime+dur);s.connect(f);f.connect(g);g.connect(c.destination);s.start();s.stop(c.currentTime+dur)}
function sweep(f1,f2,dur,type){var c=ac();if(!c)return;var o=c.createOscillator(),g=c.createGain();o.type=type||'sawtooth';o.frequency.setValueAtTime(f1,c.currentTime);o.frequency.exponentialRampToValueAtTime(f2,c.currentTime+dur);g.gain.setValueAtTime(0.18,c.currentTime);g.gain.exponentialRampToValueAtTime(0.001,c.currentTime+dur);o.connect(g);g.connect(c.destination);o.start();o.stop(c.currentTime+dur)}

var sounds={
  shoot:function(){osc('square',880,0.08,0.15);setTimeout(function(){osc('square',440,0.05,0.1)},20)},
  explode:function(){noise(0.4,0.35,2000);osc('sawtooth',120,0.25,0.15)},
  hit:function(){noise(0.12,0.2,1500);osc('square',200,0.08,0.1)},
  collect:function(){osc('sine',523,0.1,0.15);setTimeout(function(){osc('sine',659,0.1,0.15)},60);setTimeout(function(){osc('sine',784,0.15,0.15)},120)},
  score:function(){osc('sine',660,0.1,0.15);setTimeout(function(){osc('sine',880,0.15,0.18)},80)},
  win:function(){[523,659,784,1047].forEach(function(f,i){setTimeout(function(){osc('sine',f,0.2,0.15)},i*120)})},
  lose:function(){sweep(440,55,1.0,'sawtooth')},
  bounce:function(){osc('sine',300,0.08,0.12)},
  powerup:function(){[400,500,600,800].forEach(function(f,i){setTimeout(function(){osc('sine',f,0.08,0.12)},i*40)})},
  countdown:function(){osc('sine',440,0.15,0.12)},
  jump:function(){sweep(200,600,0.15,'sine')},
  land:function(){osc('triangle',150,0.1,0.1)},
  engine:function(){osc('sawtooth',85,0.3,0.04)},
  dash:function(){sweep(200,800,0.15,'sawtooth')},
  coin:function(){osc('sine',988,0.06,0.12);setTimeout(function(){osc('sine',1319,0.1,0.12)},60)},
  alarm:function(){osc('square',440,0.2,0.1);setTimeout(function(){osc('square',550,0.2,0.1)},200)}
};

// Persistent engine sound system
var engineOsc=null,engineGain=null,engineLfo=null,engineLfoGain=null;

window.GameAudio={
  play:function(name){if(muted)return;var fn=sounds[name];if(fn)try{fn()}catch(e){}},
  toggle:function(){muted=!muted;if(muted)this.stopEngine();return!muted},
  get muted(){return muted},

  // Continuous engine: call startEngine() once, setEngineSpeed(0-1) each frame, stopEngine() on death/menu
  startEngine:function(){
    try{
      var c=ac();if(!c)return;
      engineOsc=c.createOscillator();engineGain=c.createGain();
      engineLfo=c.createOscillator();engineLfoGain=c.createGain();
      engineOsc.type='sawtooth';engineOsc.frequency.value=75;
      engineGain.gain.value=muted?0:0.045;
      engineLfo.type='sine';engineLfo.frequency.value=5;
      engineLfoGain.gain.value=6;
      engineLfo.connect(engineLfoGain);engineLfoGain.connect(engineOsc.frequency);
      engineOsc.connect(engineGain);engineGain.connect(c.destination);
      engineLfo.start();engineOsc.start();
    }catch(e){}
  },
  setEngineSpeed:function(speed){
    // speed: 0 (idle) to 1 (full throttle)
    if(!engineOsc)return;
    var freq=65+speed*60; // 65Hz idle → 125Hz full
    var vol=muted?0:(0.03+speed*0.04);
    var lfoRate=4+speed*6; // faster wobble at higher speed
    try{
      engineOsc.frequency.setTargetAtTime(freq,ac().currentTime,0.1);
      engineGain.gain.setTargetAtTime(vol,ac().currentTime,0.1);
      engineLfo.frequency.setTargetAtTime(lfoRate,ac().currentTime,0.1);
    }catch(e){}
  },
  stopEngine:function(){
    try{if(engineOsc){engineOsc.stop();engineOsc=null}if(engineLfo){engineLfo.stop();engineLfo=null}}catch(e){}
    engineOsc=null;engineGain=null;engineLfo=null;engineLfoGain=null;
  }
};
})();
