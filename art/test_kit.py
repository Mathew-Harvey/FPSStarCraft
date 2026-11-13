import sys, time
sys.path.insert(0, '.')
from kit import sdf as S, build as B, look
import numpy as np
fig = B.Figure('test')
fig.group('body', (0, 0, 0))
L = S.Limb((0, .9, 0), (0, .1, 0))
leg = S.bump(S.rcone((0, .9, 0), (0, .1, 0), .12, .09), L.folds([(.5, 0, 1.6, .012, .03, .05), (.58, .6, 1.4, .01, .025, -.04), (.85, 0, 3.2, .012, .03, 0), (.92, 1, 3.2, .01, .025, .03)]))
fig.add('leg', 'body', 'fabT', leg, 1500)
fig.add('ball', 'body', 'nY', S.union(S.sphere((.3, 1, 0), .15), S.box((.3, .7, 0), (.1, .1, .1), .02), k=.04), 800)
t = time.time(); fig.build('/tmp/test.bin', '/tmp/test.blend'); print('build', time.time() - t)
t = time.time(); print(look.render('/tmp/test.png', centre=(0, 0, .6), height=1.4)); print('render', time.time() - t)
