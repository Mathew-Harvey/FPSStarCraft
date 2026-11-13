// Scouting. What each side knows about the other is what its own bodies and buildings have looked at: which enemy buildings stand where,
// and from those a guess at how the enemy means to play. On a hidden map nobody is told where the other base is, so a side cannot plan a
// push, or even name the road the enemy is on, until one of its bodies has seen an enemy building.
import type { Game } from './game';
import { MAP, SIDE, FACTION, BLD, UNIT, BKind, Unit, Building, VHOME, atHome, homeXZ, foeOf, fac, isWorker, isFighter, compass } from './data';
import { SIGHT } from './fog';
import { MATCH, multi, isEnemy } from './core/sides';

/** One enemy building as a side last saw it. */
export interface Seen { id: number; kind: BKind; x: number; z: number; built: boolean; /** Match time when it was last in sight. */ t: number }
/** What a building says about its owner's plan. */
const ROLE: Partial<Record<BKind, 'hq' | 'prod' | 'tower' | 'tech'>> = {
  headframe: 'hq', choir: 'hq', mothercap: 'hq', bunkhouse: 'prod', broodpit: 'prod', warren: 'prod',
  watchpost: 'tower', thornspire: 'tower', stinger: 'tower',
  machineshop: 'tech', foundry: 'tech', assay: 'tech', mast: 'tech', wardpylon: 'tech', reedgate: 'tech', quillgarden: 'tech', blisterbed: 'tech', tuskhollow: 'tech', oldgrowth: 'tech',
};
const LOOKOUT = ['Lookout', 'Watcher', 'Rootwatch'];
/** A guess at the enemy's plan, from the buildings a side has seen. */
export interface Read { key: 'none' | 'steady' | 'rush' | 'fort' | 'boom'; short: string; line: string }
const plural = (n: number, name: string) => n === 1 ? (/^[AEIOU]/.test(name) ? 'an ' : 'a ') + name : `${n} ${name}${/s$/.test(name) ? 'es' : 's'}`;
const list = (a: string[]) => a.length < 2 ? a.join('') : a.slice(0, -1).join(', ') + ' and ' + a[a.length - 1];

export class Intel {
  /** Each side has seen an enemy building at least once. Index 0 is the side at the yard, 1 the side at the far end. */
  found = [false, false]; foundT = [0, 0];
  /** Enemy buildings each side knows about, by building id. A record stays until somebody looks at the spot again and finds it gone. */
  seen: Map<number, Seen>[] = [new Map(), new Map()];
  /** Places worth sending a scout, for each side: the far end of every road that leaves its base. */
  spots: { x: number; z: number; seen: boolean; sent: boolean }[][] = [[], []];
  private t = 0; private fresh: Seen[][] = [[], []]; private freshT = [0, 0]; private botT = [40, 40]; private lost = [0, 0];
  constructor(public g: Game) {
    for (const i of [0, 1]) { const [hx, hz] = i ? [VHOME.x, VHOME.z] : [0, 0], [ex, ez] = i ? [0, 0] : [VHOME.x, VHOME.z];
      for (const r of (MAP.roads || []).slice(1)) if (Math.hypot(r[0] - hx, r[1] - hz) < 20) this.spots[i].push({ x: r[2], z: r[3], seen: false, sent: false });
      this.spots[i].push({ x: ex, z: ez, seen: false, sent: false }); }
    // A match of more than two sides keeps a record for each side, in MATCH.teams order (the yard and the far end come first, as before).
    for (let i = 2; i < MATCH.teams.length; i++) { this.found.push(false); this.foundT.push(0); this.seen.push(new Map()); this.spots.push([]); this.fresh.push([]); this.freshT.push(0); this.botT.push(40); this.lost.push(0); }
  }
  ix(team: number) { return multi() ? Math.max(0, MATCH.teams.indexOf(team)) : atHome(team) ? 0 : 1; }
  /** This side knows where to find the enemy. Always true on a map that shows both bases from the start. */
  knows(team: number) { return !MAP.hid || this.found[this.ix(team)]; }
  /** The enemy buildings this side can plan against: every one of them on an open map, the ones it has seen on a hidden map. */
  known(team: number): Building[] { const all = this.g.ownB(undefined, false, foeOf(team)); if (!MAP.hid) return all; const s = this.seen[this.ix(team)]; return all.filter(b => s.has(b.id)); }

