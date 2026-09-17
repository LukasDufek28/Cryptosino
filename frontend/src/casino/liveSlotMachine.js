import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import configs from '../slots/config.json';
import { group, stool } from './models';
import { drawSlotSymbol } from './slotSymbolArt';
import { slotButton, slotSpinStart, slotReelStop, slotCoinTick, slotWin, slotRespin, slotLock } from './slotAudio';

const GOLD = '#b09261', HOUSE_GREEN = '#365345', WALNUT = '#6d5340';
function rounded(parent, size, color, pos, options = {}) {
  const geo = new RoundedBoxGeometry(size[0], size[1], size[2], 5, options.radius || 0.06);
  const mat = new THREE.MeshPhysicalMaterial({ color, roughness: options.roughness ?? .3, metalness: options.metalness ?? .45,
    clearcoat: options.clearcoat ?? .35, clearcoatRoughness: .18, emissive: options.emissive || '#000000', emissiveIntensity: options.emissiveIntensity || 0 });
  const mesh = new THREE.Mesh(geo, mat); mesh.position.set(...pos); mesh.castShadow = true; mesh.receiveShadow = true; parent.add(mesh); return mesh;
}
function canvasTexture(w,h){const canvas=document.createElement('canvas');canvas.width=w;canvas.height=h;const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;texture.generateMipmaps=false;texture.minFilter=THREE.LinearFilter;texture.magFilter=THREE.LinearFilter;texture.anisotropy=2;return{canvas,ctx:canvas.getContext('2d',{alpha:false}),texture};}
function labelTexture(text, color = '#ead499') { const { ctx, texture } = canvasTexture(512, 160); ctx.fillStyle = '#0d1012'; ctx.fillRect(0,0,512,160); ctx.strokeStyle = '#8b7545'; ctx.lineWidth = 5; ctx.strokeRect(7,7,498,146); ctx.fillStyle = color; ctx.font = '700 52px Arial'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(text,256,80,470); texture.needsUpdate = true; return texture; }
function buttonFaceTexture(lines) {
  const canvas=document.createElement('canvas'); canvas.width=256; canvas.height=256;
  const ctx=canvas.getContext('2d'); ctx.clearRect(0,0,256,256);
  ctx.textAlign='center'; ctx.textBaseline='middle'; ctx.fillStyle='#fff2cb';
  ctx.shadowColor='rgba(0,0,0,.85)'; ctx.shadowBlur=9;
  const parts=Array.isArray(lines)?lines:[String(lines)];
  ctx.font=parts.length>1?'800 49px Arial':'800 55px Arial';
  parts.forEach((line,i)=>ctx.fillText(line,128,128+(i-(parts.length-1)/2)*55,220));
  const texture=new THREE.CanvasTexture(canvas); texture.colorSpace=THREE.SRGBColorSpace;
  texture.generateMipmaps=false; texture.minFilter=THREE.LinearFilter; return texture;
}
function plane(parent, w, h, texture, pos, emissive = false) { const mat = emissive ? new THREE.MeshStandardMaterial({ map:texture, emissive:'#ffffff', emissiveMap:texture, emissiveIntensity:.75, roughness:.35, metalness:.05 }) : new THREE.MeshBasicMaterial({ map:texture, transparent:true }); const m = new THREE.Mesh(new THREE.PlaneGeometry(w,h), mat); m.position.set(...pos); parent.add(m); return m; }
function winningCells(config, spin, wins, visible) { const cells = new Set(); for (const win of wins || []) { if (win.cells) { win.cells.forEach(({reel,row})=>cells.add(`${reel}:${row}`)); continue; } if (win.scatter) { (visible||[]).forEach((syms,r)=>(syms||[]).forEach((s,row)=>{ if(s===win.symbol) cells.add(`${r}:${row}`); })); continue; } const line=config.paylines?.[win.line]||[]; for(let r=0;r<Math.min(win.count||0,line.length);r++) cells.add(`${r}:${line[r]}`); } return cells; }
function money(value) { return Number.isFinite(Number(value)) ? `$${Number(value).toFixed(2)}` : '$0.00'; }

