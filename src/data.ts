// Shared types, stat tables and map constants.
import type * as THREE from 'three';
import type { Rig } from './models';

export type Kind = 'rigger' | 'linesman' | 'breacher' | 'gantry' | 'cantor' | 'lancer' | 'warden';
export type BKind = 'headframe' | 'bunkhouse' | 'depot' | 'watchpost' | 'machineshop' | 'choir' | 'reedgate';

export interface UnitDef { name: string; team: number; hp: number; shield: number; speed: number; eye: number; headY: number; bodyY: number; rad: number; cost: number; time: number; supply: number; quip: string; ack: string[] }
export const UNIT: Record<Kind, UnitDef> = {
  rigger: { name: 'Rigger', team: 0, hp: 45, shield: 0, speed: 4.6, eye: 1.5, headY: 1.52, bodyY: .9, rad: .66, cost: 50, time: 8, supply: 1, quip: '"I dig holes. You point at where."', ack: ['Drill\'s warm, boss.', 'Back in the dirt.', 'Hard hat on. Mostly.'] },
  linesman: { name: 'Linesman', team: 0, hp: 60, shield: 0, speed: 4.8, eye: 1.58, headY: 1.56, bodyY: .9, rad: .66, cost: 60, time: 11, supply: 1, quip: '"Paid by the bullet. Tips welcome."', ack: ['Boss is in my head again.', 'Point me at something purple.', 'Safety\'s off. So is my shift.'] },
  breacher: { name: 'Breacher', team: 0, hp: 150, shield: 0, speed: 4.2, eye: 1.78, headY: 1.78, bodyY: 1.02, rad: .8, cost: 110, time: 15, supply: 2, quip: '"I knock. Then there is no door."', ack: ['Shield up. Manners down.', 'Somebody order a wall?', 'Big gun, short walk.'] },
  gantry: { name: 'Gantry', team: 0, hp: 420, shield: 0, speed: 3.9, eye: 2.95, headY: 3.2, bodyY: 2.1, rad: 1.25, cost: 220, time: 22, supply: 4, quip: '"Two legs, two cannons, zero paperwork."', ack: ['Walker\'s yours. Mind the paint.', 'Stomping on your say-so.', 'Big rig, bigger invoice.'] },
  cantor: { name: 'Cantor', team: 1, hp: 80, shield: 40, speed: 5.4, eye: 2.2, headY: 2.42, bodyY: 1.3, rad: .66, cost: 0, time: 0, supply: 0, quip: '', ack: [] },
  lancer: { name: 'Lancer', team: 1, hp: 50, shield: 30, speed: 4.4, eye: 2.0, headY: 2.12, bodyY: 1.25, rad: .6, cost: 0, time: 0, supply: 0, quip: '', ack: [] },
  warden: { name: 'Warden', team: 1, hp: 900, shield: 300, speed: 3.3, eye: 3.8, headY: 4.0, bodyY: 2.7, rad: 1.5, cost: 0, time: 0, supply: 0, quip: '', ack: [] },
};
export interface BldDef { name: string; hp: number; hx: number; hz: number; h: number; cost: number; time: number; blurb: string }
export const BLD: Record<BKind, BldDef> = {
  headframe: { name: 'Headframe', hp: 2200, hx: 6.6, hz: 4.6, h: 5, cost: 0, time: 0, blurb: '' },
  bunkhouse: { name: 'Bunkhouse', hp: 600, hx: 3.9, hz: 3.0, h: 2.8, cost: 150, time: 14, blurb: 'Trains Linesmen and Breachers' },
  depot: { name: 'Depot', hp: 400, hx: 2.8, hz: 2.6, h: 4.6, cost: 100, time: 9, blurb: 'Eight more beds' },
  watchpost: { name: 'Watchpost', hp: 450, hx: 1.6, hz: 1.6, h: 8, cost: 125, time: 11, blurb: 'Gun tower' },
  machineshop: { name: 'Machine Shop', hp: 650, hx: 4.6, hz: 3.6, h: 4, cost: 150, time: 16, blurb: 'Breachers, Gantry walkers, upgrades' },
  choir: { name: 'Choir Stone', hp: 1800, hx: 1.5, hz: 1.5, h: 11, cost: 0, time: 0, blurb: '' },
  reedgate: { name: 'Reed Gate', hp: 1400, hx: 3.6, hz: 1.4, h: 8, cost: 0, time: 0, blurb: '' },
};
export const BUILDABLE: BKind[] = ['bunkhouse', 'depot', 'watchpost', 'machineshop'];
export interface UpDef { key: 'dmg' | 'armor'; name: string; cost: number; blurb: string }
export const UPGRADES: UpDef[] = [
  { key: 'dmg', name: 'Hollow Points', cost: 150, blurb: '+25% gun damage' },
  { key: 'armor', name: 'Plating', cost: 150, blurb: '+25% health' },
];

export interface Order { type: 'guard' | 'amove' | 'follow' | 'raid'; x: number; z: number; path?: number[][] }
export interface Unit {
  id: number; kind: Kind; team: number; pos: THREE.Vector3; yaw: number; hp: number; maxHp: number; shield: number; maxShield: number;
  obj: THREE.Group; rig: Rig; ring: THREE.Mesh; alive: boolean; speed: number; moving: boolean; phase: number; cd: number; think: number;
  target: Unit | Building | null; order: Order; lastHit: number; state: string; timer: number; carrying: number; node: OreNode | null; site: Building | null;
  dashCd: number; dashT: number; swing: number; slot: number; flashT: number; pop: number; wind: number; windX: number; windZ: number; kx: number; kz: number; pitch: number; brace: boolean;
}
export interface Building {
  id: number; kind: BKind; team: number; pos: THREE.Vector3; hx: number; hz: number; h: number; hp: number; maxHp: number; obj: THREE.Group; holo: THREE.Group | null;
  built: boolean; progress: number; queue: { kind: Kind; t: number }[]; alive: boolean; cd: number; builder: Unit | null; lastHit: number; rot: boolean; smokeT: number;
}
export interface OreNode { pos: THREE.Vector3; amount: number; max: number; obj: THREE.Group }
export interface Callout { who: string; text: string; t: number; dur: number; keys: [string, string][] }
export interface Difficulty { name: string; enemy: number; raid: number; blurb: string }
export const DIFFS: Difficulty[] = [
  { name: 'Day shift', enemy: .75, raid: 1.25, blurb: 'Smaller raids, more time' },
  { name: 'Night shift', enemy: 1, raid: 1, blurb: 'The intended fight' },
  { name: 'Double shift', enemy: 1.3, raid: .85, blurb: 'Bigger raids, sooner' },
];

export const OUTPOST = { x: 124, z: 13 };
export const GATE = { x: 138, z: 12 };
export const RALLY = { x: 25, z: 11 };
export const RALLY_N = { x: 14, z: -27 };
export const NORTH_PATH = [[118, -40], [62, -50], [20, -30]];
export const isUnit = (t: any): t is Unit => !!t && t.rig !== undefined;
export const isSoldier = (u: Unit) => u.kind === 'linesman' || u.kind === 'breacher' || u.kind === 'gantry';
