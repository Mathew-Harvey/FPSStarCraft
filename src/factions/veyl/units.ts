// What the new Veyl bodies do, as the bots drive them and in first person, and every Veyl ability through the engine's ability system
// (src/core/ability.ts), so each one works three ways: a key in first person, a button on the command card, and the bot's `ai` hook.
// Numbers are in V_TUNE (numbers.ts). The look (models, poses, effects) belongs to stream F; this file only uses plain markers: g.warn rings
// on the ground, tracers and puffs, so every splash spell shows its mark for at least a second before it lands.
import * as THREE from 'three';
import { V3, M } from '../../gfx';
import { sfx } from '../../audio';
import type { Game } from '../../game';
import { TMP, beamMat } from '../../game';
import { UNIT, BLD, type Unit, type Building, type Kind, type Prop, isUnit, isWorker, isFighter } from '../../data';
import { defineUnits, defineFaction, type Hit } from '../../core/registry';
import { defineAbilities, abilitiesOf, useAbility, whyNot, type AbilityDef, type Target } from '../../core/ability';
import { addStatus, clearStatus, hasStatus, statusOf } from '../../core/status';
import { canHit, hasTag, isAir } from '../../core/combat';
import { seenBy } from '../../core/sight';
import { isEnemy } from '../../core/sides';
import { load, unload, usedOf, roomOf } from '../../core/cargo';
import { switchKind } from '../../core/morph';
import { canPay, pay } from '../../core/econ';
import { V_TUNE as T } from './numbers';
import { fieldsOn, setUnfolded, unfolded, quicken } from './fields';

// ---------------------------------------------------------------- shared helpers
/** How hard a Veyl body hits: the shift and ground levels (g.vMul), and the air levels for a flier. */
export function airK(g: Game, team: number) { const U = g.upOf(team); return (U.vaedge ? T.air[0] : 1) * (U.vaedge2 ? T.air[1] : 1) * (U.vaedge3 ? T.air[2] : 1); }
export const hitK = (g: Game, u: Unit) => (echo(u) ? 0 : 1) * g.vMul(u.team) * (UNIT[u.kind].air ? airK(g, u.team) : 1);
const yOf = (t: Unit | Building) => isUnit(t) ? (t.alt || 0) + UNIT[t.kind].bodyY : Math.min(t.h * .5, 3) + (t.alt || 0);
const gap = (g: Game, u: Unit, t: Unit | Building) => isUnit(t) ? Math.hypot(t.pos.x - u.pos.x, t.pos.z - u.pos.z) : g.distToBox(t as Building, u.pos.x, u.pos.z);
const from = (u: Unit) => V3(u.pos.x + Math.sin(u.yaw) * UNIT[u.kind].rad, (u.alt || 0) + UNIT[u.kind].bodyY + .3, u.pos.z + Math.cos(u.yaw) * UNIT[u.kind].rad);
const foe = (u: Unit, o: { team: number }) => isEnemy(u.team, o.team);
/** Bodies of a side within r of a spot. */
export function near(g: Game, x: number, z: number, r: number, pick: (o: Unit) => boolean) { const out: Unit[] = []; for (const o of g.units) if (o.alive && !o.inside && pick(o) && Math.hypot(o.pos.x - x, o.pos.z - z) <= r + UNIT[o.kind].rad) out.push(o); return out; }

// ---------------------------------------------------------------- casts on every screen (AbilityDef.show)
// `effect` runs only where the rules run; `show` runs on every screen that sees the caster (online too, from the cast event). Puffs and
// sounds live here. Meshes the host already has (glass panes, the Toll orb) are drawn here only on an online screen (g.net), where the
// host's own meshes never arrive. Rings on the ground (g.warn), beams (g.tracer) and blasts (g.explode) already travel on their own.
const nowS = () => performance.now() / 1000;
/** A mesh for show only: `step` poses it each frame with its age in seconds, and it takes itself away after `life`. */
function timed(g: Game, obj: THREE.Object3D, life: number, step?: (age: number) => void) {
  const t0 = nowS(), host = obj instanceof THREE.Mesh ? obj : (obj.children[0] as THREE.Mesh | undefined); g.scene.add(obj);
  if (!host) { setTimeout(() => g.scene.remove(obj), life * 1000); return; }
  host.onBeforeRender = () => { const a = nowS() - t0; if (a > life) { g.scene.remove(obj); host.onBeforeRender = () => {}; return; } step?.(a); };
}
const mine = (g: Game, u: Unit) => !isEnemy(u.team, g.myTeam);
function showWall(g: Game, u: Unit, t: Target) {
  sfx.charge(g.vol(u.pos)); g.puff(TMP.set(t.x, 1.5, t.z), 6, 1.4, M.cyan, 1, 2); if (!g.net) return;
  const ang = Math.atan2(t.x - u.pos.x, t.z - u.pos.z), px = Math.cos(ang), pz = -Math.sin(ang), n = Math.max(3, Math.round(T.tuner.wallLen / 1.6)), obj = new THREE.Group();
  for (let i = 0; i < n; i++) { const k = (i - (n - 1) / 2) * 1.6, m = new THREE.Mesh(PANE, M.crys); m.position.set(t.x + px * k, 1.6, t.z + pz * k); m.rotation.y = ang; obj.add(m); }
  timed(g, obj, T.tuner.wallT);
}
function showToll(g: Game, u: Unit, t: Target) {
  sfx.charge(g.vol(u.pos)); if (!g.net) return; const x0 = u.pos.x, z0 = u.pos.z, orb = new THREE.Mesh(ORB, M.cyan); orb.position.set(x0, .8, z0);
  timed(g, orb, T.knell.roll, a => { const k = Math.min(1, a / T.knell.roll); orb.position.set(x0 + (t.x - x0) * k, .8, z0 + (t.z - z0) * k); });
}
function showShatter(g: Game, u: Unit, t: Target) {
  sfx.charge(g.vol(u.pos)); if (!g.net) return; const C = T.choirmaster, ticks = Math.round(C.shatterT / .5);
  for (let i = 0; i < ticks; i++) setTimeout(() => g.puff(TMP.set(t.x, 1.2, t.z), 4, C.shatterR * .6, M.cyan, 1.4, C.shatterR * .6), (C.mark + i * .5) * 1000);
}
const PANE = new THREE.BoxGeometry(1.7, 3.2, .35), ORB = new THREE.SphereGeometry(.7, 12, 8);

/** The target a body would pick: the nearest enemy body its weapon can reach and its side can see, else an enemy building in `bRange`. */
export function seek(g: Game, u: Unit, range: number, bRange: number): Unit | Building | null {
  if (g.truce) return null; let best: Unit | Building | null = null, bs = 1e9;
  for (const o of g.units) {
    if (!o.alive || o.inside || !foe(u, o)) continue; const d = Math.hypot(o.pos.x - u.pos.x, o.pos.z - u.pos.z); if (d > range) continue;
    if (!canHit(u, o) || !seenBy(g, u.team, o)) continue;
    const sc = (d + 4) * (o.hp < o.maxHp * .4 ? .75 : 1) * (isWorker(o.kind) ? 1.3 : 1) * (o === u.target ? .85 : 1); if (sc < bs) { bs = sc; best = o; }
  }
  if (!best && bRange > 0) { let bd = bRange; for (const b of g.buildings) { if (!b.alive || !foe(u, b) || !canHit(u, b)) continue; const d = g.distToBox(b, u.pos.x, u.pos.z); if (d < bd) { bd = d; best = b; } } }
  return best;
}
/** A hit by a beam or bolt: a line drawn from the body to the target, the damage, a puff. */
function zap(g: Game, u: Unit, t: Unit | Building, dmg: number, w = .08, mat: THREE.Material = beamMat) {
  g.tracer(from(u), V3(t.pos.x, yOf(t), t.pos.z), mat, w); g.damage(t, dmg, u); if (g.vol(u.pos) > .05) sfx.zap(g.vol(u.pos) * .7); g.puff(TMP.set(t.pos.x, yOf(t), t.pos.z), 1, .4, M.teal, .4);
}
/** Where a bot caster stands: a few metres behind the nearest friendly fighter, else its order. */
/** The bodies that hang back behind the line (a hanger follows the nearest body that is not one; it used to follow only bodies with no
 *  abilities at all, and once Cantors got Rush that left Choirmasters and Knells idle at home with nothing to follow). */
