"""Gun, cannon and blast takes built here by layering CC0 recordings, the way film and game sound designers build a shot:

  crack   the sharp front of a real shot (the PPSh burst, the rubberduck Bang takes), high-passed so it is all snap
  body    a second recording low-passed, for the chest-hit of the gas
  thump   a short burst of low noise, NOT a sine: a falling sine is what made the old guns go "boink"
  slap    the crack again, dull and late, the way a shot comes back off rock walls (early reflections)
  tail    noise that dies away and darkens as it goes, the long roll of a shot across open ground

Everything is seeded, so make.py writes the same files every time. Each recipe returns a few takes so repeats differ.
Called from make.py through SYNTH: forge(name, out_path, dirs).
"""
import subprocess, wave
import numpy as np
from scipy.signal import butter, sosfilt

SR = 48000

def load(dirs, repo, path, start=0.0, dur=None):
  pre = ['-ss', str(start)] if start else []
  post = ['-t', str(dur)] if dur else []
  raw = subprocess.run(['ffmpeg', '-v', 'error', *pre, '-i', f'{dirs[repo]}/{path}', *post, '-ac', '1', '-ar', str(SR), '-f', 'f32le', '-'], capture_output=True, check=True).stdout
  x = np.frombuffer(raw, dtype=np.float32).astype(np.float64)
  return x / (np.max(np.abs(x)) + 1e-9)

def onset(x, th=.25):
  """Cut the lead-in so the transient sits on sample 0."""
  i = int(np.argmax(np.abs(x) > th * np.max(np.abs(x))))
  return x[max(0, i - 24):]

def filt(x, kind, f, order=2):
  return sosfilt(butter(order, f, btype=kind, fs=SR, output='sos'), x)

def fade(x, ms=6):
  n = min(len(x), int(SR * ms / 1000)); x = x.copy(); x[-n:] *= np.linspace(1, 0, n) ** 2; return x

def place(out, x, at, g):
  i = int(at * SR); n = min(len(x), len(out) - i)
  if n > 0: out[i:i + n] += g * x[:n]

def thump(rng, f, dur, attack=.0015):
  """Low noise with a fast rise and a quick fall: weight you feel, no pitch to hear."""
  n = int(SR * dur); t = np.arange(n) / SR
  x = filt(filt(rng.standard_normal(n), 'lowpass', f, 4), 'highpass', 28)
  env = np.minimum(1, t / attack) * np.exp(-t / (dur / 4.5))
  return x * env / (np.max(np.abs(x * env)) + 1e-9)

def tail(rng, dur, f0, f1, rise=.012):
  """Open-air roll: noise whose low pass closes from f0 to f1 as it dies, so the shot rolls away darker."""
  n = int(SR * dur); t = np.arange(n) / SR; x = rng.standard_normal(n); y = np.zeros(n); s = 0.0
  fc = f0 * (f1 / f0) ** (t / dur); a = 1 - np.exp(-2 * np.pi * fc / SR)
  for i in range(n): s += a[i] * (x[i] - s); y[i] = s          # one-pole low pass with a moving corner
  y = filt(y, 'lowpass', f0, 2); y = filt(y, 'highpass', 45)
  env = np.minimum(1, t / rise) * np.exp(-t / (dur / 5.5))
  # a slow wobble, so the roll breathes like wind over a valley instead of hissing flat
  env *= 1 + .25 * np.sin(2 * np.pi * (2.3 + rng.uniform(0, 1.5)) * t + rng.uniform(0, 6))
  y *= env; return y / (np.max(np.abs(y)) + 1e-9)

def glue(x, drive=1.5):
  """Soft saturation, the way a shot is pushed into a limiter: loud front, no hard clip."""
  x = x / (np.max(np.abs(x)) + 1e-9); return np.tanh(drive * x) / np.tanh(drive)

def write(path, x):
  x = fade(x, 12); x = x / (np.max(np.abs(x)) + 1e-9) * .95
  with wave.open(path, 'wb') as w: w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR); w.writeframes((x * 32000).astype(np.int16).tobytes())

PPSH = 'ppsh_P_22P.ogg'
CRACKS = [1.148, 1.203, 1.253, 1.393, 1.593]      # single shots inside the PPSh burst
BANG = 'rubberduck/Bang/'

def crack(dirs, k, dur=.05):
  return fade(filt(onset(load(dirs, 'arms', PPSH, CRACKS[k % len(CRACKS)] - .01, dur + .03)), 'highpass', 260), 4)

