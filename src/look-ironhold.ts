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
import { FxKit, tell, beam, orb, cloud, ring as burst, veil, type Fx } from './fx/kit';
export { FxKit };

/** The new Ironhold kinds this file draws (batch 1 on foot and wheels, batch 2 in the air). */
export const KINDS = ['sapper', 'hauldrone', 'dustbike', 'piledriver', 'hopper', 'flakkite', 'gadfly', 'surveyor', 'claimbarge'] as const;
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
  /** fliers: 0 sat on the ground (the Flak Kite walking on its legs), 1 in the air; between is take-off or landing. Defaults to 1. */ air?: number;
  /** Claim Barge: 0..1 through Foreclosure's 3 s charge (the coil and muzzle light up) */ charge?: number;
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
  } else if (kind === 'hopper') {
    // the crew bus: slow or hovering, both jet pods swing nose-up to lift; at speed they swing level to push. On the ground the legs
    // show and the ramp drops while a squad climbs in or out (work). It noses down a little into speed and rocks on its jets.
    const air = s.air ?? 1, lift = 1 - clamp(s.speed), up = air > .02;
    for (const k of ['podL', 'podR']) if (g[k]) g[k].rotation.x = -Math.PI / 2 * Math.max(lift, 1 - air) + Math.sin(t * 2 + s.id + (k === 'podL' ? 0 : 1)) * .03 * air;
    if (g.pack) g.pack.visible = air < .6;
    if (g.ramp) g.ramp.rotation.x = s.work && air < .1 ? -1.25 : 0;
    g.body.rotation.x = s.speed * .1 * air; g.body.rotation.z = up ? Math.sin(t * 1.3 + s.id) * .02 : 0;
    f.root.position.y = up ? Math.sin(t * 1.9 + s.id) * .06 * air : 0;
  } else if (kind === 'flakkite') {
    // in the air its box wings spread, the legs tuck back under the tail and the prop spins; landed the wings swing back along its sides
    // and it walks on its two bird legs with the guns still under its chin, bobbing its head like a bird.
    const air = s.air ?? 1, gnd = 1 - air;
    const fold = ease(gnd); if (g.wingL) { g.wingL.rotation.y = -1.4 * fold; g.wingL.rotation.z = -.2 * fold; } if (g.wingR) { g.wingR.rotation.y = 1.4 * fold; g.wingR.rotation.z = .2 * fold; }   // swept back along its sides
    if (g.rotor) g.rotor.rotation.z = t * (6 + 30 * air);
    const ph = s.dist * 2.6, sw = Math.min(1, s.speed) * .55 * gnd;
    if (g.legL) g.legL.rotation.x = 1.3 * air + Math.sin(ph) * sw; if (g.legR) g.legR.rotation.x = 1.3 * air - Math.sin(ph) * sw;
    g.body.rotation.x = air * (s.speed * .08) + gnd * Math.abs(Math.sin(ph)) * .03 * Math.min(1, s.speed); g.body.rotation.z = air * -s.aim * .4;
    g.head.rotation.y = gnd * Math.sin(t * .8 + s.id) * .3 * (s.speed < .05 ? 1 : .3);
    g.arms.rotation.x = -s.pitch * .6; g.arms.position.z -= s.kick * .05;
  } else if (kind === 'gadfly') {
    // a gunship: the rotor never stops, the tail fan buzzes, it dips its nose into speed, and the chin gun tracks its target
    if (g.rotor) g.rotor.rotation.y = t * 26; if (g.rotorT) g.rotorT.rotation.x = t * 44;
    g.body.rotation.x = s.speed * .18; g.body.rotation.z = -s.aim * .15 + Math.sin(t * 1.1 + s.id) * .02;
    f.root.position.y = Math.sin(t * 1.6 + s.id) * .07;
    g.arms.rotation.y = s.aim; g.arms.rotation.x = -s.pitch; g.arms.position.z -= s.kick * .05;
  } else if (kind === 'surveyor') {
    // the balloon floats and turns its pushers slowly; the searchlight sweeps when idle and locks onto the aim when it looks at something
    if (g.rotorL) g.rotorL.rotation.z = t * (4 + 8 * s.speed); if (g.rotorR) g.rotorR.rotation.z = -t * (4 + 8 * s.speed);
    f.root.position.y = Math.sin(t * .7 + s.id) * .12; g.body.rotation.z = Math.sin(t * .5 + s.id) * .03; g.body.rotation.x = s.speed * .04;
    g.head.rotation.y = s.work ? s.aim : Math.sin(t * .4 + s.id) * .9; g.head.rotation.x = s.work ? -s.pitch : .25 + Math.sin(t * .3) * .1;
    g.arms.rotation.x = -s.pitch * .8; g.arms.position.z -= s.kick * .1;
  } else if (kind === 'claimbarge') {
    // heavy and slow: four fans in the gunwales, a long slow roll, and the Foreclosure gun lifting a little to its target
    for (let i = 0; i < 4; i++) if (g['rotor' + i]) g['rotor' + i].rotation.y = t * 9 * (i % 2 ? -1 : 1);
    f.root.position.y = Math.sin(t * .5 + s.id) * .1; g.body.rotation.z = Math.sin(t * .35 + s.id) * .015; g.body.rotation.x = s.speed * .03 - s.kick * .04;
    g.arms.rotation.x = -clamp(s.pitch) * .25; g.arms.position.z -= s.kick * .4;
  }
}

