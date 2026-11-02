import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/privacy")({
  head: () => ({ meta: [{ title: "Privacy | Beats by Say" }, { name: "description", content: "How Beats by Say handles your data." }] }),
  component: Privacy,
});

function Privacy() {
  return (
    <div className="mx-auto max-w-3xl space-y-4 px-4 py-12 pb-24 text-sm text-muted-foreground sm:px-6">
      <p className="section-label">Privacy</p>
      <h1 className="text-4xl text-foreground md:text-5xl">Privacy</h1>
      <p>Beats by Say is run by Finsec Associates Limited, trading as TriangleOS (UK).</p>
      <h2 className="pt-4 text-2xl text-foreground">What we keep</h2>
      <p>Your email and artist name for your account, and the beats you save: the brief you typed or said, and the beat sheet (tempo, key, patterns and notes). Audio files are rendered in your browser and are not uploaded.</p>
      <h2 className="pt-4 text-2xl text-foreground">Who processes it</h2>
      <p>Accounts and saved beats are stored with Supabase (hosted in Zurich, Switzerland). The site is served by Cloudflare. Your brief is sent to Google's Gemini API to write the beat sheet. Voice briefs are turned into text by your own browser's speech recognition, which may use your browser maker's service.</p>
      <h2 className="pt-4 text-2xl text-foreground">Your choices</h2>
      <p>You can delete any beat from My beats. To delete your account or get a copy of your data, <Link to="/contact" className="text-primary underline">contact us</Link>.</p>
      <p>We don't use advertising or tracking cookies. Sign-in uses a session stored in your browser.</p>
    </div>
  );
}
