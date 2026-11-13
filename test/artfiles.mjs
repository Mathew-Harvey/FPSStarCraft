// The art files beside the page (src/artfiles.ts, src/boot.ts, build.mjs). Run after npm run build: node test/artfiles.mjs
// Serves dist/ over http and checks that the small page loads every model and picture, that the bodies it builds match the page with
// the art inside (dist/index.html), that a second visit reads them from the browser cache, and that a page whose files are missing
// still starts and builds those kinds from code.
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const dist = join(dirname(fileURLToPath(import.meta.url)), '..', 'dist');
let block = new Set(), served = 0, names = [];
const srv = createServer((req, res) => {
  const path = decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, ''), file = join(dist, path);
  const name = path.replace(/^art\//, '');
  if (!file.startsWith(dist) || !existsSync(file) || block.has(name) || block.has('*') && path.startsWith('art/')) { res.writeHead(404); res.end(); return; }
  if (path.startsWith('art/')) { served++; names.push(name); }
  res.writeHead(200, { 'content-type': path.endsWith('.html') ? 'text/html' : path.endsWith('.webp') ? 'image/webp' : 'application/octet-stream' }); res.end(readFileSync(file));
});
await new Promise(r => srv.listen(0, r));
const base = `http://localhost:${srv.address().port}/`;
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else fail++; console.log((c ? 'ok   ' : 'FAIL ') + m); };

const MB = n => (n / 1048576).toFixed(2) + ' MB';
const frag = statSync(join(dist, 'fragment.html')).size, files = readdirSync(join(dist, 'art'));
ok(frag < 8 * 1048576, `published page is ${MB(frag)} (under 8 MB), ${files.length} art files beside it`);

const KINDS = ['rigger', 'linesman', 'gantry', 'cantor', 'warden', 'grazer', 'mulcher'];
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 960, height: 540 } });
async function open(url) {
  const p = await ctx.newPage(), errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto(url); await p.waitForFunction('window.__ore && __ore.game', null, { timeout: 120000 });
  const first = await p.evaluate(() => ({ ...window.__oreArt })), firstNames = names.slice();
  await p.evaluate(() => window.__oreArtFor ? __oreArtFor([0, 1, 2]) : 0); if (url.startsWith('http')) await p.waitForFunction('__oreArt.got + __oreArt.missing.length === __oreArt.all', null, { timeout: 120000 });
  // triangles in each kind's body, counted from its meshes
  const r = await p.evaluate(K => {
    const tri = o => { let n = 0; o.traverse(m => { if (m.isMesh && m.geometry) n += (m.geometry.index ? m.geometry.index.count : m.geometry.attributes.position.count) / 3; }); return n; };
    const out = {}; for (const k of K) out[k] = tri(__ore.models.unit(k).obj); return { art: { ...window.__oreArt }, tri: out };
  }, KINDS);
  await p.close(); return { ...r, errs, first, firstNames };
}

