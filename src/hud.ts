// The heads-up display: plain HTML over the canvas, laid out in a 900-unit-tall space and scaled to fit.
import * as THREE from 'three';
import type { Game } from './game';
import { UNIT, BLD, FACTION, SIDE, fac, foeOf, atHome, Kind, Unit, Building, MAP, MAPS, OUTPOST, ROAD, NORTH_PATH, roadPt, isWorker } from './data';
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
    for (let i = 0; i < 10; i++) { const l = document.createElement('div'); l.className = 'lab'; l.hidden = true; l.appendChild(document.createElement('div')); this.anchors.appendChild(l); this.labs.push(l); }
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
  ping(p: THREE.Vector3) { this.pingPos.copy(p); this.pingT = 3; }
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
    const tab = g.tab, lost = g.staticT > 0;
    this.vis('hudMain', !tab && !lost); this.vis('jump', tab); this.vis('lost', lost); this.vis('anchors', !lost);
    // top row
    const side = g.myTeam, F = FACTION[side], cash = g.cash(side); this.set('ore', String(Math.floor(cash)));
    const used = g.supplyUsed(side), cap = g.supplyCap(side); this.set('sup', `${used}/${cap}`); this.cls('resSup', used >= cap ? 'low' : '');
    const m = Math.floor(g.time / 60), s = Math.floor(g.time % 60); this.set('clock', `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`);
    const D = g.dir, S = D.side(side), pb = S.playbook, ph = pb.idx;
    // The squad's playbook means nothing until there is a squad: in the first minutes (and all of Job 1) it was a strip of jargon over the tutorial.
    this.vis('play', ph > 0 || !!S.plan || g.army(side).length > 0); this.set('play', `<b>${pb.name}</b>` + pb.steps.map((n, i) => `<span class="${i === ph ? 'on' : i < ph ? 'dn' : ''}">${n}</span>`).join(''), true);
    const st = g.stones().length, sq = g.army(side).length, hfs = g.ownB('headframe').length; this.set('whoSub', 'You · ' + F.name); const foe = foeOf(side), fq = FACTION[foe].hq, nq = g.ownB(fq, false, foe).length; const clock = g.story && g.ms.clock !== undefined && g.ms.clock >= 0 ? ` · <em>${g.story.clockLabel || 'Clock'} ${Math.floor(g.ms.clock / 60)}:${String(Math.floor(g.ms.clock % 60)).padStart(2, '0')}</em>` : '';
    if (g.eco && !g.story) this.set('goal', `${['Break', 'Silence', 'Squash'][fac(foe)]} ${nq > 1 ? 'every ' + BLD[fq].name : 'the ' + BLD[fq].name} · <em>${nq} standing</em>` + (sq ? ` · ${['Squad', 'Chorus', 'Swarm'][fac(side)]} ${sq}` : ''), true); else if (g.story) { const next = D.objectives().find(o => !o.done); this.set('goal', (next ? next.text : 'Job done') + clock + (sq ? ` · ${['Squad', 'Chorus', 'Swarm'][fac(side)]} ${sq}` : ''), true); } else this.set('goal', `${SIDE.out === 2 ? 'Squash the Mother Caps' : 'Smash the Choir Stones'} · <em>${st} left</em>` + (sq ? ` · Squad ${sq}` : ''), true);
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
    this.set('hint', `<span><span class="k">TAB</span> Jump${g.jumpCd > 0 ? ` <span class="cd">${g.jumpCd.toFixed(1)}s</span>` : ''}</span>` + (g.lastBody?.alive ? `<span><span class="k">Q</span> Last body</span>` : '') + (g.army(side).some(u => u !== me) ? `<span><span class="k">V</span> ${D.following(S) ? 'Send squad home' : 'Squad on me'}</span><span><span class="k">MMB</span> Send</span>` : ''), true);
    // squad callout and countdown
    const co = S.callout; this.vis('callout', !!co && !tab);
    if (co) { this.set('callKeys', co.keys.map(k => `<span><b>${k[0]}</b>${k[1]}</span>`).join(''), true); this.set('callWho', co.who); this.set('callText', co.text, true); this.img('callImg', F.lead); this.$('callTm').style.width = Math.max(0, co.t / co.dur * 100) + '%'; }
    const cnt = S.plan?.phase === 'count'; this.vis('count', !!cnt); if (cnt) { this.set('countN', (fac(side) === 2 ? 'SWARM IN ' : fac(side) ? 'SING IN ' : 'GO IN ') + Math.ceil(S.plan!.t)); this.set('countL', S.plan!.label); }
    const raid = !side && !g.eco && D.raidIn < 15 && g.stones().length > 0 && !co && !cnt; this.vis('raid', raid); if (raid) this.set('raid', `Raid in ${Math.max(0, Math.ceil(D.raidIn))} · ${D.raidDir === 'north' ? capW(MAP.flankName) : capW(MAP.road)}`);
    const objs = D.objectives(), teach = g.story ? true : !(objs[0].done && objs[1].done && objs[2].done) && g.time < 600; this.vis('objs', teach && !building); if (teach) this.set('objs', `<h6>${g.story ? g.story.tag + ' · ' + g.story.name : fac(side) ? 'First verse' : 'First shift'}</h6>` + objs.map(o => `<div class="${o.done ? 'dn' : ''}">${o.text}</div>`).join(''), true);
    let boss: Unit | null = null; for (const u of g.units) if (u.alive && (u.kind === 'warden' || u.kind === 'gantry') && u.team !== side && u.pos.distanceTo(me.pos) < 70) { boss = u; break; }
    this.vis('boss', !!boss && !co && !cnt && !raid); if (boss) { this.$('bossHp').style.width = (boss.hp / boss.maxHp * 100).toFixed(1) + '%'; this.$('bossSh').style.width = (boss.shield / boss.maxShield * 100).toFixed(1) + '%'; }
    // jump cards
    if (tab) this.set('cards', g.tabList.length ? g.tabList.map((e, i) => `<div class="card${i === g.tabSel ? ' on' : ''}${e.alert ? ' alert' : ''}"><div class="frame"><img src="${this.portraits[e.unit.kind] || ''}" alt=""></div><div class="n d">${e.label}</div><div class="t">${e.task}</div><div class="bar"><i style="width:${(e.hp * 100).toFixed(0)}%;background:${e.hp < .35 ? 'var(--red)' : 'var(--grn)'}"></i></div><span class="k">${i + 1}</span></div>`).join('') : '<div class="none">Nobody else to jump into yet. Train someone first.</div>', true);
    // effects
    this.dirA = Math.max(0, this.dirA - dt * 1.1); this.$('hurtDir').style.opacity = this.dirA.toFixed(2); this.hurtA = Math.max(0, this.hurtA - dt * 1.2); this.$('hurt').style.opacity = (this.hurtA + (me.hp / me.maxHp < .3 ? .25 + Math.sin(now * 6) * .1 : 0)).toFixed(2);
    if (this.hitT > 0) { this.hitT -= dt; this.$('hitm').style.opacity = this.hitT > 0 ? '1' : '0'; }

    // world-anchored bars
    let bi = 0, li = 0;
    const bar = (p: THREE.Vector3, y: number, frac: number, cls: string) => { if (bi >= this.bars.length) return; V.set(p.x, y, p.z); const q = V.clone(); if (!this.project(q, cam)) return; const b = this.bars[bi]; if (b.className !== cls) b.className = cls; b.hidden = false; b.style.transform = `translate(${V.x.toFixed(1)}px,${V.y.toFixed(1)}px)`; this.barFill[bi].style.width = Math.max(0, Math.min(1, frac)) * 100 + '%'; bi++; };
    const lab = (p: THREE.Vector3, y: number, html: string) => { if (li >= this.labs.length) return; const q = new THREE.Vector3(p.x, y, p.z); if (!this.project(q, cam)) return; const l = this.labs[li]; l.hidden = false; l.style.transform = `translate(${Math.max(150, Math.min(this.W - 150, V.x)).toFixed(1)}px,${Math.max(130, V.y).toFixed(1)}px)`; const k = 'l' + li; if (this.cache.get(k) !== html) { this.cache.set(k, html); l.firstElementChild!.innerHTML = html; } li++; };
    for (const p of g.pings) lab(V.set(p.x, 0, p.z).clone(), 2.2, `<div class="mark ping out">${g.names[p.pid] || 'Ping'} · ${Math.round(Math.hypot(p.x - me.pos.x, p.z - me.pos.z))}m</div>`);
    for (const u of g.units as Unit[]) {
      if (!u.alive || u === me && !tab) continue; const d = u.pos.distanceTo(me.pos);
      if (u.pilot && u !== me && g.names[u.pilot] && d < (u.team === g.myTeam ? 120 : 30)) lab(u.pos, UNIT[u.kind].headY + 1.25, `<div class="mark out" style="color:var(--yel)">${g.names[u.pilot]}</div>`);
      if (!tab && d > 70) continue;
      const hurtU = u.hp < u.maxHp || u.shield < u.maxShield; if (u.team === g.myTeam && !hurtU && !tab) continue; if (u.team !== g.myTeam && !hurtU && d > 40) continue;
      const y = UNIT[u.kind].headY + .75;
      if (u.maxShield && u.shield > 0) bar(u.pos, y + .22, u.shield / u.maxShield, 'hb s');
      bar(u.pos, y, u.hp / u.maxHp, u.team !== g.myTeam ? 'hb e' : 'hb');
    }
    const foeT = foeOf(side), near = g.nearestStone(me.pos), nearHF = g.eco ? g.ownB(FACTION[foeT].hq, false, foeT).filter(b => g.fog.seen(b.pos.x, b.pos.z)).sort((a, b) => a.pos.distanceTo(me.pos) - b.pos.distanceTo(me.pos))[0] : null;
    for (const b of g.buildings as Building[]) {
      if (!b.alive) continue; const d = b.pos.distanceTo(me.pos);
      if (!b.built) { bar(b.pos, BLD[b.kind].h + 1.2, b.progress, 'hb big p'); if (d < 60) lab(b.pos, BLD[b.kind].h + 1.6, `<div class="mark" style="color:var(--cyan)">${BLD[b.kind].name} ${Math.floor(b.progress * 100)}%</div>`); }
      else if (b.hp < b.maxHp && (d < 90 || tab)) bar(b.pos, b.h + 1.2, b.hp / b.maxHp, b.team !== g.myTeam ? 'hb big e' : 'hb big');
      if (b.kind === 'wardpylon' && d < 110 && !tab && !building) lab(b.pos, b.h + 1.6, `<div class="mark out" style="color:var(--cyan)">Ward Pylon · shielding the base</div>`);
      if (!g.eco && b.kind === FACTION[SIDE.out].hq && b.team === SIDE.out && !side && d > 45 && !tab && !building && g.fog.seen(b.pos.x, b.pos.z)) lab(b.pos, b.h + 2, `<div class="mark out">${b === near ? (SIDE.out === 2 ? 'Mother Caps · ' : 'Choir Stones · ') + Math.round(d) + 'm' : ''}</div>`);
      if (b === nearHF && d > 45 && !tab && !building) lab(b.pos, b.h + 3, `<div class="mark out">${BLD[b.kind].name} · ${Math.round(d)}m</div>`);
      if (b.kind === FACTION[side].hq && b.team === side && g.time - b.lastHit < 6 && d > 30) lab(b.pos, b.h + 3, `<div class="mark out" style="color:var(--red)">${BLD[b.kind].name} under attack</div>`);
    }
    if (building) { const k = blist[g.buildSel] || blist[0]; lab(g.placePos, BLD[k].h + 1.4, `<div class="tag${g.placeOK ? '' : ' bad'}"><span class="d" style="font-size:30px;color:${g.placeOK ? 'var(--cyan)' : 'var(--red)'}">${BLD[k].name}</span> <span class="d" style="font-size:24px;color:var(--ore);margin-left:14px">${BLD[k].cost} ore</span><div class="c" style="font-size:14px">${g.placeOK ? 'Click place · R rotate · Right-click cancel' : cash < BLD[k].cost ? 'Not enough ore' : 'Can\'t build there'}</div></div>`); }
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
    this.miniT -= dt; if (this.miniT <= 0) { this.miniT = .12; this.drawMini(g); this.crew(g); }
  }

  private crew(g: Game) {
    const el = this.$('crew'); if (!g.net) { if (!el.hidden) el.hidden = true; return; }
    const html = Object.keys(g.names).map(k => { const id = +k, u = (g.units as Unit[]).find(x => x.alive && x.pilot === id), s = g.score[id] || [0, 0, 0]; return `<div class="${id === g.net!.id ? 'me' : ''}${g.teams[id] ? ' v' : ''}"><b>${g.names[id]}</b><span>${u ? UNIT[u.kind].name : 'Down'}</span><em>${s[0]} kills · ${s[1]} ore</em></div>`; }).join('');
    if (this.cache.get('crew') !== html) { this.cache.set('crew', html); el.innerHTML = html; } el.hidden = false;
  }
  private drawMini(g: Game) {
    // framed on everything worth finding: the yard, the outpost, both routes and every ore field
    const pts = [[0, 0], [OUTPOST.x, OUTPOST.z], ...NORTH_PATH, ...(MAP.sites || [])], bx0 = Math.min(...pts.map(p => p[0])) - 26, bx1 = Math.max(...pts.map(p => p[0])) + 26, bz0 = Math.min(...pts.map(p => p[1])) - 22, bz1 = Math.max(...pts.map(p => p[1])) + 22;
    const c = this.mini, S = 260, span = Math.max(bx1 - bx0, (bz1 - bz0) / .69), x0 = (bx0 + bx1) / 2 - span / 2, z0 = (bz0 + bz1) / 2 - span * .345, k = S / span, X = (x: number) => (x - x0) * k, Z = (z: number) => (z - z0) * k;
    const fog = g.fog; fog.update(g, .12);
    c.fillStyle = '#4a2f29'; c.fillRect(0, 0, S, 180);
    c.strokeStyle = '#6b4a3a'; c.lineWidth = 7; c.beginPath(); { const a = roadPt(4), b = roadPt(ROAD.len + 6); c.moveTo(X(a[0]), Z(a[1])); c.lineTo(X(b[0]), Z(b[1])); c.stroke(); }
    c.fillStyle = 'rgba(53,224,200,.16)'; c.beginPath(); c.arc(X(OUTPOST.x - 2 * ROAD.dx), Z(OUTPOST.z - 2 * ROAD.dz), 20 * k, 0, 7); c.fill();
    c.fillStyle = 'rgba(255,194,26,.13)'; c.beginPath(); c.arc(X(0), Z(0), 30 * k, 0, 7); c.fill();
    for (const s of g.spires) { c.fillStyle = '#2a1a18'; c.beginPath(); c.arc(X(s.x), Z(s.z), Math.max(1.5, s.r * k), 0, 7); c.fill(); }
    // the fog: black where nobody has been, dimmed where nobody is looking now
    { const n = fog.n, cv = this.fogCv || (this.fogCv = document.createElement('canvas')); if (cv.width !== n) { cv.width = cv.height = n; this.fogImg = null; } const cx = cv.getContext('2d')!, img = this.fogImg || (this.fogImg = cx.createImageData(n, n)), d = img.data;
      for (let i = 0; i < fog.cells.length; i++) { const v = fog.cells[i]; d[i * 4] = 22; d[i * 4 + 1] = 15; d[i * 4 + 2] = 14; d[i * 4 + 3] = v === 2 ? 0 : v === 1 ? 105 : 236; }
      cx.putImageData(img, 0, 0);
      // Ground nobody has seen is hatched like the blank part of a survey sheet, rather than left as a black slab.
      const hc = this.fogHatch || (this.fogHatch = document.createElement('canvas')); if (hc.width !== S) { hc.width = S; hc.height = 180; } const hx = hc.getContext('2d')!;
      if (!this.hatchPat) { const t = document.createElement('canvas'); t.width = t.height = 9; const tg = t.getContext('2d')!; tg.fillStyle = '#211614'; tg.fillRect(0, 0, 9, 9); tg.strokeStyle = '#4a332c'; tg.lineWidth = 1.3; tg.beginPath(); tg.moveTo(-1, 10); tg.lineTo(10, -1); tg.moveTo(-1, 1); tg.lineTo(1, -1); tg.moveTo(8, 10); tg.lineTo(10, 8); tg.stroke(); this.hatchPat = hx.createPattern(t, 'repeat'); }
      hx.globalCompositeOperation = 'source-over'; hx.clearRect(0, 0, S, 180); hx.imageSmoothingEnabled = true; hx.drawImage(cv, X(fog.x0), Z(fog.z0), n * 4 * k, n * 4 * k);
      hx.globalCompositeOperation = 'source-in'; hx.fillStyle = this.hatchPat || '#211614'; hx.fillRect(0, 0, S, 180); c.drawImage(hc, 0, 0); }
    for (const o of g.ores) { if (o.amount <= 0 || !fog.seen(o.pos.x, o.pos.z)) continue; c.fillStyle = '#b8f58c'; c.fillRect(X(o.pos.x) - 2.5, Z(o.pos.z) - 2.5, 5, 5); }
    c.lineWidth = 1.5; c.strokeStyle = '#0e0d14';
    for (const b of g.buildings) { if (!b.alive || (b.team !== g.myTeam && !fog.seen(b.pos.x, b.pos.z))) continue; const w = Math.max(5, b.hx * 2 * k), h = Math.max(5, b.hz * 2 * k); c.fillStyle = b.team !== g.myTeam ? (b.kind === 'reedgate' ? '#c58bff' : '#35e0c8') : b.built ? '#ffc21a' : '#7ef0ff'; c.fillRect(X(b.pos.x) - w / 2, Z(b.pos.z) - h / 2, w, h); c.strokeRect(X(b.pos.x) - w / 2, Z(b.pos.z) - h / 2, w, h); }
    for (const u of g.units) { if (!u.alive || u === g.me || (u.team !== g.myTeam && !fog.sees(u.pos.x, u.pos.z))) continue; const foeU = u.team !== g.myTeam; c.fillStyle = foeU ? (u.kind === 'tender' ? '#c58bff' : this.cb ? '#ff9d1a' : '#ff4f9a') : isWorker(u.kind) ? (this.cb ? '#4da3ff' : '#8be04e') : '#f4ead2'; c.beginPath(); c.arc(X(u.pos.x), Z(u.pos.z), u.kind === 'warden' ? 5 : foeU ? 2.6 : 2.2, 0, 7); c.fill(); }
    for (const p of g.pings) { c.strokeStyle = '#ffc21a'; c.lineWidth = 2.5; c.beginPath(); c.arc(X(p.x), Z(p.z), 4 + (8 - p.t) % 1 * 7, 0, 7); c.stroke(); }
    for (const u of g.units) if (u.alive && u.pilot && u !== g.me && u.team === g.myTeam) { c.fillStyle = '#ffc21a'; c.strokeStyle = '#0e0d14'; c.lineWidth = 1.5; c.beginPath(); c.arc(X(u.pos.x), Z(u.pos.z), 3.6, 0, 7); c.fill(); c.stroke(); }
    const D = g.dir; if (g.myTeam === SIDE.home && !g.eco && (D.raidIn < 15 || D.raidLive) && g.stones().length && Math.floor(performance.now() / 300) % 2) { c.fillStyle = '#ff4b3a'; c.strokeStyle = '#0e0d14'; c.lineWidth = 2; c.beginPath(); { const n = NORTH_PATH.length, p = D.raidDir === 'north' ? [(NORTH_PATH[n - 1][0] + NORTH_PATH[n - 2][0]) / 2, (NORTH_PATH[n - 1][1] + NORTH_PATH[n - 2][1]) / 2] : roadPt(62), a = Math.atan2(-p[1], -p[0]); c.moveTo(X(p[0]) + Math.cos(a) * 9, Z(p[1]) + Math.sin(a) * 9); c.lineTo(X(p[0]) + Math.cos(a + 2.4) * 8, Z(p[1]) + Math.sin(a + 2.4) * 8); c.lineTo(X(p[0]) + Math.cos(a - 2.4) * 8, Z(p[1]) + Math.sin(a - 2.4) * 8); } c.closePath(); c.fill(); c.stroke(); }
    if (this.pingT > 0) { c.strokeStyle = '#ffc21a'; c.lineWidth = 2; c.beginPath(); c.arc(X(this.pingPos.x), Z(this.pingPos.z), 5, 0, 7); c.stroke(); }
    const me = g.me; if (me) { c.save(); c.translate(X(me.pos.x), Z(me.pos.z)); c.rotate(-g.yaw); c.fillStyle = '#fff'; c.strokeStyle = '#0e0d14'; c.lineWidth = 1.5; c.beginPath(); c.moveTo(0, 8); c.lineTo(5, -5); c.lineTo(0, -2); c.lineTo(-5, -5); c.closePath(); c.fill(); c.stroke(); c.restore(); }
  }
}
