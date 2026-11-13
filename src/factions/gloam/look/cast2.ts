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

export const GLOAM_UNITS2: Record<string, () => THREE.Group> = { keeper, shellback, lobber, needler };
/** Height of the top of each body in metres, for health bars, picking and the camera. */
export const GLOAM_HEIGHT2: Record<string, number> = { keeper: 2.6, shellback: 1.15, lobber: 3.0, needler: 2.0 };
/** How far below the ground a body sits when dug in (metres), and how wide its mound is. What shows above ground is what is left. */
export const DIG: Record<string, { sink: number; mound: number }> = {
  grazer: { sink: 1.1, mound: .9 }, snapper: { sink: 1.0, mound: .8 }, quillback: { sink: 2.1, mound: 1.1 }, blister: { sink: .55, mound: .7 }, mulcher: { sink: 2.6, mound: 2.6 },
  keeper: { sink: 2.7, mound: 1.2 }, shellback: { sink: .55, mound: 1.1 }, lobber: { sink: 1.1, mound: 1.9 }, needler: { sink: 1.0, mound: 1.8 },
};
export type { P3 };

// ---------------------------------------------------------------- poses laid over the game's own
/** Offsets laid on a body after the game has posed it and taken off again before the next frame, the way stance.ts and hitfx.ts do it,
 *  so the walk code (which eases toward its targets) never sees them. One per game; call pre() before posing and the pose functions after. */
export class Overlay {
  private tg: any[] = []; private ax: string[] = []; private val: number[] = []; private n = 0;
  pre() { for (let i = 0; i < this.n; i++) this.tg[i][this.ax[i]] -= this.val[i]; this.n = 0; }
  add(o: any, a: string, v: number) { if (!o || !v) return; o[a] += v; this.tg[this.n] = o; this.ax[this.n] = a; this.val[this.n++] = v; }
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
const UNDER = new Set(['grazer', 'snapper', 'blister', 'keeper']);
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
    case 'shellback:curl':    // tucks the head in under the brow and pulls the legs close (heals faster)
      L.add(head?.position, 'z', -.18 * up); L.add(head?.rotation, 'x', .4 * up); for (const l of legs) L.add(l.rotation, 'z', (l.name[3] === 'L' ? -1 : 1) * .7 * up); L.add(obj.position, 'y', -.2 * up); break;
  }
}
/** The ability names actPose knows for each kind, for the HUD and for tests. */
export const ACTS: Record<string, string[]> = { keeper: ['mend', 'seed', 'pod', 'spit'], shellback: ['spit', 'curl'], lobber: ['lob', 'bite'], needler: ['fire'] };

// For the capture bench and the art review pages: the look functions on the page, so a staged shot can dig a body in or pose an ability.
if (typeof window !== 'undefined') (window as any).__gloamLook = { Overlay, digPose, digMound, mound, actPose, ACTS, DIG };
