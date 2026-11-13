// The new Ironhold ground bodies and what the old ones learned: the Sapper and its Shaft Mines and Satchels, the Dustbike's flame and
// Kick Start, the Pile Driver and its anchored form, the Haul Drone, Riggers repairing machines, and the Linesman's Overtime, the Breacher's
// Hobble Shells and the Patch's Painkiller. Each ability goes through the shared ability system (src/core/ability.ts), so a player's key,
// the command card and the bot all use the same checks.
import type * as THREE from 'three';
import { V3, R, M, tracerMat } from '../../gfx';
import { sfx } from '../../audio';
import type { Game } from '../../game';
import { TMP } from '../../game';
import { UNIT, Unit, Building, isUnit, fac } from '../../data';
import { defineUnits, unitRule, type Weapon } from '../../core/registry';
import { defineAbilities, abilityOf, type AbilityDef } from '../../core/ability';
import { addStatus } from '../../core/status';
import { hasTag } from '../../core/combat';
import { morph } from '../../core/morph';
import { isEnemy } from '../../core/sides';
import { TUNE, Gun, aiGun, driveGun, fair, gap, nearest, within, boost, boosted, mem, mulOf, fireAt, walkOrder, dist, abilityKeys, aimTarget, type Tgt } from './kit';

const up = (g: Game, u: { team: number }) => g.upOf(u.team);
const needs = (key: string) => (g: Game, u: Unit) => !!g.upOf(u.team)[key as keyof ReturnType<Game['upOf']>];

// ---------------------------------------------------------------- Linesman, Breacher, Patch
defineAbilities('linesman', [{
  key: 'overtime', name: 'Overtime', hotkey: 'T', energy: 0, cd: 1, cast: 0, range: 0, target: 'self',
  blurb: `Lose ${TUNE.overtime.hp} health, fire and run 50% faster for ${TUNE.overtime.t} s.`,
  can: (g, u) => needs('overtime')(g, u) && u.hp > TUNE.overtime.hp + 5 && !boosted(g, u, 'ot'),
  effect(g, u) { u.hp -= TUNE.overtime.hp; boost(g, u, 'ot', TUNE.overtime.t); g.puff(TMP.set(u.pos.x, 1.4, u.pos.z), 3, .4, M.fire, 1.6, .5); if (g.vol(u.pos) > .2) sfx.dash(.6); if (u === g.me) g.hud.damage(V3(u.pos.x, 2, u.pos.z), 'OVERTIME!', 'crit'); },
  ai: (g, u) => u.target && isUnit(u.target) && u.hp > u.maxHp * .7 && dist(u, u.target) < 22 ? { x: u.pos.x, z: u.pos.z } : null,
}]);
/** How much faster a body fires right now (Overtime). */
export const fireRate = (g: Game, u: Unit) => boosted(g, u, 'ot') ? TUNE.overtime.fire : 1;
/** Hobble Shells: a Breacher hit slows a body for a moment. */
export function hobble(g: Game, u: Unit, t: Tgt) { if (up(g, u).hobble && isUnit(t) && t.alive) addStatus(t, 'slow', TUNE.hobble.t, TUNE.hobble.n, u.id); }

