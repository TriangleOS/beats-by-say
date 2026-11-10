import { zipSync } from "fflate";
import { normalizeSpec, type BeatSpec } from "./beat-spec";
import { createMasterChain, scheduleBar, STEMS, type StemName } from "./engine/dsp";
import { buildLmmsProject } from "./lmms";

export type { StemName } from "./engine/dsp";
export { STEMS } from "./engine/dsp";

function renderTrack(
  input: BeatSpec,
  stem: StemName | readonly StemName[],
  bars: number,
  sampleRate = 44100,
): Promise<AudioBuffer> {
  const spec = normalizeSpec(input);
  const stepDur = 60 / spec.bpm / 4;
  const barDur = stepDur * 16;
  const length = Math.ceil((bars * barDur + 2.5) * sampleRate);
  const ctx = new OfflineAudioContext(2, length, sampleRate);
  // Stems render with halved effects so they stay usable in a DAW; the full
  // mix keeps the spec's exact settings.
  const fx =
    stem === "full-mix" || Array.isArray(stem)
      ? spec.fx
      : { reverb: spec.fx.reverb * 0.5, delay: spec.fx.delay * 0.5, drive: spec.fx.drive * 0.5 };
  const chain = createMasterChain(ctx, fx, stepDur);

  let lastBassFreq: number | null = null;
  for (let bar = 0; bar < bars; bar++) {
    lastBassFreq = scheduleBar(ctx, chain, spec, stem, bar, 0.05 + bar * barDur, stepDur, lastBassFreq);
  }

  return ctx.startRendering();
}

function encodeWav(buffer: AudioBuffer): Uint8Array {
  const channels = buffer.numberOfChannels;
  const frames = buffer.length;
  const bytes = new ArrayBuffer(44 + frames * channels * 2);
  const view = new DataView(bytes);
  const writeStr = (offset: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(offset + i, s.charCodeAt(i));
  };
  writeStr(0, "RIFF");
  view.setUint32(4, 36 + frames * channels * 2, true);
  writeStr(8, "WAVE");
  writeStr(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, channels, true);
  view.setUint32(24, buffer.sampleRate, true);
  view.setUint32(28, buffer.sampleRate * channels * 2, true);
  view.setUint16(32, channels * 2, true);
  view.setUint16(34, 16, true);
  writeStr(36, "data");
  view.setUint32(40, frames * channels * 2, true);

  let offset = 44;
  for (let i = 0; i < frames; i++) {
    for (let c = 0; c < channels; c++) {
      const sample = Math.max(-1, Math.min(1, buffer.getChannelData(c)[i] ?? 0));
      view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
      offset += 2;
    }
  }
  return new Uint8Array(bytes);
}

export function slugify(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "beat";
}

/** Renders the full mix as a single stereo WAV file. */
export async function renderMixWav(spec: BeatSpec, bars = 4): Promise<Blob> {
  const buffer = await renderTrack(spec, "full-mix", bars);
  return new Blob([encodeWav(buffer) as BlobPart], { type: "audio/wav" });
}

const STEM_LABELS: Record<StemName, string> = {
  "full-mix": "Full mix",
  kick: "Kick",
  snare: "Snare",
  clap: "Clap",
  hats: "Hats",
  "open-hat": "Open hat",
  perc: "Percussion",
  bass: "Bass",
  chords: "Chords",
  melody: "Melody",
  "vocal-guide": "Vocal guide",
};

/**
 * Renders every instrument to its own WAV plus a silent vocal track, zipped
 * together with an LMMS project file that loads the stems at the right tempo.
 */
