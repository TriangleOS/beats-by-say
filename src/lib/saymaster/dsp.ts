/**
 * SayMaster DSP primitives. Pure TypeScript on Float32Arrays so the same code runs in a Web Worker,
 * on the main thread and in tests. Stereo audio is a pair of equal-length channels.
 */

export type Stereo = [Float32Array, Float32Array];

export const dbToGain = (db: number) => Math.pow(10, db / 20);
export const gainToDb = (g: number) => 20 * Math.log10(Math.max(g, 1e-12));

export function stereo(n: number): Stereo {
  return [new Float32Array(n), new Float32Array(n)];
}
export function clone(x: Stereo): Stereo {
  return [x[0].slice(), x[1].slice()];
}
export function scale(x: Stereo, g: number): Stereo {
  return [x[0].map((v) => v * g), x[1].map((v) => v * g)];
}
export function len(x: Stereo) {
  return x[0].length;
}
export function fit(x: Stereo, n: number): Stereo {
  if (x[0].length === n) return x;
  const out = stereo(n);
  const m = Math.min(n, x[0].length);
  out[0].set(x[0].subarray(0, m));
  out[1].set(x[1].subarray(0, m));
  return out;
}
/** Sums tracks of possibly different lengths. */
export function sum(...tracks: (Stereo | null | undefined)[]): Stereo {
  const live = tracks.filter((t): t is Stereo => !!t);
  const n = Math.max(0, ...live.map(len));
  const out = stereo(n);
  for (const t of live) {
    for (let c = 0; c < 2; c++) {
      const o = out[c]!;
      const s = t[c]!;
      for (let i = 0; i < s.length; i++) o[i]! += s[i]!;
    }
  }
  return out;
}
export function peak(x: Stereo) {
  let p = 0;
  for (const ch of x) for (let i = 0; i < ch.length; i++) p = Math.max(p, Math.abs(ch[i]!));
  return p;
}
export function rms(x: Stereo) {
  let s = 0;
  for (const ch of x) for (let i = 0; i < ch.length; i++) s += ch[i]! * ch[i]!;
  return Math.sqrt(s / Math.max(1, x[0].length * 2));
}
export function toMS(x: Stereo): [Float32Array, Float32Array] {
  const n = len(x);
  const m = new Float32Array(n);
  const s = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    m[i] = (x[0][i]! + x[1][i]!) / 2;
    s[i] = (x[0][i]! - x[1][i]!) / 2;
  }
  return [m, s];
}
export function fromMS(m: Float32Array, s: Float32Array): Stereo {
  const n = m.length;
  const out = stereo(n);
  for (let i = 0; i < n; i++) {
    out[0][i] = m[i]! + s[i]!;
    out[1][i] = m[i]! - s[i]!;
  }
  return out;
}
export function mono(x: Stereo): Float32Array {
  return toMS(x)[0];
}

/* ------------------------------------------------------------------ filters */

export type Biquad = { b0: number; b1: number; b2: number; a1: number; a2: number };
export type FilterKind =
  "lowpass" | "highpass" | "peak" | "lowshelf" | "highshelf" | "lowpass1" | "highpass1";

/** RBJ cookbook biquads; lowpass1/highpass1 are first-order (6 dB/oct) filters. */
export function design(
  kind: FilterKind,
  f: number,
  sr: number,
  q = Math.SQRT1_2,
  gainDb = 0,
): Biquad {
  const w0 = (2 * Math.PI * Math.min(f, sr * 0.49)) / sr;
  if (kind === "lowpass1" || kind === "highpass1") {
    const k = Math.tan(w0 / 2);
    const a1 = (k - 1) / (k + 1);
    return kind === "lowpass1"
      ? { b0: k / (k + 1), b1: k / (k + 1), b2: 0, a1, a2: 0 }
      : { b0: 1 / (k + 1), b1: -1 / (k + 1), b2: 0, a1, a2: 0 };
  }
  const cos = Math.cos(w0);
  const alpha = Math.sin(w0) / (2 * q);
  const A = Math.pow(10, gainDb / 40);
  let b0: number, b1: number, b2: number, a0: number, a1: number, a2: number;
  switch (kind) {
    case "lowpass":
      b0 = (1 - cos) / 2;
      b1 = 1 - cos;
      b2 = b0;
      a0 = 1 + alpha;
      a1 = -2 * cos;
      a2 = 1 - alpha;
      break;
    case "highpass":
      b0 = (1 + cos) / 2;
      b1 = -(1 + cos);
      b2 = b0;
      a0 = 1 + alpha;
      a1 = -2 * cos;
      a2 = 1 - alpha;
      break;
    case "peak":
      b0 = 1 + alpha * A;
      b1 = -2 * cos;
      b2 = 1 - alpha * A;
      a0 = 1 + alpha / A;
      a1 = -2 * cos;
      a2 = 1 - alpha / A;
      break;
    case "lowshelf": {
      const s = 2 * Math.sqrt(A) * alpha;
      b0 = A * (A + 1 - (A - 1) * cos + s);
      b1 = 2 * A * (A - 1 - (A + 1) * cos);
      b2 = A * (A + 1 - (A - 1) * cos - s);
      a0 = A + 1 + (A - 1) * cos + s;
      a1 = -2 * (A - 1 + (A + 1) * cos);
      a2 = A + 1 + (A - 1) * cos - s;
      break;
    }
    case "highshelf": {
      const s = 2 * Math.sqrt(A) * alpha;
      b0 = A * (A + 1 + (A - 1) * cos + s);
      b1 = -2 * A * (A - 1 + (A + 1) * cos);
      b2 = A * (A + 1 + (A - 1) * cos - s);
      a0 = A + 1 - (A - 1) * cos + s;
      a1 = 2 * (A - 1 - (A + 1) * cos);
      a2 = A + 1 - (A - 1) * cos - s;
      break;
    }
  }
  return { b0: b0 / a0, b1: b1 / a0, b2: b2 / a0, a1: a1 / a0, a2: a2 / a0 };
}

