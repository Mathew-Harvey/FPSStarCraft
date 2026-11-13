// Maps with more than two start spots, for team games and free-for-all: Crossing (four starts) and Wheel (eight). The starts stand round a
// circle and everything on the map comes in as many copies as there are starts, each turned round the middle by the same step, so every start
// has the same ground, the same fields and the same walk to them. Start 0 is the yard and the start opposite it is the far base, so a one on one
// match plays on these maps as it does on any other; the starts nobody holds are main bases left empty, with their ore, for anyone to take.
//
// Which starts play together is a start layout (TEAM_LAYOUTS). Each one is fair by the same symmetry: one team's starts turned round the middle
// land on the other team's.
import type { MapDef } from './data';

/** How the starts of a map with `n` starts are split into teams for each kind of game. Every team is the first one turned round the middle. */
export const TEAM_LAYOUTS: Record<number, { name: string; teams: number[][] }[]> = {
  4: [{ name: '1v1', teams: [[0], [2]] }, { name: '2v2', teams: [[0, 1], [2, 3]] }, { name: 'Free for all', teams: [[0], [1], [2], [3]] }],
  8: [{ name: '1v1', teams: [[0], [4]] }, { name: '2v2', teams: [[0, 1], [4, 5]] }, { name: '3v3', teams: [[0, 1, 2], [4, 5, 6]] }, { name: '4v4', teams: [[0, 1, 2, 3], [4, 5, 6, 7]] }, { name: 'Free for all', teams: [[0], [1], [2], [3], [4], [5], [6], [7]] }],
};

/** The circle a ring map's starts stand on, scaled by the map size k: its middle, its radius, and the bearing from the middle to start 0. */
export function ring(B: MapDef, k: number) {
  const R = (B.ringR || 100) * k, a0 = B.ringA || 0, cx = Math.cos(a0) * R, cz = Math.sin(a0) * R;
  return { n: B.ring!, R, cx, cz, a0: a0 + Math.PI };
}
/** Where each start stands. Start 0 is the yard at (0, 0); start n/2 is opposite it. They go round counterclockwise seen from above (toward +z from +x). */
export function startsOf(B: MapDef, k: number): [number, number][] {
  const { n, R, cx, cz, a0 } = ring(B, k); return Array.from({ length: n }, (_, i) => { const a = a0 + i * 2 * Math.PI / n; return [Math.round((cx + Math.cos(a) * R) * 100) / 100, Math.round((cz + Math.sin(a) * R) * 100) / 100] as [number, number]; });
}
/** Turns a point round the middle of a ring map by i steps (one step is the turn from one start to the next). */
export function turn(M: MapDef, i: number, x: number, z: number): [number, number] {
  const [cx, cz] = M.mid!, a = i * 2 * Math.PI / M.ring!, c = Math.cos(a), s = Math.sin(a), dx = x - cx, dz = z - cz; return [cx + dx * c - dz * s, cz + dx * s + dz * c];
}
/** Turns a direction (no middle) by i steps. */
export const turnDir = (M: MapDef, i: number, x: number, z: number): [number, number] => { const a = i * 2 * Math.PI / M.ring!, c = Math.cos(a), s = Math.sin(a); return [x * c - z * s, x * s + z * c]; };

/** What kind of field each site of a ring map is, and which start's turn it is: the engine lays its seams from this (see seamsFor). */
export interface RingSite { kind: 'natural' | 'outer' | 'main'; step: number }
let RSITES: RingSite[] = [];
/** The ore fields of a ring map, as MAP.sites rows: each start's natural, a field out on the rim between each pair of starts, and the main base of
 *  every start nobody holds in a one on one match. They come in pairs (a field, then the same field turned half way round, marked as its twin),
 *  so the engine's two-sided rules still hold. `mains` gets the indexes of the empty main bases, which a game with more sides leaves out. */
export function ringSites(M: MapDef, mains: number[]): number[][] {
  const n = M.ring!, k = M.k || 1, [cx, cz] = M.mid!, R = Math.hypot(cx, cz), sites: number[][] = []; RSITES = []; mains.length = 0;
  const toC = Math.atan2(cz, cx), na = n > 4 ? .6 : .95, nd = (n > 4 ? 56 : 62) * k, nat: [number, number] = [Math.cos(toC + na) * nd, Math.sin(toC + na) * nd];
  // With eight starts the next start stands closer, so the natural sits nearer the road to the middle, still well clear of the neighbour.
  const half = Math.PI / n, ao = Math.atan2(-cz, -cx) + half, outer: [number, number] = [cx + Math.cos(ao) * (R + 18 * k), cz + Math.sin(ao) * (R + 18 * k)];
  const add = (kind: RingSite['kind'], p: [number, number], skip0 = false) => { for (let i = skip0 ? 1 : 0; i < n / 2; i++) for (const j of [i, i + n / 2]) { const [x, z] = turn(M, j, p[0], p[1]); if (kind === 'main') mains.push(sites.length); const rx = Math.round(x * 10) / 10, rz = Math.round(z * 10) / 10; sites.push(j === i ? [rx, rz] : [rx, rz, 1]); RSITES.push({ kind, step: j }); } };
  add('natural', nat); if ((M.size ?? 0) !== 1) add('outer', outer); add('main', [0, 0], true);
  return sites;
}
/** Seams for site i of a ring map, laid in the frame of start 0 and turned with the site, so every copy is the same field: [x, z, crystals, scale]. */
export function seamsFor(M: MapDef, i: number, yard: number[][]): { list: number[][]; amt: number } | null {
  if (!M.ring || !RSITES[i]) return null; const S = RSITES[i], [sx, sz] = M.sites![i];
  const base = S.kind === 'natural' ? { list: [[-1, 0, 10, 1.5], [4, 4, 8, 1.3], [-3, -5, 9, 1.4]], amt: 1600 } : S.kind === 'outer' ? { list: [[-6, 3, 8, 1.2], [0, 6, 9, 1.3], [6, 3, 7, 1.1], [2, 9, 8, 1.2]], amt: 1000 } : { list: yard, amt: 900 };
  // Outer fields face out from the middle; a main base's seams sit round its start as the yard's do round the yard.
  let ux = 0, uz = 1; if (S.kind === 'outer') { const [cx, cz] = M.mid!; const l = Math.hypot(sx - cx, sz - cz) || 1; ux = (sx - cx) / l; uz = (sz - cz) / l; const [bx, bz] = turnDir(M, -S.step, ux, uz); ux = bx; uz = bz; }
  return { amt: base.amt, list: base.list.map(([x, z, nn, sc]) => {
    // In start 0's frame: outer seams are laid with +z pointing out from the middle.
    let lx = x, lz = z; if (S.kind === 'outer') { lx = x * uz + z * ux; lz = -x * ux + z * uz; }
    const [dx, dz] = turnDir(M, S.step, lx, lz); return [Math.round((sx + dx) * 10) / 10, Math.round((sz + dz) * 10) / 10, nn, sc]; }) };
}
export const ringSite = (i: number) => RSITES[i];
