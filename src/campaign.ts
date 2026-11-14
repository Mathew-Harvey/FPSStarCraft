// The story campaign: 28 jobs across four acts and three side jobs. Each job teaches part of one side and moves the story on.
// Act 1 plays the Ironhold Charter, Act 2 the Veyl, Act 3 the Gloam, and Act 4 one job for each against Charter Security.
// Jobs where the player is at the outpost end of the map run on a hidden local host (see split.ts); the job's script runs there.
import type { Game } from './game';
import type { BKind, Kind, Building, Unit } from './data';
import { SIDE, FACTION, MAP, ROAD, VHOME, STORY, UNIT, roadPt, foeOf, fac } from './data';
import { addStatus } from './core/status';
import * as TR from './terrain';

export interface Objective { text: (g: Game) => string; done: (g: Game) => boolean }
export interface Mission {
  name: string; tag: string; /** Map code: base map plus ten times the size. */ map: number; diff: number; brief: string; teaches: string;
  /** 1 to 4 for the acts, 0 for a side job. */ act: number;
  /** The faction the player plays and the one they fight (0 Ironhold, 1 Veyl, 2 Gloam). */ side: number; foe: number;
  /** True when the player holds the outpost end of the map. Then the job runs on a local host and the player's screen is one seat of it. */ out: boolean;
  /** Buildings and units the job allows the player's side. The other side builds whatever it likes. */
  allow: BKind[]; units: Kind[];
  /** Whether the classic Veyl outpost raids on its own clock, and whether the side's builder starts switched on. */
  raids: boolean; auto: boolean;
  /** Fixed light for the whole job, 0 day to 1 night. Left out, the light follows the clock as usual. */ dusk?: number;
  /** Charter Security: which end of the map wears company grey, if any. */ charter?: 'home' | 'out';
  /** The builder cannot be switched on (job 11), weapons are locked (job 18), losing the home building does not end the job. */
  lockAuto?: boolean; noFire?: boolean; noHq?: boolean;
  /** The words in front of a countdown in the goal line, when the job keeps `ms.clock`. */ clockLabel?: string;
  /** What the squad should go for when it pushes, if not the usual. */
  target?: (g: Game) => Building | null;
  objectives: Objective[]; setup?: (g: Game) => void; tick?: (g: Game, s: Record<string, number>, dt: number) => void;
  outro: string; /** The end screen line when the job is lost, if not the usual. */ fail?: string | ((g: Game) => string);
  /** Cut scenes before the job starts and after it is won (see cutscene.ts). */ cutIn?: string[]; cutOut?: string[];
  /** A side job opens once this many story jobs are done. */ opens?: number;
}

// ---------------------------------------------------------------- helpers the jobs share
/** The player's team, and the team they fight. */
const me = (g: Game) => g.mission?.out || g.story?.out ? SIDE.out : SIDE.home;
const them = (g: Game) => foeOf(me(g));
/** A line in the player's message feed. */
const say = (g: Game, who: string, text: string, cls = 'in') => g.feed(who, text, cls, me(g));
/** Says it once, the first time the condition holds. */
const once = (g: Game, s: Record<string, number>, key: string, when: boolean, who: string, text: string, cls = 'in') => { if (!when || s[key]) return false; s[key] = 1; say(g, who, text, cls); return true; };
const nB = (g: Game, k: BKind, team = me(g)) => g.ownB(k, true, team).length;
const nU = (g: Game, k: Kind, team = me(g)) => g.own(k, team).length;
const army = (g: Game, team = me(g)) => g.army(team).length;
const hq = (g: Game, team: number) => g.ownB(FACTION[team].hq, false, team);
const banked = (g: Game) => me(g) === SIDE.home ? g.stats.mined : g.stats.minedV;
const upped = (g: Game, team = me(g)) => Object.values(g.upOf(team)).some(Boolean);
const propUp = (g: Game, name: string) => g.props.filter(p => p.alive && p.name === name).length;
const propDown = (g: Game, name: string) => g.props.filter(p => !p.alive && p.name === name).length;
/** The body the player is in: the local one, or on a local host the one a seat is driving. */
const body = (g: Game): Unit | null => g.me && g.me.alive ? g.me : g.units.find(u => u.alive && u.pilot > 0) || null;
const near = (u: { pos: { x: number; z: number } } | null, x: number, z: number, r: number) => !!u && Math.hypot(u.pos.x - x, u.pos.z - z) < r;
const mmss = (t: number) => `${Math.floor(Math.max(0, t) / 60)}:${String(Math.floor(Math.max(0, t) % 60)).padStart(2, '0')}`;
/** Where a team's first home building stands, or its end of the map. */
const homeOf = (g: Game, team: number): [number, number] => { const h = hq(g, team)[0]; return h ? [h.pos.x, h.pos.z] : team === SIDE.home ? [0, 0] : [VHOME.x, VHOME.z]; };
/** The road between the ends, as waypoints walking away from the given end. */
const roadPath = (fromHome: boolean) => { const p = [.25, .5, .75].map(k => roadPt(ROAD.len * k, 0)); return fromHome ? p : p.reverse(); };

// Bodies a job is keeping an eye on: a wave it sent, a survey team, a pair of Tenders.
const watched = new WeakMap<Game, Record<string, Unit[]>>();
const track = (g: Game, key: string, us: Unit[]) => { let w = watched.get(g); if (!w) watched.set(g, w = {}); w[key] = (w[key] || []).concat(us); return us; };
const left = (g: Game, key: string) => (watched.get(g)?.[key] || []).filter(u => u.alive).length;
/** How many of a watched group are still alive within `r` of a spot. */
const leftNear = (g: Game, key: string, [x, z]: [number, number], r: number) => (watched.get(g)?.[key] || []).filter(u => u.alive && near(u, x, z, r)).length;
/** Sends a column of `team` from its end of the map at the other end, along the road, and keeps track of it under `key`. */
function send(g: Game, team: number, kinds: Kind[], key: string, to?: [number, number]) {
  const fromHome = team === SIDE.home, [hx, hz] = homeOf(g, team), [tx, tz] = to || homeOf(g, foeOf(team)), path = roadPath(fromHome), start = roadPt(fromHome ? 10 : ROAD.len - 10, 0);
  const us = kinds.map((k, i) => { const u = g.spawn(k, team, (start[0] + hx) / 2 + (i % 4) * 1.6 - 2.4, (start[1] + hz) / 2 + Math.floor(i / 4) * 1.6 - 1.6); u.order = { type: 'raid', x: tx + (i % 3) * 2 - 2, z: tz + Math.floor(i / 3) * 2 - 2, path: path.map(p => [p[0] + (i % 3) - 1, p[1] + (i % 2)]) }; return u; });
  return track(g, key, us);
}
/** Puts a small base for `team` at a spot: the buildings named, already standing, and a guard of the units named. */
function outpost(g: Game, team: number, x: number, z: number, blds: BKind[], guards: Kind[], key: string) {
  const bs = blds.map((k, i) => g.addBuilding(k, team, x + (i % 2 ? 7 : -7) * (i > 1 ? .5 : 1), z + (i > 1 ? 7 : -3), true));
  const us = guards.map((k, i) => { const u = g.spawn(k, team, x + (i % 3) * 2 - 2, z + 4 + Math.floor(i / 3) * 2); u.order = { type: 'guard', x: u.pos.x, z: u.pos.z }; return u; });
  track(g, key, us); (g as any)['_b_' + key] = bs; return bs;
}
const standing = (g: Game, key: string) => (((g as any)['_b_' + key] || []) as Building[]).filter(b => b.alive).length;
/** Stops a bot side from planning its own pushes, so the job's script decides when it attacks. */
const hush = (g: Game, team: number, t = 1e9) => { g.dir.side(team).nextPlan = t; };
/** A countdown in `s.clock`. It ends the job as a loss at zero unless `win` says the clock reaching zero is the point. */
const countdown = (g: Game, s: Record<string, number>, dt: number, from: number, win = false) => { if (s.clock === undefined) s.clock = from; s.clock = Math.max(0, s.clock - dt); if (s.clock <= 0 && !win) s.lose = 1; return s.clock <= 0; };
const held = (s: Record<string, number>, key: string, dt: number, when: boolean) => { if (when) s[key] = (s[key] || 0) + dt; return s[key] || 0; };

/** A newer kind when the rules for it are in the build, else the older kind that stands in for it (Veyl Mutes before the Veyl rules land). */
const vk = (k: string, alt: Kind): Kind => ((UNIT as any)[k] ? k : alt) as Kind;
/** Hides a body the way a Veyl hiding song does: unseen until a detector is near it. A kind that is always unseen needs nothing. */
const hide = (u: Unit) => { if (!UNIT[u.kind].cloak) addStatus(u, 'unseen', Infinity); };
/** Flux banked by the player's side this job: every rise of the Flux purse (spending only lowers it). */
const fluxIn = (g: Game, s: Record<string, number>) => { const f = g.flux(me(g)); if (s.fLast !== undefined && f > s.fLast) s.fluxIn = (s.fluxIn || 0) + f - s.fLast; s.fLast = f; };
/** The player's base on a far field: a home building more than 40 m from the yard. */
const farHq = (g: Game) => g.hqs(me(g)).find(b => Math.hypot(b.pos.x, b.pos.z) > 40) || null;
/** Shaft Mines the player's side has in the ground on the middle of the road (from 30% to 65% of the way to the far end, within 12 m of it). */
const mines = (g: Game) => g.units.filter(u => { if (!u.alive || u.kind !== 'shaftmine' || u.team !== me(g)) return false; const dx = u.pos.x - ROAD.x, dz = u.pos.z - ROAD.z, a = dx * ROAD.dx + dz * ROAD.dz; return a > ROAD.len * .3 && a < ROAD.len * .65 && Math.abs(dx * ROAD.dz - dz * ROAD.dx) < 12; }).length;
/** Job 6: the top of the ledge over the Switchback canyon road (map 1). Job 10: the middle of the island south of the Needle's Eye road (map 20). */
const LEDGE: [number, number] = [78.8, -47.6], ISLE: [number, number] = [91, -103];

const QM = 'Quartermaster', AG = 'Aggie', MO = 'Moss', PIM = 'Pim', H5 = 'Held Fifth', PB = 'Phrasebook 3', AL = 'Abbot-Lyle', GL = 'The Gloam';
const raiders = (g: Game) => g.units.filter(u => u.alive && u.team === 1 && u.order.type === 'raid').length;
const own = (g: Game, k: Kind) => g.own(k).length;
const has = (g: Game, k: BKind) => g.ownB(k, true).length > 0;
// The Ironhold tree by tier, as the jobs open it up. Add-ons (Twin Bay, Lab Bay) count as buildings on a job's paperwork.
const IRON_T1: BKind[] = ['bunkhouse', 'depot', 'watchpost', 'dugout', 'pumpjack'];
const IRON_T3: BKind[] = [...IRON_T1, 'machineshop', 'twinbay', 'labbay', 'assay', 'flaktower', 'mast', 'foundry'];
const IRON_ALL: BKind[] = [...IRON_T3, 'hangar', 'annex'];
const IRON_UNITS: Kind[] = ['linesman', 'breacher', 'patch', 'sapper', 'longshot', 'dustbike', 'piledriver', 'gantry', 'hopper', 'flakkite', 'gadfly', 'surveyor', 'claimbarge'];
const VEYL_ALL: BKind[] = ['broodpit', 'hushwell', 'thornspire', 'wardpylon', 'reedgate'];
const VEYL_UNITS: Kind[] = ['tender', 'cantor', 'lancer', 'warden'];
const GLOAM_ALL: BKind[] = ['sporesac', 'warren', 'stinger', 'quillgarden', 'blisterbed', 'tuskhollow', 'oldgrowth'];
const GLOAM_UNITS: Kind[] = ['grazer', 'snapper', 'quillback', 'blister', 'mulcher'];
const DAY = .05, DUSK = .55, NIGHT = .85;

const job = (n: number, act: number, m: Omit<Mission, 'tag' | 'act' | 'out'> & { out?: boolean }): Mission => ({ ...m, tag: `Job ${n}`, act, out: m.out ?? m.side !== 0 });

