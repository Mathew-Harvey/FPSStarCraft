// One bot match, measured for a review: who won, how long it took, how often the lead changed hands, whether the winner came from behind, how
// much of the match was quiet, and what each side mined and lost. Prints one JSON line. tools/table.mjs runs many of these and adds them up.
// Run: node tools/run-ts.mjs tools/review.ts '{"home":0,"out":1,"map":0,"seed":1}'   (home and out are factions: 0 Ironhold, 1 Veyl, 2 Gloam)
// Options: mins (stop after, default 40), ot (minute overtime starts, 0 for never), otk (overtime's rate per minute), reach (Choir Stone reach in m), vhp and vdmg (the two numbers in Game.vBoost).
import { noHud, noPipe } from '../server/shim';
import { Game } from '../src/game';
import { initHeadless } from '../src/gfx';
import { DIFFS, FACTION, UNIT, BLD, setMap, setSides, isFighter, OVERTIME, CHOIR_REACH, CLEAVE } from '../src/data';
import { G_TUNE } from '../src/factions/gloam/numbers';
import { TERRAIN } from '../src/terrain';
import { costOf } from '../src/core/econ';
const spec0 = JSON.parse(process.argv[2] || '{}'); if (spec0.flat) TERRAIN.on = false;   // flat: the maps without their high ground, vents and beacons
 if (spec0.reach !== undefined) CHOIR_REACH.m = spec0.reach; if (spec0.cleave !== undefined) CLEAVE.n = spec0.cleave; if (spec0.bite) G_TUNE.bite.snapper = spec0.bite; if (spec0.cap) BLD.mothercap.cost = spec0.cap; if (spec0.bud) G_TUNE.budEvery = spec0.bud; if (spec0.gnaw) G_TUNE.bite.gnaw = spec0.gnaw;
