import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { nitro } from "nitro/vite";
import { defineConfig } from "vite";

export default defineConfig(({ command }) => ({
  server: { port: 8080 },
  resolve: { tsconfigPaths: true },
  // Lightning CSS instead of Vite's default PostCSS: the app's stylesheet has always been built
  // this way, and switching changes the CSS that ships.
  css: { transformer: "lightningcss" },
  plugins: [
    tailwindcss(),
    tanstackStart({
      // Use src/server.ts (our SSR error wrapper) instead of the bundled server entry.
      server: { entry: "server" },
      // Fail the build when browser code imports server-only code. Setting `files` replaces the
      // framework default, so "**/*.server.*" has to be listed for that naming rule to apply.
      importProtection: {
        behavior: "error",
        client: { files: ["**/*.server.*", "**/server/**"], specifiers: ["server-only"] },
      },
    }),
    // Build only: the dev server runs TanStack Start's own SSR. The output is a Cloudflare Worker
    // unless NITRO_PRESET names another target, e.g. `NITRO_PRESET=node-server npm run build`.
    command === "build" && nitro({ defaultPreset: "cloudflare-module" }),
    viteReact(),
  ],
}));