export async function renderStemsZip(
  input: BeatSpec,
  bars = 4,
  onProgress?: (done: number, total: number) => void,
): Promise<Blob> {
  const spec = normalizeSpec(input);
  const files: Record<string, Uint8Array> = {};
  const base = slugify(spec.title);
  const stemList: { file: string; name: string }[] = [];
  for (let i = 0; i < STEMS.length; i++) {
    const stem = STEMS[i]!;
    const buffer = await renderTrack(spec, stem, bars);
    const file = `${String(i + 1).padStart(2, "0")}-${stem}.wav`;
    files[`${base}/${file}`] = encodeWav(buffer);
    if (stem !== "vocal-guide") stemList.push({ file, name: STEM_LABELS[stem] });
    onProgress?.(i + 1, STEMS.length + 2);
  }
  files[`${base}/${base}.mmp`] = new TextEncoder().encode(buildLmmsProject(spec, stemList, bars));
  files[`${base}/beat-sheet.json`] = new TextEncoder().encode(JSON.stringify(spec, null, 2));
  files[`${base}/README.txt`] = new TextEncoder().encode(
    `${spec.title}\n${spec.bpm} BPM · ${spec.key} · ${spec.mood}\n\n` +
      `Instrumental stems from Beats by Say.\n` +
      `11-vocal-guide.wav is an empty vocal track — drop it into your session and record your vocals over the mix.\n\n` +
      `OPEN IN LMMS (free from lmms.io):\n` +
      `Unzip this folder, then open ${base}.mmp in LMMS. Every stem loads on its own track at ${spec.bpm} BPM, ready to mix, add effects and finish the record.\n\n` +
      `Made with AI on Beats by Say. We take no split and claim no rights in it; check your distributor's rules on AI-assisted music before you release.\n`,
  );
  onProgress?.(STEMS.length + 2, STEMS.length + 2);
  const zipped = zipSync(files, { level: 0 });
  return new Blob([zipped as BlobPart], { type: "application/zip" });
}

export function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/* ---------------------------------------------------------------------------
 * Songwriter: full-song arrangement rendering
 * ------------------------------------------------------------------------- */

export type SongPart = "drums" | "hats" | "bass" | "chords" | "melody";

export type SongSection = {
  name: string;
  bars: number;
  parts: Record<SongPart, boolean>;
};

const BLANK = "----------------";

function sectionSpec(spec: BeatSpec, parts: Record<SongPart, boolean>): BeatSpec {
  const muted = "-";
  return {
    ...spec,
    kick: parts.drums ? spec.kick : BLANK,
    snare: parts.drums ? spec.snare : BLANK,
    clap: parts.drums ? spec.clap : BLANK,
    hat: parts.hats ? spec.hat : BLANK,
    openHat: parts.hats ? spec.openHat : BLANK,
    perc: parts.hats ? spec.perc : BLANK,
    bassSteps: parts.bass ? spec.bassSteps : spec.bassSteps.map(() => muted),
    chordNotes: parts.chords ? spec.chordNotes : spec.chordNotes.map(() => ""),
    melody: parts.melody !== false ? spec.melody : spec.melody.map(() => muted),
  };
}

function encodeWavFromFloat(data: Float32Array, sampleRate: number, channels = 1): Uint8Array {
  const bytes = new ArrayBuffer(44 + data.length * 2);
  const view = new DataView(bytes);
  const writeStr = (offset: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(offset + i, s.charCodeAt(i));
  };
  writeStr(0, "RIFF");
  view.setUint32(4, 36 + data.length * 2, true);
  writeStr(8, "WAVE");
  writeStr(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, channels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2 * channels, true);
  view.setUint16(32, 2 * channels, true);
  view.setUint16(34, 16, true);
  writeStr(36, "data");
  view.setUint32(40, data.length * 2, true);
  let offset = 44;
  for (let i = 0; i < data.length; i++) {
    const sample = Math.max(-1, Math.min(1, data[i] ?? 0));
    view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
    offset += 2;
  }
  return new Uint8Array(bytes);
}

export function songLengthSeconds(spec: BeatSpec, sections: SongSection[]) {
  const barDur = (60 / spec.bpm) * 4;
  return sections.reduce((total, s) => total + s.bars * barDur, 0);
}

/**
 * Renders an arranged song section by section into one stereo buffer pair. Each section's reverb and
 * delay tail is overlapped into the next section rather than cut off.
 */
