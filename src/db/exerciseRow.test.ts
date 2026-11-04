import { describe, expect, it } from 'vitest';
import { processCapture } from '../pipeline';
import { loadReel } from '../pipeline/__fixtures__/load';
import { exerciseFromProcessed } from './exerciseRow';

describe('exerciseFromProcessed', () => {
  const seg = processCapture({ frames: loadReel('reel3_burpee_mp33') })[0];
  it('keeps the fitted floor even when the caller passes its own scene (Review does)', () => {
    const row = exerciseFromProcessed(seg, { name: 'x', scene: { cropRect: { x: 0.1, y: 0.1, width: 0.8, height: 0.8 }, cameraStatic: true } });
    expect(row.scene?.floor).toBeDefined();
    expect(row.scene?.floor?.a).toBeCloseTo(seg.floor.a, 6);
    expect(row.scene?.floor?.b).toBeCloseTo(seg.floor.b, 6);
    expect(row.scene?.cropRect?.width).toBeCloseTo(0.8);
    expect(row.scene?.cameraStatic).toBe(true);
  });
  it('stores a 15 fps figure with its loop', () => {
    const row = exerciseFromProcessed(seg, { name: 'x' });
    expect(row.figureFps).toBeCloseTo(15, 0);
    expect(row.figure && row.figure.length).toBeGreaterThan(100);
  });
});
