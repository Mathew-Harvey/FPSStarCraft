// How the new Ironhold bodies and buildings look in a match: stream E's figures (src/look-ironhold.ts) and second-wave buildings
// (look/yard2.ts) hung on the registry, posed every frame from the unit record, driven in first person, and every cast shown with
// E's effects (built on stream H's effect kit, src/fx/kit.ts).
// Everything here is for show: it reads no dice and changes no rule, so no bot result moves. The match server and headless tests
// carry no meshes; there the figures fall back to the plain stand-in and the kit is never made.
import * as THREE from 'three';
import type { Game } from '../../game';
import { UNIT, Unit, Building, Kind, fac } from '../../data';
import { defineUnits, unitRule, type VmPose } from '../../core/registry';
import { abilitiesOf, type Target } from '../../core/ability';
import { ripening } from '../../core/morph';
import { isEnemy } from '../../core/sides';
import { hasStatus } from '../../core/status';
import { defineBuildingLook } from '../../net-look';
import { plainBody } from '../../core/plain';
import { heldMaterial, setLayer } from '../../gfx';
import type { Model } from '../../models';
import * as E from '../../look-ironhold';
import { FxKit, cloud, ring, orb } from '../../fx/kit';
import { skids, depotSunk } from './look/yard2';
import { TUNE, mem, boosted } from './kit';

type Fig = E.Fig;
const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);

// ---------------------------------------------------------------- figures
/** Which sculpt each kind is drawn with. Second forms share their first form's figure: a landed Flak Kite is the Kite on its legs,
 *  an anchored Pile Driver the same machine with its stakes down. */
const ART: Partial<Record<Kind, E.Kind>> = {
  sapper: 'sapper', hauldrone: 'hauldrone', dustbike: 'dustbike', piledriver: 'piledriver', piledriverset: 'piledriver',
  hopper: 'hopper', flakkite: 'flakkite', flakwalker: 'flakkite', gadfly: 'gadfly', surveyor: 'surveyor', claimbarge: 'claimbarge',
  staketurret: 'staketurret',
};
/** How far and how long a new body falls in: a called Haul Drone from 30 m, a Stake Gun post as the stake that carries it lands. */
const DROPS: Partial<Record<Kind, { h: number; t: number }>> = { hauldrone: { h: 30, t: 1.6 }, staketurret: { h: 7, t: .35 } };
const DROP = DROPS.hauldrone!.t, STAKE_FLIGHT = DROPS.staketurret!.t;
const figOf = (u: Unit): Fig | null => (u.obj.userData.fig as Fig) || null;

function figureFor(kind: Kind): Model {
  const art = ART[kind]!, f = E.model(art);
  if (!f) return plainBody(kind);
  const g = f.groups; f.root.userData.fig = f;
  // the game moves and turns the root; everything else is posed by E.animate below
  return { obj: f.root, rig: { body: g.body || f.root, head: g.head, arms: g.arms, legL: g.legL, legR: g.legR, height: f.root.userData.lodH || 2 } };
}

