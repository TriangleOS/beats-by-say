// Every Beats by Say AI call goes through here, from server code only (keys never reach the browser).
//
// Backends, tried in order on each request:
//   1. Triangle LLM (self-hosted, OpenAI-compatible) when TRIANGLE_LLM_URL and TRIANGLE_LLM_API_KEY
//      are set. Falls through on network errors, 5xx, or no response headers within
//      TRIANGLE_LLM_TIMEOUT_MS (default 20000).
//   2. Google AI Studio (Gemini) via its OpenAI-compatible endpoint with GEMINI_API_KEY. Model from
//      GEMINI_MODEL (default gemini-3.8-flash); free-tier quotas are per model, so a 429 or 404
//      moves on to the lite models.

export class LlmNotConfigured extends Error {}

const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta/openai";
const GEMINI_FALLBACKS = ["gemini-3.5-flash-lite", "gemini-3.1-flash-lite"];

type Env = Record<string, string | undefined>;

function withModel(init: RequestInit | undefined, model: string): RequestInit {
  const body = typeof init?.body === "string" ? JSON.parse(init.body) : {};
  return { ...init, body: JSON.stringify({ ...body, model }) };
}

function withKey(init: RequestInit, key: string, signal?: AbortSignal): RequestInit {
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${key}`);
  return { ...init, headers, ...(signal ? { signal } : {}) };
}

/** fetch that sends an OpenAI-style request to Triangle LLM, then each Gemini model in turn. */
export function makeFallbackFetch(
  env: Env = process.env,
  doFetch: typeof fetch = fetch,
): typeof fetch {
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    const path = new URL(
      typeof input === "string" || input instanceof URL ? input : input.url,
    ).pathname.replace(/^.*\/v1(beta\/openai)?/, "");

    const triangleUrl = env["TRIANGLE_LLM_URL"];
    const triangleKey = env["TRIANGLE_LLM_API_KEY"];
    if (triangleUrl && triangleKey) {
      const controller = new AbortController();
      const ms = Number(env["TRIANGLE_LLM_TIMEOUT_MS"] ?? "20000");
      const timer = setTimeout(() => controller.abort(new Error(`no response within ${ms}ms`)), ms);
      try {
        const res = await doFetch(
          `${triangleUrl.replace(/\/$/, "")}${path}`,
          withKey(
            withModel(init, env["TRIANGLE_LLM_MODEL"] ?? "triangle-llm-v1"),
            triangleKey,
            controller.signal,
          ),
        );
        if (res.status < 500) return res;
        console.error("Triangle LLM returned", res.status, "- falling back to Gemini");
      } catch (e) {
        console.error("Triangle LLM unreachable - falling back to Gemini:", e);
      } finally {
        clearTimeout(timer);
      }
    }

    const geminiKey = env["GEMINI_API_KEY"];
    if (!geminiKey) throw new LlmNotConfigured("No AI backend configured (set GEMINI_API_KEY)");
    const models = [env["GEMINI_MODEL"] ?? "gemini-3.8-flash", ...GEMINI_FALLBACKS];
    let res!: Response;
    for (const model of models) {
      res = await doFetch(`${GEMINI_BASE}${path}`, withKey(withModel(init, model), geminiKey));
      if (res.status !== 429 && res.status !== 404) break;
      console.warn(`Gemini ${res.status} on ${model}`);
    }
    return res;
  }) as typeof fetch;
}

export type ChatContent =
  string | ({ type: "text"; text: string } | { type: "image_url"; image_url: { url: string } })[];
export type ChatMessage = { role: "system" | "user" | "assistant"; content: ChatContent };

/** One chat completion. Returns the reply text; `json` asks the model for a JSON object. */
export async function chatCompletion(
  messages: ChatMessage[],
  opts: { json?: boolean; timeoutMs?: number } = {},
): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? 60_000);
  try {
    const res = await makeFallbackFetch()(`${GEMINI_BASE}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "beatsbysay",
        messages,
        ...(opts.json ? { response_format: { type: "json_object" } } : {}),
      }),
      signal: controller.signal,
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      if (res.status === 429)
        throw new Error("The AI engine is busy right now. Try again in a minute.");
      throw new Error(`AI request failed (${res.status}): ${detail.slice(0, 180)}`);
    }
    const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    const text = data.choices?.[0]?.message?.content?.trim();
    if (!text) throw new Error("The AI engine returned an empty reply.");
    return text;
  } catch (e) {
    if (e instanceof Error && e.name === "AbortError")
      throw new Error("The AI request timed out. Please try again.");
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

/** Pulls the first JSON object out of a model reply. */
export function parseJsonReply<T>(text: string): T {
  const json = text.startsWith("{")
    ? text
    : text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1);
  try {
    return JSON.parse(json) as T;
  } catch {
    throw new Error("The AI engine returned an unreadable answer. Please run it again.");
  }
}
