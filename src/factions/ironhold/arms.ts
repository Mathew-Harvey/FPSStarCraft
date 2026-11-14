// What each new Ironhold body can do when a player drives it online, for the match server's damage check (src/net-arms.ts).
// Numbers come from the guns in ground.ts and air.ts (range, hit, the first-person Weapon cd), before damage research.
// If one of those guns changes, change its row here, or honest hits start being dropped (test/online/claims.ts fires every row).
import { ARMS, Move } from '../../net-arms';
import { TUNE } from './kit';

const M = (name: string, range: number, hit: number, n: number, every: number, aim = false, bld?: number, one = 1): Move => ({ name, range, hit, n, every, aim, bld, one });
const F = TUNE.flame, P = TUNE.pile;

Object.assign(ARMS, {
  // The Linesman row from src/net-arms.ts, with the rifle as fast as Overtime makes it.
  linesman: [M('rifle', 150, 15, 1, .12 / TUNE.overtime.fire, true), M('grenade', 70, 75, 10, 5, false)],
  hauldrone: [M('drill', 3.6, 10, 1, .25), M('drill kick', 3.6, 22, 6, 1.1, false, 40)],
  sapper: [M('carbine', 16, 6, 1, .16, true)],
  // The flame spout: everything in the cone, every puff. Hot Spout adds reach and damage to soft bodies.
  dustbike: [M('flame', F.hot, F.dmg + F.hotDmg, 8, F.cd * .7, false, (F.dmg + F.hotDmg) * .6)],
  piledriver: [M('pile gun', P.range, P.dmg, 1, P.cd * .8, true)],
  // Anchored: a lobbed shell, plus half of it to everything inside the splash.
  piledriverset: [M('pile shell', P.max, P.setDmg, 1, P.setCd * .8, false, P.setDmg * 1.2), M('pile splash', P.max + P.splash, P.setDmg * .5, 8, P.setCd * .8)],
  hopper: [], surveyor: [], shaftmine: [],   // no gun of their own; mines go off on the server
  flakkite: [M('sky rockets', 13, 18, 1, 1.3 * .6, true)],
  flakwalker: [M('short gun', 8, 12, 1, .7 * .5, true)],
  gadfly: [M('twin guns', 7.5, 24, 1, 1.25 * .6, true)],
  claimbarge: [M('gun decks', 10, 8, 1, .25, true)],
  gantryflak: [M('flak shells', 22, 14, 1, .8 * .7, true)],
  staketurret: [M('stake gun', 7, 8, 1, .4, true)],
} as Record<string, Move[]>);
