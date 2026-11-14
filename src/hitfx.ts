// Getting shot, dying, and what a bullet does where it lands.
//
// Everything in this file is for show. It never changes health, the positions the rules read, or the seeded random numbers a match is played
// with (it uses Math.random only, and does nothing at all on the match server), so it cannot move a balance number or a bot result.
//
// Bodies are animated through the named parts of a rig (body, head, arms, armL, armR, legL, legR, halo, and the Gloam's lg0L.. legs), so any
// model that keeps those names gets the same flinches and deaths.
import * as THREE from 'three';
import { V3, M, G, L_FX, toonMaterial } from './gfx';
import { UNIT, Unit, Building, fac } from './data';
import { unitRule } from './core/registry';
import { sfx } from './audio';
import type { Game } from './game';

const rnd = Math.random, rr = (a: number, b: number) => a + rnd() * (b - a), sgn = () => rnd() < .5 ? -1 : 1;
const clamp = (v: number, a: number, b: number) => v < a ? a : v > b ? b : v, PI = Math.PI;
const smooth = (k: number) => { k = clamp(k, 0, 1); return k * k * (3 - 2 * k); };

/** How a body is put together, which decides how it flinches and how it dies. */
type Cls = 'man' | 'walker' | 'float' | 'bug';
const clsOf = (u: Unit): Cls => fac(u.team) === 2 ? 'bug' : unitRule(u.kind).stance?.idleTick ? 'walker' : u.rig.legL ? 'man' : 'float';
/** What a bullet has landed on. */
export type Surface = 'dirt' | 'rock' | 'metal' | 'crystal' | 'flesh' | 'plant';
const BIG: Record<string, number> = { warden: .3, gantry: .28, mulcher: .4, breacher: .75 };

// ---------------------------------------------------------------- flinch
/** A body's reaction to being hit: a handful of damped springs laid over whatever pose the game gives it. */
interface Flinch {
  u: Unit; cls: Cls; on: boolean;
  lx: number; lz: number; vx: number; vz: number;          // the torso thrown off its hips, in the body's own left-right and front-back
  tw: number; vtw: number;                                  // a twist at the waist
  hx: number; hz: number; vhx: number; vhz: number;         // the head, which lags and then whips after the torso
  arm: number; varm: number;                                // arms jolted up
  dip: number; vdip: number;                                // knees giving, or a floating body dropping
  /** What was added to the pose last frame, so it can be taken off again before the game poses the body. */
  tg: any[]; ax: string[]; val: number[]; n: number;
  /** The last hit, kept so a death knows what killed it. */
  t: number; amt: number; crit: boolean; dx: number; dz: number; blast: boolean; fxT: number;
}
const newFlinch = (u: Unit): Flinch => ({ u, cls: clsOf(u), on: false, lx: 0, lz: 0, vx: 0, vz: 0, tw: 0, vtw: 0, hx: 0, hz: 0, vhx: 0, vhz: 0, arm: 0, varm: 0, dip: 0, vdip: 0, tg: [], ax: [], val: [], n: 0, t: -9, amt: 0, crit: false, dx: 0, dz: 1, blast: false, fxT: -9 });

// ---------------------------------------------------------------- bodies and pieces
interface Body {
  u: Unit; obj: THREE.Object3D; cls: Cls; style: string; t: number; s: number; k: number;
  com: THREE.Vector3; vel: THREE.Vector3; h: number; rest: number; sag: number;
  /** The way the top of the body falls, and how far over it has gone. */
  fx: number; fz: number; tilt: number; tiltV: number; tiltTo: number; mode: 'wait' | 'pend' | 'spin' | 'settle' | 'rest';
  yaw: number; yawV: number; delay: number; landT: number; lands: number; sink: number; back: number; r1: number; r2: number; r3: number;
  legs: THREE.Object3D[]; stage: number; next: number; vol: number; dx: number; dz: number; gone: boolean;
}
interface Piece { o: THREE.Object3D; v: THREE.Vector3; w: THREE.Vector3; t: number; life: number; r: number; hit: boolean; kind: number }

const BOX = new THREE.Box3(), T1 = V3(), T2 = V3(), T3 = V3(), Q1 = new THREE.Quaternion(), Q2 = new THREE.Quaternion(), UPV = V3(0, 1, 0), FWD = V3(0, 0, 1), E1 = new THREE.Euler();

// ---------------------------------------------------------------- shared looks
const basic = (c: number) => new THREE.MeshBasicMaterial({ color: c, transparent: true, depthWrite: false, side: THREE.DoubleSide });
/** Spark colours: 0 hot yellow, 1 orange, 2 Veyl cyan, 3 Gloam acid, 4 red, 5 white, 6 pale dust, 7 thrown dirt. */
const SPARK = [0xfff1a0, 0xffb23a, 0x8ff2ff, 0xd8ff6a, 0xff5a3a, 0xffffff, 0xf3cfa4, 0x9a5f3c].map(basic);
const INKM = basic(0x0e0d14);
/** A comic hit star: uneven points, the way a pen draws one. */
const STAR = (() => { const s = new THREE.Shape(), n = 14, long = [1, .62, .9, .7, 1.05, .58, .84]; for (let i = 0; i < n; i++) { const a = i / n * PI * 2, r = i % 2 ? .3 + (i % 3) * .035 : long[(i / 2) | 0]; i ? s.lineTo(Math.cos(a) * r, Math.sin(a) * r) : s.moveTo(Math.cos(a) * r, Math.sin(a) * r); } return new THREE.ShapeGeometry(s); })();
const RING = new THREE.RingGeometry(.8, 1, 36);
let WHITE_OF: Map<THREE.Material, THREE.Material> | null = null, DECAL: THREE.Material[] | null = null;
/** The same material, burnt out to white: one frame of this on a body is what makes a hit read. */
function whiteOf(mat: THREE.Material) {
  const sm = mat as THREE.ShaderMaterial; if (!sm.uniforms || !sm.uniforms.uColor) return null;
  WHITE_OF = WHITE_OF || new Map(); let c = WHITE_OF.get(mat);
  if (!c) { const t = sm.clone(); t.uniforms = { ...sm.uniforms, uColor: { value: new THREE.Color(2.3, 2.25, 2.05) }, uEmis: { value: 1 } }; WHITE_OF.set(mat, c = t); }
  return c;
}
/** Ground marks: 0 a bullet hole, 1 Gloam ichor, 2 dark ichor rim, 3 crystal dust. */
function decalMats() {
  if (DECAL) return DECAL;
  DECAL = ['#2a1a1c', '#a9d63e', '#3d5a1c', '#7fd6dc'].map((color, i) => { const m = toonMaterial(null, { color, hatch: 0, flat: 1, emis: i === 1 ? .35 : 0 }); m.polygonOffset = true; m.polygonOffsetFactor = -3 - i * .3; m.polygonOffsetUnits = -3 - i; return m; });
  return DECAL;
}

export class HitFx {
  private fl = new WeakMap<Unit, Flinch>(); private live: Flinch[] = [];
  private flashes: { obj: THREE.Object3D; t: number; mats: [THREE.Mesh, THREE.Material | THREE.Material[]][] }[] = [];
  bodies: Body[] = []; pieces: Piece[] = [];
  private sparks: { m: THREE.Mesh; t: number; life: number; v: THREE.Vector3; w: number }[] = [];
  private stars: { g: THREE.Group; t: number; life: number; s: number; rot: number; col: THREE.Mesh }[] = [];
  private rings: { m: THREE.Mesh; mat: THREE.MeshBasicMaterial; t: number; life: number; r: number }[] = [];
  private decals: { m: THREE.Mesh; t: number; s: number; grow: number; life: number }[] = []; private decalI = 0;
  /** Where the player's own bullet actually landed, set by the gun just before it deals the damage. */
  private aimP = V3(); private aimD = V3(); private aimT = -1;
  private blastX = 0; private blastZ = 0; private blastR = 0; private blastT = -1;
  private sndT = 0; private fallT = 0;
  /** The player's own view when hit: a roll and a dip that settle in a fraction of a second. Aim is not touched. */
  private roll = 0; private vroll = 0; private nod = 0; private vnod = 0;

