// Tiny synthesised sound effects. No audio files.
let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let noiseBuf: AudioBuffer | null = null;
let music: GainNode | null = null, volume = .5, mood = 0, moodNow = 0, step = 0, nextT = 0;
export function setVolume(v: number) { volume = v; if (master && ctx) master.gain.setTargetAtTime(v, ctx.currentTime, .05); }
/** 0 is silence, .25 is calm base music, 1 is a full fight. */
export function setMood(x: number) { if (!level) return; moods[seat] = x; mood = Math.max(moods[0], moods[1]); }
let musicOn = true;
export function setMusic(on: boolean) { musicOn = on; }
let drillOsc: OscillatorNode | null = null, drillGain: GainNode | null = null;
/** Split screen runs three copies of the game in one page: a silent one that owns the match, and one for each player. */
let level = 1, seat = 0; const drills: [OscillatorNode | null, GainNode | null][] = [[null, null], [null, null]], moods = [0, 0];
/** Sets who the next sounds belong to. `gain` 0 is silent. `who` is 0 for player one and 1 for player two. */
export function audioSeat(gain: number, who = 0) { drills[seat] = [drillOsc, drillGain]; level = gain; seat = who; drillOsc = drills[who][0]; drillGain = drills[who][1]; }

export function initAudio() {
  if (ctx) { ctx.resume(); return; }
  try {
    ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    master = ctx.createGain(); master.gain.value = volume; const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 5; master.connect(comp); comp.connect(ctx.destination);
    music = ctx.createGain(); music.gain.value = .0001; music.connect(master); setInterval(tick, 90);
    // a bed of desert wind that never quite repeats
    const w = ctx.createBufferSource(), wf = ctx.createBiquadFilter(), wg = ctx.createGain(), lfo = ctx.createOscillator(), lg = ctx.createGain();
    w.buffer = noiseBuf; w.loop = true; wf.type = 'bandpass'; wf.frequency.value = 420; wf.Q.value = .6; wg.gain.value = .05; lfo.frequency.value = .13; lg.gain.value = 190;
    lfo.connect(lg); lg.connect(wf.frequency); w.connect(wf); wf.connect(wg); wg.connect(master); w.start(); lfo.start();

  } catch (e) { ctx = null; }
}
function env(g: GainNode, t: number, peak: number, dur: number) { peak = Math.max(peak, .0002); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + .005); g.gain.exponentialRampToValueAtTime(0.0001, t + dur); }
function noise(dur: number, freq: number, peak: number, type: BiquadFilterType = 'lowpass') {
  peak *= level; if (!ctx || !master || !noiseBuf || peak < .004) return;
  const t = ctx.currentTime, s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
  s.buffer = noiseBuf; f.type = type; f.frequency.value = freq; env(g, t, peak, dur); s.connect(f); f.connect(g); g.connect(master); s.start(t, Math.random() * .5, dur + .05);
}
function tone(f0: number, f1: number, dur: number, peak: number, type: OscillatorType = 'square') {
  peak *= level; if (!ctx || !master || peak < .004) return;
  const t = ctx.currentTime, o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur); env(g, t, peak, dur); o.connect(g); g.connect(master); o.start(t); o.stop(t + dur + .05);
}
/** The second half of a two-part sound. The silent copy of the game never gets to play it. */
function later(f: () => void, ms: number) { const l = level; if (l) setTimeout(() => { const now = level; level = l; f(); level = now; }, ms); }
/** `vol` 0..1 lets distant events play quieter. */
export const sfx = {
  shot: (vol = 1) => { noise(.12, 2200, .5 * vol); tone(220, 60, .09, .25 * vol, 'sawtooth'); },
  turret: (vol = 1) => { noise(.16, 1200, .4 * vol); tone(140, 50, .12, .25 * vol, 'sawtooth'); },
  hit: (vol = 1) => { noise(.06, 900, .35 * vol, 'bandpass'); },
  slash: (vol = 1) => { noise(.18, 3200, .3 * vol, 'highpass'); tone(900, 300, .16, .12 * vol, 'sine'); },
  ko: (vol = 1, veyl = true) => { if (veyl) { tone(900, 120, .35, .22 * vol, 'sine'); tone(1350, 200, .3, .1 * vol, 'triangle'); noise(.25, 2600, .2 * vol, 'highpass'); } else { tone(300, 60, .3, .3 * vol, 'triangle'); noise(.25, 600, .3 * vol); } },
  step: (heavy = false) => { noise(.07, heavy ? 260 : 420, heavy ? .16 : .1); },
  crit: () => { tone(1320, 1760, .09, .16, 'triangle'); },
  streak: (n: number) => { [0, 4, 7, 12].slice(0, Math.min(4, n)).forEach((st, i) => later(() => tone(440 * Math.pow(2, st / 12), 440 * Math.pow(2, st / 12), .12, .2, 'square'), i * 70)); },
  boom: (vol = 1) => { noise(.7, 420, .9 * vol); tone(120, 28, .55, .6 * vol, 'sine'); noise(.12, 3000, .3 * vol, 'highpass'); },
  blast: (vol = 1) => { noise(.26, 1300, .75 * vol); tone(150, 40, .2, .45 * vol, 'sawtooth'); },
  clang: () => { tone(620, 540, .22, .22, 'square'); tone(931, 860, .3, .14, 'triangle'); noise(.05, 4000, .3, 'highpass'); },
  hurt: () => { tone(170, 80, .16, .3, 'sawtooth'); noise(.1, 500, .3); },
  throw: () => { noise(.2, 1800, .2, 'bandpass'); tone(300, 520, .16, .1, 'sine'); },
  zap: (vol = 1) => { tone(1500, 320, .2, .16 * vol, 'sawtooth'); tone(2200, 700, .12, .1 * vol, 'sine'); },
  dash: (vol = 1) => { noise(.3, 2600, .22 * vol, 'bandpass'); tone(400, 900, .25, .08 * vol, 'sine'); },
  charge: (vol = 1) => { tone(70, 240, .85, .35 * vol, 'sawtooth'); tone(140, 480, .85, .12 * vol, 'sine'); },
  ore: () => { tone(880, 1320, .09, .18, 'triangle'); },
  blip: () => { tone(660, 660, .05, .12); },
  deny: () => { tone(160, 110, .16, .2); },
  place: () => { tone(220, 440, .14, .2, 'triangle'); noise(.1, 500, .2); },
  built: () => { tone(440, 440, .09, .18, 'triangle'); later(() => tone(660, 660, .14, .18, 'triangle'), 90); },
  jump: () => { noise(.3, 4000, .22, 'highpass'); tone(200, 1200, .22, .14, 'sine'); },
  card: () => { noise(.2, 300, .5); tone(110, 55, .3, .35, 'sawtooth'); },
  alarm: () => { tone(520, 520, .18, .22); later(() => tone(390, 390, .22, .22), 200); },
  callout: () => { tone(520, 780, .08, .14, 'triangle'); },
  /** Magazine out, magazine in, then the bolt, spread across however long this gun takes. */
  reload: (dur = 1.5) => { noise(.05, 3000, .25, 'highpass'); tone(500, 300, .03, .08); later(() => { noise(.07, 1400, .32, 'bandpass'); tone(180, 120, .05, .16, 'square'); }, dur * 520); later(() => { noise(.04, 3600, .3, 'highpass'); tone(700, 900, .04, .1, 'triangle'); }, dur * 860); },
  // Each gun the player fires has its own voice. `low` rises from 0 to 1 over the last quarter of the magazine, so the gun sounds emptier as it runs dry.
  rifle: (low = 0) => { noise(.11, 2400, .5); tone(240 + low * 140, 60, .08, .26, 'sawtooth'); noise(.3, 520, .12); },
  pistol: (low = 0) => { noise(.07, 3400, .42, 'bandpass'); tone(420 + low * 160, 120, .06, .22, 'square'); noise(.2, 700, .08); },
  sniper: () => { noise(.08, 5000, .5, 'highpass'); noise(.5, 700, .7); tone(110, 30, .4, .5, 'sine'); tone(900, 200, .06, .2, 'sawtooth'); later(() => { noise(.05, 2800, .22, 'bandpass'); later(() => noise(.06, 1900, .26, 'bandpass'), 170); }, 420); },
  scatter: () => { noise(.3, 1100, .85); tone(130, 36, .24, .5, 'sawtooth'); noise(.07, 4200, .3, 'highpass'); later(() => noise(.05, 2600, .22, 'bandpass'), 330); later(() => { noise(.06, 1500, .26, 'bandpass'); tone(160, 110, .04, .12, 'square'); }, 470); },
  cannon: () => { noise(.22, 800, .8); tone(95, 30, .26, .6, 'sine'); tone(300, 80, .08, .3, 'square'); noise(.4, 300, .25); },
  dry: () => { tone(1100, 900, .03, .12, 'square'); noise(.03, 5000, .15, 'highpass'); },
  kill: () => { tone(660, 990, .07, .16, 'triangle'); later(() => tone(990, 1480, .1, .14, 'triangle'), 60); },
  win: () => { [523, 659, 784, 1046].forEach((f, i) => later(() => tone(f, f, .25, .2, 'triangle'), i * 140)); },
  lose: () => { [392, 330, 262, 196].forEach((f, i) => later(() => tone(f, f, .3, .2, 'sawtooth'), i * 180)); },
};
export function drillSound(on: boolean, biting: boolean) {
  if (!ctx || !master || !level) return;
  if (on && !drillOsc) { drillOsc = ctx.createOscillator(); drillGain = ctx.createGain(); drillOsc.type = 'sawtooth'; drillGain.gain.value = .0001; drillOsc.connect(drillGain); drillGain.connect(master); drillOsc.start(); }
  if (drillOsc && drillGain) { const t = ctx.currentTime; drillGain.gain.setTargetAtTime(on ? (biting ? .13 : .06) : .0001, t, .04); drillOsc.frequency.setTargetAtTime(biting ? 95 + Math.random() * 20 : 150, t, .05); }
}