/** The part of a change of form a body has come through: 0 at the first form, 1 at the second. */
function formK(u: Unit, second: Kind) {
  const r = ripening(u); if (!r) return u.kind === second ? 1 : 0;
  const k = 1 - r.t / Math.max(.01, r.total); return r.kind === second ? k : 1 - k;
}
/** The state E's poses read, made from the unit record. Distance walked and seconds idle are kept per body. */
function stateOf(g: Game, u: Unit): E.State {
  const m = mem(u), x = u.pos.x, z = u.pos.z;
  const step = m.lx === undefined ? 0 : Math.hypot(x - m.lx, z - m.lz); m.lx = x; m.lz = z; m.dist = (m.dist || 0) + Math.min(step, 2);
  if (u.moving || u.target || u.cast) m.idleAt = g.time; const idle = g.time - (m.idleAt ?? g.time);
  const fast = boosted(g, u, 'kick') || boosted(g, u, 'burn') ? 1.5 : 1;
  const work = u.state === 'mining' || u.state === 'build' || u.state === 'repair' || !!u.cast || (u.kind === 'hopper' && (u.alt || 0) < .3);
  let aim = 0; const t = u.target; if (t && t.alive) { aim = Math.atan2(t.pos.x - x, t.pos.z - z) - u.yaw; aim = Math.atan2(Math.sin(aim), Math.cos(aim)); }
  const air = u.kind === 'flakkite' || u.kind === 'flakwalker' ? 1 - formK(u, 'flakwalker') : u.kind === 'hopper' ? Math.min(1, (u.alt || 0) / 2) : 1;
  const charge = u.cast?.key === 'foreclose' ? 1 - u.cast.t / TUNE.foreclose.cast : 0;
  return { t: g.time, id: u.id, speed: u.moving ? fast : 0, dist: m.dist, kick: Math.max(0, Math.min(1, u.swing)), pitch: u.pitch || 0, aim, work,
    load: u.carrying > 0, anchor: u.kind === 'piledriver' || u.kind === 'piledriverset' ? formK(u, 'piledriverset') : 0, idle, air, charge };
}
const looks: Record<string, any> = {};
for (const kind of Object.keys(ART) as Kind[]) looks[kind] = {
  figure: () => figureFor(kind),
  pose(g: Game, u: Unit) {
    const f = figOf(u); if (!f) return false; E.animate(ART[u.kind]!, f, stateOf(g, u));
    // a Haul Drone comes down from 30 m over its first 1.6 s (the mark and the dust are E's callDown, started in showTick)
    const d = mem(u).dropAt; if (d !== undefined) { const dr = DROPS[u.kind]!, k = Math.min(1, (g.time - d) / dr.t); f.root.position.y += dr.h * (1 - k * k * (3 - 2 * k)); if (k >= 1) mem(u).dropAt = undefined; }
    return true;
  },
};
defineUnits(looks);

// ---------------------------------------------------------------- first person
/** A body driven from its seat sees its own bars, gun or hull: the figure stays drawn, with what would sit in the eye shrunk away.
 *  The rest hold a view model (the Sapper's carbine, the drone's camera port, the Hopper's dashboard, the Kite's guns). */
const NO_VM = new Set<string>();
function seatView(g: Game, pose: VmPose) {
  const me = g.me!, f = figOf(me), art = ART[me.kind]; if (!art) return;
  const m = mem(me);
  if (E.FIRST[art].vm) {
    const mode = me.kind === 'sapper' && me.cast?.key === 'satchel' ? 'charge' : 'gun', key = `i_${art}_${mode}`;
    let v: THREE.Group | undefined = g.vm[key]; if (!v) {
      if (NO_VM.has(key)) return; const made = E.viewModel(art, mode); if (!made) { NO_VM.add(key); return; }
      v = new THREE.Group(); v.add(made); v.userData.rest = [0, 0, 0, 0, 0, 0]; v.traverse(o => { const q = o as THREE.Mesh; if (q.isMesh && !Array.isArray(q.material)) q.material = heldMaterial(q.material); });
      g.cam.add(v); g.vm[key] = v;
    }
    if (v) pose(v, 0, g.recoil * .06, 0);
    return;
  }
  if (!f) return;
  if (!m.seat) { setLayer(me.obj, 0); me.ring.visible = false; m.seat = E.hideFirst(f, art); }
}
for (const kind of Object.keys(ART) as Kind[]) defineUnits({ [kind]: { view: (g: Game, pose: VmPose) => seatView(g, pose) } });

// ---------------------------------------------------------------- the effect kit, one per game
const KITS = new WeakMap<Game, FxKit>();
function kitOf(g: Game): FxKit | null {
  if (g.noRender || typeof window === 'undefined') return null;
  let k = KITS.get(g); if (!k) KITS.set(g, k = new FxKit(g.scene)); return k;
}
const at = (u: Unit) => () => V(u.pos.x, (u.alt || 0) + u.pos.y, u.pos.z);
const ground = (t: { x: number; z: number }) => V(t.x, 0, t.z);
/** Whether the side watching this screen is on this body's side (mines and cloaks are only shown to their own side). */
const ours = (g: Game, team: number) => !isEnemy(g.myTeam, team);
const find = (g: Game, id?: number) => id ? (g.units.find(x => x.id === id) || g.buildings.find(x => x.id === id)) || null : null;
const bodyY = (o: Unit | Building) => 'kind' in o && (o as Unit).kind in UNIT ? UNIT[(o as Unit).kind].bodyY + ((o as Unit).alt || 0) : 2;

