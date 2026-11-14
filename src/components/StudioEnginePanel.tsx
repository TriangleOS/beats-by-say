import { useEffect, useState } from "react";
import { Download, Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { SayMasterPanel } from "@/components/SayMasterPanel";
import type { BeatSpec } from "@/lib/beat-spec";
import { MASTER_RATE, saveBlob, slugify } from "@/lib/render";
import type { Stereo } from "@/lib/saymaster/dsp";
import type { RoleStems } from "@/lib/saymaster/production";
import {
  LENGTHS,
  engineBrief,
  generateTakes,
  separateTake,
  takesFor,
  type Take,
} from "@/lib/studio-engine";

async function fetchAudio(url: string): Promise<Blob> {
  const res = await fetch(url);
  if (!res.ok) throw new Error("Couldn't download the audio from the studio engine.");
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
 * Recorded-quality takes for one brief from the free studio engine (ACE-Step 1.5 on Hugging Face), then
 * stems (HT-Demucs) and SayMaster's mix and master, all without an account or a paid key.
 */
export function StudioEnginePanel({
  job,
  spec,
}: {
  job: { id: number; prompt: string };
  spec: BeatSpec;
}) {
  const [seconds, setSeconds] = useState<number>(60);
  const [takes, setTakes] = useState<Take[]>([]);
  const [chosen, setChosen] = useState<string | null>(null);
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const brief = engineBrief(job.prompt, spec);

  async function record(length = seconds) {
    setBusy(true);
    setFailed(null);
    setTakes([]);
    setChosen(null);
    setStatus("Connecting to the studio engine");
    try {
      const out = await generateTakes(brief, length, setStatus);
      if (!out.length) throw new Error("The studio engine returned no audio.");
      setTakes(out);
      setChosen(out[0]!.url);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "The studio engine is unavailable.";
      setFailed(msg);
      toast.error(msg);
    } finally {
      setBusy(false);
      setStatus("");
    }
  }

  useEffect(() => {
    void record();
    // A new brief starts a new recording; changing the length waits for "Record again".
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [job.id]);

  const take = takes.find((t) => t.url === chosen) ?? null;

  async function stems(onStage: (s: string) => void): Promise<RoleStems | null> {
    if (!take?.id) return null;
    try {
      onStage("Splitting into stems");
      const parts = await separateTake(take.id, (s) =>
        onStage(`Splitting into stems: ${s.toLowerCase()}`),
      );
      const out: RoleStems = {};
      let i = 0;
      for (const p of parts) {
        onStage(`Downloading stems (${++i}/${parts.length})`);
        out[p.role] = add(out[p.role], await decode(await fetchAudio(p.url), `${p.source}.flac`));
      }
      return Object.keys(out).length ? out : null;
    } catch (e) {
      toast.message(
        `Mastering the full take instead of stems: ${e instanceof Error ? e.message : "stems unavailable"}`,
      );
      return null;
    }
  }

  return (
    <section className="mt-6 border border-primary/40 bg-card p-5 md:p-7">
      <p className="section-label">Studio engine</p>
      <h2 className="mt-2 text-2xl">Recorded-quality takes</h2>
      <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
        ACE-Step 1.5, an open-source music model, records full instrumentals from your brief on free
        Hugging Face GPUs. Pick a take, and SayMaster splits it into stems (HT-Demucs), mixes them
        with room for your vocal and masters it. Free GPU time is limited per connection each day;
        the synth sketch is always available.
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-2 text-xs">
        <span className="text-muted-foreground">Length</span>
        {LENGTHS.map((s) => (
          <button
            key={s}
            type="button"
            disabled={busy}
            onClick={() => setSeconds(s)}
            className={`rounded-sm border px-3 py-1.5 ${seconds === s ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground"}`}
          >
            {s}s{takesFor(s) === 1 ? " · 1 take" : ""}
          </button>
        ))}
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={busy}
          onClick={() => void record()}
        >
          <RefreshCw className="h-3.5 w-3.5" /> Record again
        </Button>
      </div>

      {busy && (
        <p className="mt-5 flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> {status || "Recording"}...
        </p>
      )}
      {failed && !busy && <p className="mt-5 text-sm text-destructive">{failed}</p>}

      {takes.length > 0 && (
        <div className="mt-5 grid gap-3 md:grid-cols-2">
          {takes.map((t, i) => (
            <label
              key={t.url}
              className={`cursor-pointer border p-4 ${chosen === t.url ? "border-primary bg-primary/5" : "border-border"}`}
            >
              <span className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="studio-take"
                  checked={chosen === t.url}
                  onChange={() => setChosen(t.url)}
                />
                Take {i + 1}
              </span>
              <audio className="mt-3 w-full" controls preload="metadata" src={t.url} />
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="mt-3"
                onClick={async () => {
                  try {
                    saveBlob(await fetchAudio(t.url), `${slugify(spec.title)}-take-${i + 1}.flac`);
                  } catch (e) {
                    toast.error(e instanceof Error ? e.message : "Download failed.");
                  }
                }}
              >
                <Download className="h-3.5 w-3.5" /> Download take (FLAC)
              </Button>
            </label>
          ))}
        </div>
      )}

      {take && (
        <SayMasterPanel
          title="Stem mix and master"
          description="The chosen take is split into drums, bass and music stems. Each is processed on its own, mixed with a gap left for your vocal and mastered with a true-peak limiter. You get a vocal-ready beat, a clean version, the stems and a measurement report."
          action="Mix and master this take"
          defaultPreset={brief.preset}
          prepare={async (p, onStage) => {
            onStage("Downloading the take");
            const original = await fetchAudio(take.url);
            const mix = await decode(original, "take.flac");
            const split = await stems(onStage);
            return {
              before: original,
              job: {
                kind: "beat",
                name: slugify(spec.title),
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
