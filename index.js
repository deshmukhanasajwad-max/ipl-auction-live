const express = require("express");
const http = require("http");
const path = require("path");
const { Server } = require("socket.io");
const store = require("./src/store");

const app = express();
app.use(express.json({ limit: "10kb" }));
app.use(express.static(path.join(__dirname, "public")));
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: process.env.CLIENT_URL || false } });

// ---- broadcasting: every socket gets its own view (so user ids / "you" info never leak) ----
function broadcast(a) {
  const online = new Set(a.sockets.values());
  for (const [sid, uid] of a.sockets) io.to(sid).emit("state", a.publicState(uid, online));
}
const hooksFor = code => ({
  event: (type, payload) => io.to(code).emit(type, payload),
  changed: () => { const a = store.rooms.get(code); if (a) { broadcast(a); store.save(); } },
});
store.load(hooksFor);

// ---- rate limiting (simple) for REST + code guessing ----
const hits = new Map();
const limited = (key, max, ms) => {
  const now = Date.now(), arr = (hits.get(key) || []).filter(t => now - t < ms);
  arr.push(now); hits.set(key, arr);
  return arr.length > max;
};
setInterval(() => hits.clear(), 10 * 60 * 1000).unref();

// ---- REST ----
const num = (v, lo, hi, d) => { const n = Number(v); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d; };
app.post("/api/rooms", (req, res) => {
  if (limited("create:" + req.ip, 10, 60_000)) return res.status(429).json({ error: "Too many rooms, slow down" });
  const { userId, name, options = {} } = req.body || {};
  if (!userId || String(userId).length < 8) return res.status(400).json({ error: "userId required" });
  const config = {
    purse: num(options.purseCr, 50, 300, 120) * 100,         // Cr -> lakh
    bidMs: num(options.bidSeconds, 5, 60, 15) * 1000,
    rtmCards: Math.round(num(options.rtmCards, 0, 6, 0)),
    accelerated: options.accelerated === true || options.accelerated === "true",
  };
  const a = store.create({ hostId: userId, hostName: String(name || "Host").slice(0, 24), config }, hooksFor);
  res.json({ code: a.code, url: `/room/${a.code}` });
});
app.get("/api/rooms/:code", (req, res) => {
  if (limited("lookup:" + req.ip, 60, 60_000)) return res.status(429).json({ error: "Too many attempts" });
  const a = store.rooms.get(req.params.code.toUpperCase());
  if (!a) return res.status(404).json({ error: "Room not found" });
  res.json({ code: a.code, status: a.status });
});
app.get("/room/:code", (_req, res) => res.sendFile(path.join(__dirname, "public", "index.html")));
app.get("/health", (_req, res) => res.json({ ok: true, rooms: store.rooms.size }));

// ---- sockets ----
io.on("connection", socket => {
  const room = () => store.rooms.get(socket.data.code);
  // run an engine action; errors go back to this socket only
  const act = fn => { const a = room(); if (!a) return socket.emit("error_msg", "Join a room first"); try { fn(a, socket.data.userId); } catch (e) { socket.emit("error_msg", e.message); } };

  socket.on("join_room", ({ code, userId, name } = {}) => {
    if (limited("join:" + socket.handshake.address, 30, 60_000)) return socket.emit("error_msg", "Too many attempts, wait a minute");
    const a = store.rooms.get(String(code || "").toUpperCase());
    if (!a || !userId || String(userId).length < 8) return socket.emit("error_msg", "Invalid room code");
    socket.data = { code: a.code, userId, name: String(name || "Player").slice(0, 24) };
    socket.join(a.code);
    a.sockets.set(socket.id, userId);
    socket.emit("joined", { code: a.code });
    broadcast(a);
  });
  socket.on("claim_team", ({ teamId } = {}) => act((a, u) => a.claimTeam(u, socket.data.name, teamId)));
  socket.on("release_team", ({ teamId } = {}) => act((a, u) => a.releaseTeam(u, teamId)));
  socket.on("start_auction", () => act((a, u) => a.start(u)));
  socket.on("place_bid", () => act((a, u) => a.placeBid(u)));
  socket.on("rtm_decision", ({ match } = {}) => act((a, u) => a.rtmDecision(u, match)));
  socket.on("pause", () => act((a, u) => a.pause(u)));
  socket.on("resume", () => act((a, u) => a.resume(u)));
  socket.on("host_action", ({ action } = {}) => act((a, u) => a.hostAction(u, action)));
  socket.on("disconnect", () => { const a = room(); if (a) { a.sockets.delete(socket.id); broadcast(a); } });
});

const PORT = process.env.PORT || 4000;
if (require.main === module) server.listen(PORT, () => {
  console.log(`IPL Auction running on http://localhost:${PORT}`);
  const fs = require("fs");
  if (!fs.existsSync(path.join(__dirname, "data", "photos.json"))) console.log("Tip: run `npm run photos` once to download player photos.");
  if (!fs.existsSync(path.join(__dirname, "data", "stats.json"))) console.log("Tip: run `npm run stats` once to load T20 stats (or `npm run setup-data` for both).");
});
module.exports = { server, io };