const HANGS = new Set<string>(['choirmaster', 'knell', 'tender']);
function hangBack(g: Game, u: Unit, dt: number, back = 6) {
  // the friend at the front: the one closest to what it is fighting (or, with no fight, the nearest)
  let best: Unit | null = null, bd = Infinity; for (const o of g.units) if (o.alive && o !== u && o.team === u.team && isFighter(o) && !HANGS.has(o.kind) && !UNIT[o.kind].air) { const d = Math.hypot(o.pos.x - u.pos.x, o.pos.z - u.pos.z); if (d > 40) continue; const f = o.target && o.target.alive ? Math.hypot(o.target.pos.x - o.pos.x, o.target.pos.z - o.pos.z) : 99 + d; if (f < bd) { bd = f; best = o; } }
  if (!best) { g.vIdle(u, dt, 2, 1); return; }
  const tgt = best.target && best.target.alive ? best.target : null, dx = tgt ? best.pos.x - tgt.pos.x : 0, dz = tgt ? best.pos.z - tgt.pos.z : 0, l = Math.hypot(dx, dz) || 1;
  g.moveTo(u, best.pos.x + (tgt ? dx / l * back : 0), best.pos.z + (tgt ? dz / l * back : -2), dt, 2.5, 1);
}

/** The ranged bot brain every Veyl gunner shares: find a target, close to range, fire on the cooldown, back off from anything too close. */
export function gunAI(g: Game, u: Unit, dt: number, o: { range: number; cd: number; fire(t: Unit | Building): void; bRange?: number; keep?: number; still?: boolean }) {
  if (!u.air && g.leash(u, dt)) return; if (g.aiFallBack(u, dt)) return;
  if (u.think <= 0) { u.think = .35; const raid = u.order.type === 'raid' || u.order.type === 'amove', cur = u.target; if (!cur || !cur.alive || gap(g, u, cur) > o.range + 10 || !(isUnit(cur) ? canHit(u, cur) && seenBy(g, u.team, cur) : true)) u.target = seek(g, u, o.range + 10, o.bRange ?? (raid && !(u.order.path && u.order.path.length) ? o.range : 0)); }
  const t = u.target;
  if (t && t.alive) {
    const d = gap(g, u, t); u.yaw = Math.atan2(t.pos.x - u.pos.x, t.pos.z - u.pos.z);
    if (d > o.range) { if (!o.still) g.moveTo(u, t.pos.x, t.pos.z, dt, .5); return; }
    if (u.cd <= 0) { u.cd = o.cd; u.swing = 1; o.fire(t); }
    if (o.keep && isUnit(t) && d < o.keep && !o.still) { const ax = u.pos.x - t.pos.x, az = u.pos.z - t.pos.z, l = Math.hypot(ax, az) || 1; g.moveTo(u, u.pos.x + ax / l * 4, u.pos.z + az / l * 4, dt, .2, .9); u.yaw = Math.atan2(-ax, -az); }
    return;
  }
  g.vIdle(u, dt, u.order.type === 'raid' ? 4 : 1.5, u.order.type !== 'guard' || g.dir.alarmT > 0 ? 1 : .6);
}
/** The melee bot brain (Cantor, Mute): close in, cut, and the cut carries into bodies pressed against the target. */
export function bladeAI(g: Game, u: Unit, dt: number, cut: number, cd: number, cleave = 2) {
  if (g.leash(u, dt)) return; u.dashCd -= dt; u.dashT -= dt; if (g.aiFallBack(u, dt)) return;
  if (u.think <= 0) { u.think = .3; const raid = u.order.type === 'raid' || u.order.type === 'amove', cur = u.target; if (!cur || !cur.alive || !isUnit(cur) || !canHit(u, cur)) u.target = seek(g, u, raid ? (g.time - u.lastHit < 2 ? 40 : 22) : 28, raid && !(u.order.path && u.order.path.length) ? 14 : 0); }
  const t = u.target; if (!t || !t.alive) { g.vIdle(u, dt, u.order.type === 'raid' ? 3 : 1.5, u.order.type !== 'guard' || g.dir.alarmT > 0 ? 1 : .6); return; }
  const isB = !isUnit(t), d = gap(g, u, t); if (!isB && d > 45) { u.target = null; return; }
  if (d > (isB ? 1.3 : 1.7 + UNIT[(t as Unit).kind].rad * .5)) { g.moveTo(u, t.pos.x, t.pos.z, dt, .5, u.dashT > 0 ? 2.6 : 1); return; }
  u.yaw = Math.atan2(t.pos.x - u.pos.x, t.pos.z - u.pos.z); if (u.cd > 0) return;
  u.cd = cd; u.swing = 1; sfx.slash(g.vol(u.pos)); const k = hitK(g, u), extra = (u as any).rushHit ? T.cantor.rushHit : 0; (u as any).rushHit = 0;
  g.damage(t, (isB ? cut * .75 : cut + extra) * k, u);
  if (!isB) { let n = 0; for (const o of g.units) { if (n >= cleave) break; if (o === t || !o.alive || !foe(u, o) || o.air || Math.hypot(o.pos.x - t.pos.x, o.pos.z - t.pos.z) > 1.9 || Math.hypot(o.pos.x - u.pos.x, o.pos.z - u.pos.z) > 3.4) continue; n++; g.damage(o, cut * .5 * k, u); } }
}

// ---------------------------------------------------------------- False Voice copies, Glass Wall panes, timed things
const ECHO = new WeakMap<Unit, number>();
/** A False Voice copy: deals no damage and takes double, and fades after its time. */
export const echo = (u: Unit) => ECHO.has(u);
type Fx = { panes: { p: Prop; t: number }[]; notes: { x: number; z: number; t: number; tick: number; team: number; by: Unit; mark: number }[];
  orbs: { x: number; z: number; tx: number; tz: number; t: number; by: Unit; obj: THREE.Object3D | null }[]; stones: { x: number; z: number; team: number; arm: number; by: Unit }[]; last: number };
/** The timed things of one match (panes, notes, orbs, stones), kept per Game so a new match or a test world starts clean. */
const FXS = new WeakMap<Game, Fx>(), S = (g: Game) => { let s = FXS.get(g); if (!s) FXS.set(g, s = { panes: [], notes: [], orbs: [], stones: [], last: -1 }); return s; };
const JOIN = new WeakMap<Unit, { with: Unit; t: number }>();
let paneId = -1;
/** Clears this file's timed things (a new match). */
export function resetVeylFx(g: Game) { FXS.delete(g); }
/** Runs veylFx once a frame, however many Veyl buildings call it (it is driven from the faction's per-building `each` hook). */
export function veylTick(g: Game, dt: number) { const s = S(g); if (s.last === g.time) return; s.last = g.time; veylFx(g, dt); }

function glassWall(g: Game, u: Unit, t: Target) {
  // A pane across the caster's line of sight, centred on the spot: a row of glass posts that bodies cannot walk through. Shots break it.
  const ang = Math.atan2(t.x - u.pos.x, t.z - u.pos.z), px = Math.cos(ang), pz = -Math.sin(ang), n = Math.max(3, Math.round(T.tuner.wallLen / 1.6));
  for (let i = 0; i < n; i++) {
    const k = (i - (n - 1) / 2) * 1.6, x = t.x + px * k, z = t.z + pz * k, obj = new THREE.Group();
    const m = new THREE.Mesh(PANE, M.crys); m.position.y = 1.6; m.rotation.y = ang; obj.add(m); obj.position.set(x, 0, z); g.scene.add(obj);
    const p = { id: paneId--, kind: 'crystal', name: 'Glass pane', x, z, r: .9, y0: 0, h: 3.2, hp: 260, maxHp: 260, alive: true, solid: true, stage: 0, stages: 0, ranges: [], obj, link: [] } as unknown as Prop;
    g.spires.push(p); S(g).panes.push({ p, t: g.time + T.tuner.wallT });
  }
  g.warn(t.x, t.z, T.tuner.wallLen / 2, 1);
}
function falseVoice(g: Game, u: Unit, o: Unit) {
  for (let i = 0; i < T.tuner.voiceN; i++) {
    const a = i * Math.PI + u.id, c = g.spawn(o.kind, o.team, o.pos.x + Math.cos(a) * 2, o.pos.z + Math.sin(a) * 2); ECHO.set(c, g.time + T.tuner.voiceT);
    c.order = { ...o.order, path: o.order.path ? o.order.path.map(p => [...p]) : undefined }; c.target = o.target;
  }
}
function shatter(g: Game, u: Unit, t: Target) { const C = T.choirmaster; g.warn(t.x, t.z, C.shatterR, C.mark + C.shatterT); S(g).notes.push({ x: t.x, z: t.z, t: C.shatterT, tick: 0, team: u.team, by: u, mark: C.mark }); }
function toll(g: Game, u: Unit, t: Target) {
  const obj = new THREE.Mesh(ORB, M.cyan); obj.position.set(u.pos.x, .8, u.pos.z); g.scene.add(obj);
  S(g).orbs.push({ x: u.pos.x, z: u.pos.z, tx: t.x, tz: t.z, t: T.knell.roll, by: u, obj }); g.warn(t.x, t.z, T.knell.r, T.knell.roll);
}
function joinUp(g: Game, u: Unit) {
  const mate = near(g, u.pos.x, u.pos.z, 8, o => o !== u && o.team === u.team && o.kind === 'choirmaster' && !JOIN.has(o) && !o.pilot && o !== g.me)[0]; if (!mate) return;
  const t = T.choirmaster.joinT; JOIN.set(u, { with: mate, t }); JOIN.set(mate, { with: u, t: 1e9 }); for (const o of [u, mate]) { addStatus(o, 'root', t + .5); o.cast = null; }
}

