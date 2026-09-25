import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { avatar, box, cylinder } from './models';
import {
  blackjackButton, blackjackChip, blackjackDeal, blackjackFlip, blackjackResult,
  blackjackShuffle, blackjackTableTap, blackjackChipSweep
} from './blackjackAudio';

const CHIP_VALUES=[1,5,25,100,500];
const CHIP_COLORS={1:'#e8e1d2',5:'#bf554e',25:'#48806d',100:'#272c35',500:'#6a4b8e'};
const RED_SUITS=new Set(['♥','♦']);
const CARD_TEXTURES=new Map();
const TAU=Math.PI*2;
const clamp=THREE.MathUtils.clamp;
const lerp=THREE.MathUtils.lerp;
const FELT_CENTER_Y=1.15;
const FELT_THICKNESS=.025;
const FELT_TOP=FELT_CENTER_Y+FELT_THICKNESS/2;
const SURFACE_Y=FELT_TOP+.002;

function canvasTexture(w,h,alpha=true){
  const canvas=document.createElement('canvas');canvas.width=w;canvas.height=h;
  const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;texture.generateMipmaps=false;
  texture.minFilter=THREE.LinearFilter;texture.magFilter=THREE.LinearFilter;
  return {canvas,ctx:canvas.getContext('2d',{alpha}),texture};
}
function rounded(parent,size,color,pos,opt={}){
  const geo=new RoundedBoxGeometry(size[0],size[1],size[2],5,opt.radius||.04);
  const mat=new THREE.MeshPhysicalMaterial({color,roughness:opt.roughness??.35,metalness:opt.metalness??.2,
    clearcoat:opt.clearcoat??.16,emissive:opt.emissive||'#000000',emissiveIntensity:opt.emissiveIntensity||0});
  const mesh=new THREE.Mesh(geo,mat);mesh.position.set(...pos);mesh.castShadow=true;mesh.receiveShadow=true;parent.add(mesh);return mesh;
}
function cardTexture(card,back=false){
  const key=back?'back':`${card?.value||'?'}:${card?.suit||'?'}`;
  if(CARD_TEXTURES.has(key))return CARD_TEXTURES.get(key);
  const {ctx,texture}=canvasTexture(512,736,false);
  ctx.fillStyle='#f8f1de';ctx.fillRect(0,0,512,736);
  ctx.strokeStyle='#d2c4a4';ctx.lineWidth=14;ctx.strokeRect(10,10,492,716);
  if(back){
    ctx.fillStyle='#263f52';ctx.fillRect(28,28,456,680);ctx.strokeStyle='#c8aa68';ctx.lineWidth=8;ctx.strokeRect(42,42,428,652);
    ctx.strokeStyle='rgba(232,211,157,.42)';ctx.lineWidth=5;
    for(let y=70;y<690;y+=52)for(let x=70;x<470;x+=52){ctx.beginPath();ctx.moveTo(x,y-18);ctx.lineTo(x+18,y);ctx.lineTo(x,y+18);ctx.lineTo(x-18,y);ctx.closePath();ctx.stroke();}
    ctx.fillStyle='#ead9ad';ctx.font='900 64px Georgia';ctx.textAlign='center';ctx.fillText('AH',256,390);
  }else{
    const suit=card?.suit||'♠',rank=card?.value||'?';ctx.fillStyle=RED_SUITS.has(suit)?'#a52f32':'#202428';
    ctx.font='900 76px Georgia';ctx.textAlign='left';ctx.fillText(rank,34,88);ctx.font='70px Georgia';ctx.fillText(suit,36,154);
    ctx.save();ctx.translate(512,736);ctx.rotate(Math.PI);ctx.font='900 76px Georgia';ctx.fillText(rank,34,88);ctx.font='70px Georgia';ctx.fillText(suit,36,154);ctx.restore();
    ctx.textAlign='center';ctx.textBaseline='middle';
    if(['J','Q','K'].includes(rank)){ctx.font='900 220px Georgia';ctx.fillText(rank,256,370);ctx.font='110px Georgia';ctx.fillText(suit,256,505);}
    else if(rank==='A'){ctx.font='240px Georgia';ctx.fillText(suit,256,390);}
    else{const count=Math.max(2,Math.min(10,Number(rank)||2)),cols=count>6?3:2;ctx.font='94px Georgia';
      for(let i=0;i<count;i++){const c=i%cols,r=Math.floor(i/cols),rows=Math.ceil(count/cols);ctx.fillText(suit,256+(c-(cols-1)/2)*120,250+(r-(rows-1)/2)*105);}}
  }
  texture.needsUpdate=true;CARD_TEXTURES.set(key,texture);return texture;
}
function makeCard(parent,card,hidden){
  const g=new THREE.Group();parent.add(g);
  const base=new THREE.Mesh(new THREE.BoxGeometry(.34,.016,.49),new THREE.MeshPhysicalMaterial({color:'#efe6d2',roughness:.5,clearcoat:.12}));
  base.castShadow=true;base.receiveShadow=true;g.add(base);
  const face=new THREE.Mesh(new THREE.PlaneGeometry(.315,.465),new THREE.MeshBasicMaterial({map:cardTexture(card,hidden),toneMapped:false}));
  face.rotation.x=-Math.PI/2;face.position.y=.0105;g.add(face);
  return {group:g,face,card:{...card},hidden:Boolean(hidden),target:new THREE.Vector3(),targetYaw:0,startAt:0,
    source:new THREE.Vector3(),revealAt:0,revealSwapped:false,reflowAt:0,reflowFrom:new THREE.Vector3()};
}
function setCardTexture(entry,card,hidden){
  entry.card={...card};entry.hidden=Boolean(hidden);entry.face.material.map=cardTexture(card,hidden);entry.face.material.needsUpdate=true;
}
function circleLabel(text,fg='#fff4d0',font=58){
  const {ctx,texture}=canvasTexture(256,256,true);ctx.clearRect(0,0,256,256);ctx.fillStyle=fg;ctx.textAlign='center';ctx.textBaseline='middle';
  ctx.font=`900 ${font}px Arial`;ctx.fillText(text,128,132,224);texture.needsUpdate=true;return texture;
}
function feltOverlay(){
  const {ctx,texture}=canvasTexture(1024,512,true);ctx.clearRect(0,0,1024,512);
  ctx.strokeStyle='rgba(226,199,127,.85)';ctx.lineWidth=8;ctx.beginPath();ctx.arc(512,565,360,Math.PI*1.12,Math.PI*1.88);ctx.stroke();
  ctx.strokeStyle='rgba(226,199,127,.34)';ctx.lineWidth=3;ctx.beginPath();ctx.arc(512,565,392,Math.PI*1.13,Math.PI*1.87);ctx.stroke();
  ctx.strokeStyle='rgba(226,199,127,.62)';ctx.lineWidth=5;ctx.beginPath();ctx.arc(512,410,92,0,TAU);ctx.stroke();
  ctx.fillStyle='rgba(223,192,118,.09)';ctx.font='900 180px Georgia';ctx.textAlign='center';ctx.fillText('AH',512,340);
  ctx.fillStyle='rgba(244,225,174,.94)';ctx.font='700 32px Georgia';ctx.fillText('PAYS 3 TO 2',512,103);
  ctx.font='600 24px Arial';ctx.fillText('DEALER STANDS ON 17',512,143);
  ctx.font='700 19px Arial';ctx.fillText('THE AMBER HOUSE',512,178);
  ctx.font='700 22px Arial';ctx.fillText('PLACE BET',512,416);
  texture.needsUpdate=true;return texture;
}
function totalBadge(parent,label,pos,formatValue){
  const {ctx,texture}=canvasTexture(256,256,true);
  const mesh=new THREE.Mesh(new THREE.PlaneGeometry(.29,.29),new THREE.MeshBasicMaterial({map:texture,transparent:true,toneMapped:false,depthWrite:false}));
  mesh.rotation.x=-Math.PI/2;mesh.position.set(...pos);mesh.renderOrder=8;parent.add(mesh);
  let shown=null,changedAt=0;
  const draw=value=>{
    ctx.clearRect(0,0,256,256);
    ctx.beginPath();ctx.arc(128,128,105,0,TAU);ctx.fillStyle='rgba(17,28,25,.94)';ctx.fill();
    ctx.lineWidth=12;ctx.strokeStyle='#d4b36c';ctx.stroke();
    ctx.beginPath();ctx.arc(128,128,88,0,TAU);ctx.lineWidth=3;ctx.strokeStyle='rgba(255,238,184,.38)';ctx.stroke();
    ctx.textAlign='center';ctx.fillStyle='#cdb77f';ctx.font='800 27px Arial';ctx.fillText(label,128,77);
    const displayed=formatValue?formatValue(value):String(value??'—');
    ctx.fillStyle='#fff1bd';ctx.font=`900 ${displayed.length>5?52:displayed.length>3?68:displayed.length>2?78:92}px Georgia`;
    ctx.fillText(displayed,128,171,195);
    texture.needsUpdate=true;
  };
  draw('—');mesh.visible=false;
  return {
    mesh,
    set(value){
      const next=value==null?null:Number(value);
      mesh.visible=next!=null&&Number.isFinite(next);
      if(next!==shown){shown=next;changedAt=performance.now();if(mesh.visible)draw(next);}
    },
    frame(now){
      if(!mesh.visible)return;
      const age=now-changedAt,pulse=age<330?1+.13*Math.sin(clamp(age/330,0,1)*Math.PI):1;
      mesh.scale.setScalar(pulse);
    }
  };
}
function outcomePopup(parent){
  const blackjackExtraMs=1000;
  const {ctx,texture}=canvasTexture(768,256,true);
  const mat=new THREE.SpriteMaterial({map:texture,transparent:true,depthTest:false,depthWrite:false,toneMapped:false});
  const sprite=new THREE.Sprite(mat);
  sprite.position.set(0,1.58,.62);
  sprite.scale.set(.78,.26,1);
  sprite.renderOrder=40;
  sprite.visible=false;
  parent.add(sprite);
  let data=null,lastDraw=-1;
  function draw(progress){
    if(!data)return;
    ctx.clearRect(0,0,768,256);
    const positive=data.outcome==='win'||data.outcome==='blackjack';
    const push=data.outcome==='push';
    ctx.fillStyle='rgba(20,30,26,.90)';
    ctx.fillRect(72,54,624,148);
    ctx.strokeStyle=positive?'#dfbf70':push?'#cfc2a1':'#9c6962';
    ctx.lineWidth=7;
    ctx.strokeRect(76,58,616,140);
    const title=data.outcome==='blackjack'?'BLACKJACK':data.outcome==='win'?'WIN':data.outcome==='push'?'PUSH':data.outcome==='bust'?'BUST':'DEALER WINS';
    ctx.textAlign='center';
    ctx.fillStyle=positive?'#ffe6a6':push?'#eadfbe':'#e7b0aa';
    ctx.font='900 42px Arial';
    if(positive){
      const shown=Math.max(0,data.profit*progress);
      ctx.fillText(title,258,145);
      ctx.fillStyle='#fff4cf';
      ctx.font='900 48px Georgia';
      ctx.fillText(`+$${shown.toFixed(2)}`,505,145);
    }else{
      ctx.fillText(title,384,145);
    }
    texture.needsUpdate=true;
  }
  return {
    sprite,
    show(state,delay=0){
      data={outcome:state.outcome,profit:Math.max(0,Number(state.profit)||0),start:performance.now()+delay};
      lastDraw=-1;
      sprite.visible=false;
      mat.opacity=1;
    },
    clear(){data=null;sprite.visible=false;mat.opacity=1;},
    frame(now){
      if(!data||now<data.start){sprite.visible=false;return;}
      const age=now-data.start;
      const extra=data.outcome==='blackjack'?blackjackExtraMs:0;
      if(age>1550+extra){data=null;sprite.visible=false;mat.opacity=1;return;}
      sprite.visible=true;
      const intro=clamp(age/170,0,1);
      const fade=age>1100+extra?1-clamp((age-1100-extra)/450,0,1):1;
      const pop=.9+.1*(1-Math.pow(1-intro,3));
      sprite.scale.set(.78*pop,.26*pop,1);
      sprite.position.y=1.58+.025*Math.sin(clamp(age/500,0,1)*Math.PI);
      mat.opacity=fade;
      const count=clamp(age/700,0,1);
      if(lastDraw<0||Math.abs(count-lastDraw)>.035||count===1){draw(count);lastDraw=count;}
    }
  };
}
function chipStack(parent,value,x,z,layers=4,clickable=false,scale=.08,y=SURFACE_Y+.014){
  const g=new THREE.Group();g.position.set(x,y,z);parent.add(g);const color=CHIP_COLORS[value]||'#d7c7a5';
  let top=null;
  for(let i=0;i<layers;i++){
    const mat=new THREE.MeshPhysicalMaterial({color,roughness:.34,metalness:.08,clearcoat:.22,emissive:clickable?color:'#000',emissiveIntensity:clickable ? .035 : 0});
    const chip=new THREE.Mesh(new THREE.CylinderGeometry(scale,scale,.028,32),mat);chip.position.y=i*.029;chip.castShadow=true;chip.receiveShadow=true;g.add(chip);top=chip;
    if(i===layers-1&&clickable){const labelFont=value>=100?44:value>=25?52:64;const face=new THREE.Mesh(new THREE.CircleGeometry(scale*.78,28),new THREE.MeshBasicMaterial({map:circleLabel(`$${value}`,'#fff4d0',labelFont),transparent:true,toneMapped:false,depthWrite:false}));
      face.rotation.x=-Math.PI/2;face.position.y=.016;chip.add(face);}
  }
  if(clickable&&top){top.userData.blackjackAction=`chip:${value}`;top.userData.stackGroup=g;top.userData.controlGroup=g;top.userData.baseY=top.position.y;top.userData.accent=new THREE.Color(color);}
  return {group:g,control:clickable?top:null};
}
function actionButton(parent,action,label,x,z,color){
  const ringH=.016,buttonH=.032;
  const controlGroup=new THREE.Group();controlGroup.position.x=x;parent.add(controlGroup);
  const ring=new THREE.Mesh(new THREE.CylinderGeometry(.095,.095,ringH,28),new THREE.MeshPhysicalMaterial({color:'#b39255',metalness:.72,roughness:.22}));
  ring.position.set(0,SURFACE_Y+ringH/2,z);controlGroup.add(ring);
  const mat=new THREE.MeshPhysicalMaterial({color:'#283b32',roughness:.32,clearcoat:.22,emissive:color,emissiveIntensity:.055});
  const b=new THREE.Mesh(new THREE.CylinderGeometry(.078,.078,buttonH,28),mat);b.position.set(0,SURFACE_Y+ringH+buttonH/2,z);b.castShadow=true;controlGroup.add(b);
  const faceFont=label.length>4?50:60;
  const face=new THREE.Mesh(new THREE.CircleGeometry(.059,26),new THREE.MeshBasicMaterial({map:circleLabel(label,'#fff4d0',faceFont),transparent:true,toneMapped:false,depthWrite:false}));
  face.rotation.x=-Math.PI/2;face.position.y=buttonH/2+.001;b.add(face);
  b.userData.blackjackAction=action;b.userData.baseY=b.position.y;b.userData.accent=new THREE.Color(color);b.userData.baseColor=new THREE.Color('#283b32');b.userData.controlGroup=controlGroup;
  return b;
}
function handTarget(side,index,count=2){
  const n=Math.max(1,count),center=index-(n-1)/2;
  const spread=n<=7 ? .38 : 2.7/(n-1);
  const z=side==='player' ? .42 : -.42;
  const lift=n>9 ? (index%2)*.012 : 0;
  return {pos:new THREE.Vector3(center*spread,SURFACE_Y+.01+lift,z),yaw:0};
}
function createFlightChip(parent,value,source,target,delay=0){
  const color=CHIP_COLORS[value]||'#d7c7a5',mesh=new THREE.Mesh(new THREE.CylinderGeometry(.078,.078,.026,28),
    new THREE.MeshPhysicalMaterial({color,roughness:.3,clearcoat:.25,metalness:.08}));
  mesh.position.copy(source);mesh.castShadow=true;parent.add(mesh);
  return {mesh,source:source.clone(),target:target.clone(),startAt:performance.now()+delay,duration:390,done:false};
}
function gestureDuration(type){
  if(type==='shuffle')return 1050;if(type==='hit'||type==='deal')return 760;if(type==='double')return 850;
  if(type==='stand'||type==='count')return 650;if(type==='win'||type==='blackjack')return 1100;
  if(type==='lose'||type==='bust')return 1250;if(type==='push')return 800;return 700;
}

