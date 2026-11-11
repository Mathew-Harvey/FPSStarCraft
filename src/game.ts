// The simulation and the player: entities, combat, effects, the first-person bodies,
// and jumping between them. Strategy (economy AI, raids, squad plans) lives in director.ts.
import * as THREE from 'three';
import { Pipeline, ViewPipe, V3, M, G, R, mk, setLayer, L_FX, L_SELF, holoOK, holoBad, ringMat, tracerMat, makeSky } from './gfx';
import * as MD from './models';
import { sfx, drillSound, setMood, babble } from './audio';
import type { Hud } from './hud';
import { Kind, BKind, UNIT, BLD, BUILDABLE, UPGRADES, TRAINS, UNIT_NEEDS, UpKey, Unit, Building, Prop, OreNode, Difficulty, DIFFS, OUTPOST, GATE, MAP, MAPS, ROAD, setMap, veylPt, isUnit, isSoldier } from './data';
import { Director } from './director';
import type { Mission } from './campaign';
import type { Net } from './net';
import { applySnap, netTick, RAID_CALL_AT } from './netgame';

const TMP = V3(), TMP2 = V3(), UP = V3(0, 1, 0), QT = new THREE.Quaternion();
export const beamMat = new THREE.MeshBasicMaterial({ color: 0x6dfff0, depthWrite: false });
const bubbleMat = new THREE.MeshBasicMaterial({ color: 0x6dfff0, transparent: true, opacity: .4, depthWrite: false, blending: THREE.AdditiveBlending });
const warnMat = new THREE.MeshBasicMaterial({ color: 0xff4f9a, transparent: true, opacity: .9, depthWrite: false, side: THREE.DoubleSide });
let nextId = 1;
type Hit = { unit?: Unit; b?: Building; ore?: OreNode; prop?: Prop; dist: number; head?: boolean };
interface Proj { obj: THREE.Object3D; pos: THREE.Vector3; vel: THREE.Vector3; team: number; dmg: number; nade: boolean; life: number; from: Unit | null; ghost: number }
const r1 = (v: number) => Math.round(v * 10) / 10;
interface Corpse { obj: THREE.Object3D; t: number; veyl: boolean; ax: number; az: number; s: number }
interface Weapon { name: string; mag: number; cd: number; reload: number }
const GUNS: Record<string, Weapon> = { linesman: { name: 'Rifle', mag: 24, cd: .12, reload: 1.5 }, breacher: { name: 'Scattergun', mag: 6, cd: .78, reload: 2.1 }, gantry: { name: 'Autocannon', mag: 12, cd: .36, reload: 2.4 }, longshot: { name: 'Long Rifle', mag: 5, cd: 1.15, reload: 2.4 }, patch: { name: 'Rivet Pistol', mag: 14, cd: .2, reload: 1.3 } };
/** Tuning for the aimed, single-bullet guns. */
const SHOT: Record<string, { vm: string; body: number; head: number; bld: number; sp: number; adsK: number; zoom: number; sens: number; kick: number }> = {
  linesman: { vm: 'rifle', body: 7, head: 15, bld: 4, sp: .011, adsK: .75, zoom: 24, sens: .45, kick: .007 },
  longshot: { vm: 'long', body: 58, head: 150, bld: 14, sp: .05, adsK: .995, zoom: 50, sens: .78, kick: .03 },
  patch: { vm: 'pistol', body: 6, head: 12, bld: 3, sp: .014, adsK: .6, zoom: 10, sens: .25, kick: .006 },
};

export class Game {
  scene = new THREE.Scene();
  cam = new THREE.PerspectiveCamera(68, 1, .06, 4000);
  iso = new THREE.OrthographicCamera(-40, 40, 22, -22, 1, 700);
  units: Unit[] = []; buildings: Building[] = []; ores: OreNode[] = []; spires: Prop[] = []; props: Prop[] = [];
  chunks: { m: THREE.Mesh; t: number; v: THREE.Vector3; w: THREE.Vector3; s: number; rest: boolean }[] = []; thudT = 0;
  wrecks: { b: Building; t: number; dur: number; tall: boolean; dx: number; dz: number; yaw: number; puffT: number }[] = [];
  craters: { m: THREE.Group; t: number }[] = [];
  anim: ((t: number) => void)[] = [];
  ore = 100; time = 0; phase: 'menu' | 'play' | 'paused' | 'card' | 'over' = 'menu'; won = false;
  up = Object.fromEntries(UPGRADES.map(u => [u.key, false])) as Record<UpKey, boolean>;
  dir!: Director;
  // the player
  me: Unit | null = null; lastBody: Unit | null = null; yaw = 0; pitch = 0; jumpCd = 0; seenKinds = new Set<string>(); cardT = 0; staticT = 0;
  tool = 1; buildSel = 0; buildRot = false; placeOK = false; placePos = V3(); ghost: Record<string, THREE.Group> = {}; ghostBad: Record<string, THREE.Group> = {};
  ammo = 24; reloadT = 0; fireCd = 0; recoil = 0; ads = 0; brace = false; nadeCd = 0; bashCd = 0; bashT = 0; mineT = 0; bob = 0; prompt = ''; swayX = 0; swayY = 0; sens = 1;
  tab = false; tabSel = 0; tabList: { label: string; task: string; unit: Unit; hp: number; alert: boolean }[] = [];
  keys = new Set<string>(); pressed = new Set<string>(); mdx = 0; mdy = 0; lmb = false; rmb = false; wheel = 0;
  obj = { drilled: 0, jumped: false, answered: false, built: false, called: false };
  stats = { kills: 0, lost: 0, mined: 0, built: 0, lostTo: {} as Record<string, number> };
  // effects
  vm: Record<string, THREE.Group> = {};
  tracers: { m: THREE.Mesh; t: number }[] = []; puffs: { m: THREE.Mesh; t: number; life: number; v: THREE.Vector3; s: number }[] = [];
  bits: { m: THREE.Mesh; t: number; v: THREE.Vector3; spin: number }[] = []; scorch: { m: THREE.Mesh; t: number; s: number }[] = [];
  bubbles: { m: THREE.Mesh; t: number; u: Unit | null }[] = []; warns: { m: THREE.Mesh; t: number; life: number; r: number }[] = [];
  projs: Proj[] = []; corpses: Corpse[] = []; boltProto = MD.bolt(); nadeProto = MD.grenade();
  shake = 0; noRender = false; alertT = 0; mood = 0;
  introT = 0; menuPos = V3(); menuQuat = new THREE.Quaternion(); hitStop = 0; streak = 0; streakT = 0; kick = 0; stepPhase = 0; dustT = 0; hopT = 0; hopCd = 0; hopX = 0; hopZ = 0; endT = 0; endWon = false;

  constructor(public pipe: Pipeline | ViewPipe, public hud: Hud, public diff: Difficulty = DIFFS[1], public mapI = 0, public mission: Mission | null = null, public net: Net | null = null) {
    setMap(mapI); (M.ground as any).uniforms.uColor.value.setRGB(MAP.ground[0], MAP.ground[1], MAP.ground[2]); (M.mesa as any).uniforms.uColor.value.setRGB(MAP.mesa[0], MAP.mesa[1], MAP.mesa[2]); (M.rock as any).uniforms.uColor.value.setRGB(MAP.rock[0], MAP.rock[1], MAP.rock[2]); 
    const s = this.scene; s.add(makeSky()); MD.buildWorld(s, this.props, this.anim); this.spires = this.props.filter(p => p.solid); s.add(this.cam);
    this.vm = { drill: MD.vmDrill(), rifle: MD.vmRifle(), scatter: MD.vmScatter(), shield: MD.vmShield(), cannon: MD.vmCannon(), long: MD.vmLong(), pistol: MD.vmPistol(), veyl: MD.vmVeyl() };
    for (const k in this.vm) { this.vm[k].visible = false; this.cam.add(this.vm[k]); }
    for (const k of BUILDABLE) { const src = this.model(k); this.ghost[k] = MD.hologram(src, holoOK); this.ghostBad[k] = MD.hologram(src, holoBad); this.ghost[k].visible = this.ghostBad[k].visible = false; s.add(this.ghost[k], this.ghostBad[k]); }
    const pool = (n: number, geo: THREE.BufferGeometry, mat: THREE.Material, fx: boolean) => { const out: THREE.Mesh[] = []; for (let i = 0; i < n; i++) { const m = mk(geo, mat, 0, 0, 0, s); if (fx) m.layers.set(L_FX); m.visible = false; out.push(m); } return out; };
    this.tracers = pool(36, G.cyl8, tracerMat, true).map(m => ({ m, t: 0 }));
    this.puffs = pool(80, G.sph, M.dust, false).map(m => ({ m, t: 0, life: 1, v: V3(), s: 1 }));
    this.bits = pool(90, G.box, M.rust, false).map(m => ({ m, t: 0, v: V3(), spin: 0 }));
    this.chunks = pool(240, G.dod, M.rock, false).map(m => ({ m, t: 0, v: V3(), w: V3(), s: 1, rest: false }));
    this.scorch = pool(18, G.disc, M.scorch, false).map(m => { m.rotation.x = -Math.PI / 2; return { m, t: 0, s: 1 }; });
    this.bubbles = pool(10, G.sph, bubbleMat, true).map(m => ({ m, t: 0, u: null }));
    this.warns = pool(6, G.ringG, warnMat, true).map(m => { m.rotation.x = -Math.PI / 2; return { m, t: 0, life: 1, r: 1 }; });
    // the Ironhold base
    if (!net) this.addBuilding('headframe', 0, 0, 0, true);
    const field = (list: number[][], amount: number) => { for (const [x, z, n, sc] of list) { const obj = MD.oreCluster(n, sc); obj.position.set(x, 0, z); s.add(obj); this.ores.push({ pos: V3(x, 0, z), amount, max: amount, obj }); } };
    field([[17, -15, 9, 1.2], [21, -10, 7, 1.0], [23, -18, 8, 1.3], [15, -21, 6, .9], [-18, -24, 8, 1.1], [-24, -19, 7, 1.0]], 900);
    { const [ex, ez] = MAP.exp; field([[ex - 1, ez, 10, 1.5], [ex + 4, ez + 4, 8, 1.3], [ex - 3, ez - 5, 9, 1.4]], 1600); }
    if (!net) for (const [x, z] of [[6, 7], [10, -6], [13, -10], [-8, -8], [9, 2], [-6, 8]]) this.spawn('rigger', 0, x, z);
    // the Veyl outpost
    const V = (k: BKind, lx: number, lz: number, rot = false) => { if (net) return; const [x, z] = veylPt(lx, lz); this.addBuilding(k, 1, x, z, true, rot); };
    for (const [x, z] of [[-6, -9], [3, 1], [-6, 11]]) V('choir', x, z);
    V('reedgate', 14, -1, Math.abs(ROAD.dx) >= Math.abs(ROAD.dz));
    for (const [x, z] of [[7, -9.5], [7, 10.5]]) V('broodpit', x, z);
    for (const [x, z] of [[-12, -11.5], [-12, 13]]) V('thornspire', x, z);
    V('wardpylon', -10.5, 1);
    this.dir = new Director(this); if (mission) { this.dir.auto = mission.auto; mission.setup?.(this); }
    if (!net) { this.me = this.units[0]; this.possess(this.me, true); } this.yaw = Math.atan2(ROAD.dx - .4, ROAD.dz - .4);
  }

  /** Frees this world's own meshes on the graphics card once the game is thrown away. Shared shapes stay; three.js re-uploads anything used again. */
  dispose() { const keep = new Set<THREE.BufferGeometry>(Object.values(G) as THREE.BufferGeometry[]); this.scene.traverse((o: any) => { if (o.geometry && !keep.has(o.geometry)) o.geometry.dispose(); }); for (const w of this.wrecks) w.b.obj.traverse((o: any) => { if (o.geometry) o.geometry.dispose(); }); }
  model(k: BKind): THREE.Group { return MD.atlasify(this.rawModel(k)); }
  rawModel(k: BKind): THREE.Group { return k === 'headframe' ? MD.headframe(this.anim) : k === 'bunkhouse' ? MD.bunkhouse() : k === 'depot' ? MD.depot() : k === 'watchpost' ? MD.watchpost() : k === 'machineshop' ? MD.machineshop(this.anim) : k === 'foundry' ? MD.foundry(this.anim) : k === 'assay' ? MD.assay(this.anim) : k === 'mast' ? MD.mast(this.anim) : k === 'reedgate' ? MD.reedgate(this.anim) : k === 'broodpit' ? MD.broodpit(this.anim) : k === 'thornspire' ? MD.thornspire(this.anim) : k === 'wardpylon' ? MD.wardpylon(this.anim) : MD.choir(this.anim); }

  // ------------------------------------------------------------ entities
  /** Multiplayer server: things clients need to see or hear, queued until the next snapshot. */
  uById = new Map<number, Unit>(); bById = new Map<number, Building>();
  evq: any[] | null = null; coop = 1; applying = false; names: Record<number, string> = {}; feedTo = 0; score: Record<number, number[]> = {}; myTeam = 0; teams: Record<number, number> = {}; vWind = 0; vX = 0; vZ = 0; raidCall = 0; pings: { x: number; z: number; t: number; pid: number }[] = [];
  spawn(kind: Kind, team: number, x: number, z: number, id = 0): Unit {
    const md = MD.unit(kind), st = UNIT[kind], hp = st.hp * (team === 0 ? this.armorMul() : 1);
    const rs = st.rad * 3.6, ring = mk(G.ringG, ringMat, [0, .08, 0], [rs, rs, 1], [-Math.PI / 2, 0, 0], md.obj); ring.layers.set(L_FX); ring.visible = false;
    const u: Unit = { id: id || nextId++, kind, team, pilot: 0, nx: x, nz: z, pos: V3(x, 0, z), yaw: R(0, 6), hp, maxHp: hp, shield: st.shield, maxShield: st.shield, obj: md.obj, rig: md.rig, ring, alive: true, speed: st.speed, moving: false, phase: R(0, 6), cd: R(0, 1), think: R(0, .3), target: null, order: { type: 'guard', x, z }, lastHit: -99, state: 'idle', timer: 0, carrying: 0, node: null, site: null, dashCd: R(2, 5), dashT: 0, swing: 0, slot: 0, flashT: 0, pop: 0, wind: 0, windX: 0, windZ: 0, kx: 0, kz: 0, pitch: 0, brace: false };
    md.obj.position.copy(u.pos); md.obj.rotation.y = u.yaw; this.scene.add(md.obj); this.units.push(u);
    if (isSoldier(u) && this.dir && !this.net) this.dir.enlist(u);
    return u;
  }
  addBuilding(kind: BKind, team: number, x: number, z: number, built: boolean, rot = false, id = 0): Building {
    const st = BLD[kind], obj = this.model(kind); obj.position.set(x, 0, z); if (rot) obj.rotation.y = Math.PI / 2; this.scene.add(obj);
    const b: Building = { id: id || nextId++, kind, team, pos: V3(x, 0, z), hx: rot ? st.hz : st.hx, hz: rot ? st.hx : st.hz, h: st.h, hp: built ? st.hp : st.hp * .1, maxHp: st.hp, obj, holo: null, built, progress: built ? 1 : 0, queue: [], alive: true, cd: R(0, 1), builder: null, lastHit: -99, rot, smokeT: 0, stage: 0 };
    if (!built) { b.holo = MD.hologram(obj, holoOK); b.holo.position.copy(obj.position); b.holo.rotation.copy(obj.rotation); this.scene.add(b.holo); obj.scale.y = .06; }
    this.buildings.push(b); return b;
  }
  own(kind?: Kind) { return this.units.filter(u => u.alive && u.team === 0 && (!kind || u.kind === kind)); }
  /** Bodies on the player's own side: Ironhold normally, the Veyl for a player on the other side of a versus match. */
  mine(kind?: Kind) { return this.units.filter(u => u.alive && u.team === this.myTeam && (!kind || u.kind === kind)); }
  soldiers() { return this.units.filter(u => u.alive && u.team === 0 && isSoldier(u)); }
  foes() { return this.units.filter(u => u.alive && u.team === 1); }
  ownB(kind?: BKind, builtOnly = false) { return this.buildings.filter(b => b.alive && b.team === 0 && (!kind || b.kind === kind) && (!builtOnly || b.built)); }
  stones() { return this.buildings.filter(b => b.alive && b.kind === 'choir'); }
  pits() { return this.buildings.filter(b => b.alive && b.kind === 'broodpit'); }
  /** The Ward Pylon covering this spot, if one still stands. */
  ward(p: { x: number; z: number }) { for (const b of this.buildings) if (b.alive && b.kind === 'wardpylon' && Math.hypot(b.pos.x - p.x, b.pos.z - p.z) < 34) return b; return null; }
  wardFx = 0;
  gate() { return this.buildings.find(b => b.alive && b.kind === 'reedgate') || null; }
  supplyCap() { const d = this.ownB('depot', true).length; return 12 + 8 * d + (this.up.beds ? 4 + 2 * d : 0); }
  supplyUsed() { let n = 0; for (const u of this.units) if (u.alive && u.team === 0) n += UNIT[u.kind].supply; for (const b of this.buildings) if (b.alive && b.team === 0) for (const q of b.queue) n += UNIT[q.kind].supply; return n; }
  gunMul() { return (this.up.dmg ? 1.25 : 1) * (this.up.dmg2 ? 1.2 : 1) * (this.up.dmg3 ? 1.15 : 1); }
  armorMul() { return (this.up.armor ? 1.25 : 1) * (this.up.armor2 ? 1.2 : 1) * (this.up.armor3 ? 1.15 : 1); }
  /** How much faster research makes this body walk. */
  pace(u: Unit) { return u.team ? 1 : u.kind === 'gantry' ? (this.up.servo ? 1.2 : 1) : u.kind !== 'rigger' && this.up.pay ? 1.12 : 1; }
  /** The buildings still missing before this one can be staked out. */
  missing(k: BKind) { return (BLD[k].needs || []).filter(n => !this.ownB(n, true).length); }
  ms: Record<string, number> = {};
  unlocked(k: BKind) { if (this.mission && !this.mission.allow.includes(k)) return false; return !this.missing(k).length; }

  // ------------------------------------------------------------ helpers
  distToBox(b: Building, x: number, z: number) { const dx = Math.max(Math.abs(x - b.pos.x) - b.hx, 0), dz = Math.max(Math.abs(z - b.pos.z) - b.hz, 0); return Math.hypot(dx, dz); }
  collide(u: Unit, gx: number, gz: number) {
    const r = UNIT[u.kind].rad * .75, p = u.pos, ai = u !== this.me;
    for (const b of this.buildings) {
      if (!b.alive) continue; const ex = b.hx + r, ez = b.hz + r, dx = p.x - b.pos.x, dz = p.z - b.pos.z;
      if (Math.abs(dx) < ex && Math.abs(dz) < ez) {
        const px = ex - Math.abs(dx), pz = ez - Math.abs(dz);
        // Pushed back out of the wall, an AI body slides along it toward its goal. When the goal is straight through the building
        // that slide goes nowhere, so it heads for the nearer corner instead and walks round.
        if (px < pz) { p.x += Math.sign(dx || 1) * px; if (ai) p.z += (Math.abs(gz - b.pos.z) < ez && (gx - b.pos.x) * dx < 0 ? Math.sign(dz || 1) : Math.sign(gz - p.z || 1)) * .07; }
        else { p.z += Math.sign(dz || 1) * pz; if (ai) p.x += (Math.abs(gx - b.pos.x) < ex && (gz - b.pos.z) * dz < 0 ? Math.sign(dx || 1) : Math.sign(gx - p.x || 1)) * .07; }
      }
    }
    for (const s of this.spires) { const dx = p.x - s.x, dz = p.z - s.z, m = s.r + r; if (Math.abs(dx) > m || Math.abs(dz) > m) continue; const d = Math.hypot(dx, dz); if (d < m && d > .001) { p.x += dx / d * (m - d); p.z += dz / d * (m - d); if (ai) { const tx = -dz / d, tz = dx / d, sg = Math.sign(tx * (gx - p.x) + tz * (gz - p.z)) || 1; p.x += tx * sg * .08; p.z += tz * sg * .08; } } }
    for (const o of this.ores) { if (o.amount <= 0) continue; const dx = p.x - o.pos.x, dz = p.z - o.pos.z, d = Math.hypot(dx, dz), m = 1.7; if (d < m && d > .001) { p.x += dx / d * (m - d); p.z += dz / d * (m - d); } }
    // The edge of the world: a circle around the middle of the map, inside the ring of mesas. It moves with the map, so the far end of Glass Flats stays reachable.
    const ox = MAP.out[0] / 2, oz = MAP.out[1] / 2, cx = p.x - ox, cz = p.z - oz, cd = Math.hypot(cx, cz); if (cd > 200) { p.x = ox + cx / cd * 200; p.z = oz + cz / cd * 200; }
  }
  moveTo(u: Unit, x: number, z: number, dt: number, stop = .4, mul = 1) {
    const dx = x - u.pos.x, dz = z - u.pos.z, d = Math.hypot(dx, dz); if (d < stop) return true;
    const st = Math.min(d, u.speed * mul * this.pace(u) * dt); u.pos.x += dx / d * st; u.pos.z += dz / d * st; u.yaw = Math.atan2(dx, dz); u.moving = true; this.collide(u, x, z); return false;
  }
  /** Follows the unit's order, walking any waypoints first. Returns true on arrival. */
  advance(u: Unit, dt: number, stop: number, mul = 1) {
    const o = u.order; if (o.path && o.path.length) { if (this.moveTo(u, o.path[0][0], o.path[0][1], dt, 6, mul)) o.path.shift(); return false; }
    return this.moveTo(u, o.x, o.z, dt, stop, mul);
  }
  vol(p: THREE.Vector3) { const d = this.me ? p.distanceTo(this.me.pos) : 50; return Math.max(0, 1 - d / 90) ** 2; }
  feed(who: string, msg: string, cls = '') { if (this.evq) { this.evq.push(['fd', who, msg, cls, this.feedTo]); return; } this.hud.feed(who, msg, cls); if (!this.noRender) babble(who, msg.length); }

