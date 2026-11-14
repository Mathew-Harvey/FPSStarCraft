// Runs every test file one after another, keeps going past a failure, and lists every failure at the end.
// Run: npm run build && npm test, or node tools/test-all.mjs [name filter ...]   (e.g. node tools/test-all.mjs split server)
// tools/artsize.mjs (each figure's art within its size limits) reads dist/, so build first.
// Each file runs on its own, so one that hangs or fails does not hide the rest. Browser tests take one browser at a time.
import { spawn } from 'node:child_process';
import { writeFileSync, mkdirSync, existsSync, readdirSync, readFileSync } from 'node:fs';

/** Every test, in the order they run. The slow bot-match tests come after the quick ones. */
export const TESTS = [
  'tools/artsize.mjs', 'tools/run-ts.mjs test/core/registry.ts', 'tools/run-ts.mjs test/core/systems.ts', 'tools/run-ts.mjs test/core/sides.ts',
  'test/server.mjs', 'test/teamserver.mjs', 'tools/run-ts.mjs test/online/claims.ts', 'test/online/fog.mjs', 'test/online/fog-page.mjs',
  'tools/run-ts.mjs test/online/same-dice.ts', 'tools/run-ts.mjs test/online/abilities.ts', 'test/online/replay.mjs', 'test/online/watch-page.mjs', 'test/online/watch-above.mjs', 'test/online/cast-page.mjs', 'tools/run-ts.mjs test/online/cast-looks.ts', 'tools/run-ts.mjs test/online/ranked.ts', 'test/online/ranked.mjs', 'test/online/ranked-page.mjs', 'test/lobbyteams.mjs',
  'test/coop.mjs', 'test/versus.mjs', 'test/split.mjs', 'test/touch.mjs', 'test/veyl.mjs', 'test/gloam.mjs', 'test/artfiles.mjs', 'test/fx.mjs',
  'test/command.mjs', 'test/controls.mjs', 'test/skirmish.mjs', 'test/story.mjs', 'test/sweep.mjs',
  'tools/run-ts.mjs test/factions/ironhold.ts', 'tools/run-ts.mjs test/factions/veyl.ts', 'tools/run-ts.mjs test/factions/gloam.ts',
  'tools/run-ts.mjs test/scouting.ts', 'tools/run-ts.mjs test/terrain.ts', 'tools/run-ts.mjs test/teammaps-play.ts', 'tools/run-ts.mjs test/story.ts 1', 'tools/run-ts.mjs test/playthrough.ts', 'tools/run-ts.mjs test/matchups.ts', 'tools/run-ts.mjs test/endrule.ts',
];
/** Longest any one file may run before it counts as hung. */
const LIMIT = 30 * 60 * 1000;
const want = process.argv.slice(2), list = want.length ? TESTS.filter(t => want.some(w => t.includes(w))) : TESTS;
mkdirSync('dist/test-logs', { recursive: true });
/** Browsers and test servers now running, by process id. Playwright starts each browser in a process group of its own, so killing the test's
 *  group leaves the browser behind; anything new since the file started is swept up by id once the file ends. */
function strays() {
  const out = new Set();
  for (const d of readdirSync('/proc')) { if (!/^\d+$/.test(d)) continue; let cmd = ''; try { cmd = readFileSync(`/proc/${d}/cmdline`, 'utf8'); } catch { continue; }
    if (/chrom|headless_shell|dist\/server\.mjs/.test(cmd)) out.add(+d); }
  return out;
}
const alive = pid => { try { process.kill(pid, 0); return true; } catch { return false; } };
async function sweepNew(before) {
  const left = [...strays()].filter(p => !before.has(p) && p !== process.pid); for (const p of left) { try { process.kill(p, 'SIGKILL'); } catch { /* gone */ } }
  for (let i = 0; i < 50 && left.some(alive); i++) await new Promise(r => setTimeout(r, 100));   // wait for them to go, so their memory is back
  return left.length;
}
/** A browser test that died without a FAIL line (the page crashed, or the browser was killed for memory) gets one more go. */
const crashed = (t, code, out, fails) => code !== 0 && !fails.length && !t.startsWith('tools/run-ts.mjs') && /Target crashed|has been closed|browser has disconnected|Browser closed|SIGKILL|out of memory/i.test(out);
async function runOne(t, args) {
  const before = strays();
  const r = await new Promise(done => {
    // Each file runs in its own process group, and the whole group is stopped when it ends: a server or browser a test left running would
    // otherwise hold its port, and the next run's test would talk to the old server (with the old build and the old switches).
    const c = spawn('node', args, { stdio: ['ignore', 'pipe', 'pipe'], detached: true }); let out = '';
    const sweep = () => { try { process.kill(-c.pid, 'SIGKILL'); } catch { /* the group is already gone */ } };
    c.stdout.on('data', d => out += d); c.stderr.on('data', d => out += d);
    const kill = setTimeout(() => { out += `\nKILLED after ${LIMIT / 60000} minutes`; sweep(); }, LIMIT);
    c.on('exit', sweep); c.on('close', code => { clearTimeout(kill); sweep(); done({ code, out }); });
  });
  const n = await sweepNew(before); if (n) r.out += `\n(test-all: stopped ${n} browser or server processes the file left running)`;
  return r;
}
const results = [];
for (const t of list) {
  const file = t.split(' ').find(a => a.startsWith('test/')) || t.split(' ')[0]; if (!existsSync(file)) { console.log(`${t} ... not here yet, skipped`); continue; }
  const t0 = Date.now(), args = t.split(' '), log = 'dist/test-logs/' + file.replace(/[/.]/g, '_') + '.log';
  process.stdout.write(`${t} ... `);
  let { code, out } = await runOne(t, args), fails = out.split('\n').filter(l => /^\s*FAIL\b/.test(l)), retried = false;
  if (crashed(t, code, out, fails)) {
    writeFileSync(log.replace(/\.log$/, '.crash.log'), out); retried = true;
    ({ code, out } = await runOne(t, args)); fails = out.split('\n').filter(l => /^\s*FAIL\b/.test(l));
  }
  writeFileSync(log, out); const secs = Math.round((Date.now() - t0) / 1000);
  results.push({ t, ok: code === 0, secs, log, fails, retried, tail: out.trim().split('\n').slice(-4) });
  console.log(code === 0 ? `ok (${secs} s)${retried ? ', passed on retry after a browser crash' : ''}` : `FAILED (${secs} s, exit ${code}${retried ? ', after a retry' : ''}) - log in ${log}`);
}
const bad = results.filter(r => !r.ok);
const again = results.filter(r => r.ok && r.retried);
console.log(`\n${results.length - bad.length} of ${results.length} test files passed${again.length ? ` (${again.length} on retry after a browser crash: ${again.map(r => r.t).join(', ')}; first try in the .crash.log)` : ''}.`);
for (const r of bad) { console.log(`\nFAILED ${r.t}  (${r.log})`); for (const f of r.fails.slice(0, 12)) console.log('  ' + f.trim()); if (!r.fails.length) { console.log('  (no FAIL lines; the end of its log:)'); for (const l of r.tail) console.log('    ' + l.slice(0, 200)); } }
process.exit(bad.length ? 1 : 0);
