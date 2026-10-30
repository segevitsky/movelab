/** One-Euro filter (Casiez et al.): smooth when slow, responsive when fast. Pure. */
export type OneEuroOptions = { minCutoff?: number; beta?: number; dCutoff?: number };

function alpha(cutoff: number, dt: number) {
  const tau = 1 / (2 * Math.PI * cutoff);
  return 1 / (1 + tau / dt);
}

export function oneEuro(series: number[], fps: number, opts: OneEuroOptions = {}): number[] {
  const minCutoff = opts.minCutoff ?? 1.0;
  const beta = opts.beta ?? 0.02;
  const dCutoff = opts.dCutoff ?? 1.0;
  const dt = 1 / fps;
  const out = new Array<number>(series.length);
  let xPrev: number | null = null;
  let dxPrev = 0;
  for (let i = 0; i < series.length; i++) {
    const x = series[i];
    if (Number.isNaN(x)) { out[i] = xPrev ?? NaN; continue; }
    if (xPrev === null) { xPrev = x; out[i] = x; continue; }
    const dx = (x - xPrev) / dt;
    const aD = alpha(dCutoff, dt);
    const dxHat = aD * dx + (1 - aD) * dxPrev;
    const cutoff = minCutoff + beta * Math.abs(dxHat);
    const a = alpha(cutoff, dt);
    const xHat: number = a * x + (1 - a) * (xPrev as number);
    out[i] = xHat;
    xPrev = xHat;
    dxPrev = dxHat;
  }
  return out;
}
