# Phase 1 — results (skeleton pipeline in TS)

Status (2026-10-28): **done; all acceptance criteria met, 26 unit tests green.**
`src/pipeline` is pure TypeScript (imports only from itself), tested with vitest against golden outputs of
the Python prototype (`reference/pose-pipeline/export_expected.py` → `src/pipeline/__fixtures__/expected/`).

## Acceptance

| Criterion | Result |
|---|---|
| `segment()` on reel 1 → 3 segments ≈ [0–3.2], [3.2–13], [13–28] by pose discontinuity alone | **PASS**: [0–3.13], [3.2–12.93], [13.0–27.8] (snapshot in `src/pipeline/__snapshots__`) |
| `reps()` on reel 3 from 0.6 s → period 5.2 ± 0.2 s, periodic; `bestLoop()` ≈ 2.2–7.4 s | **PASS**: period 5.228 s (lag 157), score 0.321, loop frames 47–204 = 2.17–7.40 s — identical to Python |
| Reel 2 (staff flow) → one segment, not periodic | **PASS**: one segment 0–27.4 s; score 0.93 → not periodic |
| `clean()` matches the Python reference within 2 px RMS | **PASS**: max deviation < 0.05 px on all 5 fixture segments (the port is exact; the golden file is rounded to 3 decimals) |
| Unit tests green; no native deps in `src/pipeline` | **PASS**: `npm test` → 7 files, 26 tests |

Also ported/added: `feet()` (toes + heels relative to the shin, exact match to feetproc.py), `sanityCheck()`
(Arch §4.2 leg/arm collapse + bone length), `features()` (active joints — exact match to analysis.py —,
ROM, start/end pose, speed), `resample()` for variable-rate ReplayKit captures, `processCapture()` end to end.

## Design notes (where the port is not a line-by-line copy)
- **Landmark order is MediaPipe-33** everywhere. The prototype worked on COCO-17; `normalise()` (reps,
  features) uses the COCO-17 subset of the 33 so face/hand points don't dominate the pose distance —
  that is what keeps the validated period/loop numbers identical. `clean()` runs on all 33 joints.
- **Segmentation thresholds**, measured on the fixtures: hard cuts move the hip centre by 2–5 torso
  lengths between consecutive frames; the fastest continuous motion (staff spins) stays ≤ 0.35. Cut when
  hip jump > 1.0 torso, or mean normalised pose jump > 2.0, or no person for > 0.5 s, or an external cut
  time (scene-cut scores from the native decoder, Phase 4). Segments < 1.5 s are dropped (reel 1 has a
  1.3 s outro with a detected person; the prototype trimmed it by hand). All configurable.
- **ReplayKit captures are variable-rate** (phone fixture: nominal 39 fps, median interval ≈ 1/31.6 s):
  call `resample(frames, 30)` before `processCapture`.
- numpy/scipy equivalents in `math.ts` are tested against scipy outputs: `savgol_filter(mode='interp')`,
  zero-padded `medfilt`, linear `percentile`, clamped `interp`, `unwrap`.

## Open for later phases
- Fallback-model replacement of failing limbs (Arch §4.2) needs the Vision frames → Phase 4 wiring.
- Scene-cut (histogram) scores are not computed by the native module yet → Phase 4.
- `key_poses()` (cubic-spline keyframes) was not ported; not needed until compression matters.

Run: `nvm use && npm test` (vitest). Regenerate goldens: `scratch venv with numpy+scipy` →
`python reference/pose-pipeline/export_expected.py src/pipeline/__fixtures__/expected`.
