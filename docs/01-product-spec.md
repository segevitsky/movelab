# MoveLab — Product Spec

> Working name. iPhone-first native app (Expo / React Native).
> Owner: Segev. Status: pre-build, decisions below are agreed unless marked **OPEN**.

## 1. One-liner

Turn fitness content from the internet into **your own exercise library and workouts**.
You see a move in a reel, share it to the app, it becomes an animated exercise card,
and the app builds varied workouts from your cards in the format you like.

This is what the owner already does by hand (head + Google Keep + Instagram saves).
v1 is for the owner. The design must not block opening it to other users later.

## 2. Core loop

```
Discover (Instagram reel)
  → Capture (share → in-app embed → one-tap record)
  → Model (split into exercises → skeleton → stick-figure card + tags)
  → Library (your exercise bank + learned "what goes with what")
  → Generate (framework + bank + goals + history → workout)
  → Train (full-screen player: figure, timers, rests)
  → Feedback (easy / right / hard) → better next workout
```

## 3. Principles

1. **The exercise is the unit.** Every reel is split into individual exercises. Each becomes
   a standalone card. The reel itself is kept only as *context* (source, order, co-occurrence).
2. **Capture must be one flow, not a chore.** Share from Instagram → record → done.
   If capture is annoying, the product fails.
3. **Show what was detected, never invent anatomy.** The stick figure is drawn only from
   detected joints. No guessed feet, no "corrected" bone lengths (we tried, it looked broken).
4. **Learn from coaches, don't hallucinate.** Workouts are composed from moves and pairings
   real coaches already published, then remixed. The LLM arranges; it does not invent exercises.
5. **Keep only the skeleton.** Recorded video is processed on device and deleted. We store
   joints, metadata and the source link.

## 4. User flows

### 4.1 Capture (from Instagram)
1. In Instagram, on a reel: **Share → MoveLab** (iOS share extension receives the URL).
2. App opens a capture screen with the reel **embedded** (official Instagram embed in a WebView).
3. User taps **"Model it"** → in-app screen recording starts (ReplayKit, no Control Center).
4. User taps play on the embed (embeds cannot autoplay). Recording auto-stops when the video ends
   or on tap.
5. Processing runs on device (target: < 60 s for a 30 s reel). User can leave; a local
   notification fires when ready.

Fallbacks (same pipeline after the video exists):
- **Upload a video** from Photos (iOS screen recording, own footage, any source).
- **Paste a link** inside the app (same as share).

Embed failure (owner disabled embedding, private account): show "Can't embed this reel —
record it with iOS screen recording and upload".

### 4.2 Review (after modeling)
Screen: "Found 3 exercises from @coach"
- One row per detected exercise: looping stick figure, suggested name, suggested tags.
- User can: rename, edit tags, merge two segments, split one, trim start/end, delete.
- Checkbox: **Add to my library** (default on).
- The reel → exercises relation is always stored (for the pairing graph) regardless of choices.

### 4.3 Library
- Grid/list of exercise cards with looping figures.
- Filter by: movement pattern, slot, equipment, intensity, source coach, goal.
- Card detail: figure (speed 0.5x/1x, mirror), tags, dosage default, source link, "appears with" list.
- Manual add: name + optional link + optional video. (Figure only if video provided.)

### 4.4 Frameworks (workout templates)
A framework is a template of blocks and slots. The engine fills slots from the bank.

Owner's default framework (ship as preset "Segev 3×6"):
```
Warm-up 6 min: 4 slots × 90 s — tags: warmup | locomotion | mobility
Rounds × 3: 5–6 slots back-to-back, no rest between exercises
  slot 1: skill|strength (fresh, first)
  slot 2: pull
  slot 3: push
  slot 4: legs
  slot 5: core
  slot 6: cardio (optional)
  rest between rounds: 120 s
Cool-down 3 min: stretch
```
Other presets: EMOM, Tabata, flow (continuous), skill-only. User can build/edit frameworks in a
simple editor (blocks → slots → filters → time/reps → rest).

### 4.5 Generate
- **"Today's workout"** one tap. Optional quick inputs: time available, energy (low/med/high),
  equipment available, focus.
- Result screen: the workout, one line of "why" ("pull + core today, legs were yesterday").
- Per slot: **Swap** (re-roll that slot only), lock, or remove.
- Save as favourite / repeat later.

### 4.6 Train (player)
- Full-screen figure, big countdown, next-up preview, round counter.
- Auto-advance with haptics + sound on transitions; rest screen shows what's next.
- Screen stays awake. Works offline. Readable from 1–2 m with sweaty hands
  (huge targets, minimal taps).
- Pause, skip, back, +15 s.
- End screen: one-tap feedback (easy / right / hard) and optional per-exercise notes.

### 4.7 Goals (progressions)
- A goal is an ordered list of stages, each an exercise with a pass criterion
  (e.g. L-sit: support hold → seated leg lifts → tuck → one-leg → full; "3 × 30 s clean").
- Active goals (recommend max 3) take the skill slot in generated workouts.
- User marks a stage as passed; the next stage replaces it.
- Seed goals for v1 (owner's list): flexibility/splits, knee strength, pull-ups, muscle-up,
  L-sit, crawls. (Stages drafted in `reference/seed-goals.md`.)

## 5. What we learn from each reel (beyond the move)

| Source | Extract | Used for |
|---|---|---|
| Caption, hashtags | names, sets/reps, purpose | naming, dosage, tags |
| On-screen text (OCR) | "#1", "3 moves that mobilize…" | segment names, purpose |
| Audio (speech-to-text) | cues, counts, times | technique notes, dosage |
| Skeleton | reps, hold time, tempo, range of motion, start/end pose | dosage, flow chaining, tags |
| Context | coach, order, co-occurrence | pairing graph, coach "recipes" |

**Pairing graph:** exercises that appear together across reels/coaches get a weighted edge;
order gives direction. The generator prefers strong, compatible pairings and flows where
end pose of A ≈ start pose of B.

## 6. AI's role

- **Tagging:** propose name + tags from caption/OCR/transcript + skeleton features. User confirms.
- **Composing:** fill a framework under constraints (see Architecture §6) — rule engine first,
  LLM for selection/ordering explanations and creative remixes.
- **Remix:** "new flow from moves I have", easier/harder variant suggestion (from existing
  cards only), weekly challenge.
- **Adapting:** use feedback + history to adjust volume/intensity.

## 7. Out of scope (v1)

- Downloading/scraping Instagram on a server. Logging in to Instagram on users' behalf.
- Social features, sharing workouts publicly, coach marketplace.
- Nutrition.
- Android (comes nearly free with Expo later; not tested in v1).
- 3D character rendering (stick figure only; 3D joints used for analysis/view angle later).

## 8. Success for v1

- Owner captures a new reel in < 30 s of his own effort, ≥ 80 % of the time without fallback.
- Owner trains with generated workouts ≥ 4 days/week for a month and keeps the app.
- Library ≥ 60 own exercises with acceptable figures.

## 9. OPEN questions

- **OPEN:** Account/sync — local-only for v1, or Supabase sync from day one? (Recommend local-first
  SQLite + optional sync later.)
- **OPEN:** Which LLM provider and where the key lives (needs a tiny backend proxy).
- **OPEN:** Does ReplayKit in-app recording capture the video inside the Instagram embed
  WebView? → **Phase 0 must answer this.**
- **OPEN:** Product name.
