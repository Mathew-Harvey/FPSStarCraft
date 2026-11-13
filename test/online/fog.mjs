// Fog on the wire, end to end: a plain WebSocket client (no page, so nothing on its side hides anything) is sent only what its side can see.
// Run with: npm run build && node test/online/fog.mjs
import { server, versus, sleep, checker } from './lib.mjs';
const { check, done } = checker();
const S = await server(8151);
/** Generous sight: the biggest sight circle (48 m) plus a cell and a little movement, and a driven body's look (110 m). */
const SIGHT = 48 + 10, LOOK = 110 + 6;
try {
  const { A, V, bA, bV } = await versus(S.url);
  check(bA.team === 0 && bV.team === 1, 'Ada plays the yard side and Vex the far side');
  await sleep(3000);
  const early = A.snaps(), earlyV = V.snaps();
  check(early.length > 20, `Ada is getting snapshots (${early.length})`);
  check(early.every(s => !s.u.some(r => r[2] === 1) && !s.b.some(r => r[2] === 1)), 'at the start Ada is sent no Veyl body and no Veyl building');
  check(earlyV.every(s => !s.u.some(r => r[2] === 0) && !s.b.some(r => r[2] === 0)), 'and Vex is sent nothing of Ironhold');
  check(early.every(s => s.vo === undefined && !s.v) && earlyV.every(s => s.ore === undefined && !s.d), 'neither side is sent the other side\'s purse or plan');
  // Vex's own buildings say where the far base is. Ada walks over there with her body, looking at it.
  const vs = V.last('s'), stone = vs.b.find(r => r[2] === 1), me0 = A.last('s').u.find(r => r[0] === bA.unit);
  const hidden = vs.u.filter(r => r[2] === 1).map(r => r[0]);
  // a hit claimed on a body Ada was never sent goes nowhere
  const target = vs.u.find(r => r[2] === 1), hp0 = target[6] + target[8];
  A.send({ t: 'in', me: null, c: [['dm', target[0], 450, 1], ['dm', target[0], 450, 1], ['dm', stone[0], 450]] }); await sleep(800);
  const t1 = V.last('s').u.find(r => r[0] === target[0]), st1 = V.last('s').b.find(r => r[0] === stone[0]);
  check(t1 && t1[6] + t1[8] === hp0 && st1[6] === stone[6], 'hits Ada claims on Veyl she cannot see do nothing');
  let x = me0[3], z = me0[4]; const tx = stone[3] - 26, tz = stone[4];
  for (let i = 0; i < 400 && Math.hypot(tx - x, tz - z) > 1; i++) { const d = Math.hypot(tx - x, tz - z), k = Math.min(.5, d) / d; x += (tx - x) * k; z += (tz - z) * k; const yaw = Math.atan2(stone[3] - x, stone[4] - z);
    A.send({ t: 'in', me: [Math.round(x * 10) / 10, Math.round(z * 10) / 10, Math.round(yaw * 100) / 100, 0, 1], c: [] }); await sleep(50); }
  await sleep(1500);
  const there = A.last('s'), mine = there.u.find(r => r[0] === bA.unit);
  check(mine && Math.hypot(mine[3] - tx, mine[4] - tz) < 6, `Ada's body walked to the Veyl base (${mine ? Math.round(Math.hypot(mine[3] - tx, mine[4] - tz)) : '?'} m off)`);
  check(there.b.some(r => r[2] === 1 && !r[13]), `at the Veyl base Ada is sent the Veyl buildings she can see (${there.b.filter(r => r[2] === 1).length})`);
  // every Veyl body Ada was ever sent was inside the sight of something of hers in that same snapshot
  let sent = 0, stray = 0;
  for (const s of A.snaps()) { const own = s.u.filter(r => r[2] === 0), ownB = s.b.filter(r => r[2] === 0);
    for (const r of s.u) { if (r[2] === 0) continue; sent++; const ok = own.some(o => Math.hypot(o[3] - r[3], o[4] - r[4]) <= (o[10] ? LOOK : SIGHT)) || ownB.some(b => Math.hypot(b[3] - r[3], b[4] - r[4]) <= SIGHT + 8); if (!ok) stray++; } }
  check(sent > 0 && stray === 0, `every Veyl body Ada was sent was in sight of her side (${sent} sent, ${stray} not)`);
  check(!A.snaps().some(s => s.u.some(r => r[2] === 1 && hidden.includes(r[0]) && Math.hypot(r[3] - (s.u.find(q => q[0] === bA.unit) || [0, 0, 0, 1e9, 1e9])[3], r[4] - (s.u.find(q => q[0] === bA.unit) || [0, 0, 0, 1e9, 1e9])[4]) > LOOK)), 'no Veyl body was sent from beyond her look');
  // she walks home again: the Veyl buildings stay, marked as last seen, and the bodies go
  for (let i = 0; i < 400 && Math.hypot(x - me0[3], z - me0[4]) > 1; i++) { const d = Math.hypot(me0[3] - x, me0[4] - z), k = Math.min(.5, d) / d; x += (me0[3] - x) * k; z += (me0[4] - z) * k;
    A.send({ t: 'in', me: [Math.round(x * 10) / 10, Math.round(z * 10) / 10, Math.PI, 0, 1], c: [] }); await sleep(50); }
  await sleep(1200);
  const home = A.last('s'), ghosts = home.b.filter(r => r[2] === 1);
  check(ghosts.length > 0 && ghosts.every(r => r[13] === 1), `back home, Ada still has the Veyl buildings she saw, marked as last seen (${ghosts.length})`);
  check(!home.u.some(r => r[2] === 1 && Math.hypot(r[3], r[4]) > 90), 'and no Veyl body from the far base');
  A.close(); V.close();
} catch (e) { console.log('ERROR', e.stack); check(false, 'no exception'); }
S.stop(); check(!/match crashed/.test(S.log()), 'no match crashed on the server');
done('fog on the wire');
