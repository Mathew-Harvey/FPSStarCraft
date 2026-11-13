// How Veyl bodies and buildings are drawn: which model each building uses and the lamps the bodies carry. The models themselves are in
// src/models.ts; this file only says which goes with which kind.
import * as MD from '../../../models';
import { defineUnits, defineBuildings, defineFaction } from '../../../core/registry';
import { R } from '../../../gfx';
import { TEAL, ROSE } from '../../../core/lamps';

defineBuildings({
  choir: { model: a => MD.choir(a) }, reedgate: { model: a => MD.reedgate(a) }, broodpit: { model: a => MD.broodpit(a) },
  thornspire: { model: a => MD.thornspire(a) }, wardpylon: { model: a => MD.wardpylon(a) }, hushwell: { model: a => MD.hushwell(a) },
});
defineUnits({
  tender: { lamp: [1.3, .3, 4.5, TEAL, .6] }, cantor: { lamp: [1.6, .4, 5, TEAL, .7] }, lancer: { lamp: [1.4, .5, 4.5, ROSE, .55] }, warden: { lamp: [3, .8, 8, TEAL, .85] },
});
defineUnits({
  cantor: { pose(_g, u) { const r = u.rig; if (r.armR) r.armR.rotation.x = -u.swing * 1.7; } },
  tender: { pose(g, u, _dt, _s, ease) { const r = u.rig, t = g.time, work = u.state === 'mining' || u.state === 'build' || u.state === 'repair'; if (r.armR) r.armR.rotation.x += ((work ? -1.1 + Math.sin(t * 31 + u.id) * .07 : -u.swing * 1.3) - r.armR.rotation.x) * ease; if (r.armL) r.armL.rotation.x += ((work ? -.5 : u.moving ? Math.sin(u.phase) * .3 : 0) - r.armL.rotation.x) * ease; } },
  lancer: { pose(g, u) { const r = u.rig, t = g.time; if (r.arms) r.arms.rotation.x = -u.pitch; if (r.flash) { r.flash.visible = u.wind > 0; const k = u.wind > 0 ? 1.4 - u.wind : 0; r.flash.scale.setScalar(Math.max(.01, k)); r.flash.rotation.z = t * 9; } } },
});

// The first-person view model: the Veyl hand and blade, how it kicks and works.
defineFaction(1, { view(g, pose) { const me = g.me!, vm = g.vm; pose(vm.veyl, 0, g.recoil * (me.kind === 'cantor' ? -.3 : .1) + (me.kind === 'tender' ? (g.lmb && g.tool === 1 ? -.02 + R(-.004, .004) : 0) - g.bashT * .8 : 0), g.vWind > 0 ? -.12 : me.kind === 'tender' && g.tool === 2 ? .12 : 0); } });
