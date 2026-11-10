// The simulation and the player: economy, units, buildings, combat, enemy raids,
// squad plans, and jumping between bodies.
import * as THREE from 'three';
import { Pipeline, V3, M, G, R, mk, setLayer, L_FX, L_SELF, holoOK, holoBad, ringMat, tracerMat, makeSky } from './gfx';
const beamMat = new THREE.MeshBasicMaterial({ color: 0x6dfff0, depthWrite: false });
import * as MD from './models';
import { sfx, drillSound } from './audio';
import type { Hud } from './hud';

export type Kind = 'rigger' | 'linesman' | 'cantor';
export type BKind = 'headframe' | 'bunkhouse' | 'depot' | 'watchpost' | 'choir';

export const UNIT = {
  rigger: { name: 'Rigger', hp: 45, shield: 0, speed: 4.6, eye: 1.5, headY: 1.52, bodyY: .9, cost: 50, time: 8, quip: '"I dig holes. You point at where."', ack: 'Drill\'s warm, boss.' },
  linesman: { name: 'Linesman', hp: 60, shield: 0, speed: 4.8, eye: 1.58, headY: 1.56, bodyY: .9, cost: 60, time: 11, quip: '"Paid by the bullet. Tips welcome."', ack: 'Boss is in my head again.' },
  cantor: { name: 'Cantor', hp: 80, shield: 40, speed: 5.4, eye: 2.2, headY: 2.42, bodyY: 1.3, cost: 0, time: 0, quip: '', ack: '' },
};
export const BLD = {
  headframe: { name: 'Headframe', hp: 2000, hx: 6.6, hz: 4.6, h: 5, cost: 0, time: 0 },
  bunkhouse: { name: 'Bunkhouse', hp: 500, hx: 3.9, hz: 3.0, h: 2.8, cost: 150, time: 14 },
  depot: { name: 'Depot', hp: 350, hx: 2.8, hz: 2.6, h: 4.6, cost: 100, time: 9 },
  watchpost: { name: 'Watchpost', hp: 400, hx: 1.6, hz: 1.6, h: 8, cost: 125, time: 11 },
  choir: { name: 'Choir Stone', hp: 1600, hx: 1.5, hz: 1.5, h: 11, cost: 0, time: 0 },
};
export const BUILDABLE: BKind[] = ['bunkhouse', 'depot', 'watchpost'];

export interface Order { type: 'guard' | 'amove' | 'follow' | 'raid'; x: number; z: number }
export interface Unit {
  id: number; kind: Kind; team: number; pos: THREE.Vector3; yaw: number; hp: number; maxHp: number; shield: number; maxShield: number;
  obj: THREE.Group; rig: MD.Rig; ring: THREE.Mesh; alive: boolean; speed: number; moving: boolean; phase: number; cd: number; think: number;
  target: Unit | Building | null; order: Order; lastHit: number; state: string; timer: number; carrying: number; node: OreNode | null; site: Building | null;
  dashCd: number; dashT: number; swing: number; slot: number;
}
export interface Building {
  id: number; kind: BKind; team: number; pos: THREE.Vector3; hx: number; hz: number; h: number; hp: number; maxHp: number; obj: THREE.Group; holo: THREE.Group | null;
  built: boolean; progress: number; queue: { kind: Kind; t: number }[]; alive: boolean; cd: number; builder: Unit | null; lastHit: number; rot: boolean;
}
export interface OreNode { pos: THREE.Vector3; amount: number; obj: THREE.Group }
export interface Callout { who: string; text: string; t: number; dur: number }

const HQ_POS = V3(0, 0, 0), OUTPOST = V3(122, 0, 13), RALLY = V3(25, 0, 11);
const DEPOT_SLOTS = [[-13, 9], [-13, -9], [-19, 0], [-4, -13], [-22, 12]];
const TMP = V3(), TMP2 = V3();
let nextId = 1;
const HINTS: (number | string)[][] = [
  [1.5, 'Quartermaster', 'Welcome to Dustbowl 7. Hold click on the green ore to drill. I\'ll handle the paperwork.'],
  [14, 'Quartermaster', 'Press 2 if you want to place buildings yourself. Press G to make me stop.'],
  [75, 'Lookout', 'Veyl outpost is down the east road. Three Choir Stones. They will come for us first.'],
];

export class Game {
  scene = new THREE.Scene();
  cam = new THREE.PerspectiveCamera(68, 1, .06, 4000);
  iso = new THREE.OrthographicCamera(-40, 40, 22, -22, 1, 700);
  units: Unit[] = []; buildings: Building[] = []; ores: OreNode[] = []; spires: { x: number; z: number; r: number }[] = [];
  anim: ((t: number) => void)[] = [];
  ore = 100; time = 0; phase: 'menu' | 'play' | 'paused' | 'card' | 'over' = 'menu'; won = false;
  me: Unit | null = null; lastBody: Unit | null = null; yaw = 0; pitch = 0; jumpCd = 0; seenKinds = new Set<string>(); cardT = 0; staticT = 0;
  tool = 1; buildSel = 0; buildRot = false; placeOK = false; placePos = V3(); ghost: Record<string, THREE.Group> = {}; ghostBad: Record<string, THREE.Group> = {};
  ammo = 24; reloadT = 0; fireCd = 0; recoil = 0; mineT = 0; bob = 0; prompt = '';
  auto = true; qmT = 0; raidT = 165; raidN = 0; reinT = 60;
  plan: { phase: 'ask' | 'count' | 'go'; t: number; target: Building | null } | null = null; nextPlan = 60; callout: Callout | null = null;
  tab = false; tabSel = 0; tabList: { label: string; task: string; unit: Unit; hp: number; alert: boolean }[] = [];
  keys = new Set<string>(); pressed = new Set<string>(); mdx = 0; mdy = 0; lmb = false; wheel = 0;
  vmDrill: THREE.Group; vmRifle: THREE.Group; tracers: { m: THREE.Mesh; t: number }[] = []; puffs: { m: THREE.Mesh; t: number; life: number; v: THREE.Vector3; s: number }[] = [];
  stats = { kills: 0, lost: 0, mined: 0 };
  shake = 0; noRender = false; alertT = 0; hintI = 0; raidLive = false; firstLine = false;

  constructor(public pipe: Pipeline, public hud: Hud) {
    const s = this.scene; s.add(makeSky()); MD.buildWorld(s, this.spires); s.add(this.cam);
    this.vmDrill = MD.vmDrill(this.anim); this.vmRifle = MD.vmRifle(); this.cam.add(this.vmDrill, this.vmRifle);
    for (const k of BUILDABLE) { const src = this.model(k); this.ghost[k] = MD.hologram(src, holoOK); this.ghostBad[k] = MD.hologram(src, holoBad); this.ghost[k].visible = this.ghostBad[k].visible = false; s.add(this.ghost[k], this.ghostBad[k]); }
    for (let i = 0; i < 28; i++) { const m = mk(G.cyl8, tracerMat, 0, 0, 0, s); m.layers.set(L_FX); m.visible = false; this.tracers.push({ m, t: 0 }); }
    for (let i = 0; i < 60; i++) { const m = mk(G.sph, M.dust, 0, 0, 0, s); m.visible = false; this.puffs.push({ m, t: 0, life: 1, v: V3(), s: 1 }); }
    // base
    this.addBuilding('headframe', 0, 0, 0, true);
    for (const [x, z, n, sc] of [[17, -15, 9, 1.2], [21, -10, 7, 1.0], [23, -18, 8, 1.3], [15, -21, 6, .9], [-18, -24, 8, 1.1], [-24, -19, 7, 1.0]]) { const obj = MD.oreCluster(n, sc); obj.position.set(x, 0, z); s.add(obj); this.ores.push({ pos: V3(x, 0, z), amount: 900, obj }); }
    mk(G.torusF, M.rock, [26, .15, 2], [3, 3, 4], [Math.PI / 2, 0, 0], s); mk(G.disc, M.violet, [26, .22, 2], [2.6, 2.6, 1], [-Math.PI / 2, 0, 0], s);
    for (const [x, z] of [[6, 7], [10, -6], [13, -10], [-8, -8], [9, 2], [-6, 8]]) this.spawn('rigger', 0, x, z);
    // enemy outpost
    for (const [x, z] of [[118, 5], [127, 13], [120, 22]]) this.addBuilding('choir', 1, x, z, true);
    for (let i = 0; i < 6; i++) this.spawn('cantor', 1, OUTPOST.x - 6 + R(-4, 4), OUTPOST.z + R(-8, 8));
    this.me = this.units[0]; this.possess(this.me, true);
    this.yaw = Math.PI * .75;
  }