def gun(dirs, rng, k, *, body, body_lp, thump_f, thump_d, thump_g, tail_d, tail_f, tail_g, slaps, length, crack_g=1.0, body_g=.8, drive=1.6, double=0.0):
  out = np.zeros(int(SR * length)); c = crack(dirs, k)
  place(out, c, 0, crack_g)
  if double: place(out, crack(dirs, k + 2), double, crack_g * .7)      # a shotgun's second front, a hair late
  b = onset(load(dirs, 'free', BANG + body, 0, min(1.4, length)))
  place(out, filt(b, 'lowpass', body_lp, 2), .0015, body_g)
  place(out, thump(rng, thump_f, thump_d), 0, thump_g)
  place(out, tail(rng, tail_d, tail_f, tail_f / 5), .006, tail_g)
  dull = filt(np.concatenate([c, filt(b[:int(SR * .12)], 'lowpass', 900)]), 'lowpass', 1800)
  for at, g in slaps: place(out, dull * rng.uniform(.8, 1.1), at + rng.uniform(-.008, .008), g)
  return glue(out, drive)

def boom(dirs, rng, k, *, src, length, thump_g=.9, tail_d=1.8, tail_g=.35, crack_g=.5):
  out = np.zeros(int(SR * length)); x = onset(src)
  place(out, filt(x, 'lowpass', 5000, 2), 0, 1)
  place(out, crack(dirs, k), 0, crack_g)
  place(out, thump(rng, 90, .32), 0, thump_g)
  place(out, tail(rng, tail_d, 1400, 160, rise=.04), .02, tail_g)
  # debris: little dry ticks falling through the tail, the satisfying part of a big hit
  for _ in range(9):
    at = rng.uniform(.15, min(length - .1, 1.1)); d = thump(rng, rng.uniform(1500, 4000), .02)
    place(out, filt(d, 'highpass', 900), at, rng.uniform(.03, .09) * (1.2 - at))
  return glue(out, 1.3)

SPW = 'Superpowers/western-fps-2d/'

