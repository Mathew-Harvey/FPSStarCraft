// The strategy layer: the Quartermaster who runs your economy, the Veyl raid planner,
// and the squad's playbooks, callouts and chatter.
import * as THREE from 'three';
import { V3, R, M } from './gfx';
import { sfx } from './audio';
import type { Game } from './game';
import { Kind, BKind, UNIT, BLD, UPGRADES, Unit, Building, Callout, OUTPOST, GATE, RALLY, RALLY_N, VRALLY, VRALLY_N, VHOME, NORTH_PATH, MAP, MAPS, ROAD, FACTION, SIDE, veylPt, roadPt, isSoldier, foeOf, fac, atHome, endPt, swapEnd, homeXZ } from './data';
import { overgrowth, GHINTS, GBOOKS, GCHATTER, GKILL, GDOWN, IKILL_G, ICHATTER_G } from './gloam-ai';
/** One line for whichever side holds the outpost: the Veyl's, or the Gloam's. */
const VG = (team: number, veyl: string, gloam: string) => fac(team) === 2 ? gloam : veyl;
/** Who calls out what they see, for each faction. */
const LOOKOUT = ['Lookout', 'Watcher', 'Rootwatch'];

const DEPOT_SLOTS = [[-13, 9], [-13, -9], [-19, 0], [-22, 12], [-26, -6], [-20, 22]];
const POST_SLOTS_0 = [[31, 20], [9, -31], [33, 5], [-8, 26]];
/** Watchpost spots covering the road the raids walk down and the flank. Worked out from the map, so they face the Veyl on every map. */
/** A push that is down to this share of the bodies it set off with goes home. */
const RETREAT = .4;
function postSlots(): number[][] {
  if ((MAP.like ?? MAP.base) === 0 && MAP.size === 0) return POST_SLOTS_0;
  const e = MAP.flank[MAP.flank.length - 1], el = Math.hypot(e[0], e[1]) || 1, r = (p: [number, number]) => [Math.round(p[0]), Math.round(p[1])];
  return [r(roadPt(31, 6)), [Math.round(e[0] / el * 30), Math.round(e[1] / el * 30)], r(roadPt(33, -9)), r(roadPt(-8, 12))];
}
const HINTS: [number, string, string][] = [
  [1.5, 'Quartermaster', 'Welcome to Dustbowl 7. Hold click on the green ore to drill, then walk the pack back to the Headframe. I\'ll handle the paperwork.'],
  [16, 'Quartermaster', 'Press 2 if you want to place buildings yourself. Press G to make me stop.'],
  [70, 'Lookout', 'Veyl outpost is at the end of the road. Three Choir Stones. They will come for us first.'],
  [125, 'Quartermaster', 'The map is dark until somebody walks it. There are more ore fields out there: find them, then stake a Headframe next to one (press 2) and it becomes a new base.'],
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
// The Veyl side, when somebody plays it.
const VHINTS: [number, string, string][] = [
  [1.5, 'Conductor', 'The Chorus wakes. Hold click on the green ore to hum it loose, then carry it to the Choir Stone. I will tend the rest.'],
  [16, 'Conductor', 'Press 2 to seed buildings yourself. Press G and I will stop.'],
  [70, 'Watcher', 'The Ironhold yard is at the end of the road. Break every Headframe and the valley is ours.'],
  [125, 'Conductor', 'The map is dark until a voice walks it. Find another seam and seed a Choir Stone beside it (press 2). It becomes a new home.'],
];
const VBOOKS = [
  { name: 'Road Song', steps: ['Gather', 'Swell', 'March'], go: 'Down the road, all of us. Sing them out of their bunks.', label: 'The Chorus marches down the road' },
  { name: 'Ridge Song', steps: ['Gather', 'Swell', 'Circle'], go: 'Over the ridge. They will hear us when it is too late.', label: 'The Chorus circles over the ridge' },
  { name: 'Final Verse', steps: ['Gather', 'Swell', 'All voices'], go: 'Every voice, both roads. Let the last Headframe fall.', label: 'Every voice on the last Headframe' },
];
const VCHATTER = [
  'The rock here hums in a minor key. I do not care for it.', 'The Ironhold sing so badly. All hammer, no tune.', 'My shell itches. It means rain, or rifles.',
  'Another Tender asked me what silence sounds like. I did not answer.', 'The Stones are restless tonight.', 'I counted the stars. One of them is a Headframe light.',
  'If they shoot at me again I will sing louder.', 'Somebody keeps humming flat. It is not me.',
];
const VKILL = ['One fewer hammer.', 'That one has stopped banging.', 'The rust takes them.', 'Quiet, at last.'];
const VDOWN = ['A voice is gone.', 'We are one fewer.', 'The song thins.', 'They broke a shell. Remember it.'];

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
}

/** One group of raiders: where it gathers, where it is going, and whether it has been let off the leash. */
interface Wave { units: Unit[]; sx: number; sz: number; t: number; go: boolean; n0: number; north: boolean; tx: number; tz: number; hunt?: boolean }
export class Director implements Side {
  team = 0; flip = false; retarget = 0; auto = true; qmT = 0; hintI = 0; chatT = 55; barkT = 0;
  /** The Veyl side's brain, used when they run their own economy. */
  vs: Side = { team: 1, auto: true, qmT: 0, hintI: 0, chatT: 70, plan: null, nextPlan: 75, callout: null, pushes: 0, lastFailed: false, fails: 0, playbook: { name: VBOOKS[0].name, steps: VBOOKS[0].steps, idx: 0 }, raidLive: false, retarget: 0 };
  side(team: number): Side { return atHome(team) ? this : this.vs; }
  plan: { phase: 'ask' | 'count' | 'go'; t: number; target: Building | null; book: number; label: string; goT?: number; n0?: number } | null = null; brokeT = 0;
  nextPlan = 60; callout: Callout | null = null; pushes = 0; lastFailed = false; /** Pushes in a row that broke nothing. */ fails = 0;
  playbook = { name: 'Yard Push', steps: BOOKS[0].steps, idx: 0 };
  raidIn: number; raidDir: 'east' | 'north' = 'east'; raidN = 0; /** The verse a Veyl player picked for the next raid: 0 all blades, 1 mostly lances, 2 the deep voice. -1 leaves it to the Conductor. */ verse = -1; /** When the Veyl last answered a failed push with a raid of their own. Rationed, so a bad start does not snowball. */ lastCounter = -999; raidLive = false; warned = false; raidAge = 0; raidSeen = false; reinT = 50;
  flags: Record<string, boolean> = {};

