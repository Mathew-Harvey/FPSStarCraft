// Ore Else match server. One Node process serves the game page, keeps the lobbies and runs every match.
// The match itself is the same simulation the browser runs offline, stepped here so that no player is the host (src/match.ts).
// Every match is recorded: the setup and every player's input, so it can be played back to the same end (a replay).
import { noHud, noPipe } from './shim';
import { createServer } from 'node:http';
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createHash } from 'node:crypto';
import { gzipSync, gunzipSync } from 'node:zlib';
import { WebSocketServer, WebSocket } from 'ws';
import { initHeadless } from '../src/gfx';
import { DIFFS, SIDE, setMap, setSidesCode, setTeamGame, fac, validMap, rollMap } from '../src/data';
import { planTeams, multi, isFriend, type TeamPlan } from '../src/core/sides';
import { WIRE } from '../src/netgame';
import { dropped } from '../src/net-arms';
import { Match, Seat, Replay, playBack } from '../src/match';
void noHud; void noPipe;   // the shim's stand-ins: importing it is what matters, it gives the game a page to call into

initHeadless();
if (process.env.ORE_TRUST_HITS === '1') { WIRE.trustHits = true; console.log('test server: hit claims are not checked (ORE_TRUST_HITS)'); }
if (process.env.ORE_WIRE_FOG === '0') { WIRE.fog = false; console.log('test server: every side is sent the whole world (ORE_WIRE_FOG=0)'); }
const here = dirname(fileURLToPath(import.meta.url));
/** Which build of the rules this is: a replay names it, so playing one on different rules says so. */
const BUILD = (() => { try { return createHash('sha1').update(readFileSync(fileURLToPath(import.meta.url))).digest('hex').slice(0, 10); } catch (e) { return 'dev'; } })();

// node dist/server.mjs --check-replay <file>: plays a saved replay with nobody connected and says whether it ends in the same world.
{ const i = process.argv.indexOf('--check-replay'); if (i > 0) {
  const f = process.argv[i + 1], raw = readFileSync(f), rec: Replay = JSON.parse(String(raw[0] === 0x1f ? gunzipSync(raw) : raw));
  const t0 = Date.now(), r = playBack(rec), same = !!rec.end && r.hash === rec.end.hash && r.match.tick === rec.end.tick;
  console.log(JSON.stringify({ file: f, ticks: r.match.tick, hash: r.hash, recorded: rec.end?.hash ?? null, same, drift: r.drift, won: r.match.g.phase === 'over' ? !!r.match.g.won : null, ms: Date.now() - t0, build: rec.build === BUILD ? 'same' : rec.build }));
  process.exit(same && r.drift < 0 ? 0 : 1);
} }

const PORT = +(process.env.PORT || 8080), TICK = 1 / 30, MAX_PLAYERS = 4, MAX_TEAM_PLAYERS = 8, MAX_WATCHERS = 4, MAX_LOBBIES = 40;
const pagePath = [join(here, 'index.html'), join(here, '..', 'dist', 'index.html')].find(existsSync) || '';
let page = pagePath ? readFileSync(pagePath) : Buffer.from('Ore Else server is running, but the game page was not built. Run npm run build.');

