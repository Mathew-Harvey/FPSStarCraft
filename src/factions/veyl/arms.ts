// What each new Veyl body can do when a player drives it online, for the match server's damage check (src/net-arms.ts).
// Numbers come from the first-person guns in units.ts (GUNS, driveMute, sweep), before damage research. A hit's row allows for the kind's
// own bonus (Bell on plated, Prism's Burn Bright, ...) and, for a flier, the three air levels, which the server's own multiplier leaves out.
// If one of those guns changes, change its row here, or honest hits start being dropped (test/online/claims.ts fires every row).
// Spells (Toll, Shatter Note, Drain, Lift ...) are cast on the host through the ability system, so they never come in as a claim.
import { ARMS, type Move } from '../../net-arms';
import { UNIT } from '../../data';
import { V_TUNE as T } from './numbers';

const M = (name: string, range: number, hit: number, n: number, every: number, aim = false, bld?: number, one = 1): Move => ({ name, range, hit, n, every, aim, bld, one });
const AIR = T.air[0] * T.air[1] * T.air[2];

Object.assign(ARMS, {
  tuner: [M('bolt', T.tuner.range, T.tuner.dmg * 1.4, 1, T.tuner.cd * .8, true)],
  // the blades: every body in front within reach, and three quarters of a cut on a building
  mute: [M('blades', 3 + UNIT.mute.rad + 1, T.mute.cut, 6, T.mute.cd, false, T.mute.cut * .75)],
  chord: [M('beam', T.chord.range + 2, T.chord.dmg + 10, 1, T.chord.cd, true), M('beam splash', T.chord.range + 2 + T.chord.splash, T.chord.dmg * .6, 8, T.chord.cd)],
  bell: [M('peal', T.bell.range + 2, T.bell.dmg + 60, 1, T.bell.cd, true)],
  // the sweep: two strokes of the beam on everything along a 4 m line where it lands
  reedwalker: [M('sweep', T.reedwalker.range + 4 + T.reedwalker.stride + T.reedwalker.line, (T.reedwalker.dmg + 6) * 2, 8, T.reedwalker.cd, false, T.reedwalker.dmg * 2)],
  swift: [M('twin bolts', T.swift.range + 4 + T.swift.far, (T.swift.dmg * 2 + 4) * AIR, 1, T.swift.cd, true)],
  prism: [M('beam', T.prism.range + 2, (T.prism.dmg + 4 + T.prism.burn) * AIR, 1, T.prism.cd, true)],
  omen: [M('shrill', T.omen.range + 2, (T.omen.dmg + T.omen.soft) * AIR, 1, T.omen.cd, true)],
  cantus: [M('beams', T.cantus.range + 2, T.cantus.dmg * 2 * AIR, 1, T.cantus.cd * .6, true)],
  shard: [M('needle', T.shard.range + 4, T.shard.dmg * 2 * AIR, 1, T.shard.cd, true)],
  // no driven weapon: their spells go through the ability system, and the Lyre's Shards fight by themselves
  choirmaster: [], knell: [], listener: [], ferry: [], lyre: [],
} as Record<string, Move[]>);
