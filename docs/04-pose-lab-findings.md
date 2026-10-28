# Pose lab findings (Oct 2026)

Experiments run on 3 real Instagram reels (screen recordings) before writing app code.
Everything here is reproducible with `reference/pose-pipeline/`.

## Test set

| Reel | Content | Why it's hard |
|---|---|---|
| 1 — mobility | 3 moves, hard cuts (standing / seated / lunge flows), 28 s | segmentation, floor work, twists |
| 2 — staff | Shaolin staff flow, one continuous shot, 27 s, baggy clothes | prop, occlusion, fast spins, no cuts |
| 3 — burpee-lunge | side view, repeating, push-up with one leg raised, 12 s | overlapping legs, feet |

## Models compared

| | YOLO11m/x-pose (COCO-17) | YOLOv8x-pose-p6 | **MediaPipe Pose heavy (33)** |
|---|---|---|---|
| Feet | none | none | **heel + toe tip** |
| 3D | no | no | **yes (world, metres)** |
| Push-up raised leg (reel 3) | collapsed both legs onto the floor leg, conf 0.92 | separates legs, floor leg too short | **correct** |
| Time, 12 s clip on 2 CPUs | ~15 min (two passes) | ~3 s/frame | **17 s** |
| Frames with a person | — | — | reel 1: 874/883 · reel 2: 824/825 · reel 3: 367/380 |

Decision: **MediaPipe primary, Vision/second model only on frames that fail sanity checks.**

## What worked
- Scene-cut segmentation (ffmpeg-style histogram diff) for multi-move reels.
- Cleaning: L/R swap fix, spike removal, interpolation, Savitzky–Golay.
- Rep detection by pose autocorrelation: reel 3 → period 5.2 s (both sides), clean seamless loop chosen automatically.
- Auto-picking the 2 most active joints by angle range for the HUD (e.g. hip + elbow for burpees).
- Staff as a rigid rod + One-Euro filter + hysteresis (jerk 44 → 9 px/frame).
- Figure style v4 + perspective floor + cast shadow.

## What failed (don't repeat)
- Generating figures from an exercise **name** with an LLM ("L-rows"): ambiguous names, wrong anatomy.
- Bone-length clamping, invented feet, near/far colouring from confidence → rubbery / broken / flickering.
- Linear interpolation of a prop's endpoints → prop "shrinks" mid-turn. Rotate around the grip instead.
- Replacing both legs from the fallback model → broke the leg that was right.
- Downloading from Instagram server-side: blocked and against ToS. Use in-app capture.

## Open
- Use MediaPipe 3D to fix flat-looking twists and give props real depth.
- Prop detectors beyond a wooden staff (bands, kettlebells, rings).
- Form-check: compare user's own recording to the reference card.