// ================================================================ Act 1: Dig
// Twelve jobs, one new piece of the Ironhold kit each: the yard (1, 2), Flux (3), the Lab Bay (4), a second base (5), high ground (6),
// tier three and siege (7), Sappers (8), unseen bodies and detectors (9), fliers and transport (10), the command view (11), all of it (12).
const ACT1: Mission[] = [
  job(1, 1, {
    name: 'First Shift', side: 0, foe: 1, map: 0, diff: 0, dusk: DAY, teaches: 'Walking, drilling, banking ore, jumping bodies, the Linesman rifle',
    brief: 'You are Rigger Nineteen, new on Tithe, and you owe the Charter for the trip down. Walk to the green ore, hold the mouse button to drill, and carry the pack back to the Headframe. Aggie runs the yard. Moss is taking bets on how long you last.',
    allow: [], units: [], raids: false, auto: false, cutIn: ['arrival'],
    objectives: [
      { text: g => `Drill ore yourself (${Math.min(40, Math.floor(g.obj.drilled))}/40)`, done: g => g.obj.drilled >= 40 },
      { text: g => `Bank 250 ore as a crew (${Math.min(250, Math.floor(g.stats.mined))}/250)`, done: g => g.stats.mined >= 250 },
      { text: () => 'Jump into a Linesman (hold Tab, or look at one and press F)', done: g => g.ms.probe > 0 && g.obj.jumped },
      { text: g => g.ms.probe ? `See off the Veyl probe (${raiders(g)} left)` : 'See off whatever comes down the road', done: g => g.ms.probe === 2 },
    ],
    tick: (g, s, dt) => {
      s.t0 = (s.t0 || 0) + dt;
      once(g, s, 'l1', s.t0 > 3, QM, 'Welcome to Tithe, Nineteen. Your balance is minus eleven thousand ore. Noted.');
      once(g, s, 'l2', s.t0 > 10, AG, 'Hold the trigger, fill the pack, walk it home. Nobody gets paid for ore on the ground.');
      once(g, s, 'l3', g.obj.drilled > 15, MO, 'Four to one you freeze when something shoots back. Prove me wrong and I buy the first round.');
      if (!s.probe && g.stats.mined >= 250) {
        s.probe = 1; s.t = 14; g.obj.jumped = false;
        for (const [x, z] of [[6, 12], [9, 13], [7.5, 15]]) g.spawn('linesman', 0, x, z);
        say(g, QM, 'Dust on the road. The company sent three rifles on credit. Hold Tab and jump into one. A drill is a bad idea against these.', 'al');
      }
      if (s.probe === 1) { s.t -= dt; if (s.t <= 0 && !s.sent) { s.sent = 1; g.dir.wave(['cantor', 'cantor', 'cantor']); for (const u of g.units) if (u.team === 1 && u.order.type === 'raid') { u.hp *= .6; u.shield *= .5; } say(g, PIM, 'Three Veyl on the road. They sing before they shoot. Don\'t wait for the song to finish.', 'al'); } if (s.sent && !raiders(g)) s.probe = 2; else if (s.sent && !g.soldiers().length) { for (const [x, z] of [[6, 12], [9, 13]]) g.spawn('linesman', 0, x, z); say(g, QM, 'Two more rifles. This is coming out of your pay. Tab into one.', 'al'); } }
      once(g, s, 'l4', s.probe === 2, MO, 'You didn\'t freeze. I owe you a drink. Write it down before I forget.');
    },
    outro: 'You dug, you jumped, and you shot at a stranger. Moss owes you a drink. The work gets bigger from here.',
  }),
  job(2, 1, {
    name: 'Payroll', side: 0, foe: 1, map: 0, diff: 0, dusk: DAY, teaches: 'The build menu, the Bunkhouse, the Depot, Watchposts, raid warnings, grenades',
    brief: 'One body can\'t run a yard. Press 2 to open the build menu and stake out a Bunkhouse. Walk up to it and press E to train Linesmen. Every body needs a bed, so build a Depot too. A Depot sinks flat so your own crew can walk over it, and rises into a wall when an enemy comes near. Pim says the Veyl are coming three times today.',
    allow: ['bunkhouse', 'depot', 'watchpost'], units: ['linesman'], raids: false, auto: false,
    objectives: [
      { text: () => 'Build a Bunkhouse (press 2, then click)', done: g => has(g, 'bunkhouse') },
      { text: () => 'Build a Depot', done: g => has(g, 'depot') },
      { text: g => `Train four Linesmen (${Math.min(4, Math.max(own(g, 'linesman'), g.ms.best || 0))}/4)`, done: g => (g.ms.best || 0) >= 4 },
      { text: g => `Hold the road through three raids (${Math.min(3, g.ms.cleared || 0)}/3)`, done: g => g.ms.cleared >= 3 },
    ],
    tick: (g, s, dt) => {
      s.best = Math.max(s.best || 0, own(g, 'linesman'));
      once(g, s, 'l1', has(g, 'bunkhouse'), QM, 'Bunkhouse approved. Cost added to your balance. Noted.');
      if (!s.go && (s.best >= 4 || g.time > 300)) { s.go = 1; s.t = 20; say(g, PIM, 'They know we\'re hiring. First raid in twenty seconds. The one in front is Gary. Try not to hit Gary.', 'al'); }
      if (!s.go) return;
      if (s.live) { if (!raiders(g)) { s.live = 0; s.cleared = (s.cleared || 0) + 1; s.t = 45; if (s.cleared === 1) say(g, MO, 'That one was on the house. A Watchpost by the road would earn its keep.'); else if (s.cleared === 2) say(g, PIM, 'Fifteen seconds after this one, they come back with more. Gary looks upset.', 'al'); } return; }
      if ((s.cleared || 0) >= 3) return;
      s.t -= dt; if (s.t <= 0) { const n = s.cleared || 0; s.live = 1; g.dir.wave(n === 0 ? ['cantor', 'cantor', 'cantor'] : n === 1 ? ['cantor', 'cantor', 'cantor', 'lancer', 'lancer'] : ['cantor', 'cantor', 'cantor', 'cantor', 'lancer', 'lancer', 'lancer'], n === 2); }
    },
    outro: 'The road held and the payroll cleared. You run a crew now. Pim has named every raider you shot.',
  }),
  job(3, 1, {
    name: 'Gas Money', side: 0, foe: 1, map: 0, diff: 0, dusk: DAY, teaches: 'Flux vents, the Pump Jack, carrying Flux, the Machine Shop, the Twin Bay, Dustbikes and Kick Start',
    brief: 'Machines cost Flux as well as ore. Flux is a gas that comes out of vents in the ground. Stake a Pump Jack on the vent beside the yard, and Riggers carry Flux from it the way they carry ore. A Machine Shop costs 100 Flux and builds Dustbikes: fast bikes with a flame spout that burns soft bodies. Bolt a Twin Bay onto the Machine Shop (press N at it) and it builds two at once. Veyl Tenders are humming ore out of the north field, with a guard. Drive them off it.',
    allow: ['bunkhouse', 'depot', 'watchpost', 'pumpjack', 'machineshop', 'twinbay'], units: ['linesman', 'dustbike'], raids: false, auto: false,
    objectives: [
      { text: () => 'Stake a Pump Jack on a Flux vent (press 2)', done: g => has(g, 'pumpjack') },
      { text: g => `Bank 150 Flux (${Math.min(150, Math.floor(g.ms.fluxIn || 0))}/150)`, done: g => (g.ms.fluxIn || 0) >= 150 },
      { text: () => 'Build a Machine Shop', done: g => has(g, 'machineshop') },
      { text: () => 'Bolt a Twin Bay onto the Machine Shop (N)', done: g => has(g, 'twinbay') },
      { text: g => `Train four Dustbikes (${Math.min(4, Math.max(own(g, 'dustbike'), g.ms.bikes || 0))}/4)`, done: g => (g.ms.bikes || 0) >= 4 },
      { text: g => `Drive the Veyl off the north field (${leftNear(g, 'camp', MAP.exp, 30)} still there)`, done: g => !!g.ms.camp && !leftNear(g, 'camp', MAP.exp, 30) },
    ],
    setup: g => { const [x, z] = MAP.exp; outpost(g, them(g), x, z, [], ['tender', 'tender', 'tender', 'tender', 'cantor', 'cantor', 'lancer'], 'camp'); g.ms.camp = 1; hush(g, them(g), 600); },
    tick: (g, s, dt) => {
      fluxIn(g, s); s.bikes = Math.max(s.bikes || 0, own(g, 'dustbike')); s.t0 = (s.t0 || 0) + dt;
      once(g, s, 'l1', s.t0 > 3, AG, 'See the grey plume by the fence? That\'s a Flux vent. Put a Pump Jack on it and the Riggers will haul the gas in by the can.');
      once(g, s, 'l2', has(g, 'pumpjack'), QM, 'Flux is billed separately from ore. Two balances now, Nineteen. Noted twice.');
      once(g, s, 'l3', own(g, 'dustbike') > 0, MO, 'Two to one the first bike tips over on the first corner. Press T in one for Kick Start: it goes faster for a couple of seconds.');
      once(g, s, 'l4', !!s.camp && leftNear(g, 'camp', MAP.exp, 30) < 4, PIM, 'The Tenders are running. Gary\'s cousin is down there. I can tell by the hat.', 'al');
      // From seven minutes in, a raid every two and a half minutes, one Cantor bigger each time.
      if (s.t0 > 420 && s.t0 > (s.w || 0)) { const n = Math.round((s.t0 - 420) / 150); s.w = s.t0 + 150; g.dir.wave([...Array(3 + n).fill('cantor'), 'lancer']); }
    },
    outro: 'The north field is the yard\'s, and the Flux comes in by the can. The Quartermaster now sends two bills.',
  }),
  job(4, 1, {
    name: 'Tools of the Trade', side: 0, foe: 1, map: 0, diff: 0, dusk: NIGHT, teaches: 'The Lab Bay add-on, Breachers, the Assay Office, Patches and Painkiller, Infantry Guns, squad plans',
    brief: 'Rifles alone won\'t break the Veyl gate. Bolt a Lab Bay onto a Bunkhouse (press M at it) and that Bunkhouse can train Breachers, who carry shields and do extra damage to plated bodies. Build an Assay Office and the Bunkhouse can train Patches, who heal; a Patch can also press T to give one body a Painkiller. The Assay Office sells Infantry Guns. When the squad pitches a plan, press Z to say yes.',
    allow: ['bunkhouse', 'depot', 'watchpost', 'pumpjack', 'machineshop', 'twinbay', 'labbay', 'assay'], units: ['linesman', 'dustbike', 'breacher', 'patch'], raids: true, auto: false,
    objectives: [
      { text: () => 'Bolt a Lab Bay onto a Bunkhouse (M at the Bunkhouse)', done: g => has(g, 'labbay') },
      { text: g => `Train three Breachers (${Math.min(3, Math.max(own(g, 'breacher'), g.ms.br || 0))}/3)`, done: g => (g.ms.br || 0) >= 3 },
      { text: () => 'Build an Assay Office and buy Infantry Guns 1', done: g => !!g.upOf(me(g)).dmg },
      { text: () => 'Train a Patch', done: g => (g.ms.pat || 0) > 0 },
      { text: () => 'Say yes to a squad plan (Z)', done: g => g.obj.answered },
      { text: () => 'Break the Reed Gate', done: g => !g.gate() },
    ],
    tick: (g, s, dt) => {
      s.t0 = (s.t0 || 0) + dt; s.br = Math.max(s.br || 0, own(g, 'breacher')); s.pat = Math.max(s.pat || 0, own(g, 'patch'));
      once(g, s, 'l1', has(g, 'labbay'), QM, 'Lab Bay bolted on. Fifty ore and twenty-five Flux for a shed with test benches in it. Noted.');
      once(g, s, 'l2', own(g, 'breacher') > 0, AG, 'Shield goes in front. Patch goes behind the shield. You go where I tell you.');
      once(g, s, 'l3', s.t0 > 70, MO, 'The Reed Gate is where their reinforcements come from. The yard has never broken it. I\'ve got money on you.');
      once(g, s, 'l4', !g.gate(), PIM, 'Gate\'s down! Gary is going to be furious.');
    },
    target: g => g.gate(),
    outro: 'The gate is down, and Veyl reinforcements have to walk now. Moss wants to bring the heavy gear next time.',
  }),
  job(5, 1, {
    name: 'Night Shift', side: 0, foe: 1, map: 20, diff: 0, dusk: .7, teaches: 'A second Headframe on a far field, the Bastion Head, Riggers repairing, seams growing back',
    brief: 'Large map, at night. The yard\'s seams are running low, so stake a second Headframe on a far ore field and keep it standing until morning. Stand at the new Headframe and press L to refit it into a Bastion Head: thicker walls and a gun on the roof. A Dugout seats four Linesmen, who shoot out of it. Riggers repair anything they stand next to. Pim is keeping an eye on the empty seam by the yard.',
    allow: [...IRON_T1, 'machineshop', 'twinbay', 'labbay', 'assay'], units: ['linesman', 'dustbike', 'breacher', 'patch'], raids: true, auto: false,
    objectives: [
      { text: g => `Stake a second Headframe on a far field (${Math.min(2, g.hqs(me(g)).length)}/2)`, done: g => !!farHq(g) },
      { text: () => 'Refit the far Headframe into a Bastion Head (L at the Headframe)', done: g => farHq(g)?.kind === 'bastion' },
      { text: g => g.ms.post ? `Keep the far base standing until sunrise (${mmss(300 - (g.ms.hold || 0))})` : 'Keep the far base standing until sunrise', done: g => (g.ms.hold || 0) >= 300 },
    ],
    setup: g => { const n = g.ores[0]; if (n) n.amount = 0; },
    tick: (g, s, dt) => {
      const far = farHq(g);
      if (far && far.kind === 'bastion') { s.post = 1; s.farId = far.id; }
      once(g, s, 'l1', !!far, QM, 'Expansion approved. The Charter thanks you for your unpaid overtime.');
      if (s.post) { held(s, 'hold', dt, !!far); if (!far || !far.alive) s.lose = 1; }
      once(g, s, 'l2', !!far && far.hp < far.maxHp * .7, AG, 'You built it, you fix it. Put a Rigger next to it and it gets repaired. That\'s the whole management course.', 'al');
      if (s.post && !s.pushed) { s.pushed = 1; const fx = far!.pos.x, fz = far!.pos.z; s.fx = fx; s.fz = fz; }
      if (s.post && (s.hold || 0) > 60 && !s.w1) { s.w1 = 1; send(g, them(g), ['cantor', 'cantor', 'cantor', 'lancer', 'lancer'], 'w', [s.fx, s.fz]); say(g, PIM, 'Veyl heading for the new Headframe. Five of them.', 'al'); }
      if (s.post && (s.hold || 0) > 180 && !s.w2) { s.w2 = 1; send(g, them(g), ['cantor', 'cantor', 'cantor', 'cantor', 'lancer', 'lancer', 'lancer'], 'w', [s.fx, s.fz]); say(g, PIM, 'Seven more on the way to the far field.', 'al'); }
      // The seam that ran dry comes back overnight, and two Tenders are kneeling at it.
      s.t0 = (s.t0 || 0) + dt;
      if (s.t0 > 150 && !s.tend) { s.tend = 1; const n = g.ores[0]; if (n) { const us = [0, 1].map(i => { const u = g.spawn('tender', them(g), n.pos.x + 3 + i * 2, n.pos.z + 3); u.order = { type: 'guard', x: u.pos.x, z: u.pos.z }; return u; }); track(g, 'tend', us); } say(g, PIM, 'There are two Veyl at the empty seam by the yard. They\'re kneeling. They\'re humming at it.', 'al'); }
      if (s.tend === 1 && s.t0 > 190) { s.tend = 2; const n = g.ores[0]; if (left(g, 'tend') === 2 && n) { n.amount = Math.round(n.max * .35); g.oreCheck(n); say(g, PIM, 'They left. The seam is a third full again. Why are they putting it back?'); s.spared = 1; } else say(g, PIM, 'Somebody shot them. The seam is still empty.'); }
      once(g, s, 'l3', s.tend === 2 && !!s.spared, QM, 'Seam restored. Recorded as geological settling. Noted.');
    },
    fail: g => g.ms.post ? 'The Bastion Head on the far field was knocked down before sunrise.' : 'The Headframe is scrap. The Charter will be billing your next of kin.',
    outro: 'The far Bastion Head made it to morning. A seam you drilled dry is a third full again, and the Quartermaster has logged it as geological settling.',
  }),
  job(6, 1, {
    name: 'Core Sample', side: 0, foe: 1, map: 1, diff: 0, dusk: DAY, teaches: 'High ground and ramps, Survey Beacons, the Signal Mast, Longshots',
    brief: 'Switchback Canyon. The Assay Office wants a core from the seam on top of the ledge over the canyon road. Veyl Lancers hold the ledge. A body below a cliff cannot see what stands on top of it, but the Lancers up there can see you. Walk up the ramp, or stand a body on a Survey Beacon to see up onto the ledges near it. A Signal Mast lets the Bunkhouse train Longshots, who shoot a long way. Clear the ledge, then get a Rigger up there and drill for twenty seconds.',
    allow: [...IRON_T1, 'machineshop', 'twinbay', 'labbay', 'assay', 'mast'], units: ['linesman', 'dustbike', 'breacher', 'patch', 'longshot'], raids: true, auto: false,
    objectives: [
      { text: () => 'Build a Signal Mast (it needs an Assay Office)', done: g => has(g, 'mast') },
      { text: g => `Train two Longshots (${Math.min(2, Math.max(own(g, 'longshot'), g.ms.ls || 0))}/2)`, done: g => (g.ms.ls || 0) >= 2 },
      { text: g => `Clear the Lancers off the ledge (${left(g, 'ledge')} left)`, done: g => !!g.ms.ledge && !left(g, 'ledge') },
      { text: g => g.ms.at ? `Drill a core on the ledge (${Math.min(20, Math.floor(g.ms.core || 0))}/20 s)` : 'Get a Rigger up the ramp onto the ledge', done: g => (g.ms.core || 0) >= 20 },
      { text: () => 'Carry the core back to the Headframe', done: g => g.ms.home === 1 },
    ],
    setup: g => { const [x, z] = LEDGE; outpost(g, them(g), x, z, [], ['lancer', 'lancer', 'lancer', 'lancer', 'lancer', 'cantor'], 'ledge'); g.ms.ledge = 1; },
    tick: (g, s, dt) => {
      s.ls = Math.max(s.ls || 0, own(g, 'longshot'));
      const [lx, lz] = LEDGE, b = body(g), up = (u: Unit | null) => near(u, lx, lz, 8) && TR.h(u!.pos.x, u!.pos.z) > 2;
      const rig = b && b.kind === 'rigger' && up(b) ? b : g.own('rigger').find(u => up(u)) || null;
      if (rig && !left(g, 'ledge')) s.at = 1;
      if (s.at && (s.core || 0) < 20) held(s, 'core', dt, !!rig);
      once(g, s, 'l0', s.t0 === undefined, AG, 'The ledge is three and a half metres up. From the road you\'re shooting at a cliff. Go round by the ramp.');
      s.t0 = (s.t0 || 0) + dt;
      once(g, s, 'l1', own(g, 'longshot') > 0, MO, 'A Longshot on a Beacon sees the whole ledge. Five to one you still miss.');
      once(g, s, 'l2', !!s.at, QM, 'Core sample approved. Please don\'t die holding company equipment.');
      once(g, s, 'l3', (s.core || 0) >= 20, AG, 'Bring it home. I want to cut it open myself.');
      if ((s.core || 0) >= 20 && near(b, 0, 0, 14)) s.home = 1;
    },
    outro: 'The core has rings in it, one inside the next, like a tree trunk. Aggie looks at it for a long time and doesn\'t say anything.',
    cutOut: ['rings'],
  }),
  job(7, 1, {
    name: 'Heavy Metal', side: 0, foe: 1, map: 0, diff: 0, dusk: DAY, teaches: 'Tier three: the Foundry and the Gantry; a Lab Bay on the Machine Shop for the Pile Driver and its anchor; wrecking the map',
    brief: 'The Foundry builds the Gantry, a walking crane with two cannons. With a Lab Bay on the Machine Shop you can also build a Pile Driver: press C in it to anchor, and once its stakes are down it shells anything 13 to 30 metres away. Everything on this map can be broken, and that includes the Needle\'s Eye, the rock arch over the road. Shoot out one leg and the top falls on whatever is under it. Then shell a Brood Pit from out of its guards\' reach and cave it in.',
    allow: IRON_T3, units: ['linesman', 'dustbike', 'breacher', 'patch', 'longshot', 'gantry', 'piledriver'], raids: true, auto: false,
    objectives: [
      { text: () => 'Build a Foundry', done: g => has(g, 'foundry') },
      { text: () => 'Field a Gantry walker', done: g => (g.ms.gantry || 0) > 0 },
      { text: () => 'Bring down the Needle\'s Eye', done: g => !g.props.some(p => p.alive && p.name === 'Needle\'s Eye' && p.y0 > 0) },
      { text: () => 'Anchor a Pile Driver within 30 m of a Brood Pit (C in the Pile Driver)', done: g => g.ms.anch === 1 },
      { text: g => `Cave in a Brood Pit (${2 - g.pits().length}/1)`, done: g => g.pits().length < 2 },
    ],
    tick: (g, s) => {
      if (!s.gantry && own(g, 'gantry')) { s.gantry = 1; g.dir.wave(['warden', 'cantor', 'cantor', 'cantor', 'cantor']); say(g, MO, 'I want it noted that I love her. Also, a Warden column is coming, and it has to walk under the arch.'); }
      if (!s.anch && g.own('piledriverset' as Kind).some(u => g.pits().some(p => Math.hypot(p.pos.x - u.pos.x, p.pos.z - u.pos.z) < 31))) s.anch = 1;
      once(g, s, 'l1', s.gantry === 1 && !g.props.some(p => p.alive && p.name === 'Needle\'s Eye' && p.y0 > 0), QM, 'Scenery written off. Noted.');
      once(g, s, 'l2', !!s.anch, AG, 'Stakes are down. Now it can\'t move, so somebody stand in front of it.');
    },
    target: g => g.pits().length > 1 ? g.pits()[0] : null,
    outro: 'An arch, a Brood Pit and a Warden, all flat. Moss is taking bets on what the Gantry can step on next.',
  }),
  job(8, 1, {
    name: 'Ground Rules', side: 0, foe: 1, map: 2, diff: 1, dusk: DUSK, teaches: 'Sappers: Shaft Mines (C) and Satchels (T)',
    brief: 'Glass Flats, at dusk. Every evening a Warden walks the west causeway with a Cantor guard and flattens whatever the survey crew left out. A Sapper digs Shaft Mines: press C and the mine goes into the ground where you look, unseen, and blows up the first enemy that steps near it. Dig four on the causeway, halfway between the yard and the Veyl, before the column comes. Then press T at the Reed Gate to plant a Satchel on it.',
    allow: [...IRON_T1, 'machineshop', 'twinbay', 'labbay', 'assay'], units: ['linesman', 'dustbike', 'breacher', 'patch', 'sapper'], raids: false, auto: false,
    objectives: [
      { text: g => `Train two Sappers (${Math.min(2, Math.max(own(g, 'sapper'), g.ms.sap || 0))}/2)`, done: g => (g.ms.sap || 0) >= 2 },
      { text: g => `Dig Shaft Mines on the causeway, halfway to the Veyl (${Math.min(4, mines(g))}/4)`, done: g => mines(g) >= 4 },
      { text: g => g.ms.col ? `Stop the Warden column (${left(g, 'col')} left)` : 'Stop the Warden column', done: g => g.ms.col === 2 },
      { text: () => 'Blow up the Reed Gate', done: g => !g.gate() },
    ],
    setup: g => { hush(g, them(g), 900); },
    tick: (g, s, dt) => {
      s.sap = Math.max(s.sap || 0, own(g, 'sapper')); s.t0 = (s.t0 || 0) + dt;
      once(g, s, 'l1', s.t0 > 3, AG, 'Halfway down, the causeway is twenty metres wide. Mines there, and the Warden has to walk over them.');
      once(g, s, 'l2', own(g, 'sapper') > 0, MO, 'Sappers get paid by the hole. Don\'t stand near one when it counts.');
      if (!s.col && (mines(g) >= 4 || s.t0 > 480)) { s.col = 1; send(g, them(g), ['warden', 'cantor', 'cantor', 'cantor', 'cantor', 'lancer', 'lancer'], 'col'); say(g, PIM, 'Warden on the causeway. It\'s walking straight down the middle. They always do.', 'al'); }
      if (s.col === 1 && !left(g, 'col')) s.col = 2;
      once(g, s, 'l3', s.col === 2, QM, 'Causeway cleared. The Sappers have billed for the holes. Noted.');
      once(g, s, 'l4', !g.gate(), PIM, 'That was the Satchel? I felt it in my teeth.', 'al');
    },
    target: g => g.gate(),
    outro: 'The causeway is quiet and the Reed Gate is a crater. The survey crew can leave its gear out overnight.',
  }),
  job(9, 1, {
    name: 'Lamps', side: 0, foe: 1, map: 0, diff: 1, dusk: NIGHT, teaches: 'Unseen bodies and detectors: the Flak Tower and the Spotlight',
    brief: 'Riggers on the north field are being cut down at night and nobody sees by what. The Veyl have bodies you cannot see. Nobody can aim at an unseen body until a detector is near it: a Flak Tower sees unseen bodies within 11 metres, and the Spotlight research at the Assay Office lets every Watchpost do the same. Light up the north field and kill what comes for the Riggers.',
    allow: [...IRON_T1, 'machineshop', 'twinbay', 'labbay', 'assay', 'flaktower'], units: ['linesman', 'dustbike', 'breacher', 'patch', 'sapper'], raids: false, auto: false,
    objectives: [
      { text: () => 'Put a detector on the north field: a Flak Tower, or a Watchpost with Spotlight', done: g => g.ms.lit === 1 },
      { text: g => `Kill the unseen Veyl (${Math.min(8, g.ms.cut || 0)}/8)`, done: g => (g.ms.cut || 0) >= 8 },
      { text: g => `Get six Riggers working the north field under the lamp (${Math.min(6, g.ms.rig || 0)}/6)`, done: g => g.ms.lit === 1 && (g.ms.rig || 0) >= 6 },
    ],
    setup: g => { hush(g, them(g), 1e9); },
    tick: (g, s, dt) => {
      const [fx, fz] = MAP.exp; s.t0 = (s.t0 || 0) + dt;
      if (!s.lit && (g.ownB('flaktower', true, me(g)).some(b => near(b, fx, fz, 26)) || (!!g.upOf(me(g)).spotlight && g.ownB('watchpost', true, me(g)).some(b => near(b, fx, fz, 26))))) s.lit = 1;
      s.rig = g.own('rigger', me(g)).filter(u => near(u, fx, fz, 20)).length;
      // Every forty seconds, two unseen Veyl come for the Riggers on the north field. With no detector out there by five minutes in, they
      // start coming for the yard instead, one more every two minutes. Once a detector stands on the field, twelve more come and that is the last.
      s.nt = (s.nt ?? 30) - dt;
      if (s.lit && s.cap === undefined) s.cap = (s.sent || 0) + 12;
      if (s.nt <= 0 && (s.cap === undefined || (s.sent || 0) < s.cap)) { s.nt = 40; const yard = !s.lit && s.t0 > 300, n = s.lit ? 3 : yard ? 3 + Math.floor((s.t0 - 300) / 120) : 2; s.sent = (s.sent || 0) + n; for (const u of send(g, them(g), Array(n).fill(vk('mute', 'cantor')), 'ghost', yard ? [0, 0] : [fx, fz])) hide(u); once(g, s, 'l5', yard, PIM, 'Riggers at the fence are going down now, and I still can\'t see who\'s doing it.', 'al'); }
      s.cut = (s.sent || 0) - left(g, 'ghost');
      once(g, s, 'l1', (s.sent || 0) > 0 && s.t0 > 40, PIM, 'Another Rigger down at the north field. There\'s nobody there. There\'s nobody on any camera.', 'al');
      once(g, s, 'l2', !!s.l1 && s.t0 > 50, AG, 'There\'s somebody there. You just can\'t see them. Get a lamp on that field.');
      once(g, s, 'l3', !!s.lit, MO, 'Lamp\'s on. Near it they show up as a see-through shimmer. Shoot the shimmer.');
      once(g, s, 'l4', (s.cut || 0) >= 8, QM, 'Rigger losses this quarter: within forecast. Noted.');
    },
    outro: 'The unseen Veyl that cut down the Riggers are dead, and the north field has lamps on it all night. Pim has started sleeping with the light on.',
  }),
  job(10, 1, {
    name: 'Air Freight', side: 0, foe: 1, map: 20, diff: 1, dusk: DAY, teaches: 'The Hangar, the Hopper (carries eight beds of crew), islands only fliers reach, flying in first person',
    brief: 'Large map. The rings in the core run deeper under the island of rock south of the canyon, and no road or ramp goes up there. A Hangar builds Hoppers, which fly and carry eight beds of crew. Jump into the Hopper, fly it down beside a Rigger and some Linesmen and press the right mouse button to load them. Land on the island and press it again to let them out. The Rigger drills for twenty seconds, and then the Hopper flies it home.',
    allow: [...IRON_T3, 'hangar'], units: ['linesman', 'dustbike', 'breacher', 'patch', 'longshot', 'sapper', 'gantry', 'piledriver', 'hopper'], raids: true, auto: false,
    objectives: [
      { text: () => 'Build a Hangar (it needs a Machine Shop)', done: g => has(g, 'hangar') },
      { text: () => 'Train a Hopper', done: g => (g.ms.hop || 0) > 0 },
      { text: () => 'Land a Rigger on the island', done: g => (g.ms.isle || 0) > 0 },
      { text: g => `Drill a core on the island (${Math.min(20, Math.floor(g.ms.core || 0))}/20 s)`, done: g => (g.ms.core || 0) >= 20 },
      { text: () => 'Fly the Rigger back to the Headframe', done: g => g.ms.home === 1 },
    ],
    setup: g => { const [x, z] = ISLE; outpost(g, them(g), x, z, [], ['lancer', 'lancer', 'cantor', 'cantor'], 'isle'); },
    tick: (g, s, dt) => {
      s.hop = Math.max(s.hop || 0, own(g, 'hopper')); s.t0 = (s.t0 || 0) + dt; const [ix, iz] = ISLE;
      const on = g.own('rigger', me(g)).filter(u => !u.inside && near(u, ix, iz, 16));
      if (on.length) { s.isle = 1; if (!s.rid) s.rid = on[0].id; }
      if (s.isle && (s.core || 0) < 20) held(s, 'core', dt, on.length > 0);
      if ((s.core || 0) >= 20 && g.own('rigger', me(g)).some(u => u.id === s.rid && !u.inside && near(u, 0, 0, 16))) s.home = 1;
      once(g, s, 'l1', s.hop > 0, QM, 'Hopper on the books. Eight seats, no refunds. Noted.');
      once(g, s, 'l2', !!s.isle, AG, 'Lancers on the island. Get the rifles out first and the Rigger out last.');
      once(g, s, 'l3', (s.core || 0) >= 20, AG, 'Same rings. Deeper. Bring it home.');
      once(g, s, 'l4', !!s.l3 && s.t0 > 1, MO, 'Even money the Rigger asks to walk back next time.');
    },
    outro: 'The island core has the same rings, closer together. Aggie has started keeping the cores in her own locker.',
  }),
  job(11, 1, {
    name: 'Off the Books', side: 0, foe: 1, map: 2, diff: 1, dusk: NIGHT, teaches: 'Running the yard with no Quartermaster, the command view (N), control groups (Ctrl and a number), the Survey Rig and Haul Drones',
    brief: 'Glass Flats, at night. The Quartermaster has switched itself off to re-forecast, so nothing gets built unless you build it. Press N to lift out of your body into the command view, where you can see the whole yard and give orders from above. Drag a box round fighters and press Ctrl and a number to make a control group; press the number again to pick them. Refit a Headframe into a Survey Rig (J at the Headframe) to call down Haul Drones (P), then keep three bases standing while the raids get bigger.',
    allow: IRON_T3.concat(['hangar']), units: IRON_UNITS.filter(k => k !== 'claimbarge' && k !== 'gadfly' && k !== 'surveyor' && k !== 'flakkite'), raids: true, auto: false, lockAuto: true,
    objectives: [
      { text: () => 'Lift into the command view (N)', done: g => g.ms.lift === 1 },
      { text: () => 'Make a control group (Ctrl and a number key)', done: g => g.ms.grp === 1 },
      { text: () => 'Refit a Headframe into a Survey Rig and call down a Haul Drone (P)', done: g => (g.ms.drone || 0) > 0 },
      { text: g => `Run three bases (${Math.min(3, g.hqs(me(g)).length)}/3)`, done: g => (g.ms.three || 0) > 0 },
      { text: g => g.ms.three ? `Keep three bases standing (${mmss(480 - (g.ms.hold || 0))})` : 'Keep three bases standing for eight minutes', done: g => (g.ms.hold || 0) >= 480 },
    ],
    tick: (g, s, dt) => {
      s.t0 = (s.t0 || 0) + dt; const c = (g as any).cmd;
      if (c && c.on) s.lift = 1;
      if (c && c.groups && c.groups.some((G: any) => G.us.some((u: Unit) => u.alive) || (G.b && G.b.alive))) s.grp = 1;
      s.drone = Math.max(s.drone || 0, nU(g, 'hauldrone' as Kind));
      once(g, s, 'l1', s.t0 > 2, QM, 'I will be re-forecasting for this job. Try not to touch anything expensive.');
      const n = g.hqs(me(g)).length; if (n >= 3) s.three = 1;
      if (s.three) held(s, 'hold', dt, n >= 3);
      if (s.three && !s.raise && s.t0 > 60) { s.raise = 1; g.dir.raidIn = Math.min(g.dir.raidIn, 40); }
      once(g, s, 'l2', !!s.lift, AG, 'From up there you can see where the raid is going before it gets there. Use it.');
      once(g, s, 'l3', (s.drone || 0) > 0, QM, 'Haul Drone dispatched. It is rented by the minute and it will leave on time. Noted.');
      once(g, s, 'l4', s.t0 > 90, AL, 'Further to your previous message: quota remains outstanding. Please clear the Switchback outpost at your earliest convenience. Kind regards.', 'al');
      once(g, s, 'l5', !!s.l4 && s.t0 > 120, AG, 'That was sent forty minutes ago. Nobody upstairs is coming to help. Now we have it in writing.');
    },
    outro: 'Three bases stood all night with nobody but you building. Head office wants the Switchback outpost cleared by the end of the week.',
    cutOut: ['queue'],
  }),
  job(12, 1, {
    name: 'Ore Else', side: 0, foe: 1, map: 21, diff: 1, dusk: NIGHT, teaches: 'Everything Ironhold on a large map: the Head Office Annex and the Claim Barge, the whole Veyl base, the Warden',
    brief: 'Switchback Canyon, large, at night. This is the job head office asked for. Head office has sent the papers for a Head Office Annex, which lets the Hangar build a Claim Barge, a flying ship with two gun decks. The Ward Pylon halves every hit on Veyl buildings, so break it first. The Brood Pits feed their raids and the Reed Gate feeds their guard. Then break all three Choir Stones, and be ready to hold the yard after. Moss is leading the squad.',
    allow: IRON_ALL, units: IRON_UNITS, raids: true, auto: true,
    objectives: [
      { text: () => 'Build a Head Office Annex and field a Claim Barge', done: g => (g.ms.barge || 0) > 0 },
      { text: () => 'Knock down the Ward Pylon', done: g => !g.buildings.some(b => b.alive && b.kind === 'wardpylon') },
      { text: g => `Cave in both Brood Pits (${2 - g.pits().length}/2)`, done: g => !g.pits().length },
      { text: () => 'Break the Reed Gate', done: g => !g.gate() },
      { text: g => `Smash the Choir Stones (${3 - g.stones().length}/3)`, done: g => !g.stones().length },
      { text: g => g.ms.erupt ? `Hold the yard until the canyon settles (${mmss(g.ms.clock ?? 90)})` : 'Then get back to the yard', done: g => g.ms.safe === 1 },
    ],
    tick: (g, s, dt) => {
      s.barge = Math.max(s.barge || 0, nU(g, 'claimbarge'));
      once(g, s, 'l0', s.barge > 0, QM, 'Claim Barge on the books. It costs more than the yard. Please bring it back. Noted.');
      once(g, s, 'l1', g.stones().length === 1, MO, 'One Stone left. Drinks are on me after this.');
      if (!g.stones().length && !s.erupt) {
        s.erupt = 1; g.shake = 1.2; g.pipe.flash = 1;
        say(g, MO, 'That\'s the lot. Hang on. Why is the ground moving?', 'al');
        say(g, PIM, 'What is that? Nineteen, the canyon floor is splitting. Everybody back to the yard!', 'al');
        for (let i = 0; i < 3; i++) send(g, them(g), ['warden', 'cantor', 'cantor', 'cantor'], 'chase', [0, 0]);
      }
      if (s.erupt === 1) { g.shake = Math.max(g.shake, .35); once(g, s, 'l2', (s.clock ?? 90) < 80, MO, 'I\'ll hold the road. Go! Fifty says you make it out.', 'al'); once(g, s, 'l2b', (s.clock ?? 90) < 70, PIM, 'Moss, you bet ON Nineteen? You never win!', 'al'); once(g, s, 'l3', (s.clock ?? 90) < 40, PIM, 'I can\'t raise Moss. He was on the road when it went.', 'al'); if (countdown(g, s, dt, 90, true)) { s.safe = 1; s.erupt = 2; } }
    },
    target: g => g.buildings.find(b => b.alive && b.kind === 'wardpylon') || (g.stones().length ? null : g.pits()[0] || g.gate()),
    outro: 'The yard held. Moss didn\'t come back. Down the canyon the floor has split open, and pale fungus is pushing up out of the crack.',
    cutOut: ['seal'],
  }),
];

