// What Ironhold bodies and buildings do: the gunners' first-person controls, the Gantry's cannon and stomp, the Patch's rivets, and the
// soldier brain the bots use for every Ironhold fighter. Shared code reaches these through the registry (src/core/registry.ts).
import * as THREE from 'three';
import { V3, R, M, ringMat, tracerMat } from '../../gfx';
import { sfx } from '../../audio';
import { sees } from '../../terrain';
import type { Game } from '../../game';
import { TMP } from '../../game';
import { UNIT, Unit, Building, isUnit, foeOf, fac } from '../../data';
import { catOf } from '../../core/combat';
import { isEnemy } from '../../core/sides';
import { I_TUNE as TUNE } from './numbers';
import { syncStoryTree } from './story-tree';   // STORY STAND-IN: see story-tree.ts
import { defineUnits, defineBuildings, defineFaction, factionRule, DEFAULTS, type Weapon, type Shot } from '../../core/registry';
import { defineAbilities } from '../../core/ability';
import { mulOf, tagBonus, boosted, abilityKeys } from './kit';
import { fireRate, hobble, wrapHurt, tickCharges, tickDrones } from './ground';
import { tickCasts, tickAir } from './air';
import './bases';
import './stand-in';
import './arms';

export const GUNS: Record<string, Weapon> = { linesman: { name: 'Rifle', mag: 24, cd: .12, reload: 1.5 }, breacher: { name: 'Scattergun', mag: 6, cd: .78, reload: 2.1 }, gantry: { name: 'Autocannon', mag: 12, cd: .36, reload: 2.4 }, longshot: { name: 'Long Rifle', mag: 5, cd: 1.15, reload: 2.4 }, patch: { name: 'Rivet Pistol', mag: 14, cd: .2, reload: 1.3 } };
/** Tuning for the aimed, single-bullet guns. */
export const SHOT: Record<string, Shot> = {
  linesman: { vm: 'rifle', body: 7, head: 15, bld: 4, sp: .011, adsK: .75, zoom: 24, sens: .45, kick: .007 },
  longshot: { vm: 'long', body: 58, head: 150, bld: 14, sp: .05, adsK: .995, zoom: 50, sens: .78, kick: .03 },
  patch: { vm: 'pistol', body: 6, head: 12, bld: 3, sp: .014, adsK: .6, zoom: 10, sens: .25, kick: .006 },
};

