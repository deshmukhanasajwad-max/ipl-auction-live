const test = require("node:test");
const assert = require("node:assert");
const { Auction } = require("../src/auction");

const P = (id, name, o = {}) => ({ id, name, role: "Batter", country: "India", overseas: false, basePrice: 200, set: "Batters", prevTeam: "MI", status: "upcoming", extra: {}, ...o });
const wait = ms => new Promise(r => setTimeout(r, ms));
function room(players, config = {}) {
  const a = new Auction({ code: "TEST01", hostId: "host", hostName: "H", players, config: { bidMs: 40, rtmMs: 40, breakMs: 5, ...config } }, { event() {}, changed() {} });
  a.claimTeam("host", "H", "MI"); a.claimTeam("u2", "B", "CSK"); a.claimTeam("u3", "C", "RCB");
  return a;
}

test("lobby: a team can only be claimed once, one team per user", () => {
  const a = room([P(1, "A")]);
  assert.throws(() => a.claimTeam("u4", "D", "MI"), /taken/);
  assert.throws(() => a.claimTeam("u2", "B", "KKR"), /already own/);
  assert.throws(() => a.start("u2"), /host/);
});

test("bidding: increments, no self-outbid, sold to highest at timeout, purse deducted", async () => {
  const a = room([P(1, "A", { prevTeam: "KKR" })]);
  a.start("host");
  a.placeBid("host");                                   // 200
  assert.throws(() => a.placeBid("host"), /highest/);
  a.placeBid("u2");                                     // 220
  assert.strictEqual(a.bid.amount, 220);
  await wait(80);
  assert.strictEqual(a.teams.find(t => t.id === "CSK").squad.length, 1);
  assert.strictEqual(a.teams.find(t => t.id === "CSK").purse, 12000 - 220);
  assert.strictEqual(a.lastResult.sold, true);
});

test("timer resets on every bid", async () => {
  const a = room([P(1, "A")]);
  a.start("host");
  for (let i = 0; i < 4; i++) { a.placeBid(i % 2 ? "u2" : "host"); await wait(25); }
  assert.strictEqual(a.phase, "BIDDING");               // 100ms passed, but each bid reset the 40ms timer
  a.destroy();
});

test("overseas cap and squad rules enforced", () => {
  const a = room([P(1, "X", { overseas: true })], { maxOverseas: 0 });
  a.start("host");
  assert.throws(() => a.placeBid("host"), /Overseas/);
  a.destroy();
});

test("unsold players return in the accelerated round", async () => {
  const a = room([P(1, "A"), P(2, "B")], { accelerated: true });
  a.start("host");
  await wait(60);                                       // A unsold
  a.placeBid("host");                                   // bid B
  await wait(70);                                       // B sold, then accelerated round brings A back
  assert.strictEqual(a.round, 2);
  assert.strictEqual(a.current, 1);
  a.destroy();
});

test("by default every name appears only once (no accelerated round)", async () => {
  const a = room([P(1, "A"), P(2, "B")]);
  a.start("host");
  await wait(60);                                       // A unsold
  await wait(60);                                       // B unsold
  await wait(40);
  assert.strictEqual(a.status, "COMPLETED");
  assert.strictEqual(a.round, 1);
  assert.deepStrictEqual(a.history.filter(h => h.kind === "unsold").map(h => h.player), ["A", "B"]);
});

test("auction completes when everything is sold/unsold twice", async () => {
  const a = room([P(1, "A")], { accelerated: true });
  a.start("host");
  await wait(150);
  assert.strictEqual(a.status, "COMPLETED");
});

test("RTM: previous team can match and uses a card", async () => {
  const a = room([P(1, "A", { prevTeam: "CSK" })], { rtmCards: 1 });
  a.start("host");
  a.placeBid("host");                                   // MI wins at 200
  await wait(60);
  assert.strictEqual(a.phase, "RTM");
  assert.throws(() => a.rtmDecision("u3", true), /Not your RTM/);
  a.rtmDecision("u2", true);                            // CSK matches
  const csk = a.teams.find(t => t.id === "CSK");
  assert.strictEqual(csk.squad.length, 1);
  assert.strictEqual(csk.rtmCards, 0);
  assert.strictEqual(a.teams.find(t => t.id === "MI").squad.length, 0);
});

