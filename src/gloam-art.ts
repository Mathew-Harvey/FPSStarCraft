// The Gloam: a fungal swarm that grows out of ore rot. Moss hide, ivory chitin, coral gills,
// teal mushroom caps and lime spore sacs. Skins, the cast and their structures live here.
import * as THREE from 'three';
import { INK, R, rnd, M, TX, EXTRA, paint, tone, T, mk, G, setLayer, L_FX } from './gfx';
import type { Ctx } from './gfx';
import { pen, hatch, brush, frame, sky, nicks } from './skins';
import { lathe, hard, spl, rbox, blob, tube, plate, ring, shard, warp, crescent, capsule } from './sculpt';
import { grp, put } from './units';

type P3 = [number, number, number];
type Mat = THREE.Material;
const PI = Math.PI, H = PI / 2, TAU = PI * 2;

// ---------------------------------------------------------------- skins
const MOSS = '#6f8f34', BELLY = '#c3cf8e', BONE = '#e9dab2', CAP = '#2f6f68', GILL = '#d65a40', GLOW = '#c8ff3c';
/** Dark lichen freckles and pale blotches, so the hide reads as grown rather than painted. */
function lichen(g: Ctx, s: number, n: number, dark: string, lite: string) {
  for (let i = 0; i < n; i++) { const x = R(0, s), y = R(0, s), r = R(3, 11); g.globalAlpha = R(.35, .8); g.fillStyle = rnd() < .7 ? dark : lite; g.beginPath(); g.ellipse(x, y, r * R(.8, 1.4), r, R(0, 3), 0, 7); g.fill(); }
  g.globalAlpha = 1;
}
/** Short curved wrinkles in pen, bunched where the skin folds. */
function wrinkles(g: Ctx, s: number, n: number, col = INK) {
  for (let i = 0; i < n; i++) { const x = R(.05, .95) * s, y = R(.05, .95) * s, l = R(16, 44), a = R(-.4, .4) + (rnd() < .3 ? H : 0); pen(g, [[x, y], [x + Math.cos(a) * l * .5, y + Math.sin(a) * l * .5 + R(4, 10)], [x + Math.cos(a) * l, y + Math.sin(a) * l]], R(2, 4), col); }
}
/** Growth lines across chitin, like the rings on a shell. */
function growth(g: Ctx, s: number, n: number) {
  for (let i = 0; i < n; i++) { const y = (i + R(.3, .7)) / n * s; pen(g, [[0, y], [s * .3, y + R(-6, 6)], [s * .7, y + R(-6, 6)], [s, y]], R(2, 3.5), '#6a5636', .4); g.globalAlpha = .6; pen(g, [[0, y - 6], [s * .5, y - 6 + R(-3, 3)], [s, y - 6]], 2, '#fffbe8', .5); g.globalAlpha = 1; }
}
const hide = (base: string, kind: 'box' | 'band' | 'none' | 'cap') => paint(base, (g, s) => {
  brush(g, s, base, 30, 1.3); sky(g, s, 1.1); lichen(g, s, 46, tone(base, .55), tone(base, 1.45)); wrinkles(g, s, 16);
  for (let i = 0; i < 4; i++) hatch(g, R(.05, .65) * s, s * R(.55, .8), s * R(.16, .3), -1.0, 6, s * .022, s * .008);
  nicks(g, s, 10, tone(base, 1.7), 40, 3);
  if (kind !== 'none') frame(g, s, base, kind, 7);
}, { blot: 40 });
const bone = (kind: 'box' | 'band' | 'none' | 'cap') => paint(BONE, (g, s) => {
  brush(g, s, BONE, 22, 0); sky(g, s, 1.1);
  // Darker toward one end, as a horn or a tusk is.
  const gr = g.createLinearGradient(0, 0, 0, s); gr.addColorStop(0, 'rgba(120,84,40,0)'); gr.addColorStop(1, 'rgba(120,84,40,.45)'); g.fillStyle = gr; g.fillRect(0, 0, s, s);
  growth(g, s, 6); nicks(g, s, 12, '#5a4426', 30, 2.6);
  for (let i = 0; i < 3; i++) hatch(g, R(.05, .6) * s, s * R(.6, .8), s * R(.16, .3), -1.0, 5, s * .025, s * .008, '#4a3a22');
  if (kind !== 'none') frame(g, s, BONE, kind, 7);
}, { blot: 30 });
const cap = (kind: 'cap' | 'none' | 'band') => paint(CAP, (g, s) => {
  brush(g, s, CAP, 30, 0); sky(g, s, 1.3);
  // Radial gill shadow from the crown, then cream warts.
  for (let i = 0; i < 18; i++) { const x = (i + .5) / 18 * s; g.globalAlpha = .35; pen(g, [[x, 0], [x + R(-6, 6), s * .5], [x + R(-10, 10), s]], R(3, 6), tone(CAP, .5), .3); } g.globalAlpha = 1;
  for (let i = 0; i < 16; i++) { const x = R(0, s), y = R(.08, .8) * s, r = R(8, 20); g.fillStyle = '#efe6c4'; g.beginPath(); g.ellipse(x, y, r * 1.3, r, 0, 0, 7); g.fill(); pen(g, [[x - r * 1.2, y + r * .4], [x, y + r * 1.05], [x + r * 1.2, y + r * .4]], 3.4, INK, .6); g.globalAlpha = .7; g.fillStyle = '#ffffff'; g.beginPath(); g.ellipse(x - r * .4, y - r * .35, r * .4, r * .25, 0, 0, 7); g.fill(); g.globalAlpha = 1; }
  for (let i = 0; i < 3; i++) hatch(g, R(.1, .7) * s, s * R(.65, .85), s * .2, -1.0, 6, s * .022, s * .008);
  if (kind !== 'none') frame(g, s, CAP, kind, 8);
}, { blot: 40 });
const gill = (kind: 'box' | 'band') => paint(GILL, (g, s) => {
  brush(g, s, GILL, 20, H); sky(g, s, .9);
  for (let i = 0; i < 22; i++) { const x = (i + .5) / 22 * s; pen(g, [[x, 0], [x + R(-3, 3), s * .5], [x + R(-4, 4), s]], R(2.5, 4.5), '#5a1a18', .25); g.globalAlpha = .55; pen(g, [[x + 5, 0], [x + 5, s * .5], [x + 5, s]], 2, '#ffc4a8', .4); g.globalAlpha = 1; }
  frame(g, s, GILL, kind, 6);
}, { blot: 20 });
const glow = () => paint(GLOW, (g, s) => {
  const gr = g.createRadialGradient(s * .42, s * .38, 8, s * .5, s * .5, s * .66); gr.addColorStop(0, '#fbffe4'); gr.addColorStop(.42, GLOW); gr.addColorStop(1, '#4f8a1a'); g.fillStyle = gr; g.fillRect(0, 0, s, s);
  for (let i = 0; i < 6; i++) { let x = R(0, s), y = R(0, s); const pts = [[x, y]]; for (let k = 0; k < 4; k++) { x += R(-40, 40); y += R(-40, 40); pts.push([x, y]); } g.globalAlpha = .5; pen(g, pts, R(3, 6), '#3d6a12', .5); g.globalAlpha = 1; }
  pen(g, [[s * .2, s * .66], [s * .4, s * .32], [s * .7, s * .22]], 22, 'rgba(255,255,255,.8)');
}, { blot: 0 });