/** Butterworth sections: order 2, 4 or 6 as cascaded biquads. */
export function butter(
  kind: "lowpass" | "highpass",
  f: number,
  sr: number,
  order: 2 | 4 | 6 = 2,
): Biquad[] {
  const qs =
    order === 2 ? [Math.SQRT1_2] : order === 4 ? [0.5412, 1.3066] : [0.5176, 0.7071, 1.9319];
  return qs.map((q) => design(kind, f, sr, q));
}

export function filter(x: Float32Array, sections: Biquad[]): Float32Array {
  const y = x.slice();
  for (const c of sections) {
    let z1 = 0,
      z2 = 0;
    for (let i = 0; i < y.length; i++) {
      const v = y[i]!;
      const o = c.b0 * v + z1;
      z1 = c.b1 * v - c.a1 * o + z2;
      z2 = c.b2 * v - c.a2 * o;
      y[i] = o;
    }
  }
  return y;
}
/** Zero-phase: forward then backward (squares the magnitude response). */
export function filtfilt(x: Float32Array, sections: Biquad[]): Float32Array {
  const y = filter(x, sections).reverse();
  return filter(y, sections).reverse();
}
export function filterS(x: Stereo, sections: Biquad[]): Stereo {
  return [filter(x[0], sections), filter(x[1], sections)];
}
export function filtfiltS(x: Stereo, sections: Biquad[]): Stereo {
  return [filtfilt(x[0], sections), filtfilt(x[1], sections)];
}
/** Band-pass as a high-pass and low-pass pair. */
export const band = (lo: number, hi: number, sr: number, order: 2 | 4 = 2) => [
  ...butter("highpass", lo, sr, order),
  ...butter("lowpass", hi, sr, order),
];

/* ------------------------------------------------------------------ dynamics */

/** One-pole envelope follower on |x| (JUCE-style ballistics). */
export function envelope(
  x: Float32Array,
  attackMs: number,
  releaseMs: number,
  sr: number,
): Float32Array {
  const at = attackMs <= 0 ? 0 : Math.exp((-2 * Math.PI * 1000) / (attackMs * sr));
  const rt = Math.exp((-2 * Math.PI * 1000) / (releaseMs * sr));
  const e = new Float32Array(x.length);
  let s = 0;
  for (let i = 0; i < x.length; i++) {
    const v = Math.abs(x[i]!);
    const c = v > s ? at : rt;
    s = c * s + (1 - c) * v;
    e[i] = s;
  }
  return e;
}
/** One-pole smoother with a single time constant. */
export function onePole(x: Float32Array, ms: number, sr: number): Float32Array {
  const a = Math.exp(-1 / ((sr * ms) / 1000));
  const y = new Float32Array(x.length);
  let s = 0;
  for (let i = 0; i < x.length; i++) {
    s = a * s + (1 - a) * x[i]!;
    y[i] = s;
  }
  return y;
}