  model(k: BKind) { return k === 'headframe' ? MD.headframe(this.anim) : k === 'bunkhouse' ? MD.bunkhouse() : k === 'depot' ? MD.depot() : k === 'watchpost' ? MD.watchpost() : MD.choir(this.anim); }

  // ------------------------------------------------------------ entities
  spawn(kind: Kind, team: number, x: number, z: number): Unit {
    const md = kind === 'rigger' ? MD.rigger() : kind === 'linesman' ? MD.trooper() : MD.cantor(); const st = UNIT[kind];
    const ring = mk(G.ringG, ringMat, [0, .08, 0], [2.4, 2.4, 1], [-Math.PI / 2, 0, 0], md.obj); ring.layers.set(L_FX); ring.visible = false;
    const u: Unit = { id: nextId++, kind, team, pos: V3(x, 0, z), yaw: R(0, 6), hp: st.hp, maxHp: st.hp, shield: st.shield, maxShield: st.shield, obj: md.obj, rig: md.rig, ring, alive: true, speed: st.speed, moving: false, phase: R(0, 6), cd: R(0, 1), think: R(0, .3), target: null, order: { type: 'guard', x, z }, lastHit: -99, state: 'idle', timer: 0, carrying: 0, node: null, site: null, dashCd: R(2, 5), dashT: 0, swing: 0, slot: 0 };
    md.obj.position.copy(u.pos); this.scene.add(md.obj); this.units.push(u);
    if (kind === 'linesman') { u.slot = this.own('linesman').length; if (this.plan?.phase === 'go' && this.plan.target) u.order = { type: 'amove', x: this.plan.target.pos.x, z: this.plan.target.pos.z }; else if (this.following()) u.order = { type: 'follow', x: 0, z: 0 }; else u.order = { type: 'guard', x: RALLY.x + ((u.slot % 4) - 1.5) * 2.2, z: RALLY.z + Math.floor(u.slot / 4) * 2.2 }; }
    return u;
  }
  addBuilding(kind: BKind, team: number, x: number, z: number, built: boolean, rot = false): Building {
    const st = BLD[kind]; const obj = this.model(kind); obj.position.set(x, 0, z); if (rot) obj.rotation.y = Math.PI / 2; this.scene.add(obj);
    const b: Building = { id: nextId++, kind, team, pos: V3(x, 0, z), hx: rot ? st.hz : st.hx, hz: rot ? st.hx : st.hz, h: st.h, hp: built ? st.hp : st.hp * .1, maxHp: st.hp, obj, holo: null, built, progress: built ? 1 : 0, queue: [], alive: true, cd: 0, builder: null, lastHit: -99, rot };
    if (!built) { b.holo = MD.hologram(obj, holoOK); b.holo.position.copy(obj.position); b.holo.rotation.copy(obj.rotation); this.scene.add(b.holo); obj.scale.y = .06; }
    this.buildings.push(b); return b;
  }
  own(kind?: Kind) { return this.units.filter(u => u.alive && u.team === 0 && (!kind || u.kind === kind)); }
  ownB(kind?: BKind, builtOnly = false) { return this.buildings.filter(b => b.alive && b.team === 0 && (!kind || b.kind === kind) && (!builtOnly || b.built)); }
  stones() { return this.buildings.filter(b => b.alive && b.kind === 'choir'); }
  supplyCap() { return 12 + 8 * this.ownB('depot', true).length; }
  supplyUsed() { return this.own().length + this.ownB().reduce((n, b) => n + b.queue.length, 0); }
  following() { return this.own('linesman').some(u => u.order.type === 'follow'); }

  // ------------------------------------------------------------ helpers
  distToBox(b: Building, x: number, z: number) { const dx = Math.max(Math.abs(x - b.pos.x) - b.hx, 0), dz = Math.max(Math.abs(z - b.pos.z) - b.hz, 0); return Math.hypot(dx, dz); }
  collide(u: Unit, gx: number, gz: number) {
    const r = .5, p = u.pos;
    for (const b of this.buildings) {
      if (!b.alive) continue; const ex = b.hx + r, ez = b.hz + r, dx = p.x - b.pos.x, dz = p.z - b.pos.z;
      if (Math.abs(dx) < ex && Math.abs(dz) < ez) {
        const px = ex - Math.abs(dx), pz = ez - Math.abs(dz);
        if (px < pz) { p.x += Math.sign(dx || 1) * px; if (u !== this.me) p.z += Math.sign(gz - p.z || 1) * .06; } else { p.z += Math.sign(dz || 1) * pz; if (u !== this.me) p.x += Math.sign(gx - p.x || 1) * .06; }
      }
    }
    for (const s of this.spires) { const dx = p.x - s.x, dz = p.z - s.z, d = Math.hypot(dx, dz), m = s.r + r; if (d < m && d > .001) { p.x += dx / d * (m - d); p.z += dz / d * (m - d); } }
    for (const o of this.ores) { if (o.amount <= 0) continue; const dx = p.x - o.pos.x, dz = p.z - o.pos.z, d = Math.hypot(dx, dz), m = 1.7; if (d < m && d > .001) { p.x += dx / d * (m - d); p.z += dz / d * (m - d); } }
    const cx = p.x - 60, cz = p.z - 10, cd = Math.hypot(cx, cz); if (cd > 200) { p.x = 60 + cx / cd * 200; p.z = 10 + cz / cd * 200; }
  }
  moveTo(u: Unit, x: number, z: number, dt: number, stop = .4, mul = 1) {
    const dx = x - u.pos.x, dz = z - u.pos.z, d = Math.hypot(dx, dz); if (d < stop) return true;
    const st = Math.min(d, u.speed * mul * dt); u.pos.x += dx / d * st; u.pos.z += dz / d * st; u.yaw = Math.atan2(dx, dz); u.moving = true; this.collide(u, x, z); return false;
  }
  vol(p: THREE.Vector3) { const d = this.me ? p.distanceTo(this.me.pos) : 50; return Math.max(0, 1 - d / 90) ** 2; }
  tracer(a: THREE.Vector3, b: THREE.Vector3, mat: THREE.Material = tracerMat, w = .07) {
    const tr = this.tracers.find(t => t.t <= 0); if (!tr) return; const d = TMP.copy(b).sub(a), len = d.length(); if (len < .1) return;
    tr.m.material = mat; tr.m.scale.set(w, len, w); tr.m.position.copy(a).addScaledVector(d, .5); tr.m.quaternion.setFromUnitVectors(V3(0, 1, 0), d.normalize()); tr.m.visible = true; tr.t = mat === tracerMat ? .07 : .16;
  }
  puff(p: THREE.Vector3, n: number, size: number, mat = M.dust, up = 1.2) {
    for (let i = 0; i < n; i++) { const f = this.puffs.find(x => x.t <= 0); if (!f) return; f.m.material = mat; f.m.position.copy(p); f.v.set(R(-1, 1), R(.3, 1) * up, R(-1, 1)); f.s = size * R(.6, 1.2); f.life = f.t = R(.35, .7); f.m.visible = true; }
  }
  feed(who: string, msg: string, cls = '') { this.hud.feed(who, msg, cls); }

