// The Gloam, second brood: the bodies and growths the full-depth roster adds (stream G). Each one is a sculpt from art/gloam2.py
// (or art/growths2.py for buildings) loaded through figure(); the match server and tests carry no meshes, so each also has a plain
// stand-in built from the same few blobs, enough to hang the named joints on.
//
// Kinds are the plan's names in lower case. A dug-in body is its own kind, '<kind>dug' (see dug() below).
import * as THREE from 'three';
import { figure } from '../../../meshes';
import { M, mk, G, setLayer, L_FX } from '../../../gfx';
import { blob, tube } from '../../../sculpt';
import { grp, put } from '../../../units';
import { hasStatus } from '../../../core/status';

type P3 = [number, number, number];

/** A stand-in for the server: a hide body, a head and legs on the named joints, so poses and deaths still work without meshes. */
function stub(h: number, legs: number, len = 1): THREE.Group {
  const obj = new THREE.Group(), body = grp('body', obj);
  put(blob(h * .7, h * .5, h * .9 * len), M.gH, body, [0, h * .5, 0]);
  const head = grp('head', body, [0, h * .55, h * .5 * len]); put(blob(h * .35, h * .3, h * .35), M.gHn, head);
  for (let i = 0; i < legs; i++) for (const sx of [-1, 1]) { const z = (legs > 1 ? .5 - i / (legs - 1) : 0) * h * .7 * len, l = grp(`lg${i}${sx < 0 ? 'L' : 'R'}`, obj, [sx * h * .3, h * .45, z]); put(tube([[0, 0, 0], [sx * h * .3, h * .1, 0], [sx * h * .45, -h * .45, 0]], [h * .06, h * .05, h * .03], 6), M.gD, l); }
  return obj;
}
/** Where the spit or the quill leaves: a lime flash on the FX layer, hidden until the game shows it. */
function flashAt(fig: NonNullable<ReturnType<typeof figure>>, size = 1) {
  const mz = fig.points.muzzle; if (!mz) return;
  const f = grp('flash', mz.group, mz.at); mk(G.sph, M.gSpit, [0, 0, 0], [.3 * size, .3 * size, .3 * size], 0, f); mk(G.oct, M.gSpit, [0, 0, .1 * size], [.12 * size, .12 * size, .6 * size], 0, f); f.visible = false; setLayer(f, L_FX);
}
function sculpt(kind: string, flash = 0): THREE.Group | null { const fig = figure(kind); if (!fig) return null; if (flash) flashAt(fig, flash); return fig.root; }

/** Bud keeper: tall on four legs under a hood of gills, a brood of Buds slung beneath, two feeding arms with mending glands. */
const keeper = () => sculpt('keeper', .8) || stub(1.4, 2, 1.1);
/** Armoured spitter: a pill-bug back on six short legs. */
const shellback = () => sculpt('shellback', .6) || stub(.9, 3);
/** A Shellback ripened: the back split and a bile sac grown out of it to throw from. */
const lobber = () => sculpt('lobber', 1.1) || stub(1.3, 3);
/** A Quillback ripened: long and low, a drill snout, a crest of spines it lays forward to fire when dug in. */
const needler = () => sculpt('needler', .9) || stub(.9, 3, 1.6);

/** Caster: a pale puffball on stilts under a lace veil, spores breathing out of its pores. */
const smother = () => sculpt('smother', .7) || stub(1.3, 2);
/** Dug-in thrower: broad and low, a pack of dry husks on its back and a sling arm to fling them. */
const seeder = () => sculpt('seeder', .8) || stub(1.1, 3, 1.2);
/** The Seeder's walker: a split dry pod on six thin legs with a glowing core. */
const husk = () => sculpt('husk') || stub(.5, 3);
/** The Sower's drop: a fat grub with jaws. */
const pup = () => sculpt('pup') || stub(.4, 2);
/** Fast flier: long body, two pairs of veined wings, a sting. */
const gnatwing = () => sculpt('gnatwing', .5) || stub(.7, 3);
/** Air fighter: a great gas bladder with a hard little body slung under it and acid feelers. */
const bloater = () => sculpt('bloater', .6) || stub(1.0, 2);
/** A Bloater ripened: two bladders, a fringe, and a brood bag of Pups slung under. */
const sower = () => sculpt('sower', .8) || stub(1.6, 3);
/** Flying caster: sails for wings and a long tail line with a bone hook at the end. */
const hooksail = () => sculpt('hooksail', .7) || stub(1.0, 2);
/** A Spore Sac afloat: a ribbed bulb with roots hanging. */
const drifter = () => sculpt('drifter') || stub(2.0, 0);

