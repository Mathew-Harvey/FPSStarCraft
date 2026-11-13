// How Veyl bodies and buildings are drawn: which model each building uses and the lamps the bodies carry. The models themselves are in
// src/models.ts; this file only says which goes with which kind.
import * as MD from '../../../models';
import { defineUnits, defineBuildings } from '../../../core/registry';
import { TEAL, ROSE } from '../../../core/lamps';

defineBuildings({
  choir: { model: a => MD.choir(a) }, reedgate: { model: a => MD.reedgate(a) }, broodpit: { model: a => MD.broodpit(a) },
  thornspire: { model: a => MD.thornspire(a) }, wardpylon: { model: a => MD.wardpylon(a) }, hushwell: { model: a => MD.hushwell(a) },
});
defineUnits({
  tender: { lamp: [1.3, .3, 4.5, TEAL, .6] }, cantor: { lamp: [1.6, .4, 5, TEAL, .7] }, lancer: { lamp: [1.4, .5, 4.5, ROSE, .55] }, warden: { lamp: [3, .8, 8, TEAL, .85] },
});
