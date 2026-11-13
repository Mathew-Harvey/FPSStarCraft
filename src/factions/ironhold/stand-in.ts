// Plain stand-in models for the new Ironhold buildings, the right size and roughly the right shape, so every kind can be built, seen and
// tested before stream E's sculpted building lands. E's look files replace each with a `model` hook (look/ loads after this file).
// New bodies with no figure get the shared plain stand-in (src/core/plain.ts) without anything here.
import * as THREE from 'three';
import { M, G, mk } from '../../gfx';
import { BLD } from '../../data';
import { defineBuildings } from '../../core/registry';
import type { IBKind } from './numbers';

type Part = (g: THREE.Group, hx: number, hz: number, h: number) => void;
const base = (k: IBKind, extra?: Part) => () => {
  const d = BLD[k], g = new THREE.Group();
  mk(G.box, M.conc || M.steelD, [0, .15, 0], [d.hx * 2 + .4, .3, d.hz * 2 + .4], 0, g);
  mk(G.box, M.steelD, [0, d.h * .45 + .3, 0], [d.hx * 2, d.h * .9, d.hz * 2], 0, g);
  mk(G.box, M.haz || M.steelD, [0, d.h * .9 + .3, 0], [d.hx * 2 + .1, .25, d.hz * 2 + .1], 0, g);
  extra?.(g, d.hx, d.hz, d.h); return g;
};
const tower: Part = (g, _hx, _hz, h) => { const gun = new THREE.Group(); gun.position.y = h; g.add(gun); mk(G.box, M.steelD, [0, .3, .5], [.5, .4, 1.6], 0, gun); mk(G.cyl8, M.steelD, [.3, .4, 1.4], [.18, 1.2, .18], [Math.PI / 2, 0, 0], gun); mk(G.cyl8, M.steelD, [-.3, .4, 1.4], [.18, 1.2, .18], [Math.PI / 2, 0, 0], gun); g.userData.gun = gun; };
const jack: Part = (g, _hx, _hz, h) => { mk(G.box, M.steelD, [0, h * .9, 0], [.4, .4, 3.4], [.2, 0, 0], g); mk(G.cyl8, M.steelD, [0, h * .5, 0], [.5, h, .5], 0, g); };
const door: Part = (g, hx, hz, h) => { mk(G.box, M.haz || M.steelD, [0, h * .35, hz + .02], [hx * 1.2, h * .7, .1], 0, g); };
const mast: Part = (g, _hx, _hz, h) => { mk(G.cyl8, M.steelD, [0, h + 2, 0], [.25, 4, .25], 0, g); };
const lowRoof: Part = (g, hx, hz, h) => { mk(G.box, M.rockB || M.steelD, [0, h + .2, 0], [hx * 2.2, .4, hz * 2.2], 0, g); };

defineBuildings({
  pumpjack: { model: base('pumpjack', jack) },
  twinbay: { model: base('twinbay', door) },
  labbay: { model: base('labbay', mast) },
  dugout: { model: base('dugout', lowRoof) },
  flaktower: { model: base('flaktower', tower) },
  hangar: { model: base('hangar', door) },
  annex: { model: base('annex', mast) },
  surveyrig: { model: base('surveyrig', mast) },
  bastion: { model: base('bastion', tower) },
});