test("RTM declined or timed out: winner keeps player", async () => {
  const a = room([P(1, "A", { prevTeam: "CSK" })], { rtmCards: 1 });
  a.start("host");
  a.placeBid("host");
  await wait(120);
  assert.strictEqual(a.teams.find(t => t.id === "MI").squad.length, 1);
});

test("pause and resume keep the remaining time", async () => {
  const a = room([P(1, "A")], { bidMs: 200 });
  a.start("host");
  await wait(50);
  a.pause("host");
  assert.ok(a.pausedLeft > 100 && a.pausedLeft < 200);
  await wait(250);
  assert.strictEqual(a.phase, "BIDDING");               // nothing happened while paused
  a.resume("host");
  assert.strictEqual(a.status, "LIVE");
  a.destroy();
});

test("persistence round-trip pauses a live auction", () => {
  const a = room([P(1, "A")]);
  a.start("host"); a.placeBid("host");
  const b = Auction.fromJSON(JSON.parse(JSON.stringify(a)), {});
  assert.strictEqual(b.status, "PAUSED");
  assert.strictEqual(b.bid.amount, 200);
  a.destroy();
});

test("public state never leaks user ids", () => {
  const a = room([P(1, "A")]);
  const s = JSON.stringify(a.publicState("u2"));
  assert.ok(!s.includes('"u2"') && !s.includes("host\""));
});

// ---- v5: end round / end auction / coach ----
const { Auction: A5 } = require("../src/auction");
function live() {
  const a = new A5({ code: "TST005", hostId: "host-00001", config: { bidMs: 60000, breakMs: 60000 } });
  a.claimTeam("host-00001", "H", "MI"); a.claimTeam("guest-0002", "G", "CSK"); a.start("host-00001");
  return a;
}
test("end round settles the current player and skips the rest of that set", () => {
  const a = live(), first = a._p(a.current), set = first.set;
  const inSet = a.players.filter(p => p.set === set).length;
  a.placeBid("guest-0002");
  a.endRound("host-00001");
  assert.strictEqual(first.status, "sold");
  assert.ok(a.queue.every(id => a._p(id).set !== set));
  assert.strictEqual(a.players.filter(p => p.set === set && p.status === "unsold").length, inSet - 1);
  a.destroy();
});
test("end round: unsold current player and non-host rejected", () => {
  const a = live();
  assert.throws(() => a.endRound("guest-0002"), /Host only/);
  const p = a._p(a.current); a.endRound("host-00001");
  assert.strictEqual(p.status, "unsold");
  a.destroy();
});
test("end auction completes immediately, leaves everything else unsold, builds compare", () => {
  const a = live();
  a.placeBid("guest-0002"); a.endAuction("host-00001");
  assert.strictEqual(a.status, "COMPLETED"); assert.ok(a.endedEarly);
  assert.strictEqual(a.players.filter(p => p.status === "upcoming").length, 0);
  assert.strictEqual(a.publicState("host-00001").compare.length, 2);
  assert.strictEqual(a.teams.find(t => t.id === "CSK").squad.length, 1);
  assert.throws(() => a.endAuction("host-00001"), /not running/);
  a.destroy();
});
test("sell now / skip are removed from the engine", () => { assert.strictEqual(typeof A5.prototype.hostAction, "undefined"); });
test("coach: empty squad needs a keeper and bowlers; live player gets a fit verdict", () => {
  const a = live(), st = a.publicState("guest-0002");
  assert.ok(st.insights.headline);
  assert.ok(st.insights.needs.some(n => n.role === "Wicketkeeper" && n.priority === "high"));
  assert.ok(st.insights.live && ["must", "good", "luxury", "blocked"].includes(st.insights.live.fit));
  assert.strictEqual(a.publicState(null).insights, null);   // spectators get no team advice
  a.destroy();
});
test("progress reports the 16 sets in order with counts", () => {
  const a = live(), pr = a.publicState("host-00001").progress;
  assert.strictEqual(pr.set, "Capped Indian Batter");
  assert.ok(pr.sets.length <= 16 && pr.total === a.players.length && pr.done === 0);
  a.destroy();
});
