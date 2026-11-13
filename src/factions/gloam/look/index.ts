// How Gloam bodies and buildings are drawn: every Gloam building is grown by models.gloamB, and the lamps the bodies carry.
// The figures themselves are in art.ts.
import * as MD from '../../../models';
import { defineUnits, defineBuildings, defineFaction } from '../../../core/registry';
import { SICK } from '../../../core/lamps';
import { G_TUNE, type GBKind } from '../numbers';

defineBuildings(Object.fromEntries(Object.keys(G_TUNE.bloomR).map(k => [k, { model: (a: ((t: number) => void)[]) => MD.gloamB(k as GBKind, a) }])));
defineUnits({ blister: { lamp: [.9, 0, 5, SICK, .7] }, mulcher: { lamp: [3.4, 0, 7, SICK, .5] } });
// A Blister swells and shrinks as it breathes, and puffs up a little more with a target in sight.
defineUnits({ blister: { pose(g, u, _dt, _s, _ease, sc) { const k = 1 + Math.sin(g.time * 7 + u.id) * .04 + (u.target ? .05 : 0); u.obj.scale.set(sc * k, sc * k, sc * k); } } });

// The first-person view model: the jaws, how they open and lunge.
defineFaction(2, { view(g, pose) { const me = g.me!, vm = g.vm; if (!vm['g_' + me.kind]) return; const v = vm['g_' + me.kind], j = Math.max(g.jaw, g.vWind > 0 && me.kind !== 'snapper' ? .6 : 0), L = v.userData.L, Rr = v.userData.R; pose(v, 0, g.recoil * .05 - g.bashT * .6 + (g.chargeT > 0 ? -.08 : 0), g.tool === 2 && me.kind === 'grazer' ? .12 : g.vWind > 0 && me.kind === 'mulcher' ? -.1 : 0); if (L) L.rotation.y = .35 - j * .55; if (Rr) Rr.rotation.y = -.35 + j * .55; } });
// The Mulcher breathes slowly and falls like a felled beast; a Blister always bursts.
defineUnits({ mulcher: { stance: { breath: 1.3, bulk: true } }, blister: { stance: { burst: true } } });
