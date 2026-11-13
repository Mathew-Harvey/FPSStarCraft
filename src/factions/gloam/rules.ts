// How the Gloam play: their bots, their first-person bodies, Buds, Bloom and the Stinger Stalk.
// Kept out of game.ts so the shared simulation only carries thin hooks.
import * as THREE from 'three';
import { V3, R, M } from '../../gfx';
import { sfx } from '../../audio';
import type { Game } from '../../game';
import { UNIT, BLD, Unit, Building, isUnit, isWorker } from '../../data';
import { G_TUNE, GBKind } from './numbers';
import { defineUnits, defineBuildings, defineFaction } from '../../core/registry';
import { defineAbilities } from '../../core/ability';

const TMP = V3();
export const quillMat = new THREE.MeshBasicMaterial({ color: 0xe9dab2 });
export const spitMat = new THREE.MeshBasicMaterial({ color: 0xc8ff3c, depthWrite: false });

/** What a Gloam bite is worth: the shift on a bot side, and the mandible research. */
export const gMul = (g: Game, team: number) => g.foeK(team) * g.gunMul(team);
const reachOf = (t: Unit | Building, u: Unit) => isUnit(t) ? Math.hypot(t.pos.x - u.pos.x, t.pos.z - u.pos.z) : 0;

// ---------------------------------------------------------------- every frame, for both the host and a replica
/** Bloom spreads and withers, and each Mother Cap shows its ripe Buds. */
export function gloamFx(g: Game, dt: number) {
  g.carpet.update(dt);
  for (const b of g.buildings) {
    if (!b.alive || b.kind !== 'mothercap') continue;
    let parts: THREE.Object3D[] = b.obj.userData.buds; if (!parts) { parts = []; for (let i = 0; i < 4; i++) { const o = b.obj.getObjectByName('bud' + i); if (o) parts.push(o); } b.obj.userData.buds = parts; }
    const ripe = b.built ? b.buds || 0 : 0, growing = b.queue.length;
    parts.forEach((o, i) => { const want = i < ripe ? 1 : i < ripe + growing ? .55 + .15 * Math.sin(g.time * 5 + i) : i < (g.upOf(b.team).gfat ? 4 : 3) && b.built ? .25 + .25 * Math.min(1, (b.budT || 0) / G_TUNE.budEvery) : 0; const s = o.scale.x + (want - o.scale.x) * Math.min(1, dt * 6); o.scale.setScalar(Math.max(.001, s)); o.visible = s > .02; });
  }
}

// ---------------------------------------------------------------- buildings (host only)
export function gloamBuilding(g: Game, b: Building, dt: number) {
  if (!b.built) { b.progress += dt / BLD[b.kind].time; return; }   // a rooted Grazer grows the building by itself
  // Buildings on their own Bloom knit back together once nobody is hitting them.
  if (b.hp < b.maxHp && g.time - b.lastHit > 6) b.hp = Math.min(b.maxHp, b.hp + b.maxHp * .008 * dt);
  if (b.kind === 'mothercap') {
    const max = g.upOf(b.team).gfat ? G_TUNE.fatBuds : G_TUNE.buds; if (b.buds === undefined) b.buds = max;
    if (b.buds + b.queue.length < max) { b.budT = (b.budT || 0) + dt * (g.upOf(b.team).gfat ? G_TUNE.fatK : 1); if (b.budT >= G_TUNE.budEvery) { b.budT = 0; b.buds++; } } else b.budT = 0;
    // Its gill fronds lash anything that comes close, like the other HQs' night watch.
    b.cd -= dt; if (b.cd <= 0) { b.cd = 1; const t = nearestFoe(g, b, 18); if (t) { lash(g, b, t, 9 * gMul(g, b.team), b.h * .7); } else b.cd = .3; }
  } else if (b.kind === 'stinger') {
    b.cd -= dt; if (b.cd <= 0) { b.cd = G_TUNE.stinger.cd; const t = nearestFoe(g, b, G_TUNE.stinger.range + 16); if (t) { lash(g, b, t, G_TUNE.stinger.dmg * gMul(g, b.team), 7.4); const tip = b.obj.getObjectByName('tip'); if (tip) tip.rotation.x = -1; } else b.cd = .3; }
  }
}
function nearestFoe(g: Game, b: Building, r: number) { let best: Unit | null = null, bd = r; for (const o of g.units) { if (!o.alive || o.team === b.team) continue; const d = o.pos.distanceTo(b.pos); if (d < bd) { bd = d; best = o; } } return best; }
function lash(g: Game, b: Building, t: Unit, dmg: number, y: number) {
  const a = V3(b.pos.x, y, b.pos.z), e = V3(t.pos.x, UNIT[t.kind].bodyY, t.pos.z); g.tracer(a, e, spitMat, .14); g.puff(e, 2, .5, M.gS, .6); sfx.slash(g.vol(b.pos) * .7); g.damage(t, dmg, b);
}