/** Stereo-linked feed-forward compressor. */
export function compress(
  x: Stereo,
  sr: number,
  o: { threshold: number; ratio: number; attack: number; release: number },
): Stereo {
  const n = len(x);
  const det = new Float32Array(n);
  for (let i = 0; i < n; i++) det[i] = Math.max(Math.abs(x[0][i]!), Math.abs(x[1][i]!));
  const env = envelope(det, o.attack, o.release, sr);
  const t = dbToGain(o.threshold);
  const inv = 1 / o.ratio - 1;
  const out = stereo(n);
  for (let i = 0; i < n; i++) {
    const e = env[i]!;
    const g = e > t ? Math.pow(e / t, inv) : 1;
    out[0][i] = x[0][i]! * g;
    out[1][i] = x[1][i]! * g;
  }
  return out;
}

/** Downward expander used as a gentle noise gate. */
export function gate(x: Stereo, sr: number, thresholdDb: number, ratio = 4): Stereo {
  const n = len(x);
  const det = new Float32Array(n);
  for (let i = 0; i < n; i++) det[i] = Math.max(Math.abs(x[0][i]!), Math.abs(x[1][i]!));
  const env = envelope(det, 2, 120, sr);
  const t = dbToGain(thresholdDb);
  const out = stereo(n);
  for (let i = 0; i < n; i++) {
    const e = env[i]!;
    const g = e < t ? Math.pow(Math.max(e, 1e-9) / t, ratio - 1) : 1;
    out[0][i] = x[0][i]! * g;
    out[1][i] = x[1][i]! * g;
  }
  return out;
}

/* ------------------------------------------------------------- true peak */

// 4x oversampling interpolator (ITU-R BS.1770 style, 12 taps per phase, Kaiser-windowed sinc).
const TAPS = 12;
const PHASES = (() => {
  const out: Float64Array[] = [];
  const beta = 6.0;
  const i0 = (v: number) => {
    let s = 1,
      t = 1;
    for (let k = 1; k < 25; k++) {
      t *= (v / (2 * k)) ** 2;
      s += t;
    }
    return s;
  };
  const N = TAPS * 4;
  for (let p = 1; p < 4; p++) {
    const h = new Float64Array(TAPS);
    let norm = 0;
    for (let k = 0; k < TAPS; k++) {
      const n = k * 4 + p; // position on the 4x grid
      const t = (n - N / 2) / 4;
      const sinc = t === 0 ? 1 : Math.sin(Math.PI * t) / (Math.PI * t);
      const r = (2 * n) / N - 1;
      const w = i0(beta * Math.sqrt(Math.max(0, 1 - r * r))) / i0(beta);
      h[k] = sinc * w;
      norm += h[k]!;
    }
    for (let k = 0; k < TAPS; k++) h[k]! /= norm;
    out.push(h);
  }
  return out;
})();

/** Interpolated value at i + 1 - p/4 for phase p, i.e. a point strictly between samples i and i+1. */
function between(ch: Float32Array, i: number, h: Float64Array): number {
  let s = 0;
  const start = i + 1 - TAPS / 2;
  for (let k = 0; k < TAPS; k++) {
    const j = start + k;
    if (j >= 0 && j < ch.length) s += ch[j]! * h[k]!;
  }
  return s;
}

/**
 * True-peak level per sample. Each inter-sample peak between samples i and i+1 is charged to both of
 * them, so a limiter that keeps both samples under the ceiling also keeps the peak between them under it.
 */
export function truePeakTrace(x: Stereo): Float32Array {
  const n = len(x);
  const tp = new Float32Array(n);
  for (const ch of x) {
    for (let i = 0; i < n; i++) {
      const a = Math.abs(ch[i]!);
      if (a > tp[i]!) tp[i] = a;
      if (i + 1 >= n) continue;
      // only worth interpolating where the signal is already loud
      if (Math.max(a, Math.abs(ch[i + 1]!)) < 0.25) continue;
      let m = 0;
      for (const h of PHASES) m = Math.max(m, Math.abs(between(ch, i, h)));
      if (m > tp[i]!) tp[i] = m;
      if (m > tp[i + 1]!) tp[i + 1] = m;
    }
  }
  return tp;
}

export function truePeakDb(x: Stereo): number {
  let p = peak(x);
  if (p <= 0) return -120;
  // Interpolate only around loud samples (within 6 dB of the sample peak).
  const thr = p * 0.5;
  for (const ch of x) {
    for (let i = 0; i + 1 < ch.length; i++) {
      if (Math.abs(ch[i]!) < thr && Math.abs(ch[i + 1]!) < thr) continue;
      for (const h of PHASES) p = Math.max(p, Math.abs(between(ch, i, h)));
    }
  }
  return gainToDb(p);
}

