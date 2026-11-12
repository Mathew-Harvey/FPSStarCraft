// The cast. Every figure is sculpted from turned, swept and pressed forms and dressed in the
// hand-inked skins, then merged so a whole limb is one draw call.
import * as THREE from 'three';
import { G, M, R, mk, setLayer, L_FX } from './gfx';
import { lathe, hard, spl, capsule, rbox, blob, nub, tube, plate, rrect, ring, shard, warp, crescent } from './sculpt';
import './skins';
import { figure } from './meshes';

type P3 = [number, number, number];
type Mat = THREE.Material;
const PI = Math.PI, H = PI / 2, TAU = PI * 2;
export const grp = (name: string, parent: THREE.Object3D, p?: P3) => { const g = new THREE.Group(); g.name = name; if (p) g.position.set(p[0], p[1], p[2]); parent.add(g); return g; };
const lerp = (a: P3, b: P3, t: number): P3 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
/** A turned can along +y with a chamfered lip at each end. */
export const can = (r: number, h: number, lip = .014) => lathe(hard([[0, -h / 2], [r - lip, -h / 2], [r, -h / 2 + lip], [r, h / 2 - lip], [r - lip, h / 2], [0, h / 2]]), 16);
/** Sculpted part with no extra transform. */
/** The unframed cut of a skin, for balls and domes where a border would bunch up at the pole. */
export const nv = (m: Mat): Mat => { for (const k in M) if (M[k] === m) { const n = /^[bpc][YOWRSD]$/.test(k) ? 'n' + k[1] : k === 'lea' || k === 'leaB' ? 'leaN' : k === 'glove' ? 'gloveN' : k; return M[n] || m; } return m; };
export const put = (geo: THREE.BufferGeometry, mat: Mat, parent: THREE.Object3D, p: P3 | 0 = 0, r: P3 | 0 = 0, s: P3 | 0 = 0) => mk(geo, mat, p, s, r, parent);

export function muzzle(parent: THREE.Object3D, p: P3, s: number) {
  const f = grp('flash', parent, p); for (let i = 0; i < 3; i++) mk(G.cone4, M.flash, [0, 0, .25 * s], [.34 * s, .7 * s, .06 * s], [H, 0, i * PI / 3], f); mk(G.sph, M.flash, [0, 0, .05 * s], [.3 * s, .3 * s, .3 * s], 0, f);
  f.visible = false; setLayer(f, L_FX); return f;
}

const q3 = (n: number) => Math.round(n * 1000) / 1000;
/** A crease in cloth: a thin welt part of the way round a limb, so the ink pass draws it as a pen line. `a` is the angle of its middle (0 is the front), `w` its half width, `drop` how far its ends sag. */
function fold(parent: THREE.Object3D, mat: Mat, c: P3, r: number, a: number, w: number, drop = 0, t = .013) {
  const pts: P3[] = []; for (let i = 0; i <= 4; i++) { const k = i / 4 - .5, an = a + k * 2 * w; pts.push([q3(c[0] + Math.sin(an) * r), q3(c[1] + drop * (k * k * 4 - .5)), q3(c[2] + Math.cos(an) * r)]); }
  put(tube(pts, [t * .3, t, t * 1.1, t, t * .3], -4, 1, false, 4), mat, parent);
}
const AX = new THREE.Vector3(), AY = new THREE.Vector3(), AZ = new THREE.Vector3(), FM = new THREE.Matrix4(), LM = new THREE.Matrix4(), EU = new THREE.Euler(), QQ = new THREE.Quaternion(), ONE = new THREE.Vector3(1, 1, 1), PV = new THREE.Vector3();
/** Places a part inside a frame that looks down `dir` from `at`, without adding a group (a group would cost a draw call per material). */
function inFrame(at: P3, dir: P3, up: P3 = [0, 1, 0]) {
  AZ.set(dir[0], dir[1], dir[2]).normalize(); AX.set(up[0], up[1], up[2]).cross(AZ); if (AX.lengthSq() < 1e-4) AX.set(1, 0, 0).cross(AZ); AX.normalize(); AY.crossVectors(AZ, AX);
  const base = new THREE.Matrix4().makeBasis(AX, AY, AZ).setPosition(at[0], at[1], at[2]);
  return (geo: THREE.BufferGeometry, mat: Mat, parent: THREE.Object3D, p: P3 | 0 = 0, r: P3 | 0 = 0) => {
    const m = new THREE.Mesh(geo, mat); LM.compose(p ? PV.set(p[0], p[1], p[2]) : PV.set(0, 0, 0), r ? QQ.setFromEuler(EU.set(r[0], r[1], r[2])) : QQ.identity(), ONE); FM.multiplyMatrices(base, LM); FM.decompose(m.position, m.quaternion, m.scale); parent.add(m); return m;
  };
}
/**
 * A gloved hand closed round a grip: the back of the hand, four fingers each with its own knuckle, and a thumb laid across them.
 * It looks down `dir` from the wrist and its fingers curl toward `curl`; `inner` (1 or -1) is the side the thumb is on.
 */
export function hand(parent: THREE.Object3D, at: P3, dir: P3, k: number, glove: Mat, inner = 1, curl: P3 = [0, -1, 0]) {
  const P = inFrame(at, dir, [-curl[0], -curl[1], -curl[2]]), g = nv(glove), s = (n: number) => q3(n * k);
  P(nub(s(.168), s(.118), s(.17), v => { if (v.z < 0) { v.x *= .82; v.y *= .86; } }, 'hand', 9, 6), g, parent, [0, s(.012), s(.055)]);
  for (let i = 0; i < 4; i++) { const fx = s(-.057 + i * .038), l = i === 0 || i === 3 ? .88 : 1;
    P(tube([[fx, s(.04), s(.105)], [fx, s(.035), s(.105 + .07 * l)], [fx, s(-.03), s(.12 + .075 * l)], [fx, s(-.07), s(.1 + .03 * l)]], [s(.027), s(.0245), s(.022), s(.0185)], -5, 1, false, 5), g, parent); }
  P(tube([[s(inner * .072), s(.0), s(.03)], [s(inner * .092), s(-.03), s(.1)], [s(inner * .05), s(-.068), s(.15)]], [s(.029), s(.027), s(.02)], -5, 1, false, 4), g, parent);
  P(tube([[s(-.085), s(.03), s(.01)], [0, s(.07), s(.012)], [s(.085), s(.03), s(.01)]], s(.012), -4, .6, false, 4), M.nD, parent);
}

