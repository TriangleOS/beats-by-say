import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Download, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { SayMasterPanel } from "@/components/SayMasterPanel";
import { MASTER_RATE, saveBlob, slugify } from "@/lib/render";
import type { Stereo } from "@/lib/saymaster/dsp";
import type { PresetName } from "@/lib/saymaster/presets";
import type { RoleStems } from "@/lib/saymaster/production";
import { startStudioStems, studioBeatStatus, studioStemStatus } from "@/lib/studio.functions";

type Track = { id: string; audioUrl: string; title: string; duration: number | null };

const proxied = (url: string) => `/api/studio/audio?u=${encodeURIComponent(url)}`;
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function fetchAudio(url: string): Promise<Blob> {
  const res = await fetch(proxied(url));
  if (!res.ok) throw new Error("Couldn't download the audio.");
  return res.blob();
}

async function decode(blob: Blob, name: string): Promise<Stereo> {
  const { decodeFile } = await import("@/lib/saymaster/client");
  return decodeFile(new File([blob], name), MASTER_RATE);
}

function add(a: Stereo | undefined, b: Stereo): Stereo {
  if (!a) return b;
  const n = Math.max(a[0].length, b[0].length);
  const out: Stereo = [new Float32Array(n), new Float32Array(n)];
  for (const s of [a, b])
    for (let c = 0; c < 2; c++) for (let i = 0; i < s[c]!.length; i++) out[c]![i]! += s[c]![i]!;
  return out;
}

/**
 * The studio engine's takes for one brief: the model records two full instrumentals, the artist picks one,
 * and SayMaster splits it into instrument stems, mixes them with room for the vocal and masters it.
 */
export function StudioEnginePanel({
  taskId,
  title,
  token,
  preset,
}: {
  taskId: string;
  title: string;
  token: string;
  preset: PresetName;
}) {
  const beatStatus = useServerFn(studioBeatStatus);
  const stemStart = useServerFn(startStudioStems);
  const stemStatus = useServerFn(studioStemStatus);

  const [tracks, setTracks] = useState<Track[]>([]);
  const [state, setState] = useState<"pending" | "partial" | "done" | "failed">("pending");
  const [chosen, setChosen] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const tokenRef = useRef(token);
  tokenRef.current = token;

  useEffect(() => {
    let live = true;
    setTracks([]);
    setState("pending");
    setChosen(null);
    const started = Date.now();
    (async () => {
      // Instrumentals usually take one to three minutes; give up after eight.
      while (live && Date.now() - started < 8 * 60_000) {
        try {
          const r = await beatStatus({ data: { token: tokenRef.current, taskId } });
          if (!live) return;
          setTracks(r.tracks);
          setState(r.state);
          if (r.tracks[0]) setChosen((c) => c ?? r.tracks[0]!.id);
          if (r.state === "failed") {
            toast.error(`The studio engine couldn't make this one: ${r.error ?? "unknown error"}`);
            return;
          }
          if (r.state === "done") return;
        } catch (e) {
          if (!live) return;
          toast.error(e instanceof Error ? e.message : "Couldn't check the studio engine.");
          setState("failed");
          return;
        }
        await wait(6000);
        if (live) setElapsed(Math.round((Date.now() - started) / 1000));
      }
      if (live && Date.now() - started >= 8 * 60_000) {
        setState("failed");
        toast.error("The studio engine is taking too long. Try again or use the synth engine.");
      }
    })();
    return () => {
      live = false;
    };
  }, [taskId, beatStatus]);

  const track = tracks.find((t) => t.id === chosen) ?? null;

  async function stems(onStage: (s: string) => void): Promise<RoleStems | null> {
    if (!track) return null;
    try {
      onStage("Splitting into instrument stems");
      const { stemTaskId } = await stemStart({
        data: { token: tokenRef.current, taskId, audioId: track.id },
      });
      const started = Date.now();
      while (Date.now() - started < 6 * 60_000) {
        const r = await stemStatus({ data: { token: tokenRef.current, stemTaskId } });
        if (r.state === "failed") throw new Error(r.error ?? "stem split failed");
        if (r.state === "done" && r.stems.length) {
          const out: RoleStems = {};
          let i = 0;
          for (const s of r.stems) {
            onStage(`Downloading stems (${++i}/${r.stems.length})`);
            const audio = await decode(await fetchAudio(s.url), `${s.name}.mp3`);
            out[s.role] = add(out[s.role], audio);
          }
          return out;
        }
        onStage(`Splitting into instrument stems (${Math.round((Date.now() - started) / 1000)}s)`);
        await wait(6000);
      }
      throw new Error("stem split took too long");
    } catch (e) {
      toast.message(
        `Mastering the full mix instead of stems (${e instanceof Error ? e.message : "stems unavailable"}).`,
      );
      return null;
    }
  }

  return (
    <section className="mt-6 border border-primary/40 bg-card p-5 md:p-7">
      <p className="section-label">Studio engine</p>
      <h2 className="mt-2 text-2xl">Recorded-quality takes</h2>
      <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
        Suno (a music model, reached through sunoapi.org) records full instrumentals from your brief
        (two takes, usually ready in one to three minutes). Pick a take, then SayMaster splits it
        into instrument stems, mixes them with room for your vocal and masters it.
      </p>

      {state !== "failed" && !tracks.length && (
        <p className="mt-5 flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Recording your takes
          {elapsed ? ` (${elapsed}s)` : ""}...
        </p>
      )}

      {tracks.length > 0 && (
        <div className="mt-5 grid gap-3 md:grid-cols-2">
          {tracks.map((t, i) => (
            <label
              key={t.id}
              className={`cursor-pointer border p-4 ${chosen === t.id ? "border-primary bg-primary/5" : "border-border"}`}
            >
              <span className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="studio-take"
                  checked={chosen === t.id}
                  onChange={() => setChosen(t.id)}
                />
                Take {i + 1}
                {t.duration
                  ? ` · ${Math.floor(t.duration / 60)}:${String(Math.round(t.duration % 60)).padStart(2, "0")}`
                  : ""}
              </span>
              <audio className="mt-3 w-full" controls preload="none" src={proxied(t.audioUrl)} />
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="mt-3"
                onClick={async () => {
                  try {
                    saveBlob(await fetchAudio(t.audioUrl), `${slugify(title)}-take-${i + 1}.mp3`);
                  } catch (e) {
                    toast.error(e instanceof Error ? e.message : "Download failed.");
                  }
                }}
              >
                <Download className="h-3.5 w-3.5" /> Download take
              </Button>
            </label>
          ))}
          {state === "partial" && (
            <p className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Second take still recording...
            </p>
          )}
        </div>
      )}

      {track && (
        <SayMasterPanel
          title="Stem mix and master"
          description="The chosen take is split into drums, bass and music stems. Each is processed on its own, mixed with a gap left for your vocal and mastered with a true-peak limiter. You get a vocal-ready beat, a clean version, the stems and a measurement report."
          action="Mix and master this take"
          defaultPreset={preset}
          prepare={async (p, onStage) => {
            onStage("Downloading the take");
            const original = await fetchAudio(track.audioUrl);
            const mix = await decode(original, "take.mp3");
            const split = await stems(onStage);
            return {
              before: original,
              job: {
                kind: "beat",
                name: slugify(title),
                sr: MASTER_RATE,
                preset: p,
                stems: split ?? { mix },
                reference: mix,
              },
            };
          }}
        />
      )}
    </section>
  );
}
