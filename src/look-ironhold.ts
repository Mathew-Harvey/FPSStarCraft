// The new Ironhold figures (stream E of the full-depth build): how each is put together from its sculpt, how it stands, moves and works,
// what its first person view is, and sketches of its ability effects. This file moves to src/factions/ironhold/look/ once that folder
// exists (stream A); the rules for these units live with the Ironhold rules stream (B), which calls `animate` once a frame per body.
//
// Everything here is for show. It reads no dice (variety comes from a plain hash of the body's number) and changes no rule, so it cannot
// move a bot result, and the match server, which carries no meshes, never gets past `model` returning null.
import * as THREE from 'three';
import { figure } from './meshes';
import { M } from './gfx';
import { put, can } from './units';
import { rbox, ring } from './sculpt';

/** The new Ironhold kinds this file draws (batch 1). */
export const KINDS = ['sapper', 'hauldrone', 'dustbike', 'piledriver'] as const;
export type Kind = typeof KINDS[number];
type Groups = Record<string, THREE.Group>;
export interface Fig { root: THREE.Group; groups: Groups; points: Record<string, { group: THREE.Group; at: [number, number, number] }> }

/** A figure ready to stand in the world, or null on the match server (which carries no meshes). The ore in the drone's bin starts hidden. */
export function model(kind: Kind): Fig | null {
  const f = figure(kind) as Fig | null; if (!f) return null;
  f.root.userData.kind = kind; f.root.userData.groups = f.groups; f.root.userData.points = f.points;
  if (f.groups.pack) f.groups.pack.visible = false;
  if (kind === 'sapper') { const sat = satchelIn(f); sat.visible = false; f.groups.satchel = sat; }
  rest(f); return f;
}
/** Copies the named parts of a figure into a new group, each where it stands relative to `to` (the group the copy will hang from).
 *  The copies share geometry and paint with the figure, so they cost a draw call each and no memory. */
function copyParts(f: Fig, names: string[], to: THREE.Object3D) {
  f.root.updateMatrixWorld(true); const inv = to.matrixWorld.clone().invert(), out = new THREE.Group();
  f.root.traverse(o => { const m = o as THREE.Mesh; if (!m.isMesh || !names.includes(m.name)) return; const c = m.clone(); new THREE.Matrix4().multiplyMatrices(inv, m.matrixWorld).decompose(c.position, c.quaternion, c.scale); out.add(c); });
  return out;
}
const centre = (o: THREE.Object3D) => { o.updateMatrixWorld(true); return new THREE.Box3().setFromObject(o).getCenter(new THREE.Vector3()); };
/** The Sapper's charge in hand: a second stick bundle, like the one on his back, gripped in the left glove. Shown while he sets one. */
function satchelIn(f: Fig) {
  const arms = f.groups.arms, hand = copyParts(f, ['gloveL'], arms), at = centre(hand), sat = copyParts(f, ['bundle', 'bundletape', 'bundlefuse'], f.root);
  const mid = centre(sat); for (const c of sat.children) { c.position.sub(mid); c.name = 'held ' + c.name; }   // renamed, so copies of the figure never pick these up twice
  const g = new THREE.Group(); g.add(sat); sat.rotation.set(1.2, .3, 0); g.position.copy(at).add(new THREE.Vector3(0, -.02, .06)); g.name = 'satchel'; arms.add(g); return g;
}
/** Remembers every group's sculpted place and turn, so a pose is always laid over the same start and never drifts. */
function rest(f: Fig) { for (const k in f.groups) { const g = f.groups[k]; g.userData.r0 = g.rotation.clone(); g.userData.p0 = g.position.clone(); } }
function reset(gs: Groups) { for (const k in gs) { const g = gs[k], r = g.userData.r0 as THREE.Euler | undefined, p = g.userData.p0 as THREE.Vector3 | undefined; if (r) g.rotation.copy(r); if (p) g.position.copy(p); } }