  /** A guess at the enemy's plan from what this side has seen. It reads the buildings, never the enemy's own notes. */
  read(team: number): Read {
    const recs = [...this.seen[this.ix(team)].values()]; if (!recs.length) return { key: 'none', short: 'Not seen', line: 'Nobody has seen them yet.' };
    const F = FACTION[foeOf(team)], n = (r: string) => recs.filter(x => ROLE[x.kind] === r).length, hq = n('hq'), prod = n('prod'), tower = n('tower'), tech = n('tech'), at = Math.max(...recs.map(r => r.t));
    const prodName = BLD[fac(foeOf(team)) === 2 ? 'warren' : fac(foeOf(team)) ? 'broodpit' : 'bunkhouse'].name, hqName = BLD[F.hq].name;
    if (hq >= 2) return { key: 'boom', short: 'Expanding', line: `${plural(hq, hqName)}. They are spreading out for ore, so they are thin on fighters for now.` };
    if (tower >= 2 || (tech >= 1 && tower >= 1) || (tech >= 2 && at < 420)) return { key: 'fort', short: 'Digging in', line: `Towers and tech. They are digging in and saving for bigger kit. Expect them late, and heavy.` };
    // Two barracks and nothing else is a rush. The Gloam hatch from their Caps, so for them it is a Warren with no Stinger Stalk and no Garden a few minutes in.
    if ((prod >= 2 || (fac(foeOf(team)) === 2 && prod >= 1 && at > 170)) && !tower && !tech && at < 420) return { key: 'rush', short: 'Early rush', line: `${plural(prod, prodName)} and no towers. That reads like an early rush. Put a tower up.` };
    return { key: 'steady', short: 'Standard', line: 'Nothing unusual. A standard opening so far.' };
  }
  /** The counted list of what this side has seen, largest group first. */
  tally(team: number): [BKind, number][] { const m = new Map<BKind, number>(); for (const r of this.seen[this.ix(team)].values()) m.set(r.kind, (m.get(r.kind) || 0) + 1); return [...m.entries()].sort((a, b) => b[1] - a[1]); }

  update(dt: number) {
    this.t -= dt; if (this.t > 0) return; this.t = .5; const g = this.g, host = !g.net;
    for (const T of multi() ? MATCH.teams : [SIDE.home, SIDE.out]) {
      const i = this.ix(T), foe = foeOf(T), many = multi(), seen = this.seen[i], eyes: number[][] = [];
      for (const u of g.units) if (u.alive && u.team === T) eyes.push([u.pos.x, u.pos.z, SIGHT[u.kind] || 30]);
      for (const b of g.buildings) if (b.alive && b.team === T) eyes.push([b.pos.x, b.pos.z, SIGHT[b.kind] || (b.built ? 26 : 14)]);
      const sees = (x: number, z: number, pad = 0) => eyes.some(e => (e[0] - x) ** 2 + (e[1] - z) ** 2 <= (e[2] + pad) ** 2);
      for (const s of this.spots[i]) if (!s.seen && sees(s.x, s.z)) s.seen = true;
      const live = new Set<number>();
      for (const b of g.buildings) { if ((many ? !isEnemy(T, b.team) : b.team !== foe) || !b.alive) continue; live.add(b.id); if (!sees(b.pos.x, b.pos.z)) continue;
        let r = seen.get(b.id); if (!r) { r = { id: b.id, kind: b.kind, x: b.pos.x, z: b.pos.z, built: b.built, t: g.time }; seen.set(b.id, r); this.fresh[i].push(r); if (!this.freshT[i]) this.freshT[i] = g.time + 5; } r.built = b.built; r.t = g.time; }
      for (const [id, r] of seen) if (!live.has(id) && sees(r.x, r.z, -4)) seen.delete(id);
      if (!this.found[i] && seen.size) { this.found[i] = true; this.foundT[i] = g.time; if (host && MAP.hid) this.announce(T); }
      // One line for each walk past their base: what is new, and what it says about their plan.
      if (this.freshT[i] && g.time >= this.freshT[i]) { const news = this.fresh[i]; this.fresh[i] = []; this.freshT[i] = 0;
        if (host && g.human[T] && !g.mission) { const m = new Map<BKind, number>(); for (const r of news) m.set(r.kind, (m.get(r.kind) || 0) + 1); const what = list([...m.entries()].map(([k, c]) => plural(c, BLD[k].name)));
          g.feed('Scout', `I can see ${what}. ${this.read(T).line}`, 'in', T); } }
      if (host && MAP.hid && !g.human[T] && g.eco) this.bot(T, dt);
    }
  }
  /** The moment a side first sees the other: its own lookout calls the bearing, and the side that was seen is told it has company. */
  private announce(T: number) {
    const g = this.g, i = this.ix(T), first = [...this.seen[i].values()][0], [hx, hz] = homeXZ(T), d = Math.round(Math.hypot(first.x - hx, first.z - hz) / 10) * 10, foe = foeOf(T), them = FACTION[foe].short;
    g.feed(LOOKOUT[fac(T)], `Found them. The ${them} are ${d} metres to the ${compass(first.x - hx, first.z - hz)}. It is on the map now.`, 'in', T);
    g.feed(LOOKOUT[fac(foe)], `We have been seen. ${foe % 3 === T % 3 ? 'A stranger' : fac(T) === 0 ? 'An Ironhold scout' : fac(T) === 1 ? 'A Veyl scout' : 'A Gloam scout'} had a good look at us. They know where we are now.`, 'al', foe);
  }
  /** A side nobody plays sends its own scouts until it has found the enemy. If it never does, word reaches it anyway, so no match stalls. */
  private bot(T: number, dt: number) {
    const g = this.g, i = this.ix(T); this.botT[i] -= .5;
    const blind = !this.known(T).length && g.ownB(undefined, false, foeOf(T)).length > 0; this.lost[i] = blind ? this.lost[i] + .5 : 0;
    if (blind && (g.time > 540 || (this.found[i] && this.lost[i] > 150))) { for (const b of g.ownB(FACTION[foeOf(T)].hq, false, foeOf(T))) this.seen[i].set(b.id, { id: b.id, kind: b.kind, x: b.pos.x, z: b.pos.z, built: b.built, t: g.time }); return; }
    // Up to three out at once, each down a different road: one at a time took a bot six minutes to try five roads.
    if (blind && this.botT[i] <= 0 && g.units.filter(u => u.alive && u.team === T && u.order.type === 'scout').length < 3) { this.botT[i] = 25; this.send(T, null); }
  }