// ---------------------------------------------------------------- the bots
export function aiGloam(g: Game, u: Unit, dt: number) {
  // A swarm scatters from a grenade in the air: small legs, quick reflexes. Without it a Linesman's grenade every 15 s took a whole pack of
  // Snappers with it, and the bot Gloam lost 29 matches in 30 once Linesmen started throwing at them.
  if (u.kind !== 'mulcher' && dodge(g, u, dt)) return;
  if (u.kind === 'quillback') return aiQuill(g, u, dt);
  if (u.kind === 'blister') return aiBlister(g, u, dt);
  if (u.kind === 'mulcher') return aiMulcher(g, u, dt);
  return aiSnapper(g, u, dt);
}
function dodge(g: Game, u: Unit, dt: number) {
  for (const p of g.projs) { if (!p.nade || p.team === u.team) continue; const dx = u.pos.x - p.pos.x, dz = u.pos.z - p.pos.z, d = Math.hypot(dx, dz); if (d > 7.5) continue;
    const l = d || 1; g.moveTo(u, u.pos.x + dx / l * 6, u.pos.z + dz / l * 6, dt, .2, 2.2); return true; }
  return false;
}
const raiding = (u: Unit) => u.order.type === 'raid' || u.order.type === 'amove';
const pickTarget = (g: Game, u: Unit, r: number, br: number) => { const cur = u.target; if (!cur || !cur.alive || !isUnit(cur)) u.target = g.acquire(u, r, raiding(u) && !(u.order.path && u.order.path.length) ? br : 0); };
/** Snappers: quick, cheap, in pairs. They close in a zigzag, pounce the last few metres and chew. */
function aiSnapper(g: Game, u: Unit, dt: number) {
  if (g.leash(u, dt)) return;
  u.dashCd -= dt; u.dashT -= dt;
  if (u.think <= 0) { u.think = .3; pickTarget(g, u, raiding(u) ? 22 : 28, 14); }
  const t = u.target;
  if (t && t.alive) {
    const isB = !isUnit(t), d = isB ? g.distToBox(t as Building, u.pos.x, u.pos.z) : reachOf(t, u);
    if (!isB && d > 45) { u.target = null; return; }
    if (d > (isB ? 1.1 : 1.3 + UNIT[(t as Unit).kind].rad * .5)) {
      if (!isB && d > 4 && d < 10 && u.dashCd <= 0) { u.dashT = .35; u.dashCd = G_TUNE.pounce.cd; g.puff(TMP.copy(u.pos).setY(.4), 3, .6, M.gS, .4); sfx.dash(g.vol(u.pos) * .7); }
      let wx = 0, wz = 0; if (!isB && d > 6 && u.dashT <= 0) { const k = Math.sin(g.time * 4.3 + u.id * 2.1) * Math.min(3.5, d * .3), nx = -(t.pos.z - u.pos.z) / d, nz = (t.pos.x - u.pos.x) / d; wx = nx * k; wz = nz * k; }
      g.moveTo(u, t.pos.x + wx, t.pos.z + wz, dt, .4, u.dashT > 0 ? 2.6 : 1);
    } else { u.yaw = Math.atan2(t.pos.x - u.pos.x, t.pos.z - u.pos.z); if (u.cd <= 0) { u.cd = G_TUNE.biteCd.snapper; u.swing = 1; sfx.slash(g.vol(u.pos) * .6); g.damage(t, (isB ? G_TUNE.bite.gnaw : G_TUNE.bite.snapper) * gMul(g, u.team), u); } }
    return;
  }
  g.vIdle(u, dt, raiding(u) ? 3 : 1.5, u.order.type !== 'guard' ? 1 : .6);
}
/** Quillbacks: spit quills from range and back off from anything that gets close. */
function aiQuill(g: Game, u: Unit, dt: number) {
  if (g.leash(u, dt)) return;
  const reach = g.upOf(u.team).gquill ? 30 : 25;
  if (u.think <= 0) { u.think = .35; u.target = g.acquire(u, reach + 8, raiding(u) && !(u.order.path && u.order.path.length) ? reach : 0); }
  const t = u.target;
  if (t && t.alive) {
    const isB = !isUnit(t), d = isB ? g.distToBox(t as Building, u.pos.x, u.pos.z) : reachOf(t, u); g.aimAt(u, t, 1.6);
    if (d > reach) g.moveTo(u, t.pos.x, t.pos.z, dt);
    else if (!isB && d < 8) { const ax = u.pos.x - t.pos.x, az = u.pos.z - t.pos.z, l = Math.hypot(ax, az) || 1; g.moveTo(u, u.pos.x + ax / l * 4, u.pos.z + az / l * 4, dt, .2, .95); u.yaw = Math.atan2(-ax, -az); }
    if (d <= reach && u.cd <= 0) {
      u.cd = 1.05 + R(0, .2); u.swing = 1; u.flashT = .08;
      const from = V3(u.pos.x + Math.sin(u.yaw) * 1.2, 1.7, u.pos.z + Math.cos(u.yaw) * 1.2), ty = isUnit(t) ? UNIT[t.kind].bodyY : Math.min(t.h * .5, 3), v = V3(t.pos.x - from.x, ty - from.y, t.pos.z - from.z).normalize().multiplyScalar(36);
      g.shoot(from, v, u.team, G_TUNE.quill.dmg * gMul(g, u.team) * (g.upOf(u.team).gquill ? 1.15 : 1), false, u); sfx.throw();
    }
    return;
  }
  u.pitch *= .9; g.vIdle(u, dt, raiding(u) ? 6 : 1.5, u.order.type !== 'guard' ? 1 : .6);
}
/** Blisters: run at the thickest knot of enemies, or the nearest wall, and burst. */
function aiBlister(g: Game, u: Unit, dt: number) {
  if (g.leash(u, dt)) return;
  if (u.think <= 0) { u.think = .25; const cur = u.target; if (!cur || !cur.alive) u.target = g.acquire(u, raiding(u) ? 24 : 26, raiding(u) && !(u.order.path && u.order.path.length) ? 18 : 0); }
  const t = u.target;
  if (t && t.alive) {
    const isB = !isUnit(t), d = isB ? g.distToBox(t as Building, u.pos.x, u.pos.z) : reachOf(t, u);
    if (!isB && d > 45) { u.target = null; return; }
    if (d > (isB ? 1.2 : 1.6 + UNIT[(t as Unit).kind].rad * .5)) g.moveTo(u, t.pos.x, t.pos.z, dt, .3, d < 8 ? 1.3 : 1);
    else burst(g, u);
    return;
  }
  g.vIdle(u, dt, raiding(u) ? 3 : 1.5, u.order.type !== 'guard' ? 1 : .6);
}
/** A Blister pops: acid on everything around it, and the Blister with it. */
export function burst(g: Game, u: Unit) {
  if (!u.alive) return; const c = V3(u.pos.x, .4, u.pos.z), dmg = G_TUNE.bite.blister * gMul(g, u.team) * (g.upOf(u.team).gsap ? 1.4 : 1);
  u.alive = false; g.explode(c, u.team, dmg, G_TUNE.blister.r, u, 2); u.alive = true; g.killUnit(u, null);
}
/** Mulchers: slow, huge. A wind-up sweep of the tusks, and now and then a charge that bowls a line over. */
function aiMulcher(g: Game, u: Unit, dt: number) {
  if (u.dashT > 0) { charge(g, u, dt); return; }
  if (u.wind > 0) { u.wind -= dt; if (u.wind <= 0) { u.cd = 1.5; u.swing = 1; sweep(g, u, G_TUNE.bite.mulcher * gMul(g, u.team)); } return; }
  u.dashCd -= dt;
  if (u.think <= 0) { u.think = .4; const cur = u.target; if (!cur || !cur.alive || !isUnit(cur) || cur.pos.distanceTo(u.pos) > 30) u.target = g.acquire(u, raiding(u) ? 20 : 26, raiding(u) && !(u.order.path && u.order.path.length) ? 18 : 0); }
  const t = u.target;
  if (t && t.alive) {
    const isB = !isUnit(t), d = isB ? g.distToBox(t as Building, u.pos.x, u.pos.z) : reachOf(t, u);
    if (!isB && d > 50) { u.target = null; return; }
    if (!isB && d > 7 && d < 18 && u.dashCd <= 0) { u.dashCd = G_TUNE.charge.cd * (g.upOf(u.team).gcharge ? .5 : 1); u.dashT = G_TUNE.charge.t; u.yaw = Math.atan2(t.pos.x - u.pos.x, t.pos.z - u.pos.z); u.windX = Math.sin(u.yaw); u.windZ = Math.cos(u.yaw); (u as any).hitSet = new Set<number>(); g.warn(u.pos.x + u.windX * 7, u.pos.z + u.windZ * 7, 2.5, .5); sfx.charge(g.vol(u.pos)); return; }
    if (d > (isB ? 2.4 : 3 + UNIT[(t as Unit).kind].rad * .5)) g.moveTo(u, t.pos.x, t.pos.z, dt, 1);
    else { u.yaw = Math.atan2(t.pos.x - u.pos.x, t.pos.z - u.pos.z); if (u.cd <= 0) { u.wind = .55; sfx.charge(g.vol(u.pos) * .6); } }
    return;
  }
  g.vIdle(u, dt, raiding(u) ? 4 : 2, u.order.type !== 'guard' ? 1 : .6);
}
/** The tusk sweep: everything in a wide arc in front. */
export function sweep(g: Game, u: Unit, dmg: number, by: Unit | null = u) {
  const fx = Math.sin(u.yaw), fz = Math.cos(u.yaw); let n = 0;
  for (const o of g.units) { if (!o.alive || o.team === u.team) continue; const dx = o.pos.x - u.pos.x, dz = o.pos.z - u.pos.z, d = Math.hypot(dx, dz); if (d > 4.2 + UNIT[o.kind].rad || (dx * fx + dz * fz) / (d || 1) < -.1) continue; g.damage(o, dmg, by); if (!g.net && d > .1) { o.kx += dx / d * 8; o.kz += dz / d * 8; } n++; }
  for (const b of g.buildings) { if (!b.alive || b.team === u.team || g.distToBox(b, u.pos.x + fx * 2, u.pos.z + fz * 2) > 2.6) continue; g.damage(b, dmg * .8, by); n++; }
  g.puff(TMP.set(u.pos.x + fx * 2.6, .5, u.pos.z + fz * 2.6), 4, 1.2, M.dust, .6, 1.4); sfx.clang(); if (g.vol(u.pos) > .3) g.shake = Math.max(g.shake, g.vol(u.pos) * .3);
  return n;
}
/** A Mulcher's charge, a step at a time: anything in the way takes the hit once and gets thrown aside. */
export function charge(g: Game, u: Unit, dt: number, by: Unit | null = u) {
  u.dashT -= dt; const v = G_TUNE.charge.v * dt; u.pos.x += u.windX * v; u.pos.z += u.windZ * v; u.moving = true; g.collide(u, u.pos.x, u.pos.z);
  const hit: Set<number> = (u as any).hitSet || ((u as any).hitSet = new Set<number>());
  for (const o of g.units) { if (!o.alive || o.team === u.team || hit.has(o.id)) continue; const dx = o.pos.x - u.pos.x, dz = o.pos.z - u.pos.z, d = Math.hypot(dx, dz); if (d > 2.4 + UNIT[o.kind].rad) continue; hit.add(o.id); g.damage(o, G_TUNE.charge.dmg * gMul(g, u.team), by); if (!g.net) { const s = d > .1 ? 1 / d : 0; o.kx += (dx * s + u.windX) * 9; o.kz += (dz * s + u.windZ) * 9; } sfx.clang(); }
  for (const b of g.buildings) { if (!b.alive || b.team === u.team || hit.has(b.id) || g.distToBox(b, u.pos.x, u.pos.z) > 1.8) continue; hit.add(b.id); g.damage(b, G_TUNE.charge.dmg * gMul(g, u.team), by); u.dashT = 0; g.shake = Math.max(g.shake, g.vol(u.pos) * .6); sfx.boom(g.vol(u.pos) * .6); }
  if (u.dashT <= 0) { u.dashT = 0; (u as any).hitSet = null; }
  if (Math.random() < .5) g.puff(TMP.set(u.pos.x, .2, u.pos.z), 1, .8, M.dust, .4, 1);
}

