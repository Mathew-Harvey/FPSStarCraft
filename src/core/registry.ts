// The content registry. Shared code (game.ts, director.ts, stance.ts, hitfx.ts) asks here what a kind of body or building does, instead of
// testing its name. Each faction fills it from src/factions/<faction>/rules.ts (what bodies and buildings do) and look/ (how they are drawn).
// A kind with no entry still works: it walks, fights with the generic soldier brain and gun, and dies, using the defaults in game.ts.
import type * as THREE from 'three';
import type { Game } from '../game';
import type { Director, Side } from '../director';
import type { Unit, Building, OreNode, Prop } from '../data';

/** A ray hit, as Game.ray returns it. */
export type Hit = { unit?: Unit; b?: Building; ore?: OreNode; prop?: Prop; dist: number; head?: boolean };
/** A first-person gun: magazine, seconds between shots, seconds to reload. */
export interface Weapon { name: string; mag: number; cd: number; reload: number }
/** Tuning for an aimed, single-bullet gun: view model, damage to body, head and building, spread, aim-down-sights pull and zoom. */
export interface Shot { vm: string; body: number; head: number; bld: number; sp: number; adsK: number; zoom: number; sens: number; kick: number }
/** A light a body carries: its height, how far ahead of the body it sits, its reach, colour and strength. */
export type BodyLamp = [number, number, number, [number, number, number], number];

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
  /** Speed multiplier from research and ground, on top of UnitDef.speed. */
  pace?(g: Game, u: Unit): number;
  /** The first-person gun, if this body has one. */
  gun?: Weapon;
  /** Tuning when the gun fires single aimed bullets. */
  shot?: Shot;
  /** The lamp this body carries at night. */
  lamp?: BodyLamp;
  /** Extra pose on top of the shared walk cycle (arms, halo, breathing). `s` is the leg swing, `ease` the blend this frame. */
  pose?(g: Game, u: Unit, dt: number, s: number, ease: number): void;
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
  /** Lamps hung on the building, in its own space: x, y, z and reach. */
  lamps?: [number, number, number, number][];
}

/** What a whole faction does that is not tied to one kind. */
export interface FactionRules {
  /** The bot brain for a side of this faction: economy, building, research and squad plans. */
  brain?(D: Director, dt: number, S: Side): void;
  /** The brain for a body of this faction with no `ai` hook of its own. */
  ai?(g: Game, u: Unit, dt: number): void;
  /** The first-person controls for a body of this faction with no `drive` hook of its own. */
  drive?(g: Game, dt: number, P: Set<string>, eye: THREE.Vector3, dir: THREE.Vector3, look: Hit | null, gun: Weapon | null): void;
  /** Every frame, host and replica: the faction's own systems (Bloom, Buds). */
  fx?(g: Game, dt: number): void;
  /** Every frame for each finished building of this faction (host only), before its kind's tick. */
  tick?(g: Game, b: Building, dt: number): void;
  /** A building of this faction was just put down. */
  added?(g: Game, b: Building, built: boolean): void;
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
