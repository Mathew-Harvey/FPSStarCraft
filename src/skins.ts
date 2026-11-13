// Hand-inked skins. Each one is painted the way a comic artist would treat a part: a flat colour
// laid down with a loaded brush, a dark pen line where the form turns away, a dry light stroke on
// the edge that catches the sun, a few bunches of hatching, then chips, seams and stencils.
import * as THREE from 'three';
import { INK, INK_W, R, rnd, T, M, TX, EXTRA, paint, tone, stencil, grime } from './gfx';
import type { Ctx, ToonOpts } from './gfx';

/** A pen stroke with pressure: it swells in the middle and tapers to nothing at the ends. */
export function pen(g: Ctx, pts: number[][], w: number, col: string = INK, taper = 1) {
  w *= 1.9 * INK_W(col);
  const P: number[][] = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1], n = Math.max(2, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 16));
    for (let k = 0; k < n; k++) { const t = k / n; P.push([a[0] + (b[0] - a[0]) * t + R(-1, 1), a[1] + (b[1] - a[1]) * t + R(-1, 1)]); }
  }
  P.push(pts[pts.length - 1]);
  const n = P.length, A: number[][] = [], B: number[][] = [];
  for (let i = 0; i < n; i++) {
    const a = P[Math.max(0, i - 1)], b = P[Math.min(n - 1, i + 1)]; let dx = b[0] - a[0], dy = b[1] - a[1]; const l = Math.hypot(dx, dy) || 1; dx /= l; dy /= l;
    const t = i / (n - 1), k = w * .5 * (1 - taper + taper * Math.pow(Math.sin(Math.PI * (t * .92 + .04)), .5)) * R(.78, 1.16);
    A.push([P[i][0] - dy * k, P[i][1] + dx * k]); B.push([P[i][0] + dy * k, P[i][1] - dx * k]);
  }
  g.fillStyle = col; g.beginPath(); A.forEach((p, i) => i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1])); for (let i = n - 1; i >= 0; i--) g.lineTo(B[i][0], B[i][1]); g.closePath(); g.fill();
}
/** A bunch of parallel pen strokes of uneven length, the way shadow is hatched in by hand. */
export function hatch(g: Ctx, x: number, y: number, len: number, ang: number, n: number, gap = 9, w = 3, col: string = INK) {
  const dx = Math.cos(ang), dy = Math.sin(ang), px = -dy, py = dx;
  for (let i = 0; i < n; i++) {
    const k = 1 - Math.abs(i / (n - 1 || 1) - .45) * .9, l = len * k * R(.6, 1.05), o = R(-.12, .12) * len, sx = x + px * i * gap + dx * o, sy = y + py * i * gap + dy * o;
    pen(g, [[sx, sy], [sx + dx * l * .5 + R(-2, 2), sy + dy * l * .5 + R(-2, 2)], [sx + dx * l, sy + dy * l]], w * R(.7, 1.2), col);
  }
}
/** A capital alphabet as pen strokes on a grid four wide and six tall, so signs and posters are lettered by hand and never wait on a font. */
const GLYPH: Record<string, string> = {
  A: '062046 1434', B: '0006 003041423303 3344453606', C: '4130100105163645', D: '0006 003041453606', E: '40000646 0333', F: '400006 0333', G: '41301001051636454323',
  H: '0006 4046 0343', I: '1030 2026 1636', J: '1040 3035261605', K: '0006 400346', L: '000646', M: '0600234046', N: '06004640', O: '103041453616050110', P: '06003041423303',
  Q: '103041453616050110 2446', R: '06003041423303 2346', S: '413010010213334445361605', T: '0040 2026', U: '000516364540', V: '002640', W: '0016233640', X: '0046 4006', Y: '002340 2326', Z: '00400646',
  0: '103041453616050110 3511', 1: '112026 1636', 2: '01103041420646', 3: '0110304142334445361605 1333', 4: '300444 3036', 5: '400003334445361605', 6: '4130100105163645443303', 7: '004026',
  8: '103041423313020110 1304051636454433', 9: '4313020110304145361605', '.': '2526', '!': '2024 2526', '-': '1343', "'": '2022', '?': '01103041422324 2526', '/': '4006', '+': '2125 0343', ':': '2122 2526', ',': '2516',
};
const THIN = "I1!.':,";
/**
 * Writes `txt` by hand, centred on (x, y) and `h` tall: every letter gets its own size, lean and baseline, the way a sign painter's does.
 * `wk` is the stroke width as a share of the height. Returns the left and right ends, for anything that wants to cross it out.
 */
