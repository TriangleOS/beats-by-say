/**
 * SayMaster production stages between the stems and the master:
 *   enhance  - per-stem studio processing (drums, bass, music)
 *   mix      - genre balance, bass ducking under the kick, vocal pocket (static for beats, dynamic for songs)
 *   vocals   - the artist's recorded vocals: clean-up, compression, de-essing, presence, reverb and delay
 */
import {
  band,
  butter,
  compress,
  dbToGain,
  delay,
  design,
  envelope,
  filter,
  filterS,
  filtfilt,
  filtfiltS,
  fromMS,
  gate,
  len,
  lufs,
  mono,
  onePole,
  percentile,
  reverb,
  rms,
  scale,
  stereo,
  sum,
  toMS,
  type Stereo,
} from "./dsp";
import { PRESETS, type PresetName } from "./presets";

/** `mix` is an already-mixed beat (an upload): it passes through enhancement and balancing untouched. */
export type Role = "drums" | "bass" | "music" | "mix";
export type RoleStems = Partial<Record<Role, Stereo>>;

/* ----------------------------------------------------------------- enhance */

function monoBelow(x: Stereo, sr: number, hz: number): Stereo {
  const [m, s] = toMS(x);
  return fromMS(m, filtfilt(s, butter("highpass", hz, sr, 2)));
}

/** Lifts attacks where a fast envelope runs ahead of a slow one. */
export function transientShaper(x: Stereo, sr: number, amount = 0.5, maxDb = 4): Stereo {
  const det = new Float32Array(len(x)).map((_, i) =>
    Math.max(Math.abs(x[0][i]!), Math.abs(x[1][i]!)),
  );
  const fast = onePole(det.map(Math.abs), 1, sr);
  const slow = onePole(det.map(Math.abs), 40, sr);
  const g = new Float32Array(det.length);
  let s = 0;
  for (let i = 0; i < g.length; i++) {
    const ratio = Math.min(4, Math.max(1, fast[i]! / (slow[i]! + 1e-9)));
    const db = Math.min(maxDb, 20 * Math.log10(ratio) * amount);
    s = 0.98 * s + 0.02 * db;
    g[i] = dbToGain(s);
  }
  return [x[0].map((v, i) => v * g[i]!), x[1].map((v, i) => v * g[i]!)];
}

function drums(x: Stereo, sr: number, drive: number): Stereo {
  let y = filterS(x, [design("highpass1", 28, sr)]);
  y = transientShaper(y, sr, drive > 0.2 ? 0.6 : 0.45);
  y = compress(y, sr, { threshold: -18, ratio: 2.5, attack: 20, release: 100 });
  y = filterS(y, [design("peak", 350, sr, 1, -1.5), design("highshelf", 9000, sr, 0.7, 1)]);
  return monoBelow(y, sr, 110);
}

function bass(x: Stereo, sr: number): Stereo {
  const m = mono(x);
  const lowBand = filtfilt(m, band(45, 180, sr, 2));
  let pk = 1e-9;
  for (const v of lowBand) pk = Math.max(pk, Math.abs(v));
  const harm = filtfilt(
    lowBand.map((v) => Math.tanh((v * 3) / pk)),
    band(180, 1500, sr, 2),
  );
  const k =
    Math.sqrt(
      lowBand.reduce((a, v) => a + v * v, 0) / (harm.reduce((a, v) => a + v * v, 0) + 1e-20),
    ) * 0.25;
  const out = m.map((v, i) => v + harm[i]! * k); // harmonics so the bass reads on phones and laptops
  let y: Stereo = [out, out.slice()];
  y = filterS(y, [design("highpass1", 28, sr)]);
  y = compress(y, sr, { threshold: -20, ratio: 4, attack: 15, release: 120 });
  return filterS(y, [design("lowpass1", 9000, sr)]);
}

function music(x: Stereo, sr: number, width: number): Stereo {
  let y = filterS(x, [design("highpass1", 70, sr), design("peak", 300, sr, 0.9, -1.5)]);
  y = compress(y, sr, { threshold: -22, ratio: 1.8, attack: 25, release: 180 });
  y = filterS(y, [design("highshelf", 10000, sr, 0.7, 1)]);
  const [m, s] = toMS(y);
  const sHi = filtfilt(s, butter("highpass", 300, sr, 2));
  return fromMS(
    m,
    s.map((v, i) => v + sHi[i]! * (width - 1)),
  );
}

