// One online match, run the same way on the match server and when a replay is played back.
// The match server keeps the lobbies and the connections; this keeps the game: who drives which body, what each player's input does,
// the ticks, and what each side is sent. Everything that changes the world goes through here, in tick order, and is written down,
// so a replay that feeds the same inputs in at the same ticks ends in the same world.
//
// Same world needs the same dice: the match draws from its own seeded generator (Math.random is swapped for it while the match runs),
// hands out its own body and building ids, and reads the clock once, at the start.
import type { Game } from './game';
import * as GAME from './game';
import { DIFFS, SIDE, FACTION, BLD, UNIT, setMap, setSidesCode, setTeamGame, fac, Unit, isWorker, Kind, BKind } from './data';
import { multi, MATCH, isFriend, type TeamPlan } from './core/sides';
import { usePlan } from './mapcode';
import { reseed } from './gfx';
import { Wire, serverCmd, serverMove } from './netgame';

export const TICK = 1 / 30;
/** Replay file format version. Bump it when the file layout changes. */
export const REPLAY_V = 1;

/** One player in the match. `team` -1 is an observer, who sees both sides and cannot act. */
export interface Seat { id: number; name: string; team: number; unit: Unit | null; inbox: any[] }
export interface Setup { map: number; /** A made map's code (src/mapcode.ts), or '' for the map as it comes. */ plan?: string; diff: number; /** Who holds each end (see setSidesCode). */ out: number; /** A team game or free-for-all (see setTeamGame); unset for a one-on-one. */ mt?: TeamPlan | null; seed: number; /** The clock at the start (Date.now), which sets the weather. */ clock: number; /** Custom-game rules, if the host changed any (see Rules). */ rules?: Rules | null }
/** Custom-game rules a host can set in the lobby: the ore and Flux each side starts with, and how fast the match runs (1 is normal). */
export interface Rules { ore: number; flux: number; speed: number }
export const SPEEDS = [.5, .75, 1, 1.25, 1.5, 2];
export const RULES0: Rules = { ore: 100, flux: 0, speed: 1 };
/** The rules from a lobby message, checked: anything missing or out of range is left as it comes. Null when nothing differs from the usual. */
export function cleanRules(o: any, was: Rules | null = null): Rules | null {
  const r = { ...(was || RULES0) }; if (!o || typeof o !== 'object') return was;
  if (Number.isFinite(o.ore) && o.ore >= 0 && o.ore <= 5000) r.ore = Math.round(o.ore);
  if (Number.isFinite(o.flux) && o.flux >= 0 && o.flux <= 2000) r.flux = Math.round(o.flux);
  if (SPEEDS.includes(o.speed)) r.speed = o.speed;
  return r.ore === RULES0.ore && r.flux === RULES0.flux && r.speed === RULES0.speed ? null : r;
}
/** A recorded match: the setup, who was in it, and every input in tick order. */
export interface Replay {
  v: number; /** The server build the match ran on, so an old file is not played on new rules without a warning. */ build: string; at: string;
  setup: Setup; seats: { id: number; name: string; team: number }[];
  /** ['j', tick, id, name, team] a late join, ['l', tick, id] a leave, ['i', tick, id, me, cmds] a player's input as the server ran it, ['h', tick, hash] a check. */
  log: any[][];
  end?: { tick: number; hash: string; won: boolean | null; time: number; why: 'over' | 'left' | 'stopped' };
}
/** How a match talks to its players. `msg` is an object, or a JSON string already built. */
export type Say = (seat: Seat, msg: any) => void;

/** A small, fast seeded generator (mulberry32). */
export function seeded(seed: number) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

/** A short fingerprint of the world: every body, building, purse, ore field and piece of scenery. Two matches that agree on this are the same. */
export function worldHash(g: Game) {
  let h = 2166136261 >>> 0; const mix = (s: string) => { for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; } };
  const n = (v: number) => (Math.round(v * 1000) / 1000).toString();
  mix(n(g.time));
  for (const u of g.units) if (u.alive) mix(`u${u.id}${u.kind}${u.team}:${n(u.pos.x)},${n(u.pos.z)},${n(u.hp)},${n(u.shield)},${u.pilot}`);
  for (const b of g.buildings) if (b.alive) mix(`b${b.id}${b.kind}${b.team}:${n(b.hp)},${n(b.progress)},${b.queue.length}`);
  for (let t = 0; t < g.purse.length; t++) mix(`p${n(g.purse[t] || 0)}`);
  for (const o of g.ores) mix(`o${n(o.amount)}`);
  for (const p of g.props) mix(p.alive ? n(p.hp) : 'x');
  return (h >>> 0).toString(16).padStart(8, '0');
}