export function scrawl(g: Ctx, txt: string, x: number, y: number, h: number, col: string = INK, wk = .15, jit = 1, fit = 0): [number, number] {
  let u = h / 6; const adv = (c: string) => (c === ' ' ? 3 : THIN.includes(c) ? 3.6 : 5.3) * u;
  let W = 0; for (const c of txt) W += adv(c);
  if (fit && W > fit) { h *= fit / W; u = h / 6; W = fit; }
  let cx = x - W / 2; const x0 = cx, w = h * wk / (1.9 * INK_W(col));
  for (const c of txt) {
    const gl = GLYPH[c];
    if (gl) {
      const k = 1 + R(-.07, .07) * jit, dy = R(-.3, .3) * u * jit, rot = R(-.07, .07) * jit, co = Math.cos(rot), si = Math.sin(rot), ox = THIN.includes(c) ? -.85 : 0;
      for (const st of gl.split(' ')) {
        const pts: number[][] = [];
        for (let i = 0; i < st.length; i += 2) { const px = (+st[i] + ox - 2) * u * k, py = (+st[i + 1] - 3) * u * k; pts.push([cx + (2 + ox * .5) * u + px * co - py * si, y + dy + px * si + py * co]); }
        pen(g, pts, w * R(.85, 1.15), col, .4);
      }
    }
    cx += adv(c);
  }
  return [x0, cx];
}
/** Broad, half-dry brush strokes that leave the paint uneven. */
export function brush(g: Ctx, s: number, base: string, n: number, ang = 0) {
  for (let i = 0; i < n; i++) {
    g.globalAlpha = R(.1, .26); const x = R(-.1, 1.1) * s, y = R(-.1, 1.1) * s, l = R(.2, .7) * s, a = ang + R(-.25, .25);
    pen(g, [[x, y], [x + Math.cos(a) * l * .5, y + Math.sin(a) * l * .5 + R(-8, 8)], [x + Math.cos(a) * l, y + Math.sin(a) * l]], R(14, 46), tone(base, rnd() < .5 ? R(.7, .9) : R(1.12, 1.4)), .7);
  }
  g.globalAlpha = 1;
}
/** Paint that has flaked off to bare metal: an inked hole with a lit lower lip. */
function flake(g: Ctx, x: number, y: number, r: number, metal: string) {
  const pts: number[][] = []; const n = 7 + Math.floor(rnd() * 4);
  for (let k = 0; k < n; k++) { const a = k / n * 6.283, rr = r * R(.4, 1.2); pts.push([x + Math.cos(a) * rr * 1.25, y + Math.sin(a) * rr * .8]); }
  g.beginPath(); pts.forEach((p, i) => i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1])); g.closePath(); g.fillStyle = metal; g.fill();
  pen(g, [...pts.slice(0, Math.ceil(n * .6))], 3.2); pen(g, [...pts.slice(Math.ceil(n * .55)), pts[0]], 2.2, 'rgba(255,255,255,.75)');
}
export function rivet(g: Ctx, x: number, y: number, r = 6) {
  r *= 2; g.fillStyle = INK; g.beginPath(); g.arc(x + 1, y + 1.5, r, 0, 7); g.fill(); g.fillStyle = 'rgba(255,255,255,.2)'; g.beginPath(); g.arc(x, y, r * .72, 0, 7); g.fill();
  g.fillStyle = 'rgba(255,255,255,.8)'; g.beginPath(); g.arc(x - r * .28, y - r * .3, r * .3, 0, 7); g.fill();
}
/** Dark turn-away and inked border, then a broken light line just inside it. `box` frames all four sides, `band` only top and bottom. */
export function frame(g: Ctx, s: number, base: string, kind: 'box' | 'band' | 'cap', ink = 7) {
  const e = s * .22;
  const sides: [number, number, number, number][] = kind === 'box' ? [[0, 0, 0, 1], [1, 0, -1, 0], [0, 1, 0, -1], [0, 0, 1, 0]] : kind === 'cap' ? [[0, 1, 0, -1]] : [[0, 0, 0, 1], [0, 1, 0, -1]];
  for (const [ox, oy, gx, gy] of sides) {
    const gr = g.createLinearGradient(ox * s, oy * s, ox * s + gx * e, oy * s + gy * e); gr.addColorStop(0, 'rgba(22,12,40,.5)'); gr.addColorStop(1, 'rgba(22,12,40,0)');
    g.fillStyle = gr; g.fillRect(0, 0, s, s);
  }
  const m = ink * .5, hi = tone(base, 1.5), lo = m + ink * 1.5;
  const line = (a: number[], b: number[], w: number, col: string, br: number) => {
    let t = 0; while (t < 1) { const l = br ? R(.08, .3) : 1, t2 = Math.min(1, t + l); if (!br || rnd() < .72) pen(g, [[a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t], [a[0] + (b[0] - a[0]) * (t + t2) / 2 + R(-1.5, 1.5), a[1] + (b[1] - a[1]) * (t + t2) / 2 + R(-1.5, 1.5)], [a[0] + (b[0] - a[0]) * t2, a[1] + (b[1] - a[1]) * t2]], w, col, br ? 1 : .25); t = t2 + (br ? R(.01, .06) : 0); }
  };
  if (kind !== 'cap') line([0, m], [s, m], ink, INK, 0); line([0, s - m], [s, s - m], ink * 1.25, INK, 0);
  g.globalAlpha = kind === 'cap' ? 0 : .85; line([lo, lo], [s - lo, lo], ink * .55, hi, 1); g.globalAlpha = .4; line([lo, s - lo], [s - lo, s - lo], ink * .4, hi, 1); g.globalAlpha = 1;
  if (kind === 'box') { line([m, 0], [m, s], ink, INK, 0); line([s - m, 0], [s - m, s], ink * 1.25, INK, 0); g.globalAlpha = .8; line([lo, lo], [lo, s - lo], ink * .5, hi, 1); g.globalAlpha = 1; }
}
/** Light from above, painted in: the top third lifts, the bottom third sinks towards violet. */
export function sky(g: Ctx, s: number, k = 1) {
  const gr = g.createLinearGradient(0, 0, 0, s); gr.addColorStop(0, `rgba(255,250,225,${.26 * k})`); gr.addColorStop(.4, 'rgba(255,250,225,0)'); gr.addColorStop(.55, 'rgba(60,20,70,0)'); gr.addColorStop(1, `rgba(60,20,70,${.5 * k})`);
  g.fillStyle = gr; g.fillRect(0, 0, s, s);
}
export function nicks(g: Ctx, s: number, n: number, col: string, len = 40, w = 2.6) {
  for (let i = 0; i < n; i++) { g.globalAlpha = R(.45, .95); const x = R(.05, .95) * s, y = R(.05, .95) * s, a = R(-.5, .5) + (rnd() < .5 ? 0 : 1.57), l = R(8, len); pen(g, [[x, y], [x + Math.cos(a) * l * .5 + R(-2, 2), y + Math.sin(a) * l * .5], [x + Math.cos(a) * l, y + Math.sin(a) * l]], R(1.2, w), col); }
  g.globalAlpha = 1;
}
/** The model bake reads the skins as flat colour and lays cracks, mends and warts on itself, so `tools/dump-skins.cjs` asks for them without (`?plainskins`). */
export const PLAIN = typeof location !== 'undefined' && location.search.includes('plainskins');
const h3 = (i: number, j: number, k: number) => { const v = Math.sin(i * 127.1 + j * 311.7 + k * 74.7) * 43758.5453; return v - Math.floor(v); };
/** A pass over a finished skin, cell by cell. `fn` is told how far a dot is from its cell's wall (0 on it), how far from the cell's middle, which cell,
 *  which cell lies over the wall and a slow drift 0..1, and changes the dot's colour in place. It wraps, so the skin still tiles, and it rolls no dice. */
