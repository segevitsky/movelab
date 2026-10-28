# MoveLab — Implementation Plan

Each phase is sized for one or a few Claude Code sessions. Start every session with:
> "Read CLAUDE.md and docs/. We're on Phase N. Do only Phase N. Stop at its acceptance criteria."

Do not start Phase 1 until Phase 0 says GO.

---

## Phase 0 — Feasibility spike (throwaway, ~1 week)

Goal: prove the risky native chain on a real iPhone. Ugly is fine.

> Owner decision (2026-10-27): task 2 (share extension) and task 6 (logged-in WebView) are deferred.
> Phase 0 uses a paste-URL field plus "Pick a video from Photos" instead. Status: `docs/phase0-results.md`.

Tasks
1. Expo app with dev client, builds to the owner's iPhone (TestFlight or local dev build).
2. Share extension: sharing an Instagram reel opens the app with the URL.
3. Screen with a WebView loading `https://www.instagram.com/reel/<id>/embed`. Injected JS posts
   back caption, username, and the video element's rect.
4. Local Expo module `screen-recorder` (Swift, ReplayKit `RPScreenRecorder`): `start()`, `stop() → fileUri`.
5. Local Expo module `pose` (Swift, **MediaPipe Tasks iOS PoseLandmarker heavy**, VIDEO mode):
   `process(fileUri, cropRect) → {fps, frames:[{t, lm33:[x,y], vis:[], world:[x,y,z]}]}`.
   Also wrap Apple Vision as `processVision(...)` for comparison/fallback.
6. If the embed is blocked: a WebView where the user logs in to instagram.com themselves; record the reel page.
7. Debug screen: draw raw joints over a frame + export JSON via share sheet.

Acceptance (write results in `docs/phase0-results.md`)
- [ ] Tested on ≥ 10 different reels: how many embed, how many record with visible video.
- [ ] Recorded file contains the reel's video frames (not black) — screenshot proof.
- [ ] MediaPipe finds the person in ≥ 90 % of frames on 3 sample reels (prototype: 96–99 %); compare with Vision.
- [ ] On the burpee-lunge reel, the raised leg in the push-up is correct (heel/toe in the air).
- [ ] Processing time for a 30 s recording on the device.
- [ ] GO / NO-GO decision + fallbacks chosen.

---

## Phase 1 — Skeleton pipeline in TS

> Done 2026-10-28 — see `docs/phase1-results.md`.

Port `reference/pose-pipeline/{proc,reps,analysis,feetproc}.py` + segmentation + sanity checks to
`src/pipeline`, pure + tested.

Tasks
- Types for raw pose JSON (from Phase 0 module).
- `segment()` from scene-cut scores + pose discontinuity.
- `clean()` — swap fix, confidence mask, spike removal, interpolation, Savitzky–Golay.
- `sanityCheck()` — leg/arm collapse, implausible bone length → list of frames for the fallback model (Arch §4.2).
- `reps()` + `bestLoop()` — period by pose autocorrelation, seamless one-rep window (Arch §4.4).
- `feet()` — heel/toe relative to the shin, gap fill, smoothing (Arch §4.6).
- `features()` — active joints by angle range, start/end pose.
- Fixtures: `reference/sample-data/reel{1,2,3}_*_mp33.json` (MediaPipe-33 output of 3 real reels).

Acceptance
- [ ] `segment()` on reel 1 returns 3 segments ≈ [0–3.2 s], [3.2–13 s], [13–28 s]
      using pose discontinuity alone (fixtures have no scene-cut scores; real captures will).
- [ ] `reps()` on reel 3 (from 0.6 s) → period 5.2 ± 0.2 s, periodic; `bestLoop()` ≈ 2.2–7.4 s.
- [ ] Reel 2 (staff flow) → one segment, not periodic.
- [ ] Output of `clean()` matches the Python reference within 2 px RMS on the fixture.
- [ ] Unit tests green; no native deps in `src/pipeline`.

## Phase 2 — Figure renderer

> Done 2026-10-28 — see `docs/phase2-results.md`.

Tasks
- `src/figure` Skia component `<Figure joints fps playing speed mirror hud?>` per Architecture §5.
- Card variant (small loop) and player variant (full screen).
- Storybook-like dev screen that loops the 3 fixture segments.

Acceptance
- [ ] Visually matches `reference/renders/*_mp.gif` (fixed colours, heel–toe feet, perspective floor, cast shadow).
- [ ] 60 fps on device with 3 cards looping.

## Phase 3 — Data + library

> Done 2026-10-28 — see `docs/phase3-results.md`.

Tasks
- drizzle schema per Architecture §7, migrations, seed (presets, seed goals from `reference/seed-goals.md`).
- Library screen (grid of looping cards, filters), exercise detail, manual add.

Acceptance
- [ ] CRUD works offline; app restart keeps data.
- [ ] Filters by pattern/slot/equipment.

## Phase 4 — Capture → review end-to-end

Tasks
- Wire share → capture → record → pose → pipeline → review → save. Delete recording after save.
- Upload-from-Photos fallback through the same pipeline.
- Scene elements (Arch §5a): auto-crop of the reel area; floor-mat quad detection with the tap-4-corners fallback in Review; mat drawn under the figure.
- Backend `/tag` (worker) + client; review screen pre-filled with suggestions.
- Store `source` + `source_exercise` rows.

Acceptance
- [ ] Owner captures 5 real reels, each in < 30 s of his effort.
- [ ] Each detected exercise can be renamed/merged/split/trimmed/deleted before saving.

## Phase 5 — Frameworks + generator

Tasks
- Framework schema + editor (blocks → slots → filters → dosage → rest). Preset "Segev 3×6", EMOM, Tabata, flow.
- `src/generator` per Architecture §6 with seed, swap, time-fitting. Pairing graph rebuild from `source_exercise`.
- "Today" screen: inputs, generated workout, swap/lock, explain line (backend `/explain`).

Acceptance
- [ ] Property tests: never repeats an exercise used in the last 3 workouts when alternatives exist;
      respects slot tags/equipment; hits target time ±10 %.
- [ ] Same seed → same workout.

## Phase 6 — Player

Tasks
- Timeline builder (work/rest/transition steps) + state machine (play/pause/skip/back/+15 s).
- Full-screen figure, countdown, next-up, round counter, haptics + sounds, keep-awake, offline.
- End screen feedback → `session`.

Acceptance
- [ ] Owner completes 5 real workouts without touching the phone except start/end.

## Phase 7 — Goals + adaptation

Tasks
- Goals screen: active goals (max 3 recommended), stages, mark passed.
- Generator uses goal stage in skill slot; feedback adjusts dosage (hard → −10 %, easy → +10 %).

Acceptance
- [ ] Passing a stage changes the next generated workout.

## Phase 8 — Remix (AI)

Tasks
- `/remix`: "new flow from my moves", "harder/easier variant", weekly challenge — **library IDs only**.
- Flow chaining by start/end pose compatibility.

Acceptance
- [ ] Remix never returns an exercise not in the library (validated server and client side).

---

## Parking lot (not now)
Props layer (staff tracker proven, see Arch §4.5; other props need detectors) · use MediaPipe 3D for twists/props ·
Sync/accounts · Android · 3D view of figure · comparing my own recording to the reference (form check) ·
public profiles / sharing · coach partnerships.
