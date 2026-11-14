// What Veyl bodies do: the Cantor's blades and Whirl, the Lancer's beam and Held Note, the Warden's slam and Low Note, in first person
// and as the bots drive them. Shared code reaches these through the registry (src/core/registry.ts).
import * as THREE from 'three';
import './arms';      // what a driven Veyl body can claim online
import { showSilent } from './show';   // stream F's silent look, wired to the song-field rules
import { V3, R, M } from '../../gfx';
import { sfx } from '../../audio';
import type { Game } from '../../game';
import { TMP, r1, beamMat } from '../../game';
import { UNIT, BLD, Unit, Building, isUnit, foeOf, fac, SIDE, CLEAVE, isFoe, type BKind } from '../../data';
import { isEnemy } from '../../core/sides';
import { defineUnits, defineBuildings, defineFaction } from '../../core/registry';
import { defineAbilities } from '../../core/ability';
import { canHit } from '../../core/combat';
import { seenBy } from '../../core/sight';
import { V_TUNE, V_NEEDS } from './numbers';
import { placeWhy, rateOf, silent, eachVeyl, hatchVeyl, fieldsOn } from './fields';
import { driveNew, driveMute, driveLyre, hitK, seek, veylTick, gunAI } from './units';
import type { Hit } from '../../core/registry';
import './stand-in';

