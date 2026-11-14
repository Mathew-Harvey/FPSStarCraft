// The Conductor: the Veyl economy bot. It plans song fields before buildings (a Hush Well first, then the buildings that must stand in its
// field), grows the full tech tree, taps vents for Flux, trains every kind when it makes sense against what the enemy fields, spends Choir
// Stone energy on Quicken, answers unseen enemies with detection, runs Ferry drops, and picks a build plan: the four shared doctrines
// (steady, rush, fort, boom) plus a Veyl air plan and a tech plan. Prices always go through costOf / canPay (ore and Flux).
import type { Director, Side } from '../../director';
import { docOf } from '../../director';
import { Kind, BKind, UNIT, BLD, UPGRADES, Building, Unit, MAP, foeOf, fac, homeXZ, isWorker, isFighter, type UpKey } from '../../data';
import { costOf, canPay, sendToVent, tapped, ventAt } from '../../core/econ';
import { isHidden } from '../../core/sight';
import { hasTag } from '../../core/combat';
import { useAbility } from '../../core/ability';
import { load, unload } from '../../core/cargo';
import { V_TRAINS, V_NEEDS, FIELD, type VKind, type VBKind } from './numbers';
import { fieldsOf, inField, quicken, energyOf, unfolded } from './fields';

/** The Veyl's own build plans on top of the shared doctrines: which tech path they lean on. */
export type VPlan = 'ground' | 'air' | 'tech';
interface VS extends Side { vplan?: VPlan; drop?: { ferry: Unit; phase: 'load' | 'fly' | 'home'; t: number; x: number; z: number } | null; dropT?: number; seenCloak?: number; wellT?: number; stoneT?: number }

/** Where a building of kind k can go: inside one of the side's song fields (or anywhere for a field maker or the vent tap), off the ore
 *  walks, nearest the point given. Tries ring spots round every field, home ones first. */
function spotIn(D: Director, k: BKind, T: number, prefer: [number, number]): [number, number] | null {
  const g = D.g, st = BLD[k], [HX, HZ] = homeXZ(T); let best: [number, number] | null = null, bd = 1e9;
  const fields = fieldsOf(g, T).filter(f => !(f[3] as any).kind || (f[3] as any).kind !== 'ferry');
  for (const [fx, fz, r] of fields) {
    if (Math.hypot(fx - HX, fz - HZ) > 70 && fields.some(f => Math.hypot(f[0] - HX, f[1] - HZ) < 70)) continue;   // build at home while home has room
    for (let rr = Math.max(st.hx, st.hz) + 2.2; rr <= r + Math.max(st.hx, st.hz) - .3; rr += 1.6) for (let i = 0; i < 16; i++) {
      const a = i / 16 * Math.PI * 2 + rr * .7, x = Math.round(fx + Math.cos(a) * rr), z = Math.round(fz + Math.sin(a) * rr);
      if (D.onOreRoute(k, x, z, T) || !g.canPlace(k, x, z, false, T)) continue;
      const d = Math.hypot(x - prefer[0], z - prefer[1]); if (d < bd) { bd = d; best = [x, z]; }
    }
  }
  return best;
}
/** A spot for a new Hush Well: on a ring round the home Stone, away from the ore walks, nearest the point given. */
function wellSpot(D: Director, T: number, prefer: [number, number]): [number, number] | null {
  const g = D.g, home = g.ownB('choir', true, T)[0]; if (!home) return null; let best: [number, number] | null = null, bd = 1e9;
  for (let rr = 9; rr <= 30; rr += 3) for (let i = 0; i < 18; i++) {
    const a = i / 18 * Math.PI * 2 + rr, x = Math.round(home.pos.x + Math.cos(a) * rr), z = Math.round(home.pos.z + Math.sin(a) * rr);
    if (D.onOreRoute('hushwell', x, z, T) || !g.canPlace('hushwell', x, z, false, T)) continue;
    // a Well whose field covers nothing new is wasted: keep them about one field apart
    if (g.ownB('hushwell', false, T).some(w => Math.hypot(w.pos.x - x, w.pos.z - z) < 9)) continue;
    const d = Math.hypot(x - prefer[0], z - prefer[1]) + rr * .4; if (d < bd) { bd = d; best = [x, z]; }
  }
  return best;
}

