import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Play, Download, Trash2, Square } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { RequireAuth } from "@/components/RequireAuth";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { BeatPlayer } from "@/lib/audio-engine";
import type { BeatSpec } from "@/lib/beat-spec";
import { renderMixWav, renderStemsZip, saveBlob, slugify } from "@/lib/render";

export const Route = createFileRoute("/dashboard")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "My beats | Beats by Say" },
      { name: "description", content: "Your saved beats on Beats by Say." },
    ],
  }),
  component: () => (
    <RequireAuth>
      <Dashboard />
    </RequireAuth>
  ),
});

type BeatRow = { id: string; title: string; prompt: string; bpm: number; music_key: string; spec: BeatSpec };

function Dashboard() {
  const { user } = useAuth();
  const [artistName, setArtistName] = useState(String(user?.user_metadata?.["artist_name"] ?? ""));
  const [beats, setBeats] = useState<BeatRow[]>([]);
  const [player] = useState(() => new BeatPlayer());
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const { data } = await supabase
        .from("beatsbysay_beats")
        .select("id,title,prompt,bpm,music_key,spec")
        .order("created_at", { ascending: false });
      setBeats((data ?? []) as unknown as BeatRow[]);
    })();
    return () => player.stop();
  }, [player]);

  async function saveName() {
    const { error } = await supabase.auth.updateUser({ data: { artist_name: artistName.trim().slice(0, 80) } });
    toast[error ? "error" : "success"](error ? error.message : "Artist name saved.");
  }

  async function remove(id: string) {
    const { error } = await supabase.from("beatsbysay_beats").delete().eq("id", id);
    if (error) return toast.error(error.message);
    setBeats((prev) => prev.filter((b) => b.id !== id));
  }

  function play(beat: BeatRow) {
    if (playingId === beat.id) {
      player.stop();
      setPlayingId(null);
      return;
    }
    void player.play(beat.spec);
    setPlayingId(beat.id);
  }

  async function exportBeat(beat: BeatRow, kind: "wav" | "stems") {
    setBusy(`${beat.id}:${kind}`);
    try {
      if (kind === "wav") saveBlob(await renderMixWav(beat.spec), `${slugify(beat.title)}.wav`);
      else saveBlob(await renderStemsZip(beat.spec), `${slugify(beat.title)}-stems.zip`);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 pb-24 sm:px-6">
      <p className="section-label">Your account</p>
      <h1 className="mt-2 text-4xl md:text-5xl">My beats</h1>

      <section className="mt-8 border border-border bg-card p-5">
        <p className="section-label">Artist name</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <input
            value={artistName}
            maxLength={80}
            onChange={(e) => setArtistName(e.target.value)}
            className="flex-1 rounded-sm border border-input bg-background p-3 text-sm outline-none focus:ring-2 focus:ring-ring"
          />
          <Button type="button" onClick={() => void saveName()} className="rounded-sm">Save</Button>
        </div>
      </section>

      <section className="mt-10">
        <div className="flex items-end justify-between">
          <h2 className="text-3xl">Saved beats</h2>
          <Link to="/studio" className="text-xs uppercase text-primary">Make another</Link>
        </div>
        {beats.length === 0 ? (
          <p className="mt-4 text-sm text-muted-foreground">No beats saved yet. Head to the studio and make one.</p>
        ) : (
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {beats.map((beat) => (
              <div key={beat.id} className="border border-border bg-card p-4">
                <p className="text-xl">{beat.title}</p>
                <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{beat.prompt}</p>
                <p className="mt-2 text-[11px] uppercase text-primary">{beat.bpm} BPM · {beat.music_key}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button type="button" size="sm" variant="outline" onClick={() => play(beat)} className="border-primary/50 text-primary hover:text-primary">
                    {playingId === beat.id ? <Square className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
                    {playingId === beat.id ? "Stop" : "Play"}
                  </Button>
                  <Button type="button" size="sm" variant="outline" disabled={busy !== null} onClick={() => void exportBeat(beat, "wav")}>
                    <Download className="h-3.5 w-3.5" /> {busy === `${beat.id}:wav` ? "Rendering..." : "WAV"}
                  </Button>
                  <Button type="button" size="sm" variant="outline" disabled={busy !== null} onClick={() => void exportBeat(beat, "stems")}>
                    <Download className="h-3.5 w-3.5" /> {busy === `${beat.id}:stems` ? "Rendering..." : "Stems"}
                  </Button>
                  <Button type="button" size="sm" variant="outline" aria-label={`Delete ${beat.title}`} onClick={() => void remove(beat.id)} className="text-muted-foreground">
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
