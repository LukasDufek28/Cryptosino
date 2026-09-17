// Hand-drawn casino symbol artwork. Deliberately avoids emoji/font glyph art.
const TAU = Math.PI * 2;
function leaf(c,x,y,rx,ry,a=0){c.save();c.translate(x,y);c.rotate(a);const g=c.createLinearGradient(-rx,0,rx,0);g.addColorStop(0,'#c8ef73');g.addColorStop(.45,'#43ad4e');g.addColorStop(1,'#13542c');c.fillStyle=g;c.beginPath();c.ellipse(0,0,rx,ry,0,0,TAU);c.fill();c.strokeStyle='#dbf49a';c.lineWidth=2;c.beginPath();c.moveTo(-rx*.7,0);c.lineTo(rx*.7,0);c.stroke();c.restore();}
function orb(c,x,y,r,colors){const g=c.createRadialGradient(x-r*.35,y-r*.4,r*.08,x,y,r);colors.forEach((v,i)=>g.addColorStop(i/(colors.length-1),v));c.fillStyle=g;c.beginPath();c.arc(x,y,r,0,TAU);c.fill();c.fillStyle='rgba(255,255,255,.5)';c.beginPath();c.ellipse(x-r*.3,y-r*.34,r*.18,r*.09,-.5,0,TAU);c.fill();}
function cherry(c){c.strokeStyle='#47722b';c.lineWidth=7;c.lineCap='round';c.beginPath();c.moveTo(-29,-12);c.quadraticCurveTo(-12,-53,3,-61);c.moveTo(29,-10);c.quadraticCurveTo(19,-50,3,-61);c.stroke();leaf(c,18,-57,24,10,-.25);orb(c,-29,14,31,['#ff8791','#e31f41','#990020','#420010']);orb(c,29,16,32,['#ff8d96','#ec2745','#a00024','#4b0014']);}
function lemon(c){c.save();c.rotate(-.16);const g=c.createRadialGradient(-18,-18,6,0,4,58);g.addColorStop(0,'#fffaa2');g.addColorStop(.3,'#ffdb2d');g.addColorStop(.8,'#eea000');g.addColorStop(1,'#9e6600');c.fillStyle=g;c.beginPath();c.ellipse(0,5,58,38,0,0,TAU);c.fill();c.fillStyle='#ffe341';c.beginPath();c.moveTo(-56,3);c.lineTo(-69,0);c.lineTo(-56,-4);c.fill();c.beginPath();c.moveTo(56,3);c.lineTo(69,0);c.lineTo(56,-4);c.fill();c.fillStyle='rgba(255,255,255,.5)';c.beginPath();c.ellipse(-20,-13,20,8,-.25,0,TAU);c.fill();c.restore();leaf(c,26,-37,25,11,.15);}
function orange(c){leaf(c,21,-49,25,11,.2);c.strokeStyle='#47722b';c.lineWidth=7;c.beginPath();c.moveTo(3,-38);c.quadraticCurveTo(8,-55,19,-62);c.stroke();orb(c,0,5,57,['#ffd98a','#ff9d2e','#e55b00','#7e2d00']);c.fillStyle='rgba(255,239,178,.38)';for(let i=0;i<14;i++){const a=i*2.399,r=39*Math.sqrt((i+1)/14);c.beginPath();c.arc(Math.cos(a)*r,5+Math.sin(a)*r,1.6,0,TAU);c.fill();}}
function plum(c){leaf(c,22,-48,25,11,-.28);c.save();c.rotate(.1);const g=c.createRadialGradient(-18,-22,8,0,7,59);g.addColorStop(0,'#efaaff');g.addColorStop(.25,'#ad59d7');g.addColorStop(.7,'#572080');g.addColorStop(1,'#26093f');c.fillStyle=g;c.beginPath();c.ellipse(0,8,51,59,0,0,TAU);c.fill();c.fillStyle='rgba(255,255,255,.38)';c.beginPath();c.ellipse(-18,-16,14,7,-.55,0,TAU);c.fill();c.restore();}
function grapes(c){c.strokeStyle='#416d29';c.lineWidth=8;c.lineCap='round';c.beginPath();c.moveTo(0,-62);c.lineTo(5,-40);c.stroke();leaf(c,28,-56,29,13,.35);[[-27,-22],[0,-27],[27,-20],[-40,5],[-12,2],[17,3],[39,7],[-27,29],[2,27],[28,31],[-10,52],[14,52]].forEach(([x,y])=>orb(c,x,y,19,['#d8a0ff','#9559dc','#55208e','#29094e']));}
function melon(c){const rind=c.createRadialGradient(-18,-18,5,0,6,64);rind.addColorStop(0,'#a3ed88');rind.addColorStop(.58,'#43b15a');rind.addColorStop(1,'#145f34');c.fillStyle=rind;c.beginPath();c.arc(0,6,64,0,TAU);c.fill();c.fillStyle='#eff4a8';c.beginPath();c.arc(0,6,54,0,TAU);c.fill();const g=c.createRadialGradient(-17,-15,5,0,6,48);g.addColorStop(0,'#ff9690');g.addColorStop(.55,'#ed4558');g.addColorStop(1,'#9f0e32');c.fillStyle=g;c.beginPath();c.arc(0,6,48,0,TAU);c.fill();c.fillStyle='#35161c';[[-22,-14],[4,-19],[24,-3],[-27,11],[-4,9],[18,18],[-12,31]].forEach(([x,y])=>{c.save();c.translate(x,y);c.rotate(.35);c.beginPath();c.ellipse(0,0,3,6,0,0,TAU);c.fill();c.restore();});}
function bell(c){const g=c.createLinearGradient(-55,-58,55,64);['#fff5b0','#f2bb35','#a75d05','#ffd95a','#804400'].forEach((v,i)=>g.addColorStop(i/4,v));c.fillStyle=g;c.strokeStyle='#663700';c.lineWidth=5;c.beginPath();c.moveTo(-12,-58);c.quadraticCurveTo(0,-70,12,-58);c.lineTo(17,-45);c.quadraticCurveTo(48,-28,45,25);c.quadraticCurveTo(54,38,63,43);c.lineTo(-63,43);c.quadraticCurveTo(-54,38,-45,25);c.quadraticCurveTo(-48,-28,-17,-45);c.closePath();c.fill();c.stroke();c.beginPath();c.ellipse(0,44,50,9,0,0,TAU);c.fill();c.stroke();c.fillStyle='#7a4200';c.beginPath();c.arc(0,56,10,0,TAU);c.fill();c.fillStyle='rgba(255,255,255,.45)';c.beginPath();c.ellipse(-18,-22,9,25,-.18,0,TAU);c.fill();}
function joker(c){
  c.save(); c.lineJoin='round';
  // Four glossy jester horns: alternating charcoal and ivory, finished with gold bells.
  const horns=[[-44,-36,-72,-78,'#17131a'],[-16,-48,-30,-94,'#f2eee4'],[16,-48,30,-94,'#17131a'],[44,-36,72,-78,'#f2eee4']];
  horns.forEach(([bx,by,tx,ty,col])=>{const g=c.createLinearGradient(bx,by,tx,ty);g.addColorStop(0,col);g.addColorStop(.55,col==='#17131a'?'#3b3540':'#ffffff');g.addColorStop(1,col==='#17131a'?'#08070a':'#bbb4aa');c.fillStyle=g;c.strokeStyle='#241b20';c.lineWidth=4;c.beginPath();c.moveTo(-4,-34);c.quadraticCurveTo(bx,by,tx,ty);c.quadraticCurveTo(tx+12,ty+22,bx*.58,-12);c.closePath();c.fill();c.stroke();orb(c,tx,ty+4,8,['#fff1a0','#e8b72d','#7a4900']);});
  // Silver theatrical mask.
  const face=c.createRadialGradient(-15,-18,4,0,8,58);face.addColorStop(0,'#ffffff');face.addColorStop(.28,'#d8dce2');face.addColorStop(.72,'#8e929c');face.addColorStop(1,'#4a4650');c.fillStyle=face;c.strokeStyle='#2a2229';c.lineWidth=5;c.beginPath();c.moveTo(-43,-22);c.quadraticCurveTo(-50,18,-27,49);c.quadraticCurveTo(0,70,27,49);c.quadraticCurveTo(50,18,43,-22);c.quadraticCurveTo(0,-45,-43,-22);c.closePath();c.fill();c.stroke();
  // Gold filigree cheeks and brow.
  c.strokeStyle='#c9962f';c.lineWidth=7;c.beginPath();c.moveTo(-35,-7);c.quadraticCurveTo(-21,-26,-5,-14);c.moveTo(35,-7);c.quadraticCurveTo(21,-26,5,-14);c.stroke();
  c.fillStyle='#171219';[[-18,-6],[18,-6]].forEach(([x,y])=>{c.beginPath();c.ellipse(x,y,12,7,0,0,TAU);c.fill();c.fillStyle='#f4c74d';c.beginPath();c.arc(x,y,3,0,TAU);c.fill();c.fillStyle='#171219';});
  c.strokeStyle='#9f3349';c.lineWidth=5;c.beginPath();c.moveTo(-25,27);c.quadraticCurveTo(0,49,25,27);c.stroke();
  c.fillStyle='rgba(255,255,255,.72)';c.beginPath();c.ellipse(-16,5,8,25,-.55,0,TAU);c.fill();
  c.restore();
}
function book(c){const g=c.createLinearGradient(-60,-55,60,58);g.addColorStop(0,'#ffe39b');g.addColorStop(.45,'#bd7621');g.addColorStop(1,'#5f2c0b');c.fillStyle=g;c.fillRect(-58,-60,116,120);c.fillStyle='#802720';c.fillRect(-47,-49,94,98);c.fillStyle='#f0d790';c.fillRect(-38,-40,76,80);c.fillStyle='#92322b';c.font='bold 29px Georgia';c.textAlign='center';c.textBaseline='middle';c.fillText('BOOK',0,-4);}
function scarab(c){const g=c.createRadialGradient(-12,-20,5,0,5,60);g.addColorStop(0,'#c9ffec');g.addColorStop(.35,'#4bc8aa');g.addColorStop(1,'#063c43');c.fillStyle=g;c.strokeStyle='#d6b85f';c.lineWidth=5;c.beginPath();c.ellipse(0,10,38,50,0,0,TAU);c.fill();c.stroke();c.beginPath();c.arc(0,-40,20,Math.PI,0);c.fill();c.stroke();c.beginPath();c.moveTo(0,-25);c.lineTo(0,58);c.stroke();}
function card(c,label){const g=c.createLinearGradient(-50,-62,50,62);g.addColorStop(0,'#fff9e9');g.addColorStop(1,'#d9c79e');c.fillStyle=g;c.strokeStyle='#b89145';c.lineWidth=5;c.fillRect(-48,-61,96,122);c.strokeRect(-48,-61,96,122);c.fillStyle=['A','K'].includes(label)?'#9f2933':'#283b58';c.font=`bold ${label==='10'?58:78}px Georgia`;c.textAlign='center';c.textBaseline='middle';c.fillText(label,0,0);}
const symbolCache = new Map();
function cachedSymbol(symbol){
  if(symbolCache.has(symbol)) return symbolCache.get(symbol);
  const canvas=document.createElement('canvas'); canvas.width=240; canvas.height=240;
  const ctx=canvas.getContext('2d'); ctx.translate(120,120); ctx.scale(1.35,1.35);
  const f={CHERRY:cherry,LEMON:lemon,ORANGE:orange,PLUM:plum,GRAPES:grapes,MELON:melon,BELL:bell,JOKER:joker,BOOK:book,SCARAB:scarab}[symbol];
  if(f) f(ctx); else card(ctx,{ACE:'A',KING:'K',QUEEN:'Q',JACK:'J',TEN:'10'}[symbol]||String(symbol));
  symbolCache.set(symbol,canvas); return canvas;
}
export function drawSlotSymbol(c,symbol,x,y,size,{highlight=false}={}){
  const img=cachedSymbol(symbol); c.save(); c.translate(x,y);
  c.shadowColor=highlight?'#ffd65a':'rgba(0,0,0,.38)'; c.shadowBlur=highlight?22:9; c.shadowOffsetY=5;
  c.drawImage(img,-size/2,-size/2,size,size); c.restore();
}