/**
 * Look-ahead true-peak limiter. Gain never exceeds what the next `lookMs` of (oversampled) peaks allow,
 * attacks with a linear ramp across the look-ahead and releases smoothly.
 */
export function limit(
  x: Stereo,
  sr: number,
  ceilingDb: number,
  lookMs = 1.5,
  releaseMs = 60,
): Stereo {
  const n = len(x);
  const ceil = dbToGain(ceilingDb);
  const tp = truePeakTrace(x);
  const L = Math.max(1, Math.round((sr * lookMs) / 1000));
  const req = new Float32Array(n);
  for (let i = 0; i < n; i++) req[i] = tp[i]! > ceil ? ceil / tp[i]! : 1;
  // m[k] = min(req[k-L..k]) via monotonic deque
  const m = new Float32Array(n + L);
  const dq: number[] = [];
  let head = 0;
  for (let k = 0; k < n + L; k++) {
    const v = k < n ? req[k]! : 1;
    while (dq.length > head && (dq[dq.length - 1]! >= n ? 1 : req[dq[dq.length - 1]!]!) >= v)
      dq.pop();
    dq.push(k);
    while (dq[head]! < k - L) head++;
    const j = dq[head]!;
    m[k] = j < n ? req[j]! : 1;
  }
  // box average over L samples: s[k] <= req[k-L] for every k, so out[i] = x[i] * s[i+L] never overshoots
  const s = new Float32Array(n + L);
  let acc = 0;
  for (let k = 0; k < n + L; k++) {
    acc += m[k]!;
    if (k >= L) acc -= m[k - L]!;
    s[k] = acc / Math.min(k + 1, L);
  }
  const rel = Math.exp(-1 / ((sr * releaseMs) / 1000));
  const out = stereo(n);
  let g = 1;
  for (let i = 0; i < n; i++) {
    const target = s[i + L]!;
    g = target < g ? target : rel * g + (1 - rel) * target;
    out[0][i] = x[0][i]! * g;
    out[1][i] = x[1][i]! * g;
  }
  return out;
}

/* ------------------------------------------------------------------ spaces */

const COMB = [1116, 1188, 1277, 1356, 1422, 1491, 1557, 1617];
const ALLPASS = [556, 441, 341, 225];

/** Freeverb (the algorithm behind JUCE's Reverb). Returns the 100 % wet signal. */
export function reverb(
  x: Stereo,
  sr: number,
  o: { room: number; damping: number; width: number; tailS?: number },
): Stereo {
  const scaleT = sr / 44100;
  const n = len(x) + Math.round((o.tailS ?? 0) * sr);
  const feedback = o.room * 0.28 + 0.7;
  const damp = o.damping * 0.4;
  const wet1 = 0.5 * (o.width / 2 + 0.5);
  const wet2 = 0.5 * ((1 - o.width) / 2);
  const outs: Float32Array[] = [];
  for (let c = 0; c < 2; c++) {
    const spread = c === 0 ? 0 : 23;
    const combs = COMB.map((d) => ({
      buf: new Float32Array(Math.round((d + spread) * scaleT)),
      i: 0,
      last: 0,
    }));
    const aps = ALLPASS.map((d) => ({
      buf: new Float32Array(Math.round((d + spread) * scaleT)),
      i: 0,
    }));
    const y = new Float32Array(n);
    for (let k = 0; k < n; k++) {
      const inp = k < len(x) ? (x[0][k]! + x[1][k]!) * 0.015 : 0;
      let acc = 0;
      for (const cb of combs) {
        const out = cb.buf[cb.i]!;
        cb.last = out * (1 - damp) + cb.last * damp;
        cb.buf[cb.i] = inp + cb.last * feedback;
        if (++cb.i >= cb.buf.length) cb.i = 0;
        acc += out;
      }
      for (const ap of aps) {
        const b = ap.buf[ap.i]!;
        ap.buf[ap.i] = acc + b * 0.5;
        if (++ap.i >= ap.buf.length) ap.i = 0;
        acc = b - acc;
      }
      y[k] = acc;
    }
    outs.push(y);
  }
  const out = stereo(n);
  for (let k = 0; k < n; k++) {
    out[0][k] = outs[0]![k]! * wet1 + outs[1]![k]! * wet2;
    out[1][k] = outs[1]![k]! * wet1 + outs[0]![k]! * wet2;
  }
  // normalise level to roughly match JUCE's wet gain
  return scale(out, 3);
}