  damage(t: Unit | Building, amt: number, from: Unit | Building | null, crit = false) {
    if (!t.alive) return; t.lastHit = this.time;
    const isUnit = (t as Unit).rig !== undefined; const u = t as Unit;
    if (isUnit && u.shield > 0) { const a = Math.min(u.shield, amt); u.shield -= a; amt -= a; }
    t.hp -= amt;
    const head = TMP2.copy(t.pos); head.y = isUnit ? UNIT[u.kind].headY + .4 : (t as Building).h * .7;
    if (from === this.me && this.me) this.hud.damage(head, (crit ? 'CRIT ' : '') + Math.round(amt + (isUnit ? 0 : 0)), crit ? 'crit' : '');
    if (t === this.me) { this.shake = Math.min(1, this.shake + .5); this.hud.hurt(); }
    if (isUnit && from && (from as Unit).rig && u !== this.me && !u.target && u.kind !== 'rigger') u.target = from;
    if (!isUnit && (t as Building).kind === 'choir' && from && (from as Unit).rig) for (const c of this.units) if (c.alive && c.team === 1 && !c.target && c.order.type === 'guard' && c.pos.distanceTo(t.pos) < 45) c.target = from;
    if (!isUnit && t.team === 0 && from && this.time > this.alertT) { this.alertT = this.time + 20; this.feed('Lookout', `They're chewing on the ${BLD[(t as Building).kind].name}! Get back here.`, 'al'); sfx.alarm(); }
    if (t.hp <= 0) isUnit ? this.killUnit(u, from) : this.killBuilding(t as Building);
  }
  killUnit(u: Unit, from: Unit | Building | null) {
    u.alive = false; this.scene.remove(u.obj); TMP2.copy(u.pos).setY(1); this.puff(TMP2, 7, 1.0, u.team ? M.teal : M.smoke); sfx.ko(this.vol(u.pos));
    this.hud.damage(TMP2.setY(2.2), 'KO!', u.team ? 'ko' : 'kobad');
    if (u.team === 1) { this.stats.kills++; } else { this.stats.lost++; if (u !== this.me && u.kind === 'linesman' && Math.random() < .5) this.feed('Alpha', 'Man down! That\'s coming out of somebody\'s pay.', 'al'); }
    if (u.site) u.site.builder = null;
    if (u === this.me) { this.staticT = 2.2; this.feed('Signal', 'Body lost. Finding you a new one.', 'al'); sfx.deny(); }
  }
  killBuilding(b: Building) {
    b.alive = false; this.scene.remove(b.obj); if (b.holo) this.scene.remove(b.holo);
    for (let i = 0; i < 4; i++) { TMP2.copy(b.pos).add(TMP.set(R(-b.hx, b.hx), R(1, b.h), R(-b.hz, b.hz))); this.puff(TMP2, 5, 2.4, b.team ? M.teal : M.smoke, 2); }
    this.hud.damage(TMP2.copy(b.pos).setY(b.h * .6), b.team ? 'KRA-KOOM!' : 'CRUNCH!', b.team ? 'ko' : 'kobad'); sfx.ko(1); this.shake = Math.max(this.shake, this.vol(b.pos)); if (b.builder) { b.builder.site = null; b.builder.state = 'idle'; }
    if (b.kind === 'choir') {
      const left = this.stones().length; this.feed('Alpha', left ? `Choir Stone down! ${left} to go.` : 'That\'s the last one. Drinks are on the boss.', '');
      if (!left) this.end(true); else if (this.plan?.phase === 'go') { this.plan.target = this.nearestStone(b.pos); for (const u of this.own('linesman')) if (u.order.type === 'amove' && this.plan.target) u.order = { type: 'amove', x: this.plan.target.pos.x, z: this.plan.target.pos.z }; }
    } else if (b.kind === 'headframe') this.end(false);
    else if (b.team === 0) this.feed('Quartermaster', `We lost the ${BLD[b.kind].name}. I liked that one.`, 'al');
  }
  end(won: boolean) { if (this.phase === 'over') return; this.phase = 'over'; this.won = won; won ? sfx.win() : sfx.lose(); drillSound(false, false); this.hud.showEnd(this); if (document.pointerLockElement) document.exitPointerLock(); }
  nearestStone(p: THREE.Vector3) { let best: Building | null = null, bd = 1e9; for (const b of this.stones()) { const d = b.pos.distanceTo(p); if (d < bd) { bd = d; best = b; } } return best; }

  // ------------------------------------------------------------ ray casting
  /** Finds the first thing the ray hits. `team` filters which side's units and buildings count (-1 for any). */
  ray(o: THREE.Vector3, d: THREE.Vector3, max: number, team: number, skip: Unit | null) {
    let best = max, hit: { unit?: Unit; b?: Building; ore?: OreNode; dist: number; head?: boolean } | null = null;
    const sphere = (cx: number, cy: number, cz: number, r: number) => { const ox = o.x - cx, oy = o.y - cy, oz = o.z - cz; const b = ox * d.x + oy * d.y + oz * d.z, c = ox * ox + oy * oy + oz * oz - r * r, disc = b * b - c; if (disc < 0) return -1; const t = -b - Math.sqrt(disc); return t > 0 ? t : -1; };
    for (const u of this.units) {
      if (!u.alive || u === skip || (team >= 0 && u.team !== team)) continue; const st = UNIT[u.kind];
      let t = sphere(u.pos.x, st.headY, u.pos.z, .46); if (t > 0 && t < best) { best = t; hit = { unit: u, dist: t, head: true }; }
      t = sphere(u.pos.x, st.bodyY, u.pos.z, .66); if (t > 0 && t < best) { best = t; hit = { unit: u, dist: t }; }
      t = sphere(u.pos.x, .35, u.pos.z, .45); if (t > 0 && t < best) { best = t; hit = { unit: u, dist: t }; }
    }
    for (const b of this.buildings) {
      if (!b.alive || (team >= 0 && b.team !== team)) continue;
      let t0 = 0, t1 = best, ok = true; const mn = [b.pos.x - b.hx, 0, b.pos.z - b.hz], mx = [b.pos.x + b.hx, b.h, b.pos.z + b.hz], oo = [o.x, o.y, o.z], dd = [d.x, d.y, d.z];
      for (let i = 0; i < 3 && ok; i++) { if (Math.abs(dd[i]) < 1e-6) { if (oo[i] < mn[i] || oo[i] > mx[i]) ok = false; } else { let a = (mn[i] - oo[i]) / dd[i], c = (mx[i] - oo[i]) / dd[i]; if (a > c) { const s = a; a = c; c = s; } t0 = Math.max(t0, a); t1 = Math.min(t1, c); if (t0 > t1) ok = false; } }
      if (ok && t0 > 0 && t0 < best) { best = t0; hit = { b, dist: t0 }; }
    }
    if (team < 0) for (const n of this.ores) { if (n.amount <= 0) continue; const t = sphere(n.pos.x, 1, n.pos.z, 2.1); if (t > 0 && t < best) { best = t; hit = { ore: n, dist: t }; } }
    return hit;
  }
  lookDir(out: THREE.Vector3) { const cp = Math.cos(this.pitch); return out.set(Math.sin(this.yaw) * cp, Math.sin(this.pitch), Math.cos(this.yaw) * cp); }
  groundPoint(out: THREE.Vector3, max: number) { const d = this.lookDir(TMP), o = this.cam.position; if (d.y > -.02) return false; const t = -o.y / d.y; if (t > max) return false; out.copy(o).addScaledVector(d, t); out.y = 0; return true; }

