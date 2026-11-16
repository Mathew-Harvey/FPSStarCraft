"""Builds assets/sfx/*.webm from CC0 sound collections on GitHub.

Run:  python3 tools/sfx/make.py [cache-dir]
Needs git and ffmpeg (with libopus). Every source repository is pinned to a commit,
so the same files come out every time. Licences and links are in assets/sfx/CREDITS.md.

The processing is the same "close and dry" treatment for every sound, after how ASMR and
foley recordists work: a quiet floor, no room, the rumble and the harsh upper mids taken
out so the body and the click are what you hear. Per-sound, a low pass softens the top
(a damped, deeper "thock" rather than a bright clack), and the length is trimmed so a
sound stops cleanly instead of ringing.
"""
import os, subprocess, sys, json

REPOS = {
  'impact': ('https://github.com/Boyquotes/kenney-impact-sounds-for-godot', '999dd1684873f8b020a3aa5b26e713da21688924', 'addons/kenney impact sounds'),
  'scifi':  ('https://github.com/Boyquotes/kenney-sci-fi-sounds-for-godot', 'c094967fe930c57ddb376f67c75f8aa0296690b7', 'addons/kenney sci-fi sounds'),
  'rpg':    ('https://github.com/Boyquotes/kenney-rpg-audio-for-godot', '22eb79bb843bbcadcaa6ed119353a33265ffad11', 'addons/kenney rpg audio'),
  'kit':    ('https://github.com/wyzowl/sfx-kit', '92780e7ab0cdfb557497a988089c47f46e8c7412', 'sounds'),
  'arms':   ('https://github.com/PanderMusubi/sound-effects-library-weapons', 'e58b20e350765ebc3e0c54e80cf6b285fb28e470', 'samples'),
  'iface':  ('https://github.com/Calinou/kenney-interface-sounds', '4596a49eaf5a533948d49a47467f606bcdea70ff', 'addons/kenney_interface_sounds'),
  'free':   ('https://github.com/EternityForest/Free-SFX', 'f2fe53330c2cc6dc47c73750409c963219e997be', ''),
}

