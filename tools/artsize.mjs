// The size limits for each figure's art, and which figures are over them. Run after npm run build: node tools/artsize.mjs [kind ...]
// A match fetches its two factions' near models and pictures before it starts (src/artfiles.ts), so every figure adds to the wait.
// Limits, as the page fetches them (deflated model + picture):
//   a body: 450 KB near model and picture together, 750 KB for a big one (a walker, a flier carrier: UnitDef supply 4 or more)
//   a building: 350 KB model and wear picture together
//   middle model (<kind>.mid.bin): 120 KB; far model (<kind>.far.bin): 40 KB
// Exits 1 when a figure is over, listing each with what to trim first.
import { readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
const LIST = new Function('return ' + readFileSync('dist/play.html', 'utf8').match(/\[\{name:"[^]*?\}\]/)[0])();
const big = new Set(), bld = new Set();
for (const f of ['ironhold', 'veyl', 'gloam']) { const s = readFileSync(`src/factions/${f}/numbers.ts`, 'utf8');
  for (const m of s.matchAll(/^\s+(\w+): \{ name:[^\n]*?supply: (\d+)/gm)) if (+m[2] >= 4) big.add(m[1]);
  for (const m of s.matchAll(/^\s+(\w+): \{ name:[^\n]*?\bhx: /gm)) bld.add(m[1]); }
const kindOf = n => n.replace(/\.(wasm|webp)$/, '').replace(/\.(mid|far|wear|top)$/, ''), K = 1024;
const by = {};
for (const f of LIST) { const k = kindOf(f.name), e = by[k] || (by[k] = { near: 0, pic: 0, mid: 0, far: 0, wear: false }); 
  if (/\.mid\./.test(f.name)) e.mid += f.bytes; else if (/\.far\./.test(f.name)) e.far += f.bytes; else if (f.name.endsWith('.webp')) { e.pic += f.bytes; if (f.name.includes('.wear.')) e.wear = true; } else e.near += f.bytes; }
const only = process.argv.slice(2), over = [];
for (const [k, e] of Object.entries(by)) {
  if (only.length && !only.includes(k)) continue;
  const building = e.wear || bld.has(k), lim = building ? 350 : big.has(k) ? 750 : 450, tot = (e.near + e.pic) / K;
  const why = [];
  if (tot > lim) why.push(`near model and picture ${tot | 0} KB, limit ${lim} KB (${e.pic > e.near ? `picture ${e.pic / K | 0} KB: bake it at 1024 or lower the webp quality` : `model ${e.near / K | 0} KB: decimate the parts nobody sees up close`})`);
  if (e.mid / K > 120) why.push(`middle model ${e.mid / K | 0} KB, limit 120 KB (art/kit/lod.py, MID=3000)`);
  if (e.far / K > 40) why.push(`far model ${e.far / K | 0} KB, limit 40 KB (art/kit/lod.py, FAR=600)`);
  if (why.length) over.push(`${k}: ${why.join('; ')}`); else if (only.length) console.log(`${k}: within the limits (${tot | 0} KB of ${lim} KB)`);
}
// A painted body needs a middle and a far model (art/kit/lod.py) made from its current near model, or it shrinks to a speck from high up.
const headOf = p => { const b = readFileSync(p); return JSON.parse(b.subarray(4, 4 + b.readUInt32LE(0)).toString()); };
for (const k of Object.keys(by)) {
  if (only.length && !only.includes(k) || bld.has(k) || !existsSync(`assets/mesh/${k}.webp`)) continue;
  const stamp = createHash('sha1').update(readFileSync(`assets/mesh/${k}.bin`)).digest('hex').slice(0, 10), miss = [];
  for (const t of ['mid', 'far']) { const p = `assets/mesh/${k}.${t}.bin`; if (!existsSync(p)) miss.push(`no ${t} model`); else { const s = headOf(p).src; if (s && s !== stamp) miss.push(`${t} model made from an older near model`); } }
  if (miss.length) over.push(`${k}: ${miss.join(', ')} (run: python art/kit/lod.py ${k})`);
}
console.log(over.length ? `${over.length} over the limits:\n  ` + over.join('\n  ') : 'every figure is within the limits'); process.exit(over.length ? 1 : 0);
