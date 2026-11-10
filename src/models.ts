// Unit, structure and prop models. Everything is assembled from primitive shapes so the
// whole game ships as code. Units return a small rig so they can be animated.
import * as THREE from 'three';
import { G, M, R, mk, beam, setLayer, L_FX, L_VM, holoLine, V3 } from './gfx';

export interface Rig { legL?: THREE.Group; legR?: THREE.Group; arm?: THREE.Group; body: THREE.Group; height: number }
export interface Model { obj: THREE.Group; rig: Rig }

function leg(parent: THREE.Object3D, sx: number, legMat: THREE.Material, knee: boolean) {
  const g = new THREE.Group(); g.position.set(sx * .19, .6, 0); parent.add(g);
  mk(G.cyl, legMat, [0, -.2, 0], [.29, .38, .29], 0, g);
  mk(G.box, M.rubber, [.01 * sx, -.47, .05], [.33, .26, .5], 0, g);
  mk(G.box, M.steelD, [.01 * sx, -.5, .27], [.3, .16, .1], 0, g);
  if (knee) mk(G.sph, M.yellowP, [0, -.2, .13], [.24, .22, .16], 0, g);
  return g;
}

export function trooper(shield = false): Model {
  const obj = new THREE.Group(), body = new THREE.Group(); obj.add(body);
  const legL = leg(obj, -1, M.steelD, true), legR = leg(obj, 1, M.steelD, true);
  for (const sx of [-1, 1]) {
    mk(G.sph, M.yellowP, [sx * .5, 1.1, 0], [.5, .42, .5], 0, body);
    mk(G.cyl, M.steel, [sx * .48, .82, .1], [.2, .42, .2], [-.6, 0, 0], body);
    mk(G.sph, M.rubber, [sx * .4, .68, .32], [.24, .24, .24], 0, body);
    mk(G.box, M.cloth, [sx * .24, .6, .2], [.16, .2, .1], 0, body);
    mk(G.cyl, M.yellowP, [sx * .43, 1.52, 0], [.26, .1, .26], [0, 0, Math.PI / 2], body);
  }
  mk(G.box, M.rubber, [0, .62, 0], [.6, .16, .4], 0, body);
  mk(G.box, M.yellowP, [0, .62, .21], [.16, .14, .04], 0, body);
  mk(G.box, M.steel, [0, .92, 0], [.7, .5, .46], 0, body);
  mk(G.box, M.yellow, [0, .96, .21], [.52, .32, .1], 0, body);
  mk(G.box, M.steelD, [0, .94, -.32], [.48, .5, .24], 0, body);
  mk(G.cyl, M.rust, [.14, 1.0, -.48], [.16, .5, .16], 0, body);
  mk(G.cyl, M.steel, [-.14, .96, -.48], [.12, .4, .12], 0, body);
  mk(G.sph, M.helmet, [0, 1.56, 0], [.84, .78, .84], 0, body);
  mk(G.box, M.rubber, [0, 1.57, .31], [.7, .27, .26], 0, body);
  mk(G.box, M.visor, [0, 1.57, .41], [.54, .11, .1], 0, body);
  mk(G.box, M.steelD, [0, 1.3, .27], [.34, .16, .24], 0, body);
  mk(G.cyl, M.rubber, [.34, 2.0, -.1], [.035, .6, .035], 0, body);
  mk(G.sph, M.red, [.34, 2.32, -.1], [.09, .09, .09], 0, body);
  const arm = new THREE.Group(); body.add(arm);
  if (shield) {
    mk(G.box, M.steel, [-.5, .95, .5], [.95, 1.45, .1], [0, .25, 0], arm); mk(G.box, M.hazard1, [-.5, 1.3, .56], [.9, .3, .06], [0, .25, 0], arm); mk(G.box, M.visor, [-.5, 1.52, .57], [.4, .09, .05], [0, .25, 0], arm);
  } else {
    mk(G.box, M.gun, [0, 0, 0], [.13, .2, .8], 0, arm); mk(G.cyl, M.gun, [0, .03, .58], [.07, .45, .07], [Math.PI / 2, 0, 0], arm); mk(G.box, M.yellowP, [0, -.02, .2], [.15, .1, .26], 0, arm); mk(G.box, M.gun, [0, -.2, -.05], [.1, .26, .14], [.3, 0, 0], arm); mk(G.box, M.rubber, [0, -.02, -.5], [.11, .2, .3], 0, arm);
    arm.position.set(.1, .78, .44); arm.rotation.set(-.05, -.25, 0);
  }
  return { obj, rig: { legL, legR, arm, body, height: 1.6 } };
}

