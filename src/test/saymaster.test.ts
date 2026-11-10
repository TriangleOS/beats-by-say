import { describe, expect, it } from "vitest";
import { lufs, limit, truePeakDb, type Stereo } from "@/lib/saymaster/dsp";
import { decodeWav, encodeWav } from "@/lib/saymaster/wav";
import { finishSong, masterFile, produceBeat } from "@/lib/saymaster/pipeline";
import { presetForGenre } from "@/lib/saymaster/presets";

const SR = 44100;
const sine = (f: number, amp: number, seconds: number): Stereo => {
  const n = Math.round(seconds * SR);
  const ch = new Float32Array(n).map((_, i) => amp * Math.sin((2 * Math.PI * f * i) / SR));
  return [ch, ch.slice()];
};
// deterministic noise so results don't drift between runs
function rand(seed: number) {
  return () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296) * 2 - 1;
}
/** A small synthetic beat: kick on every beat, noisy snare on 2 and 4, a bass note and a chord. */
function beatStems(seconds = 8) {
  const n = Math.round(seconds * SR);
  const r = rand(7);
  const drums: Stereo = [new Float32Array(n), new Float32Array(n)];
  const bass: Stereo = [new Float32Array(n), new Float32Array(n)];
  const music: Stereo = [new Float32Array(n), new Float32Array(n)];
  const beat = Math.round(SR * 0.5);
  for (let b = 0; b * beat < n; b++) {
    for (let i = 0; i < SR * 0.3 && b * beat + i < n; i++) {
      const t = i / SR;
      const k =
        Math.sin(2 * Math.PI * (50 + 120 * Math.exp(-t * 30)) * t) * Math.exp(-t * 10) * 0.8;
      const s = b % 2 ? r() * Math.exp(-t * 20) * 0.5 : 0;
      drums[0][b * beat + i]! += k + s;
      drums[1][b * beat + i]! += k + s;
    }
  }
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    bass[0][i] = bass[1][i] = Math.sin(2 * Math.PI * 55 * t) * 0.5;
    const c = [220, 261.6, 329.6].reduce((a, f) => a + Math.sin(2 * Math.PI * f * t) * 0.08, 0);
    music[0][i] = c * 1.1;
    music[1][i] = c * 0.9;
  }
  return { drums, bass, music };
}

describe("SayMaster", () => {
  it("measures loudness per ITU-R BS.1770 (matches pyloudnorm)", () => {
    expect(lufs(sine(1000, 0.5, 5), SR)).toBeCloseTo(-6.056, 2);
  });

  it("limits inter-sample peaks under the ceiling", () => {
    const loud = sine(11025 * 0.98, 1.4, 1);
    const y = limit(loud, SR, -1);
    expect(truePeakDb(y)).toBeLessThanOrEqual(-0.9);
  });

  it("round-trips 24-bit WAV", () => {
    const x = sine(440, 0.5, 0.1);
    const { audio, sampleRate } = decodeWav(encodeWav(x, SR, 24));
    expect(sampleRate).toBe(SR);
    expect(Math.abs(audio[0][100]! - x[0][100]!)).toBeLessThan(1e-6);
  });

  it("masters a beat 3 LU under release loudness with true peak under the ceiling", () => {
    const r = produceBeat(beatStems(), SR, "trap");
    expect(r.outputs.map((o) => o.name)).toEqual(["beat-vocal-ready", "beat-clean"]);
    expect(Math.abs(r.report.after.lufs - (-9.5 - 3))).toBeLessThan(0.6);
    expect(r.report.after.truePeakDb).toBeLessThanOrEqual(-0.95);
    expect(r.stems.map((s) => s.name).sort()).toEqual(["bass", "drums", "music"]);
  }, 60_000);

  it("finishes a song with matching alternate versions", () => {
    const stems = beatStems(6);
    const r = rand(3);
    const vocal = sine(220, 0.3, 6);
    for (let i = 0; i < vocal[0].length; i++)
      vocal[0][i] = vocal[1][i] = vocal[0][i]! * (1 + 0.1 * r());
    const out = finishSong(stems, [vocal], [], SR, "rnb", 120);
    expect(out.outputs.map((o) => o.name)).toEqual(["main", "instrumental", "acapella"]);
    expect(Math.abs(out.report.after.lufs - -11)).toBeLessThan(0.6);
    for (const o of out.outputs) expect(truePeakDb(o.audio)).toBeLessThanOrEqual(-0.95);
  }, 60_000);

  it("masters a stereo file to the streaming target", () => {
    const s = beatStems(6);
    const mix: Stereo = [
      s.drums[0].map((v, i) => v + s.bass[0][i]! + s.music[0][i]!),
      s.drums[1].map((v, i) => v + s.bass[1][i]! + s.music[1][i]!),
    ];
    const r = masterFile(mix, SR, "streaming");
    expect(Math.abs(r.report.after.lufs - -14)).toBeLessThan(0.6);
  }, 60_000);

  it("picks presets from the beat's genre", () => {
    expect(presetForGenre("UK drill")).toBe("drill");
    expect(presetForGenre("Afroswing")).toBe("afrobeats");
    expect(presetForGenre("90s boom bap")).toBe("boombap");
    expect(presetForGenre("ambient")).toBe("streaming");
  });
});
