// Shared types, stat tables and map constants.
import type * as THREE from 'three';
import type { Rig } from './models';
import type { FightDef, Line } from './core/combat';
import type { Vent } from './core/econ';

import { I_UNIT, I_BLD, I_BUILDABLE, I_FACTION, I_TRAINS, I_NEEDS, I_UPGRADES, type IKind, type IBKind, type IUpKey } from './factions/ironhold/numbers';
import { V_UNIT, V_BLD, V_FACTION, V_TRAINS, V_UPGRADES, V_NEEDS, type VKind, type VBKind, type VUpKey } from './factions/veyl/numbers';
import { G_UNIT, G_BLD, G_UPGRADES, G_FACTION, G_TRAINS, G_UNLOCK, type GKind, type GBKind, type GUpKey } from './factions/gloam/numbers';
// Each faction's numbers live in src/factions/<faction>/numbers.ts. This file joins them into the tables the shared code reads.
export type Kind = IKind | VKind | GKind;
export type BKind = IBKind | VBKind | GBKind;

export interface UnitDef { name: string; team: number; hp: number; shield: number; speed: number; eye: number; headY: number; bodyY: number; rad: number; cost: number; time: number; supply: number; quip: string; ack: string[]; /** Flux on top of the ore cost. */ flux?: number;
  /** Flies (src/core/air.ts): over cliffs and buildings, hit only by weapons that reach the air. */ air?: boolean; /** Energy for abilities, up to this. */ energy?: number;
  /** Unseen until detected (always, not just when an ability says so), and how far it sees unseen bodies. */ cloak?: boolean; detect?: number;
  /** Cargo slots it carries, and the slots it takes up inside one. */ cargo?: number; slots?: number;
  /** Mines and builds like a Rigger (the Haul Drone). */ worker?: boolean; /** Left behind (a mine, a turret): not a fighter, never enlisted or ordered. */ ward?: boolean; /** Walks up cliffs (the Reedwalker; read by the terrain). */ climb?: boolean;
  /** A driven body's attack, for the server's checks (stream K's net-arms): reach in metres, most damage one hit can do, hits a second. */ reach?: number; hit?: number; rate?: number }
export interface UnitDef extends FightDef {}
export const UNIT: Record<Kind, UnitDef> = { ...I_UNIT, ...V_UNIT, ...(G_UNIT as Record<GKind, UnitDef>) };
export interface BldDef { name: string; hp: number; hx: number; hz: number; h: number; cost: number; time: number; blurb: string; needs?: BKind[]; /** Flux on top of the ore cost. */ flux?: number; /** Sees unseen bodies this far. */ detect?: number; /** Bodies it can hold (a bunker). */ cargo?: number }
export interface BldDef extends FightDef {}
export const BLD: Record<BKind, BldDef> = { ...I_BLD, ...V_BLD, ...(G_BLD as Record<GBKind, BldDef>) };
export const BUILDABLE: BKind[] = I_BUILDABLE;
/** Everything about a side that the shared code needs to know. Keyed by team: 0 is the Ironhold Charter, 1 the Veyl Chorus. */
export interface Faction { name: string; short: string; hq: BKind; worker: Kind; supply: BKind; builds: BKind[]; voice: string; squad: string; lead: Kind; ore: string; /** Where its first fighters train: the squad's playbook waits on it. */ barracks: BKind }
export const FACTION: Record<number, Faction> = { 0: I_FACTION, 1: V_FACTION, 2: G_FACTION };
// Teams 3 to 5 are the second side of a mirror match: the same faction as team - 3, holding the other end of the map.
FACTION[3] = FACTION[0]; FACTION[4] = FACTION[1]; FACTION[5] = FACTION[2];
/** The faction a team plays: 0 Ironhold, 1 Veyl, 2 Gloam. */
export const fac = (team: number) => team % 3;
/** The team that plays a faction at the other end in a mirror match. */
export const MIRROR = 3;
/** Who speaks for which side in the message feed. A player only hears their own side, plus Signal and chat. */
export const VOICE_SIDE: Record<string, number> = { 'Held Fifth': 1,  Conductor: 1, Chorus: 1, 'Chorus Lead': 1, Cantor: 1, Lancer: 1, Warden: 1, Tender: 1, Watcher: 1, Overgrowth: 2, Swarm: 2, Grazer: 2, Snapper: 2, Quillback: 2, Blister: 2, Mulcher: 2, Rootwatch: 2 };
/** Who holds each end of the map this match, as teams: `home` the yard at the origin, `out` the outpost at the far end of the road.
 *  Any faction can hold either end. A mirror match puts the same faction at both ends, the outpost side as team faction + 3. Set before a Game is made. */