export function rigger(pack = false): Model {
  const obj = new THREE.Group(), body = new THREE.Group(); obj.add(body);
  const legL = leg(obj, -1, M.cloth, false), legR = leg(obj, 1, M.cloth, false);
  for (const sx of [-1, 1]) {
    mk(G.cyl, M.cloth, [sx * .46, .86, .08], [.2, .46, .2], [-.5, 0, sx * -.15], body);
    mk(G.sph, M.yellowP, [sx * .42, .68, .3], [.28, .28, .28], 0, body);
  }
  mk(G.box, M.vest, [0, .9, 0], [.68, .58, .46], 0, body);
  mk(G.box, M.rubber, [0, .62, 0], [.62, .14, .42], 0, body);
  mk(G.box, M.steelD, [-.22, .6, .22], [.14, .2, .08], 0, body); mk(G.box, M.rust, [.2, .58, .22], [.2, .16, .08], 0, body);
  mk(G.sph, M.skin, [0, 1.5, 0], [.7, .68, .7], 0, body);
  for (const sx of [-1, 1]) { mk(G.cyl, M.cyan, [sx * .15, 1.52, .3], [.2, .1, .2], [Math.PI / 2, 0, 0], body); mk(G.torusF, M.rubber, [sx * .15, 1.52, .34], [.24, .24, .2], 0, body); }
  mk(G.box, M.steelD, [0, 1.32, .3], [.26, .16, .18], 0, body);
  mk(G.hemi, M.hardhat, [0, 1.62, 0], [.86, .8, .86], 0, body);
  mk(G.cyl, M.hardhat, [0, 1.64, .06], [1.0, .05, 1.0], 0, body);
  mk(G.cyl, M.visor, [0, 1.86, .36], [.16, .1, .16], [Math.PI / 2.4, 0, 0], body);
  const arm = new THREE.Group(); body.add(arm);
  const packG = new THREE.Group(); body.add(packG); packG.visible = pack;
  mk(G.box, M.steelD, [0, 1.0, -.38], [.56, .56, .3], 0, packG); for (let i = 0; i < 3; i++) mk(G.oct, M.ore, [-.16 + i * .16, 1.42, -.38], [.2, .5, .2], [R(-.3, .3), 0, R(-.3, .3)], packG);
  mk(G.box, M.yellow, [.44, .7, .5], [.18, .2, .4], 0, arm); mk(G.cone, M.steel, [.44, .7, .86], [.2, .4, .2], [Math.PI / 2, 0, 0], arm);
  obj.userData.pack = packG;
  return { obj, rig: { legL, legR, arm, body, height: 1.55 } };
}

