// Team games on the ring maps (Crossing and Wheel), played by bots. The match loop is the one in test/core/sides.ts.
// turned round the middle. Checks that every side starts at its own spot with its crew, mines and builds, goes after enemies only,
// never hurts a friend, and that the match ends when one side is left.
// Run: node tools/run-ts.mjs test/teammaps-play.ts [mins] [name]
import { noHud, noPipe } from '../server/shim';
import { Game } from '../src/game';
import { initHeadless } from '../src/gfx';
import { DIFFS, FACTION, SIDE, setMap, setSides, setTeamGame, homeXZ, foeOf } from '../src/data';
import { clearMatch, isEnemy, MATCH, planTeams, multi, type TeamPlan } from '../src/core/sides';
initHeadless();
// Until data.ts fills FACTION past team 5 (a third copy of a faction, as 4v4 on Wheel needs), fill it here.
import { FACTION as F_ } from '../src/data'; for (let t = 6; t < 24; t++) if (!F_[t]) F_[t] = F_[t % 3];
const mins = +(process.argv[2] || 30);
const fail: string[] = []; const check = (ok: boolean, what: string) => { console.log((ok ? 'PASS ' : 'FAIL ') + what); if (!ok) fail.push(what); };

function play(name: string, plan: TeamPlan, seed: number, MAPC: number) {
  let sd = seed; Math.random = () => { sd = (sd * 16807) % 2147483647; return (sd - 1) / 2147483646; };
  setMap(MAPC); const T = setTeamGame(plan)!, teams = T.teams;
  const g = new Game(noPipe(), noHud, DIFFS[1], MAPC, null, null, true); g.noRender = true; g.evq = []; g.me = null; g.phase = 'play';
  for (const u of g.units) u.pilot = 0; g.human = g.human.map(() => false);
  check(g.dir.sides.length === teams.length, `${name}: a brain for every side (${g.dir.sides.length})`);
  for (const t of teams) {
    const [hx, hz] = homeXZ(t), hq = g.hqs(t)[0], crew = g.units.filter(u => u.team === t && u.kind === FACTION[t].worker);
    check(!!hq && Math.hypot(hq.pos.x - hx, hq.pos.z - hz) < 1 && crew.length === 6 && crew.every(u => Math.hypot(u.pos.x - hx, u.pos.z - hz) < 20), `${name}: ${g.sideName(t)} starts at its spot (${hx | 0}, ${hz | 0}) with six workers`);
    check(g.ores.filter(n => Math.hypot(n.pos.x - hx, n.pos.z - hz) < 32).length >= 6, `${name}: ${g.sideName(t)} has seams at home`);
  }
  let friendly = 0, foul = ''; const dmg = g.damage.bind(g);
  (g as any).damage = (t: any, amt: number, from: any, ...rest: any[]) => { if (from && from.team !== t.team && !isEnemy(from.team, t.team)) { friendly++; foul = `${from.kind}(${from.team}) hit ${t.kind}(${t.team})`; } return dmg(t, amt, from, ...rest); };
  const dt = 1 / 30; let tick = 0; const built: Record<number, number> = {}, marched: Record<number, number> = {}, wrongMarch: string[] = [];
  while (g.phase !== 'over' && g.time < mins * 60) {
    g.update(dt); g.evq!.length = 0; tick++;
    if (tick % 300 === 0) for (const t of teams) {
      built[t] = Math.max(built[t] || 0, g.buildings.filter(b => b.alive && b.team === t && b.built).length);
      const s = g.dir.side(t); if (s.plan?.phase === 'go' && s.plan.target) { marched[t] = (marched[t] || 0) + 1; if (!isEnemy(t, s.plan.target.team)) wrongMarch.push(`${t} at ${s.plan.target.team}`); }
    }
    if (g.time > 400 && tick % 300 === 0) for (const t of teams) if (!g.outOf.includes(t) && MATCH.foe[t] !== undefined && !isEnemy(t, foeOf(t))) wrongMarch.push(`${t} picks friend ${foeOf(t)}`);
  }
  for (const t of teams) check((built[t] || 0) >= 4, `${name}: ${g.sideName(t)} built a base (${built[t] || 0} buildings at most)`);
  check(teams.filter(t => marched[t]).length >= teams.length / 2, `${name}: sides march on the enemy (${teams.map(t => g.sideName(t) + ' ' + (marched[t] || 0)).join(', ')})`);
  check(!wrongMarch.length, `${name}: nobody marches on a friend ${wrongMarch.slice(0, 3).join('; ')}`);
  const lost = g.units.filter(u => u.alive && !(Number.isFinite(u.pos.x) && Number.isFinite(u.pos.y) && Number.isFinite(u.pos.z)));
  check(!lost.length, `${name}: every live body is somewhere (${lost.length} with no position${lost[0] ? ', e.g. ' + lost[0].kind : ''})`);
  check(!friendly, `${name}: nobody hurts a friend (${friendly}${foul ? ', e.g. ' + foul : ''})`);
  const out = g.outOf.map(t => g.sideName(t)).join(', ') || 'nobody';
  console.log(`  ${name}: ${g.phase === 'over' ? 'over at ' + Math.round(g.time / 60) + ' min, winners ' + g.winners.map(t => g.sideName(t)).join(' and ') : 'still going at ' + mins + ' min'}; out: ${out}`);
  if (g.phase === 'over') check(g.winners.length > 0 && g.winners.every(t => g.winners.every(o => !isEnemy(t, o))) && teams.filter(t => !g.outOf.includes(t)).every(t => g.winners.includes(t)), `${name}: the winners are one side and everyone else is out`);
  g.dispose?.(); clearMatch();
  return g;
}

// The team maps played as team games: every layout's sides start on their own spots with their ore at home, and the match runs to an end.
const only = process.argv[3] || '';
const runs: [string, TeamPlan, number, number][] = [
  ['Crossing 2v2', { n: 4, groups: [[0, 1], [2, 3]], facs: [0, 1, 2, 0] }, 7, 6],
  ['Crossing FFA', { n: 4, groups: [[0], [1], [2], [3]], facs: [0, 1, 2, 1] }, 9, 16],
  ['Wheel 4v4', { n: 8, groups: [[0, 1, 2, 3], [4, 5, 6, 7]], facs: [0, 1, 2, 0, 1, 2, 0, 1] }, 11, 7],
  ['Wheel 2v2', { n: 8, groups: [[0, 1], [4, 5]], facs: [0, 2, 1, 1, 1, 0, 1, 1] }, 13, 27],
];
for (const r of runs) if (!only || r[0].includes(only)) play(...r);
console.log(fail.length ? `\n${fail.length} FAILED` : '\nALL PASS');
process.exit(fail.length ? 1 : 0);
