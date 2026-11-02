export type FxSettings = {
  /** 0..1 reverb send amount */
  reverb: number;
  /** 0..1 dotted-eighth delay send amount */
  delay: number;
  /** 0..1 master soft-clip drive */
  drive: number;
};

export type MixLevels = {
  kick: number;
  snare: number;
  clap: number;
  hats: number;
  perc: number;
  bass: number;
  chords: number;
  melody: number;
};

export type BeatSpec = {
  title: string;
  bpm: number;
  key: string;
  mood: string;
  genre: string;
  description: string;
  /** 0..0.6 — delays every off-beat 16th for groove */
  swing: number;
  kick: string;
  snare: string;
  clap: string;
  hat: string;
  openHat: string;
  perc: string;
  bassSteps: string[];
  chordNotes: string[];
  /** 16 melody steps; each is "-" or a note like "C4". */
  melody: string[];
  fx: FxSettings;
  mix: MixLevels;
};

export type GenerateResult =
  | { engine: "builtin"; spec: BeatSpec; prompt: string }
  | { engine: "external"; audioUrl: string; prompt: string };

const DEFAULT_FX: FxSettings = { reverb: 0.22, delay: 0.12, drive: 0.25 };

const DEFAULT_MIX: MixLevels = {
  kick: 1,
  snare: 0.9,
  clap: 0.8,
  hats: 0.7,
  perc: 0.6,
  bass: 0.95,
  chords: 0.7,
  melody: 0.65,
};

export const FALLBACK_SPEC: BeatSpec = {
  title: "Untitled Session",
  bpm: 90,
  key: "C minor",
  mood: "dark, soulful",
  genre: "boom bap",
  description: "A steady boom-bap foundation with a warm sub bass.",
  swing: 0.18,
  kick: "x--x--x---x--x---".slice(0, 16),
  snare: "----x-------x---",
  clap: "----------------",
  hat: "x-x-x-x-x-x-x-x-",
  openHat: "------x-------x-",
  perc: "----------------",
  bassSteps: [
    "C2",
    "-",
    "-",
    "-",
    "Eb2",
    "-",
    "-",
    "-",
    "G2",
    "-",
    "-",
    "-",
    "Bb1",
    "-",
    "-",
    "-",
  ],
  chordNotes: ["C3 Eb3 G3 Bb3", "Ab2 C3 Eb3 G3", "Bb2 D3 F3 Ab3", "G2 Bb2 D3 F3"],
  melody: [
    "-",
    "-",
    "G4",
    "-",
    "-",
    "-",
    "Eb4",
    "-",
    "-",
    "-",
    "D4",
    "-",
    "C4",
    "-",
    "-",
    "-",
  ],
  fx: DEFAULT_FX,
  mix: DEFAULT_MIX,
};

const NOTE_OFFSETS: Record<string, number> = {
  C: 0,
  D: 2,
  E: 4,
  F: 5,
  G: 7,
  A: 9,
  B: 11,
};

export function noteToFreq(note: string): number | null {
  const match = /^([A-Ga-g])(#|b)?(-?\d)$/.exec(note.trim());
  if (!match) return null;
  const base = NOTE_OFFSETS[match[1]!.toUpperCase()];
  if (base === undefined) return null;
  const accidental = match[2] === "#" ? 1 : match[2] === "b" ? -1 : 0;
  const octave = Number(match[3]);
  const midi = 12 * (octave + 1) + base + accidental;
  return 440 * Math.pow(2, (midi - 69) / 12);
}

function clamp01(value: unknown, fallback: number) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(1, Math.max(0, n));
}

function normalizeSteps(value: unknown, fallback: string[]) {
  const steps = Array.isArray(value) ? value.slice(0, 16) : fallback.slice(0, 16);
  while (steps.length < 16) steps.push("-");
  return steps.map((n) => (typeof n === "string" && n.trim() ? n.trim() : "-"));
}

/** Fills every missing field so specs saved by older versions still play. */
export function normalizeSpec(input: Partial<BeatSpec> | null | undefined): BeatSpec {
  const pad = (value: unknown, fallback: string) => {
    const s = typeof value === "string" ? value.replace(/[^x\-.]/gi, "-") : fallback;
    return (s + "----------------").slice(0, 16).toLowerCase();
  };
  const chords =
    Array.isArray(input?.chordNotes) && input!.chordNotes.length > 0
      ? input!.chordNotes.slice(0, 4)
      : FALLBACK_SPEC.chordNotes;
  const fx = (input?.fx ?? {}) as Partial<FxSettings>;
  const mix = (input?.mix ?? {}) as Partial<MixLevels>;
  return {
    title: input?.title?.trim() || FALLBACK_SPEC.title,
    bpm: Math.min(200, Math.max(50, Math.round(Number(input?.bpm) || FALLBACK_SPEC.bpm))),
    key: input?.key || FALLBACK_SPEC.key,
    mood: input?.mood || FALLBACK_SPEC.mood,
    genre: input?.genre || FALLBACK_SPEC.genre,
    description: input?.description || FALLBACK_SPEC.description,
    swing: Math.min(0.6, clamp01(input?.swing, FALLBACK_SPEC.swing)),
    kick: pad(input?.kick, FALLBACK_SPEC.kick),
    snare: pad(input?.snare, FALLBACK_SPEC.snare),
    clap: pad(input?.clap, FALLBACK_SPEC.clap),
    hat: pad(input?.hat, FALLBACK_SPEC.hat),
    openHat: pad(input?.openHat, FALLBACK_SPEC.openHat),
    perc: pad(input?.perc, FALLBACK_SPEC.perc),
    bassSteps: normalizeSteps(input?.bassSteps, FALLBACK_SPEC.bassSteps),
    chordNotes: chords,
    melody: normalizeSteps(input?.melody, FALLBACK_SPEC.melody),
    fx: {
      reverb: clamp01(fx.reverb, DEFAULT_FX.reverb),
      delay: clamp01(fx.delay, DEFAULT_FX.delay),
      drive: clamp01(fx.drive, DEFAULT_FX.drive),
    },
    mix: {
      kick: clamp01(mix.kick, DEFAULT_MIX.kick),
      snare: clamp01(mix.snare, DEFAULT_MIX.snare),
      clap: clamp01(mix.clap, DEFAULT_MIX.clap),
      hats: clamp01(mix.hats, DEFAULT_MIX.hats),
      perc: clamp01(mix.perc, DEFAULT_MIX.perc),
      bass: clamp01(mix.bass, DEFAULT_MIX.bass),
      chords: clamp01(mix.chords, DEFAULT_MIX.chords),
      melody: clamp01(mix.melody, DEFAULT_MIX.melody),
    },
  };
}
