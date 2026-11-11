// The strategy layer: the Quartermaster who runs your economy, the Veyl raid planner,
// and the squad's playbooks, callouts and chatter.
import * as THREE from 'three';
import { V3, R, M } from './gfx';
import { sfx } from './audio';
import type { Game } from './game';
import { Kind, BKind, UNIT, BLD, UPGRADES, Unit, Building, Callout, OUTPOST, GATE, RALLY, RALLY_N, NORTH_PATH, MAP, ROAD, veylPt, roadPt, isSoldier } from './data';

const DEPOT_SLOTS = [[-13, 9], [-13, -9], [-19, 0], [-22, 12], [-26, -6], [-20, 22]];
const POST_SLOTS = [[31, 20], [9, -31], [33, 5], [-8, 26]];
const HINTS: [number, string, string][] = [
  [1.5, 'Quartermaster', 'Welcome to Dustbowl 7. Hold click on the green ore to drill. I\'ll handle the paperwork.'],
  [16, 'Quartermaster', 'Press 2 if you want to place buildings yourself. Press G to make me stop.'],
  [70, 'Lookout', 'Veyl outpost is at the end of the road. Three Choir Stones. They will come for us first.'],
  [125, 'Quartermaster', 'There\'s a fat ore seam marked green on your map. Worth the walk.'],
];
const BOOKS = [
  { name: 'Yard Push', steps: ['Open', 'Muster', 'Push'], go: 'Pushing the east yard. Shoot the glowy bits.', label: 'Alpha pushes the east yard' },
  { name: 'Back Door', steps: ['Open', 'Muster', 'Flank'], go: 'Going the long way round. Nobody sneeze.', label: 'Alpha flanks the long way round' },
  { name: 'Last Shift', steps: ['Open', 'Muster', 'All in'], go: 'Everybody goes. Both roads. Leave nothing standing.', label: 'Everyone hits the last Stone' },
];
const CHATTER = [
  'Anyone else\'s boots full of sand? Just me?', 'I was told there\'d be hazard pay.', 'If a Cantor sings at me again I\'m singing back.',
  'Quartermaster owes me nine ore. I counted.', 'That mesa looked at me funny.', 'My gun\'s clean. My record isn\'t.',
  'Do the purple ones have a union? Asking for me.', 'Somebody tell the boss we\'re bored.', 'I had a dream I was a Rigger. Woke up screaming.',
  'Three Stones. Three. I can count that high.', 'Whoever packed lunch packed bolts.', 'Wind\'s changing. Smells like ozone and overtime.',
];
const KILL = ['Purple down!', 'That one\'s done singing.', 'Put it on my tab.', 'Got one. Counting it twice.', 'Scratch one choirboy.'];
const DOWN = ['Man down! Not me. Yet.', 'We lost one. Deduct it from somebody else.', 'They got Kowalski. Again.', 'Medic! We don\'t have one! Medic anyway!'];

/** One group of raiders: where it gathers, where it is going, and whether it has been let off the leash. */
interface Wave { units: Unit[]; sx: number; sz: number; t: number; go: boolean; n0: number; north: boolean; tx: number; tz: number; hunt?: boolean }
export class Director {
  auto = true; qmT = 0; hintI = 0; chatT = 55; barkT = 0;
  plan: { phase: 'ask' | 'count' | 'go'; t: number; target: Building | null; book: number; label: string } | null = null;
  nextPlan = 60; callout: Callout | null = null; pushes = 0; lastFailed = false;
  playbook = { name: 'Yard Push', steps: BOOKS[0].steps, idx: 0 };
  raidIn: number; raidDir: 'east' | 'north' = 'east'; raidN = 0; /** The verse a Veyl player picked for the next raid: 0 all blades, 1 mostly lances, 2 the deep voice. -1 leaves it to the Conductor. */ verse = -1; /** When the Veyl last answered a failed push with a raid of their own. Rationed, so a bad start does not snowball. */ lastCounter = -999; raidLive = false; warned = false; raidAge = 0; raidSeen = false; reinT = 50;
  flags: Record<string, boolean> = {};

  constructor(public g: Game) {
    this.raidIn = 170 * g.diff.raid;
    const guard = (k: Kind, x: number, z: number) => { if (g.net) return; const u = g.spawn(k, 1, x, z); u.order = { type: 'guard', x, z }; };
    for (const [x, z] of [[-14, -5], [-12, 7], [-4, 0], [-18, 1]]) guard('cantor', ...veylPt(x, z));
    for (const [x, z] of [[0, -7], [0, 9]]) guard('lancer', ...veylPt(x, z));
  }

