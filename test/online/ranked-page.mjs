// Ranked play and lobby rules in a real page. Ada plays in a browser; Bree is a plain WebSocket client.
// Ada opens Ranked on the multiplayer menu, picks a faction and looks for a match; Bree queues too; they are paired and the match starts in
// the page. Bree leaves, and Ada's end screen shows her rating change. Back on the menu the panel shows her rating and the top ten.
// Then Ada makes a custom lobby and sets the game speed from the rules row.
// Run with: npm run build && node test/online/ranked-page.mjs
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { server, client, sleep, checker } from './lib.mjs';
const require = createRequire(import.meta.url); const { chromium } = require('playwright');
const { check, done, fail } = checker();
const SHOTS = process.env.SHOTS || '/mnt/project-files/full-depth/K'; try { mkdirSync(SHOTS, { recursive: true }); } catch (e) { /* screenshots are optional */ }
const S = await server(8156, { ORE_TRUST_HITS: '1' }), URL = S.http + '/';
const until = (p, fn, arg, ms = 20000) => p.waitForFunction(fn, arg, { timeout: ms }).then(() => true, () => false);
const shot = async (p, name, render = false, sel = '') => { try { if (sel) await p.evaluate(s => document.querySelector(s)?.scrollIntoView({ block: 'center' }), sel); if (render) await p.evaluate(() => { __ore.game.noRender = false; }); await sleep(800); await p.screenshot({ path: join(SHOTS, name) }); } catch (e) { console.log('no screenshot', name, e.message); } };
let b;
try {
  b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl'] });
  const P = await b.newPage({ viewport: { width: 1280, height: 800 } }); P.setDefaultTimeout(120000);
  P.on('pageerror', e => { console.log('[Ada pageerror]', e.message.slice(0, 400)); fail.push('page error'); });
  await P.goto(URL); await P.waitForFunction('window.__ore');
  await P.evaluate(() => { __ore.setFree(true); __ore.game.noRender = true; __ore.unlock(); document.getElementById('mName').value = 'Ada'; });
  await P.click('#mRanked');
  check(await until(P, () => !document.getElementById('mRankBox').hidden && /Find a match/.test(document.getElementById('mRankBox').textContent)), 'the Ranked button opens the ranked panel');
  await P.click('#mRankBox button[data-f="1"]');
  check(await P.evaluate(() => document.querySelector('#mRankBox button[data-f="1"]').classList.contains('on')), 'Ada picks the Veyl');
  await P.click('#mRankBox button[data-a="find"]');
  check(await until(P, () => /Looking for a match/.test(document.getElementById('mRankBox').innerText)), 'Find a match puts her in the queue, and the panel says so');
  await shot(P, 'ranked-looking.png');
  const key = await P.evaluate(() => JSON.parse(localStorage.getItem('oreElseRankKeys') || '{}').ada || '');
  check(/^[a-f0-9]{32}$/.test(key), 'the page keeps the key for her name');
  const B = await client(S.url, 'Bree'); B.send({ t: 'queue', name: 'Bree', fac: 0 });
  check(await until(P, () => __ore.game.net && __ore.game.phase !== 'menu' && __ore.game.me && __ore.game.units.length > 3, null, 30000), 'they are paired and the match starts in the page' + await P.evaluate(() => { const g = __ore.game; return ` (${!!g.net} ${g.phase} ${!!g.me} ${g.units.length})`; }));
  const bB = await B.wait(m => m.t === 'begin'), mine = await P.evaluate(() => ({ team: __ore.game.myTeam, out: __ore.game.net.lobby?.out }));
  check(mine.team !== bB.team && [1, 3].includes(bB.out), `Ada plays the Veyl against Bree's Ironhold (match code ${bB.out})`);
  await sleep(1500);
  B.send({ t: 'leave' });
  check(await until(P, () => { const e = document.getElementById('end'); return e && !e.hidden && /Ranked: your rating went from 1500 to \d+ \(\+\d+\)/.test(e.innerText); }, null, 20000), 'Bree leaves: Ada\'s end screen shows her rating going up');
  const endText = await P.evaluate(() => document.getElementById('end').innerText);
  check(/Bree left the match/.test(endText), 'and says Bree left');
  await shot(P, 'ranked-end.png', true);
  await P.evaluate(() => { __ore.game.noRender = true; __ore.quit(); __ore.unlock(); }); await sleep(800);
  await P.evaluate(() => { const b = document.getElementById('mRankBox'); if (!b.hidden) document.getElementById('mRanked').click(); });
  await P.click('#mRanked');
  check(await until(P, () => /rating 1\d\d\d \(still settling\), 1 won, 0 lost/.test(document.getElementById('mRankBox').innerText) && document.querySelectorAll('#mRankBox table tr').length === 3), 'the panel shows her rating and the top players');
  await shot(P, 'ranked-panel.png', false, '#mRankBox');
  // ---------------------------------------------------------------- lobby rules
  await P.click('#mCreate');
  check(await until(P, () => __ore.game && !document.getElementById('mLobby').hidden && !document.getElementById('mRuleSpeed').disabled), 'in her own lobby the host can change the rules');
  await P.selectOption('#mRuleSpeed', '1.5'); await P.selectOption('#mRuleOre', '500');
  check(await until(P, () => { const r = __ore.net()?.lobby?.rules; return !!r && r.speed === 1.5 && r.ore === 500; }), 'the server takes them: the lobby comes back with Faster and 500 ore');
  const Q = await client(S.url, 'Quin'); const code = await P.evaluate(() => document.getElementById('mCodeShow').textContent.trim());
  Q.send({ t: 'join', code, name: 'Quin' }); const ql = await Q.wait(m => m.t === 'lobby' && m.code === code);
  check(ql.rules && ql.rules.speed === 1.5 && ql.rules.ore === 500, 'a player who joins sees the host\'s rules: Faster, 500 ore');
  check(await until(P, () => document.getElementById('mRuleSpeed').value === '1.5' && document.getElementById('mRuleOre').value === '500'), 'and the host\'s row still shows them after the lobby changed');
  await shot(P, 'lobby-rules.png', false, '#mRules');
  Q.send({ t: 'ready', v: true }); await sleep(400); await P.click('#mStart');
  check(await until(P, () => __ore.game.net && __ore.game.net.speed === 1.5 && __ore.game.phase !== 'menu', null, 30000), 'the match starts at the lobby speed in the page');
  Q.close(); B.close();
} catch (err) { check(false, 'the test ran to the end: ' + err.message); }
try { await b?.close(); } catch (e) { /* gone */ }
S.stop(); done('ranked page');
