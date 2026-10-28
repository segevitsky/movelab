/** Small numeric helpers that mirror the numpy/scipy calls used by the Python prototype. */

export const isNum = (v: number) => !Number.isNaN(v);

export function hypot2(a: readonly number[], b: readonly number[]) {
  const dx = a[0] - b[0];
  const dy = a[1] - b[1];
  return Math.sqrt(dx * dx + dy * dy);
}

/** numpy.percentile with the default linear interpolation; ignores NaN. */
export function percentile(values: ArrayLike<number>, q: number): number {
  const a: number[] = [];
  for (let i = 0; i < values.length; i++) if (isNum(values[i])) a.push(values[i]);
  if (a.length === 0) return NaN;
  a.sort((x, y) => x - y);
  const idx = ((a.length - 1) * q) / 100;
  const lo = Math.floor(idx);
  const hi = Math.min(a.length - 1, lo + 1);
  const f = idx - lo;
  return a[lo] * (1 - f) + a[hi] * f;
}

export const median = (values: ArrayLike<number>) => percentile(values, 50);

export function mean(values: ArrayLike<number>): number {
  let s = 0;
  let n = 0;
  for (let i = 0; i < values.length; i++) if (isNum(values[i])) { s += values[i]; n++; }
  return n ? s / n : NaN;
}

/** numpy.interp: linear interpolation, clamped to the end values outside [xp[0], xp[-1]]. xp strictly increasing. */
export function interp(x: ArrayLike<number>, xp: ArrayLike<number>, fp: ArrayLike<number>): number[] {
  const n = xp.length;
  const out = new Array<number>(x.length);
  let j = 0;
  for (let i = 0; i < x.length; i++) {
    const xi = x[i];
    if (xi <= xp[0]) { out[i] = fp[0]; continue; }
    if (xi >= xp[n - 1]) { out[i] = fp[n - 1]; continue; }
    while (j < n - 2 && xp[j + 1] < xi) j++;
    while (j > 0 && xp[j] > xi) j--;
    const x0 = xp[j], x1 = xp[j + 1];
    const f = x1 === x0 ? 0 : (xi - x0) / (x1 - x0);
    out[i] = fp[j] * (1 - f) + fp[j + 1] * f;
  }
  return out;
}

/** Fill NaN gaps by linear interpolation over the index (numpy.interp over the valid indices). All-NaN → zeros. */
export function fillGaps(v: number[]): number[] {
  const idx: number[] = [];
  const val: number[] = [];
  for (let i = 0; i < v.length; i++) if (isNum(v[i])) { idx.push(i); val.push(v[i]); }
  if (idx.length === 0) return new Array(v.length).fill(0);
  const x = new Array<number>(v.length);
  for (let i = 0; i < v.length; i++) x[i] = i;
  return interp(x, idx, val);
}

/** scipy.signal.medfilt for 1-D input: odd kernel, zero padding at both ends. */
export function medfilt(v: ArrayLike<number>, k: number): number[] {
  const n = v.length;
  const h = (k - 1) / 2;
  const out = new Array<number>(n);
  const win = new Array<number>(k);
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < k; j++) {
      const p = i - h + j;
      win[j] = p < 0 || p >= n ? 0 : v[p];
    }
    const s = win.slice().sort((a, b) => a - b);
    out[i] = s[h];
  }
  return out;
}

/** Solve the normal equations (A^T A) c = A^T y for a polynomial fit of degree `deg` at sample positions xs. */
function polyfit(xs: number[], ys: number[], deg: number): number[] {
  const m = deg + 1;
  const ata: number[][] = Array.from({ length: m }, () => new Array(m).fill(0));
  const aty: number[] = new Array(m).fill(0);
  for (let i = 0; i < xs.length; i++) {
    const pw: number[] = new Array(m);
    pw[0] = 1;
    for (let k = 1; k < m; k++) pw[k] = pw[k - 1] * xs[i];
    for (let r = 0; r < m; r++) {
      aty[r] += pw[r] * ys[i];
      for (let c = 0; c < m; c++) ata[r][c] += pw[r] * pw[c];
    }
  }
  return solve(ata, aty);
}

