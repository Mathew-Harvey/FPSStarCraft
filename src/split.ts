// Split screen co-op: two players on one machine, sharing one Ironhold yard.
// It reuses the online co-op design. A silent copy of the game owns the match, the way the server does,
// and each player's half of the screen is an ordinary client of it. Nothing leaves the page.
import { Game } from './game';
import { Net } from './net';
import { DIFFS, setMap, Unit, isSoldier } from './data';
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

export class LocalMatch {
  host: Game; seats: Seat[]; names: Record<number, string> = {}; teams: Record<number, number> = {};
  private acc = 0; private tick = 0; private done = false;
  constructor(public map: number, public diff: number, players = 2) {
    audioSeat(0);
    setMap(map); const g = this.host = new Game(noPipe(), noHud, DIFFS[diff], map); g.noRender = true; g.evq = []; g.me = null; g.phase = 'play';
    this.seats = []; for (let i = 0; i < players; i++) this.seats.push(new Seat(i + 1, i ? 'Player two' : 'Player one'));
    for (const s of this.seats) { this.names[s.pid] = s.name; this.teams[s.pid] = 0; g.score[s.pid] = [0, 0, 0]; }
    g.names = this.names; g.teams = this.teams; g.coop = players;
    const riggers = g.own('rigger'); this.seats.forEach((s, i) => { const u = riggers[i % riggers.length]; if (u) { this.pilot(s, u); s.unit = u.id; } });
    g.feed('Quartermaster', 'Two of you on one payroll, and one screen between you. The Veyl have noticed and are sending more.', 'in');
    audioSeat(1);
  }
  /** Hands a body back to the AI. */
  private release(s: Seat) { const g = this.host, u = s.body; s.body = null; if (!u || !u.alive) return; u.pilot = 0; u.brace = false; u.moving = false; u.think = 0; if (isSoldier(u)) g.dir.enlist(u); else { u.state = 'idle'; u.site = null; } }
  private pilot(s: Seat, u: Unit) { if (s.body && s.body !== u) this.release(s); u.pilot = s.pid; s.body = u; u.target = null; u.wind = 0; if (u.site) { u.site.builder = null; u.site = null; } u.state = 'idle'; u.carrying = 0; u.order = { type: 'guard', x: u.pos.x, z: u.pos.z }; }
  private say(s: Seat, o: any) { s.inbox.push(JSON.parse(JSON.stringify(o))); }

  private step() {
    const g = this.host; setMap(this.map);
    for (const s of this.seats) {
      if (s.body && !s.body.alive) s.body = null;
      for (const m of s.mail) {
        if (m.me && s.body && Array.isArray(m.me)) serverMove(g, s.body, m.me);
        if (Array.isArray(m.c)) for (const c of m.c.slice(0, 60)) {
          if (!Array.isArray(c)) continue;
          if (c[0] === 'bd') { const u = g.units.find(x => x.id === c[1]); if (u && u.alive && u.team === 0 && (!u.pilot || u.pilot === s.pid)) this.pilot(s, u); }
          else if (c[0] === 'rs') { if (!s.body && g.ownB('headframe').length) { const u = g.spawn('rigger', 0, 2 + Math.random() * 3, 7 + Math.random() * 2); this.pilot(s, u); this.say(s, { t: 'yo', unit: u.id }); g.feedTo = s.pid; g.feed('Quartermaster', 'Found you a fresh Rigger. Try to keep this one.', ''); g.feedTo = 0; } }
          else serverCmd(g, s.pid, s.body, c);
        }
      }
      s.mail.length = 0;
    }
    g.update(TICK); this.tick++;
    if (this.tick % 2 === 0) { const snap = JSON.stringify(buildSnap(g)); for (const s of this.seats) { s.lastSnap = performance.now(); s.inbox.push(JSON.parse(snap)); } }
    if (g.phase === 'over') { this.done = true; const st = g.stats; for (const s of this.seats) this.say(s, { t: 'over', won: g.won, stats: [Math.floor(st.mined), st.built, st.kills, st.lost], time: g.time }); }
  }
  /** Runs the match forward by one screen frame. The match itself ticks thirty times a second, like the server. */
  frame(dt: number) {
    if (this.done) return; audioSeat(0);
    this.acc += Math.min(dt, .1); let n = 0; while (this.acc >= TICK && n++ < 3 && !this.done) { this.acc -= TICK; this.step(); } if (this.acc > TICK) this.acc = 0;
    audioSeat(1);
  }
}