export const SIDE = { home: 0, out: 1 };
/** Sets who holds each end from the two factions, and returns the two teams. It also ends any team game setup (see setTeamGame). */
export const setSides = (homeFac: number, outFac: number) => { clearMatch(); SIDE.home = homeFac; SIDE.out = outFac === homeFac ? outFac + MIRROR : outFac; layoutSites(); return [SIDE.home, SIDE.out]; };
/** A match code for the lobby and the menus: home faction times 3 plus outpost faction. The old codes 1 and 2 (Ironhold against the Veyl or the Gloam) still mean the same. */
export const sidesCode = () => fac(SIDE.home) * 3 + fac(SIDE.out);
/** Sets up a team game or free-for-all from a plan (see planTeams), or with null goes back to a plain one-on-one. Returns the plan's
 *  teams, or null when the plan does not hold (and then it is a one-on-one). A plan with only two sides is a one-on-one. Set before a Game is made. */
export function setTeamGame(p: TeamPlan | null) {
  const t = p ? planTeams(p) : null; if (!t) { clearMatch(); return null; }
  setSides(fac(t.home), fac(t.out)); if (t.teams.length > 2) setMatch(t.teams, t.at, p!.n, t.groups); else clearMatch(); return t;
}
export const setSidesCode = (code: number) => { const c = Number.isInteger(code) && code >= 0 && code < 9 ? code : 1; return setSides(Math.floor(c / 3), c % 3); };
/** The side a side fights. A one-on-one has two; with more sides it is the enemy this side is going after now (MATCH.foe, set by the Director). */
export const foeOf = (team: number) => multi() ? MATCH.foe[team] ?? enemiesOf(team)[0] ?? team : team === SIDE.home ? SIDE.out : SIDE.home;
/** True for the side that holds the yard. */
export const atHome = (team: number) => team === SIDE.home;
/** Turns a point in one end's frame into the same spot at the other end: a half turn about the middle of the two bases.
 *  Each brain is written for its own end (the Quartermaster for the yard, the Conductor and the Overgrowth for the outpost); this moves it. */
/** Where a team's home base stands: the yard for the side at home, the outpost for the side at the far end. */
export const homeXZ = (team: number): [number, number] => multi() ? startXZ(startOf(team)) : atHome(team) ? [0, 0] : [VHOME.x, VHOME.z];
/** With more than two sides, the start spots stand round the middle of the two ends, each the yard turned by the same step: start 0 is the yard,
 *  start n/2 the far base. `turnPt` turns a point from start 0's frame to start i's. (On a ring map MAP.starts is the same list.) */
export const turnPt = (i: number, x: number, z: number): [number, number] => { if (!i) return [x, z]; const cx = VHOME.x / 2, cz = VHOME.z / 2, a = i * 2 * Math.PI / ((MAP_ as any).ring || MATCH.n), c = Math.cos(a), sn = Math.sin(a), dx = x - cx, dz = z - cz; return [cx + dx * c - dz * sn, cz + dx * sn + dz * c]; };
/** Where start spot i stands. */
export const startXZ = (i: number): [number, number] => { const s: number[] | undefined = (MAP_ as any).starts?.[i]; return s ? [s[0], s[1]] : turnPt(i, 0, 0); };
export const swapEnd = (x: number, z: number): [number, number] => [VHOME.x - x, VHOME.z - z];
/** A point written for the yard (`yard` true) or the outpost, moved to wherever this team actually stands. */
export const endPt = (team: number, x: number, z: number, yard: boolean): [number, number] => { if (multi()) { const [yx, yz] = yard ? [x, z] : swapEnd(x, z); return turnPt(startOf(team), yx, yz); } return atHome(team) === yard ? [x, z] : swapEnd(x, z); };
export const isWorker = (k: Kind) => k === 'rigger' || k === 'tender' || k === 'grazer' || !!UNIT[k]?.worker;
export const isGloam = (k: Kind) => fac(UNIT[k]?.team ?? 0) === 2;
/** What each building trains, and the extra building a unit needs standing before it can be trained. */
export const TRAINS: Partial<Record<BKind, Kind[]>> = { ...I_TRAINS, ...V_TRAINS, ...G_TRAINS };
export const UNIT_NEEDS: Partial<Record<Kind, BKind>> = { ...I_NEEDS, ...V_NEEDS, ...Object.fromEntries(Object.entries(G_UNLOCK).filter(([k]) => k !== 'grazer')) };
export type UpKey = IUpKey | VUpKey | GUpKey;
/** Research. `at` is the building that sells it, and `needs` is the research that has to be bought first. */
export interface UpDef { key: UpKey; /** A research level for one category of body only (see UnitDef.cat). */ cat?: string; /** A research level: its line (attack, armour, shields) and level 1 to 3 (src/core/combat.ts). */ line?: Line; lvl?: number; /** Percent mode: what this level multiplies by (default 25%, 20%, 15%). */ pct?: number; name: string; cost: number; /** Flux on top of the ore cost. */ flux?: number; blurb: string; at: BKind; say: string; needs?: UpKey; /** The side that can buy it. Ironhold when left out. */ team?: number }
export const UPGRADES: UpDef[] = [...I_UPGRADES, ...V_UPGRADES.map(u => ({ ...u, team: 1 })), ...G_UPGRADES.map(u => ({ ...u, team: 2 }))];
/** Research a side can buy. */
export const upsOf = (team: number) => UPGRADES.filter(u => (u.team || 0) === fac(team));

