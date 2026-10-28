"""MediaPipe-33 -> our COCO-17 keypoint file + a feet file (heels and toe tips)."""
import sys, json
MAP = [0, 2, 5, 7, 8, 11, 12, 13, 14, 15, 16, 23, 24, 25, 26, 27, 28]
src, kp_out, feet_out = sys.argv[1:4]
D = json.load(open(src)); K = []; F = []
for e in D:
    if 'xy' not in e: K.append({'t': e['t'], 'xy': None}); F.append({'t': e['t']}); continue
    K.append({'t': e['t'], 'xy': [e['xy'][j] for j in MAP], 'c': [e['v'][j] for j in MAP]})
    f = {'t': e['t']}
    for s, h, toe in (('L', 29, 31), ('R', 30, 32)):
        if min(e['v'][h], e['v'][toe]) > .3: f['toe' + s] = e['xy'][toe]; f['heel' + s] = e['xy'][h]
    F.append(f)
json.dump(K, open(kp_out, 'w')); json.dump(F, open(feet_out, 'w'))
print(len(K), sum(1 for k in K if k['xy']), sum('toeL' in f for f in F), sum('toeR' in f for f in F))
