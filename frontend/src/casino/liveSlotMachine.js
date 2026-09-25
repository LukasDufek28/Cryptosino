import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import configs from '../slots/config.json';
import { group, stool } from './models';
import { drawSlotSymbol, drawCachedSlotSymbol, slotArtRevision } from './slotSymbolArt';
import { slotButton, slotSpinStart, slotReelStop, slotCoinTick, slotWin, slotRespin, slotLock, slotCelebration } from './slotAudio';
import { LANDING_CELL, PREVIEW_CELLS_PER_MS, reelFillerSymbol, reelTravelCells, reelStripSymbol } from './reelMotion';

const GOLD = '#b09261', HOUSE_GREEN = '#365345', WALNUT = '#6d5340';
const AMBER_GOLD='#d8a62f', AMBER_RUBY='#4c0712';
function rounded(parent, size, color, pos, options = {}) {
  const geo = new RoundedBoxGeometry(size[0], size[1], size[2], 5, options.radius || 0.06);
  const mat = new THREE.MeshPhysicalMaterial({ color, roughness: options.roughness ?? .3, metalness: options.metalness ?? .45,
    clearcoat: options.clearcoat ?? .35, clearcoatRoughness: .18, emissive: options.emissive || '#000000', emissiveIntensity: options.emissiveIntensity || 0 });
  const mesh = new THREE.Mesh(geo, mat); mesh.position.set(...pos); mesh.castShadow = true; mesh.receiveShadow = true; parent.add(mesh); return mesh;
}
function canvasTexture(w,h){const canvas=document.createElement('canvas');canvas.width=w;canvas.height=h;const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;texture.generateMipmaps=false;texture.minFilter=THREE.LinearFilter;texture.magFilter=THREE.LinearFilter;texture.anisotropy=2;return{canvas,ctx:canvas.getContext('2d',{alpha:false}),texture};}
function labelTexture(text, color = '#ead499') { const { ctx, texture } = canvasTexture(512, 160); ctx.fillStyle = '#0d1012'; ctx.fillRect(0,0,512,160); ctx.strokeStyle = '#8b7545'; ctx.lineWidth = 5; ctx.strokeRect(7,7,498,146); ctx.fillStyle = color; ctx.font = '700 52px Arial'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(text,256,80,470); texture.needsUpdate = true; return texture; }
function buttonFaceTexture(def, amber=false) {
  const canvas=document.createElement('canvas');canvas.width=256;canvas.height=256;const ctx=canvas.getContext('2d');
  ctx.clearRect(0,0,256,256);ctx.textAlign='center';ctx.textBaseline='middle';
  const darkOnGold=amber&&(def.action==='spin'||def.action==='maxBet');const ink=darkOnGold?'#351107':amber?'#ffe5a0':'#fff2cb';ctx.strokeStyle=ink;ctx.fillStyle=ink;ctx.lineWidth=16;ctx.lineCap='round';ctx.lineJoin='round';
  const icon=def.icon;
  if(icon==='spin'){
    ctx.font='900 154px "Segoe UI Symbol","Arial Unicode MS",Arial';ctx.fillText('↻',128,133);
  }else if(icon==='auto'){
    ctx.font='900 52px Arial';ctx.fillText('AUTO',128,126);
    ctx.font='900 46px "Segoe UI Symbol","Arial Unicode MS",Arial';ctx.fillText('↻',128,174);
  }else if(icon==='info'){ctx.font='900 118px Georgia';ctx.fillText('i',128,132);}
  else if(icon==='max'){ctx.font='900 47px Arial';ctx.fillText('MAX',128,102);ctx.fillText('BET',128,158);}
  else if(icon==='betDown'||icon==='betUp'){
    ctx.font='800 36px Arial';ctx.fillText('BET',128,88);ctx.font='900 88px Arial';ctx.fillText(icon==='betUp'?'+':'−',128,157);
  }else{ctx.font='800 48px Arial';ctx.fillText(def.label||'',128,128,220);}
  const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;texture.generateMipmaps=false;texture.minFilter=THREE.LinearFilter;return texture;
}
function plane(parent,w,h,texture,pos,emissive=false){const mat=emissive?new THREE.MeshStandardMaterial({map:texture,transparent:true,alphaTest:.01,depthWrite:false,toneMapped:false,emissive:'#ffffff',emissiveMap:texture,emissiveIntensity:.75,roughness:.28,metalness:.03}):new THREE.MeshBasicMaterial({map:texture,transparent:true,depthWrite:false,toneMapped:false});const m=new THREE.Mesh(new THREE.PlaneGeometry(w,h),mat);m.position.set(...pos);parent.add(m);return m;}
function winningCells(config, spin, wins, visible) { const cells = new Set(); for (const win of wins || []) { if (win.cells) { win.cells.forEach(({reel,row})=>cells.add(`${reel}:${row}`)); continue; } if (win.scatter) { (visible||[]).forEach((syms,r)=>(syms||[]).forEach((s,row)=>{ if(s===win.symbol) cells.add(`${r}:${row}`); })); continue; } const line=config.paylines?.[win.line]||[]; for(let r=0;r<Math.min(win.count||0,line.length);r++) cells.add(`${r}:${line[r]}`); } return cells; }
function money(value) { return Number.isFinite(Number(value)) ? `$${Number(value).toFixed(2)}` : '$0.00'; }