export function enhance(stems: RoleStems, sr: number, preset: PresetName): RoleStems {
  const p = PRESETS[preset];
  const out: RoleStems = {};
  if (stems.drums) out.drums = drums(stems.drums, sr, p.drive);
  if (stems.bass) out.bass = bass(stems.bass, sr);
  if (stems.music) out.music = music(stems.music, sr, p.width);
  if (stems.mix) out.mix = stems.mix;
  return out;
}

/* --------------------------------------------------------------------- mix */

const loud = (x: Stereo, sr: number) => {
  const v = lufs(x, sr);
  return v > -60 ? v : null;
};

/** Moves bass and music towards the genre's level relative to the drums (half way, at most 4 dB). */
export function balance(
  stems: RoleStems,
  sr: number,
  preset: PresetName,
): { stems: RoleStems; moves: Record<string, number> } {
  const out: RoleStems = { ...stems };
  const moves: Record<string, number> = {};
  const ref = stems.drums ? loud(stems.drums, sr) : null;
  if (ref === null) return { stems: out, moves };
  for (const role of ["bass", "music"] as const) {
    const s = out[role];
    const lv = s ? loud(s, sr) : null;
    if (!s || lv === null) continue;
    const g = Math.max(-4, Math.min(4, (ref + PRESETS[preset].balance[role] - lv) * 0.5));
    out[role] = scale(s, dbToGain(g));
    moves[role] = Math.round(g * 100) / 100;
  }
  return { stems: out, moves };
}

/** Ducks the bass briefly under the kick so the low end punches instead of smearing. */
export function sidechainBass(stems: RoleStems, sr: number, depthDb = 2.5): RoleStems {
  if (!stems.drums || !stems.bass) return stems;
  const kick = filtfilt(mono(stems.drums), butter("lowpass", 100, sr, 4));
  const e = onePole(kick.map(Math.abs), 30, sr);
  const ref = percentile(e, 99.5) + 1e-9;
  const g = e.map((v) => dbToGain(-Math.min(1, v / ref) * depthDb));
  const b = stems.bass;
  return {
    ...stems,
    bass: [b[0].map((v, i) => v * (g[i] ?? 1)), b[1].map((v, i) => v * (g[i] ?? 1))],
  };
}

function pocketSplit(x: Stereo, sr: number): [Stereo, Stereo] {
  const b = filtfiltS(x, band(1500, 5000, sr, 2));
  return [b, [x[0].map((v, i) => v - b[0][i]!), x[1].map((v, i) => v - b[1][i]!)]]; // zero-phase: band + rest == x
}

/** Beat mode: a permanent 2 dB gap at 1.5-5 kHz for the vocal that's coming. */
export function staticPocket(music: Stereo, sr: number, depthDb = 2): Stereo {
  const [b, rest] = pocketSplit(music, sr);
  const g = dbToGain(-depthDb);
  return [rest[0].map((v, i) => v + b[0][i]! * g), rest[1].map((v, i) => v + b[1][i]! * g)];
}

/** Song mode: duck the music's vocal band only while the vocalist is singing. */
export function dynamicPocket(music: Stereo, vocal: Stereo, sr: number, depthDb = 3.5): Stereo {
  const [b, rest] = pocketSplit(music, sr);
  const vb = filtfilt(mono(vocal), band(1500, 5000, sr, 2));
  const e = onePole(vb.map(Math.abs), 40, sr);
  const ref = percentile(e, 99) + 1e-9;
  const g = onePole(
    e.map((v) => dbToGain(-Math.min(1, v / ref) * depthDb)),
    10,
    sr,
  );
  return [
    rest[0].map((v, i) => v + b[0][i]! * (g[i] ?? 1)),
    rest[1].map((v, i) => v + b[1][i]! * (g[i] ?? 1)),
  ];
}

/* ------------------------------------------------------------------ vocals */