export function cantor(): Model {
  const obj = new THREE.Group(), body = new THREE.Group(); obj.add(body);
  for (const sx of [-1, 1]) {
    mk(G.cone, M.indigoD, [sx * .17, .46, 0], [.22, .92, .22], [Math.PI, 0, 0], body);
    mk(G.arc, M.teal, [sx * .62, 1.98, 0], [.8, .8, .8], [0, Math.PI / 2, 0], body);
  }
  beam([-.4, 1.85, 0], [-.56, 1.25, .34], .06, M.indigoD, body); mk(G.sph, M.indigoL, [-.56, 1.2, .36], [.2, .2, .2], 0, body);
  mk(G.taper, M.indigo, [0, 1.1, 0], [.95, 1.0, .8], 0, body);
  mk(G.sph, M.indigo, [0, 1.7, 0], [.66, .72, .54], 0, body);
  mk(G.oct, M.mag, [0, 1.72, .27], [.22, .3, .14], 0, body);
  mk(G.sph, M.indigoL, [0, 2.42, .02], [.62, .86, .66], 0, body);
  mk(G.box, M.teal, [0, 2.46, .3], [.44, .08, .14], 0, body);
  mk(G.cone, M.teal, [0, 2.98, -.14], [.18, .6, .18], [-.4, 0, 0], body);
  mk(G.torus, M.mag, [0, 2.5, -.3], [1.25, 1.25, 1.25], 0, body);
  const arm = new THREE.Group(); arm.position.set(.4, 1.85, 0); body.add(arm);
  beam([0, 0, 0], [.16, -.6, .34], .06, M.indigoD, arm); mk(G.sph, M.indigoL, [.16, -.65, .36], [.2, .2, .2], 0, arm);
  beam([.16, -1.5, .38], [.16, .75, .38], .04, M.steelD, arm); beam([0, .75, .38], [.32, .75, .38], .05, M.mag, arm); beam([0, .75, .38], [0, 1.45, .38], .05, M.mag, arm); beam([.32, .75, .38], [.32, 1.45, .38], .05, M.mag, arm);
  return { obj, rig: { arm, body, height: 2.3 } };
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
  for (let i = 0; i < 5; i++) { const p = mk(G.sph, M.smoke, [3.4, 9, -2], [1, 1, 1], 0, g); anim.push(t => { const k = ((t * .16 + i / 5) % 1); p.position.set(3.4 + k * 3.2 + Math.sin(i * 2.1) * .5, 8.6 + k * 7, -2 - k * 2); const s = .9 + k * 2.6; p.scale.set(s, s * .85, s); }); }
  mk(G.box, M.sign, [-1.4, 5.8, 3.3], [5.2, 1.4, .2], 0, g); beam([-3.4, 4.9, 3.3], [-3.4, 5.2, 3.3], .08, M.steelD, g); beam([.6, 4.9, 3.3], [.6, 5.2, 3.3], .08, M.steelD, g);
  beam([5.6, 0, 4.2], [5.6, 6, 4.2], .1, M.steelD, g); mk(G.box, M.visor, [5.6, 6.1, 4.3], [.9, .5, .3], [.4, 0, 0], g);
  return g;
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
  return g;
}
export function depot() {
  const g = new THREE.Group();
  mk(G.box, M.rust, [0, 1.15, -1.2], [5, 2.3, 2.3], 0, g); mk(G.box, M.tealC, [.2, 1.15, 1.25], [5, 2.3, 2.3], [0, .06, 0], g); mk(G.box, M.yellow, [.1, 3.45, 0], [5, 2.3, 2.3], [0, -.12, 0], g);
  return g;
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
  return g;
}
export function choir(anim: ((t: number) => void)[]) {
  const g = new THREE.Group();
  let y = 0; for (let i = 0; i < 6; i++) { const w = 1.9 - i * .27, h = 1.7; mk(G.hexT, i % 2 ? M.indigoL : M.indigo, [Math.sin(i * .9) * .12, y + h / 2, 0], [w, h, w], [0, i * .55, 0], g); y += h * .94; }
  mk(G.cone6, M.teal, [0, y + 1.1, 0], [.5, 2.4, .5], 0, g);
  for (const [ry, s, tx] of [[4.2, 3.4, .25], [7.4, 2.4, -.3]]) { const r = mk(G.torus, M.mag, [0, ry, 0], [s, s, s], [Math.PI / 2 + tx, 0, 0], g); anim.push(t => { r.rotation.z = t * (tx > 0 ? .7 : -.9); r.position.y = ry + Math.sin(t * 1.4 + ry) * .18; }); }
  for (let i = 0; i < 5; i++) { const a = i / 5 * 6.283; mk(G.oct, M.teal, [Math.cos(a) * 1.6, .3, Math.sin(a) * 1.6], [.3, .8, .3], [R(-.4, .4), 0, R(-.4, .4)], g); }
  return g;
}
export function oreCluster(n: number, sc: number) {
  const g = new THREE.Group();
  for (let i = 0; i < n; i++) { const a = R(0, 6.3), d = R(0, 1.3) * sc, h = R(1.4, 3.4) * sc; mk(G.oct, M.ore, [Math.cos(a) * d, h * .32, Math.sin(a) * d], [h * .34, h, h * .34], [R(-.45, .45), R(0, 3), R(-.45, .45)], g); }
  for (let i = 0; i < 4; i++) { const a = R(0, 6.3); mk(G.dod, M.rock, [Math.cos(a) * 1.7 * sc, .2, Math.sin(a) * 1.7 * sc], [R(.6, 1.2), R(.4, .8), R(.6, 1.2)], [R(0, 3), R(0, 3), 0], g); }
  return g;
}
/** A see-through copy of a model for blueprints. */
export function hologram(src: THREE.Object3D, mat: THREE.Material) {
  const g = new THREE.Group(); src.updateMatrixWorld(true); const inv = new THREE.Matrix4().copy(src.matrixWorld).invert();
  src.traverse((m: any) => { if (!m.isMesh) return; const rel = new THREE.Matrix4().multiplyMatrices(inv, m.matrixWorld); const c = new THREE.Mesh(m.geometry, mat); c.applyMatrix4(rel); g.add(c); const e = new THREE.LineSegments(new THREE.EdgesGeometry(m.geometry, 30), holoLine); e.applyMatrix4(rel); g.add(e); });
  return setLayer(g, L_FX) as THREE.Group;
}