/** What a body is doing this frame. The rules stream fills it from its own unit record. */
export interface State {
  /** seconds on the game clock */ t: number;
  /** the body's number: picks its rest pose and keeps neighbours out of step */ id: number;
  /** 0 standing, 1 walking or rolling at cruise, up to 1.6 at a run or a boost */ speed: number;
  /** distance covered, in metres (wheels, tracks and legs follow it) */ dist: number;
  /** 0..1, how far into a shot's kick (1 the moment it fires) */ kick: number;
  /** aim: up (+) or down, radians */ pitch: number;
  /** turret or bars turned off the body's own heading, radians */ aim: number;
  /** mining, building, digging in, satchel in hand: whatever its work is */ work: boolean;
  /** carrying ore (the drone shows its load) */ load: boolean;
  /** Pile Driver: 0 on the road, 1 anchored; anything between is the 3 s change-over */ anchor: number;
  /** seconds stood with nothing to do: after a few the body settles into a rest pose */ idle: number;
}
const hash = (a: number, b: number) => { const v = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return v - Math.floor(v); };
const ease = (k: number) => k * k * (3 - 2 * k);
const clamp = (k: number) => Math.max(0, Math.min(1, k));

/** Poses a new Ironhold body for this frame: lays the state over the sculpted rest every time. */
export function animate(kind: Kind, f: Fig, s: State) {
  const g = f.groups, t = s.t; reset(g);
  const settle = ease(clamp((s.idle - 2.5 - hash(s.id, 1) * 4) / 1.2)), restI = Math.floor(hash(s.id, 2) * 3);
  if (kind === 'sapper') {
    // a man on foot: legs swing with distance, the carbine comes up when he fires, and at rest he leans, crouches over his charges, or
    // sits on the cord reel he has set down. Working (digging a mine in, setting a satchel) he kneels and works the spade.
    const ph = s.dist * 3.4, sw = Math.min(1, s.speed) * .75, run = clamp(s.speed - 1);
    g.legL.rotation.x = Math.sin(ph) * sw; g.legR.rotation.x = -Math.sin(ph) * sw; f.root.position.y = s.speed > .05 ? Math.abs(Math.cos(ph)) * (.05 + run * .05) : 0;
    g.body.rotation.x = s.speed * .1 + run * .12; g.body.rotation.z = s.speed > .05 ? Math.sin(ph) * .04 : 0;
    g.arms.rotation.x = -s.pitch * .8 + (s.speed > .05 && s.kick <= 0 ? .3 : 0) - s.kick * .12; g.arms.position.z += -s.kick * .06;
    if (g.satchel) g.satchel.visible = s.work;
    if (s.work) {          // down on one knee, the body over the hole, the arms going up and down
      const dig = Math.sin(t * 6 + s.id) * .5 + .5;
      g.legR.rotation.x = -1.35; g.legL.rotation.x = .2; f.root.position.y = -.38; g.body.rotation.x = .55 - dig * .2; g.arms.rotation.x = .9 + dig * .5; g.head.rotation.x = .3;
    } else if (s.speed < .05 && s.kick <= 0 && settle > 0) {
      const k = settle;
      if (restI === 0) { g.body.rotation.z += .06 * k; g.legL.rotation.z = -.08 * k; g.legR.rotation.z = .02 * k; g.arms.rotation.x += .7 * k; g.head.rotation.y = .5 * k * Math.sin(t * .3 + s.id); }
      else if (restI === 1) { g.legL.rotation.x = -1.2 * k; g.legR.rotation.x = .25 * k; f.root.position.y = -.33 * k; g.body.rotation.x += .4 * k; g.arms.rotation.x += 1.0 * k; g.head.rotation.x = .35 * k; }   // crouched, counting his charges
      else { g.legL.rotation.x = -1.45 * k; g.legR.rotation.x = -1.45 * k; g.legL.rotation.z = -.25 * k; g.legR.rotation.z = .25 * k; f.root.position.y = -.48 * k; g.body.rotation.x += -.15 * k; g.arms.rotation.x += .85 * k; }  // sat down
    }
  } else if (kind === 'hauldrone') {
    // it never touches the ground: it bobs, tips into the way it is going, spins its fans faster when loaded or in a hurry, and swings the
    // drill boom down onto the seam to work. At rest it sinks lower and idles its fans.
    // At rest it comes down onto its skids: fans run down to a slow turn, the boom folds up under the nose and the eye droops, so a
    // parked drone reads from across the yard as sat down, not hovering.
    const land = s.work || s.speed > .05 || s.load ? 0 : settle, up = 1 - land;
    const bob = Math.sin(t * 2.3 + s.id) * .05 * up;
    f.root.position.y = (.35 + bob + (s.load ? -.06 : 0)) * up - .53 * land;
    g.body.rotation.x = s.speed * .16 + land * .05; g.body.rotation.z = Math.sin(t * 1.7 + s.id) * .03 * up;
    const spin = (14 + s.speed * 12 + (s.load ? 6 : 0)) * t;
    for (let i = 0; i < 4; i++) if (g['rotor' + i]) g['rotor' + i].rotation.y = (spin * up + t * 1.2 * land) * (i % 2 ? -1 : 1) + i;
    if (g.pack) g.pack.visible = s.load;
    g.arms.rotation.x = s.work ? .7 + Math.sin(t * 30 + s.id) * .04 : -.15 - land * .55;
    g.head.rotation.y = s.work ? 0 : Math.sin(t * .6 + s.id * 3) * .5 * up + land * .25; g.head.rotation.x = s.work ? .35 : .1 + land * .4;
  } else if (kind === 'dustbike') {
    // wheels roll with distance, the bike leans into turns (aim stands in for the turn), the rider tucks at a boost, and at rest he sits
    // up, puts a boot down and looks about.
    const roll = s.dist / .4;
    g.wheelR.rotation.x = roll; g.wheelF.rotation.x = s.dist / .36;
    g.arms.rotation.y = s.aim * .4; g.body.rotation.z = -s.aim * .3 * Math.min(1, s.speed);
    const boost = clamp(s.speed - 1); g.body.rotation.x = -boost * .08; g.head.rotation.x = boost * .3;
    f.root.position.y = s.speed > .05 ? Math.abs(Math.sin(s.dist * 2.1)) * .03 : 0;
    if (s.kick > 0) g.arms.position.z -= s.kick * .03;
    if (s.speed < .05) {
      // stopped: the boots come off the pegs at once; parked a while, the bike sags over on its stand, the bars swing to full lock,
      // both legs hang out wide and the rider twists round to look back. Lean, bars and the splayed legs read from across the yard.
      const k = Math.max(.35, settle);
      g.body.rotation.z = .3 * k; g.body.rotation.x = 0; g.arms.rotation.y = .6 * k;
      g.legL.rotation.z = -.5 * k; g.legR.rotation.z = .5 * k; g.legL.rotation.x = .25 * k; g.legR.rotation.x = -.15 * k;
      g.head.rotation.y = (.9 + Math.sin(t * .4 + s.id) * .25) * settle; g.head.rotation.x = -.1 * settle;
    }
  } else if (kind === 'piledriver') {
    // tracks run with distance; the turret turns to aim; anchoring drops the four stakes and lifts the gun, in that order; each shot
    // throws the drop weight back up the frame and lets it fall.
    const a = s.anchor, legs = ease(clamp(a * 1.6)), lift = ease(clamp(a * 1.6 - .6));
    for (let i = 0; i < 4; i++) { const st = g['stake' + i]; if (st) st.rotation.z = (i % 2 ? 1 : -1) * 2.53 * (1 - legs); }
    g.arms.rotation.x = .55 * (1 - lift) - s.pitch * lift; g.head.rotation.y = s.aim * (a >= 1 ? 1 : .3);
    if (g.ram) g.ram.position.z -= Math.sin(clamp(s.kick) * Math.PI) * .35;
    for (const k of ['trackL', 'trackR']) if (g[k]) g[k].position.y += (s.speed > .05 ? Math.sin(s.dist * 9) * .01 : 0);
    g.body.rotation.x = a > 0 ? 0 : -s.speed * .03 + (s.kick > 0 ? -s.kick * .05 : 0); f.root.position.y = legs * .08;
  }
}

