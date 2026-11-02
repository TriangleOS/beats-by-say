const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

/** Saves a message through the shared Triangle OS contact-form function (company = beatsbysay:<topic>). */
export async function sendContact(input: { name: string; email: string; topic: string; message: string }) {
  const resp = await fetch(`${SUPABASE_URL}/functions/v1/contact-form`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: KEY, Authorization: `Bearer ${KEY}` },
    body: JSON.stringify({
      name: input.name,
      email: input.email,
      company: `beatsbysay:${input.topic}`.slice(0, 200),
      message: input.message,
    }),
  });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) throw new Error(data?.error || "Your message wasn't sent. Please try again.");
  return data as { success?: boolean };
}