/** First person as a Veyl fighter. */
export function updateVeyl(g: Game, dt: number, P: Set<string>, eye: THREE.Vector3, dir: THREE.Vector3, look: Hit | null = null) {
  const me = g.me!, vm = g.vm.veyl, flash = vm.userData.flash, K = g.vMul(me.team); flash.visible = false;   // K: hits go through vMul, like the bots'
  g.vCd = Math.max(0, g.vCd - dt); g.comboT -= dt; if (g.comboT <= 0) g.combo = 0;
  // The new kinds (src/factions/veyl/units.ts): their beams and abilities. The Cantor, Lancer and Warden keep the code below, plus their new keys.
  if (me.kind !== 'cantor' && me.kind !== 'lancer' && me.kind !== 'warden') { const done = driveNew(g, dt, P, eye, dir, look); if (me.kind === 'mute') driveMute(g, dir); else if (me.kind === 'lyre') driveLyre(g, look); if (done || me.kind === 'mute') return; }
  else driveNew(g, dt, new Set([...P].filter(k => !k.startsWith('Mouse'))), eye, dir, look);   // their R, C, V and Z keys and the key tips; the mouse stays theirs
  if (me.kind === 'warden') {
    // Right click: the Low Note. Every Veyl in earshot gets its shield back.
    if (P.has('Mouse2')) { if (g.vCd <= 0) { g.vCd = 20; g.net?.cmd('vs'); sfx.charge(1); sfx.boom(.3); g.shake = Math.max(g.shake, .5); g.warn(me.pos.x, me.pos.z, 16, .5); g.hud.damage(V3(me.pos.x, 4.6, me.pos.z), 'LOW NOTE', 'shield'); } else sfx.deny(); }
    if (g.vWind > 0) {
      g.vWind -= dt; if (g.vWind > 0) return;
      g.fireCd = 1.5; g.recoil = 1; g.shake = Math.min(1, g.shake + .6); const c = V3(g.vX, 0, g.vZ);
      g.explode(c, me.team, 38 * K, 4.6, me, true); g.net?.cmd('xx', r1(c.x), r1(c.z), 4.6); return;
    }
    if (g.lmb && g.fireCd <= 0) { g.vWind = .7; g.vX = me.pos.x + Math.sin(g.yaw) * 3.4; g.vZ = me.pos.z + Math.cos(g.yaw) * 3.4; g.warn(g.vX, g.vZ, 4.6, .7); sfx.charge(1); }
    return;
  }
  if (me.kind === 'cantor' && P.has('Mouse2')) {
    // Right click: the Whirl. Everything in arm's reach, all the way round.
    if (g.vCd > 0) sfx.deny(); else { g.vCd = 6; g.fireCd = .5; g.recoil = 1; me.swing = 1; sfx.slash(1); sfx.dash(.6); g.shake = Math.max(g.shake, .35); let n = 0;
      for (const u of g.units) { if (!u.alive || !isFoe(u.team, me.team)) continue; if (Math.hypot(u.pos.x - me.pos.x, u.pos.z - me.pos.z) > 3.8 + UNIT[u.kind].rad) continue; g.damage(u, V_TUNE.cantor.cut * 1.5 * K, me); n++; }
      if (n) { g.hud.hitmark(false); sfx.hit(); g.hud.damage(V3(me.pos.x, 2.6, me.pos.z), n > 1 ? 'WHIRL x' + n : 'WHIRL!', 'ko'); } return; }
  }
  if (me.kind === 'lancer') {
    // Right click: the Held Note. A beat to wind up, then a beam that goes through the whole line.
    if (g.vWind > 0) {
      g.vWind -= dt; if (g.vWind > 0) return;
      g.fireCd = 1.3; g.recoil = 1; g.kick += .04; g.shake = Math.max(g.shake, .5); flash.visible = true; sfx.zap(1); sfx.boom(.25); me.swing = 1;
      const muzzle = V3(); flash.getWorldPosition(muzzle); muzzle.addScaledVector(dir, 1.6); let at = 0, skip: Unit | null = me, n = 0, fall = 1, wall = false;
      for (let i = 0; i < 4; i++) { const h = g.ray(V3().copy(eye).addScaledVector(dir, at), dir, 80 - at, -1, skip); if (!h) { at = 80; break; } at += h.dist; if (h.unit && isFoe(h.unit.team, me.team)) { g.damage(h.unit, 55 * fall * K, me, !!h.head); skip = h.unit; fall *= .8; n++; at += .4; continue; } if (h.b && isFoe(h.b.team, me.team)) { g.damage(h.b, 40 * K, me); n++; } wall = true; break; }
      const end = V3().copy(eye).addScaledVector(dir, Math.min(80, at)); g.tracer(muzzle, end, beamMat, .16); if (wall) g.puff(end, 3, .6, M.teal, .8);
      if (n) { g.hud.hitmark(n > 1); sfx.hit(); if (n > 1) g.hud.streak('ONE NOTE, ' + n + ' VOICES'); } return;
    }
    if (P.has('Mouse2')) { if (g.vCd <= 0) { g.vCd = 7; g.vWind = .8; sfx.charge(1); } else sfx.deny(); return; }
  }
  if (!g.lmb || g.fireCd > 0) return;
  if (me.kind === 'cantor') {
    g.fireCd = .6; g.recoil = 1; me.swing = 1; sfx.slash(1); let any = false; const cut = (V_TUNE.cantor.cut * 1.2 + g.combo * 5) * K;
    for (const u of g.units) { if (!u.alive || !isFoe(u.team, me.team)) continue; const dx = u.pos.x - me.pos.x, dz = u.pos.z - me.pos.z, d = Math.hypot(dx, dz); if (d > 3 + UNIT[u.kind].rad || (dx * dir.x + dz * dir.z) / (d || 1) < .45) continue; g.damage(u, cut, me); any = true; }
    for (const b of g.buildings) { if (!b.alive || !isFoe(b.team, me.team) || g.distToBox(b, me.pos.x, me.pos.z) > 2.8) continue; const dx = b.pos.x - me.pos.x, dz = b.pos.z - me.pos.z; if (dx * dir.x + dz * dir.z < 0) continue; g.damage(b, 14 * K, me); any = true; }
    if (any) { g.hud.hitmark(g.combo >= 3); sfx.hit(); g.shake = Math.max(g.shake, .2 + g.combo * .06); g.combo = Math.min(3, g.combo + 1); g.comboT = 2; }
    return;
  }
  // Lancer: one long, bright note
  g.fireCd = 1.15; g.recoil = 1; g.kick += .02; flash.visible = true; sfx.zap(1); me.swing = 1;
  const hit = g.ray(eye, dir, 70, -1, me), dist = hit ? hit.dist : 70, end = V3().copy(eye).addScaledVector(dir, dist), muzzle = V3(); flash.getWorldPosition(muzzle); muzzle.addScaledVector(dir, 1.6);
  g.tracer(muzzle, end, beamMat, .06);
  const tgt = hit && (hit.unit && isFoe(hit.unit.team, me.team) ? hit.unit : hit.b && isFoe(hit.b.team, me.team) ? hit.b : null);
  if (tgt) { g.damage(tgt, (hit!.head ? 1.8 : 1) * V_TUNE.lancer.dmg * (g.upOf(me.team).vbreath ? 1.15 : 1) * K, me, !!hit!.head); g.hud.hitmark(!!hit!.head); sfx.hit(); g.puff(end, 2, .5, M.teal, .6); } else g.impact(eye, dir, hit, end, 20);
}
export function aiCantor(g: Game, u: Unit, dt: number) {
  if (g.leash(u, dt)) return;
  u.dashCd -= dt; u.dashT -= dt; if (g.aiFallBack(u, dt)) return;
  if (u.think <= 0) { u.think = .3; const raid = u.order.type === 'raid' || u.order.type === 'amove', cur = u.target; // A Cantor on the march only looked 22 m ahead, while rifles reach 38 and a Watchpost 34: a push walked on at its target building while the
    // defenders shot it for free (Veyl pushes lost twice what they killed and broke 3 buildings in 33 tries). One that is being hit goes for whoever is in reach.
    if (!cur || !cur.alive || !isUnit(cur) || !canHit(u, cur)) u.target = seek(g, u, raid ? (g.time - u.lastHit < 2 ? 40 : 22) : 28, raid && !(u.order.path && u.order.path.length) ? 14 : 0); }
  const t = u.target;
  if (t && t.alive) {
    const isB = !isUnit(t), d = isB ? g.distToBox(t as Building, u.pos.x, u.pos.z) : t.pos.distanceTo(u.pos);
    if (!isB && d > 45) { u.target = null; return; }
    if (d > (isB ? 1.3 : 1.7 + UNIT[(t as Unit).kind].rad * .5)) { if (d > 6 && d < 13 && u.dashCd <= 0) { u.dashT = .4; u.dashCd = 3.5; g.puff(TMP.copy(u.pos).setY(.5), 3, .7, M.teal, .4); sfx.dash(g.vol(u.pos)); } 
      // closing on someone with a gun, a Cantor weaves instead of running down the barrel
      let wx = 0, wz = 0; if (!isB && d > 7 && u.dashT <= 0) { const k = Math.sin(g.time * 3.1 + u.id * 1.7) * Math.min(4.5, d * .3), nx = -(t.pos.z - u.pos.z) / d, nz = (t.pos.x - u.pos.x) / d; wx = nx * k; wz = nz * k; }
      g.moveTo(u, t.pos.x + wx, t.pos.z + wz, dt, .5, u.dashT > 0 ? 2.6 : 1); }
    else { u.yaw = Math.atan2(t.pos.x - u.pos.x, t.pos.z - u.pos.z); if (u.cd <= 0) { u.cd = V_TUNE.cantor.cd; u.swing = 1; sfx.slash(g.vol(u.pos)); const d = (isB ? V_TUNE.cantor.cut * .77 : V_TUNE.cantor.cut + ((u as any).rushHit ? V_TUNE.cantor.rushHit : 0)) * hitK(g, u); (u as any).rushHit = 0; g.damage(t, d, u);
      // The sweep carries on through whatever is pressed up against the target: half the cut to two more bodies inside the arc. Against a spread
      // rifle line it finds nobody; against a swarm at its ankles it is the only thing that keeps a Cantor worth its ore.
      if (!isB) { let n = 0; for (const o of g.units) { if (n >= CLEAVE.n) break; if (o === t || !o.alive || !isEnemy(o.team, u.team) || Math.hypot(o.pos.x - t.pos.x, o.pos.z - t.pos.z) > 1.9 || Math.hypot(o.pos.x - u.pos.x, o.pos.z - u.pos.z) > 3.8) continue; n++; g.damage(o, d * CLEAVE.k, u); } } } }
    return;
  }
  g.vIdle(u, dt, u.order.type === 'raid' ? 3 : 1.5, u.order.type !== 'guard' || g.dir.alarmT > 0 ? 1 : .6);
}
export function aiLancer(g: Game, u: Unit, dt: number) {
  // The shared gunner brain (src/factions/veyl/units.ts): close to range, fire on the cooldown, step back from anything inside 9 m. The old
  // brain wound up, fired a slow bolt and then ran for cover, so a Lancer got off a third of its shots and most of those missed.
  const breath = g.eco && g.upOf(u.team).vbreath;
  gunAI(g, u, dt, { range: 25 + (breath ? V_TUNE.lancer.breath : 0), cd: V_TUNE.lancer.cd, keep: 9, fire: t => {
    const ty = isUnit(t) ? ((t as Unit).alt || 0) + UNIT[t.kind].bodyY : Math.min((t as Building).h * .5, 3), from = V3(u.pos.x + Math.sin(u.yaw) * 1.2, 1.5, u.pos.z + Math.cos(u.yaw) * 1.2);
    g.tracer(from, V3(t.pos.x, ty, t.pos.z), beamMat, .08); g.damage(t, V_TUNE.lancer.dmg * hitK(g, u) * (breath ? 1.15 : 1), u); sfx.zap(g.vol(u.pos));
  } });
}
/** Between shots a Lancer ducks behind the nearest solid scenery, then leans out to fire. */
export function takeCover(g: Game, u: Unit, t: Unit, dt: number) {
  let c = u.cover || null; if (c && (!c.alive || Math.hypot(c.x - u.pos.x, c.z - u.pos.z) > 11)) c = u.cover = null;
  if (!c && u.think > .3) { let bd = 8; for (const s of g.spires) { if (s.h < 1.6 || s.r < .5 || s.r > 6) continue; const dd = Math.hypot(s.x - u.pos.x, s.z - u.pos.z) - s.r; if (dd < bd && Math.hypot(s.x - t.pos.x, s.z - t.pos.z) > 6) { bd = dd; c = s; } } u.cover = c; }
  if (!c) return;
  const ax = c.x - t.pos.x, az = c.z - t.pos.z, l = Math.hypot(ax, az) || 1, off = c.r + UNIT[u.kind].rad + .4, side = u.id % 2 ? 1 : -1, peek = u.cd < .8 ? c.r + 1.4 : 0;
  g.moveTo(u, c.x + ax / l * off - az / l * peek * side, c.z + az / l * off + ax / l * peek * side, dt, .3);
}
export function aiWarden(g: Game, u: Unit, dt: number) {
  if (u.wind > 0) { u.wind -= dt; if (u.wind <= 0) { u.cd = 2.2; u.swing = 1; g.explode(V3(u.windX, 0, u.windZ), u.team, 34 * hitK(g, u), 4.6, u, true); } return; }
  if (u.think <= 0) { u.think = .4; const raid = u.order.type === 'raid' || u.order.type === 'amove', cur = u.target; if (!cur || !cur.alive || !isUnit(cur) || cur.pos.distanceTo(u.pos) > 30) u.target = g.acquire(u, raid ? 20 : 26, raid && !(u.order.path && u.order.path.length) ? 18 : 0); }
  const t = u.target;
  if (t && t.alive) {
    const isB = !isUnit(t), d = isB ? g.distToBox(t as Building, u.pos.x, u.pos.z) : t.pos.distanceTo(u.pos);
    if (!isB && d > 50) { u.target = null; return; }
    if (d > (isB ? 2.6 : 3.6)) g.moveTo(u, t.pos.x, t.pos.z, dt, 1);
    else { u.yaw = Math.atan2(t.pos.x - u.pos.x, t.pos.z - u.pos.z); if (u.cd <= 0) { u.wind = .9; const f = Math.min(d, 3.2); u.windX = u.pos.x + Math.sin(u.yaw) * f; u.windZ = u.pos.z + Math.cos(u.yaw) * f; g.warn(u.windX, u.windZ, 4.6, .9); sfx.charge(g.vol(u.pos)); } }
    return;
  }
  g.vIdle(u, dt, u.order.type === 'raid' ? 4 : 2, u.order.type !== 'guard' ? 1 : .6);
}

