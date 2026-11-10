# MoveLab — Implementation Plan

Each phase is sized for one or a few Claude Code sessions. Start every session with:
> "Read CLAUDE.md and docs/. We're on Phase N. Do only Phase N. Stop at its acceptance criteria."

Do not start Phase 1 until Phase 0 says GO.

---

## Phase 0 — Feasibility spike (throwaway, ~1 week)

Goal: prove the risky native chain on a real iPhone. Ugly is fine.

> Owner decision (2026-10-27): task 2 (share extension) and task 6 (logged-in WebView) were deferred in Phase 0.
> Both were pulled back in later: task 6 on 2026-10-28 (Phase 0 follow-up), task 2 in Phase 4 via expo-sharing's
> share-into extension. Status: `docs/phase0-results.md`.

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

## Phase 2.5 — Physical plausibility (inserted 2026-10-30, before Phase 3 in dependency order)

See `docs/05-phase-2.5-plausibility.md` for the spec and `docs/phase2.5-results.md` for metrics.
Steps: eval harness + baseline → contacts → floor + root pinning → 3D bone-length check → depth order →
debug toggles. **Done 2026-10-30** (foot lock parked). Handoff: `docs/phase2.5-handoff.md`.

## Phase 3 — Data + library

> Done 2026-10-28 — see `docs/phase3-results.md`.

Tasks
- drizzle schema per Architecture §7, migrations, seed (presets, seed goals from `reference/seed-goals.md`).
- Library screen (grid of looping cards, filters), exercise detail, manual add.

Acceptance
- [ ] CRUD works offline; app restart keeps data.
- [ ] Filters by pattern/slot/equipment.

## Phase 4 — Capture → review end-to-end

> GO 2026-10-28 — see `docs/phase4-results.md` (quality follow-ups listed there).

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

> Built 2026-10-28 — see `docs/phase5-results.md` (property tests green; owner tried it on device).

Tasks
- Framework schema + editor (blocks → slots → filters → dosage → rest). Preset "Segev 3×6", EMOM, Tabata, flow.
- `src/generator` per Architecture §6 with seed, swap, time-fitting. Pairing graph rebuild from `source_exercise`.
- "Today" screen: inputs, generated workout, swap/lock, explain line (backend `/explain`).

Acceptance
- [ ] Property tests: never repeats an exercise used in the last 3 workouts when alternatives exist;
      respects slot tags/equipment; hits target time ±10 %.
- [ ] Same seed → same workout.

## Phase 6 — Player

> Built 2026-10-28 — see `docs/phase6-results.md` (device run pending).

Tasks
- Timeline builder (work/rest/transition steps) + state machine (play/pause/skip/back/+15 s).
- Full-screen figure, countdown, next-up, round counter, haptics + sounds, keep-awake, offline.
- End screen feedback → `session`.

Acceptance
- [ ] Owner completes 5 real workouts without touching the phone except start/end.

## Phase 7 — Goals + adaptation

> Built 2026-10-28 — see `docs/phase7-results.md`.

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

## Phase 9 — Android, player-first (started 2026-11-01)
Goal: the owner can run his library and workouts on an Android phone. Capture stays iOS-only until the
Kotlin ports land (parking lot). Steps:
1. **JS runs on Android without the iOS-only natives.** `modules/pose` and `modules/screen-recorder` resolve to
   an "unsupported" stand-in on Android (clear error per call, no crash at import); capture entry points are
   hidden there. ✅ 2026-11-01
2. **Library transfer.** Dev tab: *Export library* (one JSON: exercises + sources + pairings + own frameworks
   + goals; skeletons only, never video) shared via the OS share sheet; *Import library* (document picker,
   upsert by id, newer wins). Works on both platforms → seeds Android from the iPhone. ✅ 2026-11-01
3. **Android project.** `app.json` android block (adaptive icon from `assets/android-icon-*.png`), `expo
   prebuild --platform android` clean ✅; JDK + SDK installed 2026-11-01 ✅; first debug APK build running
   (Gradle, first run stalled on downloads once). Then a release APK to sideload. ⏳
4. **Device pass.** Library grid at 60 fps with 3 loops, player with timers/haptics/audio, share-as-GIF.
5. Later (own phases): MediaPipe Pose Android (same model file), MediaProjection screen recorder, share intent
   from Instagram, scene analysis port.

Acceptance: an Android phone imports an iPhone export and plays a generated workout end-to-end; `npm test`
and `npm run typecheck` green; iOS unchanged.

