// Sculpted models. The figures in art/ are modelled in Blender and saved to assets/mesh as compact binaries: named groups with a
// pivot each (so the same code that swings a leg still swings it), and under each group one mesh per skin, with a crease value on
// every vertex that the toon shader inks in. The match server has none of these and falls back to the code-built figures.
import * as THREE from 'three';
import { inflateSync } from 'fflate';
import { artBin, artTex, artImg, artVersion } from './artfiles';
import { M, toonMaterial, PRE_DRAW, SHADOW_SWAP, farInkOf, L_FX } from './gfx';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import * as FX from './fx/kit';
import { airShadows } from './fx/air';
import { isEnemy } from './core/sides';
import './fx/hide';
/** The effect kit (src/fx/kit.ts), re-exported so it is in the bundle and tests can reach it as __oreFx. */
export { FX };
(globalThis as any).__oreFx = { ...FX, airShadows };

export const hasFigure = (kind: string) => !!artBin(kind);
// A figure with its own painted picture wears that one picture on every part, so each joint is a single mesh. The glow and shine each
// part's skin would have had ride on its vertices (aEm), the same way the unit atlas carries them.
const PAINTED: Record<string, THREE.ShaderMaterial> = {};
function painted(kind: string) {
  let m = PAINTED[kind]; if (m) return m;
  const ready = artImg(kind + '.tex'), img = ready || new Image(), tex = new THREE.Texture(img); tex.anisotropy = 4;
  if (ready) tex.needsUpdate = true; else { img.onload = () => { tex.needsUpdate = true; }; img.src = artTex(kind + '.tex') || ''; }
  m = PAINTED[kind] = toonMaterial(tex); m.uniforms.uShine.value = 0; m.userData.fig = kind; return m;   // the tag survives the copies a mirror match tints (game.ts tintMirror)
}
// A building keeps the game's tiled skins and lays its own picture of wear over them (art/kit/bake.py `coat`): rust runs, bleached roofs,
// dust up the foot of the walls. Each skin a building uses gets one copy of its material that reads that building's picture.
const WORN = new Map<string, THREE.ShaderMaterial>(), WEAR: Record<string, THREE.Texture> = {};
function worn(kind: string, src: THREE.ShaderMaterial) {
  const key = kind + '/' + src.uuid; let m = WORN.get(key); if (m) return m;
  let tex = WEAR[kind]; if (!tex) { const ready = artImg(kind + '.wear.tex'), img = ready || new Image(), t = tex = WEAR[kind] = new THREE.Texture(img); if (ready) t.needsUpdate = true; else { img.onload = () => { t.needsUpdate = true; }; img.src = artTex(kind + '.wear.tex') || ''; } }
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
  markLevels(kind, root, head); root.userData.lodH = HEIGHT_OF(head);
  return { root, groups, points };
}
/** How tall the near model stands, from its records' bounds (metres). */
const HEIGHT_OF = (head: any) => { let hi = 0; for (const m of head.meshes) hi = Math.max(hi, m.hi[1] + (head.groups.find((g: any) => g.name === m.group)?.pivot[1] || 0)); return Math.max(.5, hi * (head.scale || 1)); };

