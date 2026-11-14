// Ratings for ranked one-on-one matches: Glicko-2 (Mark Glickman, 2012), one game per rating period.
// A rating says how strong a player is (r, starting at 1500), how sure the number is (rd, the rating deviation: 350 for a new player,
// shrinking as they play) and how steady their results are (vol). The number shown to players is the rating itself, rounded; a rating
// with rd over PROVISIONAL is marked as not settled yet.
// Seasons: a season is SEASON_DAYS long, counted from SEASON_ZERO. When a new season starts every rating is pulled halfway back to 1500
// and its rd is raised, so old results count for less and everybody has something to play for.

export interface Rating { r: number; rd: number; vol: number }
export const START: Rating = { r: 1500, rd: 350, vol: .06 };
/** How fast vol can change: the system constant tau. 0.5 is the middle of the range Glickman suggests. */
const TAU = .5, SCALE = 173.7178, EPS = 1e-6;
/** A rating whose rd is above this is shown as provisional. */
export const PROVISIONAL = 110;

const g = (phi: number) => 1 / Math.sqrt(1 + 3 * phi * phi / (Math.PI * Math.PI));
const E = (mu: number, mu2: number, phi2: number) => 1 / (1 + Math.exp(-g(phi2) * (mu - mu2)));
/** The chance that `a` beats `b`, from 0 to 1. */
export function expected(a: Rating, b: Rating) { return E((a.r - 1500) / SCALE, (b.r - 1500) / SCALE, Math.hypot(a.rd, b.rd) / SCALE); }

/** A rating after one game against `foe`. `score` is 1 for a win, 0 for a loss, .5 for a draw. */
export function rate(me: Rating, foe: Rating, score: number): Rating {
  const mu = (me.r - 1500) / SCALE, phi = me.rd / SCALE, mu2 = (foe.r - 1500) / SCALE, phi2 = foe.rd / SCALE;
  const gg = g(phi2), e = E(mu, mu2, phi2), v = 1 / (gg * gg * e * (1 - e)), delta = v * gg * (score - e);
  // the new volatility (step 5 of the paper, the Illinois method)
  const a = Math.log(me.vol * me.vol), f = (x: number) => { const ex = Math.exp(x); return ex * (delta * delta - phi * phi - v - ex) / (2 * (phi * phi + v + ex) ** 2) - (x - a) / (TAU * TAU); };
  let A = a, B: number; if (delta * delta > phi * phi + v) B = Math.log(delta * delta - phi * phi - v); else { let k = 1; while (f(a - k * TAU) < 0) k++; B = a - k * TAU; }
  let fA = f(A), fB = f(B);
  for (let i = 0; i < 100 && Math.abs(B - A) > EPS; i++) { const C = A + (A - B) * fA / (fB - fA), fC = f(C); if (fC * fB <= 0) { A = B; fA = fB; } else fA /= 2; B = C; fB = fC; }
  const vol = Math.exp(A / 2), phiStar = Math.sqrt(phi * phi + vol * vol), phiNew = 1 / Math.sqrt(1 / (phiStar * phiStar) + 1 / v), muNew = mu + phiNew * phiNew * gg * (score - e);
  return { r: muNew * SCALE + 1500, rd: Math.min(350, phiNew * SCALE), vol };
}
/** A rating after time away: rd grows back towards 350, one rating period for each `days` of no games (at most a year's worth). */
export function rest(me: Rating, days: number, periodDays = 7): Rating {
  const n = Math.min(52, Math.max(0, Math.floor(days / periodDays))); if (!n) return me;
  const phi = me.rd / SCALE; return { ...me, rd: Math.min(350, Math.sqrt(phi * phi + n * me.vol * me.vol) * SCALE) };
}

// ---------------------------------------------------------------- seasons
export const SEASON_DAYS = 56;
/** The first day of season 1. */
export const SEASON_ZERO = Date.UTC(2026, 10, 1);
export function seasonOf(t: number) { return Math.max(1, Math.floor((t - SEASON_ZERO) / (SEASON_DAYS * 864e5)) + 1); }
export function seasonEnds(season: number) { return SEASON_ZERO + season * SEASON_DAYS * 864e5; }
/** A rating carried into a new season: halfway back to 1500, and less sure. */
export function carry(me: Rating): Rating { return { r: 1500 + (me.r - 1500) / 2, rd: Math.max(me.rd, 200), vol: .06 }; }
