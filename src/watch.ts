// Watching a match: a live one from the observer seat, or a replay played in this page.
// The view follows one player's body (number keys or the buttons on the bar). Two panels help a caster: production (what each side is
// training and has standing) and income (ore mined a minute, each side, over the match). A replay also gets play, pause, speed and a time bar.
// main.ts calls watchInit once and watchFrame every frame; everything else about watching lives here.
import type { Game } from './game';
import { Net } from './net';
import type { Replay } from './match';
import { FACTION, UNIT, BLD, SIDE, fac, Kind } from './data';
import { multi, MATCH } from './core/sides';

export interface WatchHooks {
  /** Starts the page's online game for a 'begin' message (main.ts does the same for a player). */
  begin(n: Net, m: any): void;
  /** Connects to the match server from the menu, then runs `then`. */
  connect(then: (n: Net) => void): void;
  /** The server address typed on the menu (ws:// or wss://), and the player's name. */
  server(): string; name(): string; code(): string;
  /** The open server connection, if any. */
  net(): Net | null;
  /** Shows an error line on the multiplayer menu. */
  err(t: string): void;
}
let H: WatchHooks;
const $ = (id: string) => document.getElementById(id);
const esc = (s: string) => String(s).replace(/[<>&"]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' } as any)[c]);
const SIDE_COL = ['#f2a33a', '#7fd6e8', '#9ad65a', '#e8734a', '#c49cf0', '#c8e86a'];
const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
/** The match server's web address, from its socket address: where replays are listed and downloaded. */
export const httpOf = (ws: string) => ws.replace(/^ws(s?):/, 'http$1:').replace(/\/ws\/?$/, '');

// ---------------------------------------------------------------- a replay playing in this page
interface Playing { worker: Worker; net: Net; rec: Replay; tick: number; last: number; speed: number; paused: boolean; drift: number; /** The page's game is showing it. */ on: boolean }
let rp: Playing | null = null;
/** Plays a replay in this page. The match runs in a Web Worker beside the page (dist/replay-worker.js), built like the match server. */
export function playReplay(rec: Replay) {
  stopReplay();
  if (!rec || !rec.setup || !Array.isArray(rec.log)) { H.err('That file is not an Ore Else replay.'); return; }
  let worker: Worker;
  try { worker = new Worker(new URL('replay-worker.js', location.href)); } catch (e) { H.err('Replays play only when the game is opened from its server or web address, not from a file on disk.'); return; }
  const net = new Net(); net.open = true; net.close = () => { net.open = false; };
  const p: Playing = rp = { worker, net, rec, tick: 0, last: rec.end?.tick ?? 0, speed: 1, paused: false, drift: -1, on: false };
  worker.onmessage = e => {
    let m: any; try { m = JSON.parse(String(e.data)); } catch (x) { return; }
    if (m.t === 'rp') { p.tick = m.tick; p.last = m.last; p.speed = m.speed; p.paused = m.paused; p.drift = m.drift; }
    else if (m.t === 'rp-err') H.err('The replay stopped: ' + m.msg);
    else if (m.t === 'rp-ready') { /* loaded */ }
    else net.take(m);
  };
  worker.onerror = () => H.err('Replays play only when the game is opened from its server or web address, not from a file on disk.');
  net.onBegin = m => H.begin(net, m);
  worker.postMessage({ t: 'load', rec });
}
export function stopReplay() { if (!rp) return; rp.worker.terminate(); rp.net.open = false; rp = null; }
const ask = (o: any) => rp?.worker.postMessage(o);
function saveFile(name: string, text: string) { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type: 'application/json' })); a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 2000); }
async function readFile(f: File): Promise<Replay> {
  const buf = new Uint8Array(await f.arrayBuffer());
  if (buf[0] === 0x1f && buf[1] === 0x8b) { const s = new Blob([buf]).stream().pipeThrough(new DecompressionStream('gzip')); return JSON.parse(await new Response(s).text()); }
  return JSON.parse(new TextDecoder().decode(buf));
}