EXTRA.push(() => {
  const S = (n: string, tex: THREE.Texture, o: { emis?: number; rx?: number; ry?: number; hatch?: number; flat?: number } = {}) => { TX[n] = tex; M[n] = T(tex, o); };
  S('gH', hide(MOSS, 'band')); S('gHp', hide(MOSS, 'box')); S('gHn', hide(MOSS, 'none'));
  S('gD', hide('#41582a', 'band')); S('gDn', hide('#41582a', 'none'));
  S('gV', paint(BELLY, (g, s) => { brush(g, s, BELLY, 20, 0); sky(g, s, .9); for (let i = 0; i < 7; i++) { const y = (i + .5) / 7 * s; pen(g, [[0, y], [s * .5, y + R(-3, 3)], [s, y]], 4.5, '#5a6a2a', .3); g.globalAlpha = .6; pen(g, [[0, y - 8], [s, y - 8]], 2.5, '#fbffe0', .5); g.globalAlpha = 1; } frame(g, s, BELLY, 'band', 5); }, { blot: 20 }));
  S('gB', bone('band')); S('gBp', bone('box')); S('gBn', bone('none')); S('gBc', bone('cap'));
  S('gC', cap('cap')); S('gCn', cap('none')); S('gCb', cap('band'));
  S('gG', gill('box')); S('gGb', gill('band'));
  S('gS', glow(), { emis: .78 });
  S('gEye', paint('#ffb43a', (g, s) => { const gr = g.createRadialGradient(s * .4, s * .38, 6, s * .5, s * .5, s * .6); gr.addColorStop(0, '#fff6d0'); gr.addColorStop(.45, '#ffb43a'); gr.addColorStop(1, '#a8400c'); g.fillStyle = gr; g.fillRect(0, 0, s, s); g.fillStyle = INK; g.fillRect(s * .44, s * .12, s * .12, s * .76); }, { blot: 0 }), { emis: .9 });
  S('gMaw', paint('#3a1420', (g, s) => { g.fillStyle = '#3a1420'; g.fillRect(0, 0, s, s); for (let i = 0; i < 9; i++) { const y = (i + .5) / 9 * s; g.globalAlpha = .5; pen(g, [[0, y], [s, y + R(-6, 6)]], R(3, 6), '#8a2a3a', .3); g.globalAlpha = 1; } }, { blot: 0 }));
  M.gS.uniforms.uEmis.value = .78; M.gGlow = T(null, { color: GLOW, emis: 1 });
  // The carpet is painted in the shader (see BLOOM in gfx.ts), so it never tiles and its lip is ragged.
  M.gBloom = T(null, { bloom: true, flat: 1, hatch: 0 }); M.gBloom.polygonOffset = true; M.gBloom.polygonOffsetFactor = -4; M.gBloom.polygonOffsetUnits = -4; M.gBloom.alphaToCoverage = true;
  M.gSpit = T(null, { color: '#d8ff6a', emis: 1 });
});

