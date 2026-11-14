// A table of bot matches for a fairness and fun review: every pairing, both ends, several maps, several seeds, four matches at a time.
// Run: node tools/table.mjs [seeds=10] [pairs=01,10,02,20,12,21,00,11,22] [maps=0,1,2 or all] ['{"ot":0}' extra options for tools/review.ts]
// A pair is yard faction then far faction (0 Ironhold, 1 Veyl, 2 Gloam). The rows go to dist/table.jsonl; `node tools/table.mjs sum <file>`
// adds up a file of rows again. Ten seeds of all nine pairs on three maps is 270 matches and takes about a quarter of an hour.
import { build } from 'esbuild';
import { spawn } from 'node:child_process';
import { appendFileSync, writeFileSync, readFileSync, mkdirSync } from 'node:fs';

const N = ['Ironhold', 'Veyl', 'Gloam'];
function sum(rows) {
  const out = [], say = s => out.push(s), med = xs => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : 0; }, mean = xs => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);
  const wonBy = (r, f) => (r.res === 'home' && r.home === f) || (r.res === 'out' && r.out === f), n = (rs, fn) => rs.filter(fn).length;
  say(`${rows.length} matches`);
  for (let a = 0; a < 3; a++) for (let b = a; b < 3; b++) {
    const rs = rows.filter(r => (r.home === a && r.out === b) || (r.home === b && r.out === a)); if (!rs.length) continue;
    if (a !== b) say(`${N[a]} v ${N[b]}: ${n(rs, r => wonBy(r, a))} to ${n(rs, r => wonBy(r, b))}, ${n(rs, r => r.res === 'draw')} undecided | ${N[a]} at the yard ${n(rs, r => r.home === a && r.res === 'home')} to ${n(rs, r => r.home === a && r.res === 'out')} | ${N[b]} at the yard ${n(rs, r => r.home === b && r.res === 'home')} to ${n(rs, r => r.home === b && r.res === 'out')}`);
    else say(`${N[a]} mirror: yard ${n(rs, r => r.res === 'home')}, far end ${n(rs, r => r.res === 'out')}, ${n(rs, r => r.res === 'draw')} undecided | by map ` + [...new Set(rs.map(r => r.map))].map(m => `${m}: ${n(rs, r => r.map === m && r.res === 'home')} to ${n(rs, r => r.map === m && r.res === 'out')}`).join(', '));
  }
  const dec = rows.filter(r => r.res !== 'draw'), T = dec.map(r => r.t / 60), sorted = [...T].sort((a, b) => a - b), q = p => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))] || 0;
  say(`All: yard ${n(rows, r => r.res === 'home')}, far end ${n(rows, r => r.res === 'out')}, undecided at the time limit ${n(rows, r => r.res === 'draw')}`);
  say(`Length of a decided match: middle ${med(T).toFixed(1)} min, one in ten under ${q(.1).toFixed(1)}, one in ten over ${q(.9).toFixed(1)}`);
  say(`First fighter dies at ${(med(rows.filter(r => r.firstBlood > 0).map(r => r.firstBlood)) / 60).toFixed(1)} min, first building falls at ${(med(rows.filter(r => r.firstB > 0).map(r => r.firstB)) / 60).toFixed(1)} min (middle match)`);
  say(`The lead never changed in ${n(dec, r => r.changes === 0)} of ${dec.length} decided matches, changed once in ${n(dec, r => r.changes === 1)}, more in ${n(dec, r => r.changes > 1)}`);
  say(`Comebacks (the winner was 8% of the map's worth behind after minute 5): ${n(dec, r => r.behind >= .08)} of ${dec.length}`);
  say(`The winner lost no building in ${n(dec, r => (r.res === 'home' ? r.lostH : r.lostO).b === 0)} of ${dec.length}`);
  say(`Quiet time (30 s slices with no death, after the first): ${Math.round(med(rows.map(r => r.quiet)) * 100)}%`);
  say(`Ore mined a minute: yard ${Math.round(mean(rows.map(r => r.mined[0] / r.t * 60)))}, far end ${Math.round(mean(rows.map(r => r.mined[1] / r.t * 60)))}; by faction ` + [0, 1, 2].map(f => `${N[f]} ${Math.round(mean([...rows.filter(r => r.home === f).map(r => r.mined[0] / r.t * 60), ...rows.filter(r => r.out === f).map(r => r.mined[1] / r.t * 60)]))}`).join(', '));
  // By map size (codes: base + 10 x size; 0 Medium, 1 Small, 2 Large, 3 Vast).
  const SZ = ['Medium', 'Small', 'Large', 'Vast'], sz = r => Math.floor(r.map / 10) % 10;
  for (const z of [...new Set(rows.map(sz))].sort()) { const rs = rows.filter(r => sz(r) === z); say(`${SZ[z]} maps: ${rs.length} matches, ${n(rs, r => r.res === 'draw')} undecided, middle length ${med(rs.filter(r => r.res !== 'draw').map(r => r.t / 60)).toFixed(1)} min`); }
  // Spend (gate 3): each faction's spend by kind across every table it played, and the biggest unit share of army spend in each pairing.
  if (rows.some(r => r.spendH)) {
    const tot = [{}, {}, {}], add = (f, sp) => { for (const k in sp || {}) tot[f][k] = (tot[f][k] || 0) + sp[k]; };
    for (const r of rows) { add(r.home, r.spendH); add(r.out, r.spendO); }
    for (let f = 0; f < 3; f++) { const t = tot[f], ks = Object.keys(t).filter(k => k[0] === 'u' || k[0] === 'b'); if (!ks.length) continue;
      const all = ks.reduce((a, k) => a + t[k], 0), army = ks.filter(k => k[0] === 'u').reduce((a, k) => a + t[k], 0);
      say(`${N[f]} spend (units and buildings, ${Math.round(all)} in all): ` + ks.sort((a, b) => t[b] - t[a]).map(k => `${k.slice(2)} ${(100 * t[k] / all).toFixed(1)}%${k[0] === 'u' ? ` (army ${(100 * t[k] / Math.max(1, army)).toFixed(0)}%)` : ''}`).join(', '));
      const rs = Object.keys(t).filter(k => k[0] === 'r'); if (rs.length) say(`  ${N[f]} research bought: ` + rs.sort((a, b) => t[b] - t[a]).map(k => `${k.slice(2)} ${Math.round(t[k])}`).join(', ')); }
    for (let a = 0; a < 3; a++) for (let b = a; b < 3; b++) { const rs = rows.filter(r => (r.home === a && r.out === b) || (r.home === b && r.out === a)); if (!rs.length) continue;
      for (const f of a === b ? [a] : [a, b]) { const t = {}; for (const r of rs) { if (r.home === f) for (const k in r.spendH || {}) if (k[0] === 'u') t[k] = (t[k] || 0) + r.spendH[k]; if (r.out === f) for (const k in r.spendO || {}) if (k[0] === 'u') t[k] = (t[k] || 0) + r.spendO[k]; }
        const all = Object.values(t).reduce((x, y) => x + y, 0), top = Object.keys(t).sort((x, y) => t[y] - t[x])[0];
        if (top) say(`  ${N[f]} in ${N[a]} v ${N[b]}: top unit ${top.slice(2)} ${(100 * t[top] / all).toFixed(0)}% of army spend${t[top] / all > .35 ? ' (over 35%)' : ''}`); } }
  }
  return out.join('\n');
}