  constructor(public g: Game) {
    const s = g.scene; if (g.evq) return;
    for (let i = 0; i < 80; i++) { const m = new THREE.Mesh(G.box, SPARK[0]); m.layers.set(L_FX); m.visible = false; m.frustumCulled = false; s.add(m); this.sparks.push({ m, t: 0, life: 1, v: V3(), w: .02 }); }
    for (let i = 0; i < 10; i++) {
      const g2 = new THREE.Group(), ink = new THREE.Mesh(STAR, INKM), col = new THREE.Mesh(STAR, SPARK[0]), core = new THREE.Mesh(STAR, SPARK[5]);
      ink.scale.setScalar(1.22); ink.renderOrder = 20; col.renderOrder = 21; core.renderOrder = 22; core.scale.setScalar(.46); core.rotation.z = .5; g2.add(ink, col, core);
      g2.traverse(o => o.layers.set(L_FX)); g2.visible = false; s.add(g2); this.stars.push({ g: g2, t: 0, life: .1, s: 1, rot: 0, col });
    }
    for (let i = 0; i < 6; i++) { const mat = basic(0xffffff), m = new THREE.Mesh(RING, mat); m.rotation.x = -PI / 2; m.layers.set(L_FX); m.visible = false; s.add(m); this.rings.push({ m, mat, t: 0, life: 1, r: 1 }); }
    for (let i = 0; i < 56; i++) { const m = new THREE.Mesh(G.disc, decalMats()[0]); m.rotation.x = -PI / 2; m.visible = false; s.add(m); this.decals.push({ m, t: 0, s: 1, grow: 0, life: 1 }); }
  }

  // ------------------------------------------------------------ small parts
  private off() { return !!this.g.evq || this.g.noRender; }
  private camDist(p: { x: number; z: number }) { const c = this.g.cam.position; return Math.hypot(p.x - c.x, p.z - c.z); }
  /** One puff from the game's own pool, with a push in a chosen direction. */
  puff(p: THREE.Vector3, size: number, mat: THREE.Material, vx: number, vy: number, vz: number, life = .5) {
    const f = this.g.puffs.find(x => x.t <= 0); if (!f) return; f.m.material = mat; f.m.position.copy(p); f.v.set(vx, vy, vz); f.s = size * rr(.75, 1.2); f.life = f.t = life * rr(.8, 1.2); f.m.rotation.set(rr(0, 6), rr(0, 6), rr(0, 6)); f.m.visible = true; f.m.scale.setScalar(.01);
  }
  /** One tumbling chip from the game's pool. */
  bit(p: THREE.Vector3, size: number, mat: THREE.Material, vx: number, vy: number, vz: number, life = 1.1) {
    const f = this.g.bits.find(x => x.t <= 0); if (!f) return; f.m.material = mat; f.m.position.copy(p); f.v.set(vx, vy, vz); const s = size * rr(.6, 1.3); f.m.scale.set(s, s * rr(.4, 1), s * rr(.6, 1.2)); f.m.rotation.set(rr(0, 6), rr(0, 6), 0); f.spin = rr(-14, 14); f.t = life * rr(.8, 1.3); f.m.visible = true;
  }
  /** A streak of light thrown from an impact. `dir` is where the spray goes, `cone` how wide. */
  spray(p: THREE.Vector3, dir: THREE.Vector3, n: number, col: number, speed = 7, cone = .7, w = .022) {
    for (let i = 0; i < n; i++) {
      const f = this.sparks.find(x => x.t <= 0); if (!f) return; f.m.material = SPARK[col]; f.m.position.copy(p);
      f.v.set(dir.x + rr(-cone, cone), dir.y + rr(-cone, cone) + .25, dir.z + rr(-cone, cone)).normalize().multiplyScalar(speed * rr(.45, 1.25)); f.life = f.t = rr(.14, .34); f.w = w * rr(.7, 1.4); f.m.visible = true; f.m.scale.setScalar(.001);
    }
  }
  star(p: THREE.Vector3, size: number, col: number, life = .1) {
    const b = this.stars.find(x => x.t <= 0) || this.stars.reduce((a, c) => a.t < c.t ? a : c); b.g.position.copy(p); b.s = size * Math.max(1, this.g.cam.position.distanceTo(p) / 13) ** .75; b.t = b.life = life; b.rot = rr(0, 6); b.col.material = SPARK[col]; b.g.visible = true; b.g.scale.setScalar(.001);
  }
  ring(x: number, z: number, r: number, col: number, life = .4) {
    const b = this.rings.find(q => q.t <= 0) || this.rings.reduce((a, c) => a.t < c.t ? a : c); b.m.position.set(x, .09, z); b.r = r; b.t = b.life = life; b.mat.color.setHex(col); b.mat.opacity = 1; b.m.visible = true; b.m.scale.setScalar(.01);
  }
  /** A mark left on the ground. `grow` spreads it over that many seconds, for a pool. */
  decal(x: number, z: number, size: number, kind: number, life = 22, grow = 0) {
    const d = this.decals[this.decalI = (this.decalI + 1) % this.decals.length]; d.m.material = decalMats()[kind]; d.m.position.set(x, .035 + kind * .004 + rnd() * .004, z); d.s = size; d.t = life; d.grow = grow; d.m.rotation.z = rr(0, 6); d.m.scale.set(grow ? .01 : size * rr(.8, 1.25), grow ? .01 : size * rr(.8, 1.25), 1); d.m.visible = true; d.life = life;
  }
  /** An ichor splat: a bright blot on a dark one, with a few drops round it. */
  splat(x: number, z: number, size: number, grow = 0) {
    this.decal(x, z, size * 1.18, 2, 24, grow); this.decal(x, z, size, 1, 24, grow);
    if (!grow) for (let i = 0; i < 3; i++) { const a = rr(0, 6.28), d = size * rr(.5, 1.1); this.decal(x + Math.cos(a) * d, z + Math.sin(a) * d, size * rr(.15, .32), 1, 20); }
  }
  /** Crystal dust left where a Veyl body broke: a scatter of pale flecks. */
  dust(x: number, z: number, r: number, n: number) { for (let i = 0; i < n; i++) { const a = rr(0, 6.28), d = r * Math.sqrt(rnd()); this.decal(x + Math.cos(a) * d, z + Math.sin(a) * d, rr(.07, .2) * Math.sqrt(r), 3, 16); } }
  /** Marks the centre of a blast, so bodies it kills are thrown outward from it. */
  blastAt(p: THREE.Vector3, radius: number) { this.blastX = p.x; this.blastZ = p.z; this.blastR = radius; this.blastT = this.g.time; }
  /** The player's bullet: where it landed and the way it was travelling. */
  aim(end: THREE.Vector3, d: THREE.Vector3) { this.aimP.copy(end); this.aimD.copy(d); this.aimT = this.g.time; }

