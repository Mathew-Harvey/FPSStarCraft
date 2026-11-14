// Made maps as short codes, and the fairness check every made map has to pass before it can be saved. No page here: the match server uses this
// too, to load a lobby's made map and to turn away a code that is broken or unfair.
//
// A code is the plan (see Plan in terrain.ts) packed into bytes and written in URL-safe base64, behind the letter M: the map and size it is built
// on, where the far base stands, then each piece as its kind and its numbers in half metres. A piece is placed once; the other end gets the same
// piece turned round the middle of the map, so a made map is fair by symmetry before anything else is checked.
import { MADE, PK, TER, type Plan, zone, reachable, segD, PAINTS } from './terrain';
import { MAP, MAPS, SIZES, VHOME, setMap, mapCode, swapEnd } from './data';

/** How many numbers follow each kind of piece. */
const ARGS = [5, 4, 3, 2, 2, 2, 4, 3, 4];
export const PIECE_NAMES = ['Ledge', 'Ridge', 'Island', 'Ramp', 'Flux vent', 'Survey Beacon', 'Rock wall', 'Ore field', 'Paint'];
/** The most pieces one map holds, so a code stays short enough to paste in a chat. */
export const MAX_PIECES = 160;

const b64 = (bytes: number[]) => { let s = ''; for (const b of bytes) s += String.fromCharCode(b); return (typeof btoa === 'function' ? btoa(s) : Buffer.from(s, 'binary').toString('base64')).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); };
const unb64 = (t: string) => { const s = t.replace(/-/g, '+').replace(/_/g, '/'); const raw = typeof atob === 'function' ? atob(s) : Buffer.from(s, 'base64').toString('binary'); return Array.from(raw, c => c.charCodeAt(0)); };

/** The short code for a plan. */
export function planCode(P: Plan): string {
  const out: number[] = [1, P.b, P.s], i16 = (v: number) => { const n = Math.max(-32768, Math.min(32767, Math.round(v * 2))) & 0xffff; out.push(n >> 8, n & 255); };
  i16(P.out[0]); i16(P.out[1]); const items = P.items.slice(0, MAX_PIECES); out.push(items.length);
  for (const it of items) { out.push(it[0]); for (let j = 0; j < ARGS[it[0]]; j++) i16(it[1 + j] ?? 0); }
  return 'M' + b64(out);
}
/** The plan in a short code, or null if the code is not one. */
export function parsePlan(code: string): Plan | null {
  try {
    if (typeof code !== 'string' || code[0] !== 'M' || code.length > 2400) return null; const B = unb64(code.slice(1)); let p = 0;
    const u8 = () => { if (p >= B.length) throw 0; return B[p++]; }, i16 = () => { const hi = u8(), lo = u8(); let n = (hi << 8) | lo; if (n >= 32768) n -= 65536; return n / 2; };
    if (u8() !== 1) return null; const b = u8(), s = u8(); if (b >= MAPS.length || MAPS[b].set || MAPS[b].ring || s >= SIZES.length) return null;
    const out: [number, number] = [i16(), i16()], n = u8(), items: number[][] = [];
    for (let i = 0; i < n; i++) { const k = u8(); if (k >= ARGS.length) return null; const it = [k]; for (let j = 0; j < ARGS[k]; j++) it.push(i16()); items.push(it); }
    return p === B.length ? { b, s, out, items } : null;
  } catch { return null; }
}
/** Puts a made map in use (or none). The next setMap on its map and size lays it out. */
export function usePlan(code: string | null | undefined): Plan | null {
  const P = code ? parsePlan(code) : null; MADE.plan = P; MADE.code = P ? code! : ''; return P;
}
/** The map code a plan plays on. */
export const planMap = (P: Plan) => mapCode(P.b, P.s);

/** A new plan: the map's own far base, a field near each end, a ledge with a ramp, and a beacon in the middle. */
export function starterPlan(b = 2, s = 0): Plan {
  const keep = { plan: MADE.plan, code: MADE.code }; MADE.plan = null; setMap(mapCode(b, s)); const out: [number, number] = [Math.round(MAP.out[0]), Math.round(MAP.out[1])];
  const [mx, mz] = [VHOME.x / 2, VHOME.z / 2], l = Math.hypot(out[0], out[1]), ux = out[0] / l, uz = out[1] / l, px = -uz, pz = ux, k = MAP.k;
  const r = (v: number) => Math.round(v);
  const P: Plan = { b, s, out, items: [
    [PK.field, r(ux * 40 * k + px * 45 * k), r(uz * 40 * k + pz * 45 * k), 0],
    [PK.field, r(mx + px * 70 * k), r(mz + pz * 70 * k), 1],
    [PK.ledge, r(mx - px * 30 * k - ux * 8), r(mz - pz * 30 * k - uz * 8), r(mx - px * 30 * k + ux * 8), r(mz - pz * 30 * k + uz * 8), 8],
    [PK.ramp, r(mx - px * 30 * k + px * 10), r(mz - pz * 30 * k + pz * 10)],
    [PK.beacon, r(mx), r(mz)],
    [PK.vent, r(ux * 40 * k + px * 45 * k + 12), r(uz * 40 * k + pz * 45 * k + 10)],
  ] };
  MADE.plan = keep.plan; MADE.code = keep.code; return P;
}