  // ------------------------------------------------------------ effects
  tracer(a: THREE.Vector3, b: THREE.Vector3, mat: THREE.Material = tracerMat, w = .07) {
    if (this.evq) { this.evq.push(['tr', r1(a.x), r1(a.y), r1(a.z), r1(b.x), r1(b.y), r1(b.z), mat === tracerMat ? 0 : 1, w]); return; }
    if (this.net && !this.applying) this.net.cmd('tr', r1(a.x), r1(a.y), r1(a.z), r1(b.x), r1(b.y), r1(b.z), mat === tracerMat ? 0 : 1, w);
    const tr = this.tracers.find(t => t.t <= 0); if (!tr) return; const d = TMP.copy(b).sub(a), len = d.length(); if (len < .1) return;
    tr.m.material = mat; tr.m.scale.set(w, len, w); tr.m.position.copy(a).addScaledVector(d, .5); tr.m.quaternion.setFromUnitVectors(UP, d.normalize()); tr.m.visible = true; tr.t = mat === tracerMat ? .06 : .16;
  }
  puff(p: THREE.Vector3, n: number, size: number, mat: THREE.Material = M.dust, up = 1.2, spread = 1) {
    if (this.evq) return;
    for (let i = 0; i < n; i++) { const f = this.puffs.find(x => x.t <= 0); if (!f) return; f.m.material = mat; f.m.position.copy(p); f.v.set(R(-1, 1) * spread, R(.3, 1) * up, R(-1, 1) * spread); f.s = size * R(.6, 1.2); f.life = f.t = R(.35, .7); f.m.visible = true; f.m.scale.setScalar(.01); }
  }
  /** Chunky debris that arcs, bounces once and shrinks away. */
  debris(p: THREE.Vector3, n: number, size: number, mat: THREE.Material, power = 6) {
    if (this.evq) return;
    for (let i = 0; i < n; i++) { const f = this.bits.find(x => x.t <= 0); if (!f) return; f.m.material = mat; f.m.position.copy(p); f.v.set(R(-1, 1) * power, R(.5, 1.3) * power, R(-1, 1) * power); const s = size * R(.5, 1.3); f.m.scale.set(s, s * R(.4, 1), s * R(.6, 1.2)); f.m.rotation.set(R(0, 6), R(0, 6), 0); f.spin = R(-12, 12); f.t = R(.9, 1.6); f.m.visible = true; }
  }
  scorchAt(p: THREE.Vector3, size: number) { if (this.evq) return; let s = this.scorch.find(x => x.t <= 0); if (!s) s = this.scorch.reduce((a, b) => a.t < b.t ? a : b); s.m.position.set(p.x, .04 + Math.random() * .01, p.z); s.s = size; s.m.scale.set(size, size, 1); s.m.rotation.z = R(0, 6); s.m.visible = true; s.t = 40; }
  bubble(u: Unit) { if (this.evq) return; const b = this.bubbles.find(x => x.t <= 0); if (!b) return; b.u = u; b.t = .18; b.m.visible = true; const s = UNIT[u.kind].rad * 3.4; b.m.scale.set(s, UNIT[u.kind].headY * 1.15, s); }
  warn(x: number, z: number, r: number, life: number) { if (this.evq) { this.evq.push(['wn', r1(x), r1(z), r, life]); return; } const w = this.warns.find(x => x.t <= 0); if (!w) return; w.m.position.set(x, .12, z); w.r = r; w.t = w.life = life; w.m.visible = true; }
  explode(p: THREE.Vector3, team: number, dmg: number, radius: number, from: Unit | null, veyl = false) {
    if (this.evq) this.evq.push(['ex', r1(p.x), r1(p.y), r1(p.z), radius, veyl ? 1 : 0]);
    for (const u of this.units) { if (!u.alive || u.team === team) continue; const d = Math.hypot(u.pos.x - p.x, u.pos.z - p.z); if (d > radius + UNIT[u.kind].rad) continue; const k = 1 - .6 * Math.min(1, d / radius); this.damage(u, dmg * k, from); if (d > .1) { u.kx += (u.pos.x - p.x) / d * 9 * k; u.kz += (u.pos.z - p.z) / d * 9 * k; } }
    for (const b of this.buildings) { if (!b.alive || b.team === team) continue; if (this.distToBox(b, p.x, p.z) < radius * .7) this.damage(b, dmg * 1.4, from); }
    this.blastProps(p, radius, dmg, from); this.shove(p, radius * 1.6, 9);
    const g = V3(p.x, .6, p.z); this.puff(g, 7, radius * .5, veyl ? M.teal : M.fire, 2.2, 1.6); this.puff(g, 5, radius * .55, veyl ? M.indigoL : M.smoke, 1.4, 2.2); this.debris(g, 8, .3, veyl ? M.crys : M.rock, 7); this.scorchAt(p, radius * 1.5); if (radius >= 3.5) this.crater(p, radius * .55);
    const v = this.vol(p); this.shake = Math.max(this.shake, v * 1.1); if (!veyl) this.pipe.flash = Math.max(this.pipe.flash, v * .5); sfx.boom(v);
    this.hud.damage(V3(p.x, 2.2, p.z), veyl ? 'WHUMM!' : 'BOOM!', veyl ? 'kobad' : 'ko');
  }

  damage(t: Unit | Building, amt: number, from: Unit | Building | null, crit = false) {
    if (this.net) {   // multiplayer client: only the server changes health. Report what this player hit and show the number now.
      if (from !== this.me || !this.me || !t.alive || amt <= 0) return;
      this.net.cmd('dm', t.id, Math.round(amt * 10) / 10, crit ? 1 : 0); if (isUnit(t)) t.pop = 1;
      if (!this.quiet) this.hud.damage(V3(t.pos.x, isUnit(t) ? UNIT[t.kind].headY + .4 : t.h * .7, t.pos.z), (crit ? 'CRIT ' : '') + Math.max(1, Math.round(amt)), crit ? 'crit' : isUnit(t) && t.shield > 0 ? 'shield' : '');
      return;
    }
    if (t === this.me && this.safeT > 0) return;
    if (!t.alive || amt <= 0) return; t.lastHit = this.time;
    const u = isUnit(t) ? t : null, me = this.me;
    // A unit sheltering behind scenery: shots from the far side by anything but a player mostly chew up the scenery instead.
    if (u && u.cover && u.cover.alive && from && from !== me && isUnit(from) && !from.pilot) { const c = u.cover, cx = c.x - u.pos.x, cz = c.z - u.pos.z; if (Math.hypot(cx, cz) < c.r + 2.4 && cx * (from.pos.x - u.pos.x) + cz * (from.pos.z - u.pos.z) > 0 && Math.random() < .55) { this.damageProp(c, amt, from); return; } }
    if (u && u.kind === 'breacher' && from) { const dx = from.pos.x - u.pos.x, dz = from.pos.z - u.pos.z, d = Math.hypot(dx, dz) || 1; if ((dx * Math.sin(u.yaw) + dz * Math.cos(u.yaw)) / d > .25) { if (u === me && this.brace) { this.payback = Math.min(1, this.payback + amt * .75 / 50); amt *= .25; sfx.clang(); } else if (u.pilot) { if (u.brace) amt *= .25; } else if (u !== me) amt *= .55; } }
    let warded = false;
    if (!u && t.team === 1 && (t as Building).kind !== 'wardpylon') { const w = this.ward(t.pos); if (w) { amt *= .7; warded = true; if (this.time > this.wardFx) { this.wardFx = this.time + .35; this.tracer(V3(w.pos.x, 4.6, w.pos.z), V3(t.pos.x, (t as Building).h * .6, t.pos.z), beamMat, .22); this.puff(TMP.set(t.pos.x, (t as Building).h * .6, t.pos.z), 3, .7, M.cyan, .5); } } }
    const dealt = amt, shielded = (!!u && u.shield > 0) || warded;
    if (u) { u.pop = 1; if (u.shield > 0) { const a = Math.min(u.shield, amt); u.shield -= a; amt -= a; this.bubble(u); } }
    // A hit from a body somebody is driving lands with weight: the target is shoved back and loses a beat.
    if (u && u.kind !== 'warden' && u.kind !== 'gantry' && !u.pilot && from && isUnit(from) && from.team !== u.team && (from === me || from.pilot) && dealt >= 5) { const sx = u.pos.x - from.pos.x, sz = u.pos.z - from.pos.z, sd = Math.hypot(sx, sz) || 1, k = from.kind === 'rigger' ? 14 : Math.min(10, dealt * .16); u.kx += sx / sd * k; u.kz += sz / sd * k; u.cd = Math.max(u.cd, Math.min(.5, dealt * .012)); }
    t.hp -= amt;
    if (this.evq && u && u.pilot && from) this.evq.push(['ht', u.id, r1(from.pos.x), r1(from.pos.z)]);
    const head = V3(t.pos.x, u ? UNIT[u.kind].headY + .4 : (t as Building).h * .7, t.pos.z);
    if (from === me && me && !this.quiet) this.hud.damage(head, (crit ? 'CRIT ' : '') + Math.max(1, Math.round(dealt)), crit ? 'crit' : shielded ? 'shield' : '');
    if (t === me && me) { this.shake = Math.min(1, this.shake + .45); let ang = 0; if (from) { const a = Math.atan2(from.pos.x - me.pos.x, from.pos.z - me.pos.z) - this.yaw; ang = Math.atan2(Math.sin(a), Math.cos(a)); } this.hud.hurt(from ? ang : null); sfx.hurt(); }
    if (u && from && isUnit(from) && u !== me && !u.target && u.kind !== 'rigger') u.target = from;
    if (!u && from && isUnit(from) && t.team === 1) this.dir.alarm(from);
    if (!u && from && isUnit(from) && t.team === 1) for (const c of this.units) if (c.alive && c.team === 1 && !c.target && c.order.type === 'guard' && c.pos.distanceTo(t.pos) < 50) c.target = from;
    if (!u && t.team === 0 && from && this.time > this.alertT) { this.alertT = this.time + 20; this.feed('Lookout', `They're chewing on the ${BLD[(t as Building).kind].name}! Get back here.`, 'al'); sfx.alarm(); }
    if (!u && t.hp > 0) { const b = t as Building, st = b.hp < b.maxHp * .33 ? 2 : b.hp < b.maxHp * .66 ? 1 : 0; if (b.built && st > b.stage) this.crack(b, st); }
    if (t.hp <= 0) u ? this.killUnit(u, from) : this.killBuilding(t as Building);
  }
  quiet = false;
  /** Counts down while a freshly taken body brings its weapon up into view. */
  drawT = 0;
  /** How far sustained fire has opened the crosshair, 0 to 1. The first shot after a pause is the accurate one. */
  bloom = 0;
  /** Damage a Breacher has soaked on the shield, 0 to 1. It comes back out with the next blast. */
  payback = 0; salvoCd = 0;
  /** Veyl player: cooldown on the body's second move, the verse picked for the next raid, and the Cantor's rising combo. */
  vCd = 0; verse = 0; combo = 0; comboT = 0;
  killUnit(u: Unit, from: Unit | Building | null) {
    if (this.evq) { this.evq.push(['ku', u.id, from ? from.id : 0]); const kp = from && (from as Unit).pilot; if (kp && u.team !== from!.team && this.score[kp]) this.score[kp][0]++; }
    if (u.kind === 'gantry' && u.alive && !this.net) { u.alive = false; this.explode(V3(u.pos.x, 0, u.pos.z), 0, 40, 6, null); u.alive = true; }
    u.alive = false; const veyl = u.team === 1, v = this.vol(u.pos), st = UNIT[u.kind], c = V3(u.pos.x, st.bodyY, u.pos.z);
    this.puff(c, veyl ? 6 : 4, st.rad * 1.4, veyl ? M.teal : M.dust); this.debris(c, veyl ? 7 : 3, .22, veyl ? M.crys : M.steelD, 5); sfx.ko(v, veyl);
    this.hud.damage(V3(u.pos.x, st.headY + .4, u.pos.z), u.kind === 'warden' ? 'KRAKA-THOOM!' : 'KO!', veyl ? 'ko' : 'kobad');
    u.ring.visible = false; if (u.rig.flash) u.rig.flash.visible = false; this.bodyLayer(u, false);
    let ax = R(-1, 1), az = R(-1, 1); if (from) { ax = u.pos.x - from.pos.x; az = u.pos.z - from.pos.z; } const al = Math.hypot(ax, az) || 1;
    this.corpses.push({ obj: u.obj, t: 0, veyl, ax: ax / al, az: az / al, s: u.obj.scale.x });
    if (veyl && from === this.me && this.me) { sfx.kill(); this.hitStop = u.kind === 'warden' ? .25 : this.me.kind === 'longshot' ? .12 : .06; this.streak = this.time < this.streakT ? this.streak + 1 : 1; this.streakT = this.time + 4; if (this.streak >= 2) { this.hud.streak(['', '', 'DOUBLE KO!', 'TRIPLE!', 'OVERTIME!', 'RAMPAGE!'][Math.min(5, this.streak)]); sfx.streak(this.streak); } }
    if (veyl) { this.stats.kills++; if (u.kind === 'warden') { this.shake = Math.max(this.shake, v); this.feed('Alpha', 'Warden down! Did everybody see that? I did that.', ''); } else if (from && isUnit(from) && from.team === 0 && from !== this.me && Math.random() < .12) this.dir.bark(from, 'kill'); }
    else { this.stats.lost++; { const kk = from ? from.kind : 'other'; this.stats.lostTo[kk] = (this.stats.lostTo[kk] || 0) + 1; } if (u !== this.me && isSoldier(u) && Math.random() < .35) this.dir.bark(u, 'down'); }
    if (u.site) u.site.builder = null;
    if (u === this.me) { this.staticT = 1.9; this.feed('Signal', 'Body lost. Finding you a new one.', 'al'); sfx.deny(); drillSound(false, false); }
  }
  bldMat(b: Building, i: number) { return b.team === 1 ? (i % 3 ? M.indigo : i % 2 ? M.crys : M.indigoL) : (i % 3 === 0 ? M.rust : i % 3 === 1 ? M.steel : M.steelD); }
  /** A building passes a damage state: it sheds pieces, sags and leans a little more. */
  crack(b: Building, st: number) {
    b.stage = st; const veyl = b.team === 1; b.obj.rotation.z = (b.id % 2 ? 1 : -1) * st * .035; b.obj.rotation.x = (b.id % 3 - 1) * st * .025; b.obj.position.y = -st * .12;
    for (let i = 0; i < 5 + st * 2; i++) { const p = V3(b.pos.x + R(-b.hx, b.hx), R(b.h * .4, b.h), b.pos.z + R(-b.hz, b.hz)); this.chunk(p, R(.35, .8), this.bldMat(b, i), 5, b.pos, !veyl); if (i < 3) this.puff(p, 3, 1.4, veyl ? M.teal : M.smoke, 1.4, 1); }
    if (this.vol(b.pos) > .2) { this.hud.damage(V3(b.pos.x, b.h * .8, b.pos.z), st === 2 ? 'CRRRACK!' : 'CRACK!', veyl ? 'ko' : 'kobad'); sfx.step(true); }
  }
  crater(p: { x: number; z: number }, r: number) {
    if (this.evq) return;
    let c = this.craters.find(x => x.t <= 0);
    if (!c) { if (this.craters.length < 16) { const m = new THREE.Group(); mk(G.disc, M.scorch, [0, .05, 0], [1, 1, 1], [-Math.PI / 2, 0, 0], m); for (let i = 0; i < 9; i++) { const a = i / 9 * 6.283 + R(-.2, .2); mk(G.dod, i % 3 ? M.rock : M.mesa, [Math.cos(a), .08, Math.sin(a)], [R(.3, .5), R(.14, .3), R(.24, .4)], [R(0, 3), R(0, 3), 0], m); } setLayer(m, L_FX); this.scene.add(m); c = { m, t: 0 }; this.craters.push(c); } else c = this.craters.reduce((a, b) => a.t < b.t ? a : b); }
    c.m.position.set(p.x, R(0, .02), p.z); c.m.rotation.y = R(0, 6); c.m.scale.set(r, Math.min(2.2, r * .55), r); c.m.visible = true; c.t = 150;
  }
  fallA = -1; possT = -9;
  killBuilding(b: Building) {
    b.alive = false; if (b.holo) this.scene.remove(b.holo); const veyl = b.team === 1, v = this.vol(b.pos);
    const tall = b.h > Math.max(b.hx, b.hz) * 1.9, a = this.fallA >= 0 ? this.fallA : R(0, 6.283); this.fallA = -1;
    if (this.evq) this.evq.push(['kb', b.id, Math.round(a * 100) / 100]);
    this.wrecks.push({ b, t: 0, dur: tall ? 1.5 : 1.7, tall, dx: Math.sin(a), dz: Math.cos(a), yaw: b.obj.rotation.y, puffT: 0 });
    for (let i = 0; i < 4; i++) { const p = V3(b.pos.x + R(-b.hx, b.hx), R(1, b.h), b.pos.z + R(-b.hz, b.hz)); this.puff(p, 4, 2.6, veyl ? M.teal : i % 2 ? M.fire : M.smoke, 2, 1.5); this.debris(p, 6, .7, this.bldMat(b, i), 9); }
    for (let i = 0; i < 8; i++) this.chunk(V3(b.pos.x + R(-b.hx, b.hx), R(.6, b.h), b.pos.z + R(-b.hz, b.hz)), R(.5, 1.1), this.bldMat(b, i), 7, b.pos, !veyl);
    this.shove(b.pos, Math.max(b.hx, b.hz) * 3, 8);
    this.pipe.flash = Math.max(this.pipe.flash, v * .6);
    this.hud.damage(V3(b.pos.x, b.h * .6, b.pos.z), tall ? 'TIMBERRR!' : veyl ? 'KRA-KOOM!' : 'CRUNCH!', veyl ? 'ko' : 'kobad'); sfx.boom(Math.max(.3, v)); this.shake = Math.max(this.shake, v);
    if (b.builder) { b.builder.site = null; b.builder.state = 'idle'; }
    if (this.net) return;
    this.dir.buildingLost(b);
    if (b.kind === 'choir' && !this.stones().length && !this.mission) { this.endT = 2.4; this.endWon = true; this.pipe.flash = 1; } else if (b.kind === 'headframe') { this.endT = 2.4; this.endWon = false; this.pipe.flash = 1; }
  }
  end(won: boolean) { if (this.phase === 'over') return; this.phase = 'over'; this.won = won; won ? sfx.win() : sfx.lose(); drillSound(false, false); setMood(0); this.hud.showEnd(this); if (document.pointerLockElement) document.exitPointerLock(); }
  nearestStone(p: { x: number; z: number }) { let best: Building | null = null, bd = 1e9; for (const b of this.stones()) { const d = Math.hypot(b.pos.x - p.x, b.pos.z - p.z); if (d < bd) { bd = d; best = b; } } return best; }

