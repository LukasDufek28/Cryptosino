let ctx=null,master=null;
function ensure(){
  if(typeof window==='undefined')return null;
  if(!ctx){const AC=window.AudioContext||window.webkitAudioContext;if(!AC)return null;ctx=new AC();master=ctx.createGain();master.gain.value=.34;master.connect(ctx.destination);}
  if(ctx.state==='suspended')ctx.resume().catch(()=>{});
  return ctx;
}
function tone(freq,duration=.06,volume=.03,type='sine',delay=0){
  const c=ensure();if(!c)return;const at=c.currentTime+delay,osc=c.createOscillator(),gain=c.createGain();
  osc.type=type;osc.frequency.value=freq;gain.gain.setValueAtTime(.0001,at);gain.gain.exponentialRampToValueAtTime(volume,at+.006);gain.gain.exponentialRampToValueAtTime(.0001,at+duration);
  osc.connect(gain);gain.connect(master);osc.start(at);osc.stop(at+duration+.02);
}
function noise(duration=.05,volume=.018,highpass=900){
  const c=ensure();if(!c)return;const n=Math.max(1,Math.floor(c.sampleRate*duration)),buffer=c.createBuffer(1,n,c.sampleRate),data=buffer.getChannelData(0);
  for(let i=0;i<n;i++)data[i]=(Math.random()*2-1)*(1-i/n);
  const src=c.createBufferSource(),filter=c.createBiquadFilter(),gain=c.createGain();src.buffer=buffer;filter.type='highpass';filter.frequency.value=highpass;gain.gain.value=volume;
  src.connect(filter);filter.connect(gain);gain.connect(master);src.start();
}
export function blackjackChip(value=1){
  ensure();const f=value>=100?360:value>=25?330:value>=5?300:270;
  tone(f,.055,.042,'triangle');tone(f*1.65,.04,.018,'sine',.012);noise(.035,.01,1700);
}
export function blackjackButton(){
  ensure();tone(170,.045,.028,'square');tone(95,.07,.022,'triangle',.012);
}
export function blackjackDeal(index=0){
  ensure();noise(.075,.022,1050);tone(155+index*9,.045,.016,'triangle',.02);
}
export function blackjackFlip(){
  ensure();noise(.09,.025,1450);tone(240,.07,.025,'triangle',.025);
}
export function blackjackResult(outcome){
  ensure();
  if(outcome==='win'||outcome==='blackjack'){[392,523.25,659.25,783.99].forEach((f,i)=>tone(f,.16,.032,'triangle',i*.07));}
  else if(outcome==='push'){tone(330,.12,.028,'triangle');tone(330,.12,.02,'triangle',.13);}
  else{tone(196,.14,.026,'triangle');tone(147,.2,.022,'sine',.09);}
}

export function blackjackShuffle(){
  ensure();
  for(let i=0;i<5;i++){noise(.055,.012,1100+i*90);tone(120+i*7,.035,.009,'triangle',i*.055);}
}
export function blackjackTableTap(){
  ensure();tone(118,.045,.022,'triangle');noise(.028,.008,850);
}
export function blackjackChipSweep(){
  ensure();for(let i=0;i<4;i++){tone(265+i*18,.035,.018,'triangle',i*.035);noise(.025,.006,1900);}
}
