// The heads-up display: plain HTML over the canvas, laid out in a 900-unit-tall space and scaled to fit.
import { drawMap as drawGround } from './terrain';
import * as THREE from 'three';
import type { Game } from './game';
import { UNIT, BLD, FACTION, SIDE, fac, foeOf, atHome, homeXZ, Kind, Unit, Building, MAP, MAPS, OUTPOST, VHOME, ROAD, NORTH_PATH, roadPt, isWorker } from './data';
import { keyName, abilityWords } from './card';
import { abilitiesOf, whyNot } from './core/ability';
import { isFriend, multi, enemiesOf } from './core/sides';
const capW = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);

const V = new THREE.Vector3();
interface Floater { el: HTMLElement; pos: THREE.Vector3; t: number; life: number }

export class Hud {
  W = 1600; H = 900; scale = 1;
  portraits: Record<string, string> = {};
  /** Colour-blind friendly team colours. */
  cb = false;
  /** Set when keys are rebound: turns the default key printed in a prompt into the key the player chose. */
  keyLabel: ((k: string) => string) | null = null;
  private els = new Map<string, HTMLElement>(); private anchors: HTMLElement;
  /** Status tags over bodies (slowed, stunned, hidden and so on). */
  private sts: HTMLElement[] = [];
  /** Finds a part of this HUD. Split screen has two HUDs with the same parts, so the search starts inside this one. */
  private $(id: string): HTMLElement { let e = this.els.get(id); if (!e) { e = (this.root.querySelector('#' + id) as HTMLElement | null) || document.getElementById(id)!; this.els.set(id, e); } return e; }
  private cache = new Map<string, string>();
  private bars: HTMLElement[] = []; private barFill: HTMLElement[] = []; private labs: HTMLElement[] = [];
  private floats: Floater[] = []; private pingPos = new THREE.Vector3(); private pingT = 0;
  private hurtA = 0; private dirA = 0; private hitT = 0; private miniT = 0; private last = 0; private feedN = 0;
  private mini: CanvasRenderingContext2D; private fogCv: HTMLCanvasElement | null = null; private fogHatch: HTMLCanvasElement | null = null; private hatchPat: CanvasPattern | null = null; private fogImg: ImageData | null = null;

  constructor(private root: HTMLElement = document.getElementById('hud')!) {
    this.anchors = this.$('anchors'); this.mini = (this.$('mini') as HTMLCanvasElement).getContext('2d')!;
    for (let i = 0; i < 48; i++) { const b = document.createElement('div'); b.className = 'hb'; const f = document.createElement('i'); b.appendChild(f); b.hidden = true; this.anchors.appendChild(b); this.bars.push(b); this.barFill.push(f); }
    for (let i = 0; i < 32; i++) { const t = document.createElement('div'); t.className = 'st'; t.hidden = true; this.anchors.appendChild(t); this.sts.push(t); }
    for (let i = 0; i < 24; i++) { const l = document.createElement('div'); l.className = 'lab'; l.hidden = true; l.appendChild(document.createElement('div')); this.anchors.appendChild(l); this.labs.push(l); }
  }
  /** The smallest screen, in HUD pixels, the HUD is laid out for. Touch screens use a smaller one so the text is big enough to read. */
  fit: [number, number] = [1280, 900];
  setSize(w: number, h: number, x = 0, y = 0) {
    this.scale = Math.min(h / this.fit[1], w / this.fit[0]); this.W = w / this.scale; this.H = h / this.scale;
    const s = this.root.style; s.width = this.W + 'px'; s.height = this.H + 'px'; s.transform = `scale(${this.scale})`; s.left = x + 'px'; s.top = y + 'px';
  }
  show(on: boolean) { this.root.hidden = !on; }
  /** Changes the names of the keys printed in prompts, and redraws every prompt with them. */
  relabel(f: ((k: string) => string) | null) { this.keyLabel = f; this.cache.clear(); }
  reset() { this.$('feed').innerHTML = ''; for (const f of this.floats) f.el.remove(); this.floats = []; this.cache.clear(); this.pingT = 0; this.hurtA = 0; this.titleCard('', '', ''); this.$('end').hidden = true; this.$('lost').hidden = true; }