// ---------------------------------------------------------------- levels of detail
// A kind can bring a middle and a far model (<kind>.mid.bin, <kind>.far.bin, see art/README.md): the same groups and pivots and the same
// picture, with fewer triangles. They hang under the same group nodes as the near model, so whatever poses a body poses every level.
// Before each draw, each body shows the one level that fits how tall it stands on screen (lodPass). A body whose kind has no other level
// keeps its near model at every distance.
/** Which levels each kind has: index 1 middle, 2 far. */
const LEVELS: Record<string, (({ head: any; geos: THREE.BufferGeometry[] }) | null)[]> = {};
function levelData(kind: string, lv: number) {
  let L = LEVELS[kind]; if (!L) L = LEVELS[kind] = [null, undefined as any, undefined as any];
  if (!L[lv]) {
    const z8 = artBin(kind + (lv === 1 ? '.mid' : '.far')); L[lv] = null;   // not cached while missing: it may still be on the way
    if (z8) { const u8 = inflateSync(z8).slice(), hl = new DataView(u8.buffer).getUint32(0, true), c = { head: JSON.parse(new TextDecoder().decode(u8.subarray(4, 4 + hl))), geos: [] as THREE.BufferGeometry[] }; unpack(c, u8, 4 + hl); L[lv] = c; }
  }
  return L[lv];
}
const matFor = (kind: string, head: any, m: any) => { const skin = (M[m.mat] || M.nS) as THREE.ShaderMaterial; return head.tex ? painted(kind) : head.wear && m.uv2 !== undefined && artTex(kind + '.wear.tex') ? worn(kind, skin) : skin; };
/** Per kind and level: one merged geometry per group and material, made once and shared by every body of that kind. */
const MERGED: Record<string, { group: string; mat: THREE.Material; geo: THREE.BufferGeometry }[]> = {};
function mergedLevel(kind: string, lv: number) {
  const key = kind + '/' + lv; let out = MERGED[key]; if (out) return out;
  const c = levelData(kind, lv)!, by = new Map<string, { group: string; mat: THREE.Material; g: THREE.BufferGeometry[] }>(), S: number = c.head.scale || 1;
  const piv: Record<string, number[]> = {}; for (const g of c.head.groups) piv[g.name] = g.pivot;
  c.head.meshes.forEach((m: any, i: number) => { const mat = matFor(kind, c.head, m), k = m.group + '|' + mat.uuid; let e = by.get(k); if (!e) by.set(k, e = { group: m.group, mat, g: [] }); e.g.push(c.geos[i]); });
  out = MERGED[key] = [...by.values()].map(e => ({ group: e.group, mat: e.mat, geo: e.g.length > 1 ? mergeGeometries(e.g, false)! : e.g[0] }));
  return out;
}
/** Marks a freshly built figure as having levels, when its kind has any. Called by figure(). Only painted figures (bodies) switch:
 *  their near meshes are known by their material's tag, while a building's skins are shared with the extras its maker adds. */
function markLevels(kind: string, root: THREE.Group, head: any) {
  if (head.tex) root.userData.lod = kind;     // its middle and far models may come later (src/artfiles.ts): lodPass fills them in then
}
type LodState = { lv: number; meshes: THREE.Mesh[][]; crowd?: boolean; real: boolean[]; wear: THREE.Material | null; groups: Record<string, THREE.Object3D>; v: number };
const STATE = new WeakMap<THREE.Object3D, LodState>();
function lodState(root: THREE.Object3D, kind: string): LodState {
  let s = STATE.get(root);
  if (!s) {
    const near: THREE.Mesh[] = [];
    root.traverse(o => { const m = o as THREE.Mesh; if (m.isMesh && !o.userData.lv && ((m.userData.veilWas || m.material) as THREE.Material).userData?.fig === kind) near.push(m); });
    const wear = near[0] ? (near[0].userData.veilWas || near[0].material) as THREE.Material : null;   // the body's own copy (tinted in a mirror match), worn by every level
    const groups: Record<string, THREE.Object3D> = {}; root.traverse(o => { if (o.name && !groups[o.name] && !(o as THREE.Mesh).isMesh) groups[o.name] = o; });
    s = { lv: 0, meshes: [near, near, near], real: [true, false, false], wear, groups, v: -1 }; STATE.set(root, s);
  }
  // A level that has not come yet (src/artfiles.ts fetches them after the match starts) is stood in for by the next finer one; each time
  // new files land, see whether it is here now.
  if (s.v !== artVersion() && !(s.real[1] && s.real[2])) {
    s.v = artVersion(); const near = s.meshes[0], st = s; let changed = false;
    for (const lv of [1, 2]) if (!st.real[lv] && levelData(kind, lv)) {
      st.meshes[lv] = mergedLevel(kind, lv).map(e => { const m = new THREE.Mesh(e.geo, st.wear || e.mat); m.userData.lv = lv; m.visible = false; m.layers.mask = near[0] ? near[0].layers.mask : 1; (st.groups[e.group] || root).add(m); if (root.userData.veiled && root.userData.veilSeen !== false) FX.veilPart(m); return m; });
      st.real[lv] = changed = true;
    }
    if (changed) {
      if (!st.real[1]) st.meshes[1] = near; if (!st.real[2]) st.meshes[2] = st.meshes[1];
      for (const L of st.meshes) for (const m of L) m.visible = false; for (const m of st.meshes[st.lv]) m.visible = true;
    }
  }
  return s;
}
/** Screen height, in pixels, a body would have to stand to keep each level: above NEAR_PX the near model, above MID_PX the middle one. */
export const LOD = { nearPx: 260, midPx: 70, on: true, force: -1, counts: [0, 0, 0],
  /** Side marks from above: the side the viewer plays (bodies and buildings carry theirs as userData.team), and colour-blind colours. */
  myTeam: 0, cb: false, marks: true,
  /** The coarsest level a body's shadow is drawn from (0 keeps the level it is drawn with). */
  shadowLv: 1,
  /** Far bodies of a kind are drawn together in one call (instanced), in their standing pose. */
  crowd: true };
