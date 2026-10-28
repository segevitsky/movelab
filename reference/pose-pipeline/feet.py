"""Measure feet from the person's silhouette (no foot keypoints needed).
Per frame: YOLO11x-seg person mask (crop around the pose). For each ankle, take silhouette pixels
within R of the ankle that lie beyond the ankle (away from the knee) and are closer to this shin
than to the other leg. Toe = farthest such pixel (robust: 95th percentile distance, then the point
nearest that radius in the dominant direction). Output toe points in video pixels + evidence score."""
import sys, json, cv2, numpy as np
from ultralytics import YOLO

kpf, vid, out = sys.argv[1:4]
D = json.load(open(kpf)); m = YOLO(sys.argv[4] if len(sys.argv) > 4 else 'yolo11x-seg.pt')
cap = cv2.VideoCapture(vid); fps = cap.get(5); res = []; i = 0
T = np.array([o['t'] for o in D])


def seg_dist(P, a, b):
    ab = b - a; t = np.clip(((P - a) @ ab) / (ab @ ab + 1e-6), 0, 1)
    return np.linalg.norm(P - (a + t[:, None] * ab), axis=1)


while True:
    ok, f = cap.read()
    if not ok: break
    t = i / fps; i += 1
    o = D[int(np.abs(T - t).argmin())]
    if not o.get('xy'): res.append({'t': round(t, 4)}); continue
    p = np.array(o['xy']); H, W = f.shape[:2]
    tor = np.linalg.norm((p[5] + p[6]) / 2 - (p[11] + p[12]) / 2)
    x0, y0 = p.min(0); x1, y1 = p.max(0); pad = tor * .9
    a, b = int(max(0, x0 - pad)), int(max(0, y0 - pad)); A, B = int(min(W, x1 + pad)), int(min(H, y1 + pad))
    r = m(f[b:B, a:A], imgsz=640, classes=[0], verbose=False, retina_masks=True)[0]
    if r.masks is None or len(r.masks) == 0: res.append({'t': round(t, 4)}); continue
    masks = r.masks.data.cpu().numpy() > .5
    # pick the mask that covers most hip/ankle keypoints
    best = max(range(len(masks)), key=lambda k: sum(masks[k][int(min(B - b - 1, max(0, p[j][1] - b))), int(min(A - a - 1, max(0, p[j][0] - a)))] for j in (11, 12, 13, 14, 15, 16)))
    ys, xs = np.nonzero(masks[best]); P = np.stack([xs + a, ys + b], 1).astype(float)
    entry = {'t': round(t, 4)}
    for side, (kn, an, okn, oan) in (('L', (13, 15, 14, 16)), ('R', (14, 16, 13, 15))):
        K, Ak = p[kn], p[an]; s = Ak - K; sl = np.linalg.norm(s) + 1e-6; s = s / sl
        R = sl * .55
        d = np.linalg.norm(P - Ak, axis=1)
        sel = (d < R) & ((P - Ak) @ s > -sl * .08)
        if sel.sum() < 15: continue
        Q = P[sel]
        mine = seg_dist(Q, K, Ak); other = np.minimum(seg_dist(Q, p[okn], p[oan]), np.linalg.norm(Q - p[oan], axis=1))
        Q = Q[mine <= other * .9]
        if len(Q) < 15: continue
        dq = np.linalg.norm(Q - Ak, axis=1)
        far = Q[dq >= np.percentile(dq, 90)]
        toe = far.mean(0)
        L = np.linalg.norm(toe - Ak)
        if L < sl * .12: continue
        entry['toe' + side] = toe.round(1).tolist(); entry['n' + side] = int(len(Q))
    res.append(entry)
json.dump(res, open(out, 'w'))
print(len(res), sum('toeL' in e for e in res), sum('toeR' in e for e in res))