export default function liveSlotMachine(parent, machine, floorY) {
  const config = configs[machine.variant], g = group(parent, machine.x, floorY, machine.z);
  const isJoker = machine.variant === 'joker';
  // Premium upright cabinet: glossy black shell, brass/chrome trim, real screen recess and control deck.
  rounded(g,[2.12,2.55,1.04],HOUSE_GREEN,[0,1.31,0],{radius:.13,metalness:.12,roughness:.5,clearcoat:.12});
  rounded(g,[1.98,2.38,.08],'#263b31',[0,1.39,.535],{radius:.1,metalness:.15,roughness:.48,clearcoat:.1});
  rounded(g,[2.18,.16,1.12],WALNUT,[0,.12,.01],{radius:.055,metalness:.05,roughness:.46,clearcoat:.12});
  rounded(g,[2.14,.12,1.08],WALNUT,[0,2.56,.01],{radius:.05,metalness:.05,roughness:.44,clearcoat:.12});
  [-1.02,1.02].forEach(x=>rounded(g,[.055,2.18,.07],GOLD,[x,1.38,.57],{radius:.02,metalness:1,roughness:.12,emissive:'#8d672a',emissiveIntensity:.08}));
  // Marquee.
  const marquee = labelTexture(isJoker ? 'AMBER RESPIN JOKER 81' : 'AMBER BOOK', '#ffe09a');
  const marqueeMesh = plane(g,1.84,.36,marquee,[0,2.37,.585],true); marqueeMesh.material.emissiveIntensity = 1.05;
  rounded(g,[1.92,.44,.09],'#3e1118',[0,2.37,.545],{radius:.04,metalness:.2,roughness:.3,emissive:'#641722',emissiveIntensity:.45});
  marqueeMesh.position.z = .602;
  // Main luminous display under smoked glass.
  const screen = canvasTexture(768,576);
  rounded(g,[1.82,1.38,.08],'#030405',[0,1.62,.578],{radius:.045,metalness:.8,roughness:.13});
  const screenMesh = plane(g,1.69,1.265,screen.texture,[0,1.62,.625],false);
  screenMesh.material.transparent = false;
  screenMesh.material.toneMapped = false;
  // Compact house-matched control console.
  const deckAngle = 0.055;
  const deck = rounded(g,[2.02,.16,.72],WALNUT,[0,.76,.70],{radius:.06,metalness:.04,roughness:.48,clearcoat:.12});
  deck.rotation.x = deckAngle;
  const deckTop = rounded(g,[1.90,.045,.62],'#2f463a',[0,.855,.70],{radius:.04,metalness:.08,roughness:.45,clearcoat:.08});
  deckTop.rotation.x = deckAngle;
  const frontLip = rounded(g,[2.04,.10,.16],WALNUT,[0,.70,1.04],{radius:.03,metalness:.04,roughness:.45,clearcoat:.1});
  frontLip.rotation.x = deckAngle;
  [-.95,.95].forEach(x=>{ const rail=rounded(g,[.03,.06,.62],GOLD,[x,.88,.70],{radius:.01,metalness:.72,roughness:.28}); rail.rotation.x=deckAngle; });
  rounded(g,[1.74,.23,.10],'#26382f',[0,.54,.565],{radius:.025,metalness:.08,roughness:.48});
  rounded(g,[.62,.08,.20],WALNUT,[0,.39,.595],{radius:.03,metalness:.03,roughness:.5});
  for(let i=0;i<5;i++) rounded(g,[.65,.025,.03],'#8c7656',[0,.27+i*.035,-.535],{radius:.008,metalness:.55,roughness:.34});
  [-.76,.76].forEach(x=>rounded(g,[.18,.14,.32],WALNUT,[x,.04,.05],{radius:.035,metalness:.03,roughness:.5}));
  stool(g,0,0,1.90);

  const controls = [];
  const buttonDefs = [
    { action:'betDown', label:'BET −', face:['BET','−'], x:-.78, accent:'#d7c6a3', r:.095 },
    { action:'betUp', label:'BET +', face:['BET','+'], x:-.48, accent:'#d7c6a3', r:.095 },
    { action:'maxBet', label:'MAX BET', face:['MAX','BET'], x:-.18, accent:'#c98564', r:.10 },
    { action:'toggleAuto', label:'AUTO', face:['AUTO'], x:.13, accent:'#7fa89a', r:.095 },
    { action:'spin', label:'SPIN', face:['SPIN'], x:.48, accent:'#d7b875', r:.135 },
    { action:'info', label:'INFO', face:['i'], x:.80, accent:'#8ba9b8', r:.075 },
  ];
  buttonDefs.forEach(def=>{
    const ring=new THREE.Mesh(new THREE.CylinderGeometry(def.r+.035,def.r+.035,.035,28),new THREE.MeshPhysicalMaterial({color:GOLD,metalness:.7,roughness:.26,clearcoat:.12}));
    ring.position.set(def.x,.895,.78); ring.rotation.x=deckAngle; ring.castShadow=true; g.add(ring);
    const mat=new THREE.MeshPhysicalMaterial({color:'#24352d',metalness:.12,roughness:.3,clearcoat:.28,emissive:def.accent,emissiveIntensity:.08});
    const b=new THREE.Mesh(new THREE.CylinderGeometry(def.r,def.r,.07,32),mat);
    b.position.set(def.x,.93,.78); b.rotation.x=deckAngle; b.castShadow=true; b.receiveShadow=true; g.add(b);
    b.userData.slotAction=def.action; b.userData.baseY=b.position.y; b.userData.baseColor=new THREE.Color('#24352d'); b.userData.accent=new THREE.Color(def.accent); controls.push(b);
    const face=new THREE.Mesh(new THREE.CircleGeometry(def.r*.76,32),new THREE.MeshBasicMaterial({map:buttonFaceTexture(def.face),transparent:true,depthWrite:false,toneMapped:false}));
    face.position.set(def.x,.971,.78); face.rotation.x=-Math.PI/2+deckAngle; face.renderOrder=4; g.add(face); b.userData.face=face; b.userData.baseFaceY=face.position.y;
  });

  const LOGICAL_W=1536, LOGICAL_H=1152, DISPLAY_SCALE=.5, ROUND_MS=2850;
  let state=null, clockAt=0, serverAt=0, hoverAction=null, pressedAction=null, pressUntil=0, lastDraw=-1;
  let soundSpinId=null, soundRound=-1, reelSoundMask=0, winSoundRound=-1, respinSoundRound=-1, lastCoinCents=-1, lastCoinAt=0;
  let ui={ bet:10, autoSpin:false, showPaytable:false, busy:false, retry:false, balance:null, message:'' };
  function update(value, serverNow){
    const nextId=value?.spin?.id || (value?.spin?.startedAt ? `${machine.id}:${value.spin.startedAt}` : null);
    if(nextId && nextId!==soundSpinId){ soundSpinId=nextId; soundRound=-1; reelSoundMask=0; winSoundRound=-1; respinSoundRound=-1; lastCoinCents=-1; slotSpinStart(); }
    state=value; clockAt=performance.now(); serverAt=serverNow; lastDraw=-1;
  }
  function updateControls(value){ ui={...ui,...value}; lastDraw=-1; }
  function setHover(action){ hoverAction=action||null; }
  function press(action){ slotButton(action); pressedAction=action; pressUntil=performance.now()+120; }
  const clamp01=value=>Math.max(0,Math.min(1,value));
  const payoutOf=round=>Number(round?.roundPayout ?? (round?.wins||[]).reduce((sum,win)=>sum+Number(win.payout||0),0));
  function drawGoldFrame(c,x,y,w,h,strong=false,pulse=1){
    c.save(); c.globalAlpha=.78+.22*pulse; c.strokeStyle=strong?'#fff0a6':'#d9ad4e'; c.lineWidth=(strong?9:6)+(strong?4:2)*pulse;
    c.shadowColor='#ffc83d'; c.shadowBlur=(strong?18:10)+(strong?14:8)*pulse; c.strokeRect(x+7,y+7,w-14,h-14); c.restore();
  }
  function drawWinAmount(c,amount){
    c.save(); c.textAlign='center'; c.textBaseline='middle'; c.shadowColor='rgba(0,0,0,.85)'; c.shadowBlur=18;
    c.font='900 112px Georgia'; const grad=c.createLinearGradient(0,430,0,590); grad.addColorStop(0,'#fff1a6');grad.addColorStop(.42,'#ffc531');grad.addColorStop(1,'#e26e12');c.fillStyle=grad;
    c.strokeStyle='#6b2708';c.lineWidth=10;c.strokeText(`$${amount.toFixed(2)}`,LOGICAL_W/2,560,920);c.fillText(`$${amount.toFixed(2)}`,LOGICAL_W/2,560,920);
    c.font='800 30px Arial';c.fillStyle='#fff1bd';c.fillText('WIN',LOGICAL_W/2,474);c.restore();
  }

  function drawPaytable(c,gx,gy,gw,gh){
    c.save(); c.fillStyle='rgba(16,7,10,.96)'; c.fillRect(gx,gy,gw,gh);
    c.strokeStyle='#d5ad58'; c.lineWidth=6; c.strokeRect(gx+4,gy+4,gw-8,gh-8);
    c.textAlign='center'; c.fillStyle='#ffe49a'; c.font='800 50px Georgia'; c.fillText('PAYTABLE',gx+gw/2,gy+70);
    c.fillStyle='#d9c9a5'; c.font='700 23px Arial'; c.fillText('All wins start on the left reel · JOKER substitutes · JOKER win locks for a respin',gx+gw/2,gy+112,gw-80);
    const rows=[['CHERRY / LEMON','1×','2×'],['ORANGE / PLUM','2×','4×'],['GRAPES / MELON','3×','6×'],['BELL','5×','10×']];
    c.font='700 25px Arial'; c.fillStyle='#a99468'; c.fillText('SYMBOL',gx+250,gy+180); c.fillText('3 REELS',gx+690,gy+180); c.fillText('4 REELS',gx+1000,gy+180);
    rows.forEach((row,i)=>{const y=gy+245+i*112;c.fillStyle=i%2?'rgba(255,255,255,.025)':'rgba(255,213,122,.035)';c.fillRect(gx+60,y-52,gw-120,88);c.fillStyle='#f2e3bc';c.textAlign='left';c.font='700 29px Arial';c.fillText(row[0],gx+120,y);c.textAlign='center';c.font='800 35px Arial';c.fillStyle='#ffd46c';c.fillText(row[1],gx+690,y);c.fillText(row[2],gx+1000,y);});
    c.fillStyle='#d6b67a'; c.font='700 24px Arial'; c.fillText('JOKER = WILD  ·  RESPIN AWARDS ARE ADDED TO THE SAME SPIN',gx+gw/2,gy+gh-70);
    c.restore();
  }
  function drawScreen(now){
    const c=screen.ctx,w=LOGICAL_W,h=LOGICAL_H,spin=state?.spin;
    c.setTransform(DISPLAY_SCALE,0,0,DISPLAY_SCALE,0,0);
    const elapsed=spin?Math.max(0,serverAt+now-clockAt-spin.startedAt):Infinity;
    const animating=Boolean(spin&&elapsed<spin.durationMs);
    const rounds=spin?.rounds?.length?spin.rounds:spin?[{visible:spin.visible,wins:spin.wins,roundPayout:spin.totalPayout,heldCells:[],lockedCells:[],newlyLocked:[]}]:[];
    const ri=rounds.length?(animating?Math.min(rounds.length-1,Math.floor(elapsed/ROUND_MS)):rounds.length-1):0;
    const round=rounds[ri];
    const rt=animating?Math.max(0,elapsed-ri*ROUND_MS):ROUND_MS;
    const visible=round?.visible||spin?.visible||config.reels.map(r=>r.slice(0,3));
    const winCells=winningCells(config,spin,round?.wins||spin?.wins,visible);
    const held=new Set((round?.heldCells||[]).map(v=>`${v.reel}:${v.row}`));
    const roundPayout=payoutOf(round), winStart=1660;
    const winPhase=roundPayout>0&&rt>=winStart;
    const targetCents=Math.max(0,Math.round(roundPayout*100));
    const countDuration=Math.min(1150,Math.max(320,targetCents*18));
    const countProgress=winPhase?clamp01((rt-winStart)/countDuration):0;
    const counted=targetCents?Math.min(targetCents,Math.floor(targetCents*countProgress))/100:0;
    const paidBefore=rounds.slice(0,ri).reduce((sum,item)=>sum+payoutOf(item),0);
    const displayedReturn=spin?(animating?paidBefore+(winPhase?counted:0):Number(spin.totalPayout||0)):0;
    if(animating){
      if(soundRound!==ri){ soundRound=ri; reelSoundMask=0; lastCoinCents=-1; if(ri>0){ slotLock(); slotSpinStart(); } }
      for(let r=0;r<config.reels.length;r++){ const stopAt=980+r*155; const bit=1<<r; if(rt>=stopAt && !(reelSoundMask&bit)){ reelSoundMask|=bit; slotReelStop(r); } }
      if(winPhase && winSoundRound!==ri){ winSoundRound=ri; slotWin(Number(roundPayout||0)/Math.max(.01,Number(spin.bet||1))); }
      const cents=Math.round(counted*100);
      if(winPhase && cents>0 && cents!==lastCoinCents && now-lastCoinAt>=38){ lastCoinCents=cents; lastCoinAt=now; slotCoinTick(cents); }
    }
    const bg=c.createLinearGradient(0,0,0,h);bg.addColorStop(0,isJoker?'#4d0917':'#1d211d');bg.addColorStop(.55,isJoker?'#20070d':'#101410');bg.addColorStop(1,'#070708');c.fillStyle=bg;c.fillRect(0,0,w,h);
    c.fillStyle='#f2c969';c.textAlign='center';c.font='700 58px Georgia';c.fillText(isJoker?'RESPIN JOKER 81':'AMBER BOOK',w/2,70);
    c.font='700 24px Arial';c.fillStyle='#d6b67a';c.fillText(isJoker?'81 WAYS  ·  LEFT → RIGHT  ·  STICKY WILD RESPINS':'10 PAYLINES  ·  BOOK WILD & SCATTER',w/2,112);
    const gx=150,gy=150,gw=1236,gh=780,reels=config.reels.length,cw=gw/reels,ch=gh/3;
    c.fillStyle='#17090d';c.fillRect(gx-15,gy-15,gw+30,gh+30);c.strokeStyle='#c79a43';c.lineWidth=9;c.strokeRect(gx-15,gy-15,gw+30,gh+30);
    for(let r=0;r<reels;r++){
      const rx=gx+r*cw,stopAt=980+r*155,reelRolling=animating&&rt<stopAt;
      c.save();c.beginPath();c.rect(rx,gy,cw,gh);c.clip();
      if(reelRolling){
        const speed=3.55, slowStart=Math.max(0,stopAt-260);
        const t=rt<=slowStart?0:Math.min(1,(rt-slowStart)/260);
        const travel=(rt<=slowStart?rt*speed:slowStart*speed+speed*260*(t-.5*t*t))+r*91;
        const off=travel%ch,base=Math.floor(travel/ch);
        for(let k=-1;k<=3;k++){const sym=config.reels[r][(base+k+r*3)%config.reels[r].length];drawSlotSymbol(c,sym,rx+cw/2,gy+(k+1)*ch-off,cw*.66);}
      } else {
        const settle=Math.max(0,rt-stopAt), settleP=Math.min(1,settle/220);
        const bounce=settle<220?(1-settleP)*24:0;
        for(let row=0;row<3;row++){const sym=visible?.[r]?.[row]||config.reels[r][row];drawSlotSymbol(c,sym,rx+cw/2,gy+(row+.5)*ch+bounce,cw*.66,{highlight:winPhase&&winCells.has(`${r}:${row}`)});}
      }
      c.restore();
      if(reelRolling) for(let row=0;row<3;row++) if(held.has(`${r}:${row}`)){
        c.fillStyle='rgba(35,10,15,.98)';c.fillRect(rx+3,gy+row*ch+3,cw-6,ch-6);drawSlotSymbol(c,visible[r][row],rx+cw/2,gy+(row+.5)*ch,cw*.66,{highlight:true});drawGoldFrame(c,rx,gy+row*ch,cw,ch,true);
      }
      c.strokeStyle='#72512d';c.lineWidth=4;c.strokeRect(rx,gy,cw,gh);
    }
    for(let row=1;row<3;row++){c.strokeStyle='#72512d';c.lineWidth=3;c.beginPath();c.moveTo(gx,gy+row*ch);c.lineTo(gx+gw,gy+row*ch);c.stroke();}
    if(winPhase){const pulse=.5+.5*Math.sin(rt*.018);for(let r=0;r<reels;r++)for(let row=0;row<3;row++){const key=`${r}:${row}`,x=gx+r*cw,y=gy+row*ch;if(winCells.has(key)){c.fillStyle=`rgba(255,190,38,${.07+.06*pulse})`;c.fillRect(x+6,y+6,cw-12,ch-12);drawGoldFrame(c,x,y,cw,ch,true,pulse);}else{c.fillStyle='rgba(0,0,0,.48)';c.fillRect(x+3,y+3,cw-6,ch-6);}}}
    if(!winPhase&&held.size){const snap=ri>0&&rt<420?1-Math.min(1,rt/420):.25+.25*Math.sin(rt*.012);held.forEach(key=>{const [r,row]=key.split(':').map(Number);drawGoldFrame(c,gx+r*cw,gy+row*ch,cw,ch,true,.55+.45*snap);});}
    if(ui.showPaytable && !animating) drawPaytable(c,gx,gy,gw,gh);
    else if(winPhase) drawWinAmount(c,counted);
    const hasNext=ri<rounds.length-1&&round?.newlyLocked?.length;
    if(hasNext&&rt>2470&&respinSoundRound!==ri){ respinSoundRound=ri; slotRespin(); }
    if(hasNext&&rt>2470){c.save();c.textAlign='center';c.font='900 66px Georgia';c.fillStyle='#ffe47d';c.shadowColor='#ff9f1c';c.shadowBlur=22;c.fillText('RESPIN!',w/2,890);c.restore();}
    c.textAlign='left';c.fillStyle='#cbb78d';c.font='24px Arial';c.fillText('BET',150,985);c.fillText('WIN',500,985);c.fillText('STATUS',850,985);
    const displayBet=animating?Number(spin.bet):Number(ui.bet);c.fillStyle='#fff0bd';c.font='700 40px Arial';c.fillText(money(displayBet),150,1035);c.fillText(money(displayedReturn),500,1035);
    c.fillStyle=animating?'#ffd778':'#d8e6d2';c.fillText(animating?(ri>0?`RESPIN ${ri}`:'SPINNING'):(ui.showPaytable?'PAYTABLE':ui.autoSpin?'AUTO READY':ui.message||'READY'),850,1035,520);
    screen.texture.needsUpdate=true;
  }
  function frame(now){
    const animated=state?.spin&&(serverAt+now-clockAt)<state.spin.startedAt+state.spin.durationMs;
    if(lastDraw<0||(animated&&now-lastDraw>=16)){drawScreen(now);lastDraw=now;}
    const ready=!ui.busy&&!animated;
    marqueeMesh.material.emissiveIntensity=animated?1.08:.98+.08*(.5+.5*Math.sin(now*.002));
    controls.forEach(b=>{
      const action=b.userData.slotAction,active=action===hoverAction,pressed=action===pressedAction&&now<pressUntil,disabled=ui.busy&&action!=='info';
      const targetY=b.userData.baseY-(pressed ? .025 : 0);b.position.y=THREE.MathUtils.lerp(b.position.y,targetY,.4);
      if(b.userData.face){b.userData.face.position.y=b.userData.baseFaceY+(b.position.y-b.userData.baseY);b.userData.face.material.opacity=disabled ? .42 : 1;}
      let glow=.07;if(action==='spin'&&ready)glow=.18+.12*(.5+.5*Math.sin(now*.007));if(action==='toggleAuto'&&ui.autoSpin)glow=.34;if(action==='info'&&ui.showPaytable)glow=.30;if(active)glow=Math.max(glow,.25);if(pressed)glow=.45;if(disabled)glow=.025;
      b.material.emissiveIntensity=glow;b.material.color.copy(b.userData.baseColor).lerp(b.userData.accent,(active||pressed) ? .20 : 0);
    });
    if(now>=pressUntil) pressedAction=null;
  }
  drawScreen(performance.now());
  return { id:machine.id, controls, update, frame, setHover, press, updateControls };
}
