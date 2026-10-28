"""MediaPipe Pose Landmarker (heavy) in VIDEO mode: 33 landmarks incl. heels + toe tips,
image coords (px) + visibility, and metric 3D world landmarks (hip-centred)."""
import sys, json, cv2, numpy as np, mediapipe as mp
from mediapipe.tasks import python as mpt
from mediapipe.tasks.python import vision
model, vid, out = sys.argv[1:4]
opts = vision.PoseLandmarkerOptions(base_options=mpt.BaseOptions(model_asset_path=model),
        running_mode=vision.RunningMode.VIDEO, num_poses=1,
        min_pose_detection_confidence=.4, min_pose_presence_confidence=.4, min_tracking_confidence=.4)
lm = vision.PoseLandmarker.create_from_options(opts)
cap = cv2.VideoCapture(vid); fps = cap.get(5); W, H = int(cap.get(3)), int(cap.get(4)); res = []; i = 0
while True:
    ok, f = cap.read()
    if not ok: break
    img = mp.Image(image_format=mp.ImageFormat.SRGB, data=cv2.cvtColor(f, cv2.COLOR_BGR2RGB))
    r = lm.detect_for_video(img, int(i * 1000 / fps))
    e = {'t': round(i / fps, 4)}
    if r.pose_landmarks:
        L = r.pose_landmarks[0]; Wl = r.pose_world_landmarks[0]
        e['xy'] = [[round(p.x * W, 2), round(p.y * H, 2)] for p in L]
        e['z'] = [round(p.z * W, 2) for p in L]
        e['v'] = [round(p.visibility, 3) for p in L]
        e['w'] = [[round(p.x, 4), round(p.y, 4), round(p.z, 4)] for p in Wl]
    res.append(e); i += 1
json.dump(res, open(out, 'w')); print(len(res), sum('xy' in e for e in res))
