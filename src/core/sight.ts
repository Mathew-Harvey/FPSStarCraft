// Unseen bodies and detection. A body is hidden when its kind is always cloaked (UnitDef.cloak) or an effect hides it (unseen, dug in).
// The enemy cannot aim at, shoot or even receive a hidden body (the server leaves it out of that side's snapshot) unless one of their
// detectors is in range or the body is revealed. Its own side sees it as a shimmer.
import type { Game } from '../game';
import type { Unit, Building } from '../data';
import { UNIT, BLD, isUnit } from '../data';
import { hiddenBy, hasStatus } from './status';
import { isEnemy } from './sides';
import { bldRule } from './registry';

/** Is the body hidden from enemy eyes before detection counts? */
export const isHidden = (u: Unit) => (!!UNIT[u.kind].cloak && !hasStatus(u, 'revealed')) || hiddenBy(u);

/** Does this side see this body? Its own and its allies' always; anything not hidden always; a hidden one only inside a detector's range. */
export function seenBy(g: Game, team: number, t: Unit | Building): boolean {
  if (!isUnit(t) || !isEnemy(team, t.team) || !isHidden(t)) return true;
  for (const o of g.units) { if (!o.alive || isEnemy(team, o.team)) continue; const r = UNIT[o.kind].detect; if (r && Math.hypot(o.pos.x - t.pos.x, o.pos.z - t.pos.z) <= r) return true; }
  for (const b of g.buildings) { if (!b.alive || !b.built || isEnemy(team, b.team)) continue; const r = Math.max(BLD[b.kind].detect || 0, bldRule(b.kind).detect?.(g, b) || 0); if (r && Math.hypot(b.pos.x - t.pos.x, b.pos.z - t.pos.z) <= r) return true; }
  return false;
}

/** How a body is drawn for the player's side: 1 solid, a shimmer (about .3) for a hidden friend or a detected foe, 0 not drawn at all. */
export function shimmerOf(g: Game, u: Unit): number {
  if (!isHidden(u)) return 1; if (!isEnemy(g.myTeam, u.team)) return .3; return seenBy(g, g.myTeam, u) ? .45 : 0;
}

/** Draws hidden bodies as the player's side sees them, each frame. The art stream can swap this for a proper glass shader. */
export function drawShimmer(g: Game) {
  for (const u of g.units) {
    if (!u.alive) continue; const s = UNIT[u.kind].cloak || u.status?.length ? shimmerOf(g, u) : 1, was = u.obj.userData.shim ?? 1;
    if (s === was) continue; u.obj.userData.shim = s; u.obj.visible = s > 0 && !u.inside;
    u.obj.traverse((o: any) => { const m = o.material; if (!o.isMesh || !m || Array.isArray(m)) return; if (!o.userData.mat0) o.userData.mat0 = m; if (s >= 1) o.material = o.userData.mat0; else { const c = o.userData.mat0.clone(); c.transparent = true; c.opacity = s; c.depthWrite = false; o.material = c; } });
  }
}
