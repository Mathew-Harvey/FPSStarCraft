// Build plans. A side nobody plays picks one of these at the start of a match on a hidden map, and its brain (the Quartermaster, the Conductor or
// the Overgrowth) leans that way for the whole match: how many towers, how soon a second barracks or a second base, how big a squad before it
// marches. The numbers shift the thresholds the brains already use, so "steady" is exactly the brain as it was.
export interface Doctrine {
  key: 'steady' | 'rush' | 'fort' | 'boom'; name: string;
  /** Towers on top of what the brain would build anyway. */ towers: number;
  /** Seconds into the match before a second barracks. */ prodT: number;
  /** Seconds before a second base is wanted, and how much smaller or larger an army it waits for. */ expT: number; expArmy: number;
  /** Added to the army size each tech building waits for. */ tech: number;
  /** Added to the squad size a push musters, and to the seconds before the first push is planned. */ need: number; first: number;
  /** Extra workers at the home base. */ crew: number;
}
export const DOCTRINES: Doctrine[] = [
  { key: 'steady', name: 'Standard opening', towers: 0, prodT: 230, expT: 480, expArmy: 0, tech: 0, need: 0, first: 0, crew: 0 },
  { key: 'rush', name: 'Early rush', towers: -9, prodT: 95, expT: 900, expArmy: 4, tech: 4, need: -2, first: -25, crew: -1 },
  { key: 'fort', name: 'Dig in and tech up', towers: 2, prodT: 330, expT: 600, expArmy: 0, tech: -2, need: 3, first: 150, crew: 0 },
  { key: 'boom', name: 'Second base early', towers: 0, prodT: 280, expT: 140, expArmy: -4, tech: 1, need: 2, first: 170, crew: 2 },
];
