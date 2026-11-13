// Replays and the observer seat, on a real match server.
// Two players play a short versus match with moves, builds and hits, while a second match runs on the same server and somebody watches.
// The match is recorded; played back with nobody connected (node dist/server.mjs --check-replay) it must end in the same world.
// Run with: node test/online/replay.mjs (after npm run build)
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readdirSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { server, client, checker, versus, walk, sleep } from './lib.mjs';

const { check, done } = checker();
const dir = mkdtempSync(join(tmpdir(), 'ore-replays-'));
const srv = await server(8153, { REPLAY_DIR: dir });
try {
  // a second match on the same server, started first, so the two share the process the whole time
  const other = await versus(srv.url, { set: { out: 2, map: 1 } });   // a different pairing and map, so the two share nothing but the process
  const { A, V, code, bA, bV } = await versus(srv.url);
  // somebody comes to watch the running match
  const W = await client(srv.url, 'Wen'); W.send({ t: 'join', code, name: 'Wen', watch: 1 });
  const bW = await W.wait(m => m.t === 'begin');
  check(bW.watch === 1 && bW.team === -1 && !bW.unit, 'a watcher joins the running match with no body and no side');
  await W.wait(m => m.t === 's'); await sleep(1500);
  const sw = W.last('s'), sa = A.last('s');
  check(sw.u.some(r => r[2] === 0) && sw.u.some(r => r[2] === 1) && sw.b.some(r => r[2] === 1) && sw.b.some(r => r[2] === 0), 'the watcher is sent both sides\' bodies and buildings');
  check(sw.ore !== undefined && sw.vo !== undefined && sw.d && sw.v !== undefined, 'and both purses and both plans');
  check(sa.u.filter(r => r[2] === 1).length < sw.u.filter(r => r[2] === 1).length, `a player is still sent only their own side's sight (${sa.u.filter(r => r[2] === 1).length} Veyl bodies, the watcher ${sw.u.filter(r => r[2] === 1).length})`);
  // the watcher's commands do nothing
  const ore0 = sw.ore; W.send({ t: 'in', me: [0, 0, 0, 0, 1], c: [['tr', 'linesman'], ['bd', bA.unit], ['dm', bV.unit, 500, 0]] }); await sleep(800);
  check(A.last('s').u.some(r => r[0] === bA.unit && r[10] === A.last('lobby').you), 'a watcher cannot take a player\'s body');
  void ore0;
  // the players do things: walk, ask for training and a build, and fire some hits
  await Promise.all([walk(A, bA.unit, 10, 10), walk(V, bV.unit, bV.unit ? V.last('s').u.find(r => r[0] === bV.unit)[3] - 15 : 0, V.last('s').u.find(r => r[0] === bV.unit)?.[4] ?? 0)]);
  const hq = A.last('s').b.find(r => r[2] === 0); if (hq) A.send({ t: 'in', me: null, c: [['tr', 'rigger'], ['ch', 'hello']] });
  V.send({ t: 'in', me: null, c: [['ch', 'hi']] });
  await sleep(3000); await walk(A, bA.unit, 30, 0); await sleep(2000);
  // Vex drops out and comes back: the replay has a leave and a late join
  V.close(); await sleep(800); const V2 = await client(srv.url, 'Vex'); V2.send({ t: 'join', code, name: 'Vex' }); const bV2 = await V2.wait(m => m.t === 'begin');
  check(bV2.team === 1, 'Vex rejoins on the Veyl side');
  await sleep(4000);
  const shownA = A.last('s');
  // everyone leaves; the match is kept as a replay
  A.close(); V2.close(); await sleep(1500);
  check(W.got.some(m => m.t === 'over' && m.replay), 'when the last player leaves, the watcher is told the match is over and the replay name');
  other.A.close(); other.V.close(); await sleep(1500);
  const files = readdirSync(dir).filter(f => f.endsWith('.json.gz'));
  check(files.length === 2, `both matches were saved as replays (${files.length} files)`);
  const list = await (await fetch(srv.http + '/replays')).json();
  check(Array.isArray(list) && list.length === 2 && list.every(r => r.ticks > 30), 'the server lists the replays');
  const mine = list.find(r => r.names.includes('Ada') && r.names.includes('Vex') && files.some(f => f.includes(code)) && r.id.includes(code));
  check(!!mine, 'the replay of the watched match is listed with both players');
  const res = await fetch(srv.http + '/replays/' + mine.id), rec = await res.json();
  check(rec.v === 1 && rec.setup && rec.log.some(e => e[0] === 'i') && rec.log.some(e => e[0] === 'l') && rec.log.some(e => e[0] === 'j') && rec.log.some(e => e[0] === 'h') && rec.end, `the replay file has the setup, inputs, a leave, a late join, world checks and the end (${rec.log.length} entries, ${rec.end?.tick} ticks)`);
  check(rec.end && Math.abs(rec.end.time - shownA.time) < 15, `it ends when the players left (${rec.end?.time} s, the last snapshot was ${shownA.time} s)`);
  // play both back with nobody connected, in a fresh process
  for (const f of files) {
    const r = spawnSync('node', ['dist/server.mjs', '--check-replay', join(dir, f)], { encoding: 'utf8', timeout: 300000 });
    let out = {}; try { out = JSON.parse(r.stdout.trim().split('\n').pop()); } catch (e) { console.log(r.stdout, r.stderr); }
    check(r.status === 0 && out.same && out.drift < 0, `played back with nobody connected, ${f} ends in the same world (${out.ticks} ticks, ${out.hash} vs ${out.recorded}, ${out.ms} ms${out.drift >= 0 ? ', first drift at tick ' + out.drift : ''})`);
  }
  // a doctored replay does not pass
  const raw = JSON.parse(String(gunzipSync(readFileSync(join(dir, files.find(f => f.includes(code)))))));
  // one player's every reported position moved 2 m east
  const who = raw.log.find(e => e[0] === 'i' && e[3])?.[2]; let i = -1; raw.log.forEach((e, k) => { if (e[0] === 'i' && e[2] === who && e[3]) { e[3][0] += 2; i = k; } }); const bad = join(dir, 'doctored.json'); writeFileSync(bad, JSON.stringify(raw));
  const r2 = spawnSync('node', ['dist/server.mjs', '--check-replay', bad], { encoding: 'utf8', timeout: 300000 });
  check(i >= 0 && r2.status !== 0, 'a replay with one input changed does not end in the same world');
  check(!/match crashed/.test(srv.log()), 'no match crashed on the server');
} finally { srv.stop(); }
done('replay and watcher');
