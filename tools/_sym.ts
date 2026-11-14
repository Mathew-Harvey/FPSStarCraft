import { setMap, swapEnd, VHOME, RALLY, VRALLY } from '../src/data';
import * as T from '../src/terrain';
for (const m of [0, 1, 2, 10, 11, 20]) {
  setMap(m); (T as any).layoutTerrain?.(); let bad = 0, n = 0; const ex: string[] = [];
  for (let x = -150; x <= 300; x += 3) for (let z = -250; z <= 250; z += 3) { const [x2, z2] = swapEnd(x, z), a = T.h(x, z), b = T.h(x2, z2); n++; if (Math.abs(a - b) > .5) { bad++; if (ex.length < 6) ex.push(`(${x},${z}) ${a.toFixed(1)} v (${x2.toFixed(0)},${z2.toFixed(0)}) ${b.toFixed(1)}`); } }
  console.log(m, 'VHOME', VHOME.x.toFixed(0), VHOME.z.toFixed(0), 'asym cells', bad, 'of', n, ex.join(' | '), '| rally h', T.h(RALLY.x, RALLY.z).toFixed(1), T.h(VRALLY.x, VRALLY.z).toFixed(1));
}
