// On-screen controls for phones and tablets. They drive the same keys, buttons and mouse movement
// the game already reads from the keyboard and mouse, so the game code does not know the difference.
import type { Game } from './game';
import { isWorker, fac } from './data';

export type TouchPref = 'auto' | 'on' | 'off';

/** True on a phone or tablet: a touch screen that is the main way to point. A laptop with a touch screen and a mouse is not one. */
export function touchDevice(): boolean {
  try {
    const mm = (q: string) => !!window.matchMedia && window.matchMedia(q).matches;
    const pts = (navigator.maxTouchPoints || 0) > 0 || 'ontouchstart' in window;
    const ua = navigator.userAgent || '';
    const mobile = /Android|iPhone|iPad|iPod|Mobile|Silk|Kindle/i.test(ua) || (/Macintosh/.test(ua) && (navigator.maxTouchPoints || 0) > 1);
    return pts && (mobile || (mm('(pointer: coarse)') && !mm('(hover: hover)')));
  } catch (e) { return false; }
}

/** What each button presses. Held buttons stay down while a finger is on them; the rest are one press per tap. */
type Btn = { id: string; el: HTMLButtonElement; key: string; held?: boolean; look?: boolean };

/** How far a finger has to drag, in CSS pixels, for the same turn as the mouse. Phones are small, so a swipe turns more. */
const LOOK = 1.6;

export class TouchPad {
  on = false;
  /** The player's look speed, from the same slider as the mouse speed. */
  sens = 1;
  private root: HTMLElement;
  private stickBase: HTMLElement; private stickNub: HTMLElement;
  private btns: Record<string, Btn> = {};
  private ctx: HTMLElement; private ctxKey = '';
  private held = new Set<string>();
  /** Which job each finger on the screen is doing. */
  private fingers = new Map<number, { role: 'stick' | 'look' | 'btn' | 'cmd'; x: number; y: number; ox: number; oy: number; btn?: Btn; t0?: number; moved?: boolean }>();
  private sx = 0; private sy = 0;
  /** In the command view: the next tap gives an order (as a right click), or a drag draws a picking box, instead of sliding the ground. */
  private cmdMode: '' | 'order' | 'box' = '';
  /** Frames left before a tap's held left button is let go: the game has to see it down for one update, then up. */
  private relN = 0;
  /** Two fingers on the ground in the command view: how far apart they were when the zoom last stepped. */
  private pinch = 0;

  constructor(parent: HTMLElement, private game: () => Game, private act: { live(): boolean; pause(): void; chat(): void }) {
    const r = this.root = document.createElement('div'); r.id = 'touch'; r.hidden = true;
    r.innerHTML = `<div class="tstick" hidden><i></i></div><div class="tctx"></div>
      <div class="tbar"><button data-b="pause" aria-label="Pause">II</button><button data-b="up">Above</button><button data-b="cbox" class="tc">Box</button><button data-b="corder" class="tc">Order</button><button data-b="carmy" class="tc">Army</button><button data-b="cidle" class="tc">Idle</button><button data-b="cmap" class="tc">Map</button><button data-b="qm">QM</button><button data-b="squad">Squad</button><button data-b="send">Send</button><button data-b="scout">Scout</button><button data-b="ping">Ping</button><button data-b="say">Say</button></div>
      <div class="tleft"><button data-b="tool">Build</button><button data-b="back">Back</button></div>
      <div class="tright">
        <button data-b="fire" class="big">Fire</button><button data-b="aim">Aim</button><button data-b="dash">Dash</button>
        <button data-b="abil">Grenade</button><button data-b="reload">Reload</button><button data-b="jump">Jump</button>
        <button data-b="prev" class="sm">◀</button><button data-b="next" class="sm">▶</button>
      </div>`;
    parent.appendChild(r);
    this.stickBase = r.querySelector('.tstick') as HTMLElement; this.stickNub = this.stickBase.firstElementChild as HTMLElement; this.ctx = r.querySelector('.tctx') as HTMLElement;
    const keys: Record<string, [string, boolean?, boolean?]> = { pause: ['pause'], up: ['up'], cbox: ['cbox'], corder: ['corder'], carmy: ['F2'], cidle: ['F1'], cmap: ['KeyM'], qm: ['KeyG'], squad: ['KeyV'], send: ['Mouse1'], scout: ['KeyH'], ping: ['KeyB'], say: ['say'], tool: ['tool'], back: ['KeyQ'], fire: ['Mouse0', true, true], aim: ['Mouse2', true, true], dash: ['Space'], abil: ['KeyC'], reload: ['KeyR'], jump: ['jump'], prev: ['wheel-'], next: ['wheel+'] };
    r.querySelectorAll('button[data-b]').forEach(e => { const el = e as HTMLButtonElement, id = el.dataset.b!, k = keys[id]; this.btns[id] = { id, el, key: k[0], held: k[1], look: k[2] }; });
    r.addEventListener('pointerdown', e => this.down(e)); r.addEventListener('pointermove', e => this.move(e));
    r.addEventListener('pointerup', e => this.up(e)); r.addEventListener('pointercancel', e => this.up(e)); r.addEventListener('lostpointercapture', e => this.up(e));
    r.addEventListener('contextmenu', e => e.preventDefault());
  }

