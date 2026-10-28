"""Generate golden outputs of the Python prototype for the TS port's unit tests (Phase 1).
Run: venv/bin/python export_expected.py ../../src/pipeline/__fixtures__/expected
Writes JSON per reel: cleaned COCO-17 xy per segment, period/loop, feet (toes + heels), top joints."""
import json, os, sys, tempfile
import numpy as np
sys.path.insert(0, os.path.dirname(__file__))
import proc, reps, analysis, feetproc

MAP = [0, 2, 5, 7, 8, 11, 12, 13, 14, 15, 16, 23, 24, 25, 26, 27, 28]
HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, '..', 'sample-data')
out_dir = sys.argv[1]; os.makedirs(out_dir, exist_ok=True)


def mp2coco(D):
    K, F = [], []
    for e in D:
        if 'xy' not in e:
            K.append({'t': e['t'], 'xy': None}); F.append({'t': e['t']}); continue
        K.append({'t': e['t'], 'xy': [e['xy'][j] for j in MAP], 'c': [e['v'][j] for j in MAP]})
        f = {'t': e['t']}
        for s, h, toe in (('L', 29, 31), ('R', 30, 32)):
            if min(e['v'][h], e['v'][toe]) > .3: f['toe' + s] = e['xy'][toe]; f['heel' + s] = e['xy'][h]
        F.append(f)
    return K, F


def load_coco(K):
    t = np.array([o['t'] for o in K]); xy = np.full((len(K), 17, 2), np.nan); c = np.zeros((len(K), 17))
    for i, o in enumerate(K):
        if o['xy']: xy[i] = o['xy']; c[i] = o['c']
    return t, xy, c


def r(a, nd=3):
    return np.round(np.asarray(a, dtype=float), nd).tolist()


def run(name, segs, period_seg=None, feet_seg=None):
    D = json.load(open(os.path.join(DATA, name + '.json')))
    K, F = mp2coco(D); t, xy, c = load_coco(K)
    fps = 1 / np.median(np.diff(t))
    res = {'fps': float(fps), 'segments': []}
    tmp = tempfile.NamedTemporaryFile('w', suffix='.json', delete=False); json.dump(F, tmp); tmp.close()
    for a, b in segs:
        m = (t >= a) & (t <= b)
        cl = proc.clean(xy[m], c[m], fps)
        seg = {'a': a, 'b': b, 't': r(t[m], 4), 'clean_xy': r(cl, 3), 'near': r(proc.near_side(c[m], fps), 4)}
        if period_seg == (a, b):
            p = reps.find_period(cl, fps); seg['period'] = p
            if p: i0, i1, e = reps.best_loop(cl, p['lag']); seg['loop'] = {'i0': int(i0), 'i1': int(i1), 'err': e, 't0': float(t[m][i0]), 't1': float(t[m][i1])}
        if feet_seg == (a, b):
            for key in ('toe', 'heel'):
                pts, ok = feetproc.build(tmp.name, t[m], cl, fps, key=key)
                seg['feet_' + key] = {'xy': [[None if np.isnan(p[0]) else [round(float(p[0]), 3), round(float(p[1]), 3)] for p in fr] for fr in pts], 'ok': ok.astype(int).tolist()}
        tj = analysis.top_joints(cl, 2)
        seg['top_joints'] = [{'range': float(rg), 'name': nm, 'side': int(si), 'tri': list(tri)} for rg, nm, si, tri in tj]
        res['segments'].append(seg)
    os.unlink(tmp.name)
    json.dump(res, open(os.path.join(out_dir, name + '.expected.json'), 'w'))
    print(name, 'fps', round(fps, 3), [(s['a'], s['b'], len(s['t']), s.get('period'), s.get('loop')) for s in res['segments']])


run('reel1_mobility_mp33', proc.SEGS)
run('reel2_staff_mp33', [(0.0, 27.4)], period_seg=(0.0, 27.4))
run('reel3_burpee_mp33', [(0.6, 12.6333)], period_seg=(0.6, 12.6333), feet_seg=(0.6, 12.6333))
