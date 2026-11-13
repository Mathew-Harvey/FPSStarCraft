// Checks for the ground: high ground and ramps, the cliffs round each natural and the rock wall that seals its back way in, island fields,
// Flux vents, bright seams and Survey Beacons. Every skirmish map is checked for a fair layout (each piece has its twin at the other end), and a
// few matches check that bodies keep to ramps, cannot see or shoot up a cliff with nobody of theirs up there, and see from a beacon they hold.
// Runs in Node with no browser, on the same simulation the match server runs. Run with: npm run test:terrain
import { noHud, noPipe } from '../server/shim';
import { Game } from '../src/game';
import { initHeadless } from '../src/gfx';
import { DIFFS, MAP, MAPS, SIZES, VHOME, setMap, setSides, swapEnd, LAYOUT } from '../src/data';
import { TER, STEP, BEACON, h, zone, sees, flat, segD } from '../src/terrain';

initHeadless();
const fail: string[] = []; const check = (ok: boolean, what: string) => { console.log((ok ? 'PASS ' : 'FAIL ') + what); if (!ok) fail.push(what); };
let seed = 23; Math.random = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
function match(map: number, home = 0, out = 2) {
  setMap(map); setSides(home, out); const g = new Game(noPipe(), noHud, DIFFS[1], map, null, null, true);
  g.noRender = true; g.evq = []; g.me = null; g.phase = 'play'; for (const u of g.units) u.pilot = 0; g.human = g.human.map(() => false);
  return g;
}
const run = (g: Game, secs: number, each?: () => void) => { for (let i = 0; i < secs * 30 && g.phase !== 'over'; i++) { each?.(); g.update(1 / 30); g.evq!.length = 0; } };
/** Every skirmish map code: three maps, four sizes, a Vast map turned a few ways. */
const CODES: number[] = []; for (let size = 0; size < SIZES.length; size++) for (let base = 0; base < 3; base++) for (const turn of size === 3 ? [1, 9, 17] : [0]) CODES.push(base + 10 * size + 100 * turn);
const near = (a: number[], b: number[], tol = .3) => Math.hypot(a[0] - b[0], a[1] - b[1]) < tol;

// 1. Fair by symmetry. With the fair layout (any match two economies fight), every ridge, ramp, vent, beacon, rock wall and island field has a
//    twin turned round the middle of the map, so each end has the same ground the same walk from home.
{
  let bad: string[] = [], ramps = 0, maps = 0, all = { ledge: 0, ridge: 0, island: 0, vents: 0, beacons: 0, walls: 0, bright: 0 };
  setSides(0, 2);
  for (const code of CODES) { LAYOUT.fair = true; setMap(code); maps++; const name = `${code} ${MAPS[code % 10].name} ${SIZES[Math.floor(code / 10) % 10].name}`;
    for (const R of TER.ridges) { const [ax, az] = swapEnd(R.ax, R.az), [bx, bz] = swapEnd(R.bx, R.bz); const t = TER.ridges.find(q => q.kind === R.kind && Math.abs(q.r - R.r) < .01 && Math.abs(q.h - R.h) < .01 && ((near([q.ax, q.az], [ax, az]) && near([q.bx, q.bz], [bx, bz])) || (near([q.ax, q.az], [bx, bz]) && near([q.bx, q.bz], [ax, az]))));
      if (!t || t.ramps.length !== R.ramps.length || !R.ramps.every(m => t.ramps.some(n => near([n.tx, n.tz], swapEnd(m.tx, m.tz)) && near([n.fx, n.fz], swapEnd(m.fx, m.fz))))) bad.push(name + ' ridge'); all[R.kind]++; ramps += R.ramps.length; }
    // A vent with no twin is fair only if it is the same walk from both bases (the vents of a field in the middle).
    for (const v of TER.vents) if (!TER.vents.some(w => near(w, swapEnd(v[0], v[1]))) && Math.abs(Math.hypot(v[0], v[1]) - Math.hypot(v[0] - VHOME.x, v[1] - VHOME.z)) > 4.5) bad.push(name + ' vent ' + v);
    for (const b of TER.beacons) if (!TER.beacons.some(c => near([c.x, c.z], swapEnd(b.x, b.z)))) bad.push(name + ' beacon');
    for (const w of TER.walls) if (!TER.walls.some(q => near(q, swapEnd(w[0], w[1])) && Math.abs(q[3] - w[3]) < .01)) bad.push(name + ' wall');
    for (const f of TER.fields) if (!TER.fields.some(q => near([q.x, q.z], swapEnd(f.x, f.z)))) bad.push(name + ' island field');
    if (TER.bright.length && !(TER.bright.length === 2 && MAP.sites![TER.bright[1]][2] === 1 && TER.bright[1] === TER.bright[0] + 1)) bad.push(name + ' bright');
    // Vents: two by each base, two by every field. Beacons in pairs.
    if (TER.vents.length !== 4 + 2 * MAP.sites!.length + 2 * TER.fields.length) bad.push(`${name} has ${TER.vents.length} vents`);
    all.vents += TER.vents.length; all.beacons += TER.beacons.length; all.walls += TER.walls.length; all.bright += TER.bright.length;
    if (!TER.ridges.some(R => R.ramps.length)) bad.push(name + ' has no high ground with a ramp');
  }
  check(!bad.length, `all ${maps} skirmish maps: every ridge, ramp, vent, beacon, rock wall and island field has its twin at the other end${bad.length ? ' (' + bad.slice(0, 6).join('; ') + ')' : ''}`);
  console.log(`  over those maps: ${all.ledge} ledges, ${all.ridge} natural ridge pieces, ${all.island} islands, ${ramps} ramps, ${all.vents} vents, ${all.beacons} beacons, ${all.walls} rock walls, ${all.bright / 2} bright pairs`);
  check(all.island > 0 && all.walls > 0 && all.beacons > 0 && all.bright > 0, 'the maps between them have island fields, rock walls, beacons and bright seams');
  // The same code gives the same ground every time, and the match's own dice are not touched.
  LAYOUT.fair = true; setMap(1); const a = JSON.stringify(TER.ridges.map(r => [r.ax, r.az])); const s0 = seed; setMap(21); setMap(1); check(JSON.stringify(TER.ridges.map(r => [r.ax, r.az])) === a && seed === s0, 'the same map code lays the same ground, and laying it draws nothing from the dice');
  // Islands only on Large and Vast maps; story maps stay flat.
  let small = 0; for (const code of [0, 1, 2, 10, 11, 12]) { setMap(code); small += TER.fields.length; } setMap(3); const story = TER.ridges.length + TER.vents.length;
  check(small === 0 && story === 0, 'Small and Medium maps have no island field, and a story map keeps its flat ground');
}

