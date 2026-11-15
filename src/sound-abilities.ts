// A sound for every ability, wind-up and flier, and the beds under a match (wind, night, the Bloom).
// Played from the look of a cast (core/ability.ts showCast), so it is heard on every screen that sees it, online too, and from
// tickSound (game.render), which watches for wind-ups, fliers and the hour. For show only: no rule reads anything here.
//
// The three sides each have a voice, so a cast tells you who did it with your eyes shut:
//   Ironhold  machines. Ratchets, latches, hatches, hammers, engines, radio. Dry and heavy, with a sub thump under each lock.
//   Veyl      glass and song. Soft sine bells tuned to one scale (D minor pentatonic), so any two casts at once still sound
//             like a chord, with a glass touch on top for the "tink".
//   Gloam     wet and alive. Recorded mud, slime, bubbles and dirt, pitched down, with soft round pops.
// Each recipe takes `v`, the 0..1 level for how far off it is, and plays placed left or right of the listener.
import type { Game } from './game';
import type { Unit, Building } from './data';
import { UNIT, fac } from './data';
import type { AbilityDef, Target } from './core/ability';
import { kit, panOf, loop, setEar, setWind, type Loop } from './audio';
import { ENV } from './light';

const { S, sub, swell, bell, chime, far } = kit;
/** What has played, for tests and the sound check (tools/sfx/match.mjs reads it as window.__sfx). */
export const soundStats = { casts: {} as Record<string, number>, winds: 0, engines: 0 };
(globalThis as any).__sfx = soundStats;
type R = (v: number) => void;
// the Veyl scale: D minor pentatonic over three octaves
const D = 146.83, NOTE = (n: number) => { const st = [0, 3, 5, 7, 10][((n % 5) + 5) % 5] + 12 * Math.floor(n / 5); return D * Math.pow(2, st / 12); };

// ---------------------------------------------------------------- building blocks per side
const iron = {
  /** a heavy part moving into place: shutter, then the lock, with weight under it */
  clunk: (v: number, at = 0, rate = 1) => { S('shutter', .38 * v, { at, rate, lp: far(v) }); S('lock', .4 * v, { at: at + .06, rate: rate * .9, lp: far(v) }); sub(85, 40, .14, .22 * v, at + .06); },
  ratchet: (v: number, at = 0, rate = 1) => S('ratchet', .36 * v, { at, rate, lp: far(v) }),
  /** a diesel rev: a noise band sweeping up with a low tone under it */
  rev: (v: number, at = 0, len = .6) => { swell(len, 140, 700, .14 * v, at, 2.2, .7); sub(48, 95, len, .16 * v, at); },
  hiss: (v: number, at = 0, len = .35) => swell(len, 3200, 1600, .1 * v, at, .6, .08),
};
const veyl = {
  /** a struck glass bell on a scale step, with a glass touch for the strike */
  ring: (v: number, n: number, at = 0, len = 1.1, peak = .09) => { bell(NOTE(n), len, peak * v, at); S('gtouch', .2 * v, { at, rate: NOTE(n) / 440 * 1.3, jit: .02, lp: far(v) }); },
  chord: (v: number, ns: number[], at = 0, step = .07, len = 1.4) => ns.forEach((n, i) => veyl.ring(v, n, at + i * step, len, .07)),
  air: (v: number, at = 0, len = .6) => swell(len, 5200, 2600, .05 * v, at, .7, .4),
};
const gloam = {
  squelch: (v: number, at = 0, rate = .85) => S('squelch', .5 * v, { at, rate, jit: .1, lp: Math.min(far(v), 4500) }),
  goo: (v: number, at = 0, rate = .8) => S('goo', .5 * v, { at, rate, jit: .1, lp: Math.min(far(v), 4200) }),
  pop: (v: number, at = 0, rate = 1) => S('pop', .45 * v, { at, rate, jit: .08, lp: far(v) }),
  bubble: (v: number, at = 0, rate = .8) => S('bubble', .35 * v, { at, rate, lp: Math.min(far(v), 3600) }),
  dirt: (v: number, at = 0, rate = .9) => S('dirt', .5 * v, { at, rate, jit: .1, lp: Math.min(far(v), 2800) }),
  spores: (v: number, at = 0, len = .8) => swell(len, 1600, 500, .1 * v, at, .7, .2),
};

