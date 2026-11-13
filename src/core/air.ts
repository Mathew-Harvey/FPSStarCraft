// The air layer. A flier (UnitDef.air) holds a height, crosses cliffs, buildings and ore, keeps its own spacing with other fliers and
// none with walkers, and can only be hit by weapons that reach the air (src/core/combat.ts). A building whose rules say `lifts` takes off,
// flies slowly and lands again. In first person a flier goes where the mouse points: W forward, Space up, Ctrl down.
import type { Game } from '../game';
import type { Unit, Building } from '../data';
import { UNIT, MAP } from '../data';

/** Flying heights: the usual cruise height, the lowest and highest a player may take a flier, and climb speed. A lifted building's height. */
export const AIR = { cruise: 7, low: 2.5, high: 16, climb: 6, lifted: 5,
  /** The art stream draws the ground shadow under a flier: called each frame with the body and its height. */
  shadow: null as null | ((g: Game, t: Unit | Building, alt: number) => void) };

/** Makes a new body a flier if its kind flies. Called by spawn. */
export function initAir(u: Unit) { if (UNIT[u.kind].air) { u.air = true; u.alt = cruiseOf(u); } }
/** The height a bot flier of this kind holds (UnitDef.cruise, or AIR.cruise). */
export const cruiseOf = (u: Unit) => UNIT[u.kind]?.cruise ?? AIR.cruise;
/** A body's height above the ground (0 for a walker). */
export const altOf = (t: Unit | Building) => t.alt || 0;

/** Pushes a flier back inside the edge of the world; that is the only thing it bumps into. */
export function airCollide(u: Unit) {
  const [ox, oz] = MAP.mid!, cx = u.pos.x - ox, cz = u.pos.z - oz, cd = Math.hypot(cx, cz), lim = MAP.rad!; if (cd > lim) { u.pos.x = ox + cx / cd * lim; u.pos.z = oz + cz / cd * lim; }
}
/** Two bodies only push each other apart when both walk or both fly. */
export const sameLayer = (a: Unit, b: Unit) => !a.air === !b.air;

/** Every frame: fliers ease to cruise height (a bot's) and the shadow hook runs; lifted buildings rise or settle. */
export function tickAir(g: Game, dt: number) {
  for (const u of g.units) {
    if (!u.alive || !u.air) continue;
    if (u !== g.me && !u.pilot) { const c = cruiseOf(u); u.alt = (u.alt ?? c) + (c - (u.alt ?? c)) * Math.min(1, dt * 2); }
    AIR.shadow?.(g, u, u.alt || 0);
  }
  for (const b of g.buildings) {
    if (!b.alive || (!b.air && !(b.alt! > 0))) continue;
    b.alt = Math.max(0, Math.min(AIR.lifted, (b.alt || 0) + (b.air ? 1 : -1) * dt * 3)); b.obj.position.y = b.alt; AIR.shadow?.(g, b, b.alt);
  }
}

/** First-person flight for a flier the player drives: Space climbs, Ctrl drops, W and S follow the mouse's pitch a little too. */
export function flyKeys(g: Game, u: Unit, K: Set<string>, dt: number) {
  let v = 0; if (K.has('Space')) v += 1; if (K.has('ControlLeft') || K.has('ControlRight')) v -= 1;
  if (K.has('KeyW')) v += -Math.sin(g.pitch) * .6; if (K.has('KeyS')) v -= -Math.sin(g.pitch) * .6;
  u.alt = Math.max(AIR.low, Math.min(AIR.high, (u.alt ?? AIR.cruise) + v * AIR.climb * dt));
}

/** Lifts a finished building off the ground (its rules must say `lifts`). It stops training and can be flown to a new spot. */
export function liftOff(g: Game, b: Building) {
  if (!b.alive || !b.built || b.air || b.queue.length) return false; b.air = true; b.alt = b.alt || 0; return true;
}
/** Moves a lifted building toward a spot, at walking pace. Returns true once it is there. */
export function flyBuilding(b: Building, x: number, z: number, dt: number, speed = 3) {
  const dx = x - b.pos.x, dz = z - b.pos.z, d = Math.hypot(dx, dz); if (d < .2) return true; const s = Math.min(d, speed * dt);
  b.pos.x += dx / d * s; b.pos.z += dz / d * s; b.obj.position.x = b.pos.x; b.obj.position.z = b.pos.z; return false;
}
/** Is there room to set a lifted building down here: clear of other buildings, scenery, ore and vents? */
export function roomFor(g: Game, b: Building, x: number, z: number) {
  for (const o of g.buildings) if (o !== b && o.alive && !o.air && Math.abs(x - o.pos.x) < b.hx + o.hx + 1 && Math.abs(z - o.pos.z) < b.hz + o.hz + 1) return false;
  for (const s of g.spires) if (Math.abs(x - s.x) < b.hx + s.r && Math.abs(z - s.z) < b.hz + s.r) return false;
  for (const o of g.ores) if (o.amount > 0 && Math.abs(x - o.pos.x) < b.hx + 2.4 && Math.abs(z - o.pos.z) < b.hz + 2.4) return false;
  for (const v of g.vents) if (Math.abs(x - v.pos.x) < b.hx + 1.6 && Math.abs(z - v.pos.z) < b.hz + 1.6) return false;
  const [mx, mz] = MAP.mid || [0, 0]; return Math.hypot(x - mx, z - mz) + Math.max(b.hx, b.hz) < (MAP.rad || 1e9) * .99;
}
/** Sets a lifted building down where it hovers, if there is room. */
export function land(g: Game, b: Building) { if (!b.air || !roomFor(g, b, b.pos.x, b.pos.z)) return false; b.air = false; return true; }