/** Hip-to-sole leg. The group pivots at the hip. Trousers bag at the knee and blouse over the boot; the feet stand a little wider than the hips and turn out. */
function leg(parent: THREE.Object3D, name: string, sx: number, pants: Mat, knee: Mat, guard: Mat | null, boot: Mat) {
  const g = grp(name, parent, [sx * .155, .9, 0]), x = sx * .02, f = sx * .04, ty = sx * .16;
  put(tube([[0, .05, 0], [q3(x * .5), -.13, .034], [x, -.3, .03], [x, -.43, .02]], [.146, .158, .15, .118, .102]), pants, g);
  put(tube([[x, -.4, .02], [q3(x + (f - x) * .5), -.52, -.012], [f, -.63, -.008], [f, -.69, 0]], [.098, .116, .126, .14, .112]), pants, g);
  fold(g, pants, [x, -.305, .03], .138, sx * 1.0, .85, .03); fold(g, pants, [x, -.35, .028], .124, -sx * .6, .75, -.024); fold(g, pants, [q3(x * .5), -.1, .03], .152, sx * .5, .7, .034, .012);
  fold(g, pants, [f, -.585, -.01], .128, sx * .4, 1.0, .03); fold(g, pants, [f, -.625, -.008], .139, -sx * 1.2, .9, .022); fold(g, pants, [q3(x + (f - x) * .5), -.5, -.01], .112, PI, .9, .03);
  put(blob(.2, .2, .16, v => { v.z += v.y * v.y * .2; }, 'knee'), nv(knee), g, [x, -.42, .075]); put(blob(.07, .07, .05), M.nS, g, [x, -.42, .15]);
  put(tube([[q3(x - .1), -.45, -.03], [x, -.47, -.11], [q3(x + .1), -.45, -.03]], .018, -4, .5, false, 4), M.leaB, g);
  if (guard) put(lathe([...hard([[.1, -.75], [.114, -.745]]), ...spl([[.116, -.73], [.136, -.6], [.124, -.52], [.094, -.48]], 8)], 12, PI * 1.1), guard, g, [f, 0, .004]);
  put(rbox(.085, .15, .13, .028), M.lea, g, [sx * .155, -.2, 0], [0, 0, sx * -.07]); put(rbox(.095, .055, .14, .02), M.lea, g, [sx * .16, -.14, 0], [0, 0, sx * -.07]);
  put(tube([[f, -.66, 0], [f, -.8, .005]], [.104, .124]), boot, g); put(ring(.112, .024), M.rib, g, [f, -.672, 0], [H, 0, 0]);
  put(blob(.24, .19, .42, v => { if (v.y < -.14) v.y = -.14; if (v.z < 0) v.z *= .8; }, 'boot'), nv(boot), g, [f, -.805, .07], [0, ty, 0]);
  put(blob(.235, .16, .2, v => { if (v.y < -.2) v.y = -.2; }, 'toe'), M.nD, g, [q3(f + Math.sin(ty) * .13), -.8, .2], [0, ty, 0]);
  put(rbox(.26, .07, .46, .028), M.sole, g, [q3(f + Math.sin(ty) * .065), -.865, .065], [0, ty, 0]);
  for (const z of [.0, .09]) put(tube([[q3(f - .1), -.74, z], [f, -.7, q3(z + .11)], [q3(f + .1), -.74, z]], .012, -3, .6, false, 3), M.nD, g);
  return g;
}
/** Shoulder to glove: a sleeve that bunches at the elbow, an elbow cap, a bracer, a cuff and a hand with fingers. */
function arm(parent: THREE.Object3D, a: P3, b: P3, c: P3, r: number, sleeve: Mat, guard: Mat | null, glove: Mat, fore: Mat = sleeve, curl: P3 = [0, -1, 0]) {
  put(tube([a, lerp(a, b, .5), b], [r * 1.3, r * 1.26, r * 1.08, r * 1.0]), sleeve, parent);
  put(tube([b, lerp(b, c, .5), c], [r * .98, r * 1.1, r * .92, r * .78]), fore, parent);
  put(blob(r * 2.5, r * 2.5, r * 2.5), nv(guard || sleeve), parent, b);
  { const u = lerp(a, b, .72), v = lerp(a, b, .86), sgn = a[0] + b[0] < 0 ? -1 : 1; fold(parent, sleeve, [q3(u[0]), q3(u[1]), q3(u[2])], r * 1.12, sgn * 1.2, .9, .03, .011); fold(parent, sleeve, [q3(v[0]), q3(v[1]), q3(v[2])], r * 1.06, -sgn * .4, .9, -.022, .011); }
  if (guard) { put(tube([lerp(b, c, .28), lerp(b, c, .72)], [r * 1.34, r * 1.14]), guard, parent); put(tube([lerp(b, c, .74), lerp(b, c, .78)], r * 1.2), M.rib, parent); }
  put(tube([lerp(b, c, .8), lerp(b, c, .97)], [r * 1.22, r * 1.06]), glove, parent);
  const d: P3 = [c[0] - b[0], c[1] - b[1], c[2] - b[2]]; hand(parent, lerp(b, c, .98), d, r / .074, glove, a[0] + b[0] < 0 ? 1 : -1, curl);
}
/** A domed shoulder guard with a rolled lip. */
const pauldron = (r: number) => lathe([...hard([[r * .86, -r * .24], [r * 1.07, -r * .2], [r * 1.07, -r * .06]]), ...spl([[r * 1.02, -r * .04], [r * .96, r * .22], [r * .68, r * .5], [0, r * .66]], 9)], 18);

