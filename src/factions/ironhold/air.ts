// Ironhold fliers and spells: the Hopper (8 beds, Afterburn), the Flak Kite and its landed walker, the Gadfly (Smoke Cloak), the Surveyor
// (detects; Stake Gun, Jam, Flare), the Claim Barge (Foreclosure, Relocate), the Gantry's flak mode, and the Longshot's Ghillie, Tranq and
// Deep Charge. Fliers use the shared air layer (src/core/air.ts) and fly in first person with W, Space and Ctrl.
import type * as THREE from 'three';
import { V3, R, M, tracerMat } from '../../gfx';
import { sfx } from '../../audio';
import type { Game } from '../../game';
import { TMP, beamMat } from '../../game';
import { UNIT, Unit, Building, isUnit, fac } from '../../data';
import { defineUnits, type Weapon, type Hit } from '../../core/registry';
import { defineAbilities } from '../../core/ability';
import { addStatus, clearStatus, hasStatus } from '../../core/status';
import { hasTag } from '../../core/combat';
import { morph } from '../../core/morph';
import { isEnemy } from '../../core/sides';
import { isHidden, seenBy } from '../../core/sight';
import { load, unload, usedOf, roomOf } from '../../core/cargo';
import { TUNE, Gun, aiGun, driveGun, fair, nearest, within, boost, boosted, mem, mulOf, walkOrder, dist, abilityKeys, gap, type Tgt } from './kit';

const up = (g: Game, u: { team: number }) => g.upOf(u.team);
const bat = (g: Game, u: Unit) => up(g, u).battery ? 50 : 0;

// ---------------------------------------------------------------- guns
const KITE: Gun = { range: 13, cd: 1.3, acc: .9, w: .1, hit: () => 18, snd: v => { if (v > .05) sfx.turret(v); } };
const WALKER: Gun = { range: 8, cd: .7, acc: .8, hit: (_g, _u, t) => isUnit(t) ? 12 : 9 };
const GADFLY: Gun = { range: 7.5, cd: 1.25, acc: .85, w: .1, hit: (_g, _u, t) => isUnit(t) ? 24 : 18, snd: v => { if (v > .05) sfx.turret(v); } };
const STAKE: Gun = { range: 7, cd: .4, acc: .8, hit: () => 8 };
const BARGE: Gun = { range: 10, cd: .25, acc: .85, w: .1, hit: (_g, _u, t) => isUnit(t) && t.air ? 5 : 8, snd: v => { if (v > .05) sfx.turret(v); } };
const FLAK: Gun = { range: 22, cd: .8, acc: .9, w: .12, hit: () => 14, snd: v => { if (v > .05) sfx.cannon(); } };
/** A flak burst up in the air: every enemy flier within `r` of the target takes half again. The ground splash (Game.burst) misses fliers. */
function airBurst(g: Game, u: Unit, t: Unit, dmg: number, r = 2.5) {
  for (const o of within(g, u.team, t.pos.x, t.pos.z, r, 'air')) if (o !== t) g.damage(o, dmg * .5, u);
  g.puff(TMP.set(t.pos.x, UNIT[t.kind].bodyY + (t.alt || 0), t.pos.z), 3, .8, M.smoke, .4, 1);
}

