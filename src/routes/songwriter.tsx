import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
import { Download, Play, Square, Wand2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { BeatPlayer } from "@/lib/audio-engine";
import { FALLBACK_SPEC, type BeatSpec } from "@/lib/beat-spec";
import { generateBeat } from "@/lib/beats.functions";
import { arrangeSong, defaultArrangement } from "@/lib/songwriter.functions";
import {
  MASTER_RATE,
  renderSongRoleStems,
  renderSongWav,
  saveBlob,
  slugify,
  songLengthSeconds,
  type SongPart,
  type SongSection,
} from "@/lib/render";
import { SayMasterPanel } from "@/components/SayMasterPanel";
import { VocalPicker } from "@/components/VocalPicker";
import { dbToGain, peak, scale, sum } from "@/lib/saymaster/dsp";
import { presetForGenre } from "@/lib/saymaster/presets";
import { encodeWav } from "@/lib/saymaster/wav";

export const Route = createFileRoute("/songwriter")({
  head: () => ({
    meta: [
      { title: "Songwriter | Beats by Say" },
      {
        name: "description",
        content:
          "Turn a beat into a full instrumental song — intro, verses, choruses and outro — then export the finished track ready for your vocals.",
      },
      { property: "og:title", content: "Songwriter | Beats by Say" },
      {
        property: "og:description",
        content: "Arrange a full instrumental song section by section and export it for the studio.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Songwriter,
});

const PARTS: { key: SongPart; label: string }[] = [
  { key: "drums", label: "Drums" },
  { key: "hats", label: "Hats" },
  { key: "bass", label: "Bass" },
  { key: "chords", label: "Chords" },
  { key: "melody", label: "Melody" },
];

type SavedBeat = { id: string; title: string; spec: BeatSpec };

function Songwriter() {
  const generate = useServerFn(generateBeat);
  const arrange = useServerFn(arrangeSong);
  const { user, session } = useAuth();

  const [brief, setBrief] = useState("");
  const [spec, setSpec] = useState<BeatSpec>(FALLBACK_SPEC);
  const [sections, setSections] = useState<SongSection[]>(defaultArrangement);
  const [saved, setSaved] = useState<SavedBeat[]>([]);
  const [working, setWorking] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [player] = useState(() => new BeatPlayer());
  const [leads, setLeads] = useState<File[]>([]);
  const [backs, setBacks] = useState<File[]>([]);

  useEffect(() => () => player.stop(), [player]);

  useEffect(() => {
    if (!user) {
      setSaved([]);
      return;
    }
    void (async () => {
      const { data } = await supabase
        .from("beatsbysay_beats")
        .select("id,title,spec")
        .order("created_at", { ascending: false })
        .limit(30);
      setSaved((data ?? []) as unknown as SavedBeat[]);
    })();
  }, [user]);

  const lengthLabel = useMemo(() => {
    const seconds = Math.round(songLengthSeconds(spec, sections));
    return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
  }, [spec, sections]);

  const totalBars = sections.reduce((sum, s) => sum + s.bars, 0);

  async function buildSong() {
    if (brief.trim().length < 2) {
      toast.error("Describe the song you want first.");
      return;
    }
    if (!session) {
      toast.error("Sign in (free) to write songs.");
      return;
    }
    setWorking("song");
    try {
      const beat = await generate({ data: { prompt: brief, token: session.access_token } });
      const nextSpec = beat.spec;
      setSpec(nextSpec);
      const result = await arrange({
        data: { brief, title: nextSpec.title, bpm: nextSpec.bpm, key: nextSpec.key, token: session.access_token },
      });
      setSections(result.sections);
      toast.success(`"${nextSpec.title}" arranged into ${result.sections.length} sections.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not build the song.");
    } finally {
      setWorking(null);
    }
  }

  async function rearrange() {
    if (!session) {
      toast.error("Sign in (free) to re-arrange with AI.");
      return;
    }
    setWorking("arrange");
    try {
      const result = await arrange({
        data: { brief: brief || spec.mood, title: spec.title, bpm: spec.bpm, key: spec.key, token: session.access_token },
      });
      setSections(result.sections);
      toast.success("New arrangement ready.");
    } finally {
      setWorking(null);
    }
  }

  function togglePart(index: number, part: SongPart) {
    setSections((prev) =>
      prev.map((s, i) => (i === index ? { ...s, parts: { ...s.parts, [part]: !s.parts[part] } } : s)),
    );
  }

  function setBars(index: number, bars: number) {
    setSections((prev) => prev.map((s, i) => (i === index ? { ...s, bars } : s)));
  }

  function addSection() {
    setSections((prev) => [
      ...prev,
      { name: `Section ${prev.length + 1}`, bars: 8, parts: { drums: true, hats: true, bass: true, chords: true, melody: true } },
    ]);
  }

  function removeSection(index: number) {
    setSections((prev) => prev.filter((_, i) => i !== index));
  }

  function togglePlay() {
    if (playing) {
      player.stop();
      setPlaying(false);
      return;
    }
    void player.play(spec);
    setPlaying(true);
  }

  async function exportSong() {
    if (sections.length === 0) {
      toast.error("Add at least one section.");
      return;
    }
    setWorking("export");
    try {
      const blob = await renderSongWav(spec, sections);
      saveBlob(blob, `${slugify(spec.title)}-full-song.wav`);
      toast.success("Full song downloaded. Record your vocals over it.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not render the song.");
    } finally {
      setWorking(null);
    }
  }

  return (
    <div>
      <div className="mx-auto max-w-7xl px-4 py-10 pb-24 sm:px-6">
        <p className="section-label">Songwriter</p>
        <h1 className="mt-2 text-4xl md:text-5xl">Build the whole song</h1>
        <p className="mt-3 max-w-2xl text-sm text-muted-foreground">
          Describe the record you hear. We write the beat, lay out the full structure (intro, verses,
          choruses, bridge, outro) and hand you one instrumental WAV to sing or rap over. You can edit every
          section before you download. Writing with AI needs a free account.
        </p>

        <div className="mt-6 grid gap-3 border border-border bg-card p-5 md:grid-cols-[1fr_auto]">
          <textarea
            value={brief}
            onChange={(e) => setBrief(e.target.value)}
            rows={3}
            placeholder="e.g. a slow, moody UK R&B record about late nights, big chorus, sparse verses"
            className="rounded-sm border border-input bg-background p-3 text-sm outline-none focus:ring-2 focus:ring-ring"
          />
          <Button
            type="button"
            onClick={() => void buildSong()}
            disabled={working !== null}
            className="h-full rounded-sm px-6"
          >
            <Wand2 className="h-4 w-4" /> {working === "song" ? "Writing..." : "Write the song"}
          </Button>
        </div>

        {saved.length > 0 && (
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <span className="text-xs text-muted-foreground uppercase">Start from a saved beat:</span>
            {saved.slice(0, 8).map((beat) => (
              <button
                key={beat.id}
                type="button"
                onClick={() => {
                  setSpec(beat.spec);
                  toast.success(`Loaded "${beat.title}".`);
                }}
                className="border border-border px-3 py-1 text-xs hover:border-primary hover:text-primary"
              >
                {beat.title}
              </button>
            ))}
          </div>
        )}

        <section className="mt-10">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="section-label">Arrangement</p>
              <h2 className="mt-2 text-3xl">{spec.title}</h2>
              <p className="mt-1 text-xs text-muted-foreground">
                {spec.bpm} BPM · {spec.key} · {totalBars} bars · {lengthLabel}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" size="sm" onClick={togglePlay}>
                {playing ? <Square className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
                {playing ? "Stop loop" : "Play loop"}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={working !== null}
                onClick={() => void rearrange()}
              >
                <Wand2 className="h-3.5 w-3.5" /> {working === "arrange" ? "Arranging..." : "Re-arrange"}
              </Button>
              <Button type="button" size="sm" disabled={working !== null} onClick={() => void exportSong()}>
                <Download className="h-3.5 w-3.5" />
                {working === "export" ? "Rendering..." : "Download full song"}
              </Button>
            </div>
          </div>

          <div className="mt-4 space-y-2">
            {sections.map((section, index) => (
              <div key={`${section.name}-${index}`} className="border border-border bg-card p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <input
                    value={section.name}
                    onChange={(e) =>
                      setSections((prev) =>
                        prev.map((s, i) => (i === index ? { ...s, name: e.target.value } : s)),
                      )
                    }
                    className="bg-transparent text-lg outline-none focus:text-primary"
                  />
                  <div className="flex flex-wrap items-center gap-2">
                    {[2, 4, 8, 16].map((bars) => (
                      <button
                        key={bars}
                        type="button"
                        onClick={() => setBars(index, bars)}
                        className={`border px-2 py-1 text-[11px] ${
                          section.bars === bars
                            ? "border-primary text-primary"
                            : "border-border text-muted-foreground"
                        }`}
                      >
                        {bars} bars
                      </button>
                    ))}
                    <button
                      type="button"
                      onClick={() => removeSection(index)}
                      aria-label={`Remove ${section.name}`}
                      className="border border-border p-1 text-muted-foreground hover:text-primary"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {PARTS.map((part) => (
                    <button
                      key={part.key}
                      type="button"
                      aria-pressed={section.parts[part.key]}
                      onClick={() => togglePart(index, part.key)}
                      className={`border px-3 py-1 text-[11px] uppercase ${
                        section.parts[part.key]
                          ? "border-primary/60 bg-primary/10 text-primary"
                          : "border-border text-muted-foreground"
                      }`}
                    >
                      {part.label}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <Button type="button" variant="outline" size="sm" onClick={addSection} className="mt-3">
            <Plus className="h-3.5 w-3.5" /> Add section
          </Button>
        </section>

        <SayMasterPanel
          title="Master the full song"
          description="Renders the whole arrangement as drums, bass and music stems, processes each one, mixes them with room for your vocal and masters the result. Record over the vocal-ready version; it lines up with the plain download."
          action="Master the song"
          defaultPreset={presetForGenre(spec.genre)}
          disabled={sections.length === 0}
          prepare={async (preset, onStage) => {
            const stems = await renderSongRoleStems(spec, sections, (d, t) => onStage(`Rendering stems (${d}/${t})`));
            // Unprocessed stems summed, brought down to a -1 dBFS peak so the comparison isn't clipped.
            const raw = sum(stems.drums, stems.bass, stems.music);
            const before = new Blob([encodeWav(scale(raw, dbToGain(-1) / Math.max(peak(raw), 1e-9)), MASTER_RATE, 16) as BlobPart], { type: "audio/wav" });
            return { job: { kind: "beat", name: slugify(spec.title), sr: MASTER_RATE, preset, stems }, before };
          }}
        />

        <SayMasterPanel
          title="Finish the record with your vocals"
          description="Recorded your vocals over this song? Add the lead and any backing or ad-lib takes (each exported from the start of the song). SayMaster cleans and compresses them, tames harsh S sounds, adds reverb and a delay in time with the beat, ducks the music only while you sing, and masters the song at release loudness. You get the main version, instrumental, acapella and TV mix, all mastered the same way."
          action="Finish the record"
          defaultPreset={presetForGenre(spec.genre)}
          disabled={sections.length === 0 || leads.length === 0}
          prepare={async (preset, onStage) => {
            const { decodeFile } = await import("@/lib/saymaster/client");
            onStage("Reading your vocals");
            const leadAudio = await Promise.all(leads.map((f) => decodeFile(f, MASTER_RATE)));
            const backAudio = await Promise.all(backs.map((f) => decodeFile(f, MASTER_RATE)));
            const stems = await renderSongRoleStems(spec, sections, (d, t) => onStage(`Rendering stems (${d}/${t})`));
            return {
              job: { kind: "song", name: slugify(spec.title), sr: MASTER_RATE, preset, bpm: spec.bpm, stems, leads: leadAudio, backs: backAudio },
            };
          }}
        >
          <VocalPicker leads={leads} backs={backs} onLeads={setLeads} onBacks={setBacks} />
        </SayMasterPanel>
      </div>
    </div>
  );
}