  // ------------------------------------------------------------ possession
  possess(u: Unit, force = false) {
    if (!u.alive || (u === this.me && !force)) return; if (!force && this.jumpCd > 0) { sfx.deny(); return; }
    const old = this.me; if (old && old.alive && old !== u) { setLayer(old.obj, 0); old.ring.layers.set(L_FX); if (old.kind === 'rigger') { old.state = 'idle'; old.site = null; } this.lastBody = old; }
    this.me = u; setLayer(u.obj, L_SELF); u.ring.layers.set(L_FX); this.yaw = u.yaw; this.pitch = 0; this.jumpCd = force ? 0 : 3; this.tool = 1; this.reloadT = 0; this.ammo = 24; u.target = null;
    if (u.site) { u.site.builder = null; u.site = null; } u.state = 'idle'; u.carrying = 0; if (u.obj.userData.pack) u.obj.userData.pack.visible = false;
    this.vmDrill.visible = u.kind === 'rigger'; this.vmRifle.visible = u.kind === 'linesman'; drillSound(false, false);
    if (!force) { sfx.jump(); this.feed(UNIT[u.kind].name, UNIT[u.kind].ack, 'in'); }
    if (!this.seenKinds.has(u.kind) && !force) { this.seenKinds.add(u.kind); this.phase = 'card'; this.cardT = 1.1; this.hud.titleCard(UNIT[u.kind].name, UNIT[u.kind].quip); sfx.card(); } else this.seenKinds.add(u.kind);
  }
  refreshTab() {
    const me = this.me!, list: Game['tabList'] = [];
    const near = (k: Kind) => this.own(k).filter(u => u !== me).sort((a, b) => a.pos.distanceTo(me.pos) - b.pos.distanceTo(me.pos))[0];
    const hot = this.own().filter(u => u !== me && this.time - u.lastHit < 4).sort((a, b) => b.lastHit - a.lastHit)[0];
    if (hot) list.push({ label: UNIT[hot.kind].name + ' under attack', task: 'Jump in and save them', unit: hot, hp: hot.hp / hot.maxHp, alert: true });
    const l = near('linesman'); if (l) { const o = l.order.type; list.push({ label: `Alpha · Linesman ×${this.own('linesman').length}`, task: o === 'amove' ? 'Pushing the east yard' : o === 'follow' ? 'Following you' : 'Holding the rally point', unit: l, hp: l.hp / l.maxHp, alert: false }); }
    const r = near('rigger'); if (r) list.push({ label: `Rigger ×${this.own('rigger').length}`, task: r.state === 'build' || r.state === 'toSite' ? 'Building' : 'Mining ore', unit: r, hp: r.hp / r.maxHp, alert: false });
    if (this.lastBody && this.lastBody.alive && this.lastBody !== me && !list.some(e => e.unit === this.lastBody)) list.push({ label: 'Last body · ' + UNIT[this.lastBody.kind].name, task: 'Where you just were', unit: this.lastBody, hp: this.lastBody.hp / this.lastBody.maxHp, alert: false });
    this.tabList = list; if (this.tabSel >= list.length) this.tabSel = 0;
  }

  // ------------------------------------------------------------ frame
  update(dtReal: number) {
    const P = this.pressed; dtReal = Math.min(dtReal, .1);
    this.pipe.time += dtReal;
    if (this.phase === 'card') { this.cardT -= dtReal; if (this.cardT <= 0) { this.phase = 'play'; this.hud.titleCard('', ''); } }
    if (this.phase === 'play') {
      // jump overlay
      const tabNow = this.keys.has('Tab') && !!this.me?.alive;
      if (tabNow && !this.tab) { this.tabSel = 0; this.refreshTab(); sfx.blip(); }
      if (!tabNow && this.tab) { const e = this.tabList[this.tabSel]; if (e && e.unit.alive) this.possess(e.unit); }
      this.tab = tabNow;
      if (this.tab) { for (let i = 0; i < this.tabList.length; i++) if (P.has('Digit' + (i + 1))) { this.tabSel = i; sfx.blip(); } if (this.wheel) { this.tabSel = (this.tabSel + (this.wheel > 0 ? 1 : this.tabList.length - 1)) % Math.max(1, this.tabList.length); sfx.blip(); } }
      const dt = dtReal * (this.tab ? .3 : 1);
      this.time += dt; this.jumpCd = Math.max(0, this.jumpCd - dtReal);
      if (this.staticT > 0) { this.staticT -= dtReal; if (this.staticT <= 0) this.respawn(); }
      else if (this.me?.alive && !this.tab) this.updatePlayer(dt, P);
      this.updateUnits(dt); this.updateBuildings(dt); this.updateDirector(dt);
    }
    // effects
    const t = this.pipe.time; for (const f of this.anim) f(t);
    for (const tr of this.tracers) if (tr.t > 0) { tr.t -= dtReal; if (tr.t <= 0) tr.m.visible = false; }
    for (const f of this.puffs) if (f.t > 0) { f.t -= dtReal; const k = 1 - f.t / f.life; f.m.position.addScaledVector(f.v, dtReal * 2.2); const s = f.s * (.4 + k) * (1 - k * k); f.m.scale.set(s, s, s); if (f.t <= 0) f.m.visible = false; }
    this.shake = Math.max(0, this.shake - dtReal * 2.5);
    this.units = this.units.filter(u => u.alive); this.buildings = this.buildings.filter(b => b.alive);
    if (!this.noRender) this.render(dtReal);
    P.clear(); this.mdx = this.mdy = 0; this.wheel = 0;
  }

  respawn() {
    const me = this.me!; let best: Unit | null = null, bd = 1e9; for (const u of this.own()) { const d = u.pos.distanceTo(me.pos); if (d < bd) { bd = d; best = u; } }
    if (!best && this.ownB('headframe').length) { best = this.spawn('rigger', 0, 2, 7); this.feed('Quartermaster', 'Found you a fresh Rigger. Try to keep this one.', ''); }
    if (best) { this.jumpCd = 0; this.possess(best, true); sfx.jump(); } else this.end(false);
  }

  updatePlayer(dt: number, P: Set<string>) {
    const me = this.me!, K = this.keys;
    this.yaw -= this.mdx * .0023; this.pitch = Math.max(-1.45, Math.min(1.45, this.pitch - this.mdy * .0023));
    let fx = 0, fz = 0; if (K.has('KeyW')) fz += 1; if (K.has('KeyS')) fz -= 1; if (K.has('KeyD')) fx += 1; if (K.has('KeyA')) fx -= 1;
    const sprint = K.has('ShiftLeft') && fz > 0; me.moving = false;
    if (fx || fz) { const l = Math.hypot(fx, fz), sp = me.speed * (sprint ? 1.5 : 1) * dt / l, s = Math.sin(this.yaw), c = Math.cos(this.yaw); me.pos.x += (s * fz - c * fx) * sp; me.pos.z += (c * fz + s * fx) * sp; me.moving = true; this.bob += dt * (sprint ? 13 : 9.5); this.collide(me, me.pos.x, me.pos.z); }
    me.yaw = this.yaw;
    this.fireCd -= dt; this.recoil = Math.max(0, this.recoil - dt * 6);
    const eye = TMP2.set(me.pos.x, UNIT[me.kind].eye, me.pos.z), dir = this.lookDir(V3());
    this.prompt = '';
    // jump shortcuts
    if (P.has('KeyQ') && this.lastBody?.alive) { this.possess(this.lastBody); return; }
    const look = this.ray(eye, dir, 70, -1, me);
    if (look?.unit && look.unit.team === 0) { this.prompt = `<b>F</b> Jump into ${UNIT[look.unit.kind].name}`; if (P.has('KeyF')) { this.possess(look.unit); return; } }
    // squad commands
    if (P.has('KeyV')) { const ls = this.own('linesman').filter(u => u !== me); if (ls.length) { const rel = this.following(); ls.forEach((u, i) => { u.slot = i; u.order = rel ? { type: 'guard', x: RALLY.x + ((i % 4) - 1.5) * 2.2, z: RALLY.z + Math.floor(i / 4) * 2.2 } : { type: 'follow', x: 0, z: 0 }; }); this.feed('Alpha', rel ? 'Back to the rally point. Finally, a sit-down.' : 'On you, boss. Try not to get us killed.', ''); if (this.plan?.phase !== 'go') { this.plan = null; this.callout = null; this.nextPlan = this.time + 60; } else if (!rel) this.plan = null; sfx.callout(); } else sfx.deny(); }
    if (P.has('Mouse1')) { const g = V3(); if (this.groundPoint(g, 160) || (look && g.copy(eye).addScaledVector(dir, look.dist).setY(0))) { const ls = this.own('linesman').filter(u => u !== me); if (ls.length) { for (const u of ls) u.order = { type: 'amove', x: g.x + R(-2, 2), z: g.z + R(-2, 2) }; this.feed('Alpha', 'Moving. Shooting anything purple on the way.', ''); this.hud.ping(g); sfx.callout(); } } }
    if (P.has('KeyG')) { this.auto = !this.auto; this.feed('Quartermaster', this.auto ? 'Back on the books. I\'ll handle the building.' : 'Fine. You do the paperwork.', ''); sfx.blip(); }
    // interact with production buildings
    if (look?.b && look.b.team === 0 && look.b.built && look.dist < 9 && (look.b.kind === 'headframe' || look.b.kind === 'bunkhouse')) {
      const k: Kind = look.b.kind === 'headframe' ? 'rigger' : 'linesman'; this.prompt = `<b>E</b> Train ${UNIT[k].name} · ${UNIT[k].cost} ore` + (look.b.queue.length ? ` · ${look.b.queue.length} queued` : '');
      if (P.has('KeyE')) this.train(look.b, k, true);
    }
    if (me.kind === 'rigger') this.updateRigger(dt, P, eye, dir, look); else this.updateGun(dt, P, eye, dir);
  }
  train(b: Building, k: Kind, manual = false) {
    if (this.ore < UNIT[k].cost) { if (manual) { sfx.deny(); this.feed('Quartermaster', 'Can\'t. We\'re broke. Go hit a rock.', 'al'); } return false; }
    if (this.supplyUsed() >= this.supplyCap()) { if (manual) { sfx.deny(); this.feed('Quartermaster', 'No beds. Build a Depot first.', 'al'); } return false; }
    if (b.queue.length >= 5) { if (manual) sfx.deny(); return false; }
    this.ore -= UNIT[k].cost; b.queue.push({ kind: k, t: UNIT[k].time }); if (manual) sfx.blip(); return true;
  }
  canPlace(k: BKind, x: number, z: number, rot: boolean) {
    const st = BLD[k], hx = rot ? st.hz : st.hx, hz = rot ? st.hx : st.hz;
    if (Math.hypot(x, z) > 75) return false;
    for (const b of this.buildings) if (b.alive && Math.abs(x - b.pos.x) < hx + b.hx + 1.6 && Math.abs(z - b.pos.z) < hz + b.hz + 1.6) return false;
    for (const o of this.ores) if (o.amount > 0 && Math.abs(x - o.pos.x) < hx + 2.4 && Math.abs(z - o.pos.z) < hz + 2.4) return false;
    for (const s of this.spires) if (Math.abs(x - s.x) < hx + s.r && Math.abs(z - s.z) < hz + s.r) return false;
    return true;
  }
  place(k: BKind, x: number, z: number, rot: boolean) { this.ore -= BLD[k].cost; const b = this.addBuilding(k, 0, x, z, false, rot); sfx.place(); return b; }