def recipes():
  R = {}
  # rifle: the trooper's main gun. Tight crack, solid chest-hit, a medium roll and two wall slaps.
  for k, body in enumerate(['shot_01.opus', 'shot_03.opus', 'bang_07.opus', 'shot_01.opus']):
    R[f'gun_rifle_{k}'] = lambda d, r, k=k, body=body: gun(d, r, k, body=body, body_lp=1600, thump_f=170, thump_d=.07, thump_g=.75, tail_d=.9, tail_f=2600, tail_g=.22, slaps=[(.085, .16), (.17, .08)], length=1.0)
  # pistol: lighter and brighter, short roll.
  for k, body in enumerate(['shot_02.opus', 'shot_03.opus', 'bang_04.opus']):
    R[f'gun_pistol_{k}'] = lambda d, r, k=k, body=body: gun(d, r, k + 1, body=body, body_lp=2400, thump_f=220, thump_d=.05, thump_g=.5, tail_d=.55, tail_f=3200, tail_g=.16, slaps=[(.07, .12)], length=.65, body_g=.7)
  # long gun: a heavy crack, deep gas punch and a long roll that comes back off the far hills.
  for k, body in enumerate(['bang_03.opus', 'bang_09.opus']):
    R[f'gun_sniper_{k}'] = lambda d, r, k=k, body=body: gun(d, r, k, body=body, body_lp=1100, thump_f=120, thump_d=.14, thump_g=1.0, tail_d=2.2, tail_f=2000, tail_g=.32, slaps=[(.12, .2), (.31, .12), (.62, .07)], length=2.3, drive=1.8)
  # scatter gun: two fronts, a wide body, a fat roll.
  for k, body in enumerate(['bang_09.opus', 'bang_01.opus']):
    R[f'gun_scatter_{k}'] = lambda d, r, k=k, body=body: gun(d, r, k, body=body, body_lp=1300, thump_f=140, thump_d=.11, thump_g=.95, tail_d=1.3, tail_f=2200, tail_g=.28, slaps=[(.1, .18), (.22, .09)], length=1.4, double=.004, drive=1.8)
  # turret and mounted guns: heavier than the rifle, shorter roll so fast fire does not mush.
  for k, body in enumerate(['bang_06.opus', 'bang_09.opus', 'shot_01.opus']):
    R[f'gun_heavy_{k}'] = lambda d, r, k=k, body=body: gun(d, r, k + 3, body=body, body_lp=1200, thump_f=130, thump_d=.09, thump_g=.95, tail_d=.7, tail_f=2200, tail_g=.2, slaps=[(.09, .12)], length=.8, drive=1.7)
  # cannon: the Thimras cannon recording and the rubberduck cannon, under a deep thump and a long roll.
  for k, (repo, f) in enumerate([('free', 'Thimras/cannon_fire.opus'), ('free', BANG + 'cannon_02.opus'), ('free', 'Thimras/cannon_fire.opus')]):
    R[f'gun_cannon_{k}'] = lambda d, r, k=k, repo=repo, f=f: boom(d, r, k, src=load(d, repo, f, 0, 2.0), length=1.9, thump_g=1.0, tail_d=1.7, tail_g=.3, crack_g=.6 if k != 1 else .8)
  # explosions: the Superpowers blasts, with a thump, a dark roll and debris ticking down.
  for k in range(3):
    R[f'blast_big_{k}'] = lambda d, r, k=k: boom(d, r, k, src=load(d, 'free', f'{SPW}explosion-{k + 1}.opus'), length=2.2, thump_g=1.0, tail_d=2.0, tail_g=.4, crack_g=.35)
  for k, f in enumerate(['top-down-shooter/explosion-1.opus', 'top-down-shooter/explosion-3.opus']):
    R[f'blast_small_{k}'] = lambda d, r, k=k, f=f: boom(d, r, k + 1, src=load(d, 'free', 'Superpowers/' + f), length=1.0, thump_g=.8, tail_d=.8, tail_g=.25, crack_g=.6)
  # Veyl shot: glass struck hard, a snap of air that falls fast, a short shimmer. Crystal, not "pew".
  for k in range(3):
    def veyl(d, r, k=k):
      out = np.zeros(int(SR * .9))
      g = onset(load(d, 'impact', f'impact_glass_heavy_00{[0, 3, 4][k]}.ogg'))
      g = filt(g[:int(SR * .14)], 'highpass', 500); g *= np.exp(-np.arange(len(g)) / SR / .035)   # the strike, not the ring
      place(out, filt(g, 'lowpass', 6500), 0, .7)
      n = int(SR * .09); t = np.arange(n) / SR; z = r.standard_normal(n); y = np.zeros(n); s = 0.0
      fc = 7000 * (900 / 7000) ** (t / .09); a = 1 - np.exp(-2 * np.pi * fc / SR)
      for i in range(n): s += a[i] * (z[i] - s); y[i] = s
      place(out, filt(y * np.exp(-t / .025) / (np.max(np.abs(y)) + 1e-9), 'lowpass', 6000), 0, .8)
      place(out, thump(r, 170, .07), 0, .6)
      place(out, filt(tail(r, .45, 5000, 1800, rise=.02), 'highpass', 1500), .01, .05)
      return glue(out, 1.4)
    R[f'veyl_shot_{k}'] = veyl
  # punches and body hits: a real slam for the hit, a pitchless thump for weight, a little wet slap for the body.
  # (The old Kenney punches rang like a low sine, the other half of the "boink".)
  def hit(d, r, src, lp, tf, td, tg, slap, sg, length):
    out = np.zeros(int(SR * length)); x = onset(load(d, 'free', src, 0, length))
    place(out, filt(x, 'lowpass', lp, 2), 0, 1)
    place(out, thump(r, tf, td), 0, tg)
    place(out, filt(onset(load(d, 'free', 'rubberduck/Mud/' + slap, 0, .25)), 'highpass', 500), .002, sg)
    return glue(out, 1.4)
  SD = 'rubberduck/SFX100/'
  for k, (src, slap) in enumerate([(SD + 'slam_03.opus', 'mud_06.opus'), (SD + 'slam_04.opus', 'mud_05.opus'), ('rubberduck/SFX100V2/sfx100v2_misc_01.opus', 'mud_06.opus')]):
    R[f'punch_{k}'] = lambda d, r, src=src, slap=slap: hit(d, r, src, 4500, 190, .07, .7, slap, .22, .4)
  for k, (src, slap) in enumerate([(SD + 'slam_02.opus', 'mud_02.opus'), ('rubberduck/BreakingFalling/bfh1_hit_07.opus', 'mud_05.opus')]):
    R[f'punch_heavy_{k}'] = lambda d, r, src=src, slap=slap: hit(d, r, src, 3800, 130, .12, .95, slap, .18, .55)
  return R

RECIPES = recipes()

def forge(name, path, dirs):
  rng = np.random.default_rng(sum((i + 1) * ord(c) for i, c in enumerate(name)))
  write(path, RECIPES[name](dirs, rng))
