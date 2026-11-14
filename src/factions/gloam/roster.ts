// The Gloam's full-depth roster in play: how each new body fights for the bots and for a player in first person, the new buildings' ticks,
// and the effects that run every frame (Acid, Spore Clouds, Mend, healing dug in, timed bodies, Flier Hide, Bloom dripped by Drifters).
// Abilities (keys, energy, aim) are in abilities.ts; building commands (Cap and Spire ripening, uprooting) in actions.ts.
import * as THREE from 'three';
import { V3, R, M } from '../../gfx';
import { sfx } from '../../audio';
import { isEnemy } from '../../core/sides';
import type { Game } from '../../game';
import { UNIT, BLD, Unit, Building, Kind, isUnit, fac } from '../../data';
import { defineUnits, defineBuildings, defineFaction, addHitFilter, type Hit } from '../../core/registry';
import { useAbility, abilitiesOf, whyNot, type Target } from '../../core/ability';
import { levelMul } from '../../core/combat';
import { hasStatus, addStatus, clearStatus } from '../../core/status';
import { ripenShare } from '../../core/morph';
import { G2, G_TUNE, G_DIGS, G_FLIES, type GKind } from './numbers';
import { gMul, spitAt, spitMat, bileMat, acidMat, spineMat, dist, reach, raiding, dug, nearestFoeAt, giveLife, tickLife, lineMul, FHIDE, isCap, squelch, act, tickAct, HIT_ACT, byId, foeAnswers } from './kit';

const TMP = V3();

// ---------------------------------------------------------------- effects every frame (host)
/** Acid on bodies: id -> seconds left. Every hit on such a body lands 2 harder (the same as 2 less armour). */
export const ACID = new Map<number, number>();
/** Spore Clouds: shots from enemy bodies standing inside one fail. */
export const CLOUDS: { x: number; z: number; r: number; t: number; team: number; obj: THREE.Object3D | null }[] = [];
/** Mend's healing over time: id -> [hp left to give, hp a second]. */
export const MEND = new Map<number, [number, number]>();
const cloudMat = new THREE.MeshBasicMaterial({ color: 0x9db46a, transparent: true, opacity: .32, depthWrite: false });

addHitFilter((g, t, amt, from) => {
  if (isUnit(t) && ACID.has(t.id)) amt += G2.bloater.acid.arm;
  if (from && CLOUDS.length && isUnit(from)) {
    const far = (isUnit(t) ? dist(from, t) : g.distToBox(t, from.pos.x, from.pos.z)) > 3.5;
    if (far) for (const c of CLOUDS) if (c.t > 0 && isEnemy(c.team, from.team) && Math.hypot(from.pos.x - c.x, from.pos.z - c.z) < c.r) return 0;
  }
  return amt;
});

export function addCloud(g: Game, x: number, z: number, team: number) {
  const c = G2.hooksail.cloud; let obj: THREE.Object3D | null = null;
  if (!g.noRender) { obj = new THREE.Mesh(new THREE.SphereGeometry(c.r, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), cloudMat); obj.position.set(x, 0, z); g.scene.add(obj); }
  CLOUDS.push({ x, z, r: c.r, t: c.t, team, obj });
}

/** The Gloam's per-frame systems for the full-depth roster. Host only, except the cloud models which every screen keeps. */
export function rosterFx(g: Game, dt: number) {
  for (let i = CLOUDS.length - 1; i >= 0; i--) { const c = CLOUDS[i]; c.t -= dt; if (c.t <= 0) { if (c.obj) g.scene.remove(c.obj); CLOUDS.splice(i, 1); } }
  if (g.net) return;
  for (const [id, t] of ACID) if (t - dt <= 0) ACID.delete(id); else ACID.set(id, t - dt);
  tickLife(g, dt);
  for (const [id, m] of MEND) { const u = byId(g, id); if (!u || !u.alive || m[0] <= 0) { MEND.delete(id); continue; } const n = Math.min(m[0], m[1] * dt); u.hp = Math.min(u.maxHp, u.hp + n); m[0] -= n; }
  const fhK = new Map<number, number>();
  for (const u of g.units) {
    if (!u.alive || fac(u.team) !== 2) continue;
    tickAct(u, dt); (u as any).ripen = ripenShare(u);   // stream G grows vines over a ripening body
    // Flier Hide: a flier's health follows the Flier Hide levels instead of the ground Hide levels.
    if (G_FLIES.has(u.kind)) { let want = fhK.get(u.team); if (want === undefined) fhK.set(u.team, want = lineMul(g, u.team, FHIDE) / levelMul(g, u.team, 'arm')); const had = (u as any).fhk ?? 1; if (Math.abs(want - had) > 1e-6) { u.maxHp *= want / had; u.hp *= want / had; (u as any).fhk = want; } }
    // Dug in, a Shellback (or Lobber) knits fast.
    if ((u.kind === 'shellback' || u.kind === 'lobber') && isDug(u) && u.hp < u.maxHp) u.hp = Math.min(u.maxHp, u.hp + G2.shellback.dugHeal * (g.upOf(u.team).gmend ? G2.shellback.mendK : 1) * dt);
    // Belly Sacs: a Drifter that hangs still drips Bloom under itself.
    if ((u.kind === 'drifter' || u.kind === 'lookoutsac') && g.upOf(u.team).gbelly) drip(g, u, dt);
    (u as any).dig = Math.max(0, Math.min(1, ((u as any).dig ?? 0) + (isDug(u) ? 1 : -1) * dt / G2.dig.t));
  }
}
function drip(g: Game, u: Unit, dt: number) {
  const a = u as any; if (!a.dripAt) a.dripAt = { x: u.pos.x, z: u.pos.z, t: 0, patch: null };
  const d = a.dripAt, moved = Math.hypot(u.pos.x - d.x, u.pos.z - d.z) > 4;
  if (moved) { if (d.patch) { d.patch.dying = true; d.patch = null; } d.x = u.pos.x; d.z = u.pos.z; d.t = 0; return; }
  d.t += dt; if (!d.patch && d.t > 5) d.patch = g.carpet.add({ team: u.team, drifter: u.id } as any, 'sporepod' as any, u.pos.x, u.pos.z, false);
  if (d.patch) d.patch.max = G2.drifter.drip;
}

