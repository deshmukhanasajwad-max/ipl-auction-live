const test = require("node:test");
const assert = require("node:assert");
const { processMatch, buildStats, matchLevel, yearRec } = require("../scripts/build-stats");

const del = (batter, bowler, o = {}) => ({ batter, bowler, non_striker: "X", runs: { batter: 0, extras: 0, total: 0, ...(o.runs || {}) }, ...(o.extras ? { extras: o.extras } : {}), ...(o.wickets ? { wickets: o.wickets } : {}) });
const match = (year, deliveries, type = "T20", gender = "male") => ({
  info: { gender, match_type: type, dates: [`${year}-04-01`], registry: { people: { "V Kohli": "id1", "JJ Bumrah": "id2", "Rashid Khan": "id3" } },
    players: { A: ["V Kohli"], B: ["JJ Bumrah", "Rashid Khan"] } },
  innings: [{ team: "A", overs: [{ over: 0, deliveries }] }],
});

test("batting and bowling aggregation (wides, extras, wickets)", () => {
  const acc = new Map();
  const ok = processMatch(match(2025, [
    del("V Kohli", "JJ Bumrah", { runs: { batter: 4, total: 4 } }),
    del("V Kohli", "JJ Bumrah", { runs: { extras: 1, total: 1 }, extras: { wides: 1 } }),
    del("V Kohli", "JJ Bumrah", { wickets: [{ player_out: "V Kohli", kind: "bowled" }] }),
  ]), acc);
  assert.ok(ok);
  const k = yearRec(acc.get("id1"), 2025), b = yearRec(acc.get("id2"), 2025);
  assert.deepStrictEqual([k.m, k.runs, k.balls, k.outs, k.fours, k.inn], [1, 4, 2, 1, 1, 1]);
  assert.deepStrictEqual([b.bb, b.br, b.w], [2, 5, 1]);          // wide is charged to the bowler but is not a legal ball
});
test("run outs do not count as bowler wickets; retired hurt is not an out", () => {
  const acc = new Map();
  processMatch(match(2024, [del("V Kohli", "JJ Bumrah", { wickets: [{ player_out: "V Kohli", kind: "run out" }] })]), acc);
  assert.strictEqual(yearRec(acc.get("id2"), 2024).w, 0);
  assert.strictEqual(yearRec(acc.get("id1"), 2024).outs, 1);
});
test("women's and non-T20 matches are ignored", () => {
  const acc = new Map();
  assert.ok(!processMatch(match(2025, [], "T20", "female"), acc));
  assert.ok(!processMatch(match(2025, [], "ODI"), acc));
});
test("centuries and fifties are counted per innings", () => {
  const acc = new Map();
  const d = n => [...Array(n)].map(() => del("V Kohli", "JJ Bumrah", { runs: { batter: 1, total: 1 } }));
  processMatch(match(2025, d(100)), acc); processMatch(match(2025, d(60)), acc); processMatch(match(2025, d(10)), acc);
  const k = yearRec(acc.get("id1"), 2025);
  assert.deepStrictEqual([k.h, k.f, k.inn, k.m], [1, 1, 3, 3]);
});
test("name matching handles initials and full names", () => {
  assert.strictEqual(matchLevel("Virat Kohli", "V Kohli"), 1);
  assert.strictEqual(matchLevel("Rashid Khan", "Rashid Khan"), 3);
  assert.strictEqual(matchLevel("Tilak Varma", "N Tilak Varma"), 2);
  assert.strictEqual(matchLevel("Quinton de Kock", "Q de Kock"), 1);
  assert.strictEqual(matchLevel("Rohit Sharma", "I Sharma"), 0);
});
test("buildStats produces career + yearly numbers and reports unmatched players", () => {
  const acc = new Map();
  processMatch(match(2025, [del("V Kohli", "JJ Bumrah", { runs: { batter: 6, total: 6 } }), del("V Kohli", "JJ Bumrah", { wickets: [{ player_out: "V Kohli", kind: "caught" }] })]), acc);
  const { out, report } = buildStats(acc, [{ name: "Virat Kohli" }, { name: "Nobody Atall" }]);
  assert.strictEqual(out["Virat Kohli"].t20.runs, 6);
  assert.strictEqual(out["Virat Kohli"].t20.sr, 300);
  assert.strictEqual(out["Virat Kohli"].years["2025"].m, 1);
  assert.deepStrictEqual(report.unmatched, ["Nobody Atall"]);
});
test("zip files are readable (adm-zip) and processed end to end", () => {
  const AdmZip = require("adm-zip"), z = new AdmZip();
  z.addFile("1.json", Buffer.from(JSON.stringify(match(2025, [del("V Kohli", "JJ Bumrah", { runs: { batter: 4, total: 4 } })]))));
  z.addFile("README.txt", Buffer.from("hi"));
  const acc = new Map(); let n = 0;
  for (const e of new AdmZip(z.toBuffer()).getEntries()) if (e.entryName.endsWith(".json") && processMatch(JSON.parse(e.getData().toString()), acc)) n++;
  assert.strictEqual(n, 1);
});

test("per-league breakdown: IPL and T20 internationals are listed separately and sum to the career", () => {
  const acc = new Map();
  const m1 = match(2025, [del("V Kohli", "JJ Bumrah", { runs: { batter: 6, total: 6 } })]); m1.info.event = { name: "Indian Premier League" };
  const m2 = match(2024, [del("V Kohli", "JJ Bumrah", { runs: { batter: 4, total: 4 } })], "IT20");
  const m3 = match(2026, [del("V Kohli", "JJ Bumrah", { runs: { batter: 1, total: 1 } })]); m3.info.event = { name: "Big Bash League 2025/26" };
  [m1, m2, m3].forEach(m => processMatch(m, acc));
  const { out } = buildStats(acc, [{ name: "Virat Kohli" }]);
  const v = out["Virat Kohli"];
  assert.deepStrictEqual(v.leagues.map(l => l.name).sort(), ["Big Bash League", "Indian Premier League", "T20 Internationals"]);
  assert.strictEqual(v.leagues.reduce((t, l) => t + l.runs, 0), v.t20.runs);
  assert.strictEqual(v.t20.runs, 11);
  assert.deepStrictEqual([v.years["2024"].runs, v.years["2025"].runs, v.years["2026"].runs].length, 3);
});
