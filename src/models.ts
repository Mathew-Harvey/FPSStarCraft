// Structures, scenery, first-person view-models and the unit atlas. Everything is sculpted in code
// (see sculpt.ts and skins.ts) so the whole game ships as code. Models are baked (sibling meshes merged per material) so a unit
// costs a handful of draw calls, and units are cloned from one prototype per kind.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { G, M, R, rnd, reseed, mk, beam, setLayer, L_FX, L_VM, holoLine, V3, toonMaterial } from './gfx';
import type { Prop } from './data';
import { MAP, OUTPOST, ROAD, NORTH_PATH, SIDE, roadPt, veylPt } from './data';
import { NEW, grp, put, can, nv } from './units';
import { GLOAM_UNITS, GLOAM_HEIGHT, GLOAM_BUILDINGS, vmGloam } from './gloam-art';
/** A Gloam body's first-person mandibles, tusks or snout. */
export const vmG = (k: string) => vmGloam(k, bake, L_VM);
export const gloamB = (k: string, anim: ((t: number) => void)[]) => bake(GLOAM_BUILDINGS[k](anim));   // baked here so a sculpt's shared geometry is copied before the atlas rewrites it
import { lathe, hard, spl, capsule, rbox, blob, nub, rod, blade, tube, plate, rrect, ring, shard, slab, warp, crag, boulder } from './sculpt';
import { figure } from './meshes';
import { buildTerrain } from './terrain-art';
import { near as nearGround, h as groundH } from './terrain';
export { brighten } from './terrain-art';

export interface Rig { body: THREE.Object3D; head?: THREE.Object3D; arms?: THREE.Object3D; armL?: THREE.Object3D; armR?: THREE.Object3D; legL?: THREE.Object3D; legR?: THREE.Object3D; flash?: THREE.Object3D; halo?: THREE.Object3D; pack?: THREE.Object3D; height: number }
export interface Model { obj: THREE.Group; rig: Rig }
type P3 = [number, number, number];

/** Merges sibling meshes that share a material. Groups are kept, so anything animated should be its own group (or flagged userData.dyn). */
export function bake<T extends THREE.Object3D>(root: T): T {
  const by = new Map<THREE.Material, { g: THREE.BufferGeometry[]; mask: number }>(); const rm: THREE.Object3D[] = [];
  for (const c of [...root.children]) {
    const m = c as THREE.Mesh;
    if (m.isMesh && !c.userData.dyn && !c.children.length && !Array.isArray(m.material)) {
      c.updateMatrix(); const g = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone(); g.applyMatrix4(c.matrix);
      for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'uv' && k !== 'aEm' && k !== 'aWear') g.deleteAttribute(k);
      let e = by.get(m.material); if (!e) by.set(m.material, e = { g: [], mask: c.layers.mask }); e.g.push(g); rm.push(c);
    } else if (c.children.length) bake(c);
  }
  for (const c of rm) root.remove(c);
  for (const [mat, e] of by) {
    // sculpted parts carry their creases in aEm before they reach the atlas; plain parts merged with them get a blank one
    if (e.g.some(g => g.attributes.aEm) && !e.g.every(g => g.attributes.aEm)) for (const g of e.g) if (!g.attributes.aEm) g.setAttribute('aEm', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count), 1));
    const mesh = new THREE.Mesh(e.g.length > 1 ? mergeGeometries(e.g) : e.g[0], mat); mesh.layers.mask = e.mask; root.add(mesh); }
  return root;
}
// ---------------------------------------------------------------- unit texture atlas
// Every unit material is copied into one shared texture so that a whole limb is a single draw call.
const CELL = 320, PAD = 12, COLS = 12, ROWS = 8;
let atlas: { ctx: CanvasRenderingContext2D; tex: THREE.CanvasTexture; mat: THREE.ShaderMaterial; cells: Map<THREE.Material, number> } | null = null;
function atlasCell(m: THREE.ShaderMaterial) {
  if (!atlas) { const c = document.createElement('canvas'); c.width = CELL * COLS; c.height = CELL * ROWS; const tex = new THREE.CanvasTexture(c); tex.anisotropy = 4; atlas = { ctx: c.getContext('2d')!, tex, mat: toonMaterial(tex), cells: new Map() }; atlas.mat.uniforms.uShine.value = 0; /* each part brings its own shine, packed beside its glow in aEm */ }
  let i = atlas.cells.get(m); if (i !== undefined) return i;
  i = atlas.cells.size; if (i >= COLS * ROWS) return -1; atlas.cells.set(m, i);
  const g = atlas.ctx, x = (i % COLS) * CELL, y = Math.floor(i / COLS) * CELL, img = (m.uniforms.uMap.value as THREE.Texture).image as HTMLCanvasElement;
  g.globalCompositeOperation = 'source-over'; g.fillStyle = '#fff'; g.fillRect(x, y, CELL, CELL); if (img && img.width > 4) { g.drawImage(img, x, y, CELL, CELL); g.drawImage(img, x + PAD, y + PAD, CELL - PAD * 2, CELL - PAD * 2); }
  g.globalCompositeOperation = 'multiply'; g.fillStyle = '#' + (m.uniforms.uColor.value as THREE.Color).getHexString(); g.fillRect(x, y, CELL, CELL); g.globalCompositeOperation = 'source-over';
  atlas.tex.needsUpdate = true; return i;
}
/** Moves every plain toon mesh under `root` onto the shared atlas material, then merges each group down to one mesh. */
export function atlasify<T extends THREE.Object3D>(root: T): T {
  const plain = new Set<THREE.Material>(Object.values(M));
  root.traverse(o => {
    const m = o as THREE.Mesh, mat = m.material as THREE.ShaderMaterial; if (!m.isMesh || o.userData.dyn || !plain.has(mat) || mat.side !== THREE.FrontSide || (o.layers.mask & 1) === 0) return;
    const u = mat.uniforms; if (u.uRep.value.x !== 1 || u.uRep.value.y !== 1 || u.uHatch.value !== 1 || u.uFlat.value !== 0) return;
    const i = atlasCell(mat); if (i < 0) return;
    const geo = m.geometry, uv = geo.attributes.uv as THREE.BufferAttribute, n = uv.count, em = new Float32Array(n).fill(Math.min(1, u.uEmis.value) + 2 * Math.round(u.uShine.value * 10)), cx = i % COLS, cy = Math.floor(i / COLS), k = (CELL - PAD * 2) / CELL;
    for (let j = 0; j < n; j++) { const a = Math.min(1, Math.max(0, uv.getX(j))), b = Math.min(1, Math.max(0, uv.getY(j))); uv.setXY(j, (cx + PAD / CELL + a * k) / COLS, 1 - (cy + PAD / CELL + (1 - b) * k) / ROWS); }
    const was = geo.attributes.aEm as THREE.BufferAttribute | undefined; if (was) for (let j = 0; j < n; j++) em[j] += was.getX(j);
    uv.needsUpdate = true; geo.setAttribute('aEm', new THREE.BufferAttribute(em, 1)); m.material = atlas!.mat;
  });
  return bake(root);
}

const MAKERS: Record<string, () => THREE.Group> = { ...NEW, ...GLOAM_UNITS };
const HEIGHT: Record<string, number> = { tender: 1.9, rigger: 1.55, linesman: 1.6, breacher: 1.8, longshot: 1.6, patch: 1.6, gantry: 3.3, cantor: 2.3, lancer: 2.2, warden: 4.4, ...GLOAM_HEIGHT };
const protos: Record<string, THREE.Group> = {};
/** A fresh copy of a unit model. Geometry is shared between copies. */
export const atlasUsed = () => atlas ? atlas.cells.size : 0;
export function unit(kind: string): Model {
  const proto = protos[kind] || (protos[kind] = atlasify(bake(MAKERS[kind]())));
  const obj = proto.clone(true); const f = (n: string) => obj.getObjectByName(n);
  return { obj, rig: { body: f('body')!, head: f('head'), arms: f('arms'), armL: f('armL'), armR: f('armR'), legL: f('legL'), legR: f('legR'), flash: f('flash'), halo: f('halo'), pack: f('pack'), height: HEIGHT[kind] } };
}

