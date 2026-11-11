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
- **Gantry**: a two-legged walker from the Foundry with a cannon on each side. Click fires explosive shells, `C` stomps and throws everything nearby off its feet.
- **Longshot**: sniper from the Bunkhouse once a Foundry stands. Hold right-click for the scope; a head shot drops most things.
- **Patch**: medic from the Bunkhouse once a Machine Shop stands. Mends the most hurt ally nearby on their own; as the Patch, `C` tops up everyone around you.
- **Everything breaks**: all 339 pieces of scenery inside the map take damage, from fuel drums (which explode and set each other off) and crates to rock spires, the road arch, buttes and the enemy brood domes. Big rocks crumble in stages. Rubble is simulated: chunks fall, bounce, tumble, pile up against walls, get thrown by blasts and kicked when you walk through them. The Rigger's drill works on rock too. Building health follows classic RTS proportions (a production building takes a rifleman about 100 seconds).
- **Buildings and tech tree**:
  1. Headframe trains Riggers. Bunkhouse trains Linesmen. Depot adds beds. Watchpost is a gun tower.
  2. Machine Shop (needs a Bunkhouse) unlocks Breachers and Patches and sells Hollow Points and Plating.
  3. Foundry (needs a Machine Shop) unlocks Longshots, builds Gantry walkers and sells Tungsten Core and Reactive Plating.

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

