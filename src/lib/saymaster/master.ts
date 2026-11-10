/**
 * SayMaster mastering chain:
 *   cleanup -> adaptive tonal balance vs the genre curve -> 3-band Linkwitz-Riley multiband compression ->
 *   air exciter (rebuilds 10-17 kHz) -> mono lows / wide highs -> parallel saturation -> glue ->
 *   loudness to target with a look-ahead true-peak limiter.
 * `replay` re-applies a previous master's tonal moves and gain so alternate versions match it.
 */
import {
  band,
  butter,
  compress,
  dbToGain,
  design,
  filter,
  filtfilt,
  filtfiltS,
  filterS,
  fromMS,
  gainToDb,
  len,
  limit,
  lufs,
  mono,
  peak,
  rms,
  scale,
  stereo,
  toMS,
  truePeakDb,
  welch,
  type Biquad,
  type Stereo,
} from "./dsp";
import { BAND_EDGES, PRESETS, type Preset, type PresetName } from "./presets";

export type MasterSettings = { norm: number; eq: number[]; gain: number };
export type MasterReport = {
  preset: PresetName;
  target: { lufs: number; truePeak: number };
  eqMovesDb: Record<string, number>;
  appliedGainDb: number;
  notes: string[];
  settings: MasterSettings;
};

export type Analysis = {
  lufs: number;
  truePeakDb: number;
  samplePeakDb: number;
  crestDb: number;
  correlation: number;
  clippedSamples: number;
  bandLevelsDb: number[];
};

const centres = () => BAND_EDGES.slice(0, -1).map((lo, i) => Math.sqrt(lo * BAND_EDGES[i + 1]!));

export function bandLevels(x: Stereo, sr: number): number[] {
  const { f, p } = welch(mono(x), sr);
  return BAND_EDGES.slice(0, -1).map((lo, i) => {
    const hi = BAND_EDGES[i + 1]!;
    let s = 0,
      c = 0;
    for (let k = 0; k < f.length; k++)
      if (f[k]! >= lo && f[k]! < hi) {
        s += p[k]!;
        c++;
      }
    return 10 * Math.log10(s / Math.max(c, 1) + 1e-20);
  });
}

export function analyse(x: Stereo, sr: number): Analysis {
  const pk = peak(x);
  let lr = 0,
    ll = 0,
    rr = 0,
    clipped = 0;
  for (let i = 0; i < len(x); i++) {
    const l = x[0][i]!,
      r = x[1][i]!;
    lr += l * r;
    ll += l * l;
    rr += r * r;
    if (Math.abs(l) >= 0.999) clipped++;
    if (Math.abs(r) >= 0.999) clipped++;
  }
  const r1 = (v: number) => Math.round(v * 100) / 100;
  return {
    lufs: r1(lufs(x, sr)),
    truePeakDb: r1(truePeakDb(x)),
    samplePeakDb: r1(gainToDb(pk)),
    crestDb: r1(gainToDb(pk) - gainToDb(rms(x))),
    correlation: r1(ll && rr ? lr / Math.sqrt(ll * rr) : 1),
    clippedSamples: clipped,
    bandLevelsDb: bandLevels(x, sr).map((v) => Math.round(v * 10) / 10),
  };
}

/* ------------------------------------------------------------------ stages */

function cleanup(
  x: Stereo,
  sr: number,
  notes: string[],
  norm?: number,
): { y: Stereo; norm: number } {
  const hp = butter("highpass", 25, sr, 2);
  const y: Stereo = [new Float32Array(0), new Float32Array(0)];
  let repaired = 0;
  for (let c = 0; c < 2; c++) {
    const ch = x[c]!;
    let mean = 0;
    for (let i = 0; i < ch.length; i++) mean += ch[i]!;
    mean /= Math.max(1, ch.length);
    const d = ch.map((v) => v - mean);
    // true clipping only: flat runs at full scale, repaired by interpolating across them
    for (let i = 1; i < d.length; i++) {
      if (Math.abs(d[i]!) < 0.995 || Math.abs(d[i]! - d[i - 1]!) > 1e-6) continue;
      let j = i;
      while (j < d.length && Math.abs(d[j]!) >= 0.995) j++;
      const a = d[i - 2] ?? d[i - 1]!;
      const b = d[j] ?? a;
      for (let k = i - 1; k < j; k++) d[k] = a + ((b - a) * (k - i + 2)) / (j - i + 2);
      repaired += j - i + 1;
      i = j;
    }
    y[c] = filtfilt(d, hp);
  }
  if (repaired > 50) notes.push(`Repaired ${repaired} clipped samples.`);
  if (norm === undefined) {
    const pk = peak(y);
    norm = pk > 0 ? dbToGain(-6) / pk : 1;
  }
  return { y: scale(y, norm), norm };
}