// ---------------------------------------------------------------- the bar and the panels
let root: HTMLDivElement, bar: HTMLDivElement, prod: HTMLDivElement, inc: HTMLDivElement, incC: HTMLCanvasElement, list: HTMLDivElement;
let showProd = true, showInc = true, upT = 0, sampleT = 0;
/** Ore mined a minute, per side, sampled every two seconds: [time, yard, outpost]. */
let income: number[][] = [], lastMined: [number, number, number] | null = null, incomeGame: Game | null = null;
const CSS = `
#watch{position:fixed;inset:0;pointer-events:none;z-index:40;font:13px/1.3 system-ui,sans-serif;color:#f4ecd8}
#watch .w-bar{pointer-events:auto;position:absolute;top:8px;left:50%;transform:translateX(-50%);display:flex;flex-wrap:wrap;gap:6px;align-items:center;justify-content:center;background:#16131cdd;border:2px solid #0e0d14;border-radius:8px;padding:6px 10px;max-width:calc(100vw - 32px)}
#watch button{font:inherit;color:inherit;background:#2b2633;border:2px solid #0e0d14;border-radius:5px;padding:3px 8px;cursor:pointer}
#watch button.on{background:#f2a33a;color:#16131c}
#watch .w-who{font-weight:700;letter-spacing:.04em;margin-right:4px}
#watch input[type=range]{width:min(320px,50vw)}
#watch .w-panel{pointer-events:auto;position:absolute;background:#16131cdd;border:2px solid #0e0d14;border-radius:8px;padding:8px 10px}
#watch .w-prod{right:8px;top:286px;width:300px;max-height:calc(100vh - 440px);overflow:auto}
#watch .w-inc{right:8px;top:64px}
#watch .w-side{margin-bottom:8px}
#watch .w-side h4{margin:0 0 4px;font-size:14px}
#watch .w-row{display:flex;justify-content:space-between;gap:8px}
#watch .w-q{height:5px;background:#0e0d14;border-radius:3px;margin:1px 0 3px}
#watch .w-q i{display:block;height:100%;border-radius:3px}
#watch .w-list{pointer-events:auto;position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);width:min(560px,calc(100vw - 32px));max-height:70vh;overflow:auto;background:#16131cf2;border:2px solid #0e0d14;border-radius:8px;padding:12px}
#watch .w-list .w-r{display:flex;gap:8px;align-items:center;justify-content:space-between;border-top:1px solid #2b2633;padding:6px 0}
#watch .w-note{color:#ffb38a}
#watch .w-small{font-size:12px;opacity:.85}
#watch canvas{display:block;width:300px;height:130px;position:static}
#watch .w-bar button,#watch .w-list button{position:static;transform:none;box-shadow:none;min-width:0;text-transform:none;font:inherit}
`;
function build() {
  const st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);
  root = document.createElement('div'); root.id = 'watch'; root.hidden = true;
  bar = document.createElement('div'); bar.className = 'w-bar';
  prod = document.createElement('div'); prod.className = 'w-panel w-prod';
  inc = document.createElement('div'); inc.className = 'w-panel w-inc'; incC = document.createElement('canvas'); incC.width = 300; incC.height = 130; inc.innerHTML = '<div class="w-who">Ore mined a minute</div>'; inc.appendChild(incC); inc.appendChild(document.createElement('div'));
  list = document.createElement('div'); list.className = 'w-list'; list.hidden = true;
  root.append(bar, prod, inc, list); document.body.appendChild(root);
  bar.addEventListener('click', e => {
    const b = (e.target as HTMLElement).closest('button') as HTMLButtonElement | null; if (!b) return; const a = b.dataset.a || '';
    const n = cur?.net; if (a === 'f' && n?.watch) { n.watch.follow = +(b.dataset.id || 0); }
    else if (a === 'prod') showProd = !showProd; else if (a === 'inc') showInc = !showInc;
    else if (a === 'pause') ask({ t: 'pause', v: !rp?.paused }); else if (a === 'speed') ask({ t: 'speed', v: +(b.dataset.v || 1) });
    else if (a === 'save' && rp) saveFile(`ore-else-replay-${rp.rec.at.slice(0, 16).replace(/[:T]/g, '-')}.json`, JSON.stringify(rp.rec));
    upT = 0;
  });
  bar.addEventListener('input', e => { const r = e.target as HTMLInputElement; if (r.dataset.a === 'seek') ask({ t: 'seek', tick: +r.value }); });
  list.addEventListener('click', async e => {
    const b = (e.target as HTMLElement).closest('button') as HTMLButtonElement | null; if (!b) return;
    if (b.dataset.a === 'close') list.hidden = true;
    else if (b.dataset.a === 'watch') { list.hidden = true; try { const r = await fetch(httpOf(H.server()) + '/replays/' + b.dataset.id); playReplay(await r.json()); } catch (x) { H.err('Could not fetch that replay from the server.'); } }
    else if (b.dataset.a === 'file') ($('watchFile') as HTMLInputElement).click();
  });
  const fi = document.createElement('input'); fi.type = 'file'; fi.id = 'watchFile'; fi.accept = '.json,.gz,application/json'; fi.hidden = true; root.appendChild(fi);
  fi.addEventListener('change', async () => { const f = fi.files?.[0]; fi.value = ''; if (!f) return; list.hidden = true; try { playReplay(await readFile(f)); } catch (x) { H.err('That file is not an Ore Else replay.'); } });
  // Watching keys: 1 to 8 follow a player, P production, I income; in a replay Space pauses, [ and ] change speed, the arrows jump 10 seconds.
  addEventListener('keydown', e => {
    const n = cur?.net; if (!n?.watch || cur?.phase !== 'play' || (e.target as HTMLElement)?.tagName === 'INPUT') return;
    let used = true; const ids = players(cur);
    if (/^Digit[1-8]$/.test(e.code)) { const p = ids[+e.code.slice(5) - 1]; if (p) n.watch.follow = p.id; }
    else if (e.code === 'KeyP') showProd = !showProd; else if (e.code === 'KeyI') showInc = !showInc;
    else if (rp && e.code === 'Space') ask({ t: 'pause', v: !rp.paused });
    else if (rp && (e.code === 'BracketRight' || e.code === 'BracketLeft')) { const S = [.25, .5, 1, 2, 4, 8, 16], i = S.indexOf(rp.speed); ask({ t: 'speed', v: S[Math.max(0, Math.min(S.length - 1, (i < 0 ? 2 : i) + (e.code === 'BracketRight' ? 1 : -1)))] }); }
    else if (rp && (e.code === 'ArrowRight' || e.code === 'ArrowLeft')) ask({ t: 'seek', tick: rp.tick + (e.code === 'ArrowRight' ? 300 : -300) });
    else used = false;
    if (used) { e.preventDefault(); e.stopImmediatePropagation(); upT = 0; }
  }, true);
}
/** The players in the match being watched, in seat order, with their side. */
function players(g: Game) { return Object.keys(g.names || {}).map(Number).sort((a, b) => a - b).map(id => ({ id, name: g.names[id], team: g.teams[id] ?? SIDE.home })); }
const sideName = (t: number) => FACTION[t].short + (multi() ? ` (side ${MATCH.teams.indexOf(t) + 1})` : fac(SIDE.home) === fac(SIDE.out) ? (t === SIDE.home ? ' (yard)' : ' (outpost)') : '');

