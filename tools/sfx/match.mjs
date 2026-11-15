// Plays bot matches in a real browser with sound on and counts what was heard: which casts made a sound, how many voices start
// each second (a pile-up is mud, not ASMR), and any error from the sound code.
// Run after npm run build:  node tools/sfx/match.mjs [minutes per match]
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
const { testPage } = await import('../../test/page.mjs');
const MIN = +(process.argv[2] || 4);
const b = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required', '--disable-dev-shm-usage', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const out = [];
try {
  for (const [F, FOE] of [[0, 1], [1, 2], [2, 0]]) {
    const p = await b.newPage({ viewport: { width: 960, height: 540 } }); p.setDefaultTimeout(900000); const errs = [];
    p.on('pageerror', e => errs.push(e.message.slice(0, 200))); p.on('console', m => { if (m.type() === 'error' || /sound/.test(m.text())) errs.push(m.text().slice(0, 200)); });
    await p.addInitScript(() => {
      const AC = window.AudioContext; let starts = 0; window.__starts = () => { const s = starts; starts = 0; return s; };
      const bs = AC.prototype.createBufferSource, os = AC.prototype.createOscillator;
      AC.prototype.createBufferSource = function () { starts++; return bs.call(this); }; AC.prototype.createOscillator = function () { starts++; return os.call(this); };
    });
    await p.goto(await testPage()); await p.waitForFunction('window.__ore && __ore.game');
    await p.evaluate(() => localStorage.setItem('ore-else', JSON.stringify({ q: 3 }))); await p.reload(); await p.waitForFunction('window.__ore && __ore.game');   // low detail: full detail runs software GL out of memory
    await p.evaluate(([F, FOE]) => { __ore.setFree(true); __ore.pickSide(F, FOE); __ore.pickMap(0); __ore.start(); }, [F, FOE]);
    await p.waitForFunction(() => __ore.game.me, null, { timeout: 120000 });
    const r = await p.evaluate(async ([MIN]) => {
      const g = __ore.game; g.introT = 0; const T = g.me.team; const per = [];
      for (let s = 0; s < MIN * 60; s++) {
        for (let i = 0; i < 30; i++) { if (g.phase === 'card') g.phase = 'play'; g.human[T] = false; g.noRender = i % 6 !== 5; g.update(1 / 30); }
        await new Promise(r => setTimeout(r, 0)); per.push(window.__starts());
        if (g.phase === 'over') break;
      }
      per.sort((a, b) => a - b); const S = window.__sfx;
      return { time: Math.round(g.time), voicesPerSecMedian: per[per.length >> 1], p95: per[Math.floor(per.length * .95)], max: per[per.length - 1], winds: S.winds, engines: S.engines, casts: S.casts };
    }, [MIN]);
    out.push(`${['Ironhold', 'Veyl', 'Gloam'][F]} vs ${['Ironhold', 'Veyl', 'Gloam'][FOE]}: ${JSON.stringify(r)}${errs.length ? '\n  ERRORS: ' + [...new Set(errs)].slice(0, 8).join(' | ') : ''}`);
    await p.close();
  }
} finally { await b.close(); }
console.log(out.join('\n'));
