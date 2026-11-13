// One bot match with the Veyl on one side, reporting what the Conductor built, trained, researched and spent, and which abilities were
// used. Used by test/factions/veyl.ts for the "bots make every unit" check and the unit-use table, and on its own for a look at one match.
// Run: node tools/run-ts.mjs test/factions/veyl-match.ts '{"home":0,"out":1,"map":0,"seed":1,"mins":40}'
import { noHud, noPipe } from '../../server/shim';
import { Game } from '../../src/game';
import { initHeadless } from '../../src/gfx';
import { DIFFS, UNIT, BLD, UPGRADES, setMap, setSides, fac } from '../../src/data';
import { costOf } from '../../src/core/econ';
initHeadless();
const spec = JSON.parse(process.argv[2] || '{}'), mins = spec.mins ?? 40;
let seed = spec.seed ?? 1; Math.random = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
setMap(spec.map ?? 0); const [H, O] = setSides(spec.home ?? 0, spec.out ?? 1);
const g = new Game(noPipe(), noHud, DIFFS[spec.diff ?? 1], spec.map ?? 0, null, null, true);
g.noRender = true; g.evq = []; g.me = null; g.phase = 'play'; for (const u of g.units) u.pilot = 0; g.human = g.human.map(() => false);
const V = [H, O].filter(t => fac(t) === 1);
const seen = new Set<any>(), made: Record<string, number> = {}, spend: Record<string, number> = {}, blds: Record<string, number> = {}, abs: Record<string, number> = {};
let errors = 0;
const dt = 1 / 30; let tick = 0;
while (g.phase !== 'over' && g.time < mins * 60) {
  try { g.update(dt); } catch (e: any) { errors++; if (errors < 4) console.error('ERROR', g.time.toFixed(1), e?.stack?.split('\n').slice(0, 4).join(' | ')); if (errors > 50) break; }
  if (process.env.FEED) for (const ev of g.evq!) if (ev[0] === 'fd' && (ev[5] < 0 || V.includes(ev[5]))) console.log(Math.round(g.time), ev[1] + ':', ev[2]);
  for (const ev of g.evq!) if (ev[0] === 'ab') { const u = g.units.find(x => x.id === ev[1]); if (u && V.includes(u.team)) abs[u.kind + '.' + ev[2]] = (abs[u.kind + '.' + ev[2]] || 0) + 1; }
  g.evq!.length = 0; tick++;
  if (process.env.DBG && tick % 1800 === 0) for (const t of V) { const tn = g.own('tender', t), st: Record<string, number> = {}; for (const u of tn) st[u.state + (u.vent ? 'V' : '')] = (st[u.state + (u.vent ? 'V' : '')] || 0) + 1; console.log('t', Math.round(g.time), 'ore', Math.round(g.cash(t)), 'flux', Math.round(g.flux(t)), 'mined', Math.round(g.stats.minedV), 'army', g.army(t).length, 'sup', g.supplyUsed(t) + '/' + g.supplyCap(t), JSON.stringify(st), g.ownB(undefined, true, t).filter(b => b.queue.length).map(b => b.kind + ':' + b.queue.map(q => q.kind).join('+') + '@' + g.rate(b)).join(' ')); }
  if (tick % 15 === 0) {
    for (const u of g.units) if (!seen.has(u) && V.includes(u.team)) { seen.add(u); if (g.time > 1) { made[u.kind] = (made[u.kind] || 0) + 1; const c = costOf(u.kind); spend[u.kind] = (spend[u.kind] || 0) + c[0] + c[1]; } }
    for (const b of g.buildings) if (!seen.has(b) && V.includes(b.team)) { seen.add(b); if (g.time > 1) blds[b.kind] = (blds[b.kind] || 0) + 1; }
  }
}
const ups = V.flatMap(t => UPGRADES.filter(u => (u.team || 0) === 1 && (g.upOf(t) as any)[u.key]).map(u => u.key));
const res = g.phase === 'over' ? (g.won ? 'home' : 'out') : 'draw';
console.log(JSON.stringify({ home: spec.home ?? 0, out: spec.out ?? 1, map: spec.map ?? 0, seed: spec.seed ?? 1, res, t: Math.round(g.time), errors, made, spend, blds, ups, abs, flux: V.map(t => Math.round(g.flux(t))), ore: V.map(t => Math.round(g.cash(t))) }));
