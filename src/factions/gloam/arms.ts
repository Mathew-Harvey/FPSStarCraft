// The new Gloam bodies' first-person attacks, for the match server's hit checks (src/net-arms.ts): one row per attack in roster.ts's
// drive functions, before damage research, read from the same numbers so a change in numbers.ts moves both. Bodies with no attack of
// their own (casters, Drifters, walking guards) have an empty row: their abilities are cast on the server and never report a hit.
import { ARMS, type Move } from '../../net-arms';
import { G2 } from './numbers';

const M = (name: string, range: number, hit: number, n: number, every: number, aim = false, bld?: number): Move => ({ name, range, hit, n, every, aim, bld, one: 1 });
Object.assign(ARMS, {
  keeper: [M('spit', G2.keeper.range + 6, G2.keeper.spit * 1.4, 1, G2.keeper.cd, true)],
  shellback: [M('spit', G2.shellback.range + 4, G2.shellback.spit, 1, G2.shellback.cd * .8, true)],
  lobber: [M('spit', G2.lobber.range + 4, G2.lobber.spit, 1, G2.lobber.cd * .8, true)],
  // the spines run along the ground and hit every body on the line, plated ones harder
  needler: [M('spines', G2.needler.len + 1, G2.needler.dmg + G2.needler.plated, 8, G2.needler.cd)],
  // the bite jumps on to two more bodies
  gnatwing: [M('bite', G2.gnatwing.range + 3 + G2.gnatwing.jumpR, G2.gnatwing.bite, 3, G2.gnatwing.cd)],
  bloater: [M('acid', G2.bloater.range + 6, G2.bloater.spit, 1, G2.bloater.cd * .8, true)],
  sower: [M('pup drop', 16, G2.sower.land, 1, G2.sower.cd)],
  // a bite sweeps everything in front within reach
  husk: [M('bite', 3.6, G2.husk.bite * 1.2, 6, G2.husk.cd)],
  pup: [M('bite', 3.2, G2.pup.bite * 1.2, 6, G2.pup.cd)],
  smother: [], seeder: [], hooksail: [], drifter: [], lookoutsac: [], stingerwalk: [], puffwalk: [],
} as Record<string, Move[]>);