  updateRigger(dt: number, P: Set<string>, eye: THREE.Vector3, dir: THREE.Vector3, look: ReturnType<Game['ray']>) {
    const me = this.me!;
    if (P.has('Digit1')) { this.tool = 1; sfx.blip(); }
    if (P.has('Digit2')) { if (this.tool === 2) this.buildSel = (this.buildSel + 1) % BUILDABLE.length; this.tool = 2; sfx.blip(); }
    if (this.tool === 2 && this.wheel) { this.buildSel = (this.buildSel + (this.wheel > 0 ? 1 : BUILDABLE.length - 1)) % BUILDABLE.length; sfx.blip(); }
    if (this.tool === 2 && P.has('KeyR')) { this.buildRot = !this.buildRot; sfx.blip(); }
    if (this.tool === 2 && P.has('Mouse2')) { this.tool = 1; sfx.blip(); }
    let biting = false; const drilling = this.tool === 1 && this.lmb;
    if (this.tool === 2) {
      const k = BUILDABLE[this.buildSel], g = this.placePos;
      if (!this.groundPoint(g, 26)) { this.lookDir(TMP); g.set(me.pos.x + Math.sin(this.yaw) * 12, 0, me.pos.z + Math.cos(this.yaw) * 12); }
      g.x = Math.round(g.x); g.z = Math.round(g.z);
      this.placeOK = this.canPlace(k, g.x, g.z, this.buildRot) && this.ore >= BLD[k].cost && Math.hypot(g.x - me.pos.x, g.z - me.pos.z) > Math.max(BLD[k].hx, BLD[k].hz) + 1;
      if (P.has('Mouse0')) { if (this.placeOK) { this.place(k, g.x, g.z, this.buildRot); this.tool = 1; this.feed('Quartermaster', `${BLD[k].name} staked out. Hold the drill on it to speed things up.`, ''); } else { sfx.deny(); if (this.ore < BLD[k].cost) this.feed('Quartermaster', `A ${BLD[k].name} is ${BLD[k].cost} ore. We have ${Math.floor(this.ore)}.`, 'al'); } }
    } else if (drilling) {
      this.mineT -= dt;
      if (look && look.dist < 4.2) {
        if (look.ore) { biting = true; if (this.mineT <= 0) { this.mineT = .5; const n = Math.min(2, look.ore.amount); look.ore.amount -= n; this.ore += n; this.stats.mined += n; sfx.ore(); this.puff(TMP.copy(eye).addScaledVector(dir, look.dist - .2), 3, .16, M.ore, 1.4); this.hud.damage(TMP.copy(eye).addScaledVector(dir, look.dist - .3), '+' + n, 'ore'); this.oreCheck(look.ore); } }
        else if (look.b && look.b.team === 0 && !look.b.built) { biting = true; look.b.progress += dt / BLD[look.b.kind].time * 1.6; if (this.mineT <= 0) { this.mineT = .2; this.puff(TMP.copy(eye).addScaledVector(dir, look.dist), 1, .35, M.flash, .8); } }
        else if (look.b && look.b.team === 0 && look.b.built && look.b.hp < look.b.maxHp) { biting = true; look.b.hp = Math.min(look.b.maxHp, look.b.hp + 30 * dt); if (this.mineT <= 0) { this.mineT = .2; this.puff(TMP.copy(eye).addScaledVector(dir, look.dist), 1, .35, M.flash, .8); } }
        else if ((look.unit && look.unit.team === 1 && look.dist < 2.8) || (look.b && look.b.team === 1 && look.dist < 2.8)) { biting = true; if (this.mineT <= 0) { this.mineT = .3; this.damage((look.unit || look.b)!, 9, me); sfx.hit(); } }
      }
      const bit = this.vmDrill.userData.bit; bit.rotation.z += dt * (biting ? 30 : 22);
    }
    if (!this.prompt && this.tool === 1 && look && look.dist < 4.2) { if (look.ore) this.prompt = '<b>Hold click</b> Drill ore'; else if (look.b && look.b.team === 0 && !look.b.built) this.prompt = '<b>Hold click</b> Weld it up faster'; else if (look.b && look.b.team === 0 && look.b.hp < look.b.maxHp) this.prompt = '<b>Hold click</b> Patch it up'; }
    drillSound(drilling, biting);
  }
  oreCheck(n: OreNode) { if (n.amount <= 0) { n.obj.traverse((m: any) => { if (m.isMesh && m.material === M.ore) m.material = M.oreDead; }); n.obj.scale.setScalar(.6); } }

