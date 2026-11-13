// Who fights whom. Up to eight sides share a map. A team number still names a faction (team % 3) and which copy of it (team / 3), so a
// one-on-one match keeps the teams it always had (home and out, 0 to 5) and everything below gives the same answers as before.
// Allies are sides on the same alliance number; a free-for-all puts every side on its own.

/** Most sides in one match. */
export const MAX_SIDES = 8;
/** Every team number one match can use: three factions times eight copies. */
export const TEAM_SLOTS = 3 * MAX_SIDES;

/** The alliance each team is on. Unset means its own (every team fights every other). */
export const ALLY: number[] = [];
/** Sets the alliances: a list of teams per alliance, e.g. [[0, 4], [1, 5]] for two against two. Pass [] for everyone on their own. */
export function setAlliances(groups: number[][]) { ALLY.length = 0; groups.forEach((g, i) => { for (const t of g) ALLY[t] = i; }); }
const allyOf = (t: number) => ALLY[t] ?? -1 - t;

/** Are two teams at war? A team is never its own enemy; teams on one alliance are friends. */
export const isEnemy = (a: number, b: number) => a !== b && allyOf(a) !== allyOf(b);
export const isFriend = (a: number, b: number) => !isEnemy(a, b);

/** The sides of a match with more than two. `teams` lists every team in the match and `at` the start spot each one holds (same order).
 *  `n` is how many start spots the map has. `foe` is the enemy each side is going after right now (the Director picks it; foeOf reads it).
 *  A match with one or two sides leaves `teams` empty, and every rule runs exactly as a one-on-one always did. */
export const MATCH = { teams: [] as number[], at: [] as number[], n: 2, foe: [] as number[] };
/** More than two sides on the map? */
export const multi = () => MATCH.teams.length > 2;
/** Sets up a match of more than two sides: teams and the start spot each holds, the map's start count, and who is allied with whom
 *  (a list of teams per alliance; [] for a free-for-all). The first team must hold start 0 and the second the start opposite it. */
export function setMatch(teams: number[], at: number[], n: number, groups: number[][]) {
  MATCH.teams = teams.slice(); MATCH.at = at.slice(); MATCH.n = n; MATCH.foe = []; setAlliances(groups.length ? groups : teams.map(t => [t]));
}
/** Back to a plain one-on-one. */
export function clearMatch() { MATCH.teams = []; MATCH.at = []; MATCH.n = 2; MATCH.foe = []; ALLY.length = 0; }
/** The start spot a team holds in a match of more than two sides (-1 if it is not in the match). */
export const startOf = (team: number) => { const i = MATCH.teams.indexOf(team); return i < 0 ? -1 : MATCH.at[i]; };
/** Every enemy team of a team in this match. */
export const enemiesOf = (team: number) => MATCH.teams.filter(t => isEnemy(team, t));
/** Every friendly team (itself included). */
export const friendsOf = (team: number) => MATCH.teams.length ? MATCH.teams.filter(t => !isEnemy(team, t)) : [team];

/** Start spots for a map: the map's own list if it has one, else the two ends (the yard and the far base). */
export function startSpots(map: { starts?: number[][] }, home: [number, number], far: [number, number]): number[][] {
  return map.starts && map.starts.length >= 2 ? map.starts.map(s => [s[0], s[1]]) : [home, far];
}