export const GLOAM_UNITS2: Record<string, () => THREE.Group> = { keeper, shellback, lobber, needler, smother, seeder, husk, pup, gnatwing, bloater, sower, hooksail, drifter };
/** Height of the top of each body in metres, for health bars, picking and the camera. A flier's is above its own feet, not the ground. */
export const GLOAM_HEIGHT2: Record<string, number> = { keeper: 2.6, shellback: 1.15, lobber: 3.0, needler: 2.0, smother: 3.0, seeder: 2.2, husk: .9, pup: .7, gnatwing: 1.2, bloater: 2.5, sower: 3.6, hooksail: 1.4, drifter: 3.3 };
/** How high each flier is drawn above the ground (metres), before its bob. Rules that pick or shoot fliers should use the same numbers. */
export const GLOAM_FLY: Record<string, number> = { gnatwing: 4.2, bloater: 5.0, sower: 5.6, hooksail: 4.8, drifter: 6.0 };
/** How far below the ground a body sits when dug in (metres), and how wide its mound is. What shows above ground is what is left. */
export const DIG: Record<string, { sink: number; mound: number }> = {
  grazer: { sink: 1.1, mound: .9 }, snapper: { sink: 1.0, mound: .8 }, quillback: { sink: 2.1, mound: 1.1 }, blister: { sink: .55, mound: .7 }, mulcher: { sink: 2.6, mound: 2.6 },
  keeper: { sink: 2.7, mound: 1.2 }, shellback: { sink: .55, mound: 1.1 }, lobber: { sink: 1.1, mound: 1.9 }, needler: { sink: 1.0, mound: 1.8 },
  smother: { sink: 3.1, mound: 1.1 }, seeder: { sink: .9, mound: 1.7 }, husk: { sink: 1.0, mound: .6 }, pup: { sink: .8, mound: .5 },
};
export type { P3 };

// ---------------------------------------------------------------- poses laid over the game's own
/** Offsets laid on a body after the game has posed it and taken off again before the next frame, the way stance.ts and hitfx.ts do it,
 *  so the walk code (which eases toward its targets) never sees them. One per game; call pre() before posing and the pose functions after. */
export class Overlay {
  private tg: any[] = []; private ax: string[] = []; private val: number[] = []; private md: number[] = []; private n = 0;
  /** Takes the offsets off again. With `ease` (the game's blend this frame), a channel the game eases toward its own target keeps the
   *  part of the offset the easing already took off (mode 1), and a channel the game sets outright every frame keeps none (mode 2).
   *  The mode of a channel is read from a `__m` tag on its vector (see tag() below); untagged channels the game never touches come off in full. */
  pre(ease?: number) { for (let i = 0; i < this.n; i++) { const m = ease === undefined ? 0 : this.md[i]; this.tg[i][this.ax[i]] -= m === 2 ? 0 : m === 1 ? this.val[i] * (1 - ease!) : this.val[i]; } this.n = 0; }
  add(o: any, a: string, v: number) { if (!o || !v) return; o[a] += v; this.tg[this.n] = o; this.ax[this.n] = a; this.val[this.n] = v; this.md[this.n++] = o.__m?.[a] ?? 0; }
}
const smooth = (k: number) => k * k * (3 - 2 * k);
const legsOf = (obj: THREE.Object3D): THREE.Object3D[] => obj.userData.legs || (obj.userData.legs = (() => { const out: THREE.Object3D[] = []; obj.traverse(o => { if (/^lg\d[LR]$/.test(o.name)) out.push(o); }); return out; })());
const part = (obj: THREE.Object3D, n: string) => obj.getObjectByName(n) as THREE.Object3D | undefined;

/** Digging in or coming up. k runs 0 (standing) to 1 (dug in). On the way down the body shudders and its legs fold up and out, as if
 *  scooping; at 1 it sits sunk by DIG[kind].sink with the legs folded flat, so whatever is left above the ground is what the plan says shows.
 *  `t` is the clock, for the shudder. */
