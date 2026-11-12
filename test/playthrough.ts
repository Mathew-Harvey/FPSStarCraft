// Plays every story job through to its end, headless, the way a player would: buildings are staked with `place` on spots the
// build rules allow, units come out of the buildings that train them, upgrades are bought, the player's body walks where the job
// says. Fights are not simulated: whatever the player has to break or see off is knocked down directly, and the player's own
// buildings are kept standing. So this checks the jobs' bookkeeping, not their difficulty: every objective must be picked up
// from what the player did, in order, and the job must end as a win. Run: node tools/run-ts.mjs test/playthrough.ts [job numbers...]
import { noHud, noPipe } from '../server/shim';
import { Game } from '../src/game';
import { initHeadless } from '../src/gfx';
import { BLD, DIFFS, FACTION, MAP, ROAD, SIDE, STORY, TRAINS, UNIT, UPGRADES, foeOf, roadPt, setMap, setSides } from '../src/data';
import type { BKind, Kind, Unit, UpKey } from '../src/data';
import { MISSIONS, missionSides, charterTeam, Mission } from '../src/campaign';

initHeadless();
const only = process.argv.slice(2).map(Number);
let seed = 11; Math.random = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
const fails: string[] = []; const check = (ok: boolean, what: string) => { console.log((ok ? 'PASS ' : 'FAIL ') + what); if (!ok) fails.push(what); };
const T = 1 / 20;

class Play {
  g: Game; me: number; foe: number; log: string[] = []; ticked: number[] = [];
  constructor(public m: Mission) {
    setMap(m.map); setSides(...missionSides(m)); STORY.charter = charterTeam(m);
    const g = this.g = new Game(noPipe(), noHud, DIFFS[m.diff], m.map, m, null, m.out); g.noRender = true; g.evq = []; g.phase = 'play';
    this.me = m.out ? SIDE.out : SIDE.home; this.foe = foeOf(this.me); g.human = g.human.map((_, t) => t === this.me);
    if (m.out) { g.me = null; for (const u of g.units) u.pilot = 0; const b = g.units.find(u => u.alive && u.team === this.me); if (b) b.pilot = 1; }
  }
  get body(): Unit | null { const g = this.g; return g.me && g.me.alive ? g.me : g.units.find(u => u.alive && u.pilot > 0) || null; }
  /** Runs the match. The player's buildings are kept standing; `keep` also keeps the player's units alive. */
  run(secs: number, until?: () => boolean, keep = false) {
    const g = this.g; for (let k = 0; k < secs / T; k++) {
      if (g.phase === 'card') g.phase = 'play'; if (g.phase !== 'play' || g.endT > 0) return true;
      for (const b of g.buildings) if (b.alive && b.team === this.me) b.hp = b.maxHp;
      if (keep) for (const u of g.units) if (u.alive && u.team === this.me) { u.hp = u.maxHp; u.shield = u.maxShield; }
      g.update(T); this.note(); if (until && until()) return true;
    }
    return !!until && until();
  }
  /** Records the order the objectives were ticked in. */
  note() { const g = this.g; this.m.objectives.forEach((o, i) => { if (!this.ticked.includes(i) && g.ms['_o' + i]) this.ticked.push(i); }); }
  cash(n: number) { this.g.purse[this.me] = (this.g.purse[this.me] || 0) + n; }
  hq() { const g = this.g, k = FACTION[this.me].hq; return g.ownB(k, true, this.me)[0] || g.ownB(k, false, this.me)[0]; }
  /** Stakes a building on the nearest spot the build rules allow, around a point (the player's base by default), and finishes it. */
  build(k: BKind, at?: [number, number], r0 = 10, r1 = 60): boolean {
    const g = this.g; for (const n of g.missing(k, this.me)) if (!this.build(n)) return false;
    const h = this.hq(), [cx, cz] = at || (h ? [h.pos.x, h.pos.z] : [0, 0]);
    for (let r = r0; r <= r1; r += 3) for (let a = 0; a < 6.28; a += .35) {
      const x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r;
      if (!g.unlocked(k, this.me) || !g.canPlace(k, x, z, false, this.me)) continue;
      this.cash(BLD[k].cost); const by = g.units.find(u => u.alive && u.team === this.me && (u.kind === 'grazer' || u.kind === 'rigger' || u.kind === 'tender')) || null;
      const b = g.place(k, x, z, false, this.me, by); if (!b) continue; b.progress = 1; this.run(1); return true;
    }
    this.log.push(`could not stake a ${k}`); return false;
  }
  /** Trains n of a unit at the building that makes it, as many rounds as it takes. */
  train(k: Kind, n: number) {
    const g = this.g, at = (Object.keys(TRAINS) as BKind[]).filter(b => TRAINS[b]!.includes(k));
    for (let tries = 0; tries < 40 && g.own(k, this.me).length < n; tries++) {
      for (const b of g.buildings.filter(b => b.alive && b.built && b.team === this.me && at.includes(b.kind))) { this.cash(UNIT[k].cost * 2); g.train(b, k); }
      this.run(8, () => g.own(k, this.me).length >= n);
    }
    if (g.own(k, this.me).length < n) this.log.push(`could not train ${n} ${k} (${g.own(k, this.me).length})`);
  }
  up(key: UpKey) { const u = UPGRADES.find(x => x.key === key)!; this.cash(u.cost); if (!this.g.buyUpgrade(key, this.me)) this.log.push(`could not buy ${key}`); }
  walk(x: number, z: number) { const b = this.body; if (b) { b.pos.x = x; b.pos.z = z; } }
  jump(k: Kind) { const g = this.g, u = g.units.find(u => u.alive && u.team === this.me && u.kind === k); if (!u) { this.log.push(`no ${k} to jump into`); return; }
    if (this.m.out) { for (const x of g.units) x.pilot = 0; u.pilot = 1; } else { g.jumpCd = 0; g.possess(u); g.phase = 'play'; } }
  /** Knocks down whatever matches, the stand-in for winning the fight. */
  kill(f: (u: Unit) => boolean) { for (const u of this.g.units) if (u.alive && u.team !== this.me && f(u)) this.g.damage(u, 1e7, null); }
  raze(k: BKind, team = this.foe) { for (const b of this.g.buildings) if (b.alive && b.team === team && b.kind === k) this.g.damage(b, 1e7, null); }
  prop(name: string, f: (p: any) => boolean = () => true) { for (const q of this.g.props) if (q.alive && q.name === name && f(q)) this.g.damageProp(q, 1e7, null); }
  raiders() { return this.g.units.filter(u => u.alive && u.team !== this.me && u.order.type === 'raid'); }
  /** Sees off attacks for a while: anything marching on the player is knocked down as it comes. */
  defend(secs: number, until?: () => boolean, keep = true) { return this.run(secs, () => { this.kill(u => u.order.type === 'raid'); return !!until && until(); }, keep); }
  done(i: number) { return !!this.g.ms['_o' + i]; }
}