export function conductor(D: Director, dt: number, V0: Side = D.vs) {
  const V = V0 as VS, g = D.g, T = V.team, U = g.upOf(T) as any, [HX, HZ] = homeXZ(T); V.qmT -= dt; if (V.qmT > 0 || !V.auto) return; V.qmT = 1;
  const own = (k: BKind) => g.ownB(k, false, T), up = (k: BKind) => g.ownB(k, true, T), has = (k: BKind) => up(k).length > 0, any = (k: BKind) => own(k).length > 0;
  const stones = own('choir'), home = up('choir')[0] || stones[0]; if (!home) return;
  const DOC = docOf(V), foe = foeOf(T), now = g.time;
  // The Veyl plan: chosen once per match from the seed (a hidden map's doctrine leans it: fort means tech, boom means air).
  if (!V.vplan) V.vplan = DOC.key === 'fort' ? 'tech' : DOC.key === 'boom' ? 'air' : DOC.key === 'rush' ? 'ground' : (['ground', 'air', 'tech'] as VPlan[])[Math.floor(Math.random() * 3)];
  const air = V.vplan === 'air', tech = V.vplan === 'tech';
  const sites = g.ownB(undefined, false, T).filter(b => !b.built), growing = (k: BKind) => sites.some(b => b.kind === k);
  const free = g.supplyCap(T) - g.supplyUsed(T), army = g.army(T).filter(u => u.kind !== 'shard'), N = army.reduce((n, u) => n + UNIT[u.kind].supply, 0);
  const ore = () => g.cash(T), flux = () => g.flux(T);
  // Away from the enemy: new buildings go behind the Stone.
  const [fx0, fz0] = homeXZ(foe), away = Math.atan2(HZ - fz0, HX - fx0), behind: [number, number] = [HX + Math.cos(away) * 12, HZ + Math.sin(away) * 12];
  let saving = 0, opening = false; const say = (line: string) => D.say('Conductor', line, '', T);
  const put = (k: VBKind, line: string): boolean => {
    if (g.paper(T) && !g.paper(T)!.allow.includes(k)) return false; if (!g.unlocked(k, T)) return false;
    const c = costOf(k); if (!canPay(g, T, c)) { saving = Math.max(saving, c[0]); return true; }
    const at = k === 'hushwell' ? wellSpot(D, T, behind) : spotIn(D, k, T, behind);
    if (!at) { if (k !== 'hushwell' && !growing('hushwell')) return put('hushwell', 'No room left in the song fields. Growing a Hush Well to make more.'); return false; }
    g.place(k, at[0], at[1], false, T); say(line); return true;
  };
  // Research leaves Flux for the bodies once a Kiln or Skyloft stands (it used to take every drop, and the Kiln never made a thing)
  const fluxKeep = () => (g.ownB('kiln', true, T).length || g.ownB('skyloft', true, T).length) && g.army(T).length < 20 ? 150 : 0;
  const learn = (key: UpKey, keep = 0) => { const u = UPGRADES.find(x => x.key === key)!; if (U[key] || (u.needs && !U[u.needs]) || !g.ownB(u.at, true, T).some(b => g.rate(b) > 0)) return false; if (!canPay(g, T, [costOf(key)[0] + keep, costOf(key)[1] + (costOf(key)[1] && keep ? fluxKeep() : 0)])) return false; return g.buyUpgrade(key, T); };

  // ---- what the enemy fields: plated and huge bodies, fliers, unseen bodies we have run into
  const foes = g.units.filter(u => u.alive && u.team === foe && isFighter(u)), fAir = foes.filter(u => u.air).length, fPlated = foes.filter(u => hasTag(u, 'plated') || hasTag(u, 'huge')).length;
  const mine = [...g.army(T), ...g.own(UNIT.tender ? 'tender' : undefined, T), ...g.ownB(undefined, true, T)];
  if (foes.some(o => isHidden(o) && mine.some(m => Math.hypot(m.pos.x - o.pos.x, m.pos.z - o.pos.z) < 22))) V.seenCloak = now;
  const cloakSeen = now - (V.seenCloak ?? -999) < 240;
  const foeDetects = g.units.some(u => u.alive && u.team === foe && UNIT[u.kind].detect) || g.buildings.some(b => b.alive && b.team === foe && BLD[b.kind].detect);

  // ---- the build order: one step a second
  const pits = own('broodpit'), wells = own('hushwell'), bells = own('siphonbell');
  const wantWell = now > 15 && ((wells.length === 0 && pits.length > 0) || free <= 4 + 2 * (pits.length + own('kiln').length + own('skyloft').length) && !growing('hushwell') && wells.length < 14 && g.supplyCap(T) < 200);
  const exp = D.vExpansion(stones, T), homeLeft = g.ores.filter(n => Math.hypot(n.pos.x - HX, n.pos.z - HZ) < 40).reduce((a, n) => [a[0] + n.amount, a[1] + n.max], [0, 0]);
  const wantStones = Math.min((MAP.sites || []).length + 1, 1 + (now > DOC.expT || homeLeft[0] < homeLeft[1] * .5 ? 1 : 0) + (now > 960 ? 1 : 0) + (now > 1440 ? 1 : 0));
  const freeVent = () => g.vents.filter(v => !v.tap && v.amount > 0 && stones.some(s => s.built && Math.hypot(s.pos.x - v.pos.x, s.pos.z - v.pos.z) < 34) && g.canPlace('siphonbell', Math.round(v.pos.x), Math.round(v.pos.z), false, T)).sort((a, b) => Math.hypot(a.pos.x - HX, a.pos.z - HZ) - Math.hypot(b.pos.x - HX, b.pos.z - HZ))[0];
  const wantBells = Math.min(2 * up('choir').length, has('broodpit') && army.length >= 3 ? 1 + ((now > 300 && army.length >= 5) || now > 450 ? 1 : 0) + (now > 600 ? 2 : 0) : 0);
  const ground = !air && !tech;
  const techStep = (): boolean => {
    if (!has('reedgate')) return false;
    // Each plan has its own road through the tree, so every kind of body turns up in some match: ground goes Dusk Hall, Song Archive,
    // Quiet House; tech goes Kiln, Tuning Fork; air goes Kiln, Skyloft, High Beacon. The rest follow later, by army size or the clock.
    const K = (k: VBKind, n: number, t: number, ok = true): [VBKind, boolean] => [k, ok && (N >= n || now > t)];
    const path: [VBKind, boolean][] = ground
      ? [K('duskhall', 8, 420), K('songarchive', 12, 540, has('duskhall')), K('quiethouse', 16, 660, has('duskhall')), K('kiln', 18, 600), K('mendingpool', 14, 720), K('tuningfork', 24, 840, has('kiln')), K('skyloft', 26, 900, has('kiln')), K('highbeacon', 34, 1080, has('skyloft'))]
      : tech
      ? [K('kiln', 6, 360), K('tuningfork', 10, 480, has('kiln')), K('mendingpool', 12, 600), K('duskhall', 14, 600), K('songarchive', 18, 720, has('duskhall')), K('skyloft', 22, 840, has('kiln')), K('quiethouse', 24, 900, has('duskhall')), K('highbeacon', 30, 1020, has('skyloft'))]
      : [K('kiln', 6, 360), K('skyloft', 8, 450, has('kiln')), K('highbeacon', 16, 660, has('skyloft')), K('duskhall', 14, 600), K('mendingpool', 16, 720), K('tuningfork', 22, 840, has('kiln')), K('songarchive', 22, 840, has('duskhall')), K('quiethouse', 28, 960, has('duskhall'))];
    const LINE: Partial<Record<VBKind, string>> = { kiln: 'A Kiln. Bells, Listeners and Ferries come out of it.', duskhall: 'A Dusk Hall: Rush, Skip, Long Breath and Quick Bloom.', skyloft: 'A Skyloft. The fliers grow there.', mendingpool: 'A Mending Pool: it puts shields back on anything near it.', songarchive: 'A Song Archive: Choirmasters and Wardens.', tuningfork: 'A Tuning Fork: Reedwalkers and Knells.', quiethouse: 'A Quiet House. Mutes, the ones nobody sees.', highbeacon: 'A High Beacon: the Lyre and the Cantus.' };
    const order: [VBKind, boolean, string][] = path.map(([k, w]) => [k, w, LINE[k]!]);
    for (const [k, when, line] of order) if (when && !any(k) && g.unlocked(k, T)) { put(k, line); return true; }
    return false;
  };
  const step = (): void => {
    // a rush puts its second Pit ahead of everything, the first Hush Well too
    if (DOC.key === 'rush' && pits.length === 1 && now > DOC.prodT) { opening = true; put('broodpit', 'A second Brood Pit already. We go at them early.'); return; }
    // a fort opening puts its two Spires ahead of a second Hush Well unless the beds are full
    const fortOpen = DOC.key === 'fort' && now > 90 && now < 420 && (!any('wardpylon') || own('thornspire').length < 2) && wells.length > 0 && free > 1;
    if (wantWell && !fortOpen && put('hushwell', wells.length ? 'The song is crowded. Growing a Hush Well.' : 'A Hush Well first: its song field is where the other buildings can stand.')) return;
    if (!wells.some(w => w.built) && !pits.length && stones.every(s => s.built)) { if (!pits.length && wells.length) return; }
    if (!pits.length) { put('broodpit', 'A Brood Pit, inside the Hush Well\'s field. The voices need somewhere to wake.'); return; }
    // the doctrine's opening (a hidden map leans each side one way): a second Pit early, Spires early, or a second Stone early
    // (each holds its price back from the Tender line and the Pits until it is paid: `opening`)
    if (DOC.key === 'fort' && now > 90 && now < 420 && (!any('wardpylon') || own('thornspire').length < 2)) {
      opening = true;
      if (!any('wardpylon')) { put('wardpylon', 'A Ward Pylon early. We dig in behind Thorn Spires.'); return; }
      if (has('wardpylon')) { put('thornspire', 'A Thorn Spire. We dig in and grow the deep songs.'); return; }
      opening = false;
    }
    if (DOC.key === 'boom' && stones.length < 2 && now > DOC.expT && now < 420) opening = true;
    if (bells.length < wantBells) { const v = freeVent(), c = costOf('siphonbell'); if (v) { if (canPay(g, T, c)) { g.place('siphonbell', Math.round(v.pos.x), Math.round(v.pos.z), false, T); say('A Siphon Bell on the vent. Tenders will carry Flux from it.'); return; } saving = Math.max(saving, c[0]); } }
    if (sites.length >= 2) return;
    // second base before the deep tech, the way the old Conductor did it
    if (has('broodpit') && army.length >= Math.max(1, 4 + DOC.expArmy) && now > Math.min(420, DOC.expT) && (army.length >= 8 || now > 600 || DOC.key === 'boom') && now > (V.stoneT ?? 0) && exp.site && stones.length < wantStones) {
      // a spot between the seam and home, or round the seam: if none is open the step goes on (it used to wait here for good)
      const [sx, sz] = exp.site, dx = HX - sx, dz = HZ - sz, l = Math.hypot(dx, dz) || 1, a0 = Math.atan2(dz, dx);
      const at = [[4, 0], [5, 0], [6, 0], [7, 0], [9, 0], [7, .6], [7, -.6], [9, 1.2], [9, -1.2], [11, .3], [11, -.3]].map(([r, da]) => [Math.round(sx + Math.cos(a0 + da) * r), Math.round(sz + Math.sin(a0 + da) * r)]).find(p => g.canPlace('choir', p[0], p[1], false, T));
      if (at) { if (canPay(g, T, costOf('choir'))) { V.stoneT = now + 90; g.place('choir', at[0], at[1], false, T); say('Seeding a new Choir Stone on the far seam. Some Tenders will drift over.'); } else saving = Math.max(saving, BLD.choir.cost); return; }
    }
    if (!any('reedgate') && has('broodpit') && (army.length >= 4 + Math.max(0, DOC.tech) || now > 330)) { put('reedgate', 'The Reed Gate grows. Lancers and the deeper songs need it.'); return; }
    if (!ground && N >= 6 && !any('kiln') && techStep()) return;
    if (!any('wardpylon') && has('broodpit') && army.length >= 5 + DOC.tech) { put('wardpylon', 'A Ward Pylon. It keeps the buildings near it whole, and it teaches the ground levels.'); return; }
    const spires = own('thornspire').length, wantSpires = Math.max(0, (army.length >= 3 || g.human[foe] ? 1 + (now > 420 ? 1 : 0) + (now > 840 ? 1 : 0) : 0) + DOC.towers + (cloakSeen ? 1 : 0) + (fAir >= 3 ? 1 : 0));
    if (has('wardpylon') && spires < Math.min(wantSpires, 1 + stones.length * 2)) { put('thornspire', cloakSeen ? 'A Thorn Spire: it sees the unseen ones that keep hitting us.' : 'A Thorn Spire, to hit what comes down the road, on foot or in the air.'); return; }
    if (pits.length === 1 && has('broodpit') && (now > DOC.prodT || (now > 150 && foes.filter(o => !o.air).length >= 6))) { put('broodpit', 'A second Brood Pit. Twice the voices.'); return; }
    if (techStep()) return;
    if (pits.length === 2 && now > DOC.prodT + 420) { put('broodpit', 'A third Brood Pit.'); return; }
    // ore piling up with nowhere to go: more Brood Pits (Cantors need no Flux)
    if (ore() > 900 && pits.length < 3 + stones.length && !growing('broodpit')) { put('broodpit', 'Ore is piling up. Another Brood Pit to spend it.'); return; }
    if (has('kiln') && own('kiln').length === 1 && now > 900 && !air) { put('kiln', 'A second Kiln.'); return; }
    if (has('skyloft') && own('skyloft').length === 1 && now > 900 && air) { put('skyloft', 'A second Skyloft.'); return; }
    if (exp.bare) { const [bx, bz] = exp.bare; if (canPay(g, T, costOf('thornspire'))) for (const [ox, oz] of [[5, 5], [-5, 5], [5, -5], [-5, -5]]) if (g.canPlace('thornspire', bx + ox, bz + oz, false, T)) { g.place('thornspire', bx + ox, bz + oz, false, T); say('A Thorn Spire to keep the new Stone company.'); break; } }
  };
  // An early rush at the door: no new buildings or songs until it is beaten, every coin into Cantors, and the Pits quickened.
  // A swarm on its way (more beds of enemy ground fighters than ours, early on): Cantors before anything else, and the Pits quickened.
  // Cantors beat Snappers well at equal cost. (Holding the Tender line back for them lost more matches than it saved: the ore comes from Tenders.)
  const foeBeds = foes.filter(o => !o.air).reduce((n, o) => n + UNIT[o.kind].supply, 0), swarm = now < 420 && foeBeds >= Math.max(3, N * 1.2);
  const rushed = now < 720 && foes.filter(o => !o.air && Math.hypot(o.pos.x - HX, o.pos.z - HZ) < 45).length >= Math.max(3, army.length);
  if (!rushed || !pits.length) step();
  if (rushed || swarm) for (const p of up('broodpit')) { quicken(g, p, T); if (p.queue.length < 2 && g.rate(p) > 0 && canPay(g, T, costOf('cantor')) && free >= 2) g.train(p, 'cantor'); }

  // ---- songs: the levels first, then what the army is using
  const L = (keys: UpKey[], keep = 0) => { for (const k of keys) if (learn(k, keep)) return true; return false; };
  if (!rushed) {
  if (army.length >= 5) L(['vedge', 'vglass', 'vshell'], 100);
  // Low Hum is the Tenders' song (the Ironhold buy their drill early too): first thing once the line is working.
  if (has('broodpit') && g.own('tender', T).length >= 9 && (army.length >= 2 || now > 240)) L(['vhum']);
  if (has('reedgate')) L(['vfar'], 80);
  if (has('duskhall')) L(['vrush', 'vbloom', 'vbreath', 'vskip', 'vstep'], 150);
  if (army.length >= 8) L(['vedge2', 'vglass2', 'vshell2', 'vaedge', 'vaglass'], 150);
  if (has('songarchive')) L(['vshatter', 'vreach'], 150);
  if (has('quiethouse')) L(['vstepthru'], 150);
  if (has('tuningfork')) L(['vstride', 'vtoll'], 150);
  if (has('kiln')) L(['vferry', 'vlisten'], 250);
  if (has('skyloft')) L(['vomen'], 200);
  if (has('highbeacon')) L(['vshard', 'vswift'], 200);
  if (army.length >= 12) L(['vedge3', 'vglass3', 'vshell3', 'vaedge2', 'vaglass2', 'vaedge3', 'vaglass3'], 200);
  }

  // ---- Quicken: a Stone with energy speeds up a busy building
  for (const s of up('choir')) if (energyOf(s) >= 50) { const b = g.ownB(undefined, true, T).filter(b => b.queue.length && g.rate(b) === 1).sort((a, c) => UNIT[c.queue[0].kind].cost - UNIT[a.queue[0].kind].cost)[0]; if (b) quicken(g, b, T); break; }

  // ---- Tenders: eight for the home Stone, six for each other Stone, four for each Siphon Bell
  const tend = g.own('tender', T), hqs = up('choir'), tapsUp = up('siphonbell').filter(b => g.vents.some(v => v.tap === b && v.amount > 0));
  const onFlux = tend.filter(u => u.vent), wantFlux = tapsUp.length * (flux() > 700 ? 1 : flux() > 400 ? 2 : ore() > 300 || has('kiln') || has('skyloft') ? 4 : 3);
  if (onFlux.length < wantFlux) { const v = g.vents.filter(v => v.tap && tapsUp.includes(v.tap) && tapped(g, v, T)).sort((a, b) => tend.filter(u => u.vent === a).length - tend.filter(u => u.vent === b).length)[0]; const w = v && tend.filter(u => !u.vent && !u.site && !u.pilot && u !== g.me && u.carrying === 0).sort((a, b) => Math.hypot(a.pos.x - v.pos.x, a.pos.z - v.pos.z) - Math.hypot(b.pos.x - v.pos.x, b.pos.z - v.pos.z))[0]; if (v && w) sendToVent(g, w, v); }
  else if (onFlux.length > wantFlux + 1) { const w = onFlux.find(u => !(u.fluxing! > 0)); if (w) sendToVent(g, w, null); }
  // the enemy already fields a crowd before seven minutes (a swarm, a rush): fewer Tenders for now, more Cantors
  const early = now < 420 && foes.filter(o => !o.air).length >= Math.max(6, army.length * 2);
  const wantTend = early ? Math.min(9, 12 + DOC.crew) : 12 + DOC.crew + 7 * (hqs.length - 1) + tapsUp.length * 3;
  if (tend.length < wantTend && free > 0 && canPay(g, T, costOf('tender')) && !(opening && ore() < saving + costOf('tender')[0] && tend.length >= 8) && (pits.length || tend.length < 6)) {
    const crew = (h: Building) => tend.filter(u => !u.vent && g.nearHQ((u.node || u).pos.x, (u.node || u).pos.z, T) === h).length + h.queue.filter(q => q.kind === 'tender').length;
    const h = hqs.filter(b => !b.queue.length && crew(b) < (b === home ? 12 + DOC.crew : 7)).sort((a, b) => crew(a) - crew(b))[0] || (tend.length < wantTend ? hqs.find(b => !b.queue.length) : undefined); if (h) g.train(h, 'tender');
  }

  // ---- the army: how many of each kind it wants, given the tech standing and what the enemy fields
  const count = (k: Kind) => army.filter(u => u.kind === k).length + g.ownB(undefined, false, T).reduce((n, b) => n + b.queue.filter(q => q.kind === k).length, 0) + (k === 'chord' ? 0 : 0);
  const casters = count('choirmaster') + 2 * count('chord');
  const want: Partial<Record<VKind, number>> = {
    // once a Kiln or Skyloft stands its bodies get the Flux first: fewer Lancers
    lancer: has('reedgate') ? Math.max(1, Math.round(N * (has('kiln') || has('skyloft') ? .08 : .2) + fPlated * .3)) : 0,
    tuner: has('reedgate') ? Math.min(3, 1 + Math.floor(N / 16)) : 0,
    mute: has('quiethouse') ? (foeDetects ? 1 : 3) + (tech ? 1 : 0) : 0,
    choirmaster: has('songarchive') ? Math.max(0, Math.min(5, 2 + Math.floor(N / 14) + (tech ? 1 : 0)) - casters) + count('choirmaster') : 0,
    listener: has('kiln') ? (cloakSeen ? 2 : 1) : 0,
    bell: has('kiln') ? Math.min(5, 1 + Math.floor(fPlated / 3) + (tech ? 1 : 0) - (air ? 1 : 0)) : 0,
    ferry: has('kiln') && now > 480 ? 1 : 0,
    reedwalker: has('tuningfork') ? Math.min(4, 1 + Math.floor(N / 24) + (tech ? 1 : 0)) : 0,
    knell: has('tuningfork') ? 1 + (tech ? 1 : 0) + (N > 40 ? 1 : 0) : 0,
    swift: has('skyloft') ? Math.min(8, Math.max(air ? 2 : 1, fAir + (air ? 1 : 0))) : 0,
    prism: has('skyloft') ? Math.min(6, (air ? 2 : 1) + Math.floor(N / 22) + Math.floor(fPlated / 5)) : 0,
    omen: has('skyloft') ? (air ? 2 : 1) : 0,
    lyre: has('highbeacon') ? (air ? 3 : 1) + (N > 60 ? 1 : 0) : 0,
    warden: has('songarchive') ? (now > 900 ? 2 : 1) + (tech ? 1 : 0) : 0,
    cantus: has('highbeacon') ? 1 : 0,
  };
  const RANK: Partial<Record<BKind, number>> = { skyloft: 0, kiln: 1, reedgate: 2, choir: 3, broodpit: 4 };
  // the share of ore a building may spend this second, so the Tender line and the next building are never starved for long
  const keep = opening ? saving : saving > 0 && army.length >= 6 + Math.max(0, DOC.tech) ? Math.min(saving, army.length >= 8 ? 400 : 150) : 0;
  // a deeper building short of the price of the body it wants holds that much back from the Brood Pits, once there is an army to stand on
  let hold: [number, number] = [0, 0];
  const tryTrain = (b: Building, k: Kind) => { const nb = V_NEEDS[k as VKind]; if (nb && !has(nb)) return false; const c = costOf(k), deep = (RANK[b.kind] ?? 5) <= 2;
    // the hold only counts against what this body costs: a Cantor (no Flux) is never kept waiting for Flux a Kiln is saving
    if (!canPay(g, T, [c[0] + keep + (deep ? 0 : hold[0]), c[1] + (deep || !c[1] ? 0 : hold[1])])) { if (deep && army.length >= 5 && !hold[0]) hold = [Math.min(c[0], 300), Math.min(c[1], 250)]; return false; }
    if (UNIT[k].supply > free) return false; return g.train(b, k); };
  // the deeper buildings pick first, so a Kiln or Skyloft is not left idle while every coin goes into Cantors
  for (const b of g.ownB(undefined, true, T).sort((a, c) => (RANK[a.kind] ?? 5) - (RANK[c.kind] ?? 5))) {
    if (b.queue.length >= 2 || !V_TRAINS[b.kind as VBKind] || g.rate(b) <= 0) continue; const list = V_TRAINS[b.kind as VBKind]!.filter(k => k !== 'tender');
    const turn = Math.floor(now / 90), short = list.filter(k => (want[k] ?? 0) > count(k)).sort((a, c) => (count(a) / (want[a] || 1)) - (count(c) / (want[c] || 1)) || ((list.indexOf(a) + turn) % list.length) - ((list.indexOf(c) + turn) % list.length));
    if (short.length && tryTrain(b, short[0])) continue;
    if (b.kind === 'broodpit') tryTrain(b, count('cantor') > count('lancer') * 3 && has('reedgate') && !has('kiln') && !has('skyloft') ? 'lancer' : 'cantor');
    if (b.kind === 'skyloft' && air) tryTrain(b, count('prism') <= count('swift') ? 'prism' : 'swift');
    if (b.kind === 'kiln' && tech && N > 30) tryTrain(b, 'bell');
  }

  // ---- Ferry drops: four blades flown to the enemy's ore line now and then
  ferryDrop(D, V, dt);
}