/** Every frame on the host: panes and copies fade, Shatter Notes tick, Toll orbs roll, Still Stones wait, joins finish, Bells regrow their
 *  Ring Shell, the Cantus hides its friends, Lyres build and launch Shards, Omens burn energy on Shrill. */
export function veylFx(g: Game, dt: number) {
  if (g.net) return;
  for (let i = S(g).panes.length - 1; i >= 0; i--) { const P = S(g).panes[i]; if (!P.p.alive || g.time > P.t) { if (P.p.alive) g.killProp(P.p); else if (P.p.obj) g.scene.remove(P.p.obj); S(g).panes.splice(i, 1); } }
  for (let i = S(g).notes.length - 1; i >= 0; i--) {
    const N = S(g).notes[i], C = T.choirmaster; if (N.mark > 0) { N.mark -= dt; continue; }
    N.t -= dt; N.tick -= dt; if (N.tick <= 0) { N.tick = .5; const per = C.shatter / (C.shatterT / .5); g.puff(TMP.set(N.x, 1.2, N.z), 4, C.shatterR * .6, M.cyan, 1.4, C.shatterR * .6);
      for (const o of near(g, N.x, N.z, C.shatterR, o => isEnemy(N.team, o.team) || o.team === N.team)) g.damage(o, per, N.by.alive ? N.by : null); }
    if (N.t <= 0) S(g).notes.splice(i, 1);
  }
  for (let i = S(g).orbs.length - 1; i >= 0; i--) {
    const O = S(g).orbs[i]; O.t -= dt; const k = Math.max(0, O.t) / T.knell.roll, x = O.tx + (O.x - O.tx) * k, z = O.tz + (O.z - O.tz) * k; if (O.obj) O.obj.position.set(x, .8, z);
    if (O.t <= 0) { if (O.obj) g.scene.remove(O.obj); S(g).orbs.splice(i, 1); g.explode(V3(O.tx, 0, O.tz), -1, T.knell.dmg * (echo(O.by) ? 0 : g.vMul(O.by.team)), T.knell.r, O.by.alive ? O.by : null, true); }
  }
  for (let i = S(g).stones.length - 1; i >= 0; i--) {
    const St = S(g).stones[i]; if (St.arm > 0) { St.arm -= dt; continue; }
    const caught = near(g, St.x, St.z, T.omen.stoneR, o => !o.air && isEnemy(St.team, o.team)); if (!caught.length) continue;
    for (const o of near(g, St.x, St.z, T.omen.stoneR, o => !o.air)) { addStatus(o, 'stun', T.omen.stoneT); addStatus(o, 'shielded', T.omen.stoneT, 1e6); o.target = null; }
    g.warn(St.x, St.z, T.omen.stoneR, 1.2); g.puff(TMP.set(St.x, 1, St.z), 10, T.omen.stoneR, M.indigoL, 1, 2); sfx.boom(g.vol(TMP) * .6); S(g).stones.splice(i, 1);
  }
  for (const u of g.units) {
    if (!u.alive) continue;
    const e = ECHO.get(u); if (e !== undefined && g.time > e) { g.puff(TMP.set(u.pos.x, 1.2, u.pos.z), 4, .8, M.violet, .8); u.hp = 0; g.killUnit(u, null); continue; }
    const J = JOIN.get(u); if (J) { J.t -= dt; if (!J.with.alive || !u.alive) { JOIN.delete(u); clearStatus(u, 'root'); } else if (J.t <= 0) { JOIN.delete(u); JOIN.delete(J.with); fuse(g, u, J.with); continue; } }
    switch (u.kind) {
      case 'bell': { const s = statusOf(u, 'shielded'), st = (u as any).shellT ?? 0; if (!s && g.time > st) { addStatus(u, 'shielded', Infinity, T.bell.shell); (u as any).shellT = g.time + T.bell.shellBack; } else if (s) (u as any).shellT = g.time + T.bell.shellBack; break; }
      case 'cantus': for (const o of g.units) if (o.alive && o !== u && o.team === u.team && o.kind !== 'cantus' && Math.hypot(o.pos.x - u.pos.x, o.pos.z - u.pos.z) < T.cantus.hide) addStatus(o, 'unseen', .4); break;
      case 'lyre': lyreTick(g, u, dt); break;
      case 'omen': if ((u as any).shrill) { u.energy = (u.energy ?? 0) - T.omen.drain * dt; if (u.energy! <= 0) { u.energy = 0; (u as any).shrill = false; } } break;
      case 'listener': if ((u as any).settled) addStatus(u, 'root', .3); break;
      case 'shard': { const L: Unit | undefined = (u as any).lyre; if (!L || !L.alive) { u.hp = 0; g.killUnit(u, null); } break; }
    }
  }
}
/** Two Choirmasters become a Chord: the first keeps its id and pilot and becomes the Chord; the second is used up. */
function fuse(g: Game, a: Unit, b: Unit) {
  clearStatus(a, 'root'); clearStatus(b, 'root'); b.alive = false; b.hp = 0; g.scene.remove(b.obj); if (b === g.me) g.possess(a, true);
  switchKind(g, a, 'chord'); a.shield = a.maxShield; g.puff(TMP.set(a.pos.x, 2, a.pos.z), 12, 1.8, M.cyan, 1.4, 2); sfx.boom(g.vol(a.pos) * .5);
  g.feed('Conductor', 'Two Choirmasters joined into a Chord.', '', a.team);
}

// ---------------------------------------------------------------- Lyre and Shards
function lyreTick(g: Game, u: Unit, dt: number) {
  const L = u as any, Y = T.lyre; L.held ??= 2; L.buildT ??= 0;
  const out = g.units.filter(o => o.alive && o.kind === 'shard' && (o as any).lyre === u);
  if (L.held + out.length + (L.buildT > 0 ? 1 : 0) < Y.max && L.buildT <= 0 && g.cash(u.team) >= Y.ore) { pay(g, u.team, [Y.ore, 0]); L.buildT = Y.build * (g.upOf(u.team).vshard ? Y.launch : 1); }
  if (L.buildT > 0) { L.buildT -= dt; if (L.buildT <= 0) L.held++; }
  const t = u.target && u.target.alive && gap(g, u, u.target) < Y.leash - 2 ? u.target : null;
  if (t && L.held > 0 && g.time > (L.launchT ?? 0)) { L.held--; L.launchT = g.time + .4; const s = g.spawn('shard', u.team, u.pos.x, u.pos.z); (s as any).lyre = u; s.target = t; s.alt = u.alt; }
  // Shards with nothing to fight, or too far out, come home and dock.
  for (const s of out) { const far = Math.hypot(s.pos.x - u.pos.x, s.pos.z - u.pos.z); if ((!t && (!s.target || !s.target.alive)) || far > Y.leash + 6) { s.target = null; if (far < 1.8) { s.alive = false; s.hp = 0; g.scene.remove(s.obj); L.held++; } } }
}
function shardAI(g: Game, u: Unit, dt: number) {
  const L: Unit | undefined = (u as any).lyre; if (!L || !L.alive) return;
  if (!u.target || !u.target.alive) { const t = L.target && L.target.alive ? L.target : null; if (t) u.target = t; else { g.moveTo(u, L.pos.x, L.pos.z, dt, .5, 1); return; } }
  const t = u.target!; if (Math.hypot(t.pos.x - L.pos.x, t.pos.z - L.pos.z) > T.lyre.leash + 6) { u.target = null; return; }
  const d = gap(g, u, t); if (d > T.shard.range) { g.moveTo(u, t.pos.x, t.pos.z, dt, .5, 1); return; }
  const a = g.time * 2 + u.id; g.moveTo(u, t.pos.x + Math.cos(a) * 3, t.pos.z + Math.sin(a) * 3, dt, .3, .6); if (u.cd <= 0) { u.cd = T.shard.cd; zap(g, u, t, T.shard.dmg * hitK(g, u), .04); }
}