/** A connection. In a lobby `team` is the side they will play, or -1 to watch. */
interface Player extends Seat { ready: boolean; ws: WebSocket; lobby: Lobby | null; alive: boolean }
interface Lobby { /** A team game or free-for-all (see TeamPlan); unset for a one-on-one. */ mt?: TeamPlan | null; code: string; host: number; map: number; diff: number; /** Who holds each end, as a match code: yard faction * 3 + outpost faction (see setSidesCode). 1 and 2 are Ironhold against the Veyl or the Gloam. */ out: number; players: Player[]; match: Match | null; /** Sides of players who dropped out of the running match, by name, so a Veyl player who reconnects sings for the Veyl again. */ gone: Record<string, number> }
const lobbies = new Map<string, Lobby>(); let nextPid = 1;
const send = (p: Player, o: any) => { if (p.ws.readyState === 1) p.ws.send(typeof o === 'string' ? o : JSON.stringify(o)); };
const say = (s: Seat, o: any) => send(s as Player, o);
const cleanName = (s: any) => String(s || '').replace(/[^\w \-'.]/g, '').trim().slice(0, 14) || 'Rigger';
const playing = (l: Lobby) => l.players.filter(p => p.team >= 0), watching = (l: Lobby) => l.players.filter(p => p.team < 0);
/** Puts this lobby's map, ends and sides into the shared rules (one server runs many matches; a running match does this itself, see Match.run). */
function use(l: Lobby) { setMap(l.map); setSidesCode(l.out); setTeamGame(l.mt || null); }
function newCode() { const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ'; for (;;) { let c = ''; for (let i = 0; i < 5; i++) c += A[Math.floor(Math.random() * A.length)]; if (!lobbies.has(c)) return c; } }
function tell(l: Lobby) { for (const p of l.players) send(p, { t: 'lobby', code: l.code, you: p.id, host: l.host, map: l.map, diff: l.diff, out: l.out, mt: l.mt || null, state: l.match ? 'play' : 'lobby', players: l.players.map(x => ({ id: x.id, name: x.name, ready: x.ready, team: x.team })) }); }

// ---------------------------------------------------------------- replays
// Kept in memory (the last 40), and written to REPLAY_DIR as <id>.json.gz when that is set.
const REPLAY_DIR = process.env.REPLAY_DIR || '';
interface ReplayInfo { id: string; at: string; map: number; out: number; diff: number; names: string[]; ticks: number; won: boolean | null; why: string }
const replays = new Map<string, { info: ReplayInfo; gz: Buffer }>();
if (REPLAY_DIR) { mkdirSync(REPLAY_DIR, { recursive: true }); for (const f of readdirSync(REPLAY_DIR).filter(f => f.endsWith('.json.gz')).sort().slice(-40)) { try { const gz = readFileSync(join(REPLAY_DIR, f)), r: Replay = JSON.parse(String(gunzipSync(gz))); replays.set(f.slice(0, -8), { info: infoOf(f.slice(0, -8), r), gz }); } catch (e) { console.warn('could not read replay', f); } } }
function infoOf(id: string, r: Replay): ReplayInfo { return { id, at: r.at, map: r.setup.map, out: r.setup.out, diff: r.setup.diff, names: r.seats.map(s => s.name), ticks: r.end?.tick ?? 0, won: r.end?.won ?? null, why: r.end?.why ?? '' }; }
function keep(l: Lobby, why: 'over' | 'left' | 'stopped') {
  const m = l.match; if (!m) return ''; let rec: Replay; try { rec = m.finish(why); } catch (e) { console.error('could not close the replay', e); return ''; }
  if (m.tick < 30) return '';   // under a second: nothing to watch
  const id = new Date(m.setup.clock).toISOString().replace(/[-:]/g, '').slice(0, 15) + '-' + l.code + '-' + m.setup.seed.toString(36).slice(0, 4), gz = gzipSync(JSON.stringify(rec));
  replays.set(id, { info: infoOf(id, rec), gz }); while (replays.size > 40) replays.delete(replays.keys().next().value!);
  if (REPLAY_DIR) try { writeFileSync(join(REPLAY_DIR, id + '.json.gz'), gz); } catch (e) { console.error('could not save replay', id, e); }
  return id;
}

// ---------------------------------------------------------------- lobbies and matches
function leave(p: Player) {
  const l = p.lobby; if (!l) return; p.lobby = null;
  l.players = l.players.filter(x => x !== p);
  if (l.match) { l.match.leave(p); if (p.team > 0 || (p.team >= 0 && p.team !== SIDE.home)) l.gone[p.name] = p.team; }
  if (!playing(l).length) { if (l.match) { const id = keep(l, 'left'); for (const w of watching(l)) send(w, { t: 'over', won: false, stats: [0, 0, 0, 0, 0], time: l.match.g.time, replay: id, left: 1 }); } lobbies.delete(l.code); for (const w of watching(l)) { w.lobby = null; send(w, { t: 'lobby', code: '', you: w.id, host: 0, map: 0, diff: 1, state: 'lobby', players: [] }); } return; }
  if (l.host === p.id) l.host = playing(l)[0].id;
  tell(l);
}
function begin(l: Lobby) {
  l.map = rollMap(l.map);   // a Vast map is turned a new way for every match, so nobody knows where the far base is
  l.gone = {};
  l.match = new Match({ map: l.map, diff: l.diff, out: l.out, mt: l.mt || null, seed: (Math.random() * 2 ** 32) >>> 0, clock: Date.now() }, [...l.players], say, BUILD);
  tell(l);
}
/** A player arrives while the match is running: a late start, coming back after a dropped connection, or somebody come to watch. */
function joinLive(l: Lobby, p: Player) { l.players.push(p); p.lobby = l; p.ready = true; l.match!.join(p); tell(l); }
function step(l: Lobby) {
  const m = l.match!;
  if (m.step()) {
    const g = m.g, st = g.stats, id = keep(l, 'over');
    for (const p of l.players) { send(p, { t: 'over', won: multi() ? g.winners.some(t => isFriend(t, p.team)) : g.won, mine: multi() ? 1 : 0, stats: [Math.floor(st.mined), st.built, st.kills, st.lost, Math.floor(st.minedV)], time: g.time, replay: id }); p.unit = null; p.ready = false; }
    l.match = null; tell(l);
  }
}
setInterval(() => { for (const l of lobbies.values()) { if (l.match) { try { step(l); } catch (e) { console.error('match crashed', l.code, e); keep(l, 'stopped'); l.match = null; for (const p of l.players) send(p, { t: 'err', msg: 'The match hit a fault on the server and had to stop. Sorry.' }); tell(l); } } } }, TICK * 1000);

const http = createServer((req, res) => {
  const url = (req.url || '/').split('?')[0];
  if (url === '/healthz') { res.writeHead(200, { 'content-type': 'text/plain' }); res.end(`ok ${lobbies.size} lobbies\ndropped hit claims: ${JSON.stringify(dropped)}\nbuild ${BUILD}`); return; }
  // Replays: /replays lists them, newest first; /replays/<id> is the file, as gzipped JSON.
  if (url === '/replays') { res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-cache', 'access-control-allow-origin': '*' }); res.end(JSON.stringify([...replays.values()].map(r => r.info).reverse())); return; }
  { const m = /^\/replays\/([\w-]{1,60})$/.exec(url); if (m) { const r = replays.get(m[1]); if (!r) { res.writeHead(404, { 'content-type': 'text/plain' }); res.end('No replay with that name. The server keeps the last 40.'); return; }
    res.writeHead(200, { 'content-type': 'application/json', 'content-encoding': 'gzip', 'content-disposition': `attachment; filename="ore-else-${m[1]}.json"`, 'access-control-allow-origin': '*' }); res.end(r.gz); return; } }
  // The replay player the page starts beside itself (src/replay-worker.ts).
  if (url === '/replay-worker.js') { const f = [join(here, 'replay-worker.js'), join(here, '..', 'dist', 'replay-worker.js')].find(existsSync); if (!f) { res.writeHead(404); res.end(); return; } res.writeHead(200, { 'content-type': 'text/javascript', 'cache-control': 'no-cache' }); res.end(readFileSync(f)); return; }
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
    if (m.t === 'in') { if (l && l.match && p.team >= 0 && p.inbox.length < 30) p.inbox.push(m); return; }
    if (m.t === 'create') {
      if (l) leave(p); if (lobbies.size >= MAX_LOBBIES) { send(p, { t: 'err', msg: 'The server is full. Try again in a few minutes.' }); return; }
      p.name = cleanName(m.name); p.ready = false; p.team = 0; const nl: Lobby = { code: newCode(), host: p.id, map: 0, diff: 1, out: 1, players: [p], match: null, gone: {} }; lobbies.set(nl.code, nl); p.lobby = nl; tell(nl);
    } else if (m.t === 'join') {
      if (l) leave(p); const jl = lobbies.get(String(m.code || '').toUpperCase().trim());
      if (!jl) { send(p, { t: 'err', msg: 'No lobby with that code. Check the five letters.' }); return; }
      const watch = !!m.watch;
      if (watch ? watching(jl).length >= MAX_WATCHERS : playing(jl).length >= (jl.mt ? MAX_TEAM_PLAYERS : MAX_PLAYERS)) { send(p, { t: 'err', msg: watch ? 'That lobby has as many people watching as it can take.' : 'That lobby is full. You can still join it to watch.' }); return; }
      p.name = cleanName(m.name); use(jl); p.team = watch ? -1 : SIDE.home;
      if (jl.match) { if (!watch && jl.gone[p.name] !== undefined) p.team = jl.gone[p.name]; delete jl.gone[p.name]; joinLive(jl, p); return; }
      p.ready = false; jl.players.push(p); p.lobby = jl; tell(jl);
    } else if (!l) return;
    else if (m.t === 'leave') { leave(p); send(p, { t: 'lobby', code: '', you: p.id, host: 0, map: 0, diff: 1, state: 'lobby', players: [] }); }
    else if (m.t === 'ready') { p.ready = !!m.v; tell(l); }
    else if (m.t === 'team' && !l.match) {
      use(l); const [H, O] = [SIDE.home, SIDE.out], t = l.mt ? planTeams(l.mt) : null;
      if (m.v === 2) { if (p.id !== l.host && watching(l).length < MAX_WATCHERS) p.team = -1; }   // watch instead of play (the host always plays)
      else if (p.team < 0 && playing(l).length >= (l.mt ? MAX_TEAM_PLAYERS : MAX_PLAYERS)) send(p, { t: 'err', msg: 'Every seat in this lobby is taken.' });
      // In a team game the player names a start (m.s); in a one-on-one, the far end (m.v) or the yard.
      else if (t) { const i = t.at.indexOf(m.s | 0); p.team = i >= 0 ? t.teams[i] : p.team < 0 ? H : p.team; }
      else p.team = m.v ? O : H;
      tell(l);
    }
    else if (m.t === 'set' && l.host === p.id && !l.match) { if (validMap(m.map)) l.map = m.map % 100; if (m.diff >= 0 && m.diff < DIFFS.length) l.diff = m.diff | 0; if (Number.isInteger(m.out) && m.out >= 0 && m.out < 9) { const [, O0] = setSidesCode(l.out); l.out = m.out; const [H1, O1] = setSidesCode(l.out); for (const x of l.players) if (x.team >= 0) x.team = x.team === O0 ? O1 : H1; }
      // A team game: a plan that holds, or null for a one-on-one again. Anyone whose start went away goes to the yard.
      if (m.mt !== undefined && (m.mt === null || planTeams(m.mt))) { l.mt = m.mt; if (l.mt) { const t = planTeams(l.mt)!; l.out = fac(t.home) * 3 + fac(t.out); } use(l); const ok = l.mt ? planTeams(l.mt)!.teams : [SIDE.home, SIDE.out]; for (const x of l.players) if (x.team >= 0 && !ok.includes(x.team)) x.team = SIDE.home; }
      tell(l); }
    else if (m.t === 'start' && l.host === p.id && !l.match) { if (playing(l).every(x => x.ready || x.id === l.host)) begin(l); else send(p, { t: 'err', msg: 'Not everyone is ready.' }); }
  });
  ws.on('close', () => leave(p)); ws.on('error', () => leave(p));
  send(p, { t: 'lobby', code: '', you: p.id, host: 0, map: 0, diff: 1, state: 'lobby', players: [] });
});
setInterval(() => { for (const ws of wss.clients) { const any = ws as any; if (any.dead) { ws.terminate(); continue; } any.dead = true; ws.ping(); ws.once('pong', () => { any.dead = false; }); } }, 20000);
http.listen(PORT, () => console.log(`Ore Else server on http://localhost:${PORT}`));
