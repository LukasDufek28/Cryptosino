import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { group, stool } from './models';
import { drawOlympusKing, drawOlympusSymbol } from './olympusArt';

const GOLD='#d8b252', BLUE='#182a50', MARBLE='#e8e1d2';
function rounded(parent,size,color,pos,opt={}){
  const geo=new RoundedBoxGeometry(size[0],size[1],size[2],5,opt.radius||.06);
  const mat=new THREE.MeshPhysicalMaterial({color,roughness:opt.roughness??.32,metalness:opt.metalness??.25,clearcoat:opt.clearcoat??.28,emissive:opt.emissive||'#000000',emissiveIntensity:opt.emissiveIntensity||0});
  const mesh=new THREE.Mesh(geo,mat);mesh.position.set(...pos);mesh.castShadow=true;mesh.receiveShadow=true;parent.add(mesh);return mesh;
}
function canvasTexture(w,h){const canvas=document.createElement('canvas');canvas.width=w;canvas.height=h;const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;texture.generateMipmaps=false;texture.minFilter=THREE.LinearFilter;texture.magFilter=THREE.LinearFilter;return{canvas,ctx:canvas.getContext('2d',{alpha:false}),texture};}
function plane(parent,w,h,texture,pos){const mat=new THREE.MeshBasicMaterial({map:texture,toneMapped:false});const m=new THREE.Mesh(new THREE.PlaneGeometry(w,h),mat);m.position.set(...pos);parent.add(m);return m;}
const preview=[['BLUE','GREEN','CROWN','PURPLE','YELLOW'],['RED','RING','BLUE','GREEN','CHALICE'],['YELLOW','HOURGLASS','PURPLE','BLUE','RED'],['GREEN','SCATTER','YELLOW','RING','PURPLE'],['CHALICE','BLUE','RED','GREEN','CROWN'],['PURPLE','MULT','GREEN','YELLOW','BLUE']];
export default function liveOlympusMachine(parent,machine,floorY){
  const g=group(parent,machine.x,floorY,machine.z);
  rounded(g,[2.12,2.55,1.04],BLUE,[0,1.31,0],{radius:.13,metalness:.16,roughness:.42,clearcoat:.22});
  rounded(g,[1.98,2.38,.08],'#111829',[0,1.39,.535],{radius:.1,metalness:.3,roughness:.3});
  rounded(g,[2.18,.16,1.12],MARBLE,[0,.12,.01],{radius:.055,metalness:.03,roughness:.58});
  rounded(g,[2.14,.12,1.08],MARBLE,[0,2.56,.01],{radius:.05,metalness:.03,roughness:.55});
  [-1.02,1.02].forEach(x=>rounded(g,[.055,2.18,.07],GOLD,[x,1.38,.57],{radius:.02,metalness:1,roughness:.12,emissive:'#8f6a20',emissiveIntensity:.08}));
  const screen=canvasTexture(768,576);
  rounded(g,[1.82,1.38,.08],'#02040a',[0,1.62,.578],{radius:.045,metalness:.8,roughness:.12});
  plane(g,1.69,1.265,screen.texture,[0,1.62,.625]);
  rounded(g,[2.02,.16,.72],MARBLE,[0,.76,.70],{radius:.06,metalness:.04,roughness:.48});
  rounded(g,[1.90,.045,.62],'#23365f',[0,.855,.70],{radius:.04,metalness:.16,roughness:.38});
  stool(g,0,0,1.90);
  let lastDraw=-1;
  function draw(now){
    const c=screen.ctx,w=1536,h=1152;c.setTransform(.5,0,0,.5,0,0);
    const sky=c.createLinearGradient(0,0,0,h);sky.addColorStop(0,'#67b9ff');sky.addColorStop(.42,'#d8efff');sky.addColorStop(1,'#55417f');c.fillStyle=sky;c.fillRect(0,0,w,h);
    c.fillStyle='rgba(255,255,255,.8)';for(let i=0;i<7;i++){const x=110+i*225,y=120+(i%2)*35;c.beginPath();c.arc(x,y,70,0,Math.PI*2);c.arc(x+65,y+8,55,0,Math.PI*2);c.fill();}
    c.fillStyle='#f9e6a7';c.textAlign='center';c.font='900 70px Georgia';c.shadowColor='#593e18';c.shadowBlur=12;c.fillText('GATES OF OLYMPUS',768,82);c.shadowBlur=0;
    c.fillStyle='#fff7d9';c.font='700 24px Arial';c.fillText('6 × 5  ·  PAY ANYWHERE  ·  TUMBLES  ·  MULTIPLIERS',768,122);
    const gx=115,gy=175,cw=150,ch=145;for(let r=0;r<6;r++)for(let row=0;row<5;row++){const x=gx+r*cw,y=gy+row*ch;c.fillStyle='rgba(32,34,84,.42)';c.fillRect(x+4,y+4,cw-8,ch-8);c.strokeStyle='rgba(255,225,136,.32)';c.lineWidth=3;c.strokeRect(x+4,y+4,cw-8,ch-8);const sym=preview[r][row];drawOlympusSymbol(c,sym,x+cw/2,y+ch/2,88,{value:sym==='MULT'?10:0,glow:sym==='MULT'||sym==='SCATTER'});}
    drawOlympusKing(c,1255,585,370,{charge:.25+.15*Math.sin(now*.002)});
    c.fillStyle='rgba(22,16,52,.88)';c.fillRect(105,930,1325,125);c.strokeStyle='#e7c55f';c.lineWidth=5;c.strokeRect(105,930,1325,125);
    c.fillStyle='#fff0ad';c.font='800 36px Georgia';c.fillText('TEMPLE PREVIEW',768,978);c.fillStyle='#e6e0ff';c.font='700 24px Arial';c.fillText('Shared multiplayer shell is live · tumble gameplay tuning continues',768,1022);
    screen.texture.needsUpdate=true;lastDraw=now;
  }
  draw(performance.now());
  return {
    id:machine.id,controls:[],
    update(){},updateControls(){},setHover(){},press(){},
    frame(now){if(lastDraw<0||now-lastDraw>80)draw(now);}
  };
}
