// Every Gloam ability, through the engine's ability system (src/core/ability.ts): a key in first person, a button on the command card, and a
// hook the bots use. The numbers are in numbers.ts (G2). Splash abilities show a mark on the ground before they land (the plan's rule).
import * as THREE from 'three';
import { V3, R, M } from '../../gfx';
import { sfx } from '../../audio';
import { isEnemy } from '../../core/sides';
import type { Game } from '../../game';
import { UNIT, BLD, Unit, Building, Kind, isUnit, fac } from '../../data';
import { defineAbilities, bodyOf, type AbilityDef, type Target } from '../../core/ability';
import { addStatus } from '../../core/status';
import { morph } from '../../core/morph';
import { costOf, canPay, pay } from '../../core/econ';
import { load, unload, usedOf } from '../../core/cargo';
import { G2, G_TUNE, G_RIPEN, G_DIGS, type GKind } from './numbers';
import { gMul, isCap, dist, bileMat, nearestFoeAt, giveLife, act, byId } from './kit';
import { MEND, addCloud, isDug, setDug, canDig } from './roster';

const TMP = V3();
// ---------------------------------------------------------------- delayed blasts (Bile Lob, Choke Spores)
type Fuse = { x: number; z: number; t: number; team: number; by: Unit; kind: 'bile' | 'choke' };
export const FUSES: Fuse[] = [];
export function tickFuses(g: Game, dt: number) {
  for (let i = FUSES.length - 1; i >= 0; i--) {
    const f = FUSES[i]; f.t -= dt; if (f.t > 0) continue; FUSES.splice(i, 1);
    if (f.kind === 'bile') {
      const L = G2.lobber.lob, dmg = L.dmg * gMul(g, f.team, 'lobber');
      for (const o of g.units) if (o.alive && isEnemy(o.team, f.team) && !o.inside && !o.air && Math.hypot(o.pos.x - f.x, o.pos.z - f.z) < L.r + UNIT[o.kind].rad * .5) g.damage(o, dmg, f.by.alive ? f.by : null);
      for (const b of g.buildings) if (b.alive && isEnemy(b.team, f.team) && g.distToBox(b, f.x, f.z) < L.r * .6) g.damage(b, dmg, f.by.alive ? f.by : null);
      g.puff(TMP.set(f.x, .4, f.z), 6, 1.2, M.gS, .8, 1.6); g.fx.blastAt?.(TMP.set(f.x, .3, f.z), L.r); if (g.vol(TMP) > .1) sfx.boom(g.vol(TMP) * .6);
    } else {
      const C = G2.smother.choke;
      for (const o of g.units) if (o.alive && isEnemy(o.team, f.team) && !o.inside && !o.air && Math.hypot(o.pos.x - f.x, o.pos.z - f.z) < C.r + UNIT[o.kind].rad * .5) { addStatus(o, 'root', C.root); addStatus(o, 'burning', C.t, C.dmg / C.t * gMul(g, f.team, 'smother'), f.by.id); }
      g.puff(TMP.set(f.x, .5, f.z), 8, 1.4, M.gS, .3, 2.2, 1.6); if (g.vol(TMP) > .1) sfx.scatter();
    }
  }
}
const fuse = (g: Game, u: Unit, t: Target, kind: Fuse['kind'], secs: number, r: number) => { g.warn(t.x, t.z, r, secs); FUSES.push({ x: t.x, z: t.z, t: secs, team: u.team, by: u, kind }); };

// ---------------------------------------------------------------- bots: where to aim
/** The enemy spot within `range` of `u` with the most enemy bodies inside `r` of it (at least `min`), as a target. */
function clump(g: Game, u: Unit, range: number, r: number, min: number, test?: (o: Unit) => boolean): Target | null {
  const near = g.units.filter(o => o.alive && isEnemy(o.team, u.team) && !o.inside && !o.air && dist(o, u) < range + r && (!test || test(o)) && !isDug(o));
  let best: Target | null = null, bn = min - 1;
  for (const o of near) { let n = 0, sx = 0, sz = 0; for (const p of near) if (Math.hypot(p.pos.x - o.pos.x, p.pos.z - o.pos.z) < r) { n++; sx += p.pos.x; sz += p.pos.z; } if (n > bn) { const cx = sx / n, cz = sz / n; if (Math.hypot(cx - u.pos.x, cz - u.pos.z) <= range) { bn = n; best = { x: cx, z: cz }; } } }
  return best;
}
const foeBody = (g: Game, u: Unit, range: number, test: (o: Unit) => boolean): Unit | null => { let best: Unit | null = null, bs = -1; for (const o of g.units) { if (!o.alive || !isEnemy(o.team, u.team) || o.inside || isDug(o) || dist(o, u) > range || !test(o)) continue; const s = UNIT[o.kind].cost + (UNIT[o.kind].flux || 0); if (s > bs) { bs = s; best = o; } } return best; };
const busyFight = (g: Game, u: Unit, r = 20) => !!nearestFoeAt(g, u.team, u.pos.x, u.pos.z, r);