/** First person: where the eye sits in the figure (its own space, metres) and which groups are hidden so the camera is not inside them.
 *  Every new body is drivable this way: the player sees the body's own hands, bars, boom or gun frame from where its crew would sit. */
// vm: this kind has a view model (see viewModel below) to hang on the camera.
export const FIRST: Record<Kind, { eye: [number, number, number]; hide: string[]; fov: number; /** how far the look drops over 3 m ahead */ drop: number; vm?: boolean }> = {
  sapper: { eye: [0, 1.66, .12], hide: ['head', 'arms'], fov: 70, drop: .12, vm: true },
  hauldrone: { eye: [0, 1.05, .62], hide: ['head', 'arms'], fov: 80, drop: .5, vm: true },   // from the camera eye itself, framed by its housing, the boom reaching out below
  dustbike: { eye: [0, 1.62, .14], hide: ['head'], fov: 76, drop: .8 },           // the rider's eyes: bars, burner and tank ahead
  piledriver: { eye: [-.62, 2.12, -.45], hide: [], fov: 66, drop: .25 },  // head out of the cab hatch, looking past the frame along the barrel
};

/** A first person view model: the body's own sculpted hands, gun or boom, copied out of the figure and hung in front of the camera
 *  (add it to the camera; camera space is x right, y up, -z ahead). Built once per body kind and reused.
 *  - sapper 'gun': both gloves on the drum carbine, held across the body the way the Linesman holds his rifle.
 *  - sapper 'charge': the carbine slung low on the right, the left glove holding a charge bundle out ahead, ready to set.
 *  - hauldrone: the camera eye's own frame, bolted round the view, with the drill boom reaching out under it.
 *  Kinds without one (the Dustbike and Pile Driver) are driven from their seat and see their bars or gun in the world. */