function drawBar(g: Game) {
  const n = g.net!, P = players(g), f = n.watch!.follow;
  let h = `<span class="w-who">${rp ? 'Replay' : 'Watching'}</span>` + P.map((p, i) => `<button data-a="f" data-id="${p.id}" class="${p.id === f ? 'on' : ''}" style="border-color:${SIDE_COL[p.team] || '#0e0d14'}">${i + 1} ${esc(p.name)}</button>`).join('');
  h += `<button data-a="prod" class="${showProd ? 'on' : ''}">P Production</button><button data-a="inc" class="${showInc ? 'on' : ''}">I Income</button>`;
  if (rp) {
    h += `<span style="flex-basis:100%;height:0"></span><button data-a="pause">${rp.paused ? 'Play' : 'Pause'}</button>` + [.5, 1, 2, 4, 8].map(v => `<button data-a="speed" data-v="${v}" class="${rp!.speed === v ? 'on' : ''}">${v}x</button>`).join('');
    h += `<input type="range" data-a="seek" min="0" max="${rp.last}" step="30" value="${rp.tick}" aria-label="Time"><span>${clock(rp.tick / 30)} / ${clock(rp.last / 30)}</span><button data-a="save">Save file</button>`;
    if (rp.drift >= 0) h += `<span class="w-note">This replay was recorded on different rules: from ${clock(rp.drift / 30)} it shows a different match from the one played.</span>`;
  }
  // the seek bar is being dragged: leave it alone
  if (!bar.contains(document.activeElement) || (document.activeElement as HTMLInputElement).type !== 'range') bar.innerHTML = h;
}
function drawProd(g: Game) {
  const sides = multi() ? MATCH.teams : [SIDE.home, SIDE.out];
  prod.innerHTML = sides.map(t => {
    const units = new Map<Kind, number>(); for (const u of g.units) if (u.alive && u.team === t) units.set(u.kind, (units.get(u.kind) || 0) + 1);
    const making = g.buildings.filter(b => b.alive && b.team === t && (b.queue.length || !b.built));
    return `<div class="w-side"><h4 style="color:${SIDE_COL[t] || '#d8d0c0'}">${esc(sideName(t))}</h4>`
      + `<div class="w-row"><span>Ore ${Math.floor(g.cash(t))}</span><span>Flux ${Math.floor(g.flux(t))}</span><span>Bodies ${[...units.values()].reduce((a, b) => a + b, 0)}</span></div>`
      + `<div class="w-small">${[...units].sort((a, b) => b[1] - a[1]).map(([k, c]) => `${c} ${esc(UNIT[k].name)}`).join(' · ')}</div>`
      + making.map(b => { const q = b.queue[0], k = !b.built ? 1 - Math.min(1, b.progress) : q ? Math.max(0, Math.min(1, q.t / (UNIT[q.kind].time || 1))) : 0;
        return `<div class="w-row"><span>${esc(BLD[b.kind].name)}</span><span>${!b.built ? 'being built' : esc(UNIT[q!.kind].name) + (b.queue.length > 1 ? ` +${b.queue.length - 1}` : '')}</span></div><div class="w-q"><i style="width:${Math.round((1 - k) * 100)}%;background:${SIDE_COL[t] || '#d8d0c0'}"></i></div>`; }).join('')
      + '</div>';
  }).join('');
}
function sample(g: Game) {
  if (incomeGame !== g) { incomeGame = g; income = []; lastMined = null; }
  const now: [number, number, number] = [g.time, g.stats.mined, g.stats.minedV];
  if (lastMined && now[0] > lastMined[0]) { const dt = (now[0] - lastMined[0]) / 60; income.push([now[0], Math.max(0, (now[1] - lastMined[1]) / dt), Math.max(0, (now[2] - lastMined[2]) / dt)]); if (income.length > 900) income.splice(0, income.length - 900); }
  lastMined = now;
}
function drawInc() {
  const c = incC.getContext('2d')!, W = incC.width, Hh = incC.height; c.clearRect(0, 0, W, Hh);
  // smoothed over 20 seconds so a single trip home does not spike the line
  const sm = income.map((r, i) => { const w = income.slice(Math.max(0, i - 9), i + 1); return [r[0], w.reduce((a, x) => a + x[1], 0) / w.length, w.reduce((a, x) => a + x[2], 0) / w.length]; });
  const top = Math.max(60, ...sm.map(r => Math.max(r[1], r[2]))) * 1.1, t0 = sm.length ? sm[0][0] : 0, t1 = sm.length ? sm[sm.length - 1][0] : 1;
  c.strokeStyle = '#2b2633'; c.lineWidth = 1; for (let y = 0; y <= 4; y++) { c.beginPath(); c.moveTo(0, Hh * y / 4); c.lineTo(W, Hh * y / 4); c.stroke(); }
  [[1, SIDE.home], [2, SIDE.out]].forEach(([k, t]) => { c.strokeStyle = SIDE_COL[t]; c.lineWidth = 2; c.beginPath(); sm.forEach((r, i) => { const x = (r[0] - t0) / Math.max(1, t1 - t0) * W, y = Hh - r[k] / top * Hh; if (i) c.lineTo(x, y); else c.moveTo(x, y); }); c.stroke(); });
  const last = sm[sm.length - 1];
  (inc.lastChild as HTMLElement).innerHTML = `<div class="w-row"><span style="color:${SIDE_COL[SIDE.home]}">${esc(sideName(SIDE.home))}: ${last ? Math.round(last[1]) : 0} a minute</span><span style="color:${SIDE_COL[SIDE.out]}">${esc(sideName(SIDE.out))}: ${last ? Math.round(last[2]) : 0} a minute</span></div><div class="w-small">Top of the graph: ${Math.round(top)} ore a minute</div>`;
}

