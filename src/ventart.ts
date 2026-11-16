// A Flux vent as it stands in the world: a burnt patch of ground, a ring of broken rock round a dark throat, Flux light in the throat and in
// cracks running out under the stones, and a plume of gas that thins as the vent runs dry. It is one picture turned a different way for each
// vent, so it costs three meshes a vent and four puffs of gas. Show only: no rule reads it, and it throws no dice (every wobble is a fixed sum).
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { M, G, mk } from './gfx';
import { rocks } from './models';

let parts: { rock: THREE.BufferGeometry; burn: THREE.BufferGeometry; flux: THREE.BufferGeometry } | null = null;
const wob = (i: number, k: number) => Math.abs(Math.sin(i * 2.7 + k * 1.3));
function place(geo: THREE.BufferGeometry, p: number[], s: number[], r: number[]) {
  const g = (geo.index ? geo.toNonIndexed() : geo.clone()), m = new THREE.Matrix4().compose(new THREE.Vector3(p[0], p[1], p[2]), new THREE.Quaternion().setFromEuler(new THREE.Euler(r[0], r[1], r[2])), new THREE.Vector3(s[0], s[1], s[2]));
  g.applyMatrix4(m); for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'uv') g.deleteAttribute(k); return g;
}
function build() {
  const rock: THREE.BufferGeometry[] = [], flux: THREE.BufferGeometry[] = [], flat = [-Math.PI / 2, 0, 0];
  // the rim: nine stones, big and small by turns, leaning in over the throat, with a gap where the gas has blown one out
  for (let i = 0; i < 9; i++) { if (i === 6) continue; const a = i / 9 * 6.2832 + (wob(i, 1) - .5) * .3, d = 1.45 + wob(i, 2) * .35, s = .5 + wob(i, 3) * .45; rock.push(place(rocks(i), [Math.cos(a) * d, s * .22, Math.sin(a) * d], [s * 1.35, s * .95, s * 1.1], [(wob(i, 4) - .5) * .5, i * 1.7, (wob(i, 5) - .5) * .5])); }
  for (let i = 0; i < 5; i++) { const a = i * 1.31 + .4, d = 2.5 + wob(i, 6) * .7, s = .16 + wob(i, 7) * .16; rock.push(place(rocks(i + 3), [Math.cos(a) * d, s * .2, Math.sin(a) * d], [s, s * .7, s], [0, i * 2.1, 0])); }   // the blown stone's rubble
  // the burnt ground: a ragged patch
  const sh = new THREE.Shape(), n = 18; for (let j = 0; j < n; j++) { const a = j / n * 6.2832, d = 2.7 * (.72 + .3 * wob(j, 8)); j ? sh.lineTo(Math.cos(a) * d, Math.sin(a) * d) : sh.moveTo(Math.cos(a) * d, Math.sin(a) * d); } sh.closePath();
  const burn = place(new THREE.ShapeGeometry(sh), [0, .03, 0], [1, 1, 1], flat);
  // the light: a pool at the bottom of the throat, cracks running out between the stones, and a few crystals grown on the lip
  flux.push(place(G.disc, [0, .065, 0], [1.05, 1.05, 1], flat));
  for (let i = 0; i < 7; i++) { const a = i / 7 * 6.2832 + (wob(i, 10) - .5) * .5, len = 1 + .9 * wob(i, 11), r = .5 + len / 2; flux.push(place(G.box, [Math.cos(a) * r, .045, Math.sin(a) * r], [len, .03, .05 + .06 * wob(i, 12)], [0, -a, 0]));
    if (i % 2) { const a2 = a + .5, l2 = len * .45; flux.push(place(G.box, [Math.cos(a) * (r + len * .2) + Math.cos(a2) * l2 / 2, .045, Math.sin(a) * (r + len * .2) + Math.sin(a2) * l2 / 2], [l2, .03, .045], [0, -a2, 0])); } }
  for (let i = 0; i < 4; i++) { const a = i * 1.7 + .9, h = .35 + wob(i, 13) * .4; flux.push(place(G.cone4, [Math.cos(a) * .85, h / 2, Math.sin(a) * .85], [.16, h, .16], [(wob(i, 14) - .5) * .7, i, (wob(i, 15) - .5) * .7])); }
  return { rock: mergeGeometries(rock), burn, flux: mergeGeometries(flux) };
}

/** The figure for a vent at a spot. `left` says how full it is (1 to 0); the plume and the light follow it. */
export function ventFigure(x: number, z: number, anim: ((t: number) => void)[], left: () => number): THREE.Group {
  const P = parts || (parts = build()), g = new THREE.Group(); g.rotation.y = (Math.abs(Math.sin(x * 12.9898 + z * 78.233)) * 43758.5453 % 1) * 6.2832; g.userData.vent = true;
  const rock = mk(P.rock, M.rockB, 0, 0, 0, g); rock.castShadow = rock.receiveShadow = true;
  mk(P.burn, M.scorch, 0, 0, 0, g);
  const light = mk(P.flux, M.violet, 0, 0, 0, g);
  const puffs: THREE.Mesh[] = []; for (let i = 0; i < 4; i++) { const p = mk(G.cloud, M.smoke, [0, 1, 0], [.5, .5, .5], [i * 2.1, i * 1.3, 0], g); p.castShadow = false; p.userData.k = i / 4; puffs.push(p); }
  const ph = x * .37 + z * .19;
  anim.push(t => { const full = Math.max(0, Math.min(1, left())), on = full > 0; light.visible = on;
    for (const p of puffs) { const k = (t * .2 + p.userData.k + ph) % 1, s = (.3 + k * .75) * (.55 + .45 * full); p.visible = on; p.position.set(Math.sin(t * .7 + p.userData.k * 9 + ph) * k * .7, .5 + k * (2.6 + 2.6 * full), Math.cos(t * .5 + p.userData.k * 7) * k * .5); p.scale.setScalar(k < .7 ? s : s * (1 - (k - .7) / .3)); p.rotation.y = t * .4 + p.userData.k * 5; } });
  return g;
}