// ---------------------------------------------------------------- structures
/** A round strut between two points. */
const tb = (a: P3, b: P3, r: number, mat: THREE.Material, g: THREE.Object3D, seg = 8) => put(tube([a, b], r, seg), mat, g);
/** A lit window: dark frame, warm glass. */
function win(g: THREE.Object3D, p: P3, w: number, h: number, ry = 0) { put(plate(rrect(w + .24, h + .24, .08), .16, .04), M.gunm, g, p, [0, ry, 0]); put(plate(rrect(w, h, .05), .2, .02), M.visG, g, p, [0, ry, 0]); }
/** A run of pipe with flanged joints. */
function pipe(g: THREE.Object3D, pts: P3[], r: number, mat: THREE.Material = M.bD) { put(tube(pts, r, 8), mat, g); for (const q of [pts[0], pts[pts.length - 1]]) put(blob(r * 3, r * 3, r * 3), M.nS, g, q); }
export function headframe(anim: ((t: number) => void)[]) {
  const fig = figure('headframe'), g = fig ? fig.root : new THREE.Group();
  if (!fig) { put(slab(13, .24, 9, 3, .05), M.conc, g, [0, .12, 0]); }
  if (!fig) { put(slab(10, 4.4, 7, 2.5, .14), M.wallS, g, [0, 2.3, 0]); }
  if (!fig) { put(slab(10.2, .7, 7.2, 1.3, .08), M.haz, g, [0, 4.1, 0]); put(slab(10.5, .4, 7.5, 3, .1), M.wallD, g, [0, 4.7, 0]); }
  put(plate(rrect(3.2, 3, .12), .2, .05), M.doorP, g, [1.6, 1.6, 3.5]); put(slab(3.8, .36, .3, 1.9, .06), M.pY, g, [1.6, 3.3, 3.56]);
  for (const sx of [-1, 1]) put(slab(.3, 3.1, .3, 3, .06), M.pY, g, [1.6 + sx * 1.75, 1.6, 3.56]);
  win(g, [-2.7, 2.7, 3.5], 1.7, .8); win(g, [-2.7, 1.3, 3.5], 1.7, .8);
  poster(g, [-.95, 2.75, 3.53], 0, .85, 1.12, M.post2, .04); poster(g, [-1.05, 1.5, 3.53], 0, .7, .92, M.post1, -.06); poster(g, [4.3, 1.55, 3.53], 0, .8, 1.05, M.post3, .05); poster(g, [5.03, 2.0, 1.5], H2, .8, 1.05, M.post4, .04);
  if (!fig) { for (let i = 0; i < 2; i++) { const x = -3.2 + i * 6.4; put(can(1.2, 1.6, .08), M.bS, g, [x, 5.6, -1.6]); put(lathe([...hard([[1.2, 0], [1.26, .04]]), ...spl([[1.24, .1], [1.0, .5], [.5, .76], [0, .82]], 8)], 20), M.cY, g, [x, 6.4, -1.6]); put(ring(1.21, .06), M.nD, g, [x, 5.3, -1.6], [H2, 0, 0]); } }
  if (!fig) { pipe(g, [[-3.2, 6.9, -1.6], [-3.2, 7.5, -1.6], [0, 7.5, -1.6], [3.2, 7.5, -1.6], [3.2, 6.9, -1.6]], .12); pipe(g, [[-4.6, 5.4, -1.6], [-5.3, 5.4, -1.6], [-5.3, 2.4, -1.6]], .14, M.bY); }
  const top = 14.2;
  if (!fig) { for (const sx of [-1, 1]) for (const sz of [-1, 1]) { tb([sx * 2.6, 4.8, sz * 2.2], [sx * .6, top, sz * .6], .17, M.bY, g); put(slab(.7, .3, .7, 1, .05), M.pD, g, [sx * 2.6, 4.95, sz * 2.2]); } }
  if (!fig) { for (const h of [.3, .6]) { const y = 4.8 + (top - 4.8) * h, w = 2.6 - 2 * h, d = 2.2 - 1.6 * h; tb([-w, y, d], [w, y, d], .1, M.bD, g); tb([-w, y, -d], [w, y, -d], .1, M.bD, g); tb([-w, y, d], [-w, y, -d], .1, M.bD, g); tb([w, y, d], [w, y, -d], .1, M.bD, g); } }
  if (!fig) { tb([-2.6, 4.8, 2.2], [1.6, 4.8 + (top - 4.8) * .3, 1.72], .08, M.bD, g); tb([2.0, 7.62, 1.72], [-1.4, 10.44, 1.24], .08, M.bD, g); tb([-2.6, 4.8, -2.2], [1.6, 7.62, -1.72], .08, M.bD, g); tb([2.0, 7.62, -1.72], [-1.4, 10.44, -1.24], .08, M.bD, g); }
  if (!fig) { put(slab(1.9, 1.0, 1.9, 2, .12), M.chest, g, [0, top + .3, 0]); put(slab(2.2, .16, 2.2, 2, .05), M.pD, g, [0, top + .88, 0]); }
  const wheel = new THREE.Group(); put(ring(1.8, .13, 1, 32), M.bD, wheel); put(ring(1.6, .05, 1, 32), M.nS, wheel); for (let i = 0; i < 4; i++) put(rbox(3.4, .14, .12, .04), M.pD, wheel, 0, [0, 0, i * Math.PI / 4]); put(can(.32, .5, .04), M.bY, wheel, 0, [H2, 0, 0]);
  wheel.position.set(0, top + 1.4, 1.1); g.add(wheel); anim.push(t => { wheel.rotation.z = t * .5; });
  put(blob(.34, .34, .34), M.red, g, [0, top + 3.5, 0]); tb([0, top + .7, 0], [0, top + 3.4, 0], .05, M.nD, g, 6); tb([0, top + 1.4, 1.1], [0, top + 1.4, 0], .1, M.nD, g, 6);
  if (!fig) { put(can(.46, 3.4, .04), M.wallR, g, [3.4, 6.4, -2]); put(ring(.5, .09), M.nD, g, [3.4, 8.0, -2], [H2, 0, 0]); put(ring(.48, .06), M.nY, g, [3.4, 6.2, -2], [H2, 0, 0]); }
  for (let i = 0; i < 5; i++) { const p = mk(G.sph, M.smoke, [3.4, 9, -2], [1, 1, 1], 0, g); p.userData.dyn = true; anim.push(t => { const k = ((t * .16 + i / 5) % 1); p.position.set(3.4 + k * 3.2 + Math.sin(i * 2.1) * .5, 8.6 + k * 7, -2 - k * 2); const s = .9 + k * 2.6; p.scale.set(s, s * .85, s); }); }
  put(plate(rrect(5.2, 1.4, .1), .2, .05), M.sign, g, [-1.4, 5.8, 3.3]); tb([-3.4, 4.9, 3.3], [-3.4, 5.2, 3.3], .08, M.nD, g, 6); tb([.6, 4.9, 3.3], [.6, 5.2, 3.3], .08, M.nD, g, 6);
  tb([5.6, 0, 4.2], [5.6, 6, 4.2], .1, M.bD, g); put(rbox(.9, .5, .4, .08), M.pD, g, [5.6, 6.1, 4.3], [.4, 0, 0]); put(plate(rrect(.74, .34, .04), .1, .02), M.visG, g, [5.6, 6.0, 4.48], [.4, 0, 0]);
  // Yard clutter against the walls: ladder, vent box, cable drops.
  for (const sx of [-1, 1]) tb([-4.3 + sx * .25, .2, 3.6], [-4.3 + sx * .25, 4.9, 3.6], .04, M.nD, g, 6); for (let i = 0; i < 9; i++) tb([-4.55, .6 + i * .5, 3.6], [-4.05, .6 + i * .5, 3.6], .03, M.nS, g, 5);
  put(rbox(1.4, 1.0, .6, .1), M.pD, g, [3.9, 3.0, 3.6]); for (let i = 0; i < 4; i++) put(rbox(1.1, .06, .08, .02), M.pS, g, [3.9, 2.7 + i * .2, 3.92]);
  put(tube([[4.9, 4.2, 3.6], [5.2, 2.6, 3.9], [5.6, 2.2, 4.2]], .04, 6), M.rib, g);
  return bake(g);
}
/** Quonset hut. Long axis along X, door on the +Z side. */
export function bunkhouse() {
  const fig = figure('bunkhouse'), g = fig ? fig.root : new THREE.Group();
  if (!fig) { put(slab(7.6, .2, 5.8, 3, .05), M.conc, g, [0, .1, 0]); }
  if (!fig) { mk(G.half, M.wallG, [0, .2, 0], [5.2, 7, 5.2], [0, 0, Math.PI / 2], g); }
  if (!fig) { for (const x of [-2.4, 0, 2.4]) put(lathe(hard([[2.6, -.07], [2.68, 0], [2.6, .07]]), 20, Math.PI), M.bD, g, [x, .2, 0], [0, 0, H2]); }
  if (!fig) { for (const sx of [-1, 1]) put(slab(.18, .8, 5.3, 2.6, .05), M.wallD, g, [sx * 3.52, .5, 0]); }
  put(plate(rrect(1.5, 2.1, .08), .16, .04), M.doorP, g, [3.56, 1.25, 0], [0, H2, 0]); put(slab(.2, .24, 1.9, 2, .05), M.pY, g, [3.6, 2.42, 0]); win(g, [3.6, 2.9, 0], .7, .3, H2);
  put(rbox(1.5, .9, .9, .1), M.pD, g, [1, 2.0, 2.2]); put(can(.3, .1), M.rib, g, [1, 2.0, 2.68], [H2, 0, 0]); put(ring(.3, .05), M.nS, g, [1, 2.0, 2.7]);
  tb([-2.2, 2.5, 0], [-2.2, 5.6, 0], .05, M.nD, g, 6); put(blob(.24, .24, .24), M.red, g, [-2.2, 5.7, 0]); tb([-2.8, 4.6, 0], [-1.6, 4.6, 0], .04, M.nD, g, 6);
  put(can(.16, 1.6), M.bD, g, [.2, 3.2, -1.2]); put(lathe(hard([[.16, 0], [.3, .08], [0, .3]]), 12), M.cD, g, [.2, 4.0, -1.2]);
  put(slab(1.0, 1.0, 1.0, 1, .07), M.wallR, g, [-2.6, .5, 2.2], [0, .3, 0]); put(slab(.7, .6, .7, 1, .06), M.wallY, g, [-2.5, 1.3, 2.3], [0, -.2, 0]);
  for (const [x, y, z] of [[2.4, .22, 2.5], [2.9, .22, 2.6], [2.65, .5, 2.55]]) put(blob(.7, .34, .44), M.fabT, g, [x, y, z], [0, x, 0]);
  return bake(g);
}
// ---------------------------------------------------------------- bolted on
// Ironhold builds nothing twice and takes nothing down. These are the parts every crew adds as it passes through: roofing iron on crooked
// poles, a shack on the roof, a tank on stilts, a patch over a hole, a board somebody lettered by hand, paper on any flat wall.
/** Empties a posed group into its parent, so the parts bake with everything else and cost no draw calls of their own. */
function melt(c: THREE.Object3D) { const p = c.parent!; c.updateMatrix(); for (const k of [...c.children]) { k.updateMatrix(); k.applyMatrix4(c.matrix); p.add(k); } p.remove(c); }
const bar = (a: P3, b: P3, r: number, mat: THREE.Material, g: THREE.Object3D) => put(rod(a, b, r), mat, g);
const posed = (g: THREE.Object3D, p: P3, r: P3 = [0, 0, 0]) => { const c = new THREE.Group(); c.position.set(p[0], p[1], p[2]); c.rotation.set(r[0], r[1], r[2]); g.add(c); return c; };
/** A sheet of roofing iron hung off a wall at `p`. It runs `w` along the wall and reaches `out` from it. `legs` stands it on two crooked poles that long; without them it hangs on stays. */
function awning(g: THREE.Object3D, p: P3, ry: number, w: number, out: number, mat: THREE.Material, legs = 0, drop = .4, tilt = .04) {
  const c = posed(g, p, [0, ry, tilt]), a = Math.atan2(drop, out), l = Math.hypot(drop, out);
  put(slab(w, .07, l, 1.6, .02), mat, c, [0, -drop / 2, out / 2], [a, 0, 0]);
  bar([-w / 2 - .06, -drop - .02, out], [w / 2 + .06, -drop - .02, out], .04, M.nD, c);
  for (const sx of [-1, 1]) { const x = sx * (w / 2 - .14); if (legs) bar([x + sx * .1, -legs, out - .16 + sx * .07], [x, -drop, out - .12], .05, M.wood, c); else bar([x, .55, .02], [x, -drop + .03, out - .1], .022, M.nD, c); }
  melt(c);
}
/** A lettered board, never quite level. `posts` stands it on two posts that far below its bottom edge with a prop behind; without them it hangs on two stays. */
function signboard(g: THREE.Object3D, p: P3, r: P3, w: number, h: number, mat: THREE.Material, posts = 0) {
  const c = posed(g, p, r);
  put(plate(rrect(w, h, .04), .08, .02), mat, c);
  for (const sx of [-1, 1]) { const x = sx * (w / 2 - .25); if (posts) { bar([x, -h / 2 - posts, -.09], [x + sx * .03, h / 2 - .1, -.09], .05, M.wood, c); bar([x, h * .2, -.12], [x - sx * .1, -h / 2 - posts, -.9], .035, M.wood, c); } else bar([x, h / 2, 0], [x - sx * .12, h / 2 + .5, -.03], .018, M.nD, c); }
  melt(c);
}
/** A sheet of paper pasted to a wall, a little squint. */
function poster(g: THREE.Object3D, p: P3, ry: number, w: number, h: number, mat: THREE.Material, rz = 0) { put(plate(rrect(w, h, .01, 1), .03, 0), mat, g, p, [0, ry, rz]); }
/** A patch riveted over a hole, in whatever plate was lying about. */
function patch(g: THREE.Object3D, p: P3, ry: number, w: number, h: number, mat: THREE.Material, rz = 0) {
  const c = posed(g, p, [0, ry, rz]); put(rbox(w, h, .05, .012), mat, c);
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) put(nub(.07, .07, .05), M.nS, c, [sx * (w / 2 - .07), sy * (h / 2 - .07), .03]);
  melt(c);
}
/** A stove pipe that was knocked once and never straightened, with a rain cap. */
function stovepipe(g: THREE.Object3D, p: P3, h: number, lean: number, r = .09) {
  const c = posed(g, p), k = h * .55, x1 = lean * k, x2 = x1 + lean * (h - k) * 2.2;
  put(tube([[0, 0, 0], [x1 * .6, k * .6, 0], [x1, k, 0], [x2, h, 0]], r, 7), M.bD, c);
  put(ring(r + .012, .022, 1, 10), M.nS, c, [x1, k, 0], [H2, 0, 0]);
  put(lathe(hard([[r * 2.1, 0], [r * 1.9, .03], [0, r * 1.6]]), 8), M.cD, c, [x2, h + .1, 0], [0, 0, -lean * 1.6]);
  for (const s of [-1, 1]) bar([x2 + s * r * .8, h - .02, 0], [x2 + s * r * 1.4, h + .1, 0], .012, M.nD, c);
  melt(c);
}
/** A cage lamp on a hook. */
function lamp(g: THREE.Object3D, p: P3, hang = .3) {
  bar([p[0], p[1] + hang, p[2]], [p[0], p[1] + .12, p[2]], .012, M.nD, g); put(lathe(hard([[.11, 0], [.09, .04], [0, .09]]), 8), M.cD, g, [p[0], p[1] + .08, p[2]]);
  put(nub(.15, .2, .15, undefined, '', 8, 6), M.visG, g, [p[0], p[1] - .02, p[2]]); put(ring(.08, .012, 1, 10), M.nD, g, [p[0], p[1] - .02, p[2]], [H2, 0, 0]);
}
/** A water tank on splayed legs. */
function stiltTank(g: THREE.Object3D, p: P3, r: number, h: number, legs: number, mat: THREE.Material, ry = 0) {
  const c = posed(g, p, [0, ry, .03]);
  put(can(r, h, .05), mat, c, [0, legs + h / 2, 0]); put(lathe(hard([[r + .03, 0], [r * .9, .08], [0, r * .5]]), 12), M.cD, c, [0, legs + h, 0]);
  for (const y of [.2, .8]) put(ring(r + .012, .03, 1, 14), M.nD, c, [0, legs + h * y, 0], [H2, 0, 0]);
  for (let i = 0; i < 4; i++) { const a = i * H2 + .78, a2 = a + H2, x = Math.cos(a), z = Math.sin(a); bar([x * r * 1.25, 0, z * r * 1.25], [x * r * .8, legs + .05, z * r * .8], .045, M.nD, c); bar([x * r * 1.2, .1, z * r * 1.2], [Math.cos(a2) * r * .85, legs - .05, Math.sin(a2) * r * .85], .02, M.nS, c); }
  bar([r * .7, legs + .1, 0], [r * .9, .3, .1], .03, M.bD, c);
  melt(c);
}
/** A line of washing between two points. */
function washline(g: THREE.Object3D, a: P3, b: P3, sag = .3) {
  put(tube([a, [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2 - sag, (a[2] + b[2]) / 2], b], .012, -3, 1, false, 6), M.nD, g);
  const mats = [M.fab, M.fabT, M.fabG, M.straw], ry = Math.atan2(-(b[2] - a[2]), b[0] - a[0]);
  for (let i = 0; i < 4; i++) { const t = .2 + i * .2, k = 4 * t * (1 - t), h = .34 + (i % 3) * .12; put(plate(rrect(.3 + (i % 2) * .12, h, .03, 1), .025, 0), mats[i], g, [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t - sag * k - h / 2 - .01, a[2] + (b[2] - a[2]) * t], [0, ry, (i - 1.5) * .05]); }
}
/** A stack of tyres. */
function tyres(g: THREE.Object3D, p: P3, n: number) { for (let i = 0; i < n; i++) put(ring(.33, .15, 1, 14), M.rib, g, [p[0] + Math.sin(i * 2.3) * .05, p[1] + .15 + i * .29, p[2] + Math.cos(i * 1.7) * .05], [H2, 0, 0]); }
/** A shipping container with door bars on one end. */
function container(g: THREE.Object3D, mat: THREE.Material, p: P3, ry: number) {
  const c = new THREE.Group(); c.position.set(p[0], p[1], p[2]); c.rotation.y = ry; g.add(c);
  put(slab(5, 2.3, 2.3, 2.5, .09), mat, c); for (const z of [-.5, .5]) { tb([2.54, -1.0, z], [2.54, 1.0, z], .035, M.nS, c, 6); put(rbox(.08, .12, .3, .02), M.pD, c, [2.56, 0, z]); }
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) put(rbox(.22, .22, .22, .04), M.pD, c, [sx * 2.42, sy * 1.07, sz * 1.07]);
}
export function depot() {
  const fig = figure('depot'), g = fig ? fig.root : new THREE.Group();
  if (!fig) { container(g, M.wallR, [0, 1.15, -1.2], 0); container(g, M.wallT, [.2, 1.15, 1.25], .06); container(g, M.wallY, [.1, 3.45, 0], -.12); }
  put(tube([[-2, 4.62, -.6], [0, 4.7, .9], [2.2, 4.62, -.5]], .05, 6), M.leaB, g); put(blob(1.6, .5, 1.2), M.fabT, g, [-.6, 4.7, .1]);
  // Lived in. The board hangs off the top box, the doors get a roof, and the top is somebody's yard.
  signboard(g, [-.3, 3.72, 1.17], [0, -.12, .045], 2.6, 1.08, M.signDep);
  awning(g, [2.58, 2.5, .1], H2, 3.6, 1.0, M.wallS, 0, .35, -.05); lamp(g, [3.42, 1.86, 1.2], .28);
  stiltTank(g, [1.45, 4.6, -.2], .5, .9, .7, M.wallT, .3); stovepipe(g, [-1.95, 4.6, .55], 1.5, .12);
  bar([2.3, 4.6, .9], [2.38, 6.5, .95], .03, M.nD, g); washline(g, [2.38, 6.2, .95], [-1.6, 5.75, .5], .45);
  put(can(.3, .8, .03), M.bY, g, [-1.9, 2.7, 1.9]); put(ring(.31, .03, 1, 12), M.nD, g, [-1.9, 2.85, 1.9], [H2, 0, 0]); put(slab(.8, .5, .6, 1, .05), M.wood, g, [-.9, 2.55, 1.9], [0, .3, 0]);
  put(blob(.7, .3, .36), M.fabT, g, [1.2, 2.45, 1.85], [0, .4, 0]); put(blob(.6, .28, .34), M.fabG, g, [1.75, 2.44, 2.05], [0, -.3, 0]); tyres(g, [-1.5, 2.3, -1.8], 3);
  poster(g, [-1.5, 1.3, 2.52], .06, .8, 1.05, M.post1, .05); poster(g, [-.55, 1.12, 2.47], .06, .7, .92, M.post3, -.07); patch(g, [1.3, 1.4, 2.36], .06, 1.0, .7, M.pD, .08);
  poster(g, [-2.54, 1.3, -1.2], -H2, .75, 1.0, M.post4, .04); patch(g, [-2.54, 3.5, .2], -H2, .9, .8, M.pS, -.06);
  for (const sx of [-1, 1]) bar([-2.15 + sx * .2, .05, 2.64], [-2.1 + sx * .2, 2.7, 2.56], .035, M.nD, g); for (let i = 0; i < 6; i++) bar([-2.34, .4 + i * .4, 2.62], [-1.92, .4 + i * .4, 2.62], .025, M.nS, g);
  return bake(g);
}
export function watchpost() {
  const fig = figure('watchpost'), g = fig ? fig.root : new THREE.Group();
  if (!fig) { for (const sx of [-1, 1]) for (const sz of [-1, 1]) { tb([sx * 1.2, 0, sz * 1.2], [sx * .9, 4.5, sz * .9], .1, M.bD, g); put(slab(.5, .2, .5, 1, .04), M.conc, g, [sx * 1.2, .1, sz * 1.2]); } }
  if (!fig) { for (const sz of [-1, 1]) { tb([-1.15, .8, sz * 1.15], [1.0, 3.6, sz * .95], .06, M.nD, g, 6); tb([1.15, .8, sz * 1.15], [-1.0, 3.6, sz * .95], .06, M.nD, g, 6); } }
  if (!fig) { for (const sx of [-1, 1]) { tb([sx * 1.15, .8, -1.15], [sx * .95, 3.6, 1.0], .06, M.nD, g, 6); } }
  if (!fig) { put(slab(2.9, .3, 2.9, 1.5, .06), M.wallS, g, [0, 4.6, 0]); }
  if (!fig) { for (const [x, z, w, d] of [[0, 1.4, 2.9, .16], [0, -1.4, 2.9, .16], [1.4, 0, .16, 2.9], [-1.4, 0, .16, 2.9]]) put(slab(w, .9, d, 1.45, .05), M.pY, g, [x, 5.2, z]); }
  if (!fig) { for (const sx of [-1, 1]) for (const sz of [-1, 1]) tb([sx * 1.3, 5.6, sz * 1.3], [sx * 1.3, 6.9, sz * 1.3], .06, M.nD, g, 6); }
  if (!fig) { put(lathe(hard([[2.5, 0], [2.45, .1], [0, 1.3]]), 4), M.wallR, g, [0, 6.85, 0], [0, Math.PI / 4, 0]); }
  for (const sx of [-1, 1]) tb([sx * .2 - 1.6, .2, 1.5], [sx * .2 - 1.6, 4.7, 1.5], .035, M.nD, g, 5); for (let i = 0; i < 9; i++) tb([-1.8, .5 + i * .5, 1.5], [-1.4, .5 + i * .5, 1.5], .025, M.nS, g, 5);
  for (const [x, z] of [[1.0, 1.52], [-.4, 1.52]]) put(blob(.7, .34, .4), M.fabT, g, [x, 5.82, z]);
  const gun = new THREE.Group(); gun.position.set(0, 6.0, 0); g.add(gun); g.userData.gun = gun;
  put(rbox(.5, .44, 1.0, .08), M.gunm, gun, [0, 0, .5]); put(can(.08, 1.4), M.gunB, gun, [0, .03, 1.5], [H2, 0, 0]); put(can(.12, .2), M.bS, gun, [0, .03, 2.1], [H2, 0, 0]); put(rbox(.3, .3, .4, .05), M.haz, gun, [.36, -.05, .4]); put(can(.1, .3), M.bD, gun, [0, -.3, .3]);
  put(blob(.28, .28, .28), M.red, g, [0, 8.3, 0]); tb([0, 8.0, 0], [0, 8.2, 0], .04, M.nD, g, 5);
  return bake(g);
}
/** Veyl spire stack: a twisted horn of shell with a crystal crown. */
function spire(g: THREE.Object3D, r: number, h: number, mat: THREE.Material, p: P3 = [0, 0, 0], lean: P3 = [0, 0, 0]) {
  put(warp(lathe(spl([[r, 0], [r * .92, h * .15], [r * .7, h * .45], [r * .42, h * .75], [r * .12, h * .96], [0, h]], 16), 12), v => { const k = v.y / h, a = k * 1.4, c = Math.cos(a), s = Math.sin(a), x = v.x + Math.sin(k * 5) * r * .16; v.x = x * c - v.z * s; v.z = x * s + v.z * c; }, 'spire' + [r, h]), mat, g, p, lean);
}
export function choir(anim: ((t: number) => void)[]) {
  const fig = figure('choir');
  if (fig) { for (const [r, ry, tx, w] of [[fig.groups.ring0, 4.2, .25, .7], [fig.groups.ring1, 7.4, -.3, -.9]] as [THREE.Group, number, number, number][]) anim.push(t => { r.rotation.set(tx, t * w, 0); r.position.y = ry + Math.sin(t * 1.4 + ry) * .18; }); return bake(fig.root); }
  const g = new THREE.Group();
  put(lathe(spl([[2.2, 0], [2.0, .3], [1.3, .7], [1.0, 1.0]], 8), 16), M.vD, g);
  spire(g, 1.15, 11.4, M.vI, [0, .6, 0]); spire(g, .6, 5.6, M.vL, [1.0, .3, .3], [0, 1, -.2]); spire(g, .5, 4.2, M.vL, [-.9, .3, -.5], [.15, 3, .22]);
  for (const [y, r] of [[2.4, 1.02], [4.6, .82], [6.8, .6]]) put(ring(r, .08), M.vG, g, [0, y, 0], [H2, 0, 0]);
  put(shard(.3, 2.6, 6, .12), M.vC, g, [0, 11.2, 0]);
  for (const [ry, s, tx] of [[4.2, 1.7, .25], [7.4, 1.2, -.3]]) { const r = put(ring(s, .13, .5, 36), M.mag, g, [0, ry, 0], [H2 + tx, 0, 0]); r.userData.dyn = true; anim.push(t => { r.rotation.z = t * (tx > 0 ? .7 : -.9); r.position.y = ry + Math.sin(t * 1.4 + ry) * .18; }); }
  for (let i = 0; i < 5; i++) { const a = i / 5 * 6.283; put(shard(.17, .9, 5, .25), M.vC, g, [Math.cos(a) * 1.7, .3, Math.sin(a) * 1.7], [R(-.4, .4), 0, R(-.4, .4)]); }
  return bake(g);
}
export function oreCluster(n: number, sc: number) {
  const g = new THREE.Group();
  for (let i = 0; i < n; i++) { const a = R(0, 6.3), d = R(0, 1.3) * sc, h = R(1.4, 3.4) * sc; put(shard(h * .19, h, 5 + (i % 2), .3), M.ore, g, [Math.cos(a) * d, h * .24, Math.sin(a) * d], [R(-.45, .45), R(0, 3), R(-.45, .45)]); }
  for (let i = 0; i < 4; i++) { const a = R(0, 6.3); put(rocks(i), M.rockB, g, [Math.cos(a) * 1.7 * sc, .2, Math.sin(a) * 1.7 * sc], [0, R(0, 3), 0], [R(.7, 1.4), R(.5, .9), R(.7, 1.4)]); }
  return bake(g);
}
const rockPool: THREE.BufferGeometry[] = [];
/** One of a handful of knocked-about boulder shapes. */
export function rocks(i: number) { if (!rockPool.length) { let s = 7; const rand = () => { s = (s * 16807) % 2147483647; return s / 2147483647; }; for (let k = 0; k < 6; k++) rockPool.push(boulder(rand)); } return rockPool[Math.abs(Math.floor(i)) % 6]; }
/** Assay Office: the clever end of the yard. A balance scale on the roof weighs ore against the Charter's promises. */
export function assay(anim: ((t: number) => void)[]) {
  const fig = figure('assay'), g = fig ? fig.root : new THREE.Group();
  if (!fig) { put(slab(7.2, .2, 6.4, 3, .05), M.conc, g, [0, .1, 0]); }
  if (!fig) { put(slab(5.8, 3.0, 4.6, 2.2, .12), M.wallT, g, [0, 1.7, -.3]); put(slab(6.2, .3, 5.0, 3, .08), M.wallD, g, [0, 3.35, -.3]); }
  put(plate(rrect(1.3, 2.2, .1), .2, .05), M.doorP, g, [-1.6, 1.3, 2.02]); put(slab(1.9, .36, .24, 1, .05), M.haz, g, [-1.6, 2.7, 2.08]);
  win(g, [1.0, 2.0, 2.02], 1.9, 1.0); win(g, [2.92, 2.0, -.3], 1.5, .9, H2); win(g, [-2.92, 2.0, -.3], 1.5, .9, H2);
  // the scale
  tb([0, 3.4, -.3], [0, 5.9, -.3], .13, M.bY, g); put(slab(1.1, .3, 1.1, 1, .06), M.wallS, g, [0, 3.6, -.3]); put(blob(.3, .3, .3), M.nS, g, [0, 5.95, -.3]);
  const beam = grp('beam', g, [0, 5.9, -.3]); tb([-2.2, 0, 0], [2.2, 0, 0], .09, M.bD, beam);
  for (const sx of [-1, 1]) { tb([sx * 2.2, 0, 0], [sx * 2.2, -1.1, 0], .03, M.nD, beam, 5); put(lathe([...spl([[0, 0], [.5, .06], [.78, .32]], 6), ...hard([[.84, .34], [.8, .4]])], 14), M.bS, beam, [sx * 2.2, -1.42, 0]); }
  put(shard(.3, .8, 5, .2), M.ore, beam, [-2.2, -1.36, 0]); put(rbox(.5, .34, .4, .05), M.pY, beam, [2.2, -1.2, 0]);
  anim.push(t => { beam.rotation.z = Math.sin(t * .9) * .1 - .05; });
  // sample stack and pipework round the side
  if (!fig) { put(can(.55, 2.6, .05), M.bS, g, [2.1, 4.7, -1.7]); put(lathe([...hard([[.55, 0], [.6, .04]]), ...spl([[.58, .1], [.4, .36], [0, .46]], 6)], 14), M.cO, g, [2.1, 6.0, -1.7]); put(ring(.57, .05), M.nD, g, [2.1, 4.4, -1.7], [H2, 0, 0]); }
  pipe(g, [[2.1, 3.9, -1.1], [2.1, 3.9, .2], [2.6, 3.2, .8]], .09);
  // The clever end of the yard still leaks: a porch on poles, the clerk's loft, the board, and a bench for the queue.
  signboard(g, [.5, 4.12, 2.05], [-.07, 0, .035], 3.9, 1.08, M.signAssay, .12);
  awning(g, [-1.6, 3.05, 2.02], 0, 2.3, 1.05, M.wallR, 2.85, .4, -.04); lamp(g, [-1.6, 2.3, 2.95], .3);
  poster(g, [2.48, 2.05, 2.04], 0, .66, .88, M.post1, .06); poster(g, [2.45, 1.1, 2.04], 0, .6, .8, M.post4, -.05);
  { const c = posed(g, [-1.5, 3.5, -1.85], [0, -.1, -.025]); put(slab(1.8, 1.25, 1.3, 1.6, .08), M.wallS, c, [0, .62, 0]); put(slab(2.1, .07, 1.7, 1.6, .02), M.wallR, c, [0, 1.36, .08], [.16, 0, 0]); win(c, [.3, .7, .66], .6, .45); melt(c); }
  stovepipe(g, [-2.1, 4.82, -2.0], 1.1, .13); bar([-.8, 4.75, -1.9], [-.7, 6.6, -1.95], .025, M.nD, g); put(tube([[-.7, 6.4, -1.95], [.7, 5.5, -1.8], [2.1, 5.95, -1.7]], .012, -3, 1, false, 6), M.nD, g);
  put(slab(1.7, .08, .4, 1.6, .02), M.wood, g, [1.0, .7, 2.5], [0, .04, 0]); for (const sx of [-1, 1]) put(slab(.3, .46, .34, 1, .03), M.conc, g, [1.0 + sx * .6, .43, 2.5]);
  pipe(g, [[2.85, 3.3, 2.1], [2.98, 3.0, 2.14], [2.98, .3, 2.14]], .06); patch(g, [-2.93, 1.2, .8], -H2, 1.0, .8, M.pD, .07);
  put(slab(1.0, 1.0, 1.0, 1, .07), M.wallY, g, [2.9, .6, 2.6], [0, .4, 0]); put(can(.38, 1.1, .04), M.bS, g, [-3.1, .6, 2.5]); put(ring(.39, .035), M.nD, g, [-3.1, .85, 2.5], [H2, 0, 0]);
  return bake(g);
}
/** Signal Mast: a lattice tower with a turning dish. The Charter listens in, and sends the good kit. */
export function mast(anim: ((t: number) => void)[]) {
  const fig = figure('mast'), g = fig ? fig.root : new THREE.Group(), top = 10, r0 = 1.7, r1 = .42, at = (y: number) => r0 + (r1 - r0) * y / top;
  if (!fig) { put(slab(4.6, .2, 4.6, 2, .05), M.conc, g, [0, .1, 0]); }
  if (!fig) {
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) { tb([sx * r0, 0, sz * r0], [sx * r1, top, sz * r1], .2, M.bY, g); put(slab(.6, .24, .6, 1, .04), M.conc, g, [sx * r0, .14, sz * r0]); }
  const lv = [1.6, 3.8, 5.9, 7.8, 9.4];
  lv.forEach((y, i) => { const r = at(y), y2 = i < lv.length - 1 ? lv[i + 1] : top, r2 = at(y2);
    for (const s of [-1, 1]) { tb([-r, y, s * r], [r, y, s * r], .1, M.bY, g, 6); tb([s * r, y, -r], [s * r, y, r], .1, M.bY, g, 6); tb([-r * s, y, s * r], [r2 * s, y2, s * r2], .07, M.bS, g, 5); tb([s * r, y, r * s], [s * r2, y2, -r2 * s], .07, M.bS, g, 5); } });
  put(slab(1.5, .26, 1.5, 1, .05), M.wallS, g, [0, top + .1, 0]); for (const sx of [-1, 1]) for (const sz of [-1, 1]) tb([sx * .7, top + .2, sz * .7], [sx * .7, top + .9, sz * .7], .03, M.nD, g, 5);
  }
  if (!fig) tb([0, top + .2, 0], [0, top + 3.2, 0], .1, M.bS, g, 6); for (const y of [1.2, 1.9, 2.6]) tb([-.5 + y * .12, top + y, 0], [.5 - y * .12, top + y, 0], .03, M.nS, g, 5);
  put(blob(.24, .24, .24), M.red, g, [0, top + 3.3, 0]);
  const dish = grp('dish', g, [0, top + .5, 0]); put(lathe([...spl([[0, 0], [.6, .08], [1.1, .4], [1.35, .86]], 8), ...hard([[1.4, .88], [1.36, .96]])], 18), M.bS, dish, [0, .6, .5], [1.15, 0, 0]); tb([0, .6, .5], [0, 1.15, 1.7], .035, M.nD, dish, 5); put(blob(.14, .14, .14), M.pY, dish, [0, 1.15, 1.7]); tb([0, 0, 0], [0, .6, .5], .08, M.bD, dish, 6);
  anim.push(t => { dish.rotation.y = t * .5; });
  // relay hut at the foot
  if (!fig) { put(slab(2.0, 1.7, 1.6, 1.2, .08), M.wallR, g, [0, 1.05, 0]); put(slab(2.2, .2, 1.8, 1.2, .05), M.wallD, g, [0, 2.0, 0]); } win(g, [0, 1.25, .82], .9, .5); put(slab(.5, .5, .1, .5, .03), M.haz, g, [-.7, 1.2, .84]);
  pipe(g, [[1.0, 1.5, 0], [1.5, 1.1, .3], [2.0, .25, .7]], .06);
  return bake(g);
}
/** Workshop: unlocks Breachers and sells upgrades. */
export function machineshop(anim: ((t: number) => void)[]) {
  const fig = figure('machineshop'), g = fig ? fig.root : new THREE.Group();
  if (!fig) { put(slab(9, .2, 7, 3, .05), M.conc, g, [0, .1, 0]); }
  if (!fig) { put(slab(6.4, 3.6, 5, 2.2, .12), M.wallR, g, [-.6, 1.9, -.4]); put(slab(6.8, .3, 5.4, 3, .08), M.wallD, g, [-.6, 3.85, -.4]); }
  put(plate(rrect(3.4, 2.8, .1), .2, .05), M.doorP, g, [-.6, 1.5, 2.1]); put(slab(3.9, .42, .26, 1.3, .06), M.haz, g, [-.6, 3.1, 2.16]);
  win(g, [-3.2, 2.6, 2.1], .9, .6);
  if (!fig) { put(can(.8, 4.4, .06), M.bS, g, [3.4, 2.2, -1.2]); put(lathe([...hard([[.8, 0], [.86, .04]]), ...spl([[.84, .1], [.66, .4], [.34, .56], [0, .6]], 8)], 18), M.cO, g, [3.4, 4.4, -1.2]); for (const y of [1.4, 3.2]) put(ring(.82, .07), M.nD, g, [3.4, y, -1.2], [H2, 0, 0]); }
  if (!fig) { pipe(g, [[3.4, 3.6, -.4], [3.4, 3.6, .6], [2.4, 3.2, .9]], .1); }
  if (!fig) { tb([3.4, 0, 2.2], [3.4, 5.6, 2.2], .15, M.bY, g); tb([3.4, 5.5, 2.2], [-1.6, 5.5, 2.2], .13, M.bY, g); tb([3.4, 4.2, 2.2], [1.6, 5.5, 2.2], .07, M.nD, g, 6); put(slab(.7, .3, .7, 1, .05), M.conc, g, [3.4, .15, 2.2]); }
  const hook = grp('hook', g, [-1.2, 5.4, 2.2]); tb([0, 0, 0], [0, -1.6, 0], .03, M.nD, hook, 5); put(rbox(.3, .26, .3, .05), M.pY, hook, [0, -.1, 0]); put(tube([[0, -1.6, 0], [.18, -1.82, 0], [0, -2.04, 0], [-.16, -1.86, 0]], [.05, .06, .05, .02], 6), M.nD, hook); anim.push(t => { hook.position.x = -.4 + Math.sin(t * .5) * 1.1; });
  const gear = grp('gear', g, [-.6, 4.9, -.4]); put(can(1.1, .4, .05), M.bY, gear); for (let i = 0; i < 8; i++) { const a = i / 8 * 6.283; put(rbox(.5, .4, .4, .06), M.pY, gear, [Math.cos(a) * 1.2, 0, Math.sin(a) * 1.2], [0, -a, 0]); } put(can(.4, .5, .04), M.bD, gear, [0, .1, 0]);
  gear.rotation.x = .25; anim.push(t => { gear.rotation.y = t * .8; });
  // Bolted on over the years: a shack on the roof, a lean-to by the door, the board, and paper on every flat wall.
  { const c = posed(g, [-3.05, 4.0, -1.3], [0, .14, .03]); put(slab(1.8, 1.5, 1.8, 1.6, .08), M.wallY, c, [0, .75, 0]); put(slab(2.2, .08, 2.2, 1.6, .02), M.wallS, c, [0, 1.62, .05], [.14, 0, 0]); win(c, [.36, .9, .9], .6, .45); put(plate(rrect(.56, 1.1, .04), .1, .02), M.doorP, c, [-.48, .6, .9]); melt(c); }
  stovepipe(g, [-3.5, 5.55, -1.7], 1.3, -.14);
  signboard(g, [-2.75, 4.97, 1.75], [-.06, .03, -.05], 2.5, 1.56, M.signShop, .2);
  awning(g, [-3.2, 3.3, 2.12], 0, 1.5, 1.25, M.wallT, 3.1, .45, .05); lamp(g, [-3.2, 2.42, 3.2], .3); lamp(g, [-.6, 2.62, 2.44], .22);
  poster(g, [1.85, 2.3, 2.13], 0, .8, 1.05, M.post2, -.04); poster(g, [2.2, 1.22, 2.13], 0, .62, .82, M.post3, .08);
  patch(g, [-3.83, 2.4, -1.2], -H2, 1.3, .9, M.pS, .06); patch(g, [-3.83, 1.2, .5], -H2, .9, 1.0, M.wallT, -.05); poster(g, [-3.83, 2.3, .9], -H2, .75, 1.0, M.post4, .05);
  tyres(g, [2.95, .2, 3.05], 3); put(ring(.33, .15, 1, 14), M.rib, g, [3.75, .52, 2.9], [.25, .5, 0]);
  put(slab(1.1, 1.1, 1.1, 1.1, .07), M.wallT, g, [-3.6, .6, 2.9], [0, .3, 0]); put(can(.4, 1.2, .04), M.wallR, g, [2.2, .6, 2.9]); put(can(.4, 1.2, .04), M.bY, g, [1.3, .6, 3.1]); for (const [x, z] of [[2.2, 2.9], [1.3, 3.1]]) put(ring(.41, .035), M.nD, g, [x, .9, z], [H2, 0, 0]);
  return bake(g);
}
/** Ironhold tier-three works: a furnace hall with a glowing crucible and a tall stack. */
export function foundry(anim: ((t: number) => void)[]) {
  const fig = figure('foundry'), g = fig ? fig.root : new THREE.Group();
  if (!fig) { put(slab(8.8, .2, 7.6, 3, .05), M.conc, g, [0, .1, 0]); }
  if (!fig) { put(slab(5.8, 4.2, 5.2, 2.6, .12), M.wallD, g, [-.8, 2.2, -.6]); put(slab(6.2, .4, 5.6, 3, .08), M.wallR, g, [-.8, 4.5, -.6]); }
  if (!fig) put(slab(4.6, .9, 4.2, 2.3, .1), M.wallS, g, [-.8, 5.1, -.6]); put(slab(5.7, .42, .26, 1.3, .06), M.haz, g, [-.8, 3.5, 2.06]);
  put(plate(rrect(2.6, 2.8, .1), .2, .05), M.doorP, g, [-1.6, 1.5, 2.02]);
  const glow = put(plate(rrect(1.5, 1.6, .2), .14, .03), M.fireP, g, [.9, 1.3, 2.03]); glow.userData.dyn = true; put(rbox(.14, 1.7, .12, .03), M.pD, g, [.9, 1.3, 2.1]); put(rbox(1.6, .14, .12, .03), M.pD, g, [.9, 1.3, 2.1]); put(plate(rrect(1.8, 1.9, .26), .1, .03), M.gunm, g, [.9, 1.3, 1.98]);
  if (!fig) { put(can(.75, 7.2, .06), M.wallR, g, [3.2, 3.6, -1.8]); put(can(.9, .4, .05), M.bD, g, [3.2, 7.3, -1.8]); for (const y of [5.2, 2.4]) put(ring(.78, .09), M.nY, g, [3.2, y, -1.8], [H2, 0, 0]); }
  if (!fig) put(lathe(hard([[.7, 0], [.95, .12], [.98, 1.4], [.86, 1.5], [.8, 1.42], [0, 1.42]]), 20), M.bS, g, [3.1, .15, 1.6]); const melt = put(can(.5, .06, .01), M.fireP, g, [3.1, 1.6, 1.6]); melt.userData.dyn = true;
  if (!fig) { pipe(g, [[2.4, 4.0, -1.8], [1.4, 4.9, -1.6], [.6, 5.5, -1.2]], .12); pipe(g, [[3.2, 1.6, -.9], [3.2, 2.2, .2], [3.1, 2.0, .9]], .1, M.bY); }
  tb([-3.4, 0, 3.2], [-3.4, 3.2, 3.2], .12, M.bY, g); put(rbox(.56, .36, .56, .08), M.pD, g, [-3.4, 3.3, 3.2]); put(blob(.4, .2, .4), M.visG, g, [-3.4, 3.12, 3.2]);
  put(slab(1.2, .9, .9, 1, .07), M.wallR, g, [-3.3, .5, 3.0], [0, .2, 0]); put(slab(.9, .7, .7, 1, .06), M.wallY, g, [1.2, .45, 3.3], [0, -.3, 0]);
  anim.push(t => { const k = 1 + Math.sin(t * 5) * .06 + Math.sin(t * 13) * .03; melt.scale.set(1.6 * k, 1, 1.6 * k); glow.scale.y = .94 + Math.sin(t * 7) * .05; });
  return bake(g);
}
/** A curved Veyl horn rising from the ground and leaning over. */
function horn(g: THREE.Object3D, base: P3, tip: P3, r: number, mat: THREE.Material, bow = .3) {
  const m: P3 = [(base[0] + tip[0]) / 2 + (base[0] - tip[0]) * bow, (base[1] + tip[1]) / 2, (base[2] + tip[2]) / 2 + (base[2] - tip[2]) * bow];
  put(tube([base, m, tip], [r, r * .7, r * .06], 10), mat, g);
}
/** Veyl spawner: a standing ring that raids walk out of. */
export function reedgate(anim: ((t: number) => void)[]) {
  const fig = figure('reedgate'), g = fig ? fig.root : new THREE.Group();
  if (fig) { const r = fig.groups.ring; anim.push(t => { r.rotation.z = t * .35; }); } else {
  put(lathe(spl([[3.6, 0], [3.4, .4], [2.8, .7], [2.6, .9], [0, .9]], 10), 20), M.vD, g); put(ring(2.9, .1, 1, 36), M.vG, g, [0, .78, 0], [H2, 0, 0]);
  for (const sx of [-1, 1]) {
    horn(g, [sx * 3.0, .4, 0], [sx * 2.2, 9.4, 0], .8, M.vI, .22); horn(g, [sx * 3.5, .3, .9], [sx * 4.3, 5.2, 1.4], .4, M.vL, .1); horn(g, [sx * 3.5, .3, -.9], [sx * 4.5, 4.4, -1.6], .36, M.vL, .1);
    put(shard(.42, 2.6, 6, .2), M.vC, g, [sx * 3.25, 7.2, 0], [0, 0, sx * -.3]);
    for (const [y, r, x] of [[2.2, .78, 3.2], [4.6, .62, 3.26]]) put(ring(r, .08), M.vG, g, [sx * x, y, 0], [H2, 0, sx * .06]);
  }
  const ringG = grp('ring', g, [0, 4.6, 0]); put(ring(2.8, .2, .6, 44), M.mag, ringG); put(ring(2.5, .06, 1, 40), M.vG, ringG); for (let i = 0; i < 6; i++) { const a = i / 6 * 6.283; put(shard(.2, .9, 4, .5), M.teal, ringG, [Math.cos(a) * 2.8, Math.sin(a) * 2.8, 0], [0, 0, a - H2]); }
  anim.push(t => { ringG.rotation.z = t * .35; });
  for (let i = 0; i < 7; i++) { const a = i / 7 * 6.283 + .3, h = R(.9, 1.8); put(shard(.2, h, 5, .25), M.vC, g, [Math.cos(a) * 3.6, .8, Math.sin(a) * 3.6], [R(-.4, .4), 0, R(-.4, .4)]); }
  }
  const veil = mk(G.disc, M.violet, [0, 4.6, 0], [4.9, 4.9, 1], 0, g); veil.userData.dyn = true; (veil.material as THREE.Material).side = THREE.DoubleSide; anim.push(t => { const k = 1 + Math.sin(t * 2.2) * .04; veil.scale.set(4.9 * k, 4.9 * k, 1); });
  return bake(g);
}
/** Veyl hatchery: a ribbed crater with a glowing pool. Raids climb out of these. */
export function broodpit(anim: ((t: number) => void)[]) {
  const fig = figure('broodpit'), g = fig ? fig.root : new THREE.Group();
  if (!fig) { put(lathe(spl([[3.8, 0], [3.6, .5], [3.0, 1.1], [2.5, 1.35], [2.2, 1.1], [2.0, .7]], 14), 22), M.vD, g); put(ring(2.55, .12, 1, 36), M.vG, g, [0, 1.3, 0], [H2, 0, 0]); }
  const pool = mk(G.disc, M.violet, [0, 1.0, 0], [2.4, 2.4, 1], [-Math.PI / 2, 0, 0], g); pool.userData.dyn = true;
  if (!fig) {
  for (let i = 0; i < 7; i++) { const a = i / 7 * 6.283 + .2, h = i % 2 ? 4.6 : 3.4, c = Math.cos(a), s = Math.sin(a); horn(g, [c * 3.1, .5, s * 3.1], [c * 1.5, h, s * 1.5], .42, i % 2 ? M.vL : M.vI, .32); }
  for (let i = 0; i < 5; i++) { const a = i / 5 * 6.283 + .9; put(blob(.6, .76, .6), i % 2 ? M.vC : M.vM, g, [Math.cos(a) * 1.5, 1.2, Math.sin(a) * 1.5]); }
  put(ring(1.8, .1, .5, 36), M.mag, g, [0, 1.5, 0], [H2, 0, 0]);
  }
  anim.push(t => { const k = 2.4 * (1 + Math.sin(t * 2.6) * .08); pool.scale.set(k, k, 1); });
  return bake(g);
}
/** Veyl turret: a crooked spike with a floating eye that spits bolts. */
export function thornspire(anim: ((t: number) => void)[]) {
  const fig = figure('thornspire');
  if (fig) { const { eye, halo } = fig.groups; anim.push(t => { eye.rotation.y = t * 2.2; eye.position.y = 6.9 + Math.sin(t * 2 + 6) * .14; halo.rotation.set(.3, t * 1.3, 0); halo.position.y = eye.position.y; }); return bake(fig.root); }
  const g = new THREE.Group();
  put(lathe(spl([[1.4, 0], [1.3, .25], [.9, .5], [0, .55]], 8), 14), M.vD, g);
  put(tube([[0, .3, 0], [.2, 1.8, .1], [-.16, 3.4, -.1], [.1, 5.0, .06], [0, 6.0, 0]], [.62, .56, .44, .3, .1], 10), M.vI, g);
  for (const [y, r] of [[1.4, .6], [3.0, .47], [4.4, .36]]) put(ring(r, .05), M.vG, g, [0, y, 0], [H2, 0, 0]);
  for (let i = 0; i < 5; i++) { const a = i / 5 * 6.283; put(shard(.11, 1.3, 4, .1), M.vM, g, [Math.cos(a) * .45, 1.9 + (i % 2) * 1.5, Math.sin(a) * .45], [Math.sin(a) * 1.1, 0, -Math.cos(a) * 1.1]); }
  const y = 6.0;
  const eye = put(shard(.3, .9, 6, .5), M.teal, g, [0, y + .9, 0]); eye.userData.dyn = true; const halo = put(ring(.75, .04, 1, 30), M.vG, g, [0, y + .9, 0], [H2, 0, 0]); halo.userData.dyn = true;
  anim.push(t => { eye.rotation.y = t * 2.2; eye.position.y = y + .9 + Math.sin(t * 2 + y) * .14; halo.rotation.z = t * 1.3; });
  return bake(g);
}
/** Veyl shield node: three claws holding a bright core. Halves damage to every Veyl building nearby. */
export function wardpylon(anim: ((t: number) => void)[]) {
  const fig = figure('wardpylon');
  if (fig) { const { core, r1, r2 } = fig.groups; anim.push(t => { core.scale.setScalar(1 + Math.sin(t * 3.4) * .1); core.rotation.y = t * .4; r1.rotation.y = t * .9; r2.rotation.set(t * .6, 0, t * 1.4); }); return bake(fig.root); }
  const g = new THREE.Group();
  put(lathe(spl([[1.7, 0], [1.6, .3], [1.15, .5], [0, .56]], 8), 16), M.vD, g); put(ring(1.1, .07), M.vG, g, [0, .56, 0], [H2, 0, 0]);
  for (let i = 0; i < 3; i++) { const a = i / 3 * 6.283, c = Math.cos(a), s = Math.sin(a); put(tube([[c * 1.2, .3, s * 1.2], [c * 1.75, 2.6, s * 1.75], [c * 1.5, 4.8, s * 1.5], [c * .62, 6.2, s * .62]], [.4, .34, .24, .03], 10), i % 2 ? M.vL : M.vI, g); put(ring(.36, .05), M.vG, g, [c * 1.66, 2.0, s * 1.66], [H2, 0, 0]); }
  const core = mk(G.sph, M.cyan, [0, 4.6, 0], [1.0, 1.0, 1.0], 0, g); core.userData.dyn = true;
  const r1 = put(ring(1.3, .05, 1, 36), M.vG, g, [0, 4.6, 0], [H2, 0, 0]); r1.userData.dyn = true; const r2 = put(ring(1.0, .04, 1, 32), M.teal, g, [0, 4.6, 0]); r2.userData.dyn = true;
  anim.push(t => { const k = 1 + Math.sin(t * 3.4) * .1; core.scale.set(k, k, k); r1.rotation.z = t * .9; r2.rotation.y = t * 1.4; r2.rotation.x = t * .6; });
  return bake(g);
}
/** Veyl supply: a quiet well. Four reeds arch over a dark pool, and a hush orb hangs above it, breathing. */
export function hushwell(anim: ((t: number) => void)[]) {
  const fig = figure('hushwell'), g = fig ? fig.root : new THREE.Group();
  if (!fig) { put(lathe(spl([[2.4, 0], [2.3, .38], [1.95, .86], [1.62, 1.08], [1.42, .96]], 12), 22), M.vD, g); put(ring(1.62, .1, 1, 34), M.vG, g, [0, 1.06, 0], [H2, 0, 0]); }
  const pool = mk(G.disc, M.violet, [0, .92, 0], [1.46, 1.46, 1], [-Math.PI / 2, 0, 0], g); pool.userData.dyn = true;
  if (fig) { const { orb, halo } = fig.groups; anim.push(t => { const k = 1 + Math.sin(t * 1.3) * .08; orb.position.y = 2.7 + Math.sin(t * .9) * .18; orb.scale.setScalar(k); orb.rotation.y = t * .3; halo.position.y = orb.position.y; halo.rotation.set(Math.sin(t * .5) * .4, 0, Math.cos(t * .5) * .4); const q = 1.46 * (1 + Math.sin(t * 1.3 + 1) * .04); pool.scale.set(q, q, 1); }); return bake(g); }
  for (let i = 0; i < 4; i++) { const a = i / 4 * 6.283 + .4, c = Math.cos(a), s = Math.sin(a); horn(g, [c * 2.05, .5, s * 2.05], [c * .55, 4.3, s * .55], .26, i % 2 ? M.vL : M.vI, .26); put(shard(.09, .5, 4, .3), M.vC, g, [c * 2.2, .3, s * 2.2], [s * .5, 0, -c * .5]); }
  const orb = put(blob(.62, .62, .62), M.vM, g, [0, 2.7, 0]); orb.userData.dyn = true; const halo = put(ring(.78, .05, 1, 30), M.teal, g, [0, 2.7, 0], [H2, 0, 0]); halo.userData.dyn = true;
  for (let i = 0; i < 3; i++) { const a = i / 3 * 6.283; put(shard(.12, .7, 5, .3), M.vC, g, [Math.cos(a) * 1.0, 1.0, Math.sin(a) * 1.0], [Math.sin(a) * .4, 0, -Math.cos(a) * .4]); }
  anim.push(t => { const k = 1 + Math.sin(t * 1.3) * .08; orb.position.y = 2.7 + Math.sin(t * .9) * .18; orb.scale.set(k, k, k); halo.rotation.z = t * .5; halo.position.y = orb.position.y; const q = 1.46 * (1 + Math.sin(t * 1.3 + 1) * .04); pool.scale.set(q, q, 1); });
  return bake(g);
}
export function grenade() { const g = new THREE.Group(); mk(G.cyl, M.rust, [0, 0, 0], [.2, .3, .2], 0, g); mk(G.cyl, M.steelD, [0, .19, 0], [.1, .1, .1], 0, g); mk(G.box, M.hazard1, [0, 0, .1], [.12, .2, .03], 0, g); return bake(g); }
export function bolt() { const g = new THREE.Group(); mk(G.oct, M.bolt, [0, 0, 0], [.34, .34, 1.3], 0, g); mk(G.torus, M.mag, [0, 0, -.2], [.6, .6, .6], 0, g); return setLayer(bake(g), L_FX) as THREE.Group; }

