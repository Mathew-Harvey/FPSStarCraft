// Bundles src/main.ts and inlines it with the CSS into a single HTML file.
// dist/index.html is the standalone game. dist/fragment.html is the same page without the
// document wrapper, for hosts that supply their own.
import { build } from 'esbuild';
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';

// `import BANK from 'sfx:bank'` gives the page every sound in assets/sfx as base64, keyed by file name.
// The match server never plays a sound, so it gets an empty bank.
const sfxBank = (empty) => ({ name: 'sfx-bank', setup(b) {
  b.onResolve({ filter: /^sfx:bank$/ }, () => ({ path: 'sfx-bank', namespace: 'sfx' }));
  b.onLoad({ filter: /.*/, namespace: 'sfx' }, () => {
    const bank = {}; if (!empty) for (const f of readdirSync('assets/sfx').sort()) if (f.endsWith('.webm')) bank[f.slice(0, -5)] = readFileSync('assets/sfx/' + f).toString('base64');
    return { contents: 'export default ' + JSON.stringify(bank), loader: 'js' };
  });
} });
// `import MESHES from 'mesh:bank'` gives the page every sculpted model in assets/mesh as base64, keyed by file name (see art/).
// The match server never draws, so it gets none and builds the simple code-made stand-ins.
const meshBank = (empty) => ({ name: 'mesh-bank', setup(b) {
  b.onResolve({ filter: /^mesh:bank$/ }, () => ({ path: 'mesh-bank', namespace: 'mesh' }));
  b.onLoad({ filter: /.*/, namespace: 'mesh' }, () => {
    const bank = {}; if (!empty) for (const f of readdirSync('assets/mesh').sort()) if (f.endsWith('.bin')) bank[f.slice(0, -4)] = readFileSync('assets/mesh/' + f).toString('base64');
    return { contents: 'export default ' + JSON.stringify(bank), loader: 'js' };
  });
} });
import { createServer } from 'node:http';

async function bundle(minify) {
  const out = await build({ entryPoints: ['src/main.ts'], bundle: true, minify, format: 'iife', target: 'es2020', write: false, legalComments: 'none', plugins: [sfxBank(false), meshBank(false)] });
  const js = out.outputFiles[0].text.replace(/<\/script/g, '<\\/script');
  const css = readFileSync('src/style.css', 'utf8');
  const page = readFileSync('src/page.html', 'utf8').replace('/*__CSS__*/', () => css).replace('/*__JS__*/', () => js);
  mkdirSync('dist', { recursive: true });
  writeFileSync('dist/fragment.html', page);
  const full = '<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width,initial-scale=1">\n</head>\n<body>\n' + page + '</body>\n</html>\n';
  writeFileSync('dist/index.html', full);
  // The match server: the same game code, bundled for Node, with the page beside it.
  await build({ entryPoints: ['server/main.ts'], bundle: true, minify: false, platform: 'node', format: 'esm', target: 'node20', outfile: 'dist/server.mjs', legalComments: 'none', plugins: [sfxBank(true), meshBank(true)], banner: { js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);" }, logLevel: 'warning' });
  return full;
}

if (process.argv.includes('--serve')) {
  createServer(async (req, res) => {
    try { const html = await bundle(false); res.writeHead(200, { 'content-type': 'text/html' }); res.end(html); }
    catch (e) { res.writeHead(500); res.end(String(e)); }
  }).listen(5173, () => console.log('Ore Else dev server: http://localhost:5173 (rebuilds on every reload)'));
} else {
  const html = await bundle(true);
  console.log('built dist/index.html', (html.length / 1024).toFixed(0) + ' KB');
}
