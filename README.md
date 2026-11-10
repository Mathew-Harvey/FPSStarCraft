# Ore Else (working title)

A first-person RTS for the browser. You start as a single worker with a drill, build a base and an army, and can jump into any unit you own while AI teammates run recognisable RTS plans and call them out. Comic-ink visuals, chunky cartoon units.

![Holding the road against a Warden](docs/screenshots/push.jpg)

## Play it

```
npm install
npm run dev      # http://localhost:5173, rebuilds on every reload
npm run build    # type-checks and writes dist/index.html, a single self-contained file
```

Needs a keyboard and mouse. `dist/index.html` can be opened straight from disk or hosted anywhere.

## What is in the game

One skirmish as the Ironhold Charter against a Veyl outpost. Smash the three Choir Stones down the east road before the Veyl flatten your Headframe. A match runs ten to twenty minutes, and the day turns to sunset while you play.

**Your side, the Ironhold Charter**

- **Rigger**: drill ore by hand, place buildings, weld them up faster, patch damage.
- **Linesman**: rifle with a 24-round magazine, aim-down-sights, headshot crits and a grenade on a cooldown.
- **Breacher**: scattergun and a riot shield. Hold right-click to brace behind the shield, click while braced to bash.
- **Buildings**: Bunkhouse (trains soldiers), Depot (beds, and a place to heal), Watchpost (gun tower), Machine Shop (unlocks Breachers, sells Hollow Points and Plating).

**Their side, the Veyl Chorus**

- **Cantor**: shielded melee raider that dashes in.
- **Lancer**: keeps its distance and fires slow bolts you can sidestep.
- **Warden**: a boss that wakes when the first Stone falls and later walks with the raids. Stay out of the pink ring.
- **Reed Gate**: where their reinforcements arrive. Knock it down and the raids shrink.

**What makes it a first-person RTS**

- **Jump**: hold `Tab` for the slowed-down overview and pick a body, press `F` on a unit you are looking at, or `Q` to go back to your last body. If your body dies you drop into the nearest one.
- **Quartermaster**: an AI that runs the economy for you (build order, supply, upgrades, training). `G` turns it off if you want to do it yourself.
- **Squad plans**: Alpha squad pitches a plan when it has the numbers: Yard Push down the road, Back Door round the north ridge, or Last Shift when one Stone is left. `Z` agrees, `C` picks the other route, `X` holds, `V` makes them follow you, middle click sends them somewhere.
- **Raids**: the Veyl hit your base in growing waves from the east road or the north ridge, with a fifteen second warning.
- Three difficulty levels, an adaptive synthesised soundtrack, and mouse and volume settings on the pause screen.

| Key | Action |
| --- | --- |
| `WASD`, `Shift`, `Space` | Move, sprint, dash |
| Click | Drill, weld, shoot |
| Right-click | Aim the rifle, raise the shield |
| `C` | Grenade (Linesman) |
| `1` `2` | Drill, build menu (wheel to pick, `R` to rotate) |
| `E` `T` | Train or buy upgrades at the building you are looking at |
| `Tab` `F` `Q` | Jump |
| `Z` `C` `X` `V`, middle click | Squad plans and orders |
| `G` | Quartermaster on or off |
| `Esc` | Pause and settings |

![Jump overview](docs/screenshots/jump.jpg)

![The cast: Warden, Lancer, Cantor, Breacher, Linesman, Rigger](docs/screenshots/lineup.jpg)

![Pushing the outpost at sunset](docs/screenshots/dusk.jpg)

## How it is built

TypeScript and three.js, bundled by esbuild into one HTML file. No art or sound assets: models are built from primitives, textures are painted on canvases at boot, and sound is synthesised.

- `src/gfx.ts`: the comic-ink renderer. Toon shading with hatched shadows, a real shadow map, and a post pass that inks outlines from depth and normals.
- `src/models.ts`: units, structures, the world and first-person view-models. Models are merged per material when built, and units are cloned from a cached prototype.
- `src/data.ts`: stat tables, shared types and map constants.
- `src/game.ts`: the simulation and the player. Entities, combat, effects, the first-person bodies and jumping between them.
- `src/director.ts`: the strategy layer. The Quartermaster, the Veyl raid planner, squad playbooks, callouts and chatter.
- `src/hud.ts`, `src/style.css`, `src/page.html`: the HUD and menus.
- `src/audio.ts`: sound effects, voices and the step-sequenced music.

## Design

- [Game design document](docs/design/GAME_DESIGN.md)
- [Look test](docs/design/mockups/index.html): the mockup scenes the renderer was developed against.

Not in yet: playing as the Veyl, Flux as a second resource, more maps, and multiplayer.
