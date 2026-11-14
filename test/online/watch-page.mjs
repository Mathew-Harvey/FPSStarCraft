// Watching in a real page: the observer seat in a live match, and the same match played back as a replay in the page.
// Ada and Vex play (plain WebSocket clients); Wen watches in a browser, switches between them, and opens the production and income panels.
// When the match ends Wen opens it from the replay list and plays it back in the page: the world the page is sent during playback must be
// the same, body for body, as the one it was sent live.
// Run with: npm run build && node test/online/watch-page.mjs
import { createRequire } from 'node:module';
import { mkdtempSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { server, sleep, walk, versus, checker } from './lib.mjs';
const require = createRequire(import.meta.url); const { chromium } = require('playwright');
const { check, done, fail } = checker();
const SHOTS = process.env.SHOTS || '/mnt/project-files/full-depth/K'; try { mkdirSync(SHOTS, { recursive: true }); } catch (e) { /* screenshots are optional */ }
const S = await server(8154, { REPLAY_DIR: mkdtempSync(join(tmpdir(), 'ore-watch-')) }), URL = S.http + '/';
const until = (p, fn, arg, ms = 20000) => p.waitForFunction(fn, arg, { timeout: ms }).then(() => true, () => false);
const shot = async (p, name) => { try { await p.evaluate(() => { __ore.game.noRender = false; }); await sleep(1200); await p.screenshot({ path: join(SHOTS, name) }); } catch (e) { console.log('no screenshot', name, e.message); } };
let b;
try {
  const { A, V, code, bA, bV } = await versus(S.url);
  const idA = A.last('lobby').you, idV = V.last('lobby').you;
  b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl'] });
  const W = await b.newPage({ viewport: { width: 1280, height: 720 } }); W.setDefaultTimeout(120000);
  W.on('pageerror', e => { console.log('[Wen pageerror]', e.message.slice(0, 400)); fail.push('page error'); });
  await W.goto(URL); await W.waitForFunction('window.__ore'); await W.evaluate(code => { __ore.setFree(true); __ore.game.noRender = true; __ore.unlock(); document.getElementById('mName').value = 'Wen'; document.getElementById('mCode').value = code; }, code);
  await W.click('#mWatch');
  check(await until(W, () => __ore.game.net?.watch && __ore.game.me && __ore.game.units.length > 6), 'Wen joins the running match to watch from the menu\'s Watch button');
  await W.evaluate(() => { __ore.game.noRender = true; });
  const seen = await W.evaluate(() => { const g = __ore.game; return { teams: [...new Set(g.units.filter(u => u.alive).map(u => u.team))].sort(), me: g.me?.pilot, bar: !document.getElementById('watch').hidden && document.querySelectorAll('#watch .w-bar button[data-a=f]').length }; });
  check(seen.teams.join() === '0,1', `the watcher's page holds both sides' bodies (${seen.teams})`);
  check(seen.me === idA && seen.bar === 2, `the view follows the first player, Ada, and the bar has a button for each player (${seen.bar})`);
  // the players move while Wen watches
  const moving = Promise.all([walk(A, bA.unit, 12, 18, 9), walk(V, bV.unit, V.last('s').u.find(r => r[0] === bV.unit)[3] - 12, V.last('s').u.find(r => r[0] === bV.unit)[4], 9)]);
  await W.keyboard.press('Digit2');
  check(await until(W, id => __ore.game.me?.pilot === id && __ore.game.myTeam === 1, idV), 'pressing 2 puts the view in Vex\'s body, on the Veyl side');
  await moving;
  // what the page is sent at one moment, kept to compare with the replay
  const within = (p, ms, v) => Promise.race([p, sleep(ms).then(() => v)]);
  const live = await within(W.evaluate(() => new Promise(res => { const n = __ore.game.net, take = n.take.bind(n), at = __ore.game.time + 1; n.take = m => { if (m.t === 's' && m.time >= at && !n.kept) { n.kept = { time: m.time, u: m.u.map(r => r.slice(0, 7).join()).sort(), b: m.b.length }; res(n.kept); } take(m); }; })), 30000, { u: [], b: 0, time: -1 });
  check(live.u.length > 8, `kept the live picture at ${live.time} s (${live.u.length} bodies, ${live.b} buildings)`);
  const prod = await W.evaluate(() => document.querySelector('#watch .w-prod').innerText);
  check(/Ironhold/.test(prod) && /Veyl/.test(prod) && /Ore \d+/.test(prod), 'the production panel lists both sides with their ore');
  await sleep(5000);
  const inc = await W.evaluate(() => { const c = document.querySelector('#watch .w-inc canvas'); const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i]) n++; return n; });
  check(inc > 200, `the income graph has lines on it (${inc} pixels drawn)`);
  await shot(W, 'watch-live.png');
  await W.keyboard.press('KeyP'); await W.keyboard.press('KeyI');
  check(await until(W, () => document.querySelector('#watch .w-prod').hidden && document.querySelector('#watch .w-inc').hidden), 'P and I hide the two panels');
  await W.keyboard.press('KeyP'); await W.keyboard.press('KeyI');
  const ownUnit = await W.evaluate(() => __ore.game.me.id), hp0 = V.last('s').u.find(r => r[0] === ownUnit);
  await W.mouse.click(640, 400); await W.keyboard.down('KeyW'); await sleep(800); await W.keyboard.up('KeyW');
  const hp1 = V.last('s').u.find(r => r[0] === ownUnit);
  check(!!hp0 && !!hp1 && (Math.abs(hp0[3] - hp1[3]) < 3 && Math.abs(hp0[4] - hp1[4]) < 3), 'the watcher\'s keys do not move the body');
  // the players leave: the match is kept, and the end screen links the replay
  A.close(); V.close();
  check(await until(W, () => __ore.game.phase === 'over' || document.getElementById('menu').hidden === false, null, 20000), 'when the players leave, the watcher\'s match ends');
  await sleep(1500);
  const link = await W.evaluate(() => [...document.querySelectorAll('#end a')].map(a => a.getAttribute('href')).find(h => /\/replays\//.test(h || '')) || '');
  check(/\/replays\/\w/.test(link), `the end screen links the replay file (${link})`);
  // play it back in the page from the replay list
  await W.evaluate(() => __ore.quit()); await sleep(500);
  await W.evaluate(() => document.getElementById('mReplays').click());
  check(await until(W, () => document.querySelectorAll('#watch .w-list button[data-a=watch]').length > 0), 'the Replays button lists the match');
  await W.evaluate(() => document.querySelector('#watch .w-list button[data-a=watch]').click());
  check(await until(W, () => __ore.game.net?.watch && __ore.game.units.length > 6, null, 60000), 'Watch on the list starts the replay in the page');
  const again = await within(W.evaluate(t => new Promise(res => { const n = __ore.game.net, take = n.take.bind(n); n.take = m => { if (m.t === 's' && m.time === t && !n.kept) { n.kept = { time: m.time, u: m.u.map(r => r.slice(0, 7).join()).sort(), b: m.b.length }; res(n.kept); } take(m); }; document.querySelector('#watch .w-bar button[data-a=speed][data-v="4"]')?.click(); }), live.time), 90000, { u: [], b: 0, time: -1 });
  const diff = live.u.filter(r => !again.u.includes(r));
  check(again.u.length === live.u.length && !diff.length && again.b === live.b, `played back in the page, the world at ${live.time} s is the same, body for body, as it was live (${again.u.length} bodies${diff.length ? '; differs: ' + diff.slice(0, 3).join(' | ') : ''})`);
  await W.evaluate(() => document.querySelector('#watch .w-bar button[data-a=speed][data-v="1"]')?.click());
  check(await W.evaluate(() => !document.querySelector('#watch .w-note')), 'the replay says nothing about different rules');
  await shot(W, 'watch-replay.png');
  // jump back to the start and play to the end
  await W.keyboard.press('ArrowLeft'); await W.keyboard.press('ArrowLeft'); await W.keyboard.press('ArrowLeft');
  await W.evaluate(() => document.querySelector('#watch .w-bar button[data-a=speed][data-v="8"]')?.click());
  check(await until(W, () => __ore.game.phase === 'over', null, 90000), 'the replay plays to the end after a jump back');
  check(!fail.includes('page error'), 'no page error while watching and playing back');
} catch (e) { console.log('ERROR', e.stack); check(false, 'no exception'); }
await b?.close(); S.stop(); check(!/match crashed/.test(S.log()), 'no match crashed on the server');
done('watching in the page');
