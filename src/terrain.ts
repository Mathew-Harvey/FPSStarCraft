// The lie of the land on a skirmish map: high ground with ramps, the cliffs round each natural field and the rock walls that seal a back way in,
// island fields out of reach of anything that walks, Flux vents, bright seams and Survey Beacons.
//
// Everything here is laid out from the map code alone, with dice of its own, so the same code gives the same ground on every screen and on the
// server, and adding to it never moves a mesa, a seam or a bot match that was already there. Every piece comes with its twin turned round the
// middle of the map (see swapEnd), so neither end has the better ground.
//
// The engine asks this file five things: how high the ground is (h), whether a step a body just took went up or down a cliff (block), which
// way to walk to reach ground at another level (via), whether a side can see a body standing above it (sees), and what to draw on the map.
import { MAP, ROAD, VHOME, OUTPOST, LAYOUT, roadPt, swapEnd } from './data';
import { turn, turnDir, ringSite } from './teammaps';

/** A ramp up the side of a stretch of high ground: `t` is where it meets the top, `f` its foot on the ground below, `w` its width. */
export interface Ramp { tx: number; tz: number; fx: number; fz: number; w: number; /** From the top toward the foot, unit length. */ ux: number; uz: number; len: number }
/** A stretch of high ground: every point within `r` of the line a-b is `h` metres up, behind a cliff. A ledge is a short one, a ridge a long one. */
export interface Ridge { id: number; ax: number; az: number; bx: number; bz: number; r: number; h: number; ramps: Ramp[]; /** No ramp: only fliers and tunnels reach it. */ island?: boolean; /** Ridges that touch at one height share a group: one stretch of high ground. */ group: number;
  /** Its box, ramps included, for a quick no. */ x0: number; x1: number; z0: number; z1: number; kind: 'ledge' | 'ridge' | 'island' }
/** A Survey Beacon: a body of a side standing within REACH of it lets that side see SEE metres round it, up cliffs too. */
export interface Beacon { x: number; z: number; /** Which sides have a body beside it now, one bit each. */ held: number; /** The prop, once the world is built; a broken beacon sees nothing. */ alive: boolean }
/** A row of breakable rocks across a gap: [x, z, yaw, length]. */
export type Wall = [number, number, number, number];
/** An ore field the engine adds on top of MAP.sites: [x, z, seams, amount each, richness]. */
export type Field = { x: number; z: number; seams: number[][]; amount: number; rich: number; island: boolean };

export const BEACON = { REACH: 4.5, SEE: 40 };
/** The whole of this file's ground, on or off: off gives the flat maps every bot table before it was played on. */
export const TERRAIN = { on: true };
/** Height a body can step up or down in one stride. A ramp climbs far less than this per stride; a cliff far more. */
export const STEP = 1.2;
/** How high the ground stands. A ledge is a climb you can see over from a Gantry's cab, a natural's ridge a bit more, an island well above both. */
const LEDGE_H = 3.6, RIDGE_H = 4.2, ISLAND_H = 5.2, /** Half the width of a natural's ridge: wide enough to stand a squad on. */ RIDGE_R = 4.4;

/** A patch of painted ground: [x, z, reach, kind] (see PAINTS). Only a made map has any. */
export type Paint = [number, number, number, number];
export interface Terrain { ridges: Ridge[]; vents: [number, number][]; beacons: Beacon[]; walls: Wall[]; fields: Field[]; /** Indexes into MAP.sites of the bright fields. */ bright: number[]; paint: Paint[]; key: string }
export const TER: Terrain = { ridges: [], vents: [], beacons: [], walls: [], fields: [], bright: [], paint: [], key: '' };
const none = (): Terrain => ({ ridges: [], vents: [], beacons: [], walls: [], fields: [], bright: [], paint: [], key: '' });
/** The kinds of ground a map maker can paint. */
export const PAINTS = ['Sand', 'Scorch', 'Stone', 'Paving'];

/** A map someone made (see mapmaker.ts): the map and size it is built on, where the far base stands, and its pieces for one end. Every piece is laid
 *  twice, once as placed and once turned round the middle of the map, so both ends always get the same. Pieces are [kind, ...numbers]:
 *  ledge [x, z, x2, z2, reach], ridge [x, z, x2, z2], island [x, z, reach], ramp [x, z] (onto the nearest high ground), vent [x, z], beacon [x, z],
 *  rock wall [x, z, turn in degrees, length], field [x, z, bright 0 or 1], paint [x, z, reach, kind]. */
export interface Plan { b: number; s: number; out: [number, number]; items: number[][] }
export const PK = { ledge: 0, ridge: 1, island: 2, ramp: 3, vent: 4, beacon: 5, wall: 6, field: 7, paint: 8 } as const;
/** The made map in use, if any. It applies only while the map picked is the one it was made on (same map, same size, not turned). */
export const MADE: { plan: Plan | null; code: string } = { plan: null, code: '' };
export const madeHere = () => !!MADE.plan && MAP.base === MADE.plan.b && MAP.size === MADE.plan.s && !MAP.turn && !MAP.ring && !MAP.set;

// ------------------------------------------------------------ geometry
const segT = (x: number, z: number, ax: number, az: number, bx: number, bz: number) => { const dx = bx - ax, dz = bz - az, l = dx * dx + dz * dz; return l < 1e-9 ? 0 : Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / l)); };
export const segD = (x: number, z: number, ax: number, az: number, bx: number, bz: number) => { const t = segT(x, z, ax, az, bx, bz); return Math.hypot(x - ax - (bx - ax) * t, z - az - (bz - az) * t); };
/** Height of a ramp at a point, or -1 off it. The ramp runs a little way back into the top so there is no seam to trip on. */
function rampH(R: Ridge, m: Ramp, x: number, z: number) {
  const dx = x - m.tx, dz = z - m.tz, t = dx * m.ux + dz * m.uz, s = -dx * m.uz + dz * m.ux;
  if (t < -1.5 || t > m.len || s > m.w / 2 || s < -m.w / 2) return -1; return R.h * Math.min(1, Math.max(0, 1 - t / m.len));
}
/** How high the ground is at a point. */
export function h(x: number, z: number) {
  let best = 0; const rs = TER.ridges; if (!rs.length) return 0;
  for (let i = 0; i < rs.length; i++) { const R = rs[i]; if (x < R.x0 || x > R.x1 || z < R.z0 || z > R.z1) continue;
    if (segD(x, z, R.ax, R.az, R.bx, R.bz) <= R.r) { if (R.h > best) best = R.h; continue; }
    for (const m of R.ramps) { const v = rampH(R, m, x, z); if (v > best) best = v; } }
  return best;
}
/** Which stretch of high ground a point is up on (its top or the upper part of a ramp), or -1 for the ground below. */
export function zone(x: number, z: number) {
  const rs = TER.ridges; for (let i = 0; i < rs.length; i++) { const R = rs[i]; if (x < R.x0 || x > R.x1 || z < R.z0 || z > R.z1) continue;
    if (segD(x, z, R.ax, R.az, R.bx, R.bz) <= R.r) return R.group; for (const m of R.ramps) if (rampH(R, m, x, z) > STEP) return R.group; }
  return -1;
}
/** True when a building's footprint sits on one level, off every ramp and clear of every vent. `vent` lets a building that must stand on a vent through. */
export function flat(x: number, z: number, hx: number, hz: number, vent = false) {
  if (!TER.ridges.length && !TER.vents.length) return true;
  const y = h(x, z); for (const [px, pz] of [[-1, -1], [1, -1], [-1, 1], [1, 1], [0, -1], [0, 1], [-1, 0], [1, 0]]) if (Math.abs(h(x + px * hx, z + pz * hz) - y) > .05) return false;
  for (const R of TER.ridges) for (const m of R.ramps) if (segD(x, z, m.tx, m.tz, m.fx, m.fz) < m.w / 2 + Math.max(hx, hz) + 1) return false;
  if (!vent) for (const [vx, vz] of TER.vents) if (Math.abs(vx - x) < hx + 2.2 && Math.abs(vz - z) < hz + 2.2) return false;
  return true;
}