  // ------------------------------------------------------------ squad bookkeeping
  rallyAt(i: number, north = false) { const r = north ? RALLY_N : RALLY; return { x: r.x + ((i % 4) - 1.5) * 2.4, z: r.z + Math.floor(i / 4) * 2.4 }; }
  following() { return this.g.soldiers().some(u => u.order.type === 'follow'); }
  pathFor(book: number, i: number): number[][] | undefined { return book === 1 || (book === 2 && i % 2) ? [...NORTH_PATH].reverse().map(p => [p[0], p[1]]) : undefined; }
  targetFor(book: number): Building | null { const s = this.g.stones(), want = this.g.mission?.target?.(this.g) || null; if (!s.length || want) return want || this.g.buildings.find(b => b.alive && b.team === 1) || null; const w = this.g.ward(s[0].pos); if (w) return w; return book === 1 ? s.reduce((a, b) => a.pos.z < b.pos.z ? a : b) : this.g.nearestStone(RALLY); }
  /** Gives a soldier a place in the squad that matches whatever the squad is doing right now. */
  enlist(u: Unit) {
    const g = this.g; u.slot = g.soldiers().filter(x => x !== u).length;
    if (this.plan?.phase === 'go' && this.plan.target && !this.raidLive && !this.warned) u.order = { type: 'amove', x: this.plan.target.pos.x, z: this.plan.target.pos.z };
    else if (this.following()) u.order = { type: 'follow', x: 0, z: 0, lead: g.soldiers().find(x => x.order.type === 'follow')?.order.lead };
    else { const p = this.rallyAt(u.slot, this.raidLive && this.raidDir === 'north'); u.order = { type: 'guard', x: p.x, z: p.z }; }
  }
  regroup(north = false) { this.g.soldiers().filter(u => u !== this.g.me && u.order.type !== 'follow').forEach((u, i) => { u.slot = i; const p = this.rallyAt(i, north); u.order = { type: 'guard', x: p.x, z: p.z }; }); }
  squadTask() { return this.plan?.phase === 'go' ? BOOKS[this.plan.book].name + ' under way' : this.following() ? 'Following you' : this.raidLive ? 'Holding off the raid' : 'Holding the yard'; }
  say(who: string, msg: string, cls = '') { this.g.feed(who, msg, cls); }
  bark(u: Unit, kind: 'kill' | 'down') { if (this.g.net || this.g.time < this.barkT) return; this.barkT = this.g.time + 7; const l = kind === 'kill' ? KILL : DOWN; this.say(UNIT[u.kind].name, l[Math.floor(Math.random() * l.length)], kind === 'down' ? 'al' : ''); }

  // ------------------------------------------------------------ events from the simulation
  trained(u: Unit) {
    if (u.kind === 'linesman' && !this.flags.line) { this.flags.line = true; this.say('Quartermaster', 'First Linesman on the payroll. Look at them and press F to jump in, or hold Tab.', 'in'); sfx.callout(); }
    if (u.kind === 'longshot' && !this.flags.long) { this.flags.long = true; this.say('Longshot', 'Longshot reporting. Hold right-click for the scope. One shot, then find a new hill.', 'in'); sfx.callout(); }
    if (u.kind === 'patch' && !this.flags.patch) { this.flags.patch = true; this.say('Patch', 'Patch on shift. I mend whoever is closest to dying. As me, press C to top everyone up.', 'in'); sfx.callout(); }
    if (u.kind === 'gantry' && !this.flags.gantry) { this.flags.gantry = true; this.say('Gantry', 'Walker online. Click fires the cannons, C stomps. Jump in, the seat is warm.', 'in'); sfx.callout(); }
    if (u.kind === 'breacher' && !this.flags.breach) { this.flags.breach = true; this.say('Breacher', 'Shield\'s heavy. Hold right-click to hide behind it, click to bash.', 'in'); sfx.callout(); }
  }
  buildingDone(b: Building) {
    if (b.team !== 0) return;
    if (b.kind === 'bunkhouse' && !this.flags.bunk) { this.flags.bunk = true; this.say('Quartermaster', 'Bunkhouse is up. Look at the door and press E for a Linesman.', 'in'); }
    else if (b.kind === 'machineshop') this.say('Quartermaster', 'Machine Shop\'s open. Breachers at the Bunkhouse, upgrades at the bench.', 'in');
    else if (b.kind === 'watchpost') this.say('Lookout', 'Watchpost manned. By a gun. The gun is the man.', '');
  }
  buildingLost(b: Building) {
    const g = this.g;
    if (b.kind === 'reedgate') { this.say('Lookout', 'Reed Gate is down! Their reinforcements just got a lot slower.', 'in'); sfx.callout(); return; }
    if (b.kind === 'broodpit') { const n = g.pits().length; this.say('Lookout', n ? 'Brood Pit caved in! Their raids just got thinner.' : 'Both Brood Pits are gone. Whatever raids are left will be scraps.', 'in'); sfx.callout(); return; }
    if (b.kind === 'thornspire') { this.say('Alpha', 'Thorn Spire down. That one owed me a helmet.', ''); return; }
    if (b.kind === 'wardpylon') { this.say('Lookout', 'Ward Pylon is down! The Stones are soft now. Hit them!', 'in'); sfx.callout(); if (this.plan?.phase === 'go') { this.plan.target = g.nearestStone(b.pos); for (const u of g.soldiers()) if (u.order.type === 'amove' && this.plan.target) u.order = { type: 'amove', x: this.plan.target.pos.x, z: this.plan.target.pos.z }; } return; }
    if (b.kind === 'choir') {
      const left = g.stones().length; this.lastFailed = false;
      if (left && !this.flags.warden) { this.flags.warden = true; const w = g.spawn('warden', 1, OUTPOST.x + 6, OUTPOST.z); w.order = { type: 'guard', x: OUTPOST.x - 4, z: OUTPOST.z }; this.say('Lookout', 'Stone down, and something big just woke up in there. Warden! Stay out of the pink ring.', 'al'); sfx.alarm(); }
      else if (left) this.say('Alpha', left === 1 ? 'One Stone left! I can taste the bonus.' : 'Stone down. Keep swinging.', '');
      if (left && this.plan?.phase === 'go') { this.plan.target = g.nearestStone(b.pos); for (const u of g.soldiers()) if (u.order.type === 'amove' && this.plan.target) u.order = { type: 'amove', x: this.plan.target.pos.x, z: this.plan.target.pos.z }; }
      return;
    }
    if (b.team === 0 && b.kind !== 'headframe') this.say('Quartermaster', `We lost the ${BLD[b.kind].name}. That\'s coming out of somebody\'s pay.`, 'al');
  }

