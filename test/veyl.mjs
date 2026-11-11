// One headless browser plays the Veyl side of a skirmish: a local host runs the Ironhold bots, this page is its only seat.
// Run with: npm run build && node test/veyl.mjs
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
const require = createRequire(import.meta.url); const { chromium } = require('playwright');
const page = pathToFileURL(join(dirname(fileURLToPath(import.meta.url)), '..', 'dist', 'index.html')).href, SHOTS = process.env.SHOTS || '';
const fail = []; const check = (ok, what) => { console.log((ok ? 'PASS ' : 'FAIL ') + what); if (!ok) fail.push(what); };
const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl'] });
try {
  const p = await b.newPage({ viewport: { width: 1280, height: 720 } }); p.setDefaultTimeout(120000);
  p.on('pageerror', e => { console.log('[pageerror]', e.message.slice(0, 400)); fail.push('page error'); });
  const until = (fn, arg, ms = 60000) => p.waitForFunction(fn, arg, { timeout: ms }).then(() => true, () => false);
  await p.goto(page); await p.waitForFunction('window.__ore && __ore.game');
  // the menu's side picker sends Clock in to the Veyl
  await p.evaluate(() => { __ore.setFree(true); document.querySelector('[data-m="skirm"]').click(); document.querySelectorAll('#sides button')[1].click(); });
  check(await p.evaluate(() => document.getElementById('start').textContent) === 'Start singing', 'picking the Veyl relabels the start button');
  await p.evaluate(() => document.getElementById('start').click());
  check(await until(() => __ore.game.me && __ore.split() && __ore.game.units.length > 6), 'the Veyl run starts and hands over a body');
  const s = await p.evaluate(() => { const g = __ore.game, h = __ore.split().host; return { team: g.myTeam, kind: g.me.kind, eco: h.eco, human: h.human.join(), stones: h.buildings.filter(b => b.alive && b.team === 1 && b.kind === 'choir').length, tenders: h.units.filter(u => u.alive && u.kind === 'tender').length, iron: h.units.filter(u => u.alive && u.team === 0).length, cash: g.purse[1], two: !!__ore.game2() }; });
  console.log(JSON.stringify(s));
  check(s.team === 1 && s.kind === 'tender', 'the player is a Veyl Tender');
  check(s.eco && s.human === 'false,true', 'the match runs the Veyl economy, with Ironhold left to the bots');
  check(s.stones === 1 && s.tenders >= 6 && s.iron >= 4, `one Choir Stone, ${s.tenders} Tenders and an Ironhold crew`);
  check(!s.two, 'only one view on screen');
  if (SHOTS) { await p.waitForTimeout(3000); await p.screenshot({ path: SHOTS + '/veyl-start.png' }); }
  // the bot Tenders hum ore home, and the player's screen sees the Veyl purse grow
  const c0 = s.cash;
  check(await until(c => __ore.game.purse[1] > c + 20, c0, 90000), 'the Tenders hum ore into the Veyl purse');
  // build from the player's seat: a Brood Pit, then a Hushwell
  // the Conductor runs the economy until told otherwise: hand it to the player so the purse is theirs alone
  await p.evaluate(() => { const h = __ore.split().host; h.dir.vs.auto = false; h.purse[1] = 2000; });
  await until(() => __ore.game.purse[1] >= 1500);
  const placed = await p.evaluate(() => { const g = __ore.game, h = __ore.split().host, st = h.buildings.find(b => b.alive && b.team === 1 && b.kind === 'choir'); const out = [];
    for (const k of ['broodpit', 'hushwell']) { let done = false; for (let r = k === 'hushwell' ? 26 : 14; r < 48 && !done; r += 3) for (let a = k === 'hushwell' ? 3.14 : 0; a < 9.42 && !done; a += .4) { const x = st.pos.x + Math.cos(a) * r, z = st.pos.z + Math.sin(a) * r; if (h.canPlace(k, x, z, false, 1)) { g.place(k, x, z, false, 1); out.push(k); done = true; } } } return out.join(); });
  check(placed === 'broodpit,hushwell', 'the player can lay out a Brood Pit and a Hushwell');
  check(await until(() => __ore.split().host.buildings.filter(b => b.team === 1 && (b.kind === 'broodpit' || b.kind === 'hushwell')).length >= 2), 'the host takes both sites');
  // finish them so training can be tested quickly
  await p.evaluate(() => { for (const b of __ore.split().host.buildings) if (b.team === 1 && !b.built) b.progress = 1; });
  check(await until(() => __ore.game.buildings.some(b => b.team === 1 && b.kind === 'broodpit' && b.built), null, 60000), 'the Brood Pit sings up and the player sees it');
  const pit = await p.evaluate(() => { const g = __ore.game, b = g.buildings.find(x => x.team === 1 && x.kind === 'broodpit' && x.built); return g.train(b, 'lancer') ? b.id : 0; });
  check(!!pit && await until(() => __ore.split().host.buildings.some(b => b.kind === 'broodpit' && b.queue && b.queue.length), null, 20000), 'training a Lancer from the player reaches the pit');
  // research at the Choir Stone
  const up = await p.evaluate(() => __ore.game.buyUpgrade('vhum'));
  check(up && await until(() => __ore.split().host.up.vhum, null, 20000), 'the player can research Choir Stone hum');
  // Ironhold bots dig and build on their own
  check(await until(() => { const h = __ore.split().host; return h.stats.mined > 60 && h.units.some(u => u.alive && u.team === 0 && u.kind === 'rigger' && u.state !== 'idle'); }, null, 90000), 'the Ironhold bots run their own economy');
  // the end screen reads from the Veyl point of view
  await p.evaluate(() => { const h = __ore.split().host; for (const b of h.buildings) if (b.team === 0 && b.kind === 'headframe' && b.alive) h.damage(b, 1e6, null); });
  check(await until(() => __ore.game.phase === 'over', null, 30000), 'breaking every Headframe ends the match');
  await p.waitForTimeout(600);
  const end = await p.evaluate(() => [__ore.game.won, document.getElementById('endTitle').textContent]);
  console.log(JSON.stringify(end));
  check(end[0] === true && /Veyl take/.test(end[1]), 'the Veyl player is told they won');
} finally { await b.close(); }
if (fail.length) { console.log(`\n${fail.length} failed`); process.exit(1); } else console.log('\nall passed');