export default function liveBlackjackTable(tableGroup){
  const controls=[],cards=new Map(),chipFlights=[],speechQueue=[];
  const betVisual=new THREE.Group(),chipBank=new THREE.Group(),actionDeck=new THREE.Group();
  tableGroup.add(betVisual,chipBank,actionDeck);
  const overlay=new THREE.Mesh(new THREE.PlaneGeometry(3.75,1.86),new THREE.MeshBasicMaterial({map:feltOverlay(),transparent:true,depthWrite:false,toneMapped:false}));
  overlay.rotation.x=-Math.PI/2;
  overlay.position.set(0,FELT_TOP+.003,.02);
  overlay.renderOrder=2;
  tableGroup.add(overlay);

  const dealerTotal=totalBadge(tableGroup,'DEALER',[0,SURFACE_Y+.004,-.42]);
  const playerTotal=totalBadge(tableGroup,'YOU',[0,SURFACE_Y+.004,.42]);
  const potTotal=totalBadge(tableGroup,'POT',[.98,SURFACE_Y+.004,.73],value=>`$${value}`);
  const resultPopup=outcomePopup(tableGroup);

  const SHOE_X=1.40,SHOE_Z=-.58;
  const shoeBaseH=.14,shoeTopH=.08;
  rounded(tableGroup,[.46,shoeBaseH,.56],'#51392d',[SHOE_X,SURFACE_Y+shoeBaseH/2,SHOE_Z],{radius:.04,roughness:.42});
  rounded(tableGroup,[.38,shoeTopH,.46],'#1b2629',[SHOE_X,SURFACE_Y+shoeBaseH+shoeTopH/2,SHOE_Z],{radius:.032,metalness:.18,roughness:.3});
  const shoeCardY=SURFACE_Y+shoeBaseH+shoeTopH+.006;
  for(let i=0;i<8;i++){
    const c=new THREE.Mesh(new THREE.BoxGeometry(.27,.01,.39),new THREE.MeshBasicMaterial({map:cardTexture(null,true),toneMapped:false}));
    c.position.set(SHOE_X,shoeCardY+i*.0055,SHOE_Z);
    c.rotation.y=.035;
    tableGroup.add(c);
  }

  const TRAY_X=-1.39,TRAY_Z=-.59,TRAY_BASE_H=.06,TRAY_INSET_H=.034;
  rounded(tableGroup,[.76,TRAY_BASE_H,.38],'#b4935a',[TRAY_X,SURFACE_Y+TRAY_BASE_H/2,TRAY_Z],{radius:.05,roughness:.24,metalness:.58});
  rounded(tableGroup,[.68,TRAY_INSET_H,.30],'#252d2b',[TRAY_X,SURFACE_Y+TRAY_BASE_H+TRAY_INSET_H/2,TRAY_Z],{radius:.035,roughness:.45,metalness:.08});
  const trayChipY=SURFACE_Y+TRAY_BASE_H+TRAY_INSET_H+.014;
  chipStack(tableGroup,5,-1.56,TRAY_Z,4,false,.064,trayChipY);
  chipStack(tableGroup,25,-1.39,TRAY_Z,5,false,.064,trayChipY);
  chipStack(tableGroup,100,-1.22,TRAY_Z,4,false,.064,trayChipY);

  const CHIP_BANK_X=-1.22,CHIP_BANK_Z=.73,CHIP_BANK_CENTER=CHIP_BANK_X+(CHIP_VALUES.length-1)*.09;
  CHIP_VALUES.forEach((value,i)=>{
    const stack=chipStack(chipBank,value,CHIP_BANK_X+i*.18,CHIP_BANK_Z,2,true,.063);
    if(stack.control)controls.push(stack.control);
  });
  const ACTION_Z=.78;
  const clear=actionButton(actionDeck,'clear','CLEAR',-.44,ACTION_Z,'#c28d69');
  const deal=actionButton(actionDeck,'deal','DEAL',-.22,ACTION_Z,'#d6ba68');
  const hit=actionButton(actionDeck,'hit','HIT',0,ACTION_Z,'#79a98e');
  const stand=actionButton(actionDeck,'stand','STAND',.22,ACTION_Z,'#c27766');
  const dbl=actionButton(actionDeck,'double','2×',.44,ACTION_Z,'#8ca9bd');
  controls.push(clear,deal,hit,stand,dbl);

  const DEALER_Z=-1.72,DEALER_BASE_Y=.20;
  cylinder(tableGroup,.29,.31,.12,'#6f453c',[0,.83,DEALER_Z],12);
  cylinder(tableGroup,.04,.05,.72,'#b09a6c',[0,.41,DEALER_Z],10);
  cylinder(tableGroup,.27,.31,.05,'#b09a6c',[0,.025,DEALER_Z],10);
  rounded(tableGroup,[.56,.56,.11],'#6f453c',[0,1.13,DEALER_Z-.19],{radius:.07,roughness:.58});
  rounded(tableGroup,[.42,.36,.055],'#874c43',[0,1.15,DEALER_Z-.125],{radius:.05,roughness:.62});
  const dealer=avatar(tableGroup,'Dealer','#6a3037',11);
  dealer.group.position.set(0,DEALER_BASE_Y,DEALER_Z);
  dealer.group.rotation.y=Math.PI;
  dealer.name.visible=false;
  dealer.chatBubble.visible=false;
  dealer.setSeated(true);
  dealer.setChatPresentation?.(.46,2.42);
  // Cream shirt, burgundy waistcoat, black bow tie and tiny brass cuff links.
  box(dealer.group,[.42,.42,.08],'#eee4d4',[0,1.08,-.19]);
  box(dealer.group,[.28,.36,.09],'#6b2c35',[0,1.07,-.235]);
  const bow=box(dealer.group,[.18,.07,.06],'#242426',[0,1.31,-.26]);bow.rotation.z=.08;
  box(dealer.group,[.055,.055,.035],'#d1aa5d',[.11,1.17,-.292],{metalness:.65,roughness:.22});
  dealer.arms.forEach(a=>{const cuff=box(a.elbow,[.17,.055,.18],'#eee4d4',[0,-.265,0]);cuff.rotation.z=a.side*.05;});

  let state={phase:'betting',bet:0,wager:0,balance:0,playerHand:[],dealerHand:[],dealerHidden:false,
    message:'Select chips to place your bet.',playerValue:null,dealerValue:null,dealerCue:null};
  let hover=null,pressed=null,pressUntil=0,lastRound=null,lastBetVisual=-1,lastCueId=null,finishedAt=0,cardsSwept=false;
  let gestureType='idle',gestureAt=0,gestureMs=0,bankPresence=1;
  const bubbleQuat=new THREE.Quaternion(),parentQuat=new THREE.Quaternion();
  const cardPosition=new THREE.Vector3();
  function clearCards(){
    for(const entry of cards.values()){tableGroup.remove(entry.group);entry.group.traverse(o=>{o.geometry?.dispose?.();if(o.material&&!Array.isArray(o.material))o.material.dispose?.();});}
    cards.clear();
  }
  function scheduleCard(side,index,card,hidden,delay=0,count=2,instant=false){
    const key=`${side}:${index}`,entry=makeCard(tableGroup,card,hidden),target=handTarget(side,index,count),now=performance.now();
    if(instant){entry.source.copy(target.pos);entry.group.position.copy(target.pos);entry.group.rotation.y=target.yaw;}
    else{entry.source.set(SHOE_X,shoeCardY+.035,SHOE_Z);entry.group.position.copy(entry.source);entry.group.rotation.y=.035;}
    entry.target.copy(target.pos);entry.targetYaw=target.yaw;entry.startAt=now+delay;
    if(instant)entry.startAt=now-460;
    cards.set(key,entry);if(!instant)blackjackDeal(index);return entry;
  }
  function reflowHands(next){
    const now=performance.now(),pCount=Math.max(1,next.playerHand?.length||0),dCount=Math.max(1,next.dealerHand?.length||0);
    const shift=(e,t)=>{
      if(now>e.startAt+470&&e.group.position.distanceTo(t.pos)>.008){e.reflowFrom.copy(e.group.position);e.reflowAt=now;}
      e.target.copy(t.pos);e.targetYaw=t.yaw;
    };
    for(let i=0;i<pCount;i++){const e=cards.get(`player:${i}`);if(e)shift(e,handTarget('player',i,pCount));}
    for(let i=0;i<dCount;i++){const e=cards.get(`dealer:${i}`);if(e)shift(e,handTarget('dealer',i,dCount));}
  }
  function updateBadgePositions(next){
    const pCount=Math.max(1,next.playerHand?.length||0),dCount=Math.max(1,next.dealerHand?.length||0);
    const pEdge=Math.abs(handTarget('player',pCount-1,pCount).pos.x)+.34;
    const dEdge=Math.abs(handTarget('dealer',dCount-1,dCount).pos.x)+.34;
    playerTotal.mesh.position.set(clamp(pEdge,.64,1.54),SURFACE_Y+.004,.42);
    dealerTotal.mesh.position.set(-clamp(dEdge,.64,1.54),SURFACE_Y+.004,-.42);
  }
  function syncCards(next,instant=false){
    const now=performance.now(),roundChanged=next.roundId&&next.roundId!==lastRound;
    if(instant&&cards.size===0){
      (next.playerHand||[]).forEach((card,i)=>scheduleCard('player',i,card,false,0,Math.max(1,next.playerHand.length),true));
      (next.dealerHand||[]).forEach((card,i)=>scheduleCard('dealer',i,card,Boolean(i===1&&next.dealerHidden),0,Math.max(1,next.dealerHand.length),true));
      lastRound=next.roundId||lastRound;
      updateBadgePositions(next);
      return;
    }
    if(roundChanged){clearCards();lastRound=next.roundId;
      if(next.playerHand?.[0])scheduleCard('player',0,next.playerHand[0],false,340,Math.max(1,next.playerHand.length),instant);
      if(next.dealerHand?.[0])scheduleCard('dealer',0,next.dealerHand[0],false,530,Math.max(1,next.dealerHand.length),instant);
      if(next.playerHand?.[1])scheduleCard('player',1,next.playerHand[1],false,720,Math.max(1,next.playerHand.length),instant);
      if(next.dealerHand?.[1])scheduleCard('dealer',1,next.dealerHand[1],Boolean(next.dealerHidden),910,Math.max(1,next.dealerHand.length),instant);
    }else{
      const firstDeal=cards.size===0&&(next.playerHand?.length||0)>=2&&(next.dealerHand?.length||0)>=2;
      if(firstDeal){
        scheduleCard('player',0,next.playerHand[0],false,340,Math.max(1,next.playerHand.length),instant);scheduleCard('dealer',0,next.dealerHand[0],false,530,Math.max(1,next.dealerHand.length),instant);
        scheduleCard('player',1,next.playerHand[1],false,720,Math.max(1,next.playerHand.length),instant);scheduleCard('dealer',1,next.dealerHand[1],Boolean(next.dealerHidden),910,Math.max(1,next.dealerHand.length),instant);
      }else{
        (next.playerHand||[]).forEach((card,i)=>{if(!cards.has(`player:${i}`))scheduleCard('player',i,card,false,180,Math.max(1,next.playerHand.length),instant);});
        (next.dealerHand||[]).forEach((card,i)=>{
          const key=`dealer:${i}`,entry=cards.get(key);
          if(!entry)scheduleCard('dealer',i,card,Boolean(i===1&&next.dealerHidden),i>=2?500+(i-2)*410:180,Math.max(1,next.dealerHand.length),instant);
          else if(i===1&&entry.hidden&&!next.dealerHidden){entry.revealAt=now+220;entry.revealSwapped=false;entry.card={...card};blackjackFlip();}
          else if(!entry.hidden&&card?.value&&card.value!=='?'&&entry.card?.value!==card.value)setCardTexture(entry,card,false);
        });
      }
    }
    reflowHands(next);
    updateBadgePositions(next);
  }
  function rebuildBetVisual(amount){
    while(betVisual.children.length){const child=betVisual.children[0];betVisual.remove(child);child.geometry?.dispose?.();if(child.material&&!Array.isArray(child.material))child.material.dispose?.();}
    let remaining=Math.max(0,Math.round(Number(amount)||0)),layer=0;
    for(const value of [500,100,25,5,1]){
      const count=Math.floor(remaining/value),visible=Math.min(10,count);remaining-=count*value;
      for(let i=0;i<visible;i++){
        const chip=new THREE.Mesh(new THREE.CylinderGeometry(.072,.072,.022,28),new THREE.MeshPhysicalMaterial({color:CHIP_COLORS[value],roughness:.32,clearcoat:.2}));
        chip.position.set((layer%3-1)*.024,SURFACE_Y+.011+layer*.021,.03+(layer%2)*.01);chip.castShadow=true;betVisual.add(chip);layer++;
      }
    }
    lastBetVisual=Number(amount)||0;
  }
  function syncBetVisual(){
    const showBet=state.active===true&&!state.busy&&(state.phase==='betting'||(state.phase==='finished'&&cardsSwept));
    const amount=showBet ? Number(state.bet)||0 : 0;
    if(amount!==lastBetVisual)rebuildBetVisual(amount);
    betVisual.visible=amount>0;
  }
  function flyPlacedChip(value){
    const index=CHIP_VALUES.indexOf(value);if(index<0)return;
    const sourceX=controls.find(control=>control.userData.blackjackAction===`chip:${value}`)?.userData.stackGroup.position.x??CHIP_BANK_X+index*.18;
    const source=new THREE.Vector3(sourceX,SURFACE_Y+.075,CHIP_BANK_Z),target=new THREE.Vector3((Math.random()-.5)*.06,SURFACE_Y+.045,.03+(Math.random()-.5)*.03);
    chipFlights.push(createFlightChip(tableGroup,value,source,target));
  }
  function clearChipFlights(){
    while(chipFlights.length){const flight=chipFlights.pop();tableGroup.remove(flight.mesh);flight.mesh.geometry.dispose();flight.mesh.material.dispose();}
  }
  function payoutFlourish(type){
    if(!['win','blackjack','push'].includes(type))return;
    const values=type==='blackjack'?[100,25,5]:type==='win'?[25,5,1]:[5,1];
    values.forEach((value,i)=>chipFlights.push(createFlightChip(tableGroup,value,new THREE.Vector3(TRAY_X-.08+i*.14,trayChipY+.08,TRAY_Z),new THREE.Vector3(.46+i*.11,SURFACE_Y+.06,.48),i*70)));
  }
  function outcomeDelay(next){
    if(next.outcome==='bust'&&Number(next.playerValue)>21)return 620;
    const extra=Math.max(0,(next.dealerHand?.length||0)-2);
    return extra?1080+(extra-1)*410:760;
  }
  function enqueueCue(cue){
    if(!cue||cue.id==null||cue.id===lastCueId)return;
    lastCueId=cue.id;const now=performance.now(),type=String(cue.type||'count');
    speechQueue.push({line:String(cue.line||'').slice(0,100),due:now+clamp(Number(cue.delayMs)||0,0,5000)});
    gestureType=type;gestureAt=now;gestureMs=gestureDuration(type);
    if(type==='shuffle')blackjackShuffle();
    else if(type==='stand'||type==='count')blackjackTableTap();
    else if(type==='lose'||type==='bust')blackjackChipSweep();
    if(['win','blackjack','push'].includes(type))payoutFlourish(type);
  }
  function controlEnabled(action){
    if(state.active!==true||state.busy)return false;
    if(action.startsWith('chip:'))return (state.phase==='betting'||state.phase==='finished')&&Number(state.bet)+Number(action.slice(5))<=Number(state.balance);
    if(action==='clear')return (state.phase==='betting'||state.phase==='finished')&&Number(state.bet)>0;
    if(action==='deal')return (state.phase==='betting'||state.phase==='finished')&&Number(state.bet)>0&&Number(state.bet)<=Number(state.balance);
    if(action==='hit'||action==='stand')return state.phase==='playing';
    if(action==='double')return state.phase==='playing'&&Boolean(state.canDouble);
    return false;
  }
  function syncControlVisibility(){
    controls.forEach(control=>{
      const enabled=controlEnabled(control.userData.blackjackAction);
      control.userData.controlGroup.visible=enabled;
      if(!enabled&&hover===control.userData.blackjackAction)hover=null;
    });
    const centerRow=(row,center,spacing)=>{
      const visible=row.filter(control=>control.userData.controlGroup.visible);
      visible.forEach((control,index)=>{
        control.userData.controlGroup.position.x=center+(index-(visible.length-1)/2)*spacing;
      });
    };
    centerRow(controls.filter(control=>control.userData.stackGroup),CHIP_BANK_CENTER,.18);
    centerRow(controls.filter(control=>!control.userData.stackGroup),0,.22);
  }
  function update(next){
    const previousOutcome=state.outcome,previousBet=Number(state.bet)||0;
    const restoringHand=state.active===false&&next.active===true&&next.phase==='playing';
    state={...state,...next};
    syncControlVisibility();
    const betDelta=(Number(state.bet)||0)-previousBet;
    if(state.active===false){
      clearCards();clearChipFlights();speechQueue.length=0;dealer.chatBubble.visible=false;
      dealerTotal.set(null);playerTotal.set(null);potTotal.set(null);resultPopup.clear();syncBetVisual();return;
    }
    if(state.busy&&state.roundId&&!(state.playerHand?.length||state.dealerHand?.length))clearChipFlights();
    if(betDelta>0&&CHIP_VALUES.includes(betDelta)&&!state.busy)flyPlacedChip(betDelta);
    enqueueCue(state.dealerCue);
    syncCards(state,restoringHand);
    dealerTotal.set(state.dealerValue);playerTotal.set(state.playerValue);
    potTotal.set(Number(state.bet)||0);
    if(state.outcome&&state.outcome!==previousOutcome&&state.phase==='finished'){
      finishedAt=performance.now();cardsSwept=false;blackjackResult(state.outcome);resultPopup.show(state,outcomeDelay(state));
    }else if(!state.outcome){finishedAt=0;cardsSwept=false;resultPopup.clear();}
    if(state.phase==='betting'&&!(state.playerHand?.length||state.dealerHand?.length))clearCards();
    syncBetVisual();
  }
  function setHover(action){hover=action&&controlEnabled(action)?action:null;}
  function press(action){
    if(!controlEnabled(action))return false;pressed=action;pressUntil=performance.now()+120;
    if(action.startsWith('chip:'))blackjackChip(Number(action.split(':')[1])||1);else blackjackButton();
    return true;
  }
  function armToward(arm,sx,sz,ex,ez,speed=.18){
    arm.shoulder.rotation.x=lerp(arm.shoulder.rotation.x,sx,speed);
    arm.shoulder.rotation.z=lerp(arm.shoulder.rotation.z,sz,speed);
    arm.elbow.rotation.x=lerp(arm.elbow.rotation.x,ex,speed);
    arm.elbow.rotation.z=lerp(arm.elbow.rotation.z,ez,speed);
  }
  function animateDealer(now,activeDeal){
    const left=dealer.arms.find(a=>a.side===1),right=dealer.arms.find(a=>a.side===-1);
    const age=now-gestureAt,gt=gestureMs?clamp(age/gestureMs,0,1):1,phase=Math.sin(gt*Math.PI);
    const idle=Math.sin(now*.00135);

    armToward(left,.45,.07,1.08,.02,.15);
    armToward(right,.45,-.07,1.08,-.02,.15);
    dealer.group.position.y=DEALER_BASE_Y+idle*.004;
    dealer.group.rotation.z=idle*.003;

    if(activeDeal){
      const t=activeDeal.t,ease=Math.sin(Math.PI*clamp(t,0,1));
      armToward(right,.58,-.18+.26*t,1.02,-.03+.08*t,.25);
      armToward(left,.43,.06,1.05,.02,.15);
      dealer.group.rotation.x=lerp(dealer.group.rotation.x,-.02*ease,.18);
    }else if(age<gestureMs){
      if(gestureType==='shuffle'){
        const wave=Math.sin(now*.016);
        armToward(left,.42,.18+wave*.08,1.12,.04,.24);
        armToward(right,.42,-.18-wave*.08,1.12,-.04,.24);
        dealer.group.rotation.x=lerp(dealer.group.rotation.x,-.018*phase,.18);
      }else if(gestureType==='double'){
        armToward(left,.56,.16,1.02,.03,.22);
        armToward(right,.56,-.16,1.02,-.03,.22);
        dealer.group.rotation.x=lerp(dealer.group.rotation.x,-.025*phase,.18);
      }else if(gestureType==='stand'||gestureType==='count'){
        armToward(right,.52,-.04,1.14,-.02,.22);
        armToward(left,.43,.06,1.05,.02,.15);
      }else if(gestureType==='win'||gestureType==='blackjack'){
        armToward(left,.38,.20,.96,.08,.20);
        armToward(right,.38,-.20,.96,-.08,.20);
      }else if(gestureType==='lose'||gestureType==='bust'){
        armToward(left,.42,.22,.92,.07,.20);
        armToward(right,.42,-.22,.92,-.07,.20);
        dealer.group.rotation.z=lerp(dealer.group.rotation.z,-.012*phase,.16);
      }else if(gestureType==='push'){
        armToward(left,.46,.12,1.02,.03,.18);
        armToward(right,.46,-.12,1.02,-.03,.18);
      }else if(gestureType==='hit'||gestureType==='deal'){
        armToward(right,.56,-.13+.12*gt,1.04,-.02,.22);
      }
    }else{
      dealer.group.rotation.x=lerp(dealer.group.rotation.x,0,.12);
    }
  }

  function frame(now,camera){
    let dealing=false,activeDeal=null;
    for(const entry of cards.values()){
      const raw=(now-entry.startAt)/460,t=clamp(raw,0,1);
      if(raw>=0&&t<1){dealing=true;if(!activeDeal||entry.startAt>activeDeal.entry.startAt)activeDeal={entry,t};}
      const smooth=1-Math.pow(1-t,3),pos=cardPosition.lerpVectors(entry.source,entry.target,smooth);
      pos.y+=Math.sin(Math.PI*t)*.34;
      if(entry.reflowAt&&raw>=1){const rt=clamp((now-entry.reflowAt)/220,0,1),rs=1-Math.pow(1-rt,3);pos.lerpVectors(entry.reflowFrom,entry.target,rs);if(rt>=1)entry.reflowAt=0;}
      entry.group.position.copy(pos);entry.group.rotation.y=lerp(.05,entry.targetYaw,smooth);
      if(entry.revealAt&&now>=entry.revealAt){
        const q=clamp((now-entry.revealAt)/440,0,1);entry.group.scale.x=Math.max(.04,Math.abs(Math.cos(q*Math.PI)));
        if(q>=.5&&!entry.revealSwapped){setCardTexture(entry,entry.card,false);entry.revealSwapped=true;}
        if(q>=1){entry.group.scale.x=1;entry.revealAt=0;}
      }
    }
    animateDealer(now,activeDeal);
    if(dealing)dealer.group.position.z=DEALER_Z+.02*Math.sin((now%460)/460*Math.PI);else dealer.group.position.z=lerp(dealer.group.position.z,DEALER_Z,.14);

    while(speechQueue.length&&speechQueue[0].due<=now){
      const item=speechQueue.shift();if(item.line)dealer.showChat(item.line);
    }
    dealer.updateChat(now);
    if(camera&&dealer.chatBubble.visible){
      dealer.group.getWorldQuaternion(parentQuat);bubbleQuat.copy(parentQuat).invert().multiply(camera.quaternion);dealer.chatBubble.quaternion.copy(bubbleQuat);
    }

    for(let i=chipFlights.length-1;i>=0;i--){
      const flight=chipFlights[i],raw=(now-flight.startAt)/flight.duration,t=clamp(raw,0,1);
      if(raw<0)continue;
      const smooth=1-Math.pow(1-t,3);flight.mesh.position.lerpVectors(flight.source,flight.target,smooth);
      flight.mesh.position.y+=Math.sin(Math.PI*t)*.18;flight.mesh.rotation.y+=.22;flight.mesh.rotation.z+=.14;
      if(t>=1){tableGroup.remove(flight.mesh);flight.mesh.geometry.dispose();flight.mesh.material.dispose();chipFlights.splice(i,1);}
    }

    const finishAge=finishedAt?now-finishedAt:0;
    if(state.phase==='finished'&&!cardsSwept&&finishAge>2350+(state.outcome==='blackjack'?1000:0)){clearCards();cardsSwept=true;}
    syncBetVisual();
    const bankTarget=(state.phase==='betting'||(state.phase==='finished'&&cardsSwept))&&!state.busy?1:0;
    bankPresence=lerp(bankPresence,bankTarget,.16);
    chipBank.visible=bankPresence>.025;
    chipBank.scale.setScalar(Math.max(.001,bankPresence));
    chipBank.position.y=-(1-bankPresence)*.11;
    dealerTotal.frame(now);playerTotal.frame(now);potTotal.frame(now);resultPopup.frame(now);

    controls.forEach(c=>{
      const action=c.userData.blackjackAction,active=hover===action,isPressed=pressed===action&&now<pressUntil;
      const baseY=c.userData.baseY??c.position.y;c.position.y=lerp(c.position.y,baseY-(isPressed ? .018 : 0),.42);
      if(c.material.emissive){let glow=.055;if(active)glow=.23;if(isPressed)glow=.38;c.material.emissiveIntensity=glow;}
      if(c.userData.stackGroup)c.userData.stackGroup.scale.setScalar(active?1.08:1);
    });
    if(now>=pressUntil)pressed=null;
  }
  dealerTotal.set(null);playerTotal.set(null);potTotal.set(null);rebuildBetVisual(0);syncControlVisibility();
  return {group:tableGroup,controls,update,frame,setHover,press,enabled:controlEnabled};
}