// ---------------------------------------------------------------- the player in a Gloam fighter
export function playerGloam(g: Game, dt: number, P: Set<string>, eye: THREE.Vector3, dir: THREE.Vector3) {
  const me = g.me!, vm = g.vm['g_' + me.kind], flash = vm?.userData.flash; if (flash) flash.visible = false;
  g.vCd = Math.max(0, g.vCd - dt); g.jaw = Math.max(0, g.jaw - dt * 5);
  const bite = (reach: number, dmg: number, bdmg: number, cone = .4) => {
    let any = false;
    for (const u of g.units) { if (!u.alive || u.team === me.team) continue; const dx = u.pos.x - me.pos.x, dz = u.pos.z - me.pos.z, d = Math.hypot(dx, dz); if (d > reach + UNIT[u.kind].rad || (dx * dir.x + dz * dir.z) / (d || 1) < cone) continue; g.damage(u, dmg, me); any = true; }
    for (const b of g.buildings) { if (!b.alive || b.team === me.team || g.distToBox(b, me.pos.x, me.pos.z) > reach - .3) continue; const dx = b.pos.x - me.pos.x, dz = b.pos.z - me.pos.z; if (dx * dir.x + dz * dir.z < 0) continue; g.damage(b, bdmg, me); any = true; }
    if (any) { g.hud.hitmark(false); sfx.hit(); }
    return any;
  };
  if (me.kind === 'snapper') {
    // Right click: the pounce. A long leap forward that lands with a bite.
    if (g.vWind > 0) { g.vWind -= dt; if (g.vWind <= 0) { g.jaw = 1; sfx.slash(1); if (bite(3, 20 * gMul(g, me.team), 10)) g.hud.damage(V3(me.pos.x, 1.6, me.pos.z), 'POUNCE!', 'ko'); } return; }
    if (P.has('Mouse2')) { if (g.vCd > 0) sfx.deny(); else { g.vCd = G_TUNE.pounce.cd; g.vWind = .3; g.hopX = dir.x / (Math.hypot(dir.x, dir.z) || 1); g.hopZ = dir.z / (Math.hypot(dir.x, dir.z) || 1); g.hopT = .3; sfx.dash(1); g.puff(TMP.set(me.pos.x, .2, me.pos.z), 3, .5, M.gS, .3, 1); } return; }
    if (g.lmb && g.fireCd <= 0) { g.fireCd = .36; g.jaw = 1; me.swing = 1; sfx.slash(.8); bite(2.8, 12 * gMul(g, me.team), 8); }
    return;
  }
  if (me.kind === 'quillback') {
    const spit = (spread: number, dmg: number) => {
      const d = V3(dir.x + R(-spread, spread), dir.y + R(-spread, spread) * .5, dir.z + R(-spread, spread)).normalize(), hit = g.ray(eye, d, 70, -1, me), dist = hit ? hit.dist : 70, end = V3().copy(eye).addScaledVector(d, dist), mz = V3();
      if (flash) { flash.visible = true; flash.getWorldPosition(mz); } else mz.copy(eye); g.tracer(mz, end, quillMat, .05);
      const tgt = hit && (hit.unit && hit.unit.team !== me.team ? hit.unit : hit.b && hit.b.team !== me.team ? hit.b : null);
      if (tgt) { g.damage(tgt, hit!.head ? dmg * 1.8 : dmg, me, !!hit!.head); g.hud.hitmark(!!hit!.head); sfx.hit(); g.puff(end, 2, .4, M.gS, .5); } else g.impact(eye, d, hit, end, 8);
    };
    // Right click: a fan of quills. Five at once, wide.
    if (P.has('Mouse2')) { if (g.vCd > 0) sfx.deny(); else { g.vCd = G_TUNE.quill.fanCd; g.recoil = 1; g.kick += .03; for (let i = 0; i < G_TUNE.quill.fan; i++) spit(.09, 10 * gMul(g, me.team)); sfx.throw(); sfx.scatter(); } return; }
    if (g.lmb && g.fireCd <= 0) { g.fireCd = G_TUNE.quill.cd; g.recoil = 1; g.kick += .012; me.swing = 1; spit(.006, 14 * gMul(g, me.team) * (g.upOf(me.team).gquill ? 1.15 : 1)); sfx.throw(); }
    return;
  }
  if (me.kind === 'blister') {
    if ((g.lmb || P.has('Mouse2')) && g.fireCd <= 0) { g.fireCd = 9; g.shake = 1; if (g.net) g.net.cmd('gb'); else burst(g, me); }
    return;
  }
  if (me.kind === 'mulcher') {
    if (g.chargeT > 0) { g.chargeT -= dt; if (g.net) { me.windX = Math.sin(g.yaw); me.windZ = Math.cos(g.yaw); } me.dashT = Math.max(me.dashT, .01); charge(g, me, dt, me); g.shake = Math.max(g.shake, .25); if (me.dashT <= 0) g.chargeT = 0; return; }
    if (g.vWind > 0) { g.vWind -= dt; if (g.vWind > 0) return; g.fireCd = 1.1; g.jaw = 1; g.recoil = 1; g.shake = Math.max(g.shake, .5); const n = sweep(g, me, 34 * gMul(g, me.team), me); if (n) { g.hud.hitmark(n > 1); g.hud.damage(V3(me.pos.x + dir.x * 2.5, 2.4, me.pos.z + dir.z * 2.5), n > 1 ? 'MULCH x' + n : 'MULCH!', 'ko'); } return; }
    if (P.has('Mouse2')) { if (g.vCd > 0) sfx.deny(); else { g.vCd = G_TUNE.charge.cd * (g.upOf(me.team).gcharge ? .5 : 1); g.chargeT = G_TUNE.charge.t; me.dashT = G_TUNE.charge.t; me.windX = Math.sin(g.yaw); me.windZ = Math.cos(g.yaw); (me as any).hitSet = new Set<number>(); sfx.charge(1); sfx.dash(1); } return; }
    if (g.lmb && g.fireCd <= 0) { g.vWind = .35; sfx.charge(.6); }
  }
}

