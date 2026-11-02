import { createFileRoute, redirect } from "@tanstack/react-router";

// Planned, not built yet: old links land on the roadmap.
export const Route = createFileRoute("/distribution")({
  beforeLoad: () => {
    throw redirect({ to: "/roadmap", statusCode: 301 });
  },
});