  // ------------------------------------------------------------ a hit on a body
  /** Called for every hit that lands on a unit. `amt` is the damage as it was dealt. */
  hit(u: Unit, amt: number, from: Unit | Building | null, crit = false, shielded = false) {
    const g = this.g; if (g.evq || !u.alive) return;
    let st = this.fl.get(u); if (!st) this.fl.set(u, st = newFlinch(u));
    // which way the hit was going
    let dx = 0, dz = 0, blast = false;
    if (this.blastT === g.time && Math.hypot(u.pos.x - this.blastX, u.pos.z - this.blastZ) < this.blastR + 3) { dx = u.pos.x - this.blastX; dz = u.pos.z - this.blastZ; blast = true; }
    else if (from) { dx = u.pos.x - from.pos.x; dz = u.pos.z - from.pos.z; }
    let dl = Math.hypot(dx, dz); if (dl < .01) { const a = rr(0, 6.28); dx = Math.cos(a); dz = Math.sin(a); dl = 1; } dx /= dl; dz /= dl;
    const frac = clamp(amt / Math.max(1, u.maxHp), 0, 1), mine = from === g.me && !!g.me;
    st.t = g.time; st.amt = amt; st.crit = crit; st.dx = dx; st.dz = dz; st.blast = blast;
    if (u === g.me) { const a = Math.atan2(-dx, -dz) - g.yaw, side = Math.sin(a), j = .5 + frac * 3; this.vroll += clamp(-side * j * 1.6, -3, 3); this.vnod += clamp(j * .9, 0, 2.2) * (Math.cos(a) > -.3 ? 1 : -.6); return; }
    // the springs
    const cls = st.cls, big = BIG[u.kind] || 1, sy = Math.sin(u.yaw), cy = Math.cos(u.yaw), lz = dx * sy + dz * cy, lx = dx * cy - dz * sy;
    let J = (3.6 + 14 * Math.min(1, frac * 1.7) + (blast ? 4 : 0)) * big * (shielded ? .45 : 1) * (mine ? 1.15 : 1);
    if (cls === 'float') J *= 1.25; else if (cls === 'bug') J *= 1.9;
    const cap = 16 * big, add = (v: number, j: number) => clamp(v + j, -cap, cap);
    if (crit) { st.vhx = add(st.vhx, lz * J * 1.7); st.vhz = add(st.vhz, lx * J * 1.7); st.vx = add(st.vx, lx * J * .45); st.vz = add(st.vz, lz * J * .45); }
    else { st.vx = add(st.vx, lx * J); st.vz = add(st.vz, lz * J); st.vhx = add(st.vhx, -lz * J * .75); st.vhz = add(st.vhz, -lx * J * .75); }
    st.vtw = add(st.vtw, (lx * .8 + rr(-.5, .5)) * J * .55); st.varm = add(st.varm, J * rr(.5, .9));
    if (frac > .16 || crit || blast) st.vdip = add(st.vdip, (3 + frac * 9) * (cls === 'walker' ? .4 : 1));
    if (!st.on) { st.on = true; this.live.push(st); }
    if (this.off()) return;
    // what the eye and ear get
    const cd = this.camDist(u.pos); if (cd > 120) return;
    const heavy = frac > .22 || blast, quick = g.time - st.fxT < .035; st.fxT = g.time;
    this.flash(u.obj, heavy || crit ? .085 : .055);
    const def = UNIT[u.kind], p = T1;
    if (mine && this.aimT === g.time) { p.copy(this.aimP); T2.copy(this.aimD); }
    else { T2.set(dx, 0, dz); p.set(u.pos.x - dx * def.rad * .75 + rr(-.12, .12), crit ? def.headY : def.bodyY * rr(.75, 1.25), u.pos.z - dz * def.rad * .75 + rr(-.12, .12)); }
    if (blast) return;   // the blast draws its own fire
    const n = (quick ? .35 : 1) * (cd > 55 ? .5 : 1) * (mine ? 1 : .7), back = T3.copy(T2).multiplyScalar(-1), sz = (crit ? .46 : heavy ? .38 : .27) * (mine ? 1 : .8);
    if (cls === 'float') {
      if (shielded) { if (!quick) this.star(p, sz, 2); this.spray(p, back, Math.ceil(4 * n), 2, 6, 1, .02); }
      else { if (!quick) this.star(p, sz, crit ? 5 : 2, crit ? .13 : .1); this.spray(p, back, Math.ceil(5 * n), 2, 7, .8); this.spray(p, T2, Math.ceil(2 * n), 5, 5, .5); this.bit(p, .07, M.crys, dx * 2 + rr(-2, 2), rr(2, 4.5), dz * 2 + rr(-2, 2)); if (heavy || crit) { this.bit(p, .1, M.crys, rr(-3, 3), rr(3, 5), rr(-3, 3)); this.puff(p, .4, M.teal, dx, 1.2, dz, .4); } }
    } else if (cls === 'bug') {
      if (!quick) this.star(p, sz, 3, crit ? .13 : .1); this.spray(p, T2, Math.ceil(5 * n), 3, 6, .6, .03); this.spray(p, back, Math.ceil(2 * n), 3, 4, .9, .026);
      if (heavy) this.puff(p, .3, M.gS, dx * 1.6, .5, dz * 1.6, .25); this.bit(p, .07, M.gS, dx * 4 + rr(-1.5, 1.5), rr(1.5, 4), dz * 4 + rr(-1.5, 1.5), .8);
      if (!quick && rnd() < (heavy ? .9 : .5)) { const d = rr(.8, 2.6); this.splat(u.pos.x + dx * d + rr(-.4, .4), u.pos.z + dz * d + rr(-.4, .4), rr(.18, .4) * (heavy ? 1.5 : 1)); }
    } else {
      if (!quick) this.star(p, sz, crit ? 4 : 0, crit ? .13 : .1); this.spray(p, back, Math.ceil((heavy ? 9 : 6) * n), crit ? 5 : 0, 8, .85); this.spray(p, T2, Math.ceil(2 * n), 1, 5, .5);
      if (!quick) { this.bit(p, .06, rnd() < .5 ? M.steelD : M.yellow, rr(-2.5, 2.5) - dx, rr(2, 4.5), rr(-2.5, 2.5) - dz); if (heavy) this.bit(p, .08, M.steelD, rr(-3, 3) - dx * 2, rr(2.5, 5), rr(-3, 3) - dz * 2); }
    }
    const v = mine ? Math.max(.55, g.vol(u.pos)) : g.vol(u.pos) * .55;
    if (v > .04 && (mine || g.pipe.time - this.sndT > .075)) { this.sndT = g.pipe.time; sfx.impact(v, shielded ? 3 : cls === 'float' ? 1 : cls === 'bug' ? 2 : 0, heavy || crit); }
  }

  /** A burnt-out white frame over a whole body. */
  flash(obj: THREE.Object3D, dur: number) {
    const f = this.flashes.find(x => x.obj === obj); if (f) { f.t = Math.max(f.t, dur); return; }
    const mats: [THREE.Mesh, THREE.Material | THREE.Material[]][] = [];
    obj.traverse(o => { const m = o as THREE.Mesh; if (!m.isMesh || Array.isArray(m.material)) return; const w = whiteOf(m.material); if (w) { mats.push([m, m.material]); m.material = w; } });
    this.flashes.push({ obj, t: dur, mats });
  }
  private unflash(obj: THREE.Object3D) { const i = this.flashes.findIndex(x => x.obj === obj); if (i < 0) return; for (const [m, mat] of this.flashes[i].mats) m.material = mat; this.flashes.splice(i, 1); }