(globalThis as any).__oreLOD = LOD; (globalThis as any).__oreFigure = (k: string) => figure(k);   // for the zoom benches
const WP = new THREE.Vector3(), CP = new THREE.Vector3();
/** Picks a level for every body with levels in the scene's top layer, from how tall it stands on screen. `h` is the picture height in pixels. */
const SEEN: LodState[] = [];
// ---- the far crowd: every far body of one kind and one paint is drawn in a single call (an instanced mesh), in its standing pose.
// At that size a body is a few dozen pixels and its limbs are not followed; a hundred and fifty bodies cost fifteen-odd draw calls a
// pass instead of a thousand.
const CROWD_GEO: Record<string, THREE.BufferGeometry | null> = {};
function crowdGeo(kind: string) {
  if (kind in CROWD_GEO) return CROWD_GEO[kind];
  const c = levelData(kind, 2); if (!c) return null;   // not cached: it may still come
  const root = new THREE.Group(), groups: Record<string, THREE.Object3D> = {}, piv: Record<string, number[]> = {}, S: number = c.head.scale || 1;
  for (const g of c.head.groups) { groups[g.name] = new THREE.Group(); piv[g.name] = g.pivot; }
  for (const g of c.head.groups) { const o = groups[g.name], q = g.parent ? piv[g.parent] : [0, 0, 0]; o.position.set((g.pivot[0] - q[0]) * S, (g.pivot[1] - q[1]) * S, (g.pivot[2] - q[2]) * S); if (g.scale && g.scale !== 1) o.scale.setScalar(g.scale); (g.parent ? groups[g.parent] : root).add(o); }
  root.updateMatrixWorld(true);
  const parts = c.head.meshes.map((m: any, i: number) => { const g = c.geos[i].clone(); g.deleteAttribute('aWear'); g.applyMatrix4((groups[m.group] || root).matrixWorld); return g; });
  return CROWD_GEO[kind] = mergeGeometries(parts, false);
}
type Crowd = { mesh: THREE.InstancedMesh; n: number };
const CROWDS = new Map<THREE.Scene, Map<string, Crowd>>();
function crowdOf(scene: THREE.Scene, kind: string, mat: THREE.Material): Crowd | null {
  let byKey = CROWDS.get(scene); if (!byKey) CROWDS.set(scene, byKey = new Map());
  const key = kind + '|' + mat.uuid; let cr = byKey.get(key);
  if (!cr) { const geo = crowdGeo(kind); if (!geo) return null; const mesh = new THREE.InstancedMesh(geo, mat, 32); mesh.count = 0; mesh.frustumCulled = false; mesh.name = 'crowd:' + kind; scene.add(mesh); byKey.set(key, cr = { mesh, n: 0 }); }
  if (cr.n >= cr.mesh.instanceMatrix.count) {   // full: a bigger one in its place
    const old = cr.mesh, mesh = new THREE.InstancedMesh(old.geometry, old.material, old.instanceMatrix.count * 2); (mesh.instanceMatrix.array as Float32Array).set(old.instanceMatrix.array as Float32Array); mesh.frustumCulled = false; mesh.name = old.name; scene.remove(old); old.dispose(); scene.add(mesh); cr.mesh = mesh; }
  return cr;
}
export function lodPass(scene: THREE.Scene, cam: THREE.Camera, h: number) {
  const c = LOD.counts; c[0] = c[1] = c[2] = 0; SEEN.length = 0;
  const crowds = CROWDS.get(scene); if (crowds) for (const cr of crowds.values()) cr.n = 0;
  const ortho = (cam as any).isOrthographicCamera, pe = cam.projectionMatrix.elements; cam.getWorldPosition(CP);
  for (const o of scene.children) {
    const kind = o.userData.lod; if (!kind || !o.visible) continue;
    const s = lodState(o, kind), size = (o.userData.lodH || 2) * o.scale.y;
    let px: number;
    if (ortho) px = size * pe[5] * h * .5;
    else { o.getWorldPosition(WP); px = size * pe[5] * h * .5 / Math.max(.1, WP.distanceTo(CP)); }
    // a little give either way, so a body at the line does not flick between levels
    let lv = s.lv; const up = lv === 0 ? LOD.nearPx * .9 : LOD.midPx * (lv === 1 ? .9 : 1.1), dn = lv === 2 ? LOD.midPx * 1.1 : LOD.nearPx * 1.1;
    if (!LOD.on) lv = 0; else if (LOD.force >= 0) lv = LOD.force; else if (lv === 0 && px < up) lv = px < LOD.midPx ? 2 : 1; else if (lv === 1) { if (px > dn) lv = 0; else if (px < up) lv = 2; } else if (lv === 2 && px > dn) lv = px > LOD.nearPx ? 0 : 1;
    if (lv !== s.lv) { const was = s.meshes[s.lv], now = s.meshes[lv]; if (was !== now) { for (const m of was) m.visible = false; for (const m of now) m.visible = true; } s.lv = lv; }
    c[lv]++; SEEN.push(s);
    if (lv === 2 && LOD.crowd && !o.userData.veiled && s.meshes[2] !== s.meshes[1] && s.meshes[2][0]) {
      const cr = crowdOf(scene, kind, s.meshes[2][0].material as THREE.Material);
      if (cr) { for (const m of s.meshes[2]) m.visible = false; s.crowd = true; o.updateMatrix(); cr.mesh.setMatrixAt(cr.n++, o.matrix); continue; }
    }
    if (s.crowd) { s.crowd = false; if (s.lv === 2) for (const m of s.meshes[2]) m.visible = true; }
  }
  if (crowds) for (const cr of crowds.values()) { cr.mesh.count = cr.n; cr.mesh.visible = cr.n > 0; cr.mesh.instanceMatrix.needsUpdate = true; }
}
/** Shadows are a soft dark shape on the ground at the shadow map's few pixels a metre, so a body casts from its middle model: the
 *  near sculpt's 18k triangles drawn a second time for the shadow bought nothing visible. */
