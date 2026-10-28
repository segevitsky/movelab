# Phase 4 — results (capture → review → library, end to end)

Status (2026-10-28 evening): **GO** — share sheet → Capture → Review → library works on the owner's phone;
owner captured ~3 reels this way ("really cool the share and all"). Quality follow-ups listed below.

## Flow
```
Dev ▸ paste link ─► Capture (logged-in reel page / embed) ─► ▶ Play ─► Model it (ReplayKit, auto-stop after one loop)
Share sheet (Instagram ▸ Share ▸ MoveLab) ─► app opens Capture with the link        [expo-sharing "share into"]
Photos ▸ pick a video ───────────────────────────────────────────────────────────────┐
                                                                                      ▼
Review: sceneAnalysis (auto-crop + mat quad) → Pose.process (GPU, cropped) → resample 30 fps → segment →
        one row per exercise: looping card · suggested name + tags (local tagger) · split / merge / trim /
        delete · include ✓ · mat corners fallback → "Add N to library" → exercise + source + source_exercise
        rows, recording deleted (also on Discard)
```

## What was built
- `src/pipeline/edit.ts` — `processRange`, `mergeRanges`, `splitRange`, `trimRange`, `frameAt` (tested).
- `src/pipeline/tagger.ts` — **local** suggestions (no server, per owner): caption/OCR keywords (specific →
  generic priority) + posture from the skeleton (standing / floor / inverted) + periodicity → pattern,
  slots, equipment, dosage, with human-readable reasons (tested).
- `modules/pose/ios/SceneAnalysis.swift` — Arch §5a: 2 fps grayscale samples at 160 px → per-pixel
  temporal std → largest moving component = crop; temporal median background → dark core in the lower
  half → edge-bounded flood fill → 4 extreme corners = mat quad; camera-static flag.
  Exposed as `Pose.sceneAnalysis(uri)`.
- `src/figure`: `FigureClip.scene.matQuad` → perspective slab under the figure, translucent shadow on it.
  `exercise.scene` persists `{ matQuad (crop px), cropRect (normalised), cameraStatic }`.
- `app/review.tsx` — the Review screen (progress phases, rows, edits, mat-corner editor, save/discard).
- Share sheet: `expo-sharing` share-into extension (`group.com.segev.movelab`), activation = 1 web URL /
  text / 1 movie. `app/_layout.tsx` reads shared payloads on launch/foreground → Capture or Review.
- Capture and Photos picker now land in Review (the Pose-debug screen stays reachable from Review/Dev).

## Acceptance
| Criterion | Result |
|---|---|
| Owner captures 5 real reels, each in < 30 s of his effort | **3 so far via the share sheet**, effort well under 30 s each (share → Play → Model it → Add). Owner: "not all were great in quality" → see follow-ups. Count continues naturally in daily use. |
| Each detected exercise can be renamed / merged / split / trimmed / deleted before saving | **PASS** — edit ops unit-tested; Delete verified by the owner on device; Split/Merge/trim exercised on the simulator UI. |

## Verification notes
- **Share extension with a free Personal Team: works** — the extension target + `group.com.segev.movelab`
  provisioned and installed; Instagram ▸ Share ▸ MoveLab opens Capture with the reel.
  Gotcha: if the app is sitting on the dev-launcher screen (not running the JS), the launcher grabs the
  incoming link and shows a MIME-type error — open the app into MoveLab first. Not an issue in a release build.
- Mat detection: not yet confirmed on a real reel (owner to check the "mat found" status line); the
  synthetic-recording check on the simulator was cut short by machine load — rerun when convenient.

## Follow-ups (quality of captured exercises)
- Wire the sanity-check fallback (Arch §4.2): re-run Vision only on flagged frames and replace the failing limb.
- Gate segments in Review by detection ratio and visibility (hide/flag segments where the person is
  mostly missing or tiny); show the sanity-issue count per row.
- Capture: the ReplayKit recording includes UI chrome when the WebView rect is wrong → prefer the
  auto-crop when it disagrees strongly with the WebView rect.

## Known limits
- The LLM `/tag` backend from the architecture is not used (owner: local only). The tagger is heuristic;
  the user confirms tags in Review. Swap in the backend later behind the same `TagSuggestion` shape.
- Mat detection assumes a static camera and a mat darker than the floor; otherwise tap the 4 corners.
- OCR / speech-to-text (product spec §5) are not wired yet.
