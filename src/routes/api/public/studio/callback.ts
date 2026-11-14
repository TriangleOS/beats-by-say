import { createFileRoute } from "@tanstack/react-router";

/** The music service requires a callback address. The studio polls for results, so this only acknowledges. */
export const Route = createFileRoute("/api/public/studio/callback")({
  server: {
    handlers: {
      POST: async () => Response.json({ ok: true }),
      GET: async () => Response.json({ ok: true }),
    },
  },
});
