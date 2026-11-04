# 07 — Changelog and working log

_What was done, when, and what is open. Newest first. Keep entries short; details live in the phase docs,
`docs/06-design-direction.md` and the commit history (`git log --format='%ad %s' --date=short`)._

## 2026-11-04 (Wednesday) — capture quality, round two
- **Phase 14, 3D view (approved: "go with ur recommendations")**: every new card stores the cleaned 3D track
  (`figure3d`, 'ML3D' int16 mm, 15 fps, frame-aligned with the figure) and the camera's facing ratio
  (`scene.facing`: image shoulder width over 3D shoulder width, ≈ 1 frontal, ≈ 0 side). `view3d.ts` turns the
  3D track into a 2D clip seen from a camera yawed 35° (hips placed above the fitted floor from the pinned 2D
  track; orthographic; depth flags and feet from the rotated joints). `clipForExercise` picks the view for every
  screen (Library tiles, viewer, player, GIF): the 3/4 view automatically when facing ≥ 0.8, otherwise as
  filmed; the card has "As filmed / 3/4 view" chips (`scene.view` override, "auto" to clear). On the frontal
  kneeling fixture (facing 1.16) the 3/4 render shows the folded legs that the flat view loses
  (`scripts/dump3d.ts` + `scripts/preview.ts`). Older cards have no 3D track: re-process from Dev ▸ Raw captures.
- **Visual scene cuts** (Phase 13 step 2): native `SceneDiff.swift` reports per-sample picture change inside the
  crop; pure `sceneCuts.ts` turns spikes into cut times; Review feeds `segment({ cutTimes })` and stores the
  series in raw captures. Needs the owner's captures to calibrate.
- **Floor pose, legs disappear** (fixture DfC8LdUIjV4): hidden frames are genuinely wrong in 2D (87–97 % > 25 %
  off), so the rejection stands; a "trust plausible mid-visibility joints" rule was tried and dropped. Review now
  also runs Apple Vision and keeps its output (`resultVision`) in the raw capture for an offline comparison →
  per-joint merge if it is better (Phase 13 step 3).
- **Floating figure** (fixture DfC8LdUIjV4-float, kneeling / hands on a mat): no contacts were found in the
  hands-and-knees parts (only heels, toes and feet-gated hands counted), so pinning held a stale offset and the
  figure hung 0.5–1 torso above the floor. Fixed: knees are ground points when the leg is folded (a plank's
  straight leg is excluded), hands count when they are the lowest point, and the floor's depth term is now
  fitted across frames from each contact's hip-relative depth (heels 0.5 m nearer sit 0.6 torso lower — one
  straight relation) with the line re-centred at the torso's depth; a scale term (px/m from the tilt-corrected
  torso) follows the figure's distance in frames without contacts; the depth term is capped at 1.2 torso per
  metre (uncapped it drew heels 1.3 torso under the ground) and the renderer's ground margin went from 0.3 to
  0.1 torso. Eval: owner fixtures and lab reels in
  `docs/eval-phase13.json`; `scripts/preview.ts` renders a contact sheet of a processed track (no deps).
- **Vision second opinion: negative result.** On a fresh capture of the kneeling reel (fixture DfC8LdUIjV4-restart,
  both models stored) Vision's legs are plausible and confident in only 3–20 of ~150 frames where MediaPipe's
  are not; its leg confidence is lower overall. Per-joint merge dropped. Legs folded under a kneeling body
  need a stronger whole-body model (parking lot: RTMW CoreML).
- **Player restart as a visual cut**: the same capture (recorded from the reel log, mid-stream, no timeline
  events) was split in two by a strong picture change at 4.3 s — the reel restarting. `restartPrefix`: a strong
  cut within the first 6 s of a mid-stream recording drops the duplicate prefix instead of splitting.
- **Hidden limbs are held** (owner: "keep the limbs, make them visible"): a limb hidden for ≤ 2 s keeps its last
  detected pose carried with its root joint (`src/pipeline/hold.ts`, tested; CLAUDE.md amended). Review's
  quality line no longer suggests deleting over hidden limbs. Owner: "kind of better but the movement is
  distorted" → the hold now blends the limb's shape between the two ends of a gap (no snap): max leg jump per
  frame 2.9 → 0.4 torso, jumps > 0.3 torso 55 → 11 of 2107 on the kneeling fixture. Root pinning damped too
  (One-Euro 0.5 Hz + 0.03 torso/frame slew): pin step per frame 0.34 → 0.03 torso, hip jumps 0.31 → 0.09; float
  +0.01–0.03 on three segments (eval-phase13.json).
