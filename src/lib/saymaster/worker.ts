/// <reference lib="webworker" />
import { runJob, type Job } from "./deliver";

self.onmessage = (event: MessageEvent<Job>) => {
  try {
    const out = runJob(event.data, (stage, done, total) =>
      self.postMessage({ type: "progress", stage, done, total }),
    );
    self.postMessage({ type: "done", out }, [
      out.zip.buffer,
      ...out.previews.map((p) => p.wav.buffer),
    ]);
  } catch (error) {
    self.postMessage({
      type: "error",
      message: error instanceof Error ? error.message : String(error),
    });
  }
};