export function viewModel(kind: Kind, mode: 'gun' | 'charge' = 'gun'): THREE.Group | null {
  const f = model(kind); if (!f) return null;
  const out = new THREE.Group(); out.name = 'vm:' + kind;
  // copies parts into figure space, then turns them so the figure's forward (+z) is the camera's (-z) and the eye is the origin
  // (mirrored across x as well, so the right hand is on the right of the screen, where every other view model holds its gun)
  const fromEye = (names: string[], eye: [number, number, number]) => { const c = copyParts(f, names, f.root), turn = new THREE.Group(); turn.rotation.y = Math.PI; turn.scale.x = -1; c.position.set(-eye[0], -eye[1], -eye[2]); turn.add(c); return turn; };
  const cam = (v: THREE.Vector3, eye: [number, number, number]) => new THREE.Vector3(v.x - eye[0], v.y - eye[1], eye[2] - v.z);
  const about = (o: THREE.Object3D, pivot: THREE.Vector3) => { const g = new THREE.Group(); g.position.copy(pivot); o.position.sub(pivot); g.add(o); return g; };
  if (kind === 'sapper') {
    // forearms and gloves only (the sleeves would start in front of the eye). Each forearm is swung about its glove so its open end
    // runs out of the bottom corner of the screen, the way a held gun's arms come up from below.
    const E: [number, number, number] = [-.08, 1.55, -.55], at = (n: string) => cam(centre(copyParts(f, [n], f.root)), E);
    const gun = ['receiver', 'barrel', 'shroud', 'brake', 'drum', 'grip', 'stock', 'sights'];
    const arm = (side: 'L' | 'R', rx: number, ry: number) => { const g = about(fromEye(['vambrace' + side, 'cuffband' + side, 'elbow' + side, 'glove' + side], E), at('glove' + side)); g.rotation.set(rx, ry, 0); return g; };
    if (mode === 'gun') { const all = new THREE.Group(); all.add(fromEye(gun, E), arm('R', .7, .5), arm('L', .8, .35)); out.add(all); }
    else {
      const R = new THREE.Group(); R.add(fromEye(gun, E), arm('R', .7, .5)); const Rp = about(R, at('gloveR')); Rp.rotation.set(-.4, .3, -.25); Rp.position.add(new THREE.Vector3(.06, -.06, .04)); out.add(Rp);
      // the left glove is brought up to the lower left of the view (the arm pivots about the glove, so its place is the glove's),
      // holding a bundle like the one on his back, fuse up
      const L = arm('L', .9, .4), sat = copyParts(f, ['bundle', 'bundletape', 'bundlefuse'], f.root), mid = centre(sat);
      for (const c of sat.children) c.position.sub(mid);
      sat.scale.setScalar(.75); sat.rotation.set(-.35, .2, .3); sat.position.set(.0, .1, -.03);
      L.position.set(-.2, -.3, -.62); L.add(sat); out.add(L);
    }
  } else if (kind === 'hauldrone') {
    // the camera eye's own port: a dark plate with a round window, a steel lip with bolts round it, a hazard strip along the bottom
    // and a red lamp that shows the camera is live
    const z = -.2, r = .232, plate = new THREE.Shape(); plate.moveTo(-.6, -.45); plate.lineTo(.6, -.45); plate.lineTo(.6, .45); plate.lineTo(-.6, .45); plate.lineTo(-.6, -.45);
    const hole = new THREE.Path(); hole.absarc(0, 0, r, 0, Math.PI * 2, true); plate.holes.push(hole);
    put(new THREE.ShapeGeometry(plate, 48), M.gunm, out, [0, 0, z - .01]);
    put(ring(r, .016, 1, 64), M.bS, out, [0, 0, z]);
    for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2 + Math.PI / 8; put(can(.009, .012), M.nS, out, [Math.cos(a) * (r + .022), Math.sin(a) * (r + .022), z + .004], [Math.PI / 2, 0, 0]); }
    put(rbox(.3, .014, .01, .004), M.haz, out, [0, -r - .03, z]);
    put(can(.01, .01), M.red, out, [-r - .02, r - .02, z + .004], [Math.PI / 2, 0, 0]);
    // the boom, swung up from under the camera so its bit sits in the bottom of the window
    const E: [number, number, number] = [0, 1.05, .62], boom = about(fromEye(['boom', 'boomram', 'bit', 'chuck'], E), cam(new THREE.Vector3(0, .86, .42), E));
    boom.rotation.x = .6; boom.position.set(0, -.3, -.05); out.add(boom);
  } else return null;
  out.userData.kind = kind; out.userData.mode = mode; return out;
}

