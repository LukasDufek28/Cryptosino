let ctx = null;
let master = null;
let ambienceTimer = null;
let ambienceOn = false;

function ensure() {
  if (typeof window === 'undefined') return null;
  if (!ctx) {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return null;
    ctx = new AudioCtx();
    master = ctx.createGain();
    master.gain.value = 0.42;
    master.connect(ctx.destination);
  }
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  return ctx;
}

function tone(freq, duration = .08, volume = .06, type = 'sine', delay = 0, detune = 0) {
  const c = ensure(); if (!c) return;
  const now = c.currentTime + delay;
  const osc = c.createOscillator(), gain = c.createGain();
  osc.type = type; osc.frequency.value = freq; osc.detune.value = detune;
  gain.gain.setValueAtTime(.0001, now);
  gain.gain.exponentialRampToValueAtTime(Math.max(.0002, volume), now + .008);
  gain.gain.exponentialRampToValueAtTime(.0001, now + duration);
  osc.connect(gain); gain.connect(master); osc.start(now); osc.stop(now + duration + .02);
}

function noise(duration = .12, volume = .035, highpass = 700) {
  const c = ensure(); if (!c) return;
  const length = Math.max(1, Math.floor(c.sampleRate * duration));
  const buffer = c.createBuffer(1, length, c.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / length);
  const src = c.createBufferSource(), filter = c.createBiquadFilter(), gain = c.createGain();
  src.buffer = buffer; filter.type = 'highpass'; filter.frequency.value = highpass;
  gain.gain.value = volume; src.connect(filter); filter.connect(gain); gain.connect(master); src.start();
}

export function slotButton(action = '') {
  ensure();
  tone(action === 'spin' ? 170 : 240, .055, .055, 'square');
  tone(action === 'spin' ? 95 : 130, .07, .035, 'triangle', .018);
}

export function slotSpinStart() {
  ensure(); noise(.18, .028, 350);
  tone(92, .18, .05, 'sawtooth');
  tone(138, .14, .025, 'triangle', .05);
}

export function slotReelStop(index = 0) {
  ensure();
  tone(135 + index * 22, .065, .06, 'square');
  tone(68 + index * 7, .09, .045, 'triangle', .012);
}

export function slotCoinTick(step = 0) {
  ensure();
  const f = 720 + (step % 5) * 42;
  tone(f, .045, .028, 'sine');
  tone(f * 1.5, .035, .014, 'sine', .006);
}

export function slotWin(multiplier = 1) {
  ensure();
  const tier = multiplier >= 25 ? 3 : multiplier >= 10 ? 2 : multiplier >= 3 ? 1 : 0;
  [392, 523.25, 659.25, 783.99].forEach((f, i) => tone(f, .18 + tier*.035, .035 + tier*.008, 'triangle', i * .075));
  if (tier >= 1) [1046.5, 1318.5].forEach((f,i)=>tone(f,.22,.022+tier*.006,'sine',.31+i*.085));
  if (tier >= 3) noise(.28,.025,1400);
}

export function slotLock() {
  ensure();
  tone(610,.08,.045,'square');
  tone(915,.11,.03,'sine',.035);
  noise(.07,.012,2200);
}

export function slotRespin() {
  ensure();
  tone(130,2.15,.024,'triangle');
  const melody=[392,523.25,659.25,523.25,783.99,659.25,880,783.99,1046.5,880,1174.66,1046.5,1318.5,1174.66,1568,1318.5];
  melody.forEach((f,i)=>{
    const delay=i*.13;
    tone(f,.20,.024+(i%4===3?.008:0),'triangle',delay);
    if(i%2===0)tone(f*2,.12,.007,'sine',delay+.025);
  });
  [196,261.63,329.63,392].forEach((f,i)=>tone(f,1.7,.0065,'sine',.18+i*.035));
  [523.25,659.25,783.99].forEach((f,i)=>tone(f,.44,.018,'triangle',1.55+i*.13));
  noise(.22,.016,1700);
}

export function slotCelebration(multiplier = 1, maxWin = false) {
  ensure();
  const tier = maxWin ? 4 : multiplier >= 50 ? 3 : multiplier >= 25 ? 2 : multiplier >= 10 ? 1 : multiplier >= 3 ? 0.5 : 0;
  const roots=[261.63,329.63,392,523.25,659.25,783.99];
  const phrase=(offset,lift=1)=>{
    roots.forEach((f,i)=>{
      tone(f*lift,.30+tier*.045,.027+tier*.006,'triangle',offset+i*.095);
      tone(f*2*lift,.17,.010+tier*.002,'sine',offset+i*.095+.028);
    });
  };
  phrase(0,1);
  if(tier>=1) phrase(.72,1.04);
  if(tier>=2) phrase(1.48,1.08);
  if(tier>=3) phrase(2.25,1.12);
  if(tier>=2)[1046.5,1318.5,1568].forEach((f,i)=>tone(f,.48,.022+tier*.005,'sine',.55+i*.13));
  if(tier>=3){
    tone(196,2.6,.022,'sawtooth',.10);
    [130.81,164.81,196].forEach((f,i)=>tone(f,2.1,.012,'triangle',.2+i*.04));
    noise(.55,.024,1350);
  }
  if(maxWin){
    phrase(3.05,1.18);
    [523.25,659.25,783.99,1046.5,1318.5,1568,2093].forEach((f,i)=>tone(f,.50,.045,'triangle',3.72+i*.11));
    noise(.85,.035,1150);
  }
}

function ambiencePhrase() {
  if (!ambienceOn) return;
  const notes = [220, 261.63, 329.63, 392];
  notes.forEach((f, i) => {
    tone(f, .48, .007, 'sine', i * .42);
    tone(f * 2, .22, .0035, 'triangle', i * .42 + .03);
  });
}

export function startSlotAmbience() {
  ensure();
  if (ambienceOn) return;
  ambienceOn = true; ambiencePhrase();
  ambienceTimer = window.setInterval(ambiencePhrase, 2400);
}

export function stopSlotAmbience() {
  ambienceOn = false;
  if (ambienceTimer) { window.clearInterval(ambienceTimer); ambienceTimer = null; }
}

export function olympusTumble(level = 0) {
  ensure();
  const root = 180 + Math.min(7, level) * 18;
  tone(root, .11, .032, 'triangle');
  tone(root * 1.5, .14, .022, 'sine', .045);
  noise(.08, .012, 1200);
}

export function olympusMultiplier(value = 2) {
  ensure();
  const tier = value >= 100 ? 3 : value >= 25 ? 2 : value >= 10 ? 1 : 0;
  [330, 440, 660].forEach((f, i) => tone(f * (1 + tier * .08), .18 + tier*.04, .03 + tier*.006, 'sine', i * .06));
  if (tier >= 2) tone(990, .32, .032, 'triangle', .18);
}

export function olympusScatter(count = 1) {
  ensure();
  tone(260 + count * 45, .22, .04, 'triangle');
  tone(520 + count * 60, .18, .024, 'sine', .08);
}

export function olympusThunder(intensity = 1) {
  ensure();
  noise(.28 + intensity * .08, .025 + intensity * .012, 160);
  tone(72, .3, .05, 'sawtooth');
  tone(108, .24, .025, 'triangle', .04);
}

export function olympusFreeSpinStart() {
  ensure();
  [261.63,329.63,392,523.25,659.25].forEach((f,i)=>tone(f,.28,.035,'triangle',i*.08));
  noise(.25,.018,1800);
}
