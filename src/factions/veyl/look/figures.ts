// How the new Veyl bodies look and move (stream F of the full-depth plan). Stream A will move this into src/factions/veyl/look/.
//
// Everything here is for show: it never reads the seeded dice, never changes a number the match server keeps, and does nothing when the
// page carries no meshes (the match server, tests). The sculpts are made in art/chorus.py (and the files after it); each comes with the named
// groups hitfx.ts and stance.ts work through (body, head, armL, armR, halo) plus its own (orb, bodyB, headB ... for the Chord).
import * as THREE from 'three';
import { figure } from '../../../meshes';
import { M } from '../../../gfx';

/** The Veyl figures this file dresses, in the plan's roster order. A kind is drawn from its sculpt when the page carries one. */
export const VEYL_NEW = ['tuner', 'mute', 'choirmaster', 'chord', 'bell', 'reedwalker', 'knell', 'listener', 'ferry', 'swift', 'prism', 'omen', 'lyre', 'shard', 'cantus'] as const;
export type VKind = typeof VEYL_NEW[number];

export type Rig = Record<string, THREE.Object3D | undefined>;
export interface Look { kind: string; root: THREE.Group; rig: Rig; points: Record<string, { group: THREE.Group; at: [number, number, number] }> }

/** Builds a new Veyl body from its sculpt, or null when this page has none (then the caller uses its own stand-in). */
export function veylLook(kind: string): Look | null {
  const fig = figure(kind); if (!fig) return null;
  const look: Look = { kind, root: fig.root, rig: fig.groups, points: fig.points };
  return look;
}

// ------------------------------------------------------------------------------------------------------------------------ stand-ins
// The body a kind gets when no sculpt came (the match server, the Node tests, a file that failed to load): a few plain shapes with the
// same named groups, the right height and the one thing that tells the kind apart (the Tuner's fork, the Mute's blades, the pipes, the orb).
const geo = { cone: new THREE.ConeGeometry(1, 1, 7), sph: new THREE.SphereGeometry(1, 10, 8), cyl: new THREE.CylinderGeometry(1, 1, 1, 8), ring: new THREE.TorusGeometry(1, .06, 6, 20), box: new THREE.BoxGeometry(1, 1, 1) };
function part(parent: THREE.Object3D, g: THREE.BufferGeometry, mat: string, at: number[], size: number[], turn: number[] = [0, 0, 0]) {
  const m = new THREE.Mesh(g, M[mat] || M.vD); m.position.set(at[0], at[1], at[2]); m.scale.set(size[0], size[1], size[2]); m.rotation.set(turn[0], turn[1], turn[2]); parent.add(m); return m;
}
function group(name: string, parent: THREE.Object3D, at: number[]) { const g = new THREE.Group(); g.name = name; g.position.set(at[0], at[1], at[2]); parent.add(g); return g; }
/** One Veyl upper body on a tail: chest, head, two arms, halo. Returns its groups. */
function torso(root: THREE.Object3D, y: number, s: number, tag = '', tail = true) {
  const body = group('body' + tag, root, [0, 0, 0]), r: Rig = { ['body' + tag]: body };
  if (tail) part(body, geo.cone, 'vD', [0, y * .45, 0], [.16 * s, -y * .9, .16 * s]);
  part(body, geo.sph, 'vL', [0, y + .3 * s, 0], [.3 * s, .32 * s, .24 * s]);
  const head = r['head' + tag] = group('head' + tag, body, [0, y + .66 * s, 0]); part(head, geo.sph, 'vL', [0, .16 * s, 0], [.15 * s, .2 * s, .15 * s]);
  for (const sx of [-1, 1]) { const a = r[(sx < 0 ? 'armL' : 'armR') + tag] = group((sx < 0 ? 'armL' : 'armR') + tag, body, [sx * .34 * s, y + .5 * s, 0]); part(a, geo.cyl, 'vD', [sx * .06 * s, -.25 * s, .08 * s], [.05 * s, .55 * s, .05 * s], [.3, 0, sx * .2]); }
  return r;
}
export function standIn(kind: string): THREE.Group {
  const root = new THREE.Group(); let r: Rig;
  if (kind === 'chord') {
    r = torso(root, 1.7, 1.1); const b = torso(root, 1.7, 1, 'B', false); b.bodyB!.position.x = -.5; b.bodyB!.rotation.z = .3; r.body!.add(b.bodyB!); r.body!.position.x = .5; r.body!.rotation.z = -.3;
    const orb = group('orb', root, [0, 2.25, .55]); part(orb, geo.sph, 'vM', [0, 0, 0], [.2, .2, .2]);
    const halo = group('halo', root, [0, 3.75, -.5]); part(halo, geo.ring, 'teal', [0, 0, 0], [1.25, 1.25, 1.25]);
    return root;
  }
  if (kind === 'ferry' || kind === 'swift' || kind === 'prism' || kind === 'lyre' || kind === 'shard') {        // the flyers with no upper body: a long hull nose forward, a halo, wings or leaves
    const y = { ferry: 2.1, swift: 1.7, prism: 2.4, lyre: 2.6, shard: 1.2 }[kind]!, len = { ferry: 4.6, swift: 2, prism: 4, lyre: 6.8, shard: 1.1 }[kind]!, w = { ferry: .78, swift: .19, prism: .7, lyre: .95, shard: .2 }[kind]!;
    const body = group('body', root, [0, 0, 0]); part(body, geo.sph, kind === 'prism' || kind === 'shard' ? 'vC' : 'vI', [0, y, 0], [w, w, len / 2]);
    if (kind === 'lyre') for (const sx of [-1, 1]) part(body, geo.cyl, 'vG', [sx * .7, y + 2, -1], [.1, 4, .1], [.4, 0, 0]);
    const head = group('head', body, [0, y, len / 2]); part(head, geo.sph, kind === 'prism' ? 'vM' : 'vL', [0, 0, 0], [w * .4, w * .4, w * .3]);
    const halo = group('halo', body, kind === 'ferry' ? [0, y - .95, 0] : [0, y, -len / 2]); part(halo, geo.ring, 'teal', [0, 0, 0], kind === 'ferry' ? [1.35, 1.35, 1.35] : [w * 1.4, w * 1.4, w * 1.4], kind === 'ferry' ? [PI / 2, 0, 0] : [0, 0, 0]);
    if (kind === 'ferry') for (let i = 0; i < 6; i++) { const sx = i % 2 ? 1 : -1, z = 1 - Math.floor(i / 2); const l = group('leaf' + i, body, [sx * .5, y + .55, z]); part(l, geo.box, 'vD', [sx * .4, -.45, 0], [.06, 1.1, .9], [0, 0, sx * .6]); }
    else for (const [n, sx] of [['wingL', -1], ['wingR', 1]] as [string, number][]) { const wg = group(n, body, [sx * w * .6, y + .1, 0]); part(wg, geo.box, kind === 'swift' ? 'vC' : 'vD', [sx * .8, 0, -.3], [1.6, .02, .5], [0, sx * .4, 0]); }
    return root;
  }
  const y = kind === 'choirmaster' ? 1.4 : kind === 'mute' ? 1.05 : kind === 'omen' ? 1.3 : kind === 'cantus' ? 3.2 : 1.2;
  r = torso(root, y, kind === 'cantus' ? 2.6 : 1);
  const halo = group('halo', r.body!, [0, y + 1.0, -.3]); part(halo, geo.ring, kind === 'mute' ? 'vD' : 'teal', [0, 0, 0], [.32, .32, .32]);
  if (kind === 'tuner') { part(r.head!, geo.cyl, 'vC', [-.1, .55, 0], [.02, .5, .02]); part(r.head!, geo.cyl, 'vC', [.1, .55, 0], [.02, .5, .02]); part(r.armL!, geo.box, 'vC', [-.1, -.35, .45], [.34, .54, .02]); }
  if (kind === 'mute') for (const a of [r.armL!, r.armR!]) part(a, geo.cone, 'vC', [0, -.2, .6], [.04, .8, .01], [Math.PI / 2, 0, 0]);
  if (kind === 'omen') { for (const [n, sx] of [['wingL', -1], ['wingR', 1]] as [string, number][]) { const wg = group(n, r.body!, [sx * .2, y + 1, -.25]); part(wg, geo.box, 'vD', [sx * .8, .3, -.25], [1.6, .9, .02], [0, 0, sx * .4]); } const orb = group('orb', r.body!, [0, y + .6, .55]); part(orb, geo.box, 'vD', [0, 0, 0], [.2, .2, .2]); }
  if (kind === 'choirmaster') for (let i = 0; i < 6; i++) part(r.body!, geo.cyl, 'vG', [(i - 2.5) * .12, 2.3, -.3], [.04, 1.3 - Math.abs(i - 2.5) * .18, .04]);
  return root;
}
/** The body for a new Veyl kind: its sculpt when the page has one, the stand-in otherwise. */
export const veylBody = (kind: string) => veylLook(kind)?.root ?? standIn(kind);

// ------------------------------------------------------------------------------------------------------------------------------ poses
// A pose is laid over whatever the game has already set, through `add`, the same way stance.ts and hitfx.ts lay theirs, so it can be taken
// off again exactly. t is seconds (or 0 to 1 through a one-shot move such as a cast), k how far into the pose (0 to 1).
export type Add = (o: any, axis: string, v: number) => void;
export type PoseFn = (r: Rig, t: number, k: number, add: Add) => void;
const S = Math.sin, PI = Math.PI;
const ease = (x: number) => x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x);
/** A one-shot move in three beats: wind up until a, strike until b, then recover. Returns [wind, strike]. */
const beats = (t: number, a: number, b: number) => [t < a ? ease(t / a) : t < b ? 1 - ease((t - a) / (b - a)) : 0, t < a ? 0 : t < b ? ease((t - a) / (b - a)) : 1 - ease((t - b) / (1 - b))];

/** Gliding: the Veyl have no legs, so going somewhere is a lean into it, the tail trailing, the arms drawn back, the halo laid back. */
const glide = (lean: number, arms: number, bob: number): PoseFn => (r, t, k, add) => {
  const sw = S(t * 3.1), sw2 = S(t * 1.55);
  if (r.body) { add(r.body.rotation, 'x', lean * k + sw * .03 * k); add(r.body.rotation, 'z', sw2 * .06 * k); add(r.body.position, 'y', (bob + sw * bob * .5) * k); }
  if (r.head) add(r.head.rotation, 'x', -lean * .6 * k);
  if (r.armL) { add(r.armL.rotation, 'x', -arms * k + sw * .08 * k); add(r.armL.rotation, 'z', -.15 * arms * k); }
  if (r.armR) { add(r.armR.rotation, 'x', -arms * k - sw * .08 * k); add(r.armR.rotation, 'z', .15 * arms * k); }
  if (r.halo) add(r.halo.rotation, 'x', -lean * .9 * k);
  if (r.bodyB) add(r.bodyB.rotation, 'z', sw2 * .05 * k);
};
/** Hanging still with weight off one side: the shoulder dropped, the head turned, one arm lower. side is -1 or 1. */
const hang = (side: number, sink: number, open: number, tilt: number): PoseFn => (r, t, k, add) => {
  const br = S(t * 1.2);
  if (r.body) { add(r.body.position, 'y', -sink * k + br * .02 * k); add(r.body.rotation, 'z', side * .09 * k); add(r.body.rotation, 'y', side * .22 * k); add(r.body.rotation, 'x', -tilt * k); }
  if (r.head) { add(r.head.rotation, 'y', -side * .3 * k); add(r.head.rotation, 'x', tilt * .9 * k); }
  if (r.armL) add(r.armL.rotation, 'z', -(open + (side < 0 ? .1 : 0)) * k);
  if (r.armR) add(r.armR.rotation, 'z', (open + (side > 0 ? .1 : 0)) * k);
  if (r.halo) add(r.halo.rotation, 'x', tilt * 1.4 * k + br * .04 * k);
};