/** First person: where the eye sits in the figure (its own space, metres) and which groups are hidden so the camera is not inside them.
 *  Every new body is drivable this way: the player sees the body's own hands, bars, boom or gun frame from where its crew would sit. */
// vm: this kind has a view model (see viewModel below) to hang on the camera.
export const FIRST: Record<Kind, { eye: [number, number, number]; /** groups or part names */ hide: string[]; fov: number; /** how far the look drops over 3 m ahead */ drop: number; vm?: boolean }> = {
  sapper: { eye: [0, 1.66, .12], hide: ['head', 'arms'], fov: 70, drop: .12, vm: true },
  hauldrone: { eye: [0, 1.05, .62], hide: ['head', 'arms'], fov: 80, drop: .5, vm: true },   // from the camera eye itself, framed by its housing, the boom reaching out below
  dustbike: { eye: [0, 1.62, .14], hide: ['head'], fov: 76, drop: .8 },           // the rider's eyes: bars, burner and tank ahead
  piledriver: { eye: [-.62, 2.12, -.45], hide: [], fov: 66, drop: .25 },  // head out of the cab hatch, looking past the frame along the barrel
  // fliers are flown from their cockpits; the glass is hidden in first person (it is not see-through), its frames stay as the cockpit
  hopper: { eye: [-.25, 1.76, 2.32], hide: ['pilot', 'noseglass', 'noseframes'], vm: true, fov: 74, drop: .35 },     // the pilot's seat behind the glazed nose
  flakkite: { eye: [0, 2.17, .5], hide: ['pilothead', 'pilotgoggles', 'windshield'], vm: true, fov: 78, drop: .3 },   // open cockpit: cowl, guns and wings
  gadfly: { eye: [-.32, 1.72, 1.0], hide: ['canopy'], fov: 76, drop: .5 },      // in the bubble, the chin gun below and the rotor overhead
  surveyor: { eye: [.42, 1.82, .45], hide: ['surveyorman'], fov: 72, drop: .7 },   // stood in the gondola, the searchlight below and ahead
  claimbarge: { eye: [0, 3.65, -3.0], hide: ['bridgeglass'], fov: 66, drop: .45 },   // the bridge: the whole hull, the ore and the gun ahead
};
/** Hides what would sit in front of the eye in first person (FIRST[kind].hide: groups or part names) and returns the undo. It shrinks
 *  them to nothing rather than turning them off, because the zoom-level pass (src/meshes.ts lodPass) turns a body's meshes back on. */
