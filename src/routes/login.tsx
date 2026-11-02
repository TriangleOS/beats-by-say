import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/login")({
  head: () => ({
    meta: [
      { title: "Artist sign in | Beats by Say" },
      { name: "description", content: "Sign in or create a free Beats by Say account to make, save and download beats." },
    ],
  }),
  component: LoginPage,
});

const field = "w-full rounded-sm border border-input bg-background p-3 text-sm outline-none focus:ring-2 focus:ring-ring";

function LoginPage() {
  const navigate = useNavigate();
  const { user, signInEmail, signUpEmail, signInGoogle } = useAuth();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [artistName, setArtistName] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  useEffect(() => {
    if (user) void navigate({ to: "/studio" });
  }, [user, navigate]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const { error } =
      mode === "signup"
        ? await signUpEmail(email, password, artistName || email.split("@")[0])
        : await signInEmail(email, password);
    setBusy(false);
    if (error) return toast.error(error);
    if (mode === "signup") {
      setSent(true);
      toast.success("Check your email to confirm your account.");
    }
  }

  async function google() {
    const { error } = await signInGoogle();
    if (error) toast.error("Google sign-in failed.");
  }

  return (
    <div className="flex items-center justify-center px-4 py-16">
      <div className="w-full max-w-md border border-border bg-card p-8">
        <h1 className="text-3xl">{mode === "signup" ? "Create your artist account" : "Artist sign in"}</h1>
        <p className="mt-2 text-sm text-muted-foreground">Free. Save your beats, arrange songs and download WAVs and stems.</p>

        {sent ? (
          <p className="mt-6 text-sm text-primary">We've emailed you a confirmation link. Open it to finish setting up your account.</p>
        ) : (
          <form onSubmit={submit} className="mt-6 space-y-3">
            {mode === "signup" && (
              <input value={artistName} onChange={(e) => setArtistName(e.target.value)} placeholder="Artist name" maxLength={80} className={field} />
            )}
            <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" className={field} />
            <input type="password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Password" className={field} />
            <Button type="submit" disabled={busy} className="h-11 w-full rounded-sm">
              {mode === "signup" ? "Create account" : "Sign in"}
            </Button>
          </form>
        )}

        <Button type="button" variant="outline" onClick={() => void google()} className="mt-3 h-11 w-full rounded-sm">
          Continue with Google
        </Button>

        <button type="button" onClick={() => setMode(mode === "signup" ? "signin" : "signup")} className="mt-5 text-xs text-muted-foreground underline">
          {mode === "signup" ? "Already have an account? Sign in" : "New here? Create an artist account"}
        </button>
      </div>
    </div>
  );
}