## Phase 10 — Workout builder (planned 2026-11-01, owner request)
Build a workout from the Library: select drills (long-press → select mode) → wizard: **shape** (sections:
warm-up / rounds × N / finisher / cooldown, or from a framework) → **place** (drills under sections; move
between sections, **drag to reorder**, add from library or the saved-sections bank) → **dose** (time/reps,
per side, live total) → name + tags → save / start. Data: a built workout carries its own `blocks` on the
workout row; player, viewer and saved-workout screen use them when present (generator untouched).
Drag-to-reorder also in saved workouts and in the Library select mode (pure-JS pan responder; gesture-handler
does not link). Acceptance: build, reorder, save, play end-to-end; `npm test` green.

## Phase 11 — Bold design pass v2 (planned 2026-11-01)
Display typeface (Barlow Condensed unless the owner picks another) for titles, sections, timer; signature
stage (paper gradient, pattern-colour rim light, vignette, deeper shadow), full-bleed library tiles with
overlaid names; player ring timer + rest wash + "GO" flash; Today as a session hero. See `docs/06` §8.

## Phase 12 — Motion similarity + workout guidance (agreed 2026-11-01, owner answers: motion first, advise only)
1. **Motion fingerprint** per drill from its skeleton (pure TS, tested on the lab reels): body orientation
   over the loop, joint-angle ranges (shoulders, elbows, hips, knees), per-part motion energy, floor contacts
   of hands/feet, tempo. No new data needed.
2. **Similarity** between two drills from fingerprints, pattern tag as a tie-breaker; threshold calibrated on
   the owner's library (he flags pairs: e.g. "Pull 1 · @floweducationbr" ≈ "Mobility 1 · @athleticsbyd…").
3. **Guidance, advisory only, never blocking**: a quiet strip on the wizard, the saved workout and Today
   ("X and Y move the same way — keep one", "No pull today"); a badge in the picker when a candidate overlaps
   a drill already in the workout; "Similar drills" on the exercise card.
4. **Balance** in the same report: push vs pull, upper vs lower, core present, mobility at the start,
   stretch at the end — rules in one editable list.
5. Generator reads the same score for its (soft) clash rule.
Acceptance: owner-flagged alike pairs score above the threshold, clearly-different pairs below; report on all
three screens; tests green; nothing blocks saving or starting.

## Phase 13 — Capture quality (owner, 2026-11-01: "one of the most important tasks we can have")
All four failure classes happen sometimes: wrong number of exercises, wrong/jittery skeleton, loop or rep
count off, slow or missed frames; latest case: the last drill of a reel was not recognised at all.
1. **Replayable captures.** Keep the raw pose output of every capture (the numbers, never video) in
   Documents/captures/<time>.json with the crop, scene, url and username; last 30 kept; Dev tab lists them with
   share / delete. A bad reel → AirDrop → `src/pipeline/__fixtures__/owner` → a failing test → a fix. ✅ 2026-11-01
   First fixture (reel DfGIOMWuPrs): the still poster frame before playback was processed as a drill, and the
   repeated beginning after the loop merged with the last drill → **playback window from the player timeline**
   (play → ended/looped) in Review ✅. The reel's two drills join at an edited transition that pose statistics
   cannot separate from fast motion (tried a soft-cut rule: found it, but split the staff flow) → step 2.
2. **Visual scene cuts from the native side** (frame-difference / histogram on the decoded video, before it is
   deleted) → `segment({ cutTimes })`, which already exists. Then re-check the fixture (`owner.test.ts` todo).
   Also: auto-stop too early (capture), person lost (tracking / multi-person), loop point.
3. **Vision second opinion.** Fixture DfC8LdUIjV4 (floor core drill): MediaPipe loses the legs — the 3D-flagged
   frames (26 %) are wrong in the image too (87–97 % deviate > 25 % in 2D), so the Phase 2.5 rejection is right
   and relaxing it (tried: trust mid-visibility joints with plausible bones) cannot help. Since 2026-11-04 Review
   also runs Apple Vision and stores it in the raw capture (`resultVision`); next: measure on fixtures whether
   Vision's legs are plausible where MediaPipe's are flagged, then merge per joint (never invent, never clamp).
   **Measured 2026-11-04: Vision does not recover them (3–20 of ~150 frames). Dropped.** Next option: a stronger
   whole-body model (RTMW CoreML, parking lot) — a separate phase.
