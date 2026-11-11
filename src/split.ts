// Split screen: two players on one machine. Co-op shares one side's base; versus puts player two in the Veyl.
// It reuses the online co-op design. A silent copy of the game owns the match, the way the server does,
// and each player's half of the screen is an ordinary client of it. Nothing leaves the page.
// A single player on the Veyl side runs the same way, with one seat: the bots run Ironhold.
import { Game } from './game';
import { Net } from './net';
import { DIFFS, SIDE, FACTION, setMap, Unit, isSoldier, isWorker } from './data';
import { buildSnap, serverCmd, serverMove } from './netgame';
import { audioSeat } from './audio';

const TICK = 1 / 30;
const noHud: any = new Proxy({}, { get: () => () => undefined });
const noPipe = (): any => ({ time: 0, flash: 0, w: 1280, h: 720, setDusk() { /* nothing to draw */ }, draw() { /* nothing to draw */ } });

/** One player's line to the match. It looks like a network connection to the game, but delivers by hand. */
export class Seat extends Net {
  mail: any[] = []; body: Unit | null = null;
  constructor(public pid: number, public name: string) { super(); this.id = pid; this.open = true; }
  send(o: any) { if (o && o.t === 'in' && this.mail.length < 30) this.mail.push(JSON.parse(JSON.stringify(o))); }
  close() { this.open = false; }
}

/** Who plays which side: everyone on Ironhold, player two on the Veyl, or everyone on the Veyl against Ironhold bots. */
export type SplitMode = 'coop' | 'versus' | 'veyl';
export class LocalMatch {
  host: Game; seats: Seat[]; /** Who holds the outpost in this match: 1 the Veyl, 2 the Gloam. */ out = SIDE.out; names: Record<number, string> = {}; teams: Record<number, number> = {}; mode: SplitMode;
  private acc = 0; private tick = 0; private done = false;
  /** True when the Veyl run their own economy here, so each half's copy of the game has to set up the same world. */
  get eco() { return this.host.eco; }
  constructor(public map: number, public diff: number, players = 2, mode: SplitMode | boolean = 'coop') {
    audioSeat(0); this.mode = mode === true ? 'versus' : mode === false ? 'coop' : mode;
    const O = this.out, team = (pid: number) => this.mode === 'veyl' ? O : this.mode === 'versus' && pid > 1 ? O : 0, eco = this.mode !== 'coop' || O === 2;
    setMap(map); const g = this.host = new Game(noPipe(), noHud, DIFFS[diff], map, null, null, eco); g.noRender = true; g.evq = []; g.me = null; g.phase = 'play';
    this.seats = []; for (let i = 0; i < players; i++) this.seats.push(new Seat(i + 1, players === 1 ? 'You' : i ? 'Player two' : 'Player one'));
    for (const s of this.seats) { this.names[s.pid] = s.name; this.teams[s.pid] = team(s.pid); g.score[s.pid] = [0, 0, 0]; }
    g.names = this.names; g.teams = this.teams; g.coop = Math.max(1, this.seats.filter(s => !this.teams[s.pid]).length); g.human = [this.seats.some(s => !this.teams[s.pid]), this.seats.some(s => this.teams[s.pid] === 1), this.seats.some(s => this.teams[s.pid] === 2)];
    const riggers = g.own('rigger'); this.seats.forEach((s, i) => { const u = this.teams[s.pid] ? this.veylBody() : riggers[i % riggers.length]; if (u) { this.pilot(s, u); s.unit = u.id; } });
    if (O === 2 && this.mode === 'versus') { g.feedTo = 1; g.feed('Quartermaster', 'The other half of this screen leads the Gloam. Keep a Headframe standing and squash their Mother Caps.', 'in'); g.feedTo = 2; g.feed('Overgrowth', 'You lead the Gloam tonight. Chew ore, grow the swarm, and break every Headframe.', 'in'); g.feedTo = 0; }
    else if (O === 2 && this.mode === 'veyl') g.feed('Overgrowth', players > 1 ? 'Two of you lead the Gloam tonight. The Ironhold bots are digging in down the road. Break every Headframe.' : 'You lead the Gloam tonight. The Ironhold are digging in down the road. Break every Headframe.', 'in');
    else if (O === 2) g.feed('Quartermaster', 'Two of you on one payroll, and one screen between you. Something is growing at the end of the road.', 'in');
    else if (this.mode === 'versus') { g.feedTo = 1; g.feed('Quartermaster', 'The other half of this screen sings for the Veyl. Keep a Headframe standing and break their Stones.', 'in'); g.feedTo = 2; g.feed('Conductor', 'You sing for the Veyl tonight. Hum ore, grow the Chorus, and break every Headframe.', 'in'); g.feedTo = 0; }
    else if (this.mode === 'veyl') g.feed('Conductor', players > 1 ? 'Two voices lead the Chorus tonight. The Ironhold bots are digging in down the road. Break every Headframe.' : 'You lead the Chorus tonight. The Ironhold are digging in down the road. Break every Headframe.', 'in');
    else g.feed('Quartermaster', 'Two of you on one payroll, and one screen between you. The Veyl have noticed and are sending more.', 'in');
    audioSeat(1);
  }
  /** A Veyl body for a player on the Chorus side: a free Tender or fighter, or a fresh Tender at a Choir Stone. */
  private veylBody(): Unit | null { return this.host.freshBody(this.out); }
  private release(s: Seat) { const g = this.host, u = s.body; s.body = null; if (!u || !u.alive) return; u.pilot = 0; u.brace = false; u.moving = false; u.think = 0; if (isWorker(u.kind)) { u.state = u.carrying > 0 ? 'toHQ' : 'idle'; u.site = null; } else if (u.team && g.eco) g.dir.enlist(u); else if (u.team) { const st = g.stones()[0]; u.order = st && Math.hypot(u.pos.x - st.pos.x, u.pos.z - st.pos.z) > 60 ? { type: 'raid', x: 0, z: 0 } : { type: 'guard', x: u.pos.x, z: u.pos.z }; } else if (isSoldier(u)) g.dir.enlist(u); else { u.state = u.carrying > 0 ? 'toHQ' : 'idle'; u.site = null; } }
  private pilot(s: Seat, u: Unit) { if (s.body && s.body !== u) this.release(s); u.pilot = s.pid; s.body = u; u.target = null; u.wind = 0; if (u.site) { u.site.builder = null; u.site = null; } u.state = 'idle'; u.order = { type: 'guard', x: u.pos.x, z: u.pos.z }; }
  private say(s: Seat, o: any) { s.inbox.push(JSON.parse(JSON.stringify(o))); }