// ---------------------------------------------------------------- Hopper
defineAbilities('hopper', [{
  key: 'afterburn', name: 'Afterburn', hotkey: 'C', energy: 0, cd: TUNE.afterburn.cd, cast: 0, range: 0, target: 'self',
  blurb: `${TUNE.afterburn.t} s of ${Math.round((TUNE.afterburn.pace - 1) * 100)}% more speed.`,
  effect(g, u) { boost(g, u, 'burn', TUNE.afterburn.t); g.puff(TMP.set(u.pos.x, (u.alt || 0) + 1, u.pos.z), 4, .6, M.fire, -.5, .6); if (g.vol(u.pos) > .2) sfx.dash(1); },
  ai: (g, u) => g.time - u.lastHit < 1 && u.hp < u.maxHp * .6 ? { x: u.pos.x, z: u.pos.z } : null,
}, {
  key: 'doors', name: 'Load or unload', hotkey: 'RMB', energy: 0, cd: 1, cast: 0, range: 0, target: 'self',
  blurb: 'Takes in every friend on foot within 4 m, up to 8 beds; with anyone aboard and the Hopper low, lets them all out.',
  can: (g, u) => (u.cargo?.length ? (u.alt || 0) < 4 || !u.air : g.units.some(o => o.alive && o.team === u.team && !o.air && !o.inside && o !== u && dist(o, u) < 5 + UNIT.hopper.rad)),
  effect(g, u) { if (u.cargo?.length) { unload(g, u); sfx.blip(); return; } for (const o of g.units.filter(o => o.alive && o.team === u.team && !o.air && !o.inside && o !== u && o !== g.me && !hasTag(o, 'huge')).sort((a, b) => dist(a, u) - dist(b, u))) { u.alt = Math.min(u.alt || 0, 2); load(g, u, o); } sfx.blip(); },
}]);
/** A bot Hopper flies a drop: it loads soldiers at the rally, flies to the push's goal, and lets them out short of it. */
function aiHopper(g: Game, u: Unit, dt: number) {
  const m = mem(u), o = u.order;
  if (u.cargo?.length) {
    const near = nearest(g, u, 16) || g.buildings.find(b => b.alive && isEnemy(u.team, b.team) && g.distToBox(b, u.pos.x, u.pos.z) < 16);
    if (near || (o.type !== 'amove' && g.time - (m.loadT || 0) > 25)) { u.alt = Math.max(1.5, (u.alt || 0) - dt * 6); if ((u.alt || 0) <= 2.2) unload(g, u); return; }
    if (o.type === 'amove') g.advance(u, dt, 3); return;
  }
  // Empty: pick up the squad's soldiers standing at the rally when a push is called, else trail the squad.
  if (o.type === 'amove' && g.time - (m.loadT || 0) > 30) {
    const riders = g.units.filter(x => x.alive && x.team === u.team && !x.air && !x.inside && !x.pilot && x !== g.me && x.order.type === 'amove' && fac(x.team) === 0 && !hasTag(x, 'huge') && dist(x, u) < 20 && UNIT[x.kind].supply <= 2);
    if (riders.length >= 3) { const r0 = riders[0]; if (dist(u, r0) > 3) { g.moveTo(u, r0.pos.x, r0.pos.z, dt, 2); return; } for (const x of riders) if (usedOf(u) + (UNIT[x.kind].slots ?? UNIT[x.kind].supply) <= roomOf(u)) load(g, u, x); m.loadT = g.time; return; }
  }
  walkOrder(g, u, dt);
}

// ---------------------------------------------------------------- Flak Kite
defineAbilities('flakkite', [{
  key: 'land', name: 'Land', hotkey: 'C', energy: 0, cd: 1, cast: 0, range: 0, target: 'self',
  blurb: `Comes down over ${TUNE.land} s and walks with a short gun that hits the ground.`,
  effect(g, u) { morph(g, u, 'flakwalker', TUNE.land); },
  ai(g, u) { const air = nearest(g, u, 34, o => !!o.air && fair(g, u, o)); if (air) return null; const ground = nearest(g, u, 12, o => !o.air && fair({ ...g } as Game, { ...u, kind: 'flakwalker' } as Unit, o)); return ground && u.order.type !== 'follow' ? { x: u.pos.x, z: u.pos.z } : null; },
}]);
defineAbilities('flakwalker', [{
  key: 'takeoff', name: 'Take off', hotkey: 'C', energy: 0, cd: 1, cast: 0, range: 0, target: 'self',
  blurb: `Takes off again over ${TUNE.land} s; then only fliers can be hit.`,
  effect(g, u) { morph(g, u, 'flakkite', TUNE.land); },
  ai(g, u) { const air = nearest(g, u, 26, o => !!o.air && seenBy(g, u.team, o)); const ground = nearest(g, u, 18, o => !o.air); return air || (!ground && u.order.type === 'amove') ? { x: u.pos.x, z: u.pos.z } : null; },
}]);