4. **Floor + contacts for floor work** ✅ 2026-11-04: knees (folded leg) and lowest-point hands as contacts;
   depth term across frames; scale term; owner fixtures in the eval harness. Dev ▸ Raw captures ▸ Re-process
   re-runs a past capture through the current pipeline.
5. Segment quality gating in Review (weak segments shown as such, re-record or skip rather than save a broken
   card).
Acceptance: every owner-reported bad reel is a fixture; its failure is reproduced by a test, then fixed;
`npm test` green; the eval harness numbers (Phase 2.5) do not regress.

## Phase 14 — 3D view of the figure (approved 2026-11-04; built the same day; owner: opt-in per card only, not a default, "until we figure things out")
Done: `figure3d` + `scene.facing` stored by `exerciseFromProcessed`; `src/figure/view3d.ts` (facing ratio,
`clipFromView3d` yaw 35°); `clipForExercise` / `viewOf` in `src/db/repo.ts` choose the view everywhere; card
chips override (`scene.view`). Not done: a 3D floor plane / shadow (the rotated view reuses the flat floor line
at a fixed height), eval of all lab reels in both views (only the owner fixture was rendered). Acceptance: the
owner re-processes the frontal kneeling capture and the legs read; side-view reels look unchanged.
**Open for discussion (owner, 2026-11-04 evening: "keep the last subject, we'll discuss them soon")**: the 3/4 view
is opt-in only; legs on kneeling floor work are still wrong because MediaPipe's 3D is noisy there — the candidate
answer is a stronger whole-body detector (RTMW → CoreML, est. 1–2 days + an eval on the owner's captures, slower
capture). Decide: keep polishing the view, try the detector, or accept flat-only for floor work.
Why: reels shot from the front (fixture DfC8LdUIjV4-restart: facing ratio 1.16, knees 0.22 m nearer than the
hips) make a kneeling thigh a stub and hide the shin — a flat drawing cannot show it, and the owner wants
these drills readable. What: (1) store the cleaned, smoothed 3D track (`figure3d`, computed since Phase 2.5,
never stored) with the card; (2) renderer: project the 3D track with a virtual camera yawed ≈ 35° (and a
3D floor plane + shadow), keep the 2D path for side-view reels; (3) pick the view automatically from the
facing ratio, with a toggle on the card; (4) eval: the lab reels + owner fixtures render in both views.
Risk: MediaPipe world coordinates are noisy (bone-length p95 13–30 %); the view must tolerate it (same
rejection rules, no clamping). Est. 1–2 days.

## Phase 15 — Other people's videos: own uploads, and PTs handing exercises to patients (owner 2026-11-04; steps 1–2 built 2026-11-08 — camera + Photos + link in an Add sheet, `.movelab` workout files with import; step 3 open)
Owner: "we need people also to start using it … uploading videos for them and parsing them is really important …
for physical therapists so they could give their patients exercises."
- **Step 1 — parse an uploaded video (small, ≈ 1 day).** The native module already takes any file URI
  (`Pose.process(fileUri)`), so this is a picker (Photos / Files) that hands the file to the existing Review
  screen; same cleaning, same raw-capture record, same rule: the video is deleted after processing, only the
  skeleton + metadata are kept. Source becomes `platform: 'upload'` (no URL). Android gets this before Instagram
  capture, since it needs no screen recorder.
- **Step 2 — hand a workout to a person, no backend (≈ 1–2 days).** A workout package file (drills with figure
  blobs + dosages + names/tags; `exportLibrary` already produces the shape) shared from the share sheet
  (AirDrop / WhatsApp / mail); MoveLab opens the file type and imports into the receiver's library. A PT sends a
  patient their programme as a file; the patient only ever holds stick figures, never the PT's video.
- **Step 3 — accounts + the text-only backend** (parking lot "sharing workouts between users"): PT ↔ patient
  link, programmes updated remotely, adherence feedback flowing back. Needs the privacy posture written down
  first (patients' health data; the figure blobs are skeleton metadata, not video — confirm that reading of the
  "text/metadata only" rule in the architecture doc before anything is uploaded).
Decide first: who is the first outside user (a PT the owner knows?) and whether steps 1–2 are enough for them.

