/**
 * Phase 13 step 2 — visual scene cuts (pure TS). The native side samples the recording at ~10 fps inside the
 * crop and reports, per sample, how much the picture changed since the previous sample: `hist` = grayscale
 * histogram difference (0..1) and `pix` = mean absolute pixel difference (0..255). An edited transition is a
 * spike in both that stands far above the local level; continuous motion raises the level but not a spike.
 * The cut times feed `segment({ cutTimes })`.
 */
export type SceneDiffSample = { t: number; hist: number; pix: number };

export type SceneCutOptions = {
  /** minimum histogram change for a cut (0..1) */
  minHist?: number; // 0.3
  /** minimum mean pixel change (0..255) */
  minPix?: number; // 20
  /** spike must exceed this × the local median (±1 s) of each measure */
  ratio?: number; // 4
  /** cuts closer than this (s) merge into the first */
  mergeSeconds?: number; // 0.4
};

export function detectSceneCuts(samples: SceneDiffSample[], opts: SceneCutOptions = {}): { t: number; hist: number; pix: number }[] {
  const minHist = opts.minHist ?? 0.3, minPix = opts.minPix ?? 20, ratio = opts.ratio ?? 4, merge = opts.mergeSeconds ?? 0.4;
  const med = (xs: number[]) => { if (!xs.length) return 0; const s = [...xs].sort((a, b) => a - b); return s[s.length >> 1]; };
  const out: { t: number; hist: number; pix: number }[] = [];
  for (let i = 1; i < samples.length; i++) {
    const s = samples[i];
    if (s.hist < minHist || s.pix < minPix) continue;
    const near = samples.filter((x, k) => k !== i && Math.abs(x.t - s.t) <= 1.0);
    const mh = med(near.map((x) => x.hist)), mp = med(near.map((x) => x.pix));
    if (s.hist < Math.max(minHist, mh * ratio) || s.pix < Math.max(minPix, mp * ratio)) continue;
    const last = out[out.length - 1];
    if (last && s.t - last.t < merge) { if (s.hist > last.hist) out[out.length - 1] = s; continue; }
    out.push({ t: s.t, hist: s.hist, pix: s.pix });
  }
  return out;
}

/**
 * The reel player often plays a few seconds, jumps back and starts over (owner, 2026-11-01). When the
 * recording began mid-stream (no `play` event in the timeline) and a strong visual cut lands within the
 * first `maxPrefixSeconds`, the frames before it are a tail fragment of the previous loop, not an exercise:
 * return the cut time as the new playback start. Fixture: DfC8LdUIjV4-restart (cut at 4.3 s split one drill in two).
 */
export function restartPrefix(cuts: { t: number; hist: number }[], hasPlayEvent: boolean, maxPrefixSeconds = 6, minHist = 0.3): number | null {
  if (hasPlayEvent) return null;
  const early = cuts.filter((c) => c.t > 0.5 && c.t <= maxPrefixSeconds && c.hist >= minHist);
  if (!early.length) return null;
  return Math.max(...early.map((c) => c.t));
}
