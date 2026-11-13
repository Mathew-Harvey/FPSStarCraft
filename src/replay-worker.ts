// Plays a replay inside the page, away from the page's own game: a Web Worker running the same match code the server runs (src/match.ts),
// built like the server, with no art and no sound. It sends the page what the server sends a watcher: a 'begin', snapshots, and 'over'.
// The page shows them with its online code, as if it were watching a live match (src/watch.ts).
import '../server/shim';
import { initHeadless } from './gfx';
import { Playback, Replay, Seat } from './match';

initHeadless();
const post = (m: any) => (self as any).postMessage(typeof m === 'string' ? m : JSON.stringify(m));
const WATCH_ID = 999999;
let rec: Replay | null = null, p: Playback | null = null, speed = 1, paused = false, mute = false, carry = 0, overSent = false;
const watcher = (): Seat => ({ id: WATCH_ID, name: 'Watching', team: -1, unit: null, inbox: [] });
function start() { overSent = false; p = new Playback(rec!, (s, m) => { if (s.id === WATCH_ID && !mute) post(m); }, watcher()); }
function status() { if (p) post({ t: 'rp', tick: p.m.tick, last: p.last, speed, paused, drift: p.drift }); }
function tick() {
  if (!p || paused) return;
  carry += speed; let n = Math.floor(carry); carry -= n;
  while (n-- > 0 && p) { if (p.step()) { if (!overSent) { overSent = true; const g = p.m.g, st = g.stats, end = rec!.end; post({ t: 'over', won: end?.won ?? !!g.won, stats: [Math.floor(st.mined), st.built, st.kills, st.lost, Math.floor(st.minedV)], time: g.time, replay: '' }); } paused = true; break; } }
  if (p && p.m.tick % 10 === 0) status();
}
/** Jumps to a tick: forward by running on without showing it, back by starting again (the page is sent a fresh 'begin') and running on. */
function seek(to: number) {
  if (!rec) return;
  if (!p || to < p.m.tick) start();
  if (p) { to = Math.max(0, Math.min(to, p.last)); mute = true; try { while (p.m.tick < to && !p.step()) { /* run on */ } } finally { mute = false; } }
  status();
}
self.onmessage = (e: MessageEvent) => {
  const m = e.data;
  try {
    if (m.t === 'load') { rec = m.rec; speed = 1; paused = false; carry = 0; start(); status(); }
    else if (m.t === 'speed') { speed = Math.max(.25, Math.min(16, +m.v || 1)); status(); }
    else if (m.t === 'pause') { paused = !!m.v; status(); }
    else if (m.t === 'seek') seek(+m.tick | 0);
  } catch (err) { post({ t: 'rp-err', msg: String((err as Error)?.message || err) }); }
};
setInterval(tick, 1000 / 30);
post({ t: 'rp-ready' });
