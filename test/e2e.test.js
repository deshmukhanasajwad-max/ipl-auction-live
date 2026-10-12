// End-to-end over real sockets: two teams join a room by code, claim, bid, and a player is sold.
const test = require("node:test");
const assert = require("node:assert");
process.env.ROOMS_FILE = require("os").tmpdir() + "/ipl-e2e-rooms.json";
const { server } = require("../index");
const { io: ioc } = require("socket.io-client");

const wait = ms => new Promise(r => setTimeout(r, ms));
function client(base) {            // remembers the latest state and every event
  const s = ioc(base); s.last = null; s.events = [];
  s.on("state", st => { s.last = st; });
  s.onAny((ev, d) => s.events.push([ev, d]));
  s.until = async (pred, ms = 3000) => { const t = Date.now(); while (Date.now() - t < ms) { if (s.last && pred(s.last)) return s.last; await wait(20); } throw new Error("timeout waiting for state"); };
  s.event = async (name, ms = 3000) => { const t = Date.now(); while (Date.now() - t < ms) { const e = s.events.find(x => x[0] === name); if (e) return e[1]; await wait(20); } throw new Error("timeout waiting for " + name); };
  return s;
}
let port;
test.before(() => new Promise(r => server.listen(0, () => { port = server.address().port; r(); })));
test.after(() => { server.closeAllConnections?.(); server.close(); setTimeout(() => process.exit(0), 200).unref(); });

test("create room, join by code, claim, start, bid, sell, no id leaks", async () => {
  const base = `http://localhost:${port}`;
  const { code } = await (await fetch(base + "/api/rooms", { method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userId: "hostuser0001", name: "Host", options: { bidSeconds: 5 } }) })).json();
  assert.match(code, /^[A-Z2-9]{6}$/);

  const a = client(base), b = client(base);
  a.emit("join_room", { code, userId: "hostuser0001", name: "Host" });
  b.emit("join_room", { code: code.toLowerCase(), userId: "guestuser002", name: "Guest" });
  await a.until(s => s.you.isHost); await b.until(s => !s.you.isHost);

  a.emit("claim_team", { teamId: "MI" });
  await b.until(s => s.teams.find(t => t.id === "MI").claimed);
  b.emit("claim_team", { teamId: "MI" });
  assert.match(await b.event("error_msg"), /taken/);
  b.emit("claim_team", { teamId: "CSK" });
  await a.until(s => s.teams.find(t => t.id === "CSK").claimed);

  a.emit("start_auction");
  const up = await b.event("player_up");                  // payload used by the voice announcer
  assert.ok(up.name && up.basePrice && up.role);
  await b.until(s => s.phase === "BIDDING" && s.current);

  a.emit("place_bid");
  const st = await b.until(s => s.bid.teamId === "MI");
  assert.strictEqual(st.bid.amount, up.basePrice);
  assert.strictEqual(st.you.teamId, "CSK");
  assert.ok(!JSON.stringify(st).includes("hostuser0001"), "user ids must not leak");
  assert.strictEqual((await b.event("bid")).amount, up.basePrice);

  a.emit("host_action", { action: "sell_now" });
  const sold = await b.event("player_sold");
  assert.strictEqual(sold.teamId, "MI");
  a.close(); b.close();
});