// ---------------------------------------------------------------- digging in
/** Bodies dug in with Dug Crawl (Shellbacks and Lobbers): unseen, but free to move. */
const CRAWL = new Set<number>();
export const isDug = (u: Unit) => dug(u) || CRAWL.has(u.id);
export const canDig = (g: Game, u: Unit) => u.kind === 'needler' || (G_DIGS.includes(u.kind as GKind) && !!g.upOf(u.team).gdig);
/** Puts a body under the ground or brings it up. Shellbacks and Lobbers with Dug Crawl stay mobile; everything else is held still. */
export function setDug(g: Game, u: Unit, on: boolean) {
  if (!u.alive || isDug(u) === on) return false;
  if (on) { if ((u.kind === 'shellback' || u.kind === 'lobber') && g.upOf(u.team).gcrawl) { CRAWL.add(u.id); addStatus(u, 'unseen', Infinity); } else addStatus(u, 'dug', Infinity); u.target = null; }
  else { CRAWL.delete(u.id); clearStatus(u, 'dug'); if (!UNIT[u.kind].cloak) clearStatus(u, 'unseen'); }
  g.puff(TMP.set(u.pos.x, .3, u.pos.z), 4, .7, M.dust, .5, 1.2); if (g.vol(u.pos) > .2) sfx.step(false);
  return true;
}

// ---------------------------------------------------------------- shared bot pieces
type Rng = { range: number; cd: number; dmg: (g: Game, u: Unit) => number; mat?: THREE.Material; y?: number; kite?: number; onHit?: (g: Game, u: Unit, t: Unit | Building) => void };
/** A body that spits from range: walk into reach, back off from anything that comes close, spit on its cooldown. */
function aiRanged(g: Game, u: Unit, dt: number, o: Rng) {
  if (g.leash(u, dt)) return;
  if (u.think <= 0) { u.think = .35; const cur = u.target; if (!cur || !cur.alive || reach(g, u, cur) > o.range + 10) u.target = g.acquire(u, o.range + 8, raiding(u) && !(u.order.path && u.order.path.length) ? o.range : 0); }
  const t = u.target;
  if (t && t.alive) {
    const d = reach(g, u, t); u.yaw = Math.atan2(t.pos.x - u.pos.x, t.pos.z - u.pos.z);
    if (d > o.range) g.moveTo(u, t.pos.x, t.pos.z, dt);
    else if (o.kite && isUnit(t) && d < o.kite) { const ax = u.pos.x - t.pos.x, az = u.pos.z - t.pos.z, l = Math.hypot(ax, az) || 1; g.moveTo(u, u.pos.x + ax / l * 4, u.pos.z + az / l * 4, dt, .2, .95); u.yaw = Math.atan2(-ax, -az); }
    if (d <= o.range && u.cd <= 0) { u.cd = o.cd * (.95 + Math.random() * .1); spitAt(g, u, t, o.dmg(g, u), o.mat, o.y); o.onHit?.(g, u, t); act(u, HIT_ACT[u.kind]); sfx.throw(); }
    return;
  }
  g.vIdle(u, dt, raiding(u) ? 5 : 1.5, u.order.type !== 'guard' ? 1 : .6);
}
type Mel = { reach: number; cd: number; dmg: (g: Game, u: Unit, t: Unit | Building) => number; any?: boolean };
/** A body that bites: close in and chew. `any` lets it go for buildings it walks past. */
function aiMelee(g: Game, u: Unit, dt: number, o: Mel) {
  if (u.think <= 0) { u.think = .3; const cur = u.target; if (!cur || !cur.alive) u.target = g.acquire(u, 24, o.any || raiding(u) ? 16 : 0); }
  const t = u.target;
  if (t && t.alive) {
    const isB = !isUnit(t), d = reach(g, u, t);
    if (d > (isB ? 1.1 : o.reach + UNIT[(t as Unit).kind].rad * .5)) g.moveTo(u, t.pos.x, t.pos.z, dt, .3);
    else { u.yaw = Math.atan2(t.pos.x - u.pos.x, t.pos.z - u.pos.z); if (u.cd <= 0) { u.cd = o.cd; u.swing = 1; act(u, 'bite', .35); squelch(g, u.pos); g.damage(t, o.dmg(g, u, t), u); } }
    return;
  }
  g.vIdle(u, dt, 2, 1);
}
/** The nearest own Cap to a body (its home), finished or not. */
const homeCap = (g: Game, u: Unit) => { let best: Building | null = null, bd = 1e9; for (const b of g.buildings) if (b.alive && b.team === u.team && isCap(b)) { const d = Math.hypot(b.pos.x - u.pos.x, b.pos.z - u.pos.z); if (d < bd) { bd = d; best = b; } } return best; };

