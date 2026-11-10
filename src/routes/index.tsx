import { createFileRoute, Link } from "@tanstack/react-router";
import { Mic, Music4, ShieldCheck, Coins, Sparkles, Waves, SlidersHorizontal } from "lucide-react";
import heroImage from "@/assets/hero-studio.jpg";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Beats by Say | Speak Your Beat Into Existence" },
      {
        name: "description",
        content:
          "Beats by Say turns your voice or a text brief into an instrumental loop or a full arranged song, ready for you to record your own vocals over. Free while we build it.",
      },
      { property: "og:title", content: "Beats by Say | Speak Your Beat Into Existence" },
      {
        property: "og:description",
        content:
          "Voice-first beat making for recording artists. Instrumentals only: the vocals are yours.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Landing,
});

const pillars = [
  {
    icon: Mic,
    title: "Say it, hear it",
    body: "Describe the beat out loud — tempo, mood, drums, keys. The board builds it while you talk.",
  },
  {
    icon: Music4,
    title: "Instrumentals only",
    body: "No synthetic vocals. Ever. You take the beat to the booth and lay the real thing down.",
  },
  {
    icon: ShieldCheck,
    title: "Your voice, your record",
    body: "The beat is made with AI; the performance is yours, recorded in the booth the normal way.",
  },
  {
    icon: Coins,
    title: "No split to us",
    body: "We take no producer split and claim no rights in the beats you make here. Check the rules of any store or label you release through.",
  },
];

const steps = [
  { n: "01", t: "Speak the brief", d: "Hold the mic and describe the sound you hear in your head." },
  { n: "02", t: "Get the beat", d: "A full instrumental loop with tempo, key, drums, bass and chords." },
  { n: "03", t: "Shape the song", d: "Arrange intro, verses and choruses in the songwriter, then master it with SayMaster." },
  { n: "04", t: "Book the studio", d: "Record vocals over the vocal-ready master. Real session, real artist, real record." },
  { n: "05", t: "Finish the record", d: "Bring your vocals back and SayMaster mixes and masters the song in every version you need." },
];

