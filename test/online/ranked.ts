// Ranked play without a server: the rating sums, the store (keys, results, seasons, the leaderboard), the queue, and lobby rules in a match.
// Run with: node tools/run-ts.mjs test/online/ranked.ts
import '../../server/shim';
import { mkdtempSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { initHeadless } from '../../src/gfx';
import { rate, expected, START, carry, seasonOf, seasonEnds, SEASON_ZERO, PROVISIONAL } from '../../src/rating';
import { RankStore, Queue, reach } from '../../server/ranked';
import { Match, cleanRules, worldHash, playBack, Seat } from '../../src/match';
initHeadless();
const fail: string[] = [], check = (ok: boolean, what: string) => { console.log((ok ? 'PASS ' : 'FAIL ') + what); if (!ok) fail.push(what); };
const near = (a: number, b: number, e: number) => Math.abs(a - b) <= e;

// ---------------------------------------------------------------- the sums
// Glickman's worked example (one game at a time here, so the numbers differ from the paper's three-game period; they are checked against
// the same sums done by hand): a 1500 / 200 player beating a 1400 / 30 player gains about 63 points, and rd falls.
{
  const me = { r: 1500, rd: 200, vol: .06 }, a = rate(me, { r: 1400, rd: 30, vol: .06 }, 1), b = rate(me, { r: 1400, rd: 30, vol: .06 }, 0);
  check(a.r > 1550 && a.r < 1580 && a.rd < 200 && a.rd > 170, `beating a weaker, settled player: 1500 to ${a.r.toFixed(1)}, rd 200 to ${a.rd.toFixed(1)}`);
  check(b.r < 1450 && b.r > 1380, `losing to them costs more than winning gains: 1500 to ${b.r.toFixed(1)}`);
  // the paper's own three-game period, played as three single games, ends close to the paper's 1464.06 / 151.52
  let p = me; for (const [r, rd, s] of [[1400, 30, 1], [1550, 100, 0], [1700, 300, 0]]) p = rate(p, { r, rd, vol: .06 }, s);
  check(near(p.r, 1464, 12) && near(p.rd, 151.5, 8), `Glickman's example played one game at a time ends near his answer (1464 / 152): ${p.r.toFixed(1)} / ${p.rd.toFixed(1)}`);
  const n1 = rate(START, START, 1), n2 = rate(START, START, 0);
  check(near(n1.r - 1500, 1500 - n2.r, .01) && n1.r - 1500 > 150, `two new players: the winner gains what the loser loses (${(n1.r - 1500).toFixed(1)})`);
  check(near(expected({ r: 1700, rd: 50, vol: .06 }, { r: 1500, rd: 50, vol: .06 }), .75, .03), 'a 200-point favourite is expected to win about three games in four');
  // a settled player's rating moves less than a new one's
  const old = { r: 1500, rd: 60, vol: .06 }; check(rate(old, START, 1).r - 1500 < (n1.r - 1500) / 3, 'a settled rating moves much less than a new one for the same win');
  const c = carry({ r: 1900, rd: 60, vol: .07 }); check(c.r === 1700 && c.rd === 200 && c.vol === .06, 'a new season pulls 1900 halfway back, to 1700, and makes it less sure');
  check(seasonOf(SEASON_ZERO) === 1 && seasonOf(seasonEnds(1) - 1) === 1 && seasonOf(seasonEnds(1)) === 2 && seasonOf(0) === 1, 'seasons are counted from the first one');
}

// ---------------------------------------------------------------- the store
{
  const dir = mkdtempSync(join(tmpdir(), 'rank-')), file = join(dir, 'ranked.json'); let now = SEASON_ZERO + 864e5;
  const S = new RankStore(file, () => now);
  const ka = S.claim('Ada', '').key!, kv = S.claim('Vex', '').key!;
  check(!!ka && ka !== kv && /^[a-f0-9]{32}$/.test(ka), 'a name nobody has played ranked under gets a new key');
  const r1 = S.result('Ada', 'Vex', { Ada: ka, Vex: kv });
  check(r1.Ada.before === 1500 && r1.Ada.after > 1500 && r1.Vex.after < 1500 && r1.Ada.delta === -r1.Vex.delta && r1.Ada.provisional, `first ranked game: Ada ${r1.Ada.before} to ${r1.Ada.after}, Vex to ${r1.Vex.after}, both still settling`);
  check(S.claim('ada', ka).ok && !S.claim('Ada', kv).ok && !S.claim('ADA', '').ok, 'the name is kept: only its key plays under it, whatever the capitals');
  check(existsSync(file) && JSON.parse(readFileSync(file, 'utf8')).players.ada.games === 1, 'the result is saved to the file');
  const T = new RankStore(file, () => now); check(T.get('Ada')?.wins === 1 && T.claim('Ada', ka).ok, 'a restarted server reads it back, keys and all');
  // thirty more games, mostly Ada winning: she settles above Vex, and the board puts settled players first
  const kc = S.claim('Cole', '').key!;
  for (let i = 0; i < 30; i++) { now += 36e5; S.result(i % 5 ? 'Ada' : 'Vex', i % 5 ? 'Vex' : 'Ada', { Ada: ka, Vex: kv }); }
  S.result('Cole', 'Vex', { Cole: kc, Vex: kv });
  const B = S.board();
  check(B[0].name === 'Ada' && !B[0].provisional && B[0].rating > 1600, `after 31 games Ada is first and settled (${B[0].rating}, rd ${B[0].rd} under ${PROVISIONAL})`);
  check(B[B.length - 1].name === 'Cole' && B[B.length - 1].provisional, 'one game in, Cole is listed after the settled players');
  const me = S.me('Vex')!; check(me.name === 'Vex' && me.games === 32 && me.place === 2, `a player's own line: Vex, ${me.games} games, number ${me.place}`);
  // time away makes a rating less sure, so the next result moves it more
  const settled = S.rating('Ada'); now += 120 * 864e5; const rested = S.rating('Ada');
  check(rested.rd > settled.rd + 8 && rested.r === settled.r, `four months away: rd ${settled.rd.toFixed(0)} grows to ${rested.rd.toFixed(0)}, the rating stays`);
  // ...and those four months crossed into a new season
  const top = B[0].rating; S.roll();
  check(S.season === seasonOf(now) && S.season >= 3 && S.data.past.length === 1 && S.data.past[0].top[0].name === 'Ada' && S.data.past[0].top[0].rating === top, `season ${S.season}: last season's top players are kept (Ada, ${top})`);
  check(near(S.get('Ada')!.r, 1500 + (top - 1500) / 2, 1) && S.get('Ada')!.games === 0 && S.board().length === 0, 'every rating is pulled halfway back and the new season\'s board starts empty');
  const mem = new RankStore('', () => now); mem.result('X1', 'X2', {}); check(mem.board().length === 2 && !existsSync(join(dir, 'X1')), 'with no file the store works in memory');
}

// ---------------------------------------------------------------- the queue
{
  const Q = new Queue<string>(), t = 1e6;
  Q.add({ who: 'a', name: 'A', key: '', r: 1500, fac: 0, since: t }); Q.add({ who: 'b', name: 'B', key: '', r: 1900, fac: 1, since: t });
  Q.add({ who: 'c', name: 'C', key: '', r: 1560, fac: 2, since: t }); Q.add({ who: 'd', name: 'D', key: '', r: 1870, fac: 0, since: t + 5000 });
  const p = Q.pairs(t + 6000);
  check(p.length === 2 && p.some(x => x[0].who === 'a' && x[1].who === 'c') && p.some(x => x[0].who === 'b' && x[1].who === 'd'), 'four waiting: the two near 1500 meet, and the two near 1900 meet');
  Q.add({ who: 'e', name: 'E', key: '', r: 1500, fac: 0, since: t }); Q.add({ who: 'f', name: 'F', key: '', r: 1800, fac: 0, since: t });
  check(Q.pairs(t + 1000).length === 0, '300 points apart: not paired at first');
  check(Q.pairs(t + 40000).length === 1 && !Q.list.length, `paired once both have waited long enough (reach after 40 s: ${reach(40000)})`);
  Q.add({ who: 'g', name: 'Sam', key: '', r: 1500, fac: 0, since: t }); Q.add({ who: 'h', name: 'sam', key: '', r: 1500, fac: 0, since: t });
  check(Q.pairs(t + 1e6).length === 0, 'a name is never paired with itself (two tabs)');
  Q.add({ who: 'g', name: 'Sam', key: '', r: 1500, fac: 0, since: t }); check(Q.list.length === 2 && Q.drop('g') && Q.list.length === 1, 'queueing twice keeps one place; leaving the queue drops it');
}

// ---------------------------------------------------------------- lobby rules
{
  check(cleanRules({ ore: 400, flux: 50, speed: 1.5 })?.ore === 400 && cleanRules({ ore: 100, flux: 0, speed: 1 }) === null, 'rules that differ are kept; the usual rules are no rules');
  const bad = cleanRules({ ore: 1e9, flux: -5, speed: 3 }, { ore: 300, flux: 0, speed: 1 });
  check(!!bad && bad.ore === 300 && bad.flux === 0 && bad.speed === 1, 'out-of-range values are ignored');
  const seats = (): Seat[] => [{ id: 1, name: 'A', team: 0, unit: null, inbox: [] }, { id: 2, name: 'V', team: 1, unit: null, inbox: [] }];
  const begin: any[] = [], m = new Match({ map: 0, diff: 1, out: 1, seed: 5, clock: 1700000000000, rules: { ore: 750, flux: 120, speed: 1.5 } }, seats(), (_s, x) => begin.push(x), 'test', true);
  check(m.g.cash(0) === 750 && m.g.cash(1) === 750 && m.g.flux(0) === 120 && m.g.flux(1) === 120, 'start ore and Flux go to both sides');
  check(begin.length === 2 && begin.every(b => b.speed === 1.5), 'the players are told the game speed');
  for (let i = 0; i < 900; i++) m.step(); const rec = m.finish('stopped'), back = playBack(rec);
  check(back.hash === worldHash(m.g) && back.match.g.cash(0) !== 100, 'a replay of a match with rules plays back to the same world');
}
console.log(fail.length ? `\n${fail.length} FAILED` : '\nall ranked checks passed'); process.exit(fail.length ? 1 : 0);