  enable(on: boolean) { this.on = on; document.body.classList.toggle('touch', on); if (!on) this.reset(); }

  /** Lets go of everything, as when the window loses focus. */
  reset() { const g = this.game(); for (const k of this.held) g.keys.delete(k); this.held.clear(); g.lmb = g.rmb = false; this.fingers.clear(); this.stickBase.hidden = true; this.sx = this.sy = 0; for (const b of Object.values(this.btns)) b.el.classList.remove('on'); }

  private hold(code: string, on: boolean) { const g = this.game(); if (on) { if (!this.held.has(code)) { this.held.add(code); g.keys.add(code); g.pressed.add(code); } } else if (this.held.has(code)) { this.held.delete(code); g.keys.delete(code); } }

  private press(b: Btn, down: boolean) {
    const g = this.game();
    if (b.held) { if (b.key === 'Mouse0') g.lmb = down; else g.rmb = down; if (down) g.pressed.add(b.key); return; }
    if (!down) return;
    switch (b.key) {
      case 'pause': this.act.pause(); return;
      case 'up': g.pressed.add('KeyN'); this.cmdMode = ''; return;
      case 'cbox': this.cmdMode = this.cmdMode === 'box' ? '' : 'box'; return;
      case 'corder': this.cmdMode = this.cmdMode === 'order' ? '' : 'order'; return;
      case 'say': this.act.chat(); return;
      case 'tool': g.pressed.add(g.tool === 2 ? 'Digit1' : 'Digit2'); return;
      case 'jump': if (g.tab) { g.keys.delete('Tab'); this.held.delete('Tab'); } else this.hold('Tab', true); return;
      case 'wheel-': g.wheel = -1; return;
      case 'wheel+': g.wheel = 1; return;
      default: g.pressed.add(b.key);
    }
  }

  private down(e: PointerEvent) {
    if (!this.on || !this.act.live()) return;
    e.preventDefault(); try { this.root.setPointerCapture(e.pointerId); } catch (err) { /* capture is optional */ }
    const t = e.target as HTMLElement, el = t.closest('button') as HTMLButtonElement | null;
    if (el && el.dataset.k) { this.game().pressed.add(el.dataset.k); el.classList.add('on'); this.fingers.set(e.pointerId, { role: 'btn', x: e.clientX, y: e.clientY, ox: 0, oy: 0 }); setTimeout(() => el.classList.remove('on'), 120); return; }
    const b = el && el.dataset.b ? this.btns[el.dataset.b] : undefined;
    if (b) { b.el.classList.add('on'); this.press(b, true); this.fingers.set(e.pointerId, { role: b.look ? 'look' : 'btn', x: e.clientX, y: e.clientY, ox: 0, oy: 0, btn: b }); return; }
    if (this.game().cmd.on) { this.cmdDown(e); return; }
    // The jump cards and build rows are drawn by the HUD underneath this layer.
    const g = this.game(), under = document.elementsFromPoint(e.clientX, e.clientY) as HTMLElement[];
    const card = g.tab ? under.map(u => u.closest('#hud .card')).find(Boolean) : null; if (card) { g.tabSel = Array.from(card.parentElement!.children).indexOf(card); g.keys.delete('Tab'); this.held.delete('Tab'); return; }
    const row = g.tool === 2 ? under.map(u => u.closest('#buildRows > div')).find(Boolean) : null; if (row) { const i = Array.from(row.parentElement!.children).indexOf(row); if (i >= 0) g.buildSel = i; return; }
    // Empty screen: the left side is the move stick, wherever the thumb lands; the rest turns the view.
    const W = innerWidth, H = innerHeight;
    if (e.clientX < W * .45 && e.clientY > H * .3 && ![...this.fingers.values()].some(f => f.role === 'stick')) {
      this.fingers.set(e.pointerId, { role: 'stick', x: e.clientX, y: e.clientY, ox: e.clientX, oy: e.clientY });
      const s = this.stickBase.style; s.left = e.clientX + 'px'; s.top = e.clientY + 'px'; this.stickBase.hidden = false; this.stickNub.style.transform = '';
    } else this.fingers.set(e.pointerId, { role: 'look', x: e.clientX, y: e.clientY, ox: 0, oy: 0 });
  }

