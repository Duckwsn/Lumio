import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const workerSource = fileURLToPath(new URL("./pwa/sw.js", import.meta.url));

const projectRoot = fileURLToPath(new URL("../../", import.meta.url));
const webHeaders = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(), microphone=(self), display-capture=(self)",
};

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, projectRoot, "VITE_");
  if (process.env.VERCEL === "1" && (!env.VITE_API_URL || !env.VITE_SOCKET_URL)) throw new Error("VITE_API_URL e VITE_SOCKET_URL são obrigatórias no build Vercel.");
  const api = new URL(env.VITE_API_URL || "http://localhost:4000");
  const socket = new URL(env.VITE_SOCKET_URL || api.origin);
  if (process.env.VERCEL === "1" && (api.protocol !== "https:" || socket.protocol !== "https:" || api.origin !== api.href.replace(/\/$/, "") || socket.origin !== socket.href.replace(/\/$/, ""))) throw new Error("VITE_API_URL e VITE_SOCKET_URL devem ser origens HTTPS no Vercel.");
  const websocket = new URL(socket.toString()); websocket.protocol = socket.protocol === "https:" ? "wss:" : "ws:";
  const connect = ["'self'", api.origin, socket.origin, websocket.origin, "https://accounts.google.com", "https://www.youtube.com", ...(mode === "development" ? ["ws:"] : [])];
  const csp = [
    "default-src 'self'", "object-src 'none'", "base-uri 'self'", "form-action 'self'",
    "script-src 'self' https://www.youtube.com https://s.ytimg.com https://accounts.google.com/gsi/client",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://accounts.google.com/gsi/style",
    "font-src 'self' https://fonts.gstatic.com", "img-src 'self' data: blob: https:",
    `media-src 'self' blob: ${api.origin}`, `connect-src ${[...new Set(connect)].join(" ")}`,
    "frame-src https://www.youtube-nocookie.com https://www.youtube.com https://accounts.google.com",
    "worker-src 'self'",
  ].join("; ");
  return { envDir: projectRoot, plugins: [react(), {
    name: "lumio-security-policy",
    transformIndexHtml(html) { return html.replace('<meta name="referrer" content="strict-origin-when-cross-origin" />', `<meta name="referrer" content="strict-origin-when-cross-origin" /><meta http-equiv="Content-Security-Policy" content="${csp}" />`); },
  }, {
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
  server: { port: 5173, headers: webHeaders },
  preview: { headers: webHeaders },
  };
});
