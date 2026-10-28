import json, sys, numpy as np
from scipy.signal import savgol_filter, medfilt

SEGS = [(0.0, 3.16), (3.17, 12.96), (12.97, 28.09)]
LEFT = [5, 7, 9, 11, 13, 15]
RIGHT = [6, 8, 10, 12, 14, 16]


def load(path):
    d = json.load(open(path))
    t = np.array([o['t'] for o in d])
    xy = np.full((len(d), 17, 2), np.nan)
    c = np.zeros((len(d), 17))
    for i, o in enumerate(d):
        if o['xy']:
            xy[i] = o['xy']; c[i] = o['c']
    return t, xy, c


def clean(xy, c, fps, thr=0.35):
    xy = xy.copy(); c = c.copy(); n = len(xy)
    # fix left/right identity swaps on arms and legs, frame to frame
    for grp in ([(7, 8), (9, 10)], [(13, 14), (15, 16)]):
        for i in range(1, n):
            keep = sum(np.linalg.norm(xy[i, a] - xy[i - 1, a]) + np.linalg.norm(xy[i, b] - xy[i - 1, b]) for a, b in grp)
            swap = sum(np.linalg.norm(xy[i, b] - xy[i - 1, a]) + np.linalg.norm(xy[i, a] - xy[i - 1, b]) for a, b in grp)
            if swap < keep * 0.6:
                for a, b in grp:
                    xy[i, [a, b]] = xy[i, [b, a]]; c[i, [a, b]] = c[i, [b, a]]
    xy[c < thr] = np.nan
    # outlier spikes: distance from a median-filtered track
    k = max(3, int(fps * 0.2) | 1)
    for j in range(17):
        for a in range(2):
            v = xy[:, j, a]; ok = ~np.isnan(v)
            if ok.sum() < 4: continue
            f = np.interp(np.arange(n), np.where(ok)[0], v[ok])
            m = medfilt(f, k)
            scale = np.nanmedian(np.abs(f - m)) * 6 + 6
            v[np.abs(f - m) > scale] = np.nan
    # interpolate gaps
    for j in range(17):
        for a in range(2):
            v = xy[:, j, a]; ok = ~np.isnan(v)
            if ok.sum() == 0: v[:] = 0; continue
            xy[:, j, a] = np.interp(np.arange(n), np.where(ok)[0], v[ok])
    w = max(5, int(fps * 0.37) | 1)
    if n > w:
        xy = savgol_filter(xy, w, 3, axis=0, mode='interp')
    return xy


def near_side(c, fps):
    s = c[:, RIGHT].mean(1) - c[:, LEFT].mean(1)
    k = max(3, int(fps * 0.5))
    s = np.convolve(np.pad(s, k, mode='edge'), np.ones(2 * k + 1) / (2 * k + 1), 'valid')
    return s  # >0 → right side is nearer


def segments(path, segs=None):
    t, xy, c = load(path)
    fps = 1 / np.median(np.diff(t))
    out = []
    for a, b in (segs or SEGS):
        m = (t >= a) & (t <= b)
        out.append(dict(t=t[m], xy=clean(xy[m], c[m], fps), near=near_side(c[m], fps), fps=fps))
    return out