// ---------------------------------------------------------------- Gadfly
const cloaked = (u: Unit) => hasStatus(u, 'unseen') && mem(u).smoke;
defineAbilities('gadfly', [{
  key: 'cloak', name: 'Smoke Cloak', hotkey: 'C', energy: TUNE.cloak.energy, cd: 1, cast: 0, range: 0, target: 'self',
  blurb: `Hides in smoke: unseen to anyone without a detector. ${TUNE.cloak.energy} energy, then ${TUNE.cloak.drain} a second. Press again to drop it.`,
  can: (g, u) => !!up(g, u).smoke,
  effect(g, u) { if (cloaked(u)) { clearStatus(u, 'unseen'); mem(u).smoke = false; u.energy = Math.min(u.maxEnergy || 0, (u.energy || 0) + TUNE.cloak.energy); return; } addStatus(u, 'unseen', Infinity); mem(u).smoke = true; g.puff(TMP.set(u.pos.x, (u.alt || 0) + 1, u.pos.z), 6, 1, M.smoke, .2, 1.4); },
  ai: (g, u) => !cloaked(u) && (u.energy || 0) > 60 && u.target && isUnit(u.target) && dist(u, u.target) < 14 ? { x: u.pos.x, z: u.pos.z } : null,
}]);

// ---------------------------------------------------------------- Surveyor and its Stake Gun
const machineFoe = (g: Game, u: Unit, id?: number) => { const o = g.units.find(x => x.id === id); return !!o && isEnemy(u.team, o.team) && (hasTag(o, 'machine') || hasTag(o, 'huge')); };
defineAbilities('surveyor', [{
  key: 'stake', name: 'Stake Gun', hotkey: 'C', energy: TUNE.stake.energy, cd: 2, cast: .5, range: TUNE.stake.range, target: 'point',
  blurb: `Drops a gun turret that fires for ${TUNE.stake.t} s.`,
  effect(g, u, t) { const s = g.spawn('staketurret', u.team, t.x, t.z); mem(s).born = g.time; g.puff(TMP.set(t.x, .4, t.z), 4, .6, M.dust, .5, 1); sfx.clang(); },
  ai(g, u) { const f = nearest(g, u, 10, o => !o.air); return f && (u.energy || 0) >= 100 ? { x: (u.pos.x + f.pos.x) / 2, z: (u.pos.z + f.pos.z) / 2 } : null; },
}, {
  key: 'jam', name: 'Jam', hotkey: 'T', energy: TUNE.jam.energy, cd: 1, cast: 0, range: TUNE.jam.range, target: 'body', who: 'foe',
  blurb: `A machine stops dead for ${TUNE.jam.t} s: no moving, no shooting.`,
  can: (g, u, t) => machineFoe(g, u, t.id),
  effect(g, u, _t, o) { if (!o || !isUnit(o)) return; addStatus(o, 'stun', TUNE.jam.t, undefined, u.id); g.tracer(V3(u.pos.x, (u.alt || 0) + 1, u.pos.z), V3(o.pos.x, UNIT[o.kind].bodyY + (o.alt || 0), o.pos.z), beamMat, .1); },
  ai(g, u) { let best: Unit | null = null, bs = 0; for (const o of g.units) { if (!o.alive || !isEnemy(u.team, o.team) || hasStatus(o, 'stun') || dist(o, u) > TUNE.jam.range || !machineFoe(g, u, o.id) || !seenBy(g, u.team, o)) continue; const s = UNIT[o.kind].cost + (UNIT[o.kind].flux || 0); if (s > bs) { bs = s; best = o; } } return best && bs >= 150 ? { x: best.pos.x, z: best.pos.z, id: best.id } : null; },
}, {
  key: 'flare', name: 'Flare', hotkey: 'Y', energy: TUNE.flare.energy, cd: 1, cast: 1, range: TUNE.flare.range, target: 'area', radius: TUNE.flare.r,
  blurb: `Blinds everyone in a ${TUNE.flare.r} m circle for ${TUNE.flare.t} s: they can only shoot what is right next to them.`,
  effect(g, u, t) { for (const o of within(g, u.team, t.x, t.z, TUNE.flare.r)) { addStatus(o, 'blind' as any, TUNE.flare.t, undefined, u.id); addStatus(o, 'revealed', TUNE.flare.t); } g.pow(V3(t.x, 2, t.z), TUNE.flare.r * 2, 1); g.puff(TMP.set(t.x, 2, t.z), 8, 1.2, M.spark, .2, TUNE.flare.r); },
  ai(g, u) { let best: Unit | null = null, bn = 2; for (const o of g.units) { if (!o.alive || !isEnemy(u.team, o.team) || dist(o, u) > TUNE.flare.range) continue; const n = within(g, u.team, o.pos.x, o.pos.z, TUNE.flare.r).length; if (n > bn) { bn = n; best = o; } } return best ? { x: best.pos.x, z: best.pos.z } : null; },
}]);
/** Starts a warn ring when a caster begins a splash spell, so the foe sees it at least a second before it lands. */
/** A bot Surveyor keeps behind the squad, close enough that its detector covers the front. */
function aiSurveyor(g: Game, u: Unit, dt: number) {
  const hid = g.units.find(o => o.alive && isEnemy(u.team, o.team) && isHidden(o) && dist(o, u) < 30);
  if (hid) { if (dist(u, hid) > 8) g.moveTo(u, hid.pos.x, hid.pos.z, dt, 6); return; }
  const f = nearest(g, u, 9); if (f) { const dx = u.pos.x - f.pos.x, dz = u.pos.z - f.pos.z, l = Math.hypot(dx, dz) || 1; g.moveTo(u, u.pos.x + dx / l * 4, u.pos.z + dz / l * 4, dt, .3); return; }
  walkOrder(g, u, dt);
}

