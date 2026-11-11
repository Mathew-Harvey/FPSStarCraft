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
}

# name: (repo, file, start s, length s or None, low pass Hz or None, gain dB)
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
}

def fetch(cache):
  out = {}
  for k, (url, sha, sub) in REPOS.items():
    d = os.path.join(cache, k)
    if not os.path.isdir(d):
      subprocess.run(['git', 'init', '-q', d], check=True)
      subprocess.run(['git', '-C', d, 'fetch', '-q', '--depth', '1', url, sha], check=True)
      subprocess.run(['git', '-C', d, 'checkout', '-q', 'FETCH_HEAD'], check=True)
    out[k] = os.path.join(d, sub)
  return out

def main():
  root = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
  cache = sys.argv[1] if len(sys.argv) > 1 else os.path.join(root, '.sfx-cache')
  dirs = fetch(cache); dst = os.path.join(root, 'assets', 'sfx'); os.makedirs(dst, exist_ok=True)
  for f in os.listdir(dst):
    if f.endswith('.webm'): os.remove(os.path.join(dst, f))
  for name, (repo, f, start, dur, lp, gain) in SOUNDS.items():
    src = os.path.join(dirs[repo], f)
    # 1. mono, rumble and DC out, a gentle dip in the 3 to 4 kHz "harsh" band, the top softened
    chain = ['highpass=f=35', 'equalizer=f=3400:t=q:w=1.2:g=-3']
    if lp: chain.append(f'lowpass=f={lp}:p=1')
    # 2. no lead-in silence, so the transient lands on the frame it is played
    chain.append('silenceremove=start_periods=1:start_threshold=-50dB')
    if dur: chain.append(f'atrim=0:{dur}')
    # 3. a short fade so a cut never clicks, then peaks to -1 dBFS (the game sets the mix)
    fade = min(.03, (dur or 1) * .3)
    chain += ['areverse', f'afade=t=in:d={fade}', 'areverse', 'alimiter=limit=0.89:attack=1:release=20:level=false']
    pre = ['-ss', str(start)] if start else []
    tmp = os.path.join(cache, name + '.wav')
    subprocess.run(['ffmpeg', '-v', 'error', '-y', *pre, '-i', src, '-ac', '1', '-ar', '48000', '-af', ','.join(chain), tmp], check=True)
    # peak normalise
    vol = subprocess.run(['ffmpeg', '-i', tmp, '-af', 'volumedetect', '-f', 'null', '-'], capture_output=True, text=True).stderr
    peak = float(vol.split('max_volume:')[1].split('dB')[0])
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', tmp, '-af', f'volume={-1 - peak + gain}dB', '-c:a', 'libopus', '-b:a', '56k', '-application', 'audio', os.path.join(dst, name + '.webm')], check=True)
  print(len(SOUNDS), 'sounds written to', dst)

main()