/** Ironhold infantry. The heavy version is the Breacher: bulkier, with a riot shield and a scattergun. */
function trooper(heavy: boolean, role = ''): THREE.Group {
  const long = role === 'long', patch = role === 'patch';
  // Sculpted in Blender (art/trooper.py); the plain figure below is what the match server builds, with the same joints.
  const fig = figure(heavy ? 'breacher' : long ? 'longshot' : patch ? 'patch' : 'linesman'); if (fig) { const mz = fig.points.muzzle; if (mz) muzzle(mz.group, mz.at, heavy ? 1.5 : long ? 1.2 : 1); return fig.root; }
  const obj = new THREE.Group(), body = grp('body', obj);
  const pl = heavy ? M.pO : patch ? M.pW : long ? M.pD : M.pY, bl = heavy ? M.bO : patch ? M.bW : long ? M.bD : M.bY;
  const hel = heavy ? M.helmO : patch ? M.helmR : long ? M.helmD : M.helm, pants = long ? M.fabG : M.fab, sleeve = pants;
  leg(obj, 'legL', -1, pants, bl, M.bD, M.leaB); leg(obj, 'legR', 1, pants, bl, M.bD, M.leaB);
  // Hips, belt and its clutter.
  put(blob(.44, .34, .34), pants, body, [0, .93, 0]);
  put(lathe(hard([[.2, -.05], [.228, -.034], [.228, .034], [.2, .05]]), 20, TAU, .78), M.leaB, body, [0, 1.03, 0]);
  put(rbox(.12, .1, .05, .02), M.pS, body, [0, 1.03, .17]);
  for (const sx of [-1, 1]) { put(rbox(.1, .13, .08, .028), M.lea, body, [sx * .145, .99, .14], [0, sx * .45, 0]); put(rbox(.11, .045, .09, .018), M.lea, body, [sx * .145, 1.04, .143], [0, sx * .45, 0]); }
  put(capsule(.04, .18), M.tank, body, [-.235, .98, .02], [0, 0, .1]); put(rbox(.08, .18, .14, .028), M.lea, body, [.24, .97, -.02]);
  // Undersuit, chest armour and breastplate.
  put(lathe(spl([[.175, .99], [.185, 1.08], [.22, 1.18]]), 18, TAU, .76), M.rib, body);
  put(lathe([...hard([[.17, 1.1], [.22, 1.11]]), ...spl([[.235, 1.13], [.292, 1.21], [.31, 1.33], [.285, 1.43], [.19, 1.5], [.09, 1.53]], 12)], 22, TAU, heavy ? .88 : .76), heavy ? M.bD : M.bS, body);
  put(plate(rrect(.38, .27, .06), .09, .024, 1.0), heavy ? M.chestO : patch ? M.chestR : long ? M.pD : M.chest, body, [0, 1.335, heavy ? .236 : .205], [-.13, 0, 0]);
  put(plate(rrect(.3, .085, .028), .055, .018, 1.0), bl === M.bY ? M.pS : pl, body, [0, 1.165, .175], [.12, 0, 0]);
  for (const sx of [-1, 1]) put(tube([[sx * .18, 1.2, .205], [sx * .2, 1.4, .18], [sx * .195, 1.5, .02], [sx * .18, 1.45, -.2]], .036, 8, .45), M.leaB, body);
  put(ring(.115, .036), M.rib, body, [0, 1.52, 0], [H, 0, 0]);
  // A dust wrap bunched round the neck with its tail thrown over one shoulder, and a rag tied on the off arm: nobody out here is in clean kit.
  put(lathe(spl([[.12, 1.455], [.21, 1.475], [.232, 1.525], [.2, 1.572], [.13, 1.585]], 9), 16, TAU, .92), M.fabT, body, [0, 0, .012]);
  fold(body, M.fabT, [0, 1.52, .012], .226, .5, .9, .03, .014); fold(body, M.fabT, [0, 1.545, .012], .214, -.9, .8, -.026, .013); fold(body, M.fabT, [0, 1.5, .012], .224, 2.6, .9, .03, .014);
  put(tube([[-.13, 1.5, .17], [-.19, 1.4, .215], [-.17, 1.27, .235], [-.2, 1.2, .225]], [.05, .058, .05, .022], 7, .42), M.fabT, body);
  put(tube([[-.14, 1.5, -.15], [-.2, 1.4, -.2], [-.16, 1.3, -.215]], [.045, .05, .02], 7, .42), M.fabT, body);
  if (heavy) { // a shell belt slung across the breastplate
    put(tube([[.25, 1.47, .1], [.1, 1.36, .27], [-.12, 1.22, .275], [-.25, 1.12, .13]], .034, 8, .5), M.leaB, body);
    for (let i = 0; i < 5; i++) { const t = .16 + i * .16, q = lerp([.25, 1.47, .1], [-.25, 1.12, .13], t), bz = .285 - Math.abs(t - .5) * .12; put(can(.026, .09), i % 2 ? M.red : M.pY, body, [q3(q[0]), q3(q[1] + .012), q3(bz + .03)], [0, 0, .5]); }
  }
  // Pack: frame, tanks, bedroll, a hose round to the chest.
  put(rbox(.42, .46, .22, .055), M.pD, body, [0, 1.28, -.3]);
  put(capsule(.078, .42), patch ? M.tankT : M.tank, body, [.12, 1.31, -.43]); put(capsule(.062, .34), M.bS, body, [-.115, 1.28, -.425]);
  put(can(.045, .055), M.bS, body, [.12, 1.55, -.43]); put(rbox(.18, .11, .07, .022), pl, body, [-.11, 1.13, -.42]);
  if (!long) { put(capsule(.08, .46), M.fabT, body, [0, 1.58, -.27], [0, 0, H]); for (const sx of [-1, 1]) put(ring(.084, .015), M.leaB, body, [sx * .12, 1.58, -.27], [0, H, 0]); }
  put(tube([[.18, 1.4, -.27], [.32, 1.42, -.1], [.295, 1.26, .08], [.18, 1.2, .17]], .028, 8), M.rib, body);
  if (heavy) { put(rbox(.56, .27, .18, .055), M.pD, body, [0, 1.5, -.36]); for (const sx of [-1, 1]) put(can(.062, .24), M.tank, body, [sx * .18, 1.7, -.36]); }
  // Head.
  const head = grp('head', body, [0, 1.53, 0]); head.scale.setScalar(.86);   // a smaller head on the same shoulders: less toy, more trooper
  put(can(.085, .12), M.rib, head, [0, .02, 0]);
  put(lathe([...hard([[.17, .04], [.216, .05]]), ...spl([[.224, .08], [.242, .22], [.226, .36], [.15, .455], [0, .485]], 14)], 22, TAU, 1.08), hel, head);
  put(ring(.222, .024, 1), M.rib, head, [0, .07, 0], [H, 0, 0], [1, 1.08, 1]);
  // Face: a dark mask set proud of the shell, a glowing visor, a respirator with two filter cans.
  put(lathe(spl([[.218, .09], [.252, .16], [.258, .26], [.244, .345]], 8), 16, 3.1, 1.08), M.gunB, head);
  if (long) { put(can(.085, .1), M.gunB, head, [.07, .24, .25], [H, 0, 0]); put(blob(.13, .13, .045), M.lens, head, [.07, .24, .305]); put(can(.04, .07), M.gunB, head, [-.1, .24, .25], [H, 0, 0]); put(blob(.06, .06, .03), M.visG, head, [-.1, .24, .29]); }
  else if (patch) for (const sx of [-1, 1]) { put(can(.074, .09), M.bW, head, [sx * .09, .24, .255], [H, 0, -sx * .22]); put(blob(.118, .118, .045), M.lens, head, [sx * .1, .24, .3], [0, sx * .22, 0]); }
  else put(lathe(spl([[.258, heavy ? .215 : .185], [.268, .245], [.262, heavy ? .275 : .305]], 6), 16, heavy ? 1.7 : 2.1, 1.08), M.visG, head);
  put(can(.074, .13), M.pD, head, [0, .085, .235], [H, 0, 0]); put(ring(.06, .018), M.bS, head, [0, .085, .3]); put(blob(.086, .086, .03), M.rib, head, [0, .085, .298]);
  for (const sx of [-1, 1]) { put(can(.052, .095), bl, head, [sx * .14, .075, .185], [H, 0, -sx * .75]); put(can(.088, .06), bl, head, [sx * .245, .225, 0], [0, 0, H]); put(blob(.085, .085, .035), M.rib, head, [sx * .278, .225, 0], [0, H, 0]); }
  put(tube([[.255, .26, -.03], [.28, .52, -.06], [.292, .78, -.1]], [.014, .009], 6), M.rubber, head); put(blob(.06, .06, .06), M.red, head, [.292, .8, -.1]);
  put(can(.045, .07), M.pD, head, [-.135, .425, .17], [H + .5, 0, 0]); put(blob(.074, .074, .028), M.visG, head, [-.135, .443, .2], [.5, 0, 0]);
  if (heavy) { put(lathe(spl([[.21, .0], [.262, .055], [.268, .14]], 6), 12, 1.9, 1.08), M.pO, head); put(plate([[-.22, 0], [.17, 0], [.12, .1], [-.14, .115]], .055, .018), M.pO, head, [0, .44, 0], [0, -H, 0]); }
  if (long) put(lathe(spl([[.29, .0], [.295, .19], [.265, .38], [.17, .49], [0, .52]], 12), 18, 4.3, 1.08), M.fabG, head, 0, [0, PI, 0]);
  // Arms and weapon.
  const arms = grp('arms', body, [0, 1.36, .04]);
  if (heavy) {
    arm(arms, [.35, 0, -.05], [.44, -.27, .08], [.3, -.27, .36], .082, sleeve, M.bD, M.leaB);
    put(pauldron(.24), M.hazC, arms, [.38, .07, -.03], [0, 0, -.45]);
    const gun = grp('gun', arms, [.3, -.23, .46]);
    put(rbox(.16, .2, .52, .04), M.gunm, gun, [0, 0, .08]);
    for (const sx of [-1, 1]) { put(can(.072, .54), M.gunB, gun, [sx * .043, .04, .56], [H, 0, 0]); put(ring(.064, .022), M.bS, gun, [sx * .043, .04, .82]); }
    put(rbox(.19, .11, .25, .04), M.pO, gun, [0, -.065, .48]); put(rbox(.085, .2, .11, .03), M.lea, gun, [0, -.18, -.08], [.3, 0, 0]); put(rbox(.1, .16, .25, .04), M.lea, gun, [0, -.02, -.3]);
    put(rbox(.045, .045, .28, .014), M.pS, gun, [0, .128, .1]);
    muzzle(gun, [0, .04, .9], 1.5);
    const armL = grp('armL', body, [-.37, 1.36, 0]);
    arm(armL, [0, 0, 0], [-.07, -.26, .15], [.08, -.22, .4], .082, sleeve, M.bD, M.leaB);
    put(pauldron(.24), M.hazC, armL, [-.02, .07, -.03], [0, 0, .45]);
    put(plate(rrect(.84, 1.24, .13), .085, .03, .3), M.shield, armL, [.14, -.32, .56], [0, .12, 0]);
    put(plate(rrect(.44, .115, .04), .13, .024, .3), M.gunm, armL, [.14, .12, .575], [0, .12, 0]); put(plate(rrect(.36, .055, .02), .15, .01, .3), M.visG, armL, [.14, .12, .578], [0, .12, 0]);
    put(plate(rrect(.78, .19, .05), .12, .024, .3), M.haz, armL, [.14, -.78, .57], [0, .12, 0]);
    for (const [x, y] of [[-.3, .46], [.3, .46], [-.3, -.48], [.3, -.48], [0, -.14]]) put(blob(x ? .08 : .19, x ? .08 : .19, .07), x ? M.nS : M.nO, armL, [.14 + x, -.32 + y, .61 - x * x * .3 - x * .12]);
  } else {
    arm(arms, [.33, 0, -.05], [.4, -.26, .08], [.14, -.25, .3], .074, sleeve, M.bS, M.leaB);
    arm(arms, [-.33, 0, -.05], [-.36, -.27, .2], [-.04, -.2, .52], .074, sleeve, M.bS, M.leaB);
    for (const sx of [-1, 1]) put(pauldron(.18), heavy ? M.cO : patch ? M.cW : long ? M.cD : M.cY, arms, [sx * .355, .07, -.04], [0, 0, -sx * .42]);
    put(tube([[-.345, -.13, .0], [-.345, -.15, .0]], [.1, .104], 8), M.fabR, arms); put(tube([[-.42, -.14, -.04], [-.47, -.24, -.08], [-.45, -.33, -.1]], [.03, .034, .012], 6, .4), M.fabR, arms); put(tube([[-.43, -.14, -.01], [-.5, -.2, -.02], [-.52, -.28, -.05]], [.028, .03, .012], 6, .4), M.fabR, arms);
    const gun = grp('gun', arms, [.07, -.2, .4]);
    if (long) {
      put(rbox(.1, .16, .66, .035), M.gunm, gun, [0, 0, .05]); put(can(.034, 1.0), M.gunB, gun, [0, .03, .88], [H, 0, 0]); put(can(.058, .2), M.bS, gun, [0, .03, 1.4], [H, 0, 0]);
      put(can(.066, .44), M.gunB, gun, [0, .185, .12], [H, 0, 0]); put(can(.08, .08), M.bD, gun, [0, .185, .36], [H, 0, 0]); put(blob(.13, .13, .03), M.lens, gun, [0, .185, .4]); for (const z of [-.02, .24]) put(rbox(.04, .08, .05, .012), M.pS, gun, [0, .11, z]);
      put(rbox(.11, .1, .32, .03), M.fabG, gun, [0, -.02, .48]); put(rbox(.08, .2, .1, .03), M.lea, gun, [0, -.17, -.1], [.3, 0, 0]); put(rbox(.09, .15, .32, .04), M.lea, gun, [0, -.03, -.46]); put(rbox(.07, .13, .1, .02), M.pS, gun, [0, -.14, .14]);
      muzzle(gun, [0, .03, 1.54], 1.2);
    } else {
      put(rbox(.115, .2, .54, .035), M.gunm, gun, [0, 0, 0]); put(rbox(.135, .15, .3, .04), patch ? M.pR : M.pY, gun, [0, -.01, .36]);
      put(can(.042, .36), M.gunB, gun, [0, .035, .66], [H, 0, 0]); put(can(.064, .13), M.bS, gun, [0, .035, .84], [H, 0, 0]);
      put(rbox(.078, .25, .13, .025), M.pS, gun, [0, -.2, .1], [.25, 0, 0]); put(rbox(.085, .2, .1, .03), M.lea, gun, [0, -.17, -.14], [.3, 0, 0]); put(rbox(.095, .17, .28, .04), M.lea, gun, [0, -.02, -.4]);
      put(rbox(.05, .045, .34, .014), M.pS, gun, [0, .125, .02]); put(ring(.036, .012), M.bS, gun, [0, .175, .12]); put(rbox(.025, .06, .03, .008), M.pS, gun, [0, .155, .48]);
      muzzle(gun, [0, .035, .94], 1);
    }
  }
  if (long) put(lathe(spl([[.46, .74], [.41, 1.05], [.32, 1.34], [.2, 1.52]], 10), 18, 4.2), M.fabG, body, [0, 0, -.04], [0, PI, 0]);
  if (heavy) obj.scale.setScalar(1.12);
  return obj;
}