defineAbilities('patch', [{
  key: 'painkiller', name: 'Painkiller', hotkey: 'T', energy: TUNE.painkiller.energy, cd: 1, cast: 0, range: TUNE.painkiller.range, target: 'body', who: 'ally',
  blurb: `+${TUNE.painkiller.armour} armour on one friend for ${TUNE.painkiller.t} s.`,
  can: (g, u, t) => { const o = g.units.find(x => x.id === t.id); return !!o && fac(o.team) === 0 && !boosted(g, o, 'pk'); },
  effect(g, _u, _t, tgt) { if (!tgt || !isUnit(tgt)) return; boost(g, tgt, 'pk', TUNE.painkiller.t); g.puff(TMP.set(tgt.pos.x, UNIT[tgt.kind].bodyY + .5, tgt.pos.z), 4, .35, M.teal, 1.6, .5); },
  // A bot Patch numbs the friend in a fight who is losing the most health.
  ai(g, u) { let best: Unit | null = null, bs = 0; for (const o of g.own(undefined, u.team)) { if (!o.target || boosted(g, o, 'pk') || dist(o, u) > TUNE.painkiller.range || o === u) continue; const s = (1 - o.hp / o.maxHp) + (UNIT[o.kind].supply > 1 ? .3 : 0); if (s > bs && g.time - o.lastHit < 2) { bs = s; best = o; } } return best ? { x: best.pos.x, z: best.pos.z, id: best.id } : null; },
}]);
/** Painkiller takes its armour off every hit on the body. Wrapped round any `hurt` the kind already has. */
export function wrapHurt(kind: string) {
  const was = unitRule(kind).hurt;
  defineUnits({ [kind]: { hurt(g, u, amt, from) { if (was) amt = was(g, u, amt, from); return boosted(g, u, 'pk') ? Math.max(.5, amt - TUNE.painkiller.armour) : amt; } } });
}

// ---------------------------------------------------------------- Sapper and its mines
const SAPPER: Gun = { range: 16, cd: .45, acc: .75, hit: (_g, _u, t) => isUnit(t) ? 6 : 4 };
const minesOf = (g: Game, u: Unit) => g.units.filter(o => o.alive && o.kind === 'shaftmine' && mem(o).owner === u.id);
const keepOf = (g: Game, u: Unit) => up(g, u).minedrill ? TUNE.mine.keepDrill : TUNE.mine.keep;
/** Charges set on buildings, waiting to go off. */
const CHARGES: { b: Building; t: number; from: Unit; x: number; z: number }[] = [];
function sapperAbilities(): AbilityDef[] {
  return [{
    key: 'mine', name: 'Shaft Mine', hotkey: 'C', energy: 0, cd: TUNE.mine.cd, cast: TUNE.mine.dig, range: 4, target: 'point',
    blurb: `Digs a mine in. It is unseen, and blasts the first foe within ${TUNE.mine.trip} m for ${TUNE.mine.dmg}.`,
    can: (g, u) => minesOf(g, u).length < keepOf(g, u),
    effect(g, u, t) { const m = g.spawn('shaftmine', u.team, t.x, t.z); mem(m).owner = u.id; m.yaw = u.yaw; g.debris(TMP.set(t.x, .3, t.z), 4, .1, M.rock, 3); if (u === g.me) g.hud.damage(V3(t.x, 1, t.z), 'MINE SET', 'shield'); },
    // A bot Sapper lays its mines where it stands guard, toward the enemy, and in the road ahead of a push.
    ai(g, u) { if (u.target || minesOf(g, u).length >= keepOf(g, u) || u.moving) return null; const a = u.yaw + R(-.8, .8); return { x: u.pos.x + Math.sin(a) * 3, z: u.pos.z + Math.cos(a) * 3 }; },
  }, {
    key: 'satchel', name: 'Satchel', hotkey: 'T', energy: 0, cd: TUNE.satchel.cd, cast: 1, range: TUNE.satchel.range, target: 'body',
    blurb: `Sets a charge on a building: ${TUNE.satchel.dmg} damage after ${TUNE.satchel.fuse} s, three times the carbine.`,
    can: (g, u, t) => { const b = g.buildings.find(x => x.id === t.id); return !!b && isEnemy(u.team, b.team) && g.distToBox(b, u.pos.x, u.pos.z) < TUNE.satchel.range + .5; },
    effect(g, u, t, tgt) { if (!tgt || isUnit(tgt)) return; CHARGES.push({ b: tgt as Building, t: TUNE.satchel.fuse, from: u, x: u.pos.x + Math.sin(u.yaw) * 1.2, z: u.pos.z + Math.cos(u.yaw) * 1.2 }); g.warn(u.pos.x + Math.sin(u.yaw) * 1.2, u.pos.z + Math.cos(u.yaw) * 1.2, 2.5, TUNE.satchel.fuse); if (u === g.me) g.hud.damage(V3(tgt.pos.x, 2, tgt.pos.z), 'CHARGE SET', 'crit'); },
    ai(g, u) { const t = u.target; if (!t || isUnit(t) || !t.alive) return null; return g.distToBox(t as Building, u.pos.x, u.pos.z) < TUNE.satchel.range ? { x: t.pos.x, z: t.pos.z, id: t.id } : null; },
  }];
}
defineAbilities('sapper', sapperAbilities());
/** The satchel charges count down and go off (host). */
export function tickCharges(g: Game, dt: number) {
  for (let i = CHARGES.length - 1; i >= 0; i--) {
    const c = CHARGES[i]; c.t -= dt; if (c.t > 0) continue; CHARGES.splice(i, 1); if (!c.b.alive) continue;
    g.explode(V3(c.x, .4, c.z), c.from.team, 20, 3, c.from); g.damage(c.b, TUNE.satchel.dmg * (c.from.alive ? mulOf(g, c.from) : 1), c.from);
  }
}
function aiSapper(g: Game, u: Unit, dt: number) {
  const t = u.target;
  // A building as the target: walk right up to it so the satchel can go on (the ability's own hook sets it).
  if (t && !isUnit(t) && t.alive && !(u.abCd?.satchel > 0) && g.distToBox(t as Building, u.pos.x, u.pos.z) > TUNE.satchel.range - .5) { g.moveTo(u, t.pos.x, t.pos.z, dt, 1); if (u.think <= 0) u.think = .3; return; }
  aiGun(g, u, dt, SAPPER);
}
function aiMine(g: Game, u: Unit) {
  if (u.think > 0) return; u.think = .2;
  const foe = nearest(g, u, TUNE.mine.trip, o => !o.air && fac(o.team) !== undefined);
  if (!foe) return; const m = mem(u), owner = g.units.find(x => x.id === m.owner && x.alive) || null;
  g.explode(V3(u.pos.x, .4, u.pos.z), u.team, TUNE.mine.dmg * (owner ? mulOf(g, owner) : 1), TUNE.mine.r, owner || u); u.alive && g.damage(u, 1e4, null);
}

