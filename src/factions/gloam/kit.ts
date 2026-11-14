// Small shared pieces for the Gloam rules: what a hit is worth after research, the Cap tiers, spit that lands at once, bodies with a timed life.
import * as THREE from 'three';
import { V3, M } from '../../gfx';
import { sfx } from '../../audio';
import type { Game } from '../../game';
import { UNIT, Unit, Building, BKind, isUnit, fac } from '../../data';
import { levelMul } from '../../core/combat';
import { hasStatus } from '../../core/status';
import { seenBy } from '../../core/sight';
import { G_SPITS, G_FLIES, type GUpKey } from './numbers';

const TMP = V3();
export const spitMat = new THREE.MeshBasicMaterial({ color: 0xc8ff3c, depthWrite: false });
export const bileMat = new THREE.MeshBasicMaterial({ color: 0x9fd23a, depthWrite: false });
export const acidMat = new THREE.MeshBasicMaterial({ color: 0xe0ff5a, depthWrite: false });
export const spineMat = new THREE.MeshBasicMaterial({ color: 0xf0e2b8 });

/** A research line's multiplier in percent mode (25%, 20%, 15%), for the lines the engine does not keep itself (Spit, Flier Bite, Flier Hide). */
const PCT = [1.25, 1.2, 1.15];
export function lineMul(g: Game, team: number, keys: GUpKey[]) { const U = g.upOf(team) as Record<string, boolean>; let m = 1; keys.forEach((k, i) => { if (U[k]) m *= PCT[i]; }); return m; }
export const SPIT: GUpKey[] = ['gspit1', 'gspit2', 'gspit3'], FLY: GUpKey[] = ['gfly1', 'gfly2', 'gfly3'], FHIDE: GUpKey[] = ['gfhide1', 'gfhide2', 'gfhide3'];
/** What a Gloam hit is worth: the shift on a bot side, times the research line for this kind (Bite for biters, Spit for spitters, Flier Bite
 *  for fliers). With no kind given it is the Bite line, as it always was. */
export function gMul(g: Game, team: number, kind?: string) {
  const foe = g.foeK(team);
  if (kind && G_FLIES.has(kind)) return foe * lineMul(g, team, FLY);
  if (kind && G_SPITS.has(kind)) return foe * lineMul(g, team, SPIT);
  return foe * levelMul(g, team, 'atk');
}

/** The Mother Cap and its two ripened tiers. */
export const CAPS: BKind[] = ['mothercap', 'eldercap', 'ancientcap'];
export const isCap = (b: Building) => b.kind === 'mothercap' || b.kind === 'eldercap' || b.kind === 'ancientcap';
export const tierOf = (b: Building) => b.kind === 'ancientcap' ? 3 : b.kind === 'eldercap' ? 2 : b.kind === 'mothercap' ? 1 : 0;
/** The highest finished Cap tier a side has. */
export const topTier = (g: Game, team: number) => g.buildings.reduce((n, b) => b.alive && b.built && b.team === team ? Math.max(n, tierOf(b)) : n, 0);

export const dist = (a: { pos: THREE.Vector3 }, b: { pos: THREE.Vector3 }) => Math.hypot(a.pos.x - b.pos.x, a.pos.z - b.pos.z);
export const reach = (g: Game, u: Unit, t: Unit | Building) => isUnit(t) ? dist(u, t) : g.distToBox(t, u.pos.x, u.pos.z);
export const raiding = (u: Unit) => u.order.type === 'raid' || u.order.type === 'amove';
export const dug = (u: Unit) => hasStatus(u, 'dug');
export const yOf = (t: Unit | Building) => isUnit(t) ? UNIT[t.kind].bodyY + (t.alt || 0) : Math.min(t.h * .5, 3) + (t.alt || 0);
export const isGloamTeam = (t: number) => fac(t) === 2;

