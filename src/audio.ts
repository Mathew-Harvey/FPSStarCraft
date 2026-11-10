// Tiny synthesised sound effects. No audio files.
let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let noiseBuf: AudioBuffer | null = null;
let drillOsc: OscillatorNode | null = null, drillGain: GainNode | null = null;

export function initAudio() {
  if (ctx) { ctx.resume(); return; }
  try {
    ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    master = ctx.createGain(); master.gain.value = .5; master.connect(ctx.destination);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  } catch (e) { ctx = null; }
}
function env(g: GainNode, t: number, peak: number, dur: number) { peak = Math.max(peak, .0002); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + .005); g.gain.exponentialRampToValueAtTime(0.0001, t + dur); }
function noise(dur: number, freq: number, peak: number, type: BiquadFilterType = 'lowpass') {
  if (!ctx || !master || !noiseBuf || peak < .004) return;
  const t = ctx.currentTime, s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
  s.buffer = noiseBuf; f.type = type; f.frequency.value = freq; env(g, t, peak, dur); s.connect(f); f.connect(g); g.connect(master); s.start(t, Math.random() * .5, dur + .05);
}
function tone(f0: number, f1: number, dur: number, peak: number, type: OscillatorType = 'square') {
  if (!ctx || !master || peak < .004) return;
  const t = ctx.currentTime, o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur); env(g, t, peak, dur); o.connect(g); g.connect(master); o.start(t); o.stop(t + dur + .05);
}
/** `vol` 0..1 lets distant events play quieter. */
export const sfx = {
  shot: (vol = 1) => { noise(.12, 2200, .5 * vol); tone(220, 60, .09, .25 * vol, 'sawtooth'); },
  turret: (vol = 1) => { noise(.16, 1200, .4 * vol); tone(140, 50, .12, .25 * vol, 'sawtooth'); },
  hit: (vol = 1) => { noise(.06, 900, .35 * vol, 'bandpass'); },
  slash: (vol = 1) => { noise(.18, 3200, .3 * vol, 'highpass'); tone(900, 300, .16, .12 * vol, 'sine'); },
  ko: (vol = 1) => { tone(300, 60, .3, .3 * vol, 'triangle'); noise(.25, 600, .3 * vol); },
  ore: () => { tone(880, 1320, .09, .18, 'triangle'); },
  blip: () => { tone(660, 660, .05, .12); },
  deny: () => { tone(160, 110, .16, .2); },
  place: () => { tone(220, 440, .14, .2, 'triangle'); noise(.1, 500, .2); },
  built: () => { tone(440, 440, .09, .18, 'triangle'); setTimeout(() => tone(660, 660, .14, .18, 'triangle'), 90); },
  jump: () => { noise(.3, 4000, .22, 'highpass'); tone(200, 1200, .22, .14, 'sine'); },
  card: () => { noise(.2, 300, .5); tone(110, 55, .3, .35, 'sawtooth'); },
  alarm: () => { tone(520, 520, .18, .22); setTimeout(() => tone(390, 390, .22, .22), 200); },
  callout: () => { tone(520, 780, .08, .14, 'triangle'); },
  reload: () => { noise(.05, 3000, .25, 'highpass'); setTimeout(() => noise(.06, 1800, .3, 'bandpass'), 260); },
  win: () => { [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => tone(f, f, .25, .2, 'triangle'), i * 140)); },
  lose: () => { [392, 330, 262, 196].forEach((f, i) => setTimeout(() => tone(f, f, .3, .2, 'sawtooth'), i * 180)); },
};
export function drillSound(on: boolean, biting: boolean) {
  if (!ctx || !master) return;
  if (on && !drillOsc) { drillOsc = ctx.createOscillator(); drillGain = ctx.createGain(); drillOsc.type = 'sawtooth'; drillGain.gain.value = .0001; drillOsc.connect(drillGain); drillGain.connect(master); drillOsc.start(); }
  if (drillOsc && drillGain) { const t = ctx.currentTime; drillGain.gain.setTargetAtTime(on ? (biting ? .13 : .06) : .0001, t, .04); drillOsc.frequency.setTargetAtTime(biting ? 95 + Math.random() * 20 : 150, t, .05); }
}