export function digPose(L: Overlay, obj: THREE.Object3D, kind: string, k: number, t: number) {
  if (k <= 0) return; const d = DIG[kind] || { sink: 1, mound: 1 }, s = smooth(Math.min(1, k)), mid = Math.sin(Math.min(1, k) * Math.PI);
  const body = part(obj, 'body');
  L.add(obj.position, 'y', -d.sink * s);
  L.add(body?.rotation, 'z', Math.sin(t * 31) * .06 * mid); L.add(body?.rotation, 'x', Math.sin(t * 23) * .04 * mid + .05 * s);
  for (const l of legsOf(obj)) { const sx = l.name[3] === 'L' ? -1 : 1, i = +l.name[2]; L.add(l.rotation, 'z', sx * (1.0 * s + Math.max(0, Math.sin(t * 18 + i * 2 + (sx > 0 ? 1.6 : 0))) * .5 * mid)); L.add(l.rotation, 'y', (i % 2 ? 1 : -1) * .3 * s); }
}
/** Kinds whose whole body goes under: the mound closes over them and only the breathing slit shows. */
const UNDER = new Set(['grazer', 'snapper', 'blister', 'keeper', 'smother', 'husk', 'pup']);
/** The churned earth a dug-in body leaves. Scale and show it with mound(). */
export function digMound(kind: string): THREE.Group {
  const fig = figure('digmound'), g = new THREE.Group(), d = DIG[kind] || { sink: 1, mound: 1 };
  if (fig) g.add(fig.root); else { const ring = grp('ring', g), hump = grp('hump', g); put(blob(1.8, .3, 1.8), M.gD, ring, [0, .05, 0]); put(blob(1.6, .7, 1.6), M.gH, hump, [0, 0, 0]); }
  g.scale.setScalar(d.mound); g.userData.under = UNDER.has(kind); g.visible = false; return g;
}
/** Shows the mound for dig amount k: the ring grows as the body goes down, the hump rises over a body that goes all the way under. */
export function mound(m: THREE.Group, k: number) {
  m.visible = k > .02; if (!m.visible) return; const ring = part(m, 'ring'), hump = part(m, 'hump'), s = smooth(Math.min(1, k));
  if (ring) ring.scale.set(.4 + .6 * s, s, .4 + .6 * s);
  if (hump) { hump.visible = !!m.userData.under && k > .5; hump.scale.set(1, Math.max(.01, (k - .5) * 2), 1); }
}

