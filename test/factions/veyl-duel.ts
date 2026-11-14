// Equal-cost fights on open ground: a Veyl group against an enemy group, nobody playing, to tune the Veyl numbers.
// Run: node tools/run-ts.mjs test/factions/veyl-duel.ts '[["cantor",6],["linesman",10]]' [seeds=6] [upgrades a,b] — prints who is left.
import { noHud, noPipe } from '../../server/shim';
import { Game } from '../../src/game';
import { initHeadless } from '../../src/gfx';
import { DIFFS, UNIT, MAP, setMap, setSides, fac, type Kind } from '../../src/data';
import { costOf } from '../../src/core/econ';
initHeadless();
const [[ak, an], [bk, bn]] = JSON.parse(process.argv[2]) as [[Kind, number], [Kind, number]], seeds = +(process.argv[3] || 6);
const fA = UNIT[ak].team, fB = UNIT[bk].team; let wa = 0, wb = 0; const left: string[] = [];
for (let s = 1; s <= seeds; s++) {
  let seed = s * 77; Math.random = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
  setMap(0); const [A, B] = setSides(fA, fB); const g = new Game(noPipe(), noHud, DIFFS[1], 0, null, null, true);
  g.noRender = true; g.evq = []; g.me = null; g.phase = 'play'; g.human = g.human.map(() => false); g.purse = g.purse.map(() => 0);
  for (const u of g.units) { u.alive = false; g.scene.remove(u.obj); } g.units = [];
  const [mx, mz] = MAP.mid!; const mk = (k: Kind, t: number, n: number, dx: number) => { const out = []; for (let i = 0; i < n; i++) { const u = g.spawn(k, t, mx + dx + (i % 4) * 1.6, mz + Math.floor(i / 4) * 1.6 - 3); u.order = { type: 'amove', x: mx - dx, z: mz }; out.push(u); } return out; };
  const ga = mk(ak, A, an, -14), gb = mk(bk, B, bn, 14);
  for (const k of (process.argv[4] || '').split(',').filter(Boolean)) (g.upOf(A) as any)[k] = true;
  const dealt: Record<string, number> = {}, d0 = g.damage.bind(g); (g as any).damage = (t: any, a: number, f: any, ...r: any[]) => { const h = t.hp + (t.shield || 0), out = d0(t, a, f, ...r); if (f) { dealt[f.kind] = (dealt[f.kind] || 0) + h - t.hp - (t.shield || 0); dealt[f.kind + "#"] = (dealt[f.kind + "#"] || 0) + 1; dealt[f.kind + "~"] = a; } return out; };
  for (let i = 0; i < 30 * 90; i++) { g.update(1 / 30); g.evq!.length = 0; if (!ga.some(u => u.alive) || !gb.some(u => u.alive)) break; }
  const la = ga.filter(u => u.alive).length, lb = gb.filter(u => u.alive).length; if (la > lb || (la && !lb)) wa++; else if (lb) wb++; left.push(`${la}/${an} v ${lb}/${bn} (${Object.entries(dealt).map(([k, v]) => k + ' ' + Math.round(v)).join(', ')}, ${Math.round(g.time)} s)`);
}
const ca = costOf(ak), cb = costOf(bk);
console.log(`${an} ${UNIT[ak].name} (${an * ca[0]}+${an * ca[1]}) v ${bn} ${UNIT[bk].name} (${bn * cb[0]}+${bn * cb[1]}): ${wa} to ${wb} | ${left.join(', ')}`);