const near = (p: Play, c: [number, number]) => { const b = p.body; return !!b && Math.hypot(b.pos.x - c[0], b.pos.z - c[1]) < 55; };
/** What a player does on each job, as one script per job. */
const SCRIPTS: Record<string, (p: Play) => void> = {
  'Job 1': p => { const g = p.g; g.obj.drilled = 40; p.run(200, () => g.stats.mined >= 250); p.run(3); p.jump('linesman'); p.run(16, () => !!g.ms.sent); p.defend(30, () => g.ms.probe === 2); },
  'Job 2': p => { const g = p.g; p.build('bunkhouse'); p.build('depot'); p.train('linesman', 4); p.defend(400, () => (g.ms.cleared || 0) >= 3); },
  'Job 3': p => { const g = p.g; p.build('machineshop'); p.up('dmg'); p.train('linesman', 8);
    p.run(400, () => { const pl = g.dir.side(p.me).plan; if (pl && pl.phase === 'ask') g.dir.playerOrders(new Set(['KeyZ']), g.cam.position, g.cam.position, 0); return g.obj.answered; });
    p.raze('reedgate'); p.defend(10); },
  'Job 4': p => { const g = p.g, st = MAP.sites!; const far = st.map(s => s).sort((a, b) => Math.hypot(b[0], b[1]) - Math.hypot(a[0], a[1])).find(s => Math.hypot(s[0], s[1]) > 40 && Math.hypot(s[0] - MAP.out[0], s[1] - MAP.out[1]) > 70) || st[1];
    p.build('headframe', far as [number, number], 8, 30); const h = g.ownB('headframe', true, 0).find(b => Math.hypot(b.pos.x, b.pos.z) > 30); if (h) p.build('watchpost', [h.pos.x, h.pos.z], 8, 24); p.up('drill'); p.defend(320, () => p.done(3)); },
  'Job 5': p => { const g = p.g; p.build('assay'); p.train('longshot', 2); const st = MAP.sites![1] || MAP.sites![0]; p.kill(u => Math.hypot(u.pos.x - st[0], u.pos.z - st[1]) < 30);
    p.jump('rigger'); const r = () => { p.walk(st[0] + 3, st[1] + 3); return false; }; p.run(22, () => { r(); return p.done(2); }, true); p.walk(4, 6); p.run(3, () => p.done(3)); },
  'Job 6': p => { const g = p.g; p.build('machineshop'); p.build('foundry'); p.train('gantry', 1); p.run(3);
    p.prop('Needle\'s Eye', q => q.y0 === 0); p.run(6); if (g.props.some(q => q.alive && q.name === 'Needle\'s Eye' && q.y0 > 0)) { p.log.push('the arch top stayed up after its legs were shot out'); p.prop('Needle\'s Eye'); }
    const pit = g.pits()[0]; if (pit) g.damage(pit, 1e7, null); p.defend(10); },
  'Job 7': p => { const g = p.g; p.build('mast'); for (const s of MAP.sites!.slice(1)) if (g.ownB('headframe', true, 0).length < 3) p.build('headframe', s as [number, number], 8, 30); p.defend(500, () => p.done(2)); },
  'Job 8': p => { const g = p.g; p.raze('wardpylon'); p.raze('broodpit'); p.raze('reedgate'); p.run(2); p.raze('choir'); p.run(3); check(!!g.ms.erupt, 'job 8: the canyon opens when the last Stone breaks'); p.defend(100, () => g.endT > 0); },
  'Job 9': p => { const g = p.g; p.run(400, () => p.done(0)); p.run(300, () => p.done(1)); p.build('hushwell'); p.build('hushwell'); p.train('tender', 8); p.run(5); p.defend(60, () => g.ms.wave === 2); },
  'Job 10': p => { p.build('broodpit'); p.build('thornspire'); p.build('thornspire'); p.build('hushwell'); p.train('cantor', 3); p.train('lancer', 3); p.run(2); p.raze('sporesac', SIDE.home); p.raze('stinger', SIDE.home); p.raze('warren', SIDE.home); p.defend(10); },
  'Job 11': p => { const g = p.g, st = MAP.sites!; const far = st.filter(s => Math.hypot(s[0] - MAP.out[0], s[1] - MAP.out[1]) > 60).sort((a, b) => Math.hypot(a[0] - MAP.out[0], a[1] - MAP.out[1]) - Math.hypot(b[0] - MAP.out[0], b[1] - MAP.out[1]));
    for (const s of far) { if (g.ownB('choir', true, p.me).length >= 2) break; p.build('choir', s as [number, number], 6, 30); } p.raze('sporesac', SIDE.home); p.raze('stinger', SIDE.home); p.raze('warren', SIDE.home); p.kill(() => true); p.defend(10); },
  'Job 12': p => { const g = p.g; p.build('wardpylon'); p.up('vedge'); p.defend(600, () => (g.ms.done || 0) >= 3); },
  'Job 13': p => { const g = p.g; p.build('broodpit'); p.build('reedgate'); p.build('hushwell'); p.train('warden', 1); const c = roadPt(ROAD.len * .52, 34);
    p.run(500, () => { for (const u of g.own('warden', p.me)) { u.pos.x = c[0]; u.pos.z = c[1]; u.order = { type: 'guard', x: c[0], z: c[1] }; } p.kill(u => u.order.type === 'raid'); return p.done(2); }, true); },
  'Job 14': p => { const g = p.g; p.run(3); p.walk(ROAD.x, ROAD.z); p.run(2); p.walk(3, 8); p.run(40, () => g.endT > 0); },
  'Job 15': p => { const g = p.g; const c = roadPt(ROAD.len * .52, 34), spots = [-30, 0, 30].map(k => roadPt(ROAD.len * .52 + k, 34 + (k ? -14 : 16))); for (const s of spots) p.build('choir', s as [number, number], 0, 14);
    p.defend(30, () => false); check((g.ms.hold || 0) < 1 || near(p, c), 'job 15: the verse only counts while the player stands between the Stones');
    p.run(260, () => { p.walk(c[0], c[1]); p.kill(u => u.order.type === 'raid'); return !!g.ms.turn; }, true); check(g.ms.turn === 1 && !p.done(2), 'job 15: after three minutes Held Fifth says where the glass stops, and the job waits for the player');
    p.run(8, () => { p.walk(c[0], c[1]); return false; }, true); check(g.endT <= 0 && !g.ms.out, 'job 15: staying between the Stones does not end the job'); const n = g.ownB('choir', false, p.me).length;
    p.run(6, () => { p.walk(c[0] + 80, c[1]); return !!g.ms.out; }, true); check(g.ms.out === 1 && g.ownB('choir', false, p.me).length === n - 1, 'job 15: walking out stops the verse and the Gloam takes the nearest Stone'); },
  'Job 16': p => { const g = p.g; p.run(400, () => p.done(0)); p.build('sporesac'); const cap = g.ownB('mothercap', true, p.me)[0]; p.cash(200); for (let i = 0; i < 3; i++) g.train(cap, 'grazer'); p.run(40, () => p.done(2));
    p.cash(400); p.train('grazer', 8); const fields = MAP.sites!.filter(s => Math.hypot(s[0] - cap.pos.x, s[1] - cap.pos.z) > 40).sort((a, b) => Math.hypot(a[0] - cap.pos.x, a[1] - cap.pos.z) - Math.hypot(b[0] - cap.pos.x, b[1] - cap.pos.z));
    for (const s of fields) { if (g.ownB('mothercap', true, p.me).length >= 2) break; p.build('mothercap', s as [number, number], 6, 30); } p.run(5); },
  'Job 17': p => { const g = p.g; p.cash(300); p.train('grazer', 8); p.build('warren'); p.up('gtongue'); p.run(2); p.kill(u => u.order.type === 'guard'); p.run(5); },
  'Job 18': p => { p.cash(400); p.train('grazer', 10); p.build('warren'); p.build('quillgarden'); p.build('blisterbed'); p.raze('wardpylon'); p.run(2); p.raze('choir'); p.run(5); },
  'Job 19': p => { const g = p.g; p.cash(400); p.train('grazer', 10); p.build('warren'); p.build('tuskhollow'); p.train('mulcher', 1); p.prop('Glass wall'); p.run(2);
    const mu = g.own('mulcher', p.me)[0]; if (mu) { mu.pos.x = -36; mu.pos.z = -4; } p.run(5, () => g.endT > 0, true); },
  'Job 20': p => { const g = p.g; p.prop('Drill tower'); p.run(2); const [tx, tz] = roadPt(ROAD.len * .3, -30); p.cash(300); p.train('grazer', 8); p.build('mothercap', [tx, tz], 6, 33); p.run(5); },
  'Job 21': p => { p.build('machineshop'); p.build('foundry'); p.raze('headframe'); p.run(5); },
  'Job 22': p => { const g = p.g; p.jump('warden'); p.run(2); p.defend(500, () => (g.ms.done || 0) >= 3); p.prop('Needle\'s Eye', q => q.y0 === 0); p.run(6); if (g.props.some(q => q.alive && q.name === 'Needle\'s Eye' && q.y0 > 0)) { p.log.push('the arch top stayed up after its legs were shot out'); p.prop('Needle\'s Eye'); } p.run(5); },
  'Job 23': p => { p.prop('Deep Charge rig'); p.run(5); },
  'Job 24': p => { const g = p.g, h = (g as any)._first; if (h) g.damage(h, 1e7, null); p.run(5); },
  'Moss\'s Book': p => { p.raze('choir'); p.run(5); },
  'Discord': p => { p.raze('choir'); p.run(5); },
  'Rot': p => { p.raze('mothercap'); p.run(5); },
};

