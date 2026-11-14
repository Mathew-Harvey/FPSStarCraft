// Builds the Veyl art bench page (tools/veyl/bench.ts) to dist-bench/index.html. Every model in assets/mesh rides inside
// the page, the way dist/index.html carries them. Run from the repo root: node tools/veyl/bench.mjs
import { build } from 'esbuild';
import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync } from 'node:fs';
import { deflateRawSync } from 'node:zlib';
const plug = (name, filter, ns, fill) => ({ name, setup(b) { b.onResolve({ filter }, () => ({ path: name, namespace: ns })); b.onLoad({ filter: /.*/, namespace: ns }, () => ({ contents: 'export default ' + JSON.stringify(fill()), loader: 'js' })); } });
const sfx = () => { const o = {}; for (const f of readdirSync('assets/sfx').sort()) if (f.endsWith('.webm')) o[f.slice(0, -5)] = readFileSync('assets/sfx/' + f).toString('base64'); return o; };
const mesh = () => { const o = {}; for (const d of ['assets/mesh']) if (existsSync(d)) for (const f of readdirSync(d).sort()) { if (f.endsWith('.bin')) o[f.slice(0, -4)] = deflateRawSync(readFileSync(d + '/' + f), { level: 6 }).toString('base64'); if (f.endsWith('.webp') && !f.endsWith('.top.webp')) o[f.slice(0, -5) + '.tex'] = readFileSync(d + '/' + f).toString('base64'); } return o; };
const out = await build({ entryPoints: ['tools/veyl/bench.ts'], bundle: true, minify: false, format: 'iife', target: 'es2020', write: false, legalComments: 'none', plugins: [plug('sfx-bank', /^sfx:bank$/, 'sfx', sfx), plug('mesh-bank', /^mesh:bank$/, 'mesh', mesh), plug('art-files', /^art:files$/, 'artf', () => [])], logLevel: 'warning' });
const js = out.outputFiles[0].text.replace(/<\/script/g, '<\\/script');
const page = readFileSync('src/page.html', 'utf8').replace('/*__CSS__*/', () => readFileSync('src/style.css', 'utf8')).replace('/*__JS__*/', () => js);
mkdirSync('dist-bench', { recursive: true });
writeFileSync('dist-bench/index.html', '<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width,initial-scale=1">\n</head>\n<body>\n' + page + '</body>\n</html>\n');
console.log('bench page', (js.length / 1048576).toFixed(1), 'MB');