  // ------------------------------------------------------------ orders from the player
  playerOrders(P: Set<string>, eye: THREE.Vector3, dir: THREE.Vector3, lookDist: number) {
    const g = this.g, net = g.net, p = this.plan;
    if (P.has('KeyG')) { if (net) net.cmd('or', 'G'); else this.order('G'); sfx.blip(); }
    if (P.has('KeyV')) { if (net) net.cmd('or', 'V'); else this.order('V'); }
    if (P.has('Mouse1')) { const q = V3(); if (g.groundPoint(q, 160) || (lookDist > 0 && q.copy(eye).addScaledVector(dir, lookDist).setY(0))) { g.hud.ping(q); if (net) net.cmd('or', 'M', Math.round(q.x), Math.round(q.z)); else this.order('M', q.x, q.z); } }
    if (p && p.phase === 'ask') {
      const k = P.has('KeyX') ? 'X' : P.has('KeyZ') ? 'Z' : P.has('KeyC') && p.book < 2 ? 'C' : '';
      if (k) { if (k === 'C') P.delete('KeyC'); g.obj.answered = true; if (net) { net.cmd('or', k); sfx.blip(); } else this.order(k); }
    }
  }
  /** One squad or base order. In multiplayer the server runs this for whichever player sent it, with lead set to their body. */
  order(k: string, x = 0, z = 0, lead: Unit | null = this.g.me) {
    const g = this.g, squad = g.soldiers().filter(u => u !== lead && !u.pilot), p = this.plan;
    if (k === 'G') { this.auto = !this.auto; this.say('Quartermaster', this.auto ? 'Back on the clock. I\'ll handle the building.' : 'Fine. You build it. I\'ll watch.', ''); }
    else if (k === 'V') {
      if (squad.length) { const rel = this.following(); squad.forEach((u, i) => { u.slot = i; const q = this.rallyAt(i); u.order = rel ? { type: 'guard', x: q.x, z: q.z } : { type: 'follow', x: 0, z: 0, lead: lead || undefined }; }); this.say('Alpha', rel ? 'Back to the rally point. Finally, a sit-down.' : 'On you, boss. Try not to get us killed.', ''); this.plan = null; this.callout = null; this.nextPlan = g.time + (rel ? 25 : 60); sfx.callout(); } else sfx.deny();
    }
    else if (k === 'M') {
      if (squad.length) { for (const u of squad) u.order = { type: 'amove', x: x + R(-2.5, 2.5), z: z + R(-2.5, 2.5) }; if (this.plan?.phase !== 'go') { this.plan = null; this.callout = null; this.nextPlan = g.time + 60; } this.say('Alpha', 'Moving. Shooting anything purple on the way.', ''); sfx.callout(); } else sfx.deny();
    }
    else if (p && p.phase === 'ask') {
      if (k === 'X') { this.plan = null; this.callout = null; this.nextPlan = g.time + 40; this.say('Alpha', 'Holding. Wake us when you\'re ready.', ''); sfx.blip(); }
      else if (k === 'Z') this.accept(true);
      else if (k === 'C' && p.book < 2) { p.book = 1 - p.book; p.label = BOOKS[p.book].label; this.accept(true); }
    }
  }
  accept(byPlayer: boolean) {
    const p = this.plan!; p.phase = 'count'; p.t = byPlayer ? 5 : 12; this.callout = null; if (byPlayer) this.g.obj.answered = true;
    this.say('Alpha', byPlayer ? (p.book === 1 ? 'Back door it is. Sneaky. I like it.' : 'That\'s the spirit. Moving out.') : 'No answer. Taking that as a yes.', ''); sfx.blip();
  }

