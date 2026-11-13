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

/** The teams in a match, in start order. Set by the match setup; a one-on-one has just home and out. */
export const MATCH = { teams: [] as number[] };
/** Every enemy team of a team in this match. */
export const enemiesOf = (team: number) => MATCH.teams.filter(t => isEnemy(team, t));

/** Start spots for a map: the map's own list if it has one, else the two ends (the yard and the far base). */
export function startSpots(map: { starts?: number[][] }, home: [number, number], far: [number, number]): number[][] {
  return map.starts && map.starts.length >= 2 ? map.starts.map(s => [s[0], s[1]]) : [home, far];
}
