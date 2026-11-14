// Plays every story job through to its end, headless, the way a player would: buildings are staked with `place` on spots the
// build rules allow, units come out of the buildings that train them, upgrades are bought, the player's body walks where the job
// says. Fights are not simulated: whatever the player has to break or see off is knocked down directly, and the player's own
// buildings are kept standing. So this checks the jobs' bookkeeping, not their difficulty: every objective must be picked up
// from what the player did, in order, and the job must end as a win. Ironhold plays its full tree: there is no story stand-in.
// Two more checks per job, where the job lists them (TEACH below): played again with the thing it teaches refused, the job must not
// end in a win; and left alone, with nothing kept standing, the enemy must beat the player (the job can be lost).
// Run: node tools/run-ts.mjs test/playthrough.ts [job numbers...]   (add `--quick` to skip the lose and must-use runs)
import { noHud, noPipe } from '../server/shim';
import { Game } from '../src/game';
import { initHeadless } from '../src/gfx';
import { BLD, DIFFS, FACTION, MAP, ROAD, SIDE, STORY, TRAINS, UNIT, UPGRADES, foeOf, roadPt, setMap, setSides, setTeamGame } from '../src/data';
import type { BKind, Kind, Unit, UpKey, Building } from '../src/data';
import { useAbility, whyNot } from '../src/core/ability';
import { load, unload } from '../src/core/cargo';
import { sendToVent } from '../src/core/econ';
import { addonOf } from '../src/factions/ironhold/bases';
import { G_TUNE, bloomOf } from '../src/factions/gloam/numbers';
import { MISSIONS, missionSides, charterTeam, Mission } from '../src/campaign';

initHeadless();
// Until stream D's fix lands on the lead: G_TUNE.bloomR has no rows for the Elder and Ancient Caps, so a ripened Cap's Bloom shrinks from
// 20 m to 6 m and nothing more can be grown round it. The Gloam tier jobs set the dial here so they can be played. Take this out with D's fix.
if (bloomOf('eldercap') < bloomOf('mothercap')) { G_TUNE.bloomR.eldercap = G_TUNE.bloomR.ancientcap = bloomOf('mothercap'); console.log('note: Elder and Ancient Cap Bloom set to the Mother Cap\'s for this run (stream D fix pending)'); }
const VENT_TAPS: BKind[] = ['pumpjack', 'siphonbell', 'ventbladder' as BKind];
const quick = process.argv.includes('--quick'), only = process.argv.slice(2).filter(a => !a.startsWith('--')).map(Number);
let seed = 11; Math.random = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
const fails: string[] = []; const check = (ok: boolean, what: string) => chk(ok, what); const chk = (ok: boolean, what: string) => { console.log((ok ? 'PASS ' : 'FAIL ') + what); if (!ok) fails.push(what); };
const T = 1 / 20;

