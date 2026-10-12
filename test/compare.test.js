const test = require("node:test");
const assert = require("node:assert");
const { buildCompare, pickXI } = require("../src/compare");

let id = 0;
const pl = (name, role, rating, overseas = false) => ({ id: ++id, name, role, rating, overseas, capped: true });
function team(tid, owners, list, purse = 1000) {
  return { id: tid, name: tid + " FC", color: "#fff", ownerName: "o", purse, squad: list.map(p => ({ id: p.id, name: p.name, role: p.role, overseas: p.overseas, capped: true, price: 100 })) };
}
const mk = (prefix, base) => [
  ...[...Array(6)].map((_, i) => pl(`${prefix}Bat${i}`, "Batter", base - i)),
  pl(`${prefix}Wk`, "Wicketkeeper", base),
  ...[...Array(4)].map((_, i) => pl(`${prefix}AR${i}`, "All-rounder", base - i, i < 3)),
  ...[...Array(7)].map((_, i) => pl(`${prefix}Bowl${i}`, "Bowler", base - i, i < 4)),
];

test("best XI respects 11 players, <=4 overseas, a keeper, 5+ bowling options", () => {
  const sq = mk("A", 85).map(p => ({ ...p, score: p.rating }));
  const xi = pickXI(sq);
  assert.strictEqual(xi.length, 11);
  assert.ok(xi.filter(p => p.overseas).length <= 4);
  assert.ok(xi.some(p => p.role === "Wicketkeeper"));
  assert.ok(xi.filter(p => p.role === "Bowler" || p.role === "All-rounder").length >= 5);
});

test("compare ranks stronger squads higher, scores 0-10, SWOT lists never empty", () => {
  const strong = mk("S", 88), weak = mk("W", 58);
  const all = [...strong, ...weak];
  const res = buildCompare([team("WEAK", 0, weak), team("STRONG", 0, strong)], all, {}, { minSquad: 18, maxSquad: 25 });
  assert.strictEqual(res[0].teamId, "STRONG");
  assert.ok(res[0].overall > res[1].overall);
  for (const r of res) {
    assert.ok(r.overall >= 0 && r.overall <= 10);
    assert.strictEqual(r.xi.length, 11);
    for (const k of ["strengths", "weaknesses", "opportunities", "threats"]) assert.ok(r.swot[k].length >= 1, k);
    for (const k of ["batting", "bowling", "allround", "depth", "balance"]) assert.ok(r.scores[k] >= 0 && r.scores[k] <= 10);
  }
});

test("missing wicketkeeper and short squad are flagged as weaknesses", () => {
  const sq = mk("X", 80).filter(p => p.role !== "Wicketkeeper").slice(0, 12);
  const [r] = buildCompare([team("X", 0, sq)], sq, {}, { minSquad: 18, maxSquad: 25 });
  assert.ok(r.swot.weaknesses.some(w => /wicketkeeper/i.test(w)));
  assert.ok(r.swot.weaknesses.some(w => /minimum/i.test(w)));
});

test("stats nudge the player score", () => {
  const { playerScore } = require("../src/compare");
  const p = { role: "Batter", rating: 70 };
  assert.ok(playerScore(p, { t20: { m: 100, runs: 3000, sr: 160, avg: 40, wkts: 0 } }) > 70);
  assert.ok(playerScore(p, { t20: { m: 100, runs: 2000, sr: 115, avg: 18, wkts: 0 } }) < 70);
  assert.strictEqual(playerScore(p, null), 70);
});
