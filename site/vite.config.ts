import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

// Builds the password-gate SPA only. The authenticated lesson portal is the
// existing static app (app/static) served as-is by server/index.js with a
// reskin stylesheet layered on top — see portal-overrides/.
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
  server: {
    proxy: {
      "/api": "http://127.0.0.1:8932",
    },
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
});
