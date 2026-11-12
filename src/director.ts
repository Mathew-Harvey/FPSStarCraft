// The strategy layer: the Quartermaster who runs your economy, the Veyl raid planner,
// and the squad's playbooks, callouts and chatter.
import * as THREE from 'three';
import { V3, R, M } from './gfx';
import { sfx } from './audio';
import type { Game } from './game';
import { Kind, BKind, UNIT, BLD, UPGRADES, Unit, Building, Callout, OUTPOST, GATE, RALLY, RALLY_N, VRALLY, VRALLY_N, VHOME, NORTH_PATH, MAP, MAPS, ROAD, FACTION, SIDE, veylPt, roadPt, isSoldier, foeOf } from './data';
import { overgrowth, GHINTS, GBOOKS, GCHATTER, GKILL, GDOWN, IKILL_G, ICHATTER_G } from './gloam-ai';
/** One line for whichever side holds the outpost: the Veyl's, or the Gloam's. */
const VG = (team: number, veyl: string, gloam: string) => team === 2 ? gloam : veyl;

const DEPOT_SLOTS = [[-13, 9], [-13, -9], [-19, 0], [-22, 12], [-26, -6], [-20, 22]];
const POST_SLOTS_0 = [[31, 20], [9, -31], [33, 5], [-8, 26]];
/** Watchpost spots covering the road the raids walk down and the flank. Worked out from the map, so they face the Veyl on every map. */
function postSlots(): number[][] {
  if (MAP.base === 0 && MAP.size === 0) return POST_SLOTS_0;
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
  plan: { phase: 'ask' | 'count' | 'go'; t: number; target: Building | null; book: number; label: string } | null;
  nextPlan: number; callout: Callout | null; pushes: number; lastFailed: boolean; fails: number; playbook: { name: string; steps: string[]; idx: number };
  /** An enemy push is on its way in. */
  raidLive: boolean; retarget: number;
}

/** One group of raiders: where it gathers, where it is going, and whether it has been let off the leash. */
interface Wave { units: Unit[]; sx: number; sz: number; t: number; go: boolean; n0: number; north: boolean; tx: number; tz: number; hunt?: boolean }
export class Director implements Side {
  team = 0; retarget = 0; auto = true; qmT = 0; hintI = 0; chatT = 55; barkT = 0;
  /** The Veyl side's brain, used when they run their own economy. */
  vs: Side = { team: 1, auto: true, qmT: 0, hintI: 0, chatT: 70, plan: null, nextPlan: 75, callout: null, pushes: 0, lastFailed: false, fails: 0, playbook: { name: VBOOKS[0].name, steps: VBOOKS[0].steps, idx: 0 }, raidLive: false, retarget: 0 };
  side(team: number): Side { return team ? this.vs : this; }
  plan: { phase: 'ask' | 'count' | 'go'; t: number; target: Building | null; book: number; label: string } | null = null;
  nextPlan = 60; callout: Callout | null = null; pushes = 0; lastFailed = false; /** Pushes in a row that broke nothing. */ fails = 0;
  playbook = { name: 'Yard Push', steps: BOOKS[0].steps, idx: 0 };
  raidIn: number; raidDir: 'east' | 'north' = 'east'; raidN = 0; /** The verse a Veyl player picked for the next raid: 0 all blades, 1 mostly lances, 2 the deep voice. -1 leaves it to the Conductor. */ verse = -1; /** When the Veyl last answered a failed push with a raid of their own. Rationed, so a bad start does not snowball. */ lastCounter = -999; raidLive = false; warned = false; raidAge = 0; raidSeen = false; reinT = 50;
  flags: Record<string, boolean> = {};

  constructor(public g: Game) {
    this.vs.team = SIDE.out; if (SIDE.out === 2) this.vs.playbook = { name: GBOOKS[0].name, steps: GBOOKS[0].steps, idx: 0 };
    this.raidIn = g.eco ? 1e9 : 170 * g.diff.raid;
    const guard = (k: Kind, x: number, z: number) => { if (g.net || g.eco) return; const u = g.spawn(k, 1, x, z); u.order = { type: 'guard', x, z }; };
    for (const [x, z] of [[-14, -5], [-12, 7], [-4, 0], [-18, 1]]) guard('cantor', ...veylPt(x, z));
    for (const [x, z] of [[0, -7], [0, 9]]) guard('lancer', ...veylPt(x, z));
  }