// ---------------------------------------------------------------- bot brains
const aiTuner = (g: Game, u: Unit, dt: number) => gunAI(g, u, dt, { range: T.tuner.range, cd: T.tuner.cd, keep: 8, fire: t => zap(g, u, t, T.tuner.dmg * hitK(g, u), .05) });
const aiChord = (g: Game, u: Unit, dt: number) => gunAI(g, u, dt, { range: T.chord.range, cd: T.chord.cd, fire: t => { const k = hitK(g, u); zap(g, u, t, T.chord.dmg * k, .22, beamMat); for (const o of near(g, t.pos.x, t.pos.z, T.chord.splash, o => foe(u, o) && o !== t && canHit(u, o))) g.damage(o, T.chord.dmg * .6 * k, u); g.puff(TMP.set(t.pos.x, 1.4, t.pos.z), 4, T.chord.splash * .6, M.cyan, .8, 1.5); } });
const aiBell = (g: Game, u: Unit, dt: number) => gunAI(g, u, dt, { range: T.bell.range, cd: T.bell.cd, fire: t => zap(g, u, t, T.bell.dmg * hitK(g, u), .16) });
const aiReed = (g: Game, u: Unit, dt: number) => gunAI(g, u, dt, { range: T.reedwalker.range + (g.upOf(u.team).vstride ? T.reedwalker.stride : 0), cd: T.reedwalker.cd, fire: t => sweep(g, u, t.pos.x, t.pos.z) });
/** The Reedwalker's beam sweep: a 4 m line across the target, everything on it hit twice. */
function sweep(g: Game, u: Unit, x: number, z: number) {
  const ang = Math.atan2(x - u.pos.x, z - u.pos.z), px = Math.cos(ang), pz = -Math.sin(ang), L = T.reedwalker.line, k = hitK(g, u), head = V3(u.pos.x, UNIT.reedwalker.headY, u.pos.z);
  g.tracer(head, V3(x - px * L / 2, .3, z - pz * L / 2), beamMat, .14); g.tracer(head, V3(x + px * L / 2, .3, z + pz * L / 2), beamMat, .14);
  for (const o of g.units) { if (!o.alive || !foe(u, o) || !canHit(u, o) || !seenBy(g, u.team, o)) continue; const dx = o.pos.x - x, dz = o.pos.z - z, along = dx * px + dz * pz, across = Math.abs(dx * pz - dz * px); if (Math.abs(along) < L / 2 + UNIT[o.kind].rad && across < 1 + UNIT[o.kind].rad) g.damage(o, T.reedwalker.dmg * 2 * k, u); }
  for (const b of g.buildings) if (b.alive && foe(u, b) && g.distToBox(b, x, z) < 1) g.damage(b, T.reedwalker.dmg * 2 * k, u);
  if (g.vol(u.pos) > .05) sfx.zap(g.vol(u.pos)); g.puff(TMP.set(x, .4, z), 3, 1, M.cyan, .6, L / 2);
}
/** The Swift fights fliers, and with Lift ready flies in over a costly ground body to hold it up (its Lift trigger then fires). */
const liftable = (g: Game, u: Unit, r: number) => near(g, u.pos.x, u.pos.z, r, o => foe(u, o) && !o.air && !hasTag(o, 'huge') && !hasStatus(o, 'lifted') && isFighter(o) && seenBy(g, u.team, o)).sort((a, b) => UNIT[b.kind].cost - UNIT[a.kind].cost);
const aiSwift = (g: Game, u: Unit, dt: number) => {
  if ((u.energy ?? 0) >= T.swift.lift && !(u.abCd?.lift > 0) && near(g, u.pos.x, u.pos.z, T.swift.range + 6, o => foe(u, o) && o.air).length < 2) { const t = liftable(g, u, T.swift.liftRange + 10)[0]; if (t && Math.hypot(t.pos.x - u.pos.x, t.pos.z - u.pos.z) > T.swift.liftRange - 2) { g.moveTo(u, t.pos.x, t.pos.z, dt, T.swift.liftRange - 3, 1); return; } }
  swiftGun(g, u, dt);
};
const swiftGun = (g: Game, u: Unit, dt: number) => gunAI(g, u, dt, { range: T.swift.range + (g.upOf(u.team).vswift ? T.swift.far : 0), cd: T.swift.cd, bRange: 0, fire: t => { const k = hitK(g, u); zap(g, u, t, T.swift.dmg * k, .05); zap(g, u, t, T.swift.dmg * k, .05); } });
const burning = (g: Game, u: Unit) => ((u as any).burnT ?? 0) > g.time;
const aiPrism = (g: Game, u: Unit, dt: number) => gunAI(g, u, dt, { range: T.prism.range, cd: T.prism.cd, fire: t => zap(g, u, t, (T.prism.dmg + (burning(g, u) && hasTag(t, 'plated') ? T.prism.burn : 0)) * hitK(g, u), burning(g, u) ? .2 : .1) });
const aiOmen = (g: Game, u: Unit, dt: number) => {
  const O = u as any; if (!O.shrill) { g.aiFallBack(u, dt); const t = u.target; if (t && t.alive && gap(g, u, t) < T.omen.range + 3) g.moveTo(u, t.pos.x, t.pos.z, dt, T.omen.range * .7, 1); else gunAI(g, u, dt, { range: T.omen.range, cd: 1, fire: () => {} }); return; }
  gunAI(g, u, dt, { range: T.omen.range, cd: T.omen.cd, bRange: 0, fire: t => zap(g, u, t, (T.omen.dmg + (hasTag(t, 'soft') ? T.omen.soft : 0)) * hitK(g, u), .12) });
};
const aiCantus = (g: Game, u: Unit, dt: number) => gunAI(g, u, dt, { range: T.cantus.range, cd: T.cantus.cd, fire: t => { let n = 0; zap(g, u, t, T.cantus.dmg * hitK(g, u), .1); for (const o of near(g, u.pos.x, u.pos.z, T.cantus.range, o => o !== t && foe(u, o) && canHit(u, o) && seenBy(g, u.team, o))) { if (++n >= T.cantus.beams) break; zap(g, u, o, T.cantus.dmg * hitK(g, u), .1); } } });
const aiLyre = (g: Game, u: Unit, dt: number) => gunAI(g, u, dt, { range: T.lyre.leash - 4, cd: 99, fire: () => {} });
/** No gun: stays with the army and lets its abilities do the work (Choirmaster, Knell, Ferry, Listener). */
const aiHang = (g: Game, u: Unit, dt: number) => { if (g.aiFallBack(u, dt)) return; if (u.think <= 0) { u.think = .5; u.target = seek(g, u, 24, 0); } if (u.order.type === 'raid' || u.order.type === 'amove' || g.army(u.team).length > 1) hangBack(g, u, dt, u.air ? 3 : 7); else g.vIdle(u, dt, 2, 1); };
/** The Ferry: on a drop it flies its order; otherwise it keeps over the army (and unfolds there, see its Unfold hook). */
const aiFerry = (g: Game, u: Unit, dt: number) => { if (unfolded(u)) return; if ((u.cargo && u.cargo.length) || u.order.type === 'amove') { g.advance(u, dt, 2, 1); return; } aiHang(g, u, dt); };
/** The Listener drifts over the army, ahead of it, where enemy unseen bodies would be. */
const aiListener = (g: Game, u: Unit, dt: number) => {
  if ((u as any).settled) return; const army = g.army(u.team).filter(o => o !== u && !o.air && !isWorker(o.kind)); if (!army.length) { g.vIdle(u, dt, 2, 1); return; }
  let x = 0, z = 0, fx = 0, fz = 0, nf = 0; for (const o of army) { x += o.pos.x; z += o.pos.z; if (o.target && o.target.alive) { fx += o.target.pos.x; fz += o.target.pos.z; nf++; } } x /= army.length; z /= army.length; if (nf) { x = (x + fx / nf) / 2; z = (z + fz / nf) / 2; }
  g.moveTo(u, x, z, dt, 2, 1);
};