  // ------------------------------------------------------------ every frame
  update(dt: number) {
    // A crew with no Riggers and no money is not out of the game: the Charter fronts enough for one more.
    if (this.g.ore < 50 && !this.g.own('rigger').length && this.g.ownB('headframe').length) this.g.ore = Math.min(50, this.g.ore + dt * 2.5);
    const g = this.g, now = g.time;
    if (!g.mission) while (this.hintI < HINTS.length && now >= HINTS[this.hintI][0]) { const h = HINTS[this.hintI++]; this.say(h[1], h[2], 'in'); }
    if (this.callout) this.callout.t -= dt;
    this.quartermaster(dt); this.enemy(dt); this.squad(dt);
    // idle chatter
    this.chatT -= dt; if (this.chatT <= 0) { this.chatT = R(38, 70); const s = g.soldiers().filter(u => u !== g.me && !u.target); if (s.length >= 2 && !this.raidLive && !this.callout) { const u = s[Math.floor(Math.random() * s.length)]; this.say(UNIT[u.kind].name, CHATTER[Math.floor(Math.random() * CHATTER.length)], ''); } }
    const b = this.plan ? BOOKS[this.plan.book] : BOOKS[0]; this.playbook.name = b.name; this.playbook.steps = b.steps; this.playbook.idx = !g.ownB('bunkhouse', true).length ? 0 : this.plan?.phase === 'go' ? 2 : 1;
  }

  quartermaster(dt: number) {
    const g = this.g; this.qmT -= dt; if (this.qmT > 0 || !this.auto) return; this.qmT = 1;
    const hq = g.ownB('headframe', true)[0], bunk = g.ownB('bunkhouse'), bunkUp = bunk.filter(b => b.built), sites = g.ownB().filter(b => !b.built), shop = g.ownB('machineshop'), shopUp = shop.some(b => b.built);
    const free = g.supplyCap() - g.supplyUsed(), army = g.soldiers().length, posts = g.ownB('watchpost').length, building = sites.length > 0;
    const wantDepot = bunk.length > 0 && free <= 3 && !sites.some(b => b.kind === 'depot') && g.ownB('depot').length < 6;
    const put = (k: BKind, x: number, z: number, line: string) => { if (g.ore < BLD[k].cost || (g.mission && !g.mission.allow.includes(k)) || !g.canPlace(k, x, z, false)) return false; g.place(k, x, z, false); this.say('Quartermaster', line, ''); return true; };
    const wantPosts = army >= 3 ? 1 + (this.raidN >= 2 ? 1 : 0) + (this.raidN >= 4 ? 1 : 0) : 0;
    // One goal at a time, in priority order. While a goal is unpaid, training holds back a reserve so the goal gets bought.
    let saving = true, hold = 95; const fdy = g.ownB('foundry'), fdyB = fdy.find(b => b.built), lab = g.ownB('assay'), labUp = lab.some(b => b.built), mast = g.ownB('mast'), mastUp = mast.some(b => b.built);
    const spot = (k: BKind, slots: number[][], line: string) => { const sl = slots.find(([x, z]) => g.canPlace(k, x, z, false)); return !!sl && put(k, sl[0], sl[1], line); };
    // research the yard can afford without starving the big purchases: bought when there is ore to spare
    const spare = (keys: string[]) => { for (const k of keys) { const u = UPGRADES.find(x => x.key === k)!; if (!g.up[u.key] && g.ownB(u.at, true).length && (!u.needs || g.up[u.needs]) && g.ore >= u.cost + 120) return g.buyUpgrade(u.key); } return false; };
    if (!bunk.length) put('bunkhouse', 15, 8, 'Staking out a Bunkhouse. Then we get rich.');
    else if (wantDepot) { const s = DEPOT_SLOTS.find(([x, z]) => g.canPlace('depot', x, z, false)); if (s) put('depot', s[0], s[1], 'Running out of beds. Stacking another Depot.'); }
    else if (building) saving = false;
    else if (bunkUp.length && posts < Math.min(1, wantPosts)) { const s = POST_SLOTS.find(([x, z]) => g.canPlace('watchpost', x, z, false)); if (s) put('watchpost', s[0], s[1], 'Putting a Watchpost on the east road. For my nerves.'); }
    else if (bunkUp.length && !shop.length && army >= 4) put('machineshop', 0, -15, 'Machine Shop going in out back. Bigger guns, thicker hats.');
    else if (bunkUp.length && posts < wantPosts) { const s = POST_SLOTS.find(([x, z]) => g.canPlace('watchpost', x, z, false)); if (s) put('watchpost', s[0], s[1], 'Another Watchpost. I sleep better with crossfire.'); }
    else if (shopUp && !g.up.dmg && army >= 5) g.buyUpgrade('dmg');
    else if (shopUp && g.up.dmg && !fdy.length && army >= 7) { hold = 150; const sl = [[-14, -14], [-15, 6], [15, -17], [-4, -28]].find(([x, z]) => g.canPlace('foundry', x, z, false)); if (sl) put('foundry', sl[0], sl[1], 'Foundry going up. Walkers, and the good plating.'); }
    else if (fdyB && army >= 6 && free >= 4 && g.own('gantry').length + fdyB.queue.length < (g.time > 660 ? 2 : 1)) { hold = UNIT.gantry.cost; if (g.ore >= hold) g.train(fdyB, 'gantry'); }
    else if (fdyB && !lab.length && army >= 6 && (!g.mission || g.mission.allow.includes('assay'))) spot('assay', [[-15, 6], [15, -17], [-16, 18], [14, 22]], 'Assay Office going up. Longshots, and people who read.');
    else if (bunkUp.length === 1 && bunk.length === 1 && g.time > 230) put('bunkhouse', 4, 23, 'Second Bunkhouse. Twice the complaints.');
    else if (shopUp && !g.up.armor && army >= 6) g.buyUpgrade('armor');
    else if (fdyB && !g.up.dmg2 && army >= 9) { hold = 150; g.buyUpgrade('dmg2'); }
    else if (fdyB && !g.up.armor2 && army >= 10) { hold = 150; g.buyUpgrade('armor2'); }
    else if (fdyB && labUp && !mast.length && g.up.dmg2 && army >= 10 && (!g.mission || g.mission.allow.includes('mast'))) { hold = 200; spot('mast', [[15, -17], [-4, -28], [-16, 18], [-24, -4], [14, 22]], 'Signal Mast going up. Head office wants to listen in, and they pay in kit.'); }
    else if (mastUp && !g.up.dmg3 && army >= 10) { hold = 200; g.buyUpgrade('dmg3'); }
    else if (mastUp && !g.up.armor3 && army >= 11) { hold = 200; g.buyUpgrade('armor3'); }
    else if (spare(['drill', 'post', 'pay', 'stitch', 'glass', 'beds', 'servo', 'weld', 'buckets', 'frag'])) saving = true;
    else saving = false;
    if (hq && !hq.queue.length && g.own('rigger').length < 8 && free > 0 && g.ore >= 50 && (bunk.length || g.own('rigger').length < 6)) g.train(hq, 'rigger');
    const heavy = g.own('breacher').length, light = g.own('linesman').length;
    const docs = g.own('patch').length, longs = g.own('longshot').length;
    for (const b of bunkUp) if (b.queue.length < 2) {
      const q = (k: Kind) => b.queue.filter(x => x.kind === k).length;
      const k: Kind = labUp && light >= 4 && longs + q('longshot') < Math.floor(light / 4) && free >= 2 ? 'longshot' : shopUp && army >= 5 && docs + q('patch') < 1 + Math.floor(army / 10) ? 'patch' : shopUp && heavy + q('breacher') < Math.floor(light / 3) && free >= 2 ? 'breacher' : 'linesman';
      if (g.ore >= UNIT[k].cost + (saving ? hold : 0)) g.train(b, k);
    }
  }

