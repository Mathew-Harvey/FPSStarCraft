// The breakpoint list (stream L, round 3): for every attacker and target pair, how many hits kill a fresh target, and whether a 10% change
// in the hit (one research level, a bot multiplier, a balance nudge) moves that count. Reads the hit log tools/duels.ts writes with "hits".
// Run: node tools/run-ts.mjs tools/duels.ts '{"runs":1,"hits":"hits.jsonl"}' (and again with "ups":1 for every research level bought), then
//      node tools/run-ts.mjs tools/breakpoints.ts hits.jsonl [most hits to list, default 6: past six, any 10% change moves a step]
// A hit is what one blow took off health and shield together, so the target's armour, Hide and the Veyl bot shrug are already in it.
// Health is the target's full health plus shield; healing and shield regrowth between hits are left out, so a slow attacker can need one
// hit more than this says.
import { readFileSync } from 'node:fs';
import { UNIT } from '../src/data';

const file = process.argv[2], cap = Number(process.argv[3] || 6);
const by = new Map<string, Map<number, number>>(), full = new Map<string, number>();   // full: the target's health and shield with research
for (const l of readFileSync(file, 'utf8').trim().split('\n')) {
  const [a, b, took, kill, max] = JSON.parse(l); if (max) full.set(b, Math.max(full.get(b) || 0, max)); if (kill) continue;   // a killing blow is cut short by the health left, so it says nothing
  const k = `${a} ${b}`, m = by.get(k) || new Map(); m.set(took, (m.get(took) || 0) + 1); by.set(k, m);
}
const rows: { a: string; b: string; hit: number; hp: number; n: number; lo: number; hi: number }[] = [];
for (const [k, m] of by) {
  const [a, b] = k.split(' '), u = (UNIT as any)[b]; if (!u) continue;
  // The hit that does most of the work (count times size), so a Cantor's 26 cut counts and its 0.78 side cut does not.
  const [hit] = [...m.entries()].sort((x, y) => y[0] * y[1] - x[0] * x[1])[0];
  const hp = full.get(b) || u.hp + (u.shield || 0), n = Math.ceil(hp / hit - 1e-9); if (n > cap || n < 1) continue;
  const lo = Math.ceil(hp / (hit * 1.1) - 1e-9), hi = Math.ceil(hp / (hit * .9) - 1e-9);
  rows.push({ a, b, hit, hp, n, lo, hi });
}
const near = rows.filter(r => r.lo !== r.n || r.hi !== r.n).sort((x, y) => x.n - y.n || x.a.localeCompare(y.a));
console.log(`${rows.length} pairs kill in ${cap} hits or fewer; ${near.length} sit within 10% of a step:`);
for (const r of near) console.log(`${r.a.padEnd(12)} on ${r.b.padEnd(12)} hit ${String(Math.round(r.hit * 10) / 10).padStart(6)} into ${String(Math.round(r.hp)).padStart(4)}: ${r.n} hits` +
  `${r.lo !== r.n ? `, ${r.lo} with a hit 10% harder` : ''}${r.hi !== r.n ? `, ${r.hi} with a hit 10% softer` : ''}`);