// ---------------------------------------------------------------- music
// A small step sequencer: dusty bass and a twangy lead when calm, drums and a driving bass when it kicks off.
const ROOTS = [73.42, 73.42, 87.31, 65.41], LEAD = [0, 3, 5, 7, 10, 12, 7, 5], BASS = [0, -1, 0, 7, 0, -1, 10, 7, 0, -1, 0, 7, 12, -1, 10, 7];
function voice(t: number, f: number, dur: number, peak: number, type: OscillatorType, cut: number) {
  if (!ctx || !music) return; const o = ctx.createOscillator(), g = ctx.createGain(), fl = ctx.createBiquadFilter();
  o.type = type; o.frequency.setValueAtTime(f, t); fl.type = 'lowpass'; fl.frequency.setValueAtTime(cut, t); fl.frequency.exponentialRampToValueAtTime(Math.max(120, cut * .3), t + dur);
  g.gain.setValueAtTime(.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + .008); g.gain.exponentialRampToValueAtTime(.0001, t + dur); o.connect(fl); fl.connect(g); g.connect(music); o.start(t); o.stop(t + dur + .05);
}
function drum(t: number, freq: number, dur: number, peak: number, type: BiquadFilterType) {
  if (!ctx || !music || !noiseBuf) return; const s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
  s.buffer = noiseBuf; f.type = type; f.frequency.value = freq; g.gain.setValueAtTime(peak, t); g.gain.exponentialRampToValueAtTime(.0001, t + dur); s.connect(f); f.connect(g); g.connect(music); s.start(t, Math.random() * .5, dur + .02);
}
function tick() {
  if (!ctx || !music || ctx.state !== 'running') return; const now = ctx.currentTime;
  moodNow += (mood - moodNow) * .12; music.gain.setTargetAtTime(mood > .05 && musicOn ? .5 : .0001, now, .4);
  if (nextT < now) nextT = now + .05;
  while (nextT < now + .25) {
    const hot = moodNow > .55, spb = 60 / (hot ? 118 : 96) / 4, i = step % 16, bar = Math.floor(step / 16), root = ROOTS[bar % 4] * 1, t = nextT, semi = (n: number) => Math.pow(2, n / 12);
    if (moodNow > .05) {
      const b = BASS[i]; if (b >= 0 && (hot || i % 4 === 0 || i === 10)) voice(t, root * semi(b), hot ? spb * 1.6 : spb * 3.5, hot ? .3 : .2, 'sawtooth', hot ? 900 : 420);
      if (i === 0 && bar % 2 === 0) { voice(t, root * 2 * semi(7), spb * 30, .035, 'sawtooth', 700); voice(t, root * 2 * semi(3), spb * 30, .03, 'triangle', 900); }
      if (!hot && (i % 4 === 2 || i === 15) && (bar + i) % 3 !== 0) voice(t, root * 4 * semi(LEAD[(step * 5 + bar * 3) % 8]), spb * 3, .05, 'square', 1500);
      if (hot) { if (i % 8 === 0 || i === 10) { voice(t, 110, .16, .5, 'sine', 400); drum(t, 200, .1, .25, 'lowpass'); } if (i % 8 === 4) drum(t, 1800, .14, .22, 'bandpass'); if (i % 2 === 0) drum(t, 7000, .03, .07 + (i % 4 === 2 ? .05 : 0), 'highpass'); if (moodNow > .8 && i % 4 === 3) voice(t, root * 4 * semi(LEAD[(step + bar) % 8]), spb * 1.5, .05, 'square', 2200); }
      else if (i % 8 === 4) drum(t, 5000, .05, .04, 'highpass');
    }
    step++; nextT += spb;
  }
}