/** Split-band de-esser: only the sibilant band is turned down, and only when it spikes. */
export function deEss(x: Stereo, sr: number, threshDb = -28, maxCutDb = 8): Stereo {
  const sib = filtfiltS(x, band(5000, Math.min(9500, sr * 0.45), sr, 4));
  const det = new Float32Array(len(x)).map((_, i) =>
    Math.max(Math.abs(sib[0][i]!), Math.abs(sib[1][i]!)),
  );
  const env = onePole(det, 3, sr);
  const cut = env.map((v) => Math.max(0, Math.min(maxCutDb, 20 * Math.log10(v + 1e-9) - threshDb)));
  const g = onePole(cut, 2, sr).map((c) => dbToGain(-c));
  return [
    x[0].map((v, i) => v - sib[0][i]! + sib[0][i]! * g[i]!),
    x[1].map((v, i) => v - sib[1][i]! + sib[1][i]! * g[i]!),
  ];
}

export function vocalChain(x: Stereo, sr: number, role: "lead" | "backing"): Stereo {
  let y = filterS(x, butter("highpass", role === "lead" ? 90 : 140, sr, 2));
  y = gate(y, sr, -55);
  y = filterS(y, [design("peak", 280, sr, 1, -2.5), design("peak", 900, sr, 1.2, -1)]);
  y = compress(y, sr, { threshold: -18, ratio: 4, attack: 3, release: 60 });
  y = compress(y, sr, { threshold: -14, ratio: 2, attack: 20, release: 160 });
  y = deEss(y, sr);
  return filterS(y, [
    design("peak", 3200, sr, 0.8, 1.5),
    design("highshelf", 11000, sr, 0.7, role === "lead" ? 2.5 : 3.5),
  ]);
}

/** Reverb and a quarter-note delay as filtered returns. */
function spaces(dry: Stereo, sr: number, bpm: number): [Stereo, Stereo] {
  const verb = filterS(reverb(dry, sr, { room: 0.35, damping: 0.6, width: 1 }), [
    ...butter("highpass", 350, sr, 2),
    ...butter("lowpass", 7000, sr, 2),
  ]);
  const pre = filterS(dry, [...butter("highpass", 400, sr, 2), ...butter("lowpass", 5000, sr, 2)]);
  return [verb, delay(pre, sr, 60 / bpm, 0.25)];
}

function haas(x: Stereo, sr: number, ms = 12): Stereo {
  const d = Math.round((sr * ms) / 1000);
  const m = mono(x);
  const r = new Float32Array(m.length);
  r.set(m.subarray(0, m.length - d), d);
  return [m, r];
}

/** Lead vocals sit dead centre; backing vocals are widened. Returns dry+FX buses, not yet levelled. */
export function vocalBuses(
  leads: Stereo[],
  backs: Stereo[],
  sr: number,
  bpm: number,
): { lead: Stereo | null; back: Stereo | null } {
  const bus = (tracks: Stereo[], role: "lead" | "backing") => {
    if (!tracks.length) return null;
    const processed = tracks.map((t) => {
      const v = vocalChain(t, sr, role);
      if (role === "lead") {
        const m = mono(v);
        return [m, m.slice()] as Stereo;
      }
      return haas(v, sr);
    });
    const acc = sum(...processed);
    const [verb, dly] = spaces(acc, sr, bpm);
    const send = dbToGain(role === "lead" ? -14 : -10);
    return sum(acc, scale(verb, send), scale(dly, send * 0.7));
  };
  return { lead: bus(leads, "lead"), back: bus(backs, "backing") };
}

/** Lead vocal at the genre's level over the beat; backing vocals 6 dB under. */
export function placeVocals(
  beat: Stereo,
  lead: Stereo | null,
  back: Stereo | null,
  sr: number,
  preset: PresetName,
) {
  const b = loud(beat, sr);
  const off = PRESETS[preset].vocalOverBeat;
  const place = (v: Stereo | null, rel: number) => {
    if (!v) return null;
    const lv = loud(v, sr);
    return b !== null && lv !== null ? scale(v, dbToGain(b + rel - lv)) : v;
  };
  return { lead: place(lead, off), back: place(back, off - 6) };
}
