# 07 — Changelog and working log

_What was done, when, and what is open. Newest first. Keep entries short; details live in the phase docs,
`docs/06-design-direction.md` and the commit history (`git log --format='%ad %s' --date=short`)._

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
- Tests: 90 green (`npm test`), `npm run typecheck` clean.

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