  /** Sets text or HTML only when it has changed, so the page is not rebuilt every frame. */
  /** Rewrites tips that name keys, for a touch screen. */
  words: ((s: string) => string) | null = null;
  private set(id: string, v: string, html = false) { if (this.cache.get(id) === v) return; this.cache.set(id, v); const e = this.$(id); if (this.words && (id === 'objs' || id === 'goal')) v = this.words(v); if (html) e.innerHTML = this.keyLabel ? v.replace(/<(b|span class="k"[^>]*)>(TAB|Tab|Space|RMB|MMB|[A-Z])<\//g, (_m, tag, k) => `<${tag}>${this.keyLabel!(k === 'TAB' ? 'Tab' : k)}</`) : v; else e.textContent = v; }
  private cls(id: string, v: string) { const k = 'c:' + id; if (this.cache.get(k) === v) return; this.cache.set(k, v); this.$(id).className = v; }
  private vis(id: string, on: boolean) { const k = 'h:' + id; const v = on ? '1' : '0'; if (this.cache.get(k) === v) return; this.cache.set(k, v); this.$(id).hidden = !on; }
  private img(id: string, kind: string) { const k = 'i:' + id; if (this.cache.get(k) === kind) return; this.cache.set(k, kind); const src = this.portraits[kind]; if (src) (this.$(id) as HTMLImageElement).src = src; }

  feed(who: string, msg: string, cls = '') {
    const box = this.$('feed'), d = document.createElement('div'); if (cls) d.className = cls; const b = document.createElement('b'); b.textContent = who; d.appendChild(b); d.appendChild(document.createTextNode(this.words ? this.words(msg) : msg)); box.appendChild(d);
    while (box.children.length > 4) box.firstElementChild!.remove();
    setTimeout(() => d.classList.add('old'), 6500); setTimeout(() => d.remove(), 7200);
  }
  damage(pos: THREE.Vector3, text: string, cls = '') {
    if (this.floats.length > 28) { const f = this.floats.shift()!; f.el.remove(); }
    const el = document.createElement('div'); el.className = 'fl out ' + cls; el.textContent = text; el.style.opacity = '0'; this.anchors.appendChild(el);
    const life = cls === 'ko' || cls === 'kobad' ? 1.1 : .75; this.floats.push({ el, pos: pos.clone().add(V.set((Math.random() - .5) * .5, 0, (Math.random() - .5) * .5)), t: life, life });
  }
  hurt(ang: number | null) { this.hurtA = Math.min(1, this.hurtA + .55); if (ang !== null) { this.dirA = 1; this.$('hurtDir').style.transform = `rotate(${(-ang).toFixed(2)}rad)`; } }
  /** The mark over the crosshair when a shot lands. A kill gets a bigger one that an ordinary hit in the same breath does not replace. */
  hitmark(crit: boolean, kill = false) { if (!kill && this.killMark && this.hitT > .08) return; this.killMark = kill; this.hitT = kill ? .3 : .15; this.hitFlip = !this.hitFlip; this.cls('hitm', 'hitm' + (kill ? ' kill' : crit ? ' crit' : '') + (this.hitFlip ? ' a' : ' b')); }
  private killMark = false; private hitFlip = false;
  streak(text: string) { const e = this.$('streak'); e.textContent = text; e.hidden = false; e.style.animation = 'none'; void e.offsetWidth; e.style.animation = ''; clearTimeout(this.streakTimer); this.streakTimer = setTimeout(() => { e.hidden = true; }, 1300) as any; }
  private streakTimer = 0;
  ping(p: THREE.Vector3, text = 'Squad moving here') { this.pingPos.copy(p); this.pingT = 3; this.pingText = text; }
  private pingText = 'Squad moving here';
  titleCard(kind: string, name: string, quip: string) { const e = this.$('tcard'); if (!name) { e.hidden = true; return; } this.$('tcName').textContent = name; this.$('tcQuip').textContent = quip; this.$('tcSide').textContent = (UNIT[kind as Kind]?.team || 0) === 2 ? 'The Gloam · a mouth of the swarm' : UNIT[kind as Kind]?.team ? 'Veyl Chorus · a voice you borrow' : 'Ironhold Charter · now under your control'; const src = this.portraits[kind]; if (src) (this.$('tcImg') as HTMLImageElement).src = src; e.hidden = false; }
  showEnd(g: Game) {
    this.$('endTitle').textContent = g.won ? (g.story ? 'Job done' : 'Paid in full') : 'Shift over'; this.$('endTitle').className = 'logo sm' + (g.won ? '' : ' bad');
    this.$('endLine').textContent = g.won && g.story ? g.story.outro : !g.won && g.story?.fail ? (typeof g.story.fail === 'function' ? g.story.fail(g) : g.story.fail) : g.won ? (fac(foeOf(g.myTeam)) === 0 ? 'The other crew\'s last Headframe is scrap. The Charter only needed one of you.' : fac(foeOf(g.myTeam)) === 2 ? 'Every Mother Cap is mulch and the green carpet is drying out. The Charter thanks you with a smaller invoice.' : 'Every Choir Stone is gravel. The Charter thanks you with a smaller invoice.') : g.story && fac(g.myTeam) === 1 ? 'Your last Choir Stone is gravel. The job is lost.' : g.story && fac(g.myTeam) === 2 ? 'Your last Mother Cap is mulch. The job is lost.' : 'The Headframe is scrap. The Charter will be billing your next of kin.';
    if (g.story) { /* a story job keeps its own closing line, whichever side the player was on */ }
    else if (fac(g.myTeam) === 2) { this.$('endTitle').textContent = g.won ? 'The valley is soil' : 'Withered'; this.$('endLine').textContent = g.won ? 'Every Headframe is chewed to scrap. The Bloom runs to the horizon, and the Gloam are fat and quiet.' : 'Every Mother Cap is mulch. The Bloom is drying out, but spores are patient.'; }
    else if (fac(g.myTeam)) { this.$('endTitle').textContent = g.won ? 'The last verse' : 'Out of tune'; this.$('endLine').textContent = g.won ? 'Every Headframe is scrap and the valley is quiet again. The Chorus holds the note.' : 'Every Choir Stone is gravel. The singing has stopped, for now.'; }
    if (!g.won) {
      // Say what did the damage and what answers it, so a loss teaches something.
      const top = Object.entries(!atHome(g.myTeam) ? g.stats.lostToV : g.stats.lostTo).sort((a, b) => b[1] - a[1])[0], why: Record<string, string> = {
        thornspire: 'Most of your crew fell to Thorn Spires. A Longshot out-ranges them: clear the Spires before the squad walks in.',
        choir: 'Most of your crew fell beside the Choir Stones, which sting anything near them. Bring a Patch and break one Stone at a time.',
        cantor: 'Most of your crew fell to Cantors. They have to reach you first: rifles and Watchposts cut them down on the way in.',
        lancer: 'Most of your crew fell to Lancers. They wear down a Gantry and anything standing still, so put a Breacher in front and a Longshot behind.',
        snapper: 'Most of your crew fell to Snappers. They come cheap and in pairs: a Breacher in front and a grenade into the pack beats them.', quillback: 'Most of your crew fell to Quillbacks. They spit from range and back off, so a Longshot or a Gantry out-trades them.', blister: 'Most of your crew fell to Blisters. Shoot them before they arrive and do not bunch up.', mulcher: 'Most of your crew fell to a Mulcher. It charges in a straight line: step aside, then pour fire into it.', stinger: 'Most of your crew fell to Stinger Stalks. They only reach close: Longshots and Gantries can clear them from outside.', mothercap: 'Most of your crew fell beside a Mother Cap. Its fronds lash anything near, so break the outlying buildings first.',
        warden: 'Most of your crew fell to a Warden. It walks through Breachers and Gantries: bring Longshots and a mixed squad.' };
      const vwhy: Record<string, string> = { watchpost: 'Most of the Chorus fell to Watchposts. Lancers out-range a crowd of Cantors on a tower: send them first, or go round by the ridge.', headframe: 'Most of the Chorus fell beside a Headframe. Its rivet gun is slow: bring enough voices to finish it in one march.', longshot: 'Longshots picked the Chorus apart. Cantors close the distance fast; send them in first and keep the Lancers behind.', gantry: 'A Gantry broke the Chorus. Lancers wear it down from range, and a Warden walks straight through it.', breacher: 'Breachers held the line. Lancers shoot over the shields, and a Warden\'s slam ignores them.' };
      const gwhy: Record<string, string> = { watchpost: 'Most of the swarm fell to Watchposts. Blisters break a tower cheaply: send three at once.', headframe: 'Most of the swarm fell beside a Headframe. Bring Quillbacks to work it down from range.', breacher: 'Breachers held the line. Quillbacks shoot over the shields, and a Mulcher charge knocks them aside.', gantry: 'A Gantry stomped the swarm. Spread out, and send Blisters into it.', linesman: 'Linesmen shot the swarm down on the way in. Pounce from behind cover, and grow Thick Hide early.' };
      const tip = fac(g.myTeam) === 2 ? (top && gwhy[top[0]]) || 'More mouths win. Keep every Mother Cap ripening Buds, root a second Cap early, and swarm when the Swarm Lead asks.' : fac(g.myTeam) ? (top && vwhy[top[0]]) || 'A mixed Chorus beats any one answer. Grow a second Brood Pit early, learn Keener Edges, and march when the Chorus Lead asks.' : top && why[top[0]];
      if (tip) this.$('endLine').textContent += ' ' + tip;
    }
    const m = Math.floor(g.time / 60), s = Math.floor(g.time % 60);
    this.$('endStats').innerHTML = [[`${m}:${String(s).padStart(2, '0')}`, 'Shift length'], [Math.floor(!atHome(g.myTeam) ? g.stats.minedV : g.stats.mined), fac(g.myTeam) === 2 ? 'Ore chewed' : fac(g.myTeam) ? 'Ore hummed' : 'Ore dug'], [g.stats.built, 'Buildings up'], [g.stats.kills, !atHome(g.myTeam) ? (fac(g.myTeam) === 2 ? 'Gloam lost' : fac(g.myTeam) ? 'Voices lost' : 'Crew lost') : fac(SIDE.out) === 2 ? 'Gloam squashed' : fac(SIDE.out) ? 'Veyl dropped' : 'Rivals dropped'], [g.stats.lost, !atHome(g.myTeam) ? (fac(g.myTeam) ? 'Crew broken' : 'Rivals dropped') : 'Crew lost']].map(([a, b]) => `<div><b>${a}</b><span>${b}</span></div>`).join('');
    this.$('end').hidden = false; this.show(false);
  }

  private project(p: THREE.Vector3, cam: THREE.Camera) { V.copy(p).project(cam); if (V.z > 1 || V.z < -1 || Math.abs(V.x) > 1.15 || Math.abs(V.y) > 1.2) return false; V.x = (V.x * .5 + .5) * this.W; V.y = (-V.y * .5 + .5) * this.H; return true; }

  update(g: Game, cam: THREE.Camera) {
    const now = performance.now() / 1000, dt = Math.min(.1, now - this.last || .016); this.last = now;
    const me = g.me; if (!me) return;
    const C = g.cmd, cv = C.on, tab = g.tab, lost = g.staticT > 0 && !cv, ref = cv ? C.focus : me.pos;
    if (this.cache.get('cv') !== (cv ? '1' : '0')) { this.cache.set('cv', cv ? '1' : '0'); this.root.classList.toggle('cmdv', cv); } this.command(g, cv);
    this.vis('hudMain', !tab && !lost); this.vis('jump', tab); this.vis('lost', lost); this.vis('anchors', !lost);
    // top row
    const side = g.myTeam, F = FACTION[side], cash = g.cash(side); this.set('ore', String(Math.floor(cash)));
    // Supply is out of 200 at most, however many supply buildings stand. Flux is the second resource; it reads 0 until the side has any.
    const used = g.supplyUsed(side), cap = Math.min(200, g.supplyCap(side)); this.set('sup', `${used}/${cap}`); this.cls('resSup', used >= cap ? 'low' : '');
    this.set('flux', String(Math.floor(g.flux(side))));
    // The driven body's abilities: key, name, and what stops it now (energy or the wait).
    { const list = !cv && !tab ? abilitiesOf(me.kind) : []; this.vis('abil', list.length > 0);
      if (list.length) this.set('abil', list.map(a => { const w = whyNot(g, me, a.key, { x: me.pos.x, z: me.pos.z }), why = w === 'energy' || w === 'cooldown' || w === 'busy' || w === 'cannot act' ? abilityWords(w, a, me) : '', cd = me.abCd?.[a.key] ?? 0;
        return `<div class="${why ? 'off' : ''}"><span class="k">${keyName(a.hotkey === 'Mouse0' ? 'LMB' : a.hotkey === 'Mouse2' ? 'RMB' : a.hotkey.length === 1 ? a.hotkey : a.hotkey)}</span><b>${a.name}</b><small>${why || [a.energy ? a.energy + ' energy' : '', a.cd ? a.cd + ' s' : ''].filter(Boolean).join(' · ') || 'Ready'}</small>${cd > 0 && a.cd ? `<i style="width:${(100 - cd / a.cd * 100).toFixed(0)}%"></i>` : ''}</div>`; }).join(''), true); }
    const m = Math.floor(g.time / 60), s = Math.floor(g.time % 60); { const ot = g.overtime(); this.set('clock', `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` + (ot > 0 ? `<small>Overtime · buildings take +${Math.round(ot * 100)}%</small>` : ''), true); this.cls('clock', 'clock d out' + (ot > 0 ? ' ot' : '')); }
    const D = g.dir, S = D.side(side), pb = S.playbook, ph = pb.idx;
    // The squad's playbook means nothing until there is a squad: in the first minutes (and all of Job 1) it was a strip of jargon over the tutorial.
    this.vis('play', ph > 0 || !!S.plan || g.army(side).length > 0); this.set('play', `<b>${pb.name}</b>` + pb.steps.map((n, i) => `<span class="${i === ph ? 'on' : i < ph ? 'dn' : ''}">${n}</span>`).join(''), true);
    const st = g.stones().length, sq = g.army(side).length, hfs = g.ownB('headframe').length; { const n = g.ledCount(); this.set('whoSub', 'You · ' + F.name + (n ? ` · leading ${n}` : '')); } const foe = foeOf(side), fq = FACTION[foe].hq, nq = g.ownB(fq, false, foe).length; const clock = g.story && g.ms.clock !== undefined && g.ms.clock >= 0 ? ` · <em>${g.story.clockLabel || 'Clock'} ${Math.floor(g.ms.clock / 60)}:${String(Math.floor(g.ms.clock % 60)).padStart(2, '0')}</em>` : '';
    // On a hidden map the count is of the ones your side has seen: the true count would tell you they had expanded before any scout did.
    const nk = MAP.hid ? g.intel.known(side).filter(b => b.kind === fq).length : nq;
    if (g.eco && !g.story && MAP.hid && !g.intel.knows(side)) this.set('goal', `Find the ${FACTION[foe].short} · <em>nobody has seen them</em>` + (sq ? ` · ${['Squad', 'Chorus', 'Swarm'][fac(side)]} ${sq}` : ''), true);
    else if (g.eco && !g.story && multi()) { const n = enemiesOf(g.myTeam).filter(t => !g.outOf.includes(t)).reduce((k, t) => k + g.hqs(t, false).length, 0); this.set('goal', `Break every enemy home building · <em>${n} standing</em>` + (sq ? ` · ${['Squad', 'Chorus', 'Swarm'][fac(side)]} ${sq}` : ''), true); }
    else if (g.eco && !g.story) this.set('goal', `${['Break', 'Silence', 'Squash'][fac(foe)]} ${nk > 1 ? 'every ' + BLD[fq].name : 'the ' + BLD[fq].name} · <em>${MAP.hid ? nk ? nk + ' seen' : 'not seen yet' : nk + ' standing'}</em>` + (sq ? ` · ${['Squad', 'Chorus', 'Swarm'][fac(side)]} ${sq}` : ''), true); else if (g.story) { const next = D.objectives().find(o => !o.done); this.set('goal', (next ? next.text : 'Job done') + clock + (sq ? ` · ${['Squad', 'Chorus', 'Swarm'][fac(side)]} ${sq}` : ''), true); } else this.set('goal', `${SIDE.out === 2 ? 'Squash the Mother Caps' : 'Smash the Choir Stones'} · <em>${st} left</em>` + (sq ? ` · Squad ${sq}` : ''), true);
    this.set('qm', `<span class="k" style="font-size:13px">G</span> ${F.voice} <b>${S.auto ? 'Auto' : 'Off'}</b>`, true); this.cls('qm', 'qm c out' + (S.auto ? '' : ' off'));
    // who
    this.set('whoName', UNIT[me.kind].name); this.img('whoImg', me.kind); this.set('whoHp', String(Math.max(0, Math.ceil(me.hp))));
    const hpw = Math.max(0, me.hp / me.maxHp * 100).toFixed(0); if (this.cache.get('hpw') !== hpw) { this.cache.set('hpw', hpw); const b = this.$('whoBar'); b.style.width = hpw + '%'; b.style.background = +hpw < 35 ? 'var(--red)' : 'var(--grn)'; }
    // tools
    const rig = isWorker(me.kind), vt = fac(me.team) === 1, gt = fac(me.team) === 2; this.vis('slots', rig); this.vis('ammo', !rig);
    if (rig) this.set('slots', `<div class="${g.tool === 1 ? 'on' : ''}"><b>1</b><span>${gt ? 'Chew' : vt ? 'Hum' : 'Drill'}${g.tool === 1 ? (gt ? ' · RMB snap' : vt ? ' · RMB sharp note' : ' · RMB kick') : ''}</span></div><div class="${me.carrying >= g.packCap(me.team) ? 'on' : ''}"><b>${me.carrying}</b><span>/ ${g.packCap(me.team)} ore in the ${gt ? 'belly' : vt ? 'sling' : 'pack'}</span></div><div class="${g.tool === 2 ? 'on' : ''}"><b>2</b><span>${gt ? 'Root' : vt ? 'Grow' : 'Build'}</span></div>`, true);
    else if (gt) { this.set('ammoN', g.chargeT > 0 ? '<small>Charging</small>' : g.vWind > 0 ? '<small>...</small>' : g.fireCd > 0 && me.kind !== 'blister' ? '<small>...</small>' : '<small>Ready</small>', true); this.cls('ammoN', 'n d out'); this.set('ammoL', (me.kind === 'snapper' ? 'Bite · <span class="k">RMB</span> Pounce ' : me.kind === 'quillback' ? 'Quill · <span class="k">RMB</span> Quill fan ' : me.kind === 'mulcher' ? 'Tusk sweep · <span class="k">RMB</span> Charge ' : 'Click to burst. You will need a new body after') + (me.kind === 'blister' ? '' : g.vCd > 0 ? Math.ceil(g.vCd) + 's' : 'ready'), true); }
    else if (vt) { this.set('ammoN', g.vWind > 0 ? '<small>Winding</small>' : g.fireCd > 0 ? '<small>...</small>' : '<small>Ready</small>', true); this.cls('ammoN', 'n d out'); this.set('ammoL', (me.kind === 'cantor' ? `Chorus Blades${g.combo ? ' · <b style="color:var(--yel)">Crescendo ' + g.combo + '</b>' : ''} · <span class="k">RMB</span> Whirl ` : me.kind === 'lancer' ? 'Long Note · <span class="k">RMB</span> Held Note ' : 'Ground slam · <span class="k">RMB</span> Low Note ') + (g.vCd > 0 ? Math.ceil(g.vCd) + 's' : 'ready'), true); }
    else { const w = g.weapon()!; this.set('ammoN', g.reloadT > 0 ? '<small>Reloading</small>' : `${g.ammo}<small> / ${w.mag}</small>`, true); this.cls('ammoN', 'n d out' + (g.ammo <= w.mag / 4 && g.reloadT <= 0 ? ' low' : '')); this.set('ammoL', me.kind === 'longshot' ? `Long Rifle · <span class="k">RMB</span> Scope` : me.kind === 'patch' ? `Rivet Pistol · shoot friends to mend · <span class="k">C</span> Patch-up ${g.nadeCd > 0 ? Math.ceil(g.nadeCd) + 's' : 'ready'}` : me.kind === 'gantry' ? `Autocannon · <span class="k">RMB</span> Salvo ${g.salvoCd > 0 ? Math.ceil(g.salvoCd) + 's' : 'ready'} · <span class="k">C</span> Stomp ${g.nadeCd > 0 ? Math.ceil(g.nadeCd) + 's' : 'ready'}` : me.kind === 'breacher' ? `Scattergun · <span class="k">RMB</span> Shield${g.brace ? ' up · click to bash' : ''}${g.payback > .3 ? ' · <b style="color:var(--yel)">Payback ' + Math.round(g.payback * 80) + '%</b>' : ''}` : `Rifle · <span class="k">C</span> Grenade ${g.nadeCd > 0 ? Math.ceil(g.nadeCd) + 's' : 'ready'}`, true); }
    this.cls('cross', 'cross' + (me.kind === 'breacher' || me.kind === 'gantry' ? ' ring' : (me.kind === 'linesman' || me.kind === 'patch') && g.ads > .6 ? ' dot' : me.kind === 'longshot' && g.ads > .6 ? ' scope' : ''));
    { const b = (1 + g.bloom * .9 + (me.moving ? .12 : 0)).toFixed(2); if (this.cache.get('bloom') !== b) { this.cache.set('bloom', b); this.$('cross').style.scale = b; } }
    const building = rig && g.tool === 2, blist = FACTION[me.team].builds; this.vis('build', building);
    if (building) this.set('buildRows', blist.map((k, i) => { const lock = !g.unlocked(k, me.team), miss = g.missing(k, me.team); return `<div class="${i === g.buildSel ? 'on' : ''}${lock ? ' lock' : cash < BLD[k].cost ? ' no' : ''}"><span>${BLD[k].name}<small>${lock ? (miss.length ? 'Needs ' + miss.map(n => BLD[n].name).join(' and ') : 'Not on this job') : BLD[k].blurb}</small></span><span>${lock ? 'locked' : BLD[k].cost + ' ore'}</span></div>`; }).join(''), true);
    this.vis('prompt', !!g.prompt && !building); if (g.prompt) this.set('prompt', g.prompt, true);
    this.set('hint', `<span><span class="k">TAB</span> Jump${g.jumpCd > 0 ? ` <span class="cd">${g.jumpCd.toFixed(1)}s</span>` : ''}</span>` + (g.lastBody?.alive ? `<span><span class="k">Q</span> Last body</span>` : '') + (g.army(side).some(u => u !== me) ? `<span><span class="k">V</span> ${D.following(S) ? 'Send squad home' : 'Squad on me'}</span><span><span class="k">MMB</span> Send</span>` : '') + (!g.story ? `<span><span class="k">H</span> Scout</span>` : '') + `<span><span class="k">N</span> Command</span><span><span class="k">M</span> Map</span>`, true);
    // squad callout and countdown
    const co = S.callout; this.vis('callout', !!co && !tab);
    if (co) { this.set('callKeys', co.keys.map(k => `<span><b>${k[0]}</b>${k[1]}</span>`).join(''), true); this.set('callWho', co.who); this.set('callText', co.text, true); this.img('callImg', F.lead); this.$('callTm').style.width = Math.max(0, co.t / co.dur * 100) + '%'; }
    const cnt = S.plan?.phase === 'count'; this.vis('count', !!cnt); if (cnt) { this.set('countN', (fac(side) === 2 ? 'SWARM IN ' : fac(side) ? 'SING IN ' : 'GO IN ') + Math.ceil(S.plan!.t)); this.set('countL', S.plan!.label); }
    const raid = !side && !g.eco && D.raidIn < 15 && g.stones().length > 0 && !co && !cnt; this.vis('raid', raid); if (raid) this.set('raid', `Raid in ${Math.max(0, Math.ceil(D.raidIn))} · ${D.raidDir === 'north' ? capW(MAP.flankName) : capW(MAP.road)}`);
    const objs = D.objectives(), teach = g.story ? true : !(objs[0].done && objs[1].done && objs[2].done) && g.time < 600; this.vis('objs', teach && !building && !C.map); if (teach) this.set('objs', `<h6>${g.story ? g.story.tag + ' · ' + g.story.name : fac(side) ? 'First verse' : 'First shift'}</h6>` + objs.map(o => `<div class="${o.done ? 'dn' : ''}">${o.text}</div>`).join(''), true);
    let boss: Unit | null = null; for (const u of g.units) if (u.alive && (u.kind === 'warden' || u.kind === 'gantry') && u.team !== side && u.pos.distanceTo(me.pos) < 70) { boss = u; break; }
    this.vis('boss', !!boss && !co && !cnt && !raid); if (boss) { this.$('bossHp').style.width = (boss.hp / boss.maxHp * 100).toFixed(1) + '%'; this.$('bossSh').style.width = (boss.shield / boss.maxShield * 100).toFixed(1) + '%'; }
    // jump cards
    if (tab) this.set('cards', g.tabList.length ? g.tabList.map((e, i) => `<div class="card${i === g.tabSel ? ' on' : ''}${e.alert ? ' alert' : ''}"><div class="frame"><img src="${this.portraits[e.unit.kind] || ''}" alt=""></div><div class="n d">${e.label}</div><div class="t">${e.task}</div><div class="bar"><i style="width:${(e.hp * 100).toFixed(0)}%;background:${e.hp < .35 ? 'var(--red)' : 'var(--grn)'}"></i></div><span class="k">${i + 1}</span></div>`).join('') : '<div class="none">Nobody else to jump into yet. Train someone first.</div>', true);
    // effects
    this.dirA = Math.max(0, this.dirA - dt * 1.1); this.$('hurtDir').style.opacity = this.dirA.toFixed(2); this.hurtA = Math.max(0, this.hurtA - dt * 1.2); this.$('hurt').style.opacity = (this.hurtA + (me.hp / me.maxHp < .3 ? .25 + Math.sin(now * 6) * .1 : 0)).toFixed(2);
    if (this.hitT > 0) { this.hitT -= dt; this.$('hitm').style.opacity = this.hitT > 0 ? '1' : '0'; }

    // world-anchored bars
    let bi = 0, li = 0, si = 0;
    const bar = (p: THREE.Vector3, y: number, frac: number, cls: string) => { if (bi >= this.bars.length) return; V.set(p.x, y, p.z); const q = V.clone(); if (!this.project(q, cam)) return; const b = this.bars[bi]; if (b.className !== cls) b.className = cls; b.hidden = false; b.style.transform = `translate(${V.x.toFixed(1)}px,${V.y.toFixed(1)}px)`; this.barFill[bi].style.width = Math.max(0, Math.min(1, frac)) * 100 + '%'; bi++; };
    const lab = (p: THREE.Vector3, y: number, html: string) => { if (li >= this.labs.length) return; const q = new THREE.Vector3(p.x, y, p.z); if (!this.project(q, cam)) return; const l = this.labs[li]; l.hidden = false; l.style.transform = `translate(${Math.max(150, Math.min(this.W - 150, V.x)).toFixed(1)}px,${Math.max(130, V.y).toFixed(1)}px)`; const k = 'l' + li; if (this.cache.get(k) !== html) { this.cache.set(k, html); l.firstElementChild!.innerHTML = html; } li++; };
    for (const p of g.pings) lab(V.set(p.x, 0, p.z).clone(), 2.2, `<div class="mark ping out">${g.names[p.pid] || 'Ping'} · ${Math.round(Math.hypot(p.x - me.pos.x, p.z - me.pos.z))}m</div>`);
    for (const u of g.units as Unit[]) {
      if (!u.alive || u === me && !tab && !cv || !u.obj.visible) continue; const d = u.pos.distanceTo(ref), sel = cv && C.sel.has(u);
      if (u.pilot && u !== me && g.names[u.pilot] && d < (u.team === g.myTeam ? 120 : 30)) lab(u.pos, UNIT[u.kind].headY + 1.25, `<div class="mark out" style="color:var(--yel)">${g.names[u.pilot]}</div>`);
      if (!tab && !sel && d > Math.max(70, cv ? C.h * 2.2 : 0)) continue;
      if (u.status && u.status.length && si < this.sts.length) { const w = statusWords(u); if (w) { V.set(u.pos.x, UNIT[u.kind].headY + 1.15, u.pos.z); if (this.project(V, cam)) { const t = this.sts[si++]; t.hidden = false; t.style.transform = `translate(${V.x.toFixed(1)}px,${V.y.toFixed(1)}px)`; const cls = 'st ' + w[1]; if (t.className !== cls) t.className = cls; if (t.textContent !== w[0]) t.textContent = w[0]; } } }
      const hurtU = u.hp < u.maxHp || u.shield < u.maxShield; if (u.team === g.myTeam && !hurtU && !tab && !sel) continue; if (u.team !== g.myTeam && !hurtU && d > 40) continue;
      const y = UNIT[u.kind].headY + .75;
      if (u.maxShield && u.shield > 0) bar(u.pos, y + .22, u.shield / u.maxShield, 'hb s');
      bar(u.pos, y, u.hp / u.maxHp, u.team === g.myTeam ? 'hb' : isFriend(u.team, g.myTeam) ? 'hb f' : 'hb e');
      // Energy, for bodies that cast: under the health bar, own side only.
      { const me2 = u as any; if (me2.maxEnergy > 0 && u.team === g.myTeam) bar(u.pos, y - .2, me2.energy / me2.maxEnergy, 'hb n'); }
    }
    const foeT = foeOf(side), near = g.nearestStone(me.pos), nearHF = g.eco ? g.ownB(FACTION[foeT].hq, false, foeT).filter(b => g.fog.seen(b.pos.x, b.pos.z)).sort((a, b) => a.pos.distanceTo(me.pos) - b.pos.distanceTo(me.pos))[0] : null;
    for (const b of g.buildings as Building[]) {
      if (!b.alive || !b.obj.visible) continue; const d = cv ? 1 : b.pos.distanceTo(me.pos);
      if (!b.built) { bar(b.pos, BLD[b.kind].h + 1.2, b.progress, 'hb big p'); if (d < 60) lab(b.pos, BLD[b.kind].h + 1.6, `<div class="mark" style="color:var(--cyan)">${BLD[b.kind].name} ${Math.floor(b.progress * 100)}%</div>`); }
      else if (b.hp < b.maxHp && (d < 90 || tab)) bar(b.pos, b.h + 1.2, b.hp / b.maxHp, b.team === g.myTeam ? 'hb big' : isFriend(b.team, g.myTeam) ? 'hb big f' : 'hb big e');
      if (cv && b.team === side && b.built) {
        // From above, each of the player's buildings says what it is making, and each base how its seams are worked.
        const q = b.queue, hq = b.kind === FACTION[side].hq, sat = hq ? this.saturation(g, b) : null;
        const parts = [C.selB === b ? BLD[b.kind].name : '', q.length && b.kind !== 'mothercap' ? `${UNIT[q[0].kind].name} ${Math.floor((1 - q[0].t / UNIT[q[0].kind].time) * 100)}%${q.length > 1 ? ' · +' + (q.length - 1) : ''}` : '', sat ? `<span class="sat ${sat.cls}">Workers ${sat.n}/${sat.want} · ${sat.word}</span>` : ''].filter(Boolean);
        if (parts.length && (C.selB === b || d < 200)) lab(b.pos, b.h + 2.4, `<div class="mark out" style="color:var(--cyan)">${parts.join('<br>')}</div>`);
      }
      if (b.kind === 'wardpylon' && d < 110 && !tab && !building && !cv) lab(b.pos, b.h + 1.6, `<div class="mark out" style="color:var(--cyan)">Ward Pylon · shielding the base</div>`);
      if (!g.eco && b.kind === FACTION[SIDE.out].hq && b.team === SIDE.out && !side && d > 45 && !tab && !building && !cv && g.fog.seen(b.pos.x, b.pos.z)) lab(b.pos, b.h + 2, `<div class="mark out">${b === near ? (SIDE.out === 2 ? 'Mother Caps · ' : 'Choir Stones · ') + Math.round(d) + 'm' : ''}</div>`);
      if (b === nearHF && d > 45 && !tab && !building && !cv) lab(b.pos, b.h + 3, `<div class="mark out">${BLD[b.kind].name} · ${Math.round(d)}m</div>`);
      if (b.kind === FACTION[side].hq && b.team === side && g.time - b.lastHit < 6 && (d > 30 || cv)) lab(b.pos, b.h + 3, `<div class="mark out" style="color:var(--red)">${BLD[b.kind].name} under attack</div>`);
    }
    if (building) { const k = blist[g.buildSel] || blist[0]; lab(g.placePos, BLD[k].h + 1.4, `<div class="tag${g.placeOK ? '' : ' bad'}"><span class="d" style="font-size:30px;color:${g.placeOK ? 'var(--cyan)' : 'var(--red)'}">${BLD[k].name}</span> <span class="d" style="font-size:24px;color:var(--ore);margin-left:14px">${BLD[k].cost} ore</span><div class="c" style="font-size:14px">${g.placeOK ? 'Click place · R rotate · Right-click cancel' : cash < BLD[k].cost ? 'Not enough ore' : 'Can\'t build there'}</div></div>`); }
    if (this.pingT > 0) { this.pingT -= dt; lab(this.pingPos, 1.5, `<div class="mark ping out">${this.pingText}</div>`); }
    for (let i = bi; i < this.bars.length; i++) if (!this.bars[i].hidden) this.bars[i].hidden = true;
    for (let i = li; i < this.labs.length; i++) if (!this.labs[i].hidden) this.labs[i].hidden = true;
    for (let i = si; i < this.sts.length; i++) if (!this.sts[i].hidden) this.sts[i].hidden = true;
    // floating numbers
    for (let i = this.floats.length - 1; i >= 0; i--) {
      const f = this.floats[i]; f.t -= dt; if (f.t <= 0) { f.el.remove(); this.floats.splice(i, 1); continue; }
      const k = 1 - f.t / f.life, q = new THREE.Vector3(f.pos.x, f.pos.y + k * 1.1, f.pos.z);
      if (!this.project(q, cam)) { f.el.style.opacity = '0'; continue; }
      const pop = k < .15 ? .6 + k / .15 * .6 : 1.2 - Math.min(1, (k - .15) * 2) * .2; f.el.style.opacity = k > .7 ? ((1 - k) / .3).toFixed(2) : '1'; f.el.style.transform = `translate(${V.x.toFixed(1)}px,${V.y.toFixed(1)}px) translate(-50%,-50%) scale(${pop.toFixed(2)}) rotate(-6deg)`;
    }
    // minimap
    this.miniT -= dt; if (this.miniT <= 0) { this.miniT = .12; this.drawMap(g, this.mini, false); if (C.map) this.drawMap(g, this.big || (this.big = (this.$('bigmapC') as HTMLCanvasElement).getContext('2d')!), true); this.crew(g); }
  }

  private crew(g: Game) {
    const el = this.$('crew'); if (!g.net) { if (!el.hidden) el.hidden = true; return; }
    const html = Object.keys(g.names).map(k => { const id = +k, u = (g.units as Unit[]).find(x => x.alive && x.pilot === id), s = g.score[id] || [0, 0, 0]; return `<div class="${id === g.net!.id ? 'me' : ''}${g.teams[id] ? ' v' : ''}"><b>${g.names[id]}</b><span>${u ? UNIT[u.kind].name : 'Down'}</span><em>${s[0]} kills · ${s[1]} ore</em></div>`; }).join('');
    if (this.cache.get('crew') !== html) { this.cache.set('crew', html); el.innerHTML = html; } el.hidden = false;
  }
  private big: CanvasRenderingContext2D | null = null; private wasMap = false; private face = ''; private bm = { x0: 0, z0: 0, k: 1, l: 0, t: 0, w: 1, h: 1 }; private hatchBig: HTMLCanvasElement | null = null;
  /** The command view's own parts: the cursor, the box being dragged, what is picked, and the full map. */
  private command(g: Game, on: boolean) {
    this.vis('cmdUI', on); if (!on) return; const C = g.cmd, map = C.map;
    this.$('ccur').style.transform = `translate(${C.cx.toFixed(1)}px,${C.cy.toFixed(1)}px)`;
    const bx = C.box; this.vis('cbox', !!bx); if (bx) { const s = this.$('cbox').style; s.left = bx[0] + 'px'; s.top = bx[1] + 'px'; s.width = bx[2] - bx[0] + 'px'; s.height = bx[3] - bx[1] + 'px'; }
    this.vis('bigmap', map); this.vis('cpan', !map); if (map !== this.wasMap) { this.wasMap = map; this.miniT = 0; }
    if (map) { const w = Math.min(this.W - 140, (this.H - 190) / .6923), h = w * .6923, l = (this.W - w) / 2, t = (this.H - h) / 2 - 6, k = `${w.toFixed(0)}|${l.toFixed(0)}|${t.toFixed(0)}`; this.bm.l = l; this.bm.t = t; this.bm.w = w; this.bm.h = h; if (this.cache.get('bmR') !== k) { this.cache.set('bmR', k); const s = this.$('bigmap').style; s.left = l + 'px'; s.top = t + 'px'; s.width = w + 'px'; s.height = h + 'px'; } }
    if (!C.mapPt) C.mapPt = (x, y) => { const m = this.bm, lx = (x - m.l) / m.w * 260, lz = (y - m.t) / m.h * 180; return lx < 0 || lz < 0 || lx > 260 || lz > 180 ? null : [m.x0 + lx / m.k, m.z0 + lz / m.k]; };
    // what is picked
    let html = '';
    if (C.selB) {
      const b = C.selB, q = b.queue, r = C.rally.get(b);
      html = `<h4>${BLD[b.kind].name}</h4><div class="hpl"><i style="width:${(b.hp / b.maxHp * 100).toFixed(0)}%"></i></div>` + (!b.built ? `<p>Going up · ${Math.floor(b.progress * 100)}%</p>` : '');
      // The queue: five slots, the first one filling as it trains. A click on a slot takes it off and pays the ore back.
      if (b.built && g.sells(b) && b.kind !== 'mothercap') html += `<div class="queue">${[0, 1, 2, 3, 4].map(i => { const e = q[i]; return e ? `<div class="qs" data-cb="q:${i}" title="Click to cancel"><img src="${this.portraits[e.kind] || ''}" alt=""><span>${UNIT[e.kind].name}</span>${i === 0 ? `<em><i style="width:${Math.floor((1 - e.t / UNIT[e.kind].time) * 100)}%"></i></em>` : ''}</div>` : '<div class="qs none"></div>'; }).join('')}</div>`;
      if (b.kind === 'mothercap') html += `<p>${b.buds || 0} Bud${b.buds === 1 ? '' : 's'} ripe${q.length ? ` · ${q.length} hatching` : ''}</p>`;
      if (b.built && g.sells(b)) html += `<p>${r ? (r.ore !== undefined ? 'Rally: new workers go to a seam' : r.id ? 'Rally: new bodies go to a body' : 'Rally: new bodies gather at a spot') : 'No rally point: new bodies stay by the door'}<br><b>Right click</b> set the rally point</p>`;
      else if (b.built) html += '<p>Nothing to order here</p>';
    }
    else if (C.sel.size) {
      const by = new Map<Kind, number>(); let hp = 0, max = 0; for (const u of C.sel) { by.set(u.kind, (by.get(u.kind) || 0) + 1); hp += u.hp; max += u.maxHp; }
      const queued = [...C.sel].reduce((n, u) => n + (C.queue.get(u)?.length || 0), 0);
      html = `<h4>${C.sel.size === 1 ? UNIT[[...by.keys()][0]].name : C.sel.size + ' picked'}</h4><div class="hpl"><i style="width:${(hp / Math.max(1, max) * 100).toFixed(0)}%"></i></div>` + (C.sel.size > 1 ? `<div class="kinds">${[...by].map(([k, n]) => `<span>${UNIT[k].name} ×${n}</span>`).join('')}</div>` : '') + `<p><b>Right click</b> go, attack, mine or build${queued ? ` · ${queued} more order${queued > 1 ? 's' : ''} lined up` : ''}<br><b>Shift</b> + right click adds an order after the last one<br><b>Ctrl</b> + a number keeps them as a group</p>`;
    } else {
      const bases = g.ownB(FACTION[g.myTeam].hq, true, g.myTeam).map(b => this.saturation(g, b));
      html = `<h4>Command view</h4><p>Click one of yours, or drag a box round several.<br>Click a building to order from it.<br><b>F1</b> idle worker · <b>F2</b> every fighter</p>` + (bases.length ? `<div class="bases">${bases.map((s, i) => `<span class="sat ${s.cls}">Base ${i + 1}: ${s.n}/${s.want} workers · ${s.word}</span>`).join('')}</div>` : '');
    }
    this.set('cpan', html, true);
    // The command card: one button per order, with its key, greyed with the reason when it cannot be given now.
    const cards = C.card; this.vis('ccard', !map && cards.length > 0);
    if (cards.length) this.set('ccard', cards.map((b, i) => `<div class="cb${b.off ? ' off' : ''}${b.on ? ' on' : ''}${i === C.padFocus ? ' pf' : ''}" data-cb="${b.id}"><span class="k">${keyName(b.key)}</span>${b.icon && this.portraits[b.icon] ? `<img src="${this.portraits[b.icon]}" alt="">` : ''}<b>${b.label}</b><small>${b.off || b.sub}</small></div>`).join(''), true);
    const aim = C.aim; this.set('caim', aim ? (aim.k === 'stake' ? `<b>Click</b> stake out the ${BLD[aim.b].name} · <b>R</b> turn it · <b>Shift</b> keep staking · <b>Right click</b> stop` : `<b>Click</b> ${aim.k === 'move' ? 'where to go' : aim.k === 'patrol' ? 'the far end of the patrol' : aim.k === 'gather' ? 'a seam to work' : aim.k === 'board' ? 'one of our carriers or bunkers to get into' : aim.k === 'ab' ? `where to use ${aim.name}` : 'the rally point: ground, a body or a seam'} · <b>Shift</b> line up more · <b>Right click</b> stop`) : '', true); this.vis('caim', !!aim);
    this.set('cnote', map ? '<b>Click</b> look there · <b>Right click</b> send the picked crew · <b>M</b> close' : `Your crew fight without your bonus while you are up here`, true);
    this.set('ckeysBar', map ? '' : '<span><span class="k">Wheel</span> Zoom, all the way in to jump</span><span><span class="k">MMB</span> Hold to slide</span><span><span class="k">M</span> Map</span><span><span class="k">N</span> Back to your body</span>', true);
  }
  /** How a base's seams are worked: two workers a seam is full, three is all a seam can use. */
  saturation(g: Game, hq: Building) {
    const seams = g.ores.filter(o => o.amount > 0 && Math.hypot(o.pos.x - hq.pos.x, o.pos.z - hq.pos.z) < 26), want = seams.length * 2, most = seams.length * 3;
    const n = g.units.filter(u => u.alive && u.team === hq.team && isWorker(u.kind) && ((u.node && seams.includes(u.node)) || (u.pref && seams.includes(u.pref)) || (u.state === 'toHQ' && Math.hypot(u.pos.x - hq.pos.x, u.pos.z - hq.pos.z) < 30))).length;
    const cls = !seams.length ? 'dry' : n > most ? 'over' : n >= want ? 'full' : 'short', word = !seams.length ? 'no ore left' : n > most ? `${n - most} too many` : n >= want ? 'full' : `${want - n} short`;
    return { n, want, most, cls, word };
  }
  /** The card button or queue slot under a spot in HUD pixels, by its id, or null. */
  /** A point on the page (CSS pixels) in HUD pixels, where the command view keeps its cursor. */
  toHud(x: number, y: number): [number, number] { const R = this.root.getBoundingClientRect(); return [(x - R.left) / this.scale, (y - R.top) / this.scale]; }
  cardAt(x: number, y: number): string | null {
    if (this.root.hidden) return null; const R = this.root.getBoundingClientRect(), cx = R.left + x * this.scale, cy = R.top + y * this.scale;
    for (const e of this.root.querySelectorAll<HTMLElement>('#cmdUI [data-cb]')) { const r = e.getBoundingClientRect(); if (r.width && cx >= r.left && cx <= r.right && cy >= r.top && cy <= r.bottom) return e.dataset.cb || null; }
    return null;
  }
  private drawMap(g: Game, c: CanvasRenderingContext2D, big: boolean) {
    const q = big ? 4 : 1; c.setTransform(q, 0, 0, q, 0, 0);
    // framed on everything worth finding: the yard, the outpost, both routes and every ore field
    // On a hidden map the frame is a circle round your own base, wide enough to hold the other base wherever it is, so the frame gives nothing away.
    // Once they are found it slides over to sit between the two bases.
    const hid = !!MAP.hid, I = g.intel, mi = I.ix(g.myTeam), knows = I.knows(g.myTeam), [mhx, mhz] = homeXZ(g.myTeam), [fhx, fhz] = homeXZ(foeOf(g.myTeam));
    const reach = Math.hypot(VHOME.x, VHOME.z) + 45, fcx = knows ? (mhx + fhx) / 2 : mhx, fcz = knows ? (mhz + fhz) / 2 : mhz;
    const pts = hid ? [[fcx - reach * 1.45, fcz - reach], [fcx + reach * 1.45, fcz + reach]] : [[0, 0], [OUTPOST.x, OUTPOST.z], ...NORTH_PATH, ...(MAP.sites || [])], bx0 = Math.min(...pts.map(p => p[0])) - 26, bx1 = Math.max(...pts.map(p => p[0])) + 26, bz0 = Math.min(...pts.map(p => p[1])) - 22, bz1 = Math.max(...pts.map(p => p[1])) + 22;
    const S = 260, span = Math.max(bx1 - bx0, (bz1 - bz0) / .69), x0 = (bx0 + bx1) / 2 - span / 2, z0 = (bz0 + bz1) / 2 - span * .345, k = S / span, X = (x: number) => (x - x0) * k, Z = (z: number) => (z - z0) * k;
    const fog = g.fog; fog.update(g, .12);
    c.fillStyle = '#4a2f29'; c.fillRect(0, 0, S, 180);
    c.strokeStyle = '#6b4a3a'; c.lineWidth = hid ? Math.max(2, 7 * k) : 7; c.beginPath(); if (hid) for (const r of MAP.roads || []) { c.moveTo(X(r[0]), Z(r[1])); c.lineTo(X(r[2]), Z(r[3])); } else { const a = roadPt(4), b = roadPt(ROAD.len + 6); c.moveTo(X(a[0]), Z(a[1])); c.lineTo(X(b[0]), Z(b[1])); } c.stroke();
    if (!hid) { c.fillStyle = 'rgba(53,224,200,.16)'; c.beginPath(); c.arc(X(OUTPOST.x - 2 * ROAD.dx), Z(OUTPOST.z - 2 * ROAD.dz), 20 * k, 0, 7); c.fill(); }
    c.fillStyle = 'rgba(255,194,26,.13)'; c.beginPath(); c.arc(X(hid ? mhx : 0), Z(hid ? mhz : 0), 30 * k, 0, 7); c.fill();
    for (const s of g.spires) { c.fillStyle = '#2a1a18'; c.beginPath(); c.arc(X(s.x), Z(s.z), Math.max(1.5, s.r * k), 0, 7); c.fill(); }
    drawGround(c, X, Z, k, g.myTeam, (x, z) => fog.seen(x, z));   // terrain (J): high ground, ramps, rock walls, vents, beacons
    // the fog: black where nobody has been, dimmed where nobody is looking now
    { const n = fog.n, cv = this.fogCv || (this.fogCv = document.createElement('canvas')); if (cv.width !== n) { cv.width = cv.height = n; this.fogImg = null; } const cx = cv.getContext('2d')!, img = this.fogImg || (this.fogImg = cx.createImageData(n, n)), d = img.data;
      for (let i = 0; i < fog.cells.length; i++) { const v = fog.cells[i]; d[i * 4] = 22; d[i * 4 + 1] = 15; d[i * 4 + 2] = 14; d[i * 4 + 3] = v === 2 ? 0 : v === 1 ? 105 : 236; }
      cx.putImageData(img, 0, 0);
      // Ground nobody has seen is hatched like the blank part of a survey sheet, rather than left as a black slab.
      const hc = big ? this.hatchBig || (this.hatchBig = document.createElement('canvas')) : this.fogHatch || (this.fogHatch = document.createElement('canvas')); if (hc.width !== S * q) { hc.width = S * q; hc.height = 180 * q; } const hx = hc.getContext('2d')!; hx.setTransform(q, 0, 0, q, 0, 0);
      if (!this.hatchPat) { const t = document.createElement('canvas'); t.width = t.height = 9; const tg = t.getContext('2d')!; tg.fillStyle = '#211614'; tg.fillRect(0, 0, 9, 9); tg.strokeStyle = '#4a332c'; tg.lineWidth = 1.3; tg.beginPath(); tg.moveTo(-1, 10); tg.lineTo(10, -1); tg.moveTo(-1, 1); tg.lineTo(1, -1); tg.moveTo(8, 10); tg.lineTo(10, 8); tg.stroke(); this.hatchPat = hx.createPattern(t, 'repeat'); }
      hx.globalCompositeOperation = 'source-over'; hx.clearRect(0, 0, S, 180); hx.imageSmoothingEnabled = true; if (hid) { hx.fillStyle = 'rgba(22,15,14,.925)'; hx.fillRect(0, 0, S, 180); hx.clearRect(X(fog.x0), Z(fog.z0), n * 4 * k, n * 4 * k); }   // past the edge of the world is as unknown as anywhere else
      hx.drawImage(cv, X(fog.x0), Z(fog.z0), n * 4 * k, n * 4 * k);
      hx.globalCompositeOperation = 'source-in'; hx.fillStyle = this.hatchPat || '#211614'; hx.fillRect(0, 0, S, 180); c.drawImage(hc, 0, 0, S, 180); }
    for (const o of g.ores) { if (o.amount <= 0 || !fog.seen(o.pos.x, o.pos.z)) continue; c.fillStyle = '#b8f58c'; c.fillRect(X(o.pos.x) - 2.5, Z(o.pos.z) - 2.5, 5, 5); }
    c.lineWidth = 1.5; c.strokeStyle = '#0e0d14';
    // Allies' buildings (a team game): in blue, always known.
    for (const b of g.buildings) { if (!b.alive || b.team === g.myTeam || !isFriend(b.team, g.myTeam)) continue; const w = Math.max(5, b.hx * 2 * k), h = Math.max(5, b.hz * 2 * k); c.fillStyle = FRIEND; c.fillRect(X(b.pos.x) - w / 2, Z(b.pos.z) - h / 2, w, h); c.strokeRect(X(b.pos.x) - w / 2, Z(b.pos.z) - h / 2, w, h); }
    for (const b of g.buildings) { if (!b.alive || b.team !== g.myTeam) continue; const w = Math.max(5, b.hx * 2 * k), h = Math.max(5, b.hz * 2 * k); c.fillStyle = b.built ? '#ffc21a' : '#7ef0ff'; c.fillRect(X(b.pos.x) - w / 2, Z(b.pos.z) - h / 2, w, h); c.strokeRect(X(b.pos.x) - w / 2, Z(b.pos.z) - h / 2, w, h); }
    // Their buildings are drawn as your side last saw them: a new one shows when somebody looks at it, and a fallen one stays until somebody looks again.
    for (const r of I.seen[mi].values()) { const B = BLD[r.kind], w = Math.max(5, B.hx * 2 * k), h = Math.max(5, B.hz * 2 * k); c.fillStyle = r.kind === 'reedgate' ? '#c58bff' : '#35e0c8'; c.fillRect(X(r.x) - w / 2, Z(r.z) - h / 2, w, h); c.strokeRect(X(r.x) - w / 2, Z(r.z) - h / 2, w, h); }
    for (const u of g.units) { if (!u.alive || (u === g.me && !g.cmd.on) || (u.team !== g.myTeam && !isFriend(u.team, g.myTeam) && !fog.sees(u.pos.x, u.pos.z))) continue; const foeU = u.team !== g.myTeam, ally = foeU && isFriend(u.team, g.myTeam); c.fillStyle = ally ? FRIEND : foeU ? (u.kind === 'tender' ? '#c58bff' : this.cb ? '#ff9d1a' : '#ff4f9a') : isWorker(u.kind) ? (this.cb ? '#4da3ff' : '#8be04e') : '#f4ead2'; c.beginPath(); c.arc(X(u.pos.x), Z(u.pos.z), u.kind === 'warden' ? 5 : foeU ? 2.6 : 2.2, 0, 7); c.fill(); }
    for (const p of g.pings) { c.strokeStyle = '#ffc21a'; c.lineWidth = 2.5; c.beginPath(); c.arc(X(p.x), Z(p.z), 4 + (8 - p.t) % 1 * 7, 0, 7); c.stroke(); }
    for (const u of g.units) if (u.alive && u.pilot && u !== g.me && u.team === g.myTeam) { c.fillStyle = '#ffc21a'; c.strokeStyle = '#0e0d14'; c.lineWidth = 1.5; c.beginPath(); c.arc(X(u.pos.x), Z(u.pos.z), 3.6, 0, 7); c.fill(); c.stroke(); }
    const D = g.dir; if (g.myTeam === SIDE.home && !g.eco && (D.raidIn < 15 || D.raidLive) && g.stones().length && Math.floor(performance.now() / 300) % 2) { c.fillStyle = '#ff4b3a'; c.strokeStyle = '#0e0d14'; c.lineWidth = 2; c.beginPath(); { const n = NORTH_PATH.length, p = D.raidDir === 'north' ? [(NORTH_PATH[n - 1][0] + NORTH_PATH[n - 2][0]) / 2, (NORTH_PATH[n - 1][1] + NORTH_PATH[n - 2][1]) / 2] : roadPt(62), a = Math.atan2(-p[1], -p[0]); c.moveTo(X(p[0]) + Math.cos(a) * 9, Z(p[1]) + Math.sin(a) * 9); c.lineTo(X(p[0]) + Math.cos(a + 2.4) * 8, Z(p[1]) + Math.sin(a + 2.4) * 8); c.lineTo(X(p[0]) + Math.cos(a - 2.4) * 8, Z(p[1]) + Math.sin(a - 2.4) * 8); } c.closePath(); c.fill(); c.stroke(); }
    if (this.pingT > 0) { c.strokeStyle = '#ffc21a'; c.lineWidth = 2; c.beginPath(); c.arc(X(this.pingPos.x), Z(this.pingPos.z), 5, 0, 7); c.stroke(); }
    if (hid) { const rd = I.read(g.myTeam), txt = knows ? 'THEM: ' + rd.short.toUpperCase() : 'NOT FOUND · H SENDS A SCOUT'; c.fillStyle = 'rgba(14,13,20,.82)'; c.fillRect(0, 161, S, 19); c.fillStyle = knows ? '#35e0c8' : '#ffc21a'; c.font = '700 14px "Barlow Condensed", sans-serif'; c.textBaseline = 'middle'; c.textAlign = 'left'; c.fillText(txt, 8, 171); }
    const me = g.me, C = g.cmd;
    // picked bodies are ringed, and the ground the command view is looking at is framed
    if (C.on) { c.strokeStyle = '#7ef0ff'; c.lineWidth = 1.2; for (const u of C.sel) { c.beginPath(); c.arc(X(u.pos.x), Z(u.pos.z), 4, 0, 7); c.stroke(); } }
    if (C.on && !C.map) { const p = new THREE.Vector3(), pts: number[][] = []; for (const [sx, sy] of [[0, 0], [this.W, 0], [this.W, this.H], [0, this.H]]) if (C.ground(sx, sy, p)) pts.push([X(p.x), Z(p.z)]); if (pts.length === 4) { c.strokeStyle = '#fff'; c.lineWidth = 1.5; c.beginPath(); pts.forEach((pt, i) => i ? c.lineTo(pt[0], pt[1]) : c.moveTo(pt[0], pt[1])); c.closePath(); c.stroke(); } }
    if (me && me.alive && !(C.on && g.net && me.pilot !== g.net.id)) { c.save(); c.translate(X(me.pos.x), Z(me.pos.z)); c.rotate(-g.yaw); c.fillStyle = '#fff'; c.strokeStyle = '#0e0d14'; c.lineWidth = 1.5; c.beginPath(); c.moveTo(0, 8); c.lineTo(5, -5); c.lineTo(0, -2); c.lineTo(-5, -5); c.closePath(); c.fill(); c.stroke(); c.restore(); }
    if (!big) return;
    // the full map names what is on it
    this.bm.x0 = x0; this.bm.z0 = z0; this.bm.k = k;
    const name = (x: number, z: number, t: string, col: string) => { c.font = `700 5.6px ${this.face || (this.face = getComputedStyle(this.root).fontFamily || 'sans-serif')}`; t = t.toUpperCase(); c.textAlign = 'center'; c.lineJoin = 'round'; c.lineWidth = 1.8; c.strokeStyle = '#0e0d14'; c.strokeText(t, X(x), Z(z)); c.fillStyle = col; c.fillText(t, X(x), Z(z)); };
    for (const b of g.buildings) { if (!b.alive || b.team !== g.myTeam || b.kind !== FACTION[b.team].hq) continue; name(b.pos.x, b.pos.z - b.hz - 4 / k, BLD[b.kind].name, '#ffc21a'); }
    // theirs as the crew last saw them
    for (const r of I.seen[mi].values()) { if (r.kind !== FACTION[foeOf(g.myTeam)].hq) continue; name(r.x, r.z - BLD[r.kind].hz - 4 / k, 'Enemy ' + BLD[r.kind].name, '#35e0c8'); }
    if (me && me.alive) name(me.pos.x, me.pos.z + 12 / k, g.net?.watch ? g.names[me.pilot] || 'Watching' : 'You', '#fff');
  }
}

/** What a body's statuses say over its head, most telling first, and whether that is bad or good for the body. */
const ST_WORDS: Record<string, [string, string]> = { stun: ['Stunned', 'bad'], root: ['Rooted', 'bad'], blind: ['Blind', 'bad'], slow: ['Slowed', 'bad'], burning: ['Burning', 'bad'], borrowed: ['Taken over', 'bad'], revealed: ['Seen', 'bad'], lifted: ['Lifted', 'bad'], shielded: ['Shielded', 'good'], dug: ['Dug in', 'good'], unseen: ['Hidden', 'good'] };
const ST_ORDER = ['stun', 'borrowed', 'root', 'lifted', 'blind', 'slow', 'burning', 'revealed', 'shielded', 'dug', 'unseen'];
export function statusWords(u: Unit): [string, string] | null {
  const on = (u.status || []).filter(x => x.t > 0).map(x => x.k as string); if (!on.length) return null;
  on.sort((a, b) => ST_ORDER.indexOf(a) - ST_ORDER.indexOf(b));
  const first = ST_WORDS[on[0]] || [on[0], ''], more = on.length > 1 ? ' +' + (on.length - 1) : '';
  return [first[0] + more, first[1]];
}

/** Allies in a team game, on the map and their health bars. */
const FRIEND = '#5ab4ff';