// ---------------------------------------------------------------- the casts
const dig: R = v => { gloam.dirt(v); gloam.dirt(v * .8, .16, .75); gloam.squelch(v * .6, .1, .6); sub(70, 38, .3, .2 * v, .05); };
const ripen: R = v => { S('inflate', .45 * v, { rate: .8 }); S('grow', .4 * v, { at: .3, rate: .75 }); gloam.goo(v, .1); gloam.bubble(v * .8, .45); gloam.squelch(v, .75, .7); gloam.pop(v * .8, .9, .7); sub(55, 90, .9, .14 * v); };
const root: R = v => { gloam.dirt(v, 0, .7); S('creak', .25 * v, { at: .08, rate: .55, lp: 2400 }); gloam.squelch(v * .7, .2, .6); sub(60, 32, .45, .25 * v, .05); };
const hopIn: R = v => { gloam.squelch(v * .8, 0, .9); gloam.pop(v * .7, .1, .8); gloam.bubble(v * .5, .15); };
const hopOut: R = v => { gloam.pop(v * .8, 0, .65); gloam.squelch(v * .7, .08, .75); };
const groundIron: R = v => { iron.clunk(v * .9, 0); S('slider', .3 * v, { at: .1, lp: far(v) }); iron.clunk(v, .38, .85); S('thunk', .35 * v, { at: .45 }); };
const step: R = v => { S('suck', .38 * v, { rate: 1.2, lp: far(v) }); S('appear', .3 * v, { at: .16, lp: far(v) }); veyl.ring(v, 12, .18, .5, .05); };

