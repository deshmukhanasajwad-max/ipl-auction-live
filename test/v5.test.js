const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs"), os = require("os"), path = require("path");
const { processMatch, buildStats } = require("../scripts/build-stats");
const { scanAssets, scanPhotos, loadPlayers } = require("../src/data");
const fetchAssets = require("../scripts/fetch-assets");

const del = (batter, bowler, runs, o = {}) => ({ batter, bowler, non_striker: "X", runs: { batter: runs, extras: 0, total: runs }, ...o });
const mk = (event, type, deliveries, extra = {}) => ({
  info: { gender: "male", match_type: type, dates: ["2025-04-01"], event: { name: event }, registry: { people: { "V Kohli": "id1", "JJ Bumrah": "id2" } }, players: { A: ["V Kohli"], B: ["JJ Bumrah"] } },
  innings: [{ team: "A", overs: [{ over: 0, deliveries }] }, ...(extra.so ? [{ team: "A", super_over: true, overs: [{ over: 0, deliveries: [del("V Kohli", "JJ Bumrah", 6)] }] }] : [])],
});

test("IPL and international blocks, high score (not-out star) and best bowling; super overs ignored", () => {
  const acc = new Map();
  processMatch(mk("Indian Premier League", "T20", [del("V Kohli", "JJ Bumrah", 6), del("V Kohli", "JJ Bumrah", 4), del("V Kohli", "JJ Bumrah", 0, { wickets: [{ player_out: "V Kohli", kind: "bowled" }] })], { so: true }), acc);
  processMatch(mk("x", "IT20", [del("V Kohli", "JJ Bumrah", 1), del("V Kohli", "JJ Bumrah", 0, { wickets: [{ player_out: "V Kohli", kind: "caught" }] })]), acc);
  const { out } = buildStats(acc, [{ name: "Virat Kohli" }, { name: "Jasprit Bumrah" }], { "Jasprit Bumrah": "JJ Bumrah" });
  const k = out["Virat Kohli"];
  assert.strictEqual(k.ipl.runs, 10);                 // the super-over six is not counted
  assert.strictEqual(k.ipl.hs, "10");
  assert.strictEqual(k.intl.runs, 1);
  assert.strictEqual(k.t20.runs, 11);
  assert.strictEqual(k.t20.hs, "10");
  assert.strictEqual(out["Jasprit Bumrah"].ipl.best, "1/10");
  assert.strictEqual(k.ipl.m, 1);
});
test("player without IPL games has ipl: null", () => {
  const acc = new Map();
  processMatch(mk("T20 Blast", "T20", [del("V Kohli", "JJ Bumrah", 2)]), acc);
  assert.strictEqual(buildStats(acc, [{ name: "Virat Kohli" }]).out["Virat Kohli"].ipl, null);
});
test("photo scan prefers the <slug>-ipl file over the plain one", () => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), "ph-"));
  for (const f of ["virat-kohli.jpg", "virat-kohli-ipl.png", "ms-dhoni.jpg"]) fs.writeFileSync(path.join(d, f), "x");
  const m = scanPhotos(d);
  assert.deepStrictEqual(m["virat-kohli"], { file: "/photos/virat-kohli-ipl.png", ipl: true });
  assert.strictEqual(m["ms-dhoni"].ipl, false);
  const list = loadPlayers(null, null, d), k = list.find(p => p.name === "Virat Kohli");
  assert.strictEqual(k.photo, "/photos/virat-kohli-ipl.png");
  assert.ok(k.photoIpl);
});
test("logos and themes are discovered by team id", () => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), "pub-"));
  fs.mkdirSync(path.join(d, "logos")); fs.mkdirSync(path.join(d, "audio", "themes"), { recursive: true });
  fs.writeFileSync(path.join(d, "logos", "csk.svg"), "<svg/>"); fs.writeFileSync(path.join(d, "audio", "themes", "MI.mp3"), "x");
  const a = scanAssets(d);
  assert.strictEqual(a.logos.CSK, "/logos/csk.svg"); assert.strictEqual(a.themes.MI, "/audio/themes/MI.mp3"); assert.ok(!a.logos.MI);
});
test("fetch-assets downloads listed files, keeps existing, rejects non-https", async () => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), "fa-")), file = path.join(d, "src.json");
  fs.writeFileSync(file, JSON.stringify({ photos: { "MS Dhoni": "https://x/d.jpg" }, logos: { CSK: "https://x/c.png", MI: "http://x/m.png" }, themes: { CSK: "https://x/c.mp3" } }));
  const types = { "https://x/d.jpg": "image/jpeg", "https://x/c.png": "image/png", "https://x/c.mp3": "audio/mpeg" };
  const fetchFn = async u => ({ ok: true, headers: { get: () => types[u] }, arrayBuffer: async () => Buffer.from("data") });
  const r = await fetchAssets.run({ file, pub: d, fetchFn, log() {} });
  assert.strictEqual(r.got, 3); assert.strictEqual(r.failed.length, 1);
  assert.ok(fs.existsSync(path.join(d, "photos", "ms-dhoni-ipl.jpg")) && fs.existsSync(path.join(d, "logos", "CSK.png")) && fs.existsSync(path.join(d, "audio", "themes", "CSK.mp3")));
  assert.strictEqual((await fetchAssets.run({ file, pub: d, fetchFn, log() {} })).got, 0);   // second run keeps files
});
