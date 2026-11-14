// The page's entry. It fetches the art files a published page needs for its first match (src/artfiles.ts: the factions the player last
// played) with a bar showing how much has come, then starts the game (src/main.ts). esbuild keeps main.ts and everything it pulls in
// unrun until the import below, so no model is asked for before its bytes are here. A page with the art inside it (INLINE=1) has no files
// to fetch and starts at once. Other factions' art is fetched when a match needs it (src/artgate.ts).
import { loadArt, artAll, artState, artFor, artHas } from './artfiles';
import { firstLoad, hideBar } from './artgate';

Object.assign(window as any, { __oreArt: artState, __oreArtFor: artFor, __oreArtHas: artHas });
// ?art=all fetches every faction's art before the game starts, so a test can start any match at once.
const all = /[?&]art=all\b/.test(location.search);
firstLoad(p => all ? artAll(p) : loadArt(p)).then(() => import('./main')).then(hideBar);