// ---------------------------------------------------------------- the bots, kind by kind
/** Keeper: stays by its Cap. It fights only what comes within 16 m of the Cap; its abilities run by themselves (abilities.ts). */
function aiKeeper(g: Game, u: Unit, dt: number) {
  const home = homeCap(g, u), K = G2.keeper; if (u.order.type === 'follow') { aiRanged(g, u, dt, { range: K.range, cd: K.cd, dmg: (g, u) => K.spit * gMul(g, u.team, 'keeper') }); return; }
  if (u.think <= 0) { u.think = .4; u.target = home ? nearestFoeAt(g, u.team, home.pos.x, home.pos.z, 16 + home.hx) : g.acquire(u, 12, 0); if (u.target && reach(g, u, u.target) > 26) u.target = null; }
  const t = u.target;
  if (t && t.alive) { const d = reach(g, u, t); u.yaw = Math.atan2(t.pos.x - u.pos.x, t.pos.z - u.pos.z); if (d > K.range) g.moveTo(u, t.pos.x, t.pos.z, dt); else if (u.cd <= 0) { u.cd = K.cd; spitAt(g, u, t, K.spit * gMul(g, u.team, 'keeper'), spitMat, 1.6); sfx.throw(); } return; }
  if (home) { const a = (u.id % 6) * 1.05, r = Math.max(home.hx, home.hz) + 2.5; g.moveTo(u, home.pos.x + Math.cos(a) * r, home.pos.z + Math.sin(a) * r, dt, 1.2, .7); }
}
/** Shellback: spits from 13 m. Hurt and out of the fight, it digs in to knit (once Dig In is bought) and comes up healed or when a foe steps close. */
function aiShellback(g: Game, u: Unit, dt: number) {
  const S = u.kind === 'lobber' ? G2.lobber : G2.shellback;
  if (isDug(u)) { const near = nearestFoeAt(g, u.team, u.pos.x, u.pos.z, 2.2); if (u.hp > u.maxHp * .9 || near || (raiding(u) && u.hp > u.maxHp * .7)) setDug(g, u, false); else if (CRAWL.has(u.id)) g.vIdle(u, dt, 4, G2.shellback.crawl); return; }
  if (canDig(g, u) && u.hp < u.maxHp * .4 && u.cd > -2 && !nearestFoeAt(g, u.team, u.pos.x, u.pos.z, 7)) { setDug(g, u, true); return; }
  aiRanged(g, u, dt, { range: S.range, cd: S.cd, dmg: (g, u) => S.spit * gMul(g, u.team, u.kind), mat: u.kind === 'lobber' ? bileMat : spitMat, y: u.kind === 'lobber' ? 1.6 : 1 });
}
/** Needler: walks up to 9 m of a foe, digs in, and fires spines along a line from under the ground. Comes up to follow a march. */
function aiNeedler(g: Game, u: Unit, dt: number) {
  const N = G2.needler, len = g.upOf(u.team).gspines ? N.deep : N.len;
  if (u.think <= 0) { u.think = .35; const cur = u.target; if (!cur || !cur.alive || reach(g, u, cur) > len + 12) u.target = g.acquire(u, len + 10, raiding(u) ? len : 0); }
  const t = u.target, a = u as any;
  if (t && t.alive) {
    const d = reach(g, u, t); a.idleT = 0;
    if (!isDug(u)) { if (d > len - 1.5) { g.moveTo(u, t.pos.x, t.pos.z, dt); return; } setDug(g, u, true); u.cd = Math.max(u.cd, .8); return; }
    if (d > len + .5) { if (!nearestFoeAt(g, u.team, u.pos.x, u.pos.z, len)) { a.outT = (a.outT || 0) + dt; if (a.outT > 2.5) { a.outT = 0; setDug(g, u, false); } } return; }
    a.outT = 0; u.yaw = Math.atan2(t.pos.x - u.pos.x, t.pos.z - u.pos.z); if (u.cd <= 0) { u.cd = N.cd; spineLine(g, u, u.yaw, len); }
    return;
  }
  if (isDug(u)) { a.idleT = (a.idleT || 0) + dt; if (a.idleT > 4 && (raiding(u) || Math.hypot(u.order.x - u.pos.x, u.order.z - u.pos.z) > 6)) { a.idleT = 0; setDug(g, u, false); } return; }
  g.vIdle(u, dt, raiding(u) ? 5 : 1.5, u.order.type !== 'guard' ? 1 : .6);
}
/** Spines out of the ground along a line: every enemy body and building on it is hit once. */
export function spineLine(g: Game, u: Unit, yaw: number, len: number, by: Unit | null = u) {
  const N = G2.needler, fx = Math.sin(yaw), fz = Math.cos(yaw), dmg = N.dmg * gMul(g, u.team, 'needler'); let n = 0;
  for (const o of g.units) { if (!o.alive || !isEnemy(o.team, u.team) || o.air || o.inside) continue; const dx = o.pos.x - u.pos.x, dz = o.pos.z - u.pos.z, along = dx * fx + dz * fz, side = Math.abs(dx * fz - dz * fx); if (along < 0 || along > len + UNIT[o.kind].rad || side > N.width + UNIT[o.kind].rad * .6) continue; g.damage(o, dmg + (UNIT[o.kind].tags?.includes('plated') ? N.plated : 0), by); n++; }
  for (const b of g.buildings) { if (!b.alive || !isEnemy(b.team, u.team)) continue; for (let s = 1; s <= len; s += 1.5) if (g.distToBox(b, u.pos.x + fx * s, u.pos.z + fz * s) < .6) { g.damage(b, dmg, by); n++; break; } }
  if (!g.noRender) for (let s = 1.2; s <= len; s += 1.4) g.puff(TMP.set(u.pos.x + fx * s, .3, u.pos.z + fz * s), 1, .5, M.dust, 1.4, .4, .35);
  g.tracer(V3(u.pos.x + fx, .2, u.pos.z + fz), V3(u.pos.x + fx * len, .5, u.pos.z + fz * len), spineMat, .16); if (g.vol(u.pos) > .1) sfx.slash(g.vol(u.pos)); u.swing = 1;
  return n;
}
/** Smother: keeps behind the swarm and casts (abilities.ts); runs from anything that reaches it. */
function aiCaster(g: Game, u: Unit, dt: number) {
  if (g.leash(u, dt)) return;
  if (u.think <= 0) { u.think = .4; u.target = g.acquire(u, 9, 0); }
  const t = u.target; if (t && t.alive && reach(g, u, t) < 7) { const ax = u.pos.x - t.pos.x, az = u.pos.z - t.pos.z, l = Math.hypot(ax, az) || 1; g.moveTo(u, u.pos.x + ax / l * 5, u.pos.z + az / l * 5, dt, .2, 1); return; }
  // Trail the nearest friend that is fighting, a few metres back.
  let lead: Unit | null = null, bd = 30; for (const o of g.units) if (o.alive && o.team === u.team && o !== u && o.target && !G_FLIES.has(o.kind) && o.kind !== 'smother' && o.kind !== 'hooksail') { const d = dist(o, u); if (d < bd) { bd = d; lead = o; } }
  if (lead && lead.target) { const tx = lead.pos.x - (lead.target.pos.x - lead.pos.x) * .35, tz = lead.pos.z - (lead.target.pos.z - lead.pos.z) * .35; g.moveTo(u, tx, tz, dt, 2.5, 1); return; }
  g.vIdle(u, dt, raiding(u) ? 6 : 1.5, u.order.type !== 'guard' ? 1 : .6);
}
/** Seeder: walks to within 30 m of a foe, digs in if it can, and throws Husks (abilities.ts) from there. It never closes in. */
function aiSeeder(g: Game, u: Unit, dt: number) {
  if (u.think <= 0) { u.think = .5; const cur = u.target; if (!cur || !cur.alive || reach(g, u, cur) > 45) u.target = g.acquire(u, 40, raiding(u) ? 34 : 0); }
  const t = u.target;
  if (t && t.alive) {
    const d = reach(g, u, t);
    if (isDug(u)) { if (d > 40 || nearestFoeAt(g, u.team, u.pos.x, u.pos.z, 5)) setDug(g, u, false); return; }
    if (d > 30) { g.moveTo(u, t.pos.x, t.pos.z, dt); return; }
    if (d < 12 && isUnit(t)) { const ax = u.pos.x - t.pos.x, az = u.pos.z - t.pos.z, l = Math.hypot(ax, az) || 1; g.moveTo(u, u.pos.x + ax / l * 4, u.pos.z + az / l * 4, dt, .2, 1); return; }
    if (canDig(g, u) && (u.abCd?.fling ?? 0) > 6 && (u === g.me || u.pilot || g.human[u.team] || foeAnswers(g, u.team).see)) setDug(g, u, true);
    return;
  }
  if (isDug(u)) { if (raiding(u)) setDug(g, u, false); return; }
  g.vIdle(u, dt, raiding(u) ? 6 : 1.5, u.order.type !== 'guard' ? 1 : .6);
}
/** Gnatwing: a quick flier. Its bite jumps from the body it hits to two more close by. */
function aiGnatwing(g: Game, u: Unit, dt: number) {
  const N = G2.gnatwing;
  if (g.leash(u, dt)) return;
  if (u.think <= 0) { u.think = .3; const cur = u.target; if (!cur || !cur.alive || reach(g, u, cur) > 30) u.target = g.acquire(u, 26, raiding(u) && !(u.order.path && u.order.path.length) ? 20 : 0); }
  const t = u.target;
  if (t && t.alive) { const d = reach(g, u, t); u.yaw = Math.atan2(t.pos.x - u.pos.x, t.pos.z - u.pos.z); if (d > N.range) g.moveTo(u, t.pos.x, t.pos.z, dt, .5); else if (u.cd <= 0) { u.cd = N.cd; gnatBite(g, u, t); } return; }
  g.vIdle(u, dt, raiding(u) ? 5 : 2, u.order.type !== 'guard' ? 1 : .6);
}
/** One Gnatwing bite and its two jumps. */
export function gnatBite(g: Game, u: Unit, t: Unit | Building, by: Unit | null = u) {
  const N = G2.gnatwing, base = N.bite * gMul(g, u.team, 'gnatwing'), hit = new Set<Unit | Building>([t]); let cur: Unit | Building = t;
  spitAt(g, u, t, base, acidMat, 0);
  for (const k of N.jump) {
    let next: Unit | null = null, bd = N.jumpR; for (const o of g.units) { if (!o.alive || !isEnemy(o.team, u.team) || hit.has(o) || o.inside) continue; const d = Math.hypot(o.pos.x - cur.pos.x, o.pos.z - cur.pos.z); if (d < bd) { bd = d; next = o; } }
    if (!next) break; hit.add(next); g.tracer(V3(cur.pos.x, 1, cur.pos.z), V3(next.pos.x, UNIT[next.kind].bodyY + (next.alt || 0), next.pos.z), acidMat, .08); g.damage(next, base * k, by); cur = next;
  }
  if (g.vol(u.pos) > .1) sfx.hit();
}
/** Bloater: hunts fliers only. Its spit leaves Acid that makes every hit on the body land 2 harder for 10 s. */
function aiBloater(g: Game, u: Unit, dt: number) {
  const B = G2.bloater;
  aiRanged(g, u, dt, { range: B.range, cd: B.cd, dmg: (g, u) => B.spit * gMul(g, u.team, 'bloater'), mat: acidMat, y: 0, onHit: (_g, _u, t) => { if (isUnit(t)) ACID.set(t.id, B.acid.t); } });
}
/** Sower: hangs over a foe out of reach of short guns and drops a Pup on it every 1.8 s. */
function aiSower(g: Game, u: Unit, dt: number) {
  const S = G2.sower;
  if (g.leash(u, dt)) return;
  if (u.think <= 0) { u.think = .4; const cur = u.target; if (!cur || !cur.alive || reach(g, u, cur) > S.range + 12) u.target = g.acquire(u, S.range + 8, raiding(u) ? S.range + 4 : 0); }
  const t = u.target;
  if (t && t.alive) { const d = reach(g, u, t); u.yaw = Math.atan2(t.pos.x - u.pos.x, t.pos.z - u.pos.z); if (d > S.range) g.moveTo(u, t.pos.x, t.pos.z, dt); else if (u.cd <= 0) { u.cd = S.cd; dropPup(g, u, t); } return; }
  // Nothing in reach: fly over to the nearest fight of its own side, so the Pups land where they are wanted.
  if (!g.human[u.team] || !u.pilot) { let f: Unit | null = null, bd = 90; for (const o of g.units) if (o.alive && o.team === u.team && o !== u && o.target && o.target.alive && !o.air) { const d = Math.hypot(o.pos.x - u.pos.x, o.pos.z - u.pos.z); if (d < bd) { bd = d; f = o; } } if (f) { g.moveTo(u, f.target!.pos.x, f.target!.pos.z, dt); return; } }
  g.vIdle(u, dt, raiding(u) ? 6 : 2, u.order.type !== 'guard' ? 1 : .6);
}
/** A Pup drops on (or beside) a target: the landing bites, and the Pup chews for 8 s. */
export function dropPup(g: Game, u: Unit, t: Unit | Building | { pos: THREE.Vector3 }) {
  const S = G2.sower, x = t.pos.x + R(-1, 1), z = t.pos.z + R(-1, 1), p = g.spawn('pup', u.team, x, z); giveLife(p, S.life);
  p.order = { type: 'amove', x, z }; if ('alive' in t) p.target = t as Unit | Building;
  g.tracer(V3(u.pos.x, (u.alt || 0) + 1, u.pos.z), V3(x, .4, z), bileMat, .1); g.puff(TMP.set(x, .3, z), 3, .6, M.gS, .4);
  if ('alive' in t && (t as Unit).alive) g.damage(t as Unit | Building, S.land * gMul(g, u.team, 'sower'), u);
  u.swing = 1; if (g.vol(u.pos) > .1) sfx.throw();
}
/** Hooksail: follows the swarm's fliers or its fight, out of reach; its abilities do the work. */
function aiHooksail(g: Game, u: Unit, dt: number) {
  if (g.leash(u, dt)) return;
  if (u.think <= 0) { u.think = .4; u.target = g.acquire(u, 10, 0); }
  const t = u.target; if (t && t.alive && reach(g, u, t) < 7) { const ax = u.pos.x - t.pos.x, az = u.pos.z - t.pos.z, l = Math.hypot(ax, az) || 1; g.moveTo(u, u.pos.x + ax / l * 5, u.pos.z + az / l * 5, dt, .2, 1); return; }
  aiCaster(g, u, dt);
}
/** Drifter and Lookout Sac: float where they are told, or hang over the home base. A Lookout Sac trails the swarm to see what is dug in. */
function aiDrifter(g: Game, u: Unit, dt: number) {
  if (u.kind === 'lookoutsac') { let lead: Unit | null = null, bd = 80; for (const o of g.units) if (o.alive && o.team === u.team && o.target && !G_FLIES.has(o.kind)) { const d = dist(o, u); if (d < bd) { bd = d; lead = o; } } if (lead) { g.moveTo(u, lead.pos.x, lead.pos.z, dt, 3, 1); return; } }
  g.vIdle(u, dt, 2, 1);
}
/** Husk and Pup: run at the nearest foe and chew until they wither. */
const aiHusk = (g: Game, u: Unit, dt: number) => aiMelee(g, u, dt, { reach: 1.3, cd: G2.husk.cd, dmg: (g, u) => G2.husk.bite * gMul(g, u.team), any: true });
const aiPup = (g: Game, u: Unit, dt: number) => aiMelee(g, u, dt, { reach: 1.1, cd: G2.pup.cd, dmg: (g, u) => G2.pup.bite * gMul(g, u.team, 'sower'), any: true });
/** A walking Stinger Stalk or Puffball: goes where it is told and roots there once it stands on its own Bloom (actions.ts). */
function aiWalker(g: Game, u: Unit, dt: number) {
  // A walking Stinger Stalk still whips ground bodies close by; a walking Puffball still shoots fliers. Half as often as rooted.
  u.cd -= dt; if (u.cd <= 0) {
    const stg = u.kind === 'stingerwalk', R0 = stg ? G_TUNE.stinger.range : G2.puffball.range, t = nearestFoeAt(g, u.team, u.pos.x, u.pos.z, R0, o => stg ? !o.air : !!o.air);
    if (t) { u.cd = (stg ? G_TUNE.stinger.cd : G2.puffball.cd) * 2; act(u, stg ? 'whip' : 'puff'); u.yaw = Math.atan2(t.pos.x - u.pos.x, t.pos.z - u.pos.z); g.tracer(V3(u.pos.x, stg ? 4 : 3, u.pos.z), V3(t.pos.x, UNIT[t.kind].bodyY + (t.alt || 0), t.pos.z), stg ? spitMat : acidMat, .14); g.damage(t, (stg ? G_TUNE.stinger.dmg * gMul(g, u.team) : G2.puffball.dmg * gMul(g, u.team, 'quillback')), u); } else u.cd = .3;
  }
  const o = u.order; if (Math.hypot(o.x - u.pos.x, o.z - u.pos.z) > 1.5) { g.moveTo(u, o.x, o.z, dt, 1, 1); return; }
  if (g.carpet.on(u.pos.x, u.pos.z, 0, u.team)) useAbility(g, u, 'root');
}