/** When a cast starts (the wind-up the other side should see coming). */
const START: Record<string, (k: FxKit, g: Game, u: Unit, t: Target) => void> = {
  foreclose(k, g, u, t) { const f = figOf(u), o = find(g, t.id); if (f) E.foreclosure(k, f, o ? V(o.pos.x, bodyY(o), o.pos.z) : ground(t), TUNE.foreclose.cast); },
  relocate(k, _g, u, t) { const f = figOf(u); if (f) E.relocate(k, f, ground(t), TUNE.relocate.cast); },
  deep(k, _g, _u, t) { E.deepCharge(k, ground(t), TUNE.deep.r, TUNE.deep.cast); },
};
/** When a cast goes off. */
const DONE: Record<string, (k: FxKit, g: Game, u: Unit, t: Target, tgt: Unit | Building | null) => void> = {
  overtime(k, _g, u) { E.overtime(k, at(u), TUNE.overtime.t); },
  painkiller(k, _g, _u, _t, o) { if (o) { const p = o.pos; k.add(ring({ x: p.x, z: p.z, r: 1.4, time: .6, color: '#7fffd0' })); } },
  pulse(k, _g, u) { k.add(ring({ x: u.pos.x, z: u.pos.z, r: 6, time: .8, color: '#7fffd0' })); },
  satchel(k, _g, u) { E.blast(k, V(u.pos.x + Math.sin(u.yaw) * 1.2, 0, u.pos.z + Math.cos(u.yaw) * 1.2), 3.5, TUNE.satchel.fuse); },
  kick(k, _g, u) { const f = figOf(u); if (f) E.kickStart(k, f, TUNE.kick.t); },
  anchor(k, _g, u) { const f = figOf(u); if (f) later(k, TUNE.pile.anchor * .6, () => { if (u.alive) E.anchorDust(k, f); }); },
  afterburn(k, _g, u) { const f = figOf(u); if (f) E.afterburn(k, f, TUNE.afterburn.t); },
  // (K) from the status, not the rule's own note, which only the host keeps: so it shows the same on every screen
  cloak(k, _g, u) { if (hasStatus(u, 'unseen')) { const p = at(u)(); k.add(cloud({ x: p.x, z: p.z, y: Math.max(0, p.y - 2), r: 6, time: 4, color: '#9a9488', puffs: 16 })); } },
  ghillie(k, _g, u) { if (hasStatus(u, 'unseen')) k.add(cloud({ x: u.pos.x, z: u.pos.z, r: 1.2, time: 1.2, color: '#8a8a60', puffs: 5 })); },
  tranq(k, _g, u, t) { E.tranq(k, V(u.pos.x, 1.5, u.pos.z), ground(t), TUNE.tranq.r); },
  // the post itself is the staketurret unit (its sculpted figure falls in, see DROPS); here only the shot that carries it and the dust it lands in
  stake(k, _g, u, t) { const from = V(u.pos.x, (u.alt || 0) + 1, u.pos.z), to = ground(t); let s = 0;
    k.add({ obj: new THREE.Group(), update(dt) { s += dt; return s < STAKE_FLIGHT; } });
    k.add(orb({ at: () => from.clone().lerp(to, Math.min(1, s / STAKE_FLIGHT)), r: .1, color: '#ff6a1a', time: STAKE_FLIGHT, minPx: 3 }));
    later(k, STAKE_FLIGHT, () => { k.add(ring({ x: to.x, z: to.z, y: to.y, r: 1.2, time: .4, color: '#d9a46a' })); k.add(cloud({ x: to.x, z: to.z, y: to.y, r: .8, time: .8, color: '#d9a46a', puffs: 4 })); }); },
  jam(k, _g, _u, _t, o) { if (o && 'kind' in o) E.jam(k, () => V(o.pos.x, (o as Unit).alt || 0, o.pos.z), TUNE.jam.t); },
  flare(k, _g, _u, t) { E.flare(k, ground(t), TUNE.flare.r, TUNE.flare.t); },
};
/** Runs `fn` after `s` seconds of game time, through the kit (so a paused game waits too). */
function later(k: FxKit, s: number, fn: () => void) { let t = 0; k.add({ obj: new THREE.Group(), update(dt) { t += dt; if (t >= s) { fn(); return false; } return true; } }); }