if (spec0.ot !== undefined) { OVERTIME.start = spec0.ot * 60; if (spec0.otk) OVERTIME.perMin = spec0.otk; }
initHeadless();
const spec = JSON.parse(process.argv[2] || '{}');
const map = spec.map ?? 0, diff = spec.diff ?? 1, mins = spec.mins ?? 40;
let seed = spec.seed ?? 1; Math.random = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
setMap(map); const [H, O] = setSides(spec.home ?? 0, spec.out ?? 1);
const g = new Game(noPipe(), noHud, DIFFS[diff], map, null, null, true); if (spec0.vhp) g.vBoost.hp = spec0.vhp; if (spec0.vdmg) g.vBoost.dmg = spec0.vdmg;
g.noRender = true; g.evq = []; g.me = null; g.phase = 'play';
for (const u of g.units) u.pilot = 0;
for (const u of g.units) { u.pos.x += (Math.random() - .5) * 4; u.pos.z += (Math.random() - .5) * 4; } g.dir.qmT = Math.random(); g.dir.vs.qmT = Math.random();
g.human = g.human.map(() => false);
const worth = (t: number) => g.units.reduce((a, u) => a + (u.alive && u.team === t ? (UNIT[u.kind].cost || 0) : 0), 0) + g.buildings.reduce((a, b) => a + (b.alive && b.team === t ? (BLD[b.kind].cost || 0) * (b.built ? 1 : b.progress) : 0), 0);
const armyW = (t: number) => g.army(t).reduce((a, u) => a + (UNIT[u.kind].cost || 0), 0);
const dt = 1 / 30; let tick = 0;
const alive = new Map<any, [number, boolean, string]>();   // thing -> [team, isUnit, kind]
const lost = { [H]: { u: 0, w: 0, b: 0, ore: 0 }, [O]: { u: 0, w: 0, b: 0, ore: 0 } } as any;
let firstBlood = -1, firstB = -1; const deathT: number[] = []; const bT: number[] = [];
const line: number[] = [];   // (worthH - worthO) / (worthH + worthO) every 30 s
const armyLine: number[][] = [];
let peak = [0, 0];
// Spend by kind (stream L, gate 3): every unit, building and research level each side paid for, in ore plus flux. A unit that changes kind
// (a Gloam form, an Ironhold refit) counts the new kind's price on top. Starting units and buildings are not counted.
const spend = { [H]: {} as Record<string, number>, [O]: {} as Record<string, number> } as any, made = { [H]: {} as Record<string, number>, [O]: {} as Record<string, number> } as any;
const pay = (t: number, k0: string) => { if (t !== H && t !== O) return; const c = costOf(k0 as any), k = ((UNIT as any)[k0] ? (isFighter({ kind: k0 } as any) ? 'u:' : 'w:') : (BLD as any)[k0] ? 'b:' : 'r:') + k0; spend[t][k] = (spend[t][k] || 0) + c[0] + c[1]; made[t][k] = (made[t][k] || 0) + 1; };
const kindOf = new Map<any, string>(); for (const u of g.units) kindOf.set(u, u.kind); for (const b of g.buildings) kindOf.set(b, b.kind);
const upAt = (t: number) => ({ ...(g.upOf(t) as any) }); const ups0 = { [H]: upAt(H), [O]: upAt(O) } as any;
while (g.phase !== 'over' && g.time < mins * 60) {
  g.update(dt); g.evq!.length = 0; tick++;
  if (tick % 15 === 0) {
    for (const u of g.units) if (u.alive) { const was = kindOf.get(u); if (was !== u.kind) { pay(u.team, u.kind); kindOf.set(u, u.kind); } }
    for (const b of g.buildings) if (b.alive && !kindOf.has(b)) { pay(b.team, b.kind); kindOf.set(b, b.kind); }
    for (const t of [H, O]) { const now = g.upOf(t) as any; for (const k in now) { const a = +(ups0[t][k] || 0), b = +(now[k] || 0); for (let l = a; l < b; l++) pay(t, k); ups0[t][k] = now[k]; } }
    for (const u of g.units) if (u.alive && !alive.has(u)) alive.set(u, [u.team, true, u.kind]);
    for (const b of g.buildings) if (b.alive && !alive.has(b)) alive.set(b, [b.team, false, b.kind]);
    for (const [x, [t, isU, k]] of alive) if (!x.alive) { alive.delete(x); if (t !== H && t !== O) continue;
      if (isU) { const w = !isFighter(x); if (w) lost[t].w++; else lost[t].u++; lost[t].ore += UNIT[k].cost || 0; if (firstBlood < 0 && !w) firstBlood = g.time; deathT.push(g.time); }
      else { if (x.built === false && x.hp > 0) continue; lost[t].b++; lost[t].ore += BLD[k].cost || 0; if (firstB < 0) firstB = g.time; bT.push(g.time); } }
  }
  if (tick % 900 === 0) { const a = worth(H), b = worth(O); line.push(+((a - b) / Math.max(1, a + b)).toFixed(3)); armyLine.push([armyW(H), armyW(O)]); peak = [Math.max(peak[0], g.army(H).length), Math.max(peak[1], g.army(O).length)]; }
}
const tag = (t: number) => ['IRON', 'VEYL', 'GLOAM'][t % 3] + (t >= 3 ? '2' : '');
const res = g.phase === 'over' ? (g.won ? 'home' : 'out') : 'draw';
// Lead changes: the sign of the worth line, counting a change only once it has passed 8% the other way.
let lead = 0, changes = 0, lastChange = 0; line.forEach((v, i) => { const s = v > .08 ? 1 : v < -.08 ? -1 : 0; if (s && s !== lead) { if (lead) { changes++; lastChange = i * 30; } lead = s; } });
const w = res === 'home' ? 1 : res === 'out' ? -1 : 0;
// The loser's best moment after minute 5, as a share of all worth on the map.
const behind = w ? Math.max(0, ...line.slice(10).map(v => -v * w)) : 0;
// Dead time: share of 30 s slices after first blood with no death at all.
const slices = Math.max(1, Math.floor((g.time - Math.max(0, firstBlood)) / 30)); const busy = new Set(deathT.map(t => Math.floor(t / 30))); let quiet = 0; for (let i = Math.floor(Math.max(0, firstBlood) / 30); i < Math.floor(g.time / 30); i++) if (!busy.has(i)) quiet++;
// How long the match ran after the winner was at least 25% ahead for good.
let settled = line.length; for (let i = line.length - 1; i >= 0; i--) { if (line[i] * w > .25) settled = i; else break; }
const S = (s: any) => ({ pushes: s.pushes, fails: s.fails });
console.log(JSON.stringify({ home: spec.home ?? 0, out: spec.out ?? 1, map, seed: spec.seed ?? 1, res, win: res === 'draw' ? 'DRAW' : tag(res === 'home' ? H : O), t: Math.round(g.time), firstBlood: Math.round(firstBlood), firstB: Math.round(firstB), changes, lastChange, behind: +behind.toFixed(2), quiet: +(quiet / slices).toFixed(2), drag: w ? Math.round(g.time - settled * 30) : 0, lostH: lost[H], lostO: lost[O], mined: [Math.floor(g.stats.mined), Math.floor(g.stats.minedV)], peak, pushH: S(g.dir), pushO: S(g.dir.vs), line: spec.line ? line : undefined, spendH: spend[H], spendO: spend[O], madeH: made[H], madeO: made[O] }));
