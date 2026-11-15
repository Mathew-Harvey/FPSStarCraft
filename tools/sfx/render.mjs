// Renders every game sound to WAV files in a folder: node tools/sfx/render.mjs OUT_DIR [name filter]
// Then: python3 tools/sfx/audit.py sheet.png --dir OUT_DIR
import { build } from 'esbuild';
import { readFileSync, writeFileSync, readdirSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
const [out = 'dist/sfx-render', only] = process.argv.slice(2);
const bank = { name: 'sfx-bank', setup(b) {
  b.onResolve({ filter: /^sfx:bank$/ }, () => ({ path: 'sfx-bank', namespace: 'sfx' }));
  b.onLoad({ filter: /.*/, namespace: 'sfx' }, () => { const o = {}; for (const f of readdirSync('assets/sfx').sort()) if (f.endsWith('.webm')) o[f.slice(0, -5)] = readFileSync('assets/sfx/' + f).toString('base64'); return { contents: 'export default ' + JSON.stringify(o), loader: 'js' }; });
} };
const art = { name: 'art', setup(b) { b.onResolve({ filter: /^(art|mesh):/ }, a => ({ path: a.path, namespace: 'art' })); b.onLoad({ filter: /.*/, namespace: 'art' }, () => ({ contents: 'export default {}', loader: 'js' })); } };
const js = (await build({ entryPoints: ['tools/sfx/render.ts'], bundle: true, format: 'iife', target: 'es2020', write: false, plugins: [bank, art], logLevel: 'error' })).outputFiles[0].text;
const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] }); const page = await browser.newPage();
page.on('console', m => m.type() === 'error' && console.log('page:', m.text()));
await page.setContent('<html><body></body></html>'); await page.addScriptTag({ content: js });
const res = await page.evaluate(o => window.renderAll(o), only); await browser.close();
mkdirSync(out, { recursive: true });
const wav = (L, R) => { const n = L.length, b = Buffer.alloc(44 + n * 4); b.write('RIFF', 0); b.writeUInt32LE(36 + n * 4, 4); b.write('WAVEfmt ', 8); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(2, 22); b.writeUInt32LE(48000, 24); b.writeUInt32LE(192000, 28); b.writeUInt16LE(4, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(n * 4, 40); for (let i = 0; i < n; i++) { b.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(L[i] * 32767))), 44 + i * 4); b.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(R[i] * 32767))), 46 + i * 4); } return b; };
const f32 = s => new Float32Array(Buffer.from(s, 'base64').buffer.slice(0));
let n = 0; for (const [k, [l, r]] of Object.entries(res)) { const L = f32(l), R = f32(r); let e = L.length; while (e > 4800 && Math.abs(L[e - 1]) < 1e-4 && Math.abs(R[e - 1]) < 1e-4) e--; writeFileSync(`${out}/${k}.wav`, wav(L.subarray(0, e), R.subarray(0, e))); n++; }
console.log(n, 'sounds rendered to', out);