  updateGun(dt: number, P: Set<string>, eye: THREE.Vector3, dir: THREE.Vector3) {
    const me = this.me!; const flash = this.vmRifle.userData.flash; flash.visible = false;
    if (this.reloadT > 0) { this.reloadT -= dt; if (this.reloadT <= 0) this.ammo = 24; return; }
    if ((P.has('KeyR') && this.ammo < 24) || (this.ammo <= 0 && this.lmb)) { this.reloadT = 1.4; sfx.reload(); return; }
    if (this.lmb && this.fireCd <= 0 && this.ammo > 0) {
      this.fireCd = .12; this.ammo--; this.recoil = Math.min(1, this.recoil + .35); this.pitch = Math.min(1.45, this.pitch + .006); this.shake = Math.min(1, this.shake + .12); sfx.shot(); flash.visible = true; flash.rotation.z = R(0, 3);
      const d = TMP.copy(dir); d.x += R(-.008, .008); d.y += R(-.008, .008); d.z += R(-.008, .008); d.normalize();
      let hit = this.ray(eye, d, 140, -1, me); if (hit && ((hit.unit && hit.unit.team === 0) || (hit.b && hit.b.team === 0 && hit.dist < 3))) hit = this.ray(eye, d, 140, 1, me); const dist = hit ? hit.dist : 140; const end = V3().copy(eye).addScaledVector(d, dist);
      const muzzle = V3(); this.vmRifle.userData.flash.getWorldPosition(muzzle); this.tracer(muzzle, end);
      if (hit?.unit && hit.unit.team === 1) { this.damage(hit.unit, hit.head ? 15 : 7, me, !!hit.head); sfx.hit(); this.hud.hitmark(!!hit.head); this.puff(end, 2, .4, M.teal, .6); }
      else if (hit?.b && hit.b.team === 1) { this.damage(hit.b, 7, me); this.hud.hitmark(false); this.puff(end, 2, .5, M.teal, .6); }
      else if (hit || d.y < 0) { if (!hit && d.y < 0) { const t = -eye.y / d.y; if (t < 140) end.copy(eye).addScaledVector(d, t); } this.puff(end, 2, .4, M.dust, .6); }
    }
  }

  // ------------------------------------------------------------ AI
  updateUnits(dt: number) {
    const us = this.units;
    for (const u of us) {
      if (!u.alive) continue; if (u !== this.me) u.moving = false; u.cd -= dt; u.think -= dt; u.swing = Math.max(0, u.swing - dt * 4);
      if (u.maxShield && this.time - u.lastHit > 5) u.shield = Math.min(u.maxShield, u.shield + 14 * dt);
      if (u !== this.me || this.staticT > 0) { if (u.kind === 'rigger') this.aiRigger(u, dt); else if (u.kind === 'linesman') this.aiLinesman(u, dt); else this.aiCantor(u, dt); }
    }
    // separation
    for (let i = 0; i < us.length; i++) for (let j = i + 1; j < us.length; j++) { const a = us[i], b = us[j]; if (!a.alive || !b.alive) continue; const dx = b.pos.x - a.pos.x, dz = b.pos.z - a.pos.z, d2 = dx * dx + dz * dz; const mine = a === this.me || b === this.me, lim = mine ? 1.7 : 1.05; if (d2 < lim * lim && d2 > 1e-5) { const d = Math.sqrt(d2), p = (lim - d) * .5; const wa = a === this.me ? 0 : mine ? 2 : 1, wb = b === this.me ? 0 : mine ? 2 : 1; a.pos.x -= dx / d * p * wa; a.pos.z -= dz / d * p * wa; b.pos.x += dx / d * p * wb; b.pos.z += dz / d * p * wb; } }
    for (const u of us) {
      if (!u.alive) continue; u.obj.position.x = u.pos.x; u.obj.position.z = u.pos.z;
      let dy = u.yaw - u.obj.rotation.y; dy = Math.atan2(Math.sin(dy), Math.cos(dy)); u.obj.rotation.y += dy * Math.min(1, dt * 12);
      const r = u.rig; if (u.moving) u.phase += dt * 11; const amp = u.moving ? .75 : 0;
      if (r.legL && r.legR) { const s = Math.sin(u.phase) * amp; r.legL.rotation.x += (s - r.legL.rotation.x) * Math.min(1, dt * 14); r.legR.rotation.x += (-s - r.legR.rotation.x) * Math.min(1, dt * 14); u.obj.position.y = u.moving ? Math.abs(Math.cos(u.phase)) * .06 : 0; r.body.rotation.x = u.moving ? .08 : 0; }
      else { u.obj.position.y = .12 + Math.sin(this.time * 2.4 + u.id) * .07; r.body.rotation.x = u.moving ? .16 : 0; if (r.arm) r.arm.rotation.x = -u.swing * 1.6; }
      if (u.kind === 'linesman' && r.arm) r.arm.position.z = .44 - Math.max(0, u.swing) * .12;
    }
  }
  aiRigger(u: Unit, dt: number) {
    const hq = this.ownB('headframe')[0];
    if (u.site && (!u.site.alive || u.site.built)) { u.site = null; u.state = 'idle'; }
    if (u.site) {
      const b = u.site; if (this.distToBox(b, u.pos.x, u.pos.z) > 1.6) { this.moveTo(u, b.pos.x, b.pos.z, dt); u.state = 'toSite'; } else { u.state = 'build'; u.yaw = Math.atan2(b.pos.x - u.pos.x, b.pos.z - u.pos.z); b.progress += dt / BLD[b.kind].time; if (u.think <= 0) { u.think = .25; this.puff(TMP.set(u.pos.x + Math.sin(u.yaw) * .9, 1, u.pos.z + Math.cos(u.yaw) * .9), 1, .3, M.flash, .8); } }
      return;
    }
    if (u.state === 'idle' || (u.node && u.node.amount <= 0 && u.state !== 'toHQ')) { let best: OreNode | null = null, bd = 1e9; for (const n of this.ores) { if (n.amount <= 0) continue; const d = n.pos.distanceTo(u.pos) + (this.units.filter(o => o.node === n).length) * 6; if (d < bd) { bd = d; best = n; } } u.node = best; u.state = best ? 'toOre' : 'wait'; }
    if (u.state === 'toOre' && u.node) { if (this.moveTo(u, u.node.pos.x, u.node.pos.z, dt, 2.5)) { u.state = 'mining'; u.timer = 3; } }
    else if (u.state === 'mining' && u.node) { u.yaw = Math.atan2(u.node.pos.x - u.pos.x, u.node.pos.z - u.pos.z); u.timer -= dt; u.rig.body.rotation.x = Math.sin(this.time * 18) * .04; if (u.timer <= 0) { const n = Math.min(7, u.node.amount); u.node.amount -= n; u.carrying = n; this.oreCheck(u.node); u.obj.userData.pack.visible = true; u.state = 'toHQ'; } }
    else if (u.state === 'toHQ') { if (!hq) { u.state = 'wait'; return; } if (this.distToBox(hq, u.pos.x, u.pos.z) < 1.7) { this.ore += u.carrying; this.stats.mined += u.carrying; u.carrying = 0; u.obj.userData.pack.visible = false; u.state = 'idle'; } else this.moveTo(u, hq.pos.x + 1.6, hq.pos.z + hq.hz + .8, dt, .3); }
  }
  acquire(u: Unit, range: number, bRange: number) {
    let best: Unit | Building | null = null, bd = range;
    for (const o of this.units) { if (!o.alive || o.team === u.team) continue; const d = o.pos.distanceTo(u.pos); if (d < bd) { bd = d; best = o; } }
    if (!best) { bd = bRange; for (const b of this.buildings) { if (!b.alive || b.team === u.team) continue; const d = this.distToBox(b, u.pos.x, u.pos.z); if (d < bd) { bd = d; best = b; } } }
    return best;
  }
  aiLinesman(u: Unit, dt: number) {
    if (u.think <= 0) { u.think = .3; u.target = this.acquire(u, 30, u.order.type === 'guard' ? 0 : 26); }
    const t = u.target;
    if (t && t.alive) {
      const isB = !(t as Unit).rig, d = isB ? this.distToBox(t as Building, u.pos.x, u.pos.z) : t.pos.distanceTo(u.pos);
      u.yaw = Math.atan2(t.pos.x - u.pos.x, t.pos.z - u.pos.z);
      if (d > 19) this.moveTo(u, t.pos.x, t.pos.z, dt);
      else if (u.cd <= 0) {
        u.cd = .38 + R(0, .08); u.swing = 1; const hit = isB || Math.random() < .7;
        const a = V3(u.pos.x + Math.sin(u.yaw) * .9, 1.0, u.pos.z + Math.cos(u.yaw) * .9), b = V3(t.pos.x, isB ? Math.min((t as Building).h * .5, 3) : 1.2, t.pos.z); if (!hit) b.add(TMP.set(R(-1.5, 1.5), R(-.5, 1.5), R(-1.5, 1.5)));
        this.tracer(a, b); sfx.shot(this.vol(u.pos) * .5); if (hit) this.damage(t, isB ? 5 : 8, u);
      }
      return;
    }
    u.target = null; const o = u.order, me = this.me;
    if (o.type === 'follow' && me?.alive) { const a = u.slot * 2.4, r = 2.6 + (u.slot % 3) * .9, tx = me.pos.x + Math.cos(a) * r, tz = me.pos.z + Math.sin(a) * r; if (Math.hypot(tx - u.pos.x, tz - u.pos.z) > 1.6) this.moveTo(u, tx, tz, dt, .5, 1.25); }
    else if (o.type !== 'follow') this.moveTo(u, o.x, o.z, dt, o.type === 'amove' ? 5 : .6);
  }
  aiCantor(u: Unit, dt: number) {
    u.dashCd -= dt; u.dashT -= dt;
    if (u.think <= 0) { u.think = .3; const raid = u.order.type === 'raid'; const cur = u.target; if (!cur || !cur.alive || !(cur as Unit).rig) u.target = this.acquire(u, raid ? 22 : 28, raid ? 12 : 0); }
    const t = u.target;
    if (t && t.alive) {
      const isB = !(t as Unit).rig, d = isB ? this.distToBox(t as Building, u.pos.x, u.pos.z) : t.pos.distanceTo(u.pos);
      if (!isB && d > 45) { u.target = null; return; }
      if (d > (isB ? 1.3 : 1.9)) { if (d > 6 && d < 13 && u.dashCd <= 0) { u.dashT = .4; u.dashCd = 5; this.puff(TMP.copy(u.pos).setY(.5), 3, .7, M.teal, .4); } this.moveTo(u, t.pos.x, t.pos.z, dt, .5, u.dashT > 0 ? 2.6 : 1); }
      else { u.yaw = Math.atan2(t.pos.x - u.pos.x, t.pos.z - u.pos.z); if (u.cd <= 0) { u.cd = .95; u.swing = 1; sfx.slash(this.vol(u.pos)); this.damage(t, isB ? 10 : 13, u); } }
      return;
    }
    const o = u.order; this.moveTo(u, o.x, o.z, dt, o.type === 'raid' ? 3 : 1.5, o.type === 'raid' ? 1 : .6);
  }
  updateBuildings(dt: number) {
    for (const b of this.buildings) {
      if (!b.alive) continue;
      if (!b.built) {
        b.progress = Math.min(1, b.progress); b.hp = Math.max(b.hp, b.maxHp * (.1 + .9 * b.progress)); b.obj.scale.y = Math.max(.06, b.progress);
        if (b.progress >= 1) { b.built = true; b.hp = b.maxHp; b.obj.scale.y = 1; if (b.holo) { this.scene.remove(b.holo); b.holo = null; } if (b.builder) { b.builder.site = null; b.builder.state = 'idle'; b.builder = null; } sfx.built(); this.puff(TMP.copy(b.pos).setY(1.5), 8, 1.6, M.dust, .8); this.feed('Quartermaster', b.kind === 'bunkhouse' ? 'Bunkhouse is up. Time to hire some attitude.' : b.kind === 'depot' ? 'Depot done. Eight more beds.' : `${BLD[b.kind].name} is up.`, ''); }
        else if (b.team === 0 && (!b.builder || !b.builder.alive || b.builder === this.me)) { let best: Unit | null = null, bd = 1e9; for (const u of this.own('rigger')) { if (u === this.me || u.site) continue; const d = u.pos.distanceTo(b.pos) + (u.carrying ? 15 : 0); if (d < bd) { bd = d; best = u; } } if (best) { best.site = b; b.builder = best; } }
        continue;
      }
      if (b.queue.length) { const q = b.queue[0]; q.t -= dt; if (q.t <= 0) { b.queue.shift(); const u = this.spawn(q.kind, 0, b.pos.x + (b.kind === 'bunkhouse' && !b.rot ? b.hx + 1.2 : R(-1, 3)), b.pos.z + (b.kind === 'bunkhouse' && !b.rot ? 0 : b.hz + 1.2)); this.puff(TMP.copy(u.pos).setY(1), 4, .8, M.dust); if (q.kind === 'linesman' && this.vol(b.pos) > .2) sfx.blip(); } }
      if (b.kind === 'choir') {
        b.cd -= dt; if (b.cd <= 0) { b.cd = 1.15; let tgt: Unit | null = null, bd = 21; for (const o of this.units) { if (!o.alive || o.team === b.team) continue; const d = o.pos.distanceTo(b.pos); if (d < bd) { bd = d; tgt = o; } }
          if (tgt) { this.tracer(V3(b.pos.x, 8.5, b.pos.z), V3(tgt.pos.x, 1.1, tgt.pos.z), beamMat, .16); sfx.slash(this.vol(b.pos) * .7); this.damage(tgt, 6, b); this.puff(TMP.copy(tgt.pos).setY(1), 2, .5, M.teal, .5); } }
      }
      if (b.kind === 'watchpost') {
        b.cd -= dt; let tgt: Unit | null = null, bd = 32; for (const o of this.units) { if (!o.alive || o.team === b.team) continue; const d = o.pos.distanceTo(b.pos); if (d < bd) { bd = d; tgt = o; } }
        if (tgt) { const gun = b.obj.userData.gun; gun.rotation.y = Math.atan2(tgt.pos.x - b.pos.x, tgt.pos.z - b.pos.z) - b.obj.rotation.y; if (b.cd <= 0) { b.cd = .5; const a = V3(b.pos.x, 6, b.pos.z), e = V3(tgt.pos.x, 1.3, tgt.pos.z); this.tracer(a, e); sfx.turret(this.vol(b.pos) * .6); this.damage(tgt, 9, b); } }
      }
    }
  }