/** The worker: hard hat, goggles, a moustache you could sweep a floor with, and a rock drill. */
/** The ore pack a worker carries home. */
function orePack(body: THREE.Object3D, z: number) {
  const pack = grp('pack', body); pack.visible = false;
  put(rbox(.44, .44, .24, .05), M.pD, pack, [0, 1.24, z]); put(rbox(.48, .09, .28, .03), M.haz, pack, [0, 1.44, z]);
  for (let i = 0; i < 4; i++) put(shard(.09, .46, 5), M.ore, pack, [-.15 + i * .1, 1.48, z + (i % 2) * .06], [R(-.3, .3), R(0, 3), R(-.3, .3)]);
}
function rigger(): THREE.Group {
  // Sculpted in Blender (art/rigger.py). The match server carries no meshes and builds the plain figure below, which has the same joints.
  const fig = figure('rigger'); if (fig) { orePack(fig.groups.body, -.3); return fig.root; }
  const obj = new THREE.Group(), body = grp('body', obj);
  leg(obj, 'legL', -1, M.fabT, M.leaB, null, M.leaB); leg(obj, 'legR', 1, M.fabT, M.leaB, null, M.leaB);
  put(blob(.44, .34, .34), M.fabT, body, [0, .93, 0]);
  put(lathe(hard([[.2, -.05], [.23, -.034], [.23, .034], [.2, .05]]), 20, TAU, .8), M.leaB, body, [0, 1.03, 0]);
  put(rbox(.12, .095, .05, .02), M.pS, body, [0, 1.03, .178]);
  put(rbox(.12, .16, .085, .028), M.lea, body, [-.165, .96, .14], [0, -.5, 0]); put(rbox(.045, .25, .035, .012), M.pS, body, [.175, .94, .165], [0, .5, .15]); put(rbox(.095, .055, .045, .015), M.pS, body, [.175, 1.075, .165], [0, .5, .15]);
  put(lathe(spl([[.19, .97], [.215, 1.03], [.25, 1.12], [.275, 1.27], [.25, 1.4], [.165, 1.47], [.09, 1.5]], 12), 20, TAU, .8), M.vestB, body);
  put(ring(.105, .036), M.fabT, body, [0, 1.49, 0], [H, 0, 0]);
  // A paunch under the vest, a chest pocket with a pencil and a notebook, and a red neckerchief knotted at the front.
  put(blob(.4, .34, .3), M.vestB, body, [0, 1.14, .115]);
  put(rbox(.13, .12, .03, .014), M.vestB, body, [-.12, 1.32, .232], [-.12, -.3, 0]); put(can(.011, .13), M.pY, body, [-.15, 1.4, .236], [-.1, 0, .08]); put(rbox(.07, .09, .012, .005), M.pW, body, [-.1, 1.385, .245], [-.12, -.3, 0]);
  put(lathe(spl([[.1, 1.455], [.17, 1.468], [.182, 1.505], [.15, 1.538], [.1, 1.545]], 8), 14, TAU, .95), M.fabR, body, [0, 0, .01]);
  fold(body, M.fabR, [0, 1.5, .01], .178, .7, .8, .026, .012); fold(body, M.fabR, [0, 1.515, .01], .174, -1.0, .8, -.02, .012);
  put(blob(.085, .07, .07), M.fabR, body, [.03, 1.455, .185]); put(tube([[.03, 1.45, .19], [.0, 1.37, .23], [-.02, 1.31, .245]], [.035, .045, .012], 6, .4), M.fabR, body); put(tube([[.04, 1.45, .19], [.08, 1.39, .225], [.1, 1.34, .235]], [.03, .04, .012], 6, .4), M.fabR, body);
  const head = grp('head', body, [0, 1.5, 0]); head.scale.setScalar(.88);
  put(can(.075, .1), M.skinF, head, [0, .02, 0]);
  put(blob(.38, .43, .4, v => { if (v.y < 0) { v.x *= 1 - v.y * .5; v.z += -v.y * .1; } }, 'jaw'), M.skinF, head, [0, .23, 0]);
  put(blob(.115, .13, .15), M.skinF, head, [0, .18, .205]);
  put(blob(.36, .13, .14, v => { v.y -= v.x * v.x * 1.6; }, 'tash'), M.stache, head, [0, .11, .2]);
  put(blob(.2, .12, .15), M.skinF, head, [0, .045, .13]); put(blob(.12, .035, .06), M.skinF, head, [0, .083, .2]);
  for (const sx of [-1, 1]) put(blob(.15, .045, .06, v => { v.y += v.x * sx * .5; }, 'brow' + sx), M.stache, head, [sx * .095, .352, .2], [-.2, 0, sx * -.12]);
  for (const sx of [-1, 1]) {
    put(blob(.07, .13, .1, v => { v.z -= Math.abs(v.y) * .3; }, 'ear'), M.skinF, head, [sx * .2, .215, -.005], [0, sx * .5, sx * -.12]); put(blob(.03, .07, .05), M.stache, head, [sx * .197, .29, .06]);
    put(can(.078, .07), M.gunB, head, [sx * .09, .275, .17], [H, 0, -sx * .2]); put(blob(.125, .125, .045), M.lens, head, [sx * .098, .275, .208], [0, sx * .2, 0]);
  }
  put(ring(.197, .023), M.leaB, head, [0, .275, -.01], [H, 0, 0]);
  put(lathe([...hard([[.2, .31], [.238, .315]]), ...spl([[.242, .335], [.232, .43], [.172, .515], [0, .555]], 10)], 20), M.hard, head);
  put(lathe(hard([[.17, .31], [.305, .305], [.315, .32], [.238, .34]]), 20), M.hard, head, [0, 0, .03], 0, [1, 1, 1.14]);
  put(tube([[0, .345, .245], [0, .535, .14], [0, .572, -.035], [0, .48, -.2]], .026, 6, .6), M.hard, head);
  put(can(.052, .07), M.gunB, head, [0, .45, .225], [H + .45, 0, 0]); put(blob(.086, .086, .028), M.visG, head, [0, .466, .256], [.45, 0, 0]);
  const armL = grp('armL', body, [-.31, 1.34, 0]); arm(armL, [0, 0, 0], [-.06, -.25, .04], [-.03, -.45, .18], .074, M.fabT, null, M.glove, M.skinF);
  const armR = grp('armR', body, [.31, 1.34, 0]); arm(armR, [0, 0, 0], [.05, -.24, .09], [.03, -.3, .32], .074, M.fabT, null, M.glove, M.skinF);
  put(ring(.088, .03, 1, 14), M.fabT, armL, [-.06, -.27, .05], [H - .3, 0, 0]); put(ring(.088, .03, 1, 14), M.fabT, armR, [.05, -.25, .11], [.25, 0, 0]);
  put(ring(.066, .016, 1, 12), M.leaB, armL, [-.035, -.4, .14], [H - .55, 0, 0]); put(can(.03, .02), M.pS, armL, [-.1, -.4, .14], [0, 0, H]);
  // Rock drill.
  put(rbox(.17, .2, .36, .045), M.chest, armR, [.03, -.3, .52]); put(lathe(hard([[.1, -.03], [.11, 0], [.1, .03]]), 14), M.hazB, armR, [.03, -.3, .72], [H, 0, 0]);
  put(lathe([[0, -.02], [.09, -.02], [.09, 0], [.076, .09], [.045, .25], [.011, .39], [0, .4]], 14), M.drill, armR, [.03, -.3, .74], [H, 0, 0]);
  put(rbox(.055, .09, .15, .02), M.gunm, armR, [.03, -.175, .47]); put(can(.032, .11), M.tank, armR, [.13, -.27, .54], [H, 0, 0]);
  const pack = grp('pack', body); pack.visible = false;
  put(rbox(.44, .44, .24, .05), M.pD, pack, [0, 1.24, -.32]); put(rbox(.48, .09, .28, .03), M.haz, pack, [0, 1.44, -.32]);
  for (let i = 0; i < 4; i++) put(shard(.09, .46, 5), M.ore, pack, [-.15 + i * .1, 1.48, -.32 + (i % 2) * .06], [R(-.3, .3), R(0, 3), R(-.3, .3)]);
  return obj;
}

