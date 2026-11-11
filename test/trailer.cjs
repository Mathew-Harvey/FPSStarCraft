// Renders the trailer frame by frame: each shot stages the game, then steps it 1/24 s at a time and saves a screenshot.
// node trailer.js <outDir> [preview]   (preview saves one frame per shot)
const { chromium } = require('playwright'); const OUT = process.argv[2], PREVIEW = process.argv[3] === 'preview', FPS = 24;
(async () => {
  const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl'] });
  const p = await b.newPage({ viewport: { width: 1280, height: 720 } }); p.setDefaultTimeout(0);
  p.on('pageerror', e => console.log('[pageerror]', e.message.slice(0, 600)));
  await p.goto('file:///home/claude/fpsstarcraft/dist/index.html'); await p.waitForTimeout(3000);
  await p.evaluate(() => {
    localStorage.clear(); __ore.setFree(true); const T = window.__tr = {};
    const cap = document.createElement('div'); cap.id = 'trcap'; cap.style.cssText = 'position:fixed;left:0;right:0;bottom:86px;text-align:center;z-index:99;font-family:var(--display);font-size:64px;line-height:1;color:#ffc21a;text-transform:uppercase;letter-spacing:.02em;text-shadow:4px 4px 0 #0e0d14,-2px -2px 0 #0e0d14,2px -2px 0 #0e0d14,-2px 2px 0 #0e0d14,7px 7px 0 #ff4f9a;transform:rotate(-2deg);pointer-events:none'; document.body.appendChild(cap);
    T.cap = t => { cap.textContent = t; };
    T.hook = () => { const g = __ore.game; T.g = g; T.real = Object.getPrototypeOf(g).update.bind(g); g.update = () => {}; g.hud.feed = () => {}; };
    T.step = n => { for (let i = 0; i < (n || 1); i++) T.real(1 / 24); };
    T.ff = secs => { const g = T.g; g.noRender = true; for (let i = 0; i < secs * 20 && g.phase !== 'over'; i++) T.real(.05); g.noRender = false; };
    T.face = (x, z, pitch) => { const g = T.g; g.yaw = Math.atan2(x - g.me.pos.x, z - g.me.pos.z); g.pitch = pitch || 0; };
    T.into = u => { const g = T.g; g.seenKinds.add(u.kind); g.jumpCd = 0; g.possess(u, true); g.introT = 0; g.safeT = 999; g.phase = 'play'; };
    T.foe = () => { const g = T.g; let best = null, bd = 1e9; for (const u of g.units) if (u.alive && u.team !== g.myTeam) { const d = u.pos.distanceTo(g.me.pos); if (d < bd) { bd = d; best = u; } } return best; };
  });
  let n = 0;
  const shot = async (name, frames, setup, each) => {
    await p.evaluate(setup); console.log('shot', name);
    for (let i = 0; i < frames; i++) {
      if (PREVIEW && i !== Math.floor(frames * .6)) { await p.evaluate(([e, i]) => { const g = window.__tr.g; const nr = g && g.noRender; if (g) g.noRender = true; if (e) (0, eval)('(' + e + ')')(i); window.__tr.step(); if (g) g.noRender = nr; }, [each ? each.toString() : '', i]); continue; }
      await p.evaluate(([e, i]) => { if (e) (0, eval)('(' + e + ')')(i); window.__tr.step(); }, [each ? each.toString() : '', i]);
      await p.screenshot({ path: PREVIEW ? `${OUT}/p-${name}.jpg` : `${OUT}/f${String(n++).padStart(4, '0')}.jpg`, type: 'jpeg', quality: PREVIEW ? 80 : 93 });
    }
  };
  // 1. title over the yard
  await shot('1title', 60, () => { const T = __tr; T.hook(); for (const id of ['modes', 'pCamp', 'pSkirm', 'pMulti', 'pOpts']) document.getElementById(id).style.display = 'none'; document.querySelectorAll('#menu .small, #menu .foot, #freeNote, #menu .keys').forEach(e => e.style.display = 'none'); T.cap(''); });
  // 2. drill
  await shot('2drill', 66, () => { const T = __tr; __ore.pickMap(0); document.querySelectorAll('#diff button')[0].click(); __ore.start(); T.hook(); const g = T.g; g.introT = 0; g.safeT = 999; const n = g.ores[0], l = Math.hypot(n.pos.x, n.pos.z) || 1; g.me.pos.set(n.pos.x - n.pos.x / l * 4.6, 0, n.pos.z - n.pos.z / l * 4.6); T.face(n.pos.x, n.pos.z, -.12); g.tool = 1; g.lmb = true; T.cap('Start with a drill'); T.step(8); });
  // 3. the yard grows, then the jump wheel
  await shot('3jump', 72, () => { const T = __tr, g = T.g; g.lmb = false; T.ff(330); const s = g.own('linesman')[0] || g.own('rigger')[0]; T.into(s); const h = g.ownB('headframe')[0]; T.face(h.pos.x, h.pos.z, .05); g.keys.add('Tab'); T.cap('Jump into any body you own'); T.step(2); }, i => { const g = __tr.g; if (i === 30 || i === 48) { g.tabSel = (g.tabSel + 1) % Math.max(1, g.tabList.length); } });
  // 4. firefight
  await shot('4fight', 96, () => { const T = __tr, g = T.g; g.keys.delete('Tab'); T.step(1); g.dir.callout = null; const s = g.own('linesman')[0]; T.into(s); const ax = Math.sin(1.1), az = Math.cos(1.1); s.pos.set(20, 0, 2); for (let i = 0; i < 5; i++) { const f = g.spawn(i % 2 ? 'linesman' : 'breacher', 0, 18 + (i % 3) * 2.2, 5 + i * 1.6); f.order = { type: 'guard', x: f.pos.x, z: f.pos.z }; } for (let i = 0; i < 9; i++) g.spawn(i % 3 === 2 ? 'lancer' : 'cantor', 1, 46 + (i % 3) * 3, -4 + i * 2.2); T.face(48, 4, 0); T.cap('Fight in first person'); T.step(6); }, i => { const T = __tr, g = T.g, f = T.foe(); if (f) { const k = .2; const ty = Math.atan2(f.pos.x - g.me.pos.x, f.pos.z - g.me.pos.z); let d = ty - g.yaw; d = Math.atan2(Math.sin(d), Math.cos(d)); g.yaw += d * k; g.pitch += (-.02 - g.pitch) * k; } g.lmb = i > 6; if (g.me && !g.me.alive) g.lmb = false; });
  // 5. bring a Choir Stone down
  await shot('5topple', 108, () => { const T = __tr, g = T.g; g.lmb = false; for (const u of g.units) if (u.team === 1) u.alive && g.killUnit(u, null); T.step(2); const st = g.stones()[0], l = Math.hypot(st.pos.x, st.pos.z); const w = g.spawn('gantry', 0, st.pos.x - st.pos.x / l * 30, st.pos.z - st.pos.z / l * 30 + 6); T.into(w); T.face(st.pos.x, st.pos.z, .12); window.__st = st; T.cap('Break everything'); T.step(4); }, i => { const T = __tr, g = T.g, st = window.__st; g.lmb = i > 4 && i < 60; g.dir.callout = null; if (i === 34 && st.alive) g.damage(st, st.hp + 10, g.me); if (i > 34) g.pitch += (.02 - g.pitch) * .05; });
  // 6. the other side
  await shot('6veyl', 84, () => { const T = __tr, g = T.g; g.lmb = false; g.myTeam = 1; const h = g.ownB('headframe')[0]; for (const x of g.own()) if (Math.hypot(x.pos.x - h.pos.x - 30, x.pos.z - h.pos.z + 12) < 12) x.pos.set(h.pos.x + 8, 0, h.pos.z + 12); const u = g.spawn('lancer', 1, h.pos.x + 32, h.pos.z - 12); for (let i = 0; i < 7; i++) { const c = g.spawn(i % 4 === 3 ? 'lancer' : 'cantor', 1, h.pos.x + 17 + (i % 3) * 3, h.pos.z - 14 + i * 2.4); c.order = { type: 'raid', x: 0, z: 0 }; } u.pilot = 9; T.into(u); T.face(h.pos.x, h.pos.z, .03); T.cap('Or sing for the other side'); T.step(4); }, i => { const T = __tr, g = T.g, f = T.foe(); g.dir.callout = null; if (f && i % 3 === 0) { const ty = Math.atan2(f.pos.x - g.me.pos.x, f.pos.z - g.me.pos.z); let d = ty - g.yaw; d = Math.atan2(Math.sin(d), Math.cos(d)); g.yaw += d * .5; } g.lmb = i > 8; });
  // 7. end card
  await shot('7end', 72, () => { const T = __tr, g = T.g; g.lmb = false; g.myTeam = 0; g.phase = 'menu'; document.getElementById('hud').hidden = true; T.cap(''); const m = document.getElementById('menu'); m.hidden = false; m.querySelector('.tagline').textContent = 'Campaign. Skirmish. Co-op. Versus. All in a browser tab.'; });
  console.log('frames', n); await b.close();
})();