// ================================================================ Act 2: Sing
const ACT2: Mission[] = [
  job(13, 2, {
    name: 'Wrong Body', side: 1, foe: 2, map: 13, diff: 0, dusk: .35, teaches: 'Tenders humming ore, banking at a Choir Stone, singing buildings up, the Hush Well, shields growing back',
    brief: 'You wake up in a Veyl Tender. Held Fifth pulled your mind into it and wants help. A Tender hums ore into its sling with the mouse button and carries it to the Choir Stone. Press 2 to sing a building up from bare ground. The Choir Stone is cracked. Tenders mend it if nothing is hitting it.',
    allow: ['hushwell', 'choir'], units: ['tender'], raids: false, auto: false, cutIn: ['wrongbody'],
    objectives: [
      { text: g => { const c = hq(g, me(g))[0]; return `Let the Tenders mend the Choir Stone (${c ? Math.floor(c.hp / c.maxHp * 100) : 0}%)`; }, done: g => { const c = hq(g, me(g))[0]; return !!c && c.hp >= c.maxHp * .95; } },
      { text: g => `Bank 200 ore at the Choir Stone (${Math.min(200, Math.floor(banked(g)))}/200)`, done: g => banked(g) >= 200 },
      { text: () => 'Sing a Hush Well (press 2)', done: g => nB(g, 'hushwell') > 0 },
      { text: g => `Wake eight Tenders at the Stone (${Math.min(8, nU(g, 'tender'))}/8)`, done: g => nU(g, 'tender') >= 8 },
      { text: g => g.ms.wave ? `See off the Gloam stragglers (${left(g, 'w')} left)` : 'Hold the Stone', done: g => g.ms.wave === 2 },
    ],
    setup: g => { const c = hq(g, SIDE.out)[0]; if (c) c.hp = c.maxHp * .35; hush(g, SIDE.home); },
    tick: (g, s, dt) => {
      s.t0 = (s.t0 || 0) + dt;
      once(g, s, 'l1', s.t0 > 2, H5, 'YOU BROKE OUR STONES. NOW YOU WILL HELP US FIX THEM. THAT IS FAIR.');
      once(g, s, 'l2', s.t0 > 14, PB, '[FREE VERSION] ORE. SLING. STONE. WALK. [WORDS LEFT THIS MONTH: 2]');
      once(g, s, 'l3', s.t0 > 60, PIM, '(on the radio, faint) Nineteen? Anybody? Is anybody on this channel?');
      if (!s.wave && nU(g, 'tender') >= 8) { s.wave = 1; send(g, SIDE.home, ['snapper', 'snapper', 'snapper', 'snapper'], 'w'); say(g, H5, 'THE GLOAM SMELLS THE STONE GETTING WELL. TENDERS CAN FIGHT. HIT AND STEP BACK. YOUR SHIELD GROWS BACK IF NOTHING HITS IT.', 'al'); }
      if (s.wave === 1 && !left(g, 'w')) s.wave = 2;
    },
    outro: 'The Choir Stone is whole again and the Chorus has hands. Most of them are yours.',
  }),
  job(14, 2, {
    name: 'Brood', side: 1, foe: 2, map: 3, diff: 0, dusk: DAY, teaches: 'The Brood Pit, Cantors, Lancers, the Thorn Spire, spreading out against Blisters',
    brief: 'The Gloam has a nest on the north ridge. Wake a Brood Pit to train Cantors, who dash in and cut, and Lancers, who shoot from cover. Raise Thorn Spires to guard the Stone. Blisters explode when they reach a crowd, so keep your fighters apart. Then burn the nest off the ridge.',
    allow: ['hushwell', 'broodpit', 'thornspire', 'choir'], units: ['tender', 'cantor', 'lancer'], raids: false, auto: false,
    objectives: [
      { text: () => 'Wake a Brood Pit', done: g => nB(g, 'broodpit') > 0 },
      { text: g => `Raise two Thorn Spires (${Math.min(2, nB(g, 'thornspire'))}/2)`, done: g => nB(g, 'thornspire') >= 2 },
      { text: g => `Train six fighters (${Math.min(6, army(g))}/6)`, done: g => (g.ms.best || 0) >= 6 },
      { text: g => `Break the Gloam nest on the north ridge (${standing(g, 'nest')} left)`, done: g => g.ms.nest === 1 && !standing(g, 'nest') },
    ],
    setup: g => { const f = MAP.flank[1] || MAP.flank[0]; outpost(g, SIDE.home, f[0], f[1], ['sporesac', 'stinger', 'warren'], ['snapper', 'snapper', 'blister', 'quillback'], 'nest'); g.ms.nest = 1; hush(g, SIDE.home); },
    tick: (g, s, dt) => {
      s.best = Math.max(s.best || 0, army(g)); s.t0 = (s.t0 || 0) + dt;
      once(g, s, 'l1', nU(g, 'cantor') > 0, H5, 'HIT THEM AND GET OUT. IF YOU STAND STILL, THEY BITE.');
      if (!s.w1 && s.t0 > 150) { s.w1 = 1; send(g, SIDE.home, ['snapper', 'snapper', 'blister', 'blister'], 'w'); say(g, PB, '[FREE VERSION] BLISTERS. [WORDS LEFT THIS MONTH: 1]', 'al'); }
      if (!s.w2 && s.t0 > 330) { s.w2 = 1; send(g, SIDE.home, ['snapper', 'snapper', 'snapper', 'quillback', 'quillback', 'blister'], 'w'); }
      once(g, s, 'l2', s.t0 > 240, 'Static', '...four to one...', '');
    },
    outro: 'The ridge is clear and the Bloom on it is drying out. Somebody on the radio sounded like Moss.',
  }),
  job(15, 2, {
    name: 'Salt Road', side: 1, foe: 2, map: 22, diff: 1, dusk: DAY, teaches: 'A second Choir Stone on a far field, moving Tenders across open ground, killing Gloam buildings so the Bloom dies',
    brief: 'Glass Flats, large. Walk a group of Tenders across the open flats and raise a Choir Stone on a far ore field. The Gloam has two camps out here. Each Gloam building spreads Bloom around it, and the Bloom dies when the building does. Break both camps.',
    allow: ['hushwell', 'broodpit', 'thornspire', 'choir'], units: ['tender', 'cantor', 'lancer'], raids: false, auto: false,
    objectives: [
      { text: g => `Raise a Choir Stone on a far field (${Math.min(2, nB(g, 'choir'))}/2)`, done: g => nB(g, 'choir') >= 2 },
      { text: g => `Break the first Gloam camp (${standing(g, 'c1')} left)`, done: g => !standing(g, 'c1') },
      { text: g => `Break the second Gloam camp (${standing(g, 'c2')} left)`, done: g => !standing(g, 'c2') },
    ],
    setup: g => { const st = MAP.sites || []; const a = st[2] || st[0], b = st[3] || st[1] || st[0]; outpost(g, SIDE.home, a[0], a[1], ['sporesac', 'stinger'], ['snapper', 'snapper', 'quillback'], 'c1'); outpost(g, SIDE.home, b[0], b[1], ['sporesac', 'stinger', 'warren'], ['snapper', 'snapper', 'snapper', 'quillback'], 'c2'); hush(g, SIDE.home, 600); },
    tick: (g, s, dt) => {
      s.t0 = (s.t0 || 0) + dt;
      once(g, s, 'l1', s.t0 > 4, H5, 'WE HAVE SUNG HERE FOR NINE HUNDRED YEARS. YOU ARRIVED LAST WEEK. FOLLOW ME.');
      once(g, s, 'l2', standing(g, 'c1') < 2 || standing(g, 'c2') < 3, H5, 'KILL A GLOAM BUILDING AND ITS CARPET DIES. SO KILL THE BUILDINGS.');
      once(g, s, 'l3', nB(g, 'choir') >= 2, H5, 'WE SANG THE GROUND INTO GLASS TO KEEP THE GLOAM DOWN THERE. WE HAVE SUNG EVERY NIGHT SINCE, TO KEEP THE GLASS THICK.');
    },
    outro: 'Both camps are dead and the new Stone is singing. Held Fifth has told you how the glass was made.',
    cutOut: ['howsealed'],
  }),
  job(16, 2, {
    name: 'Old Friends', side: 1, foe: 0, map: 0, diff: 1, dusk: NIGHT, teaches: 'The Ward Pylon, Watcher warnings, toppling buildings on attackers, Veyl upgrades',
    brief: 'Aggie\'s yard thinks the Veyl opened the canyon and killed Moss. The Quartermaster is sending the crew up the road three times tonight. Raise a Ward Pylon, which halves every hit on the buildings near it, and hold the Choir Stone. Try not to kill the Riggers.',
    allow: ['hushwell', 'broodpit', 'thornspire', 'wardpylon', 'choir'], units: ['tender', 'cantor', 'lancer'], raids: false, auto: false,
    objectives: [
      { text: () => 'Raise a Ward Pylon', done: g => nB(g, 'wardpylon') > 0 },
      { text: () => 'Learn a song at the Ward Pylon (Keener Edges or Thicker Glass)', done: g => upped(g) },
      { text: g => `Hold off three attacks from the yard (${Math.min(3, g.ms.done || 0)}/3)`, done: g => (g.ms.done || 0) >= 3 },
    ],
    setup: g => { hush(g, SIDE.home); },
    tick: (g, s, dt) => {
      s.t0 = (s.t0 || 0) + dt;
      const waves: Kind[][] = [['linesman', 'linesman', 'linesman', 'linesman'], ['linesman', 'linesman', 'breacher', 'breacher', 'patch', 'linesman'], ['breacher', 'breacher', 'linesman', 'linesman', 'linesman', 'patch', 'longshot', 'longshot']];
      const n = s.done || 0;
      if (!s.live && n < 3 && s.t0 > (s.next || 120)) { s.live = 1; send(g, SIDE.home, waves[n], 'yard'); say(g, 'Watcher', n === 2 ? 'IRONHOLD ON THE ROAD. MANY OF THEM. LOUD BOOTS. SHIELDS IN FRONT.' : 'IRONHOLD ON THE ROAD. LOUD BOOTS.', 'al'); if (n === 0) say(g, AG, '(on the yard channel) Push them! They took Moss!', 'al'); if (n === 1) say(g, PIM, 'That Lancer walks like Nineteen. Why does it walk like Nineteen?'); if (n === 2) say(g, PIM, 'I can see Gary up there. Hi, Gary.'); }
      if (s.live && !left(g, 'yard')) { s.live = 0; s.done = n + 1; s.next = s.t0 + 90; }
    },
    outro: 'The crew went home three times. Pim kept calling your name on the old frequency.',
  }),
  job(17, 2, {
    name: 'Hold the Note', side: 1, foe: 2, map: 3, diff: 1, dusk: DAY, teaches: 'The Reed Gate, the Warden and its Low Note, the Conductor (G), Chorus Lead plans',
    brief: 'The crack is still open. A Warden standing near it can hold the Gloam back, but only while it is alive. Wake a Reed Gate, train a Warden and keep it within the ring by the crack for eight minutes. The Conductor builds for you on this job (G). The Chorus Lead pitches plans: Z says yes.',
    allow: [...VEYL_ALL, 'choir'], units: VEYL_UNITS, raids: false, auto: true,
    objectives: [
      { text: () => 'Wake a Reed Gate', done: g => nB(g, 'reedgate') > 0 },
      { text: () => 'Train a Warden', done: g => nU(g, 'warden') > 0 },
      { text: g => `Keep a Warden by the crack (${mmss(480 - (g.ms.hold || 0))})`, done: g => (g.ms.hold || 0) >= 480 },
    ],
    setup: g => { hush(g, SIDE.home, 420); },
    tick: (g, s, dt) => {
      const c = roadPt(ROAD.len * .52, 34), w = g.own('warden', me(g)).some(u => near(u, c[0], c[1], 30));
      held(s, 'hold', dt, w); s.t0 = (s.t0 || 0) + dt;
      once(g, s, 'l1', nU(g, 'warden') > 0, H5, 'TAKE THE WARDEN TO THE CRACK. STAY INSIDE ITS PINK RING. OUTSIDE IT, THE WARDEN CANNOT PROTECT YOU.');
      if ((s.hold || 0) > 1 && !s.w1) { s.w1 = 1; send(g, SIDE.home, ['snapper', 'snapper', 'snapper', 'quillback', 'blister'], 'w', c); }
      if ((s.hold || 0) > 200 && !s.w2) { s.w2 = 1; send(g, SIDE.home, ['mulcher', 'snapper', 'snapper', 'snapper', 'quillback', 'quillback'], 'w', c); say(g, 'Watcher', 'A BIG ONE. IT HAS TUSKS. IT IS COMING FOR THE WARDEN.', 'al'); }
      if ((s.hold || 0) > 360 && !s.w3) { s.w3 = 1; send(g, SIDE.home, ['mulcher', 'snapper', 'snapper', 'snapper', 'snapper', 'blister', 'blister'], 'w', c); }
    },
    outro: 'The Warden held the note for eight minutes. Held Fifth says the Chorus will do this every night, forever.',
  }),
  job(18, 2, {
    name: 'Open Hands', side: 1, foe: 0, map: 10, diff: 0, dusk: DUSK, teaches: 'Walking and dashing with weapons locked, reading Watchpost fire lines',
    brief: 'Weapons are locked for this job. Walk a single Lancer down the road to the yard gate without firing a shot, and stand in front of the Headframe. Pim has bought the paid version of the phrasebook. Nobody on either side will shoot unless somebody starts it.',
    allow: [], units: [], raids: false, auto: false, noFire: true, noHq: true,
    objectives: [
      { text: () => 'Walk down the road to the yard', done: g => g.ms.gate === 1 },
      { text: g => `Stand in front of the Headframe (${Math.min(10, Math.floor(g.ms.stand || 0))}/10 s)`, done: g => (g.ms.stand || 0) >= 10 },
      { text: () => 'Let Pim play the warning', done: g => g.ms.heard === 1 },
    ],
    setup: g => { g.truce = true; hush(g, SIDE.home); for (const u of g.own(undefined, SIDE.out)) { u.alive = false; g.scene.remove(u.obj); } const [x, z] = roadPt(ROAD.len - 14, 0); const u = g.spawn('lancer', SIDE.out, x, z); u.order = { type: 'guard', x, z }; },
    tick: (g, s, dt) => {
      const b = body(g); s.t0 = (s.t0 || 0) + dt;
      once(g, s, 'l1', s.t0 > 2, H5, 'GO WITH OPEN HANDS. IF THEY SHOOT, YOU WILL COME BACK TO A NEW BODY. TRY NOT TO NEED ONE.');
      if (near(b, ROAD.x, ROAD.z, 26)) s.gate = 1;
      once(g, s, 'l2', !!s.gate, PIM, 'Don\'t shoot! Nobody shoot! Aggie, it\'s standing the way Nineteen stands!', 'al');
      if (s.gate) held(s, 'stand', dt, near(b, 0, 0, 16));
      if ((s.stand || 0) >= 10 && !s.talk) { s.talk = s.t0; say(g, PIM, 'I paid for the full phrasebook. Everybody put your guns down and listen to this.'); }
      if (s.talk && s.t0 > s.talk + 5 && !s.heard) { s.heard = 1; say(g, PB, '[PAID VERSION] PLAYING MESSAGE ONE OF ONE. RECEIVED THIRTY-ONE YEARS AGO.'); }
    },
    outro: 'The yard has stood down. Aggie heard the whole warning for the first time, thirty-one years late.',
    cutOut: ['warning', 'clause9queue'],
  }),
  job(19, 2, {
    name: 'The Last Verse', side: 1, foe: 2, map: 23, diff: 2, dusk: .3, teaches: 'Everything Veyl on a large map, holding three Choir Stones at once, and one choice',
    brief: 'The Chorus is going to sing the crack shut. Raise a Choir Stone on each of the three marked spots around the crack. The song needs your voice too, so stand between the Stones and keep all three standing for three minutes while the Gloam attacks with everything it has.',
    allow: [...VEYL_ALL, 'choir'], units: VEYL_UNITS, raids: false, auto: true, clockLabel: 'The verse ends in',
    objectives: [
      { text: g => `Raise a Choir Stone on each marked spot (${spots(g)}/3)`, done: g => (g.ms.raised || 0) > 0 },
      { text: g => g.ms.raised ? `Stand between the Stones and hold all three (${mmss(180 - (g.ms.hold || 0))})` : 'Stand between the Stones and hold all three', done: g => (g.ms.hold || 0) >= 180 },
      { text: g => g.ms.turn ? 'Stop singing: walk out from between the Stones' : 'Finish the verse', done: g => g.ms.out === 1 },
    ],
    setup: g => { hush(g, SIDE.home, 300); },
    tick: (g, s, dt) => {
      const c = roadPt(ROAD.len * .52, 34), b = body(g), inRing = near(b, c[0], c[1], 55);
      if (spots(g) >= 3) s.raised = 1;
      if (s.raised && !s.turn) held(s, 'hold', dt, spots(g) >= 3 && inRing);
      s.t0 = (s.t0 || 0) + dt;
      once(g, s, 'l1', s.t0 > 3, H5, 'THREE STONES AROUND THE CRACK. EVERY VOICE WE HAVE. THEN THE GLASS CLOSES.');
      once(g, s, 'l2', !!s.raised, QM, '(on the yard channel) The claim is impaired. Clause 9 is in the queue.', 'al');
      once(g, s, 'lr', !!s.raised && !s.turn && !!b && !inRing && (s.hold || 0) > 5, H5, 'THE SONG NEEDS YOUR VOICE. STAND BETWEEN THE STONES.', 'al');
      if (s.raised && !s.p) { s.p = 1; hush(g, SIDE.home, g.time + 20); }
      // The turn. The verse has a minute left, and Held Fifth says where the glass stops: nowhere. Staying finishes the verse and buries the yard.
      if ((s.hold || 0) >= 180 && !s.turn) { s.turn = 1; s.tt = 0; s.away = 0; say(g, H5, 'ONE MINUTE MORE. THEN ALL THE OPEN GROUND TURNS TO GLASS. ALL OF IT. THE YARD TOO.', 'al'); }
      if (s.turn === 1) {
        s.tt += dt;
        once(g, s, 'l4', s.tt > 6, PB, '[PAID VERSION] ...AND THE SMALL LOUD ONES [TRANSLATION: HUMANS] GO UNDER THE GLASS WITH THE REST.', 'al');
        once(g, s, 'l5', s.tt > 14, PIM, '(on the radio, faint) Nineteen? The ground by the fence has gone hard and shiny. Aggie wants to know if that\'s you.', 'al');
        once(g, s, 'l6', s.tt > 30, H5, 'STAY. HOLD THE NOTE. IT IS NEARLY DONE.', 'al');
        countdown(g, s, dt, 60);
        if (b && !inRing) s.away += dt; else s.away = 0;
        if (s.away >= 2) {
          s.turn = 2; s.out = 1; s.lose = 0; g.shake = 1; g.pipe.flash = 1;
          const st = g.ownB('choir', false, me(g)).sort((p, q) => Math.hypot(p.pos.x - b!.pos.x, p.pos.z - b!.pos.z) - Math.hypot(q.pos.x - b!.pos.x, q.pos.z - b!.pos.z))[0]; if (st && g.ownB('choir', false, me(g)).length > 1) g.damage(st, 1e7, null);
          say(g, H5, 'YOU HAVE LEFT THE SONG. COME BACK.', 'al');
        }
      }
    },
    outro: 'You walked out of the song, and the glass stopped short of the yard. Held Fifth did not follow you. The Gloam came up through the gap and took the nearest Stone, and your body with it.',
    fail: g => g.ms.clock !== undefined && g.ms.clock <= 1 ? 'The verse finished. The glass closed over the crack, the canyon and the yard. Aggie and Pim are under it.' : 'The Stones fell. The crack is still open.',
    cutOut: ['lastverse'],
  }),
];
/** The three marked spots around the crack for job 19 (The Last Verse), and how many have a Choir Stone on them. */
const crackSpots = () => [-30, 0, 30].map(k => { const c = roadPt(ROAD.len * .52 + k, 34 + (k ? -14 : 16)); return c; });
const spots = (g: Game) => crackSpots().filter(([x, z]) => g.ownB('choir', true, me(g)).some(b => Math.hypot(b.pos.x - x, b.pos.z - z) < 16)).length;

