import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/roadmap")({
  head: () => ({
    meta: [
      { title: "Roadmap | Beats by Say" },
      { name: "description", content: "What works on Beats by Say today, and what is planned." },
    ],
  }),
  component: Roadmap,
});

const AVAILABLE = [
  ["Beat studio", "Type or say a brief and get a 16-step loop with drums, 808 bass, chords and a melody, played in your browser."],
  ["Voice briefs", "Speak your brief in Chrome, Edge or Safari. Your browser turns it into text."],
  ["Songwriter", "Turn a beat into a full arrangement (intro, verses, choruses, bridge, outro) and edit each section."],
  ["Downloads", "Full-mix WAV, a full-song WAV, and a stems zip with an LMMS project file and an empty vocal track."],
  ["Saved beats", "Every beat you make is saved to your account."],
] as const;

const PLANNED = [
  ["Beat marketplace", "Selling beats to other artists. Needs a payments partner that can pay sellers, so it isn't open yet."],
  ["Distribution", "Sending releases to streaming services. Needs a distribution partner; nothing is delivered to stores today."],
  ["Royalties", "Collecting and tracking royalties. Planned alongside distribution."],
  ["Recorded-sound engine", "A model that renders real audio instead of the browser synths. Research."],
] as const;

function Roadmap() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-12 pb-24 sm:px-6">
      <p className="section-label">Roadmap</p>
      <h1 className="mt-2 text-4xl md:text-5xl">What works, and what's next</h1>
      <p className="mt-3 max-w-2xl text-sm text-muted-foreground">
        Everything under "available now" is free with an account. Planned items aren't built yet; we'll move them across
        only when you can use them.
      </p>

      <h2 className="mt-10 text-2xl">Available now</h2>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {AVAILABLE.map(([t, d]) => (
          <div key={t} className="border border-border bg-card p-5">
            <p className="text-xl">{t}</p>
            <p className="mt-1 text-sm text-muted-foreground">{d}</p>
          </div>
        ))}
      </div>

      <h2 className="mt-10 text-2xl">Planned</h2>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {PLANNED.map(([t, d]) => (
          <div key={t} className="border border-dashed border-border p-5">
            <p className="text-xl">{t} <span className="ml-2 align-middle text-[11px] uppercase text-primary">Planned</span></p>
            <p className="mt-1 text-sm text-muted-foreground">{d}</p>
          </div>
        ))}
      </div>

      <p className="mt-10 text-sm text-muted-foreground">
        Want one of these sooner? <Link to="/contact" className="text-primary underline">Tell us</Link>.
      </p>
    </div>
  );
}
