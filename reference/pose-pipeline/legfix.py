"""Leg-collapse repair: where the main model puts both legs on the same leg (knees+ankles nearly
coincide), re-detect with a second model (YOLOv8x-pose-p6 @960, full frame) and take its legs if
they are clearly separated. Writes a new keypoint file."""
import sys, json, cv2, numpy as np
from ultralytics import YOLO
kp, vid, out = sys.argv[1:4]
D = json.load(open(kp)); m = YOLO(sys.argv[4] if len(sys.argv) > 4 else 'yolov8x-pose-p6.pt')
tors = [np.linalg.norm((np.array(o['xy'][5]) + o['xy'][6]) / 2 - (np.array(o['xy'][11]) + o['xy'][12]) / 2) for o in D if o['xy']]
tor = float(np.median(tors))
def gap(xy): return max(np.linalg.norm(xy[15] - xy[16]), np.linalg.norm(xy[13] - xy[14])) / tor
bad = [i for i, o in enumerate(D) if o['xy'] and gap(np.array(o['xy'])) < .2]
print('collapsed frames', len(bad), 'of', len(D))
cap = cv2.VideoCapture(vid); fps = cap.get(5); fixed = 0
for i in bad:
    cap.set(cv2.CAP_PROP_POS_FRAMES, int(round(D[i]['t'] * fps))); ok, f = cap.read()
    if not ok: continue
    r = m(f, imgsz=960, verbose=False)[0]
    if r.keypoints is None or len(r.keypoints.xy) == 0: continue
    k = int(r.boxes.conf.argmax()); xy = r.keypoints.xy[k].cpu().numpy(); c = r.keypoints.conf[k].cpu().numpy()
    old = np.array(D[i]['xy'])
    if gap(xy) > .25 and np.linalg.norm((xy[11] + xy[12]) / 2 - (old[11] + old[12]) / 2) < tor * .3:
        # keep the main model's (correct) leg; take only the *other* leg from the second model
        main_leg = (old[13] + old[14]) / 2, (old[15] + old[16]) / 2          # collapsed -> both slots ~ same leg
        dL = np.linalg.norm(xy[13] - main_leg[0]) + np.linalg.norm(xy[15] - main_leg[1])
        dR = np.linalg.norm(xy[14] - main_leg[0]) + np.linalg.norm(xy[16] - main_leg[1])
        kn, an = (14, 16) if dL < dR else (13, 15)                           # the leg far from the main one
        okn, oan = (13, 15) if (kn, an) == (14, 16) else (14, 16)
        D[i]['xy'][okn] = main_leg[0].round(2).tolist(); D[i]['xy'][oan] = main_leg[1].round(2).tolist()
        D[i]['xy'][kn] = xy[kn].round(2).tolist(); D[i]['xy'][an] = xy[an].round(2).tolist()
        D[i]['c'][kn] = float(round(c[kn], 3)); D[i]['c'][an] = float(round(c[an], 3))
        D[i]['legfix'] = True; fixed += 1
json.dump(D, open(out, 'w')); print('fixed', fixed)
