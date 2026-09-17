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
  [440, 554.37, 659.25, 880].forEach((f, i) => tone(f, .16, .04, 'sine', i * .055));
  noise(.12, .018, 1800);
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
