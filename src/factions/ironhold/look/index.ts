// How Ironhold bodies and buildings are drawn: which model each building uses and the lamps they carry. The models themselves are in
// src/models.ts; this file only says which goes with which kind.
import * as MD from '../../../models';
import { defineUnits, defineBuildings } from '../../../core/registry';
import { WARM, HEAD } from '../../../core/lamps';

defineBuildings({
  headframe: { model: a => MD.headframe(a) }, bunkhouse: { model: () => MD.bunkhouse() }, watchpost: { model: () => MD.watchpost() },
  depot: { model: () => MD.depot(), lamps: [[3.42, 1.7, 1.5, 11]] }, machineshop: { model: a => MD.machineshop(a), lamps: [[-3.2, 2.2, 3.5, 11], [-.6, 2.4, 2.8, 8]] },
  foundry: { model: a => MD.foundry(a) }, assay: { model: a => MD.assay(a), lamps: [[-1.6, 2.1, 3.2, 11]] }, mast: { model: a => MD.mast(a) },
});
defineUnits({
  rigger: { lamp: [1.5, .5, 4.5, WARM, .6] }, linesman: { lamp: [1.6, 1.2, 4, HEAD, .45] }, patch: { lamp: [1.6, 1.2, 4, HEAD, .45] }, breacher: { lamp: [1.6, 1.2, 4, HEAD, .45] }, gantry: { lamp: [3, 2.4, 8, HEAD, .7] },
});
