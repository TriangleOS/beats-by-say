/**
 * Studio engine: recorded-quality instrumentals from Suno through sunoapi.org (the same service as the
 * TriangleOS/sunoapi project). Every call is a short request; the browser polls, because the Worker
 * has a 10 ms CPU budget. The key (`SUNOAPI_KEY`) lives in the Worker's settings, never in the browser.
 *
 * Jobs are logged in `beatsbysay_studio_jobs` with the artist's own token, so each artist can only poll
 * their own tasks and has a daily cap (`STUDIO_DAILY_LIMIT`, default 5 beats and 5 stem splits).
 */
import type { BeatSpec } from "./beat-spec";
import { presetForGenre, type PresetName } from "./saymaster/presets";

const API = "https://api.sunoapi.org/api/v1";
const env = (k: string) => process.env[k] || undefined;

/** Where the music service posts task updates. We poll instead, so the route only acknowledges. */
export function callbackUrl() {
  return `${env("PUBLIC_ORIGIN") || "https://beatsbysay.com"}/api/public/studio/callback`;
}

export function studioEnabled() {
  return !!env("SUNOAPI_KEY");
}

type Envelope<T> = { code: number; msg?: string; data?: T };

async function suno<T>(path: string, init?: { body?: unknown }): Promise<T> {
  const key = env("SUNOAPI_KEY");
  if (!key) throw new Error("The studio engine isn't switched on yet.");
  const res = await fetch(`${API}${path}`, {
    method: init?.body ? "POST" : "GET",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: init?.body ? JSON.stringify(init.body) : undefined,
  });
  const json = (await res.json().catch(() => ({}))) as Envelope<T>;
  if (!res.ok || json.code !== 200 || json.data === undefined) {
    if (json.code === 429 || res.status === 429)
      throw new Error("The studio engine is out of credits right now. Try the synth engine.");
    if (json.code === 430) throw new Error("The studio engine is busy. Try again in a minute.");
    throw new Error(`Studio engine: ${json.msg || `request failed (${res.status})`}`);
  }
  return json.data;
}

/* --------------------------------------------------------------- the brief */

/** Production language per SayMaster preset: what a session producer would ask for. */
const SOUND: Record<PresetName, string> = {
  trap: "hard-hitting 808 bass with long sustain, crisp rolling hi-hats, snappy claps, dark atmospheric pads",
  drill:
    "UK drill groove, sliding 808 glides, syncopated off-grid hats, snare on 3, ominous minor strings and piano",
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
  "instrumental, no vocals, studio-quality mix, clean low end, punchy transients, wide stereo image, room left for a lead vocal";
const NEGATIVE =
  "vocals, singing, rapping, spoken word, choir, vocal chops, muffled, distorted, clipping, low quality, out of tune, noise";

const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1).trimEnd() : s);

export function studioBrief(prompt: string, spec?: BeatSpec | null) {
  const preset = presetForGenre(spec?.genre || prompt);
  const parts = [
    spec?.genre,
    spec ? `${spec.bpm} BPM` : null,
    spec?.key,
    spec?.mood,
    SOUND[preset],
    QUALITY,
  ].filter(Boolean);
  return {
    preset,
    title: clip(spec?.title || "Beats by Say beat", 80),
    style: clip(`${parts.join(", ")}. Brief: ${prompt}`, 1000),
    negativeTags: NEGATIVE,
  };
}

/* ------------------------------------------------------------------- tasks */

export async function startInstrumental(
  brief: ReturnType<typeof studioBrief>,
  callBackUrl: string,
) {
  const data = await suno<{ taskId: string }>("/generate", {
    body: {
      customMode: true,
      instrumental: true,
      model: env("SUNO_MODEL") || "V5",
      style: brief.style,
      title: brief.title,
      negativeTags: brief.negativeTags,
      styleWeight: 0.75,
      weirdnessConstraint: 0.35,
      callBackUrl,
    },
  });
  return data.taskId;
}

export type StudioTrack = { id: string; audioUrl: string; title: string; duration: number | null };
export type TaskState = "pending" | "partial" | "done" | "failed";

const failed = (s: string | undefined) => !!s && /FAIL|ERROR|EXCEPTION/.test(s);

export async function instrumentalStatus(taskId: string) {
  const data = await suno<{
    status?: string;
    errorMessage?: string | null;
    response?: {
      sunoData?: { id: string; audioUrl?: string; title?: string; duration?: number | null }[];
    } | null;
  }>(`/generate/record-info?taskId=${encodeURIComponent(taskId)}`);
  const tracks: StudioTrack[] = (data.response?.sunoData ?? [])
    .filter((t) => t.id && t.audioUrl)
    .map((t) => ({
      id: t.id,
      audioUrl: t.audioUrl!,
      title: t.title ?? "",
      duration: t.duration ?? null,
    }));
  const state: TaskState = failed(data.status)
    ? "failed"
    : data.status === "SUCCESS" && tracks.length
      ? "done"
      : tracks.length
        ? "partial"
        : "pending";
  return {
    state,
    tracks,
    error: state === "failed" ? data.errorMessage || data.status : undefined,
  };
}