export function hideFirst(f: Fig, kind: Kind) {
  const hit: THREE.Object3D[] = [];
  for (const k of FIRST[kind].hide) { if (f.groups[k]) hit.push(f.groups[k]); else f.root.traverse(o => { if ((o as THREE.Mesh).isMesh && o.name === k) hit.push(o); }); }
  const was = hit.map(o => o.scale.clone()); for (const o of hit) o.scale.setScalar(1e-4);
  return () => hit.forEach((o, i) => o.scale.copy(was[i]));
}


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
  } else if (kind === 'hopper') {
    // the pilot's seat: a dashboard along the bottom of the view with two gauges and a hazard lip, the glazing bars of the nose
    // running up the sides and over the top, so the view reads as a cockpit without glass in the way
    put(rbox(1.1, .16, .3, .04), M.gunm, out, [0, -.36, -.42], [-.25, 0, 0]);
    put(rbox(1.1, .02, .05, .01), M.haz, out, [0, -.27, -.3]);
    for (const x of [-.18, .12]) { put(ring(.045, .01, 1, 32), M.bS, out, [x, -.31, -.34], [-.25 + Math.PI / 2, 0, 0]); put(can(.04, .01), M.nW, out, [x, -.31, -.35], [-.25 + Math.PI / 2, 0, 0]); }
    put(can(.012, .01), M.red, out, [.32, -.3, -.34], [-.25 + Math.PI / 2, 0, 0]);
    for (const sx of [-1, 1]) put(rbox(.035, .9, .04, .012), M.gunm, out, [sx * .46, .02, -.55], [0, 0, sx * .38]);
    put(rbox(1.0, .035, .04, .012), M.gunm, out, [0, .36, -.6]);
  } else if (kind === 'flakkite') {
    // open cockpit: the twin guns brought up into the bottom of the view, either side of a ring sight on a post, so the Kite reads
    // as a gun you fly, not as a seat (the Gadfly and Hopper have a canopy and a dashboard)
    const E: [number, number, number] = [0, 1.64, .42];
    for (const sd of ['L', 'R'] as const) { const g = fromEye(['gun' + sd, 'drum' + sd], E); g.position.set(sd === 'L' ? -.3 : .3, .1, -.35); out.add(g); }   // each gun pushed out to its own side of the cowl
    put(rbox(.02, .16, .02, .006), M.gunm, out, [0, -.16, -.62]);
    put(ring(.07, .008, 1, 48), M.haz, out, [0, -.02, -.64]); put(ring(.02, .006, 1, 24), M.haz, out, [0, -.02, -.64]);
    for (const [w, h] of [[.14, .005], [.005, .14]]) put(rbox(w, h, .004, .001), M.gunm, out, [0, -.02, -.64]);
    put(rbox(.5, .05, .1, .02), M.pY, out, [0, -.3, -.5], [-.3, 0, 0]);
  } else return null;
  out.userData.kind = kind; out.userData.mode = mode; return out;
}

// ---------------------------------------------------------------- ability effects, built from stream H's effect kit (src/fx/kit.ts)
// Each takes the kit the game keeps for the scene and adds its pieces to it; the kit ticks them, keeps them readable from high up
// and removes them when done. Pieces that are not in the kit (a mound of dirt, a stake, a falling flare's light) are small Fx of
// their own, added the same way. Times and sizes are the rules' (plan-rosters.md); the rules stream passes them in where they vary.
// All of it is for show: no dice, no rule.
const DUST = '#d9a46a', FIRE = '#ffb23a', HOT = '#fff1c4', SOOT = '#5a5048', HAZ = '#ffc21a', SPARK = '#7ff6ff', IRON = '#ff6a1a';
const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
/** Where a figure's named point (or a spot in one of its groups) is in the world right now. */
const worldOf = (f: Fig, name: string, fallback: [number, number, number] = [0, 1, 0]) => () => { const p = f.points[name]; const o = p ? p.group : f.root; o.updateWorldMatrix(true, false); return o.localToWorld(V(...(p ? p.at : fallback))); };
/** One effect's timeline, added to the kit as a single piece: it holds its own pieces and timers, so pieces made partway through (a
 *  blast after a fuse, a ring every 0.7 s) are ticked too (the kit's own list cannot take new pieces while it is ticking). It passes
 *  the kit's far-zoom call on to every piece it holds. */