  waves: Wave[] = []; private remnant: Unit[] = []; private spireHome: number[][] | null = null; private growT = 110;
  /** Counts down while the Veyl base is under fire, and where the shooting is coming from. */
  alarmT = 0; alarmX = 0; alarmZ = 0; private alarmCd = 0; private alarmN = 0;
  /** A Veyl building was hit. The garrison goes looking for whoever did it, and the Reed Gate starts sending help. */
  alarm(from: Unit) { if (from.team !== 0) return; if (this.alarmT <= 0) this.alarmCd = Math.min(this.alarmCd, 2); this.alarmT = 14; this.alarmX = from.pos.x; this.alarmZ = from.pos.z; }
  enemy(dt: number) {
    const g = this.g, stones = g.stones(); if (!stones.length) return;
    const gate = g.gate(), pits = g.pits(), src = gate ? { x: GATE.x - 6, z: GATE.z } : { x: OUTPOST.x, z: OUTPOST.z };
    this.raidAge += dt; const close = (r: number) => g.units.some(u => u.alive && u.team === 1 && u.order.type === 'raid' && Math.hypot(u.pos.x, u.pos.z) < r); if (this.raidLive && !this.raidSeen && close(60)) this.raidSeen = true;
    if (this.raidLive && (this.raidSeen || this.raidAge > 75 ? !close(78) : !g.units.some(u => u.alive && u.team === 1 && u.order.type === 'raid'))) { this.raidLive = false; this.say('Alpha', 'Yard\'s clear. Somebody sweep up the purple.', ''); if (this.plan?.phase !== 'go') this.regroup(); }
    if (g.mission && !g.mission.raids) this.raidIn = 999;
    this.raidIn -= dt;
    if (this.raidIn < 15 && !this.warned) {
      this.warned = true; this.raidDir = this.raidN >= 2 && this.raidN % 2 === 0 ? 'north' : 'east';
      this.say('Lookout', this.raidDir === 'north' ? `Movement on the ${MAP.flankName}! They're coming round the back.` : `Dust on the ${MAP.road}. Raid inbound.`, 'al'); sfx.alarm();
      if (this.plan?.phase !== 'go') this.regroup(this.raidDir === 'north');
    }
    if (this.raidIn <= 0) {
      const n = this.raidN++; this.raidIn = 92 * g.diff.raid; this.warned = false; this.raidLive = true; this.raidAge = 0; this.raidSeen = false;
      let budget = Math.min(11 + 4 * (g.coop - 1), (2 + n * .8) * g.diff.enemy * (1 + .4 * (g.coop - 1))) * (gate ? 1 : .6) * (pits.length ? .6 + .2 * pits.length : .35); const north = this.raidDir === 'north'; let count = 0;
      // The Conductor reads the yard before it writes the raid: what is standing guard, and what would hurt most to lose.
      const posts = g.ownB('watchpost', true), longs = g.own('longshot').length, heavies = g.own('breacher').length + 2 * g.own('gantry').length, riggers = g.own('rigger').filter(u => !u.pilot && u.node);
      let share = n >= 1 ? .3 : 0; if (posts.length >= 2 || heavies >= 3) share += .2; if (longs >= 2) share -= .15; share = n >= 1 ? Math.max(.1, Math.min(.55, share)) : 0;
      const verse = this.verse; this.verse = -1; if (verse === 0) { share = 0; budget += 1.5; } else if (verse === 1) share = .75;
      // Day shift gets the plain version: one group, straight down the road, no tricks.
      const smart = g.diff.enemy >= 1, pincer = smart && n >= 3 && budget >= 6 && (n % 3 === 0 || posts.length >= 3), harass = smart && n >= 2 && n % 2 === 1 && budget >= 5 && riggers.length > 0;
      // the softest building: the one furthest from any Watchpost, with the Headframe as the default
      const soft = g.ownB().filter(b => b.built && b.kind !== 'watchpost').map(b => ({ b, d: posts.reduce((m, p) => Math.min(m, Math.hypot(p.pos.x - b.pos.x, p.pos.z - b.pos.z)), 60) + (b.kind === 'depot' ? 6 : b.kind === 'headframe' ? -8 : 0) })).sort((a, c) => c.d - a.d)[0];
      const aim = (): [number, number] => soft && smart && n >= 2 && soft.d > 30 ? [soft.b.pos.x + R(-3, 3), soft.b.pos.z + soft.b.hz + R(2, 4)] : roadPt(R(-3, 6), R(-10, -5));
      const mk = (viaNorth: boolean): Wave => { const st = viaNorth ? NORTH_PATH[Math.max(0, NORTH_PATH.length - 2)] : roadPt(Math.min(ROAD.len * .45, 56), 0), w: Wave = { units: [], sx: st[0], sz: st[1], t: 0, go: false, n0: 0, north: viaNorth, tx: 0, tz: 0 }; const a = viaNorth ? [RALLY_N.x * .3 + R(-3, 3), RALLY_N.z * .3 + R(-2, 2)] : aim(); w.tx = a[0]; w.tz = a[1]; if (!smart) { w.go = true; w.sx = w.tx; w.sz = w.tz; } this.waves.push(w); return w; };
      const main = mk(north), side = pincer ? mk(!north) : null, raiders = harass ? mk(!north && NORTH_PATH.length > 1) : null;
      if (raiders) { const r = riggers[Math.floor(Math.random() * riggers.length)]; raiders.tx = r.node!.pos.x; raiders.tz = r.node!.pos.z; raiders.hunt = true; }
      const send = (k: Kind, w: Wave) => {
        const pit = pits.length ? pits[count % pits.length] : null; const u = pit ? g.spawn(k, 1, pit.pos.x - ROAD.dx * 5.5 + R(-2, 2), pit.pos.z - ROAD.dz * 5.5 + R(-2, 2)) : g.spawn(k, 1, src.x - 8 + R(-4, 4), src.z + R(-7, 7)); if (pit) g.puff(V3(u.pos.x, 1, u.pos.z), 5, 1, M.violet, .8);
        const stop = w.north ? (w.go ? NORTH_PATH.length : Math.max(0, NORTH_PATH.length - 2)) : -1; u.order = { type: 'raid', x: w.sx + R(-4, 4), z: w.sz + R(-4, 4), path: w.north ? NORTH_PATH.slice(0, stop).map(p => [p[0] + R(-3, 3), p[1] + R(-3, 3)]) : undefined }; w.units.push(u); w.n0++; count++;
      };
      for (const u of this.remnant) if (u.alive) { main.units.push(u); main.n0++; u.order = { type: 'raid', x: main.sx + R(-4, 4), z: main.sz + R(-4, 4) }; } this.remnant = [];
      if ((n >= 4 && n % 3 === 1 && budget >= 6) || (verse === 2 && n >= 3)) { send('warden', main); budget = Math.max(1, budget - 5); }
      if (raiders) { send('cantor', raiders); send('cantor', raiders); budget -= 2; }
      const lancers = Math.floor(budget * share), cantors = Math.max(1, Math.round(budget - lancers));
      for (let i = 0; i < lancers; i++) send('lancer', side && i % 3 === 2 ? side : main);
      for (let i = 0; i < cantors; i++) send('cantor', side && i % 3 === 1 ? side : main);
      this.say('Lookout', pincer ? `${count} Veyl, and they have split up. Some on the ${MAP.road}, some over the ${MAP.flankName}.` : `${count} Veyl ${north ? 'coming over the ' + MAP.flankName : 'coming down the ' + MAP.road}. ${raiders ? 'A couple peeled off toward the diggers.' : 'They look annoyed.'}`, 'al');
    }
    // Raiders gather out of gun range and go in together. A beaten raid pulls its survivors back to join the next one.
    for (let i = this.waves.length - 1; i >= 0; i--) {
      const w = this.waves[i]; w.units = w.units.filter(u => u.alive); if (!w.units.length) { this.waves.splice(i, 1); continue; }
      if (!w.go) {
        const there = w.units.filter(u => Math.hypot(u.pos.x - w.sx, u.pos.z - w.sz) < 11).length; if (there) w.t += dt;
        if (there >= w.units.length * .8 || w.t > 30 || w.units.some(u => u.target && g.time - u.lastHit < 2)) { w.go = true; w.t = 0; const rest = w.north ? NORTH_PATH.slice(Math.max(0, NORTH_PATH.length - 2)) : []; for (const u of w.units) u.order = { type: 'raid', x: w.tx + R(-3, 3), z: w.tz + R(-3, 3), path: rest.length ? rest.map(p => [p[0] + R(-3, 3), p[1] + R(-3, 3)]) : undefined }; }
      } else {
        w.t += dt;
        if (g.diff.enemy >= 1 && w.n0 >= 4 && w.units.length <= Math.max(1, Math.floor(w.n0 * .25)) && !w.units.some(u => u.kind === 'warden') && stones.length) { for (const u of w.units) { u.order = { type: 'raid', x: roadPt(ROAD.len * .75, 0)[0] + R(-4, 4), z: roadPt(ROAD.len * .75, 0)[1] + R(-4, 4) }; u.target = null; this.remnant.push(u); } this.waves.splice(i, 1); this.say('Lookout', 'They are pulling back. That will not be the last of them.', ''); continue; }
        // Nothing left to hit where they stand: move on to the nearest thing that is still up.
        if (w.t > 2) { w.t = 0; for (const u of w.units) { if (u.target || (u.order.path && u.order.path.length) || Math.hypot(u.pos.x - u.order.x, u.pos.z - u.order.z) > 7) continue; let bd = 1e9, nb: Building | null = null; for (const b of g.buildings) if (b.alive && b.team === 0) { const d = Math.hypot(b.pos.x - u.pos.x, b.pos.z - u.pos.z); if (d < bd) { bd = d; nb = b; } } if (nb) { u.order.x = nb.pos.x + R(-2, 2); u.order.z = nb.pos.z + nb.hz + R(1, 3); } } }
      }
    }
    // Broken Thorn Spires grow back while the Stones still sing and nobody is near to stop them.
    if (!this.spireHome) this.spireHome = g.buildings.filter(b => b.kind === 'thornspire').map(b => [b.pos.x, b.pos.z]);
    this.growT -= dt; if (this.growT <= 0) { this.growT = 110 / g.diff.enemy; const gone = g.diff.enemy < 1 ? undefined : this.spireHome.find(([x, z]) => !g.buildings.some(b => b.alive && b.kind === 'thornspire' && Math.abs(b.pos.x - x) < 1 && Math.abs(b.pos.z - z) < 1)); if (gone && !g.units.some(u => u.alive && u.team === 0 && Math.hypot(u.pos.x - gone[0], u.pos.z - gone[1]) < 55)) { g.addBuilding('thornspire', 1, gone[0], gone[1], true); g.puff(V3(gone[0], 2, gone[1]), 8, 1.6, M.violet, 1); } }
    if (this.alarmT > 0) {
      this.alarmT -= dt; this.alarmCd -= dt; const def = g.units.filter(u => u.alive && u.team === 1 && u.order.type === 'guard' && u.kind !== 'warden' && !u.pilot);
      // Guards with nothing to fight walk out to the shooter, however far away the shooter thinks is safe.
      for (const u of def) if (!u.target) { u.order.x = this.alarmX + ((u.id * 7) % 9 - 4); u.order.z = this.alarmZ + ((u.id * 5) % 9 - 4); }
      // The Chorus swarms anyone who comes alone. A proper push meets the usual garrison and a little extra.
      const crowd = g.units.filter(u => u.alive && u.team === 0 && u.kind !== 'rigger' && Math.hypot(u.pos.x - this.alarmX, u.pos.z - this.alarmZ) < 45).length, lone = crowd <= 2 * g.coop;
      const cap = Math.round((4 + stones.length + (lone ? 3 + Math.min(5, g.time / 150) : crowd <= 4 ? 2 : 1)) * g.diff.enemy * (1 + .4 * (g.coop - 1)));
      if (this.alarmCd <= 0 && def.length < cap) {
        this.alarmCd = (gate ? (lone ? 4.5 : 9) : 12) / g.diff.enemy; const k: Kind = this.alarmN++ % 3 === 2 ? 'lancer' : 'cantor', u = g.spawn(k, 1, src.x + R(-2, 2), src.z + R(-3, 3));
        u.order = { type: 'guard', x: this.alarmX + R(-3, 3), z: this.alarmZ + R(-3, 3) }; g.puff(V3(u.pos.x, 1, u.pos.z), 5, 1, M.violet, .8);
      }
      if (this.alarmT <= 0) for (const u of def) { u.order.x = OUTPOST.x - 8 + R(-8, 4); u.order.z = OUTPOST.z + R(-9, 9); }
    }
    this.reinT -= dt;
    if (this.reinT <= 0) {
      this.reinT = gate ? 24 : 60; const guards = g.units.filter(u => u.alive && u.team === 1 && u.order.type === 'guard' && u.kind !== 'warden');
      if (guards.length < 4 + stones.length) { const k: Kind = guards.filter(u => u.kind === 'lancer').length < 2 ? 'lancer' : 'cantor'; const u = g.spawn(k, 1, src.x + R(-2, 2), src.z + R(-3, 3)); u.order = { type: 'guard', x: OUTPOST.x - 8 + R(-8, 4), z: OUTPOST.z + R(-9, 9) }; }
    }
  }