export const POSES: Record<VKind, Record<string, PoseFn>> = {
  tuner: {
    rest1: hang(1, .06, .1, .05),
    rest2: (r, t, k, add) => {                       // holds the pane up to its face and looks through it
      hang(-1, .1, 0, .02)(r, t, k, add);
      if (r.armL) { add(r.armL.rotation, 'x', -.75 * k); add(r.armL.rotation, 'y', .55 * k); add(r.armL.rotation, 'z', .1 * k); }
      if (r.head) add(r.head.rotation, 'y', .35 * k);
    },
    rest3: (r, t, k, add) => {                       // sinks low and lets the fork on its head ring: the head rocks side to side
      hang(1, .2, .3, .12)(r, t, k, add);
      if (r.head) add(r.head.rotation, 'z', S(t * 6) * .07 * k);
    },
    walk: glide(.18, .25, .03), run: glide(.4, .7, .06),
    attack: (r, t, k, add) => {                      // a flick of the open hand: the shard on it is what hits
      const [w, s] = beats(t, .35, .55);
      if (r.armR) { add(r.armR.rotation, 'x', (.5 * w - 1.1 * s) * k); add(r.armR.rotation, 'z', (.3 * w - .2 * s) * k); }
      if (r.body) add(r.body.rotation, 'y', (-.2 * w + .25 * s) * k);
    },
    glasswall: (r, t, k, add) => {                   // swings the pane out and down, as if setting it into the ground
      const [w, s] = beats(t, .4, .7);
      if (r.armL) { add(r.armL.rotation, 'x', (-1.4 * w + .5 * s) * k); add(r.armL.rotation, 'y', (.9 * w + .2 * s) * k); }
      if (r.body) { add(r.body.rotation, 'x', (-.1 * w + .25 * s) * k); add(r.body.position, 'y', -.12 * s * k); }
    },
    wardhum: (r, t, k, add) => {                     // both arms open wide, head back: humming
      if (r.armL) add(r.armL.rotation, 'z', -.9 * k); if (r.armR) add(r.armR.rotation, 'z', .9 * k);
      if (r.head) add(r.head.rotation, 'x', -.35 * k + S(t * 14) * .02 * k);
      if (r.halo) add(r.halo.rotation, 'y', t * 4 * k);
    },
    falsevoice: (r, t, k, add) => {                  // twists round on itself, arms crossed, as the copies peel off
      if (r.body) add(r.body.rotation, 'y', S(t * PI * 2) * .5 * k);
      if (r.armL) { add(r.armL.rotation, 'x', -.8 * k); add(r.armL.rotation, 'y', .9 * k); }
      if (r.armR) { add(r.armR.rotation, 'x', -.8 * k); add(r.armR.rotation, 'y', -.9 * k); }
    },
  },
  mute: {
    rest1: (r, t, k, add) => {                       // crouched low, blades crossed in front of the chest, still
      if (r.body) { add(r.body.position, 'y', -.15 * k); add(r.body.rotation, 'x', .15 * k); }
      if (r.armL) { add(r.armL.rotation, 'y', .55 * k); add(r.armL.rotation, 'x', -.3 * k); }
      if (r.armR) { add(r.armR.rotation, 'y', -.55 * k); add(r.armR.rotation, 'x', -.3 * k); }
      if (r.head) add(r.head.rotation, 'x', .2 * k);
    },
    rest2: (r, t, k, add) => {                       // upright, head cocked, listening; one blade down along the tail
      if (r.body) add(r.body.rotation, 'x', -.18 * k);
      if (r.head) { add(r.head.rotation, 'z', .35 * k); add(r.head.rotation, 'y', -.4 * k + S(t * .7) * .1 * k); }
      if (r.armL) add(r.armL.rotation, 'x', .6 * k);
    },
    walk: glide(.25, .35, .0), run: glide(.6, 1.1, .0),
    attack: (r, t, k, add) => {                      // two blades in turn, a scissor cut
      const [w, s] = beats(t, .3, .55), [w2, s2] = beats((t + .35) % 1, .3, .55);
      if (r.armR) { add(r.armR.rotation, 'x', (-.9 * w + .8 * s) * k); add(r.armR.rotation, 'y', (.5 * w - .7 * s) * k); }
      if (r.armL) { add(r.armL.rotation, 'x', (-.9 * w2 + .8 * s2) * k); add(r.armL.rotation, 'y', (-.5 * w2 + .7 * s2) * k); }
      if (r.body) add(r.body.rotation, 'x', (.12 + .2 * s) * k);
    },
    stepthrough: (r, t, k, add) => {                 // folds up tight before the blink, opens after it
      const f = t < .5 ? ease(t * 2) : 1 - ease((t - .5) * 2);
      if (r.body) { add(r.body.rotation, 'x', .5 * f * k); add(r.body.position, 'y', -.25 * f * k); }
      if (r.armL) add(r.armL.rotation, 'y', .9 * f * k); if (r.armR) add(r.armR.rotation, 'y', -.9 * f * k);
    },
  },
  choirmaster: {
    rest1: hang(-1, .05, .15, -.05),
    rest2: (r, t, k, add) => {                       // conducting nobody: the baton beats a slow three
      hang(1, .08, .05, 0)(r, t, k, add);
      const b = (t * .9) % 3, beat = S((b % 1) * PI);
      if (r.armR) { add(r.armR.rotation, 'x', (.4 - beat * .35) * k); add(r.armR.rotation, 'z', (b < 1 ? -.2 : b < 2 ? .3 : 0) * k); }
    },
    rest3: (r, t, k, add) => {                       // head bowed, arms folded across the throat
      hang(-1, .14, 0, -.1)(r, t, k, add);
      if (r.head) add(r.head.rotation, 'x', .45 * k);
      if (r.armL) { add(r.armL.rotation, 'y', .8 * k); add(r.armL.rotation, 'x', -.2 * k); }
      if (r.armR) { add(r.armR.rotation, 'x', 1.1 * k); add(r.armR.rotation, 'y', -.7 * k); }
    },
    walk: glide(.12, .2, .03), run: glide(.3, .55, .05),
    shatter: (r, t, k, add) => {                     // baton up high, then brought down hard where the note will fall
      const [w, s] = beats(t, .45, .6);
      if (r.armR) { add(r.armR.rotation, 'x', (-.5 * w + 1.4 * s) * k); }
      if (r.armL) add(r.armL.rotation, 'z', -.6 * w * k);
      if (r.head) add(r.head.rotation, 'x', (-.4 * w + .3 * s) * k);
      if (r.body) add(r.body.rotation, 'x', (-.15 * w + .2 * s) * k);
    },
    drain: (r, t, k, add) => {                       // the open hand pulls back toward the throat, hauling the energy out of its mark
      const p = ease(Math.min(1, t * 1.5));
      if (r.armL) { add(r.armL.rotation, 'x', -.3 * k); add(r.armL.rotation, 'y', .9 * p * k); }
      if (r.body) add(r.body.rotation, 'x', -.15 * p * k);
      if (r.head) add(r.head.rotation, 'x', -.3 * p * k);
    },
    join: (r, t, k, add) => {                        // turns to face its partner and reaches out with both arms
      if (r.body) add(r.body.rotation, 'y', PI / 2 * ease(t) * k);
      if (r.armL) add(r.armL.rotation, 'x', -1.2 * ease(t) * k); if (r.armR) add(r.armR.rotation, 'x', -1.2 * ease(t) * k);
    },
    attack: (r, t, k, add) => { const [w, s] = beats(t, .3, .5); if (r.armR) add(r.armR.rotation, 'x', (-.3 * w + .7 * s) * k); },
  },
  chord: {
    rest1: (r, t, k, add) => {                       // the two halves lean apart, each looking its own way
      if (r.body) add(r.body.position, 'y', (-.08 + S(t * .9) * .03) * k);
      if (r.head) add(r.head.rotation, 'y', .5 * k); if (r.headB) add(r.headB.rotation, 'y', -.5 * k);
      if (r.bodyB) add(r.bodyB.rotation, 'z', -.12 * k);
      if (r.orb) add(r.orb.position, 'y', S(t * 1.3) * .08 * k);
    },
    rest2: (r, t, k, add) => {                       // the two halves turn in and lean their heads together over the orb
      if (r.body) add(r.body.rotation, 'z', .1 * k); if (r.bodyB) add(r.bodyB.rotation, 'z', -.2 * k);
      if (r.head) { add(r.head.rotation, 'z', -.35 * k); add(r.head.rotation, 'x', .3 * k); }
      if (r.headB) { add(r.headB.rotation, 'z', .35 * k); add(r.headB.rotation, 'x', .3 * k); }
      if (r.orb) add(r.orb.rotation, 'y', t * .6 * k);
    },
    walk: glide(.12, .2, .04), run: glide(.28, .5, .06),
    attack: (r, t, k, add) => {                      // both halves throw their arms forward and the orb jumps out at the target
      const [w, s] = beats(t, .35, .5);
      for (const a of ['armL', 'armR', 'armLB', 'armRB']) if (r[a]) add(r[a]!.rotation, 'x', (.4 * w - .9 * s) * k);
      if (r.orb) { add(r.orb.position, 'z', (-.15 * w + .4 * s) * k); add(r.orb.scale, 'x', .15 * s * k); add(r.orb.scale, 'y', .15 * s * k); add(r.orb.scale, 'z', .15 * s * k); }
    },
    join: (r, t, k, add) => {                        // the moment it forms: the two halves start bent far apart and close up
      const o = 1 - ease(t);
      if (r.body) add(r.body.rotation, 'z', .5 * o * k); if (r.bodyB) add(r.bodyB.rotation, 'z', -1.0 * o * k);
      if (r.orb) { add(r.orb.scale, 'x', -.9 * o * k); add(r.orb.scale, 'y', -.9 * o * k); add(r.orb.scale, 'z', -.9 * o * k); }
      if (r.halo) add(r.halo.scale, 'x', -.6 * o * k);
    },
  },
  bell: {
    rest1: hang(1, .08, .1, .03),
    rest2: (r, t, k, add) => {                       // swings slowly, like a bell that was rung a while ago
      if (r.body) { add(r.body.rotation, 'z', S(t * 1.1) * .07 * k); add(r.body.position, 'y', -.15 * k); }
      if (r.halo) add(r.halo.rotation, 'y', t * .3 * k);
      if (r.armL) add(r.armL.rotation, 'x', .3 * k); if (r.armR) add(r.armR.rotation, 'x', .3 * k);
    },
    walk: glide(.1, .2, .02), run: glide(.22, .45, .03),
    attack: (r, t, k, add) => {                      // a two-fisted hammer blow, the whole bell rocking forward with it
      const [w, s] = beats(t, .4, .55);
      for (const a of [r.armL, r.armR]) if (a) add(a.rotation, 'x', (-1.3 * w + 1.0 * s) * k);
      if (r.body) add(r.body.rotation, 'x', (-.15 * w + .25 * s) * k);
    },
    ringshell: (r, t, k, add) => {                   // the gold hoop rises up round the bell and spins; the effect draws the dome from it
      const up = ease(Math.min(1, t * 2));
      if (r.halo) { add(r.halo.position, 'y', .5 * up * k); add(r.halo.rotation, 'y', t * 6 * k); add(r.halo.scale, 'x', .2 * up * k); add(r.halo.scale, 'z', .2 * up * k); }
      if (r.armL) add(r.armL.rotation, 'z', -.5 * up * k); if (r.armR) add(r.armR.rotation, 'z', .5 * up * k);
    },
  },
  reedwalker: {
    rest1: (r, t, k, add) => {                       // folds down on its knees, the lantern low, the lens turning slowly
      for (const [n, sx, sz] of [['legL', -1, 1], ['legR', 1, 1], ['legBL', -1, -1], ['legBR', 1, -1]] as [string, number, number][]) if (r[n]) { add(r[n]!.rotation, 'z', sx * .25 * k); add(r[n]!.rotation, 'x', -sz * .12 * k); }
      if (r.body) add(r.body.position, 'y', -1.1 * k);
      if (r.head) add(r.head.rotation, 'y', S(t * .5) * .5 * k);
    },
    rest2: (r, t, k, add) => { if (r.head) { add(r.head.rotation, 'x', .35 * k); add(r.head.rotation, 'y', S(t * .3) * .3 * k); } if (r.body) add(r.body.rotation, 'z', S(t * .7) * .03 * k); },
    walk: (r, t, k, add) => {                        // two legs at a time, crossed pairs, each lifted high and set down far ahead
      const ph = t * 2.2;
      for (const [n, o] of [['legL', 0], ['legBR', 0], ['legR', Math.PI], ['legBL', Math.PI]] as [string, number][]) if (r[n]) { const sw = S(ph + o), lift = Math.max(0, S(ph + o + Math.PI / 2)); add(r[n]!.rotation, 'x', sw * .32 * k); add(r[n]!.rotation, 'z', (n.includes('L') ? -1 : 1) * lift * .12 * k); }
      if (r.body) { add(r.body.position, 'y', Math.abs(S(ph)) * .12 * k); add(r.body.rotation, 'z', S(ph) * .04 * k); }
    },
    run: (r, t, k, add) => POSES.reedwalker.walk(r, t * 1.6, k * 1.3, add),
    attack: (r, t, k, add) => { if (r.head) add(r.head.rotation, 'y', (S(t * Math.PI * 2) * .6) * k); if (r.body) add(r.body.position, 'y', -.25 * k); },   // the beam sweeps side to side
    climb: (r, t, k, add) => {                       // steps up a cliff: both front legs lifted high and reaching
      for (const n of ['legL', 'legR']) if (r[n]) add(r[n]!.rotation, 'x', -.7 * k);
      for (const n of ['legBL', 'legBR']) if (r[n]) add(r[n]!.rotation, 'x', .2 * k);
      if (r.body) { add(r.body.rotation, 'x', -.25 * k); add(r.body.position, 'y', .4 * k); }
    },
  },
  knell: {
    rest1: hang(-1, .06, 0, .1),
    rest2: (r, t, k, add) => {                       // sets the orb down in front of it and leans on it
      if (r.orb) add(r.orb.position, 'y', -.6 * k);
      if (r.body) { add(r.body.rotation, 'x', .2 * k); add(r.body.position, 'y', -.2 * k); }
      if (r.armL) add(r.armL.rotation, 'x', .4 * k); if (r.armR) add(r.armR.rotation, 'x', .4 * k);
    },
    walk: glide(.15, .05, .02), run: glide(.3, .1, .03),
    toll: (r, t, k, add) => {                        // heaves the orb back, then rolls it out along the ground
      const [w, s] = beats(t, .45, .6);
      if (r.orb) { add(r.orb.position, 'z', (-.3 * w + 1.4 * s) * k); add(r.orb.position, 'y', (.2 * w - .7 * s) * k); add(r.orb.rotation, 'x', s * 3 * k); }
      for (const a of [r.armL, r.armR]) if (a) add(a.rotation, 'x', (.5 * w - .8 * s) * k);
      if (r.body) add(r.body.rotation, 'x', (-.2 * w + .35 * s) * k);
    },
    attack: (r, t, k, add) => POSES.knell.toll(r, t, k * .5, add),
  },
  listener: {
    rest1: (r, t, k, add) => {                       // hovers, the wings ticking over, the trumpet turning to listen
      for (const [n, sx] of [['wingL', -1], ['wingR', 1]] as [string, number][]) if (r[n]) add(r[n]!.rotation, 'z', sx * S(t * 9) * .25 * k);
      if (r.head) add(r.head.rotation, 'y', S(t * .6) * .5 * k);
      if (r.body) add(r.body.position, 'y', S(t * 1.4) * .08 * k);
    },
    walk: (r, t, k, add) => { for (const [n, sx] of [['wingL', -1], ['wingR', 1]] as [string, number][]) if (r[n]) add(r[n]!.rotation, 'z', sx * S(t * 16) * .45 * k); if (r.body) add(r.body.rotation, 'x', .25 * k); },
    run: (r, t, k, add) => { for (const [n, sx] of [['wingL', -1], ['wingR', 1]] as [string, number][]) if (r[n]) add(r[n]!.rotation, 'z', sx * S(t * 22) * .5 * k); if (r.body) add(r.body.rotation, 'x', .45 * k); },
    settle: (r, t, k, add) => {                      // folds its wings flat behind it and sinks; the halo under it opens wide (it sees further)
      for (const [n, sx] of [['wingL', -1], ['wingR', 1]] as [string, number][]) if (r[n]) { add(r[n]!.rotation, 'y', -sx * 1.1 * k); add(r[n]!.rotation, 'z', -sx * .3 * k); }
      if (r.halo) { add(r.halo.scale, 'x', 1.5 * k); add(r.halo.scale, 'z', 1.5 * k); add(r.halo.rotation, 'y', t * .8 * k); }
      if (r.body) add(r.body.position, 'y', -.3 * k);
    },
  },
  ferry: {
    rest1: (r, t, k, add) => { if (r.body) { add(r.body.position, 'y', S(t * 1.1) * .1 * k); add(r.body.rotation, 'z', S(t * .7) * .03 * k); } if (r.halo) add(r.halo.rotation, 'y', t * .5 * k); for (let i = 0; i < 6; i++) { const l = r['leaf' + i]; if (l) add(l.rotation, 'z', (i % 2 ? 1 : -1) * S(t * 1.3 + i) * .04 * k); } },
    walk: (r, t, k, add) => { if (r.body) { add(r.body.rotation, 'x', .08 * k); add(r.body.position, 'y', S(t * 2) * .06 * k); } if (r.halo) add(r.halo.rotation, 'y', t * 1.4 * k); },
    run: (r, t, k, add) => { if (r.body) { add(r.body.rotation, 'x', .16 * k); add(r.body.position, 'y', S(t * 3) * .05 * k); } if (r.halo) add(r.halo.rotation, 'y', t * 2.5 * k); for (let i = 0; i < 6; i++) { const l = r['leaf' + i]; if (l) add(l.rotation, 'z', (i % 2 ? -1 : 1) * .12 * k); } },
    unfold: (r, t, k, add) => {                      // sinks to the ground and the six leaves swing out flat round it: a song field opens
      const u = ease(Math.min(1, t * 1.4)) * k;
      if (r.body) add(r.body.position, 'y', -1.1 * u);
      for (let i = 0; i < 6; i++) { const l = r['leaf' + i], sx = i % 2 ? 1 : -1; if (l) { add(l.rotation, 'z', sx * 1.25 * u); add(l.rotation, 'y', sx * (Math.floor(i / 2) - 1) * -.35 * u); } }
      if (r.halo) { add(r.halo.scale, 'x', 1.6 * u); add(r.halo.scale, 'z', 1.6 * u); add(r.halo.position, 'y', .9 * u); add(r.halo.rotation, 'y', t * .3 * k); }
      if (r.head) add(r.head.rotation, 'x', .35 * u);
    },
  },
  swift: {
    rest1: (r, t, k, add) => { if (r.body) { add(r.body.position, 'y', S(t * 2.3) * .08 * k); add(r.body.rotation, 'z', S(t * 1.1) * .1 * k); } for (const [n, sx] of [['wingL', -1], ['wingR', 1]] as [string, number][]) if (r[n]) add(r[n]!.rotation, 'z', sx * S(t * 3) * .08 * k); if (r.halo) add(r.halo.rotation, 'z', t * 2 * k); },
    walk: (r, t, k, add) => { if (r.body) { add(r.body.rotation, 'x', .1 * k); add(r.body.rotation, 'z', S(t * 1.6) * .25 * k); } for (const [n, sx] of [['wingL', -1], ['wingR', 1]] as [string, number][]) if (r[n]) add(r[n]!.rotation, 'y', sx * .15 * k); if (r.halo) add(r.halo.rotation, 'z', t * 6 * k); },
    run: (r, t, k, add) => { if (r.body) { add(r.body.rotation, 'x', .2 * k); add(r.body.rotation, 'z', S(t * 2.2) * .45 * k); } for (const [n, sx] of [['wingL', -1], ['wingR', 1]] as [string, number][]) if (r[n]) add(r[n]!.rotation, 'y', sx * .4 * k); if (r.halo) { add(r.halo.rotation, 'z', t * 12 * k); add(r.halo.scale, 'x', .3 * k); add(r.halo.scale, 'y', .3 * k); } },
    attack: (r, t, k, add) => { const [w, s2] = beats(t, .3, .5); if (r.body) { add(r.body.rotation, 'x', (-.2 * w + .35 * s2) * k); add(r.body.position, 'z', .5 * s2 * k); } for (const [n, sx] of [['wingL', -1], ['wingR', 1]] as [string, number][]) if (r[n]) add(r[n]!.rotation, 'y', sx * (.5 * w - .2 * s2) * k); },
    lift: (r, t, k, add) => {                        // hangs nose down over its mark, wings spread wide and beating, the ring dropped below it
      if (r.body) { add(r.body.rotation, 'x', .9 * k); add(r.body.position, 'y', .4 * k); }
      for (const [n, sx] of [['wingL', -1], ['wingR', 1]] as [string, number][]) if (r[n]) { add(r[n]!.rotation, 'y', -sx * .3 * k); add(r[n]!.rotation, 'z', sx * S(t * 14) * .35 * k); }
      if (r.halo) { add(r.halo.position, 'y', -.7 * k); add(r.halo.rotation, 'z', t * 8 * k); }
    },
  },
  prism: {
    rest1: (r, t, k, add) => { if (r.body) { add(r.body.position, 'y', S(t * .9) * .12 * k); add(r.body.rotation, 'z', S(t * .6) * .04 * k); } for (const [n, sx] of [['wingL', -1], ['wingR', 1]] as [string, number][]) if (r[n]) add(r[n]!.rotation, 'z', sx * S(t * 1.2) * .08 * k); if (r.halo) add(r.halo.rotation, 'z', t * .8 * k); },
    walk: (r, t, k, add) => { if (r.body) add(r.body.rotation, 'x', .06 * k); for (const [n, sx] of [['wingL', -1], ['wingR', 1]] as [string, number][]) if (r[n]) add(r[n]!.rotation, 'y', sx * .2 * k); if (r.halo) add(r.halo.rotation, 'z', t * 2 * k); },
    run: (r, t, k, add) => { if (r.body) add(r.body.rotation, 'x', .12 * k); for (const [n, sx] of [['wingL', -1], ['wingR', 1]] as [string, number][]) if (r[n]) add(r[n]!.rotation, 'y', sx * .45 * k); if (r.halo) add(r.halo.rotation, 'z', t * 4 * k); },
    attack: (r, t, k, add) => { if (r.head) add(r.head.position, 'z', -.1 * S(t * 20) * k); if (r.halo) add(r.halo.rotation, 'z', t * 6 * k); if (r.body) add(r.body.rotation, 'x', .05 * k); },
    burnbright: (r, t, k, add) => {                  // the sails fold up flat, the halo spins hard and the lens is pushed forward on its fork
      for (const [n, sx] of [['wingL', -1], ['wingR', 1]] as [string, number][]) if (r[n]) add(r[n]!.rotation, 'z', -sx * .7 * k);
      if (r.halo) { add(r.halo.rotation, 'z', t * 10 * k); add(r.halo.scale, 'x', .25 * k); add(r.halo.scale, 'y', .25 * k); }
      if (r.head) add(r.head.position, 'z', .35 * k);
    },
  },
  omen: {
    rest1: (r, t, k, add) => { if (r.body) add(r.body.position, 'y', S(t * 1.3) * .08 * k); for (const [n, sx] of [['wingL', -1], ['wingR', 1]] as [string, number][]) if (r[n]) add(r[n]!.rotation, 'y', -sx * (.25 + S(t * 2.4) * .15) * k); if (r.head) add(r.head.rotation, 'y', S(t * .5) * .4 * k); },
    rest2: (r, t, k, add) => {                       // folds its wings round itself like a cloak and turns the stone in its hands
      for (const [n, sx] of [['wingL', -1], ['wingR', 1]] as [string, number][]) if (r[n]) add(r[n]!.rotation, 'y', sx * .9 * k);
      if (r.orb) add(r.orb.rotation, 'y', t * 1.5 * k); if (r.head) add(r.head.rotation, 'x', .25 * k);
    },
    walk: (r, t, k, add) => { if (r.body) add(r.body.rotation, 'x', .25 * k); for (const [n, sx] of [['wingL', -1], ['wingR', 1]] as [string, number][]) if (r[n]) add(r[n]!.rotation, 'y', -sx * S(t * 6) * .45 * k); },
    run: (r, t, k, add) => { if (r.body) add(r.body.rotation, 'x', .5 * k); for (const [n, sx] of [['wingL', -1], ['wingR', 1]] as [string, number][]) if (r[n]) add(r[n]!.rotation, 'y', -sx * S(t * 9) * .6 * k); },
    attack: (r, t, k, add) => {                      // Shrill: the stone held out at arm's length and the hood thrown back
      for (const a of [r.armL, r.armR]) if (a) add(a.rotation, 'x', -.6 * k);
      if (r.orb) add(r.orb.position, 'z', .3 * k); if (r.head) add(r.head.rotation, 'x', -.3 * k);
    },
    reveal: (r, t, k, add) => {                      // wings thrown wide, the eye marks shown full on, arms flung out
      for (const [n, sx] of [['wingL', -1], ['wingR', 1]] as [string, number][]) if (r[n]) { add(r[n]!.rotation, 'y', sx * .3 * k); add(r[n]!.rotation, 'z', sx * .25 * k); }
      if (r.armL) add(r.armL.rotation, 'z', -.9 * k); if (r.armR) add(r.armR.rotation, 'z', .9 * k);
    },
    still: (r, t, k, add) => {                       // drops the stone: it falls away from its hands
      const [w, s2] = beats(t, .35, .6);
      if (r.orb) add(r.orb.position, 'y', -1.6 * s2 * k);
      for (const a of [r.armL, r.armR]) if (a) add(a.rotation, 'x', (-.4 * w + .3 * s2) * k);
      if (r.body) add(r.body.position, 'y', .2 * w * k);
    },
  },
  lyre: {
    rest1: (r, t, k, add) => { if (r.body) { add(r.body.position, 'y', S(t * .7) * .15 * k); add(r.body.rotation, 'z', S(t * .5) * .03 * k); } for (const [n, sx] of [['wingL', -1], ['wingR', 1]] as [string, number][]) if (r[n]) add(r[n]!.rotation, 'z', sx * S(t * .9) * .06 * k); if (r.halo) add(r.halo.rotation, 'y', t * .4 * k); },
    walk: (r, t, k, add) => { if (r.body) add(r.body.rotation, 'x', .05 * k); for (const [n, sx] of [['wingL', -1], ['wingR', 1]] as [string, number][]) if (r[n]) add(r[n]!.rotation, 'y', sx * .15 * k); if (r.halo) add(r.halo.rotation, 'y', t * 1.2 * k); },
    run: (r, t, k, add) => { if (r.body) add(r.body.rotation, 'x', .1 * k); for (const [n, sx] of [['wingL', -1], ['wingR', 1]] as [string, number][]) if (r[n]) add(r[n]!.rotation, 'y', sx * .35 * k); if (r.halo) add(r.halo.rotation, 'y', t * 2.5 * k); },
    attack: (r, t, k, add) => {                      // Shard Launch: the hull dips and the fins flare as the Shards leave the strings
      const [w, s2] = beats(t, .3, .55);
      if (r.body) { add(r.body.rotation, 'x', (.08 * w - .06 * s2) * k); add(r.body.position, 'y', -.2 * w * k); }
      for (const [n, sx] of [['wingL', -1], ['wingR', 1]] as [string, number][]) if (r[n]) add(r[n]!.rotation, 'z', sx * .3 * s2 * k);
      if (r.head) add(r.head.rotation, 'x', -.2 * s2 * k);
    },
  },
  shard: {
    rest1: (r, t, k, add) => { if (r.body) { add(r.body.position, 'y', S(t * 3) * .1 * k); add(r.body.rotation, 'z', t * .8 * k); } if (r.halo) add(r.halo.rotation, 'z', -t * 3 * k); },
    walk: (r, t, k, add) => { if (r.body) add(r.body.rotation, 'z', t * 2 * k); for (const [n, sx] of [['wingL', -1], ['wingR', 1]] as [string, number][]) if (r[n]) add(r[n]!.rotation, 'y', sx * .3 * k); },
    run: (r, t, k, add) => { if (r.body) { add(r.body.rotation, 'z', t * 5 * k); add(r.body.rotation, 'x', .2 * k); } for (const [n, sx] of [['wingL', -1], ['wingR', 1]] as [string, number][]) if (r[n]) add(r[n]!.rotation, 'y', sx * .6 * k); },
    attack: (r, t, k, add) => { const [w, s2] = beats(t, .25, .45); if (r.body) { add(r.body.position, 'z', (-.3 * w + .6 * s2) * k); add(r.body.rotation, 'x', .3 * s2 * k); } },
  },
  cantus: {
    rest1: (r, t, k, add) => {                       // conducting slowly, arms rising and falling, the clock hand turning
      if (r.armL) add(r.armL.rotation, 'z', (-.15 + S(t * .8) * .2) * k); if (r.armR) add(r.armR.rotation, 'z', (.15 - S(t * .8 + .6) * .2) * k);
      if (r.body) add(r.body.position, 'y', S(t * .5) * .15 * k); if (r.halo) add(r.halo.rotation, 'z', -t * .2 * k);
    },
    rest2: (r, t, k, add) => {                       // arms lowered and crossed, head bowed: listening
      if (r.armL) { add(r.armL.rotation, 'x', .9 * k); add(r.armL.rotation, 'z', .9 * k); } if (r.armR) { add(r.armR.rotation, 'x', .9 * k); add(r.armR.rotation, 'z', -.9 * k); }
      if (r.head) add(r.head.rotation, 'x', .3 * k); if (r.halo) add(r.halo.rotation, 'z', -t * .1 * k);
    },
    walk: glide(.1, .3, .05), run: glide(.2, .6, .08),
    attack: (r, t, k, add) => { const [w, s2] = beats(t, .35, .55); if (r.armR) add(r.armR.rotation, 'x', (.4 * w - 1.0 * s2) * k); if (r.head) add(r.head.rotation, 'x', -.2 * s2 * k); },
    gather: (r, t, k, add) => {                      // both arms swept in toward the chest, calling the others to it
      const [w, s2] = beats(t, .4, .7);
      if (r.armL) { add(r.armL.rotation, 'z', (-.8 * w + .6 * s2) * k); add(r.armL.rotation, 'y', .6 * s2 * k); } if (r.armR) { add(r.armR.rotation, 'z', (.8 * w - .6 * s2) * k); add(r.armR.rotation, 'y', -.6 * s2 * k); }
      if (r.body) add(r.body.rotation, 'x', .15 * s2 * k);
    },
    holdtime: (r, t, k, add) => {                    // one hand held up flat and still; the clock halo stops, then turns back
      if (r.armR) { add(r.armR.rotation, 'x', -1.0 * k); add(r.armR.rotation, 'z', -.3 * k); } if (r.halo) add(r.halo.rotation, 'z', S(t * 2) * .3 * k);
      if (r.head) add(r.head.rotation, 'x', -.2 * k);
    },
  },
};

