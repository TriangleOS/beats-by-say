import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { sendContact } from "@/lib/contact";

const field = "w-full rounded-sm border border-input bg-background p-3 text-sm outline-none focus:ring-2 focus:ring-ring";

/** Contact form that sends to the shared Triangle OS contact-form function. */
export function ContactForm({ topics }: { topics: Record<string, string> }) {
  const keys = Object.keys(topics);
  const [topic, setTopic] = useState(keys[0]);
  const [form, setForm] = useState({ name: "", email: "", message: "" });
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) return toast.error("Please enter a valid email address.");
    setBusy(true);
    try {
      await sendContact({ name: form.name.trim(), email: form.email.trim(), topic, message: form.message.trim() });
      setSent(true);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Your message wasn't sent. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  if (sent) {
    return (
      <div role="status" className="border border-border bg-card p-8 text-center">
        <p className="text-3xl">Thanks, message sent.</p>
        <p className="mt-2 text-sm text-muted-foreground">We reply by email.</p>
      </div>
    );
  }
  return (
    <form onSubmit={submit} className="space-y-3 border border-border bg-card p-6">
      {keys.length > 1 && (
        <select aria-label="Topic" value={topic} onChange={(e) => setTopic(e.target.value)} className={field}>
          {keys.map((k) => <option key={k} value={k}>{topics[k]}</option>)}
        </select>
      )}
      <input required aria-label="Your name" placeholder="Your name" maxLength={100} value={form.name} onChange={set("name")} className={field} />
      <input required type="email" aria-label="Email" placeholder="Email" maxLength={255} value={form.email} onChange={set("email")} className={field} />
      <textarea required aria-label="Message" placeholder="Message" rows={5} maxLength={2000} value={form.message} onChange={set("message")} className={field} />
      <Button type="submit" disabled={busy} className="h-11 rounded-sm px-6">{busy ? "Sending…" : "Send"}</Button>
    </form>
  );
}
