// Ore Else match server. One Node process serves the game page, keeps the lobbies and runs every match.
// The match itself is the same simulation the browser runs offline, stepped here so that no player is the host.
import { noHud, noPipe } from './shim';
import { createServer } from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { WebSocketServer, WebSocket } from 'ws';
import { Game } from '../src/game';
import { initHeadless } from '../src/gfx';
import { DIFFS, MAPS, SIDE, FACTION, BLD, setMap, setSidesCode, setTeamGame, fac, validMap, rollMap, Unit, isWorker } from '../src/data';
import { planTeams, multi, MATCH, isFriend, type TeamPlan } from '../src/core/sides';
import { Wire, WIRE, serverCmd, serverMove } from '../src/netgame';
import { dropped } from '../src/net-arms';

initHeadless();
if (process.env.ORE_TRUST_HITS === '1') { WIRE.trustHits = true; console.log('test server: hit claims are not checked (ORE_TRUST_HITS)'); }
if (process.env.ORE_WIRE_FOG === '0') { WIRE.fog = false; console.log('test server: every side is sent the whole world (ORE_WIRE_FOG=0)'); }
const PORT = +(process.env.PORT || 8080), TICK = 1 / 30, MAX_PLAYERS = 4, MAX_TEAM_PLAYERS = 8, MAX_LOBBIES = 40;
const here = dirname(fileURLToPath(import.meta.url));
const pagePath = [join(here, 'index.html'), join(here, '..', 'dist', 'index.html')].find(existsSync) || '';
let page = pagePath ? readFileSync(pagePath) : Buffer.from('Ore Else server is running, but the game page was not built. Run npm run build.');