/** Ironhold walker: a two-legged loader rig with a cannon bolted to each side. */
function gantry(): THREE.Group {
  const obj = new THREE.Group(), body = grp('body', obj);
  for (const sx of [-1, 1]) {
    const l = grp(sx < 0 ? 'legL' : 'legR', obj, [sx * .78, 1.55, 0]);
    put(can(.3, .38, .03), M.bY, l, 0, [0, 0, H]); put(blob(.34, .34, .1), M.nS, l, [sx * .2, 0, 0], [0, H, 0]);
    put(tube([[0, 0, 0], [0, -.34, -.2], [0, -.62, -.3]], [.2, .17, .15]), M.bD, l);
    put(rbox(.32, .56, .3, .08), M.pY, l, [sx * .04, -.3, -.1], [.52, 0, 0]);
    put(can(.2, .34, .025), M.bS, l, [0, -.62, -.3], [0, 0, H]); put(blob(.2, .2, .08), M.nD, l, [sx * .18, -.62, -.3], [0, H, 0]);
    put(tube([[0, -.62, -.3], [0, -1.0, -.1], [0, -1.32, .08]], [.15, .13, .12]), M.bS, l);
    put(rbox(.28, .5, .16, .06), M.haz, l, [0, -.99, .02], [-.5, 0, 0]);
    put(tube([[sx * .13, -.16, -.3], [sx * .13, -.95, -.26]], .034, 8), M.nS, l); put(tube([[sx * .13, -.5, -.29], [sx * .13, -.95, -.26]], .06, 8), M.bD, l);
    put(tube([[-sx * .1, -.7, -.42], [-sx * .12, -1.0, -.34], [-sx * .08, -1.3, -.1]], .03, 6), M.rib, l);
    put(blob(.32, .3, .32), M.nD, l, [0, -1.33, .08]);
    put(rbox(.56, .2, .86, .07), M.pD, l, [0, -1.42, .12]);
    for (const tx of [-1, 1]) put(rbox(.22, .17, .36, .06), M.pY, l, [tx * .15, -1.44, .6]);
    put(rbox(.3, .16, .2, .05), M.pS, l, [0, -1.44, -.36]); put(rbox(.62, .07, .94, .03), M.sole, l, [0, -1.515, .12]);
  }
  // Hull: turntable, cab, cockpit glass, engine and stacks.
  put(can(.5, .3, .03), M.bD, body, [0, 1.62, 0]); put(lathe(hard([[.5, -.07], [.58, 0], [.5, .07]]), 20), M.hazB, body, [0, 1.76, 0]);
  put(rbox(1.5, 1.02, 1.5, .2, 2), M.pY, body, [0, 2.26, -.05]);
  put(rbox(1.42, .24, .16, .05), M.haz, body, [0, 1.86, .68]);
  put(plate(rrect(1.06, .46, .1), .12, .03, .2), M.gunm, body, [0, 2.44, .69], [-.16, 0, 0]); put(plate(rrect(.9, .32, .06), .15, .02, .2), M.visG, body, [0, 2.44, .7], [-.16, 0, 0]);
  for (const x of [-.16, .16]) put(rbox(.035, .36, .05, .012), M.gunm, body, [x, 2.44, .775], [-.16, 0, 0]);
  put(rbox(1.2, .1, .34, .04), M.pD, body, [0, 2.71, .64], [.28, 0, 0]);
  put(plate(rrect(.46, .26, .04), .06, .02), M.chest, body, [0, 2.06, .71]);
  for (const sx of [-1, 1]) { put(can(.11, .12), M.gunB, body, [sx * .54, 2.04, .7], [H, 0, 0]); put(blob(.19, .19, .05), M.visG, body, [sx * .54, 2.04, .765]); }
  put(rbox(1.22, .84, .44, .1), M.pD, body, [0, 2.24, -.92]); for (let i = 0; i < 4; i++) put(rbox(.9, .05, .05, .015), M.pS, body, [0, 2.0 + i * .13, -1.15]);
  for (const sx of [-1, 1]) {
    put(can(.11, .86), M.tank, body, [sx * .42, 3.0, -.88]); put(ring(.11, .035), M.nD, body, [sx * .42, 3.42, -.88], [H, 0, 0]); put(ring(.115, .028), M.nS, body, [sx * .42, 2.72, -.88], [H, 0, 0]);
    put(rbox(.18, .42, .5, .05), M.pO, body, [sx * .83, 2.56, -.5]); put(tube([[sx * .5, 2.5, -.96], [sx * .8, 2.42, -.7], [sx * .84, 2.3, -.2]], .04, 6), M.rib, body);
  }
  put(rbox(.94, .12, .94, .05), M.pD, body, [0, 2.8, -.1]); put(can(.26, .08, .02), M.bS, body, [.2, 2.88, -.22]);
  put(tube([[-.46, 2.92, .36], [.46, 2.92, .36]], .04, 6), M.nD, body); for (const x of [-.3, 0, .3]) { put(can(.08, .1), M.gunB, body, [x, 2.92, .4], [H, 0, 0]); put(blob(.14, .14, .04), M.visG, body, [x, 2.92, .455]); }
  const head = grp('head', body, [0, 2.86, 0]);
  put(can(.12, .18), M.bD, head, [-.2, .06, -.1]); put(rbox(.34, .2, .3, .05), M.pS, head, [-.2, .24, -.06]); put(blob(.17, .17, .07), M.lens, head, [-.2, .24, .1]);
  put(tube([[-.32, .3, -.16], [-.36, .7, -.2], [-.38, 1.0, -.26]], [.016, .01], 6), M.rubber, head); put(blob(.08, .08, .08), M.red, head, [-.38, 1.02, -.26]);
  const arms = grp('arms', body, [0, 2.25, .1]);
  for (const sx of [-1, 1]) {
    put(can(.2, .32, .025), M.bS, arms, [sx * .86, 0, 0], [0, 0, H]);
    put(rbox(.42, .48, 1.1, .1), M.gunm, arms, [sx * 1.14, 0, .1]); put(rbox(.34, .1, .7, .04), M.pO, arms, [sx * 1.14, .27, .05]);
    put(can(.105, 1.0), M.gunB, arms, [sx * 1.14, .02, 1.0], [H, 0, 0]); put(can(.16, .4, .025), M.bD, arms, [sx * 1.14, .02, .8], [H, 0, 0]); put(can(.15, .17, .025), M.bS, arms, [sx * 1.14, .02, 1.46], [H, 0, 0]);
    put(can(.2, .3, .025), M.hazB, arms, [sx * 1.14, -.3, -.12], [0, 0, H]); put(plate(rrect(.6, .26, .04), .04, .015), M.haz, arms, [sx * 1.36, 0, .1], [0, H, 0]);
  }
  muzzle(arms, [1.14, .02, 1.62], 2.4);
  return obj;
}