/** A pose for each ability, by name, at progress p (0 to 1 over the ability's wind-up and release). Unknown names do nothing. */
export function actPose(L: Overlay, obj: THREE.Object3D, kind: string, act: string, p: number, t: number) {
  const body = part(obj, 'body'), head = part(obj, 'head'), up = Math.sin(Math.min(1, p) * Math.PI), legs = legsOf(obj);
  const armL = part(obj, 'armL'), armR = part(obj, 'armR'), arms = part(obj, 'arms'), halo = part(obj, 'halo'), brood = part(obj, 'brood');
  switch (kind + ':' + act) {
    case 'keeper:mend':       // reaches both arms out to the patient, glands held forward, head down to watch
      L.add(armL?.rotation, 'x', -1.0 * up); L.add(armR?.rotation, 'x', -1.0 * up); L.add(armL?.rotation, 'z', .25 * up); L.add(armR?.rotation, 'z', -.25 * up); L.add(head?.rotation, 'x', .35 * up); L.add(body?.rotation, 'x', .12 * up); break;
    case 'keeper:seed':       // rears up over the Cap, brood pouch swinging, and drops three Buds on it
      L.add(body?.rotation, 'x', -.35 * up); L.add(brood?.rotation, 'x', Math.sin(t * 9) * .15 * up); L.add(brood?.position, 'y', -.15 * up); L.add(head?.rotation, 'x', -.3 * up); for (const l of legs) if (l.name[2] === '0') L.add(l.rotation, 'z', (l.name[3] === 'L' ? -1 : 1) * .5 * up); break;
    case 'keeper:pod':        // kneels and presses a Spore Pod into the ground with both arms
      L.add(obj.position, 'y', -.3 * up); L.add(body?.rotation, 'x', .3 * up); L.add(armL?.rotation, 'x', -.4 * up); L.add(armR?.rotation, 'x', -.4 * up); L.add(head?.rotation, 'x', .4 * up); break;
    case 'keeper:spit': case 'shellback:spit': case 'lobber:bite':   // throws the head forward
      L.add(head?.rotation, 'x', -.25 * up); L.add(head?.position, 'z', .08 * up); L.add(body?.position, 'z', -.04 * up); break;
    case 'lobber:lob': {      // squeezes the sac flat, then it springs tall as the bile leaves the vent; braced on its legs
      const sq = p < .7 ? smooth(p / .7) : 1 - smooth((p - .7) / .3) * 1.4; L.add(halo?.scale, 'y', -.22 * sq); L.add(halo?.scale, 'x', .12 * sq); L.add(halo?.scale, 'z', .12 * sq);
      L.add(obj.position, 'y', -.12 * up); for (const l of legs) L.add(l.rotation, 'z', (l.name[3] === 'L' ? -1 : 1) * .25 * up); L.add(halo?.rotation, 'x', -.2 * up); break; }
    case 'needler:fire':      // tips the crest forward over the head and shudders as the spines go
      L.add(arms?.rotation, 'x', 1.55 * smooth(Math.min(1, p * 2))); L.add(arms?.rotation, 'z', Math.sin(t * 40) * .04 * up); L.add(head?.rotation, 'x', .2 * up); break;
    case 'smother:choke':     // the ball swells and the veil flares as a cloud of spores breathes out of every pore
      L.add(halo?.scale, 'x', .18 * up); L.add(halo?.scale, 'y', .12 * up); L.add(halo?.scale, 'z', .18 * up); L.add(head?.rotation, 'x', -.3 * up); L.add(body?.position, 'y', .1 * up); break;
    case 'smother:rot':       // leans in toward its victim, the ball tipped forward over its snout, swaying as it takes the mind
      L.add(body?.rotation, 'x', .3 * up); L.add(halo?.rotation, 'x', .35 * up); L.add(halo?.rotation, 'z', Math.sin(t * 3) * .12 * up); L.add(head?.rotation, 'x', .2 * up); break;
    case 'seeder:fling': {    // winds the sling back over the pack, then whips it forward and down
      const w = p < .6 ? -smooth(p / .6) * 1.1 : -1.1 + smooth((p - .6) / .4) * 2.0; L.add(arms?.rotation, 'x', w); L.add(body?.rotation, 'x', (p < .6 ? -.12 : .18) * up); for (const l of legs) L.add(l.rotation, 'z', (l.name[3] === 'L' ? -1 : 1) * .2 * up); break; }
    case 'gnatwing:bite': case 'husk:bite': case 'pup:bite':   // lunges, head first
      L.add(head?.rotation, 'x', .35 * up); L.add(body?.position, 'z', .15 * up); L.add(body?.rotation, 'x', .2 * up); break;
    case 'bloater:acid':      // squeezes the bladder and the feelers swing forward to spray
      L.add(halo?.scale, 'y', -.12 * up); L.add(arms?.rotation, 'x', -.7 * up); L.add(head?.rotation, 'x', -.2 * up); break;
    case 'sower:drop':        // the brood bag sags open and the body lifts as the Pups fall
      L.add(part(obj, 'pack')?.scale, 'y', .3 * up); L.add(part(obj, 'pack')?.position, 'y', -.25 * up); L.add(body?.position, 'y', .3 * up); L.add(halo?.scale, 'x', .06 * up); L.add(halo?.scale, 'z', .06 * up); break;
    case 'hooksail:reel': {   // casts the tail line forward over its back, then hauls it in
      const w = p < .4 ? smooth(p / .4) * 1.5 : 1.5 - smooth((p - .4) / .6) * 1.9; L.add(arms?.rotation, 'x', w); L.add(part(obj, 'wingL')?.rotation, 'z', .4 * up); L.add(part(obj, 'wingR')?.rotation, 'z', -.4 * up); break; }
    case 'hooksail:cloud':    // sails spread wide and beat hard, shaking the spores loose
      L.add(part(obj, 'wingL')?.rotation, 'z', -.5 * up + Math.sin(t * 24) * .3 * up); L.add(part(obj, 'wingR')?.rotation, 'z', .5 * up - Math.sin(t * 24) * .3 * up); L.add(body?.rotation, 'x', -.2 * up); break;
    case 'hooksail:drink':    // hangs nose down over its own growth, tail curled under
      L.add(body?.rotation, 'x', .55 * up); L.add(head?.rotation, 'x', .3 * up); L.add(arms?.rotation, 'x', -.6 * up); break;
    case 'shellback:curl':    // tucks the head in under the brow and pulls the legs close (heals faster)
      L.add(head?.position, 'z', -.18 * up); L.add(head?.rotation, 'x', .4 * up); for (const l of legs) L.add(l.rotation, 'z', (l.name[3] === 'L' ? -1 : 1) * .7 * up); L.add(obj.position, 'y', -.2 * up); break;
  }
}
/** The ability names actPose knows for each kind, for the HUD and for tests. */
export const ACTS: Record<string, string[]> = { keeper: ['mend', 'seed', 'pod', 'spit'], shellback: ['spit', 'curl'], lobber: ['lob', 'bite'], needler: ['fire'], smother: ['choke', 'rot'], seeder: ['fling'],
  husk: ['bite'], pup: ['bite'], gnatwing: ['bite'], bloater: ['acid'], sower: ['drop'], hooksail: ['reel', 'cloud', 'drink'], drifter: [] };