// ---------------------------------------------------------------- Dustbike
const flameOf = (g: Game, u: Unit) => up(g, u).hotspout ? TUNE.flame.hot : TUNE.flame.range;
/** One puff of the flame spout: everything in a cone in front burns. Soft bodies take more (the Dustbike's bonus, plus Hot Spout). */
function spout(g: Game, u: Unit, yaw = u.yaw, pitch = 0) {
  const r = flameOf(g, u), sx = Math.sin(yaw), sz = Math.cos(yaw), mul = mulOf(g, u), hot = up(g, u).hotspout; let n = 0;
  for (const o of [...g.units, ...g.buildings] as Tgt[]) {
    if (!o.alive || !isEnemy(u.team, o.team) || (isUnit(o) && (o.air || o.inside)) || !fair(g, u, o)) continue;
    const dx = o.pos.x - u.pos.x, dz = o.pos.z - u.pos.z, d = isUnit(o) ? Math.hypot(dx, dz) : g.distToBox(o as Building, u.pos.x, u.pos.z); if (d > r + (isUnit(o) ? UNIT[o.kind].rad : 0)) continue;
    const along = (dx * sx + dz * sz) / (Math.hypot(dx, dz) || 1); if (isUnit(o) && along < .75) continue; if (!isUnit(o) && along < .3) continue;
    g.damage(o, (TUNE.flame.dmg + (hot && hasTag(o, 'soft') ? TUNE.flame.hotDmg : 0)) * mul * (isUnit(o) ? 1 : .6), u); n++;
  }
  for (let i = 1; i <= 4; i++) { const k = i / 4 * r; g.puff(TMP.set(u.pos.x + sx * k, .9 + pitch * k, u.pos.z + sz * k), 1, .35 + k * .08, i < 3 ? M.fire : M.fireD, 1.4, .6, .5); }
  if (g.vol(u.pos) > .15) sfx.blast(g.vol(u.pos) * .3);
  return n;
}
defineAbilities('dustbike', [{
  key: 'kick', name: 'Kick Start', hotkey: 'T', energy: 0, cd: TUNE.kick.cd, cast: 0, range: 0, target: 'self',
  blurb: `${TUNE.kick.t} s of ${Math.round((TUNE.kick.pace - 1) * 100)}% more speed.`,
  effect(g, u) { boost(g, u, 'kick', TUNE.kick.t); g.puff(TMP.set(u.pos.x, .5, u.pos.z), 4, .6, M.dust, .6, 1); if (g.vol(u.pos) > .2) sfx.dash(1); },
  // A bot bike kicks to catch a soft body running away, or to get out when it is hurt.
  ai: (g, u) => (u.hp < u.maxHp * .35 && g.time - u.lastHit < 1) || (u.target && isUnit(u.target) && dist(u, u.target) > 9 && dist(u, u.target) < 22) ? { x: u.pos.x, z: u.pos.z } : null,
}]);
function aiDustbike(g: Game, u: Unit, dt: number) {
  // Raider: goes for soft bodies (workers first) over anything else in reach.
  if (u.think <= 0) { u.think = .3; const soft = nearest(g, u, 26, o => hasTag(o, 'soft') && fair(g, u, o)); u.target = soft || g.acquire(u, 26, u.order.type === 'guard' ? 0 : 26); if (u.target && !fair(g, u, u.target)) u.target = null; }
  const t = u.target, r = flameOf(g, u);
  if (t && t.alive) { const d = gap(g, u, t); if (d > r * .8) g.moveTo(u, t.pos.x, t.pos.z, dt, 1); else { g.aimAt(u, t, 1); if (u.cd <= 0) { u.cd = TUNE.flame.cd; u.swing = 1; spout(g, u); } } return; }
  walkOrder(g, u, dt);
}

