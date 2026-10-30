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

## Step 2 — contacts (`src/pipeline/contacts.ts`)

Detector: per point (heels 29/30, toes 31/32, wrists 15/16) a frame qualifies when its 5-frame-averaged
speed is < 1.0 torso/s **and** it lies within 0.2 torso of the lowest point **of its own group** (feet vs
hands); 4-frame on/off hysteresis. Measured on reel 3 before choosing: planted joints jitter at a median
0.4–0.6 torso/s, and in a side view the planted toe sits 0.27 torso *above* the planted hands in image y
(the floor is not horizontal in the image), which is why the group-relative rule was needed.

Tests (reel 3): hands planted in > 85 % of push-up frames; one-leg push-up has exactly one planted foot
and the planted one is the lower one; upright frames without a planted foot are airborne (both feet fast);
no contact flickers faster than 4 frames.

Effect on the metrics (same floor as the baseline, i.e. the horizontal 97th-percentile-ankle line):

| fixture / segment | contact point-frames | float | skate |
|---|---|---|---|
| reel1_mobility seg 1 | 160 → 183 | 0.138 → 0.462 | 0.004 → 0.005 |
| reel1_mobility seg 2 | 546 → 744 | 0.143 → 0.158 | 0.006 → 0.006 |
| reel1_mobility seg 3 | 927 → 1392 | 0.115 → 0.137 | 0.009 → 0.009 |
| reel2_staff seg 1 | 1824 → 2832 | 0.094 → 0.272 | 0.007 → 0.008 |
| reel3_burpee seg 1 | 448 → 577 | 0.116 → 0.139 | 0.010 → 0.009 |
| reel4_phone_plank seg 1 | 572 → 1146 | 0.277 → 0.739 | 0.008 → 0.011 |

**Reading:** float *rises* because the detector now counts hands in planks/push-ups and both feet when
standing — all true contacts that the horizontal ankle-line floor places far from the "ground". This is a
measurement correction, not a regression; step 3 (fitted floor + root pinning) is judged against these
step-2 numbers. skate is essentially unchanged (≈ 0.005–0.011 torso/frame = tracking jitter).