  // ------------------------------------------------------------ quartermaster, raids, squad plans
  updateDirector(dt: number) {
    const now = this.time;
    while (this.hintI < HINTS.length && now >= (HINTS[this.hintI][0] as number)) { const h = HINTS[this.hintI++]; this.feed(h[1] as string, h[2] as string, 'in'); }
    if (!this.firstLine && this.own('linesman').length) { this.firstLine = true; this.feed('Quartermaster', 'First Linesman on the payroll. Look at him and press F to jump in, or hold Tab.', 'in'); sfx.callout(); }
    if (this.raidLive && !this.units.some(u => u.alive && u.team === 1 && u.order.type === 'raid')) { this.raidLive = false; this.feed('Alpha', 'Yard\'s clear. Somebody sweep up the purple.', ''); }
    this.qmT -= dt;
    if (this.qmT <= 0 && this.auto) {
      this.qmT = 1; const hq = this.ownB('headframe', true)[0], bunk = this.ownB('bunkhouse'), bunkUp = bunk.filter(b => b.built), sites = this.ownB().filter(b => !b.built);
      const free = this.supplyCap() - this.supplyUsed();
      const wantDepot = bunk.length > 0 && free <= 2 && !sites.some(b => b.kind === 'depot') && this.ownB('depot').length < 5;
      if (!bunk.length && this.ore >= 150 && this.canPlace('bunkhouse', 15, 8, false)) { this.place('bunkhouse', 15, 8, false); this.feed('Quartermaster', 'Staking out a Bunkhouse. Then we get rich.', ''); }
      else if (wantDepot && this.ore >= 100) { const s = DEPOT_SLOTS.find(([x, z]) => this.canPlace('depot', x, z, false)); if (s) { this.place('depot', s[0], s[1], false); this.feed('Quartermaster', 'Running out of beds. Stacking another Depot.', ''); } }
      else if (bunkUp.length && this.own('linesman').length >= 5 && !this.ownB('watchpost').length && this.ore >= 200 && this.canPlace('watchpost', 31, 20, false)) { this.place('watchpost', 31, 20, false); this.feed('Quartermaster', 'Putting a Watchpost on the east road. For my nerves.', ''); }
      else if (bunkUp.length === 1 && bunk.length === 1 && this.time > 240 && this.ore >= 260 && this.canPlace('bunkhouse', 4, 17, false)) { this.place('bunkhouse', 4, 17, false); this.feed('Quartermaster', 'Second Bunkhouse. Twice the complaints.', ''); }
      if (hq && !hq.queue.length && this.own('rigger').length < 7 && free > 0 && this.ore >= 50 && (bunk.length || this.own('rigger').length < 6)) this.train(hq, 'rigger');
      for (const b of bunkUp) if (b.queue.length < 2 && this.ore >= (sites.length || wantDepot ? 160 : 60)) this.train(b, 'linesman');
    }
    // enemy raids and reinforcements
    const stones = this.stones();
    if (stones.length) {
      this.raidT -= dt; if (this.raidT <= 0) { const n = Math.min(2 + Math.floor(this.raidN * .7), 9); this.raidN++; this.raidT = 90; this.raidLive = true; for (let i = 0; i < n; i++) { const c = this.spawn('cantor', 1, OUTPOST.x - 10 + R(-3, 3), OUTPOST.z + R(-6, 6)); c.order = { type: 'raid', x: R(-3, 6), z: R(4, 9) }; } this.feed('Lookout', `${n} Cantors coming down the east road. They look annoyed.`, 'al'); sfx.alarm(); }
      this.reinT -= dt; if (this.reinT <= 0) { this.reinT = 25; const guards = this.units.filter(u => u.alive && u.team === 1 && u.order.type === 'guard').length; if (guards < 4 + stones.length) { const c = this.spawn('cantor', 1, OUTPOST.x + R(-3, 3), OUTPOST.z + R(-3, 3)); c.order = { type: 'guard', x: OUTPOST.x - 6 + R(-4, 4), z: OUTPOST.z + R(-8, 8) }; } }
    }
    // squad plan
    const ls = this.own('linesman'), idle = ls.filter(u => u.order.type === 'guard' && u !== this.me);
    if (this.callout) { this.callout.t -= dt; }
    if (!this.plan && idle.length >= 6 && now > this.nextPlan && stones.length) {
      this.plan = { phase: 'ask', t: 9, target: this.nearestStone(RALLY) }; this.callout = { who: 'Alpha Lead', text: `${idle.length} of us are standing around. We hit their east yard in twenty. <b>You in, or what?</b>`, t: 9, dur: 9 }; sfx.callout();
    }
    if (this.plan) {
      const p = this.plan, P = this.pressed; p.t -= dt;
      if (p.phase === 'ask') {
        if (P.has('KeyX')) { this.plan = null; this.callout = null; this.nextPlan = now + 30; this.feed('Alpha', 'Holding. Wake us when you\'re ready.', ''); sfx.blip(); }
        else if (P.has('KeyZ') || p.t <= 0) { p.phase = 'count'; p.t = P.has('KeyZ') ? 5 : 12; this.callout = null; this.feed('Alpha', P.has('KeyZ') ? 'That\'s the spirit. Moving out.' : 'No answer. Taking that as a yes.', ''); sfx.blip(); }
      } else if (p.phase === 'count') {
        if (p.t <= 0) { p.phase = 'go'; p.target = this.nearestStone(RALLY); if (p.target) for (const u of ls) if (u !== this.me && u.order.type === 'guard') u.order = { type: 'amove', x: p.target.pos.x, z: p.target.pos.z }; this.feed('Alpha', 'Pushing the east yard. Shoot the glowy bits.', ''); sfx.callout(); }
      } else if (p.phase === 'go') {
        const pushing = ls.filter(u => u.order.type === 'amove');
        if (!pushing.length || (pushing.length < 2 && ls.length < 3)) { this.plan = null; this.nextPlan = now + 45; for (const u of ls) if (u.order.type === 'amove') u.order = { type: 'guard', x: RALLY.x + ((u.slot % 4) - 1.5) * 2.2, z: RALLY.z + Math.floor(u.slot / 4) * 2.2 }; this.feed('Alpha', 'Push is spent. Pulling back to regroup.', 'al'); }
      }
    }
  }
  playbookPhase() { return !this.ownB('bunkhouse', true).length ? 0 : this.plan?.phase === 'go' ? 2 : 1; }