  // ------------------------------------------------------------ ray casting
  /** Finds the first thing the ray hits. `team` filters which side's units and buildings count (-1 for any). */
  ray(o: THREE.Vector3, d: THREE.Vector3, max: number, team: number, skip: Unit | null): Hit | null {
    let best = max, hit: Hit | null = null;
    const sphere = (cx: number, cy: number, cz: number, r: number) => { const ox = o.x - cx, oy = o.y - cy, oz = o.z - cz; const b = ox * d.x + oy * d.y + oz * d.z, c = ox * ox + oy * oy + oz * oz - r * r, disc = b * b - c; if (disc < 0) return -1; const t = -b - Math.sqrt(disc); return t > 0 ? t : -1; };
    for (const u of this.units) {
      if (!u.alive || u === skip || (team >= 0 && u.team !== team)) continue; const st = UNIT[u.kind], k = st.rad / .66;
      const ox = u.pos.x - o.x, oz = u.pos.z - o.z, along = ox * d.x + oz * d.z; if (along < -3 || along > best + 3) continue;
      let t = sphere(u.pos.x, st.headY, u.pos.z, .46 * k); if (t > 0 && t < best) { best = t; hit = { unit: u, dist: t, head: true }; }
      t = sphere(u.pos.x, st.bodyY, u.pos.z, st.rad); if (t > 0 && t < best) { best = t; hit = { unit: u, dist: t }; }
      t = sphere(u.pos.x, st.bodyY * .35, u.pos.z, st.rad * .7); if (t > 0 && t < best) { best = t; hit = { unit: u, dist: t }; }
    }
    for (const b of this.buildings) {
      if (!b.alive || (team >= 0 && b.team !== team)) continue;
      let t0 = 0, t1 = best, ok = true; const mn = [b.pos.x - b.hx, 0, b.pos.z - b.hz], mx = [b.pos.x + b.hx, b.h, b.pos.z + b.hz], oo = [o.x, o.y, o.z], dd = [d.x, d.y, d.z];
      for (let i = 0; i < 3 && ok; i++) { if (Math.abs(dd[i]) < 1e-6) { if (oo[i] < mn[i] || oo[i] > mx[i]) ok = false; } else { let a = (mn[i] - oo[i]) / dd[i], c = (mx[i] - oo[i]) / dd[i]; if (a > c) { const s = a; a = c; c = s; } t0 = Math.max(t0, a); t1 = Math.min(t1, c); if (t0 > t1) ok = false; } }
      if (ok && t0 > 0 && t0 < best) { best = t0; hit = { b, dist: t0 }; }
    }
    for (const p of this.props) {
      if (!p.alive) continue; const ox = o.x - p.x, oz = o.z - p.z, a = d.x * d.x + d.z * d.z; if (a < 1e-6) continue;
      const bb = ox * d.x + oz * d.z, c = ox * ox + oz * oz - p.r * p.r, disc = bb * bb - a * c; if (disc < 0) continue;
      const t = (-bb - Math.sqrt(disc)) / a; if (t <= 0 || t >= best) continue; const y = o.y + d.y * t; if (y < p.y0 || y > p.h) continue;
      best = t; hit = { prop: p, dist: t };
    }
    if (team < 0) for (const n of this.ores) { if (n.amount <= 0) continue; const t = sphere(n.pos.x, 1, n.pos.z, 2.1); if (t > 0 && t < best) { best = t; hit = { ore: n, dist: t }; } }
    return hit;
  }
  lookDir(out: THREE.Vector3) { const cp = Math.cos(this.pitch); return out.set(Math.sin(this.yaw) * cp, Math.sin(this.pitch), Math.cos(this.yaw) * cp); }
  groundPoint(out: THREE.Vector3, max: number) { const d = this.lookDir(TMP), o = this.cam.position; if (d.y > -.02) return false; const t = -o.y / d.y; if (t > max) return false; out.copy(o).addScaledVector(d, t); out.y = 0; return true; }

  // ------------------------------------------------------------ possession
  bodyLayer(u: Unit, self: boolean) { setLayer(u.obj, self ? L_SELF : 0); u.ring.layers.set(L_FX); if (u.rig.flash) { if (self && u.team === 1) u.rig.flash.visible = false; else setLayer(u.rig.flash, L_FX); } }
  possess(u: Unit, force = false) {
    if (!u.alive || (u === this.me && !force)) return; if (!force && this.jumpCd > 0) { sfx.deny(); return; }
    if (this.net) { if (u.pilot && u.pilot !== this.net.id) { sfx.deny(); this.feed('Signal', `${this.names[u.pilot] || 'Someone'} is already in that body.`, 'al'); return; } this.net.cmd('bd', u.id); u.pilot = this.net.id; this.possT = this.time; if (this.me && this.me !== u) this.me.pilot = 0; }
    const old = this.me; if (old && old.alive && old !== u) { this.bodyLayer(old, false); if (old.kind === 'rigger') { old.state = old.carrying > 0 ? 'toHQ' : 'idle'; old.site = null; if (old.rig.pack) old.rig.pack.visible = old.carrying > 0; } old.target = null; this.lastBody = old; if (isSoldier(old) && !this.net) this.dir.enlist(old); }
    this.me = u; this.bodyLayer(u, true); this.yaw = u.yaw; this.pitch = 0; this.jumpCd = force ? 0 : 3; this.tool = 1; this.reloadT = 0; this.ads = 0; this.brace = false; this.recoil = 0; u.target = null; u.wind = 0;
    this.ammo = GUNS[u.kind] ? GUNS[u.kind].mag : 0;
    if (u.site) { u.site.builder = null; u.site = null; } u.state = 'idle'; if (u.carrying > 0 && !this.net) this.bank(u); u.carrying = 0; if (u.rig.pack) u.rig.pack.visible = false; if (u.rig.flash) u.rig.flash.visible = false;
    drillSound(false, false);
    this.drawT = .32; this.vWind = 0; if (!force) { sfx.jump(); this.hud.feed(UNIT[u.kind].name, UNIT[u.kind].ack[Math.floor(Math.random() * UNIT[u.kind].ack.length)] || '...', 'in'); this.obj.jumped = true; this.pipe.flash = .35; }
    if (!this.seenKinds.has(u.kind) && !force) { this.seenKinds.add(u.kind); this.phase = 'card'; this.cardT = 1.15; this.hud.titleCard(u.kind, UNIT[u.kind].name, UNIT[u.kind].quip); sfx.card(); } else this.seenKinds.add(u.kind);
  }
  refreshTab() {
    const me = this.me!, list: Game['tabList'] = [], t = this.dir.squadTask();
    if (this.myTeam) { for (const k of ['cantor', 'lancer', 'warden'] as Kind[]) { const all = this.mine(k), x = all.filter(u => u !== me && !u.pilot).sort((a, b) => a.pos.distanceTo(me.pos) - b.pos.distanceTo(me.pos))[0]; if (x) list.push({ label: `${UNIT[k].name} ×${all.length}`, task: x.order.type === 'raid' ? 'Marching on the Headframe' : 'Guarding the Stones', unit: x, hp: x.hp / x.maxHp, alert: this.time - x.lastHit < 4 }); } this.tabList = list; if (this.tabSel >= list.length) this.tabSel = 0; return; }
    const near = (k: Kind) => this.own(k).filter(u => u !== me && !u.pilot).sort((a, b) => a.pos.distanceTo(me.pos) - b.pos.distanceTo(me.pos))[0];
    const hot = this.own().filter(u => u !== me && this.time - u.lastHit < 4).sort((a, b) => b.lastHit - a.lastHit)[0];
    if (hot) list.push({ label: UNIT[hot.kind].name + ' under attack', task: 'Jump in and save them', unit: hot, hp: hot.hp / hot.maxHp, alert: true });
    const l = near('linesman'); if (l) list.push({ label: `Linesman ×${this.own('linesman').length}`, task: t, unit: l, hp: l.hp / l.maxHp, alert: false });
    for (const k of ['longshot', 'patch'] as Kind[]) { const x = near(k); if (x && list.length < 4) list.push({ label: `${UNIT[k].name} ×${this.own(k).length}`, task: k === 'patch' ? 'Keeping people alive' : t, unit: x, hp: x.hp / x.maxHp, alert: false }); }
    const w = near('gantry'); if (w) list.push({ label: `Gantry ×${this.own('gantry').length}`, task: t, unit: w, hp: w.hp / w.maxHp, alert: false });
    const b = near('breacher'); if (b) list.push({ label: `Breacher ×${this.own('breacher').length}`, task: t, unit: b, hp: b.hp / b.maxHp, alert: false });
    const r = near('rigger'); if (r) list.push({ label: `Rigger ×${this.own('rigger').length}`, task: r.state === 'build' || r.state === 'toSite' ? 'Building' : 'Mining ore', unit: r, hp: r.hp / r.maxHp, alert: false });
    if (this.lastBody && this.lastBody.alive && this.lastBody !== me && !list.some(e => e.unit === this.lastBody)) list.push({ label: 'Last body · ' + UNIT[this.lastBody.kind].name, task: 'Where you just were', unit: this.lastBody, hp: this.lastBody.hp / this.lastBody.maxHp, alert: false });
    this.tabList = list.slice(0, 5); if (this.tabSel >= this.tabList.length) this.tabSel = 0;
  }

  // ------------------------------------------------------------ frame
  update(dtReal: number) {
    const P = this.pressed; dtReal = Math.min(dtReal, .1);
    this.pipe.time += dtReal;
    if (this.phase === 'card') { this.cardT -= dtReal; if (this.cardT <= 0) { this.phase = 'play'; this.hud.titleCard('', '', ''); } }
    if (this.phase === 'play') {
      const tabNow = this.keys.has('Tab') && !!this.me?.alive && this.staticT <= 0;
      if (tabNow && !this.tab) { this.tabSel = 0; this.refreshTab(); sfx.blip(); drillSound(false, false); }
      if (!tabNow && this.tab) { const e = this.tabList[this.tabSel]; if (e && e.unit.alive) this.possess(e.unit); }
      this.tab = tabNow;
      if (this.tab) { for (let i = 0; i < this.tabList.length; i++) if (P.has('Digit' + (i + 1))) { this.tabSel = i; sfx.blip(); } if (this.wheel) { this.tabSel = (this.tabSel + (this.wheel > 0 ? 1 : this.tabList.length - 1)) % Math.max(1, this.tabList.length); sfx.blip(); } }
      this.hitStop = Math.max(0, this.hitStop - dtReal); this.introT = Math.max(0, this.introT - dtReal);
      if (this.endT > 0) { this.endT -= dtReal; this.shake = Math.max(this.shake, .5 * this.endT / 2.4); if (this.endT <= 0) { this.end(this.endWon); P.clear(); return; } }
      const dt = this.net ? dtReal : dtReal * (this.endT > 0 ? .22 : this.tab ? .25 : this.hitStop > 0 ? .12 : 1);
      this.time += dt; this.safeT = Math.max(0, this.safeT - dt); this.jumpCd = Math.max(0, this.jumpCd - dtReal);
      if (this.staticT > 0) { this.staticT -= dtReal; if (this.staticT <= 0) this.respawn(); }
      else if (this.me?.alive && !this.tab) this.updatePlayer(dt, P);
      if (this.net) { netTick(this, dt); this.poseUnits(dt); this.updateProjs(dt); this.updateChunks(dt); this.updateWrecks(dt); this.updateFx(dt); } else {
      if (this.mission && this.endT <= 0) { this.mission.tick?.(this, this.ms, dt); if (this.mission.objectives.every(o => o.done(this))) { this.endT = 2.4; this.endWon = true; this.pipe.flash = 1; } }
      this.updateUnits(dt); this.updateBuildings(dt); this.updateProjs(dt); this.updateChunks(dt); this.updateWrecks(dt); this.dir.update(dt);
      this.updateFx(dt); }
    } else { const live = !!this.net && (this.phase === 'paused' || this.phase === 'card'); /* an online match does not stop for a pause screen or a title card */ if (live) { netTick(this, dtReal); this.poseUnits(dtReal); this.updateProjs(dtReal); this.updateChunks(dtReal); this.updateWrecks(dtReal); } this.updateFx(this.phase === 'menu' || live ? dtReal : 0); }
    const t = this.pipe.time; for (const f of this.anim) f(t);
    this.shake = Math.max(0, this.shake - dtReal * 2.5); this.pipe.flash = Math.max(0, this.pipe.flash - dtReal * 2.6);
    this.units = this.units.filter(u => u.alive); this.buildings = this.buildings.filter(b => b.alive);
    if (!this.noRender) this.render(dtReal);
    P.clear(); this.mdx = this.mdy = 0; this.wheel = 0;
  }
  updateFx(dt: number) {
    if (dt <= 0) return;
    this.dustT -= dt; if (this.dustT <= 0 && this.me) { this.dustT = .35; const f = this.puffs.find(x => x.t <= 0), c = this.phase === 'menu' ? TMP2.set(0, 0, 0) : this.me.pos; if (f) { f.m.material = M.dust; f.m.position.set(c.x + R(-34, 20), R(.1, .5), c.z + R(-28, 28)); f.v.set(R(2.5, 4.5), R(.05, .25), R(.6, 1.6)); f.s = R(.07, .16); f.life = f.t = R(1.2, 2); f.m.visible = true; f.m.scale.setScalar(.01); } }
    for (const tr of this.tracers) if (tr.t > 0) { tr.t -= dt; if (tr.t <= 0) tr.m.visible = false; }
    for (const f of this.puffs) if (f.t > 0) { f.t -= dt; const k = 1 - f.t / f.life; f.m.position.addScaledVector(f.v, dt * 2.2); const s = f.s * (.4 + k) * (1 - k * k); f.m.scale.set(s, s, s); if (f.t <= 0) f.m.visible = false; }
    for (const f of this.bits) if (f.t > 0) { f.t -= dt; f.v.y -= 22 * dt; f.m.position.addScaledVector(f.v, dt); f.m.rotation.x += f.spin * dt; f.m.rotation.z += f.spin * .7 * dt; if (f.m.position.y < .08) { f.m.position.y = .08; f.v.y *= -.35; f.v.x *= .5; f.v.z *= .5; f.spin *= .4; } if (f.t < .3) f.m.scale.multiplyScalar(Math.max(0, 1 - dt * 6)); if (f.t <= 0) f.m.visible = false; }
    for (const s of this.scorch) if (s.t > 0) { s.t -= dt; if (s.t < 4) { const k = Math.max(.001, s.t / 4) * s.s; s.m.scale.set(k, k, 1); } if (s.t <= 0) s.m.visible = false; }
    for (const b of this.bubbles) if (b.t > 0) { b.t -= dt; if (b.u) b.m.position.set(b.u.pos.x, UNIT[b.u.kind].bodyY, b.u.pos.z); if (b.t <= 0) b.m.visible = false; }
    for (const w of this.warns) if (w.t > 0) { w.t -= dt; const k = 1 - w.t / w.life, s = w.r * 2 * (.3 + .7 * k); w.m.scale.set(s, s, 1); if (w.t <= 0) w.m.visible = false; }
    for (let i = this.corpses.length - 1; i >= 0; i--) {
      const c = this.corpses[i]; c.t += dt; const o = c.obj;
      if (c.veyl) { const k = Math.min(1, c.t / .7); o.position.y += dt * 1.6; o.rotation.y += dt * 9; o.scale.setScalar(c.s * Math.max(.001, 1 - k * k)); if (k >= 1) { this.scene.remove(o); this.corpses.splice(i, 1); } }
      else {
        const k = Math.min(1, c.t / .45), fall = k * k * 1.5, yaw = o.rotation.y, fx = c.ax * Math.cos(yaw) - c.az * Math.sin(yaw), fz = c.ax * Math.sin(yaw) + c.az * Math.cos(yaw);
        o.rotation.x = fall * fz; o.rotation.z = -fall * fx; o.position.x += c.ax * dt * 3 * (1 - k); o.position.z += c.az * dt * 3 * (1 - k); o.position.y = Math.sin(k * Math.PI) * .25 + (k >= 1 ? .22 : 0);
        if (c.t > 2.6) { o.position.y -= (c.t - 2.6) * 1.2; o.scale.setScalar(c.s * Math.max(.001, 1 - (c.t - 2.6) / .8)); } if (c.t > 3.4) { this.scene.remove(o); this.corpses.splice(i, 1); }
      }
    }
  }

  /** How much ore a driven Rigger's pack holds before it has to be walked to the Headframe. */
  packCap() { return this.up.buckets ? 21 : 15; }
  /** Puts a driven Rigger's pack on the books. Online the server does this and the replica only empties its own pack. */
  bank(u: Unit) {
    const n = u.carrying; u.carrying = 0; if (u.rig.pack) u.rig.pack.visible = false; if (n <= 0) return;
    if (!this.net) { this.ore += n; this.stats.mined += n; if (u.pilot && this.score[u.pilot]) this.score[u.pilot][1] += n; }
    if (u === this.me) { sfx.ore(); this.hud.damage(V3(u.pos.x, 2.2, u.pos.z), `+${n} banked`, 'ore'); }
  }
  safeT = 0;
  respawn() {
    const me = this.me!; let best: Unit | null = null, bd = 1e9; for (const u of this.mine()) { if (this.net && u.pilot && u.pilot !== this.net.id) continue; const d = u.pos.distanceTo(me.pos) + (isSoldier(u) || u.team ? 0 : 25); if (d < bd) { bd = d; best = u; } }
    if (!best && this.net) { if (this.myTeam ? this.stones().length : this.ownB('headframe').length) { this.net.cmd('rs'); this.staticT = 1.2; } return; }
    if (!best && this.ownB('headframe').length) { best = this.spawn('rigger', 0, 2, 7); this.safeT = 4; this.feed('Quartermaster', 'Found you a fresh Rigger. Try to keep this one.', ''); }
    if (best) { this.jumpCd = 0; this.possess(best, true); sfx.jump(); this.pipe.flash = .4; } else if (this.endT <= 0) this.end(false);
  }