  squad(dt: number) {
    const g = this.g, now = g.time, all = g.soldiers(), idle = all.filter(u => u.order.type === 'guard' && u !== g.me && !u.pilot), stones = g.stones();
    if (!this.plan && now > this.nextPlan && (stones.length || (g.mission && this.targetFor(0))) && !this.raidLive && !this.warned) {
      const last = stones.length === 1, need = last ? 5 : 6;
      if (idle.length >= need) {
        const book = last ? 2 : this.lastFailed || this.pushes % 2 === 1 ? 1 : 0; this.plan = { phase: 'ask', t: 10, target: null, book, label: BOOKS[book].label };
        const text = book === 2 ? `One Stone left and ${idle.length} of us itching. <b>Everybody goes, both roads. Yes?</b>` : book === 1 ? `Front door ${this.lastFailed ? 'went badly' : 'is getting old'}. ${idle.length} of us go round by the <b>${MAP.flankName}</b> and hit them from behind. <b>You in?</b>` : `${idle.length} of us are standing around. We hit their east yard in twenty. <b>You in, or what?</b>`;
        this.callout = { who: 'Alpha Lead', text, t: 10, dur: 10, keys: book === 2 ? [['Z', 'Do it'], ['X', 'Hold']] : [['Z', 'Do it'], ['C', book ? 'Front door' : 'Back door'], ['X', 'Hold']] }; sfx.callout();
      }
    }
    const p = this.plan; if (!p) return; p.t -= dt;
    if (p.phase === 'ask') { if (p.t <= 0) this.accept(false); }
    else if (p.phase === 'count') {
      if (p.t <= 0) {
        p.phase = 'go'; p.target = this.targetFor(p.book); this.pushes++;
        if (p.target) { let i = 0; for (const u of all) if (u !== g.me && !u.pilot && u.order.type === 'guard') { u.order = { type: 'amove', x: p.target.pos.x + R(-3, 3), z: p.target.pos.z + R(-3, 3), path: this.pathFor(p.book, i++) }; } }
        this.say('Alpha', BOOKS[p.book].go, ''); sfx.callout();
      }
    } else {
      const pushing = all.filter(u => u.order.type === 'amove');
      if (!pushing.length || (pushing.length < 2 && all.length < 3)) { this.plan = null; this.nextPlan = now + 40; this.lastFailed = true; this.regroup(); this.say('Alpha', 'Push is spent. Pulling back to regroup.', 'al'); if (g.diff.enemy >= 1 && stones.length && !(g.mission && !g.mission.raids) && g.time > 300 && now - this.lastCounter > 150) { this.lastCounter = now; this.raidIn = Math.min(this.raidIn, 22); } }
    }
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
    if (g.mission) return g.mission.objectives.map(x => ({ text: x.text(g), done: !!x.done(g) }));
    if (g.myTeam) return [
      { text: 'Jump between Veyl bodies (Tab or F)', done: o.jumped },
      { text: 'Call a raid and march with it (G)', done: g.raidCall > 0 },
      { text: `Keep a Choir Stone singing (${left} left)`, done: false },
      { text: 'Break the Headframe', done: !g.ownB('headframe').length },
    ];
    return [
      { text: 'Drill 30 ore', done: o.drilled >= 30 },
      { text: 'Jump into another body (Tab or F)', done: o.jumped },
      { text: 'Answer the squad when they pitch a plan', done: o.answered },
      { text: `Smash the Choir Stones (${3 - left}/3)`, done: left === 0 },
    ];
  }
}