// ---------------------------------------------------------------- parts
/** A jointed insect leg from hip to a bone claw tip. The group pivots at the hip; `sx` picks the side. */
function bugLeg(parent: THREE.Object3D, name: string, hip: P3, sx: number, reach: number, drop: number, fwd: number, r: number, shell: Mat = M.gH, claw: Mat = M.gBn) {
  const g = grp(name, parent, hip), kx = sx * reach * .62, ky = reach * .22, fz = fwd * .55;
  const knee: P3 = [kx, ky, fz], foot: P3 = [sx * reach * .92, -drop, fwd];
  put(tube([[0, 0, 0], [kx * .5, ky * 1.05, fz * .5], knee], [r * 1.25, r * 1.2, r * .95], 8), shell, g);
  put(blob(r * 2.5, r * 2.3, r * 2.5), M.gBn, g, knee);
  const m: P3 = [(knee[0] + foot[0]) / 2 + sx * r * .4, (knee[1] + foot[1]) / 2, (knee[2] + foot[2]) / 2];
  put(tube([knee, m, [foot[0], foot[1] + r * 1.6, foot[2]]], [r, r * 1.05, r * .7], 7), M.gD, g);
  put(lathe(spl([[r * .8, 0], [r * .9, r * .8], [r * .55, r * 1.8], [0, r * 2.2]], 6), 10), M.gBn, g, [foot[0], foot[1] + r * 2.1, foot[2]], [PI, 0, 0]);
  return g;
}
/** A row of overlapping chitin plates along the back, from `a` to `b`, widening to `w` in the middle. */
function plates(parent: THREE.Object3D, a: P3, b: P3, n: number, w: number, mat: Mat = M.gBc) {
  for (let i = 0; i < n; i++) {
    const t = n > 1 ? i / (n - 1) : .5, k = Math.sin(PI * (.15 + t * .7)), p: P3 = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
    put(lathe([...hard([[w * k * .5, -.02], [w * k * .52, 0]]), ...spl([[w * k * .5, .01], [w * k * .4, w * k * .16], [0, w * k * .22]], 6)], 14, PI * 1.25, 1.2), mat, parent, p, [-.35, PI, 0]);
  }
}
/** A cluster of glowing spore sacs. */
function sacs(parent: THREE.Object3D, p: P3, n: number, r: number, seed = 1) {
  let s = seed; const rr = () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
  for (let i = 0; i < n; i++) { const a = rr() * TAU, d = rr() * r * 1.2, k = r * (.55 + rr() * .6); put(blob(k, k * .9, k), M.gS, parent, [p[0] + Math.cos(a) * d, p[1] + rr() * r * .5, p[2] + Math.sin(a) * d]); }
}
/** A bone tooth or spine pointing along `dir`. */
function spine(parent: THREE.Object3D, p: P3, len: number, r: number, rot: P3 | 0, mat: Mat = M.gBn) {
  put(lathe(spl([[r, 0], [r * .9, len * .3], [r * .5, len * .7], [0, len]], 7), 8), mat, parent, p, rot);
}
/** A mushroom cap: dome on top, coral gills underneath. */
function mushroom(parent: THREE.Object3D, p: P3, r: number, h: number, tilt: P3 | 0 = 0, sz = 1) {
  const g = grp('cap', parent, p); if (tilt) g.rotation.set(tilt[0], tilt[1], tilt[2]);
  put(lathe([...hard([[r * .98, -h * .1], [r, 0]]), ...spl([[r * .99, h * .05], [r * .88, h * .45], [r * .58, h * .85], [0, h]], 10)], 22, TAU, sz), M.gC, g);
  put(lathe(spl([[r * .97, -h * .08], [r * .6, -h * .16], [r * .2, -h * .2]], 6), 22, TAU, sz), M.gGb, g);
  return g;
}
/** A jaw lined with teeth. Lies along +z. */
function jaw(parent: THREE.Object3D, p: P3, w: number, l: number, n: number, up = 1) {
  put(blob(w, w * .32, l, v => { if (v.y * up > 0) v.y *= .3; }, 'jaw' + w + l + up), M.gHn, parent, p);
  put(blob(w * .86, w * .2, l * .9), M.gMaw, parent, [p[0], p[1] + up * w * .05, p[2] + l * .02]);
  for (let i = 0; i < n; i++) { const t = i / (n - 1), a = -1.1 + t * 2.2, x = Math.sin(a) * w * .42, z = Math.cos(a) * l * .44; spine(parent, [p[0] + x, p[1] + up * w * .06, p[2] + z], w * .22, w * .045, [up > 0 ? 0 : PI, 0, 0]); }
}

