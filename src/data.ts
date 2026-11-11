// Shared types, stat tables and map constants.
import type * as THREE from 'three';
import type { Rig } from './models';

export type Kind = 'rigger' | 'linesman' | 'breacher' | 'gantry' | 'longshot' | 'patch' | 'cantor' | 'lancer' | 'warden';
export type BKind = 'headframe' | 'bunkhouse' | 'depot' | 'watchpost' | 'machineshop' | 'foundry' | 'choir' | 'reedgate' | 'broodpit' | 'thornspire' | 'wardpylon';

export interface UnitDef { name: string; team: number; hp: number; shield: number; speed: number; eye: number; headY: number; bodyY: number; rad: number; cost: number; time: number; supply: number; quip: string; ack: string[] }
export const UNIT: Record<Kind, UnitDef> = {
  rigger: { name: 'Rigger', team: 0, hp: 45, shield: 0, speed: 4.6, eye: 1.5, headY: 1.52, bodyY: .9, rad: .66, cost: 50, time: 8, supply: 1, quip: '"I dig holes. You point at where."', ack: ['Drill\'s warm, boss.', 'Back in the dirt.', 'Hard hat on. Mostly.'] },
  linesman: { name: 'Linesman', team: 0, hp: 60, shield: 0, speed: 4.8, eye: 1.58, headY: 1.56, bodyY: .9, rad: .66, cost: 60, time: 11, supply: 1, quip: '"Paid by the bullet. Tips welcome."', ack: ['Boss is in my head again.', 'Point me at something purple.', 'Safety\'s off. So is my shift.'] },
  breacher: { name: 'Breacher', team: 0, hp: 150, shield: 0, speed: 4.2, eye: 1.78, headY: 1.78, bodyY: 1.02, rad: .8, cost: 110, time: 15, supply: 2, quip: '"I knock. Then there is no door."', ack: ['Shield up. Manners down.', 'Somebody order a wall?', 'Big gun, short walk.'] },
  gantry: { name: 'Gantry', team: 0, hp: 420, shield: 0, speed: 3.9, eye: 2.95, headY: 3.2, bodyY: 2.1, rad: 1.25, cost: 220, time: 22, supply: 4, quip: '"Two legs, two cannons, zero paperwork."', ack: ['Walker\'s yours. Mind the paint.', 'Stomping on your say-so.', 'Big rig, bigger invoice.'] },
  longshot: { name: 'Longshot', team: 0, hp: 50, shield: 0, speed: 4.7, eye: 1.58, headY: 1.56, bodyY: .9, rad: .66, cost: 120, time: 16, supply: 2, quip: '"I bill by the mile."', ack: ['Scope\'s yours. Breathe out first.', 'One round, one invoice.', 'I was comfortable back there.'] },
  patch: { name: 'Patch', team: 0, hp: 70, shield: 0, speed: 5.0, eye: 1.55, headY: 1.56, bodyY: .9, rad: .66, cost: 90, time: 13, supply: 1, quip: '"Hold still. This is mostly glue."', ack: ['Clinic is open.', 'Who\'s leaking?', 'I do stitches and rivets.'] },
  cantor: { name: 'Cantor', team: 1, hp: 80, shield: 40, speed: 5.4, eye: 2.2, headY: 2.42, bodyY: 1.3, rad: .66, cost: 0, time: 0, supply: 0, quip: '', ack: [] },
  lancer: { name: 'Lancer', team: 1, hp: 50, shield: 30, speed: 4.4, eye: 2.0, headY: 2.12, bodyY: 1.25, rad: .6, cost: 0, time: 0, supply: 0, quip: '', ack: [] },
  warden: { name: 'Warden', team: 1, hp: 900, shield: 300, speed: 3.3, eye: 3.8, headY: 4.0, bodyY: 2.7, rad: 1.5, cost: 0, time: 0, supply: 0, quip: '', ack: [] },
};
export interface BldDef { name: string; hp: number; hx: number; hz: number; h: number; cost: number; time: number; blurb: string; needs?: BKind }
export const BLD: Record<BKind, BldDef> = {
  headframe: { name: 'Headframe', hp: 2400, hx: 6.6, hz: 4.6, h: 5, cost: 0, time: 0, blurb: '' },
  bunkhouse: { name: 'Bunkhouse', hp: 1500, hx: 3.9, hz: 3.0, h: 2.8, cost: 150, time: 14, blurb: 'Trains your soldiers' },
  depot: { name: 'Depot', hp: 800, hx: 2.8, hz: 2.6, h: 4.6, cost: 100, time: 9, blurb: 'Eight more beds' },
  watchpost: { name: 'Watchpost', hp: 550, hx: 1.6, hz: 1.6, h: 8, cost: 125, time: 11, blurb: 'Gun tower' },
  machineshop: { name: 'Machine Shop', hp: 1900, hx: 4.6, hz: 3.6, h: 4, cost: 150, time: 16, blurb: 'Breachers, Patches, upgrades', needs: 'bunkhouse' },
  foundry: { name: 'Foundry', hp: 2000, hx: 4.4, hz: 3.8, h: 6, cost: 200, time: 20, blurb: 'Longshots, Gantry walkers, top upgrades', needs: 'machineshop' },
  choir: { name: 'Choir Stone', hp: 2000, hx: 1.5, hz: 1.5, h: 11, cost: 0, time: 0, blurb: '' },
  reedgate: { name: 'Reed Gate', hp: 1600, hx: 3.6, hz: 1.4, h: 8, cost: 0, time: 0, blurb: '' },
  broodpit: { name: 'Brood Pit', hp: 1500, hx: 3.2, hz: 3.2, h: 4.2, cost: 0, time: 0, blurb: '' },
  thornspire: { name: 'Thorn Spire', hp: 380, hx: 1.2, hz: 1.2, h: 7.6, cost: 0, time: 0, blurb: '' },
  wardpylon: { name: 'Ward Pylon', hp: 520, hx: 1.5, hz: 1.5, h: 7, cost: 0, time: 0, blurb: '' },
};
export const BUILDABLE: BKind[] = ['bunkhouse', 'depot', 'watchpost', 'machineshop', 'foundry'];
export type UpKey = 'dmg' | 'armor' | 'dmg2' | 'armor2';
export interface UpDef { key: UpKey; name: string; cost: number; blurb: string; at: BKind; say: string }
export const UPGRADES: UpDef[] = [
  { key: 'dmg', name: 'Hollow Points', cost: 150, blurb: '+25% gun damage', at: 'machineshop', say: 'Hollow Points issued. Try to hit something with them.' },
  { key: 'armor', name: 'Plating', cost: 150, blurb: '+25% health', at: 'machineshop', say: 'Plating bolted on. Everyone walk heavier.' },
  { key: 'dmg2', name: 'Tungsten Core', cost: 200, blurb: '+20% gun damage', at: 'foundry', say: 'Tungsten Core rounds. Each one costs more than you do.' },
  { key: 'armor2', name: 'Reactive Plating', cost: 200, blurb: '+20% health', at: 'foundry', say: 'Reactive Plating fitted. It bites back, allegedly.' },
];

