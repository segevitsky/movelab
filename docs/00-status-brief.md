# MoveLab — status brief (for anyone joining: humans or another Claude)

_Last updated 2026-10-28. Keep this file short; details live in the linked docs._

## What the product is
Personal-first iPhone app: you see a fitness move in an Instagram reel → capture it in the app → it becomes
an animated **stick-figure exercise card** (skeleton only, video deleted) → the app builds varied workouts
from your cards in your own format and plays them with timers. Owner: Segev (senior React dev), v1 is for
him. Specs: `docs/01-product-spec.md` (what/why), `docs/02-architecture.md` (how),
`docs/03-implementation-plan.md` (phases + acceptance criteria). Rules for working here: `CLAUDE.md`.

## Where we are
| Phase | Status | Doc |
|---|---|---|
| 0 — feasibility spike on a real iPhone | **GO** (2026-10-28) | `docs/phase0-results.md` |
| 1 — pose pipeline in pure TypeScript | **done**, 26 tests green, exact match to the Python prototype | `docs/phase1-results.md` |
| 2 — Skia stick-figure renderer | **done** (2026-10-28), ~120 fps with 3 cards + player on device | `docs/phase2-results.md` |
| 2.5 — physical plausibility (contacts, floor + root pinning, 3D bone check, depth order) | **done** (2026-10-30), metrics in `docs/phase2.5-results.md` | `docs/phase2.5-handoff.md` |
| 3 — local SQLite (drizzle) + library screens | **done** (2026-10-28), all local, no server | `docs/phase3-results.md` |
| 4 — capture → review → library, share sheet, scene analysis | **GO** (2026-10-28) | `docs/phase4-results.md` |
| 5 — frameworks + generator (Today tab, framework editor) | **built** (2026-10-28), property-tested | `docs/phase5-results.md` |
| 6 — player (timers, figure, haptics, feedback → session) | **built** (2026-10-28), owner run pending | `docs/phase6-results.md` |
| 7 — goals as drill ladders + feedback adaptation | **built** (2026-10-28) | `docs/phase7-results.md` |
| 8 — AI remix | not started (needs the optional text-only backend) | plan |

## The decisions that matter (don't re-open without a reason)
- **Capture route:** Instagram ▸ Share ▸ MoveLab (share extension) or paste a link → the app opens the reel page in a WebView where the owner has
  logged in to Instagram himself (his own session; the app never touches credentials, never automates) →
  in-app ▶ Play → **ReplayKit** screen recording → MediaPipe. The public *embed* URL only plays inline for
  some reels (ones already in his feed), so it's a convenience, not the main road. Fallback: iOS screen
  recording + "pick from Photos". Share extension shipped in Phase 4 (expo-sharing share-into).
- **Pose model:** MediaPipe Pose Landmarker **heavy**, VIDEO mode, **GPU delegate** — 98.3 % frames with a
  person, 7 ms/frame on iPhone 17 Pro Max (CPU 18 ms). Apple Vision 2D is a sanity-check second opinion
  only (95.5 %, no feet, no 3D). 33 landmarks incl. heels + toes; **MediaPipe-33 order everywhere**.
- **Pipeline (TS, pure):** segment by pose discontinuity (hip jump > 1 torso | pose jump > 2 | gap > 0.5 s
  | external scene cuts; drop < 1.5 s) → clean (L/R swap fix, confidence mask, spike removal, gap fill,
  Savitzky–Golay 0.37 s) → sanity checks (leg/arm collapse, bone length) → reps by pose autocorrelation +
  seamless one-rep loop → feet relative to the shin → features (active joints, ROM, start/end pose).
  Pose normalisation uses the COCO-17 subset of the 33 so face/hands don't dominate.
- **Figure style (Phase 2 target = `reference/renders/*_mp.gif`):** right side dark, left side grey, never
  flips; capsule torso + round head; tapered limbs, front limbs outlined in background colour; feet =
  ankle–heel–toe triangle only when detected; perspective floor grid + cast shadow; follow-cam; optional
  2-joint angle HUD. Draw only what was detected — no bone-length "correction", no invented feet.
- **Privacy/ToS:** recordings deleted after processing; store skeletons + metadata + source URL only;
  backend (later) gets text only; no scraping, no Instagram automation.

## Repo map
```
app/            expo-router: (tabs)/library · today · goals · dev, exercise/[id], exercise/new,
                capture, login, debug, figures
src/db          drizzle schema (Arch §7 + scene), migrations, seed (presets + goals), repo, codec use
modules/pose    Swift: video → MediaPipe 33 landmarks (+ Vision); model bundled from ios/Models
modules/screen-recorder  Swift: ReplayKit start/stop → mp4
src/pipeline    pure TS pipeline + vitest tests (goldens in __fixtures__/expected, made by
                reference/pose-pipeline/export_expected.py with numpy+scipy)
src/figure      Skia renderer: prepare (pure) → draw → Figure/FigureCard/FigureStill/FigurePlayer; codec
src/generator   pure, seeded workout generator (Arch §6) + pairing graph, property tests
src/player      pure timeline builder + state machine; app/player/[workoutId] is the screen
reference/      Python prototype = behavioural spec; sample skeletons of 3 reels + 1 phone capture
docs/           specs, plan, phase results
```
Stack: Expo SDK 58 (dev client, new arch), React Native 0.88, expo-router, @shopify/react-native-skia 2.14,
react-native-reanimated 4, expo-sqlite + drizzle (Phase 3), zustand, vitest. Node 24 (`.nvmrc`).
Device: iPhone 17 Pro Max, free Apple ID / Personal Team (7-day signature), Xcode 27.1.

## Standalone demo build (no Mac, no Metro)
```
npx expo run:ios --device --configuration Release --no-bundler   # signs with the Personal Team, installs
```
(plain `xcodebuild -allowProvisioningUpdates` can't reach the Apple account from the CLI after a
`prebuild`; `ios.appleTeamId` is set in app.json so prebuild keeps the team.)
Personal-Team signature lasts 7 days (first installed 2026-10-28 → re-sign by 2026-11-04). The release
build replaces the dev build; reinstall the dev build (`npx expo run:ios --device`) for live development.

## How to run
```
nvm use && npm install
npm test                       # pipeline unit tests (no phone needed)
npx expo start --dev-client    # terminal 1 — must be running before the app opens
npx expo run:ios --device      # terminal 2 — build + install on the cable-connected iPhone
```

## Open items carried forward
- Run the 3 lab reels on the phone through "Pick a video from Photos" → export JSON → on-device fixtures.
- One unexplained ReplayKit start failure (recorder now resets + retries; watch in Phase 4).
- Scene-cut (histogram) scores and Vision-based limb replacement get wired in Phase 4.
- Product name is still open.
- Scene elements (Arch §5a: auto-crop + floor-mat quad) are specified; implementation is in Phase 4.
