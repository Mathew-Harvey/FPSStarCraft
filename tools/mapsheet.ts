// One clear picture per skirmish map, from above, with everything that makes it fair marked: starts, ore fields (rich ones in gold, island
// ones ringed), Flux vents, Survey Beacons, high ground with its ramps, rock walls and roads. Under each map, how far each start is from its
// nearest fields, vents and beacon, so anyone can see at a glance that every start gets the same.
// Run with: node tools/run-ts.mjs tools/mapsheet.ts <out folder>   (writes one .svg per map; tools/mapsheet-png.cjs turns them into pictures)
import { setMap, setSides, MAP, LAYOUT, SIZES, MAPS, ROAD, roadPt, VHOME } from '../src/data';
import { TER, BEACON } from '../src/terrain';
import { writeFileSync, mkdirSync } from 'node:fs';
setSides(0, 1); const OUT = process.argv[2] || '/tmp/claude-0/sheet'; mkdirSync(OUT, { recursive: true });
const W = 1000, PAD = 30, TOP = 70, list: string[] = [];
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/'/g, '&#39;');
for (let b = 0; b < MAPS.length; b++) { if ((MAPS[b] as any).set) continue; for (let size = 0; size < SIZES.length; size++) {
  if (size === 3 && MAPS[b].ring) continue;
  LAYOUT.fair = true; const code = b + 10 * size + (size === 3 ? 500 : 0); setMap(code);
  const [mx, mz] = MAP.mid!, R = MAP.rad!, S = (W - 2 * PAD) / (2 * R), X = (x: number) => PAD + (x - mx + R) * S, Z = (z: number) => TOP + (z - mz + R) * S;
  const starts: number[][] = MAP.starts ? MAP.starts.map(s => [s[0], s[1]]) : [[0, 0], [VHOME.x, VHOME.z]];
  const fields = [...(MAP.sites || []).map((s, i) => ({ x: s[0], z: s[1], rich: TER.bright.includes(i), isl: false })), ...TER.fields.map(f => ({ x: f.x, z: f.z, rich: f.rich > 1, isl: f.island }))];
  const isl = (x: number, z: number) => TER.ridges.some(Q => Q.island && Math.hypot(x - Q.ax, z - Q.az) < Q.r + 4);
  for (const f of fields) if (isl(f.x, f.z)) f.isl = true;
  // A start's own ore (its main) is not one of the fields out on the map: leave those out of the table, and of the drawing (the start marks it).
  const open = fields.filter(f => !starts.some(([x, z]) => Math.hypot(f.x - x, f.z - z) < 30));
  const B0 = TOP + W - PAD, H = B0 + 130 + 22 * starts.length;
  let g = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" font-family="Arial, sans-serif"><rect width="${W}" height="${H}" fill="#1d1a18"/>`;
  g += `<circle cx="${X(mx)}" cy="${Z(mz)}" r="${R * S}" fill="#b98a5c" stroke="#3a2a20" stroke-width="3"/>`;
  for (const p of TER.paint) g += `<circle cx="${X(p[0])}" cy="${Z(p[1])}" r="${p[2] * S}" fill="#000" opacity=".06"/>`;
  for (const r of MAP.roads || [[...roadPt(-25), ...roadPt(ROAD.len + 41)]]) g += `<line x1="${X(r[0])}" y1="${Z(r[1])}" x2="${X(r[2])}" y2="${Z(r[3])}" stroke="#d9b98a" stroke-width="${Math.max(4, 7 * S)}" stroke-linecap="round"/>`;
  // high ground: ledges amber, ridges brown, islands blue; ramps as white arrows from the foot to the top
  for (const Q of TER.ridges) g += `<line x1="${X(Q.ax)}" y1="${Z(Q.az)}" x2="${X(Q.bx)}" y2="${Z(Q.bz)}" stroke="#2a1d16" stroke-width="${2 * Q.r * S + 4}" stroke-linecap="round"/>`;
  for (const Q of TER.ridges) g += `<line x1="${X(Q.ax)}" y1="${Z(Q.az)}" x2="${X(Q.bx)}" y2="${Z(Q.bz)}" stroke="${Q.kind === 'island' ? '#7fb2d9' : Q.kind === 'ledge' ? '#d9a650' : '#8f6a4c'}" stroke-width="${2 * Q.r * S}" stroke-linecap="round"/>`;
  for (const Q of TER.ridges) for (const m of Q.ramps) { const dx = m.tx - m.fx, dz = m.tz - m.fz, l = Math.hypot(dx, dz) || 1, ux = dx / l, uz = dz / l, a = 5 / S;
    g += `<line x1="${X(m.fx)}" y1="${Z(m.fz)}" x2="${X(m.tx)}" y2="${Z(m.tz)}" stroke="#fff" stroke-width="${Math.max(5, m.w * S)}" opacity=".85"/>`;
    g += `<path d="M${X(m.tx + ux * a)},${Z(m.tz + uz * a)} L${X(m.tx - ux * a - uz * a)},${Z(m.tz - uz * a + ux * a)} L${X(m.tx - ux * a + uz * a)},${Z(m.tz - uz * a - ux * a)} Z" fill="#222"/>`; }
  for (const [x, z, a, len] of TER.walls) { const tx = -Math.sin(a), tz = Math.cos(a); g += `<line x1="${X(x - tx * len / 2)}" y1="${Z(z - tz * len / 2)}" x2="${X(x + tx * len / 2)}" y2="${Z(z + tz * len / 2)}" stroke="#555" stroke-width="${Math.max(6, 3.5 * S)}" stroke-dasharray="6 3"/>`; }
  for (const B of TER.beacons) g += `<circle cx="${X(B.x)}" cy="${Z(B.z)}" r="${BEACON.SEE * S}" fill="#fff36a" fill-opacity=".18" stroke="#8a7a00" stroke-width="2" stroke-dasharray="6 4"/><path d="M${X(B.x)},${Z(B.z) - 11} l9,15 h-18 Z" fill="#ffe600" stroke="#222" stroke-width="2"/>`;
  for (const f of open) g += `<circle cx="${X(f.x)}" cy="${Z(f.z)}" r="${Math.max(7, 9 * S)}" fill="${f.rich ? '#ffc21a' : '#4fe3a0'}" stroke="${f.isl ? '#5ab4ff' : '#123'}" stroke-width="${f.isl ? 4 : 2}"/>`;
  for (const [x, z] of TER.vents) g += `<rect x="${X(x) - 6}" y="${Z(z) - 6}" width="12" height="12" transform="rotate(45 ${X(x)} ${Z(z)})" fill="#ff4fc8" stroke="#222" stroke-width="2"/>`;
  const col = ['#ff8a1f', '#22c8ff', '#b06cff', '#7cff6b', '#ff5a5a', '#ffffff', '#ffd400', '#2bd9b4'];
  starts.forEach(([x, z], i) => { const c = starts.length > 2 ? col[i % col.length] : i ? '#22c8ff' : '#ff8a1f'; g += `<circle cx="${X(x)}" cy="${Z(z)}" r="15" fill="${c}" stroke="#111" stroke-width="3"/><text x="${X(x)}" y="${Z(z) + 6}" text-anchor="middle" font-size="17" font-weight="bold" fill="#111">${starts.length > 2 ? i + 1 : i ? 'F' : 'Y'}</text>`; });
  // title and key
  const name = `${MAPS[b].name} · ${SIZES[size].name}`;
  g += `<text x="${PAD}" y="${PAD + 4}" font-size="26" font-weight="bold" fill="#fff">${esc(name)}</text><text x="${PAD}" y="${PAD + 26}" font-size="14" fill="#cbb">map code ${code} · ${starts.length} starts · ${open.length} ore fields out on the map · ${TER.vents.length} vents · ${TER.beacons.length} beacons · ${TER.ridges.length} pieces of high ground</text>`;
  const key: [string, string][] = [['#4fe3a0', 'ore field'], ['#ffc21a', 'rich field'], ['#ff4fc8', 'Flux vent'], ['#ffe600', 'Survey Beacon (sight ring)'], ['#d9a650', 'ledge'], ['#8f6a4c', 'ridge'], ['#7fb2d9', 'island (ringed fields: fliers only)'], ['#fff', 'ramp, arrow points up'], ['#555', 'rock wall (breakable)']];
  key.forEach(([c, t], i) => { const kx = PAD + (i % 3) * 320, ky = B0 + 14 + Math.floor(i / 3) * 22; g += `<rect x="${kx}" y="${ky}" width="14" height="14" fill="${c}" stroke="#111"/><text x="${kx + 20}" y="${ky + 12}" font-size="14" fill="#eee">${t}</text>`; });
  // the fairness table: each start's walk (straight line, metres) to its nearest fields, nearest vent and nearest beacon
  const near = (x: number, z: number, pts: { x: number; z: number }[], n: number) => pts.map(p => Math.hypot(p.x - x, p.z - z)).sort((a, c) => a - c).slice(0, n).map(d => Math.round(d));
  let ty = B0 + 100; const C = [PAD, PAD + 100, PAD + 520, PAD + 610, PAD + 690]; ['Start', 'Walk to the nearest ore fields out on the map (m)', 'Rich', 'Vent', 'Beacon'].forEach((t, j) => g += `<text x="${C[j]}" y="${ty}" font-size="15" font-weight="bold" fill="#fff">${t}</text>`);
  const sig: number[][] = [];
  starts.forEach(([x, z], i) => { ty += 22; const f = near(x, z, open, 5).join(' · '), r = near(x, z, open.filter(q => q.rich), 1)[0] ?? '–', v = near(x, z, TER.vents.map(([a, c]) => ({ x: a, z: c })), 1)[0] ?? '–', bc = near(x, z, TER.beacons, 1)[0] ?? '–';
    sig.push([...near(x, z, open, 99), r, v, bc].map(Number) as any);
    g += `<text x="${PAD}" y="${ty}" font-size="15" fill="#eee" xml:space="preserve">${starts.length > 2 ? 'Start ' + (i + 1) : i ? 'Far base' : 'Yard'}</text><text x="${PAD + 100}" y="${ty}" font-size="15" fill="#eee">${f}</text><text x="${PAD + 520}" y="${ty}" font-size="15" fill="#eee">${r}</text><text x="${PAD + 610}" y="${ty}" font-size="15" fill="#eee">${v}</text><text x="${PAD + 690}" y="${ty}" font-size="15" fill="#eee">${bc}</text>`; });
  const worst = Math.max(0, ...sig.flatMap(r => r.map((d, j) => Math.abs((Number.isNaN(d) ? 0 : d) - (Number.isNaN(sig[0][j]) ? 0 : sig[0][j]))))), same = worst <= 3 && sig.every(r => r.length === sig[0].length);
  g += `<text x="${W - PAD}" y="${PAD + 4}" text-anchor="end" font-size="20" font-weight="bold" fill="${same ? '#5f5' : '#f66'}">${same ? `Every start the same${worst ? ` (within ${worst} m)` : ''}` : `Starts differ by ${worst} m`}</text></svg>`;
  const file = `${String(code).padStart(3, '0')}-${MAPS[b].name.toLowerCase().replace(/[^a-z]+/g, '-')}-${SIZES[size].name.toLowerCase()}`;
  writeFileSync(`${OUT}/${file}.svg`, g); list.push(`${file}: ${same ? "same" : "DIFFER"} worst ${worst} m, ${open.length} fields`);
} }
console.log(list.join('\n'));