defineUnits({ cantor: { ai: aiCantor }, lancer: { ai: aiLancer }, warden: { ai: aiWarden } });
defineFaction(1, { ai: aiWarden, drive: (g, dt, P, eye, dir, look) => updateVeyl(g, dt, P, eye, dir, look) });
// Song fields, seeds and the training queue (src/factions/veyl/fields.ts).
defineFaction(1, {
  // Tech: a body whose building is not up yet is refused, for a person, the Conductor and the network alike ("Mute needs a Quiet House first").
  gate: (g, team, what) => { const nb = (V_NEEDS as Record<string, BKind>)[what]; return nb && !g.ownB(nb, true, team).length ? BLD[nb].name : ''; },
  grows: true, placeOK: (g, k, x, z, team) => placeWhy(g, k, x, z, team), works: (g, b) => rateOf(g, b), each: (g, b, dt) => { veylTick(g, dt); eachVeyl(g, b, dt); showSilent(g, b); },
  whySilent: (g, b) => silent(g, b) ? `The ${BLD[b.kind].name} is silent: it stands outside every song field. Grow a Hush Well or a Choir Stone next to it.` : '',
  bought(g, team, key) {
    // Shell levels: every Veyl shield 10% bigger. Air Glass: Veyl fliers get more health and shield.
    const sh = key === 'vshell' || key === 'vshell2' || key === 'vshell3' ? 1.1 : 0, air = key === 'vaglass' ? V_TUNE.air[0] : key === 'vaglass2' ? V_TUNE.air[1] : key === 'vaglass3' ? V_TUNE.air[2] : 0;
    for (const x of g.own(undefined, team)) { if (sh) { x.maxShield *= sh; x.shield *= sh; } if (air && UNIT[x.kind].air) { x.maxHp *= air; x.hp *= air; x.maxShield *= air; x.shield *= air; } }
  },
});
defineBuildings(Object.fromEntries((['choir', 'broodpit', 'reedgate', 'kiln', 'skyloft'] as const).map(k => [k, { hatch: hatchVeyl }])));