// ---------------------------------------------------------------- the abilities
const caps = (g: Game, team: number) => g.buildings.filter(b => b.alive && b.built && b.team === team && isCap(b));
const budMax = (g: Game, b: Building) => g.upOf(b.team).gfat ? G_TUNE.fatBuds : G_TUNE.buds;
/** Seed Cap: a Keeper plants seeds on one of its Caps; 20 s later the Cap has 3 more Buds, over its usual count. */
const seedCap: AbilityDef = {
  key: 'seed', name: 'Seed Cap', hotkey: 'Mouse2', energy: G2.keeper.seed.energy, cd: 1, cast: .6, range: G2.keeper.seed.range + 6, target: 'body', who: 'ally',
  blurb: 'Seeds a Mother Cap: 20 s later it has 3 more Buds than it can grow by itself.',
  can: (g, _u, t) => { const b = g.buildings.find(x => x.id === t.id); return !!b && isCap(b) && b.built && !((b as any).seedT > 0); },
  effect: (g, u, _t, tgt) => { const b = tgt as Building; (b as any).seedT = G2.keeper.seed.t; g.puff(TMP.set(b.pos.x, b.h * .6, b.pos.z), 6, 1, M.gS, .5, 2); u.swing = 1; if (g.vol(b.pos) > .2) sfx.blip(); },
  ai: (g, u) => { if (busyFight(g, u, 10)) return null; const b = caps(g, u.team).filter(c => !((c as any).seedT > 0) && (c.buds || 0) <= budMax(g, c)).sort((a, c) => dist(a, u) - dist(c, u))[0]; return b && g.distToBox(b, u.pos.x, u.pos.z) < G2.keeper.seed.range ? { x: b.pos.x, z: b.pos.z, id: b.id } : null; },
};
/** Spore Pod: a Keeper plants a pod on its own Bloom. The pod grows Bloom of its own, and can plant one more pod once (actions.ts). */
const sporePod: AbilityDef = {
  key: 'pod', name: 'Spore Pod', hotkey: 'KeyE', energy: G2.keeper.pod.energy, cd: 1, cast: .8, range: G2.keeper.pod.range, target: 'point',
  blurb: 'Plants a Spore Pod on your Bloom: it spreads Bloom 10 m round it and can plant one more pod further on.',
  can: (g, u, t) => g.carpet.on(t.x, t.z, 0, u.team) && podRoom(g, t.x, t.z),
  effect: (g, u, t) => { const b = g.addBuilding('sporepod', u.team, Math.round(t.x), Math.round(t.z), false); (b as any).hops = 1; u.swing = 1; if (g.vol(b.pos) > .2) sfx.place(); },
  ai: (g, u) => {
    if (busyFight(g, u, 14) || (u.energy ?? 0) < G2.keeper.seed.energy + G2.keeper.pod.energy) return null;
    const home = caps(g, u.team).sort((a, b) => dist(a, u) - dist(b, u))[0]; if (!home) return null;
    const pods = g.buildings.filter(b => b.alive && b.team === u.team && b.kind === 'sporepod' && Math.hypot(b.pos.x - home.pos.x, b.pos.z - home.pos.z) < 45).length; if (pods >= 3) return null;
    for (let i = 0; i < 10; i++) { const a = R(0, 6.283), r = R(4, G2.keeper.pod.range - .5), x = u.pos.x + Math.cos(a) * r, z = u.pos.z + Math.sin(a) * r; if (Math.hypot(x - home.pos.x, z - home.pos.z) > 14 && g.carpet.on(x, z, 0, u.team) && podRoom(g, x, z)) return { x, z }; }
    return null;
  },
};
export function podRoom(g: Game, x: number, z: number) {
  for (const b of g.buildings) if (b.alive && Math.abs(x - b.pos.x) < b.hx + 1.6 && Math.abs(z - b.pos.z) < b.hz + 1.6) return false;
  for (const o of g.ores) if (o.amount > 0 && Math.hypot(x - o.pos.x, z - o.pos.z) < 3.2) return false;
  for (const v of g.vents) if (Math.hypot(x - v.pos.x, z - v.pos.z) < 3) return false;
  for (const s of g.spires) if (Math.hypot(x - s.x, z - s.z) < s.r + 1) return false;
  return true;
}
/** Mend: 75 health at once on one friend, and 50 more over 12 s. */
const mend: AbilityDef = {
  key: 'mend', name: 'Mend', hotkey: 'KeyC', energy: G2.keeper.mend.energy, cd: 1, cast: 0, range: G2.keeper.mend.range, target: 'body', who: 'ally', autocast: true,
  blurb: 'Heals a friend 75 at once and 50 more over 12 seconds.',
  can: (g, _u, t) => { const o = (bodyOf(g, t.id) as Unit | null); return !!o && o.hp < o.maxHp; },
  effect: (g, u, _t, tgt) => { const o = tgt as Unit; if (!isUnit(o)) return; const M2 = G2.keeper.mend; act(u, 'mend'); o.hp = Math.min(o.maxHp, o.hp + M2.now); MEND.set(o.id, [M2.over, M2.over / M2.t]); g.tracer(V3(u.pos.x, 1.6, u.pos.z), V3(o.pos.x, UNIT[o.kind].bodyY + (o.alt || 0), o.pos.z), bileMat, .1); g.puff(TMP.set(o.pos.x, 1, o.pos.z), 3, .6, M.gS, .6); if (g.vol(o.pos) > .2) sfx.blip(); },
  ai: (g, u) => { let best: Unit | null = null, bl = 74; for (const o of g.units) { if (!o.alive || o.team !== u.team || o === u && false || dist(o, u) > G2.keeper.mend.range || !UNIT[o.kind].cost) continue; const lost = o.maxHp - o.hp; if (lost > bl) { bl = lost; best = o; } } return best ? { x: best.pos.x, z: best.pos.z, id: best.id } : null; },
};
/** Bile Lob: a blob of bile lands on a spot after 2.5 s (a mark shows where), 60 to everything there. Breaks set-up guns and glass walls. */
const bileLob: AbilityDef = {
  key: 'bile', name: 'Bile Lob', hotkey: 'Mouse2', energy: 0, cd: G2.lobber.lob.cd, cast: .25, range: G2.lobber.lob.range, target: 'point',
  blurb: 'Lobs bile at a spot. A mark shows where; 2.5 s later everything there takes 60.',
  effect: (g, u, t) => { fuse(g, u, t, 'bile', G2.lobber.lob.fuse, G2.lobber.lob.r); g.tracer(V3(u.pos.x, 1.8, u.pos.z), V3(t.x, 4, t.z), bileMat, .14); u.swing = 1; if (g.vol(u.pos) > .1) sfx.throw(); },
  ai: (g, u) => {
    const L = G2.lobber.lob; let best: Target | null = null, bs = 0;
    // A body that cannot move (set up, rooted, digging) or a building is the surest hit; otherwise a knot of at least two.
    for (const o of g.units) { if (!o.alive || !isEnemy(o.team, u.team) || o.air || o.inside || isDug(o) || dist(o, u) > L.range) continue; const still = o.speed === 0 || o.status?.some(s => s.k === 'root' || s.k === 'stun') ? 3 : 0; if (still > bs) { bs = still; best = { x: o.pos.x, z: o.pos.z }; } }
    if (best) return best;
    return clump(g, u, L.range, L.r, 2) || (() => { const b = g.buildings.find(b => b.alive && isEnemy(b.team, u.team) && g.distToBox(b, u.pos.x, u.pos.z) < L.range - 1); return b ? { x: b.pos.x, z: b.pos.z } : null; })();
  },
};
/** Choke Spores: a cloud bursts on a spot after 1 s (a mark shows where): everything there is rooted for 4 s and takes 30 over 3 s. */
const choke: AbilityDef = {
  key: 'choke', name: 'Choke Spores', hotkey: 'Mouse2', energy: G2.smother.choke.energy, cd: 1, cast: .3, range: G2.smother.choke.range, target: 'area', radius: G2.smother.choke.r,
  blurb: 'A cloud bursts on a spot 1 s after a mark shows: everything there is held in place for 4 s and takes 30.',
  effect: (g, u, t) => { fuse(g, u, t, 'choke', G2.smother.choke.fuse, G2.smother.choke.r); u.swing = 1; if (g.vol(u.pos) > .1) sfx.throw(); },
  ai: (g, u) => clump(g, u, G2.smother.choke.range, G2.smother.choke.r, 3),
};
/** Rot Mind: a Smother takes over one enemy body for 12 s (16 with Deep Rot). Not a huge one, and not one a player drives. */
const rotMind: AbilityDef = {
  key: 'mind', name: 'Rot Mind', hotkey: 'KeyE', energy: G2.smother.mind.energy, cd: 1, cast: .5, range: G2.smother.mind.range, target: 'body', who: 'foe',
  blurb: 'Takes over one enemy body for 12 seconds: it fights for you. Not a huge body, and not one a player is driving.',
  can: (g, _u, t) => { const o = (bodyOf(g, t.id) as Unit | null); return !!o && !o.pilot && o !== g.me && !UNIT[o.kind].tags?.includes('huge') && !(o as any).rot; },
  effect: (g, u, _t, tgt) => { const o = tgt as Unit; if (!isUnit(o)) return; const secs = g.upOf(u.team).grot ? G2.smother.mind.deep : G2.smother.mind.t; borrow(g, o, u.team, secs); g.tracer(V3(u.pos.x, 1.4, u.pos.z), V3(o.pos.x, UNIT[o.kind].headY + (o.alt || 0), o.pos.z), bileMat, .12); },
  ai: (g, u) => { const o = foeBody(g, u, G2.smother.mind.range, o => !o.pilot && o !== g.me && !UNIT[o.kind].tags?.includes('huge') && !(o as any).rot && UNIT[o.kind].cost >= 100); return o ? { x: o.pos.x, z: o.pos.z, id: o.id } : null; },
};
/** Borrowed bodies: who they belong to and the seconds left. The body changes sides for that long, then goes home. */
export const BORROWED = new Map<number, { team: number; t: number }>();
export function borrow(g: Game, o: Unit, team: number, secs: number) {
  BORROWED.set(o.id, { team: o.team, t: secs }); (o as any).rot = true; o.team = team; o.target = null; o.order = { type: 'amove', x: o.pos.x, z: o.pos.z }; addStatus(o, 'borrowed', secs);
  g.puff(TMP.set(o.pos.x, UNIT[o.kind].headY, o.pos.z), 4, .6, M.gS, .4); if (g.vol(o.pos) > .1) sfx.callout();
}
export function tickBorrowed(g: Game, dt: number) {
  for (const [id, b] of BORROWED) { const o = byId(g, id); if (!o || !o.alive) { BORROWED.delete(id); continue; } b.t -= dt; if (b.t > 0) continue; BORROWED.delete(id); o.team = b.team; (o as any).rot = false; o.target = null; o.order = { type: 'guard', x: o.pos.x, z: o.pos.z }; }
}
/** Fling Husks: a Seeder throws two Husks at a spot; they walk at the foe and wither after 18 s. Works dug in. */
const fling: AbilityDef = {
  key: 'fling', name: 'Fling Husks', hotkey: 'Mouse2', energy: 0, cd: G2.seeder.cd, cast: .4, range: G2.seeder.range, target: 'point',
  blurb: 'Throws two Husks that walk at the foe and bite for 18 seconds. Works while dug in.',
  effect: (g, u, t) => {
    const S = G2.seeder; for (let i = 0; i < S.n; i++) {
      const h = g.spawn('husk', u.team, u.pos.x + R(-1.2, 1.2), u.pos.z + R(-1.2, 1.2)); giveLife(h, S.life); h.order = { type: 'amove', x: t.x + R(-2, 2), z: t.z + R(-2, 2) };
      if (g.upOf(u.team).gwings) { h.air = true; h.alt = 4; (h as any).flyT = S.fly; }
    }
    u.swing = 1; g.puff(TMP.set(u.pos.x, .8, u.pos.z), 4, .8, M.gS, .8); if (g.vol(u.pos) > .1) sfx.throw();
  },
  ai: (g, u) => { const t = u.target && u.target.alive ? u.target : g.acquire(u, G2.seeder.range, 0); return t && dist(t as Unit, u) < G2.seeder.range ? { x: t.pos.x, z: t.pos.z } : null; },
};
/** Reel: a Hooksail pulls one body 9 m toward itself. */
const reel: AbilityDef = {
  key: 'reel', name: 'Reel', hotkey: 'Mouse2', energy: G2.hooksail.reel.energy, cd: 1, cast: .3, range: G2.hooksail.reel.range, target: 'body', who: 'foe',
  blurb: 'Hooks one enemy body and pulls it 9 m toward you.',
  can: (g, _u, t) => { const o = (bodyOf(g, t.id) as Unit | null); return !!o; },
  effect: (g, u, _t, tgt) => { const o = tgt as Unit; if (!isUnit(o)) return; const dx = u.pos.x - o.pos.x, dz = u.pos.z - o.pos.z, d = Math.hypot(dx, dz) || 1, pull = Math.min(G2.hooksail.reel.pull, Math.max(0, d - 2)); o.kx += dx / d * pull * 7; o.kz += dz / d * pull * 7; o.target = null; g.tracer(V3(u.pos.x, (u.alt || 0) + .8, u.pos.z), V3(o.pos.x, UNIT[o.kind].bodyY + (o.alt || 0), o.pos.z), bileMat, .06); if (g.vol(o.pos) > .1) sfx.clang(); },
  ai: (g, u) => { const o = foeBody(g, u, G2.hooksail.reel.range, o => UNIT[o.kind].cost + (UNIT[o.kind].flux || 0) >= 200 || (o.speed === 0)); return o ? { x: o.pos.x, z: o.pos.z, id: o.id } : null; },
};
/** Spore Cloud: a cloud 4 m wide for 8 s. Enemy bodies inside it cannot land a hit from more than a step away. */
const cloud: AbilityDef = {
  key: 'cloud', name: 'Spore Cloud', hotkey: 'KeyE', energy: G2.hooksail.cloud.energy, cd: 1, cast: .3, range: G2.hooksail.cloud.range, target: 'area', radius: G2.hooksail.cloud.r,
  blurb: 'A cloud of spores for 8 seconds: enemy bodies inside it cannot hit anything more than a step away.',
  effect: (g, u, t) => { addCloud(g, t.x, t.z, u.team); g.evq?.push(['gc', Math.round(t.x * 10) / 10, Math.round(t.z * 10) / 10, u.team]); if (g.vol(u.pos) > .1) sfx.scatter(); },
  ai: (g, u) => clump(g, u, G2.hooksail.cloud.range, G2.hooksail.cloud.r, 3, o => !G_DIGS.includes(o.kind as GKind)),
};
/** Drink: a Hooksail drinks 200 health from one of its own buildings for 50 energy. */
const drink: AbilityDef = {
  key: 'drink', name: 'Drink', hotkey: 'KeyC', energy: 0, cd: 2, cast: 1, range: G2.hooksail.drink.range + 4, target: 'body', who: 'ally',
  blurb: 'Drinks 200 health out of one of your own buildings to gain 50 energy.',
  can: (g, u, t) => { const b = g.buildings.find(x => x.id === t.id); return !!b && b.built && b.hp > G2.hooksail.drink.hp + 50 && (u.energy ?? 0) < (u.maxEnergy ?? 200); },
  effect: (g, u, _t, tgt) => { const b = tgt as Building; b.hp -= G2.hooksail.drink.hp; b.lastHit = g.time; u.energy = Math.min(u.maxEnergy ?? 200, (u.energy ?? 0) + G2.hooksail.drink.energy); g.tracer(V3(b.pos.x, b.h * .7, b.pos.z), V3(u.pos.x, (u.alt || 0) + .8, u.pos.z), bileMat, .1); },
  ai: (g, u) => { if ((u.energy ?? 0) > 120) return null; const b = g.buildings.find(b => b.alive && b.built && b.team === u.team && b.hp > 700 && g.distToBox(b, u.pos.x, u.pos.z) < G2.hooksail.drink.range); return b ? { x: b.pos.x, z: b.pos.z, id: b.id } : null; },
};
/** Ripening: a body turns into its next kind where it stands, paying the difference (numbers.ts G_RIPEN). */
export const ripenSecs = (to: GKind) => UNIT[to].time;
export function ripenWhy(g: Game, u: Unit): string {
  const r = G_RIPEN[u.kind as GKind]; if (!r) return 'nothing to ripen into';
  if (r.research && !g.upOf(u.team)[r.research]) return 'research';
  if (!g.ownB(r.at, true, u.team).length) return 'building';
  const c = ripeCost(u.kind as GKind); if (!canPay(g, u.team, c)) return 'cost';
  if (g.supplyUsed(u.team) + UNIT[r.to].supply - UNIT[u.kind].supply > g.supplyCap(u.team)) return 'beds';
  return '';
}
export const ripeCost = (k: GKind): [number, number] => { const r = G_RIPEN[k]!, a = costOf(r.to), b = costOf(k); return [Math.max(0, a[0] - b[0]), Math.max(0, a[1] - b[1])]; };
export function ripen(g: Game, u: Unit) { const r = G_RIPEN[u.kind as GKind]; if (!r || ripenWhy(g, u)) return false; pay(g, u.team, ripeCost(u.kind as GKind)); if (isDug(u)) setDug(g, u, false); g.puff(TMP.set(u.pos.x, 1, u.pos.z), 5, 1, M.gS, .4, 1.4); return morph(g, u, r.to, ripenSecs(r.to)); }
const ripenAb = (k: GKind): AbilityDef => { const r = G_RIPEN[k]!, c = ripeCost(k); return {
  key: 'ripen', name: `Ripen into ${UNIT[r.to].name}`, hotkey: 'KeyR', energy: 0, cd: 1, cast: 0, range: 0, target: 'self',
  blurb: `Turns into a ${UNIT[r.to].name} over ${ripenSecs(r.to)} s for ${c[0]} ore${c[1] ? ' and ' + c[1] + ' Flux' : ''}. It cannot move meanwhile.`,
  can: (g, u) => !ripenWhy(g, u), effect: (g, u) => { ripen(g, u); },
}; };
/** Dig in and come up again. Ctrl in first person. */
const digAb: AbilityDef = {
  key: 'dig', name: 'Dig In', hotkey: 'ControlLeft', energy: 0, cd: .8, cast: 0, range: 0, target: 'self', dug: true,
  blurb: 'Digs in or comes up. Dug in, it is unseen without a detector and cannot move.',
  can: (g, u) => canDig(g, u), effect: (g, u) => { if (u.kind === 'shellback' || u.kind === 'lobber') act(u, 'curl', G2.dig.t); setDug(g, u, !isDug(u)); },
};
/** Root: a walking Stinger Stalk or Puffball puts its roots down where it stands, on its own Bloom, in 4 s. */
const rootAb: AbilityDef = {
  key: 'root', name: 'Root', hotkey: 'Mouse2', energy: 0, cd: 2, cast: 0, range: 0, target: 'self',
  blurb: 'Puts the roots down where it stands, on your own Bloom. Takes 4 seconds.',
  can: (g, u) => g.carpet.on(u.pos.x, u.pos.z, 0, u.team) && !(u as any).rootT && podRoom(g, u.pos.x, u.pos.z),
  effect: (g, u) => { (u as any).rootT = G2.uproot.root; (u as any).rootAt = { x: u.order.x, z: u.order.z }; addStatus(u, 'root', G2.uproot.root); },
};
/** Board and drop: a Drifter with Belly Sacs takes in the small Gloam bodies round it (up to 8 beds), and lets them out again. */
const boardAb: AbilityDef = {
  key: 'board', name: 'Take aboard', hotkey: 'KeyE', energy: 0, cd: 1, cast: 0, range: 0, target: 'self',
  blurb: 'Takes in your own bodies within 4 m of it, up to 8 beds. Needs Belly Sacs.',
  can: (g, u) => !!g.upOf(u.team).gbelly && usedOf(u) < (UNIT[u.kind].cargo || 0),
  effect: (g, u) => { for (const o of g.units.filter(o => o.alive && o.team === u.team && !o.air && o !== u && !o.pilot && o !== g.me && !o.inside && dist(o, u) < 4 + UNIT[u.kind].rad).sort((a, b) => dist(a, u) - dist(b, u))) load(g, u, o); },
};
const dropAb: AbilityDef = { key: 'drop', name: 'Let out', hotkey: 'KeyC', energy: 0, cd: 1, cast: 0, range: 0, target: 'self', blurb: 'Lets everything aboard out onto the ground below.', can: (_g, u) => !!u.cargo?.length, effect: (g, u) => { unload(g, u); } };

defineAbilities('keeper', [seedCap, sporePod, mend]);
defineAbilities('lobber', [bileLob]);
defineAbilities('smother', [choke, rotMind]);
defineAbilities('seeder', [fling]);
defineAbilities('hooksail', [reel, cloud, drink]);
defineAbilities('drifter', [boardAb, dropAb]);
defineAbilities('stingerwalk', [rootAb]); defineAbilities('puffwalk', [rootAb]);
for (const k of Object.keys(G_RIPEN) as GKind[]) defineAbilities(k, [ripenAb(k)]);
for (const k of G_DIGS) defineAbilities(k, [digAb]);
export { clump, foeBody };
export type { Kind };