// ---------------------------------------------------------------- abilities
/** Bodies that fight close: the ones a Glass Wall shuts out and a Lancer skips away from. */
const BLADES = new Set<string>(['cantor', 'mute', 'snapper', 'breacher', 'dustbike', 'mulcher']);
const FAR = 3, reach = (g: Game, u: Unit) => g.upOf(u.team).vreach ? FAR : 0;
/** Far Reach (Song Archive): the Tuner's and Choirmaster's aimed abilities are listed at their longest range, and refused past the
 *  short one until it is learned (the shared range check has no per-side hook). */
const within = (g: Game, u: Unit, t: Target, base: number) => { const o = t.id ? g.units.find(x => x.id === t.id) : null, x = o ? o.pos.x : t.x, z = o ? o.pos.z : t.z; return Math.hypot(x - u.pos.x, z - u.pos.z) <= base + reach(g, u) + 1; };
const known = (g: Game, u: Unit, key: string) => !!(g.upOf(u.team) as any)[key];
/** The densest spot of enemy bodies within `range` of a caster, with how many are within r of it. */
function cluster(g: Game, u: Unit, range: number, r: number, pick: (o: Unit) => boolean = o => foe(u, o) && !o.air): { x: number; z: number; n: number; friends: number } | null {
  let best: { x: number; z: number; n: number; friends: number } | null = null;
  for (const o of g.units) { if (!o.alive || !pick(o) || !seenBy(g, u.team, o) || Math.hypot(o.pos.x - u.pos.x, o.pos.z - u.pos.z) > range) continue; const n = near(g, o.pos.x, o.pos.z, r, pick).length; if (!best || n > best.n) best = { x: o.pos.x, z: o.pos.z, n, friends: near(g, o.pos.x, o.pos.z, r + 1, f => f.team === u.team).length }; }
  return best;
}
const blink = (g: Game, u: Unit, t: Target, max: number) => { const dx = t.x - u.pos.x, dz = t.z - u.pos.z, d = Math.hypot(dx, dz) || 1, k = Math.min(1, max / d); u.pos.x += dx * k; u.pos.z += dz * k; g.collide(u, u.pos.x, u.pos.z); u.obj.position.x = u.pos.x; u.obj.position.z = u.pos.z; };
/** The look of a blink, where the body lands (a Mute's only on its own side's screens: it is unseen). */
const showBlink = (g: Game, u: Unit) => { if (u.kind === 'mute' && !mine(g, u)) return; g.puff(TMP.set(u.pos.x, 1.2, u.pos.z), 6, .8, M.violet, .6); sfx.dash(g.vol(u.pos)); };

