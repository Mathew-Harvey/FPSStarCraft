// The battlefields: the map tables, sizes and codes, setMap (which lays out the road, the rallies and the far base for a map code), the
// painted roads, and where the ore fields go (layoutSites). Everything else reads these through src/data.ts, which re-exports them.
import { LAYOUT, SIDE, fac, swapEnd } from './data';
import { layoutTerrain, MADE, PK, madeHere } from './terrain';
import { startsOf, ringSites } from './teammaps';

/** One battlefield. The Ironhold yard always sits at the origin; everything else hangs off these numbers. */
export interface MapDef {
  /** Which of the three maps, and the size it was scaled to (see SIZES). */
  base?: number; size?: number; k?: number;
  /** Ore fields away from the yard, for new bases. Worked out by setMap; the first is the rich seam. */
  sites?: number[][]; /** The map code this layout was built from. */ code?: number;
  name: string; blurb: string; out: [number, number]; flank: number[][]; road: string; flankName: string; exp: [number, number]; arch: number; wreck: [number, number] | null;
  rocks: number; spireEvery: number; buttes: number; crystals: number; ground: number[]; mesa: number[]; rock: number[]; dusk: number;
  /** The far base is somewhere the players are not told: the whole layout is turned about the yard by `turn` sixths of a circle, and decoy roads run out to ore fields. */
  hid?: boolean; turn?: number; /** The middle of the world and how far from it anyone can walk. On a hidden map the middle is pushed off the line between the bases, so the edge of the world does not point at the far base either. */ mid?: [number, number]; rad?: number; /** Every road painted on the ground, as [ax, az, bx, bz]. The first is the one between the two bases. */ roads?: number[][];
  /** A story map's set piece, built on top of the base layout: the split canyon, the glass field round the First Stone, or the Charter drill site. */
  set?: 'crack' | 'stone' | 'drill'; /** The base map whose layout a story map borrows. */ like?: number;
  /** Where Flux comes out of the ground, two by each base and each field: laid out with the rest of the ground (see terrain.ts). */ vents?: [number, number][];
  /** A map with more than two starts (see teammaps.ts): how many, the radius of the circle they stand on at Medium size, and the bearing from
   *  the yard to the middle. `starts` is filled in by setMap; `mains` lists the sites that are empty main bases (a game with more sides drops them). */
  ring?: number; ringR?: number; ringA?: number; starts?: [number, number][]; mains?: number[];
}
export const MAPS: MapDef[] = [
  { name: 'Needle\'s Eye', blurb: 'One road east, one ridge north', out: [124, 13], flank: [[118, -40], [62, -50], [20, -30]], road: 'east road', flankName: 'north ridge', exp: [61, -28], arch: 68, wreck: [46, 30],
    rocks: 260, spireEvery: 8, buttes: 9, crystals: 22, ground: [1, 1, 1], mesa: [1, 1, 1], rock: [1, 1, 1], dusk: .3 },
  { name: 'Switchback', blurb: 'Tight canyon, long way round', out: [92, -98], flank: [[118, -62], [112, 4], [44, 22]], road: 'canyon road', flankName: 'south bend', exp: [-52, -44], arch: 0, wreck: [64, -22],
    rocks: 420, spireEvery: 4, buttes: 14, crystals: 14, ground: [1, .85, .72], mesa: [1, .79, .65], rock: [.91, .78, .7], dusk: .55 },
  { name: 'Glass Flats', blurb: 'Wide open, nowhere to hide', out: [-136, 62], flank: [[-96, 104], [-30, 92], [4, 40]], road: 'west causeway', flankName: 'salt shelf', exp: [-58, -30], arch: 76, wreck: null,
    rocks: 110, spireEvery: 14, buttes: 4, crystals: 60, ground: [.78, 1.2, 1.85], mesa: [.8, .92, 1.6], rock: [.8, 1, 1.5], dusk: .1 },
  // Story maps. Each one keeps a base map's roads and spacing, so the bots and the balance still hold, and builds its own set on top.
  { name: 'The Crack', blurb: 'Switchback after the seal broke', out: [92, -98], flank: [[118, -62], [112, 4], [44, 22]], road: 'canyon road', flankName: 'south bend', exp: [-52, -44], arch: 0, wreck: [64, -22],
    rocks: 360, spireEvery: 5, buttes: 12, crystals: 30, ground: [.86, .9, .78], mesa: [.82, .74, .78], rock: [.8, .76, .8], dusk: .4, set: 'crack', like: 1 },
  { name: 'First Stone', blurb: 'The oldest glass on Tithe', out: [124, 13], flank: [[118, -40], [62, -50], [20, -30]], road: 'old glass road', flankName: 'north terraces', exp: [61, -28], arch: 68, wreck: null,
    rocks: 180, spireEvery: 6, buttes: 7, crystals: 70, ground: [.92, 1.12, 1.25], mesa: [.95, 1.05, 1.3], rock: [.9, 1.05, 1.2], dusk: .05, set: 'stone', like: 0 },
  { name: 'Drill Site', blurb: 'The Charter\'s hole in the Glass Flats', out: [-136, 62], flank: [[-96, 104], [-30, 92], [4, 40]], road: 'west causeway', flankName: 'salt shelf', exp: [-58, -30], arch: 0, wreck: null,
    rocks: 120, spireEvery: 12, buttes: 4, crystals: 40, ground: [.62, .82, 1.25], mesa: [.66, .72, 1.1], rock: [.7, .8, 1.1], dusk: .8, set: 'drill', like: 2 },
  // Team maps (see teammaps.ts). Their roads, flank, far base and natural are worked out from the circle of starts.
  { name: 'Crossing', blurb: 'Four starts round a crossroads', out: [0, 0], flank: [], road: 'cross road', flankName: 'side road', exp: [0, 0], arch: 0, wreck: null,
    rocks: 300, spireEvery: 7, buttes: 10, crystals: 18, ground: [1, .93, .84], mesa: [1, .9, .8], rock: [.95, .88, .82], dusk: .35, ring: 4, ringR: 108, ringA: .3 },
  { name: 'Wheel', blurb: 'Eight starts round a hub', out: [0, 0], flank: [], road: 'spoke road', flankName: 'rim road', exp: [0, 0], arch: 0, wreck: null,
    rocks: 520, spireEvery: 6, buttes: 16, crystals: 26, ground: [.9, 1.02, 1.12], mesa: [.88, .95, 1.1], rock: [.86, .92, 1.05], dusk: .2, ring: 8, ringR: 152, ringA: -.2 },
];
export let MAP: MapDef = MAPS[0];
/** Map sizes. A map number carries its size in the tens: 0 to 2 are Medium, 10 to 12 Small, 20 to 22 Large. */
export const SIZES = [{ name: 'Medium', k: 1, sites: 4, blurb: 'Four ore fields to take' }, { name: 'Small', k: .75, sites: 3, blurb: 'Close quarters, three fields' }, { name: 'Large', k: 1.4, sites: 7, blurb: 'A long way out, seven fields' }, { name: 'Vast', k: 2, sites: 12, blurb: 'Twelve fields, and nobody tells you where they are' }];
/** A map number also carries a turn in the hundreds. 0 is the layout as drawn. 1 to TURNS turn everything but the yard about the yard, and the match hides where the far base is. */
export const TURNS = 24;
export const baseOf = (code: number) => code % 10, sizeOf = (code: number) => Math.floor(code / 10) % 10, turnOf = (code: number) => Math.floor(code / 100);
/** The size whose matches hide the far base. */
export const VAST = 3;
export const mapCode = (base: number, size: number) => base + 10 * size;
/** The map a match is played on: a Vast map gets a turn nobody chose, so the far base is somewhere new each time. Every other size is left as it is, and draws nothing from the dice. */
export const rollMap = (code: number, turn = 0) => sizeOf(code) === VAST && !MAPS[baseOf(code)]?.ring ? code % 100 + 100 * (turn >= 1 && turn <= TURNS ? turn : 1 + Math.floor(Math.random() * TURNS)) : code % 100;
export const validMap = (code: number) => Number.isInteger(code) && code >= 0 && baseOf(code) < MAPS.length && sizeOf(code) < SIZES.length && turnOf(code) <= TURNS && !(turnOf(code) && (MAPS[baseOf(code)].set || MAPS[baseOf(code)].ring));
const segD = (x: number, z: number, ax: number, az: number, bx: number, bz: number) => { const dx = bx - ax, dz = bz - az, t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz || 1))); return Math.hypot(x - ax - dx * t, z - az - dz * t); };
export const OUTPOST = { x: 124, z: 13 };
export const GATE = { x: 138, z: 12 };
export const RALLY = { x: 25, z: 11 };
export const RALLY_N = { x: 14, z: -27 };
/** The Veyl squad's rally points, on the road and toward the ridge, and where a Veyl economy's first Choir Stone stands. */
export const VRALLY = { x: 98, z: 11 }, VRALLY_N = { x: 121, z: -15 }, VHOME = { x: 132, z: 13 };
export const NORTH_PATH: number[][] = [[118, -40], [62, -50], [20, -30]];
/** Where the road leaves the yard, its heading, and its length to the outpost. */
export const ROAD = { x: 0, z: 14, dx: 1, dz: 0, len: 124 };
/** A point given as distance along the road and offset to its right-hand side. */
export const roadPt = (s: number, off = 0): [number, number] => [ROAD.x + ROAD.dx * s - ROAD.dz * off, ROAD.z + ROAD.dz * s + ROAD.dx * off];
/** A point in the outpost's own frame: +x is deeper in, away from the yard. */
export const veylPt = (lx: number, lz: number): [number, number] => [OUTPOST.x + ROAD.dx * lx - ROAD.dz * lz, OUTPOST.z + ROAD.dz * lx + ROAD.dx * lz];
export function setMap(code: number) {
  if (!validMap(code)) code = 0; const base = baseOf(code), size = sizeOf(code), turn = turnOf(code), S = SIZES[size], k = S.k, B0 = MAPS[base], sc = (p: number[]) => [Math.round(p[0] * k), Math.round(p[1] * k)];
  // A turned map: the road, the flank, the far base and the wreck all swing round the yard together. The rich seam swings by its own amount (see below), so it does not point at the far base.
  const th = turn ? turn * 6.2832 / TURNS + .13 : 0, cs = Math.cos(th), sn = Math.sin(th), tr = (p: number[]) => [p[0] * cs - p[1] * sn, p[0] * sn + p[1] * cs];
  let B: MapDef = turn ? { ...B0, out: tr(B0.out) as [number, number], flank: B0.flank.map(tr), exp: tr(B0.exp) as [number, number], wreck: B0.wreck ? tr(B0.wreck) as [number, number] : null } : B0;
  // A team map: the far base is the start opposite the yard, the flank runs past the next start round, the natural sits off the yard toward the middle.
  const starts = B0.ring ? startsOf(B0, k) : undefined;
  if (starts) { const n = starts.length, [hx, hz] = starts[n / 2], l = Math.hypot(hx, hz), cx = hx / 2, cz = hz / 2, [fx, fz] = starts[n / 2 - 1], toC = Math.atan2(cz, cx);
    B = { ...B0, out: [(hx - hx / l * 8) / k, (hz - hz / l * 8) / k], flank: [[(cx + (fx - cx) * .55) / k, (cz + (fz - cz) * .55) / k]], exp: [Math.cos(toC + .95) * 62, Math.sin(toC + .95) * 62] }; }
  // A made map (mapmaker.ts) puts the far base where its maker did, runs the flank out to one side of the middle, and has no wreck of its own.
  const MP = MADE.plan && MADE.plan.b === base && MADE.plan.s === size && !turn && !B0.ring && !B0.set ? MADE.plan : null;
  if (MP) { const [ox, oz] = MP.out, l = Math.hypot(ox, oz) || 1, f = MP.items.find(i => i[0] === PK.field); B = { ...B, out: [ox / k, oz / k], flank: [[(ox / 2 - oz / l * l * .3) / k, (oz / 2 + ox / l * l * .3) / k]], exp: f ? [f[1] / k, f[2] / k] : B.exp, wreck: null }; }
  MAP = { ...B, base, size, k, out: sc(B.out) as [number, number], flank: B.flank.map(sc), exp: sc(B.exp) as [number, number], arch: turn ? 0 : Math.round(B.arch * k) /* a rock arch over one road would mark it as the real one */, wreck: B.wreck ? sc(B.wreck) as [number, number] : null, rocks: Math.round(B.rocks * k * k), buttes: Math.round(B.buttes * k), crystals: B.crystals };
  const ne = (B.like ?? base) === 0 && !turn && !MP; if (ne) MAP.out[1] = 13;
  const [ox, oz] = MAP.out;
  const ol = Math.hypot(ox, oz), px = -oz / ol, pz = ox / ol;
  if (ne) { ROAD.x = 0; ROAD.z = 14; } else { ROAD.x = px * 12; ROAD.z = pz * 12; }
  const ax = ne ? ox : ox + px, az = ne ? 14 : oz + pz, dx = ax - ROAD.x, dz = az - ROAD.z, l = Math.hypot(dx, dz);
  ROAD.dx = dx / l; ROAD.dz = dz / l; ROAD.len = l; OUTPOST.x = ox; OUTPOST.z = oz;
  const g = veylPt(14, -1); GATE.x = g[0]; GATE.z = g[1];
  const r = roadPt(25, -3); RALLY.x = r[0]; RALLY.z = r[1];
  NORTH_PATH.length = 0; for (const p of MAP.flank) NORTH_PATH.push([p[0], p[1]]);
  const e = MAP.flank[MAP.flank.length - 1], el = Math.hypot(e[0], e[1]) || 1; RALLY_N.x = e[0] - e[0] / el * 7; RALLY_N.z = e[1] - e[1] / el * 7;
  const vr = roadPt(ROAD.len - 24, 3); VRALLY.x = vr[0]; VRALLY.z = vr[1]; const f0 = MAP.flank[0]; VRALLY_N.x = ox + (f0[0] - ox) * .5; VRALLY_N.z = oz + (f0[1] - oz) * .5; const vh = veylPt(8, 1); VHOME.x = vh[0]; VHOME.z = vh[1];
  MAP.code = code; MAP.turn = turn; MAP.hid = turn > 0; MAP.mid = [ox / 2, oz / 2]; MAP.rad = 200 * k;
  if (starts) { const n = starts.length; VHOME.x = starts[n / 2][0]; VHOME.z = starts[n / 2][1]; MAP.starts = starts; MAP.mid = [VHOME.x / 2, VHOME.z / 2]; MAP.rad = Math.hypot(VHOME.x, VHOME.z) / 2 + 80 * k; MAP.rocks = Math.round(B.rocks * k * k); }
  if (turn) {
    // The world is a disc with room behind both bases, and its middle sits off to one side, so neither the skyline nor the edge of the rock says which way to look.
    const hs = (n: number) => { const v = Math.sin(code * 12.9898 + n * 78.233) * 43758.5453; return v - Math.floor(v); }, ma = hs(1) * 6.2832, mo = 40 + 40 * hs(2);
    MAP.mid = [ox / 2 + Math.cos(ma) * mo, oz / 2 + Math.sin(ma) * mo]; MAP.rad = ol / 2 + mo + 200; MAP.rocks = Math.round(B.rocks * 3.1416 * MAP.rad * MAP.rad / 95200 * .65); MAP.buttes = Math.round(B.buttes * MAP.rad / 200);
    // The rich seam keeps its distance from the yard but takes a bearing of its own, the first of a few that stands clear of the road and the flank.
    const el = Math.min(92, Math.hypot(MAP.exp[0], MAP.exp[1])), a0 = Math.atan2(MAP.exp[1], MAP.exp[0]), end = roadPt(ROAD.len + 6);
    for (const da of [2.2, 4.1, 1.1, 3.2, 5.2, 0].map(a => a + hs(3) * 6.2832)) { const x = Math.round(Math.cos(a0 + da) * el), z = Math.round(Math.sin(a0 + da) * el); let far = segD(x, z, ROAD.x, ROAD.z, end[0], end[1]) > 34 && Math.hypot(x - ox, z - oz) > 140;
      let qx = ox, qz = oz; for (const [fx, fz] of MAP.flank) { if (segD(x, z, qx, qz, fx, fz) < 28) far = false; qx = fx; qz = fz; } if (segD(x, z, qx, qz, 0, 0) < 28) far = false; if (far) { MAP.exp = [x, z]; break; } }
    MAP.road = compass(ox, oz) + ' road'; const fm = MAP.flank[Math.floor(MAP.flank.length / 2)], fn = compass(fm[0] - ox / 2, fm[1] - oz / 2); MAP.flankName = (fn + ' road' === MAP.road ? 'far' : fn) + ' ridge';
  }
  layoutSites();
}
/** The compass bearing of a point from the yard, as a word. East is +x and north is -z. */
export const compass = (x: number, z: number) => ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west'][((Math.round(Math.atan2(x, -z) / (Math.PI / 4)) % 8) + 8) % 8];
/** The roads painted on the ground. On a hidden map each end gets a few more, out to ore fields, so the one road between the bases does not give the far end away. */
function layoutRoads() {
  const roads: number[][] = [MAP.hid ? [...roadPt(2), ...roadPt(ROAD.len - 2)] : [...roadPt(-25), ...roadPt(ROAD.len + 41)]];
  // A team map paints a road from every start to the middle.
  if (MAP.starts) { const [cx, cz] = MAP.mid!; roads.length = 0; for (const [x, z] of MAP.starts) { const l = Math.hypot(cx - x, cz - z); roads.push([x + (cx - x) / l * 6, z + (cz - z) / l * 6, cx, cz]); } }
  if (MAP.hid) for (const [hx, hz, rx, rz] of [[0, 0, ROAD.dx, ROAD.dz], [VHOME.x, VHOME.z, -ROAD.dx, -ROAD.dz]]) {
    const used = [Math.atan2(rz, rx)], gap = (a: number, b: number) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));
    const by = (MAP.sites || []).map(([x, z]) => ({ x, z, d: Math.hypot(x - hx, z - hz), a: Math.atan2(z - hz, x - hx) })).sort((p, q) => p.d - q.d); let n = 0;
    for (const q of by) { if (n >= 4 || q.d < 40 || q.d > 215 || used.some(a => gap(a, q.a) < .55)) continue; const ux = Math.cos(q.a), uz = Math.sin(q.a); roads.push([hx + ux * 10, hz + uz * 10, q.x - ux * 9, q.z - uz * 9]); used.push(q.a); n++; }
  }
  MAP.roads = roads;
}
const SITES = new Map<string, number[][]>();
/** Ore fields for new bases: the old rich seam near the yard first, then spots spread around the map, clear of the yard, the outpost and both
 *  routes. The rich seam sits a short walk from the yard, which suits the classic match (Ironhold at the yard against an outpost). In every other
 *  pairing the outpost gets the same seam turned round, so neither end has the nearer first field. */