export class Match {
  g!: Game; wire!: Wire; tick = 0; seats: Seat[] = []; rec: Replay;
  /** Sides of players who dropped out, by name, so a player who reconnects comes back on the same side. */
  gone: Record<string, number> = {};
  private rnd: () => number; private nextId = 1; private hp0: number[] = [];
  /** Write a world check into the replay this often, in ticks, so a playback that drifts says where. */
  static CHECK_EVERY = 300;

  constructor(public setup: Setup, seats: Seat[], public say: Say, build = 'dev', private recording = true) {
    warm(setup);
    this.rnd = seeded(setup.seed);
    this.rec = { v: REPLAY_V, build, at: new Date(setup.clock).toISOString(), setup: { ...setup }, seats: seats.filter(s => s.team >= 0).map(s => ({ id: s.id, name: s.name, team: s.team })), log: [] };
    this.run(() => {
      const L = setup, players = seats.filter(s => s.team >= 0), now = Date.now; Date.now = () => L.clock;
      let g: Game; try { g = new GAME.Game(noPipe(), noHud, DIFFS[L.diff], L.map, null, null, players.some(p => p.team !== SIDE.home) || L.out === 2 || multi()); } finally { Date.now = now; }
      // Building the models draws on the dice too, and a process that has built them before (a server on its second match) draws less.
      // From here on the match has dice of its own, so what happens next does not depend on what was built before.
      this.rnd = seeded(L.seed ^ 0x5eed); Math.random = this.rnd;
      this.g = g; g.noRender = true; g.evq = []; g.me = null; g.phase = 'play';
      if (L.rules) for (let t = 0; t < g.purse.length; t++) { g.purse[t] = L.rules.ore; g.fluxPurse[t] = L.rules.flux; } this.wire = new Wire(g); this.hp0 = g.props.map(q => q.hp);
      this.seats = seats; const names: Record<number, string> = {};
      for (const p of players) { names[p.id] = p.name; g.score[p.id] = [0, 0, 0]; g.teams[p.id] = p.team; } g.names = names; this.crew();
      const riggers = g.own(FACTION[SIDE.home].worker, SIDE.home); let ri = 0;
      for (const p of players) { p.inbox = []; p.unit = null; const u = p.team !== SIDE.home ? g.freshBody(p.team) : riggers[ri++ % riggers.length]; if (u) this.pilot(p, u); }
      this.greet(players);
    }, true);
    for (const s of this.seats) this.say(s, this.beginMsg(s));
  }
  /** Runs `fn` inside this match: its map and sides, its dice and its ids. */
  run<T>(fn: () => T, first = false): T {
    const L = this.setup; usePlan(L.plan || null); setMap(L.map); setSidesCode(L.out); setTeamGame(L.mt || null); if (!first) this.g.pin();
    const r = Math.random, ids = (GAME as any).ids as { next: number } | undefined, saved = ids ? ids.next : 0;
    Math.random = this.rnd; if (ids) ids.next = this.nextId;
    // The world's own dice (gfx.ts R and rnd) are one sequence for the whole process. Each match starts them again from its own dice every time it runs.
    reseed(Math.floor(this.rnd() * 2147483647));
    try { return fn(); } finally { Math.random = r; if (ids) { this.nextId = ids.next; ids.next = Math.max(saved, ids.next); } }
  }
  get players() { return this.seats.filter(s => s.team >= 0); }
  private crew() { const g = this.g, P = this.players; g.coop = Math.max(1, P.filter(p => p.team === SIDE.home).length); g.human = g.human.map((_, t) => P.some(p => p.team === t)); }
  beginMsg(s: Seat, ph?: number[][]) { const g = this.g, L = this.setup; return { t: 'begin', plan: L.plan || '', map: L.map, diff: L.diff, unit: s.unit ? s.unit.id : 0, names: g.names, ph, team: s.team, teams: g.teams, eco: g.eco ? 1 : 0, out: L.out, mt: L.mt || null, watch: s.team < 0 ? 1 : 0, speed: L.rules?.speed || 1 }; }