- **Frontal floor poses** (same reel, full-screen preview 16:09): the camera faces the coach (facing ratio 1.16), the
  knees are 0.22 m nearer than the hips, so a kneeling thigh collapses to a stub in a flat drawing and the shin
  behind the thigh is guessed. Not fixable in 2D. Proposed next: **3D view** — store the cleaned 3D track
  (`figure3d`, already computed, never stored) and render from a rotated virtual camera when the pose is
  depth-ambiguous (plan parking lot → candidate Phase 14).
- **The actual floating bug**: `exerciseFromProcessed` spread the caller's fields after the scene it built, so
  Review's scene (crop / mat / camera flag) replaced the one carrying the fitted floor and the renderer fell
  back to "lowest ankle + 1.1 torso" — every card saved through Review since the floor fit existed floated
  in floor poses. Fixed in `src/db/exerciseRow.ts` (pure, tested); owner confirmed "now he is on the floor". The contact / depth-term work above still
  stands on the eval numbers. Review: tap a figure for a full-screen preview before adding.
- **Build pipeline bug**: three Release builds today failed (new Swift file needed `pod install`) while a filtered
  log made them look installed, so the phone ran Sunday's JS until 15:11. Lesson in the status brief + memory:
  keep the full log, check "Build Succeeded" + "Installing", verify a new string inside main.jsbundle.
- Android: fresh release APK (`~/Desktop/MoveLab-android/MoveLab-0.0.1-evening.apk`, 2026-11-01 night).
  Capture stays iOS-only until the Kotlin ports (Phase 9 step 5).

## 2026-11-01 (Sunday) — design pass, Android start, owner's session notes

**Shipped (all on `main`, local commits)**
- **Design pass** (`docs/06-design-direction.md`): dark-first tokens in `src/theme/tokens.ts`, primitives
  (`Button`, `IconButton`, `Chip`, `Screen` with pinned footer, `TitleBar`, `Sheet`, `SectionHeader`,
  `DrillRow`, `DrillPager`, `BigTimer`, `PromptSheet`, `Brand`), restyled Library, Player, Today,
  saved-workout. Figure keeps its paper stage. Player stage is budgeted so text never overlaps.
- **Viewer / picker** page natively (swipe = next drill; arrows scroll the pager). Tap a drill in a saved
  workout opens the viewer (was: the exercise card).
- **Share as GIF** on the exercise card: own GIF89a encoder (`src/export/gif.ts`, unit-tested), offscreen
  Skia render of the loop window, OS share sheet. Skeleton only, never video.
- **Creator handle** in names ("Push 1 · @coach") is a link to the creator's page.
- **Rests**: 15 s between drills (was a 5 s cue), 60 s break when a new section starts; per-workout inputs
  in Today's sheet and on the saved workout; +15 s works in all of them.
- **Swap mid-workout**: the player's "Swap" button also works during rest (swaps the upcoming drill).
- **Saved sections bank** (`section_preset` table, migration 0002): bookmark a section's drills under a
  name, drop a saved section into any section of Today or a saved workout, plus-button to add a drill.
- **Android, Phase 9 steps 1–3**: pose + screen-recorder resolve to a safe stand-in off iOS; Dev tab
  *Export library* / *Import library* (JSON, upsert by id, newer wins; seeds another phone); `expo prebuild
  --platform android` clean; Temurin 17 + Android SDK (platform 35, build-tools 35, NDK 27, cmake)
  installed on the Mac. Debug APK build in progress (first Gradle run stalled on downloads once; restarted).
- Dev tab: *Demo workout → player* (`movelab:///dev?demo=1`). Stack back label "Back". Bigger MoveLab
  wordmark on Today, brand row on Library.
