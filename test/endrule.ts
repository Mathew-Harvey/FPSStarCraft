// The end rule (OVERTIME in data.ts): off by default; when its limit is set, a fair skirmish ends on points at that time and the side that
// lost the least value wins; overtime makes buildings take more damage. Run: node tools/run-ts.mjs test/endrule.ts
import { noHud, noPipe } from '../server/shim';
import { Game } from '../src/game';
import { initHeadless } from '../src/gfx';
import { DIFFS, OVERTIME, SIDE, setMap, setSides, isFighter } from '../src/data';
initHeadless();
let fails = 0; const check = (ok: boolean, what: string) => { console.log(`${ok ? 'PASS' : 'FAIL'} ${what}`); if (!ok) fails++; };
let seed = 7; Math.random = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };

const match = (home: number, out: number) => {
  setMap(0); setSides(home, out); const g = new Game(noPipe(), noHud, DIFFS[1], 0, null, null, true);
  g.noRender = true; g.evq = []; g.me = null; g.phase = 'play'; for (const u of g.units) u.pilot = 0; g.human = g.human.map(() => false);
  return g;
};
const run = (g: Game, secs: number) => { for (let i = 0; i < secs * 30 && g.phase !== 'over'; i++) { g.update(1 / 30); g.evq!.length = 0; } };
const was = { ...OVERTIME };

// Off by default: nothing ends a match at any minute.
{ const g = match(0, 1); check(OVERTIME.limit === 0 && OVERTIME.start === 0, 'the end rule ships switched off (OVERTIME.start and limit are 0)'); run(g, 90); check(g.phase !== 'over' && !g.byPoints, 'with the rule off a match is still going at 90 s'); }

// On: the side that lost less wins at the limit, whichever end it holds.
for (const [home, out, loser] of [[0, 2, 'home'], [1, 0, 'out'], [2, 2, 'out']] as const) {
  OVERTIME.limit = 60; const g = match(home, out); run(g, 5);
  const t = loser === 'home' ? SIDE.home : SIDE.out, ws = g.units.filter(u => u.alive && u.team === t && !isFighter(u)).slice(0, 3);
  for (const u of ws) g.damage(u, 1e6, null);
  run(g, 70);
  check(g.phase === 'over' && g.byPoints, `${home}v${out}: the match ends on points at the limit (${Math.round(g.time)} s)`);
  check(g.won === (loser === 'out'), `${home}v${out}: the side that lost three workers (${loser}) loses on points`);
  Object.assign(OVERTIME, was);
}

// Overtime: buildings take more damage after the start.
{ const g = match(0, 1); const b = g.buildings.find(b => b.alive && b.team === SIDE.out)!; const hp0 = b.hp; g.damage(b, 100, null); const plain = hp0 - b.hp;
  OVERTIME.start = 1; OVERTIME.perMin = .2; g.time = 61 + 60; const hp1 = b.hp; g.damage(b, 100, null); const late = hp1 - b.hp; Object.assign(OVERTIME, was);
  check(late > plain * 1.35, `two minutes into overtime at 20% a minute a building takes about 1.4 times the damage (${plain.toFixed(1)} then ${late.toFixed(1)})`); }

console.log(fails ? `\n${fails} FAILED` : '\nall passed'); process.exit(fails ? 1 : 0);
