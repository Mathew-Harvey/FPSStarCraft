// The heads-up display: plain HTML over the canvas, laid out in a 900-unit-tall space and scaled to fit.
import * as THREE from 'three';
import type { Game, Unit, Building } from './game';
import { UNIT, BLD, BUILDABLE } from './game';

const $ = (id: string) => document.getElementById(id)!;
const V = new THREE.Vector3();
interface Floater { el: HTMLElement; pos: THREE.Vector3; t: number; life: number }

export class Hud {
  W = 1600; H = 900; scale = 1;
  portraits: Record<string, string> = {};
  private root = $('hud'); private anchors = $('anchors');
  private cache = new Map<string, string>();
  private bars: HTMLElement[] = []; private barFill: HTMLElement[] = []; private labs: HTMLElement[] = [];
  private floats: Floater[] = []; private pingPos = new THREE.Vector3(); private pingT = 0;
  private hurtA = 0; private hitT = 0; private miniT = 0; private last = 0; private feedN = 0;
  private mini = ($('mini') as HTMLCanvasElement).getContext('2d')!;

  constructor() {
    for (let i = 0; i < 48; i++) { const b = document.createElement('div'); b.className = 'hb'; const f = document.createElement('i'); b.appendChild(f); b.hidden = true; this.anchors.appendChild(b); this.bars.push(b); this.barFill.push(f); }
    for (let i = 0; i < 10; i++) { const l = document.createElement('div'); l.className = 'lab'; l.hidden = true; l.appendChild(document.createElement('div')); this.anchors.appendChild(l); this.labs.push(l); }
  }
  setSize(w: number, h: number) {
    this.scale = Math.min(h / 900, w / 1280); this.W = w / this.scale; this.H = h / this.scale;
    const s = this.root.style; s.width = this.W + 'px'; s.height = this.H + 'px'; s.transform = `scale(${this.scale})`;
  }
  show(on: boolean) { this.root.hidden = !on; }
  reset() { $('feed').innerHTML = ''; for (const f of this.floats) f.el.remove(); this.floats = []; this.cache.clear(); this.pingT = 0; this.hurtA = 0; this.titleCard('', ''); $('end').hidden = true; $('lost').hidden = true; }

  /** Sets text or HTML only when it has changed, so the page is not rebuilt every frame. */
  private set(id: string, v: string, html = false) { if (this.cache.get(id) === v) return; this.cache.set(id, v); const e = $(id); if (html) e.innerHTML = v; else e.textContent = v; }
  private cls(id: string, v: string) { const k = 'c:' + id; if (this.cache.get(k) === v) return; this.cache.set(k, v); $(id).className = v; }
  private vis(id: string, on: boolean) { const k = 'h:' + id; const v = on ? '1' : '0'; if (this.cache.get(k) === v) return; this.cache.set(k, v); $(id).hidden = !on; }
  private img(id: string, kind: string) { const k = 'i:' + id; if (this.cache.get(k) === kind) return; this.cache.set(k, kind); const src = this.portraits[kind]; if (src) ($(id) as HTMLImageElement).src = src; }

  feed(who: string, msg: string, cls = '') {
    const box = $('feed'), d = document.createElement('div'); if (cls) d.className = cls; const b = document.createElement('b'); b.textContent = who; d.appendChild(b); d.appendChild(document.createTextNode(msg)); box.appendChild(d);
    while (box.children.length > 4) box.firstElementChild!.remove();
    setTimeout(() => d.classList.add('old'), 6500); setTimeout(() => d.remove(), 7200);
  }
  damage(pos: THREE.Vector3, text: string, cls = '') {
    if (this.floats.length > 28) { const f = this.floats.shift()!; f.el.remove(); }
    const el = document.createElement('div'); el.className = 'fl out ' + cls; el.textContent = text; el.style.opacity = '0'; this.anchors.appendChild(el);
    const life = cls === 'ko' || cls === 'kobad' ? 1.1 : .75; this.floats.push({ el, pos: pos.clone().add(V.set((Math.random() - .5) * .5, 0, (Math.random() - .5) * .5)), t: life, life });
  }
  hurt() { this.hurtA = Math.min(1, this.hurtA + .55); }
  hitmark(crit: boolean) { this.hitT = .14; this.cls('hitm', crit ? 'hitm crit' : 'hitm'); }
  ping(p: THREE.Vector3) { this.pingPos.copy(p); this.pingT = 3; }
  titleCard(name: string, quip: string) { const e = $('tcard'); if (!name) { e.hidden = true; return; } $('tcName').textContent = name; $('tcQuip').textContent = quip; const src = this.portraits[name.toLowerCase()]; if (src) ($('tcImg') as HTMLImageElement).src = src; e.hidden = false; }
  showEnd(g: Game) {
    $('endTitle').textContent = g.won ? 'Paid in full' : 'Shift over'; $('endTitle').className = 'logo sm' + (g.won ? '' : ' bad');
    $('endLine').textContent = g.won ? 'Every Choir Stone is gravel. The Charter thanks you with a smaller invoice.' : 'The Headframe is scrap. The Charter will be billing your next of kin.';
    const m = Math.floor(g.time / 60), s = Math.floor(g.time % 60);
    $('endStats').innerHTML = [[`${m}:${String(s).padStart(2, '0')}`, 'Shift length'], [g.stats.mined, 'Ore dug'], [g.stats.kills, 'Veyl dropped'], [g.stats.lost, 'Crew lost']].map(([a, b]) => `<div><b>${a}</b><span>${b}</span></div>`).join('');
    $('end').hidden = false; this.show(false);
  }