// ---------------------------------------------------------------- the cast
/** Worker: a squat six-legged grazer with a cap on its back and a belly that swells with ore cud. */
function grazer(): THREE.Group {
  const obj = new THREE.Group(), body = grp('body', obj);
  const legs = [[.22, .36], [-.04, .4], [-.28, .36]];
  legs.forEach(([z, r], i) => { for (const sx of [-1, 1]) bugLeg(obj, `lg${i}${sx < 0 ? 'L' : 'R'}`, [sx * .24, .4, z], sx, r, .4, z * .5 + .04, .062); });
  put(blob(.82, .58, 1.0, v => { if (v.y < 0) v.y *= .7; v.z += v.y * .1; }, 'gzb'), M.gH, body, [0, .5, -.04]);
  put(blob(.7, .4, .84), M.gV, body, [0, .36, -.02]);
  mushroom(body, [0, .7, -.12], .52, .34, [-.12, 0, 0], 1.1);
  sacs(body, [0, .82, -.42], 4, .08, 3);
  const pack = grp('pack', body); pack.visible = false; put(blob(.5, .36, .58), M.gS, pack, [0, .32, -.18]); for (let i = 0; i < 4; i++) put(shard(.06, .3, 5), M.ore, pack, [-.14 + i * .09, .74, -.5 + (i % 2) * .08], [-.7 + R(-.2, .2), R(0, 3), R(-.3, .3)]);
  const head = grp('head', body, [0, .5, .38]);
  put(blob(.46, .36, .42, v => { if (v.z > 0) v.y *= 1 - v.z * .3; }, 'gzh'), M.gHn, head, [0, .02, .08]);
  put(lathe(spl([[.2, 0], [.22, .06], [.17, .14], [0, .17]], 6), 16, PI * 1.3, 1.2), M.gBc, head, [0, .1, .06], [-.4, PI, 0]);
  // Grinding mouth plates, two stubby feelers, a pair of amber eyes.
  for (const sx of [-1, 1]) {
    put(plate(crescent(.16, .2, 1.5, .07), .05, .015), M.gBn, head, [sx * .07, -.08, .27], [H, 0, sx < 0 ? PI : 0]);
    put(blob(.1, .1, .08), M.gEye, head, [sx * .14, .1, .22], [0, sx * .4, 0]);
    put(tube([[sx * .08, .16, .2], [sx * .18, .34, .3], [sx * .26, .42, .48]], [.018, .014, .008], 5), M.gD, head); put(blob(.05, .05, .05), M.gS, head, [sx * .26, .42, .48]);
  }
  return obj;
}
/** Cheap fast biter that hatches in pairs: low, long, all jaw. */
function snapper(): THREE.Group {
  const obj = new THREE.Group(), body = grp('body', obj);
  for (const sx of [-1, 1]) { const n = sx < 0 ? 'L' : 'R'; bugLeg(obj, 'lg0' + n, [sx * .17, .44, .3], sx, .3, .44, .42, .065); bugLeg(obj, 'lg1' + n, [sx * .17, .44, -.26], sx, .34, .44, -.34, .075); }
  put(tube([[0, .58, .36], [0, .6, .05], [0, .56, -.3], [0, .46, -.66], [0, .36, -.98]], [.24, .27, .22, .12, .03], 10, .85), M.gH, body);
  put(tube([[0, .47, .32], [0, .46, -.3], [0, .38, -.6]], [.12, .14, .07], 8, .7), M.gV, body);
  plates(body, [0, .73, .3], [0, .5, -.76], 6, .36);
  for (let i = 0; i < 3; i++) put(blob(.08, .08, .08), M.gS, body, [(i % 2 ? .07 : -.07), .72 - i * .06, -.12 - i * .2]);
  // Gill frill around the neck.
  for (const sx of [-1, 1]) put(plate(crescent(.3, -.3, 1.6, .14), .03, .012), M.gG, body, [sx * .12, .66, .38], [0, sx * 1.2, sx * .5]);
  const head = grp('head', body, [0, .6, .48]);
  put(blob(.34, .3, .44, v => { if (v.y > 0) v.y *= .8; }, 'snh'), M.gHn, head, [0, .04, .06]);
  put(lathe(spl([[.17, 0], [.18, .06], [.12, .13], [0, .15]], 6), 14, PI * 1.2, 1.4), M.gBc, head, [0, .12, .02], [-.5, PI, 0]);
  jaw(head, [0, -.08, .2], .32, .42, 7, 1); jaw(head, [0, .0, .22], .3, .4, 7, -1);
  for (const sx of [-1, 1]) put(blob(.08, .07, .07), M.gEye, head, [sx * .11, .14, .2], [0, sx * .5, 0]);
  return obj;
}
/** Ranged: a hunched spitter with a fan of bone quills and a cap for a head. */
function quillback(): THREE.Group {
  const top = new THREE.Group(), obj = grp('sc', top), body = grp('body', obj); obj.scale.setScalar(1.22);
  for (const [i, z, r] of [[0, .3, .46], [1, -.3, .5]] as const) for (const sx of [-1, 1]) bugLeg(obj, `lg${i}${sx < 0 ? 'L' : 'R'}`, [sx * .26, .72, z], sx, r, .72, z * 1.1, .1);
  put(blob(.72, .66, 1.1, v => { v.y += v.z * .3; }, 'qbb'), M.gH, body, [0, .98, -.02]);
  put(blob(.56, .4, .9), M.gV, body, [0, .84, .02]);
  // Upper body rises like a cobra; a ring of gills where it turns.
  put(tube([[0, .98, .22], [0, 1.3, .36], [0, 1.6, .38]], [.27, .24, .2], 10, .9), M.gH, body);
  put(tube([[0, 1.1, .38], [0, 1.45, .5]], [.16, .13], 8, .7), M.gV, body);
  for (const sx of [-1, 1]) put(plate(crescent(.42, -.4, 1.8, .18), .035, .012), M.gG, body, [sx * .14, 1.48, .3], [0, sx * 1.1, sx * .3]);
  // Quill fan on the back: three rows, longest in the middle.
  for (let row = 0; row < 3; row++) for (let i = 0; i < 7; i++) { const a = (i - 3) * .26, l = (.95 - Math.abs(i - 3) * .1) * (1 - row * .2); spine(body, [Math.sin(a) * .2, 1.2 - row * .08, -.12 - row * .2], l, .045, [-.9 - row * .2, 0, -a * 1.4], M.gBn); }
  sacs(body, [0, 1.2, -.34], 5, .12, 7);
  const head = grp('head', body, [0, 1.64, .4]);
  mushroom(head, [0, .16, -.02], .3, .2, [-.3, 0, 0], 1.1);
  put(blob(.3, .3, .34), M.gHn, head, [0, .02, .06]);
  for (const sx of [-1, 1]) put(blob(.09, .08, .07), M.gEye, head, [sx * .1, .08, .2], [0, sx * .5, 0]);
  const arms = grp('arms', body, [0, 1.6, .5]);
  // The spit tube: a bone-ringed snout, and a muzzle flash where the quill leaves.
  put(tube([[0, -.06, -.02], [0, -.08, .2], [0, -.06, .38]], [.1, .085, .07], 8), M.gH, arms); for (const z of [.1, .22, .34]) put(ring(.08, .022), M.gB, arms, [0, -.07, z]);
  put(ring(.06, .02), M.gS, arms, [0, -.06, .4]);
  const f = grp('flash', arms, [0, -.06, .48]); mk(G.sph, M.gSpit, [0, 0, 0], [.3, .3, .3], 0, f); mk(G.oct, M.gSpit, [0, 0, .1], [.12, .12, .6], 0, f); f.visible = false; setLayer(f, L_FX);
  return top;
}
/** Suicide runner: a swollen lime sac on scuttling legs. Bursts into acid. */
function blister(): THREE.Group {
  const obj = new THREE.Group(), body = grp('body', obj);
  for (const [i, z] of [[0, .16], [1, -.04], [2, -.22]] as const) for (const sx of [-1, 1]) bugLeg(obj, `lg${i}${sx < 0 ? 'L' : 'R'}`, [sx * .17, .3, z], sx, .24, .3, z * .8, .045);
  put(blob(.4, .26, .5), M.gH, body, [0, .34, .02]);
  const sac = grp('halo', body, [0, .64, -.06]);
  put(blob(.76, .7, .8, v => { v.y += Math.sin(v.x * 9) * .02; }, 'blsac'), M.gS, sac);
  for (let i = 0; i < 5; i++) { const a = i / 5 * TAU; put(tube([[Math.cos(a) * .1, .34, Math.sin(a) * .1], [Math.cos(a) * .36, .08, Math.sin(a) * .36], [Math.cos(a) * .3, -.24, Math.sin(a) * .3]], [.022, .03, .012], 5), M.gD, sac); }
  put(lathe(spl([[.18, 0], [.16, .06], [0, .1]], 5), 12), M.gBc, sac, [0, .32, 0]);
  const head = grp('head', body, [0, .36, .28]);
  put(blob(.24, .2, .22), M.gHn, head); for (const sx of [-1, 1]) { put(blob(.06, .06, .05), M.gEye, head, [sx * .07, .05, .09]); spine(head, [sx * .06, -.06, .1], .1, .02, [H + .4, 0, 0]); }
  return obj;
}
/** Heavy: a six-legged tusked beetle the size of a truck, with an old cap grown over its shell. */
function mulcher(): THREE.Group {
  const obj = new THREE.Group(), body = grp('body', obj, [0, -.42, 0]);
  [[1.0, 1.5, 1.6], [-.1, 1.7, .1], [-1.1, 1.6, -1.6]].forEach(([z, r, f], i) => { for (const sx of [-1, 1]) { const l = bugLeg(obj, `lg${i}${sx < 0 ? 'L' : 'R'}`, [sx * .9, 1.25, z], sx, r, 1.25, f, .2); spine(l, [sx * r * .6, r * .3, f * .55], .7, .12, [0, 0, -sx * .5]); } });
  put(blob(2.6, 1.7, 3.6, v => { if (v.y < 0) v.y *= .6; v.y += Math.max(0, v.z) * .12; }, 'mlb'), M.gH, body, [0, 1.85, -.1]);
  put(blob(2.2, 1.0, 3.0), M.gV, body, [0, 1.36, 0]);
  plates(body, [0, 2.7, 1.1], [0, 2.1, -1.8], 6, 1.9);
  mushroom(body, [.1, 2.65, -.5], 1.15, .7, [-.18, 0, .08], 1.15);
  mushroom(body, [-.65, 2.45, -1.3], .48, .34, [-.3, 0, .5]); mushroom(body, [.7, 2.35, -1.45], .36, .26, [-.2, 0, -.6]);
  sacs(body, [.2, 2.4, .7], 6, .22, 11); sacs(body, [-.5, 2.2, -1.9], 4, .18, 5);
  for (const sx of [-1, 1]) for (let i = 0; i < 4; i++) put(plate(crescent(.5, -.2, 1.7, .2), .05, .015), M.gG, body, [sx * 1.0, 1.95 - i * .06, .6 - i * .5], [0, sx * 1.4, sx * .3]);
  const head = grp('head', body, [0, 1.85, 1.62]);
  put(blob(1.3, 1.0, 1.1, v => { if (v.z > 0) v.y *= 1 - v.z * .25; }, 'mlh'), M.gHn, head, [0, 0, .2]);
  put(lathe([...hard([[.66, -.02], [.7, 0]]), ...spl([[.68, .04], [.55, .3], [.25, .44], [0, .48]], 8)], 18, PI * 1.3, 1.25), M.gBc, head, [0, .2, .1], [-.5, PI, 0]);
  for (const sx of [-1, 1]) { put(blob(.2, .16, .14), M.gEye, head, [sx * .34, .2, .64], [0, sx * .5, 0]); put(blob(.12, .1, .1), M.gEye, head, [sx * .5, .05, .58], [0, sx * .7, 0]); }
  jaw(head, [0, -.32, .62], .7, .6, 7, 1);
  const arms = grp('arms', head, [0, -.1, .5]);
  // Two great raking tusks that sweep up and out.
  for (const sx of [-1, 1]) {
    put(tube([[sx * .4, 0, 0], [sx * .8, -.3, .5], [sx * .95, -.1, 1.2], [sx * .7, .4, 1.8]], [.2, .18, .12, .02], 10), M.gB, arms);
    for (const t of [.25, .5]) put(ring(.19 - t * .1, .035), M.gD, arms, [sx * (.5 + t * .5), -.24 + t * .1, .3 + t * .9], [H - .4, 0, 0]);
  }
  return obj;
}

