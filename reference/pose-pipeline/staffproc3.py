"""Staff tracking v3: rigid rod (length L), state = centre C + angle theta.
- Detected line is trusted when present. If it is shorter than L, the rod is completed by
  placing the centre on the side that best continues the previous centre (no end-flipping).
- Missing frames: centre follows the hands (offset from wrist midpoint interpolated), angle interpolated.
- One-Euro filter on centre and angle: smooth when slow, responsive when fast.
- 'behind body' with hysteresis (needs 4 frames to change)."""
import json, numpy as np, cv2


def body_poly(P, tor):
    ms, mh = (P[5] + P[6]) / 2, (P[11] + P[12]) / 2
    u = (ms - mh) / (np.linalg.norm(ms - mh) + 1e-6); n = np.array([-u[1], u[0]])
    w = max(np.linalg.norm(P[5] - P[6]), tor * .45) / 2 + tor * .08
    head = ms + u * tor * .45; hr = tor * .3
    return np.array([mh - n * w, mh + n * w, ms + n * w, head + n * hr, head + u * hr, head - n * hr, ms - n * w], np.float32)


def inside(poly, p): return cv2.pointPolygonTest(poly.reshape(-1, 1, 2), (float(p[0]), float(p[1])), False) >= 0


class OneEuro:
    def __init__(self, fps, mincut=1.2, beta=0.04, dcut=1.0):
        self.f, self.mc, self.b, self.dc = fps, mincut, beta, dcut; self.x = None; self.dx = 0
    def a(self, c): r = 2 * np.pi * c / self.f; return r / (r + 1)
    def __call__(self, x):
        x = np.asarray(x, float)
        if self.x is None: self.x = x; self.dx = np.zeros_like(x); return x
        dx = (x - self.x) * self.f; ad = self.a(self.dc); self.dx = ad * dx + (1 - ad) * self.dx
        c = self.mc + self.b * np.linalg.norm(self.dx); al = self.a(c)
        self.x = al * x + (1 - al) * self.x; return self.x


def build(staff_json, vid, times, xy, tor, fps):
    S = json.load(open(staff_json)); st = np.array([s['t'] for s in S])
    L = float(np.percentile([np.hypot(s['p2'][0] - s['p1'][0], s['p2'][1] - s['p1'][1]) for s in S if s.get('ok')], 97))
    n = len(times); C = np.full((n, 2), np.nan); TH = np.full(n, np.nan); BH = np.zeros(n, bool)
    prevC = None; prevU = None; vel = np.zeros(2); miss = 0
    for k, t in enumerate(times):
        s = S[int(np.abs(st - t).argmin())]
        if not s.get('ok'): continue
        P = xy[k]; a, b = np.array(s['p1']), np.array(s['p2'])
        l = np.linalg.norm(b - a); u = (b - a) / (l + 1e-6); nn = np.array([-u[1], u[0]])
        if min(abs(np.dot(P[w] - a, nn)) for w in (9, 10)) > tor * .4: continue
        if prevU is not None and np.dot(u, prevU) < 0: u = -u; a, b = b, a
        if l >= L * .9:
            c = (a + b) / 2; bh = False
        else:
            cands = [b - u * L / 2, a + u * L / 2]      # extend toward a / toward b
            if prevC is not None:
                pred = prevC + vel
                j = int(np.argmin([np.linalg.norm(q - pred) for q in cands]))
            else:
                ctr = (P[5] + P[6] + P[11] + P[12]) / 4
                j = 0 if np.linalg.norm(a - ctr) < np.linalg.norm(b - ctr) else 1
            c = cands[j]
            hidden = (a - u * (L - l) / 2) if j == 0 else (b + u * (L - l) / 2)
            bh = inside(body_poly(P, tor), hidden)
        if prevC is not None and np.linalg.norm(c - (prevC + vel)) > tor * .8 and miss < 3:
            miss += 1; continue                          # outlier vs motion prediction -> treat as missing
        miss = 0
        if prevC is not None: vel = .6 * vel + .4 * (c - prevC)
        C[k] = c; TH[k] = np.arctan2(u[1], u[0]); BH[k] = bh; prevC = c; prevU = u
    ok = ~np.isnan(TH); idx = np.arange(n)
    hm = (xy[:, 9] + xy[:, 10]) / 2
    off = C - hm
    th = np.interp(idx, idx[ok], np.unwrap(TH[ok], period=np.pi))
    off = np.stack([np.interp(idx, idx[ok], off[ok, c]) for c in range(2)], 1)
    Cf = hm + off
    fc, fa = OneEuro(fps, 2.5, .06), OneEuro(fps, 2.5, 1.5)
    out_c = np.array([fc(c) for c in Cf]); out_t = np.array([fa(v) for v in th])
    # hysteresis on behind flag
    bh = np.zeros(n, bool); state = False; run = 0
    for k in range(n):
        want = BH[k] if ok[k] else state
        run = run + 1 if want != state else 0
        if run >= 4: state = want; run = 0
        bh[k] = state
    U = np.stack([np.cos(out_t), np.sin(out_t)], 1)
    return dict(A=out_c - U * L / 2, B=out_c + U * L / 2, Z=np.zeros((n, 2)), behind=bh, L=L, ok=ok)