SHADOW_SWAP.push(on => {
  if (!LOD.on || !LOD.shadowLv) return;
  for (const s of SEEN) { const lv = Math.max(s.lv, LOD.shadowLv); if (lv === s.lv) continue; const a = s.meshes[on ? s.lv : lv], b = s.meshes[on ? lv : s.lv]; if (a === b) continue; for (const m of a) m.visible = false; for (const m of b) m.visible = true; }
});
PRE_DRAW.push(lodPass);

// ---------------------------------------------------------------- side marks
// From high up a body is a few pixels across and its paint cannot say whose it is. Each body and building that carries its side
// (userData.team) gets a flat disc on the ground in the side's colour, the same colours as the map: yours pale, workers green,
// the enemy pink (orange for colour-blind players). The disc never shrinks below a few pixels, and it fades in only as the view
// climbs, so first person never sees it.
const MARK_GEO = (() => { const g = new THREE.RingGeometry(.86, 1, 40, 1); const d = new THREE.CircleGeometry(.86, 40); const m = mergeGeometries([g, d].map(x => { x.deleteAttribute('uv'); x.deleteAttribute('normal'); const n = x.attributes.position.count, a = new Float32Array(n).fill(x === d ? .26 : 1); x.setAttribute('aA', new THREE.BufferAttribute(a, 1)); return x; }))!; m.rotateX(-Math.PI / 2); return m; })();
const markMat = (hex: string) => new THREE.ShaderMaterial({ transparent: true, depthWrite: false, uniforms: { uC: { value: new THREE.Color(hex) }, uK: { value: 1 }, uFill: { value: 1 } },
  vertexShader: 'attribute float aA; varying float vA; void main(){ vA=aA; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }',
  fragmentShader: 'uniform vec3 uC; uniform float uK,uFill; varying float vA; void main(){ gl_FragColor=vec4(uC,(vA<.99?vA*uFill:.75)*uK); }' });
