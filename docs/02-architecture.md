# MoveLab — Architecture

> v2 (after the pose lab, see `docs/04-pose-lab-findings.md`): **MediaPipe is the primary pose model**
> (feet + 3D, ~20× faster than the YOLO prototype). Apple Vision is the fallback.

## 1. Stack

| Layer | Choice | Why |
|---|---|---|
| App | **Expo (React Native) + TypeScript**, dev client (not Expo Go) | Owner is a senior React dev; Expo handles builds/signing/OTA |
| Navigation | expo-router | file-based, simple |
| Drawing | **@shopify/react-native-skia** | 60 fps stick figure, works for player + cards |
| Local DB | **expo-sqlite + drizzle-orm** | local-first, offline, typed |
| State | zustand (UI) + drizzle queries (data) | minimal |
| Native: share | share extension via an Expo config plugin (e.g. `expo-share-intent`) | receive Instagram URL from the share sheet |
| Native: record | **local Expo module (Swift) wrapping ReplayKit `RPScreenRecorder`** | one-tap in-app recording of the embed |
| Native: pose | **local Expo module (Swift) wrapping MediaPipe Tasks iOS `PoseLandmarker` (heavy), VIDEO mode** | 33 landmarks incl. **heels + toe tips**, 3D world coords, on-device; proven on all 3 test reels |
| Native: pose fallback | Apple Vision `VNDetectHumanBodyPoseRequest` / `…3DRequest` | second opinion only for frames that fail sanity checks (§4.2) |
| Native: text | Vision `VNRecognizeTextRequest` (OCR), `SFSpeechRecognizer` (audio) | extra context from the reel |
| Backend | tiny serverless proxy (Cloudflare Worker or Supabase Edge Function) | holds the LLM key; receives **text/metadata only**, never video |
| LLM | Claude API (provider is **OPEN**) | tagging, explanations, remixes |
| Tests | vitest for pure TS (pipeline, generator); Maestro for a smoke E2E later | |

The MediaPipe model file (`pose_landmarker_heavy.task`, ~30 MB) ships in the app bundle.

## 2. Repo layout

```
app/                      expo-router screens
  (tabs)/library.tsx
  (tabs)/today.tsx
  (tabs)/goals.tsx
  capture/[id].tsx        embed (or logged-in Instagram page) + record
  review/[captureId].tsx  detected exercises
  player/[workoutId].tsx
  frameworks/…
modules/
  screen-recorder/        Swift: ReplayKit start/stop → file URL
  pose/                   Swift: video URL → frames → MediaPipe 33 landmarks (+3D) ; Vision fallback ; OCR
src/
  db/                     drizzle schema, migrations, queries
  pipeline/               PURE TS: segment, clean, sanity checks, reps/loop, props, features
  generator/              PURE TS: framework fill, scoring, sampling
  figure/                 Skia figure renderer (pure draw from joints)
  player/                 timeline builder + player state machine
  ai/                     backend client
backend/                  worker: POST /tag, POST /explain, POST /remix
reference/                Python prototype + sample data (read-only, behavioural spec)
```

Rule: `src/pipeline` and `src/generator` are pure and unit-tested. Native modules only do I/O
(record, decode frames, run models) and return plain JSON.

## 3. Capture → model pipeline

```
Share URL ─► Capture screen
              WebView loads https://www.instagram.com/reel/<id>/embed
                (if embed is disabled / login wall: load the reel page in a WebView where the user
                 has logged in to Instagram themselves — we never read or store credentials)
              injected JS reads caption + username + the video element rect
              [Model it] ─► ScreenRecorder.start()
              user taps play; on video 'ended' (or tap) ─► ScreenRecorder.stop() → file://rec.mp4
          ─► Pose.process(rec.mp4, cropRect)        (Swift, background)
              decode at 30 fps, crop to the video rect
              MediaPipe VIDEO mode: 33 landmarks (px) + visibility + world 3D (m)
              every ~0.5 s: OCR ; audio: speech-to-text (optional)
              per-frame scene-cut score (histogram diff) ; per-frame "person present"
              → raw.json
          ─► src/pipeline (TS)
              1. trim frames with no person (captions/overlays at start/end)
              2. segment (§4.1)
              3. clean (§4.3) + sanity checks with fallback (§4.2)
              4. reps + seamless loop (§4.4) ; props (§4.5, optional)
              5. features: active joints, ROM, tempo, start/end pose
              6. tagging request to backend (caption, OCR, transcript, features) → names + tags
          ─► Review screen → user confirms → DB
          ─► delete rec.mp4
```

## 4. Pipeline details (ports of `reference/pose-pipeline/*`, all proven on real reels)

### 4.1 Segmentation
- Scene cuts (histogram diff > threshold) split a multi-exercise reel. Reel 1: cuts at 3.17 s / 12.97 s → 3 exercises.
- **No cuts ≠ one exercise automatically wrong:** a continuous flow (staff reel, 27 s) stays one exercise.
  The review screen lets the user split/merge manually.
