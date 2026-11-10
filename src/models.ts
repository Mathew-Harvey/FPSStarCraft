// Unit, structure and prop models. Everything is assembled from primitive shapes so the
// whole game ships as code. Models are baked (sibling meshes merged per material) so a unit
// costs a handful of draw calls, and units are cloned from one prototype per kind.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { G, M, R, mk, beam, setLayer, L_FX, L_VM, holoLine, V3, toonMaterial } from './gfx';
import type { Prop } from './data';

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
      for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'uv' && k !== 'aEm') g.deleteAttribute(k);
      let e = by.get(m.material); if (!e) by.set(m.material, e = { g: [], mask: c.layers.mask }); e.g.push(g); rm.push(c);
    } else if (c.children.length) bake(c);
  }
  for (const c of rm) root.remove(c);
  for (const [mat, e] of by) { const mesh = new THREE.Mesh(e.g.length > 1 ? mergeGeometries(e.g) : e.g[0], mat); mesh.layers.mask = e.mask; root.add(mesh); }
  return root;
}
// ---------------------------------------------------------------- unit texture atlas
// Every unit material is copied into one shared texture so that a whole limb is a single draw call.
const CELL = 256, PAD = 12, COLS = 8, ROWS = 4;
let atlas: { ctx: CanvasRenderingContext2D; tex: THREE.CanvasTexture; mat: THREE.ShaderMaterial; cells: Map<THREE.Material, number> } | null = null;
function atlasCell(m: THREE.ShaderMaterial) {
  if (!atlas) { const c = document.createElement('canvas'); c.width = CELL * COLS; c.height = CELL * ROWS; const tex = new THREE.CanvasTexture(c); tex.anisotropy = 4; atlas = { ctx: c.getContext('2d')!, tex, mat: toonMaterial(tex), cells: new Map() }; }
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
    const geo = m.geometry, uv = geo.attributes.uv as THREE.BufferAttribute, n = uv.count, em = new Float32Array(n).fill(u.uEmis.value), cx = i % COLS, cy = Math.floor(i / COLS), k = (CELL - PAD * 2) / CELL;
    for (let j = 0; j < n; j++) { const a = Math.min(1, Math.max(0, uv.getX(j))), b = Math.min(1, Math.max(0, uv.getY(j))); uv.setXY(j, (cx + PAD / CELL + a * k) / COLS, 1 - (cy + PAD / CELL + (1 - b) * k) / ROWS); }
    uv.needsUpdate = true; geo.setAttribute('aEm', new THREE.BufferAttribute(em, 1)); m.material = atlas!.mat;
  });
  return bake(root);
}

const grp = (name: string, parent: THREE.Object3D, p?: P3) => { const g = new THREE.Group(); g.name = name; if (p) g.position.set(p[0], p[1], p[2]); parent.add(g); return g; };

function leg(parent: THREE.Object3D, name: string, sx: number, legMat: THREE.Material, knee: boolean) {
  const g = grp(name, parent, [sx * .19, .6, 0]);
  mk(G.cyl, legMat, [0, -.2, 0], [.29, .38, .29], 0, g);
  mk(G.box, M.rubber, [.01 * sx, -.47, .05], [.33, .26, .5], 0, g);
  mk(G.box, M.steelD, [.01 * sx, -.5, .27], [.3, .16, .1], 0, g);
  if (knee) mk(G.sph, M.yellowP, [0, -.2, .13], [.24, .22, .16], 0, g);
  return g;
}
function limb(parent: THREE.Object3D, a: P3, b: P3, c: P3, r: number, mat: THREE.Material, hand: THREE.Material) {
  beam(a, b, r, mat, parent); beam(b, c, r * .9, mat, parent); mk(G.sph, mat, b, [r * 2.3, r * 2.3, r * 2.3], 0, parent); mk(G.sph, hand, c, [r * 2.9, r * 2.7, r * 2.9], 0, parent);
}
function muzzle(parent: THREE.Object3D, p: P3, s: number) {
  const f = grp('flash', parent, p); for (let i = 0; i < 3; i++) mk(G.cone4, M.flash, [0, 0, .25 * s], [.34 * s, .7 * s, .06 * s], [Math.PI / 2, 0, i * Math.PI / 3], f); mk(G.sph, M.flash, [0, 0, .05 * s], [.3 * s, .3 * s, .3 * s], 0, f);
  f.visible = false; setLayer(f, L_FX); return f;
}

/** Ironhold infantry. The heavy version is the Breacher: bulkier, with a riot shield and a scattergun. */
function trooper(heavy: boolean, role = ''): THREE.Group {
  const obj = new THREE.Group(), body = grp('body', obj);
  const plate = heavy ? M.orange : role === 'long' ? M.cloth : role === 'patch' ? M.red : M.yellowP, hel = heavy ? M.helmetB : role === 'long' ? M.steelD : M.helmet;
  leg(obj, 'legL', -1, M.steelD, true); leg(obj, 'legR', 1, M.steelD, true);
  for (const sx of [-1, 1]) {
    mk(G.sph, plate, [sx * .5, 1.1, 0], heavy ? [.62, .5, .62] : [.5, .42, .5], 0, body);
    mk(G.box, M.cloth, [sx * .24, .6, .2], [.16, .2, .1], 0, body);
    if (heavy) mk(G.box, M.steelD, [sx * .5, 1.36, 0], [.3, .1, .5], [0, 0, sx * -.3], body);
  }
  mk(G.box, M.rubber, [0, .62, 0], [.6, .16, .4], 0, body);
  mk(G.box, plate, [0, .62, .21], [.16, .14, .04], 0, body);
  mk(G.box, M.steel, [0, .92, 0], [.7, .5, .46], 0, body);
  mk(G.box, heavy ? M.hazard1 : M.yellow, [0, .96, .21], [.52, .32, .1], 0, body);
  mk(G.box, M.steelD, [0, .94, -.32], [.48, .5, .24], 0, body);
  mk(G.cyl, M.rust, [.14, 1.0, -.48], [.16, .5, .16], 0, body);
  mk(G.cyl, M.steel, [-.14, .96, -.48], [.12, .4, .12], 0, body);
  if (heavy) { mk(G.box, M.steelD, [0, 1.0, -.56], [.6, .6, .2], 0, body); mk(G.cyl, M.rust, [0, 1.36, -.5], [.2, .3, .2], [0, 0, Math.PI / 2], body); }
  const head = grp('head', body, [0, 1.3, 0]);
  mk(G.sph, hel, [0, .26, 0], [.84, .78, .84], 0, head);
  mk(G.box, M.rubber, [0, .27, .31], [.7, .27, .26], 0, head);
  mk(G.box, M.visor, [0, .27, .41], heavy ? [.5, .06, .1] : [.54, .11, .1], 0, head);
  if (heavy) { mk(G.box, M.steelD, [0, .12, .4], [.5, .14, .12], 0, head); mk(G.box, M.orange, [0, .62, 0], [.12, .14, .7], 0, head); }
  mk(G.box, M.steelD, [0, 0, .27], [.34, .16, .24], 0, head);
  for (const sx of [-1, 1]) mk(G.cyl, plate, [sx * .43, .22, 0], [.26, .1, .26], [0, 0, Math.PI / 2], head);
  mk(G.cyl, M.rubber, [.34, .7, -.1], [.035, .6, .035], 0, head); mk(G.sph, M.red, [.34, 1.02, -.1], [.09, .09, .09], 0, head);
  const arms = grp('arms', body, [0, 1.08, .05]);
  if (heavy) {
    limb(arms, [.52, 0, -.05], [.5, -.3, .14], [.34, -.3, .42], .11, M.steel, M.rubber);
    const gun = grp('gun', arms, [.34, -.26, .5]);
    mk(G.box, M.gun, [0, 0, .1], [.16, .22, .6], 0, gun); mk(G.cyl, M.steelD, [0, .04, .56], [.17, .5, .17], [Math.PI / 2, 0, 0], gun); mk(G.cyl, M.rubber, [0, .04, .82], [.2, .06, .2], [Math.PI / 2, 0, 0], gun); mk(G.box, M.orange, [0, -.06, .3], [.18, .1, .26], 0, gun); mk(G.box, M.rubber, [0, -.16, -.1], [.1, .24, .14], [.3, 0, 0], gun);
    muzzle(gun, [0, .04, .9], 1.5);
    const armL = grp('armL', body, [-.52, 1.08, 0]);
    limb(armL, [0, 0, 0], [-.06, -.28, .2], [.1, -.22, .46], .11, M.steel, M.rubber);
    mk(G.box, M.steel, [.14, -.14, .58], [.95, 1.45, .1], [0, .12, 0], armL); mk(G.box, M.hazard1, [.14, .22, .64], [.9, .3, .06], [0, .12, 0], armL); mk(G.box, M.visor, [.14, .44, .65], [.4, .09, .05], [0, .12, 0], armL); mk(G.box, M.steelD, [.14, -.76, .64], [.9, .14, .06], [0, .12, 0], armL);
  } else {
    limb(arms, [.5, 0, -.05], [.44, -.3, .16], [.16, -.3, .4], .1, M.steel, M.rubber);
    limb(arms, [-.5, 0, -.05], [-.38, -.3, .34], [-.02, -.26, .72], .1, M.steel, M.rubber);
    const gun = grp('gun', arms, [.1, -.24, .5]);
    if (role === 'long') { mk(G.cyl, M.steelD, [0, .03, 1.0], [.06, .9, .06], [Math.PI / 2, 0, 0], gun); mk(G.cyl, M.rubber, [0, .03, 1.5], [.1, .16, .1], [Math.PI / 2, 0, 0], gun); mk(G.cyl, M.steel, [0, .2, .1], [.09, .46, .09], [Math.PI / 2, 0, 0], gun); mk(G.cyl, M.visor, [0, .2, .34], [.08, .02, .08], [Math.PI / 2, 0, 0], gun); }
    if (role === 'patch') { mk(G.box, M.red, [0, .1, .2], [.1, .06, .2], 0, gun); }
    mk(G.box, M.gun, [0, 0, 0], [.13, .2, .8], 0, gun); mk(G.cyl, M.gun, [0, .03, .58], [.07, .45, .07], [Math.PI / 2, 0, 0], gun); mk(G.box, M.yellowP, [0, -.02, .2], [.15, .1, .26], 0, gun); mk(G.box, M.gun, [0, -.2, -.05], [.1, .26, .14], [.3, 0, 0], gun); mk(G.box, M.rubber, [0, -.02, -.5], [.11, .2, .3], 0, gun); mk(G.box, M.steelD, [0, .14, .1], [.05, .08, .2], 0, gun);
    muzzle(gun, [0, .03, .84], 1);
  }
  if (role === 'long') { mk(G.box, M.cloth, [0, .86, -.5], [.74, .9, .1], [.16, 0, 0], body); mk(G.box, M.cloth, [0, 1.36, -.2], [.8, .14, .6], 0, body); mk(G.box, M.rust, [0, .96, .21], [.52, .32, .11], 0, body); }
  if (role === 'patch') { mk(G.box, M.steel, [0, .96, .22], [.54, .34, .1], 0, body); mk(G.box, M.red, [0, .96, .28], [.1, .28, .03], 0, body); mk(G.box, M.red, [0, .96, .28], [.28, .1, .03], 0, body); mk(G.box, M.steel, [0, 1.0, -.6], [.56, .6, .3], 0, body); mk(G.box, M.red, [0, 1.0, -.76], [.12, .34, .03], 0, body); mk(G.box, M.red, [0, 1.0, -.76], [.34, .12, .03], 0, body); mk(G.cyl, M.teal, [.34, 1.2, -.6], [.14, .5, .14], 0, body); }
  if (heavy) obj.scale.setScalar(1.14);
  return bake(obj);
}