export function cellular(g: Ctx, s: number, n: number, seed: number, fn: (c: Uint8ClampedArray, o: number, wall: number, mid: number, id: number, other: number, drift: number) => void) {
  if (PLAIN) return;
  const im = g.getImageData(0, 0, s, s), d = im.data; if (!(d instanceof Uint8ClampedArray)) return;      // no picture to work on where nothing is drawn (the match server)
  const px = new Float32Array(n * n), py = new Float32Array(n * n), pid = new Float32Array(n * n), w = (i: number) => ((i % n) + n) % n;
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) { const k = j * n + i; px[k] = i + .15 + h3(i, j, seed) * .7; py[k] = j + .15 + h3(i, j, seed + 9) * .7; pid[k] = h3(i, j, seed + 31); }
  const N = 4, lat = new Float32Array((N + 1) * (N + 1)); for (let j = 0; j <= N; j++) for (let i = 0; i <= N; i++) lat[j * (N + 1) + i] = h3(i % N, j % N, seed + 57);
  const ease = (t: number) => t * t * (3 - 2 * t);
  for (let y = 0; y < s; y++) {
    const v = y / s * n, cj = Math.floor(v), fv = y / s * N, j0 = Math.floor(fv), ty = ease(fv - j0);
    for (let x = 0; x < s; x++) {
      const u = x / s * n, ci = Math.floor(u); let a = 99, b = 99, ia = 0, ib = 0;
      for (let dj = -1; dj <= 1; dj++) { const jj = cj + dj, wj = w(jj), oy = jj - wj - v;
        for (let di = -1; di <= 1; di++) { const ii = ci + di, wi = w(ii), k = wj * n + wi, ex = px[k] + ii - wi - u, ey = py[k] + oy, e = ex * ex + ey * ey; if (e < a) { b = a; ib = ia; a = e; ia = k; } else if (e < b) { b = e; ib = k; } } }
      a = Math.sqrt(a); b = Math.sqrt(b);
      const fu = x / s * N, i0 = Math.floor(fu), tx = ease(fu - i0), q = j0 * (N + 1) + i0;
      fn(d, (y * s + x) * 4, b - a, a, pid[ia], pid[ib], (lat[q] * (1 - tx) + lat[q + 1] * tx) * (1 - ty) + (lat[q + N + 1] * (1 - tx) + lat[q + N + 2] * tx) * ty);
    }
  }
  g.putImageData(im, 0, 0);
}
export const sstep = (a: number, b: number, x: number) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
/** Old lacquer: crazed into plates, each a touch its own shade, and the widest cracks mended with gold. The Veyl throw nothing away. */
export function craze(g: Ctx, s: number, n = 6, seed = 1, gold = .42) {
  const GR = 222, GG = 164, GB = 54;
  cellular(g, s, n, seed, (c, o, wall, _mid, id, other) => {
    const k = 1 + (id - .5) * .34;
    if (wall > .16) { c[o] *= k; c[o + 1] *= k; c[o + 2] *= k; return; }
    if ((id + other) % 1 < gold) {
      const m = 1 - sstep(.08, .11, wall), f = k * (1 - (1 - sstep(.11, .16, wall)) * (1 - m) * .62), hi = (1 - sstep(.0, .035, wall)) * .5;
      c[o] = c[o] * f * (1 - m) + (GR + hi * 33) * m; c[o + 1] = c[o + 1] * f * (1 - m) + (GG + hi * 70) * m; c[o + 2] = c[o + 2] * f * (1 - m) + (GB + hi * 120) * m;
    } else { const f = k * (1 - (1 - sstep(.01, .07, wall)) * .66); c[o] *= f; c[o + 1] *= f; c[o + 2] *= f; }
  });
}
export interface SkinOpts extends ToonOpts { kind?: 'box' | 'band' | 'none' | 'cap'; wear?: number; metal?: string; rivets?: number; hatch?: number; ink?: number; dir?: number; pre?: (g: Ctx, s: number) => void; post?: (g: Ctx, s: number) => void }
/** A painted hard surface. */
export function skin(base: string, o: SkinOpts = {}) {
  const kind = o.kind || 'box', wear = o.wear === undefined ? 1 : o.wear;
  return paint(base, (g, s) => {
    brush(g, s, base, 26, o.dir || 0); sky(g, s);
    if (o.pre) o.pre(g, s);
    for (let i = 0; i < 3 * wear; i++) flake(g, R(.12, .88) * s, R(.12, .88) * s, R(22, 60), o.metal || '#a9afb8');
    // Edge chipping: most wear sits where the border is.
    for (let i = 0; i < 9 * wear; i++) { const t = R(.05, .95) * s, top = rnd() < .5; flake(g, kind === 'box' && rnd() < .5 ? (top ? 18 : s - 18) : t, kind === 'box' && rnd() < .5 ? t : (top ? 18 : s - 18), R(16, 40), o.metal || '#a9afb8'); }
    nicks(g, s, 14 * wear, tone(base, 1.6), 70, 5); nicks(g, s, 9 * wear, INK, 50, 4);
    const hn = o.hatch === undefined ? 3 : o.hatch;
    for (let i = 0; i < hn; i++) hatch(g, R(.05, .6) * s, s * R(.55, .75), s * R(.22, .4), -1.0 + R(-.15, .15), 5 + Math.floor(rnd() * 3), s * .05, s * .011);
    if (kind !== 'none') frame(g, s, base, kind, o.ink || 11);
    if (o.rivets && kind === 'box') for (const [x, y] of [[.1, .1], [.9, .1], [.1, .9], [.9, .9]]) rivet(g, x * s, y * s, o.rivets);
    if (o.rivets && kind === 'band') for (let i = 0; i < 8; i++) { rivet(g, (i + .5) / 8 * s, s * .1, o.rivets); rivet(g, (i + .5) / 8 * s, s * .9, o.rivets); }
    if (o.post) o.post(g, s);
  }, { blot: 40 });
}
/** Cloth: stitched seams, drawn folds, no chips. */
function cloth(base: string, o: { folds?: number; kind?: 'box' | 'band' | 'none' | 'cap'; post?: (g: Ctx, s: number) => void } = {}) {
  return paint(base, (g, s) => {
    brush(g, s, base, 34, 1.4); sky(g, s, .8);
    const dark = tone(base, .5), lite = tone(base, 1.4);
    for (let i = 0; i < (o.folds === undefined ? 7 : o.folds); i++) {
      const x = R(.08, .92) * s, y = R(.1, .7) * s, l = R(.12, .34) * s, a = 1.57 + R(-.5, .5);
      const pts = [[x, y], [x + Math.cos(a) * l * .5 + R(-10, 10), y + Math.sin(a) * l * .5], [x + Math.cos(a) * l, y + Math.sin(a) * l]];
      pen(g, pts, R(3, 6), INK); g.globalAlpha = .55; pen(g, pts.map(p => [p[0] + 9, p[1] + 2]), R(5, 10), dark); g.globalAlpha = .7; pen(g, pts.map(p => [p[0] - 7, p[1] - 1]), R(2, 4), lite); g.globalAlpha = 1;
    }
    for (let i = 0; i < 3; i++) hatch(g, R(.05, .6) * s, s * R(.55, .75), s * R(.2, .36), -1.0, 5, s * .05, s * .009);
    if (o.kind !== 'none') {
      frame(g, s, base, o.kind || 'band', 6);
      g.setLineDash([12, 10]); g.strokeStyle = lite; g.lineWidth = 3; g.globalAlpha = .9;
      for (const y of [.07, .93]) { g.beginPath(); g.moveTo(0, s * y); g.lineTo(s, s * y); g.stroke(); }
      g.setLineDash([]); g.globalAlpha = 1;
    }
    if (o.post) o.post(g, s);
  }, { blot: 30 });
}
const seam = (g: Ctx, s: number, y: number, w = 5) => { pen(g, [[0, y * s], [s * .5, y * s + R(-2, 2)], [s, y * s]], w, INK, .2); g.globalAlpha = .6; pen(g, [[0, y * s + w * 1.2], [s * .5, y * s + w * 1.2], [s, y * s + w * 1.2]], w * .5, 'rgba(255,255,255,.7)', .3); g.globalAlpha = 1; };
const vseam = (g: Ctx, s: number, x: number, w = 5) => { pen(g, [[x * s, 0], [x * s + R(-2, 2), s * .5], [x * s, s]], w, INK, .2); g.globalAlpha = .5; pen(g, [[x * s + w * 1.2, 0], [x * s + w * 1.2, s * .5], [x * s + w * 1.2, s]], w * .5, 'rgba(255,255,255,.7)', .3); g.globalAlpha = 1; };
/** A coloured band across the texture with inked edges. */
function stripe(g: Ctx, s: number, y0: number, y1: number, col: string, vertical = false) {
  g.fillStyle = col; if (vertical) g.fillRect(s * y0, 0, s * (y1 - y0), s); else g.fillRect(0, s * y0, s, s * (y1 - y0));
  for (const y of [y0, y1]) vertical ? pen(g, [[s * y, 0], [s * y + R(-2, 2), s * .5], [s * y, s]], 5, INK, .2) : pen(g, [[0, s * y], [s * .5, s * y + R(-2, 2)], [s, s * y]], 5, INK, .2);
}
function chevrons(g: Ctx, s: number, y0: number, y1: number) {
  g.save(); g.beginPath(); g.rect(0, s * y0, s, s * (y1 - y0)); g.clip(); g.fillStyle = INK; const h = s * (y1 - y0);
  for (let i = -2; i < 12; i++) { const x = i * s / 6; g.beginPath(); g.moveTo(x, s * y0); g.lineTo(x + s / 12, s * y0); g.lineTo(x + s / 12 - h * .8, s * y1); g.lineTo(x - h * .8, s * y1); g.fill(); }
  g.restore(); for (const y of [y0, y1]) pen(g, [[0, s * y], [s * .5, s * y + R(-2, 2)], [s, s * y]], 5, INK, .2);
}

