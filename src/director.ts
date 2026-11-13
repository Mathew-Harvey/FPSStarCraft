// The strategy layer: the Quartermaster who runs your economy, the Veyl raid planner,
// and the squad's playbooks, callouts and chatter.
import * as THREE from 'three';
import { V3, R, M } from './gfx';
import { sfx } from './audio';
import type { Game } from './game';
import { Kind, BKind, UNIT, BLD, UPGRADES, Unit, Building, Callout, OUTPOST, GATE, RALLY, RALLY_N, VRALLY, VRALLY_N, VHOME, NORTH_PATH, MAP, MAPS, ROAD, FACTION, SIDE, veylPt, roadPt, isSoldier, foeOf, fac, atHome, endPt, swapEnd, homeXZ, compass } from './data';
import { Doctrine, DOCTRINES } from './doctrine';
import { factionRule } from './core/registry';
/** One line for whichever side holds the outpost: the Veyl's, or the Gloam's. */
const VG = (team: number, veyl: string, gloam: string) => fac(team) === 2 ? gloam : veyl;
/** Who calls out what they see, for each faction. */
const LOOKOUT = ['Lookout', 'Watcher', 'Rootwatch'];
/** A push that is down to this share of the bodies it set off with goes home. */
const RETREAT = .4;

// The Veyl side, when somebody plays it.

/** One side's squad and economy brain. The Director keeps Ironhold's on itself; a Veyl side that somebody plays gets its own. */
export interface Side {
  team: number; auto: boolean; qmT: number; hintI: number; chatT: number;
  plan: { phase: 'ask' | 'count' | 'go'; t: number; target: Building | null; book: number; label: string; /** When the push set off, and how many set off. */ goT?: number; n0?: number } | null;
  /** When this side last broke one of the enemy's buildings. */
  brokeT?: number;
  nextPlan: number; callout: Callout | null; pushes: number; lastFailed: boolean; fails: number; playbook: { name: string; steps: string[]; idx: number };
  /** An enemy push is on its way in. */
  raidLive: boolean; retarget: number; /** Counts down to the next check that the march is still together. */ cohT?: number;
  /** The push on its way in is coming round by the flank. */
  inNorth?: boolean;
  /** The build plan this side follows (see doctrine.ts). Unset means the standard one. */
  doc?: Doctrine; docSet?: boolean;
}
/** The build plan a side follows. */
export const docOf = (s: Side) => s.doc || DOCTRINES[0];

/** One group of raiders: where it gathers, where it is going, and whether it has been let off the leash. */
export interface Wave { units: Unit[]; sx: number; sz: number; t: number; go: boolean; n0: number; north: boolean; tx: number; tz: number; hunt?: boolean }
export class Director implements Side {
  team = 0; flip = false; retarget = 0; auto = true; qmT = 0; hintI = 0; chatT = 55; barkT = 0;
  /** The Veyl side's brain, used when they run their own economy. */
  vs: Side = { team: 1, auto: true, qmT: 0, hintI: 0, chatT: 70, plan: null, nextPlan: 75, callout: null, pushes: 0, lastFailed: false, fails: 0, playbook: { name: '', steps: [], idx: 0 }, raidLive: false, retarget: 0 };
  side(team: number): Side { return atHome(team) ? this : this.vs; }
  plan: { phase: 'ask' | 'count' | 'go'; t: number; target: Building | null; book: number; label: string; goT?: number; n0?: number } | null = null; brokeT = 0;
  nextPlan = 60; callout: Callout | null = null; pushes = 0; lastFailed = false; /** Pushes in a row that broke nothing. */ fails = 0;
  playbook = { name: '', steps: [] as string[], idx: 0 };
  raidIn: number; raidDir: 'east' | 'north' = 'east'; raidN = 0; /** The verse a Veyl player picked for the next raid: 0 all blades, 1 mostly lances, 2 the deep voice. -1 leaves it to the Conductor. */ verse = -1; /** When the Veyl last answered a failed push with a raid of their own. Rationed, so a bad start does not snowball. */ lastCounter = -999; raidLive = false; warned = false; raidAge = 0; raidSeen = false; reinT = 50;
  flags: Record<string, boolean> = {};

  constructor(public g: Game) {
    this.team = SIDE.home; this.vs.team = SIDE.out;
    for (const s of [this, this.vs] as Side[]) { const b = this.books(s)[0]; s.playbook = { name: b.name, steps: b.steps, idx: 0 }; }
    this.raidIn = g.eco ? 1e9 : 170 * g.diff.raid;
    // Two built bases that are not the classic Ironhold-against-Veyl pairing start on the same clock, so neither end plans its first push sooner.
    if (g.eco && (g.fair || !(fac(SIDE.home) === 0 && fac(SIDE.out) !== 0))) { this.vs.nextPlan = this.nextPlan; this.vs.chatT = this.chatT; }
    const guard = (k: Kind, x: number, z: number) => { if (g.net || g.eco) return; const u = g.spawn(k, 1, x, z); u.order = { type: 'guard', x, z }; };
    for (const [x, z] of [[-14, -5], [-12, 7], [-4, 0], [-18, 1]]) guard('cantor', ...veylPt(x, z));
    for (const [x, z] of [[0, -7], [0, 9]]) guard('lancer', ...veylPt(x, z));
  }