- **Phase 10 — workout builder** (afternoon): `workout.blocks` (migration 0003) lets a workout own its
  sections; `src/db/builder.ts` (tested) builds blocks + items from sections and placed drills, and lets a
  framework workout take ownership when drills are reordered. `app/build.tsx` wizard (Shape → Place → Dose
  → Save / Save & start), Library select mode (long-press, tick, draggable tray, swipe down to cancel, "Build
  workout"), drag handle on every drill of a saved workout, Today menu "Build a workout by hand".
  `DraggableList` = pure-JS long-press-to-lift reorder (vertical + horizontal).
- **Android debug APK builds** (1 m 36 s once restricted to arm64; the four-ABI Skia build ran > 1 h).
  Release APK (standalone, to sideload) building next.
- **Phase 12 steps 1–3** (late afternoon): motion fingerprint + similarity (`src/similarity`, tested on the
  lab reels: upright flows 0.61, lunging drills 0.65, unrelated ≈ 0.4), advisory guidance strips (wizard,
  saved workout, Today), picker note "≈ moves like X", card "Moves like" list, Dev ▸ "Alike drills
  (calibrate)". **Open: owner answers Alike / Different on the pairs and reports the suggested line; then set
  ALIKE_THRESHOLD (now 0.8).** Generator clash rule (step 5) not wired yet.
- **Release APK** built: `~/Desktop/MoveLab-android/MoveLab-0.0.1.apk` (57 MB, arm64, signed with the debug
  key, standalone). **Installed and launched on an Android phone (owner's wife's) the same evening — "looks really
  good on first glance".** Still to check there: library import, player with sound/haptics, GIF share, 60 fps.
- Design pass v2 parked by the owner ("cool enough for the MVP").
- Evening: Release iOS build on the owner's phone (standalone, signature to 2026-11-08); generator avoids
  look-alikes (Phase 12 step 5); calibration screen shows looping pairs; owner answered 60 pairs — the first
  score separates them poorly (AUC to be measured), so `scripts/fit-alike.ts` fits weights + a DTW sequence
  distance from the verdict file (which now carries the skeletons). Export/verdict share hardened (Documents,
  Files-app access). **Phase 13 capture quality** opened (plan) — step 1 shipped: raw pose captures kept in Documents/captures,
  shared from the Dev tab.
- Late evening, capture: owner records until the reel starts over, so the repeated beginning merged with the
  last drill. Fixed: loop tracker per <video> element, auto-stop needs 80 % of the reel recorded, the player
  timeline travels with the raw capture, and Review cuts the recording at the loop point. Owner: "this is much
  better".
- Night: first owner capture fixture (reel DfGIOMWuPrs). Found: the poster frame before playback was processed
  as a drill ("Core 1" was a still image) and the reel's last drill merged with the repeated beginning → Review
  now keeps only the playback window from the player timeline. The reel's two drills join at an edited
  transition that pose statistics cannot separate from fast motion (soft-cut rule tried and dropped: it split
  the staff flow) → next: visual scene cuts on the native side feeding `segment({ cutTimes })`.
- Calibration result (60 verdicts, 19 alike): the motion features reach AUC 0.71 (0.75 with DTW); pattern
  tags carry no signal; "alike" answers cluster on short (3–5 s) clips with unknown joints → the
  comparison is limited by capture quality. Shipped the fitted weights with a strict line (0 false alarms,
  near-duplicates only). Revisit once Phase 13 improves the skeletons.
- Tests: 98 green (`npm test`), `npm run typecheck` clean.

**Verified on the owner's iPhone**: viewer swipe, player layout, export library, section bank save (after
the keyboard fix), rests.

**Owner's notes from the session (to do / to discuss)**
1. **Workout builder wizard from the Library** — ✅ shipped (see above). Owner feedback so far: cards must
   keep looping in select mode (fixed), picked drills must land in the wizard (fixed), swipe down cancels
   the selection (added).
2. **Drag-to-reorder drills** in saved workouts, the wizard and the Library select mode — ✅ shipped.
3. **Bold design pass v2** — display typeface (Barlow Condensed or owner's pick), signature stage (paper
   gradient, pattern rim light, vignette), player ring timer + rest wash, Today as a session hero. Owner:
   "it's cool but not a big difference, can we do more?" → yes, after 1–2.
4. **Balanced workouts + standards for workouts** — owner wants to discuss (remind him). Not designed yet.
5. **Android device pass** — needs the APK (building) and an Android phone (owner's wife's; USB debugging,
   or sideload the release APK + import the library JSON).
6. Section breaks: "fine, discuss later".

## 2026-10-30 (Thursday) — plausibility + workout editing
- Phase 2.5 steps 1–6 (eval harness, contacts, depth-aware floor + root pinning, 3D bone rejection, depth
  order from world z). `docs/phase2.5-results.md`, `docs/phase2.5-handoff.md`.
- Workout preview screen (see / change / remove drills, dosage, breaks, start); swap the current drill from
  the player; per-section skip / rounds ± / add a drill; section jumps in the player; thumbnail clip cache;
  capture auto-stop refinements.

## 2026-10-28 (Tuesday) — Phases 0–7 on the device
- Phase 0 GO; Phases 1–7 built and run on the iPhone 17 Pro Max: pure-TS pipeline (exact match to the
  Python prototype), Skia renderer at ~120 fps, local SQLite, capture via Instagram share → in-app WebView
  → ReplayKit → MediaPipe, frameworks + seeded generator, player, goals as drill ladders, feedback → dosage.
- Branding (icon + splash drawn from a real pose), release build procedure, swipe gestures without
  gesture-handler (it does not link against the prebuilt RN core).

## Earlier
- 2026-10-27: toolchain set up (Node 24, Xcode 27.1, Personal Team signing); product spec, architecture,
  plan, pose-lab findings written; Python prototype in `reference/` is the behavioural spec.