# name: (repo, file, start s, length s or None, low pass Hz or None, gain dB[, 'loop'])
# A 'loop' take is cut so its end runs into its start (a 0.4 s crossfade), for beds and engines that play on repeat.
P = 'ppsh_P_22P.ogg'
SOUNDS = {
  # guns: a real submachine gun recording, cut into single shots, with synthesised weight under it in code
  'crack_0': ('arms', P, 1.140, .050, 9000, 0), 'crack_1': ('arms', P, 1.290, .050, 9000, 0), 'crack_2': ('arms', P, 1.440, .050, 9000, 0),
  'crack_tail': ('arms', P, 1.640, .55, 7000, 0),
  'knock_hard': ('kit', 'impacts/impact-heavy-hard.wav', 0, .30, 6000, 0),
  'knock_deep': ('kit', 'impacts/impact-deep-hard.wav', 0, .75, 5000, 0),
  'drum': ('kit', 'cinematic-hits/cinematic-drum-big.wav', 0, 1.3, 6000, 0),
  'act_light': ('kit', 'mechanical/mechanical-shutter-light.wav', 0, None, 8000, 0),
  'act_heavy': ('kit', 'mechanical/mechanical-shutter-heavy.wav', 0, None, 7000, 0),
  'slide': ('kit', 'mechanical/mechanical-slider-light.wav', .2, None, 7000, 0),
  'latch': ('kit', 'mechanical/mechanical-latch-heavy.wav', 0, None, 7000, 0),
  'mag_out': ('kit', 'mechanical/mechanical-latch-light.wav', 0, None, 7000, 0),
  'mag_in': ('kit', 'interface/click-latch-firm.wav', 0, None, 6500, 0),
  'bolt': ('kit', 'mechanical/mechanical-switch-heavy.wav', 0, None, 6500, 0),
  'lock': ('kit', 'mechanical/mechanical-lock-heavy.wav', 0, None, 7000, 0),
  'dry': ('kit', 'mechanical/mechanical-switch-light.wav', 0, None, 7000, 0),
  # bodies being hit, metal, glass
  **{f'punch_{i}': ('impact', f'impact_punch_medium_00{i}.ogg', 0, .35, 5000, 0) for i in range(3)},
  **{f'punch_heavy_{i}': ('impact', f'impact_punch_heavy_00{i}.ogg', 0, .5, 5000, 0) for i in range(2)},
  **{f'metal_{i}': ('impact', f'impact_metal_heavy_00{i}.ogg', 0, None, 7000, 0) for i in range(3)},
  **{f'plate_{i}': ('impact', f'impact_plate_heavy_00{i}.ogg', 0, .45, 6000, 0) for i in range(2)},
  **{f'glass_{i}': ('impact', f'impact_glass_medium_00{i}.ogg', 0, .45, 8000, 0) for i in range(2)},
  'tink': ('impact', 'impact_glass_light_000.ogg', 0, None, 9000, 0),
  'bell': ('impact', 'impact_bell_heavy_000.ogg', 0, 1.4, 6000, 0),
  # explosions
  **{f'crunch_{i}': ('scifi', f'explosion_crunch_00{i}.ogg', 0, None, 6000, 0) for i in range(3)},
  'rumble': ('scifi', 'low_frequency_explosion_000.ogg', 0, 1.6, 3000, 0),
  'boom': ('kit', 'booms-and-bass/boom-hit-strong.wav', 0, 1.3, 4000, 0),
  # the Veyl: crystal energy
  **{f'zap_{i}': ('scifi', f'laser_small_00{i}.ogg', 0, None, 7000, 0) for i in range(3)},
  'beam': ('scifi', 'laser_large_000.ogg', 0, None, 6000, 0),
  **{f'field_{i}': ('scifi', f'force_field_00{i}.ogg', 0, None, 6000, 0) for i in range(2)},
  'slice_0': ('rpg', 'knife_slice.ogg', .15, None, 5000, 0), 'slice_1': ('rpg', 'knife_slice_2.ogg', 0, None, 5000, 0),
  # moving
  **{f'step_{i}': ('impact', f'footstep_snow_00{i}.ogg', 0, None, 6500, 0) for i in range(5)},
  **{f'stomp_{i}': ('impact', f'impact_soft_heavy_00{i}.ogg', 0, .45, 3000, 0) for i in range(2)},
  'cloth_0': ('rpg', 'cloth_1.ogg', 0, None, 7000, 0), 'cloth_1': ('rpg', 'cloth_3.ogg', 0, None, 7000, 0),
  'whoosh': ('kit', 'whooshes/whoosh-fast-soft.wav', 0, None, 7000, 0),
  'swish': ('kit', 'swishes-and-zips/swish-medium.wav', 0, None, 7000, 0),
  # the economy
  **{f'mine_{i}': ('impact', f'impact_mining_00{i}.ogg', 0, .4, 6000, 0) for i in range(4)},
  'pebble': ('kit', 'impacts/impact-light-hard.wav', 0, None, 7000, 0),
  'pour': ('kit', 'money/money-coins-pour.wav', 0, .9, 5000, 0),
  'thunk': ('kit', 'impacts/impact-heavy-firm.wav', 0, None, 5000, 0),
  # the interface
  'rocker': ('kit', 'interface/click-rocker-firm.wav', 0, None, 6000, 0),
  'rocker_soft': ('kit', 'interface/click-rocker-soft.wav', 0, None, 6000, 0),
  'space': ('kit', 'keyboard/keyboard-space-firm.wav', 0, None, 5000, 0),
  'denied': ('kit', 'digital/digital-denied.wav', 0, None, 3000, 0),
  'off': ('kit', 'interface/click-toggle-off-firm.wav', 0, None, 6000, 0),
  'knock': ('kit', 'foley/foley-wood-touch.wav', 0, None, 6000, 0),
  'card': ('kit', 'foley/foley-card-touch.wav', 0, None, 7000, 0),
  'thud_soft': ('kit', 'impacts/impact-heavy-soft.wav', 0, None, 4000, 0),
  # ---- 2026-11 ASMR pass: every ability, interface action, flier and weather gets its own material ----
  # the Gloam: wet, soft, alive. Recorded mud and slime (rubberduck, OpenGameArt CC0), digging (splicesound, freesound CC0)
  **{f'squelch_{i}': ('free', f'rubberduck/Mud/mud_{n}.opus', 0, None, 5000, 0) for i, n in enumerate(['03', '04', '08', '13', '18', '25'])},
  **{f'goo_{i}': ('free', f'rubberduck/WaterSplashSlime/slime_{n}.opus', 0, None, 4500, 0) for i, n in enumerate(['09', '15', '16', '13'])},
  **{f'bubble_{i}': ('free', f'rubberduck/WaterSplashSlime/bubble_0{n}.opus', 0, None, 4000, 0) for i, n in enumerate([1, 2])},
  **{f'splash_{i}': ('free', f'rubberduck/WaterSplashSlime/splash_0{n}.opus', 0, .6, 4500, 0) for i, n in enumerate([2, 4])},
  **{f'pop_{i}': ('kit', f'pops/pop-{n}.wav', 0, None, 6000, 0) for i, n in enumerate(['large-bubble', 'medium-bubble', 'large-out', 'medium-in'])},
  **{f'dirt_{i}': ('free', 'Freesound/Foley/260130__splicesound__hand-digging-dirt-leaves-crunch.opus', t, .5, 5000, 0) for i, t in enumerate([.92, 9.92, 13.42, 16.87])},
  'grow': ('kit', 'shape-changes/transform-grow.wav', 0, None, 6000, 0),
  'inflate': ('kit', 'shape-changes/transform-inflate.wav', 0, None, 5500, 0),
  'morph': ('kit', 'shape-changes/transform-morph.wav', 0, None, 6000, 0),
  'brew': ('free', 'rubberduck/WaterSplashSlime/loop_bubbles_1.opus', 0, 3.4, 3500, 0, 'loop'),
  'buzz': ('free', 'Freesound/Animals/508165__taman21__slimy-bugs-crawling.opus', 4.0, 2.9, 3000, 0, 'loop'),
  # the Veyl: glass, bells and tuned tones
  **{f'shimmer_{i}': ('kit', f'shimmers/shimmer-{n}-soft.wav', 0, None, 7000, 0) for i, n in enumerate(['short', 'medium'])},
  'ding_low': ('kit', 'tones/tone-ding-low.wav', 0, None, 6000, 0), 'ding_mid': ('kit', 'tones/tone-ding-mid.wav', 0, None, 6000, 0),
  'gtouch': ('kit', 'foley/foley-glass-touch.wav', 0, None, 6000, 0), 'gslide': ('kit', 'foley/foley-glass-slide.wav', 0, None, 5000, 0),
  **{f'crystal_{i}': ('impact', f'impact_glass_heavy_00{n}.ogg', 0, None, 7000, 0) for i, n in enumerate([0, 3, 4])},
  **{f'bellh_{i}': ('impact', f'impact_bell_heavy_00{n}.ogg', 0, None, 6000, 0) for i, n in enumerate([1, 2])},
  'magic': ('free', 'JaggedStone/Magic Spell SFX/magical_1.opus', 0, None, 6000, 0),
  'rise': ('kit', 'risers-and-fallers/riser-1s-soft.wav', 0, None, 6000, 0),
  'rise_long': ('kit', 'risers-and-fallers/riser-2s-strong.wav', 0, None, 5500, 0),
  'fall': ('kit', 'risers-and-fallers/faller-1s-soft.wav', 0, None, 6000, 0),
  'suck': ('kit', 'reverse-whooshes/reverse-whoosh-medium-soft.wav', 0, None, 6000, 0),
  'appear': ('kit', 'appear-and-vanish/appear-flip-slow.wav', 0, None, 6000, 0),
  'poof': ('kit', 'appear-and-vanish/appear-poof.wav', 0, None, 5000, 0),
  'veylhum': ('synth', 'veylhum', 0, 4.4, 4000, 0, 'loop'),   # made here (see SYNTH below): a Veyl flier's glassy hum
  # Ironhold: ratchets, hatches, hammers, engines, radios
  'ratchet': ('kit', 'mechanical/mechanical-ratchet-heavy.wav', 0, None, 6000, 0),
  'slider': ('kit', 'mechanical/mechanical-slider-heavy.wav', 0, None, 6000, 0),
  'shutter': ('kit', 'mechanical/mechanical-shutter-heavy.wav', 0, None, 6500, 0),
  'lock_light': ('kit', 'mechanical/mechanical-lock-light.wav', 0, None, 6500, 0),
  **{f'creak_{i}': ('rpg', f'creak_{n}.ogg', 0, None, 4000, 0) for i, n in enumerate([1, 2])},
  'hatch_open': ('rpg', 'door_open_1.ogg', 0, None, 5000, 0), 'hatch_shut': ('rpg', 'door_close_1.ogg', 0, None, 4500, 0),
  **{f'hammer_{i}': ('free', f'rubberduck/WoodMetal/hammer_0{n}.opus', 0, None, 5000, 0) for i, n in enumerate([2, 4])},
  'slam': ('free', 'rubberduck/WoodMetal/metal_slam_01.opus', 0, None, 5000, 0),
  'spring': ('free', 'rubberduck/WoodMetal/metal_spring_01.opus', 0, None, 4500, 0),
  'rummage': ('free', 'rubberduck/WoodMetal/tools_04.opus', 0, None, 5000, 0),
  'leather': ('rpg', 'drop_leather.ogg', 0, None, 5000, 0),
  'launch': ('free', 'rubberduck/Bang/fw_01.opus', 0, None, 6000, 0),
  'static': ('kit', 'digital/digital-interference.wav', 0, None, 5000, 0),
  'scramble': ('kit', 'digital/digital-scramble.wav', 0, None, 5000, 0),
  'radio': ('kit', 'digital/digital-radio.wav', 0, None, 4500, 0),
  'power_up': ('kit', 'digital/digital-power-up.wav', 0, None, 6000, 0),
  'power_down': ('kit', 'digital/digital-power-down.wav', 0, None, 6000, 0),
  'thrust': ('scifi', 'thruster_fire_000.ogg', 0, 1.2, 4000, 0),
  'engine_low': ('scifi', 'space_engine_low_000.ogg', .5, 2.4, 2500, 0, 'loop'),
  'engine_small': ('scifi', 'space_engine_small_000.ogg', .5, 2.4, 3000, 0, 'loop'),
  'rotor': ('scifi', 'engine_circular_002.ogg', .5, 2.4, 3500, 0, 'loop'),
  # the interface: soft tactile clicks (wyzowl foley clicks) and a few tuned Kenney taps
  'ui_tap': ('kit', 'interface/click-tap-soft.wav', 0, None, 6000, 0), 'ui_tap_firm': ('kit', 'interface/click-tap-medium.wav', 0, None, 6000, 0),
  'ui_clip': ('kit', 'interface/click-clip-soft.wav', 0, None, 6000, 0), 'ui_toggle': ('kit', 'interface/click-toggle-soft.wav', 0, None, 6000, 0),
  'ui_on': ('kit', 'interface/click-toggle-on-soft.wav', 0, None, 5000, 0), 'ui_off': ('kit', 'interface/click-toggle-off-soft.wav', 0, None, 6000, 0),
  'ui_snap': ('kit', 'interface/click-snap-soft.wav', 0, None, 6000, 0), 'ui_mouse': ('kit', 'interface/click-mouse-soft.wav', 0, None, 6000, 0),
  'ui_latch': ('kit', 'interface/click-latch-soft.wav', 0, None, 6000, 0), 'ui_button': ('kit', 'interface/click-button-soft.wav', 0, None, 6000, 0),
  'ui_glass': ('iface', 'glass_002.wav', 0, None, 6000, 0), 'ui_bong': ('iface', 'bong_001.wav', 0, None, 5000, 0),
  'ui_pluck': ('iface', 'pluck_002.wav', 0, None, 5000, 0), 'ui_drop': ('iface', 'drop_002.wav', 0, None, 5000, 0),
  'page': ('kit', 'everyday-props/props-page-turn.wav', 0, None, 6000, 0), 'card_slide': ('kit', 'foley/foley-card-slide.wav', 0, None, 6000, 0),
  # night and the Bloom
  'crickets': ('free', 'Owlish/Sound Effects Pack/Ambience/night-crickets-ambience-on-rural-property.opus', 10, 6.4, 6000, 0, 'loop'),
  'swamp': ('free', 'rubberduck/WaterSplashSlime/loop_bubbles_02.opus', 0, 6.4, 3000, 0, 'loop'),
}

