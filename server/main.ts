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
import { DIFFS, MAPS, setMap, validMap, Unit, isSoldier, isWorker } from '../src/data';
import { buildSnap, serverCmd, serverMove } from '../src/netgame';

initHeadless();
const PORT = +(process.env.PORT || 8080), TICK = 1 / 30, MAX_PLAYERS = 4, MAX_LOBBIES = 40;
const here = dirname(fileURLToPath(import.meta.url));
const pagePath = [join(here, 'index.html'), join(here, '..', 'dist', 'index.html')].find(existsSync) || '';
let page = pagePath ? readFileSync(pagePath) : Buffer.from('Ore Else server is running, but the game page was not built. Run npm run build.');

interface Player { id: number; name: string; ready: boolean; team: number; ws: WebSocket; lobby: Lobby | null; unit: Unit | null; inbox: any[]; alive: boolean }
interface Lobby { code: string; host: number; map: number; diff: number; players: Player[]; game: Game | null; tick: number; idle: number; hp0: number[]; /** Sides of players who dropped out of the running match, by name, so a Veyl player who reconnects sings for the Veyl again. */ gone: Record<string, number> }
const lobbies = new Map<string, Lobby>(); let nextPid = 1;
const send = (p: Player, o: any) => { if (p.ws.readyState === 1) p.ws.send(JSON.stringify(o)); };
const cleanName = (s: any) => String(s || '').replace(/[^\w \-'.]/g, '').trim().slice(0, 14) || 'Rigger';
function newCode() { const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ'; for (;;) { let c = ''; for (let i = 0; i < 5; i++) c += A[Math.floor(Math.random() * A.length)]; if (!lobbies.has(c)) return c; } }
function tell(l: Lobby) { for (const p of l.players) send(p, { t: 'lobby', code: l.code, you: p.id, host: l.host, map: l.map, diff: l.diff, state: l.game ? 'play' : 'lobby', players: l.players.map(x => ({ id: x.id, name: x.name, ready: x.ready, team: x.team })) }); }

function leave(p: Player) {
  const l = p.lobby; if (!l) return; p.lobby = null;
  if (p.unit && l.game) release(l.game, p);
  l.players = l.players.filter(x => x !== p); if (l.game) { delete l.game.names[p.id]; delete l.game.teams[p.id]; l.game.evq!.push(['nm', l.game.names, l.game.teams]); l.game.coop = Math.max(1, l.players.filter(x => !x.team).length); sides(l); if (p.team) l.gone[p.name] = p.team; }
  if (l.game && l.players.length) l.game.feed('Signal', `${p.name} clocked off. Their crew is back on the roster.`, 'al');
  if (!l.players.length) { lobbies.delete(l.code); return; }
  if (l.host === p.id) l.host = l.players[0].id;
  tell(l);
}
/** Which sides still have a player. A side with nobody on it is handed to the bots. */
function sides(l: Lobby) { if (l.game) l.game.human = [l.players.some(p => !p.team), l.players.some(p => p.team === 1)]; }
/** Hands a body back to the AI. */
function release(g: Game, p: Player) { const u = p.unit; p.unit = null; if (!u || !u.alive) return; u.pilot = 0; u.brace = false; u.moving = false; u.think = 0; if (isWorker(u.kind)) { u.state = u.carrying > 0 ? 'toHQ' : 'idle'; u.site = null; } else if (u.team && g.eco) g.dir.enlist(u); else if (u.team) { const st = g.stones()[0]; u.order = st && Math.hypot(u.pos.x - st.pos.x, u.pos.z - st.pos.z) > 60 ? { type: 'raid', x: 0, z: 0 } : { type: 'guard', x: u.pos.x, z: u.pos.z }; } else if (isSoldier(u)) g.dir.enlist(u); else { u.state = u.carrying > 0 ? 'toHQ' : 'idle'; u.site = null; } }
/** A Veyl body for a player on the Chorus side: a free Tender or fighter, or a fresh Tender at a Choir Stone. */
function veylBody(g: Game): Unit | null { const free = g.units.filter(u => u.alive && u.team === 1 && !u.pilot && u.kind !== 'warden'), t = free.filter(u => isWorker(u.kind)); if (t.length) return t[Math.floor(Math.random() * t.length)]; if (free.length) return free[Math.floor(Math.random() * free.length)]; return g.ownB('choir', false, 1).length ? g.spawn('tender', 1, ...g.hqSpot(1)) : null; }
function pilot(g: Game, p: Player, u: Unit) { if (p.unit && p.unit !== u) release(g, p); u.pilot = p.id; p.unit = u; u.target = null; u.wind = 0; if (u.site) { u.site.builder = null; u.site = null; } u.state = 'idle'; if (u.carrying > 0) g.bank(u); u.order = { type: 'guard', x: u.pos.x, z: u.pos.z }; }

function begin(l: Lobby) {
  setMap(l.map); const eco = l.players.some(p => p.team === 1), g = new Game(noPipe(), noHud, DIFFS[l.diff], l.map, null, null, eco); g.noRender = true; g.evq = []; g.coop = l.players.length; g.me = null; g.phase = 'play';
  l.game = g; l.gone = {}; l.tick = 0; sides(l); l.hp0 = g.props.map(q => q.hp); const names: Record<number, string> = {}; for (const p of l.players) { names[p.id] = p.name; g.score[p.id] = [0, 0, 0]; g.teams[p.id] = p.team; } g.names = names; g.coop = Math.max(1, l.players.filter(p => !p.team).length);
  const riggers = g.own('rigger'); let ri = 0; l.players.forEach(p => { p.inbox = []; p.unit = null; const u = p.team ? veylBody(g) : riggers[ri++ % riggers.length]; if (u) pilot(g, p, u); });
  for (const p of l.players) send(p, { t: 'begin', map: l.map, diff: l.diff, unit: p.unit ? p.unit.id : 0, names, team: p.team, teams: g.teams, eco: eco ? 1 : 0 });
  { const crew = l.players.filter(p => !p.team).length, veyl = l.players.length - crew;
    if (veyl) g.feed('Conductor', crew ? 'The Ironhold have somebody clever with them tonight. Hum ore, grow the Chorus, and break every Headframe.' : `${veyl > 1 ? veyl + ' voices lead' : 'You lead'} the Chorus tonight. The Ironhold bots are digging in down the road. Break every Headframe.`, 'in');
    if (crew) g.feed('Quartermaster', veyl ? 'Word from the ridge: the Veyl have somebody clever with them tonight. They dig and build like we do. Watch the road.' : crew > 1 ? `${crew} of you on one payroll. The Veyl have noticed and are sending more.` : 'Just you tonight. Clock in.', 'in'); }
  tell(l);
}
/** A player arrives while the shift is running: a late start, or coming back after a dropped connection. */
function joinLive(l: Lobby, p: Player) {
  const g = l.game!; setMap(l.map); p.inbox = []; p.unit = null; l.players.push(p); p.lobby = l; p.ready = true;
  if (p.team && !g.eco) p.team = 0;   // a Chorus that breeds for free has no seats for players
  g.names[p.id] = p.name; g.teams[p.id] = p.team; if (!g.score[p.id]) g.score[p.id] = [0, 0, 0]; g.coop = Math.max(1, l.players.filter(x => !x.team).length); sides(l);
  const u = p.team ? veylBody(g) : g.own('rigger').find(x => !x.pilot) || g.soldiers().find(x => !x.pilot) || g.spawn('rigger', 0, ...g.hqSpot()); if (u) pilot(g, p, u);
  const ph: number[][] = []; g.props.forEach((q, i) => { if (!q.alive) ph.push([i, 0]); else if (q.hp < l.hp0[i]) ph.push([i, Math.ceil(q.hp)]); });
  send(p, { t: 'begin', map: l.map, diff: l.diff, unit: u ? u.id : 0, names: g.names, ph, team: p.team, teams: g.teams, eco: g.eco ? 1 : 0 });
  g.evq!.push(['nm', g.names, g.teams]); g.feed('Signal', `${p.name} clocked in late. Docked accordingly.`, 'in'); tell(l);
}
function step(l: Lobby) {
  const g = l.game!; setMap(l.map);
  for (const p of l.players) {
    if (p.unit && !p.unit.alive) p.unit = null;
    for (const m of p.inbox) {
      if (m.me && p.unit && Array.isArray(m.me)) serverMove(g, p.unit, m.me);
      if (Array.isArray(m.c)) for (const c of m.c.slice(0, 60)) {
        if (!Array.isArray(c)) continue;
        try {
          if (c[0] === 'bd') { const u = g.units.find(x => x.id === c[1]); if (u && u.alive && u.team === p.team && (!u.pilot || u.pilot === p.id)) pilot(g, p, u); }
          else if (c[0] === 'rs' && p.team) { if (!p.unit && g.stones().length) { const u = veylBody(g); if (u) { pilot(g, p, u); send(p, { t: 'yo', unit: u.id }); g.feedTo = p.id; g.feed('Conductor', 'A fresh voice for you. Mind this one.', ''); g.feedTo = 0; } } }
          else if (c[0] === 'rs') { if (!p.unit && g.ownB('headframe').length) { const u = g.spawn('rigger', 0, ...g.hqSpot()); pilot(g, p, u); send(p, { t: 'yo', unit: u.id }); g.feedTo = p.id; g.feed('Quartermaster', 'Found you a fresh Rigger. Try to keep this one.', ''); g.feedTo = 0; } }
          else serverCmd(g, p.id, p.unit, c);
        } catch (e) { console.error('bad command', c[0], e); }
      }
    }
    p.inbox.length = 0;
  }
  g.update(TICK); l.tick++;
  if (l.tick % 2 === 0) { const s = JSON.stringify(buildSnap(g)); for (const p of l.players) if (p.ws.readyState === 1) p.ws.send(s); }
  if (g.phase === 'over') {
    const st = g.stats; for (const p of l.players) { send(p, { t: 'over', won: g.won, stats: [Math.floor(st.mined), st.built, st.kills, st.lost, Math.floor(st.minedV)], time: g.time }); p.unit = null; p.ready = false; }
    l.game = null; tell(l);
  }
}
setInterval(() => { for (const l of lobbies.values()) { if (l.game) { try { step(l); } catch (e) { console.error('match crashed', l.code, e); l.game = null; for (const p of l.players) send(p, { t: 'err', msg: 'The match hit a fault on the server and had to stop. Sorry.' }); tell(l); } } } }, TICK * 1000);

const http = createServer((req, res) => {
  if (req.url === '/healthz') { res.writeHead(200, { 'content-type': 'text/plain' }); res.end(`ok ${lobbies.size} lobbies`); return; }
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
      p.name = cleanName(m.name); p.ready = false; p.team = 0; const nl: Lobby = { code: newCode(), host: p.id, map: 0, diff: 1, players: [p], game: null, tick: 0, idle: 0, hp0: [], gone: {} }; lobbies.set(nl.code, nl); p.lobby = nl; tell(nl);
    } else if (m.t === 'join') {
      if (l) leave(p); const jl = lobbies.get(String(m.code || '').toUpperCase().trim());
      if (!jl) { send(p, { t: 'err', msg: 'No lobby with that code. Check the five letters.' }); return; }
      if (jl.players.length >= MAX_PLAYERS) { send(p, { t: 'err', msg: 'That lobby is full.' }); return; }
      p.name = cleanName(m.name); p.team = 0; if (jl.game) { if (jl.gone[p.name]) p.team = 1; delete jl.gone[p.name]; joinLive(jl, p); return; }
      p.ready = false; jl.players.push(p); p.lobby = jl; tell(jl);
    } else if (!l) return;
    else if (m.t === 'leave') { leave(p); send(p, { t: 'lobby', code: '', you: p.id, host: 0, map: 0, diff: 1, state: 'lobby', players: [] }); }
    else if (m.t === 'ready') { p.ready = !!m.v; tell(l); }
    else if (m.t === 'team' && !l.game) { p.team = m.v ? 1 : 0; tell(l); }
    else if (m.t === 'set' && l.host === p.id && !l.game) { if (validMap(m.map)) l.map = m.map; if (m.diff >= 0 && m.diff < DIFFS.length) l.diff = m.diff | 0; tell(l); }
    else if (m.t === 'start' && l.host === p.id && !l.game) { if (l.players.every(x => x.ready || x.id === l.host)) begin(l); else send(p, { t: 'err', msg: 'Not everyone is ready.' }); }
  });
  ws.on('close', () => leave(p)); ws.on('error', () => leave(p));
  send(p, { t: 'lobby', code: '', you: p.id, host: 0, map: 0, diff: 1, state: 'lobby', players: [] });
});
setInterval(() => { for (const ws of wss.clients) { const any = ws as any; if (any.dead) { ws.terminate(); continue; } any.dead = true; ws.ping(); ws.once('pong', () => { any.dead = false; }); } }, 20000);
http.listen(PORT, () => console.log(`Ore Else server on http://localhost:${PORT}`));
