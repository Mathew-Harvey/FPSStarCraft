// The ground of the minimap and the full map, drawn as a surveyor's sheet: kraft paper with a faint grid, mesas and rock spires inked with
// a wobbling pen and shaded with hachures on the side away from the sun, loose rocks as pen dots, roads as worn double lines. The sheet is
// drawn once for a frame of the map and kept, so the map's ten redraws a second only lay the kept picture down and put the live marks
// (fog, buildings, bodies) on top. Nothing here rolls dice: every wobble comes from a hash of where it is, so a sheet is the same each time.
import type { Prop } from './data';

const hash = (x: number, y: number) => { const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return s - Math.floor(s); };
const INK = '#1d120e', PAPER = '#7a5740', PAPER_HI = '#94704f', CHALK = '#e2c79a';

export interface Sheet { cv: HTMLCanvasElement; key: string }
export interface SheetIn {
  /** Canvas size in map units, and pixels per map unit. */ S: number; H: number; q: number;
  /** World metres to map units. */ X: (x: number) => number; Z: (z: number) => number; k: number;
  props: Prop[]; roads: number[][]; big: boolean; title: string; /** The small line under the name: whose sheet it is. */ sub: string;
  /** Ground a side must not be shown before it has walked it (a hidden map): the terrain is left off the sheet and comes from the live marks only. */ blank: boolean;
}

/** A closed wobbling outline round a point: the pen line of a mesa or a rock. */
function blob(c: CanvasRenderingContext2D, x: number, y: number, r: number, seed: number, wob = .16) {
  const n = Math.max(9, Math.min(22, Math.round(r * 1.6 + 8)));
  c.beginPath();
  for (let i = 0; i <= n; i++) { const a = i / n * Math.PI * 2, j = i % n, rr = r * (1 - wob / 2 + wob * hash(seed + j * 1.7, seed * .37 + j)); const px = x + Math.cos(a) * rr, py = y + Math.sin(a) * rr * .94; if (i) c.lineTo(px, py); else c.moveTo(px, py); }
  c.closePath();
}

