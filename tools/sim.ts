// Headless matchups in Node, no browser: the same simulation the match server runs, stepped as fast as the CPU allows.
// Run: npm run sim -- '<json spec>'. Spec: { home: 0|1|2, out: 0|1|2, map, diff, human: [home, out], mins, seed, probe, verbose, every, dump, bdump }
// home and out are factions (0 Ironhold, 1 Veyl, 2 Gloam); the same faction twice is a mirror match. The result names the winner: IRON, VEYL or
// GLOAM, with a 2 on the end for the far side of a mirror.
// A side marked human keeps its economy brain but never says yes to a push from Night shift up: a player who turtles. `probe` names a cheese scenario below.
// Prints one JSON line: who won, when, both sides' state, Linesman grenade stats, and any broken state (NaN, negative ore).
import { noHud, noPipe } from '../server/shim';
import { Game } from '../src/game';
import { initHeadless } from '../src/gfx';
import { DIFFS, SIDE, FACTION, setMap, setSides, isFighter } from '../src/data';

initHeadless();
const spec = JSON.parse(process.argv[2] || '{}');
const map = spec.map ?? 0, diff = spec.diff ?? 1, mins = spec.mins ?? 30;
// Seeded randomness, so a run can be repeated.
let seed = spec.seed ?? 1; Math.random = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
setMap(map); const [H, out] = setSides(spec.home ?? 0, spec.out ?? 1);
const g = new Game(noPipe(), noHud, DIFFS[diff], map, null, null, true);
g.noRender = true; g.evq = []; g.me = null; g.phase = 'play';
for (const u of g.units) u.pilot = 0;
g.human = g.human.map(() => false); g.human[H] = !!spec.human?.[0]; g.human[out] = !!spec.human?.[1];
const nades = { n: 0, dmg: 0, kills: 0 }; { const ex = g.explode.bind(g); (g as any).explode = (p: any, team: number, dmg: number, r: number, from: any, mode: any) => { if (from && from.kind === 'linesman' && dmg > 0) { nades.n++; const before = g.units.filter(u => u.alive && u.team !== 0).reduce((a, u) => a + u.hp, 0), alive = g.units.filter(u => u.alive && u.team !== 0).length; ex(p, team, dmg, r, from, mode); nades.dmg += before - g.units.filter(u => u.alive && u.team !== 0).reduce((a, u) => a + u.hp, 0); nades.kills += alive - g.units.filter(u => u.alive && u.team !== 0).length; return; } return ex(p, team, dmg, r, from, mode); }; }
const bad: Record<string, number> = {}, note = (k: string) => { bad[k] = (bad[k] || 0) + 1; };
// Cheese probes: a scripted "player" doing one thing, to see whether it breaks the other side.
const st: any = {};
const probes: Record<string, (g: Game, t: number) => void> = {
  // A body parked beside the enemy's home seam, doing nothing. Does the bot economy freeze? (side = which team parks)
  park: (g, t) => { if (t < 120 || st.parked) return; st.parked = 1; const by = spec.side ? out : H, foe = by === H ? out : H, hq = g.ownB(FACTION[foe].hq, true, foe)[0]; if (!hq) return;
    const near = g.ores.filter(n => Math.hypot(n.pos.x - hq.pos.x, n.pos.z - hq.pos.z) < 40).sort((a, b) => Math.hypot(a.pos.x - hq.pos.x, a.pos.z - hq.pos.z) - Math.hypot(b.pos.x - hq.pos.x, b.pos.z - hq.pos.z))[2];
    const u = g.spawn(FACTION[by].lead, by, near.pos.x + 3, near.pos.z + 3); u.pilot = 99; if (spec.tough) u.hp = u.maxHp = 1e7; st.park = u; },
};
const side = (t: number) => { const F = FACTION[t]; return { army: g.army(t).length, work: g.own(F.worker, t).length, hq: g.ownB(F.hq, true, t).length, bld: g.ownB(undefined, false, t).length, ore: Math.floor(g.cash(t)), sup: g.supplyUsed(t) + '/' + g.supplyCap(t) }; };
const dt = 1 / 30; let last = 0;
while (g.phase !== 'over' && g.time < mins * 60) {
  if (spec.probe && probes[spec.probe]) probes[spec.probe](g, g.time);
  g.update(dt); g.evq!.length = 0;
  if (spec.bdump && [].concat(spec.bdump).some((d: number) => Math.abs(g.time - d) < dt / 2)) for (const t of [H, out]) console.log('BDUMP', t, g.buildings.filter(b => b.alive && b.team === t).map(b => `${b.kind}${b.built ? '' : '~' + b.progress.toFixed(2)}@${Math.round(b.pos.x)},${Math.round(b.pos.z)}${b.queue.length ? ' q' + b.queue.map(q => q.kind).join('+') : ''}`).join(' | '), 'ore', Math.round(g.cash(t)), 'units', JSON.stringify(g.units.filter(u => u.alive && u.team === t).reduce((o: any, u) => (o[u.kind] = (o[u.kind] || 0) + 1, o), {})), 'up', Object.keys(g.upOf(t)).filter(k => (g.upOf(t) as any)[k]).join(','));
  if (spec.pdump && Math.abs(g.time - spec.pdump) < dt / 2) { const why: string[] = []; for (const b of g.buildings) if (b.alive && b.team !== H && Math.hypot(b.pos.x, b.pos.z) < 110) why.push(`${b.team}:${b.kind}@${Math.round(b.pos.x)},${Math.round(b.pos.z)}`); console.log('PDUMP enemy near yard:', why.join(' '), '| depots', g.ownB('depot').map(b => Math.round(b.pos.x) + ',' + Math.round(b.pos.z)).join(' '), '| freeSpot', JSON.stringify(g.dir.freeSpot('depot', 8, 16)), '| sites', g.ownB(undefined, false, 0).filter(b => !b.built).map(b => b.kind + '@' + Math.round(b.pos.x) + ',' + Math.round(b.pos.z) + ' p' + b.progress.toFixed(2) + ' hp' + Math.round(b.hp) + ' builder ' + (b.builder ? b.builder.state + '@' + Math.round(b.builder.pos.x) + ',' + Math.round(b.builder.pos.z) : '-')).join(' '), 'sup', g.supplyUsed(0), g.supplyCap(0)); }
  if (spec.wdump && Math.abs(g.time - spec.wdump) < dt / 2) { const t = spec.wteam ?? H; console.log('WDUMP', g.own(FACTION[t].worker, t).map(u => `${u.state}@${Math.round(u.pos.x)},${Math.round(u.pos.z)}${u.node ? ' n' + Math.round(u.node.pos.x) + ',' + Math.round(u.node.pos.z) : ''} c${u.carrying}`).join(' | '), st.park ? 'park ' + st.park.alive + ' ' + Math.round(st.park.pos.x) + ',' + Math.round(st.park.pos.z) : ''); }
  if (spec.dump && [].concat(spec.dump).some((d: number) => Math.abs(g.time - d) < dt / 2)) for (const t of [H, out]) console.log('DUMP', t, g.army(t).map(u => `${u.kind}:${u.order.type}${u.order.path ? '/' + u.order.path.length : ''}@${Math.round(u.pos.x)},${Math.round(u.pos.z)}->${Math.round(u.order.x)},${Math.round(u.order.z)}${u.target ? ' T' + (u.target as any).kind : ''} ${u.state}`).join(' | '));
  if ((g as any).endT > 0 && g.phase !== 'over') { /* the end banner counts down in real time */ }
  for (const t of [H, out]) if (g.cash(t) < -1) note('negative ore ' + t);
  if (Math.floor(g.time / 30) !== last) { last = Math.floor(g.time / 30);
    for (const u of g.units) if (u.alive && !isFinite(u.pos.x + u.pos.z + u.hp)) note('nan ' + u.kind);
    for (const b of g.buildings) if (b.alive && !isFinite(b.hp)) note('nan ' + b.kind);
    if (spec.verbose && last % (spec.every || 4) === 0) { const pl = (s: any) => s.plan ? s.plan.phase + s.plan.book + (s.plan.target ? ':' + s.plan.target.kind + '@' + Math.round(s.plan.target.pos.x) + ',' + Math.round(s.plan.target.pos.z) : '') : '-' + (s.raidLive ? 'R' : '') + Math.round(s.nextPlan - g.time);
      const ord = (t: number) => g.army(t).reduce((o: any, u) => (o[u.order.type + (u.target ? '*' : '')] = (o[u.order.type + (u.target ? '*' : '')] || 0) + 1, o), {});
      console.log(Math.round(g.time), 'I', JSON.stringify(side(H)), pl(g.dir), JSON.stringify(ord(H)), '\n     O', JSON.stringify(side(out)), pl(g.dir.vs), JSON.stringify(ord(out))); } }
}
if (st.park) console.log('PARK mined iron', Math.floor(g.stats.mined), 'out', Math.floor(g.stats.minedV));
const tag = (t: number) => ['IRON', 'VEYL', 'GLOAM'][t % 3] + (t >= 3 ? '2' : ''), res = g.phase === 'over' ? tag(g.won ? H : out) : 'DRAW';
console.log(JSON.stringify({ nades, mined: [Math.floor(g.stats.mined), Math.floor(g.stats.minedV)], home: H, out, map, diff, human: spec.human || [0, 0], probe: spec.probe || '', seed: spec.seed ?? 1, res, t: Math.round(g.time), I: side(H), O: side(out), bad }));
