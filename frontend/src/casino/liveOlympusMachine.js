import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import configs from '../slots/config.json';
import { group, stool } from './models';
import { drawOlympusKing, drawOlympusSymbol } from './olympusArt';
import { slotButton, slotCoinTick, slotSpinStart, slotWin, olympusTumble, olympusMultiplier, olympusScatter, olympusThunder, olympusFreeSpinStart } from './slotAudio';

const GOLD='#d9b657', NAVY='#17284d', MARBLE='#e9e2d3', PURPLE='#39245d';
const LOGICAL_W=1536, LOGICAL_H=1152, DISPLAY_SCALE=.5;
const config=configs.olympus;
const IDLE_GRID=[
  ['BLUE','GREEN','CROWN','PURPLE','YELLOW'],['RED','RING','BLUE','GREEN','CHALICE'],
  ['YELLOW','HOURGLASS','PURPLE','BLUE','RED'],['GREEN','SCATTER','YELLOW','RING','PURPLE'],
  ['CHALICE','BLUE','RED','GREEN','CROWN'],['PURPLE','MULT:10','GREEN','YELLOW','BLUE']
];
function rounded(parent,size,color,pos,opt={}){
  const geo=new RoundedBoxGeometry(size[0],size[1],size[2],5,opt.radius||.06);
  const mat=new THREE.MeshPhysicalMaterial({color,roughness:opt.roughness??.32,metalness:opt.metalness??.25,clearcoat:opt.clearcoat??.28,clearcoatRoughness:.18,emissive:opt.emissive||'#000',emissiveIntensity:opt.emissiveIntensity||0});
  const m=new THREE.Mesh(geo,mat);m.position.set(...pos);m.castShadow=true;m.receiveShadow=true;parent.add(m);return m;
}
function canvasTexture(w,h){const canvas=document.createElement('canvas');canvas.width=w;canvas.height=h;const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;texture.generateMipmaps=false;texture.minFilter=THREE.LinearFilter;texture.magFilter=THREE.LinearFilter;texture.anisotropy=2;return{canvas,ctx:canvas.getContext('2d',{alpha:false}),texture};}
function plane(parent,w,h,texture,pos,emissive=false){const mat=emissive?new THREE.MeshStandardMaterial({map:texture,emissive:'#fff',emissiveMap:texture,emissiveIntensity:.8,roughness:.3}):new THREE.MeshBasicMaterial({map:texture,toneMapped:false});const m=new THREE.Mesh(new THREE.PlaneGeometry(w,h),mat);m.position.set(...pos);parent.add(m);return m;}
function textTexture(text,color='#ffe69a'){const{ctx,texture}=canvasTexture(768,180);ctx.fillStyle='#10182b';ctx.fillRect(0,0,768,180);ctx.strokeStyle='#b98a31';ctx.lineWidth=8;ctx.strokeRect(8,8,752,164);ctx.textAlign='center';ctx.textBaseline='middle';ctx.font='900 62px Georgia';ctx.fillStyle=color;ctx.shadowColor='#6d4614';ctx.shadowBlur=12;ctx.fillText(text,384,90,710);texture.needsUpdate=true;return texture;}
function buttonFaceTexture(lines){const canvas=document.createElement('canvas');canvas.width=256;canvas.height=256;const c=canvas.getContext('2d');c.textAlign='center';c.textBaseline='middle';c.fillStyle='#fff4cf';c.shadowColor='rgba(0,0,0,.85)';c.shadowBlur=8;const parts=Array.isArray(lines)?lines:[String(lines)];c.font=parts.length>1?'800 48px Arial':'800 55px Arial';parts.forEach((line,i)=>c.fillText(line,128,128+(i-(parts.length-1)/2)*54,220));const t=new THREE.CanvasTexture(canvas);t.colorSpace=THREE.SRGBColorSpace;t.generateMipmaps=false;t.minFilter=THREE.LinearFilter;return t;}
function money(value){return Number.isFinite(Number(value))?`$${Number(value).toFixed(2)}`:'$0.00';}
function clamp01(v){return Math.max(0,Math.min(1,v));}
function easeOut(v){return 1-Math.pow(1-clamp01(v),3);}
function parseSymbol(value){if(typeof value==='string'&&value.startsWith('MULT:'))return{symbol:'MULT',value:Number(value.slice(5))||2};return{symbol:value,value:0};}
function roundWinCells(round){const set=new Set();(round?.wins||[]).forEach(win=>(win.cells||[]).forEach(({reel,row})=>set.add(`${reel}:${row}`)));return set;}
function totalThrough(rounds,index){let total=0;for(let i=0;i<=index&&i<rounds.length;i++)total+=Number(rounds[i]?.sequencePayout||0);return total;}