export const CAST: Record<string, R> = {
  // ---- Ironhold
  'linesman.overtime': v => { iron.ratchet(v); iron.ratchet(v * .8, .12, 1.15); iron.rev(v, .1, .7); S('power_up', .25 * v, { rate: .8, at: .05, lp: far(v) }); },
  'gantry.flak': groundIron, 'gantryflak.ground': groundIron,
  'longshot.ghillie': v => { S('cloth', .4 * v, { rate: .8 }); gloam.dirt(v * .5, .1, 1.2); S('leather', .25 * v, { at: .22, rate: .9 }); swell(.7, 2600, 900, .05 * v, .05, .6, .3); },
  'longshot.tranq': v => { S('poof', .45 * v, { rate: 1.2, lp: far(v) }); iron.hiss(v * 2, 0, .3); S('glass', .3 * v, { at: .02, rate: 1.5, lp: far(v) }); S('thud_soft', .4 * v, { rate: 1.2 }); sub(160, 70, .12, .25 * v); },
  'longshot.deep': v => { S('rumble', .5 * v, { lp: 2500 }); S('crunch', .45 * v, { rate: .7, lp: Math.min(far(v), 3500) }); S('drum', .4 * v, { rate: .8, at: .03, lp: 3000 }); sub(45, 24, 1.4, .4 * v); },
  'patch.painkiller': v => { S('rummage', .28 * v, { rate: .9, lp: far(v) }); S('gtouch', .3 * v, { at: .12, rate: .8 }); iron.hiss(v * .8, .24, .16); chime(220, .5, .05 * v, .3); },
  'patch.pulse': v => { S('power_up', .3 * v, { rate: .75, lp: 3500 }); [220, 277.2, 329.6].forEach((f, i) => chime(f, 1.1, .07 * v, .1 + i * .06)); swell(.9, 900, 400, .05 * v, .05, .6, .4); },
  'sapper.mine': v => { gloam.dirt(v, 0, 1); gloam.dirt(v * .7, .14, .85); S('latch', .32 * v, { at: .3 }); S('lock_light', .3 * v, { at: .42 }); S('ui_clip', .2 * v, { at: .62, rate: .9 }); S('ui_clip', .16 * v, { at: .82, rate: .9 }); },
  'sapper.satchel': v => { S('leather', .45 * v, { rate: .85 }); sub(90, 45, .12, .2 * v); S('latch', .3 * v, { at: .14 }); S('ui_clip', .2 * v, { at: .34 }); S('ui_clip', .2 * v, { at: .52 }); },
  'dustbike.kick': v => { S('knock_hard', .4 * v, { rate: 1.2, lp: far(v) }); iron.rev(v * 1.2, .04, .55); S('thrust', .25 * v, { at: .06, rate: 1.4, lp: Math.min(far(v), 3000) }); iron.ratchet(v * .7, .1, 1.3); },
  'piledriver.anchor': v => { S('slam', .5 * v, { rate: .8, lp: far(v) }); iron.ratchet(v, .12, .8); S('hammer', .32 * v, { at: .3, rate: .7, lp: far(v) }); S('metal', .25 * v, { at: .32, rate: .6 }); sub(60, 28, .5, .4 * v, .3); },
  'piledriverset.lift': v => { S('spring', .3 * v, { lp: far(v) }); S('slider', .35 * v, { at: .08, rate: .85, lp: far(v) }); S('creak', .25 * v, { at: .2, rate: .7, lp: 3000 }); S('thunk', .35 * v, { at: .55 }); sub(80, 45, .2, .2 * v, .55); },
  'hopper.afterburn': v => { S('thrust', .5 * v, { lp: far(v) }); S('whoosh', .4 * v, { rate: .7, at: .05, lp: far(v) }); sub(55, 34, .9, .3 * v); },
  'hopper.doors': v => { S('hatch_open', .4 * v, { rate: .85, lp: far(v) }); S('latch', .3 * v, { at: .3 }); sub(90, 50, .12, .15 * v, .3); },
  'flakkite.land': v => { S('thrust', .3 * v, { rate: .8, lp: Math.min(far(v), 2500) }); S('stomp', .45 * v, { at: .35 }); iron.clunk(v * .8, .45); },
  'flakwalker.takeoff': v => { iron.clunk(v * .7, 0, 1.1); S('thrust', .45 * v, { at: .1, lp: far(v) }); S('whoosh', .35 * v, { at: .25, rate: .65, lp: far(v) }); sub(50, 80, .8, .2 * v, .1); },
  'gadfly.cloak': v => { S('poof', .7 * v, { rate: .8, lp: far(v) }); swell(1.4, 3000, 380, .12 * v, 0, .5, .12); S('cloth', .2 * v, { at: .2 }); },
  'surveyor.stake': v => { S('slam', .55 * v, { rate: 1.1, lp: far(v) }); S('hammer', .5 * v, { rate: .8, lp: Math.min(far(v), 4000) }); S('lock', .45 * v, { at: .12, lp: far(v) }); S('thunk', .5 * v, { at: .13 }); sub(120, 45, .16, .35 * v); },
  'surveyor.jam': v => { S('static', .3 * v, { lp: 4500 }); S('scramble', .22 * v, { at: .1, lp: 4000 }); S('radio', .14 * v, { at: .25, rate: .8, lp: 3500 }); },
  'surveyor.flare': v => { S('launch', .45 * v, { lp: far(v) }); swell(1.6, 3800, 2600, .09 * v, .2, 1.2, .1); S('pop', .5 * v, { at: .9, rate: .7 }); sub(300, 120, .3, .12 * v, .9); },
  'claimbarge.foreclose': v => { S('beam', .45 * v, { rate: .6, lp: far(v) }); S('drum', .4 * v, { lp: Math.min(far(v), 3500) }); sub(70, 30, .6, .35 * v); },
  'claimbarge.relocate': v => { S('thrust', .4 * v, { lp: far(v) }); S('whoosh', .35 * v, { rate: .6, at: .2, lp: far(v) }); iron.clunk(v * .8, .05); },
  // ---- Veyl
  'cantor.rush': v => { S('whoosh', .6 * v, { rate: 1.1, lp: far(v) }); S('cloth', .3 * v); veyl.ring(v * 1.6, 10, .05, .5); },
  'lancer.skip': step, 'mute.step': step,
  'tuner.wall': v => { S('crystal', .45 * v, { rate: .8, lp: far(v) }); S('gslide', .3 * v, { at: .05, rate: .8, lp: far(v) }); veyl.chord(v, [5, 8], .02, .05, 2); sub(110, 60, .3, .2 * v); },
  'tuner.hum': v => { veyl.chord(v, [0, 3, 5], 0, .12, 2.2); S('shimmer', .25 * v, { at: .1, rate: .8, lp: far(v) }); },
  'tuner.voice': v => { bell(NOTE(8), 1.2, .1 * v); bell(NOTE(8) * 1.012, 1.2, .08 * v, .03); S('appear', .5 * v, { lp: far(v) }); S('shimmer', .2 * v, { at: .1, lp: far(v) }); },
  'choirmaster.shatter': v => { S('crystal', .8 * v, { rate: 1.1, lp: far(v) }); S('crunch', .3 * v, { rate: 1.6, lp: 4500 }); bell(NOTE(10), .9, .12 * v); bell(NOTE(10) * 1.06, .9, .09 * v, .02); S('glass', .5 * v, { at: .08, rate: 1.2, lp: far(v) }); sub(200, 70, .2, .2 * v); },
  'choirmaster.drain': v => { S('suck', .4 * v, { rate: .8, lp: far(v) }); sub(NOTE(10), NOTE(5), .9, .07 * v); S('field', .25 * v, { at: .2, rate: .7, lp: far(v) }); },
  'choirmaster.join': v => { veyl.chord(v, [0, 2, 4, 5, 7], 0, .14, 2.4); S('shimmer', .3 * v, { at: .3, rate: .7, lp: far(v) }); },
  'knell.toll': v => { S('bellh', .5 * v, { rate: .7, lp: Math.min(far(v), 4500) }); bell(NOTE(-5), 3, .14 * v); bell(NOTE(0), 2.2, .05 * v, .02); sub(55, 50, 1.6, .2 * v); },
  'listener.settle': v => { S('fall', .45 * v, { lp: far(v) }); S('gtouch', .4 * v, { at: .25 }); veyl.ring(v, 3, .25, .9, .12); },
  'ferry.unfold': v => { S('gslide', .35 * v, { rate: .7, lp: far(v) }); S('rise', .25 * v, { lp: far(v) }); veyl.chord(v, [0, 3, 5, 7], .35, .1, 1.8); },
  'ferry.load': v => { S('suck', .35 * v, { lp: far(v) }); veyl.ring(v, 5, .1, .6); veyl.ring(v, 7, .22, .8); },
  'ferry.drop': v => { S('appear', .35 * v, { lp: far(v) }); veyl.ring(v, 7, .05, .6); veyl.ring(v, 5, .17, .8); },
  'swift.lift': v => { S('rise', .3 * v, { lp: far(v) }); S('field', .3 * v, { rate: 1.2, lp: far(v) }); sub(NOTE(5), NOTE(10), .8, .06 * v); },
  'prism.burn': v => { S('magic', .3 * v, { lp: far(v) }); veyl.ring(v, 12, .05, 1); S('field', .25 * v, { at: .1, rate: 1.4, lp: far(v) }); },
  'omen.shrill': v => { S('beam', .5 * v, { rate: 1.3, lp: Math.min(far(v), 5000) }); bell(NOTE(12), .7, .08 * v); S('gtouch', .35 * v, { rate: 1.6 }); },
  'omen.reveal': v => { S('shimmer', .6 * v, { rate: .9, lp: far(v) }); veyl.chord(v, [7, 10, 12], 0, .1, 1.6); veyl.air(v, .1, 1); },
  'omen.stone': v => { S('crystal', .55 * v, { rate: .55, lp: Math.min(far(v), 3000) }); S('thud_soft', .4 * v, { rate: .9 }); bell(NOTE(0), 1.4, .12 * v, .05); },
  'warden.lownote': v => { lowNote(v); },
  'cantus.gather': v => { veyl.chord(v, [5, 7, 10, 12], 0, .12, 2); S('shimmer', .3 * v, { at: .2, rate: .8, lp: far(v) }); veyl.air(v, 0, 1.2); },
  'cantus.hold': v => { bell(NOTE(3), 2.6, .08 * v); bell(NOTE(3) * .985, 2.6, .07 * v, .04); S('fall', .3 * v, { rate: .7, lp: far(v) }); S('field', .25 * v, { rate: .5, lp: far(v) }); },
  // ---- Gloam
  'grazer.dig': dig, 'snapper.dig': dig, 'quillback.dig': dig, 'blister.dig': dig, 'mulcher.dig': dig, 'keeper.dig': dig, 'shellback.dig': dig,
  'lobber.dig': dig, 'needler.dig': dig, 'smother.dig': dig, 'seeder.dig': dig,
  'quillback.ripen': ripen, 'shellback.ripen': ripen, 'bloater.ripen': ripen, 'drifter.ripen': ripen,
  'blister.burst': v => { S('punch_heavy', .5 * v, { rate: .7, lp: Math.min(far(v), 3500) }); gloam.squelch(v * 1.2, 0, .7); S('splash', .4 * v, { at: .02, rate: .8, lp: 4000 }); gloam.pop(v, .01, .5); gloam.goo(v * .8, .12, .7); sub(90, 32, .4, .4 * v); },
  'keeper.seed': v => { gloam.squelch(v * 1.3, 0, .9); gloam.pop(v * 1.2, .12, 1.1); gloam.goo(v, .2); sub(110, 60, .12, .12 * v, .12); },
  'keeper.pod': v => { S('inflate', .3 * v, { rate: 1.3 }); gloam.pop(v, .4, .7); S('thud_soft', .3 * v, { at: .42 }); },
  'keeper.mend': v => { gloam.bubble(v, 0, .9); gloam.goo(v * .5, .1, 1.1); chime(196, .9, .06 * v, .1); chime(293.7, .8, .04 * v, .18); },
  'lobber.bile': v => { gloam.goo(v, 0, .7); S('swish', .35 * v, { at: .02, rate: .8, lp: far(v) }); gloam.squelch(v * .6, .05, .9); },
  'smother.choke': v => { S('poof', .6 * v, { rate: .7, lp: far(v) }); gloam.spores(v); gloam.bubble(v * .6, .1); },
  'smother.mind': v => { gloam.bubble(v, 0, .6); S('morph', .35 * v, { at: .05, rate: .8, lp: far(v) }); sub(70, 50, .9, .12 * v); sub(73, 52, .9, .1 * v, .02); },
  'seeder.fling': v => { S('swish', .4 * v, { rate: .7, lp: far(v) }); gloam.squelch(v, .05); gloam.squelch(v * .8, .17, 1); gloam.pop(v * .6, .25, .8); },
  'hooksail.reel': v => { gloam.goo(v, 0, .6); S('creak', .25 * v, { at: .05, rate: .6, lp: 2600 }); gloam.squelch(v, .35, .8); },
  'hooksail.cloud': v => { S('poof', .4 * v, { rate: .6, lp: far(v) }); gloam.spores(v, 0, 1.2); gloam.pop(v * .5, .2, .6); },
  'hooksail.drink': v => { S('suck', .3 * v, { rate: .7, lp: 3500 }); gloam.bubble(v, .05, .7); gloam.goo(v * .7, .2, .6); },
  'drifter.board': hopIn, 'drifter.drop': hopOut,
  'stingerwalk.root': root, 'puffwalk.root': root,
};
/** Low Note: the Warden's call, cast or fired from the Warden's own body. One very deep bell and the whole field humming. */
export function lowNote(v: number) { if (!kit.ready()) return; bell(NOTE(-10), 2.6, .2 * v); S('bellh', .45 * v, { rate: .5, lp: 3000 }); S('field', .35 * v, { rate: .55 }); sub(55, 46, 1.6, .3 * v); }