// ================================================================ Act 3: Grow
const ACT3: Mission[] = [
  job(20, 3, {
    name: 'Rooted', side: 2, foe: 1, map: 13, diff: 0, dusk: .35, teaches: 'Grazers, the Mother Cap and its Buds, rooting buildings, the Bloom',
    brief: 'You wake up as a Gloam Grazer, and the Gloam talks to you in Moss\'s voice. A Grazer chews ore. Each Gloam building is a Grazer that puts down roots, so building costs a body. A Mother Cap ripens three Buds, one every seven seconds, and they all hatch at once. Your fighters run faster and heal on the Bloom.',
    allow: ['sporesac', 'mothercap'], units: ['grazer', 'snapper'], raids: false, auto: false, cutIn: ['longshift'],
    objectives: [
      { text: g => `Chew 200 ore (${Math.min(200, Math.floor(banked(g)))}/200)`, done: g => banked(g) >= 200 },
      { text: () => 'Root a Spore Sac (press 2)', done: g => nB(g, 'sporesac') > 0 },
      { text: g => g.ms.used ? 'Let the Mother Cap ripen a new set of Buds' : 'Hatch the Buds on the Mother Cap (press E at the Cap)', done: g => g.ms.full === 1 },
      { text: g => `Root a Mother Cap on a second field (${Math.min(2, nB(g, 'mothercap'))}/2)`, done: g => nB(g, 'mothercap') >= 2 },
    ],
    // Snappers come from a Warren, which this job does not have yet, so the Gloam starts the player with four of its own.
    setup: g => { hush(g, SIDE.home); const [x, z] = homeOf(g, SIDE.out); for (let i = 0; i < 4; i++) { const u = g.spawn('snapper', SIDE.out, x - 6 + i * 2, z + 8); u.order = { type: 'guard', x: u.pos.x, z: u.pos.z }; } },
    tick: (g, s, dt) => {
      s.t0 = (s.t0 || 0) + dt;
      const caps = g.ownB('mothercap', true, me(g)); if (caps.some(b => b.buds !== undefined && b.buds < 3)) s.used = 1; if (s.used && caps.some(b => (b.buds || 0) >= 3 && b.queue.length === 0)) s.full = 1;
      once(g, s, 'l1', s.t0 > 2, MO, 'Chewing is the same as drilling. Walk it to the Cap, same as the Headframe. You\'ll pick it up.');
      once(g, s, 'l2', s.t0 > 16, GL, 'MIND YOUR STEP. LIFT WITH YOUR LEGS. YOU HAVE SIX.');
      once(g, s, 'l3', !!s.full, MO, 'Everything hatches together down here. Nobody waits in a queue. I like it.');
      if (!s.w && s.t0 > 200) { s.w = 1; send(g, SIDE.home, ['cantor', 'cantor', 'lancer'], 'w'); say(g, MO, 'Three Veyl coming to burn us out. Snappers bite. Go on.', 'al'); }
    },
    outro: 'The Bloom reaches the canyon wall. Moss is still running his book, and you are on it.',
  }),
  job(21, 3, {
    name: 'Two to a Bud', side: 2, foe: 0, map: 3, diff: 1, dusk: NIGHT, charter: 'home', teaches: 'The Warren, Snappers, Gloam upgrades, the Stinger Stalk, scattering from grenades',
    brief: 'Charter Security has landed. They wear the same Ironhold kit as Aggie\'s crew, in company grey, and the Quartermaster runs them. Three survey teams are mapping the Bloom. Grow a Warren so each Bud hatches two Snappers, and hunt all three teams down before the survey finishes.',
    allow: ['sporesac', 'warren', 'stinger', 'mothercap'], units: ['grazer', 'snapper'], raids: false, auto: false, clockLabel: 'Survey done in',
    objectives: [
      { text: () => 'Grow a Warren', done: g => nB(g, 'warren') > 0 },
      { text: () => 'Learn an upgrade (Fat Buds, Long Tongues or Quick Legs)', done: g => upped(g) },
      { text: g => `Wipe out the survey teams (${['s0', 's1', 's2'].filter(k => left(g, k)).length} left)`, done: g => !left(g, 's0') && !left(g, 's1') && !left(g, 's2') },
    ],
    setup: g => { hush(g, SIDE.home); const st = MAP.sites || []; [st[1], st[2], st[3]].forEach((p, i) => { if (p) outpost(g, SIDE.home, p[0], p[1], [], ['linesman', 'linesman', 'linesman', 'longshot'], 's' + i); }); },
    tick: (g, s, dt) => {
      countdown(g, s, dt, 900); s.t0 = (s.t0 || 0) + dt;
      once(g, s, 'l1', s.t0 > 3, QM, '(Charter Security channel) Survey teams, please log all biological liabilities.');
      once(g, s, 'l2', nB(g, 'warren') > 0, MO, 'Two Snappers to a Bud. The Charter would love you.');
      once(g, s, 'l3', s.t0 > 40, MO, 'Those aren\'t Aggie\'s lot. Their boots are too clean.');
    },
    outro: 'No survey team made it home. Charter Security is not Aggie\'s crew. It answers to head office, and head office wants the glass.',
    fail: 'The survey finished. Charter Security knows where the Bloom is now.',
  }),
  job(22, 3, {
    name: 'The Garden', side: 2, foe: 1, map: 0, diff: 1, dusk: DAY, teaches: 'The Quill Garden, Quillbacks, the Blister Bed, Blisters, Gloam armour and Volatile Sap',
    brief: 'Held Fifth\'s Chorus is singing glass over the Bloom from three Choir Stones at the yard end. Grow a Quill Garden for Quillbacks, which shoot from range, and a Blister Bed for Blisters, which run in and burst. Break the Ward Pylon first, then all three Stones.',
    allow: ['sporesac', 'warren', 'stinger', 'quillgarden', 'blisterbed', 'mothercap'], units: ['grazer', 'snapper', 'quillback', 'blister'], raids: false, auto: false,
    objectives: [
      { text: () => 'Grow a Quill Garden', done: g => nB(g, 'quillgarden') > 0 },
      { text: () => 'Grow a Blister Bed', done: g => nB(g, 'blisterbed') > 0 },
      { text: () => 'Break the Ward Pylon', done: g => !g.ownB('wardpylon', false, them(g)).length },
      { text: g => `Silence the Choir Stones (${hq(g, them(g)).length} left)`, done: g => !hq(g, them(g)).length },
    ],
    setup: g => { g.addBuilding('wardpylon', SIDE.home, -12, 6, true); g.addBuilding('choir', SIDE.home, -14, -14, true); g.addBuilding('choir', SIDE.home, 12, -22, true); hush(g, SIDE.home, 360); },
    tick: (g, s, dt) => {
      s.t0 = (s.t0 || 0) + dt;
      once(g, s, 'l1', s.t0 > 4, H5, 'YOU ARE WITH THE GLOAM NOW. WE SAW YOU GO DOWN.', 'al');
      once(g, s, 'l2', nU(g, 'blister') > 0, MO, 'Fifty ore says you flinch when you send these at the Veyl.');
      once(g, s, 'l3', !g.ownB('wardpylon', false, them(g)).length, MO, 'You didn\'t flinch. I owe you fifty.');
      once(g, s, 'l4', hq(g, them(g)).length === 1, PB, 'THIS IS IMPOLITE OF YOU.');
    },
    target: g => g.ownB('wardpylon', false, SIDE.home)[0] || null,
    outro: 'The three Stones have gone quiet. Held Fifth knew it was you the whole time.',
  }),
  job(23, 3, {
    name: 'What It Remembers', side: 2, foe: 1, map: 24, diff: 1, dusk: DAY, teaches: 'The Tusk Hollow, Mulchers and their charge, Old Growth, the Overgrowth (G), Swarm Lead plans',
    brief: 'First Stone, large. The oldest Veyl site on Tithe sits behind the yard end, past two old glass walls across the road. Grow a Tusk Hollow and send Mulchers through the walls. Then get a Mulcher to the First Stone. The Overgrowth builds for you on this job (G), and the Swarm Lead pitches plans.',
    allow: GLOAM_ALL.concat(['mothercap']), units: GLOAM_UNITS, raids: false, auto: true,
    objectives: [
      { text: () => 'Grow a Tusk Hollow', done: g => nB(g, 'tuskhollow') > 0 },
      { text: g => `Break through the glass walls (${Math.min(6, propDown(g, 'Glass wall'))}/6 sections)`, done: g => propDown(g, 'Glass wall') >= 6 },
      { text: () => 'Get a Mulcher to the First Stone', done: g => g.ms.stone === 1 },
    ],
    setup: g => { hush(g, SIDE.home, 420); },
    tick: (g, s, dt) => {
      s.t0 = (s.t0 || 0) + dt;
      if (g.own('mulcher', me(g)).some(u => near(u, -40, -4, 16))) s.stone = 1;
      once(g, s, 'l1', nU(g, 'mulcher') > 0, MO, 'Swarm Lead here. Straight through the wall. Z for yes. Old habits.');
      once(g, s, 'l2', propDown(g, 'Glass wall') >= 3, GL, 'THE WALLS ARE OLD. THEY WERE SUNG OVER US. WE REMEMBER THE SINGING.');
      once(g, s, 'l3', !!s.stone, GL, 'THIS IS WHAT HAPPENED BEFORE THE GLASS.');
    },
    outro: 'At the First Stone the Gloam showed you what happened nine hundred years ago. It was on the surface first.',
    cutOut: ['beforeglass'],
  }),
  job(24, 3, {
    name: 'Spore Season', side: 2, foe: 0, map: 25, diff: 2, dusk: NIGHT, charter: 'home', teaches: 'Everything Gloam on a large map',
    brief: 'Drill Site, large, at night. Charter Security has built a drill tower on the Glass Flats, and the hole under it goes deeper than any seam. Break the tower, then root a Mother Cap on the shaft so the Bloom reaches open sky.',
    allow: GLOAM_ALL.concat(['mothercap']), units: GLOAM_UNITS, raids: false, auto: true,
    objectives: [
      { text: () => 'Break the Charter drill tower', done: g => !propUp(g, 'Drill tower') },
      { text: () => 'Root a Mother Cap by the shaft', done: g => g.ms.sky === 1 },
    ],
    setup: g => { hush(g, SIDE.home, 300); },
    tick: (g, s, dt) => {
      s.t0 = (s.t0 || 0) + dt; const [tx, tz] = roadPt(ROAD.len * .3, -30);
      once(g, s, 'l1', s.t0 > 60, QM, 'Charge depth reached. Thank you for your patience.', 'al');
      once(g, s, 'l2', s.t0 > 80, MO, 'Go on. This one\'s even money and I\'m in for everything.');
      if (!propUp(g, 'Drill tower') && g.ownB('mothercap', false, me(g)).some(b => Math.hypot(b.pos.x - tx, b.pos.z - tz) < 34)) s.sky = 1;
      once(g, s, 'l3', !propUp(g, 'Drill tower'), AL, 'The asset will be liquidated in line with Clause 9. Kind regards.', 'al');
    },
    outro: 'The Bloom has open sky. Under the drill site you found what Clause 9 is: a bomb under the glass, big enough to crack the basin open.',
    cutOut: ['clause9'],
  }),
];

