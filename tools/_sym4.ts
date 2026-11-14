import { noHud, noPipe } from '../server/shim';
import { Game } from '../src/game';
import { initHeadless } from '../src/gfx';
import { DIFFS, setMap, setSides, MAP, VHOME } from '../src/data';
import * as T from '../src/terrain';
initHeadless();
for (const m of [0, 1, 2, 11, 20]) { setMap(m); setSides(0, 0); const g = new Game(noPipe(), noHud, DIFFS[1], m, null, null, true); g.pin();
  const d = (x: number, z: number) => `${Math.round(Math.hypot(x, z))}/${Math.round(Math.hypot(x - VHOME.x, z - VHOME.z))}`;
  console.log(m, 'vents', (g as any).vents.map((v: any) => d(v.pos?.x ?? v.x, v.pos?.z ?? v.z) + ':' + Math.round(v.amount)).join(' '));
  console.log(m, 'beacons', ((T as any).TER.beacons || []).map((b: any) => d(b.x, b.z)).join(' '));
  console.log(m, 'ores', g.ores.map(n => d(n.pos.x, n.pos.z)).sort().join(' ')); }
