"""Looks at sounds without listening to them: loudness, where the energy sits, how sharp the start is,
whether the end clicks, and a picture of each one (a spectrogram over its waveform).

Run:  python3 tools/sfx/audit.py OUT.png file1 file2 ...      (any format ffmpeg reads)
      python3 tools/sfx/audit.py OUT.png --dir some/folder     (every wav/ogg/opus/webm in it)
Prints one row per sound and writes a contact sheet. Needs ffmpeg, numpy and matplotlib.

What "satisfying" means here, as numbers (after how foley and ASMR recordists judge a take):
  harsh   share of energy between 2.5 and 6 kHz, where clicks turn painful. Under 25% reads soft.
  air     share above 6 kHz. Some is crisp detail; a lot is hiss.
  body    share under 300 Hz, the weight. Hits and thumps want plenty.
  attack  ms from start to peak. Under 10 is a crisp transient.
  tail    level of the last 2 ms against the peak, dB. Above -40 means it is cut off and can click.
  floor   level of the quietest 10% of frames, dB. Above -50 is hiss under the sound.
"""
import sys, os, subprocess, json
import numpy as np

SR = 48000

def load(path):
  raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', path, '-ac', '1', '-ar', str(SR), '-f', 'f32le', '-'], capture_output=True, check=True).stdout
  return np.frombuffer(raw, dtype=np.float32).copy()

def stats(x):
  if len(x) < 64: return None
  peak = float(np.max(np.abs(x))) + 1e-9
  rms = float(np.sqrt(np.mean(x * x))) + 1e-9
  spec = np.abs(np.fft.rfft(x * np.hanning(len(x)))) ** 2; f = np.fft.rfftfreq(len(x), 1 / SR); tot = spec.sum() + 1e-12
  band = lambda a, b: float(spec[(f >= a) & (f < b)].sum() / tot)
  cent = float((spec * f).sum() / tot)
  fr = 480; n = len(x) // fr
  env = np.array([np.sqrt(np.mean(x[i * fr:(i + 1) * fr] ** 2)) for i in range(max(1, n))]) + 1e-9
  att = float(np.argmax(np.abs(x[:SR]))) / SR * 1000
  tail = 20 * np.log10(np.max(np.abs(x[-96:])) / peak + 1e-9)
  floor = 20 * np.log10(np.percentile(env, 10) / peak)
  return dict(dur=len(x) / SR, peak=20 * np.log10(peak), rms=20 * np.log10(rms), body=band(20, 300), mid=band(300, 2500), harsh=band(2500, 6000), air=band(6000, 24000), cent=cent, attack=att, tail=float(tail), floor=float(floor))

def sheet(out, items, cols=4):
  import matplotlib; matplotlib.use('Agg'); import matplotlib.pyplot as plt
  rows = (len(items) + cols - 1) // cols
  fig, axs = plt.subplots(rows * 2, cols, figsize=(cols * 3.2, rows * 2.3), gridspec_kw={'height_ratios': [3, 1] * rows}, squeeze=False)
  for i in range(rows * cols):
    a, w = axs[(i // cols) * 2][i % cols], axs[(i // cols) * 2 + 1][i % cols]
    a.axis('off'); w.axis('off')
    if i >= len(items): continue
    name, x, s = items[i]
    if len(x) < 512: continue
    a.specgram(x, NFFT=1024, Fs=SR, noverlap=768, cmap='magma', vmin=-120, vmax=-20, scale='dB')
    a.set_yscale('symlog', linthresh=500); a.set_ylim(40, 20000)
    a.set_title(f"{name}  {s['dur']:.2f}s  h{s['harsh']*100:.0f}% b{s['body']*100:.0f}%", fontsize=7)
    t = np.arange(len(x)) / SR; w.plot(t, x, lw=.4, color='k'); w.set_xlim(0, t[-1]); w.set_ylim(-1, 1)
  plt.tight_layout(pad=.3); plt.savefig(out, dpi=80); plt.close(fig)

def main():
  out = sys.argv[1]; args = sys.argv[2:]
  if args and args[0] == '--dir': d = args[1]; args = [os.path.join(d, f) for f in sorted(os.listdir(d)) if f.split('.')[-1] in ('wav', 'ogg', 'opus', 'webm')]
  items = []
  print(f"{'name':34s} {'dur':>5s} {'peak':>6s} {'rms':>6s} {'body':>5s} {'mid':>5s} {'harsh':>5s} {'air':>5s} {'cent':>6s} {'att':>5s} {'tail':>6s} {'floor':>6s}")
  for p in args:
    try: x = load(p)
    except Exception as e: print(p, 'unreadable'); continue
    s = stats(x)
    if not s: continue
    name = os.path.basename(p).rsplit('.', 1)[0][:34]
    print(f"{name:34s} {s['dur']:5.2f} {s['peak']:6.1f} {s['rms']:6.1f} {s['body']*100:5.0f} {s['mid']*100:5.0f} {s['harsh']*100:5.0f} {s['air']*100:5.0f} {s['cent']:6.0f} {s['attack']:5.0f} {s['tail']:6.1f} {s['floor']:6.1f}")
    items.append((name, x, s))
  if out != '-': sheet(out, items)

if __name__ == '__main__': main()