export interface Order { type: 'guard' | 'amove' | 'follow' | 'raid' | 'scout'; x: number; z: number; path?: number[][]; lead?: Unit; /** Seconds to stand and let the rest of the march catch up. */ waitT?: number; /** Given by a player from the command view: the side's own brain leaves this body alone until it is handed back. */ mine?: boolean; /** The one enemy body or building this body was told to attack. */ prey?: Unit | Building; /** A scout: on its way home, walking round a find, and turned back hurt. */ back?: boolean; loop?: boolean; fled?: boolean }
export interface Unit {
  /** Set once a Veyl guard has broken off to regrow its shield, so it only does that once. */
  fled?: boolean; leashed?: boolean;
  /** Scenery a Veyl Lancer is sheltering behind, if any. */
  cover?: Prop | null;
  id: number; kind: Kind; team: number; pos: THREE.Vector3; yaw: number; hp: number; maxHp: number; shield: number; maxShield: number;
  obj: THREE.Group; rig: Rig; ring: THREE.Mesh; alive: boolean; speed: number; moving: boolean; phase: number; cd: number; think: number;
  target: Unit | Building | null; order: Order; lastHit: number; state: string; timer: number; carrying: number; node: OreNode | null; site: Building | null;
  dashCd: number; dashT: number; swing: number; slot: number; flashT: number; pop: number; wind: number; windX: number; windZ: number; kx: number; kz: number; pitch: number; brace: boolean; mend?: Unit | null;
  /** A seam a worker was sent to from the command view: it keeps going back there while the seam has ore. */
  pref?: OreNode | null;
  /** Multiplayer: the player driving this body is up in the command view, so it leads nobody. */
  aloft?: boolean;
  /** Multiplayer: which player is driving this body (0 for nobody), and where the server last said it was. */
  pilot: number; nx: number; nz: number;
  /** The vent a worker carries Flux from, and the Flux it is carrying (src/core/econ.ts). */
  vent?: Vent | null; fluxing?: number;
  /** Up in the air (src/core/air.ts), and how high it flies now. */ air?: boolean; alt?: number;
  /** Energy for abilities (src/core/ability.ts), seconds left on each ability's cooldown, and the cast it is winding up. */
  energy?: number; maxEnergy?: number; abCd?: Record<string, number>; cast?: { key: string; t: number; x: number; z: number; id: number } | null;
  /** What is on it now (src/core/status.ts): slowed, stunned, unseen and the rest. */ status?: Status[];
  /** The transport or building it rides in, and what it carries (src/core/cargo.ts). */ inside?: Unit | Building | null; cargo?: Unit[];
  /** The carrier it is walking to get into (g.board). */ boarding?: Unit | Building | null;
  /** Abilities the player switched off casting by themselves, by key (the command card's right click). */ autoOff?: Record<string, boolean>;
}
/** One effect on a body: its key, seconds left, a strength (a slow's fraction, a shield's points, burning's damage a second) and who put it there. */
export interface Status { k: StatusKey; t: number; n?: number; from?: number }
export type StatusKey = 'slow' | 'stun' | 'root' | 'unseen' | 'revealed' | 'dug' | 'lifted' | 'shielded' | 'burning' | 'borrowed' | 'blind';
export interface Building {
  id: number; kind: BKind; team: number; pos: THREE.Vector3; hx: number; hz: number; h: number; hp: number; maxHp: number; obj: THREE.Group; holo: THREE.Group | null;
  built: boolean; progress: number; /** progress already paid out as health, so damage to a site sticks */ pdone: number; queue: { kind: Kind; t: number }[]; alive: boolean; cd: number; builder: Unit | null; lastHit: number; rot: boolean; smokeT: number; stage: number;
  /** A Mother Cap's ripe Buds, and how far the next one has grown. */
  buds?: number; budT?: number;
  /** Bodies sheltering inside (src/core/cargo.ts), and whether it has lifted off to fly (src/core/air.ts). */ cargo?: Unit[]; air?: boolean; alt?: number;
}
/** A piece of map scenery that can be shot, blown up or drilled apart. */
export interface Prop {
  id: number; kind: 'rock' | 'mesa' | 'metal' | 'barrel' | 'plant' | 'crystal' | 'veyl'; name: string; x: number; z: number; r: number; y0: number; h: number;
  hp: number; maxHp: number; alive: boolean; solid: boolean; stage: number; stages: number;
  ranges: { attr: THREE.BufferAttribute; start: number; count: number }[]; obj?: THREE.Object3D; owner?: Prop; link: Prop[];
  /** Litter on the ground: scrub, stones, scrap. A new building flattens whatever of it is underfoot. */
  dress?: boolean;
}
export interface OreNode { pos: THREE.Vector3; amount: number; max: number; obj: THREE.Group; /** Seconds the seam has been empty. */ dryT?: number; /** A bright seam: each load from it holds this much more (terrain.ts). */ rich?: number }
export interface Callout { who: string; text: string; t: number; dur: number; keys: [string, string][] }
export interface Difficulty { name: string; enemy: number; raid: number; blurb: string }
export const DIFFS: Difficulty[] = [
  { name: 'Day shift', enemy: .75, raid: 1.25, blurb: 'Smaller raids, more time' },
  { name: 'Night shift', enemy: 1, raid: 1, blurb: 'The intended fight' },
  { name: 'Double shift', enemy: 1.15, raid: .9, blurb: 'Bigger raids, sooner' },
];

