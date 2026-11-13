// One bot match traced a minute at a time for each end: ore mined, workers, army size and worth, Headframes (distance from home, ? while
// building), pushes. For finding why a mirror leans one way on one map.
// Run: node tools/run-ts.mjs tools/trace.ts '{"home":0,"out":0,"map":11,"seed":5,"mins":30}'
import { noHud, noPipe } from '../server/shim';
import { Game } from '../src/game';
import { initHeadless } from '../src/gfx';
import { DIFFS, FACTION, UNIT, setMap, setSides, isWorker, homeXZ } from '../src/data';
initHeadless();
const spec = JSON.parse(process.argv[2] || '{}'), map = spec.map ?? 0, mins = spec.mins ?? 30;
let seed = spec.seed ?? 1; Math.random = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
setMap(map); const [H, O] = setSides(spec.home ?? 0, spec.out ?? 0);
const g = new Game(noPipe(), noHud, DIFFS[spec.diff ?? 1], map, null, null, true);
g.noRender = true; g.evq = []; g.me = null; g.phase = 'play'; for (const u of g.units) u.pilot = 0; g.human = g.human.map(() => false);
for (const u of g.units) { u.pos.x += (Math.random() - .5) * 4; u.pos.z += (Math.random() - .5) * 4; } g.dir.qmT = Math.random(); g.dir.vs.qmT = Math.random();
const side = (t: number) => {
  const [hx, hz] = homeXZ(t), hq = FACTION[t].hq; const ws = g.units.filter(u => u.alive && u.team === t && isWorker(u.kind)).length, ar = g.army(t);
  const hf = g.buildings.filter(b => b.alive && b.team === t && b.kind === hq).map(b => `${Math.round(Math.hypot(b.pos.x - hx, b.pos.z - hz))}${b.built ? '' : '?'}`).join(',');
  return `w${ws} a${ar.length}(${ar.reduce((a, u) => a + (UNIT[u.kind].cost || 0), 0)}) ore${Math.round(g.cash(t))} hf[${hf}] b${g.buildings.filter(b => b.alive && b.team === t).length}`;
};
let next = 60, m0 = 0, m1 = 0;
while (g.phase !== 'over' && g.time < mins * 60) {
  g.update(1 / 30); g.evq!.length = 0;
  if (g.time >= next) { next += 60; const a = g.stats.mined - m0, b = g.stats.minedV - m1; m0 = g.stats.mined; m1 = g.stats.minedV;
    console.log(`${Math.round(g.time / 60)}m yard +${Math.round(a)} ${side(H)} push ${g.dir.pushes}/${g.dir.fails} | far +${Math.round(b)} ${side(O)} push ${g.dir.vs.pushes}/${g.dir.vs.fails}`); }
}
console.log(g.phase === 'over' ? (g.won ? 'yard won' : 'far won') : 'draw', Math.round(g.time));