  private project(p: THREE.Vector3, cam: THREE.Camera) { V.copy(p).project(cam); if (V.z > 1 || V.z < -1 || Math.abs(V.x) > 1.15 || Math.abs(V.y) > 1.2) return false; V.x = (V.x * .5 + .5) * this.W; V.y = (-V.y * .5 + .5) * this.H; return true; }

  update(g: Game, cam: THREE.Camera) {
    const now = performance.now() / 1000, dt = Math.min(.1, now - this.last || .016); this.last = now;
    const me = g.me; if (!me) return;
    const tab = g.tab, lost = g.staticT > 0;
    this.vis('hudMain', !tab && !lost); this.vis('jump', tab); this.vis('lost', lost); this.vis('anchors', !lost);
    // top row
    this.set('ore', String(Math.floor(g.ore)));
    const used = g.supplyUsed(), cap = g.supplyCap(); this.set('sup', `${used}/${cap}`); this.cls('resSup', used >= cap ? 'low' : '');
    const m = Math.floor(g.time / 60), s = Math.floor(g.time % 60); this.set('clock', `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`);
    const ph = g.playbookPhase(); this.set('play', `<b>Yard Push</b>` + ['Open', 'Muster', 'Push'].map((n, i) => `<span class="${i === ph ? 'on' : i < ph ? 'dn' : ''}">${n}</span>`).join(''), true);
    const st = g.stones().length; this.set('goal', `Smash the Choir Stones · <em>${st} left</em>`, true);
    this.set('qm', `<span class="k" style="font-size:13px">G</span> Quartermaster <b>${g.auto ? 'Auto' : 'Off'}</b>`, true); this.cls('qm', 'qm c out' + (g.auto ? '' : ' off'));
    // who
    this.set('whoName', UNIT[me.kind].name); this.img('whoImg', me.kind); this.set('whoHp', String(Math.max(0, Math.ceil(me.hp))));
    const hpw = Math.max(0, me.hp / me.maxHp * 100).toFixed(0); if (this.cache.get('hpw') !== hpw) { this.cache.set('hpw', hpw); const b = $('whoBar'); b.style.width = hpw + '%'; b.style.background = +hpw < 35 ? 'var(--red)' : 'var(--grn)'; }
    // tools
    const rig = me.kind === 'rigger'; this.vis('slots', rig); this.vis('ammo', !rig);
    if (rig) this.set('slots', `<div class="${g.tool === 1 ? 'on' : ''}"><b>1</b><span>Drill</span></div><div class="${g.tool === 2 ? 'on' : ''}"><b>2</b><span>Build</span></div>`, true);
    else { this.set('ammoN', g.reloadT > 0 ? '<small>Reloading</small>' : `${g.ammo}<small> / 24</small>`, true); this.cls('ammoN', 'n d out' + (g.ammo <= 6 && g.reloadT <= 0 ? ' low' : '')); }
    const building = rig && g.tool === 2; this.vis('build', building);
    if (building) this.set('buildRows', BUILDABLE.map((k, i) => `<div class="${i === g.buildSel ? 'on' : ''}${g.ore < BLD[k].cost ? ' no' : ''}"><span>${BLD[k].name}</span><span>${BLD[k].cost} ore</span></div>`).join(''), true);
    this.vis('prompt', !!g.prompt && !building); if (g.prompt) this.set('prompt', g.prompt, true);
    this.set('hint', `<span><span class="k">TAB</span> Jump${g.jumpCd > 0 ? ` <span class="cd">${g.jumpCd.toFixed(1)}s</span>` : ''}</span>` + (g.lastBody?.alive ? `<span><span class="k">Q</span> Last body</span>` : '') + (g.own('linesman').length > (me.kind === 'linesman' ? 1 : 0) ? `<span><span class="k">V</span> ${g.following() ? 'Send squad home' : 'Squad on me'}</span>` : ''), true);
    // squad callout and countdown
    const co = g.callout; this.vis('callout', !!co && !tab);
    if (co) { this.set('callWho', co.who); this.set('callText', co.text, true); this.img('callImg', 'linesman'); $('callTm').style.width = Math.max(0, co.t / co.dur * 100) + '%'; }
    const cnt = g.plan?.phase === 'count'; this.vis('count', !!cnt); if (cnt) this.set('countN', 'PUSH IN ' + Math.ceil(g.plan!.t));
    // jump cards
    if (tab) this.set('cards', g.tabList.length ? g.tabList.map((e, i) => `<div class="card${i === g.tabSel ? ' on' : ''}${e.alert ? ' alert' : ''}"><div class="frame"><img src="${this.portraits[e.unit.kind] || ''}" alt=""></div><div class="n d">${e.label}</div><div class="t">${e.task}</div><div class="bar"><i style="width:${(e.hp * 100).toFixed(0)}%;background:${e.hp < .35 ? 'var(--red)' : 'var(--grn)'}"></i></div><span class="k">${i + 1}</span></div>`).join('') : '<div class="none">Nobody else to jump into yet. Train someone first.</div>', true);
    // effects
    this.hurtA = Math.max(0, this.hurtA - dt * 1.2); $('hurt').style.opacity = (this.hurtA + (me.hp / me.maxHp < .3 ? .25 + Math.sin(now * 6) * .1 : 0)).toFixed(2);
    if (this.hitT > 0) { this.hitT -= dt; $('hitm').style.opacity = this.hitT > 0 ? '1' : '0'; }

    // world-anchored bars
    let bi = 0, li = 0;
    const bar = (p: THREE.Vector3, y: number, frac: number, cls: string) => { if (bi >= this.bars.length) return; V.set(p.x, y, p.z); const q = V.clone(); if (!this.project(q, cam)) return; const b = this.bars[bi]; if (b.className !== cls) b.className = cls; b.hidden = false; b.style.transform = `translate(${V.x.toFixed(1)}px,${V.y.toFixed(1)}px)`; this.barFill[bi].style.width = Math.max(0, Math.min(1, frac)) * 100 + '%'; bi++; };
    const lab = (p: THREE.Vector3, y: number, html: string) => { if (li >= this.labs.length) return; const q = new THREE.Vector3(p.x, y, p.z); if (!this.project(q, cam)) return; const l = this.labs[li]; l.hidden = false; l.style.transform = `translate(${Math.max(150, Math.min(this.W - 150, V.x)).toFixed(1)}px,${Math.max(130, V.y).toFixed(1)}px)`; const k = 'l' + li; if (this.cache.get(k) !== html) { this.cache.set(k, html); l.firstElementChild!.innerHTML = html; } li++; };
    for (const u of g.units as Unit[]) {
      if (!u.alive || u === me && !tab) continue; const d = u.pos.distanceTo(me.pos); if (!tab && d > 70) continue;
      const hurtU = u.hp < u.maxHp || u.shield < u.maxShield; if (u.team === 0 && !hurtU && !tab) continue; if (u.team === 1 && !hurtU && d > 40) continue;
      const y = UNIT[u.kind].headY + .75;
      if (u.maxShield && u.shield > 0) bar(u.pos, y + .22, u.shield / u.maxShield, 'hb s');
      bar(u.pos, y, u.hp / u.maxHp, u.team ? 'hb e' : 'hb');
    }
    const near = g.nearestStone(me.pos);
    for (const b of g.buildings as Building[]) {
      if (!b.alive) continue; const d = b.pos.distanceTo(me.pos);
      if (!b.built) { bar(b.pos, BLD[b.kind].h + 1.2, b.progress, 'hb big p'); if (d < 60) lab(b.pos, BLD[b.kind].h + 1.6, `<div class="mark" style="color:var(--cyan)">${BLD[b.kind].name} ${Math.floor(b.progress * 100)}%</div>`); }
      else if (b.hp < b.maxHp && (d < 90 || tab)) bar(b.pos, b.h + 1.2, b.hp / b.maxHp, b.team ? 'hb big e' : 'hb big');
      if (b.kind === 'choir' && d > 45 && !tab) lab(b.pos, b.h + 2, `<div class="mark out">${b === near ? 'Choir Stones · ' + Math.round(d) + 'm' : ''}</div>`);
      if (b.kind === 'headframe' && b.team === 0 && g.time - b.lastHit < 6 && d > 30) lab(b.pos, b.h + 3, `<div class="mark out" style="color:var(--red)">Headframe under attack</div>`);
    }
    if (building) { const k = BUILDABLE[g.buildSel]; lab(g.placePos, BLD[k].h + 1.4, `<div class="tag${g.placeOK ? '' : ' bad'}"><span class="d" style="font-size:30px;color:${g.placeOK ? 'var(--cyan)' : 'var(--red)'}">${BLD[k].name}</span> <span class="d" style="font-size:24px;color:var(--ore);margin-left:14px">${BLD[k].cost} ore</span><div class="c" style="font-size:14px">${g.placeOK ? 'Click place · R rotate · Right-click cancel' : g.ore < BLD[k].cost ? 'Not enough ore' : 'Can\'t build there'}</div></div>`); }
    if (this.pingT > 0) { this.pingT -= dt; lab(this.pingPos, 1.5, `<div class="mark ping out">Squad moving here</div>`); }
    for (let i = bi; i < this.bars.length; i++) if (!this.bars[i].hidden) this.bars[i].hidden = true;
    for (let i = li; i < this.labs.length; i++) if (!this.labs[i].hidden) this.labs[i].hidden = true;
    // floating numbers
    for (let i = this.floats.length - 1; i >= 0; i--) {
      const f = this.floats[i]; f.t -= dt; if (f.t <= 0) { f.el.remove(); this.floats.splice(i, 1); continue; }
      const k = 1 - f.t / f.life, q = new THREE.Vector3(f.pos.x, f.pos.y + k * 1.1, f.pos.z);
      if (!this.project(q, cam)) { f.el.style.opacity = '0'; continue; }
      const pop = k < .15 ? .6 + k / .15 * .6 : 1.2 - Math.min(1, (k - .15) * 2) * .2; f.el.style.opacity = k > .7 ? ((1 - k) / .3).toFixed(2) : '1'; f.el.style.transform = `translate(${V.x.toFixed(1)}px,${V.y.toFixed(1)}px) translate(-50%,-50%) scale(${pop.toFixed(2)}) rotate(-6deg)`;
    }
    // minimap
    this.miniT -= dt; if (this.miniT <= 0) { this.miniT = .12; this.drawMini(g); }
  }