// ---------------------------------------------------------------- Pile Driver
const PILE: Gun = { range: TUNE.pile.range, cd: TUNE.pile.cd, acc: .85, w: .12, hit: (_g, _u, t) => isUnit(t) ? TUNE.pile.dmg : TUNE.pile.dmg * .8, snd: v => { if (v > .05) sfx.cannon(); } };
const PILESET: Gun = { range: TUNE.pile.max, min: TUNE.pile.min, cd: TUNE.pile.setCd, acc: .95, w: .18, splash: TUNE.pile.splash, hit: (_g, _u, t) => isUnit(t) ? TUNE.pile.setDmg : TUNE.pile.setDmg * 1.2, snd: v => { if (v > .05) { sfx.cannon(); sfx.boom(v * .5); } } };
const anchorT = (g: Game, u: Unit) => up(g, u).quickanchor ? TUNE.pile.quick : TUNE.pile.anchor;
defineAbilities('piledriver', [{
  key: 'anchor', name: 'Anchor', hotkey: 'C', energy: 0, cd: 1, cast: 0, range: 0, target: 'self',
  blurb: `Drives the stakes in over ${TUNE.pile.anchor} s: then it shells ${TUNE.pile.min} to ${TUNE.pile.max} m with splash, and cannot move.`,
  effect(g, u) { morph(g, u, 'piledriverset', anchorT(g, u)); if (g.vol(u.pos) > .2) sfx.clang(); },
  ai(g, u) { const o = u.order; const near = nearest(g, u, TUNE.pile.min - 3, x => !x.air && fair(g, u, x)); if (near) return null; const far = nearest(g, u, TUNE.pile.max - 2, x => !x.air && fair(g, u, x)) || g.buildings.find(b => b.alive && isEnemy(u.team, b.team) && g.distToBox(b, u.pos.x, u.pos.z) < TUNE.pile.max - 2); return far && (o.type !== 'follow' || !g.me || dist(u, g.me) > 6) ? { x: u.pos.x, z: u.pos.z } : null; },
}]);
defineAbilities('piledriverset', [{
  key: 'lift', name: 'Lift Stakes', hotkey: 'C', energy: 0, cd: 1, cast: 0, range: 0, target: 'self',
  blurb: 'Pulls the stakes up so it can drive again.',
  effect(g, u) { morph(g, u, 'piledriver', anchorT(g, u)); if (g.vol(u.pos) > .2) sfx.clang(); },
  // Lift when a foe is inside the short limit, or nothing has been in reach for 5 s and the squad has moved on.
  ai(g, u) { const m = mem(u), any = nearest(g, u, TUNE.pile.max + 2, x => !x.air && fair(g, u, x)) || g.buildings.find(b => b.alive && isEnemy(u.team, b.team) && g.distToBox(b, u.pos.x, u.pos.z) < TUNE.pile.max); if (any) m.idleT = g.time; const close = nearest(g, u, TUNE.pile.min - 4, x => !x.air && fair(g, u, x)); return close && !any?.alive || close && g.units.filter(x => x.alive && x.team === u.team && dist(x, u) < 10).length < 2 || (!any && g.time - (m.idleT ?? g.time) > 5) ? { x: u.pos.x, z: u.pos.z } : null; },
}]);

