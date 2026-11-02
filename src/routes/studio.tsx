import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useRef, useState } from "react";
import { Mic, Square, Play, Pause, Loader2, Download, Trash2, Wand2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { generateBeat } from "@/lib/beats.functions";
import { BeatPlayer } from "@/lib/audio-engine";
import type { BeatSpec } from "@/lib/beat-spec";
import { renderMixWav, renderStemsZip, saveBlob, slugify } from "@/lib/render";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { listen } from "@/lib/speech";

export const Route = createFileRoute("/studio")({
  head: () => ({
    meta: [
      { title: "Studio | Beats by Say" },
      {
        name: "description",
        content:
          "Speak or type your brief and Beats by Say builds an instrumental loop (tempo, key, drums, bass, chords and melody) ready for your studio vocals.",
      },
      { property: "og:title", content: "Studio | Beats by Say" },
      {
        property: "og:description",
        content: "Voice-command beat production. Say the sound, get the instrumental.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Studio,
});

type SavedBeat = { id: string; prompt: string; spec: BeatSpec };

const IDEAS = [
  "Dark UK drill, 142 bpm, sliding 808s, minor key, sparse",
  "Warm 90s boom bap in F minor, dusty drums, jazzy Rhodes",
  "Afroswing at 102 bpm, bright marimba, bouncy percussion",
  "Slow trap ballad, 74 bpm, cinematic strings, space for a hook",
];

function Studio() {
  const generate = useServerFn(generateBeat);
  const { user, session } = useAuth();

  const [prompt, setPrompt] = useState("");
  const [loading, setLoading] = useState(false);
  const [recording, setRecording] = useState(false);
  const [spec, setSpec] = useState<BeatSpec | null>(null);
  const [playing, setPlaying] = useState(false);
  const [step, setStep] = useState(-1);
  const [library, setLibrary] = useState<SavedBeat[]>([]);
  const [exporting, setExporting] = useState<"wav" | "stems" | null>(null);

  const playerRef = useRef<BeatPlayer | null>(null);
  const stopListeningRef = useRef<(() => void) | null>(null);

  useEffect(() => () => playerRef.current?.stop(), []);

  useEffect(() => {
    if (!user) {
      setLibrary([]);
      return;
    }
    void loadLibrary();
  }, [user]);

  async function loadLibrary() {
    const { data } = await supabase
      .from("beatsbysay_beats")
      .select("id,prompt,spec")
      .order("created_at", { ascending: false })
      .limit(30);
    setLibrary((data ?? []) as unknown as SavedBeat[]);
  }

  async function removeBeat(id: string) {
    const { error } = await supabase.from("beatsbysay_beats").delete().eq("id", id);
    if (error) toast.error(error.message);
    else setLibrary((prev) => prev.filter((b) => b.id !== id));
  }

  async function runGenerate(text: string) {
    if (!text.trim()) {
      toast.error("Say or type what you want first.");
      return;
    }
    if (!user || !session) {
      toast.error("Sign in (free) to make beats.");
      return;
    }
    setLoading(true);
    stopPlayback();
    try {
      const result = await generate({ data: { prompt: text.trim(), token: session.access_token } });
      setSpec(result.spec);
      const { error } = await supabase.from("beatsbysay_beats").insert({
        user_id: user.id,
        title: result.spec.title,
        prompt: text.trim(),
        bpm: result.spec.bpm,
        music_key: result.spec.key,
        mood: result.spec.mood,
        description: result.spec.description,
        spec: JSON.parse(JSON.stringify(result.spec)),
      });
      if (error) toast.error(`Made the beat, but couldn't save it: ${error.message}`);
      else await loadLibrary();
      toast.success(`"${result.spec.title}" is ready.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  function startRecording() {
    setRecording(true);
    stopListeningRef.current = listen(
      (text) => {
        setPrompt(text);
        void runGenerate(text);
      },
      (message) => toast.error(message),
      () => setRecording(false),
    );
  }

  function stopRecording() {
    stopListeningRef.current?.();
    stopListeningRef.current = null;
  }

  function stopPlayback() {
    playerRef.current?.stop();
    playerRef.current = null;
    setPlaying(false);
    setStep(-1);
  }

  async function togglePlay(target?: BeatSpec) {
    const active = target ?? spec;
    if (!active) return;
    if (playing && !target) {
      stopPlayback();
      return;
    }
    stopPlayback();
    const player = new BeatPlayer();
    player.onStep = setStep;
    playerRef.current = player;
    await player.play(active);
    setPlaying(true);
  }

  function download(active: BeatSpec) {
    const blob = new Blob([JSON.stringify(active, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${active.title.replace(/\s+/g, "-").toLowerCase()}-beat-sheet.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div>

      <div className="mx-auto max-w-7xl px-4 py-10 pb-24 sm:px-6">
        <p className="section-label">New instrumental</p>
        <h1 className="mt-2 text-3xl md:text-5xl">
          Say the sound. <span className="text-primary">Get the beat.</span>
        </h1>
        <p className="mt-3 max-w-xl text-sm text-muted-foreground">
          Instrumental only. Take it to the booth and record your vocals as normal.
        </p>
        {!user && (
          <p className="mt-4 max-w-xl border border-primary/40 bg-primary/5 p-3 text-sm">
            <Link to="/login" className="text-primary underline">Sign in or create a free account</Link> to make
            and save beats. Voice briefs work in Chrome, Edge and Safari; anywhere else, type your brief.
          </p>
        )}

        <section className="mt-8 border border-border bg-card p-5 md:p-7">
          <div className="flex flex-col gap-4 sm:flex-row">
            <Button
              type="button"
              onClick={recording ? stopRecording : startRecording}
              disabled={loading}
              variant="outline"
              className={`h-24 w-24 shrink-0 flex-col rounded-full border-primary/50 text-primary ${recording ? "mic-live bg-primary/20" : "hover:bg-primary/10"}`}
              aria-label={recording ? "Stop recording" : "Start voice command"}
            >
              {recording ? <Square className="h-6 w-6" /> : <Mic className="h-7 w-7" />}
              <span className="text-[11px] uppercase">
                {recording ? "Stop" : "Speak"}
              </span>
            </Button>

            <div className="flex-1">
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                rows={4}
                placeholder="Dark drill beat, 142 bpm, sliding 808s, cold piano..."
                className="w-full resize-none rounded-sm border border-input bg-background p-4 text-sm outline-none focus:ring-2 focus:ring-ring"
              />
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  onClick={() => runGenerate(prompt)}
                  disabled={loading || recording}
                  className="h-10 rounded-sm px-5 font-extrabold"
                >
                  {loading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Wand2 className="h-4 w-4" />
                  )}
                  {loading ? "Building..." : "Generate beat"}
                </Button>
                {IDEAS.map((idea) => (
                  <Button
                    key={idea}
                    type="button"
                    onClick={() => setPrompt(idea)}
                    variant="outline"
                    size="sm"
                    className="rounded-sm text-muted-foreground"
                  >
                    {idea.split(",")[0]}
                  </Button>
                ))}
              </div>
            </div>
          </div>
        </section>

        {spec && (
          <section className="mt-6 border border-border bg-card p-5 md:p-7">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-3xl">{spec.title}</h2>
                <p className="mt-1 text-sm text-muted-foreground">{spec.description}</p>
                <p className="mt-2 text-xs text-primary uppercase">
                  {spec.bpm} BPM · {spec.key} · {spec.genre} · {spec.mood}
                  {spec.swing > 0 ? ` · swing ${Math.round(spec.swing * 100)}%` : ""}
                </p>
              </div>
              <div className="flex gap-2">
                <Button
                  type="button"
                  onClick={() => togglePlay()}
                  variant="outline"
                  className="border-primary/50 text-primary hover:bg-primary/10 hover:text-primary"
                >
                  {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                  {playing ? "Stop" : "Play loop"}
                </Button>
                <Button
                  type="button"
                  disabled={exporting !== null}
                  onClick={async () => {
                    setExporting("wav");
                    try {
                      saveBlob(await renderMixWav(spec), `${slugify(spec.title)}.wav`);
                    } finally {
                      setExporting(null);
                    }
                  }}
                  variant="outline"
                >
                  <Download className="h-4 w-4" /> {exporting === "wav" ? "Rendering..." : "WAV"}
                </Button>
                <Button
                  type="button"
                  disabled={exporting !== null}
                  onClick={async () => {
                    setExporting("stems");
                    try {
                      saveBlob(await renderStemsZip(spec), `${slugify(spec.title)}-stems.zip`);
                      toast.success("Stems downloaded with an LMMS project file and an empty vocal track.");
                    } finally {
                      setExporting(null);
                    }
                  }}
                  variant="outline"
                >
                  <Download className="h-4 w-4" /> {exporting === "stems" ? "Rendering..." : "Stems + LMMS"}
                </Button>
                <Button
                  type="button"
                  onClick={() => download(spec)}
                  variant="outline"
                >
                  <Download className="h-4 w-4" /> Beat sheet
                </Button>
              </div>
            </div>

            <div className="mt-6 space-y-2">
                  {(
                [
                  ["Kick", spec.kick],
                  ["Snare", spec.snare],
                  ["Clap", spec.clap],
                  ["Hats", spec.hat],
                  ["Open hat", spec.openHat],
                  ["Perc", spec.perc],
                  ["Bass", spec.bassSteps.map((n) => (n === "-" ? "-" : "x")).join("")],
                  ["Melody", spec.melody.map((n) => (n === "-" ? "-" : "x")).join("")],
                ] as const
              ).map(([label, pattern]) => (
                <div key={label} className="flex items-center gap-3">
                  <span className="w-20 shrink-0 text-xs text-muted-foreground uppercase">
                    {label}
                  </span>
                  <div className="grid flex-1 gap-1" style={{ gridTemplateColumns: "repeat(16, minmax(0, 1fr))" }}>
                    {Array.from({ length: 16 }).map((_, i) => (
                      <span
                        key={i}
                         className={`h-6 border ${pattern[i] === "x" ? "border-primary/60 bg-primary/70" : "border-border bg-background/50"} ${step === i ? "outline outline-primary" : ""}`}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-5 flex flex-wrap gap-2">
              {spec.chordNotes.map((chord, i) => (
                 <span
                  key={i}
                   className="rounded-sm border border-border bg-background px-3 py-1.5 font-mono text-xs text-muted-foreground"
                >
                  Bar {i + 1}: {chord}
                </span>
              ))}
            </div>
          </section>
        )}

        {library.length > 0 && (
          <section className="mt-10">
             <p className="section-label">Saved to your account</p><h2 className="mt-2 text-2xl">Your beat library</h2>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {library.map((item) => (
                 <div key={item.id} className="border border-border bg-card p-4">
                  <p className="text-lg">{item.spec.title}</p>
                  <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{item.prompt}</p>
                  <p className="mt-2 text-[11px] text-primary uppercase">
                    {item.spec.bpm} BPM · {item.spec.key}
                  </p>
                  <div className="mt-3 flex gap-2">
                     <Button
                      type="button"
                      onClick={() => {
                        setSpec(item.spec);
                        void togglePlay(item.spec);
                      }}
                       variant="outline" size="sm" className="border-primary/50 text-primary hover:text-primary"
                    >
                      <Play className="h-3.5 w-3.5" /> Play
                     </Button>
                     <Button
                      type="button"
                      onClick={() => void removeBeat(item.id)}
                       variant="outline" size="sm" className="text-muted-foreground"
                    >
                      <Trash2 className="h-3.5 w-3.5" /> Delete
                     </Button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
