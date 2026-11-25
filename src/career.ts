// What the game keeps between skirmishes (fun audit, stage 2): what the player did in a match, their best matches, the challenges they have
// met, and the match variants. Before this the only things saved were story progress and options, and the end screen said nothing about the
// player's own part. Everything here is for skirmishes against bots; story jobs and online matches do not count.
import type { Game } from './game';
import { OVERTIME, baseOf, fac } from './data';

/** The player's own part in one match. Counted by the Game as it runs. */
export interface Tally { /** Enemy bodies the player dropped with their own hands. */ kills: number; /** Health and shield their own hits took off. */ dealt: number; /** The same for their whole side, where it is known (not on a seat of a hidden local host). */ side: number;
  /** Longest run of kills, each within 4 seconds of the last. */ streak: number; /** Bodies lost while driving them. */ deaths: number; /** Their side's finished buildings that fell. */ bLost: number; /** Seconds in a body, and up in the command view. */ bodyT: number; aboveT: number }
export const newTally = (): Tally => ({ kills: 0, dealt: 0, side: 0, streak: 0, deaths: 0, bLost: 0, bodyT: 0, aboveT: 0 });

/** Match variants, picked on the skirmish screen. */
export const VARIANTS: { id: string; name: string; note: string }[] = [
  { id: 'hid', name: 'Hidden start', note: 'You are not told where they are' },
  { id: 'short', name: 'Short shift', note: 'Overtime from minute 8, points at minute 20' },
  { id: 'noqm', name: 'No Quartermaster', note: 'You run the yard yourself' },
  { id: 'rich', name: 'Double ore', note: 'Every load banks twice. No records' },
  { id: 'seam', name: 'Rich seam', note: 'Every 4 minutes, a seam to fight over' },
];
/** The variants in force. The menu sets them before it makes a skirmish and clears them for everything else; no test or table tool sets them. */
export const RULES = { short: false, noqm: false, rich: false, seam: false };
/** Overtime as it is normally, and in a short shift. */
const OT = { start: OVERTIME.start, limit: OVERTIME.limit }, SHORT = { start: 480, limit: 1200 };
export function setRules(vars: string[]) { RULES.short = vars.includes('short'); RULES.noqm = vars.includes('noqm'); RULES.rich = vars.includes('rich'); RULES.seam = vars.includes('seam'); Object.assign(OVERTIME, RULES.short ? SHORT : OT); }
/** The skirmish being played, set by the menu when it starts one against bots and cleared for everything else. */
export interface Ctx { side: number; foe: number; map: number; diff: number; vars: string[] }
export const CAREER: { ctx: Ctx | null } = { ctx: null };

export interface Challenge { id: string; side: number; name: string; text: string; test: (g: Game, t: Tally, c: Ctx) => boolean }
const SIDES = ['Ironhold', 'Veyl', 'Gloam'], inBody = (t: Tally) => t.bodyT / Math.max(1, t.bodyT + t.aboveT);
const TEN: [string, string, string, Challenge['test']][] = [
  ['win', 'On the payroll', 'Win a skirmish', () => true],
  ['night', 'Night shift', 'Win on Night shift or harder', (_g, _t, c) => c.diff >= 1],
  ['double', 'Double shift', 'Win on Double shift', (_g, _t, c) => c.diff >= 2],
  ['clean', 'Not a scratch', 'Win without losing a finished building', (_g, t) => t.bLost === 0],
  ['quick', 'Early finish', 'Win in under 15 minutes', g => g.time < 900],
  ['streak', 'Overtime', 'Drop five enemies in one streak', (_g, t) => t.streak >= 5],
  ['hands', 'Hands on', 'Drop 40 enemies yourself in one match', (_g, t) => t.kills >= 40],
  ['boots', 'Boots on the ground', 'Win having spent four fifths of the match in a body', (_g, t) => inBody(t) >= .8],
  ['desk', 'Desk job', 'Win having spent four fifths of the match in the command view', (_g, t) => inBody(t) <= .2],
  ['careful', 'Careful', 'Win having lost no more than two bodies you were driving', (_g, t) => t.deaths <= 2],
];
/** Ten for each side: the same ten tests, earned once as each side. All of them need a win. */
export const CHALLENGES: Challenge[] = [0, 1, 2].flatMap(side => TEN.map(([k, name, text, test]) => ({ id: `${side}:${k}`, side, name, text: `${text} as ${side === 2 ? 'the Gloam' : side === 1 ? 'the Veyl' : 'Ironhold'}`, test })));