// ---------------------------------------------------------------- first-person view-models
export function vmDrill(anim: ((t: number) => void)[]) {
  const g = new THREE.Group();
  mk(G.box, M.yellow, [0, 0, 0], [.2, .22, .44], 0, g); mk(G.box, M.hazard1, [0, .12, -.05], [.21, .03, .3], 0, g);
  const bit = new THREE.Group(); mk(G.cone, M.steel, [0, 0, 0], [.2, .46, .2], [-Math.PI / 2, 0, 0], bit); for (let i = 0; i < 4; i++) mk(G.torus, M.steelD, [0, 0, .16 - i * .1], [.21 - i * .045, .21 - i * .045, .12], [0, 0, i], bit);
  bit.position.set(0, 0, -.44); g.add(bit); g.userData.bit = bit;
  mk(G.cyl, M.steelD, [0, 0, -.24], [.18, .06, .18], [Math.PI / 2, 0, 0], g);
  mk(G.cyl, M.rubber, [-.11, .04, .05], [.09, .03, .09], [0, 0, Math.PI / 2], g); mk(G.cyl, M.visor, [-.128, .04, .05], [.07, .01, .07], [0, 0, Math.PI / 2], g);
  mk(G.box, M.rubber, [0, -.2, .12], [.08, .22, .1], [.25, 0, 0], g);
  mk(G.sph, M.yellowP, [.02, -.19, .12], [.17, .15, .19], 0, g); mk(G.cyl, M.cloth, [.14, -.36, .42], [.15, .7, .15], [1.05, 0, -.35], g);
  g.scale.setScalar(.62); g.position.set(.3, -.25, -.56); g.rotation.set(.14, .5, .06);
  return setLayer(g, L_VM) as THREE.Group;
}
export function vmRifle() {
  const g = new THREE.Group();
  mk(G.box, M.gun, [0, 0, 0], [.1, .15, .62], 0, g); mk(G.box, M.yellow, [0, .01, -.1], [.115, .11, .3], 0, g);
  mk(G.cyl, M.gun, [0, .02, -.48], [.05, .4, .05], [Math.PI / 2, 0, 0], g); mk(G.cyl, M.steelD, [0, .02, -.66], [.075, .1, .075], [Math.PI / 2, 0, 0], g);
  mk(G.box, M.steelD, [0, -.17, -.04], [.07, .24, .12], [.25, 0, 0], g); mk(G.box, M.rubber, [0, -.14, .2], [.08, .2, .1], [-.3, 0, 0], g);
  mk(G.box, M.rubber, [0, -.01, .42], [.09, .14, .26], 0, g);
  mk(G.torusF, M.steelD, [0, .12, -.2], [.07, .07, .1], 0, g); mk(G.box, M.steelD, [0, .09, .12], [.03, .05, .06], 0, g);
  mk(G.box, M.hazard1, [.052, .0, -.1], [.01, .06, .22], 0, g);
  mk(G.sph, M.rubber, [-.01, -.15, .2], [.15, .14, .17], 0, g); mk(G.cyl, M.steel, [.1, -.3, .5], [.14, .6, .14], [1.1, 0, -.3], g); mk(G.sph, M.yellowP, [.1, -.26, .42], [.2, .18, .2], 0, g);
  mk(G.sph, M.rubber, [-.04, -.1, -.26], [.14, .12, .16], 0, g); mk(G.cyl, M.steel, [-.24, -.26, -.06], [.13, .56, .13], [1.0, 0, .9], g);
  const flash = new THREE.Group(); for (let i = 0; i < 3; i++) mk(G.cone4, M.flash, [0, 0, 0], [.2, .5, .04], [-Math.PI / 2, 0, i * Math.PI / 3], flash);
  flash.position.set(0, .02, -.95); flash.visible = false; g.add(flash); g.userData.flash = flash;
  g.position.set(.27, -.24, -.5); g.rotation.set(.02, .08, 0);
  setLayer(g, L_VM); setLayer(flash, L_FX);
  return g;
}

