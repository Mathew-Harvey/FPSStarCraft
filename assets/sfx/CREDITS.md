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
| SFX Kit | Wyzowl | CC0 1.0 | [wyzowl/sfx-kit](https://github.com/wyzowl/sfx-kit) `92780e7` | gun body knocks, drum, boom, latches, locks, switches, keys, coin pour, whooshes |
| Firearm Sound Library (PPSh sample) | Still North Media | CC0 1.0 | [PanderMusubi/sound-effects-library-weapons](https://github.com/PanderMusubi/sound-effects-library-weapons) `e58b20e` | the gunshot cracks |

Kenney's packs are CC0 at the source (kenney.nl); the repositories above are straight ports of the packs
and carry the same CC0 licence file. Each repository's `LICENSE` is the CC0 1.0 legal code.

Looked at and not used: Meta Open Sound's Oculus Audio Pack (CC BY 4.0, would need credit in the game),
and Soft Sounds (CC0, but made with a generative model whose terms we did not want to depend on).

## How each file is treated

Mono, 48 kHz, Opus in WebM. A high pass at 35 Hz (rumble and DC offset out), a 3 dB dip around 3.4 kHz
(where clicks turn harsh), a per-sound low pass between 3 and 9 kHz (damped top, so hits land as a
"thock" not a "clack"), leading silence cut so the transient is on the frame it is played, a short fade
at the end, peaks at -1 dBFS. The game sets the mix and layers synthesised sub weight under the samples
(`src/audio.ts`).
