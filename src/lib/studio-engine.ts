/**
 * Studio engine: recorded instrumentals from ACE-Step 1.5 (MIT) and stems from HT-Demucs (MIT), served by
 * the free "Beats by Say engine" Space on Hugging Face ZeroGPU (`space/` in this repo has its code).
 *
 * The browser calls the Space directly, so GPU time comes from each visitor's own free daily allowance
 * (about 2 minutes without a Hugging Face account) and nothing runs on our Worker. Mixing and mastering
 * stay in the browser (SayMaster).
 */
import type { BeatSpec } from "./beat-spec";
import { presetForGenre, type PresetName } from "./saymaster/presets";

export const ENGINE_URL = (
  import.meta.env.VITE_ENGINE_SPACE_URL || "https://triangleos-beatsbysay-engine.hf.space"
).replace(/\/$/, "");

/* --------------------------------------------------------------- the brief */

/** Production language per SayMaster preset: what a session producer would ask for. */
const SOUND: Record<PresetName, string> = {
  trap: "hard-hitting 808 bass with long sustain, crisp rolling hi-hats, snappy claps, dark atmospheric pads",
  drill:
    "UK drill groove, sliding 808 glides, syncopated hi-hats, snare on beat 3, ominous minor strings and piano",
  afrobeats:
    "afrobeats groove, log drum bass, shakers and congas, bright marimba and plucked guitar, warm and bouncy",
  rnb: "smooth contemporary R&B, warm Rhodes and lush pads, deep round sub bass, laid-back crisp drums",
  boombap:
    "90s boom bap, dusty swung drums, punchy kick and cracking snare, jazzy sampled keys, upright bass",
  pop: "polished modern pop production, punchy drums, tight bass, bright synths and guitars, wide chorus",
  lofi: "lo-fi hip hop, warm tape saturation, mellow jazzy chords, soft vinyl texture, relaxed drums",
  streaming:
    "modern professional production, punchy drums, clean low end, rich layered instruments",
};

const QUALITY =
  "instrumental, no vocals, studio quality mix, clean low end, punchy transients, wide stereo, space for a lead vocal";

const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n).trimEnd() : s);

export type Brief = { preset: PresetName; caption: string; bpm: number; key: string };

/** ACE-Step captions are under 512 characters: genre and sound first, then the artist's own words. */
export function engineBrief(
  prompt: string,
  spec?: Pick<BeatSpec, "genre" | "bpm" | "key" | "mood"> | null,
): Brief {
  const preset = presetForGenre(spec?.genre || prompt);
  const head = [spec?.genre, spec?.mood, SOUND[preset], QUALITY].filter(Boolean).join(", ");
  return {
    preset,
    caption: clip(`${head}. ${prompt.trim()}`, 500),
    bpm: spec?.bpm ?? 0,
    key: spec?.key ?? "",
  };
}

/**
 * Seconds of GPU the Space asks for (mirrors `_generate_seconds` in space/app.py). Visitors without a
 * Hugging Face account have about 120 s a day, so longer beats get one take instead of two.
 */
export function gpuRequest(seconds: number, takes: number, plan = true) {
  return Math.min(150, Math.floor(35 + seconds * 0.45 * Math.max(1, takes) + (plan ? 25 : 0)));
}
export function takesFor(seconds: number, budget = 115) {
  return gpuRequest(seconds, 2) <= budget ? 2 : 1;
}
export const LENGTHS = [30, 60, 90, 120] as const;

/* ------------------------------------------------------------ Space client */

export type FileOut = { url: string; name: string };
export type OnStatus = (message: string) => void;

type Message = {
  msg: string;
  rank?: number;
  rank_eta?: number | null;
  queue_size?: number;
  success?: boolean;
  output?: { data?: unknown[]; error?: string | null; title?: string };
  progress_data?: { desc?: string | null; index?: number; length?: number | null }[] | null;
};

/** Splits a server-sent-events buffer into complete JSON messages; returns the unparsed remainder. */
export function parseEvents(buffer: string): { messages: Message[]; rest: string } {
  const messages: Message[] = [];
  let rest = buffer;
  let i: number;
  while ((i = rest.indexOf("\n\n")) >= 0) {
    const block = rest.slice(0, i);
    rest = rest.slice(i + 2);
    const data = block
      .split("\n")
      .filter((l) => l.startsWith("data:"))
      .map((l) => l.slice(5).trim())
      .join("");
    if (!data) continue;
    try {
      messages.push(JSON.parse(data) as Message);
    } catch {
      /* keep-alive or partial noise */
    }
  }
  return { messages, rest };
}

/** Friendlier wording for the Space's own errors. */
export function explain(error: string | null | undefined): string {
  const e = error ?? "";
  if (/quota/i.test(e)) {
    const wait = /Try again in ([\d:]+)/.exec(e)?.[1];
    return `Today's free GPU time on this connection is used up${wait ? ` (it resets in ${wait})` : ""}. The synth engine still works.`;
  }
  if (/expired/i.test(e)) return "That take has expired on the engine. Make the beat again.";
  return e || "The studio engine couldn't finish this one.";
}