function rigger(): THREE.Group {
  const obj = new THREE.Group(), body = grp('body', obj);
  leg(obj, 'legL', -1, M.cloth, false); leg(obj, 'legR', 1, M.cloth, false);
  mk(G.box, M.vest, [0, .9, 0], [.68, .58, .46], 0, body);
  mk(G.box, M.rubber, [0, .62, 0], [.62, .14, .42], 0, body);
  mk(G.box, M.steelD, [-.22, .6, .22], [.14, .2, .08], 0, body); mk(G.box, M.rust, [.2, .58, .22], [.2, .16, .08], 0, body);
  for (const sx of [-1, 1]) mk(G.sph, M.cloth, [sx * .4, 1.1, 0], [.3, .28, .3], 0, body);
  const head = grp('head', body, [0, 1.26, 0]);
  mk(G.sph, M.skin, [0, .24, 0], [.7, .68, .7], 0, head);
  for (const sx of [-1, 1]) { mk(G.cyl, M.cyan, [sx * .15, .26, .3], [.2, .1, .2], [Math.PI / 2, 0, 0], head); mk(G.torusF, M.rubber, [sx * .15, .26, .34], [.24, .24, .2], 0, head); }
  mk(G.box, M.steelD, [0, .06, .3], [.26, .16, .18], 0, head);
  mk(G.hemi, M.hardhat, [0, .36, 0], [.86, .8, .86], 0, head);
  mk(G.cyl, M.hardhat, [0, .38, .06], [1.0, .05, 1.0], 0, head);
  mk(G.cyl, M.visor, [0, .6, .36], [.16, .1, .16], [Math.PI / 2.4, 0, 0], head);
  const armL = grp('armL', body, [-.42, 1.08, 0]); limb(armL, [0, 0, 0], [-.06, -.26, .04], [-.02, -.46, .2], .095, M.cloth, M.yellowP);
  const armR = grp('armR', body, [.42, 1.08, 0]); limb(armR, [0, 0, 0], [.04, -.24, .12], [.02, -.3, .38], .095, M.cloth, M.yellowP);
  mk(G.box, M.yellow, [.02, -.3, .56], [.18, .2, .4], 0, armR); mk(G.cone, M.steel, [.02, -.3, .92], [.2, .4, .2], [Math.PI / 2, 0, 0], armR); mk(G.box, M.hazard1, [.02, -.19, .5], [.19, .03, .26], 0, armR);
  const pack = grp('pack', body); pack.visible = false;
  mk(G.box, M.steelD, [0, 1.0, -.38], [.56, .56, .3], 0, pack); for (let i = 0; i < 3; i++) mk(G.oct, M.ore, [-.16 + i * .16, 1.42, -.38], [.2, .5, .2], [R(-.3, .3), 0, R(-.3, .3)], pack);
  return bake(obj);
}

/** Veyl melee zealot: floats, swings a tuning-fork glaive. */
function cantor(): THREE.Group {
  const obj = new THREE.Group(), body = grp('body', obj);
  for (const sx of [-1, 1]) {
    mk(G.cone, M.indigoD, [sx * .17, .46, 0], [.22, .92, .22], [Math.PI, 0, 0], body);
    mk(G.arc, M.teal, [sx * .62, 1.98, 0], [.8, .8, .8], [0, Math.PI / 2, 0], body);
    mk(G.box, M.indigoD, [sx * .3, .95, .06], [.2, .9, .06], [0, 0, sx * .22], body);
    mk(G.oct, M.crys, [sx * .78, 2.3, -.1], [.2, .42, .2], [0, 0, sx * -.3], body);
  }
  mk(G.box, M.gold, [0, 1.02, .34], [.16, .8, .04], 0, body);
  mk(G.taper, M.indigo, [0, 1.1, 0], [.95, 1.0, .8], 0, body);
  mk(G.sph, M.indigo, [0, 1.7, 0], [.66, .72, .54], 0, body);
  mk(G.oct, M.mag, [0, 1.72, .27], [.22, .3, .14], 0, body);
  const head = grp('head', body, [0, 2.1, 0]);
  mk(G.sph, M.indigoL, [0, .32, .02], [.62, .86, .66], 0, head);
  for (const sx of [-1, 1]) mk(G.box, M.teal, [sx * .13, .38, .31], [.2, .07, .1], [0, 0, sx * .35], head);
  mk(G.cone, M.gold, [0, .88, -.14], [.18, .6, .18], [-.4, 0, 0], head);
  mk(G.box, M.gold, [0, .12, .3], [.1, .3, .08], 0, head);
  const halo = grp('halo', body, [0, 2.5, -.3]); mk(G.torus, M.mag, [0, 0, 0], [1.25, 1.25, 1.25], 0, halo); for (let i = 0; i < 3; i++) { const a = i / 3 * 6.283; mk(G.oct, M.teal, [Math.cos(a) * .62, Math.sin(a) * .62, 0], [.12, .26, .12], [0, 0, a], halo); }
  const armL = grp('armL', body, [-.4, 1.85, 0]); beam([0, 0, 0], [-.16, -.6, .34], .06, M.indigoD, armL); mk(G.sph, M.indigoL, [-.16, -.65, .36], [.2, .2, .2], 0, armL);
  const armR = grp('armR', body, [.4, 1.85, 0]);
  beam([0, 0, 0], [.16, -.6, .34], .06, M.indigoD, armR); mk(G.sph, M.indigoL, [.16, -.65, .36], [.2, .2, .2], 0, armR);
  beam([.16, -1.5, .38], [.16, .75, .38], .04, M.gold, armR); beam([0, .75, .38], [.32, .75, .38], .05, M.mag, armR); beam([0, .75, .38], [0, 1.45, .38], .05, M.mag, armR); beam([.32, .75, .38], [.32, 1.45, .38], .05, M.mag, armR);
  return bake(obj);
}

/** Veyl ranged unit: slim, one eye, carries a long crystal lance that throws slow bolts. */
function lancer(): THREE.Group {
  const obj = new THREE.Group(), body = grp('body', obj);
  mk(G.cone, M.indigoD, [0, .5, 0], [.36, 1.0, .36], [Math.PI, 0, 0], body);
  mk(G.taper, M.indigoL, [0, 1.25, 0], [.62, .9, .5], 0, body);
  mk(G.box, M.gold, [0, 1.2, .26], [.1, .7, .04], 0, body);
  for (const sx of [-1, 1]) { mk(G.arc, M.crys, [sx * .34, 1.7, -.26], [1.1, 1.5, 1.1], [0, Math.PI / 2 + sx * .5, sx * .5], body); mk(G.sph, M.indigo, [sx * .36, 1.66, 0], [.3, .26, .3], 0, body); }
  const head = grp('head', body, [0, 1.8, 0]);
  mk(G.sph, M.indigo, [0, .3, 0], [.5, .7, .54], 0, head); mk(G.sph, M.mag, [0, .32, .22], [.22, .22, .16], 0, head); mk(G.torusF, M.gold, [0, .32, .25], [.3, .3, .2], 0, head);
  mk(G.cone, M.crys, [0, .9, -.1], [.16, .7, .16], [-.3, 0, 0], head);
  const halo = grp('halo', body, [0, 2.3, -.34]); mk(G.torus, M.teal, [0, 0, 0], [.9, .9, .9], 0, halo); mk(G.oct, M.mag, [.45, 0, 0], [.12, .24, .12], 0, halo); mk(G.oct, M.mag, [-.45, 0, 0], [.12, .24, .12], 0, halo);
  const arms = grp('arms', body, [0, 1.55, .05]);
  beam([.34, .1, -.05], [.3, -.2, .3], .05, M.indigoD, arms); beam([-.34, .1, -.05], [-.1, -.16, .7], .05, M.indigoD, arms);
  mk(G.sph, M.indigoL, [.3, -.2, .3], [.16, .16, .16], 0, arms); mk(G.sph, M.indigoL, [-.1, -.16, .7], [.16, .16, .16], 0, arms);
  beam([.34, -.22, -.5], [.02, -.16, 1.5], .05, M.gold, arms); mk(G.cone6, M.crys, [-.06, -.14, 1.86], [.2, .8, .2], [Math.PI / 2 - .04, 0, .2], arms); mk(G.torus, M.mag, [.02, -.16, 1.42], [.36, .36, .36], [0, 0, 0], arms);
  const f = grp('flash', arms, [-.1, -.13, 2.2]); mk(G.sph, M.cyan, [0, 0, 0], [.5, .5, .5], 0, f); mk(G.oct, M.cyan, [0, 0, 0], [.9, .2, .2], 0, f); mk(G.oct, M.cyan, [0, 0, 0], [.2, .9, .2], 0, f); f.visible = false; setLayer(f, L_FX);
  return bake(obj);
}

