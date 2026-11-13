// What the ground of terrain.ts looks like: cliffs of banded rock round every stretch of high ground with the painted ground on top, ramps of
// packed dirt edged in stone, breakable rock walls, Flux vents breathing steam and Survey Beacons with a lamp that shows who holds them.
// Cliffs, ramps and vents are the ground itself and are drawn as a few merged meshes. Rock walls and beacons are props, so they can be broken.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { G, M, mk, beam } from './gfx';
import type { Prop } from './data';
import { fac } from './data';
import { TER, BEACON, WALL_UP, h as groundH, type Ridge } from './terrain';
import { rocks } from './models';
import { shard } from './sculpt';

type Opt = { solid?: boolean; stages?: number; y0?: number; at?: [number, number, number] };
type PropFn = (kind: Prop['kind'], name: string, x: number, z: number, r: number, h: number, hp: number, o: Opt, build?: (g: THREE.Group) => void) => Prop;

/** The outline of a ridge seen from above: a long rounded slot round the line a-b, as points going round. */
function outline(R: Ridge, step = 1.6) {
  const dx = R.bx - R.ax, dz = R.bz - R.az, L = Math.hypot(dx, dz), ux = L > 1e-3 ? dx / L : 1, uz = L > 1e-3 ? dz / L : 0, nx = -uz, nz = ux, pts: number[][] = [];
  const arc = (cx: number, cz: number, a0: number) => { const n = Math.max(6, Math.ceil(Math.PI * R.r / step)); for (let i = 0; i <= n; i++) { const a = a0 + i / n * Math.PI; pts.push([cx + Math.cos(a) * R.r, cz + Math.sin(a) * R.r]); } };
  const base = Math.atan2(nz, nx);
  arc(R.bx, R.bz, base - Math.PI);   // round the b end, from one side to the other
  const n = Math.max(1, Math.ceil(L / step)); for (let i = 1; i < n; i++) { const t = 1 - i / n; pts.push([R.ax + dx * t + nx * R.r, R.az + dz * t + nz * R.r]); }
  arc(R.ax, R.az, base); for (let i = 1; i < n; i++) { const t = i / n; pts.push([R.ax + dx * t - nx * R.r, R.az + dz * t - nz * R.r]); }
  return pts;
}

