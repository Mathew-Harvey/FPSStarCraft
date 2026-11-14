// Fog on the wire. The match server (or the split-screen host) works out what each side can see, and sends each side only that:
// its own bodies and buildings, the enemy bodies and buildings it can see right now, and the enemy buildings it has seen before,
// as they were when it last saw them. A doctored page cannot show what its side has not looked at, because it is never sent.
//
// What a side sees is what the minimap fog shows (src/fog.ts): a circle round each of its bodies and buildings, in the same 4 m cells.
// A body a player is driving also sees down the line it is looking along, out to EYE_FAR metres, unless something is in the way:
// in first person a player can see an enemy across open ground, and the server has to send what the player can see.
import * as THREE from 'three';
import type { Game } from './game';
import { MAP, UNIT, Unit, Building } from './data';
import { SIGHT } from './fog';
import { isEnemy } from './core/sides';

const CELL = 4, NOBODY = 999;
/** How far a driven body sees along its line of look, and how wide that look is (half angle, radians). */
export const EYE_FAR = 110, EYE_HALF = .95;
/** An enemy body stays on the wire this long after it slips out of sight, so a body at the edge of sight does not blink in and out. */
export const LINGER = .4;

const sightOf = (k: string, built = true) => SIGHT[k] || (k in UNIT ? 30 : built ? 26 : 14);
const O = new THREE.Vector3(), D = new THREE.Vector3();

/** What one side can see, worked out once per snapshot. */
export class SideView {
  cells: Uint8Array; n: number; x0: number; z0: number;
  /** Enemy bodies seen by a driver's look, by id, this snapshot. */
  look = new Set<number>();
  /** Last match time each enemy body was in sight. */
  lastSeen = new Map<number, number>();
  /** Enemy buildings as this side last saw them: the wire row, kept to send again while the building is out of sight. */
  memory = new Map<number, any[]>();
  /** Bodies and buildings this side was sent in the last snapshot, so a death event only goes to a side that could see it. */
  sentU = new Set<number>(); sentB = new Set<number>();
  constructor(public team: number) {
    const [cx, cz] = MAP.mid || [0, 0], half = (MAP.rad || 260) * 1.15;
    this.n = Math.ceil(half * 2 / CELL); this.x0 = cx - half; this.z0 = cz - half; this.cells = new Uint8Array(this.n * this.n);
  }
  private idx(x: number, z: number) { const i = Math.floor((x - this.x0) / CELL), j = Math.floor((z - this.z0) / CELL); return i < 0 || j < 0 || i >= this.n || j >= this.n ? -1 : j * this.n + i; }
  /** In sight of this side's circles right now. */
  sees(x: number, z: number) { const i = this.idx(x, z); return i >= 0 && this.cells[i] === 1; }
  private stamp(x: number, z: number, r: number) {
    const c = this.cells, n = this.n, ci = (x - this.x0) / CELL, cj = (z - this.z0) / CELL, rr = r / CELL;
    for (let j = Math.max(0, Math.floor(cj - rr)); j <= Math.min(n - 1, Math.ceil(cj + rr)); j++) for (let i = Math.max(0, Math.floor(ci - rr)); i <= Math.min(n - 1, Math.ceil(ci + rr)); i++) if ((i + .5 - ci) ** 2 + (j + .5 - cj) ** 2 <= rr * rr) c[j * n + i] = 1;
  }
  /** True when this team counts as a friend of the side: itself and its allies (src/core/sides.ts), who share what they see. */
  friend(team: number) { return !isEnemy(this.team, team); }

  update(g: Game) {
    this.cells.fill(0); this.look.clear();
    const drivers: Unit[] = [];
    for (const u of g.units) if (u.alive && this.friend(u.team)) { this.stamp(u.pos.x, u.pos.z, sightOf(u.kind)); if (u.pilot) drivers.push(u); }
    for (const b of g.buildings) if (b.alive && this.friend(b.team)) this.stamp(b.pos.x, b.pos.z, sightOf(b.kind, b.built));
    // A driven body's look: along its yaw, out to EYE_FAR, stopped by scenery and buildings in the way.
    for (const me of drivers) {
      const st = UNIT[me.kind], fx = Math.sin(me.yaw), fz = Math.cos(me.yaw), cosH = Math.cos(EYE_HALF);
      for (const e of g.units) {
        if (!e.alive || this.friend(e.team) || this.look.has(e.id)) continue;
        const dx = e.pos.x - me.pos.x, dz = e.pos.z - me.pos.z, d = Math.hypot(dx, dz); if (d > EYE_FAR || d < 1) continue;
        if ((dx * fx + dz * fz) / d < cosH || this.sees(e.pos.x, e.pos.z)) continue;
        if (clear(g, me, st.eye, e.pos.x, UNIT[e.kind].bodyY, e.pos.z, e) || clear(g, me, st.eye, e.pos.x, UNIT[e.kind].headY, e.pos.z, e)) this.look.add(e.id);
      }
    }
  }
  /** This side can see that enemy body now. */
  seesUnit(u: Unit) { return this.friend(u.team) || this.look.has(u.id) || this.sees(u.pos.x, u.pos.z); }
  /** This side can see that enemy building now: any part of it inside a circle, or a driver looking at it. */
  seesBuilding(g: Game, b: Building) {
    if (this.friend(b.team)) return true;
    for (const [x, z] of [[b.pos.x, b.pos.z], [b.pos.x - b.hx, b.pos.z - b.hz], [b.pos.x + b.hx, b.pos.z - b.hz], [b.pos.x - b.hx, b.pos.z + b.hz], [b.pos.x + b.hx, b.pos.z + b.hz]]) if (this.sees(x, z)) return true;
    for (const u of g.units) {
      if (!u.alive || !u.pilot || !this.friend(u.team)) continue;
      const dx = b.pos.x - u.pos.x, dz = b.pos.z - u.pos.z, d = Math.hypot(dx, dz); if (d > EYE_FAR + Math.max(b.hx, b.hz) || d < 1) continue;
      if ((dx * Math.sin(u.yaw) + dz * Math.cos(u.yaw)) / d < Math.cos(EYE_HALF)) continue;
      if (clear(g, u, UNIT[u.kind].eye, b.pos.x, b.h * .6, b.pos.z, b)) return true;
    }
    return false;
  }
}

/** No scenery between a body's eye and a point on a target. */
export function clear(g: Game, from: Unit, eyeY: number, x: number, y: number, z: number, target: Unit | Building | null) {
  O.set(from.pos.x, eyeY, from.pos.z); D.set(x - O.x, y - O.y, z - O.z); const d = D.length(); if (d < 1) return true; D.divideScalar(d);
  const h = g.ray(O, D, d, NOBODY, from);   // a team nobody is on: no body or building counts, only scenery (rocks, buttes, wrecks)
  if (!h) return true;
  if (target && (h.b === target || h.unit === target)) return true;
  // a rock within a metre of the target is the target's own cover, which a shot can still clip over
  return h.dist >= d - 1.2;
}