/** Lays one pose on a rig and returns a function that takes it off again. For benches and the stance layer. */
export function pose(r: Rig, fn: PoseFn, t: number, k = 1) {
  const tg: any[] = [], ax: string[] = [], val: number[] = [];
  fn(r, t, k, (o, a, v) => { o[a] += v; tg.push(o); ax.push(a); val.push(v); });
  return () => { for (let i = tg.length - 1; i >= 0; i--) tg[i][ax[i]] -= val[i]; };
}

// ------------------------------------------------------------------------------------------------------------------- the Mute unseen
// A Mute nobody has detected is not invisible to its own side: they see a shimmer, a body drawn only where light bends round its edges.
// The shimmer keeps the figure's outline (the edge glows, the middle is clear) and ripples upward, so it reads as "there, but unseen".
const SHIMMER = new THREE.ShaderMaterial({
  uniforms: { uTime: { value: 0 }, uTint: { value: new THREE.Color('#b9a8ff') } },
  vertexShader: `uniform float uTime; varying vec3 vN; varying vec3 vV; varying float vY;
    void main(){ vec3 p = position + normal * (.012 * sin(position.y * 22. - uTime * 6.)); vec4 mv = modelViewMatrix * vec4(p, 1.); vN = normalize(normalMatrix * normal); vV = -mv.xyz; vY = position.y; gl_Position = projectionMatrix * mv; }`,
  fragmentShader: `uniform float uTime; uniform vec3 uTint; varying vec3 vN; varying vec3 vV; varying float vY;
    void main(){ float f = 1. - abs(dot(normalize(vN), normalize(vV))); f = pow(f, 2.2); float band = .55 + .45 * sin(vY * 9. - uTime * 3.); float a = clamp(f * band * .9 + .03, 0., .8); gl_FragColor = vec4(uTint * (.6 + f), a); }`,
  transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
});
/** Turns a body's shimmer on or off. The materials it wore are kept on each mesh and put back when it is off. */
export function unseen(root: THREE.Object3D, on: boolean) {
  root.traverse(o => { const m = o as THREE.Mesh; if (!m.isMesh) return; if (on) { if (!m.userData.seenMat) m.userData.seenMat = m.material; m.material = SHIMMER; } else if (m.userData.seenMat) { m.material = m.userData.seenMat; delete m.userData.seenMat; } });
}
export const shimmerTick = (t: number) => { SHIMMER.uniforms.uTime.value = t; };