  // ------------------------------------------------------------ squad bookkeeping
  /** Where a side's army waits, in its own faction's frame: the Ironhold muster at the yard's road end, the Veyl and the Gloam at the outpost's,
   *  the same frame their building slots use. A side at the other end gets the same spot turned round, so both armies of a mirror stand alike. */
  /** Where a side's squad waits: on its own end of the road, or toward the ridge when a flank is coming. The points belong to the end of the map, not
   *  the faction. The far end used to borrow the yard's points turned through the middle of the map, but the ridge path is not symmetric, so the
   *  turned ridge point landed on the wrong side of the far base: its army stood 40 m away while a back-door push ate its workers. */
  rallyAt(i: number, north = false, s: Side = this) { const [hx, hz] = homeXZ(s.team), blind = !this.g.intel.knows(s.team), r = blind ? { x: hx + 17, z: hz + 15 } /* nowhere that points at anything */ : atHome(s.team) ? (north ? RALLY_N : RALLY) : north ? VRALLY_N : VRALLY; return { x: r.x + ((i % 4) - 1.5) * 2.4, z: r.z + Math.floor(i / 4) * 2.4 }; }
  following(s: Side = this) { return this.g.army(s.team).some(u => u.order.type === 'follow'); }
  books(s: Side) { return factionRule(s.team).books || []; }
  pathFor(book: number, i: number, s: Side = this): number[][] | undefined { return book === 1 || (book === 2 && i % 2) ? (!atHome(s.team) ? [...NORTH_PATH] : [...NORTH_PATH].reverse()).map(p => [p[0], p[1]]) : undefined; }
  targetFor(book: number, s: Side = this): Building | null {
    const g = this.g;
    if (g.eco) {
      // Every side that runs an economy: the enemy building nearest the way in, the nearest of their bases when it is all in, and a Ward Pylon first if one shields it.
      const foe = foeOf(s.team), all = g.intel.known(s.team), hqs = all.filter(b => b.kind === FACTION[foe].hq), want = g.mission?.target?.(g) || null; if (want) return want; if (!all.length) return null;
      const from = book === 1 ? (atHome(s.team) ? NORTH_PATH[0] : NORTH_PATH[NORTH_PATH.length - 1]) : atHome(s.team) ? [RALLY.x, RALLY.z] : [VRALLY.x, VRALLY.z];
      const near = (l: Building[]) => l.reduce((a, b) => Math.hypot(a.pos.x - from[0], a.pos.z - from[1]) < Math.hypot(b.pos.x - from[0], b.pos.z - from[1]) ? a : b);
      const t = book === 2 && hqs.length ? near(hqs) : near(all);
      if (t.kind === FACTION[foe].hq) { const w = g.ward(t.pos, foe); if (w) return w; }   // a shielded home building: break its shield first
      return t;
    }
    if (s.team) {
      // The Veyl walk down the road and take the first thing they meet, circle round to whatever the Watchposts cannot see, or go all in on the last Headframe.
      const all = g.ownB(), hfs = g.ownB('headframe'); if (!all.length) return null; const from = book === 1 ? NORTH_PATH[NORTH_PATH.length - 1] : [VRALLY.x, VRALLY.z];
      if (book === 2 && hfs.length) return hfs.reduce((a, b) => Math.hypot(a.pos.x - from[0], a.pos.z - from[1]) < Math.hypot(b.pos.x - from[0], b.pos.z - from[1]) ? a : b);
      return all.reduce((a, b) => Math.hypot(a.pos.x - from[0], a.pos.z - from[1]) < Math.hypot(b.pos.x - from[0], b.pos.z - from[1]) ? a : b);
    }
    const st = g.stones(), want = g.mission?.target?.(g) || null; if (!st.length || want) return want || g.buildings.find(b => b.alive && b.team === SIDE.out) || null; const w = g.ward(st[0].pos); if (w) return w;
    // Against a Chorus that builds, the squad takes the outlying buildings on its way in, and goes for a Stone when it is all in.
    if (g.eco && book !== 2) { const vb = g.ownB(undefined, false, SIDE.out), from = book === 1 ? NORTH_PATH[0] : [RALLY.x, RALLY.z]; if (vb.length) return vb.reduce((a, b) => Math.hypot(a.pos.x - from[0], a.pos.z - from[1]) < Math.hypot(b.pos.x - from[0], b.pos.z - from[1]) ? a : b); }
    return book === 1 ? st.reduce((a, b) => a.pos.z < b.pos.z ? a : b) : g.nearestStone(RALLY);
  }
  /** Gives a soldier a place in the squad that matches whatever the squad is doing right now. */
  enlist(u: Unit) {
    const g = this.g, s = this.side(u.team), army = g.army(s.team); u.slot = army.filter(x => x !== u).length;
    // A body that turns up after a push has left waits at the rally for the next one, rather than walking out alone to die one at a time.
    if (this.following(s)) u.order = { type: 'follow', x: 0, z: 0, lead: army.find(x => x.order.type === 'follow')?.order.lead };
    else { const p = this.rallyAt(u.slot, s.raidLive && (s === this && !this.g.eco ? this.raidDir === 'north' : !!s.inNorth), s); u.order = { type: 'guard', x: p.x, z: p.z }; }
  }
  regroup(north = false, s: Side = this) { this.g.army(s.team).filter(u => u !== this.g.me && !u.pilot && u.order.type !== 'follow' && u.order.type !== 'scout').forEach((u, i) => { u.slot = i; const p = this.rallyAt(i, north, s); u.order = { type: 'guard', x: p.x, z: p.z }; }); }
  squadTask(s: Side = this) { return s.plan?.phase === 'go' ? this.books(s)[s.plan.book].name + ' under way' : this.following(s) ? 'Following you' : s.raidLive ? (fac(s.team) ? 'Holding off the push' : 'Holding off the raid') : fac(s.team) === 2 ? 'Lurking in the Bloom' : fac(s.team) ? 'Guarding the Stones' : 'Holding the yard'; }
  say(who: string, msg: string, cls = '', team = -1) { this.g.feed(who, msg, cls, team); }
  bark(u: Unit, kind: 'kill' | 'down') { if (this.g.net || this.g.time < this.barkT) return; this.barkT = this.g.time + 7; const l = factionRule(u.team).lines?.(kind, fac(foeOf(u.team))) || []; if (!l.length) return; this.say(UNIT[u.kind].name, l[Math.floor(Math.random() * l.length)], kind === 'down' ? 'al' : ''); }

