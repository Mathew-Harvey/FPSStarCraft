// Shared pieces for the Ironhold rules: research multipliers by line (infantry, machines, ships), timed boosts kept per body, finding a
// target a weapon can reach, and one plain way for a bot or a player to fire a kind's gun. Used by ground.ts, air.ts and bases.ts.
import * as THREE from 'three';
import { V3, R, tracerMat } from '../../gfx';
import { sfx } from '../../audio';
import type { Game } from '../../game';
import { UNIT, Unit, Building, isUnit, UPGRADES, fac } from '../../data';
import { canHit, levelMul, hasTag, type Tag } from '../../core/combat';
import { seenBy } from '../../core/sight';
import { isEnemy } from '../../core/sides';
import { altOf } from '../../core/air';
import { I_CAT, I_TUNE, type ICat, type IKind } from './numbers';

export const TUNE = I_TUNE;
export type Tgt = Unit | Building;

// ---------------------------------------------------------------- research lines
const LINE_KEYS: Record<string, string[]> = {};
function keysOf(cat: ICat, line: 'atk' | 'arm') {
  const k = cat + line; let c = LINE_KEYS[k];
  if (!c) LINE_KEYS[k] = c = UPGRADES.filter(u => (u.team || 0) === 0 && (u as any).mline === line && ((u as any).cat === cat || (line === 'arm' && cat === 'ship' && (u as any).cat === 'mech'))).sort((a, b) => (a.lvl || 0) - (b.lvl || 0)).map(u => u.key);
  return c;
}
const PCT = [1.25, 1.2, 1.15];
/** The multiplier from machine or ship levels bought, in the same steps as infantry levels. */
function ownLevels(g: Game, team: number, cat: ICat, line: 'atk' | 'arm') { const U = g.upOf(team); let m = 1; keysOf(cat, line).forEach((k, i) => { if (U[k]) m *= PCT[i]; }); return m; }
export const catOf = (k: string): ICat => I_CAT[k as IKind] || 'inf';
/** How hard this body's gun hits after research: infantry follow the Assay Office's levels (the shared gunMul), machines the Foundry's, ships the Mast's. */
export function mulOf(g: Game, u: Unit) {
  const base = g.gunMul(u.team), c = catOf(u.kind); if (c === 'inf' || fac(u.team) !== 0) return base;
  return base / levelMul(g, u.team, 'atk') * ownLevels(g, u.team, c, 'atk');
}
/** The health a body of this kind should have after research: infantry plate for infantry, machine and ship plate for the rest, Kit Belts. */
export function wantHp(g: Game, u: Unit) {
  const c = catOf(u.kind), st = UNIT[u.kind]; let hp = st.hp * (c === 'inf' ? levelMul(g, u.team, 'arm') : ownLevels(g, u.team, c, 'arm'));
  if ((u.kind === 'linesman' || u.kind === 'sapper') && g.upOf(u.team).kitbelt) hp += 15;
  return hp;
}
/** Every half second (host): each Ironhold body's health ceiling is moved to what its line's research says, keeping its share of health. */
let normT = 0;
export function normalise(g: Game, dt: number) {
  normT -= dt; if (normT > 0 || g.net) return; normT = .5;
  for (const u of g.units) { if (!u.alive || fac(u.team) !== 0) continue; const w = wantHp(g, u); if (Math.abs(w - u.maxHp) > .5) { const k = u.hp / u.maxHp; u.maxHp = w; u.hp = Math.max(1, w * k); } }
}

// ---------------------------------------------------------------- timed boosts
/** Boosts a body carries for a while, by name, as the game time they end. Kept off the Unit record so nothing else has to know. */
const BOOST = new WeakMap<Unit, Record<string, number>>();
export function boost(g: Game, u: Unit, k: string, secs: number) { const b = BOOST.get(u) || {}; b[k] = Math.max(b[k] || 0, g.time + secs); BOOST.set(u, b); }
export const boosted = (g: Game, u: Unit, k: string) => (BOOST.get(u)?.[k] || 0) > g.time;
export const boostLeft = (g: Game, u: Unit, k: string) => Math.max(0, (BOOST.get(u)?.[k] || 0) - g.time);
export function unboost(u: Unit, k: string) { const b = BOOST.get(u); if (b) delete b[k]; }