/** A see-through copy of a model for blueprints. */
export function hologram(src: THREE.Object3D, mat: THREE.Material) {
  const g = new THREE.Group(); src.updateMatrixWorld(true); const inv = new THREE.Matrix4().copy(src.matrixWorld).invert();
  src.traverse((m: any) => { if (!m.isMesh) return; const rel = new THREE.Matrix4().multiplyMatrices(inv, m.matrixWorld); const c = new THREE.Mesh(m.geometry, mat); c.applyMatrix4(rel); g.add(c); const e = new THREE.LineSegments(new THREE.EdgesGeometry(m.geometry, 30), holoLine); e.applyMatrix4(rel); g.add(e); });
  return setLayer(g, L_FX) as THREE.Group;
}

// ---------------------------------------------------------------- first-person view-models
/** A forearm reaching in from off screen: sleeve, bracer, glove with knuckles and a thumb. */
function vmArm(g: THREE.Object3D, hand: P3, elbow: P3, mat: THREE.Material, glove: THREE.Material, guard: THREE.Material | null = M.bS) {
  const L = (t: number): P3 => [elbow[0] + (hand[0] - elbow[0]) * t, elbow[1] + (hand[1] - elbow[1]) * t, elbow[2] + (hand[2] - elbow[2]) * t];
  put(tube([elbow, L(.5), L(.86)], [.085, .075, .058]), mat, g);
  if (guard) { put(tube([L(.36), L(.7)], [.09, .072]), guard, g); put(tube([L(.72), L(.76)], .076), M.rib, g); }
  put(tube([L(.82), L(.96)], [.062, .07]), glove, g); put(blob(.15, .13, .17), nv(glove), g, L(1.02));
  for (let i = 0; i < 4; i++) put(capsule(.022, .1, 8), nv(glove), g, [hand[0] - .055, hand[1] + .045 - i * .032, hand[2] - .05 + (i % 3) * .008], [0, 0, H2]);
  put(capsule(.026, .1, 8), nv(glove), g, [hand[0] + .03, hand[1] + .06, hand[2] - .05], [H2 * .7, 0, 0]);
}
const H2 = Math.PI / 2;
export function vmDrill() {
  const g = new THREE.Group();
  put(rbox(.2, .22, .42, .05), M.chest, g, [0, 0, 0]); put(rbox(.21, .05, .3, .02), M.haz, g, [0, .12, -.04]);
  put(rbox(.06, .1, .2, .02), M.gunm, g, [0, .17, .08]); put(can(.045, .18), M.tank, g, [.13, .02, .04], [H2, 0, 0]); put(tube([[.13, .02, -.06], [.14, .06, -.18], [.08, .06, -.24]], .016, 6), M.rib, g);
  const bit = grp('bit', g, [0, 0, -.44]);
  put(lathe([[0, -.03], [.1, -.03], [.1, .0], [.085, .1], [.05, .28], [.012, .44], [0, .45]], 16), M.drill, bit, [0, 0, .22], [-H2, 0, 0]);
  put(lathe(hard([[.1, -.035], [.118, 0], [.1, .035]]), 16), M.hazB, g, [0, 0, -.235], [H2, 0, 0]); put(can(.09, .05), M.bD, g, [0, 0, -.2], [H2, 0, 0]);
  put(can(.05, .04), M.gunB, g, [-.105, .04, .05], [0, 0, H2]); put(blob(.085, .085, .03), M.visG, g, [-.128, .04, .05], [0, H2, 0]);
  put(rbox(.08, .22, .1, .03), M.lea, g, [0, -.2, .12], [.25, 0, 0]); put(ring(.05, .012), M.bS, g, [0, -.12, .02], [0, H2, 0]);
  vmArm(g, [.02, -.19, .12], [.2, -.5, .6], M.fabT, M.glove, null);
  bake(g); g.scale.setScalar(.62); g.userData.bit = bit; g.userData.rest = [.3, -.25, -.56, .14, .5, .06];
  return setLayer(g, L_VM) as THREE.Group;
}
const FLASH_INK = new THREE.MeshBasicMaterial({ color: 0x0d0c13, side: THREE.DoubleSide }), FLASH_MID = new THREE.MeshBasicMaterial({ color: 0xffa62e, side: THREE.DoubleSide });
function vmFlash(g: THREE.Object3D, p: P3, s: number) { const flash = grp('flash', g, p);
  // an inked star facing you, as a comic draws a shot: black behind, orange, then a white-hot middle, with one long spike down the barrel
  mk(G.burst, FLASH_INK, [0, 0, -.012 * s], [.66 * s, .66 * s, 1], 0, flash); mk(G.burst, FLASH_MID, [0, 0, 0], [.54 * s, .54 * s, 1], 0, flash); mk(G.burst, M.flash, [0, 0, .012 * s], [.32 * s, .32 * s, 1], [0, 0, .5], flash);
  mk(G.cone4, M.flash, [0, 0, -.22 * s], [.1 * s, .46 * s, .1 * s], [-Math.PI / 2, 0, 0], flash); flash.visible = false; return flash; }
