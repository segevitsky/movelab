# 06 — Design direction (Step 2 of the design pass)

_Status: **draft for approval, 2026-11-01**. No UI code written yet. Step 3 starts only after the owner approves
this doc (or the edited version of it)._

## 0. What this is, and one caveat

Goal (from the brief): MoveLab should look and feel like a focused, premium training app. **The animated
stick figure is the hero — nobody else has it. Everything else is quiet around it.** UI layer only: nothing in
`src/pipeline`, `src/generator`, `modules/*` or any data logic changes.

**Caveat on the research.** The Mobbin MCP answered every search with "Mobbin MCP requires a paid plan", and
the Chrome extension was not connected, so Mobbin's screen captures could not be consulted. The references
below are therefore the named apps themselves (App Store pages) plus two teardown articles that catalogue
dozens of in-workout and swap screens. The Mobbin-link column is left as `Mobbin: —` and should be filled in
once the plan is upgraded or the extension is connected; the principles do not depend on it. Where a
principle comes from the articles it is cited; where it comes from the apps as shipped it is marked `(app)`.

Sources used:
- Nike Training Club — https://apps.apple.com/us/app/id301521403
- Fitbod — https://apps.apple.com/app/id1041517543 · swap behaviour: https://help.fitbod.me/hc/en-us/articles/360006335593-Editing-Workouts-in-Fitbod · https://help.fitbod.me/hc/en-us/articles/38318585683991
- Ladder — https://apps.apple.com/us/iphone/story/id1823321534 (editorial), swap picker described in the substitution article below
- Apple Fitness+ — https://support.apple.com/guide/fitness-plus/apdf8a229f34 (metrics on/off), Apple HIG "Workouts" — https://developer.apple.com/design/human-interface-guidelines/workouts
- Strava record screen `(app)`; Hevy exercise library `(app)`
- screensdesign, "Workout app rest timer controls UX" — https://screensdesign.com/articles/workout-app-rest-timer-controls-ux/
- screensdesign, "Workout app exercise substitution UX" — https://screensdesign.com/articles/workout-app-exercise-substitution-ux/
- screensdesign, "Workout tracker app design examples" — https://screensdesign.com/articles/workout-tracker-app-design-examples/

## 1. The direction in one paragraph

**A dark room with one lit object.** Chrome (backgrounds, bars, chips, text) goes near-black and neutral so
it recedes; the figure keeps its warm paper stage and becomes the only bright surface on screen. One accent
(the existing steel blue, lifted for dark backgrounds) marks the single primary action and the running timer.
Pattern colours shrink to thin stripes and selected-state chips; they no longer paint the screen. Type is the
system font, heavy weights, tabular numerals, and the player timer is sized for 1.5 m, not for a hand-held
phone. Fewer controls, bigger targets, no instructional footnotes on screen.

## 2. References and principles per screen

### a) Library — grid of looping figure cards, filters, search

| App | What to look at | Mobbin |
|---|---|---|
| Nike Training Club `(app)` | Browse: full-bleed media cards, one line of text, filters as a single pill row | — |
| Apple Fitness+ `(app)` | Dark browse; the moving preview is the card, text sits under it, not on it | — |
| Fitbod `(app)`, exercise details | List with a looping demo thumbnail start-aligned, name + one meta line; muscle filter | — |
| Hevy `(app)` | Exercise library: search first, then equipment + muscle filters as two dropdowns, not chip walls | — |
| Ladder `(app)` | Dark cards with a strong thumbnail and quiet caption | — |

Principles taken:
1. **The card is the figure.** Media fills the card; the name sits below it in one line, 15–16 pt; at most
   one meta chip. Today's three-row tag cluster + s/rep goes; the pattern becomes a 3 pt stripe on the card
   (already there) and one chip.
2. **One filter row, not three.** Search field + a single horizontal row: `All · pattern ▾ · slot ▾ · gear ▾`
   that opens a bottom sheet. Three stacked chip rows (today) push the grid below the fold.
3. **Quiet by default, colour on selection.** Filter chips are neutral when off; the selected chip takes the
   pattern colour. Colour means "chosen", not "available".
