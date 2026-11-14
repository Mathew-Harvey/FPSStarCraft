// Shoots capture sheets of Veyl figures in the real game, under the game's own light, at the five zoom levels the plan checks.
//   node tools/veyl/bench.mjs && node tools/veyl/shots.cjs <out dir> kind [kind ...]
// For each kind it writes <out>/<kind>-<shot>.png:
//   paint   close up, three quarters, at about 5 m (the painted picture in game light)
//   fp      first person: seen by someone standing 4 m off at eye height
//   near    20 m off, the normal play distance
//   mid     80 m off
//   cmd     the command view (the game's own tilted overhead view, the same size the game uses)
//   map     straight down and close: what the top faces carry (the full map draws a small picture of this)
//   line    side by side with a Cantor and a Warden
//   pose-*  every pose the look file has for it, each close
//   vm-*    the first person view model in each of its modes
// Env: HOUR (default 15), PX width (default 1280).
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const out = process.argv[2], kinds = process.argv.slice(3);
const W = +(process.env.PX || 1280), H = Math.round(W * 9 / 16);
(async () => {
  fs.mkdirSync(out, { recursive: true });
  const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl'] });
  const p = await b.newPage({ viewport: { width: W, height: H } }); p.setDefaultTimeout(0);
  p.on('pageerror', e => console.log('page error', e.message));
  p.on('console', m => { if (m.type() === 'error' || m.text().startsWith('vm ')) console.log('console', m.text().slice(0, 300)); });
  await p.goto('file://' + path.resolve('dist-bench/index.html'));
  await p.evaluate((q) => { localStorage.clear(); if (q) localStorage.setItem('ore-else', JSON.stringify({ q })); }, +(process.env.Q || 0));
  await p.reload();
  await p.waitForFunction(() => window.__ore && window.__veyl, null, { timeout: 120000 });
  await p.evaluate(() => { const o = window.__ore; o.pickSide(0, 0); o.start(); });   // play Ironhold: a Veyl player runs as a replica of a local host, and that view comes out washed white here
  await p.waitForTimeout(4000);
  await p.evaluate(([hour, set]) => {
    // the game is stepped by hand from here (as test/trailer.cjs does): its own update sets the sky and lamps and draws through the cut-scene camera
    const o = window.__ore, g = o.game; if (set) Object.assign(o.pipe, set);
    const real = Object.getPrototypeOf(g).update.bind(g); g.update = () => { }; g.hud.feed = () => { };
    g.introT = 0; g.drawT = 0; g.hourFix = hour; g.wxFix = 'clear'; g.safeT = 1e9; g.dir.callout = null;
    window.__step = (n) => { for (let i = 0; i < n; i++) { o.pipe.flash = 0; real(1 / 60); o.pipe.flash = 0; } };      // pipe.flash is the hit flash: under a held loop it can sit near 1 and wash every frame white     // the clock is held back so nothing ripens or arrives
    // a clear patch of ground away from both bases
    let best = 1e9, X = 0, Z = 0;
    for (let x = -60; x <= 60; x += 6) for (let z = -60; z <= 60; z += 6) { let n = 0; for (const q of g.props) { const d = Math.hypot(q.x - x, q.z - z); if (d < 18) n += (q.r + q.h) * (18 - d); } for (const bb of g.buildings) if (Math.hypot(bb.pos.x - x, bb.pos.z - z) < 30) n += 50; n += Math.hypot(x, z) * .02; if (n < best) { best = n; X = x; Z = z; } }
    window.__spot = [X, Z];
    for (const u of g.units) if (u !== g.me) { u.obj.visible = false; u.alive = false; }
    g.me.pos.set(X + 200, 0, Z + 200);
    document.querySelectorAll('#hud, .hud, #mini').forEach(e => e.style.visibility = 'hidden');
  }, [+(process.env.HOUR || 13), process.env.PIPE ? JSON.parse(process.env.PIPE) : null]);
  const cdp = await p.context().newCDPSession(p);
  // straight from the compositor: Playwright's own screenshot waits on web fonts, which never settle while the page is held
  const snap = async (name) => { const r = await cdp.send('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(path.join(out, name + '.png'), Buffer.from(r.data, 'base64')); };
  // stands a figure (a new look or an old unit kind) at x, z facing +z; returns its id on the page
  const stand = (kind, x, z, yaw = 0) => p.evaluate(([kind, x, z, yaw]) => {
    const o = window.__ore, g = o.game, [X, Z] = window.__spot;
    let root; const look = window.__veyl.veylLook(kind);
    if (look) root = look.root; else { const u = g.spawn(kind, 1, X + x, Z + z); u.obj.visible = true; u.update = () => { }; root = u.obj; root.userData.unit = u; }
    root.position.set(X + x, 0, Z + z); root.rotation.y = yaw; if (look) g.scene.add(root);
    window.__stood = window.__stood || []; window.__stood.push({ root, look, kind }); return window.__stood.length - 1;
  }, [kind, x, z, yaw]);
  const clear = () => p.evaluate(() => { const g = window.__ore.game; for (const s of window.__stood || []) { if (s.look) g.scene.remove(s.root); else { s.root.visible = false; const u = s.root.userData.unit; if (u) { u.alive = false; } } } window.__stood = []; });
  // draws from a camera at (dx, dy, dz) off the spot looking at (lx, ly, lz) off the spot; ortho h > 0 makes it an overhead view of that half height
  const shoot = (name, cam) => p.evaluate((c) => {
    const o = window.__ore, g = o.game, [X, Z] = window.__spot, pipe = o.pipe, V = g.cam.position.constructor;
    g.phase = 'cut'; g.cutSat = 1; g.shake = 0; g.shot = { pos: new V(X + c.at[0], c.at[1], Z + c.at[2]), look: new V(X + c.look[0], c.look[1], Z + c.look[2]), fov: c.fov || 46 };
    window.__step(3); window.__veyl.shimmerTick(pipe.time); pipe.flash = 0; pipe.flashK = 0;
    if (c.ortho) {                                       // overhead views: the light is set by the steps above, then drawn the way the command view draws
      const C = g.iso, h = c.ortho, w = h * pipe.w / pipe.h; C.left = -w; C.right = w; C.top = h; C.bottom = -h; C.updateProjectionMatrix();
      C.position.copy(g.shot.pos); C.up.set(0, 1, 0); if (c.upz) C.up.set(0, 0, -1); C.lookAt(g.shot.look); C.updateMatrixWorld(); g.lamps(C); pipe.draw(g.scene, C, new V(X, 0, Z), c.span || 150);
    }
  }, cam).then(() => snap(name));
  const poseAll = (name, t, k) => p.evaluate(([name, t, k]) => { window.__undo = window.__undo || []; for (const s of window.__stood) if (s.look) { const fn = window.__veyl.POSES[s.kind]?.[name]; if (fn) window.__undo.push(window.__veyl.pose(s.look.rig, fn, t, k)); } }, [name, t, k]);
  const unpose = () => p.evaluate(() => { for (const f of (window.__undo || []).reverse()) f(); window.__undo = []; });

  if (kinds[0] === 'fx') {
    // every sketched ability effect in a row, each caught part way through, seen near and from the command view
    await p.evaluate(() => {
      const V = window.__veyl, g = window.__ore.game, [X, Z] = window.__spot, P = g.cam.position.constructor; window.__fx = [];
      const at = (i) => new P(X + (i % 6 - 2.5) * 7, 0, Z - Math.floor(i / 6) * 8 + 6);
      const mk = [['rush', () => V.rush(4), .3], ['skip', () => V.skip(4), .2], ['glassWall', () => V.glassWall(), 3], ['wardHum', () => V.wardHum(), 1.2], ['falseVoice', () => { const b = V.veylBody('tuner'); const f = V.falseVoice(b); f.obj.add(b); return f; }, 1], ['stepThrough', () => V.stepThrough(4), .2], ['shatterNote', () => V.shatterNote(), 2.1], ['drain', () => V.drain(new P(-2.5, 1.2, 0), new P(2.5, 2.2, 0)), .4], ['join', () => V.join(new P(-2.5, 0, 0), new P(2.5, 0, 0)), 1.2], ['ringShell', () => V.ringShell(), 1], ['toll', () => V.toll(new P(1, 0, 0), 3), 3.2], ['settle', () => V.settle(3), 1], ['unfold', () => V.unfold(3), 2], ['lift', () => V.lift(4), 1], ['burnBright', () => V.burnBright(6), 2], ['shrill', () => V.shrill(5), .5], ['reveal', () => V.reveal(3), 1.5], ['stillStone', () => V.stillStone(2.5), 2.5], ['songField', () => V.songField(3), 3], ['shardLaunch', () => V.shardLaunch(undefined, 4), .3], ['gather', () => V.gather(3.5), .8], ['holdTime', () => V.holdTime(3), 2], ['quicken', () => V.quicken(), .9], ['farSinging', () => V.farSinging(), 1]];
      mk.forEach(([n, f, t], i) => { const e = f(); e.obj.position.copy(at(i)); g.scene.add(e.obj); e.tick(t); window.__fx.push(e.obj); });
    });
    await shoot('fx-near', { at: [0, 6, 24], look: [0, 1.5, 0], fov: 60 });
    await shoot('fx-cmd', { ortho: 14, at: [0, 150, 120], look: [0, 0, 0], span: 150 });
    await b.close(); return;
  }
  await shoot('warmup', { at: [0, 3, 10], look: [0, 1, 0] });   // the first frame after the hold can come out black
  for (const kind of kinds) {
    const t0 = Date.now();
    const h = await p.evaluate(k => { const l = window.__veyl.veylLook(k); if (!l) return 0; const b = new (l.root.position.constructor)(); let top = 0; l.root.updateMatrixWorld(true); l.root.traverse(o => { if (o.isMesh) { o.geometry.computeBoundingBox(); const bb = o.geometry.boundingBox.clone().applyMatrix4(o.matrixWorld); top = Math.max(top, bb.max.y); } }); return top; }, kind);
    if (!h) { console.log(kind, 'has no sculpt on this page'); continue; }
    await stand(kind, 0, 0);
    await poseAll('rest1', 0, 0);
    const isHall = await p.evaluate(k => window.__veyl.VEYL_HALLS.includes(k), kind);
    const m = h / 2.6 * (isHall ? 1.5 : 1);           // sizes the close shots to the figure (buildings are framed wider)
    await shoot(`${kind}-paint`, { at: [2.4 * m, h * .6, 3.6 * m], look: [0, h * .52, 0], fov: 34 });
    {                                                  // the HUD portrait: head and shoulders, turned half a radian, cropped square by sheet.py
      const pr = await p.evaluate(k => window.__veyl.PORTRAIT[k] || null, kind);
      if (pr) { await p.evaluate(() => { window.__stood[0].root.rotation.y = .5; }); await shoot(`${kind}-icon`, { at: [0, pr.y + .15, pr.dist], look: [0, pr.y, 0], fov: 30 }); await p.evaluate(() => { window.__stood[0].root.rotation.y = 0; }); }
    }
    if (process.env.QUICK) { await clear(); continue; }
    const hall = await p.evaluate(k => window.__veyl.VEYL_HALLS.includes(k), kind);
    if (hall) {                                        // a building: also in a song field, and silent (out of any field)
      await p.evaluate(([k, h]) => { const s = window.__stood[0], V = window.__veyl, g = window.__ore.game; const f = V.songField(Math.max(6.5, h * .9)); f.obj.position.copy(s.root.position); g.scene.add(f.obj); f.tick(3); window.__field = f.obj; }, [kind, h]);
      await shoot(`${kind}-field`, { at: [5 * m, h * .9, 8 * m], look: [0, h * .3, 0], fov: 44 });
      await p.evaluate(([h]) => { const g = window.__ore.game; g.scene.remove(window.__field); window.__veyl.silentLook(window.__stood[0].root, true, h); }, [h]);
      await shoot(`${kind}-silent`, { at: [2.4 * m, h * .6, 3.6 * m], look: [0, h * .52, 0], fov: 34 });
      await p.evaluate(([h]) => window.__veyl.silentLook(window.__stood[0].root, false, h), [h]);
    }
    await shoot(`${kind}-fp`, { at: [-.6, 1.7, 4], look: [0, h * .5, 0], fov: 68 });
    await shoot(`${kind}-near`, { at: [6, 4, 19], look: [0, h * .4, 0], fov: 68 });
    await shoot(`${kind}-mid`, { at: [20, 14, 78], look: [0, h * .4, 0], fov: 68 });
    await shoot(`${kind}-cmd`, { ortho: 30, at: [0, 150, 120], look: [0, 0, 0], span: 150 });
    await shoot(`${kind}-map`, { ortho: Math.max(2.4, h * .75), at: [0, 60, .01], look: [0, 0, 0], span: 20, upz: true });   // straight down, close: what the top faces carry (the full map draws a picture of this)
    await clear();
    // side by side: Cantor, the new figure, Warden
    await stand('cantor', -2.6, 0); await stand(kind, 0, 0); await stand('warden', 4.2, -.5);
    await shoot(`${kind}-line`, { at: [.6, 3.4, 13], look: [.6, 2.4, 0], fov: 40 });
    await clear();
    // every pose in its table, each in its own close shot (about 5 m), caught part way through
    const names = await p.evaluate(k => Object.keys(window.__veyl.POSES[k] || {}), kind);
    await stand(kind, 0, 0);
    for (const n of names) {
      await p.evaluate(([n]) => { const s = window.__stood[0]; const fn = window.__veyl.POSES[s.kind][n]; const one = /^(attack|glasswall|falsevoice|stepthrough|shatter|drain|join|toll|ringshell|unfold|lift|burn|shrill|reveal|still|gather|hold)/.test(n); window.__undo = [window.__veyl.pose(s.look.rig, fn, one ? .52 : 2.3, 1)]; }, [n]);
      await shoot(`${kind}-pose-${n}`, { at: [3.2 * m, h * .55, 4.2 * m], look: [0, h * .48, 0], fov: 36 });
      await unpose();
    }
    fs.writeFileSync(path.join(out, `${kind}-poses.txt`), names.join(' '));
    await clear();
    // first person: the body's own view model hung on the camera, at eye height, a Cantor standing 9 m ahead for scale
    const modes = await p.evaluate(k => Object.keys(window.__veyl.VM[k] || {}), kind);
    if (modes.length) {
      await stand('cantor', .8, 9, Math.PI);
      for (const mo of modes) {
        await p.evaluate(([k, mo]) => {
          const g = window.__ore.game, [X, Z] = window.__spot, V = g.cam.position.constructor;
          if (window.__vm) g.scene.remove(window.__vm);
          const vm = window.__veyl.viewModel(k, mo), hold = new (vm.constructor)(); hold.add(vm);
          hold.position.set(X, 1.75, Z); hold.lookAt(new V(X, 1.6, Z + 10)); hold.rotateY(Math.PI); g.scene.add(hold); window.__vm = hold;
          hold.updateMatrixWorld(true); const bb = new (g.cam.position.constructor)(); let n = 0, vis = 0; vm.traverse(o => { if (o.isMesh) { n++; if (o.visible) vis++; } }); const B = new (window.__veyl.THREE.Box3)().setFromObject(vm); console.log('vm', k, mo, n, vis, JSON.stringify(window.__spot), JSON.stringify(B.min), JSON.stringify(B.max));
        }, [kind, mo]);
        await shoot(`${kind}-vm-${mo}`, { at: [0, 1.75, 0], look: [0, 1.6, 10], fov: 70 });
      }
      await p.evaluate(() => { const g = window.__ore.game; if (window.__vm) g.scene.remove(window.__vm); window.__vm = null; });
      fs.writeFileSync(path.join(out, `${kind}-vm.txt`), modes.join(' '));
      await clear();
    }
    console.log(kind, 'shot in', ((Date.now() - t0) / 1000).toFixed(0) + 's');
  }
  await b.close();
})();