// ------------------------------------------------------------------------------------------------------------------- ability effects
// Sketches of what each Veyl ability looks like, to move onto stream H's effect kit when it lands. Each one is a group to add to the scene
// and a tick(seconds since cast) that returns false when it is over. Every one has its own shape and colour so they can be told apart at a
// glance from first person and from the command view: Glass Wall is a pale cyan pane, Ward Hum a slow violet dome of rings, False Voice
// two lilac outlines peeling off, Step Through a black slit and a pale ring where it lands, Shatter Note magenta shards falling into a
// circle, Drain a gold thread pulled from the mark to the caster, Join two teal threads closing into one orb.
export interface Fx { obj: THREE.Group; tick: (t: number) => boolean }
const add = (c: string, o = 1) => new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: o, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
const fade = (m: THREE.Mesh, k: number) => { (m.material as THREE.MeshBasicMaterial).opacity = Math.max(0, Math.min(1, k)); };
const FXG = { plane: new THREE.PlaneGeometry(1, 1), ring: new THREE.TorusGeometry(1, .03, 6, 40), disc: new THREE.CircleGeometry(1, 40), shard: new THREE.OctahedronGeometry(1, 0), line: new THREE.CylinderGeometry(1, 1, 1, 6, 1, true), sph: new THREE.SphereGeometry(1, 16, 10) };

