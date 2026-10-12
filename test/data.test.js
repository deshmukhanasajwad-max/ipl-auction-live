const test = require("node:test");
const assert = require("node:assert");
const path = require("path");
const { loadPlayers, SET_ORDER, builtInPlayers } = require("../src/data");

test("every player name appears exactly once", () => {
  const l = loadPlayers(path.join(__dirname, "..", "data", "players.csv"));
  assert.strictEqual(new Set(l.map(p => p.name.toLowerCase())).size, l.length);
  assert.strictEqual(builtInPlayers().length, l.length);
});
test("16 categories, capped before uncapped, uncapped overseas before uncapped Indian", () => {
  assert.strictEqual(SET_ORDER.length, 16);
  assert.ok(SET_ORDER.slice(0, 8).every(s => s.startsWith("Capped")));
  assert.ok(SET_ORDER.slice(8).every(s => s.startsWith("Uncapped")));
  assert.strictEqual(SET_ORDER[0], "Capped Indian Batter");
  assert.strictEqual(SET_ORDER[1], "Capped Overseas Batter");
  for (const r of ["Batter", "Bowler", "Allrounder", "Wicket Keeper"]) assert.ok(SET_ORDER.indexOf(`Uncapped Overseas ${r}`) < SET_ORDER.indexOf(`Uncapped Indian ${r}`));
});
test("players are queued strictly in category order and each belongs to its category", () => {
  const l = loadPlayers();
  let last = -1;
  for (const p of l) {
    const i = SET_ORDER.indexOf(p.set);
    assert.ok(i >= last, `${p.name} out of order`); last = i;
    assert.strictEqual(p.set.includes("Overseas"), p.overseas);
    assert.strictEqual(p.set.startsWith("Capped"), p.capped);
  }
});
