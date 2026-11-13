// Draws every skirmish map's ground from above as SVG, for checking the layout by eye.
import { setMap, setSides, MAP, LAYOUT, SIZES, MAPS, ROAD, roadPt, VHOME, OUTPOST } from '../src/data';
import { TER } from '../src/terrain';
import { writeFileSync } from 'node:fs';
setSides(0, 1);
const fair = process.argv[2] !== 'c'; let html = '<html><body style="background:#222;margin:0;display:flex;flex-wrap:wrap">';
for (let size = 0; size < 4; size++) for (const base of (process.argv[4] || "0,1,2").split(",").map(Number)) {
  LAYOUT.fair = fair; const code = base + 10 * size + (size === 3 && !MAPS[base].ring ? 500 : 0); setMap(code);
  const [mx, mz] = MAP.mid!, R = MAP.rad!, S = 460 / (2 * R + 20), X = (x: number) => (x - mx + R + 10) * S, Z = (z: number) => (z - mz + R + 10) * S;
  let g = `<svg width="460" height="490" style="margin:4px;background:#5a3d33"><text x="6" y="484" fill="#fff" font-size="13">${code} ${MAPS[base].name} ${SIZES[size].name} ${fair ? 'fair' : 'classic'}</text>`;
  g += `<circle cx="${X(mx)}" cy="${Z(mz)}" r="${R * S}" fill="#6b4a3a"/>`;
  for (const r of MAP.roads || [[...roadPt(-25), ...roadPt(ROAD.len + 41)]]) g += `<line x1="${X(r[0])}" y1="${Z(r[1])}" x2="${X(r[2])}" y2="${Z(r[3])}" stroke="#a8825f" stroke-width="${6 * S}"/>`;
  let px = OUTPOST.x, pz = OUTPOST.z, d = `M${X(px)},${Z(pz)}`; for (const [fx, fz] of MAP.flank) d += ` L${X(fx)},${Z(fz)}`; d += ` L${X(0)},${Z(0)}`; g += `<path d="${d}" stroke="#c9a" stroke-dasharray="4 3" fill="none"/>`;
  for (const R2 of TER.ridges) { g += `<line x1="${X(R2.ax)}" y1="${Z(R2.az)}" x2="${X(R2.bx)}" y2="${Z(R2.bz)}" stroke="${R2.kind === 'ledge' ? '#e8c070' : R2.kind === 'island' ? '#9cf' : '#c88'}" stroke-width="${2 * R2.r * S}" stroke-linecap="round" opacity=".85"/>`;
    for (const m of R2.ramps) g += `<line x1="${X(m.tx)}" y1="${Z(m.tz)}" x2="${X(m.fx)}" y2="${Z(m.fz)}" stroke="#fff" stroke-width="${m.w * S}" opacity=".7"/>`; }
  for (const [x, z, a, len] of TER.walls) { const tx = -Math.sin(a), tz = Math.cos(a); g += `<line x1="${X(x - tx * len / 2)}" y1="${Z(z - tz * len / 2)}" x2="${X(x + tx * len / 2)}" y2="${Z(z + tz * len / 2)}" stroke="#333" stroke-width="${3 * S}"/>`; }
  (MAP.sites || []).forEach((s, i) => { g += `<circle cx="${X(s[0])}" cy="${Z(s[1])}" r="${9 * S}" fill="${TER.bright.includes(i) ? '#ffd23a' : '#7fd'}"/><text x="${X(s[0]) + 5}" y="${Z(s[1]) - 5}" fill="#fff" font-size="10">${i}${s[2] ? 't' : ''}</text>`; });
  for (const f of TER.fields) g += `<circle cx="${X(f.x)}" cy="${Z(f.z)}" r="${7 * S}" fill="#7fd"/>`;
  for (const [x, z] of TER.vents) g += `<circle cx="${X(x)}" cy="${Z(z)}" r="${Math.max(2, 2 * S)}" fill="#f4c"/>`;
  for (const b of TER.beacons) g += `<circle cx="${X(b.x)}" cy="${Z(b.z)}" r="${Math.max(3, 4.5 * S)}" fill="none" stroke="#ff0" stroke-width="2"/>`;
  for (const [sx, sz] of MAP.starts || []) g += `<circle cx="${X(sx)}" cy="${Z(sz)}" r="6" fill="#fff"/>`; g += `<circle cx="${X(0)}" cy="${Z(0)}" r="${8}" fill="#f80"/><circle cx="${X(VHOME.x)}" cy="${Z(VHOME.z)}" r="${8}" fill="#0cf"/></svg>`; html += g;
}
writeFileSync(process.argv[3] || '/tmp/claude-0/maps.html', html + '</body></html>');