function Landing() {
  return (
    <div>
      <div>
        <section className="relative mx-auto grid max-w-7xl items-end gap-8 px-4 py-12 sm:px-6 md:grid-cols-[1.05fr_.95fr] md:py-16">
          <div className="relative z-10">
          <p className="section-label mb-5 inline-flex items-center gap-2">
            <Sparkles className="h-3.5 w-3.5 text-primary" /> Voice-first beat production
          </p>
          <h1 className="max-w-3xl text-5xl leading-[1.02] font-extrabold md:text-7xl">
            Speak it.<br/><span className="text-primary">Produce it.</span><br/>Record over it.
          </h1>
          <p className="mt-6 max-w-xl text-base leading-7 text-muted-foreground">
            Beats by Say makes the instrumental from your voice or a typed brief, then gets out of the
            way. You still record your vocals in the studio like every record before yours.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              to="/studio"
              className="inline-flex items-center gap-2 rounded-sm bg-primary px-6 py-3 text-sm font-extrabold text-primary-foreground shadow-[var(--shadow-glow)]"
            >
              <Mic className="h-4 w-4" /> Make a beat
            </Link>
            <a
              href="#how"
              className="inline-flex items-center gap-2 rounded-sm border border-border px-6 py-3 text-sm font-bold text-foreground transition-colors hover:bg-secondary"
            >
              How it works
            </a>
          </div></div>
          <div className="overflow-hidden border border-border bg-card">
            <img
              src={heroImage}
              alt="Dark studio mixing desk with gold faders beside a condenser microphone"
              width={1600}
              height={1008}
              className="aspect-[4/3] w-full object-cover grayscale-[20%]"
            />
          </div>
        </section>

        <section id="features" className="border-y border-border bg-card py-14">
          <div className="mx-auto grid max-w-7xl gap-px bg-border px-4 sm:grid-cols-2 sm:px-6 lg:grid-cols-4">
            {pillars.map((p) => (
              <div key={p.title} className="bg-card p-6">
                <p.icon className="h-6 w-6 text-primary" />
                <h3 className="mt-4 text-xl">{p.title}</h3>
                <p className="mt-2 text-sm text-muted-foreground">{p.body}</p>
              </div>
            ))}
          </div>
        </section>

        <section id="how" className="mx-auto max-w-7xl px-4 py-16 sm:px-6">
          <p className="section-label">The process</p>
          <h2 className="mt-3 text-3xl md:text-5xl">
            From a sentence to a <span className="text-primary">session</span>
          </h2>
          <div className="mt-10 grid gap-6 md:grid-cols-5">
            {steps.map((s) => (
               <div key={s.n} className="border-t-2 border-primary bg-card p-5">
                 <span className="text-xs font-extrabold text-primary">{s.n}</span>
                <h3 className="mt-3 text-xl">{s.t}</h3>
                <p className="mt-2 text-sm text-muted-foreground">{s.d}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="border-t border-border">
          <div className="mx-auto grid max-w-7xl gap-8 px-4 py-16 sm:px-6 md:grid-cols-[1fr_1fr]">
            <div>
              <p className="section-label inline-flex items-center gap-2">
                <SlidersHorizontal className="h-3.5 w-3.5 text-primary" /> SayMaster
              </p>
              <h2 className="mt-3 text-3xl md:text-5xl">
                From beat to <span className="text-primary">finished record</span>
              </h2>
              <p className="mt-4 text-muted-foreground">
                SayMaster mixes and masters what you make here. Drums, bass and music are processed as separate stems,
                mixed with room for your vocal and limited to release loudness without inter-sample clipping. Bring
                your recorded vocals back and it finishes the song: main, instrumental, acapella and TV mix, all
                mastered the same way. It runs in your browser, and works on audio made elsewhere too.
              </p>
              <Link
                to="/mastering"
                className="mt-6 inline-flex items-center gap-2 rounded-sm border border-primary/60 px-6 py-3 text-sm font-bold text-primary hover:bg-primary/10"
              >
                <SlidersHorizontal className="h-4 w-4" /> Open SayMaster
              </Link>
            </div>
            <ul className="grid gap-px self-start bg-border text-sm">
              {[
                ["Stems, not just a stereo file", "Punchier drums, a mono low end that still reads on phone speakers, cleaner chords."],
                ["Vocal-ready beats", "A gap left at 1.5-5 kHz where your voice sits, and headroom for the vocal."],
                ["Vocal chain", "Clean-up, two-stage compression, de-essing, presence, reverb and a delay in time with the beat."],
                ["Release masters", "Genre loudness targets, true-peak limiting, 24-bit and dithered 16-bit WAV."],
              ].map(([t, d]) => (
                <li key={t} className="bg-card p-4">
                  <p className="font-bold">{t}</p>
                  <p className="mt-1 text-muted-foreground">{d}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section className="border-t border-border bg-card px-5 py-20 text-center">
          <Waves className="mx-auto h-8 w-8 text-primary" />
          <h2 className="mt-5 text-3xl md:text-5xl">Free while we build it</h2>
          <p className="mx-auto mt-4 max-w-xl text-muted-foreground">
            Making beats, arranging songs, downloading WAVs and stems, and mastering with SayMaster is free with an account. A beat
            marketplace, distribution to stores and royalty tracking are planned, not available yet.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3"><Link
            to="/studio"
            className="inline-flex items-center gap-2 rounded-sm bg-primary px-6 py-3 text-sm font-extrabold text-primary-foreground"
          >
            <Mic className="h-4 w-4" /> Open the studio
          </Link>
          <Link to="/roadmap" className="inline-flex items-center gap-2 rounded-sm border border-border px-6 py-3 text-sm font-bold text-foreground hover:bg-secondary">
            See the roadmap
          </Link></div>
        </section>
      </div>
    </div>
  );
}