export function updateGun(g: Game, dt: number, P: Set<string>, eye: THREE.Vector3, dir: THREE.Vector3, gun: Weapon) {
  const me = g.me!, heavy = me.kind === 'breacher', S = SHOT[me.kind] || SHOT.linesman, vm = heavy ? g.vm.scatter : g.vm[S.vm], flash = vm.userData.flash; flash.visible = false;
  // grenade (Linesman) and shield bash (Breacher)
  if (me.kind === 'patch' && P.has('KeyC')) { if (g.nadeCd <= 0) { g.nadeCd = g.upOf(me.team).stitch ? 7 : 12; patchUp(g, me); g.net?.cmd('pt'); } else sfx.deny(); }
  if (me.kind === 'linesman' && P.has('KeyC')) { if (g.nadeCd <= 0) { g.nadeCd = g.upOf(me.team).frag ? 5 : 9; const v = V3().copy(dir).multiplyScalar(19); v.y += 4.5; g.shoot(V3().copy(eye).addScaledVector(dir, .7), v, me.team, 75, true, me); sfx.throw(); } else sfx.deny(); }
  if (heavy && g.brace && P.has('Mouse0') && g.bashCd <= 0) {
    g.bashCd = .9; g.bashT = .25; sfx.clang(); g.shake = Math.max(g.shake, .4); let any = false;
    for (const u of g.units) { if (!u.alive || u.team !== foeOf(me.team)) continue; const dx = u.pos.x - me.pos.x, dz = u.pos.z - me.pos.z, d = Math.hypot(dx, dz); if (d > 3.4 + UNIT[u.kind].rad || (dx * dir.x + dz * dir.z) / (d || 1) < .5) continue; g.damage(u, 24, me); const k = u.kind === 'warden' ? 2 : 12; u.kx += dx / (d || 1) * k; u.kz += dz / (d || 1) * k; any = true; }
    if (any) { g.hud.hitmark(false); sfx.hit(); g.hud.damage(V3().copy(eye).addScaledVector(dir, 2), 'WHAM!', 'ko'); }
  }
  if (g.reloadT > 0) { g.reloadT -= dt; if (g.reloadT <= 0) g.ammo = gun.mag; return; }
  if ((P.has('KeyR') && g.ammo < gun.mag) || (g.ammo <= 0 && g.lmb)) { if (g.ammo <= 0) sfx.dry(); g.reloadT = gun.reload; sfx.reload(gun.reload); return; }
  if (g.lmb && g.fireCd <= 0 && g.ammo > 0 && !g.brace) {
    g.fireCd = gun.cd / fireRate(g, me); g.ammo--; flash.visible = true; flash.rotation.z = R(0, 3); const mul = mulOf(g, me);
    const muzzle = V3(); flash.getWorldPosition(muzzle);
    if (heavy) {
      g.recoil = 1; g.pitch = Math.min(1.45, g.pitch + .03); g.kick += .024; g.shake = Math.min(1, g.shake + .35); sfx.scatter(); const pay = g.payback; g.payback = 0; g.bloom = 1; if (pay > .3) { g.shake = 1; sfx.clang(); g.hud.damage(V3().copy(eye).addScaledVector(dir, 3), 'PAYBACK!', 'crit'); } let hits = 0, total = 0, last: Unit | Building | null = null, crit = false;
      g.quiet = true;
      for (let i = 0; i < 9; i++) {
        const d = V3().copy(dir); d.x += R(-.075, .075); d.y += R(-.05, .05); d.z += R(-.075, .075); d.normalize();
        let hit = g.ray(eye, d, 34, -1, me); if (hit && ((hit.unit && hit.unit.team === me.team) || (hit.b && hit.b.team === me.team && hit.dist < 3))) hit = g.ray(eye, d, 34, foeOf(me.team), me);
        const dist = hit ? hit.dist : 34, end = V3().copy(eye).addScaledVector(d, dist); if (i % 2 === 0) g.tracer(muzzle, end);
        const fall = dist < 10 ? 1 : Math.max(.3, 1 - (dist - 10) / 24), tgt = hit && (hit.unit && hit.unit.team === foeOf(me.team) ? hit.unit : hit.b && hit.b.team === foeOf(me.team) ? hit.b : null);
        if (tgt) { const dm = (hit!.head ? 9 : 6) * fall * mul * (1 + pay * .8) + tagBonus(tgt, 'plated', 6 / 9) * mul; total += dm; hits++; last = tgt; crit = crit || !!hit!.head; g.fx.aim(end, d); g.damage(tgt, dm, me); hobble(g, me, tgt); if (!isUnit(tgt) && i % 3 === 0) g.fx.surface(end, d, g.surfOf(tgt), .8); } else g.impact(eye, d, hit, end, 6 * fall * mul);
      }
      g.quiet = false;
      if (last) { g.hud.hitmark(crit); sfx.hit(); g.hud.damage(V3(last.pos.x, (isUnit(last) ? UNIT[last.kind].headY : last.h * .6) + .4, last.pos.z), String(Math.round(total)), hits >= 7 ? 'crit' : ''); }
    } else {
      const long = me.kind === 'longshot'; g.recoil = Math.min(1, g.recoil + (long ? 1 : .35)); { const k = S.kick * (1 - g.ads * .5); g.pitch = Math.min(1.45, g.pitch + k); g.kick += k * .8; g.yaw += R(-.0025, .0025); } g.shake = Math.min(1, g.shake + (long ? .4 : .1)); { const low = Math.max(0, 1 - g.ammo / Math.max(1, gun.mag / 4)); long ? sfx.sniper() : me.kind === 'patch' ? sfx.pistol(low) : sfx.rifle(low); }
      const sp = S.sp * (1 - g.ads * S.adsK) * (me.moving ? 1.6 : 1) * (1 + g.bloom * (long ? 0 : 1.2)), d = V3().copy(dir); g.bloom = Math.min(1, g.bloom + (long ? 1 : me.kind === 'patch' ? .2 : .1)); d.x += R(-sp, sp); d.y += R(-sp, sp); d.z += R(-sp, sp); d.normalize();
      let hit = g.ray(eye, d, 150, -1, me);
      // A Patch's rivets mend whoever they hit on their own side.
      if (me.kind === 'patch' && hit?.unit && hit.unit.team === me.team && hit.dist < 60) {
        const o = hit.unit, end = V3().copy(eye).addScaledVector(d, hit.dist); g.tracer(muzzle, end, ringMat, .08);
        if (o.hp < o.maxHp) { if (g.net) g.net.cmd('hl', o.id); else o.hp = Math.min(o.maxHp, o.hp + 10); o.pop = .6; g.puff(end, 3, .35, M.teal, 1.6, .4); g.hud.damage(V3(o.pos.x, UNIT[o.kind].headY + .4, o.pos.z), '+10', 'shield'); g.hud.hitmark(false); sfx.ore(); }
        return;
      }
      if (hit && ((hit.unit && hit.unit.team === me.team) || (hit.b && hit.b.team === me.team && hit.dist < 3))) hit = g.ray(eye, d, 150, foeOf(me.team), me);
      const dist = hit ? hit.dist : 150, end = V3().copy(eye).addScaledVector(d, dist);
      // The Long Rifle goes through: up to two more bodies behind the first, each for a little less.
      if (long && hit?.unit && hit.unit.team === foeOf(me.team)) { let from = hit.unit, at = dist, n = 1, fall = .7; for (let i = 0; i < 2; i++) { const h2 = g.ray(V3().copy(eye).addScaledVector(d, at + .4), d, 60, foeOf(me.team), from); if (!h2?.unit || h2.unit.team !== foeOf(me.team)) break; g.damage(h2.unit, S.body * mul * fall, me); at += .4 + h2.dist; from = h2.unit; fall *= .7; n++; } if (n > 1) { end.copy(eye).addScaledVector(d, at); g.hud.streak(n > 2 ? 'TRIPLE THREAD!' : 'THREADED!'); sfx.crit(); } }
      g.tracer(muzzle, end, tracerMat, long ? .14 : .07);
      if (hit?.unit && hit.unit.team === foeOf(me.team)) { g.fx.aim(end, d); g.damage(hit.unit, (hit.head ? S.head : S.body) * mul, me, !!hit.head); hit.head ? sfx.crit() : sfx.hit(); g.hud.hitmark(!!hit.head); }
      else if (hit?.b && hit.b.team === foeOf(me.team)) { g.damage(hit.b, S.bld * mul, me); g.hud.hitmark(false); g.fx.surface(end, d, g.surfOf(hit.b)); }
      else g.impact(eye, d, hit, end, S.bld * mul);
      const f = g.bits.find(x => x.t <= 0); if (f) { f.m.material = M.spark; f.m.position.copy(muzzle).addScaledVector(dir, -.5); f.v.set(-Math.cos(g.yaw) * 2.5 + R(-.5, .5), 2.5, Math.sin(g.yaw) * 2.5 + R(-.5, .5)); f.m.scale.set(.03, .03, .07); f.spin = 20; f.t = .8; f.m.visible = true; }
    }
  }
}
export function updateCannon(g: Game, dt: number, P: Set<string>, eye: THREE.Vector3, dir: THREE.Vector3, gun: Weapon) {
  const me = g.me!, vm = g.vm.cannon; abilityKeys(g, P, eye, dir, null); vm.userData.flash.visible = vm.userData.flashL.visible = false;
  if (P.has('KeyC')) { if (g.nadeCd <= 0) { g.nadeCd = g.upOf(me.team).servo ? 6 : 10; stomp(g, me); } else sfx.deny(); }
  if (P.has('Mouse2')) {
    // Right click: both barrels lob a shell that bursts where it lands.
    if (g.salvoCd <= 0) { g.salvoCd = 7; g.recoil = 1; g.kick += .03; g.shake = 1; g.bloom = 1; sfx.cannon(); sfx.boom(.35); const rx = Math.cos(g.yaw), rz = -Math.sin(g.yaw); for (const sd of [-1, 1]) { const v = V3().copy(dir).multiplyScalar(30); v.x += rx * sd * 1.3; v.z += rz * sd * 1.3; v.y += 3.2; g.shoot(V3(eye.x + dir.x * 1.6 + rx * sd * .9, eye.y - .5, eye.z + dir.z * 1.6 + rz * sd * .9), v, me.team, 70, true, me); } vm.userData.flash.visible = vm.userData.flashL.visible = true; }
    else sfx.deny();
  }
  if (g.reloadT > 0) { g.reloadT -= dt; if (g.reloadT <= 0) g.ammo = gun.mag; return; }
  if ((P.has('KeyR') && g.ammo < gun.mag) || (g.ammo <= 0 && g.lmb)) { if (g.ammo <= 0) sfx.dry(); g.reloadT = gun.reload; sfx.reload(gun.reload); return; }
  if (g.lmb && g.fireCd <= 0 && g.ammo > 0) {
    g.fireCd = gun.cd; g.ammo--; g.side = -g.side; const flash = g.side > 0 ? vm.userData.flash : vm.userData.flashL; flash.visible = true; flash.rotation.z = R(0, 3);
    const mul = mulOf(g, me), muzzle = V3(); flash.getWorldPosition(muzzle);
    g.recoil = 1; g.pitch = Math.min(1.45, g.pitch + .012); g.kick += .01; g.shake = Math.min(1, g.shake + .22); g.bloom = Math.min(1, g.bloom + .3); sfx.cannon();
    const sp = .012, d = V3().copy(dir); d.x += R(-sp, sp); d.y += R(-sp, sp); d.z += R(-sp, sp); d.normalize();
    let hit = g.ray(eye, d, 140, -1, me); if (hit && ((hit.unit && hit.unit.team === me.team) || (hit.b && hit.b.team === me.team && hit.dist < 4))) hit = g.ray(eye, d, 140, foeOf(me.team), me);
    let dist = hit ? hit.dist : 140; if (!hit && d.y < 0) dist = Math.min(dist, -eye.y / d.y);
    const end = V3().copy(eye).addScaledVector(d, dist); g.tracer(muzzle, end, tracerMat, .16);
    const tgt = hit && (hit.unit && hit.unit.team === foeOf(me.team) ? hit.unit : hit.b && hit.b.team === foeOf(me.team) ? hit.b : null);
    if (tgt) { g.fx.aim(end, d); g.damage(tgt, (hit!.head ? 34 : 22) * mul, me, !!hit!.head); g.hud.hitmark(!!hit!.head); hit!.head ? sfx.crit() : sfx.hit(); }
    if (hit?.prop) g.damageProp(hit.prop, 22 * mul, me, end);
    if (dist < 139) g.burst(end, 14 * mul, 3.2, me, tgt);
  }
}
export function stomp(g: Game, u: Unit) {
  const p = V3(u.pos.x, 0, u.pos.z); let any = false;
  for (const e of g.units) { if (!e.alive || e.team === u.team) continue; const dx = e.pos.x - p.x, dz = e.pos.z - p.z, d = Math.hypot(dx, dz); if (d > 6.5 + UNIT[e.kind].rad) continue; g.damage(e, 46 * (1 - .5 * Math.min(1, d / 6.5)), u); const k = e.kind === 'warden' ? 3 : 16; e.kx += dx / (d || 1) * k; e.kz += dz / (d || 1) * k; any = true; }
  g.blastProps(p, 6.5, 60, u); g.shove(p, 9, 10);
  for (let i = 0; i < 10; i++) { const a = i / 10 * 6.283; g.puff(TMP.set(p.x + Math.cos(a) * 2.6, .3, p.z + Math.sin(a) * 2.6), 1, 1.1, M.dust, 1.6, .5); }
  g.debris(TMP.set(p.x, .3, p.z), 8, .22, M.rock, 7); g.scorchAt(p, 5); g.warn(p.x, p.z, 6.5, .35);
  const v = g.vol(p); g.shake = Math.max(g.shake, v * 1.2); sfx.boom(v); sfx.clang();
  if (u === g.me || any) g.hud.damage(V3(p.x, 2.4, p.z), 'STOMP!', 'ko');
}
/** The Patch's pulse: tops up every friendly body nearby, the caster included. */
export function patchUp(g: Game, u: Unit) {
  let n = 0; for (const o of g.own(undefined, u.team)) { if (Math.hypot(o.pos.x - u.pos.x, o.pos.z - u.pos.z) > 9 || o.hp >= o.maxHp) continue; o.hp = Math.min(o.maxHp, o.hp + 45); n++; if (o !== u) g.puff(TMP.set(o.pos.x, UNIT[o.kind].bodyY + .4, o.pos.z), 3, .3, M.teal, 1.8, .5); }
  for (let i = 0; i < 12; i++) { const a = i / 12 * 6.283; g.puff(TMP.set(u.pos.x + Math.cos(a) * 4.5, .3, u.pos.z + Math.sin(a) * 4.5), 1, .35, M.teal, 1.2, .3); } sfx.built(); if (u === g.me) g.hud.damage(V3(u.pos.x + Math.sin(g.yaw) * 2, 1.8, u.pos.z + Math.cos(g.yaw) * 2), n ? `PATCHED ×${n}` : 'ALL GOOD', 'shield');
}
export function aiSoldier(g: Game, u: Unit, dt: number) {
  const heavy = u.kind === 'breacher', big = u.kind === 'gantry', long = u.kind === 'longshot', doc = u.kind === 'patch', up = g.upOf(u.team), glass = long && up.glass, range = big ? 24 : long ? (glass ? 44 : 36) : doc ? 15 : heavy ? 10 : 19;
  if (doc) aiMend(g, u, dt);
  // Hurt guards used to walk off to a Patch, Depot or the Headframe at 35% health and come back mended. With a tower covering the walk, a
  // defending Ironhold line almost never lost a body: it was the largest single reason the Veyl lost 52 of 60 bot matches (21-9 with it,
  // 13-16 without). They hold the line now; a Patch, a Depot or the Headframe still mends whoever is standing near it.
  if (u.think <= 0) { u.think = .3; u.target = g.acquire(u, long ? (glass ? 52 : 44) : 30, u.order.type === 'guard' ? 0 : 28); }
  const t = u.target;
  if (t && t.alive) {
    const isB = !isUnit(t), d = isB ? g.distToBox(t as Building, u.pos.x, u.pos.z) : t.pos.distanceTo(u.pos), ty = g.aimAt(u, t, 1.1);
    if (d > range) g.moveTo(u, t.pos.x, t.pos.z, dt, 1, heavy ? 1.15 : 1);
    else if (u.cd <= 0) {
      const mul = mulOf(g, u), a = V3(u.pos.x + Math.sin(u.yaw) * 1.1, 1.0, u.pos.z + Math.cos(u.yaw) * 1.1); u.swing = 1; u.flashT = .07;
      if (big) { u.cd = .8 + R(0, .15); a.y = 2.3; const b = V3(t.pos.x + R(-.8, .8), isB ? ty : .3, t.pos.z + R(-.8, .8)); g.tracer(a, b, tracerMat, .16); sfx.blast(g.vol(u.pos) * .6); g.damage(t, (isB ? 16 : 12) * mul, u); g.burst(b, 12 * mul, 3.2, u, t); if (g.time > u.dashCd && !isB && d < 6) { u.dashCd = g.time + (up.servo ? 7 : 12); stomp(g, u); } }
      else if (heavy) { u.cd = 1.05 + R(0, .2); let dm = 0; for (let i = 0; i < 5; i++) { const hit = isB || Math.random() < .7; if (hit) dm += isB ? 4 : 6; if (i % 2 === 0) g.tracer(a, V3(t.pos.x + R(-1, 1), ty + R(-.6, .6), t.pos.z + R(-1, 1))); } sfx.blast(g.vol(u.pos) * .5); g.damage(t, (dm + tagBonus(t, 'plated', 6)) * mul, u); hobble(g, u, t); }
      else if (long) { u.cd = 1.7 + R(0, .3); const hit = isB || Math.random() < (d < 12 ? .4 : .85), b = V3(t.pos.x, ty + .3, t.pos.z); if (!hit) b.add(TMP.set(R(-1.5, 1.5), R(0, 1.5), R(-1.5, 1.5))); g.tracer(a, b, tracerMat, .13); sfx.blast(g.vol(u.pos) * .5); if (hit) g.damage(t, (isB ? 18 : 52) * mul * (glass ? 1.15 : 1), u); }
      else if (doc) { u.cd = .55 + R(0, .1); const hit = isB || Math.random() < .6, b = V3(t.pos.x, ty, t.pos.z); g.tracer(a, b); sfx.shot(g.vol(u.pos) * .35); if (hit) g.damage(t, 5 * mul, u); }
      else if (!isB && d > 9 && d < 24 && g.time > u.dashCd && g.units.filter(o => o.alive && o.team !== u.team && Math.abs(o.pos.x - t.pos.x) < 4.5 && Math.abs(o.pos.z - t.pos.z) < 4.5).length >= 3) {
        // three or more bunched up: a Linesman lobs a grenade into the middle of them
        u.dashCd = g.time + (up.frag ? 9 : 15); u.cd = .7; const hs = Math.max(8, Math.min(19, d * 1.05)), v = V3((t.pos.x - u.pos.x) / d * hs, 4.5, (t.pos.z - u.pos.z) / d * hs); g.shoot(V3(u.pos.x, 1.5, u.pos.z).addScaledVector(v, .04), v, u.team, 60, true, u); if (g.vol(u.pos) > .3) sfx.throw();
      }
      else { u.cd = .38 + R(0, .08); const hit = isB || Math.random() < .7, b = V3(t.pos.x, ty, t.pos.z); if (!hit) b.add(TMP.set(R(-1.5, 1.5), R(-.5, 1.5), R(-1.5, 1.5))); g.tracer(a, b); sfx.shot(g.vol(u.pos) * .5); if (hit) g.damage(t, (isB ? 5 : 8) * mul, u); }
      if (boosted(g, u, 'ot')) u.cd /= fireRate(g, u);
    }
    return;
  }
  u.target = null; u.pitch *= .9; const o = u.order, me = g.me;
  let lead = o.lead?.alive ? o.lead : me;
  // Online, the player being followed may have lost that body. Follow whatever body that same player drives now.
  if (o.type === 'follow' && o.lead && !o.lead.alive && o.lead.pilot) { const nb = g.units.find(x => x.alive && x.pilot === o.lead!.pilot && x.team === u.team); if (nb) { o.lead = nb; lead = nb; } }
  if (o.type === 'follow' && lead?.alive) { const a = u.slot * 2.4, r = 2.8 + (u.slot % 3) * 1.0, tx = lead.pos.x + Math.cos(a) * r, tz = lead.pos.z + Math.sin(a) * r; if (Math.hypot(tx - u.pos.x, tz - u.pos.z) > 1.6) g.moveTo(u, tx, tz, dt, .5, 1.3); }
  else if (o.type !== 'follow') g.advance(u, dt, o.type === 'amove' ? 5 : .7);
}
export function aiMend(g: Game, u: Unit, dt: number) {
  if (u.think <= 0) { let best: Unit | null = null, br = .85; for (const o of g.own(undefined, u.team)) { if (o === u || o.hp >= o.maxHp) continue; const d = Math.hypot(o.pos.x - u.pos.x, o.pos.z - u.pos.z); if (d > 13) continue; const r = o.hp / o.maxHp; if (r < br) { br = r; best = o; } } u.mend = best; }
  const m = u.mend; if (!m || !m.alive || m.hp >= m.maxHp) { u.mend = null; return; }
  const d = Math.hypot(m.pos.x - u.pos.x, m.pos.z - u.pos.z); if (d > 14) { u.mend = null; return; }
  m.hp = Math.min(m.maxHp, m.hp + (g.upOf(u.team).stitch ? 24 : 15) * dt); u.timer -= dt;
  if (u.timer <= 0) { u.timer = .3; g.tracer(V3(u.pos.x, 1.2, u.pos.z), V3(m.pos.x, UNIT[m.kind].bodyY, m.pos.z), ringMat, .06); g.puff(TMP.set(m.pos.x + R(-.3, .3), UNIT[m.kind].bodyY + .3, m.pos.z + R(-.3, .3)), 1, .28, M.teal, 1.8, .3); }
}