// ---------------------------------------------------------------- Claim Barge
const sideSees = (g: Game, team: number, x: number, z: number) => g.units.some(o => o.alive && o.team === team && Math.hypot(o.pos.x - x, o.pos.z - z) < 24) || g.buildings.some(b => b.alive && b.team === team && Math.hypot(b.pos.x - x, b.pos.z - z) < 26);
defineAbilities('claimbarge', [{
  key: 'foreclose', name: 'Foreclosure', hotkey: 'C', energy: TUNE.foreclose.energy, cd: 2, cast: TUNE.foreclose.cast, range: TUNE.foreclose.range, target: 'body', who: 'foe',
  blurb: `Charges for ${TUNE.foreclose.cast} s, then one shell for ${TUNE.foreclose.dmg} damage.`,
  can: (g, u) => !!up(g, u).foreclose,
  effect(g, u, _t, o) { if (!o || !o.alive) return; const a = V3(u.pos.x, (u.alt || 0) + 2.6, u.pos.z), b = V3(o.pos.x, isUnit(o) ? UNIT[o.kind].bodyY + (o.alt || 0) : 2, o.pos.z); g.tracer(a, b, beamMat, .5); g.damage(o, TUNE.foreclose.dmg * mulOf(g, u), u); g.explode(b, u.team, 0, 2.5, u); sfx.boom(g.vol(o.pos)); },
  ai(g, u) { let best: Tgt | null = null, bs = 199; for (const o of [...g.units, ...g.buildings] as Tgt[]) { if (!o.alive || !isEnemy(u.team, o.team) || gap(g, u, o) > TUNE.foreclose.range || !fair(g, { ...u, kind: 'linesman' } as Unit, o)) continue; const s = isUnit(o) ? o.hp + (UNIT[o.kind].flux || 0) : (o as Building).hp > 400 && (o as Building).hp < 700 ? 400 : 0; if (s > bs) { bs = s; best = o; } } return best ? { x: best.pos.x, z: best.pos.z, id: best.id } : null; },
}, {
  key: 'relocate', name: 'Relocate', hotkey: 'T', energy: 0, cd: TUNE.relocate.cd, cast: TUNE.relocate.cast, range: 9999, target: 'point',
  blurb: `Jumps after ${TUNE.relocate.cast} s to any spot your side can see.`,
  can: (g, u, t) => !!up(g, u).relocate && sideSees(g, u.team, t.x, t.z),
  effect(g, u, t) { g.puff(TMP.set(u.pos.x, (u.alt || 0) + 2, u.pos.z), 8, 1.4, M.smoke, .5, 2); u.pos.x = t.x; u.pos.z = t.z; u.obj.position.x = t.x; u.obj.position.z = t.z; g.puff(TMP.set(t.x, (u.alt || 0) + 2, t.z), 8, 1.4, M.spark, .5, 2); u.order = { type: 'guard', x: t.x, z: t.z }; },
  ai(g, u) { if (u.hp > u.maxHp * .3 || g.time - u.lastHit > 2) return null; const hq = g.hqs(u.team)[0]; return hq ? { x: hq.pos.x, z: hq.pos.z + hq.hz + 6 } : null; },
}]);

