// The content registry. Shared code (game.ts, director.ts, stance.ts, hitfx.ts) asks here what a kind of body or building does, instead of
// testing its name. Each faction fills it from src/factions/<faction>/rules.ts (what bodies and buildings do) and look/ (how they are drawn).
// A kind with no entry still works: it walks, fights with the generic soldier brain and gun, and dies, using the defaults in game.ts.
import type * as THREE from 'three';
import type { Game } from '../game';
import type { Director, Side } from '../director';
import type { Unit, Building, OreNode, Prop, Kind } from '../data';
import type { Model } from '../models';

/** A ray hit, as Game.ray returns it. */
export type Hit = { unit?: Unit; b?: Building; ore?: OreNode; prop?: Prop; dist: number; head?: boolean };
/** A first-person gun: magazine, seconds between shots, seconds to reload. */
export interface Weapon { name: string; mag: number; cd: number; reload: number }
/** Tuning for an aimed, single-bullet gun: view model, damage to body, head and building, spread, aim-down-sights pull and zoom. */
export interface Shot { vm: string; body: number; head: number; bld: number; sp: number; adsK: number; zoom: number; sens: number; kick: number }
/** Poses a first-person view model: `k` how far it is pulled up to the eye, `kick` its recoil, `dip` how far it drops. */
export type VmPose = (m: THREE.Group, k: number, kick: number, dip: number) => void;
/** A light a body carries: its height, how far ahead of the body it sits, its reach, colour and strength. */
export type BodyLamp = [number, number, number, [number, number, number], number];

/** How a body of this kind stands about and falls over (src/stance.ts and src/hitfx.ts). All of it is for show. */
export interface StanceLook {
  /** Which rest pose the body takes once it has stood about: 0 stays up, 1 sits, 2 squats. `h` is a steady random number 0 to 1 for this body. */
  rest?(h: number): number;
  /** It carries a tool in the right hand (the Rigger's drill): its arms hang, sit and fall differently. */
  tool?: boolean;
  /** How it squats: leg spread, knee bend, forward lean, arm lift, how far the hips slide back (0 to 1), and whether a shield arm drops. */
  squat?: { sp: number; fw: number; lean: number; arms: number; slide: number; shield: boolean };
  /** A machine on legs: idles with its engine ticking and falls like a walker. */
  idleTick?: boolean;
  /** A big beast: breathes this slowly (default 2.6), falls heavily and leaves a big splat. */
  breath?: number; bulk?: boolean;
  /** It always bursts when it dies. */
  burst?: boolean;
}

/** What a kind of body does. Every hook is optional. */
export interface UnitRules {
  /** A bot drives this body. Without it the side's faction default runs (see FactionRules.ai), else the generic soldier brain. */
  ai?(g: Game, u: Unit, dt: number): void;
  /** A player drives this body in first person: fire, alt fire and the use keys. `look` is what the crosshair is on. */
  drive?(g: Game, dt: number, P: Set<string>, eye: THREE.Vector3, dir: THREE.Vector3, look: Hit | null, gun: Weapon | null): void;
  /** A hit is about to land on this body (host only). Returns the damage left after this kind's own defence (a front shield, say). */
  hurt?(g: Game, u: Unit, amt: number, from: Unit | Building | null): number;
  /** The body is about to be marked dead (host and replica). */
  dying?(g: Game, u: Unit, from: Unit | Building | null): void;
  /** A body of the far side died. Returns true when the kind said its own line, so nobody else barks. `v` is how loud it was where the player stands. */
  downed?(g: Game, u: Unit, v: number): boolean;
  /** Words over the body when it dies (default KO!). */
  koWord?: string;
  /** Seconds the game holds still when the player kills this kind, and when the player kills anything while driving this kind. */
  koStop?: number; killStop?: number;
  /** Hits from a player do not shove this body back or break its stride. */
  steady?: boolean;
  /** How hard this body's hits shove a target back when a player drives it (default from the damage). */
  shove?: number;
  /** A big body: shrugs off blasts and shoves, pushes smaller bodies aside, keeps a wider place in a march, and a player is never respawned into it. */
  heavy?: boolean;
  /** A player is never respawned into this body (it is too slow or too precious to hand out). */
  skipRespawn?: boolean;
  /** Holding aim raises a front shield (see the `hurt` hook). */
  brace?: boolean;
  /** Footsteps in first person: 0 soft, 1 boots (default), 2 a walker that shakes the camera. */
  step?: number;
  /** Speed of the first-person dash, metres a second (default 19). */
  hop?: number;
  /** Walk cycle speed (default the faction's, else 11), and how much bigger than its model the body is drawn. */
  stride?: number; scale?: number;
  /** How much the bots want to shoot this body, against 1 for an ordinary one. */
  threat?: number;
  /** Two bodies hatch for the listed cost (the Gloam's Snappers). */
  pair?: boolean;
  /** The first-person gun, if this body has one. */
  gun?: Weapon;
  /** Tuning when the gun fires single aimed bullets. */
  shot?: Shot;
  /** Builds this body's model. Without it the body uses its art in models.ts, or a plain stand-in when it has none. */
  figure?(): Model;
  /** How it stands about and falls over. */
  stance?: StanceLook;
  /** The lamp this body carries at night. */
  lamp?: BodyLamp;
  /** Extra pose on top of the shared walk cycle (arms, halo, breathing). `s` is the leg swing, `ease` the blend this frame and `sc` the
   *  body's drawn scale. On a two-legged body, returning true means the hook posed the arms itself and the shared arm swing is skipped. */
  pose?(g: Game, u: Unit, dt: number, s: number, ease: number, sc: number): boolean | void;
  /** Poses the first-person view model each frame. `rl` is how far through a reload the gun is, 0 to 1 and back. */
  view?(g: Game, pose: VmPose, rl: number, gun: Weapon | null): void;
  /** One line for the Tab list: what a body of this kind is doing. */
  task?(g: Game, u: Unit): string | null;
}