function tonalBalance(
  x: Stereo,
  sr: number,
  p: Preset,
  fixed?: number[],
): { y: Stereo; eq: number[] } {
  const c = centres();
  let diff: number[];
  if (fixed) diff = fixed;
  else {
    const meas = bandLevels(x, sr);
    const target = c.map(
      (fc, i) => p.tilt * Math.log2(fc / 1000) + ((p.bias as Record<number, number>)[i] ?? 0),
    );
    const w = [0.5, 1, 1, 1, 1, 1, 0.8, 0.4];
    const top = (sr / 2) * 0.9;
    // bands above what the file can hold (low sample rates) carry no weight
    const wt = w.map((v, i) => (c[i]! < top ? v : 0));
    const offset =
      meas.reduce((s, m, i) => s + wt[i]! * (m - target[i]!), 0) / wt.reduce((a, b) => a + b, 0);
    diff = meas.map((m, i) =>
      wt[i]! ? Math.max(-3.5, Math.min(3.5, (target[i]! + offset - m) * 0.65)) : 0,
    );
  }
  const fx: Biquad[] = [];
  diff.forEach((g, i) => {
    if (Math.abs(g) < 0.3) return;
    if (i === 0) fx.push(design("lowshelf", 70, sr, 0.7, g));
    else if (i === diff.length - 1) fx.push(design("highshelf", 11000, sr, 0.7, g));
    else fx.push(design("peak", c[i]!, sr, 0.9, g));
  });
  return { y: fx.length ? filterS(x, fx) : x, eq: diff };
}

const lr4 = (kind: "lowpass" | "highpass", f: number, sr: number) => [
  ...butter(kind, f, sr, 2),
  ...butter(kind, f, sr, 2),
];

/** Linkwitz-Riley 4th-order 3-way split that sums back flat in magnitude. */
export function split3(x: Stereo, sr: number, f1 = 150, f2 = 5000): [Stereo, Stereo, Stereo] {
  let low = filterS(x, lr4("lowpass", f1, sr));
  const rest = filterS(x, lr4("highpass", f1, sr));
  const mid = filterS(rest, lr4("lowpass", f2, sr));
  const high = filterS(rest, lr4("highpass", f2, sr));
  const a = filterS(low, lr4("lowpass", f2, sr));
  const b = filterS(low, lr4("highpass", f2, sr));
  low = [a[0].map((v, i) => v + b[0][i]!), a[1].map((v, i) => v + b[1][i]!)]; // phase-align with the upper split
  return [low, mid, high];
}

/** Regenerates upper harmonics from 3-8 kHz and blends them in at 10-17.5 kHz. */
export function airExciter(high: Stereo, sr: number, amount: number): Stereo {
  if (amount <= 0 || sr < 32000) return high;
  const src = filterS(high, band(3000, 8000, sr, 2));
  const pk = Math.max(peak(src), 1e-12);
  const sat: Stereo = [
    src[0].map((v) => Math.tanh((v / pk) * 2) + 0.6 * (v / pk) * Math.abs(v / pk)),
    src[1].map((v) => Math.tanh((v / pk) * 2) + 0.6 * (v / pk) * Math.abs(v / pk)),
  ];
  const gen = filtfiltS(sat, band(10000, Math.min(17500, sr * 0.45), sr, 4));
  const g = (rms(high) / Math.max(rms(gen), 1e-12)) * amount;
  return [high[0].map((v, i) => v + g * gen[0][i]!), high[1].map((v, i) => v + g * gen[1][i]!)];
}