/** Lists the replays the server keeps, with a button to watch each, and opens a replay file from disk. */
export async function showReplays() {
  list.hidden = false; root.hidden = false; list.innerHTML = '<div class="w-row"><b>Replays</b><button data-a="close">Close</button></div><p>Loading the list from the server...</p>';
  let rows: any[] = []; const srv = H.server();
  if (srv) try { rows = await (await fetch(httpOf(srv) + '/replays')).json(); } catch (e) { rows = []; }
  const M = ['Needle\'s Eye', 'Switchback', 'Glass Flats'];
  list.innerHTML = '<div class="w-row"><b>Replays</b><span><button data-a="file">Open a file</button> <button data-a="close">Close</button></span></div>'
    + (rows.length ? rows.map(r => `<div class="w-r"><span>${esc(new Date(r.at).toLocaleString())}<br><small>${esc(r.names.join(', '))} · ${esc(M[r.map % 10] || 'map ' + r.map)} · ${clock(r.ticks / 30)}</small></span><span><button data-a="watch" data-id="${esc(r.id)}">Watch</button> <a href="${esc(httpOf(srv))}/replays/${esc(r.id)}" download>Save</a></span></div>`).join('')
      : `<p>${srv ? 'The server has no replays yet. Every online match is kept as one when it ends; the server keeps the last 40.' : 'Not connected to a game server. You can still open a replay file.'}</p>`);
}

