// Gloam against Ironhold, both run by bots with a full economy. Usage: npm run build && node tools/geco.cjs '[[map, diff], ...]' [minutes] [every]
// Set FEED=1 to print what the advisers say.
const { chromium } = require('playwright');
(async () => {
  const runs = JSON.parse(process.argv[2] || '[[0,1]]'), mins = +(process.argv[3] || 30), every = +(process.argv[4] || 6);
  const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl'] });
  for (const [map, d] of runs) {
    const p = await b.newPage({ viewport: { width: 640, height: 360 } }); p.setDefaultTimeout(900000);
    p.on('pageerror', e => console.log('PAGEERROR', e.message.slice(0, 300), e.stack?.split('\n').slice(0, 4).join(' | ')));
    await p.goto(require('url').pathToFileURL(require('path').join(__dirname, '..', 'dist', 'index.html')).href); await p.waitForFunction('window.__ore && __ore.game');
    await p.evaluate(([map, d]) => { __ore.setFree(true); __ore.pickMap(map); document.querySelectorAll('#diff button')[d].click(); __ore.pickSide(2); __ore.startVeyl(); const g = __ore.game; g.noRender = true; g.phase = 'paused';
      const h = __ore.split().host; h.human = [false, false, false]; for (const u of h.units) u.pilot = 0; window.bad = {}; window.fl = []; const f = h.feed.bind(h); h.feed = (w, m, c) => { if (!/^(Linesman|Snapper|Quillback|Blister|Mulcher|Breacher|Patch|Longshot|Gantry|Rigger|Grazer)$/.test(w)) fl.push(Math.round(h.time) + ' ' + w + ': ' + m); return f(w, m, c); }; }, [map, d]);
    let res = null;
    for (let i = 0; !res; i++) {
      const r = await p.evaluate(() => { const h = __ore.split().host, note = k => { bad[k] = (bad[k] || 0) + 1; };
        for (let k = 0; k < 600 && h.phase !== 'over'; k++) { h.update(.05);
          if (k % 100 === 0) for (const u of h.units) if (u.alive && !isFinite(u.pos.x + u.pos.z + u.hp)) note('nan ' + u.kind);
          if (h.purse[0] < -1 || h.purse[2] < -1) note('negative ore'); }
        const side = t => { const a = h.army(t), hk = t ? 'mothercap' : 'headframe', hq = h.buildings.find(b => b.alive && b.team === t && b.kind === hk); return { army: a.length, away: hq ? a.filter(u => Math.hypot(u.pos.x - hq.pos.x, u.pos.z - hq.pos.z) > 50).length : -1, fighting: a.filter(u => u.target).length, kinds: a.reduce((o, u) => (o[u.kind] = (o[u.kind] || 0) + 1, o), {}), work: h.units.filter(u => u.alive && u.team === t && (u.kind === 'rigger' || u.kind === 'grazer')).length, bld: h.buildings.filter(b => b.alive && b.team === t).map(b => b.kind.slice(0, 4) + (b.built ? '' : '*')).join(','), hq: h.buildings.filter(b => b.alive && b.built && b.team === t && b.kind === hk).length, ore: Math.floor(h.purse[t]), sup: h.supplyUsed(t) + '/' + h.supplyCap(t), buds: t ? h.buildings.filter(b => b.alive && b.kind === 'mothercap').map(b => b.buds + '+' + b.queue.length).join(' ') : '' }; };
        return { t: Math.round(h.time), over: h.phase === 'over', won: h.won, I: side(0), G: side(2), up: Object.keys(h.up).filter(k => h.up[k]).join(' '), feed: fl.splice(0), st: { mined: Math.floor(h.stats.mined), minedV: Math.floor(h.stats.minedV), kills: h.stats.kills, lost: h.stats.lost }, bloom: h.carpet.patches.length, bad }; });
      if (process.env.FEED) for (const l of r.feed) console.log('      | ' + l);
      if (i % every === every - 1 || r.over) console.log(`  ${r.t}s IRON ${JSON.stringify(r.I)}\n        GLOAM ${JSON.stringify(r.G)}\n        up ${r.up} ${JSON.stringify(r.st)} bloom ${r.bloom}`);
      if (r.over || r.t >= mins * 60) res = r;
    }
    console.log(`MAP ${map} DIFF ${d}: ${res.over ? (res.won ? 'IRONHOLD WON' : 'GLOAM WON') : 'UNFINISHED'} at ${res.t}s`, JSON.stringify(res.bad));
    await p.close();
  }
  await b.close();
})();