/** Glass Wall: a pane 6 m long and 3.5 m tall rises out of the ground across a path, stands 11 s, then cracks and falls in pieces. */
export function glassWall(len = 6, life = 11): Fx {
  const obj = new THREE.Group(), pane = new THREE.Mesh(FXG.plane, add('#9ff6ff', .5)), edge = new THREE.Mesh(FXG.plane, add('#e8ffff', .9));
  pane.scale.set(len, 3.5, 1); edge.scale.set(len, .08, 1); obj.add(pane, edge);
  const bits: THREE.Mesh[] = []; for (let i = 0; i < 14; i++) { const b = new THREE.Mesh(FXG.shard, add('#bff8ff', .8)); b.scale.set(.3, .5, .05); b.visible = false; obj.add(b); bits.push(b); }
  return { obj, tick: t => {
    const up = Math.min(1, t / .35);
    pane.position.y = 1.75 * up; pane.scale.y = 3.5 * up; edge.position.y = 3.5 * up; fade(pane, .35 + .1 * Math.sin(t * 4));
    if (t > life) { const k = (t - life) / .8; pane.visible = edge.visible = false; bits.forEach((b, i) => { b.visible = true; const x = (i / 13 - .5) * len; b.position.set(x, 3 - k * k * 3 * (1 + i % 3 * .3), (i % 2 - .5) * k); b.rotation.set(k * 3 + i, k * 2, 0); fade(b, 1 - k); }); return k < 1; }
    return true;
  } };
}
/** Ward Hum: a dome of slow violet rings over everyone within 4 m of the Tuner, rising and fading in turn, while the hum lasts. */
export function wardHum(r = 4, life = 6): Fx {
  const obj = new THREE.Group(), rings = [0, 1, 2, 3].map(() => { const m = new THREE.Mesh(FXG.ring, add('#b48cff', .7)); m.rotation.x = Math.PI / 2; obj.add(m); return m; });
  const dome = new THREE.Mesh(FXG.sph, add('#7a5cff', .12)); dome.scale.set(r, r * .6, r); obj.add(dome);
  return { obj, tick: t => { rings.forEach((m, i) => { const k = ((t * .5 + i / 4) % 1), a = Math.asin(Math.min(1, k)); m.position.y = Math.sin(a) * r * .6; const rr = Math.cos(a) * r; m.scale.set(rr, rr, 1); fade(m, (1 - k) * Math.min(1, (life - t) * 2)); }); fade(dome, .12 * Math.min(1, t * 3, life - t)); return t < life; } };
}
/** False Voice: two lilac copies peel off the Tuner to either side; they are drawn as outlines only, so its own side can tell them apart. */
export function falseVoice(body: THREE.Object3D, life = 30): Fx {
  const obj = new THREE.Group(), ghost = add('#d9c4ff', .45), copies = [-1, 1].map(sx => { const c = body.clone(true); c.traverse(o => { if ((o as THREE.Mesh).isMesh) (o as THREE.Mesh).material = ghost; }); c.userData.sx = sx; obj.add(c); return c; });
  return { obj, tick: t => { const k = Math.min(1, t / .6); copies.forEach(c => { c.position.set(c.userData.sx * 1.6 * k, 0, -.3 * k); }); ghost.opacity = .45 * Math.min(1, (life - t) / 1.5) * (.8 + .2 * Math.sin(t * 9)); return t < life; } };
}
/** Step Through: a black slit where the Mute was and a pale ring on the ground where it comes out, 8 m ahead. */
export function stepThrough(dist = 8): Fx {
  const obj = new THREE.Group(), slit = new THREE.Mesh(FXG.plane, new THREE.MeshBasicMaterial({ color: '#05030a', transparent: true, depthWrite: false, side: THREE.DoubleSide })), out = new THREE.Mesh(FXG.ring, add('#e8e0ff', .9));
  slit.position.y = 1.1; out.rotation.x = Math.PI / 2; out.position.set(0, .05, dist); obj.add(slit, out);
  return { obj, tick: t => { const a = t < .15 ? t / .15 : Math.max(0, 1 - (t - .15) / .35); slit.scale.set(.18 * a, 2.2 * Math.min(1, t / .1), 1); (slit.material as THREE.MeshBasicMaterial).opacity = a; const b = Math.min(1, t / .5); out.scale.set(.3 + b * 1.2, .3 + b * 1.2, 1); fade(out, 1 - b); return t < .6; } };
}
/** Shatter Note: a magenta circle 3 m across is drawn on the ground, then shards fall into it for 4 s, each bursting where it lands. */
export function shatterNote(r = 3, life = 4): Fx {
  const obj = new THREE.Group(), mark = new THREE.Mesh(FXG.ring, add('#ff4fd0', .9)), fill = new THREE.Mesh(FXG.disc, add('#ff4fd0', .15)); mark.rotation.x = fill.rotation.x = -Math.PI / 2; mark.position.y = fill.position.y = .06; mark.scale.set(r, r, 1); fill.scale.set(r, r, 1); obj.add(mark, fill);
  const sh = Array.from({ length: 12 }, (_, i) => { const m = new THREE.Mesh(FXG.shard, add('#ff8ae6', .9)); m.scale.set(.12, .5, .12); m.userData.at = [Math.cos(i * 2.4) * r * Math.sqrt((i * .37) % 1), Math.sin(i * 2.4) * r * Math.sqrt((i * .37) % 1)]; m.userData.t0 = (i / 12) * life * .9; obj.add(m); return m; });
  return { obj, tick: t => { fade(mark, Math.min(1, t * 3, (life + .3 - t) * 3)); fade(fill, .15 + .1 * Math.sin(t * 12)); sh.forEach(m => { const k = (t - m.userData.t0) / .4; m.visible = k > 0 && k < 1.4; m.position.set(m.userData.at[0], Math.max(0, 6 * (1 - k)), m.userData.at[1]); const burst = k > 1 ? 1 + (k - 1) * 6 : 1; m.scale.set(.12 * burst, .5 / burst, .12 * burst); fade(m, k > 1 ? 1.4 - k : .9); }); return t < life + .3; } };
}
/** Drain: a gold thread from the mark to the caster, with beads running along it toward the caster for as long as it pulls. */
export function drain(from: THREE.Vector3, to: THREE.Vector3, life = 1.2): Fx {
  const obj = new THREE.Group(), line = new THREE.Mesh(FXG.line, add('#ffd35a', .7)), beads = [0, 1, 2, 3, 4].map(() => { const b = new THREE.Mesh(FXG.sph, add('#fff0a8', 1)); b.scale.setScalar(.09); obj.add(b); return b; });
  obj.add(line); const d = to.clone().sub(from), L = d.length(); line.position.copy(from).addScaledVector(d, .5); line.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.clone().normalize()); line.scale.set(.025, L, .025);
  return { obj, tick: t => { beads.forEach((b, i) => { const k = (t * 1.6 + i / 5) % 1; b.position.copy(from).addScaledVector(d, k); }); fade(line, .7 * Math.min(1, (life - t) * 4)); return t < life; } };
}
/** Join: two teal threads from two casters bend toward the point between them and wind into an orb that grows to the Chord's size. */
export function join(a: THREE.Vector3, b: THREE.Vector3, life = 2): Fx {
  const obj = new THREE.Group(), mid = a.clone().add(b).multiplyScalar(.5).setY(2.2), orb = new THREE.Mesh(FXG.sph, add('#3fe0d0', .8)); obj.add(orb); orb.position.copy(mid);
  const motes = Array.from({ length: 16 }, (_, i) => { const m = new THREE.Mesh(FXG.sph, add(i % 2 ? '#3fe0d0' : '#ff4fd0', 1)); m.scale.setScalar(.07); m.userData.from = i % 2 ? a : b; m.userData.o = i / 16; obj.add(m); return m; });
  return { obj, tick: t => { const k = Math.min(1, t / life); motes.forEach(m => { const s = Math.min(1, (k + m.userData.o) % 1 * 1.2), f = m.userData.from as THREE.Vector3; m.position.lerpVectors(f.clone().setY(2), mid, s); m.position.y += Math.sin(s * Math.PI) * .6; m.visible = k < .95; }); orb.scale.setScalar(.05 + k * .3); fade(orb, k < 1 ? .8 : 0); return t < life + .1; } };
}
/** Ring Shell: a gold dome of hexagon-cut glass round the Bell; each hit lights the cell it lands on, and the dome cracks and falls when spent. */
export function ringShell(r = 1.9, life = 6): Fx {
  const obj = new THREE.Group(), dome = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 1), add('#ffd35a', .22)), wire = new THREE.Mesh(new THREE.IcosahedronGeometry(1.01, 1), new THREE.MeshBasicMaterial({ color: '#ffe9a0', wireframe: true, transparent: true, opacity: .8, depthWrite: false }));
  dome.scale.set(r, r * .9, r); wire.scale.copy(dome.scale); dome.position.y = wire.position.y = 1.5; obj.add(dome, wire);
  return { obj, tick: t => { const up = ease(Math.min(1, t * 3)), end = Math.max(0, Math.min(1, life - t)); const sc = r * (.6 + .4 * up); dome.scale.set(sc, sc * .9, sc); wire.scale.copy(dome.scale); fade(dome, .22 * end * (1 + .3 * S(t * 10))); (wire.material as THREE.MeshBasicMaterial).opacity = .8 * end; wire.rotation.y = t * .4; return t < life; } };
}
/** Toll: the Knell's orb rolls along the ground for 3 s ringing (a violet ring spreads off it every half second), then bursts into a
 *  wide magenta flash 3.5 m across that hits friend and foe alike, so the burst ring is drawn in both colours, ours and theirs. */
export function toll(dir = new THREE.Vector3(0, 0, 1), dist = 9, roll = 3): Fx {
  const obj = new THREE.Group(), orb = new THREE.Mesh(FXG.sph, add('#ff4f9a', .9)), rings = [0, 1, 2].map(() => { const m = new THREE.Mesh(FXG.ring, add('#b48cff', .8)); m.rotation.x = Math.PI / 2; obj.add(m); return m; });
  const burst = new THREE.Mesh(FXG.sph, add('#ff4fd0', .7)), edge = new THREE.Mesh(FXG.ring, add('#ffffff', 1)); edge.rotation.x = Math.PI / 2; orb.scale.setScalar(.35); obj.add(orb, burst, edge);
  return { obj, tick: t => {
    const k = Math.min(1, t / roll); orb.position.copy(dir).multiplyScalar(dist * k).setY(.35); orb.visible = t < roll;
    rings.forEach((m, i) => { const q = ((t * 2 + i / 3) % 1); m.position.copy(orb.position).setY(.05); m.scale.set(.4 + q * 2, .4 + q * 2, 1); fade(m, t < roll ? 1 - q : 0); });
    const b = (t - roll) / .5; burst.visible = edge.visible = b > 0 && b < 1; if (b > 0) { burst.position.copy(orb.position); edge.position.copy(orb.position).setY(.06); burst.scale.setScalar(3.5 * ease(b)); edge.scale.set(3.5 * ease(b), 3.5 * ease(b), 1); fade(burst, .7 * (1 - b)); fade(edge, 1 - b); }
    return t < roll + .5;
  } };
}
/** Settle: the Listener's sight ring, a thin teal circle on the ground at its new sight range, drawn while it is settled. */
export function settle(r = 13): Fx {
  const obj = new THREE.Group(), ring = new THREE.Mesh(FXG.ring, add('#3fe0d0', .6)); ring.rotation.x = Math.PI / 2; ring.position.y = .08; obj.add(ring);
  return { obj, tick: t => { const k = ease(Math.min(1, t * 1.5)); ring.scale.set(r * k, r * k, 3); fade(ring, .5 + .15 * S(t * 3)); return true; } };
}
/** Unfold: the Ferry's song field. A teal disc spreads 6.5 m across the ground from under it, its edge a bright ring with six
 *  leaf-shaped marks round it (one under each opened leaf), and it breathes slowly for as long as the Ferry stays unfolded. */
