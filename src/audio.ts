// Sound effects: recorded and designed CC0 samples (assets/sfx, sources in assets/sfx/CREDITS.md),
// layered with a little synthesised weight underneath. If the samples cannot be decoded the old
// all-synth set plays instead, so the game is never silent.
import BANK from 'sfx:bank';
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

/** Stops every drill and lets the music settle. For leaving a match, pausing, or anything else that stops the players mid-action. */
export function hush() {
  drills[seat] = [drillOsc, drillGain]; moods[0] = moods[1] = 0; mood = 0;
  if (ctx) for (const d of drills) if (d[1]) d[1].gain.setTargetAtTime(.0001, ctx.currentTime, .04);
}

export function initAudio() {
  if (ctx) { ctx.resume(); return; }
  try {
    ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    master = ctx.createGain(); master.gain.value = volume; const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 4; comp.knee.value = 12;
    // a little warmth on the whole mix: more chest in the lows, the brittle top eased off
    const warm = ctx.createBiquadFilter(), soft = ctx.createBiquadFilter(); warm.type = 'lowshelf'; warm.frequency.value = 140; warm.gain.value = 3; soft.type = 'highshelf'; soft.frequency.value = 7000; soft.gain.value = -3;
    master.connect(warm); warm.connect(soft); soft.connect(comp); comp.connect(ctx.destination); loadBank();
    music = ctx.createGain(); music.gain.value = .0001; music.connect(master); setInterval(tick, 90);
    // a bed of desert wind that never quite repeats
    const w = ctx.createBufferSource(), wf = ctx.createBiquadFilter(), wg = ctx.createGain(), lfo = ctx.createOscillator(), lg = ctx.createGain();
    w.buffer = noiseBuf; w.loop = true; wf.type = 'bandpass'; wf.frequency.value = 420; wf.Q.value = .6; wg.gain.value = .035; lfo.frequency.value = .13; lg.gain.value = 190;
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
/** The all-synthesised set, kept as the fallback. `vol` 0..1 lets distant events play quieter. */
const synth = {
  shot: (vol = 1) => { noise(.12, 2200, .5 * vol); tone(220, 60, .09, .25 * vol, 'sawtooth'); },
  turret: (vol = 1) => { noise(.16, 1200, .4 * vol); tone(140, 50, .12, .25 * vol, 'sawtooth'); },
  hit: (vol = 1) => { noise(.06, 900, .35 * vol, 'bandpass'); },
  slash: (vol = 1) => { noise(.18, 3200, .3 * vol, 'highpass'); tone(900, 300, .16, .12 * vol, 'sine'); },
  ko: (vol = 1, veyl = true) => { if (veyl) { tone(900, 120, .35, .22 * vol, 'sine'); tone(1350, 200, .3, .1 * vol, 'triangle'); noise(.25, 2600, .2 * vol, 'highpass'); } else { tone(300, 60, .3, .3 * vol, 'triangle'); noise(.25, 600, .3 * vol); } },
  step: (heavy = false, walker = false) => { noise(.07, heavy ? 260 : 420, heavy ? .16 : .1); },
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
  bank: () => { tone(660, 990, .12, .18, 'triangle'); },
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
  // A bullet landing on a body. `kind` 0 is Ironhold plate, 1 Veyl crystal, 2 Gloam hide, 3 a shield.
  impact: (vol = 1, kind = 0, heavy = false) => { noise(.05, kind === 1 ? 3600 : kind === 2 ? 500 : 1400, .3 * vol, kind === 2 ? 'lowpass' : 'bandpass'); if (heavy) tone(160, 60, .09, .2 * vol, 'sine'); },
  // A bullet landing on the world. `kind` 0 dirt, 1 rock, 2 metal, 3 crystal, 4 Gloam growth.
  ricochet: (vol = 1, kind = 0) => { noise(.05, kind === 0 ? 700 : 2600, .25 * vol, 'bandpass'); if (kind === 2) tone(2400, 900, .12, .06 * vol, 'sine'); },
  // A body hitting the ground. `kind` 0 a person, 1 a Gloam body, 2 a walker or anything that size.
  bodyfall: (vol = 1, kind = 0) => { noise(.14, kind === 2 ? 240 : 420, (kind === 2 ? .7 : .4) * vol); tone(kind === 2 ? 80 : 120, 40, .16, .3 * vol, 'sine'); },
  // Veyl crystal giving way. `crack` is the small warning crack before the break.
  shatter: (vol = 1, big = false, crack = false) => { noise(crack ? .06 : .3, 4200, (crack ? .2 : .4) * vol, 'highpass'); if (!crack) tone(big ? 500 : 900, 120, .3, .2 * vol, 'sine'); },
  // A Gloam body bursting or being opened up.
  splat: (vol = 1, big = false) => { noise(big ? .28 : .14, 520, (big ? .6 : .35) * vol); tone(200, 70, .12, .15 * vol, 'sine'); },
};

// ---------------------------------------------------------------- samples
// How the new set is mixed, after the way ASMR and foley recordists work: every sound is close and dry
// (no room), the top is damped so it lands as a deep "thock" rather than a bright clack, and the weight
// sits in the low end. Each action layers a real transient (the click, the crack, the knock) over a body
// (a thump or a sub tone). Every play picks a different take and nudges its pitch, so a sound heard fifty
// times a minute never turns into a machine gun of the same file.
const bank: Record<string, AudioBuffer[]> = {}, lastPick: Record<string, number> = {};
let ready = false;
function loadBank() {
  if (!ctx) return; const c = ctx, keys = Object.keys(BANK); let left = keys.length; if (!left) return;
  for (const k of keys) {
    const bin = atob(BANK[k]), bytes = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const group = k.replace(/_\d+$/, '');
    c.decodeAudioData(bytes.buffer).then(b => { (bank[group] = bank[group] || []).push(b); if (--left === 0) ready = !!bank.crack; }, () => { left = -1; });
  }
}
type Opt = { rate?: number, at?: number, lp?: number, jit?: number };
/** Plays a take from a group of samples. `lp` closes a low pass on it (distant sounds are duller), `at` delays it in seconds. */
function S(name: string, peak: number, o: Opt = {}) {
  peak *= level; const list = bank[name]; if (!ctx || !master || !list || peak < .004) return;
  let i = Math.floor(Math.random() * list.length); if (list.length > 1 && i === lastPick[name]) i = (i + 1) % list.length; lastPick[name] = i;
  const t = ctx.currentTime + (o.at || 0), src = ctx.createBufferSource(), g = ctx.createGain(), jit = o.jit ?? .05;
  src.buffer = list[i]; src.playbackRate.value = (o.rate || 1) * (1 + (Math.random() * 2 - 1) * jit); g.gain.value = peak;
  let tail: AudioNode = src; if (o.lp && o.lp < 16000) { const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = o.lp; f.Q.value = .5; src.connect(f); tail = f; }
  tail.connect(g); g.connect(master); src.start(t);
}
/** A short sine drop for weight under a transient: felt more than heard. */
function sub(f0: number, f1: number, dur: number, peak: number, at = 0) {
  peak *= level; if (!ctx || !master || peak < .004) return;
  const t = ctx.currentTime + at, o = ctx.createOscillator(), g = ctx.createGain();
  o.type = 'sine'; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
  g.gain.setValueAtTime(.0001, t); g.gain.exponentialRampToValueAtTime(Math.max(peak, .0002), t + .004); g.gain.exponentialRampToValueAtTime(.0001, t + dur);
  o.connect(g); g.connect(master); o.start(t); o.stop(t + dur + .05);
}
/** Far away sounds lose their top end before they lose their level. */
const far = (v: number) => 900 + 13000 * Math.min(1, v) ** 1.6;
/** A soft, low chime for rewards: sine with a quick bloom, no buzz. */
function chime(f: number, dur: number, peak: number, at = 0) { sub(f, f * .995, dur, peak, at); sub(f * 2, f * 1.99, dur * .6, peak * .25, at); }

const sampled: typeof synth = {
  shot: (v = 1) => { S('crack', .4 * v, { lp: far(v), rate: .95 }); S('knock_hard', .28 * v, { lp: far(v) }); sub(95, 45, .08, .16 * v); },
  turret: (v = 1) => { S('crack', .38 * v, { lp: far(v), rate: .8 }); S('knock_hard', .4 * v, { lp: far(v), rate: .8 }); sub(80, 38, .12, .22 * v); },
  hit: (v = 1) => { S('punch', .6 * v, { rate: 1.05 }); S('pebble', .14 * v, { rate: 1.1 }); },
  slash: (v = 1) => { S('slice', .3 * v, { lp: far(v) }); S('swish', .3 * v, { lp: far(v) }); },
  ko: (v = 1, veyl = true) => {
    if (veyl) { S('glass', .5 * v, { lp: far(v), rate: .85 }); S('field', .28 * v, { lp: far(v), rate: 1.3 }); sub(180, 60, .3, .18 * v); }
    else { S('punch_heavy', .55 * v, { lp: far(v) }); S('thud_soft', .45 * v, { at: .05 }); S('cloth', .2 * v, { lp: far(v) }); }
  },
  step: (heavy = false, walker = false) => {
    if (walker) { S('stomp', .55, { rate: .9 }); S('plate', .1, { rate: .6 }); sub(70, 32, .18, .3); }
    else if (heavy) { S('step', .24, { rate: .82, lp: 5000, jit: .08 }); S('thud_soft', .14, { rate: 1.2 }); }
    else S('step', .2, { lp: 6000, jit: .1 });
  },
  crit: () => { S('tink', .26, { rate: 1.15 }); chime(1320, .12, .05); },
  streak: (n: number) => { [0, 4, 7, 12].slice(0, Math.min(4, n)).forEach((st, i) => { S('knock', .22, { at: i * .07, rate: Math.pow(2, st / 12), jit: 0 }); chime(440 * Math.pow(2, st / 12), .16, .07, i * .07); }); },
  boom: (v = 1) => { const lp = far(v); S('crunch', .75 * v, { lp }); S('boom', .55 * v, { lp: Math.min(lp, 4000) }); if (v > .3) S('rumble', .35 * v, { at: .02 }); sub(70, 28, .5, .3 * v); },
  blast: (v = 1) => { const lp = far(v); S('crunch', .4 * v, { lp, rate: 1.25 }); S('knock_hard', .45 * v, { lp, rate: .85 }); sub(110, 40, .16, .25 * v); },
  clang: () => { S('metal', .5); S('plate', .32, { rate: 1.1 }); },
  hurt: () => { S('punch_heavy', .55, { rate: .95 }); sub(120, 55, .16, .3); },
  throw: () => { S('swish', .4); S('cloth', .14); },
  zap: (v = 1) => { S('zap', .42 * v, { lp: far(v) }); },
  dash: (v = 1) => { S('whoosh', .45 * v, { lp: far(v), rate: .9 }); S('cloth', .16 * v); },
  charge: (v = 1) => { S('field', .5 * v, { lp: far(v), rate: .8 }); S('beam', .25 * v, { lp: far(v), rate: .7, at: .55 }); sub(50, 110, .85, .14 * v); },
  ore: () => { S('mine', .42, { jit: .07 }); S('pebble', .22, { at: .045, rate: .85, jit: .12 }); },
  bank: () => { S('pour', .42, { rate: .72 }); S('thunk', .4); sub(90, 50, .2, .15); },
  blip: () => { S('rocker', .42); },
  deny: () => { S('denied', .34); S('off', .3); },
  place: () => { S('thunk', .55); S('latch', .34, { at: .06 }); },
  built: () => { S('lock', .75); S('thunk', .32, { at: .3 }); chime(330, .3, .06, .36); chime(495, .35, .05, .44); },
  jump: () => { S('whoosh', .38, { rate: .8 }); S('field', .2, { rate: 1.5 }); S('cloth', .18, { at: .08 }); },
  card: () => { S('thud_soft', .6); S('knock_deep', .3); S('card', .42); },
  alarm: () => { S('bell', .42, { lp: 5000 }); S('bell', .34, { at: .32, rate: .84, lp: 4500 }); },
  callout: () => { S('rocker_soft', .38); S('knock', .18, { rate: 1.4 }); },
  reload: (dur = 1.5) => {
    S('mag_out', .4); S('cloth', .1);
    S('mag_in', .42, { at: dur * .52 }); S('latch', .3, { at: dur * .52 + .02 });
    S('bolt', .5, { at: dur * .86 }); S('act_light', .28, { at: dur * .86 + .05 });
  },
  rifle: (low = 0) => { S('crack', .5, { rate: 1 + low * .08 }); S('knock_hard', .42 * (1 - low * .4)); sub(78, 38, .1, .34 * (1 - low * .3)); S('act_light', .1, { at: .03, rate: 1.1 }); },
  pistol: (low = 0) => { S('crack', .42, { rate: 1.28 + low * .1 }); S('knock_hard', .24, { rate: 1.35 }); sub(120, 60, .06, .2); S('act_light', .16, { at: .02, rate: 1.25 }); },
  sniper: () => { S('crack_tail', .6); S('drum', .5); S('knock_deep', .45); sub(105, 30, .45, .4); S('act_heavy', .3, { at: .42 }); S('bolt', .4, { at: .6 }); },
  scatter: () => { S('crack', .5, { rate: .72 }); S('knock_deep', .55); S('knock_hard', .5, { rate: .78 }); S('crack_tail', .26, { rate: .8 }); sub(85, 30, .26, .38); S('slide', .32, { at: .33 }); S('latch', .44, { at: .47 }); },
  cannon: () => { S('drum', .55, { rate: 1.1 }); S('crunch', .32, { rate: 1.35 }); S('knock_hard', .5, { rate: .7 }); sub(80, 28, .3, .4); },
  dry: () => { S('dry', .8); S('off', .3); },
  kill: () => { S('knock', .45, { rate: .9, jit: .02 }); S('space', .28); chime(660, .14, .05, .03); },
  win: () => { [523, 659, 784, 1046].forEach((f, i) => { chime(f / 2, .5, .12, i * .14); S('knock', .2, { at: i * .14, rate: f / 523, jit: 0 }); }); S('bell', .3, { at: .56, lp: 6000 }); },
  lose: () => { [392, 330, 262, 196].forEach((f, i) => chime(f / 2, .55, .18, i * .18)); S('knock_deep', .4, { at: .72 }); },
  impact: (v = 1, kind = 0, heavy = false) => {
    const lp = far(v);
    if (kind === 3) { S('zap', .2 * v, { lp, rate: 1.5, jit: .12 }); S('tink', .12 * v, { lp, rate: 1.5 }); }
    else if (kind === 1) { S('glass', .26 * v, { lp, rate: 1.55, jit: .12 }); S('tink', .2 * v, { lp, rate: .9, jit: .1 }); if (heavy) S('crunch', .2 * v, { lp, rate: 1.5 }); }
    else if (kind === 2) { S('punch', .4 * v, { lp: Math.min(lp, 3800), rate: .8, jit: .1 }); S('slice', .2 * v, { lp: Math.min(lp, 3000), rate: .62, jit: .12 }); if (heavy) S('crunch', .24 * v, { lp: 2400, rate: .7 }); }
    else { S('punch', .36 * v, { lp, rate: 1.12, jit: .1 }); S('plate', .2 * v, { lp, rate: 1.5, jit: .14 }); if (heavy) { S('metal', .26 * v, { lp, rate: 1.15 }); S('punch_heavy', .3 * v, { lp }); } }
    if (heavy) sub(110, 48, .1, .2 * v);
  },
  ricochet: (v = 1, kind = 0) => {
    const lp = far(v);
    if (kind === 0) { S('pebble', .3 * v, { lp, rate: .8, jit: .2 }); S('thud_soft', .16 * v, { lp: Math.min(lp, 3000), rate: 1.5, jit: .15 }); }
    else if (kind === 1) { S('pebble', .34 * v, { lp, rate: 1.15, jit: .2 }); S('knock', .14 * v, { lp, rate: 1.6, jit: .15 }); }
    else if (kind === 2) { S('tink', .3 * v, { lp, rate: 1.1, jit: .2 }); S('metal', .2 * v, { lp, rate: 1.5, jit: .15 }); if (Math.random() < .35) { sub(2600 + Math.random() * 900, 1200, .16, .05 * v, .01); sub(3900, 2100, .12, .02 * v, .01); } }
    else if (kind === 3) { S('glass', .22 * v, { lp, rate: 1.7, jit: .15 }); S('tink', .2 * v, { lp, rate: 1.3, jit: .15 }); }
    else { S('slice', .22 * v, { lp: Math.min(lp, 3200), rate: .7, jit: .15 }); S('punch', .2 * v, { lp: Math.min(lp, 3000), rate: .7 }); }
  },
  bodyfall: (v = 1, kind = 0) => {
    const lp = far(v);
    if (kind === 2) { S('stomp', .7 * v, { lp, rate: .7 }); S('crunch', .5 * v, { lp, rate: .8 }); S('metal', .4 * v, { lp, rate: .6 }); S('plate', .3 * v, { lp, rate: .55, at: .08 }); sub(62, 26, .4, .4 * v); }
    else if (kind === 1) { S('thud_soft', .4 * v, { lp: Math.min(lp, 4000), rate: .9, jit: .1 }); S('slice', .14 * v, { lp: Math.min(lp, 2600), rate: .6 }); sub(90, 45, .12, .14 * v); }
    else { S('thud_soft', .5 * v, { lp, rate: .85, jit: .1 }); S('cloth', .22 * v, { lp, jit: .1 }); S('plate', .1 * v, { lp, rate: 1.25, at: .03, jit: .15 }); sub(84, 40, .14, .2 * v); }
  },
  shatter: (v = 1, big = false, crack = false) => {
    const lp = far(v);
    if (crack) { S('tink', .26 * v, { lp, rate: 1.4, jit: .2 }); S('glass', .16 * v, { lp, rate: 1.9, jit: .15 }); return; }
    S('glass', .6 * v, { lp, rate: big ? .6 : .95 }); S('glass', .34 * v, { lp, rate: big ? .85 : 1.4, at: .05 }); S('crunch', .34 * v, { lp, rate: big ? .9 : 1.5 }); S('tink', .2 * v, { lp, rate: .8, at: .16, jit: .2 }); S('pebble', .2 * v, { lp, rate: 1.3, at: .24, jit: .2 });
    sub(big ? 120 : 190, big ? 34 : 60, big ? .6 : .3, (big ? .4 : .2) * v); if (big) { S('boom', .4 * v, { lp: Math.min(lp, 3500) }); S('field', .3 * v, { lp, rate: .6 }); }
  },
  splat: (v = 1, big = false) => {
    const lp = Math.min(far(v), 4200);
    S('punch_heavy', (big ? .55 : .38) * v, { lp, rate: big ? .7 : .9 }); S('slice', (big ? .34 : .22) * v, { lp, rate: .55, jit: .12 }); S('crunch', (big ? .4 : .18) * v, { lp: 2200, rate: .6 });
    if (big) { S('pour', .3 * v, { lp: 2600, rate: .8, at: .05 }); sub(100, 36, .25, .3 * v); }
  },
};
/** Every sound effect. Plays the sampled set once it has decoded, the synthesised one until then. */
export const soundsReady = () => ready;
/** Both sets, for the sound board (tools/sfx/board.ts). */
export const sets = { synth, sampled };
export const sfx: typeof synth = new Proxy(synth, { get: (t, k: string) => (ready ? sampled : t)[k] });

export function drillSound(on: boolean, biting: boolean) {
  if (!ctx || !master || !level) return;
  if (on && !drillOsc) { drillOsc = ctx.createOscillator(); drillGain = ctx.createGain(); const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 700; lp.Q.value = 1.5; drillOsc.type = 'sawtooth'; drillGain.gain.value = .0001; drillOsc.connect(lp); lp.connect(drillGain); drillGain.connect(master); drillOsc.start(); }
  if (drillOsc && drillGain) { const t = ctx.currentTime; drillGain.gain.setTargetAtTime(on ? (biting ? .16 : .07) * level : .0001, t, .04); drillOsc.frequency.setTargetAtTime(biting ? 70 + Math.random() * 16 : 110, t, .05); }
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