function stereoStage(low: Stereo, mid: Stereo, high: Stereo, sr: number, p: Preset): Stereo {
  const [lm, ls] = toMS(low);
  const lowOut = fromMS(lm, filter(ls, butter("highpass", p.monoBelow, sr, 2)));
  const [hm, hs] = toMS(high);
  const highOut = fromMS(
    hm,
    hs.map((v) => v * p.width),
  );
  const n = len(mid);
  const out = stereo(n);
  for (let c = 0; c < 2; c++)
    for (let i = 0; i < n; i++) out[c]![i] = lowOut[c]![i]! + mid[c]![i]! + highOut[c]![i]!;
  return out;
}

function saturate(x: Stereo, drive: number): Stereo {
  if (drive <= 0) return x;
  const k = 1 + drive * 4;
  const tk = Math.tanh(k);
  const wet: Stereo = [
    x[0].map((v) => Math.tanh(v * k) / tk),
    x[1].map((v) => Math.tanh(v * k) / tk),
  ];
  const g = rms(x) / Math.max(rms(wet), 1e-12);
  return [
    x[0].map((v, i) => (1 - drive) * v + drive * g * wet[0][i]!),
    x[1].map((v, i) => (1 - drive) * v + drive * g * wet[1][i]!),
  ];
}

function loudnessAndLimit(
  x: Stereo,
  sr: number,
  target: number,
  ceiling: number,
  notes: string[],
  fixedGain?: number,
): { y: Stereo; gain: number } {
  // inaudible 19.5 kHz low-pass: removes near-Nyquist energy that causes inter-sample overs
  if (sr >= 44100) x = filtfiltS(x, butter("lowpass", 19500, sr, 6));
  let gain = fixedGain ?? target - lufs(x, sr);
  let y = x;
  for (let pass = 0; pass < (fixedGain === undefined ? 4 : 1); pass++) {
    y = limit(scale(x, dbToGain(gain)), sr, ceiling - 0.1);
    const tp = truePeakDb(y);
    if (tp > ceiling) y = scale(y, dbToGain(ceiling - tp - 0.02));
    if (fixedGain !== undefined) break;
    const err = target - lufs(y, sr);
    if (Math.abs(err) < 0.2) break;
    gain += err;
  }
  if (fixedGain === undefined && lufs(y, sr) < target - 1) {
    notes.push("Kept the dynamics instead of pushing to the loudness target.");
  }
  return { y, gain };
}

export type MasterOptions = { lufs?: number; ceiling?: number; replay?: MasterSettings };

export function master(
  x: Stereo,
  sr: number,
  preset: PresetName,
  o: MasterOptions = {},
): { y: Stereo; report: MasterReport } {
  const p = PRESETS[preset];
  const target = o.lufs ?? p.lufs;
  const ceiling = o.ceiling ?? p.ceiling;
  const notes: string[] = [];
  const clean = cleanup(x, sr, notes, o.replay?.norm);
  const tb = tonalBalance(clean.y, sr, p, o.replay?.eq);
  const [low, mid, high] = split3(tb.y, sr);
  const lowC = compress(low, sr, p.mb.low);
  const midC = compress(mid, sr, p.mb.mid);
  const highC = airExciter(compress(high, sr, p.mb.high), sr, p.air);
  let y = stereoStage(lowC, midC, highC, sr, p);
  y = saturate(y, p.drive);
  y = compress(y, sr, { threshold: -16, ratio: 1.5, attack: 30, release: 200 });
  const ld = loudnessAndLimit(y, sr, target, ceiling, notes, o.replay?.gain);
  const c = centres();
  return {
    y: ld.y,
    report: {
      preset,
      target: { lufs: target, truePeak: ceiling },
      eqMovesDb: Object.fromEntries(
        tb.eq
          .map((g, i) => [`${Math.round(c[i]!)} Hz`, Math.round(g * 100) / 100])
          .filter(([, g]) => Math.abs(g as number) >= 0.3),
      ),
      appliedGainDb: Math.round(ld.gain * 100) / 100,
      notes,
      settings: { norm: clean.norm, eq: tb.eq, gain: ld.gain },
    },
  };
}