export const GLOAM_UNITS: Record<string, () => THREE.Group> = { grazer, snapper, quillback, blister, mulcher };
export const GLOAM_HEIGHT: Record<string, number> = { grazer: 1.0, snapper: .9, quillback: 2.0, blister: 1.0, mulcher: 3.2 };

// ---------------------------------------------------------------- structures
/** A thick root running over the ground from `a` to `b`. */
function root(g: THREE.Object3D, a: P3, b: P3, r: number) { const m: P3 = [(a[0] + b[0]) / 2 + R(-.4, .4), Math.max(a[1], b[1]) + r * .6, (a[2] + b[2]) / 2 + R(-.4, .4)]; put(tube([a, m, b], [r, r * .8, r * .2], 8), M.gD, g); }
/** Mother Cap: the base. A huge mushroom over a lumpy stalk, Buds growing round its foot. */
export function mothercap(anim: ((t: number) => void)[]) {
  const g = new THREE.Group();
  put(blob(9, 2.2, 7.4, v => { if (v.y < 0) v.y = 0; v.y *= 1 + Math.sin(v.x * 7 + v.z * 5) * .08; }, 'mcbase'), M.gHn, g, [0, 0, 0]);
  put(lathe(spl([[2.4, 0], [2.1, 1.6], [1.6, 3.4], [1.8, 5], [2.4, 6.2]], 12), 20), M.gH, g);
  for (let i = 0; i < 7; i++) { const a = i / 7 * TAU + .3; put(tube([[Math.cos(a) * 1.8, 5.6, Math.sin(a) * 1.8], [Math.cos(a) * 2.2, 3, Math.sin(a) * 2.2], [Math.cos(a) * 3.6, .4, Math.sin(a) * 3]], [.3, .38, .5], 8), M.gD, g); }
  const top = mushroom(g, [0, 6.2, 0], 6.2, 3.6, [0, 0, .05], 1);
  sacs(top, [0, 3.0, 0], 8, .8, 21);
  for (let i = 0; i < 10; i++) { const a = i / 10 * TAU; put(blob(.4, .55, .4), M.gS, g, [Math.cos(a) * 5.7, 5.6, Math.sin(a) * 5.7]); }
  for (let i = 0; i < 6; i++) { const a = i / 6 * TAU + .5; root(g, [Math.cos(a) * 3.5, .4, Math.sin(a) * 2.8], [Math.cos(a) * 8.5, 0, Math.sin(a) * 6.5], .45); }
  // Bone ribs where the stalk meets the ground, and a ring of gill frills.
  for (let i = 0; i < 8; i++) { const a = i / 8 * TAU; spine(g, [Math.cos(a) * 2.6, .8, Math.sin(a) * 2.4], 2.4, .3, [Math.sin(a) * .7, 0, -Math.cos(a) * .7]); }
  // The Bud pods: Gloam units ripen in these. Each one is its own group so the game can show how many are ready.
  for (let i = 0; i < 4; i++) {
    const a = i / 4 * TAU + PI / 4, b = grp('bud' + i, g, [Math.cos(a) * 4.2, .9, Math.sin(a) * 3.4]); b.userData.dyn = true;
    put(blob(1.2, 1.5, 1.2, v => { v.y += Math.max(0, v.y) * .3; }, 'bud'), M.gS, b, [0, .5, 0]); put(lathe(spl([[.5, 0], [.62, .3], [.45, .55], [0, .6]], 6), 14), M.gHn, b, [0, -.2, 0]);
    for (let k = 0; k < 4; k++) { const q = k / 4 * TAU; put(plate(crescent(.62, -.4, 1.2, .2), .04, .012), M.gH, b, [Math.cos(q) * .3, .3, Math.sin(q) * .3], [0, -q + H, 0]); }
  }
  anim.push(t => { top.rotation.y = Math.sin(t * .3) * .03; top.scale.y = 1 + Math.sin(t * 1.1) * .02; });
  return g;
}
/** Spore Sac: supply. A ribbed bulb that breathes. */
export function sporesac(anim: ((t: number) => void)[]) {
  const g = new THREE.Group();
  put(blob(4.6, 1.2, 4.2, v => { if (v.y < 0) v.y = 0; }, 'ssb'), M.gHn, g);
  const bulb = grp('bulb', g, [0, .4, 0]);
  put(blob(3.6, 3.8, 3.4, v => { v.y += Math.max(0, v.y) * .25; v.x *= 1 + Math.sin(Math.atan2(v.z, v.x) * 6) * .06; }, 'ssbulb'), M.gH, bulb, [0, 1.9, 0]);
  for (let i = 0; i < 6; i++) { const a = i / 6 * TAU; put(tube([[Math.cos(a) * .4, 3.9, Math.sin(a) * .4], [Math.cos(a) * 1.85, 2.4, Math.sin(a) * 1.7], [Math.cos(a) * 1.6, .3, Math.sin(a) * 1.5]], .14, 6), M.gB, bulb); }
  for (const [x, z, r] of [[.6, .4, .5], [-.5, .6, .38], [0, -.7, .45]]) { put(lathe(spl([[r, 0], [r * .9, .4], [r * .55, .5]], 5), 12), M.gD, bulb, [x, 3.7, z]); put(blob(r, r * .4, r), M.gS, bulb, [x, 4.15, z]); }
  sacs(bulb, [0, 1.2, 1.5], 4, .4, 9);
  anim.push(t => { const k = 1 + Math.sin(t * 1.6) * .04; bulb.scale.set(k, 1 / k, k); });
  return g;
}
/** Warren: a burrow mound pocked with holes and propped with bone. Snappers come from here. */
export function warren(anim: ((t: number) => void)[]) {
  const g = new THREE.Group();
  put(blob(7.4, 4.2, 6, v => { if (v.y < 0) v.y = 0; v.y *= 1 + Math.sin(v.x * 5) * Math.cos(v.z * 4) * .12; }, 'wmound'), M.gH, g);
  for (const [x, y, z, r] of [[1.8, 1.2, 2.0, .7], [-1.6, 1.5, 1.8, .55], [0, 2.4, 1.4, .5], [2.5, 1.0, -1.2, .6], [-2.3, 1, -1.4, .55]]) {
    const a = Math.atan2(x, z); put(ring(r, r * .3, .7), M.gD, g, [x, y, z], [0, a, 0]); put(blob(r * 1.6, r * 1.5, r * .4), M.gMaw, g, [x * .97, y, z * .97], [0, a, 0]);
  }
  for (let i = 0; i < 9; i++) { const a = i / 9 * TAU + .2; spine(g, [Math.cos(a) * 3.0, .3, Math.sin(a) * 2.4], 2.4 + (i % 3) * .5, .22, [Math.sin(a) * .5, 0, -Math.cos(a) * .5]); }
  mushroom(g, [-1, 3.6, -.6], 1.1, .7, [.1, 0, .2]); mushroom(g, [1.2, 3.1, -1.4], .7, .5, [-.2, 0, -.3]);
  sacs(g, [0, 3.8, .2], 5, .3, 13);
  return g;
}
/** Quill Garden: bone spines grown in rows out of a moss bed. Quillbacks, first research. */
export function quillgarden(anim: ((t: number) => void)[]) {
  const g = new THREE.Group();
  put(blob(7.2, 1.8, 6.2, v => { if (v.y < 0) v.y = 0; }, 'qgb'), M.gHn, g);
  for (let i = 0; i < 16; i++) { const a = i / 16 * TAU, d = 1.2 + (i % 3) * .9, l = 3.2 + (i % 4) * 1.1 - d * .4; spine(g, [Math.cos(a) * d, .4, Math.sin(a) * d * .85], l, .26, [Math.sin(a) * .35, 0, -Math.cos(a) * .35]); }
  spine(g, [0, .4, 0], 6.4, .46, 0);
  for (const [x, z] of [[2.4, 1.4], [-2.2, 1.8], [-1.8, -1.9], [2.2, -1.6]]) { put(blob(1.1, 1.3, 1.1), M.gS, g, [x, .9, z]); put(lathe(spl([[.6, 0], [.7, .4], [.4, .8]], 5), 12), M.gD, g, [x, 0, z]); }
  for (let i = 0; i < 5; i++) { const a = i / 5 * TAU + .6; put(plate(crescent(1.1, -.3, 1.4, .4), .06, .02), M.gG, g, [Math.cos(a) * .5, 1.4 + i * .5, Math.sin(a) * .5], [0, -a, 0]); }
  return g;
}
/** Blister Bed: a dish of swelling acid sacs. */
export function blisterbed(anim: ((t: number) => void)[]) {
  const g = new THREE.Group();
  put(lathe(spl([[0, 1.0], [2.6, .9], [3.4, 1.4], [3.6, .6], [3.2, 0]], 10), 22), M.gH, g);
  const pods: THREE.Object3D[] = [];
  for (const [x, z, r] of [[0, 0, 1.6], [1.6, .8, 1.1], [-1.4, 1.0, 1.0], [-1.0, -1.4, 1.2], [1.3, -1.3, .9], [0, 2.0, .8]]) { const p = grp('pod', g, [x, 1.0 + r * .4, z]); put(blob(r * 1.6, r * 1.4, r * 1.6), M.gS, p); put(lathe(spl([[r * .3, r * .62], [r * .24, r * .72], [0, r * .74]], 4), 10), M.gBc, p); pods.push(p); }
  for (let i = 0; i < 8; i++) { const a = i / 8 * TAU; put(tube([[Math.cos(a) * 3.3, 1.4, Math.sin(a) * 3.3], [Math.cos(a) * 3.8, .8, Math.sin(a) * 3.8], [Math.cos(a) * 4.2, 0, Math.sin(a) * 4.2]], [.2, .18, .06], 6), M.gD, g); }
  anim.push(t => pods.forEach((p, i) => { const k = 1 + Math.sin(t * 2 + i * 1.7) * .05; p.scale.set(k, 1 / k, k); }));
  return g;
}
/** Tusk Hollow: a giant ribcage den. Mulchers, second research. */
export function tuskhollow(anim: ((t: number) => void)[]) {
  const g = new THREE.Group();
  put(blob(9.4, 2.4, 7.4, v => { if (v.y < 0) v.y = 0; }, 'thb'), M.gHn, g);
  for (let i = 0; i < 5; i++) { const z = -2.6 + i * 1.3, h = 5.6 - Math.abs(i - 2) * .6; for (const sx of [-1, 1]) put(tube([[sx * 3.6, .2, z], [sx * 3.6, h * .6, z], [sx * 1.6, h, z * .9], [sx * .2, h + .3, z * .8]], [.42, .36, .28, .16], 10), M.gB, g); }
  put(tube([[0, 5.6, -3.2], [0, 6.1, 0], [0, 5.4, 3.2]], .4, 10), M.gB, g);
  put(blob(4.6, 3.2, 5.4), M.gD, g, [0, 1.2, 0]); sacs(g, [0, 2.4, .8], 7, .7, 17);
  for (const sx of [-1, 1]) put(tube([[sx * 1.4, .6, 3.4], [sx * 2.6, 1.4, 4.6], [sx * 2.4, 3.2, 5.4], [sx * 1.4, 4.2, 5.0]], [.55, .48, .3, .04], 10), M.gB, g);
  mushroom(g, [2.6, 5.0, -2.0], .9, .6, [0, 0, -.4]);
  return g;
}
/** Old Growth: a branching tree of fungus. Third research. */
export function oldgrowth(anim: ((t: number) => void)[]) {
  const g = new THREE.Group();
  put(blob(6.4, 2, 6.4, v => { if (v.y < 0) v.y = 0; }, 'ogb'), M.gHn, g);
  put(tube([[0, 0, 0], [.4, 3, .2], [-.2, 6, 0], [.2, 9, -.2]], [1.4, 1.0, .8, .5], 10), M.gH, g);
  const caps: THREE.Object3D[] = [];
  for (const [y, a, l, r] of [[3.4, .4, 2.6, 1.2], [5.2, 2.6, 2.2, 1.0], [6.8, 4.4, 2.0, .9], [8.2, 1.4, 1.6, .8]]) {
    const ex = Math.cos(a) * l, ez = Math.sin(a) * l; put(tube([[0, y, 0], [ex * .6, y + .5, ez * .6], [ex, y + 1.1, ez]], [.42, .3, .2], 8), M.gH, g); caps.push(mushroom(g, [ex, y + 1.1, ez], r, r * .6));
  }
  caps.push(mushroom(g, [.2, 9.2, -.2], 1.8, 1.1));
  sacs(g, [0, 1.6, 1.2], 6, .5, 23);
  for (let i = 0; i < 5; i++) { const a = i / 5 * TAU; root(g, [Math.cos(a) * 1, .3, Math.sin(a) * 1], [Math.cos(a) * 4, 0, Math.sin(a) * 4], .4); }
  anim.push(t => caps.forEach((c, i) => { c.rotation.z = Math.sin(t * .8 + i) * .05; }));
  return g;
}
/** Stinger Stalk: defence. A tall stalk with a curled stinger that whips at anything close. */
export function stinger(anim: ((t: number) => void)[]) {
  const g = new THREE.Group();
  put(blob(3.2, 1.2, 3.2, v => { if (v.y < 0) v.y = 0; }, 'stb'), M.gHn, g);
  put(tube([[0, 0, 0], [.2, 2.4, 0], [-.1, 4.8, .1], [0, 6.4, 0]], [.7, .5, .42, .36], 10), M.gH, g);
  for (let i = 0; i < 4; i++) put(ring(.5 - i * .04, .1), M.gB, g, [0, 1.4 + i * 1.2, 0], [H, 0, 0]);
  const tip = grp('tip', g, [0, 6.4, 0]);
  put(tube([[0, 0, 0], [0, .9, .3], [0, 1.4, 1.1], [0, 1.1, 1.8]], [.36, .3, .2, .12], 10), M.gH, tip);
  for (let i = 0; i < 4; i++) put(lathe(spl([[.3 - i * .04, 0], [.28 - i * .04, .14], [0, .2]], 4), 10, PI * 1.2), M.gBc, tip, [0, .3 + i * .32, .1 + i * .3], [-.6 - i * .3, PI, 0]);
  spine(tip, [0, 1.1, 1.8], .9, .12, [H + .8, 0, 0]); put(blob(.5, .5, .5), M.gS, tip, [0, .1, -.1]);
  anim.push(t => { tip.rotation.x = Math.sin(t * 1.3) * .12; tip.rotation.y = Math.sin(t * .7) * .3; });
  return g;
}
export const GLOAM_BUILDINGS: Record<string, (anim: ((t: number) => void)[]) => THREE.Group> = { mothercap, sporesac, warren, quillgarden, blisterbed, tuskhollow, oldgrowth, stinger };
export { capsule, warp };