export function layoutSites() {
  if (!MAP || MAP.code === undefined) return;   // the ground (terrain.ts) is laid out at every way out of here, once the fields are down
  const fair = LAYOUT.fair && !MAP.hid, even = fair || !(fac(SIDE.home) === 0 && fac(SIDE.out) !== 0) || !!MAP.hid, key = MAP.code + (fair ? 'f' : even ? 'e' : 'c'), had = MAP.ring || madeHere() ? null : SITES.get(key); if (had) { MAP.sites = had; layoutRoads(); layoutTerrain(); return; }
  if (madeHere()) { const sites: number[][] = []; for (const it of MADE.plan!.items) { if (it[0] !== PK.field) continue; const [, x, z, br = 0] = it, [sx, sz] = swapEnd(x, z); sites.push([x, z, 0, br ? 1 : 0]); if (Math.hypot(sx - x, sz - z) > 1.5) sites.push([Math.round(sx * 10) / 10, Math.round(sz * 10) / 10, 1, br ? 1 : 0]); }
    MAP.sites = sites; layoutRoads(); layoutTerrain(); return; }   // a made map's fields, each with its twin at the other end
  if (MAP.ring) { const mains: number[] = [], sites = ringSites(MAP, mains); MAP.mains = mains; MAP.sites = sites; SITES.set(key, sites); layoutRoads(); layoutTerrain(); return; }   // a team map lays its own fields, one copy per start
  const k = MAP.k, S = SIZES[MAP.size], [ox, oz] = MAP.out;
  const sites: number[][] = [[MAP.exp[0], MAP.exp[1]]], cx = ox / 2, cz = oz / 2, end = roadPt(ROAD.len + 6);
  if (even) sites.push(swapEnd(MAP.exp[0], MAP.exp[1]).map(Math.round));
  if (MAP.hid) {
    sites[1][2] = 1;
    // A hidden map lays its fields in rings round the yard and gives the far base the same rings turned end for end. Fields lie on every side of
    // both bases, so where the ore is says nothing about where the other base is.
    const [mx, mz] = MAP.mid!, lim = MAP.rad! - 45, hs = (n: number) => { const v = Math.sin(MAP.code! * 39.3468 + n * 11.135) * 24634.6345; return v - Math.floor(v); };
    const fine = (x: number, z: number) => { if (Math.hypot(x, z) < 82 || Math.hypot(x - VHOME.x, z - VHOME.z) < 82 || Math.hypot(x - mx, z - mz) > lim || segD(x, z, ROAD.x, ROAD.z, end[0], end[1]) < 24) return false;
      let qx = ox, qz = oz; for (const [fx, fz] of MAP.flank) { if (segD(x, z, qx, qz, fx, fz) < 16) return false; qx = fx; qz = fz; } return segD(x, z, qx, qz, 0, 0) >= 16; };
    const gapTo = (x: number, z: number) => Math.min(...sites.map(q => Math.hypot(x - q[0], z - q[1])));
    for (const [r, n, pairs] of [[108, 9, 2], [178, 12, 2], [250, 15, 1]]) { const a0 = hs(r) * 6.2832, ring: number[][] = [];
      for (let i = 0; i < n; i++) { const x = Math.round(Math.cos(a0 + i / n * 6.2832) * r), z = Math.round(Math.sin(a0 + i / n * 6.2832) * r), m = swapEnd(x, z); if (fine(x, z) && fine(m[0], m[1])) ring.push([x, z]); }
      for (let c = 0; c < pairs && sites.length < S.sites; c++) { let best = -1, bd = 76; ring.forEach(([x, z], i) => { const m = swapEnd(x, z), d = Math.min(gapTo(x, z), gapTo(m[0], m[1]), Math.hypot(x - m[0], z - m[1])); if (d > bd) { bd = d; best = i; } }); if (best < 0) break;
        const [x, z] = ring.splice(best, 1)[0]; sites.push([x, z], [...swapEnd(x, z).map(Math.round), 1]); } }   // the twin's seams are the first one's turned round (see Game)
    MAP.sites = sites; SITES.set(key, sites); layoutRoads(); layoutTerrain(); return;
  }
  const ok = (x: number, z: number) => { if (Math.hypot(x, z) < 52 * k || Math.hypot(x - ox, z - oz) < 58 * k || Math.hypot(x - cx, z - cz) > 168 * k) return false; if (segD(x, z, ROAD.x, ROAD.z, end[0], end[1]) < 20) return false;
    let qx = ox, qz = oz; for (const [fx, fz] of MAP.flank) { if (segD(x, z, qx, qz, fx, fz) < 16) return false; qx = fx; qz = fz; } return segD(x, z, qx, qz, 0, 0) >= 16; };
  const cand: number[][] = []; for (let a = 0; a < 32; a++) for (const f of [.5, .72, .95]) { const x = Math.round(cx + Math.cos(a / 32 * 6.2832) * f * 150 * k), z = Math.round(cz + Math.sin(a / 32 * 6.2832) * f * 120 * k); if (ok(x, z)) cand.push([x, z]); }
  if (fair) {
    // Every field after the first pair comes with its twin for the other end (a third number marks a twin: the game turns the first one's seams
    // round for it). Each pair is the nearest spot to its own end that is a real walk out (85 m on a Medium map), well clear of the fields
    // already down, nearer to its own end than to the other, and not tucked away behind its own base where nobody could ever reach it. An odd
    // field out is one in the middle, the same walk from both ends.
    sites[1][2] = 1; const [hx, hz] = swapEnd(0, 0), dH = (x: number, z: number) => Math.hypot(x, z), dO = (x: number, z: number) => Math.hypot(x - hx, z - hz), gap = (x: number, z: number) => Math.min(...sites.map(s => Math.hypot(x - s[0], z - s[1])));
    const grid: number[][] = []; for (let x = Math.round(cx - 150 * k); x <= cx + 150 * k; x += 4) for (let z = Math.round(cz - 120 * k); z <= cz + 120 * k; z += 4) if (((x - cx) / (150 * k)) ** 2 + ((z - cz) / (120 * k)) ** 2 <= .9 && ok(x, z)) grid.push([x, z]);
    while (sites.length + 2 <= S.sites) { let best: number[] | null = null, bd = 1e9; for (const [x, z] of grid) { const [mx, mz] = swapEnd(x, z).map(Math.round); if (!ok(mx, mz) || dH(x, z) < 85 * k || dH(x, z) > dO(x, z) - 30 || gap(x, z) < 58 * k || gap(mx, mz) < 58 * k) continue; const d = dH(x, z) + Math.max(0, dO(x, z) - dH(x, z) * 1.6) * 2; if (d < bd) { bd = d; best = [x, z, mx, mz]; } }
      if (!best) break; sites.push([best[0], best[1]], [best[2], best[3], 1]); }
    if (sites.length < S.sites) { let best: number[] | null = null, bd = -1; for (const [x, z] of grid) { if (Math.abs(dH(x, z) - dO(x, z)) > 4) continue; const d = gap(x, z); if (d > bd) { bd = d; best = [x, z]; } } if (best && bd >= 34) sites.push(best); }
    MAP.sites = sites; SITES.set(key, sites); layoutRoads(); layoutTerrain(); return;
  }
  while (sites.length < S.sites && cand.length) { let best = -1, bd = -1; cand.forEach(([x, z], i) => { const d = Math.min(Math.hypot(x, z) * .8, ...sites.map(s => Math.hypot(x - s[0], z - s[1]))); if (d > bd) { bd = d; best = i; } }); if (bd < 34) break; sites.push(cand.splice(best, 1)[0]); }
  MAP.sites = sites; SITES.set(key, sites); layoutRoads(); layoutTerrain();
}
