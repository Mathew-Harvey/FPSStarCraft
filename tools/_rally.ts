import { setMap, RALLY, VRALLY, RALLY_N, VRALLY_N, VHOME, NORTH_PATH, swapEnd } from '../src/data';
for (const m of [0, 1, 2, 10, 11, 12, 20, 21, 22, 30, 31, 32]) {
  setMap(m); const d = (p: any, h: number[]) => Math.round(Math.hypot(p.x - h[0], p.z - h[1]));
  const mir = swapEnd(RALLY.x, RALLY.z), mirN = swapEnd(RALLY_N.x, RALLY_N.z);
  console.log(m, 'VHOME', Math.round(VHOME.x), Math.round(VHOME.z), '| yard rally', d(RALLY, [0, 0]), 'far rally', d(VRALLY, [VHOME.x, VHOME.z]), 'far rally off mirror', Math.round(Math.hypot(VRALLY.x - mir[0], VRALLY.z - mir[1])), '| north: yard', d(RALLY_N, [0, 0]), 'far', d(VRALLY_N, [VHOME.x, VHOME.z]), 'off mirror', Math.round(Math.hypot(VRALLY_N.x - mirN[0], VRALLY_N.z - mirN[1])));
}