async function renderSong(
  input: BeatSpec,
  sections: SongSection[],
  stem: StemName | readonly StemName[],
  sampleRate: number,
  onSection?: () => void,
): Promise<[Float32Array, Float32Array]> {
  const spec = normalizeSpec(input);
  const stepDur = 60 / spec.bpm / 4;
  const starts: number[] = [];
  let cursor = 0;
  for (const s of sections) {
    starts.push(cursor);
    cursor += Math.round(s.bars * 16 * stepDur * sampleRate);
  }
  const tail = Math.round(2.5 * sampleRate);
  const out: [Float32Array, Float32Array] = [new Float32Array(cursor + tail), new Float32Array(cursor + tail)];
  for (let i = 0; i < sections.length; i++) {
    const buffer = await renderTrack(sectionSpec(spec, sections[i]!.parts), stem, sections[i]!.bars, sampleRate);
    for (let c = 0; c < 2; c++) {
      const src = buffer.getChannelData(Math.min(c, buffer.numberOfChannels - 1));
      const dst = out[c]!;
      const at = starts[i]!;
      for (let k = 0; k < src.length && at + k < dst.length; k++) dst[at + k]! += src[k]!;
    }
    onSection?.();
  }
  // trim the last tail to where it actually dies away
  let end = out[0].length;
  while (end > cursor && Math.abs(out[0][end - 1]!) < 1e-5 && Math.abs(out[1][end - 1]!) < 1e-5) end--;
  return [out[0].slice(0, end), out[1].slice(0, end)];
}

/** Renders a full arranged song (intro, verses, choruses...) as one stereo WAV file. */
export async function renderSongWav(
  input: BeatSpec,
  sections: SongSection[],
  onProgress?: (done: number, total: number) => void,
): Promise<Blob> {
  let done = 0;
  const [l, r] = await renderSong(input, sections, "full-mix", 44100, () => onProgress?.(++done, sections.length));
  const interleaved = new Float32Array(l.length * 2);
  for (let i = 0; i < l.length; i++) {
    interleaved[i * 2] = l[i]!;
    interleaved[i * 2 + 1] = r[i]!;
  }
  return new Blob([encodeWavFromFloat(interleaved, 44100, 2) as BlobPart], { type: "audio/wav" });
}

/* ---------------------------------------------------------------------------
 * SayMaster: drums / bass / music stems for the studio-quality chain
 * ------------------------------------------------------------------------- */

export const ROLE_GROUPS = {
  drums: ["kick", "snare", "clap", "hats", "open-hat", "perc"],
  bass: ["bass"],
  music: ["chords", "melody"],
} as const satisfies Record<string, readonly StemName[]>;
export type RoleName = keyof typeof ROLE_GROUPS;
export type RoleAudio = Record<RoleName, [Float32Array, Float32Array]>;
export const MASTER_RATE = 44100;

const channels = (b: AudioBuffer): [Float32Array, Float32Array] => [
  b.getChannelData(0).slice(),
  b.getChannelData(Math.min(1, b.numberOfChannels - 1)).slice(),
];

/** Renders a beat loop as drums, bass and music stems (full effects, so they sum to the mix). */
export async function renderRoleStems(spec: BeatSpec, bars = 8): Promise<RoleAudio> {
  const out = {} as RoleAudio;
  for (const role of Object.keys(ROLE_GROUPS) as RoleName[]) {
    out[role] = channels(await renderTrack(spec, ROLE_GROUPS[role], bars, MASTER_RATE));
  }
  return out;
}

/** Renders a whole arranged song as drums, bass and music stems. */
export async function renderSongRoleStems(
  spec: BeatSpec,
  sections: SongSection[],
  onProgress?: (done: number, total: number) => void,
): Promise<RoleAudio> {
  const out = {} as RoleAudio;
  const total = sections.length * 3;
  let done = 0;
  for (const role of Object.keys(ROLE_GROUPS) as RoleName[]) {
    out[role] = await renderSong(spec, sections, ROLE_GROUPS[role], MASTER_RATE, () => onProgress?.(++done, total));
  }
  return out;
}

/** The plain full mix as stereo arrays, for before/after comparison. */
export async function renderMixArrays(spec: BeatSpec, bars = 8): Promise<[Float32Array, Float32Array]> {
  return channels(await renderTrack(spec, "full-mix", bars, MASTER_RATE));
}