export function vmRifle() {
  const g = new THREE.Group();
  put(rbox(.1, .155, .5, .03), M.gunm, g, [0, 0, .05]); put(rbox(.125, .125, .3, .035), M.pY, g, [0, .005, -.26]);
  for (const z of [-.34, -.26, -.18]) put(rbox(.13, .03, .045, .01), M.rib, g, [0, .02, z]);
  put(can(.028, .32), M.gunB, g, [0, .02, -.55], [H2, 0, 0]); put(can(.047, .13), M.bS, g, [0, .02, -.7], [H2, 0, 0]); put(ring(.04, .012), M.nD, g, [0, .02, -.765]);
  put(can(.02, .26), M.gunB, g, [0, -.045, -.5], [H2, 0, 0]);
  const mag = grp('mag', g, [0, -.17, -.04]); put(rbox(.062, .25, .115, .02), M.pS, mag, 0, [.25, 0, 0]); put(rbox(.07, .04, .125, .012), M.pD, mag, [0, -.12, -.03], [.25, 0, 0]);
  put(rbox(.072, .2, .095, .03), M.lea, g, [0, -.14, .2], [-.3, 0, 0]); put(ring(.045, .01), M.nD, g, [0, -.1, .1], [0, H2, 0]);
  put(rbox(.085, .14, .26, .035), M.lea, g, [0, -.01, .43]); put(rbox(.095, .165, .04, .015), M.rib, g, [0, -.01, .565]);
  put(rbox(.04, .028, .4, .01), M.pS, g, [0, .09, -.04]); put(ring(.05, .012), M.nD, g, [0, .15, -.2]); put(rbox(.03, .05, .05, .01), M.pS, g, [0, .11, -.2]); put(rbox(.05, .06, .04, .012), M.pS, g, [0, .105, .15]);
  put(rbox(.014, .055, .014, .004), M.visor, g, [0, .105, -.44]); put(rbox(.035, .03, .03, .008), M.pS, g, [0, .085, -.44]);
  put(rbox(.012, .06, .22, .004), M.haz, g, [.052, 0, .02]); put(tube([[.055, -.03, .16], [.075, -.06, 0], [.066, -.02, -.14]], .012, 6), M.rib, g);
  vmArm(g, [-.01, -.15, .2], [.14, -.36, .66], M.fab, M.leaB); vmArm(g, [-.04, -.1, -.26], [-.34, -.34, .1], M.fab, M.leaB);
  const flash = vmFlash(g, [0, .02, -.95], 1);
  bake(g); setLayer(g, L_VM); setLayer(flash, L_FX); g.userData.flash = flash; g.userData.mag = mag; g.userData.rest = [.27, -.24, -.5, .02, .08, 0]; g.userData.ads = [0, -.127, -.36, 0, 0, 0];
  return g;
}
export function vmScatter() {
  const g = new THREE.Group();
  put(rbox(.135, .175, .5, .04), M.gunm, g, [0, 0, .05]); put(rbox(.15, .12, .22, .035), M.pO, g, [0, -.01, -.02]);
  for (const sx of [-1, 1]) { put(can(.044, .64), M.gunB, g, [sx * .046, .03, -.5], [H2, 0, 0]); put(ring(.042, .014), M.nS, g, [sx * .046, .03, -.81]); put(ring(.044, .01), M.nD, g, [sx * .046, .03, -.3]); }
  put(rbox(.03, .03, .5, .008), M.pS, g, [0, .085, -.45]); put(blob(.03, .04, .03), M.visor, g, [0, .11, -.78]);
  const pump = grp('mag', g, [0, -.07, -.42]); put(rbox(.155, .1, .26, .04), M.lea, pump); for (const z of [-.08, 0, .08]) put(rbox(.16, .105, .025, .008), M.rib, pump, [0, 0, z]);
  put(rbox(.08, .2, .1, .03), M.lea, g, [0, -.14, .22], [-.3, 0, 0]); put(rbox(.1, .15, .3, .04), M.fabT, g, [0, -.02, .42]); put(rbox(.012, .08, .3, .004), M.haz, g, [.07, 0, .05]);
  for (let i = 0; i < 3; i++) put(can(.022, .07), M.tank, g, [-.075, .02, .0 + i * .06], [0, 0, 0]);
  vmArm(g, [-.01, -.15, .22], [.14, -.36, .66], M.fab, M.leaB, M.bD); vmArm(pump, [-.02, -.05, 0], [-.34, -.3, .4], M.fab, M.leaB, M.bD);
  const flash = vmFlash(g, [0, .03, -1.0], 1.7);
  bake(g); setLayer(g, L_VM); setLayer(flash, L_FX); g.userData.flash = flash; g.userData.mag = pump; g.userData.rest = [.25, -.25, -.5, .02, .1, 0];
  return g;
}
/** The Longshot's rifle: long barrel, fat scope. */
export function vmLong() {
  const g = new THREE.Group();
  put(rbox(.09, .14, .7, .03), M.gunm, g, [0, 0, .02]); put(rbox(.108, .1, .3, .03), M.fabG, g, [0, .01, -.12]);
  put(can(.022, .9), M.gunB, g, [0, .02, -.75], [H2, 0, 0]); put(can(.04, .16), M.bS, g, [0, .02, -1.2], [H2, 0, 0]); for (const z of [-1.16, -1.24]) put(ring(.036, .01), M.nD, g, [0, .02, z]);
  put(can(.042, .42), M.gunB, g, [0, .13, -.08], [H2, 0, 0]); put(can(.052, .07), M.bD, g, [0, .13, .15], [H2, 0, 0]); put(can(.056, .07), M.bD, g, [0, .13, -.31], [H2, 0, 0]); put(blob(.09, .09, .02), M.lens, g, [0, .13, .188]);
  for (const z of [-.2, .04]) put(rbox(.03, .06, .04, .008), M.pS, g, [0, .085, z]); put(can(.018, .05), M.bS, g, [0, .185, -.08]);
  const mag = grp('mag', g, [0, -.13, -.02]); put(rbox(.06, .14, .12, .02), M.pS, mag);
  put(rbox(.07, .2, .1, .03), M.lea, g, [0, -.13, .22], [-.3, 0, 0]); put(rbox(.08, .16, .3, .035), M.lea, g, [0, -.02, .46]); put(rbox(.012, .05, .2, .004), M.haz, g, [.047, 0, -.12]);
  for (const sx of [-1, 1]) put(tube([[sx * .02, -.06, -.6], [sx * .06, -.2, -.66]], .012, 5), M.nD, g);
  vmArm(g, [-.01, -.15, .22], [.14, -.36, .66], M.fabG, M.leaB); vmArm(g, [-.04, -.09, -.34], [-.34, -.34, .1], M.fabG, M.leaB);
  const flash = vmFlash(g, [0, .02, -1.42], 1.5);
  bake(g); setLayer(g, L_VM); setLayer(flash, L_FX); g.userData.flash = flash; g.userData.mag = mag; g.userData.rest = [.27, -.24, -.5, .02, .08, 0]; g.userData.ads = [0, -.3, -.2, 0, 0, 0];
  return g;
}
/** The Patch's rivet pistol. */
export function vmPistol() {
  const g = new THREE.Group();
  put(rbox(.085, .12, .34, .028), M.pW, g, [0, .02, -.08]); put(rbox(.06, .025, .2, .008), M.pR, g, [0, .088, -.06]); put(can(.028, .14), M.gunB, g, [0, .03, -.3], [H2, 0, 0]); put(ring(.026, .01), M.nS, g, [0, .03, -.37]);
  put(can(.03, .12), M.tankT, g, [0, -.035, -.16], [H2, 0, 0]); put(rbox(.03, .03, .03, .008), M.pS, g, [0, .095, .06]);
  const mag = grp('mag', g, [0, -.12, .04]); put(rbox(.07, .2, .1, .028), M.lea, mag, 0, [-.2, 0, 0]);
  put(rbox(.012, .05, .12, .004), M.teal, g, [.046, .02, -.02]); put(ring(.04, .009), M.nD, g, [0, -.06, -.03], [0, H2, 0]);
  vmArm(g, [0, -.14, .08], [.16, -.36, .6], M.fab, M.leaB, M.bW);
  const flash = vmFlash(g, [0, .03, -.5], .7);
  bake(g); setLayer(g, L_VM); setLayer(flash, L_FX); g.userData.flash = flash; g.userData.mag = mag; g.userData.rest = [.24, -.22, -.52, .02, .06, 0]; g.userData.ads = [0, -.105, -.42, 0, 0, 0];
  return g;
}
/** What a player sees as a Veyl body: a long shell arm ending in a singing crystal blade. */
export function vmVeyl() {
  const g = new THREE.Group();
  put(tube([[.2, -.4, .62], [.1, -.2, .26], [0, -.02, -.1]], [.08, .06, .05], 8), M.vD, g); put(ring(.06, .016), M.vG, g, [.06, -.13, .1], [.9, -.3, 0]);
  put(blob(.15, .13, .17), M.vL, g, [0, -.02, -.1]);
  put(shard(.07, .9, 4, .14), M.vC, g, [0, .02, -.2], [-H2, 0, .78]); put(shard(.05, .4, 4, .2), M.vIp, g, [0, .02, -.14], [-H2, 0, 0]);
  for (const sx of [-1, 1]) { put(shard(.03, .32, 4, .2), M.vM, g, [sx * .07, .02, -.14], [-H2, 0, sx * .5]); put(tube([[sx * .05, 0, -.08], [sx * .09, .03, -.16], [sx * .06, .02, -.24]], [.018, .014, .004], 5), M.vL, g); }
  const flash = vmFlash(g, [0, .02, -.95], .9);
  bake(g); setLayer(g, L_VM); setLayer(flash, L_FX); g.userData.flash = flash; g.userData.rest = [.26, -.24, -.5, .03, .1, -.2]; g.userData.ads = [.26, -.24, -.5, .03, .1, -.2];
  return g;
}
/** The Gantry's cockpit view: a cannon on each side and a dashboard along the bottom. */
export function vmCannon() {
  const g = new THREE.Group();
  for (const sx of [-1, 1]) {
    const c = grp(sx < 0 ? 'gunL' : 'gunR', g, [sx * .46, 0, 0]);
    put(rbox(.2, .22, .7, .05), M.gunm, c, [0, 0, -.1]); put(rbox(.15, .05, .4, .02), M.pO, c, [0, .12, -.05]);
    put(can(.06, .7), M.gunB, c, [0, .01, -.72], [H2, 0, 0]); put(can(.085, .3, .012), M.bD, c, [0, .01, -.56], [H2, 0, 0]); put(can(.078, .09, .012), M.bS, c, [0, .01, -1.06], [H2, 0, 0]);
    put(rbox(.014, .14, .5, .005), M.haz, c, [-sx * .105, 0, -.1]); put(tube([[-sx * .06, .1, .2], [-sx * .14, .16, 0], [-sx * .08, .12, -.3]], .014, 6), M.rib, c);
  }
  put(rbox(1.3, .1, .5, .03), M.pD, g, [0, -.17, -.3], [.25, 0, 0]); put(rbox(1.2, .05, .05, .015), M.haz, g, [0, -.1, -.52], [.25, 0, 0]);
  put(rbox(.3, .05, .2, .015), M.pY, g, [0, -.11, -.36], [.25, 0, 0]); put(rbox(.2, .02, .1, .006), M.visG, g, [0, -.085, -.38], [.25, 0, 0]);
  for (const sx of [-1, 1]) { put(can(.03, .04), M.tank, g, [sx * .24, -.1, -.34], [.25, 0, 0]); put(can(.022, .09), M.bS, g, [sx * .38, -.07, -.3], [.25, 0, sx * .2]); put(blob(.05, .05, .05), M.red, g, [sx * .39, -.025, -.29]); }
  const flashL = vmFlash(g.getObjectByName('gunL')!, [0, .01, -1.2], 2.2), flash = vmFlash(g.getObjectByName('gunR')!, [0, .01, -1.2], 2.2);
  bake(g); setLayer(g, L_VM); setLayer(flash, L_FX); setLayer(flashL, L_FX); g.userData.flash = flash; g.userData.flashL = flashL; g.userData.gunL = g.getObjectByName('gunL'); g.userData.gunR = g.getObjectByName('gunR'); g.userData.rest = [0, -.42, -.5, 0, 0, 0];
  return g;
}
/** The Breacher's shield as seen from behind it in first person. */
export function vmShield() {
  const g = new THREE.Group();
  put(plate(rrect(.62, .8, .08), .05, .018), M.shield, g); put(plate(rrect(.36, .13, .03), .05, .015), M.gunm, g, [0, .22, .03]); put(plate(rrect(.3, .07, .02), .07, .008), M.visG, g, [0, .22, .0]);
  put(tube([[-.14, -.1, .03], [0, -.1, .1], [.14, -.1, .03]], .026, 6), M.leaB, g); put(rbox(.62, .08, .02, .008), M.haz, g, [0, .34, .028]);
  for (const [x, y] of [[-.25, .33], [.25, .33], [-.25, -.33], [.25, -.33]]) put(blob(.05, .05, .03), M.nS, g, [x, y, .03]);
  bake(g); g.userData.rest = [-.5, -.52, -.62, .1, .55, -.1]; g.userData.ads = [-.12, -.47, -.52, -.1, .12, 0];
  return setLayer(g, L_VM) as THREE.Group;
}

