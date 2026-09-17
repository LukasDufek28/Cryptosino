import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import configs from '../slots/config.json';
import { group, stool } from './models';
import { drawSlotSymbol } from './slotSymbolArt';

const GOLD = '#b09261', HOUSE_GREEN = '#365345', WALNUT = '#6d5340';
function rounded(parent, size, color, pos, options = {}) {
  const geo = new RoundedBoxGeometry(size[0], size[1], size[2], 5, options.radius || 0.06);
  const mat = new THREE.MeshPhysicalMaterial({ color, roughness: options.roughness ?? .3, metalness: options.metalness ?? .45,
    clearcoat: options.clearcoat ?? .35, clearcoatRoughness: .18, emissive: options.emissive || '#000000', emissiveIntensity: options.emissiveIntensity || 0 });
  const mesh = new THREE.Mesh(geo, mat); mesh.position.set(...pos); mesh.castShadow = true; mesh.receiveShadow = true; parent.add(mesh); return mesh;
}
function canvasTexture(w, h) { const canvas = document.createElement('canvas'); canvas.width = w; canvas.height = h; const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace; texture.anisotropy = 8; return { canvas, ctx: canvas.getContext('2d'), texture }; }
function labelTexture(text, color = '#ead499') { const { ctx, texture } = canvasTexture(512, 160); ctx.fillStyle = '#0d1012'; ctx.fillRect(0,0,512,160); ctx.strokeStyle = '#8b7545'; ctx.lineWidth = 5; ctx.strokeRect(7,7,498,146); ctx.fillStyle = color; ctx.font = '700 52px Arial'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(text,256,80,470); texture.needsUpdate = true; return texture; }
function controlLabelTexture(text) {
  const { ctx, texture } = canvasTexture(512, 128);
  ctx.clearRect(0, 0, 512, 128);
  ctx.fillStyle = '#e9dfc8';
  ctx.font = '700 42px Arial';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.shadowColor = 'rgba(0,0,0,.75)';
  ctx.shadowBlur = 8;
  ctx.fillText(text, 256, 64, 480);
  texture.needsUpdate = true;
  return texture;
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
  const screen = canvasTexture(1536,1152);
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
    { action:'betDown', label:'BET −', x:-.70, accent:'#d7c6a3', r:.105 },
    { action:'betUp', label:'BET +', x:-.35, accent:'#d7c6a3', r:.105 },
    { action:'maxBet', label:'MAX BET', x:0, accent:'#c98564', r:.11 },
    { action:'toggleAuto', label:'AUTO', x:.35, accent:'#7fa89a', r:.105 },
    { action:'spin', label:'SPIN', x:.70, accent:'#d7b875', r:.135 },
  ];
  buttonDefs.forEach(def=>{
    const ring=new THREE.Mesh(new THREE.CylinderGeometry(def.r+.035,def.r+.035,.035,28),new THREE.MeshPhysicalMaterial({color:GOLD,metalness:.7,roughness:.26,clearcoat:.12}));
    ring.position.set(def.x,.895,.78); ring.rotation.x=deckAngle; ring.castShadow=true; g.add(ring);
    const mat=new THREE.MeshPhysicalMaterial({color:'#24352d',metalness:.12,roughness:.3,clearcoat:.28,emissive:def.accent,emissiveIntensity:.08});
    const b=new THREE.Mesh(new THREE.CylinderGeometry(def.r,def.r,.07,32),mat);
    b.position.set(def.x,.93,.78); b.rotation.x=deckAngle; b.castShadow=true; b.receiveShadow=true; g.add(b);
    b.userData.slotAction=def.action; b.userData.baseY=b.position.y; b.userData.baseColor=new THREE.Color('#24352d'); b.userData.accent=new THREE.Color(def.accent); controls.push(b);
    const tex=controlLabelTexture(def.label); const l=plane(g,def.action === 'maxBet' ? .30 : .24,.055,tex,[def.x,.908,.59]);
    l.rotation.x=-Math.PI/2+deckAngle; l.renderOrder=2;
  });

  let state=null, clockAt=0, serverAt=0, hoverAction=null, pressedAction=null, pressUntil=0, lastDraw=-1;
  let ui={ bet:10, autoSpin:false, busy:false, retry:false, balance:null, message:'' };
  function update(value, serverNow){ state=value; clockAt=performance.now(); serverAt=serverNow; lastDraw=-1; }
  function updateControls(value){ ui={...ui,...value}; lastDraw=-1; }
  function setHover(action){ hoverAction=action||null; }
  function press(action){ pressedAction=action; pressUntil=performance.now()+130; }
  function drawScreen(now){
    const c=screen.ctx,w=screen.canvas.width,h=screen.canvas.height,spin=state?.spin;
    const elapsed=spin?Math.max(0,serverAt+now-clockAt-spin.startedAt):Infinity,running=spin&&elapsed<spin.durationMs;
    const rounds=spin?.rounds?.length?spin.rounds:spin?[{visible:spin.visible,wins:spin.wins,heldCells:[]}]:[];
    const roundLength=4000,ri=rounds.length?Math.min(rounds.length-1,Math.floor(elapsed/roundLength)):0,round=rounds[ri];
    const rt=Math.max(0,elapsed-ri*roundLength),visible=round?.visible||spin?.visible||config.reels.map(r=>r.slice(0,3));
    const held=new Set((round?.heldCells||[]).map(v=>`${v.reel}:${v.row}`)), wins=winningCells(config,spin,round?.wins||spin?.wins,visible);
    const celebration=spin&&!running&&elapsed<spin.durationMs+3800&&Number(spin.totalPayout)>0, pulse=(Math.sin(now/150)+1)/2;
    const bg=c.createLinearGradient(0,0,0,h);bg.addColorStop(0,isJoker?'#3c0a15':'#1d211d');bg.addColorStop(.5,isJoker?'#19060b':'#101410');bg.addColorStop(1,'#070708');c.fillStyle=bg;c.fillRect(0,0,w,h);
    c.fillStyle=isJoker?'#e7bd6f':'#e1c47c';c.textAlign='center';c.font='700 58px Georgia';c.fillText(isJoker?'RESPIN JOKER 81':'AMBER BOOK',w/2,74);
    c.font='700 25px Arial';c.fillStyle='#d8bf88';c.fillText(isJoker?'81 WAYS TO WIN  ·  WILD RESPINS':'10 PAYLINES  ·  BOOK WILD & SCATTER',w/2,116);
    const gx=150,gy=160,gw=1236,gh=780,reels=config.reels.length,cw=gw/reels,ch=gh/3;
    c.fillStyle='#160c10';c.fillRect(gx-15,gy-15,gw+30,gh+30);c.strokeStyle='#c49b50';c.lineWidth=9;c.strokeRect(gx-15,gy-15,gw+30,gh+30);
    for(let r=0;r<reels;r++){
      const rx=gx+r*cw,stopAt=1900+r*210,reelRolling=running&&rt<stopAt;
      c.save();c.beginPath();c.rect(rx,gy,cw,gh);c.clip();
      if(reelRolling){const speed=2.4,travel=rt*speed+r*73,off=travel%ch,base=Math.floor(travel/ch);for(let k=-1;k<=3;k++){const sym=config.reels[r][(base+k+r*3)%config.reels[r].length];drawSlotSymbol(c,sym,rx+cw/2,gy+(k+1)*ch-off,cw*.63);}}
      else for(let row=0;row<3;row++){const sym=visible?.[r]?.[row]||config.reels[r][row];drawSlotSymbol(c,sym,rx+cw/2,gy+(row+.5)*ch,cw*.63,{highlight:wins.has(`${r}:${row}`)});}
      c.restore();
      for(let row=0;row<3;row++)if(held.has(`${r}:${row}`)&&reelRolling){c.fillStyle='rgba(35,10,18,.96)';c.fillRect(rx+3,gy+row*ch+3,cw-6,ch-6);drawSlotSymbol(c,visible[r][row],rx+cw/2,gy+(row+.5)*ch,cw*.63,{highlight:true});}
      c.strokeStyle='#7a5b36';c.lineWidth=4;c.strokeRect(rx,gy,cw,gh);
    }
    for(let row=1;row<3;row++){c.strokeStyle='#7a5b36';c.lineWidth=3;c.beginPath();c.moveTo(gx,gy+row*ch);c.lineTo(gx+gw,gy+row*ch);c.stroke();}
    if(celebration){c.fillStyle=`rgba(255,208,90,${.05+pulse*.08})`;c.fillRect(gx,gy,gw,gh);c.strokeStyle=`rgba(255,222,126,${.45+pulse*.5})`;c.lineWidth=12;c.strokeRect(gx-8,gy-8,gw+16,gh+16);}
    c.textAlign='left';c.fillStyle='#cbb78d';c.font='24px Arial';c.fillText('BET',150,1005);c.fillText('RETURN',500,1005);c.fillText('STATUS',850,1005);
    c.fillStyle='#fff0bd';c.font='700 40px Arial';c.fillText(money(spin?.bet??ui.bet),150,1055);c.fillText(spin?money(spin.totalPayout):'$0.00',500,1055);
    c.fillStyle=running?'#ffd778':'#d8e6d2';c.fillText(running?(ri>0?`RESPIN ${ri}`:'SPINNING'):(ui.message||'READY'),850,1055,520);
    screen.texture.needsUpdate=true;
  }
  function frame(now){
    const animated=state?.spin&&(serverAt+now-clockAt)<state.spin.startedAt+state.spin.durationMs+4000;
    if(lastDraw<0||(animated&&now-lastDraw>32)){drawScreen(now);lastDraw=now;}
    controls.forEach(b=>{const active=b.userData.slotAction===hoverAction,pressed=b.userData.slotAction===pressedAction&&now<pressUntil;b.position.y=THREE.MathUtils.lerp(b.position.y,b.userData.baseY-(pressed?.025:0),.35);b.material.emissiveIntensity=pressed?.42:active?.22:.08;b.material.color.copy(b.userData.baseColor).lerp(b.userData.accent,active?.16:0);});
    if(now>=pressUntil) pressedAction=null;
  }
  drawScreen(performance.now());
  return { id:machine.id, controls, update, frame, setHover, press, updateControls };
}