/** True within `pad` metres of any raised ground, ramp, vent, beacon or rock wall: places scenery keeps off. */
export function near(x: number, z: number, pad: number) {
  for (const R of TER.ridges) { if (x < R.x0 - pad || x > R.x1 + pad || z < R.z0 - pad || z > R.z1 + pad) continue; if (segD(x, z, R.ax, R.az, R.bx, R.bz) < R.r + pad + 1.5) return true; for (const m of R.ramps) if (segD(x, z, m.tx, m.tz, m.fx + m.ux * 3, m.fz + m.uz * 3) < m.w / 2 + pad) return true; }
  for (const [vx, vz] of TER.vents) if (Math.abs(vx - x) < 2.5 + pad && Math.abs(vz - z) < 2.5 + pad) return true;
  for (const b of TER.beacons) if (Math.hypot(b.x - x, b.z - z) < BEACON.REACH + 1 + pad) return true;
  for (const [wx, wz, , len] of TER.walls) if (Math.hypot(wx - x, wz - z) < len / 2 + 2 + pad) return true;
  return false;
}

// ------------------------------------------------------------ bodies on the ground
type P = { x: number; y: number; z: number };
const ok = (x: number, z: number, y: number) => Math.abs(h(x, z) - y) <= STEP;
/** A body has just stepped from height p.y to (p.x, p.z). If that step went up or down a cliff, move it back to the nearest spot on its own
 *  level, so it slides along the cliff; a body the computer walks is also nudged along the cliff toward where it is going (gx, gz), the way it
 *  walks round a rock spire. Leaves p.y at the ground's height. */
export function block(p: P, gx: number, gz: number, ai: boolean) {
  const rs = TER.ridges; if (!rs.length) { p.y = 0; return; }
  const was = p.y, now = h(p.x, p.z); if (Math.abs(now - was) <= STEP) { p.y = now; return; }
  // Every way back onto this level that one cliff or ramp edge offers; the nearest that really is on this level wins.
  let bx = 0, bz = 0, bd = 1e9; const tryAt = (x: number, z: number) => { const d = (x - p.x) ** 2 + (z - p.z) ** 2; if (d < bd && ok(x, z, was)) { bd = d; bx = x; bz = z; } };
  for (const R of rs) { if (p.x < R.x0 - 4 || p.x > R.x1 + 4 || p.z < R.z0 - 4 || p.z > R.z1 + 4) continue;
    const t = segT(p.x, p.z, R.ax, R.az, R.bx, R.bz), qx = R.ax + (R.bx - R.ax) * t, qz = R.az + (R.bz - R.az) * t, dx = p.x - qx, dz = p.z - qz, d = Math.hypot(dx, dz) || 1e-3;
    for (const k of [R.r + .06, R.r - .06]) tryAt(qx + dx / d * k, qz + dz / d * k);
    for (const m of R.ramps) { const ax = p.x - m.tx, az = p.z - m.tz, along = ax * m.ux + az * m.uz, s = -ax * m.uz + az * m.ux; if (along < -3 || along > m.len + 3) continue;
      for (const e of [m.w / 2 + .06, m.w / 2 - .06, -m.w / 2 + .06, -m.w / 2 - .06]) tryAt(m.tx + m.ux * along - m.uz * e, m.tz + m.uz * along + m.ux * e); } }
  if (bd > 1e8) for (let r = .25; r <= 2.5 && bd > 1e8; r += .25) for (let a = 0; a < 12; a++) tryAt(p.x + Math.cos(a * .5236) * r, p.z + Math.sin(a * .5236) * r);
  // Nothing close on its own level: it was put here (a spawn, a story move), not walked here. It stands where it was put.
  if (bd > 9) { p.y = now; return; }
  if (ai) { const nx = bx - p.x, nz = bz - p.z, l = Math.hypot(nx, nz); if (l > 1e-4) { const tx = -nz / l, tz = nx / l, sg = Math.sign(tx * (gx - bx) + tz * (gz - bz)) || 1, cx = bx + tx * sg * .08, cz = bz + tz * sg * .08; if (ok(cx, cz, was)) { bx = cx; bz = cz; } } }
  p.x = bx; p.z = bz; p.y = h(bx, bz);
}
/** Shortest distance between two segments. */
function segSeg(ax: number, az: number, bx: number, bz: number, cx: number, cz: number, dx: number, dz: number) {
  const cross = (px: number, pz: number, qx: number, qz: number, rx: number, rz: number) => (qx - px) * (rz - pz) - (qz - pz) * (rx - px);
  const d1 = cross(ax, az, bx, bz, cx, cz), d2 = cross(ax, az, bx, bz, dx, dz), d3 = cross(cx, cz, dx, dz, ax, az), d4 = cross(cx, cz, dx, dz, bx, bz);
  if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) return 0;
  return Math.min(segD(ax, az, cx, cz, dx, dz), segD(bx, bz, cx, cz, dx, dz), segD(cx, cz, ax, az, bx, bz), segD(dx, dz, ax, az, bx, bz));
}
/** The ground route finder. High ground stands in the way of anyone walking below it, so the ground below gets a small map of corners to walk
 *  between: points just off the ends and sides of every cliff and the foot of every ramp, joined wherever a body can walk straight from one to the
 *  next. Built once per map. A rock wall closes the joins across it until it is broken. */