/** Veyl heavy: a floating stone giant with crystal fists. */
function warden(): THREE.Group {
  const obj = new THREE.Group(), body = grp('body', obj);
  mk(G.cone6, M.indigoD, [0, .9, 0], [1.5, 1.8, 1.5], [Math.PI, 0, 0], body);
  mk(G.dod, M.indigo, [0, 2.7, 0], [2.5, 2.3, 1.9], [0, .3, 0], body);
  mk(G.oct, M.mag, [0, 2.7, .82], [.6, .8, .3], 0, body); mk(G.torusF, M.gold, [0, 2.7, .86], [1.0, 1.0, .5], 0, body);
  mk(G.box, M.gold, [0, 1.7, .7], [.3, .9, .08], 0, body);
  for (const sx of [-1, 1]) { mk(G.hexT, M.indigoL, [sx * 1.5, 3.5, 0], [1.3, 1.0, 1.3], [0, 0, sx * -.5], body); mk(G.oct, M.crys, [sx * 1.7, 4.3, -.1], [.4, 1.1, .4], [0, 0, sx * -.4], body); mk(G.oct, M.crys, [sx * 1.25, 4.2, -.4], [.3, .8, .3], [.3, 0, sx * -.2], body); }
  const head = grp('head', body, [0, 3.8, .2]);
  mk(G.sph, M.indigoD, [0, .2, 0], [.8, .8, .8], 0, head); mk(G.box, M.gold, [0, .2, .34], [.6, .5, .12], 0, head); for (const sx of [-1, 1]) mk(G.box, M.teal, [sx * .15, .26, .4], [.18, .07, .06], [0, 0, sx * .4], head); mk(G.cone, M.gold, [0, .9, -.1], [.2, .7, .2], 0, head);
  const halo = grp('halo', body, [0, 4.4, -.7]); mk(G.torus, M.mag, [0, 0, 0], [2.6, 2.6, 2], 0, halo); mk(G.torus, M.teal, [0, 0, 0], [1.9, 1.9, 2], 0, halo); for (let i = 0; i < 5; i++) { const a = i / 5 * 6.283; mk(G.oct, M.teal, [Math.cos(a) * 1.3, Math.sin(a) * 1.3, 0], [.2, .46, .2], [0, 0, a], halo); }
  for (const sx of [-1, 1]) {
    const a = grp(sx < 0 ? 'armL' : 'armR', body, [sx * 1.6, 3.3, 0]);
    beam([0, 0, 0], [sx * .3, -1.0, .3], .22, M.indigoD, a); mk(G.sph, M.indigoL, [sx * .3, -1.05, .3], [.6, .6, .6], 0, a); beam([sx * .3, -1.0, .3], [sx * .2, -1.9, .8], .2, M.indigoD, a);
    mk(G.dod, M.crys, [sx * .2, -2.1, .9], [1.1, 1.1, 1.1], [.4, .2, 0], a); mk(G.torusF, M.gold, [sx * .22, -1.7, .7], [.7, .7, .6], [Math.PI / 2 - .5, 0, 0], a);
  }
  return bake(obj);
}


/** Ironhold walker: a two-legged loader rig with a cannon bolted to each side. */
function gantry(): THREE.Group {
  const obj = new THREE.Group(), body = grp('body', obj);
  for (const sx of [-1, 1]) {
    const l = grp(sx < 0 ? 'legL' : 'legR', obj, [sx * .78, 1.55, 0]);
    mk(G.cyl, M.yellowP, [0, 0, 0], [.5, .34, .5], [0, 0, Math.PI / 2], l);
    beam([0, 0, 0], [0, -.62, -.3], .17, M.steelD, l); mk(G.sph, M.rust, [0, -.62, -.3], [.44, .44, .44], 0, l);
    beam([0, -.62, -.3], [0, -1.32, .08], .15, M.steel, l); mk(G.box, M.hazard1, [sx * .17, -.95, -.12], [.06, .5, .26], [-.5, 0, 0], l);
    mk(G.box, M.steelD, [0, -1.44, .14], [.6, .22, .96], 0, l); mk(G.box, M.rubber, [0, -1.52, .14], [.66, .08, 1.02], 0, l); mk(G.box, M.yellowP, [0, -1.36, .56], [.5, .2, .2], 0, l);
  }
  mk(G.box, M.steelD, [0, 1.6, 0], [1.3, .36, .8], 0, body);
  mk(G.box, M.yellow, [0, 2.2, -.05], [1.5, 1.0, 1.5], 0, body);
  mk(G.box, M.hazard1, [0, 1.84, .68], [1.44, .22, .1], 0, body);
  mk(G.box, M.steel, [0, 2.36, .62], [1.1, .56, .34], [-.2, 0, 0], body);
  mk(G.box, M.visor, [0, 2.4, .8], [.9, .3, .06], [-.2, 0, 0], body);
  mk(G.box, M.steelD, [0, 2.24, -.9], [1.2, .8, .4], 0, body);
  for (const sx of [-1, 1]) { mk(G.cyl, M.rust, [sx * .4, 2.9, -.86], [.2, .7, .2], 0, body); mk(G.cyl, M.rubber, [sx * .4, 3.26, -.86], [.25, .08, .25], 0, body); mk(G.box, M.orange, [sx * .62, 2.74, .5], [.2, .12, .2], 0, body); }
  mk(G.box, M.rubber, [0, 1.66, .5], [.5, .2, .3], 0, body);
  const head = grp('head', body, [0, 2.7, 0]);
  mk(G.box, M.steelD, [0, .08, 0], [.7, .16, .7], 0, head); mk(G.box, M.visor, [0, .2, .26], [.34, .14, .2], 0, head); mk(G.cyl, M.rubber, [-.24, .5, -.2], [.035, .8, .035], 0, head); mk(G.sph, M.red, [-.24, .92, -.2], [.1, .1, .1], 0, head);
  const arms = grp('arms', body, [0, 2.25, .1]);
  for (const sx of [-1, 1]) {
    mk(G.cyl, M.steelD, [sx * .84, 0, 0], [.3, .3, .3], [0, 0, Math.PI / 2], arms);
    mk(G.box, M.gun, [sx * 1.12, 0, .1], [.4, .46, 1.1], 0, arms); mk(G.box, M.orange, [sx * 1.12, .25, 0], [.3, .08, .6], 0, arms);
    mk(G.cyl, M.steelD, [sx * 1.12, .02, .95], [.2, .9, .2], [Math.PI / 2, 0, 0], arms); mk(G.cyl, M.rubber, [sx * 1.12, .02, 1.4], [.26, .12, .26], [Math.PI / 2, 0, 0], arms);
    mk(G.box, M.hazard1, [sx * 1.33, 0, .1], [.03, .3, .7], 0, arms);
  }
  muzzle(arms, [1.12, .02, 1.6], 2.4);
  return bake(obj);
}

const MAKERS: Record<string, () => THREE.Group> = { rigger, linesman: () => trooper(false), breacher: () => trooper(true), longshot: () => trooper(false, 'long'), patch: () => trooper(false, 'patch'), gantry, cantor, lancer, warden };
const HEIGHT: Record<string, number> = { rigger: 1.55, linesman: 1.6, breacher: 1.8, longshot: 1.6, patch: 1.6, gantry: 3.3, cantor: 2.3, lancer: 2.2, warden: 4.4 };
const protos: Record<string, THREE.Group> = {};
/** A fresh copy of a unit model. Geometry is shared between copies. */
export const atlasUsed = () => atlas ? atlas.cells.size : 0;
export function unit(kind: string): Model {
  const proto = protos[kind] || (protos[kind] = atlasify(MAKERS[kind]()));
  const obj = proto.clone(true); const f = (n: string) => obj.getObjectByName(n);
  return { obj, rig: { body: f('body')!, head: f('head'), arms: f('arms'), armL: f('armL'), armR: f('armR'), legL: f('legL'), legR: f('legR'), flash: f('flash'), halo: f('halo'), pack: f('pack'), height: HEIGHT[kind] } };
}

