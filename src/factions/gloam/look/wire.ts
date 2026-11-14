// The Gloam looks that only the rules know, sent to every screen. The rules keep a body's ability pose (u.act, u.actP), how far a
// body has ripened (u.ripen) and how far a growth has ripened (b.obj.userData.ripen) only where they run: the hidden host of a local
// match, or the match server. A player's own screen, a watcher's and a replay's get them through these looks (src/net-look.ts), so the
// vines and the poses show there too. For show only: nothing here changes the match.
import { defineUnitLook, defineBuildingLook } from '../../../net-look';
import { fac } from '../../../data';
import { ACTS } from './cast2';

/** Every pose name, in a fixed order so a server and a page agree. */
const NAMES = [...new Set(Object.values(ACTS).flat())].sort();
const pct = (k: number) => Math.max(1, Math.min(100, Math.round(k * 100)));

// A pose under way: its name (1 up) times 100, plus how far through it is (0 to 99).
defineUnitLook({ key: 'gact',
  get(_g, u) { const a = u as any; if (fac(u.team) !== 2 || !a.act) return 0; const i = NAMES.indexOf(a.act); return i < 0 ? 0 : (i + 1) * 100 + Math.min(99, Math.floor((a.actP || 0) * 100)); },
  set(_g, u, v) { const a = u as any; if (!v) { if (a.act) { a.act = ''; a.actP = 0; } return; } a.act = NAMES[Math.floor(v / 100) - 1] || ''; a.actP = (v % 100) / 100; } });
// A body ripening into its next form, 1 to 100.
defineUnitLook({ key: 'gripen',
  get(_g, u) { const k = (u as any).ripen; return fac(u.team) === 2 && k > 0 ? pct(k) : 0; },
  set(_g, u, v) { const a = u as any; if (v) a.ripen = v / 100; else if (a.ripen) a.ripen = 0; } });
// A growth ripening into its next kind, 1 to 100.
defineBuildingLook({ key: 'gripen',
  get(_g, b) { const k = b.obj?.userData.ripen; return fac(b.team) === 2 && k > 0 && k < 1 ? pct(k) : 0; },
  set(_g, b, v) { const d = b.obj?.userData; if (!d) return; if (v) d.ripen = v / 100; else if (d.ripen) d.ripen = 0; } });