export interface Order { type: 'guard' | 'amove' | 'follow' | 'raid'; x: number; z: number; path?: number[][]; lead?: Unit }
export interface Unit {
  id: number; kind: Kind; team: number; pos: THREE.Vector3; yaw: number; hp: number; maxHp: number; shield: number; maxShield: number;
  obj: THREE.Group; rig: Rig; ring: THREE.Mesh; alive: boolean; speed: number; moving: boolean; phase: number; cd: number; think: number;
  target: Unit | Building | null; order: Order; lastHit: number; state: string; timer: number; carrying: number; node: OreNode | null; site: Building | null;
  dashCd: number; dashT: number; swing: number; slot: number; flashT: number; pop: number; wind: number; windX: number; windZ: number; kx: number; kz: number; pitch: number; brace: boolean; mend?: Unit | null;
  /** Multiplayer: which player is driving this body (0 for nobody), and where the server last said it was. */
  pilot: number; nx: number; nz: number;
}
export interface Building {
  id: number; kind: BKind; team: number; pos: THREE.Vector3; hx: number; hz: number; h: number; hp: number; maxHp: number; obj: THREE.Group; holo: THREE.Group | null;
  built: boolean; progress: number; queue: { kind: Kind; t: number }[]; alive: boolean; cd: number; builder: Unit | null; lastHit: number; rot: boolean; smokeT: number; stage: number;
}
/** A piece of map scenery that can be shot, blown up or drilled apart. */
export interface Prop {
  id: number; kind: 'rock' | 'mesa' | 'metal' | 'barrel' | 'plant' | 'crystal' | 'veyl'; name: string; x: number; z: number; r: number; y0: number; h: number;
  hp: number; maxHp: number; alive: boolean; solid: boolean; stage: number; stages: number;
  ranges: { attr: THREE.BufferAttribute; start: number; count: number }[]; obj?: THREE.Object3D; owner?: Prop; link: Prop[];
}
export interface OreNode { pos: THREE.Vector3; amount: number; max: number; obj: THREE.Group }
export interface Callout { who: string; text: string; t: number; dur: number; keys: [string, string][] }
export interface Difficulty { name: string; enemy: number; raid: number; blurb: string }
export const DIFFS: Difficulty[] = [
  { name: 'Day shift', enemy: .75, raid: 1.25, blurb: 'Smaller raids, more time' },
  { name: 'Night shift', enemy: 1, raid: 1, blurb: 'The intended fight' },
  { name: 'Double shift', enemy: 1.3, raid: .85, blurb: 'Bigger raids, sooner' },
];

