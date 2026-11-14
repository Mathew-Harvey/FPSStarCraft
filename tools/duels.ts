// Duel table (stream L, plan check 1): every fighter against every fighter of another faction (and its own) at equal cost, on open ground,
// nobody playing. Prints one JSON line per pairing: how many of each side, wins each way, and the share of each side's value left at the end.
// Value is ore + 2 x Flux (Flux is the scarce one). A pair where neither side can hit the other is skipped; a pair where only one side can
// is recorded as one-sided and not judged.
// Run: node tools/run-ts.mjs tools/duels.ts '{"runs":20,"budget":1200,"only":"linesman","shard":0,"of":1,"ups":0}'
//   only: one kind (or a comma list) to fight everyone; shard/of: split the work over processes; ups: 1 buys every research level first.
//   node tools/duels.ts sum <file.jsonl> prints the table and flags anything outside 25% to 75%.
import { noHud, noPipe } from '../server/shim';
import { Game } from '../src/game';
import { initHeadless } from '../src/gfx';
import { DIFFS, UNIT, MAP, UPGRADES, CLEAVE, setMap, setSides, isWorker, fac, type Kind } from '../src/data';
import { costOf } from '../src/core/econ';
import { readFileSync } from 'node:fs';

const val = (k: Kind) => { const c = costOf(k); return c[0] + 2 * c[1]; };
// Units with no gun of their own (healers, carriers, spotters). They are judged by what they add to others, not here.
const SUPPORT = new Set(['patch', 'hopper', 'surveyor', 'shaftmine']);
const canHit = (a: Kind, b: Kind) => { const h = (UNIT[a] as any).hits || 'ground', air = !!(UNIT[b] as any).air; return h === 'both' || (h === 'air' && air) || (h === 'ground' && !air); };

if (process.argv[2] === 'sum') {
  const rows = readFileSync(process.argv[3], 'utf8').trim().split('\n').map(l => JSON.parse(l));
  const out: string[] = [];
  for (const r of rows.sort((x, y) => x.a.localeCompare(y.a))) {
    const p = r.wa / Math.max(1, r.wa + r.wb);
    out.push(`${r.a.padEnd(12)} x${String(r.na).padStart(2)} v ${r.b.padEnd(12)} x${String(r.nb).padStart(2)}: ${r.one ? 'one-sided (' + r.one + ' cannot hit back)' : `${r.wa} to ${r.wb}, left ${Math.round(r.la * 100)}% v ${Math.round(r.lb * 100)}%${p < .25 || p > .75 ? '  <-- outside 25-75' : ''}`}`);
  }
  console.log(out.join('\n')); process.exit(0);
}

initHeadless();
const o = JSON.parse(process.argv[2] || '{}');
// set: trial numbers, e.g. {"snapper":{"hp":60}}; vhp / vdmg: the Veyl bot multipliers (Game.vBoost).
for (const k in o.set || {}) Object.assign((UNIT as any)[k], o.set[k]);
if (o.cleaveK !== undefined) CLEAVE.k = o.cleaveK; if (o.cleave !== undefined) CLEAVE.n = o.cleave;
const runs = o.runs ?? 20, budget = o.budget ?? 1200;
const kinds = (Object.keys(UNIT) as Kind[]).filter(k => { const u = UNIT[k] as any; return u.cost + (u.flux || 0) > 0 && u.time > 0 && !isWorker(k) && !u.ward && !/\(/.test(u.name) && !SUPPORT.has(k); });
const only = o.only ? String(o.only).split(',') : null;
const pairs: [Kind, Kind][] = [];
if (only) { const vs = o.vs ? String(o.vs).split(',') : null; for (const a of only as Kind[]) for (const b of kinds) if (!vs || vs.includes(b)) if (!(vs && only.includes(b) && only.indexOf(b) < only.indexOf(a))) pairs.push([a, b]); } else for (const a of kinds) for (const b of kinds) if (a <= b) pairs.push([a, b]);
const mine = pairs.filter((_, i) => i % (o.of ?? 1) === (o.shard ?? 0)).slice(o.skip ?? 0);   // skip: resume a shard after its first n pairs

for (const [ak, bk] of mine) {
  const ha = canHit(ak, bk), hb = canHit(bk, ak); if (!ha && !hb) continue;
  const na = Math.max(1, Math.round(budget / val(ak))), nb = Math.max(1, Math.round(na * val(ak) / val(bk)));
  if (ha !== hb) { console.log(JSON.stringify({ a: ak, b: bk, na, nb, one: ha ? bk : ak })); continue; }
  let wa = 0, wb = 0, la = 0, lb = 0, secs = 0;
  for (let s = 1; s <= runs; s++) {
    let seed = s * 77 + 13; Math.random = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
    const fA = UNIT[ak].team, fB = UNIT[bk].team;
    setMap(0); const [A, B] = setSides(fA, fB); const g = new Game(noPipe(), noHud, DIFFS[1], 0, null, null, true);
    g.noRender = true; g.evq = []; g.me = null; g.phase = 'play'; g.human = g.human.map(() => false); g.eco = true; if (o.vhp) g.vBoost.hp = o.vhp; if (o.vdmg) g.vBoost.dmg = o.vdmg;   // as in a two-economy match: bot bodies, Veyl vBoost on (g as any).purse = (g as any).purse?.map(() => 0);
    for (const S of [g.dir as any, (g.dir as any).vs]) if (S) { S.auto = false; S.qmT = 1e9; }
    for (const u of g.units) { u.alive = false; g.scene.remove(u.obj); } g.units = [];
    if (o.ups) for (const t of [A, B]) { const up = g.upOf(t) as any; for (const d of UPGRADES as any[]) if (d.team === undefined ? fac(t) === 0 : d.team === fac(t)) up[d.key] = true; }
    const [mx, mz] = MAP.mid!;
    const mk = (k: Kind, t: number, n: number, dx: number) => { const out = []; for (let i = 0; i < n; i++) { const u = g.spawn(k, t, mx + dx + (i % 5) * 1.7 * Math.sign(dx), mz + Math.floor(i / 5) * 1.7 - 3.4); u.order = { type: 'amove', x: mx - dx, z: mz } as any; out.push(u); } return out; };
    const e = s % 2 ? 1 : -1, ga = mk(ak, A, na, -14 * e), gb = mk(bk, B, nb, 14 * e);   // odd runs swap the ends, so any lean of the ground or the turn order cancels
    let i = 0; for (; i < 30 * 120; i++) { g.update(1 / 30); g.evq!.length = 0; if (!ga.some(u => u.alive) || !gb.some(u => u.alive)) break; }
    const left = (gs: any[]) => gs.reduce((a, u) => a + (u.alive ? Math.max(0, u.hp) / (u.maxHp || UNIT[u.kind as Kind].hp) : 0), 0) / gs.length;
    const ra = left(ga), rb = left(gb); la += ra / runs; lb += rb / runs; secs += i / 30 / runs;
    if (ra > rb) wa++; else if (rb > ra) wb++;
  }
  console.log(JSON.stringify({ a: ak, b: bk, na, nb, wa, wb, la: +la.toFixed(3), lb: +lb.toFixed(3), secs: Math.round(secs) }));
}
