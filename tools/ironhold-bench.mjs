// A test page for the new Ironhold figures (stream E). It is the game itself, with every model in assets/mesh inside it
// (like dist/index.html), plus window.__fig (the sculpted figure maker) and window.__three, so a capture script can stand any figure anywhere and draw it with
// the game's own light, ink and paint. Usage: node tools/ironhold-bench.mjs [out.html]
import { build } from 'esbuild';
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { deflateRawSync } from 'node:zlib';

const dirs = ['assets/mesh'];
const meshBank = { name: 'mesh-bank', setup(b) {
  b.onResolve({ filter: /^(mesh:bank|art:files)$/ }, a => ({ path: a.path, namespace: 'mesh' }));
  b.onLoad({ filter: /.*/, namespace: 'mesh' }, a => {
    if (a.path === 'art:files') return { contents: 'export default []', loader: 'js' };
    const bank = {};
    for (const d of dirs) if (existsSync(d)) for (const f of readdirSync(d).sort()) { if (f.endsWith('.bin')) bank[f.slice(0, -4)] = deflateRawSync(readFileSync(d + '/' + f), { level: 9 }).toString('base64'); if (f.endsWith('.webp')) bank[f.slice(0, -5) + '.tex'] = readFileSync(d + '/' + f).toString('base64'); }
    return { contents: 'export default ' + JSON.stringify(bank), loader: 'js' };
  });
} };
const sfxBank = { name: 'sfx-bank', setup(b) {
  b.onResolve({ filter: /^sfx:bank$/ }, () => ({ path: 'sfx-bank', namespace: 'sfx' }));
  b.onLoad({ filter: /.*/, namespace: 'sfx' }, () => ({ contents: 'export default {}', loader: 'js' }));
} };
const entry = { name: 'bench-entry', setup(b) {
  b.onResolve({ filter: /^bench:entry$/ }, () => ({ path: 'bench', namespace: 'bench' }));
  b.onLoad({ filter: /.*/, namespace: 'bench' }, () => ({ resolveDir: process.cwd(), loader: 'ts', contents: "import './src/boot.ts'; import * as THREE from 'three'; import { figure } from './src/meshes'; import * as LOOK from './src/look-ironhold'; import * as Y2 from './src/factions/ironhold/look/yard2'; import * as MD from './src/models'; (window as any).__fig = figure; (window as any).__three = THREE; (window as any).__look = LOOK; (window as any).__yard2 = Y2; (window as any).__md = MD;" }));
} };
const out = await build({ entryPoints: ['bench:entry'], bundle: true, minify: true, format: 'iife', target: 'es2020', write: false, legalComments: 'none', plugins: [entry, sfxBank, meshBank] });
const js = out.outputFiles[0].text.replace(/<\/script/g, '<\\/script');
const page = readFileSync('src/page.html', 'utf8').replace('/*__CSS__*/', () => readFileSync('src/style.css', 'utf8')).replace('/*__JS__*/', () => js);
const file = process.argv[2] || 'dist/ironhold-bench.html';
writeFileSync(file, '<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width,initial-scale=1">\n</head>\n<body>\n' + page + '</body>\n</html>\n');
console.log('bench', file, (page.length / 1024).toFixed(0) + ' KB');