// ---------------------------------------------------------------- rooting a building
/** The Grazer that gives itself to a new building: the nearest free one, or the body the player is in if there is no other. */
export function rootGrazer(g: Game, x: number, z: number, by: Unit | null, team: number): Unit | null {
  let best: Unit | null = null, bd = 1e9;
  for (const u of g.units) { if (!u.alive || u.team !== team || u.kind !== 'grazer' || u.pilot || u === g.me || u.site) continue; const d = Math.hypot(u.pos.x - x, u.pos.z - z) + (u.carrying ? 20 : 0); if (d < bd) { bd = d; best = u; } }
  if (!best && by && by.alive && by.kind === 'grazer') best = by;
  return best;
}
/** Takes a Grazer out of the world into a new building, with a puff of spores where it stood. */
export function consume(g: Game, u: Unit) {
  if (u.carrying > 0) { g.purse[u.team] += u.carrying; u.carrying = 0; }
  g.puff(TMP.set(u.pos.x, .6, u.pos.z), 5, .8, M.gS, 1, 1);
  u.alive = false; g.scene.remove(u.obj);
  if (u === g.me) { g.staticT = 1.2; g.feed('Overgrowth', 'You sink into the ground and become the root. Finding you another body.', 'in'); }
}
/** A spare Grazer to root with, for the build menu: anyone but the body the player drives counts. */
export function spareGrazers(g: Game, team = g.myTeam) { return g.units.filter(u => u.alive && u.team === team && u.kind === 'grazer' && !u.pilot && u !== g.me).length; }
/** Where a Gloam building can grow: on its own Bloom, with the whole footprint covered. Mother Caps can seed bare ground. */
export function onBloom(g: Game, k: GBKind, x: number, z: number, team: number) { return k === 'mothercap' || g.carpet.on(x, z, Math.max(BLD[k].hx, BLD[k].hz) * .6, team); }
export { isWorker };