const inl = await open(pathToFileURL(join(dist, 'index.html')).href);
served = 0; names = []; const side = await open(base + 'play.html');
// The first visit fetches only Ironhold's and the Veyl's near models and pictures (and anything no faction owns) before the menu.
const LIST = new Function('return ' + readFileSync(join(dist, 'play.html'), 'utf8').match(/\[\{name:"[^]*?\}\]/)[0])();   // the file list the page carries, with each file's faction
const gloam = n => (LIST.find(x => x.name === n) || {}).f === 2;
const lvl = n => /\.(mid|far)\./.test(n);
const firstBytes = side.firstNames.reduce((s, n) => s + statSync(join(dist, 'art', n)).size, 0);
ok(side.firstNames.length > 10 && !side.firstNames.some(gloam), `the first load fetches ${side.firstNames.length} files (${MB(firstBytes)}) and none of the Gloam's`);
{ const N = side.firstNames, lastNear = N.reduce((m, n, i) => lvl(n) ? m : i, -1), firstLvl = N.findIndex(lvl); ok(firstLvl < 0 || firstLvl > lastNear, 'middle and far models are fetched after the near ones, not before the game starts'); }
const nearBytes = side.firstNames.filter(n => !lvl(n)).reduce((s, n) => s + statSync(join(dist, 'art', n)).size, 0);
console.log(`  first load for Ironhold against the Veyl: ${MB(nearBytes)} before the game starts, ${MB(firstBytes)} with the middle and far models after, of ${MB(files.reduce((s, n) => s + statSync(join(dist, "art", n)).size, 0))} in all`);
ok(side.art.got === side.art.want && side.art.want === files.length && !side.art.missing.length, `every faction asked for: ${side.art.got} of ${side.art.want} came, missing: ${side.art.missing.join(', ') || 'none'}`);
ok(KINDS.every(k => side.tri[k] === inl.tri[k] && side.tri[k] > 3000), 'every body matches the page with the art inside: ' + KINDS.map(k => `${k} ${side.tri[k]}`).join(', '));
ok(!side.errs.length && !inl.errs.length, 'no page errors ' + side.errs.concat(inl.errs).slice(0, 3).join(' | '));

served = 0; const again = await open(base + 'play.html');
ok(again.art.cached === again.art.all && served === 0, `second visit read ${again.art.cached} of ${again.art.all} from the cache, fetched ${served}`);

// A first visit (empty cache) that picks a match against the Gloam: the bar comes up, the Gloam's art comes, and the match is made with it.
{ const c = await b.newContext({ viewport: { width: 960, height: 540 } }), p = await c.newPage(), errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto(base + 'play.html'); await p.waitForFunction('window.__ore && __ore.game', null, { timeout: 120000 });
  const before = await p.evaluate(() => __oreArtHas([2]));
  const bar = await p.evaluate(() => { __ore.setFree(true); __ore.pickSide(0, 1); __ore.start(); return !!document.getElementById('artLoad'); });
  await p.waitForFunction(() => !document.getElementById('artLoad') && __ore.game.phase === 'play', null, { timeout: 120000 });
  const r = await p.evaluate(() => { const tri = o => { let n = 0; o.traverse(m => { if (m.isMesh && m.geometry && !m.userData.lv) n += (m.geometry.index ? m.geometry.index.count : m.geometry.attributes.position.count) / 3; }); return n; };
    const g = __ore.game, u = g.units.find(x => x.kind === 'grazer'); return { has: __oreArtHas([2]), tri: u ? tri(u.obj) : -1 }; });
  ok(!before && bar && r.has && Math.abs(r.tri - inl.tri.grazer) < 300 && !errs.length, `picking the Gloam fetches their art behind the bar, then the match has sculpted Grazers (${r.tri} triangles, errors: ${errs.length})`);
  await c.close(); }

// A fresh browser (empty cache) with two files the server will not give.
await ctx.close();
const ctx2 = await b.newContext({ viewport: { width: 960, height: 540 } });
const open2 = async url => { const p = await ctx2.newPage(), errs = []; p.on('pageerror', e => errs.push(e.message)); await p.goto(url); await p.waitForFunction('window.__ore && __ore.game', null, { timeout: 120000 });
  await p.evaluate(() => __oreArtFor([0, 1, 2])); await p.waitForFunction('__oreArt.got + __oreArt.missing.length === __oreArt.all', null, { timeout: 120000 });
  const r = await p.evaluate(K => { const tri = o => { let n = 0; o.traverse(m => { if (m.isMesh && m.geometry) n += (m.geometry.index ? m.geometry.index.count : m.geometry.attributes.position.count) / 3; }); return n; }; const out = {}; for (const k of K) out[k] = tri(__ore.models.unit(k).obj); return { art: { ...window.__oreArt }, tri: out }; }, KINDS); await p.close(); return { ...r, errs }; };
block = new Set(['rigger.webp', 'gantry.wasm']);
const miss = await open2(base + 'play.html?nocache=' + Date.now());
ok(miss.art.missing.sort().join() === 'gantry.wasm,rigger.webp', 'missing files are reported: ' + miss.art.missing.join(', '));
ok(miss.tri.rigger !== side.tri.rigger && miss.tri.gantry !== side.tri.gantry && miss.tri.linesman === side.tri.linesman, `rigger (no picture) and gantry (no model) use the built-in bodies (${miss.tri.rigger}, ${miss.tri.gantry} triangles), the rest are sculpted`);
ok(!miss.errs.length, 'no page errors with files missing ' + miss.errs.slice(0, 3).join(' | '));
block = new Set(['*']);
await ctx2.close(); const ctx3 = await b.newContext({ viewport: { width: 960, height: 540 } });
{ const p = await ctx3.newPage(), errs = []; p.on('pageerror', e => errs.push(e.message)); await p.goto(base + 'play.html'); await p.waitForFunction('window.__ore && __ore.game', null, { timeout: 120000 });
  await p.evaluate(() => __oreArtFor([0, 1, 2])); await p.waitForFunction('__oreArt.got + __oreArt.missing.length === __oreArt.all', null, { timeout: 120000 });
  const a = await p.evaluate(() => window.__oreArt); ok(a.got === 0 && a.missing.length === a.all && !errs.length, `with no art files at all the game still starts (${a.missing.length} missing, errors: ${errs.length})`); }
await b.close(); srv.close();
console.log(`${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