/** Fliers: wings beat, bladders breathe, hanging parts sway, and the whole body bobs slowly; with `lift` it is also raised to GLOAM_FLY (the bench does this; in the game the engine already
 *  lifts a flier by u.alt, set from the same numbers in its rules). `moving` speeds the beat. */
export function flyPose(L: Overlay, obj: THREE.Object3D, kind: string, t: number, moving: boolean, id = 0, lift = true) {
  const h = GLOAM_FLY[kind]; if (h === undefined) return;
  const body = part(obj, 'body'), halo = part(obj, 'halo'), arms = part(obj, 'arms'), wL = part(obj, 'wingL'), wR = part(obj, 'wingR');
  const slow = kind === 'drifter' || kind === 'sower' || kind === 'bloater';
  L.add(obj.position, 'y', (lift ? h : 0) + Math.sin(t * (slow ? 1.1 : 2.3) + id) * (slow ? .25 : .12));
  if (wL && wR) { const f = kind === 'gnatwing' ? 38 : moving ? 9 : 5, a = kind === 'gnatwing' ? .55 : .35, b = Math.sin(t * f + id) * a; L.add(wL.rotation, 'z', b); L.add(wR.rotation, 'z', -b); }
  if (halo) { const k = Math.sin(t * (slow ? 1.4 : 2.6) + id) * .035; L.add(halo.scale, 'x', k); L.add(halo.scale, 'z', k); L.add(halo.scale, 'y', -k * .6); }
  if (arms) L.add(arms.rotation, 'x', Math.sin(t * 1.3 + id) * (kind === 'hooksail' ? .12 : .08) + (moving ? -.15 : 0));
  L.add(body?.rotation, 'z', Math.sin(t * .9 + id) * .05);
}

// ---------------------------------------------------------------- growths (art/growths2.py)
type Anim = ((t: number) => void)[];
/** What moves on each growth: group name, how (b breathe, s sway, p pulse), speed and size. */
const BLD_MOVE: Record<string, [string, 'b' | 's' | 'p', number, number][]> = {
  eldercap: [['top', 's', .3, .03], ['top', 'b', 1.0, .02]], ancientcap: [['top', 's', .22, .025], ['top', 'b', .8, .015]],
  ventbladder: [['bulb', 'b', 1.6, .06]], shellpit: [], puffball: [['head', 's', .7, .05], ['head', 'b', 1.3, .03]], needleden: [], rotden: [],
  wingspire: [['tip', 'p', 1.4, .08]], tallspire: [['crown', 's', .4, .03]], deeproot: [['mouth', 'p', 1.1, .05]], tunnelroot: [['mouth', 'p', 1.3, .06]], sporepod: [['pod', 'p', 2.0, .07]],
};
/** Plain stand-in sizes (half width, height) for a build with no sculpt. */
const BLD_SIZE: Record<string, [number, number]> = { eldercap: [5.6, 11.5], ancientcap: [6, 14], ventbladder: [2.2, 4.6], shellpit: [3.6, 2.4], puffball: [1.5, 5.6], needleden: [3.4, 4.8],
  rotden: [3.8, 5.4], wingspire: [2.2, 10], tallspire: [2.6, 14], deeproot: [3.8, 4.8], tunnelroot: [1.6, 1.2], sporepod: [.8, 2] };