const ABS: Record<string, AbilityDef[]> = {
  cantor: [{ key: 'rush', name: 'Rush', hotkey: 'C', energy: 0, cd: T.cantor.rushCd, cast: 0, range: T.cantor.rushRange, target: 'body', autocast: true, blurb: 'Runs the last 10 m to a body and its first cut does 10 more. Needs Rush from a Dusk Hall.',
    can: (g, u) => known(g, u, 'vrush'), effect: (g, u) => { u.dashT = .55; u.dashCd = 2; (u as any).rushHit = 1; },
    show: (g, u) => { sfx.dash(g.vol(u.pos)); g.puff(TMP.copy(u.pos).setY(.5), 3, .7, M.teal, .4); },
    ai: (g, u) => { const t = u.target; return t && t.alive && isUnit(t) && known(g, u, 'vrush') ? (d => d > 4 && d < T.cantor.rushRange ? { x: t.pos.x, z: t.pos.z, id: t.id } : null)(gap(g, u, t)) : null; } }],
  lancer: [{ key: 'skip', name: 'Skip', hotkey: 'C', energy: 0, cd: T.lancer.skipCd, cast: 0, range: T.lancer.skip, target: 'point', blurb: 'Steps 8 m in a blink. Needs Skip from a Dusk Hall.',
    can: (g, u) => known(g, u, 'vskip'), effect: (g, u, t) => blink(g, u, t, T.lancer.skip), show: (g, u) => showBlink(g, u),
    ai: (g, u) => { const t = u.target; if (!t || !t.alive || !isUnit(t) || !known(g, u, 'vskip')) return null; const d = gap(g, u, t); if (d > T.lancer.range + 2) return null;
      // away when its shield is nearly gone, or when a blade has closed on it (a Lancer wants range)
      if (u.shield > u.maxShield * .4 && !near(g, u.pos.x, u.pos.z, 4, o => foe(u, o) && BLADES.has(o.kind)).length) return null; const ax = u.pos.x - t.pos.x, az = u.pos.z - t.pos.z, l = Math.hypot(ax, az) || 1; return { x: u.pos.x + ax / l * T.lancer.skip, z: u.pos.z + az / l * T.lancer.skip }; } }],
  tuner: [
    { key: 'wall', name: 'Glass Wall', hotkey: 'R', energy: 50, cd: 2, cast: 0, range: 9 + FAR, target: 'point', blurb: 'Puts up a glass pane 7 m wide for 11 s. Bodies cannot walk through it; shots can break it.',
      can: (g, u, t) => within(g, u, t, 9), effect: (g, u, t) => glassWall(g, u, t), show: (g, u, t) => showWall(g, u, t),
      ai: (g, u) => { const t = u.target; if (!t || !t.alive || !isUnit(t) || UNIT[t.kind].air) return null; // cut the enemy's melee off from our casters, or block a retreat
        const melee = near(g, u.pos.x, u.pos.z, 16, o => foe(u, o) && BLADES.has(o.kind)).length; if (melee < 2) return null;
        const ax = t.pos.x - u.pos.x, az = t.pos.z - u.pos.z, l = Math.hypot(ax, az) || 1; return { x: u.pos.x + ax / l * Math.min(7, l * .6), z: u.pos.z + az / l * Math.min(7, l * .6) }; } },
    { key: 'hum', name: 'Ward Hum', hotkey: 'C', energy: 75, cd: 2, cast: 0, range: 0, target: 'self', radius: T.tuner.humR, blurb: 'For 11 s every friend within 5 m takes 2 less from each shot.',
      effect: (g, u) => { (u as any).humT = g.time + T.tuner.humT; g.warn(u.pos.x, u.pos.z, T.tuner.humR, 1); },
      show: (g, u) => { g.puff(TMP.set(u.pos.x, 1.4, u.pos.z), 6, T.tuner.humR * .5, M.cyan, .6, T.tuner.humR * .6); sfx.charge(g.vol(u.pos)); },
      ai: (g, u) => near(g, u.pos.x, u.pos.z, 18, o => foe(u, o) && !!o.target).length >= 4 && near(g, u.pos.x, u.pos.z, T.tuner.humR, o => o.team === u.team).length >= 3 ? { x: u.pos.x, z: u.pos.z } : null },
    { key: 'voice', name: 'False Voice', hotkey: 'V', energy: 100, cd: 2, cast: 0, range: 9 + FAR, target: 'body', who: 'ally', blurb: 'Makes two copies of a friend for 30 s. Copies deal no damage and take double.',
      can: (g, u, t) => { if (!within(g, u, t, 9)) return false; const o = g.uById?.get(t.id!) || g.units.find(x => x.id === t.id); return !!o && isUnit(o) && !echo(o) && !UNIT[o.kind].air && o.kind !== 'tender'; }, effect: (g, u, _t, o) => falseVoice(g, u, o as Unit),
      show: (g, u, _t, o) => { if (!o) return; for (const a of [-1, 1]) g.puff(TMP.set(o.pos.x + a * 2, 1.2, o.pos.z), 4, .9, M.violet, .8); sfx.charge(g.vol(o.pos)); },
      ai: (g, u) => { if ((u.energy ?? 0) < 150) return null; const big = near(g, u.pos.x, u.pos.z, 9, o => o.team === u.team && (o.kind === 'warden' || o.kind === 'bell' || o.kind === 'reedwalker') && !echo(o))[0]; return big && near(g, u.pos.x, u.pos.z, 25, o => foe(u, o)).length >= 3 ? { x: big.pos.x, z: big.pos.z, id: big.id } : null; } },
  ],
  mute: [{ key: 'step', name: 'Step Through', hotkey: 'C', energy: 0, cd: T.mute.stepCd, cast: 0, range: T.mute.stepRange, target: 'point', blurb: 'Blinks 9 m. Needs Step Through from a Quiet House.',
    can: (g, u) => known(g, u, 'vstepthru'), effect: (g, u, t) => blink(g, u, t, T.mute.stepRange), show: (g, u) => showBlink(g, u),
    ai: (g, u) => { const t = u.target; if (!t || !t.alive || !known(g, u, 'vstepthru')) return null; const d = gap(g, u, t); return d > 4 && d < T.mute.stepRange ? { x: t.pos.x, z: t.pos.z } : null; } }],
  choirmaster: [
    { key: 'shatter', name: 'Shatter Note', hotkey: 'R', energy: 75, cd: 1.5, cast: .25, range: 9 + FAR, target: 'area', radius: T.choirmaster.shatterR, blurb: 'Marks a 3 m circle; a second later it cracks for 80 damage over 4 s to everyone in it, friends too. Needs Shatter Note from a Song Archive.',
      can: (g, u, t) => known(g, u, 'vshatter') && within(g, u, t, 9), effect: (g, u, t) => shatter(g, u, t), show: (g, u, t) => showShatter(g, u, t),
      ai: (g, u) => { if (!known(g, u, 'vshatter')) return null; const c = cluster(g, u, 9 + reach(g, u), T.choirmaster.shatterR); return c && c.n >= 3 && c.friends * 3 <= c.n ? c : null; } },
    { key: 'drain', name: 'Drain', hotkey: 'C', energy: 50, cd: 1, cast: 0, range: T.choirmaster.range + FAR, target: 'body', blurb: 'Takes up to 50 energy from an enemy body and deals that much damage to it.',
      can: (g, u, t) => { const o = g.units.find(x => x.id === t.id); return !!o && (o.energy ?? 0) > 0 && within(g, u, t, T.choirmaster.range); },
      effect: (g, u, _t, o) => { const t = o as Unit, n = Math.min(t.energy ?? 0, T.choirmaster.drain); t.energy = (t.energy ?? 0) - n; zap(g, u, t, n * (echo(u) ? 0 : 1), .2, beamMat); g.hud.damage(V3(t.pos.x, UNIT[t.kind].headY + .6, t.pos.z), 'DRAINED', 'shield'); },
      // with Shatter Note learned it keeps 75 energy back for it
      ai: (g, u) => { if (known(g, u, 'vshatter') && (u.energy ?? 0) < 50 + 75) return null; const t = near(g, u.pos.x, u.pos.z, T.choirmaster.range + reach(g, u), o => foe(u, o) && (o.energy ?? 0) >= 40 && seenBy(g, u.team, o)).sort((a, b) => (b.energy ?? 0) - (a.energy ?? 0))[0]; return t ? { x: t.pos.x, z: t.pos.z, id: t.id } : null; } },
    { key: 'join', name: 'Join', hotkey: 'V', energy: 0, cd: 2, cast: 0, range: 0, target: 'self', blurb: 'Joins with another Choirmaster within 8 m. In 10 s the two become one Chord.',
      can: (g, u) => near(g, u.pos.x, u.pos.z, 8, o => o !== u && o.team === u.team && o.kind === 'choirmaster' && !JOIN.has(o)).length > 0, effect: (g, u) => joinUp(g, u), show: (g, u) => { sfx.charge(g.vol(u.pos)); g.puff(TMP.set(u.pos.x, 1.6, u.pos.z), 5, .9, M.cyan, .8); },
      ai: (g, u) => (u.energy ?? 0) < 50 && !near(g, u.pos.x, u.pos.z, 20, o => foe(u, o)).length && near(g, u.pos.x, u.pos.z, 8, o => o !== u && o.team === u.team && o.kind === 'choirmaster' && (o.energy ?? 0) < 75 && !JOIN.has(o)).length ? { x: u.pos.x, z: u.pos.z } : null },
  ],
  knell: [{ key: 'toll', name: 'Toll', hotkey: 'Mouse0', energy: 0, cd: T.knell.cd, cast: 0, range: T.knell.range, target: 'area', radius: T.knell.r, blurb: 'Rolls an orb to a spot. After 3 s it bursts for 145 on everything within 3 m, friends too.',
    can: (g, u) => true, effect: (g, u, t) => { toll(g, u, t); if (g.upOf(u.team).vtoll && u.abCd) u.abCd.toll = T.knell.quickCd; }, show: (g, u, t) => showToll(g, u, t),
    ai: (g, u) => { const c = cluster(g, u, T.knell.range, T.knell.r); return c && c.n >= 3 && c.friends * 3 <= c.n ? c : null; } }],
  listener: [{ key: 'settle', name: 'Settle', hotkey: 'C', energy: 0, cd: 1, cast: 0, range: 0, target: 'self', blurb: 'Stops and sees further. Use again to fly on.',
    effect: (g, u) => { const L = u as any; L.settled = !L.settled; if (!L.settled) clearStatus(u, 'root'); },
    // settles where a fight is close but not on top of it; flies on when the fight has gone, or comes too close
    ai: (g, u) => { const L = u as any, f = (r: number) => near(g, u.pos.x, u.pos.z, r, o => foe(u, o)).length > 0; return (!L.settled && f(22) && !f(7)) || (L.settled && (!f(28) || f(5))) ? { x: u.pos.x, z: u.pos.z } : null; } }],
  ferry: [
    { key: 'unfold', name: 'Unfold', hotkey: 'C', energy: 0, cd: 1.5, cast: 0, range: 0, target: 'self', blurb: 'Lands and opens into a song field (5 m). Use again to fold up and fly.',
      effect: (g, u) => { const on = !unfolded(u); setUnfolded(u, on); if (on) addStatus(u, 'root', Infinity); else clearStatus(u, 'root'); g.warn(u.pos.x, u.pos.z, T.ferry.fold * 3, 1); },
      show: (g, u) => { sfx.charge(g.vol(u.pos)); g.puff(TMP.set(u.pos.x, .4, u.pos.z), 6, 1.2, M.dust, .6, 2); },
      ai: (g, u) => { const on = unfolded(u), fight = near(g, u.pos.x, u.pos.z, 26, o => foe(u, o)).length > 0, home = g.ownB(undefined, true, u.team).some(b => Math.hypot(b.pos.x - u.pos.x, b.pos.z - u.pos.z) < 25); return !on && !home && fight && !(u.cargo && u.cargo.length) && g.upOf(u.team).vfar ? { x: u.pos.x, z: u.pos.z } : on && !fight && (u as any).wantMove ? { x: u.pos.x, z: u.pos.z } : null; } },
    { key: 'load', name: 'Load', hotkey: 'R', energy: 0, cd: .5, cast: 0, range: 0, target: 'self', blurb: 'Takes in every friend within 4 m that fits (8 beds).',
      can: (g, u) => !unfolded(u), effect: (g, u) => { for (const o of near(g, u.pos.x, u.pos.z, 4 + UNIT.ferry.rad, o => o.team === u.team && !o.air && !o.inside && o !== g.me && !o.pilot && o !== u)) if (usedOf(u) + (UNIT[o.kind].slots ?? UNIT[o.kind].supply) <= roomOf(u)) load(g, u, o); } },
    { key: 'drop', name: 'Unload', hotkey: 'V', energy: 0, cd: .5, cast: 0, range: 0, target: 'self', blurb: 'Lets everyone out beside the Ferry.', can: (g, u) => !!(u.cargo && u.cargo.length), effect: (g, u) => { unload(g, u); } },
  ],
  swift: [{ key: 'lift', name: 'Lift', hotkey: 'C', energy: T.swift.lift, cd: 1, cast: 0, range: T.swift.liftRange, target: 'body', blurb: 'Holds an enemy ground body in the air for 8 s: it cannot move or fight.',
    can: (g, u, t) => { const o = g.units.find(x => x.id === t.id); return !!o && !o.air && !hasTag(o, 'huge') && !hasStatus(o, 'lifted'); },
    effect: (g, u, _t, o) => { addStatus(o as Unit, 'lifted', T.swift.liftT); (o as Unit).target = null; zap(g, u, o as Unit, 0, .2); },
    ai: (g, u) => { if (near(g, u.pos.x, u.pos.z, T.swift.range + 6, o => foe(u, o) && o.air).length >= 2) return null; const t = liftable(g, u, T.swift.liftRange)[0]; return t ? { x: t.pos.x, z: t.pos.z, id: t.id } : null; } }],
  prism: [{ key: 'burn', name: 'Burn Bright', hotkey: 'C', energy: 0, cd: T.prism.burnCd, cast: 0, range: 0, target: 'self', blurb: 'For 12 s the beam does 10 more to plated bodies.',
    effect: (g, u) => { (u as any).burnT = g.time + T.prism.burnT; },
    show: (g, u) => { sfx.charge(g.vol(u.pos)); g.puff(TMP.set(u.pos.x, (u.alt || 0) + 1, u.pos.z), 5, .8, M.cyan, .6); },
    ai: (g, u) => { const t = u.target; return t && t.alive && gap(g, u, t) < T.prism.range + 2 && (hasTag(t, 'plated') || near(g, u.pos.x, u.pos.z, T.prism.range + 2, o => foe(u, o) && hasTag(o, 'plated')).length >= 2) ? { x: u.pos.x, z: u.pos.z } : null; } }],
  omen: [
    { key: 'shrill', name: 'Shrill', hotkey: 'Mouse0', energy: T.omen.shrill, cd: 1, cast: 0, range: 0, target: 'self', blurb: 'Turns the beam on: it burns energy while on and hits soft bodies hard. Use again to turn it off.',
      effect: (g, u) => { const O = u as any; O.shrill = !O.shrill; if (!O.shrill) u.energy = (u.energy ?? 0) + T.omen.shrill; },
      ai: (g, u) => { const O = u as any, soft = near(g, u.pos.x, u.pos.z, T.omen.range + 6, o => foe(u, o) && !o.air && hasTag(o, 'soft') && seenBy(g, u.team, o)).length, guns = near(g, u.pos.x, u.pos.z, 20, o => foe(u, o) && isFighter(o) && !hasTag(o, 'soft')).length; return (!O.shrill && soft >= 2 && soft >= guns && (u.energy ?? 0) > 60) || (O.shrill && !soft) ? { x: u.pos.x, z: u.pos.z } : null; } },
    { key: 'reveal', name: 'Reveal', hotkey: 'C', energy: T.omen.reveal, cd: 1, cast: 0, range: 12, target: 'area', radius: T.omen.revealR, blurb: 'Every enemy body in an 8 m circle can be seen for 20 s, unseen or not.',
      effect: (g, u, t) => { for (const o of near(g, t.x, t.z, T.omen.revealR, o => foe(u, o))) addStatus(o, 'revealed', T.omen.revealT); g.warn(t.x, t.z, T.omen.revealR, 1.2); },
      show: (g, u, t) => { g.puff(TMP.set(t.x, 1, t.z), 8, T.omen.revealR * .5, M.indigoL, .6, T.omen.revealR); sfx.charge(g.vol(u.pos) * .6); },
      ai: (g, u) => { const h = g.units.find(o => o.alive && foe(u, o) && (UNIT[o.kind].cloak || o.status?.some(s => s.k === 'unseen' || s.k === 'dug')) && !hasStatus(o, 'revealed') && Math.hypot(o.pos.x - u.pos.x, o.pos.z - u.pos.z) < 12 && !seenBy(g, u.team, o)); return h ? { x: h.pos.x, z: h.pos.z } : null; } },
    { key: 'stone', name: 'Still Stone', hotkey: 'V', energy: T.omen.stone, cd: 1, cast: 0, range: 8, target: 'point', blurb: 'Leaves a hidden trap. The first enemy ground body to come within 4 m freezes everything around it for 20 s: frozen bodies cannot act or be hurt.',
      effect: (g, u, t) => { S(g).stones.push({ x: t.x, z: t.z, team: u.team, arm: T.omen.stoneArm, by: u }); },
      show: (g, u, t) => { if (mine(g, u)) g.puff(TMP.set(t.x, .3, t.z), 3, .6, M.indigoL, .3); },   // a trap: only its own side sees it laid
      ai: (g, u) => { if ((u.energy ?? 0) < 150 || S(g).stones.filter(s => s.team === u.team).length >= 3) return null; const home = g.ownB(undefined, true, u.team)[0]; if (!home || Math.hypot(home.pos.x - u.pos.x, home.pos.z - u.pos.z) > 40 || near(g, u.pos.x, u.pos.z, 30, o => foe(u, o)).length) return null; const hq = g.ownB('choir', true, u.team)[0] || home, [ox, oz] = [hq.pos.x, hq.pos.z], a = u.id * 2.39; return { x: u.pos.x + (ox - u.pos.x) * 0 + Math.cos(a) * 4, z: u.pos.z + Math.sin(a) * 4 }; } },
  ],
  cantus: [
    { key: 'gather', name: 'Gather', hotkey: 'C', energy: 0, cd: T.cantus.gatherCd, cast: 1.5, range: 400, target: 'point', radius: T.cantus.gatherR, blurb: 'Calls every friend within 7 m of a spot to the Cantus.',
      effect: (g, u, t) => { let i = 0; for (const o of near(g, t.x, t.z, T.cantus.gatherR, o => o.team === u.team && o !== u && !o.inside && o.kind !== 'cantus')) { const a = i++ * 2.4; o.pos.x = u.pos.x + Math.cos(a) * (3 + i * .3); o.pos.z = u.pos.z + Math.sin(a) * (3 + i * .3); o.obj.position.x = o.pos.x; o.obj.position.z = o.pos.z; o.target = null; o.order = { type: 'guard', x: o.pos.x, z: o.pos.z }; } },
      show: (g, u, t) => { g.puff(TMP.set(t.x, 1.2, t.z), 8, 1.4, M.violet, .8, 2); g.puff(TMP.set(u.pos.x, 1.2, u.pos.z), 10, 1.6, M.violet, .8, 3); sfx.charge(g.vol(u.pos)); },
      ai: (g, u) => { // a group losing far from the Cantus comes home to it
        for (const o of g.army(u.team)) { if (o.kind === 'cantus' || Math.hypot(o.pos.x - u.pos.x, o.pos.z - u.pos.z) < 40) continue; const mine = near(g, o.pos.x, o.pos.z, T.cantus.gatherR, f => f.team === u.team && isFighter(f)), theirs = near(g, o.pos.x, o.pos.z, 16, f => foe(u, f) && isFighter(f)); if (mine.length >= 4 && theirs.length > mine.length * 1.6 && mine.every(f => f.shield < f.maxShield * .3)) return { x: o.pos.x, z: o.pos.z }; } return null; } },
    { key: 'hold', name: 'Hold Time', hotkey: 'R', energy: T.cantus.hold, cd: 1, cast: 0, range: 16, target: 'area', radius: T.cantus.holdR, blurb: 'Every enemy body in an 8 m circle moves 60% slower for 8 s.',
      effect: (g, u, t) => { g.warn(t.x, t.z, T.cantus.holdR, T.cantus.holdT); for (const o of near(g, t.x, t.z, T.cantus.holdR, o => foe(u, o))) addStatus(o, 'slow', T.cantus.holdT, T.cantus.holdSlow); },
      ai: (g, u) => { const c = cluster(g, u, 16, T.cantus.holdR, o => foe(u, o)); return c && c.n >= 5 ? c : null; } },
  ],
};
for (const k in ABS) defineAbilities(k, ABS[k]);