  /** Hands a body back to the AI. */
  release(p: Seat) {
    const g = this.g, u = p.unit; p.unit = null; if (!u || !u.alive) return; u.pilot = 0; u.brace = false; u.moving = false; u.think = 0;
    if (isWorker(u.kind)) { u.state = u.carrying > 0 ? 'toHQ' : 'idle'; u.site = null; }
    else if (u.team !== SIDE.home && g.eco) g.dir.enlist(u);
    else if (u.team !== SIDE.home) { const st = g.stones()[0]; u.order = st && Math.hypot(u.pos.x - st.pos.x, u.pos.z - st.pos.z) > 60 ? { type: 'raid', x: 0, z: 0 } : { type: 'guard', x: u.pos.x, z: u.pos.z }; }
    else g.dir.enlist(u);
  }
  pilot(p: Seat, u: Unit) { if (p.unit && p.unit !== u) this.release(p); u.pilot = p.id; p.unit = u; u.target = null; u.wind = 0; if (u.site) { u.site.builder = null; u.site = null; } u.state = 'idle'; /* ore in the pack stays there until the body walks it home: banking it here was a free trip */ u.order = { type: 'guard', x: u.pos.x, z: u.pos.z }; }

  /** Each side hears who holds the other end, and what has to fall there. */
  private greet(players: Seat[]) {
    const g = this.g, crew = players.filter(p => p.team === SIDE.home).length, veyl = players.length - crew, H = SIDE.home, O = SIDE.out;
    if (multi()) { for (const t of MATCH.teams) { const n = players.filter(p => p.team === t).length; if (!n) continue;
      const pals = MATCH.teams.filter(o => o !== t && isFriend(o, t)).length, foes = MATCH.teams.filter(o => !isFriend(o, t)).length;
      g.feed(FACTION[t].voice, `${n > 1 ? n + ' of you lead' : 'You lead'} the ${FACTION[t].short} tonight${pals ? `, with ${pals === 1 ? 'one friendly side' : pals + ' friendly sides'}` : ''}, against ${foes === 1 ? 'one other side' : foes + ' other sides'}. Break every home building they have.`, 'in', t); }
      return; }
    if (fac(H) === 0 && fac(O) !== 0) {
      if (veyl && fac(O) === 2) g.feed('Overgrowth', crew ? 'The Ironhold have somebody clever with them tonight. Chew ore, grow the swarm, and break every Headframe.' : `${veyl > 1 ? veyl + ' of you lead' : 'You lead'} the Gloam tonight. The Ironhold bots are digging in down the road. Break every Headframe.`, 'in', O);
      else if (veyl) g.feed('Conductor', crew ? 'The Ironhold have somebody clever with them tonight. Hum ore, grow the Chorus, and break every Headframe.' : `${veyl > 1 ? veyl + ' voices lead' : 'You lead'} the Chorus tonight. The Ironhold bots are digging in down the road. Break every Headframe.`, 'in', O);
      if (crew) g.feed('Quartermaster', fac(O) === 2 ? (veyl ? 'Something with a lot of legs is thinking at the end of the road tonight. The Gloam dig and grow like we do. Watch the green carpet.' : crew > 1 ? `${crew} of you on one payroll. Something is growing down the road.` : 'Just you tonight. Something is growing down the road. Clock in.') : veyl ? 'Word from the ridge: the Veyl have somebody clever with them tonight. They dig and build like we do. Watch the road.' : crew > 1 ? `${crew} of you on one payroll. The Veyl have noticed and are sending more.` : 'Just you tonight. Clock in.', 'in', H);
    } else for (const [t, foe, n] of [[H, O, crew], [O, H, veyl]]) if (n) {
      // Any other pairing, mirrors included.
      const them = fac(foe) === fac(t) ? `another ${['Ironhold crew', 'Chorus', 'swarm'][fac(t)]}` : FACTION[foe].name;
      g.feed(FACTION[t].voice, `${n > 1 ? n + ' of you lead' : 'You lead'} the ${FACTION[t].short} tonight, against ${them} at the ${t === H ? 'outpost' : 'yard'}. Break every ${BLD[FACTION[foe].hq].name}.`, 'in', t);
    }
  }

