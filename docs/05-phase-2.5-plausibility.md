# Phase 2.5 — Physical plausibility (insert before Phase 3)

The owner reviewed the renders on the phone. The figure is good but not trustworthy yet:

| Symptom (owner's words) | Root cause |
|---|---|
| Legs suddenly get long, look unrelated to the body | A single frame/limb is wrong; we draw whatever the model says |
| Person floats, not on the ground | No notion of ground contact; floor is a rough estimate |
| A limb is raised for no reason | Same as above: a hand or foot that should be planted "floats" |
| Limbs are unclear | No depth order: overlapping left/right limbs are drawn in fixed order |

Most of this comes from **missing physics**, not from a weak model. Fix it in this order:
**measure → contact + floor → 3D bone-length check → depth order**. A second model only
enters through the bone-length check, for the frames it flags.

All logic lives in `src/pipeline` (pure TS, vitest) except step 5 (renderer). Use the
Python reference behaviour and the fixtures in `reference/sample-data/`.

---

## Step 1 — Eval harness first (do not skip)

`src/pipeline/eval/metrics.ts` + a CLI script (`npm run eval`) that prints one table per fixture,
before and after each step:

- **float**: mean distance (px, normalised by torso length) between contact points and the floor while in contact
- **skate**: how far a planted foot/hand moves while it is in contact
- **boneJump**: % of frames where a bone's 3D length changes > 20 % from the previous frame
- **flagged**: % limb-frames flagged as implausible
- **depthFlips**: number of left/right draw-order switches per second

Save the baseline numbers in `docs/phase2.5-results.md`. Every later step must report its delta.

## Step 2 — Contact detection

`contacts(frames) → { heelL, heelR, toeL, toeR, handL, handR: boolean[] }`.
For heels/toes, use 29–32. For hands, use wrists 15/16 or the mean of hand points 17–22.

A point is in contact when **both** hold for ≥ 4 frames:
- its speed is below a threshold (normalised by torso length per second), and
- it is within a margin of the lowest candidate point in that frame.

Add hysteresis (4 frames) so the flag does not flicker. This is the lesson from the staff tracker.

Tests:
- Reel 3: the floor foot in the push-up, and the planted foot in the lunge, are in contact.
- Reel 3: the raised leg is never in contact.
- Hands are in contact during the push-up.

## Step 3 — Floor + pinning

- Fit the floor per segment from the contact points with a robust line fit (Theil–Sen or RANSAC) in image space.
- If a mat quad exists (Architecture "Scene elements"), use its near edge instead.
- **Root pinning:** per frame, apply one vertical offset to the whole figure so the contact points sit on the floor. Smooth the offset with a One-Euro filter. Never move single joints here.
- **Foot lock (optional, only if time allows):** while a foot is in contact, hold its position fixed. Solve the leg with 2-bone IK (hip → knee → ankle) and blend in/out over 3 frames.

Acceptance: `float` drops by ≥ 70 % on reels 1 and 3. Reel 2 (staff) shows no visible regression.

## Step 4 — 3D bone-length plausibility check (extends `sanityCheck`)

Use MediaPipe **world** landmarks (`w`, metres). Real bones have a constant 3D length, unlike in 2D, where foreshortening is real.

**Measured on the fixtures — read this before choosing thresholds.** MediaPipe's 3D bone lengths are noisy:
- p95 deviation from the median is 13–30 %.
- A fixed ±15 % threshold flags 5–27 % of frames, which is far too many.

So:
- Flag a limb-frame on a **sudden jump** (> 20 % change vs the previous frame, or vs a short rolling median) **and** an absolute deviation > 25 % from the segment median. Tune both on the fixtures.
- Flag the **limb** (thigh+shin, or upper arm+forearm), not the whole frame.
- Flagged limb-frames → NaN → the existing gap fill. Phase 4 will later replace this with the fallback model (Apple Vision; possibly RTMW) for those limbs only.

**This is NOT bone-length clamping.** We never reshape a limb to a target length. We only reject frames that are physically impossible. Update the wording in CLAUDE.md's hard rules to say this.

Target: `flagged` < 5 % per fixture, and `boneJump` near 0 after cleaning.

Tests: inject a synthetic 40 % leg stretch into 3 frames of reel 3. Those frames must be flagged; the neighbouring frames must not.

## Step 5 — Depth order in the renderer

- Per limb pair (legs, arms), decide which side is nearer from the world `z` of the knees/elbows. Smooth the result, with 6-frame hysteresis.
- Draw the far limb first, at 85 % width and slightly lighter. Keep the fixed side colours.
- This is depth from 3D, not near/far colouring from confidence (which failed before).

Acceptance: `depthFlips` ≤ 1/s on all fixtures. The crossing legs in reel 3 read clearly in the dev screen.

## Step 6 — Debug screen

Add these toggles to the existing figure dev screen:
- raw vs corrected
- contact dots (green)
- flagged limbs (red)
- floor line

Pin `reel3 @ push-up` and `reel1 @ seated move` as presets.

---

## Docs to update
- `docs/02-architecture.md`: §4.2 (3D check), new §4.7 "Contacts & floor", §5 (depth order).
- `docs/03-implementation-plan.md`: insert Phase 2.5. Add the following to the Parking lot:
  - an RTMW (whole-body) CoreML second model
  - Apple Vision 3D body pose
  - temporal 3D models (WHAM/GVHMR — note: SMPL licence is non-commercial)
- `docs/phase2.5-results.md`: metrics before and after each step, plus screenshots.

## Tonight's stop points
1. Steps 1–2 (harness + contacts) → commit.
2. Step 3 without foot lock → commit, then check on the phone.
3. Steps 4–5 if time allows. Otherwise stop and write the results.