function growth(kind: string, anim: Anim): THREE.Group {
  const fig = figure(kind);
  if (!fig) { const g = new THREE.Group(), [r, h] = BLD_SIZE[kind]; put(blob(r * 2, h * 1.2, r * 2, v => { if (v.y < 0) v.y = 0; }), M.gH, g, [0, 0, 0]); return g; }
  for (const [n, how, f, a] of BLD_MOVE[kind] || []) {
    const o = fig.groups[n]; if (!o) continue; o.userData.dyn = true;
    if (how === 's') anim.push(t => { o.rotation.y = Math.sin(t * f) * a; o.rotation.z = Math.sin(t * f * .7 + 1) * a * .5; });
    else if (how === 'b') anim.push(t => { const k = Math.sin(t * f) * a; o.scale.set(1 + k * .6, 1 + k, 1 + k * .6); });
    else anim.push(t => { const k = 1 + Math.max(0, Math.sin(t * f)) ** 3 * a; o.scale.setScalar(k); });
  }
  return fig.root;
}
export const GLOAM_BUILDINGS2: Record<string, (anim: Anim) => THREE.Group> = Object.fromEntries(Object.keys(BLD_SIZE).map(k => [k, (a: Anim) => growth(k, a)]));

// ---------------------------------------------------------------- the hook the game calls each frame
/** Marks which of a body's channels the game sets outright (2) or eases (1) each frame, for Overlay.pre (see game.ts poseUnits). */
function tag(obj: THREE.Object3D) {
  if (obj.userData.tagged) return; obj.userData.tagged = true;
  (obj.position as any).__m = { y: 2, x: 2, z: 2 }; (obj.scale as any).__m = { x: 2, y: 2, z: 2 };
  const body = part(obj, 'body'), head = part(obj, 'head');
  if (body) (body.rotation as any).__m = { x: 1, z: 2 }; if (head) (head.rotation as any).__m = { x: 2, y: 1 };
  for (const l of legsOf(obj)) (l.rotation as any).__m = { y: 1, z: 1 };
}
/** The pose hook for every second-brood kind (registered in look/index.ts). Reads from the body:
 *  - `u.dig` (0 to 1) if the rules set it, else eases toward 1 while the body has the 'dug' status (src/core/status.ts);
 *  - `u.act` (an ACTS name) and `u.actP` (0 to 1) for an ability under way. */
export function lookPose(g: { time: number }, u: any, dt: number, ease: number) {
  const obj: THREE.Object3D = u.obj; if (!obj) return; tag(obj);
  const L: Overlay = obj.userData.look || (obj.userData.look = new Overlay()); L.pre(ease);
  const kind: string = u.kind, t = g.time;
  if (GLOAM_FLY[kind] !== undefined) flyPose(L, obj, kind, t, !!u.moving, u.id || 0, false);
  if (DIG[kind]) {
    const want = typeof u.dig === 'number' ? u.dig : hasStatus(u, 'dug') ? 1 : 0;
    const k = obj.userData.digK = typeof u.dig === 'number' ? u.dig : (obj.userData.digK || 0) + Math.sign(want - (obj.userData.digK || 0)) * Math.min(Math.abs(want - (obj.userData.digK || 0)), dt / .6);
    let m: THREE.Group | undefined = obj.userData.mound;
    if (k > .01 && !m) { m = obj.userData.mound = digMound(kind); obj.add(m); }
    if (m) { mound(m, k); const sc = obj.scale.x || 1, d = DIG[kind]; m.position.y = d.sink * smooth(Math.min(1, k)) / sc; m.scale.setScalar(d.mound / sc); }
    if (k > 0) digPose(L, obj, kind, k, t);
  }
  if (u.act && ACTS[kind]?.includes(u.act)) actPose(L, obj, kind, u.act, u.actP ?? .5, t);
}
/** Every kind lookPose handles. */
export const LOOK_KINDS = Object.keys(GLOAM_UNITS2);

// For the capture bench and the art review pages: the look functions on the page, so a staged shot can dig a body in or pose an ability.
if (typeof window !== 'undefined') (window as any).__gloamLook = { Overlay, digPose, digMound, mound, actPose, flyPose, lookPose, ACTS, DIG, GLOAM_FLY };