export default function liveSlotMachine(parent, machine, floorY) {
  const config = configs[machine.variant], g = group(parent, machine.x, floorY, machine.z);
  const isJoker = machine.variant === 'joker';
  const cabinet=isJoker?AMBER_RUBY:HOUSE_GREEN;
  const inner=isJoker?'#26040b':'#263b31';
  const wood=isJoker?'#2a090d':WALNUT;
  const deckColor=isJoker?'#3a0911':'#2f463a';
  const metal=isJoker?AMBER_GOLD:GOLD;
  rounded(g,[2.12,2.55,1.04],cabinet,[0,1.31,0],{radius:.13,metalness:isJoker?.20:.12,roughness:isJoker?.28:.5,clearcoat:isJoker?.48:.12,emissive:isJoker?'#230007':'#000',emissiveIntensity:isJoker?.10:0});
  rounded(g,[1.98,2.38,.08],inner,[0,1.39,.535],{radius:.1,metalness:.18,roughness:.42,clearcoat:.16});
  rounded(g,[2.18,.16,1.12],wood,[0,.12,.01],{radius:.055,metalness:isJoker?.16:.05,roughness:.42,clearcoat:.22});
  rounded(g,[2.14,.12,1.08],wood,[0,2.56,.01],{radius:.05,metalness:isJoker?.18:.05,roughness:.38,clearcoat:.24});
  [-1.02,1.02].forEach(x=>rounded(g,[.065,2.18,.08],metal,[x,1.38,.57],{radius:.02,metalness:1,roughness:.12,emissive:isJoker?'#a86b05':'#8d672a',emissiveIntensity:isJoker?.18:.08}));

  let marqueeMesh;
  if(isJoker){
    rounded(g,[2.02,.44,.10],metal,[0,2.50,.605],{radius:.055,metalness:.88,roughness:.16,emissive:'#9d6505',emissiveIntensity:.10});
    rounded(g,[1.94,.36,.075],'#4b0711',[0,2.50,.635],{radius:.045,metalness:.24,roughness:.22,clearcoat:.34,emissive:'#6d0c16',emissiveIntensity:.28});
    const logoTex=new THREE.TextureLoader().load('/casino/amber-respin-logo.png?v=4',()=>{logoTex.colorSpace=THREE.SRGBColorSpace;logoTex.needsUpdate=true;});
    logoTex.colorSpace=THREE.SRGBColorSpace;
    marqueeMesh=plane(g,1.62,.352,logoTex,[0,2.50,.682],true);
    marqueeMesh.material.emissiveIntensity=.88;
    const plaqueTex=new THREE.TextureLoader().load('/casino/amber-81-ways.png?v=4',()=>{plaqueTex.colorSpace=THREE.SRGBColorSpace;plaqueTex.needsUpdate=true;});
    plaqueTex.colorSpace=THREE.SRGBColorSpace;
    [-1.065,1.065].forEach(x=>{
      rounded(g,[.34,.61,.055],metal,[x,1.62,.605],{radius:.035,metalness:.9,roughness:.17,emissive:'#8b5200',emissiveIntensity:.08});
      rounded(g,[.305,.56,.045],'#5a0b18',[x,1.62,.632],{radius:.03,metalness:.22,roughness:.26,clearcoat:.28});
      const p=plane(g,.282,.493,plaqueTex,[x,1.62,.66],true);p.material.emissiveIntensity=.72;
    });
  }else{
    const marquee=labelTexture('AMBER BOOK','#ffe09a');
    marqueeMesh=plane(g,1.84,.36,marquee,[0,2.37,.602],true);marqueeMesh.material.emissiveIntensity=1.05;
    rounded(g,[1.92,.44,.09],'#3e1118',[0,2.37,.545],{radius:.04,metalness:.2,roughness:.3,emissive:'#641722',emissiveIntensity:.45});
  }

  const screen=canvasTexture(768,576);
  rounded(g,[1.84,1.40,.085],'#030304',[0,1.62,.578],{radius:.045,metalness:.82,roughness:.12,clearcoat:.2});
  if(isJoker) rounded(g,[1.89,1.45,.035],metal,[0,1.62,.608],{radius:.04,metalness:.88,roughness:.18,emissive:'#9d6505',emissiveIntensity:.10});
  const screenMesh=plane(g,1.69,1.265,screen.texture,[0,1.62,.632],false);
  screenMesh.material.transparent=false;screenMesh.material.toneMapped=false;
  const deckAngle=.055;
  const deck=rounded(g,[2.02,.16,.72],wood,[0,.76,.70],{radius:.06,metalness:isJoker?.16:.04,roughness:.40,clearcoat:.22});deck.rotation.x=deckAngle;
  const deckTop=rounded(g,[1.90,.045,.62],deckColor,[0,.855,.70],{radius:.04,metalness:.10,roughness:.34,clearcoat:.22});deckTop.rotation.x=deckAngle;
  const frontLip=rounded(g,[2.04,.10,.16],wood,[0,.70,1.04],{radius:.03,metalness:.08,roughness:.40,clearcoat:.18});frontLip.rotation.x=deckAngle;
  [-.95,.95].forEach(x=>{const rail=rounded(g,[.035,.06,.62],metal,[x,.88,.70],{radius:.01,metalness:.86,roughness:.19,emissive:isJoker?'#8c5800':'#000',emissiveIntensity:isJoker?.08:0});rail.rotation.x=deckAngle;});
  rounded(g,[1.74,.23,.10],isJoker?'#30080d':'#26382f',[0,.54,.565],{radius:.025,metalness:.08,roughness:.42});
  rounded(g,[.62,.08,.20],wood,[0,.39,.595],{radius:.03,metalness:.05,roughness:.48});
  for(let i=0;i<5;i++)rounded(g,[.65,.025,.03],isJoker?'#b78b38':'#8c7656',[0,.27+i*.035,-.535],{radius:.008,metalness:.62,roughness:.28});
  [-.76,.76].forEach(x=>rounded(g,[.18,.14,.32],wood,[x,.04,.05],{radius:.035,metalness:.05,roughness:.48}));
  stool(g,0,0,1.90);

  const controls=[];
  const buttonDefs=[
    {action:'betDown',label:'BET −',icon:'betDown',x:-.78,accent:isJoker?'#f0bd45':'#d7c6a3',r:.095},
    {action:'betUp',label:'BET +',icon:'betUp',x:-.48,accent:isJoker?'#f0bd45':'#d7c6a3',r:.095},
    {action:'maxBet',label:'MAX BET',icon:'max',x:-.18,accent:isJoker?'#ffce54':'#c98564',r:.10},
    {action:'toggleAuto',label:'AUTO',icon:'auto',x:.13,accent:isJoker?'#f0bb38':'#7fa89a',r:.095},
    {action:'spin',label:'SPIN',icon:'spin',x:.48,accent:isJoker?'#ffd65e':'#d7b875',r:.14},
    {action:'info',label:'INFO',icon:'info',x:.80,accent:isJoker?'#dca64b':'#8ba9b8',r:.075},
  ];
  buttonDefs.forEach(def=>{
    const ring=new THREE.Mesh(new THREE.CylinderGeometry(def.r+.035,def.r+.035,.035,32),
      new THREE.MeshPhysicalMaterial({color:metal,metalness:.84,roughness:.17,clearcoat:.24,emissive:isJoker?'#8b5200':'#000',emissiveIntensity:isJoker?.05:0}));
    ring.position.set(def.x,.895,.78);ring.rotation.x=deckAngle;ring.castShadow=true;g.add(ring);
    const baseColor=isJoker?((def.action==='spin'||def.action==='maxBet')?'#e8b032':'#5a0b18'):'#24352d';
    const mat=new THREE.MeshPhysicalMaterial({color:baseColor,metalness:isJoker?.22:.12,roughness:.24,clearcoat:.40,emissive:def.accent,emissiveIntensity:.08});
    const b=new THREE.Mesh(new THREE.CylinderGeometry(def.r,def.r,.07,32),mat);
    b.position.set(def.x,.93,.78);b.rotation.x=deckAngle;b.castShadow=true;b.receiveShadow=true;g.add(b);
    b.userData.slotAction=def.action;b.userData.baseY=b.position.y;b.userData.baseColor=new THREE.Color(baseColor);b.userData.accent=new THREE.Color(def.accent);controls.push(b);
    const face=new THREE.Mesh(new THREE.CircleGeometry(def.r*.76,32),new THREE.MeshBasicMaterial({map:buttonFaceTexture(def,isJoker),transparent:true,depthWrite:false,toneMapped:false}));
    face.position.set(def.x,.971,.78);face.rotation.x=-Math.PI/2+deckAngle;face.renderOrder=4;g.add(face);b.userData.face=face;b.userData.baseFaceY=face.position.y;
  });

  const LOGICAL_W=1536, LOGICAL_H=1152, DISPLAY_SCALE=.5, ROUND_MS=2850;
  let state=null,clockAt=0,serverAt=0,hoverAction=null,pressedAction=null,pressUntil=0,lastDraw=-1,lastArtRevision=-1,wasDynamic=false;
  const localReelSeed=Math.floor(Math.random()*2147483647);
  let spinSeed=0,spinStartVisible=config.reels.map(reel=>reel.slice(0,3)),previewSpin=null;
  let soundSpinId=null,soundRound=-1,reelSoundMask=0,winSoundRound=-1,respinSoundRound=-1,lastCoinCents=-1,lastCoinAt=0,celebrationSpinId=null,finalCoinSpinId=null,lastFinalCoinCents=-1,lastFinalCoinAt=0;
  let ui={ bet:10, autoSpin:false, showPaytable:false, busy:false, retry:false, balance:null, message:'' };
  function update(value, serverNow){
    const nextId=value?.preview?.id || value?.spin?.id || (value?.spin?.startedAt ? `${machine.id}:${value.spin.startedAt}` : null);
    if(nextId && nextId!==soundSpinId){
      spinStartVisible=state?.spin?.rounds?.at(-1)?.visible||state?.spin?.visible||spinStartVisible;
      spinSeed=String(nextId).split('').reduce((hash,char)=>(Math.imul(hash,31)+char.charCodeAt(0))|0,localReelSeed);
      soundSpinId=nextId; soundRound=-1; reelSoundMask=0; winSoundRound=-1; respinSoundRound=-1; lastCoinCents=-1; slotSpinStart();
    }
    if(!nextId&&state?.preview) soundSpinId=null;
    state=value;
    previewSpin=value?.preview&&!value?.spin ? { id:value.preview.id,startedAt:value.preview.startedAt,durationMs:60000,
      visible:spinStartVisible,bet:Number(value.preview.bet)||Number(ui.bet),balanceBefore:Number(ui.balance),totalPayout:0 } : null;
    clockAt=performance.now(); serverAt=serverNow; lastDraw=-1;
  }
  function updateControls(value){ ui={...ui,...value}; lastDraw=-1; }
  function setHover(action){ hoverAction=action||null; }
  function press(action){ slotButton(action); pressedAction=action; pressUntil=performance.now()+120; }
  const clamp01=value=>Math.max(0,Math.min(1,value));
  const payoutOf=round=>Number(round?.roundPayout ?? (round?.wins||[]).reduce((sum,win)=>sum+Number(win.payout||0),0));
  const currentSpin=()=>state?.spin||previewSpin;
  function drawGoldFrame(c,x,y,w,h,strong=false,pulse=1){
    c.save();
    c.globalAlpha=.80+.20*pulse;
    c.strokeStyle=strong?'#fff1a6':'#d9ad4e';
    c.lineWidth=(strong?10:5)+(strong?3:1)*pulse;
    c.shadowColor='#ffc53d';
    c.shadowBlur=(strong?20:9)+(strong?12:4)*pulse;
    c.strokeRect(x+7,y+7,w-14,h-14);
    c.restore();
  }
  function panel(c,x,y,w,h,label,value,accent=false){
    const g=c.createLinearGradient(x,y,x,y+h);
    g.addColorStop(0,accent?'#5f1017':'#3a0810');
    g.addColorStop(1,'#190306');
    c.fillStyle=g;c.fillRect(x,y,w,h);
    c.strokeStyle=accent?'#f1c14b':'#b98229';c.lineWidth=4;c.strokeRect(x+2,y+2,w-4,h-4);
    c.fillStyle='#d9b45c';c.font='800 22px Arial';c.textAlign='center';c.fillText(label,x+w/2,y+34);
    c.fillStyle='#fff2c1';c.font='900 46px Arial';c.fillText(value,x+w/2,y+92,w-34);
  }
  function drawSparkles(c,now,gx,gy,gw,gh,amount=12){
    c.save();
    for(let i=0;i<amount;i++){
      const phase=now*.0015+i*2.17;
      const x=gx+((Math.sin(i*9.13)*.5+.5)*gw);
      const y=gy+((Math.cos(i*6.71)*.5+.5)*gh);
      const a=.18+.42*(.5+.5*Math.sin(phase));
      const r=2+4*(.5+.5*Math.sin(phase*1.7));
      c.fillStyle=`rgba(255,221,111,${a})`;c.shadowColor='#ffc83d';c.shadowBlur=12;
      c.beginPath();c.arc(x,y,r,0,Math.PI*2);c.fill();
    }
    c.restore();
  }
  function winTier(multiple){
    const max=Number(config.maxWinX||486);
    if(multiple>=max*.98)return{label:'MAX WIN',scale:1.55,sparks:42};
    if(multiple>=50)return{label:'EPIC WIN',scale:1.35,sparks:34};
    if(multiple>=25)return{label:'MEGA WIN',scale:1.22,sparks:28};
    if(multiple>=10)return{label:'BIG WIN',scale:1.10,sparks:22};
    if(multiple>=3)return{label:'NICE WIN',scale:.96,sparks:16};
    return{label:'WIN',scale:.82,sparks:10};
  }
  function celebrationDuration(multiple){
    const max=Number(config.maxWinX||486);
    if(multiple>=max*.98)return 6500;
    if(multiple>=50)return 5400;
    if(multiple>=25)return 4600;
    if(multiple>=10)return 3600;
    if(multiple>=3)return 2700;
    return 1900;
  }
  function celebrationCountDuration(multiple){
    const max=Number(config.maxWinX||486);
    if(multiple>=max*.98)return 4800;
    if(multiple>=50)return 3800;
    if(multiple>=25)return 3100;
    if(multiple>=10)return 2400;
    if(multiple>=3)return 1750;
    return 1200;
  }
  function drawWinCount(c,amount,multiple,now,final=false){
    const tier=winTier(multiple),pulse=.5+.5*Math.sin(now*.009);
    const scale=tier.scale*(final?1.08:1),boxW=610*scale,boxH=(final?220:170)*scale;
    const x=768-boxW/2,y=495-boxH/2;
    c.save();
    c.fillStyle=final?'rgba(25,2,6,.80)':'rgba(31,3,8,.68)';
    c.fillRect(x,y,boxW,boxH);
    c.strokeStyle='#ffd65d';c.lineWidth=final?8:5;c.shadowColor='#ffae00';c.shadowBlur=(final?28:15)+16*pulse;c.strokeRect(x+5,y+5,boxW-10,boxH-10);
    c.textAlign='center';
    c.fillStyle='#ffe888';c.font=`900 ${Math.round((final?48:34)*scale)}px Georgia`;c.fillText(tier.label,768,y+58*scale);
    const grad=c.createLinearGradient(0,y+70,0,y+boxH);grad.addColorStop(0,'#fff9c7');grad.addColorStop(.48,'#ffd044');grad.addColorStop(1,'#e87812');
    c.fillStyle=grad;c.strokeStyle='#6f2305';c.lineWidth=final?7:5;c.font=`900 ${Math.round((final?86:64)*scale)}px Georgia`;
    c.strokeText(money(amount),768,y+(final?155:125)*scale,boxW-70);c.fillText(money(amount),768,y+(final?155:125)*scale,boxW-70);
    c.restore();
    drawSparkles(c,now,Math.max(180,x-80),Math.max(150,y-80),Math.min(1170,boxW+160),Math.min(650,boxH+160),tier.sparks);
  }
  function drawPaytable(c,gx,gy,gw,gh){
    c.save();c.fillStyle='rgba(18,2,6,.97)';c.fillRect(gx,gy,gw,gh);
    c.strokeStyle='#d5ad58';c.lineWidth=6;c.strokeRect(gx+4,gy+4,gw-8,gh-8);
    c.textAlign='center';c.fillStyle='#ffe49a';c.font='900 46px Georgia';c.fillText('AMBER RESPIN 81 · PAYTABLE',gx+gw/2,gy+62);
    c.fillStyle='#d9c9a5';c.font='700 21px Arial';c.fillText('81 ways · wins start on reel 1 · JESTER substitutes and locks on winning respins',gx+gw/2,gy+96,gw-80);
    const rows=[['CHERRY','LEMON',1,2],['ORANGE','PLUM',2,4],['GRAPES','MELON',3,6],['BELL',null,5,10]];
    rows.forEach((row,i)=>{
      const yy=gy+178+i*142;
      c.fillStyle=i%2?'rgba(255,255,255,.025)':'rgba(255,210,94,.045)';c.fillRect(gx+48,yy-55,gw-96,108);
      const sx=gx+130;
      drawSlotSymbol(c,row[0],sx,yy,92,{amber:isJoker});
      if(row[1])drawSlotSymbol(c,row[1],sx+108,yy,92,{amber:isJoker});
      c.textAlign='left';c.fillStyle='#f4e1b7';c.font='800 25px Arial';c.fillText(row[1]?`${row[0]} / ${row[1]}`:row[0],gx+300,yy+8);
      c.textAlign='center';c.fillStyle='#d3b16a';c.font='700 20px Arial';c.fillText('3 REELS',gx+720,yy-18);c.fillText('4 REELS',gx+960,yy-18);
      c.fillStyle='#ffd96e';c.font='900 35px Arial';c.fillText(`${row[2]}×`,gx+720,yy+24);c.fillText(`${row[3]}×`,gx+960,yy+24);
    });
    drawSlotSymbol(c,'JOKER',gx+175,gy+gh-100,105,{amber:isJoker,highlight:true});
    c.textAlign='left';c.fillStyle='#ffe49a';c.font='800 24px Arial';c.fillText('JESTER WILD',gx+260,gy+gh-112);
    c.fillStyle='#d9c9a5';c.font='700 20px Arial';c.fillText('A winning Jester locks with its winning combination and triggers another respin.',gx+260,gy+gh-76,gw-340);
    c.restore();
  }
  function drawScreen(now){
    const c=screen.ctx,w=LOGICAL_W,h=LOGICAL_H,spin=currentSpin(),previewOnly=Boolean(state?.preview&&!state?.spin);
    c.setTransform(DISPLAY_SCALE,0,0,DISPLAY_SCALE,0,0);
    const presentationOffsetMs=Number(state?.presentationOffsetMs||0);
    const effectiveNow=serverAt+now-clockAt+presentationOffsetMs;
    const presentationStartedAt=state?.presentationStartedAt??spin?.startedAt;
    const elapsed=spin?Math.max(0,effectiveNow-presentationStartedAt):Infinity;
    const postElapsed=spin?effectiveNow-(presentationStartedAt+spin.durationMs):Infinity;
    const animating=Boolean(spin&&elapsed<spin.durationMs);
    const rounds=spin?.rounds?.length?spin.rounds:spin?[{visible:spin.visible,wins:spin.wins,roundPayout:spin.totalPayout,heldCells:[],lockedCells:[],newlyLocked:[]}]:[];
    const ri=rounds.length?(animating?Math.min(rounds.length-1,Math.floor(elapsed/ROUND_MS)):rounds.length-1):0;
    const round=rounds[ri],rt=animating?Math.max(0,elapsed-ri*ROUND_MS):ROUND_MS;
    const visible=round?.visible||spin?.visible||config.reels.map(r=>r.slice(0,3));
    const winCells=winningCells(config,spin,round?.wins||spin?.wins,visible);
    const held=new Set((round?.heldCells||[]).map(v=>`${v.reel}:${v.row}`));
    const roundPayout=payoutOf(round),winStart=1660;
    const winPhase=roundPayout>0&&rt>=winStart;
    const targetCents=Math.max(0,Math.round(roundPayout*100));
    const countDuration=Math.min(1120,Math.max(320,targetCents*16));
    const countProgress=winPhase?clamp01((rt-winStart)/countDuration):0;
    const counted=targetCents?Math.min(targetCents,Math.floor(targetCents*countProgress))/100:0;
    const paidBefore=rounds.slice(0,ri).reduce((sum,item)=>sum+payoutOf(item),0);
    const displayedReturn=spin?(animating?paidBefore+(winPhase?counted:0):Number(spin.totalPayout||0)):0;
    if(animating&&!previewOnly){
      if(soundRound!==ri){soundRound=ri;reelSoundMask=0;lastCoinCents=-1;if(ri>0){slotLock();slotRespin();slotSpinStart();}}
      for(let r=0;r<config.reels.length;r++){const stopAt=980+r*155,bit=1<<r;if(rt>=stopAt&&!(reelSoundMask&bit)){reelSoundMask|=bit;slotReelStop(r);}}
      if(winPhase&&winSoundRound!==ri){winSoundRound=ri;slotWin(Number(roundPayout||0)/Math.max(.01,Number(spin.bet||1)));}
      const cents=Math.round(counted*100);
      if(winPhase&&cents>0&&cents!==lastCoinCents&&now-lastCoinAt>=38){lastCoinCents=cents;lastCoinAt=now;slotCoinTick(cents);}
    }

    const bg=c.createRadialGradient(w*.5,h*.38,80,w*.5,h*.45,900);
    bg.addColorStop(0,isJoker?'#67101c':'#253228');bg.addColorStop(.45,isJoker?'#35050d':'#121a15');bg.addColorStop(1,'#090204');
    c.fillStyle=bg;c.fillRect(0,0,w,h);
    if(isJoker){
      for(let i=0;i<11;i++){
        c.save();c.translate(w/2,390);c.rotate((i-5)*.12);const rg=c.createLinearGradient(0,0,700,0);rg.addColorStop(0,'rgba(255,117,30,.07)');rg.addColorStop(1,'rgba(255,117,30,0)');
        c.fillStyle=rg;c.fillRect(0,-34,760,68);c.restore();
      }
      drawSparkles(c,now,80,30,w-160,900,15);
    }
    c.textAlign='center';c.fillStyle='#e6c06e';c.font='800 24px Arial';
    c.fillText(isJoker?'81 WAYS  ·  WIN LEFT TO RIGHT  ·  JESTER WILD LOCKS & RESPINS':'10 PAYLINES  ·  BOOK WILD & SCATTER',w/2,48);

    const gx=145,gy=82,gw=1246,gh=816,reels=config.reels.length,cw=gw/reels,ch=gh/3;
    c.fillStyle='#160306';c.fillRect(gx-18,gy-18,gw+36,gh+36);
    c.strokeStyle='#e0ac39';c.lineWidth=10;c.shadowColor='#a96000';c.shadowBlur=15;c.strokeRect(gx-16,gy-16,gw+32,gh+32);c.shadowBlur=0;
    for(let r=0;r<reels;r++){
      const rx=gx+r*cw,stopAt=980+r*155,reelRolling=previewOnly||(animating&&rt<stopAt);
      c.save();c.beginPath();c.rect(rx,gy,cw,gh);c.clip();
      for(let row=0;row<3;row++){
        const yy=gy+row*ch;
        const cell=c.createRadialGradient(rx+cw*.45,yy+ch*.35,10,rx+cw*.5,yy+ch*.5,cw*.7);
        cell.addColorStop(0,'#4b0b13');cell.addColorStop(.65,'#260409');cell.addColorStop(1,'#120205');
        c.fillStyle=cell;c.fillRect(rx+2,yy+2,cw-4,ch-4);
      }
      if(reelRolling&&isJoker){
        const previewStart=state?.preview?.startedAt;
        const revealStart=state?.presentationStartedAt;
        const startTravel=!previewOnly&&ri===0&&Number.isFinite(previewStart)&&Number.isFinite(revealStart)
          ? Math.max(0,revealStart-previewStart)*PREVIEW_CELLS_PER_MS : 0;
        const landingCell=startTravel?Math.ceil(startTravel)+LANDING_CELL:LANDING_CELL;
        const travel=previewOnly ? Math.max(0,effectiveNow-previewStart)*PREVIEW_CELLS_PER_MS
          : startTravel&&ri===0 ? startTravel+(landingCell-startTravel)*reelTravelCells(rt,stopAt)/LANDING_CELL
          : reelTravelCells(rt,stopAt);
        const first=Math.floor(travel)-1;
        const start=ri>0?rounds[ri-1]?.visible?.[r]:spinStartVisible[r];
        const seed=spinSeed+ri*37+r*101;
        for(let index=first;index<=first+5;index++){
          const sym=previewOnly ? reelFillerSymbol(config.reels[r],start,index,seed)
            : reelStripSymbol(config.reels[r],start,visible?.[r],index,seed,landingCell);
          drawCachedSlotSymbol(c,sym,rx+cw/2,gy+(index-travel+.5)*ch,cw*.70,{amber:true});
        }
        const blur=c.createLinearGradient(0,gy,0,gy+gh);blur.addColorStop(0,'rgba(255,205,90,.10)');blur.addColorStop(.5,'rgba(255,255,255,0)');blur.addColorStop(1,'rgba(255,205,90,.10)');c.fillStyle=blur;c.fillRect(rx,gy,cw,gh);
      }else if(reelRolling){
        const speed=3.55,slowStart=Math.max(0,stopAt-260),t=rt<=slowStart?0:Math.min(1,(rt-slowStart)/260);
        const travel=(rt<=slowStart?rt*speed:slowStart*speed+speed*260*(t-.5*t*t))+r*91;
        const off=travel%ch,base=Math.floor(travel/ch);
        c.globalAlpha=.88;
        for(let k=-1;k<=3;k++){const sym=config.reels[r][(base+k+r*3)%config.reels[r].length];drawSlotSymbol(c,sym,rx+cw/2,gy+(k+1)*ch-off,cw*.67,{amber:isJoker});}
        const blur=c.createLinearGradient(0,gy,0,gy+gh);blur.addColorStop(0,'rgba(255,205,90,.10)');blur.addColorStop(.5,'rgba(255,255,255,0)');blur.addColorStop(1,'rgba(255,205,90,.10)');c.fillStyle=blur;c.fillRect(rx,gy,cw,gh);
      }else{
        const settle=Math.max(0,rt-stopAt),settleP=Math.min(1,settle/220),bounce=isJoker?0:settle<220?(1-settleP)*22:0;
        for(let row=0;row<3;row++){
          const sym=visible?.[r]?.[row]||config.reels[r][row];
          drawSlotSymbol(c,sym,rx+cw/2,gy+(row+.5)*ch+bounce,cw*.70,{highlight:winPhase&&winCells.has(`${r}:${row}`),amber:isJoker});
        }
      }
      c.restore();
      if(reelRolling)for(let row=0;row<3;row++)if(held.has(`${r}:${row}`)){
        c.fillStyle='rgba(39,3,8,.98)';c.fillRect(rx+3,gy+row*ch+3,cw-6,ch-6);
        drawSlotSymbol(c,visible[r][row],rx+cw/2,gy+(row+.5)*ch,cw*.70,{highlight:true,amber:isJoker});
        drawGoldFrame(c,rx,gy+row*ch,cw,ch,true,.8);
      }
      c.strokeStyle='#8a5a20';c.lineWidth=4;c.strokeRect(rx,gy,cw,gh);
    }
    for(let row=1;row<3;row++){c.strokeStyle='#8a5a20';c.lineWidth=3;c.beginPath();c.moveTo(gx,gy+row*ch);c.lineTo(gx+gw,gy+row*ch);c.stroke();}

    if(winPhase){
      const pulse=.5+.5*Math.sin(rt*.018);
      for(let r=0;r<reels;r++)for(let row=0;row<3;row++){
        const key=`${r}:${row}`,x=gx+r*cw,y=gy+row*ch;
        if(winCells.has(key)){
          c.fillStyle=`rgba(255,190,38,${.08+.07*pulse})`;c.fillRect(x+6,y+6,cw-12,ch-12);
          drawGoldFrame(c,x,y,cw,ch,true,pulse);
        }else{c.fillStyle='rgba(0,0,0,.52)';c.fillRect(x+3,y+3,cw-6,ch-6);}
      }
      drawSparkles(c,now,gx,gy,gw,gh,18);
      drawWinCount(c,paidBefore+counted,Math.max(.01,(paidBefore+counted)/Math.max(.01,Number(spin?.bet||1))),now,false);
    }
    if(!winPhase&&held.size){
      const snap=ri>0&&rt<420?1-Math.min(1,rt/420):.25+.25*Math.sin(rt*.012);
      held.forEach(key=>{const [r,row]=key.split(':').map(Number);drawGoldFrame(c,gx+r*cw,gy+row*ch,cw,ch,true,.55+.45*snap);});
    }

    if(ui.showPaytable&&!animating)drawPaytable(c,gx,gy,gw,gh);
    const hasNext=ri<rounds.length-1&&round?.newlyLocked?.length;
    if(hasNext&&rt>2470&&respinSoundRound!==ri){respinSoundRound=ri;slotLock();}
    if(hasNext&&rt>2440){
      c.save();c.textAlign='center';c.font='900 52px Georgia';c.fillStyle='#ffe47d';c.shadowColor='#ff9f1c';c.shadowBlur=20;c.fillText('RESPIN!',w/2,862);c.restore();
    }

    const displayBet=animating?Number(spin.bet):Number(ui.bet);
    const balanceValue=Number(ui.balance??spin?.balanceBefore??0);
    panel(c,86,946,410,148,'BALANCE',money(balanceValue));
    panel(c,563,946,410,148,'BET',money(displayBet));
    panel(c,1040,946,410,148,'WIN',money(displayedReturn),displayedReturn>0);
    const status=animating?(ri>0?`RESPIN ${ri}`:'SPINNING'):(ui.showPaytable?'PAYTABLE':ui.autoSpin?'AUTO READY':ui.message||'READY');
    c.textAlign='center';c.font='800 22px Arial';c.fillStyle=animating?'#ffd778':'#d7cba9';c.fillText(status,w/2,928,700);

    const totalMultiple=spin?Number(spin.totalPayout||0)/Math.max(.01,Number(spin.bet||1)):0;
    const finalDuration=celebrationDuration(totalMultiple),finalCountDuration=celebrationCountDuration(totalMultiple);
    if(!animating&&spin&&Number(spin.totalPayout)>0&&postElapsed>=0&&postElapsed<finalDuration){
      drawWinCount(c,Number(spin.totalPayout)*clamp01(postElapsed/finalCountDuration),totalMultiple,now,true);
    }
    screen.texture.needsUpdate=true;
  }

  function frame(now){
    const spin=currentSpin();
    const offset=Number(state?.presentationOffsetMs||0);
    const effectiveNow=serverAt+now-clockAt+offset;
    const presentationStartedAt=state?.presentationStartedAt??spin?.startedAt;
    const animated=Boolean(spin&&effectiveNow<presentationStartedAt+spin.durationMs);
    const postElapsed=spin?effectiveNow-(presentationStartedAt+spin.durationMs):Infinity;
    const multiple=spin?Number(spin.totalPayout||0)/Math.max(.01,Number(spin.bet||1)):0;
    const postWin=Boolean(spin&&!animated&&Number(spin.totalPayout)>0&&postElapsed>=0&&postElapsed<celebrationDuration(multiple));
    if(postWin&&celebrationSpinId!==spin.id){
      celebrationSpinId=spin.id;finalCoinSpinId=spin.id;lastFinalCoinCents=-1;lastFinalCoinAt=0;
      const maxWin=multiple>=Number(config.maxWinX||486)*.98;
      slotCelebration(multiple,maxWin);
    }
    if(postWin&&finalCoinSpinId===spin.id){
      const countMs=celebrationCountDuration(multiple);
      const finalCents=Math.round(Number(spin.totalPayout||0)*100*clamp01(postElapsed/countMs));
      const tickGap=multiple>=25?38:multiple>=10?44:52;
      if(finalCents>0&&finalCents!==lastFinalCoinCents&&now-lastFinalCoinAt>=tickGap){
        lastFinalCoinCents=finalCents;lastFinalCoinAt=now;slotCoinTick(finalCents);
      }
    }
    const artRev=slotArtRevision();
    const dynamic=animated||postWin;
    const clearDynamic=wasDynamic&&!dynamic;
    if(lastDraw<0||artRev!==lastArtRevision||(dynamic&&((isJoker&&animated)||now-lastDraw>=16))||clearDynamic){
      drawScreen(now);lastDraw=now;lastArtRevision=artRev;
    }
    wasDynamic=dynamic;
    const ready=!ui.busy&&!animated;
    marqueeMesh.material.emissiveIntensity=animated?1.08:.88+.10*(.5+.5*Math.sin(now*.002));
    controls.forEach(b=>{
      const action=b.userData.slotAction,active=action===hoverAction,pressed=action===pressedAction&&now<pressUntil,disabled=ui.busy&&action!=='info'&&action!=='spin';
      const targetY=b.userData.baseY-(pressed ? .025 : 0);b.position.y=THREE.MathUtils.lerp(b.position.y,targetY,.4);
      if(b.userData.face){b.userData.face.position.y=b.userData.baseFaceY+(b.position.y-b.userData.baseY);b.userData.face.material.opacity=disabled ? .42 : 1;}
      let glow=.07;
      if(action==='spin'&&animated)glow=.20+.08*(.5+.5*Math.sin(now*.011));
      else if(action==='spin'&&ready)glow=.22+.14*(.5+.5*Math.sin(now*.007));
      if(action==='toggleAuto'&&ui.autoSpin)glow=.34;
      if(action==='info'&&ui.showPaytable)glow=.30;
      if(active)glow=Math.max(glow,.27);
      if(pressed)glow=.48;
      if(disabled)glow=.025;
      b.material.emissiveIntensity=glow;
      b.material.color.copy(b.userData.baseColor).lerp(b.userData.accent,(active||pressed)? .20:0);
    });
    if(now>=pressUntil)pressedAction=null;
  }
  drawScreen(performance.now());
  return { id:machine.id, group:g, controls, update, frame, setHover, press, updateControls };
}