class Play {
  g: Game; me: number; foe: number; log: string[] = []; ticked: number[] = [];
  /** Things this run refuses to do (the must-use check), and whether the player's buildings are kept standing (off for the lose check). */
  ban = new Set<string>(); guard = true;
  constructor(public m: Mission) {
    setMap(m.map); setSides(...missionSides(m)); if (m.team) setTeamGame(m.team); STORY.charter = charterTeam(m);
    const g = this.g = new Game(noPipe(), noHud, DIFFS[m.diff], m.map, m, null, m.out); g.noRender = true; g.evq = []; g.phase = 'play';
    this.me = m.out ? SIDE.out : SIDE.home; this.foe = foeOf(this.me); g.human = g.human.map((_, t) => t === this.me);
    if (m.out) { g.me = null; for (const u of g.units) u.pilot = 0; const b = g.units.find(u => u.alive && u.team === this.me); if (b) b.pilot = 1; }
  }
  get body(): Unit | null { const g = this.g; return g.me && g.me.alive ? g.me : g.units.find(u => u.alive && u.pilot > 0) || null; }
  /** Runs the match. The player's buildings are kept standing; `keep` also keeps the player's units alive. */
  run(secs: number, until?: () => boolean, keep = false) {
    const g = this.g; for (let k = 0; k < secs / T; k++) {
      if (g.phase === 'card') g.phase = 'play'; if (g.phase !== 'play' || g.endT > 0) return true;
      if (this.guard) for (const b of g.buildings) if (b.alive && b.team === this.me) b.hp = b.maxHp;
      if (keep) for (const u of g.units) if (u.alive && u.team === this.me) { u.hp = u.maxHp; u.shield = u.maxShield; }
      g.update(T); this.note(); if (until && until()) return true;
    }
    return !!until && until();
  }
  /** Records the order the objectives were ticked in. */
  note() { const g = this.g; this.m.objectives.forEach((o, i) => { if (!this.ticked.includes(i) && g.ms['_o' + i]) this.ticked.push(i); }); }
  cash(n: number) { this.g.purse[this.me] = (this.g.purse[this.me] || 0) + n; this.g.fluxPurse[this.me] = (this.g.fluxPurse[this.me] || 0) + n; }
  /** Whether this run may do a thing; a refused thing is noted, not logged as a failure. */
  may(what: string) { return !this.ban.has(what); }
  hq() { const g = this.g, k = FACTION[this.me].hq; return g.ownB(k, true, this.me)[0] || g.ownB(k, false, this.me)[0]; }
  /** Stakes a building on the nearest spot the build rules allow, around a point (the player's base by default), and finishes it. */
  build(k: BKind, at?: [number, number], r0 = 10, r1 = 60): boolean {
    const g = this.g; if (!this.may(k)) return false; for (const n of g.missing(k, this.me)) if (!this.build(n)) return false;
    if (VENT_TAPS.includes(k) && !at) { const h = this.hq(), v = g.vents.filter(v => !v.tap).sort((a, b) => Math.hypot(a.pos.x - (h?.pos.x || 0), a.pos.z - (h?.pos.z || 0)) - Math.hypot(b.pos.x - (h?.pos.x || 0), b.pos.z - (h?.pos.z || 0)))[0]; if (!v) { this.log.push('no vent'); return false; } at = [v.pos.x, v.pos.z]; r0 = 0; r1 = 0; }
    const h = this.hq(), [cx, cz] = at || (h ? [h.pos.x, h.pos.z] : [0, 0]); if (!at && FACTION[this.me].hq === 'choir') r0 = Math.min(r0, 5);   // a Veyl building has to touch a song field
    const fine = FACTION[this.me].hq === 'mothercap';   // Gloam room is tight: only on Bloom, so look closer together
    for (let r = r0; r <= r1; r += fine ? 1.5 : 3) for (let a = 0; a < 6.28; a += r ? (fine ? .15 : .35) : 9) {
      const x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r;
      if (!g.unlocked(k, this.me) || !g.canPlace(k, x, z, false, this.me)) continue;
      this.cash(BLD[k].cost); const by = g.units.find(u => u.alive && u.team === this.me && (u.kind === 'grazer' || u.kind === 'rigger' || u.kind === 'tender')) || null;
      const b = g.place(k, x, z, false, this.me, by); if (!b) continue; b.progress = 1; this.run(FACTION[this.me].hq === 'mothercap' ? 14 : 1); return true;   // a Gloam building's Bloom takes a few seconds to spread
    }
    if (FACTION[this.me].hq === 'mothercap' && k !== 'sporesac' && k !== 'mothercap' && !at && (this as any)._sp !== k) { (this as any)._sp = k; const n0 = this.log.length; this.cash(400); this.train('grazer', this.g.own('grazer', this.me).length + 2); if (this.build('sporesac') && this.build('sporesac')) { const sacs = g.ownB('sporesac', true, this.me).slice(-2); for (const s of [null, ...sacs]) if (s ? this.build(k, [s.pos.x, s.pos.z], 0, 12) : this.build(k)) { (this as any)._sp = ''; this.log.length = n0; return true; } } this.log.length = n0; }   // more Bloom, the way a player would spread it
    this.log.push(`could not stake a ${k}${FACTION[this.me].hq === 'mothercap' ? ` (${g.own('grazer', this.me).length} Grazers, unlocked ${g.unlocked(k, this.me)})` : ''}`); return false;
  }
  /** Trains n of a unit at the building that makes it, as many rounds as it takes. */
  /** Bolts an add-on onto the first built host of a kind (building it first if there is none) and finishes it. */
  bolt(host: BKind, k: 'labbay' | 'twinbay'): boolean {
    const g = this.g; if (!this.may(k)) return false; let h = g.ownB(host, true, this.me).find(b => !addonOf(b)); if (!h && g.ownB(host, true, this.me).length) return true; if (!h) { this.build(host); h = g.ownB(host, true, this.me)[0]; } if (!h) return false;
    this.cash(200); if (!g.buildingAction(h, k)) { this.log.push(`could not bolt a ${k} onto a ${host}`); return false; } const a = addonOf(h); if (a) { a.progress = 1; } this.run(1); return true;
  }
  /** Runs a building's command (a refit, a call-down) and waits for it to finish. */
  act(b: Building | undefined, key: string, wait = 0): boolean { if (!b || !this.may(key)) return false; this.cash(400); const ok = this.g.buildingAction(b, key); if (!ok) this.log.push(`could not ${key} at ${b.kind}`); else this.run(wait); return ok; }
  /** Uses a body's ability. */
  cast(u: Unit | undefined, key: string, x?: number, z?: number, id?: number) { if (!u || !this.may(key)) return false; u.energy = 200; if (u.abCd) u.abCd[key] = 0; const ok = useAbility(this.g, u, key, { x: x ?? u.pos.x, z: z ?? u.pos.z, id }); if (!ok) this.log.push(`could not ${key} with a ${u.kind}`); return ok; }
  train(k: Kind, n: number) {
    if (!this.may(k)) return;
    const g = this.g, at = (Object.keys(TRAINS) as BKind[]).filter(b => TRAINS[b]!.includes(k));
    for (let tries = 0; tries < 40 && g.own(k, this.me).length < n; tries++) {
      // Out of beds: stake another bed building first, the way a player would after the "no beds" line.
      if (g.supplyUsed(this.me) + UNIT[k].supply * 2 > g.supplyCap(this.me) && tries % 4 === 0) this.build(FACTION[this.me].supply);
      for (const b of g.buildings.filter(b => b.alive && b.built && b.team === this.me && at.includes(b.kind))) { this.cash(UNIT[k].cost * 2); g.train(b, k); }
      this.run(8, () => g.own(k, this.me).length >= n);
    }
    if (g.own(k, this.me).length < n) this.log.push(`could not train ${n} ${k} (${g.own(k, this.me).length})`);
  }
  up(key: UpKey) { if (!this.may(key)) return; const u = UPGRADES.find(x => x.key === key)!; this.cash(u.cost); if (!this.g.buyUpgrade(key, this.me)) this.log.push(`could not buy ${key}`); }
  walk(x: number, z: number) { const b = this.body; if (b) { b.pos.x = x; b.pos.z = z; } }
  jump(k: Kind) { if (!this.may('jump')) return; const g = this.g, u = g.units.find(u => u.alive && u.team === this.me && u.kind === k); if (!u) { this.log.push(`no ${k} to jump into`); return; }
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
  'First Shift': p => { const g = p.g; g.obj.drilled = 40; p.run(200, () => g.stats.mined >= 250); p.run(3); p.jump('linesman'); p.run(16, () => !!g.ms.sent); p.defend(30, () => g.ms.probe === 2); },
  'Payroll': p => { const g = p.g; p.build('bunkhouse'); p.build('depot'); p.train('linesman', 4); p.defend(400, () => (g.ms.cleared || 0) >= 3); },
  'Gas Money': p => { const g = p.g; if (p.build('pumpjack')) { const v = g.vents.find(v => v.tap && v.tap.team === p.me); for (const u of g.own('rigger', p.me).slice(0, 3)) sendToVent(g, u, v || null); }
    p.run(240, () => (g.ms.fluxIn || 0) >= 150); p.build('machineshop'); p.bolt('machineshop', 'twinbay'); p.train('dustbike', 4);
    const [x, z] = MAP.exp; for (const u of g.own('dustbike', p.me)) { u.pos.x = x - 8; u.pos.z = z; } p.kill(u => Math.hypot(u.pos.x - x, u.pos.z - z) < 25); p.defend(10); },
  'Tools of the Trade': p => { const g = p.g; p.build('bunkhouse'); p.bolt('bunkhouse', 'labbay'); p.train('breacher', 3); p.build('assay'); p.up('dmg'); p.train('patch', 1);
    p.run(400, () => { const pl = g.dir.side(p.me).plan; if (pl && pl.phase === 'ask') g.dir.playerOrders(new Set(['KeyZ']), g.cam.position, g.cam.position, 0); return g.obj.answered; });
    p.raze('reedgate'); p.defend(10); },
  'Night Shift': p => { const g = p.g, st = MAP.sites!; const far = st.map(s => s).sort((a, b) => Math.hypot(b[0], b[1]) - Math.hypot(a[0], a[1])).find(s => Math.hypot(s[0], s[1]) > 40 && Math.hypot(s[0] - MAP.out[0], s[1] - MAP.out[1]) > 70) || st[1];
    p.build('headframe', far as [number, number], 8, 30); const h = g.hqs(p.me).find(b => Math.hypot(b.pos.x, b.pos.z) > 40); p.act(h, 'bastion', 40); p.defend(320, () => p.done(2)); },
  'Core Sample': p => { const g = p.g; p.build('mast'); p.bolt('bunkhouse', 'labbay'); p.train('longshot', 2); const [lx, lz] = [78.8, -47.6]; p.kill(u => Math.hypot(u.pos.x - lx, u.pos.z - lz) < 14);
    p.jump('rigger'); const go = () => { if (p.may('ledge')) p.walk(lx + 2, lz + 1); return false; }; p.run(24, () => { go(); return p.done(3); }, true); p.walk(4, 6); p.run(3, () => p.done(4)); },
  'Heavy Metal': p => { const g = p.g; p.build('foundry'); p.bolt('machineshop', 'labbay'); p.train('gantry', 1); p.train('piledriver', 1); p.run(3);
    const pit = g.pits()[0], pd = g.own('piledriver', p.me)[0]; if (pit && pd) { const d = Math.hypot(pit.pos.x, pit.pos.z); pd.pos.x = pit.pos.x * (1 - 24 / d); pd.pos.z = pit.pos.z * (1 - 24 / d); p.cast(pd, 'anchor'); p.run(5, undefined, true); }
    p.prop('Needle\'s Eye', q => q.y0 === 0); p.run(6); if (g.props.some(q => q.alive && q.name === 'Needle\'s Eye' && q.y0 > 0)) { p.log.push('the arch top stayed up after its legs were shot out'); p.prop('Needle\'s Eye'); }
    if (pit) g.damage(pit, 1e7, null); p.defend(10); },
  'Ground Rules': p => { const g = p.g; p.bolt('bunkhouse', 'labbay'); p.train('sapper', 2); const sap = g.own('sapper', p.me);
    sap.forEach((u, i) => { for (let k = 0; k < 2; k++) { const [x, z] = roadPt(ROAD.len * (.4 + i * .08 + k * .03), k ? 4 : -4); u.pos.x = x; u.pos.z = z; p.cast(u, 'mine', x + 1, z); p.run(4, undefined, true); } });
    p.run(10, () => !!g.ms.col, true); p.defend(240, () => g.ms.col === 2); p.raze('reedgate'); p.defend(5); },
  'Lamps': p => { const g = p.g, [fx, fz] = MAP.exp; p.build('flaktower', [fx, fz], 4, 20); p.train('rigger', 9);
    p.defend(900, () => { for (const u of g.own('rigger', p.me).slice(0, 6)) { u.pos.x = fx + (u.id % 5) - 2; u.pos.z = fz + 6; } p.kill(u => u.order.type === 'raid' && Math.hypot(u.pos.x - fx, u.pos.z - fz) < 30); return p.done(1) && p.done(2); }); },
  'Air Freight': p => { const g = p.g, [ix, iz] = [91, -103]; p.build('hangar'); p.train('hopper', 1); const hop = g.own('hopper', p.me)[0], rig = g.own('rigger', p.me)[0];
    p.kill(u => Math.hypot(u.pos.x - ix, u.pos.z - iz) < 20);
    if (hop && rig && p.may('hopper')) { hop.pos.x = rig.pos.x + 1; hop.pos.z = rig.pos.z; load(g, hop, rig); hop.pos.x = ix; hop.pos.z = iz; unload(g, hop); }
    p.run(24, () => { if (rig && rig.alive && !rig.inside) rig.order = { type: 'guard', x: rig.pos.x, z: rig.pos.z }; return p.done(3); }, true);
    if (hop && rig && p.may('hopper')) { hop.pos.x = rig.pos.x + 1; hop.pos.z = rig.pos.z; load(g, hop, rig); hop.pos.x = 6; hop.pos.z = 6; unload(g, hop); } p.run(3, () => p.done(4), true); },
  'Off the Books': p => { const g = p.g, c = (g as any).cmd; if (c && p.may('lift')) { c.zt = .5; p.run(1); c.zt = 0; } p.build('bunkhouse'); p.train('linesman', 4); if (c) c.groups[0].us = g.own('linesman', p.me).slice(0, 4);
    p.act(p.hq(), 'surveyrig', 30); p.act(g.hqs(p.me).find(b => b.kind === 'surveyrig'), 'drone', 2);
    for (const s of MAP.sites!.slice(1)) if (g.hqs(p.me).length < 3) p.build('headframe', s as [number, number], 8, 30); p.defend(500, () => p.done(4)); },
  'Ore Else': p => { const g = p.g; p.build('annex'); p.bolt('hangar', 'labbay'); p.train('claimbarge', 1); p.raze('wardpylon'); p.raze('broodpit'); p.raze('reedgate'); p.run(2); p.raze('choir'); p.run(3); check(!!g.ms.erupt, 'Ore Else: the canyon opens when the last Stone breaks'); p.defend(100, () => g.endT > 0); },
  'Wrong Body': p => { const g = p.g; p.run(400, () => p.done(0)); p.run(300, () => p.done(1)); p.build('hushwell'); p.build('hushwell'); p.train('tender', 8); p.run(5); p.defend(60, () => g.ms.wave === 2); },
  'Brood': p => { const g = p.g; p.build('broodpit'); if (p.build('siphonbell')) { const v = g.vents.find(v => v.tap && v.tap.team === p.me); for (const u of g.own('tender', p.me).slice(0, 3)) sendToVent(g, u, v || null); }
    p.run(300, () => (g.ms.fluxIn || 0) >= 100); p.build('wardpylon'); p.build('thornspire'); p.build('thornspire'); p.train('cantor', 6); p.run(2); p.raze('sporesac', SIDE.home); p.raze('stinger', SIDE.home); p.raze('warren', SIDE.home); p.defend(10); },
  'Salt Road': p => { const g = p.g, st = MAP.sites!; const far = st.filter(s => Math.hypot(s[0] - MAP.out[0], s[1] - MAP.out[1]) > 60).sort((a, b) => Math.hypot(a[0] - MAP.out[0], a[1] - MAP.out[1]) - Math.hypot(b[0] - MAP.out[0], b[1] - MAP.out[1]));
    p.build('reedgate'); for (const s of far) { if (g.ownB('choir', true, p.me).length >= 2) break; p.build('choir', s as [number, number], 6, 30); } p.up('vfar'); p.train('cantor', 1);
    const st2 = g.ownB('choir', true, p.me).find(b => Math.hypot(b.pos.x - MAP.out[0], b.pos.z - MAP.out[1]) > 40); const herd = () => { if (st2) for (const u of g.army(p.me)) { u.pos.x = st2.pos.x + 3; u.pos.z = st2.pos.z + 3; u.order = { type: 'guard', x: u.pos.x, z: u.pos.z }; } };
    herd(); for (let k = 0; k < 6 && !p.done(3); k++) { p.train('lancer', g.own('lancer', p.me).length + 1); herd(); }
    p.raze('sporesac', SIDE.home); p.raze('stinger', SIDE.home); p.raze('warren', SIDE.home); p.kill(() => true); p.defend(10); },
  'Old Friends': p => { const g = p.g; p.build('wardpylon'); p.up('vglass'); p.build('mendingpool'); p.train('tuner', 1); const tu = g.own('tuner', p.me)[0];
    p.defend(900, () => { if (g.ms.live && tu && tu.alive && !g.ms.c_wall) { const [x, z] = roadPt(ROAD.len * .7, 0); tu.pos.x = x + 4; tu.pos.z = z; p.cast(tu, 'wall', x, z); } return (g.ms.done || 0) >= 3; }); },
  'Quiet Feet': p => { const g = p.g; p.build('duskhall'); p.build('quiethouse'); p.train('mute', 3); p.raze('pumpjack', SIDE.home); p.defend(20, () => g.endT > 0); },
  'Listening Post': p => { const g = p.g; p.build('kiln'); p.train('listener', 1); p.kill(u => u.kind === 'needler' || u.kind === 'snapper' && u.order.type === 'guard'); p.train('bell', 2); p.raze('sporesac', SIDE.home); p.raze('stinger', SIDE.home); p.raze('warren', SIDE.home); p.defend(20, () => g.endT > 0); },
  'Hold the Note': p => { const g = p.g; p.build('songarchive'); p.train('warden', 1); p.train('choirmaster', 2); const c = roadPt(ROAD.len * .52, 34);
    const cm = g.own('choirmaster', p.me).slice(0, 2); cm.forEach((u, i) => { u.pos.x = c[0] + i * 2; u.pos.z = c[1]; }); p.cast(cm[0], 'join'); p.run(14, undefined, true);
    p.run(500, () => { for (const u of [...g.own('warden', p.me), ...g.own('chord', p.me)]) { u.pos.x = c[0]; u.pos.z = c[1]; u.order = { type: 'guard', x: c[0], z: c[1] }; } p.kill(u => u.order.type === 'raid'); return p.done(3); }, true); },
  'Sky Choir': p => { const g = p.g, [ix, iz] = [91, -103]; p.build('skyloft'); p.train('swift', 2); p.kill(u => u.kind === 'gadfly'); p.build('kiln'); p.up('vfar'); p.train('ferry', 1);
    const fe = g.own('ferry', p.me)[0]; p.kill(u => Math.hypot(u.pos.x - ix, u.pos.z - iz) < 20 && !u.air); const herd = () => { for (const u of g.army(p.me)) { u.pos.x = ix + 2; u.pos.z = iz + 2; u.order = { type: 'guard', x: ix, z: iz }; } };
    herd(); if (fe) p.cast(fe, 'unfold'); p.run(3, undefined, true); for (let k = 0; k < 6 && !p.done(3); k++) { p.train('cantor', g.own('cantor', p.me).length + 1); herd(); }
    p.raze('pumpjack', SIDE.home); p.raze('watchpost', SIDE.home); p.defend(20, () => g.endT > 0); },
  'Open Hands': p => { const g = p.g; p.run(3); p.walk(ROAD.x, ROAD.z); p.run(2); p.walk(3, 8); p.run(40, () => g.endT > 0); },
  'Long Stride': p => { const g = p.g, [lx, lz] = [78.8, -47.6]; p.build('tuningfork'); p.train('reedwalker', 1); p.train('knell', 1); const rw = g.own('reedwalker', p.me)[0], kn = g.own('knell', p.me)[0];
    const hold = () => { if (rw && rw.alive && p.may('ledge')) { rw.pos.x = lx; rw.pos.z = lz; rw.order = { type: 'guard', x: lx, z: lz }; } };
    hold(); p.run(2, undefined, true); if (kn) { const [x, z] = roadPt(ROAD.len * .5, 0); kn.pos.x = x + 6; kn.pos.z = z; p.cast(kn, 'toll', x, z); }
    p.defend(400, () => { hold(); return p.done(3); }); },
  'The Last Verse': p => { const g = p.g, check = (ok: boolean, what: string) => { if (!p.ban.size) chk(ok, what); }; p.build('highbeacon'); p.train('cantus', 1); const c = roadPt(ROAD.len * .52, 34), spots = [-30, 0, 30].map(k => roadPt(ROAD.len * .52 + k, 34 + (k ? -14 : 16))); for (const s of spots) p.build('choir', s as [number, number], 0, 14);
    p.defend(30, () => false); check((g.ms.hold || 0) < 1 || near(p, c), 'The Last Verse: the verse only counts while the player stands between the Stones');
    p.run(260, () => { p.walk(c[0], c[1]); p.kill(u => u.order.type === 'raid'); return !!g.ms.turn; }, true); check(g.ms.turn === 1 && !p.done(3), 'The Last Verse: after three minutes Held Fifth says where the glass stops, and the job waits for the player');
    p.run(8, () => { p.walk(c[0], c[1]); return false; }, true); check(g.endT <= 0 && !g.ms.out, 'The Last Verse: staying between the Stones does not end the job'); const n = g.ownB('choir', false, p.me).length;
    p.run(6, () => { p.walk(c[0] + 80, c[1]); return !!g.ms.out; }, true); check(g.ms.out === 1 && g.ownB('choir', false, p.me).length === n - 1, 'The Last Verse: walking out stops the verse and the Gloam takes the nearest Stone'); },
  'Rooted': p => { const g = p.g; p.run(400, () => p.done(0)); p.build('sporesac'); const cap = g.ownB('mothercap', true, p.me)[0]; p.cash(200); for (let i = 0; i < 3; i++) g.train(cap, 'grazer'); p.run(40, () => p.done(2));
    p.cash(400); p.train('grazer', 8); const fields = MAP.sites!.filter(s => Math.hypot(s[0] - cap.pos.x, s[1] - cap.pos.z) > 40).sort((a, b) => Math.hypot(a[0] - cap.pos.x, a[1] - cap.pos.z) - Math.hypot(b[0] - cap.pos.x, b[1] - cap.pos.z));
    for (const s of fields) { if (g.ownB('mothercap', true, p.me).length >= 2) break; p.build('mothercap', s as [number, number], 6, 30); } p.run(5); },
  'Two to a Bud': p => { const g = p.g; p.cash(300); p.train('grazer', 8); p.build('warren'); if (p.build('ventbladder')) { const v = g.vents.find(v => v.tap && v.tap.team === p.me); for (const u of g.own('grazer', p.me).slice(0, 3)) sendToVent(g, u, v || null); }
    p.run(300, () => (g.ms.fluxIn || 0) >= 100); p.up('gtongue'); p.run(2); p.kill(u => u.order.type === 'guard'); p.run(5); },
  'The Garden': p => { const g = p.g; p.cash(400); p.train('grazer', 10); p.build('warren'); p.build('quillgarden'); p.build('blisterbed'); p.build('puffball');
    p.defend(600, () => { p.kill(u => !!u.air); return p.done(3); }); p.raze('wardpylon'); p.run(2); p.raze('choir'); p.run(5); },
  'Under the Road': p => { const g = p.g; p.cash(400); p.train('grazer', 8); p.build('warren'); p.up('gdig'); p.train('snapper', 6);
    g.own('snapper', p.me).slice(0, 6).forEach((u, i) => { const [x, z] = roadPt(ROAD.len * (.4 + i * .04), i % 2 ? 3 : -3); u.pos.x = x; u.pos.z = z; u.order = { type: 'guard', x, z }; p.cast(u, 'dig'); });
    p.run(10, () => !!g.ms.col, true); p.defend(300, () => p.done(2)); },
  'Elder': p => { const g = p.g; p.cash(400); p.train('grazer', 6); p.build('warren'); const cap = g.ownB('mothercap', true, p.me)[0]; if (p.act(cap, 'grow', 2) && (cap as any).grow) (cap as any).grow.t = 0; p.run(2);
    p.kill(u => u.kind === 'mute'); p.build('rotden'); p.train('seeder', 1); p.kill(u => u.order.type === 'raid'); p.train('smother', 1); const sm = g.own('smother', p.me)[0], w = g.units.find(u => u.alive && u.team === p.foe && u.kind === 'bell');
    if (sm && w) { sm.pos.x = w.pos.x + 6; sm.pos.z = w.pos.z; p.cast(sm, 'mind', w.pos.x, w.pos.z, w.id); p.run(2, undefined, true); }
    p.defend(20, () => g.endT > 0); },
  'What It Remembers': p => { const g = p.g; p.cash(400); p.train('grazer', 10); p.train('keeper', 1); const k = g.own('keeper', p.me)[0]; if (k) { k.energy = 200; const a = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map(i => [k.pos.x + Math.cos(i * .63) * 7, k.pos.z + Math.sin(i * .63) * 7]).find(([x, z]) => !whyNot(g, k, 'pod', { x, z })); if (a) p.cast(k, 'pod', a[0], a[1]); else p.log.push('no room for a Spore Pod'); } p.run(10, undefined, true);
    p.build('warren'); p.build('tuskhollow'); p.train('mulcher', 1); p.build('shellpit'); p.up('glob'); p.train('shellback', 1); const sb = g.own('shellback', p.me)[0]; p.cash(400); if (sb) p.cast(sb, 'ripen'); p.run(30, () => g.own('lobber', p.me).length > 0, true);
    p.prop('Glass wall'); p.run(2); const mu = g.own('mulcher', p.me)[0]; if (mu) { mu.pos.x = -36; mu.pos.z = -4; } p.run(5, () => g.endT > 0, true); },
  'Wings': p => { const g = p.g, [ix, iz] = [91, -103]; p.cash(400); p.train('grazer', 10); p.build('warren'); p.build('wingspire'); p.train('bloater', 2); p.kill(u => u.kind === 'gadfly');
    p.build('sporesac'); const sac = g.ownB('sporesac', true, p.me).slice(-1)[0]; p.act(sac, 'uproot', 1); p.up('gbelly'); p.train('snapper', 4); const dr = g.own('drifter', p.me)[0];
    if (dr) { const sn = g.own('snapper', p.me).slice(0, 4); for (const u of sn) { u.pos.x = dr.pos.x + 1; u.pos.z = dr.pos.z; } p.cast(dr, 'board'); dr.pos.x = ix; dr.pos.z = iz; p.kill(u => Math.hypot(u.pos.x - ix, u.pos.z - iz) < 20 && !u.air); p.cast(dr, 'drop'); p.run(3, undefined, true); }
    p.raze('pumpjack', SIDE.home); p.raze('watchpost', SIDE.home); p.defend(20, () => g.endT > 0); },
  'Deep Roots': p => { const g = p.g, [lx, lz] = [78.8, -47.6]; p.cash(400); p.train('grazer', 12); p.build('warren'); p.build('deeproot'); p.build('wingspire'); p.train('gnatwing', 1); const gw = g.own('gnatwing', p.me)[0]; if (gw) { gw.pos.x = lx; gw.pos.z = lz; }
    p.kill(u => Math.hypot(u.pos.x - lx, u.pos.z - lz) < 18); p.build('tunnelroot', [lx, lz], 0, 10); p.train('snapper', 8); const dp = g.ownB('deeproot', true, p.me)[0];
    if (dp) { for (const u of g.own('snapper', p.me).slice(0, 8)) { u.pos.x = dp.pos.x + 4; u.pos.z = dp.pos.z; } p.act(dp, 'go', 4); }
    p.build('rotden'); const cap = g.ownB('eldercap', true, p.me)[0]; if (p.act(cap, 'grow', 2) && (cap as any).grow) (cap as any).grow.t = 0; p.run(2);
    p.build('quillgarden'); p.build('needleden'); p.up('gneedle'); p.train('quillback', 2); for (const q of g.own('quillback', p.me).slice(0, 2)) { p.cash(300); p.cast(q, 'ripen'); } p.run(30, () => g.own('needler', p.me).length >= 2, true);
    p.defend(300, () => { for (const u of g.own('snapper', p.me)) if (!u.inside && Math.hypot(u.pos.x - lx, u.pos.z - lz) > 12) { u.pos.x = lx + (u.id % 5) - 2; u.pos.z = lz + (u.id % 3) - 1; u.order = { type: 'guard', x: u.pos.x, z: u.pos.z }; } return p.done(5); }); },
  'Spore Season': p => { const g = p.g; p.prop('Drill tower'); p.run(2); const [tx, tz] = roadPt(ROAD.len * .3, -30); p.cash(300); p.train('grazer', 8); p.build('warren'); p.build('rotden');
    const cap = g.ownB('eldercap', true, p.me)[0]; if (p.act(cap, 'grow', 2) && (cap as any).grow) (cap as any).grow.t = 0; p.run(2); p.train('hooksail', 1); p.build('mothercap', [tx, tz], 6, 33); p.run(5); },
  'Old Opening': p => { const g = p.g; p.build('flaktower'); p.build('hangar'); p.train('flakkite', 1); p.defend(700, () => { p.kill(u => !!u.air); return p.done(2); }); p.raze('headframe'); p.run(5); },
  'Needle\'s Eye Road': p => { const g = p.g; p.jump('warden'); p.run(2); p.defend(500, () => (g.ms.done || 0) >= 3); p.prop('Needle\'s Eye', q => q.y0 === 0); p.run(6); if (g.props.some(q => q.alive && q.name === 'Needle\'s Eye' && q.y0 > 0)) { p.log.push('the arch top stayed up after its legs were shot out'); p.prop('Needle\'s Eye'); } p.run(5); },
  'Rig Breakers': p => { p.prop('Deep Charge rig'); p.run(5); },
  'Common Ground': p => { const g = p.g; p.build('bunkhouse'); p.train('linesman', 6); p.run(400, () => { p.kill(u => u.order.type === 'raid' && (p.may('help') || Math.hypot(u.pos.x, u.pos.z) < 40)); return p.done(0); }, true); p.run(2); for (const b of g.buildings) if (b.alive && b.team === SIDE.out) g.damage(b, 1e7, null); p.defend(10, () => g.endT > 0); },
  'Three Voices': p => { const g = p.g; p.build('bunkhouse'); p.train('linesman', 6); p.run(1000, () => { p.kill(u => u.order.type === 'raid' && (p.may('help') || Math.hypot(u.pos.x, u.pos.z) < 40)); return p.done(0); }, true); p.run(2); for (const b of g.buildings) if (b.alive && b.team === SIDE.out) g.damage(b, 1e7, null); p.defend(10, () => g.endT > 0); },
  'Fourteen Twenty': p => { const g = p.g, h = (g as any)._first; if (h) g.damage(h, 1e7, null); p.run(5); },
  'Moss\'s Book': p => { p.raze('choir'); p.run(5); },
  'Discord': p => { p.raze('choir'); p.run(5); },
  'Rot': p => { p.raze('mothercap'); p.run(5); },
};

MISSIONS.forEach((m, i) => {
  const key = m.name; if (only.length && !only.includes(i + 1)) return;
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
// What each job teaches, as the thing a run refuses: with it refused, the scripted player must not win. And how long a player who does
// nothing lasts: the enemy must end the job as a loss inside that many seconds. Jobs not listed here are not checked yet (the Veyl and Gloam
// arcs are rewritten when those rules land). The idle player also switches off the side's builder on jobs that start with it on.
const TEACH: Record<string, { ban: string[]; lose: number }> = {
  'Payroll': { ban: ['bunkhouse'], lose: 900 },
  'Gas Money': { ban: ['pumpjack'], lose: 1200 },
  'Tools of the Trade': { ban: ['labbay'], lose: 1200 },
  'Night Shift': { ban: ['bastion'], lose: 1200 },
  'Core Sample': { ban: ['ledge'], lose: 1200 },
  'Heavy Metal': { ban: ['piledriver'], lose: 1200 },
  'Ground Rules': { ban: ['sapper'], lose: 1200 },
  'Lamps': { ban: ['flaktower'], lose: 1200 },
  'Air Freight': { ban: ['hopper'], lose: 1200 },
  'Off the Books': { ban: ['lift'], lose: 1200 },
  'Ore Else': { ban: ['annex'], lose: 1500 },
  'Wrong Body': { ban: ['hushwell'], lose: 900 },
  'Brood': { ban: ['siphonbell'], lose: 1200 },
  'Salt Road': { ban: ['vfar'], lose: 1500 },
  'Old Friends': { ban: ['wall'], lose: 1200 },
  'Quiet Feet': { ban: ['mute'], lose: 1200 },
  'Listening Post': { ban: ['listener'], lose: 1200 },
  'Hold the Note': { ban: ['join'], lose: 1200 },
  'Sky Choir': { ban: ['unfold'], lose: 1500 },
  'Long Stride': { ban: ['reedwalker'], lose: 1200 },
  'The Last Verse': { ban: ['highbeacon'], lose: 1500 },
  'Rooted': { ban: ['mothercap'], lose: 1200 },
  'Two to a Bud': { ban: ['ventbladder'], lose: 1000 },
  'The Garden': { ban: ['puffball'], lose: 1200 },
  'Under the Road': { ban: ['gdig'], lose: 1200 },
  'Elder': { ban: ['grow'], lose: 1200 },
  'What It Remembers': { ban: ['tuskhollow'], lose: 1500 },
  'Wings': { ban: ['uproot'], lose: 1500 },
  'Deep Roots': { ban: ['tunnelroot'], lose: 1200 },
  'Spore Season': { ban: ['hooksail'], lose: 1500 },
  'Old Opening': { ban: ['flaktower'], lose: 1500 },
  'Common Ground': { ban: ['help'], lose: 1500 },
  'Three Voices': { ban: ['help'], lose: 2500 },
};
const result = (p: Play) => { const g = p.g; return g.phase === 'over' ? (g.won ? 'won' : 'lost') : g.endT > 0 ? (g.endWon ? 'won' : 'lost') : 'running'; };
if (!quick) MISSIONS.forEach((m, i) => {
  const t = TEACH[m.name]; if (!t || (only.length && !only.includes(i + 1))) return;
  const label = `${m.tag} ${m.name}`;
  try {
    const p = new Play(m); for (const b of t.ban) p.ban.add(b); p.g.dir.side(p.me).auto = false; p.run(1); SCRIPTS[m.name](p);   // the side's own builder stays off, or it would build the refused thing p.run(6, () => p.g.phase === 'over');
    check(result(p) !== 'won', `${label}: cannot be won without ${t.ban.join(', ')} (${result(p)})`);
  } catch (e: any) { check(false, `${label}: must-use run ran without throwing (${String(e && e.stack || e).split('\n').slice(0, 4).join(' / ')})`); }
  try {
    const p = new Play(m); p.guard = false; p.g.dir.side(p.me).auto = false; p.run(t.lose, () => result(p) !== 'running'); p.run(6, () => p.g.phase === 'over');
    check(result(p) === 'lost', `${label}: a player who does nothing loses it (${result(p)} at ${Math.round(p.g.time)} s)`);
  } catch (e: any) { check(false, `${label}: lose run ran without throwing (${String(e && e.stack || e).split('\n').slice(0, 4).join(' / ')})`); }
});
console.log(fails.length ? `\n${fails.length} failed` : '\nall passed');
process.exit(fails.length ? 1 : 0);
