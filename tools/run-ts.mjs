// Bundles a TypeScript entry that runs the game simulation in Node (no browser) and runs it.
// Usage: node tools/run-ts.mjs <entry.ts> [args...]   e.g. node tools/run-ts.mjs tools/sim.ts '{"out":2}'
import { build } from 'esbuild';
import { spawnSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { basename } from 'node:path';
const [entry, ...args] = process.argv.slice(2);
const sfx = { name: 'sfx', setup(b) { b.onResolve({ filter: /^sfx:bank$/ }, () => ({ path: 'x', namespace: 'sfx' })); b.onLoad({ filter: /.*/, namespace: 'sfx' }, () => ({ contents: 'export default {}', loader: 'js' })); } };
const mesh = { name: 'mesh', setup(b) { b.onResolve({ filter: /^(mesh:bank|art:files)$/ }, a => ({ path: a.path, namespace: 'mesh' })); b.onLoad({ filter: /.*/, namespace: 'mesh' }, a => ({ contents: a.path === 'art:files' ? 'export default []' : 'export default {}', loader: 'js' })); } };
mkdirSync('dist', { recursive: true });
const out = `dist/${basename(entry, '.ts')}.mjs`;
await build({ entryPoints: [entry], bundle: true, platform: 'node', format: 'esm', target: 'node20', outfile: out, plugins: [sfx, mesh], logLevel: 'warning', banner: { js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);" } });
const r = spawnSync('node', [out, ...args], { stdio: 'inherit' });
process.exit(r.status ?? 1);