// ---------------------------------------------------------------- world dressing
export const ROAD_Z = 14;
function segDist(x: number, z: number, ax: number, az: number, bx: number, bz: number) { const dx = bx - ax, dz = bz - az, t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz))); return Math.hypot(x - ax - dx * t, z - az - dz * t); }
/** Places the player may need to walk or build, kept free of rocks. */
export function isClear(x: number, z: number, pad = 0) {
  const end = roadPt(ROAD.len + 6);
  if (nearGround(x, z, Math.max(1.5, 4 + pad))) return true;   // cliffs, ramps, vents, beacons and rock walls keep their own ground
  if (Math.hypot(x, z) < 44 + pad || Math.hypot(x - OUTPOST.x - 2 * ROAD.dx, z - OUTPOST.z - 2 * ROAD.dz) < 36 + pad || segDist(x, z, ROAD.x, ROAD.z, end[0], end[1]) < 9 + pad) return true;
  for (const [ex, ez] of MAP.sites || [MAP.exp]) if (Math.hypot(x - ex, z - ez) < 22 + pad || segDist(x, z, ex, ez, 0, 0) < 6 + pad) return true;
  for (const r of (MAP.roads || []).slice(1)) if (segDist(x, z, r[0], r[1], r[2], r[3]) < 7 + pad) return true;
  let px = OUTPOST.x, pz = OUTPOST.z; for (const [qx, qz] of NORTH_PATH) { if (segDist(x, z, px, pz, qx, qz) < 8 + pad) return true; px = qx; pz = qz; }
  return segDist(x, z, px, pz, 0, 0) < 8 + pad;
}
function flora(g: THREE.Object3D, x: number, z: number, s: number) {
  const n = 2 + Math.floor(R(0, 3));
  for (let i = 0; i < n; i++) { const a = R(0, 6.3), l = R(.6, 1.6) * s, tx = x + Math.cos(a) * .3 * s, tz = z + Math.sin(a) * .3 * s; mk(tube([[x, 0, z], [tx, l * .6, tz], [tx + Math.cos(a) * l * .4, l, tz + Math.sin(a) * l * .4]], [.07 * s, .05 * s, .03 * s], 6), M.fabG, 0, 0, 0, g); mk(blob(.3, .36, .3), i % 2 ? M.vM : M.violet, [tx + Math.cos(a) * l * .4, l + .1 * s, tz + Math.sin(a) * l * .4], [s, s, s], 0, g); }
}
/** Six clumps of dry grass, each a fan of thin curved blades. Made once and shared by every clump on every map. */
let tuftPool: THREE.BufferGeometry[][] | null = null;
function tufts() {
  if (tuftPool) return tuftPool; let s = 4177; const D = (a: number, b: number) => { s = (s * 16807) % 2147483647; return a + (b - a) * s / 2147483647; };
  // A clump is a couple of dozen thin three-sided blades: tall ones leaning out from the middle and a skirt of short ones round the foot, so it reads as dry grass and not as a handful of straws.
  return tuftPool = [0, 1, 2, 3, 4, 5].map(() => { const n = 13 + Math.floor(D(0, 7)), m = 8 + Math.floor(D(0, 5)), out: THREE.BufferGeometry[] = [];
    for (let k = 0; k < n; k++) { const a = k / n * 6.28 + D(-.5, .5), l = D(.5, 1.15), o = D(.12, .6), d = D(0, .12), ca = Math.cos(a), sa = Math.sin(a), bend = D(-.12, .12); out.push(blade([ca * d, 0, sa * d], [ca * (d + l * o * .4) - sa * bend, l * .6, sa * (d + l * o * .4) + ca * bend], [ca * (d + l * o), l * D(.9, 1), sa * (d + l * o)], D(.028, .042))); }
    for (let k = 0; k < m; k++) { const a = k / m * 6.28 + D(-.5, .5), l = D(.2, .5), o = D(.5, 1.2), d = D(.08, .26), ca = Math.cos(a), sa = Math.sin(a); out.push(blade([ca * d, 0, sa * d], [ca * (d + l * o * .5), l * .6, sa * (d + l * o * .5)], [ca * (d + l * o), l * .85, sa * (d + l * o)], D(.022, .032))); }
    return [mergeGeometries(out)]; });
}
export function buildWorld(scene: THREE.Scene, props: Prop[], anim: ((t: number) => void)[]) {
  const w = new THREE.Group(); scene.add(w); reseed(7919 + Math.round(MAP.out[0] * 31 + MAP.out[1] * 17));
  // Scenery is drawn as a few big merged meshes. Each prop remembers which vertices are its own, so it can crumble or vanish without costing a draw call.
  const batches = new Map<THREE.Material, { geos: THREE.BufferGeometry[]; recs: { p: Prop; start: number; count: number }[]; n: number }>();
  type Opt = { solid?: boolean; stages?: number; y0?: number; at?: [number, number, number] };
  const ang = Math.atan2(ROAD.dz, ROAD.dx), [cx, cz] = MAP.mid || [MAP.out[0] / 2, MAP.out[1] / 2], HID = !!MAP.hid, RAD = MAP.rad || 200;
  /** A spot somewhere on a hidden map's disc. */
  const disc = (f: number, a = R(0, 6.2832), d = Math.sqrt(R(0, 1))): [number, number] => [cx + Math.cos(a) * d * RAD * f, cz + Math.sin(a) * d * RAD * f];
  const prop = (kind: Prop['kind'], name: string, x: number, z: number, r: number, h: number, hp: number, o: Opt, build?: (g: THREE.Group) => void): Prop => {
    const p: Prop = { id: props.length, kind, name, x, z, r, y0: o.y0 || 0, h, hp, maxHp: hp, alive: true, solid: !!o.solid, stage: 0, stages: o.stages || 0, ranges: [], link: [] }; props.push(p);
    if (build) {
      const g = new THREE.Group(); if (o.at) { g.position.set(o.at[0], 0, o.at[1]); g.rotation.y = o.at[2]; } build(g); const gy = groundH(x, z); if (gy > 0 && !o.at) { g.position.y += gy; p.y0 += gy; } else if (gy > 0) { g.position.y = gy; p.y0 += gy; } g.updateMatrixWorld(true);
      g.traverse(c => { const m = c as THREE.Mesh; if (!m.isMesh) return; const geo = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone(); geo.applyMatrix4(m.matrixWorld);
        for (const k of Object.keys(geo.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'uv') geo.deleteAttribute(k);
        const mat = m.material as THREE.Material; let b = batches.get(mat); if (!b) batches.set(mat, b = { geos: [], recs: [], n: 0 }); const count = geo.attributes.position.count; b.recs.push({ p, start: b.n, count }); b.n += count; b.geos.push(geo); });
    }
    return p;
  };
  mk(new THREE.PlaneGeometry(3000, 3000), M.ground, 0, 0, [-Math.PI / 2, 0, 0], w);
  // The road is painted by the ground itself: it only needs to know where the road runs.
  { const u = M.ground.uniforms, rs = MAP.roads || [[...roadPt(-25), ...roadPt(ROAD.len + 41)]]; rs.slice(0, 10).forEach((r, i) => u.uRoads.value[i].set(r[0], r[1], r[2], r[3])); u.uRoadN.value = Math.min(10, rs.length); u.uRoadW.value = 3; }
  // far mesas: the skyline. A long walk away, but they are real: they block you, take damage and come down like everything else.
  for (let i = 0; i < 36; i++) {
    const a = i / 36 * 6.283 + R(-.06, .06), d0 = R(250, 430), d = HID ? RAD + 70 + (d0 - 250) : d0 * Math.max(1, (MAP.k || 1) * .95), r = R(34, 80), h = R(24, 90), x = cx + Math.cos(a) * d, z = cz + Math.sin(a) * d, top = r * R(.55, .8), sides = 7 + (i % 3), ry = R(0, 3), cap = i % 3 === 0, kx = x + R(-10, 10), kz = z + R(-10, 10), cry = R(0, 3);
    prop('mesa', 'Mesa', x, z, r * .9, cap ? h * 1.45 : h, 9000 + r * h * 3, { solid: true, stages: 3 }, g => { mk(crag(top, r, h, sides + 4, rnd), M.mesa, [x, h / 2 - 1, z], 0, [0, ry, 0], g); if (cap) mk(crag(r * .3, r * .42, h * .5, 9, rnd, 3), M.mesa, [kx, h + h * .22, kz], 0, [0, cry, 0], g); });
  }
  // nearer buttes inside the map: big, slow to bring down, but they do come down
  for (let i = 0; i < MAP.buttes; i++) { const a = i / MAP.buttes * 6.283 + .4, d0 = R(150, 185), d = (HID ? d0 / 190 * RAD : d0 * (MAP.k || 1)) * (i % 2 && MAP.buttes > 10 ? .62 : 1), r = R(10, 20), h = R(14, 34), x = cx + Math.cos(a) * d, z = cz + Math.sin(a) * d * (HID ? 1 : .8); if (isClear(x, z, r + 6)) continue;
    prop('mesa', 'Butte', x, z, r * .95, h * 1.3, 2600 + r * h * 6, { solid: true, stages: 3 }, g => { mk(crag(r * .7, r, h, 11, rnd), M.mesa, [x, h / 2 - .5, z], 0, [0, R(0, 3), 0], g); mk(crag(r * .4, r * .55, h * .4, 9, rnd, 3), M.mesa, [x + R(-3, 3), h * 1.18, z + R(-3, 3)], 0, [0, R(0, 3), 0], g); }); }
  // A vast map is broken up by buttes standing out in the open, so you cannot see from one end to the other. Each stands alone with room to walk round it: nothing here finds a path, so a wall of rock would trap a squad.
  if ((MAP.k || 1) >= 1.9) { const put: number[][] = [], K = MAP.k || 1;
    for (let i = 0; i < (HID ? 120 : 64); i++) { const [x, z] = HID ? disc(.93) : [cx + R(-158, 158) * K, cz + R(-128, 128) * K], r = R(8, 17), h = R(12, 32), ry = R(0, 3), ry2 = R(0, 3), ox = R(-3, 3), oz = R(-3, 3); if (isClear(x, z, r + 7) || put.some(q => Math.hypot(x - q[0], z - q[1]) < r + q[2] + 16)) continue; put.push([x, z, r]);
      prop('mesa', 'Butte', x, z, r * .95, h * 1.3, 2600 + r * h * 6, { solid: true, stages: 3 }, g => { mk(crag(r * .7, r, h, 11, rnd), M.mesa, [x, h / 2 - .5, z], 0, [0, ry, 0], g); mk(crag(r * .4, r * .55, h * .4, 9, rnd, 3), M.mesa, [x + ox, h * 1.18, z + oz], 0, [0, ry2, 0], g); }); } }
  // rocks, spires and plants
  for (let i = 0; i < MAP.rocks; i++) {
    const [x, z] = HID ? disc(.97) : [cx + R(-170, 170) * (MAP.k || 1), cz + R(-140, 140) * (MAP.k || 1)];
    if (i % MAP.spireEvery === 0) { const h = R(8, 20), ww = h * .34; if (isClear(x, z, ww + 2)) continue;
      prop('rock', 'Rock spire', x, z, ww * .5, h + 1, 350 + h * 45, { solid: true, stages: 2 }, g => { mk(crag(ww * .36, ww * .5, h, 8, rnd, 6), M.rockB, [x, h / 2 - .5, z], 0, [R(-.08, .08), R(0, 3), R(-.08, .08)], g); mk(rocks(i), M.rockB, [x + 1, h + .6, z], [h * .3, h * .22, h * .3], [0, R(0, 3), 0], g); if (i % (MAP.spireEvery * 2) === 0) mk(crag(ww * .25, ww * .35, h * .5, 7, rnd, 4), M.rockB, [x + ww * .9, h * .22, z + ww * .5], 0, [R(-.2, .2), R(0, 3), R(-.2, .2)], g); }); }
    else if (i % 8 < 5) { if (isClear(x, z, -3) && i % 3) continue; const sc = R(.4, 2.0); prop('rock', 'Boulder', x, z, sc * .55, sc * .6, 40 + sc * 70, {}, g => { mk(rocks(i), M.rockB, [x, sc * .25, z], [sc * 1.15, sc * R(.6, 1.0), sc * R(.8, 1.3)], [0, R(0, 3), 0], g); }); }
    else if (!isClear(x, z, -6) || Math.hypot(x, z) > 30) { const sc = R(.7, 1.5); prop('plant', 'Bulb weed', x, z, .5 * sc, 1.8 * sc, 8, {}, g => flora(g, x, z, sc)); }
  }
  // The Needle's Eye: a rock arch over the road halfway to the outpost. Knock out a leg and the lintel comes down.
  if (MAP.arch) { const legs: Prop[] = [], at: [number, number, number] = [...roadPt(MAP.arch), -ang] as any, mid = roadPt(MAP.arch);
    for (const sz of [-1, 1]) { const z = sz * 8.5, q = roadPt(MAP.arch, z); legs.push(prop('rock', 'Needle\'s Eye', q[0], q[1], 2.6, 12, 1500, { solid: true, stages: 2, at }, g => { mk(crag(2.0, 2.6, 13, 9, rnd, 6), M.rockB, [0, 6, z], 0, [0, sz, sz * .06], g); mk(rocks(sz + 2), M.rockB, [.5, .8, z + sz * 2.6], [3.4, 2.4, 3.4], [0, 2, 0], g); })); }
    const top = prop('rock', 'Needle\'s Eye', mid[0], mid[1], 2.4, 16, 900, { y0: 11.2, at }, g => { mk(slab(4.4, 3, 22, 5, .7), M.rockB, [0, 12.6, 0], 0, [0, 0, .04], g); mk(rocks(1), M.rockB, [0, 14.6, -4], [5.6, 3.4, 6.6], [0, 1, 0], g); mk(rocks(4), M.rockB, [.4, 14.2, 5], [4.6, 3, 5.6], [0, 2, 0], g); beam([-1, 11, -3], [-1, 8.6, -3], .03, M.rubber, g); mk(G.box, M.sign, [-1, 7.9, -3], [.1, 1.3, 3.6], 0, g); });
    for (const l of legs) l.link.push(top); }
  // crashed ore hauler south of the road
  if (MAP.wreck) { const [wx, wz] = MAP.wreck; const hull = prop('metal', 'Wrecked hauler', wx, wz, 3.2, 3.6, 1400, { solid: true, stages: 1 }, gg => { const g = new THREE.Group(); g.position.set(wx, 0, wz); g.rotation.set(0, .5, .12); gg.add(g);
      mk(slab(9, 3, 3.6, 3, .14), M.wallR, [0, 1.6, 0], 0, 0, g); mk(slab(3.6, 2.6, 3.4, 3, .12), M.wallT, [-6.6, 1.3, .4], 0, [0, .2, .1], g); mk(slab(2.2, 2.6, 3.2, 2.6, .2), M.wallD, [5.4, 1.9, 0], 0, 0, g); mk(plate(rrect(2.4, .9, .1), .1, .03), M.visG, [6.5, 2.3, 0], 0, [0, H2, 0], g);
      for (const x of [-3, 0, 3, 5.4]) for (const sz of [-1, 1]) { mk(can(.75, .7, .12), M.rib, [x, .5, sz * 1.9], 0, [Math.PI / 2, 0, 0], g); mk(blob(.7, .7, .2), M.nD, [x, .5, sz * 2.24], 0, 0, g); }
      mk(G.cyl, M.steelD, [4.6, 3.9, -1], [.3, 1.6, .3], 0, g); for (let i = 0; i < 5; i++) mk(shard(.3, 1.4, 5, .3), M.ore, [-2.5 + i * 1.2 + R(-.3, .3), 3.2, R(-.8, .8)], [1, R(.8, 1.3), 1], [R(-.4, .4), 0, R(-.4, .4)], g); });
    for (const [x, z] of [[wx - 4, wz - 2], [wx + 4, wz + 2.4]]) { const part = prop('metal', 'Wrecked hauler', x, z, 2.6, 3.4, 1, { solid: true }); part.owner = hull; hull.link.push(part); }
    prop('crystal', 'Spilled ore', wx - 8, wz + 4, 3.5, 1.2, 80, {}, g => { for (let i = 0; i < 6; i++) mk(shard(.25, 1.1, 5, .3), M.ore, [wx - 8 + R(-4, 4), .4, wz + 4 + R(-3, 3)], [1, R(.8, 1.3), 1], [R(-1, 1), 0, R(-1, 1)], g); }); }
  // base dressing
  for (const [x, z, r] of [[-9, 13, 0], [12, 16, .4], [-14, -4, 1.2], [9, -14, 2]] as P3[]) prop('metal', 'Floodlight', x, z, .4, 7.8, 160, {}, gg => { const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = r; gg.add(g); beam([0, 0, 0], [0, 7, 0], .12, M.steelD, g); beam([0, 7, 0], [1.2, 7.6, 0], .08, M.steelD, g); mk(G.box, M.visor, [1.4, 7.5, 0], [.9, .3, .7], [0, 0, -.5], g); mk(G.box, M.concrete, [0, .2, 0], [.8, .4, .8], 0, g); });
  for (const [x, z] of [[-8, 9], [-9.4, 9.6], [-8.6, 10.6], [8.5, 8.2], [14, -4], [15.2, -3.4], ...(MAP.hid ? [] : [roadPt(30, 6), roadPt(31.2, 6.6), roadPt(58, -5), roadPt(59, -4.1), roadPt(88, 5), roadPt(96, -5.5), roadPt(97.2, -5.8)])]) prop('barrel', 'Fuel drum', x, z, .48, 1.25, 30, { solid: x < -7 }, g => { mk(can(.4, 1.2, .04), i3(x) ? M.wallR : M.bY, [x, .6, z], 0, [0, R(0, 3), 0], g); mk(ring(.405, .04), M.red, [x, 1.0, z], 0, [H2, 0, 0], g); mk(ring(.405, .03), M.nD, [x, .3, z], 0, [H2, 0, 0], g); });
  for (const [x, z, m] of [[-11.5, 6, 0], [-11.2, 4.6, 1], [-11.6, 5.3, 2]] as P3[]) prop('metal', 'Crate', x, z, .75, m === 2 ? 2.4 : 1.2, 90, { solid: m !== 2, y0: m === 2 ? 1.15 : 0 }, g => { mk(slab(1.2, 1.2, 1.2, 1.2, .07), [M.wallT, M.wallR, M.wallY][m], [x, m === 2 ? 1.75 : .6, z], 0, [0, R(0, 1), 0], g); });
  { const pipe = prop('metal', 'Pipeline', 13.5, -5, .5, .6, 260, {}, g => { beam([7, .25, 1], [20, .25, -11], .22, M.steelD, g); beam([7, .25, 1], [7, .25, 4], .22, M.steelD, g); for (let i = 0; i < 5; i++) mk(G.box, M.concrete, [8.6 + i * 2.6, .2, -.5 - i * 2.4], [.6, .5, .6], 0, g); });
    for (let i = 0; i <= 6; i++) { if (i === 3) continue; const part = prop('metal', 'Pipeline', 7 + 13 * i / 6, 1 - 12 * i / 6, .5, .6, 1, {}); part.owner = pipe; pipe.link.push(part); } }
  for (let i = 0; i < 7; i++) { const a = -2.2 + i * .34, x = Math.cos(a) * 36, z = Math.sin(a) * 36; prop('metal', 'Fence', x, z, .35, 1.6, 40, {}, g => { beam([x, 0, z], [x, 1.5, z], .07, M.steelD, g); if (i) beam([x, 1.2, z], [Math.cos(a - .34) * 36, 1.2, Math.sin(a - .34) * 36], .04, M.rubber, g); }); }
  prop('rock', 'Seep pool', 26, 2, 3, .5, 300, {}, gg => { const g = new THREE.Group(); g.position.set(26, 0, 2); gg.add(g); mk(ring(1.5, .36, 1, 14), M.rockB, [0, .15, 0], 0, [Math.PI / 2, 0, 0], g); mk(G.disc, M.violet, [0, .22, 0], [2.6, 2.6, 1], [-Math.PI / 2, 0, 0], g); });
  // road markers
  const marker = (x: number, z: number) => prop('metal', 'Road marker', x, z, .35, 2.8, 60, {}, g => { beam([x, 0, z], [x, 2.2, z], .06, M.steelD, g); mk(G.box, M.hazard1, [x, 2.4, z], [.1, .6, .9], 0, g); });
  for (let rs = 16; rs < ROAD.len - 12; rs += 16) { if (Math.abs(rs - MAP.arch) < 6) continue; const [x, z] = roadPt(rs, rs % 32 ? 4.6 : -4.6); marker(x, z); }
  // the other roads get the same markers, so no road looks more used than the rest
  for (const [ax, az, bx, bz] of (MAP.roads || []).slice(1)) { const l = Math.hypot(bx - ax, bz - az), ux = (bx - ax) / l, uz = (bz - az) / l; for (let rs = 16; rs < l - 10; rs += 16) { const o = rs % 32 ? 4.6 : -4.6; marker(ax + ux * rs - uz * o, az + uz * rs + ux * o); } }
  // Veyl ground: glowing veins and crystal growths around the outpost. When the Gloam hold it: moss streaks and fungus.
  const GL = SIDE.out === 2;
  for (let i = 0; i < 26; i++) { const a = R(0, 6.3), d = R(8, 34), x = OUTPOST.x + 2 * ROAD.dx + Math.cos(a) * d, z = OUTPOST.z + 2 * ROAD.dz + Math.sin(a) * d, l = R(3, 9), ra = a + R(-.6, .6); mk(G.box, GL ? M.gGlow : M.teal, [x, .03, z], [l, .04, .16], [0, -ra, 0], w); if (i % 2) mk(G.box, GL ? M.gGlow : M.teal, [x + Math.cos(ra) * l * .5, .03, z + Math.sin(ra) * l * .5], [l * .5, .04, .12], [0, -ra + .9, 0], w); }
  for (let i = 0; i < MAP.crystals; i++) { const a = R(0, 6.3), far = i >= 22, d = far ? R(40, 150) : R(18, 38), x = OUTPOST.x + 2 * ROAD.dx + Math.cos(a) * d, z = OUTPOST.z + 2 * ROAD.dz + Math.sin(a) * d, re = roadPt(ROAD.len + 6); if (segDist(x, z, ROAD.x, ROAD.z, re[0], re[1]) < 6 || (far && isClear(x, z, 2))) continue; const n = 2 + Math.floor(R(0, 3));
    prop('crystal', GL ? 'Fungus clump' : 'Crystal growth', x, z, 1, 3.4, 120, { solid: i % 4 === 0 }, g => { for (let k = 0; k < n; k++) { const h = R(1.2, 4.5), px = x + R(-.8, .8), pz = z + R(-.8, .8), rx = R(-.5, .5), ry = R(0, 3), rz = R(-.5, .5);
      if (GL) { const s = h / 3; mk(tube([[0, 0, 0], [rx * .3, 1.4, rz * .3], [rx * .6, 2.6, rz * .6]], [.22, .17, .14], 7), M.gB, [px, 0, pz], [s, s, s], 0, g); mk(lathe(spl([[.05, .5], [1.0, .32], [1.15, .05], [.9, -.08], [.2, -.05]], 7), 14), k % 3 ? M.gC : M.gCb, [px + rx * .6 * s, 2.55 * s, pz + rz * .6 * s], [s, s, s], [rx * .4, ry, rz * .4], g); }
      else mk(shard(.5, 3, 5 + (k % 2), .28), k % 3 ? M.vC : M.vL, [px, h * .26, pz], [h / 3, h / 3, h / 3], [rx, ry, rz], g); } }); }
  // Veyl outpost dressing: brood domes, tall reeds and a dais in the middle
  for (const [x, z, sc] of [[-12, -19, 1], [12, -17, 1.2], [17, 14, 1], [4, 21, 1.3], [-17, 19, .9]].map(([a, b, c]) => [...veylPt(a, b), c])) prop('veyl', GL ? 'Puffball' : 'Brood dome', x, z, 3 * sc, 4.6 * sc, 900, { solid: true, stages: 2 }, gg => { const g = new THREE.Group(); g.position.set(x, 0, z); g.scale.setScalar(sc); g.rotation.y = R(0, 6); gg.add(g);
    if (GL) { mk(lathe(spl([[2.6, 0], [3.1, .7], [3.0, 1.9], [2.2, 2.9], [1.0, 3.4], [0, 3.5]], 12), 22), M.gH, [0, 0, 0], 0, 0, g); for (let i = 0; i < 7; i++) { const a = i * .9, e = 1.2 + (i % 3) * .55; mk(blob(.5, .32, .5), M.gS, [Math.cos(a) * e * 1.6, 3.35 - e * .55, Math.sin(a) * e * 1.6], 0, [0, a, 0], g); } mk(G.disc, M.gMaw, [0, 1.1, 2.95], [1.0, 1.3, 1], 0, g); mk(ring(.5, .12), M.gB, [0, 1.1, 2.9], [1.4, 1.8, 2], 0, g); for (let i = 0; i < 4; i++) { const a = i * 1.57 + .8; mk(blob(.6, .4, .6), M.gD, [Math.cos(a) * 3, .2, Math.sin(a) * 3], 0, 0, g); } return; }
    mk(lathe(spl([[3.1, 0], [3.0, .9], [2.5, 1.9], [1.5, 2.55], [.5, 2.75], [0, 2.78]], 12), 20), M.vI, [0, 0, 0], 0, 0, g); mk(ring(2.76, .12, .5, 36), M.mag, [0, 1.5, 0], 0, [Math.PI / 2, 0, 0], g); mk(ring(1.9, .08, 1, 30), M.vG, [0, 2.32, 0], 0, [Math.PI / 2, 0, 0], g); mk(shard(.26, 2.2, 6, .2), M.vC, [0, 2.7, 0], 0, 0, g); mk(G.disc, M.violet, [0, 1.1, 2.86], [1.5, 1.9, 1], 0, g); mk(ring(.5, .12), M.vL, [0, 1.1, 2.8], [1.9, 2.4, 2], 0, g);
    for (let i = 0; i < 4; i++) { const a = i * 1.57 + .8; mk(shard(.2, 1.3, 5, .28), M.vC, [Math.cos(a) * 3, .4, Math.sin(a) * 3], 0, [R(-.4, .4), 0, R(-.4, .4)], g); } });
  for (const [x, z] of [[-20, -15], [22, -5], [10, 25], [-24, 11], [-6, 27], [20, -21]].map(([a, b]) => veylPt(a, b))) prop('veyl', GL ? 'Stalk stand' : 'Reed stand', x, z, 2.4, 9, 140, {}, g => { for (let k = 0; k < 6; k++) { const h = R(5, 11), rx = x + R(-2, 2), rz = z + R(-2, 2), lean = R(-.6, .6); const tz = rz + R(-.5, .5); mk(tube([[rx, 0, rz], [rx + lean * .2, h * .5, (rz + tz) / 2], [rx + lean, h, tz]], [.12, .09, .04], 6), (GL ? M.gB : M.vL), 0, 0, 0, g); mk(shard(.13, .8, 4, .35), (GL ? M.gS : M.teal), [rx + lean, h + .1, tz], 0, 0, g); } });
  if (MAP.set) storySet(MAP.set, prop, w, scene, anim);
  if (!GL) { mk(G.hexT, M.indigoL, [OUTPOST.x, .06, OUTPOST.z], [11, .12, 11], 0, w); mk(G.torusF, M.teal, [OUTPOST.x, .16, OUTPOST.z], [4.6, 4.6, .6], [Math.PI / 2, 0, 0], w); } mk(G.torusF, GL ? M.gD : M.mag, [OUTPOST.x, .16, OUTPOST.z], [2.2, 2.2, .6], [Math.PI / 2, 0, 0], w);
  buildTerrain(prop, w, anim);
  // Set dressing: the litter of a working frontier. Dry scrub, loose stones, scrap, old bones and spoil heaps, none of it in anybody's way.
  // It has its own dice, so adding to it never moves a mesa or a seam, and like everything else out here it can be shot or flattened.
  { let ds = 90001 + Math.round(MAP.out[0] * 13 + MAP.out[1] * 7); const D = (a = 0, b = 1) => { ds = (ds * 16807) % 2147483647; return a + (b - a) * ds / 2147483647; }, K = HID ? 3.1416 * RAD * RAD / 101500 * .55 : (MAP.k || 1) ** 2;
    const solids = props.filter(q => q.solid), roadEnd = roadPt(ROAD.len + 6);
    const free = (x: number, z: number, pad: number) => !nearGround(x, z, 2 + pad) && Math.hypot(x, z) > 15 && Math.hypot(x - OUTPOST.x, z - OUTPOST.z) > 13 && segDist(x, z, ROAD.x, ROAD.z, roadEnd[0], roadEnd[1]) > 4.4 + pad && !solids.some(q => Math.hypot(x - q.x, z - q.z) < q.r + 1 + pad);
    const dress = (kind: Prop['kind'], name: string, x: number, z: number, r: number, h: number, hp: number, build: (g: THREE.Group) => void) => { prop(kind, name, x, z, r, h, hp, { at: [x, z, D(0, 6.28)] }, build).dress = true; };
    const spot = (): [number, number] => HID ? disc(.98, D(0, 6.2832), Math.sqrt(D())) : [cx + D(-175, 175) * (MAP.k || 1), cz + D(-145, 145) * (MAP.k || 1)];
    for (let i = 0; i < 260 * K; i++) { const [x, z] = spot(); if (!free(x, z, 0)) continue; const sc = D(.7, 1.6), blades = tufts()[i % 6], mat = i % 4 ? M.straw : M.fabG;
      dress('plant', 'Dry scrub', x, z, .5 * sc, .9 * sc, 6, g => { for (const b of blades) mk(b, mat, 0, [sc, sc, sc], 0, g); }); }
    for (let i = 0; i < 110 * K; i++) { const [x, z] = spot(); if (!free(x, z, 0)) continue; const n = 3 + Math.floor(D(0, 4));
      dress('rock', 'Loose stones', x, z, .9, .5, 24, g => { for (let k = 0; k < n; k++) { const sc = D(.18, .6), a = D(0, 6.28), d = k ? D(.3, 1.3) : 0; mk(rocks(i + k), M.rockB, [Math.cos(a) * d, sc * .22, Math.sin(a) * d], [sc * 1.2, sc * D(.6, .9), sc], [0, D(0, 3), 0], g); } }); }
    const junk = (t: number, i: number, x: number, z: number) => { const wm = [M.wallR, M.wallT, M.wallD, M.wallY][i % 4];
      if (t === 0) dress('metal', 'Old tyres', x, z, .8, 1.1, 50, g => { const n = 1 + Math.floor(D(0, 3)); for (let k = 0; k < n; k++) mk(ring(.46, .19, 1, 14), M.rib, [D(-.06, .06), .19 + k * .36, D(-.06, .06)], 0, [H2, 0, 0], g); mk(ring(.46, .19, 1, 14), M.rib, [.95, .5, .1], 0, [0, D(-.4, .4), .28], g); });
      else if (t === 1) dress('metal', 'Scrap sheet', x, z, .9, 1.1, 50, g => { mk(slab(1.7, 1.15, .07, 1.3, .02), wm, [0, .5, 0], 0, [-.42, 0, D(-.12, .12)], g); mk(slab(1.1, .8, .06, 1.3, .02), M.wallD, [.5, .05, .7], 0, [-H2 + .06, .5, 0], g); beam([-.6, 0, -.3], [-.55, 1.0, -.1], .04, M.steelD, g); });
      else if (t === 2) dress('barrel', 'Dead drum', x, z, .7, .9, 40, g => { mk(can(.4, 1.2, .04), i % 2 ? M.wallR : M.bS, [0, .38, 0], 0, [H2, 0, D(0, 3)], g); mk(blob(.5, .12, .7), M.nD, [.1, .03, .8], 0, 0, g); });
      else if (t === 3) dress('metal', 'Pipe offcuts', x, z, 1.1, .5, 60, g => { beam([-1.2, .2, 0], [1.3, .2, .3], .2, M.steelD, g); beam([-.9, .2, .5], [1.0, .2, .9], .2, M.steelD, g); beam([-.6, .55, .25], [.8, .55, .6], .2, M.bS, g); });
      else if (t === 4) dress('metal', 'Sunk crate', x, z, .8, .9, 60, g => { mk(slab(1.15, 1.15, 1.15, 1.2, .07), wm, [0, .32, 0], 0, [.24, 0, .17], g); mk(rocks(i), M.rockB, [.8, .12, .3], [.5, .3, .5], 0, g); });
      else if (t === 5) dress('metal', 'Survey stake', x, z, .3, 1.8, 20, g => { beam([0, 0, 0], [.06, 1.7, 0], .035, M.steelD, g); mk(G.box, M.red, [.3, 1.5, 0], [.5, .3, .03], [0, 0, -.08], g); mk(rocks(i), M.rockB, [.1, .08, .15], [.3, .2, .3], 0, g); });
      else dress('metal', 'Claim sign', x, z, .7, 2, 40, g => { beam([-.5, 0, 0], [-.46, 1.7, 0], .05, M.steelD, g); beam([.5, 0, 0], [.52, 1.5, 0], .05, M.steelD, g); mk(G.box, [M.signKeep, M.hazard1, M.signMine][i % 3], [0, 1.3, .03], [1.3, .55, .05], [0, 0, -.1], g); });
    };
    for (let i = 0; i < 54 * K; i++) { let x: number, z: number; if (i % 3 === 0) { const q = roadPt(D(10, ROAD.len - 8), (D() < .5 ? -1 : 1) * D(7, 15)); x = q[0]; z = q[1]; } else if (i % 3 === 1) { const a = D(0, 6.28), d = D(30, 60); x = Math.cos(a) * d; z = Math.sin(a) * d; } else[x, z] = spot();
      if (!free(x, z, .6) || isClear(x, z, -34)) continue; junk(Math.floor(D(0, 7)), i, x, z); }
    for (let i = 0; i < 6 * K; i++) { const [x, z] = spot(); if (!free(x, z, 2) || isClear(x, z, -10)) continue;
      dress('rock', 'Old bones', x, z, 1.6, 1.4, 60, g => { for (let k = 0; k < 5; k++) mk(G.arc, M.nW, [0, 0, -1.4 + k * .62], [2.0 - k * .16, (2.3 - k * .24) * (k === 2 ? .7 : 1), 1.1], [0, 0, D(-.12, .12)], g); beam([0, .12, -1.8], [0, .16, 1.6], .09, M.nW, g); mk(blob(.62, .5, .85), M.nW, [0, .3, 2.4], 0, [-.2, D(-.5, .5), 0], g); for (const sx of [-1, 1]) mk(shard(.1, .8, 5, .3), M.nW, [sx * .42, .62, 2.3], 0, [-.5, 0, -sx * .9], g); }); }
    for (let i = 0; i < 7; i++) { const a = i / 7 * 6.28 + D(-.3, .3), d = D(34, 47), x = Math.cos(a) * d, z = Math.sin(a) * d; if (!free(x, z, 2) || isClear(x, z, -40)) continue; const r = 1.8 + (i % 3) * .5, h = r * .62;
      dress('rock', 'Spoil heap', x, z, r, h, 160, g => { mk(lathe(spl([[r, 0], [r * .82, h * .36], [r * .4, h * .84], [0, h]], 8), 10), M.rockB, 0, 0, 0, g); for (let k = 0; k < 3; k++) { const b = D(0, 6.28); mk(shard(.12, .5, 5, .3), M.ore, [Math.cos(b) * r * .55, h * .5, Math.sin(b) * r * .55], 0, [D(-.8, .8), 0, D(-.8, .8)], g); mk(rocks(i + k), M.rockB, [Math.cos(b + 2) * r, .12, Math.sin(b + 2) * r], [.5, .3, .45], 0, g); } }); }
    // A few places where somebody camped and left: a cold fire ring with their junk pulled up round it.
    for (let i = 0; i < 5 * K; i++) { const [x, z] = spot(); if (!free(x, z, 3.8) || isClear(x, z, -34)) continue;
      dress('rock', 'Cold camp fire', x, z, .9, .5, 40, g => { for (let k = 0; k < 7; k++) { const a = k / 7 * 6.28; mk(rocks(i + k), M.rockB, [Math.cos(a) * .72, .1, Math.sin(a) * .72], [.3, .22, .3], [0, D(0, 3), 0], g); } beam([-.4, .1, -.1], [.45, .17, .2], .07, M.nD, g); beam([-.2, .1, .35], [.3, .2, -.4], .06, M.nD, g); mk(blob(.5, .06, .5), M.nD, [0, .03, 0], 0, 0, g); });
      const n = 4 + Math.floor(D(0, 3)), a0 = D(0, 6.28);
      for (let k = 0; k < n; k++) { const a = a0 + k / n * 6.28 + D(-.3, .3), d = D(2.2, 3.7), px = x + Math.cos(a) * d, pz = z + Math.sin(a) * d; if (free(px, pz, .3)) junk(k === 0 ? 1 : k === 1 ? 0 : k === 2 ? 4 : Math.floor(D(0, 7)), i + k, px, pz); } }
  }
  bake(w);
  for (const [mat, b] of batches) { const geo = b.geos.length > 1 ? mergeGeometries(b.geos) : b.geos[0], mesh = new THREE.Mesh(geo, mat); mesh.frustumCulled = false; w.add(mesh); const attr = geo.attributes.position as THREE.BufferAttribute; for (const r of b.recs) r.p.ranges.push({ attr, start: r.start, count: r.count }); }
  // floating shards over the outpost
  for (let i = 0; i < 9; i++) { const a = i / 9 * 6.283, d = 12 + (i % 3) * 7, y0 = 9 + (i % 4) * 2.5, x = OUTPOST.x + 2 * ROAD.dx + Math.cos(a) * d, z = OUTPOST.z + 2 * ROAD.dz + Math.sin(a) * d; const m = GL ? mk(G.sph, i % 2 ? M.gS : M.gGlow, [x, y0, z], [.35, .35, .35], 0, scene) : mk(shard(.6, 2.6, 6, .4), i % 2 ? M.vC : M.vIp, [x, y0, z], [1, 1 + (i % 3) * .38, 1], [R(-.3, .3), 0, R(-.3, .3)], scene); anim.push(t => { m.position.y = y0 + Math.sin(t * .6 + i) * .7; m.rotation.y = t * .2 + i; });
    prop('crystal', 'Sky shard', x, z, .9, y0 + 2.6, 90, { y0: y0 - 2.4 }).obj = m; }
  reseed((Math.random() * 2147483647) | 0);
}
const i3 = (x: number) => Math.round(x * 10) % 3 === 0;
type PropFn = (kind: Prop['kind'], name: string, x: number, z: number, r: number, h: number, hp: number, o: { solid?: boolean; stages?: number; y0?: number; at?: [number, number, number] }, build?: (g: THREE.Group) => void) => Prop;
/** The story maps' set pieces. Each is built from props, so all of it can be shot at, and the important pieces are named for the jobs to find. */
function storySet(set: 'crack' | 'stone' | 'drill', prop: PropFn, w: THREE.Group, scene: THREE.Scene, anim: ((t: number) => void)[]) {
  const ang = Math.atan2(ROAD.dz, ROAD.dx), nx = -ROAD.dz, nz = ROAD.dx;
  if (set === 'crack') {
    // The split in the canyon floor: a jagged line off the side of the road, glass layers broken open along both lips, and the Gloam pushing up through it.
    const mid = roadPt(ROAD.len * .52, 34), pts: number[][] = [];
    for (let i = 0; i <= 18; i++) { const t = i / 18 - .5, j = Math.sin(i * 1.7) * 3.2 + R(-1.2, 1.2); pts.push([mid[0] + ROAD.dx * t * 96 + nx * j, mid[1] + ROAD.dz * t * 96 + nz * j]); }
    for (let i = 0; i < pts.length - 1; i++) {
      const [ax, az] = pts[i], [bx, bz] = pts[i + 1], cx = (ax + bx) / 2, cz = (az + bz) / 2, l = Math.hypot(bx - ax, bz - az) + .6, a = -Math.atan2(bz - az, bx - ax), wd = 3.4 - Math.abs(i - 9) * .28;
      mk(G.box, M.vL, [cx, .025, cz], [l, .05, wd * 1.25], [0, a, 0], w); mk(G.box, M.gMaw, [cx, .04, cz], [l, .06, wd * .85], [0, a, 0], w); mk(G.box, M.gGlow, [cx, .06, cz], [l * .7, .04, wd * .1], [0, a + R(-.05, .05), 0], w);
      // the glass layers broken open along the lips, tipped up out of the floor
      for (const sd of [-1, 1]) mk(slab(l * .9, .5, 1.1, .9, .2), sd > 0 ? M.vC : M.vIp, [cx + Math.sin(a) * sd * wd * .62, .12, cz + Math.cos(a) * sd * wd * .62], 0, [sd * R(.25, .5) * Math.sin(a), a, sd * R(.25, .5) * Math.cos(a)], w);
      for (const sd of [-1, 1]) { const ex = cx + Math.sin(a) * sd * wd * .55, ez = cz + Math.cos(a) * sd * wd * .55;
        prop('crystal', 'Broken glass', ex, ez, 1.1, 2.4, 160, {}, g => { for (let k = 0; k < 3; k++) mk(shard(.42, R(1.4, 3.2), 5, .3), k % 2 ? M.vC : M.vIp, [ex + R(-.8, .8), .5, ez + R(-.8, .8)], [1, 1, 1], [sd * R(.4, .9) * Math.cos(a), R(0, 3), sd * R(.4, .9) * Math.sin(-a)], g); mk(slab(1.8, .5, 1.2, 1, .3), M.vL, [ex, .2, ez], 0, [0, a, sd * .5], g); }); }
      if (i % 2 === 0) prop('crystal', 'Fungus clump', cx, cz, 1.4, 4.4, 220, {}, g => { for (let k = 0; k < 3; k++) { const s = R(.9, 1.6), px = cx + R(-1.2, 1.2), pz = cz + R(-1.2, 1.2); mk(tube([[0, 0, 0], [.2, 1.4, .1], [.3, 2.6, .2]], [.22, .17, .14], 7), M.gB, [px, 0, pz], [s, s, s], 0, g); mk(lathe(spl([[.05, .5], [1.0, .32], [1.15, .05], [.9, -.08], [.2, -.05]], 7), 14), k % 2 ? M.gC : M.gCb, [px + .3 * s, 2.55 * s, pz + .2 * s], [s, s, s], [R(-.3, .3), R(0, 3), R(-.3, .3)], g); } });
    }
    // Pale Bloom streaks fanning out from the crack, and spore puffs drifting over it.
    for (let i = 0; i < 40; i++) { const [px, pz] = pts[Math.floor(R(0, pts.length - .01))], a = R(0, 6.3), d = R(3, 16), l = R(2, 7); mk(G.box, i % 3 ? M.gH : M.gGlow, [px + Math.cos(a) * d, .025, pz + Math.sin(a) * d], [l, .03, .3], [0, -a, 0], w); }
    for (let i = 0; i < 14; i++) { const [px, pz] = pts[i + 2] || pts[0], y0 = R(2, 7), m = mk(G.sph, i % 2 ? M.gS : M.gGlow, [px, y0, pz], [.3, .3, .3], 0, scene); anim.push(t => { m.position.y = y0 + ((t * .4 + i * .37) % 1) * 6; m.scale.setScalar(.3 * (1 - ((t * .4 + i * .37) % 1))); }); }
  } else if (set === 'stone') {
    // The First Stone: the oldest Choir site on Tithe, behind the yard, inside a ring of standing glass.
    const sx = -40, sz = -4;
    prop('crystal', 'First Stone', sx, sz, 5.5, 30, 12000, { solid: true, stages: 3 }, g => {
      mk(crag(5, 7, 3, 12, rnd, 4), M.rockB, [sx, 1.2, sz], 0, 0, g); mk(G.hexT, M.indigoL, [sx, .1, sz], [18, .2, 18], 0, g); mk(G.torusF, M.teal, [sx, .2, sz], [8, 8, .7], [Math.PI / 2, 0, 0], g);
      mk(shard(2.6, 26, 6, .22), M.vC, [sx, 13, sz], 0, [0, .3, 0], g); mk(shard(1.4, 16, 6, .25), M.vIp, [sx + 2.6, 8, sz + 1], 0, [.16, 1, -.1], g); mk(shard(1.2, 13, 5, .3), M.vL, [sx - 2.4, 6.5, sz - 1.2], 0, [-.2, 2, .14], g); mk(shard(1, 10, 5, .3), M.vC, [sx + .6, 5, sz - 2.8], 0, [-.12, 0, .22], g);
      for (let k = 0; k < 3; k++) mk(ring(3.6 + k * 1.6, .1, 1, 40), M.mag, [sx, 6 + k * 6.5, sz], 0, [Math.PI / 2, 0, 0], g); });
    for (let i = 0; i < 8; i++) { const a = i / 8 * 6.283, x = sx + Math.cos(a) * 17, z = sz + Math.sin(a) * 17, h = R(7, 11);
      prop('crystal', 'Standing glass', x, z, 1.4, h, 1400, { solid: true, stages: 2 }, g => { mk(slab(2.2, h, 1, 1.6, .28), M.vC, [x, h / 2, z], 0, [0, -a, R(-.06, .06)], g); mk(G.box, M.mag, [x, h * .62, z], [2.3, .16, 1.05], [0, -a, 0], g); }); }
    // Old glass walls across the road, with a gap in the middle for the road itself. The Veyl built them; Mulchers go through them.
    for (const s0 of [ROAD.len * .38, ROAD.len * .66]) for (let k = -5; k <= 5; k++) { if (Math.abs(k) < 1) continue; const [x, z] = roadPt(s0, k * 3.4); if (Math.hypot(x, z) < 40) continue;
      prop('crystal', 'Glass wall', x, z, 1.7, 4.2, 700, { solid: true, stages: 2 }, g => { mk(slab(1, 4.2, 3.4, .7, .25), k % 2 ? M.vC : M.vIp, [x, 2.1, z], 0, [0, -ang, 0], g); mk(G.box, M.vL, [x, 4.25, z], [1.1, .2, 3.5], [0, -ang, 0], g); }); }
    // Glass monoliths standing out on the terraces.
    for (let i = 0; i < 22; i++) { const a = R(0, 6.3), d = R(60, 170) * (MAP.k || 1), x = MAP.out[0] / 2 + Math.cos(a) * d, z = MAP.out[1] / 2 + Math.sin(a) * d * .8, h = R(6, 16); if (isClear(x, z, 6)) continue;
      prop('crystal', 'Glass monolith', x, z, h * .12, h, 500 + h * 60, { solid: true, stages: 2 }, g => { mk(shard(h * .14, h, 5 + (i % 2), .25), i % 3 ? M.vC : M.vIp, [x, h * .48, z], 0, [R(-.1, .1), R(0, 3), R(-.1, .1)], g); mk(rocks(i), M.rockB, [x + .6, .4, z + .3], [h * .14, h * .08, h * .14], 0, g); }); }
  } else {
    // The Charter drill site: a lit lattice tower over a shaft in the glass, fenced, with three Deep Charge rigs sitting on the far fields.
    const [tx, tz] = roadPt(ROAD.len * .3, -30);
    prop('metal', 'Drill tower', tx, tz, 5, 34, 7000, { solid: true, stages: 2 }, g => {
      mk(G.disc, M.gMaw, [tx, .04, tz], [9, 9, 1], [-Math.PI / 2, 0, 0], g); mk(G.box, M.concrete, [tx, .3, tz], [12, .6, 12], 0, g);
      const c = [[-4, -4], [4, -4], [4, 4], [-4, 4]], top = 30;
      for (const [x, z] of c) { beam([tx + x, .5, tz + z], [tx + x * .3, top, tz + z * .3], .32, M.steelD, g); }
      for (let y = 4; y < top; y += 5) { const k = 1 - y / top * .7; for (let i = 0; i < 4; i++) { const [ax, az] = c[i], [bx, bz] = c[(i + 1) % 4]; beam([tx + ax * k, y, tz + az * k], [tx + bx * (k - .1), y + 5, tz + bz * (k - .1)], .12, M.steelD, g); beam([tx + ax * k, y, tz + az * k], [tx + bx * k, y, tz + bz * k], .14, M.hazard1, g); } }
      mk(slab(4, 4, 4, 3.4, .1), M.wallY, [tx, top + 2, tz], 0, 0, g); mk(G.box, M.sign, [tx, top + 2.4, tz + 2.05], [3.2, 1, .1], 0, g); mk(G.cyl, M.steel, [tx, top / 2, tz], [.9, top + 4, .9], 0, g);
      for (const [x, z] of c) mk(G.box, M.visor, [tx + x * .4, top + 4.4, tz + z * .4], [.8, .4, .8], 0, g); });
    for (let i = 0; i < 12; i++) { const a = i / 12 * 6.283, x = tx + Math.cos(a) * 14, z = tz + Math.sin(a) * 14; prop('metal', 'Fence', x, z, .35, 2.2, 60, {}, g => { beam([x, 0, z], [x, 2.1, z], .08, M.steelD, g); beam([x, 1.8, z], [tx + Math.cos(a + .52) * 14, 1.8, tz + Math.sin(a + .52) * 14], .05, M.hazard1, g); }); }
    for (const [x, z, r] of [[tx + 10, tz - 9, .6], [tx - 11, tz + 8, 2.4], [tx + 9, tz + 10, 4]] as P3[]) prop('metal', 'Floodlight', x, z, .4, 9, 160, {}, gg => { const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = r; gg.add(g); beam([0, 0, 0], [0, 8.4, 0], .14, M.steelD, g); mk(G.box, M.visor, [1.2, 8.6, 0], [1.4, .5, 1], [0, 0, -.5], g); mk(G.box, M.concrete, [0, .2, 0], [.9, .4, .9], 0, g); });
    const sites = (MAP.sites || []).slice(1, 4);
    sites.forEach(([sx0, sz0], i) => { const l = Math.hypot(sx0, sz0) || 1, x = sx0 - sx0 / l * 10, z = sz0 - sz0 / l * 10;
      prop('metal', 'Deep Charge rig', x, z, 2.4, 6, 2200, { solid: true, stages: 1 }, g => { mk(can(1.8, 4.2, .2), M.steelD, [x, 2.1, z], 0, 0, g); for (const y of [1, 2.4, 3.8]) mk(ring(1.85, .14, 1, 28), M.red, [x, y, z], 0, [Math.PI / 2, 0, 0], g); mk(G.box, M.hazard, [x, 4.6, z], [2.6, .6, 2.6], 0, g); for (let k = 0; k < 3; k++) { const a = k * 2.1; beam([x + Math.cos(a) * 1.8, 0, z + Math.sin(a) * 1.8], [x + Math.cos(a) * 4, 0, z + Math.sin(a) * 4], .16, M.rubber, g); } });
      const lamp = mk(G.sph, M.red, [x, 5.4, z], [.6, .6, .6], 0, scene); anim.push(t => { lamp.visible = Math.sin(t * 5 + i) > 0; }); });
  }
}
export { V3 };