  // ------------------------------------------------------------ squad bookkeeping
  rallyAt(i: number, north = false, s: Side = this) { const r = s.team ? (north ? VRALLY_N : VRALLY) : north ? RALLY_N : RALLY; return { x: r.x + ((i % 4) - 1.5) * 2.4, z: r.z + Math.floor(i / 4) * 2.4 }; }
  following(s: Side = this) { return this.g.army(s.team).some(u => u.order.type === 'follow'); }
  books(s: Side) { return s.team === 2 ? GBOOKS : s.team ? VBOOKS : BOOKS; }
  pathFor(book: number, i: number, s: Side = this): number[][] | undefined { return book === 1 || (book === 2 && i % 2) ? (s.team ? [...NORTH_PATH] : [...NORTH_PATH].reverse()).map(p => [p[0], p[1]]) : undefined; }
  targetFor(book: number, s: Side = this): Building | null {
    const g = this.g;
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
    if (s.plan?.phase === 'go' && s.plan.target && !s.raidLive && !(s.team === 0 && this.warned)) u.order = { type: 'amove', x: s.plan.target.pos.x, z: s.plan.target.pos.z };
    else if (this.following(s)) u.order = { type: 'follow', x: 0, z: 0, lead: army.find(x => x.order.type === 'follow')?.order.lead };
    else { const p = this.rallyAt(u.slot, s.raidLive && (s.team ? false : this.raidDir === 'north'), s); u.order = { type: 'guard', x: p.x, z: p.z }; }
  }
  regroup(north = false, s: Side = this) { this.g.army(s.team).filter(u => u !== this.g.me && !u.pilot && u.order.type !== 'follow').forEach((u, i) => { u.slot = i; const p = this.rallyAt(i, north, s); u.order = { type: 'guard', x: p.x, z: p.z }; }); }
  squadTask(s: Side = this) { return s.plan?.phase === 'go' ? this.books(s)[s.plan.book].name + ' under way' : this.following(s) ? 'Following you' : s.raidLive ? (s.team ? 'Holding off the push' : 'Holding off the raid') : s.team === 2 ? 'Lurking in the Bloom' : s.team ? 'Guarding the Stones' : 'Holding the yard'; }
  say(who: string, msg: string, cls = '') { this.g.feed(who, msg, cls); }
  bark(u: Unit, kind: 'kill' | 'down') { if (this.g.net || this.g.time < this.barkT) return; this.barkT = this.g.time + 7; const l = u.team === 2 ? (kind === 'kill' ? GKILL : GDOWN) : u.team ? (kind === 'kill' ? VKILL : VDOWN) : kind === 'kill' ? (SIDE.out === 2 ? IKILL_G : KILL) : DOWN; this.say(UNIT[u.kind].name, l[Math.floor(Math.random() * l.length)], kind === 'down' ? 'al' : ''); }

  // ------------------------------------------------------------ events from the simulation
  trained(u: Unit) {
    if (u.kind === 'linesman' && !this.flags.line) { this.flags.line = true; this.say('Quartermaster', 'First Linesman on the payroll. Look at them and press F to jump in, or hold Tab.', 'in'); sfx.callout(); }
    if (u.kind === 'longshot' && !this.flags.long) { this.flags.long = true; this.say('Longshot', 'Longshot reporting. Hold right-click for the scope. One shot, then find a new hill.', 'in'); sfx.callout(); }
    if (u.kind === 'patch' && !this.flags.patch) { this.flags.patch = true; this.say('Patch', 'Patch on shift. I mend whoever is closest to dying. As me, press C to top everyone up.', 'in'); sfx.callout(); }
    if (u.kind === 'gantry' && !this.flags.gantry) { this.flags.gantry = true; this.say('Gantry', 'Walker online. Click fires the cannons, C stomps. Jump in, the seat is warm.', 'in'); sfx.callout(); }
    if (u.team === 2) {
      if (u.kind === 'snapper' && !this.flags.gsn) { this.flags.gsn = true; this.say('Snapper', 'Two of us, fresh from the Bud. Look at me and press F. Click bites, right click pounces.', 'in'); sfx.callout(); }
      if (u.kind === 'quillback' && !this.flags.gqb) { this.flags.gqb = true; this.say('Quillback', 'A Quillback, bristling. Click spits a quill; right click throws a fan of five.', 'in'); sfx.callout(); }
      if (u.kind === 'blister' && !this.flags.gbl) { this.flags.gbl = true; this.say('Blister', 'I am a Blister. Carry me into a crowd, click, and I pop. You will need a new body after.', 'in'); sfx.callout(); }
      if (u.kind === 'mulcher' && !this.flags.gmu) { this.flags.gmu = true; this.say('Mulcher', 'The old one walks. Click sweeps the tusks; right click charges through a line.', 'in'); sfx.callout(); }
      return;
    }
    if (u.team && this.g.eco) {
      if (u.kind === 'cantor' && !this.flags.vcan) { this.flags.vcan = true; this.say('Cantor', 'A Cantor wakes. Look at me and press F to take the blades. Right click whirls.', 'in'); sfx.callout(); }
      if (u.kind === 'lancer' && !this.flags.vlan) { this.flags.vlan = true; this.say('Lancer', 'A Lancer, listening. Click throws the long note; right click holds it through a whole line.', 'in'); sfx.callout(); }
      if (u.kind === 'warden' && !this.flags.vwar) { this.flags.vwar = true; this.say('Warden', 'The deep voice is awake. Click slams the ground; right click gives every Veyl near me its shield back.', 'in'); sfx.callout(); }
      return;
    }
    if (u.kind === 'breacher' && !this.flags.breach) { this.flags.breach = true; this.say('Breacher', 'Shield\'s heavy. Hold right-click to hide behind it, click to bash.', 'in'); sfx.callout(); }
  }
  buildingDone(b: Building) {
    if (b.team === 2) {
      if (b.kind === 'warren' && !this.flags.gwar) { this.flags.gwar = true; this.say('Overgrowth', 'The Warren is open. Snappers can ripen at any Mother Cap now: look at a Cap and press T.', 'in'); }
      else if (b.kind === 'quillgarden') this.say('Overgrowth', 'The Quill Garden is grown. Quillbacks ripen at the Caps, and the Garden teaches thicker hide and sharper mouths.', 'in');
      else if (b.kind === 'blisterbed') this.say('Overgrowth', 'The Blister Bed is full. Blisters ripen at the Caps now.', 'in');
      else if (b.kind === 'tuskhollow') this.say('Overgrowth', 'The Tusk Hollow is grown. A Mulcher can wake inside it.', 'in');
      else if (b.kind === 'mothercap') this.say('Overgrowth', 'A new Mother Cap stands. Grazers can bring ore here, and it grows Buds of its own.', 'in');
      return;
    }
    if (b.team === 1 && this.g.eco) {
      if (b.kind === 'broodpit' && !this.flags.vpit) { this.flags.vpit = true; this.say('Conductor', 'The Brood Pit is open. Look at it and press E for a Cantor, T for a Lancer.', 'in'); }
      else if (b.kind === 'wardpylon') this.say('Conductor', 'The Ward Pylon sings. Buildings near it take less harm, and it teaches the first songs.', 'in');
      else if (b.kind === 'reedgate') this.say('Conductor', 'The Reed Gate is open. A Warden can wake there now.', 'in');
      else if (b.kind === 'choir') this.say('Conductor', 'A new Choir Stone sings. Tenders can bring ore here.', 'in');
      return;
    }
    if (b.team !== 0) return;
    if (b.kind === 'bunkhouse' && !this.flags.bunk) { this.flags.bunk = true; this.say('Quartermaster', 'Bunkhouse is up. Look at the door and press E for a Linesman.', 'in'); }
    else if (b.kind === 'machineshop') this.say('Quartermaster', 'Machine Shop\'s open. Breachers at the Bunkhouse, upgrades at the bench.', 'in');
    else if (b.kind === 'watchpost') this.say('Lookout', 'Watchpost manned. By a gun. The gun is the man.', '');
  }
  buildingLost(b: Building) {
    const g = this.g;
    if (b.team) this.fails = 0; else this.vs.fails = 0;
    if (b.team === 2) { this.say('Rootwatch', `The ${BLD[b.kind].name} has withered.`, 'al'); if (b.kind === 'mothercap' && g.stones().length) this.say('Lookout', `A Mother Cap is down. ${g.stones().length} still growing.`, 'in'); else if (b.kind !== 'mothercap') this.say('Alpha', `${BLD[b.kind].name} squashed. Keep swinging.`, ''); return; }
    if (g.eco && b.team === 1) { this.say('Watcher', `The ${BLD[b.kind].name} has fallen silent.`, 'al'); if (b.kind === 'choir' && g.stones().length) this.say('Lookout', `A Choir Stone is down. ${g.stones().length} still singing.`, 'in'); else if (b.kind !== 'choir') this.say('Alpha', `${BLD[b.kind].name} down. Keep swinging.`, ''); return; }
    if (g.eco && b.team === 0 && b.kind === 'headframe' && g.ownB('headframe').length) this.say('Watcher', `A Headframe is down. ${g.ownB('headframe').length} still standing.`, 'in');
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
    const g = this.g, s = this.side(lead ? lead.team : 0), v = s.team !== 0, squad = g.army(s.team).filter(u => u !== lead && !u.pilot), p = s.plan, who = v ? VG(s.team, 'Chorus Lead', 'Swarm Lead') : 'Alpha';
    if (k === 'G') { s.auto = !s.auto; this.say(v ? FACTION[s.team].voice : 'Quartermaster', v ? (s.auto ? VG(s.team, 'I will tend the Chorus again.', 'The Overgrowth tends itself again.') : VG(s.team, 'The Chorus is yours to tend. I will listen.', 'The swarm is yours to grow. I will watch.')) : this.auto ? 'Back on the clock. I\'ll handle the building.' : 'Fine. You build it. I\'ll watch.', ''); }
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
    if (s.team === 2) this.say('Swarm Lead', byPlayer ? (p.book === 1 ? 'The ridge. Low and quiet.' : 'Gather. Swarm.') : 'No word. The hunger decides.', '');
    else if (s.team) this.say('Chorus Lead', byPlayer ? (p.book === 1 ? 'The ridge, then. Quietly.' : 'We sing. Gather.') : 'No word. We go anyway.', '');
    else this.say('Alpha', byPlayer ? (p.book === 1 ? 'Back door it is. Sneaky. I like it.' : 'That\'s the spirit. Moving out.') : 'No answer. Taking that as a yes.', ''); sfx.blip();
  }