  private drawMini(g: Game) {
    const c = this.mini, S = 260, x0 = -50, z0 = -56, span = 200, k = S / span, X = (x: number) => (x - x0) * k, Z = (z: number) => (z - z0) * k;
    c.fillStyle = '#4a2f29'; c.fillRect(0, 0, S, 180);
    c.strokeStyle = '#6b4a3a'; c.lineWidth = 7; c.beginPath(); c.moveTo(X(4), Z(14)); c.lineTo(X(130), Z(14)); c.stroke();
    c.fillStyle = 'rgba(53,224,200,.16)'; c.beginPath(); c.arc(X(122), Z(13), 20 * k, 0, 7); c.fill();
    c.fillStyle = 'rgba(255,194,26,.13)'; c.beginPath(); c.arc(X(0), Z(0), 30 * k, 0, 7); c.fill();
    for (const s of g.spires) { c.fillStyle = '#2a1a18'; c.beginPath(); c.arc(X(s.x), Z(s.z), Math.max(1.5, s.r * k), 0, 7); c.fill(); }
    for (const o of g.ores) { if (o.amount <= 0) continue; c.fillStyle = '#b8f58c'; c.fillRect(X(o.pos.x) - 2.5, Z(o.pos.z) - 2.5, 5, 5); }
    c.lineWidth = 1.5; c.strokeStyle = '#0e0d14';
    for (const b of g.buildings) { if (!b.alive) continue; const w = Math.max(5, b.hx * 2 * k), h = Math.max(5, b.hz * 2 * k); c.fillStyle = b.team ? '#35e0c8' : b.built ? '#ffc21a' : '#7ef0ff'; c.fillRect(X(b.pos.x) - w / 2, Z(b.pos.z) - h / 2, w, h); c.strokeRect(X(b.pos.x) - w / 2, Z(b.pos.z) - h / 2, w, h); }
    for (const u of g.units) { if (!u.alive || u === g.me) continue; c.fillStyle = u.team ? '#ff4f9a' : u.kind === 'rigger' ? '#8be04e' : '#f4ead2'; c.beginPath(); c.arc(X(u.pos.x), Z(u.pos.z), u.team ? 2.6 : 2.2, 0, 7); c.fill(); }
    if (this.pingT > 0) { c.strokeStyle = '#ffc21a'; c.lineWidth = 2; c.beginPath(); c.arc(X(this.pingPos.x), Z(this.pingPos.z), 5, 0, 7); c.stroke(); }
    const me = g.me; if (me) { c.save(); c.translate(X(me.pos.x), Z(me.pos.z)); c.rotate(-g.yaw); c.fillStyle = '#fff'; c.strokeStyle = '#0e0d14'; c.lineWidth = 1.5; c.beginPath(); c.moveTo(0, 8); c.lineTo(5, -5); c.lineTo(0, -2); c.lineTo(-5, -5); c.closePath(); c.fill(); c.stroke(); c.restore(); }
  }
}