export async function startStemSplit(taskId: string, audioId: string, callBackUrl: string) {
  const data = await suno<{ taskId: string }>("/vocal-removal/generate", {
    body: { taskId, audioId, type: "split_stem", callBackUrl },
  });
  return data.taskId;
}

/** Suno's instrument stems, grouped into SayMaster's roles. */
const STEM_ROLE = {
  drumsUrl: "drums",
  percussionUrl: "drums",
  bassUrl: "bass",
  keyboardUrl: "music",
  synthUrl: "music",
  guitarUrl: "music",
  stringsUrl: "music",
  brassUrl: "music",
  woodwindsUrl: "music",
  fxUrl: "music",
} as const;

export type StudioStem = { name: string; role: "drums" | "bass" | "music"; url: string };

export async function stemStatus(taskId: string) {
  const data = await suno<{
    successFlag?: string;
    errorMessage?: string | null;
    response?: Record<string, string | null | undefined> | null;
  }>(`/vocal-removal/record-info?taskId=${encodeURIComponent(taskId)}`);
  const r = data.response ?? {};
  const stems: StudioStem[] = Object.entries(STEM_ROLE).flatMap(([k, role]) =>
    r[k] ? [{ name: k.replace(/Url$/, ""), role, url: r[k]! }] : [],
  );
  const state: TaskState = failed(data.successFlag)
    ? "failed"
    : data.successFlag === "SUCCESS"
      ? "done"
      : "pending";
  return {
    state,
    stems,
    error: state === "failed" ? data.errorMessage || data.successFlag : undefined,
  };
}

/* ------------------------------------------------------- per-artist ledger */

function rest(token: string) {
  const url = process.env["SUPABASE_URL"] || import.meta.env.VITE_SUPABASE_URL;
  const key =
    process.env["SUPABASE_PUBLISHABLE_KEY"] || import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  return async (path: string, init?: RequestInit) => {
    const res = await fetch(`${url}/rest/v1/${path}`, {
      ...init,
      headers: {
        apikey: key,
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        ...(init?.headers ?? {}),
      },
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      if (/beatsbysay_studio_jobs|PGRST205|42P01/.test(text))
        throw new Error("The studio engine is still being set up. Try the synth engine for now.");
      throw new Error("Couldn't check your studio usage. Try again.");
    }
    return res;
  };
}

type Kind = "generate" | "stems";

export async function checkAllowance(token: string, kind: Kind) {
  const limit = Number(env("STUDIO_DAILY_LIMIT") ?? "5");
  const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const res = await rest(token)(
    `beatsbysay_studio_jobs?select=id&kind=eq.${kind}&created_at=gte.${encodeURIComponent(since)}`,
    { headers: { Prefer: "count=exact", Range: "0-0" } },
  );
  const used = Number(res.headers.get("content-range")?.split("/")[1] ?? "0");
  if (used >= limit)
    throw new Error(
      kind === "generate"
        ? `You've made ${limit} studio-engine beats in the last 24 hours. The synth engine is unlimited.`
        : `You've split ${limit} beats into stems in the last 24 hours. You can still master the full mix.`,
    );
}

export async function logJob(
  token: string,
  userId: string,
  row: { task_id: string; kind: Kind; parent_task_id?: string; prompt?: string },
) {
  await rest(token)("beatsbysay_studio_jobs", {
    method: "POST",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({ user_id: userId, ...row }),
  });
}

/** The artist's own job row for a task, or null (RLS hides everyone else's). */
export async function ownJob(token: string, taskId: string, kind: Kind) {
  const res = await rest(token)(
    `beatsbysay_studio_jobs?select=task_id,parent_task_id&kind=eq.${kind}&task_id=eq.${encodeURIComponent(taskId)}`,
  );
  const rows = (await res.json()) as { task_id: string; parent_task_id: string | null }[];
  return rows[0] ?? null;
}

export async function stemJobFor(token: string, parentTaskId: string) {
  const res = await rest(token)(
    `beatsbysay_studio_jobs?select=task_id&kind=eq.stems&parent_task_id=eq.${encodeURIComponent(parentTaskId)}&limit=1`,
  );
  const rows = (await res.json()) as { task_id: string }[];
  return rows[0]?.task_id ?? null;
}

/* ------------------------------------------------------------ audio proxy */

/** Hosts the music service serves audio from. The proxy refuses anything else. */
const AUDIO_HOSTS = [
  /(^|\.)aiquickdraw\.com$/,
  /(^|\.)suno\.(ai|com)$/,
  /(^|\.)api\.box$/,
  /(^|\.)redpandaai\.co$/,
];

export function allowedAudioUrl(raw: string): URL | null {
  try {
    const u = new URL(raw);
    return u.protocol === "https:" && AUDIO_HOSTS.some((h) => h.test(u.hostname)) ? u : null;
  } catch {
    return null;
  }
}