/** A patch of Bloom, the living carpet: a ragged disc of radius `rad` with a dark rim and root threads running past its edge. The game scales the `grow` group from small to 1 as it spreads. */
export function bloomPatch(seed: number, rad: number) {
  const g = new THREE.Group(), grow = grp('grow', g), n = 64;
  let s = seed * 7919 + 13; const rr = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
  const k = [rr() * 6, rr() * 6, rr() * 6], edge = (a: number) => .88 + Math.sin(a * 3 + k[0]) * .06 + Math.sin(a * 7 + k[1]) * .04 + Math.sin(a * 13 + k[2]) * .025;
  const disc = (scale: number, mat: THREE.Material, y: number) => {
    const pos: number[] = [0, y, 0], uv: number[] = [0, 0], idx: number[] = [];
    for (let i = 0; i <= n; i++) { const a = i / n * TAU, r = edge(a) * rad * scale; pos.push(Math.cos(a) * r, y, Math.sin(a) * r); uv.push(1, 0); if (i) idx.push(0, i + 1, i); }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); geo.setIndex(idx); geo.computeVertexNormals();
    const m = new THREE.Mesh(geo, mat); m.name = 'bloom'; grow.add(m); return m;
  };
  // one sheet, a little oversize: the shader frays its lip. uv.x runs 0 at the middle to 1 at the lip
  disc(1.1, M.gBloom, .006);
  // Lime spore buds dotted near the rim.
  for (let i = 0; i < Math.round(4 + rad * .6); i++) { const a = rr() * TAU, e = edge(a) * rad * (.55 + rr() * .4), k = .18 + rr() * .2; put(blob(k, k * .7, k), M.gS, grow, [Math.cos(a) * e, .04, Math.sin(a) * e]); }
  return g;
}