- Pose discontinuity (big normalised jump between frames) is a secondary cut signal.

### 4.2 Sanity checks + fallback model
Model confidence is not trustworthy (YOLO reported 0.92 on a leg it had collapsed onto the other).
Run our own checks per frame; on failure, re-run only those frames with the fallback model:
- **Leg collapse:** knees and ankles both within 0.2 × torso of each other.
- **Arm collapse:** same for elbows/wrists.
- **Implausible bone length:** > 1.4× the segment's 97th-percentile length.
Fallback result is accepted only if the hips agree (< 0.3 × torso) and the check now passes; replace
**only the failing limb**, keep the rest (replacing both legs broke the correct one).

### 4.3 Cleaning (`reference/pose-pipeline/proc.py`)
Per segment, joints `[frames][N][x,y]` + confidences:
1. **L/R swap fix** for elbows/wrists and knees/ankles (swap if < 0.6× the cost of keeping).
2. Confidence < 0.35 → NaN. 3. **Spike removal** vs median-filtered track. 4. **Gap fill** (linear).
5. **Smooth:** Savitzky–Golay ≈ 0.37 s, order 3.
Do NOT: clamp bone lengths, invent feet, infer near/far side from confidence (all made it worse).

### 4.4 Reps and the looping card (`reference/pose-pipeline/reps.py`)
- Normalise pose per frame (hip-centred, ÷ torso). Mean distance at lag L for L ∈ [1.5 s, 8 s].
- Period = first strong minimum < 0.55 × median; `periodic` if score < 0.6.
- Loop window = the one-period window whose start and end pose (and velocity) match best.
- Alternating-side moves have period = both sides (burpee-lunge reel: 5.2 s, ~2.3 reps). Correct behaviour.
- Non-periodic flows: card loops the whole segment with a short cross-fade.

### 4.5 Props layer (optional, per prop type) — proven with a wooden staff
`reference/pose-pipeline/staff.py` + `staffproc3.py`:
- Detect: colour mask → Hough longest line → extend ends with a relaxed colour test; reject lines not near a wrist.
- Track as a **rigid rod** (constant length L = 97th pct): state = centre + angle.
  Partially hidden → complete to L on the side that continues the previous centre (no end flipping).
  Missing frames → angle interpolated (unwrapped mod π), centre follows the hands.
- **One-Euro filter** (smooth when slow, responsive when fast); outlier gating vs motion prediction;
  in-front/behind-body flag with 4-frame hysteresis.
- Result: end-jerk median 44 → 9 px/frame; spikes 449 → 76; flips 14 → 6.
v1 ships without props. Props = later phase, one detector per prop type.

### 4.6 Feet
From MediaPipe heel (29/30) + toe tip (31/32), visibility > 0.3; expressed relative to the shin
(angle, length ratio) so they move with the leg; gaps interpolated. Fallback without foot landmarks:
silhouette-based toe measurement (`feet.py`, person segmentation) — works in normal stances, fails
when the ankle itself is wrong.

## 5. Figure rendering (`src/figure`, Skia) — `reference/pose-pipeline/render.py`

- Right side dark, left side grey — **fixed**, never flips. Front limbs get a background outline.
- Thick spine capsule + shoulder/hip bars, round caps; head on short neck (smoothed).
- **Feet:** filled ankle–heel–toe triangle, only when detected.
- Floor: perspective grid toward a vanishing point + projected (cast) shadow of every limb.
- Follow-cam: constant scale per exercise, smoothed horizontal centre; ground anchored at ~87 % height.
- Optional HUD: two most-active joints (auto-chosen by range), rounded to 5°, fixed corner.
- Props drawn as shaded cylinders (dark rim, mid body, highlight, elliptic tips), behind/in front by flag.
Storage per exercise: 15 fps, 33 landmarks int16 (+ optional 3D) → ~2 KB/s.

## 5a. Scene elements (floor mat + auto-crop)

Goal: the card shows the figure on *its* mat, in perspective, instead of a generic floor; and a screen
recording of a reel is cropped to the reel automatically. Both are computed on device from the recording
before it is deleted; only the results (a quad, a rect) are stored (`exercise.scene`).

**Auto-crop of the reel area in a screen recording** (replaces the WebView rect when it is unreliable):
per-pixel temporal standard deviation over the recording (sampled at ~2 fps, downscaled) → threshold →
largest connected moving box (the video area moves, the UI chrome does not) → padded rect, snapped to even
pixels. Used by `Pose.process(cropRect)`; shown in Review for confirmation.