// ================================================================ Act 4: Or Else
const ACT4: Mission[] = [
  job(25, 4, {
    name: 'Old Opening', side: 0, foe: 0, map: 21, diff: 1, dusk: NIGHT, charter: 'out', teaches: 'Anti-air: Flak Towers, Flak Kites and the Gantry\'s flak mode; the Surveyor as a flying detector; Ironhold against Ironhold',
    brief: 'Pim\'s receiver pulled your mind out of the Gloam and into a Rigger. Charter Security holds the old Veyl end of Switchback, and the Quartermaster runs it with the build orders you used in Act 1, plus Gadflies: gunships that hide in smoke. A Flak Tower shoots fliers and sees hidden ones near it. Flak Kites are fliers that only shoot fliers. A Gantry can press T to swap its cannons for flak. A Surveyor flies over the fight and sees hidden bodies around it. Shoot down the Charter\'s fliers, then break every Charter Headframe.',
    allow: IRON_ALL, units: IRON_UNITS, raids: false, auto: false, cutIn: ['receiver'],
    objectives: [
      { text: () => 'Build a Flak Tower', done: g => has(g, 'flaktower') },
      { text: () => 'Field a Flak Kite or a Surveyor (Hangar; a Surveyor needs a Lab Bay on it)', done: g => (g.ms.aa || 0) > 0 },
      { text: g => `Shoot down the Charter fliers (${Math.min(8, g.ms.down || 0)}/8)`, done: g => (g.ms.down || 0) >= 8 },
      { text: g => `Break every Charter Headframe (${hq(g, them(g)).length} standing)`, done: g => !hq(g, them(g)).length },
    ],
    // The Charter has Smoke Cloak from the start, and sends Gadflies (with a Hopper drop behind them) every two minutes until eight are down.
    setup: g => { g.upOf(them(g)).smoke = true; },
    tick: (g, s, dt) => {
      s.t0 = (s.t0 || 0) + dt; s.aa = Math.max(s.aa || 0, nU(g, 'flakkite') + nU(g, 'surveyor'));
      if (s.t0 > (s.next ?? 150) && (s.sentA || 0) - left(g, 'air') < 8 && (s.down || 0) < 8) { s.next = s.t0 + 120; const n = (s.sentA || 0) < 4 ? 2 : 3; s.sentA = (s.sentA || 0) + n + 1; send(g, them(g), [...Array(n).fill('gadfly'), 'hopper'], 'air'); say(g, PIM, n === 2 ? 'Charter gunships coming up the canyon. Two, I think. They keep going see-through.' : 'More gunships. Three this time, and a Hopper behind them.', 'al'); }
      s.down = (s.sentA || 0) - left(g, 'air');
      once(g, s, 'l1', s.t0 > 3, AG, 'They\'re in grey, they\'re fresh, and the Quartermaster has your old build order. Open a different way this time.');
      once(g, s, 'l2', s.t0 > 40, QM, 'I have your opening on file, Nineteen. It was very efficient.', 'al');
      once(g, s, 'l2b', (s.down || 0) >= 8, PIM, 'Eight gunships down. The Charter has stopped sending them.');
      once(g, s, 'l3', hq(g, them(g)).length === 1, PIM, 'One Headframe left. Moss would have had a book on this.');
    },
    outro: 'Switchback is the crew\'s again. The Quartermaster lost to its own copy of your opening, and its gunships are scrap in the canyon.',
  }),
  job(26, 4, {
    name: 'Needle\'s Eye Road', side: 1, foe: 0, map: 0, diff: 1, dusk: DUSK, charter: 'home', teaches: 'The Warden as your own body, dropping the arch from the other side',
    brief: 'Charter Security is marching up the Needle\'s Eye road. Held Fifth\'s Chorus is holding it to protect the yard it planned to bury. Jump into a Warden, hold the road through three columns, and bring the arch down on one of them.',
    allow: [...VEYL_ALL, 'choir'], units: VEYL_UNITS, raids: false, auto: true,
    objectives: [
      { text: () => 'Jump into a Warden', done: g => g.ms.ward === 1 },
      { text: g => `Hold the road against three Charter columns (${Math.min(3, g.ms.done || 0)}/3)`, done: g => (g.ms.done || 0) >= 3 },
      { text: () => 'Bring down the Needle\'s Eye', done: g => !g.props.some(p => p.alive && p.name === 'Needle\'s Eye' && p.y0 > 0) },
    ],
    setup: g => { hush(g, SIDE.home); const [x, z] = roadPt(ROAD.len - 20, 2); g.spawn('warden', SIDE.out, x, z); },
    tick: (g, s, dt) => {
      s.t0 = (s.t0 || 0) + dt; const b = body(g); if (b && b.kind === 'warden') s.ward = 1;
      once(g, s, 'l1', s.t0 > 3, H5, 'WE WERE GOING TO BURY THEM. YOU KNOW THAT. NOW WE HOLD THEIR ROAD.');
      const waves: Kind[][] = [['linesman', 'linesman', 'linesman', 'breacher', 'patch'], ['breacher', 'breacher', 'linesman', 'linesman', 'linesman', 'longshot', 'patch'], ['gantry', 'breacher', 'breacher', 'linesman', 'linesman', 'linesman', 'linesman', 'patch']];
      const n = s.done || 0;
      if (!s.live && n < 3 && s.t0 > (s.next || 70)) { s.live = 1; send(g, SIDE.home, waves[n], 'col'); say(g, 'Watcher', 'GREY BOOTS ON THE ROAD. THEY WALK UNDER THE ARCH.', 'al'); }
      if (s.live && !left(g, 'col')) { s.live = 0; s.done = n + 1; s.next = s.t0 + 90; if (n === 0) say(g, PB, 'SECOND TIME YOU HAVE DROPPED THAT ARCH. STILL GOOD.'); }
      once(g, s, 'l2', (s.done || 0) >= 2, AG, '(on the yard channel) Thanks. Don\'t make it weird.');
    },
    outro: 'The road held. Held Fifth fought for the yard it meant to bury.',
  }),
  job(27, 4, {
    name: 'Rig Breakers', side: 2, foe: 0, map: 25, diff: 1, dusk: NIGHT, charter: 'home', teaches: 'Three objectives at once with the Swarm Lead',
    brief: 'Three Deep Charge rigs stand on the far fields of the Drill Site. Break all three before Charter Security arms the charge. The Swarm Lead (Moss) will pitch pushes. Split the swarm or move fast.',
    allow: GLOAM_ALL.concat(['mothercap']), units: GLOAM_UNITS, raids: false, auto: true, clockLabel: 'Charge armed in',
    objectives: [
      { text: g => `Break the Deep Charge rigs (${propUp(g, 'Deep Charge rig')} standing)`, done: g => !propUp(g, 'Deep Charge rig') },
    ],
    setup: g => { hush(g, SIDE.home, 360); },
    tick: (g, s, dt) => {
      countdown(g, s, dt, 1260); s.t0 = (s.t0 || 0) + dt; const up = propUp(g, 'Deep Charge rig');
      once(g, s, 'l1', s.t0 > 3, MO, 'Three rigs. I\'ve got you at four to one, same as day one.');
      once(g, s, 'l2', up === 1, QM, 'Rig two offline. Noted. Rig three, please carry on.', 'al');
      once(g, s, 'l3', up === 0, MO, 'That\'s the third rig. Come and see me before you go back up, Nineteen.');
    },
    outro: 'All three rigs are wrecked and the charge can\'t be armed from here. Moss is staying with the Gloam.',
    fail: 'The charge is armed.', cutOut: ['mossstays'],
  }),
  job(28, 4, {
    name: 'Fourteen Twenty', side: 0, foe: 0, map: 20, diff: 2, dusk: .62, charter: 'home', out: true, noHq: false, teaches: 'Everything, against the clock',
    brief: 'Needle\'s Eye, large, at sunset. Charter Security holds the yard, and the Quartermaster is inside the first Headframe, the one where you banked your first ore. The detonation order lands in forty minutes and nothing can stop it. Break that Headframe before it lands, so nobody is left to carry the order out.',
    allow: IRON_ALL, units: IRON_UNITS, raids: false, auto: false, clockLabel: 'Order lands in',
    objectives: [
      { text: () => 'Break the first Headframe', done: g => g.ms.first === 1 },
    ],
    setup: g => { hush(g, SIDE.home, 240); const h = g.ownB('headframe', false, SIDE.home)[0]; if (h) { h.maxHp *= 2; h.hp = h.maxHp; (g as any)._first = h; } },
    tick: (g, s, dt) => {
      countdown(g, s, dt, 2400); s.t0 = (s.t0 || 0) + dt;
      const h = (g as any)._first as Building | undefined; if (h && !h.alive) s.first = 1;
      once(g, s, 'l1', s.t0 > 3, QM, 'Liquidation is scheduled for fourteen twenty. I\'ve put the kettle on.', 'al');
      once(g, s, 'l2', s.t0 > 30, AG, 'That Headframe is where you banked your first pack. I poured its footings myself, so I know it can be broken. Go.');
      once(g, s, 'l2b', s.t0 > 600, QM, 'I don\'t want anything, Nineteen. I count things. Somebody else decides what the count is for.');
      once(g, s, 'l3', s.t0 > 900, H5, 'THE CHORUS IS ON THE NORTH RIDGE. WE SING FOR YOU NOW.');
      once(g, s, 'l4', s.t0 > 1200, MO, 'The swarm is on the road behind you. Don\'t look round, you won\'t like it.');
      once(g, s, 'l5', !!h && h.hp < h.maxHp * .3, QM, 'Closing balance requested. Please hold.', 'al');
      if (s.first && !s.bal) { s.bal = 1; say(g, QM, `Closing balance: ${Math.floor(STORY.oreTotal + g.stats.minedV).toLocaleString('en')} ore. Noted.`); }
    },
    target: g => (g as any)._first || null,
    outro: 'The first Headframe is down and nobody is left to carry out the order. In forty minutes head office will find out.',
    fail: 'The order landed.', cutOut: ['reserve', 'grows', 'invoice'],
  }),
];