  // ------------------------------------------------------------ events from the simulation
  /** A body came out of training: the first of a kind gets a line from its faction (see FactionRules.trained). */
  trained(u: Unit) { factionRule(u.team).trained?.(this, u); }
  buildingDone(b: Building) { factionRule(b.team).built?.(this, b); }
  buildingLost(b: Building) {
    const g = this.g;
    const by = this.side(foeOf(b.team)); by.fails = 0; by.brokeT = g.time; const left = g.ownB(b.kind, false, b.team).length;
    factionRule(b.team).lost?.(this, b, left);
  }

  // ------------------------------------------------------------ orders from the player
  playerOrders(P: Set<string>, eye: THREE.Vector3, dir: THREE.Vector3, lookDist: number) {
    const g = this.g, net = g.net, p = this.side(g.myTeam).plan;
    if (P.has('KeyG')) { if (net) net.cmd('or', 'G'); else this.order('G'); sfx.blip(); }
    if (P.has('KeyV')) { if (net) net.cmd('or', 'V'); else this.order('V'); }
    if (P.has('KeyH')) { if (net) { net.cmd('or', 'S'); sfx.blip(); } else this.order('S'); }
    if (P.has('Mouse1')) { const q = V3(); if (g.groundPoint(q, 160) || (lookDist > 0 && q.copy(eye).addScaledVector(dir, lookDist).setY(0))) { g.hud.ping(q); if (net) net.cmd('or', 'M', Math.round(q.x), Math.round(q.z)); else this.order('M', q.x, q.z); } }
    if (p && p.phase === 'ask') {
      const k = P.has('KeyX') ? 'X' : P.has('KeyZ') ? 'Z' : P.has('KeyC') && p.book < 2 ? 'C' : '';
      if (k) { if (k === 'C') P.delete('KeyC'); g.obj.answered = true; if (net) { net.cmd('or', k); sfx.blip(); } else this.order(k); }
    }
  }
  /** One squad or base order. In multiplayer the server runs this for whichever player sent it, with lead set to their body. */
  order(k: string, x = 0, z = 0, lead: Unit | null = this.g.me) {
    const g = this.g, s = this.side(lead ? lead.team : SIDE.home), v = fac(s.team) !== 0, squad = g.army(s.team).filter(u => u !== lead && !u.pilot), p = s.plan, who = v ? VG(s.team, 'Chorus Lead', 'Swarm Lead') : 'Alpha';
    if (k === 'G' && g.mission?.lockAuto) { this.say('Quartermaster', 'Quartermaster offline. Re-forecasting. Please hold.', 'al', s.team); return; }
    if (k === 'G') { s.auto = !s.auto; this.say(v ? FACTION[s.team].voice : 'Quartermaster', v ? (s.auto ? VG(s.team, 'I will tend the Chorus again.', 'The Overgrowth tends itself again.') : VG(s.team, 'The Chorus is yours to tend. I will listen.', 'The swarm is yours to grow. I will watch.')) : s.auto ? 'Back on the clock. I\'ll handle the building.' : 'Fine. You build it. I\'ll watch.', ''); }
    else if (k === 'V') {
      if (squad.length) { const rel = this.following(s); squad.forEach((u, i) => { u.slot = i; const q = this.rallyAt(i, false, s); u.order = rel ? { type: 'guard', x: q.x, z: q.z } : { type: 'follow', x: 0, z: 0, lead: lead || undefined }; }); this.say(who, v ? (rel ? VG(s.team, 'Back to the Stones, then.', 'Back to the Bloom, then.') : VG(s.team, 'We follow your voice.', 'We run at your heels.')) : rel ? 'Back to the rally point. Finally, a sit-down.' : 'On you, boss. Try not to get us killed.', ''); s.plan = null; s.callout = null; s.nextPlan = g.time + (rel ? 25 : 60); sfx.callout(); } else sfx.deny();
    }
    else if (k === 'S') {
      const u = g.intel.send(s.team, lead), lk = LOOKOUT[fac(s.team)];
      if (!u) { this.say(lk, v ? 'Nobody is free to go and look.' : 'Nobody free to send. Train somebody first.', 'al', s.team); if (!g.net) sfx.deny(); }
      else { const n = g.units.filter(x => x.alive && x.team === s.team && x.order.type === 'scout').length, where = MAP.hid && !g.intel.known(s.team).length ? compass(u.order.x - homeXZ(s.team)[0], u.order.z - homeXZ(s.team)[1]) : '';
        this.say(UNIT[u.kind].name, g.intel.known(s.team).length ? (v ? 'I will go and look at them again.' : 'Going for another look at them. Back soon.') : MAP.hid ? (v ? `I will walk the ${where} road and see where it ends.` : n > 1 ? `I will take the ${where} road, then.` : `Taking a walk down the ${where} road. If I am not back, it was that one.`) : (v ? 'I will go and look at them.' : 'Going for a look at them. Back soon.'), '', s.team); if (!g.net) sfx.callout(); }
    }
    else if (k === 'M') {
      if (squad.length) { for (const u of squad) u.order = { type: 'amove', x: x + R(-2.5, 2.5), z: z + R(-2.5, 2.5) }; if (s.plan?.phase !== 'go') { s.plan = null; s.callout = null; s.nextPlan = g.time + 60; } this.say(who, v ? VG(s.team, 'We go where you point. Singing.', 'Where you point, we swarm.') : 'Moving. Shooting anything purple on the way.', ''); sfx.callout(); } else sfx.deny();
    }
    else if (p && p.phase === 'ask') {
      if (k === 'X') { s.plan = null; s.callout = null; s.nextPlan = g.time + 40; this.say(who, v ? VG(s.team, 'We hold the note. Call when you want us.', 'We wait in the Bloom. Call us.') : 'Holding. Wake us when you\'re ready.', ''); sfx.blip(); }
      else if (k === 'Z') this.accept(true, s);
      else if (k === 'C' && p.book < 2) { p.book = 1 - p.book; p.label = this.books(s)[p.book].label; this.accept(true, s); }
    }
  }
  accept(byPlayer: boolean, s: Side = this) {
    const p = s.plan!; p.phase = 'count'; p.t = byPlayer ? 5 : 12; s.callout = null; if (byPlayer && !this.g.net) this.g.obj.answered = true;
    if (fac(s.team) === 2) this.say('Swarm Lead', byPlayer ? (p.book === 1 ? 'The ridge. Low and quiet.' : 'Gather. Swarm.') : 'No word. The hunger decides.', '');
    else if (fac(s.team)) this.say('Chorus Lead', byPlayer ? (p.book === 1 ? 'The ridge, then. Quietly.' : 'We sing. Gather.') : 'No word. We go anyway.', '');
    else this.say('Alpha', byPlayer ? (p.book === 1 ? 'Back door it is. Sneaky. I like it.' : 'That\'s the spirit. Moving out.') : 'No answer. Taking that as a yes.', ''); sfx.blip();
  }