4. **Two columns on an iPhone, 12 pt gutter, 1.1 aspect** (kept from the current tile). Three looping cards
   on screen is the Phase 2 perf budget, so the grid must not render more than ~6 live figures: cards below
   the fold use `FigureStill` and promote to `FigureCard` when ≥ 50 % visible.
5. **Counts and hints move out of the way.** "12 of 40 exercises" becomes a small line in the header, the
   empty state keeps its icon + one sentence, and the "+" FAB stays (end-bottom).

### b) Workout player — used mid-workout from ~1.5 m with sweaty hands

| App | What to look at | Mobbin |
|---|---|---|
| Nike Training Club `(app)` | Black player, media on top, time + exercise name under it, 2–3 round controls | — |
| Apple Fitness+ `(app)` + HIG Workouts | Metrics overlay in large tabular numerals; "use large font sizes, high-contrast colors" (HIG) | — |
| Strava record `(app)` | One huge number dominates; secondary numbers a third of its size; one giant pause button | — |
| Ladder `(app)` | Dark player, countdown + "Next up" row, interval bar | — |
| Interval timers (rest-timer article: WeGLOW, JEFIT, Zing, Hybrid Calisthenics) | Pause under the countdown, full-width Skip, named ±15 s, next exercise + position visible during rest | — |

Principles taken:
1. **Figure ≥ 55 % of the height, timer ≥ 20 %, controls the rest.** The figure stage is edge-to-edge
   (rounded 24 pt), the timer sits directly under it, the control row is pinned above the home indicator.
2. **Timer readable from 1.5 m.** On this phone 1 pt ≈ 0.166 mm. A digit cap height of ~20 mm reads
   comfortably at 1.5 m, which is a **160–176 pt** font (current: 96). Exercise name **≥ 28 pt** (≈ 5 mm),
   "next" line **≥ 20 pt**. Everything below 17 pt is removed from the player (the swipe-hints footnote goes;
   gestures stay).