export interface Verdict { ok: boolean; problems: string[]; notes: string[] }
/** Lays the plan out and checks it is a fair, playable map. Problems stop it being saved; notes are worth knowing but allowed. Leaves the plan in use. */
export function checkPlan(P: Plan): Verdict {
  const problems: string[] = [], notes: string[] = [], code = planCode(P); usePlan(code); setMap(planMap(P));
  const [mx, mz] = MAP.mid!, rad = MAP.rad!, H = [[0, 0], [VHOME.x, VHOME.z]], name = (k: number) => PIECE_NAMES[k].toLowerCase();
  const span = Math.hypot(VHOME.x, VHOME.z);
  if (span < 120 * MAP.k) problems.push(`The bases are ${Math.round(span)} m apart. Put the far base at least ${Math.round(120 * MAP.k)} m from the yard.`);
  if (Math.hypot(VHOME.x - mx, VHOME.z - mz) > rad - 30) problems.push('The far base is too near the edge of the world.');
  if (P.items.length > MAX_PIECES) problems.push(`There are ${P.items.length} pieces. The most a map can hold is ${MAX_PIECES}.`);
  for (const it of P.items) { const [k, x, z] = it; if (Math.hypot(x - mx, z - mz) > rad - 12) { problems.push(`A ${name(k)} is off the edge of the world.`); break; } }
  // Room to build at both ends.
  for (const [i, [hx, hz]] of H.entries()) { const who = i ? 'far base' : 'yard';
    if (TER.ridges.some(R => segD(hx, hz, R.ax, R.az, R.bx, R.bz) < R.r + 30)) problems.push(`High ground stands within 30 m of the ${who}. Leave room to build.`);
    if (TER.walls.some(w => Math.hypot(w[0] - hx, w[1] - hz) < 24)) problems.push(`A rock wall stands within 24 m of the ${who}.`);
    if ((MAP.sites || []).some(s => Math.hypot(s[0] - hx, s[1] - hz) < 30)) problems.push(`An ore field sits within 30 m of the ${who}. The base has its own ore already.`); }
  // Everyone can walk to the other base, and to every field that is not on an island (through a rock wall once it is broken).
  if (!reachable(0, 0, VHOME.x, VHOME.z, false)) problems.push('Nobody can walk from the yard to the far base. Open a way through.');
  const sites = MAP.sites || []; let air = 0;
  sites.forEach(([x, z]) => { const zn = zone(x, z), isl = zn >= 0 && TER.ridges.some(R => R.island && R.group === zn); if (isl) { air++; return; }
    if (!reachable(0, 0, x, z, false) || !reachable(VHOME.x, VHOME.z, x, z, false)) problems.push(`The ore field at ${Math.round(x)}, ${Math.round(z)} cannot be walked to. Give its high ground a ramp, or move it.`); });
  if (sites.length - air < 2) problems.push('Place at least one ore field for each side to walk to.');
  if (air) notes.push(`${air} ore field${air > 1 ? 's sit' : ' sits'} on an island: only flyers and Gloam tunnels reach ${air > 1 ? 'them' : 'it'}.`);
  // Pieces that did not take.
  const ramps = P.items.filter(i => i[0] === PK.ramp).length, laid = TER.ridges.reduce((a, R) => a + R.ramps.length, 0), want = TER.ridges.filter(R => !R.island).length;
  if (laid < ramps * (TER.ridges.length ? 1 : 0) && ramps) notes.push('A ramp placed too far from any high ground was left out.');
  const bare = TER.ridges.filter(R => !R.island && !(R.ramps.length || TER.ridges.some(Q => Q !== R && Q.group === R.group && Q.ramps.length))).length;
  if (bare && want) notes.push(`${bare} piece${bare > 1 ? 's' : ''} of high ground ${bare > 1 ? 'have' : 'has'} no ramp: nobody on foot gets up there.`);
  // Fair: the walk from each base to the fields matches.
  const walk = (hx: number, hz: number) => sites.map(([x, z]) => Math.hypot(x - hx, z - hz)).sort((a, b) => a - b), w0 = walk(0, 0), w1 = walk(VHOME.x, VHOME.z);
  if (w0.some((d, i) => Math.abs(d - w1[i]) > 1.5)) problems.push('The fields are not the same walk from both bases. Move the piece that sits on the middle.');
  for (const v of TER.vents) if (!TER.vents.some(w => Math.hypot(w[0] - swapEnd(v[0], v[1])[0], w[1] - swapEnd(v[0], v[1])[1]) < .6)) { problems.push('A vent has no twin at the other end.'); break; }
  if (!TER.paint.every(p => p[3] < PAINTS.length)) problems.push('Unknown ground paint.');
  return { ok: !problems.length, problems, notes };
}