// ---------------------------------------------------------------- Haul Drone and repairs
/** Riggers repair machines: a hurt friendly machine near a Rigger with nothing better to do gets welded back, for ore. */
function repairWork(g: Game, u: Unit, dt: number): boolean {
  if (u.site || u.carrying > 0 || u.state === 'flee' || u.vent) return false;
  const m = mem(u); let t: Unit | null = m.fix && m.fix.alive && m.fix.hp < m.fix.maxHp ? m.fix : null;
  if (!t && u.think <= 0) { let bd = 14; for (const o of g.units) { if (!o.alive || o.team !== u.team || o === u || o.air || !hasTag(o, 'machine') || o.hp >= o.maxHp * .8 || o.kind === 'shaftmine' || g.time - o.lastHit < 3) continue; const d = dist(o, u); if (d < bd) { bd = d; t = o; } } m.fix = t; }
  if (!t) return false;
  if (g.cash(u.team) < 1) { m.fix = null; return false; }
  if (dist(u, t) > UNIT[t.kind].rad + 1.6) { g.moveTo(u, t.pos.x, t.pos.z, dt, UNIT[t.kind].rad + 1.2); u.state = 'toSite'; return true; }
  u.state = 'repair'; u.yaw = Math.atan2(t.pos.x - u.pos.x, t.pos.z - u.pos.z);
  const heal = Math.min(t.maxHp - t.hp, t.maxHp * TUNE.repair * dt); t.hp += heal; g.purse[u.team] -= heal / 100 * TUNE.repairOre;
  if (u.think <= 0) { u.think = .25; g.debris(TMP.set(t.pos.x + R(-.4, .4), UNIT[t.kind].bodyY, t.pos.z + R(-.4, .4)), 1, .06, M.spark, 3); }
  if (t.hp >= t.maxHp) m.fix = null; return true;
}
defineUnits({
  rigger: { work: repairWork },
  hauldrone: { dig: 2, skipRespawn: true, threat: .5, task: () => 'Hauling ore (rented)' },
});
/** Haul Drones go home when their time is up, ore and all. */
export function tickDrones(g: Game) {
  for (const u of g.units) if (u.alive && u.kind === 'hauldrone') { const m = mem(u); m.born ??= g.time; if (g.time - m.born > TUNE.rig.droneT) { if (u.carrying > 0) { g.purse[u.team] += u.carrying; u.carrying = 0; } g.puff(TMP.set(u.pos.x, 1.5, u.pos.z), 4, .6, M.dust, 2, 1); u.alive = false; u.obj.visible = false; if (u === g.me) g.respawn(); } }
}