![From the Gantry's cockpit](docs/screenshots/gantry.jpg)

## How it is built

TypeScript and three.js, bundled by esbuild into one HTML file. No art or sound assets: models are sculpted in code, textures are inked and painted on canvases at boot, and sound is synthesised.

- `src/gfx.ts`: the comic-ink renderer. Three flat tones with hatching only where a pen would put it, a real shadow map, and a post pass that inks outlines from depth and normals: heavy on silhouettes, lighter on creases, with pen pressure along the line.
- `src/sculpt.ts`: the sculpting kit. Lathed, swept, pressed and bevelled forms with smooth shading, so the only hard lines are deliberate creases.
- `src/skins.ts`: the hand-inked skins. Brushed colour, tapered pen strokes, edge wear, hatching, seams, rivets and stencils, in cuts for boxes, turned forms and domes.
- `src/units.ts`: the cast, for both sides.
- `src/models.ts`: structures, the world, first-person view-models and the unit atlas. Models are merged per material when built, and units are cloned from a cached prototype.
- `src/data.ts`: stat tables, shared types and map constants.
- `src/game.ts`: the simulation and the player. Entities, combat, effects, the first-person bodies and jumping between them.
- `src/director.ts`: the strategy layer. The Quartermaster, the Veyl raid planner, squad playbooks, callouts and chatter.
- `src/hud.ts`, `src/style.css`, `src/page.html`: the HUD and menus.
- `src/audio.ts`: sound effects, voices and the step-sequenced music.

## Design

- [Game design document](docs/design/GAME_DESIGN.md)
- [Look test](docs/design/mockups/index.html): the mockup scenes the renderer was developed against.

Not in yet: playing as the Veyl, Flux as a second resource, more maps, and multiplayer.

## The Veyl base

The outpost is a working base, not a row of targets. Two **Brood Pits** hatch every raid, so caving one in thins the raids and losing both leaves scraps. **Thorn Spires** shoot anything that walks up the road. A **Ward Pylon** cuts damage to every Veyl building near it until you knock it down. Buildings crack and sag at two damage states, then tall ones topple over and crush whatever is under them while wide ones cave in. Rubble piles up and blasts leave craters.

![A Choir Stone toppling](docs/screenshots/topple.jpg)

Veyl Lancers use the scenery. Between shots a Lancer ducks behind the nearest rock or pillar and leans out to fire, and squad fire aimed at it from the far side mostly chews up the rock instead. Shoot the cover away, flank it, or drive a body round the side yourself.

## Maps

Pick one on the menu. **Needle's Eye** is the original road east. **Switchback** is a tight canyon at sunset with a long flank. **Glass Flats** is open salt pan with almost no cover.

![Switchback](docs/screenshots/switchback.jpg)
![Glass Flats](docs/screenshots/glassflats.jpg)

## Campaign

Five jobs teach the game one system at a time and finishing the last one unlocks multiplayer. Progress is saved in the browser, and returning players can skip straight to the unlock.

| Job | Teaches | Goal |
| --- | --- | --- |
| 1. First Shift | Moving, drilling, jumping bodies | Bank 250 ore and see off a probe |
| 2. Payroll | Building, training, holding a line | Raise four Linesmen and hold through three raids |
| 3. Tools of the Trade | Machine Shop, upgrades, squad orders | Break the Reed Gate |
| 4. Heavy Metal | Foundry, Gantry, wrecking the map | Drop the Needle's Eye and cave in a Brood Pit |
| 5. Ore Else | Everything, on Switchback | Level the whole Veyl base |

![Campaign menu](docs/screenshots/campaign.jpg)

## Multiplayer

![Lobby](docs/screenshots/lobby.jpg)
![Co-op](docs/screenshots/coop.jpg)

Co-op for up to four players. Everyone shares one Ironhold base and fights the Veyl together, each driving their own body. Jump into any body nobody else is driving. The raids grow with the size of the crew.

Finish campaign job two to unlock the Multiplayer tab. One player creates a lobby and reads out the five-letter code, the others join with it, the crew readies up and the host clocks everyone in.

In a match, press B to ping the spot you are looking at and Enter to type to the crew. A panel on the right shows who is driving what, with kills and ore mined. If someone drops, or turns up late, they join the running match with the same code.

![Versus](docs/screenshots/versus.jpg)

**Versus.** In the lobby, up to two players can press Play as the Veyl. They wake up inside Veyl bodies at the outpost: the Cantor fights with blades, the Lancer fires one long beam, and the Warden slams the ground. Veyl players jump between Veyl bodies the same way, press G to call the next raid early, and win by breaking the Headframe. The Chorus still breeds and marches on its own, so the Veyl players are its champions, not its whole army. `node test/versus.mjs` plays one of each side against the other.

Multiplayer needs the game server, because the server runs the match and every player's browser is a window onto it. The server also serves the game page, so there is only one thing to host.

```
npm install
npm run build
npm start          # http://localhost:8080
```

To put it on the internet, deploy the `Dockerfile` to any host that supports WebSockets. `render.yaml` is a ready blueprint for Render. The server listens on `PORT` (default 8080) and answers `/healthz`. Players open the server's address and the lobby connects on its own.

`npm test` starts a local server, joins two headless browsers to one lobby and checks that both see the same match (needs Playwright with Chromium).

How it works: the server runs the same game code as single player at 30 ticks a second and sends every client a snapshot 15 times a second, about 1 KB each. Each client moves and aims its own body, reports its hits, and the server decides health, ore, building, training and the enemy.

## Split screen

Two players on one machine share one Ironhold yard. Pick a map and a shift on the Skirmish tab, choose side by side or stacked, and press Split screen. No server is needed.

- Player one keeps the keyboard and mouse.
- Player two uses a controller: left stick moves, right stick looks, RT fires, LT aims or raises the shield, A dashes, B is the grenade or ability, X reloads or rotates, Y uses or trains, hold LB for the jump wheel and pick with the D-pad, RB jumps into the body in the crosshair, D-pad up opens the build menu, Start pauses.
- With no controller, player two gets the right-hand side of the keyboard: arrows move, I J K L look, O fires, P aims, H uses, N reloads, M is the ability, `/` opens the build menu, comma and full stop pick, `'` holds the jump wheel, `;` jumps to the target.
- With two controllers, player one can use the first as well as the keyboard, and player two takes the second.

It is built on the online co-op code. `src/split.ts` runs a silent copy of the match inside the page, the way the server does, and each half of the screen is an ordinary client of it. Both halves draw through one renderer into their own rectangle (`ViewPipe` in `src/gfx.ts`), and each has its own HUD. `node test/split.mjs` plays a short match in a headless browser.

## Trailer and landing page

`docs/index.html` is a landing page with the trailer at the top. Turn on GitHub Pages for the `docs` folder to publish it. `docs/trailer.mp4` is rendered from the real game, one frame at a time, by `test/trailer.cjs`, a script that stages seven shots and steps the simulation a twenty-fourth of a second per frame. It is silent, because the game's sound is synthesised live in the browser.

## Options

The Options tab on the menu has mouse speed, volume and music, four picture settings (Auto adjusts the resolution to keep the frame rate up, Low also redraws shadows less often), colour-blind friendly team colours (blue for your side and orange for the other on health bars and the minimap), and key rebinding for every keyboard action. Prompts in the game show the keys you chose. Everything is saved in the browser. There is also a frame rate readout, which shows frames a second, the worst frame in the last half second, the render size and the unit count.