let fnIndex: Promise<Record<string, number>> | null = null;

async function endpoints(): Promise<Record<string, number>> {
  fnIndex ??= fetch(`${ENGINE_URL}/config`)
    .then(async (r) => {
      if (!r.ok) throw new Error(r.status === 503 ? "waking" : `config ${r.status}`);
      const cfg = (await r.json()) as { dependencies: { id: number; api_name?: string | null }[] };
      return Object.fromEntries(
        cfg.dependencies.filter((d) => d.api_name).map((d) => [d.api_name as string, d.id]),
      );
    })
    .catch((e) => {
      fnIndex = null;
      throw e;
    });
  return fnIndex;
}

/** Whether the engine Space is up. A sleeping Space is woken by this request and reports false. */
export async function engineReady(): Promise<boolean> {
  try {
    const eps = await endpoints();
    return "generate" in eps && "separate" in eps;
  } catch {
    return false;
  }
}

async function call(api: string, data: unknown[], onStatus: OnStatus): Promise<unknown[]> {
  const eps = await endpoints().catch(() => {
    throw new Error("The studio engine is starting up. Try again in a minute.");
  });
  const fn = eps[api];
  if (fn === undefined) throw new Error("The studio engine is out of date. Try again later.");
  const session = Math.random().toString(36).slice(2, 13);
  const join = await fetch(`${ENGINE_URL}/gradio_api/queue/join`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      data,
      fn_index: fn,
      trigger_id: null,
      session_hash: session,
      event_data: null,
    }),
  });
  if (!join.ok) throw new Error(`The studio engine refused the job (${join.status}).`);
  const stream = await fetch(`${ENGINE_URL}/gradio_api/queue/data?session_hash=${session}`);
  if (!stream.ok || !stream.body) throw new Error("Lost the connection to the studio engine.");
  const reader = stream.body.getReader();
  const dec = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    const parsed = parseEvents(buffer + dec.decode(value, { stream: true }));
    buffer = parsed.rest;
    for (const m of parsed.messages) {
      if (m.msg === "estimation") {
        onStatus(m.rank ? `In the queue (position ${m.rank + 1})` : "Starting");
      } else if (m.msg === "process_starts") {
        onStatus("Recording");
      } else if (m.msg === "progress" && m.progress_data?.[0]?.desc) {
        onStatus(m.progress_data[0].desc);
      } else if (m.msg === "process_completed") {
        void reader.cancel();
        if (!m.success || !m.output?.data) throw new Error(explain(m.output?.error));
        return m.output.data;
      } else if (m.msg === "unexpected_error") {
        void reader.cancel();
        throw new Error(explain(m.output?.error));
      }
    }
  }
  throw new Error("The studio engine closed the connection early.");
}

function files(value: unknown): FileOut[] {
  const list = Array.isArray(value) ? value : value ? [value] : [];
  return list.flatMap((f) => {
    const o = f as { url?: string; path?: string; orig_name?: string };
    const url = o.url || (o.path ? `${ENGINE_URL}/gradio_api/file=${o.path}` : "");
    return url ? [{ url, name: o.orig_name || o.path?.split("/").pop() || "audio.flac" }] : [];
  });
}

export type Take = FileOut & { id: string };

export async function generateTakes(
  brief: Brief,
  seconds: number,
  onStatus: OnStatus,
): Promise<Take[]> {
  const takes = takesFor(seconds);
  const [out, info] = await call(
    "generate",
    [brief.caption, brief.bpm, brief.key, seconds, takes, true, -1],
    onStatus,
  );
  const ids = ((info as { takes?: string[] } | null)?.takes ?? []) as string[];
  return files(out).map((f, i) => ({ ...f, id: ids[i] ?? "" }));
}

export type EngineStem = FileOut & { source: string; role: "drums" | "bass" | "music" };

/** HT-Demucs sources mapped to SayMaster roles. Vocals stay in "music": instrumentals have none, but synth leads can land there. */
export const SOURCE_ROLE: Record<string, EngineStem["role"]> = {
  drums: "drums",
  bass: "bass",
  other: "music",
  vocals: "music",
  guitar: "music",
  piano: "music",
};

export async function separateTake(takeId: string, onStatus: OnStatus): Promise<EngineStem[]> {
  const [out, info] = await call("separate", [takeId], onStatus);
  const sources = ((info as { stems?: string[] } | null)?.stems ?? []) as string[];
  return files(out).map((f, i) => {
    const source =
      sources[i] ??
      f.name
        .replace(/\.\w+$/, "")
        .split("-")
        .pop() ??
      "other";
    return { ...f, source, role: SOURCE_ROLE[source] ?? "music" };
  });
}