  /** Before the game poses the bodies: take last frame's flinch back off. */
  pre() { for (const st of this.live) { for (let i = 0; i < st.n; i++) st.tg[i][st.ax[i]] -= st.val[i]; st.n = 0; } }
  /** After the game has posed the bodies: move the springs on and lay the flinch over the pose. */
  post(dt: number) {
    const L = this.live;
    for (let i = L.length - 1; i >= 0; i--) {
      const st = L[i], u = st.u; if (!u.alive) { st.on = false; L.splice(i, 1); continue; }
      const cls = st.cls, w = cls === 'float' ? 10 : cls === 'bug' ? 25 : cls === 'walker' ? 13 : 19, z = cls === 'float' ? .24 : .34, wh = w * .72;
      let left = Math.min(dt, .1); while (left > 1e-5) {
        const h = Math.min(left, .012); left -= h;
        st.vx += (-w * w * st.lx - 2 * z * w * st.vx) * h; st.lx += st.vx * h; st.vz += (-w * w * st.lz - 2 * z * w * st.vz) * h; st.lz += st.vz * h;
        st.vtw += (-w * w * st.tw - 2 * .4 * w * st.vtw) * h; st.tw += st.vtw * h;
        st.vhx += (-wh * wh * st.hx - 2 * .3 * wh * st.vhx) * h; st.hx += st.vhx * h; st.vhz += (-wh * wh * st.hz - 2 * .3 * wh * st.vhz) * h; st.hz += st.vhz * h;
        st.varm += (-200 * st.arm - 2 * .45 * 14 * st.varm) * h; st.arm += st.varm * h; st.vdip += (-120 * st.dip - 2 * .55 * 11 * st.vdip) * h; st.dip += st.vdip * h;
      }
      const e = Math.abs(st.lx) + Math.abs(st.lz) + Math.abs(st.tw) + Math.abs(st.hx) + Math.abs(st.hz) + Math.abs(st.arm) + Math.abs(st.dip), ev = Math.abs(st.vx) + Math.abs(st.vz) + Math.abs(st.vhx) + Math.abs(st.vhz) + Math.abs(st.varm) + Math.abs(st.vdip) + Math.abs(st.vtw);
      if (e < .004 && ev < .05) { st.on = false; L.splice(i, 1); continue; }
      if (u === this.g.me) continue;
      const r = u.rig, add = (t: any, a: string, v: number) => { t[a] += v; st.tg[st.n] = t; st.ax[st.n] = a; st.val[st.n++] = v; };
      const lx = clamp(st.lx, -.7, .7), lz = clamp(st.lz, -.7, .7), dip = clamp(st.dip, -.5, 1), arm = clamp(st.arm, -1, 1.4), hy = UNIT[u.kind].bodyY * (cls === 'bug' ? .5 : .95);
      // the torso turns about the hips, not about the feet
      add(r.body.rotation, 'x', lz); add(r.body.rotation, 'z', -lx); add(r.body.rotation, 'y', clamp(st.tw, -.5, .5) * (cls === 'walker' ? .4 : 1));
      E1.set(lz, 0, -lx); T1.set(0, hy, 0).applyEuler(E1); add(r.body.position, 'x', -T1.x); add(r.body.position, 'y', hy - T1.y); add(r.body.position, 'z', -T1.z);
      if (r.head) { add(r.head.rotation, 'x', clamp(st.hx, -.9, .9)); add(r.head.rotation, 'z', clamp(-st.hz, -.7, .7)); }
      if (cls === 'man') {
        if (r.arms) { add(r.arms.rotation, 'x', -arm * .32); add(r.arms.rotation, 'z', st.tw * .5); }
        if (r.armL) add(r.armL.rotation, unitRule(u.kind).stance?.tool ? 'z' : 'x', -arm * .4); if (r.armR) add(r.armR.rotation, 'z', arm * .4);
        if (r.legL && r.legR) { add(r.legL.rotation, 'z', -dip * .22); add(r.legR.rotation, 'z', dip * .22); add(r.legL.rotation, 'x', -lz * .5 + dip * .12); add(r.legR.rotation, 'x', -lz * .2 - dip * .3); }
        add(u.obj.position, 'y', -dip * .16); add(u.obj.position, 'x', (lx * Math.cos(u.yaw) + lz * Math.sin(u.yaw)) * .12); add(u.obj.position, 'z', (-lx * Math.sin(u.yaw) + lz * Math.cos(u.yaw)) * .12);
      } else if (cls === 'walker') {
        if (r.arms) add(r.arms.rotation, 'x', -arm * .1); add(u.obj.position, 'y', -dip * .12);
        if (r.legL && r.legR) { add(r.legL.rotation, 'x', -lz * .3); add(r.legR.rotation, 'x', -lz * .3); }
      } else if (cls === 'float') {
        add(u.obj.position, 'y', -dip * .34 - Math.abs(arm) * .04);
        if (r.halo) { add(r.halo.rotation, 'x', clamp(st.hx * 1.4, -1, 1)); add(r.halo.rotation, 'y', clamp(st.hz * 1.4, -1, 1)); }
        if (r.armL) add(r.armL.rotation, 'z', -arm * .45); if (r.armR) add(r.armR.rotation, 'z', arm * .45); if (r.arms) add(r.arms.rotation, 'x', -arm * .2);
      } else {
        add(u.obj.position, 'y', Math.max(0, arm) * .1 - Math.max(0, dip) * .06);
        for (const l of legsOf(u.obj)) add(l.rotation, 'z', (l.name[3] === 'L' ? -1 : 1) * (arm * .3 + dip * .25));
        if (r.arms) add(r.arms.rotation, 'x', -arm * .3);
      }
    }
  }
  /** The player's own view rocks when they are hit. Laid over the camera after the game has aimed it. */
  view(cam: THREE.Camera, dt: number) {
    let left = Math.min(dt, .1); while (left > 1e-5) { const h = Math.min(left, .012); left -= h; this.vroll += (-520 * this.roll - 22 * this.vroll) * h; this.roll += this.vroll * h; this.vnod += (-460 * this.nod - 24 * this.vnod) * h; this.nod += this.vnod * h; }
    if (Math.abs(this.roll) + Math.abs(this.nod) < 1e-4) return;
    cam.rotation.z += clamp(this.roll, -.07, .07); cam.rotation.x += clamp(this.nod, -.035, .045);
  }
  /** An online player only hears about damage in the next snapshot: work out who most likely did it and flinch from them. */
  remote(u: Unit, drop: number, shielded: boolean) {
    const g = this.g, st = this.fl.get(u); if (st && g.time - st.t < .3) return;
    let best: Unit | null = null, bd = 70 * 70; for (const o of g.units) { if (!o.alive || o.team === u.team) continue; const d = (o.pos.x - u.pos.x) ** 2 + (o.pos.z - u.pos.z) ** 2, k = o.flashT > -.25 || o.swing > .2 ? .25 : 1; if (d * k < bd) { bd = d * k; best = o; } }
    this.hit(u, drop, best, false, shielded);
  }

  // ------------------------------------------------------------ bullets on the world
  /** A bullet landing on something that is not a body. `d` is the way it was travelling. */
  surface(p: THREE.Vector3, d: THREE.Vector3, kind: Surface, power = 1) {
    const g = this.g; if (this.off()) return; const cd = this.camDist(p); if (cd > 140) return;
    const ground = p.y < .2, n = T3; if (ground) n.set(0, 1, 0); else n.set(-d.x, .35, -d.z).normalize();
    const dn = d.x * n.x + d.y * n.y + d.z * n.z, ref = T2.set(d.x - 2 * dn * n.x, d.y - 2 * dn * n.y, d.z - 2 * dn * n.z); if (ground) ref.y = Math.max(ref.y, .35); ref.normalize();
    const far = cd > 60 ? .5 : 1, P = T1.copy(p); if (ground) P.y = .06;
    if (kind === 'dirt') {
      // a spurt of dirt thrown up and a little way on, and one low puff that is gone almost at once
      T2.set(ref.x * .45, 1, ref.z * .45).normalize(); this.spray(P, T2, Math.ceil(6 * far), 6, 5.5 * power, .32, .03); this.spray(P, T2, Math.ceil(4 * far), 7, 4 * power, .5, .036);
      this.puff(P, .26 * power, M.dust, ref.x * 1.2, .7, ref.z * 1.2, .26);
      for (let i = 0; i < 2 * far; i++) this.bit(P, .05, M.rock, ref.x * 3 + rr(-1.5, 1.5), rr(2.5, 5), ref.z * 3 + rr(-1.5, 1.5), .7);
      if (rnd() < .3) this.spray(P, ref.set(ref.x, .5, ref.z), 2, 0, 7, .5, .016);
      if (ground) this.decal(P.x, P.z, rr(.13, .22) * power, 0, 18);
    } else if (kind === 'rock') {
      this.puff(P, .36 * power, M.dust, n.x, 1, n.z, .4); for (let i = 0; i < 3 * far; i++) this.bit(P, .06, M.rock, n.x * 3 + rr(-2, 2), rr(1.5, 4.5), n.z * 3 + rr(-2, 2), .8);
      this.spray(P, ref, Math.ceil(3 * far), 0, 7, .6, .018); this.star(P, .16 * power, 0, .07);
    } else if (kind === 'metal') {
      this.spray(P, ref, Math.ceil(8 * far), 0, 9, .7); this.spray(P, n, Math.ceil(3 * far), 1, 5, 1); this.star(P, .22 * power, 0, .08);
      if (rnd() < .6) this.bit(P, .05, M.steelD, n.x * 3 + rr(-2, 2), rr(2, 4), n.z * 3 + rr(-2, 2), .8);
    } else if (kind === 'crystal') {
      this.spray(P, ref, Math.ceil(6 * far), 2, 8, .8); this.star(P, .22 * power, 2, .08); this.spray(P, n, Math.ceil(2 * far), 5, 4, 1, .018);
      for (let i = 0; i < 2 * far; i++) this.bit(P, .07, M.crys, n.x * 3 + rr(-2, 2), rr(2, 4.5), n.z * 3 + rr(-2, 2), .9);
    } else if (kind === 'flesh') {
      this.puff(P, .36 * power, M.gS, n.x * 1.4, .9, n.z * 1.4, .4); this.spray(P, n, Math.ceil(5 * far), 3, 5, .9, .03); this.star(P, .2 * power, 3, .08);
      for (let i = 0; i < 2 * far; i++) this.bit(P, .07, M.gS, n.x * 3 + rr(-2, 2), rr(1.5, 4), n.z * 3 + rr(-2, 2), .8);
      if (rnd() < .5) this.splat(P.x + n.x * rr(.4, 1.4), P.z + n.z * rr(.4, 1.4), rr(.14, .3));
    } else { this.puff(P, .3 * power, M.dust, n.x, .9, n.z, .4); this.bit(P, .05, M.violet, n.x * 2 + rr(-2, 2), rr(2, 4), n.z * 2 + rr(-2, 2), .8); }
    const v = Math.max(0, 1 - cd / 70) ** 1.5 * .9; if (v > .03 && g.pipe.time - this.sndT > .05) { this.sndT = g.pipe.time; sfx.ricochet(v, kind === 'dirt' || kind === 'plant' ? 0 : kind === 'rock' ? 1 : kind === 'metal' ? 2 : kind === 'crystal' ? 3 : 4); }
  }

