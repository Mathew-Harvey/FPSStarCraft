// Sculpted models. The figures in art/ are modelled in Blender and saved to assets/mesh as compact binaries: named groups with a
// pivot each (so the same code that swings a leg still swings it), and under each group one mesh per skin, with a crease value on
// every vertex that the toon shader inks in. The match server has none of these and falls back to the code-built figures.
import * as THREE from 'three';
import { inflateSync } from 'fflate';
import { artBin, artTex } from './artfiles';
import { M, toonMaterial } from './gfx';

export const hasFigure = (kind: string) => !!artBin(kind);
// A figure with its own painted picture wears that one picture on every part, so each joint is a single mesh. The glow and shine each
// part's skin would have had ride on its vertices (aEm), the same way the unit atlas carries them.
const PAINTED: Record<string, THREE.ShaderMaterial> = {};
function painted(kind: string) {
  let m = PAINTED[kind]; if (m) return m;
  const img = new Image(), tex = new THREE.Texture(img); tex.anisotropy = 4; img.onload = () => { tex.needsUpdate = true; }; img.src = artTex(kind + '.tex') || '';
  m = PAINTED[kind] = toonMaterial(tex); m.uniforms.uShine.value = 0; return m;
}
// A building keeps the game's tiled skins and lays its own picture of wear over them (art/kit/bake.py `coat`): rust runs, bleached roofs,
// dust up the foot of the walls. Each skin a building uses gets one copy of its material that reads that building's picture.
const WORN = new Map<string, THREE.ShaderMaterial>(), WEAR: Record<string, THREE.Texture> = {};
function worn(kind: string, src: THREE.ShaderMaterial) {
  const key = kind + '/' + src.uuid; let m = WORN.get(key); if (m) return m;
  let tex = WEAR[kind]; if (!tex) { const img = new Image(); tex = WEAR[kind] = new THREE.Texture(img); img.onload = () => { tex.needsUpdate = true; }; img.src = artTex(kind + '.wear.tex') || ''; }
  m = src.clone(); m.uniforms = { ...src.uniforms, uWear: { value: tex } }; m.defines = { ...src.defines, WEAR: 1 }; WORN.set(key, m); return m;
}
// A building is made afresh every time one is placed, so the unpacked geometry is kept. Whoever takes a figure merges it (bake) before changing it, which copies it.
const CACHE: Record<string, { head: any; geos: THREE.BufferGeometry[] }> = {};
function unpack(c: { head: any; geos: THREE.BufferGeometry[] }, u8: Uint8Array, base: number) {
  const S: number = c.head.scale || 1;
  const own = !!c.head.tex;
  for (const m of c.head.meshes) {
    const n = m.nv, q = new Uint16Array(u8.buffer, base + m.pos, n * 3), nq = new Int8Array(u8.buffer, base + m.nrm, n * 4), uq = new Uint16Array(u8.buffer, base + m.uv, n * 2), ix = new Uint16Array(u8.buffer, base + m.idx, m.ni);
    const pos = new Float32Array(n * 3), nrm = new Float32Array(n * 3), uv = new Float32Array(n * 2), em = new Float32Array(n);
    const skin = (M[m.mat] || M.nS).uniforms, glow = Math.min(1, m.glow ?? skin.uEmis.value) + 2 * Math.round(skin.uShine.value * 10);
    for (let i = 0; i < n; i++) {
      for (let k = 0; k < 3; k++) { pos[i * 3 + k] = (m.lo[k] + q[i * 3 + k] / 65535 * (m.hi[k] - m.lo[k])) * S; nrm[i * 3 + k] = nq[i * 4 + k] / 127; }
      uv[i * 2] = uq[i * 2] / 65535; uv[i * 2 + 1] = uq[i * 2 + 1] / 65535; em[i] = own ? glow : 32 * (nq[i * 4 + 3] + 16);   // the crease rides in the high part of aEm (see TOON_VS)
    }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('normal', new THREE.BufferAttribute(nrm, 3)); geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); geo.setAttribute('aEm', new THREE.BufferAttribute(em, 1));
    if (m.uv2 !== undefined) { const w = new Uint16Array(u8.buffer, base + m.uv2, n * 2), uv2 = new Float32Array(n * 2); for (let i = 0; i < n * 2; i++) uv2[i] = w[i] / 65535; geo.setAttribute('aWear', new THREE.BufferAttribute(uv2, 2)); }
    geo.setIndex(new THREE.BufferAttribute(new Uint16Array(ix), 1)); c.geos.push(geo);
  }
}
/** Builds a sculpted figure, or returns null when this build carries none for `kind`. Groups come back by name. */
export function figure(kind: string): { root: THREE.Group; groups: Record<string, THREE.Group>; points: Record<string, { group: THREE.Group; at: [number, number, number] }> } | null {
  let c = CACHE[kind];
  if (!c) {
    const z8 = artBin(kind); if (!z8) return null;
    const u8 = inflateSync(z8).slice();                                   // the bank is deflated (build.mjs); the views below need the data to start at byte 0 of its own buffer
    const hl = new DataView(u8.buffer).getUint32(0, true); c = CACHE[kind] = { head: JSON.parse(new TextDecoder().decode(u8.subarray(4, 4 + hl))), geos: [] }; unpack(c, u8, 4 + hl);
  }
  const head = c.head;
  const root = new THREE.Group(), groups: Record<string, THREE.Group> = {}, piv: Record<string, number[]> = {}, S: number = head.scale || 1;   // S sizes the whole figure
  for (const g of head.groups) { const o = new THREE.Group(); o.name = g.name; groups[g.name] = o; piv[g.name] = g.pivot; }
  for (const g of head.groups) { const o = groups[g.name], q = g.parent ? piv[g.parent] : [0, 0, 0]; o.position.set((g.pivot[0] - q[0]) * S, (g.pivot[1] - q[1]) * S, (g.pivot[2] - q[2]) * S); if (g.scale && g.scale !== 1) o.scale.setScalar(g.scale); (g.parent ? groups[g.parent] : root).add(o); }
  head.meshes.forEach((m: any, i: number) => { const skin = (M[m.mat] || M.nS) as THREE.ShaderMaterial, mesh = new THREE.Mesh(c!.geos[i], head.tex ? painted(kind) : head.wear && m.uv2 !== undefined && artTex(kind + '.wear.tex') ? worn(kind, skin) : skin); mesh.name = m.part; (groups[m.group] || root).add(mesh); });
  const points: Record<string, { group: THREE.Group; at: [number, number, number] }> = {};   // named spots the game hangs things on (a muzzle flash, say), in their group's own space
  for (const k in head.points || {}) { const q = head.points[k]; points[k] = { group: groups[q.group] || root, at: [q.at[0] * S, q.at[1] * S, q.at[2] * S] }; }
  return { root, groups, points };
}