defineBuildings({
  thornspire: { tick(g, b, dt) {
    // Hits ground and air bodies, and sees unseen ones within 11 m (BldDef.detect). game.ts skips this tick while the Spire is silent.
    b.cd -= dt; if (b.cd <= 0) { const S = V_TUNE.spire; b.cd = S.cd; let tgt: Unit | null = null, bd = S.range; for (const o of g.units) { if (!o.alive || !isEnemy(o.team, b.team) || o.inside || !canHit(b, o) || !seenBy(g, b.team, o)) continue; const d = Math.hypot(o.pos.x - b.pos.x, o.pos.z - b.pos.z); if (d < bd) { bd = d; tgt = o; } }
      if (tgt) { g.tracer(V3(b.pos.x, 6.9, b.pos.z), V3(tgt.pos.x, (tgt.alt || 0) + UNIT[tgt.kind].bodyY, tgt.pos.z), beamMat, .2); sfx.zap(g.vol(b.pos) * .7); g.damage(tgt, S.dmg * g.vMul(b.team), b); g.puff(TMP.copy(tgt.pos).setY((tgt.alt || 0) + 1), 2, .5, M.mag, .5); } else b.cd = .3; }
  } },
  choir: { tick(g, b, dt) {
    b.cd -= dt; if (b.cd <= 0) { b.cd = 1.15; let tgt: Unit | null = null, bd = 21; for (const o of g.units) { if (!o.alive || !isEnemy(o.team, b.team)) continue; const d = o.pos.distanceTo(b.pos); if (d < bd) { bd = d; tgt = o; } }
      if (tgt) { g.tracer(V3(b.pos.x, 9.6, b.pos.z), V3(tgt.pos.x, 1.1, tgt.pos.z), beamMat, .16); sfx.zap(g.vol(b.pos) * .8); g.damage(tgt, 6 * g.vMul(b.team), b); g.puff(TMP.copy(tgt.pos).setY(1), 2, .5, M.teal, .5); } }
  } },
});