  // ------------------------------------------------------------ deaths
  /** Takes over a body the moment it dies. `from` is who killed it, if anyone. */
  kill(u: Unit, from: Unit | Building | null) {
    const g = this.g, o = u.obj;
    if (g.evq) { g.scene.remove(o); return; }
    // back to the plain pose before the death takes it from there
    const st = this.fl.get(u); if (st) { for (let i = 0; i < st.n; i++) st.tg[i][st.ax[i]] -= st.val[i]; st.n = 0; if (st.on) { st.on = false; const i = this.live.indexOf(st); if (i >= 0) this.live.splice(i, 1); } }
    this.unflash(o); o.visible = true;
    const recent = !!st && g.time - st.t < .25; let dx = recent ? st!.dx : 0, dz = recent ? st!.dz : 0;
    if (!recent) { if (from) { dx = u.pos.x - from.pos.x; dz = u.pos.z - from.pos.z; } const l = Math.hypot(dx, dz); if (l < .01) { const a = rr(0, 6.28); dx = Math.cos(a); dz = Math.sin(a); } else { dx /= l; dz /= l; } }
    let blast = recent && st!.blast; if (!recent && this.blastT > g.time - .12 && Math.hypot(u.pos.x - this.blastX, u.pos.z - this.blastZ) < this.blastR + 3) { blast = true; dx = u.pos.x - this.blastX; dz = u.pos.z - this.blastZ; const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l; }
    const crit = recent && st!.crit, frac = recent ? clamp(st!.amt / Math.max(1, u.maxHp), 0, 1.5) : .2, cls = clsOf(u), def = UNIT[u.kind], k = def.rad / .66, s = o.scale.x;
    const yaw = o.rotation.y, back = dx * Math.sin(yaw) + dz * Math.cos(yaw) > -.2 ? 1 : -1, vol = g.vol(u.pos);
    const b: Body = { u, obj: o, cls, style: 'flop', t: 0, s, k, com: V3(u.pos.x, def.bodyY * s + (cls === 'float' ? o.position.y : 0), u.pos.z), vel: V3(dx * 2.4, 0, dz * 2.4), h: def.bodyY * s, rest: .2 * k, sag: 0, fx: dx, fz: dz, tilt: 0, tiltV: 0, tiltTo: PI / 2, mode: 'pend', yaw, yawV: 0, delay: 0, landT: -1, lands: 0, sink: 6.5, back, r1: rr(.7, 1.3), r2: rr(-1, 1), r3: sgn(), legs: cls === 'bug' ? legsOf(o) : [], stage: 0, next: 0, vol, dx, dz, gone: false };
    o.scale.setScalar(s); if (u.rig.flash) u.rig.flash.visible = false;
    const quiet = this.off();
    if (!quiet) this.flash(o, cls === 'float' ? .16 : .09);
    if (cls === 'man') {
      const push = 2 + Math.min(1, frac) * 3.5;
      if (blast) { b.style = 'blast'; b.mode = 'spin'; b.vel.set(dx * rr(3.2, 5.5), rr(5.5, 8), dz * rr(3.2, 5.5)); b.tiltV = rr(7, 11) * back; b.yawV = rr(-7, 7); b.fx = dx * back; b.fz = dz * back; }
      else if (crit) { b.style = 'crumple'; b.mode = 'wait'; b.delay = .24; b.vel.set(dx * .8, 0, dz * .8); b.tiltV = 2.2; const a = Math.atan2(dx, dz) + rr(-1.1, 1.1); b.fx = Math.sin(a); b.fz = Math.cos(a); }
      else if (rnd() < .28) { b.style = 'spin'; b.vel.set(dx * push, 1.5, dz * push); b.yawV = rr(9, 14) * sgn(); b.tiltV = 1.2; }
      else if (frac < .14 && rnd() < .45) { b.style = 'crumple'; b.mode = 'wait'; b.delay = .3; b.vel.set(dx, 0, dz); const a = rr(0, 6.28); b.fx = Math.sin(a); b.fz = Math.cos(a); b.tiltV = 1.8; }
      else { b.vel.set(dx * push * 1.2, 2.2 + frac * 3, dz * push * 1.2); b.tiltV = 2.2 + Math.min(1, frac) * 3.5; }
      b.back = b.fx * Math.sin(yaw) + b.fz * Math.cos(yaw) > 0 ? -1 : 1;
      if (!quiet) { this.spray(T1.copy(b.com), T2.set(-dx, .4, -dz), crit ? 9 : 5, crit ? 5 : 0, 8, .9); this.puff(b.com, .5, M.dust, dx * 1.5, 1, dz * 1.5, .4); sfx.ko(vol, false); }
    } else if (cls === 'walker') {
      b.style = 'wreck'; b.mode = 'wait'; b.delay = .45; b.vel.set(0, 0, 0); b.tiltTo = rr(.95, 1.25); b.rest = 1.1 * s; b.sink = 10; const a = rnd() < .6 ? yaw + rr(-.4, .4) : Math.atan2(dx, dz); b.fx = Math.sin(a); b.fz = Math.cos(a); b.back = b.fx * Math.sin(yaw) + b.fz * Math.cos(yaw) > 0 ? -1 : 1;
      if (!quiet) sfx.ko(vol, false);
    } else if (cls === 'float') {
      const boss = !!unitRule(u.kind).heavy; b.sink = 99;
      if (boss) { b.style = 'boss'; b.mode = 'wait'; b.delay = 1.0; b.vel.set(0, 0, 0); }
      else if (blast || crit || frac > .45 || rnd() < .5) { b.style = 'shatter'; b.mode = 'wait'; b.delay = blast ? .03 : .13; b.vel.set(dx * 1.2, .9, dz * 1.2); }
      else { b.style = 'crumble'; b.vel.set(dx * 1.6, 0, dz * 1.6); b.tiltV = 1.4; b.rest = .25 * k; }
      if (!quiet) { this.spray(T1.copy(b.com), T2.set(-dx, .3, -dz), 6, 2, 7, 1); sfx.shatter(vol * .5, false, true); }
    } else {
      const big = !!unitRule(u.kind).stance?.bulk; b.rest = def.bodyY * s * .9; b.sink = 5;
      if (unitRule(u.kind).stance?.burst || blast || (!big && (frac > .7 || (crit && frac > .35)))) { b.style = 'splat'; b.mode = 'wait'; b.delay = 0; }
      else if (big) { b.style = 'crash'; b.mode = 'wait'; b.delay = .42; b.vel.set(Math.sin(yaw) * 3 + dx, 0, Math.cos(yaw) * 3 + dz); b.fx = Math.sin(yaw); b.fz = Math.cos(yaw); b.tiltTo = .3; b.rest = b.h * .25; b.sink = 7; }
      else { b.style = 'flip'; b.mode = 'spin'; const p = 2.5 + Math.min(1, frac) * 3; b.vel.set(dx * p, rr(4.2, 5.8), dz * p); b.tiltV = rr(8.5, 11.5); b.yawV = rr(-5, 5); }
      if (!quiet) { T2.set(dx, .5, dz); this.spray(T1.copy(b.com), T2, 6, 3, 6, .8, .03); this.puff(b.com, .5 * k, M.gS, dx * 1.5, 1, dz * 1.5, .4); sfx.splat(vol, false); if (b.style !== 'splat') this.splat(u.pos.x + dx * rr(.5, 1.5), u.pos.z + dz * rr(.5, 1.5), rr(.3, .5) * k); }
    }
    this.bodies.push(b);
    // only so many bodies lie about at once: the oldest go first
    let lying = 0; for (let i = this.bodies.length - 1; i >= 0; i--) { const q = this.bodies[i]; if (q.sink < 90 && ++lying > 9) q.sink = Math.min(q.sink, q.t + .2); }
  }