/** Gaussian elimination with partial pivoting (tiny systems only). */
function solve(A: number[][], b: number[]): number[] {
  const n = b.length;
  const M = A.map((row, i) => [...row, b[i]]);
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    [M[c], M[p]] = [M[p], M[c]];
    const d = M[c][c] || 1e-300;
    for (let r = 0; r < n; r++) {
      if (r === c) continue;
      const f = M[r][c] / d;
      if (f === 0) continue;
      for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k];
    }
  }
  return M.map((row, i) => row[n] / (row[i] || 1e-300));
}

const sgCache = new Map<string, number[]>();

/** Savitzky–Golay smoothing coefficients (deriv 0) for an odd window and polynomial order. */
export function savgolCoeffs(window: number, order: number): number[] {
  const key = `${window}:${order}`;
  const hit = sgCache.get(key);
  if (hit) return hit;
  const h = (window - 1) / 2;
  const m = order + 1;
  // coefficients = first row of pinv(A), A[i][k] = (i-h)^k  → solve (A^T A) c_k = e_0 per column
  const ata: number[][] = Array.from({ length: m }, () => new Array(m).fill(0));
  for (let i = -h; i <= h; i++) {
    const pw: number[] = new Array(m);
    pw[0] = 1;
    for (let k = 1; k < m; k++) pw[k] = pw[k - 1] * i;
    for (let r = 0; r < m; r++) for (let c = 0; c < m; c++) ata[r][c] += pw[r] * pw[c];
  }
  const e0 = new Array(m).fill(0);
  e0[0] = 1;
  const w = solve(ata, e0); // weights of the monomials for the value at x=0
  const coeffs = new Array<number>(window);
  for (let i = -h; i <= h; i++) {
    let s = 0;
    let p = 1;
    for (let k = 0; k < m; k++) { s += w[k] * p; p *= i; }
    coeffs[i + h] = s;
  }
  sgCache.set(key, coeffs);
  return coeffs;
}

/**
 * scipy.signal.savgol_filter(x, window, order, mode='interp'):
 * convolution in the interior; the first/last half-window values come from a least-squares polynomial
 * fitted to the first/last `window` samples.
 */
export function savgol(x: ArrayLike<number>, window: number, order: number): number[] {
  const n = x.length;
  if (window > n) throw new Error(`savgol: window ${window} > length ${n}`);
  const h = (window - 1) / 2;
  const c = savgolCoeffs(window, order);
  const out = new Array<number>(n);
  for (let i = h; i < n - h; i++) {
    let s = 0;
    for (let j = 0; j < window; j++) s += c[j] * x[i - h + j];
    out[i] = s;
  }
  const xs = Array.from({ length: window }, (_, i) => i);
  const fitEval = (ys: number[], at: number) => {
    const p = polyfit(xs, ys, order);
    let s = 0;
    let pw = 1;
    for (let k = 0; k < p.length; k++) { s += p[k] * pw; pw *= at; }
    return s;
  };
  const head = Array.from({ length: window }, (_, i) => x[i]);
  for (let i = 0; i < h; i++) out[i] = fitEval(head, i);
  const tail = Array.from({ length: window }, (_, i) => x[n - window + i]);
  for (let i = n - h; i < n; i++) out[i] = fitEval(tail, i - (n - window));
  return out;
}

/** numpy.unwrap for radians (period 2π, discont π). */
export function unwrap(a: ArrayLike<number>): number[] {
  const out = new Array<number>(a.length);
  if (a.length === 0) return out;
  out[0] = a[0];
  let offset = 0;
  for (let i = 1; i < a.length; i++) {
    let d = a[i] - a[i - 1];
    if (d > Math.PI) offset -= 2 * Math.PI;
    else if (d < -Math.PI) offset += 2 * Math.PI;
    out[i] = a[i] + offset;
    void d;
  }
  return out;
}

/** Moving average with edge padding (np.convolve of np.pad(mode='edge'), 'valid'). */
export function movingAverageEdge(s: ArrayLike<number>, k: number): number[] {
  const n = s.length;
  const out = new Array<number>(n);
  const w = 2 * k + 1;
  for (let i = 0; i < n; i++) {
    let acc = 0;
    for (let j = -k; j <= k; j++) {
      const p = Math.min(n - 1, Math.max(0, i + j));
      acc += s[p];
    }
    out[i] = acc / w;
  }
  return out;
}

export const deg = (r: number) => (r * 180) / Math.PI;
export const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
