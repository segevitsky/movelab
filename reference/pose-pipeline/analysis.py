import numpy as np

JOINTS = {  # name: (a, b, c) angle at b ; R then L
    'מרפק': [(6, 8, 10), (5, 7, 9)],
    'כתף': [(12, 6, 8), (11, 5, 7)],
    'ירך': [(6, 12, 14), (5, 11, 13)],
    'ברך': [(12, 14, 16), (11, 13, 15)],
}


def angle(xy, a, b, c):
    u = xy[:, a] - xy[:, b]; v = xy[:, c] - xy[:, b]
    cos = (u * v).sum(1) / (np.linalg.norm(u, axis=1) * np.linalg.norm(v, axis=1) + 1e-6)
    return np.degrees(np.arccos(np.clip(cos, -1, 1)))


def top_joints(xy, k=2):
    rows = []
    for name, sides in JOINTS.items():
        for si, tri in enumerate(sides):
            a = angle(xy, *tri)
            rows.append((np.percentile(a, 95) - np.percentile(a, 5), name, si, tri))
    rows.sort(reverse=True)
    out, used = [], set()
    for r in rows:
        if r[1] in used: continue
        out.append(r); used.add(r[1])
        if len(out) == k: break
    return out  # (range, name, side 0=R 1=L, triple)


def key_poses(xy, tol=0.1, cap=60):
    from scipy.interpolate import CubicSpline
    tor = np.median(np.linalg.norm((xy[:, 5] + xy[:, 6]) / 2 - (xy[:, 11] + xy[:, 12]) / 2, axis=1))
    n = len(xy); keys = [0, n // 2, n - 1]; X = xy.reshape(n, -1)
    def recon(ks):
        ks = sorted(ks); return CubicSpline(ks, X[ks], bc_type='natural')(np.arange(n)).reshape(xy.shape)
    while True:
        r = recon(keys); err = np.percentile(np.linalg.norm(r - xy, axis=2), 90, axis=1) / tor
        i = int(err.argmax())
        if err[i] < tol or len(keys) >= cap: break
        keys.append(i)
    return sorted(keys), float(err.max())