  // ------------------------------------------------------------ the player
  updatePlayer(dt: number, P: Set<string>) {
    const me = this.me!, K = this.keys, gun = GUNS[me.kind];
    const aiming = !!gun && this.rmb && this.reloadT <= 0; this.brace = me.kind === 'breacher' && aiming;
    this.ads += ((aiming ? 1 : 0) - this.ads) * Math.min(1, dt * 14);
    const sens = .0023 * this.sens * (1 - this.ads * (SHOT[me.kind]?.sens ?? .2));
    this.yaw -= this.mdx * sens; this.pitch = Math.max(-1.45, Math.min(1.45, this.pitch - this.mdy * sens));
    this.swayX += (-this.mdx * .0006 - this.swayX) * Math.min(1, dt * 10); this.swayY += (this.mdy * .0006 - this.swayY) * Math.min(1, dt * 10);
    let fx = 0, fz = 0; if (K.has('KeyW')) fz += 1; if (K.has('KeyS')) fz -= 1; if (K.has('KeyD')) fx += 1; if (K.has('KeyA')) fx -= 1;
    const sprint = K.has('ShiftLeft') && fz > 0 && !aiming; me.moving = false;
    if (fx || fz) { const l = Math.hypot(fx, fz), sp = me.speed * this.pace(me) * (sprint ? 1.5 : aiming ? .55 : 1) * dt / l, s = Math.sin(this.yaw), c = Math.cos(this.yaw); me.pos.x += (s * fz - c * fx) * sp; me.pos.z += (c * fz + s * fx) * sp; me.moving = true; this.bob += dt * (sprint ? 13 : 9.5); this.collide(me, me.pos.x, me.pos.z); }
    if (me.hp < me.maxHp && this.time - me.lastHit > 6) me.hp = Math.min(me.maxHp, me.hp + me.maxHp * .05 * dt);
    if (this.kick > 0) { const r = Math.min(this.kick, dt * (.05 + this.kick * 4)); this.kick -= r; this.pitch -= r; }
    if (me.moving) { const ph = Math.floor(this.bob / Math.PI); if (ph !== this.stepPhase) { this.stepPhase = ph; sfx.step(me.kind !== 'linesman' && me.kind !== 'rigger'); if (me.kind === 'gantry') this.shake = Math.max(this.shake, .22); if (sprint) this.puff(TMP.set(me.pos.x, .1, me.pos.z), 1, .35, M.dust, .3, .6); } }
    this.hopCd = Math.max(0, this.hopCd - dt);
    if (P.has('Space') && this.hopCd <= 0 && !this.brace) { const s = Math.sin(this.yaw), c = Math.cos(this.yaw), l = Math.hypot(fx, fz); let dx = s, dz = c; if (l) { dx = (s * fz - c * fx) / l; dz = (c * fz + s * fx) / l; } this.hopX = dx; this.hopZ = dz; this.hopT = .17; this.hopCd = 1.4; sfx.dash(.8); this.puff(TMP.set(me.pos.x, .15, me.pos.z), 3, .5, M.dust, .3, 1); }
    if (this.hopT > 0) { this.hopT -= dt; const v = (me.kind === 'gantry' ? 11 : me.kind === 'breacher' ? 15 : 19) * dt; me.pos.x += this.hopX * v; me.pos.z += this.hopZ * v; me.moving = true; this.collide(me, me.pos.x, me.pos.z); }
    me.yaw = this.yaw; me.pitch = this.pitch;
    if (this.net && me.carrying > 0) { const hq = this.ownB('headframe', true)[0]; if (hq && this.distToBox(hq, me.pos.x, me.pos.z) < 2.6) this.bank(me); }
    this.bloom = Math.max(0, this.bloom - dt * (this.fireCd > -.12 ? .25 : 3.2)); this.salvoCd = Math.max(0, this.salvoCd - dt);
    this.fireCd -= dt; this.recoil = Math.max(0, this.recoil - dt * 6); this.nadeCd = Math.max(0, this.nadeCd - dt); this.bashCd = Math.max(0, this.bashCd - dt); this.bashT = Math.max(0, this.bashT - dt);
    const eye = V3(me.pos.x, UNIT[me.kind].eye, me.pos.z), dir = this.lookDir(V3());
    this.prompt = '';
    if (this.net && P.has('KeyB')) { const pp = V3(); if (!this.groundPoint(pp, 400)) pp.set(me.pos.x + dir.x * 40, 0, me.pos.z + dir.z * 40); this.net.cmd('pg', Math.round(pp.x), Math.round(pp.z)); }
    if (P.has('KeyQ') && this.lastBody?.alive) { this.possess(this.lastBody); return; }
    const look = this.ray(eye, dir, 70, -1, me);
    if (look?.unit && look.unit.team === this.myTeam && look.unit.pilot) this.prompt = `${this.names[look.unit.pilot] || 'A crewmate'} is driving this one`; else if (look?.unit && look.unit.team === this.myTeam) { this.prompt = `<b>F</b> Jump into ${UNIT[look.unit.kind].name}`; if (P.has('KeyF')) { this.possess(look.unit); return; } }
    if (this.myTeam) { this.updateVeyl(dt, P, eye, dir); return; }
    this.dir.playerOrders(P, eye, dir, look ? look.dist : -1);
    // production buildings
    const lb = look?.b && look.b.team === 0 && look.b.built && look.dist < 10 ? look.b : null;
    if (lb && (TRAINS[lb.kind] || UPGRADES.some(u => u.at === lb.kind))) {
      // One key per thing on offer: units first, then the research this building sells that has not been bought.
      const keys = 'ETYU', rows: string[] = [], notes: string[] = []; let i = 0;
      for (const k of TRAINS[lb.kind] || []) {
        const nb = UNIT_NEEDS[k], ok = !nb || this.ownB(nb, true).length > 0, key = keys[i++];
        if (ok) rows.push(`<b>${key}</b> ${UNIT[k].name} · ${UNIT[k].cost}`); else if (!notes.some(n => n.includes(BLD[nb!].name))) notes.push(`<i>${BLD[nb!].name} unlocks ${(TRAINS[lb.kind] || []).filter(x => UNIT_NEEDS[x] === nb).map(x => UNIT[x].name).join(' and ')}</i>`);
        if (P.has('Key' + key)) { if (ok) this.train(lb, k, true); else { sfx.deny(); this.feed('Quartermaster', `${UNIT[k].name} needs ${/^[AEIOU]/.test(BLD[nb!].name) ? 'an' : 'a'} ${BLD[nb!].name} first.`, 'al'); } }
      }
      const sold = UPGRADES.filter(u => u.at === lb.kind), open = sold.filter(u => !this.up[u.key]);
      for (const u of open) {
        if (u.needs && !this.up[u.needs]) { notes.push(`<i>${u.name} needs ${UPGRADES.find(x => x.key === u.needs)!.name}</i>`); continue; }
        if (i >= keys.length) break; const key = keys[i++]; rows.push(`<b>${key}</b> ${u.name} · ${u.cost} <i>${u.blurb}</i>`); if (P.has('Key' + key)) this.buyUpgrade(u.key, true);
      }
      if (sold.length && !open.length) notes.push('All research here is bought');
      const all = rows.concat(notes.slice(0, 2)); if (lb.queue.length) all.push(`${lb.queue.length} queued`);
      this.prompt = all.join(all.length > 2 ? '<br>' : ' &nbsp; ');
    }
    if (!this.prompt && look?.prop && me.kind !== 'rigger' && look.dist < 60) { const q = look.prop.owner || look.prop; if (q.hp < q.maxHp) this.prompt = `${q.name} · <b>${Math.ceil(q.hp / q.maxHp * 100)}%</b>`; }
    if (me.kind === 'rigger') this.updateRigger(dt, P, eye, dir, look); else if (me.kind === 'gantry') this.updateCannon(dt, P, eye, dir, gun); else this.updateGun(dt, P, eye, dir, gun);
  }
  /** First person as a Veyl body. Only in versus, where a player sings for the Chorus. */
  updateVeyl(dt: number, P: Set<string>, eye: THREE.Vector3, dir: THREE.Vector3) {
    const me = this.me!, vm = this.vm.veyl, flash = vm.userData.flash; flash.visible = false; this.raidCall = Math.max(0, this.raidCall - dt);
    this.vCd = Math.max(0, this.vCd - dt); this.comboT -= dt; if (this.comboT <= 0) this.combo = 0;
    // 1, 2 and 3 pick the verse the next raid is written in: all blades, mostly lances, or the deep voice.
    for (let i = 0; i < 3; i++) if (P.has('Digit' + (i + 1)) && this.verse !== i) { this.verse = i; sfx.blip(); }
    if (P.has('KeyG') || P.has('KeyE')) { if (this.time < RAID_CALL_AT) { sfx.deny(); this.hud.feed('Chorus', `The Chorus is still waking. The first raid can be called in ${Math.ceil(RAID_CALL_AT - this.time)} seconds.`, 'al'); } else if (this.raidCall <= 0) { this.raidCall = 90; this.obj.called = true; this.net?.cmd('rd', this.verse); sfx.callout(); } else sfx.deny(); }
    if (me.kind === 'warden') {
      // Right click: the Low Note. Every Veyl in earshot gets its shield back.
      if (P.has('Mouse2')) { if (this.vCd <= 0) { this.vCd = 20; this.net?.cmd('vs'); sfx.charge(1); sfx.boom(.3); this.shake = Math.max(this.shake, .5); this.warn(me.pos.x, me.pos.z, 16, .5); this.hud.damage(V3(me.pos.x, 4.6, me.pos.z), 'LOW NOTE', 'shield'); } else sfx.deny(); }
      if (this.vWind > 0) {
        this.vWind -= dt; if (this.vWind > 0) return;
        this.fireCd = 2; this.recoil = 1; this.shake = Math.min(1, this.shake + .6); const c = V3(this.vX, 0, this.vZ);
        this.explode(c, 1, 38, 4.6, me, true); this.net?.cmd('xx', r1(c.x), r1(c.z), 4.6); return;
      }
      if (this.lmb && this.fireCd <= 0) { this.vWind = .7; this.vX = me.pos.x + Math.sin(this.yaw) * 3.4; this.vZ = me.pos.z + Math.cos(this.yaw) * 3.4; this.warn(this.vX, this.vZ, 4.6, .7); sfx.charge(1); }
      return;
    }
    if (me.kind === 'cantor' && P.has('Mouse2')) {
      // Right click: the Whirl. Everything in arm's reach, all the way round.
      if (this.vCd > 0) sfx.deny(); else { this.vCd = 6; this.fireCd = .5; this.recoil = 1; me.swing = 1; sfx.slash(1); sfx.dash(.6); this.shake = Math.max(this.shake, .35); let n = 0;
        for (const u of this.units) { if (!u.alive || u.team !== 0) continue; if (Math.hypot(u.pos.x - me.pos.x, u.pos.z - me.pos.z) > 3.8 + UNIT[u.kind].rad) continue; this.damage(u, 24, me); n++; }
        if (n) { this.hud.hitmark(false); sfx.hit(); this.hud.damage(V3(me.pos.x, 2.6, me.pos.z), n > 1 ? 'WHIRL x' + n : 'WHIRL!', 'ko'); } return; }
    }
    if (me.kind === 'lancer') {
      // Right click: the Held Note. A beat to wind up, then a beam that goes through the whole line.
      if (this.vWind > 0) {
        this.vWind -= dt; if (this.vWind > 0) return;
        this.fireCd = 1.3; this.recoil = 1; this.kick += .04; this.shake = Math.max(this.shake, .5); flash.visible = true; sfx.zap(1); sfx.boom(.25); me.swing = 1;
        const muzzle = V3(); flash.getWorldPosition(muzzle); muzzle.addScaledVector(dir, 1.6); let at = 0, skip: Unit | null = me, n = 0, fall = 1, wall = false;
        for (let i = 0; i < 4; i++) { const h = this.ray(V3().copy(eye).addScaledVector(dir, at), dir, 80 - at, -1, skip); if (!h) { at = 80; break; } at += h.dist; if (h.unit && h.unit.team === 0) { this.damage(h.unit, 55 * fall, me, !!h.head); skip = h.unit; fall *= .8; n++; at += .4; continue; } if (h.b && h.b.team === 0) { this.damage(h.b, 40, me); n++; } wall = true; break; }
        const end = V3().copy(eye).addScaledVector(dir, Math.min(80, at)); this.tracer(muzzle, end, beamMat, .16); if (wall) this.puff(end, 3, .6, M.teal, .8);
        if (n) { this.hud.hitmark(n > 1); sfx.hit(); if (n > 1) this.hud.streak('ONE NOTE, ' + n + ' VOICES'); } return;
      }
      if (P.has('Mouse2')) { if (this.vCd <= 0) { this.vCd = 7; this.vWind = .8; sfx.charge(1); } else sfx.deny(); return; }
    }
    if (!this.lmb || this.fireCd > 0) return;
    if (me.kind === 'cantor') {
      this.fireCd = .6; this.recoil = 1; me.swing = 1; sfx.slash(1); let any = false; const cut = 16 + this.combo * 4;
      for (const u of this.units) { if (!u.alive || u.team !== 0) continue; const dx = u.pos.x - me.pos.x, dz = u.pos.z - me.pos.z, d = Math.hypot(dx, dz); if (d > 3 + UNIT[u.kind].rad || (dx * dir.x + dz * dir.z) / (d || 1) < .45) continue; this.damage(u, cut, me); any = true; }
      for (const b of this.buildings) { if (!b.alive || b.team !== 0 || this.distToBox(b, me.pos.x, me.pos.z) > 2.8) continue; const dx = b.pos.x - me.pos.x, dz = b.pos.z - me.pos.z; if (dx * dir.x + dz * dir.z < 0) continue; this.damage(b, 14, me); any = true; }
      if (any) { this.hud.hitmark(this.combo >= 3); sfx.hit(); this.shake = Math.max(this.shake, .2 + this.combo * .06); this.combo = Math.min(3, this.combo + 1); this.comboT = 2; }
      return;
    }
    // Lancer: one long, bright note
    this.fireCd = 1.15; this.recoil = 1; this.kick += .02; flash.visible = true; sfx.zap(1); me.swing = 1;
    const hit = this.ray(eye, dir, 70, -1, me), dist = hit ? hit.dist : 70, end = V3().copy(eye).addScaledVector(dir, dist), muzzle = V3(); flash.getWorldPosition(muzzle); muzzle.addScaledVector(dir, 1.6);
    this.tracer(muzzle, end, beamMat, .06);
    const tgt = hit && (hit.unit && hit.unit.team === 0 ? hit.unit : hit.b && hit.b.team === 0 ? hit.b : null);
    if (tgt) { this.damage(tgt, hit!.head ? 40 : 22, me, !!hit!.head); this.hud.hitmark(!!hit!.head); sfx.hit(); this.puff(end, 2, .5, M.teal, .6); } else this.impact(eye, dir, hit, end, 20);
  }
  train(b: Building, k: Kind, manual = false) {
    const st = UNIT[k];
    if (this.net) { this.net.cmd('tn', b.id, k); sfx.blip(); return true; }
    if (this.mission && k !== 'rigger' && !this.mission.units.includes(k)) { if (manual) { sfx.deny(); this.feed('Quartermaster', `No ${st.name}s on this job's paperwork. Later.`, 'al'); } return false; }
    if (this.ore < st.cost) { if (manual) { sfx.deny(); this.feed('Quartermaster', 'Can\'t. We\'re broke. Go hit a rock.', 'al'); } return false; }
    if (this.supplyUsed() + st.supply > this.supplyCap()) { if (manual) { sfx.deny(); this.feed('Quartermaster', 'No beds. Build a Depot first.', 'al'); } return false; }
    if (b.queue.length >= 5) { if (manual) sfx.deny(); return false; }
    this.ore -= st.cost; b.queue.push({ kind: k, t: st.time }); if (manual) sfx.blip(); return true;
  }
  buyUpgrade(key: UpKey, manual = false) {
    const u = UPGRADES.find(x => x.key === key)!; if (this.up[key]) return false;
    if (this.net) { this.net.cmd('up', key); return true; }
    if (!this.ownB(u.at, true).length || (u.needs && !this.up[u.needs])) { if (manual) sfx.deny(); return false; }
    if (this.ore < u.cost) { if (manual) { sfx.deny(); this.feed('Quartermaster', `${u.name} is ${u.cost} ore. Keep digging.`, 'al'); } return false; }
    this.ore -= u.cost; this.up[key] = true; sfx.built();
    const plate = key === 'armor' ? 1.25 : key === 'armor2' ? 1.2 : key === 'armor3' ? 1.15 : 0; if (plate) for (const x of this.own()) { x.maxHp *= plate; x.hp *= plate; }
    this.feed('Quartermaster', u.say, ''); return true;
  }
  canPlace(k: BKind, x: number, z: number, rot: boolean) {
    const st = BLD[k], hx = rot ? st.hz : st.hx, hz = rot ? st.hx : st.hz;
    if (Math.hypot(x, z) > 80) return false;
    for (const b of this.buildings) if (b.alive && Math.abs(x - b.pos.x) < hx + b.hx + 1.6 && Math.abs(z - b.pos.z) < hz + b.hz + 1.6) return false;
    for (const o of this.ores) if (o.amount > 0 && Math.abs(x - o.pos.x) < hx + 2.4 && Math.abs(z - o.pos.z) < hz + 2.4) return false;
    for (const s of this.spires) if (Math.abs(x - s.x) < hx + s.r && Math.abs(z - s.z) < hz + s.r) return false;
    return true;
  }
  place(k: BKind, x: number, z: number, rot: boolean) { if (this.net) { this.net.cmd('pl', k, x, z, rot ? 1 : 0); sfx.place(); this.puff(TMP.set(x, .3, z), 5, 1.2, M.dust, .5, 2); return null; } this.ore -= BLD[k].cost; const b = this.addBuilding(k, 0, x, z, false, rot); sfx.place(); this.puff(TMP.set(x, .3, z), 5, 1.2, M.dust, .5, 2); return b; }

  weldAcc = 0;
  updateRigger(dt: number, P: Set<string>, eye: THREE.Vector3, dir: THREE.Vector3, look: Hit | null) {
    const me = this.me!;
    if (P.has('Digit1')) { this.tool = 1; sfx.blip(); }
    if (P.has('Digit2')) { if (this.tool === 2) this.buildSel = (this.buildSel + 1) % BUILDABLE.length; this.tool = 2; sfx.blip(); }
    if (this.tool === 2 && this.wheel) { this.buildSel = (this.buildSel + (this.wheel > 0 ? 1 : BUILDABLE.length - 1)) % BUILDABLE.length; sfx.blip(); }
    if (this.tool === 2 && P.has('KeyR')) { this.buildRot = !this.buildRot; sfx.blip(); }
    if (this.tool === 2 && P.has('Mouse2')) { this.tool = 1; sfx.blip(); }
    else if (this.tool === 1 && P.has('Mouse2') && this.bashCd <= 0) {
      // Right click: the drill kicks like a jackhammer. Short reach, big shove, and it cracks scenery.
      this.bashCd = 1.1; this.bashT = .25; this.recoil = 1; this.shake = Math.max(this.shake, .4); sfx.clang(); sfx.dash(.6); let any = false;
      for (const u of this.units) { if (!u.alive || u.team !== 1) continue; const dx = u.pos.x - me.pos.x, dz = u.pos.z - me.pos.z, d = Math.hypot(dx, dz); if (d > 3.2 + UNIT[u.kind].rad || (dx * dir.x + dz * dir.z) / (d || 1) < .45) continue; this.damage(u, 22, me); any = true; }
      if (look?.prop && look.dist < 3.6) { this.damageProp(look.prop, 60, me, V3().copy(eye).addScaledVector(dir, look.dist)); any = true; } else if (look?.b && look.b.team === 1 && look.dist < 3.6) { this.damage(look.b, 40, me); any = true; }
      if (any) { this.hud.hitmark(false); sfx.hit(); this.hud.damage(V3().copy(eye).addScaledVector(dir, 2), 'CLONK!', 'ko'); }
    }
    let biting = false; const drilling = this.tool === 1 && this.lmb;
    if (this.tool === 2) {
      const k = BUILDABLE[this.buildSel], g = this.placePos;
      if (!this.groundPoint(g, 26)) g.set(me.pos.x + Math.sin(this.yaw) * 12, 0, me.pos.z + Math.cos(this.yaw) * 12);
      g.x = Math.round(g.x); g.z = Math.round(g.z);
      this.placeOK = this.unlocked(k) && this.canPlace(k, g.x, g.z, this.buildRot) && this.ore >= BLD[k].cost && Math.hypot(g.x - me.pos.x, g.z - me.pos.z) > Math.max(BLD[k].hx, BLD[k].hz) + 1;
      if (P.has('Mouse0')) { if (this.placeOK) { this.place(k, g.x, g.z, this.buildRot); this.tool = 1; this.obj.built = true; this.feed('Quartermaster', `${BLD[k].name} staked out. Hold the drill on it to speed things up.`, ''); } else { sfx.deny(); if (!this.unlocked(k)) this.feed('Quartermaster', this.missing(k).length ? `${BLD[k].name} needs a finished ${this.missing(k).map(n => BLD[n].name).join(' and ')} first.` : `No ${BLD[k].name} on this job's paperwork. Later.`, 'al'); else if (this.ore < BLD[k].cost) this.feed('Quartermaster', `A ${BLD[k].name} is ${BLD[k].cost} ore. We have ${Math.floor(this.ore)}.`, 'al'); } }
    } else if (drilling) {
      this.mineT -= dt;
      if (look && look.dist < 4.2) {
        const at = V3().copy(eye).addScaledVector(dir, look.dist - .15);
        if (look.ore && me.carrying >= this.packCap()) { this.prompt = 'Pack full · <b>walk it to the Headframe</b>'; if (this.mineT <= 0) { this.mineT = .6; sfx.deny(); } }
        else if (look.ore) { biting = true; if (this.mineT <= 0) { this.mineT = this.up.drill ? .32 : .42; const n = Math.min(3, look.ore.amount, this.packCap() - me.carrying); look.ore.amount -= n; me.carrying += n; this.obj.drilled += n; this.net?.cmd('mn', this.ores.indexOf(look.ore), n); sfx.ore(); this.debris(at, 3, .12, M.ore, 3); this.hud.damage(at, '+' + n, 'ore'); this.oreCheck(look.ore); this.shake = Math.max(this.shake, .12); } }
        else if (look.b && look.b.team === 0 && !look.b.built) { biting = true; look.b.progress += dt / BLD[look.b.kind].time * 1.6; this.weldAcc += dt; if (this.mineT <= 0) { if (this.net) { this.net.cmd('wd', look.b.id, r1(this.weldAcc * 100) / 100); } this.weldAcc = 0; this.mineT = .16; this.debris(at, 2, .06, M.spark, 4); } }
        else if (look.b && look.b.team === 0 && look.b.built && look.b.hp < look.b.maxHp) { biting = true; look.b.hp = Math.min(look.b.maxHp, look.b.hp + 40 * dt); this.weldAcc += dt; if (this.mineT <= 0) { if (this.net) { this.net.cmd('fx', look.b.id, r1(this.weldAcc * 100) / 100); } this.weldAcc = 0; this.mineT = .16; this.debris(at, 2, .06, M.spark, 4); } }
        else if (look.prop) { biting = true; if (this.mineT <= 0) { this.mineT = .2; this.damageProp(look.prop, 11, me, at); sfx.hit(); } }
        else if ((look.unit && look.unit.team === 1 && look.dist < 3) || (look.b && look.b.team === 1 && look.dist < 3)) { biting = true; if (this.mineT <= 0) { this.mineT = .25; this.damage((look.unit || look.b)!, 10, me); sfx.hit(); this.debris(at, 2, .08, M.spark, 4); } }
      }
      this.vm.drill.userData.bit.rotation.z += dt * (biting ? 34 : 24); if (biting) this.shake = Math.max(this.shake, .06);
    }
    if (!this.prompt && this.tool === 1 && look && look.dist < 4.2) { if (look.ore) this.prompt = '<b>Hold click</b> Drill ore'; else if (look.prop) this.prompt = `<b>Hold click</b> Drill the ${(look.prop.owner || look.prop).name.toLowerCase()} apart`; else if (look.b && look.b.team === 0 && !look.b.built) this.prompt = '<b>Hold click</b> Weld it up faster'; else if (look.b && look.b.team === 0 && look.b.hp < look.b.maxHp) this.prompt = '<b>Hold click</b> Patch it up'; }
    drillSound(drilling, biting);
  }
  oreCheck(n: OreNode) { if (n.amount <= 0) { n.obj.traverse((m: any) => { if (m.isMesh && m.material === M.ore) m.material = M.oreDead; }); n.obj.scale.setScalar(.6); } else { n.obj.traverse((m: any) => { if (m.isMesh && m.material === M.oreDead) m.material = M.ore; }); n.obj.scale.setScalar(.75 + .25 * n.amount / n.max); } }