// ---------------------------------------------------------------- Gantry flak mode
defineAbilities('gantry', [{
  key: 'flak', name: 'Flak mode', hotkey: 'T', energy: 0, cd: 1, cast: 0, range: 0, target: 'self',
  blurb: `Swaps the cannons over ${TUNE.flakSwitch} s for bursting shells that only reach the air.`,
  effect(g, u) { morph(g, u, 'gantryflak', TUNE.flakSwitch); sfx.clang(); },
  ai(g, u) { const air = nearest(g, u, 26, o => !!o.air && seenBy(g, u.team, o)); const ground = nearest(g, u, 14, o => !o.air); return air && !ground && within(g, u.team, air.pos.x, air.pos.z, 12, 'air').length >= 2 ? { x: u.pos.x, z: u.pos.z } : null; },
}]);
defineAbilities('gantryflak', [{
  key: 'ground', name: 'Cannon mode', hotkey: 'T', energy: 0, cd: 1, cast: 0, range: 0, target: 'self',
  blurb: `Back to the ground cannons over ${TUNE.flakSwitch} s.`,
  effect(g, u) { morph(g, u, 'gantry', TUNE.flakSwitch); sfx.clang(); },
  ai(g, u) { const air = nearest(g, u, 30, o => !!o.air && seenBy(g, u.team, o)); return !air ? { x: u.pos.x, z: u.pos.z } : null; },
}]);