// ---------------------------------------------------------------- first person
const KEY = (h: string) => h.startsWith('Mouse') ? h : 'Key' + h;
/** How much faster a driven body fires than its bot: driving one is the stronger way to play (each kind does at least 1.4 times its bot's
 *  damage a second, test/factions/veyl.ts). Hits go through g.vMul like the bots' do. */
export const FP = 1 / .7;
/** The first-person weapon of each new kind: damage, seconds between shots, reach, and what a hit does. */
export const GUNS: Partial<Record<Kind, { dmg: number; cd: number; range: number; w: number; hit?(g: Game, me: Unit, t: Unit | Building | null, end: THREE.Vector3): void }>> = {
  tuner: { dmg: T.tuner.dmg * 1.4, cd: T.tuner.cd * .8, range: T.tuner.range, w: .05 },
  chord: { dmg: T.chord.dmg, cd: T.chord.cd / FP, range: T.chord.range + 2, w: .25, hit: (g, me, t, end) => { for (const o of near(g, end.x, end.z, T.chord.splash, o => foe(me, o) && o !== t && canHit(me, o))) g.damage(o, T.chord.dmg * .6 * g.vMul(me.team), me); g.puff(end, 4, T.chord.splash * .6, M.cyan, .8, 1.5); } },
  bell: { dmg: T.bell.dmg, cd: T.bell.cd / FP, range: T.bell.range + 2, w: .18 },
  reedwalker: { dmg: 0, cd: T.reedwalker.cd / FP, range: T.reedwalker.range + 4, w: 0, hit: (g, me, _t, end) => sweep(g, me, end.x, end.z) },
  swift: { dmg: T.swift.dmg * 2, cd: T.swift.cd / FP, range: T.swift.range + 4, w: .06 },
  prism: { dmg: T.prism.dmg, cd: T.prism.cd / FP, range: T.prism.range + 2, w: .12 },
  omen: { dmg: T.omen.dmg, cd: T.omen.cd / FP, range: T.omen.range + 2, w: .12 },
  cantus: { dmg: T.cantus.dmg * 2, cd: T.cantus.cd * .6, range: T.cantus.range + 2, w: .12 },
  shard: { dmg: T.shard.dmg * 2, cd: T.shard.cd, range: T.shard.range + 4, w: .04 },
};
/** First person for the new kinds: the left mouse button fires the kind's beam (or its main ability), the right button and R, C, V use
 *  its abilities aimed at the crosshair. Returns true when it handled the body (the old Cantor, Lancer and Warden keep their own code). */
