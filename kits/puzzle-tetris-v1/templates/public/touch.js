/**
 * TouchControls — Virtual joystick + action button for mobile play.
 * Auto-activates on touch devices. Call TouchControls.init() at game start.
 * Game code reads input via LEFT()/RIGHT()/UP()/DOWN()/ACTION() helpers.
 */
(function(){
var active=false;
var joyX=0,joyY=0,actionDown=false;
var joyId=null,actId=null;
var joyBase=null,joyKnob=null,actBtn=null;
var joyOX=0,joyOY=0;
var DEADZONE=15,JOY_RADIUS=45;

// Touch state exposed to game
window._touchLeft=false;window._touchRight=false;
window._touchUp=false;window._touchDown=false;
window._touchAction=false;

function createUI(){
  var css=document.createElement('style');
  css.textContent='\
    .tc-joy{position:fixed;left:20px;bottom:20px;width:120px;height:120px;border-radius:50%;background:rgba(255,255,255,0.12);border:2px solid rgba(255,255,255,0.25);z-index:9999;touch-action:none}\
    .tc-knob{position:absolute;left:50%;top:50%;width:50px;height:50px;margin:-25px;border-radius:50%;background:rgba(255,255,255,0.35);border:2px solid rgba(255,255,255,0.5);transition:transform 0.05s}\
    .tc-act{position:fixed;right:20px;bottom:30px;width:70px;height:70px;border-radius:50%;background:rgba(255,80,80,0.3);border:3px solid rgba(255,80,80,0.6);z-index:9999;touch-action:none;display:flex;align-items:center;justify-content:center;font:bold 14px sans-serif;color:rgba(255,255,255,0.7);user-select:none}\
    .tc-act.pressed{background:rgba(255,80,80,0.6)}\
    @media(min-width:800px){.tc-joy,.tc-act{display:none}}\
  ';
  document.head.appendChild(css);

  joyBase=document.createElement('div');joyBase.className='tc-joy';
  joyKnob=document.createElement('div');joyKnob.className='tc-knob';
  joyBase.appendChild(joyKnob);document.body.appendChild(joyBase);

  actBtn=document.createElement('div');actBtn.className='tc-act';actBtn.textContent='ACT';
  document.body.appendChild(actBtn);

  // Joystick touch
  joyBase.addEventListener('touchstart',function(e){
    e.preventDefault();var t=e.changedTouches[0];joyId=t.identifier;
    var r=joyBase.getBoundingClientRect();joyOX=r.left+r.width/2;joyOY=r.top+r.height/2;
  },{passive:false});
  joyBase.addEventListener('touchmove',function(e){
    e.preventDefault();
    for(var i=0;i<e.changedTouches.length;i++){
      if(e.changedTouches[i].identifier===joyId){
        var t=e.changedTouches[i];
        var dx=t.clientX-joyOX,dy=t.clientY-joyOY;
        var dist=Math.sqrt(dx*dx+dy*dy);
        if(dist>JOY_RADIUS){dx=dx/dist*JOY_RADIUS;dy=dy/dist*JOY_RADIUS}
        joyKnob.style.transform='translate('+dx+'px,'+dy+'px)';
        window._touchLeft=dx<-DEADZONE;window._touchRight=dx>DEADZONE;
        window._touchUp=dy<-DEADZONE;window._touchDown=dy>DEADZONE;
      }
    }
  },{passive:false});
  function joyEnd(e){
    for(var i=0;i<e.changedTouches.length;i++){
      if(e.changedTouches[i].identifier===joyId){
        joyId=null;joyKnob.style.transform='translate(0,0)';
        window._touchLeft=false;window._touchRight=false;
        window._touchUp=false;window._touchDown=false;
      }
    }
  }
  joyBase.addEventListener('touchend',joyEnd,{passive:false});
  joyBase.addEventListener('touchcancel',joyEnd,{passive:false});

  // Action button
  actBtn.addEventListener('touchstart',function(e){
    e.preventDefault();actId=e.changedTouches[0].identifier;
    window._touchAction=true;actBtn.classList.add('pressed');
  },{passive:false});
  function actEnd(e){
    for(var i=0;i<e.changedTouches.length;i++){
      if(e.changedTouches[i].identifier===actId){
        actId=null;window._touchAction=false;actBtn.classList.remove('pressed');
      }
    }
  }
  actBtn.addEventListener('touchend',actEnd,{passive:false});
  actBtn.addEventListener('touchcancel',actEnd,{passive:false});
}

window.TouchControls={
  init:function(){
    if(!('ontouchstart' in window)&&!navigator.maxTouchPoints)return;
    active=true;createUI();
    // Prevent canvas scroll/zoom
    var cv=document.getElementById('cv');
    if(cv){cv.style.touchAction='none';cv.addEventListener('touchstart',function(e){e.preventDefault()},{passive:false})}
  },
  get active(){return active},
  hide:function(){if(joyBase)joyBase.style.display='none';if(actBtn)actBtn.style.display='none'},
  show:function(){if(joyBase)joyBase.style.display='';if(actBtn)actBtn.style.display=''}
};
})();