  updateGun(dt: number, P: Set<string>, eye: THREE.Vector3, dir: THREE.Vector3, gun: Weapon) {
    const me = this.me!, heavy = me.kind === 'breacher', S = SHOT[me.kind] || SHOT.linesman, vm = heavy ? this.vm.scatter : this.vm[S.vm], flash = vm.userData.flash; flash.visible = false;
    // grenade (Linesman) and shield bash (Breacher)
    if (me.kind === 'patch' && P.has('KeyC')) { if (this.nadeCd <= 0) { this.nadeCd = this.up.stitch ? 7 : 12; this.patchUp(me); this.net?.cmd('pt'); } else sfx.deny(); }
    if (me.kind === 'linesman' && P.has('KeyC')) { if (this.nadeCd <= 0) { this.nadeCd = this.up.frag ? 5 : 9; const v = V3().copy(dir).multiplyScalar(19); v.y += 4.5; this.shoot(V3().copy(eye).addScaledVector(dir, .7), v, 0, 75, true, me); sfx.throw(); } else sfx.deny(); }
    if (heavy && this.brace && P.has('Mouse0') && this.bashCd <= 0) {
      this.bashCd = .9; this.bashT = .25; sfx.clang(); this.shake = Math.max(this.shake, .4); let any = false;
      for (const u of this.units) { if (!u.alive || u.team !== 1) continue; const dx = u.pos.x - me.pos.x, dz = u.pos.z - me.pos.z, d = Math.hypot(dx, dz); if (d > 3.4 + UNIT[u.kind].rad || (dx * dir.x + dz * dir.z) / (d || 1) < .5) continue; this.damage(u, 24, me); const k = u.kind === 'warden' ? 2 : 12; u.kx += dx / (d || 1) * k; u.kz += dz / (d || 1) * k; any = true; }
      if (any) { this.hud.hitmark(false); sfx.hit(); this.hud.damage(V3().copy(eye).addScaledVector(dir, 2), 'WHAM!', 'ko'); }
    }
    if (this.reloadT > 0) { this.reloadT -= dt; if (this.reloadT <= 0) this.ammo = gun.mag; return; }
    if ((P.has('KeyR') && this.ammo < gun.mag) || (this.ammo <= 0 && this.lmb)) { if (this.ammo <= 0) sfx.dry(); this.reloadT = gun.reload; sfx.reload(gun.reload); return; }
    if (this.lmb && this.fireCd <= 0 && this.ammo > 0 && !this.brace) {
      this.fireCd = gun.cd; this.ammo--; flash.visible = true; flash.rotation.z = R(0, 3); const mul = this.gunMul();
      const muzzle = V3(); flash.getWorldPosition(muzzle);
      if (heavy) {
        this.recoil = 1; this.pitch = Math.min(1.45, this.pitch + .03); this.kick += .024; this.shake = Math.min(1, this.shake + .35); sfx.scatter(); const pay = this.payback; this.payback = 0; this.bloom = 1; if (pay > .3) { this.shake = 1; sfx.clang(); this.hud.damage(V3().copy(eye).addScaledVector(dir, 3), 'PAYBACK!', 'crit'); } let hits = 0, total = 0, last: Unit | Building | null = null, crit = false;
        this.quiet = true;
        for (let i = 0; i < 9; i++) {
          const d = V3().copy(dir); d.x += R(-.075, .075); d.y += R(-.05, .05); d.z += R(-.075, .075); d.normalize();
          let hit = this.ray(eye, d, 34, -1, me); if (hit && ((hit.unit && hit.unit.team === 0) || (hit.b && hit.b.team === 0 && hit.dist < 3))) hit = this.ray(eye, d, 34, 1, me);
          const dist = hit ? hit.dist : 34, end = V3().copy(eye).addScaledVector(d, dist); if (i % 2 === 0) this.tracer(muzzle, end);
          const fall = dist < 10 ? 1 : Math.max(.3, 1 - (dist - 10) / 24), tgt = hit && (hit.unit && hit.unit.team === 1 ? hit.unit : hit.b && hit.b.team === 1 ? hit.b : null);
          if (tgt) { const dm = (hit!.head ? 9 : 6) * fall * mul * (1 + pay * .8); total += dm; hits++; last = tgt; crit = crit || !!hit!.head; this.damage(tgt, dm, me); if (i % 3 === 0) this.puff(end, 1, .4, M.teal, .6); } else this.impact(eye, d, hit, end, 6 * fall * mul);
        }
        this.quiet = false;
        if (last) { this.hud.hitmark(crit); sfx.hit(); this.hud.damage(V3(last.pos.x, (isUnit(last) ? UNIT[last.kind].headY : last.h * .6) + .4, last.pos.z), String(Math.round(total)), hits >= 7 ? 'crit' : ''); }
      } else {
        const long = me.kind === 'longshot'; this.recoil = Math.min(1, this.recoil + (long ? 1 : .35)); { const k = S.kick * (1 - this.ads * .5); this.pitch = Math.min(1.45, this.pitch + k); this.kick += k * .8; this.yaw += R(-.0025, .0025); } this.shake = Math.min(1, this.shake + (long ? .4 : .1)); { const low = Math.max(0, 1 - this.ammo / Math.max(1, gun.mag / 4)); long ? sfx.sniper() : me.kind === 'patch' ? sfx.pistol(low) : sfx.rifle(low); }
        const sp = S.sp * (1 - this.ads * S.adsK) * (me.moving ? 1.6 : 1) * (1 + this.bloom * (long ? 0 : 1.2)), d = V3().copy(dir); this.bloom = Math.min(1, this.bloom + (long ? 1 : me.kind === 'patch' ? .2 : .1)); d.x += R(-sp, sp); d.y += R(-sp, sp); d.z += R(-sp, sp); d.normalize();
        let hit = this.ray(eye, d, 150, -1, me);
        // A Patch's rivets mend whoever they hit on their own side.
        if (me.kind === 'patch' && hit?.unit && hit.unit.team === 0 && hit.dist < 60) {
          const o = hit.unit, end = V3().copy(eye).addScaledVector(d, hit.dist); this.tracer(muzzle, end, ringMat, .08);
          if (o.hp < o.maxHp) { if (this.net) this.net.cmd('hl', o.id); else o.hp = Math.min(o.maxHp, o.hp + 10); o.pop = .6; this.puff(end, 3, .35, M.teal, 1.6, .4); this.hud.damage(V3(o.pos.x, UNIT[o.kind].headY + .4, o.pos.z), '+10', 'shield'); this.hud.hitmark(false); sfx.ore(); }
          return;
        }
        if (hit && ((hit.unit && hit.unit.team === 0) || (hit.b && hit.b.team === 0 && hit.dist < 3))) hit = this.ray(eye, d, 150, 1, me);
        const dist = hit ? hit.dist : 150, end = V3().copy(eye).addScaledVector(d, dist);
        // The Long Rifle goes through: up to two more bodies behind the first, each for a little less.
        if (long && hit?.unit && hit.unit.team === 1) { let from = hit.unit, at = dist, n = 1, fall = .7; for (let i = 0; i < 2; i++) { const h2 = this.ray(V3().copy(eye).addScaledVector(d, at + .4), d, 60, 1, from); if (!h2?.unit || h2.unit.team !== 1) break; this.damage(h2.unit, S.body * mul * fall, me); at += .4 + h2.dist; from = h2.unit; fall *= .7; n++; this.puff(V3().copy(eye).addScaledVector(d, at), 2, .35, M.teal, .6); } if (n > 1) { end.copy(eye).addScaledVector(d, at); this.hud.streak(n > 2 ? 'TRIPLE THREAD!' : 'THREADED!'); sfx.crit(); } }
        this.tracer(muzzle, end, tracerMat, long ? .14 : .07);
        if (hit?.unit && hit.unit.team === 1) { const sh = hit.unit.shield > 0; this.damage(hit.unit, (hit.head ? S.head : S.body) * mul, me, !!hit.head); hit.head ? sfx.crit() : sfx.hit(); this.hud.hitmark(!!hit.head); this.puff(end, 2, .35, sh ? M.cyan : M.teal, .6); this.debris(end, 1, .07, M.crys, 3); }
        else if (hit?.b && hit.b.team === 1) { this.damage(hit.b, S.bld * mul, me); this.hud.hitmark(false); this.puff(end, 1, .5, M.teal, .6); this.debris(end, 2, .1, M.indigo, 4); }
        else this.impact(eye, d, hit, end, S.bld * mul);
        const f = this.bits.find(x => x.t <= 0); if (f) { f.m.material = M.spark; f.m.position.copy(muzzle).addScaledVector(dir, -.5); f.v.set(-Math.cos(this.yaw) * 2.5 + R(-.5, .5), 2.5, Math.sin(this.yaw) * 2.5 + R(-.5, .5)); f.m.scale.set(.03, .03, .07); f.spin = 20; f.t = .8; f.m.visible = true; }
      }
    }
  }
  // ------------------------------------------------------------ destructible scenery and rubble physics
  private touch(r: Prop['ranges'][0]) { const a = r.attr as any; if (a.addUpdateRange) a.addUpdateRange(r.start * 3, r.count * 3); a.needsUpdate = true; }
  propMat(p: Prop) { return p.kind === 'metal' ? (p.id % 2 ? M.rust : M.steelD) : p.kind === 'barrel' ? M.rust : p.kind === 'crystal' ? M.crys : p.kind === 'veyl' ? M.indigo : p.kind === 'plant' ? M.cloth : M.rock; }
  blastProps(p: THREE.Vector3, radius: number, dmg: number, from: Unit | Building | null, skip: any = null) {
    for (const q of this.props) { if (!q.alive || q.owner) continue; const d = Math.hypot(q.x - p.x, q.z - p.z) - q.r; if (d > radius || p.y > q.h + radius || p.y < q.y0 - radius) continue; this.damageProp(q, dmg * (1 - .6 * Math.max(0, Math.min(1, d / radius))) * (q.kind === 'barrel' ? 3 : 1), from); }
  }
  damageProp(q: Prop, amt: number, from: Unit | Building | null, at?: THREE.Vector3) {
    const p = q.owner || q; if (!p.alive || amt <= 0) return; const mat = this.propMat(p);
    if (this.net && !this.applying) {   // multiplayer client: show the hit, let the server decide what breaks
      if (from === this.me && this.me) { this.net.cmd('dp', p.id, Math.round(amt * 10) / 10); if (at) { this.puff(at, 1, .35, p.kind === 'crystal' || p.kind === 'veyl' ? M.teal : M.dust, .6); if (p.kind !== 'plant' && Math.random() < .5) this.debris(at, 1, .09, mat, 3); } }
      return;
    }
    p.hp -= amt; if (this.evq) this.evq.push(['pr', p.id, Math.max(0, Math.round(p.hp))]);
    if (at) { this.puff(at, 1, .35, p.kind === 'crystal' || p.kind === 'veyl' ? M.teal : M.dust, .6); if (p.kind !== 'plant' && Math.random() < .5) this.debris(at, 1, .09, mat, 3); if (p.kind === 'metal' || p.kind === 'barrel') this.debris(at, 1, .04, M.spark, 4); }
    if (p.hp <= 0) { this.killProp(p); return; }
    // big things come apart in stages: each one sheds rubble and leaves a shorter, narrower stump
    if (p.stages && p.hp / p.maxHp < 1 - (p.stage + 1) / (p.stages + 1)) {
      p.stage++; const topY = p.h;
      for (const r of p.ranges) { const a = r.attr.array as Float32Array; for (let k = r.start * 3, e = (r.start + r.count) * 3; k < e; k += 3) { a[k] = p.x + (a[k] - p.x) * .9; a[k + 1] *= .76; a[k + 2] = p.z + (a[k + 2] - p.z) * .9; } this.touch(r); }
      p.h *= .76; p.r *= .93; const n = Math.min(12, 4 + Math.round(p.r * 1.5));
      for (let i = 0; i < n; i++) { const a = R(0, 6.283), rr = p.r * R(.3, 1); this.chunk(V3(p.x + Math.cos(a) * rr, R(p.h, topY), p.z + Math.sin(a) * rr), Math.min(2.2, Math.max(.3, p.r * R(.2, .45))), mat, 4 + p.r * .3, V3(p.x, 0, p.z)); }
      for (let i = 0; i < 4; i++) this.puff(TMP.set(p.x + R(-p.r, p.r), R(p.h * .5, topY), p.z + R(-p.r, p.r)), 3, Math.min(4, p.r * .7 + .6), M.dust, 1.2, 1.5);
      const v = this.vol(TMP.set(p.x, 0, p.z)); this.shake = Math.max(this.shake, v * .7); sfx.boom(v * .6); this.hud.damage(V3(p.x, Math.min(p.h, 9) + 1, p.z), 'CRACK!', 'ko');
    }
  }
  killProp(p: Prop) {
    if (!p.alive) return; p.alive = false; const i = this.spires.indexOf(p); if (i >= 0) this.spires.splice(i, 1);
    for (const r of p.ranges) { const a = r.attr.array as Float32Array; for (let k = r.start * 3, e = (r.start + r.count) * 3; k < e; k += 3) { a[k] = p.x; a[k + 1] = -80; a[k + 2] = p.z; } this.touch(r); }
    if (p.obj) this.scene.remove(p.obj);
    if (!p.owner) {
      const mat = this.propMat(p), hh = Math.min(p.h - p.y0, 14), c = V3(p.x, p.y0, p.z), v = this.vol(c), big = p.maxHp >= 800;
      if (p.kind === 'plant') this.puff(TMP.set(p.x, .6, p.z), 3, .5, M.violet, 1, .6);
      else {
        const n = Math.max(3, Math.min(22, Math.round(2 + p.r * hh * .7))), sz = Math.min(2.6, Math.max(.16, p.r * (p.kind === 'rock' || p.kind === 'mesa' ? .55 : .42)));
        for (let k = 0; k < n; k++) { const a = R(0, 6.283), rr = p.r * R(0, .9); this.chunk(V3(p.x + Math.cos(a) * rr, p.y0 + R(.2, hh), p.z + Math.sin(a) * rr), sz * R(.55, 1.25), mat, 3 + Math.min(6, p.r), c, p.kind === 'metal' || p.kind === 'barrel'); }
        for (let k = 0; k < (big ? 6 : 2); k++) this.puff(TMP.set(p.x + R(-p.r, p.r), p.y0 + R(.3, hh), p.z + R(-p.r, p.r)), 3, Math.min(5, p.r * .8 + .5), p.kind === 'crystal' || p.kind === 'veyl' ? M.teal : M.dust, 1.4, 1.6);
        if (p.y0 < 1) this.scorchAt(c, Math.min(9, p.r * 2.2 + .6));
        if (big) { this.shake = Math.max(this.shake, v * 1.1); sfx.boom(v); this.hud.damage(V3(p.x, Math.min(hh, 8) + 1.5, p.z), p.kind === 'metal' ? 'KRUNCH!' : 'CRUMBLE!', 'ko'); } else if (p.kind === 'metal') sfx.clang(); else sfx.boom(v * .35);
      }
      if (p.kind === 'barrel' && !this.net) this.explode(V3(p.x, .6, p.z), -1, 55, 5.5, null);
    }
    for (const l of p.link) this.killProp(l);
  }
  /** One piece of rubble: a rigid chunk that falls, bounces, tumbles and comes to rest. */
  /** Dead buildings do not vanish: tall ones fall over and break where they land, wide ones cave in on themselves. */
  updateWrecks(dt: number) {
    for (const c of this.craters) if (c.t > 0) { c.t -= dt; if (c.t < 3) c.m.position.y -= dt * .25; if (c.t <= 0) c.m.visible = false; }
    for (let i = this.wrecks.length - 1; i >= 0; i--) {
      const w = this.wrecks[i], b = w.b, o = b.obj, veyl = b.team === 1; w.t += dt; const k = Math.min(1, w.t / w.dur); w.puffT -= dt;
      if (w.tall) {
        const ang = k * k * 1.5; o.quaternion.setFromAxisAngle(TMP.set(w.dz, 0, -w.dx), ang).multiply(QT.setFromAxisAngle(UP, w.yaw));
        if (w.puffT <= 0) { w.puffT = .12; this.puff(TMP.set(b.pos.x + R(-1, 1), .4, b.pos.z + R(-1, 1)), 2, 1.2, M.dust, .8, 1.2); }
        if (k >= 1) {
          this.scene.remove(o); const n = Math.max(4, Math.round(b.h / 1.1));
          for (let j = 0; j < n; j++) { const s = (j + .5) / n * b.h, p = V3(b.pos.x + w.dx * s + R(-.5, .5), R(.5, 1.4), b.pos.z + w.dz * s + R(-.5, .5)); for (let q = 0; q < 2; q++) this.chunk(p, R(.55, 1.2) * (1 - s / b.h * .4), this.bldMat(b, j + q), 4.5, V3(b.pos.x + w.dx * s - w.dz * R(-1, 1), 0, b.pos.z + w.dz * s + w.dx * R(-1, 1)), !veyl); this.puff(p, 3, 1.8, veyl ? M.indigoL : M.dust, 1, 1.4); if (j % 3 === 1) this.scorchAt(p, 2.6); }
          for (const u of this.units) { if (!u.alive) continue; const rx = u.pos.x - b.pos.x, rz = u.pos.z - b.pos.z, along = rx * w.dx + rz * w.dz, side = Math.abs(rx * w.dz - rz * w.dx); if (along > 1 && along < b.h + 1 && side < 1.6 + UNIT[u.kind].rad) this.damage(u, 70, null); }
          this.blastProps(V3(b.pos.x + w.dx * b.h * .5, 0, b.pos.z + w.dz * b.h * .5), b.h * .5, 60, null);
          this.crater(b.pos, Math.max(b.hx, b.hz) * 1.5); this.shove(V3(b.pos.x + w.dx * b.h * .5, 0, b.pos.z + w.dz * b.h * .5), b.h * .8, 5);
          const v = this.vol(b.pos); this.shake = Math.max(this.shake, v * .9); sfx.boom(v * .7); this.wrecks.splice(i, 1);
        }
      } else {
        const e = 1 - (1 - k) * (1 - k); o.scale.y = 1 - e * .86; o.rotation.z = (b.id % 2 ? 1 : -1) * (b.stage * .035 + e * .09); o.position.y = -b.stage * .12 - e * .3;
        if (w.puffT <= 0 && k < 1) { w.puffT = .09; const p = V3(b.pos.x + R(-b.hx, b.hx), b.h * (1 - e) * R(.3, 1) + .4, b.pos.z + R(-b.hz, b.hz)); this.puff(p, 3, 2.2, veyl ? M.indigoL : Math.random() < .3 ? M.fire : M.smoke, 1.2, 1.6); this.chunk(p, R(.5, 1.3), this.bldMat(b, Math.floor(w.t * 40)), 6, b.pos, !veyl); }
        if (k >= 1 && w.dur < 50) { w.dur = 60; w.t = 1e-3; this.crater(b.pos, Math.max(b.hx, b.hz) * 1.35); this.scorchAt(b.pos, Math.max(b.hx, b.hz) * 2.6); this.shove(b.pos, Math.max(b.hx, b.hz) * 2.5, 5); }
        else if (w.dur >= 50) { o.scale.y = .14; if (w.t > 55) o.position.y -= dt * .4; if (w.t >= 60) { this.scene.remove(o); this.wrecks.splice(i, 1); } }
      }
    }
  }
  chunk(p: THREE.Vector3, size: number, mat: THREE.Material, power: number, from: THREE.Vector3, boxy = false) {
    if (this.evq) return;
    let c = this.chunks.find(x => x.t <= 0); if (!c) { c = this.chunks.reduce((a, b) => a.t < b.t ? a : b); }
    c.m.geometry = boxy ? G.box : G.dod; c.m.material = mat; c.m.position.copy(p); c.s = size; c.m.scale.set(size * R(.8, 1.3), size * R(.6, 1), size * R(.8, 1.3)); c.m.rotation.set(R(0, 6), R(0, 6), R(0, 6));
    const dx = p.x - from.x, dz = p.z - from.z, d = Math.hypot(dx, dz) || 1; c.v.set(dx / d * power * R(.3, 1) + R(-1, 1), power * R(.2, .9), dz / d * power * R(.3, 1) + R(-1, 1)); c.w.set(R(-6, 6), R(-6, 6), R(-6, 6)); c.rest = false; c.t = R(35, 50); c.m.visible = true;
  }
  /** A blast or a stomp throws nearby rubble, including pieces that had settled. */
  shove(p: THREE.Vector3, radius: number, power: number) {
    for (const c of this.chunks) { if (c.t <= 0) continue; const q = c.m.position, dx = q.x - p.x, dz = q.z - p.z, d = Math.hypot(dx, dz); if (d > radius) continue; const k = (1 - d / radius) / Math.max(.5, c.s); c.rest = false; c.v.x += dx / (d || 1) * power * k; c.v.z += dz / (d || 1) * power * k; c.v.y += power * .8 * k; c.w.set(R(-8, 8), R(-8, 8), R(-8, 8)); }
  }
  updateChunks(dt: number) {
    const me = this.me; this.thudT -= dt;
    for (const c of this.chunks) {
      if (c.t <= 0) continue; c.t -= dt; const q = c.m.position;
      if (c.t <= 0) { c.m.visible = false; continue; } if (c.t < 1.5 && c.t + dt >= 1.5) for (const o of this.chunks) if (o !== c && o.rest && o.t > 1.5 && o.m.position.y > q.y + .1 && Math.abs(o.m.position.x - q.x) < 1.6 && Math.abs(o.m.position.z - q.z) < 1.6) { o.rest = false; o.v.set(0, 0, 0); } if (c.t < 1.5) { q.y -= dt * c.s * .5; continue; }
      if (c.rest) { if (me && me.alive && c.s < 1 && Math.abs(q.x - me.pos.x) < .8 && Math.abs(q.z - me.pos.z) < .8 && me.moving) { const dx = q.x - me.pos.x, dz = q.z - me.pos.z, d = Math.hypot(dx, dz) || 1; c.rest = false; c.v.set(dx / d * 3.5, 2.2, dz / d * 3.5); c.w.set(R(-6, 6), 0, R(-6, 6)); } continue; }
      c.v.y -= 26 * dt; q.addScaledVector(c.v, dt); c.m.rotation.x += c.w.x * dt; c.m.rotation.y += c.w.y * dt; c.m.rotation.z += c.w.z * dt;
      let floor = c.s * .36;
      for (const o of this.chunks) { if (o === c || o.t <= 1.5 || !o.rest) continue; const op = o.m.position, dx = q.x - op.x, dz = q.z - op.z, m = (c.s + o.s) * .4; if (dx > m || dx < -m || dz > m || dz < -m) continue; const d2 = dx * dx + dz * dz; if (d2 > m * m) continue; const top = op.y + (o.s + c.s) * .3; if (q.y > op.y && top > floor) { floor = top; if (d2 > m * m * .3 && c.v.y <= 0) { const d = Math.sqrt(d2); c.v.x += dx / d * 14 * dt; c.v.z += dz / d * 14 * dt; } } }
      if (q.y < floor) {
        q.y = floor;
        if (c.v.y < -2.4) { const hard = -c.v.y; c.v.y *= -.36; c.v.x *= .7; c.v.z *= .7; c.w.multiplyScalar(.55); if (c.s > .55 && hard > 6) { this.puff(TMP.set(q.x, .2, q.z), 1, c.s * .7, M.dust, .5, .8); if (this.thudT <= 0 && this.vol(q) > .25) { this.thudT = .12; sfx.step(true); this.shake = Math.max(this.shake, this.vol(q) * .25 * c.s); } } }
        else { c.v.y = 0; const f = Math.max(0, 1 - dt * 5); c.v.x *= f; c.v.z *= f; c.w.multiplyScalar(Math.max(0, 1 - dt * 7)); if (c.v.x * c.v.x + c.v.z * c.v.z < .06) { c.rest = true; c.v.set(0, 0, 0); } }
      }
      for (const b of this.buildings) { if (!b.alive || q.y > b.h) continue; const dx = q.x - b.pos.x, dz = q.z - b.pos.z, ex = b.hx + c.s * .3, ez = b.hz + c.s * .3; if (Math.abs(dx) >= ex || Math.abs(dz) >= ez) continue; const px = ex - Math.abs(dx), pz = ez - Math.abs(dz); if (px < pz) { q.x += Math.sign(dx || 1) * px; c.v.x = Math.abs(c.v.x) * .4 * Math.sign(dx || 1); } else { q.z += Math.sign(dz || 1) * pz; c.v.z = Math.abs(c.v.z) * .4 * Math.sign(dz || 1); } }
      for (const s of this.spires) { const dx = q.x - s.x, dz = q.z - s.z, m = s.r + c.s * .3; if (Math.abs(dx) > m || Math.abs(dz) > m || q.y > s.h) continue; const d = Math.hypot(dx, dz); if (d >= m || d < .001) continue; const nx = dx / d, nz = dz / d, vn = c.v.x * nx + c.v.z * nz; q.x += nx * (m - d); q.z += nz * (m - d); if (vn < 0) { c.v.x -= 1.4 * vn * nx; c.v.z -= 1.4 * vn * nz; } }
    }
  }
  /** The Patch's pulse: tops up every friendly body nearby, the caster included. */
  patchUp(u: Unit) {
    let n = 0; for (const o of this.own()) { if (Math.hypot(o.pos.x - u.pos.x, o.pos.z - u.pos.z) > 9 || o.hp >= o.maxHp) continue; o.hp = Math.min(o.maxHp, o.hp + 45); n++; if (o !== u) this.puff(TMP.set(o.pos.x, UNIT[o.kind].bodyY + .4, o.pos.z), 3, .3, M.teal, 1.8, .5); }
    for (let i = 0; i < 12; i++) { const a = i / 12 * 6.283; this.puff(TMP.set(u.pos.x + Math.cos(a) * 4.5, .3, u.pos.z + Math.sin(a) * 4.5), 1, .35, M.teal, 1.2, .3); } sfx.built(); if (u === this.me) this.hud.damage(V3(u.pos.x + Math.sin(this.yaw) * 2, 1.8, u.pos.z + Math.cos(this.yaw) * 2), n ? `PATCHED ×${n}` : 'ALL GOOD', 'shield');
  }
  /** A small shell burst: splash damage without the full explosion fanfare. */
  burst(p: THREE.Vector3, dmg: number, radius: number, from: Unit | null, skip: Unit | Building | null = null) {
    for (const u of this.units) { if (!u.alive || u.team !== 1 || u === skip) continue; const d = Math.hypot(u.pos.x - p.x, u.pos.z - p.z); if (d > radius + UNIT[u.kind].rad || Math.abs(p.y - UNIT[u.kind].bodyY) > radius + 1.5) continue; const k = 1 - .6 * Math.min(1, d / radius); this.damage(u, dmg * k, from); if (d > .1 && u.kind !== 'warden') { u.kx += (u.pos.x - p.x) / d * 4 * k; u.kz += (u.pos.z - p.z) / d * 4 * k; } }
    this.blastProps(p, radius, dmg, from, skip); this.shove(p, radius * 1.5, 5);
    this.puff(p, 3, radius * .3, M.fire, 1.4, 1.2); this.puff(p, 2, radius * .32, M.smoke, 1, 1.6); this.debris(p, 3, .14, M.rock, 5); if (p.y < .6) this.scorchAt(p, radius * .7);
    const v = this.vol(p); this.shake = Math.max(this.shake, v * .35); sfx.boom(v * .45);
  }
  stomp(u: Unit) {
    const p = V3(u.pos.x, 0, u.pos.z); let any = false;
    for (const e of this.units) { if (!e.alive || e.team === u.team) continue; const dx = e.pos.x - p.x, dz = e.pos.z - p.z, d = Math.hypot(dx, dz); if (d > 6.5 + UNIT[e.kind].rad) continue; this.damage(e, 46 * (1 - .5 * Math.min(1, d / 6.5)), u); const k = e.kind === 'warden' ? 3 : 16; e.kx += dx / (d || 1) * k; e.kz += dz / (d || 1) * k; any = true; }
    this.blastProps(p, 6.5, 60, u); this.shove(p, 9, 10);
    for (let i = 0; i < 10; i++) { const a = i / 10 * 6.283; this.puff(TMP.set(p.x + Math.cos(a) * 2.6, .3, p.z + Math.sin(a) * 2.6), 1, 1.1, M.dust, 1.6, .5); }
    this.debris(TMP.set(p.x, .3, p.z), 8, .22, M.rock, 7); this.scorchAt(p, 5); this.warn(p.x, p.z, 6.5, .35);
    const v = this.vol(p); this.shake = Math.max(this.shake, v * 1.2); sfx.boom(v); sfx.clang();
    if (u === this.me || any) this.hud.damage(V3(p.x, 2.4, p.z), 'STOMP!', 'ko');
  }
  side = 1;
  updateCannon(dt: number, P: Set<string>, eye: THREE.Vector3, dir: THREE.Vector3, gun: Weapon) {
    const me = this.me!, vm = this.vm.cannon; vm.userData.flash.visible = vm.userData.flashL.visible = false;
    if (P.has('KeyC')) { if (this.nadeCd <= 0) { this.nadeCd = this.up.servo ? 6 : 10; this.stomp(me); } else sfx.deny(); }
    if (P.has('Mouse2')) {
      // Right click: both barrels lob a shell that bursts where it lands.
      if (this.salvoCd <= 0) { this.salvoCd = 7; this.recoil = 1; this.kick += .03; this.shake = 1; this.bloom = 1; sfx.cannon(); sfx.boom(.35); const rx = Math.cos(this.yaw), rz = -Math.sin(this.yaw); for (const sd of [-1, 1]) { const v = V3().copy(dir).multiplyScalar(30); v.x += rx * sd * 1.3; v.z += rz * sd * 1.3; v.y += 3.2; this.shoot(V3(eye.x + dir.x * 1.6 + rx * sd * .9, eye.y - .5, eye.z + dir.z * 1.6 + rz * sd * .9), v, 0, 70, true, me); } vm.userData.flash.visible = vm.userData.flashL.visible = true; }
      else sfx.deny();
    }
    if (this.reloadT > 0) { this.reloadT -= dt; if (this.reloadT <= 0) this.ammo = gun.mag; return; }
    if ((P.has('KeyR') && this.ammo < gun.mag) || (this.ammo <= 0 && this.lmb)) { if (this.ammo <= 0) sfx.dry(); this.reloadT = gun.reload; sfx.reload(gun.reload); return; }
    if (this.lmb && this.fireCd <= 0 && this.ammo > 0) {
      this.fireCd = gun.cd; this.ammo--; this.side = -this.side; const flash = this.side > 0 ? vm.userData.flash : vm.userData.flashL; flash.visible = true; flash.rotation.z = R(0, 3);
      const mul = this.gunMul(), muzzle = V3(); flash.getWorldPosition(muzzle);
      this.recoil = 1; this.pitch = Math.min(1.45, this.pitch + .012); this.kick += .01; this.shake = Math.min(1, this.shake + .22); this.bloom = Math.min(1, this.bloom + .3); sfx.cannon();
      const sp = .012, d = V3().copy(dir); d.x += R(-sp, sp); d.y += R(-sp, sp); d.z += R(-sp, sp); d.normalize();
      let hit = this.ray(eye, d, 140, -1, me); if (hit && ((hit.unit && hit.unit.team === 0) || (hit.b && hit.b.team === 0 && hit.dist < 4))) hit = this.ray(eye, d, 140, 1, me);
      let dist = hit ? hit.dist : 140; if (!hit && d.y < 0) dist = Math.min(dist, -eye.y / d.y);
      const end = V3().copy(eye).addScaledVector(d, dist); this.tracer(muzzle, end, tracerMat, .16);
      const tgt = hit && (hit.unit && hit.unit.team === 1 ? hit.unit : hit.b && hit.b.team === 1 ? hit.b : null);
      if (tgt) { this.damage(tgt, (hit!.head ? 34 : 22) * mul, me, !!hit!.head); this.hud.hitmark(!!hit!.head); hit!.head ? sfx.crit() : sfx.hit(); }
      if (hit?.prop) this.damageProp(hit.prop, 22 * mul, me, end);
      if (dist < 139) this.burst(end, 14 * mul, 3.2, me, tgt);
    }
  }
  impact(eye: THREE.Vector3, d: THREE.Vector3, hit: Hit | null, end: THREE.Vector3, dmg = 7) {
    if (hit?.prop) { this.damageProp(hit.prop, dmg, this.me, end); return; }
    if (!hit && d.y < 0) { const t = -eye.y / d.y; if (t < 150) end.copy(eye).addScaledVector(d, t); else return; } else if (!hit) return; this.puff(end, 1, .35, M.dust, .6); this.debris(end, 1, .07, M.rock, 3); }
  shoot(pos: THREE.Vector3, vel: THREE.Vector3, team: number, dmg: number, nade: boolean, from: Unit | null, ghost = 0) {
    const pk = () => [r1(pos.x), r1(pos.y), r1(pos.z), r1(vel.x), r1(vel.y), r1(vel.z), team, nade ? 1 : 0];
    if (this.evq && !ghost) this.evq.push(['pj', ...pk(), 1]); else if (this.net && !this.applying) this.net.cmd('pj', ...pk());
    const obj = (nade ? this.nadeProto : this.boltProto).clone(true); obj.position.copy(pos); this.scene.add(obj);
    this.projs.push({ obj, pos: pos.clone(), vel: vel.clone(), team, dmg, nade, life: nade ? 4 : 2.2, from, ghost });
  }
  updateProjs(dt: number) {
    for (let i = this.projs.length - 1; i >= 0; i--) {
      const p = this.projs[i]; p.life -= dt; if (p.nade) p.vel.y -= 20 * dt; p.pos.addScaledVector(p.vel, dt); p.obj.position.copy(p.pos);
      if (p.nade) { p.obj.rotation.x += dt * 9; p.obj.rotation.z += dt * 5; } else { p.obj.lookAt(TMP.copy(p.pos).add(p.vel)); p.obj.rotateZ(this.time * 12); }
      let hit = p.life <= 0 || p.pos.y <= .12, tgt: Unit | Building | null = null;
      if (!hit) for (const u of this.units) { if (!u.alive || u.team === p.team) continue; const st = UNIT[u.kind]; if (Math.abs(u.pos.x - p.pos.x) > 3) continue; if (Math.hypot(u.pos.x - p.pos.x, u.pos.z - p.pos.z) < st.rad + .3 && p.pos.y < st.headY + .5) { hit = true; tgt = u; break; } }
      if (!hit) for (const b of this.buildings) { if (!b.alive || (b.team === p.team && !p.nade)) continue; if (Math.abs(p.pos.x - b.pos.x) < b.hx && Math.abs(p.pos.z - b.pos.z) < b.hz && p.pos.y < b.h) { hit = true; if (b.team !== p.team) tgt = b; break; } }
      if (!hit) for (const s of this.spires) if (Math.abs(p.pos.x - s.x) < s.r && Math.abs(p.pos.z - s.z) < s.r && p.pos.y < s.h) { hit = true; if (!p.nade) this.damageProp(s, p.dmg, p.from); break; }
      if (!hit) continue;
      if (p.ghost === 1) { /* the server's own shot: it sends the result */ if (!p.nade) this.puff(p.pos, 3, .5, M.cyan, .8); }
      else if (p.nade) this.explode(p.pos, p.team, p.ghost ? 0 : p.dmg, 5.5, p.from);
      else { if (tgt) this.damage(tgt, p.dmg, p.from); this.puff(p.pos, 3, .5, M.cyan, .8); this.debris(p.pos, 2, .1, M.crys, 4); sfx.zap(this.vol(p.pos) * .6); }
      this.scene.remove(p.obj); this.projs.splice(i, 1);
    }
  }