  private step() {
    const g = this.host; setMap(this.map); SIDE.out = this.out;
    for (const s of this.seats) {
      if (s.body && !s.body.alive) s.body = null;
      for (const m of s.mail) {
        if (m.me && s.body && Array.isArray(m.me)) serverMove(g, s.body, m.me);
        if (Array.isArray(m.c)) for (const c of m.c.slice(0, 60)) {
          if (!Array.isArray(c)) continue;
          if (c[0] === 'bd') { const u = g.units.find(x => x.id === c[1]); if (u && u.alive && u.team === this.teams[s.pid] && (!u.pilot || u.pilot === s.pid)) this.pilot(s, u); }
          else if (c[0] === 'rs' && this.teams[s.pid]) { if (!s.body && g.stones().length) { const u = this.veylBody(); if (u) { this.pilot(s, u); this.say(s, { t: 'yo', unit: u.id }); g.feedTo = s.pid; g.feed(FACTION[this.out].voice, this.out === 2 ? 'A fresh Grazer, wet from the Bud. Mind it.' : 'A fresh voice for you. Mind this one.', ''); g.feedTo = 0; } } }
          else if (c[0] === 'rs') { const u = !s.body ? g.freshBody(0) : null; if (u) { this.pilot(s, u); this.say(s, { t: 'yo', unit: u.id }); g.feedTo = s.pid; g.feed('Quartermaster', 'Found you a fresh Rigger. Try to keep this one.', ''); g.feedTo = 0; } }
          else serverCmd(g, s.pid, s.body, c);
        }
      }
      s.mail.length = 0;
    }
    g.update(TICK); this.tick++;
    if (this.tick % 2 === 0) { const snap = JSON.stringify(buildSnap(g)); for (const s of this.seats) { s.lastSnap = performance.now(); s.inbox.push(JSON.parse(snap)); } }
    if (g.phase === 'over') { this.done = true; const st = g.stats; for (const s of this.seats) this.say(s, { t: 'over', won: g.won, stats: [Math.floor(st.mined), st.built, st.kills, st.lost, Math.floor(st.minedV)], time: g.time }); }
  }
  /** Runs the match forward by one screen frame. The match itself ticks thirty times a second, like the server. */
  frame(dt: number) {
    if (this.done) return; audioSeat(0);
    this.acc += Math.min(dt, .1); let n = 0; while (this.acc >= TICK && n++ < 3 && !this.done) { this.acc -= TICK; this.step(); } if (this.acc > TICK) this.acc = 0;
    audioSeat(1);
  }
}