defineUnits({
  warden: { steady: true, koWord: 'KRAKA-THOOM!', koStop: .25, downed(g, _u, v) { if (fac(SIDE.home) !== 0) return false; g.shake = Math.max(g.shake, v); g.feed('Alpha', 'Warden down! Did everybody see that? I did that.', '', SIDE.home); return true; } },
});

defineUnits({
  warden: { heavy: true, threat: 1.1 }, lancer: { threat: .8 },
  tender: { task: (_g, u) => u.state === 'build' || u.state === 'toSite' ? 'Singing a building up' : 'Humming ore' },
});
defineBuildings({ wardpylon: { ward: 34 }, siphonbell: { tap: true } });
defineFaction(1, {
  tab: ['cantor', 'lancer', 'warden', 'tender'],
  pace(g, u) { return g.upOf(u.team).vstep && u.kind !== 'tender' ? 1.12 : 1; },
  task: (_g, u) => u.order.type === 'raid' || u.order.type === 'amove' ? 'Marching on the yard' : u.order.type === 'follow' ? 'Following you' : 'Guarding the Stones',
});

// The Warden's low note: every friend within 16 m gets 60 shield back. Online the server casts it when the player's browser asks.
defineAbilities('warden', [{ key: 'lownote', name: 'Low Note', hotkey: 'Mouse2', energy: 0, cd: 19, cast: 0, range: 0, target: 'self', radius: 16, blurb: 'Every friend close by gets 60 shield back.',
  effect: (g, u) => { for (const o of g.units) if (o.alive && o.team === u.team && Math.hypot(o.pos.x - u.pos.x, o.pos.z - u.pos.z) < 16) { o.shield = Math.min(o.maxShield, o.shield + 60); o.pop = .6; } },
  // a bot Warden sings it once the friends close by have lost 150 shield between them (the note gives up to 60 to each)
  ai: (g, u) => g.units.reduce((n, o) => n + (o.alive && o.team === u.team && Math.hypot(o.pos.x - u.pos.x, o.pos.z - u.pos.z) < 16 ? Math.min(60, o.maxShield - o.shield) : 0), 0) >= 150 ? { x: u.pos.x, z: u.pos.z } : null }]);
