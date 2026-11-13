// How Gloam bodies and buildings are drawn: every Gloam building is grown by models.gloamB, and the lamps the bodies carry.
// The figures themselves are in art.ts.
import * as MD from '../../../models';
import { defineUnits, defineBuildings } from '../../../core/registry';
import { SICK } from '../../../core/lamps';
import { G_TUNE, type GBKind } from '../numbers';

defineBuildings(Object.fromEntries(Object.keys(G_TUNE.bloomR).map(k => [k, { model: (a: ((t: number) => void)[]) => MD.gloamB(k as GBKind, a) }])));
defineUnits({ blister: { lamp: [.9, 0, 5, SICK, .7] }, mulcher: { lamp: [3.4, 0, 7, SICK, .5] } });
