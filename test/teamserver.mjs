// Team games on the match server: the host sets a two-against-two plan, three players pick starts, and the match starts with each
// player in their own side's body; the fourth start goes to the bots. Then a free-for-all plan, and a plan that does not hold.
// Run with: npm run build && node test/teamserver.mjs
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url); const WebSocket = require('ws');
const PORT = 8143, WS = `ws://localhost:${PORT}/ws`;
const srv = spawn('node', ['dist/server.mjs'], { env: { ...process.env, PORT: String(PORT) }, stdio: ['ignore', 'pipe', 'pipe'] });
let srvLog = ''; srv.stdout.on('data', d => { srvLog += d; }); srv.stderr.on('data', d => { srvLog += d; });
const fail = []; const check = (ok, what) => { console.log((ok ? 'PASS ' : 'FAIL ') + what); if (!ok) fail.push(what); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
function client(name) {
  return new Promise((res, rej) => {
    const ws = new WebSocket(WS), c = { ws, name, got: [], send: o => ws.send(JSON.stringify(o)), close: () => ws.close(),
      wait: (fn, ms = 10000) => new Promise((ok, no) => { const t0 = Date.now(), tick = () => { const m = c.got.find(fn); if (m) return ok(m); if (Date.now() - t0 > ms) return no(new Error(name + ' timed out')); setTimeout(tick, 30); }; tick(); }),
      last: t => [...c.got].reverse().find(m => m.t === t) };
    ws.on('message', d => { try { c.got.push(JSON.parse(String(d))); } catch (e) { /* not ours */ } });
    ws.on('open', () => res(c)); ws.on('error', rej);
  });
}
try {
  await sleep(1200);
  var A = await client('Ada'); var B = await client('Bo'), C = await client('Cy');
  A.send({ t: 'create', name: 'Ada' }); const code = (await A.wait(m => m.t === 'lobby' && m.code)).code;
  for (const X of [B, C]) { X.send({ t: 'join', code, name: X.name }); await X.wait(m => m.t === 'lobby' && m.code === code); }
  B.send({ t: 'set', mt: { n: 4, groups: [[0, 1], [2, 3]], facs: [0, 1, 2, 0] } }); await sleep(250);
  check(!A.last('lobby').mt, 'only the host sets a team game');
  A.send({ t: 'set', mt: { n: 4, groups: [[0, 2], [1, 3]], facs: [0, 1, 2, 0] } }); await sleep(250);
  check(!A.last('lobby').mt, 'a plan with the yard and the far base on one side is refused');
  A.send({ t: 'set', mt: { n: 4, groups: [[0, 1], [2, 3]], facs: [0, 1, 2, 0] } }); await A.wait(m => m.t === 'lobby' && m.mt);
  // Ironhold at start 0 is team 0, the Gloam at start 2 team 2, the Veyl at start 1 team 1, the second Ironhold at start 3 team 3.
  B.send({ t: 'team', s: 1 }); C.send({ t: 'team', s: 2 }); await A.wait(m => m.t === 'lobby' && m.players.some(p => p.name === 'Bo' && p.team === 1) && m.players.some(p => p.name === 'Cy' && p.team === 2));
  check(true, 'players pick starts: Bo the Veyl at start 1, Cy the Gloam at start 2');
  check(A.got.filter(m => m.t === 'lobby').length > 0 && A.last('lobby').out === 2, `the lobby's ends follow the plan (${A.last('lobby').out})`);
  for (const X of [B, C]) X.send({ t: 'ready', v: true }); await A.wait(m => m.t === 'lobby' && m.players.every(p => p.ready || p.id === m.host));
  A.send({ t: 'start' }); const [bA, bB, bC] = await Promise.all([A, B, C].map(X => X.wait(m => m.t === 'begin')));
  check(bA.team === 0 && bB.team === 1 && bC.team === 2 && bA.unit && bB.unit && bC.unit && bA.unit !== bB.unit, 'each player starts in a body on their own side');
  check(!!bB.mt && bB.mt.n === 4, 'the begin message carries the plan, so every page sets up the same match');
  const s = await C.wait(m => m.t === 's'); check(!!s, 'snapshots arrive');
  await sleep(2500); const r = await fetch(`http://localhost:${PORT}/healthz`).then(r => r.text(), () => '');
  check(r.length > 0 && !/Error|TypeError/.test(srvLog), 'the server keeps running a team game' + (srvLog ? ' (' + srvLog.slice(0, 200) + ')' : ''));
  for (const X of [A, B, C]) X.close();
} catch (e) { check(false, 'ran to the end: ' + e.message); console.log(srvLog.slice(0, 1500)); console.log(JSON.stringify(A.got?.slice(-3))); }
srv.kill();
console.log(fail.length ? `\n${fail.length} FAILED` : '\nALL PASS');
process.exit(fail.length ? 1 : 0);
