"""Draw two raw captures' skeletons over the real frames of the recording they came from, side by side
(left: capture A, right: capture B), for N evenly spaced sample times. Evaluation only.

  python scripts/overlay_compare.py <video> <a.json> <b.json> <out.jpg> [--n 8] [--crop x,y,w,h] [--labels A,B]
"""
import argparse, json
import cv2, numpy as np

BONES = [(11, 13), (13, 15), (12, 14), (14, 16), (11, 12), (23, 24), (11, 23), (12, 24), (23, 25), (25, 27), (24, 26), (26, 28), (27, 29), (29, 31), (27, 31), (28, 30), (30, 32), (28, 32), (15, 17), (15, 19), (15, 21), (16, 18), (16, 20), (16, 22)]
HAND = [(0, 1), (1, 2), (2, 3), (3, 4), (0, 5), (5, 6), (6, 7), (7, 8), (0, 9), (9, 10), (10, 11), (11, 12), (0, 13), (13, 14), (14, 15), (15, 16), (0, 17), (17, 18), (18, 19), (19, 20)]


def nearest(frames, t):
    return min((f for f in frames if 'xy' in f), key=lambda f: abs(f['t'] - t), default=None)


def draw(img, f, color, min_v=0.3):
    if not f: return img
    xy, v = f['xy'], f.get('v') or [1] * 33
    for a, b in BONES:
        if v[a] >= min_v and v[b] >= min_v and xy[a][0] and xy[b][0]:
            cv2.line(img, (int(xy[a][0]), int(xy[a][1])), (int(xy[b][0]), int(xy[b][1])), color, 3, cv2.LINE_AA)
    for j, p in enumerate(xy):
        if v[j] >= min_v and p[0]: cv2.circle(img, (int(p[0]), int(p[1])), 4, color, -1, cv2.LINE_AA)
    wb = f.get('wb')
    if wb:
        for hand, sc in zip(wb['hands'], wb['handScores']):
            for a, b in HAND:
                if sc[a] >= min_v and sc[b] >= min_v:
                    cv2.line(img, (int(hand[a][0]), int(hand[a][1])), (int(hand[b][0]), int(hand[b][1])), (0, 220, 255), 2, cv2.LINE_AA)
    return img


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('video'); ap.add_argument('a'); ap.add_argument('b'); ap.add_argument('out')
    ap.add_argument('--n', type=int, default=8); ap.add_argument('--crop', default=None); ap.add_argument('--labels', default='A,B')
    o = ap.parse_args()
    A = json.load(open(o.a))['result']['frames']; B = json.load(open(o.b))['result']['frames']
    la, lb = o.labels.split(',')
    cap = cv2.VideoCapture(o.video); n = int(cap.get(7)); fps = cap.get(5); W, H = int(cap.get(3)), int(cap.get(4))
    crop = [float(v) for v in o.crop.split(',')] if o.crop else [0, 0, 1, 1]
    x0, y0, x1, y1 = int(crop[0] * W), int(crop[1] * H), int((crop[0] + crop[2]) * W), int((crop[1] + crop[3]) * H)
    rows = []
    for k in range(o.n):
        idx = int(k * (n - 1) / (o.n - 1)); cap.set(1, idx); ok, img = cap.read()
        if not ok: continue
        t = idx / fps
        left = draw(img.copy(), nearest(A, t), (60, 60, 255)); right = draw(img.copy(), nearest(B, t), (60, 230, 60))
        tiles = []
        for im, lab in ((left, la), (right, lb)):
            c = im[y0:y1, x0:x1]; c = cv2.resize(c, (420, int(420 * (y1 - y0) / (x1 - x0))))
            cv2.putText(c, f'{lab} {t:.1f}s', (8, 28), cv2.FONT_HERSHEY_SIMPLEX, 0.8, (255, 255, 255), 3, cv2.LINE_AA)
            cv2.putText(c, f'{lab} {t:.1f}s', (8, 28), cv2.FONT_HERSHEY_SIMPLEX, 0.8, (0, 0, 0), 1, cv2.LINE_AA)
            tiles.append(c)
        rows.append(np.hstack(tiles))
    sheet = np.vstack(rows)
    cv2.imwrite(o.out, sheet, [cv2.IMWRITE_JPEG_QUALITY, 85]); print('wrote', o.out, sheet.shape)


if __name__ == '__main__':
    main()
