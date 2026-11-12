// The story campaign in a real page: a job's opening cut scene plays and can be skipped, an Act 1 job starts at the yard,
// an Act 2 job runs on a local host with the player at the outpost end and its objectives reach the screen, and the
// last job puts an Ironhold player at the outpost end against Charter Security in company grey.
// Run with: npm run build && node test/story.mjs
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
const require = createRequire(import.meta.url); const { chromium } = require('playwright');
const page = pathToFileURL(join(dirname(fileURLToPath(import.meta.url)), '..', 'dist', 'index.html')).href;
const fail = []; const check = (ok, what) => { console.log((ok ? 'PASS ' : 'FAIL ') + what); if (!ok) fail.push(what); };
const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl'] });
try {
  const p = await b.newPage({ viewport: { width: 1280, height: 720 } }); p.setDefaultTimeout(120000);
  p.on('pageerror', e => { console.log('[pageerror]', e.message.slice(0, 400)); fail.push('page error'); });
  const until = (fn, arg, ms = 60000) => p.waitForFunction(fn, arg, { timeout: ms }).then(() => true, () => false);
  await p.goto(page); await p.waitForFunction('window.__ore && __ore.game');
  await p.evaluate(() => { __ore.setFree(true); __ore.cutP.auto = false; });
  // the campaign menu shows the four acts and the first act's eight jobs
  const menu = await p.evaluate(() => ({ acts: document.querySelectorAll('#jobs .acts button').length, jobs: document.querySelectorAll('#jobs .jrow button').length, open: document.querySelectorAll('#jobs .jrow button:not([disabled])').length }));
  check(menu.acts === 5 && menu.jobs === 8 && menu.open === 1, `the menu lists four acts and side jobs, and Act 1's eight jobs with one open (${JSON.stringify(menu)})`);
  // Clock in on job 1: the arrival scene plays first
  await p.evaluate(() => document.getElementById('startJob').click());
  check(await until(() => !document.getElementById('cut').hidden && __ore.game.phase === 'cut'), 'the opening cut scene plays before job 1');
  const cap = await p.evaluate(() => document.querySelector('#cut .ccap').textContent);
  check(/Claim 4471-T/.test(cap), 'the first panel has its caption');
  await p.evaluate(() => document.getElementById('cut').click());
  check(await until(() => /2 \//.test(document.querySelector('#cut .cnum').textContent)), 'a click turns the page');
  await p.keyboard.press('Escape');
  check(await until(() => document.getElementById('cut').hidden && __ore.game.phase === 'play' && __ore.game.mission && __ore.game.mission.name === 'First Shift'), 'Esc skips the scene and starts the job');
  // job 9 runs from the outpost end, in a Veyl body, on a local host
  await p.evaluate(() => __ore.startStory(8));
  check(await until(() => __ore.split() && __ore.game.me && __ore.split().host.mission), 'job 9 starts on a local host');
  const v = await p.evaluate(() => { const g = __ore.game, h = __ore.split().host; return { team: g.myTeam, out: h.teams[1], kind: g.me.kind, story: g.story && g.story.name, hm: h.mission.name, home: h.buildings.filter(b => b.alive && b.team === 2).length }; });
  check(v.kind === 'tender' && v.story === 'Wrong Body' && v.hm === 'Wrong Body' && v.team === 1, `the player is a Veyl Tender on job 9 (${JSON.stringify(v)})`);
  check(await until(() => __ore.game.netObjs && __ore.game.netObjs.length === 5), 'the host sends the five objectives to the screen');
  check(await until(() => /Choir Stone/.test(document.getElementById('objs').textContent)), 'the objectives panel shows them');
  // job 14 locks the trigger
  await p.evaluate(() => __ore.startStory(13));
  check(await until(() => __ore.split() && __ore.game.me && __ore.game.me.kind === 'lancer'), 'job 14 hands over a single Lancer');
  check(await p.evaluate(() => __ore.game.story.noFire && __ore.split().host.truce), 'job 14 locks weapons and holds everyone\'s fire');
  // job 24 puts an Ironhold player at the outpost end, against Charter Security at the yard
  await p.evaluate(() => __ore.startStory(23));
  check(await until(() => __ore.split() && __ore.game.me), 'job 24 starts');
  const f = await p.evaluate(() => { const g = __ore.game, h = __ore.split().host; return { team: g.myTeam, kind: g.me.kind, yard: h.buildings.filter(b => b.alive && b.team === 0 && b.kind === 'headframe').length, clock: g.ms.clock }; });
  check(f.team === 3 && f.kind === 'rigger' && f.yard === 1, `the player is an Ironhold Rigger at the outpost end, and the Charter holds the yard (${JSON.stringify(f)})`);
  check(await until(() => __ore.game.ms.clock > 2300 && __ore.game.ms.clock <= 2400), 'the forty-minute clock reaches the screen');
} finally { await b.close(); }
console.log(fail.length ? `\n${fail.length} failed` : '\nall passed');
process.exit(fail.length ? 1 : 0);