defineFaction(2, { ai: aiGloam, drive: (g, dt, P, eye, dir) => playerGloam(g, dt, P, eye, dir), each: gloamBuilding, grows: true });
defineBuildings({
  // A Mother Cap ripens every Bud at once; everything else trains one at a time.
  mothercap: { hatch(g, b, dt) { for (let i = b.queue.length - 1; i >= 0; i--) { const q = b.queue[i]; q.t -= dt; if (q.t > 0) continue; b.queue.splice(i, 1); const a = R(0, 6.283), u = g.spawn(q.kind, b.team, b.pos.x + Math.cos(a) * (b.hx + 1.2), b.pos.z + Math.sin(a) * (b.hz + 1.2)); g.puff(TMP.copy(u.pos).setY(1), 4, .8, M.gS); if (g.vol(b.pos) > .2) sfx.blip(); g.dir.trained(u); } }, done(_g, b) { b.buds = 1; } },
});
defineUnits({ snapper: { pair: true }, mulcher: { skipRespawn: true, stride: 6 }, grazer: { task: () => 'Chewing ore' } });
defineBuildings({
  mothercap: { buds: true, added(_g, b, built) { b.buds = built ? G_TUNE.buds : 0; b.budT = 0; }, note: b => `${b.buds || 0} Bud${b.buds === 1 ? '' : 's'} ripe${b.queue.length ? ` · ${b.queue.length} ripening` : ''}` },
});
defineFaction(2, {
  tab: ['snapper', 'quillback', 'blister', 'mulcher', 'grazer'], stride: 15,
  added(g, b, built) { g.carpet.add(b, b.kind as GBKind, b.pos.x, b.pos.z, built); },
  pace(g, u) { const up = g.upOf(u.team); return (u.kind !== 'grazer' && g.carpet.on(u.pos.x, u.pos.z, 0, u.team) ? G_TUNE.bloomSpeed : 1) * (up.glegs && (u.kind === 'snapper' || u.kind === 'blister') ? 1.15 : 1); },
  task: (_g, u) => u.order.type === 'raid' || u.order.type === 'amove' ? 'Swarming the yard' : u.order.type === 'follow' ? 'At your heels' : 'Lurking in the Bloom',
});

// The Blister bursts, and itself with it. Online the server casts it when the player's browser asks.
defineAbilities('blister', [{ key: 'burst', name: 'Burst', hotkey: 'Mouse0', energy: 0, cd: 9, cast: 0, range: 0, target: 'self', blurb: 'Bursts, hurting everything close by. The Blister dies.', effect: (g, u) => burst(g, u) }]);
