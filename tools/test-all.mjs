// Runs every test file one after another, keeps going past a failure, and lists every failure at the end.
// Run: npm test, or node tools/test-all.mjs [name filter ...]   (e.g. node tools/test-all.mjs split server)
// Each file runs on its own, so one that hangs or fails does not hide the rest. Browser tests take one browser at a time.
import { spawn } from 'node:child_process';
import { writeFileSync, mkdirSync, existsSync } from 'node:fs';

/** Every test, in the order they run. The slow bot-match tests come after the quick ones. */
export const TESTS = [
  'tools/run-ts.mjs test/core/registry.ts', 'tools/run-ts.mjs test/core/systems.ts', 'tools/run-ts.mjs test/core/sides.ts',
  'test/server.mjs', 'test/teamserver.mjs', 'tools/run-ts.mjs test/online/claims.ts', 'test/online/fog.mjs', 'test/online/fog-page.mjs',
  'tools/run-ts.mjs test/online/same-dice.ts', 'tools/run-ts.mjs test/online/abilities.ts', 'test/online/replay.mjs', 'test/online/watch-page.mjs', 'test/online/watch-above.mjs', 'test/online/cast-page.mjs', 'tools/run-ts.mjs test/online/cast-looks.ts', 'tools/run-ts.mjs test/online/ranked.ts', 'test/online/ranked.mjs', 'test/online/ranked-page.mjs', 'test/lobbyteams.mjs',
  'test/coop.mjs', 'test/versus.mjs', 'test/split.mjs', 'test/touch.mjs', 'test/veyl.mjs', 'test/gloam.mjs', 'test/artfiles.mjs', 'test/fx.mjs',
  'test/command.mjs', 'test/controls.mjs', 'test/skirmish.mjs', 'test/story.mjs', 'test/sweep.mjs',
  'tools/run-ts.mjs test/factions/ironhold.ts', 'tools/run-ts.mjs test/factions/veyl.ts', 'tools/run-ts.mjs test/factions/gloam.ts',
  'tools/run-ts.mjs test/scouting.ts', 'tools/run-ts.mjs test/terrain.ts', 'tools/run-ts.mjs test/teammaps-play.ts', 'tools/run-ts.mjs test/story.ts 1', 'tools/run-ts.mjs test/playthrough.ts', 'tools/run-ts.mjs test/matchups.ts',
];
/** Longest any one file may run before it counts as hung. */
const LIMIT = 30 * 60 * 1000;
const want = process.argv.slice(2), list = want.length ? TESTS.filter(t => want.some(w => t.includes(w))) : TESTS;
mkdirSync('dist/test-logs', { recursive: true });
const results = [];
for (const t of list) {
  const file = t.split(' ').find(a => a.startsWith('test/')); if (!existsSync(file)) { console.log(`${t} ... not here yet, skipped`); continue; }
  const t0 = Date.now(), args = t.split(' '), log = 'dist/test-logs/' + args.find(a => a.startsWith('test/')).replace(/[/.]/g, '_') + '.log';
  process.stdout.write(`${t} ... `);
  const { code, out } = await new Promise(done => {
    // Each file runs in its own process group, and the whole group is stopped when it ends: a server or browser a test left running would
    // otherwise hold its port, and the next run's test would talk to the old server (with the old build and the old switches).
    const c = spawn('node', args, { stdio: ['ignore', 'pipe', 'pipe'], detached: true }); let out = '';
    const sweep = () => { try { process.kill(-c.pid, 'SIGKILL'); } catch { /* the group is already gone */ } };
    c.stdout.on('data', d => out += d); c.stderr.on('data', d => out += d);
    const kill = setTimeout(() => { out += `\nKILLED after ${LIMIT / 60000} minutes`; sweep(); }, LIMIT);
    c.on('exit', sweep); c.on('close', code => { clearTimeout(kill); sweep(); done({ code, out }); });
  });
  writeFileSync(log, out); const secs = Math.round((Date.now() - t0) / 1000), fails = out.split('\n').filter(l => /^\s*FAIL\b/.test(l));
  results.push({ t, ok: code === 0, secs, log, fails });
  console.log(code === 0 ? `ok (${secs} s)` : `FAILED (${secs} s, exit ${code}) - log in ${log}`);
}
const bad = results.filter(r => !r.ok);
console.log(`\n${results.length - bad.length} of ${results.length} test files passed.`);
for (const r of bad) { console.log(`\nFAILED ${r.t}  (${r.log})`); for (const f of r.fails.slice(0, 12)) console.log('  ' + f.trim()); if (!r.fails.length) console.log('  (no FAIL lines; see the log for the error)'); }
process.exit(bad.length ? 1 : 0);
