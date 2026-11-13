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
import { Match, Seat, Replay, playBack, cleanRules, type Rules } from '../src/match';
import { RankStore, Queue, RANKED_MAPS } from './ranked';
import { usePlan, parsePlan, checkPlan, planMap } from '../src/mapcode';
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
/** A ranked lobby: made by the queue for two players, started at once, rated at the end. */
interface RankedGame { home: string; out: string; keys: Record<string, string>; done: boolean; /** Players whose connection dropped, by name: when they lose the match if they have not come back (ms). */ away: Record<string, number> }
interface Lobby { /** Custom-game rules (start ore and Flux, speed), or null for the usual. */ rules: Rules | null; /** Ticks owed to a match running faster than normal. */ carry: number; ranked?: RankedGame; /** A made map's code (mapcode.ts), or '' for the map as it comes. */ plan: string; /** A team game or free-for-all (see TeamPlan); unset for a one-on-one. */ mt?: TeamPlan | null; code: string; host: number; map: number; diff: number; /** Who holds each end, as a match code: yard faction * 3 + outpost faction (see setSidesCode). 1 and 2 are Ironhold against the Veyl or the Gloam. */ out: number; players: Player[]; match: Match | null; /** Sides of players who dropped out of the running match, by name, so a Veyl player who reconnects sings for the Veyl again. */ gone: Record<string, number> }
const lobbies = new Map<string, Lobby>(); let nextPid = 1;
const send = (p: Player, o: any) => { if (p.ws.readyState === 1) p.ws.send(typeof o === 'string' ? o : JSON.stringify(o)); };
const say = (s: Seat, o: any) => send(s as Player, o);
const cleanName = (s: any) => String(s || '').replace(/[^\w \-'.]/g, '').trim().slice(0, 14) || 'Rigger';
const playing = (l: Lobby) => l.players.filter(p => p.team >= 0), watching = (l: Lobby) => l.players.filter(p => p.team < 0);
/** Puts this lobby's map, ends and sides into the shared rules (one server runs many matches; a running match does this itself, see Match.run). */
function use(l: Lobby) { usePlan(l.plan || null); setMap(l.map); setSidesCode(l.out); setTeamGame(l.mt || null); }
function newCode() { const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ'; for (;;) { let c = ''; for (let i = 0; i < 5; i++) c += A[Math.floor(Math.random() * A.length)]; if (!lobbies.has(c)) return c; } }
function tell(l: Lobby) { for (const p of l.players) send(p, { t: 'lobby', code: l.code, you: p.id, host: l.host, map: l.map, diff: l.diff, out: l.out, plan: l.plan, mt: l.mt || null, rules: l.rules, ranked: l.ranked ? 1 : 0, state: l.match ? 'play' : 'lobby', players: l.players.map(x => ({ id: x.id, name: x.name, ready: x.ready, team: x.team })) }); }

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
function leave(p: Player, quit = false) {
  queue.drop(p);
  const l = p.lobby; if (!l) return;
  // Leaving a ranked match on purpose loses it. A dropped connection has AWAY_MS to come back first (see awayCheck).
  if (l.ranked && l.match && !l.ranked.done && p.team >= 0) { if (quit) forfeit(l, p.name); else l.ranked.away[p.name] = Date.now() + AWAY_MS; }
  p.lobby = null;
  l.players = l.players.filter(x => x !== p);
  if (l.match) { l.match.leave(p); if (p.team > 0 || (p.team >= 0 && p.team !== SIDE.home)) l.gone[p.name] = p.team; }
  if (!playing(l).length) { if (l.match) { const id = keep(l, 'left'); for (const w of watching(l)) send(w, { t: 'over', won: false, stats: [0, 0, 0, 0, 0], time: l.match.g.time, replay: id, left: 1 }); } lobbies.delete(l.code); for (const w of watching(l)) { w.lobby = null; send(w, { t: 'lobby', code: '', you: w.id, host: 0, map: 0, diff: 1, state: 'lobby', players: [] }); } return; }
  if (l.host === p.id) l.host = playing(l)[0].id;
  tell(l);
}
function begin(l: Lobby) {
  l.map = rollMap(l.map);   // a Vast map is turned a new way for every match, so nobody knows where the far base is
  l.gone = {};
  l.carry = 0;
  l.match = new Match({ map: l.map, plan: l.plan || '', diff: l.diff, out: l.out, mt: l.mt || null, rules: l.rules, seed: (Math.random() * 2 ** 32) >>> 0, clock: Date.now() }, [...l.players], say, BUILD);
  tell(l);
}
/** A player arrives while the match is running: a late start, coming back after a dropped connection, or somebody come to watch. */
function joinLive(l: Lobby, p: Player) { l.players.push(p); p.lobby = l; p.ready = true; l.match!.join(p); tell(l); }
function step(l: Lobby) {
  const m = l.match!;
  if (m.step()) {
    const g = m.g, st = g.stats, id = keep(l, 'over'), R = l.ranked, rank = R && !R.done ? store.result(g.won ? R.home : R.out, g.won ? R.out : R.home, R.keys) : null; if (R) R.done = true;
    for (const p of l.players) { send(p, { t: 'over', won: multi() ? g.winners.some(t => isFriend(t, p.team)) : g.won, mine: multi() ? 1 : 0, stats: [Math.floor(st.mined), st.built, st.kills, st.lost, Math.floor(st.minedV)], time: g.time, replay: id, rank: rank?.[p.name] || null }); p.unit = null; p.ready = false; }
    l.match = null; tell(l); return true;
  }
  return false;
}
/** Ends a ranked match early: `loser` left it, or did not come back in time. The other player wins and both are rated. */
function forfeit(l: Lobby, loser: string) {
  const R = l.ranked, m = l.match; if (!R || !m || R.done) return; R.done = true;
  const winner = loser === R.home ? R.out : R.home, rank = store.result(winner, loser, R.keys), g = m.g, st = g.stats, id = keep(l, 'left');
  for (const p of l.players) { if (p.name === loser && p.team >= 0) continue; send(p, { t: 'over', won: p.name === winner, mine: 1, stats: [Math.floor(st.mined), st.built, st.kills, st.lost, Math.floor(st.minedV)], time: g.time, replay: id, rank: rank[p.name] ? { ...rank[p.name], left: loser } : null, forfeit: loser }); p.unit = null; p.ready = false; }
  for (const p of l.players) if (p.name === loser && p.team >= 0) send(p, { t: 'over', won: false, mine: 1, stats: [0, 0, 0, 0, 0], time: g.time, replay: id, rank: rank[p.name] ? { ...rank[p.name], left: loser } : null, forfeit: loser });
  l.match = null; tell(l);
}
setInterval(() => { for (const l of lobbies.values()) { if (l.match) { try { l.carry += l.rules?.speed || 1; while (l.carry >= 1 && l.match) { l.carry--; if (step(l)) break; } } catch (e) { console.error('match crashed', l.code, e); keep(l, 'stopped'); l.match = null; for (const p of l.players) send(p, { t: 'err', msg: 'The match hit a fault on the server and had to stop. Sorry.' }); tell(l); } } } }, TICK * 1000);

// ---------------------------------------------------------------- ranked play
const AWAY_MS = +(process.env.RANK_AWAY_MS || 30000);
const store = new RankStore(process.env.RANK_FILE || ''), queue = new Queue<Player>();
/** Starts a ranked match for two players the queue paired. Who holds which end is a coin toss; each plays the faction they asked for. */
function rankedMatch(a: Player, af: number, ak: string, b: Player, bf: number, bk: string) {
  if (Math.random() < .5) [a, af, ak, b, bf, bk] = [b, bf, bk, a, af, ak];
  if (a.lobby) leave(a); if (b.lobby) leave(b);
  const l: Lobby = { code: newCode(), host: a.id, map: RANKED_MAPS[Math.floor(Math.random() * RANKED_MAPS.length)], plan: '', diff: 1, out: af * 3 + bf, players: [a, b], match: null, gone: {}, rules: null, carry: 0,
    ranked: { home: a.name, out: b.name, keys: { [a.name]: ak, [b.name]: bk }, done: false, away: {} } };
  lobbies.set(l.code, l); use(l); a.team = SIDE.home; b.team = SIDE.out;
  for (const [p, q] of [[a, b], [b, a]]) { p.lobby = l; p.ready = true; send(p, { t: 'matched', code: l.code, foe: q.name, foeRating: store.me(q.name)?.rating ?? 1500 }); }
  begin(l);
}
/** Once a second: pair the queue, and settle ranked matches a dropped player did not come back to. */
setInterval(() => {
  const now = Date.now();
  for (const [a, b] of queue.pairs(now)) { try { rankedMatch(a.who, a.fac, a.key, b.who, b.fac, b.key); } catch (e) { console.error('could not start a ranked match', e); } }
  for (const w of queue.list) send(w.who, { t: 'queued', waited: Math.floor((now - w.since) / 1000), n: queue.list.length });
  for (const l of lobbies.values()) if (l.ranked && l.match && !l.ranked.done) for (const [name, t] of Object.entries(l.ranked.away)) if (now > t) { delete l.ranked.away[name]; forfeit(l, name); }
  store.roll();
}, 1000);
function onQueue(p: Player, m: any) {
  if (p.lobby && p.lobby.match && !p.lobby.ranked?.done) { send(p, { t: 'err', msg: 'Finish or leave this match first.' }); return; }
  const name = cleanName(m.name), key = String(m.key || '').slice(0, 64), fac = [0, 1, 2].includes(m.fac) ? m.fac : 0, c = store.claim(name, key);
  if (!c.ok) { send(p, { t: 'err', msg: `Somebody already plays ranked as ${name}. Pick another name, or play from the browser you played ranked on before.` }); return; }
  p.name = name;
  // Back from a dropped connection: straight back into the ranked match they were in.
  for (const l of lobbies.values()) if (l.ranked && l.match && !l.ranked.done && l.ranked.away[name] !== undefined && l.ranked.keys[name] === (c.key || key)) {
    delete l.ranked.away[name]; if (p.lobby) leave(p); p.team = name === l.ranked.home ? SIDE.home : SIDE.out; delete l.gone[name]; joinLive(l, p); return;
  }
  if (p.lobby) leave(p);
  const r = store.rating(name).r; queue.add({ who: p, name, key: c.key || key, r, fac, since: Date.now() });
  send(p, { t: 'queued', waited: 0, n: queue.list.length, key: c.key || key, me: store.me(name), ...store.info() });
}
const escH = (s: string) => s.replace(/[<>&"]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' } as any)[c]);
function boardPage() {
  const rows = store.board(100), info = store.info(), ends = new Date(info.ends).toUTCString().slice(5, 16);
  const tr = (r: ReturnType<typeof store.board>[number]) => `<tr${r.provisional ? ' class="p"' : ''}><td>${r.place}</td><td>${escH(r.name)}</td><td>${r.rating}${r.provisional ? ' ?' : ''}</td><td>${r.wins}-${r.games - r.wins}</td></tr>`;
  const past = store.data.past.slice(-3).reverse().map(s => `<h2>Season ${s.season}</h2><table><tr><th>#</th><th>Name</th><th>Rating</th><th>Won-lost</th></tr>${s.top.slice(0, 10).map(tr).join('')}</table>`).join('');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Ore Else ranked</title><style>
:root{--bg:#16130f;--fg:#efe3cc;--dim:#a99a80;--line:#3a3127;--hi:#f2a33a}
@media (prefers-color-scheme: light){:root{--bg:#f4ecdc;--fg:#2a2118;--dim:#6d5f4a;--line:#d8c9ad;--hi:#b0640c}}
body{margin:0;background:var(--bg);color:var(--fg);font:16px/1.5 system-ui,sans-serif}main{max-width:640px;margin:0 auto;padding:24px 16px}
h1{font-size:28px;margin:0 0 4px}h2{font-size:18px;margin:28px 0 8px}p{color:var(--dim);margin:0 0 16px}table{width:100%;border-collapse:collapse}
th,td{text-align:left;padding:6px 8px;border-bottom:1px solid var(--line)}th{color:var(--dim);font-weight:600;font-size:13px}td:first-child,th:first-child{width:3em;color:var(--dim)}
tr.p td{color:var(--dim)}tr:first-child+tr td:nth-child(2){color:var(--hi);font-weight:700}a{color:var(--hi)}</style></head><body><main>
<h1>Ranked one-on-one</h1><p>Season ${info.season}, ends ${ends}. A rating with a question mark is still settling: it needs a few more games.</p>
<table><tr><th>#</th><th>Name</th><th>Rating</th><th>Won-lost</th></tr>${rows.map(tr).join('') || '<tr><td></td><td colspan="3">Nobody has played a ranked match this season yet.</td></tr>'}</table>${past}
<p style="margin-top:24px"><a href="/">Back to the game</a></p></main></body></html>`;
}

const http = createServer((req, res) => {
  const [url, qs] = (req.url || '/').split('?');
  if (url === '/leaderboard') { res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-cache' }); res.end(boardPage()); return; }
  if (url === '/leaderboard.json') { const name = new URLSearchParams(qs || '').get('name'); res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-cache', 'access-control-allow-origin': '*' }); res.end(JSON.stringify({ ...store.info(), top: store.board(100), me: name ? store.me(cleanName(name)) : null, waiting: queue.list.length })); return; }
  if (url === '/healthz') { res.writeHead(200, { 'content-type': 'text/plain' }); res.end(`ok ${lobbies.size} lobbies\ndropped hit claims: ${JSON.stringify(dropped)}\nbuild ${BUILD}`); return; }
  // Replays: /replays lists them, newest first; /replays/<id> is the file, as gzipped JSON.
  if (url === '/replays') { res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-cache', 'access-control-allow-origin': '*' }); res.end(JSON.stringify([...replays.values()].map(r => r.info).reverse())); return; }
  { const m = /^\/replays\/([\w-]{1,60})$/.exec(url); if (m) { const r = replays.get(m[1]); if (!r) { res.writeHead(404, { 'content-type': 'text/plain' }); res.end('No replay with that name. The server keeps the last 40.'); return; }
    res.writeHead(200, { 'content-type': 'application/json', 'content-encoding': 'gzip', 'content-disposition': `attachment; filename="ore-else-${m[1]}.json"`, 'access-control-allow-origin': '*' }); res.end(r.gz); return; } }
  // The replay player the page starts beside itself (src/replay-worker.ts).
  if (url === '/replay-worker.js') { const f = [join(here, 'replay-worker.js'), join(here, '..', 'dist', 'replay-worker.js')].find(existsSync); if (!f) { res.writeHead(404); res.end(); return; } res.writeHead(200, { 'content-type': 'text/javascript', 'cache-control': 'no-cache' }); res.end(readFileSync(f)); return; }
  // The art the page fetches as a match needs it (src/artfiles.ts), from art/ beside the page.
  if (url.startsWith('/art/')) { const name = url.slice(5), f = pagePath ? join(dirname(pagePath), 'art', name) : ''; if (!/^[\w.-]+\.(wasm|webp)$/.test(name) || !f || !existsSync(f)) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'content-type': name.endsWith('.webp') ? 'image/webp' : 'application/wasm', 'cache-control': 'public, max-age=31536000, immutable' }); res.end(readFileSync(f)); return; }
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
    if (m.t === 'queue') { onQueue(p, m); return; }
    if (m.t === 'unqueue') { if (queue.drop(p)) send(p, { t: 'queued', off: 1 }); return; }
    if (m.t === 'create') {
      if (l) leave(p); if (lobbies.size >= MAX_LOBBIES) { send(p, { t: 'err', msg: 'The server is full. Try again in a few minutes.' }); return; }
      p.name = cleanName(m.name); p.ready = false; p.team = 0; const nl: Lobby = { code: newCode(), host: p.id, map: 0, plan: '', diff: 1, out: 1, players: [p], match: null, gone: {}, rules: null, carry: 0 }; lobbies.set(nl.code, nl); p.lobby = nl; tell(nl);
    } else if (m.t === 'join') {
      if (l) leave(p); const jl = lobbies.get(String(m.code || '').toUpperCase().trim());
      if (!jl) { send(p, { t: 'err', msg: 'No lobby with that code. Check the five letters.' }); return; }
      const watch = !!m.watch;
      if (watch ? watching(jl).length >= MAX_WATCHERS : playing(jl).length >= (jl.mt ? MAX_TEAM_PLAYERS : MAX_PLAYERS)) { send(p, { t: 'err', msg: watch ? 'That lobby has as many people watching as it can take.' : 'That lobby is full. You can still join it to watch.' }); return; }
      // A ranked match takes no new players: only the two it was made for, coming back (with their key), and people watching.
      if (jl.ranked && !watch) { const n = cleanName(m.name); if (!jl.match || jl.ranked.done || jl.ranked.away[n] === undefined || jl.ranked.keys[n] !== String(m.key || '')) { send(p, { t: 'err', msg: 'That is a ranked match. If it is yours, open Ranked and press Find a match to get back in. Anyone can join it to watch.' }); return; } delete jl.ranked.away[n]; }
      queue.drop(p); p.name = cleanName(m.name); use(jl); p.team = watch ? -1 : SIDE.home;
      if (jl.match) { if (!watch && jl.gone[p.name] !== undefined) p.team = jl.gone[p.name]; delete jl.gone[p.name]; joinLive(jl, p); return; }
      p.ready = false; jl.players.push(p); p.lobby = jl; tell(jl);
    } else if (!l) return;
    else if (m.t === 'leave') { leave(p, true); send(p, { t: 'lobby', code: '', you: p.id, host: 0, map: 0, diff: 1, state: 'lobby', players: [] }); }
    else if (m.t === 'ready') { p.ready = !!m.v; tell(l); }
    else if (l.ranked && (m.t === 'team' || m.t === 'set' || m.t === 'start')) send(p, { t: 'err', msg: 'Ranked matches are set up by the queue. Find another from the Ranked menu.' });
    else if (m.t === 'team' && !l.match) {
      use(l); const [H, O] = [SIDE.home, SIDE.out], t = l.mt ? planTeams(l.mt) : null;
      if (m.v === 2) { if (p.id !== l.host && watching(l).length < MAX_WATCHERS) p.team = -1; }   // watch instead of play (the host always plays)
      else if (p.team < 0 && playing(l).length >= (l.mt ? MAX_TEAM_PLAYERS : MAX_PLAYERS)) send(p, { t: 'err', msg: 'Every seat in this lobby is taken.' });
      // In a team game the player names a start (m.s); in a one-on-one, the far end (m.v) or the yard.
      else if (t) { const i = t.at.indexOf(m.s | 0); p.team = i >= 0 ? t.teams[i] : p.team < 0 ? H : p.team; }
      else p.team = m.v ? O : H;
      tell(l);
    }
    else if (m.t === 'set' && l.host === p.id && !l.match) { if (m.rules !== undefined) l.rules = m.rules === null ? null : cleanRules(m.rules, l.rules); if (validMap(m.map)) { l.map = m.map % 100; l.plan = ''; }
      // A made map: only one that passes the fairness check is taken. The check lays the map out, so the plan is put away again after.
      if (typeof m.plan === 'string') { const P = parsePlan(m.plan); if (P && checkPlan(P).ok) { l.plan = m.plan; l.map = planMap(P); } else send(p, { t: 'err', msg: 'That made map did not pass the fairness check.' }); usePlan(null); } if (m.diff >= 0 && m.diff < DIFFS.length) l.diff = m.diff | 0; if (Number.isInteger(m.out) && m.out >= 0 && m.out < 9) { const [, O0] = setSidesCode(l.out); l.out = m.out; const [H1, O1] = setSidesCode(l.out); for (const x of l.players) if (x.team >= 0) x.team = x.team === O0 ? O1 : H1; }
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