MISSIONS.forEach((m, i) => {
  const key = m.tag === 'Side job' ? m.name : m.tag; if (only.length && !only.includes(i + 1)) return;
  const label = `${m.tag} ${m.name}`;
  try {
    const p = new Play(m); p.run(1); SCRIPTS[key](p); p.run(6, () => p.g.phase === 'over');
    const g = p.g, won = g.phase === 'over' ? g.won : g.endT > 0 && g.endWon, open = m.objectives.map((o, j) => o.done(g) ? '' : o.text(g)).filter(Boolean);
    const inOrder = p.ticked.every((v, j) => j === 0 || v > p.ticked[j - 1]);
    console.log(`  ${label}: t=${Math.round(g.time)}s ticked ${p.ticked.join(',')}${p.log.length ? ' · ' + p.log.join('; ') : ''}${open.length ? ' · open: ' + open.join(' | ') : ''}`);
    check(won && !p.log.length, `${label}: played through to a win`);
    if (won && !inOrder) console.log(`  (note: ${label} ticked its objectives out of order)`);
  } catch (e: any) { check(false, `${label}: ran without throwing (${String(e && e.stack || e).split('\n').slice(0, 4).join(' / ')})`); }
});
console.log(fails.length ? `\n${fails.length} failed` : '\nall passed');
process.exit(fails.length ? 1 : 0);