/** One battlefield. The Ironhold yard always sits at the origin; everything else hangs off these numbers. */
export interface MapDef {
  name: string; blurb: string; out: [number, number]; flank: number[][]; road: string; flankName: string; exp: [number, number]; arch: number; wreck: [number, number] | null;
  rocks: number; spireEvery: number; buttes: number; crystals: number; ground: number[]; mesa: number[]; rock: number[]; dusk: number;
}
export const MAPS: MapDef[] = [
  { name: 'Needle\'s Eye', blurb: 'One road east, one ridge north', out: [124, 13], flank: [[118, -40], [62, -50], [20, -30]], road: 'east road', flankName: 'north ridge', exp: [61, -28], arch: 68, wreck: [46, 30],
    rocks: 260, spireEvery: 8, buttes: 9, crystals: 22, ground: [1, 1, 1], mesa: [1, 1, 1], rock: [1, 1, 1], dusk: 0 },
  { name: 'Switchback', blurb: 'Tight canyon, long way round', out: [92, -98], flank: [[118, -62], [112, 4], [44, 22]], road: 'canyon road', flankName: 'south bend', exp: [-52, -44], arch: 0, wreck: [64, -22],
    rocks: 420, spireEvery: 4, buttes: 14, crystals: 14, ground: [1, .85, .72], mesa: [1, .79, .65], rock: [.91, .78, .7], dusk: .55 },
  { name: 'Glass Flats', blurb: 'Wide open, nowhere to hide', out: [-136, 62], flank: [[-96, 104], [-30, 92], [4, 40]], road: 'west causeway', flankName: 'salt shelf', exp: [-58, -30], arch: 76, wreck: null,
    rocks: 110, spireEvery: 14, buttes: 4, crystals: 60, ground: [.78, 1.2, 1.85], mesa: [.8, .92, 1.6], rock: [.8, 1, 1.5], dusk: .1 },
];
export let MAP = MAPS[0];
export const OUTPOST = { x: 124, z: 13 };
export const GATE = { x: 138, z: 12 };
export const RALLY = { x: 25, z: 11 };
export const RALLY_N = { x: 14, z: -27 };
export const NORTH_PATH: number[][] = [[118, -40], [62, -50], [20, -30]];
/** Where the road leaves the yard, its heading, and its length to the outpost. */
export const ROAD = { x: 0, z: 14, dx: 1, dz: 0, len: 124 };
/** A point given as distance along the road and offset to its right-hand side. */
export const roadPt = (s: number, off = 0): [number, number] => [ROAD.x + ROAD.dx * s - ROAD.dz * off, ROAD.z + ROAD.dz * s + ROAD.dx * off];
/** A point in the outpost's own frame: +x is deeper in, away from the yard. */
export const veylPt = (lx: number, lz: number): [number, number] => [OUTPOST.x + ROAD.dx * lx - ROAD.dz * lz, OUTPOST.z + ROAD.dz * lx + ROAD.dx * lz];
export function setMap(i: number) {
  MAP = MAPS[i] || MAPS[0]; const [ox, oz] = MAP.out;
  const ol = Math.hypot(ox, oz), px = -oz / ol, pz = ox / ol;
  if (MAP === MAPS[0]) { ROAD.x = 0; ROAD.z = 14; } else { ROAD.x = px * 12; ROAD.z = pz * 12; }
  const ax = MAP === MAPS[0] ? ox : ox + px, az = MAP === MAPS[0] ? 14 : oz + pz, dx = ax - ROAD.x, dz = az - ROAD.z, l = Math.hypot(dx, dz);
  ROAD.dx = dx / l; ROAD.dz = dz / l; ROAD.len = l; OUTPOST.x = ox; OUTPOST.z = oz;
  const g = veylPt(14, -1); GATE.x = g[0]; GATE.z = g[1];
  const r = roadPt(25, -3); RALLY.x = r[0]; RALLY.z = r[1];
  NORTH_PATH.length = 0; for (const p of MAP.flank) NORTH_PATH.push([p[0], p[1]]);
  const e = MAP.flank[MAP.flank.length - 1], el = Math.hypot(e[0], e[1]) || 1; RALLY_N.x = e[0] - e[0] / el * 7; RALLY_N.z = e[1] - e[1] / el * 7;
}
export const isUnit = (t: any): t is Unit => !!t && t.rig !== undefined;
export const isSoldier = (u: Unit) => u.kind === 'linesman' || u.kind === 'breacher' || u.kind === 'gantry' || u.kind === 'longshot' || u.kind === 'patch';
