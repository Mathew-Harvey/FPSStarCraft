// The match server on its own, with plain WebSocket clients and no browser: lobbies, sides, dropping out and coming back,
// and junk input. Run with: npm run build && node test/server.mjs
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url); const WebSocket = require('ws');
const PORT = 8141, WS = `ws://localhost:${PORT}/ws`;
const srv = spawn('node', ['dist/server.mjs'], { env: { ...process.env, PORT: String(PORT) }, stdio: ['ignore', 'pipe', 'pipe'] });
let srvLog = ''; srv.stdout.on('data', d => { srvLog += d; }); srv.stderr.on('data', d => { srvLog += d; });
const fail = []; const check = (ok, what) => { console.log((ok ? 'PASS ' : 'FAIL ') + what); if (!ok) fail.push(what); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
/** One player: keeps every message, and can wait for one that matches. */
function client(name) {
  return new Promise((res, rej) => {
    const ws = new WebSocket(WS), c = { ws, name, got: [], send: o => ws.send(JSON.stringify(o)), close: () => ws.close(),
      wait: (fn, ms = 8000) => new Promise((ok, no) => { const t0 = Date.now(), tick = () => { const m = c.got.find(fn); if (m) return ok(m); if (Date.now() - t0 > ms) return no(new Error(name + ' timed out')); setTimeout(tick, 30); }; tick(); }),
      last: t => [...c.got].reverse().find(m => m.t === t) };
    ws.on('message', d => { try { c.got.push(JSON.parse(String(d))); } catch (e) { /* not ours */ } });
    ws.on('open', () => res(c)); ws.on('error', rej);
  });
}
try {
  await sleep(1200);
  const A = await client('Ada'), V = await client('Vex');
  A.send({ t: 'create', name: 'Ada' }); const lob = await A.wait(m => m.t === 'lobby' && m.code); const code = lob.code;
  V.send({ t: 'join', code, name: 'Vex' }); await V.wait(m => m.t === 'lobby' && m.code === code);
  V.send({ t: 'team', v: 1 }); await A.wait(m => m.t === 'lobby' && m.players.some(p => p.name === 'Vex' && p.team === 1));
  // junk from a client must not take the server down
  for (const junk of ['nonsense', '{"t":"set","map":"x","diff":{}}', '{"t":"in","me":[1e309,"a"],"c":[["dm",1,"x"],["pl",null],["mn",-1,1e9],[]]}', '[]', 'null', '{"t":"start"}']) V.ws.send(junk);
  V.send({ t: 'set', map: 2 }); await sleep(300);
  check(A.last('lobby').map === 0, 'only the host can change the map');
  A.send({ t: 'set', map: 21 }); await sleep(200); const big = A.last('lobby').map; A.send({ t: 'set', map: 99 }); await sleep(200);
  check(big === 21 && A.last('lobby').map === 21, 'the host can pick a large map, and a map number that does not exist is refused');
  A.send({ t: 'set', map: 0 }); await sleep(200);
  A.send({ t: 'start' }); await A.wait(m => m.t === 'err');
  check(!A.got.some(m => m.t === 'begin'), 'the shift does not start until the crew is ready');
  V.send({ t: 'ready', v: true }); await A.wait(m => m.t === 'lobby' && m.players.every(p => p.ready || p.id === m.host));
  A.send({ t: 'start' }); const bA = await A.wait(m => m.t === 'begin'), bV = await V.wait(m => m.t === 'begin');
  check(bA.team === 0 && bV.team === 1 && bA.unit && bV.unit, 'the match starts with Ada for Ironhold and Vex for the Veyl, each with a body');
  await A.wait(m => m.t === 's'); V.send({ t: 'in', me: null, c: [['dm', 1, 'x'], ['pl', null], ['mn', -1, 1e9], ['zz'], 'x', null] }); await sleep(400);
  const r1 = await fetch(`http://localhost:${PORT}/healthz`).then(r => r.text(), () => '');
  check(/^ok 1 lobbies/.test(r1), 'junk commands in a running match leave the server up (' + r1 + ')');
  // A doctored client cannot run faster than its body: thirty position reports in one burst, each 3.5 m further on, used to be taken whole.
  { const at = () => A.last('s').u.find(r => r[0] === bA.unit), p0 = at(); for (let i = 1; i <= 30; i++) A.send({ t: 'in', me: [p0[3] + 2.5 * i, p0[4] + 2.5 * i, 0, 0, 0], c: [] });
    await sleep(500); const p1 = at(), went = Math.hypot(p1[3] - p0[3], p1[4] - p0[4]);
    check(went > 2 && went < 30, `a body that reports 106 m of running in half a second is held to its own speed (it got ${went.toFixed(1)} m)`); }
  // Vex drops out and comes back with the same name: still on the Veyl side
  V.close(); await A.wait(m => m.t === 'lobby' && m.players.length === 1);
  const V2 = await client('Vex again'); V2.send({ t: 'join', code, name: 'Vex' }); const b2 = await V2.wait(m => m.t === 'begin');
  const s2 = await V2.wait(m => m.t === 's'), body = s2.u.find(r => r[0] === b2.unit);
  check(b2.team === 1 && body && body[2] === 1, 'a Veyl player who reconnects comes back as the Veyl, in a Veyl body');
  // somebody new who joins late goes to Ironhold
  const L = await client('Lou'); L.send({ t: 'join', code, name: 'Lou' }); const bL = await L.wait(m => m.t === 'begin');
  check(bL.team === 0, 'a late joiner with a new name works for Ironhold');
  // leaving mid-match: the player is told they are out, and the match carries on for the others
  L.send({ t: 'leave' }); await L.wait(m => m.t === 'lobby' && !m.code); const n0 = A.got.length; await sleep(600);
  check(A.got.length > n0 && A.last('lobby').players.length === 2, 'a player who quits mid-match leaves the lobby and the shift carries on');
  for (const c of [A, V2, L]) c.close();
} catch (e) { console.log('ERROR', e.message); fail.push('exception'); }
srv.kill(); if (/crash|bad command|TypeError/i.test(srvLog)) { console.log(srvLog.slice(0, 1500)); }
check(!/match crashed/.test(srvLog), 'no match crashed on the server');
console.log(fail.length ? `\n${fail.length} FAILED` : '\nall server checks passed'); process.exit(fail.length ? 1 : 0);