interface Graph { x: number[]; z: number[]; adj: number[][]; len: number[][]; walls: number[][][] }
let GRAPH: Graph | null = null;
const BODY = .8;
/** True when a body can walk straight from a to b on the ground below: no high ground (and, unless `walls` is false, no standing rock wall) in the way. */
export function clear(ax: number, az: number, bx: number, bz: number, walls = true) {
  for (const R of TER.ridges) { if (Math.max(ax, bx) < R.x0 - 3 || Math.min(ax, bx) > R.x1 + 3 || Math.max(az, bz) < R.z0 - 3 || Math.min(az, bz) > R.z1 + 3) continue; if (segSeg(ax, az, bx, bz, R.ax, R.az, R.bx, R.bz) < R.r + BODY) return false;
    // The upper part of a ramp is a wall to anyone walking past its side.
    for (const m of R.ramps) { const t = m.len * (1 - STEP / R.h); if (segSeg(ax, az, bx, bz, m.tx, m.tz, m.tx + m.ux * t, m.tz + m.uz * t) < m.w / 2 + BODY) return false; } }
  if (walls) for (let i = 0; i < TER.walls.length; i++) if (WALL_UP[i] && wallHit(i, ax, az, bx, bz)) return false;
  return true;
}
/** Which rock walls still stand (a broken wall opens its gap). Kept by the world builder. */
export const WALL_UP: boolean[] = [];
function wallHit(i: number, ax: number, az: number, bx: number, bz: number) { const [x, z, a, len] = TER.walls[i], tx = -Math.sin(a), tz = Math.cos(a); return segSeg(ax, az, bx, bz, x - tx * len / 2, z - tz * len / 2, x + tx * len / 2, z + tz * len / 2) < 1.6 + BODY; }
function graph(): Graph {
  if (GRAPH) return GRAPH; const xs: number[] = [], zs: number[] = [], [mx, mz] = MAP.mid || [0, 0], rad = (MAP.rad || 200) - 2;
  const put = (x: number, z: number) => { if (h(x, z) > 0 || Math.hypot(x - mx, z - mz) > rad) return; for (const R of TER.ridges) { if (segD(x, z, R.ax, R.az, R.bx, R.bz) < R.r + BODY + .3) return; for (const m of R.ramps) if (segD(x, z, m.tx, m.tz, m.fx, m.fz) < m.w / 2 + BODY) return; } xs.push(x); zs.push(z); };
  for (const R of TER.ridges) { const dx = R.bx - R.ax, dz = R.bz - R.az, L = Math.hypot(dx, dz), ux = L > .01 ? dx / L : 1, uz = L > .01 ? dz / L : 0, nx = -uz, nz = ux, o = R.r + BODY + 1.4;
    if (L < .01) { for (let k = 0; k < 8; k++) put(R.ax + Math.cos(k * .785) * o, R.az + Math.sin(k * .785) * o); }
    else for (const [px, pz] of [[R.ax - ux * o, R.az - uz * o], [R.bx + ux * o, R.bz + uz * o], [R.ax + nx * o, R.az + nz * o], [R.ax - nx * o, R.az - nz * o], [R.bx + nx * o, R.bz + nz * o], [R.bx - nx * o, R.bz - nz * o], [R.ax + (nx - ux) * o * .72, R.az + (nz - uz) * o * .72], [R.ax - (nx + ux) * o * .72, R.az - (nz + uz) * o * .72], [R.bx + (nx + ux) * o * .72, R.bz + (nz + uz) * o * .72], [R.bx + (ux - nx) * o * .72, R.bz + (uz - nz) * o * .72]]) put(px, pz);
    for (const m of R.ramps) { put(m.fx + m.ux * 3, m.fz + m.uz * 3); for (const sg of [-1, 1]) for (const t of [m.len * .5, m.len + 1.5]) put(m.tx + m.ux * t - m.uz * sg * (m.w / 2 + BODY + 1.2), m.tz + m.uz * t + m.ux * sg * (m.w / 2 + BODY + 1.2)); } }
  const n = xs.length, adj: number[][] = xs.map(() => []), len: number[][] = xs.map(() => []), walls: number[][][] = xs.map(() => []);
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) if (clear(xs[i], zs[i], xs[j], zs[j], false)) { const d = Math.hypot(xs[i] - xs[j], zs[i] - zs[j]), w: number[] = []; for (let k = 0; k < TER.walls.length; k++) if (wallHit(k, xs[i], zs[i], xs[j], zs[j])) w.push(k);
    adj[i].push(j); len[i].push(d); walls[i].push(w); adj[j].push(i); len[j].push(d); walls[j].push(w); }
  return GRAPH = { x: xs, z: zs, adj, len, walls };
}
/** The next corner to walk to, going from (ax, az) to (bx, bz) on the ground below, or null when the way is straight (or there is no way). */
function route(ax: number, az: number, bx: number, bz: number): [number, number] | null {
  if (clear(ax, az, bx, bz)) return null; const G = graph(), n = G.x.length; if (!n) return null;
  // Dijkstra from the goal, so the corner to head for is the first one seen from where the body stands.
  const dist = new Float64Array(n).fill(1e9), done = new Uint8Array(n);
  for (let i = 0; i < n; i++) if (clear(G.x[i], G.z[i], bx, bz)) dist[i] = Math.hypot(G.x[i] - bx, G.z[i] - bz);
  for (;;) { let u = -1, bd = 1e9; for (let i = 0; i < n; i++) if (!done[i] && dist[i] < bd) { bd = dist[i]; u = i; } if (u < 0) break; done[u] = 1;
    const A = G.adj[u]; for (let k = 0; k < A.length; k++) { const v = A[k]; if (done[v]) continue; if (G.walls[u][k].some(w => WALL_UP[w])) continue; const d = bd + G.len[u][k]; if (d < dist[v]) dist[v] = d; } }
  let best = -1, bd = 1e9; for (let i = 0; i < n; i++) if (dist[i] < 1e9) { const d = Math.hypot(G.x[i] - ax, G.z[i] - az); if (d + dist[i] < bd && clear(ax, az, G.x[i], G.z[i])) { bd = d + dist[i]; best = i; } }
  return best < 0 ? null : [G.x[best], G.z[best]];
}
/** Where a body should walk next to reach (x, z): by way of a ramp when the two are on different levels, and round the cliffs on the ground
 *  below. Null when it can walk straight there. A body remembers its last answer for a moment, so a squad does not work its route out each step. */
export function via(u: { pos: P; tp?: number[] }, x: number, z: number): [number, number] | null {
  const rs = TER.ridges; if (!rs.length) return null; const p = u.pos;
  const zf = Math.abs(h(p.x, p.z) - p.y) <= STEP ? zone(p.x, p.z) : -1, zt = zone(x, z);
  const inRect = (m: Ramp) => { const ax = p.x - m.tx, az = p.z - m.tz, t = ax * m.ux + az * m.uz, s = -ax * m.uz + az * m.ux; return t > -3 && t < m.len + 3 && Math.abs(s) < m.w / 2 + .2; };
  let gx = x, gz = z;
  if (zf !== zt) {
    if (zf >= 0) {
      // Up here, going somewhere else: down the ramp nearest the way it is going.
      let best: Ramp | null = null, bd = 1e9; for (const m of GROUPS[zf]) { const d = Math.hypot(p.x - m.tx, p.z - m.tz) + Math.hypot(x - m.fx, z - m.fz); if (d < bd) { bd = d; best = m; } }
      if (!best) return null; const m = best; return inRect(m) ? [m.fx + m.ux * 3, m.fz + m.uz * 3] : [m.tx - m.ux * 2, m.tz - m.uz * 2];
    }
    // Down here, going up: to the foot of the ramp that makes the shortest walk, then up it.
    let best: Ramp | null = null, bd = 1e9; for (const m of GROUPS[zt]) { const d = Math.hypot(p.x - m.fx, p.z - m.fz) + Math.hypot(x - m.tx, z - m.tz); if (d < bd) { bd = d; best = m; } }
    if (!best) return null; const m = best, ax = m.fx + m.ux * 3, az = m.fz + m.uz * 3;
    if (inRect(m) || Math.hypot(p.x - ax, p.z - az) < 2.5) return [m.tx - m.ux * 2, m.tz - m.uz * 2];
    gx = ax; gz = az;
  } else if (zf >= 0) return null;   // up on one stretch of high ground: walk straight across it
  else for (const R of rs) for (const m of R.ramps) { const ax = p.x - m.tx, az = p.z - m.tz, t = ax * m.ux + az * m.uz, sd = -ax * m.uz + az * m.ux;
    if (t > -1.5 && t < m.len + .5 && Math.abs(sd) < m.w / 2 + .2 && !clear(p.x, p.z, gx, gz)) return [m.fx + m.ux * 3, m.fz + m.uz * 3]; }   // still on a ramp: off the end of it first
  // On the ground below: round any cliff in the way. The answer is kept for half a second, or until the goal moves.
  const now = CLOCK.t, tp = u.tp;
  if (tp && now - tp[0] < .5 && Math.abs(tp[1] - gx) < 3 && Math.abs(tp[2] - gz) < 3 && Math.hypot(p.x - tp[3], p.z - tp[4]) > 1.2) return tp[5] ? [tp[3], tp[4]] : (gx !== x || gz !== z ? [gx, gz] : null);
  const w = route(p.x, p.z, gx, gz); u.tp = w ? [now, gx, gz, w[0], w[1], 1] : [now, gx, gz, p.x, p.z, 0];
  return w || (gx !== x || gz !== z ? [gx, gz] : null);
}
/** The match clock as the route finder sees it (set each step by look). */
export const CLOCK = { t: 0 };
/** The ramps of each stretch of high ground, joined up where ridges touch at one height. */
let GROUPS: Ramp[][] = [];

