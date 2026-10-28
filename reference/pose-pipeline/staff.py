"""Detect a long wooden staff per frame: colour mask -> Hough longest line -> extend ends along the line
with a relaxed colour test. Output: [{t, p1:[x,y], p2:[x,y], ok}] in video pixels."""
import sys, json, cv2, numpy as np

vid, kpf, out = sys.argv[1:4]
K = json.load(open(kpf)); KT = np.array([o['t'] for o in K])
cap = cv2.VideoCapture(vid); fps = cap.get(5); res = []; i = 0
while True:
    ok, f = cap.read()
    if not ok: break
    t = i / fps; i += 1
    H, W = f.shape[:2]
    hsv = cv2.cvtColor(f, cv2.COLOR_BGR2HSV)
    strict = cv2.inRange(hsv, (5, 90, 60), (22, 255, 235))
    loose = cv2.inRange(hsv, (3, 35, 70), (26, 255, 255))
    strict[:int(H * .13)] = 0; loose[:int(H * .13)] = 0          # top logo/bar
    o = K[int(np.abs(KT - t).argmin())]
    if o['xy']:
        p = np.array(o['xy']); sw = np.linalg.norm(p[5] - p[6]) + 20
        for j, r in ((0, .55), (9, .28), (10, .28)):              # face, hands (skin)
            if j == 0: cv2.circle(strict, tuple(map(int, p[j])), int(sw * r), 0, -1)
    lines = cv2.HoughLinesP(strict, 1, np.pi / 180, 30, minLineLength=40, maxLineGap=25)
    if lines is None: res.append({'t': round(t, 4), 'ok': False}); continue
    L = lines.reshape(-1, 4).astype(float)
    a = L[np.argmax(np.hypot(L[:, 2] - L[:, 0], L[:, 3] - L[:, 1]))]
    p1, p2 = a[:2], a[2:]; d = (p2 - p1) / (np.linalg.norm(p2 - p1) + 1e-6); n = np.array([-d[1], d[0]])
    # pool collinear segments
    pts = []
    for s in L:
        for q in (s[:2], s[2:]):
            if abs(np.dot(q - p1, n)) < 6: pts.append(np.dot(q - p1, d))
    lo, hi = min(pts + [0]), max(pts + [np.linalg.norm(a[2:] - a[:2])])
    def extend(s0, step):
        s, gap = s0, 0
        while gap < 14:
            s += step; q = p1 + d * s
            x, y = int(round(q[0])), int(round(q[1]))
            if not (0 <= x < W and 0 <= y < H): break
            hit = any(loose[min(H - 1, max(0, y + k * int(round(n[1] * 1)))), min(W - 1, max(0, x + k * int(round(n[0])) ))] for k in (-2, -1, 0, 1, 2))
            gap = 0 if hit else gap + 1
        return s - step * gap
    lo, hi = extend(lo, -1), extend(hi, 1)
    res.append({'t': round(t, 4), 'ok': True, 'p1': (p1 + d * lo).round(1).tolist(), 'p2': (p1 + d * hi).round(1).tolist()})
json.dump(res, open(out, 'w'))
print(len(res), sum(r['ok'] for r in res))