// ---------------------------------------------------------------- voices
const VOICE: Record<string, [number, OscillatorType]> = { Quartermaster: [150, 'sawtooth'], Lookout: [290, 'square'], Alpha: [200, 'square'], 'Alpha Lead': [200, 'square'], Linesman: [230, 'square'], Breacher: [115, 'sawtooth'], Rigger: [330, 'triangle'] };
let voiceT = 0;
/** A few syllables of gibberish in the speaker's register, so lines in the feed feel spoken. */
export function babble(who: string, len: number) {
  const v = VOICE[who]; if (!ctx || !master || !v || !level || seat) return; const now = ctx.currentTime; if (now < voiceT) return;
  const n = Math.max(3, Math.min(9, Math.round(len / 9))); let t = now + .02;
  for (let i = 0; i < n; i++) {
    const o = ctx.createOscillator(), g = ctx.createGain(), f = ctx.createBiquadFilter(), d = .05 + Math.random() * .05, hz = v[0] * (1 + (Math.random() - .4) * .5);
    o.type = v[1]; o.frequency.setValueAtTime(hz, t); o.frequency.linearRampToValueAtTime(hz * (.85 + Math.random() * .3), t + d); f.type = 'bandpass'; f.frequency.value = 700 + Math.random() * 900; f.Q.value = 2;
    g.gain.setValueAtTime(.0001, t); g.gain.exponentialRampToValueAtTime(.09, t + .012); g.gain.exponentialRampToValueAtTime(.0001, t + d); o.connect(f); f.connect(g); g.connect(master); o.start(t); o.stop(t + d + .03); t += d + .015 + (Math.random() < .2 ? .06 : 0);
  }
  voiceT = t + .25;
}