/** Feedback delay, 100 % wet. */
export function delay(x: Stereo, sr: number, seconds: number, feedback: number, tailS = 0): Stereo {
  const d = Math.max(1, Math.round(seconds * sr));
  const n = len(x) + Math.round(tailS * sr);
  const out = stereo(n);
  for (let c = 0; c < 2; c++) {
    const src = x[c]!;
    const o = out[c]!;
    for (let i = d; i < n; i++)
      o[i] = (i - d < src.length ? src[i - d]! : 0) + feedback * o[i - d]!;
  }
  return out;
}

/* ---------------------------------------------------------------- spectrum */

function fft(re: Float64Array, im: Float64Array) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j]!, re[i]!];
      [im[i], im[j]] = [im[j]!, im[i]!];
    }
  }
  for (let size = 2; size <= n; size <<= 1) {
    const ang = (-2 * Math.PI) / size;
    const wr = Math.cos(ang),
      wi = Math.sin(ang);
    for (let s = 0; s < n; s += size) {
      let cr = 1,
        ci = 0;
      for (let k = 0; k < size / 2; k++) {
        const a = s + k,
          b = a + size / 2;
        const tr = re[b]! * cr - im[b]! * ci;
        const ti = re[b]! * ci + im[b]! * cr;
        re[b] = re[a]! - tr;
        im[b] = im[a]! - ti;
        re[a]! += tr;
        im[a]! += ti;
        const nr = cr * wr - ci * wi;
        ci = cr * wi + ci * wr;
        cr = nr;
      }
    }
  }
}

/** Welch power spectrum of a mono signal (Hann, 50 % overlap, at most `maxSegments` segments). */
export function welch(
  x: Float32Array,
  sr: number,
  nper = 8192,
  maxSegments = 160,
): { f: Float64Array; p: Float64Array } {
  const hop = nper / 2;
  const segs = Math.max(1, Math.floor((x.length - nper) / hop) + 1);
  const stride = Math.max(1, Math.ceil(segs / maxSegments));
  const p = new Float64Array(nper / 2 + 1);
  const win = new Float64Array(nper).map((_, i) => 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / nper));
  let count = 0;
  for (let s = 0; s < segs; s += stride) {
    const re = new Float64Array(nper);
    const im = new Float64Array(nper);
    for (let i = 0; i < nper; i++) re[i] = (x[s * hop + i] ?? 0) * win[i]!;
    fft(re, im);
    for (let k = 0; k <= nper / 2; k++) p[k]! += re[k]! * re[k]! + im[k]! * im[k]!;
    count++;
  }
  // one-sided power spectral density, scaled like scipy.signal.welch(scaling="density")
  const wss = win.reduce((a, v) => a + v * v, 0);
  for (let k = 0; k < p.length; k++)
    p[k] = (p[k]! / count / (sr * wss)) * (k > 0 && k < nper / 2 ? 2 : 1);
  const f = new Float64Array(p.length).map((_, k) => (k * sr) / nper);
  return { f, p };
}

/* ------------------------------------------------------------------ loudness */

/** Integrated loudness, ITU-R BS.1770-4 / EBU R128 (K-weighting, 400 ms blocks, two gates). */
export function lufs(x: Stereo, sr: number): number {
  const k = [design("highshelf", 1500, sr, Math.SQRT1_2, 4), design("highpass", 38, sr, 0.5)];
  const ch = x.map((c) => filter(c, k));
  const block = Math.round(0.4 * sr);
  const step = Math.round(0.1 * sr);
  const n = len(x);
  if (n < block) return -70;
  // prefix sums of squares make every block O(1)
  const pre = ch.map((c) => {
    const s = new Float64Array(n + 1);
    for (let i = 0; i < n; i++) s[i + 1] = s[i]! + c[i]! * c[i]!;
    return s;
  });
  const z: number[] = [];
  for (let s = 0; s + block <= n; s += step) {
    let tot = 0;
    for (const p of pre) tot += (p[s + block]! - p[s]!) / block;
    z.push(tot);
  }
  const L = (v: number) => -0.691 + 10 * Math.log10(Math.max(v, 1e-20));
  const abs = z.filter((v) => L(v) > -70);
  if (!abs.length) return -70;
  const rel = L(abs.reduce((a, b) => a + b, 0) / abs.length) - 10;
  const gated = abs.filter((v) => L(v) > rel);
  return L(gated.reduce((a, b) => a + b, 0) / gated.length);
}

/** Linear-time percentile on a strided sample of the data. */
export function percentile(x: Float32Array, q: number): number {
  const stride = Math.max(1, Math.floor(x.length / 200_000));
  const s: number[] = [];
  for (let i = 0; i < x.length; i += stride) s.push(x[i]!);
  s.sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor((q / 100) * s.length))] ?? 0;
}
