# Phase 4 — results (capture → review → library, end to end)

Status (2026-10-28): **built; device verification in progress** (owner captures 5 real reels).

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
| Owner captures 5 real reels, each in < 30 s of his effort | _pending — owner_ |
| Each detected exercise can be renamed / merged / split / trimmed / deleted before saving | **built**; edit ops unit-tested; UI verified on the simulator with a synthetic recording (see below) |

## Verification notes
- Synthetic screen recording (static chrome + moving blob + dark trapezoid mat) → `sceneAnalysis`:
  _fill in: crop rect, mat quad, ms_.
- Share extension with a free Personal Team: _fill in: provisioned or not_.

## Known limits
- The LLM `/tag` backend from the architecture is not used (owner: local only). The tagger is heuristic;
  the user confirms tags in Review. Swap in the backend later behind the same `TagSuggestion` shape.
- Mat detection assumes a static camera and a mat darker than the floor; otherwise tap the 4 corners.
- OCR / speech-to-text (product spec §5) are not wired yet.
