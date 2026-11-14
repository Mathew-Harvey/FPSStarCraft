// A hidden body (src/core/sight.ts) drawn in the glass shimmer of the effect kit instead of a faded copy of its paint, which the toon
// shader ignores: a hidden friend, or a hidden foe a detector has found, shows as a bright-edged ripple; plain again once it is out.
import type * as THREE from 'three';
import { SHIM } from '../core/sight';
import { veil } from './kit';

SHIM.apply = (obj, s) => {
  const o = obj as unknown as THREE.Object3D, U = o.userData;
  if (s < 1 && !U.shimOff) U.shimOff = veil(o, true);
  else if (s >= 1 && U.shimOff) { U.shimOff(); U.shimOff = null; }
};