defineUnits({
  linesman: { gun: GUNS.linesman, shot: SHOT.linesman },
  breacher: { gun: GUNS.breacher },
  longshot: { gun: GUNS.longshot, shot: SHOT.longshot },
  patch: { gun: GUNS.patch, shot: SHOT.patch },
  gantry: { gun: GUNS.gantry, drive: (g, dt, P, eye, dir, _look, gun) => updateCannon(g, dt, P, eye, dir, gun!) },
});
const drive: NonNullable<typeof DEFAULTS.drive> = (g, dt, P, eye, dir, look, gun) => { if (fac(g.me!.team) === 0) abilityKeys(g, P, eye, dir, look, ['pulse']); if (gun) updateGun(g, dt, P, eye, dir, gun); };
defineFaction(0, { ai: aiSoldier, drive });
// A body whose kind and faction give no brain or controls fights as a plain gun soldier.
DEFAULTS.ai = aiSoldier; DEFAULTS.drive = drive;

defineBuildings({
  bunkhouse: { sideDoor: true },
  watchpost: { tick(g, b, dt) {
    b.cd -= dt; let tgt: Unit | null = null, bd = g.upOf(b.team).post ? 42 : 34; for (const o of g.units) { if (!o.alive || !isEnemy(o.team, b.team) || !sees(b.team, b.pos.y, o.pos.x, o.pos.z, o.pos.y) /* terrain (J): not up a cliff out of sight */) continue; const d = o.pos.distanceTo(b.pos); if (d < bd) { bd = d; tgt = o; } }
    if (tgt) { const gun = b.obj.userData.gun; gun.rotation.y = Math.atan2(tgt.pos.x - b.pos.x, tgt.pos.z - b.pos.z) - b.obj.rotation.y; if (b.cd <= 0) { b.cd = g.upOf(b.team).post ? .3 : .45; const a = V3(b.pos.x, 6, b.pos.z), e = V3(tgt.pos.x, UNIT[tgt.kind].bodyY, tgt.pos.z); g.tracer(a, e, tracerMat, .1); sfx.turret(g.vol(b.pos) * .6); g.damage(tgt, 10 * g.gunMul(b.team), b); } }
  } },
  headframe: { tick(g, b, dt) {
    // The night watchman on the Headframe: a slow rivet gun, so two raiders cannot empty the pit while the squad is away.
    b.cd -= dt; if (b.cd <= 0) { b.cd = .8; let tgt: Unit | null = null, bd = 20; for (const o of g.units) { if (!o.alive || !isEnemy(o.team, b.team) || !sees(b.team, b.pos.y, o.pos.x, o.pos.z, o.pos.y) /* terrain (J): not up a cliff out of sight */) continue; const d = o.pos.distanceTo(b.pos); if (d < bd) { bd = d; tgt = o; } }
      if (tgt) { g.tracer(V3(b.pos.x, b.h + .6, b.pos.z), V3(tgt.pos.x, UNIT[tgt.kind].bodyY, tgt.pos.z), tracerMat, .08); sfx.turret(g.vol(b.pos) * .4); g.damage(tgt, 9 * g.gunMul(b.team), b); } else b.cd = .3; }
  } },
});