/** Draws the sheet for one frame of the map. */
export function drawSheet(o: SheetIn): HTMLCanvasElement {
  const cv = document.createElement('canvas'); cv.width = Math.round(o.S * o.q); cv.height = Math.round(o.H * o.q);
  const c = cv.getContext('2d')!; c.setTransform(o.q, 0, 0, o.q, 0, 0);
  const { S, H, X, Z, k } = o;
  // paper: a warm ground with soft blotches and a darker edge, the way a folded sheet wears
  c.fillStyle = PAPER; c.fillRect(0, 0, S, H);
  for (let i = 0; i < 46; i++) { const x = hash(i, 3) * S, y = hash(i, 7) * H, r = 14 + hash(i, 11) * 46, gr = c.createRadialGradient(x, y, 0, x, y, r); const lt = hash(i, 13) > .5; gr.addColorStop(0, lt ? 'rgba(168,128,90,.2)' : 'rgba(58,36,26,.17)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); c.fillStyle = gr; c.fillRect(x - r, y - r, r * 2, r * 2); }
  { const gr = c.createRadialGradient(S / 2, H / 2, H * .35, S / 2, H / 2, S * .72); gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(30,17,12,.5)'); c.fillStyle = gr; c.fillRect(0, 0, S, H); }
  // survey grid, every 50 m, with a heavier line each 100
  { const step = 50, x0 = Math.floor((0 - X(0)) / k / step) * step, z0 = Math.floor((0 - Z(0)) / k / step) * step;
    for (let wx = x0; X(wx) < S; wx += step) { const px = X(wx); if (px < 0) continue; c.strokeStyle = Math.round(wx / step) % 2 ? 'rgba(29,18,14,.1)' : 'rgba(29,18,14,.2)'; c.lineWidth = .35; c.beginPath(); c.moveTo(px, 0); c.lineTo(px, H); c.stroke(); }
    for (let wz = z0; Z(wz) < H; wz += step) { const py = Z(wz); if (py < 0) continue; c.strokeStyle = Math.round(wz / step) % 2 ? 'rgba(29,18,14,.1)' : 'rgba(29,18,14,.2)'; c.lineWidth = .35; c.beginPath(); c.moveTo(0, py); c.lineTo(S, py); c.stroke(); } }
  if (!o.blank) {
    // roads: a worn pale track between two thin ink lines
    c.lineCap = 'round'; c.lineJoin = 'round';
    for (const r of o.roads) { const w = Math.max(2.2, 7 * k);
      c.strokeStyle = 'rgba(29,18,14,.55)'; c.lineWidth = w + .9; c.beginPath(); c.moveTo(X(r[0]), Z(r[1])); c.lineTo(X(r[2]), Z(r[3])); c.stroke();
      c.strokeStyle = PAPER_HI; c.lineWidth = w; c.beginPath(); c.moveTo(X(r[0]), Z(r[1])); c.lineTo(X(r[2]), Z(r[3])); c.stroke();
      c.strokeStyle = 'rgba(29,18,14,.35)'; c.lineWidth = .4; c.setLineDash([2.2, 2.6]); c.beginPath(); c.moveTo(X(r[0]), Z(r[1])); c.lineTo(X(r[2]), Z(r[3])); c.stroke(); c.setLineDash([]); }
    // mesas and spires, biggest first so a small one sits on a big one's shoulder
    const solid = o.props.filter(p => p.alive && p.solid && p.r * k > .9).sort((a, b) => b.r - a.r);
    for (const p of solid) {
      const x = X(p.x), y = Z(p.z), r = Math.max(1.4, p.r * k), sd = p.id * 3.1 + 1, tall = Math.min(1, p.h / 14);
      // cast shade to the south-east, then the body, a lit cap and the pen line
      c.fillStyle = 'rgba(29,18,14,.3)'; blob(c, x + r * .22 * (1 + tall), y + r * .26 * (1 + tall), r * 1.02, sd); c.fill();
      c.fillStyle = p.kind === 'crystal' || p.kind === 'veyl' ? '#6f8f86' : p.kind === 'metal' ? '#5d564f' : '#a57a56'; blob(c, x, y, r, sd); c.fill();
      if (r > 2.6) { c.fillStyle = p.kind === 'crystal' || p.kind === 'veyl' ? '#9cc4b6' : '#c59868'; blob(c, x - r * .12, y - r * .14, r * .62, sd + 9, .22); c.fill(); }
      c.strokeStyle = INK; c.lineWidth = Math.min(1.1, .45 + r * .05); blob(c, x, y, r, sd); c.stroke();
      // hachures down the shaded side
      if (r > 2) { c.lineWidth = .35; c.strokeStyle = 'rgba(29,18,14,.7)'; const n = Math.round(4 + r * 1.1); c.beginPath();
        for (let i = 0; i < n; i++) { const a = -.35 + (i + hash(sd, i) * .6) / n * 2.1, r0 = r * (.6 + hash(i, sd) * .12), r1 = r * .93; c.moveTo(x + Math.cos(a) * r0, y + Math.sin(a) * r0 * .94); c.lineTo(x + Math.cos(a) * r1, y + Math.sin(a) * r1 * .94); }
        c.stroke(); }
      if (r > 5) { c.strokeStyle = 'rgba(29,18,14,.4)'; c.lineWidth = .35; blob(c, x - r * .06, y - r * .08, r * .58, sd + 4, .2); c.stroke(); }
    }
    // loose rocks and scrub: pen dots, only where there is room to see them
    if (k > .5) for (const p of o.props) { if (!p.alive || p.solid || p.r * k < .35) continue; c.fillStyle = p.kind === 'plant' ? 'rgba(52,62,34,.55)' : 'rgba(29,18,14,.5)'; c.beginPath(); c.arc(X(p.x), Z(p.z), Math.max(.35, p.r * k * .7), 0, 7); c.fill(); }
  }
  return cv;
}

/** The sheet's furniture, drawn over everything else on the full map (the fog too): a neat line with ticks, a north arrow, a scale bar and the sheet's name. */
export function sheetFurniture(c: CanvasRenderingContext2D, S: number, H: number, k: number, title: string, sub: string) {
  c.strokeStyle = INK; c.lineWidth = .7; c.strokeRect(2.2, 2.2, S - 4.4, H - 4.4); c.lineWidth = .3; c.strokeRect(3.4, 3.4, S - 6.8, H - 6.8);
  c.lineWidth = .4; c.beginPath(); for (let x = 10; x < S - 4; x += 10) { c.moveTo(x, 2.2); c.lineTo(x, x % 50 ? 3.4 : 4.6); c.moveTo(x, H - 2.2); c.lineTo(x, x % 50 ? H - 3.4 : H - 4.6); } for (let y = 10; y < H - 4; y += 10) { c.moveTo(2.2, y); c.lineTo(y % 50 ? 3.4 : 4.6, y); c.moveTo(S - 2.2, y); c.lineTo(y % 50 ? S - 3.4 : S - 4.6, y); } c.stroke();
  // north arrow, top right
  { const x = S - 15, y = 17; c.fillStyle = 'rgba(226,199,154,.88)'; c.strokeStyle = INK; c.lineWidth = .5; c.beginPath(); c.arc(x, y - .4, 9.4, 0, 7); c.fill(); c.stroke(); c.lineWidth = .25; c.beginPath(); c.arc(x, y - .4, 8.5, 0, 7); c.stroke();
    c.fillStyle = INK; c.beginPath(); c.moveTo(x, y - 8); c.lineTo(x + 3, y + 3); c.lineTo(x, y + 1); c.closePath(); c.fill(); c.lineWidth = .5; c.beginPath(); c.moveTo(x, y - 8); c.lineTo(x - 3, y + 3); c.lineTo(x, y + 1); c.closePath(); c.stroke();
    c.font = '700 4.4px "Barlow Condensed", sans-serif'; c.textAlign = 'center'; c.fillText('N', x, y + 7.6); }
  // scale bar, bottom right: 100 m in four checks
  { const len = 100 * k, x = S - 14 - len, y = H - 11; c.fillStyle = 'rgba(226,199,154,.88)'; c.strokeStyle = INK; c.lineWidth = .5; c.fillRect(x - 5, y - 6.4, len + 10, 11); c.strokeRect(x - 5, y - 6.4, len + 10, 11); c.lineWidth = .4; c.strokeStyle = INK; for (let i = 0; i < 4; i++) { c.fillStyle = i % 2 ? CHALK : INK; c.fillRect(x + len * i / 4, y, len / 4, 1.6); } c.strokeRect(x, y, len, 1.6);
    c.fillStyle = INK; c.font = '700 3.8px "Barlow Condensed", sans-serif'; c.textAlign = 'left'; c.fillText('0', x - .6, y - 1.2); c.textAlign = 'right'; c.fillText('100 M', x + len + .6, y - 1.2); }
  // the name plate, bottom left
  { const t = title.toUpperCase(); c.font = '700 6.2px "Barlow Condensed", sans-serif'; const w = Math.max(64, c.measureText(t).width + 12), x = 8, y = H - 21;
    c.fillStyle = 'rgba(226,199,154,.9)'; c.fillRect(x, y, w, 13.5); c.strokeStyle = INK; c.lineWidth = .6; c.strokeRect(x, y, w, 13.5); c.lineWidth = .25; c.strokeRect(x + 1, y + 1, w - 2, 11.5);
    c.fillStyle = INK; c.textAlign = 'left'; c.fillText(t, x + 5, y + 7.2); c.font = '600 3.3px "Barlow Condensed", sans-serif'; c.fillText(sub.toUpperCase(), x + 5, y + 11.2); }
}