// ---------------------------------------------------------------- the Veyl
/** A floating body: a shell that tapers to a point and sweeps back. */
const tail = (r: number, h: number, sweep: number, key: string) => warp(lathe(spl([[0, 0], [r * .22, h * .12], [r * .58, h * .42], [r * .92, h * .76], [r, h * .92], [r * .8, h]], 16), 14), v => { const k = 1 - Math.min(1, v.y / h); v.z -= k * k * sweep; }, key);
/** Long three-fingered hand. */
function claw(parent: THREE.Object3D, p: P3, s: number, dir: P3, mat: Mat) {
  put(blob(s * 1.3, s * 1.1, s * 1.4), mat, parent, p);
  for (let i = -1; i <= 1; i++) put(tube([p, [p[0] + dir[0] * s * 1.2 + i * s * .5, p[1] + dir[1] * s * 1.2, p[2] + dir[2] * s * 1.2], [p[0] + dir[0] * s * 2.3 + i * s * .7, p[1] + dir[1] * s * 2.3 - s * .5, p[2] + dir[2] * s * 2.3]], [s * .28, s * .22, s * .06], 5), mat, parent);
}
/** Veyl melee zealot: floats, swings a tuning-fork glaive. */
function cantor(): THREE.Group {
  const obj = new THREE.Group(), body = grp('body', obj);
  put(tail(.27, 1.14, .38, 'ct'), M.vD, body);
  for (const [y, r, z] of [[.5, .19, -.12], [.74, .25, -.05], [.96, .285, -.01]]) put(ring(r, .024), M.vG, body, [0, y, z], [H + .12, 0, 0]);
  put(plate([[-.1, 0], [.1, 0], [.075, -.7], [0, -.88], [-.075, -.7]], .035, .012), M.vG, body, [0, 1.12, .235], [.06, 0, 0]);
  for (const sx of [-1, 1]) put(plate([[-.08, 0], [.08, 0], [.1, -.5], [.02, -.74], [-.05, -.52]], .03, .01), M.vDp, body, [sx * .22, 1.1, .1], [.05, sx * .9, sx * .12]);
  put(lathe(spl([[.2, 1.04], [.235, 1.18], [.33, 1.5], [.3, 1.72], [.17, 1.86], [.09, 1.92]], 12), 20, TAU, .74), M.vI, body);
  put(ring(.115, .03), M.vG, body, [0, 1.56, .225], [-.1, 0, 0]); put(blob(.2, .2, .1), M.vM, body, [0, 1.56, .225]);
  for (const y of [1.3, 1.4]) put(tube([[-.24, y + .03, .1], [0, y - .03, .25], [.24, y + .03, .1]], .02, 6), M.vG, body);
  for (const sx of [-1, 1]) {
    put(plate(crescent(.62, .15, 1.75, .22), .09, .03), M.vIp, body, [sx * .34, 1.5, -.04], [0, sx < 0 ? PI : 0, sx * .12]);
    put(shard(.085, .46, 5), M.vC, body, [sx * .9, 1.66, -.04], [0, 0, -sx * .9]); put(shard(.06, .3, 5), M.vC, body, [sx * .5, 2.1, -.06], [0, 0, -sx * .25]);
  }
  for (const y of [1.9, 1.96]) put(ring(.1 - (y - 1.9) * .3, .026), M.vG, body, [0, y, 0], [H, 0, 0]);
  const head = grp('head', body, [0, 1.96, 0]);
  put(blob(.34, .56, .38, v => { if (v.y < 0) { v.x *= 1 + v.y * 1.25; v.z *= 1 + v.y * .7; v.z += -v.y * .12; } else v.z -= v.y * .16; }, 'cmask'), M.vL, head, [0, .32, .02]);
  for (const sx of [-1, 1]) { put(blob(.13, .045, .06), M.teal, head, [sx * .075, .36, .175], [0, sx * .3, sx * .45]); put(tube([[sx * .12, .46, .02], [sx * .26, .62, -.1], [sx * .22, .86, -.24]], [.05, .04, .008], 6), M.vD, head); }
  put(plate([[-.1, 0], [.12, .04], [.1, .34], [-.02, .7], [-.07, .3]], .05, .018), M.vG, head, [0, .52, -.04], [0, -H, 0]);
  for (const x of [-.05, 0, .05]) put(tube([[x, .08, .13], [x * 1.4, -.06, .17], [x * 1.6, -.2 - Math.abs(x), .15]], [.016, .012, .004], 5), M.vG, head);
  const halo = grp('halo', body, [0, 2.44, -.32]); put(ring(.62, .055, .5, 32), M.mag, halo); for (let i = 0; i < 3; i++) { const a = i / 3 * TAU; put(shard(.06, .26, 4, .5), M.teal, halo, [Math.cos(a) * .62, Math.sin(a) * .62, 0], [0, 0, a - H]); }
  const armL = grp('armL', body, [-.37, 1.76, 0]);
  put(tube([[0, 0, 0], [-.15, -.3, .08], [-.13, -.6, .32]], [.07, .05, .04], 8), M.vD, armL); put(ring(.055, .02), M.vG, armL, [-.14, -.4, .16], [H + .5, 0, 0]); claw(armL, [-.13, -.64, .35], .1, [0, -.3, .9], M.vL);
  const armR = grp('armR', body, [.37, 1.76, 0]);
  put(tube([[0, 0, 0], [.15, -.3, .08], [.15, -.58, .34]], [.07, .05, .04], 8), M.vD, armR); put(ring(.055, .02), M.vG, armR, [.15, -.4, .17], [H + .5, 0, 0]); put(blob(.15, .13, .16), M.vL, armR, [.16, -.62, .37]);
  put(tube([[.16, -1.5, .38], [.16, -.4, .38], [.16, .78, .38]], [.03, .036, .03], 6), M.vG, armR); put(shard(.07, .3, 4, .8), M.vC, armR, [.16, -1.5, .38], [PI, 0, 0]);
  put(tube([[.0, 1.5, .38], [-.02, 1.0, .38], [.16, .76, .38], [.34, 1.0, .38], [.32, 1.5, .38]], [.012, .045, .06, .045, .012], 6, .6), M.vC, armR); put(ring(.06, .02), M.mag, armR, [.16, .7, .38], [H, 0, 0]);
  return obj;
}

