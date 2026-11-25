// Fun audit: one driven body against one bot body, perfect body aim, 14 m apart on open ground. Prints seconds to the kill, shots' worth of
import { DRIVE } from '../../src/command';
// magazines, and the driven body's health left (or that it died).
import { noHud, noPipe } from '../../server/shim';
import { Game } from '../../src/game';
import { initHeadless } from '../../src/gfx';
import { DIFFS, UNIT, setMap, setSides } from '../../src/data';
import { clearMatch } from '../../src/core/sides';
initHeadless();
const o = JSON.parse(process.argv[2] || '{}'); if (o.DRIVE) Object.assign(DRIVE, o.DRIVE);
const MELEE = new Set(['cantor', 'snapper', 'mulcher', 'warden', 'rigger', 'tender', 'grazer']);
const PAIRS: [number, string, number, string][] = o.pairs;
for (const [mf, mk, ff, fk] of PAIRS) {
  let seed = 7; Math.random = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
  setMap(0); const [H, O] = setSides(mf, ff);
  const g = new Game(noPipe(), noHud, DIFFS[1], 0, null, null, true); g.noRender = true; g.evq = []; g.phase = 'play'; (g as any).introT = 0;
  g.human = g.human.map((_, t) => t === H);
  // far from both bases, on the road
  const hx = 62, hz = 7; const d0 = o.dist ?? 14;
  for (const u of g.units) if (u.team === O) { /* keep the far side's workers */ }
  const me = g.spawn(mk as any, H, hx, hz), foe = g.spawn(fk as any, O, hx + d0, hz);
  g.possess(me, true); foe.order = { type: 'guard', x: foe.pos.x, z: foe.pos.z } as any;
  const hp0 = foe.hp + foe.shield, my0 = me.hp + me.shield; let t = 0, res = 'timeout', firstHit = -1, fired = 0, lastAmmo = (g as any).ammo;
  for (let i = 0; i < 30 * 40; i++) {
    g.keys.clear(); g.lmb = false; if ((g as any).phase === 'card') (g as any).phase = 'play';
    if (g.me !== me || !me.alive) { res = 'died'; break; } if (!foe.alive) { res = 'kill'; break; }
    const dx = foe.pos.x - me.pos.x, dz = foe.pos.z - me.pos.z, d = Math.hypot(dx, dz); g.yaw = Math.atan2(dx, dz);
    const ty = foe.pos.y + ((foe as any).alt || 0) + UNIT[foe.kind].bodyY; g.pitch = Math.atan2(ty - (me.pos.y + ((me as any).alt || 0) + UNIT[me.kind].eye), d);
    if (t > (o.wait ?? 0)) { g.lmb = true; g.pressed.add('Mouse0'); } const cl = MELEE.has(mk) ? 1.6 + UNIT[foe.kind].rad : 11; if (d > cl) g.keys.add('KeyW');
    g.update(1 / 30); g.evq!.length = 0; t += 1 / 30;
    if (firstHit < 0 && foe.hp + foe.shield < hp0) firstHit = t;
    const a = (g as any).ammo; if (a < lastAmmo) fired += lastAmmo - a; lastAmmo = a;
  }
  console.log(JSON.stringify({ me: mk, foe: fk, res, t: +t.toFixed(1), firstHit: +firstHit.toFixed(2), foeHp: hp0, foeLeft: Math.round(foe.hp + foe.shield), myHp: my0, myLeft: Math.round(Math.max(0, me.hp) + me.shield), shots: fired }));
  g.dispose?.(); clearMatch();
}
