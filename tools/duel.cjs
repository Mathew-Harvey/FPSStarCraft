// Squad against squad on open ground, AI on both sides. Usage: node tools/duel.cjs [runs]
// Prints who is left standing for each pairing, so the counters can be read off a table.
const { chromium } = require('playwright');
(async () => {
  const runs = +(process.argv[2] || 3);
  const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl'] });
  const p = await b.newPage({ viewport: { width: 640, height: 360 } }); p.setDefaultTimeout(900000);
  p.on('pageerror', e => console.log('PAGEERROR', e.message.slice(0, 300)));
  await p.goto(require('url').pathToFileURL(require('path').join(__dirname, '..', 'dist', 'index.html')).href); await p.waitForFunction('window.__ore && __ore.game');
  await p.evaluate(() => { __ore.setFree(true); __ore.pickMap(0); document.querySelectorAll('#diff button')[1].click(); __ore.start(); const g = __ore.game; g.noRender = true; g.introT = 0; });
  // Ironhold squads worth about 360 ore, against Veyl squads the raid budget prices the same (a Cantor or Lancer is one point, a Warden five).
  const iron = { '6 Linesmen': { linesman: 6 }, '3 Breachers': { breacher: 3 }, '3 Longshots': { longshot: 3 }, 'Gantry + 2 Linesmen': { gantry: 1, linesman: 2 }, '4 Linesmen + Patch': { linesman: 4, patch: 1 }, 'Breacher, 2 Linesmen, Longshot': { breacher: 1, linesman: 2, longshot: 1 } };
  const veyl = { '6 Cantors': { cantor: 6 }, '6 Lancers': { lancer: 6 }, '3 Cantors + 3 Lancers': { cantor: 3, lancer: 3 }, 'Warden + Cantor': { warden: 1, cantor: 1 } };
  const rows = [];
  for (const [in_, ic] of Object.entries(iron)) { const row = [in_];
    for (const [vn, vc] of Object.entries(veyl)) {
      const r = await p.evaluate(([ic, vc, runs]) => { const g = __ore.game; let iw = 0, left = 0;
        for (let run = 0; run < runs; run++) {
          for (const u of g.units) if (u.alive && u.kind !== 'rigger') { u.hp = 0; u.alive = false; u.obj.visible = false; } g.phase = 'play'; g.dir.raidIn = 9999;
          const A = [], B = [], cx = 60, cz = -34;
          for (const [k, n] of Object.entries(ic)) for (let i = 0; i < n; i++) { const u = g.spawn(k, 0, cx - 16 + (i % 2) * 2, cz + A.length * 2.4 - 6); A.push(u); }
          for (const [k, n] of Object.entries(vc)) for (let i = 0; i < n; i++) { const u = g.spawn(k, 1, cx + 16 - (i % 2) * 2, cz + B.length * 2.4 - 6); B.push(u); }
          g.me = null;
          for (let t = 0; t < 1800; t++) { if (g.phase !== 'play') g.phase = 'play';
            for (const u of A) if (u.alive) { u.state = 'attack'; u.gx = cx + 14; u.gz = cz; } for (const u of B) if (u.alive) { u.state = 'attack'; u.gx = cx - 14; u.gz = cz; }
            g.update(.05); if (!A.some(u => u.alive) || !B.some(u => u.alive)) break; }
          const a = A.filter(u => u.alive), bb = B.filter(u => u.alive); const hp = l => l.reduce((s, u) => s + u.hp + u.shield, 0), full = l => l.reduce((s, u) => s + u.maxHp + u.maxShield, 0);
          if (a.length && !bb.length) { iw++; left += hp(a) / full(A); } else if (bb.length && !a.length) left -= hp(bb) / full(B);
        }
        return [iw, left / runs]; }, [ic, vc, runs]);
      row.push(`${r[0]}/${runs} ${(r[1] * 100).toFixed(0).padStart(4)}%`);
    }
    rows.push(row);
  }
  console.log(['Ironhold wins and margin (+ Ironhold health left, - Veyl)', ...Object.keys(veyl)].join(' | ')); for (const r of rows) console.log(r.join(' | '));
  await b.close();
})();
