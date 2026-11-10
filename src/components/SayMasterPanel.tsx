import { useEffect, useState } from "react";
import { Download, Loader2, SlidersHorizontal } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { saveBlob } from "@/lib/render";
import type { Delivery, Job } from "@/lib/saymaster/client";
import { PRESET_NAMES, PRESETS, type PresetName } from "@/lib/saymaster/presets";

const VERSION_LABEL: Record<string, string> = {
  "beat-vocal-ready": "Vocal-ready beat",
  "beat-clean": "Clean beat",
  main: "Main",
  instrumental: "Instrumental",
  acapella: "Acapella",
  "tv-mix": "TV mix",
  master: "Master",
};

type Props = {
  title: string;
  description: string;
  action: string;
  defaultPreset: PresetName;
  /** Builds the job (renders stems, decodes uploads). Optionally returns the unprocessed audio as a WAV for A/B. */
  prepare: (
    preset: PresetName,
    onStage: (stage: string) => void,
  ) => Promise<{ job: Job; before?: Blob }>;
  disabled?: boolean;
  /** Extra inputs (vocal uploads, etc.) shown above the button. */
  children?: React.ReactNode;
};

export function SayMasterPanel({
  title,
  description,
  action,
  defaultPreset,
  prepare,
  disabled,
  children,
}: Props) {
  const [preset, setPreset] = useState<PresetName>(defaultPreset);
  const [busy, setBusy] = useState(false);
  const [stage, setStage] = useState("");
  const [fraction, setFraction] = useState(0);
  const [result, setResult] = useState<{
    delivery: Delivery;
    name: string;
    urls: { name: string; url: string }[];
    before?: string;
  } | null>(null);

  useEffect(() => setPreset(defaultPreset), [defaultPreset]);
  useEffect(
    () => () => {
      result?.urls.forEach((u) => URL.revokeObjectURL(u.url));
      if (result?.before) URL.revokeObjectURL(result.before);
    },
    [result],
  );

  async function run() {
    setBusy(true);
    setResult(null);
    setFraction(0);
    try {
      const { job, before } = await prepare(preset, (s) => setStage(s));
      const { runSayMaster } = await import("@/lib/saymaster/client");
      const delivery = await runSayMaster(job, (s, f) => {
        setStage(s);
        setFraction(f);
      });
      setResult({
        delivery,
        name: job.name,
        urls: delivery.previews.map((p) => ({
          name: p.name,
          url: URL.createObjectURL(new Blob([p.wav as BlobPart], { type: "audio/wav" })),
        })),
        before: before ? URL.createObjectURL(before) : undefined,
      });
      toast.success("Mastered. Listen below, then download the full pack.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "SayMaster couldn't finish.");
    } finally {
      setBusy(false);
      setStage("");
    }
  }

  const before = result?.delivery.report.before;
  const after = result?.delivery.report.after;

  return (
    <section className="mt-6 border border-primary/40 bg-card p-5 md:p-7">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-2xl">
          <p className="section-label inline-flex items-center gap-2">
            <SlidersHorizontal className="h-3.5 w-3.5 text-primary" /> SayMaster
          </p>
          <h2 className="mt-2 text-2xl">{title}</h2>
          <p className="mt-2 text-sm text-muted-foreground">{description}</p>
        </div>
        <label className="text-xs text-muted-foreground uppercase">
          Sound
          <select
            value={preset}
            onChange={(e) => setPreset(e.target.value as PresetName)}
            disabled={busy}
            className="mt-1 block rounded-sm border border-input bg-background px-3 py-2 text-sm normal-case text-foreground outline-none focus:ring-2 focus:ring-ring"
          >
            {PRESET_NAMES.map((p) => (
              <option key={p} value={p}>
                {PRESETS[p].label}
              </option>
            ))}
          </select>
        </label>
      </div>

      {children && <div className="mt-5">{children}</div>}

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <Button
          type="button"
          onClick={() => void run()}
          disabled={busy || disabled}
          className="h-10 rounded-sm px-5 font-extrabold"
        >
          {busy ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <SlidersHorizontal className="h-4 w-4" />
          )}
          {busy ? "Working..." : action}
        </Button>
        {busy && (
          <div className="min-w-48 flex-1">
            <p className="text-xs text-muted-foreground">{stage}</p>
            <div className="mt-1 h-1.5 w-full bg-border">
              <div
                className="h-full bg-primary transition-all"
                style={{ width: `${Math.round(fraction * 100)}%` }}
              />
            </div>
          </div>
        )}
      </div>
      <p className="mt-3 text-xs text-muted-foreground">
        Runs on your device; nothing is uploaded. A beat takes seconds; a full song takes a minute
        or two.
      </p>

      {result && after && (
        <div className="mt-6 border-t border-border pt-5">
          <div className="grid gap-4 md:grid-cols-2">
            {result.before && (
              <div>
                <p className="text-xs text-muted-foreground uppercase">Before</p>
                <audio controls src={result.before} className="mt-1 w-full" />
              </div>
            )}
            {result.urls.map((u) => (
              <div key={u.name}>
                <p className="text-xs text-primary uppercase">{VERSION_LABEL[u.name] ?? u.name}</p>
                <audio controls src={u.url} className="mt-1 w-full" />
              </div>
            ))}
          </div>

          <table className="mt-5 w-full max-w-lg text-left text-sm">
            <thead className="text-xs text-muted-foreground uppercase">
              <tr>
                <th className="py-1 font-normal">Measured</th>
                {before && <th className="py-1 font-normal">Before</th>}
                <th className="py-1 font-normal">After</th>
              </tr>
            </thead>
            <tbody>
              {(
                [
                  ["Loudness (LUFS)", before?.lufs, after.lufs],
                  ["True peak (dBTP)", before?.truePeakDb, after.truePeakDb],
                  ["Crest (dB)", before?.crestDb, after.crestDb],
                ] as const
              ).map(([label, b, a]) => (
                <tr key={label} className="border-t border-border">
                  <td className="py-1.5 text-muted-foreground">{label}</td>
                  {before && <td className="py-1.5">{b}</td>}
                  <td className="py-1.5 text-primary">{a}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {result.delivery.report.master.notes.length > 0 && (
            <p className="mt-3 text-xs text-muted-foreground">
              {result.delivery.report.master.notes.join(" ")}
            </p>
          )}

          <Button
            type="button"
            className="mt-5 rounded-sm"
            onClick={() =>
              saveBlob(
                new Blob([result.delivery.zip as BlobPart], { type: "application/zip" }),
                `${result.name}-saymaster.zip`,
              )
            }
          >
            <Download className="h-4 w-4" /> Download the pack (24-bit and 16-bit WAV, stems,
            report)
          </Button>
        </div>
      )}
    </section>
  );
}