/** Builds the cliffs, ramps, walls, vents and beacons of the map now set. `D` is dice of the ground's own. */
export function buildTerrain(prop: PropFn, w: THREE.Group, anim: ((t: number) => void)[]) {
  if (!TER.ridges.length && !TER.vents.length && !TER.beacons.length) return;
  let ds = 4409 + TER.ridges.length * 31 + TER.vents.length; const D = (a = 0, b = 1) => { ds = (ds * 16807) % 2147483647; return a + (b - a) * ds / 2147483647; };
  const cliff: THREE.BufferGeometry[] = [], top: THREE.BufferGeometry[] = [], stone: THREE.BufferGeometry[] = [], glow: THREE.BufferGeometry[] = [], dark: THREE.BufferGeometry[] = [];
  const add = (list: THREE.BufferGeometry[], geo: THREE.BufferGeometry, p: number[], s: number[] = [1, 1, 1], r: number[] = [0, 0, 0]) => {
    const g = (geo.index ? geo.toNonIndexed() : geo.clone()); for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'uv') g.deleteAttribute(k);
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    g.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(p[0], p[1], p[2]), new THREE.Quaternion().setFromEuler(new THREE.Euler(r[0], r[1], r[2])), new THREE.Vector3(s[0], s[1], s[2]))); list.push(g); };

  for (const R of TER.ridges) {
    const pts = outline(R), n = pts.length, H = R.h, rows = [-.4, H * .28, H * .55, H * .8, H];
    // The cliff face: rows of rock pushed in and out a little, a sloping skirt of scree at the foot, a clean lip at the top so the top meets it.
    const pos: number[] = [], uv: number[] = [];
    const jit = pts.map((_, i) => rows.map((y, j) => j === rows.length - 1 ? 0 : j === 0 ? 1.1 + D(0, .5) : (Math.sin(i * 1.7 + j * 2.3 + R.id) * .35 + D(-.25, .3))));
    const at = (i: number, j: number) => { const [x, z] = pts[i % n], cx = (R.ax + R.bx) / 2, cz = (R.az + R.bz) / 2; let ox = x - cx, oz = z - cz; const l = Math.hypot(ox, oz) || 1; ox /= l; oz /= l;
      // push out along the outline's own normal (from the nearest point of the line), not from the middle
      const t = Math.max(0, Math.min(1, ((x - R.ax) * (R.bx - R.ax) + (z - R.az) * (R.bz - R.az)) / (((R.bx - R.ax) ** 2 + (R.bz - R.az) ** 2) || 1))), qx = R.ax + (R.bx - R.ax) * t, qz = R.az + (R.bz - R.az) * t, ql = Math.hypot(x - qx, z - qz) || 1;
      const k = jit[i % n][j]; return [x + (x - qx) / ql * k, rows[j], z + (z - qz) / ql * k]; };
    for (let i = 0; i < n; i++) for (let j = 0; j < rows.length - 1; j++) { const a = at(i, j), b = at(i + 1, j), c = at(i + 1, j + 1), d = at(i, j + 1);
      pos.push(...a, ...b, ...c, ...a, ...c, ...d); const u0 = i / 4, u1 = (i + 1) / 4, v0 = rows[j] / 4, v1 = rows[j + 1] / 4; uv.push(u0, v0, u1, v0, u1, v1, u0, v0, u1, v1, u0, v1); }
    const face = new THREE.BufferGeometry(); face.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); face.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); face.computeVertexNormals();
    // Wound the other way round on some outlines: make every face look outward.
    { const p = face.attributes.position as THREE.BufferAttribute, nrm = face.attributes.normal as THREE.BufferAttribute; let out = 0; for (let i = 0; i < p.count; i += 3) { const x = p.getX(i), z = p.getZ(i), t = Math.max(0, Math.min(1, ((x - R.ax) * (R.bx - R.ax) + (z - R.az) * (R.bz - R.az)) / (((R.bx - R.ax) ** 2 + (R.bz - R.az) ** 2) || 1))); out += (x - R.ax - (R.bx - R.ax) * t) * nrm.getX(i) + (z - R.az - (R.bz - R.az) * t) * nrm.getZ(i); }
      if (out < 0) { const a = p.array as Float32Array; for (let i = 0; i < a.length; i += 9) for (let k = 0; k < 3; k++) { const t = a[i + 3 + k]; a[i + 3 + k] = a[i + 6 + k]; a[i + 6 + k] = t; } const u = face.attributes.uv.array as Float32Array; for (let i = 0; i < u.length; i += 6) for (let k = 0; k < 2; k++) { const t = u[i + 2 + k]; u[i + 2 + k] = u[i + 4 + k]; u[i + 4 + k] = t; } face.computeVertexNormals(); } }
    cliff.push(face);
    // The top: the painted ground, raised.
    const shape = new THREE.Shape(pts.map(([x, z]) => new THREE.Vector2(x, -z))); const cap = new THREE.ShapeGeometry(shape); cap.rotateX(-Math.PI / 2); cap.translate(0, H + .01, 0); add(top, cap, [0, 0, 0]);
    // Stones along the lip and a scatter of fallen ones at the foot, none on a ramp.
    const onRamp = (x: number, z: number, pad: number) => R.ramps.some(m => { const ax = x - m.tx, az = z - m.tz, t = ax * m.ux + az * m.uz, s = -ax * m.uz + az * m.ux; return t > -3 - pad && t < m.len + pad && Math.abs(s) < m.w / 2 + pad; });
    for (let i = 0; i < n; i += 2) { const [x, z] = pts[i]; if (onRamp(x, z, 1.5)) continue; const s = D(.35, .8); add(stone, rocks(i + R.id), [x + D(-.3, .3), H + s * .15, z + D(-.3, .3)], [s * 1.3, s * .7, s * 1.2], [0, D(0, 6), 0]); }
    for (let i = 0; i < n; i += 3) { const [x, z] = pts[i], t = Math.max(0, Math.min(1, ((x - R.ax) * (R.bx - R.ax) + (z - R.az) * (R.bz - R.az)) / (((R.bx - R.ax) ** 2 + (R.bz - R.az) ** 2) || 1))), qx = R.ax + (R.bx - R.ax) * t, qz = R.az + (R.bz - R.az) * t, l = Math.hypot(x - qx, z - qz) || 1, o = 1.6 + D(0, 1.4), px = x + (x - qx) / l * o, pz = z + (z - qz) / l * o;
      if (onRamp(px, pz, 1)) continue; const s = D(.4, 1.1); add(stone, rocks(i * 3 + R.id), [px, s * .2, pz], [s * 1.2, s * .8, s], [0, D(0, 6), 0]); }
    // Ramps: packed dirt in the painted ground, a kerb of stones down each side and a wedge of rock under it.
    for (const m of R.ramps) {
      const nx = -m.uz, nz = m.ux, segs = 8, rp: number[] = [], ru: number[] = [], side: number[] = [];
      for (let i = 0; i < segs; i++) { const t0 = -1.5 + (m.len + 1.5) * i / segs, t1 = -1.5 + (m.len + 1.5) * (i + 1) / segs, y0 = H * Math.min(1, 1 - t0 / m.len), y1 = H * Math.max(0, 1 - t1 / m.len);
        const P = (t: number, s: number, y: number) => [m.tx + m.ux * t + nx * s, y, m.tz + m.uz * t + nz * s], a = P(t0, -m.w / 2, y0 + .02), b = P(t0, m.w / 2, y0 + .02), c = P(t1, m.w / 2, y1 + .02), d = P(t1, -m.w / 2, y1 + .02);
        rp.push(...a, ...c, ...b, ...a, ...d, ...c); ru.push(0, 0, 1, 1, 1, 0, 0, 0, 0, 1, 1, 1);
        for (const sg of [-1, 1]) { const e0 = P(t0, sg * m.w / 2, y0), e1 = P(t1, sg * m.w / 2, y1), f0 = P(t0, sg * m.w / 2, -.3), f1 = P(t1, sg * m.w / 2, -.3); if (sg > 0) side.push(...f0, ...e1, ...e0, ...f0, ...f1, ...e1); else side.push(...f0, ...e0, ...e1, ...f0, ...e1, ...f1); }
        { const [x, y, z] = P(t0 + .2, 0, y0); add(stone, G.box, [x, y - .02, z], [m.w * .92, .14, .35], [0, Math.atan2(-m.ux, -m.uz), 0]); }   // a tread of laid stone every few metres, so the ramp reads from far up
        for (const sg of [-1, 1]) { const [x, y, z] = P((t0 + t1) / 2, sg * (m.w / 2 + .2), (y0 + y1) / 2); const s = D(.35, .6); add(stone, rocks(i + (sg > 0 ? 3 : 0)), [x, y + s * .1, z], [s * 1.1, s * .8, s * 1.4], [0, D(0, 6), 0]); } }
      const surf = new THREE.BufferGeometry(); surf.setAttribute('position', new THREE.Float32BufferAttribute(rp, 3)); surf.setAttribute('uv', new THREE.Float32BufferAttribute(ru, 2)); surf.computeVertexNormals(); top.push(surf);
      const wall = new THREE.BufferGeometry(); wall.setAttribute('position', new THREE.Float32BufferAttribute(side, 3)); wall.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(side.length / 3 * 2), 2)); wall.computeVertexNormals(); cliff.push(wall);
    }
  }
  // Flux vents: a ring of broken rock round a glowing throat, steam rising off it.
  const puffs: THREE.Mesh[] = [];
  for (const [x, z] of TER.vents) { const y = groundH(x, z);
    for (let i = 0; i < 7; i++) { const a = i / 7 * 6.2832 + D(-.2, .2), d = 1.5 + D(0, .4), s = D(.45, .75); add(stone, rocks(i), [x + Math.cos(a) * d, y + s * .2, z + Math.sin(a) * d], [s * 1.3, s * .9, s * 1.1], [D(-.3, .3), D(0, 6), D(-.3, .3)]); }
    add(dark, G.disc, [x, y + .04, z], [1.5, 1.5, 1], [-Math.PI / 2, 0, 0]); add(glow, G.disc, [x, y + .06, z], [.55, .55, 1], [-Math.PI / 2, 0, 0]);
    for (let i = 0; i < 4; i++) { const a = D(0, 6.28); add(glow, shard(.08, .6, 5, .3), [x + Math.cos(a) * .5, y + .15, z + Math.sin(a) * .5], [1, D(.7, 1.3), 1], [D(-.5, .5), D(0, 3), D(-.5, .5)]); }
    for (let i = 0; i < 3; i++) { const p = mk(G.sph, M.dust, [x, y + 1, z], [.6, .6, .6], 0, w); p.userData = { x, z, y, k: i / 3 + D(0, .2) }; puffs.push(p); } }
  if (puffs.length) anim.push(t => { for (const p of puffs) { const u = p.userData, k = (t * .22 + u.k) % 1, s = .45 + k * 1.3; p.position.set(u.x + Math.sin(t * .7 + u.k * 9) * k * .8, u.y + .6 + k * 5, u.z + Math.cos(t * .5 + u.k * 7) * k * .6); p.scale.setScalar(k < .85 ? s : s * (1 - (k - .85) / .15)); } });

  for (const [list, mat] of [[cliff, M.mesa], [top, M.ground], [stone, M.rockB], [glow, M.mag], [dark, M.soot]] as [THREE.BufferGeometry[], THREE.Material][]) if (list.length) {
    for (const g of list) { for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'uv') g.deleteAttribute(k); if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2)); if (g.index) list[list.indexOf(g)] = g.toNonIndexed(); }
    const m = new THREE.Mesh(mergeGeometries(list), mat); m.frustumCulled = false; m.receiveShadow = true; m.castShadow = mat !== M.mag; m.userData.terrain = true; w.add(m); }

  // Rock walls: a row of big boulders across the back way into a natural. Each one has to be broken to get through.
  TER.walls.forEach(([x, z, a, len], wi) => { const tx = -Math.sin(a), tz = Math.cos(a), n = Math.max(3, Math.ceil(len / 2.1)), blocks: Prop[] = [];
    anim.push(() => { WALL_UP[wi] = blocks.every(b => b.alive); });   // the route finder walks through once any rock of it is broken
    for (let i = 0; i < n; i++) { const o = (i - (n - 1) / 2) * (len / n), bx = x + tx * o, bz = z + tz * o, s = D(2.4, 3.1), hh = D(2.6, 3.6);
      blocks.push(prop('rock', 'Rock wall', bx, bz, 1.55, hh, 1100, { solid: true, stages: 2 }, g => { mk(rocks(i + 2), M.rockB, [bx, hh * .42, bz], [s, hh, s * .9], [D(-.15, .15), D(0, 6), D(-.15, .15)], g); mk(rocks(i + 4), M.rockB, [bx + D(-.5, .5), hh * .95, bz + D(-.5, .5)], [s * .6, hh * .45, s * .55], [0, D(0, 6), 0], g); })); } });

  // Survey Beacons: a lattice mast with a lamp and a ring painted round its foot. Stand inside the ring and your side sees from the lamp.
  TER.beacons.forEach((B, i) => { const { x, z } = B, y = groundH(x, z);
    const mast = prop('metal', 'Survey Beacon', x, z, 1.1, 9.5, 5000, { solid: true, stages: 1 }, g => {
      // built at ground level: a prop is lifted onto whatever ground it stands on
      for (let k = 0; k < 3; k++) { const a = k * 2.094 + .3; beam([x + Math.cos(a) * 1.3, 0, z + Math.sin(a) * 1.3], [x + Math.cos(a) * .35, 8.4, z + Math.sin(a) * .35], .1, M.steelD, g); }
      for (const hy of [2, 4.2, 6.3]) { const r = 1.3 - hy / 8.4 * .95; for (let k = 0; k < 3; k++) { const a0 = k * 2.094 + .3, a1 = a0 + 2.094; beam([x + Math.cos(a0) * r, hy, z + Math.sin(a0) * r], [x + Math.cos(a1) * r, hy, z + Math.sin(a1) * r], .06, M.rust, g); } }
      mk(G.box, M.concrete, [x, .2, z], [3, .4, 3], [0, i, 0], g); mk(G.cyl, M.steelD, [x, 8.6, z], [.7, .5, .7], 0, g); });
    mk(G.torusF, M.hazard, [x, y + .05, z], [BEACON.REACH, BEACON.REACH, .4], [Math.PI / 2, 0, 0], w);
    const lamp = mk(G.sph, M.steelD, [x, y + 9.25, z], [.55, .55, .55], 0, w), cone = mk(G.cone, M.sign, [x, y + 9.25, z], [.5, 2.4, .5], [Math.PI / 2, 0, 0], w); cone.visible = false;
    const lit = [M.gold, M.teal, M.gGlow] as THREE.Material[];
    anim.push(t => { B.alive = mast.alive; const hold = B.alive ? B.held : 0; let side = -1; for (let s = 0; s < 31; s++) if (hold & (1 << s)) { side = side < 0 ? s : -2; }
      lamp.material = side >= 0 ? lit[fac(side) % 3] : side === -2 ? M.sign : M.steelD; cone.visible = side !== -1; cone.rotation.set(Math.PI / 2, 0, t * 2.2); cone.rotation.order = 'YXZ'; cone.rotation.y = t * 2.2; lamp.visible = mast.alive; if (!mast.alive) cone.visible = false; });
  });
}
/** Dresses the ore of a bright field: gold flecks in the crystal and a glow at the foot, and each load from it holds `k` times as much. */
export function brighten(ores: { rich?: number; obj: THREE.Group }[], k: number) {
  let ds = 9133; const D = (a = 0, b = 1) => { ds = (ds * 16807) % 2147483647; return a + (b - a) * ds / 2147483647; };
  for (const o of ores) { o.rich = k; for (let i = 0; i < 4; i++) { const a = D(0, 6.28), d = D(.3, 1.4), hh = D(1.2, 2.6); mk(shard(hh * .2, hh, 5, .3), M.gold, [Math.cos(a) * d, hh * .24, Math.sin(a) * d], 0, [D(-.4, .4), D(0, 3), D(-.4, .4)], o.obj); }
    mk(G.disc, M.gold, [0, .04, 0], [2.2, 2.2, 1], [-Math.PI / 2, 0, 0], o.obj); }
}
