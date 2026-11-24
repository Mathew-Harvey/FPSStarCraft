// The stage 2 screens in the real page: the challenges card on Home, the variant buttons, and the player's own row on the end screen with a
// "new best" stamp, kept across a reload. Run with: npm run build && node test/career.mjs   (SHOTS=dir saves the three screens)
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url); const { chromium } = require('playwright');
import { testPage } from './page.mjs';
const page = await testPage(), SHOTS = process.env.SHOTS || '';
const fail = []; const check = (ok, what) => { console.log((ok ? 'PASS ' : 'FAIL ') + what); if (!ok) fail.push(what); };
const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl', '--disable-dev-shm-usage'] });
try {
  const p = await b.newPage({ viewport: { width: 1440, height: 900 } }); p.setDefaultTimeout(300000);
  p.on('pageerror', e => { console.log('[pageerror]', e.message.slice(0, 400)); fail.push('page error'); });
  await p.goto(page); await p.waitForFunction('window.__ore && __ore.game');
  await p.evaluate(() => { try { localStorage.clear(); } catch { /* none */ } }); await p.reload(); await p.waitForFunction('window.__ore && __ore.game');
  const home = await p.evaluate(() => ({ n: document.getElementById('bcChN').textContent, pips: document.querySelectorAll('#bcBadges i').length, lit: document.querySelectorAll('#bcBadges i.on').length, next: document.getElementById('bcChNext').textContent }));
  check(home.n === '0 of 30' && home.pips === 10 && home.lit === 0 && /On the payroll/.test(home.next), `Home shows ten empty badges and the first challenge (${home.n}; ${home.next})`);
  if (SHOTS) await p.screenshot({ path: `${SHOTS}/career-home.jpg`, type: 'jpeg', quality: 85 });

  const vars = await p.evaluate(() => { __ore.setFree(true); __ore.pickMap(0); const B = [...document.querySelectorAll('#vars button')]; B.find(x => x.dataset.v === 'short').click(); B.find(x => x.dataset.v === 'hid').click();
    return { n: B.length, on: B.filter(x => x.classList.contains('on')).map(x => x.dataset.v).join(','), hid: __ore.game.mapI >= 100, saved: JSON.parse(localStorage.getItem('ore-else')).vr.join(',') }; });
  check(vars.n === 4 && vars.on === 'hid,short' && vars.saved === 'short,hid', `two variants switch on and are saved (${vars.on})`);
  check(vars.hid, 'a hidden start turns the Medium map behind the menu');
  const vast = await p.evaluate(() => { __ore.pickMap(30); const h = document.querySelector('#vars [data-v=hid]'); const r = { off: h.disabled, lit: h.classList.contains('on') }; __ore.pickMap(0); return r; });
  check(vast.off && !vast.lit, 'on Vast the hidden start button is off: Vast always has one');
  if (SHOTS) { await p.evaluate(() => document.querySelector('[data-m=skirm]')?.click()); await p.screenshot({ path: `${SHOTS}/career-setup.jpg`, type: 'jpeg', quality: 85 }); }

  const end = await p.evaluate(async () => {
    __ore.start(); __ore.hold(true); const g = __ore.game; g.introT = 0; g.noRender = true; for (let i = 0; i < 60; i++) { if (g.phase === 'card') g.phase = 'play'; g.update(1 / 30); }
    const ot = g.time; g.time = 8.5 * 60; const over = g.overtime() > 0; g.time = ot;
    Object.assign(g.tally, { kills: 14, dealt: 1210, side: 4100, streak: 5, deaths: 2, bodyT: 500, aboveT: 90 }); g.time = 14 * 60 + 5; g.end(true); __ore.hold(false);
    await new Promise(r => setTimeout(r, 600));
    const Y = document.getElementById('endYou'); return { over, hidMap: g.mapI >= 100, shown: !Y.hidden, cells: [...Y.querySelectorAll('.stats div')].map(d => d.querySelector('span').textContent + '=' + d.querySelector('b').textContent + (d.classList.contains('best') ? '*' : '')), earned: document.getElementById('endEarned').textContent, kept: JSON.parse(localStorage.getItem('ore-else-career') || '{}') };
  });
  check(end.over && end.hidMap, 'the match was played with a short shift on a hidden map');
  check(end.shown && end.cells.length === 6 && end.cells.some(c => c === 'You dropped=14*') && end.cells.some(c => c === 'Win time=14:05*'), `the end screen has the player's own row with new bests stamped (${end.cells.join(' | ')})`);
  check(/Challenges met: /.test(end.earned) && /Early finish/.test(end.earned) && /Overtime/.test(end.earned), `and says which challenges were met (${end.earned})`);
  check((end.kept.done || []).includes('0:win') && end.kept.best && end.kept.best.kills === 14, 'bests and challenges are saved');
  if (SHOTS) await p.screenshot({ path: `${SHOTS}/career-end.jpg`, type: 'jpeg', quality: 85 });
  await p.reload(); await p.waitForFunction('window.__ore && __ore.game');
  const back = await p.evaluate(() => ({ n: document.getElementById('bcChN').textContent, lit: document.querySelectorAll('#bcBadges i.on').length }));
  check(back.lit >= 5 && back.n === `${back.lit} of 30`, `after a reload Home shows the badges earned (${back.n})`);
  if (SHOTS) await p.screenshot({ path: `${SHOTS}/career-home2.jpg`, type: 'jpeg', quality: 85 });
} finally { await b.close(); }
console.log(fail.length ? `${fail.length} FAILED` : 'all passed'); process.exit(fail.length ? 1 : 0);