def fetch(cache):
  out = {}
  for k, (url, sha, sub) in REPOS.items():
    d = os.path.join(cache, k)
    if not os.path.isdir(d):
      subprocess.run(['git', 'init', '-q', d], check=True)
      subprocess.run(['git', '-C', d, 'fetch', '-q', '--depth', '1', url, sha], check=True)
      subprocess.run(['git', '-C', d, 'checkout', '-q', 'FETCH_HEAD'], check=True)
    out[k] = os.path.join(d, sub) if sub else d
  return out

# Sounds made here rather than recorded, written as WAV into the cache and treated like any other take. Ours, so CC0 too.
def synth_veylhum(path, sr=48000, secs=4.4):
  """Two soft sine voices a fifth apart (D3, A3) that beat slowly against a detuned twin, swelling twice a second: a hum
  you feel more than hear, the Veyl's song carried by whatever flies."""
  import numpy as np, wave
  t = np.arange(int(sr * secs)) / sr; x = np.zeros_like(t)
  for f, a in ((146.83, .5), (147.6, .35), (220.0, .25), (220.9, .18), (293.66, .08)): x += a * np.sin(2 * np.pi * f * t + np.random.default_rng(int(f)).uniform(0, 6))
  x = x * (1 + .15 * np.sin(2 * np.pi * .5 * t)) / 1.4
  with wave.open(path, 'wb') as w: w.setnchannels(1); w.setsampwidth(2); w.setframerate(sr); w.writeframes((np.clip(x, -1, 1) * 30000).astype(np.int16).tobytes())
