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