// ---------------------------------------------------------------- structures
export function headframe(anim: ((t: number) => void)[]) {
  const g = new THREE.Group();
  mk(G.box, M.concrete, [0, .12, 0], [13, .24, 9], 0, g);
  mk(G.box, M.steel, [0, 2.3, 0], [10, 4.4, 7], 0, g);
  mk(G.box, M.hazard, [0, 4.1, 0], [10.2, .7, 7.2], 0, g);
  mk(G.box, M.steelD, [0, 4.7, 0], [10.5, .4, 7.5], 0, g);
  mk(G.box, M.door, [1.6, 1.6, 3.52], [3.2, 3, .14], 0, g);
  mk(G.box, M.yellowP, [1.6, 3.3, 3.58], [3.7, .34, .2], 0, g);
  mk(G.box, M.visor, [-2.7, 2.7, 3.52], [1.7, .8, .12], 0, g); mk(G.box, M.visor, [-2.7, 1.3, 3.52], [1.7, .8, .12], 0, g);
  mk(G.box, M.steelD, [-2.7, 2.0, 3.56], [2.0, .16, .14], 0, g);
  for (let i = 0; i < 2; i++) { const x = -3.2 + i * 6.4; mk(G.cyl, M.steel, [x, 5.6, -1.6], [2.4, 1.6, 2.4], 0, g); mk(G.hemi, M.yellowP, [x, 6.4, -1.6], [2.4, 1.6, 2.4], 0, g); }
  const top = 14.2;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) beam([sx * 2.6, 4.8, sz * 2.2], [sx * .6, top, sz * .6], .16, M.yellowP, g);
  for (const h of [.3, .6]) { const y = 4.8 + (top - 4.8) * h, w = 2.6 - 2 * h, d = 2.2 - 1.6 * h; beam([-w, y, d], [w, y, d], .1, M.steelD, g); beam([-w, y, -d], [w, y, -d], .1, M.steelD, g); beam([-w, y, d], [-w, y, -d], .1, M.steelD, g); beam([w, y, d], [w, y, -d], .1, M.steelD, g); }
  beam([-2.6, 4.8, 2.2], [1.6, 4.8 + (top - 4.8) * .3, 1.72], .08, M.steelD, g); beam([2.0, 7.62, 1.72], [-1.4, 10.44, 1.24], .08, M.steelD, g);
  mk(G.box, M.yellow, [0, top + .3, 0], [1.8, .9, 1.8], 0, g);
  const wheel = new THREE.Group(); mk(G.torusF, M.steelD, [0, 0, 0], [3.6, 3.6, 2.4], 0, wheel); for (let i = 0; i < 4; i++) mk(G.box, M.steelD, [0, 0, 0], [3.3, .14, .14], [0, 0, i * Math.PI / 4], wheel); mk(G.cyl, M.yellowP, [0, 0, 0], [.6, .5, .6], [Math.PI / 2, 0, 0], wheel);
  wheel.position.set(0, top + 1.4, 1.1); g.add(wheel); anim.push(t => { wheel.rotation.z = t * .5; });
  mk(G.sph, M.red, [0, top + 3.5, 0], [.3, .3, .3], 0, g); beam([0, top + .7, 0], [0, top + 3.4, 0], .05, M.steelD, g);
  mk(G.cyl, M.rust, [3.4, 6.4, -2], [.9, 3.4, .9], 0, g); mk(G.torusF, M.steelD, [3.4, 8.0, -2], [1.0, 1.0, 1.2], [Math.PI / 2, 0, 0], g);
  for (let i = 0; i < 5; i++) { const p = mk(G.sph, M.smoke, [3.4, 9, -2], [1, 1, 1], 0, g); p.userData.dyn = true; anim.push(t => { const k = ((t * .16 + i / 5) % 1); p.position.set(3.4 + k * 3.2 + Math.sin(i * 2.1) * .5, 8.6 + k * 7, -2 - k * 2); const s = .9 + k * 2.6; p.scale.set(s, s * .85, s); }); }
  mk(G.box, M.sign, [-1.4, 5.8, 3.3], [5.2, 1.4, .2], 0, g); beam([-3.4, 4.9, 3.3], [-3.4, 5.2, 3.3], .08, M.steelD, g); beam([.6, 4.9, 3.3], [.6, 5.2, 3.3], .08, M.steelD, g);
  beam([5.6, 0, 4.2], [5.6, 6, 4.2], .1, M.steelD, g); mk(G.box, M.visor, [5.6, 6.1, 4.3], [.9, .5, .3], [.4, 0, 0], g);
  return bake(g);
}
/** Quonset hut. Long axis along X, door on the +Z side. */
export function bunkhouse() {
  const g = new THREE.Group();
  mk(G.box, M.concrete, [0, .1, 0], [7.6, .2, 5.8], 0, g);
  mk(G.half, M.corr, [0, .2, 0], [5.2, 7, 5.2], [0, 0, Math.PI / 2], g);
  for (const sx of [-1, 1]) mk(G.box, M.steelD, [sx * 3.52, .5, 0], [.14, .8, 5.2], 0, g);
  mk(G.box, M.door, [3.56, 1.25, 0], [.12, 2.1, 1.5], 0, g); mk(G.box, M.yellowP, [3.6, 2.4, 0], [.14, .22, 1.9], 0, g); mk(G.box, M.visor, [3.62, 2.72, 0], [.12, .24, .7], 0, g);
  mk(G.box, M.steelD, [1, 2.0, 2.2], [1.5, .9, .9], 0, g); mk(G.cyl, M.rubber, [1, 2.0, 2.68], [.6, .08, .6], [Math.PI / 2, 0, 0], g);
  beam([-2.2, 2.5, 0], [-2.2, 5.6, 0], .05, M.steelD, g); mk(G.sph, M.red, [-2.2, 5.7, 0], [.2, .2, .2], 0, g); beam([-2.8, 4.6, 0], [-1.6, 4.6, 0], .04, M.steelD, g);
  mk(G.box, M.rust, [-2.6, .5, 2.2], [1.0, 1.0, 1.0], [0, .3, 0], g); mk(G.box, M.yellow, [-2.5, 1.3, 2.3], [.7, .6, .7], [0, -.2, 0], g);
  return bake(g);
}
export function depot() {
  const g = new THREE.Group();
  mk(G.box, M.rust, [0, 1.15, -1.2], [5, 2.3, 2.3], 0, g); mk(G.box, M.tealC, [.2, 1.15, 1.25], [5, 2.3, 2.3], [0, .06, 0], g); mk(G.box, M.yellow, [.1, 3.45, 0], [5, 2.3, 2.3], [0, -.12, 0], g);
  return bake(g);
}
export function watchpost() {
  const g = new THREE.Group();
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) beam([sx * 1.2, 0, sz * 1.2], [sx * .9, 4.5, sz * .9], .1, M.steelD, g);
  for (const sz of [-1, 1]) { beam([-1.15, .8, sz * 1.15], [1.0, 3.6, sz * .95], .06, M.steelD, g); beam([1.15, .8, sz * 1.15], [-1.0, 3.6, sz * .95], .06, M.steelD, g); }
  mk(G.box, M.steel, [0, 4.6, 0], [2.9, .3, 2.9], 0, g);
  for (const [x, z, w, d] of [[0, 1.4, 2.9, .14], [0, -1.4, 2.9, .14], [1.4, 0, .14, 2.9], [-1.4, 0, .14, 2.9]]) mk(G.box, M.yellow, [x, 5.2, z], [w, .9, d], 0, g);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) beam([sx * 1.3, 5.6, sz * 1.3], [sx * 1.3, 6.9, sz * 1.3], .06, M.steelD, g);
  mk(G.cone4, M.rust, [0, 7.5, 0], [4.6, 1.3, 4.6], [0, Math.PI / 4, 0], g);
  const gun = new THREE.Group(); gun.position.set(0, 6.0, 0); g.add(gun); g.userData.gun = gun;
  mk(G.box, M.gun, [0, 0, .5], [.5, .44, 1.0], 0, gun); mk(G.cyl, M.gun, [0, .03, 1.5], [.16, 1.4, .16], [Math.PI / 2, 0, 0], gun);
  mk(G.sph, M.red, [0, 8.3, 0], [.24, .24, .24], 0, g);
  return bake(g);
}
export function choir(anim: ((t: number) => void)[]) {
  const g = new THREE.Group();
  let y = 0; for (let i = 0; i < 6; i++) { const w = 1.9 - i * .27, h = 1.7; mk(G.hexT, i % 2 ? M.indigoL : M.indigo, [Math.sin(i * .9) * .12, y + h / 2, 0], [w, h, w], [0, i * .55, 0], g); y += h * .94; }
  mk(G.cone6, M.teal, [0, y + 1.1, 0], [.5, 2.4, .5], 0, g);
  for (const [ry, s, tx] of [[4.2, 3.4, .25], [7.4, 2.4, -.3]]) { const r = mk(G.torus, M.mag, [0, ry, 0], [s, s, s], [Math.PI / 2 + tx, 0, 0], g); r.userData.dyn = true; anim.push(t => { r.rotation.z = t * (tx > 0 ? .7 : -.9); r.position.y = ry + Math.sin(t * 1.4 + ry) * .18; }); }
  for (let i = 0; i < 5; i++) { const a = i / 5 * 6.283; mk(G.oct, M.teal, [Math.cos(a) * 1.6, .3, Math.sin(a) * 1.6], [.3, .8, .3], [R(-.4, .4), 0, R(-.4, .4)], g); }
  return bake(g);
}
export function oreCluster(n: number, sc: number) {
  const g = new THREE.Group();
  for (let i = 0; i < n; i++) { const a = R(0, 6.3), d = R(0, 1.3) * sc, h = R(1.4, 3.4) * sc; mk(G.oct, M.ore, [Math.cos(a) * d, h * .32, Math.sin(a) * d], [h * .34, h, h * .34], [R(-.45, .45), R(0, 3), R(-.45, .45)], g); }
  for (let i = 0; i < 4; i++) { const a = R(0, 6.3); mk(G.dod, M.rock, [Math.cos(a) * 1.7 * sc, .2, Math.sin(a) * 1.7 * sc], [R(.6, 1.2), R(.4, .8), R(.6, 1.2)], [R(0, 3), R(0, 3), 0], g); }
  return bake(g);
}
/** Workshop: unlocks Breachers and sells upgrades. */
export function machineshop(anim: ((t: number) => void)[]) {
  const g = new THREE.Group();
  mk(G.box, M.concrete, [0, .1, 0], [9, .2, 7], 0, g);
  mk(G.box, M.rust, [-.6, 1.9, -.4], [6.4, 3.6, 5], 0, g); mk(G.box, M.steelD, [-.6, 3.85, -.4], [6.8, .3, 5.4], 0, g);
  mk(G.box, M.door, [-.6, 1.5, 2.12], [3.4, 2.8, .14], 0, g); mk(G.box, M.hazard, [-.6, 3.1, 2.16], [3.8, .4, .16], 0, g);
  mk(G.box, M.visor, [-3.2, 2.6, 2.12], [.9, .6, .1], 0, g);
  mk(G.cyl, M.steel, [3.4, 2.2, -1.2], [1.6, 4.4, 1.6], 0, g); mk(G.hemi, M.orange, [3.4, 4.4, -1.2], [1.6, 1.2, 1.6], 0, g); mk(G.torusF, M.steelD, [3.4, 1.4, -1.2], [1.9, 1.9, 1.2], [Math.PI / 2, 0, 0], g);
  beam([3.4, 0, 2.2], [3.4, 5.6, 2.2], .14, M.yellowP, g); beam([3.4, 5.5, 2.2], [-1.6, 5.5, 2.2], .12, M.yellowP, g); beam([3.4, 4.2, 2.2], [1.6, 5.5, 2.2], .07, M.steelD, g);
  const hook = grp('hook', g, [-1.2, 5.4, 2.2]); beam([0, 0, 0], [0, -1.6, 0], .03, M.steelD, hook); mk(G.torusF, M.steelD, [0, -1.8, 0], [.4, .4, .4], 0, hook); anim.push(t => { hook.position.x = -.4 + Math.sin(t * .5) * 1.1; });
  const gear = grp('gear', g, [-.6, 4.9, -.4]); mk(G.cyl8, M.yellow, [0, 0, 0], [2.2, .4, 2.2], 0, gear); for (let i = 0; i < 8; i++) { const a = i / 8 * 6.283; mk(G.box, M.yellow, [Math.cos(a) * 1.2, 0, Math.sin(a) * 1.2], [.5, .4, .4], [0, -a, 0], gear); } mk(G.cyl8, M.steelD, [0, .1, 0], [.8, .5, .8], 0, gear);
  gear.rotation.x = .25; anim.push(t => { gear.rotation.y = t * .8; });
  mk(G.box, M.tealC, [-3.6, .6, 2.9], [1.1, 1.1, 1.1], [0, .3, 0], g); mk(G.cyl, M.rust, [2.2, .6, 2.9], [.8, 1.2, .8], 0, g); mk(G.cyl, M.yellow, [1.3, .6, 3.1], [.8, 1.2, .8], 0, g);
  return bake(g);
}
/** Ironhold tier-three works: a furnace hall with a glowing crucible and a tall stack. */
export function foundry(anim: ((t: number) => void)[]) {
  const g = new THREE.Group();
  mk(G.box, M.concrete, [0, .1, 0], [8.8, .2, 7.6], 0, g);
  mk(G.box, M.steelD, [-.8, 2.2, -.6], [5.8, 4.2, 5.2], 0, g); mk(G.box, M.rust, [-.8, 4.5, -.6], [6.2, .4, 5.6], 0, g);
  mk(G.box, M.corr, [-.8, 5.1, -.6], [4.6, .9, 4.2], 0, g); mk(G.box, M.hazard, [-.8, 3.5, 2.06], [5.6, .4, .16], 0, g);
  mk(G.box, M.door, [-1.6, 1.5, 2.04], [2.6, 2.8, .14], 0, g);
  const glow = mk(G.box, M.fire, [.9, 1.3, 2.05], [1.5, 1.6, .12], 0, g); glow.userData.dyn = true; mk(G.box, M.steelD, [.9, 1.3, 2.1], [.14, 1.7, .1], 0, g); mk(G.box, M.steelD, [.9, 1.3, 2.1], [1.6, .14, .1], 0, g);
  mk(G.cyl, M.rust, [3.2, 3.6, -1.8], [1.5, 7.2, 1.5], 0, g); mk(G.cyl, M.steelD, [3.2, 7.3, -1.8], [1.8, .4, 1.8], 0, g); mk(G.torusF, M.yellowP, [3.2, 5.2, -1.8], [1.8, 1.8, 1.2], [Math.PI / 2, 0, 0], g); mk(G.torusF, M.yellowP, [3.2, 2.4, -1.8], [1.8, 1.8, 1.2], [Math.PI / 2, 0, 0], g);
  mk(G.cyl, M.steel, [3.1, .9, 1.6], [1.9, 1.5, 1.9], 0, g); const melt = mk(G.cyl, M.fire, [3.1, 1.68, 1.6], [1.6, .06, 1.6], 0, g); melt.userData.dyn = true; mk(G.torusF, M.steelD, [3.1, 1.6, 1.6], [1.95, 1.95, 1], [Math.PI / 2, 0, 0], g);
  beam([-3.4, 0, 3.2], [-3.4, 3.2, 3.2], .12, M.yellowP, g); mk(G.box, M.visor, [-3.4, 3.3, 3.2], [.5, .3, .5], 0, g);
  mk(G.box, M.rust, [-3.3, .5, 3.0], [1.2, .9, .9], [0, .2, 0], g); mk(G.box, M.yellow, [1.2, .45, 3.3], [.9, .7, .7], [0, -.3, 0], g);
  anim.push(t => { const k = 1 + Math.sin(t * 5) * .06 + Math.sin(t * 13) * .03; melt.scale.set(1.6 * k, .06, 1.6 * k); glow.scale.y = 1.6 * (.94 + Math.sin(t * 7) * .05); });
  return bake(g);
}
/** Veyl spawner: a standing ring that raids walk out of. */
export function reedgate(anim: ((t: number) => void)[]) {
  const g = new THREE.Group();
  mk(G.cyl8, M.indigoD, [0, .3, 0], [7, .6, 7], 0, g); mk(G.cyl8, M.indigo, [0, .7, 0], [5.4, .4, 5.4], 0, g);
  for (const sx of [-1, 1]) { mk(G.hexT, M.indigo, [sx * 2.9, 3.4, 0], [1.4, 6, 1.4], [0, 0, sx * .08], g); mk(G.cone6, M.crys, [sx * 3.1, 7.6, 0], [.9, 2.6, .9], [0, 0, sx * -.12], g); mk(G.torus, M.gold, [sx * 2.9, 2.2, 0], [2.0, 2.0, 2.0], [Math.PI / 2, 0, 0], g); mk(G.torus, M.gold, [sx * 2.95, 4.6, 0], [1.7, 1.7, 1.7], [Math.PI / 2, 0, 0], g); }
  const ring = grp('ring', g, [0, 4.6, 0]); mk(G.torusF, M.mag, [0, 0, 0], [5.6, 5.6, 3], 0, ring); for (let i = 0; i < 6; i++) { const a = i / 6 * 6.283; mk(G.oct, M.teal, [Math.cos(a) * 2.8, Math.sin(a) * 2.8, 0], [.4, .9, .4], [0, 0, a], ring); }
  anim.push(t => { ring.rotation.z = t * .35; });
  const veil = mk(G.disc, M.violet, [0, 4.6, 0], [4.9, 4.9, 1], 0, g); veil.userData.dyn = true; (veil.material as THREE.Material).side = THREE.DoubleSide; anim.push(t => { const k = 1 + Math.sin(t * 2.2) * .04; veil.scale.set(4.9 * k, 4.9 * k, 1); });
  for (let i = 0; i < 7; i++) { const a = i / 7 * 6.283 + .3; mk(G.oct, M.crys, [Math.cos(a) * 3.6, .9, Math.sin(a) * 3.6], [.4, R(.9, 1.8), .4], [R(-.4, .4), 0, R(-.4, .4)], g); }
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
function vmArm(g: THREE.Object3D, hand: P3, elbow: P3, mat: THREE.Material, glove: THREE.Material) { beam(hand, elbow, .07, mat, g); mk(G.sph, glove, hand, [.17, .15, .19], 0, g); }
export function vmDrill() {
  const g = new THREE.Group();
  mk(G.box, M.yellow, [0, 0, 0], [.2, .22, .44], 0, g); mk(G.box, M.hazard1, [0, .12, -.05], [.21, .03, .3], 0, g);
  const bit = grp('bit', g, [0, 0, -.44]); mk(G.cone, M.steel, [0, 0, 0], [.2, .46, .2], [-Math.PI / 2, 0, 0], bit); for (let i = 0; i < 4; i++) mk(G.torus, M.steelD, [0, 0, .16 - i * .1], [.21 - i * .045, .21 - i * .045, .12], [0, 0, i], bit);
  mk(G.cyl, M.steelD, [0, 0, -.24], [.18, .06, .18], [Math.PI / 2, 0, 0], g);
  mk(G.cyl, M.rubber, [-.11, .04, .05], [.09, .03, .09], [0, 0, Math.PI / 2], g); mk(G.cyl, M.visor, [-.128, .04, .05], [.07, .01, .07], [0, 0, Math.PI / 2], g);
  mk(G.box, M.rubber, [0, -.2, .12], [.08, .22, .1], [.25, 0, 0], g); mk(G.box, M.steelD, [0, .14, .2], [.05, .06, .2], 0, g);
  vmArm(g, [.02, -.19, .12], [.2, -.5, .6], M.cloth, M.yellowP);
  bake(g); g.scale.setScalar(.62); g.userData.bit = bit; g.userData.rest = [.3, -.25, -.56, .14, .5, .06];
  return setLayer(g, L_VM) as THREE.Group;
}
function vmFlash(g: THREE.Object3D, p: P3, s: number) { const flash = grp('flash', g, p); for (let i = 0; i < 3; i++) mk(G.cone4, M.flash, [0, 0, 0], [.2 * s, .5 * s, .04 * s], [-Math.PI / 2, 0, i * Math.PI / 3], flash); mk(G.sph, M.flash, [0, 0, .14 * s], [.16 * s, .16 * s, .16 * s], 0, flash); flash.visible = false; return flash; }
export function vmRifle() {
  const g = new THREE.Group();
  mk(G.box, M.gun, [0, 0, 0], [.1, .15, .62], 0, g); mk(G.box, M.yellow, [0, .01, -.1], [.115, .11, .3], 0, g);
  mk(G.cyl, M.gun, [0, .02, -.48], [.05, .4, .05], [Math.PI / 2, 0, 0], g); mk(G.cyl, M.steelD, [0, .02, -.66], [.075, .1, .075], [Math.PI / 2, 0, 0], g);
  const mag = grp('mag', g, [0, -.17, -.04]); mk(G.box, M.steelD, [0, 0, 0], [.07, .24, .12], [.25, 0, 0], mag);
  mk(G.box, M.rubber, [0, -.14, .2], [.08, .2, .1], [-.3, 0, 0], g); mk(G.box, M.rubber, [0, -.01, .42], [.09, .14, .26], 0, g);
  mk(G.torusF, M.steelD, [0, .115, -.2], [.06, .06, .08], 0, g); mk(G.box, M.steelD, [0, .08, -.2], [.02, .03, .03], 0, g); mk(G.box, M.steelD, [0, .09, .14], [.05, .05, .04], 0, g); mk(G.box, M.visor, [0, .1, -.44], [.012, .05, .012], 0, g);
  mk(G.box, M.hazard1, [.052, 0, -.1], [.01, .06, .22], 0, g);
  vmArm(g, [-.01, -.15, .2], [.14, -.36, .66], M.steel, M.rubber); vmArm(g, [-.04, -.1, -.26], [-.34, -.34, .1], M.steel, M.rubber);
  const flash = vmFlash(g, [0, .02, -.95], 1);
  bake(g); setLayer(g, L_VM); setLayer(flash, L_FX); g.userData.flash = flash; g.userData.mag = mag; g.userData.rest = [.27, -.24, -.5, .02, .08, 0]; g.userData.ads = [0, -.127, -.36, 0, 0, 0];
  return g;
}
export function vmScatter() {
  const g = new THREE.Group();
  mk(G.box, M.gun, [0, 0, .05], [.13, .17, .5], 0, g); mk(G.box, M.orange, [0, -.01, -.02], [.145, .12, .22], 0, g);
  for (const sx of [-1, 1]) { mk(G.cyl, M.steelD, [sx * .045, .03, -.5], [.085, .62, .085], [Math.PI / 2, 0, 0], g); mk(G.cyl, M.rubber, [sx * .045, .03, -.8], [.1, .04, .1], [Math.PI / 2, 0, 0], g); }
  const pump = grp('mag', g, [0, -.07, -.42]); mk(G.box, M.rubber, [0, 0, 0], [.15, .1, .26], 0, pump);
  mk(G.box, M.rubber, [0, -.14, .22], [.08, .2, .1], [-.3, 0, 0], g); mk(G.box, M.cloth, [0, -.02, .42], [.1, .15, .3], 0, g); mk(G.box, M.hazard1, [.068, 0, .05], [.01, .08, .3], 0, g);
  vmArm(g, [-.01, -.15, .22], [.14, -.36, .66], M.steel, M.rubber); vmArm(pump, [-.02, -.05, 0], [-.34, -.3, .4], M.steel, M.rubber);
  const flash = vmFlash(g, [0, .03, -1.0], 1.7);
  bake(g); setLayer(g, L_VM); setLayer(flash, L_FX); g.userData.flash = flash; g.userData.mag = pump; g.userData.rest = [.25, -.25, -.5, .02, .1, 0];
  return g;
}
/** The Longshot's rifle: long barrel, fat scope. */
export function vmLong() {
  const g = new THREE.Group();
  mk(G.box, M.gun, [0, 0, .02], [.09, .14, .7], 0, g); mk(G.box, M.cloth, [0, .01, -.12], [.105, .1, .3], 0, g);
  mk(G.cyl, M.steelD, [0, .02, -.75], [.04, .9, .04], [Math.PI / 2, 0, 0], g); mk(G.cyl, M.rubber, [0, .02, -1.2], [.07, .14, .07], [Math.PI / 2, 0, 0], g);
  mk(G.cyl, M.steel, [0, .13, -.08], [.075, .42, .075], [Math.PI / 2, 0, 0], g); mk(G.cyl, M.rubber, [0, .13, .15], [.09, .06, .09], [Math.PI / 2, 0, 0], g); mk(G.cyl, M.rubber, [0, .13, -.31], [.095, .06, .095], [Math.PI / 2, 0, 0], g);
  const mag = grp('mag', g, [0, -.13, -.02]); mk(G.box, M.steelD, [0, 0, 0], [.06, .14, .12], 0, mag);
  mk(G.box, M.rubber, [0, -.13, .22], [.07, .2, .1], [-.3, 0, 0], g); mk(G.box, M.cloth, [0, -.02, .46], [.08, .16, .3], 0, g); mk(G.box, M.hazard1, [.047, 0, -.12], [.01, .05, .2], 0, g);
  vmArm(g, [-.01, -.15, .22], [.14, -.36, .66], M.steel, M.rubber); vmArm(g, [-.04, -.09, -.34], [-.34, -.34, .1], M.steel, M.rubber);
  const flash = vmFlash(g, [0, .02, -1.42], 1.5);
  bake(g); setLayer(g, L_VM); setLayer(flash, L_FX); g.userData.flash = flash; g.userData.mag = mag; g.userData.rest = [.27, -.24, -.5, .02, .08, 0]; g.userData.ads = [0, -.3, -.2, 0, 0, 0];
  return g;
}
/** The Patch's rivet pistol. */
export function vmPistol() {
  const g = new THREE.Group();
  mk(G.box, M.steel, [0, .02, -.08], [.085, .12, .34], 0, g); mk(G.box, M.red, [0, .085, -.06], [.06, .02, .2], 0, g); mk(G.cyl, M.steelD, [0, .03, -.3], [.05, .14, .05], [Math.PI / 2, 0, 0], g);
  const mag = grp('mag', g, [0, -.12, .04]); mk(G.box, M.rubber, [0, 0, 0], [.07, .2, .1], [-.2, 0, 0], mag);
  mk(G.box, M.teal, [.046, .02, -.02], [.01, .05, .12], 0, g);
  vmArm(g, [0, -.14, .08], [.16, -.36, .6], M.steel, M.rubber);
  const flash = vmFlash(g, [0, .03, -.5], .7);
  bake(g); setLayer(g, L_VM); setLayer(flash, L_FX); g.userData.flash = flash; g.userData.mag = mag; g.userData.rest = [.24, -.22, -.52, .02, .06, 0]; g.userData.ads = [0, -.105, -.42, 0, 0, 0];
  return g;
}
/** The Gantry's cockpit view: a cannon on each side and a dashboard along the bottom. */
export function vmCannon() {
  const g = new THREE.Group();
  for (const sx of [-1, 1]) {
    const c = grp(sx < 0 ? 'gunL' : 'gunR', g, [sx * .46, 0, 0]);
    mk(G.box, M.gun, [0, 0, -.1], [.2, .22, .7], 0, c); mk(G.box, M.orange, [0, .12, -.05], [.15, .04, .4], 0, c);
    mk(G.cyl, M.steelD, [0, .01, -.72], [.12, .7, .12], [Math.PI / 2, 0, 0], c); mk(G.cyl, M.rubber, [0, .01, -1.06], [.15, .07, .15], [Math.PI / 2, 0, 0], c);
    mk(G.box, M.hazard1, [-sx * .105, 0, -.1], [.012, .14, .5], 0, c);
  }
  mk(G.box, M.steelD, [0, -.17, -.3], [1.3, .1, .5], [.25, 0, 0], g); mk(G.box, M.hazard1, [0, -.1, -.52], [1.2, .05, .04], [.25, 0, 0], g);
  mk(G.box, M.yellow, [0, -.11, -.36], [.3, .05, .2], [.25, 0, 0], g); mk(G.box, M.visor, [0, -.085, -.38], [.2, .02, .1], [.25, 0, 0], g);
  for (const sx of [-1, 1]) mk(G.cyl, M.rust, [sx * .24, -.1, -.34], [.06, .04, .06], [.25, 0, 0], g);
  const flashL = vmFlash(g.getObjectByName('gunL')!, [0, .01, -1.2], 2.2), flash = vmFlash(g.getObjectByName('gunR')!, [0, .01, -1.2], 2.2);
  bake(g); setLayer(g, L_VM); setLayer(flash, L_FX); setLayer(flashL, L_FX); g.userData.flash = flash; g.userData.flashL = flashL; g.userData.gunL = g.getObjectByName('gunL'); g.userData.gunR = g.getObjectByName('gunR'); g.userData.rest = [0, -.42, -.5, 0, 0, 0];
  return g;
}
/** The Breacher's shield as seen from behind it in first person. */
export function vmShield() {
  const g = new THREE.Group();
  mk(G.box, M.steel, [0, 0, 0], [.62, .8, .04], 0, g); mk(G.box, M.steelD, [0, .22, .03], [.34, .12, .03], 0, g); mk(G.box, M.visor, [0, .22, -.01], [.3, .08, .04], 0, g); mk(G.box, M.rubber, [0, -.1, .06], [.3, .06, .06], 0, g); mk(G.box, M.hazard1, [0, .36, .025], [.62, .08, .01], 0, g);
  bake(g); g.userData.rest = [-.5, -.52, -.62, .1, .55, -.1]; g.userData.ads = [-.12, -.47, -.52, -.1, .12, 0];
  return setLayer(g, L_VM) as THREE.Group;
}

// ---------------------------------------------------------------- world dressing
export const ROAD_Z = 14;
function segDist(x: number, z: number, ax: number, az: number, bx: number, bz: number) { const dx = bx - ax, dz = bz - az, t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz))); return Math.hypot(x - ax - dx * t, z - az - dz * t); }
/** Places the player may need to walk or build, kept free of rocks. */
export function isClear(x: number, z: number, pad = 0) {
  return Math.hypot(x, z) < 44 + pad || Math.hypot(x - 126, z - 13) < 36 + pad || segDist(x, z, 0, ROAD_Z, 130, ROAD_Z) < 9 + pad || Math.hypot(x - 62, z + 28) < 16 + pad
    || segDist(x, z, 20, -30, 62, -50) < 8 + pad || segDist(x, z, 62, -50, 118, -40) < 8 + pad || segDist(x, z, 118, -40, 122, -12) < 8 + pad || segDist(x, z, 62, -28, 64, 8) < 6 + pad;
}
function flora(g: THREE.Object3D, x: number, z: number, s: number) {
  const n = 2 + Math.floor(R(0, 3));
  for (let i = 0; i < n; i++) { const a = R(0, 6.3), l = R(.6, 1.6) * s, tx = x + Math.cos(a) * .3 * s, tz = z + Math.sin(a) * .3 * s; beam([x, 0, z], [tx + Math.cos(a) * l * .4, l, tz + Math.sin(a) * l * .4], .05 * s, M.cloth, g); mk(G.sph, i % 2 ? M.mag : M.violet, [tx + Math.cos(a) * l * .4, l + .1 * s, tz + Math.sin(a) * l * .4], [.3 * s, .34 * s, .3 * s], 0, g); }
}
export function buildWorld(scene: THREE.Scene, props: Prop[], anim: ((t: number) => void)[]) {
  const w = new THREE.Group(); scene.add(w);
  // Scenery is drawn as a few big merged meshes. Each prop remembers which vertices are its own, so it can crumble or vanish without costing a draw call.
  const batches = new Map<THREE.Material, { geos: THREE.BufferGeometry[]; recs: { p: Prop; start: number; count: number }[]; n: number }>();
  type Opt = { solid?: boolean; stages?: number; y0?: number };
  const prop = (kind: Prop['kind'], name: string, x: number, z: number, r: number, h: number, hp: number, o: Opt, build?: (g: THREE.Group) => void): Prop => {
    const p: Prop = { id: props.length, kind, name, x, z, r, y0: o.y0 || 0, h, hp, maxHp: hp, alive: true, solid: !!o.solid, stage: 0, stages: o.stages || 0, ranges: [], link: [] }; props.push(p);
    if (build) {
      const g = new THREE.Group(); build(g); g.updateMatrixWorld(true);
      g.traverse(c => { const m = c as THREE.Mesh; if (!m.isMesh) return; const geo = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone(); geo.applyMatrix4(m.matrixWorld);
        for (const k of Object.keys(geo.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'uv') geo.deleteAttribute(k);
        const mat = m.material as THREE.Material; let b = batches.get(mat); if (!b) batches.set(mat, b = { geos: [], recs: [], n: 0 }); const count = geo.attributes.position.count; b.recs.push({ p, start: b.n, count }); b.n += count; b.geos.push(geo); });
    }
    return p;
  };
  mk(new THREE.PlaneGeometry(3000, 3000), M.ground, 0, 0, [-Math.PI / 2, 0, 0], w);
  mk(new THREE.PlaneGeometry(190, 6), M.road, [70, .02, ROAD_Z], 0, [-Math.PI / 2, 0, 0], w);
  // far mesas: the skyline, well outside the map edge
  for (let i = 0; i < 36; i++) {
    const a = i / 36 * 6.283 + R(-.06, .06), d = R(250, 430), r = R(34, 80), h = R(24, 90);
    const m = mk(new THREE.CylinderGeometry(r * R(.55, .8), r, h, 7 + (i % 3)), M.mesa, [60 + Math.cos(a) * d, h / 2 - 1, 10 + Math.sin(a) * d], 0, [0, R(0, 3), 0], w);
    if (i % 3 === 0) mk(new THREE.CylinderGeometry(r * .3, r * .42, h * .5, 6), M.mesa, [m.position.x + R(-10, 10), h + h * .22, m.position.z + R(-10, 10)], 0, [0, R(0, 3), 0], w);
  }
  // nearer buttes inside the map: big, slow to bring down, but they do come down
  for (let i = 0; i < 9; i++) { const a = i / 9 * 6.283 + .4, d = R(150, 185), r = R(10, 20), h = R(14, 34), x = 60 + Math.cos(a) * d, z = 10 + Math.sin(a) * d * .8; if (isClear(x, z, r + 6)) continue;
    prop('mesa', 'Butte', x, z, r * .95, h * 1.3, 2600 + r * h * 6, { solid: true, stages: 3 }, g => { mk(new THREE.CylinderGeometry(r * .7, r, h, 7), M.mesa, [x, h / 2 - .5, z], 0, [0, R(0, 3), 0], g); mk(new THREE.CylinderGeometry(r * .4, r * .55, h * .4, 6), M.mesa, [x + R(-3, 3), h * 1.18, z + R(-3, 3)], 0, [0, R(0, 3), 0], g); }); }
  // rocks, spires and plants
  for (let i = 0; i < 260; i++) {
    const x = R(-110, 230), z = R(-130, 150);
    if (i % 8 === 0) { const h = R(8, 20), ww = h * .34; if (isClear(x, z, ww + 2)) continue;
      prop('rock', 'Rock spire', x, z, ww * .5, h + 1, 350 + h * 45, { solid: true, stages: 2 }, g => { mk(G.hexT, M.rock, [x, h / 2 - .5, z], [ww, h, ww], [R(-.08, .08), R(0, 3), R(-.08, .08)], g); mk(G.dod, M.rock, [x + 1, h + .6, z], [h * .3, h * .22, h * .3], [R(0, 3), R(0, 3), 0], g); if (i % 16 === 0) mk(G.hexT, M.rock, [x + ww * .9, h * .22, z + ww * .5], [ww * .7, h * .5, ww * .7], [R(-.2, .2), R(0, 3), R(-.2, .2)], g); }); }
    else if (i % 8 < 5) { if (isClear(x, z, -3) && i % 3) continue; const sc = R(.4, 2.0); prop('rock', 'Boulder', x, z, sc * .55, sc * .6, 40 + sc * 70, {}, g => { mk(G.dod, M.rock, [x, sc * .25, z], [sc, sc * R(.5, .9), sc * R(.7, 1.2)], [R(0, 3), R(0, 3), R(0, 3)], g); }); }
    else if (!isClear(x, z, -6) || Math.hypot(x, z) > 30) { const sc = R(.7, 1.5); prop('plant', 'Bulb weed', x, z, .5 * sc, 1.8 * sc, 8, {}, g => flora(g, x, z, sc)); }
  }
  // The Needle's Eye: a rock arch over the road halfway to the outpost. Knock out a leg and the lintel comes down.
  { const legs: Prop[] = [];
    for (const sz of [-1, 1]) { const z = ROAD_Z + sz * 8.5; legs.push(prop('rock', 'Needle\'s Eye', 68, z, 2.6, 12, 1500, { solid: true, stages: 2 }, g => { mk(G.hexT, M.rock, [68, 6, z], [5, 13, 5], [0, sz, sz * .06], g); mk(G.dod, M.rock, [68.5, .8, z + sz * 2.6], [3, 2, 3], [1, 2, 0], g); })); }
    const top = prop('rock', 'Needle\'s Eye', 68, ROAD_Z, 2.4, 16, 900, { y0: 11.2 }, g => { mk(G.box, M.rock, [68, 12.6, ROAD_Z], [4.4, 3, 22], [0, 0, .04], g); mk(G.dod, M.rock, [68, 14.6, ROAD_Z - 4], [5, 3, 6], [0, 1, 0], g); mk(G.dod, M.rock, [68.4, 14.2, ROAD_Z + 5], [4, 2.6, 5], [0, 2, 0], g); beam([67, 11, ROAD_Z - 3], [67, 8.6, ROAD_Z - 3], .03, M.rubber, g); mk(G.box, M.sign, [67, 7.9, ROAD_Z - 3], [.1, 1.3, 3.6], 0, g); });
    for (const l of legs) l.link.push(top); }
  // crashed ore hauler south of the road
  { const hull = prop('metal', 'Wrecked hauler', 46, 30, 3.2, 3.6, 1400, { solid: true, stages: 1 }, gg => { const g = new THREE.Group(); g.position.set(46, 0, 30); g.rotation.set(0, .5, .12); gg.add(g);
      mk(G.box, M.rust, [0, 1.6, 0], [9, 3, 3.6], 0, g); mk(G.box, M.tealC, [-6.6, 1.3, .4], [3.6, 2.6, 3.4], [0, .2, .1], g); mk(G.box, M.steelD, [5.4, 1.9, 0], [2.2, 2.6, 3.2], 0, g); mk(G.box, M.visor, [6.52, 2.3, 0], [.1, .9, 2.4], 0, g);
      for (const x of [-3, 0, 3, 5.4]) for (const sz of [-1, 1]) mk(G.cyl, M.rubber, [x, .5, sz * 1.9], [1.5, .7, 1.5], [Math.PI / 2, 0, 0], g);
      mk(G.cyl, M.steelD, [4.6, 3.9, -1], [.3, 1.6, .3], 0, g); for (let i = 0; i < 5; i++) mk(G.oct, M.ore, [-2.5 + i * 1.2 + R(-.3, .3), 3.3, R(-.8, .8)], [.6, R(1, 1.8), .6], [R(-.4, .4), 0, R(-.4, .4)], g); });
    for (const [x, z] of [[42, 28], [50, 32.4]]) { const part = prop('metal', 'Wrecked hauler', x, z, 2.6, 3.4, 1, { solid: true }); part.owner = hull; hull.link.push(part); } }
  prop('crystal', 'Spilled ore', 38, 34, 3.5, 1.2, 80, {}, g => { for (let i = 0; i < 6; i++) mk(G.oct, M.ore, [38 + R(-4, 4), .5, 34 + R(-3, 3)], [.5, R(.8, 1.4), .5], [R(-1, 1), 0, R(-1, 1)], g); });
  // base dressing
  for (const [x, z, r] of [[-9, 13, 0], [12, 16, .4], [-14, -4, 1.2], [9, -14, 2]] as P3[]) prop('metal', 'Floodlight', x, z, .4, 7.8, 160, {}, gg => { const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = r; gg.add(g); beam([0, 0, 0], [0, 7, 0], .12, M.steelD, g); beam([0, 7, 0], [1.2, 7.6, 0], .08, M.steelD, g); mk(G.box, M.visor, [1.4, 7.5, 0], [.9, .3, .7], [0, 0, -.5], g); mk(G.box, M.concrete, [0, .2, 0], [.8, .4, .8], 0, g); });
  for (const [x, z] of [[-8, 9], [-9.4, 9.6], [-8.6, 10.6], [8.5, 8.2], [14, -4], [15.2, -3.4], [30, 20], [31.2, 20.6], [58, 9], [59, 9.9], [88, 19], [96, 8.5], [97.2, 8.2]]) prop('barrel', 'Fuel drum', x, z, .48, 1.25, 30, { solid: x < -7 }, g => { mk(G.cyl, i3(x) ? M.rust : M.yellow, [x, .6, z], [.8, 1.2, .8], [0, R(0, 3), 0], g); mk(G.cyl, M.red, [x, 1.0, z], [.83, .12, .83], 0, g); });
  for (const [x, z, m] of [[-11.5, 6, 0], [-11.2, 4.6, 1], [-11.6, 5.3, 2]] as P3[]) prop('metal', 'Crate', x, z, .75, m === 2 ? 2.4 : 1.2, 90, { solid: m !== 2, y0: m === 2 ? 1.15 : 0 }, g => { mk(G.box, [M.tealC, M.rust, M.yellow][m], [x, m === 2 ? 1.75 : .6, z], [1.2, 1.2, 1.2], [0, R(0, 1), 0], g); });
  { const pipe = prop('metal', 'Pipeline', 13.5, -5, .5, .6, 260, {}, g => { beam([7, .25, 1], [20, .25, -11], .22, M.steelD, g); beam([7, .25, 1], [7, .25, 4], .22, M.steelD, g); for (let i = 0; i < 5; i++) mk(G.box, M.concrete, [8.6 + i * 2.6, .2, -.5 - i * 2.4], [.6, .5, .6], 0, g); });
    for (let i = 0; i <= 6; i++) { if (i === 3) continue; const part = prop('metal', 'Pipeline', 7 + 13 * i / 6, 1 - 12 * i / 6, .5, .6, 1, {}); part.owner = pipe; pipe.link.push(part); } }
  for (let i = 0; i < 7; i++) { const a = -2.2 + i * .34, x = Math.cos(a) * 36, z = Math.sin(a) * 36; prop('metal', 'Fence', x, z, .35, 1.6, 40, {}, g => { beam([x, 0, z], [x, 1.5, z], .07, M.steelD, g); if (i) beam([x, 1.2, z], [Math.cos(a - .34) * 36, 1.2, Math.sin(a - .34) * 36], .04, M.rubber, g); }); }
  prop('rock', 'Seep pool', 26, 2, 3, .5, 300, {}, gg => { const g = new THREE.Group(); g.position.set(26, 0, 2); gg.add(g); mk(G.torusF, M.rock, [0, .15, 0], [3, 3, 4], [Math.PI / 2, 0, 0], g); mk(G.disc, M.violet, [0, .22, 0], [2.6, 2.6, 1], [-Math.PI / 2, 0, 0], g); });
  // road markers
  for (let x = 16; x < 112; x += 16) { if (Math.abs(x - 68) < 6) continue; const z = ROAD_Z + (x % 32 ? 4.6 : -4.6); prop('metal', 'Road marker', x, z, .35, 2.8, 60, {}, g => { beam([x, 0, z], [x, 2.2, z], .06, M.steelD, g); mk(G.box, M.hazard1, [x, 2.4, z], [.1, .6, .9], 0, g); }); }
  // Veyl ground: glowing veins and crystal growths around the outpost
  for (let i = 0; i < 26; i++) { const a = R(0, 6.3), d = R(8, 34), x = 126 + Math.cos(a) * d, z = 13 + Math.sin(a) * d, l = R(3, 9), ra = a + R(-.6, .6); mk(G.box, M.teal, [x, .03, z], [l, .04, .16], [0, -ra, 0], w); if (i % 2) mk(G.box, M.teal, [x + Math.cos(ra) * l * .5, .03, z + Math.sin(ra) * l * .5], [l * .5, .04, .12], [0, -ra + .9, 0], w); }
  for (let i = 0; i < 22; i++) { const a = R(0, 6.3), d = R(18, 38), x = 126 + Math.cos(a) * d, z = 13 + Math.sin(a) * d; if (segDist(x, z, 0, ROAD_Z, 130, ROAD_Z) < 6) continue; const n = 2 + Math.floor(R(0, 3));
    prop('crystal', 'Crystal growth', x, z, 1, 3.4, 120, { solid: i % 4 === 0 }, g => { for (let k = 0; k < n; k++) { const h = R(1.2, 4.5); mk(G.oct, k % 3 ? M.crys : M.indigoL, [x + R(-.8, .8), h * .3, z + R(-.8, .8)], [h * .3, h, h * .3], [R(-.5, .5), R(0, 3), R(-.5, .5)], g); } }); }
  // Veyl outpost dressing: brood domes, tall reeds and a dais in the middle
  for (const [x, z, sc] of [[112, -6, 1], [136, -4, 1.2], [141, 27, 1], [128, 34, 1.3], [107, 32, .9]]) prop('veyl', 'Brood dome', x, z, 3 * sc, 4.6 * sc, 900, { solid: true, stages: 2 }, gg => { const g = new THREE.Group(); g.position.set(x, 0, z); g.scale.setScalar(sc); g.rotation.y = R(0, 6); gg.add(g);
    mk(G.sph, M.indigo, [0, .2, 0], [6, 5, 6], 0, g); mk(G.torus, M.mag, [0, 1.5, 0], [5.4, 5.4, 3], [Math.PI / 2, 0, 0], g); mk(G.cone6, M.teal, [0, 3.4, 0], [.5, 2.2, .5], 0, g); mk(G.disc, M.violet, [0, 1.1, 2.86], [1.5, 1.9, 1], 0, g); mk(G.torusF, M.indigoL, [0, 1.1, 2.8], [.95, 1.2, 2], 0, g);
    for (let i = 0; i < 4; i++) { const a = i * 1.57 + .8; mk(G.oct, M.crys, [Math.cos(a) * 3, .5, Math.sin(a) * 3], [.4, 1.3, .4], [R(-.4, .4), 0, R(-.4, .4)], g); } });
  for (const [x, z] of [[104, -2], [146, 8], [134, 38], [100, 24], [118, 40], [144, -8]]) prop('veyl', 'Reed stand', x, z, 2.4, 9, 140, {}, g => { for (let k = 0; k < 6; k++) { const h = R(5, 11), rx = x + R(-2, 2), rz = z + R(-2, 2), lean = R(-.6, .6); beam([rx, 0, rz], [rx + lean, h, rz + R(-.5, .5)], .09, M.indigoL, g); mk(G.oct, M.teal, [rx + lean, h + .3, rz], [.22, .7, .22], 0, g); } });
  mk(G.hexT, M.indigoL, [124, .06, 13], [11, .12, 11], 0, w); mk(G.torusF, M.teal, [124, .16, 13], [4.6, 4.6, .6], [Math.PI / 2, 0, 0], w); mk(G.torusF, M.mag, [124, .16, 13], [2.2, 2.2, .6], [Math.PI / 2, 0, 0], w);
  bake(w);
  for (const [mat, b] of batches) { const geo = b.geos.length > 1 ? mergeGeometries(b.geos) : b.geos[0], mesh = new THREE.Mesh(geo, mat); mesh.frustumCulled = false; w.add(mesh); const attr = geo.attributes.position as THREE.BufferAttribute; for (const r of b.recs) r.p.ranges.push({ attr, start: r.start, count: r.count }); }
  // floating shards over the outpost
  for (let i = 0; i < 9; i++) { const a = i / 9 * 6.283, d = 12 + (i % 3) * 7, y0 = 9 + (i % 4) * 2.5, x = 126 + Math.cos(a) * d, z = 13 + Math.sin(a) * d; const m = mk(G.oct, i % 2 ? M.crys : M.indigo, [x, y0, z], [1.2, 2.6 + (i % 3), 1.2], [R(-.3, .3), 0, R(-.3, .3)], scene); anim.push(t => { m.position.y = y0 + Math.sin(t * .6 + i) * .7; m.rotation.y = t * .2 + i; });
    prop('crystal', 'Sky shard', x, z, .9, y0 + 2.6, 90, { y0: y0 - 2.4 }).obj = m; }
}
const i3 = (x: number) => Math.round(x * 10) % 3 === 0;
export { V3 };