  /** A player arrives while the match is running: a late start, or coming back after a dropped connection. An observer just starts watching. */
  join(p: Seat) {
    this.seats.push(p); p.inbox = []; p.unit = null;
    if (p.team < 0) { this.say(p, this.beginMsg(p, this.propHurt())); return; }
    this.run(() => {
      const g = this.g, H = SIDE.home;
      if (p.team !== H && p.team !== SIDE.out && !MATCH.teams.includes(p.team)) p.team = H;
      if (p.team !== H && !g.eco) p.team = H;   // a Chorus that breeds for free has no seats for players
      if (this.recording) this.rec.log.push(['j', this.tick, p.id, p.name, p.team]);
      g.names[p.id] = p.name; g.teams[p.id] = p.team; if (!g.score[p.id]) g.score[p.id] = [0, 0, 0]; this.crew();
      const u = p.team !== H ? g.freshBody(p.team) : g.own(FACTION[H].worker, H).find(x => !x.pilot) || g.soldiers().find(x => !x.pilot) || g.spawn(FACTION[H].worker, H, ...g.hqSpot(H)); if (u) this.pilot(p, u);
      g.evq!.push(['nm', g.names, g.teams]); g.feed('Signal', `${p.name} clocked in late. Docked accordingly.`, 'in');
    });
    this.say(p, this.beginMsg(p, this.propHurt()));
  }
  private propHurt() { const ph: number[][] = []; this.g.props.forEach((q, i) => { if (!q.alive) ph.push([i, 0]); else if (q.hp < this.hp0[i]) ph.push([i, Math.ceil(q.hp)]); }); return ph; }
  /** A player leaves the running match. Their body goes back to the bots. */
  leave(p: Seat) {
    this.seats = this.seats.filter(x => x !== p); if (p.team < 0) return;
    this.run(() => {
      const g = this.g; if (this.recording) this.rec.log.push(['l', this.tick, p.id]);
      if (p.unit) this.release(p);
      delete g.names[p.id]; delete g.teams[p.id]; g.evq!.push(['nm', g.names, g.teams]); this.crew(); if (p.team !== SIDE.home) this.gone[p.name] = p.team;
      if (this.players.length) g.feed('Signal', `${p.name} clocked off. Their crew is back on the roster.`, 'al');
    });
  }

  /** One tick: every player's input in seat order, then the world moves on, then (every second tick) each side is sent what it can see. */
  step() {
    const g = this.g;
    this.run(() => {
      for (const p of this.players) {
        if (p.unit && !p.unit.alive) p.unit = null;
        for (const m of p.inbox) {
          if (this.recording && (m.me || (Array.isArray(m.c) && m.c.length))) this.rec.log.push(['i', this.tick, p.id, m.me ?? null, Array.isArray(m.c) ? m.c.slice(0, 60) : []]);
          this.input(p, m);
        }
        p.inbox.length = 0;
      }
      g.update(TICK); this.tick++;
      if (this.recording && this.tick % Match.CHECK_EVERY === 0) this.rec.log.push(['h', this.tick, worldHash(g)]);
      // Each side is sent only what it can see: one snapshot per side, shared by everyone on it. Observers see the whole world.
      if (this.tick % 2 === 0) {
        const w = this.wire; w.begin(this.players.map(p => p.team)); const by = new Map<number, string>();
        for (const p of this.seats) { let s = by.get(p.team); if (s === undefined) by.set(p.team, s = JSON.stringify(w.snap(p.team >= 0 ? p.team : null))); this.say(p, s); }
      }
    });
    return g.phase === 'over';
  }
  /** What one message from a player does. */
  private input(p: Seat, m: any) {
    const g = this.g;
    if (m.me && p.unit && Array.isArray(m.me)) serverMove(g, p.unit, m.me);
    if (!Array.isArray(m.c)) return;
    for (const c of m.c.slice(0, 60)) {
      if (!Array.isArray(c)) continue;
      try {
        if (c[0] === 'bd') { const u = g.units.find(x => x.id === c[1]); if (u && u.alive && u.team === p.team && (!u.pilot || u.pilot === p.id)) this.pilot(p, u); }
        else if (c[0] === 'rs' && p.team !== SIDE.home) { if (!p.unit && g.stones().length) { const u = g.freshBody(p.team); if (u) { this.pilot(p, u); this.say(p, { t: 'yo', unit: u.id }); g.feedTo = p.id; g.feed(FACTION[p.team].voice, fac(p.team) === 2 ? 'A fresh Grazer, wet from the Bud. Mind it.' : 'A fresh voice for you. Mind this one.', ''); g.feedTo = 0; } } }
        // A spare body first: a fresh Rigger only when the crew has none.
        else if (c[0] === 'rs') { const H = SIDE.home, u = !p.unit ? g.freshBody(H) : null; if (u) { this.pilot(p, u); this.say(p, { t: 'yo', unit: u.id }); g.feedTo = p.id; g.feed(FACTION[H].voice, fac(H) === 2 ? 'A fresh Grazer, wet from the Bud. Mind it.' : fac(H) ? 'A fresh voice for you. Mind this one.' : 'Found you a fresh Rigger. Try to keep this one.', ''); g.feedTo = 0; } }
        else serverCmd(g, p.id, p.unit, c);
      } catch (e) { console.error('bad command', c[0], e); }
    }
  }
  /** Closes the record: the last tick, the world's fingerprint, and how it ended. */
  finish(why: 'over' | 'left' | 'stopped') { const g = this.g; this.rec.end = { tick: this.tick, hash: worldHash(g), won: why === 'over' ? !!g.won : null, time: g.time, why }; return this.rec; }
}

