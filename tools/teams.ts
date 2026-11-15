// Team-game table (stream L, gate line 6: no faction wins more than 60% of its team games). Bots on every seat, end rule on.
// Run: node tools/run-ts.mjs tools/teams.ts '{"kind":"2v2","seeds":[1,2,3]}' >> rows.jsonl
//   kind 2v2: Crossing (map 6), seats [0,1] against [2,3]; 4v4: Wheel (map 7), seats 0-3 against 4-7. Each seed deals the seats a fresh
//   mix of factions (every seat drawn from the three, so a side can hold two of one faction), then plays one match to its end.
// Prints one JSON line a match: the factions on each side, the winning side, the minute, whether it was on points, the value each side destroyed.
//   node tools/run-ts.mjs tools/teams.ts sum rows.jsonl prints each faction's share of seats on the winning side.
import { readFileSync } from 'node:fs';
import { noHud, noPipe } from '../server/shim';
import { Game } from '../src/game';
import { initHeadless } from '../src/gfx';
import { DIFFS, setMap, setTeamGame, fac } from '../src/data';
import { clearMatch, isEnemy, type TeamPlan } from '../src/core/sides';

const NAMES = ['Ironhold', 'Veyl', 'Gloam'];
if (process.argv[2] === 'sum') {
  const rows = readFileSync(process.argv[3], 'utf8').trim().split('\n').map(l => JSON.parse(l));
  for (const kind of [...new Set(rows.map(r => r.kind))]) {
    const rs = rows.filter(r => r.kind === kind), seat = [0, 0, 0], won = [0, 0, 0]; let pts = 0, none = 0;
    for (const r of rs) { if (r.points) pts++; if (r.win < 0) { none++; continue; } r.sides.forEach((s: number[], i: number) => s.forEach(f => { seat[f]++; if (i === r.win) won[f]++; })); }
    console.log(`${kind}: ${rs.length} matches, ${pts} on points, ${none} with no winner | ` + NAMES.map((n, f) => `${n} won ${won[f]} of ${seat[f]} seats (${Math.round(won[f] / Math.max(1, seat[f]) * 100)}%)`).join(', '));
    // The same, counting only matches where the two sides hold different mixes (a side's own faction against itself says nothing).
    const mixed = rs.filter(r => r.win >= 0 && r.sides[0].slice().sort().join() !== r.sides[1].slice().sort().join());
    const s2 = [0, 0, 0], w2 = [0, 0, 0]; for (const r of mixed) r.sides.forEach((s: number[], i: number) => s.forEach(f => { s2[f]++; if (i === r.win) w2[f]++; }));
    console.log(`  different mixes only (${mixed.length}): ` + NAMES.map((n, f) => `${n} ${Math.round(w2[f] / Math.max(1, s2[f]) * 100)}%`).join(', '));
  }
  process.exit(0);
}

initHeadless();
const o = JSON.parse(process.argv[2] || '{}'), kind = o.kind || '2v2', four = kind === '4v4';
const n = four ? 8 : 4, MAPC = o.map ?? (four ? 7 : 6), groups = four ? [[0, 1, 2, 3], [4, 5, 6, 7]] : [[0, 1], [2, 3]];
for (const seed of o.seeds || [1]) {
  let sd = 1000 + seed * 7919; const rnd = () => { sd = (sd * 16807) % 2147483647; return (sd - 1) / 2147483646; };
  const facs = Array.from({ length: n }, () => Math.floor(rnd() * 3));
  Math.random = rnd; setMap(MAPC); const T = setTeamGame({ n, groups, facs } as TeamPlan);
  if (!T) { console.log(JSON.stringify({ kind, seed, err: 'plan' })); continue; }
  const g = new Game(noPipe(), noHud, DIFFS[1], MAPC, null, null, true); g.noRender = true; g.evq = []; g.me = null; g.phase = 'play';
  for (const u of g.units) u.pilot = 0; g.human = g.human.map(() => false);
  const t0 = Date.now(); for (let i = 0; i < 45 * 60 * 30 && g.phase !== 'over'; i++) { g.update(1 / 30); g.evq!.length = 0; }
  // Which side won: the group (as teams, from the plan) that holds the winners.
  const G = T.groups, sideOf = (team: number) => G.findIndex(gr => gr.includes(team));
  const win = g.winners.length ? sideOf(g.winners[0]) : -1;
  const sides = G.map(gr => gr.map(t => fac(t)));
  const destroyed = G.map(gr => Math.round(gr.reduce((a, t) => a + (g.destroyedV[t] || 0), 0)));
  console.log(JSON.stringify({ kind, seed, map: MAPC, sides, win, min: Math.round(g.time / 6) / 10, points: g.byPoints, destroyed, secs: Math.round((Date.now() - t0) / 1000), friendly: g.winners.every(a => g.winners.every(b => !isEnemy(a, b))) }));
  g.dispose?.(); clearMatch();
}