// ---------------------------------------------------------------- ability effects: sketches until stream H's effect kit lands
// Each returns an object to add to the scene and a step function; step(dt) returns false when the effect is over and can be removed.
export interface Fx { obj: THREE.Object3D; step: (dt: number) => boolean }
const dustMat = () => new THREE.MeshBasicMaterial({ color: 0xd9a46a, transparent: true, opacity: .7, depthWrite: false });
const fireMat = () => new THREE.MeshBasicMaterial({ color: 0xffb23a, transparent: true, opacity: .95, depthWrite: false, blending: THREE.AdditiveBlending });
function puffs(n: number, mat: THREE.Material, r: number) { const g = new THREE.Group(), geo = new THREE.IcosahedronGeometry(1, 1); for (let i = 0; i < n; i++) { const m = new THREE.Mesh(geo, mat); const a = i / n * Math.PI * 2; m.userData.d = new THREE.Vector3(Math.cos(a), .3 + hash(i, 7) * .4, Math.sin(a)); m.scale.setScalar(r); g.add(m); } return g; }

/** Shaft Mine: the Sapper digs in. A ring of dust kicks out, a mound rises, and a scrap of red flag is left over the buried charge. */
export function shaftMine(at: THREE.Vector3): Fx {
  const g = new THREE.Group(); g.position.copy(at); const dm = dustMat(), ring = puffs(10, dm, .25); g.add(ring);
  const mound = new THREE.Mesh(new THREE.SphereGeometry(.5, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshLambertMaterial({ color: 0x9a6a44 })); mound.scale.set(1, 0, 1); g.add(mound);
  const flag = new THREE.Mesh(new THREE.PlaneGeometry(.18, .12), new THREE.MeshBasicMaterial({ color: 0xd8382a, side: THREE.DoubleSide })); flag.position.set(.2, .35, 0); flag.visible = false; g.add(flag);
  let t = 0;
  return { obj: g, step(dt) { t += dt; for (const m of ring.children) { m.position.copy(m.userData.d).multiplyScalar(t * 1.6); m.scale.setScalar(.25 + t * .5); } dm.opacity = Math.max(0, .7 - t * .5); mound.scale.y = Math.min(.35, t * .3); flag.visible = t > 1; flag.rotation.y = Math.sin(t * 5) * .3; return t < 30; } };
}
/** Satchel: the charge goes off against a building. A white flash, a fireball, then a column of brown smoke. */
export function satchel(at: THREE.Vector3): Fx {
  const g = new THREE.Group(); g.position.copy(at); const fm = fireMat(), ball = puffs(12, fm, .4), dm = dustMat(), smoke = puffs(8, dm, .5); g.add(ball, smoke);
  let t = 0;
  return { obj: g, step(dt) { t += dt; for (const m of ball.children) { m.position.copy(m.userData.d).multiplyScalar(t * 4); m.scale.setScalar(.4 + t * 2.5); } fm.opacity = Math.max(0, .95 - t * 2.2); for (const m of smoke.children) { m.position.set(m.userData.d.x * t * .8, t * 2.4 * m.userData.d.y * 3, m.userData.d.z * t * .8); m.scale.setScalar(.5 + t * .8); } dm.opacity = Math.max(0, .7 - t * .25); return t < 3; } };
}
/** Kick Start: the Dustbike's boost. A burst of flame from the muffler and a rooster tail of dust off the back tyre. */
export function kickStart(bike: Fig): Fx {
  const g = new THREE.Group(); g.position.set(.21, .9, -.95); const fm = fireMat(), flame = puffs(5, fm, .12); g.add(flame); bike.groups.body.add(g);
  const dm = dustMat(), tail = puffs(8, dm, .2); tail.position.set(0, .2, -1.1); bike.groups.body.add(tail);
  let t = 0;
  return { obj: g, step(dt) { t += dt; for (const m of flame.children) { m.position.set(m.userData.d.x * .05, m.userData.d.y * .05, -t * 3 * (1 + m.userData.d.y)); m.scale.setScalar(.12 * (1 - t)); } fm.opacity = Math.max(0, 1 - t); for (const m of tail.children) { m.position.set(m.userData.d.x * .3, t * 2 * m.userData.d.y, -t * 2.5); m.scale.setScalar(.2 + t * .8); } dm.opacity = Math.max(0, .7 - t * .5); const on = t < 1.4; if (!on) { g.removeFromParent(); tail.removeFromParent(); } return on; } };
}
/** Haul Drone call-down: it drops out of the sky from 30 m with its fans screaming, brakes hard at the end, and throws a ring of dust. */
export function callDown(drone: Fig, to: THREE.Vector3): Fx {
  const dm = dustMat(), ring = puffs(12, dm, .3); ring.position.copy(to); let t = 0; drone.root.position.set(to.x, to.y + 30, to.z);
  return { obj: ring, step(dt) { t += dt; const k = Math.min(1, t / 1.6), y = 30 * (1 - ease(k)); drone.root.position.y = to.y + y + .35; ring.visible = k > .8; if (k > .8) { const q = (k - .8) * 5 + Math.max(0, t - 1.6); for (const m of ring.children) { m.position.copy(m.userData.d).multiplyScalar(q * 2); m.scale.setScalar(.3 + q * .6); } dm.opacity = Math.max(0, .7 - Math.max(0, t - 1.6) * .6); } return t < 3; } };
}
/** Anchor: dust jets where each stake bites, then settles. Call it as the stakes reach the ground. */
export function anchorDust(pd: Fig): Fx {
  const g = new THREE.Group(), dm = dustMat(); const feet: [number, number][] = [[-1.55, 1.5], [1.55, 1.5], [-1.55, -1.55], [1.55, -1.55]];
  for (const [x, z] of feet) { const p = puffs(5, dm, .15); p.position.set(x, .05, z); g.add(p); } pd.groups.body.add(g); let t = 0;
  return { obj: g, step(dt) { t += dt; for (const p of g.children) for (const m of p.children) { m.position.copy(m.userData.d).multiplyScalar(t * .9); m.scale.setScalar(.15 + t * .4); } dm.opacity = Math.max(0, .7 - t * .6); const on = t < 1.3; if (!on) g.removeFromParent(); return on; } };
}