let cur: Game | null = null, endLink: HTMLElement | null = null;
/** Sets up the bar, the panels and the menu buttons. Called once by main.ts. */
export function watchInit(h: WatchHooks) {
  H = h; build();
  $('mWatch')?.addEventListener('click', () => { const c = H.code().trim().toUpperCase(); if (c.length !== 5) { H.err('Type the five-letter code of the lobby you want to watch.'); return; } H.connect(n => n.send({ t: 'join', code: c, name: H.name(), watch: 1 })); });
  $('mReplays')?.addEventListener('click', () => { showReplays(); });
  $('mWatchSide')?.addEventListener('click', () => { const n = H.net(), l = n?.lobby, me = l?.players.find(p => p.id === l.you); n?.send({ t: 'team', v: me && me.team < 0 ? 0 : 2 }); });
}
/** Every frame, before the game moves: a watcher's keys and mouse do not drive the body; the bar and panels are kept up to date. */
export function watchFrame(g: Game, dt: number) {
  cur = g; const n = g.net as Net | null;
  // the player left the replay (quit, or started something else)
  if (rp && n === rp.net) rp.on = true; else if (rp && rp.on) stopReplay();
  // the lobby's watch button says what it will do
  { const b = $('mWatchSide'), l = H.net()?.lobby, me = l?.players.find(p => p.id === l.you); if (b && l) { b.textContent = me && me.team < 0 ? 'Play instead' : 'Watch instead'; b.hidden = !!me && me.id === l.host; } }
  // after an online match: the replay's link on the end screen
  const id = n?.replay, end = $('end');
  if (end && !end.hidden && id && H.server() && !rp) { if (!endLink) { endLink = document.createElement('p'); endLink.className = 'small'; end.querySelector('.box')?.appendChild(endLink); } endLink.innerHTML = `This match was kept as a replay. <a href="${esc(httpOf(H.server()))}/replays/${esc(id)}" download>Save the replay file</a>`; endLink.hidden = false; }
  else if (endLink && (end?.hidden || !id)) endLink.hidden = true;
  const W = !!n?.watch && g.phase !== 'menu';
  root.hidden = !W && list.hidden; bar.hidden = prod.hidden = inc.hidden = !W;
  if (!W) return;
  g.keys.clear(); g.pressed.clear(); g.lmb = g.rmb = false; g.mdx = g.mdy = 0; g.wheel = 0;
  prod.hidden = !showProd; inc.hidden = !showInc;
  sampleT -= dt; if (sampleT <= 0) { sampleT = 2; sample(g); }
  upT -= dt; if (upT <= 0) { upT = .25; drawBar(g); if (showProd) drawProd(g); if (showInc) drawInc(); }
}