  /** Turns a part of a model loose as a tumbling piece of its own. */
  private release(part: THREE.Object3D, vx: number, vy: number, vz: number, life: number, kind: number) {
    if (!part.parent || part.userData.loose) return; part.userData.loose = true; BOX.setFromObject(part); if (BOX.isEmpty()) { part.parent.remove(part); return; }
    const h = new THREE.Group(), sz = BOX.getSize(T3); BOX.getCenter(h.position); this.g.scene.add(h); h.updateMatrixWorld(); h.attach(part);
    this.pieces.push({ o: h, v: V3(vx, vy, vz), w: V3(rr(-9, 9), rr(-6, 6), rr(-9, 9)), t: 0, life, r: clamp(Math.min(sz.x, sz.y, sz.z) * .5, .07, .7), hit: false, kind });
    if (this.pieces.length > 70) { const old = this.pieces.shift()!; this.g.scene.remove(old.o); }
  }
  /** Breaks a body into its named parts and throws them. Whatever is left of the model goes with the torso. */
  private burst(b: Body, power: number, up: number, life: number, kind: number, parts?: string[]) {
    const o = b.obj, r = b.u.rig, c = b.com; o.updateMatrixWorld(true);
    const list: THREE.Object3D[] = []; for (const n of parts || ['halo', 'head', 'armL', 'armR', 'arms', 'pack']) { const p = (r as any)[n] as THREE.Object3D | undefined; if (p && p.parent && p.visible && !p.userData.loose) list.push(p); }
    if (!parts) for (const l of b.legs) if (l.parent) list.push(l);
    if (!parts && r.legL) list.push(r.legL); if (!parts && r.legR) list.push(r.legR);
    for (const p of list) { p.getWorldPosition(T1); let ox = T1.x - c.x, oy = T1.y - c.y, oz = T1.z - c.z; const l = Math.hypot(ox, oy, oz) || 1; ox /= l; oy /= l; oz /= l; this.release(p, (ox * .8 + b.dx * .7) * power * rr(.6, 1.2), up * rr(.6, 1.25) + oy * power * .5, (oz * .8 + b.dz * .7) * power * rr(.6, 1.2), life * rr(.8, 1.2), kind); }
    if (!parts) { this.release(r.body, b.dx * power * .5, up * .6, b.dz * power * .5, life, kind); this.g.scene.remove(o); b.gone = true; }
  }

  update(dt: number) {
    const g = this.g; if (dt <= 0 || g.evq) return; const cam = g.cam, quiet = this.off();
    for (let i = this.flashes.length - 1; i >= 0; i--) { const f = this.flashes[i]; f.t -= dt; if (f.t <= 0) { for (const [m, mat] of f.mats) m.material = mat; this.flashes.splice(i, 1); } }
    for (const f of this.sparks) if (f.t > 0) {
      f.t -= dt; f.v.y -= 15 * dt; f.m.position.addScaledVector(f.v, dt); if (f.m.position.y < .03) { f.m.position.y = .03; f.v.y = Math.abs(f.v.y) * .35; f.v.x *= .55; f.v.z *= .55; }
      const k = Math.max(0, f.t / f.life), sp = f.v.length(), w = f.w * Math.sqrt(k) * Math.max(1, cam.position.distanceTo(f.m.position) / 16); f.m.quaternion.setFromUnitVectors(FWD, T1.copy(f.v).multiplyScalar(1 / (sp || 1))); f.m.scale.set(w, w, clamp(sp * .045, .05, .55) * (.35 + k * .65)); if (f.t <= 0) f.m.visible = false;
    }
    for (const b of this.stars) if (b.t > 0) { b.t -= dt; const k = 1 - Math.max(0, b.t) / b.life; b.g.quaternion.copy(cam.quaternion); b.g.rotateZ(b.rot); b.g.scale.setScalar(b.s * (.55 + .7 * Math.sqrt(k))); if (b.t <= 0) b.g.visible = false; }
    for (const b of this.rings) if (b.t > 0) { b.t -= dt; const k = 1 - Math.max(0, b.t) / b.life, r = b.r * (1 - (1 - k) ** 3); b.m.scale.set(r, r, 1); b.mat.opacity = (1 - k) ** 1.5; if (b.t <= 0) b.m.visible = false; }
    for (const d of this.decals) if (d.t > 0) { d.t -= dt; const age = d.life - d.t, gk = d.grow ? smooth(age / d.grow) : 1, fk = d.t < 3 ? Math.max(.001, d.t / 3) : 1, s = d.s * gk * fk; if (d.grow || d.t < 3) d.m.scale.set(Math.max(.001, s), Math.max(.001, s), 1); if (d.t <= 0) d.m.visible = false; }
    for (let i = this.pieces.length - 1; i >= 0; i--) {
      const p = this.pieces[i], o = p.o; p.t += dt; p.v.y -= 21 * dt; o.position.addScaledVector(p.v, dt); o.rotation.x += p.w.x * dt; o.rotation.y += p.w.y * dt; o.rotation.z += p.w.z * dt;
      if (o.position.y < p.r) {
        o.position.y = p.r;
        if (p.v.y < -3 && !quiet) { if (!p.hit && this.camDist(o.position) < 70) { T1.copy(o.position); T1.y = .08; if (p.kind === 2) { this.puff(T1, .3, M.gS, 0, .6, 0, .3); if (rnd() < .6) this.splat(T1.x, T1.z, rr(.12, .26)); } else { this.puff(T1, .28, M.dust, 0, .7, 0, .3); if (p.kind === 1) this.spray(T1, UPV, 2, 2, 4, 1, .016); } } p.hit = true; }
        p.v.y = p.v.y < -1.6 ? -p.v.y * .36 : 0; p.v.x *= .6; p.v.z *= .6; p.w.multiplyScalar(p.v.y ? .55 : .2); if (!p.v.y && p.v.x * p.v.x + p.v.z * p.v.z < .04) p.w.set(0, 0, 0);
      }
      if (p.t > p.life) { const k = 1 - (p.t - p.life) / .45; if (k <= 0) { g.scene.remove(o); this.pieces.splice(i, 1); } else o.scale.setScalar(Math.max(.001, k)); }
    }
    for (let i = this.bodies.length - 1; i >= 0; i--) { const b = this.bodies[i]; this.step(b, dt, quiet); if (b.gone) this.bodies.splice(i, 1); }
  }

  /** The thump of a body or a wreck meeting the ground. */
  private land(b: Body, speed: number, quiet: boolean) {
    b.lands++; if (b.landT < 0) b.landT = b.t; if (quiet) return;
    const g = this.g, k = b.k, heavy = b.cls === 'walker' || !!unitRule(b.u.kind).stance?.bulk, x = b.com.x, z = b.com.z, P = T1.set(x, .12, z), mat = b.cls === 'bug' ? M.gS : M.dust, hard = clamp(speed / 6, .35, 1.3);
    if (this.camDist(b.com) < 110) {
      const n = heavy ? 7 : b.lands > 1 ? 2 : 4; for (let j = 0; j < n; j++) { const a = j / n * 6.28 + rr(-.4, .4), r = (heavy ? 2.6 : .9) * hard; this.puff(P, (heavy ? .8 : .45) * k ** .5 * hard, heavy || b.cls !== 'bug' ? M.dust : mat, Math.cos(a) * r, heavy ? .9 : .5, Math.sin(a) * r, heavy ? .8 : .45); }
      if (b.cls === 'bug' && b.lands === 1) this.splat(x + rr(-.2, .2), z + rr(-.2, .2), rr(.3, .5) * k);
      if (b.cls === 'man' && b.lands === 1) for (let j = 0; j < 2; j++) this.bit(P, .06, M.steelD, rr(-2.5, 2.5), rr(2, 4), rr(-2.5, 2.5), .9);
    }
    if (heavy && b.lands === 1) { this.ring(x, z, 5 * k ** .5, 0xf0d9b0, .5); g.shake = Math.max(g.shake, b.vol * .9); for (let j = 0; j < 7; j++) this.bit(P, .16, j % 2 ? M.steelD : M.rust, rr(-6, 6), rr(3, 8), rr(-6, 6), 1.4); if (b.cls === 'walker') for (let j = 0; j < 4; j++) g.chunk(V3(x + rr(-1, 1), rr(.8, 2), z + rr(-1, 1)), rr(.3, .55), j % 2 ? M.steelD : M.yellow, 7, V3(x, 0, z), true); }
    if (b.vol > .03 && (heavy || g.pipe.time - this.fallT > .05)) { this.fallT = g.pipe.time; sfx.bodyfall(b.vol * (b.lands > 1 ? .5 : 1) * hard, heavy ? 2 : b.cls === 'bug' ? 1 : 0); }
  }

