# reference/ — Python prototype (behavioural spec, do not ship)

Built while exploring the idea on 3 real reels. Findings and numbers: `docs/04-pose-lab-findings.md`.
The renders in `renders/` are the agreed visual baseline.

## pose-pipeline/

| File | What it does |
|---|---|
| `mp_pose.py` | **Primary.** MediaPipe Pose Landmarker heavy (VIDEO mode) → 33 landmarks px + visibility + 3D world |
| `mp2coco.py` | MediaPipe-33 → COCO-17 keypoint file + feet file (heels, toe tips) used by the renderer |
| `proc.py` | Segment slicing + cleaning: L/R swap fix, confidence mask, spike removal, interpolation, Savitzky–Golay |
| `reps.py` | Rep period by pose autocorrelation + most seamless one-rep loop window |
| `analysis.py` | Joint angles, auto-pick the 2 most active joints |
| `feetproc.py` | Attach heel/toe to the shin (angle + length ratio), fill gaps, smooth |
| `staff.py` | Prop detector for a wooden staff: colour mask → Hough → extend ends |
| `staffproc3.py` | Rigid-rod tracker: constant length, rotate around grip, One-Euro filter, behind-body hysteresis |
| `render.py` | Renderer: fixed side colours, capsule torso, heel–toe feet, perspective floor, cast shadow, follow-cam, angle HUD, optional staff |
| `pose.py`, `pose2.py`, `legfix.py`, `feet.py` | Earlier YOLO path + fallbacks (collapsed-leg repair with a 2nd model, silhouette toes). Kept for the fallback logic only |

Run (needs `mediapipe opencv-python-headless scipy pillow python-bidi` + ffmpeg; model file
`pose_landmarker_heavy.task` from Google's MediaPipe model storage):
```
python mp_pose.py pose_landmarker_heavy.task in.mp4 mp.json
python mp2coco.py mp.json kp.json feet.json
python render.py kp.json in.mp4 out/ --hud --segs 0.6-12.6 --feet feet.json            # burpee reel
python render.py kp.json in.mp4 out/ --hud --segs 0-27.4 --staff staff.json --feet feet.json   # staff reel
```
`proc.py` has the reel-1 cut times hard-coded as the default segments; pass `--segs` otherwise.

## sample-data/

| File | |
|---|---|
| `reel1_mobility_mp33.json` | 3 moves with cuts (0–3.16, 3.17–12.96, 12.97–28.09 s), 510×892 @30 fps |
| `reel2_staff_mp33.json` + `reel2_staff_lines.json` | continuous staff flow 0–27.4 s + per-frame staff line detections |
| `reel3_burpee_mp33.json` | burpee-lunge, trim first 0.6 s (caption), period 5.2 s, loop ≈ 2.17–7.40 s |
| `reel1_yolo_coco17.json` | YOLO output for reel 1 (for comparison only) |
| `phone/reel4_plank_romove_mp33_phone.json` | **First on-device capture (Phase 0, 2026-10-27):** reel DdMRBycMKUx recorded in-app with ReplayKit, cropped to the embed video rect (884×1104), MediaPipe heavy GPU, 420 frames @ 39.2 fps variable, 413 detected. Same frame format plus `stats`, `crop`, `fullWidth/Height`. |

MediaPipe frame format: `{t, xy:[33][2] px, z:[33], v:[33] visibility, w:[33][3] world metres}`.
Videos are not included (third-party content); only derived skeletons.