interface Seq { add<T extends Fx>(f: T): T; after(s: number, fn: () => void): void; every(gap: number, until: number, fn: (t: number) => void): void }
function seq(fx: FxKit): Seq {
  const obj = new THREE.Group(), list: Fx[] = [], timers: { at: number; fn: () => void }[] = []; let t = 0;
  const q: Seq = {
    add(f) { obj.add(f.obj); list.push(f); return f; },
    after(s, fn) { timers.push({ at: t + s, fn }); },
    every(gap, until, fn) { for (let k = 0; k * gap < until; k++) { const at = k * gap; timers.push({ at: t + at, fn: () => fn(at) }); } },
  };
  fx.add({ obj, update(dt) { t += dt; for (let i = 0; i < timers.length; i++) if (timers[i].at <= t) { const f = timers.splice(i--, 1)[0]; f.fn(); }
      for (let i = 0; i < list.length; i++) if (!list[i].update(dt)) { obj.remove(list[i].obj); list[i].dispose?.(); list.splice(i--, 1); }
      return list.length > 0 || timers.length > 0; },
    view(perPx, far, cam) { for (const f of list) f.view?.(perPx, far, cam); } });
  return q;
}
/** A small solid prop that stands for `time` seconds (a mound, a stake) and sinks away at the end. */
function prop(q: Seq, mesh: THREE.Object3D, time: number, grow = .3): Fx { let t = 0; const y0 = mesh.position.y; return q.add({ obj: mesh, update(dt) { t += dt; mesh.scale.setScalar(Math.min(1, t / grow)); if (t > time - .5) mesh.position.y = y0 - (t - time + .5) * .6; return t < time; } }); }

/** Overtime (Linesman): he takes the hit and speeds up. A hot flash on him, a ring off his boots, and a warm glow that rides with
 *  him for the 11 s. `at` follows the body. */
export function overtime(fx: FxKit, at: () => THREE.Vector3, time = 11) {
  const q = seq(fx);
  const p = at(); q.add(burst({ x: p.x, z: p.z, y: p.y, r: 2.2, time: .5, color: FIRE }));
  q.add(orb({ at: () => at().add(V(0, 1.2, 0)), r: .5, color: '#ff4a1a', time: .25 }));
  q.add(orb({ at: () => at().add(V(0, 1.0, 0)), r: .35, color: FIRE, time, pulse: 1.5, minPx: 3 }));
}
/** Shaft Mine (Sapper): he digs in. Dust kicks out in a ring, a mound rises with a scrap of red flag on it, and it stays as long as
 *  the mine does (`time`; the rules remove it when it goes off, through the returned Fx's obj). */
export function shaftMine(fx: FxKit, at: THREE.Vector3, time = 600): Fx {
  const q = seq(fx);
  q.add(burst({ x: at.x, z: at.z, y: at.y, r: 2.4, time: .7, color: DUST })); q.add(cloud({ x: at.x, z: at.z, y: at.y, r: 1.4, time: 1.6, color: DUST, puffs: 6 }));
  const g = new THREE.Group(); g.position.copy(at); const mound = new THREE.Mesh(new THREE.SphereGeometry(.5, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), M.lea); mound.scale.y = .35; g.add(mound);
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(.012, .012, .5, 5), M.wood); pole.position.set(.2, .25, 0); g.add(pole);
  const flag = new THREE.Mesh(new THREE.PlaneGeometry(.18, .11), new THREE.MeshBasicMaterial({ color: 0xd8382a, side: THREE.DoubleSide })); flag.position.set(.29, .44, 0); g.add(flag);
  return prop(q, g, time);
}
/** The mine going off, or a Satchel against a wall: a short red warning on the ground for the fuse, then a white flash, a blast ring,
 *  a fireball and a column of brown smoke. */