// ------------------------------------------------------------ who sees what
/** Bodies standing up on high ground and the Survey Beacons held, refreshed each step: [x, z, height, reach, side]. */
const EYES: number[][] = [];
/** Lists who has eyes up high: every body or building standing above the ground below, and every beacon a side holds. */
export function look(bodies: { alive: boolean; team: number; pos: P }[], reach: (b: any) => number, beside: (x: number, z: number, r: number) => number, time = 0) {
  EYES.length = 0; CLOCK.t = time; if (!TER.ridges.length && !TER.beacons.length) return;
  for (const b of bodies) if (b.alive && b.pos.y > STEP) EYES.push([b.pos.x, b.pos.z, b.pos.y, reach(b), b.team]);
  for (const B of TER.beacons) { B.held = B.alive ? beside(B.x, B.z, BEACON.REACH) : 0; for (let t = 0; t < 31; t++) if (B.held & (1 << t)) EYES.push([B.x, B.z, 99, BEACON.SEE, t]); }
}
/** Can a side, looking from height `fromY`, see a body or building standing at (x, z) at height y? From below a cliff, only if something of
 *  that side is up at that height near it, or a Survey Beacon it holds covers the spot. */
export function sees(team: number, fromY: number, x: number, z: number, y: number) {
  if (y <= fromY + STEP) return true;
  for (const e of EYES) if (e[4] === team && e[2] >= y - STEP && (e[0] - x) ** 2 + (e[1] - z) ** 2 < e[3] * e[3]) return true;
  return false;
}
/** The beacons a side holds now, for the map and the fog. */
export const held = (team: number) => TER.beacons.filter(b => b.alive && b.held & (1 << team));

// ------------------------------------------------------------ laying out a map
/** Dice of this map's own, so the ground never draws from the match's dice. */
function dice(seed: number) { let s = (seed * 7919 + 104729) % 2147483647 || 1; return (a = 0, b = 1) => { s = (s * 16807) % 2147483647; return a + (b - a) * (s - 1) / 2147483646; }; }
function ridge(ax: number, az: number, bx: number, bz: number, r: number, hh: number, kind: Ridge['kind']): Ridge { return { id: 0, group: 0, ax, az, bx, bz, r, h: hh, ramps: [], kind, island: kind === 'island', x0: 0, x1: 0, z0: 0, z1: 0 }; }
/** A ramp down from the top of R at the rim point nearest (px, pz) out along (ux, uz). */
function ramp(R: Ridge, px: number, pz: number, ux: number, uz: number, len: number, w: number) {
  const t = segT(px, pz, R.ax, R.az, R.bx, R.bz), qx = R.ax + (R.bx - R.ax) * t, qz = R.az + (R.bz - R.az) * t, tx = qx + ux * R.r, tz = qz + uz * R.r;
  R.ramps.push({ tx, tz, fx: tx + ux * len, fz: tz + uz * len, w, ux, uz, len });
}
function box(R: Ridge) { const xs = [R.ax - R.r, R.bx - R.r, R.ax + R.r, R.bx + R.r], zs = [R.az - R.r, R.bz - R.r, R.az + R.r, R.bz + R.r]; for (const m of R.ramps) { xs.push(m.fx - m.w, m.fx + m.w, m.tx - m.w, m.tx + m.w); zs.push(m.fz - m.w, m.fz + m.w, m.tz - m.w, m.tz + m.w); } R.x0 = Math.min(...xs); R.x1 = Math.max(...xs); R.z0 = Math.min(...zs); R.z1 = Math.max(...zs); }
/** The same ridge turned round the middle of the map, for the other end. */
function twin(R: Ridge): Ridge { const [ax, az] = swapEnd(R.ax, R.az), [bx, bz] = swapEnd(R.bx, R.bz), T = ridge(ax, az, bx, bz, R.r, R.h, R.kind); for (const m of R.ramps) { const [tx, tz] = swapEnd(m.tx, m.tz), [fx, fz] = swapEnd(m.fx, m.fz); T.ramps.push({ tx, tz, fx, fz, w: m.w, ux: -m.ux, uz: -m.uz, len: m.len }); } return T; }

const CACHE = new Map<string, Terrain>();
/** The paths everyone needs kept open: the road, the flank and every decoy road, as segments. */
function paths() {
  if (MAP.ring) return (MAP.roads || []).map(r => [...r]);   // a team map keeps its spokes open; the far road and the flank run along them
  const segs: number[][] = []; const a = roadPt(-25), b = roadPt(ROAD.len + 41); segs.push([a[0], a[1], b[0], b[1]]);
  let qx = OUTPOST.x, qz = OUTPOST.z; for (const [fx, fz] of MAP.flank) { segs.push([qx, qz, fx, fz]); qx = fx; qz = fz; } segs.push([qx, qz, 0, 0]);
  for (const r of (MAP.roads || []).slice(1)) segs.push(r); return segs;
}

