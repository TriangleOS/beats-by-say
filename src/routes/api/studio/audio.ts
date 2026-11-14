import { createFileRoute } from "@tanstack/react-router";
import { allowedAudioUrl } from "@/lib/studio.server";

/**
 * Same-origin pass-through for studio-engine audio, so the browser can decode it for SayMaster without
 * relying on the music service's CORS headers. Only the service's own audio hosts are allowed.
 */
export const Route = createFileRoute("/api/studio/audio")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const target = allowedAudioUrl(new URL(request.url).searchParams.get("u") ?? "");
        if (!target) return new Response("Not allowed", { status: 400 });
        const upstream = await fetch(target, { headers: { Accept: "audio/*" } });
        if (!upstream.ok || !upstream.body)
          return new Response("Audio unavailable", { status: 502 });
        return new Response(upstream.body, {
          headers: {
            "Content-Type": upstream.headers.get("Content-Type") ?? "audio/mpeg",
            "Cache-Control": "private, max-age=3600",
          },
        });
      },
    },
  },
});