export function blast(fx: FxKit, at: THREE.Vector3, r = 5, fuse = 0) {
  const q = seq(fx);
  if (fuse > 0) q.add(tell({ x: at.x, z: at.z, y: at.y, r, time: fuse, color: '#ff3a2a' }));
  q.after(fuse, () => {
    q.add(orb({ at: at.clone().add(V(0, .8, 0)), r: r * .5, color: '#ffffff', time: .12 })); q.add(orb({ at: at.clone().add(V(0, 1, 0)), r: r * .35, color: FIRE, time: .5, pulse: 4 }));
    q.add(burst({ x: at.x, z: at.z, y: at.y, r: r * 1.2, time: .6, color: FIRE }));
    q.add(clods(at, r, Math.round(10 + r * 2)));
    q.add(scorch(at, r * .8, 25));
    q.add(cloud({ x: at.x, z: at.z, y: at.y, r: r * .6, time: 4, color: '#7a5a40', puffs: 9 }));
    // a column of black smoke that climbs and spreads for a second and a half
    q.every(.2, 1.4, k => q.add(cloud({ x: at.x + Math.sin(k * 7) * r * .1, z: at.z + Math.cos(k * 5) * r * .1, y: at.y + .8 + k * r * .7, r: r * (.22 + k * .25), color: SOOT, time: 3.4 - k, puffs: 5, seed: Math.round(k * 10) + 3 })));
  });
}
/** A spray of thrown dirt and stones: they fly out and up, fall, bounce once, lie a moment and sink away. Seeded from the spot, so
 *  the same blast always throws the same way (no dice). */
