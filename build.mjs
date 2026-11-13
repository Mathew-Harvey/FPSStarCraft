// Bundles src/main.ts and inlines it with the CSS into one HTML page, with the art as files beside it in dist/art/.
// dist/index.html and dist/play.html are the game; dist/fragment.html is the same page without the document wrapper, for hosts that
// supply their own. INLINE=1 puts the art inside the page too.
import { build } from 'esbuild';
import { readFileSync, writeFileSync, mkdirSync, readdirSync, rmSync, existsSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { deflateRawSync } from 'node:zlib';

// `import BANK from 'sfx:bank'` gives the page every sound in assets/sfx as base64, keyed by file name.
// The match server never plays a sound, so it gets an empty bank.
const sfxBank = (empty) => ({ name: 'sfx-bank', setup(b) {
  b.onResolve({ filter: /^sfx:bank$/ }, () => ({ path: 'sfx-bank', namespace: 'sfx' }));
  b.onLoad({ filter: /.*/, namespace: 'sfx' }, () => {
    const bank = {}; if (!empty) for (const f of readdirSync('assets/sfx').sort()) if (f.endsWith('.webm')) bank[f.slice(0, -5)] = readFileSync('assets/sfx/' + f).toString('base64');
    return { contents: 'export default ' + JSON.stringify(bank), loader: 'js' };
  });
} });
// The sculpted models in assets/mesh (see art/): `<kind>.bin` (deflated here, src/meshes.ts opens them with fflate), and the painted
// pictures `<kind>.webp` (a figure's paint) and `<kind>.wear.webp` (a building's wear).
// Two ways to carry them:
//  - inside the page (`import BANK from 'mesh:bank'` gives base64 keyed by name, a picture as `<name>.tex`), only with INLINE=1.
//  - beside the page as files in dist/art/ (models as <kind>.wasm, see artList; `import FILES from 'art:files'` lists them with their sizes and a version), fetched by
//    src/artfiles.ts as each match needs it. Every page is built this way unless INLINE=1. The match server never draws, so it gets neither and builds the code-made stand-ins.
const ART = 'assets/mesh';
const artNames = () => readdirSync(ART).filter(f => f.endsWith('.bin') || f.endsWith('.webp')).sort();
const artBytes = (f) => f.endsWith('.bin') ? deflateRawSync(readFileSync(ART + '/' + f), { level: 9 }) : readFileSync(ART + '/' + f);
const bankKey = (f) => f.endsWith('.bin') ? f.slice(0, -4) : f.slice(0, -5) + '.tex';
const artModules = (mode) => ({ name: 'art', setup(b) {
  b.onResolve({ filter: /^(mesh:bank|art:files)$/ }, a => ({ path: a.path, namespace: 'art' }));
  b.onLoad({ filter: /.*/, namespace: 'art' }, a => {
    if (a.path === 'art:files') return { contents: 'export default ' + JSON.stringify(mode === 'files' ? artList() : []), loader: 'js' };
    const bank = {}; if (mode === 'inline') for (const f of artNames()) bank[bankKey(f)] = artBytes(f).toString('base64');
    return { contents: 'export default ' + JSON.stringify(bank), loader: 'js' };
  });
} });
// Writes dist/art/ and returns what is in it. The version is a hash of the bytes, so a browser that cached an old file fetches the new one.
let listed = null;
function artList() {
  if (listed) return listed;
  rmSync('dist/art', { recursive: true, force: true }); mkdirSync('dist/art', { recursive: true });
  // A model is published as <kind>.wasm: the artifact service only serves standard web media types and refuses .bin (415), and
  // application/wasm is served byte for byte. The bytes are the deflated model, not WebAssembly.
  const fac = artFactions();
  listed = artNames().map(f => { const b = artBytes(f), name = f.replace(/\.bin$/, '.wasm'), kind = name.replace(/\.(wasm|webp)$/, '').replace(/\.(mid|far|wear|top)$/, ''); writeFileSync('dist/art/' + name, b); return { name, bytes: b.length, v: createHash('sha1').update(b).digest('hex').slice(0, 10), f: fac(kind) }; });
  return listed;
}
// Which faction's art each kind is: the faction whose code names it ('kind' or kind:), so the page fetches it only for a match with that
// faction (src/artfiles.ts). A kind named by more than one faction's code, or by none, is shared (-1) and comes with any match.
function artFactions() {
  const read = d => existsSync(d) ? (statSync(d).isDirectory() ? readdirSync(d).flatMap(n => read(d + '/' + n)) : d.endsWith('.ts') ? [readFileSync(d, 'utf8')] : []) : [];
  const src = [read('src/factions/ironhold').concat(read('src/look-ironhold.ts')).join('\n'), read('src/factions/veyl').join('\n'), read('src/factions/gloam').join('\n')];
  return kind => { const re = new RegExp(`['"]${kind}['"]|\\b${kind}\\s*:`); const hit = src.map((t, i) => re.test(t) ? i : -1).filter(i => i >= 0); return hit.length === 1 ? hit[0] : -1; };
}
import { createServer } from 'node:http';

const INLINE = process.env.INLINE === '1';
const wrap = (page) => '<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width,initial-scale=1">\n</head>\n<body>\n' + page + '</body>\n</html>\n';
async function page(minify, mode) {
  const out = await build({ entryPoints: ['src/boot.ts'], bundle: true, minify, format: 'iife', target: 'es2020', write: false, legalComments: 'none', plugins: [sfxBank(false), artModules(mode)] });
  const js = out.outputFiles[0].text.replace(/<\/script/g, '<\\/script');
  const css = readFileSync('src/style.css', 'utf8');
  return readFileSync('src/page.html', 'utf8').replace('/*__CSS__*/', () => css).replace('/*__JS__*/', () => js);
}
async function bundle(minify) {
  listed = null; mkdirSync('dist', { recursive: true });
  // The art sits beside the page in dist/art/ and is fetched as a match needs it. INLINE=1 puts it all inside instead (one file that opens
  // from disk, 50 MB and more); without it, a page opened from disk starts with the code-built bodies.
  const side = await page(minify, INLINE ? 'inline' : 'files'), inl = side;
  writeFileSync('dist/index.html', wrap(side));         // the game, served from a web server (the match server serves this one)
  writeFileSync('dist/fragment.html', side);            // the published page: art beside it in dist/art/
  writeFileSync('dist/play.html', wrap(side));          // the same, for the tests (test/page.mjs)
  if (INLINE) rmSync('dist/art', { recursive: true, force: true });
  // The match server: the same game code, bundled for Node, with the page beside it.
  await build({ entryPoints: ['server/main.ts'], bundle: true, minify: false, platform: 'node', format: 'esm', target: 'node20', outfile: 'dist/server.mjs', legalComments: 'none', plugins: [sfxBank(true), artModules('none')], banner: { js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);" }, logLevel: 'warning' });
  // ---- stream K: the replay player (src/replay-worker.ts), a Web Worker the page starts beside itself to play a replay. It is the match
  // server's code, built the same way (no art, no sound), so a replay rolls the same dice in the page as the match did on the server.
  // A file of its own, dist/replay-worker.js, so it adds nothing to the page's size; the match server serves it too.
  await build({ entryPoints: ['src/replay-worker.ts'], bundle: true, minify, format: 'iife', target: 'es2020', outfile: 'dist/replay-worker.js', legalComments: 'none', plugins: [sfxBank(true), artModules('none')], logLevel: 'warning' });
  const art = (listed || []).reduce((s, f) => s + f.bytes, 0);
  return { inl: wrap(inl), side, art, files: (listed || []).length };
}

if (process.argv.includes('--serve')) {
  createServer(async (req, res) => {
    try {
      const path = decodeURIComponent((req.url || '/').split('?')[0]);
      if (path.startsWith('/art/')) { const f = 'dist' + path; if (!f.includes('..') && existsSync(f)) { res.writeHead(200, { 'content-type': f.endsWith('.webp') ? 'image/webp' : 'application/wasm' }); res.end(readFileSync(f)); } else { res.writeHead(404); res.end(); } return; }
      const html = (await bundle(false)).inl; res.writeHead(200, { 'content-type': 'text/html' }); res.end(html);
    }
    catch (e) { res.writeHead(500); res.end(String(e)); }
  }).listen(5173, () => console.log('Ore Else dev server: http://localhost:5173 (rebuilds on every reload)'));
} else {
  const r = await bundle(true), kb = (n) => (n / 1024).toFixed(0) + ' KB';
  console.log('built dist/index.html, play.html and fragment.html', kb(r.side.length), INLINE ? '(art inside, INLINE=1)' : `+ dist/art/ ${r.files} files, ${kb(r.art)}`);
}