// ---------------------------------------------------------------- first person
/** Where the crosshair points on the ground (or 14 m ahead), and the body under it, for an ability. */
export function aimFrom(g: Game, me: Unit, dir: THREE.Vector3, look: Hit | null, max = 30): Target {
  if (look?.unit && look.unit !== me && look.dist < max + 4) return { x: look.unit.pos.x, z: look.unit.pos.z, id: look.unit.id };
  if (look?.b && look.dist < max + 4) return { x: look.b.pos.x, z: look.b.pos.z, id: look.b.id };
  const p = V3(); if (!g.groundPoint(p, max)) p.set(me.pos.x + dir.x * 14, 0, me.pos.z + dir.z * 14); return { x: p.x, z: p.z };
}
const WHY: Record<string, string> = { energy: 'Not enough energy yet.', cooldown: 'Not ready yet.', range: 'Too far. Get closer.', target: 'Aim at a body it can take.', refused: 'That does not work there.', aim: 'Aim at the ground.', busy: 'Still busy with the last one.', inside: 'Not from in here.', 'cannot act': 'You cannot do that right now.' };
/** A player's key for an ability: aims it, uses it, or says in plain words why it did not go. */
export function castKey(g: Game, me: Unit, key: string, dir: THREE.Vector3, look: Hit | null) {
  const a = abilitiesOf(me.kind).find(x => x.key === key); if (!a) return false;
  const t = a.target === 'self' ? { x: me.pos.x, z: me.pos.z } : aimFrom(g, me, dir, look, a.range);
  const why = g.net ? '' : whyNot(g, me, key, t); if (why) { sfx.deny(); g.feed(UNIT[me.kind].name, WHY[why] || why, 'al'); return false; }
  useAbility(g, me, key, t); return true;
}
/** The keys every Gloam body shares in first person: Ctrl digs in or comes up; each of the kind's abilities on its own key. */
export function commonKeys(g: Game, me: Unit, P: Set<string>, dir: THREE.Vector3, look: Hit | null) {
  for (const a of abilitiesOf(me.kind)) if (a.hotkey && a.hotkey !== 'Mouse0' && P.has(a.hotkey)) { castKey(g, me, a.key, dir, look); return true; }
  return false;
}
/** First person for the new kinds that spit: click spits at what the crosshair is on, abilities on their keys. */
function driveSpit(dmgK: string, base: number, cd: number, range: number, mat: THREE.Material) {
  return (g: Game, _dt: number, P: Set<string>, eye: THREE.Vector3, dir: THREE.Vector3, look: Hit | null) => {
    const me = g.me!; if (commonKeys(g, me, P, dir, look)) return; if (isDug(me) && me.kind !== 'needler' && !CRAWL.has(me.id)) return;
    if (me.kind === 'needler') { if (g.lmb && g.fireCd <= 0) { if (!isDug(me)) { if (P.has('Mouse0')) { sfx.deny(); g.feed('Needler', 'I fire only from under the ground. Press Ctrl to dig in.', 'al'); } return; } g.fireCd = G2.needler.cd; g.recoil = 1; g.shake = Math.max(g.shake, .2); const n = spineLine(g, me, g.yaw, g.upOf(me.team).gspines ? G2.needler.deep : G2.needler.len, me); if (n) { g.hud.hitmark(n > 1); sfx.hit(); } } return; }
    if (g.lmb && g.fireCd <= 0) {
      g.fireCd = cd; g.recoil = 1; g.kick += .015; me.swing = 1; sfx.throw();
      const hit = g.ray(eye, dir, range, -1, me), end = V3().copy(eye).addScaledVector(dir, hit ? hit.dist : range), tgt = hit && (hit.unit && isEnemy(hit.unit.team, me.team) ? hit.unit : hit.b && isEnemy(hit.b.team, me.team) ? hit.b : null);
      g.tracer(V3(eye.x + dir.x * .8, eye.y - .3, eye.z + dir.z * .8), end, mat, .1);
      if (tgt) { const dmg = base * gMul(g, me.team, dmgK) * (hit!.head ? 1.6 : 1); g.damage(tgt, dmg, me, !!hit!.head); g.hud.hitmark(!!hit!.head); sfx.hit(); if (me.kind === 'bloater' && isUnit(tgt)) ACID.set(tgt.id, G2.bloater.acid.t); }
      else g.impact(eye, dir, hit, end, 6);
    }
  };
}
/** First person for the biters among the new kinds: click bites what is in front. */
function driveBite(dmgK: string, base: number, cd: number, reachM: number) {
  return (g: Game, _dt: number, P: Set<string>, _eye: THREE.Vector3, dir: THREE.Vector3, look: Hit | null) => {
    const me = g.me!; if (commonKeys(g, me, P, dir, look)) return; if (isDug(me)) return;
    if (!g.lmb || g.fireCd > 0) return; g.fireCd = cd; g.jaw = 1; me.swing = 1; squelch(g, me.pos, .8); let any = false;
    if (me.kind === 'gnatwing') { const t = look?.unit && isEnemy(look.unit.team, me.team) && look.dist < reachM + 3 ? look.unit : look?.b && isEnemy(look.b.team, me.team) && look.dist < reachM + 3 ? look.b : null; if (t) { gnatBite(g, me, t, me); any = true; } }
    else for (const u of g.units) { if (!u.alive || !isEnemy(u.team, me.team)) continue; const dx = u.pos.x - me.pos.x, dz = u.pos.z - me.pos.z, d = Math.hypot(dx, dz); if (d > reachM + UNIT[u.kind].rad || (dx * dir.x + dz * dir.z) / (d || 1) < .4) continue; g.damage(u, base * gMul(g, me.team, dmgK), me); any = true; }
    if (any) { g.hud.hitmark(false); sfx.hit(); }
  };
}
/** First person for a Sower: click drops a Pup where the crosshair meets the ground, up to 14 m out. */
function driveSower(g: Game, _dt: number, P: Set<string>, _eye: THREE.Vector3, dir: THREE.Vector3, look: Hit | null) {
  const me = g.me!; if (commonKeys(g, me, P, dir, look)) return;
  if (g.lmb && g.fireCd <= 0) { g.fireCd = G2.sower.cd; const t = aimFrom(g, me, dir, look, 14); if (Math.hypot(t.x - me.pos.x, t.z - me.pos.z) > 15) { sfx.deny(); return; } const tg = t.id ? (byId(g, t.id) || g.buildings.find(b => b.id === t.id)) : null; dropPup(g, me, tg && tg.team !== me.team ? tg : { pos: V3(t.x, 0, t.z) }); }
}
/** First person for the bodies with no weapon (Smother, Hooksail, Drifter, Lookout Sac, walkers): abilities only. */
function driveCaster(g: Game, _dt: number, P: Set<string>, _eye: THREE.Vector3, dir: THREE.Vector3, look: Hit | null) {
  const me = g.me!; if (commonKeys(g, me, P, dir, look)) return;
  if (P.has('Mouse0')) { const a = abilitiesOf(me.kind)[0]; if (a) castKey(g, me, a.key, dir, look); }
}