  /** True if a building here would stand between the Headframe and a seam the Riggers walk to. */
  onOreRoute(k: BKind, x: number, z: number, team = 0) {
    const m = Math.max(BLD[k].hx, BLD[k].hz) + 2.5, [hx, hz] = homeXZ(team); x -= hx; z -= hz;
    for (const n of this.g.ores) { const ox = n.pos.x - hx, oz = n.pos.z - hz, L = ox * ox + oz * oz; if (n.amount <= 0 || L > 45 * 45) continue; const t = Math.max(0, Math.min(1, (x * ox + z * oz) / L)); if (Math.hypot(x - ox * t, z - oz * t) < m) return true; }
    return false;
  }
  /** The planned spot if it is free, otherwise the nearest free ground around it, still inside the yard. */
  freeSpot(k: BKind, x: number, z: number, team = 0): [number, number] | null {
    const g = this.g, [hx, hz] = homeXZ(team), d = (px: number, pz: number) => Math.hypot(px - hx, pz - hz), yard = d(x, z) < 60; if (g.canPlace(k, x, z, false, team)) return [x, z];
    for (let r = 3; r <= 24; r += 3) for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2 + r, px = Math.round(x + Math.cos(a) * r), pz = Math.round(z + Math.sin(a) * r); if ((yard && (d(px, pz) < 12 || d(px, pz) > 60)) || this.onOreRoute(k, px, pz, team)) continue; if (g.canPlace(k, px, pz, false, team)) return [px, pz]; }
    return null;
  }

  // ------------------------------------------------------------ every frame
  update(dt: number) {
    // A crew with no Riggers and no money is not out of the game: the Charter fronts enough for one more.
    // Same rule for every side: only a side with no workers at all, and none on the way, gets the loan. It used to be fewer than three for the
    // Veyl and the Gloam, so a Gloam player could root every Grazer into buildings and live on 150 free ore a minute.
    for (const t of [SIDE.home, SIDE.out]) { if (t === SIDE.out && !this.g.eco) continue; const F = FACTION[t], cap = UNIT[F.worker].cost; if (this.g.cash(t) < cap && !this.g.own(F.worker, t).length && !this.g.ownB(undefined, false, t).some(b => b.queue.some(q => q.kind === F.worker)) && this.g.ownB(F.hq, true, t).length) this.g.purse[t] = Math.min(cap, this.g.purse[t] + dt * 2.5); }
    const g = this.g, now = g.time;
    // A drilled-out seam settles and the ore creeps back, a third of it, so a long shift never runs the yard dry for good.
    for (const n of g.ores) { if (n.amount > 0) { n.dryT = 0; continue; } n.dryT = (n.dryT || 0) + dt; if (n.dryT > 150) { n.amount = Math.round(n.max * .35); n.dryT = 0; g.oreCheck(n); if (!g.mission) this.say(FACTION[SIDE.home].voice, 'An old seam has settled and the green is showing again. Worth another dig.', '', SIDE.home); } }
    // Each side runs the brain of its own faction, whichever end of the map it holds. The one exception is the classic match: the Veyl
    // outpost against a yard nobody plays the Veyl in, which breeds raids for free instead of running an economy.
    // The two sides take turns going first, so a tie (both armies ready to march in the same frame) does not always go to the yard.
    this.flip = !this.flip;
    for (const s of (this.flip || !g.eco ? [this, this.vs] : [this.vs, this]) as Side[]) {
      if (s === this.vs && !g.eco) { factionRule(s.team).classic?.(this, dt); continue; }
      const f = fac(s.team), home = s === this, foe = foeOf(s.team);
      if (!g.human[s.team]) s.auto = true; if (s.callout) s.callout.t -= dt;
      // On a hidden map a side nobody plays picks its build plan for the match. A scout can read it off what gets built.
      if (MAP.hid && !s.docSet && now > 1) { s.docSet = true; if (!g.human[s.team] && !g.mission) { s.doc = DOCTRINES[g.docFix ?? Math.floor(Math.random() * DOCTRINES.length)]; s.nextPlan += s.doc.first; } }
      const hints = factionRule(s.team).hints || [];
      if (!g.mission || !home) while (s.hintI < hints.length && now >= hints[s.hintI][0]) { const h = hints[s.hintI++]; this.say(h[1], this.hint(s, s.hintI - 1, h[2]), 'in', s.team); }
      factionRule(s.team).brain?.(this, dt, s);
      this.squad(dt, s);
      s.chatT -= dt; if (s.chatT <= 0) { s.chatT = home ? R(38, 70) : R(40, 75); const a = g.army(s.team).filter(u => u !== g.me && !u.pilot && !u.target); if (a.length >= 2 && !s.raidLive && !s.callout) { const u = a[Math.floor(Math.random() * a.length)], C = factionRule(s.team).chatter?.(fac(foe)) || []; this.say(UNIT[u.kind].name, C[Math.floor(Math.random() * C.length)], '', s.team); } }
      const b = s.plan ? this.books(s)[s.plan.book] : this.books(s)[0]; s.playbook.name = b.name; s.playbook.steps = b.steps; s.playbook.idx = !g.ownB(FACTION[s.team].barracks, true, s.team).length ? 0 : s.plan?.phase === 'go' ? 2 : 1;
    }
  }
  /** A starting hint, with the lines about the enemy rewritten for whoever is really at the other end of the road. */
  hint(s: Side, i: number, text: string) {
    const f = fac(s.team), foe = foeOf(s.team), ff = fac(foe), hq = BLD[FACTION[foe].hq].name;
    if (f === 0 && ff === 1 && !this.g.eco) return text;
    if (MAP.hid && i === 2) { const them = ff === f ? (f === 2 ? 'Another swarm' : f ? 'Another Chorus' : 'Another Ironhold crew') : ff === 2 ? 'The Gloam' : ff ? 'The Veyl' : 'The Ironhold', is = ff === f ? 'is' : 'are';
      return f === 2 ? `${them} ${is} rooting out there and we do not know where. Five roads leave the Cap. One ends at their door. Press H to send legs down one.`
        : f ? `${them} ${is} out there, and we do not know where. Five roads leave the Stone. One ends at their door. Press H and a voice will walk one.`
        : `${them} ${is} out there somewhere and nobody gave me a map. Five roads leave the yard. One ends at their front door. Press H to send a scout down one.`; }
    if (i === 2) return ff === 0 ? (f ? text : `Another Ironhold crew is at the end of the ${MAP.road}. Same kit as us, worse manners. Break every ${hq}.`)
      : ff === 1 ? (f === 1 ? `Another Chorus sings at the end of the road. Their song is not ours. Break every ${hq}.` : `The Veyl are at the end of the road, singing over their ${hq}s. Break every one.`)
      : f === 0 ? `Something is growing at the end of the ${MAP.road}. Mother Caps, and a green carpet spreading out of them. Squash every Cap.` : f === 1 ? `Something is growing at the end of the road. Mother Caps, on a green carpet. Silence every one.` : 'Another swarm is rooting at the end of the road. Their Bloom smells wrong. Eat every Mother Cap.';
    return text;
  }

  /** The next seam worth a Choir Stone (nearest home, nobody there yet, and away from the Ironhold), and a new Stone still without a Thorn Spire. */
  vExpansion(stones: Building[], T: number): { site: number[] | null; bare: number[] | null } {
    const g = this.g, [HX, HZ] = homeXZ(T), near = (x: number, z: number, r: number, f: (b: Building) => boolean) => g.buildings.some(b => b.alive && f(b) && Math.hypot(b.pos.x - x, b.pos.z - z) < r);
    const free = (MAP.sites || []).filter(([x, z]) => !near(x, z, 30, b => b.team === T && b.kind === 'choir') && !near(x, z, 50, b => b.team !== T) && g.ores.some(n => n.amount > 0 && Math.hypot(n.pos.x - x, n.pos.z - z) < 16)).sort((a, b) => Math.hypot(a[0] - HX, a[1] - HZ) - Math.hypot(b[0] - HX, b[1] - HZ));
    const bare = stones.find(h => h.built && Math.hypot(h.pos.x - HX, h.pos.z - HZ) > 30 && !near(h.pos.x, h.pos.z, 24, b => b.team === T && b.kind === 'thornspire'));
    return { site: free[0] || null, bare: bare ? [bare.pos.x, bare.pos.z] : null };
  }


  /** The next ore field worth a Headframe (nearest the yard, nobody's there yet, and not under the Veyl's nose), and a new base still without a Watchpost. */
  expansion(hfs: Building[], T = 0): { site: number[] | null; bare: number[] | null } {
    const g = this.g, [HX, HZ] = homeXZ(T), near = (x: number, z: number, r: number, f: (b: Building) => boolean) => g.buildings.some(b => b.alive && f(b) && Math.hypot(b.pos.x - x, b.pos.z - z) < r);
    const sites = MAP.sites || [], free = sites.filter(([x, z]) => !near(x, z, 30, b => b.team === T && b.kind === 'headframe') && !near(x, z, 50, b => b.team !== T) && g.ores.some(n => n.amount > 0 && Math.hypot(n.pos.x - x, n.pos.z - z) < 16)).sort((a, b) => Math.hypot(a[0] - HX, a[1] - HZ) - Math.hypot(b[0] - HX, b[1] - HZ));
    const bare = hfs.find(h => h.built && Math.hypot(h.pos.x - HX, h.pos.z - HZ) > 30 && !near(h.pos.x, h.pos.z, 24, b => b.team === T && b.kind === 'watchpost'));
    return { site: free[0] || null, bare: bare ? [bare.pos.x, bare.pos.z] : null };
  }
  waves: Wave[] = []; remnant: Unit[] = []; spireHome: number[][] | null = null; growT = 110;
  /** Counts down while the Veyl base is under fire, and where the shooting is coming from. */
  alarmT = 0; alarmX = 0; alarmZ = 0; alarmCd = 0; alarmN = 0;
  /** A Veyl building was hit. The garrison goes looking for whoever did it, and the Reed Gate starts sending help. */
  alarm(from: Unit) { if (from.team !== 0) return; if (this.alarmT <= 0) this.alarmCd = Math.min(this.alarmCd, 2); this.alarmT = 14; this.alarmX = from.pos.x; this.alarmZ = from.pos.z; }

  squad(dt: number, s: Side = this) {
    const g = this.g, now = g.time, f = fac(s.team), v = f !== 0, all = g.army(s.team), idle = all.filter(u => u.order.type === 'guard' && u !== g.me && !u.pilot), B = this.books(s);
    // What the enemy has standing: every building against a side that builds, the Choir Stones in the classic match.
    const foe = foeOf(s.team), foeAll = g.ownB(undefined, false, foe), foeHQ = g.ownB(FACTION[foe].hq, false, foe), foes = MAP.hid ? g.intel.known(s.team) : g.eco ? foeAll : g.stones();
    if (g.eco && s.raidLive && !g.army(foeOf(s.team)).some(u => u.order.type === 'amove')) s.raidLive = false;
    // Against a Chorus that builds, "the last Stone" means the Veyl base is nearly gone, not that they only ever had one.
    const last = g.eco ? foeHQ.length === 1 && foeAll.length <= (v ? 2 : 3) && (!v || now > 300) : foes.length === 1;
    const enemyPush = this.side(foe).plan?.phase === 'go';
    if (!s.plan && now > s.nextPlan && (foes.length || (s === this && g.mission && this.targetFor(0))) && !s.raidLive && !(s === this && this.warned) && !enemyPush) {
      // Every push that dies on their doorstep makes the next muster bigger, so the side stops feeding the enemy six at a time. A swarm musters bigger: its bodies are cheap.
      const need = Math.max(3, Math.round((g.eco && !g.army(foeOf(s.team)).length ? 7 : (last ? 5 : 6) + 2 * Math.min(s.fails, 3)) * (f === 2 ? 1.7 : 1)) + docOf(s).need);   // nobody left to stop us but the towers: a fair-sized push, without the caution
      if (idle.length >= need) {
        const book = last ? 2 : s.lastFailed || s.pushes % 2 === 1 ? 1 : 0; s.plan = { phase: 'ask', t: 10, target: null, book, label: B[book].label };
        const lastHQ = BLD[FACTION[foe].hq].name, text = f === 2
          ? (book === 2 ? `One ${lastHQ} left and ${idle.length} of us hungry. <b>Everything with legs, both roads. Now?</b>` : book === 1 ? `The road ${s.lastFailed ? 'bit back' : 'is watched'}. ${idle.length} of us circle over the <b>${MAP.flankName}</b> and come at their backs. <b>Shall we swarm?</b>` : `${idle.length} of us are restless in the Bloom. We run down the road in twenty. <b>Shall we swarm?</b>`)
          : v
          ? (book === 2 ? `One ${lastHQ} left and ${idle.length} voices ready. <b>Every voice, both roads. Shall we?</b>` : book === 1 ? `The road ${s.lastFailed ? 'turned us back' : 'is expected'}. ${idle.length} of us circle over the <b>${MAP.flankName}</b> and come at them from behind. <b>Shall we sing?</b>` : `${idle.length} voices are restless. We march down the road in twenty. <b>Shall we sing?</b>`)
          : (book === 2 ? `One ${g.eco ? lastHQ : 'Stone'} left and ${idle.length} of us itching. <b>Everybody goes, both roads. Yes?</b>` : book === 1 ? `Front door ${s.lastFailed ? 'went badly' : 'is getting old'}. ${idle.length} of us go round by the <b>${MAP.flankName}</b> and hit them from behind. <b>You in?</b>` : `${idle.length} of us are standing around. We hit their ${g.eco ? 'nearest building' : 'east yard'} in twenty. <b>You in, or what?</b>`);
        const go = f === 2 ? 'Swarm' : v ? 'Sing' : 'Do it';
        s.callout = { who: v ? VG(s.team, 'Chorus Lead', 'Swarm Lead') : 'Alpha Lead', text, t: 10, dur: 10, keys: book === 2 ? [['Z', go], ['X', 'Hold']] : [['Z', go], ['C', book ? (v ? 'The road' : 'Front door') : v ? 'The ridge' : 'Back door'], ['X', 'Hold']] }; if (!g.net) sfx.callout();
      }
    }
    const p = s.plan; if (!p) return; p.t -= dt;
    // On Day shift a pitch nobody answers goes ahead, and so does every pitch on a side nobody plays. From Night shift up the squad waits for the word, so the army is the player's to spend.
    if (p.phase === 'ask') { if (p.t <= 0) { if (g.diff.enemy < 1 || !g.human[s.team]) this.accept(false, s); else { s.plan = null; s.callout = null; s.nextPlan = now + 45; this.say(v ? VG(s.team, 'Chorus Lead', 'Swarm Lead') : 'Alpha', v ? VG(s.team, 'No word from you. We guard the Stones until you call.', 'No word from you. We wait in the Bloom until you call.') : 'No word from you. We hold the yard until you say go.', ''); } } }
    else if (p.phase === 'count') {
      if (p.t <= 0) {
        p.phase = 'go'; p.goT = now; p.target = this.targetFor(p.book, s); s.pushes++; s.retarget = 2;
        if (p.target) { let i = 0; for (const u of all) if (u !== g.me && !u.pilot && u.order.type === 'guard') { u.order = { type: 'amove', x: p.target.pos.x + R(-3, 3), z: p.target.pos.z + R(-3, 3), path: this.pathFor(p.book, i++, s) }; }  p.n0 = i; }
        this.say(v ? VG(s.team, 'Chorus Lead', 'Swarm Lead') : 'Alpha', B[p.book].go, ''); sfx.callout();
        if (g.eco) this.incoming(s, p.book);
      }
    } else {
      const pushing = all.filter(u => u.order.type === 'amove');
      // March together. Bodies walk at different speeds (a Cantor 5.4, a Lancer 4.4, a Gantry 3.9), so a push used to reach the enemy as a
      // string of ones and twos and die to the towers one at a time: in 130 logged bot pushes, 117 broke nothing. Anyone well ahead of the
      // middle of the march, and not yet at the fight, now stands for a moment until the rest catch up.
      s.cohT = (s.cohT || 0) - dt; if (s.cohT <= 0) { s.cohT = .5; const walk = pushing.filter(u => !u.target && !u.pilot && u !== g.me), left = (u: Unit) => { let d = 0, x = u.pos.x, z = u.pos.z; for (const q of [...(u.order.path || []), [u.order.x, u.order.z]]) { d += Math.hypot(q[0] - x, q[1] - z); x = q[0]; z = q[1]; } return d; };
        if (walk.length >= 3) { const ds = walk.map(left), mid = [...ds].sort((a, b) => a - b)[Math.floor(ds.length / 2)]; walk.forEach((u, i) => { if (ds[i] > 32 && ds[i] < mid - 9) u.order.waitT = .6; }); } }
      // A building the push was walking to has fallen: on to the next one.
      s.retarget -= dt; if (s.retarget <= 0 && g.eco) { s.retarget = 2; if (!p.target || !p.target.alive) p.target = this.targetFor(p.book, s);
        // Anyone standing idle at a spot the push has moved on from walks on to the new target (a squad once stood 10 minutes where a Ward Pylon had been).
        if (p.target) for (const u of pushing) if (!u.target && !(u.order.path && u.order.path.length) && Math.hypot(u.order.x - p.target.pos.x, u.order.z - p.target.pos.z) > 8) u.order = { type: 'amove', x: p.target.pos.x + R(-3, 3), z: p.target.pos.z + R(-3, 3) }; }
      // A push is spent when its bodies are gone, or when it has broken nothing for two and a half minutes: stuck on the rocks, or bleeding
      // to towers. Left running, it held the other side in "incoming" forever and both armies stood still (40-minute draws in the bot runs).
      // Also when it has dwindled to a sideshow while a real army stands at the rally: fold it in, and muster again.
      const stale = now - Math.max(p.goT ?? now, s.brokeT || 0) > 150 || (now - (p.goT ?? now) > 60 && idle.length >= 6 && pushing.length * 3 < idle.length);
      // A push that has lost most of its bodies pulls out with what is left. It used to fight to the last one, so every failed push cost the
      // whole army and the side started the next muster from nothing. Not the Gloam: a swarm wins by trading badly, and pulling it out early took it from 15-15 against Ironhold to 5-25.
      const routed = !!p.n0 && p.n0 >= 4 && f !== 2 && pushing.length <= Math.floor(p.n0 * RETREAT) && now - (p.goT ?? now) > 12;
      if (routed) for (const u of pushing) if (!u.pilot && u !== g.me) u.target = null;
      if (!pushing.length || (pushing.length < 2 && all.length < 3) || stale || routed) {
        if (stale) for (const u of pushing) if (!u.pilot && u !== g.me) u.target = null;
        s.plan = null; s.nextPlan = now + 40; s.lastFailed = true; s.fails++; this.regroup(false, s); this.say(v ? VG(s.team, 'Chorus Lead', 'Swarm Lead') : 'Alpha', v ? VG(s.team, 'The march is spent. Back to the Stones.', 'The swarm is spent. Back to the Bloom.') : 'Push is spent. Pulling back to regroup.', 'al');
        if (g.eco) { const o = this.side(foe); if (o.raidLive) { o.raidLive = false; const of = fac(o.team), them = FACTION[s.team].short; this.say(of ? LOOKOUT[of] : 'Alpha', of ? VG(o.team, `The ${them} have gone home. The Stones still sing.`, `The ${them} have gone home. The Caps still grow.`) : f === 0 ? 'They\'ve gone home. Yard\'s clear.' : 'Yard\'s clear. Somebody sweep up the purple.', '', o.team); } }
        else if (g.diff.enemy >= 1 && foes.length && !(g.mission && !g.mission.raids) && g.time > 300 && now - this.lastCounter > 150) { this.lastCounter = now; this.raidIn = Math.min(this.raidIn, 22); }
      }
    }
  }
  /** One side has gone on the march: the other side's lookout calls it, and its squad comes home to meet it. */
  incoming(s: Side, book: number) {
    const o = this.side(foeOf(s.team)); if (o.plan?.phase === 'go') return; o.raidLive = true; o.plan = null; o.callout = null;
    const north = book === 1; o.inNorth = north; this.regroup(north, o); const af = fac(s.team), of = fac(o.team);
    if (!this.g.intel.knows(o.team)) { this.say(LOOKOUT[of], of === 2 ? 'Something is coming for the Caps. We cannot smell from where.' : of ? 'Something is coming for the Stones. I cannot hear from where.' : 'Somebody is coming for us and I cannot see from where. Eyes everywhere.', 'al', o.team); if (of === 0) sfx.alarm(); return; }
    if (af === 0 && of === 0) this.say('Lookout', north ? `Boots on the ${MAP.flankName}! The other crew is coming round the back.` : `The other crew is on the ${MAP.road}. Rifles and all, coming this way.`, 'al', o.team);
    else if (of === 0) { if (atHome(o.team)) this.raidDir = north ? 'north' : 'east'; this.say('Lookout', af === 2 ? (north ? `Skittering on the ${MAP.flankName}! The bugs are coming round the back.` : `The swarm is on the ${MAP.road}. Hundreds of legs, coming this way.`) : north ? `Movement on the ${MAP.flankName}! The Chorus is coming round the back.` : `The Chorus is on the ${MAP.road}. A whole choir of them, coming this way.`, 'al', o.team); sfx.alarm(); }
    else { const them = af === 0 ? 'The Ironhold' : af === 1 ? 'The Chorus' : 'The swarm', mine = VG(o.team, 'Stones', 'Caps'); this.say(LOOKOUT[of], north ? `Something on the ${MAP.flankName}. ${them} are circling round.` : `${them} are on the road, coming for the ${mine}.`, 'al', o.team); }
  }

  /** The short to-do list shown while the player is still learning the ropes. */
  /** A scripted raid for campaign jobs: these units climb out of the Brood Pits and walk on the yard. */
  wave(kinds: Kind[], north = false) {
    const g = this.g, pits = g.pits();
    kinds.forEach((k, i) => { const pit = pits.length ? pits[i % pits.length].pos : OUTPOST; const u = g.spawn(k, 1, pit.x - ROAD.dx * 6 + R(-3, 3), pit.z - ROAD.dz * 6 + R(-3, 3)); const tg = north ? [RALLY_N.x * .3 + R(-3, 3), RALLY_N.z * .3 + R(-2, 2)] : roadPt(R(-3, 6), R(-10, -5)); u.order = { type: 'raid', x: tg[0], z: tg[1], path: north ? NORTH_PATH.map(p => [p[0] + R(-3, 3), p[1] + R(-3, 3)]) : undefined }; });
    this.raidLive = true; this.raidAge = 0; this.raidSeen = false; this.raidDir = north ? 'north' : 'east'; sfx.alarm(); if (this.plan?.phase !== 'go') this.regroup(north);
  }
  objectives(): { text: string; done: boolean }[] {
    const g = this.g, o = g.obj, left = g.stones().length;
    if (g.netObjs) return g.netObjs;
    if (g.mission) return g.mission.objectives.map(x => ({ text: x.text(g), done: !!x.done(g) }));
    const foe = foeOf(g.myTeam), fq = FACTION[foe].hq, n = g.ownB(fq, false, foe).length, hqName = BLD[fq].name, verb = ['Break', 'Silence', 'Squash'][fac(foe)];
    const nk = MAP.hid ? g.intel.known(g.myTeam).filter(b => b.kind === fq).length : n;
    const breakAll = MAP.hid && !g.intel.knows(g.myTeam) ? { text: `Find the ${FACTION[foe].short} base (H sends a scout)`, done: false } : { text: nk > 1 ? `${verb} every ${hqName} (${nk} ${MAP.hid ? 'seen' : 'standing'})` : `${verb} the ${hqName}`, done: !n };
    if (fac(g.myTeam) === 2) return [
      { text: 'Chew 30 ore with a Grazer', done: o.drilled >= 30 },
      { text: 'Jump into another body (Tab or F)', done: o.jumped },
      { text: 'Answer the Swarm Lead when they pitch a swarm', done: o.answered },
      breakAll,
    ];
    if (fac(g.myTeam)) return [
      { text: 'Hum 30 ore with a Tender', done: o.drilled >= 30 },
      { text: 'Jump into another body (Tab or F)', done: o.jumped },
      { text: 'Answer the Chorus Lead when they pitch a march', done: o.answered },
      breakAll,
    ];
    return [
      { text: 'Drill 30 ore', done: o.drilled >= 30 },
      { text: 'Jump into another body (Tab or F)', done: o.jumped },
      { text: 'Answer the squad when they pitch a plan', done: o.answered },
      g.eco ? breakAll : { text: `Smash the Choir Stones (${3 - left}/3)`, done: left === 0 },
    ];
  }
}