/** Veyl ranged unit: slim, one eye, carries a long crystal lance that throws slow bolts. */
function lancer(): THREE.Group {
  const obj = new THREE.Group(), body = grp('body', obj);
  put(tail(.22, 1.0, .5, 'lt'), M.vD, body);
  for (const [y, r, z] of [[.42, .14, -.17], [.66, .2, -.06]]) put(ring(r, .02), M.vG, body, [0, y, z], [H + .2, 0, 0]);
  put(lathe(spl([[.16, .92], [.2, 1.06], [.27, 1.34], [.24, 1.56], [.13, 1.7], [.08, 1.74]], 12), 18, TAU, .74), M.vL, body, [0, 0, .02]);
  put(plate([[-.07, 0], [.07, 0], [.05, -.56], [0, -.7], [-.05, -.56]], .03, .012), M.vG, body, [0, 1.5, .2], [.04, 0, 0]);
  // Spine of crystal quills down the back, a cowl over the shoulders.
  for (let i = 0; i < 4; i++) put(shard(.07 - i * .008, .5 - i * .07, 5, .2), M.vC, body, [0, 1.62 - i * .22, -.2 - i * .02], [-1.0 - i * .12, 0, 0]);
  for (const sx of [-1, 1]) { put(plate(crescent(.44, .3, 2.0, .16), .07, .025), M.vIp, body, [sx * .22, 1.42, -.06], [-.25, sx < 0 ? PI : 0, sx * .2]); put(blob(.22, .18, .22), M.vI, body, [sx * .27, 1.6, 0]); }
  const head = grp('head', body, [0, 1.74, 0]);
  put(lathe(spl([[.1, 0], [.2, .1], [.25, .32], [.2, .56], [.08, .74], [0, .78]], 12), 18, 4.6, 1.1), M.vI, head, [0, 0, .02], [0, PI, 0]);
  put(blob(.36, .5, .3), M.vD, head, [0, .32, -.02]); put(ring(.13, .03), M.vG, head, [0, .33, .16]); put(blob(.24, .24, .12), M.vM, head, [0, .33, .16]);
  put(shard(.07, .62, 5, .15), M.vC, head, [0, .7, -.1], [-.35, 0, 0]);
  for (const sx of [-1, 1]) put(tube([[sx * .1, .06, .12], [sx * .13, -.1, .16], [sx * .11, -.28, .12]], [.02, .014, .004], 5), M.vG, head);
  const halo = grp('halo', body, [0, 2.2, -.36]); put(ring(.45, .045, .5, 28), M.teal, halo); for (const sx of [-1, 1]) put(shard(.055, .24, 4, .5), M.mag, halo, [sx * .45, 0, 0]);
  const arms = grp('arms', body, [0, 1.52, .05]);
  put(tube([[.3, .08, -.05], [.36, -.14, .1], [.28, -.22, .3]], [.055, .04, .034], 8), M.vD, arms); claw(arms, [.28, -.22, .32], .075, [-.3, 0, .9], M.vL);
  put(tube([[-.3, .08, -.05], [-.3, -.14, .3], [-.1, -.16, .68]], [.055, .04, .034], 8), M.vD, arms); claw(arms, [-.1, -.16, .7], .075, [.3, 0, .9], M.vL);
  put(tube([[.36, -.24, -.6], [.2, -.2, .4], [.02, -.16, 1.5]], [.02, .042, .034], 6), M.vG, arms);
  put(shard(.1, .84, 6, .12), M.vC, arms, [-.01, -.155, 1.48], [H - .04, 0, .17]); put(ring(.11, .02), M.mag, arms, [.02, -.16, 1.42]);
  for (const a of [0, 2.1, 4.2]) put(shard(.04, .3, 4, .2), M.vC, arms, [.02 + Math.cos(a) * .12, -.16 + Math.sin(a) * .12, 1.36], [H, 0, 0]);
  put(shard(.05, .3, 4, .8), M.vC, arms, [.36, -.24, -.6], [-H, 0, 0]);
  const f = grp('flash', arms, [-.1, -.13, 2.2]); mk(G.sph, M.cyan, [0, 0, 0], [.5, .5, .5], 0, f); mk(G.oct, M.cyan, [0, 0, 0], [.9, .2, .2], 0, f); mk(G.oct, M.cyan, [0, 0, 0], [.2, .9, .2], 0, f); f.visible = false; setLayer(f, L_FX);
  return obj;
}