/** Gives every Ironhold ability its look (AbilityDef.show), played when it goes off: here, or online on every screen that can see the
 *  caster, from the server's cast event (K). Called once every rule file has defined its abilities. */
export function wrapCasts() {
  for (const kind of Object.keys(UNIT) as Kind[]) {
    if (UNIT[kind].team !== 0) continue;
    for (const a of abilitiesOf(kind)) {
      const show = DONE[a.key]; if (!show || a.show) continue;
      a.show = (g, u, t, tgt) => { const k = kitOf(g); if (k) show(k, g, u, t, tgt); };
    }
  }
}
// The Flak Tower's aim and a crawling building, sent to every screen (src/net-look.ts): the rules keep both only where they run.
defineBuildingLook({ key: 'iaim', get(g, b) { const m = mem(b), t = m.aim as Unit | undefined; return t && t.alive && g.time - (m.aimT || 0) < 2 ? t.id : 0; },
  set(g, b, v) { if (!v) return; const m = mem(b); m.aim = g.uById.get(v) || null; m.aimT = g.time; } });
defineBuildingLook({ key: 'icrawl', get(_g, b) { return mem(b).crawl ? 1 : 0; }, set(_g, b, v) { const m = mem(b); if (!v) { if (m.crawl) m.crawl = null; } else if (!m.crawl) m.crawl = { x: b.pos.x, z: b.pos.z, t: 0 }; } });