const MARKS = { mine: markMat('#f4ead2'), work: markMat('#8be04e'), foe: markMat('#ff4f9a'), foeCb: markMat('#ff9d1a'), workCb: markMat('#4da3ff'),
  /** buildings get the rim only: a filled disc that size reads as a floor */ mineB: markMat('#f4ead2'), foeB: markMat('#ff4f9a'), foeBCb: markMat('#ff9d1a'),
  /** a friendly side in a team game: the HUD's ally blue */ pal: markMat('#5ab4ff'), palB: markMat('#5ab4ff') };
for (const k of ['mineB', 'foeB', 'foeBCb', 'palB'] as const) MARKS[k].uniforms.uFill.value = 0;
const MARKED = new WeakMap<THREE.Object3D, THREE.Mesh>();
const MP = new THREE.Vector3();
function markPass(scene: THREE.Scene, cam: THREE.Camera, h: number) {
  const k = LOD.marks ? Math.min(1, Math.max(0, (farInkOf(cam) - .1) / .5)) : 0;
  for (const m of Object.values(MARKS)) m.uniforms.uK.value = k * .85;
  const pe = cam.projectionMatrix.elements, ortho = (cam as any).isOrthographicCamera; cam.getWorldPosition(CP);
  for (const o of scene.children) {
    const team = o.userData.team; if (team === undefined) continue;
    let mk = MARKED.get(o);
    if (!k) { if (mk) mk.visible = false; continue; }
    if (!mk) { mk = new THREE.Mesh(MARK_GEO, MARKS.mine); mk.layers.set(L_FX); mk.renderOrder = 2; mk.frustumCulled = false; mk.name = 'sideMark'; o.add(mk); MARKED.set(o, mk); }
    const pal = team !== LOD.myTeam && !isEnemy(team, LOD.myTeam), foe = team !== LOD.myTeam && !pal, work = !foe && !pal && !!o.userData.worker, bld = !!o.userData.markR;
    mk.material = pal ? (bld ? MARKS.palB : MARKS.pal) : bld ? (foe ? (LOD.cb ? MARKS.foeBCb : MARKS.foeB) : MARKS.mineB) : foe ? (LOD.cb ? MARKS.foeCb : MARKS.foe) : work ? (LOD.cb ? MARKS.workCb : MARKS.work) : MARKS.mine;
    mk.visible = o.visible;
    // at least 7 pixels across, else the footprint the body was given (userData.markR) or its height
    o.getWorldPosition(MP); const perPx = ortho ? 2 / (pe[5] * h) : 2 * MP.distanceTo(CP) / (pe[5] * h);
    const r = Math.max(o.userData.markR || (o.userData.lodH || 2) * .45, 3.5 * perPx);
    mk.scale.set(r / (o.scale.x || 1), 1, r / (o.scale.z || 1)); mk.position.set(0, .06 / (o.scale.y || 1), 0);
  }
}
PRE_DRAW.push(markPass);
