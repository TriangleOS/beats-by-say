import { createFileRoute, redirect } from "@tanstack/react-router";

// The old sign-in address.
export const Route = createFileRoute("/auth")({
  beforeLoad: () => {
    throw redirect({ to: "/login", statusCode: 301 });
  },
});
