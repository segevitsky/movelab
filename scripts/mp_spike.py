"""Run the app's own MediaPipe model (assets/models/pose_landmarker_heavy.task) on a screen recording with the
same crop as rtmw_spike.py, writing the same raw-capture layout — the apples-to-apples baseline for Phase 17.

  python scripts/mp_spike.py <video> <out.json> [--crop x,y,w,h] [--every N]
"""
import argparse, json, time
import cv2, numpy as np
import mediapipe as mp
from mediapipe.tasks import python as mpt
from mediapipe.tasks.python import vision

MODEL = '/Users/segevshoval/Desktop/workspace/movelab/assets/models/pose_landmarker_heavy.task'


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('video'); ap.add_argument('out')
    ap.add_argument('--crop', default=None); ap.add_argument('--every', type=int, default=1)
    a = ap.parse_args()
    crop = [float(v) for v in a.crop.split(',')] if a.crop else None
    opts = vision.PoseLandmarkerOptions(base_options=mpt.BaseOptions(model_asset_path=MODEL), running_mode=vision.RunningMode.VIDEO, num_poses=1,
                                        min_pose_detection_confidence=0.5, min_tracking_confidence=0.5)
    lm = vision.PoseLandmarker.create_from_options(opts)
    cap = cv2.VideoCapture(a.video)
    fps = cap.get(cv2.CAP_PROP_FPS) or 30
    W, H = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH)), int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    frames, i, t0 = [], 0, time.time()
    while True:
        ok, img = cap.read()
        if not ok: break
        if i % a.every: i += 1; continue
        t = i / fps
        ox = oy = 0
        if crop:
            x0, y0 = int(crop[0] * W), int(crop[1] * H); x1, y1 = int((crop[0] + crop[2]) * W), int((crop[1] + crop[3]) * H)
            img = img[y0:y1, x0:x1]; ox, oy = x0, y0
        h, w = img.shape[:2]
        mimg = mp.Image(image_format=mp.ImageFormat.SRGB, data=cv2.cvtColor(img, cv2.COLOR_BGR2RGB))
        res = lm.detect_for_video(mimg, int(t * 1000))
        fr = {'t': round(t, 4)}
        if res.pose_landmarks:
            L = res.pose_landmarks[0]; Wd = res.pose_world_landmarks[0]
            fr['xy'] = [[round(p.x * w + ox, 2), round(p.y * h + oy, 2)] for p in L]
            fr['v'] = [round(p.visibility, 3) for p in L]
            fr['w'] = [[round(p.x, 4), round(p.y, 4), round(p.z, 4)] for p in Wd]
        frames.append(fr); i += 1
    det = sum(1 for f in frames if 'xy' in f)
    json.dump({'version': 1, 'savedAt': int(time.time() * 1000), 'title': f'mp:{a.video}', 'model': 'pose_landmarker_heavy',
               'result': {'width': W, 'height': H, 'fps': fps / a.every, 'frames': frames}}, open(a.out, 'w'))
    print(f'{len(frames)} frames ({det} with a person) → {a.out} [{time.time() - t0:.0f} s]')


if __name__ == '__main__':
    main()