  // ------------------------------------------------------------ render
  render(dt: number) {
    const me = this.me, cam = this.cam, pipe = this.pipe;
    cam.aspect = pipe.w / pipe.h;
    const build = this.phase !== 'menu' && this.tool === 2 && me?.kind === 'rigger' && me.alive && !this.tab;
    for (const k of BUILDABLE) { const on = build && BUILDABLE[this.buildSel] === k; this.ghost[k].visible = on && this.placeOK; this.ghostBad[k].visible = on && !this.placeOK; if (on) { const g = this.placeOK ? this.ghost[k] : this.ghostBad[k]; g.position.copy(this.placePos); g.rotation.y = this.buildRot ? Math.PI / 2 : 0; } }
    holoOK.opacity = .3 + Math.sin(pipe.time * 3) * .07;
    for (const u of this.units) u.ring.visible = this.tab && u.team === 0;
    pipe.static = this.staticT > 0 ? .85 : 0; pipe.sat = this.tab ? .8 : 1;
    if (this.phase === 'menu') {
      const a = pipe.time * .08; cam.fov = 50; cam.position.set(Math.sin(a) * 34 + 4, 9, Math.cos(a) * 34); cam.lookAt(2, 5, 0); this.vmDrill.visible = this.vmRifle.visible = false; if (me) setLayer(me.obj, 0);
      cam.updateProjectionMatrix(); cam.updateMatrixWorld(); pipe.draw(this.scene, cam, V3(0, 0, 0), 120); return;
    }
    if (me) { if (me.obj.children[0].layers.mask !== (1 << L_SELF)) { setLayer(me.obj, L_SELF); me.ring.layers.set(L_FX); } }
    if (this.tab && me) {
      const iso = this.iso, h = 30, w = h * pipe.w / pipe.h; iso.left = -w; iso.right = w; iso.top = h; iso.bottom = -h; iso.updateProjectionMatrix();
      const shift = w * .28; iso.position.set(me.pos.x + shift, 150, me.pos.z + 120); iso.lookAt(me.pos.x + shift, 0, me.pos.z); iso.updateMatrixWorld();
      this.vmDrill.visible = this.vmRifle.visible = false; setLayer(me.obj, 0); me.ring.layers.set(L_FX);
      pipe.draw(this.scene, iso, me.pos, 150);
      this.hud.update(this, iso); setLayer(me.obj, L_SELF); me.ring.layers.set(L_FX); this.vmDrill.visible = me.kind === 'rigger'; this.vmRifle.visible = me.kind === 'linesman'; return;
    }
    if (me) {
      const sprint = this.keys.has('ShiftLeft') && me.moving; cam.fov += ((sprint ? 74 : 68) - cam.fov) * Math.min(1, dt * 8);
      const bobY = me.moving ? Math.sin(this.bob) * .035 : 0, sh = this.shake * .03;
      cam.position.set(me.pos.x + R(-sh, sh), UNIT[me.kind].eye + bobY + R(-sh, sh), me.pos.z); cam.rotation.set(this.pitch + this.recoil * .012, this.yaw + Math.PI, 0, 'YXZ');
      this.vmDrill.visible = me.kind === 'rigger' && this.staticT <= 0; this.vmRifle.visible = me.kind === 'linesman' && this.staticT <= 0;
      const vm = me.kind === 'rigger' ? this.vmDrill : this.vmRifle; vm.position.y = (me.kind === 'rigger' ? -.25 : -.24) + (me.moving ? Math.sin(this.bob * 2) * .006 : 0) - (this.reloadT > 0 ? Math.sin(Math.min(1, this.reloadT / 1.4) * Math.PI) * .16 : 0); vm.position.z = (me.kind === 'rigger' ? -.56 : -.5) + this.recoil * .05; vm.position.x = (me.kind === 'rigger' ? .3 : .27) + (me.moving ? Math.cos(this.bob) * .008 : 0);
    }
    cam.updateProjectionMatrix(); cam.updateMatrixWorld();
    pipe.draw(this.scene, cam, me ? me.pos : V3(), 110);
    this.hud.update(this, cam);
  }
}