SYNTH = {'veylhum': synth_veylhum}

def seam(path, xf):
  """Makes a take loop: its last `xf` seconds fade out over its first `xf`, which fade in (equal power), and the tail is dropped."""
  import numpy as np, wave
  with wave.open(path) as w: n, sr = w.getnframes(), w.getframerate(); x = np.frombuffer(w.readframes(n), dtype=np.int16).astype(np.float32)
  X = min(int(xf * sr), len(x) // 3); L = len(x) - X; t = np.linspace(0, np.pi / 2, X)
  y = x[:L].copy(); y[:X] = x[:X] * np.sin(t) + x[L:] * np.cos(t)
  with wave.open(path, 'wb') as w: w.setnchannels(1); w.setsampwidth(2); w.setframerate(sr); w.writeframes(np.clip(y, -32768, 32767).astype(np.int16).tobytes())

def main():
  root = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
  cache = sys.argv[1] if len(sys.argv) > 1 else os.path.join(root, '.sfx-cache')
  dirs = fetch(cache); dst = os.path.join(root, 'assets', 'sfx'); os.makedirs(dst, exist_ok=True)
  for f in os.listdir(dst):
    if f.endswith('.webm'): os.remove(os.path.join(dst, f))
  for name, (repo, f, start, dur, lp, gain, *opt) in SOUNDS.items():
    if repo == 'synth': src = os.path.join(cache, f + '.src.wav'); SYNTH[f](src)
    else: src = os.path.join(dirs[repo], f)
    loop = 'loop' in opt; XF = .4
    if loop: dur = dur + XF
    # 1. mono, rumble and DC out, a gentle dip in the 3 to 4 kHz "harsh" band, the top softened
    chain = ['highpass=f=35', 'equalizer=f=3400:t=q:w=1.2:g=-3']
    if lp: chain.append(f'lowpass=f={lp}:p=1')
    # 2. no lead-in silence, so the transient lands on the frame it is played
    if not loop: chain.append('silenceremove=start_periods=1:start_threshold=-50dB')
    if dur: chain.append(f'atrim=0:{dur}')
    # 3. a short fade so a cut never clicks, then peaks to -1 dBFS (the game sets the mix)
    fade = min(.03, (dur or 1) * .3)
    if not loop: chain += ['areverse', f'afade=t=in:d={fade}', 'areverse']
    chain.append('alimiter=limit=0.89:attack=1:release=20:level=false')
    pre = ['-ss', str(start)] if start else []
    tmp = os.path.join(cache, name + '.wav')
    subprocess.run(['ffmpeg', '-v', 'error', '-y', *pre, '-i', src, '-ac', '1', '-ar', '48000', '-af', ','.join(chain), tmp], check=True)
    if loop: seam(tmp, XF)
    # peak normalise
    vol = subprocess.run(['ffmpeg', '-i', tmp, '-af', 'volumedetect', '-f', 'null', '-'], capture_output=True, text=True).stderr
    peak = float(vol.split('max_volume:')[1].split('dB')[0])
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', tmp, '-af', f'volume={-1 - peak + gain}dB', '-c:a', 'libopus', '-b:a', '56k', '-application', 'audio', '-fflags', '+bitexact', '-flags:a', '+bitexact', '-map_metadata', '-1', os.path.join(dst, name + '.webm')], check=True)
  print(len(SOUNDS), 'sounds written to', dst)

main()