/** Spit that lands at once: a streak from the body to the target and the hit. Reaches fliers, which a lobbed projectile would fly under. */
export function spitAt(g: Game, u: Unit, t: Unit | Building, dmg: number, mat: THREE.Material = spitMat, fromY = 1.2) {
  const a = V3(u.pos.x + Math.sin(u.yaw) * .8, fromY + (u.alt || 0), u.pos.z + Math.cos(u.yaw) * .8), e = V3(t.pos.x, yOf(t), t.pos.z);
  g.tracer(a, e, mat, .12); g.puff(e, 2, .45, M.gS, .5); g.damage(t, dmg, u); u.swing = 1; u.flashT = .08;
}
/** The nearest live enemy body to a spot, inside `r`, that `by` may hit (seen, and on a layer it can reach). */
export function nearestFoeAt(g: Game, team: number, x: number, z: number, r: number, test?: (o: Unit) => boolean) {
  let best: Unit | null = null, bd = r;
  for (const o of g.units) { if (!o.alive || !isEnemy(o.team, team) || o.inside || (test && !test(o)) || ((o.status || UNIT[o.kind].cloak) && !seenBy(g, team, o))) continue; const d = Math.hypot(o.pos.x - x, o.pos.z - z); if (d < bd) { bd = d; best = o; } }
  return best;
}

/** Bodies that live for a set time (Husks, Pups): seconds left by id. They wither when it runs out. */
const LIFE = new Map<number, number>();
export function giveLife(u: Unit, secs: number) { LIFE.set(u.id, secs); }
export function tickLife(g: Game, dt: number) {
  if (!LIFE.size) return;
  for (const [id, t] of LIFE) { const u = byId(g, id); if (!u || !u.alive) { LIFE.delete(id); continue; } const n = t - dt; if (n <= 0) { LIFE.delete(id); g.puff(TMP.set(u.pos.x, .4, u.pos.z), 3, .5, M.gS, .4); g.killUnit(u, null); } else LIFE.set(id, n); }
}
export const lifeLeft = (u: Unit) => LIFE.get(u.id) ?? -1;
export const clearLife = () => LIFE.clear();

/** A short wet sound for a Gloam hit, quieter far from the player. */
export const squelch = (g: Game, p: THREE.Vector3, k = .6) => sfx.slash(g.vol(p) * k);

// ---------------------------------------------------------------- poses for stream G's art (look/cast2.ts reads u.act and u.actP)
/** The pose name each ability or attack plays, by ability key, and by kind for a plain attack. */
export const ACT_OF: Record<string, string> = { seed: 'seed', pod: 'pod', mend: 'mend', bile: 'lob', choke: 'choke', mind: 'rot', fling: 'fling', reel: 'reel', cloud: 'cloud', drink: 'drink', dig: 'curl' };
export const HIT_ACT: Record<string, string> = { keeper: 'spit', shellback: 'spit', lobber: 'bite', needler: 'fire', bloater: 'acid', sower: 'drop', seeder: 'fling', gnatwing: 'bite', husk: 'bite', pup: 'bite' };
/** Starts a pose: u.act names it and u.actP runs 0 to 1 over `secs` (tickAct). */
export function act(u: Unit, name: string | undefined, secs = .45) { if (!name) return; const a = u as any; a.act = name; a.actP = 0; a.actT = secs; }
export function tickAct(u: Unit, dt: number) {
  const a = u as any; if (u.cast && ACT_OF[u.cast.key]) { if (a.act !== ACT_OF[u.cast.key]) act(u, ACT_OF[u.cast.key], u.cast.t + .3); }
  if (!a.act) return; a.actP = Math.min(1, a.actP + dt / (a.actT || .45)); if (a.actP >= 1) { a.act = ''; a.actP = 0; }
}
/** A body by id (g.uById is only kept by online clients). */
export const byId = (g: Game, id: number) => g.units.find(o => o.id === id) || null;

// ---------------------------------------------------------------- what the enemy can answer (the bots hold back on what nobody can fight)
import { isEnemy } from '../../core/sides';
import { BLD } from '../../data';
const CAN = new Map<number, { t: number; air: boolean; see: boolean }>();
/** Can any enemy of `team` hit fliers, and can any see dug-in bodies? Checked at most every 5 s. */
export function foeAnswers(g: Game, team: number) {
  let c = CAN.get(team); if (c && g.time - c.t < 5 && g.time >= c.t) return c;
  let air = false, see = false;
  for (const u of g.units) { if (!u.alive || !isEnemy(team, u.team)) continue; const d = UNIT[u.kind]; if (d.hits === 'air' || d.hits === 'both') air = true; if (d.detect) see = true; if (air && see) break; }
  if (!(air && see)) for (const b of g.buildings) { if (!b.alive || !isEnemy(team, b.team)) continue; const d = BLD[b.kind] as any; if (d.hits === 'air' || d.hits === 'both') air = true; if (d.detect) see = true; }
  CAN.set(team, c = { t: g.time, air, see }); return c;
}