const CLOD = new THREE.DodecahedronGeometry(1, 0);
function clods(at: THREE.Vector3, r: number, n: number): Fx {
  const obj = new THREE.Group(); let s = Math.abs(Math.floor(at.x * 73 + at.z * 151)) % 2147483646 + 1; const rnd = () => (s = s * 16807 % 2147483647) / 2147483647;
  const bits = Array.from({ length: n }, () => {
    const a = rnd() * Math.PI * 2, out = (.4 + rnd()) * r * 1.6, up = 5 + rnd() * r * 1.5, size = .08 + rnd() * .14 * Math.min(2, r / 3);
    const m = new THREE.Mesh(CLOD, rnd() < .35 ? M.rockB : M.conc); m.scale.setScalar(size); m.position.copy(at).add(V(0, .4, 0)); obj.add(m);
    return { m, v: V(Math.cos(a) * out, up, Math.sin(a) * out), spin: V(rnd() * 9, rnd() * 9, 0), size, rest: false };
  });
  let t = 0;
  return { obj, update(dt) {
    t += dt;
    for (const b of bits) {
      if (!b.rest) { b.v.y -= 22 * dt; b.m.position.addScaledVector(b.v, dt); b.m.rotation.x += b.spin.x * dt; b.m.rotation.y += b.spin.y * dt;
        if (b.m.position.y < at.y + b.size * .6 && b.v.y < 0) { b.m.position.y = at.y + b.size * .6; if (b.v.y < -4) { b.v.multiplyScalar(.3); b.v.y *= -1; } else b.rest = true; } }
      if (t > 3) b.m.scale.setScalar(b.size * Math.max(0, 1 - (t - 3) / 1.5));
    }
    return t < 4.5; } };
}
/** A black scorch mark left on the ground, with a ragged edge; it fades over its last third. */
function scorch(at: THREE.Vector3, r: number, time: number): Fx {
  const pts: THREE.Vector2[] = []; let s = Math.abs(Math.floor(at.x * 31 + at.z * 17)) % 2147483646 + 1; const rnd = () => (s = s * 16807 % 2147483647) / 2147483647;
  for (let i = 0; i < 22; i++) { const a = i / 22 * Math.PI * 2, k = r * (.7 + rnd() * .45); pts.push(new THREE.Vector2(Math.cos(a) * k, Math.sin(a) * k)); }
  const mat = new THREE.MeshBasicMaterial({ color: '#17110d', transparent: true, opacity: .72, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
  const inner = new THREE.Mesh(new THREE.CircleGeometry(r * .45, 18), new THREE.MeshBasicMaterial({ color: '#0b0806', transparent: true, opacity: .6, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3 }));
  const m = new THREE.Mesh(new THREE.ShapeGeometry(new THREE.Shape(pts)), mat); m.rotation.x = -Math.PI / 2; m.position.copy(at).add(V(0, .05, 0)); inner.position.z = .01; m.add(inner);
  let t = 0;
  return { obj: m, update(dt) { t += dt; const k = Math.min(1, Math.max(0, (time - t) / (time / 3))); mat.opacity = .72 * k; (inner.material as THREE.MeshBasicMaterial).opacity = .6 * k; return t < time; },
    dispose() { m.geometry.dispose(); mat.dispose(); inner.geometry.dispose(); (inner.material as THREE.Material).dispose(); } };
}
/** Satchel (Sapper): set against a building, a 1.5 s fuse, then the blast. */
export const satchel = (fx: FxKit, at: THREE.Vector3) => blast(fx, at, 3.5, 1.5);
/** Ghillie (Longshot): he goes to ground. For his own side the body shimmers; for the other side it is gone. Returns the undo. */
export function ghillie(fx: FxKit, body: THREE.Object3D, mySide: boolean) { const q = seq(fx), p = body.getWorldPosition(V()); q.add(cloud({ x: p.x, z: p.z, y: p.y, r: 1.2, time: 1.2, color: '#8a8a60', puffs: 5 })); return veil(body, mySide); }
/** Tranq (Longshot): a dart that bursts into a pale cloud; in its circle energy and shields bleed away. */
export function tranq(fx: FxKit, from: THREE.Vector3, to: THREE.Vector3, r = 3) {
  const q = seq(fx);
  const flight = Math.max(.1, from.distanceTo(to) / 60), at = () => from.clone().lerp(to, Math.min(1, t / flight)); let t = 0;
  q.add({ obj: new THREE.Group(), update(dt) { t += dt; return t < flight; } }); q.add(orb({ at, r: .12, color: '#b8ffcf', time: flight, minPx: 3 }));
  q.after(flight, () => { q.add(burst({ x: to.x, z: to.z, y: to.y, r, time: .6, color: '#b8ffcf' })); q.add(cloud({ x: to.x, z: to.z, y: to.y, r, time: 3, color: '#a8e8c0', puffs: 8 })); });
}
/** Deep Charge (Longshot, from the Signal Mast): the company's big charge, called onto a spot. A long warning so the other side can
 *  run, a falling glint, then a blast twice the size of a Satchel. */
export function deepCharge(fx: FxKit, at: THREE.Vector3, r = 8, fuse = 10) {
  const q = seq(fx);
  q.add(tell({ x: at.x, z: at.z, y: at.y, r, time: fuse, color: '#ff3a2a' }));
  let t = 0; q.add({ obj: new THREE.Group(), update(dt) { t += dt; return t < fuse; } });
  q.add(orb({ at: () => at.clone().add(V(0, Math.max(0, (fuse - t) * 4), 0)), r: .3, color: HAZ, time: fuse, pulse: 2, minPx: 4 }));
  blast(fx, at, r, fuse);
}
/** Kick Start (Dustbike): a bang of flame out of the muffler and a rooster tail of dust off the back tyre. */
export function kickStart(fx: FxKit, bike: Fig, time = 2) {
  const q = seq(fx);
  const tyre = () => { const g = bike.groups.body; g.updateWorldMatrix(true, false); return g.localToWorld(V(0, .1, -1.1)); };
  const blow = () => { const g = bike.groups.body; g.updateWorldMatrix(true, false); return g.localToWorld(V(.21, .9, -1.1)); };
  q.add(orb({ at: blow, r: .35, color: FIRE, time: .35 })); q.add(beam({ a: () => { const g = bike.groups.body; return g.localToWorld(V(.21, .9, -.95)); }, b: () => { const g = bike.groups.body; return g.localToWorld(V(.21, .95, -1.9)); }, width: .18, color: FIRE, time: .4 }));
  let t = 0; q.add({ obj: new THREE.Group(), update(dt) { t += dt; if (Math.floor(t / .25) !== Math.floor((t - dt) / .25)) { const p = tyre(); q.add(cloud({ x: p.x, z: p.z, y: 0, r: 1, time: 1.2, color: DUST, puffs: 4, seed: Math.floor(t * 9) + 1 })); } return t < time; } });
}
/** Haul Drone call-down: a mark on the ground where it will land, then it drops from 30 m with its fans screaming, brakes hard, and
 *  throws a ring of dust. Moves the drone's root itself. */
export function callDown(fx: FxKit, drone: Fig, to: THREE.Vector3, time = 1.6) {
  const q = seq(fx);
  q.add(tell({ x: to.x, z: to.z, y: to.y, r: 1.6, time, color: HAZ })); let t = 0; drone.root.position.set(to.x, to.y + 30, to.z);
  q.add({ obj: new THREE.Group(), update(dt) { t += dt; const k = Math.min(1, t / time); drone.root.position.y = to.y + .35 + 30 * (1 - ease(k)); return k < 1; } });
  q.after(time, () => { q.add(burst({ x: to.x, z: to.z, y: to.y, r: 3, time: .6, color: DUST })); q.add(cloud({ x: to.x, z: to.z, y: to.y, r: 2, time: 1.5, color: DUST, puffs: 6 })); });
}
/** Anchor (Pile Driver): dust jets where each stake bites. Call it as the stakes reach the ground. */
export function anchorDust(fx: FxKit, pd: Fig) {
  const q = seq(fx);
  for (const [x, z] of [[-1.55, 1.5], [1.55, 1.5], [-1.55, -1.55], [1.55, -1.55]]) { const p = pd.root.localToWorld(V(x, 0, z)); q.add(burst({ x: p.x, z: p.z, y: p.y, r: 1, time: .4, color: DUST })); q.add(cloud({ x: p.x, z: p.z, y: p.y, r: .7, time: 1.2, color: DUST, puffs: 3 })); }
}
/** Afterburn (Hopper): both jet pods throw a long white-hot tongue and a trail of soot for its 3 s. */
export function afterburn(fx: FxKit, hop: Fig, time = 3) {
  const q = seq(fx);
  for (const k of ['jetL', 'jetR']) {
    const at = worldOf(hop, k), back = () => { const p = hop.points[k]; return p.group.localToWorld(V(p.at[0], p.at[1], p.at[2] - 2.2)); };
    q.add(beam({ a: at, b: back, width: .32, color: HOT, time, minPx: 2 })); q.add(orb({ at, r: .45, color: FIRE, time, pulse: 3 }));
  }
  let t = 0; q.add({ obj: new THREE.Group(), update(dt) { t += dt; if (Math.floor(t / .3) !== Math.floor((t - dt) / .3)) { const p = worldOf(hop, 'jetL')(); q.add(cloud({ x: p.x, z: p.z, y: p.y - 1, r: 1.2, time: 2, color: SOOT, puffs: 3, seed: Math.floor(t * 7) + 3 })); } return t < time; } });
}
/** Smoke Cloak (Gadfly): the old spray booms lay a thick grey bank round it, and the ship goes unseen inside (veil). */
export function smokeCloak(fx: FxKit, ship: Fig, mySide: boolean, r = 6, time = 10) {
  const q = seq(fx);
  const p = ship.root.getWorldPosition(V()); q.add(cloud({ x: p.x, z: p.z, y: Math.max(0, p.y - 2), r, time, color: '#9a9488', puffs: 16 }));
  const off = veil(ship.root, mySide); q.after(time, off); return off;
}
/** Flare (Surveyor): a parachute flare pops overhead and drifts down; the circle under it is blinded for 8 s (no one inside sees
 *  out past it). A white glare on the ground marks the circle from any zoom. */
export function flare(fx: FxKit, at: THREE.Vector3, r = 7, time = 8) {
  const q = seq(fx);
  let t = 0; const fall = () => at.clone().add(V(0, 14 - t * 1.4, 0));
  const lamp = new THREE.PointLight(0xffe6b8, 60, r * 4, 1.6); const g = new THREE.Group(); g.add(lamp);
  const chute = new THREE.Mesh(new THREE.SphereGeometry(.7, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), M.nW); chute.position.y = 1.2; g.add(chute);
  q.add({ obj: g, update(dt) { t += dt; g.position.copy(fall()); lamp.intensity = 60 * Math.min(1, (time - t)) * (.85 + Math.sin(t * 31) * .15); return t < time; } });
  q.add(orb({ at: fall, r: .45, color: '#fff4d0', time, pulse: 5, minPx: 5 }));
  q.add(cloud({ x: at.x, z: at.z, y: at.y, r, time, color: '#fff6dc', puffs: 10 }));
}
/** Jam (Surveyor): a machine stops for 6 s. Rings of static keep rolling off it and a blue spark sits on it. `at` follows the body. */
export function jam(fx: FxKit, at: () => THREE.Vector3, time = 6) {
  const q = seq(fx);
  let t = 0, n = 0; q.add(orb({ at: () => at().add(V(0, 1.6, 0)), r: .3, color: SPARK, time, pulse: 7 }));
  q.add({ obj: new THREE.Group(), update(dt) { t += dt; if (t > n * .7) { n++; const p = at(); q.add(burst({ x: p.x, z: p.z, y: p.y, r: 3, time: .7, color: SPARK, band: .08 })); } return t < time; } });
}
/** Stake Gun (Surveyor): a survey stake shot into the ground that stands as a turret for 10 s, a puff where it bites. */
export function stakeGun(fx: FxKit, from: THREE.Vector3, to: THREE.Vector3, time = 10) {
  const q = seq(fx);
  const flight = Math.max(.1, from.distanceTo(to) / 40); let t = 0;
  q.add({ obj: new THREE.Group(), update(dt) { t += dt; return t < flight; } }); q.add(orb({ at: () => from.clone().lerp(to, Math.min(1, t / flight)), r: .1, color: IRON, time: flight, minPx: 3 }));
  q.after(flight, () => {
    q.add(burst({ x: to.x, z: to.z, y: to.y, r: 1.2, time: .4, color: DUST }));
    const g = new THREE.Group(); g.position.copy(to); const stake = new THREE.Mesh(new THREE.CylinderGeometry(.05, .015, 1.2, 6), M.wood); stake.position.y = .5; g.add(stake);
    const tag = new THREE.Mesh(new THREE.PlaneGeometry(.26, .14), new THREE.MeshBasicMaterial({ color: 0xff6a1a, side: THREE.DoubleSide })); tag.position.set(.14, 1.0, 0); g.add(tag);
    const head = new THREE.Mesh(new THREE.BoxGeometry(.18, .12, .3), M.gunm); head.position.y = 1.15; g.add(head);
    prop(q, g, time, .15); q.add(tell({ x: to.x, z: to.z, y: to.y, r: .9, time, color: IRON }));
  });
}
/** Foreclosure (Claim Barge): a 3 s charge (light gathering at the muzzle and a warning on the target's ground, so the other side
 *  sees it coming), then one shell: a long streak and a heavy blast. */
export function foreclosure(fx: FxKit, barge: Fig, target: THREE.Vector3, charge = 3) {
  const q = seq(fx);
  const muzzle = worldOf(barge, 'muzzle');
  q.add(tell({ x: target.x, z: target.z, y: target.y, r: 3.5, time: charge, color: SPARK })); q.add(orb({ at: muzzle, r: 1.1, color: SPARK, time: charge, pulse: 2.5 }));
  let t = 0; q.add({ obj: new THREE.Group(), update(dt) { t += dt; if (Math.floor(t / .6) !== Math.floor((t - dt) / .6)) { const p = muzzle(); q.add(burst({ x: p.x, z: p.z, y: p.y - 1, r: 2, time: .5, color: SPARK })); } return t < charge; } });
  q.after(charge, () => { q.add(beam({ a: muzzle(), b: target.clone(), width: .5, color: '#e8ffff', time: .3, minPx: 3 })); blast(fx, target, 5); });
}
/** Relocate (Claim Barge): the fans go to full, a ring of dust under it, and a mark where it is going. */
export function relocate(fx: FxKit, barge: Fig, to: THREE.Vector3, time = 2) {
  const q = seq(fx);
  const p = barge.root.getWorldPosition(V()); q.add(burst({ x: p.x, z: p.z, y: 0, r: 9, time: .9, color: DUST })); q.add(cloud({ x: p.x, z: p.z, y: 0, r: 6, time: 2.5, color: DUST, puffs: 10 }));
  q.add(tell({ x: to.x, z: to.z, y: to.y, r: 7, time, color: HAZ }));
}