// The maps live in src/maps.ts; they are passed on from here so everything can keep importing them from data.
export { GATE, MAP, MAPS, NORTH_PATH, OUTPOST, RALLY, RALLY_N, ROAD, SIZES, TURNS, VAST, VHOME, VRALLY, VRALLY_N, baseOf, compass, mapCode, roadPt, rollMap, setMap, sizeOf, turnOf, validMap, veylPt } from './maps';
export type { MapDef } from './maps';
import { VHOME, MAP as MAP_, layoutSites } from './maps';
import { MATCH, multi, startOf, enemiesOf, planTeams, setMatch, clearMatch, type TeamPlan } from './core/sides';
/** Story state the engine reads while a campaign job is running. Set before a Game is made, cleared for everything else. */
export const STORY = {
  /** The Ironhold team that is Charter Security on this job (they wear company grey), or -1. */
  charter: -1,
  /** Ore banked across every finished campaign job, for the Quartermaster's last line. */
  oreTotal: 0,  /** A story job is being set up or played. Its map keeps the ore fields the job was written round. */
  on: false,
};
/** How the ore fields are laid out. `fair` is on for any match two economies fight that is not a story job: the fields then come in pairs, one
 *  for each end, the same walk from each home building, and each end's home seams and first field are the other's turned round. A Game sets it
 *  for itself (see Game.pin). */
export const LAYOUT = { fair: false };
/** How many more bodies a Cantor's sweep cuts into (at half damage) beside its target. */
export const CLEAVE = { n: 2 };
/** How far out a Choir Stone takes ore from a Tender's sling, in metres, on top of the reach every home building has (see Game.bankReach).
 *  A dial for balance tables, left at 0. A Choir Stone is thinner than a Headframe, so a Tender walks about 4 m further each way than a Rigger and
 *  the Veyl bot mines about a fifth less. At 5 the bots' Ironhold v Veyl table went from 49-11 to 28-32, and Veyl v Gloam from 34-23 to 60-0. */
export const CHOIR_REACH = { m: 0 };
/** Overtime, a dial that is off (`start` 0). Two even sides can hold each other off for good: each push dies to the defenders and their towers
 *  before it breaks anything. With `start` set to a number of seconds, from then on in a match two economies fight (not a story job) every
 *  building takes `perMin` more damage for each minute that has passed and every tower does that much less to a body. In bot tables it cut
 *  the matches still undecided at 40 minutes from 10 in 80 to 5 in 80 at 18 minutes and .1, which is not enough to switch it on untested by people. */
export const OVERTIME = { start: 0, perMin: .1 };

export const isUnit = (t: any): t is Unit => !!t && t.rig !== undefined;
export const isSoldier = (u: Unit) => u.kind === 'linesman' || u.kind === 'breacher' || u.kind === 'gantry' || u.kind === 'longshot' || u.kind === 'patch';
/** A fighting body on either side: anything that is not a worker. */
export const isFighter = (u: Unit) => !isWorker(u.kind) && !UNIT[u.kind]?.ward;
