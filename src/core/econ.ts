// The economy's shared rules: the second resource (Flux, tapped from vents), prices as [ore, Flux], the supply ceiling and how many
// workers a seam takes at full speed. Faction rules decide which kinds cost Flux and which building taps a vent; this file does the rest.
import * as THREE from 'three';
import type { Game } from '../game';
import type { Unit, Building, Kind, BKind, UpKey } from '../data';
import { UNIT, BLD, UPGRADES, MAP, SIDE, VHOME, FACTION, swapEnd } from '../data';
import { bldRule } from './registry';

/** A price: ore, then Flux. */
export type Cost = [number, number];

/** Dials for the economy. Everything here is read every time, so a test or the balance stream can turn a dial mid-match. */
export const ECON = {
  /** No side can hold more than this much supply, however many supply buildings it has. */
  supplyMax: 200,
  /** Workers on one seam: the first `full` mine at full speed, the next `half` at half speed, and any more go and find another seam.
   *  Off (0) keeps the old rule, where any number of workers share a seam at full speed. The balance stream turns it on. */
  full: 0, half: 1,
  /** Flux in a vent, Flux one worker carries back, and seconds it spends at the tap. */
  vent: 2250, trip: 4, tapT: 1.4,
  /** Vents are laid when a side in the match can build a tap ('auto'), always ('on'), or never ('off'). With no tap in any roster yet,
   *  'auto' lays none, so a match without Flux plays exactly as before (vents block building spots and would move the bots). */
  vents: 'auto' as 'auto' | 'on' | 'off',
};

/** A vent in the ground that gives Flux once a side builds its tap on it (a building whose rules say `tap`). */
export interface Vent { id: number; pos: THREE.Vector3; amount: number; max: number; tap: Building | null; obj: THREE.Group | null }

/** What a kind of body or building, or a piece of research, costs. A def with no `flux` costs no Flux. */
export function costOf(k: Kind | BKind | UpKey): Cost {
  const d: any = (UNIT as any)[k] || (BLD as any)[k] || UPGRADES.find(u => u.key === k);
  return d ? [d.cost || 0, d.flux || 0] : [0, 0];
}
/** True when a side holds at least this much of both. */
export function canPay(g: Game, team: number, c: Cost, n = 1) { return g.cash(team) >= c[0] * n && g.flux(team) >= c[1] * n; }
/** Takes a price from a side (n times over). */
export function pay(g: Game, team: number, c: Cost, n = 1) { g.purse[team] = (g.purse[team] || 0) - c[0] * n; g.fluxPurse[team] = (g.fluxPurse[team] || 0) - c[1] * n; }
/** Gives a price back (a cancelled order or a site torn down). */
export function refund(g: Game, team: number, c: Cost, n = 1) { pay(g, team, [-c[0], -c[1]], n); }
/** What a side is short of for a price, in plain words, or '' when it can pay. */
export function shortOf(g: Game, team: number, c: Cost, n = 1) { const o = c[0] * n - g.cash(team), f = c[1] * n - g.flux(team); return [o > 0 ? `${Math.ceil(o)} ore` : '', f > 0 ? `${Math.ceil(f)} Flux` : ''].filter(Boolean).join(' and '); }

// ---------------------------------------------------------------- vents

const ventMat = new THREE.MeshBasicMaterial({ color: 0x46e8c8 }), rimMat = new THREE.MeshLambertMaterial({ color: 0x3a3430 });
/** A plain vent: a dark lip of rock round a glowing mouth. The art streams dress it; this keeps it visible meanwhile. */
function ventModel() {
  const g = new THREE.Group(), rim = new THREE.Mesh(new THREE.TorusGeometry(1.5, .45, 6, 14), rimMat), mouth = new THREE.Mesh(new THREE.CircleGeometry(1.25, 14), ventMat);
  rim.rotation.x = mouth.rotation.x = -Math.PI / 2; rim.position.y = .2; mouth.position.y = .12; g.add(rim, mouth); g.userData.vent = true; return g;
}
/** Is a spot open ground: off the scenery, clear of ore and the other vents, and inside the edge of the world. */
function clear(g: Game, x: number, z: number, taken: number[][]) {
  const [mx, mz] = MAP.mid || [0, 0]; if (Math.hypot(x - mx, z - mz) > (MAP.rad || 1e9) * .9) return false;
  for (const p of g.props) if (p.alive && Math.hypot(p.x - x, p.z - z) < p.r + 3) return false;
  for (const o of g.ores) if (Math.hypot(o.pos.x - x, o.pos.z - z) < 6) return false;
  for (const v of taken) if (Math.hypot(v[0] - x, v[1] - z) < 8) return false;
  return true;
}
/** The first open spot on rings round a point, starting at `ang` and swinging either way. */
function near(g: Game, x: number, z: number, ang: number, r0: number, taken: number[][]): number[] | null {
  for (let r = r0; r < r0 + 18; r += 3) for (let i = 0; i < 12; i++) { const a = ang + (i % 2 ? 1 : -1) * Math.ceil(i / 2) * .32, px = Math.round(x + Math.cos(a) * r), pz = Math.round(z + Math.sin(a) * r); if (clear(g, px, pz, taken)) return [px, pz]; }
  return null;
}
/** Where the vents go: two behind each home base and one by every ore field out on the map. A map can list its own (MAP.vents).
 *  In a fair layout the far end's vents are the yard's turned end for end, and a twinned field's vent is its twin's, so both sides get the same walks. */