// ---------------------------------------------------------------- wind-ups: a body getting ready to cast
const WIND: Record<string, (v: number, t: number) => void> = {
  'longshot.deep': v => { S('radio', .3 * v, { lp: 3500 }); S('static', .15 * v, { at: .5, lp: 3500 }); },
  'claimbarge.foreclose': (v, t) => { S('rise_long', .35 * v, { rate: Math.max(.7, 2.2 / t), lp: far(v) }); swell(t, 120, 600, .1 * v, 0, 2, .9); },
  'claimbarge.relocate': v => { S('power_down', .3 * v, { rate: .8, lp: far(v) }); S('creak', .25 * v, { at: .3, rate: .7, lp: 3000 }); iron.rev(v, .4, 1.2); },
  'cantus.gather': (v, t) => { S('rise', .3 * v, { rate: Math.max(.6, 1.2 / t), lp: far(v) }); bell(NOTE(0), t, .05 * v); },
};
const WIND_SIDE: ((v: number, t: number) => void)[] = [
  (v, t) => { iron.ratchet(v * .7); S('power_up', .2 * v, { rate: Math.max(.7, 1.1 / Math.max(.3, t)), lp: far(v) }); },
  (v, t) => { S('rise', .22 * v, { rate: Math.max(.8, 1.2 / Math.max(.3, t)), lp: far(v) }); bell(NOTE(5), Math.max(.4, t), .03 * v); },
  v => { S('inflate', .3 * v, { rate: 1.3, lp: far(v) }); gloam.bubble(v * .5, .05, 1); },
];

