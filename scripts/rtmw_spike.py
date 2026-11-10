"""Phase 16/17 spike: run RTMW (COCO-WholeBody, 133 keypoints) on a screen recording and write a MoveLab raw
capture (MediaPipe-33 layout + 'wb' extras) so the TS pipeline and scripts/preview.ts can consume it.

  python scripts/rtmw_spike.py <video.mp4|mov> <out-capture.json> [--mode balanced|performance|lightweight] [--every N]

Needs the rtmlib venv (see docs/07-changelog.md 2026-11-10). Models download on first run (OpenMMLab).
Output frame: { t, xy: 33×[x,y], c: 33 visibilities, wb: { hands: [21×[x,y]]×2, feet: 6×[x,y], scores } }.
No video leaves the Mac; this is an offline evaluation tool, not shipped code.
"""
import json, sys, time, argparse
import numpy as np
import cv2
from rtmlib import Wholebody

# COCO-WholeBody body (0–16) → MediaPipe-33 index
COCO2MP = {0: 0, 1: 2, 2: 5, 3: 7, 4: 8, 5: 11, 6: 12, 7: 13, 8: 14, 9: 15, 10: 16, 11: 23, 12: 24, 13: 25, 14: 26, 15: 27, 16: 28}
# feet 17–22: L big toe, L small toe, L heel, R big toe, R small toe, R heel → MP toe 31/32, heel 29/30
FEET2MP = {17: 31, 19: 29, 20: 32, 22: 30}
# hands: 91–111 left (0 wrist, 1–4 thumb, 5–8 index, 9–12 middle, 13–16 ring, 17–20 pinky), 112–132 right
HAND_L, HAND_R = 91, 112
# MP pinky 17/18 = pinky knuckle, index 19/20 = index knuckle, thumb 21/22 = thumb knuckle #2
HAND2MP = {17: HAND_L + 17, 18: HAND_R + 17, 19: HAND_L + 5, 20: HAND_R + 5, 21: HAND_L + 2, 22: HAND_R + 2}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('video'); ap.add_argument('out')
    ap.add_argument('--mode', default='balanced'); ap.add_argument('--every', type=int, default=1)
    ap.add_argument('--min-score', type=float, default=0.3)
    a = ap.parse_args()
    wb = Wholebody(to_openpose=False, mode=a.mode, backend='onnxruntime', device='cpu')
    cap = cv2.VideoCapture(a.video)
    fps = cap.get(cv2.CAP_PROP_FPS) or 30
    W, H = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH)), int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    frames, i, t0 = [], 0, time.time()
    while True:
        ok, img = cap.read()
        if not ok: break
        if i % a.every: i += 1; continue
        t = i / fps
        kps, scores = wb(img)  # (n_person, 133, 2), (n_person, 133)
        fr = {'t': round(t, 4)}
        if len(kps):
            # the person with the highest mean body score
            p = int(np.argmax(scores[:, :17].mean(axis=1)))
            k, s = kps[p], scores[p]
            xy = [[float('nan'), float('nan')]] * 33
            c = [0.0] * 33
            for src, dst in {**COCO2MP, **FEET2MP, **HAND2MP}.items():
                xy[dst] = [round(float(k[src][0]), 2), round(float(k[src][1]), 2)]
                c[dst] = round(float(s[src]), 3)
            for j in range(33):
                if c[j] < a.min_score: xy[j] = [float('nan'), float('nan')]
            fr['xy'] = [[None if np.isnan(v) else v for v in p_] for p_ in xy]
            fr['c'] = c
            fr['wb'] = {
                'hands': [[[round(float(k[HAND_L + q][0]), 2), round(float(k[HAND_L + q][1]), 2)] for q in range(21)],
                          [[round(float(k[HAND_R + q][0]), 2), round(float(k[HAND_R + q][1]), 2)] for q in range(21)]],
                'handScores': [[round(float(s[HAND_L + q]), 3) for q in range(21)], [round(float(s[HAND_R + q]), 3) for q in range(21)]],
                'feet': [[round(float(k[q][0]), 2), round(float(k[q][1]), 2)] for q in range(17, 23)],
                'feetScores': [round(float(s[q]), 3) for q in range(17, 23)],
            }
        frames.append(fr)
        i += 1
        if i % 30 == 0: print(f'  {i} frames, {time.time() - t0:.0f} s', flush=True)
    det = sum(1 for f in frames if 'xy' in f)
    out = {'version': 1, 'savedAt': int(time.time() * 1000), 'title': f'rtmw:{a.video}', 'model': f'rtmw-{a.mode}',
           'result': {'width': W, 'height': H, 'fps': fps / a.every, 'frames': frames}}
    json.dump(out, open(a.out, 'w'))
    print(f'{len(frames)} frames ({det} with a person) at {fps / a.every:.1f} fps → {a.out}  [{time.time() - t0:.0f} s]')


if __name__ == '__main__':
    main()
