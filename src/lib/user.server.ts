// Checks a Supabase access token sent by the browser and returns the user id. The URL and publishable
// key are public, so the values baked in at build time are fine on the server too.
export async function userIdFromToken(token: string): Promise<string> {
  const url = process.env["SUPABASE_URL"] || import.meta.env.VITE_SUPABASE_URL;
  const key = process.env["SUPABASE_PUBLISHABLE_KEY"] || import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  if (!token || !url || !key) throw new Error("Sign in to make beats.");
  const res = await fetch(`${url}/auth/v1/user`, { headers: { apikey: key, Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error("Sign in to make beats.");
  const user = (await res.json()) as { id?: string };
  if (!user.id) throw new Error("Sign in to make beats.");
  return user.id;
}