  constructor(public g: Game) {
    this.team = SIDE.home; this.vs.team = SIDE.out;
    for (const s of [this, this.vs] as Side[]) { const b = this.books(s)[0]; s.playbook = { name: b.name, steps: b.steps, idx: 0 }; }
    this.raidIn = g.eco ? 1e9 : 170 * g.diff.raid;
    // Two built bases that are not the classic Ironhold-against-Veyl pairing start on the same clock, so neither end plans its first push sooner.
    if (g.eco && !(fac(SIDE.home) === 0 && fac(SIDE.out) !== 0)) { this.vs.nextPlan = this.nextPlan; this.vs.chatT = this.chatT; }
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
  rallyAt(i: number, north = false, s: Side = this) { const r = atHome(s.team) ? (north ? RALLY_N : RALLY) : north ? VRALLY_N : VRALLY; return { x: r.x + ((i % 4) - 1.5) * 2.4, z: r.z + Math.floor(i / 4) * 2.4 }; }
  following(s: Side = this) { return this.g.army(s.team).some(u => u.order.type === 'follow'); }
  books(s: Side) { const f = fac(s.team); return f === 2 ? GBOOKS : f ? VBOOKS : BOOKS; }
  pathFor(book: number, i: number, s: Side = this): number[][] | undefined { return book === 1 || (book === 2 && i % 2) ? (!atHome(s.team) ? [...NORTH_PATH] : [...NORTH_PATH].reverse()).map(p => [p[0], p[1]]) : undefined; }
  targetFor(book: number, s: Side = this): Building | null {
    const g = this.g;
    if (g.eco) {
      // Every side that runs an economy: the enemy building nearest the way in, the nearest of their bases when it is all in, and a Ward Pylon first if one shields it.
      const foe = foeOf(s.team), all = g.ownB(undefined, false, foe), hqs = g.ownB(FACTION[foe].hq, false, foe), want = g.mission?.target?.(g) || null; if (want) return want; if (!all.length) return null;
      const from = book === 1 ? (atHome(s.team) ? NORTH_PATH[0] : NORTH_PATH[NORTH_PATH.length - 1]) : atHome(s.team) ? [RALLY.x, RALLY.z] : [VRALLY.x, VRALLY.z];
      const near = (l: Building[]) => l.reduce((a, b) => Math.hypot(a.pos.x - from[0], a.pos.z - from[1]) < Math.hypot(b.pos.x - from[0], b.pos.z - from[1]) ? a : b);
      const t = book === 2 && hqs.length ? near(hqs) : near(all);
      if (fac(foe) === 1 && t.kind === 'choir') { const w = g.ward(t.pos, foe); if (w) return w; }
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
  regroup(north = false, s: Side = this) { this.g.army(s.team).filter(u => u !== this.g.me && !u.pilot && u.order.type !== 'follow').forEach((u, i) => { u.slot = i; const p = this.rallyAt(i, north, s); u.order = { type: 'guard', x: p.x, z: p.z }; }); }
  squadTask(s: Side = this) { return s.plan?.phase === 'go' ? this.books(s)[s.plan.book].name + ' under way' : this.following(s) ? 'Following you' : s.raidLive ? (fac(s.team) ? 'Holding off the push' : 'Holding off the raid') : fac(s.team) === 2 ? 'Lurking in the Bloom' : fac(s.team) ? 'Guarding the Stones' : 'Holding the yard'; }
  say(who: string, msg: string, cls = '', team = -1) { this.g.feed(who, msg, cls, team); }
  bark(u: Unit, kind: 'kill' | 'down') { if (this.g.net || this.g.time < this.barkT) return; this.barkT = this.g.time + 7; const f = fac(u.team), l = f === 2 ? (kind === 'kill' ? GKILL : GDOWN) : f ? (kind === 'kill' ? VKILL : VDOWN) : kind === 'kill' ? (fac(foeOf(u.team)) === 2 ? IKILL_G : KILL) : DOWN; this.say(UNIT[u.kind].name, l[Math.floor(Math.random() * l.length)], kind === 'down' ? 'al' : ''); }

  // ------------------------------------------------------------ events from the simulation
  trained(u: Unit) {
    if (u.kind === 'linesman' && !this.flags.line) { this.flags.line = true; this.say('Quartermaster', 'First Linesman on the payroll. Look at them and press F to jump in, or hold Tab.', 'in', u.team); sfx.callout(); }
    if (u.kind === 'longshot' && !this.flags.long) { this.flags.long = true; this.say('Longshot', 'Longshot reporting. Hold right-click for the scope. One shot, then find a new hill.', 'in', u.team); sfx.callout(); }
    if (u.kind === 'patch' && !this.flags.patch) { this.flags.patch = true; this.say('Patch', 'Patch on shift. I mend whoever is closest to dying. As me, press C to top everyone up.', 'in', u.team); sfx.callout(); }
    if (u.kind === 'gantry' && !this.flags.gantry) { this.flags.gantry = true; this.say('Gantry', 'Walker online. Click fires the cannons, C stomps. Jump in, the seat is warm.', 'in', u.team); sfx.callout(); }
    if (fac(u.team) === 2) {
      if (u.kind === 'snapper' && !this.flags.gsn) { this.flags.gsn = true; this.say('Snapper', 'Two of us, fresh from the Bud. Look at me and press F. Click bites, right click pounces.', 'in', u.team); sfx.callout(); }
      if (u.kind === 'quillback' && !this.flags.gqb) { this.flags.gqb = true; this.say('Quillback', 'A Quillback, bristling. Click spits a quill; right click throws a fan of five.', 'in', u.team); sfx.callout(); }
      if (u.kind === 'blister' && !this.flags.gbl) { this.flags.gbl = true; this.say('Blister', 'I am a Blister. Carry me into a crowd, click, and I pop. You will need a new body after.', 'in', u.team); sfx.callout(); }
      if (u.kind === 'mulcher' && !this.flags.gmu) { this.flags.gmu = true; this.say('Mulcher', 'The old one walks. Click sweeps the tusks; right click charges through a line.', 'in', u.team); sfx.callout(); }
      return;
    }
    if (fac(u.team) && this.g.eco) {
      if (u.kind === 'cantor' && !this.flags.vcan) { this.flags.vcan = true; this.say('Cantor', 'A Cantor wakes. Look at me and press F to take the blades. Right click whirls.', 'in', u.team); sfx.callout(); }
      if (u.kind === 'lancer' && !this.flags.vlan) { this.flags.vlan = true; this.say('Lancer', 'A Lancer, listening. Click throws the long note; right click holds it through a whole line.', 'in', u.team); sfx.callout(); }
      if (u.kind === 'warden' && !this.flags.vwar) { this.flags.vwar = true; this.say('Warden', 'The deep voice is awake. Click slams the ground; right click gives every Veyl near me its shield back.', 'in', u.team); sfx.callout(); }
      return;
    }
    if (u.kind === 'breacher' && !this.flags.breach) { this.flags.breach = true; this.say('Breacher', 'Shield\'s heavy. Hold right-click to hide behind it, click to bash.', 'in', u.team); sfx.callout(); }
  }
  buildingDone(b: Building) {
    if (fac(b.team) === 2) {
      if (b.kind === 'warren' && !this.flags.gwar) { this.flags.gwar = true; this.say('Overgrowth', 'The Warren is open. Snappers can ripen at any Mother Cap now: look at a Cap and press T.', 'in', b.team); }
      else if (b.kind === 'quillgarden') this.say('Overgrowth', 'The Quill Garden is grown. Quillbacks ripen at the Caps, and the Garden teaches thicker hide and sharper mouths.', 'in', b.team);
      else if (b.kind === 'blisterbed') this.say('Overgrowth', 'The Blister Bed is full. Blisters ripen at the Caps now.', 'in', b.team);
      else if (b.kind === 'tuskhollow') this.say('Overgrowth', 'The Tusk Hollow is grown. A Mulcher can wake inside it.', 'in', b.team);
      else if (b.kind === 'mothercap') this.say('Overgrowth', 'A new Mother Cap stands. Grazers can bring ore here, and it grows Buds of its own.', 'in', b.team);
      return;
    }
    if (fac(b.team) === 1 && this.g.eco) {
      if (b.kind === 'broodpit' && !this.flags.vpit) { this.flags.vpit = true; this.say('Conductor', 'The Brood Pit is open. Look at it and press E for a Cantor, T for a Lancer.', 'in', b.team); }
      else if (b.kind === 'wardpylon') this.say('Conductor', 'The Ward Pylon sings. Buildings near it take less harm, and it teaches the first songs.', 'in', b.team);
      else if (b.kind === 'reedgate') this.say('Conductor', 'The Reed Gate is open. A Warden can wake there now.', 'in', b.team);
      else if (b.kind === 'choir') this.say('Conductor', 'A new Choir Stone sings. Tenders can bring ore here.', 'in', b.team);
      return;
    }
    if (fac(b.team) !== 0) return;
    if (b.kind === 'bunkhouse' && !this.flags.bunk) { this.flags.bunk = true; this.say('Quartermaster', 'Bunkhouse is up. Look at the door and press E for a Linesman.', 'in', b.team); }
    else if (b.kind === 'machineshop') this.say('Quartermaster', 'Machine Shop\'s open. Breachers at the Bunkhouse, upgrades at the bench.', 'in', b.team);
    else if (b.kind === 'watchpost') this.say('Lookout', 'Watchpost manned. By a gun. The gun is the man.', '', b.team);
  }
  buildingLost(b: Building) {
    const g = this.g;
    const by = this.side(foeOf(b.team)); by.fails = 0; by.brokeT = g.time; const left = g.ownB(b.kind, false, b.team).length;
    if (fac(b.team) === 2) { this.say('Rootwatch', `The ${BLD[b.kind].name} has withered.`, 'al', b.team); if (b.kind === 'mothercap' && left) this.say(LOOKOUT[fac(foeOf(b.team))], `A Mother Cap is down. ${left} still growing.`, 'in', foeOf(b.team)); else if (b.kind !== 'mothercap') this.say('Alpha', `${BLD[b.kind].name} squashed. Keep swinging.`, '', foeOf(b.team)); return; }
    if (g.eco && fac(b.team) === 1) { this.say('Watcher', `The ${BLD[b.kind].name} has fallen silent.`, 'al', b.team); if (b.kind === 'choir' && left) this.say(LOOKOUT[fac(foeOf(b.team))], `A Choir Stone is down. ${left} still singing.`, 'in', foeOf(b.team)); else if (b.kind !== 'choir') this.say('Alpha', `${BLD[b.kind].name} down. Keep swinging.`, '', foeOf(b.team)); return; }
    if (g.eco && fac(b.team) === 0 && b.kind === 'headframe' && left) this.say(LOOKOUT[fac(foeOf(b.team))], `A Headframe is down. ${left} still standing.`, 'in', foeOf(b.team));
    if (g.eco && fac(b.team) === 0 && b.kind !== 'headframe') { this.say('Quartermaster', `We lost the ${BLD[b.kind].name}. That\'s coming out of somebody\'s pay.`, 'al', b.team); return; }
    if (g.eco) return;
    if (b.kind === 'reedgate') { this.say('Lookout', 'Reed Gate is down! Their reinforcements just got a lot slower.', 'in', SIDE.home); sfx.callout(); return; }
    if (b.kind === 'broodpit') { const n = g.pits().length; this.say('Lookout', n ? 'Brood Pit caved in! Their raids just got thinner.' : 'Both Brood Pits are gone. Whatever raids are left will be scraps.', 'in', SIDE.home); sfx.callout(); return; }
    if (b.kind === 'thornspire') { this.say('Alpha', 'Thorn Spire down. That one owed me a helmet.', '', SIDE.home); return; }
    if (b.kind === 'wardpylon') { this.say('Lookout', 'Ward Pylon is down! The Stones are soft now. Hit them!', 'in', SIDE.home); sfx.callout(); if (this.plan?.phase === 'go') { this.plan.target = g.nearestStone(b.pos); for (const u of g.soldiers()) if (u.order.type === 'amove' && this.plan.target) u.order = { type: 'amove', x: this.plan.target.pos.x, z: this.plan.target.pos.z }; } return; }
    if (b.kind === 'choir') {
      const left = g.stones().length; this.lastFailed = false;
      if (left && !this.flags.warden) { this.flags.warden = true; const w = g.spawn('warden', 1, OUTPOST.x + 6, OUTPOST.z); w.order = { type: 'guard', x: OUTPOST.x - 4, z: OUTPOST.z }; this.say('Lookout', 'Stone down, and something big just woke up in there. Warden! Stay out of the pink ring.', 'al', SIDE.home); sfx.alarm(); }
      else if (left) this.say('Alpha', left === 1 ? 'One Stone left! I can taste the bonus.' : 'Stone down. Keep swinging.', '', SIDE.home);
      if (left && this.plan?.phase === 'go') { this.plan.target = g.nearestStone(b.pos); for (const u of g.soldiers()) if (u.order.type === 'amove' && this.plan.target) u.order = { type: 'amove', x: this.plan.target.pos.x, z: this.plan.target.pos.z }; }
      return;
    }
    if (b.team === 0 && b.kind !== 'headframe') this.say('Quartermaster', `We lost the ${BLD[b.kind].name}. That\'s coming out of somebody\'s pay.`, 'al', SIDE.home);
  }

  // ------------------------------------------------------------ orders from the player
  playerOrders(P: Set<string>, eye: THREE.Vector3, dir: THREE.Vector3, lookDist: number) {
    const g = this.g, net = g.net, p = this.side(g.myTeam).plan;
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
    const g = this.g, s = this.side(lead ? lead.team : SIDE.home), v = fac(s.team) !== 0, squad = g.army(s.team).filter(u => u !== lead && !u.pilot), p = s.plan, who = v ? VG(s.team, 'Chorus Lead', 'Swarm Lead') : 'Alpha';
    if (k === 'G' && g.mission?.lockAuto) { this.say('Quartermaster', 'Quartermaster offline. Re-forecasting. Please hold.', 'al', s.team); return; }
    if (k === 'G') { s.auto = !s.auto; this.say(v ? FACTION[s.team].voice : 'Quartermaster', v ? (s.auto ? VG(s.team, 'I will tend the Chorus again.', 'The Overgrowth tends itself again.') : VG(s.team, 'The Chorus is yours to tend. I will listen.', 'The swarm is yours to grow. I will watch.')) : s.auto ? 'Back on the clock. I\'ll handle the building.' : 'Fine. You build it. I\'ll watch.', ''); }
    else if (k === 'V') {
      if (squad.length) { const rel = this.following(s); squad.forEach((u, i) => { u.slot = i; const q = this.rallyAt(i, false, s); u.order = rel ? { type: 'guard', x: q.x, z: q.z } : { type: 'follow', x: 0, z: 0, lead: lead || undefined }; }); this.say(who, v ? (rel ? VG(s.team, 'Back to the Stones, then.', 'Back to the Bloom, then.') : VG(s.team, 'We follow your voice.', 'We run at your heels.')) : rel ? 'Back to the rally point. Finally, a sit-down.' : 'On you, boss. Try not to get us killed.', ''); s.plan = null; s.callout = null; s.nextPlan = g.time + (rel ? 25 : 60); sfx.callout(); } else sfx.deny();
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
      if (s === this.vs && !g.eco) { this.enemy(dt); continue; }
      const f = fac(s.team), home = s === this, foe = foeOf(s.team);
      if (!g.human[s.team]) s.auto = true; if (s.callout) s.callout.t -= dt;
      const hints = f === 2 ? GHINTS : f ? VHINTS : HINTS;
      if (!g.mission || !home) while (s.hintI < hints.length && now >= hints[s.hintI][0]) { const h = hints[s.hintI++]; this.say(h[1], this.hint(s, s.hintI - 1, h[2]), 'in', s.team); }
      if (f === 2) overgrowth(this, dt, s); else if (f) this.conductor(dt, s); else this.quartermaster(dt, s);
      this.squad(dt, s);
      s.chatT -= dt; if (s.chatT <= 0) { s.chatT = home ? R(38, 70) : R(40, 75); const a = g.army(s.team).filter(u => u !== g.me && !u.pilot && !u.target); if (a.length >= 2 && !s.raidLive && !s.callout) { const u = a[Math.floor(Math.random() * a.length)], C = f === 2 ? GCHATTER : f ? VCHATTER : fac(foe) === 2 && Math.random() < .5 ? ICHATTER_G : CHATTER; this.say(UNIT[u.kind].name, C[Math.floor(Math.random() * C.length)], '', s.team); } }
      const b = s.plan ? this.books(s)[s.plan.book] : this.books(s)[0]; s.playbook.name = b.name; s.playbook.steps = b.steps; s.playbook.idx = !g.ownB(f === 2 ? 'warren' : f ? 'broodpit' : 'bunkhouse', true, s.team).length ? 0 : s.plan?.phase === 'go' ? 2 : 1;
    }
  }
  /** A starting hint, with the lines about the enemy rewritten for whoever is really at the other end of the road. */
  hint(s: Side, i: number, text: string) {
    const f = fac(s.team), foe = foeOf(s.team), ff = fac(foe), hq = BLD[FACTION[foe].hq].name;
    if (f === 0 && ff === 1 && !this.g.eco) return text;
    if (i === 2) return ff === 0 ? (f ? text : `Another Ironhold crew is at the end of the ${MAP.road}. Same kit as us, worse manners. Break every ${hq}.`)
      : ff === 1 ? (f === 1 ? `Another Chorus sings at the end of the road. Their song is not ours. Break every ${hq}.` : `The Veyl are at the end of the road, singing over their ${hq}s. Break every one.`)
      : f === 0 ? `Something is growing at the end of the ${MAP.road}. Mother Caps, and a green carpet spreading out of them. Squash every Cap.` : f === 1 ? `Something is growing at the end of the road. Mother Caps, on a green carpet. Silence every one.` : 'Another swarm is rooting at the end of the road. Their Bloom smells wrong. Eat every Mother Cap.';
    return text;
  }

  /** The Veyl economy, when the Chorus runs one: what to grow next, what to learn, and who to wake. It mirrors the Quartermaster. */
  conductor(dt: number, V: Side = this.vs) {
    const g = this.g, T = V.team, U = g.upOf(T), [HX, HZ] = homeXZ(T), VP = (lx: number, lz: number) => endPt(T, ...veylPt(lx, lz), false); V.qmT -= dt; if (V.qmT > 0 || !V.auto) return; V.qmT = 1;
    const own = (k: BKind) => g.ownB(k, false, T), up = (k: BKind) => g.ownB(k, true, T), cash = () => g.cash(T);
    const pits = own('broodpit'), pitsUp = up('broodpit'), sites = g.ownB(undefined, false, T).filter(b => !b.built), building = sites.length > 0;
    const free = g.supplyCap(T) - g.supplyUsed(T), army = g.army(T).length, spires = own('thornspire').length, ward = own('wardpylon'), wardUp = up('wardpylon').length > 0, gate = own('reedgate'), gateUp = up('reedgate')[0];
    const stones = own('choir'), home = up('choir')[0] || stones[0]; if (!home) return;
    const wantWell = pits.length > 0 && free <= 3 && !sites.some(b => b.kind === 'hushwell') && own('hushwell').length < 6;
    const wantSpires = army >= 3 || g.human[foeOf(T)] ? 1 + (g.time > 420 ? 1 : 0) + (g.time > 840 ? 1 : 0) : 0;
    const put = (k: BKind, slots: number[][], line: string) => { if (cash() < BLD[k].cost || (g.paper(T) && !g.paper(T)!.allow.includes(k) && k !== 'choir')) return false; for (const [lx, lz] of slots) { const [x, z] = VP(lx, lz), at = this.freeSpot(k, Math.round(x), Math.round(z), T); if (at) { g.place(k, at[0], at[1], false, T); this.say('Conductor', line, '', T); return true; } } return false; };
    const spare = (keys: string[]) => { for (const k of keys) { const u = UPGRADES.find(x => x.key === k)!; if (!U[u.key] && g.ownB(u.at, true, T).length && (!u.needs || U[u.needs]) && cash() >= u.cost + 120) return g.buyUpgrade(u.key, T); } return false; };
    const homeLeft = g.ores.filter(n => Math.hypot(n.pos.x - HX, n.pos.z - HZ) < 40).reduce((a, n) => [a[0] + n.amount, a[1] + n.max], [0, 0]);
    const wantStones = Math.min((MAP.sites || []).length + 1, 1 + (g.time > 480 || homeLeft[0] < homeLeft[1] * .5 ? 1 : 0) + (g.time > 960 ? 1 : 0) + (g.time > 1440 ? 1 : 0));
    const exp = this.vExpansion(stones, T);
    let saving = true, hold = 95;
    if (!pits.length) put('broodpit', [[-2, -10], [-2, 12], [-8, 1]], 'A Brood Pit first. The voices need somewhere to wake.');
    else if (wantWell) put('hushwell', [[6, -14], [6, 16], [0, -18], [0, 20], [-6, -16], [-6, 18]], 'The song is crowded. Growing a Hush Well.');
    else if (building) saving = false;
    // The second Stone comes before the extra towers and songs: a Chorus that waited for all of them first expanded minutes after the Ironhold, or never.
    else if (pitsUp.length && army >= 4 && g.time > 360 && exp.site && stones.length < wantStones) { hold = BLD.choir.cost; const [sx, sz] = exp.site, dx = HX - sx, dz = HZ - sz, l = Math.hypot(dx, dz) || 1, at = [4, 5, 6, 7, 9].map(r => [Math.round(sx + dx / l * r), Math.round(sz + dz / l * r)]).find(p => g.canPlace('choir', p[0], p[1], false, T));
      // As close to the seams as it will stand. A Stone is a pillar, not a shed with a long front wall: nine metres out, every Tender at a new
      // Stone walked further than a Rigger does to a Headframe's near face, and the Chorus mined a third less from the same number of hands.
      if (cash() >= BLD.choir.cost && at) { const [x, z] = at; g.place('choir', x, z, false, T); this.say('Conductor', 'Seeding a new Choir Stone on the far seam. Some Tenders will drift over.', '', T); } }
    else if (pitsUp.length && spires < Math.min(1, wantSpires)) put('thornspire', [[-12, -8], [-12, 10], [-16, 1]], 'A Thorn Spire by the road, to listen for boots.');
    else if (pitsUp.length && !ward.length && army >= 4) put('wardpylon', [[-4, 2], [-5, -4], [-5, 7]], 'A Ward Pylon. It keeps the Stones whole, and it knows the first songs.');
    else if (pitsUp.length && spires < wantSpires) put('thornspire', [[-12, -8], [-12, 10], [-16, 1], [-8, -16], [-8, 18]], 'Another Thorn Spire. The road should sting.');
    else if (wardUp && !U.vedge && army >= 5) g.buyUpgrade('vedge', T);
    else if (exp.bare) { const [bx, bz] = exp.bare; for (const [ox, oz] of [[6, 6], [-6, 6], [6, -6], [-6, -6]]) if (cash() >= BLD.thornspire.cost && g.canPlace('thornspire', bx + ox, bz + oz, false, T)) { g.place('thornspire', bx + ox, bz + oz, false, T); this.say('Conductor', 'A Thorn Spire to keep the new Stone company.', '', T); break; } }
    else if (wardUp && U.vedge && !gate.length && army >= 7) { hold = 200; put('reedgate', [[2, -17], [2, 19], [-10, -14], [-10, 16]], 'The Reed Gate grows. Something deep is listening.'); }
    else if (gateUp && army >= 6 && free >= 6 && g.own('warden', T).length + gateUp.queue.length < (g.time > 660 ? 2 : 1)) { hold = UNIT.warden.cost; if (cash() >= hold) g.train(gateUp, 'warden'); }
    else if (pits.length === 1 && pitsUp.length === 1 && g.time > 230) put('broodpit', [[-2, 12], [-2, -10], [-8, 1], [-10, -14]], 'A second Brood Pit. Twice the voices.');
    else if (wardUp && !U.vglass && army >= 6) g.buyUpgrade('vglass', T);
    else if (gateUp && !U.vedge2 && army >= 9) { hold = 150; g.buyUpgrade('vedge2', T); }
    else if (gateUp && !U.vglass2 && army >= 10) { hold = 150; g.buyUpgrade('vglass2', T); }
    else if (spare(['vhum', 'vstep', 'vthorn', 'vbreath', 'vwide', 'vbloom'])) saving = true;
    else saving = false;
    // Tenders: eight for the home Stone and six more for each new one, woken at whichever Stone is shortest of hands.
    const tend = g.own('tender', T), hqs = up('choir');
    if (tend.length < 8 + 6 * (hqs.length - 1) && free > 0 && cash() >= 50 && (pits.length || tend.length < 6)) {
      const crew = (h: Building) => tend.filter(u => g.nearHQ((u.node || u).pos.x, (u.node || u).pos.z, T) === h).length + h.queue.length;
      const h = hqs.filter(b => !b.queue.length && crew(b) < (b === home ? 8 : 6)).sort((a, b) => crew(a) - crew(b))[0]; if (h) g.train(h, 'tender');
    }
    const cans = g.own('cantor', T).length, lans = g.own('lancer', T).length;
    for (const b of pitsUp) if (b.queue.length < 2) {
      const q = (k: Kind) => b.queue.filter(x => x.kind === k).length, k: Kind = lans + q('lancer') < Math.floor((cans + q('cantor')) / 2) + 1 && army >= 2 ? 'lancer' : 'cantor';
      if (cash() >= UNIT[k].cost + (saving ? hold : 0)) g.train(b, k);
    }
  }
  /** The next seam worth a Choir Stone (nearest home, nobody there yet, and away from the Ironhold), and a new Stone still without a Thorn Spire. */
  vExpansion(stones: Building[], T: number): { site: number[] | null; bare: number[] | null } {
    const g = this.g, [HX, HZ] = homeXZ(T), near = (x: number, z: number, r: number, f: (b: Building) => boolean) => g.buildings.some(b => b.alive && f(b) && Math.hypot(b.pos.x - x, b.pos.z - z) < r);
    const free = (MAP.sites || []).filter(([x, z]) => !near(x, z, 30, b => b.team === T && b.kind === 'choir') && !near(x, z, 50, b => b.team !== T) && g.ores.some(n => n.amount > 0 && Math.hypot(n.pos.x - x, n.pos.z - z) < 16)).sort((a, b) => Math.hypot(a[0] - HX, a[1] - HZ) - Math.hypot(b[0] - HX, b[1] - HZ));
    const bare = stones.find(h => h.built && Math.hypot(h.pos.x - HX, h.pos.z - HZ) > 30 && !near(h.pos.x, h.pos.z, 24, b => b.team === T && b.kind === 'thornspire'));
    return { site: free[0] || null, bare: bare ? [bare.pos.x, bare.pos.z] : null };
  }

  quartermaster(dt: number, S: Side = this) {
    const g = this.g, T = S.team, U = g.upOf(T), [HX, HZ] = homeXZ(T), P = (x: number, z: number) => endPt(T, x, z, true), cash = () => g.cash(T); S.qmT -= dt; if (S.qmT > 0 || !S.auto) return; S.qmT = 1;
    const hq = g.ownB('headframe', true, T)[0], bunk = g.ownB('bunkhouse', false, T), bunkUp = bunk.filter(b => b.built), sites = g.ownB(undefined, false, T).filter(b => !b.built), shop = g.ownB('machineshop', false, T), shopUp = shop.some(b => b.built);
    const free = g.supplyCap(T) - g.supplyUsed(T), army = g.army(T).length, posts = g.ownB('watchpost', false, T).length, building = sites.length > 0;
    const wantDepot = bunk.length > 0 && free <= 3 && !sites.some(b => b.kind === 'depot') && g.ownB('depot', false, T).length < 6;
    // The planned spot can be taken: the player may have built there, or a fallen tower left rubble. Then the nearest free ground will do.
    const put = (k: BKind, x: number, z: number, line: string, world = false) => { if (cash() < BLD[k].cost || (g.paper(T) && !g.paper(T)!.allow.includes(k))) return false; if (!world) [x, z] = P(x, z); const at = this.freeSpot(k, x, z, T); if (!at) return false; g.place(k, at[0], at[1], false, T); this.say('Quartermaster', line, '', T); return true; };
    const wantPosts = army >= 3 || (g.eco && g.human[foeOf(T)]) ? 1 + (this.raidN >= 2 ? 1 : 0) + (this.raidN >= 4 ? 1 : 0) : 0;
    // One goal at a time, in priority order. While a goal is unpaid, training holds back a reserve so the goal gets bought.
    let saving = true, hold = 95;
    const hfs = g.ownB('headframe', false, T), exp = this.expansion(hfs, T);
    const homeLeft = g.ores.filter(n => Math.hypot(n.pos.x - HX, n.pos.z - HZ) < 40).reduce((a, n) => [a[0] + n.amount, a[1] + n.max], [0, 0]);
    const wantHF = Math.min((MAP.sites || []).length + 1, 1 + (g.time > 480 || homeLeft[0] < homeLeft[1] * .5 ? 1 : 0) + (g.time > 960 ? 1 : 0) + (g.time > 1440 ? 1 : 0)); const fdy = g.ownB('foundry', false, T), fdyB = fdy.find(b => b.built), lab = g.ownB('assay', false, T), labUp = lab.some(b => b.built), mast = g.ownB('mast', false, T), mastUp = mast.some(b => b.built);
    const spot = (k: BKind, slots: number[][], line: string, world = false) => { const at = (p: number[]): [number, number] => world ? [p[0], p[1]] : P(p[0], p[1]), sl = slots.find(p => g.canPlace(k, ...at(p), false, T)) || slots[0]; return put(k, sl[0], sl[1], line, world); };
    // research the yard can afford without starving the big purchases: bought when there is ore to spare
    const spare = (keys: string[]) => { for (const k of keys) { const u = UPGRADES.find(x => x.key === k)!; if (!U[u.key] && g.ownB(u.at, true, T).length && (!u.needs || U[u.needs]) && cash() >= u.cost + 120) return g.buyUpgrade(u.key, T); } return false; };
    if (!bunk.length) put('bunkhouse', 15, 8, 'Staking out a Bunkhouse. Then we get rich.');
    else if (wantDepot) spot('depot', DEPOT_SLOTS, 'Running out of beds. Stacking another Depot.');
    else if (building) saving = false;
    else if (bunkUp.length && posts < Math.min(1, wantPosts)) spot('watchpost', postSlots(), `Putting a Watchpost on the ${MAP.road}. For my nerves.`);
    else if (bunkUp.length && !shop.length && army >= 4) put('machineshop', 0, -15, 'Machine Shop going in out back. Bigger guns, thicker hats.');
    else if (bunkUp.length && posts < wantPosts) spot('watchpost', postSlots(), 'Another Watchpost. I sleep better with crossfire.');
    else if (shopUp && !U.dmg && army >= 5) g.buyUpgrade('dmg', T);
    // Expanding: a new Headframe on the nearest free ore field once the home seams thin out or the shift runs long, and a Watchpost to mind it.
    else if (bunkUp.length && army >= 6 && exp.site && hfs.length < wantHF) { hold = BLD.headframe.cost; const [sx, sz] = exp.site, dx = sx - HX, dz = sz - HZ, l = Math.hypot(dx, dz) || 1; put('headframe', Math.round(sx - dx / l * 11), Math.round(sz - dz / l * 11), 'Staking a new Headframe out on the far seam. Somebody walk the Riggers over.', true); }
    else if (exp.bare) { const [bx, bz] = exp.bare, rx = bx - HX, rz = bz - HZ, l = Math.hypot(rx, rz) || 1; spot('watchpost', [[Math.round(bx - rz / l * 9), Math.round(bz + rx / l * 9)], [Math.round(bx + rz / l * 9), Math.round(bz - rx / l * 9)]], 'Watchpost by the new Headframe. Out there it gets lonely.', true); }
    else if (shopUp && U.dmg && !fdy.length && army >= 7) { hold = 150; spot('foundry', [[-14, -14], [-15, 6], [15, -17], [-4, -28]], 'Foundry going up. Walkers, and the good plating.'); }
    else if (fdyB && army >= 6 && free >= 4 && g.own('gantry', T).length + fdyB.queue.length < (g.time > 660 ? 2 : 1)) { hold = UNIT.gantry.cost; if (cash() >= hold) g.train(fdyB, 'gantry'); }
    else if (fdyB && !lab.length && army >= 6 && (!g.paper(T) || g.paper(T)!.allow.includes('assay'))) spot('assay', [[-15, 6], [15, -17], [-16, 18], [14, 22]], 'Assay Office going up. Longshots, and people who read.');
    else if (bunkUp.length === 1 && bunk.length === 1 && g.time > 230) put('bunkhouse', 4, 23, 'Second Bunkhouse. Twice the complaints.');
    else if (shopUp && !U.armor && army >= 6) g.buyUpgrade('armor', T);
    else if (fdyB && !U.dmg2 && army >= 9) { hold = 150; g.buyUpgrade('dmg2', T); }
    else if (fdyB && !U.armor2 && army >= 10) { hold = 150; g.buyUpgrade('armor2', T); }
    else if (fdyB && labUp && !mast.length && U.dmg2 && army >= 10 && (!g.paper(T) || g.paper(T)!.allow.includes('mast'))) { hold = 200; spot('mast', [[15, -17], [-4, -28], [-16, 18], [-24, -4], [14, 22]], 'Signal Mast going up. Head office wants to listen in, and they pay in kit.'); }
    else if (mastUp && !U.dmg3 && army >= 10) { hold = 200; g.buyUpgrade('dmg3', T); }
    else if (mastUp && !U.armor3 && army >= 11) { hold = 200; g.buyUpgrade('armor3', T); }
    else if (spare(['drill', 'post', 'pay', 'stitch', 'glass', 'beds', 'servo', 'weld', 'buckets', 'frag'])) saving = true;
    else saving = false;
    // Riggers: eight for the home yard and six more for each new base, trained at whichever Headframe is shortest of hands.
    const rigs = g.own('rigger', T), hqs = g.ownB('headframe', true, T);
    if (rigs.length < 8 + 6 * (hqs.length - 1) && free > 0 && cash() >= 50 && (bunk.length || rigs.length < 6)) {
      const crew = (h: Building) => rigs.filter(u => g.nearHQ((u.node || u).pos.x, (u.node || u).pos.z, T) === h).length + h.queue.length;
      const h = hqs.filter(b => !b.queue.length && crew(b) < (b === hq ? 8 : 6)).sort((a, b) => crew(a) - crew(b))[0]; if (h) g.train(h, 'rigger');
    }
    const heavy = g.own('breacher', T).length, light = g.own('linesman', T).length;
    const docs = g.own('patch', T).length, longs = g.own('longshot', T).length;
    for (const b of bunkUp) if (b.queue.length < 2) {
      const q = (k: Kind) => b.queue.filter(x => x.kind === k).length;
      const k: Kind = labUp && light >= 4 && longs + q('longshot') < Math.floor(light / 4) && free >= 2 ? 'longshot' : shopUp && army >= 5 && docs + q('patch') < 1 + Math.floor(army / 10) ? 'patch' : shopUp && heavy + q('breacher') < Math.floor(light / 3) && free >= 2 ? 'breacher' : 'linesman';
      if (cash() >= UNIT[k].cost + (saving ? hold : 0)) g.train(b, k);
    }
  }

  /** The next ore field worth a Headframe (nearest the yard, nobody's there yet, and not under the Veyl's nose), and a new base still without a Watchpost. */
  expansion(hfs: Building[], T = 0): { site: number[] | null; bare: number[] | null } {
    const g = this.g, [HX, HZ] = homeXZ(T), near = (x: number, z: number, r: number, f: (b: Building) => boolean) => g.buildings.some(b => b.alive && f(b) && Math.hypot(b.pos.x - x, b.pos.z - z) < r);
    const sites = MAP.sites || [], free = sites.filter(([x, z]) => !near(x, z, 30, b => b.team === T && b.kind === 'headframe') && !near(x, z, 50, b => b.team !== T) && g.ores.some(n => n.amount > 0 && Math.hypot(n.pos.x - x, n.pos.z - z) < 16)).sort((a, b) => Math.hypot(a[0] - HX, a[1] - HZ) - Math.hypot(b[0] - HX, b[1] - HZ));
    const bare = hfs.find(h => h.built && Math.hypot(h.pos.x - HX, h.pos.z - HZ) > 30 && !near(h.pos.x, h.pos.z, 24, b => b.team === T && b.kind === 'watchpost'));
    return { site: free[0] || null, bare: bare ? [bare.pos.x, bare.pos.z] : null };
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
      let budget = Math.min((9 + 3.5 * (g.coop - 1)) * g.diff.enemy, (2 + n * .8) * g.diff.enemy * (1 + .4 * (g.coop - 1))) * (gate ? 1 : .6) * (pits.length ? .6 + .2 * pits.length : .35); const north = this.raidDir === 'north'; let count = 0;
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
    this.growT -= dt; if (this.growT <= 0) { this.growT = 110 / g.diff.enemy; const gone = g.diff.enemy <= 1 ? undefined : this.spireHome.find(([x, z]) => !g.buildings.some(b => b.alive && b.kind === 'thornspire' && Math.abs(b.pos.x - x) < 1 && Math.abs(b.pos.z - z) < 1)); if (gone && !g.units.some(u => u.alive && u.team === 0 && Math.hypot(u.pos.x - gone[0], u.pos.z - gone[1]) < 55)) { g.addBuilding('thornspire', 1, gone[0], gone[1], true); g.puff(V3(gone[0], 2, gone[1]), 8, 1.6, M.violet, 1); } }
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

  squad(dt: number, s: Side = this) {
    const g = this.g, now = g.time, f = fac(s.team), v = f !== 0, all = g.army(s.team), idle = all.filter(u => u.order.type === 'guard' && u !== g.me && !u.pilot), B = this.books(s);
    // What the enemy has standing: every building against a side that builds, the Choir Stones in the classic match.
    const foe = foeOf(s.team), foeAll = g.ownB(undefined, false, foe), foeHQ = g.ownB(FACTION[foe].hq, false, foe), foes = g.eco ? foeAll : g.stones();
    if (g.eco && s.raidLive && !g.army(foeOf(s.team)).some(u => u.order.type === 'amove')) s.raidLive = false;
    // Against a Chorus that builds, "the last Stone" means the Veyl base is nearly gone, not that they only ever had one.
    const last = g.eco ? foeHQ.length === 1 && foeAll.length <= (v ? 2 : 3) && (!v || now > 300) : foes.length === 1;
    const enemyPush = this.side(foe).plan?.phase === 'go';
    if (!s.plan && now > s.nextPlan && (foes.length || (s === this && g.mission && this.targetFor(0))) && !s.raidLive && !(s === this && this.warned) && !enemyPush) {
      // Every push that dies on their doorstep makes the next muster bigger, so the side stops feeding the enemy six at a time. A swarm musters bigger: its bodies are cheap.
      const need = Math.round((g.eco && !g.army(foeOf(s.team)).length ? 7 : (last ? 5 : 6) + 2 * Math.min(s.fails, 3)) * (f === 2 ? 1.7 : 1));   // nobody left to stop us but the towers: a fair-sized push, without the caution
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
    const breakAll = { text: n > 1 ? `${verb} every ${hqName} (${n} standing)` : `${verb} the ${hqName}`, done: !n };
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