export function unfold(r = 6.5): Fx {
  const obj = new THREE.Group(), disc = new THREE.Mesh(FXG.disc, add('#3fe0d0', .16)), edge = new THREE.Mesh(FXG.ring, add('#9ffff0', .85));
  disc.rotation.x = edge.rotation.x = -Math.PI / 2; disc.position.y = .05; edge.position.y = .07; obj.add(disc, edge);
  const marks = Array.from({ length: 6 }, (_, i) => { const m = new THREE.Mesh(FXG.shard, add('#ff4fd0', .7)); m.scale.set(.5, .03, .22); m.userData.a = i / 6 * Math.PI * 2; obj.add(m); return m; });
  return { obj, tick: t => { const k = ease(Math.min(1, t / 1.2)), br = 1 + .03 * S(t * 1.6), rr = r * k * br; disc.scale.set(rr, rr, 1); edge.scale.set(rr, rr, 3); fade(disc, .16 + .05 * S(t * 1.6)); marks.forEach(m => { const a = m.userData.a + t * .1; m.position.set(Math.cos(a) * rr * .82, .08, Math.sin(a) * rr * .82); m.rotation.y = -a; fade(m, .7 * k); }); return true; } };
}
/** Lift: a pale violet column from the Swift down to the body it holds, rings climbing it, the held body's shadow a dark ring under it. */
export function lift(h = 4, life = 8): Fx {
  const obj = new THREE.Group(), col = new THREE.Mesh(FXG.line, add('#c9b6ff', .28)), shadow = new THREE.Mesh(FXG.ring, add('#5a3fa0', .7));
  col.scale.set(.7, h, .7); col.position.y = h / 2; shadow.rotation.x = -Math.PI / 2; shadow.position.y = .06; shadow.scale.set(.8, .8, 4); obj.add(col, shadow);
  const rings = [0, 1, 2, 3].map(() => { const m = new THREE.Mesh(FXG.ring, add('#efe6ff', .9)); m.rotation.x = Math.PI / 2; obj.add(m); return m; });
  return { obj, tick: t => { const end = Math.min(1, (life - t) * 2, t * 4); fade(col, .28 * end); fade(shadow, .7 * end); rings.forEach((m, i) => { const q = (t * .8 + i / 4) % 1; m.position.y = q * h; m.scale.set(.75 - q * .2, .75 - q * .2, 1); fade(m, end * (1 - q)); }); return t < life; } };
}
/** Burn Bright: the Prism's beam, a white core in an amber sheath, growing thicker and hotter the longer it holds on plated bodies. */
export function burnBright(len = 9, life = 4): Fx {
  const obj = new THREE.Group(), core = new THREE.Mesh(FXG.line, add('#ffffff', 1)), sheath = new THREE.Mesh(FXG.line, add('#ffb23a', .45)), hit = new THREE.Mesh(FXG.sph, add('#ffd35a', .9));
  for (const m of [core, sheath]) { m.rotation.x = Math.PI / 2; m.position.set(0, 2.4, len / 2); } hit.position.set(0, 2.4, len); obj.add(sheath, core, hit);
  return { obj, tick: t => { const g = 1 + Math.min(1, t / life) * 2.5, fl = 1 + .15 * S(t * 40); core.scale.set(.04 * g * fl, len, .04 * g * fl); sheath.scale.set(.12 * g * fl, len, .12 * g * fl); hit.scale.setScalar(.25 * g * fl); fade(sheath, .3 + .15 * g / 3.5); return t < life; } };
}
/** Shrill: the Omen's beam, thin and jagged, red-white, with small white rings snapping off it where it meets soft bodies. */
export function shrill(len = 7, life = 1.5): Fx {
  const obj = new THREE.Group(), segs = Array.from({ length: 8 }, () => { const m = new THREE.Mesh(FXG.line, add('#ff6a6a', .9)); obj.add(m); return m; });
  const rings = [0, 1, 2].map(() => { const m = new THREE.Mesh(FXG.ring, add('#ffffff', .9)); obj.add(m); return m; });
  return { obj, tick: t => {
    const pts = Array.from({ length: 9 }, (_, i) => new THREE.Vector3(i ? S(t * 50 + i * 7) * .12 : 0, 1.9 + (i ? S(t * 43 + i * 3) * .12 : 0) - i / 8 * 1.4, i / 8 * len));
    segs.forEach((m, i) => { const a = pts[i], b = pts[i + 1], d = b.clone().sub(a); m.position.copy(a).addScaledVector(d, .5); m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.clone().normalize()); m.scale.set(.03, d.length(), .03); fade(m, Math.min(1, (life - t) * 4)); });
    rings.forEach((m, i) => { const q = (t * 3 + i / 3) % 1; m.position.copy(pts[8]); m.scale.setScalar(.15 + q * .6); fade(m, 1 - q); });
    return t < life;
  } };
}
/** Reveal: a ring of the Omen's eye marks spreads out over the ground 6 m across; anything unseen inside it is drawn in magenta outline. */
export function reveal(r = 6, life = 20): Fx {
  const obj = new THREE.Group(), edge = new THREE.Mesh(FXG.ring, add('#ff4fd0', .8)); edge.rotation.x = -Math.PI / 2; edge.position.y = .07; obj.add(edge);
  const eyes = Array.from({ length: 8 }, (_, i) => { const e = new THREE.Mesh(FXG.sph, add(i % 2 ? '#3fe0d0' : '#ff4fd0', .9)); e.scale.set(.35, .02, .2); e.userData.a = i / 8 * Math.PI * 2; obj.add(e); return e; });
  return { obj, tick: t => { const k = ease(Math.min(1, t / .8)), end = Math.min(1, life - t); edge.scale.set(r * k, r * k, 3); fade(edge, .8 * end); eyes.forEach(e => { const a = e.userData.a - t * .3; e.position.set(Math.cos(a) * r * k, .1, Math.sin(a) * r * k); e.rotation.y = -a; e.scale.z = .2 * (.3 + .7 * Math.abs(S(t * 2 + e.userData.a))); fade(e, .9 * end); }); return t < life; } };
}
/** Still Stone: the dark stone lies on the ground; when something steps near it a pale blue ring of frost snaps out 3 m and the bodies
 *  in it are held still for 20 s, a slow frost ring breathing round them. */