interface Player { id: number; name: string; ready: boolean; team: number; ws: WebSocket; lobby: Lobby | null; unit: Unit | null; inbox: any[]; alive: boolean }
interface Lobby { /** A team game or free-for-all (see TeamPlan); unset for a one-on-one. */ mt?: TeamPlan | null; code: string; host: number; map: number; diff: number; /** Who holds each end, as a match code: yard faction * 3 + outpost faction (see setSidesCode). 1 and 2 are Ironhold against the Veyl or the Gloam. */ out: number; players: Player[]; game: Game | null; /** What each side is sent: fog on the wire. */ wire: Wire | null; tick: number; idle: number; hp0: number[]; /** Sides of players who dropped out of the running match, by name, so a Veyl player who reconnects sings for the Veyl again. */ gone: Record<string, number> }
const lobbies = new Map<string, Lobby>(); let nextPid = 1;
const send = (p: Player, o: any) => { if (p.ws.readyState === 1) p.ws.send(JSON.stringify(o)); };
const cleanName = (s: any) => String(s || '').replace(/[^\w \-'.]/g, '').trim().slice(0, 14) || 'Rigger';
/** Puts this lobby's map, ends and sides into the shared rules before anything of its match runs (one server runs many matches). */
function use(l: Lobby) { setMap(l.map); setSidesCode(l.out); if (l.mt) setTeamGame(l.mt); else setTeamGame(null); }
function newCode() { const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ'; for (;;) { let c = ''; for (let i = 0; i < 5; i++) c += A[Math.floor(Math.random() * A.length)]; if (!lobbies.has(c)) return c; } }
function tell(l: Lobby) { for (const p of l.players) send(p, { t: 'lobby', code: l.code, you: p.id, host: l.host, map: l.map, diff: l.diff, out: l.out, mt: l.mt || null, state: l.game ? 'play' : 'lobby', players: l.players.map(x => ({ id: x.id, name: x.name, ready: x.ready, team: x.team })) }); }

function leave(p: Player) {
  const l = p.lobby; if (!l) return; p.lobby = null; if (l.game) { use(l); l.game.pin(); }
  if (p.unit && l.game) release(l.game, p);
  l.players = l.players.filter(x => x !== p); if (l.game) { delete l.game.names[p.id]; delete l.game.teams[p.id]; l.game.evq!.push(['nm', l.game.names, l.game.teams]); l.game.coop = Math.max(1, l.players.filter(x => x.team === SIDE.home).length); sides(l); if (p.team !== SIDE.home) l.gone[p.name] = p.team; }
  if (l.game && l.players.length) l.game.feed('Signal', `${p.name} clocked off. Their crew is back on the roster.`, 'al');
  if (!l.players.length) { lobbies.delete(l.code); return; }
  if (l.host === p.id) l.host = l.players[0].id;
  tell(l);
}
/** Which sides still have a player. A side with nobody on it is handed to the bots. */
function sides(l: Lobby) { if (l.game) l.game.human = l.game.human.map((_, t) => l.players.some(p => p.team === t)); }
/** Hands a body back to the AI. */
function release(g: Game, p: Player) { const u = p.unit; p.unit = null; if (!u || !u.alive) return; u.pilot = 0; u.brace = false; u.moving = false; u.think = 0; if (isWorker(u.kind)) { u.state = u.carrying > 0 ? 'toHQ' : 'idle'; u.site = null; } else if (u.team !== SIDE.home && g.eco) g.dir.enlist(u); else if (u.team !== SIDE.home) { const st = g.stones()[0]; u.order = st && Math.hypot(u.pos.x - st.pos.x, u.pos.z - st.pos.z) > 60 ? { type: 'raid', x: 0, z: 0 } : { type: 'guard', x: u.pos.x, z: u.pos.z }; } else if (!isWorker(u.kind)) g.dir.enlist(u); else { u.state = u.carrying > 0 ? 'toHQ' : 'idle'; u.site = null; } }
/** A Veyl body for a player on the Chorus side: a free Tender or fighter, or a fresh Tender at a Choir Stone. */
function veylBody(g: Game): Unit | null { return g.freshBody(SIDE.out); }
function pilot(g: Game, p: Player, u: Unit) { if (p.unit && p.unit !== u) release(g, p); u.pilot = p.id; p.unit = u; u.target = null; u.wind = 0; if (u.site) { u.site.builder = null; u.site = null; } u.state = 'idle'; /* ore in the pack stays there until the body walks it home: banking it here was a free trip */ u.order = { type: 'guard', x: u.pos.x, z: u.pos.z }; }

function begin(l: Lobby) {
  l.map = rollMap(l.map);   // a Vast map is turned a new way for every match, so nobody knows where the far base is
  use(l); const eco = l.players.some(p => p.team !== SIDE.home) || l.out === 2 || multi(), g = new Game(noPipe(), noHud, DIFFS[l.diff], l.map, null, null, eco); g.noRender = true; g.evq = []; g.coop = l.players.length; g.me = null; g.phase = 'play';
  l.game = g; l.wire = new Wire(g); l.gone = {}; l.tick = 0; sides(l); l.hp0 = g.props.map(q => q.hp); const names: Record<number, string> = {}; for (const p of l.players) { names[p.id] = p.name; g.score[p.id] = [0, 0, 0]; g.teams[p.id] = p.team; } g.names = names; g.coop = Math.max(1, l.players.filter(p => p.team === SIDE.home).length);
  const riggers = g.own(FACTION[SIDE.home].worker, SIDE.home); let ri = 0; l.players.forEach(p => { p.inbox = []; p.unit = null; const u = p.team !== SIDE.home ? g.freshBody(p.team) : riggers[ri++ % riggers.length]; if (u) pilot(g, p, u); });
  for (const p of l.players) send(p, { t: 'begin', map: l.map, diff: l.diff, unit: p.unit ? p.unit.id : 0, names, team: p.team, teams: g.teams, eco: g.eco ? 1 : 0, out: l.out, mt: l.mt || null });
  if (multi()) for (const t of MATCH.teams) { const n = l.players.filter(p => p.team === t).length; if (!n) continue;
    const pals = MATCH.teams.filter(o => o !== t && isFriend(o, t)).length, foes = MATCH.teams.filter(o => !isFriend(o, t)).length;
    g.feed(FACTION[t].voice, `${n > 1 ? n + ' of you lead' : 'You lead'} the ${FACTION[t].short} tonight${pals ? `, with ${pals === 1 ? 'one friendly side' : pals + ' friendly sides'}` : ''}, against ${foes === 1 ? 'one other side' : foes + ' other sides'}. Break every home building they have.`, 'in', t); }
  else { const crew = l.players.filter(p => p.team === SIDE.home).length, veyl = l.players.length - crew, H = SIDE.home, O = SIDE.out;
    if (fac(H) === 0 && fac(O) !== 0) {
    if (veyl && fac(O) === 2) g.feed('Overgrowth', crew ? 'The Ironhold have somebody clever with them tonight. Chew ore, grow the swarm, and break every Headframe.' : `${veyl > 1 ? veyl + ' of you lead' : 'You lead'} the Gloam tonight. The Ironhold bots are digging in down the road. Break every Headframe.`, 'in', O);
    else if (veyl) g.feed('Conductor', crew ? 'The Ironhold have somebody clever with them tonight. Hum ore, grow the Chorus, and break every Headframe.' : `${veyl > 1 ? veyl + ' voices lead' : 'You lead'} the Chorus tonight. The Ironhold bots are digging in down the road. Break every Headframe.`, 'in', O);
    if (crew) g.feed('Quartermaster', fac(O) === 2 ? (veyl ? 'Something with a lot of legs is thinking at the end of the road tonight. The Gloam dig and grow like we do. Watch the green carpet.' : crew > 1 ? `${crew} of you on one payroll. Something is growing down the road.` : 'Just you tonight. Something is growing down the road. Clock in.') : veyl ? 'Word from the ridge: the Veyl have somebody clever with them tonight. They dig and build like we do. Watch the road.' : crew > 1 ? `${crew} of you on one payroll. The Veyl have noticed and are sending more.` : 'Just you tonight. Clock in.', 'in', H);
    } else for (const [t, foe, n] of [[H, O, crew], [O, H, veyl]]) if (n) {
      // Any other pairing, mirrors included: each side hears who holds the other end, and what has to fall there.
      const them = fac(foe) === fac(t) ? `another ${['Ironhold crew', 'Chorus', 'swarm'][fac(t)]}` : FACTION[foe].name;
      g.feed(FACTION[t].voice, `${n > 1 ? n + ' of you lead' : 'You lead'} the ${FACTION[t].short} tonight, against ${them} at the ${t === H ? 'outpost' : 'yard'}. Break every ${BLD[FACTION[foe].hq].name}.`, 'in', t);
    }
  }
  tell(l);
}
/** A player arrives while the shift is running: a late start, or coming back after a dropped connection. */
function joinLive(l: Lobby, p: Player) {
  const g = l.game!; use(l); g.pin(); p.inbox = []; p.unit = null; l.players.push(p); p.lobby = l; p.ready = true;
  if (p.team !== SIDE.home && p.team !== SIDE.out && !MATCH.teams.includes(p.team)) p.team = SIDE.home;
  if (p.team !== SIDE.home && !g.eco) p.team = SIDE.home;   // a Chorus that breeds for free has no seats for players
  g.names[p.id] = p.name; g.teams[p.id] = p.team; if (!g.score[p.id]) g.score[p.id] = [0, 0, 0]; g.coop = Math.max(1, l.players.filter(x => x.team === SIDE.home).length); sides(l);
  const H = SIDE.home, u = p.team !== H ? g.freshBody(p.team) : g.own(FACTION[H].worker, H).find(x => !x.pilot) || g.soldiers().find(x => !x.pilot) || g.spawn(FACTION[H].worker, H, ...g.hqSpot(H)); if (u) pilot(g, p, u);
  const ph: number[][] = []; g.props.forEach((q, i) => { if (!q.alive) ph.push([i, 0]); else if (q.hp < l.hp0[i]) ph.push([i, Math.ceil(q.hp)]); });
  send(p, { t: 'begin', map: l.map, diff: l.diff, unit: u ? u.id : 0, names: g.names, ph, team: p.team, teams: g.teams, eco: g.eco ? 1 : 0, out: l.out });
  g.evq!.push(['nm', g.names, g.teams]); g.feed('Signal', `${p.name} clocked in late. Docked accordingly.`, 'in'); tell(l);
}
function step(l: Lobby) {
  const g = l.game!; use(l); g.pin();
  for (const p of l.players) {
    if (p.unit && !p.unit.alive) p.unit = null;
    for (const m of p.inbox) {
      if (m.me && p.unit && Array.isArray(m.me)) serverMove(g, p.unit, m.me);
      if (Array.isArray(m.c)) for (const c of m.c.slice(0, 60)) {
        if (!Array.isArray(c)) continue;
        try {
          if (c[0] === 'bd') { const u = g.units.find(x => x.id === c[1]); if (u && u.alive && u.team === p.team && (!u.pilot || u.pilot === p.id)) pilot(g, p, u); }
          else if (c[0] === 'rs' && p.team !== SIDE.home) { if (!p.unit && g.stones().length) { const u = veylBody(g); if (u) { pilot(g, p, u); send(p, { t: 'yo', unit: u.id }); g.feedTo = p.id; g.feed(FACTION[p.team].voice, fac(p.team) === 2 ? 'A fresh Grazer, wet from the Bud. Mind it.' : 'A fresh voice for you. Mind this one.', ''); g.feedTo = 0; } } }
          // A spare body first: a fresh Rigger only when the crew has none. It used to spawn one free on every ask, whatever was standing around.
          else if (c[0] === 'rs') { const H = SIDE.home, u = !p.unit ? g.freshBody(H) : null; if (u) { pilot(g, p, u); send(p, { t: 'yo', unit: u.id }); g.feedTo = p.id; g.feed(FACTION[H].voice, fac(H) === 2 ? 'A fresh Grazer, wet from the Bud. Mind it.' : fac(H) ? 'A fresh voice for you. Mind this one.' : 'Found you a fresh Rigger. Try to keep this one.', ''); g.feedTo = 0; } }
          else serverCmd(g, p.id, p.unit, c);
        } catch (e) { console.error('bad command', c[0], e); }
      }
    }
    p.inbox.length = 0;
  }
  g.update(TICK); l.tick++;
  // Each side is sent only what it can see. One snapshot is built per side, and every player on that side gets the same one.
  if (l.tick % 2 === 0) { const w = l.wire!; w.begin(l.players.map(p => p.team)); const by = new Map<number, string>(); for (const p of l.players) { if (p.ws.readyState !== 1) continue; let s = by.get(p.team); if (s === undefined) by.set(p.team, s = JSON.stringify(w.snap(p.team))); p.ws.send(s); } }
  if (g.phase === 'over') {
    const st = g.stats; for (const p of l.players) { send(p, { t: 'over', won: multi() ? g.winners.some(t => isFriend(t, p.team)) : g.won, mine: multi() ? 1 : 0, stats: [Math.floor(st.mined), st.built, st.kills, st.lost, Math.floor(st.minedV)], time: g.time }); p.unit = null; p.ready = false; }
    l.game = null; l.wire = null; tell(l);
  }
}
setInterval(() => { for (const l of lobbies.values()) { if (l.game) { try { step(l); } catch (e) { console.error('match crashed', l.code, e); l.game = null; for (const p of l.players) send(p, { t: 'err', msg: 'The match hit a fault on the server and had to stop. Sorry.' }); tell(l); } } } }, TICK * 1000);

const http = createServer((req, res) => {
  if (req.url === '/healthz') { res.writeHead(200, { 'content-type': 'text/plain' }); res.end(`ok ${lobbies.size} lobbies\ndropped hit claims: ${JSON.stringify(dropped)}`); return; }
  if (process.env.ORE_DEV && pagePath) page = readFileSync(pagePath);
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-cache' }); res.end(page);
});
const wss = new WebSocketServer({ server: http, path: '/ws', maxPayload: 64 * 1024 });
wss.on('connection', ws => {
  const p: Player = { id: nextPid++, name: 'Rigger', ready: false, team: 0, ws, lobby: null, unit: null, inbox: [], alive: true };
  ws.on('pong', () => { p.alive = true; });
  ws.on('message', raw => {
    let m: any; try { m = JSON.parse(String(raw)); } catch (e) { return; } if (!m || typeof m !== 'object') return;
    const l = p.lobby;
    if (m.t === 'in') { if (l && l.game && p.inbox.length < 30) p.inbox.push(m); return; }
    if (m.t === 'create') {
      if (l) leave(p); if (lobbies.size >= MAX_LOBBIES) { send(p, { t: 'err', msg: 'The server is full. Try again in a few minutes.' }); return; }
      p.name = cleanName(m.name); p.ready = false; p.team = 0; const nl: Lobby = { code: newCode(), host: p.id, map: 0, diff: 1, out: 1, players: [p], game: null, wire: null, tick: 0, idle: 0, hp0: [], gone: {} }; lobbies.set(nl.code, nl); p.lobby = nl; tell(nl);
    } else if (m.t === 'join') {
      if (l) leave(p); const jl = lobbies.get(String(m.code || '').toUpperCase().trim());
      if (!jl) { send(p, { t: 'err', msg: 'No lobby with that code. Check the five letters.' }); return; }
      if (jl.players.length >= (jl.mt ? MAX_TEAM_PLAYERS : MAX_PLAYERS)) { send(p, { t: 'err', msg: 'That lobby is full.' }); return; }
      p.name = cleanName(m.name); use(jl); p.team = SIDE.home; if (jl.game) { if (jl.gone[p.name]) p.team = jl.gone[p.name]; delete jl.gone[p.name]; joinLive(jl, p); return; }
      p.ready = false; jl.players.push(p); p.lobby = jl; tell(jl);
    } else if (!l) return;
    else if (m.t === 'leave') { leave(p); send(p, { t: 'lobby', code: '', you: p.id, host: 0, map: 0, diff: 1, state: 'lobby', players: [] }); }
    else if (m.t === 'ready') { p.ready = !!m.v; tell(l); }
    else if (m.t === 'team' && !l.game) { use(l); const t = l.mt ? planTeams(l.mt) : null;
      // In a team game the player names a start (m.s); in a one-on-one, the far end (m.v) or the yard.
      if (t) { const i = t.at.indexOf(m.s | 0); if (i >= 0) p.team = t.teams[i]; } else { const [H, O] = setSidesCode(l.out); p.team = m.v ? O : H; } tell(l); }
    else if (m.t === 'set' && l.host === p.id && !l.game) { if (validMap(m.map)) l.map = m.map % 100; if (m.diff >= 0 && m.diff < DIFFS.length) l.diff = m.diff | 0; if (Number.isInteger(m.out) && m.out >= 0 && m.out < 9) { const [, O0] = setSidesCode(l.out); l.out = m.out; const [H1, O1] = setSidesCode(l.out); for (const x of l.players) x.team = x.team === O0 ? O1 : H1; }
      // A team game: a plan that holds, or null for a one-on-one again. Anyone whose start went away goes to the yard.
      if (m.mt !== undefined && (m.mt === null || planTeams(m.mt))) { l.mt = m.mt; if (l.mt) { const t = planTeams(l.mt)!; l.out = fac(t.home) * 3 + fac(t.out); } use(l); const ok = l.mt ? planTeams(l.mt)!.teams : [SIDE.home, SIDE.out]; for (const x of l.players) if (!ok.includes(x.team)) x.team = SIDE.home; } tell(l); }
    else if (m.t === 'start' && l.host === p.id && !l.game) { if (l.players.every(x => x.ready || x.id === l.host)) begin(l); else send(p, { t: 'err', msg: 'Not everyone is ready.' }); }
  });
  ws.on('close', () => leave(p)); ws.on('error', () => leave(p));
  send(p, { t: 'lobby', code: '', you: p.id, host: 0, map: 0, diff: 1, state: 'lobby', players: [] });
});
setInterval(() => { for (const ws of wss.clients) { const any = ws as any; if (any.dead) { ws.terminate(); continue; } any.dead = true; ws.ping(); ws.once('pong', () => { any.dead = false; }); } }, 20000);
http.listen(PORT, () => console.log(`Ore Else server on http://localhost:${PORT}`));
