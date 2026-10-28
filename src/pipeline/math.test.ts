import { describe, expect, it } from 'vitest';
import { interp, medfilt, percentile, savgol, unwrap } from './math';
import { loadMathExpected } from './__fixtures__/load';

const E = loadMathExpected();
const close = (a: number[], b: number[], tol = 1e-9) => a.forEach((v, i) => expect(Math.abs(v - b[i])).toBeLessThan(tol));

describe('numpy/scipy equivalents', () => {
  it('savgol_filter(…, 11, 3, mode=interp)', () => close(savgol(E.x, 11, 3), E.savgol_11_3_interp, 1e-8));
  it('savgol_filter(…, 7, 2, mode=interp)', () => close(savgol(E.x, 7, 2), E.savgol_7_2_interp, 1e-8));
  it('medfilt zero-pads the edges', () => {
    close(medfilt(E.x, 7), E.medfilt_7);
    close(medfilt(E.x2, 3), E.medfilt_3_short);
  });
  it('percentile uses linear interpolation', () => {
    const [p5, p95, p50] = E.percentile_5_95_50;
    expect(percentile(E.x, 5)).toBeCloseTo(p5, 10);
    expect(percentile(E.x, 95)).toBeCloseTo(p95, 10);
    expect(percentile(E.x, 50)).toBeCloseTo(p50, 10);
  });
  it('interp clamps outside the range', () => close(interp(E.interp.x, E.interp.xp, E.interp.fp), E.interp.y));
  it('unwrap', () => close(unwrap(E.unwrap.a), E.unwrap.y));
});