/** A Ferry carries four Cantors or Mutes to the enemy's seams, lets them out, and flies home. One drop every few minutes. */
function ferryDrop(D: Director, V: VS, _dt: number) {
  const g = D.g, T = V.team, foe = foeOf(T), now = g.time, d = V.drop;
  if (d) {
    const f = d.ferry; if (!f.alive) { V.drop = null; return; } d.t += 1;
    if (d.phase === 'load') { const riders = g.army(T).filter(u => (u.kind === 'cantor' || u.kind === 'mute') && !u.inside && u.order.type === 'guard' && !u.pilot && u !== g.me).slice(0, 4);
      for (const u of riders) { if (Math.hypot(u.pos.x - f.pos.x, u.pos.z - f.pos.z) < 5) load(g, f, u); else u.order = { type: 'guard', x: f.pos.x, z: f.pos.z }; }
      if ((f.cargo?.length ?? 0) >= 4 || (d.t > 25 && (f.cargo?.length ?? 0) >= 2)) { d.phase = 'fly'; d.t = 0; f.order = { type: 'amove', x: d.x, z: d.z }; } else if (d.t > 40) { unload(g, f); V.drop = null; } return; }
    if (d.phase === 'fly') { f.order = { type: 'amove', x: d.x, z: d.z }; f.target = null; if (Math.hypot(f.pos.x - d.x, f.pos.z - d.z) < 6 || d.t > 70 || f.shield <= 0) { const out = (f.cargo || []).slice(); unload(g, f); const hq = g.ownB(undefined, true, foe).sort((a, b) => Math.hypot(a.pos.x - f.pos.x, a.pos.z - f.pos.z) - Math.hypot(b.pos.x - f.pos.x, b.pos.z - f.pos.z))[0]; for (const u of out) u.order = { type: 'amove', x: hq ? hq.pos.x : d.x, z: hq ? hq.pos.z : d.z }; d.phase = 'home'; d.t = 0; D.say('Conductor', 'The Ferry let four blades out by their seams.', '', T); } return; }
    if (d.phase === 'home') { const [hx, hz] = homeXZ(T); f.order = { type: 'guard', x: hx, z: hz }; if (d.t > 10) V.drop = null; return; }
  }
  if (now < (V.dropT ?? 600)) return;
  const ferry = g.own('ferry', T).find(u => !unfolded(u) && !(u.cargo && u.cargo.length) && u !== g.me && !u.pilot); if (!ferry) return;
  const blades = g.army(T).filter(u => (u.kind === 'cantor' || u.kind === 'mute') && u.order.type === 'guard').length; if (blades < 6) return;
  const fhq = g.ownB(undefined, true, foe).find(b => (BLD[b.kind] as any) && (b.kind === 'headframe' || b.kind === 'choir' || b.kind === 'mothercap' || b.kind === ('survey' as any))) || g.ownB(undefined, true, foe)[0]; if (!fhq) return;
  // the drop point: beside the enemy's home building, on the side away from the road, where the workers are
  const seam = g.ores.filter(n => n.amount > 0 && Math.hypot(n.pos.x - fhq.pos.x, n.pos.z - fhq.pos.z) < 30).sort((a, b) => Math.hypot(a.pos.x - fhq.pos.x, a.pos.z - fhq.pos.z) - Math.hypot(b.pos.x - fhq.pos.x, b.pos.z - fhq.pos.z))[0];
  const x = seam ? (seam.pos.x + fhq.pos.x) / 2 : fhq.pos.x, z = seam ? (seam.pos.z + fhq.pos.z) / 2 : fhq.pos.z;
  V.drop = { ferry, phase: 'load', t: 0, x, z }; V.dropT = now + 240; ferry.order = { type: 'guard', x: ferry.pos.x, z: ferry.pos.z };
}
