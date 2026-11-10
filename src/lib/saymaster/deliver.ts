/** Runs a SayMaster job and packages the result. Shared by the Web Worker and the main-thread fallback. */
import { strToU8, zipSync } from "fflate";
import type { Stereo } from "./dsp";
import { finishSong, masterFile, produceBeat, type Progress, type Report } from "./pipeline";
import type { PresetName } from "./presets";
import type { RoleStems } from "./production";
import { encodeWav } from "./wav";

export type Job =
  | {
      kind: "beat";
      name: string;
      sr: number;
      preset: PresetName;
      stems: RoleStems;
      reference?: Stereo;
    }
  | {
      kind: "song";
      name: string;
      sr: number;
      preset: PresetName;
      bpm: number;
      stems: RoleStems;
      leads: Stereo[];
      backs: Stereo[];
      lufs?: number;
    }
  | { kind: "master"; name: string; sr: number; preset: PresetName; audio: Stereo; lufs?: number };

export type Delivery = {
  report: Report;
  /** zip with every version (24-bit and 16-bit WAV), the stems and the report. */
  zip: Uint8Array;
  /** 16-bit WAVs of each version for in-page listening. */
  previews: { name: string; wav: Uint8Array }[];
};

const LABELS: Record<string, string> = {
  "beat-vocal-ready":
    "Beat master with a gap left at 1.5-5 kHz for your vocal, 3 LU under release loudness. Record over this one.",
  "beat-clean":
    "The same master without the vocal gap, for listening and for sessions that will mix it differently.",
  main: "The finished song.",
  instrumental: "The song without vocals, mastered with identical settings.",
  acapella: "Vocals only, mastered with identical settings.",
  "tv-mix": "The song without the lead vocal (backing vocals kept), for live and TV performance.",
  master: "Your file, mastered.",
};

export function runJob(job: Job, progress: Progress): Delivery {
  const result =
    job.kind === "beat"
      ? produceBeat(job.stems, job.sr, job.preset, progress, job.reference)
      : job.kind === "song"
        ? finishSong(
            job.stems,
            job.leads,
            job.backs,
            job.sr,
            job.preset,
            job.bpm,
            progress,
            job.lufs,
          )
        : masterFile(job.audio, job.sr, job.preset, progress, job.lufs);

  const files: Record<string, Uint8Array> = {};
  const dir = job.name;
  const previews: Delivery["previews"] = [];
  for (const o of result.outputs) {
    files[`${dir}/${job.name}-${o.name}-24bit.wav`] = encodeWav(o.audio, job.sr, 24);
    const wav16 = encodeWav(o.audio, job.sr, 16);
    files[`${dir}/${job.name}-${o.name}-16bit.wav`] = wav16;
    previews.push({ name: o.name, wav: wav16 });
  }
  for (const s of result.stems)
    files[`${dir}/stems/${job.name}-${s.name}-24bit.wav`] = encodeWav(s.audio, job.sr, 24);
  files[`${dir}/report.json`] = strToU8(JSON.stringify(result.report, null, 2));
  const a = result.report.after;
  files[`${dir}/README.txt`] = strToU8(
    [
      `${job.name}, mastered by SayMaster on Beats by Say (${result.report.presetLabel} preset).`,
      "",
      ...result.outputs.map((o) => `${o.name}: ${LABELS[o.name] ?? ""}`),
      "",
      "Each version comes as a 24-bit WAV (for mixing, distribution and further mastering) and a dithered",
      "16-bit WAV (CD and most upload forms). stems/ holds the processed stems; they share one gain, so they",
      "line up and sum back to the mix in any DAW.",
      "",
      `Loudness ${a.lufs} LUFS integrated, true peak ${a.truePeakDb} dBTP, crest ${a.crestDb} dB.`,
      "Full measurements are in report.json.",
    ].join("\n"),
  );
  return { report: result.report, zip: zipSync(files, { level: 0 }), previews };
}