  /** Sends one body to look: down a road nobody has walked yet, or round the enemy base once it is known. Returns the body, or null if nobody can go. */
  send(T: number, lead: Unit | null): Unit | null {
    const g = this.g, i = this.ix(T), free = g.units.filter(u => u.alive && u.team === T && u !== lead && u !== g.me && !u.pilot && u.order.type !== 'scout' && u.kind !== 'gantry' && u.kind !== 'warden' && u.kind !== 'mulcher');
    const idle = free.filter(u => isFighter(u) && u.order.type === 'guard' && !u.target), hands = free.filter(u => isWorker(u.kind) && !u.site);
    const u = idle.sort((a, b) => UNIT[b.kind].speed - UNIT[a.kind].speed)[0] || hands.sort((a, b) => a.carrying - b.carrying)[0]; if (!u) return null;
    const known = this.known(T), [hx, hz] = homeXZ(T);
    if (known.length) { const cx = known.reduce((a, b) => a + b.pos.x, 0) / known.length, cz = known.reduce((a, b) => a + b.pos.z, 0) / known.length; u.order = { type: 'scout', x: hx, z: hz, path: this.ring(cx, cz, u.pos.x, u.pos.z), back: true, loop: true }; }
    else { let open = this.spots[i].filter(s => !s.seen && !s.sent); if (!open.length) { for (const s of this.spots[i]) s.sent = false; open = this.spots[i].filter(s => !s.seen); } if (!open.length) open = this.spots[i];
      const s = open[Math.floor(Math.random() * open.length)]; s.sent = true; u.order = { type: 'scout', x: s.x, z: s.z }; }
    u.target = null; if (isWorker(u.kind)) { u.state = 'idle'; u.node = null; } return u;
  }
  /** A walk round a spot, 40 metres out, starting on the side nearest the walker. */
  private ring(cx: number, cz: number, fx: number, fz: number) { const a0 = Math.atan2(fz - cz, fx - cx), out: number[][] = []; for (let k = 0; k < 6; k++) { const a = a0 + k / 6 * 6.2832; out.push([cx + Math.cos(a) * 40, cz + Math.sin(a) * 40]); } return out; }
  /** Walks a scout: out to its spot, once round anything it finds, and home again. It does not stop to fight, and it turns back if it is badly hurt. */
  walk(u: Unit, dt: number) {
    const g = this.g, o = u.order, i = this.ix(u.team), [hx, hz] = homeXZ(u.team); u.target = null;
    if (!o.loop && this.seen[i].size) { let near: Seen | null = null, nd = 60; for (const r of this.seen[i].values()) { const d = Math.hypot(r.x - u.pos.x, r.z - u.pos.z); if (d < nd) { nd = d; near = r; } }
      if (near) { o.loop = true; o.back = true; o.path = this.ring(near.x, near.z, u.pos.x, u.pos.z); o.x = hx; o.z = hz; } }
    if (!o.fled && u.hp < u.maxHp * .4) { o.fled = true; o.loop = true; o.back = true; o.path = []; o.x = hx; o.z = hz; }
    if (!g.advance(u, dt, o.back ? 14 : 5, 1.12)) return;
    if (!o.back) { o.back = true; o.x = hx; o.z = hz; return; }
    if (isWorker(u.kind)) { u.order = { type: 'guard', x: u.pos.x, z: u.pos.z }; u.state = u.carrying > 0 ? 'toHQ' : 'idle'; } else g.dir.enlist(u);
  }
}
