import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { importApiPlugin } from "./server/importApiPlugin.ts";

const root = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react(), importApiPlugin(root)],
  server: {
    watch: {
      ignored: [
        "**/inbox/**",
        "**/public/scans/**/_inbox_staged/**",
        "**/*.bag",
        "**/*.ply",
      ],
    },
  },
});
