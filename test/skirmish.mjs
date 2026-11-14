// The default skirmish (nothing changed on the menu: Ironhold against the Veyl) is the full match with two economies: the Veyl send
// Tenders to mine, build and train, and the goal is to break every Choir Stone. The old raid match is still there, behind the
// "Raid the Veyl outpost" button, and only while the player is Ironhold.
// Run with: npm run build && node test/skirmish.mjs   (SHOTS=dir also saves the menu and the first minute's radio)
import { createRequire } from 'node:module';
import { writeFileSync } from 'node:fs';
const require = createRequire(import.meta.url); const { chromium } = require('playwright');
import { testPage } from './page.mjs';
const page = await testPage(), SHOTS = process.env.SHOTS || '';
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

  // ---- the HUD over every faction: portraits, the worker count, key names, and what overlaps what (from the quality review, 14 Nov)
  await p.close();
  const q = await b.newPage({ viewport: { width: 1600, height: 900 } }); q.setDefaultTimeout(300000);
  q.on('pageerror', e => { console.log('[pageerror]', e.message.slice(0, 400)); fail.push('page error'); });
  await q.goto(page); await q.waitForFunction('window.__ore && __ore.game');
  // Every kind of all three factions has a picture, and none is washed out: a picture drawn after the menu had run once came out white.
  const pics = await q.evaluate(async () => { __ore.setFree(true); __ore.pickMap(0); __ore.pickSide(2); __ore.startVeyl(); __ore.quit(); __ore.portraits(['snapper', 'keeper']);
    const U = __ore.reg.UNIT, P = __ore.hud.portraits, ks = Object.keys(U).filter(k => U[k].team >= 0 && U[k].team <= 2), c = document.createElement('canvas'); c.width = c.height = 32; const x = c.getContext('2d');
    const bright = src => new Promise(r => { const im = new Image(); im.onload = () => { x.drawImage(im, 0, 0, 32, 32); const d = x.getImageData(0, 0, 32, 32).data; let w = 0; for (let i = 0; i < d.length; i += 4) if (d[i] > 245 && d[i + 1] > 245 && d[i + 2] > 245) w++; r(w / 1024); }; im.onerror = () => r(1); im.src = src; });
    const out = []; for (const k of ks) out.push([k, P[k] ? await bright(P[k]) : 1]); return out; });
  const noPic = pics.filter(([, w]) => w >= 1).map(([k]) => k), white = pics.filter(([, w]) => w > .5 && w < 1).map(([k]) => k);
  check(pics.length >= 60 && !noPic.length, `every kind of all three factions has a portrait (${pics.length} kinds${noPic.length ? ', missing: ' + noPic.join(', ') : ''})`);
  check(!white.length, `no portrait is washed out white, including ones drawn after a match has run (${white.join(', ') || 'none'})`);
  // A Gloam skirmish runs as a local host, so the page only knows where each Grazer stands: the count must still be right.
  // The page's copy of a local-host match moves only when the host does, so each step runs the host's frame and then the page's.
  await q.evaluate(() => { window.run = n => { const g = __ore.game, m = __ore.split(); for (let i = 0; i < n; i++) { if (g.phase === 'card') g.phase = 'play'; m?.frame(1 / 30); g.noRender = i < n - 1; g.update(1 / 30); } g.noRender = false; }; });
  const gl = await q.evaluate(() => { __ore.pickSide(2); __ore.startVeyl(); __ore.hold(true); const g = __ore.game; g.introT = 0; run(30 * 40);
    const hq = g.ownB('mothercap', true, g.myTeam)[0], s = __ore.hud.saturation(g, hq), near = g.units.filter(u => u.alive && u.team === g.myTeam && u.kind === 'grazer' && Math.hypot(u.pos.x - hq.pos.x, u.pos.z - hq.pos.z) < 30).length;
    return { n: s.n, near, net: !!g.net }; });
  check(gl.net && gl.n > 0 && gl.n === gl.near, `in a Gloam skirmish the worker count is right (${gl.n} counted, ${gl.near} Grazers at the Mother Cap)`);
  // Key names, and the first-person strip: a Snapper's Dig In shows Ctrl, not ControlLeft.
  const fp = await q.evaluate(() => { const g = __ore.game, H = __ore.split().host, u = H.spawn('snapper', g.myTeam, g.me.pos.x + 2, g.me.pos.z + 2); run(10); const c = g.uById.get(u.id); g.jumpCd = 0; g.possess(c, true); run(20);
    const R = s => { const e = document.querySelector(s); if (!e || e.hidden || !e.getClientRects().length) return null; const r = e.getBoundingClientRect(); return { l: r.left, t: r.top, r: r.right, b: r.bottom }; };
    return { abil: document.getElementById('abil').textContent, hint: R('#hint'), ammo: R('#ammoL'), slots: R('.slots') }; });
  check(/Ctrl/.test(fp.abil) && !/Control/.test(fp.abil), `ability keys show short names ("${fp.abil.slice(0, 40)}")`);
  const apart = (a, c) => !a || !c || a.r <= c.l || c.r <= a.l || a.b <= c.t || c.b <= a.t;
  check(apart(fp.hint, fp.ammo) && apart(fp.hint, fp.slots), 'at 1600x900 the key hints and the weapon name do not overlap');
  for (const [w, h] of [[1600, 900], [1280, 720]]) { await q.setViewportSize({ width: w, height: h }); await q.evaluate(() => run(10));
    const r = await q.evaluate(() => { const A = s => { const e = document.querySelector(s); return e && !e.hidden && e.getClientRects().length ? e.getBoundingClientRect() : null; }, h = A('#hint'), a = A('#ammoL'); return { ok: !h || !a || h.right <= a.left || a.bottom <= h.top, both: !!h && !!a }; });
    check(r.ok && r.both, `at ${w}x${h} the key hints and the weapon name are both shown and do not overlap`); if (SHOTS) await q.screenshot({ path: `${SHOTS}/hud-gloam-fp-${w}.jpg`, type: 'jpeg', quality: 85 }); }
  // The command view, with the Mother Cap moved under the clock (the spot the review found): no label over it covers the clock.
  await q.setViewportSize({ width: 1600, height: 900 });
  const cv = await q.evaluate(() => { const g = __ore.game, C = g.cmd, hq = g.ownB('mothercap', true, g.myTeam)[0]; g.pressed.add('KeyN'); run(40);
    C.sel.clear(); C.selB = hq; const clock = document.getElementById('clock').getBoundingClientRect(), [hx, hy] = __ore.hud.toHud(clock.left + clock.width / 2, clock.bottom + 30), P = C.focus.clone();
    for (let k = 0; k < 4; k++) { if (!C.ground(hx, hy, P)) break; C.focus.x += hq.pos.x - P.x; C.focus.z += hq.pos.z - P.z; run(4); }
    const labs = [...document.querySelectorAll('#anchors .lab')].filter(e => !e.hidden && /Workers/i.test(e.textContent)).map(e => e.getBoundingClientRect());
    return { shown: labs.length, hit: labs.filter(r => !(r.right <= clock.left || clock.right <= r.left || r.bottom <= clock.top || clock.bottom <= r.top)).length }; });
  check(cv.shown > 0 && cv.hit === 0, `in the command view the Workers label of a Mother Cap under the clock does not cover it (${cv.shown} shown, ${cv.hit} on the clock)`);
  if (SHOTS) await q.screenshot({ path: `${SHOTS}/hud-gloam-cmd-1600.jpg`, type: 'jpeg', quality: 85 });
} finally { await b.close(); }
console.log(fail.length ? `\n${fail.length} FAILED` : '\nall skirmish checks passed'); process.exit(fail.length ? 1 : 0);