// 2. Height and footing. The top of a ridge is its height, a ramp climbs evenly, buildings need flat ground off the ramps and the vents.
{
  setSides(0, 2); LAYOUT.fair = true; setMap(1); const R = TER.ridges.find(r => r.kind === 'ledge' && r.ramps.length)!, m = R.ramps[0];
  const mid = [(R.ax + R.bx) / 2, (R.az + R.bz) / 2];
  let even = true; for (let t = 0; t <= m.len; t += .5) { const y = h(m.tx + m.ux * t, m.tz + m.uz * t), want = R.h * (1 - t / m.len); if (Math.abs(y - want) > .01) even = false; }
  check(Math.abs(h(mid[0], mid[1]) - R.h) < .01 && h(m.fx + m.ux * 2, m.fz + m.uz * 2) === 0 && even, `a ledge stands ${R.h} m up and its ramp climbs evenly from the ground to the top`);
  check(zone(mid[0], mid[1]) === R.group && zone(m.fx + m.ux * 2, m.fz + m.uz * 2) === -1, 'the top and the ground below are told apart');
  const [vx, vz] = TER.vents[0]; check(flat(mid[0], mid[1], 2, 2) && !flat(m.tx + m.ux * m.len / 2, m.tz + m.uz * m.len / 2, 2, 2) && !flat(vx, vz, 2, 2) && flat(vx, vz, 2, 2, true), 'buildings go on flat ground off the ramps and the vents (a vent building may stand on its vent)');
  const nx = -m.uz, nz = m.ux, rim = [mid[0] + (R.r + .1) * Math.sign((m.tx - mid[0]) * nx + (m.tz - mid[1]) * nz || 1) * nx, 0]; void rim;
}

