"""Rep detection for a repeating movement.
Pose -> body-normalised vector per frame -> distance at lag L. The period is the lag (1.5-8 s)
with the lowest mean distance, accepted only if clearly below the 'random lag' baseline.
Then: rep count, and the single most seamless one-rep window for a looping card."""
import numpy as np


def normalise(xy):
    mh = (xy[:, 11] + xy[:, 12]) / 2; ms = (xy[:, 5] + xy[:, 6]) / 2
    tor = np.median(np.linalg.norm(ms - mh, axis=1))
    return ((xy - mh[:, None]) / tor).reshape(len(xy), -1), tor


def find_period(xy, fps, lo=1.5, hi=8.0):
    N, _ = normalise(xy); n = len(N)
    lags = range(int(fps * lo), min(int(fps * hi), n - int(fps * 1.0)))
    D = np.array([np.linalg.norm(N[L:] - N[:-L], axis=1).mean() for L in lags])
    if len(D) == 0: return None
    base = np.median(D); i = int(np.argmin(D))
    # prefer the first strong minimum (avoid picking 2x the period)
    for j in range(1, len(D) - 1):
        if D[j] < D[j - 1] and D[j] <= D[j + 1] and D[j] < base * .55:
            i = j; break
    L = list(lags)[i]; score = D[i] / base
    return dict(period=L / fps, lag=L, score=float(score), periodic=bool(score < .6))


def best_loop(xy, lag):
    N, _ = normalise(xy); n = len(N)
    seams = [(np.linalg.norm(N[i] - N[i + lag]) + .5 * np.linalg.norm((N[i + 1] - N[i]) - (N[i + lag + 1] - N[i + lag])), i)
             for i in range(0, n - lag - 1)]
    e, i0 = min(seams)
    return i0, i0 + lag, float(e)
