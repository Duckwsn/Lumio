/* Disposable local-only visual QA. No project .env, DB or real Google credentials used. */
const { spawn } = require("node:child_process");
const fs = require("node:fs"), os = require("node:os"), path = require("node:path"), net = require("node:net");
const { io } = require("socket.io-client");
const root = path.resolve(__dirname, "..");
const directory = fs.mkdtempSync(path.join(os.tmpdir(), "lumio-draw-visual-"));
const children = [], sockets = [];
const freePort = () => new Promise((resolve) => { const server = net.createServer(); server.listen(0, "127.0.0.1", () => { const port = server.address().port; server.close(() => resolve(port)); }); });
async function stop() { sockets.forEach((socket) => socket.disconnect()); children.forEach((child) => child.kill()); await new Promise((resolve) => setTimeout(resolve, 500)); fs.rmSync(directory, { recursive: true, force: true }); process.exit(); }
process.on("SIGINT", stop); process.on("SIGTERM", stop);
async function main() {
  const presenceFixture = process.argv.includes("--presence");
  const apiPort = await freePort(), webPort = await freePort();
  const api = `http://127.0.0.1:${apiPort}`, origin = `http://127.0.0.1:${webPort}`;
  const outbox = path.join(directory, "mail.jsonl");
  children.push(spawn(process.execPath, ["--import", "tsx", "src/index.ts"], { cwd: path.join(root, "apps/server"), env: { ...process.env, NODE_ENV: "development", PORT: String(apiPort), PERSISTENCE_MODE: "file", AUTH_STORE_FILE: path.join(directory, "auth.json"), EMAIL_PROVIDER: "dev-file", EMAIL_DEV_OUTBOX_FILE: outbox, APP_PUBLIC_URL: origin, CLIENT_ORIGIN: origin, GOOGLE_CLIENT_ID: "", GOOGLE_CLIENT_SECRET: "", GOOGLE_TOKEN_ENCRYPTION_KEY: "", YOUTUBE_API_KEY: "", RTC_STUN_URLS: "", RTC_TURN_URLS: "", RTC_TURN_USERNAME: "", RTC_TURN_CREDENTIAL: "" }, stdio: "ignore" }));
  const wait = async (url) => { for (let i = 0; i < 150; i++) { try { if ((await fetch(url)).ok) return; } catch {} await new Promise((resolve) => setTimeout(resolve, 100)); } throw new Error("QA service did not start"); };
  await wait(api + "/api/health");
  children.push(spawn(process.execPath, [path.join(root, "node_modules/vite/bin/vite.js"), "--host", "127.0.0.1", "--port", String(webPort), "--strictPort"], { cwd: path.join(root, "apps/web"), env: { ...process.env, VITE_API_URL: api, VITE_SOCKET_URL: api, VITE_AUTH_SIGNUP_MODE: "", VITE_GOOGLE_CLIENT_ID: "" }, stdio: "ignore" }));
  await wait(origin);
  const request = (route, token, body) => fetch(api + route, { method: "POST", headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body) });
  const sessions = [];
  for (const displayName of ["G1 Visual Host", "G1 Visual Bia", "G1 Visual Caio", ...(presenceFixture ? ["Visitante Com Nome Muito Longo"] : [])]) {
    const email = displayName.replaceAll(" ", "").toLowerCase() + "@example.test", password = "local-visual-draw-123";
    if ((await request("/api/auth/signup", undefined, { displayName, email, password })).status !== 201) throw new Error("QA signup failed");
    const link = JSON.parse(fs.readFileSync(outbox, "utf8").trim().split("\n").at(-1)).text.match(/https?:\/\/\S+/)[0];
    await request("/api/auth/verification/confirm", undefined, { token: new URL(link).hash.slice(7) });
    sessions.push(await (await request("/api/auth/login", undefined, { email, password })).json());
  }
  const { house } = await (await request("/api/houses", sessions[0].token, { name: "G1 Visual QA" })).json();
  const { invite } = await (await request(`/api/houses/${house.id}/invites`, sessions[0].token, { maxUses: sessions.length, expiresInHours: 1 })).json();
  for (const session of sessions.slice(1)) {
    await request(`/api/invites/${invite.token}/accept`, session.token, {});
    if (presenceFixture && session === sessions.at(-1)) continue;
    const socket = io(api, { transports: ["websocket"], auth: { token: session.token }, extraHeaders: { Origin: origin } }); sockets.push(socket);
    socket.on("connect", () => socket.emit("room:join", { roomId: house.primaryRoomId, user: session.user }));
    socket.on("game:snapshot", (state) => { if (state?.phase === "LOBBY" && !state.players.some((player) => player.id === session.user.id)) socket.emit("game:action", { type: "join", roomId: state.roomId, sessionId: state.sessionId, roundId: state.roundId, revision: state.revision }, () => {}); });
  }
  console.log(JSON.stringify({ origin, party: `${origin}/house/${house.id}`, email: "g1visualhost@example.test", password: "local-visual-draw-123", note: "Synthetic disposable credentials; two local socket participants. Ctrl+C to close." }));
}
main().catch((error) => { console.error(error.message); void stop(); });
