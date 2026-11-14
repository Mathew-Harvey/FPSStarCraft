// The Veyl art bench: the whole game page plus the new Veyl looks on window.__veyl, so tools/veyl/shots.cjs can stand them in a
import * as THREE from 'three';
// real map under the game's own light. Built by tools/veyl/bench.mjs; never shipped.
import './opaque';
import '../../src/main';
import * as L from '../../src/factions/veyl/look/figures';
(window as any).__veyl = { ...L, THREE };