  // ------------------------------------------------------------ unit AI
  updateUnits(dt: number) {
    const us = this.units, me = this.me, t = this.time;
    const hq = this.ownB('headframe', true)[0];
    for (const u of us) {
      if (!u.alive) continue; if (u.carrying > 0 && (u === me || u.pilot) && hq && this.distToBox(hq, u.pos.x, u.pos.z) < 2.6) this.bank(u); if (u !== me) u.moving = false; u.cd -= dt; u.think -= dt; u.swing = Math.max(0, u.swing - dt * 4); u.flashT -= dt; u.pop = Math.max(0, u.pop - dt * 7);
      if (u.maxShield && t - u.lastHit > 5) u.shield = Math.min(u.maxShield, u.shield + 14 * dt);
      if (u.team === 0 && this.up.weld && u.hp < u.maxHp && t - u.lastHit > 8) u.hp = Math.min(u.maxHp, u.hp + u.maxHp * .02 * dt);
      if (u.kx || u.kz) { u.pos.x += u.kx * dt; u.pos.z += u.kz * dt; const k = Math.max(0, 1 - dt * 7); u.kx *= k; u.kz *= k; if (Math.abs(u.kx) + Math.abs(u.kz) < .05) u.kx = u.kz = 0; this.collide(u, u.pos.x, u.pos.z); }
      if (u.team === 0 && u.hp < u.maxHp && t - u.lastHit > 5) for (const b of this.buildings) if (b.team === 0 && b.built && (b.kind === 'depot' || b.kind === 'headframe') && Math.abs(b.pos.x - u.pos.x) < 16 && Math.abs(b.pos.z - u.pos.z) < 16) { u.hp = Math.min(u.maxHp, u.hp + 5 * dt); break; }
      if (u.pilot) { u.kx = u.kz = 0; if (u.hp < u.maxHp && t - u.lastHit > 6) u.hp = Math.min(u.maxHp, u.hp + u.maxHp * .05 * dt); }
      else if (u !== me || this.staticT > 0) { if (u.kind === 'rigger') this.aiRigger(u, dt); else if (u.team === 0) this.aiSoldier(u, dt); else if (u.kind === 'cantor') this.aiCantor(u, dt); else if (u.kind === 'lancer') this.aiLancer(u, dt); else this.aiWarden(u, dt); }
    }
    // keep bodies apart
    for (let i = 0; i < us.length; i++) { const a = us[i]; if (!a.alive) continue; const ra = UNIT[a.kind].rad; for (let j = i + 1; j < us.length; j++) { const b = us[j]; if (!b.alive) continue; const dx = b.pos.x - a.pos.x; if (dx > 4 || dx < -4) continue; const dz = b.pos.z - a.pos.z, mine = a === me || b === me, lim = (ra + UNIT[b.kind].rad) * (mine ? (a.team === b.team ? 1.8 : 1.25) : 1.12), d2 = dx * dx + dz * dz; if (d2 < lim * lim && d2 > 1e-5) { const d = Math.sqrt(d2), p = (lim - d) * .5; const wa = a === me || a.pilot ? 0 : b.kind === 'warden' ? 2 : mine ? 2 : 1, wb = b === me || b.pilot ? 0 : a.kind === 'warden' ? 2 : mine ? 2 : 1; a.pos.x -= dx / d * p * wa; a.pos.z -= dz / d * p * wa; b.pos.x += dx / d * p * wb; b.pos.z += dz / d * p * wb; } } }
    this.poseUnits(dt);
  }
  /** Turns each unit's state into a pose: legs, arms, bob and muzzle flash. */
  poseUnits(dt: number) {
    const us = this.units, t = this.time;
    for (const u of us) {
      if (!u.alive) continue; const r = u.rig, o = u.obj; o.position.x = u.pos.x; o.position.z = u.pos.z;
      let dy = u.yaw - o.rotation.y; dy = Math.atan2(Math.sin(dy), Math.cos(dy)); o.rotation.y += dy * Math.min(1, dt * 12);
      if (u.moving) u.phase += dt * (u.kind === 'gantry' ? 6.5 : u.kind === 'breacher' ? 9 : 11); const amp = u.moving ? .75 : 0, ease = Math.min(1, dt * 14), base = u.kind === 'breacher' ? 1.14 : 1, sc = base * (1 + u.pop * .1);
      o.scale.set(sc, base * (1 - u.pop * .06), sc);
      if (r.legL && r.legR) {
        const s = Math.sin(u.phase) * amp; r.legL.rotation.x += (s - r.legL.rotation.x) * ease; r.legR.rotation.x += (-s - r.legR.rotation.x) * ease; o.position.y = u.moving ? Math.abs(Math.cos(u.phase)) * .07 : 0;
        const working = u.state === 'mining' || u.state === 'build' || u.state === 'repair';
        r.body.rotation.x += ((u.moving ? .1 : working ? .16 : 0) - u.pop * .12 - r.body.rotation.x) * ease; r.body.rotation.z = u.moving ? Math.sin(u.phase) * .04 : 0;
        if (r.head) r.head.rotation.y += ((u.moving || u.target || working ? 0 : Math.sin(t * .7 + u.id) * .5) - r.head.rotation.y) * Math.min(1, dt * 4);
        if (u.kind === 'rigger') { if (r.armL) r.armL.rotation.x += (-s * .8 - r.armL.rotation.x) * ease; if (r.armR) r.armR.rotation.x = working ? -.5 + Math.sin(t * 34 + u.id) * .05 : s * .3; }
        else { if (r.arms) { r.arms.rotation.x += (-u.pitch * .8 + (u.moving && !u.target ? .25 : 0) - u.swing * .1 - r.arms.rotation.x) * ease; r.arms.position.z = .05 - u.swing * .1; } if (r.armL) r.armL.rotation.x = u.moving ? Math.sin(u.phase) * .12 : 0; if (r.flash) { r.flash.visible = u.flashT > 0; if (u.flashT > 0) r.flash.rotation.z = t * 40; } }
      } else {
        const big = u.kind === 'warden'; o.position.y = (big ? .3 : .12) + Math.sin(t * (big ? 1.4 : 2.4) + u.id) * (big ? .12 : .07);
        r.body.rotation.x += ((u.moving ? (u.dashT > 0 ? .5 : .16) : 0) - u.pop * .1 - r.body.rotation.x) * ease; if (r.halo) r.halo.rotation.z += dt * (u.wind > 0 ? 9 : 1.6);
        if (u.kind === 'cantor' && r.armR) r.armR.rotation.x = -u.swing * 1.7;
        if (u.kind === 'lancer') { if (r.arms) r.arms.rotation.x = -u.pitch; if (r.flash) { r.flash.visible = u.wind > 0; const k = u.wind > 0 ? 1.4 - u.wind : 0; r.flash.scale.setScalar(Math.max(.01, k)); r.flash.rotation.z = t * 9; } }
        if (big && r.armL && r.armR) { const k = u.wind > 0 ? Math.min(1, (1 - u.wind / .9) * 1.4) : 0; const a = u.wind > 0 ? -2.4 * k : u.swing * .9; r.armL.rotation.x += (a - r.armL.rotation.x) * Math.min(1, dt * 18); r.armR.rotation.x = r.armL.rotation.x; }
      }
    }
  }
  aiRigger(u: Unit, dt: number) {
    const hq = this.ownB('headframe')[0];
    if (u.site && (!u.site.alive || (u.site.built && u.site.hp >= u.site.maxHp))) { u.site.builder = null; u.site = null; u.state = 'idle'; }
    if (u.site) {
      const b = u.site; if (this.distToBox(b, u.pos.x, u.pos.z) > 1.6) { this.moveTo(u, b.pos.x, b.pos.z, dt); u.state = 'toSite'; }
      else { u.state = b.built ? 'repair' : 'build'; u.yaw = Math.atan2(b.pos.x - u.pos.x, b.pos.z - u.pos.z); if (b.built) b.hp = Math.min(b.maxHp, b.hp + 16 * dt); else b.progress += dt / BLD[b.kind].time; if (u.think <= 0) { u.think = .2; this.debris(TMP.set(u.pos.x + Math.sin(u.yaw) * .9, 1, u.pos.z + Math.cos(u.yaw) * .9), 1, .06, M.spark, 3); } }
      return;
    }
    if (u.state === 'idle' || (u.node && u.node.amount <= 0 && u.state !== 'toHQ')) { let best: OreNode | null = null, bd = 1e9; for (const n of this.ores) { if (n.amount <= 0) continue; const d = n.pos.distanceTo(u.pos) + (this.units.filter(o => o.node === n).length) * 6 + (hq ? n.pos.distanceTo(hq.pos) * .6 : 0); if (d < bd) { bd = d; best = n; } } u.node = best; u.state = best ? 'toOre' : 'wait'; }
    if (u.state === 'toOre' && u.node) { if (this.moveTo(u, u.node.pos.x, u.node.pos.z, dt, 2.5)) { u.state = 'mining'; u.timer = 3; } }
    else if (u.state === 'mining' && u.node) { u.yaw = Math.atan2(u.node.pos.x - u.pos.x, u.node.pos.z - u.pos.z); u.timer -= dt * (this.up.drill ? 1.3 : 1); if (u.think <= 0) { u.think = .5; if (this.vol(u.pos) > .3) this.debris(TMP.set(u.pos.x + Math.sin(u.yaw) * 1.1, 1, u.pos.z + Math.cos(u.yaw) * 1.1), 1, .1, M.ore, 3); } if (u.timer <= 0) { const n = Math.min(this.up.buckets ? 10 : 7, u.node.amount); u.node.amount -= n; u.carrying = n; this.oreCheck(u.node); if (u.rig.pack) u.rig.pack.visible = true; u.state = 'toHQ'; } }
    else if (u.state === 'toHQ') { if (!hq) { u.state = 'wait'; return; } if (this.distToBox(hq, u.pos.x, u.pos.z) < 1.7) { this.ore += u.carrying; this.stats.mined += u.carrying; u.carrying = 0; if (u.rig.pack) u.rig.pack.visible = false; u.state = 'idle'; } else this.moveTo(u, hq.pos.x + 1.6, hq.pos.z + hq.hz + .8, dt, .3); }
  }
  acquire(u: Unit, range: number, bRange: number) {
    let best: Unit | Building | null = null, bd = range;
    // Not simply the nearest: fighters go for healers, marksmen and the wounded first, and think twice about a raised shield.
    let bs = 1e9;
    for (const o of this.units) {
      if (!o.alive || o.team === u.team) continue; const dx = o.pos.x - u.pos.x, dz = o.pos.z - u.pos.z; if (dx > range || dx < -range || dz > range || dz < -range) continue; const d = Math.hypot(dx, dz); if (d >= range) continue;
      const k = o.kind, w = (u.team ? (k === 'patch' ? .6 : k === 'longshot' ? .7 : k === 'breacher' ? 1.25 : k === 'rigger' ? 1.15 : 1) : (k === 'lancer' ? .8 : k === 'warden' ? 1.1 : 1)) * (o.hp < o.maxHp * .4 ? .75 : 1) * (o === u.target ? .85 : 1);
      const sc = (d + 4) * w; if (sc < bs) { bs = sc; bd = d; best = o; }
    }
    if (!best && bRange > 0) { bd = bRange; for (const b of this.buildings) { if (!b.alive || b.team === u.team) continue; const d = this.distToBox(b, u.pos.x, u.pos.z); if (d < bd) { bd = d; best = b; } } }
    return best;
  }
  aimAt(u: Unit, t: Unit | Building, fromY: number) { const ty = isUnit(t) ? UNIT[t.kind].bodyY : Math.min(t.h * .5, 3), d = Math.hypot(t.pos.x - u.pos.x, t.pos.z - u.pos.z); u.yaw = Math.atan2(t.pos.x - u.pos.x, t.pos.z - u.pos.z); u.pitch += (Math.atan2(ty - fromY, d) - u.pitch) * .3; return ty; }
  aiMend(u: Unit, dt: number) {
    if (u.think <= 0) { let best: Unit | null = null, br = .85; for (const o of this.own()) { if (o === u || o.hp >= o.maxHp) continue; const d = Math.hypot(o.pos.x - u.pos.x, o.pos.z - u.pos.z); if (d > 13) continue; const r = o.hp / o.maxHp; if (r < br) { br = r; best = o; } } u.mend = best; }
    const m = u.mend; if (!m || !m.alive || m.hp >= m.maxHp) { u.mend = null; return; }
    const d = Math.hypot(m.pos.x - u.pos.x, m.pos.z - u.pos.z); if (d > 14) { u.mend = null; return; }
    m.hp = Math.min(m.maxHp, m.hp + (this.up.stitch ? 24 : 15) * dt); u.timer -= dt;
    if (u.timer <= 0) { u.timer = .3; this.tracer(V3(u.pos.x, 1.2, u.pos.z), V3(m.pos.x, UNIT[m.kind].bodyY, m.pos.z), ringMat, .06); this.puff(TMP.set(m.pos.x + R(-.3, .3), UNIT[m.kind].bodyY + .3, m.pos.z + R(-.3, .3)), 1, .28, M.teal, 1.8, .3); }
  }
  aiSoldier(u: Unit, dt: number) {
    const heavy = u.kind === 'breacher', big = u.kind === 'gantry', long = u.kind === 'longshot', doc = u.kind === 'patch', glass = long && this.up.glass, range = big ? 24 : long ? (glass ? 44 : 36) : doc ? 15 : heavy ? 10 : 19;
    if (doc) this.aiMend(u, dt);
    // Badly hurt and not on a push: walk to the nearest Patch, Depot or the Headframe and come back when mended.
    if (u.state === 'heal' || (u.hp < u.maxHp * .35 && u.order.type === 'guard' && !big && !doc)) {
      if (u.hp > u.maxHp * .75 || u.order.type !== 'guard') u.state = 'idle';
      else { let hx = 0, hz = 0, bd = 1e9; for (const o of this.own('patch')) { const dd = Math.hypot(o.pos.x - u.pos.x, o.pos.z - u.pos.z); if (dd < bd) { bd = dd; hx = o.pos.x; hz = o.pos.z; } } if (bd > 40) for (const b of this.buildings) if (b.alive && b.team === 0 && b.built && (b.kind === 'depot' || b.kind === 'headframe')) { const dd = Math.hypot(b.pos.x - u.pos.x, b.pos.z - u.pos.z); if (dd < bd) { bd = dd; hx = b.pos.x; hz = b.pos.z + b.hz + 2; } }
        if (bd < 1e9) { u.state = 'heal'; if (bd > 5) { u.target = null; this.moveTo(u, hx, hz, dt, 4, 1.1); return; } } }
    }
    if (u.think <= 0) { u.think = .3; u.target = this.acquire(u, long ? (glass ? 52 : 44) : 30, u.order.type === 'guard' ? 0 : 28); }
    const t = u.target;
    if (t && t.alive) {
      const isB = !isUnit(t), d = isB ? this.distToBox(t as Building, u.pos.x, u.pos.z) : t.pos.distanceTo(u.pos), ty = this.aimAt(u, t, 1.1);
      if (d > range) this.moveTo(u, t.pos.x, t.pos.z, dt, 1, heavy ? 1.15 : 1);
      else if (u.cd <= 0) {
        const mul = this.gunMul(), a = V3(u.pos.x + Math.sin(u.yaw) * 1.1, 1.0, u.pos.z + Math.cos(u.yaw) * 1.1); u.swing = 1; u.flashT = .07;
        if (big) { u.cd = .8 + R(0, .15); a.y = 2.3; const b = V3(t.pos.x + R(-.8, .8), isB ? ty : .3, t.pos.z + R(-.8, .8)); this.tracer(a, b, tracerMat, .16); sfx.blast(this.vol(u.pos) * .6); this.damage(t, (isB ? 16 : 12) * mul, u); this.burst(b, 12 * mul, 3.2, u, t); if (this.time > u.dashCd && !isB && d < 6) { u.dashCd = this.time + (this.up.servo ? 7 : 12); this.stomp(u); } }
        else if (heavy) { u.cd = 1.05 + R(0, .2); let dm = 0; for (let i = 0; i < 5; i++) { const hit = isB || Math.random() < .7; if (hit) dm += isB ? 4 : 6; if (i % 2 === 0) this.tracer(a, V3(t.pos.x + R(-1, 1), ty + R(-.6, .6), t.pos.z + R(-1, 1))); } sfx.blast(this.vol(u.pos) * .5); this.damage(t, dm * mul, u); }
        else if (long) { u.cd = 1.7 + R(0, .3); const hit = isB || Math.random() < (d < 12 ? .4 : .85), b = V3(t.pos.x, ty + .3, t.pos.z); if (!hit) b.add(TMP.set(R(-1.5, 1.5), R(0, 1.5), R(-1.5, 1.5))); this.tracer(a, b, tracerMat, .13); sfx.blast(this.vol(u.pos) * .5); if (hit) this.damage(t, (isB ? 18 : 52) * mul * (glass ? 1.15 : 1), u); }
        else if (doc) { u.cd = .55 + R(0, .1); const hit = isB || Math.random() < .6, b = V3(t.pos.x, ty, t.pos.z); this.tracer(a, b); sfx.shot(this.vol(u.pos) * .35); if (hit) this.damage(t, 5 * mul, u); }
        else if (!isB && d > 9 && d < 24 && this.time > u.dashCd && this.units.filter(o => o.alive && o.team === 1 && Math.abs(o.pos.x - t.pos.x) < 4.5 && Math.abs(o.pos.z - t.pos.z) < 4.5).length >= 3) {
          // three or more bunched up: a Linesman lobs a grenade into the middle of them
          u.dashCd = this.time + (this.up.frag ? 9 : 15); u.cd = .7; const hs = Math.max(8, Math.min(19, d * 1.05)), v = V3((t.pos.x - u.pos.x) / d * hs, 4.5, (t.pos.z - u.pos.z) / d * hs); this.shoot(V3(u.pos.x, 1.5, u.pos.z).addScaledVector(v, .04), v, 0, 60, true, u); if (this.vol(u.pos) > .3) sfx.throw();
        }
        else { u.cd = .38 + R(0, .08); const hit = isB || Math.random() < .7, b = V3(t.pos.x, ty, t.pos.z); if (!hit) b.add(TMP.set(R(-1.5, 1.5), R(-.5, 1.5), R(-1.5, 1.5))); this.tracer(a, b); sfx.shot(this.vol(u.pos) * .5); if (hit) this.damage(t, (isB ? 5 : 8) * mul, u); }
      }
      return;
    }
    u.target = null; u.pitch *= .9; const o = u.order, me = this.me;
    let lead = o.lead?.alive ? o.lead : me;
    // Online, the player being followed may have lost that body. Follow whatever body that same player drives now.
    if (o.type === 'follow' && o.lead && !o.lead.alive && o.lead.pilot) { const nb = this.units.find(x => x.alive && x.pilot === o.lead!.pilot && x.team === u.team); if (nb) { o.lead = nb; lead = nb; } }
    if (o.type === 'follow' && lead?.alive) { const a = u.slot * 2.4, r = 2.8 + (u.slot % 3) * 1.0, tx = lead.pos.x + Math.cos(a) * r, tz = lead.pos.z + Math.sin(a) * r; if (Math.hypot(tx - u.pos.x, tz - u.pos.z) > 1.6) this.moveTo(u, tx, tz, dt, .5, 1.3); }
    else if (o.type !== 'follow') this.advance(u, dt, o.type === 'amove' ? 5 : .7);
  }
  /** A guard whose shield is gone and whose health is low breaks off, once, and comes back when the shield has regrown. */
  /** A Veyl guard that has chased someone too far from its post gives up and walks home, so a lone scout cannot drag the garrison into the pit. */
  leash(u: Unit, dt: number) {
    if (u.order.type !== 'guard' || u.pilot) return false; const d = Math.hypot(u.pos.x - u.order.x, u.pos.z - u.order.z);
    if (d > 60) u.leashed = true; else if (d < 12) u.leashed = false; if (!u.leashed) return false;
    u.target = null; u.wind = 0; this.moveTo(u, u.order.x, u.order.z, dt, 1, 1); return true;
  }
  aiFallBack(u: Unit, dt: number) {
    if (u.state === 'flee') { u.timer -= dt; const st = this.stones()[0]; if (u.timer <= 0 || !st || u.shield > u.maxShield * .7) { u.state = 'idle'; return false; } u.target = null; this.moveTo(u, st.pos.x + ((u.id % 5) - 2) * 2, st.pos.z + ((u.id % 3) - 1) * 3, dt, 3, 1.15); return true; }
    if (u.order.type === 'guard' && this.dir.alarmT <= 0 && u.maxShield && u.shield <= 0 && u.hp < u.maxHp * .4 && !u.fled && this.stones().length) { u.fled = true; u.state = 'flee'; u.timer = 7; return true; }
    return false;
  }
  aiCantor(u: Unit, dt: number) {
    if (this.leash(u, dt)) return;
    u.dashCd -= dt; u.dashT -= dt; if (this.aiFallBack(u, dt)) return;
    if (u.think <= 0) { u.think = .3; const raid = u.order.type === 'raid', cur = u.target; if (!cur || !cur.alive || !isUnit(cur)) u.target = this.acquire(u, raid ? 22 : 28, raid && !(u.order.path && u.order.path.length) ? 14 : 0); }
    const t = u.target;
    if (t && t.alive) {
      const isB = !isUnit(t), d = isB ? this.distToBox(t as Building, u.pos.x, u.pos.z) : t.pos.distanceTo(u.pos);
      if (!isB && d > 45) { u.target = null; return; }
      if (d > (isB ? 1.3 : 1.7 + UNIT[(t as Unit).kind].rad * .5)) { if (d > 6 && d < 13 && u.dashCd <= 0) { u.dashT = .4; u.dashCd = 3.5; this.puff(TMP.copy(u.pos).setY(.5), 3, .7, M.teal, .4); sfx.dash(this.vol(u.pos)); } 
        // closing on someone with a gun, a Cantor weaves instead of running down the barrel
        let wx = 0, wz = 0; if (!isB && d > 7 && u.dashT <= 0) { const k = Math.sin(this.time * 3.1 + u.id * 1.7) * Math.min(4.5, d * .3), nx = -(t.pos.z - u.pos.z) / d, nz = (t.pos.x - u.pos.x) / d; wx = nx * k; wz = nz * k; }
        this.moveTo(u, t.pos.x + wx, t.pos.z + wz, dt, .5, u.dashT > 0 ? 2.6 : 1); }
      else { u.yaw = Math.atan2(t.pos.x - u.pos.x, t.pos.z - u.pos.z); if (u.cd <= 0) { u.cd = .95; u.swing = 1; sfx.slash(this.vol(u.pos)); this.damage(t, (isB ? 10 : 13) * this.diff.enemy, u); } }
      return;
    }
    this.advance(u, dt, u.order.type === 'raid' ? 3 : 1.5, u.order.type === 'raid' || this.dir.alarmT > 0 ? 1 : .6);
  }
  aiLancer(u: Unit, dt: number) {
    if (this.leash(u, dt)) return;
    if (u.wind <= 0 && this.aiFallBack(u, dt)) return;
    if (u.wind > 0) {
      u.wind -= dt; const t = u.target; if (t && t.alive) this.aimAt(u, t, 1.5);
      if (u.wind <= 0) { u.cd = 2 + R(0, .4); if (t && t.alive) { const from = V3(u.pos.x + Math.sin(u.yaw) * 2, 1.5, u.pos.z + Math.cos(u.yaw) * 2), ty = isUnit(t) ? UNIT[t.kind].bodyY : Math.min(t.h * .5, 3), v = V3(t.pos.x - from.x, ty - from.y, t.pos.z - from.z).normalize().multiplyScalar(30); this.shoot(from, v, 1, 20 * this.diff.enemy, false, u); sfx.zap(this.vol(u.pos)); u.swing = 1; } }
      return;
    }
    if (u.think <= 0) { u.think = .35; const raid = u.order.type === 'raid'; u.target = this.acquire(u, 34, raid && !(u.order.path && u.order.path.length) ? 24 : 0); }
    const t = u.target;
    if (t && t.alive) {
      const isB = !isUnit(t), d = isB ? this.distToBox(t as Building, u.pos.x, u.pos.z) : t.pos.distanceTo(u.pos); this.aimAt(u, t, 1.5);
      if (d > 25) this.moveTo(u, t.pos.x, t.pos.z, dt);
      else if (!isB && d < 9) { const ax = u.pos.x - t.pos.x, az = u.pos.z - t.pos.z, l = Math.hypot(ax, az) || 1; this.moveTo(u, u.pos.x + ax / l * 4, u.pos.z + az / l * 4, dt, .2, .9); u.yaw = Math.atan2(-ax, -az); if (u.cd <= 0) u.wind = .55; }
      else if (u.cd <= 0) u.wind = .7;
      else if (!isB) this.takeCover(u, t as Unit, dt);
      return;
    }
    u.cover = null; u.pitch *= .9; this.advance(u, dt, u.order.type === 'raid' ? 6 : 1.5, u.order.type === 'raid' || this.dir.alarmT > 0 ? 1 : .6);
  }
  /** Between shots a Lancer ducks behind the nearest solid scenery, then leans out to fire. */
  takeCover(u: Unit, t: Unit, dt: number) {
    let c = u.cover || null; if (c && (!c.alive || Math.hypot(c.x - u.pos.x, c.z - u.pos.z) > 11)) c = u.cover = null;
    if (!c && u.think > .3) { let bd = 8; for (const s of this.spires) { if (s.h < 1.6 || s.r < .5 || s.r > 6) continue; const dd = Math.hypot(s.x - u.pos.x, s.z - u.pos.z) - s.r; if (dd < bd && Math.hypot(s.x - t.pos.x, s.z - t.pos.z) > 6) { bd = dd; c = s; } } u.cover = c; }
    if (!c) return;
    const ax = c.x - t.pos.x, az = c.z - t.pos.z, l = Math.hypot(ax, az) || 1, off = c.r + UNIT[u.kind].rad + .4, side = u.id % 2 ? 1 : -1, peek = u.cd < .8 ? c.r + 1.4 : 0;
    this.moveTo(u, c.x + ax / l * off - az / l * peek * side, c.z + az / l * off + ax / l * peek * side, dt, .3);
  }
  aiWarden(u: Unit, dt: number) {
    if (u.wind > 0) { u.wind -= dt; if (u.wind <= 0) { u.cd = 2.2; u.swing = 1; this.explode(V3(u.windX, 0, u.windZ), 1, 34 * this.diff.enemy, 4.6, u, true); } return; }
    if (u.think <= 0) { u.think = .4; const raid = u.order.type === 'raid', cur = u.target; if (!cur || !cur.alive || !isUnit(cur) || cur.pos.distanceTo(u.pos) > 30) u.target = this.acquire(u, raid ? 20 : 26, raid && !(u.order.path && u.order.path.length) ? 18 : 0); }
    const t = u.target;
    if (t && t.alive) {
      const isB = !isUnit(t), d = isB ? this.distToBox(t as Building, u.pos.x, u.pos.z) : t.pos.distanceTo(u.pos);
      if (!isB && d > 50) { u.target = null; return; }
      if (d > (isB ? 2.6 : 3.6)) this.moveTo(u, t.pos.x, t.pos.z, dt, 1);
      else { u.yaw = Math.atan2(t.pos.x - u.pos.x, t.pos.z - u.pos.z); if (u.cd <= 0) { u.wind = .9; const f = Math.min(d, 3.2); u.windX = u.pos.x + Math.sin(u.yaw) * f; u.windZ = u.pos.z + Math.cos(u.yaw) * f; this.warn(u.windX, u.windZ, 4.6, .9); sfx.charge(this.vol(u.pos)); } }
      return;
    }
    this.advance(u, dt, u.order.type === 'raid' ? 4 : 2, u.order.type === 'raid' ? 1 : .6);
  }
  updateBuildings(dt: number) {
    for (const b of this.buildings) {
      if (!b.alive) continue;
      if (!b.built) {
        b.progress = Math.min(1, b.progress); b.hp = Math.max(b.hp, b.maxHp * (.1 + .9 * b.progress)); b.obj.scale.y = Math.max(.06, b.progress);
        if (b.progress >= 1) { b.built = true; b.hp = b.maxHp; b.obj.scale.y = 1; if (b.holo) { this.scene.remove(b.holo); b.holo = null; } if (b.builder) { b.builder.site = null; b.builder.state = 'idle'; b.builder = null; } sfx.built(); this.stats.built++; this.puff(TMP.copy(b.pos).setY(1.5), 8, 1.8, M.dust, .8, 2.5); this.dir.buildingDone(b); }
        else if (b.team === 0 && this.needsBuilder(b)) this.assignRigger(b);
        continue;
      }
      if (b.team === 0 && b.hp < b.maxHp * .7 && this.time - b.lastHit > 6 && this.needsBuilder(b)) this.assignRigger(b);
      if (b.hp < b.maxHp * .5 && b.team === 0) { b.smokeT -= dt; if (b.smokeT <= 0) { const bad = b.hp < b.maxHp * .25; b.smokeT = bad ? .18 : .4; const fire = bad && Math.random() < .5; this.puff(TMP.set(b.pos.x + R(-b.hx, b.hx) * .6, b.h * R(.6, 1), b.pos.z + R(-b.hz, b.hz) * .6), 1, fire ? 1.1 : 1.5, fire ? M.fire : M.smoke, 2.4, .5); } }
      if (b.queue.length) { const q = b.queue[0]; q.t -= dt; if (q.t <= 0) { b.queue.shift(); const side = b.kind === 'bunkhouse' && !b.rot; const u = this.spawn(q.kind, 0, b.pos.x + (side ? b.hx + 1.2 : R(-1, 3)), b.pos.z + (side ? R(-.5, .5) : b.hz + 1.2)); this.puff(TMP.copy(u.pos).setY(1), 4, .8, M.dust); if (this.vol(b.pos) > .2) sfx.blip(); this.dir.trained(u); } }
      if (b.kind === 'watchpost') {
        b.cd -= dt; let tgt: Unit | null = null, bd = b.team === 0 && this.up.post ? 42 : 34; for (const o of this.units) { if (!o.alive || o.team === b.team) continue; const d = o.pos.distanceTo(b.pos); if (d < bd) { bd = d; tgt = o; } }
        if (tgt) { const gun = b.obj.userData.gun; gun.rotation.y = Math.atan2(tgt.pos.x - b.pos.x, tgt.pos.z - b.pos.z) - b.obj.rotation.y; if (b.cd <= 0) { b.cd = this.up.post ? .3 : .45; const a = V3(b.pos.x, 6, b.pos.z), e = V3(tgt.pos.x, UNIT[tgt.kind].bodyY, tgt.pos.z); this.tracer(a, e, tracerMat, .1); sfx.turret(this.vol(b.pos) * .6); this.damage(tgt, 10 * this.gunMul(), b); } }
      } else if (b.kind === 'headframe') {
        // The night watchman on the Headframe: a slow rivet gun, so two raiders cannot empty the pit while the squad is away.
        b.cd -= dt; if (b.cd <= 0) { b.cd = .8; let tgt: Unit | null = null, bd = 20; for (const o of this.units) { if (!o.alive || o.team === b.team) continue; const d = o.pos.distanceTo(b.pos); if (d < bd) { bd = d; tgt = o; } }
          if (tgt) { this.tracer(V3(b.pos.x, b.h + .6, b.pos.z), V3(tgt.pos.x, UNIT[tgt.kind].bodyY, tgt.pos.z), tracerMat, .08); sfx.turret(this.vol(b.pos) * .4); this.damage(tgt, 9 * this.gunMul(), b); } else b.cd = .3; }
      } else if (b.kind === 'thornspire') {
        b.cd -= dt; if (b.cd <= 0) { b.cd = 1; let tgt: Unit | null = null, bd = 26; for (const o of this.units) { if (!o.alive || o.team === b.team) continue; const d = o.pos.distanceTo(b.pos); if (d < bd) { bd = d; tgt = o; } }
          if (tgt) { this.tracer(V3(b.pos.x, 6.9, b.pos.z), V3(tgt.pos.x, UNIT[tgt.kind].bodyY, tgt.pos.z), beamMat, .2); sfx.zap(this.vol(b.pos) * .7); this.damage(tgt, 10 * this.diff.enemy, b); this.puff(TMP.copy(tgt.pos).setY(1), 2, .5, M.mag, .5); } else b.cd = .3; }
      } else if (b.kind === 'choir') {
        b.cd -= dt; if (b.cd <= 0) { b.cd = 1.15; let tgt: Unit | null = null, bd = 21; for (const o of this.units) { if (!o.alive || o.team === b.team) continue; const d = o.pos.distanceTo(b.pos); if (d < bd) { bd = d; tgt = o; } }
          if (tgt) { this.tracer(V3(b.pos.x, 9.6, b.pos.z), V3(tgt.pos.x, 1.1, tgt.pos.z), beamMat, .16); sfx.zap(this.vol(b.pos) * .8); this.damage(tgt, 6 * this.diff.enemy, b); this.puff(TMP.copy(tgt.pos).setY(1), 2, .5, M.teal, .5); } }
      }
    }
  }
  /** A site with nobody on it: no builder, a dead one, one a player is driving, or one that has gone off to other work. */
  needsBuilder(b: Building) { const u = b.builder; return !u || !u.alive || u === this.me || !!u.pilot || u.site !== b; }
  assignRigger(b: Building) { let best: Unit | null = null, bd = 1e9; for (const u of this.units) { if (!u.alive || u.team !== 0 || u.kind !== 'rigger' || u === this.me || u.pilot || u.site) continue; const d = u.pos.distanceTo(b.pos) + (u.carrying ? 15 : 0); if (d < bd) { bd = d; best = u; } } if (best && (bd < 90 || !b.built)) { best.site = b; b.builder = best; } }