// ---------------------------------------------------------------- buildings
/** Puffball: shoots the nearest flier in reach. Its detection is BLD.puffball.detect. */
function puffTick(g: Game, b: Building, dt: number) {
  const P = G2.puffball; b.cd -= dt; if (b.cd > 0) return;
  let t: Unit | null = null, bd = P.range + b.hx; for (const o of g.units) { if (!o.alive || !isEnemy(o.team, b.team) || !o.air || o.inside) continue; const d = Math.hypot(o.pos.x - b.pos.x, o.pos.z - b.pos.z); if (d < bd) { bd = d; t = o; } }
  if (!t) { b.cd = .3; return; } b.cd = P.cd;
  g.tracer(V3(b.pos.x, b.h * .8, b.pos.z), V3(t.pos.x, UNIT[t.kind].bodyY + (t.alt || 0), t.pos.z), acidMat, .14); g.damage(t, P.dmg * gMul(g, b.team, 'quillback'), b); if (g.vol(b.pos) > .2) sfx.throw();
}

// ---------------------------------------------------------------- registering
defineUnits({
  keeper: { ai: aiKeeper, drive: driveSpit('keeper', G2.keeper.spit * 1.4, G2.keeper.cd, G2.keeper.range + 6, spitMat), skipRespawn: true, task: () => 'Keeping the Buds' },
  shellback: { ai: aiShellback, drive: driveSpit('shellback', G2.shellback.spit, G2.shellback.cd * .8, G2.shellback.range + 4, spitMat), task: (_g, u) => isDug(u) ? 'Dug in, knitting' : null },
  lobber: { ai: aiShellback, drive: driveSpit('lobber', G2.lobber.spit, G2.lobber.cd * .8, G2.lobber.range + 4, bileMat), task: (_g, u) => isDug(u) ? 'Dug in, knitting' : null },
  needler: { ai: aiNeedler, drive: driveSpit('needler', G2.needler.dmg, G2.needler.cd, G2.needler.len, spineMat), dugFight: true, task: (_g, u) => isDug(u) ? 'Under the ground, spines set' : null },
  smother: { ai: aiCaster, drive: driveCaster, task: () => 'Holding spores' },
  seeder: { ai: aiSeeder, drive: driveCaster, dugFight: true, task: (_g, u) => isDug(u) ? 'Dug in, throwing Husks' : null },
  husk: { ai: aiHusk, drive: driveBite('husk', G2.husk.bite * 1.2, G2.husk.cd, 2.4), skipRespawn: true },
  gnatwing: { ai: aiGnatwing, drive: driveBite('gnatwing', G2.gnatwing.bite, G2.gnatwing.cd, G2.gnatwing.range + 3) },
  bloater: { ai: aiBloater, drive: driveSpit('bloater', G2.bloater.spit, G2.bloater.cd * .8, G2.bloater.range + 6, acidMat) },
  sower: { ai: aiSower, drive: driveSower, skipRespawn: true },
  pup: { ai: aiPup, drive: driveBite('pup', G2.pup.bite * 1.2, G2.pup.cd, 2), skipRespawn: true },
  hooksail: { ai: aiHooksail, drive: driveCaster },
  drifter: { ai: aiDrifter, drive: driveCaster, skipRespawn: true, task: () => 'Afloat, eight beds aboard' },
  lookoutsac: { ai: aiDrifter, drive: driveCaster, skipRespawn: true, task: () => 'Watching for dug-in bodies' },
  stingerwalk: { ai: aiWalker, drive: driveCaster, skipRespawn: true, task: () => 'Walking to new ground' },
  puffwalk: { ai: aiWalker, drive: driveCaster, skipRespawn: true, task: () => 'Walking to new ground' },
  // Bark Plates: every hit on a Mulcher lands 2 lighter.
  mulcher: { hurt: (g, u, amt) => g.upOf(u.team).gbark ? Math.max(.5, amt - 2) : amt },
});
defineBuildings({ puffball: { tick: puffTick } });
defineFaction(2, { tab: ['snapper', 'quillback', 'blister', 'mulcher', 'shellback', 'lobber', 'needler', 'keeper', 'smother', 'seeder', 'gnatwing', 'bloater', 'sower', 'hooksail', 'drifter', 'lookoutsac', 'grazer'] as Kind[] });
export { aiRanged, aiMelee, homeCap, CRAWL };
