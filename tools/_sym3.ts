import { setMap, MAP, VHOME, swapEnd } from '../src/data';
import * as T from '../src/terrain';
for (const m of [0, 1, 2]) { setMap(m); const vs = (MAP as any).vents || [], bs = (T as any).TER?.beacons || [];
  const d = (x: number, z: number) => `${Math.round(Math.hypot(x, z))}/${Math.round(Math.hypot(x - VHOME.x, z - VHOME.z))}`;
  console.log(m, 'vents', vs.map((v: any) => `${d(v.x ?? v.pos?.x ?? v[0], v.z ?? v.pos?.z ?? v[1])}(${v.amount ?? ''})`).join(' '));
  console.log(m, 'beacons', bs.map((b: any) => d(b.x, b.z)).join(' '));
  const sites = MAP.sites || []; console.log(m, 'sites', sites.map((s: any) => d(s[0], s[1])).join(' ')); }