// ---------------------------------------------------------------- Longshot
const ghillied = (u: Unit) => hasStatus(u, 'unseen') && mem(u).ghillie;
/** A side's Signal Mast holding a finished Deep Charge, if any. */
export const chargeAt = (g: Game, team: number) => g.buildings.find(b => b.alive && b.built && b.team === team && b.kind === 'mast' && (mem(b).charges || 0) > 0) || null;
defineAbilities('longshot', [{
  key: 'ghillie', name: 'Ghillie', hotkey: 'C', energy: TUNE.ghillie.energy, cd: 1, cast: 0, range: 0, target: 'self',
  blurb: `Unseen to anyone without a detector. ${TUNE.ghillie.energy} energy, then ${TUNE.ghillie.drain} a second. Press again to drop it.`,
  can: (g, u) => !!up(g, u).ghillie,
  effect(g, u) { if (ghillied(u)) { clearStatus(u, 'unseen'); mem(u).ghillie = false; return; } addStatus(u, 'unseen', Infinity); mem(u).ghillie = true; },
  ai: (g, u) => !ghillied(u) && (u.energy || 0) > 50 && (g.time - u.lastHit < 2 || (u.target && isUnit(u.target) && dist(u, u.target) < 30)) ? { x: u.pos.x, z: u.pos.z } : null,
}, {
  key: 'tranq', name: 'Tranq', hotkey: 'T', energy: TUNE.tranq.energy, cd: 1, cast: 1, range: TUNE.tranq.range, target: 'area', radius: TUNE.tranq.r,
  blurb: `A dart that bursts in a ${TUNE.tranq.r} m circle: everyone there loses ${TUNE.tranq.burn} energy and all their shields.`,
  effect(g, u, t) { for (const o of within(g, u.team, t.x, t.z, TUNE.tranq.r)) { if (o.energy) o.energy = Math.max(0, o.energy - TUNE.tranq.burn); if (o.shield > 0) { o.shield = 0; g.bubble(o); } } g.puff(TMP.set(t.x, 1, t.z), 8, .8, M.teal, .5, TUNE.tranq.r); sfx.blast(g.vol(V3(t.x, 0, t.z)) * .5); },
  ai(g, u) { let best: Unit | null = null, bs = 99; for (const o of g.units) { if (!o.alive || !isEnemy(u.team, o.team) || dist(o, u) > TUNE.tranq.range) continue; const s = within(g, u.team, o.pos.x, o.pos.z, TUNE.tranq.r).reduce((a, x) => a + x.shield + (x.energy || 0) * .8, 0); if (s > bs) { bs = s; best = o; } } return best ? { x: best.pos.x, z: best.pos.z } : null; },
}, {
  key: 'deep', name: 'Deep Charge', hotkey: 'Y', energy: 0, cd: 5, cast: TUNE.deep.cast, range: TUNE.deep.range, target: 'point',
  blurb: `Calls down a Deep Charge from a Signal Mast. The Longshot holds the mark ${TUNE.deep.cast} s, a red ring shows on the ground, then ${TUNE.deep.dmg} damage in ${TUNE.deep.r} m.`,
  can: (g, u) => !!chargeAt(g, u.team),
  effect(g, u, t) {
    const s = mem(u).deep; mem(u).deep = null; if (!s) return;
    g.explode(V3(t.x, .5, t.z), u.team, TUNE.deep.dmg * .55, TUNE.deep.r, u); for (const b of g.buildings) if (b.alive && isEnemy(u.team, b.team) && g.distToBox(b, t.x, t.z) < TUNE.deep.r) g.damage(b, TUNE.deep.dmg * 1.5, u);
    g.pipe.flash = Math.max(g.pipe.flash, g.vol(V3(t.x, 0, t.z))); sfx.boom(1);
  },
  ai(g, u) { if (!chargeAt(g, u.team) || hasStatus(u, 'unseen') === false && nearest(g, u, 10)) return null; let best: Building | null = null; for (const b of g.buildings) if (b.alive && isEnemy(u.team, b.team) && g.distToBox(b, u.pos.x, u.pos.z) < TUNE.deep.range && (!best || g.isHQ(b))) best = b; return best ? { x: best.pos.x, z: best.pos.z } : null; },
}]);
/** When a Longshot starts a Deep Charge: the Mast's charge is used up, and a red ring marks the spot for the whole wind-up. */
export function tickCasts(g: Game) {
  for (const u of g.units) {
    if (!u.alive || fac(u.team) !== 0 || !u.cast) continue; const m = mem(u);
    if (u.cast.key === 'deep' && !m.deep) { const b = chargeAt(g, u.team); if (!b) { u.cast = null; continue; } mem(b).charges--; m.deep = { x: u.cast.x, z: u.cast.z }; g.warn(u.cast.x, u.cast.z, TUNE.deep.r, TUNE.deep.cast); g.feed('Signal Mast', 'Deep Charge on its way. Clear out of the red ring.', 'al', -1); }
    if ((u.cast.key === 'flare' || u.cast.key === 'tranq') && !m.warned) { m.warned = true; g.warn(u.cast.x, u.cast.z, u.cast.key === 'flare' ? TUNE.flare.r : TUNE.tranq.r, Math.max(1, u.cast.t)); }
  }
  for (const u of g.units) if (u.alive && !u.cast) { const m = mem(u); m.warned = false; if (m.deep && fac(u.team) === 0) m.deep = null; }
}
/** Energy drains while cloaked; at zero the cloak drops. Stake Gun turrets fall over after their time. */
export function tickAir(g: Game, dt: number) {
  for (const u of g.units) {
    if (!u.alive || fac(u.team) !== 0) continue;
    if (cloaked(u) || ghillied(u)) { u.energy = (u.energy || 0) - (u.kind === 'longshot' ? TUNE.ghillie.drain : TUNE.cloak.drain) * dt; if (u.energy <= 0) { u.energy = 0; clearStatus(u, 'unseen'); mem(u).smoke = mem(u).ghillie = false; } }
    if (u.kind === 'staketurret' && g.time - (mem(u).born ?? g.time) > TUNE.stake.t) g.damage(u, 1e4, null);
    if (u.maxEnergy && bat(g, u) && !mem(u).bat) { mem(u).bat = true; u.maxEnergy += bat(g, u); u.energy = (u.energy || 0) + 25; }
  }
}