/** A replay being played back, one tick at a time, with nobody connected. A watcher seat, if given, is sent what an observer would be. */
export class Playback {
  m: Match; drift = -1; private i = 0; readonly last: number;
  constructor(public rec: Replay, say?: Say, watch?: Seat) {
    const seats = rec.seats.map(seatOf); if (watch) seats.push(watch);
    this.m = new Match(rec.setup, seats, say || (() => { /* nobody to tell */ }), rec.build, false);
    const log = rec.log; this.last = rec.end?.tick ?? (log.length ? log[log.length - 1][1] : 0);
  }
  /** Feeds in every entry up to this tick: joins, leaves and inputs the server took before running the tick, and checks the world where the server did. */
  feed() { const m = this.m, log = this.rec.log; for (; this.i < log.length && log[this.i][1] <= m.tick; this.i++) { const e = log[this.i], s = e[0] === 'l' || e[0] === 'i' ? m.seats.find(x => x.id === e[2]) : null;
    if (e[0] === 'j') m.join(seatOf({ id: e[2], name: e[3], team: e[4] }));
    else if (e[0] === 'l') { if (s) m.leave(s); }
    else if (e[0] === 'i') { if (s) s.inbox.push({ t: 'in', me: e[3], c: e[4] }); }
    else if (e[0] === 'h' && e[1] === m.tick && this.drift < 0 && worldHash(m.g) !== e[2]) this.drift = m.tick;
  } }
  /** One tick. Returns true once the recording has run out; the leaves that ended it are fed in then. */
  step() { if (this.m.tick >= this.last) return true; this.feed(); this.m.step(); if (this.m.tick >= this.last) { this.feed(); return true; } return false; }
  get done() { return this.m.tick >= this.last; }
}
const seatOf = (s: { id: number; name: string; team: number }): Seat => ({ id: s.id, name: s.name, team: s.team, unit: null, inbox: [] });
/** Plays a whole replay with nobody connected. Returns the match, the first tick whose world check did not match (-1 if none), and the end fingerprint. */
export function playBack(rec: Replay) { const p = new Playback(rec); while (!p.step()) { /* next tick */ } return { match: p.m, drift: p.drift, hash: worldHash(p.m.g) }; }

/** Builds every body and building once, for every pairing of sides, before the first match in this process.
 *  The model makers keep what they build and draw on the dice only the first time, so a server on its tenth match and a replay in a fresh
 *  page would otherwise roll different dice for the same tick. With everything built up front, both draw the same. */
const warmed = new Set<string>();
/** With no setup, every one-on-one pairing; with one, that match's pairing and sides (a team game has more of them). */
export function warm(setup?: Setup) {
  const todo = (setup ? [{ out: setup.out, mt: setup.mt || null, plan: setup.plan || '', map: setup.map }] : [0, 1, 2, 3, 4, 5, 6, 7, 8].map(out => ({ out, mt: null as TeamPlan | null, plan: '', map: 0 }))).filter(x => !warmed.has(JSON.stringify(x)));
  if (!todo.length) return; for (const x of todo) warmed.add(JSON.stringify(x));
  const r = Math.random, now = Date.now; let s = 1; Math.random = () => (s = (s * 16807) % 2147483647) / 2147483647; Date.now = () => 0;
  try {
    for (const x of todo) {
      usePlan(x.plan || null); setMap(x.map); setSidesCode(x.out); setTeamGame(x.mt);
      const g = new GAME.Game(noPipe(), noHud, DIFFS[1], x.map, null, null, true); g.noRender = true;
      for (const t of multi() ? MATCH.teams : [SIDE.home, SIDE.out]) {
        for (const k of Object.keys(UNIT) as Kind[]) try { g.spawn(k, t, 0, 0); } catch (e) { /* a kind this side cannot field */ }
        for (const k of Object.keys(BLD) as BKind[]) for (const built of [true, false]) try { g.addBuilding(k, t, 0, 0, built); } catch (e) { /* a kind this side cannot build */ }
      }
      g.dispose?.();
    }
  } finally { Math.random = r; Date.now = now; setTeamGame(null); usePlan(null); }
}

// The match runs with nothing to draw on and nobody to show a HUD to, wherever it runs.
const noHud: any = new Proxy({}, { get: () => () => undefined });
const noPipe = (): any => ({ time: 0, flash: 0, w: 1280, h: 720, setDusk() { /* nothing to draw */ }, setSky() { /* nothing to draw */ }, draw() { /* nothing to draw */ }, render() { /* nothing to draw */ } });
