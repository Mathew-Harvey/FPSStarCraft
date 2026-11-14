// Cargo. A transport (UnitDef.cargo) carries bodies; a building with room (BldDef.cargo) shelters them and they fight from inside it.
// A body takes UnitDef.slots of room (1 by default). When a carrier dies, what it holds spills out and is hurt by the fall, or dies with
// a flier that goes down.
import type { Game } from '../game';
import type { Unit, Building } from '../data';
import { UNIT, BLD, isUnit } from '../data';

/** Dials: the share of its health a body loses spilling out of a carrier on the ground, and out of a flier. */
export const CARGO = { spill: .3, fall: 1 };

export const roomOf = (c: Unit | Building) => (isUnit(c) ? UNIT[c.kind].cargo : BLD[(c as Building).kind].cargo) || 0;
export const slotsOf = (u: Unit) => UNIT[u.kind].slots ?? 1;
export const usedOf = (c: Unit | Building) => (c.cargo || []).reduce((n, u) => n + slotsOf(u), 0);

/** Puts a body inside a carrier of its own side. It must be close (within 4 m of the carrier's edge) and fit. */
export function load(g: Game, c: Unit | Building, u: Unit): boolean {
  if (!c.alive || !u.alive || u.inside || u === c || c.team !== u.team || roomOf(c) <= 0 || (u.cargo && u.cargo.length)) return false;
  const gap = isUnit(c) ? Math.hypot(c.pos.x - u.pos.x, c.pos.z - u.pos.z) - UNIT[c.kind].rad : g.distToBox(c as Building, u.pos.x, u.pos.z);
  if (gap > 4 || usedOf(c) + slotsOf(u) > roomOf(c)) return false;
  (c.cargo || (c.cargo = [])).push(u); u.inside = c; u.target = null; u.moving = false; u.obj.visible = false; u.ring.visible = false; u.pos.copy(c.pos);
  if (u.site) { u.site.builder = null; u.site = null; } return true;
}
/** Lets one body out (or all of them), on the ground beside the carrier. */
export function unload(g: Game, c: Unit | Building, which?: Unit) {
  const out = (c.cargo || []).filter(u => !which || u === which); let i = 0;
  for (const u of out) { const a = (i++ / Math.max(1, out.length)) * Math.PI * 2 + c.id, r = (isUnit(c) ? UNIT[c.kind].rad : Math.max((c as Building).hx, (c as Building).hz)) + 1.6; u.pos.set(c.pos.x + Math.sin(a) * r, 0, c.pos.z + Math.cos(a) * r); u.inside = null; u.obj.visible = true; u.order = { type: 'guard', x: u.pos.x, z: u.pos.z }; }
  c.cargo = (c.cargo || []).filter(u => !out.includes(u)); return out.length;
}
/** Sends a body to get into a carrier of its own side: it walks there and climbs in when close (see boardWork). Online it goes as 'ld'. */
export function board(g: Game, u: Unit, c: Unit | Building): boolean {
  if (g.net) { g.net.cmd('ld', u.id, c.id); return true; }
  if (!c.alive || !u.alive || u.inside || u === c || c.team !== u.team || roomOf(c) <= 0 || usedOf(c) + slotsOf(u) > roomOf(c)) return false;
  u.boarding = c; u.target = null; return true;
}
/** A boarding body's step: walk to the carrier and get in. Returns true while it is boarding (its own brain sits the step out). */
export function boardWork(g: Game, u: Unit, dt: number): boolean {
  const c = u.boarding; if (!c) return false;
  if (!c.alive || u.inside || usedOf(c) + slotsOf(u) > roomOf(c)) { u.boarding = null; return false; }
  if (load(g, c, u)) { u.boarding = null; return true; }
  g.moveTo(u, c.pos.x, c.pos.z, dt, .3); return true;
}
/** The carrier died: everything inside spills out and is hurt (or dies, out of a flier). */
export function spill(g: Game, c: Unit | Building, from: Unit | Building | null) {
  if (!c.cargo || !c.cargo.length) return; const air = !!c.air, list = c.cargo.slice(); unload(g, c);
  for (const u of list) if (!g.net) g.damage(u, u.maxHp * (air ? CARGO.fall : CARGO.spill) + (air ? u.shield : 0), from);
}
/** Every frame: riders move with their carrier. A building's riders keep their own brains and shoot out of it (see game.updateUnits). */
export function tickCargo(g: Game) {
  for (const u of g.units) if (u.inside) { const c = u.inside; if (!c.alive) { u.inside = null; u.obj.visible = true; continue; } u.pos.x = c.pos.x; u.pos.z = c.pos.z; u.obj.position.x = c.pos.x; u.obj.position.z = c.pos.z; }
}
/** Riders of a building fight from it; riders of a transport sit still. */
export const fightsInside = (u: Unit) => !!u.inside && !isUnit(u.inside);
