// A match rolls the same dice however it is run: twice in a row in one process, and side by side with another match on another map and
// pairing. Replays depend on this (src/match.ts). Run with: node tools/run-ts.mjs test/online/same-dice.ts
import '../../server/shim';
import { initHeadless } from '../../src/gfx';
import { Match, worldHash, Seat, playBack } from '../../src/match';
import { UNIT } from '../../src/data';
import { planCode, starterPlan, planMap, checkPlan, usePlan } from '../../src/mapcode';
initHeadless();
const seats = (): Seat[] => [{ id: 1, name: 'A', team: 0, unit: null, inbox: [] }, { id: 2, name: 'V', team: 1, unit: null, inbox: [] }];
// Switchback has ground: ridges, ramps and Flux vents
const setup = { map: 1, diff: 1, out: 1, seed: 1234, clock: 1700000000000 };
/** Ninety seconds of a bot match, with a world fingerprint every second. */
const run = (other: boolean, n = 2700) => {
  const m = new Match(setup, seats(), () => { /* nobody watching */ }, 'test', true), o = other ? new Match({ ...setup, seed: 99, map: 0, out: 2 }, seats(), () => { /* nobody */ }, 'test', true) : null;
  const hs: string[] = [];
  for (let i = 0; i < n; i++) { if (o) o.step(); if (m.step()) break; if (i % 30 === 29) hs.push(worldHash(m.g)); }
  return hs;
};
const a = run(false), b = run(false), c = run(true), at = (x: string[]) => a.findIndex((h, i) => h !== x[i]);
const fail: string[] = [], check = (ok: boolean, what: string) => { console.log((ok ? 'PASS ' : 'FAIL ') + what); if (!ok) fail.push(what); };
check(a.length >= 90 && a.join() === b.join(), `the same match run twice in one process is the same world every second for ${a.length} s${at(b) >= 0 ? ' (first differs at ' + (at(b) + 1) + ' s)' : ''}`);
check(a.join() === c.join(), `and the same again with a Gloam match on another map stepping beside it${at(c) >= 0 ? ' (first differs at ' + (at(c) + 1) + ' s)' : ''}`);
// a two-against-two team game, with one player on each of two sides, run twice with a one-on-one in between
{
  const mt = { n: 4, groups: [[0, 1], [2, 3]], facs: [0, 1, 2, 0] }, ts = { ...setup, map: 6, mt, seed: 77 };   // Crossing: four starts round a crossroads
  const team = () => { const m = new Match(ts, [{ id: 1, name: 'A', team: 0, unit: null, inbox: [] }], () => { /* nobody */ }, 'test', true), hs: string[] = []; for (let i = 0; i < 1800; i++) { if (m.step()) break; if (i % 30 === 29) hs.push(worldHash(m.g)); } return { hs, n: m.g.buildings.filter(b => b.alive).length }; };
  const x = team(); run(false, 300); const y = team();
  check(x.hs.length >= 60 && x.hs.join() === y.hs.join(), `a two-against-two team game on Crossing is the same world every second for ${x.hs.length} s, run twice with another match between (${x.n} buildings standing)`);
}
// a made map (src/mapcode.ts): the plan is part of the setup, and the match lays it out itself every time it runs
{
  const P = starterPlan(2, 0), plan = planCode(P), ok = checkPlan(P).ok; usePlan(null);
  const ms = { ...setup, map: planMap(P), plan, seed: 31 };
  const made = () => { const m = new Match(ms, seats(), () => { /* nobody */ }, 'test', true), hs: string[] = []; for (let i = 0; i < 1200; i++) { if (m.step()) break; if (i % 30 === 29) hs.push(worldHash(m.g)); } return hs; };
  const x = made(); run(false, 300); const y = made();
  check(ok && x.length >= 40 && x.join() === y.join(), `a match on a made map is the same world every second for ${x.length} s, run twice with another match between`);
}
// Ironhold's new kit: rich starts (lobby rules) so both Ironhold bots tech fast into fliers, casters and their abilities. Run twice, and the
// second run is recorded and played back as a replay: the same world every second, and the same end.
{
  const rs = { ...setup, out: 0, seed: 4242, rules: { ore: 5000, flux: 2000, speed: 1 } }, N = +(process.env.RICH_TICKS || 9000);
  const rich = () => {
    const m = new Match(rs, seats(), () => { /* nobody */ }, 'test', true), hs: string[] = [], air = new Set<string>(), cast = new Set<string>();
    for (let i = 0; i < N; i++) { if (m.step()) break; if (i % 30 === 29) { hs.push(worldHash(m.g)); for (const u of m.g.units) { if (!u.alive) continue; if (UNIT[u.kind].air) air.add(u.kind); for (const k in u.abCd || {}) cast.add(u.kind + '.' + k); } } }
    return { m, hs, air, cast };
  };
  const x = rich(), y = rich(), back = playBack(y.m.finish('stopped')), at2 = x.hs.findIndex((h, i) => h !== y.hs[i]);
  check(x.air.size >= 2 && x.cast.size >= 3, `rich Ironhold mirror: the bots field fliers (${[...x.air].join(', ') || 'none'}) and use abilities (${[...x.cast].join(', ') || 'none'})`);
  check(x.hs.length >= N / 30 - 1 && at2 < 0, `and the match is the same world every second for ${x.hs.length} s, run twice${at2 >= 0 ? ' (first differs at ' + (at2 + 1) + ' s)' : ''}`);
  check(back.drift < 0 && back.hash === worldHash(y.m.g) && back.match.tick === y.m.tick, `its replay plays back to the same world at ${(y.m.tick / 30).toFixed(0)} s${back.drift >= 0 ? ' (drifts from tick ' + back.drift + ')' : ''}`);
}
console.log(fail.length ? `\n${fail.length} FAILED` : '\nall same dice checks passed'); process.exit(fail.length ? 1 : 0);
