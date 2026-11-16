// Plays bot matches in a real browser with sound on and counts what was heard: which casts made a sound, how many voices start
// each second (a pile-up is mud, not ASMR), and any error from the sound code.
// Run after npm run build:  node tools/sfx/match.mjs [minutes per match]
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
const { testPage } = await import('../../test/page.mjs');
const MIN = +(process.argv[2] || 4);
const b = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required', '--disable-dev-shm-usage', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl'] });
const out = [];
try {
  for (const [F, FOE] of [[0, 1], [1, 2], [2, 0]]) {
    const p = await b.newPage({ viewport: { width: 960, height: 540 } }); p.setDefaultTimeout(900000); const errs = [];
    p.on('pageerror', e => errs.push(e.message.slice(0, 200))); p.on('console', m => { if (m.type() === 'error' || /sound/.test(m.text())) errs.push(m.text().slice(0, 200)); });
    await p.goto(await testPage()); await p.waitForFunction('window.__ore && __ore.game');
    await p.evaluate(() => localStorage.setItem('ore-else', JSON.stringify({ q: 3 }))); await p.reload(); await p.waitForFunction('window.__ore && __ore.game');   // low detail: full detail runs software GL out of memory
    await p.evaluate(([F, FOE]) => { __ore.setFree(true); __ore.pickSide(F, FOE); __ore.pickMap(0); __ore.start(); }, [F, FOE]);
    await p.waitForFunction(() => __ore.game.me, null, { timeout: 120000 });
    await p.evaluate(() => {   // count every voice the game starts from here on
      const B = (window.BaseAudioContext || window.AudioContext).prototype; let starts = 0; window.__starts = () => { const s = starts; starts = 0; return s; };
      const bs = B.createBufferSource, os = B.createOscillator;
      B.createBufferSource = function () { starts++; return bs.call(this); }; B.createOscillator = function () { starts++; return os.call(this); };
    });
    // one game second per call, nothing drawn (sound is ticked by hand): drawing for minutes in software GL crashes the page, on main too
    const per = [];
    for (let s = 0; s < MIN * 60; s++) {
      const [n, over] = await p.evaluate(() => { const g = __ore.game, T = g.me ? g.me.team : 0; for (let i = 0; i < 30; i++) { if (g.phase === 'card') g.phase = 'play'; g.human[T] = false; g.noRender = true; g.update(1 / 30); if (i % 3 === 0) __sfx.tick(g, true); } return [window.__starts(), g.phase === 'over']; });
      per.push(n); if (over) break; if (s % 20 === 0) process.stderr.write(`${F}:${s} `);
    }
    per.sort((a, b) => a - b);
    const r = { ...(await p.evaluate(() => ({ time: Math.round(__ore.game.time), winds: __sfx.winds, engines: __sfx.engines, casts: __sfx.casts }))), voicesPerSecMedian: per[per.length >> 1], p95: per[Math.floor(per.length * .95)], max: per[per.length - 1] };
    out.push(`${['Ironhold', 'Veyl', 'Gloam'][F]} vs ${['Ironhold', 'Veyl', 'Gloam'][FOE]}: ${JSON.stringify(r)}${errs.length ? '\n  ERRORS: ' + [...new Set(errs)].slice(0, 8).join(' | ') : ''}`);
    await p.close();
  }
} finally { await b.close(); }
console.log(out.join('\n'));