// ---------------------------------------------------------------- world dressing
export function buildWorld(scene: THREE.Scene, spires: { x: number; z: number; r: number }[]) {
  mk(new THREE.PlaneGeometry(3000, 3000), M.ground, 0, 0, [-Math.PI / 2, 0, 0], scene);
  mk(new THREE.PlaneGeometry(190, 6), M.road, [70, .02, 14], 0, [-Math.PI / 2, 0, 0], scene);
  for (let i = 0; i < 36; i++) {
    const a = i / 36 * 6.283 + R(-.06, .06), d = R(250, 430), r = R(34, 80), h = R(24, 90);
    const m = mk(new THREE.CylinderGeometry(r * R(.55, .8), r, h, 7 + (i % 3)), M.mesa, [60 + Math.cos(a) * d, h / 2 - 1, 10 + Math.sin(a) * d], 0, [0, R(0, 3), 0], scene);
    if (i % 3 === 0) mk(new THREE.CylinderGeometry(r * .3, r * .42, h * .5, 6), M.mesa, [m.position.x + R(-10, 10), h + h * .22, m.position.z + R(-10, 10)], 0, [0, R(0, 3), 0], scene);
  }
  const clear = (x: number, z: number) => (Math.hypot(x, z) < 42) || (Math.hypot(x - 122, z - 13) < 30) || (z > 6 && z < 22 && x > 0 && x < 130);
  for (let i = 0; i < 190; i++) {
    const x = R(-110, 230), z = R(-130, 150); if (clear(x, z)) continue;
    if (i % 8 === 0) { const h = R(8, 20), w = h * .34; mk(G.hexT, M.rock, [x, h / 2 - .5, z], [w, h, w], [R(-.08, .08), R(0, 3), R(-.08, .08)], scene); mk(G.dod, M.rock, [x + 1, h + .6, z], [h * .3, h * .22, h * .3], [R(0, 3), R(0, 3), 0], scene); spires.push({ x, z, r: w * .5 }); }
    else { const s = R(.4, 2.2); mk(G.dod, M.rock, [x, s * .25, z], [s, s * R(.5, .9), s * R(.7, 1.2)], [R(0, 3), R(0, 3), R(0, 3)], scene); }
  }
}
export { V3 };
