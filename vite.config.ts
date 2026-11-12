import { defineConfig, loadEnv } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import tsConfigPaths from "vite-tsconfig-paths";
import { nitro } from "nitro/vite";

// Builds a Cloudflare Worker named `beatsbysay` (same setup as Metarial and Lawbooks): static files are
// served as assets, and only server routes and server functions run in the Worker.
export default defineConfig(({ command, mode }) => {
  // Server code reads VITE_* values through import.meta.env, so inline them for both bundles.
  const env = loadEnv(mode, process.cwd(), "VITE_");
  const define = Object.fromEntries(
    Object.entries(env).map(([k, v]) => [`import.meta.env.${k}`, JSON.stringify(v)]),
  );

  return {
    define,
    server: { host: "::", port: 8080 },
    css: { transformer: "lightningcss" },
    resolve: {
      dedupe: ["react", "react-dom", "@tanstack/react-query", "@tanstack/query-core"],
    },
    plugins: [
      tailwindcss(),
      tsConfigPaths({ projects: ["./tsconfig.json"] }),
      tanstackStart({
        importProtection: {
          behavior: "error",
          client: { files: ["**/server/**"], specifiers: ["server-only"] },
        },
      }),
      ...(command === "build"
        ? [
            nitro({
              preset: "cloudflare-module",
              cloudflare: {
                nodeCompat: true,
                deployConfig: true,
                // keep_vars: secrets and vars set in the Worker's settings survive each deploy. The
                // compatibility date is pinned so builds on different days run on the same runtime.
                // ai: the Workers AI binding, the keyless fallback in src/lib/llm.server.ts.
                wrangler: {
                  name: "beatsbysay",
                  keep_vars: true,
                  compatibility_date: "2026-10-01",
                  ai: { binding: "AI" },
                },
              },
            }),
          ]
        : []),
      viteReact(),
    ],
  };
});
