// The content registry (src/core/registry.ts): every faction's kinds are wired in, and a kind with no hooks and no art still walks, fights and dies.
// Runs in Node with no browser. Run with: node tools/run-ts.mjs test/core/registry.ts
import { noHud, noPipe } from '../../server/shim';
import { Game } from '../../src/game';
import { initHeadless } from '../../src/gfx';
import { DIFFS, UNIT, BLD, FACTION, TRAINS, UPGRADES, setMap, setSides, Kind, BKind } from '../../src/data';
import { unitRule, bldRule, factionRule, defineUnits, DEFAULTS } from '../../src/core/registry';

initHeadless();
const fail: string[] = []; const check = (ok: boolean, what: string) => { console.log((ok ? 'PASS ' : 'FAIL ') + what); if (!ok) fail.push(what); };
let seed = 5; Math.random = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };

// 1. Every faction is wired in: a brain, first-person controls, lines for the feed, and a model for every building.
for (const f of [0, 1, 2]) {
  const F = factionRule(f), name = FACTION[f].short;
  check(!!F.brain && !!F.drive && !!F.ai && !!F.books?.length && !!F.hints?.length && !!F.lines && !!F.chatter, `${name}: the faction has a bot brain, a body brain, first-person controls, playbooks, hints and feed lines`);
  const blds = (Object.keys(BLD) as BKind[]).filter(k => FACTION[f].builds.includes(k));
  check(blds.length > 0 && blds.every(k => !!bldRule(k).model), `${name}: every building it can build has a model hook (${blds.length})`);
  check(!!BLD[FACTION[f].barracks] && FACTION[f].builds.includes(FACTION[f].barracks), `${name}: its barracks (${FACTION[f].barracks}) is one of its buildings`);
}
check(!!DEFAULTS.ai && !!DEFAULTS.drive, 'a plain gun soldier is set as the default brain and controls');
check(Object.keys(unitRule('no such kind')).length === 0 && Object.keys(bldRule('no such kind')).length === 0, 'asking about a kind nobody defined gives an empty set of hooks, not an error');
defineUnits({ scratchmerge: { threat: 2 } }); defineUnits({ scratchmerge: { hop: 9 } });
check(unitRule('scratchmerge').threat === 2 && unitRule('scratchmerge').hop === 9, 'hooks given for one kind in two places are merged (rules and look files can both add to a kind)');
check(UPGRADES.every(u => !!BLD[u.at]) && Object.entries(TRAINS).every(([b, ks]) => !!BLD[b as BKind] && ks!.every(k => !!UNIT[k])), 'every research names a real building and every trained kind is a real unit');

// 2. A scratch kind with no hooks and no art, on each faction's side: it gets a stand-in model, walks to an enemy, hurts it, and dies.
for (const f of [0, 1, 2]) {
  const kind = ('scratch' + f) as Kind;
  (UNIT as any)[kind] = { name: 'Scratch', team: f, hp: 120, shield: 0, speed: 4.5, eye: 1.6, headY: 1.6, bodyY: .9, rad: .6, cost: 50, time: 5, supply: 1, quip: '', ack: [''] };
  setMap(0); const [H, O] = setSides(f, f === 0 ? 1 : 0);
  const g = new Game(noPipe(), noHud, DIFFS[1], 0, null, null, true); g.noRender = true; g.evq = []; g.me = null; g.phase = 'play'; g.human = g.human.map(() => false);
  for (const u of g.units) u.pilot = 0;
  const s = g.spawn(kind, H, 40, 30), foe = g.spawn(FACTION[O].lead, O, 58, 30); foe.order = { type: 'guard', x: 58, z: 30 };
  s.order = { type: 'amove', x: 60, z: 30 }; const x0 = s.pos.x, hp0 = foe.hp + foe.shield;
  check(!!s.rig.body && !!s.rig.legL, `${FACTION[f].short} scratch: spawns with a stand-in model that has a body and legs`);
  let walked = false, hurt = false; for (let i = 0; i < 30 * 40 && s.alive; i++) { g.update(1 / 30); g.evq!.length = 0; if (s.pos.x > x0 + 3) walked = true; if (foe.hp + foe.shield < hp0) hurt = true; if (!foe.alive) break; }
  check(walked, `${FACTION[f].short} scratch: walks toward its order`);
  check(hurt, `${FACTION[f].short} scratch: hurts an enemy`);
  g.damage(s, 1e4, foe.alive ? foe : null);
  check(!s.alive, `${FACTION[f].short} scratch: dies`);
  delete (UNIT as any)[kind];
}

console.log(fail.length ? `\n${fail.length} FAILED` : '\nALL PASS');
process.exit(fail.length ? 1 : 0);