// ---------------------------------------------------------------- first person and registration
const W: Record<string, Weapon> = {
  flakkite: { name: 'Sky Rockets', mag: 8, cd: KITE.cd * .6, reload: 2.4 }, flakwalker: { name: 'Short Gun', mag: 20, cd: WALKER.cd * .5, reload: 1.8 },
  gadfly: { name: 'Twin Guns', mag: 10, cd: GADFLY.cd * .6, reload: 2.2 }, claimbarge: { name: 'Gun Decks', mag: 40, cd: BARGE.cd, reload: 2.5 },
  gantryflak: { name: 'Flak Shells', mag: 10, cd: FLAK.cd * .7, reload: 2.4 }, staketurret: { name: 'Stake Gun', mag: 30, cd: STAKE.cd, reload: 2 },
};
const flier = (gun: Gun) => (g: Game, dt: number, P: Set<string>, e: THREE.Vector3, d: THREE.Vector3, l: Hit | null, w: Weapon | null) => driveGun(g, dt, P, e, d, l, w, gun, { spread: .02, shake: .2, tracer: .1 });
defineUnits({
  hopper: { ai: aiHopper, step: 0, hop: 0, threat: .9, skipRespawn: true, drive: (g, _dt, P, e, d, l) => abilityKeys(g, P, e, d, l), task: (_g, u) => u.cargo?.length ? `Carrying ${u.cargo.length}` : 'Waiting for riders' },
  flakkite: { gun: W.flakkite, ai: (g, u, dt) => { const t = aiGun(g, u, dt, KITE, 34); if (t && isUnit(t) && u.cd > KITE.cd * .8) airBurst(g, u, t, 0, 0); }, step: 0, hop: 0, threat: 1.1, drive: flier(KITE) },
  flakwalker: { gun: W.flakwalker, ai: (g, u, dt) => { aiGun(g, u, dt, WALKER); }, step: 2, hop: 12, drive: (g, dt, P, e, d, l, w) => driveGun(g, dt, P, e, d, l, w, WALKER) },
  gadfly: { gun: W.gadfly, ai: (g, u, dt) => { aiGun(g, u, dt, GADFLY, 24); }, step: 0, hop: 0, threat: 1.3, drive: flier(GADFLY) },
  surveyor: { ai: aiSurveyor, step: 0, hop: 0, threat: 1.2, skipRespawn: true, drive: (g, _dt, P, e, d, l) => abilityKeys(g, P, e, d, l), task: () => 'Watching for hidden bodies' },
  staketurret: { gun: W.staketurret, ai: (g, u, dt) => { aiGun(g, u, dt, STAKE, STAKE.range + 1, STAKE.range); }, skipRespawn: true, steady: true, threat: .8, drive: (g, dt, P, e, d, l, w) => driveGun(g, dt, P, e, d, l, w, STAKE) },
  claimbarge: { gun: W.claimbarge, ai: (g, u, dt) => { aiGun(g, u, dt, BARGE, 22); }, heavy: true, steady: true, step: 0, hop: 0, threat: 1.5, skipRespawn: true, drive: (g, dt, P, e, d, l, w) => driveGun(g, dt, P, e, d, l, w, BARGE, { spread: .03, shake: .1 }) },
  gantryflak: { gun: W.gantryflak, ai: (g, u, dt) => { const t = aiGun(g, u, dt, FLAK, 30); if (t && isUnit(t) && u.cd > FLAK.cd * .85) airBurst(g, u, t, FLAK.hit(g, u, t) * mulOf(g, u)); }, steady: true, step: 2, hop: 11, stride: 6.5, threat: 1.2, drive: (g, dt, P, e, d, l, w) => driveGun(g, dt, P, e, d, l, w, FLAK, { shake: .3, tracer: .14 }) },
});
export { R, tracerMat };
