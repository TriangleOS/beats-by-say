import { defineConfig, loadEnv } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import tsConfigPaths from "vite-tsconfig-paths";
import { nitro } from "nitro/vite";

// Builds a Cloudflare Pages site: static files are served as assets, and only
// server routes and server functions run in its Functions worker.
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
              // Cloudflare Pages with a Functions worker: free plan, and the same API token as the
              // other Triangle OS Pages sites can deploy it.
              preset: "cloudflare-pages",
              cloudflare: { nodeCompat: true },
            }),
          ]
        : []),
      viteReact(),
    ],
  };
});