// ---------------------------------------------------------------- first person
/** What a player sees as a Gloam body: a pair of mandibles, claws or tusks either side of the view, plus a spit snout for the Quillback. `L` and `R` snap shut on a bite. */
export function vmGloam(kind: string, bake: (g: THREE.Group) => THREE.Group, L_VM: number) {
  const g = new THREE.Group(), big = kind === 'mulcher', s = big ? 1.5 : kind === 'grazer' ? .8 : 1;
  for (const sx of [-1, 1]) {
    const side = grp(sx < 0 ? 'L' : 'R', g, [sx * .3 * s, -.2 * s, -.3]);
    if (big) {
      put(tube([[0, -.1, .2], [sx * .08, -.12, -.25], [-sx * .02, .02, -.7], [-sx * .2, .2, -.9]], [.12, .11, .07, .01], 10), M.gB, side);
      for (const t of [.2, .45]) put(ring(.11 - t * .06, .025), M.gD, side, [sx * .05, -.1 + t * .1, -.2 - t * .8], [-.2, 0, 0]);
    } else if (kind === 'quillback') {
      put(tube([[0, -.12, .2], [sx * .04, -.08, -.1], [-sx * .03, -.06, -.26]], [.06, .05, .03], 8), M.gH, side);
      spine(side, [-sx * .03, -.06, -.26], .14, .025, [-H - .3, 0, sx * .6]);
    } else {
      // Mandible: a curved bone hook with teeth on its inner edge.
      put(tube([[0, -.1, .15], [sx * .05, -.06, -.12], [-sx * .03, -.02, -.36], [-sx * .13, 0, -.44]], [.06, .055, .035, .006], 9), kind === 'blister' ? M.gH : M.gB, side);
      for (let i = 0; i < 3; i++) spine(side, [-sx * (.0 + i * .03), -.04, -.14 - i * .1], .06, .014, [0, 0, sx * H]);
      put(blob(.14, .12, .2), M.gHn, side, [0, -.12, .12]);
    }
  }
  if (kind === 'quillback') {
    const sn = grp('snout', g, [0, -.2, -.3]);
    put(tube([[0, -.05, .35], [0, -.02, 0], [0, .0, -.32]], [.1, .085, .07], 9), M.gH, sn); for (const z of [.1, -.06, -.22]) put(ring(.082, .02), M.gB, sn, [0, -.01, z]);
    put(ring(.062, .02), M.gS, sn, [0, 0, -.34]);
  }
  if (kind === 'blister') put(lathe(spl([[.6, -.2], [.5, .05], [.2, .14]], 6), 20, PI * .9), M.gS, g, [0, -.55, -.35], [-.3, 0, 0]);
  if (kind === 'grazer') sacs(g, [0, -.3, -.4], 3, .04, 2);
  const flash = grp('flash', g, kind === 'quillback' ? [0, -.2, -.7] : [0, -.18, -.75]); mk(G.sph, M.gSpit, [0, 0, 0], [.14, .14, .14], 0, flash); mk(G.oct, M.gSpit, [0, 0, -.06], [.05, .05, .3], 0, flash); flash.visible = false;
  bake(g); setLayer(g, L_VM); setLayer(flash, L_FX);
  g.userData.flash = flash; g.userData.L = g.getObjectByName('L'); g.userData.R = g.getObjectByName('R'); g.userData.rest = [0, -.02, -.1, 0, 0, 0];
  return g;
}

/** Walk cycle for the many-legged: legs in two alternating tripods, lifting and swinging forward. Call once a frame per Gloam body. */
export function poseLegs(obj: THREE.Object3D, phase: number, moving: boolean, ease: number) {
  const legs: THREE.Object3D[] = obj.userData.legs || (obj.userData.legs = (() => { const out: THREE.Object3D[] = []; obj.traverse(o => { if (/^lg\d[LR]$/.test(o.name)) out.push(o); }); return out; })());
  for (const l of legs) {
    const i = +l.name[2], side = l.name[3] === 'L' ? 0 : 1, odd = (i + side) % 2, s = Math.sin(phase + odd * PI) * (moving ? 1 : 0);
    const sx = side ? 1 : -1, lift = Math.max(0, s) * .45;
    l.rotation.y += (s * .38 - l.rotation.y) * ease; l.rotation.z += (sx * lift * .6 - l.rotation.z) * ease;
  }
}
