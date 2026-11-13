// How Ironhold bodies and buildings are drawn: which model each building uses and the lamps they carry. The models themselves are in
// src/models.ts; this file only says which goes with which kind.
import * as MD from '../../../models';
import { defineUnits, defineBuildings, defineFaction, unitRule } from '../../../core/registry';
import { R } from '../../../gfx';
import type { VmPose, Weapon } from '../../../core/registry';
import type { Game } from '../../../game';
import { WARM, HEAD } from '../../../core/lamps';

defineBuildings({
  headframe: { model: a => MD.headframe(a) }, bunkhouse: { model: () => MD.bunkhouse() }, watchpost: { model: () => MD.watchpost() },
  depot: { model: () => MD.depot(), lamps: [[3.42, 1.7, 1.5, 11]] }, machineshop: { model: a => MD.machineshop(a), lamps: [[-3.2, 2.2, 3.5, 11], [-.6, 2.4, 2.8, 8]] },
  foundry: { model: a => MD.foundry(a) }, assay: { model: a => MD.assay(a), lamps: [[-1.6, 2.1, 3.2, 11]] }, mast: { model: a => MD.mast(a) },
});
defineUnits({
  rigger: { lamp: [1.5, .5, 4.5, WARM, .6] }, linesman: { lamp: [1.6, 1.2, 4, HEAD, .45] }, patch: { lamp: [1.6, 1.2, 4, HEAD, .45] }, breacher: { lamp: [1.6, 1.2, 4, HEAD, .45] }, gantry: { lamp: [3, 2.4, 8, HEAD, .7] },
});
defineUnits({
  // A Rigger swings the free arm and works the drill with the other.
  rigger: { pose(g, u, _dt, s, ease) { const r = u.rig, working = u.state === 'mining' || u.state === 'build' || u.state === 'repair'; if (r.armL) r.armL.rotation.x += (-s * .8 - r.armL.rotation.x) * ease; if (r.armR) r.armR.rotation.x = working ? -.5 + Math.sin(g.time * 34 + u.id) * .05 : s * .3; return true; } },
});

// The first-person view models: how the drill, the guns and the Gantry's cockpit sit, kick and reload.
/** The Breacher's scattergun and shield, and the view model any Ironhold body without an aimed gun falls back to. */
function scatterView(g: Game, pose: VmPose, rl: number, gun: Weapon | null) { const vm = g.vm, cd = gun ? gun.cd : 1; const pump = g.fireCd > 0 ? Math.sin(Math.min(1, (cd - g.fireCd) / (cd * .8)) * Math.PI) : 0; pose(vm.scatter, 0, g.recoil * .12, rl * .12 + g.ads * .16); vm.scatter.userData.mag.position.z = -.42 + pump * .12 + (rl > 0 ? Math.abs(Math.sin(g.reloadT * 9)) * .1 : 0); pose(vm.shield, g.ads, -g.bashT * 1.2, 0); }
/** An aimed gun (rifle, long rifle, rivet pistol): its view model is named in the kind's `shot`. */
function shotView(g: Game, pose: VmPose, rl: number, gun: Weapon | null) { const me = g.me!, vm = g.vm, long = me.kind === 'longshot'; const v = vm[unitRule(me.kind).shot!.vm], m = v.userData.mag; if (v.userData.magY === undefined) v.userData.magY = m.position.y; pose(v, g.ads, g.recoil * (long ? .11 : .05), rl * .14 + (long && g.fireCd > 0 && gun ? Math.sin(Math.min(1, 1 - g.fireCd / gun.cd) * Math.PI) * .05 * (1 - g.ads * .6) : 0)); m.position.y = v.userData.magY - (rl > .5 ? (rl - .5) * .5 : 0); }
defineUnits({
  rigger: { view(g, pose) { const vm = g.vm; pose(vm.drill, 0, (g.lmb && g.tool === 1 ? -.03 + R(-.004, .004) : 0) - g.bashT * 1.1, g.tool === 2 ? .12 : 0); } },
  gantry: { view(g, pose, rl) { const vm = g.vm; pose(vm.cannon, 0, 0, rl * .1); const k = g.recoil * .09; vm.cannon.userData.gunR.position.z = g.side > 0 ? k : 0; vm.cannon.userData.gunL.position.z = g.side < 0 ? k : 0; } },
});
defineFaction(0, { view(g, pose, rl, gun) { (unitRule(g.me!.kind).shot ? shotView : scatterView)(g, pose, rl, gun); } });
