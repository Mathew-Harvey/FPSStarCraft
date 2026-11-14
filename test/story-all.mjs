// Every story job and every cut scene in a real page, one after the other: each job must start and run for a few seconds, and each cut
// scene must play through every panel, with no page errors anywhere. With `--shots DIR` it also saves one picture per cut scene panel and
// a contact sheet per scene there (the capture sheets for the story PR).
// Run with: npm run build && node test/story-all.mjs [--shots DIR] [--from N]
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import { testPage } from './page.mjs';
const require = createRequire(import.meta.url); const { chromium } = require('playwright');
const arg = k => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : undefined; };
const shots = arg('--shots'), from = +(arg('--from') || 0); if (shots) mkdirSync(shots, { recursive: true });
const page = await testPage();
const fail = []; const check = (ok, what) => { console.log((ok ? 'PASS ' : 'FAIL ') + what); if (!ok) fail.push(what); };
const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl'] });
let errs = [];
try {
  const p = await b.newPage({ viewport: { width: 960, height: 540 } }); p.setDefaultTimeout(180000);
  p.on('pageerror', e => { console.log('[pageerror]', e.message.slice(0, 400)); errs.push(e.message.slice(0, 200)); });
  const until = (fn, arg, ms = 90000) => p.waitForFunction(fn, arg, { timeout: ms }).then(() => true, () => false);
  await p.goto(page); await p.waitForFunction('window.__ore && __ore.game');
  await p.evaluate(() => { __ore.setFree(true); __ore.cutP.auto = false; });
  const count = 60;   // stops at the first index with no job
  for (let i = from; i < count; i++) {
    errs = [];
    const ok = await p.evaluate(i => { try { __ore.startStory(i); return true; } catch (e) { return String(e); } }, i);
    if (ok !== true) { if (i >= 38) break; check(false, `job index ${i} starts (${ok})`); continue; }
    for (let k = 0; k < 8; k++) { if (!(await p.evaluate(() => __ore.game.phase === 'cut'))) break; await p.keyboard.press('Escape'); await p.waitForTimeout(300); }
    const started = await until(() => __ore.game.phase === 'play' && !!(__ore.game.story || __ore.game.mission) && (__ore.game.me || (__ore.split() && __ore.split().host.mission)));
    await p.evaluate(() => { __ore.game.noRender = true; });
    await p.waitForTimeout(2500);
    const s = await p.evaluate(() => { const g = __ore.game, m = g.story || g.mission; return { name: m && m.name, objs: document.getElementById('objs').textContent.slice(0, 160), phase: g.phase }; });
    await p.evaluate(() => { __ore.game.noRender = false; });
    check(started && !!s.name && !errs.length, `job index ${i} ${s.name}: starts and runs with no page errors (${s.phase}; ${errs.join(' | ') || s.objs.replace(/\s+/g, ' ')})`);
  }
  // every cut scene: play every panel
  const ids = await p.evaluate(() => Object.keys(__ore.cuts));
  for (const id of ids) {
    errs = [];
    await p.evaluate(id => { __ore.playCuts([id], () => { window.__cutDone = id; }); }, id);
    const opened = await until(() => !document.getElementById('cut').hidden && __ore.game.phase === 'cut');
    const panels = await p.evaluate(id => __ore.cuts[id].panels.length, id); let seen = 0;
    for (let k = 0; k < panels; k++) {
      await until(k => new RegExp('^' + (k + 1) + ' /').test(document.querySelector('#cut .cnum').textContent), k, 30000);
      await p.waitForTimeout(shots ? 1600 : 300);
      if (shots) await p.screenshot({ path: `${shots}/${id}-${k + 1}.png` });
      seen++; await p.evaluate(() => document.getElementById('cut').click());
    }
    const done = await until(id => window.__cutDone === id, id, 30000);
    check(opened && seen === panels && done && !errs.length, `cut scene ${id}: ${seen}/${panels} panels with no page errors${errs.length ? ' (' + errs.join(' | ') + ')' : ''}`);
  }
} finally { await b.close(); }
console.log(fail.length ? `\n${fail.length} failed` : '\nall passed');
process.exit(fail.length ? 1 : 0);
