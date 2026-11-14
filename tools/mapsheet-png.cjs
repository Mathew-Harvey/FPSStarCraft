// Turns the map pictures from tools/mapsheet.ts into PNGs: node tools/mapsheet-png.cjs <svg folder> <out folder>
const { chromium } = require('playwright'); const fs = require('fs'), path = require('path');
const [src, out] = [process.argv[2] || '/tmp/claude-0/sheet', process.argv[3] || '/tmp/claude-0/sheet'];
(async () => { const b = await chromium.launch(); const p = await b.newPage();
  for (const f of fs.readdirSync(src).filter(f => f.endsWith('.svg')).sort()) { const svg = fs.readFileSync(path.join(src, f), 'utf8'), [, w, h] = svg.match(/width="(\d+)" height="(\d+)"/);
    await p.setViewportSize({ width: +w, height: +h }); await p.setContent(`<body style="margin:0">${svg}</body>`); await p.screenshot({ path: path.join(out, f.replace('.svg', '.png')) }); }
  await b.close(); })();