// ---------------------------------------------------------------- once a frame, on every screen (online too)
const MINES = new WeakMap<Game, Map<Unit, THREE.Object3D>>();
/** Ticks the kit, notices casts starting, mines dug in and gone off, and works the buildings' moving parts. */
export function showTick(g: Game, dt: number) {
  const k = kitOf(g); if (!k) return;
  k.update(dt);
  let mines = MINES.get(g); if (!mines) MINES.set(g, mines = new Map());
  for (const u of g.units) {
    if (fac(u.team) !== 0) continue;
    if (DROPS[u.kind] && u.alive && !mem(u).dropSeen) {
      const m = mem(u); m.dropSeen = true;
      if (g.time - (m.born ?? g.time) < .5) m.dropAt = g.time;
      if (m.dropAt === g.time && u.kind === 'hauldrone') { E.callDown(k, { root: new THREE.Group(), groups: {}, points: {} }, V(u.pos.x, 0, u.pos.z), DROP); }   // E's mark and dust; the pose above does the fall
    }
    if (u.kind === 'shaftmine') {
      if (u.alive && !mines.has(u)) { const fx = E.shaftMine(k, V(u.pos.x, 0, u.pos.z), 1e5); fx.obj.visible = ours(g, u.team); mines.set(u, fx.obj); }
      continue;
    }
    if (!u.alive) continue;
    const m = mem(u);
    if (u.cast && m.castSeen !== u.cast) { m.castSeen = u.cast; const s = START[u.cast.key]; if (s) try { s(k, g, u, { x: u.cast.x, z: u.cast.z, id: u.cast.id }); } catch (e) { console.warn('ironhold fx', u.cast.key, e); } }
    if (m.seat && u !== g.me) { m.seat(); m.seat = null; }
  }
  for (const [u, obj] of mines) if (!u.alive) { obj.visible = false; obj.scale.setScalar(1e-4); mines.delete(u); const mm = mem(u); if (mm.went || (g.net && !mm.fizzled)) E.blast(k, V(u.pos.x, 0, u.pos.z), TUNE.mine.r); else if (ours(g, u.team)) k.add(cloud({ x: u.pos.x, z: u.pos.z, r: .8, time: 1, color: '#d9a46a', puffs: 3 })); }
  for (const b of g.buildings) if (b.alive && fac(b.team) === 0) moveParts(g, b, dt);
}
/** The Flak Tower's gun follows what it shoots, the Hangar's doors open while it trains, and a crawling building rides on skids. */
function moveParts(g: Game, b: Building, dt: number) {
  const m = mem(b), ud = b.obj.userData;
  if (ud.parts === undefined) { ud.parts = {}; b.obj.traverse(o => { if (o.userData.gun) ud.parts.flak = o; if (o.userData.doors) ud.parts.doors = o.userData.doors; }); }
  const P = ud.parts;
  if (P.flak) {
    const f = P.flak, t = m.aim as Unit | undefined;
    if (t && t.alive && g.time - (m.aimT || 0) < 2) {
      f.userData.aimed = true; const dx = t.pos.x - b.pos.x, dz = t.pos.z - b.pos.z, up = UNIT[t.kind].bodyY + (t.alt || 0) - b.h;
      let yaw = Math.atan2(dx, dz) - b.obj.rotation.y; yaw = Math.atan2(Math.sin(yaw), Math.cos(yaw));
      f.userData.gun.rotation.y += (Math.atan2(Math.sin(yaw - f.userData.gun.rotation.y), Math.cos(yaw - f.userData.gun.rotation.y))) * Math.min(1, dt * 8);
      if (f.userData.barrels) f.userData.barrels.rotation.x = -Math.atan2(up, Math.hypot(dx, dz));
    } else f.userData.aimed = false;
  }
  if (P.doors) {
    if (b.queue.length) m.outT = g.time; const open = b.built && g.time - (m.outT ?? -9) < 3 ? 1 : 0;
    for (let i = 0; i < P.doors.length; i++) { const d = P.doors[i] as THREE.Object3D; d.userData.x0 ??= d.position.x; const want = d.userData.x0 + (i ? 1 : -1) * 2.1 * open; d.position.x += (want - d.position.x) * Math.min(1, dt * 2); }
  }
  // A sunk Depot shows its lid flush with the ground, so a crewman walking over it walks on a plate, not on sand.
  if (b.kind === 'depot') {
    if (!ud.lid) { ud.lid = depotSunk(); b.obj.add(ud.lid); }
    const sunk = b.obj.position.y < -.5; ud.lid.visible = sunk; if (sunk) ud.lid.position.y = -b.obj.position.y + .02;
  }
  if (m.crawl && !ud.skids) { ud.skids = skids(b.hx, b.hz); b.obj.add(ud.skids); }
  else if (!m.crawl && ud.skids) { b.obj.remove(ud.skids); ud.skids = null; }
}

// ---------------------------------------------------------------- hooking in
// Every screen poses its bodies each frame (online too), so the kit ticks from there: the Rigger's pose (every Ironhold yard has
// Riggers) and each new kind's. The look files load after the rules, so this waits until every file has run before wrapping.
const SHOWN = new WeakMap<Game, number>();
function frame(g: Game, dt: number) { if (SHOWN.get(g) === g.time) return; SHOWN.set(g, g.time); showTick(g, dt); }
queueMicrotask(() => {
  wrapCasts();
  for (const kind of ['rigger', ...Object.keys(ART)]) {
    const was = unitRule(kind).pose;
    defineUnits({ [kind]: { pose(g: Game, u: Unit, dt: number, s: number, ease: number, sc: number) { frame(g, dt); return was?.(g, u, dt, s, ease, sc); } } });
  }
});
// For tests and pictures: the effect kit a page's game uses.
if (typeof window !== 'undefined') (window as any).__ironShow = { kitOf, mem };
