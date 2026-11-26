import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const apiTarget = process.env.MOTIF_API_TARGET || "http://127.0.0.1:8795";

export default defineConfig({
  plugins: [react()],
  base: "./",
  build: {
    outDir: "dist-web",
    emptyOutDir: true,
    sourcemap: false,
  },
  server: {
    host: "0.0.0.0",
    port: 5173,
    allowedHosts: true,
    proxy: {
      "/api": {
        target: apiTarget,
        changeOrigin: true,
      },
    },
  },
  preview: {
    host: "0.0.0.0",
    port: 4173,
    allowedHosts: true,
    proxy: {
      "/api": {
        target: apiTarget,
        changeOrigin: true,
      },
    },
  },
});