/** What a kind of building does. Every hook is optional. */
export interface BldRules {
  /** Builds the model. Without it the building is a plain box. */
  model?(anim: ((t: number) => void)[]): THREE.Group;
  /** Runs every frame while the building stands and is finished (host only): towers fire, home buildings heal. */
  tick?(g: Game, b: Building, dt: number): void;
  /** The building was just put down (finished or not). */
  added?(g: Game, b: Building, built: boolean): void;
  /** Building work just finished. */
  done?(g: Game, b: Building): void;
  /** Runs this building's training queue its own way (a Mother Cap ripens every Bud at once). Without it the queue trains one at a time. */
  hatch?(g: Game, b: Building, dt: number): void;
  /** New bodies walk out of the long side instead of the front. */
  sideDoor?: boolean;
  /** Trains from ripe Buds instead of a queue of five (see `hatch`). */
  buds?: boolean;
  /** A line for the building's prompt in first person, in place of the queue count. */
  note?(b: Building): string;
  /** Shields its side's other buildings within this many metres: they take 70% of each hit. */
  ward?: number;
  /** Its side's hurt bodies within 16 m heal 5 a second once out of a fight. */
  mends?: boolean;
  /** Lamps hung on the building, in its own space: x, y, z and reach. */
  lamps?: [number, number, number, number][];
}

/** What a whole faction does that is not tied to one kind. */
export interface FactionRules {
  /** The bot brain for a side of this faction: economy, building, research and squad plans. */
  brain?(D: Director, dt: number, S: Side): void;
  /** The free raid factory for the far side of the classic match, which runs no economy (Ironhold at home against the Veyl, nobody playing them). */
  classic?(D: Director, dt: number): void;
  /** Timed hints at the start of a match: seconds, who says it, the line. */
  hints?: [number, string, string][];
  /** The squad's three playbooks (a push down the road, a flank, and all in). */
  books?: { name: string; steps: string[]; go: string; label: string }[];
  /** Idle chatter, given the faction at the other end. */
  chatter?(foe: number): string[];
  /** What a body says on a kill or when a friend goes down, given the faction at the other end. */
  lines?(kind: 'kill' | 'down', foe: number): string[];
  /** A body of this faction came out of training (the first of a kind gets a line). */
  trained?(D: Director, u: Unit): void;
  /** A building of this faction finished. */
  built?(D: Director, b: Building): void;
  /** A building of this faction fell; `left` is how many of that kind the side still has. */
  lost?(D: Director, b: Building, left: number): void;
  /** The brain for a body of this faction with no `ai` hook of its own. */
  ai?(g: Game, u: Unit, dt: number): void;
  /** The first-person controls for a body of this faction with no `drive` hook of its own. */
  drive?(g: Game, dt: number, P: Set<string>, eye: THREE.Vector3, dir: THREE.Vector3, look: Hit | null, gun: Weapon | null): void;
  /** Every frame, host and replica: the faction's own systems (Bloom, Buds). */
  fx?(g: Game, dt: number): void;
  /** Every frame for each standing building of this faction, finished or not (host only), before anything else it does. */
  each?(g: Game, b: Building, dt: number): void;
  /** A building of this faction was just put down. */
  added?(g: Game, b: Building, built: boolean): void;
  /** Speed multiplier from research and ground for a body of this faction, on top of UnitDef.speed. */
  pace?(g: Game, u: Unit): number;
  /** Walk cycle speed for this faction's bodies (default 11). */
  stride?: number;
  /** Poses the first-person view model each frame. `rl` is how far through a reload the gun is, 0 to 1 and back. */
  view?(g: Game, pose: VmPose, rl: number, gun: Weapon | null): void;
  /** The kinds listed in the Tab list, in order. */
  tab?: Kind[];
  /** One line for the Tab list: what a body of this faction is doing (default: the squad's task). */
  task?(g: Game, u: Unit): string | null;
}

const UNITS: Record<string, UnitRules> = {}, BLDS: Record<string, BldRules> = {}, FACTIONS: Record<number, FactionRules> = {};
const NONE_U: UnitRules = Object.freeze({}) as UnitRules, NONE_B: BldRules = Object.freeze({}) as BldRules, NONE_F: FactionRules = Object.freeze({}) as FactionRules;

/** Adds hooks for kinds of body. Hooks given for a kind that already has some are merged in, later ones winning, so a look file and a rules file can each add their own. */
export function defineUnits(map: Record<string, UnitRules>) { for (const k in map) UNITS[k] = { ...UNITS[k], ...map[k] }; }
export function defineBuildings(map: Record<string, BldRules>) { for (const k in map) BLDS[k] = { ...BLDS[k], ...map[k] }; }
export function defineFaction(f: number, rules: FactionRules) { FACTIONS[f] = { ...FACTIONS[f], ...rules }; }
/** The hooks for a kind of body (an empty set when it has none). */
export const unitRule = (k: string): UnitRules => UNITS[k] || NONE_U;
export const bldRule = (k: string): BldRules => BLDS[k] || NONE_B;
export const factionRule = (f: number): FactionRules => FACTIONS[f % 3] || NONE_F;

/** The brain and first-person controls for a body whose kind and faction give none: a plain gun soldier. Set once by the Ironhold rules. */
export const DEFAULTS: { ai?: (g: Game, u: Unit, dt: number) => void; drive?: UnitRules['drive'] } = {};