/** Lays out this map's ground for the map now set (MAP, MAP.sites). Called by setMap; cached per map code and layout. */
export function layoutTerrain() {
  // Story jobs keep the flat ground they were written on. So does a map that turned off its ground (a classic raid map has none either way).
  if (MAP.set || MAP.code === undefined || !TERRAIN.on) { Object.assign(TER, none()); MAP.vents = []; settle(); return; }
  const key = MAP.code + ':' + (madeHere() ? MADE.code + ':' : '') + (MAP.sites || []).map(s => s.join(',')).join(';'); if (TER.key === key) return;
  const had = CACHE.get(key); if (had) { Object.assign(TER, had, { beacons: had.beacons.map(b => ({ ...b, held: 0, alive: true })) }); MAP.vents = TER.vents; settle(); return; }
  const T = none(); T.key = key; const k = MAP.k || 1, D = dice(MAP.code * 131 + 17), sites = MAP.sites || [], hx = VHOME.x, hz = VHOME.z;
  const [mx, mz] = MAP.mid || [OUTPOST.x / 2, OUTPOST.z / 2], rad = MAP.rad || 200 * k, segs = paths(), cx = hx / 2, cz = hz / 2;
  const homeD = (x: number, z: number) => Math.min(Math.hypot(x, z), Math.hypot(x - hx, z - hz));
  /** Room for a raised piece of ground of reach r round (x, z): off every path, away from both bases and every field, inside the world, apart from the rest. */
  const room = (x: number, z: number, r: number, pathGap = 9, siteGap = 18) => {
    if (homeD(x, z) < 50 + r || Math.hypot(x - mx, z - mz) > rad - r - 14) return false;
    if (MAP.wreck && [MAP.wreck, swapEnd(MAP.wreck[0], MAP.wreck[1])].some(([wx, wz]) => Math.hypot(x - wx, z - wz) < r + 14)) return false;   // the wrecked hauler keeps its spot
    for (const s of segs) if (segD(x, z, s[0], s[1], s[2], s[3]) < r + pathGap) return false;
    for (const s of sites) if (Math.hypot(x - s[0], z - s[1]) < r + siteGap) return false;
    for (const R of T.ridges) if (segD(x, z, R.ax, R.az, R.bx, R.bz) < r + R.r + 12) return false;
    return true;
  };
  const both = (R: Ridge) => { T.ridges.push(R, twin(R)); };
  if (madeHere()) { planGround(T, MADE.plan!); for (const R of T.ridges) box(R); T.ridges.forEach((R, i) => R.id = i); CACHE.set(key, T); Object.assign(TER, T); MAP.vents = T.vents; settle(); return; }
  if (MAP.starts) { ringGround(T, D, room); for (const R of T.ridges) box(R); T.ridges.forEach((R, i) => R.id = i); CACHE.set(key, T); Object.assign(TER, T); MAP.vents = T.vents; settle(); return; }

  // 1. Ledges beside the road: high ground with one ramp down to the road, so whoever holds it shoots down on anyone passing.
  let ledges = 0;
  for (const f of [.3, .42, .22, .36, .48]) { if (ledges >= 2) break;
    const r = Math.round((8 + D(0, 3)) * Math.min(1.2, k)), side0 = D() < .5 ? -1 : 1; let placed = false;
    for (const off of [r + 14, r + 18, r + 23, r + 29]) for (const side of [side0, -side0]) { if (placed) break; const s = f * ROAD.len, [x, z] = roadPt(s, side * off), [x2, z2] = swapEnd(x, z); if (!room(x, z, r, 0, 14) || !room(x2, z2, r, 0, 14)) continue;
      if (segs.slice(1).some(q => segD(x, z, q[0], q[1], q[2], q[3]) < r + 6 || segD(x2, z2, q[0], q[1], q[2], q[3]) < r + 6)) continue;
      const R = ridge(x - ROAD.dx * 4, z - ROAD.dz * 4, x + ROAD.dx * 4, z + ROAD.dz * 4, r, LEDGE_H, 'ledge'), nx = ROAD.dz * side, nz = -ROAD.dx * side;   // toward the road
      ramp(R, x + nx * r, z + nz * r, nx, nz, 10, 5.2); both(R); placed = true; ledges++; }
  }
  // 2. The natural: the first field out from each base sits in a horseshoe of cliffs, open toward its own base. One gap faces the enemy and is
  //    the choke; a second gap round the side is sealed by a rock wall until somebody breaks it. Paths that cross the ring get a gap too.
  const nat = sites.length ? [sites[0]] : [];
  for (const [nx0, nz0] of nat) {
    const R0 = 27 * Math.min(1.15, Math.max(.85, k)), N = 24, homeA = Math.atan2(-nz0, -nx0), chokeA = Math.atan2(hz - nz0, hx - nx0), gapA = (a: number, b: number) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));
    const keep: boolean[] = []; for (let i = 0; i < N; i++) { const a = (i + .5) / N * 6.2832, x = nx0 + Math.cos(a) * R0, z = nz0 + Math.sin(a) * R0;
      keep.push(gapA(a, homeA) > .95 && gapA(a, chokeA) > .42 && homeD(x, z) > 46 && Math.hypot(x - mx, z - mz) < rad - 16 && !segs.some((s, j) => segD(x, z, s[0], s[1], s[2], s[3]) < (j ? 5.5 : 9)) && !sites.slice(1).some(s => Math.hypot(x - s[0], z - s[1]) < 22)); }
    // A gap where a path had to cross gets its neighbours dropped too, so it is as wide as the choke.
    const cut = keep.map((v, i) => v && keep[(i + 1) % N] && keep[(i + N - 1) % N]);
    // The back door: the kept stretch furthest round from the choke, two pieces wide, sealed with rocks.
    let door = -1, dd = 0; for (let i = 0; i < N; i++) { const a = (i + 1) / N * 6.2832; if (cut[i] && cut[(i + 1) % N] && cut[(i + N - 1) % N] && cut[(i + 2) % N]) { const g = Math.min(gapA(a, chokeA), gapA(a, homeA)); if (g > dd) { dd = g; door = i; } } }
    if (door >= 0 && dd > .9) { cut[door] = cut[(door + 1) % N] = false; const a = (door + 1) / N * 6.2832, x = nx0 + Math.cos(a) * R0, z = nz0 + Math.sin(a) * R0; T.walls.push([x, z, a, 2 * R0 * Math.sin(3.1416 / N) * 2 - 2 * RIDGE_R + 1.6]); }
    const first = T.ridges.length; let rampOn = -1, rd = 9;
    for (let i = 0; i < N; i++) { if (!cut[i]) continue; const a0 = i / N * 6.2832, a1 = (i + 1) / N * 6.2832, R = ridge(nx0 + Math.cos(a0) * R0, nz0 + Math.sin(a0) * R0, nx0 + Math.cos(a1) * R0, nz0 + Math.sin(a1) * R0, RIDGE_R, RIDGE_H, 'ridge');
      T.ridges.push(R); const g = gapA((a0 + a1) / 2, chokeA); if (g < rd && g > .42) { rd = g; rampOn = T.ridges.length - 1; } }
    // A ramp up from inside the natural onto the cliff beside the choke, so the side holding the field can stand over its own way in.
    if (rampOn >= 0) { const R = T.ridges[rampOn], mxr = (R.ax + R.bx) / 2, mzr = (R.az + R.bz) / 2, l = Math.hypot(nx0 - mxr, nz0 - mzr), ux = (nx0 - mxr) / l, uz = (nz0 - mzr) / l; ramp(R, mxr + ux * 3, mzr + uz * 3, ux, uz, 9, 4.8); }
    // The other end gets the same, turned round, whenever its first field is this one's twin (the fair layout, and hidden maps).
    if (sites[1] && sites[1][2]) { const n = T.ridges.length; for (let i = first; i < n; i++) T.ridges.push(twin(T.ridges[i])); for (const w of T.walls.slice()) { const [x, z] = swapEnd(w[0], w[1]); T.walls.push([x, z, w[2] + Math.PI, w[3]]); } }
  }
  // 3. Island fields on Large and Vast maps: a field on a table of rock with no ramp, the same walk from both bases, one each side of the middle.
  if (k >= 1.35) {
    const ux = ROAD.dz, uz = -ROAD.dx;
    for (const off of [95, 110, 80, 125, 65].map(v => v * k / 1.4)) { const x = cx + ux * off, z = cz + uz * off, [x2, z2] = swapEnd(x, z), r = 17; if (!room(x, z, r, 10, 30) || !room(x2, z2, r, 10, 30)) continue;
      const R = ridge(x, z, x, z, r, ISLAND_H, 'island'); both(R);
      for (const [fx, fz] of [[x, z], [x2, z2]]) T.fields.push({ x: fx, z: fz, seams: [[-5, -3, 9, 1.3], [4, -5, 8, 1.2], [6, 3, 9, 1.3], [-3, 6, 8, 1.2], [-7, 3, 7, 1.1]], amount: 1200, rich: 1, island: true });
      break; }
  }
  for (const R of T.ridges) box(R); T.ridges.forEach((R, i) => R.id = i);

  // 4. Flux vents: two by each base building and two by every field, on the side away from home so they never sit on a walk to the ore.
  const vents: [number, number][] = [], vent = (x: number, z: number) => { vents.push([Math.round(x * 10) / 10, Math.round(z * 10) / 10]); };
  for (const [vx, vz] of [[-17, 14], [-22, -5]]) { vent(vx, vz); const [tx, tz] = swapEnd(vx, vz); vent(tx, tz); }
  sites.forEach((s, i) => { if (s[2] && i) { const p = vents.slice(-2); for (const [x, z] of p.slice(0)) { const [tx, tz] = swapEnd(x, z); vent(tx, tz); } return; }
    const [sx, sz] = s;
    // A field the same walk from both bases (the odd one out in a fair layout) gets its vents across the line between the bases, so they stay the same walk from both.
    if (LAYOUT.fair && Math.abs(Math.hypot(sx, sz) - Math.hypot(sx - hx, sz - hz)) < 6) { const L = Math.hypot(hx, hz) || 1, px = -hz / L, pz = hx / L; vent(sx + px * 13, sz + pz * 13); vent(sx - px * 13, sz - pz * 13); return; }
    const l = Math.hypot(sx, sz) || 1, ox = sx / l, oz = sz / l; for (const a of [-1.15, 1.15]) { const ca = Math.cos(a), sa = Math.sin(a), dx = ox * ca - oz * sa, dz = ox * sa + oz * ca; vent(sx + dx * 13, sz + dz * 13); } });
  for (const f of T.fields) { vent(f.x - 9, f.z - 9); vent(f.x + 9, f.z + 9); }
  T.vents = vents;

  // 5. Bright seams: the pair of fields furthest out in the open (furthest from both bases at once), richer per load.
  if (sites.length >= 4) { let bi = -1, bd = 0; sites.forEach((s, i) => { if (i < 2 || !sites[i + 1] || !sites[i + 1][2] || s[2]) return; const d = homeD(s[0], s[1]); if (d > bd) { bd = d; bi = i; } }); if (bi >= 0) T.bright.push(bi, bi + 1); }

  // 6. Survey Beacons: a pair on either side of the middle, each the same walk from both bases, between the road and the flank.
  { const ux = ROAD.dz, uz = -ROAD.dx, L = Math.hypot(hx, hz);
    let done = false; for (const f of [.26, .2, .32, .38, .14, .44, .1]) for (const sl of [0, .15, -.15, .3, -.3]) { if (done) break; const off = L * f, x = cx + ux * off + ROAD.dx * L * sl, z = cz + uz * off + ROAD.dz * L * sl, [x2, z2] = swapEnd(x, z); if (!room(x, z, 3, 5, 12) || !room(x2, z2, 3, 5, 12)) continue;
      T.beacons.push({ x, z, held: 0, alive: true }, { x: x2, z: z2, held: 0, alive: true }); done = true; } }

  CACHE.set(key, T); Object.assign(TER, T); MAP.vents = T.vents; settle();
}
/** After a layout: join touching ridges into groups, stand every rock wall up, and drop the old route map. */
function settle() {
  const rs = TER.ridges, g = rs.map((_, i) => i), find = (i: number): number => g[i] === i ? i : (g[i] = find(g[i]));
  for (let i = 0; i < rs.length; i++) for (let j = i + 1; j < rs.length; j++) { const A = rs[i], B = rs[j]; if (Math.abs(A.h - B.h) < .01 && segSeg(A.ax, A.az, A.bx, A.bz, B.ax, B.az, B.bx, B.bz) < A.r + B.r - .5) g[find(i)] = find(j); }
  const ids = new Map<number, number>(); GROUPS = []; for (let i = 0; i < rs.length; i++) { const r = find(i); if (!ids.has(r)) { ids.set(r, GROUPS.length); GROUPS.push([]); } rs[i].group = ids.get(r)!; GROUPS[rs[i].group].push(...rs[i].ramps); }
  WALL_UP.length = 0; for (let i = 0; i < TER.walls.length; i++) WALL_UP.push(true); GRAPH = null;
}
/** Seams the engine should dress as bright: the ore nodes it made for site i. */
export const isBright = (i: number) => TER.bright.includes(i);
/** How much more a load from a bright seam holds. */
export const BRIGHT = 1.4;