export function ventSpots(g: Game): number[][] {
  const given = (MAP as any).vents as number[][] | undefined; if (given && given.length) return given.map(v => [v[0], v[1]]);
  const out: number[][] = [], [hx, hz] = [0, 0], [fx, fz] = [VHOME.x, VHOME.z], away = Math.atan2(hz - fz, hx - fx);
  for (const s of [-1, 1]) { const p = near(g, hx, hz, away + s * .9, 26, out); if (p) out.push(p); }
  for (const p of out.slice()) { const [x, z] = swapEnd(p[0], p[1]).map(Math.round); out.push(clear(g, x, z, out) ? [x, z] : near(g, fx, fz, Math.atan2(z - fz, x - fx), Math.hypot(x - fx, z - fz), out) || [x, z]); }
  let prev: number[] | null = null;
  (MAP.sites || []).forEach(([ex, ez, twin]) => {
    if (twin && prev) { const [x, z] = swapEnd(prev[0], prev[1]).map(Math.round); out.push([x, z]); prev = null; return; }
    const p = near(g, ex, ez, Math.atan2(ez, ex) + Math.PI / 2, 13, out); if (p) out.push(p); prev = p;
  });
  return out;
}
/** Lays the vents in a new world. No dice are thrown, so the seeded matches run the same. */
export function layVents(g: Game) {
  if (ECON.vents === 'off' || (ECON.vents === 'auto' && ![SIDE.home, SIDE.out].some(t => FACTION[t].builds.some(k => bldRule(k).tap)))) return;
  // A rock or crystal standing on a vent would keep a tap off it for good, and props were only kept clear round the yard: on Needle's Eye
  // a crystal sat on one of the far base's two home vents, so the far end could never tap it (stream L). Clear any solid prop off a vent.
  for (const [x, z] of ventSpots(g)) for (const p of g.spires.slice()) if (Math.abs(p.x - x) < p.r + 3.2 && Math.abs(p.z - z) < p.r + 3.2) g.clearProp(p);
  for (const [x, z] of ventSpots(g)) { const obj = ventModel(); obj.position.set(x, 0, z); g.scene.add(obj); g.vents.push({ id: g.vents.length + 1 /* per game, so a replay names the same vents (K) */, pos: new THREE.Vector3(x, 0, z), amount: ECON.vent, max: ECON.vent, tap: null, obj }); }
}
/** The vent under a spot, if any (for placing a tap). */
export function ventAt(g: Game, x: number, z: number, r = 2.5) { return g.vents.find(v => Math.hypot(v.pos.x - x, v.pos.z - z) < r) || null; }
/** A finished tap of this side, standing on a vent with Flux left. */
export const tapped = (g: Game, v: Vent, team: number) => !!v.tap && v.tap.alive && v.tap.built && v.tap.team === team && v.amount > 0;

/** Sends a worker to carry Flux from a vent its side has tapped. Pass null to send it back to ore. */
export function sendToVent(g: Game, u: Unit, v: Vent | null) { u.vent = v; u.node = null; u.state = v ? 'toVent' : 'idle'; }
/** A worker's Flux run. Returns true when it handled the worker this frame (the ore run is skipped). */
export function ventWork(g: Game, u: Unit, dt: number): boolean {
  const v = u.vent; if (!v) return false;
  if (!tapped(g, v, u.team) && !(u.fluxing! > 0)) { u.vent = null; u.state = 'idle'; return false; }
  const tap = v.tap!;
  if (u.state === 'toVent' || u.state === 'idle') { if (g.distToBox(tap, u.pos.x, u.pos.z) < 1.6) { u.state = 'tapping'; u.timer = ECON.tapT; } else g.moveTo(u, tap.pos.x, tap.pos.z, dt, .3); return true; }
  if (u.state === 'tapping') { u.timer -= dt; if (u.timer <= 0) { const n = Math.min(ECON.trip, v.amount); v.amount -= n; u.fluxing = n; if (u.rig.pack) u.rig.pack.visible = true; u.state = 'toHQ'; } return true; }
  if (u.state === 'toHQ' && u.fluxing! > 0) {
    const hq = g.nearHQ(u.pos.x, u.pos.z, u.team); if (!hq) return true;
    if (g.distToBox(hq, u.pos.x, u.pos.z) < 1.7 + g.bankReach(hq)) { g.fluxPurse[u.team] = (g.fluxPurse[u.team] || 0) + u.fluxing!; u.fluxing = 0; if (u.rig.pack) u.rig.pack.visible = false; u.state = 'toVent'; }
    else g.moveTo(u, hq.pos.x, hq.pos.z, dt, .3);
    return true;
  }
  return false;
}

// ---------------------------------------------------------------- seams
/** How fast a worker mines a seam, by how many of its side are already mining it: 1, then 1/2 for the next, 0 once it is full (go elsewhere).
 *  With ECON.full at 0 every worker mines at full speed, the old rule. */
export function seamRate(g: Game, u: Unit): number {
  if (!ECON.full || !u.node) return 1; let ahead = 0;
  for (const o of g.units) if (o !== u && o.alive && o.node === u.node && o.team === u.team && o.state === 'mining' && o.id < u.id) ahead++;
  return ahead < ECON.full ? 1 : ahead < ECON.full + ECON.half ? .5 : 0;
}
/** Is a seam full for this side (every full-speed and half-speed place taken)? */
export function seamFull(g: Game, n: { pos: THREE.Vector3 }, team: number, me: Unit) {
  if (!ECON.full) return false; let k = 0; for (const o of g.units) if (o !== me && o.alive && o.node === n && o.team === team) k++; return k >= ECON.full + ECON.half;
}

/** A side's supply ceiling, from what its buildings give, never more than ECON.supplyMax. */
export const capSupply = (n: number) => Math.min(ECON.supplyMax, n);
