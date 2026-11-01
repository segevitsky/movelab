import { describe, expect, it } from 'vitest';
import { processCapture } from '../pipeline';
import { loadReel } from '../pipeline/__fixtures__/load';
import { clipFromProcessed } from '../figure/fromPipeline';
import { encodeClip, decodeClip, downsampleClip } from '../figure/codec';
import { alikePairs, fingerprint, similarity, type Fingerprint } from './fingerprint';

/** The lab reels as stored clips (15 fps, through the codec — exactly what the library holds). */
function labClips() {
  const out: { name: string; fp: Fingerprint | null }[] = [];
  const reels: [Parameters<typeof loadReel>[0], string[]][] = [
    ['reel1_mobility_mp33', ['standing flow', 'seated flow', 'lunge flow']],
    ['reel2_staff_mp33', ['staff flow']],
    ['reel3_burpee_mp33', ['burpee lunge']],
  ];
  for (const [file, names] of reels) {
    processCapture({ frames: loadReel(file) }).forEach((seg, i) => {
      const clip = decodeClip(encodeClip(downsampleClip(clipFromProcessed(seg), 15)));
      out.push({ name: names[Math.min(i, names.length - 1)] + (i >= names.length ? ` ${i}` : ''), fp: fingerprint(clip) });
    });
  }
  return out;
}

describe('motion fingerprint', () => {
  const clips = labClips();

  it('fingerprints every lab segment, normalised to 0..1', () => {
    expect(clips.length).toBeGreaterThanOrEqual(3);
    for (const c of clips) {
      expect(c.fp, c.name).not.toBeNull();
      const fp = c.fp!;
      expect(fp.orientation[0] + fp.orientation[1] + fp.orientation[2]).toBeCloseTo(1, 5);
      expect(fp.energy.arms + fp.energy.legs + fp.energy.torso).toBeCloseTo(1, 5);
      for (const v of [fp.hipHeight, fp.speed, fp.seconds, fp.contacts.hands, fp.contacts.feet]) { expect(v).toBeGreaterThanOrEqual(0); expect(v).toBeLessThanOrEqual(1); }
    }
  });

  it('similarity is 1 with itself, symmetric, within 0..1', () => {
    for (const a of clips) for (const b of clips) {
      const s = similarity(a.fp!, b.fp!);
      expect(s).toBeGreaterThanOrEqual(0);
      expect(s).toBeLessThanOrEqual(1);
      expect(s).toBeCloseTo(similarity(b.fp!, a.fp!), 10);
      if (a === b) expect(s).toBeCloseTo(1, 10);
    }
  });

  it('a mirrored clip is as alike as the original', () => {
    const seg = processCapture({ frames: loadReel('reel3_burpee_mp33') })[0];
    const clip = clipFromProcessed(seg);
    const mirrored = { ...clip, xy: clip.xy.map((f) => f.map(([x, y]) => [-x, y] as [number, number])) };
    expect(similarity(fingerprint(clip)!, fingerprint(mirrored)!)).toBeGreaterThan(0.97);
  });

  it('ranks the lab pairs sensibly (floor work is not alike standing work)', () => {
    const by = Object.fromEntries(clips.map((c) => [c.name, c.fp!]));
    const s = (a: string, b: string) => similarity(by[a], by[b]);
    const table = clips.map((a) => clips.map((b) => s(a.name, b.name).toFixed(2)).join('  '));
    console.log(['pairs:', ...clips.map((c, i) => `${c.name.padEnd(14)} ${table[i]}`)].join('\n'));
    // seated flow happens on the floor; standing flow and the staff flow are upright
    expect(s('seated flow', 'standing flow')).toBeLessThan(s('standing flow', 'staff flow'));
    // the burpee (hands on the floor + jumps) is not the staff flow
    expect(s('burpee lunge', 'staff flow')).toBeLessThan(0.8);
    const pairs = alikePairs(clips.map((c) => ({ item: c.name, fp: c.fp })), 0);
    expect(pairs.length).toBe((clips.length * (clips.length - 1)) / 2);
    expect(pairs[0].score).toBeGreaterThanOrEqual(pairs[pairs.length - 1].score);
  });
});