// ================================================================ side jobs
const SIDES: Mission[] = [
  { name: 'Moss\'s Book', tag: 'Side job', act: 0, opens: 5, side: 0, foe: 1, out: false, map: 0, diff: 1, dusk: DAY, teaches: 'A skirmish on Moss\'s terms',
    brief: 'Moss has a bet on you: win the classic fight without a single Watchpost. Break all three Choir Stones. Watchposts are off the build menu for this one, so nobody can cheat.',
    allow: IRON_ALL.filter(k => k !== 'watchpost'), units: IRON_UNITS, raids: true, auto: false,
    objectives: [{ text: g => `Smash the Choir Stones without a Watchpost (${3 - g.stones().length}/3)`, done: g => !g.stones().length }],
    tick: (g, s, dt) => { s.t0 = (s.t0 || 0) + dt; once(g, s, 'l1', s.t0 > 3, MO, 'No Watchposts. Not one. Five to one says you crack and build one.'); },
    outro: 'Moss pays out. He says he knew you\'d do it, which is not what he said this morning.' },
  { name: 'Discord', tag: 'Side job', act: 0, opens: 17, side: 1, foe: 1, out: true, map: 3, diff: 1, dusk: .3, teaches: 'Veyl against Veyl',
    brief: 'A second Chorus wants to sing the yard under the glass right now, without waiting. Held Fifth disagrees. Silence every Choir Stone of the other Chorus.',
    allow: [...VEYL_ALL, 'choir'], units: VEYL_UNITS, raids: false, auto: true,
    objectives: [{ text: g => `Silence the other Chorus (${hq(g, them(g)).length} Stones left)`, done: g => !hq(g, them(g)).length }],
    tick: (g, s, dt) => { s.t0 = (s.t0 || 0) + dt; once(g, s, 'l1', s.t0 > 3, H5, 'THEY SING THE SAME SONG AS US, TOO SOON. STOP THEM.'); },
    outro: 'The other Chorus has stopped singing. The yard is still above the glass.' },
  { name: 'Rot', tag: 'Side job', act: 0, opens: 23, side: 2, foe: 2, out: true, map: 3, diff: 1, dusk: .4, teaches: 'Gloam against Gloam',
    brief: 'An older, sour patch of Gloam doesn\'t want to share the sky. Squash every one of its Mother Caps.',
    allow: GLOAM_ALL.concat(['mothercap']), units: GLOAM_UNITS, raids: false, auto: true,
    objectives: [{ text: g => `Squash the old Mother Caps (${hq(g, them(g)).length} left)`, done: g => !hq(g, them(g)).length }],
    tick: (g, s, dt) => { s.t0 = (s.t0 || 0) + dt; once(g, s, 'l1', s.t0 > 3, MO, 'This lot has been down there longer than we have. They smell like old socks.'); },
    outro: 'The sour patch is mulch. The Bloom on this side is yours.' },
];