// 3. Walking. A body cannot walk up or off a cliff; it walks up a ramp. Sent to a spot on top, the computer walks it round to the ramp and up.
{
  const g = match(1); const R = TER.ridges.find(r => r.kind === 'ledge' && r.ramps.length)!, m = R.ramps[0], mx = (R.ax + R.bx) / 2, mz = (R.az + R.bz) / 2;
  // Straight at the cliff, on the side away from the ramp.
  const ox = mx - m.ux * (R.r + 6), oz = mz - m.uz * (R.r + 6), u = g.spawn('linesman', 0, ox, oz); u.order = { type: 'guard', x: ox, z: oz };
  for (let i = 0; i < 60; i++) { const dx = mx - u.pos.x, dz = mz - u.pos.z, d = Math.hypot(dx, dz); u.pos.x += dx / d * .2; u.pos.z += dz / d * .2; g.collide(u, mx, mz); }
  check(u.pos.y < STEP && segD(u.pos.x, u.pos.z, R.ax, R.az, R.bx, R.bz) >= R.r - .05, `a body pushed straight at a cliff stays at the foot (${u.pos.y.toFixed(1)} m up, ${segD(u.pos.x, u.pos.z, R.ax, R.az, R.bx, R.bz).toFixed(1)} m from the line of the ledge)`);
  // Up the ramp by hand.
  const w = g.spawn('linesman', 0, m.fx + m.ux * 3, m.fz + m.uz * 3); for (let i = 0; i < 400; i++) { const dx = mx - w.pos.x, dz = mz - w.pos.z, d = Math.hypot(dx, dz); if (d < .5) break; w.pos.x += dx / d * .15; w.pos.z += dz / d * .15; g.collide(w, mx, mz); }
  check(Math.abs(w.pos.y - R.h) < .05 && Math.hypot(w.pos.x - mx, w.pos.z - mz) < 1, `a body walks up the ramp onto the top (${w.pos.y.toFixed(2)} m up)`);
  // And off the far edge: it stays up.
  for (let i = 0; i < 80; i++) { w.pos.x -= m.ux * .2; w.pos.z -= m.uz * .2; g.collide(w, w.pos.x - m.ux, w.pos.z - m.uz); }
  check(Math.abs(w.pos.y - R.h) < .05, 'a body walking off the far edge stops at the lip');
  // The computer: sent from below to the top, it goes round by the ramp.
  const a = g.spawn('linesman', 0, ox, oz); let t = 0; for (; t < 40 * 30; t++) { g.time += 1 / 30; if (t % 15 === 0) g.poseUnits(0); g.moveTo(a, mx, mz, 1 / 30); if (Math.hypot(a.pos.x - mx, a.pos.z - mz) < 1 && a.pos.y > R.h - .1) break; }
  check(a.pos.y > R.h - .1, `sent to the top from the far side, a body walks round to the ramp and up it (${(t / 30).toFixed(1)} s)`);
  // And back down to where it started.
  let t2 = 0; for (; t2 < 40 * 30; t2++) { if (g.moveTo(a, ox, oz, 1 / 30)) break; }
  check(a.pos.y < .01 && Math.hypot(a.pos.x - ox, a.pos.z - oz) < 1, `sent back down, it takes the ramp (${(t2 / 30).toFixed(1)} s)`);
}

// 4. Sight up a cliff. A side below cannot pick a target up on high ground until something of its own is up there or a beacon it holds sees it.
{
  const g = match(1); const R = TER.ridges.find(r => r.kind === 'ledge' && r.ramps.length)!, m = R.ramps[0], mx = (R.ax + R.bx) / 2, mz = (R.az + R.bz) / 2;
  for (const u of g.units) if (u.team !== 0 || u.kind !== 'rigger') u.alive = u.team === 0;   // clear the far side out
  const up = g.spawn('snapper', g.units.find(u => u.team !== 0)?.team ?? 1, mx, mz), low = g.spawn('linesman', 0, m.fx + m.ux * 5, m.fz + m.uz * 5);
  g.poseUnits(0);
  check(Math.abs(up.pos.y - R.h) < .05 && !sees(0, low.pos.y, up.pos.x, up.pos.z, up.pos.y) && g.acquire(low, 40, 0) === null, 'a body below cannot see or shoot at an enemy up on the ledge');
  check(sees(up.team, up.pos.y, low.pos.x, low.pos.z, low.pos.y) && g.acquire(up, 40, 0) === low, 'the body up top sees and shoots down');
  const friend = g.spawn('linesman', 0, mx + .8, mz); g.poseUnits(0);
  check(sees(0, low.pos.y, up.pos.x, up.pos.z, up.pos.y) && g.acquire(low, 40, 0) === up, 'once one of its own is up there, the body below sees and shoots up');
  friend.alive = false; g.units = g.units.filter(u => u.alive); g.poseUnits(0);
  // The fog: the cells on top are not seen from below.
  g.myTeam = 0; g.fog.update(g, 1, true); check(!g.fog.sees(mx, mz) && g.fog.sees(low.pos.x, low.pos.z), 'on the map the top of the ledge stays dark to a side with nobody up there');
}