EXTRA.push(() => {
  const yel = '#f7b516', org = '#ee7420', bone = '#d9cfb4', red = '#d8382c', stl = '#8d95a6', dk = '#4a4f60', gunm = '#3a3d4a';
  const S = (n: string, tex: THREE.Texture, o: ToonOpts = {}) => { TX[n] = tex; M[n] = T(tex, o); };
  // ---- Ironhold plate, in a box cut (every face framed) and a band cut (wraps a turned or tubed form).
  for (const [n, c] of [['Y', yel], ['O', org], ['W', bone], ['R', red], ['S', stl], ['D', dk]] as const) {
    S('p' + n, skin(c, { rivets: 6, metal: n === 'S' || n === 'D' ? '#e8ecf0' : '#a9afb8' }));
    S('b' + n, skin(c, { kind: 'band', metal: n === 'S' || n === 'D' ? '#e8ecf0' : '#a9afb8' }));
    S('c' + n, skin(c, { kind: 'cap', metal: n === 'S' || n === 'D' ? '#e8ecf0' : '#a9afb8' }));
    S('n' + n, skin(c, { kind: 'none', metal: n === 'S' || n === 'D' ? '#e8ecf0' : '#a9afb8' }));
  }
  S('gunm', skin(gunm, { metal: '#aab2c4', wear: .8, rivets: 4, post: (g, s) => { seam(g, s, .34, 4); seam(g, s, .7, 4); } }));
  S('gunB', skin(gunm, { kind: 'band', metal: '#aab2c4', wear: .7, post: (g, s) => { for (const y of [.2, .4, .6, .8]) seam(g, s, y, 4); } }));
  S('helm', skin(bone, { kind: 'cap', wear: 1.2, post: (g, s) => { stripe(g, s, .42, .58, yel, true); seam(g, s, .78, 5); for (let i = 0; i < 10; i++) rivet(g, (i + .5) / 10 * s, s * .86, 5); stencil(g, '07', s * .78, s * .5, 90, 'rgba(14,13,20,.85)', -.05); stencil(g, '07', s * .22, s * .5, 90, 'rgba(14,13,20,.85)', .05); } }));
  S('helmO', skin('#f08a4a', { kind: 'cap', wear: 1.3, post: (g, s) => { stripe(g, s, .44, .56, INK, true); seam(g, s, .78, 5); for (let i = 0; i < 10; i++) rivet(g, (i + .5) / 10 * s, s * .86, 5); } }));
  S('helmD', skin('#565c70', { kind: 'cap', wear: 1, metal: '#c4cad8', post: (g, s) => { seam(g, s, .78, 5); } }));
  S('helmR', skin(bone, { kind: 'cap', wear: 1, post: (g, s) => { stripe(g, s, .44, .56, red, true); seam(g, s, .78, 5); } }));
  S('hard', skin(yel, { kind: 'cap', wear: 1.2, metal: '#f6f0d4', post: (g, s) => { for (const x of [.36, .5, .64]) vseam(g, s, x, 6); seam(g, s, .82, 5); } }));
  S('chest', skin(yel, { rivets: 7, post: (g, s) => { chevrons(g, s, .7, .86); stencil(g, '07', s * .5, s * .4, 200, 'rgba(14,13,20,.88)', -.05); } }));
  S('chestO', skin(org, { rivets: 7, post: (g, s) => { chevrons(g, s, .12, .3); stencil(g, 'BR', s * .5, s * .6, 170, 'rgba(14,13,20,.88)', -.04); } }));
  S('chestR', skin(bone, { rivets: 5, post: (g, s) => { g.fillStyle = red; g.fillRect(s * .41, s * .2, s * .18, s * .6); g.fillRect(s * .2, s * .41, s * .6, s * .18); const c = [[.41, .2], [.59, .2], [.59, .41], [.8, .41], [.8, .59], [.59, .59], [.59, .8], [.41, .8], [.41, .59], [.2, .59], [.2, .41], [.41, .41], [.41, .2]].map(p => [p[0] * s, p[1] * s]); for (let i = 0; i < c.length - 1; i++) pen(g, [c[i], [(c[i][0] + c[i + 1][0]) / 2, (c[i][1] + c[i + 1][1]) / 2], c[i + 1]], 4, INK, .2); } }));
  S('haz', skin(yel, { rivets: 5, pre: (g, s) => chevrons(g, s, .0, 1) }));
  S('hazB', skin(yel, { kind: 'band', pre: (g, s) => chevrons(g, s, .25, .75) }));
  S('hazC', skin(yel, { kind: 'cap', pre: (g, s) => chevrons(g, s, .08, .4) }));
  S('shield', skin(stl, { rivets: 8, metal: '#eef2f5', wear: 1.6, hatch: 5, post: (g, s) => { chevrons(g, s, .78, .9); seam(g, s, .3, 6); stencil(g, 'IHC', s * .5, s * .56, 150, 'rgba(14,13,20,.8)', -.04); } }));
  S('fab', cloth('#4d577c'));
  S('fabT', cloth('#a8744a'));
  S('fabG', cloth('#6f7a55', { folds: 10 }));
  S('fabR', cloth('#b3362b', { folds: 8 }));
  S('straw', cloth('#c9a352', { folds: 8, kind: 'none' }));
  S('lea', cloth('#6a4230', { kind: 'box', folds: 2 }));
  S('leaB', cloth('#6a4230', { kind: 'band', folds: 3 }));
  S('leaN', cloth('#6a4230', { kind: 'none', folds: 3 }));
  S('gloveN', cloth('#d99a1c', { kind: 'none', folds: 2 }));
  S('glove', cloth('#d99a1c', { kind: 'band', folds: 3, post: (g, s) => { for (const x of [.3, .5, .7]) vseam(g, s, x, 4); } }));
  S('rib', paint('#2b2a36', (g, s) => { for (let i = 0; i < 9; i++) { const y = (i + .5) / 9 * s; pen(g, [[0, y], [s * .5, y + R(-2, 2)], [s, y]], 9, '#0c0b12', .15); g.globalAlpha = .7; pen(g, [[0, y - 10], [s * .5, y - 10], [s, y - 10]], 3.5, '#77748c', .5); g.globalAlpha = 1; } }, { blot: 30 }));
  S('vestB', skin('#ff7d1a', { kind: 'band', wear: 0, hatch: 2, post: (g, s) => { stripe(g, s, .28, .4, '#f6f0d4'); stripe(g, s, .6, .72, '#f6f0d4'); vseam(g, s, .5, 7); for (const y of [.18, .5, .84]) rivet(g, s * .46, s * y, 6); } }));
  S('skinF', paint('#e0a074', (g, s) => { brush(g, s, '#e0a074', 20, 1.4); sky(g, s, .9); for (let i = 0; i < 4; i++) hatch(g, R(.1, .8) * s, s * R(.55, .8), s * .12, -1.0, 5, s * .02, s * .006, '#7a3f2a'); }, { blot: 20 }));
  S('stache', paint('#3a2a26', (g, s) => { for (let i = 0; i < 40; i++) { const x = R(0, s), y = R(0, s); pen(g, [[x, y], [x + R(-10, 10), y + R(30, 70)]], R(3, 6), rnd() < .5 ? '#0c0b12' : '#7a6258'); } }, { blot: 10 }));
  S('visG', paint('#ffd95a', (g, s) => { const gr = g.createLinearGradient(0, 0, 0, s); gr.addColorStop(0, '#fff6c8'); gr.addColorStop(.5, '#ffd040'); gr.addColorStop(1, '#f08a1c'); g.fillStyle = gr; g.fillRect(0, 0, s, s); for (let i = 0; i < 5; i++) { const x = R(.1, .9) * s; pen(g, [[x, s * .12], [x - s * .12, s * .5], [x - s * .2, s * .8]], R(8, 22), 'rgba(255,255,255,.75)'); } frame(g, s, '#ffd95a', 'box', 5); }, { blot: 0 }), { emis: .9 });
  S('lens', paint('#59e6ff', (g, s) => { const gr = g.createRadialGradient(s * .4, s * .36, 10, s * .5, s * .5, s * .6); gr.addColorStop(0, '#f2ffff'); gr.addColorStop(.5, '#59e6ff'); gr.addColorStop(1, '#1c7fb8'); g.fillStyle = gr; g.fillRect(0, 0, s, s); pen(g, [[s * .2, s * .7], [s * .5, s * .3], [s * .8, s * .2]], 26, 'rgba(255,255,255,.8)'); }, { blot: 0 }), { emis: .8 });
  S('drill', skin(stl, { kind: 'band', metal: '#f4f6f8', wear: .6, post: (g, s) => { for (let i = -2; i < 8; i++) { const y = i * s / 6; pen(g, [[0, y], [s * .5, y + s / 12], [s, y + s / 6]], 9, INK, .15); g.globalAlpha = .7; pen(g, [[0, y + 12], [s * .5, y + s / 12 + 12], [s, y + s / 6 + 12]], 4, '#ffffff', .4); g.globalAlpha = 1; } } }));
  S('tank', skin('#c8452e', { kind: 'band', wear: 1.4, post: (g, s) => { seam(g, s, .2, 6); seam(g, s, .8, 6); stencil(g, 'O2', s * .5, s * .5, 110, 'rgba(244,234,210,.92)'); } }));
  S('tankT', skin('#2f9a94', { kind: 'band', wear: 1, post: (g, s) => { seam(g, s, .2, 6); seam(g, s, .8, 6); stencil(g, '+', s * .5, s * .5, 190, 'rgba(244,234,210,.95)'); } }));
  S('sole', paint('#23212b', (g, s) => { for (let i = 0; i < 7; i++) vseam(g, s, (i + .5) / 7, 8); frame(g, s, '#23212b', 'box', 8); }, { blot: 20 }));

  // ---- Ironhold buildings: big panels, read from across the yard.
  const ribsV = (g: Ctx, s: number, n: number) => { for (let i = 0; i < n; i++) { const x = (i + .5) / n * s; g.fillStyle = 'rgba(20,10,30,.2)'; g.fillRect(x, 0, s / n * .45, s); pen(g, [[x, 0], [x + R(-2, 2), s * .5], [x, s]], 4, INK, .2); g.globalAlpha = .55; pen(g, [[x - 7, 0], [x - 7, s * .5], [x - 7, s]], 2.4, '#ffffff', .5); g.globalAlpha = 1; } };
  const drip = (g: Ctx, s: number, n: number) => { for (let i = 0; i < n; i++) { const x = R(.05, .95) * s, l = R(.2, .7) * s; const gr = g.createLinearGradient(0, 0, 0, l); gr.addColorStop(0, 'rgba(40,18,24,.5)'); gr.addColorStop(1, 'rgba(40,18,24,0)'); g.fillStyle = gr; g.fillRect(x, 0, R(8, 26), l); } };
  S('wallS', skin('#9aa2b0', { rivets: 5, metal: '#e8ecf0', hatch: 4, pre: (g, s) => drip(g, s, 5), post: (g, s) => { seam(g, s, .5, 4); } }));
  S('wallR', skin('#b8452c', { rivets: 4, wear: 1.4, metal: '#5e2418', pre: (g, s) => { ribsV(g, s, 6); drip(g, s, 4); }, post: (g, s) => stencil(g, 'IHC', s * .5, s * .5, 150, 'rgba(244,234,210,.9)', -.03) }));
  S('wallT', skin('#2f9a94', { rivets: 4, wear: 1.4, metal: '#b8492e', pre: (g, s) => { ribsV(g, s, 6); drip(g, s, 4); }, post: (g, s) => stencil(g, '22', s * .5, s * .5, 210, 'rgba(244,234,210,.9)', .03) }));
  S('wallY', skin(yel, { rivets: 4, wear: 1.4, pre: (g, s) => { ribsV(g, s, 6); drip(g, s, 4); }, post: (g, s) => stencil(g, '07', s * .5, s * .5, 210, 'rgba(14,13,20,.88)', -.04) }));
  S('wallG', skin('#74926a', { kind: 'band', wear: 1.2, metal: '#b8492e', pre: (g, s) => { ribsV(g, s, 8); drip(g, s, 5); }, post: (g, s) => stencil(g, 'B-01', s * .5, s * .5, 120, 'rgba(244,234,210,.9)') }), { rx: 2 });
  S('wallD', skin('#555b70', { rivets: 5, metal: '#c4cad8', hatch: 4, pre: (g, s) => drip(g, s, 4), post: (g, s) => seam(g, s, .5, 4) }));
  S('conc', skin('#9a8f86', { wear: .5, metal: '#6f655e', hatch: 4, ink: 8, post: (g, s) => { for (let i = 0; i < 3; i++) { let x = R(.1, .9) * s, y = R(.1, .5) * s; const pts = [[x, y]]; for (let k = 0; k < 4; k++) { x += R(-50, 50); y += R(30, 70); pts.push([x, y]); } pen(g, pts, R(2, 4)); } } }));
  S('doorP', paint('#33313d', (g, s) => { for (let i = 0; i < 8; i++) seam(g, s, (i + .5) / 8, 5); g.fillStyle = yel; g.beginPath(); g.moveTo(s * .5, s * .3); g.lineTo(s * .68, s * .62); g.lineTo(s * .32, s * .62); g.closePath(); g.fill(); pen(g, [[s * .5, s * .3], [s * .68, s * .62], [s * .32, s * .62], [s * .5, s * .3]], 5, INK, .2); chevrons(g, s, .88, 1); frame(g, s, '#33313d', 'box', 10); }, { blot: 30 }));
  S('fireP', paint('#ffb23a', (g, s) => { const gr = g.createLinearGradient(0, 0, 0, s); gr.addColorStop(0, '#fff3b0'); gr.addColorStop(.5, '#ffae30'); gr.addColorStop(1, '#e8501c'); g.fillStyle = gr; g.fillRect(0, 0, s, s); for (let i = 0; i < 7; i++) { const x = R(.1, .9) * s; pen(g, [[x, s], [x + R(-30, 30), s * .5], [x + R(-50, 50), s * .1]], R(10, 26), 'rgba(255,250,210,.7)'); } }, { blot: 0 }), { emis: 1 });
  S('rockB', paint('#b0553a', (g, s) => { brush(g, s, '#b0553a', 30, .2); sky(g, s, 1.2); for (let i = 0; i < 6; i++) { const y = R(.05, .95) * s; pen(g, [[0, y], [s * .3, y + R(-18, 18)], [s * .7, y + R(-18, 18)], [s, y]], R(2.5, 5), INK, .5); } for (let i = 0; i < 5; i++) { const x = R(0, s), y = R(0, s * .5); pen(g, [[x, y], [x + R(-20, 20), y + R(40, 90)], [x + R(-30, 30), y + R(100, 200)]], R(2, 4), INK); } for (let i = 0; i < 5; i++) hatch(g, R(0, .7) * s, R(.3, .8) * s, s * R(.14, .3), -1.0, 5, s * .04, s * .009); nicks(g, s, 12, '#f0a078', 60, 4); }, { blot: 60 }));
  // ---- Marks made by hand: four posters and four boards. Each is drawn once, on purpose, and none of it comes from a font or a rule.
  const cream = '#f0e6cc', crayon = '#b8342a';
  const ell = (x: number, y: number, rx: number, ry: number, a0 = 0, a1 = 6.283, n = 14) => Array.from({ length: n + 1 }, (_, i) => { const a = a0 + (a1 - a0) * i / n; return [x + Math.cos(a) * rx, y + Math.sin(a) * ry]; });
  const fillP = (g: Ctx, pts: number[][], col: string) => { g.fillStyle = col; g.beginPath(); pts.forEach((q, i) => i ? g.lineTo(q[0], q[1]) : g.moveTo(q[0], q[1])); g.closePath(); g.fill(); };
  const runs = (g: Ctx, x0: number, x1: number, y: number, n: number, col: string, len: number) => { for (let i = 0; i < n; i++) { const x = R(x0, x1), l = R(.3, 1) * len; pen(g, [[x, y], [x + R(-2, 2), y + l * .5], [x, y + l]], R(2, 4), col, .8); g.fillStyle = col; g.beginPath(); g.arc(x, y + l, R(2.5, 4.5), 0, 7); g.fill(); } };
  const paper = (base: string, draw: (g: Ctx, s: number) => void) => paint(base, (g, s) => {
    brush(g, s, base, 12, .2); draw(g, s);
    g.globalAlpha = .3; for (const t of [.34, .67]) pen(g, [[0, s * t], [s * .5, s * t + R(-5, 5)], [s, s * t]], 2.5, tone(base, .55), .1); g.globalAlpha = 1;
    grime(g, s, 7); drip(g, s, 3); nicks(g, s, 10, tone(base, .6), 40, 3);
    for (const [x, y, a] of [[.12, .045, -.5], [.88, .05, .45]]) { g.save(); g.translate(x * s, y * s); g.rotate(a + R(-.15, .15)); g.fillStyle = 'rgba(236,224,170,.9)'; g.fillRect(-s * .09, -s * .028, s * .18, s * .056); g.strokeStyle = INK; g.lineWidth = 2; g.strokeRect(-s * .09, -s * .028, s * .18, s * .056); g.restore(); }
    { const c = s * R(.1, .16); fillP(g, [[s, s], [s - c, s], [s, s - c]], tone(base, .45)); fillP(g, [[s - c, s], [s, s - c], [s - c * .9, s - c * .9]], tone(base, 1.25)); pen(g, [[s - c, s], [s - c * .9, s - c * .9], [s, s - c]], 2.5); }
    pen(g, [[3, 3], [s - 3, 3], [s - 3, s - 3], [3, s - 3], [3, 3]], 4, INK, .1);
  }, { blot: 30 });
  // "Dig or else": the ore, big and a bit wrong, on a red sunburst.
  S('post1', paper('#e9dcb8', (g, s) => {
    const cx = s * .5, cy = s * .58;
    for (let i = 0; i < 14; i++) { const a = i / 14 * 6.283 + .1, b = a + .22; fillP(g, [[cx, cy], [cx + Math.cos(a) * s, cy + Math.sin(a) * s], [cx + Math.cos(b) * s, cy + Math.sin(b) * s]], i % 2 ? '#c8402c' : '#d9583a'); }
    g.fillStyle = '#e9dcb8'; g.fillRect(0, 0, s, s * .29); g.fillRect(0, s * .81, s, s * .19);
    const P = [[.5, .33], [.65, .46], [.6, .74], [.43, .77], [.35, .55]].map(q => [q[0] * s, q[1] * s]), m = [s * .48, s * .55];
    fillP(g, P, '#9be36a'); fillP(g, [P[0], m, P[4]], '#e4ffc8'); fillP(g, [P[1], P[2], m], '#5fae48');
    for (let i = 0; i < 5; i++) pen(g, [P[i], P[(i + 1) % 5]], 5.5, INK, .3);
    for (const q of [P[0], P[1], P[2], P[4]]) pen(g, [m, q], 3);
    hatch(g, s * .53, s * .6, s * .09, 1.1, 5, s * .016, s * .006);
    for (const [x, y] of [[.3, .4], [.72, .36], [.74, .66]]) { pen(g, [[x * s - 14, y * s], [x * s + 14, y * s]], 3); pen(g, [[x * s, y * s - 14], [x * s, y * s + 14]], 3); }
    scrawl(g, 'DIG', cx, s * .155, s * .2, INK, .17); scrawl(g, 'OR ELSE', cx, s * .905, s * .1, crayon, .16);
  }));
  // "The shift never ends": a skull under a hard hat over crossed picks.
  S('post2', paper('#b23a2c', (g, s) => {
    const cx = s * .5, cy = s * .53, bone = '#eadfc4';
    for (const k of [-1, 1]) { pen(g, [[cx - k * s * .32, s * .8], [cx + k * s * .3, s * .27]], 8, INK, .1); pen(g, [[cx + k * s * .16, s * .24], [cx + k * s * .3, s * .27], [cx + k * s * .39, s * .38]], 10, INK, .5); }
    g.fillStyle = bone; g.beginPath(); g.ellipse(cx, cy, s * .17, s * .16, 0, 0, 7); g.fill(); g.fillRect(cx - s * .1, cy + s * .08, s * .2, s * .13);
    pen(g, ell(cx, cy, s * .17, s * .16, 2.5, 6.92), 5, INK, .2); pen(g, [[cx - s * .1, cy + s * .13], [cx - s * .1, cy + s * .21], [cx + s * .1, cy + s * .21], [cx + s * .1, cy + s * .13]], 5, INK, .2);
    g.fillStyle = INK; g.beginPath(); g.ellipse(cx - s * .07, cy + s * .012, s * .05, s * .056, .2, 0, 7); g.fill(); g.beginPath(); g.ellipse(cx + s * .075, cy, s * .04, s * .05, -.2, 0, 7); g.fill();
    fillP(g, [[cx, cy + s * .05], [cx - s * .02, cy + s * .1], [cx + s * .022, cy + s * .1]], INK);
    for (let i = -2; i <= 2; i++) pen(g, [[cx + i * s * .036, cy + s * .13], [cx + i * s * .036 + R(-2, 2), cy + s * .205]], 3);
    g.fillStyle = '#f2b824'; g.beginPath(); g.ellipse(cx, cy - s * .09, s * .185, s * .135, 0, Math.PI, Math.PI * 2); g.fill(); g.fillRect(cx - s * .23, cy - s * .1, s * .46, s * .036);
    pen(g, ell(cx, cy - s * .09, s * .185, s * .135, Math.PI, 6.283), 5, INK, .2); pen(g, [[cx - s * .23, cy - s * .1], [cx + s * .23, cy - s * .1]], 4, INK, .2); pen(g, [[cx - s * .23, cy - s * .064], [cx + s * .23, cy - s * .064]], 5, INK, .2); pen(g, [[cx, cy - s * .225], [cx, cy - s * .1]], 4);
    hatch(g, cx + s * .06, cy - s * .19, s * .07, 1.2, 4, s * .018, s * .005);
    scrawl(g, 'THE SHIFT', cx, s * .125, s * .1, bone, .16); scrawl(g, 'NEVER ENDS', cx, s * .9, s * .09, bone, .16);
  }));
  // The foreman's notice, with his tally and his stamp.
  S('post3', paper('#e2b23a', (g, s) => {
    g.fillStyle = INK; g.fillRect(0, s * .07, s, s * .17); scrawl(g, 'NOTICE', s * .5, s * .155, s * .11, '#e2b23a', .17);
    scrawl(g, 'NO ORE', s * .4, s * .345, s * .085, INK, .15, 1.5); scrawl(g, 'NO PAY', s * .47, s * .485, s * .085, INK, .15, 1.5); scrawl(g, 'NO WHINING', s * .5, s * .62, s * .068, crayon, .16, 1.8);
    pen(g, [[s * .14, s * .685], [s * .5, s * .7], [s * .86, s * .675]], 4, crayon);
    for (let i = 0; i < 9; i++) { const x = s * (.13 + i * .034 + (i > 4 ? .045 : 0)); pen(g, [[x, s * .76], [x + R(-3, 3), s * .86]], 3.5); } pen(g, [[s * .11, s * .845], [s * .285, s * .775]], 3.5);
    g.globalAlpha = .8; pen(g, ell(s * .74, s * .82, s * .095, s * .09, .3, 6.5, 18), 4, crayon, .3); pen(g, ell(s * .74, s * .82, s * .075, s * .07, 1, 7, 18), 2, crayon, .3); scrawl(g, 'IHC', s * .74, s * .822, s * .055, crayon, .17); g.globalAlpha = 1;
  }));
  // Wanted: a Veyl mask, drawn from memory, and somebody has added a moustache.
  S('post4', paper('#b9cdb4', (g, s) => {
    const cx = s * .5, cy = s * .5, mask = [[0, -.27], [.1, -.2], [.135, -.02], [.085, .16], [0, .25], [-.08, .16], [-.13, -.02], [-.1, -.2], [0, -.27]].map(q => [cx + q[0] * s, cy + q[1] * s]);
    scrawl(g, 'WANTED', cx, s * .13, s * .125, INK, .18);
    fillP(g, mask, '#efe9f6'); fillP(g, [mask[1], mask[2], mask[3], mask[4], [cx + s * .02, cy]], '#cfc6e6'); pen(g, mask, 5, INK, .15);
    for (const [x, y, ry, a] of [[-.055, -.04, .02, .35], [.058, -.045, .02, -.35], [0, -.14, .014, 0]]) { g.fillStyle = '#6a55e6'; g.beginPath(); g.ellipse(cx + x * s, cy + y * s, s * .036, s * ry, a, 0, 7); g.fill(); pen(g, [[cx + (x - .04) * s, cy + (y - a * .03) * s], [cx + x * s, cy + (y - ry) * s], [cx + (x + .04) * s, cy + (y + a * .03) * s]], 3); }
    pen(g, [[cx, cy + s * .02], [cx - s * .008, cy + s * .2]], 3); hatch(g, cx + s * .04, cy + s * .02, s * .08, 1.3, 5, s * .015, s * .005);
    pen(g, [[cx - s * .08, cy + s * .115], [cx - s * .035, cy + s * .075], [cx, cy + s * .095], [cx + s * .035, cy + s * .07], [cx + s * .09, cy + s * .12]], 5.5, crayon);
    scrawl(g, '40 ORE A HEAD', cx, s * .885, s * .066, crayon, .16);
  }));
  // Boards: sawn planks, painted by whoever was nearest. `k` is how many times wider than tall the board hangs.
  const board = (k: number, draw: (g: Ctx, w: number, h: number) => void) => paint('#8a6846', (g, s) => {
    g.save(); g.scale(1 / k, 1); const w = s * k;
    for (let i = 0; i < 46; i++) { g.globalAlpha = R(.15, .4); const y = R(0, s), x = R(-.1, 1) * w; pen(g, [[x, y], [x + R(.1, .4) * w, y + R(-6, 6)]], R(2, 5), rnd() < .5 ? '#5e4630' : '#a88560', .7); } g.globalAlpha = 1;
    for (const t of [.33, .68]) pen(g, [[0, s * t], [w * .5, s * t + R(-5, 5)], [w, s * t]], 5, INK, .1);
    draw(g, w, s);
    for (const x of [18, w - 18]) for (const y of [.16, .5, .85]) { g.fillStyle = INK; g.beginPath(); g.arc(x, s * y, 7, 0, 7); g.fill(); g.fillStyle = 'rgba(255,255,255,.5)'; g.beginPath(); g.arc(x - 2, s * y - 2, 2.4, 0, 7); g.fill(); }
    pen(g, [[4, 4], [w - 4, 4], [w - 4, s - 4], [4, s - 4], [4, 4]], 6, INK, .1);
    g.restore(); grime(g, s, 6);
  }, { blot: 0 });
  S('wood', board(1, () => {}));
  S('signDep', board(2.4, (g, w, h) => {
    const a = scrawl(g, 'DEPOT', w * .5, h * .33, h * .38, cream, .16); runs(g, a[0], a[1], h * .5, 4, cream, h * .12);
    scrawl(g, '8 BEDS', w * .27, h * .79, h * .17, cream, .15); const no = scrawl(g, 'NO', w * .57, h * .79, h * .17, cream, .15); scrawl(g, 'BUGS', w * .8, h * .79, h * .17, cream, .15);
    pen(g, [[no[0] - 10, h * .82], [no[1] + 10, h * .76]], 5, crayon); pen(g, [[no[0] - 6, h * .75], [no[1] + 12, h * .83]], 4, crayon);
  }));
  S('signShop', board(1.6, (g, w, h) => {
    const a = scrawl(g, 'MACHINE', w * .5, h * .22, h * .25, cream, .16); scrawl(g, 'SHOP', w * .5, h * .54, h * .27, cream, .17); runs(g, a[0], a[1], h * .34, 3, cream, h * .08);
    scrawl(g, 'WE FIX IT.', w * .36, h * .85, h * .1, cream, .15); scrawl(g, 'MOSTLY', w * .78, h * .86, h * .1, crayon, .17, 1.8);
  }));
  S('signAssay', board(3.6, (g, w, h) => {
    scrawl(g, 'ASSAY OFFICE', w * .5, h * .32, h * .4, cream, .16, 1, w * .9);
    const f = scrawl(g, 'FAIR', w * .34, h * .8, h * .18, cream, .15); scrawl(g, 'WEIGHTS', w * .6, h * .8, h * .18, cream, .15);
    pen(g, [[f[0] - 12, h * .81], [f[1] + 10, h * .78]], 5, crayon); scrawl(g, 'ROUGH', w * .3, h * .63, h * .13, crayon, .17, 2);
  }));
  S('signKeep', board(2.4, (g, w, h) => { scrawl(g, 'KEEP OUT', w * .5, h * .36, h * .42, cream, .17, 1, w * .88); scrawl(g, 'THIS MEANS YOU', w * .5, h * .82, h * .15, crayon, .17, 1.6); }));
  S('signMine', board(2.4, (g, w, h) => { const a = scrawl(g, 'MINE', w * .33, h * .4, h * .44, cream, .17); runs(g, a[0], a[1], h * .64, 3, cream, h * .14); scrawl(g, 'NOT', w * .8, h * .28, h * .19, crayon, .18, 1.6); scrawl(g, 'YOURS', w * .8, h * .6, h * .18, crayon, .18, 1.6); }));
  // ---- Veyl: grown, not built. Shell with glowing veins, pale mask bone, wound gold, cut crystal.
  const vein = (g: Ctx, s: number, n: number, col: string) => { for (let i = 0; i < n; i++) { let x = R(0, s), y = 0; const pts = [[x, y]]; while (y < s) { y += R(40, 90); x += R(-44, 44); pts.push([x, y]); if (rnd() < .3) pen(g, [[x, y], [x + R(-60, 60), y + R(20, 60)]], R(2, 4), col); } g.globalAlpha = .35; pen(g, pts, R(10, 16), col, .4); g.globalAlpha = 1; pen(g, pts, R(3, 5.5), col, .5); pen(g, pts.map(p => [p[0] + 5, p[1] + 2]), 2.2, INK, .6); } };
  const shell = (base: string, kind: 'box' | 'band', veins: number) => paint(base, (g, s) => {
    brush(g, s, base, 30, 1.4); sky(g, s, 1.2); vein(g, s, veins, '#35e0c8');
    for (let i = 0; i < 4; i++) hatch(g, R(.1, .7) * s, s * R(.55, .8), s * R(.14, .26), -1.0, 6, s * .022, s * .0075);
    for (let i = 0; i < 3; i++) { const y = R(.1, .9) * s; pen(g, [[0, y], [s * .3, y + R(-16, 16)], [s * .7, y + R(-16, 16)], [s, y]], R(2.5, 4), INK, .7); }
    craze(g, s, kind === 'box' ? 5 : 6, veins * 7 + (kind === 'box' ? 3 : 0));
    nicks(g, s, 8, tone(base, 1.7), 60, 4);
    frame(g, s, base, kind, 7);
  }, { blot: 40 });
  S('vI', shell('#6a55e6', 'band', 5)); S('vIp', shell('#6a55e6', 'box', 3)); S('vD', shell('#4636b4', 'band', 3)); S('vDp', shell('#4636b4', 'box', 2));
  S('vL', paint('#d9d2f4', (g, s) => { brush(g, s, '#d9d2f4', 24, 1.4); sky(g, s, 1.3); for (let i = 0; i < 9; i++) { let x = R(0, s), y = R(0, s); const pts = [[x, y]]; for (let k = 0; k < 4; k++) { x += R(-40, 40); y += R(10, 50); pts.push([x, y]); } pen(g, pts, R(2, 4), '#3a2f6a'); } for (let i = 0; i < 4; i++) hatch(g, R(.1, .7) * s, s * R(.55, .8), s * .2, -1.0, 6, s * .022, s * .007, '#3a2f6a'); craze(g, s, 6, 23, .4); frame(g, s, '#d9d2f4', 'band', 7); }, { blot: 30 }));
  S('vG', paint('#f2c14a', (g, s) => { brush(g, s, '#f2c14a', 20, 0); sky(g, s, 1.2); for (let i = 0; i < 7; i++) seam(g, s, (i + .5) / 7, 5); for (let i = 0; i < 12; i++) { const x = R(0, s), y = R(0, s); g.strokeStyle = INK; g.lineWidth = 3; g.beginPath(); g.arc(x, y, R(8, 20), R(0, 3), R(3, 6)); g.stroke(); } nicks(g, s, 18, '#fff4c8', 30); frame(g, s, '#f2c14a', 'box', 6); }, { blot: 20 }), { emis: .25 });
  S('vC', paint('#7ff0e4', (g, s) => { const gr = g.createLinearGradient(0, 0, s, s); gr.addColorStop(0, '#eafffb'); gr.addColorStop(.5, '#62e6d8'); gr.addColorStop(1, '#2a9cc4'); g.fillStyle = gr; g.fillRect(0, 0, s, s); for (let i = 0; i < 9; i++) { const x = R(0, s); g.globalAlpha = R(.3, .7); g.fillStyle = rnd() < .5 ? '#ffffff' : '#2a8fc0'; g.beginPath(); g.moveTo(x, 0); g.lineTo(x + R(20, 70), 0); g.lineTo(x + R(-60, 60), s); g.fill(); g.globalAlpha = 1; pen(g, [[x, 0], [x + R(-30, 30), s * .5], [x + R(-60, 60), s]], R(2.5, 5), '#12506a', .5); } frame(g, s, '#7ff0e4', 'box', 6); }, { blot: 0 }), { emis: .5 });
  S('vM', paint('#ff4f9a', (g, s) => { const gr = g.createRadialGradient(s * .42, s * .4, 8, s * .5, s * .5, s * .62); gr.addColorStop(0, '#fff0f6'); gr.addColorStop(.4, '#ff5fa6'); gr.addColorStop(1, '#a01c6a'); g.fillStyle = gr; g.fillRect(0, 0, s, s); pen(g, [[s * .22, s * .66], [s * .4, s * .3], [s * .7, s * .2]], 22, 'rgba(255,255,255,.8)'); }, { blot: 0 }), { emis: .78 });
  // More than one face in the yard: a second skin tone and grey hair. Added last so the paint on every skin above comes out as it did.
  S('skinD', paint('#9c6444', (g, s) => { brush(g, s, '#9c6444', 20, 1.4); sky(g, s, .9); for (let i = 0; i < 4; i++) hatch(g, R(.1, .8) * s, s * R(.55, .8), s * .12, -1.0, 5, s * .02, s * .006, '#4a2618'); }, { blot: 20 }));
  S('hairG', paint('#8d8a88', (g, s) => { for (let i = 0; i < 40; i++) { const x = R(0, s), y = R(0, s); pen(g, [[x, y], [x + R(-10, 10), y + R(30, 70)]], R(3, 6), rnd() < .5 ? '#3a3840' : '#d8d4cc'); } }, { blot: 10 }));
});
