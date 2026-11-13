// How the new Veyl bodies look and move (stream F of the full-depth plan). Stream A will move this into src/factions/veyl/look/.
//
// Everything here is for show: it never reads the seeded dice, never changes a number the match server keeps, and does nothing when the
// page carries no meshes (the match server, tests). The sculpts are made in art/chorus.py (and the files after it); each comes with the named
// groups hitfx.ts and stance.ts work through (body, head, armL, armR, halo) plus its own (orb, bodyB, headB ... for the Chord).
import * as THREE from 'three';
import { figure } from '../../../meshes';
import { M } from '../../../gfx';

/** The Veyl figures this file dresses, in the plan's roster order. A kind is drawn from its sculpt when the page carries one. */
export const VEYL_NEW = ['tuner', 'mute', 'choirmaster', 'chord', 'bell', 'reedwalker', 'knell', 'listener'] as const;
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
  const y = kind === 'choirmaster' ? 1.4 : kind === 'mute' ? 1.05 : 1.2;
  r = torso(root, y, 1);
  const halo = group('halo', r.body!, [0, y + 1.0, -.3]); part(halo, geo.ring, kind === 'mute' ? 'vD' : 'teal', [0, 0, 0], [.32, .32, .32]);
  if (kind === 'tuner') { part(r.head!, geo.cyl, 'vC', [-.1, .55, 0], [.02, .5, .02]); part(r.head!, geo.cyl, 'vC', [.1, .55, 0], [.02, .5, .02]); part(r.armL!, geo.box, 'vC', [-.1, -.35, .45], [.34, .54, .02]); }
  if (kind === 'mute') for (const a of [r.armL!, r.armR!]) part(a, geo.cone, 'vC', [0, -.2, .6], [.04, .8, .01], [Math.PI / 2, 0, 0]);
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
/** Every sketched effect, by ability name, for the bench. */
export const FX_NAMES = ['glassWall', 'wardHum', 'falseVoice', 'stepThrough', 'shatterNote', 'drain', 'join', 'ringShell', 'toll', 'settle'] as const;
