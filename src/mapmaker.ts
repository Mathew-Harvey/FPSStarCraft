// The map maker: a screen over the menu where a player lays out a map from above. Pick the map and size to build on, then place high ground,
// ramps, islands, rock walls, Flux vents, Survey Beacons, ore fields and painted ground, and drag the far base where it should stand. Everything
// placed at one end is laid at the other end too, turned round the middle, so the map is fair by symmetry. Check runs the fairness check
// (mapcode.ts); only a map that passes gets a code. The code can be pasted back in here, put after #map= in the page address, or loaded in a lobby.
import { MAP, MAPS, SIZES, VHOME, setMap, swapEnd } from './data';
import { TER, PK, PAINTS, MADE, type Plan } from './terrain';
import { planCode, parsePlan, checkPlan, starterPlan, planMap, PIECE_NAMES, MAX_PIECES } from './mapcode';

type Tool = 'ledge' | 'ridge' | 'island' | 'ramp' | 'vent' | 'beacon' | 'wall' | 'field' | 'bright' | 'paint' | 'base' | 'erase';
const TOOLS: [Tool, string, string][] = [
  ['ledge', 'Ledge', 'Drag to lay a ledge of high ground'], ['ridge', 'Ridge', 'Drag to lay a narrow ridge, the kind round a natural'], ['ramp', 'Ramp', 'Click beside high ground to put a ramp up onto it'],
  ['island', 'Island', 'Click to raise an island field: flyers and tunnels only'], ['wall', 'Rock wall', 'Drag across a gap to block it until broken'], ['field', 'Ore field', 'Click to place an ore field'],
  ['bright', 'Bright field', 'Click to place a field of bright seams, richer per load'], ['vent', 'Flux vent', 'Click to place a Flux vent'], ['beacon', 'Survey Beacon', 'Click to place a Survey Beacon'],
  ['paint', 'Paint', 'Drag to paint the ground'], ['base', 'Far base', 'Click where the far base should stand'], ['erase', 'Erase', 'Click a piece to take it away'],
];