  private move(e: PointerEvent) {
    const f = this.fingers.get(e.pointerId); if (!f) return; e.preventDefault();
    const dx = e.clientX - f.x, dy = e.clientY - f.y; f.x = e.clientX; f.y = e.clientY;
    if (f.role === 'cmd') { this.cmdMove(e, f, dx, dy); return; }
    if (f.role === 'look') { const g = this.game(); g.mdx += dx * LOOK * this.sens; g.mdy += dy * LOOK * this.sens; return; }
    if (f.role === 'stick') {
      const R = this.radius(); let x = (e.clientX - f.ox) / R, y = (e.clientY - f.oy) / R; const l = Math.hypot(x, y);
      // Dragging well past the rim pulls the stick along, so the thumb never runs out of room.
      if (l > 1.6) { f.ox += (x / l) * (l - 1.6) * R; f.oy += (y / l) * (l - 1.6) * R; const s = this.stickBase.style; s.left = f.ox + 'px'; s.top = f.oy + 'px'; }
      if (l > 1) { x /= l; y /= l; } this.sx = x; this.sy = y * 1; this.stickNub.style.transform = `translate(${(x * R).toFixed(0)}px,${(y * R).toFixed(0)}px)`;
    }
  }

  private up(e: PointerEvent) {
    const f = this.fingers.get(e.pointerId); if (!f) return; this.fingers.delete(e.pointerId);
    if (f.role === 'cmd') { this.cmdUp(e, f); return; }
    if (f.role === 'stick') { this.sx = this.sy = 0; this.stickBase.hidden = true; }
    if (f.btn) { f.btn.el.classList.remove('on'); this.press(f.btn, false); }
  }

  // ---- the command view by touch. One finger slides the ground; a tap picks (or presses a card button) where it lands; a long press
  // or the Order button gives an order there; Box makes the drag draw a picking box; two fingers pinch to zoom.
  private cursor(x: number, y: number) { const g = this.game(), [hx, hy] = g.hud.toHud(x, y); g.cmd.cx = Math.max(0, Math.min(g.hud.W, hx)); g.cmd.cy = Math.max(0, Math.min(g.hud.H, hy)); }
  private cmdFingers() { return [...this.fingers.values()].filter(f => f.role === 'cmd'); }
  private cmdDown(e: PointerEvent) {
    const g = this.game();
    this.fingers.set(e.pointerId, { role: 'cmd', x: e.clientX, y: e.clientY, ox: e.clientX, oy: e.clientY, t0: performance.now() });
    const fs = this.cmdFingers();
    if (fs.length === 2) { this.pinch = Math.hypot(fs[0].x - fs[1].x, fs[0].y - fs[1].y); for (const f of fs) f.moved = true; g.mmb = false; if (g.lmb && this.cmdMode === 'box') g.lmb = false; return; }
    if (this.cmdMode === 'box') { this.cursor(e.clientX, e.clientY); g.lmb = true; g.pressed.add('Mouse0'); }
  }
  private cmdMove(e: PointerEvent, f: { x: number; y: number; ox: number; oy: number; moved?: boolean }, dx: number, dy: number) {
    const g = this.game(), fs = this.cmdFingers();
    if (fs.length >= 2) {
      const d = Math.hypot(fs[0].x - fs[1].x, fs[0].y - fs[1].y), step = 46;
      if (d - this.pinch > step) { g.wheel = -1; this.pinch = d; } else if (this.pinch - d > step) { g.wheel = 1; this.pinch = d; }
      return;
    }
    if (!f.moved && Math.hypot(e.clientX - f.ox, e.clientY - f.oy) > 12) f.moved = true;
    if (this.cmdMode === 'box') { this.cursor(e.clientX, e.clientY); return; }
    if (f.moved && !g.cmd.map) { g.mmb = true; g.mdx += dx / Math.max(.1, g.sens); g.mdy += dy / Math.max(.1, g.sens); }
  }
  private cmdUp(e: PointerEvent, f: { moved?: boolean; t0?: number }) {
    const g = this.game(); g.mmb = false;
    if (this.cmdFingers().length) return;
    if (this.cmdMode === 'box') { this.cursor(e.clientX, e.clientY); g.lmb = false; return; }
    if (f.moved) return;
    this.cursor(e.clientX, e.clientY);
    const long = performance.now() - (f.t0 || 0) > 450;
    if (this.cmdMode === 'order' || (long && !g.hud.cardAt(g.cmd.cx, g.cmd.cy))) { g.pressed.add('Mouse2'); return; }
    // A tap: the left button goes down for one update and comes up the next, as a click.
    g.lmb = true; g.pressed.add('Mouse0'); this.relN = 2;
  }

