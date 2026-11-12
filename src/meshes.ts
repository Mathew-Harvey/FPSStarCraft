// Sculpted models. The figures in art/ are modelled in Blender and saved to assets/mesh as compact binaries: named groups with a
// pivot each (so the same code that swings a leg still swings it), and under each group one mesh per skin, with a crease value on
// every vertex that the toon shader inks in. The match server has none of these and falls back to the code-built figures.
import * as THREE from 'three';
import BANK from 'mesh:bank';
import { M } from './gfx';

export const hasFigure = (kind: string) => !!(BANK as Record<string, string>)[kind];
// A building is made afresh every time one is placed, so the unpacked geometry is kept. Whoever takes a figure merges it (bake) before changing it, which copies it.
const CACHE: Record<string, { head: any; geos: THREE.BufferGeometry[] }> = {};
function unpack(c: { head: any; geos: THREE.BufferGeometry[] }, u8: Uint8Array, base: number) {
  const S: number = c.head.scale || 1;
  for (const m of c.head.meshes) {
    const n = m.nv, q = new Uint16Array(u8.buffer, base + m.pos, n * 3), nq = new Int8Array(u8.buffer, base + m.nrm, n * 4), uq = new Uint16Array(u8.buffer, base + m.uv, n * 2), ix = new Uint16Array(u8.buffer, base + m.idx, m.ni);
    const pos = new Float32Array(n * 3), nrm = new Float32Array(n * 3), uv = new Float32Array(n * 2), em = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      for (let k = 0; k < 3; k++) { pos[i * 3 + k] = (m.lo[k] + q[i * 3 + k] / 65535 * (m.hi[k] - m.lo[k])) * S; nrm[i * 3 + k] = nq[i * 4 + k] / 127; }
      uv[i * 2] = uq[i * 2] / 65535; uv[i * 2 + 1] = uq[i * 2 + 1] / 65535; em[i] = 32 * (nq[i * 4 + 3] + 16);   // the crease rides in the high part of aEm (see TOON_VS)
    }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('normal', new THREE.BufferAttribute(nrm, 3)); geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); geo.setAttribute('aEm', new THREE.BufferAttribute(em, 1));
    geo.setIndex(new THREE.BufferAttribute(new Uint16Array(ix), 1)); c.geos.push(geo);
  }
}
/** Builds a sculpted figure, or returns null when this build carries none for `kind`. Groups come back by name. */
export function figure(kind: string): { root: THREE.Group; groups: Record<string, THREE.Group>; points: Record<string, { group: THREE.Group; at: [number, number, number] }> } | null {
  const src = (BANK as Record<string, string>)[kind]; if (!src) return null;
  let c = CACHE[kind];
  if (!c) {
    const bin = atob(src), u8 = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
    const hl = new DataView(u8.buffer).getUint32(0, true); c = CACHE[kind] = { head: JSON.parse(new TextDecoder().decode(u8.subarray(4, 4 + hl))), geos: [] }; unpack(c, u8, 4 + hl);
  }
  const head = c.head;
  const root = new THREE.Group(), groups: Record<string, THREE.Group> = {}, piv: Record<string, number[]> = {}, S: number = head.scale || 1;   // S sizes the whole figure
  for (const g of head.groups) { const o = new THREE.Group(); o.name = g.name; groups[g.name] = o; piv[g.name] = g.pivot; }
  for (const g of head.groups) { const o = groups[g.name], q = g.parent ? piv[g.parent] : [0, 0, 0]; o.position.set((g.pivot[0] - q[0]) * S, (g.pivot[1] - q[1]) * S, (g.pivot[2] - q[2]) * S); if (g.scale && g.scale !== 1) o.scale.setScalar(g.scale); (g.parent ? groups[g.parent] : root).add(o); }
  head.meshes.forEach((m: any, i: number) => { const mesh = new THREE.Mesh(c!.geos[i], M[m.mat] || M.nS); mesh.name = m.part; (groups[m.group] || root).add(mesh); });
  const points: Record<string, { group: THREE.Group; at: [number, number, number] }> = {};   // named spots the game hangs things on (a muzzle flash, say), in their group's own space
  for (const k in head.points || {}) { const q = head.points[k]; points[k] = { group: groups[q.group] || root, at: [q.at[0] * S, q.at[1] * S, q.at[2] * S] }; }
  return { root, groups, points };
}