/** Per-body memory the rules keep (a mine's owner, a toggle). */
const MEM = new WeakMap<object, Record<string, any>>();
export const mem = (o: object) => { let m = MEM.get(o); if (!m) MEM.set(o, m = {}); return m; };

// ---------------------------------------------------------------- targets
export const dist = (a: { pos: THREE.Vector3 }, b: { pos: THREE.Vector3 }) => Math.hypot(a.pos.x - b.pos.x, a.pos.z - b.pos.z);
export const gap = (g: Game, u: Unit, t: Tgt) => isUnit(t) ? dist(u, t) : g.distToBox(t as Building, u.pos.x, u.pos.z);
/** Can this body shoot at that one: an enemy, alive, out in the open, a layer its weapon reaches, and seen. */
export function fair(g: Game, u: Unit, t: Tgt) {
  if (!t.alive || !isEnemy(u.team, t.team)) return false;
  if (isUnit(t)) { if (t.inside) return false; if ((t.air || t.status || UNIT[t.kind].cloak) && (!canHit(u, t) || !seenBy(g, u.team, t))) return false; return true; }
  return !(t as Building).air || canHit(u, t);
}
/** The nearest enemy body within range that passes `ok`. */
export function nearest(g: Game, u: Unit | { pos: THREE.Vector3; team: number; kind?: string }, range: number, ok: (o: Unit) => boolean = () => true): Unit | null {
  let best: Unit | null = null, bd = range;
  for (const o of g.units) { if (!o.alive || !isEnemy(u.team, o.team) || o.inside) continue; const d = Math.hypot(o.pos.x - u.pos.x, o.pos.z - u.pos.z); if (d >= bd || !ok(o)) continue; best = o; bd = d; }
  return best;
}
/** Enemy bodies within a circle. */
export function within(g: Game, team: number, x: number, z: number, r: number, air: 'ground' | 'air' | 'both' = 'both') {
  return g.units.filter(o => o.alive && isEnemy(team, o.team) && !o.inside && Math.hypot(o.pos.x - x, o.pos.z - z) <= r + UNIT[o.kind].rad && (air === 'both' || (air === 'air') === !!o.air));
}
/** Extra damage for a hit against a tag, given as a share (a shotgun's pellet carries a ninth of the volley's bonus). */
export const tagBonus = (t: Tgt, tag: Tag, n: number) => hasTag(t, tag) ? n : 0;

/** Where a body's gun sits, for tracers. */
export function muzzle(u: Unit, fwd = 1.1) { const st = UNIT[u.kind]; return V3(u.pos.x + Math.sin(u.yaw) * fwd, st.bodyY + .3 + altOf(u), u.pos.z + Math.cos(u.yaw) * fwd); }
/** Where to aim at a target. */
export function aimPt(t: Tgt) { return isUnit(t) ? V3(t.pos.x, UNIT[t.kind].bodyY + altOf(t), t.pos.z) : V3(t.pos.x, Math.min((t as Building).h * .5, 3) + altOf(t), t.pos.z); }

/** A plain direct-fire gun a bot body uses: in range it turns, fires a tracer and hits. `hit` returns the damage for one shot at that target. */
export interface Gun { range: number; cd: number; hit(g: Game, u: Unit, t: Tgt): number; acc?: number; w?: number; snd?: (v: number) => void; splash?: number; min?: number }
export function fireAt(g: Game, u: Unit, t: Tgt, gun: Gun) {
  u.cd = gun.cd * (.9 + Math.random() * .2); u.swing = 1; u.flashT = .07; g.aimAt(u, t, UNIT[u.kind].bodyY);
  const a = muzzle(u), b = aimPt(t), hit = !isUnit(t) || Math.random() < (gun.acc ?? .8); if (!hit) b.add(V3(R(-1.4, 1.4), R(-.4, 1.2), R(-1.4, 1.4)));
  g.tracer(a, b, tracerMat, gun.w ?? .08); (gun.snd || ((v: number) => sfx.shot(v)))(g.vol(u.pos) * .5);
  if (!hit) return; const dm = gun.hit(g, u, t) * mulOf(g, u);
  if (gun.splash) { b.y = Math.max(.3, b.y); g.damage(t, dm, u); g.burst(b, dm * .5, gun.splash, u, t); } else g.damage(t, dm, u);
}

