// The simulation and the player: entities, combat, effects, the first-person bodies,
// and jumping between them. Strategy (economy AI, raids, squad plans) lives in director.ts.
import * as THREE from 'three';
import { Pipeline, ViewPipe, V3, M, G, R, mk, setLayer, L_FX, L_SELF, holoOK, holoBad, ringMat, tracerMat, makeSky, heldMaterial, makeCone, CONEU } from './gfx';
import * as MD from './models';
import { sfx, drillSound, setMood, babble } from './audio';
import type { Hud } from './hud';
import { Fog, SIGHT } from './fog';
import * as T from './terrain';
import { seamsFor } from './teammaps';
import { Intel } from './scout';
import { Kind, BKind, UNIT, BLD, BUILDABLE, UPGRADES, TRAINS, UNIT_NEEDS, UpKey, Unit, Building, Prop, OreNode, Difficulty, DIFFS, OUTPOST, GATE, MAP, MAPS, ROAD, VHOME, FACTION, SIDE, setMap, veylPt, isUnit, isSoldier, isWorker, isFighter, foeOf, fac, MIRROR, atHome, endPt, swapEnd , STORY, turnOf, LAYOUT, OVERTIME, CHOIR_REACH, CLEAVE } from './data';
import { Director } from './director';
import { ENV, hourOf, matchHour, matchWeather, lampsBegin, lamp, flashLamp, lampsCommit, flicker, LAMP_ON } from './light';
import type { Mission } from './campaign';
import type { Net } from './net';
import { HitFx, Surface } from './hitfx';
import { Stance } from './stance';
import { applySnap, netTick } from './netgame';
import { Bloom, G_PAIR, G_TUNE, GBKind } from './gloam';
import { poseLegs } from './gloam-art';
import { gloamFx, gloamBuilding, aiGloam, playerGloam, rootGrazer, consume, onBloom, spareGrazers, quillMat, spitMat } from './gloam-play';

const TMP = V3(), TMP2 = V3(), UP = V3(0, 1, 0), QT = new THREE.Quaternion();
/** The far side of a mirror match wears different colours, so two Ironhold crews (or two Choruses, or two swarms) can tell each other apart.
 *  Every material on the body is swapped for a copy with its colour shifted; the copies share every other uniform (shadows, fog, time). */
const MIRROR_TINT = [new THREE.Color(.62, .82, 1.35), new THREE.Color(1.35, .78, .7), new THREE.Color(1.15, .68, 1.3)], tinted = new Map<THREE.Material, THREE.Material>();
function tintMirror(obj: THREE.Object3D, team: number) {
  const corp = team === STORY.charter; if ((team < MIRROR || STORY.charter >= 0) && !corp) return; const tint = MIRROR_TINT[fac(team)], cache = corp ? greyed : tinted;
  // Charter Security wear company grey: the same kit with most of the colour taken out and a cold blue left in.
  const shift = (c: THREE.Color) => { if (!corp) return c.clone().multiply(tint); const l = c.r * .3 + c.g * .59 + c.b * .11; return new THREE.Color(l, l, l).lerp(c, .18).multiply(GREY); };
  obj.traverse(o => { const m = o as THREE.Mesh; if (!m.isMesh) return; const swap = (mat: THREE.Material) => { const sm = mat as THREE.ShaderMaterial; if (!sm.uniforms?.uColor) return mat; let c = cache.get(mat); if (!c) { const t = sm.clone(); t.uniforms = { ...sm.uniforms, uColor: { value: shift(sm.uniforms.uColor.value as THREE.Color) } }; cache.set(mat, c = t); } return c; }; m.material = Array.isArray(m.material) ? m.material.map(swap) : swap(m.material); });
}
const GREY = new THREE.Color(.86, .93, 1.08), greyed = new Map<THREE.Material, THREE.Material>();
/** The yard's home seams: x, z, crystals, size. */
const YARD_SEAMS = [[17, -15, 9, 1.2], [21, -10, 7, 1.0], [23, -18, 8, 1.3], [15, -21, 6, .9], [-18, -24, 8, 1.1], [-24, -19, 7, 1.0]];
export const beamMat = new THREE.MeshBasicMaterial({ color: 0x6dfff0, depthWrite: false });
// Lamp colours, and where each kind of building and body carries its lamps.
type C3 = [number, number, number];
const WARM: C3 = [1, .6, .24], HEAD: C3 = [1, .78, .46], FLOOD: C3 = [1, .76, .42], FIRE: C3 = [1, .46, .12], TEAL: C3 = [.3, 1, .88], ROSE: C3 = [1, .36, .7], SICK: C3 = [.72, 1, .3], ORE: C3 = [.36, .9, 1], MUZZLE: C3 = [1, .82, .5];
/** The cage lamps hung on the Ironhold sheds, in each building's own space: x, y, z and how far the light reaches. */
const BLAMP: Record<string, [number, number, number, number][]> = { depot: [[3.42, 1.7, 1.5, 11]], assay: [[-1.6, 2.1, 3.2, 11]], machineshop: [[-3.2, 2.2, 3.5, 11], [-.6, 2.4, 2.8, 8]] };
/** Bodies that carry a light: its height, how far ahead of the body it sits, its reach, colour and strength. */
const ULAMP: Record<string, [number, number, number, C3, number]> = { rigger: [1.5, .5, 4.5, WARM, .6], linesman: [1.6, 1.2, 4, HEAD, .45], patch: [1.6, 1.2, 4, HEAD, .45], breacher: [1.6, 1.2, 4, HEAD, .45], gantry: [3, 2.4, 8, HEAD, .7],
  tender: [1.3, .3, 4.5, TEAL, .6], cantor: [1.6, .4, 5, TEAL, .7], lancer: [1.4, .5, 4.5, ROSE, .55], warden: [3, .8, 8, TEAL, .85], blister: [.9, 0, 5, SICK, .7], mulcher: [3.4, 0, 7, SICK, .5] };