  /** True if a building here would stand between the Headframe and a seam the Riggers walk to. */
  onOreRoute(k: BKind, x: number, z: number, team = 0) {
    const m = Math.max(BLD[k].hx, BLD[k].hz) + 2.5, hx = team ? VHOME.x : 0, hz = team ? VHOME.z : 0; x -= hx; z -= hz;
    for (const n of this.g.ores) { const ox = n.pos.x - hx, oz = n.pos.z - hz, L = ox * ox + oz * oz; if (n.amount <= 0 || L > 45 * 45) continue; const t = Math.max(0, Math.min(1, (x * ox + z * oz) / L)); if (Math.hypot(x - ox * t, z - oz * t) < m) return true; }
    return false;
  }
  /** The planned spot if it is free, otherwise the nearest free ground around it, still inside the yard. */
  freeSpot(k: BKind, x: number, z: number, team = 0): [number, number] | null {
    const g = this.g, hx = team ? VHOME.x : 0, hz = team ? VHOME.z : 0, d = (px: number, pz: number) => Math.hypot(px - hx, pz - hz), yard = d(x, z) < 60; if (g.canPlace(k, x, z, false, team)) return [x, z];
    for (let r = 3; r <= 24; r += 3) for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2 + r, px = Math.round(x + Math.cos(a) * r), pz = Math.round(z + Math.sin(a) * r); if ((yard && (d(px, pz) < 12 || d(px, pz) > 60)) || this.onOreRoute(k, px, pz, team)) continue; if (g.canPlace(k, px, pz, false, team)) return [px, pz]; }
    return null;
  }

  // ------------------------------------------------------------ every frame
  update(dt: number) {
    // A crew with no Riggers and no money is not out of the game: the Charter fronts enough for one more.
    if (this.g.ore < 50 && !this.g.own('rigger').length && this.g.ownB('headframe').length) this.g.ore = Math.min(50, this.g.ore + dt * 2.5);
    const g = this.g, now = g.time;
    // A drilled-out seam settles and the ore creeps back, a third of it, so a long shift never runs the yard dry for good.
    for (const n of g.ores) { if (n.amount > 0) { n.dryT = 0; continue; } n.dryT = (n.dryT || 0) + dt; if (n.dryT > 150) { n.amount = Math.round(n.max * .35); n.dryT = 0; g.oreCheck(n); if (!g.mission) this.say('Quartermaster', 'An old seam has settled and the green is showing again. Worth another dig.', ''); } }
    if (!g.mission) while (this.hintI < HINTS.length && now >= HINTS[this.hintI][0]) { const h = HINTS[this.hintI++]; this.say(h[1], SIDE.out === 2 && this.hintI === 3 ? `Something is growing at the end of the ${MAP.road}. Mother Caps, and a green carpet spreading out of them. Squash every Cap.` : h[2], 'in'); }
    if (this.callout) this.callout.t -= dt;
    // A side nobody plays never switches its economy off.
    if (!g.human[0]) this.auto = true;
    this.quartermaster(dt); this.squad(dt);
    if (g.eco && SIDE.out === 2) {
      const V = this.vs; if (!g.human[2]) V.auto = true; if (V.callout) V.callout.t -= dt;
      while (V.hintI < GHINTS.length && now >= GHINTS[V.hintI][0]) { const h = GHINTS[V.hintI++]; this.say(h[1], h[2], 'in'); }
      if (g.cash(2) < 45 && g.own('grazer', 2).length < 3 && g.ownB('mothercap', false, 2).length) g.purse[2] = Math.min(45, g.purse[2] + dt * 2.5);
      overgrowth(this, dt); this.squad(dt, V);
      V.chatT -= dt; if (V.chatT <= 0) { V.chatT = R(40, 75); const a = g.army(2).filter(u => u !== g.me && !u.pilot && !u.target); if (a.length >= 2 && !V.raidLive && !V.callout) { const u = a[Math.floor(Math.random() * a.length)]; this.say(UNIT[u.kind].name, GCHATTER[Math.floor(Math.random() * GCHATTER.length)], ''); } }
      const gb = V.plan ? GBOOKS[V.plan.book] : GBOOKS[0]; V.playbook.name = gb.name; V.playbook.steps = gb.steps; V.playbook.idx = !g.ownB('warren', true, 2).length ? 0 : V.plan?.phase === 'go' ? 2 : 1;
    } else if (g.eco) {
      const V = this.vs; if (!g.human[1]) V.auto = true; if (V.callout) V.callout.t -= dt;
      while (V.hintI < VHINTS.length && now >= VHINTS[V.hintI][0]) { const h = VHINTS[V.hintI++]; this.say(h[1], h[2], 'in'); }
      if (g.cash(1) < 50 && g.own('tender', 1).length < 3 && g.ownB('choir', false, 1).length) g.purse[1] = Math.min(50, g.purse[1] + dt * 2.5);
      this.conductor(dt); this.squad(dt, V);
      V.chatT -= dt; if (V.chatT <= 0) { V.chatT = R(40, 75); const a = g.army(1).filter(u => u !== g.me && !u.pilot && !u.target); if (a.length >= 2 && !V.raidLive && !V.callout) { const u = a[Math.floor(Math.random() * a.length)]; this.say(UNIT[u.kind].name, VCHATTER[Math.floor(Math.random() * VCHATTER.length)], ''); } }
      const vb = V.plan ? VBOOKS[V.plan.book] : VBOOKS[0]; V.playbook.name = vb.name; V.playbook.steps = vb.steps; V.playbook.idx = !g.ownB('broodpit', true, 1).length ? 0 : V.plan?.phase === 'go' ? 2 : 1;
    } else this.enemy(dt);
    // idle chatter
    this.chatT -= dt; if (this.chatT <= 0) { this.chatT = R(38, 70); const s = g.soldiers().filter(u => u !== g.me && !u.target); if (s.length >= 2 && !this.raidLive && !this.callout) { const u = s[Math.floor(Math.random() * s.length)]; const C = SIDE.out === 2 && Math.random() < .5 ? ICHATTER_G : CHATTER; this.say(UNIT[u.kind].name, C[Math.floor(Math.random() * C.length)], ''); } }
    const b = this.plan ? BOOKS[this.plan.book] : BOOKS[0]; this.playbook.name = b.name; this.playbook.steps = b.steps; this.playbook.idx = !g.ownB('bunkhouse', true).length ? 0 : this.plan?.phase === 'go' ? 2 : 1;
  }

  /** The Veyl economy, when the Chorus runs one: what to grow next, what to learn, and who to wake. It mirrors the Quartermaster. */
  conductor(dt: number) {
    const g = this.g, V = this.vs, T = 1; V.qmT -= dt; if (V.qmT > 0 || !V.auto) return; V.qmT = 1;
    const own = (k: BKind) => g.ownB(k, false, T), up = (k: BKind) => g.ownB(k, true, T), cash = () => g.cash(T);
    const pits = own('broodpit'), pitsUp = up('broodpit'), sites = g.ownB(undefined, false, T).filter(b => !b.built), building = sites.length > 0;
    const free = g.supplyCap(T) - g.supplyUsed(T), army = g.army(T).length, spires = own('thornspire').length, ward = own('wardpylon'), wardUp = up('wardpylon').length > 0, gate = own('reedgate'), gateUp = up('reedgate')[0];
    const stones = own('choir'), home = up('choir')[0] || stones[0]; if (!home) return;
    const wantWell = pits.length > 0 && free <= 3 && !sites.some(b => b.kind === 'hushwell') && own('hushwell').length < 6;
    const wantSpires = army >= 3 || g.human[0] ? 1 + (g.time > 420 ? 1 : 0) + (g.time > 840 ? 1 : 0) : 0;
    const put = (k: BKind, slots: number[][], line: string) => { if (cash() < BLD[k].cost) return false; for (const [lx, lz] of slots) { const [x, z] = veylPt(lx, lz), at = this.freeSpot(k, Math.round(x), Math.round(z), T); if (at) { g.place(k, at[0], at[1], false, T); this.say('Conductor', line, ''); return true; } } return false; };
    const spare = (keys: string[]) => { for (const k of keys) { const u = UPGRADES.find(x => x.key === k)!; if (!g.up[u.key] && g.ownB(u.at, true, T).length && (!u.needs || g.up[u.needs]) && cash() >= u.cost + 120) return g.buyUpgrade(u.key); } return false; };
    const homeLeft = g.ores.filter(n => Math.hypot(n.pos.x - VHOME.x, n.pos.z - VHOME.z) < 40).reduce((a, n) => [a[0] + n.amount, a[1] + n.max], [0, 0]);
    const wantStones = Math.min((MAP.sites || []).length + 1, 1 + (g.time > 480 || homeLeft[0] < homeLeft[1] * .5 ? 1 : 0) + (g.time > 960 ? 1 : 0) + (g.time > 1440 ? 1 : 0));
    const exp = this.vExpansion(stones);
    let saving = true, hold = 95;
    if (!pits.length) put('broodpit', [[-2, -10], [-2, 12], [-8, 1]], 'A Brood Pit first. The voices need somewhere to wake.');
    else if (wantWell) put('hushwell', [[6, -14], [6, 16], [0, -18], [0, 20], [-6, -16], [-6, 18]], 'The song is crowded. Growing a Hush Well.');
    else if (building) saving = false;
    else if (pitsUp.length && spires < Math.min(1, wantSpires)) put('thornspire', [[-12, -8], [-12, 10], [-16, 1]], 'A Thorn Spire by the road, to listen for boots.');
    else if (pitsUp.length && !ward.length && army >= 4) put('wardpylon', [[-4, 2], [-5, -4], [-5, 7]], 'A Ward Pylon. It keeps the Stones whole, and it knows the first songs.');
    else if (pitsUp.length && spires < wantSpires) put('thornspire', [[-12, -8], [-12, 10], [-16, 1], [-8, -16], [-8, 18]], 'Another Thorn Spire. The road should sting.');
    else if (wardUp && !g.up.vedge && army >= 5) g.buyUpgrade('vedge');
    else if (pitsUp.length && army >= 6 && exp.site && stones.length < wantStones) { hold = BLD.choir.cost; const [sx, sz] = exp.site, dx = VHOME.x - sx, dz = VHOME.z - sz, l = Math.hypot(dx, dz) || 1, x = Math.round(sx + dx / l * 9), z = Math.round(sz + dz / l * 9); if (cash() >= BLD.choir.cost && g.canPlace('choir', x, z, false, T)) { g.place('choir', x, z, false, T); this.say('Conductor', 'Seeding a new Choir Stone on the far seam. Some Tenders will drift over.', ''); } }
    else if (exp.bare) { const [bx, bz] = exp.bare; for (const [ox, oz] of [[6, 6], [-6, 6], [6, -6], [-6, -6]]) if (cash() >= BLD.thornspire.cost && g.canPlace('thornspire', bx + ox, bz + oz, false, T)) { g.place('thornspire', bx + ox, bz + oz, false, T); this.say('Conductor', 'A Thorn Spire to keep the new Stone company.', ''); break; } }
    else if (wardUp && g.up.vedge && !gate.length && army >= 7) { hold = 200; put('reedgate', [[2, -17], [2, 19], [-10, -14], [-10, 16]], 'The Reed Gate grows. Something deep is listening.'); }
    else if (gateUp && army >= 6 && free >= 6 && g.own('warden', T).length + gateUp.queue.length < (g.time > 660 ? 2 : 1)) { hold = UNIT.warden.cost; if (cash() >= hold) g.train(gateUp, 'warden'); }
    else if (pits.length === 1 && pitsUp.length === 1 && g.time > 230) put('broodpit', [[-2, 12], [-2, -10], [-8, 1], [-10, -14]], 'A second Brood Pit. Twice the voices.');
    else if (wardUp && !g.up.vglass && army >= 6) g.buyUpgrade('vglass');
    else if (gateUp && !g.up.vedge2 && army >= 9) { hold = 150; g.buyUpgrade('vedge2'); }
    else if (gateUp && !g.up.vglass2 && army >= 10) { hold = 150; g.buyUpgrade('vglass2'); }
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
  vExpansion(stones: Building[]): { site: number[] | null; bare: number[] | null } {
    const g = this.g, near = (x: number, z: number, r: number, f: (b: Building) => boolean) => g.buildings.some(b => b.alive && f(b) && Math.hypot(b.pos.x - x, b.pos.z - z) < r);
    const free = (MAP.sites || []).filter(([x, z]) => !near(x, z, 30, b => b.team === 1 && b.kind === 'choir') && !near(x, z, 50, b => b.team === 0) && g.ores.some(n => n.amount > 0 && Math.hypot(n.pos.x - x, n.pos.z - z) < 16)).sort((a, b) => Math.hypot(a[0] - VHOME.x, a[1] - VHOME.z) - Math.hypot(b[0] - VHOME.x, b[1] - VHOME.z));
    const bare = stones.find(h => h.built && Math.hypot(h.pos.x - VHOME.x, h.pos.z - VHOME.z) > 30 && !near(h.pos.x, h.pos.z, 24, b => b.team === 1 && b.kind === 'thornspire'));
    return { site: free[0] || null, bare: bare ? [bare.pos.x, bare.pos.z] : null };
  }

  quartermaster(dt: number) {
    const g = this.g; this.qmT -= dt; if (this.qmT > 0 || !this.auto) return; this.qmT = 1;
    const hq = g.ownB('headframe', true)[0], bunk = g.ownB('bunkhouse'), bunkUp = bunk.filter(b => b.built), sites = g.ownB().filter(b => !b.built), shop = g.ownB('machineshop'), shopUp = shop.some(b => b.built);
    const free = g.supplyCap() - g.supplyUsed(), army = g.soldiers().length, posts = g.ownB('watchpost').length, building = sites.length > 0;
    const wantDepot = bunk.length > 0 && free <= 3 && !sites.some(b => b.kind === 'depot') && g.ownB('depot').length < 6;
    // The planned spot can be taken: the player may have built there, or a fallen tower left rubble. Then the nearest free ground will do.
    const put = (k: BKind, x: number, z: number, line: string) => { if (g.ore < BLD[k].cost || (g.mission && !g.mission.allow.includes(k))) return false; const at = this.freeSpot(k, x, z); if (!at) return false; g.place(k, at[0], at[1], false); this.say('Quartermaster', line, ''); return true; };
    const wantPosts = army >= 3 || (g.eco && g.human[1]) ? 1 + (this.raidN >= 2 ? 1 : 0) + (this.raidN >= 4 ? 1 : 0) : 0;
    // One goal at a time, in priority order. While a goal is unpaid, training holds back a reserve so the goal gets bought.
    let saving = true, hold = 95;
    const hfs = g.ownB('headframe'), exp = this.expansion(hfs);
    const homeLeft = g.ores.filter(n => Math.hypot(n.pos.x, n.pos.z) < 40).reduce((a, n) => [a[0] + n.amount, a[1] + n.max], [0, 0]);
    const wantHF = Math.min((MAP.sites || []).length + 1, 1 + (g.time > 480 || homeLeft[0] < homeLeft[1] * .5 ? 1 : 0) + (g.time > 960 ? 1 : 0) + (g.time > 1440 ? 1 : 0)); const fdy = g.ownB('foundry'), fdyB = fdy.find(b => b.built), lab = g.ownB('assay'), labUp = lab.some(b => b.built), mast = g.ownB('mast'), mastUp = mast.some(b => b.built);
    const spot = (k: BKind, slots: number[][], line: string) => { const sl = slots.find(([x, z]) => g.canPlace(k, x, z, false)) || slots[0]; return put(k, sl[0], sl[1], line); };
    // research the yard can afford without starving the big purchases: bought when there is ore to spare
    const spare = (keys: string[]) => { for (const k of keys) { const u = UPGRADES.find(x => x.key === k)!; if (!g.up[u.key] && g.ownB(u.at, true).length && (!u.needs || g.up[u.needs]) && g.ore >= u.cost + 120) return g.buyUpgrade(u.key); } return false; };
    if (!bunk.length) put('bunkhouse', 15, 8, 'Staking out a Bunkhouse. Then we get rich.');
    else if (wantDepot) spot('depot', DEPOT_SLOTS, 'Running out of beds. Stacking another Depot.');
    else if (building) saving = false;
    else if (bunkUp.length && posts < Math.min(1, wantPosts)) spot('watchpost', postSlots(), `Putting a Watchpost on the ${MAP.road}. For my nerves.`);
    else if (bunkUp.length && !shop.length && army >= 4) put('machineshop', 0, -15, 'Machine Shop going in out back. Bigger guns, thicker hats.');
    else if (bunkUp.length && posts < wantPosts) spot('watchpost', postSlots(), 'Another Watchpost. I sleep better with crossfire.');
    else if (shopUp && !g.up.dmg && army >= 5) g.buyUpgrade('dmg');
    // Expanding: a new Headframe on the nearest free ore field once the home seams thin out or the shift runs long, and a Watchpost to mind it.
    else if (bunkUp.length && army >= 6 && exp.site && hfs.length < wantHF) { hold = BLD.headframe.cost; const [sx, sz] = exp.site, l = Math.hypot(sx, sz) || 1; put('headframe', Math.round(sx - sx / l * 11), Math.round(sz - sz / l * 11), 'Staking a new Headframe out on the far seam. Somebody walk the Riggers over.'); }
    else if (exp.bare) { const [bx, bz] = exp.bare, l = Math.hypot(bx, bz) || 1; spot('watchpost', [[Math.round(bx - bz / l * 9), Math.round(bz + bx / l * 9)], [Math.round(bx + bz / l * 9), Math.round(bz - bx / l * 9)]], 'Watchpost by the new Headframe. Out there it gets lonely.'); }
    else if (shopUp && g.up.dmg && !fdy.length && army >= 7) { hold = 150; spot('foundry', [[-14, -14], [-15, 6], [15, -17], [-4, -28]], 'Foundry going up. Walkers, and the good plating.'); }
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
    // Riggers: eight for the home yard and six more for each new base, trained at whichever Headframe is shortest of hands.
    const rigs = g.own('rigger'), hqs = g.ownB('headframe', true);
    if (rigs.length < 8 + 6 * (hqs.length - 1) && free > 0 && g.ore >= 50 && (bunk.length || rigs.length < 6)) {
      const crew = (h: Building) => rigs.filter(u => g.nearHQ((u.node || u).pos.x, (u.node || u).pos.z) === h).length + h.queue.length;
      const h = hqs.filter(b => !b.queue.length && crew(b) < (b === hq ? 8 : 6)).sort((a, b) => crew(a) - crew(b))[0]; if (h) g.train(h, 'rigger');
    }
    const heavy = g.own('breacher').length, light = g.own('linesman').length;
    const docs = g.own('patch').length, longs = g.own('longshot').length;
    for (const b of bunkUp) if (b.queue.length < 2) {
      const q = (k: Kind) => b.queue.filter(x => x.kind === k).length;
      const k: Kind = labUp && light >= 4 && longs + q('longshot') < Math.floor(light / 4) && free >= 2 ? 'longshot' : shopUp && army >= 5 && docs + q('patch') < 1 + Math.floor(army / 10) ? 'patch' : shopUp && heavy + q('breacher') < Math.floor(light / 3) && free >= 2 ? 'breacher' : 'linesman';
      if (g.ore >= UNIT[k].cost + (saving ? hold : 0)) g.train(b, k);
    }
  }

  /** The next ore field worth a Headframe (nearest the yard, nobody's there yet, and not under the Veyl's nose), and a new base still without a Watchpost. */
  expansion(hfs: Building[]): { site: number[] | null; bare: number[] | null } {
    const g = this.g, near = (x: number, z: number, r: number, f: (b: Building) => boolean) => g.buildings.some(b => b.alive && f(b) && Math.hypot(b.pos.x - x, b.pos.z - z) < r);
    const sites = MAP.sites || [], free = sites.filter(([x, z]) => !near(x, z, 30, b => b.team === 0 && b.kind === 'headframe') && !near(x, z, 50, b => b.team !== 0) && g.ores.some(n => n.amount > 0 && Math.hypot(n.pos.x - x, n.pos.z - z) < 16)).sort((a, b) => Math.hypot(a[0], a[1]) - Math.hypot(b[0], b[1]));
    const bare = hfs.find(h => h.built && Math.hypot(h.pos.x, h.pos.z) > 30 && !near(h.pos.x, h.pos.z, 24, b => b.team === 0 && b.kind === 'watchpost'));
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
    const g = this.g, now = g.time, v = s.team !== 0, all = g.army(s.team), idle = all.filter(u => u.order.type === 'guard' && u !== g.me && !u.pilot), B = this.books(s);
    const foes = v ? g.ownB() : g.stones(), hfs = g.ownB('headframe');
    if (g.eco && s.raidLive && !g.army(foeOf(s.team)).some(u => u.order.type === 'amove')) s.raidLive = false;
    // Against a Chorus that builds, "the last Stone" means the Veyl base is nearly gone, not that they only ever had one.
    const last = v ? hfs.length === 1 && g.ownB().length <= 2 && now > 300 : foes.length === 1 && (!g.eco || g.ownB(undefined, false, SIDE.out).length <= 3);
    const enemyPush = v ? this.plan?.phase === 'go' : this.vs.plan?.phase === 'go';
    if (!s.plan && now > s.nextPlan && (foes.length || (!v && g.mission && this.targetFor(0))) && !s.raidLive && !(s.team === 0 && this.warned) && !enemyPush) {
      // Every push that dies on their doorstep makes the next muster bigger, so the side stops feeding the enemy six at a time. A swarm musters bigger: its bodies are cheap.
      const need = Math.round((g.eco && !g.army(foeOf(s.team)).length ? 7 : (last ? 5 : 6) + 2 * Math.min(s.fails, 3)) * (s.team === 2 ? 1.7 : 1));   // nobody left to stop us but the towers: a fair-sized push, without the caution
      if (idle.length >= need) {
        const book = last ? 2 : s.lastFailed || s.pushes % 2 === 1 ? 1 : 0; s.plan = { phase: 'ask', t: 10, target: null, book, label: B[book].label };
        const text = s.team === 2
          ? (book === 2 ? `One Headframe left and ${idle.length} of us hungry. <b>Everything with legs, both roads. Now?</b>` : book === 1 ? `The road ${s.lastFailed ? 'bit back' : 'is watched'}. ${idle.length} of us circle over the <b>${MAP.flankName}</b> and come at their backs. <b>Shall we swarm?</b>` : `${idle.length} of us are restless in the Bloom. We run down the road in twenty. <b>Shall we swarm?</b>`)
          : v
          ? (book === 2 ? `One Headframe left and ${idle.length} voices ready. <b>Every voice, both roads. Shall we?</b>` : book === 1 ? `The road ${s.lastFailed ? 'turned us back' : 'is expected'}. ${idle.length} of us circle over the <b>${MAP.flankName}</b> and come at them from behind. <b>Shall we sing?</b>` : `${idle.length} voices are restless. We march down the road in twenty. <b>Shall we sing?</b>`)
          : (book === 2 ? `One Stone left and ${idle.length} of us itching. <b>Everybody goes, both roads. Yes?</b>` : book === 1 ? `Front door ${s.lastFailed ? 'went badly' : 'is getting old'}. ${idle.length} of us go round by the <b>${MAP.flankName}</b> and hit them from behind. <b>You in?</b>` : `${idle.length} of us are standing around. We hit their ${g.eco ? 'nearest building' : 'east yard'} in twenty. <b>You in, or what?</b>`);
        const go = s.team === 2 ? 'Swarm' : v ? 'Sing' : 'Do it';
        s.callout = { who: v ? VG(s.team, 'Chorus Lead', 'Swarm Lead') : 'Alpha Lead', text, t: 10, dur: 10, keys: book === 2 ? [['Z', go], ['X', 'Hold']] : [['Z', go], ['C', book ? (v ? 'The road' : 'Front door') : v ? 'The ridge' : 'Back door'], ['X', 'Hold']] }; if (!g.net) sfx.callout();
      }
    }
    const p = s.plan; if (!p) return; p.t -= dt;
    // On Day shift a pitch nobody answers goes ahead, and so does every pitch on a side nobody plays. From Night shift up the squad waits for the word, so the army is the player's to spend.
    if (p.phase === 'ask') { if (p.t <= 0) { if (g.diff.enemy < 1 || !g.human[s.team]) this.accept(false, s); else { s.plan = null; s.callout = null; s.nextPlan = now + 45; this.say(v ? VG(s.team, 'Chorus Lead', 'Swarm Lead') : 'Alpha', v ? VG(s.team, 'No word from you. We guard the Stones until you call.', 'No word from you. We wait in the Bloom until you call.') : 'No word from you. We hold the yard until you say go.', ''); } } }
    else if (p.phase === 'count') {
      if (p.t <= 0) {
        p.phase = 'go'; p.target = this.targetFor(p.book, s); s.pushes++; s.retarget = 2;
        if (p.target) { let i = 0; for (const u of all) if (u !== g.me && !u.pilot && u.order.type === 'guard') { u.order = { type: 'amove', x: p.target.pos.x + R(-3, 3), z: p.target.pos.z + R(-3, 3), path: this.pathFor(p.book, i++, s) }; } }
        this.say(v ? VG(s.team, 'Chorus Lead', 'Swarm Lead') : 'Alpha', B[p.book].go, ''); sfx.callout();
        if (g.eco) this.incoming(s, p.book);
      }
    } else {
      const pushing = all.filter(u => u.order.type === 'amove');
      // A building the push was walking to has fallen: on to the next one.
      s.retarget -= dt; if (s.retarget <= 0 && g.eco) { s.retarget = 2; if (!p.target || !p.target.alive) { p.target = this.targetFor(p.book, s); if (p.target) for (const u of pushing) if (!u.target && !(u.order.path && u.order.path.length)) u.order = { type: 'amove', x: p.target.pos.x + R(-3, 3), z: p.target.pos.z + R(-3, 3) }; } }
      if (!pushing.length || (pushing.length < 2 && all.length < 3)) {
        s.plan = null; s.nextPlan = now + 40; s.lastFailed = true; s.fails++; this.regroup(false, s); this.say(v ? VG(s.team, 'Chorus Lead', 'Swarm Lead') : 'Alpha', v ? VG(s.team, 'The march is spent. Back to the Stones.', 'The swarm is spent. Back to the Bloom.') : 'Push is spent. Pulling back to regroup.', 'al');
        if (g.eco) { const o = this.side(foeOf(s.team)); if (o.raidLive) { o.raidLive = false; this.say(o.team ? VG(o.team, 'Watcher', 'Rootwatch') : 'Alpha', o.team ? VG(o.team, 'The Ironhold have gone home. The Stones still sing.', 'The Ironhold have gone home. The Caps still grow.') : 'Yard\'s clear. Somebody sweep up the purple.', ''); } }
        else if (g.diff.enemy >= 1 && foes.length && !(g.mission && !g.mission.raids) && g.time > 300 && now - this.lastCounter > 150) { this.lastCounter = now; this.raidIn = Math.min(this.raidIn, 22); }
      }
    }
  }
  /** One side has gone on the march: the other side's lookout calls it, and its squad comes home to meet it. */
  incoming(s: Side, book: number) {
    const o = this.side(foeOf(s.team)); if (o.plan?.phase === 'go') return; o.raidLive = true; o.plan = null; o.callout = null;
    const north = book === 1; this.regroup(north && o.team === 0, o);
    if (o.team === 0) { this.raidDir = north ? 'north' : 'east'; this.say('Lookout', SIDE.out === 2 ? (north ? `Skittering on the ${MAP.flankName}! The bugs are coming round the back.` : `The swarm is on the ${MAP.road}. Hundreds of legs, coming this way.`) : north ? `Movement on the ${MAP.flankName}! The Chorus is coming round the back.` : `The Chorus is on the ${MAP.road}. A whole choir of them, coming this way.`, 'al'); sfx.alarm(); }
    else this.say(VG(o.team, 'Watcher', 'Rootwatch'), north ? `Boots on the ${MAP.flankName}. The Ironhold are circling round.` : VG(o.team, 'Boots on the road. The Ironhold are coming for the Stones.', 'Boots on the road. The Ironhold are coming for the Caps.'), 'al');
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
    if (g.myTeam === 2) return [
      { text: 'Chew 30 ore with a Grazer', done: o.drilled >= 30 },
      { text: 'Jump into another body (Tab or F)', done: o.jumped },
      { text: 'Answer the Swarm Lead when they pitch a swarm', done: o.answered },
      { text: g.ownB('headframe').length > 1 ? `Break every Headframe (${g.ownB('headframe').length} standing)` : 'Break the Headframe', done: !g.ownB('headframe').length },
    ];
    if (g.myTeam) return [
      { text: 'Hum 30 ore with a Tender', done: o.drilled >= 30 },
      { text: 'Jump into another body (Tab or F)', done: o.jumped },
      { text: 'Answer the Chorus Lead when they pitch a march', done: o.answered },
      { text: g.ownB('headframe').length > 1 ? `Break every Headframe (${g.ownB('headframe').length} standing)` : 'Break the Headframe', done: !g.ownB('headframe').length },
    ];
    return [
      { text: 'Drill 30 ore', done: o.drilled >= 30 },
      { text: 'Jump into another body (Tab or F)', done: o.jumped },
      { text: 'Answer the squad when they pitch a plan', done: o.answered },
      { text: SIDE.out === 2 ? (left > 1 ? `Squash every Mother Cap (${left} growing)` : 'Squash the Mother Cap') : `Smash the Choir Stones (${3 - left}/3)`, done: left === 0 },
    ];
  }
}
