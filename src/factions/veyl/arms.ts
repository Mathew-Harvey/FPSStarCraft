// What each new Veyl body can do when a player drives it online, for the match server's damage check (src/net-arms.ts).
// Numbers come from the first-person guns in units.ts (GUNS, driveMute, sweep), before damage research. A hit's row allows for the kind's
// own bonus (Bell on plated, Prism's Burn Bright, ...) and, for a flier, the three air levels, which the server's own multiplier leaves out.
// If one of those guns changes, change its row here, or honest hits start being dropped (test/online/claims.ts fires every row).
// Spells (Toll, Shatter Note, Drain, Lift ...) are cast on the host through the ability system, so they never come in as a claim.
import { ARMS, type Move } from '../../net-arms';
import { UNIT } from '../../data';
import { V_TUNE as T } from './numbers';
import { FP } from './units';

const M = (name: string, range: number, hit: number, n: number, every: number, aim = false, bld?: number, one = 1): Move => ({ name, range, hit, n, every, aim, bld, one });
const AIR = T.air[0] * T.air[1] * T.air[2];

Object.assign(ARMS, {
  tuner: [M('bolt', T.tuner.range, T.tuner.dmg * 1.4, 1, T.tuner.cd * .8, true)],
  // the blades: every body in front within reach, and three quarters of a cut on a building
  mute: [M('blades', 3 + UNIT.mute.rad + 1, T.mute.cut, 6, T.mute.cd / FP, false, T.mute.cut * .75)],
  chord: [M('beam', T.chord.range + 2, T.chord.dmg + 10, 1, T.chord.cd / FP, true), M('beam splash', T.chord.range + 2 + T.chord.splash, T.chord.dmg * .6, 8, T.chord.cd / FP)],
  bell: [M('peal', T.bell.range + 2, T.bell.dmg + 60, 1, T.bell.cd / FP, true)],
  // the sweep: two strokes of the beam on everything along a 4 m line where it lands
  reedwalker: [M('sweep', T.reedwalker.range + 4 + T.reedwalker.stride + T.reedwalker.line, (T.reedwalker.dmg + 6) * 2, 8, T.reedwalker.cd / FP, false, T.reedwalker.dmg * 2)],
  swift: [M('twin bolts', T.swift.range + 4 + T.swift.far, (T.swift.dmg * 2 + 4) * AIR, 1, T.swift.cd / FP, true)],
  prism: [M('beam', T.prism.range + 2, (T.prism.dmg + 4 + T.prism.burn) * AIR, 1, T.prism.cd / FP, true)],
  omen: [M('shrill', T.omen.range + 2, (T.omen.dmg + T.omen.soft) * AIR, 1, T.omen.cd / FP, true)],
  cantus: [M('beams', T.cantus.range + 2, T.cantus.dmg * 2 * AIR, 1, T.cantus.cd * .6, true)],
  shard: [M('needle', T.shard.range + 4, T.shard.dmg * 2 * AIR, 1, T.shard.cd, true)],
  // the first roster, as rules.ts drives them now: the Cantor's cut grew with its new numbers (a full combo adds 15), and the Warden's
  // Low Note blast comes every 2.2 s (1.5 s plus its 0.7 s wind-up)
  cantor: [M('blade', 3, T.cantor.cut * 1.2 + 15, 6, .6, false, 14), M('whirl', 3.8, T.cantor.cut * 1.5, 10, 6)],
  warden: [M('low note blast', 8.2, 38, 10, 2.2, false, 53.2)],
  // no driven weapon: their spells go through the ability system, and the Lyre's Shards fight by themselves
  choirmaster: [], knell: [], listener: [], ferry: [], lyre: [],
} as Record<string, Move[]>);
