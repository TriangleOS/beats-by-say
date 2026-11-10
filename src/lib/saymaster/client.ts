/** Browser entry point: decodes uploads and runs SayMaster jobs in a Web Worker. */
import type { Stereo } from "./dsp";
import type { Delivery, Job } from "./deliver";

export type { Delivery, Job } from "./deliver";
export type OnProgress = (stage: string, fraction: number) => void;

const MAX_SECONDS = 8 * 60;

/** Decodes any browser-supported audio file to stereo at `sr` (decodeAudioData resamples to the context rate). */
export async function decodeFile(file: File, sr: number): Promise<Stereo> {
  const ctx = new OfflineAudioContext(2, 1, sr);
  let buffer: AudioBuffer;
  try {
    buffer = await ctx.decodeAudioData(await file.arrayBuffer());
  } catch {
    throw new Error(`Couldn't read ${file.name}. Use WAV, AIFF, FLAC, MP3 or M4A.`);
  }
  if (buffer.duration > MAX_SECONDS) throw new Error(`${file.name} is longer than 8 minutes.`);
  const l = buffer.getChannelData(0).slice();
  const r = buffer.numberOfChannels > 1 ? buffer.getChannelData(1).slice() : l.slice();
  return [l, r];
}

function buffersOf(job: Job): ArrayBuffer[] {
  const stereo: Stereo[] =
    job.kind === "master"
      ? [job.audio]
      : ([
          ...Object.values(job.stems),
          ...(job.kind === "song" ? [...job.leads, ...job.backs] : [job.reference]),
        ].filter(Boolean) as Stereo[]);
  return [
    ...new Set(stereo.flatMap((s) => [s[0].buffer as ArrayBuffer, s[1].buffer as ArrayBuffer])),
  ];
}

export function runSayMaster(job: Job, onProgress: OnProgress): Promise<Delivery> {
  return new Promise((resolve, reject) => {
    let worker: Worker;
    try {
      worker = new Worker(new URL("./worker.ts", import.meta.url), { type: "module" });
    } catch {
      // No module workers (old browsers): run on the page instead.
      void import("./deliver").then(({ runJob }) => {
        try {
          resolve(runJob(job, (stage, done, total) => onProgress(stage, done / total)));
        } catch (e) {
          reject(e);
        }
      });
      return;
    }
    worker.onmessage = (e: MessageEvent) => {
      const m = e.data as {
        type: string;
        stage?: string;
        done?: number;
        total?: number;
        out?: Delivery;
        message?: string;
      };
      if (m.type === "progress") onProgress(m.stage!, m.done! / m.total!);
      else {
        worker.terminate();
        if (m.type === "done") resolve(m.out!);
        else reject(new Error(m.message ?? "SayMaster failed."));
      }
    };
    worker.onerror = (e) => {
      worker.terminate();
      reject(new Error(e.message || "SayMaster failed."));
    };
    worker.postMessage(job, buffersOf(job));
  });
}