/** Follows the body's standing order when it has nobody to shoot: follow the player or its lead, else walk the order. Same as the soldier brain. */
export function walkOrder(g: Game, u: Unit, dt: number) {
  u.target = null; u.pitch *= .9; const o = u.order, me = g.me; let lead = o.lead?.alive ? o.lead : me;
  if (o.type === 'follow' && o.lead && !o.lead.alive && o.lead.pilot) { const nb = g.units.find(x => x.alive && x.pilot === o.lead!.pilot && x.team === u.team); if (nb) { o.lead = nb; lead = nb; } }
  if (o.type === 'follow' && lead?.alive) { const a = u.slot * 2.4, r = 2.8 + (u.slot % 3) * 1.0 + UNIT[u.kind].rad, tx = lead.pos.x + Math.cos(a) * r, tz = lead.pos.z + Math.sin(a) * r; if (Math.hypot(tx - u.pos.x, tz - u.pos.z) > 1.6) g.moveTo(u, tx, tz, dt, .5, 1.3); }
  else if (o.type !== 'follow') g.advance(u, dt, o.type === 'amove' ? 5 : .7);
}
/** A bot body with one gun: pick a target it can reach, close to range, shoot; with none, follow orders. Returns the target it shot at. */
export function aiGun(g: Game, u: Unit, dt: number, gun: Gun, look = gun.range + 10, bRange = 28): Tgt | null {
  if (u.think <= 0) { u.think = .3; const t = g.acquire(u, look, u.order.type === 'guard' ? 0 : bRange); u.target = t && fair(g, u, t) ? t : null; }
  const t = u.target;
  if (t && t.alive && fair(g, u, t)) {
    const d = gap(g, u, t);
    if (d > gun.range) { if (UNIT[u.kind].speed > 0) g.moveTo(u, t.pos.x, t.pos.z, dt, 1); else u.target = null; }
    else if (gun.min && d < gun.min) { u.target = null; }
    else if (u.cd <= 0) fireAt(g, u, t, gun);
    else g.aimAt(u, t, UNIT[u.kind].bodyY);
    return t;
  }
  if (UNIT[u.kind].speed > 0) walkOrder(g, u, dt); else u.target = null;
  return null;
}