export function driveNew(g: Game, dt: number, P: Set<string>, eye: THREE.Vector3, dir: THREE.Vector3, look: Hit | null): boolean {
  const me = g.me!, k = me.kind, abs = abilitiesOf(k), gun = GUNS[k];
  // the abilities, by key, aimed where the crosshair points
  const aim = (): Target => { const d = look ? look.dist : 40, p = V3().copy(eye).addScaledVector(dir, Math.min(d, 60)); if (!look && dir.y < -.01) { const t = -eye.y / dir.y; p.copy(eye).addScaledVector(dir, Math.min(t, 60)); } const tgt = look?.unit || look?.b; return { x: p.x, z: p.z, id: tgt ? tgt.id : 0 }; };
  const tips: string[] = [];
  for (const a of abs) {
    const ready = !whyNot(g, me, a.key, a.target === 'self' ? { x: me.pos.x, z: me.pos.z } : aim()); tips.push(`<b>${a.hotkey.replace('Mouse0', 'Click').replace('Mouse2', 'Right click')}</b> ${a.name}${a.energy ? ' · ' + a.energy : ''}${ready ? '' : ' <i>(not now)</i>'}`);
    if (a.hotkey === 'Mouse0' && gun) continue;
    const pressed = a.hotkey === 'Mouse0' ? g.lmb && g.fireCd <= 0 : P.has(KEY(a.hotkey)); if (!pressed) continue;
    const t = a.target === 'self' ? { x: me.pos.x, z: me.pos.z } : aim(), why = whyNot(g, me, a.key, t);
    if (why) { sfx.deny(); if (a.hotkey !== 'Mouse0') g.feed(UNIT[k].name, why === 'energy' ? `Not enough energy for ${a.name}: it takes ${a.energy}.` : why === 'cooldown' ? `${a.name} is not ready yet.` : why === 'range' ? `Too far for ${a.name}.` : why === 'refused' ? `${a.name} cannot be used here or on that.` : `${a.name}: ${why}.`, 'al', me.team); g.fireCd = .25; continue; }
    useAbility(g, me, a.key, t); g.fireCd = .3; g.recoil = .6; g.shake = Math.max(g.shake, .2);
  }
  if (!g.prompt && tips.length) g.prompt = tips.join(' &nbsp; ');
  // Quicken: any Veyl body looking at its own finished building presses Z to spend a Choir Stone's energy on it.
  if (P.has('KeyZ') && look?.b && look.b.team === me.team && look.b.built && fieldsOn(g, me.team)) { if (quicken(g, look.b)) g.feed('Conductor', `Quicken: the ${BLD[look.b.kind].name} works 50% faster for 20 seconds.`, '', me.team); else sfx.deny(); }
  if (!gun) return abs.length > 0 || k === 'mute' || k === 'lyre';
  if (k === 'omen' && !(me as any).shrill) return true;
  if (!g.lmb || g.fireCd > 0) return true;
  g.fireCd = gun.cd; g.recoil = 1; g.kick += .015; me.swing = 1; sfx.zap(1);
  const hit = g.ray(eye, dir, gun.range, -1, me), end = V3().copy(eye).addScaledVector(dir, hit ? hit.dist : gun.range);
  const muzzle = V3().copy(eye).addScaledVector(dir, 1.2).setY(eye.y - .4);
  if (gun.w) g.tracer(muzzle, end, beamMat, gun.w);
  const tgt = hit && (hit.unit && foe(me, hit.unit) ? hit.unit : hit.b && foe(me, hit.b) ? hit.b : null);
  if (tgt && canHit(me, tgt) && gun.dmg) { const extra = k === 'prism' && burning(g, me) && hasTag(tgt, 'plated') ? T.prism.burn : k === 'omen' && hasTag(tgt, 'soft') ? T.omen.soft : 0; g.damage(tgt, (gun.dmg + extra) * (UNIT[k].air ? airK(g, me.team) : 1) * g.vMul(me.team), me, !!hit!.head); g.hud.hitmark(!!hit!.head); sfx.hit(); }
  else if (tgt && !canHit(me, tgt) && gun.dmg) { sfx.deny(); g.hud.damage(end, UNIT[k].air ? 'AIR ONLY' : 'CANNOT REACH', 'kobad'); }
  gun.hit?.(g, me, tgt, end);
  return true;
}
/** The Mute's blades in first person: the Cantor's cut, harder and slower. */
export function driveMute(g: Game, dir: THREE.Vector3) {
  const me = g.me!; if (!g.lmb || g.fireCd > 0) return; g.fireCd = T.mute.cd / FP; g.recoil = 1; me.swing = 1; sfx.slash(1); let any = false;
  for (const u of g.units) { if (!u.alive || !foe(me, u) || u.air) continue; const dx = u.pos.x - me.pos.x, dz = u.pos.z - me.pos.z, d = Math.hypot(dx, dz); if (d > 3 + UNIT[u.kind].rad || (dx * dir.x + dz * dir.z) / (d || 1) < .45) continue; g.damage(u, T.mute.cut * g.vMul(me.team), me); any = true; }
  for (const b of g.buildings) { if (!b.alive || !foe(me, b) || g.distToBox(b, me.pos.x, me.pos.z) > 2.8) continue; g.damage(b, T.mute.cut * .75 * g.vMul(me.team), me); any = true; }
  if (any) { g.hud.hitmark(false); sfx.hit(); g.shake = Math.max(g.shake, .25); }
}
/** The Lyre in first person: click sends its Shards at whatever the crosshair is on. */
export function driveLyre(g: Game, look: Hit | null) { const me = g.me!, t = look && (look.unit && foe(me, look.unit) ? look.unit : look.b && foe(me, look.b) ? look.b : null); if (g.lmb && t) me.target = t; if (!g.prompt) g.prompt = `Shards held: <b>${(me as any).held ?? 0}</b> · Click a target to send them`; }

// ---------------------------------------------------------------- registry
defineUnits({
  tuner: { ai: aiTuner, threat: 1.2, step: 0 }, mute: { ai: (g, u, dt) => bladeAI(g, u, dt, T.mute.cut, T.mute.cd, 1), threat: 1.2, step: 0, killStop: .1 },
  choirmaster: { ai: aiHang, threat: 1.4, step: 0, skipRespawn: true }, chord: { ai: aiChord, threat: 1.3, steady: true, koWord: 'DISCORD!' },
  bell: { ai: aiBell, threat: 1.1, steady: true, step: 2 }, reedwalker: { ai: aiReed, heavy: true, steady: true, step: 2, threat: 1.3, koWord: 'TIMBER-RING!' },
  knell: { ai: aiHang, threat: 1.3, step: 2 }, listener: { ai: aiListener, threat: 1.2 }, ferry: { ai: aiFerry, threat: .9, skipRespawn: true },
  swift: { ai: aiSwift }, prism: { ai: aiPrism, threat: 1.1 }, omen: { ai: aiOmen, threat: 1.1 }, lyre: { ai: aiLyre, heavy: true, threat: 1.2, skipRespawn: true },
  shard: { ai: shardAI, threat: .3, skipRespawn: true }, cantus: { ai: aiCantus, heavy: true, threat: 1.5, skipRespawn: true, limit: 1, koWord: 'SILENCE.' },
});
/** Every Veyl body: a False Voice copy takes double from each hit, and a hit within 5 m of a humming Tuner loses 2. */
export function veylHurt(g: Game, u: Unit, amt: number) {
  if (echo(u)) amt *= 2;
  for (const o of g.units) if (o.alive && o.kind === 'tuner' && o.team === u.team && ((o as any).humT ?? 0) > g.time && Math.hypot(o.pos.x - u.pos.x, o.pos.z - u.pos.z) < T.tuner.humR) return Math.max(.5, amt - T.tuner.humCut);
  return amt;
}
defineUnits(Object.fromEntries((Object.keys(UNIT) as Kind[]).filter(k => UNIT[k].team === 1).map(k => [k, { hurt: veylHurt }])));
