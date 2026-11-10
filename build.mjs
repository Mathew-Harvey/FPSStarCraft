// Bundles src/main.ts and inlines it with the CSS into a single HTML file.
// dist/index.html is the standalone game. dist/fragment.html is the same page without the
// document wrapper, for hosts that supply their own.
import { build } from 'esbuild';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createServer } from 'node:http';

async function bundle(minify) {
  const out = await build({ entryPoints: ['src/main.ts'], bundle: true, minify, format: 'iife', target: 'es2020', write: false, legalComments: 'none' });
  const js = out.outputFiles[0].text.replace(/<\/script/g, '<\\/script');
  const css = readFileSync('src/style.css', 'utf8');
  const page = readFileSync('src/page.html', 'utf8').replace('/*__CSS__*/', () => css).replace('/*__JS__*/', () => js);
  mkdirSync('dist', { recursive: true });
  writeFileSync('dist/fragment.html', page);
  const full = '<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width,initial-scale=1">\n</head>\n<body>\n' + page + '</body>\n</html>\n';
  writeFileSync('dist/index.html', full);
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
