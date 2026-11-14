// The default skirmish (nothing changed on the menu: Ironhold against the Veyl) is the full match with two economies: the Veyl send
// Tenders to mine, build and train, and the goal is to break every Choir Stone. The old raid match is still there, behind the
// "Raid the Veyl outpost" button, and only while the player is Ironhold.
// Run with: npm run build && node test/skirmish.mjs   (SHOTS=dir also saves the menu and the first minute's radio)
import { createRequire } from 'node:module';
import { writeFileSync } from 'node:fs';
const require = createRequire(import.meta.url); const { chromium } = require('playwright');
const page = 'file://' + process.cwd() + '/dist/index.html', SHOTS = process.env.SHOTS || '';
const fail = []; const check = (ok, what) => { console.log((ok ? 'PASS ' : 'FAIL ') + what); if (!ok) fail.push(what); };
const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl', '--disable-dev-shm-usage'] });
try {
  const p = await b.newPage({ viewport: { width: 1280, height: 900 } }); p.setDefaultTimeout(300000);
  p.on('pageerror', e => { console.log('[pageerror]', e.message.slice(0, 400)); fail.push('page error'); });
  await p.goto(page); await p.waitForFunction('window.__ore && __ore.game');
  // A first visit: nothing saved from an earlier run.
  await p.evaluate(() => { try { localStorage.clear(); } catch { /* none */ } }); await p.reload(); await p.waitForFunction('window.__ore && __ore.game');
  const menu = await p.evaluate(() => { __ore.setFree(true); __ore.pickMap(0); const r = document.getElementById('raid');
    return { shown: !!r && !r.hidden, lit: !!r?.classList.contains('on'), veylLit: document.querySelectorAll('#foes button')[0].classList.contains('on'), eco: __ore.game.eco }; });
  check(menu.shown && !menu.lit && menu.veylLit, 'on a first visit "Against the Veyl" is lit and the raid button is shown but not lit');
  check(menu.eco, 'the skirmish built behind the menu already runs both economies');
  if (SHOTS) await p.screenshot({ path: `${SHOTS}/skirmish-menu.jpg`, type: 'jpeg', quality: 85 });

  const out = await p.evaluate(() => {
    __ore.pickMap(0); __ore.start(); __ore.hold(true);
    const g = __ore.game; g.introT = 0; const said = []; const feed = g.feed.bind(g); g.feed = (who, msg, cls, team) => { if (team < 0 || team === g.myTeam) said.push(`${who}: ${msg}`); return feed(who, msg, cls, team); };
    const objs0 = g.dir.objectives().map(o => o.text);
    const tenders0 = g.units.filter(u => u.alive && u.team === 1 && u.kind === 'tender').length;
    for (let i = 0; i < 30 * 90; i++) { if (g.phase === 'card') g.phase = 'play'; g.noRender = true; g.update(1 / 30); }
    const tenders = g.units.filter(u => u.alive && u.team === 1 && u.kind === 'tender');
    return { eco: g.eco, objs0, tenders0, tenders: tenders.length, working: tenders.filter(u => ['toOre', 'mining', 'toHQ'].includes(u.state)).length, banked: g.stats.bySide[1] || 0, stones: g.ownB('choir', false, 1).length,
      title: document.querySelector('#objs h6')?.textContent || '', said };
  });
  check(out.eco, 'a default skirmish starts with game.eco on');
  check(out.tenders0 > 0, `the Veyl start with Tenders (${out.tenders0})`);
  check(out.working > 0 && out.banked > 0, `after 90 s the Veyl Tenders are mining and have banked ore (${out.working} at work, ${out.banked} banked)`);
  check(out.objs0.some(t => /Choir Stone/.test(t)) && !out.objs0.some(t => /Smash the Choir Stones \(/.test(t)), `the First shift list asks to break every Choir Stone, not the raid match's three (${out.objs0.join(' | ')})`);
  check(!out.said.some(m => /outpost|breed|free/i.test(m)), 'nothing on the radio in the first 90 s talks about the raid outpost');
  console.log('First shift list:\n  ' + out.objs0.join('\n  ')); console.log('Radio, first 90 s:\n  ' + out.said.join('\n  '));
  if (SHOTS) writeFileSync(`${SHOTS}/skirmish-radio.txt`, out.objs0.join('\n') + '\n\n' + out.said.join('\n') + '\n');

  const raid = await p.evaluate(() => { __ore.quit?.(); document.getElementById('raid').click(); const lit = document.getElementById('raid').classList.contains('on'), veyl = document.querySelectorAll('#foes button')[0].classList.contains('on');
    const eco = __ore.game.eco; __ore.start(); __ore.hold(true); const g = __ore.game; return { lit, veyl, eco, startEco: g.eco }; });
  check(raid.lit && !raid.veyl && !raid.eco && !raid.startEco, 'the raid button lights alone and builds the old raid match (eco off)');
  const back = await p.evaluate(() => { __ore.quit?.(); document.querySelectorAll('#foes button')[0].click(); return { eco: __ore.game.eco, lit: document.getElementById('raid').classList.contains('on') }; });
  check(back.eco && !back.lit, 'picking "Against the Veyl" again goes back to two economies');
  const veyl = await p.evaluate(() => { document.querySelectorAll('#sides button')[1]?.click(); const r = document.getElementById('raid'); return r.hidden; });
  check(veyl, 'playing the Veyl hides the raid button');
} finally { await b.close(); }
console.log(fail.length ? `\n${fail.length} FAILED` : '\nall skirmish checks passed'); process.exit(fail.length ? 1 : 0);
