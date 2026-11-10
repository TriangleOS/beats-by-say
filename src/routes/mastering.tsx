import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { FileAudio, X } from "lucide-react";
import { SayMasterPanel } from "@/components/SayMasterPanel";
import { VocalPicker } from "@/components/VocalPicker";
import { MASTER_RATE, slugify } from "@/lib/render";

export const Route = createFileRoute("/mastering")({
  head: () => ({
    meta: [
      { title: "SayMaster mastering | Beats by Say" },
      {
        name: "description",
        content:
          "SayMaster masters beats and finishes records with your vocals: stem processing, vocal chain, mix and a true-peak master, with main, instrumental, acapella and TV versions. Runs in your browser, free.",
      },
      { property: "og:title", content: "SayMaster mastering | Beats by Say" },
      {
        property: "og:description",
        content: "Mix and master beats and full songs in your browser.",
      },
      { property: "og:type", content: "website" },
    ],
  }),
  component: Mastering,
});

function BeatPicker({
  file,
  onChange,
  label,
}: {
  file: File | null;
  onChange: (f: File | null) => void;
  label: string;
}) {
  return (
    <div className="border border-border bg-background p-4">
      <label className="flex cursor-pointer items-center gap-2 text-sm font-bold">
        <FileAudio className="h-4 w-4 text-primary" /> {label}
        <input
          type="file"
          accept="audio/*,.wav,.aif,.aiff,.flac,.mp3,.m4a"
          className="sr-only"
          onChange={(e) => {
            onChange(e.target.files?.[0] ?? null);
            e.target.value = "";
          }}
        />
        <span className="ml-auto rounded-sm border border-border px-2 py-1 text-xs text-muted-foreground hover:border-primary hover:text-primary">
          Choose file
        </span>
      </label>
      {file && (
        <p className="mt-2 flex items-center gap-2 text-xs">
          <span className="truncate">{file.name}</span>
          <button
            type="button"
            aria-label="Remove file"
            onClick={() => onChange(null)}
            className="ml-auto text-muted-foreground hover:text-primary"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </p>
      )}
    </div>
  );
}

const baseName = (f: File) => slugify(f.name.replace(/\.[^.]+$/, ""));

function Mastering() {
  const [track, setTrack] = useState<File | null>(null);
  const [beat, setBeat] = useState<File | null>(null);
  const [leads, setLeads] = useState<File[]>([]);
  const [backs, setBacks] = useState<File[]>([]);
  const [bpm, setBpm] = useState(90);

  return (
    <div className="mx-auto max-w-5xl px-4 py-12 pb-24 sm:px-6">
      <p className="section-label">SayMaster</p>
      <h1 className="mt-2 text-4xl md:text-5xl">
        Mix and master, <span className="text-primary">in your browser</span>
      </h1>
      <p className="mt-3 max-w-2xl text-sm text-muted-foreground">
        SayMaster is the mixing and mastering engine behind every Beats by Say download. Beats made
        in the{" "}
        <Link to="/studio" className="text-primary underline">
          studio
        </Link>{" "}
        and songs from the{" "}
        <Link to="/songwriter" className="text-primary underline">
          songwriter
        </Link>{" "}
        are mastered from their separate stems. Here you can also use it on audio made anywhere
        else. It runs on your device: your files are not uploaded.
      </p>

      <div className="mt-6 grid gap-3 text-sm sm:grid-cols-3">
        {[
          [
            "Loudness that fits",
            "Mastered to a loudness target per genre, measured to the ITU-R BS.1770 standard streaming services use.",
          ],
          [
            "No clipping in the codec",
            "A look-ahead true-peak limiter keeps peaks between samples under the ceiling, so MP3 and AAC encodes don't distort.",
          ],
          [
            "Every version a label asks for",
            "Main, instrumental, acapella and TV mix, mastered with identical settings, plus stems and a measurement report.",
          ],
        ].map(([t, d]) => (
          <div key={t} className="border border-border bg-card p-4">
            <h3 className="text-lg">{t}</h3>
            <p className="mt-1 text-muted-foreground">{d}</p>
          </div>
        ))}
      </div>

      <SayMasterPanel
        title="Master a track"
        description="Upload a finished beat or mix (WAV is best). SayMaster cleans it up, balances the tone against the genre, compresses each frequency band, restores top-end air, keeps the low end mono and limits it to release loudness."
        action="Master the track"
        defaultPreset="streaming"
        disabled={!track}
        prepare={async (preset) => {
          const { decodeFile } = await import("@/lib/saymaster/client");
          const audio = await decodeFile(track!, MASTER_RATE);
          return {
            job: { kind: "master", name: baseName(track!), sr: MASTER_RATE, preset, audio },
          };
        }}
      >
        <BeatPicker file={track} onChange={setTrack} label="Track to master" />
      </SayMasterPanel>

      <SayMasterPanel
        title="Finish a record"
        description="Upload the instrumental and your vocal takes, each exported from the start of the song so they line up. SayMaster processes the vocals, mixes them over the beat (ducking the beat only while you sing) and masters the song."
        action="Finish the record"
        defaultPreset="trap"
        disabled={!beat || leads.length === 0}
        prepare={async (preset, onStage) => {
          const { decodeFile } = await import("@/lib/saymaster/client");
          onStage("Reading your files");
          const mix = await decodeFile(beat!, MASTER_RATE);
          const leadAudio = await Promise.all(leads.map((f) => decodeFile(f, MASTER_RATE)));
          const backAudio = await Promise.all(backs.map((f) => decodeFile(f, MASTER_RATE)));
          return {
            job: {
              kind: "song",
              name: baseName(beat!),
              sr: MASTER_RATE,
              preset,
              bpm,
              stems: { mix },
              leads: leadAudio,
              backs: backAudio,
            },
          };
        }}
      >
        <div className="grid gap-3">
          <BeatPicker file={beat} onChange={setBeat} label="Instrumental" />
          <VocalPicker leads={leads} backs={backs} onLeads={setLeads} onBacks={setBacks} />
          <label className="text-xs text-muted-foreground uppercase">
            Tempo (BPM), sets the vocal delay
            <input
              type="number"
              min={50}
              max={200}
              value={bpm}
              onChange={(e) => setBpm(Math.max(50, Math.min(200, Number(e.target.value) || 90)))}
              className="mt-1 block w-28 rounded-sm border border-input bg-background px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring"
            />
          </label>
        </div>
      </SayMasterPanel>
    </div>
  );
}
