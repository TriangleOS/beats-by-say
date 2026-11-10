/** SayMaster genre presets. Same values as the Python reference implementation. */

export type MbBand = { threshold: number; ratio: number; attack: number; release: number };
export type Preset = {
  label: string;
  /** Integrated loudness target for a finished, vocal-included master (LUFS). */
  lufs: number;
  /** True-peak ceiling (dBTP). */
  ceiling: number;
  /** Target spectral slope in dB/octave around 1 kHz. */
  tilt: number;
  /** Per-band offsets on top of the tilt, keyed by band index (see BAND_EDGES). */
  bias: Record<number, number>;
  mb: { low: MbBand; mid: MbBand; high: MbBand };
  drive: number;
  width: number;
  air: number;
  monoBelow: number;
  /** Stem loudness relative to drums (LU). */
  balance: { bass: number; music: number };
  /** Lead vocal loudness relative to the beat (LU). */
  vocalOverBeat: number;
};

const mb = (t: number, r: number, a: number, rel: number): MbBand => ({
  threshold: t,
  ratio: r,
  attack: a,
  release: rel,
});

export const PRESETS = {
  trap: {
    label: "Trap",
    lufs: -9.5,
    ceiling: -1,
    tilt: -4.8,
    bias: { 0: 2.5, 1: 1.5, 2: -1, 7: 0.5 },
    mb: { low: mb(-18, 2, 30, 160), mid: mb(-20, 1.8, 15, 120), high: mb(-24, 1.6, 5, 80) },
    drive: 0.25,
    width: 1.15,
    air: 0.12,
    monoBelow: 120,
    balance: { bass: 0, music: -4 },
    vocalOverBeat: 1.5,
  },
  drill: {
    label: "Drill",
    lufs: -9,
    ceiling: -1,
    tilt: -4.6,
    bias: { 0: 2, 1: 2, 2: -1.5, 5: 0.5 },
    mb: { low: mb(-18, 2.2, 25, 140), mid: mb(-20, 2, 12, 110), high: mb(-24, 1.6, 5, 80) },
    drive: 0.3,
    width: 1.1,
    air: 0.1,
    monoBelow: 130,
    balance: { bass: 0.5, music: -4.5 },
    vocalOverBeat: 2,
  },
  afrobeats: {
    label: "Afrobeats",
    lufs: -10,
    ceiling: -1,
    tilt: -4.4,
    bias: { 1: 1, 2: -0.5, 5: 0.5, 6: 0.5 },
    mb: { low: mb(-20, 1.8, 30, 180), mid: mb(-22, 1.6, 15, 140), high: mb(-24, 1.5, 5, 90) },
    drive: 0.18,
    width: 1.2,
    air: 0.12,
    monoBelow: 110,
    balance: { bass: -2, music: -2.5 },
    vocalOverBeat: 1,
  },
  rnb: {
    label: "R&B",
    lufs: -11,
    ceiling: -1,
    tilt: -4.9,
    bias: { 0: 1, 1: 1, 2: -0.5, 6: 0.3 },
    mb: { low: mb(-22, 1.6, 35, 200), mid: mb(-24, 1.5, 20, 160), high: mb(-26, 1.4, 8, 100) },
    drive: 0.15,
    width: 1.15,
    air: 0.1,
    monoBelow: 110,
    balance: { bass: -1.5, music: -1.5 },
    vocalOverBeat: 0.5,
  },
  boombap: {
    label: "Boom bap",
    lufs: -10.5,
    ceiling: -1,
    tilt: -5.2,
    bias: { 1: 1.5, 3: 0.5, 7: -0.5 },
    mb: { low: mb(-20, 2, 25, 150), mid: mb(-22, 1.8, 10, 120), high: mb(-26, 1.5, 5, 90) },
    drive: 0.35,
    width: 1,
    air: 0.05,
    monoBelow: 140,
    balance: { bass: -3, music: -2.5 },
    vocalOverBeat: 2,
  },
  pop: {
    label: "Pop",
    lufs: -9.5,
    ceiling: -1,
    tilt: -4.3,
    bias: { 1: 0.5, 2: -0.5, 5: 0.5, 7: 0.8 },
    mb: { low: mb(-20, 1.8, 30, 160), mid: mb(-22, 1.7, 15, 130), high: mb(-24, 1.5, 5, 80) },
    drive: 0.15,
    width: 1.2,
    air: 0.15,
    monoBelow: 110,
    balance: { bass: -2, music: -2 },
    vocalOverBeat: 1,
  },
  lofi: {
    label: "Lo-fi",
    lufs: -13,
    ceiling: -1.5,
    tilt: -5.5,
    bias: { 2: 0.5, 6: -1, 7: -2 },
    mb: { low: mb(-22, 1.5, 40, 220), mid: mb(-24, 1.4, 25, 180), high: mb(-28, 1.3, 10, 120) },
    drive: 0.3,
    width: 1,
    air: 0,
    monoBelow: 120,
    balance: { bass: -2, music: -0.5 },
    vocalOverBeat: 0,
  },
  streaming: {
    label: "Streaming (-14 LUFS)",
    lufs: -14,
    ceiling: -1,
    tilt: -4.7,
    bias: {},
    mb: { low: mb(-22, 1.5, 30, 180), mid: mb(-24, 1.4, 20, 150), high: mb(-26, 1.3, 8, 100) },
    drive: 0.1,
    width: 1.1,
    air: 0.1,
    monoBelow: 110,
    balance: { bass: -1.5, music: -2 },
    vocalOverBeat: 1,
  },
} satisfies Record<string, Preset>;

export type PresetName = keyof typeof PRESETS;
export const PRESET_NAMES = Object.keys(PRESETS) as PresetName[];

/** Bands: sub, bass, low-mid, mid, upper-mid, presence, brilliance, air. */
export const BAND_EDGES = [20, 60, 150, 400, 1000, 2500, 6000, 12000, 20000];

/** Beat masters sit this far under release loudness so the vocal has room. */
export const VOCAL_HEADROOM_LU = 3;

/** Picks a preset from the beat's free-text genre. */
export function presetForGenre(genre: string | undefined): PresetName {
  const g = (genre ?? "").toLowerCase();
  if (/drill/.test(g)) return "drill";
  if (/trap|808|rage|plugg/.test(g)) return "trap";
  if (/afro|amapiano|dancehall|reggaeton|swing/.test(g)) return "afrobeats";
  if (/r&b|rnb|soul|neo/.test(g)) return "rnb";
  if (/boom ?bap|old school|90s|jazz/.test(g)) return "boombap";
  if (/lo-?fi|chill/.test(g)) return "lofi";
  if (/pop|dance|house|edm/.test(g)) return "pop";
  return "streaming";
}
