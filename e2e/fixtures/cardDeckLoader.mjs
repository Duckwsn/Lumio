import { registerHooks } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";
import os from "node:os";

// This module is explicitly preloaded only by QA launchers, never by the app.
if (process.env.NODE_ENV !== "development" || process.env.PERSISTENCE_MODE !== "file" || !process.env.APP_PUBLIC_URL?.startsWith("http://127.0.0.1:") || !path.resolve(process.env.AUTH_STORE_FILE ?? "").startsWith(path.resolve(os.tmpdir()) + path.sep)) throw new Error("Card QA loader requires an isolated local fixture.");
const fixture = pathToFileURL(path.join(path.dirname(fileURLToPath(import.meta.url)), "cardDeck.ts")).href;
registerHooks({ resolve(specifier, context, nextResolve) {
  if (specifier === "./cardDeck.js" && context.parentURL?.includes("/apps/server/src/cardGame.ts")) return nextResolve(fixture, context);
  return nextResolve(specifier, context);
} });
