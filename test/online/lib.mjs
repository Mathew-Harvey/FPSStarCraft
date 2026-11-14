// Shared pieces for the online tests: start a match server on a port, and plain WebSocket clients that keep every message.
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url); const WebSocket = require('ws');

export const sleep = ms => new Promise(r => setTimeout(r, ms));
/** Starts dist/server.mjs. Returns { url, log(), stop() }. */
export async function server(port, env = {}) {
  const srv = spawn('node', ['dist/server.mjs'], { env: { ...process.env, PORT: String(port), ...env }, stdio: ['ignore', 'pipe', 'pipe'] });
  let log = ''; srv.stdout.on('data', d => { log += d; }); srv.stderr.on('data', d => { log += d; });
  for (let i = 0; i < 60 && !/Ore Else server on/.test(log); i++) await sleep(100);
  return { url: `ws://localhost:${port}/ws`, http: `http://localhost:${port}`, log: () => log, stop: () => srv.kill() };
}
/** One player: keeps every message, and can wait for one that matches. */
export function client(url, name) {
  return new Promise((res, rej) => {
    const ws = new WebSocket(url), c = { ws, name, got: [], send: o => ws.send(JSON.stringify(o)), close: () => ws.close(),
      wait: (fn, ms = 10000) => new Promise((ok, no) => { const t0 = Date.now(), tick = () => { const m = c.got.find(fn); if (m) return ok(m); if (Date.now() - t0 > ms) return no(new Error(name + ' timed out')); setTimeout(tick, 30); }; tick(); }),
      last: t => { for (let i = c.got.length - 1; i >= 0; i--) if (c.got[i].t === t) return c.got[i]; return undefined; },
      snaps: () => c.got.filter(m => m.t === 's') };
    ws.on('message', d => { try { c.got.push(JSON.parse(String(d))); } catch (e) { /* not ours */ } });
    ws.on('open', () => res(c)); ws.on('error', rej);
  });
}
/** A checker that prints PASS or FAIL lines and exits with the count at the end. */
export function checker() {
  const fail = [];
  return { fail, check: (ok, what) => { console.log((ok ? 'PASS ' : 'FAIL ') + what); if (!ok) fail.push(what); },
    done: (label) => { console.log(fail.length ? `\n${fail.length} FAILED` : `\nall ${label} checks passed`); process.exit(fail.length ? 1 : 0); } };
}
/** Sets up a two-player versus lobby: A on the yard side (team 0), V on the far side (team 1). Returns once the match has begun. */
export async function versus(url, opts = {}) {
  const A = await client(url, 'Ada'), V = await client(url, 'Vex');
  A.send({ t: 'create', name: 'Ada' }); const code = (await A.wait(m => m.t === 'lobby' && m.code)).code;
  V.send({ t: 'join', code, name: 'Vex' }); await V.wait(m => m.t === 'lobby' && m.code === code);
  V.send({ t: 'team', v: 1 }); await A.wait(m => m.t === 'lobby' && m.players.some(p => p.name === 'Vex' && p.team === 1));
  if (opts.set) { A.send({ t: 'set', ...opts.set }); await sleep(200); }
  V.send({ t: 'ready', v: true }); await A.wait(m => m.t === 'lobby' && m.players.every(p => p.ready || p.id === m.host));
  A.send({ t: 'start' }); const bA = await A.wait(m => m.t === 'begin'), bV = await V.wait(m => m.t === 'begin');
  return { A, V, code, bA, bV };
}
/** Walks a raw client's body to (tx, tz) at `speed` metres a second, reporting its position the way a page does, facing where it goes. */
export async function walk(c, unit, tx, tz, speed = 9, faceX, faceZ) {
  const me = c.last('s').u.find(r => r[0] === unit); if (!me) return false; let x = me[3], z = me[4];
  for (let i = 0; i < 2000; i++) { const d = Math.hypot(tx - x, tz - z); if (d < .3) break; const k = Math.min(speed * .05, d) / d; x += (tx - x) * k; z += (tz - z) * k;
    const yaw = faceX === undefined ? Math.atan2(tx - x, tz - z) : Math.atan2(faceX - x, faceZ - z);
    c.send({ t: 'in', me: [Math.round(x * 10) / 10, Math.round(z * 10) / 10, Math.round(yaw * 100) / 100, 0, 1], c: [] }); await sleep(50); }
  await sleep(600); const now = c.last('s').u.find(r => r[0] === unit); return !!now && Math.hypot(now[3] - tx, now[4] - tz) < 6;
}
