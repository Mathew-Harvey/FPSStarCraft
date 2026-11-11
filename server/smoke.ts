import { noHud, noPipe } from './shim';
import { Game } from '../src/game';
import { initHeadless } from '../src/gfx';
initHeadless();
import { DIFFS } from '../src/data';
const g = new Game(noPipe(), noHud, DIFFS[0], 0); g.noRender = true; g.phase = 'play';
const t0 = Date.now(); for (let i = 0; i < 20 * 600; i++) g.update(.05);
console.log('sim 600s in', Date.now() - t0, 'ms', 'units', g.units.length, 'ore', Math.round(g.ore), 'bld', g.ownB().length, 'phase', g.phase, 'me', g.me?.kind);