  private radius() { return Math.max(40, Math.min(70, Math.min(innerWidth, innerHeight) * .13)); }

  /** Called every frame: turns the stick into movement keys and shows the buttons that mean something right now. */
  frame() {
    if (!this.on) return;
    const live = this.act.live(); this.root.hidden = !live;
    if (!live) { if (this.held.size || this.fingers.size) this.reset(); return; }
    const g = this.game(), x = this.sx, y = this.sy, mag = Math.hypot(x, y);
    if (this.relN > 0 && --this.relN === 0) g.lmb = false;
    const cmd = g.cmd.on; document.body.classList.toggle('tcmdon', cmd);
    if (cmd) {
      if (this.sx || this.sy) { this.sx = this.sy = 0; this.stickBase.hidden = true; for (const k of ['KeyW', 'KeyS', 'KeyA', 'KeyD', 'ShiftLeft']) this.hold(k, false); }
      const show = (id: string, on: boolean, label?: string) => { const b = this.btns[id]; if (b.el.hidden === on) b.el.hidden = !on; if (label && b.el.textContent !== label) b.el.textContent = label; };
      show('up', true, 'Down'); this.btns.cbox.el.classList.toggle('on', this.cmdMode === 'box'); this.btns.corder.el.classList.toggle('on', this.cmdMode === 'order');
      show('cmap', true, g.cmd.map ? 'Close' : 'Map');
      if (this.ctxKey) { this.ctxKey = ''; this.ctx.innerHTML = ''; document.body.classList.remove('tctxon'); }
      return;
    }
    this.cmdMode = '';
    this.hold('KeyW', y < -.38); this.hold('KeyS', y > .38); this.hold('KeyA', x < -.38); this.hold('KeyD', x > .38);
    // Pushing the stick all the way forward sprints.
    this.hold('ShiftLeft', mag > .93 && y < -.8);
    const me = g.me; if (!me) return;
    if (this.btns.up.el.textContent !== 'Above') this.btns.up.el.textContent = 'Above'; this.btns.up.el.hidden = !!g.cmd.locked;   // not hidden while picking a body: the bar would shift under a thumb
    const worker = isWorker(me.kind), f = fac(me.team), building = worker && g.tool === 2, k = me.kind, gun = !!g.weapon();
    const show = (id: string, on: boolean, label?: string) => { const b = this.btns[id]; if (b.el.hidden === on) b.el.hidden = !on; if (label && b.el.textContent !== label) b.el.textContent = label; };
    show('fire', true, building ? 'Place' : worker ? (f === 2 ? 'Chew' : f ? 'Hum' : 'Drill') : k === 'blister' ? 'Burst' : f === 1 ? 'Sing' : f === 2 ? 'Bite' : 'Fire');
    const alt: Record<string, string> = { breacher: 'Shield', gantry: 'Salvo', longshot: 'Scope', linesman: 'Aim', patch: 'Aim', cantor: 'Whirl', lancer: 'Held', warden: 'Low note', snapper: 'Pounce', quillback: 'Fan', mulcher: 'Charge' };
    show('aim', building || worker || !!alt[k], building ? 'Cancel' : worker ? (f === 2 ? 'Snap' : f ? 'Sharp' : 'Kick') : alt[k]);
    show('abil', k === 'linesman' || k === 'patch' || k === 'gantry', k === 'patch' ? 'Patch' : k === 'gantry' ? 'Stomp' : 'Grenade');
    show('reload', building || gun, building ? 'Rotate' : 'Reload');
    show('tool', worker, building ? (f === 2 ? 'Chew' : f ? 'Hum' : 'Drill') : f === 2 ? 'Root' : f ? 'Grow' : 'Build');
    show('prev', building || g.tab); show('next', building || g.tab);
    show('back', !!g.lastBody?.alive && g.lastBody !== me);
    show('dash', !g.tab); show('jump', true, g.tab ? 'Go' : 'Jump');
    const army = g.army(me.team).some(u => u !== me); show('squad', army, g.dir.following(g.dir.side(me.team)) ? 'Home' : 'Squad'); show('send', army); show('scout', !g.story);
    show('ping', !!g.net); show('say', !!g.net);
    this.btns.jump.el.classList.toggle('on', g.tab);
    // Whatever the prompt or the squad offers, as big buttons: train, research, jump into, answer the squad.
    const opts: [string, string][] = [];
    const co = g.dir.side(g.myTeam).callout; if (co && !g.tab) for (const c of co.keys) opts.push([c[0], c[1]]);
    if (g.prompt && !building && !g.tab) { const re = /<b>([A-Z])<\/b>\s*([^<]*)/g; let m: RegExpExecArray | null; while ((m = re.exec(g.prompt))) opts.push([m[1], m[2].replace(/&nbsp;/g, ' ').trim()]); }
    const key = opts.map(o => o.join(':')).join('|');
    if (key !== this.ctxKey) { this.ctxKey = key; document.body.classList.toggle('tctxon', opts.length > 0); this.ctx.innerHTML = opts.map(([k, l]) => `<button data-k="Key${k}">${l.replace(/[<>&]/g, '') || k}</button>`).join(''); }
  }
}