  private step(b: Body, dt: number, quiet: boolean) {
    const g = this.g, o = b.obj, r = b.u.rig; b.t += dt; const t = b.t, ease = Math.min(1, dt * 16), ez = (q: THREE.Object3D | undefined, a: 'x' | 'y' | 'z', to: number, kk = ease) => { if (q) q.rotation[a] += (to - q.rotation[a]) * kk; };
    // -------- breaking apart instead of falling
    if (b.style === 'splat') { if (!quiet) { const c = b.com, k = b.k; for (let j = 0; j < 6; j++) { const a = j / 6 * 6.28; this.puff(c, .55 * k, j % 2 ? M.gS : M.gGlow, Math.cos(a) * 2.2, rr(.6, 2), Math.sin(a) * 2.2, .5); } this.spray(c, UPV, 12, 3, 8, 1.4, .034); for (let j = 0; j < 7; j++) this.bit(c, .1 * k, j % 3 ? M.gS : M.gH, rr(-5, 5) + b.dx * 2, rr(2, 7), rr(-5, 5) + b.dz * 2, 1.2); this.star(c, .8 * k, 3, .14); this.splat(c.x, c.z, rr(.7, 1) * k); for (let j = 0; j < 3; j++) { const d = rr(1, 3.2); this.splat(c.x + b.dx * d + rr(-.8, .8), c.z + b.dz * d + rr(-.8, .8), rr(.2, .45) * k); } sfx.splat(b.vol, true); } this.burst(b, 5.5, 5.5, 2.4, 2); return; }
    if (b.style === 'shatter' || b.style === 'boss') {
      const boss = b.style === 'boss', k = b.k, c = b.com;
      if (t < b.delay) {
        // held for a beat: lit from inside, shaking, cracks spitting light
        const u = t / b.delay, j = (boss ? .06 : .035) * (.4 + u); o.position.set(c.x + rr(-j, j), c.y - b.h + (boss ? -u * u * 1.1 : u * .12) + rr(-j, j), c.z + rr(-j, j));
        if (boss) { ez(r.body, 'x', .38 * u); ez(r.armL, 'x', .7); ez(r.armR, 'x', .7); ez(r.head, 'x', .5); if (r.halo) r.halo.rotation.z += dt * (4 + u * 30); }
        else if (r.halo) r.halo.rotation.z += dt * 30;
        if (t > b.next) { b.next = t + (boss ? Math.max(.07, .26 * (1 - u)) : .07); if (!quiet) { this.flash(o, .05); T1.set(c.x + rr(-.5, .5) * k, c.y + rr(-.6, 1) * k, c.z + rr(-.5, .5) * k); this.spray(T1, UPV, boss ? 5 : 3, 2, 6, 1.4); if (boss) { this.bit(T1, .16, M.crys, rr(-4, 4), rr(2, 6), rr(-4, 4)); this.star(T1, .5, 2, .08); sfx.shatter(b.vol * .35, false, true); } } }
        return;
      }
      if (!quiet) {
        this.unflash(o); T1.copy(c); if (boss) T1.y -= .6;
        this.star(T1, (boss ? 3.2 : 1) * k ** .5, 5, boss ? .2 : .14); this.spray(T1, UPV, boss ? 26 : 14, 2, boss ? 13 : 9, 1.5, boss ? .04 : .026); this.spray(T1, UPV, boss ? 10 : 5, 5, 7, 1.5);
        for (let j = 0; j < (boss ? 14 : 8); j++) this.bit(T1, (boss ? .26 : .12), j % 3 ? M.crys : M.indigo, rr(-6, 6) + b.dx * 2, rr(2, 8), rr(-6, 6) + b.dz * 2, 1.5);
        for (let j = 0; j < (boss ? 5 : 3); j++) { const a = j / 3 * 6.28 + rr(0, 2); this.puff(T1, (boss ? 1.4 : .42), j % 2 ? M.teal : M.cyan, Math.cos(a) * 2.5, rr(.4, 1.6), Math.sin(a) * 2.5, .5); }
        this.ring(c.x, c.z, (boss ? 9 : 3.2), 0x8ff2ff, boss ? .6 : .38); this.dust(c.x, c.z, boss ? 3 : 1.1, boss ? 12 : 6);
        if (boss) { g.shake = Math.max(g.shake, b.vol * 1.2); g.pipe.flash = Math.max(g.pipe.flash, b.vol * .55); for (let j = 0; j < 9; j++) g.chunk(V3(c.x + rr(-1.5, 1.5), rr(.8, 3.4), c.z + rr(-1.5, 1.5)), rr(.3, .7), j % 3 ? M.crys : M.indigo, 9, V3(c.x, 0, c.z)); }
        sfx.shatter(b.vol, boss, false);
      }
      this.burst(b, boss ? 8 : 5.5, boss ? 8 : 5.5, boss ? 3.4 : 2.6, 1); return;
    }
    // -------- the body as one falling thing
    if (b.mode === 'wait') {
      const u = clamp(t / b.delay, 0, 1);
      if (b.style === 'crumple') { b.sag = .42 * b.s * u * u; ez(r.legL, 'x', .95 * b.r1); ez(r.legR, 'x', -.55); ez(r.legL, 'z', -.22); ez(r.legR, 'z', .22); ez(r.body, 'x', .42 * u); ez(r.head, 'x', t < .09 ? -.8 : .55); ez(r.arms, 'x', .45); ez(r.armL, 'x', .3); ez(r.armR, 'x', .3); }
      else if (b.style === 'wreck') {
        b.sag = .8 * b.s * u * u; ez(r.legL, 'z', -.6 * u, 1); ez(r.legR, 'z', .6 * u, 1); ez(r.legL, 'x', .9 * u * b.r3, 1); ez(r.legR, 'x', -.9 * u * b.r3, 1); ez(r.arms, 'x', .75, ease * .3); ez(r.head, 'x', .4, ease * .3); b.tilt = .12 * u * u;
        if (t > b.next && !quiet) { b.next = t + .09; T1.set(b.com.x + rr(-.8, .8), b.h + rr(-.6, .8), b.com.z + rr(-.8, .8)); this.spray(T1, UPV, 4, rnd() < .5 ? 0 : 1, 7, 1.4); this.puff(T1, .7, M.smoke, 0, 1.8, 0, .6); }
      }
      else if (b.style === 'crash') { b.sag = .5 * b.h * u * u; b.tilt = .1 * u; }
      if (t >= b.delay) { b.mode = 'pend'; if (b.style === 'wreck') { b.tiltV = 1.1; this.land(b, 7, quiet); } else if (b.style === 'crash') { b.tiltV = 1.5; this.land(b, 6, quiet); } }
    }
    b.vel.y -= 22 * dt; b.com.addScaledVector(b.vel, dt);
    let minY = Math.max(b.rest + (b.h - b.rest) * Math.abs(Math.cos(b.tilt)) - b.sag, b.rest * .8);
    if (b.mode === 'pend') {
      b.tiltV += (b.style === 'wreck' ? 6 : b.style === 'crash' ? 9 : 15) * Math.sin(Math.max(b.tilt, .06)) * dt; b.tilt += b.tiltV * dt;
      if (b.tilt >= b.tiltTo) { const sp = b.tiltV * b.h; b.tilt = b.tiltTo; b.mode = 'rest'; b.tiltV = 0; minY = Math.max(b.rest + (b.h - b.rest) * Math.abs(Math.cos(b.tilt)) - b.sag, b.rest * .8); b.com.y = minY; if (b.style !== 'wreck') b.vel.y = Math.min(2.6, sp * .22); this.land(b, sp, quiet); if (b.style === 'crumble') { this.crumbleEnd(b, quiet); return; } }
    } else if (b.mode === 'spin') {
      b.tilt += b.tiltV * dt;
      if (t > .12 && b.com.y <= minY && b.vel.y <= 0) { b.mode = 'settle'; b.tiltTo = b.cls === 'bug' ? (2 * Math.round((b.tilt - PI) / (2 * PI)) + 1) * PI : Math.round((b.tilt - PI / 2) / PI) * PI + PI / 2; }
    } else if (b.mode === 'settle') { b.tiltV += ((b.tiltTo - b.tilt) * 150 - b.tiltV * 19) * dt; b.tilt += b.tiltV * dt; }
    if (b.com.y <= minY) {
      if (b.vel.y < -2.4 && b.mode !== 'pend' && b.mode !== 'wait') { const sp = -b.vel.y; b.vel.y = sp * .3; this.land(b, sp, quiet); } else if (b.vel.y < 0) b.vel.y = 0;
      b.com.y = minY; const f = Math.max(0, 1 - dt * (b.mode === 'pend' ? 2.5 : 5.5)); b.vel.x *= f; b.vel.z *= f; b.yawV *= Math.max(0, 1 - dt * 4);
      if (!quiet && b.style === 'blast' && b.vel.x * b.vel.x + b.vel.z * b.vel.z > 3 && t > b.next) { b.next = t + .07; this.puff(T1.set(b.com.x, .1, b.com.z), .4, M.dust, 0, .5, 0, .4); }
    }
    b.yaw += b.yawV * dt; if (b.style === 'spin') b.yawV *= Math.max(0, 1 - dt * 2.2);
    // lay the model over its centre
    const st = Math.sin(b.tilt), ct = Math.cos(b.tilt), hh = b.h;
    Q1.setFromAxisAngle(T1.set(b.fz, 0, -b.fx), b.tilt); Q2.setFromAxisAngle(UPV, b.yaw); o.quaternion.multiplyQuaternions(Q1, Q2);
    o.position.set(b.com.x - b.fx * st * hh, b.com.y - ct * hh, b.com.z - b.fz * st * hh);
    // limbs
    const land = b.landT >= 0 ? t - b.landT : -1, wob = land >= 0 ? Math.exp(-5 * land) * Math.cos(17 * land) : 0, air = land < 0, sg = b.back;
    if (b.cls === 'man' && b.mode !== 'wait') {
      const k = smooth(t / .16), flail = b.style === 'blast' && air ? Math.sin(t * 15 + b.r2 * 3) : 0, lk = air ? 0 : smooth(land / .3);
      const limp = b.style === 'crumple', A = limp ? .35 * (1 - lk) + .15 * lk + wob * .2 : -sg * ((1.5 + .7 * b.r1) * k * (1 - lk) + (2.75 + .2 * b.r2) * lk) + flail * .6 + wob * .25;
      ez(r.arms, 'x', A * .62); ez(r.arms, 'z', b.r2 * .5 * k); ez(r.armL, 'x', r.arms ? A * .3 : A * (.85 + .2 * b.r2)); ez(r.armR, 'x', A * (1.05 - .2 * b.r2)); ez(r.armL, 'z', -.55 * k * (r.arms ? .3 : 1)); ez(r.armR, 'z', .55 * k);
      ez(r.legL, 'x', air ? -sg * (.85 * b.r1) * k + flail * .5 : -sg * .22 * b.r1 + wob * .35); ez(r.legR, 'x', air ? sg * .3 * k - flail * .5 : sg * .14 - wob * .25); ez(r.legL, 'z', -.16 * k - (air ? 0 : .1)); ez(r.legR, 'z', .16 * k + (air ? 0 : .12 * b.r1));
      ez(r.head, 'x', air ? -sg * .5 * k : -sg * .12 + wob * .2); ez(r.head, 'y', air ? 0 : b.r2 * .6); ez(r.body, 'x', air ? -sg * .24 * k : wob * .08); ez(r.body, 'z', 0);
    } else if (b.cls === 'walker' && b.mode !== 'wait') {
      ez(r.arms, 'x', .9 + wob * .2, ease * .4); ez(r.head, 'x', .5 + wob * .2, ease * .4);
      if (!quiet && b.mode === 'rest' && t < 6 && t > b.next) { b.next = t + rr(.16, .34); T1.set(b.com.x + rr(-1, 1), b.com.y + rr(.2, 1.2), b.com.z + rr(-1, 1)); this.puff(T1, rr(.9, 1.5), rnd() < .25 ? M.fire : M.smoke, rr(-.3, .3), 2.4, rr(-.3, .3), .9); if (rnd() < .3) this.spray(T1, UPV, 3, 1, 6, 1.4); }
    } else if (b.cls === 'float') {
      // 'crumble': the light goes out and the parts drop off one at a time on the way down
      if (r.halo && !r.halo.userData.loose) r.halo.rotation.z += dt * 14;
      const drop = (name: string, at: number, up: number) => { const p = (r as any)[name] as THREE.Object3D | undefined; if (p && p.parent && p.visible && !p.userData.loose && t >= at) { o.updateMatrixWorld(true); this.release(p, b.dx * rr(.5, 2.5) + rr(-1.5, 1.5), up, b.dz * rr(.5, 2.5) + rr(-1.5, 1.5), rr(2.6, 3.4), 1); if (!quiet) { p.getWorldPosition(T1); this.spray(T1, UPV, 3, 2, 5, 1.3); this.flash(o, .04); } } };
      drop('halo', .04, 5.5); drop('armL', .13, 2); drop('arms', .16, 2.5); drop('armR', .22, 2); drop('head', .3, 3.4);
    } else if (b.cls === 'bug') {
      // on its belly the legs give and splay; on its back they stand up, twitch, and curl in over the belly
      const flat = b.style === 'crash', curl = flat ? smooth(t / .4) * .85 : air ? .4 : -smooth(land / .5) * .75, tw = air ? (flat ? .12 : 0) : Math.exp(-2.2 * land) * .32;
      for (let j = 0; j < b.legs.length; j++) { const l = b.legs[j], sx = l.name[3] === 'L' ? -1 : 1; l.rotation.z += (sx * curl + Math.sin(t * 31 + j * 2.1) * tw - l.rotation.z) * ease; l.rotation.y += (Math.sin(t * 23 + j) * tw * .6 - l.rotation.y) * ease; }
      ez(r.head, 'x', flat ? .3 * smooth(t / .4) + wob * .15 : air ? -.3 : .35 + wob * .2); ez(r.arms, 'x', air && !flat ? -.4 : .5); ez(r.body, 'x', 0);
      // the body lets go and the pool spreads
      if (!air && b.stage === 0) { b.stage = 1; if (!quiet) this.splat(b.com.x, b.com.z, (unitRule(b.u.kind).stance?.bulk ? 2.2 : .75) * b.k ** .5, 2.2); }
      if (!air && land > 1.1) { const d = smooth((land - 1.1) / 1.3); o.scale.set(b.s * (1 + d * .12), b.s * (1 - d * .45), b.s * (1 + d * .12)); }
    }
    // gone into the ground
    if (t > b.sink) { const k = (t - b.sink) / .9; o.position.y -= k * k * 1.2 * b.k; const s = b.s * Math.max(.001, 1 - k * k); o.scale.set(s, Math.min(o.scale.y, s), s); if (k >= 1) { g.scene.remove(o); b.gone = true; } }
  }
  /** A Veyl body that came down in one piece breaks on the ground. */
  private crumbleEnd(b: Body, quiet: boolean) {
    const g = this.g, c = b.com;
    if (!quiet) {
      T1.set(c.x, .3, c.z); this.spray(T1, UPV, 10, 2, 8, 1.4); for (let j = 0; j < 6; j++) this.bit(T1, .11, j % 3 ? M.crys : M.indigo, rr(-4, 4), rr(2, 6), rr(-4, 4), 1.4);
      for (let j = 0; j < 4; j++) { const a = j / 4 * 6.28; this.puff(T1, .5, j % 2 ? M.teal : M.dust, Math.cos(a) * 1.8, .8, Math.sin(a) * 1.8, .45); }
      this.ring(c.x, c.z, 2.4, 0x8ff2ff, .34); this.dust(c.x, c.z, .9, 5); this.star(T1, .7, 2, .12); sfx.shatter(b.vol, false, false);
      for (let j = 0; j < 3; j++) g.chunk(V3(c.x + rr(-.4, .4), rr(.2, .6), c.z + rr(-.4, .4)), rr(.14, .26), j % 2 ? M.crys : M.indigo, 4, V3(c.x - b.dx, 0, c.z - b.dz));
    }
    this.burst(b, 3.2, 3.6, 2.2, 1);
  }
}

/** A Gloam body's legs, found by name once and remembered on the model. */
function legsOf(obj: THREE.Object3D): THREE.Object3D[] {
  return obj.userData.legs || (obj.userData.legs = (() => { const out: THREE.Object3D[] = []; obj.traverse(o => { if (/^lg\d[LR]$/.test(o.name)) out.push(o); }); return out; })());
}