if (process.argv[2] === 'sum') { console.log(sum(readFileSync(process.argv[3], 'utf8').trim().split('\n').map(l => JSON.parse(l)))); process.exit(0); }
const [seeds = '10', pairs = '01,10,02,20,12,21,00,11,22', maps0 = '0,1,2', extra = '{}'] = process.argv.slice(2);
const maps = maps0 === 'all' ? '0,1,2,10,11,12,20,21,22,30,31,32' : maps0;   // all: the three 1v1 maps at every size
mkdirSync('dist', { recursive: true });
const sfx = { name: 'sfx', setup(b) { b.onResolve({ filter: /^sfx:bank$/ }, () => ({ path: 'x', namespace: 'sfx' })); b.onLoad({ filter: /.*/, namespace: 'sfx' }, () => ({ contents: 'export default {}', loader: 'js' })); } };
const mesh = { name: 'mesh', setup(b) { b.onResolve({ filter: /^(mesh:bank|art:files)$/ }, a => ({ path: a.path, namespace: 'mesh' })); b.onLoad({ filter: /.*/, namespace: 'mesh' }, a => ({ contents: a.path === 'art:files' ? 'export default []' : 'export default {}', loader: 'js' })); } };
await build({ entryPoints: ['tools/review.ts'], bundle: true, platform: 'node', format: 'esm', target: 'node20', outfile: `dist/review-${process.pid}.mjs`, plugins: [sfx, mesh], logLevel: 'warning', banner: { js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);" } });
const jobs = []; for (const p of pairs.split(',')) for (const m of maps.split(',')) for (let s = 1; s <= +seeds; s++) jobs.push({ ...JSON.parse(extra), home: +p[0], out: +p[1], map: +m, seed: 1000 + s * 7919 + +m * 31 + +p[0] * 3 + +p[1] });
const file = process.env.OUT || 'dist/table.jsonl', rows = []; writeFileSync(file, ''); let i = 0, live = 0;
await new Promise(done => { const next = () => { if (i >= jobs.length && !live) return done(); while (live < (+process.env.PAR || 4) && i < jobs.length) { const j = jobs[i++]; live++; const c = spawn('node', [`dist/review-${process.pid}.mjs`, JSON.stringify(j)]); let buf = ''; c.stdout.on('data', d => buf += d);
  c.on('close', () => { live--; const l = buf.trim().split('\n').pop(); if (l && l[0] === '{') { rows.push(JSON.parse(l)); appendFileSync(file, l + '\n'); } else console.error('no result for', JSON.stringify(j)); if (rows.length % 30 === 0) console.error(`${rows.length} of ${jobs.length}`); next(); }); } }; next(); });
console.log(sum(rows));
