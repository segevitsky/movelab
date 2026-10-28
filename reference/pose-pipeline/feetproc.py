"""Attach measured toes to the cleaned skeleton: match toes to ankles, express each foot as
(angle vs shin, length / shin) so it moves with the leg, interpolate gaps, smooth."""
import json, numpy as np
from scipy.signal import savgol_filter


def build(feet_json, times, xy, fps, key='toe'):
    F = json.load(open(feet_json)); ft = np.array([e['t'] for e in F]); n = len(times)
    ang = np.full((n, 2), np.nan); rat = np.full((n, 2), np.nan)
    for k, t in enumerate(times):
        e = F[int(np.abs(ft - t).argmin())]
        toes = [np.array(e[s]) for s in (key + 'L', key + 'R') if s in e]
        if not toes: continue
        A = [xy[k][15], xy[k][16]]
        pairs = []
        if len(toes) == 2:
            c1 = np.linalg.norm(toes[0] - A[0]) + np.linalg.norm(toes[1] - A[1])
            c2 = np.linalg.norm(toes[0] - A[1]) + np.linalg.norm(toes[1] - A[0])
            pairs = [(0, toes[0]), (1, toes[1])] if c1 <= c2 else [(1, toes[0]), (0, toes[1])]
        else:
            j = int(np.argmin([np.linalg.norm(toes[0] - a) for a in A])); pairs = [(j, toes[0])]
        for j, toe in pairs:
            kn, an = (13, 15) if j == 0 else (14, 16)
            s = xy[k][an] - xy[k][kn]; sl = np.linalg.norm(s) + 1e-6; v = toe - xy[k][an]
            r = np.linalg.norm(v) / sl
            if r > .7: continue
            a = np.arctan2(s[0] * v[1] - s[1] * v[0], s @ v)   # signed angle shin -> foot
            ang[k, j] = a; rat[k, j] = r
    idx = np.arange(n); out = np.full((n, 2, 2), np.nan); ok = np.zeros((n, 2), bool)
    w = int(fps * .25) | 1
    for j in range(2):
        g = ~np.isnan(ang[:, j]); ok[:, j] = g
        if g.sum() < 5: continue
        a = np.interp(idx, idx[g], np.unwrap(ang[g, j])); r = np.interp(idx, idx[g], rat[g, j])
        a = savgol_filter(a, w, 2); r = savgol_filter(r, w, 2)
        kn, an = (13, 15) if j == 0 else (14, 16)
        s = xy[:, an] - xy[:, kn]; sl = np.linalg.norm(s, axis=1, keepdims=True) + 1e-6; su = s / sl
        c, sn = np.cos(a)[:, None], np.sin(a)[:, None]
        rot = np.concatenate([su[:, :1] * c - su[:, 1:] * sn, su[:, :1] * sn + su[:, 1:] * c], 1)
        out[:, j] = xy[:, an] + rot * (r[:, None] * sl)
    return out, ok
