import { describe, expect, it } from 'vitest';
import { depthOrder } from './depth';
import { flipsPerSecond } from './eval/metrics';
import { framesBetween, loadExpected, loadReel } from './__fixtures__/load';

describe('depth order from world z', () => {
  it('≤ 1 flip/s on every fixture segment and follows the raw sign where it is stable', () => {
    for (const name of ['reel1_mobility_mp33', 'reel2_staff_mp33', 'reel3_burpee_mp33'] as const) {
      const e = loadExpected(name);
      for (const s of e.segments) {
        const fr = framesBetween(loadReel(name), s.a, s.b);
        const w = fr.map((f) => f.w);
        const d = depthOrder(w);
        expect(flipsPerSecond(d.legsRightNear, e.fps) + flipsPerSecond(d.armsRightNear, e.fps)).toBeLessThanOrEqual(1);
        // agreement with the raw sign on frames where raw |Δz| is large (> 5 cm)
        let agree = 0, n = 0;
        w.forEach((ww, i) => { if (!ww) return; const dz = ww[25][2] - ww[26][2]; if (Math.abs(dz) > 0.05) { n++; if ((dz > 0) === d.legsRightNear[i]) agree++; } });
        if (n > 20) expect(agree / n).toBeGreaterThan(0.85);
      }
    }
  });
  it('hysteresis suppresses a 3-frame blip but follows a sustained switch', () => {
    const mk = (dz: number) => { const a = Array.from({ length: 33 }, () => [0, 0, 0] as [number, number, number]); a[25] = [0, 0, dz]; return a; };
    const w = [...Array(20).fill(0.2), ...Array(3).fill(-0.2), ...Array(20).fill(0.2), ...Array(20).fill(-0.2)].map(mk);
    const d = depthOrder(w);
    expect(d.legsRightNear.slice(0, 43).every(Boolean)).toBe(true);
    expect(d.legsRightNear.slice(50).every((v) => !v)).toBe(true);
  });
});