## Phase 17 — Stronger whole-body model (owner 2026-11-10: "this is the core of our product, we can't compromise here")
Why: three captures of floor work (kneeling 11-04, lying 11-10) fail for the same reason — MediaPipe does not see
legs folded toward or away from a camera that looks down; its own leg confidence is 0.27 on the lying drill.
What: RTMW (RTMPose whole-body, COCO-WholeBody 133 points: body, feet incl. heel/toes, 21 per hand, face).
1. Mac spike (`scripts/rtmw_spike.py`, rtmlib + onnxruntime): run on the owner's screen recordings, write raw
   captures in the MP-33 layout (+ `wb` extras), compare figures side by side with MediaPipe. Decide.
2. On device: ONNX Runtime (CoreML EP) or a CoreML conversion of RTMW-m/l; top-down on a person box
   (MediaPipe's box or the YOLOX det); SimCC decode → keypoints; keep MediaPipe for the 3D world track (depth
   order, bone check, 3D view) — hybrid: RTMW 2D + MP 3D. Hands get finger joints (Phase 16 step 2 for free).
3. Pipeline: MP-33 stays the storage order; extras (hand 21s, feet) stored as `wb`; renderer draws fingers.
Risk: speed on an iPhone (RTMW-m 256×192 ≈ 10–20 ms on ANE; RTMW-l 384×288 slower); licence (Apache-2.0).

## Phase 16 — Hands and props (owner 2026-11-08; hands step 1 + staff tracker/renderer built the same night; staff *detector* and object detector open)
Owner: "we don't have hands and we do have feet, this limits our movement recognition … hands have joints … I also
want to recognise props like sticks and kettlebells … physicians will use bands, walls, objects … we have props
and a framework so we need to do this also."
- **Hands, step 1 (cheap, ≈ ½ day):** MediaPipe Pose already gives 3 points per hand (pinky 17/18, index 19/20,
  thumb 21/22) that are captured but never drawn. Draw a palm wedge from wrist → index/pinky when detected
  (same rule as feet: only what was detected), and use palm direction in the fingerprint (grip up / down /
  neutral). No new model.
- **Hands, step 2 (finger joints, ≈ 2–3 days):** 21 landmarks per hand need MediaPipe Hands (or Holistic) run on
  a crop around each wrist — a second model on device, slower capture, and the storage/renderer gain finger
  bones. Worth it for grip-heavy work (wrist mobility, rehab, rings). Decide after step 1 shows what is missing.
- **Props, step 1 — the staff (proven):** port `reference/pose-pipeline/staff.py` (Arch §4.5) to TS/Swift: a line
  tracked between the hands, drawn as a rod. Sticks, dowels, brooms, barbells-as-a-line.
- **Props, step 2 — detected objects (≈ 3–5 days):** a small on-device detector (YOLO-class, CoreML) for
  kettlebell / dumbbell / band / ball / chair / wall-anchor; each prop becomes a simple shape attached to the
  nearest hand (or foot / floor); the card carries the prop type (equipment vocab already exists), and the
  generator/framework can require or exclude props. Bands are a line between two anchors (hand–hand, hand–foot,
  hand–fixed point). Walls: a vertical plane when a hand/foot contact is far from the floor and static.
Hard rules stand: draw only what was detected; never invent a prop position; prop frames with no detection stay
empty. Order to decide with the owner: hands step 1 → staff → detector → finger joints.

## Parking lot (not now)
Props layer (staff tracker proven, see Arch §4.5; other props need detectors) · use MediaPipe 3D for twists/props ·
Sync/accounts · ~~3D view of figure~~ (→ Phase 14 candidate) · **Android** (APK sideload is easy; needs Kotlin ports of pose (MediaPipe Android, same model), screen recorder (MediaProjection + foreground service) and a share intent, plus a real device to test; cheap first step = player-only build seeded from an iPhone library export; est. 3–5 days) · 3D view of figure · comparing my own recording to the reference (form check) ·
public profiles / **sharing workouts between users** (owner discussed a concept with web Claude on 2026-11-01 — keep as a reference; needs the text-only backend: a workout is items + dosages + exercise *names/tags*, never video; receiver maps names onto their own library or imports a figure blob) · **workout defaults** (owner to explain) ·  **creator handle as a link** (owner, 2026-11-01: exercises/workouts carry the creator's @tag in the name — render it as a link to the creator's Instagram page / the source reel, wherever the name is shown) · **save the warm-up / reuse a section** (owner, 2026-11-01: "lets save the warmup — and use a section perhaps": a block of drills saved by name and dropped into other workouts/frameworks; to be detailed) · coach partnerships ·
an RTMW (whole-body) CoreML second model · Apple Vision 3D body pose · temporal 3D models (WHAM / GVHMR —
note: SMPL licence is non-commercial).