  // ------------------------------------------------------------ render
  render(dt: number) {
    const me = this.me, cam = this.cam, pipe = this.pipe, vm = this.vm; this.drawT = Math.max(0, this.drawT - dt);
    cam.aspect = pipe.w / pipe.h; pipe.setDusk(Math.min(1, MAP.dusk + Math.max(0, (this.time - 120) / 780)));
    const build = this.phase !== 'menu' && this.tool === 2 && me?.kind === 'rigger' && me.alive && !this.tab && this.staticT <= 0;
    for (const k of BUILDABLE) { const on = build && BUILDABLE[this.buildSel] === k; this.ghost[k].visible = on && this.placeOK; this.ghostBad[k].visible = on && !this.placeOK; if (on) { const g = this.placeOK ? this.ghost[k] : this.ghostBad[k]; g.position.copy(this.placePos); g.rotation.y = this.buildRot ? Math.PI / 2 : 0; } }
    holoOK.opacity = .3 + Math.sin(pipe.time * 3) * .07; warnMat.opacity = .6 + Math.sin(pipe.time * 30) * .3;
    const near = !this.tab && this.phase !== 'menu' && me ? me : null;
    for (const u of this.units) { u.ring.visible = this.tab && u.team === 0; u.obj.visible = !(near && u !== near && u.team === 0 && Math.hypot(u.pos.x - near.pos.x, u.pos.z - near.pos.z) < 1.05); }
    pipe.static = this.staticT > 0 ? .85 : 0; pipe.sat = this.tab ? .8 : 1;
    for (const k in vm) vm[k].visible = false;
    if (this.phase === 'menu') {
      const a = pipe.time * .07; cam.fov = 46; cam.position.set(Math.sin(a) * 36 + 4, 8 + Math.sin(a * 2) * 2, Math.cos(a) * 36); cam.lookAt(2, 5.5, 0); if (me) this.bodyLayer(me, false);
      this.menuPos.copy(cam.position); this.menuQuat.copy(cam.quaternion);
      cam.updateProjectionMatrix(); cam.updateMatrixWorld(); pipe.draw(this.scene, cam, V3(0, 0, 0), 120); return;
    }
    if (this.tab && me) {
      const iso = this.iso, h = 30, w = h * pipe.w / pipe.h; iso.left = -w; iso.right = w; iso.top = h; iso.bottom = -h; iso.updateProjectionMatrix();
      const shift = w * .28; iso.position.set(me.pos.x + shift, 150, me.pos.z + 120); iso.lookAt(me.pos.x + shift, 0, me.pos.z); iso.updateMatrixWorld();
      this.bodyLayer(me, false); pipe.draw(this.scene, iso, me.pos, 150); this.hud.update(this, iso); this.bodyLayer(me, true); return;
    }
    if (me) {
      if (me.alive) this.bodyLayer(me, true);
      const sprint = this.keys.has('ShiftLeft') && me.moving && this.ads < .3, fovT = (this.hopT > 0 ? 82 : sprint ? 75 : 68) - this.ads * (SHOT[me.kind]?.zoom ?? 6) + this.recoil * 1.5 * (1 - this.ads); cam.fov += (this.fitFov(fovT) - cam.fov) * Math.min(1, dt * 10);
      const bobY = me.moving ? Math.sin(this.bob) * .035 * (1 - this.ads * .7) : 0, sh = this.shake * .03;
      cam.position.set(me.pos.x + R(-sh, sh), UNIT[me.kind].eye + bobY + R(-sh, sh), me.pos.z + R(-sh, sh)); cam.rotation.set(this.pitch + this.recoil * .012, this.yaw + Math.PI, Math.sin(this.bob * .5) * (me.moving ? .004 : 0) - this.swayX * .6, 'YXZ');
      const intro = this.introT > 0 ? 1 - this.introT / 1.8 : 1;
      if (intro < 1) { const k = intro * intro * (3 - 2 * intro), q = cam.quaternion.clone(); TMP2.copy(cam.position); cam.position.lerpVectors(this.menuPos, TMP2, k); cam.quaternion.slerpQuaternions(this.menuQuat, q, k); cam.fov = 46 + (68 - 46) * k; if (me.alive) this.bodyLayer(me, k > .9); }
      if (me.alive && this.staticT <= 0 && intro > .92) {
        const pose = (g: THREE.Group, k: number, kick: number, dip: number) => {
          const a = g.userData.rest, b = g.userData.ads || a, mv = me.moving ? 1 - k * .8 : 0; g.visible = true;
          g.position.set(a[0] + (b[0] - a[0]) * k + Math.cos(this.bob) * .008 * mv + this.swayX, a[1] + (b[1] - a[1]) * k + Math.sin(this.bob * 2) * .006 * mv - dip - this.drawT * .9 + this.swayY, a[2] + (b[2] - a[2]) * k + kick);
          g.rotation.set(a[3] + (b[3] - a[3]) * k + kick * 1.6 - dip * 2.4 - this.drawT * 1.6 + this.swayY * 2, a[4] + (b[4] - a[4]) * k - this.swayX * 2, a[5] + (b[5] - a[5]) * k + dip * 1.2);
        };
        const gun = GUNS[me.kind], rl = this.reloadT > 0 && gun ? Math.sin(Math.min(1, this.reloadT / gun.reload) * Math.PI) : 0;
        if (me.team === 1) pose(vm.veyl, 0, this.recoil * (me.kind === 'cantor' ? -.3 : .1), this.vWind > 0 ? -.12 : 0);
        else if (me.kind === 'rigger') pose(vm.drill, 0, (this.lmb && this.tool === 1 ? -.03 + R(-.004, .004) : 0) - this.bashT * 1.1, this.tool === 2 ? .12 : 0);
        else if (SHOT[me.kind]) { const v = vm[SHOT[me.kind].vm], m = v.userData.mag; if (v.userData.magY === undefined) v.userData.magY = m.position.y; pose(v, this.ads, this.recoil * (me.kind === 'longshot' ? .11 : .05), rl * .14 + (me.kind === 'longshot' && this.fireCd > 0 && gun ? Math.sin(Math.min(1, 1 - this.fireCd / gun.cd) * Math.PI) * .05 * (1 - this.ads * .6) : 0)); m.position.y = v.userData.magY - (rl > .5 ? (rl - .5) * .5 : 0); }
        else if (me.kind === 'gantry') { pose(vm.cannon, 0, 0, rl * .1); const k = this.recoil * .09; vm.cannon.userData.gunR.position.z = this.side > 0 ? k : 0; vm.cannon.userData.gunL.position.z = this.side < 0 ? k : 0; }
        else { const pump = this.fireCd > 0 ? Math.sin(Math.min(1, (gun.cd - this.fireCd) / (gun.cd * .8)) * Math.PI) : 0; pose(vm.scatter, 0, this.recoil * .12, rl * .12 + this.ads * .16); vm.scatter.userData.mag.position.z = -.42 + pump * .12 + (rl > 0 ? Math.abs(Math.sin(this.reloadT * 9)) * .1 : 0); pose(vm.shield, this.ads, -this.bashT * 1.2, 0); }
      }
    }
    cam.updateProjectionMatrix(); cam.updateMatrixWorld();
    pipe.draw(this.scene, cam, me ? me.pos : V3(), 110);
    this.hud.update(this, cam);
    // music follows how hot things are around the player
    if (me) { let hot = this.time - me.lastHit < 6 ? 1 : 0; if (!hot) for (const u of this.units) if (u.team === 1 && u.alive && Math.abs(u.pos.x - me.pos.x) < 45 && Math.abs(u.pos.z - me.pos.z) < 45) { hot = 1; break; } this.mood += (hot - this.mood) * Math.min(1, dt * (hot ? 2 : .4)); setMood(this.phase === 'play' ? .25 + this.mood * .75 : .15); }
  }
  /** Split screen halves are very wide or very tall. This keeps the view from stretching in the first and from feeling boxed in in the second. */
  fitFov(fov: number) { const a = this.pipe.w / this.pipe.h; return a > 2.6 ? 2 * Math.atan(Math.tan(fov * Math.PI / 360) * 2.6 / a) * 180 / Math.PI : a < 1.2 ? fov + 9 : fov; }
  weapon() { const me = this.me; return me && GUNS[me.kind] ? GUNS[me.kind] : null; }
}
export { UNIT, BLD, BUILDABLE, OUTPOST };
