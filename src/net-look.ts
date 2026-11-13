// Looks on the wire. Some building parts move only to show what the rules are doing: a Flak Tower's gun turning toward what it shoots,
// a building crawling on skids. The rules keep that state where they run (the host, or the match server), so a player's screen, a
// watcher's and a replay's would never see it. A faction names each such number here, with how to read it on the host and how to set it
// on a screen, and the snapshot carries them (src/netgame.ts, index LOOK of a building row). Nothing here changes the match.
// A wind-up and a cast going off travel on their own (u.cast in the body's extra row, and the 'ab' event; see AbilityDef.show).
import type { Game } from './game';
import type { Building, Unit } from './data';

export interface BuildingLook {
  /** A short unique name. Looks are sent in name order, so a server and a page agree whatever order their files load in. */
  key: string;
  /** On the host: the number to send for this building, 0 for nothing (a body's id, a 1 for on, ...). */
  get(g: Game, b: Building): number;
  /** On a screen: the number as sent. 0 means nothing; called every snapshot for every building, so make 0 cheap. */
  set(g: Game, b: Building, v: number): void;
}
const LOOKS = new Map<string, BuildingLook>(); let order: BuildingLook[] | null = null;
export function defineBuildingLook(l: BuildingLook) { LOOKS.set(l.key, l); order = null; }
const list = () => order || (order = [...LOOKS.values()].sort((a, b) => (a.key < b.key ? -1 : 1)));
/** A building's looks for its snapshot row: 0 when every one is 0, which is nearly always. */
export function packLook(g: Game, b: Building): number[] | 0 {
  const L = list(); let any = false; const r = L.map(l => { const v = l.get(g, b) || 0; if (v) any = true; return v; }); return any ? r : 0;
}
export function applyLook(g: Game, b: Building, r: unknown) {
  const L = list(), a = Array.isArray(r) ? r : null; for (let i = 0; i < L.length; i++) { const v = a ? +a[i] || 0 : 0; try { L[i].set(g, b, v); } catch (e) { /* a look never stops the game */ } }
}
// ---------------------------------------------------------------- bodies
// The same for bodies: a few numbers kept by the rules that only change how a body looks (a mine's way of going off, how long a cloak
// has left). Sent with the body's extra row while it lives, and once more with its death, read after the rules are done with it, so a
// screen can show how it died (a blast, or a fizzle).
export interface UnitLook { key: string; get(g: Game, u: Unit): number; set(g: Game, u: Unit, v: number): void }
const ULOOKS = new Map<string, UnitLook>(); let uorder: UnitLook[] | null = null;
export function defineUnitLook(l: UnitLook) { ULOOKS.set(l.key, l); uorder = null; }
const ulist = () => uorder || (uorder = [...ULOOKS.values()].sort((a, b) => (a.key < b.key ? -1 : 1)));
export function packUnitLook(g: Game, u: Unit): number[] | 0 {
  const L = ulist(); let any = false; const r = L.map(l => { let v = 0; try { v = +l.get(g, u) || 0; } catch (e) { /* none */ } if (v) any = true; return v; }); return any ? r : 0;
}
export function applyUnitLook(g: Game, u: Unit, r: unknown) {
  const L = ulist(), a = Array.isArray(r) ? r : null; for (let i = 0; i < L.length; i++) { const v = a ? +a[i] || 0 : 0; try { L[i].set(g, u, v); } catch (e) { /* a look never stops the game */ } }
}
/** Each death event and the body it is about (game.ts killUnit), so the line out can add the body's looks when it sends the event. */
export const DEATHS = new WeakMap<any[], Unit>();

// A building lifted off to fly (src/core/air.ts): every screen eases it up and down itself, once it knows.
defineBuildingLook({ key: 'air', get: (_g, b) => (b.air ? 1 : 0), set(_g, b, v) { b.air = !!v; } });