// ---------------------------------------------------------------- first person
import { abilitiesOf, whyNot, useAbility, type Target } from '../../core/ability';
import type { Hit, Weapon } from '../../core/registry';
/** Where the crosshair points for an ability: the body or building under it, else the ground, else a spot `far` metres ahead. */
export function aimTarget(g: Game, eye: THREE.Vector3, dir: THREE.Vector3, look: Hit | null, far = 30): Target {
  const t = look?.unit || look?.b; if (t && look!.dist < 80) return { x: t.pos.x, z: t.pos.z, id: t.id };
  const p = V3(); if (g.groundPoint(p, 120)) return { x: p.x, z: p.z }; return { x: eye.x + dir.x * far, z: eye.z + dir.z * far };
}
/** Plain words for a refused cast, for the player. */
const WHY: Record<string, string> = { energy: 'Not enough energy.', cooldown: 'Not ready yet.', range: 'Too far away.', target: 'Not a good target for that.', refused: 'Can\'t do that here.', busy: 'Busy.', 'cannot act': 'Can\'t right now.', research: 'Needs research first.' };
/** The key for an ability's hotkey letter: 'RMB' is the right mouse button, else a letter key. */
export const keyOf = (h: string) => h === 'RMB' ? 'Mouse2' : 'Key' + h;
/** The ability keys in first person: each ability on its own hotkey (C, T, Y, or the right mouse button on a body with no scope). */
export function abilityKeys(g: Game, P: Set<string>, eye: THREE.Vector3, dir: THREE.Vector3, look: Hit | null) {
  const me = g.me!;
  for (const a of abilitiesOf(me.kind)) {
    if (!a.hotkey || !P.has(keyOf(a.hotkey))) continue;
    const t = a.target === 'self' ? { x: me.pos.x, z: me.pos.z } : aimTarget(g, eye, dir, look, Math.min(a.range, 30));
    const why = g.net ? '' : whyNot(g, me, a.key, t);
    if (why) { sfx.deny(); g.hud.damage(V3(me.pos.x + dir.x * 2.5, eye.y, me.pos.z + dir.z * 2.5), WHY[why] || 'Can\'t.', 'kobad'); continue; }
    useAbility(g, me, a.key, t); break;
  }
}
/** A player firing a kind's gun: magazine and reload as the rifles have, one ray per shot (or `pellets`), damage from the same `hit` the bot uses. */
export function driveGun(g: Game, dt: number, P: Set<string>, eye: THREE.Vector3, dir: THREE.Vector3, look: Hit | null, weapon: Weapon | null, gun: Gun, o: { spread?: number; pellets?: number; kick?: number; shake?: number; tracer?: number } = {}) {
  const me = g.me!; abilityKeys(g, P, eye, dir, look);
  if (!weapon) return;
  if (g.reloadT > 0) { g.reloadT -= dt; if (g.reloadT <= 0) g.ammo = weapon.mag; return; }
  if ((P.has('KeyR') && g.ammo < weapon.mag) || (g.ammo <= 0 && g.lmb)) { if (g.ammo <= 0) sfx.dry(); g.reloadT = weapon.reload; sfx.reload(weapon.reload); return; }
  if (!g.lmb || g.fireCd > 0 || g.ammo <= 0) return;
  g.fireCd = weapon.cd; g.ammo--; g.recoil = 1; const k = o.kick ?? .01; g.pitch = Math.min(1.45, g.pitch + k); g.kick += k * .8; g.shake = Math.min(1, g.shake + (o.shake ?? .15)); g.bloom = Math.min(1, g.bloom + .2);
  (gun.snd || ((v: number) => sfx.rifle(v)))(.6);
  const mul = mulOf(g, me), from = V3(me.pos.x + dir.x * .8, eye.y - .35, me.pos.z + dir.z * .8); let any: Tgt | null = null, total = 0;
  for (let i = 0; i < (o.pellets || 1); i++) {
    const sp = (o.spread ?? .012) * (1 + g.bloom), d = V3().copy(dir); d.x += R(-sp, sp); d.y += R(-sp, sp); d.z += R(-sp, sp); d.normalize();
    let hit = g.ray(eye, d, gun.range, -1, me); if (hit && ((hit.unit && !isEnemy(me.team, hit.unit.team)) || (hit.b && !isEnemy(me.team, hit.b.team)))) hit = null;
    let dl = hit ? hit.dist : gun.range; if (!hit && d.y < 0) dl = Math.min(dl, -eye.y / d.y);
    const end = V3().copy(eye).addScaledVector(d, dl); if (i % 2 === 0) g.tracer(from, end, tracerMat, o.tracer ?? .08);
    const t = hit && (hit.unit || hit.b) || null;
    if (t && fair(g, me, t)) { const dm = gun.hit(g, me, t) * mul / (o.pellets || 1); g.damage(t, dm, me, !!hit!.head); total += dm; any = t; g.fx.aim(end, d); }
    else if (hit?.prop) g.damageProp(hit.prop, 6 * mul, me, end);
    if (gun.splash && (t || dl < gun.range - .5)) g.burst(V3(end.x, Math.max(.3, end.y), end.z), gun.hit(g, me, t || me) * mul * .5 / (o.pellets || 1), gun.splash, me, t);
  }
  if (any) { g.hud.hitmark(false); sfx.hit(); }
}
