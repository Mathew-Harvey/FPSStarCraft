// Builds dist/sound-board.html: node tools/sfx/board.mjs
import { build } from 'esbuild';
import { readFileSync, writeFileSync, readdirSync, mkdirSync } from 'node:fs';
const bank = { name: 'sfx-bank', setup(b) {
  b.onResolve({ filter: /^sfx:bank$/ }, () => ({ path: 'sfx-bank', namespace: 'sfx' }));
  b.onLoad({ filter: /.*/, namespace: 'sfx' }, () => { const o = {}; for (const f of readdirSync('assets/sfx').sort()) if (f.endsWith('.webm')) o[f.slice(0, -5)] = readFileSync('assets/sfx/' + f).toString('base64'); return { contents: 'export default ' + JSON.stringify(o), loader: 'js' }; });
} };
const art = { name: 'art', setup(b) { b.onResolve({ filter: /^(mesh:bank|art:files)$/ }, a => ({ path: a.path, namespace: 'art' })); b.onLoad({ filter: /.*/, namespace: 'art' }, () => ({ contents: 'export default {}', loader: 'js' })); } };
const out = await build({ entryPoints: ['tools/sfx/board.ts'], bundle: true, minify: true, format: 'iife', target: 'es2020', write: false, plugins: [bank, art], logLevel: 'error' });
const css = `:root{--bg:#f4ead2;--fg:#1d1a22;--mut:#6b6170;--acc:#ffc21a;--line:#d9ccb0}
@media (prefers-color-scheme:dark){:root:not([data-theme=light]){--bg:#17151c;--fg:#f1e9d6;--mut:#a39aa8;--acc:#ffc21a;--line:#332e3a;color-scheme:dark}}
:root[data-theme=dark]{--bg:#17151c;--fg:#f1e9d6;--mut:#a39aa8;--acc:#ffc21a;--line:#332e3a;color-scheme:dark}
body{margin:0;background:var(--bg);color:var(--fg);font:15px/1.45 system-ui,sans-serif}main{max-width:640px;margin:0 auto;padding-block:24px;padding-left:max(16px,env(safe-area-inset-left,0px));padding-right:max(16px,env(safe-area-inset-right,0px))}button:focus-visible{outline:2px solid var(--acc);outline-offset:2px}
h1{font-size:22px;margin:0 0 4px}p{color:var(--mut);margin:0 0 16px}table{width:100%;border-collapse:collapse}td{padding:6px 4px;border-bottom:1px solid var(--line)}td:not(:first-child){width:72px;text-align:right}th{text-align:left;font-size:17px;padding:22px 4px 6px;border-bottom:2px solid var(--fg)}th span{display:block;font-weight:400;font-size:13px;color:var(--mut)}
button{font:inherit;padding:6px 12px;border-radius:6px;border:1.5px solid var(--fg);background:transparent;color:var(--fg);cursor:pointer;min-width:60px}button.new{background:var(--acc);color:#1d1a22;border-color:#1d1a22}`;
const html = `<title>Ore Else sound board</title><meta name="claude:viewport-fit-sides" content="cover"><style>${css}</style><main><h1>Ore Else sound board</h1><p>Every sound in the game, grouped. Play is what the game plays now; Old, where there is one, is the first synthesised version. Headphones recommended: in the game, sounds also sit left or right of you.</p><table><tbody id="rows"></tbody></table></main><script>${out.outputFiles[0].text.replace(/<\/script/g, '<\\/script')}</script>`;
mkdirSync('dist', { recursive: true }); writeFileSync('dist/sound-board.html', html); console.log('built dist/sound-board.html', (html.length / 1024).toFixed(0) + ' KB');