// ------------------------------------------------------------ on the map
/** Draws the ground onto a map canvas: high ground lighter with a dark cliff line, ramps, rock walls, vents and Survey Beacons. X and Z turn
 *  world metres into canvas pixels and k is pixels per metre. Vents and beacons show once this side has seen the ground they are on. */
export function drawMap(c: CanvasRenderingContext2D, X: (x: number) => number, Z: (z: number) => number, k: number, team: number, seen: (x: number, z: number) => boolean) {
  if (!TER.ridges.length && !TER.vents.length && !TER.beacons.length) return;
  c.save(); c.lineCap = 'round';
  for (const pass of [0, 1]) for (const R of TER.ridges) { c.strokeStyle = pass ? (R.island ? '#a58f86' : '#8a6a58') : '#22140f'; c.lineWidth = Math.max(2, (2 * R.r + (pass ? 0 : 2.4)) * k); c.beginPath(); c.moveTo(X(R.ax), Z(R.az)); c.lineTo(X(R.bx) + .01, Z(R.bz)); c.stroke(); }
  c.lineCap = 'butt';
  for (const R of TER.ridges) for (const m of R.ramps) { c.strokeStyle = '#b48d6c'; c.lineWidth = Math.max(1.5, m.w * k); c.beginPath(); c.moveTo(X(m.tx - m.ux), Z(m.tz - m.uz)); c.lineTo(X(m.fx), Z(m.fz)); c.stroke(); }
  for (const [x, z, a, len] of TER.walls) { const tx = -Math.sin(a), tz = Math.cos(a); c.strokeStyle = '#1b1210'; c.lineWidth = Math.max(2, 3 * k); c.beginPath(); c.moveTo(X(x - tx * len / 2), Z(z - tz * len / 2)); c.lineTo(X(x + tx * len / 2), Z(z + tz * len / 2)); c.stroke(); }
  for (const [x, z] of TER.vents) { if (!seen(x, z)) continue; c.fillStyle = '#f05ad2'; c.beginPath(); c.arc(X(x), Z(z), Math.max(1.6, 1.3 * k), 0, 7); c.fill(); }
  for (const B of TER.beacons) { if (!seen(B.x, B.z)) continue; const mine = B.alive && B.held & (1 << team); c.strokeStyle = !B.alive ? '#5a463e' : mine ? '#ffe36a' : B.held ? '#ff6a4a' : '#d8c7b0'; c.lineWidth = 1.6; c.beginPath(); c.arc(X(B.x), Z(B.z), Math.max(3, BEACON.REACH * k), 0, 7); c.stroke();
    if (mine) { c.strokeStyle = 'rgba(255,227,106,.35)'; c.beginPath(); c.arc(X(B.x), Z(B.z), BEACON.SEE * k, 0, 7); c.stroke(); } }
  c.restore();
}

