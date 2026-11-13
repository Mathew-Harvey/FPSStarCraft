// How the new Veyl bodies look and move (stream F of the full-depth plan). Stream A will move this into src/factions/veyl/look/.
//
// Everything here is for show: it never reads the seeded dice, never changes a number the match server keeps, and does nothing when the
// page carries no meshes (the match server, tests). The sculpts are made in art/chorus.py (and the files after it); each comes with the named
// groups hitfx.ts and stance.ts work through (body, head, armL, armR, halo) plus its own (orb, bodyB, headB ... for the Chord).
import * as THREE from 'three';
import { figure } from './meshes';

/** The Veyl figures this file dresses, in the plan's roster order. A kind is drawn from its sculpt when the page carries one. */
export const VEYL_NEW = ['tuner', 'mute', 'choirmaster', 'chord'] as const;
export type VKind = typeof VEYL_NEW[number];

export type Rig = Record<string, THREE.Object3D | undefined>;
export interface Look { kind: string; root: THREE.Group; rig: Rig; points: Record<string, { group: THREE.Group; at: [number, number, number] }> }

/** Builds a new Veyl body from its sculpt, or null when this page has none (then the caller uses its own stand-in). */
export function veylLook(kind: string): Look | null {
  const fig = figure(kind); if (!fig) return null;
  const look: Look = { kind, root: fig.root, rig: fig.groups, points: fig.points };
  fig.root.userData.look = look;
  return look;
}

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
