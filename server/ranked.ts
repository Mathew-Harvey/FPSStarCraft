// Ranked play on the match server: who is rated what, the queue that pairs players of about the same rating, and the seasons.
// Everything lives in one JSON file (RANK_FILE), or only in memory when that is unset. Nothing outside the server is used.
// A player is known by name. The first ranked match under a name gives the browser a key for it, and a name with a key is only
// played under with that key, so nobody can lose games on somebody else's rating.
import { readFileSync, writeFileSync, renameSync, existsSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { createHash, randomBytes } from 'node:crypto';
import { Rating, START, rate, rest, carry, seasonOf, seasonEnds, PROVISIONAL } from '../src/rating';

export interface Ranked extends Rating { name: string; keyHash: string; games: number; wins: number; /** Last ranked game, ms. */ last: number; /** Highest rating this season. */ peak: number }
export interface Row { place: number; name: string; rating: number; rd: number; games: number; wins: number; provisional: boolean }
export interface Past { season: number; top: Row[] }
interface File { v: 1; season: number; players: Record<string, Ranked>; past: Past[] }

const hash = (k: string) => createHash('sha256').update('ore-else-rank:' + k).digest('hex').slice(0, 32);
const low = (n: string) => n.toLowerCase();
const shown = (p: Ranked) => Math.round(p.r);

export class RankStore {
  data: File;
  constructor(public file = '', public now: () => number = Date.now) {
    this.data = { v: 1, season: seasonOf(this.now()), players: {}, past: [] };
    if (file && existsSync(file)) { try { const d = JSON.parse(readFileSync(file, 'utf8')); if (d && d.v === 1 && d.players) this.data = d; } catch (e) { console.error('could not read the ranked file, starting empty', e); } }
    this.roll();
  }
  save() {
    if (!this.file) return;
    try { mkdirSync(dirname(this.file), { recursive: true }); const tmp = this.file + '.tmp'; writeFileSync(tmp, JSON.stringify(this.data)); renameSync(tmp, this.file); } catch (e) { console.error('could not save the ranked file', e); }
  }
  get season() { return this.data.season; }
  /** A new season has started since the last look: keep the old season's top 100, and carry every rating over (see carry). */
  roll() {
    const s = seasonOf(this.now()); if (s <= this.data.season) return false;
    this.data.past.push({ season: this.data.season, top: this.board(100) }); while (this.data.past.length > 20) this.data.past.shift();
    for (const p of Object.values(this.data.players)) { Object.assign(p, carry(p)); p.games = 0; p.wins = 0; p.peak = p.r; }
    this.data.season = s; this.save(); return true;
  }
  get(name: string): Ranked | null { return this.data.players[low(name)] || null; }
  /** Checks that `key` is the key for `name`. A name nobody has played ranked under is free: it is given a new key (returned as `key`). */
  claim(name: string, key: string): { ok: boolean; key?: string } {
    const p = this.get(name);
    if (!p) { const k = key && /^[a-f0-9]{24,64}$/.test(key) ? key : randomBytes(16).toString('hex'); return { ok: true, key: k }; }
    return { ok: !!key && hash(key) === p.keyHash };
  }
  /** The rating a player would play at now: their own (with rd grown for time away), or a new player's. */
  rating(name: string): Rating { const p = this.get(name); return p ? rest(p, (this.now() - p.last) / 864e5) : START; }
  private make(name: string, key: string): Ranked { const p: Ranked = { ...START, name, keyHash: hash(key), games: 0, wins: 0, last: this.now(), peak: START.r }; this.data.players[low(name)] = p; return p; }
  /** Rates one finished game. `keys` are the keys the two players queued with (a new player's record is made with theirs). */
  result(win: string, lose: string, keys: Record<string, string>) {
    this.roll();
    const a0 = this.rating(win), b0 = this.rating(lose), a1 = rate(a0, b0, 1), b1 = rate(b0, a0, 0), t = this.now();
    const A = this.get(win) || this.make(win, keys[win] || ''), B = this.get(lose) || this.make(lose, keys[lose] || '');
    const out: Record<string, { before: number; after: number; delta: number; provisional: boolean }> = {};
    for (const [p, before, after, won] of [[A, a0, a1, 1], [B, b0, b1, 0]] as [Ranked, Rating, Rating, number][]) {
      const was = p.games ? shown(p) : Math.round(before.r);
      Object.assign(p, after); p.games++; p.wins += won; p.last = t; p.peak = Math.max(p.peak, p.r);
      out[p.name] = { before: was, after: shown(p), delta: shown(p) - was, provisional: p.rd > PROVISIONAL };
    }
    this.save(); return out;
  }
  /** The leaderboard: settled ratings first, highest first, then the provisional ones. */
  board(n = 100): Row[] {
    const all = Object.values(this.data.players).filter(p => p.games > 0).map(p => ({ p, rd: rest(p, (this.now() - p.last) / 864e5).rd }));
    all.sort((x, y) => (+(x.rd > PROVISIONAL) - +(y.rd > PROVISIONAL)) || y.p.r - x.p.r || x.p.name.localeCompare(y.p.name));
    return all.slice(0, n).map(({ p, rd }, i) => ({ place: i + 1, name: p.name, rating: shown(p), rd: Math.round(rd), games: p.games, wins: p.wins, provisional: rd > PROVISIONAL }));
  }
  /** One player's line for the ranked panel. */
  me(name: string) { const p = this.get(name); if (!p) return null; const row = this.board(1e9).find(r => r.name === p.name); return row || { place: 0, name: p.name, rating: shown(p), rd: Math.round(p.rd), games: p.games, wins: p.wins, provisional: true }; }
  info() { return { season: this.season, ends: new Date(seasonEnds(this.season)).toISOString() }; }
}

// ---------------------------------------------------------------- the queue
/** Someone waiting for a ranked match. `fac` is the faction they asked to play (0 Ironhold, 1 Veyl, 2 Gloam). */
export interface Waiting<T> { who: T; name: string; key: string; r: number; fac: number; since: number }
/** How far apart two ratings may be for a pair: 100 at first, widening by 50 every ten seconds of waiting, to 600. */
export const reach = (waited: number) => Math.min(600, 100 + 50 * Math.floor(waited / 10000));
export class Queue<T> {
  list: Waiting<T>[] = [];
  add(w: Waiting<T>) { this.drop(w.who); this.list.push(w); }
  drop(who: T) { const n = this.list.length; this.list = this.list.filter(w => w.who !== who); return n !== this.list.length; }
  has(who: T) { return this.list.some(w => w.who === who); }
  /** The pairs to start now: closest ratings first, each pair within what both players' waits allow. Two names never meet themselves. */
  pairs(now: number): [Waiting<T>, Waiting<T>][] {
    const c: [number, Waiting<T>, Waiting<T>][] = [];
    for (let i = 0; i < this.list.length; i++) for (let j = i + 1; j < this.list.length; j++) {
      const a = this.list[i], b = this.list[j], d = Math.abs(a.r - b.r);
      if (low(a.name) !== low(b.name) && d <= Math.min(reach(now - a.since), reach(now - b.since))) c.push([d, a, b]);
    }
    c.sort((x, y) => x[0] - y[0] || Math.min(x[1].since, x[2].since) - Math.min(y[1].since, y[2].since));
    const used = new Set<Waiting<T>>(), out: [Waiting<T>, Waiting<T>][] = [];
    for (const [, a, b] of c) if (!used.has(a) && !used.has(b)) { used.add(a); used.add(b); out.push([a, b]); }
    this.list = this.list.filter(w => !used.has(w)); return out;
  }
}
/** The maps ranked matches are played on: the three one-on-one maps on the multiplayer menu, at their usual size. */
export const RANKED_MAPS = [0, 1, 2];
