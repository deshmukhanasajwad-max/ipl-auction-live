const test = require("node:test");
const assert = require("node:assert");
const { CONFIG, increment, nextBid, canBid } = require("../src/rules");
const team = (purse, n = 0, os = 0) => ({ purse, squad: [...Array(n)].map((_, i) => ({ overseas: i < os })) });

test("purse is 120 Cr = 12000 lakh", () => assert.strictEqual(CONFIG.purse, 12000));
test("increments", () => {
  assert.deepStrictEqual([50, 100, 199, 200, 499, 500, 2000].map(increment), [5, 10, 10, 20, 20, 25, 25]);
});
test("first bid is base, then + increment", () => {
  assert.strictEqual(nextBid(0, 200), 200);
  assert.strictEqual(nextBid(200, 200), 220);
  assert.strictEqual(nextBid(500, 200), 525);
});
test("squad and overseas caps", () => {
  assert.match(canBid(team(12000, 25), { overseas: false }, 50), /full/);
  assert.match(canBid(team(12000, 10, 8), { overseas: true }, 50), /Overseas/);
  assert.strictEqual(canBid(team(12000, 10, 8), { overseas: false }, 50), null);
});
test("purse reserve keeps squad completable", () => {
  // empty squad: 17 more players * 30 lakh = 510 reserved -> max bid 11490
  assert.strictEqual(canBid(team(12000), { overseas: false }, 11490), null);
  assert.match(canBid(team(12000), { overseas: false }, 11500), /purse/i);
});
