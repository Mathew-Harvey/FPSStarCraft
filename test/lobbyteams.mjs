// The online lobby's team game buttons: on a map with more than two starts the host picks the kind of game, every player picks a
// start, and both screens show who stands where. Only the lobby is checked; test/teamserver.mjs plays the match itself.
// Run with: npm run build && node test/lobbyteams.mjs
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url); const { chromium } = require('playwright');
const PORT = 8151, URL = `http://localhost:${PORT}/`, SHOTS = process.env.SHOTS || '';
const srv = spawn('node', ['dist/server.mjs'], { env: { ...process.env, PORT: String(PORT) }, stdio: ['ignore', 'pipe', 'pipe'] });
let srvLog = ''; srv.stdout.on('data', d => { srvLog += d; }); srv.stderr.on('data', d => { srvLog += d; });
const fail = []; const check = (ok, what) => { console.log((ok ? 'PASS ' : 'FAIL ') + what); if (!ok) fail.push(what); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const until = (p, fn, arg, ms = 15000) => p.waitForFunction(fn, arg, { timeout: ms }).then(() => true, () => false);
let b;
try {
  await sleep(1200);
  b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl', '--disable-dev-shm-usage'] });
  const open = async name => { const p = await b.newPage({ viewport: { width: 1280, height: 900 } }); p.setDefaultTimeout(120000); p.on('pageerror', e => { console.log(`[${name} pageerror]`, e.message.slice(0, 400)); fail.push(name + ' page error'); });
    await p.goto(URL); await p.waitForFunction('window.__ore'); await p.evaluate(n => { __ore.setFree(true); __ore.hold(true); __ore.game.noRender = true; __ore.unlock(); document.getElementById('mName').value = n; }, name); return p; };
  const A = await open('Ada'), B = await open('Bo');
  await A.click('#mCreate'); await A.waitForFunction(() => document.getElementById('mCodeShow').textContent.length === 5);
  const code = await A.evaluate(() => document.getElementById('mCodeShow').textContent);
  await B.fill('#mCode', code); await B.click('#mJoinBtn'); await B.waitForFunction(() => !document.getElementById('mLobby').hidden);
  check(await A.evaluate(() => document.getElementById('mTeamRow').hidden), 'on a two-start map there is no kind-of-game row');
  await A.click('#mMaps [data-b="6"]');
  check(await until(A, () => !document.getElementById('mTeamRow').hidden && document.querySelectorAll('#mTeams button').length === 3), 'on Crossing the host gets 1v1, 2v2 and free for all');
  check(await B.evaluate(() => [...document.querySelectorAll('#mTeams button')].every(x => x.disabled)), 'only the host can press them');
  await A.click('#mTeams [data-t="1"]');
  check(await until(B, () => document.querySelectorAll('#mStarts button').length === 4 && document.getElementById('mSide').hidden), 'after the host picks 2v2, every screen lists the four starts and hides the one-on-one side button');
  const starts = await B.evaluate(() => [...document.querySelectorAll('#mStarts button')].map(x => x.textContent));
  check(starts.some(t => /Team 1/.test(t)) && starts.some(t => /Team 2/.test(t)) && starts.some(t => /bots/.test(t)), `each start says its faction, its team and who is on it (${starts.join(' | ')})`);
  await B.click('#mStarts [data-s="1"]');
  check(await until(A, () => /Bo/.test(document.querySelector('#mStarts [data-s="1"]')?.textContent || '')), 'a player who picks a start shows on it on the host\'s screen too');
  check(await until(B, () => document.querySelector('#mStarts [data-s="1"]')?.classList.contains('on')), 'and the player\'s own start is lit');
  if (SHOTS) await A.screenshot({ path: `${SHOTS}/lobby-teams.jpg`, type: 'jpeg', quality: 85 });
  await A.click('#mTeams [data-t="0"]');
  check(await until(B, () => document.getElementById('mStarts').hidden && !document.getElementById('mSide').hidden), 'back to 1v1, the start list goes and the side button comes back');
} finally { if (b) await b.close(); srv.kill(); }
if (fail.length && srvLog) console.log(srvLog.slice(-1500));
console.log(fail.length ? `\n${fail.length} FAILED` : '\nall lobby team checks passed'); process.exit(fail.length ? 1 : 0);
