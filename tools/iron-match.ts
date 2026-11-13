// One seeded bot match with Ironhold at home, reporting everything Ironhold made and used: units trained (and what they cost), buildings
// raised, research bought, abilities cast and building commands run. Used by test/factions/ironhold.ts and for the unit-use share table.
// Run: node tools/run-ts.mjs tools/iron-match.ts '{"out":1,"seed":1,"map":0,"mins":40}'
import { noHud, noPipe } from '../server/shim';
import { Game } from '../src/game';
import { initHeadless } from '../src/gfx';
import { DIFFS, setMap, setSides, UNIT } from '../src/data';
import { costOf } from '../src/core/econ';
initHeadless();
const spec = JSON.parse(process.argv[2] || '{}'), map = spec.map ?? 0, mins = spec.mins ?? 40;
let seed = spec.seed ?? 1; Math.random = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
setMap(map); const [H, out] = setSides(0, spec.out ?? 1);
const g = new Game(noPipe(), noHud, DIFFS[spec.diff ?? 1], map, null, null, true);
g.noRender = true; g.evq = []; g.me = null; g.phase = 'play'; for (const u of g.units) u.pilot = 0; g.human = g.human.map(() => false); g.human[out] = !!spec.human?.[1];
for (const u of g.units) { u.pos.x += (Math.random() - .5) * 4; u.pos.z += (Math.random() - .5) * 4; } g.dir.qmT = Math.random(); g.dir.vs.qmT = Math.random();
const inc = (o: Record<string, number>, k: string, n = 1) => { o[k] = (o[k] || 0) + n; };
const trained: Record<string, number> = {}, spend: Record<string, number> = {}, built: Record<string, number> = {}, casts: Record<string, number> = {}, acts: Record<string, number> = {}, forms: Record<string, number> = {};
const tr = g.dir.trained.bind(g.dir); (g.dir as any).trained = (u: any) => { if (u.team === H) { inc(trained, u.kind); const c = costOf(u.kind); inc(spend, u.kind, c[0] + c[1]); } return tr(u); };
const ba = g.buildingAction.bind(g); (g as any).buildingAction = (b: any, k: string, m?: boolean) => { const r = ba(b, k, m); if (r && b.team === H) inc(acts, k); return r; };
const seenB = new Set<number>(), cds = new Map<any, Record<string, number>>(), kinds = new Map<any, string>();
let nextScan = 0;
while (g.phase !== 'over' && g.time < mins * 60) {
  g.update(1 / 30); g.evq!.length = 0;
  if (g.time < nextScan) continue; nextScan = g.time + .25;
  for (const b of g.buildings) if (b.alive && b.team === H && b.built && !seenB.has(b.id)) { seenB.add(b.id); inc(built, b.kind); }
  for (const u of g.units) { if (!u.alive || u.team !== H) continue;
    const was = kinds.get(u); if (was && was !== u.kind) inc(forms, u.kind); kinds.set(u, u.kind);
    const cd = (u as any).abCd as Record<string, number> | undefined; if (!cd) continue; const prev = cds.get(u) || {};
    for (const k in cd) if (cd[k] > 0 && !(prev[k] > 0)) inc(casts, k); cds.set(u, { ...cd }); }
}
const res = g.phase === 'over' ? (g.won ? 'IRON' : 'FOE') : 'DRAW', up = Object.keys(g.upOf(H)).filter(k => (g.upOf(H) as any)[k]);
console.log(JSON.stringify({ out, seed: spec.seed ?? 1, map, res, t: Math.round(g.time), trained, spend, built, casts, acts, forms, up, mined: Math.floor(g.stats.mined) }));