**Floor mat detection** (static camera only — skip when the hip-centre background shifts > 5 % of width):
1. Temporal median of the (cropped) frames → background image without the person.
2. Dark floor core: the darkest large blob in the lower half (mats are darker than most floors; verify the
   blob's bottom edge is below the 97th-percentile ankle line used for `ground`).
3. Fill the region enclosed by Canny edges around that core (flood fill from the core, stopped by edges).
4. Fit a 4-point quad (min-area quadrilateral / Douglas-Peucker to 4 corners), ordered TL, TR, BR, BL.
   Reject if the quad is < 15 % of the frame or not convex.
5. Fallback: the user taps the 4 corners in the Review screen (same quad format). The quad can be edited
   or removed later in the exercise detail.

**Rendering** (`src/figure`): the quad is drawn as a flat perspective slab under the figure (fill slightly
darker than the floor, thin rim) and the cast shadow becomes translucent (alpha ≈ 0.35) so it reads on
both the mat and the floor. Grid lines pass under the mat. Follow-cam and ground anchoring are unchanged:
the mat is in source pixels like the joints, so it moves with the camera.

Storage: `exercise.scene = { matQuad?: [[x,y]×4] (source px), cropRect?: {x,y,width,height} (normalised
to the recording), cameraStatic: boolean }`. The mat is optional everywhere; absence = generic floor.
Native side: `modules/pose` gets `sceneAnalysis(fileUri) → { cropRect, matQuad?, cameraStatic }`
(Core Image / vImage; OpenCV is not required for median, Canny, flood fill at this scale).

Phase: detection + Review tap-fallback in **Phase 4** (capture flow); mat drawing in the renderer as soon as
a quad exists. Not in v1: mats that move with the camera, multiple mats, non-rectangular mats.

## 6. Generator (`src/generator`)

Inputs: framework, library, pairing graph, active goals, history (last 14 days), today's inputs
(time, energy, equipment, focus), `surprise` 0..1.

```
for block in framework.blocks:
  for slot in block.slots:
    candidates = library.filter(slot.tags, equipment, not excluded)
    if slot.isSkill and activeGoal: pick goal.currentStage; continue
    score(c) =  w1·pairing(c, prev picks)          # learned co-occurrence
              + w2·flow(prevEndPose, c.startPose)   # pose distance, lower = better
              − w3·recency(c)                       # used in last 3 workouts → heavy penalty
              − w4·muscleClash(c, round)            # same primary muscle twice in a round
              + w5·focusMatch(c)
    pick = sample(softmax(score / T)),  T = lerp(0.2, 1.5, surprise)
```
- Deterministic with a seed. Swap = re-sample one slot with the rest fixed.
- Time fitting: scale reps/hold or drop optional slots to hit "time available"; rep durations come from §4.4.
- LLM is **not** in the hot path: it writes the one-line "why"; `remix` proposes **only library IDs**.

Timeline builder turns a workout into timed steps (work/rest/transition) for the player.

## 7. Data model (drizzle / SQLite)

```
exercise(id, name, aliases[], pattern, slots[], equipment[], props[], intensity, primaryMuscles[],
         dosageDefault{type: reps|time, value}, repSeconds?, notes, startPose, endPose,
         figure (blob: 33 lm @15fps), loopStart, loopEnd, figure3d (blob?), sourceId?, createdAt, archived)
source(id, platform, url, coach, caption, ocrText, transcript, capturedAt)
source_exercise(sourceId, exerciseId, order, startSec, endSec)        # context for the graph
pairing(aId, bId, weight, directedWeight)                              # derived, rebuildable
framework(id, name, blocks json, isPreset)
goal(id, name, stages json[{exerciseId, criterion}], currentStage, active)
workout(id, frameworkId, seed, inputs json, items json, createdAt)
session(id, workoutId, startedAt, endedAt, feedback, perExercise json)
```

## 8. Backend (`backend/`)

- `POST /tag` → { caption, ocr, transcript, features } → { name, aliases, pattern, slots, equipment,
  intensity, primaryMuscles, dosage, notes }. JSON-schema validated.
- `POST /explain` → workout → one sentence.
- `POST /remix` → { libraryIds, request } → { items: libraryIds[] } (rejects unknown IDs).
- Auth: per-device token; rate-limited. No video, no Instagram credentials, ever.

## 9. Risks (verify early)

| Risk | Check in | Fallback |
|---|---|---|
| ReplayKit doesn't capture the embed's video layer | Phase 0 | iOS Control-Center recording + upload |
| Embed disabled / login wall | Phase 0 (try 10 reels) | user-logged-in Instagram WebView; else upload |
| MediaPipe iOS speed / memory on a 30 s clip | Phase 0 | 15 fps, background task + notification; "full" model instead of "heavy" |
| Pose failures in hard poses (overlapping limbs) | Phase 1 | sanity checks + Vision on failing frames only |
| Instagram ToS | ongoing | user-initiated capture of what they view; skeletons only; no scraping, no automation |