/** Veyl worker: small and round, hums ore loose with a tuning fork and carries it home in a glass sling. */
function tender(): THREE.Group {
  const obj = new THREE.Group(), body = grp('body', obj);
  put(tail(.2, .84, .3, 'tt'), M.vD, body);
  for (const [y, r, z] of [[.36, .12, -.1], [.56, .16, -.04]]) put(ring(r, .02), M.vG, body, [0, y, z], [H + .14, 0, 0]);
  put(lathe(spl([[.15, .76], [.2, .88], [.27, 1.1], [.25, 1.28], [.15, 1.42], [.08, 1.46]], 12), 18, TAU, .8), M.vL, body);
  put(plate([[-.07, 0], [.07, 0], [.05, -.4], [0, -.5], [-.05, -.4]], .03, .012), M.vG, body, [0, 1.3, .21], [.06, 0, 0]);
  for (const y of [1.0, 1.08]) put(tube([[-.22, y + .02, .1], [0, y - .03, .25], [.22, y + .02, .1]], .016, 6), M.vG, body);
  for (const sx of [-1, 1]) { put(blob(.22, .18, .22), M.vI, body, [sx * .24, 1.33, 0]); put(shard(.05, .26, 4, .3), M.vC, body, [sx * .36, 1.44, -.04], [0, 0, -sx * .7]); }
  const head = grp('head', body, [0, 1.46, 0]);
  put(blob(.34, .4, .32, v => { if (v.y < 0) { v.x *= 1 + v.y * .6; v.z += -v.y * .08; } }, 'thead'), M.vI, head, [0, .2, .01]);
  put(ring(.1, .024), M.vG, head, [0, .23, .15]); put(blob(.17, .17, .08), M.vM, head, [0, .23, .15]);
  for (const sx of [-1, 1]) { put(tube([[sx * .08, .34, -.02], [sx * .17, .5, -.08], [sx * .15, .66, -.16]], [.03, .024, .006], 6), M.vD, head); put(shard(.035, .16, 4, .4), M.teal, head, [sx * .15, .7, -.17]); }
  for (const x of [-.04, .04]) put(tube([[x, .06, .12], [x * 1.3, -.04, .15], [x * 1.4, -.13, .13]], [.012, .009, .003], 5), M.vG, head);
  const halo = grp('halo', body, [0, 1.95, -.26]); put(ring(.34, .04, .5, 26), M.teal, halo); for (const sx of [-1, 1]) put(shard(.04, .16, 4, .5), M.mag, halo, [sx * .34, 0, 0]);
  // The sling: a glass pod on the back that glows full of ore on the way home.
  const pack = grp('pack', body); pack.visible = false;
  put(blob(.36, .32, .26), M.vD, pack, [0, 1.12, -.27]); put(ring(.15, .025), M.vG, pack, [0, 1.12, -.36], [0, 0, 0]);
  for (let i = 0; i < 4; i++) put(shard(.07, .34, 5), M.ore, pack, [-.1 + i * .07, 1.3, -.27 + (i % 2) * .05], [R(-.3, .3), R(0, 3), R(-.3, .3)]);
  const armL = grp('armL', body, [-.27, 1.26, 0]);
  put(tube([[0, 0, 0], [-.1, -.2, .06], [-.08, -.4, .22]], [.05, .038, .03], 8), M.vD, armL); claw(armL, [-.08, -.43, .25], .07, [0, -.3, .9], M.vL);
  const armR = grp('armR', body, [.27, 1.26, 0]);
  put(tube([[0, 0, 0], [.1, -.2, .06], [.1, -.38, .24]], [.05, .038, .03], 8), M.vD, armR); put(blob(.11, .1, .12), M.vL, armR, [.1, -.41, .26]);
  // the tuning fork
  put(tube([[.1, -.42, .28], [.1, -.42, .5]], [.022, .02], 6), M.vG, armR); put(ring(.04, .014), M.mag, armR, [.1, -.42, .5]);
  for (const sx of [-1, 1]) put(tube([[.1, -.42, .5], [.1 + sx * .06, -.42, .58], [.1 + sx * .06, -.42, .86]], [.016, .018, .008], 6, .5), M.vC, armR);
  return obj;
}

/** Veyl heavy: a floating shell giant with crystal fists. */
function warden(): THREE.Group {
  const obj = new THREE.Group(), body = grp('body', obj);
  put(tail(.95, 2.0, .7, 'wt'), M.vD, body);
  for (const [y, r, z] of [[.7, .5, -.3], [1.2, .78, -.12], [1.7, .95, -.02]]) put(ring(r, .06), M.vG, body, [0, y, z], [H + .14, 0, 0]);
  put(blob(2.9, 2.3, 2.1, v => { const k = v.y + .5; v.x *= .62 + k * .62; v.z *= .8 + k * .3; if (v.y > .3) v.y = .3 + (v.y - .3) * .6; }, 'wchest'), M.vI, body, [0, 2.75, 0]);
  put(plate([[-.2, 0], [.2, 0], [.15, -.9], [0, -1.15], [-.15, -.9]], .08, .03), M.vG, body, [0, 2.0, .86], [.1, 0, 0]);
  put(ring(.5, .09), M.vG, body, [0, 2.8, .93], [-.08, 0, 0]); put(blob(.86, .86, .34), M.vM, body, [0, 2.8, .92]);
  for (const a of [.6, 1.57, 2.54, 3.74, 4.71, 5.68]) put(shard(.07, .26, 4, .5), M.vC, body, [Math.cos(a) * .62, 2.8 + Math.sin(a) * .62, .9], [0, 0, a - H]);
  for (const y of [2.1, 2.3]) put(tube([[-.82, y + .16, .5], [0, y - .06, .92], [.82, y + .16, .5]], .05, 6), M.vG, body);
  for (const sx of [-1, 1]) {
    put(blob(1.5, 1.2, 1.5, v => { v.y += Math.max(0, v.x * sx) * .5; }, 'wsh' + sx), M.vL, body, [sx * 1.45, 3.45, 0]);
    put(plate(crescent(1.2, .1, 1.5, .4), .2, .06), M.vIp, body, [sx * 1.3, 3.3, -.3], [0, sx < 0 ? PI : 0, sx * .25]);
    put(shard(.26, 1.3, 5, .22), M.vC, body, [sx * 1.75, 3.9, -.1], [0, 0, -sx * .42]); put(shard(.18, .95, 5, .22), M.vC, body, [sx * 1.3, 4.0, -.4], [-.3, 0, -sx * .2]); put(shard(.14, .7, 5, .22), M.vC, body, [sx * 2.0, 3.7, .2], [.3, 0, -sx * .8]);
  }
  const head = grp('head', body, [0, 3.7, .25]);
  put(blob(.8, .9, .8, v => { if (v.y < 0) { v.x *= 1 + v.y * .9; v.z *= 1 + v.y * .4; } }, 'whead'), M.vD, head, [0, .25, 0]);
  put(plate([[-.3, .3], [.3, .3], [.22, -.1], [0, -.36], [-.22, -.1]], .1, .035, .8), M.vG, head, [0, .25, .36]);
  for (const sx of [-1, 1]) { put(blob(.2, .07, .08), M.teal, head, [sx * .14, .34, .42], [0, 0, sx * .4]); put(tube([[sx * .3, .5, 0], [sx * .56, .8, -.1], [sx * .48, 1.2, -.3]], [.1, .08, .012], 6), M.vL, head); }
  put(shard(.1, .8, 5, .15), M.vC, head, [0, .62, -.05]);
  const halo = grp('halo', body, [0, 4.4, -.75]); put(ring(1.3, .1, .5, 40), M.mag, halo); put(ring(.95, .07, .5, 36), M.teal, halo); for (let i = 0; i < 5; i++) { const a = i / 5 * TAU; put(shard(.1, .46, 4, .5), M.teal, halo, [Math.cos(a) * 1.3, Math.sin(a) * 1.3, 0], [0, 0, a - H]); }
  for (const sx of [-1, 1]) {
    const a = grp(sx < 0 ? 'armL' : 'armR', body, [sx * 1.6, 3.3, 0]);
    put(tube([[0, 0, 0], [sx * .22, -.5, .14], [sx * .3, -1.0, .3]], [.3, .26, .22]), M.vD, a); put(blob(.66, .62, .66), M.vL, a, [sx * .3, -1.05, .3]);
    put(tube([[sx * .3, -1.0, .3], [sx * .26, -1.45, .55], [sx * .2, -1.9, .8]], [.2, .26, .3]), M.vI, a);
    for (const t of [.25, .6]) put(ring(.27 + t * .06, .04), M.vG, a, [sx * (.3 - t * .1), -1.0 - t * .9, .3 + t * .5], [H - .5, 0, 0]);
    put(blob(.9, .9, .9), M.vIp, a, [sx * .2, -2.1, .9]);
    for (const [x, y, z, rx, rz, s] of [[0, -.2, .3, 1.3, 0, 1], [.3, -.1, .1, .9, -.7, .8], [-.3, -.1, .1, .9, .7, .8], [0, -.5, 0, 2.2, 0, .9], [0, .1, .3, .5, 0, .7]]) put(shard(.24 * s, .9 * s, 5, .25), M.vC, a, [sx * .2 + x, -2.1 + y, .9 + z], [rx, 0, rz]);
  }
  return obj;
}

export const NEW: Record<string, () => THREE.Group> = { rigger, linesman: () => trooper(false), breacher: () => trooper(true), longshot: () => trooper(false, 'long'), patch: () => trooper(false, 'patch'), gantry, cantor, lancer, warden, tender };