/** The 28 story jobs in order, then the side jobs. `STORY_JOBS` story jobs make up the main campaign. */
export const MISSIONS: Mission[] = [...ACT1, ...ACT2, ...ACT3, ...ACT4, ...SIDES];
// An objective stays ticked once it is done. Without this a job could not finish when something done earlier was undone later: Tenders
// killed after the eighth was woken, a Bunkhouse burnt down, a Machine Shop lost in a raid. Timed holds keep their own clocks, so a
// hold that breaks still has to be held again. The first two seconds don't count, while the map and the set are still going up.
for (const m of MISSIONS) m.objectives = m.objectives.map((o, i) => ({ text: o.text, done: (g: Game) => { const k = '_o' + i; if (g.ms[k]) return true; const d = !!o.done(g); if (d && g.time > 2) g.ms[k] = 1; return d; } }));
export const STORY_JOBS = ACT1.length + ACT2.length + ACT3.length + ACT4.length;
/** Saves from before the full-depth Act 1 (`st: 2`) count jobs on the old list of 24. Act 1 went from eight jobs to twelve, so the old count
 *  is moved to the same next job on the new list; the new jobs before it open as if done, and can be played from the job list. */
export const fromOldSave = (camp: number) => camp < 8 ? [0, 1, 3, 4, 5, 6, 10, 11][camp] : camp + 4;
export const ACTS = [
  { n: 1, name: 'Dig', side: 'Ironhold Charter' }, { n: 2, name: 'Sing', side: 'Veyl Chorus' }, { n: 3, name: 'Grow', side: 'The Gloam' }, { n: 4, name: 'Or Else', side: 'All three' },
];
/** The two factions a job puts at each end of the map, as [yard end, outpost end]. */
export const missionSides = (m: Mission): [number, number] => m.out ? [m.foe, m.side] : [m.side, m.foe];
/** Charter grey for this job: the team at the named end, once the sides are set. */
export const charterTeam = (m: Mission | null) => !m || !m.charter ? -1 : m.charter === 'home' ? SIDE.home : SIDE.out;
void fac;
