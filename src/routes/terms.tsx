import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/terms")({
  head: () => ({ meta: [{ title: "Terms | Beats by Say" }, { name: "description", content: "The terms for using Beats by Say." }] }),
  component: Terms,
});

function Terms() {
  return (
    <div className="mx-auto max-w-3xl space-y-4 px-4 py-12 pb-24 text-sm text-muted-foreground sm:px-6">
      <p className="section-label">Terms</p>
      <h1 className="text-4xl text-foreground md:text-5xl">Terms</h1>
      <p>Beats by Say is provided by Finsec Associates Limited, trading as TriangleOS (UK). It is free while we build it, and features may change.</p>
      <h2 className="pt-4 text-2xl text-foreground">Your beats</h2>
      <p>Beats are made with AI from your brief. We take no producer split and claim no rights in the beats you make here. Whether AI-assisted music can be protected by copyright, and what you must disclose, depends on the law where you are and the rules of each store, label or distributor you use. Check those before you release.</p>
      <h2 className="pt-4 text-2xl text-foreground">Fair use</h2>
      <p>Don't use the service to break the law, to copy another artist's work, or to overload it. We may limit or suspend accounts that do.</p>
      <h2 className="pt-4 text-2xl text-foreground">No guarantees</h2>
      <p>The service is provided as it is. We aren't responsible for losses from using it, except where the law says we must be.</p>
    </div>
  );
}
