// The campaign: five jobs that each teach one part of the game, then get out of the way.
import type { Game } from './game';
import type { BKind, Kind, Building } from './data';

export interface Objective { text: (g: Game) => string; done: (g: Game) => boolean }
export interface Mission {
  name: string; tag: string; map: number; diff: number; brief: string; teaches: string;
  /** Buildings and units the paperwork allows on this job. */
  allow: BKind[]; units: Kind[];
  /** Whether the Veyl raid on their usual clock, and whether the Quartermaster starts out building for you. */
  raids: boolean; auto: boolean;
  /** What the squad should go for when it pushes, if not the usual. */
  target?: (g: Game) => Building | null;
  objectives: Objective[]; setup?: (g: Game) => void; tick?: (g: Game, s: Record<string, number>, dt: number) => void;
  outro: string;
}
const own = (g: Game, k: Kind) => g.own(k).length;
const has = (g: Game, k: BKind) => g.ownB(k, true).length > 0;
const raiders = (g: Game) => g.units.filter(u => u.alive && u.team === 1 && u.order.type === 'raid').length;
const QM = 'Quartermaster';

export const MISSIONS: Mission[] = [
  {
    name: 'First Shift', tag: 'Job 1', map: 0, diff: 0, teaches: 'Moving, drilling, jumping bodies',
    brief: 'Welcome to the Ironhold Charter. You are a Rigger. You have a drill and a debt. Walk to the green ore, hold the mouse button, and carry it back to the Headframe. Company says the locals are friendly. Company has never been here.',
    allow: [], units: [], raids: false, auto: false,
    objectives: [
      { text: g => `Drill ore yourself (${Math.min(40, Math.floor(g.obj.drilled))}/40)`, done: g => g.obj.drilled >= 40 },
      { text: g => `Bank 250 ore as a crew (${Math.min(250, Math.floor(g.stats.mined))}/250)`, done: g => g.stats.mined >= 250 },
      { text: () => 'Jump into a Linesman (hold Tab, or look at one and press F)', done: g => g.ms.probe > 0 && g.obj.jumped },
      { text: g => g.ms.probe ? `See off the Veyl probe (${raiders(g)} left)` : 'See off whatever comes down the road', done: g => g.ms.probe === 2 },
    ],
    tick: (g, s, dt) => {
      if (!s.probe && g.stats.mined >= 250) {
        s.probe = 1; s.t = 14; g.obj.jumped = false;
        for (const [x, z] of [[6, 12], [9, 13], [7.5, 15]]) g.spawn('linesman', 0, x, z);
        g.dir.say(QM, 'Dust on the road. Company sent three rifles on credit. Hold Tab and jump into one. A drill is a bad idea against these.', 'al');
      }
      if (s.probe === 1) { s.t -= dt; if (s.t <= 0 && !s.sent) { s.sent = 1; g.dir.wave(['cantor', 'cantor', 'cantor']); for (const u of g.units) if (u.team === 1 && u.order.type === 'raid') { u.hp *= .6; u.shield *= .5; } g.dir.say('Lookout', 'Three Veyl on the road. They sing before they shoot. Do not wait for the chorus.', 'al'); } if (s.sent && !raiders(g)) s.probe = 2; else if (s.sent && !g.soldiers().length) { for (const [x, z] of [[6, 12], [9, 13]]) g.spawn('linesman', 0, x, z); g.dir.say(QM, 'Two more rifles. This is coming out of your pay. Tab into one.', 'al'); } }
    },
    outro: 'You dug, you jumped, you shot a stranger. That is the whole job. It gets bigger from here.',
  },
  {
    name: 'Payroll', tag: 'Job 2', map: 0, diff: 0, teaches: 'Building, training, holding a line',
    brief: 'One body is not a company. Press 2 to open the build menu and stake out a Bunkhouse. Walk up to it and press E to train Linesmen. You will need beds, so build a Depot. The Veyl are coming three times tonight, and each visit is ruder than the last.',
    allow: ['bunkhouse', 'depot', 'watchpost'], units: ['linesman'], raids: false, auto: false,
    objectives: [
      { text: () => 'Build a Bunkhouse (press 2, then click)', done: g => has(g, 'bunkhouse') },
      { text: g => `Train four Linesmen (${Math.min(4, Math.max(own(g, 'linesman'), g.ms.best || 0))}/4)`, done: g => (g.ms.best || 0) >= 4 },
      { text: g => `Hold the road through three raids (${Math.min(3, g.ms.cleared || 0)}/3)`, done: g => g.ms.cleared >= 3 },
    ],
    tick: (g, s, dt) => {
      s.best = Math.max(s.best || 0, own(g, 'linesman'));
      if (!s.go && (s.best >= 4 || g.time > 300)) { s.go = 1; s.t = 20; g.dir.say('Lookout', 'They know we are hiring. First raid in twenty seconds.', 'al'); }
      if (!s.go) return;
      if (s.live) { if (!raiders(g)) { s.live = 0; s.cleared = (s.cleared || 0) + 1; s.t = 45; if (s.cleared < 3) g.dir.say(QM, s.cleared === 1 ? 'One down. A Watchpost by the road would earn its keep.' : 'Two down. The last one will be the big one.', 'in'); } return; }
      if ((s.cleared || 0) >= 3) return;
      s.t -= dt; if (s.t <= 0) { const n = s.cleared || 0; s.live = 1; g.dir.wave(n === 0 ? ['cantor', 'cantor', 'cantor'] : n === 1 ? ['cantor', 'cantor', 'cantor', 'lancer', 'lancer'] : ['cantor', 'cantor', 'cantor', 'cantor', 'lancer', 'lancer', 'lancer'], n === 2); }
    },
    outro: 'The road held and the payroll cleared. You run a crew now. Try not to get attached.',
  },
  {
    name: 'Tools of the Trade', tag: 'Job 3', map: 0, diff: 0, teaches: 'Machine Shop, Breachers, Patches, upgrades, squad orders',
    brief: 'Rifles alone will not crack their gate. A Machine Shop gives you Breachers with shields, Patches who keep people alive, and upgrades for everyone. When the squad pitches a plan, answer with Z. They fight better when they think it was their idea. The Quartermaster will build for you from here. Press G if you want the job back.',
    allow: ['bunkhouse', 'depot', 'watchpost', 'machineshop'], units: ['linesman', 'breacher', 'patch'], raids: true, auto: true,
    objectives: [
      { text: () => 'Build a Machine Shop', done: g => has(g, 'machineshop') },
      { text: () => 'Buy an upgrade at the Machine Shop (E or T)', done: g => g.upOf(0).dmg || g.upOf(0).armor },
      { text: () => 'Say yes to a squad plan (Z)', done: g => g.obj.answered },
      { text: () => 'Break the Reed Gate', done: g => !g.gate() },
    ],
    target: g => g.gate(),
    outro: 'Gate is down and their reinforcements have to walk. Next time we bring the heavy gear.',
  },
  {
    name: 'Heavy Metal', tag: 'Job 4', map: 0, diff: 0, teaches: 'Foundry, Assay Office, Longshots, the Gantry, wrecking the map',
    brief: 'The Foundry builds the Gantry, which is a crane that learned to hate. Everything on this map breaks, and that is a weapon. The Needle\'s Eye arch stands over their only road. Shoot out a leg and the lintel lands on whoever is under it. Then walk the Gantry into a Brood Pit and close it for good.',
    allow: ['bunkhouse', 'depot', 'watchpost', 'machineshop', 'assay', 'foundry', 'mast'], units: ['linesman', 'breacher', 'patch', 'longshot', 'gantry'], raids: true, auto: true,
    objectives: [
      { text: () => 'Build a Foundry', done: g => has(g, 'foundry') },
      { text: () => 'Field a Gantry walker', done: g => g.ms.gantry > 0 },
      { text: () => 'Bring down the Needle\'s Eye', done: g => !g.props.some(p => p.alive && p.name === 'Needle\'s Eye' && p.y0 > 0) },
      { text: g => `Cave in a Brood Pit (${2 - g.pits().length}/1)`, done: g => g.pits().length < 2 },
    ],
    tick: (g, s) => {
      if (!s.gantry && own(g, 'gantry')) { s.gantry = 1; g.dir.wave(['warden', 'cantor', 'cantor', 'cantor', 'cantor']); g.dir.say('Lookout', 'They heard the Gantry. A Warden column is on the road and it has to pass under the arch. Just saying.', 'al'); }
    },
    target: g => g.pits().length > 1 ? g.pits()[0] : null,
    outro: 'An arch, a pit and a Warden, all flat. The Charter is impressed, which costs them nothing.',
  },
  {
    name: 'Ore Else', tag: 'Job 5', map: 1, diff: 0, teaches: 'Everything, on new ground',
    brief: 'Switchback Canyon. The whole Veyl base, and nobody is coming to help. The Ward Pylon halves every hit on their buildings, so it goes first. Brood Pits feed the raids. The Reed Gate feeds the garrison. The Choir Stones are the job. Finish this and the Charter clears you for joint operations.',
    allow: ['bunkhouse', 'depot', 'watchpost', 'machineshop', 'assay', 'foundry', 'mast'], units: ['linesman', 'breacher', 'patch', 'longshot', 'gantry'], raids: true, auto: true,
    objectives: [
      { text: () => 'Knock down the Ward Pylon', done: g => !g.buildings.some(b => b.alive && b.kind === 'wardpylon') },
      { text: g => `Cave in both Brood Pits (${2 - g.pits().length}/2)`, done: g => !g.pits().length },
      { text: () => 'Break the Reed Gate', done: g => !g.gate() },
      { text: g => `Smash the Choir Stones (${3 - g.stones().length}/3)`, done: g => !g.stones().length },
    ],
    target: g => g.buildings.find(b => b.alive && b.kind === 'wardpylon') || (g.stones().length ? null : g.pits()[0] || g.gate()),
    outro: 'Nothing left standing and the ledger is black. You are cleared for joint operations. Multiplayer is unlocked.',
  },
];
