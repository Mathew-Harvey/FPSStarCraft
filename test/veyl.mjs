// One headless browser plays the Veyl side of a skirmish: a local host runs the Ironhold bots, this page is its only seat.
// Run with: npm run build && node test/veyl.mjs
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import { testPage } from './page.mjs';
const require = createRequire(import.meta.url); const { chromium } = require('playwright');
const page = await testPage(), SHOTS = process.env.SHOTS || '';
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
  check(s.eco && s.human.split(',').slice(0, 3).join() === 'false,true,false', 'the match runs the Veyl economy, with Ironhold left to the bots');
  check(s.stones === 1 && s.tenders >= 6 && s.iron >= 4, `one Choir Stone, ${s.tenders} Tenders and an Ironhold crew`);
  check(!s.two, 'only one view on screen');
  if (SHOTS) { await p.waitForTimeout(3000); await p.screenshot({ path: SHOTS + '/veyl-start.png' }); }
  // Software rendering is slow and the rest is about the rules. With drawing on, the first ore took 85 of the 90 s allowed on the build runner.
  await p.evaluate(() => { __ore.game.noRender = true; });
  // the bot Tenders hum ore home, and the player's screen sees the Veyl purse grow
  const c0 = s.cash;
  check(await until(c => __ore.game.purse[1] > c + 20, c0, 90000), 'the Tenders hum ore into the Veyl purse');
  // build from the player's seat: a Brood Pit, then a Hushwell. A Brood Pit has to stand in a song field (beside a finished Choir Stone or
  // Hush Well), so it goes next to the Stone; a Hush Well can go anywhere near home.
  // the Conductor runs the economy until told otherwise: hand it to the player so the purse is theirs alone
  await p.evaluate(() => { const h = __ore.split().host; h.dir.vs.auto = false; h.purse[1] = 2000; });
  await until(() => __ore.game.purse[1] >= 1500);
  const placed = await p.evaluate(() => { const g = __ore.game, h = __ore.split().host, st = h.buildings.find(b => b.alive && b.team === 1 && b.kind === 'choir'); const out = [];
    for (const k of ['broodpit', 'hushwell']) { let done = false; for (let r = k === 'hushwell' ? 26 : 4; r < 48 && !done; r += k === 'hushwell' ? 3 : 1) for (let a = k === 'hushwell' ? 3.14 : 0; a < 9.42 && !done; a += .4) { const x = st.pos.x + Math.cos(a) * r, z = st.pos.z + Math.sin(a) * r; if (h.canPlace(k, x, z, false, 1)) { g.place(k, x, z, false, 1); out.push(k); done = true; } } } if (!out.includes('broodpit')) { h.canPlace('broodpit', st.pos.x + 30, st.pos.z, false, 1); out.push('refused: ' + h.placeWhy); } return out.join(); });
  check(placed === 'broodpit,hushwell', 'the player can lay out a Brood Pit and a Hushwell');
  check(await until(() => __ore.split().host.buildings.filter(b => b.team === 1 && (b.kind === 'broodpit' || b.kind === 'hushwell')).length >= 2), 'the host takes both sites');
  // finish them so training can be tested quickly
  await p.evaluate(() => { for (const b of __ore.split().host.buildings) if (b.team === 1 && !b.built) b.progress = 1; });
  check(await until(() => __ore.game.buildings.some(b => b.team === 1 && b.kind === 'broodpit' && b.built), null, 60000), 'the Brood Pit sings up and the player sees it');
  // a Cantor: a Lancer needs a Reed Gate first now
  const pit = await p.evaluate(() => { const g = __ore.game, b = g.buildings.find(x => x.team === 1 && x.kind === 'broodpit' && x.built); return b && g.train(b, 'cantor') ? b.id : 0; });
  check(!!pit && await until(() => __ore.split().host.buildings.some(b => b.kind === 'broodpit' && b.queue && b.queue.length), null, 20000), 'training a Cantor from the player reaches the pit');
  // research at the Choir Stone
  const up = await p.evaluate(() => __ore.game.buyUpgrade('vhum'));
  check(up && await until(() => __ore.split().host.upOf(1).vhum, null, 20000), 'the player can research Choir Stone hum');
  // Ironhold bots dig and build on their own
  check(await until(() => { const h = __ore.split().host; return h.stats.mined > 60 && h.units.some(u => u.alive && u.team === 0 && u.kind === 'rigger' && u.state !== 'idle'); }, null, 90000), 'the Ironhold bots run their own economy');
  // fixes from the Veyl sweep, one check each
  const sw = await p.evaluate(() => { const h = __ore.split().host, g = __ore.game, out = {};
    // a bot side facing a person gets more out of each load on Night, and nothing extra when nobody is playing either side
    out.oreK = [h.oreK(0), h.oreK(1)];
    // a paid Veyl body the AI drives takes less from a hit than one a player drives
    const a = h.spawn('cantor', 1, 0, 40), b = h.spawn('cantor', 1, 4, 40), shot = h.spawn('linesman', 0, 2, 50); b.pilot = 9; a.shield = b.shield = 0; const ha = a.hp, hb = b.hp; h.damage(a, 20, shot); h.damage(b, 20, shot); out.ai = ha - a.hp; out.piloted = hb - b.hp; b.pilot = 0;
    // a raider hitting an Ironhold Rigger draws the guards over
    const r = h.own('rigger').find(u => !u.pilot), guard = h.spawn('linesman', 0, r.pos.x + 6, r.pos.z); guard.order = { type: 'guard', x: guard.pos.x, z: guard.pos.z }; guard.target = null; h.damage(r, 1, a); out.guard = guard.target === a;
    for (const u of [a, shot, guard]) { u.hp = 0; u.alive = false; } h.damage(b, 1e6, null);
    // a half-built site can be shot down: damage sticks instead of being topped back up every frame
    const site = h.addBuilding('hushwell', 1, 30, 60, false); site.progress = .5; h.updateBuildings(1 / 30); const full = site.hp; for (let i = 0; i < 40; i++) { h.damage(site, site.maxHp * .05, null); h.updateBuildings(1 / 30); } out.site = [Math.round(full), site.alive];
    return out; });
  check(sw.oreK[0] === 1 && sw.oreK[1] === 1, `Night gives neither side extra ore (${sw.oreK.map(x => x.toFixed(2)).join(', ')})`);
  check(sw.ai < sw.piloted * .7, `an AI-driven Veyl body takes less from a hit than a player-driven one (${sw.ai.toFixed(1)} vs ${sw.piloted.toFixed(1)})`);
  check(sw.guard, 'a raider hitting an Ironhold Rigger draws the guards over');
  check(sw.site[1] === false, `a half-built site can be shot down (it had ${sw.site[0]} health)`);
  // after Thicker Glass, the Veyl player's screen (a Pylon works inside a song field, so a Hush Well goes beside it, and its levels cost Flux) shows shields within their maximum
  await p.evaluate(() => { const h = __ore.split().host; h.purse[1] += 400; h.fluxPurse[1] = (h.fluxPurse[1] || 0) + 400; if (!h.ownB('wardpylon', true, 1).length) { const x = h.stones()[0].pos.x - 14, z = h.stones()[0].pos.z + 20; h.addBuilding('hushwell', 1, x + 4, z, true); h.addBuilding('wardpylon', 1, x, z, true); } h.buyUpgrade('vglass', 1); h.spawn('cantor', 1, 0, 44); });
  check(await until(() => { const g = __ore.game; return g.upOf(1).vglass && g.units.some(u => u.alive && u.team === 1 && u.kind === 'cantor' && u.shield > 50); }, null, 20000) && await p.evaluate(() => __ore.game.units.every(u => !u.alive || u.shield <= u.maxShield + .01)), "after Thicker Glass the player's screen keeps Veyl shields within their maximum");
  // an unfinished Choir Stone does not keep the Chorus alive once the last finished one falls
  const lose = await p.evaluate(() => { const h = __ore.split().host, st = h.stones()[0]; const site = h.addBuilding('choir', 1, st.pos.x - 30, st.pos.z - 30, false); for (const b of h.buildings) if (b.kind === 'choir' && b.built && b.alive) h.damage(b, 1e7, null); return { site: site.alive, endT: h.endT, won: h.endWon }; });
  check(lose.site && lose.endT > 0 && lose.won === true, 'an unfinished Choir Stone does not keep the Chorus alive once the last finished one falls');
  // the end screen reads from the Veyl point of view
  check(await until(() => __ore.game.phase === 'over', null, 30000), 'losing every Choir Stone ends the match');
  await p.waitForTimeout(600);
  const end = await p.evaluate(() => [__ore.game.won, document.getElementById('endTitle').textContent]);
  console.log(JSON.stringify(end));
  check(end[0] === false && /falls silent/.test(end[1]), 'the Veyl player is told they lost');
  // and a fresh run won by breaking every Headframe says so
  await p.evaluate(() => __ore.startVeyl()); await until(() => __ore.game.me && __ore.split() && __ore.split().host.time > 1);
  // Every home building, whatever form it takes (a Survey Rig counts as a Headframe). Drawing is held still while the match plays out, so a
  // busy machine still runs the two seconds of ending in time.
  await p.evaluate(() => { __ore.hold(true); const h = __ore.split().host; for (const b of h.buildings) if (b.team === 0 && h.isHQ(b) && b.alive) h.damage(b, 1e6, null); });
  check(await until(() => __ore.game.phase === 'over', null, 180000), 'breaking every Headframe ends the match'); await p.evaluate(() => __ore.hold(false));
  await p.waitForTimeout(600);
  const win = await p.evaluate(() => [__ore.game.won, document.getElementById('endTitle').textContent]);
  check(win[0] === true && /Veyl take/.test(win[1]), 'the Veyl player is told they won');
} finally { await b.close(); }
if (fail.length) { console.log(`\n${fail.length} failed`); process.exit(1); } else console.log('\nall passed');
