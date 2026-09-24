import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const workerSource = fileURLToPath(new URL("./pwa/sw.js", import.meta.url));

export default defineConfig({
  plugins: [react(), {
    name: "lumio-versioned-service-worker",
    apply: "build",
    generateBundle(_options, bundle) {
      const hash = createHash("sha256");
      for (const file of Object.values(bundle).sort((a, b) => a.fileName.localeCompare(b.fileName))) {
        if (file.type === "chunk" || file.fileName.endsWith(".css")) hash.update(file.type === "chunk" ? file.code : file.source);
      }
      for (const asset of ["manifest.webmanifest", "favicon-16.png", "favicon-32.png", "icon-192.png", "icon-512.png", "icon-maskable-512.png", "apple-touch-icon.png", "brand/lumio-symbol-128.png", "offline.html"]) {
        hash.update(readFileSync(fileURLToPath(new URL(`./public/${asset}`, import.meta.url))));
      }
      const version = hash.digest("hex").slice(0, 12);
      const source = readFileSync(workerSource, "utf8").replace("__BUILD_VERSION__", version);
      this.emitFile({ type: "asset", fileName: "sw.js", source });
    },
  }],
  server: { port: 5173 },
});
