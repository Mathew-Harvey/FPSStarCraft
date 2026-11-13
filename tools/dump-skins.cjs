// Saves every painted skin the game makes (the picture, its tint, glow and shine) to art/out/skins, where the model bake reads them.
// usage: npm run build && node tools/dump-skins.cjs
const { chromium } = require('playwright'); const fs = require('fs'); const path = require('path');
(async () => {
  const out = path.join(__dirname, '..', 'art', 'out', 'skins'); fs.mkdirSync(out, { recursive: true });
  const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl'] });
  const p = await b.newPage({ viewport: { width: 640, height: 360 } }); p.setDefaultTimeout(120000);
  await p.goto('file://' + path.join(__dirname, '..', 'dist', 'index.html')); await p.waitForFunction('window.__ore && __ore.game'); await p.evaluate(() => { __ore.game.noRender = true; });
  const got = await p.evaluate(() => { const res = {}, pics = new Map(); let n = 0;
    for (const k in __ore.mats) { const m = __ore.mats[k], u = m.uniforms; if (!u || !u.uColor) continue; const img = u.uMap && u.uMap.value && u.uMap.value.image; let pic = null;
      if (img && img.toDataURL && img.width > 4) { if (!pics.has(img)) pics.set(img, ['s' + (n++), img.toDataURL('image/png')]); pic = pics.get(img)[0]; }
      res[k] = { pic, color: '#' + u.uColor.value.getHexString(), emis: u.uEmis.value, shine: u.uShine ? u.uShine.value : 0, rep: [u.uRep.value.x, u.uRep.value.y] }; }
    return { res, pics: [...pics.values()] }; });
  for (const [name, url] of got.pics) fs.writeFileSync(path.join(out, name + '.png'), Buffer.from(url.split(',')[1], 'base64'));
  fs.writeFileSync(path.join(out, 'skins.json'), JSON.stringify(got.res));
  console.log(Object.keys(got.res).length + ' skins, ' + got.pics.length + ' pictures -> ' + out);
  await b.close();
})();
