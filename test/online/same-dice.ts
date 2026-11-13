// A match rolls the same dice however it is run: twice in a row in one process, and side by side with another match on another map and
// pairing. Replays depend on this (src/match.ts). Run with: node tools/run-ts.mjs test/online/same-dice.ts
import '../../server/shim';
import { initHeadless } from '../../src/gfx';
import { Match, worldHash, Seat } from '../../src/match';
initHeadless();
const seats = (): Seat[] => [{ id: 1, name: 'A', team: 0, unit: null, inbox: [] }, { id: 2, name: 'V', team: 1, unit: null, inbox: [] }];
const setup = { map: 0, diff: 1, out: 1, seed: 1234, clock: 1700000000000 };
/** Ninety seconds of a bot match, with a world fingerprint every second. */
const run = (other: boolean, n = 2700) => {
  const m = new Match(setup, seats(), () => { /* nobody watching */ }, 'test', true), o = other ? new Match({ ...setup, seed: 99, map: 1, out: 2 }, seats(), () => { /* nobody */ }, 'test', true) : null;
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
  const mt = { n: 4, groups: [[0, 1], [2, 3]], facs: [0, 1, 2, 0] }, ts = { ...setup, mt, seed: 77 };
  const team = () => { const m = new Match(ts, [{ id: 1, name: 'A', team: 0, unit: null, inbox: [] }], () => { /* nobody */ }, 'test', true), hs: string[] = []; for (let i = 0; i < 1800; i++) { if (m.step()) break; if (i % 30 === 29) hs.push(worldHash(m.g)); } return { hs, n: m.g.buildings.filter(b => b.alive).length }; };
  const x = team(); run(false, 300); const y = team();
  check(x.hs.length >= 60 && x.hs.join() === y.hs.join(), `a two-against-two team game is the same world every second for ${x.hs.length} s, run twice with another match between (${x.n} buildings standing)`);
}
console.log(fail.length ? `\n${fail.length} FAILED` : '\nall same dice checks passed'); process.exit(fail.length ? 1 : 0);