// 5. Survey Beacons: stand beside one and your side sees 40 m round it, high ground included; the map shows it.
{
  const g = match(21); const B = TER.beacons[0]; check(!!B, 'Switchback Large has a Survey Beacon');
  if (B) { for (const u of g.units) if (u.team !== 0) u.alive = false; g.units = g.units.filter(u => u.alive);
    const far = g.spawn('linesman', 0, B.x + 30, B.z), foe = g.spawn('snapper', 1, B.x - 30, B.z); g.poseUnits(0); g.myTeam = 0; g.fog.update(g, 1, true);
    const before = g.fog.sees(foe.pos.x, foe.pos.z) || !!(B.held & 1);
    const by = g.spawn('linesman', 0, B.x + BEACON.REACH - 1, B.z); g.poseUnits(0); g.fog.update(g, 1, true);
    check(!before && !!(B.held & 1) && g.fog.sees(foe.pos.x, foe.pos.z) && !g.fog.sees(B.x - 50, B.z), `a body beside the beacon lets its side see ${BEACON.SEE} m round it, and no further`);
    by.alive = false; far.alive = false; g.units = g.units.filter(u => u.alive); g.poseUnits(0); check(!(B.held & 1), 'walk away and the beacon goes dark for that side'); }
}

// 6. The natural's rock wall stops a body until it is broken; then the way is open.
{
  setSides(0, 2); LAYOUT.fair = true; const code = [1, 2, 21, 22].find(c => { setMap(c); return TER.walls.length > 0; })!; const g = match(code);
  const [wx, wz, a] = TER.walls[0], [nx, nz] = MAP.sites![0], ox = wx + Math.cos(a) * 9, oz = wz + Math.sin(a) * 9, u = g.spawn('linesman', 0, ox, oz);
  for (let i = 0; i < 400; i++) { const dx = nx - u.pos.x, dz = nz - u.pos.z, d = Math.hypot(dx, dz); u.pos.x += dx / d * .1; u.pos.z += dz / d * .1; g.collide(u, nx, nz); }
  const blocked = Math.hypot(u.pos.x - nx, u.pos.z - nz) > 15;
  for (const p of g.props) if (p.name === 'Rock wall' && Math.hypot(p.x - wx, p.z - wz) < 8) g.damageProp(p, 1e5, null);
  for (let i = 0; i < 400; i++) { const dx = nx - u.pos.x, dz = nz - u.pos.z, d = Math.hypot(dx, dz); if (d < 1) break; u.pos.x += dx / d * .1; u.pos.z += dz / d * .1; g.collide(u, nx, nz); }
  check(blocked && Math.hypot(u.pos.x - nx, u.pos.z - nz) < 6, `map ${code}: the rock wall across the natural's back way stops a body walking straight in, and once broken it walks through`);
}

// 7. Every field can be walked to from home, and island fields cannot.
{
  // Props (rock spires, the wrecked hauler) are left out: this is about the cliffs. The clock is moved on by hand, as a match would.
  for (const code of [1, 22, 531]) { const g = match(code); g.spires = []; const fields = (MAP.sites || []).map(s => [s[0], s[1]]); let missed: number[] = [];
    fields.forEach(([x, z], i) => { const r = g.spawn('rigger', 0, 3, 3); let ok = false; for (let t = 0; t < 120 * 30; t++) { g.time += 1 / 30; g.poseUnits(0); g.moveTo(r, x, z, 1 / 30, 3); if (Math.hypot(r.pos.x - x, r.pos.z - z) < 6) { ok = true; break; } } if (!ok) missed.push(i); r.alive = false; });
    check(!missed.length, `map ${code}: a Rigger walks from the yard to every ore field${missed.length ? ' (not ' + missed.join(', ') + ')' : ''}`);
    for (const f of TER.fields) { const r = g.spawn('rigger', 0, 3, 3); for (let t = 0; t < 90 * 30; t++) { g.time += 1 / 30; if (t % 15 === 0) g.poseUnits(0); g.moveTo(r, f.x, f.z, 1 / 30, 3); } check(r.pos.y < STEP, `map ${code}: nobody walks onto the island field at ${Math.round(f.x)}, ${Math.round(f.z)}`); r.alive = false; }
  }
}

// 8. Bright seams carry more per load.
{
  const g = match(1); const bright = g.ores.filter(o => (o.rich || 1) > 1); check(bright.length > 0 && bright.length % 2 === 0, `Switchback has bright seams (${bright.length}), in matched pairs`);
}

void VHOME;
console.log(fail.length ? `\n${fail.length} FAILED` : '\nALL PASS'); process.exit(fail.length ? 1 : 0);