const bubbleMat = new THREE.MeshBasicMaterial({ color: 0x6dfff0, transparent: true, opacity: .4, depthWrite: false, blending: THREE.AdditiveBlending });
const warnMat = new THREE.MeshBasicMaterial({ color: 0xff4f9a, transparent: true, opacity: .9, depthWrite: false, side: THREE.DoubleSide });
let nextId = 1;
type Hit = { unit?: Unit; b?: Building; ore?: OreNode; prop?: Prop; dist: number; head?: boolean };
interface Proj { obj: THREE.Object3D; pos: THREE.Vector3; vel: THREE.Vector3; team: number; dmg: number; nade: boolean; life: number; from: Unit | null; ghost: number }
const r1 = (v: number) => Math.round(v * 10) / 10;
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
  /** Ore in the bank, by team. */
  /** Ore in the bank, per team (0 to 5: teams 3 to 5 are the second side of a mirror match). */
  purse: number[] = [100, 100, 100, 100, 100, 100];
  get ore() { return this.purse[0]; } set ore(v: number) { this.purse[0] = v; }
  cash(team: number) { return this.purse[team] || 0; }
  /** Which sides have a player on them. A side nobody plays is run by the bots. */
  human: boolean[] = [0, 1, 2, 3, 4, 5].map(t => t === SIDE.home);
  /** The Gloam's living carpet. Empty unless the Gloam hold the outpost. */
  carpet: Bloom = new Bloom(null);
  /** Gloam player: how far the jaws are open, and a Mulcher's charge still running. */
  jaw = 0; chargeT = 0;
  time = 0; phase: 'menu' | 'play' | 'paused' | 'card' | 'over' | 'cut' = 'menu';
  /** A cut scene's camera: where it stands, what it looks at, and its lens. The world keeps moving under it when `cutSim` is on. */
  shot: { pos: THREE.Vector3; look: THREE.Vector3; fov: number } | null = null; cutSim = false; cutSat = 1; /** Fixed light for a cut scene. */ duskFix: number | undefined = undefined; /** A fixed hour of the day (0 to 24) and weather, for looking at the light. */ hourFix: number | undefined = undefined; wxFix: string | undefined = undefined; /** Which run of weather this match gets. Everyone in a shared match has the same. */ wxSalt = 0; won = false;
  /** Research bought, by team. In a mirror match both sides have the same keys, so each team keeps its own list. */
  ups: Record<UpKey, boolean>[] = [0, 1, 2, 3, 4, 5].map(() => Object.fromEntries(UPGRADES.map(u => [u.key, false])) as Record<UpKey, boolean>);
  /** What a team has researched. */
  upOf(team: number) { return this.ups[team] || this.ups[0]; }
  dir!: Director;
  // the player
  me: Unit | null = null; lastBody: Unit | null = null; yaw = 0; pitch = 0; jumpCd = 0; seenKinds = new Set<string>(); cardT = 0; staticT = 0;
  tool = 1; buildSel = 0; buildRot = false; placeOK = false; placePos = V3(); ghost: Record<string, THREE.Group> = {}; ghostBad: Record<string, THREE.Group> = {};
  ammo = 24; reloadT = 0; fireCd = 0; recoil = 0; ads = 0; brace = false; nadeCd = 0; bashCd = 0; bashT = 0; mineT = 0; bob = 0; prompt = ''; swayX = 0; swayY = 0; sens = 1;
  tab = false; tabSel = 0; tabList: { label: string; task: string; unit: Unit; hp: number; alert: boolean }[] = [];
  keys = new Set<string>(); pressed = new Set<string>(); mdx = 0; mdy = 0; lmb = false; rmb = false; wheel = 0;
  obj = { drilled: 0, jumped: false, answered: false, built: false, called: false };
  stats = { kills: 0, lost: 0, mined: 0, minedV: 0, built: 0, lostTo: {} as Record<string, number>, lostToV: {} as Record<string, number> };
  // effects
  vm: Record<string, THREE.Group> = {};
  tracers: { m: THREE.Mesh; t: number }[] = []; puffs: { m: THREE.Mesh; t: number; life: number; v: THREE.Vector3; s: number }[] = [];
  bits: { m: THREE.Mesh; t: number; v: THREE.Vector3; spin: number }[] = []; scorch: { m: THREE.Mesh; t: number; s: number }[] = [];
  bursts: { g: THREE.Group; t: number; s: number; rot: number; mats: THREE.MeshBasicMaterial[] }[] = [];
  bubbles: { m: THREE.Mesh; t: number; u: Unit | null }[] = []; warns: { m: THREE.Mesh; t: number; life: number; r: number }[] = [];
  projs: Proj[] = []; boltProto = MD.bolt(); nadeProto = MD.grenade();
  shake = 0; noRender = false; alertT = 0; mood = 0;
  /** Hit reactions, deaths and what a bullet does where it lands. All of it is for show. */
  fx!: HitFx; stance!: Stance;
  /** What each side has seen of the other (see scout.ts). */
  intel!: Intel; /** Pins the build plan a bot side picks on a hidden map (an index into DOCTRINES), for tests and pictures. */ docFix?: number;
  introT = 0; menuPos = V3(); menuQuat = new THREE.Quaternion(); hitStop = 0; streak = 0; streakT = 0; kick = 0; stepPhase = 0; dustT = 0; hopT = 0; hopCd = 0; hopX = 0; hopZ = 0; endT = 0; endWon = false;

  constructor(public pipe: Pipeline | ViewPipe, public hud: Hud, public diff: Difficulty = DIFFS[1], public mapI = 0, public mission: Mission | null = null, public net: Net | null = null, /** The Veyl run a real economy (Tenders, building, training) instead of breeding raids for free. On whenever somebody plays the Veyl. */ public eco = false) {
    // Only the classic match (Ironhold at home, the Veyl at the outpost) can run the Veyl as a free raid factory. The Gloam, the mirrors and
    // anyone else at home always run a real economy on both sides.
    if (!(fac(SIDE.home) === 0 && fac(SIDE.out) === 1) || turnOf(mapI) > 0) this.eco = true;   // and on a hidden map nobody starts with a base already built
    // Two economies and no story job: the ore is laid out the same for both ends (see LAYOUT). A story job keeps the fields it was written round.
    this.fair = LAYOUT.fair = this.eco && !mission && !STORY.on;
    setMap(mapI); this.sites = MAP.sites!; (M.ground as any).uniforms.uColor.value.setRGB(MAP.ground[0], MAP.ground[1], MAP.ground[2]); (M.mesa as any).uniforms.uColor.value.setRGB(MAP.mesa[0], MAP.mesa[1], MAP.mesa[2]); (M.rock as any).uniforms.uColor.value.setRGB(MAP.rock[0], MAP.rock[1], MAP.rock[2]); 
    this.wxSalt = mapI + (net ? 0 : Date.now() % 50);   // the clock, not the dice: a draw here would move every bot match that follows
    const s = this.scene; s.add(makeSky()); MD.buildWorld(s, this.props, this.anim); this.spires = this.props.filter(p => p.solid); s.add(this.cam);
    this.vm = { drill: MD.vmDrill(), rifle: MD.vmRifle(), scatter: MD.vmScatter(), shield: MD.vmShield(), cannon: MD.vmCannon(), long: MD.vmLong(), pistol: MD.vmPistol(), veyl: MD.vmVeyl() };
    if (fac(SIDE.home) === 2 || fac(SIDE.out) === 2) for (const k of ['grazer', 'snapper', 'quillback', 'blister', 'mulcher']) this.vm['g_' + k] = MD.vmG(k);
    this.carpet = new Bloom(s);
    for (const k in this.vm) { this.vm[k].visible = false; this.cam.add(this.vm[k]); this.vm[k].traverse(o => { const m = o as THREE.Mesh; if (m.isMesh && !Array.isArray(m.material)) m.material = heldMaterial(m.material); }); }
    for (const k of new Set([...BUILDABLE, ...FACTION[SIDE.home].builds, ...FACTION[SIDE.out].builds])) { const src = this.model(k); this.ghost[k] = MD.hologram(src, holoOK); this.ghostBad[k] = MD.hologram(src, holoBad); this.ghost[k].visible = this.ghostBad[k].visible = false; s.add(this.ghost[k], this.ghostBad[k]); }
    const pool = (n: number, geo: THREE.BufferGeometry, mat: THREE.Material, fx: boolean) => { const out: THREE.Mesh[] = []; for (let i = 0; i < n; i++) { const m = mk(geo, mat, 0, 0, 0, s); if (fx) m.layers.set(L_FX); m.visible = false; out.push(m); } return out; };
    this.tracers = pool(36, G.oct, tracerMat, true).map(m => ({ m, t: 0 }));
    this.puffs = pool(96, G.cloud, M.dust, false).map(m => ({ m, t: 0, life: 1, v: V3(), s: 1 }));
    this.bits = pool(90, G.box, M.rust, false).map(m => ({ m, t: 0, v: V3(), spin: 0 }));
    this.chunks = pool(240, G.dod, M.rock, false).map(m => ({ m, t: 0, v: V3(), w: V3(), s: 1, rest: false }));
    this.scorch = pool(18, G.blot, M.scorch, false).map(m => { m.rotation.x = -Math.PI / 2; return { m, t: 0, s: 1 }; });
    // Blast flashes: an inked starburst that faces the camera for a fifth of a second, the way a comic draws a bang.
    for (let i = 0; i < 6; i++) { const g = new THREE.Group(), mats = [0x0e0d14, 0xffb23a, 0xfff6c0].map(c => new THREE.MeshBasicMaterial({ color: c, transparent: true, depthWrite: false })); mats.forEach((m, j) => { const k = [1, .86, .5][j]; mk(G.burst, m, [0, 0, j * .03], [k, k, 1], [0, 0, j === 2 ? .24 : 0], g).renderOrder = 5 + j; }); setLayer(g, L_FX); g.visible = false; s.add(g); this.bursts.push({ g, t: 0, s: 1, rot: 0, mats }); }
    this.bubbles = pool(10, G.sph, bubbleMat, true).map(m => ({ m, t: 0, u: null }));
    this.warns = pool(6, G.ringG, warnMat, true).map(m => { m.rotation.x = -Math.PI / 2; return { m, t: 0, life: 1, r: 1 }; });
    this.fx = new HitFx(this); this.stance = new Stance(this);
    const field = (list: number[][], amount: number) => { for (const [x, z, n, sc] of list) { const gy = T.h(x, z), obj = MD.oreCluster(n, sc); obj.position.set(x, gy, z); s.add(obj); this.ores.push({ pos: V3(x, gy, z), amount, max: amount, obj }); } };
    field(YARD_SEAMS, 900);
    // the rich seam, then the other fields out on the map, each with room for a new Headframe on the side facing the yard
    // In a fair layout a field marked as a twin is the one before it turned round, seam for seam, and a field the same walk from both ends
    // faces away from the middle of the map and not away from the yard.
    { let prev: number[][] = [], prevAmt = 0; const mid = swapEnd(0, 0).map(v => v / 2);
      MAP.sites!.forEach(([ex, ez, twin], i) => { let list: number[][], amt = 1000; const own = seamsFor(MAP, i, YARD_SEAMS);   // terrain (J): a team map's fields are laid by teammaps.ts
        if (own) { list = own.list; amt = own.amt; }
        else if (twin && prev.length) { list = prev.map(([x, z, n, sc]) => { const [mx, mz] = swapEnd(x, z); return [Math.round(mx), Math.round(mz), n, sc]; }); amt = prevAmt; }
        else if (!i) { list = [[ex - 1, ez, 10, 1.5], [ex + 4, ez + 4, 8, 1.3], [ex - 3, ez - 5, 9, 1.4]]; amt = 1600; }
        else { const even = this.fair && Math.abs(Math.hypot(ex, ez) - Math.hypot(ex - mid[0] * 2, ez - mid[1] * 2)) < 6, fx = even ? ex - mid[0] : ex, fz = even ? ez - mid[1] : ez, l = Math.hypot(fx, fz) || 1, ux = fx / l, uz = fz / l; list = [[ex + ux * 3 - uz * 6, ez + uz * 3 + ux * 6, 8, 1.2], [ex + ux * 6, ez + uz * 6, 9, 1.3], [ex + ux * 3 + uz * 6, ez + uz * 3 - ux * 6, 7, 1.1], [ex + ux * 9 - uz * 2, ez + uz * 9 + ux * 2, 8, 1.2]].map(p => [Math.round(p[0]), Math.round(p[1]), p[2], p[3]]); }
        field(list, amt); prev = list; prevAmt = amt; if (T.isBright(i)) MD.brighten(this.ores.slice(-list.length), T.BRIGHT); }); }
    for (const f of T.TER.fields) { field(f.seams.map(([x, z, n, sc]) => [f.x + x, f.z + z, n, sc]), f.amount); }   // terrain (J): island fields
    // The home seams at the outpost end. Against Ironhold at the yard they are the Veyl's own, a few metres closer to the Choir Stone than the
    // yard's are to the Headframe (the pairings were balanced with that). Any other pairing gets the yard's layout turned end for end, so a
    // mirror match starts both sides the same walk from their ore: with the closer seams the outpost side won 25 of 30 mirror bot matches.
    const classic = fac(SIDE.home) === 0 && fac(SIDE.out) !== 0 && !this.fair && !MAP.hid;
    if (classic) field([[25, -11, 8, 1.2], [28, -4, 7, 1.0], [28, 5, 8, 1.3], [24, 12, 7, 1.1], [31, -14, 6, .9], [32, 11, 7, 1.0]].map(([lx, lz, n, sc]) => { const [x, z] = veylPt(lx, lz); return [Math.round(x), Math.round(z), n, sc]; }), 900);
    else {
      const seams = YARD_SEAMS.map(([x, z, n, sc]) => { const [mx, mz] = swapEnd(x, z); return [Math.round(mx), Math.round(mz), n, sc]; }); field(seams, 900);
      // The yard keeps its walks to the ore clear; the outpost's scenery was laid out for the Veyl's seams. Clear anything standing on the walk
      // from the outpost's home building to each turned-round seam, so its workers do not detour round domes and crystals (they mined 12% less).
      const seg = (px: number, pz: number, bx: number, bz: number) => { const dx = bx - VHOME.x, dz = bz - VHOME.z, L = dx * dx + dz * dz || 1, t = Math.max(0, Math.min(1, ((px - VHOME.x) * dx + (pz - VHOME.z) * dz) / L)); return Math.hypot(px - VHOME.x - dx * t, pz - VHOME.z - dz * t); };
      for (const q of this.props) if (q.alive && q.kind !== 'mesa' && seams.some(([x, z]) => seg(q.x, q.z, x, z) < q.r + 2.5)) { q.alive = false; const i = this.spires.indexOf(q); if (i >= 0) this.spires.splice(i, 1); for (const r of q.ranges) { const a = r.attr.array as Float32Array; for (let k = r.start * 3, e = (r.start + r.count) * 3; k < e; k += 3) { a[k] = q.x; a[k + 1] = -80; a[k + 2] = q.z; } r.attr.needsUpdate = true; } if (q.obj) s.remove(q.obj); }
    }
    // Each end starts with its faction's home building and six workers: the yard for the side at home, the outpost for the side at the far end.
    // The one exception is the classic match, where a Veyl outpost nobody plays is a whole working base that breeds its raids for free.
    const start = (team: number, x: number, z: number, crew: number[][]) => { if (net) return; const F = FACTION[team]; this.addBuilding(F.hq, team, x, z, true); for (const [cx, cz] of crew) this.spawn(F.worker, team, cx, cz); };
    const crew = [[6, 7], [10, -6], [13, -10], [-8, -8], [9, 2], [-6, 8]];
    start(SIDE.home, 0, 0, crew);
    const V = (k: BKind, lx: number, lz: number, rot = false) => { if (net) return; const [x, z] = veylPt(lx, lz); this.addBuilding(k, SIDE.out, x, z, true, rot); };
    // With turned-round seams the far crew is the yard crew turned round too, so both ends start the same walk from the same spots.
    if (this.eco) start(SIDE.out, VHOME.x, VHOME.z, classic ? [[14, 4], [15, -3], [17, 6], [13, -6], [16, 1], [12, 7]].map(([lx, lz]) => veylPt(lx, lz)) : crew.map(([x, z]) => swapEnd(x, z)));
    else {
    for (const [x, z] of [[-6, -9], [3, 1], [-6, 11]]) V('choir', x, z);
    V('reedgate', 14, -1, Math.abs(ROAD.dx) >= Math.abs(ROAD.dz));
    for (const [x, z] of [[7, -9.5], [7, 10.5]]) V('broodpit', x, z);
    for (const [x, z] of [[-12, -11.5], [-12, 13]]) V('thornspire', x, z);
    V('wardpylon', -10.5, 1); }
    this.fog = new Fog(); this.intel = new Intel(this);
    this.dir = new Director(this); this.story = mission; if (mission) { this.dir.side(mission.out ? SIDE.out : SIDE.home).auto = mission.auto; if (!net) mission.setup?.(this); }
    if (!net) { this.me = this.units[0]; this.possess(this.me, true); } this.yaw = MAP.hid ? 2.2 : Math.atan2(ROAD.dx - .4, ROAD.dz - .4);   // on a hidden map everyone starts facing the same way, whatever the layout
  }

  /** Frees this world's own meshes on the graphics card once the game is thrown away. Shared shapes stay; three.js re-uploads anything used again. */
  dispose() { const keep = new Set<THREE.BufferGeometry>(Object.values(G) as THREE.BufferGeometry[]); this.scene.traverse((o: any) => { if (o.geometry && !keep.has(o.geometry)) o.geometry.dispose(); }); for (const w of this.wrecks) w.b.obj.traverse((o: any) => { if (o.geometry) o.geometry.dispose(); }); }
  model(k: BKind): THREE.Group { return MD.atlasify(this.rawModel(k)); }
  rawModel(k: BKind): THREE.Group { if (BLD[k] && (k as string) in G_TUNE.bloomR) return MD.gloamB(k, this.anim); return k === 'headframe' ? MD.headframe(this.anim) : k === 'bunkhouse' ? MD.bunkhouse() : k === 'depot' ? MD.depot() : k === 'watchpost' ? MD.watchpost() : k === 'machineshop' ? MD.machineshop(this.anim) : k === 'foundry' ? MD.foundry(this.anim) : k === 'assay' ? MD.assay(this.anim) : k === 'mast' ? MD.mast(this.anim) : k === 'reedgate' ? MD.reedgate(this.anim) : k === 'broodpit' ? MD.broodpit(this.anim) : k === 'thornspire' ? MD.thornspire(this.anim) : k === 'wardpylon' ? MD.wardpylon(this.anim) : k === 'hushwell' ? MD.hushwell(this.anim) : MD.choir(this.anim); }

  // ------------------------------------------------------------ entities
  /** Multiplayer server: things clients need to see or hear, queued until the next snapshot. */
  uById = new Map<number, Unit>(); bById = new Map<number, Building>();
  evq: any[] | null = null; coop = 1; applying = false; names: Record<number, string> = {}; feedTo = 0; score: Record<number, number[]> = {}; myTeam = SIDE.home; teams: Record<number, number> = {}; vWind = 0; vX = 0; vZ = 0; pings: { x: number; z: number; t: number; pid: number }[] = [];
  spawn(kind: Kind, team: number, x: number, z: number, id = 0): Unit {
    const md = MD.unit(kind); tintMirror(md.obj, team); const st = UNIT[kind], hp = st.hp * (fac(team) === 0 || this.eco ? this.armorMul(team) : 1), sh = st.shield * (fac(team) && this.eco ? this.armorMul(team) : 1);
    const rs = st.rad * 3.6, ring = mk(G.ringG, ringMat, [0, .08, 0], [rs, rs, 1], [-Math.PI / 2, 0, 0], md.obj); ring.layers.set(L_FX); ring.visible = false;
    const u: Unit = { id: id || nextId++, kind, team, pilot: 0, nx: x, nz: z, pos: V3(x, T.h(x, z), z) /* terrain (J) */, yaw: R(0, 6), hp, maxHp: hp, shield: sh, maxShield: sh, obj: md.obj, rig: md.rig, ring, alive: true, speed: st.speed, moving: false, phase: R(0, 6), cd: R(0, 1), think: R(0, .3), target: null, order: { type: 'guard', x, z }, lastHit: -99, state: 'idle', timer: 0, carrying: 0, node: null, site: null, dashCd: R(2, 5), dashT: 0, swing: 0, slot: 0, flashT: 0, pop: 0, wind: 0, windX: 0, windZ: 0, kx: 0, kz: 0, pitch: 0, brace: false };
    md.obj.position.copy(u.pos); md.obj.rotation.y = u.yaw; this.scene.add(md.obj); this.units.push(u);
    if (this.dir && !this.net && isFighter(u) && (this.eco || team === SIDE.home)) this.dir.enlist(u);
    return u;
  }
  addBuilding(kind: BKind, team: number, x: number, z: number, built: boolean, rot = false, id = 0): Building {
    const st = BLD[kind], obj = this.model(kind), gy = T.h(x, z) /* terrain (J) */; obj.position.set(x, gy, z); if (rot) obj.rotation.y = Math.PI / 2; tintMirror(obj, team); this.scene.add(obj);
    const b: Building = { id: id || nextId++, kind, team, pos: V3(x, gy, z), hx: rot ? st.hz : st.hx, hz: rot ? st.hx : st.hz, h: st.h, hp: built ? st.hp : st.hp * .1, maxHp: st.hp, obj, holo: null, built, progress: built ? 1 : 0, pdone: built ? 1 : 0, queue: [], alive: true, cd: R(0, 1), builder: null, lastHit: -99, rot, smokeT: 0, stage: 0 };
    for (const q of this.props) if (q.dress && q.alive && Math.abs(q.x - x) < b.hx + q.r * .6 && Math.abs(q.z - z) < b.hz + q.r * .6) this.damageProp(q, 1e4, null);
    if (!built) { b.holo = MD.hologram(obj, holoOK); b.holo.position.copy(obj.position); b.holo.rotation.copy(obj.rotation); this.scene.add(b.holo); obj.scale.y = .06; }
    if (fac(team) === 2) { this.carpet.add(b, kind as GBKind, x, z, built); if (kind === 'mothercap') { b.buds = built ? G_TUNE.buds : 0; b.budT = 0; } }
    this.buildings.push(b); return b;
  }
  own(kind?: Kind, team = 0) { return this.units.filter(u => u.alive && u.team === team && (!kind || u.kind === kind)); }
  /** The fighting bodies on a side: everything but its workers. */
  army(team: number) { return this.units.filter(u => u.alive && u.team === team && isFighter(u)); }
  /** Bodies on the player's own side: Ironhold normally, the Veyl for a player on the other side of a versus match. */
  mine(kind?: Kind) { return this.units.filter(u => u.alive && u.team === this.myTeam && (!kind || u.kind === kind)); }
  soldiers() { return this.army(SIDE.home); }
  foes() { return this.units.filter(u => u.alive && u.team === SIDE.out); }
  /** The nearest finished Headframe: where Riggers bank, and where new bodies turn up. */
  nearHQ(x: number, z: number, team = 0) { let best: Building | null = null, bd = 1e9; const hq = FACTION[team].hq; for (const b of this.buildings) if (b.alive && b.team === team && b.kind === hq && b.built) { const d = Math.hypot(b.pos.x - x, b.pos.z - z); if (d < bd) { bd = d; best = b; } } return best; }
  /** Where a fresh Rigger turns up: in front of the first Headframe still standing. */
  hqSpot(team = 0): [number, number] { const k = FACTION[team].hq, h = this.ownB(k, true, team)[0] || this.ownB(k, false, team)[0]; return h ? [h.pos.x + 2 + Math.random() * 3, h.pos.z + h.hz + 2.4 + Math.random() * 2] : atHome(team) ? [2, 7] : [VHOME.x - 4, VHOME.z + 4]; }
  ownB(kind?: BKind, builtOnly = false, team = 0) { return this.buildings.filter(b => b.alive && b.team === team && (!kind || b.kind === kind) && (!builtOnly || b.built)); }
  /** The outpost side's bases: Choir Stones, or Mother Caps when the Gloam hold it. */
  /** A body for a player joining the outpost side: a free worker or fighter, or a fresh worker at one of its bases. */
  freshBody(team: number): Unit | null { const free = this.units.filter(u => u.alive && u.team === team && !u.pilot && u.kind !== 'warden' && u.kind !== 'mulcher'), w = free.filter(u => isWorker(u.kind)); if (w.length) return w[Math.floor(Math.random() * w.length)]; if (free.length) return free[Math.floor(Math.random() * free.length)]; const F = FACTION[team]; return this.ownB(F.hq, false, team).length ? this.spawn(F.worker, team, ...this.hqSpot(team)) : null; }
  stones() { const k = FACTION[SIDE.out].hq; return this.buildings.filter(b => b.alive && b.kind === k && b.team === SIDE.out); }
  pits() { return this.buildings.filter(b => b.alive && b.kind === 'broodpit'); }
  /** The Ward Pylon covering this spot, if one still stands. */
  ward(p: { x: number; z: number }, team = -1) { for (const b of this.buildings) if (b.alive && b.kind === 'wardpylon' && (team < 0 || b.team === team) && Math.hypot(b.pos.x - p.x, b.pos.z - p.z) < 34) return b; return null; }
  wardFx = 0;
  gate() { return this.buildings.find(b => b.alive && b.kind === 'reedgate') || null; }
  supplyCap(team = 0) {
    const F = FACTION[team], d = this.ownB(F.supply, true, team).length, h = Math.max(0, this.ownB(F.hq, true, team).length - 1);
    const up = this.upOf(team), f = fac(team); return 12 + 8 * d + 8 * h + ((f === 1 ? up.vwide : f === 2 ? up.gfat : up.beds) ? 4 + 2 * d : 0);
  }
  supplyUsed(team = 0) { let n = 0; for (const u of this.units) if (u.alive && u.team === team) n += UNIT[u.kind].supply; for (const b of this.buildings) if (b.alive && b.team === team) for (const q of b.queue) n += UNIT[q.kind].supply; return n; }
  /** A side the bots run hits as hard as the shift says. A side somebody plays hits at full weight. */
  /** On Double shift a bot side playing against a person gets more out of each load of ore, the way the bot Chorus in an Ironhold skirmish sends bigger raids.
   *  Night is the even fight: the person's hero body against the bots' tougher AI-driven Veyl. */
  oreK(team: number) { return this.eco && !this.human[team] && this.human[foeOf(team)] ? 1 + Math.max(0, this.diff.enemy - 1) : 1; }
  foeK(team: number) { return this.human[team] ? 1 : this.diff.enemy; }
  gunMul(team: number) { const u = this.upOf(team), f = fac(team); return f === 2 ? (u.gdmg ? 1.25 : 1) * (u.gdmg2 ? 1.2 : 1) * (u.gdmg3 ? 1.15 : 1) : f ? (u.vedge ? 1.25 : 1) * (u.vedge2 ? 1.2 : 1) : (u.dmg ? 1.25 : 1) * (u.dmg2 ? 1.2 : 1) * (u.dmg3 ? 1.15 : 1) * (this.eco ? this.foeK(team) : 1); }
  /** With a full economy the Veyl pay for every body, so each one the AI drives is worth more than a free raider: it takes less from each hit and hits harder. */
  vBoost = { hp: 1.65, dmg: 1.45 };
  armorMul(team: number) { const u = this.upOf(team), f = fac(team); return f === 2 ? (u.garmor ? 1.25 : 1) * (u.garmor2 ? 1.2 : 1) * (u.garmor3 ? 1.15 : 1) : f ? (u.vglass ? 1.25 : 1) * (u.vglass2 ? 1.2 : 1) : (u.armor ? 1.25 : 1) * (u.armor2 ? 1.2 : 1) * (u.armor3 ? 1.15 : 1); }
  /** What a Veyl body's hit is worth: the shift on a bot side, and the songs the Chorus has learned. */
  vMul(team: number) { return this.foeK(team) * (this.eco ? this.gunMul(team) * this.vBoost.dmg : 1); }
  /** How much faster research makes this body walk. */
  pace(u: Unit) { const up = this.upOf(u.team), f = fac(u.team); return f === 2 ? (u.kind !== 'grazer' && this.carpet.on(u.pos.x, u.pos.z, 0, u.team) ? G_TUNE.bloomSpeed : 1) * (up.glegs && (u.kind === 'snapper' || u.kind === 'blister') ? 1.15 : 1) : f ? (up.vstep && u.kind !== 'tender' ? 1.12 : 1) : u.kind === 'gantry' ? (up.servo ? 1.2 : 1) : u.kind !== 'rigger' && up.pay ? 1.12 : 1; }
  /** The buildings still missing before this one can be staked out. */
  missing(k: BKind, team = 0) { return (BLD[k].needs || []).filter(n => !this.ownB(n, true, team).length); }
  ms: Record<string, number> = {};
  /** The campaign job this screen is showing. The same as `mission` except on a seat of a local match, where the hidden host runs the job. */
  story: Mission | null = null;
  /** This match's ore layout: fair (see LAYOUT) or as a story job or the classic raid match has it, and the fields that came of it. */
  fair = false; sites: number[][] = [];
  /** The map, the sides and the layout are shared by every Game in the process. A server that runs several matches sets the map and sides before it
   *  touches one, and this puts back the layout that match was built with. */
  pin() { LAYOUT.fair = this.fair; MAP.sites = this.sites; T.layoutTerrain(); }
  /** How far out a Choir Stone takes a Tender's ore (see CHOIR_REACH: a dial for balance tables, 0 in play). */
  bankReach(hq: Building) { return hq.kind === 'choir' ? CHOIR_REACH.m : 0; }
  otSaid = false;
  /** How much more damage buildings take by now and how much less towers do, as a share: 0 unless OVERTIME is switched on and has started. */
  overtime() { return this.fair && OVERTIME.start > 0 && this.time > OVERTIME.start ? (this.time - OVERTIME.start) / 60 * OVERTIME.perMin : 0; }
  /** Objectives as the host last sent them, for a seat of a local match. */
  netObjs: { text: string; done: boolean }[] | null = null;
  /** Nobody shoots: towers hold fire and bodies do not pick targets. Job 14 walks up the road under it. */
  truce = false;
  /** The job's paperwork, for the side the player is on. The other side builds whatever it likes. */
  paper(team: number) { const m = this.story; return m && team === (m.out ? SIDE.out : SIDE.home) ? m : null; }
  unlocked(k: BKind, team = 0) { const m = this.paper(team); if (m && k !== FACTION[team].hq && !m.allow.includes(k)) return false; return FACTION[team].builds.includes(k) && !this.missing(k, team).length; }

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
    const [ox, oz] = MAP.mid!, cx = p.x - ox, cz = p.z - oz, cd = Math.hypot(cx, cz), lim = MAP.rad!; if (cd > lim) { p.x = ox + cx / cd * lim; p.z = oz + cz / cd * lim; }
    T.block(p, gx, gz, ai);   // terrain (J): no walking up or off a cliff, only up and down ramps
  }
  moveTo(u: Unit, x: number, z: number, dt: number, stop = .4, mul = 1) {
    const w = T.via(u, x, z); if (w) { x = w[0]; z = w[1]; stop = 0; }   // terrain (J): to another level by way of a ramp; never 'arrived' on the way
    const dx = x - u.pos.x, dz = z - u.pos.z, d = Math.hypot(dx, dz); if (d < stop) return true;
    const st = Math.min(d, u.speed * mul * this.pace(u) * dt); u.pos.x += dx / d * st; u.pos.z += dz / d * st; u.yaw = Math.atan2(dx, dz); u.moving = true; this.collide(u, x, z); return false;
  }
  /** Follows the unit's order, walking any waypoints first. Returns true on arrival. */
  advance(u: Unit, dt: number, stop: number, mul = 1) {
    const o = u.order; if (o.waitT && o.waitT > 0) { o.waitT -= dt; return false; } if (o.path && o.path.length) { if (this.moveTo(u, o.path[0][0], o.path[0][1], dt, 6, mul)) o.path.shift(); return false; }
    return this.moveTo(u, o.x, o.z, dt, stop, mul);
  }
  vol(p: THREE.Vector3) { const d = this.me ? p.distanceTo(this.me.pos) : 50; return Math.max(0, 1 - d / 90) ** 2; }
  /** A line in the message feed. `team` keeps a side's own talk (its brain, its hints, its chatter) to the players on that side. */
  feed(who: string, msg: string, cls = '', team = -1) { if (this.evq) { this.evq.push(['fd', who, msg, cls, this.feedTo, team]); return; } if (team >= 0 && team !== this.myTeam) return; this.hud.feed(who, msg, cls); if (!this.noRender) babble(who, msg.length); }

  // ------------------------------------------------------------ effects
  tracer(a: THREE.Vector3, b: THREE.Vector3, mat: THREE.Material = tracerMat, w = .07) {
    if (this.evq) { this.evq.push(['tr', r1(a.x), r1(a.y), r1(a.z), r1(b.x), r1(b.y), r1(b.z), mat === tracerMat ? 0 : 1, w]); return; }
    if (this.net && !this.applying) this.net.cmd('tr', r1(a.x), r1(a.y), r1(a.z), r1(b.x), r1(b.y), r1(b.z), mat === tracerMat ? 0 : 1, w);
    flashLamp(a.x, a.y, a.z, 7 + w * 26, mat === tracerMat ? MUZZLE : mat === beamMat ? TEAL : ROSE, .11);
    const tr = this.tracers.find(t => t.t <= 0); if (!tr) return; const d = TMP.copy(b).sub(a), len = d.length(); if (len < .1) return;
    tr.m.material = mat; tr.m.scale.set(w * 1.7, len, w * 1.7); tr.m.position.copy(a).addScaledVector(d, .5); tr.m.quaternion.setFromUnitVectors(UP, d.normalize()); tr.m.visible = true; tr.t = mat === tracerMat ? .06 : .16;
  }
  puff(p: THREE.Vector3, n: number, size: number, mat: THREE.Material = M.dust, up = 1.2, spread = 1, life = 1) {
    if (this.evq) return;
    for (let i = 0; i < n; i++) { const f = this.puffs.find(x => x.t <= 0); if (!f) return; f.m.material = mat; f.m.position.copy(p); f.v.set(R(-1, 1) * spread, R(.3, 1) * up, R(-1, 1) * spread); f.s = size * R(.6, 1.2); f.life = f.t = R(.35, .7) * life; f.m.rotation.set(R(0, 6), R(0, 6), R(0, 6)); f.m.visible = true; f.m.scale.setScalar(.01); }
  }
  /** Chunky debris that arcs, bounces once and shrinks away. */
  debris(p: THREE.Vector3, n: number, size: number, mat: THREE.Material, power = 6) {
    if (this.evq) return;
    for (let i = 0; i < n; i++) { const f = this.bits.find(x => x.t <= 0); if (!f) return; f.m.material = mat; f.m.position.copy(p); f.v.set(R(-1, 1) * power, R(.5, 1.3) * power, R(-1, 1) * power); const s = size * R(.5, 1.3); f.m.scale.set(s, s * R(.4, 1), s * R(.6, 1.2)); f.m.rotation.set(R(0, 6), R(0, 6), 0); f.spin = R(-12, 12); f.t = R(.9, 1.6); f.m.visible = true; }
  }
  scorchAt(p: THREE.Vector3, size: number) { if (this.evq) return; let s = this.scorch.find(x => x.t <= 0); if (!s) s = this.scorch.reduce((a, b) => a.t < b.t ? a : b); s.m.position.set(p.x, .04 + Math.random() * .01, p.z); s.s = size; s.m.scale.set(size, size, 1); s.m.rotation.z = R(0, 6); s.m.visible = true; s.t = 40; }
  /** The flash of a blast. `mode` 0 is fire, 1 Veyl light, 2 Gloam acid. */
  pow(p: THREE.Vector3, size: number, mode = 0) { if (this.evq) return; const b = this.bursts.find(x => x.t <= 0) || this.bursts.reduce((a, c) => a.t < c.t ? a : c); b.g.position.set(p.x, Math.max(p.y, .9), p.z); b.s = size; b.t = .2; b.rot = R(0, 6); b.mats[1].color.setHex([0xffb23a, 0x35e0c8, 0xb8f04a][mode]); b.mats[2].color.setHex([0xfff6c0, 0xeafffb, 0xf4ffd2][mode]); b.g.scale.setScalar(.01); b.g.visible = true; }
  bubble(u: Unit) { if (this.evq) return; const b = this.bubbles.find(x => x.t <= 0); if (!b) return; b.u = u; b.t = .18; b.m.visible = true; const s = UNIT[u.kind].rad * 3.4; b.m.scale.set(s, UNIT[u.kind].headY * 1.15, s); }
  warn(x: number, z: number, r: number, life: number) { if (this.evq) { this.evq.push(['wn', r1(x), r1(z), r, life]); return; } const w = this.warns.find(x => x.t <= 0); if (!w) return; w.m.position.set(x, .12, z); w.r = r; w.t = w.life = life; w.m.visible = true; }
  explode(p: THREE.Vector3, team: number, dmg: number, radius: number, from: Unit | null, mode: boolean | number = false) {
    const veyl = !!mode, acid = mode === 2; this.fx.blastAt(p, radius);
    if (this.evq) this.evq.push(['ex', r1(p.x), r1(p.y), r1(p.z), radius, +mode]);
    for (const u of this.units) { if (!u.alive || u.team === team) continue; const d = Math.hypot(u.pos.x - p.x, u.pos.z - p.z); if (d > radius + UNIT[u.kind].rad) continue; const k = 1 - .6 * Math.min(1, d / radius); this.damage(u, dmg * k, from); if (d > .1) { u.kx += (u.pos.x - p.x) / d * 9 * k; u.kz += (u.pos.z - p.z) / d * 9 * k; } }
    for (const b of this.buildings) { if (!b.alive || b.team === team) continue; if (this.distToBox(b, p.x, p.z) < radius * .7) this.damage(b, dmg * 1.4, from); }
    this.blastProps(p, radius, dmg, from); this.shove(p, radius * 1.6, 9);
    const g = V3(p.x, .6, p.z); this.puff(g, 5, radius * .62, acid ? M.gS : veyl ? M.teal : M.fire, 2.2, 1.5); this.puff(g, 3, radius * .5, acid ? M.gGlow : veyl ? M.cyan : M.fireD, 1.6, 2); this.puff(TMP2.set(p.x, 1.1, p.z), 5, radius * .7, acid ? M.gGlow : veyl ? M.indigoL : M.soot, 1.5, 1.7, 2.3); this.debris(g, 8, .3, acid ? M.gH : veyl ? M.crys : M.rock, 7); this.pow(g, radius * 1.5, acid ? 2 : veyl ? 1 : 0); this.scorchAt(p, radius * 1.5); if (radius >= 3.5) this.crater(p, radius * .55);
    const v = this.vol(p); this.shake = Math.max(this.shake, v * 1.1); if (!veyl) this.pipe.flash = Math.max(this.pipe.flash, v * .5); sfx.boom(v);
    flashLamp(p.x, 1.4, p.z, radius * 4 + 10, acid ? SICK : veyl ? TEAL : FIRE, .6);
    this.hud.damage(V3(p.x, 2.2, p.z), acid ? 'SPLORCH!' : veyl ? 'WHUMM!' : 'BOOM!', team === this.myTeam || (team < 0 && !veyl) ? 'ko' : 'kobad');
  }

  damage(t: Unit | Building, amt: number, from: Unit | Building | null, crit = false) {
    if (this.net) {   // multiplayer client: only the server changes health. Report what this player hit and show the number now.
      if (from !== this.me || !this.me || !t.alive || amt <= 0) return;
      this.net.cmd('dm', t.id, Math.round(amt * 10) / 10, crit ? 1 : 0); if (isUnit(t)) { t.pop = 1; this.fx.hit(t, amt, from, crit, t.shield > 0); }
      if (!this.quiet) this.hud.damage(V3(t.pos.x, isUnit(t) ? UNIT[t.kind].headY + .4 : t.h * .7, t.pos.z), (crit ? 'CRIT ' : '') + Math.max(1, Math.round(amt)), crit ? 'crit' : isUnit(t) && t.shield > 0 ? 'shield' : '');
      return;
    }
    if (t === this.me && this.safeT > 0) return;
    if (!t.alive || amt <= 0) return; t.lastHit = this.time;
    const u = isUnit(t) ? t : null, me = this.me;
    if (!u) amt *= 1 + this.overtime(); else if (from && !isUnit(from)) amt /= 1 + this.overtime();
    // A unit sheltering behind scenery: shots from the far side by anything but a player mostly chew up the scenery instead.
    if (u && u.cover && u.cover.alive && from && from !== me && isUnit(from) && !from.pilot) { const c = u.cover, cx = c.x - u.pos.x, cz = c.z - u.pos.z; if (Math.hypot(cx, cz) < c.r + 2.4 && cx * (from.pos.x - u.pos.x) + cz * (from.pos.z - u.pos.z) > 0 && Math.random() < .55) { this.damageProp(c, amt, from); return; } }
    if (u && u.kind === 'breacher' && from) { const dx = from.pos.x - u.pos.x, dz = from.pos.z - u.pos.z, d = Math.hypot(dx, dz) || 1; if ((dx * Math.sin(u.yaw) + dz * Math.cos(u.yaw)) / d > .25) { if (u === me && this.brace) { this.payback = Math.min(1, this.payback + amt * .75 / 50); amt *= .25; sfx.clang(); } else if (u.pilot) { if (u.brace) amt *= .25; } else if (u !== me) amt *= .55; } }
    let warded = false;
    if (!u && fac(t.team) === 1 && (t as Building).kind !== 'wardpylon') { const w = this.ward(t.pos, t.team); if (w) { amt *= .7; warded = true; if (this.time > this.wardFx) { this.wardFx = this.time + .35; this.tracer(V3(w.pos.x, 4.6, w.pos.z), V3(t.pos.x, (t as Building).h * .6, t.pos.z), beamMat, .22); this.puff(TMP.set(t.pos.x, (t as Building).h * .6, t.pos.z), 3, .7, M.cyan, .5); } } }
    const dealt = amt, shielded = (!!u && u.shield > 0) || warded;
    // A paid-for Veyl body the AI drives shrugs off part of each hit (see vBoost). A body a player drives takes hits at face value, the same as an Ironhold one.
    if (u && fac(u.team) === 1 && this.eco && !u.pilot && u.kind !== 'tender') amt /= this.vBoost.hp;
    if (u) { u.pop = 1; this.fx.hit(u, dealt, from, crit, shielded); if (u.shield > 0) { const a = Math.min(u.shield, amt); u.shield -= a; amt -= a; this.bubble(u); } }
    // A hit from a body somebody is driving lands with weight: the target is shoved back and loses a beat.
    if (u && u.kind !== 'warden' && u.kind !== 'gantry' && !u.pilot && from && isUnit(from) && from.team !== u.team && (from === me || from.pilot) && dealt >= 5) { const sx = u.pos.x - from.pos.x, sz = u.pos.z - from.pos.z, sd = Math.hypot(sx, sz) || 1, k = from.kind === 'rigger' ? 14 : Math.min(10, dealt * .16); u.kx += sx / sd * k; u.kz += sz / sd * k; u.cd = Math.max(u.cd, Math.min(.5, dealt * .012)); }
    t.hp -= amt;
    if (this.evq && u && u.pilot && from) this.evq.push(['ht', u.id, r1(from.pos.x), r1(from.pos.z)]);
    const head = V3(t.pos.x, u ? UNIT[u.kind].headY + .4 : (t as Building).h * .7, t.pos.z);
    if (from === me && me && !this.quiet) this.hud.damage(head, (crit ? 'CRIT ' : '') + Math.max(1, Math.round(dealt)), crit ? 'crit' : shielded ? 'shield' : '');
    if (t === me && me) { this.shake = Math.min(1, this.shake + .45); let ang = 0; if (from) { const a = Math.atan2(from.pos.x - me.pos.x, from.pos.z - me.pos.z) - this.yaw; ang = Math.atan2(Math.sin(a), Math.cos(a)); } this.hud.hurt(from ? ang : null); sfx.hurt(); }
    if (u && from && isUnit(from) && u !== me && !u.target && !isWorker(u.kind)) u.target = from;
    if (!u && from && isUnit(from) && t.team === SIDE.out && !this.eco) this.dir.alarm(from);
    if (!u && from && isUnit(from)) for (const c of this.units) if (c.alive && c.team === t.team && (c.team !== SIDE.home || this.eco) && !c.target && c.order.type === 'guard' && isFighter(c) && c.pos.distanceTo(t.pos) < 50) c.target = from;
    // With two economies, a worker under attack calls its side's guards over: a lone raider in the seams should not be free money.
    if (u && this.eco && isWorker(u.kind) && !u.pilot && from && isUnit(from) && from.team !== u.team && u.state !== 'flee') { const dx = u.pos.x - from.pos.x, dz = u.pos.z - from.pos.z, l = Math.hypot(dx, dz) || 1; if (u.site) { u.site.builder = null; u.site = null; } u.windX = u.pos.x + dx / l * 22; u.windZ = u.pos.z + dz / l * 22; u.state = 'flee'; u.timer = 4; }
    if (u && this.eco && isWorker(u.kind) && from && isUnit(from) && from.team !== u.team) for (const c of this.units) if (c.alive && c.team === u.team && !c.pilot && !c.target && c.order.type === 'guard' && isFighter(c) && c.pos.distanceTo(u.pos) < 45) c.target = from;
    if (!u && from && (this.eco || t.team === SIDE.home)) { const home = t.team === SIDE.home; if (this.time > (home ? this.alertT : this.vAlertT)) { if (home) this.alertT = this.time + 20; else this.vAlertT = this.time + 20; const f = fac(t.team); this.feed(f === 2 ? 'Rootwatch' : f ? 'Watcher' : 'Lookout', f === 0 ? `They're chewing on the ${BLD[(t as Building).kind].name}! Get back here.` : f === 2 ? `The ${BLD[(t as Building).kind].name} is bleeding sap. Something is chewing it.` : `The ${BLD[(t as Building).kind].name} is cracking. Come and sing it whole.`, 'al', t.team); if (f === 0 && t.team === this.myTeam) sfx.alarm(); } }
    if (!u && t.hp > 0) { const b = t as Building, st = b.hp < b.maxHp * .33 ? 2 : b.hp < b.maxHp * .66 ? 1 : 0; if (b.built && st > b.stage) this.crack(b, st); }
    if (t.hp <= 0) u ? this.killUnit(u, from) : this.killBuilding(t as Building);
  }
  quiet = false; vAlertT = 0;
  /** Counts down while a freshly taken body brings its weapon up into view. */
  drawT = 0;
  /** How far sustained fire has opened the crosshair, 0 to 1. The first shot after a pause is the accurate one. */
  bloom = 0;
  /** Damage a Breacher has soaked on the shield, 0 to 1. It comes back out with the next blast. */
  payback = 0; salvoCd = 0;
  /** Veyl player: cooldown on the body's second move and the Cantor's rising combo. */
  vCd = 0; combo = 0; comboT = 0;
  killUnit(u: Unit, from: Unit | Building | null) {
    if (this.evq) { this.evq.push(['ku', u.id, from ? from.id : 0]); const kp = from && (from as Unit).pilot; if (kp && u.team !== from!.team && this.score[kp]) this.score[kp][0]++; }
    if (u.kind === 'gantry' && u.alive && !this.net) { u.alive = false; this.explode(V3(u.pos.x, 0, u.pos.z), u.team, 40, 6, null); u.alive = true; }
    u.alive = false; const away = u.team !== SIDE.home, v = this.vol(u.pos), st = UNIT[u.kind];
    this.hud.damage(V3(u.pos.x, st.headY + .4, u.pos.z), u.kind === 'warden' ? 'KRAKA-THOOM!' : 'KO!', u.team !== this.myTeam ? 'ko' : 'kobad');
    u.ring.visible = false; if (u.rig.flash) u.rig.flash.visible = false; this.bodyLayer(u, false);
    R(-1, 1); R(-1, 1);   // two draws the old fall used: kept so the match's seeded random numbers run exactly as before
    this.fx.kill(u, from);
    if (u.team !== this.myTeam && from === this.me && this.me) { sfx.kill(); this.hud.hitmark(false, true); this.hitStop = u.kind === 'warden' ? .25 : this.me.kind === 'longshot' ? .12 : .06; this.streak = this.time < this.streakT ? this.streak + 1 : 1; this.streakT = this.time + 4; if (this.streak >= 2) { this.hud.streak(['', '', 'DOUBLE KO!', 'TRIPLE!', 'OVERTIME!', 'RAMPAGE!'][Math.min(5, this.streak)]); sfx.streak(this.streak); } }
    if (away) { const kk = from ? from.kind : 'other'; this.stats.lostToV[kk] = (this.stats.lostToV[kk] || 0) + 1; }
    if (away) { this.stats.kills++; if (u.kind === 'warden' && fac(SIDE.home) === 0) { this.shake = Math.max(this.shake, v); this.feed('Alpha', 'Warden down! Did everybody see that? I did that.', '', SIDE.home); } else if (from && isUnit(from) && from.team !== u.team && from !== this.me && Math.random() < .12) this.dir.bark(from, 'kill'); if (this.eco && u !== this.me && isFighter(u) && Math.random() < .3) this.dir.bark(u, 'down'); }
    else { this.stats.lost++; { const kk = from ? from.kind : 'other'; this.stats.lostTo[kk] = (this.stats.lostTo[kk] || 0) + 1; } if (u !== this.me && isFighter(u) && Math.random() < .35) this.dir.bark(u, 'down'); if (this.eco && from && isUnit(from) && from.team !== u.team && from !== this.me && Math.random() < .12) this.dir.bark(from, 'kill'); }
    if (u.site) u.site.builder = null;
    if (u === this.me) { this.staticT = 1.9; this.feed('Signal', 'Body lost. Finding you a new one.', 'al'); sfx.deny(); drillSound(false, false); }
  }
  bldMat(b: Building, i: number) { const f = fac(b.team); return f === 2 ? (i % 3 ? M.gH : i % 2 ? M.gB : M.gS) : f === 1 ? (i % 3 ? M.indigo : i % 2 ? M.crys : M.indigoL) : (i % 3 === 0 ? M.rust : i % 3 === 1 ? M.steel : M.steelD); }
  /** A building passes a damage state: it sheds pieces, sags and leans a little more. */
  crack(b: Building, st: number) {
    b.stage = st; const veyl = fac(b.team) !== 0, bad = b.team === this.myTeam; b.obj.rotation.z = (b.id % 2 ? 1 : -1) * st * .035; b.obj.rotation.x = (b.id % 3 - 1) * st * .025; b.obj.position.y = -st * .12;
    for (let i = 0; i < 5 + st * 2; i++) { const p = V3(b.pos.x + R(-b.hx, b.hx), R(b.h * .4, b.h), b.pos.z + R(-b.hz, b.hz)); this.chunk(p, R(.35, .8), this.bldMat(b, i), 5, b.pos, !veyl); if (i < 3) this.puff(p, 3, 1.4, veyl ? M.teal : M.smoke, 1.4, 1); }
    if (this.vol(b.pos) > .2) { this.hud.damage(V3(b.pos.x, b.h * .8, b.pos.z), st === 2 ? 'CRRRACK!' : 'CRACK!', bad ? 'kobad' : 'ko'); sfx.step(true); }
  }
  crater(p: { x: number; z: number }, r: number) {
    if (this.evq) return;
    let c = this.craters.find(x => x.t <= 0);
    if (!c) { if (this.craters.length < 16) { const m = new THREE.Group(); mk(G.blot, M.scorch, [0, .05, 0], [2.3, 2.3, 1], [-Math.PI / 2, 0, 0], m); for (let i = 0; i < 9; i++) { const a = i / 9 * 6.283 + R(-.2, .2); mk(G.dod, i % 3 ? M.rock : M.mesa, [Math.cos(a), .08, Math.sin(a)], [R(.3, .5), R(.14, .3), R(.24, .4)], [R(0, 3), R(0, 3), 0], m); } setLayer(m, L_FX); this.scene.add(m); c = { m, t: 0 }; this.craters.push(c); } else c = this.craters.reduce((a, b) => a.t < b.t ? a : b); }
    c.m.position.set(p.x, R(0, .02), p.z); c.m.rotation.y = R(0, 6); c.m.scale.set(r, Math.min(2.2, r * .55), r); c.m.visible = true; c.t = 150;
  }
  fallA = -1; possT = -9;
  killBuilding(b: Building) {
    b.alive = false; if (b.holo) this.scene.remove(b.holo); const veyl = fac(b.team) !== 0, bad = b.team === this.myTeam, v = this.vol(b.pos);
    const tall = b.h > Math.max(b.hx, b.hz) * 1.9, a = this.fallA >= 0 ? this.fallA : R(0, 6.283); this.fallA = -1;
    if (this.evq) this.evq.push(['kb', b.id, Math.round(a * 100) / 100]);
    this.wrecks.push({ b, t: 0, dur: tall ? 1.5 : 1.7, tall, dx: Math.sin(a), dz: Math.cos(a), yaw: b.obj.rotation.y, puffT: 0 });
    for (let i = 0; i < 4; i++) { const p = V3(b.pos.x + R(-b.hx, b.hx), R(1, b.h), b.pos.z + R(-b.hz, b.hz)); this.puff(p, 4, 2.6, veyl ? M.teal : i % 2 ? M.fire : M.smoke, 2, 1.5); this.debris(p, 6, .7, this.bldMat(b, i), 9); }
    for (let i = 0; i < 8; i++) this.chunk(V3(b.pos.x + R(-b.hx, b.hx), R(.6, b.h), b.pos.z + R(-b.hz, b.hz)), R(.5, 1.1), this.bldMat(b, i), 7, b.pos, !veyl);
    this.shove(b.pos, Math.max(b.hx, b.hz) * 3, 8);
    this.pipe.flash = Math.max(this.pipe.flash, v * .6);
    this.hud.damage(V3(b.pos.x, b.h * .6, b.pos.z), tall ? 'TIMBERRR!' : veyl ? 'KRA-KOOM!' : 'CRUNCH!', bad ? 'kobad' : 'ko'); sfx.boom(Math.max(.3, v)); this.shake = Math.max(this.shake, v);
    if (b.builder) { b.builder.site = null; b.builder.state = 'idle'; }
    if (fac(b.team) === 2) this.carpet.drop(b);
    if (this.net) return;
    this.dir.buildingLost(b);
    if (this.mission) { const mine = this.mission.out ? SIDE.out : SIDE.home; if (b.team === mine && b.kind === FACTION[mine].hq && !this.ownB(b.kind, true, mine).length && !this.mission.noHq) { this.endT = 2.4; this.endWon = false; this.pipe.flash = 1; } }
    else if (b.team === SIDE.out && b.kind === FACTION[SIDE.out].hq && !(this.eco ? this.ownB(FACTION[SIDE.out].hq, true, SIDE.out) : this.stones()).length) { this.endT = 2.4; this.endWon = true; this.pipe.flash = 1; } else if (b.team === SIDE.home && b.kind === FACTION[SIDE.home].hq && !this.ownB(b.kind, true, SIDE.home).length) { this.endT = 2.4; this.endWon = false; this.pipe.flash = 1; }
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
      const gy = u.pos.y;   // terrain (J): a body up on high ground is hit where it stands
      let t = sphere(u.pos.x, st.headY + gy, u.pos.z, .46 * k); if (t > 0 && t < best) { best = t; hit = { unit: u, dist: t, head: true }; }
      t = sphere(u.pos.x, st.bodyY + gy, u.pos.z, st.rad); if (t > 0 && t < best) { best = t; hit = { unit: u, dist: t }; }
      t = sphere(u.pos.x, st.bodyY * .35 + gy, u.pos.z, st.rad * .7); if (t > 0 && t < best) { best = t; hit = { unit: u, dist: t }; }
    }
    for (const b of this.buildings) {
      if (!b.alive || (team >= 0 && b.team !== team)) continue;
      let t0 = 0, t1 = best, ok = true; const mn = [b.pos.x - b.hx, b.pos.y, b.pos.z - b.hz], mx = [b.pos.x + b.hx, b.pos.y + b.h, b.pos.z + b.hz], oo = [o.x, o.y, o.z], dd = [d.x, d.y, d.z];
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
  groundPoint(out: THREE.Vector3, max: number) { const d = this.lookDir(TMP), o = this.cam.position; if (d.y > -.02) return false; let t = -o.y / d.y; if (t > max) return false;
    // terrain (J): walk the look out to the first ground it meets, high ground included
    if (T.TER.ridges.length) { for (let s = 0; s < t; s += .5) { const x = o.x + d.x * s, z = o.z + d.z * s, gy = T.h(x, z); if (gy > 0 && o.y + d.y * s <= gy) { out.set(x, gy, z); return true; } } }
    out.copy(o).addScaledVector(d, t); out.y = 0; return true; }

  // ------------------------------------------------------------ possession
  bodyLayer(u: Unit, self: boolean) { setLayer(u.obj, self ? L_SELF : 0); u.ring.layers.set(L_FX); if (u.rig.flash) { if (self && fac(u.team) !== 0) u.rig.flash.visible = false; else setLayer(u.rig.flash, L_FX); } }
  possess(u: Unit, force = false) {
    if (!u.alive || (u === this.me && !force)) return; if (!force && this.jumpCd > 0) { sfx.deny(); return; }
    if (this.net) { if (u.pilot && u.pilot !== this.net.id) { sfx.deny(); this.feed('Signal', `${this.names[u.pilot] || 'Someone'} is already in that body.`, 'al'); return; } this.net.cmd('bd', u.id); u.pilot = this.net.id; this.possT = this.time; if (this.me && this.me !== u) this.me.pilot = 0; }
    const old = this.me; if (old && old.alive && old !== u) { this.bodyLayer(old, false); if (isWorker(old.kind)) { old.state = old.carrying > 0 ? 'toHQ' : 'idle'; old.site = null; if (old.rig.pack) old.rig.pack.visible = old.carrying > 0; } old.target = null; this.lastBody = old; if (isSoldier(old) && !this.net) this.dir.enlist(old); }
    this.me = u; this.bodyLayer(u, true); this.yaw = u.yaw; this.pitch = 0; this.jumpCd = force ? 0 : 3; this.tool = 1; this.reloadT = 0; this.ads = 0; this.brace = false; this.recoil = 0; u.target = null; u.wind = 0;
    this.ammo = GUNS[u.kind] ? GUNS[u.kind].mag : 0;
    if (u.site) { u.site.builder = null; u.site = null; } u.state = 'idle';
    // Ore a worker is carrying stays in its pack until it is walked to a base. Banking it on the jump let a player drill a pack full, hop out and
    // back in, and bank 15 ore every few seconds from a far seam (the hand-drilling exploit again). Online the replica cannot see the amount.
    if (this.net) u.carrying = 0; if (u.rig.pack) u.rig.pack.visible = u.carrying > 0; if (u.rig.flash) u.rig.flash.visible = false;
    drillSound(false, false);
    this.drawT = .32; this.vWind = 0; if (!force) { sfx.jump(); this.hud.feed(UNIT[u.kind].name, UNIT[u.kind].ack[Math.floor(Math.random() * UNIT[u.kind].ack.length)] || '...', 'in'); this.obj.jumped = true; this.pipe.flash = .35; }
    if (!this.seenKinds.has(u.kind) && !force) { this.seenKinds.add(u.kind); this.phase = 'card'; this.cardT = 1.15; this.hud.titleCard(u.kind, UNIT[u.kind].name, UNIT[u.kind].quip); sfx.card(); } else this.seenKinds.add(u.kind);
  }
  refreshTab() {
    const me = this.me!, list: Game['tabList'] = [], t = this.dir.squadTask();
    if (fac(this.myTeam)) {
      const hot = this.mine().filter(u => u !== me && !u.pilot && this.time - u.lastHit < 4).sort((a, b) => b.lastHit - a.lastHit)[0];
      if (hot) list.push({ label: UNIT[hot.kind].name + ' under attack', task: 'Jump in and save them', unit: hot, hp: hot.hp / hot.maxHp, alert: true });
      const gl = fac(this.myTeam) === 2;
      for (const k of (gl ? ['snapper', 'quillback', 'blister', 'mulcher', 'grazer'] : ['cantor', 'lancer', 'warden', 'tender']) as Kind[]) { const all = this.mine(k), x = all.filter(u => u !== me && !u.pilot && u !== hot).sort((a, b) => a.pos.distanceTo(me.pos) - b.pos.distanceTo(me.pos))[0]; if (x) list.push({ label: `${UNIT[k].name} ×${all.length}`, task: gl ? (k === 'grazer' ? 'Chewing ore' : x.order.type === 'raid' || x.order.type === 'amove' ? 'Swarming the yard' : x.order.type === 'follow' ? 'At your heels' : 'Lurking in the Bloom') : k === 'tender' ? (x.state === 'build' || x.state === 'toSite' ? 'Singing a building up' : 'Humming ore') : x.order.type === 'raid' || x.order.type === 'amove' ? 'Marching on the yard' : x.order.type === 'follow' ? 'Following you' : 'Guarding the Stones', unit: x, hp: x.hp / x.maxHp, alert: false }); }
      if (this.lastBody && this.lastBody.alive && this.lastBody !== me && !list.some(e => e.unit === this.lastBody)) list.push({ label: 'Last body · ' + UNIT[this.lastBody.kind].name, task: 'Where you just were', unit: this.lastBody, hp: this.lastBody.hp / this.lastBody.maxHp, alert: false });
      this.tabList = list.slice(0, 5); if (this.tabSel >= this.tabList.length) this.tabSel = 0; return;
    }
    const near = (k: Kind) => this.own(k, this.myTeam).filter(u => u !== me && !u.pilot).sort((a, b) => a.pos.distanceTo(me.pos) - b.pos.distanceTo(me.pos))[0];
    const hot = this.own(undefined, this.myTeam).filter(u => u !== me && this.time - u.lastHit < 4).sort((a, b) => b.lastHit - a.lastHit)[0];
    if (hot) list.push({ label: UNIT[hot.kind].name + ' under attack', task: 'Jump in and save them', unit: hot, hp: hot.hp / hot.maxHp, alert: true });
    const l = near('linesman'); if (l) list.push({ label: `Linesman ×${this.own('linesman', this.myTeam).length}`, task: t, unit: l, hp: l.hp / l.maxHp, alert: false });
    for (const k of ['longshot', 'patch'] as Kind[]) { const x = near(k); if (x && list.length < 4) list.push({ label: `${UNIT[k].name} ×${this.own(k, this.myTeam).length}`, task: k === 'patch' ? 'Keeping people alive' : t, unit: x, hp: x.hp / x.maxHp, alert: false }); }
    const w = near('gantry'); if (w) list.push({ label: `Gantry ×${this.own('gantry', this.myTeam).length}`, task: t, unit: w, hp: w.hp / w.maxHp, alert: false });
    const b = near('breacher'); if (b) list.push({ label: `Breacher ×${this.own('breacher', this.myTeam).length}`, task: t, unit: b, hp: b.hp / b.maxHp, alert: false });
    const r = near('rigger'); if (r) list.push({ label: `Rigger ×${this.own('rigger', this.myTeam).length}`, task: r.state === 'build' || r.state === 'toSite' ? 'Building' : 'Mining ore', unit: r, hp: r.hp / r.maxHp, alert: false });
    if (this.lastBody && this.lastBody.alive && this.lastBody !== me && !list.some(e => e.unit === this.lastBody)) list.push({ label: 'Last body · ' + UNIT[this.lastBody.kind].name, task: 'Where you just were', unit: this.lastBody, hp: this.lastBody.hp / this.lastBody.maxHp, alert: false });
    this.tabList = list.slice(0, 5); if (this.tabSel >= this.tabList.length) this.tabSel = 0;
  }

  // ------------------------------------------------------------ frame
  update(dtReal: number) {
    this.pin();
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
      if (!this.net && !this.otSaid && this.overtime() > 0) { this.otSaid = true; this.feed('Signal', `Overtime. From here every building takes ${Math.round(OVERTIME.perMin * 100)}% more damage for each minute that passes, and every tower does that much less.`, 'al'); }
      if (this.staticT > 0) { this.staticT -= dtReal; if (this.staticT <= 0) this.respawn(); }
      else if (this.me?.alive && !this.tab) this.updatePlayer(dt, P);
      if (SIDE.out === 2) gloamFx(this, dt);
      if (this.net) { netTick(this, dt); this.intel.update(dt); this.poseUnits(dt); this.updateProjs(dt); this.updateChunks(dt); this.updateWrecks(dt); this.updateFx(dt); } else {
      if (this.mission && this.endT <= 0) { this.mission.tick?.(this, this.ms, dt); if (this.ms.lose) { this.endT = 2.4; this.endWon = false; this.pipe.flash = 1; } else if (this.mission.objectives.every(o => o.done(this))) { this.endT = 2.4; this.endWon = true; this.pipe.flash = 1; } }
      this.updateUnits(dt); this.updateBuildings(dt); this.updateProjs(dt); this.updateChunks(dt); this.updateWrecks(dt); this.dir.update(dt); this.intel.update(dt);
      this.updateFx(dt); }
    } else if (this.phase === 'cut') { const dt = Math.min(dtReal, .05); this.time += dt; if (this.cutSim) { this.updateUnits(dt); this.updateBuildings(dt); this.updateProjs(dt); this.updateChunks(dt); this.updateWrecks(dt); } this.updateFx(dt); }
    else { const live = !!this.net && (this.phase === 'paused' || this.phase === 'card'); /* an online match does not stop for a pause screen or a title card */ if (live) { netTick(this, dtReal); this.poseUnits(dtReal); this.updateProjs(dtReal); this.updateChunks(dtReal); this.updateWrecks(dtReal); } this.updateFx(this.phase === 'menu' || live ? dtReal : 0); }
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
    for (const b of this.bursts) if (b.t > 0) { b.t -= dt; const k = 1 - Math.max(0, b.t) / .2; b.g.scale.setScalar(b.s * (.5 + .8 * Math.sqrt(k))); b.g.quaternion.copy(this.cam.quaternion); b.g.rotateZ(b.rot); if (b.t <= 0) b.g.visible = false; }
    for (const b of this.bubbles) if (b.t > 0) { b.t -= dt; if (b.u) b.m.position.set(b.u.pos.x, UNIT[b.u.kind].bodyY, b.u.pos.z); if (b.t <= 0) b.m.visible = false; }
    for (const w of this.warns) if (w.t > 0) { w.t -= dt; const k = 1 - w.t / w.life, s = w.r * 2 * (.3 + .7 * k); w.m.scale.set(s, s, 1); if (w.t <= 0) w.m.visible = false; }
    this.fx.update(dt);
  }

  /** How much ore a driven Rigger's pack holds before it has to be walked to the Headframe. */
  packCap(team: number) { const up = this.upOf(team), f = fac(team); return (f === 0 && up.buckets) || (f === 2 && up.ggut) ? 21 : 15; }
  /** Puts a driven Rigger's pack on the books. Online the server does this and the replica only empties its own pack. */
  bank(u: Unit) {
    const n = u.carrying; u.carrying = 0; if (u.rig.pack) u.rig.pack.visible = false; if (n <= 0) return;
    if (!this.net) { this.purse[u.team] += n * this.oreK(u.team); if (!atHome(u.team)) this.stats.minedV += n; else this.stats.mined += n; if (u.pilot && this.score[u.pilot]) this.score[u.pilot][1] += n; }
    if (u === this.me) { sfx.bank(); this.hud.damage(V3(u.pos.x, 2.2, u.pos.z), `+${n} banked`, 'ore'); }
  }
  /** What this side has found of the map. */
  fog!: Fog;
  safeT = 0;
  respawn() {
    const me = this.me!; let best: Unit | null = null, bd = 1e9; for (const u of this.mine()) { if (this.net && u.pilot && u.pilot !== this.net.id) continue; const d = u.pos.distanceTo(me.pos) + (isFighter(u) ? 0 : 25); if (d < bd) { bd = d; best = u; } }
    const F = FACTION[this.myTeam];
    if (!best && this.net) { if (this.ownB(F.hq, false, this.myTeam).length) { this.net.cmd('rs'); this.staticT = 1.2; } return; }
    if (!best && this.ownB(F.hq, false, this.myTeam).length) { best = this.spawn(F.worker, this.myTeam, ...this.hqSpot(this.myTeam)); this.safeT = 4; this.feed(F.voice, fac(this.myTeam) === 2 ? 'A fresh Grazer, wet from the Bud. Mind it.' : fac(this.myTeam) ? 'A fresh voice for you. Mind this one.' : 'Found you a fresh Rigger. Try to keep this one.', ''); }
    if (best) { this.jumpCd = 0; this.possess(best, true); sfx.jump(); this.pipe.flash = .4; } else if (this.endT <= 0) this.end(false);
  }

  // ------------------------------------------------------------ the player
  updatePlayer(dt: number, P: Set<string>) {
    const me = this.me!, K = this.keys, gun = GUNS[me.kind];
    // A job that locks weapons: the trigger, the grenade or ability key and the ability wheel do nothing. Walking and dashing still work.
    if (this.story?.noFire && !isWorker(me.kind)) { if (this.lmb && P.has('Mouse0')) this.feed(fac(this.myTeam) ? FACTION[this.myTeam].voice : 'Quartermaster', 'Weapons are locked for this job. Walk.', 'al'); this.lmb = false; P.delete('Mouse0'); P.delete('KeyC'); K.delete('KeyC'); }
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
    if (me.moving) { const ph = Math.floor(this.bob / Math.PI); if (ph !== this.stepPhase) { this.stepPhase = ph; sfx.step(me.kind !== 'linesman' && me.kind !== 'rigger', me.kind === 'gantry'); if (me.kind === 'gantry') this.shake = Math.max(this.shake, .22); if (sprint) this.puff(TMP.set(me.pos.x, .1, me.pos.z), 1, .35, M.dust, .3, .6); } }
    this.hopCd = Math.max(0, this.hopCd - dt);
    if (P.has('Space') && this.hopCd <= 0 && !this.brace) { const s = Math.sin(this.yaw), c = Math.cos(this.yaw), l = Math.hypot(fx, fz); let dx = s, dz = c; if (l) { dx = (s * fz - c * fx) / l; dz = (c * fz + s * fx) / l; } this.hopX = dx; this.hopZ = dz; this.hopT = .17; this.hopCd = 1.4; sfx.dash(.8); this.puff(TMP.set(me.pos.x, .15, me.pos.z), 3, .5, M.dust, .3, 1); }
    if (this.hopT > 0) { this.hopT -= dt; const v = (me.kind === 'gantry' ? 11 : me.kind === 'breacher' ? 15 : 19) * dt; me.pos.x += this.hopX * v; me.pos.z += this.hopZ * v; me.moving = true; this.collide(me, me.pos.x, me.pos.z); }
    me.yaw = this.yaw; me.pitch = this.pitch;
    if (this.net && me.carrying > 0) { const hq = this.nearHQ(me.pos.x, me.pos.z, me.team); if (hq && this.distToBox(hq, me.pos.x, me.pos.z) < 2.6) this.bank(me); }
    this.bloom = Math.max(0, this.bloom - dt * (this.fireCd > -.12 ? .25 : 3.2)); this.salvoCd = Math.max(0, this.salvoCd - dt);
    this.fireCd -= dt; this.recoil = Math.max(0, this.recoil - dt * 6); this.nadeCd = Math.max(0, this.nadeCd - dt); this.bashCd = Math.max(0, this.bashCd - dt); this.bashT = Math.max(0, this.bashT - dt);
    const eye = V3(me.pos.x, UNIT[me.kind].eye + me.pos.y /* terrain (J) */, me.pos.z), dir = this.lookDir(V3());
    this.prompt = '';
    if (this.net && P.has('KeyB')) { const pp = V3(); if (!this.groundPoint(pp, 400)) pp.set(me.pos.x + dir.x * 40, 0, me.pos.z + dir.z * 40); this.net.cmd('pg', Math.round(pp.x), Math.round(pp.z)); }
    if (P.has('KeyQ') && this.lastBody?.alive) { this.possess(this.lastBody); return; }
    const look = this.ray(eye, dir, 70, -1, me);
    if (look?.unit && look.unit.team === this.myTeam && look.unit.pilot) this.prompt = `${this.names[look.unit.pilot] || 'A crewmate'} is driving this one`; else if (look?.unit && look.unit.team === this.myTeam) { this.prompt = `<b>F</b> Jump into ${UNIT[look.unit.kind].name}`; if (P.has('KeyF')) { this.possess(look.unit); return; } }
    this.dir.playerOrders(P, eye, dir, look ? look.dist : -1);
    // production buildings
    const side = me.team, voice = FACTION[side].voice, lb = look?.b && look.b.team === side && look.b.built && look.dist < 10 ? look.b : null;
    if (lb && (TRAINS[lb.kind] || UPGRADES.some(u => u.at === lb.kind && (u.team || 0) === fac(side)))) {
      // One key per thing on offer: units first, then the research this building sells that has not been bought.
      const keys = 'ETYU', rows: string[] = [], notes: string[] = []; let i = 0;
      for (const k of TRAINS[lb.kind] || []) {
        const nb = UNIT_NEEDS[k], ok = !nb || this.ownB(nb, true, side).length > 0, key = keys[i++], two = fac(side) === 2 && G_PAIR[k as keyof typeof G_PAIR];
        if (ok) rows.push(`<b>${key}</b> ${UNIT[k].name}${two ? ' ×2' : ''} · ${UNIT[k].cost * (two ? 2 : 1)}`); else if (!notes.some(n => n.includes(BLD[nb!].name))) notes.push(`<i>${BLD[nb!].name} unlocks ${(TRAINS[lb.kind] || []).filter(x => UNIT_NEEDS[x] === nb).map(x => UNIT[x].name).join(' and ')}</i>`);
        if (P.has('Key' + key)) { if (ok) this.train(lb, k, true); else { sfx.deny(); this.feed(voice, `${UNIT[k].name} needs ${/^[AEIOU]/.test(BLD[nb!].name) ? 'an' : 'a'} ${BLD[nb!].name} first.`, 'al'); } }
      }
      const sold = UPGRADES.filter(u => u.at === lb.kind && (u.team || 0) === fac(side)), open = sold.filter(u => !this.upOf(side)[u.key]);
      for (const u of open) {
        if (u.needs && !this.upOf(side)[u.needs]) { notes.push(`<i>${u.name} needs ${UPGRADES.find(x => x.key === u.needs)!.name}</i>`); continue; }
        if (i >= keys.length) break; const key = keys[i++]; rows.push(`<b>${key}</b> ${u.name} · ${u.cost} <i>${u.blurb}</i>`); if (P.has('Key' + key)) this.buyUpgrade(u.key, this.myTeam, true);
      }
      if (sold.length && !open.length) notes.push(fac(side) === 2 ? 'Everything here has grown in' : fac(side) ? 'Every song here is learned' : 'All research here is bought');
      const all = rows.concat(notes.slice(0, 2)); if (lb.kind === 'mothercap') all.push(`${lb.buds || 0} Bud${lb.buds === 1 ? '' : 's'} ripe${lb.queue.length ? ` · ${lb.queue.length} ripening` : ''}`); else if (lb.queue.length) all.push(`${lb.queue.length} queued`);
      this.prompt = all.join(all.length > 2 ? '<br>' : ' &nbsp; ');
    }
    if (!this.prompt && look?.prop && !isWorker(me.kind) && look.dist < 60) { const q = look.prop.owner || look.prop; if (q.hp < q.maxHp) this.prompt = `${q.name} · <b>${Math.ceil(q.hp / q.maxHp * 100)}%</b>`; }
    if (isWorker(me.kind)) this.updateRigger(dt, P, eye, dir, look); else if (fac(me.team) === 2) playerGloam(this, dt, P, eye, dir); else if (fac(me.team)) this.updateVeyl(dt, P, eye, dir); else if (me.kind === 'gantry') this.updateCannon(dt, P, eye, dir, gun); else this.updateGun(dt, P, eye, dir, gun);
  }
  /** First person as a Veyl fighter. */
  updateVeyl(dt: number, P: Set<string>, eye: THREE.Vector3, dir: THREE.Vector3) {
    const me = this.me!, vm = this.vm.veyl, flash = vm.userData.flash; flash.visible = false;
    this.vCd = Math.max(0, this.vCd - dt); this.comboT -= dt; if (this.comboT <= 0) this.combo = 0;
    if (me.kind === 'warden') {
      // Right click: the Low Note. Every Veyl in earshot gets its shield back.
      if (P.has('Mouse2')) { if (this.vCd <= 0) { this.vCd = 20; this.net?.cmd('vs'); sfx.charge(1); sfx.boom(.3); this.shake = Math.max(this.shake, .5); this.warn(me.pos.x, me.pos.z, 16, .5); this.hud.damage(V3(me.pos.x, 4.6, me.pos.z), 'LOW NOTE', 'shield'); } else sfx.deny(); }
      if (this.vWind > 0) {
        this.vWind -= dt; if (this.vWind > 0) return;
        this.fireCd = 2; this.recoil = 1; this.shake = Math.min(1, this.shake + .6); const c = V3(this.vX, 0, this.vZ);
        this.explode(c, me.team, 38, 4.6, me, true); this.net?.cmd('xx', r1(c.x), r1(c.z), 4.6); return;
      }
      if (this.lmb && this.fireCd <= 0) { this.vWind = .7; this.vX = me.pos.x + Math.sin(this.yaw) * 3.4; this.vZ = me.pos.z + Math.cos(this.yaw) * 3.4; this.warn(this.vX, this.vZ, 4.6, .7); sfx.charge(1); }
      return;
    }
    if (me.kind === 'cantor' && P.has('Mouse2')) {
      // Right click: the Whirl. Everything in arm's reach, all the way round.
      if (this.vCd > 0) sfx.deny(); else { this.vCd = 6; this.fireCd = .5; this.recoil = 1; me.swing = 1; sfx.slash(1); sfx.dash(.6); this.shake = Math.max(this.shake, .35); let n = 0;
        for (const u of this.units) { if (!u.alive || u.team !== foeOf(me.team)) continue; if (Math.hypot(u.pos.x - me.pos.x, u.pos.z - me.pos.z) > 3.8 + UNIT[u.kind].rad) continue; this.damage(u, 24, me); n++; }
        if (n) { this.hud.hitmark(false); sfx.hit(); this.hud.damage(V3(me.pos.x, 2.6, me.pos.z), n > 1 ? 'WHIRL x' + n : 'WHIRL!', 'ko'); } return; }
    }
    if (me.kind === 'lancer') {
      // Right click: the Held Note. A beat to wind up, then a beam that goes through the whole line.
      if (this.vWind > 0) {
        this.vWind -= dt; if (this.vWind > 0) return;
        this.fireCd = 1.3; this.recoil = 1; this.kick += .04; this.shake = Math.max(this.shake, .5); flash.visible = true; sfx.zap(1); sfx.boom(.25); me.swing = 1;
        const muzzle = V3(); flash.getWorldPosition(muzzle); muzzle.addScaledVector(dir, 1.6); let at = 0, skip: Unit | null = me, n = 0, fall = 1, wall = false;
        for (let i = 0; i < 4; i++) { const h = this.ray(V3().copy(eye).addScaledVector(dir, at), dir, 80 - at, -1, skip); if (!h) { at = 80; break; } at += h.dist; if (h.unit && h.unit.team === foeOf(me.team)) { this.damage(h.unit, 55 * fall, me, !!h.head); skip = h.unit; fall *= .8; n++; at += .4; continue; } if (h.b && h.b.team === foeOf(me.team)) { this.damage(h.b, 40, me); n++; } wall = true; break; }
        const end = V3().copy(eye).addScaledVector(dir, Math.min(80, at)); this.tracer(muzzle, end, beamMat, .16); if (wall) this.puff(end, 3, .6, M.teal, .8);
        if (n) { this.hud.hitmark(n > 1); sfx.hit(); if (n > 1) this.hud.streak('ONE NOTE, ' + n + ' VOICES'); } return;
      }
      if (P.has('Mouse2')) { if (this.vCd <= 0) { this.vCd = 7; this.vWind = .8; sfx.charge(1); } else sfx.deny(); return; }
    }
    if (!this.lmb || this.fireCd > 0) return;
    if (me.kind === 'cantor') {
      this.fireCd = .6; this.recoil = 1; me.swing = 1; sfx.slash(1); let any = false; const cut = 16 + this.combo * 4;
      for (const u of this.units) { if (!u.alive || u.team !== foeOf(me.team)) continue; const dx = u.pos.x - me.pos.x, dz = u.pos.z - me.pos.z, d = Math.hypot(dx, dz); if (d > 3 + UNIT[u.kind].rad || (dx * dir.x + dz * dir.z) / (d || 1) < .45) continue; this.damage(u, cut, me); any = true; }
      for (const b of this.buildings) { if (!b.alive || b.team !== foeOf(me.team) || this.distToBox(b, me.pos.x, me.pos.z) > 2.8) continue; const dx = b.pos.x - me.pos.x, dz = b.pos.z - me.pos.z; if (dx * dir.x + dz * dir.z < 0) continue; this.damage(b, 14, me); any = true; }
      if (any) { this.hud.hitmark(this.combo >= 3); sfx.hit(); this.shake = Math.max(this.shake, .2 + this.combo * .06); this.combo = Math.min(3, this.combo + 1); this.comboT = 2; }
      return;
    }
    // Lancer: one long, bright note
    this.fireCd = 1.15; this.recoil = 1; this.kick += .02; flash.visible = true; sfx.zap(1); me.swing = 1;
    const hit = this.ray(eye, dir, 70, -1, me), dist = hit ? hit.dist : 70, end = V3().copy(eye).addScaledVector(dir, dist), muzzle = V3(); flash.getWorldPosition(muzzle); muzzle.addScaledVector(dir, 1.6);
    this.tracer(muzzle, end, beamMat, .06);
    const tgt = hit && (hit.unit && hit.unit.team === foeOf(me.team) ? hit.unit : hit.b && hit.b.team === foeOf(me.team) ? hit.b : null);
    if (tgt) { this.damage(tgt, hit!.head ? 40 : 22, me, !!hit!.head); this.hud.hitmark(!!hit!.head); sfx.hit(); this.puff(end, 2, .5, M.teal, .6); } else this.impact(eye, dir, hit, end, 20);
  }
  train(b: Building, k: Kind, manual = false) {
    const st = UNIT[k];
    const pp = this.paper(b.team); if (pp && !isWorker(k) && !pp.units.includes(k)) { if (manual) { sfx.deny(); this.feed(FACTION[b.team].voice, fac(b.team) ? `No ${st.name}s on this job. Later.` : `No ${st.name}s on this job's paperwork. Later.`, 'al'); } return false; }
    if (this.net) { this.net.cmd('tn', b.id, k); sfx.blip(); return true; }
    const t = b.team, v = FACTION[t].voice, n = fac(t) === 2 && G_PAIR[k as keyof typeof G_PAIR] ? 2 : 1, bud = b.kind === 'mothercap';
    if (bud && !(b.buds! > 0)) { if (manual) { sfx.deny(); this.feed(v, 'No Bud is ripe on this Cap. Give it a moment, or grow another Mother Cap.', 'al', t); } return false; }
    if (this.cash(t) < st.cost * n) { if (manual) { sfx.deny(); this.feed(v, fac(t) === 2 ? 'The Overgrowth is hungry. Send the Grazers to chew.' : fac(t) ? 'The Chorus is out of ore. Send the Tenders to the seams.' : 'Can\'t. We\'re broke. Go hit a rock.', 'al', t); } return false; }
    if (this.supplyUsed(t) + st.supply * n > this.supplyCap(t)) { if (manual) { sfx.deny(); this.feed(v, fac(t) === 2 ? 'No room to grow. Root a Spore Sac first.' : fac(t) ? 'No room in the song. Grow a Hush Well first.' : 'No beds. Build a Depot first.', 'al', t); } return false; }
    if (!bud && b.queue.length >= 5) { if (manual) sfx.deny(); return false; }
    if (bud) b.buds!--; this.purse[t] -= st.cost * n; for (let i = 0; i < n; i++) b.queue.push({ kind: k, t: st.time }); if (manual) sfx.blip(); return true;
  }
  buyUpgrade(key: UpKey, team = this.myTeam, manual = false) {
    const u = UPGRADES.find(x => x.key === key)!; if (this.upOf(team)[key] || (u.team || 0) !== fac(team)) return false;
    if (this.net) { this.net.cmd('up', key); return true; }
    const t = team, v = FACTION[t].voice;
    if (!this.ownB(u.at, true, t).length || (u.needs && !this.upOf(t)[u.needs])) { if (manual) sfx.deny(); return false; }
    if (this.cash(t) < u.cost) { if (manual) { sfx.deny(); this.feed(v, `${u.name} is ${u.cost} ore. ${fac(t) === 2 ? 'Chew some more.' : fac(t) ? 'Hum some more.' : 'Keep digging.'}`, 'al', t); } return false; }
    this.purse[t] -= u.cost; this.upOf(t)[key] = true; sfx.built();
    const plate = key === 'armor' || key === 'vglass' || key === 'garmor' ? 1.25 : key === 'armor2' || key === 'vglass2' || key === 'garmor2' ? 1.2 : key === 'armor3' || key === 'garmor3' ? 1.15 : 0; if (key === 'gbloom') this.carpet.deepen(t); if (plate) for (const x of this.own(undefined, t)) { x.maxHp *= plate; x.hp *= plate; if (fac(t)) { x.maxShield *= plate; x.shield *= plate; } }
    this.feed(v, u.say, '', t); return true;
  }
  canPlace(k: BKind, x: number, z: number, rot: boolean, team = 0) {
    const st = BLD[k], hx = rot ? st.hz : st.hx, hz = rot ? st.hx : st.hz, hq = FACTION[team].hq;
    // A new base (Headframe or Choir Stone) can go on any open ground short of the enemy; everything else stays near one of your own.
    // Nothing can be staked out on the far side of the edge of the world, where bodies cannot walk up to it and hit it.
    const [mx, mz] = MAP.mid!, fromMid = Math.hypot(x - mx, z - mz); if (fromMid + Math.max(hx, hz) > MAP.rad! * .99) return false;
    // And nothing goes up on the enemy's doorstep. A new base always needed 45 m of clear ground from the enemy; the buildings round it
    // did not, so a Headframe 45 m out could put a Watchpost, Thorn Spire or Stinger Stalk right beside the enemy's ore line.
    for (const b of this.buildings) if (b.alive && b.team !== team && Math.hypot(b.pos.x - x, b.pos.z - z) < 45) return false;
    if (k === hq) { if (fromMid > MAP.rad! * .95) return false; }
    else if ((team || Math.hypot(x, z) > 80) && !this.buildings.some(b => b.alive && b.team === team && b.kind === hq && b.built && Math.hypot(b.pos.x - x, b.pos.z - z) < 42)) return false;
    for (const b of this.buildings) if (b.alive && Math.abs(x - b.pos.x) < hx + b.hx + 1.6 && Math.abs(z - b.pos.z) < hz + b.hz + 1.6) return false;
    for (const o of this.ores) if (o.amount > 0 && Math.abs(x - o.pos.x) < hx + 2.4 && Math.abs(z - o.pos.z) < hz + 2.4) return false;
    for (const s of this.spires) if (Math.abs(x - s.x) < hx + s.r && Math.abs(z - s.z) < hz + s.r) return false;
    if (!T.flat(x, z, hx + .6, hz + .6)) return false;   // terrain (J): on one level, off the ramps, clear of the Flux vents
    if (fac(team) === 2 && !onBloom(this, k as GBKind, x, z, team)) return false;
    return true;
  }
  place(k: BKind, x: number, z: number, rot: boolean, team = 0, by: Unit | null = this.me) { if (this.net) { this.net.cmd('pl', k, x, z, rot ? 1 : 0); sfx.place(); this.puff(TMP.set(x, .3, z), 5, 1.2, M.dust, .5, 2); return null; }
    // A Gloam building is a Grazer that put down roots. No Grazer to spare, no building.
    let root: Unit | null = null; if (fac(team) === 2) { root = rootGrazer(this, x, z, by && by.team === team ? by : null, team); if (!root) return null; }
    this.purse[team] -= BLD[k].cost; const b = this.addBuilding(k, team, x, z, false, rot); if (root) consume(this, root); sfx.place(); this.puff(TMP.set(x, .3, z), 5, 1.2, fac(team) ? M.violet : M.dust, .5, 2); return b; }

  weldAcc = 0;
  /** First person as a worker: a Rigger's drill, or a Tender's hum. Both mine, build, mend and kick. */
  updateRigger(dt: number, P: Set<string>, eye: THREE.Vector3, dir: THREE.Vector3, look: Hit | null) {
    const me = this.me!, side = me.team, foe = foeOf(side), veyl = fac(side) === 1, gl = fac(side) === 2, list = FACTION[side].builds, voice = FACTION[side].voice, home = BLD[FACTION[side].hq].name, cash = this.cash(side);
    if (P.has('Digit1')) { this.tool = 1; sfx.blip(); }
    if (P.has('Digit2')) { if (this.tool === 2) this.buildSel = (this.buildSel + 1) % list.length; this.tool = 2; sfx.blip(); }
    if (this.buildSel >= list.length) this.buildSel = 0;
    if (this.tool === 2 && this.wheel) { this.buildSel = (this.buildSel + (this.wheel > 0 ? 1 : list.length - 1)) % list.length; sfx.blip(); }
    if (this.tool === 2 && P.has('KeyR')) { this.buildRot = !this.buildRot; sfx.blip(); }
    if (this.tool === 2 && P.has('Mouse2')) { this.tool = 1; sfx.blip(); }
    else if (this.tool === 1 && P.has('Mouse2') && this.bashCd <= 0) {
      // Right click: the drill kicks like a jackhammer (a Tender throws one sharp note). Short reach, big shove, and it cracks scenery.
      this.bashCd = 1.1; this.bashT = .25; this.recoil = 1; this.jaw = 1; this.shake = Math.max(this.shake, .4); veyl ? sfx.zap(1) : gl ? sfx.slash(1) : sfx.clang(); sfx.dash(.6); let any = false;
      for (const u of this.units) { if (!u.alive || u.team !== foe) continue; const dx = u.pos.x - me.pos.x, dz = u.pos.z - me.pos.z, d = Math.hypot(dx, dz); if (d > 3.2 + UNIT[u.kind].rad || (dx * dir.x + dz * dir.z) / (d || 1) < .45) continue; this.damage(u, 22, me); any = true; }
      if (look?.prop && look.dist < 3.6) { this.damageProp(look.prop, 60, me, V3().copy(eye).addScaledVector(dir, look.dist)); any = true; } else if (look?.b && look.b.team === foe && look.dist < 3.6) { this.damage(look.b, 40, me); any = true; }
      if (any) { this.hud.hitmark(false); sfx.hit(); this.hud.damage(V3().copy(eye).addScaledVector(dir, 2), gl ? 'CHOMP!' : veyl ? 'TWANG!' : 'CLONK!', 'ko'); }
    }
    let biting = false; const drilling = this.tool === 1 && this.lmb;
    if (this.tool === 2) {
      const k = list[this.buildSel], g = this.placePos;
      if (!this.groundPoint(g, 26)) g.set(me.pos.x + Math.sin(this.yaw) * 12, 0, me.pos.z + Math.cos(this.yaw) * 12);
      g.x = Math.round(g.x); g.z = Math.round(g.z);
      this.placeOK = this.unlocked(k, side) && this.canPlace(k, g.x, g.z, this.buildRot, side) && cash >= BLD[k].cost && Math.hypot(g.x - me.pos.x, g.z - me.pos.z) > Math.max(BLD[k].hx, BLD[k].hz) + 1;
      if (gl && !spareGrazers(this)) this.prompt = 'No spare Grazer: <b>you</b> will root into this one';
      if (P.has('Mouse0')) { if (this.placeOK) { this.place(k, g.x, g.z, this.buildRot, side); this.tool = 1; this.obj.built = true; this.feed(voice, gl ? `${BLD[k].name} rooted. A Grazer gave itself to it, and it grows by itself.` : veyl ? `${BLD[k].name} seeded. Hold click on it to sing it up faster.` : `${BLD[k].name} staked out. Hold the drill on it to speed things up.`, ''); } else { sfx.deny(); if (!this.unlocked(k, side)) this.feed(voice, this.missing(k, side).length ? `${BLD[k].name} needs a finished ${this.missing(k, side).map(n => BLD[n].name).join(' and ')} first.` : `No ${BLD[k].name} on this job's paperwork. Later.`, 'al'); else if (cash < BLD[k].cost) this.feed(voice, `A ${BLD[k].name} is ${BLD[k].cost} ore. We have ${Math.floor(cash)}.`, 'al'); } }
    } else if (drilling) {
      this.mineT -= dt;
      if (look && look.dist < 4.2) {
        const at = V3().copy(eye).addScaledVector(dir, look.dist - .15), up = this.upOf(me.team), quick = gl ? up.gtongue : veyl ? up.vhum : up.drill;
        if (look.ore && me.carrying >= this.packCap(side)) { this.prompt = `${gl ? 'Belly' : 'Pack'} full · <b>${gl ? 'carry it to a Mother Cap' : veyl ? 'carry it to a Choir Stone' : 'walk it to the Headframe'}</b>`; if (this.mineT <= 0) { this.mineT = .6; sfx.deny(); } }
        else if (look.ore) { biting = true; if (this.mineT <= 0) { this.mineT = quick ? .32 : .42; const n = Math.min(3, look.ore.amount, this.packCap(side) - me.carrying); look.ore.amount -= n; me.carrying += n; this.obj.drilled += n; this.net?.cmd('mn', this.ores.indexOf(look.ore), n); sfx.ore(); this.debris(at, 3, .12, M.ore, 3); this.hud.damage(at, '+' + n, 'ore'); this.oreCheck(look.ore); this.shake = Math.max(this.shake, .12); } }
        else if (look.b && look.b.team === side && !look.b.built) { biting = true; look.b.progress += dt / BLD[look.b.kind].time * 1.6; this.weldAcc += dt; if (this.mineT <= 0) { if (this.net) { this.net.cmd('wd', look.b.id, r1(this.weldAcc * 100) / 100); } this.weldAcc = 0; this.mineT = .16; this.debris(at, 2, .06, veyl ? M.crys : M.spark, 4); } }
        else if (look.b && look.b.team === side && look.b.built && look.b.hp < look.b.maxHp) { biting = true; look.b.hp = Math.min(look.b.maxHp, look.b.hp + 40 * dt); this.weldAcc += dt; if (this.mineT <= 0) { if (this.net) { this.net.cmd('fx', look.b.id, r1(this.weldAcc * 100) / 100); } this.weldAcc = 0; this.mineT = .16; this.debris(at, 2, .06, veyl ? M.crys : M.spark, 4); } }
        else if (look.prop) { biting = true; if (this.mineT <= 0) { this.mineT = .2; this.damageProp(look.prop, 11, me, at); sfx.hit(); } }
        else if ((look.unit && look.unit.team === foe && look.dist < 3) || (look.b && look.b.team === foe && look.dist < 3)) { biting = true; if (this.mineT <= 0) { this.mineT = .25; this.damage((look.unit || look.b)!, 10, me); sfx.hit(); this.debris(at, 2, .08, M.spark, 4); } }
      }
      if (gl) { if (biting) this.jaw = .5 + .5 * Math.sin(this.time * 26); }
      else if (veyl) { const f = this.vm.veyl.userData.flash; f.visible = biting || Math.random() < .3; f.scale.setScalar(biting ? .55 + Math.random() * .25 : .3); } else this.vm.drill.userData.bit.rotation.z += dt * (biting ? 34 : 24); if (biting) this.shake = Math.max(this.shake, .06);
    }
    if (veyl && !drilling) this.vm.veyl.userData.flash.visible = false;
    if (!this.prompt && this.tool === 1 && look && look.dist < 4.2) { if (look.ore) this.prompt = gl ? '<b>Hold click</b> Chew the ore loose' : veyl ? '<b>Hold click</b> Hum the ore loose' : '<b>Hold click</b> Drill ore'; else if (look.prop) this.prompt = `<b>Hold click</b> ${gl ? 'Chew' : veyl ? 'Hum' : 'Drill'} the ${(look.prop.owner || look.prop).name.toLowerCase()} apart`; else if (look.b && look.b.team === side && !look.b.built) this.prompt = gl ? '<b>Hold click</b> Feed it, it grows faster' : veyl ? '<b>Hold click</b> Sing it up faster' : '<b>Hold click</b> Weld it up faster'; else if (look.b && look.b.team === side && look.b.hp < look.b.maxHp) this.prompt = gl ? '<b>Hold click</b> Lick it whole' : veyl ? '<b>Hold click</b> Sing it whole' : '<b>Hold click</b> Patch it up'; }
    if (me.carrying > 0 && !this.prompt && me.carrying >= this.packCap(side) * .5) this.prompt = `${me.carrying} ore in the ${gl ? 'belly' : 'pack'} · bring it to ${fac(side) ? 'a' : 'the'} ${home}`;
    drillSound(drilling && !gl, biting && !gl);   // a Grazer chews; it has no drill to whine
  }
  oreCheck(n: OreNode) { if (n.amount <= 0) { n.obj.traverse((m: any) => { if (m.isMesh && m.material === M.ore) m.material = M.oreDead; }); n.obj.scale.setScalar(.6); } else { n.obj.traverse((m: any) => { if (m.isMesh && m.material === M.oreDead) m.material = M.ore; }); n.obj.scale.setScalar(.75 + .25 * n.amount / n.max); } }

  updateGun(dt: number, P: Set<string>, eye: THREE.Vector3, dir: THREE.Vector3, gun: Weapon) {
    const me = this.me!, heavy = me.kind === 'breacher', S = SHOT[me.kind] || SHOT.linesman, vm = heavy ? this.vm.scatter : this.vm[S.vm], flash = vm.userData.flash; flash.visible = false;
    // grenade (Linesman) and shield bash (Breacher)
    if (me.kind === 'patch' && P.has('KeyC')) { if (this.nadeCd <= 0) { this.nadeCd = this.upOf(me.team).stitch ? 7 : 12; this.patchUp(me); this.net?.cmd('pt'); } else sfx.deny(); }
    if (me.kind === 'linesman' && P.has('KeyC')) { if (this.nadeCd <= 0) { this.nadeCd = this.upOf(me.team).frag ? 5 : 9; const v = V3().copy(dir).multiplyScalar(19); v.y += 4.5; this.shoot(V3().copy(eye).addScaledVector(dir, .7), v, me.team, 75, true, me); sfx.throw(); } else sfx.deny(); }
    if (heavy && this.brace && P.has('Mouse0') && this.bashCd <= 0) {
      this.bashCd = .9; this.bashT = .25; sfx.clang(); this.shake = Math.max(this.shake, .4); let any = false;
      for (const u of this.units) { if (!u.alive || u.team !== foeOf(me.team)) continue; const dx = u.pos.x - me.pos.x, dz = u.pos.z - me.pos.z, d = Math.hypot(dx, dz); if (d > 3.4 + UNIT[u.kind].rad || (dx * dir.x + dz * dir.z) / (d || 1) < .5) continue; this.damage(u, 24, me); const k = u.kind === 'warden' ? 2 : 12; u.kx += dx / (d || 1) * k; u.kz += dz / (d || 1) * k; any = true; }
      if (any) { this.hud.hitmark(false); sfx.hit(); this.hud.damage(V3().copy(eye).addScaledVector(dir, 2), 'WHAM!', 'ko'); }
    }
    if (this.reloadT > 0) { this.reloadT -= dt; if (this.reloadT <= 0) this.ammo = gun.mag; return; }
    if ((P.has('KeyR') && this.ammo < gun.mag) || (this.ammo <= 0 && this.lmb)) { if (this.ammo <= 0) sfx.dry(); this.reloadT = gun.reload; sfx.reload(gun.reload); return; }
    if (this.lmb && this.fireCd <= 0 && this.ammo > 0 && !this.brace) {
      this.fireCd = gun.cd; this.ammo--; flash.visible = true; flash.rotation.z = R(0, 3); const mul = this.gunMul(this.myTeam);
      const muzzle = V3(); flash.getWorldPosition(muzzle);
      if (heavy) {
        this.recoil = 1; this.pitch = Math.min(1.45, this.pitch + .03); this.kick += .024; this.shake = Math.min(1, this.shake + .35); sfx.scatter(); const pay = this.payback; this.payback = 0; this.bloom = 1; if (pay > .3) { this.shake = 1; sfx.clang(); this.hud.damage(V3().copy(eye).addScaledVector(dir, 3), 'PAYBACK!', 'crit'); } let hits = 0, total = 0, last: Unit | Building | null = null, crit = false;
        this.quiet = true;
        for (let i = 0; i < 9; i++) {
          const d = V3().copy(dir); d.x += R(-.075, .075); d.y += R(-.05, .05); d.z += R(-.075, .075); d.normalize();
          let hit = this.ray(eye, d, 34, -1, me); if (hit && ((hit.unit && hit.unit.team === me.team) || (hit.b && hit.b.team === me.team && hit.dist < 3))) hit = this.ray(eye, d, 34, foeOf(me.team), me);
          const dist = hit ? hit.dist : 34, end = V3().copy(eye).addScaledVector(d, dist); if (i % 2 === 0) this.tracer(muzzle, end);
          const fall = dist < 10 ? 1 : Math.max(.3, 1 - (dist - 10) / 24), tgt = hit && (hit.unit && hit.unit.team === foeOf(me.team) ? hit.unit : hit.b && hit.b.team === foeOf(me.team) ? hit.b : null);
          if (tgt) { const dm = (hit!.head ? 9 : 6) * fall * mul * (1 + pay * .8); total += dm; hits++; last = tgt; crit = crit || !!hit!.head; this.fx.aim(end, d); this.damage(tgt, dm, me); if (!isUnit(tgt) && i % 3 === 0) this.fx.surface(end, d, this.surfOf(tgt), .8); } else this.impact(eye, d, hit, end, 6 * fall * mul);
        }
        this.quiet = false;
        if (last) { this.hud.hitmark(crit); sfx.hit(); this.hud.damage(V3(last.pos.x, (isUnit(last) ? UNIT[last.kind].headY : last.h * .6) + .4, last.pos.z), String(Math.round(total)), hits >= 7 ? 'crit' : ''); }
      } else {
        const long = me.kind === 'longshot'; this.recoil = Math.min(1, this.recoil + (long ? 1 : .35)); { const k = S.kick * (1 - this.ads * .5); this.pitch = Math.min(1.45, this.pitch + k); this.kick += k * .8; this.yaw += R(-.0025, .0025); } this.shake = Math.min(1, this.shake + (long ? .4 : .1)); { const low = Math.max(0, 1 - this.ammo / Math.max(1, gun.mag / 4)); long ? sfx.sniper() : me.kind === 'patch' ? sfx.pistol(low) : sfx.rifle(low); }
        const sp = S.sp * (1 - this.ads * S.adsK) * (me.moving ? 1.6 : 1) * (1 + this.bloom * (long ? 0 : 1.2)), d = V3().copy(dir); this.bloom = Math.min(1, this.bloom + (long ? 1 : me.kind === 'patch' ? .2 : .1)); d.x += R(-sp, sp); d.y += R(-sp, sp); d.z += R(-sp, sp); d.normalize();
        let hit = this.ray(eye, d, 150, -1, me);
        // A Patch's rivets mend whoever they hit on their own side.
        if (me.kind === 'patch' && hit?.unit && hit.unit.team === me.team && hit.dist < 60) {
          const o = hit.unit, end = V3().copy(eye).addScaledVector(d, hit.dist); this.tracer(muzzle, end, ringMat, .08);
          if (o.hp < o.maxHp) { if (this.net) this.net.cmd('hl', o.id); else o.hp = Math.min(o.maxHp, o.hp + 10); o.pop = .6; this.puff(end, 3, .35, M.teal, 1.6, .4); this.hud.damage(V3(o.pos.x, UNIT[o.kind].headY + .4, o.pos.z), '+10', 'shield'); this.hud.hitmark(false); sfx.ore(); }
          return;
        }
        if (hit && ((hit.unit && hit.unit.team === me.team) || (hit.b && hit.b.team === me.team && hit.dist < 3))) hit = this.ray(eye, d, 150, foeOf(me.team), me);
        const dist = hit ? hit.dist : 150, end = V3().copy(eye).addScaledVector(d, dist);
        // The Long Rifle goes through: up to two more bodies behind the first, each for a little less.
        if (long && hit?.unit && hit.unit.team === foeOf(me.team)) { let from = hit.unit, at = dist, n = 1, fall = .7; for (let i = 0; i < 2; i++) { const h2 = this.ray(V3().copy(eye).addScaledVector(d, at + .4), d, 60, foeOf(me.team), from); if (!h2?.unit || h2.unit.team !== foeOf(me.team)) break; this.damage(h2.unit, S.body * mul * fall, me); at += .4 + h2.dist; from = h2.unit; fall *= .7; n++; } if (n > 1) { end.copy(eye).addScaledVector(d, at); this.hud.streak(n > 2 ? 'TRIPLE THREAD!' : 'THREADED!'); sfx.crit(); } }
        this.tracer(muzzle, end, tracerMat, long ? .14 : .07);
        if (hit?.unit && hit.unit.team === foeOf(me.team)) { this.fx.aim(end, d); this.damage(hit.unit, (hit.head ? S.head : S.body) * mul, me, !!hit.head); hit.head ? sfx.crit() : sfx.hit(); this.hud.hitmark(!!hit.head); }
        else if (hit?.b && hit.b.team === foeOf(me.team)) { this.damage(hit.b, S.bld * mul, me); this.hud.hitmark(false); this.fx.surface(end, d, this.surfOf(hit.b)); }
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
      if (p.kind === 'plant') this.puff(TMP.set(p.x, .6, p.z), 3, .5, p.dress ? M.dust : M.violet, 1, .6);
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
      const w = this.wrecks[i], b = w.b, o = b.obj, veyl = fac(b.team) !== 0; w.t += dt; const k = Math.min(1, w.t / w.dur); w.puffT -= dt;
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
    let n = 0; for (const o of this.own(undefined, u.team)) { if (Math.hypot(o.pos.x - u.pos.x, o.pos.z - u.pos.z) > 9 || o.hp >= o.maxHp) continue; o.hp = Math.min(o.maxHp, o.hp + 45); n++; if (o !== u) this.puff(TMP.set(o.pos.x, UNIT[o.kind].bodyY + .4, o.pos.z), 3, .3, M.teal, 1.8, .5); }
    for (let i = 0; i < 12; i++) { const a = i / 12 * 6.283; this.puff(TMP.set(u.pos.x + Math.cos(a) * 4.5, .3, u.pos.z + Math.sin(a) * 4.5), 1, .35, M.teal, 1.2, .3); } sfx.built(); if (u === this.me) this.hud.damage(V3(u.pos.x + Math.sin(this.yaw) * 2, 1.8, u.pos.z + Math.cos(this.yaw) * 2), n ? `PATCHED ×${n}` : 'ALL GOOD', 'shield');
  }
  /** A small shell burst: splash damage without the full explosion fanfare. */
  burst(p: THREE.Vector3, dmg: number, radius: number, from: Unit | null, skip: Unit | Building | null = null) {
    const foe = from ? foeOf(from.team) : SIDE.out; for (const u of this.units) { if (!u.alive || u.team !== foe || u === skip) continue; const d = Math.hypot(u.pos.x - p.x, u.pos.z - p.z); if (d > radius + UNIT[u.kind].rad || Math.abs(p.y - UNIT[u.kind].bodyY) > radius + 1.5) continue; const k = 1 - .6 * Math.min(1, d / radius); this.damage(u, dmg * k, from); if (d > .1 && u.kind !== 'warden') { u.kx += (u.pos.x - p.x) / d * 4 * k; u.kz += (u.pos.z - p.z) / d * 4 * k; } }
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
    if (P.has('KeyC')) { if (this.nadeCd <= 0) { this.nadeCd = this.upOf(me.team).servo ? 6 : 10; this.stomp(me); } else sfx.deny(); }
    if (P.has('Mouse2')) {
      // Right click: both barrels lob a shell that bursts where it lands.
      if (this.salvoCd <= 0) { this.salvoCd = 7; this.recoil = 1; this.kick += .03; this.shake = 1; this.bloom = 1; sfx.cannon(); sfx.boom(.35); const rx = Math.cos(this.yaw), rz = -Math.sin(this.yaw); for (const sd of [-1, 1]) { const v = V3().copy(dir).multiplyScalar(30); v.x += rx * sd * 1.3; v.z += rz * sd * 1.3; v.y += 3.2; this.shoot(V3(eye.x + dir.x * 1.6 + rx * sd * .9, eye.y - .5, eye.z + dir.z * 1.6 + rz * sd * .9), v, me.team, 70, true, me); } vm.userData.flash.visible = vm.userData.flashL.visible = true; }
      else sfx.deny();
    }
    if (this.reloadT > 0) { this.reloadT -= dt; if (this.reloadT <= 0) this.ammo = gun.mag; return; }
    if ((P.has('KeyR') && this.ammo < gun.mag) || (this.ammo <= 0 && this.lmb)) { if (this.ammo <= 0) sfx.dry(); this.reloadT = gun.reload; sfx.reload(gun.reload); return; }
    if (this.lmb && this.fireCd <= 0 && this.ammo > 0) {
      this.fireCd = gun.cd; this.ammo--; this.side = -this.side; const flash = this.side > 0 ? vm.userData.flash : vm.userData.flashL; flash.visible = true; flash.rotation.z = R(0, 3);
      const mul = this.gunMul(this.myTeam), muzzle = V3(); flash.getWorldPosition(muzzle);
      this.recoil = 1; this.pitch = Math.min(1.45, this.pitch + .012); this.kick += .01; this.shake = Math.min(1, this.shake + .22); this.bloom = Math.min(1, this.bloom + .3); sfx.cannon();
      const sp = .012, d = V3().copy(dir); d.x += R(-sp, sp); d.y += R(-sp, sp); d.z += R(-sp, sp); d.normalize();
      let hit = this.ray(eye, d, 140, -1, me); if (hit && ((hit.unit && hit.unit.team === me.team) || (hit.b && hit.b.team === me.team && hit.dist < 4))) hit = this.ray(eye, d, 140, foeOf(me.team), me);
      let dist = hit ? hit.dist : 140; if (!hit && d.y < 0) dist = Math.min(dist, -eye.y / d.y);
      const end = V3().copy(eye).addScaledVector(d, dist); this.tracer(muzzle, end, tracerMat, .16);
      const tgt = hit && (hit.unit && hit.unit.team === foeOf(me.team) ? hit.unit : hit.b && hit.b.team === foeOf(me.team) ? hit.b : null);
      if (tgt) { this.fx.aim(end, d); this.damage(tgt, (hit!.head ? 34 : 22) * mul, me, !!hit!.head); this.hud.hitmark(!!hit!.head); hit!.head ? sfx.crit() : sfx.hit(); }
      if (hit?.prop) this.damageProp(hit.prop, 22 * mul, me, end);
      if (dist < 139) this.burst(end, 14 * mul, 3.2, me, tgt);
    }
  }
  impact(eye: THREE.Vector3, d: THREE.Vector3, hit: Hit | null, end: THREE.Vector3, dmg = 7) {
    if (hit?.prop) { this.fx.surface(end, d, this.surfOf(hit.prop)); this.damageProp(hit.prop, dmg, this.me, end); return; }
    if (!hit && d.y < 0) { const t = -eye.y / d.y; if (t < 150) end.copy(eye).addScaledVector(d, t); else return; } else if (!hit) return;
    this.fx.surface(end, d, !hit ? 'dirt' : hit.ore ? 'rock' : hit.b ? this.surfOf(hit.b) : 'metal');
  }
  /** What a bullet finds when it lands on a building or a piece of scenery. */
  surfOf(x: Building | Prop): Surface { if ('ranges' in x) { const k = (x.owner || x).kind; return k === 'metal' || k === 'barrel' ? 'metal' : k === 'crystal' || k === 'veyl' ? 'crystal' : k === 'plant' ? 'plant' : 'rock'; } const f = fac(x.team); return f === 2 ? 'flesh' : f === 1 ? 'crystal' : 'metal'; }
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
    for (const u of us) {
      if (!u.alive) continue; if (u.carrying > 0 && (u === me || u.pilot)) { const hq = this.nearHQ(u.pos.x, u.pos.z, u.team); if (hq && this.distToBox(hq, u.pos.x, u.pos.z) < 2.6 + this.bankReach(hq)) this.bank(u); } if (u !== me) u.moving = false; u.cd -= dt; u.think -= dt; u.swing = Math.max(0, u.swing - dt * 4); u.flashT -= dt; u.pop = Math.max(0, u.pop - dt * 7);
      if (u.maxShield && t - u.lastHit > 5) u.shield = Math.min(u.maxShield, u.shield + 14 * (fac(u.team) === 1 && this.upOf(u.team).vbloom ? 2 : 1) * dt);
      if (fac(u.team) === 2 && u.hp < u.maxHp && t - u.lastHit > 3 && this.carpet.on(u.pos.x, u.pos.z, 0, u.team)) u.hp = Math.min(u.maxHp, u.hp + Math.max(G_TUNE.bloomHeal, u.maxHp * .01) * (this.carpet.isDeep(u.team) ? 2 : 1) * dt);
      if (fac(u.team) === 0 && this.upOf(u.team).weld && u.hp < u.maxHp && t - u.lastHit > 8) u.hp = Math.min(u.maxHp, u.hp + u.maxHp * .02 * dt);
      if (u.kx || u.kz) { u.pos.x += u.kx * dt; u.pos.z += u.kz * dt; const k = Math.max(0, 1 - dt * 7); u.kx *= k; u.kz *= k; if (Math.abs(u.kx) + Math.abs(u.kz) < .05) u.kx = u.kz = 0; this.collide(u, u.pos.x, u.pos.z); }
      if (fac(u.team) === 0 && u.hp < u.maxHp && t - u.lastHit > 5) for (const b of this.buildings) if (b.team === u.team && b.built && (b.kind === 'depot' || b.kind === 'headframe') && Math.abs(b.pos.x - u.pos.x) < 16 && Math.abs(b.pos.z - u.pos.z) < 16) { u.hp = Math.min(u.maxHp, u.hp + 5 * dt); break; }
      if (u.pilot) { u.kx = u.kz = 0; if (u.hp < u.maxHp && t - u.lastHit > 6) u.hp = Math.min(u.maxHp, u.hp + u.maxHp * .05 * dt); }
      else if (u !== me || this.staticT > 0) { if (u.order.type === 'scout') this.intel.walk(u, dt); else if (isWorker(u.kind)) this.aiRigger(u, dt); else if (fac(u.team) === 0) this.aiSoldier(u, dt); else if (fac(u.team) === 2) aiGloam(this, u, dt); else if (u.kind === 'cantor') this.aiCantor(u, dt); else if (u.kind === 'lancer') this.aiLancer(u, dt); else this.aiWarden(u, dt); }
    }
    // keep bodies apart
    for (let i = 0; i < us.length; i++) { const a = us[i]; if (!a.alive) continue; const ra = UNIT[a.kind].rad; for (let j = i + 1; j < us.length; j++) { const b = us[j]; if (!b.alive) continue; const dx = b.pos.x - a.pos.x; if (dx > 4 || dx < -4) continue; const dz = b.pos.z - a.pos.z, mine = a === me || b === me, lim = (ra + UNIT[b.kind].rad) * (mine ? (a.team === b.team ? 1.8 : 1.25) : 1.12), d2 = dx * dx + dz * dz; if (d2 < lim * lim && d2 > 1e-5) { const d = Math.sqrt(d2), p = (lim - d) * .5; const wa = a === me || a.pilot ? 0 : b.kind === 'warden' ? 2 : mine ? 2 : 1, wb = b === me || b.pilot ? 0 : a.kind === 'warden' ? 2 : mine ? 2 : 1; a.pos.x -= dx / d * p * wa; a.pos.z -= dz / d * p * wa; b.pos.x += dx / d * p * wb; b.pos.z += dz / d * p * wb; } } }
    this.poseUnits(dt);
  }
  /** Turns each unit's state into a pose: legs, arms, bob and muzzle flash. */
  poseUnits(dt: number) {
    const us = this.units, t = this.time; this.fx.pre(); this.stance.pre();
    T.look(this.units, (u: Unit) => SIGHT[u.kind] || 30, (x, z, r) => { let m = 0; for (const u of us) if (u.alive && Math.abs(u.pos.x - x) < r && Math.abs(u.pos.z - z) < r && Math.hypot(u.pos.x - x, u.pos.z - z) < r) m |= 1 << u.team; return m; }, this.time);   // terrain (J)
    for (const u of us) {
      if (!u.alive) continue; const r = u.rig, o = u.obj; o.position.x = u.pos.x; o.position.z = u.pos.z;
      let dy = u.yaw - o.rotation.y; dy = Math.atan2(Math.sin(dy), Math.cos(dy)); o.rotation.y += dy * Math.min(1, dt * 12);
      if (u.moving) u.phase += dt * (u.kind === 'gantry' ? 6.5 : u.kind === 'breacher' ? 9 : u.kind === 'mulcher' ? 6 : fac(u.team) === 2 ? 15 : 11); const amp = u.moving ? .75 : 0, ease = Math.min(1, dt * 14), base = u.kind === 'breacher' ? 1.14 : 1, sc = base * (1 + u.pop * .1);
      o.scale.set(sc, base * (1 - u.pop * .06), sc);
      if (fac(u.team) === 2) {
        poseLegs(o, u.phase, u.moving, ease); o.position.y = u.moving ? Math.abs(Math.sin(u.phase)) * .05 : 0;
        const working = u.state === 'mining' || u.state === 'build' || u.state === 'repair';
        r.body.rotation.x += ((u.moving ? (u.dashT > 0 ? .25 : .06) : 0) - u.pop * .12 - (u.wind > 0 ? .25 : 0) + u.swing * .2 - r.body.rotation.x) * ease; r.body.rotation.z = u.moving ? Math.sin(u.phase * 2) * .03 : 0;
        if (r.head) { r.head.rotation.x = working ? Math.sin(t * 22 + u.id) * .12 + .15 : u.swing * .35; r.head.rotation.y += -r.head.rotation.y * Math.min(1, dt * 4); }
        if (r.flash) r.flash.visible = u.flashT > 0;
        if (u.kind === 'blister') { const k = 1 + Math.sin(t * 7 + u.id) * .04 + (u.target ? .05 : 0); o.scale.set(sc * k, sc * k, sc * k); }
      } else if (r.legL && r.legR) {
        const s = Math.sin(u.phase) * amp; r.legL.rotation.x += (s - r.legL.rotation.x) * ease; r.legR.rotation.x += (-s - r.legR.rotation.x) * ease; o.position.y = u.moving ? Math.abs(Math.cos(u.phase)) * .07 : 0;
        const working = u.state === 'mining' || u.state === 'build' || u.state === 'repair';
        r.body.rotation.x += ((u.moving ? .1 : working ? .16 : 0) - u.pop * .12 - r.body.rotation.x) * ease; r.body.rotation.z = u.moving ? Math.sin(u.phase) * .04 : 0;
        if (r.head) r.head.rotation.y += -r.head.rotation.y * Math.min(1, dt * 4);
        if (u.kind === 'rigger') { if (r.armL) r.armL.rotation.x += (-s * .8 - r.armL.rotation.x) * ease; if (r.armR) r.armR.rotation.x = working ? -.5 + Math.sin(t * 34 + u.id) * .05 : s * .3; }
        else { if (r.arms) { r.arms.rotation.x += (-u.pitch * .8 + (u.moving && !u.target ? .25 : 0) - u.swing * .1 - r.arms.rotation.x) * ease; r.arms.position.z = .05 - u.swing * .1; } if (r.armL) r.armL.rotation.x = u.moving ? Math.sin(u.phase) * .12 : 0; if (r.flash) { r.flash.visible = u.flashT > 0; if (u.flashT > 0) r.flash.rotation.z = t * 40; } }
      } else {
        const big = u.kind === 'warden'; o.position.y = (big ? .3 : .12) + Math.sin(t * (big ? 1.4 : 2.4) + u.id) * (big ? .12 : .07);
        r.body.rotation.x += ((u.moving ? (u.dashT > 0 ? .5 : .16) : 0) - u.pop * .1 - r.body.rotation.x) * ease; if (r.halo) r.halo.rotation.z += dt * (u.wind > 0 ? 9 : 1.6);
        if (u.kind === 'cantor' && r.armR) r.armR.rotation.x = -u.swing * 1.7;
        if (u.kind === 'tender') { const work = u.state === 'mining' || u.state === 'build' || u.state === 'repair'; if (r.armR) r.armR.rotation.x += ((work ? -1.1 + Math.sin(t * 31 + u.id) * .07 : -u.swing * 1.3) - r.armR.rotation.x) * ease; if (r.armL) r.armL.rotation.x += ((work ? -.5 : u.moving ? Math.sin(u.phase) * .3 : 0) - r.armL.rotation.x) * ease; }
        if (u.kind === 'lancer') { if (r.arms) r.arms.rotation.x = -u.pitch; if (r.flash) { r.flash.visible = u.wind > 0; const k = u.wind > 0 ? 1.4 - u.wind : 0; r.flash.scale.setScalar(Math.max(.01, k)); r.flash.rotation.z = t * 9; } }
        if (big && r.armL && r.armR) { const k = u.wind > 0 ? Math.min(1, (1 - u.wind / .9) * 1.4) : 0; const a = u.wind > 0 ? -2.4 * k : u.swing * .9; r.armL.rotation.x += (a - r.armL.rotation.x) * Math.min(1, dt * 18); r.armR.rotation.x = r.armL.rotation.x; }
      }
    }
    for (const u of us) if (u.alive) { if (this.net) u.pos.y = T.h(u.pos.x, u.pos.z); u.obj.position.y += u.pos.y; }   // terrain (J): stand on the ground's height
    this.stance.post(dt); this.fx.post(dt);
  }
  /** A worker the AI drives: a Rigger or a Tender. Builds what it was sent to, otherwise mines the best seam and carries the ore home. */
  aiRigger(u: Unit, dt: number) {
    const side = u.team, hq = this.nearHQ(u.pos.x, u.pos.z, side), up = this.upOf(side), quick = fac(side) === 2 ? up.gtongue : fac(side) ? up.vhum : up.drill;
    if (u.site && (!u.site.alive || (u.site.built && u.site.hp >= u.site.maxHp))) { u.site.builder = null; u.site = null; u.state = 'idle'; }
    if (u.site) {
      const b = u.site, gap = this.distToBox(b, u.pos.x, u.pos.z);
      if (gap > 1.6) {
        // Walking to a site with no paths: wedged behind another building it can press on for ever (a Depot site stayed at 0% for 25 minutes and
        // capped the yard's supply). No headway in three seconds means a detour to the side for a moment.
        const w = u as Unit & { siteGap?: number; detT?: number };
        if (u.state !== 'toSite') { u.state = 'toSite'; u.timer = 3; w.siteGap = gap; w.detT = 0; }
        if ((w.detT || 0) > 0) { w.detT! -= dt; this.moveTo(u, u.windX, u.windZ, dt, .5); return; }
        u.timer -= dt; if (u.timer <= 0) { if (gap > (w.siteGap ?? 1e9) - 1) { const dx = b.pos.x - u.pos.x, dz = b.pos.z - u.pos.z, l = Math.hypot(dx, dz) || 1, sg = u.id % 2 ? 1 : -1; u.windX = u.pos.x - dz / l * 7 * sg - dx / l * 2; u.windZ = u.pos.z + dx / l * 7 * sg - dz / l * 2; w.detT = 1.6; } u.timer = 3; w.siteGap = gap; }
        this.moveTo(u, b.pos.x, b.pos.z, dt); }
      else { u.state = b.built ? 'repair' : 'build'; u.yaw = Math.atan2(b.pos.x - u.pos.x, b.pos.z - u.pos.z); if (b.built) b.hp = Math.min(b.maxHp, b.hp + 16 * dt); else b.progress += dt / BLD[b.kind].time; if (u.think <= 0) { u.think = .2; this.debris(TMP.set(u.pos.x + Math.sin(u.yaw) * .9, 1, u.pos.z + Math.cos(u.yaw) * .9), 1, .06, fac(side) ? M.crys : M.spark, 3); } }
      return;
    }
    // A Tender is no fighter, and with two economies neither is a Rigger: one with enemy fighters close by runs the other way for a few seconds, pack and all.
    // Only a fighter that is fighting counts: one standing still by the seam used to keep a whole bot economy running in circles, and called no guards.
    if ((side || this.eco) && u.state !== 'flee' && u.think <= 0) { const th = this.units.find(e => e.alive && e.team !== side && isFighter(e) && (e.target || e.swing > .3 || e.flashT > 0) && Math.hypot(e.pos.x - u.pos.x, e.pos.z - u.pos.z) < 11); if (th) { const dx = u.pos.x - th.pos.x, dz = u.pos.z - th.pos.z, l = Math.hypot(dx, dz) || 1; u.windX = u.pos.x + dx / l * 18; u.windZ = u.pos.z + dz / l * 18; u.state = 'flee'; u.timer = 3; for (const c of this.units) if (c.alive && c.team === side && !c.pilot && c !== this.me && !c.target && c.order.type === 'guard' && isFighter(c) && c.pos.distanceTo(u.pos) < 45) c.target = th; } }
    if (u.state === 'flee') { u.timer -= dt; this.moveTo(u, u.windX, u.windZ, dt, 1); if (u.timer <= 0) u.state = u.carrying > 0 ? 'toHQ' : 'idle'; return; }
    // A seam right under the enemy's guns is not worth the walk.
    if (u.state === 'idle' || (u.node && u.node.amount <= 0 && u.state !== 'toHQ')) { let best: OreNode | null = null, bd = 1e9; for (const n of this.ores) { if (n.amount <= 0 || this.buildings.some(b => b.alive && b.team !== side && Math.hypot(b.pos.x - n.pos.x, b.pos.z - n.pos.z) < 30)) continue; const d = n.pos.distanceTo(u.pos) + (this.units.filter(o => o.node === n).length) * 6 + (hq ? (() => { const h = this.nearHQ(n.pos.x, n.pos.z, side)!; return Math.hypot(n.pos.x - h.pos.x, n.pos.z - h.pos.z) * .6; })() : 0); if (d < bd) { bd = d; best = n; } } u.node = best; u.state = best ? 'toOre' : 'wait'; }
    if (u.state === 'toOre' && u.node) { if (this.moveTo(u, u.node.pos.x, u.node.pos.z, dt, 2.5)) { u.state = 'mining'; u.timer = 3; } }
    else if (u.state === 'mining' && u.node) { u.yaw = Math.atan2(u.node.pos.x - u.pos.x, u.node.pos.z - u.pos.z); u.timer -= dt * (quick ? 1.3 : 1); if (u.think <= 0) { u.think = .5; if (this.vol(u.pos) > .3) this.debris(TMP.set(u.pos.x + Math.sin(u.yaw) * 1.1, 1, u.pos.z + Math.cos(u.yaw) * 1.1), 1, .1, M.ore, 3); } if (u.timer <= 0) { const n = Math.min((fac(side) === 0 && up.buckets) || (fac(side) === 2 && up.ggut) ? 10 : 7, u.node.amount); u.node.amount -= n; u.carrying = Math.round(n * (u.node.rich || 1)) /* terrain (J): bright seams */; this.oreCheck(u.node); if (u.rig.pack) u.rig.pack.visible = true; u.state = 'toHQ'; } }
    else if (u.state === 'toHQ') { if (!hq) { u.state = 'wait'; return; } if (this.distToBox(hq, u.pos.x, u.pos.z) < 1.7 + this.bankReach(hq)) { this.purse[side] += u.carrying * this.oreK(side); if (!atHome(side)) this.stats.minedV += u.carrying; else this.stats.mined += u.carrying; u.carrying = 0; if (u.rig.pack) u.rig.pack.visible = false; u.state = 'idle'; } else { /* Walk to the near face of the home building, so neither end of the map has a longer walk round it than the other. */ const x = Math.max(hq.pos.x - hq.hx - .8, Math.min(hq.pos.x + hq.hx + .8, u.pos.x)), z = Math.max(hq.pos.z - hq.hz - .8, Math.min(hq.pos.z + hq.hz + .8, u.pos.z)); this.moveTo(u, x, z, dt, .3); } }
  }
  acquire(u: Unit, range: number, bRange: number) {
    if (this.truce) return null;
    let best: Unit | Building | null = null, bd = range;
    // Not simply the nearest: fighters go for healers, marksmen and the wounded first, and think twice about a raised shield.
    let bs = 1e9;
    for (const o of this.units) {
      if (!o.alive || o.team === u.team) continue; const dx = o.pos.x - u.pos.x, dz = o.pos.z - u.pos.z; if (dx > range || dx < -range || dz > range || dz < -range) continue; const d = Math.hypot(dx, dz); if (d >= range) continue;
      if (!T.sees(u.team, u.pos.y, o.pos.x, o.pos.z, o.pos.y)) continue;   // terrain (J): nobody shoots at what is up a cliff out of sight
      const k = o.kind, w = (fac(o.team) === 0 ? (k === 'patch' ? .6 : k === 'longshot' ? .7 : k === 'breacher' ? 1.25 : k === 'rigger' ? 1.15 : 1) : (k === 'lancer' ? .8 : k === 'warden' ? 1.1 : 1)) * (o.hp < o.maxHp * .4 ? .75 : 1) * (o === u.target ? .85 : 1);
      const sc = (d + 4) * w; if (sc < bs) { bs = sc; bd = d; best = o; }
    }
    if (!best && bRange > 0) { bd = bRange; for (const b of this.buildings) { if (!b.alive || b.team === u.team || !T.sees(u.team, u.pos.y, b.pos.x, b.pos.z, b.pos.y) /* terrain (J) */) continue; const d = this.distToBox(b, u.pos.x, u.pos.z); if (d < bd) { bd = d; best = b; } } }
    return best;
  }
  aimAt(u: Unit, t: Unit | Building, fromY: number) { const ty = isUnit(t) ? UNIT[t.kind].bodyY : Math.min(t.h * .5, 3), d = Math.hypot(t.pos.x - u.pos.x, t.pos.z - u.pos.z); u.yaw = Math.atan2(t.pos.x - u.pos.x, t.pos.z - u.pos.z); u.pitch += (Math.atan2(ty - fromY, d) - u.pitch) * .3; return ty; }
  aiMend(u: Unit, dt: number) {
    if (u.think <= 0) { let best: Unit | null = null, br = .85; for (const o of this.own(undefined, u.team)) { if (o === u || o.hp >= o.maxHp) continue; const d = Math.hypot(o.pos.x - u.pos.x, o.pos.z - u.pos.z); if (d > 13) continue; const r = o.hp / o.maxHp; if (r < br) { br = r; best = o; } } u.mend = best; }
    const m = u.mend; if (!m || !m.alive || m.hp >= m.maxHp) { u.mend = null; return; }
    const d = Math.hypot(m.pos.x - u.pos.x, m.pos.z - u.pos.z); if (d > 14) { u.mend = null; return; }
    m.hp = Math.min(m.maxHp, m.hp + (this.upOf(u.team).stitch ? 24 : 15) * dt); u.timer -= dt;
    if (u.timer <= 0) { u.timer = .3; this.tracer(V3(u.pos.x, 1.2, u.pos.z), V3(m.pos.x, UNIT[m.kind].bodyY, m.pos.z), ringMat, .06); this.puff(TMP.set(m.pos.x + R(-.3, .3), UNIT[m.kind].bodyY + .3, m.pos.z + R(-.3, .3)), 1, .28, M.teal, 1.8, .3); }
  }
  aiSoldier(u: Unit, dt: number) {
    const heavy = u.kind === 'breacher', big = u.kind === 'gantry', long = u.kind === 'longshot', doc = u.kind === 'patch', up = this.upOf(u.team), glass = long && up.glass, range = big ? 24 : long ? (glass ? 44 : 36) : doc ? 15 : heavy ? 10 : 19;
    if (doc) this.aiMend(u, dt);
    // Hurt guards used to walk off to a Patch, Depot or the Headframe at 35% health and come back mended. With a tower covering the walk, a
    // defending Ironhold line almost never lost a body: it was the largest single reason the Veyl lost 52 of 60 bot matches (21-9 with it,
    // 13-16 without). They hold the line now; a Patch, a Depot or the Headframe still mends whoever is standing near it.
    if (u.think <= 0) { u.think = .3; u.target = this.acquire(u, long ? (glass ? 52 : 44) : 30, u.order.type === 'guard' ? 0 : 28); }
    const t = u.target;
    if (t && t.alive) {
      const isB = !isUnit(t), d = isB ? this.distToBox(t as Building, u.pos.x, u.pos.z) : t.pos.distanceTo(u.pos), ty = this.aimAt(u, t, 1.1);
      if (d > range) this.moveTo(u, t.pos.x, t.pos.z, dt, 1, heavy ? 1.15 : 1);
      else if (u.cd <= 0) {
        const mul = this.gunMul(u.team), a = V3(u.pos.x + Math.sin(u.yaw) * 1.1, 1.0, u.pos.z + Math.cos(u.yaw) * 1.1); u.swing = 1; u.flashT = .07;
        if (big) { u.cd = .8 + R(0, .15); a.y = 2.3; const b = V3(t.pos.x + R(-.8, .8), isB ? ty : .3, t.pos.z + R(-.8, .8)); this.tracer(a, b, tracerMat, .16); sfx.blast(this.vol(u.pos) * .6); this.damage(t, (isB ? 16 : 12) * mul, u); this.burst(b, 12 * mul, 3.2, u, t); if (this.time > u.dashCd && !isB && d < 6) { u.dashCd = this.time + (up.servo ? 7 : 12); this.stomp(u); } }
        else if (heavy) { u.cd = 1.05 + R(0, .2); let dm = 0; for (let i = 0; i < 5; i++) { const hit = isB || Math.random() < .7; if (hit) dm += isB ? 4 : 6; if (i % 2 === 0) this.tracer(a, V3(t.pos.x + R(-1, 1), ty + R(-.6, .6), t.pos.z + R(-1, 1))); } sfx.blast(this.vol(u.pos) * .5); this.damage(t, dm * mul, u); }
        else if (long) { u.cd = 1.7 + R(0, .3); const hit = isB || Math.random() < (d < 12 ? .4 : .85), b = V3(t.pos.x, ty + .3, t.pos.z); if (!hit) b.add(TMP.set(R(-1.5, 1.5), R(0, 1.5), R(-1.5, 1.5))); this.tracer(a, b, tracerMat, .13); sfx.blast(this.vol(u.pos) * .5); if (hit) this.damage(t, (isB ? 18 : 52) * mul * (glass ? 1.15 : 1), u); }
        else if (doc) { u.cd = .55 + R(0, .1); const hit = isB || Math.random() < .6, b = V3(t.pos.x, ty, t.pos.z); this.tracer(a, b); sfx.shot(this.vol(u.pos) * .35); if (hit) this.damage(t, 5 * mul, u); }
        else if (!isB && d > 9 && d < 24 && this.time > u.dashCd && this.units.filter(o => o.alive && o.team !== u.team && Math.abs(o.pos.x - t.pos.x) < 4.5 && Math.abs(o.pos.z - t.pos.z) < 4.5).length >= 3) {
          // three or more bunched up: a Linesman lobs a grenade into the middle of them
          u.dashCd = this.time + (up.frag ? 9 : 15); u.cd = .7; const hs = Math.max(8, Math.min(19, d * 1.05)), v = V3((t.pos.x - u.pos.x) / d * hs, 4.5, (t.pos.z - u.pos.z) / d * hs); this.shoot(V3(u.pos.x, 1.5, u.pos.z).addScaledVector(v, .04), v, u.team, 60, true, u); if (this.vol(u.pos) > .3) sfx.throw();
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
    if (u.state === 'flee') { u.timer -= dt; const st = this.ownB(FACTION[u.team].hq, true, u.team)[0]; if (u.timer <= 0 || !st || u.shield > u.maxShield * .7) { u.state = 'idle'; return false; } u.target = null; this.moveTo(u, st.pos.x + ((u.id % 5) - 2) * 2, st.pos.z + ((u.id % 3) - 1) * 3, dt, 3, 1.15); return true; }
    if (u.order.type === 'guard' && this.dir.alarmT <= 0 && u.maxShield && u.shield <= 0 && u.hp < u.maxHp * .4 && !u.fled && this.ownB(FACTION[u.team].hq, true, u.team).length) { u.fled = true; u.state = 'flee'; u.timer = 7; return true; }
    return false;
  }
  /** A Veyl body with nothing to fight: walks its order, or keeps up with whoever it was told to follow. */
  vIdle(u: Unit, dt: number, stop: number, mul: number) {
    const o = u.order; if (o.type !== 'follow') { this.advance(u, dt, stop, mul); return; }
    if (o.lead && !o.lead.alive && o.lead.pilot) { const nb = this.units.find(x => x.alive && x.pilot === o.lead!.pilot && x.team === u.team); if (nb) o.lead = nb; }
    const lead = o.lead?.alive ? o.lead : null; if (!lead) { o.type = 'guard'; o.x = u.pos.x; o.z = u.pos.z; return; }
    const a = u.slot * 2.4, r = 3.2 + (u.slot % 3) * 1.2 + (u.kind === 'warden' ? 2 : 0), tx = lead.pos.x + Math.cos(a) * r, tz = lead.pos.z + Math.sin(a) * r; if (Math.hypot(tx - u.pos.x, tz - u.pos.z) > 1.8) this.moveTo(u, tx, tz, dt, .5, 1.3);
  }
  aiCantor(u: Unit, dt: number) {
    if (this.leash(u, dt)) return;
    u.dashCd -= dt; u.dashT -= dt; if (this.aiFallBack(u, dt)) return;
    if (u.think <= 0) { u.think = .3; const raid = u.order.type === 'raid' || u.order.type === 'amove', cur = u.target; // A Cantor on the march only looked 22 m ahead, while rifles reach 38 and a Watchpost 34: a push walked on at its target building while the
      // defenders shot it for free (Veyl pushes lost twice what they killed and broke 3 buildings in 33 tries). One that is being hit goes for whoever is in reach.
      if (!cur || !cur.alive || !isUnit(cur)) u.target = this.acquire(u, raid ? (this.time - u.lastHit < 2 ? 40 : 22) : 28, raid && !(u.order.path && u.order.path.length) ? 14 : 0); }
    const t = u.target;
    if (t && t.alive) {
      const isB = !isUnit(t), d = isB ? this.distToBox(t as Building, u.pos.x, u.pos.z) : t.pos.distanceTo(u.pos);
      if (!isB && d > 45) { u.target = null; return; }
      if (d > (isB ? 1.3 : 1.7 + UNIT[(t as Unit).kind].rad * .5)) { if (d > 6 && d < 13 && u.dashCd <= 0) { u.dashT = .4; u.dashCd = 3.5; this.puff(TMP.copy(u.pos).setY(.5), 3, .7, M.teal, .4); sfx.dash(this.vol(u.pos)); } 
        // closing on someone with a gun, a Cantor weaves instead of running down the barrel
        let wx = 0, wz = 0; if (!isB && d > 7 && u.dashT <= 0) { const k = Math.sin(this.time * 3.1 + u.id * 1.7) * Math.min(4.5, d * .3), nx = -(t.pos.z - u.pos.z) / d, nz = (t.pos.x - u.pos.x) / d; wx = nx * k; wz = nz * k; }
        this.moveTo(u, t.pos.x + wx, t.pos.z + wz, dt, .5, u.dashT > 0 ? 2.6 : 1); }
      else { u.yaw = Math.atan2(t.pos.x - u.pos.x, t.pos.z - u.pos.z); if (u.cd <= 0) { u.cd = .95; u.swing = 1; sfx.slash(this.vol(u.pos)); const d = (isB ? 10 : 13) * this.vMul(u.team); this.damage(t, d, u);
        // The sweep carries on through whatever is pressed up against the target: half the cut to two more bodies inside the arc. Against a spread
        // rifle line it finds nobody; against a swarm at its ankles it is the only thing that keeps a Cantor worth its ore.
        if (!isB) { let n = 0; for (const o of this.units) { if (n >= CLEAVE.n) break; if (o === t || !o.alive || o.team === u.team || Math.hypot(o.pos.x - t.pos.x, o.pos.z - t.pos.z) > 1.9 || Math.hypot(o.pos.x - u.pos.x, o.pos.z - u.pos.z) > 3.4) continue; n++; this.damage(o, d * .5, u); } } } }
      return;
    }
    this.vIdle(u, dt, u.order.type === 'raid' ? 3 : 1.5, u.order.type !== 'guard' || this.dir.alarmT > 0 ? 1 : .6);
  }
  aiLancer(u: Unit, dt: number) {
    if (this.leash(u, dt)) return;
    if (u.wind <= 0 && this.aiFallBack(u, dt)) return;
    if (u.wind > 0) {
      u.wind -= dt; const t = u.target; if (t && t.alive) this.aimAt(u, t, 1.5);
      if (u.wind <= 0) { u.cd = 2 + R(0, .4); if (t && t.alive) { const from = V3(u.pos.x + Math.sin(u.yaw) * 2, 1.5, u.pos.z + Math.cos(u.yaw) * 2), ty = isUnit(t) ? UNIT[t.kind].bodyY : Math.min(t.h * .5, 3), v = V3(t.pos.x - from.x, ty - from.y, t.pos.z - from.z).normalize().multiplyScalar(30); this.shoot(from, v, u.team, 20 * this.vMul(u.team) * (this.eco && this.upOf(u.team).vbreath ? 1.15 : 1), false, u); sfx.zap(this.vol(u.pos)); u.swing = 1; } }
      return;
    }
    if (u.think <= 0) { u.think = .35; const raid = u.order.type === 'raid' || u.order.type === 'amove'; u.target = this.acquire(u, this.eco && this.upOf(u.team).vbreath ? 40 : 34, raid && !(u.order.path && u.order.path.length) ? 24 : 0); }
    const t = u.target;
    if (t && t.alive) {
      const isB = !isUnit(t), d = isB ? this.distToBox(t as Building, u.pos.x, u.pos.z) : t.pos.distanceTo(u.pos); this.aimAt(u, t, 1.5);
      if (d > (this.eco && this.upOf(u.team).vbreath ? 30 : 25)) this.moveTo(u, t.pos.x, t.pos.z, dt);
      else if (!isB && d < 9) { const ax = u.pos.x - t.pos.x, az = u.pos.z - t.pos.z, l = Math.hypot(ax, az) || 1; this.moveTo(u, u.pos.x + ax / l * 4, u.pos.z + az / l * 4, dt, .2, .9); u.yaw = Math.atan2(-ax, -az); if (u.cd <= 0) u.wind = .55; }
      else if (u.cd <= 0) u.wind = .7;
      else if (!isB) this.takeCover(u, t as Unit, dt);
      return;
    }
    u.cover = null; u.pitch *= .9; this.vIdle(u, dt, u.order.type === 'raid' ? 6 : 1.5, u.order.type !== 'guard' || this.dir.alarmT > 0 ? 1 : .6);
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
    if (u.wind > 0) { u.wind -= dt; if (u.wind <= 0) { u.cd = 2.2; u.swing = 1; this.explode(V3(u.windX, 0, u.windZ), u.team, 34 * this.vMul(u.team), 4.6, u, true); } return; }
    if (u.think <= 0) { u.think = .4; const raid = u.order.type === 'raid' || u.order.type === 'amove', cur = u.target; if (!cur || !cur.alive || !isUnit(cur) || cur.pos.distanceTo(u.pos) > 30) u.target = this.acquire(u, raid ? 20 : 26, raid && !(u.order.path && u.order.path.length) ? 18 : 0); }
    const t = u.target;
    if (t && t.alive) {
      const isB = !isUnit(t), d = isB ? this.distToBox(t as Building, u.pos.x, u.pos.z) : t.pos.distanceTo(u.pos);
      if (!isB && d > 50) { u.target = null; return; }
      if (d > (isB ? 2.6 : 3.6)) this.moveTo(u, t.pos.x, t.pos.z, dt, 1);
      else { u.yaw = Math.atan2(t.pos.x - u.pos.x, t.pos.z - u.pos.z); if (u.cd <= 0) { u.wind = .9; const f = Math.min(d, 3.2); u.windX = u.pos.x + Math.sin(u.yaw) * f; u.windZ = u.pos.z + Math.cos(u.yaw) * f; this.warn(u.windX, u.windZ, 4.6, .9); sfx.charge(this.vol(u.pos)); } }
      return;
    }
    this.vIdle(u, dt, u.order.type === 'raid' ? 4 : 2, u.order.type !== 'guard' ? 1 : .6);
  }
  updateBuildings(dt: number) {
    for (const b of this.buildings) {
      if (!b.alive) continue;
      if (fac(b.team) === 2) gloamBuilding(this, b, dt);
      if (!b.built) {
        // A site gains health as it goes up but keeps the damage it takes, so shooting a half-built site down works.
        b.progress = Math.min(1, b.progress); if (b.progress > b.pdone) { if (!this.net) b.hp = Math.min(b.maxHp, b.hp + b.maxHp * .9 * (b.progress - b.pdone)); b.pdone = b.progress; } b.obj.scale.y = Math.max(.06, b.progress);
        if (b.progress >= 1) { b.built = true; if (!this.net) b.hp = Math.min(b.maxHp, Math.max(1, b.hp)); b.obj.scale.y = 1; if (b.holo) { this.scene.remove(b.holo); b.holo = null; } if (b.builder) { b.builder.site = null; b.builder.state = 'idle'; b.builder = null; } sfx.built(); this.stats.built++; this.puff(TMP.copy(b.pos).setY(1.5), 8, 1.8, fac(b.team) === 2 ? M.gS : M.dust, .8, 2.5); if (b.kind === 'mothercap') b.buds = 1; this.dir.buildingDone(b); }
        else if ((fac(b.team) !== 2 && (b.team === SIDE.home || this.eco)) && this.needsBuilder(b)) this.assignRigger(b);
        continue;
      }
      if ((fac(b.team) !== 2 && (b.team === SIDE.home || this.eco)) && b.hp < b.maxHp * .7 && this.time - b.lastHit > 6 && this.needsBuilder(b)) this.assignRigger(b);
      if (b.hp < b.maxHp * .5 && fac(b.team) === 0) { b.smokeT -= dt; if (b.smokeT <= 0) { const bad = b.hp < b.maxHp * .25; b.smokeT = bad ? .18 : .4; const fire = bad && Math.random() < .5; this.puff(TMP.set(b.pos.x + R(-b.hx, b.hx) * .6, b.h * R(.6, 1), b.pos.z + R(-b.hz, b.hz) * .6), 1, fire ? 1.1 : 1.5, fire ? M.fire : M.smoke, 2.4, .5); } }
      // A Mother Cap ripens every Bud at once; everything else trains one at a time.
      if (b.kind === 'mothercap') { for (let i = b.queue.length - 1; i >= 0; i--) { const q = b.queue[i]; q.t -= dt; if (q.t > 0) continue; b.queue.splice(i, 1); const a = R(0, 6.283), u = this.spawn(q.kind, b.team, b.pos.x + Math.cos(a) * (b.hx + 1.2), b.pos.z + Math.sin(a) * (b.hz + 1.2)); this.puff(TMP.copy(u.pos).setY(1), 4, .8, M.gS); if (this.vol(b.pos) > .2) sfx.blip(); this.dir.trained(u); } }
      else if (b.queue.length) { const q = b.queue[0]; q.t -= dt; if (q.t <= 0) { b.queue.shift(); const side = b.kind === 'bunkhouse' && !b.rot; const u = this.spawn(q.kind, b.team, b.pos.x + (side ? b.hx + 1.2 : R(-1, 3)), b.pos.z + (side ? R(-.5, .5) : b.hz + 1.2)); this.puff(TMP.copy(u.pos).setY(1), 4, .8, fac(b.team) ? M.violet : M.dust); if (this.vol(b.pos) > .2) sfx.blip(); this.dir.trained(u); } }
      if (this.truce) continue;
      if (b.kind === 'watchpost') {
        b.cd -= dt; let tgt: Unit | null = null, bd = this.upOf(b.team).post ? 42 : 34; for (const o of this.units) { if (!o.alive || o.team === b.team || !T.sees(b.team, b.pos.y, o.pos.x, o.pos.z, o.pos.y) /* terrain (J) */) continue; const d = o.pos.distanceTo(b.pos); if (d < bd) { bd = d; tgt = o; } }
        if (tgt) { const gun = b.obj.userData.gun; gun.rotation.y = Math.atan2(tgt.pos.x - b.pos.x, tgt.pos.z - b.pos.z) - b.obj.rotation.y; if (b.cd <= 0) { b.cd = this.upOf(b.team).post ? .3 : .45; const a = V3(b.pos.x, 6, b.pos.z), e = V3(tgt.pos.x, UNIT[tgt.kind].bodyY, tgt.pos.z); this.tracer(a, e, tracerMat, .1); sfx.turret(this.vol(b.pos) * .6); this.damage(tgt, 10 * this.gunMul(b.team), b); } }
      } else if (b.kind === 'headframe') {
        // The night watchman on the Headframe: a slow rivet gun, so two raiders cannot empty the pit while the squad is away.
        b.cd -= dt; if (b.cd <= 0) { b.cd = .8; let tgt: Unit | null = null, bd = 20; for (const o of this.units) { if (!o.alive || o.team === b.team || !T.sees(b.team, b.pos.y, o.pos.x, o.pos.z, o.pos.y) /* terrain (J) */) continue; const d = o.pos.distanceTo(b.pos); if (d < bd) { bd = d; tgt = o; } }
          if (tgt) { this.tracer(V3(b.pos.x, b.h + .6, b.pos.z), V3(tgt.pos.x, UNIT[tgt.kind].bodyY, tgt.pos.z), tracerMat, .08); sfx.turret(this.vol(b.pos) * .4); this.damage(tgt, 9 * this.gunMul(b.team), b); } else b.cd = .3; }
      } else if (b.kind === 'thornspire') {
        b.cd -= dt; if (b.cd <= 0) { const twin = this.eco && this.upOf(b.team).vthorn; b.cd = twin ? .7 : 1; let tgt: Unit | null = null, bd = twin ? 32 : 26; for (const o of this.units) { if (!o.alive || o.team === b.team) continue; const d = o.pos.distanceTo(b.pos); if (d < bd) { bd = d; tgt = o; } }
          if (tgt) { this.tracer(V3(b.pos.x, 6.9, b.pos.z), V3(tgt.pos.x, UNIT[tgt.kind].bodyY, tgt.pos.z), beamMat, .2); sfx.zap(this.vol(b.pos) * .7); this.damage(tgt, 10 * this.vMul(b.team), b); this.puff(TMP.copy(tgt.pos).setY(1), 2, .5, M.mag, .5); } else b.cd = .3; }
      } else if (b.kind === 'choir') {
        b.cd -= dt; if (b.cd <= 0) { b.cd = 1.15; let tgt: Unit | null = null, bd = 21; for (const o of this.units) { if (!o.alive || o.team === b.team) continue; const d = o.pos.distanceTo(b.pos); if (d < bd) { bd = d; tgt = o; } }
          if (tgt) { this.tracer(V3(b.pos.x, 9.6, b.pos.z), V3(tgt.pos.x, 1.1, tgt.pos.z), beamMat, .16); sfx.zap(this.vol(b.pos) * .8); this.damage(tgt, 6 * this.vMul(b.team), b); this.puff(TMP.copy(tgt.pos).setY(1), 2, .5, M.teal, .5); } }
      }
    }
  }
  /** A site with nobody on it: no builder, a dead one, one a player is driving, or one that has gone off to other work. */
  needsBuilder(b: Building) { const u = b.builder; return !u || !u.alive || u === this.me || !!u.pilot || u.site !== b; }
  assignRigger(b: Building) { let best: Unit | null = null, bd = 1e9; const wk = FACTION[b.team]?.worker; for (const u of this.units) { if (!u.alive || u.team !== b.team || u.kind !== wk || u === this.me || u.pilot || u.site) continue; const d = u.pos.distanceTo(b.pos) + (u.carrying ? 15 : 0); if (d < bd) { bd = d; best = u; } } if (best && (bd < 90 || !b.built)) { best.site = b; b.builder = best; } }

  // ------------------------------------------------------------ render
  render(dt: number) {
    const me = this.me, cam = this.cam, pipe = this.pipe, vm = this.vm; this.drawT = Math.max(0, this.drawT - dt);
    cam.aspect = pipe.w / pipe.h; this.lampDt = dt;
    { const fix = this.duskFix ?? this.story?.dusk, hour = this.hourFix ?? (fix !== undefined ? hourOf(fix) : matchHour(MAP.dusk, this.time)), wx: [string, number] = this.wxFix ? [this.wxFix, 1] : fix !== undefined || this.hourFix !== undefined ? ['clear', 0] : matchWeather(this.wxSalt, this.time, hour); pipe.setSky(hour, wx[0], wx[1]); }
    const build = this.phase !== 'menu' && this.tool === 2 && !!me && isWorker(me.kind) && me.alive && !this.tab && this.staticT <= 0, blist = FACTION[me?.team || 0].builds;
    for (const k in this.ghost) { const on = build && blist[this.buildSel] === k; this.ghost[k].visible = on && this.placeOK; this.ghostBad[k].visible = on && !this.placeOK; if (on) { const g = this.placeOK ? this.ghost[k] : this.ghostBad[k]; g.position.copy(this.placePos); g.rotation.y = this.buildRot ? Math.PI / 2 : 0; } }
    holoOK.opacity = .2 + Math.sin(pipe.time * 3) * .05; warnMat.opacity = .6 + Math.sin(pipe.time * 30) * .3;
    const near = !this.tab && this.phase !== 'menu' && me ? me : null;
    for (const u of this.units) { u.ring.visible = this.tab && u.team === this.myTeam; u.obj.visible = !(near && u !== near && u.team === this.myTeam && Math.hypot(u.pos.x - near.pos.x, u.pos.z - near.pos.z) < 1.05); }
    pipe.static = this.staticT > 0 ? .85 : 0; pipe.sat = this.tab ? .8 : 1;
    for (const k in vm) vm[k].visible = false;
    if (this.phase === 'menu') {
      const a = pipe.time * .07; cam.fov = 46; cam.position.set(Math.sin(a) * 36 + 4, 8 + Math.sin(a * 2) * 2, Math.cos(a) * 36); cam.lookAt(2, 5.5, 0); if (me) this.bodyLayer(me, false);
      this.menuPos.copy(cam.position); this.menuQuat.copy(cam.quaternion);
      cam.updateProjectionMatrix(); cam.updateMatrixWorld(); this.lamps(cam); pipe.draw(this.scene, cam, V3(0, 0, 0), 120); return;
    }
    if (this.phase === 'cut' && this.shot) {
      pipe.sat = this.cutSat; const sh = this.shake * .05; cam.fov = this.shot.fov; cam.position.copy(this.shot.pos).add(TMP2.set(R(-sh, sh), R(-sh, sh), R(-sh, sh))); cam.lookAt(this.shot.look); if (me) this.bodyLayer(me, false);
      cam.updateProjectionMatrix(); cam.updateMatrixWorld(); this.lamps(cam); pipe.draw(this.scene, cam, this.shot.look, 130); return;
    }
    if (this.tab && me) {
      const iso = this.iso, h = 30, w = h * pipe.w / pipe.h; iso.left = -w; iso.right = w; iso.top = h; iso.bottom = -h; iso.updateProjectionMatrix();
      const shift = w * .28; iso.position.set(me.pos.x + shift, 150, me.pos.z + 120); iso.lookAt(me.pos.x + shift, 0, me.pos.z); iso.updateMatrixWorld();
      this.bodyLayer(me, false); this.lamps(iso); pipe.draw(this.scene, iso, me.pos, 150); this.hud.update(this, iso); this.bodyLayer(me, true); return;
    }
    if (me) {
      if (me.alive) this.bodyLayer(me, true);
      const sprint = this.keys.has('ShiftLeft') && me.moving && this.ads < .3, fovT = (this.hopT > 0 ? 82 : sprint ? 75 : 68) - this.ads * (SHOT[me.kind]?.zoom ?? 6) + this.recoil * 1.5 * (1 - this.ads); cam.fov += (this.fitFov(fovT) - cam.fov) * Math.min(1, dt * 10);
      const bobY = me.moving ? Math.sin(this.bob) * .035 * (1 - this.ads * .7) : 0, sh = this.shake * .03;
      cam.position.set(me.pos.x + R(-sh, sh), UNIT[me.kind].eye + me.pos.y /* terrain (J) */ + bobY + R(-sh, sh), me.pos.z + R(-sh, sh)); cam.rotation.set(this.pitch + this.recoil * .012, this.yaw + Math.PI, Math.sin(this.bob * .5) * (me.moving ? .004 : 0) - this.swayX * .6, 'YXZ'); this.fx.view(cam, dt);
      const intro = this.introT > 0 ? 1 - this.introT / 1.8 : 1;
      if (intro < 1) { const k = intro * intro * (3 - 2 * intro), q = cam.quaternion.clone(); TMP2.copy(cam.position); cam.position.lerpVectors(this.menuPos, TMP2, k); cam.quaternion.slerpQuaternions(this.menuQuat, q, k); cam.fov = 46 + (68 - 46) * k; if (me.alive) this.bodyLayer(me, k > .9); }
      if (me.alive && this.staticT <= 0 && intro > .92) {
        const pose = (g: THREE.Group, k: number, kick: number, dip: number) => {
          const a = g.userData.rest, b = g.userData.ads || a, mv = me.moving ? 1 - k * .8 : 0; g.visible = true;
          g.position.set(a[0] + (b[0] - a[0]) * k + Math.cos(this.bob) * .008 * mv + this.swayX, a[1] + (b[1] - a[1]) * k + Math.sin(this.bob * 2) * .006 * mv - dip - this.drawT * .9 + this.swayY, a[2] + (b[2] - a[2]) * k + kick);
          g.rotation.set(a[3] + (b[3] - a[3]) * k + kick * 1.6 - dip * 2.4 - this.drawT * 1.6 + this.swayY * 2, a[4] + (b[4] - a[4]) * k - this.swayX * 2, a[5] + (b[5] - a[5]) * k + dip * 1.2);
        };
        const gun = GUNS[me.kind], rl = this.reloadT > 0 && gun ? Math.sin(Math.min(1, this.reloadT / gun.reload) * Math.PI) : 0;
        if (fac(me.team) === 2 && vm['g_' + me.kind]) { const v = vm['g_' + me.kind], j = Math.max(this.jaw, this.vWind > 0 && me.kind !== 'snapper' ? .6 : 0), L = v.userData.L, Rr = v.userData.R; pose(v, 0, this.recoil * .05 - this.bashT * .6 + (this.chargeT > 0 ? -.08 : 0), this.tool === 2 && me.kind === 'grazer' ? .12 : this.vWind > 0 && me.kind === 'mulcher' ? -.1 : 0); if (L) L.rotation.y = .35 - j * .55; if (Rr) Rr.rotation.y = -.35 + j * .55; }
        else if (fac(me.team) === 1) pose(vm.veyl, 0, this.recoil * (me.kind === 'cantor' ? -.3 : .1) + (me.kind === 'tender' ? (this.lmb && this.tool === 1 ? -.02 + R(-.004, .004) : 0) - this.bashT * .8 : 0), this.vWind > 0 ? -.12 : me.kind === 'tender' && this.tool === 2 ? .12 : 0);
        else if (me.kind === 'rigger') pose(vm.drill, 0, (this.lmb && this.tool === 1 ? -.03 + R(-.004, .004) : 0) - this.bashT * 1.1, this.tool === 2 ? .12 : 0);
        else if (SHOT[me.kind]) { const v = vm[SHOT[me.kind].vm], m = v.userData.mag; if (v.userData.magY === undefined) v.userData.magY = m.position.y; pose(v, this.ads, this.recoil * (me.kind === 'longshot' ? .11 : .05), rl * .14 + (me.kind === 'longshot' && this.fireCd > 0 && gun ? Math.sin(Math.min(1, 1 - this.fireCd / gun.cd) * Math.PI) * .05 * (1 - this.ads * .6) : 0)); m.position.y = v.userData.magY - (rl > .5 ? (rl - .5) * .5 : 0); }
        else if (me.kind === 'gantry') { pose(vm.cannon, 0, 0, rl * .1); const k = this.recoil * .09; vm.cannon.userData.gunR.position.z = this.side > 0 ? k : 0; vm.cannon.userData.gunL.position.z = this.side < 0 ? k : 0; }
        else { const pump = this.fireCd > 0 ? Math.sin(Math.min(1, (gun.cd - this.fireCd) / (gun.cd * .8)) * Math.PI) : 0; pose(vm.scatter, 0, this.recoil * .12, rl * .12 + this.ads * .16); vm.scatter.userData.mag.position.z = -.42 + pump * .12 + (rl > 0 ? Math.abs(Math.sin(this.reloadT * 9)) * .1 : 0); pose(vm.shield, this.ads, -this.bashT * 1.2, 0); }
      }
    }
    cam.updateProjectionMatrix(); cam.updateMatrixWorld(); this.lamps(cam);
    pipe.draw(this.scene, cam, me ? me.pos : V3(), 110);
    this.hud.update(this, cam);
    // music follows how hot things are around the player
    if (me) { let hot = this.time - me.lastHit < 6 ? 1 : 0; if (!hot) for (const u of this.units) if (u.team !== this.myTeam && u.alive && Math.abs(u.pos.x - me.pos.x) < 45 && Math.abs(u.pos.z - me.pos.z) < 45) { hot = 1; break; } this.mood += (hot - this.mood) * Math.min(1, dt * (hot ? 2 : .4)); setMood(this.phase === 'play' ? .25 + this.mood * .75 : .15); }
  }
  private lampDt = 0; private cones = new Map<Prop, THREE.Mesh>();
  /** Every lamp, fire and glowing thing near the camera, handed to the renderer for this frame. All for show. */
  private lamps(cam: THREE.Camera) {
    lampsBegin(); const t = this.pipe.time, c = cam.position, me = this.me, far = 95 * 95;
    if (ENV.pool >= .02) {
      for (const b of this.buildings) {
        if (!b.alive || (b.pos.x - c.x) ** 2 + (b.pos.z - c.z) ** 2 > far * 2) continue; const f = fac(b.team), big = Math.max(b.hx, b.hz);
        if (!b.built) { if (f === 0) lamp(b.pos.x, 2.2, b.pos.z, big + 6, WARM, .5); continue; }
        const at = BLAMP[b.kind];
        if (at) for (const [x, y, z, r] of at) { TMP.set(x, y, z).applyMatrix4(b.obj.matrixWorld); lamp(TMP.x, TMP.y, TMP.z, r, WARM, flicker(t, b.id + x, .08)); }
        else if (f === 0) { TMP.set(0, Math.min(3, b.h * .45), (b.rot ? b.hx : b.hz) + 1).applyMatrix4(b.obj.matrixWorld); lamp(TMP.x, TMP.y, TMP.z, big + 8, WARM, flicker(t, b.id, .08)); }
        else lamp(b.pos.x, b.h * .55, b.pos.z, big * 1.3 + 9, f === 1 ? (b.id % 3 ? TEAL : ROSE) : SICK, f === 1 ? .85 + .15 * Math.sin(t * 1.3 + b.id) : .7 + .2 * Math.sin(t * 2.1 + b.id));
        // a building on fire lights the yard round it
        if (f === 0 && b.hp < b.maxHp * .5) lamp(b.pos.x, b.h * .8, b.pos.z, big + 12, FIRE, (b.hp < b.maxHp * .25 ? 1.3 : .7) * flicker(t, b.id * 3, .45));
      }
      for (const u of this.units) {
        if (!u.alive || u === me || (u.pos.x - c.x) ** 2 + (u.pos.z - c.z) ** 2 > far * .35) continue; const L = ULAMP[u.kind]; if (!L) continue;
        const s = Math.sin(u.obj.rotation.y), q = Math.cos(u.obj.rotation.y); lamp(u.pos.x + s * L[1], L[0], u.pos.z + q * L[1], L[2], L[3], L[4]);
      }
      // what you are driving carries a lamp that lights the ground ahead of it
      if (me && me.alive && !this.tab && this.phase !== 'menu' && this.phase !== 'cut') { const f = fac(me.team), s = Math.sin(this.yaw), q = Math.cos(this.yaw); lamp(me.pos.x + s * 3.2, UNIT[me.kind].eye * .7, me.pos.z + q * 3.2, f === 2 ? 8 : 11, f === 0 ? HEAD : f === 1 ? TEAL : SICK, f === 2 ? .7 : 1.1); }
      for (const o of this.ores) { if (o.amount <= 0 || (o.pos.x - c.x) ** 2 + (o.pos.z - c.z) ** 2 > far * .5) continue; lamp(o.pos.x, 1.6, o.pos.z, 7, ORE, .55 + .08 * Math.sin(t * 1.7 + o.pos.x)); }
      for (const p of this.props) { if (!p.alive || (p.kind !== 'crystal' && p.name !== 'Floodlight') || (p.x - c.x) ** 2 + (p.z - c.z) ** 2 > far) continue; if (p.name === 'Floodlight') { lamp(p.x, 6.8, p.z, 18, FLOOD, 1.1 * flicker(t, p.id, .05)); if (!this.cones.has(p)) { const m = makeCone(); m.position.set(p.x, 6.7, p.z); this.scene.add(m); this.cones.set(p, m); } } else lamp(p.x, p.y0 + Math.min(3, p.h * .5), p.z, p.r * 1.6 + 5, ORE, .5); }
    }
    // the air under a floodlight shows its light as a cone, more so the thicker the air is
    CONEU.uK.value = LAMP_ON.value ? Math.min(.5, ENV.pool * (.2 + ENV.mist * 5 + Math.max(0, ENV.fogK - 1.2) * .06)) : 0;
    for (const [p, m] of this.cones) { if (!p.alive) { this.scene.remove(m); this.cones.delete(p); } else m.visible = CONEU.uK.value > .01; }
    lampsCommit(c, this.lampDt); this.lampDt = 0;
  }
  /** Split screen halves are very wide or very tall. This keeps the view from stretching in the first and from feeling boxed in in the second. */
  fitFov(fov: number) { const a = this.pipe.w / this.pipe.h; return a > 2.6 ? 2 * Math.atan(Math.tan(fov * Math.PI / 360) * 2.6 / a) * 180 / Math.PI : a < 1.2 ? fov + 9 : fov; }
  weapon() { const me = this.me; return me && GUNS[me.kind] ? GUNS[me.kind] : null; }
}
export { UNIT, BLD, BUILDABLE, OUTPOST };