// ---------------------------------------------------------------- hooks
/** How loud and where, the same fall-off as game.vol (which also marks the next sfx call's place, so it is not used here). */
const placeOf = (g: Game, x: number, z: number) => { const d = g.me ? Math.hypot(x - g.me.pos.x, z - g.me.pos.z) : 50; return { v: Math.max(0, 1 - d / 90) ** 2, pan: panOf(x, z) }; };
/** Casts whose sound belongs where they land, not on the caster. */
const AT_TARGET = new Set(['longshot.tranq', 'longshot.deep', 'surveyor.flare', 'surveyor.stake', 'surveyor.jam', 'claimbarge.foreclose', 'tuner.wall', 'choirmaster.shatter', 'choirmaster.drain',
  'omen.reveal', 'omen.stone', 'cantus.hold', 'swift.lift', 'keeper.seed', 'keeper.pod', 'keeper.mend', 'hooksail.cloud', 'tuner.voice']);
/** A cast going off: its own sound, or nothing if it has none (the sides' few without one are quiet on purpose). */
export function castSound(g: Game, u: Unit, a: AbilityDef, t: Target, tgt: Unit | Building | null) {
  if (!kit.ready()) return; const k = `${u.kind}.${a.key}`, r = CAST[k]; if (!r) return;
  const there = AT_TARGET.has(k) && a.target !== 'self', x = there ? (tgt ? tgt.pos.x : t.x) : u.pos.x, z = there ? (tgt ? tgt.pos.z : t.z) : u.pos.z;
  const p = u === g.me && !there ? { v: 1, pan: 0 } : placeOf(g, x, z); if (p.v < .03) return;
  soundStats.casts[k] = (soundStats.casts[k] || 0) + 1; kit.withPan(p.pan, () => r(Math.min(1, p.v)));
}