/** The ground of a team map: everything for start 0's share of the map, then the same turned round to every other start. */
function ringGround(T: Terrain, D: (a?: number, b?: number) => number, room0: (x: number, z: number, r: number, pathGap?: number, siteGap?: number) => boolean) {
  const n = MAP.ring!, k = MAP.k || 1, [cx, cz] = MAP.mid!, sites = MAP.sites || [], starts = MAP.starts!, R = Math.hypot(cx, cz), gapA = (a: number, b: number) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));
  const spin = (R0: Ridge, i: number): Ridge => { const [ax, az] = turn(MAP, i, R0.ax, R0.az), [bx, bz] = turn(MAP, i, R0.bx, R0.bz), Q = ridge(ax, az, bx, bz, R0.r, R0.h, R0.kind);
    for (const m of R0.ramps) { const [tx, tz] = turn(MAP, i, m.tx, m.tz), [fx, fz] = turn(MAP, i, m.fx, m.fz), [ux, uz] = turnDir(MAP, i, m.ux, m.uz); Q.ramps.push({ tx, tz, fx, fz, w: m.w, ux, uz, len: m.len }); } return Q; };
  const all = (x: number, z: number) => Array.from({ length: n }, (_, i) => turn(MAP, i, x, z));
  // Room for a piece in start 0's share, and for each of its copies: clear of every start's base, every road and every field.
  const mine: Ridge[] = [], walls: Wall[] = [], apart = (px: number, pz: number, r: number) => mine.every(Q => segD(px, pz, Q.ax, Q.az, Q.bx, Q.bz) > Q.r + r + 7);
  const room = (x: number, z: number, r: number, pathGap = 8, siteGap = 18) => all(x, z).every(([px, pz]) => room0(px, pz, r, pathGap, siteGap) && apart(px, pz, r) && starts.every(([sx, sz]) => Math.hypot(px - sx, pz - sz) > 50 + r));
  // Start 0's natural in its horseshoe: open toward start 0, the choke toward the middle, a rock wall across the back way.
  const si = sites.findIndex((_, i) => ringSite(i)?.kind === 'natural' && ringSite(i).step === 0);
  if (si >= 0) { const [nx0, nz0] = sites[si], R0 = 27 * Math.min(1.15, Math.max(.75, k)), gap = k < .9 ? 38 : 46, N = 24, homeA = Math.atan2(-nz0, -nx0), chokeA = Math.atan2(cz - nz0, cx - nx0);
    const roads = MAP.roads || [], keep: boolean[] = [], own = all(nx0, nz0);
    for (let i = 0; i < N; i++) { const a = (i + .5) / N * 6.2832, x = nx0 + Math.cos(a) * R0, z = nz0 + Math.sin(a) * R0; keep.push(gapA(a, homeA) > .95 && gapA(a, chokeA) > .42 && all(x, z).every(([px, pz], c) => starts.every(([sx, sz]) => Math.hypot(px - sx, pz - sz) > gap) && !roads.some(q => segD(px, pz, q[0], q[1], q[2], q[3]) < 8) && !sites.some(q => Math.hypot(q[0] - own[c][0], q[1] - own[c][1]) > 3 && Math.hypot(px - q[0], pz - q[1]) < 22))); }
    const cut = keep.map((v, i) => v && keep[(i + 1) % N] && keep[(i + N - 1) % N]);
    let door = -1, dd = 0; for (let i = 0; i < N; i++) { const a = (i + 1) / N * 6.2832; if (cut[i] && cut[(i + 1) % N] && cut[(i + N - 1) % N] && cut[(i + 2) % N]) { const g = Math.min(gapA(a, chokeA), gapA(a, homeA)); if (g > dd) { dd = g; door = i; } } }
    if (door >= 0 && dd > .9) { cut[door] = cut[(door + 1) % N] = false; const a = (door + 1) / N * 6.2832; walls.push([nx0 + Math.cos(a) * R0, nz0 + Math.sin(a) * R0, a, 2 * R0 * Math.sin(3.1416 / N) * 2 - 2 * RIDGE_R + 1.6]); }
    let rampOn: Ridge | null = null, rd = 9;
    for (let i = 0; i < N; i++) { if (!cut[i]) continue; const a0 = i / N * 6.2832, a1 = (i + 1) / N * 6.2832, Q = ridge(nx0 + Math.cos(a0) * R0, nz0 + Math.sin(a0) * R0, nx0 + Math.cos(a1) * R0, nz0 + Math.sin(a1) * R0, RIDGE_R, RIDGE_H, 'ridge'); mine.push(Q); const g = gapA((a0 + a1) / 2, chokeA); if (g < rd && g > .42) { rd = g; rampOn = Q; } }
    if (rampOn) { const Q = rampOn, mxr = (Q.ax + Q.bx) / 2, mzr = (Q.az + Q.bz) / 2, l = Math.hypot(nx0 - mxr, nz0 - mzr), ux = (nx0 - mxr) / l, uz = (nz0 - mzr) / l; ramp(Q, mxr + ux * 3, mzr + uz * 3, ux, uz, 9, 4.8); } }
  // Ledge beside start 0's road to the middle, ramp down to the road.
  { const [sx, sz] = starts[0], dx = cx - sx, dz = cz - sz, L = Math.hypot(dx, dz), ux = dx / L, uz = dz / L;
    let done = false; for (const f of [.45, .38, .55, .3, .62]) { const r = Math.round(9 * Math.min(1.2, k)); for (const side of [1, -1]) for (const off of [r + 14, r + 19, r + 25]) { if (done) break; const x = sx + ux * L * f - uz * side * off, z = sz + uz * L * f + ux * side * off; if (!room(x, z, r, 0, 14)) continue;
      const Q = ridge(x - ux * 4, z - uz * 4, x + ux * 4, z + uz * 4, r, LEDGE_H, 'ledge'), nx = uz * side, nz = -ux * side; ramp(Q, x + nx * r, z + nz * r, nx, nz, 10, 5.2); mine.push(Q); done = true; } if (done) break; } }
  // Island field on Large and Vast: between start 0's road and the next start's, out from the middle.
  const half = 3.1416 / n, ab = Math.atan2(-cz, -cx) + half, islands: [number, number][] = [];
  if (k >= 1.35) for (const ir of [15, 12]) for (const f of [.62, .7, .55, .78, .48, .85]) for (const da of [0, .12, -.12, .22, -.22]) { if (islands.length) break; const x = cx + Math.cos(ab + da) * R * f, z = cz + Math.sin(ab + da) * R * f; if (!room(x, z, ir, 8, 26)) continue; mine.push(ridge(x, z, x, z, ir, ISLAND_H, 'island')); islands.push([x, z]); }
  // Copies for every start.
  for (let i = 0; i < n; i++) { for (const Q of mine) T.ridges.push(i ? spin(Q, i) : Q); for (const [x, z, a, len] of walls) { const [px, pz] = turn(MAP, i, x, z); T.walls.push([px, pz, a + i * 2 * Math.PI / n, len]); }
    for (const [x, z] of islands) { const [px, pz] = turn(MAP, i, x, z); T.fields.push({ x: px, z: pz, seams: [[-5, -3, 9, 1.3], [4, -5, 8, 1.2], [6, 3, 9, 1.3], [-3, 6, 8, 1.2], [-7, 3, 7, 1.1]].map(([sx, sz, a, b]) => { const [dx, dz] = turnDir(MAP, i, sx, sz); return [dx, dz, a, b]; }), amount: 1200, rich: 1, island: true }); } }
  // Vents: two by each start, two by every field, laid for start 0 and turned with it.
  const vents: [number, number][] = [], vent = (p: [number, number]) => vents.push([Math.round(p[0] * 10) / 10, Math.round(p[1] * 10) / 10]);
  for (let i = 0; i < n; i++) for (const v of [[-17, 14], [-22, -5]]) { const [dx, dz] = turnDir(MAP, i, v[0], v[1]), [sx, sz] = starts[i]; vent([sx + dx, sz + dz]); }
  sites.forEach(([x, z], i) => { const S = ringSite(i); if (!S || S.kind === 'main' || S.step) return; const ox = x - starts[S.step][0], oz = z - starts[S.step][1], l = Math.hypot(ox, oz) || 1; const [dx, dz] = S.kind === 'outer' ? [(x - cx) / Math.hypot(x - cx, z - cz), (z - cz) / Math.hypot(x - cx, z - cz)] : [ox / l, oz / l];
    for (const a of [-1.15, 1.15]) { const c = Math.cos(a), s = Math.sin(a); for (const p of all(x + (dx * c - dz * s) * 13, z + (dx * s + dz * c) * 13)) vent(p); } });
  for (const f of T.fields) { const [dx, dz] = [(f.x - cx) / Math.hypot(f.x - cx, f.z - cz), (f.z - cz) / Math.hypot(f.x - cx, f.z - cz)]; vent([f.x - dz * 10, f.z + dx * 10]); vent([f.x + dz * 10, f.z - dx * 10]); }
  T.vents = vents;
  // The fields out on the rim between starts are the bright ones; a Survey Beacon in the middle, and one between each pair of roads.
  sites.forEach((_, i) => { if (ringSite(i)?.kind === 'outer') T.bright.push(i); });
  T.beacons.push({ x: cx, z: cz, held: 0, alive: true });
  let lit = false; for (const f of [.42, .36, .5, .3, .56, .25, .64]) for (const da of [0, .15, -.15, .3, -.3]) { if (lit) break; const x = cx + Math.cos(ab + da) * R * f, z = cz + Math.sin(ab + da) * R * f; if (!room(x, z, 3, 5, 12)) continue; for (const [px, pz] of all(x, z)) T.beacons.push({ x: px, z: pz, held: 0, alive: true }); lit = true; }
  void D;
}

