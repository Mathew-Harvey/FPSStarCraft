// The Veyl art bench: the whole game page plus the new Veyl looks on window.__veyl, so tools/veyl/shots.cjs can stand them in a
// real map under the game's own light. Built by tools/veyl/bench.mjs; never shipped.
import './opaque';
import '../../src/main';
import * as L from '../../src/look-veyl';
(window as any).__veyl = L;