defineUnits({
  // The Breacher's shield faces forward: a braced player takes a quarter and banks Payback, a bot takes a bit over half.
  breacher: { hurt(g, u, amt, from) { if (!from) return amt; const me = g.me, dx = from.pos.x - u.pos.x, dz = from.pos.z - u.pos.z, d = Math.hypot(dx, dz) || 1; if ((dx * Math.sin(u.yaw) + dz * Math.cos(u.yaw)) / d > .25) { if (u === me && g.brace) { g.payback = Math.min(1, g.payback + amt * .75 / 50); amt *= .25; sfx.clang(); } else if (u.pilot) { if (u.brace) amt *= .25; } else if (u !== me) amt *= .55; } return amt; } },
  // A Gantry's fuel goes up when it falls.
  gantry: { steady: true, dying(g, u) { if (g.net) return; u.alive = false; g.explode(V3(u.pos.x, 0, u.pos.z), u.team, 40, 6, null); u.alive = true; } },
  rigger: { shove: 14 },
  longshot: { killStop: .12 },
});

defineUnits({
  linesman: { step: 0 }, rigger: { step: 0, threat: 1.15, task: (_g, u) => u.state === 'build' || u.state === 'toSite' ? 'Building' : 'Mining ore' },
  breacher: { brace: true, hop: 15, stride: 9, scale: 1.14, threat: 1.25 },
  gantry: { step: 2, hop: 11, stride: 6.5 },
  patch: { threat: .6, task: () => 'Keeping people alive' }, longshot: { threat: .7 },
});
defineBuildings({ depot: { mends: true }, headframe: { mends: true } });
defineFaction(0, {
  tab: ['linesman', 'longshot', 'patch', 'sapper', 'breacher', 'dustbike', 'piledriver', 'gantry', 'flakkite', 'gadfly', 'hopper', 'surveyor', 'claimbarge', 'rigger'],
  pace(g, u) {
    const up = g.upOf(u.team), k = u.kind; let m = k === 'gantry' || k === 'gantryflak' ? (up.servo ? 1.2 : 1) : (k === 'gadfly' || k === 'hopper') && up.rotors ? 1.2 : catOf(k) === 'inf' && k !== 'rigger' && up.pay ? 1.12 : 1;
    if (boosted(g, u, 'ot')) m *= TUNE.overtime.pace; if (boosted(g, u, 'kick')) m *= TUNE.kick.pace; if (boosted(g, u, 'burn')) m *= TUNE.afterburn.pace; return m;
  },
  fx(g, dt) { ironTick(g, dt); },
});
// The faction's own systems once a frame (charges, drones, casts, cloaks). The engine's per-frame `fx` hook is not called yet, so the
// per-building `each` hook runs them too, once a frame whichever building comes first; the time check keeps it to once if both run.
/** Per game: a server runs many matches, and two at the same tick must each get their turn (K). */
const TICKED = new WeakMap<Game, number>();
function ironTick(g: Game, dt: number) { syncStoryTree(g); if (g.net || g.time === TICKED.get(g)) return; TICKED.set(g, g.time); tickCharges(g, dt); tickDrones(g); tickCasts(g); tickAir(g, dt); }
{ const was = factionRule(0).each; defineFaction(0, { each(g, b, dt) { ironTick(g, dt); was?.(g, b, dt); } }); }

// Abilities the server checks for a player online. The Patch's pulse heals everyone near; the local game calls patchUp straight from the key.
defineAbilities('patch', [{ key: 'pulse', name: 'Patch Pulse', hotkey: 'C', energy: 0, cd: 6.5, cast: 0, range: 0, target: 'self', blurb: 'Heals every friend close by.', effect: (g, u) => patchUp(g, u) }]);

// Painkiller's armour goes on top of each kind's own defence (the Breacher's shield), so this runs after every `hurt` above.
for (const k of ['rigger', 'linesman', 'breacher', 'patch', 'longshot', 'gantry', 'gantryflak', 'sapper', 'dustbike', 'piledriver', 'piledriverset', 'flakwalker', 'hopper', 'flakkite', 'gadfly', 'surveyor', 'claimbarge']) wrapHurt(k);