export function stillStone(r = 3, armT = 1.5, life = 20): Fx {
  const obj = new THREE.Group(), stone = new THREE.Mesh(new THREE.BoxGeometry(.25, .25, .25), new THREE.MeshBasicMaterial({ color: '#1a1030' })), glint = new THREE.Mesh(FXG.ring, add('#3fe0d0', .8));
  stone.position.y = .13; stone.rotation.set(.6, .6, .3); glint.rotation.x = -Math.PI / 2; glint.position.y = .05; glint.scale.set(.3, .3, 2); obj.add(stone, glint);
  const frost = new THREE.Mesh(FXG.disc, add('#bfe8ff', .25)), rim = new THREE.Mesh(FXG.ring, add('#e8f8ff', .9)); frost.rotation.x = rim.rotation.x = -Math.PI / 2; frost.position.y = .06; rim.position.y = .08; obj.add(frost, rim);
  const spikes = Array.from({ length: 10 }, (_, i) => { const m = new THREE.Mesh(FXG.shard, add('#d8f2ff', .8)); m.userData.a = i * 2.4; m.userData.d = .4 + (i * .37) % 1 * .55; obj.add(m); return m; });
  return { obj, tick: t => {
    const on = t > armT, k = on ? ease(Math.min(1, (t - armT) / .25)) : 0, end = Math.min(1, armT + life - t);
    fade(glint, on ? 0 : .5 + .4 * S(t * 4)); frost.visible = rim.visible = on; frost.scale.set(r * k, r * k, 1); rim.scale.set(r * k * (1 + .02 * S(t * 2)), r * k, 3); fade(frost, .25 * end); fade(rim, .9 * end);
    spikes.forEach(m => { m.visible = on; m.position.set(Math.cos(m.userData.a) * r * k * m.userData.d, .25 * k, Math.sin(m.userData.a) * r * k * m.userData.d); m.scale.set(.08, .45 * k, .08); fade(m, .8 * end); });
    return t < armT + life;
  } };
}
/** Shard Launch: a Shard leaves the Lyre's strings with a bright twang: a teal streak and a small ring where it left. */
export function shardLaunch(dir = new THREE.Vector3(0, .3, 1), len = 5, life = .6): Fx {
  const obj = new THREE.Group(), streak = new THREE.Mesh(FXG.line, add('#9ffff0', .9)), ring = new THREE.Mesh(FXG.ring, add('#ffffff', .9)), d = dir.clone().normalize();
  streak.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d); ring.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), d); obj.add(streak, ring);
  return { obj, tick: t => { const k = Math.min(1, t / life); streak.scale.set(.04 * (1 - k), len * ease(k), .04 * (1 - k)); streak.position.copy(d).multiplyScalar(len * ease(k) / 2); ring.scale.setScalar(.2 + k * .8); fade(ring, 1 - k); fade(streak, 1 - k * .7); return t < life; } };
}
/** Gather: the Cantus calls a group to it. A wide gold circle closes in toward it while gold motes stream in from the edge. */
export function gather(r = 12, life = 2.5): Fx {
  const obj = new THREE.Group(), edge = new THREE.Mesh(FXG.ring, add('#ffd35a', .9)); edge.rotation.x = -Math.PI / 2; edge.position.y = .08; obj.add(edge);
  const motes = Array.from({ length: 24 }, (_, i) => { const m = new THREE.Mesh(FXG.sph, add('#fff0a8', 1)); m.scale.setScalar(.09); m.userData.a = i * 2.39996; m.userData.o = (i * .41) % 1; obj.add(m); return m; });
  return { obj, tick: t => { const k = Math.min(1, t / life); edge.scale.set(r * (1 - ease(k) * .85), r * (1 - ease(k) * .85), 4); fade(edge, 1 - k * .8); motes.forEach(m => { const q = (k * 1.6 + m.userData.o) % 1, d = r * (1 - q); m.position.set(Math.cos(m.userData.a) * d, .4 + q * 2.5, Math.sin(m.userData.a) * d); fade(m, S(q * Math.PI)); }); return t < life; } };
}
/** Hold Time: a pale clock face laid on the ground (a ring with twelve marks and a hand that crawls backwards), everything in it slowed. */
export function holdTime(r = 4, life = 10): Fx {
  const obj = new THREE.Group(), face = new THREE.Mesh(FXG.disc, add('#cfd8ff', .14)), rim = new THREE.Mesh(FXG.ring, add('#e8eeff', .9)), hand = new THREE.Mesh(FXG.plane, add('#ffd35a', .9));
  face.rotation.x = rim.rotation.x = hand.rotation.x = -Math.PI / 2; face.position.y = .05; rim.position.y = .07; hand.position.y = .08; face.scale.set(r, r, 1); rim.scale.set(r, r, 4); obj.add(face, rim);
  const pivot = new THREE.Group(); hand.scale.set(.12, r * .8, 1); hand.position.set(0, .08, -r * .4); pivot.add(hand); obj.add(pivot);
  const marks = Array.from({ length: 12 }, (_, i) => { const m = new THREE.Mesh(FXG.plane, add('#e8eeff', .9)); const a = i / 12 * Math.PI * 2; m.rotation.set(-Math.PI / 2, 0, -a); m.position.set(Math.sin(a) * r * .88, .08, -Math.cos(a) * r * .88); m.scale.set(.08, i % 3 ? .3 : .6, 1); obj.add(m); return m; });
  return { obj, tick: t => { const end = Math.min(1, t * 3, life - t); pivot.rotation.y = t * .25; fade(face, .14 * end); fade(rim, .9 * end); fade(hand, .9 * end); marks.forEach(m => fade(m, .9 * end)); return t < life; } };
}
/** Quicken: the Choir Stone pours energy into a body: a teal spiral climbing round it and a bright flash at its head. */
export function quicken(h = 2.4, life = 1.2): Fx {
  const obj = new THREE.Group(), motes = Array.from({ length: 16 }, (_, i) => { const m = new THREE.Mesh(FXG.sph, add('#3fe0d0', 1)); m.scale.setScalar(.08); m.userData.o = i / 16; obj.add(m); return m; }), flash = new THREE.Mesh(FXG.sph, add('#e8fffb', .9));
  flash.position.y = h; obj.add(flash);
  return { obj, tick: t => { const k = t / life; motes.forEach(m => { const q = Math.min(1, k * 1.4 - m.userData.o * .4); m.visible = q > 0 && q < 1; const a = q * 12 + m.userData.o * 6.28; m.position.set(Math.cos(a) * .7 * (1 - q * .5), q * h, Math.sin(a) * .7 * (1 - q * .5)); }); const f = Math.max(0, (k - .7) / .3); flash.scale.setScalar(.1 + f * .8); fade(flash, f > 0 ? 1 - f : 0); return t < life; } };
}
/** Far Singing: a body sung in at a far field. A column of light, a ring opening on the ground, the body drawn up out of the light. */
export function farSinging(h = 6, life = 2): Fx {
  const obj = new THREE.Group(), col = new THREE.Mesh(FXG.line, add('#b8fff4', .5)), ring = new THREE.Mesh(FXG.ring, add('#ff4fd0', .9)), ring2 = new THREE.Mesh(FXG.ring, add('#3fe0d0', .9));
  ring.rotation.x = ring2.rotation.x = -Math.PI / 2; ring.position.y = .07; ring2.position.y = .07; col.position.y = h / 2; obj.add(col, ring, ring2);
  return { obj, tick: t => { const k = Math.min(1, t / life), w = S(k * Math.PI); col.scale.set(1.1 * w, h, 1.1 * w); fade(col, .5 * w); ring.scale.set(.4 + ease(k) * 2, .4 + ease(k) * 2, 3); fade(ring, 1 - k); ring2.scale.set(1.6 * w, 1.6 * w, 3); fade(ring2, w); return t < life; } };
}
/** Rush: the Cantor closes the gap. Three teal after-images streak behind it along the path, and a white ring bursts where it lands. */
export function rush(dist = 7, life = .7): Fx {
  const obj = new THREE.Group(), trail = [0, 1, 2].map(i => { const m = new THREE.Mesh(FXG.plane, add('#3fe0d0', .6)); m.position.y = 1.2; m.userData.o = i * .12; obj.add(m); return m; }), hit = new THREE.Mesh(FXG.ring, add('#ffffff', 1));
  hit.position.set(0, 1.2, dist); obj.add(hit);
  return { obj, tick: t => { const k = Math.min(1, t / (life * .5)); trail.forEach(m => { const q = Math.max(0, k - m.userData.o); m.position.z = dist * q; m.scale.set(.9, 2.2, 1); fade(m, .6 * (1 - q) * (k < 1 ? 1 : Math.max(0, 1 - (t - life * .5) * 4))); }); const b = Math.max(0, (t - life * .45) / (life * .55)); hit.visible = b > 0; hit.scale.setScalar(.3 + b * 1.6); fade(hit, 1 - b); return t < life; } };
}
/** Skip: the Lancer blinks 8 m. A violet flash folds shut where it was and opens where it lands, a thin line between for an instant. */
export function skip(dist = 8, life = .5): Fx {
  const obj = new THREE.Group(), a = new THREE.Mesh(FXG.sph, add('#b48cff', .9)), b = new THREE.Mesh(FXG.sph, add('#e8e0ff', .9)), line = new THREE.Mesh(FXG.line, add('#d9c4ff', .7));
  a.position.y = b.position.y = 1.2; b.position.z = dist; line.rotation.x = Math.PI / 2; line.position.set(0, 1.2, dist / 2); obj.add(a, b, line);
  return { obj, tick: t => { const k = t / life; a.scale.set(.6 * (1 - k), 1.4 * (1 - k), .6 * (1 - k)); b.scale.set(.6 * S(k * Math.PI), 1.4 * S(k * Math.PI), .6 * S(k * Math.PI)); line.scale.set(.02, dist, .02); fade(line, k < .3 ? .7 : 0); return t < life; } };
}
/** Every sketched effect, by ability name, for the bench. */
export const FX_NAMES = ['rush', 'skip', 'glassWall', 'wardHum', 'falseVoice', 'stepThrough', 'shatterNote', 'drain', 'join', 'ringShell', 'toll', 'settle', 'unfold', 'lift', 'burnBright', 'shrill', 'reveal', 'stillStone', 'songField', 'shardLaunch', 'gather', 'holdTime', 'quicken', 'farSinging'] as const;

// ------------------------------------------------------------------------------------------------------------------- first person
// What a player sees driving one of these bodies: its own sculpted arms (and what they hold) copied out of the figure and hung in
// front of the camera, coming up from the bottom of the screen. Camera space is x right, y up, -z ahead. Each arm is copied about its
// shoulder pivot and mirrored front to back (so the figure's forward is the camera's). Then it is turned so the line from shoulder to
// its far end points along `dir`, rolled `roll` about that line, sized by `s`, and its shoulder set at `at` (then moved up .24 and out .32).
interface ArmVM { g: string; at: [number, number, number]; dir: [number, number, number]; roll?: number; s?: number }
const L_ = (x: number, y: number, z: number): [number, number, number] => [x, y, z];
export const VM: Record<string, Record<string, ArmVM[]>> = {
  // the pane in the left hand at the lower left, the ward shard claw at the lower right; 'pane' lifts the glass up across the view
  tuner: {
    hands: [{ g: 'armL', at: L_(-.42, -.6, .05), dir: L_(.2, .45, -1), roll: .3, s: .55 }, { g: 'armR', at: L_(.4, -.62, .05), dir: L_(-.5, .5, -1), roll: -.9, s: .55 }],
    pane: [{ g: 'armL', at: L_(-.36, -.5, 0), dir: L_(.55, .8, -1), roll: -.7, s: .55 }, { g: 'armR', at: L_(.42, -.64, .05), dir: L_(-.45, .4, -1), roll: -.9, s: .55 }],
  },
  // the hooked blades held up and forward like a mantis's; 'step' crosses them ahead, ready to cut on arrival
  mute: {
    hands: [{ g: 'armL', at: L_(-.34, -.56, .05), dir: L_(.3, .7, -1), roll: .4, s: .5 }, { g: 'armR', at: L_(.34, -.56, .05), dir: L_(-.3, .7, -1), roll: -.4, s: .5 }],
    step: [{ g: 'armL', at: L_(-.38, -.55, 0), dir: L_(.6, .5, -1), roll: 1.2, s: .5 }, { g: 'armR', at: L_(.38, -.55, 0), dir: L_(-.6, .5, -1), roll: -1.2, s: .5 }],
  },
  // the open left hand and the baton in the right; 'cast' throws both up as the note is sung
  choirmaster: {
    hands: [{ g: 'armL', at: L_(-.36, -.55, .05), dir: L_(.2, .55, -1), roll: .3, s: .5 }, { g: 'armR', at: L_(.36, -.55, .05), dir: L_(-.2, .6, -1), roll: -.3, s: .5 }],
    cast: [{ g: 'armL', at: L_(-.44, -.5, 0), dir: L_(-.1, 1.1, -1), roll: .2, s: .5 }, { g: 'armR', at: L_(.44, -.5, 0), dir: L_(.1, 1.2, -1), roll: -.2, s: .5 }],
  },
  // four arms: the near pair as the Choirmaster's, the other voice's pair further out and lower, all moving as one
  chord: {
    hands: [{ g: 'armL', at: L_(-.3, -.52, .05), dir: L_(.2, .6, -1), roll: .3, s: .45 }, { g: 'armR', at: L_(.3, -.52, .05), dir: L_(-.2, .6, -1), roll: -.3, s: .45 },
      { g: 'armLB', at: L_(-.46, -.56, .05), dir: L_(.15, .7, -1), roll: .5, s: .45 }, { g: 'armRB', at: L_(.46, -.56, .05), dir: L_(-.15, .7, -1), roll: -.5, s: .45 }],
    cast: [{ g: 'armL', at: L_(-.34, -.5, 0), dir: L_(-.05, 1.1, -1), roll: .2, s: .45 }, { g: 'armR', at: L_(.34, -.5, 0), dir: L_(.05, 1.1, -1), roll: -.2, s: .45 },
      { g: 'armLB', at: L_(-.6, -.56, 0), dir: L_(-.15, .9, -1), roll: .4, s: .45 }, { g: 'armRB', at: L_(.6, -.56, 0), dir: L_(.15, .9, -1), roll: -.4, s: .45 }],
  },
  // the two clapper fists, low and heavy; 'ringshell' throws them up and out as the shell goes up
  bell: {
    hands: [{ g: 'armL', at: L_(-.4, -.62, .05), dir: L_(.25, .35, -1), roll: .2, s: .45 }, { g: 'armR', at: L_(.4, -.62, .05), dir: L_(-.25, .35, -1), roll: -.2, s: .45 }],
    ringshell: [{ g: 'armL', at: L_(-.5, -.55, 0), dir: L_(-.5, 1, -.6), roll: .2, s: .45 }, { g: 'armR', at: L_(.5, -.55, 0), dir: L_(.5, 1, -.6), roll: -.2, s: .45 }],
  },
  // both hands under the orb, held low in the middle; 'toll' heaves it out ahead
  knell: {
    hands: [{ g: 'armL', at: L_(-.42, -.62, .05), dir: L_(.3, .2, -1), roll: .2, s: .5 }, { g: 'armR', at: L_(.42, -.62, .05), dir: L_(-.3, .2, -1), roll: -.2, s: .5 }, { g: 'orb', at: L_(0, -.62, -.25), dir: L_(0, 0, -1), s: .5 }],
    toll: [{ g: 'armL', at: L_(-.42, -.55, 0), dir: L_(.25, .1, -1), roll: .2, s: .5 }, { g: 'armR', at: L_(.42, -.55, 0), dir: L_(-.25, .1, -1), roll: -.2, s: .5 }, { g: 'orb', at: L_(0, -.6, -.75), dir: L_(0, 0, -1), s: .5 }],
  },
  // from the lantern: the two front reed legs going down past either side of the view to the ground far below
  reedwalker: { legs: [{ g: 'legL', at: L_(-0.42, -0.42, -0.1), dir: L_(-0.2, -0.7, -1), s: 0.22 }, { g: 'legR', at: L_(0.42, -0.42, -0.1), dir: L_(0.2, -0.7, -1), s: 0.22 }] },
  // the glass wings beating at the edges of the view
  listener: { wings: [{ g: 'wingL', at: L_(-0.3, -0.42, 0), dir: L_(-0.6, -0.1, -1), s: 0.45 }, { g: 'wingR', at: L_(0.3, -0.42, 0), dir: L_(0.6, -0.1, -1), s: 0.45 }] },
  swift: { wings: [{ g: 'wingL', at: L_(-0.26, -0.5, 0), dir: L_(-0.7, -0.15, -1), s: 0.55 }, { g: 'wingR', at: L_(0.26, -0.5, 0), dir: L_(0.7, -0.15, -1), s: 0.55 }] },
  prism: { sails: [{ g: 'wingL', at: L_(-0.3, -0.45, 0), dir: L_(-0.6, -0.3, -1), s: 0.4 }, { g: 'wingR', at: L_(0.3, -0.45, 0), dir: L_(0.6, -0.3, -1), s: 0.4 }] },
  // the front pair of leaves, hanging down either side of the prow
  ferry: { leaves: [{ g: 'leaf0', at: L_(-0.3, -0.38, -0.1), dir: L_(-0.3, -0.7, -1), s: 0.45 }, { g: 'leaf1', at: L_(0.3, -0.38, -0.1), dir: L_(0.3, -0.7, -1), s: 0.45 }] },
  // the dark stone held between both hands; 'still' lets it drop
  omen: {
    hands: [{ g: 'armL', at: L_(-.4, -.6, .05), dir: L_(.35, .2, -1), roll: .2, s: .55 }, { g: 'armR', at: L_(.4, -.6, .05), dir: L_(-.35, .2, -1), roll: -.2, s: .55 }, { g: 'orb', at: L_(0, -.48, -.45), dir: L_(0, 0, -1), s: .6 }],
    still: [{ g: 'armL', at: L_(-.4, -.6, .05), dir: L_(.3, -.1, -1), roll: .2, s: .55 }, { g: 'armR', at: L_(.4, -.6, .05), dir: L_(-.3, -.1, -1), roll: -.2, s: .55 }, { g: 'orb', at: L_(0, -.85, -.6), dir: L_(0, 0, -1), s: .6 }],
  },
  // from the figurehead: the two broad fins standing off either side of the view
  lyre: { fins: [{ g: 'wingL', at: L_(-0.35, -0.5, 0), dir: L_(-0.6, -0.2, -1), s: 0.3 }, { g: 'wingR', at: L_(0.35, -0.5, 0), dir: L_(0.6, -0.2, -1), s: 0.3 }] },
  shard: { fins: [{ g: 'wingL', at: L_(-0.22, -0.36, 0), dir: L_(-0.45, -0.2, -1), s: 1.4 }, { g: 'wingR', at: L_(0.22, -0.36, 0), dir: L_(0.45, -0.2, -1), s: 1.4 }] },
  // the great raised hands, far apart; 'holdtime' brings the right one up flat ahead
  cantus: {
    hands: [{ g: 'armL', at: L_(-.6, -.62, .05), dir: L_(.1, .7, -1), roll: .3, s: .3 }, { g: 'armR', at: L_(.6, -.62, .05), dir: L_(-.1, .7, -1), roll: -.3, s: .3 }],
    holdtime: [{ g: 'armL', at: L_(-.6, -.7, .05), dir: L_(.1, .2, -1), roll: .3, s: .3 }, { g: 'armR', at: L_(.45, -.55, 0), dir: L_(-.35, .55, -1), roll: -1.2, s: .3 }],
  },
};