/** What is kept: bests by key, and the ids of the challenges met. */
export interface Kept { best: Record<string, number>; done: string[] }
const KEY = 'ore-else-career';
export function loadCareer(): Kept { try { const o = JSON.parse(localStorage.getItem(KEY) || '{}'); return { best: o && typeof o.best === 'object' && o.best ? o.best : {}, done: Array.isArray(o?.done) ? o.done.filter((x: any) => typeof x === 'string') : [] }; } catch (e) { return { best: {}, done: [] }; } }
const store = (k: Kept) => { try { localStorage.setItem(KEY, JSON.stringify(k)); } catch (e) { /* storage is optional */ } };

/** One number on the player's row of the end screen. */
export interface YouStat { n: string; label: string; /** A new best: the end screen stamps it. */ fresh?: boolean; /** The best before this match, as text. */ was?: string }
export interface Closed { you: YouStat[]; earned: Challenge[]; done: number; of: number }
const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
/** Closes a match: the player's row for the end screen and, in a skirmish against bots (`c` set), new bests and challenges, which are saved.
 *  Bests: most enemies dropped by hand and longest streak in any match, and for wins the fastest by side, map and shift and the fewest bodies lost by side. */
export function closeMatch(g: Game, c: Ctx | null, kept: Kept = loadCareer()): Closed {
  const t = g.tally, counts = !!c && !c.vars.includes('rich'), won = g.won;
  const up = (key: string, v: number, lower: boolean, fmt: (n: number) => string): Pick<YouStat, 'fresh' | 'was'> => { if (!counts) return {}; const old = kept.best[key]; if (old === undefined || (lower ? v < old : v > old)) { kept.best[key] = v; return { fresh: v > 0 || lower, was: old === undefined ? undefined : fmt(old) }; } return { was: fmt(old) }; };
  const share = t.side > 0 ? ` (${Math.round(100 * Math.min(1, t.dealt / t.side))}%)` : '', total = t.bodyT + t.aboveT;
  const you: YouStat[] = [
    { n: String(t.kills), label: 'You dropped', ...up('kills', t.kills, false, String) },
    { n: `${Math.round(t.dealt)}${share}`, label: t.side > 0 ? 'Your damage (share of your side\'s)' : 'Your damage' },
    { n: String(t.streak), label: 'Best streak', ...up('streak', t.streak, false, String) },
    { n: String(t.deaths), label: 'Bodies lost under you', ...(won && c ? up(`few:${c.side}`, t.deaths, true, String) : {}) },
    { n: total > 0 ? `${Math.round(100 * t.bodyT / total)}%` : '0%', label: 'Time in a body' },
  ];
  if (won && c) you.push({ n: clock(g.time), label: 'Win time', ...up(`fast:${c.side}:${baseOf(c.map)}:${c.diff}`, Math.round(g.time), true, clock) });
  const earned: Challenge[] = [];
  if (won && c && counts) for (const ch of CHALLENGES) if (ch.side === c.side && !kept.done.includes(ch.id) && ch.test(g, t, c)) { kept.done.push(ch.id); earned.push(ch); }
  if (counts) store(kept);
  return { you, earned, done: kept.done.length, of: CHALLENGES.length };
}
export const sideName = (s: number) => SIDES[fac(s)];