3. **≤ 3 controls on screen:** `back · pause/play · skip` as round buttons, pause **88 pt**, the others
   **64 pt**, gaps ≥ 24 pt. `+15 s` becomes a *rest-only* control that replaces the back button during rest
   (the article's "truthful primary action per state"), with its amount in the label. Section jump, swap and
   close move into the top bar as 44 pt targets.
4. **State is shown by colour, not by words alone.** Work = accent timer, rest = muted timer + "REST" eyebrow
   + the *next* figure already looping (Ladder/NTC do this with the next video). Last 3 s: the digits pulse
   and the step bar turns accent. Paused: digits dim to 50 % and the big button shows ▶.
5. **Next up is always answerable.** During work: "then · <name>" under the timer. During rest: the figure is
   already the next drill, the name is the headline. Round counter lives in the top bar, not near the timer.

### c) Today — generated workout list with swap/lock per drill and a big Start

| App | What to look at | Mobbin |
|---|---|---|
| Fitbod `(app)` + help docs | Workout overview is the screen; "Swap" at the top, exercise rows with demo thumbnail, start button pinned at the bottom | — |
| Ladder (substitution article) | Swap picker splits Current / Coach recommendation / Similar movements | — |
| Pump Club, Befit (substitution article) | Explicit scope ("this workout" vs "program"), CURRENT above RECOMMENDED | — |
| Stronger, Planfit (design-examples article) | "Today's workout" header with total time + count, list, one Get Started button | — |
| Nike Training Club `(app)` | Session overview: hero → "what's in it" list → Start | — |

Principles taken:
1. **The workout is the screen; the knobs are a sheet.** Framework / energy / focus / surprise move into a
   compact header strip (`Segev 3×6 · medium · mix ▾`) that opens a sheet. Today the inputs panel is the
   first thing on screen and the workout is below it.
2. **One primary action, pinned.** A full-width **Start · 32 min** button fixed at the bottom (not a FAB), the
   "why" line as a single quiet sentence above the list. "Save for later" goes into the header menu.
3. **Rows are swipe-quiet.** Each drill row: 56×68 still figure (start), name, one dosage line
   (`45 s · 3 rounds`), a lock glyph only when locked. Swap/lock/remove live in the tap-through viewer and
   the swipe actions already built; no inline ± buttons on the row (they are < 44 pt and compete with the
   name).
4. **Swap keeps the current drill in view and separates preview from commit** (article): the picker opens
   with the current card on top, then "Fits the slot" and "Everything else", and a labelled **Replace**
   button; tapping a row previews the loop, it does not swap.
5. **Sections are headers, not cards-in-cards.** Block name + rounds as a section header (`ROUNDS × 3`), rows
   separated by hairlines. Nested white panels on a paper background become flat groups on dark.

## 3. Design tokens (`src/theme/tokens.ts`, Step 3)

### Colour — dark-first, one accent
```
bg            #0e1014   near-black, slightly warm-neutral (not pure black: the paper stage must not glow)
surface       #171a21   cards, bars, sheets
surfaceRaised #1f232c   pressed / nested surfaces, chips off
line          rgba(255,255,255,0.08)
ink           #f2f1ec   primary text (warm white, same family as the paper)
inkSoft       #c9cbd1
muted         #8a8f9b   secondary text, inactive icons (≥ 4.5:1 on bg)
accent        #4f93bf   steel blue lifted for dark bg (same hue as today's #2f6b8f; 5.0:1 on bg)
accentDeep    #2f6b8f   accent fills behind white text (buttons), unchanged from today
accentSoft    rgba(79,147,191,0.16)
rest          #6f7f91   rest-state timer and bar (blue-grey, clearly not accent)
danger        #c2584a   brick, lifted
success       #7fa386   moss, lifted
```
- **Figure stage stays paper.** `COLORS.bg #f6f3ee`, near side `#1c202c`, far side `#808696`, floor and
  mat tones all unchanged. The paper rectangle is the one bright object in the dark room, so the fixed side
  colours stay exactly as readable as today and the renderer is not touched. (Alternative, *not*
  recommended now: a dark figure palette with inverted sides; it means a `palette` parameter in
  `src/figure/draw.ts`, a second set of floor/shadow tones, and re-checking Phase 2 acceptance. Parked.)
- **Pattern colours** (`patternColor`, `slotColor`) keep their hues but each gets a lifted dark-variant
  (+12 % lightness) for text on dark; the existing `tint()` keeps working for chip fills. They appear only as
  the 3 pt card stripe, the selected filter chip, and one tag per row.
- Light mode: not in this pass. Tokens are structured as `{ dark, light }` so the paper palette can come
  back as a theme later; `app.json` `userInterfaceStyle` goes to `"dark"`.

### Type — system font (SF), tabular numerals where numbers change
```
display   168 / 176   w900  tabular   player timer (160 on small phones)
h1         34 / 40    w800            screen titles, "Workout done"
h2         28 / 34    w800            player exercise name (adjusts down to 22)
h3         20 / 26    w700            section headers, sheet titles
body       16 / 22    w500            rows, descriptions
label      13 / 18    w700  +0.6 ls   eyebrows, UPPERCASE section names
caption    12 / 16    w500            meta (never in the player)
```
Nothing smaller than 12. Nothing in the player smaller than 17.

### Spacing, radii, targets
```
space   4 · 8 · 12 · 16 · 24 · 32 · 48      (4-pt grid; screen gutter 16, card inner 12)
radius  chip 12 · card 16 · stage/sheet 24 · pill 999
hit     min 44 · player controls 64 · player primary 88 · gaps between player controls ≥ 24
border  hairline on dark = `line` token; no drop shadows on dark (use surface steps instead)
```

### Motion (Reanimated, durations in ms)
```
micro      120   chip toggle, press scale 0.96, icon swaps
standard   220   step change in the player (FadeIn), row enter/exit (keep `Rise`/`Drop` springs, damping 16–18)
screen     320   sheets up/down, viewer open
timer      last 3 s: digit scale 1.0 → 1.06 → 1.0 per second, 160 ms; "go" flash = accent 450 ms (kept)
reduce     respect `AccessibilityInfo.isReduceMotionEnabled`: no stagger, no pulse, fades only
```
The figure loop itself is untouched (UI-thread Reanimated + Skia pictures).

## 4. Wireframes (start/end; mirror for RTL)

### Library
```
┌──────────────────────────────────────────┐
│ Library                          40 ex.  │  h1 start · caption end
│ ┌──────────────────────────────────────┐ │
│ │ 🔍  Search name or alias             │ │  surface, 44 pt
│ └──────────────────────────────────────┘ │
│ (All) (pattern ▾) (slot ▾) (gear ▾)      │  one row; selected chip = pattern colour
│                                          │
│ ┌────────────────┐  ┌────────────────┐   │
│ │▌ paper stage   │  │▌ paper stage   │   │  ▌= 3 pt pattern stripe (start edge)
│ │   looping fig  │  │   looping fig  │   │  2 cols, 12 gutter, 1.1 aspect
│ │                │  │                │   │
│ ├────────────────┤  ├────────────────┤   │
│ │ Archer push-up │  │ Hollow hold    │   │  body w700, 1 line
│ │ push           │  │ core · 40 s    │   │  caption muted, ≤ 1 chip
│ └────────────────┘  └────────────────┘   │
│ ┌────────────────┐  ┌────────────────┐   │
│ │ (still until   │  │ (still until   │   │  FigureStill below the fold, promotes
│ │  ≥50% visible) │  │  ≥50% visible) │   │  to FigureCard when visible (≤ 6 live)
│ …                                   (+) │  FAB 56, end-bottom
├──────────────────────────────────────────┤
│  ▦ Library    ▶ Today    ⚑ Goals   ⚒ Dev │  surface tab bar, accent active
└──────────────────────────────────────────┘
```

### Player (work step; rest = same frame, muted timer, next figure already looping)
```
┌──────────────────────────────────────────┐
│ (×)   ◂ ROUNDS · round 2/3 ▸    4/18  ⇄  │  44-pt targets; section jump arrows; swap
│ ━━━━━━━━━━━━━━━━━━━━━━━━░░░░░░░░░░░░░░░░ │  2 pt whole-workout progress (accent)
│ ┌──────────────────────────────────────┐ │
│ │                                      │ │
│ │          paper stage                 │ │  ≥ 55 % of height, radius 24
│ │        looping figure                │ │  (floor + mat drawn by the renderer)
│ │                                      │ │
│ │                                      │ │
│ └──────────────────────────────────────┘ │
│  WORK · PUSH                             │  label, pattern colour
│  Archer push-up                          │  h2 28, 1 line, shrinks to 22
│                                          │
│              42                          │  display 168, tabular, accent (rest: muted)
│  ━━━━━━━━━━━━━━━━━━━━━━░░░░░░░░░░░░      │  6 pt step bar
│  then · Hollow hold                      │  20 pt muted  (rest: this line IS the headline)
│                                          │
│      (⏮ 64)      (⏸ 88)      (⏭ 64)      │  3 controls, gaps ≥ 24; rest: ⏮ → (+15 s)
│                                          │
└──────────────────────────────────────────┘
```
Gestures kept (swipe start/end = skip/back, long-press = section) but no on-screen hint text.

### Today
```
┌──────────────────────────────────────────┐
│ Today                                 ⋯  │  menu: save for later · frameworks
│ (Segev 3×6 · medium · mix ▾)             │  header strip → inputs sheet
│                                          │
│ ✦ pull + core today, legs were yesterday │  one quiet sentence, accentSoft
│                                          │
│ WARM-UP · 6 min                          │  label
│ ┌──┐ Inchworm                45 s        │  56×68 still (start) · name · dosage
│ └──┘ locomotion                          │
│ ┌──┐ World's greatest str.   45 s        │
│ └──┘ mobility                            │
│ ───────────────────────────────────────  │  hairlines, no nested cards
│ ROUNDS × 3 · 90 s break ▾                │  break picker in the section header
│ ┌──┐ 🔒 Archer push-up        6 reps     │  lock glyph only when locked
│ └──┘ push                                │
│ ┌──┐ Hollow hold              40 s       │
│ └──┘ core                                │
│ ┌──┐ no card for pull yet   choose ›     │  unfilled slot, muted, tappable
│ …                                        │
│ RECENT                                   │  collapsed list, same row style
│                                          │
│ ┌──────────────────────────────────────┐ │
│ │ ▶  Start · 32 min                    │ │  pinned, full width, 56 pt, accentDeep
│ └──────────────────────────────────────┘ │
└──────────────────────────────────────────┘
```
Tap a row → the existing `WorkoutViewer` (large loop, Replace / Surprise me / Lock / Card / Remove).
Swipe a row → Choose / Remove (existing `SwipeRow`). Swap picker: current card on top, "Fits the slot",
"Everything else", labelled **Replace**.

## 5. RTL-readiness rules

- Styles use `start`/`end`, `marginStart`/`marginEnd`, `paddingStart`/`paddingEnd`, `textAlign: 'start'`
  (RN maps these for RTL). `flexDirection: 'row'` already flips under RTL; never use `row-reverse` to fake
  alignment.
- Icons that mean direction (chevrons, skip back/forward, section arrows) get `transform: [{ scaleX: isRTL
  ? -1 : 1 }]` via one `DirectionalIcon` helper. Time and numbers stay LTR (`writingDirection: 'ltr'` on the
  timer).
- Swipe gestures map to "forward/back", not "left/right", and read `I18nManager.isRTL`.
- `app/_layout.tsx` currently forces RTL off (`I18nManager.forceRTL(false)`). That stays until there are
  Hebrew strings; the layout work makes the flip a one-line change later.
- Current `left`/`right` usages to convert in Step 3 (all UI, none in data code):
  `app/(tabs)/library.tsx` (meta `marginLeft: 'auto'`, FAB `right`), `app/(tabs)/today.tsx` (play icon
  `marginLeft`, FAB `right`), `app/workout/[id].tsx` (same two), `app/player/[workoutId].tsx` (`closeBtn
  marginLeft`, `+15 s right`), `src/ui/SwipeRow.tsx` (`actions right: 0`), `src/figure/Figure.tsx` (HUD
  `right`), `app/(tabs)/dev.tsx`, `app/review.tsx` (footer `left/right: 0` is symmetric and fine; the
  absolute `left:` of quad handles is geometry, not layout, and stays).

## 6. Step 3 plan (after approval)

1. `src/theme/tokens.ts` (colour/type/space/radius/motion as above, `{ dark }` now, `light` slot reserved);
   `src/ui/theme.ts` re-exports from it so untouched screens keep compiling.
2. Primitives in `src/ui/`: `Screen` (safe area + bg + optional pinned footer), `Card`, `Button`
   (primary/secondary/ghost, sizes m/l, min 44/56), `Chip` (neutral off, coloured on), `BigTimer`
   (display type, tabular, work/rest/paused/last-3-s states, pulse, reduce-motion aware), `DirectionalIcon`.
3. Apply **Library** → device screenshot → **Player** → screenshot → **Today** → screenshot. Before shots
   are taken first from the current build.
4. Perf gate: 3 looping cards + player at ≥ 60 fps on the device (Phase 2 acceptance), checked after Library
   (live-card promotion) and after Player.
5. Report: before/after per screen, list of files touched, anything that drifted from this doc.

Not in this pass: Goals tab, Dev tab, Review, Capture, Frameworks editor, Exercise detail. They inherit the
tokens through `src/ui/theme.ts` and get a follow-up pass.

## 7. Decisions needed from the owner

1. **Figure stays on paper inside a dark app** (recommended, §3) vs. an inverted dark figure palette.
2. **Timer size 168 pt** and removing the on-screen gesture hints from the player — ok?
3. **Today: inputs collapse into a header strip + sheet; Start becomes a pinned full-width button** instead
   of the FAB — ok?
4. **Library filters collapse to one row with sheets** — ok, or keep chips visible for speed?
5. Mobbin: upgrade (to fill the reference links and sanity-check these principles against captures), or
   proceed without.

## 8. Step 3 — what was built (2026-11-01)

Approved as recommended (paper figure in a dark app, 168 pt timer, inputs strip + pinned Start, one filter
row with sheets, no Mobbin).

- `src/theme/tokens.ts` — the tokens of §3; `src/ui/theme.ts` re-exports them so every screen went dark at
  once. `app.json` + `ios/movelab/Info.plist` → `userInterfaceStyle: dark` (system alerts/sheets follow
  after the next native build). Root layout: light status bar.
- Primitives: `Button` (primary/secondary/ghost, m/l), `IconButton` (round, ≥ 44, primary variant),
  `Chip` (quiet off, colour on), `Tag`, `ChipRow` in `src/ui/Button.tsx`; `Screen` (pinned footer),
  `TitleBar`, `Card`, `SectionHeader`, `Divider`, `Sheet` + `OptionRow`, `Empty`, `DirectionalIcon` in
  `src/ui/primitives.tsx`; `BigTimer` in `src/ui/BigTimer.tsx`; `DrillRow` in `src/ui/DrillRow.tsx`.
- **Library**: title + count, search, one filter row (`All · pattern ▾ · slot ▾ · gear ▾` → sheets),
  2-column figure cards with a 3 pt start-edge stripe, one name line, one tag; only the first 6 visible cards
  loop (`onViewableItemsChanged`), the rest are stills.
- **Player**: paper stage budgeted from the space left after bars, text block and controls (on the 17 Pro Max ≈ 45 % of the height with the timer at 136 pt; the 168 pt timer only fits with a smaller figure, so the 55 % target of §2b was traded for a non-overlapping layout), radius 24, eyebrow (`45 s · push`), name (28 pt),
  `BigTimer` (168 pt, state colours, last-3-s pulse, reduce-motion aware), "then · next" (20 pt), three
  controls (64 / 88 / 64 pt, 24 pt gaps); `+15 s` replaces ⏮ during rest. Section pill: tap the arrows or
  **swipe the pill** to jump a section; swipe the stage for steps. No hint text. Done screen in the same tokens.
- **Today**: `Today` title + ⋯ menu (save for later, frameworks), inputs strip → sheet (framework, energy,
  focus, surprise, Generate), "why" line, sections as headers with a break picker, `DrillRow`s with hairlines,
  swipe = Choose/Remove, tap = viewer (Replace / Surprise me / Lock / Less / More / Card / Remove),
  Recent list, pinned footer `⟳ · Start · N min`.
- **Saved workout** (`app/workout/[id]`): same rows; **tap now opens the viewer with ◀ ▶ / swipe** (owner
  request), dosage ± moved into the viewer actions, break picker sheet, pinned Start.
- `SwipeNav` reads the latest callbacks (the old one captured the first render's closures, so swiping in
  the viewer could use a stale index) and mirrors under RTL. Remaining `left/right` styles converted to
  `start/end` (`SwipeRow`, `Figure` HUD, dev/review `marginStart`).
- Dev tab: **Demo workout → player** (also `movelab:///dev?demo=1`) for demos and screenshots.
- **Share as GIF** (owner request, exercise card): `src/export/gif.ts` is a dependency-free GIF89a encoder
  (popularity palette, LZW, loop; unit-tested) and `src/export/exerciseGif.ts` renders the loop window
  offscreen with the same `drawFrame` (320 px, 15 fps) and opens the share sheet (Photos, AirDrop,
  WhatsApp). Skeleton only, never video.

Not restyled yet (inherit the dark tokens, get a follow-up pass): Goals, Dev, Review, Capture, Frameworks
editor, Exercise detail, Figures lab.

**Screenshots** (`docs/design-pass/`): `before-library.png`, `before-today.png` (phone, old theme);
`after-workout-viewer.png` (phone, new theme: saved-workout viewer). Library / Player / Today after-shots
are still to be taken: the simulator path is blocked by the un-tappable "Open in MoveLab?" prompt of
`simctl openurl`, and deep-linking the phone reloads the app while the owner is using it. Take them from
the phone with `xcrun devicectl device capture screenshot --device <udid> --destination <png>` while the
owner holds each screen.