/** A first person view model for a new Veyl body in one of its modes (see VM), or null when the page has no sculpt or the kind has none.
 *  Add it to the camera. Built fresh each call (it shares the figure's geometry and painted skin, so it is cheap). */
export function viewModel(kind: string, mode = 'hands'): THREE.Group | null {
  const set = VM[kind]?.[mode] || Object.values(VM[kind] || {})[0]; if (!set) return null;
  const fig = figure(kind); if (!fig) return null;
  fig.root.updateMatrixWorld(true);
  const out = new THREE.Group(); out.name = 'vm:' + kind + ':' + mode;
  for (const a of set) {
    const g = fig.groups[a.g]; if (!g) continue;
    // the arm's meshes in its own (shoulder) space, front to back mirrored
    const inv = g.matrixWorld.clone().invert(), flip = new THREE.Group(); flip.scale.set(1, 1, -1);
    g.traverse(o => { const m = o as THREE.Mesh; if (!m.isMesh || !m.visible) return; const c = m.clone(); new THREE.Matrix4().multiplyMatrices(inv, m.matrixWorld).decompose(c.position, c.quaternion, c.scale); flip.add(c); });
    // its far end: the point of it furthest from the shoulder
    flip.updateMatrixWorld(true); const tip = new THREE.Vector3(), v = new THREE.Vector3(); let best = 0;
    flip.traverse(o => { const m = o as THREE.Mesh; if (!m.isMesh) return; const pos = m.geometry.getAttribute('position'); for (let i = 0; i < pos.count; i += 7) { v.fromBufferAttribute(pos, i).applyMatrix4(m.matrixWorld); const d = v.lengthSq(); if (d > best) { best = d; tip.copy(v); } } });
    const want = new THREE.Vector3(...a.dir).normalize(), arm = new THREE.Group(); arm.name = a.g;
    arm.quaternion.setFromUnitVectors(tip.clone().normalize(), want).premultiply(new THREE.Quaternion().setFromAxisAngle(want, a.roll || 0));
    arm.position.set(a.at[0], a.at[1] + .24, a.at[2] - .32); arm.scale.setScalar(a.s || 1); arm.add(flip); out.add(arm);
  }
  out.userData.kind = kind; out.userData.mode = mode; return out;
}

// ------------------------------------------------------------------------------------------------- song fields and silent buildings
// The Veyl's buildings only work inside a song field. A field is drawn on the ground as a soft teal pool with a bright rim, slow rings
// running out from its middle and motes rising off it, so from first person you see where it ends and from above it reads as a lit
// circle. A building outside any field goes silent: it is drawn ashen (a grey-violet wash multiplied over its own paint), its lit parts
// dim, its floating rings sink to rest, and a broken grey ring hangs over it, so it reads as "not working" at a glance from any zoom.
/** A song field `r` metres across its radius. tick(t) runs it; it never ends by itself (remove it when the field goes). */
export function songField(r = 6.5): Fx {
  const obj = new THREE.Group(), pool = new THREE.Mesh(FXG.disc, add('#3fe0d0', .1)), rim = new THREE.Mesh(FXG.ring, add('#b8fff4', .75)), rim2 = new THREE.Mesh(FXG.ring, add('#ff4fd0', .35));
  for (const m of [pool, rim, rim2]) { m.rotation.x = -Math.PI / 2; obj.add(m); }
  pool.position.y = .04; rim.position.y = .06; rim2.position.y = .05; pool.scale.set(r, r, 1); rim.scale.set(r, r, 4); rim2.scale.set(r * .97, r * .97, 2);
  const waves = [0, 1, 2].map(() => { const m = new THREE.Mesh(FXG.ring, add('#3fe0d0', .5)); m.rotation.x = -Math.PI / 2; m.position.y = .05; obj.add(m); return m; });
  const motes = Array.from({ length: 18 }, (_, i) => { const m = new THREE.Mesh(FXG.sph, add(i % 3 ? '#9ffff0' : '#ff8ae6', .9)); m.scale.setScalar(.05); m.userData.a = i * 2.39996; m.userData.d = Math.sqrt(((i * .618) % 1)) * r * .95; m.userData.o = (i * .37) % 1; obj.add(m); return m; });
  return { obj, tick: t => {
    fade(pool, .09 + .03 * S(t * .8)); fade(rim, .6 + .15 * S(t * 1.7));
    waves.forEach((m, i) => { const q = (t * .12 + i / 3) % 1; m.scale.set(r * q, r * q, 2); fade(m, .45 * (1 - q) * Math.min(1, q * 6)); });
    motes.forEach(m => { const q = (t * .25 + m.userData.o) % 1; m.position.set(Math.cos(m.userData.a) * m.userData.d, q * 2.2, Math.sin(m.userData.a) * m.userData.d); fade(m, .9 * S(q * Math.PI)); });
    return true;
  } };
}
/** Draws a building silent (on) or sung again (off). Silent: every part is drawn in grey ash (the game's own toon soot, so it is inked and lit
 *  like everything else), the lit parts gone dark, and a broken grey ring hangs over the roof. `top` is the building's height.
 *  Safe to call every frame: it only changes on a change. The materials it wore are kept on each mesh and put back when sung again. */
export function silentLook(root: THREE.Object3D, on: boolean, top = 6) {
  if (!!root.userData.silent === on) return; root.userData.silent = on;
  if (on) {
    root.traverse(o => { const m = o as THREE.Mesh; if (!m.isMesh || m.userData.ash) return; m.userData.loudMat = m.material; const glow = /flux|water|clapper|mouth|window|lantern|tablet|lens|note|drop|crystal|crown|eye|cap|perch|tip|heart|orb|pts|halo|ring/.test(m.name); m.material = glow ? M.scorch : M.soot; });
    const ring = new THREE.Mesh(new THREE.TorusGeometry(1.2, .08, 6, 28, Math.PI * 1.55), M.soot); ring.rotation.set(Math.PI / 2 + .35, 0, .8); ring.position.y = top * .85; ring.userData.ash = true; root.add(ring); root.userData.ashRing = ring;
  } else {
    root.traverse(o => { const m = o as THREE.Mesh; if (m.isMesh && m.userData.loudMat) { m.material = m.userData.loudMat; delete m.userData.loudMat; } });
    (root.userData.ashRing as THREE.Object3D | undefined)?.removeFromParent(); root.userData.ashRing = null;
  }
}
/** The new Veyl buildings (art/halls.py), each a sculpt with its own groups: rings, a bell, a drop, a note, a lens, pages. */
export const VEYL_HALLS = ['siphonbell', 'mendingpool', 'duskhall', 'kiln', 'skyloft', 'tuningfork', 'quiethouse', 'songarchive', 'highbeacon'] as const;
/** Where the HUD's portrait camera looks for each new kind (see portraits() in main.ts): the height it aims at and how far back it
 *  stands, in metres, with the figure turned half a radian to its left as the old portraits are. */
export const PORTRAIT: Record<string, { y: number; dist: number }> = {
  tuner: { y: 2.3, dist: 3.4 }, mute: { y: 1.9, dist: 2.8 }, choirmaster: { y: 2.6, dist: 4.2 }, chord: { y: 2.6, dist: 6 }, bell: { y: 2.4, dist: 5.2 },
  reedwalker: { y: 5.1, dist: 5.4 }, knell: { y: 2.0, dist: 3.8 }, listener: { y: 1.4, dist: 3.6 }, ferry: { y: 2.2, dist: 7 }, swift: { y: 1.7, dist: 3.4 },
  prism: { y: 2.4, dist: 6.5 }, omen: { y: 2.3, dist: 4.4 }, lyre: { y: 3.4, dist: 11 }, shard: { y: 1.2, dist: 2.4 }, cantus: { y: 5.8, dist: 9 },
};