let root: HTMLDivElement | null = null;
/** Opens the map maker. `play` starts a skirmish on the given map code once a made map is in use. */
export function openMaker(play: (code: number) => void, from?: string) {
  if (root) root.remove();
  const before = { plan: MADE.plan, code: MADE.code }; let played = false;
  let P: Plan = (from && parsePlan(from)) || (MADE.plan ? JSON.parse(JSON.stringify(MADE.plan)) : starterPlan(2, 0)), tool: Tool = 'ledge', reach = 8, paintKind = 0, checked = false, drag: number[] | null = null, hover: number[] | null = null;
  const el = (tag: string, css = '', html = '') => { const e = document.createElement(tag); if (css) e.style.cssText = css; if (html) e.innerHTML = html; return e; };
  root = el('div', 'position:fixed;inset:0;z-index:60;background:#1d1517;display:flex;gap:14px;padding:14px;box-sizing:border-box;color:#f4e3cf;font:14px/1.35 system-ui,sans-serif;overflow:auto;flex-wrap:wrap') as HTMLDivElement;
  root.setAttribute('role', 'dialog'); root.setAttribute('aria-label', 'Map maker');
  const cv = el('canvas', 'background:#3b2a26;border-radius:10px;touch-action:none;cursor:crosshair;max-width:100%') as HTMLCanvasElement;
  const side = el('div', 'flex:1;min-width:250px;max-width:380px;display:flex;flex-direction:column;gap:10px');
  root.append(cv, side); document.body.append(root);
  const btn = (label: string, on: () => void, title = '') => { const b = el('button', 'background:#3a2c2a;color:#f4e3cf;border:1px solid #6b4f45;border-radius:7px;padding:6px 9px;cursor:pointer;font:inherit') as HTMLButtonElement; b.type = 'button'; b.textContent = label; b.title = title; b.addEventListener('click', on); return b; };
  const row = () => el('div', 'display:flex;flex-wrap:wrap;gap:6px');
  side.append(el('h2', 'margin:0;font-size:20px', 'Map maker'));
  const help = el('div', 'opacity:.8;min-height:2.6em');
  // The map and size it is built on.
  const mapRow = row(), sizeRow = row(); const maps = MAPS.map((m, i) => ({ m, i })).filter(({ m }) => !m.set && !m.ring);
  const mapB = maps.map(({ m, i }) => btn(m.name, () => rebase(i, P.s))), sizeB = SIZES.slice(0, 3).map((S, i) => btn(S.name, () => rebase(P.b, i)));
  mapRow.append(...mapB); sizeRow.append(...sizeB); side.append(el('b', '', 'Built on'), mapRow, sizeRow);
  const toolRow = row(), toolB = TOOLS.map(([t, name, tip]) => btn(name, () => { tool = t; help.textContent = tip; show(); }, tip)); toolRow.append(...toolB); side.append(el('b', '', 'Place'), toolRow, help);
  const reachIn = el('input') as HTMLInputElement; reachIn.type = 'range'; reachIn.min = '4'; reachIn.max = '20'; reachIn.value = String(reach); reachIn.addEventListener('input', () => { reach = +reachIn.value; reachL.textContent = `Width ${reach} m`; });
  const reachL = el('span', '', `Width ${reach} m`), paintRow = row(), paintB = PAINTS.map((p, i) => btn(p, () => { paintKind = i; tool = 'paint'; show(); }));
  paintRow.append(...paintB); const rr = row(); rr.append(reachL, reachIn); side.append(rr, paintRow);
  const count = el('div', 'opacity:.8'), verdict = el('div', 'white-space:pre-wrap;background:#2a1f1f;border-radius:8px;padding:8px;min-height:3em'), codeOut = el('textarea', 'width:100%;height:4.5em;background:#120d0e;color:#ffe2a0;border:1px solid #6b4f45;border-radius:7px;font:12px monospace') as HTMLTextAreaElement;
  codeOut.placeholder = 'Check the map to get its code. Paste a code here and press Load to open one.';
  const act = row(); act.append(btn('Check', () => doCheck()), btn('Copy code', () => { if (checked) { codeOut.select(); navigator.clipboard?.writeText(codeOut.value).catch(() => {}); } }), btn('Load', () => { const Q = parsePlan(codeOut.value.trim()); if (Q) { P = Q; changed(); verdict.textContent = 'Loaded.'; } else verdict.textContent = 'That is not a map code.'; }),
    btn('New', () => { P = starterPlan(P.b, P.s); changed(); }), btn('Undo', () => { P.items.pop(); changed(); }));
  const go = row(); go.append(btn('Play it', () => { const v = doCheck(); if (!v) return; played = true; close(); play(planMap(P)); }), btn('Close', () => close()));
  side.append(count, act, verdict, codeOut, go);
  const close = () => { if (root) root.hidden = true; if (!played) { MADE.plan = before.plan; MADE.code = before.code; } };
  addEventListener('keydown', e => { if (root && !root.hidden && e.key === 'Escape') close(); });

  function rebase(b: number, s: number) { const old = P, k0 = SIZES[old.s].k, k1 = SIZES[s].k, f = k1 / k0; P = { b, s, out: old.b === b ? [Math.round(old.out[0] * f), Math.round(old.out[1] * f)] : starterPlan(b, s).out, items: old.items.map(it => it.map((v, j) => j === 0 || (it[0] === PK.wall && j === 3) || (it[0] === PK.field && j === 3) || (it[0] === PK.paint && j === 4) ? v : Math.round(v * f * 2) / 2)) }; changed(); }
  function changed() { checked = false; codeOut.value = ''; verdict.textContent = ''; lay(); show(); }
  /** Lays the plan out (without the fairness check) so the drawing shows exactly what the game will build. */
  function lay() { MADE.plan = P; MADE.code = planCode(P); setMap(planMap(P)); }
  function doCheck() { const v = checkPlan(P); checked = v.ok; codeOut.value = v.ok ? planCode(P) : ''; verdict.textContent = (v.ok ? 'Fair and playable. The code is below.' : 'Not saved yet:\n' + v.problems.map(p => '- ' + p).join('\n')) + (v.notes.length ? '\n' + v.notes.map(n => '- ' + n).join('\n') : ''); verdict.style.color = v.ok ? '#bff3c8' : '#ffc2a8'; show(); return v.ok; }

  // World to canvas and back.
  let S = 1, cx = 0, cz = 0, W = 600;
  const fit = () => { W = Math.max(320, Math.min(innerHeight - 28, innerWidth - 300, 900)); if (innerWidth < 640) W = innerWidth - 28; cv.width = W * devicePixelRatio; cv.height = W * devicePixelRatio; cv.style.width = cv.style.height = W + 'px'; };
  const X = (x: number) => (x - cx) * S + W / 2, Z = (z: number) => (z - cz) * S + W / 2, wx = (px: number) => (px - W / 2) / S + cx, wz = (pz: number) => (pz - W / 2) / S + cz;
  function show() {
    mapB.forEach((b, j) => b.style.background = maps[j].i === P.b ? '#8a5a2b' : '#3a2c2a'); sizeB.forEach((b, j) => b.style.background = j === P.s ? '#8a5a2b' : '#3a2c2a');
    toolB.forEach((b, j) => b.style.background = TOOLS[j][0] === tool ? '#8a5a2b' : '#3a2c2a'); paintB.forEach((b, j) => b.style.background = tool === 'paint' && j === paintKind ? '#8a5a2b' : '#3a2c2a');
    count.textContent = `${P.items.length} of ${MAX_PIECES} pieces. Each is laid at both ends.`;
    const c = cv.getContext('2d')!; c.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0); [cx, cz] = MAP.mid!; const R = MAP.rad!; S = (W - 20) / (2 * R);
    c.fillStyle = '#1d1517'; c.fillRect(0, 0, W, W); c.fillStyle = '#7a5543'; c.beginPath(); c.arc(X(cx), Z(cz), R * S, 0, 6.2832); c.fill();
    const col = ['#d9b07a', '#3a2522', '#8d8079', '#a9a39b'];
    for (const [x, z, r, k] of TER.paint) { c.fillStyle = col[k]; c.globalAlpha = .55; c.beginPath(); c.arc(X(x), Z(z), r * S, 0, 6.2832); c.fill(); c.globalAlpha = 1; }
    c.strokeStyle = '#b58b62'; c.lineCap = 'round'; for (const r of MAP.roads || []) { c.lineWidth = 6 * S; c.beginPath(); c.moveTo(X(r[0]), Z(r[1])); c.lineTo(X(r[2]), Z(r[3])); c.stroke(); }
    for (const Q of TER.ridges) { c.strokeStyle = Q.kind === 'ledge' ? '#e8c070' : Q.kind === 'island' ? '#9cf' : '#c88'; c.lineWidth = 2 * Q.r * S; c.beginPath(); c.moveTo(X(Q.ax), Z(Q.az)); c.lineTo(X(Q.bx), Z(Q.bz) + (Q.ax === Q.bx && Q.az === Q.bz ? .01 : 0)); c.stroke();
      for (const m of Q.ramps) { c.strokeStyle = '#fff'; c.lineWidth = m.w * S; c.lineCap = 'butt'; c.beginPath(); c.moveTo(X(m.tx), Z(m.tz)); c.lineTo(X(m.fx), Z(m.fz)); c.stroke(); c.lineCap = 'round'; } }
    for (const [x, z, a, len] of TER.walls) { const tx = -Math.sin(a), tz = Math.cos(a); c.strokeStyle = '#2b2b2b'; c.lineWidth = 3.2 * S + 1; c.beginPath(); c.moveTo(X(x - tx * len / 2), Z(z - tz * len / 2)); c.lineTo(X(x + tx * len / 2), Z(z + tz * len / 2)); c.stroke(); }
    (MAP.sites || []).forEach(s => { c.fillStyle = s[3] ? '#ffd24a' : '#7fd'; c.beginPath(); c.arc(X(s[0]), Z(s[1]), Math.max(4, 7 * S), 0, 6.2832); c.fill(); });
    for (const [x, z] of TER.vents) { c.fillStyle = '#f4c'; c.beginPath(); c.arc(X(x), Z(z), Math.max(2.5, 1.6 * S), 0, 6.2832); c.fill(); }
    for (const b of TER.beacons) { c.strokeStyle = '#ff0'; c.lineWidth = 2; c.beginPath(); c.arc(X(b.x), Z(b.z), Math.max(4, 4.5 * S), 0, 6.2832); c.stroke(); c.globalAlpha = .12; c.fillStyle = '#ff0'; c.beginPath(); c.arc(X(b.x), Z(b.z), 40 * S, 0, 6.2832); c.fill(); c.globalAlpha = 1; }
    for (const [x, z, f] of [[0, 0, '#f80'], [VHOME.x, VHOME.z, '#0cf']] as [number, number, string][]) { c.fillStyle = f; c.beginPath(); c.arc(X(x), Z(z), 9, 0, 6.2832); c.fill(); c.strokeStyle = 'rgba(255,255,255,.35)'; c.lineWidth = 1; c.beginPath(); c.arc(X(x), Z(z), 30 * S, 0, 6.2832); c.stroke(); }
    c.fillStyle = '#f4e3cf'; c.font = '12px system-ui'; c.fillText('Yard', X(0) + 11, Z(0) + 4); c.fillText('Far base', X(VHOME.x) + 11, Z(VHOME.z) + 4);
    // The middle: anything placed here is its own twin.
    c.strokeStyle = 'rgba(255,255,255,.3)'; c.setLineDash([3, 4]); c.beginPath(); c.moveTo(X(VHOME.x / 2) - 8, Z(VHOME.z / 2)); c.lineTo(X(VHOME.x / 2) + 8, Z(VHOME.z / 2)); c.moveTo(X(VHOME.x / 2), Z(VHOME.z / 2) - 8); c.lineTo(X(VHOME.x / 2), Z(VHOME.z / 2) + 8); c.stroke(); c.setLineDash([]);
    if (drag && hover) { c.strokeStyle = '#fff'; c.lineWidth = tool === 'ledge' ? 2 * reach * S : tool === 'ridge' ? 8.8 * S : 3; c.globalAlpha = .5; c.beginPath(); c.moveTo(X(drag[0]), Z(drag[1])); c.lineTo(X(hover[0]), Z(hover[1])); c.stroke(); c.globalAlpha = 1; }
    if (hover && !drag) { const r = tool === 'island' || tool === 'paint' ? reach : tool === 'ledge' ? reach : 3; c.strokeStyle = 'rgba(255,255,255,.6)'; c.lineWidth = 1; c.beginPath(); c.arc(X(hover[0]), Z(hover[1]), Math.max(3, r * S), 0, 6.2832); c.stroke(); }
  }
  const at = (e: PointerEvent) => { const b = cv.getBoundingClientRect(); return [Math.round(wx(e.clientX - b.left) * 2) / 2, Math.round(wz(e.clientY - b.top) * 2) / 2]; };
  const drags: Tool[] = ['ledge', 'ridge', 'wall', 'paint'];
  cv.addEventListener('pointerdown', e => { cv.setPointerCapture(e.pointerId); const p = at(e); if (e.button === 2 || tool === 'erase') { erase(p); return; } if (drags.includes(tool)) { drag = p; hover = p; show(); return; } place(p, p); });
  cv.addEventListener('pointermove', e => { hover = at(e); if (drag && tool === 'paint' && Math.hypot(hover[0] - drag[0], hover[1] - drag[1]) > reach * .8) { place(drag, drag); drag = hover; } show(); });
  cv.addEventListener('pointerup', e => { if (!drag) return; const p = at(e), d = drag; drag = null; place(d, p); });
  cv.addEventListener('contextmenu', e => e.preventDefault());
  function place(a: number[], b: number[]) {
    if (P.items.length >= MAX_PIECES && tool !== 'base') { verdict.textContent = `A map holds at most ${MAX_PIECES} pieces.`; return; }
    const [x, z] = a, [x2, z2] = b, len = Math.hypot(x2 - x, z2 - z);
    if (tool === 'ledge') P.items.push([PK.ledge, x, z, x2, z2, reach]);
    else if (tool === 'ridge') P.items.push([PK.ridge, x, z, x2, z2]);
    else if (tool === 'island') P.items.push([PK.island, x, z, Math.max(9, reach)]);
    else if (tool === 'ramp') P.items.push([PK.ramp, x, z]);
    else if (tool === 'vent') P.items.push([PK.vent, x, z]);
    else if (tool === 'beacon') P.items.push([PK.beacon, x, z]);
    else if (tool === 'field' || tool === 'bright') P.items.push([PK.field, x, z, tool === 'bright' ? 1 : 0]);
    else if (tool === 'wall') { if (len < 4) return; P.items.push([PK.wall, (x + x2) / 2, (z + z2) / 2, Math.round(Math.atan2(-(x2 - x), z2 - z) * 180 / Math.PI), Math.min(30, Math.round(len))]); }
    else if (tool === 'paint') P.items.push([PK.paint, x, z, reach, paintKind]);
    else if (tool === 'base') P.out = [Math.round(x), Math.round(z)];
    changed();
  }
  /** Takes away the piece nearest the point, at either end. */
  function erase(p: number[]) {
    const [sx, sz] = swapEnd(p[0], p[1]); let best = -1, bd = 12;
    P.items.forEach((it, i) => { const [k, x, z, a, b] = it, d = (qx: number, qz: number) => (k === PK.ledge || k === PK.ridge) ? segPt(qx, qz, x, z, a, b) : Math.hypot(qx - x, qz - z); const dd = Math.min(d(p[0], p[1]), d(sx, sz)); if (dd < bd) { bd = dd; best = i; } });
    if (best >= 0) { P.items.splice(best, 1); changed(); }
  }
  addEventListener('resize', () => { if (root && !root.hidden) { fit(); show(); } });
  fit(); help.textContent = TOOLS[0][2]; lay(); show(); void PIECE_NAMES;
}
const segPt = (x: number, z: number, ax: number, az: number, bx: number, bz: number) => { const dx = bx - ax, dz = bz - az, l = dx * dx + dz * dz, t = l < 1e-9 ? 0 : Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / l)); return Math.hypot(x - ax - dx * t, z - az - dz * t); };