/** The ground of a made map: each piece as placed, and again turned round the middle (unless it sits on the middle, where it is its own twin). */
function planGround(T: Terrain, P: Plan) {
  const mid = (x: number, z: number) => { const [sx, sz] = swapEnd(x, z); return Math.hypot(sx - x, sz - z) < 1.5; };
  const half: Ridge[] = [];
  for (const it of P.items) { const [k, x, z, a = 0, b = 0, c = 0] = it;
    if (k === PK.ledge) half.push(ridge(x, z, a, b, Math.max(4, Math.min(16, c || 8)), LEDGE_H, 'ledge'));
    else if (k === PK.ridge) half.push(ridge(x, z, a, b, RIDGE_R, RIDGE_H, 'ridge'));
    else if (k === PK.island) { const r = Math.max(9, Math.min(20, a || 14)); half.push(ridge(x, z, x, z, r, ISLAND_H, 'island')); }
  }
  // Ramps go onto the nearest high ground that is not an island, pointing out from it toward where they were placed.
  for (const it of P.items) { if (it[0] !== PK.ramp) continue; const [, x, z] = it; let best: Ridge | null = null, bd = 1e9;
    for (const R of half) { if (R.island) continue; const d = segD(x, z, R.ax, R.az, R.bx, R.bz) - R.r; if (d < bd) { bd = d; best = R; } }
    if (!best || bd > 20) continue; const R = best, t = segT(x, z, R.ax, R.az, R.bx, R.bz), qx = R.ax + (R.bx - R.ax) * t, qz = R.az + (R.bz - R.az) * t, l = Math.hypot(x - qx, z - qz) || 1;
    ramp(R, x, z, (x - qx) / l, (z - qz) / l, R.kind === 'ledge' ? 10 : 9, R.kind === 'ledge' ? 5.2 : 4.8); }
  for (const R of half) { T.ridges.push(R); const W = twin(R); if (!(near2(W.ax, W.az, R.ax, R.az) && near2(W.bx, W.bz, R.bx, R.bz)) && !(near2(W.ax, W.az, R.bx, R.bz) && near2(W.bx, W.bz, R.ax, R.az))) T.ridges.push(W); }
  for (const R of T.ridges) if (R.island) T.fields.push({ x: R.ax, z: R.az, seams: [[-5, -3, 9, 1.3], [4, -5, 8, 1.2], [6, 3, 9, 1.3], [-3, 6, 8, 1.2], [-7, 3, 7, 1.1]].map(q => isTwinSide(R.ax, R.az) ? [-q[0], -q[1], q[2], q[3]] : q), amount: 1200, rich: 1, island: true });
  const both = (x: number, z: number, put: (x: number, z: number) => void) => { put(x, z); if (!mid(x, z)) { const [sx, sz] = swapEnd(x, z); put(sx, sz); } };
  for (const it of P.items) { const [k, x, z, a = 0, b = 0, c = 0] = it;
    if (k === PK.vent) both(x, z, (px, pz) => T.vents.push([Math.round(px * 10) / 10, Math.round(pz * 10) / 10]));
    else if (k === PK.beacon) both(x, z, (px, pz) => T.beacons.push({ x: px, z: pz, held: 0, alive: true }));
    else if (k === PK.wall) { const yaw = a * Math.PI / 180, len = Math.max(6, Math.min(30, b || 12)); T.walls.push([x, z, yaw, len]); if (!mid(x, z)) { const [sx, sz] = swapEnd(x, z); T.walls.push([sx, sz, yaw + Math.PI, len]); } }
    else if (k === PK.paint) { const r = Math.max(4, Math.min(40, a || 12)), kind = Math.max(0, Math.min(PAINTS.length - 1, b | 0)); both(x, z, (px, pz) => T.paint.push([px, pz, r, kind])); }
    void c; }
  // Bright fields: the made map's own fields (MAP.sites, laid by data.ts from the plan) marked bright come in twin pairs.
  (MAP.sites || []).forEach((st, i) => { if (st[3] === 1) T.bright.push(i); });
}
const near2 = (ax: number, az: number, bx: number, bz: number) => Math.hypot(ax - bx, az - bz) < 1.5;
/** True for a point nearer the far base than the yard: its island seams are the twin's, turned round. */
const isTwinSide = (x: number, z: number) => Math.hypot(x, z) > Math.hypot(x - VHOME.x, z - VHOME.z);

/** True when a body on the ground below can walk from a to b: straight, or round the cliffs by the route finder. Up a ramp counts. With walls false, rock walls count as already broken. */
export function reachable(ax: number, az: number, bx: number, bz: number, walls = true): boolean {
  const zb = zone(bx, bz);
  if (zb >= 0) { const ms = GROUPS[zb] || []; return ms.some(m => reachable(ax, az, m.fx + m.ux * 3, m.fz + m.uz * 3, walls)); }
  if (clear(ax, az, bx, bz, walls)) return true; const G = graph(), n = G.x.length; if (!n) return false;
  const dist = new Float64Array(n).fill(1e9), done = new Uint8Array(n);
  for (let i = 0; i < n; i++) if (clear(G.x[i], G.z[i], bx, bz, walls)) dist[i] = 0;
  for (;;) { let u = -1, bd = 1e9; for (let i = 0; i < n; i++) if (!done[i] && dist[i] < bd) { bd = dist[i]; u = i; } if (u < 0) break; done[u] = 1;
    const A = G.adj[u]; for (let k = 0; k < A.length; k++) { const v = A[k]; if (done[v] || (walls && G.walls[u][k].some(w => WALL_UP[w]))) continue; if (bd + G.len[u][k] < dist[v]) dist[v] = bd + G.len[u][k]; } }
  for (let i = 0; i < n; i++) if (dist[i] < 1e9 && clear(ax, az, G.x[i], G.z[i], walls)) return true;
  return false;
}
