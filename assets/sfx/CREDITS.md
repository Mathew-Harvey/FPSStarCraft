# Sound credits

Every sound in `assets/sfx` comes from a collection released under **CC0 1.0** (public domain dedication):
free to use, change and ship in a game, commercial or not, with no credit required. We credit them anyway.
`tools/sfx/make.py` rebuilds every file from these sources, pinned to the commits below, so nothing here
is hand-edited.

| Collection | Made by | Licence | Source (pinned commit) | Used for |
| --- | --- | --- | --- | --- |
| Impact Sounds | Kenney (kenney.nl), recorded foley | CC0 1.0 | [Boyquotes/kenney-impact-sounds-for-godot](https://github.com/Boyquotes/kenney-impact-sounds-for-godot) `999dd16` | footsteps, punches, metal and plate hits, glass, mining, bell |
| Sci-Fi Sounds | Kenney (kenney.nl) | CC0 1.0 | [Boyquotes/kenney-sci-fi-sounds-for-godot](https://github.com/Boyquotes/kenney-sci-fi-sounds-for-godot) `c094967` | explosions, Veyl bolts and beams, force fields |
| RPG Audio | Kenney (kenney.nl), recorded foley | CC0 1.0 | [Boyquotes/kenney-rpg-audio-for-godot](https://github.com/Boyquotes/kenney-rpg-audio-for-godot) `22eb79b` | blade slices, cloth |
| SFX Kit | Wyzowl | CC0 1.0 | [wyzowl/sfx-kit](https://github.com/wyzowl/sfx-kit) `92780e7` | gun body knocks, drum, boom, latches, locks, switches, keys, coin pour, whooshes; soft interface clicks, ratchets, shutters, sliders, glass touches, shimmers, tones, risers, pops, shape changes, radio and digital |
| Interface Sounds | Kenney (kenney.nl) | CC0 1.0 | [Calinou/kenney-interface-sounds](https://github.com/Calinou/kenney-interface-sounds) `4596a49` | interface glass, bong, pluck and drop taps |
| CC0-SFX collection | gathered by EternityForest; each folder below is CC0 at its source | CC0 1.0 | [EternityForest/Free-SFX](https://github.com/EternityForest/Free-SFX) `f2fe533` | see the next table |
| Firearm Sound Library (PPSh sample) | Still North Media | CC0 1.0 | [PanderMusubi/sound-effects-library-weapons](https://github.com/PanderMusubi/sound-effects-library-weapons) `e58b20e` | the gunshot cracks |

From the CC0-SFX collection:

| Folder | Original | Used for |
| --- | --- | --- |
| `rubberduck/Mud`, `rubberduck/WaterSplashSlime`, `rubberduck/WoodMetal`, `rubberduck/Bang`, `rubberduck/BreakingFalling`, `rubberduck/SFX100`, `rubberduck/SFX100V2` | rubberduck's CC0 sound packs on OpenGameArt (for example [40 CC0 water splash slime SFX](https://opengameart.org/content/40-cc0-water-splash-slime-sfx)) | Gloam squelches, slime, bubbles and splashes, the bubbling bed near the Bloom; Ironhold hammers, slam, spring, tool rummage; the flare launch; the body of every gun shot, cannon body, punches and thuds |
| `Thimras/cannon_fire` | Thimras, CC0 (in the CC0-SFX collection) | cannons and the long gun's deep layer |
| `Superpowers/western-fps-2d`, `Superpowers/top-down-shooter` explosions | Sparklin Labs [Superpowers asset packs](https://github.com/sparklinlabs/superpowers-asset-packs), CC0 | blasts and booms |
| `Freesound/Animals` | taman21, "slimy bugs crawling" (freesound 508165, CC0) | the Gloam flier's buzz |
| `Owlish/Sound Effects Pack` | Owlish, "Sound effects pack" (OpenGameArt, CC0) | night crickets |
| `Freesound/Foley` | splicesound, "hand digging dirt leaves crunch" (freesound 260130, CC0) | digging in |
| `JaggedStone/Magic Spell SFX` | JaggedStone (OpenGameArt, CC0) | the Prism's Burn Bright |

Made here, not recorded (ours, CC0 like the rest): `veylhum`, the Veyl flier's hum, two soft sine voices a fifth apart
beating slowly against detuned twins (`synth_veylhum` in `tools/sfx/make.py`).

Kenney's packs are CC0 at the source (kenney.nl); the repositories above are straight ports of the packs
and carry the same CC0 licence file. Each repository's `LICENSE` is the CC0 1.0 legal code.

A take marked loop (engines, beds) is cut so its last 0.4 s crossfades into its start.

Looked at and not used: Meta Open Sound's Oculus Audio Pack (CC BY 4.0, would need credit in the game),
and Soft Sounds (CC0, but made with a generative model whose terms we did not want to depend on).

## How each file is treated

Mono, 48 kHz, Opus in WebM. A high pass at 35 Hz (rumble and DC offset out), a 3 dB dip around 3.4 kHz
(where clicks turn harsh), a per-sound low pass between 3 and 9 kHz (damped top, so hits land as a
"thock" not a "clack"), leading silence cut so the transient is on the frame it is played, a short fade
at the end, peaks at -1 dBFS. The game sets the mix and layers synthesised sub weight under the samples
(`src/audio.ts`).

**Guns, cannons, blasts and punches** (`gun_*`, `blast_*`, `veyl_shot_*`, `punch_*`) are built in `tools/sfx/forge.py`: the PPSh crack, a rubberduck body, a pitchless noise thump, wall slaps and a darkening open-air tail, layered and seeded so every build is the same. The parts are CC0, so the takes are too.
