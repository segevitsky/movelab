# Phase 2.5 — physical plausibility: results

Spec: `docs/05-phase-2.5-plausibility.md`. Harness: `npm run eval` (`src/pipeline/eval/`), one table per
fixture, metrics per segment. Every step below reports its delta against this baseline.

Definitions (see `metrics.ts`): **float** = mean |contact point − floor| / torso over in-contact frames;
**skate** = mean per-frame displacement (/ torso) of a point while in contact; **boneJump** = % bone-frames
whose 3D length (MediaPipe world) changes > 20 % vs the previous frame; **flagged** = % limb-frames the
sanity check flags; **depthFlips** = left/right near-side switches per second (legs + arms).

## Step 1 — baseline (2026-10-30, before any fix)

Contacts for the baseline use the naive proxy (`naiveContacts.ts`: within 0.15 torso of the lowest point
and slower than 1 torso/s, no hysteresis). Floor = horizontal line at the 97th-percentile lowest ankle
(what the renderer anchors to today). Depth = raw world z of knees / elbows, unsmoothed.

| fixture / segment | frames | float | skate | boneJump % | flagged % | depthFlips /s |
|---|---|---|---|---|---|---|
| reel1_mobility seg 1 (0.0–3.1 s) | 95 | 0.138 | 0.004 | 0.3 | 0.5 | 0.32 |
| reel1_mobility seg 2 (3.2–12.9 s) | 293 | 0.143 | 0.006 | 0.5 | 0.0 | 0.00 |
| reel1_mobility seg 3 (13.0–27.8 s) | 445 | 0.115 | 0.009 | 1.9 | 0.4 | 2.41 |
| reel2_staff seg 1 (0.0–27.5 s) | 825 | 0.094 | 0.007 | 3.7 | 0.1 | 0.95 |
| reel3_burpee seg 1 (0.7–11.9 s) | 337 | 0.116 | 0.010 | 2.6 | 0.7 | 1.34 |
| reel4_phone_plank seg 1 (0.2–10.7 s) | 409 | 0.277 | 0.008 | 0.9 | 0.0 | 0.00 |

Reading: the figure "floats" by 0.1–0.28 torso lengths at contact points (the horizontal floor at the
97th-percentile ankle is below where feet/hands actually touch, and perspective moves the true floor
line); 3D bone lengths jump > 20 % on 0.3–3.7 % of bone-frames while the 2D sanity check flags ≤ 0.7 %;
raw depth order flips up to 2.4×/s (reel 1 seg 3 and reel 3's crossing legs).