/** Turns keyboard tips ("press F", "hold Tab") into the names of the on-screen buttons. */
export function touchWords(s: string): string {
  return s
    .replace(/\(Tab or F\)/g, '(Jump, or look at one and tap Jump into)')
    .replace(/hold Tab, or look at one and press F/g, 'tap Jump, or look at one and tap Jump into')
    .replace(/([Hh])old Tab and jump/g, (_m, h) => (h === 'H' ? 'T' : 't') + 'ap Jump and jump')
    .replace(/, or hold Tab\./g, ', or tap Jump.')
    .replace(/\bTab into one/g, 'Tap Jump to get into one')
    .replace(/press F to jump in/g, 'tap Jump into').replace(/press F to/g, 'tap Jump into, to').replace(/press F\b/g, 'tap Jump into')
    .replace(/\(press 2, then click\)/g, '(tap Build, then Place)')
    .replace(/([Pp])ress 2\b/g, (_m, p) => (p === 'P' ? 'T' : 't') + 'ap Build')
    .replace(/([Pp])ress G\b/g, (_m, p) => (p === 'P' ? 'T' : 't') + 'ap QM')
    .replace(/press C\b/g, 'tap Patch')
    .replace(/press [ETYU] for an? ([A-Z]\w+), [ETYU] for an? ([A-Z]\w+)/g, 'tap $1 or $2')
    .replace(/press [ETYU] for an? ([A-Z]\w+)/g, 'tap $1')
    .replace(/press [ETYU] to train (\w+)/g, 'tap a button to train $1')
    .replace(/press [ETYU]\b/g, 'tap the button that comes up')
    .replace(/\b[Rr]ight click\b/g, m => m[0] === 'R' ? 'The second button' : 'the second button')
    .replace(/\b([Cc])lick\b/g, (_m, c) => c === 'C' ? 'Tap' : 'tap');
}
