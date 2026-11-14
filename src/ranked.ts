// The page's side of ranked play and lobby rules.
// Ranked: a panel on the multiplayer menu to pick a faction and look for a match. The server pairs players of about the same rating
// (server/ranked.ts), starts the match, and rates both players at the end. The panel shows the player's rating, the top ten and a link
// to the full leaderboard page. The rating change is shown on the end screen.
// Lobby rules: start ore, start Flux and game speed, set by the lobby's host.
// watch.ts calls rankedInit once and rankedFrame every frame, so main.ts needs nothing new.
import type { Game } from './game';
import type { Net } from './net';
import type { WatchHooks } from './watch';

let H: WatchHooks;
const $ = (id: string) => document.getElementById(id);
const esc = (s: string) => String(s).replace(/[<>&"]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' } as any)[c]);
const http = (ws: string) => ws.replace(/^ws(s?):/, 'http$1:').replace(/\/ws\/?$/, '');
const FACS = ['Ironhold', 'Veyl', 'Gloam'];

// ---------------------------------------------------------------- the name keys
// The server gives a browser a key the first time it plays ranked under a name. The key is kept here, one per name.
const KEYS = 'oreElseRankKeys';
function keys(): Record<string, string> { try { return JSON.parse(localStorage.getItem(KEYS) || '{}') || {}; } catch (e) { return {}; } }
const keyFor = (name: string) => keys()[name.toLowerCase()] || '';
function keepKey(name: string, key: string) { try { const k = keys(); k[name.toLowerCase()] = key; localStorage.setItem(KEYS, JSON.stringify(k)); } catch (e) { /* private window: the key lasts this visit */ } }

// ---------------------------------------------------------------- the panel
let box: HTMLElement, fac = 0, looking = false, status = '', me: any = null, top: any[] = [], season: any = null, lastName = '';
try { fac = Math.max(0, Math.min(2, +(localStorage.getItem('oreElseRankFac') || 0))); } catch (e) { /* fine */ }
function draw() {
  if (!box || box.hidden) return;
  const name = H.name(), mine = me && me.name.toLowerCase() === name.toLowerCase() ? me : null;
  box.innerHTML = `<h4>Ranked one-on-one</h4>`
    + `<p class="small">You play one other person of about your skill. Winning raises your rating and losing lowers it. ${season ? `Season ${season.season} ends ${esc(new Date(season.ends).toLocaleDateString())}.` : ''}</p>`
    + `<div class="row"><div class="diff" role="group" aria-label="Your faction">${FACS.map((f, i) => `<button type="button" data-f="${i}" class="${i === fac ? 'on' : ''}"${looking ? ' disabled' : ''}>${f}</button>`).join('')}</div>`
    + `<button type="button" class="${looking ? 'mini-btn big' : 'go'}" data-a="${looking ? 'stop' : 'find'}">${looking ? 'Stop looking' : 'Find a match'}</button></div>`
    + `<p class="small" role="status">${esc(status)}</p>`
    + `<p>${mine ? `<b>${esc(mine.name)}</b>: rating ${mine.rating}${mine.provisional ? ' (still settling)' : ''}, ${mine.wins} won, ${mine.games - mine.wins} lost${mine.place && !mine.provisional ? `, number ${mine.place}` : ''}.` : `You play ranked as <b>${esc(name)}</b>. Everyone starts at 1500.`}</p>`
    + (top.length ? `<table class="rk-t"><tr><th>#</th><th>Name</th><th>Rating</th></tr>${top.slice(0, 10).map(r => `<tr${r.provisional ? ' class="p"' : ''}><td>${r.place}</td><td>${esc(r.name)}</td><td>${r.rating}${r.provisional ? ' ?' : ''}</td></tr>`).join('')}</table>` : '<p class="small">Nobody has played ranked this season yet.</p>')
    + (H.server() ? `<p class="small"><a href="${esc(http(H.server()))}/leaderboard" target="_blank" rel="noopener">The full leaderboard</a></p>` : '');
}
async function refresh() {
  const srv = H.server(); if (!srv) { status = 'Not connected to a game server.'; draw(); return; }
  try { const j = await (await fetch(`${http(srv)}/leaderboard.json?name=${encodeURIComponent(H.name())}`)).json(); me = j.me; top = j.top || []; season = { season: j.season, ends: j.ends }; } catch (e) { /* the server may be an older one */ }
  draw();
}
function onMsg(m: any) {
  if (m.t === 'queued') {
    if (m.off) { looking = false; status = 'Stopped looking.'; }
    else { looking = true; if (m.key) keepKey(H.name(), m.key); if (m.me !== undefined) me = m.me; if (m.season) season = { season: m.season, ends: m.ends };
      status = `Looking for a match... ${m.waited || 0} s. ${m.n > 1 ? `${m.n} people are looking.` : 'Nobody else is looking yet.'}`; }
    draw();
  } else if (m.t === 'matched') { looking = false; status = `Found a match: ${m.foe}, rated ${m.foeRating}.`; draw(); }
}
function hook(n: Net) { n.onOther = onMsg; const err = n.onError; if (!(err as any).rk) { const e2 = (t: string) => { if (looking || /ranked/i.test(t)) { looking = false; status = t; draw(); } err(t); }; (e2 as any).rk = 1; n.onError = e2; } }
function find() {
  H.connect(n => { hook(n); const name = H.name(); n.send({ t: 'queue', name, key: keyFor(name), fac }); status = 'Asking the server...'; looking = true; draw(); });
}

// ---------------------------------------------------------------- lobby rules
let rulesKey = '';
function drawRules(n: Net | null) {
  const l = n?.lobby, row = $('mRules'); if (!row || !l || !l.code) return;
  const r = (l as any).rules || { ore: 100, flux: 0, speed: 1 }, host = l.you === l.host && l.state !== 'play' && !(l as any).ranked, k = JSON.stringify([r, host]);
  if (k === rulesKey) return; rulesKey = k;
  const set = (id: string, v: number) => { const s = $(id) as HTMLSelectElement; if (!s) return; if (![...s.options].some(o => +o.value === v)) s.add(new Option(String(v), String(v))); s.value = String(v); s.disabled = !host; };
  set('mRuleOre', r.ore); set('mRuleFlux', r.flux); set('mRuleSpeed', r.speed);
}
function sendRules() {
  const v = (id: string) => +($(id) as HTMLSelectElement).value;
  H.net()?.send({ t: 'set', rules: { ore: v('mRuleOre'), flux: v('mRuleFlux'), speed: v('mRuleSpeed') } }); rulesKey = '';
}

// ---------------------------------------------------------------- set up, and every frame
let endLine: HTMLElement | null = null;
export function rankedInit(h: WatchHooks) {
  H = h; box = $('mRankBox')!;
  const css = document.createElement('style');
  css.textContent = `.rk{margin-top:10px;padding:10px 12px;border:1px solid rgba(255,255,255,.14);border-radius:6px}.rk h4{margin:0 0 4px;font-size:20px;color:#f6c21c;letter-spacing:.02em}.rk .row{gap:8px;align-items:center;flex-wrap:wrap}
.rk-t{border-collapse:collapse;width:100%;max-width:360px;font-size:14px}.rk-t td,.rk-t th{text-align:left;padding:2px 8px 2px 0}.rk-t tr.p td{opacity:.65}
#mRules select{font:inherit;padding:3px 4px;background:rgba(0,0,0,.35);color:inherit;border:1px solid rgba(255,255,255,.2);border-radius:4px}#mRules select:disabled{opacity:.6}`;
  document.head.appendChild(css);
  $('mRanked')?.addEventListener('click', () => { box.hidden = !box.hidden; if (!box.hidden) { status = ''; draw(); refresh(); } });
  box?.addEventListener('click', e => {
    const b = (e.target as HTMLElement).closest('button') as HTMLButtonElement | null; if (!b) return;
    if (b.dataset.f !== undefined) { fac = +b.dataset.f; try { localStorage.setItem('oreElseRankFac', String(fac)); } catch (x) { /* fine */ } draw(); }
    else if (b.dataset.a === 'find') find();
    else if (b.dataset.a === 'stop') { H.net()?.send({ t: 'unqueue' }); looking = false; status = 'Stopped looking.'; draw(); }
  });
  for (const id of ['mRuleOre', 'mRuleFlux', 'mRuleSpeed']) $(id)?.addEventListener('change', sendRules);
}
export function rankedFrame(g: Game) {
  const n = H.net();
  if (n && n.onOther !== onMsg) hook(n);
  drawRules(n);
  // the name box changed: the rating shown is for the new name
  const nm = H.name(); if (nm !== lastName) { lastName = nm; if (box && !box.hidden && !looking) { me = null; refresh(); } }
  // a ranked match ended: the rating change on the end screen
  const net = g.net as Net | null, end = $('end'), rk = net?.rank;
  if (end && !end.hidden && rk) {
    if (!endLine) { endLine = document.createElement('p'); endLine.className = 'small'; end.querySelector('.box')?.appendChild(endLine); }
    endLine.textContent = `${(rk as any).left && (rk as any).left !== H.name() ? `${(rk as any).left} left the match, so it counts as your win. ` : ''}Ranked: your rating went from ${rk.before} to ${rk.after} (${rk.delta >= 0 ? '+' : ''}${rk.delta})${rk.provisional ? '. It is still settling, so it moves a lot for now' : ''}.`; endLine.hidden = false;
    if (box && !box.hidden) { box.hidden = true; }
  } else if (endLine) endLine.hidden = true;
}
