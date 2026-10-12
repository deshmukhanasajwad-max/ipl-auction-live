const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs"), os = require("os"), path = require("path");
const { slug, lookup, run } = require("../scripts/build-photos");

const api = pages => ({ ok: true, status: 200, json: async () => ({ query: { pages } }) });
const img = () => ({ ok: true, status: 200, headers: { get: () => "image/jpeg" }, arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer });
function fakeFetch(db) {   // db: query-substring -> pages
  return async (url) => {
    if (url.includes("upload.wikimedia")) return img();
    const q = decodeURIComponent(url.split("gsrsearch=")[1]);
    for (const [k, pages] of Object.entries(db)) if (q.startsWith(k)) return api(pages);
    return api({});
  };
}

test("slug", () => { assert.strictEqual(slug("Quinton de Kock"), "quinton-de-kock"); assert.strictEqual(slug("Lhuan-dre Pretorius"), "lhuan-dre-pretorius"); });

test("lookup picks the cricketer page with a thumbnail and the surname in the title", async () => {
  const f = fakeFetch({ "Tim David cricketer": {
    1: { index: 1, title: "Tim David", description: "Singaporean footballer", thumbnail: { source: "https://upload.wikimedia.org/wrong.jpg" } },
    2: { index: 2, title: "Tim David (cricketer)", description: "Australian cricketer (born 1996)", thumbnail: { source: "https://upload.wikimedia.org/right.jpg" } } } });
  const hit = await lookup("Tim David", f);
  assert.strictEqual(hit.url, "https://upload.wikimedia.org/right.jpg");
});
test("lookup refuses pages about someone else", async () => {
  const f = fakeFetch({ "Ravi Singh": { 1: { index: 1, title: "Harbhajan Kumar", description: "Indian cricketer", thumbnail: { source: "https://upload.wikimedia.org/x.jpg" } } } });
  assert.strictEqual(await lookup("Ravi Singh", f), null);
});

test("run downloads photos, keeps existing files, reports missing players, writes the map", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ph-")), out = path.join(dir, "photos"), map = path.join(dir, "photos.json");
  fs.mkdirSync(out); fs.writeFileSync(path.join(out, "my-own.png"), "x");           // a manually added photo
  const f = fakeFetch({ "Virat Kohli": { 1: { index: 1, title: "Virat Kohli", description: "Indian cricketer", thumbnail: { source: "https://upload.wikimedia.org/vk.jpg" } } } });
  const r = await run({ players: [{ name: "Virat Kohli" }, { name: "My Own" }, { name: "Unknown Person" }], outDir: out, mapFile: map, fetchFn: f, delay: 0, log: () => {} });
  assert.deepStrictEqual([r.got, r.kept, r.missing], [1, 1, ["Unknown Person"]]);
  const m = JSON.parse(fs.readFileSync(map, "utf8"));
  assert.strictEqual(m["Virat Kohli"], "/photos/virat-kohli.jpg");
  assert.strictEqual(m["My Own"], "/photos/my-own.png");
  assert.ok(fs.existsSync(path.join(out, "virat-kohli.jpg")));
  assert.ok(!("Unknown Person" in m));
});