// ---------------------------------------------------------------- first person and registration
const W: Record<string, Weapon> = {
  sapper: { name: 'Carbine', mag: 18, cd: .16, reload: 1.5 }, dustbike: { name: 'Flame Spout', mag: 40, cd: TUNE.flame.cd * .7, reload: 2.2 },
  piledriver: { name: 'Pile Gun', mag: 6, cd: TUNE.pile.cd * .8, reload: 2.4 }, piledriverset: { name: 'Pile Shells', mag: 4, cd: TUNE.pile.setCd * .8, reload: 3 },
};
/** The anchored Pile Driver in first person: click lobs a shell where the crosshair meets the ground, between the short and long limits. */
function drivePileSet(g: Game, dt: number, P: Set<string>, eye: THREE.Vector3, dir: THREE.Vector3, look: import('../../core/registry').Hit | null, w: Weapon | null) {
  abilityKeys(g, P, eye, dir, look); const me = g.me!; if (!w) return;
  if (g.reloadT > 0) { g.reloadT -= dt; if (g.reloadT <= 0) g.ammo = w.mag; return; }
  if ((P.has('KeyR') && g.ammo < w.mag) || (g.ammo <= 0 && g.lmb)) { g.reloadT = w.reload; sfx.reload(w.reload); return; }
  if (!g.lmb || g.fireCd > 0 || g.ammo <= 0) return;
  const t = aimTarget(g, eye, dir, look, 20), d = Math.hypot(t.x - me.pos.x, t.z - me.pos.z);
  if (d < TUNE.pile.min || d > TUNE.pile.max) { if (P.has('Mouse0')) { sfx.deny(); g.hud.damage(V3(me.pos.x + dir.x * 3, eye.y, me.pos.z + dir.z * 3), d < TUNE.pile.min ? 'TOO CLOSE' : 'TOO FAR', 'kobad'); } return; }
  g.fireCd = w.cd; g.ammo--; g.recoil = 1; g.shake = 1; g.kick += .03; sfx.cannon(); sfx.boom(.4);
  const end = V3(t.x, .3, t.z); g.tracer(V3(me.pos.x + dir.x, eye.y - .2, me.pos.z + dir.z), end, tracerMat, .18); g.warn(t.x, t.z, TUNE.pile.splash, .3);
  const tgt = t.id ? (g.units.find(x => x.id === t.id) || g.buildings.find(x => x.id === t.id)) : null, mul = mulOf(g, me);
  if (tgt && isEnemy(me.team, tgt.team)) g.damage(tgt, PILESET.hit(g, me, tgt) * mul, me);
  g.burst(end, TUNE.pile.setDmg * .5 * mul, TUNE.pile.splash, me, tgt || null); g.scorchAt(end, 2);
}
defineUnits({
  sapper: { gun: W.sapper, ai: aiSapper, drive: (g, dt, P, e, d, l, w) => driveGun(g, dt, P, e, d, l, w, SAPPER, { spread: .016 }), task: (g, u) => `Mines laid: ${minesOf(g, u).length}` },
  shaftmine: { ai: (g, u) => aiMine(g, u), skipRespawn: true, threat: .2, koWord: 'POP', drive: () => {} },
  dustbike: {
    gun: W.dustbike, ai: aiDustbike, threat: 1.1, step: 0, hop: 22, shove: 10,
    drive(g, dt, P, eye, dir, look, w) {
      abilityKeys(g, P, eye, dir, look); if (!w) return; const me = g.me!;
      if (g.reloadT > 0) { g.reloadT -= dt; if (g.reloadT <= 0) g.ammo = w.mag; return; }
      if ((P.has('KeyR') && g.ammo < w.mag) || (g.ammo <= 0 && g.lmb)) { g.reloadT = w.reload; sfx.reload(w.reload); return; }
      if (g.lmb && g.fireCd <= 0 && g.ammo > 0) { g.fireCd = w.cd; g.ammo--; g.shake = Math.min(1, g.shake + .08); if (spout(g, me, g.yaw, g.pitch)) { g.hud.hitmark(false); } }
    },
  },
  piledriver: { gun: W.piledriver, ai: (g, u, dt) => { aiGun(g, u, dt, PILE); }, heavy: true, steady: true, step: 2, hop: 9, threat: 1.3, drive: (g, dt, P, e, d, l, w) => driveGun(g, dt, P, e, d, l, w, PILE, { kick: .02, shake: .4, tracer: .14 }) },
  piledriverset: { gun: W.piledriverset, ai: (g, u, dt) => { aiGun(g, u, dt, PILESET, TUNE.pile.max + 4, TUNE.pile.max); }, heavy: true, steady: true, step: 2, hop: 0, threat: 1.6, skipRespawn: true, drive: drivePileSet },
});