const seen = new WeakMap<Unit, object>(), engines = new Map<Unit, Loop>();
let night: Loop | null = null, bloom: Loop | null = null, beds = false;
const ENGINE = (u: Unit) => { const f = UNIT[u.kind]?.team ?? fac(u.team) ; const big = (UNIT[u.kind]?.hp ?? 0) >= 300; return f === 0 ? (big ? 'engine_low' : 'rotor') : f === 1 ? 'veylhum' : 'buzz'; };
/** Every frame, on every screen: the ear follows the player, wind-ups start their sound, fliers hum, and the night and wind come and go. */
export function tickSound(g: Game, playing: boolean) {
  const me = g.me, cmd = (g as any).cmd; const ex = cmd?.on && cmd.focus ? cmd.focus.x : me?.pos.x ?? 0, ez = cmd?.on && cmd.focus ? cmd.focus.z : me?.pos.z ?? 0;
  setEar(ex, ez, cmd?.on ? 0 : g.yaw ?? 0);
  if (!kit.ready() || !playing) { for (const l of engines.values()) l.stop(); engines.clear(); night?.set(0); bloom?.set(0); return; }
  // wind-ups
  for (const u of g.units) {
    const c = u.cast; if (!u.alive || !c) continue; if (seen.get(u) === c) continue; seen.set(u, c);
    const p = u === me ? { v: 1, pan: 0 } : placeOf(g, u.pos.x, u.pos.z); if (p.v < .03) continue;
    const w = WIND[`${u.kind}.${c.key}`] || WIND_SIDE[UNIT[u.kind]?.team ?? fac(u.team)]; soundStats.winds++; kit.withPan(p.pan, () => w(Math.min(1, p.v), c.t));
  }
  // fliers: the three nearest hum, the rest are quiet
  const air = g.units.filter(u => u.alive && u.air && !u.inside).map(u => ({ u, d: Math.hypot(u.pos.x - ex, u.pos.z - ez) })).filter(o => o.d < 70).sort((a, b) => a.d - b.d).slice(0, 3);
  const keep = new Set(air.map(o => o.u));
  for (const [u, l] of engines) if (!keep.has(u)) { l.stop(); engines.delete(u); }
  for (const { u, d } of air) {
    let l = engines.get(u); if (!l) { const k = ENGINE(u); l = loop(k, k === 'buzz' ? 2600 : 3200); if (!l) continue; engines.set(u, l); soundStats.engines++; }
    const v = Math.max(0, 1 - d / 70) ** 2, sp = u.moving ? 1 : 0;
    l.set(.22 * v * (u === me ? .6 : 1), u === me ? 0 : panOf(u.pos.x, u.pos.z), .92 + sp * .12);
  }
  // beds: wind with the weather, crickets after dark, the Bloom's bubbling near Gloam buildings
  if (!beds) { beds = true; night = loop('crickets', 7000); bloom = loop('swamp', 4000); }
  setWind(ENV.wind);
  night?.set(.06 * Math.max(0, Math.min(1, ENV.stars * 1.2)));
  let nb = 1e9; for (const b of g.buildings) if (b.alive && fac(b.team) === 2) nb = Math.min(nb, Math.hypot(b.pos.x - ex, b.pos.z - ez));
  bloom?.set(.12 * Math.max(0, 1 - nb / 30) ** 1.5);
}