export default function liveOlympusMachine(parent,machine,floorY){
  const g=group(parent,machine.x,floorY,machine.z);
  rounded(g,[2.18,2.62,1.08],NAVY,[0,1.34,0],{radius:.14,metalness:.18,roughness:.38,clearcoat:.26});
  rounded(g,[2.03,2.42,.08],'#11182a',[0,1.41,.56],{radius:.10,metalness:.28,roughness:.28});
  rounded(g,[2.24,.16,1.16],MARBLE,[0,.12,.01],{radius:.055,metalness:.03,roughness:.56});
  rounded(g,[2.20,.12,1.12],MARBLE,[0,2.64,.01],{radius:.05,metalness:.03,roughness:.5});
  [-1.04,1.04].forEach(x=>rounded(g,[.06,2.24,.08],GOLD,[x,1.42,.59],{radius:.02,metalness:.9,roughness:.16,emissive:'#8a651a',emissiveIntensity:.12}));
  const marquee=textTexture('AMBER OLYMPUS');
  const marqueeMesh=plane(g,1.88,.38,marquee,[0,2.43,.615],true);marqueeMesh.material.emissiveIntensity=1.02;
  const screen=canvasTexture(768,576);
  rounded(g,[1.86,1.43,.085],'#02050a',[0,1.65,.60],{radius:.05,metalness:.8,roughness:.12});
  const screenMesh=plane(g,1.73,1.31,screen.texture,[0,1.65,.65]);screenMesh.material.transparent=false;
  const deckAngle=.055;
  const deck=rounded(g,[2.08,.17,.74],MARBLE,[0,.77,.72],{radius:.06,metalness:.03,roughness:.48});deck.rotation.x=deckAngle;
  const deckTop=rounded(g,[1.96,.045,.64],PURPLE,[0,.865,.72],{radius:.04,metalness:.12,roughness:.36,emissive:'#2d1a50',emissiveIntensity:.16});deckTop.rotation.x=deckAngle;
  const frontLip=rounded(g,[2.10,.10,.17],GOLD,[0,.70,1.07],{radius:.03,metalness:.62,roughness:.28});frontLip.rotation.x=deckAngle;
  rounded(g,[1.82,.22,.10],NAVY,[0,.54,.58],{radius:.025,metalness:.14,roughness:.4});
  stool(g,0,0,1.92);

  const controls=[];
  const defs=[
    {action:'betDown',face:['BET','−'],x:-.79,r:.095,accent:'#d9d1bc'},
    {action:'betUp',face:['BET','+'],x:-.49,r:.095,accent:'#d9d1bc'},
    {action:'maxBet',face:['MAX','BET'],x:-.19,r:.10,accent:'#e49a5f'},
    {action:'toggleAuto',face:['AUTO'],x:.12,r:.095,accent:'#75a8d4'},
    {action:'spin',face:['SPIN'],x:.48,r:.137,accent:'#f0c85a'},
    {action:'info',face:['i'],x:.82,r:.075,accent:'#9e86d8'}
  ];
  defs.forEach(def=>{
    const ring=new THREE.Mesh(new THREE.CylinderGeometry(def.r+.035,def.r+.035,.035,28),new THREE.MeshPhysicalMaterial({color:GOLD,metalness:.78,roughness:.22}));ring.position.set(def.x,.90,.79);ring.rotation.x=deckAngle;g.add(ring);
    const mat=new THREE.MeshPhysicalMaterial({color:'#253459',metalness:.18,roughness:.28,clearcoat:.3,emissive:def.accent,emissiveIntensity:.09});
    const b=new THREE.Mesh(new THREE.CylinderGeometry(def.r,def.r,.07,32),mat);b.position.set(def.x,.936,.79);b.rotation.x=deckAngle;b.castShadow=true;g.add(b);b.userData.slotAction=def.action;b.userData.baseY=b.position.y;b.userData.baseColor=new THREE.Color('#253459');b.userData.accent=new THREE.Color(def.accent);controls.push(b);
    const face=new THREE.Mesh(new THREE.CircleGeometry(def.r*.76,32),new THREE.MeshBasicMaterial({map:buttonFaceTexture(def.face),transparent:true,depthWrite:false,toneMapped:false}));face.position.set(def.x,.978,.79);face.rotation.x=-Math.PI/2+deckAngle;face.renderOrder=4;g.add(face);b.userData.face=face;b.userData.baseFaceY=face.position.y;
  });
  const ROUND_MS=Number(config.roundDurationMs||1350);
  let state=null,clockAt=0,serverAt=0,lastDraw=-1,hoverAction=null,pressedAction=null,pressUntil=0;
  let ui={bet:10,autoSpin:false,showPaytable:false,busy:false,retry:false,balance:null,message:''};
  let soundSpinId=null,soundRound=-1,lastCoinCents=-1,lastCoinAt=0,freeIntroPlayed=false;
  function update(value,serverNow){
    const nextId=value?.spin?.id||(value?.spin?.startedAt?`${machine.id}:${value.spin.startedAt}`:null);
    if(nextId&&nextId!==soundSpinId){soundSpinId=nextId;soundRound=-1;lastCoinCents=-1;freeIntroPlayed=false;slotSpinStart();}
    state=value;clockAt=performance.now();serverAt=Number(serverNow)||Date.now();lastDraw=-1;
  }
  function updateControls(value){ui={...ui,...value};lastDraw=-1;}
  function setHover(action){hoverAction=action||null;}
  function press(action){slotButton(action);pressedAction=action;pressUntil=performance.now()+120;}

  function drawBackground(c,now,freeMode=false){
    const grad=c.createLinearGradient(0,0,0,LOGICAL_H);grad.addColorStop(0,freeMode?'#381f65':'#62b8ff');grad.addColorStop(.48,freeMode?'#7047a2':'#dceeff');grad.addColorStop(1,'#382b68');c.fillStyle=grad;c.fillRect(0,0,LOGICAL_W,LOGICAL_H);
    c.globalAlpha=freeMode ? .28 : .72;c.fillStyle='#fff';for(let i=0;i<6;i++){const x=80+i*280+(Math.sin(now*.0004+i)*18),y=115+(i%2)*44;c.beginPath();c.arc(x,y,58,0,Math.PI*2);c.arc(x+58,y+5,43,0,Math.PI*2);c.arc(x-48,y+10,38,0,Math.PI*2);c.fill();}c.globalAlpha=1;
    c.fillStyle='rgba(41,28,84,.72)';c.fillRect(72,145,1010,760);c.strokeStyle='#e5c562';c.lineWidth=7;c.strokeRect(72,145,1010,760);
    c.fillStyle='rgba(255,248,218,.15)';for(let i=0;i<7;i++)c.fillRect(85+i*150,158,2,734);
  }
  function drawHeader(c,round,spin){
    c.textAlign='center';c.fillStyle='#fff0a9';c.shadowColor='#5d3814';c.shadowBlur=12;c.font='900 58px Georgia';c.fillText('AMBER OLYMPUS',768,68);c.shadowBlur=0;
    c.font='700 22px Arial';c.fillStyle='#fffbe7';c.fillText('PAY ANYWHERE · 8+ SYMBOLS · TUMBLES · MULTIPLIERS',768,104);
    if(round?.mode==='free'){
      c.fillStyle='rgba(36,17,69,.9)';c.fillRect(1100,116,365,115);c.strokeStyle='#f4cf62';c.lineWidth=4;c.strokeRect(1100,116,365,115);
      c.fillStyle='#f7e28b';c.font='800 23px Arial';c.fillText(`FREE SPIN ${round.featureSpin||1} · ${Math.max(0,Number(round.freeSpinsRemaining||0))} LEFT`,1282,150);
      c.font='900 42px Georgia';c.fillStyle='#fff';c.fillText(`${Math.max(1,Number(round.featureMultiplier||round.sequenceMultiplier||1))}×`,1282,203);
    } else if(spin?.olympus?.triggeredFreeSpins){c.fillStyle='#fff1a0';c.font='900 28px Arial';c.fillText('FREE SPINS TRIGGERED',1280,180);}
  }
  function drawGrid(c,round,rt,now){
    const grid=round?.visible||IDLE_GRID;
    const wins=roundWinCells(round),hasWin=(round?.wins||[]).length>0;
    const fall=rt<300?1-easeOut(rt/300):0;
    const fade=hasWin&&rt>790?1-clamp01((rt-790)/220):1;
    const pulse=.5+.5*Math.sin(now*.018);
    const gx=88,gy=162,cw=164,ch=144;
    for(let reel=0;reel<6;reel++)for(let row=0;row<5;row++){
      const x=gx+reel*cw,y=gy+row*ch;
      c.fillStyle=(reel+row)%2?'rgba(33,30,79,.36)':'rgba(255,255,255,.055)';c.fillRect(x+4,y+4,cw-8,ch-8);
      const parsed=parseSymbol(grid[reel]?.[row]);const isWin=wins.has(`${reel}:${row}`),alpha=isWin?fade:1;
      const drop=(fall*(190+reel*24+row*13));
      drawOlympusSymbol(c,parsed.symbol,x+cw/2,y+ch/2-drop,84,{value:parsed.value,alpha,scale:isWin?1+.045*pulse:1,glow:isWin||parsed.symbol==='MULT'||parsed.symbol==='SCATTER'});
      if(isWin&&fade>.1){c.save();c.globalAlpha=.35+.45*pulse;c.strokeStyle='#fff1a0';c.lineWidth=7;c.shadowColor='#ffd64e';c.shadowBlur=18;c.strokeRect(x+9,y+9,cw-18,ch-18);c.restore();}
    }
  }
  function drawKingPanel(c,round,now){
    const mult=Math.max(1,Number(round?.featureMultiplier||round?.sequenceMultiplier||1));
    const charge=clamp01((mult-1)/50)+(.08+.08*Math.sin(now*.0025));
    drawOlympusKing(c,1282,585,385,{charge});
    c.fillStyle='rgba(32,18,65,.88)';c.fillRect(1110,820,350,100);c.strokeStyle='#e8c65f';c.lineWidth=4;c.strokeRect(1110,820,350,100);
    c.textAlign='center';c.fillStyle='#f5df82';c.font='800 22px Arial';c.fillText(round?.mode==='free'?'TOTAL MULTIPLIER':'SEQUENCE MULTIPLIER',1285,854);
    c.fillStyle='#fff';c.font='900 46px Georgia';c.fillText(`${mult}×`,1285,901);
  }
  function drawFooter(c,spin,round,displayedWin,animating){
    c.fillStyle='rgba(19,14,48,.92)';c.fillRect(72,930,1390,145);c.strokeStyle='#d8b557';c.lineWidth=5;c.strokeRect(72,930,1390,145);
    c.textAlign='left';c.fillStyle='#cfc5e8';c.font='700 22px Arial';c.fillText('BET',125,972);c.fillText('WIN',475,972);c.fillText('STATUS',835,972);
    c.fillStyle='#fff1b2';c.font='900 40px Arial';c.fillText(money(spin?.bet??ui.bet),125,1022);c.fillText(money(displayedWin),475,1022);
    c.fillStyle=animating?'#ffe06b':'#dfe9ff';const status=animating?(round?.mode==='free'?`FREE SPIN ${round.featureSpin} · TUMBLE ${round.tumble+1}`:`TUMBLE ${round?.tumble+1||1}`):(ui.showPaytable?'PAYTABLE':ui.autoSpin?'AUTO READY':ui.message||'READY');c.fillText(status,835,1022,560);
  }
  function drawFeatureOverlay(c,round,rt){
    if(!round)return;
    let title='',sub='';
    if(round.mode==='free'&&round.featureSpin===1&&round.tumble===0&&rt<620){title='15 FREE SPINS';sub='MULTIPLIERS PERSIST THROUGH THE BONUS';}
    else if(Number(round.retriggeredSpins||0)>0&&rt>760){title=`+${round.retriggeredSpins} FREE SPINS`;sub='RETRIGGER';}
    else if(Number(round.sequenceMultiplier||1)>1&&Number(round.sequencePayout||0)>0&&rt>760){title=`${round.sequenceMultiplier}× MULTIPLIER`;sub=`SEQUENCE WIN ${money(round.sequencePayout)}`;}
    if(!title)return;
    c.save();c.fillStyle='rgba(20,9,48,.86)';c.fillRect(250,405,850,190);c.strokeStyle='#ffe178';c.lineWidth=8;c.shadowColor='#68d9ff';c.shadowBlur=26;c.strokeRect(258,413,834,174);c.shadowBlur=0;c.textAlign='center';c.fillStyle='#fff0a2';c.font='900 70px Georgia';c.fillText(title,675,490,790);c.fillStyle='#efe8ff';c.font='800 25px Arial';c.fillText(sub,675,545,760);c.restore();
  }
  function drawPaytable(c){
    c.save();c.fillStyle='rgba(20,12,48,.97)';c.fillRect(92,150,1350,760);c.strokeStyle='#e4c45f';c.lineWidth=7;c.strokeRect(96,154,1342,752);
    c.textAlign='center';c.fillStyle='#ffe89a';c.font='900 48px Georgia';c.fillText('PAY ANYWHERE',767,210);
    c.fillStyle='#d8d0ed';c.font='700 22px Arial';c.fillText('8–9 / 10–11 / 12+ matching symbols anywhere on the 6×5 grid',767,250);
    const rows=[['CROWN','10×','25×','50×'],['HOURGLASS','5×','15×','25×'],['RING','2.5×','10×','15×'],['CHALICE','2×','5×','12×'],['RED','1×','2.5×','10×'],['PURPLE','.8×','2×','8×'],['YELLOW','.5×','1.5×','5×'],['GREEN','.4×','.9×','4×'],['BLUE','.25×','.75×','2×']];
    c.font='800 22px Arial';c.fillStyle='#b9a9da';c.fillText('SYMBOL',260,302);c.fillText('8–9',710,302);c.fillText('10–11',930,302);c.fillText('12+',1145,302);
    rows.forEach((row,i)=>{const y=345+i*52;c.fillStyle=i%2?'rgba(255,255,255,.025)':'rgba(241,205,103,.055)';c.fillRect(150,y-34,1230,44);c.textAlign='left';c.fillStyle='#fff1c7';c.font='800 21px Arial';c.fillText(row[0],205,y);c.textAlign='center';c.fillStyle='#ffe276';c.fillText(row[1],710,y);c.fillText(row[2],930,y);c.fillText(row[3],1145,y);});
    c.fillStyle='#efe5ff';c.font='700 21px Arial';c.fillText('4+ SCATTERS → 15 FREE SPINS · 3+ IN BONUS → +5 · MULTIPLIERS 2×–500×',767,850);c.restore();
  }

  function triggerRoundAudio(round,index){
    if(index===soundRound||!round)return;soundRound=index;
    if(round.mode==='free'&&!freeIntroPlayed){freeIntroPlayed=true;olympusFreeSpinStart();}
    const sc=Number(round.scatterCount||0);if(sc>0)olympusScatter(Math.min(6,sc));
    if((round.wins||[]).length)olympusTumble(round.tumble||0);
    if(Number(round.sequencePayout||0)>0){const values=(round.multipliers||[]).map(m=>Number(m.value||0));const sum=values.reduce((a,b)=>a+b,0);if(sum>0)olympusMultiplier(sum);const mult=Number(round.sequenceMultiplier||1);slotWin(Number(round.sequencePayout||0)/Math.max(.01,Number(state?.spin?.bet||1)));if(mult>=25||Number(round.sequencePayout||0)>=Number(state?.spin?.bet||1)*20)olympusThunder(Math.min(3,mult/25));}
  }

  function drawScreen(now){
    const c=screen.ctx,spin=state?.spin,rounds=spin?.rounds||[];
    c.setTransform(DISPLAY_SCALE,0,0,DISPLAY_SCALE,0,0);
    const offset=Number(state?.presentationOffsetMs||0),elapsed=spin?Math.max(0,serverAt+now-clockAt-spin.startedAt+offset):Infinity;
    const animating=Boolean(spin&&elapsed<spin.durationMs&&rounds.length);
    const ri=rounds.length?(animating?Math.min(rounds.length-1,Math.floor(elapsed/ROUND_MS)):rounds.length-1):0;
    const round=rounds[ri]||null,rt=animating?Math.max(0,elapsed-ri*ROUND_MS):ROUND_MS;
    triggerRoundAudio(round,ri);
    drawBackground(c,now,round?.mode==='free');drawHeader(c,round,spin);drawGrid(c,round,rt,now);drawKingPanel(c,round,now);drawFeatureOverlay(c,round,rt);
    let shown=rounds.length?totalThrough(rounds,ri):Number(spin?.totalPayout||0);
    const seq=Number(round?.sequencePayout||0);if(animating&&seq>0){const prev=shown-seq;shown=prev+seq*easeOut((rt-840)/430);}
    const cents=Math.floor(Math.max(0,shown)*100),nowMs=performance.now();if(cents!==lastCoinCents&&nowMs-lastCoinAt>48&&shown>0){lastCoinCents=cents;lastCoinAt=nowMs;slotCoinTick(cents);}
    drawFooter(c,spin,round,shown,animating);
    if(ui.showPaytable&&!animating)drawPaytable(c);
    screen.texture.needsUpdate=true;lastDraw=now;
  }
  function frame(now){
    const animated=state?.spin&&(serverAt+now-clockAt+Number(state?.presentationOffsetMs||0))<state.spin.startedAt+state.spin.durationMs;
    if(lastDraw<0||(animated&&now-lastDraw>=16)||(!animated&&now-lastDraw>=90))drawScreen(now);
    const ready=!ui.busy&&!animated;
    marqueeMesh.material.emissiveIntensity=animated?1.12:1+.08*(.5+.5*Math.sin(now*.002));
    controls.forEach(b=>{
      const action=b.userData.slotAction,active=action===hoverAction,pressed=action===pressedAction&&now<pressUntil;
      const disabled=ui.busy&&action!=='spin'&&action!=='info';
      const targetY=b.userData.baseY-(pressed ? .025 : 0);b.position.y=THREE.MathUtils.lerp(b.position.y,targetY,.4);
      if(b.userData.face){b.userData.face.position.y=b.userData.baseFaceY+(b.position.y-b.userData.baseY);b.userData.face.material.opacity=disabled ? .42 : 1;}
      let glow=.08;if(action==='spin'&&animated)glow=.22+.12*(.5+.5*Math.sin(now*.012));else if(action==='spin'&&ready)glow=.2+.13*(.5+.5*Math.sin(now*.007));
      if(action==='toggleAuto'&&ui.autoSpin)glow=.38;if(action==='info'&&ui.showPaytable)glow=.34;if(active)glow=Math.max(glow,.3);if(pressed)glow=.48;if(disabled)glow=.025;
      b.material.emissiveIntensity=glow;b.material.color.copy(b.userData.baseColor).lerp(b.userData.accent,(active||pressed) ? .2 : 0);
    });
    if(now>=pressUntil)pressedAction=null;
  }
  drawScreen(performance.now());
  return{id:machine.id,controls,update,updateControls,setHover,press,frame};
}
