// How the Veyl rules show on screen, using stream F's look files: a building outside every song field is drawn silent (grey ash and a broken
// ring over the roof), here from the rules and on every online screen from the snapshot. Nothing here changes the match.
import type { Game } from '../../game';
import { fac, type Building } from '../../data';
import { defineBuildingLook } from '../../net-look';
import { silentLook } from './look/figures';

const quiet = (g: Game, b: Building) => b.alive && b.built && fac(b.team) === 1 && g.rate(b) === 0;
/** Where the rules run: draws a Veyl building silent or sung, each frame (silentLook only changes anything on a change). */
export function showSilent(g: Game, b: Building) { if (g.noRender || g.evq || !b.obj) return; silentLook(b.obj, quiet(g, b), b.h); }
// online: the host sends 1 for a silent Veyl building, and each screen draws it
defineBuildingLook({ key: 'vsilent', get: (g, b) => (quiet(g, b) ? 1 : 0), set(g, b, v) { if (fac(b.team) === 1 && b.obj && !g.noRender) silentLook(b.obj, v === 1, b.h); } });
