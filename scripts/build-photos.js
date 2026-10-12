#!/usr/bin/env node
// Downloads a photo for every player from Wikipedia (Wikimedia) into public/photos/ and writes data/photos.json.
//   npm run photos         (needs internet; safe to re-run: existing files are kept)
// Put your own image at public/photos/<player-name-slug>.jpg (e.g. virat-kohli.jpg) and it is used instead.
// Players without a Wikipedia photo (many uncapped youngsters) simply show initials in the app.
const fs = require("fs"), path = require("path");
const ROOT = path.join(__dirname, "..");
const UA = "IPLAuctionLive/3.0 (hobby project; photo lookup for a cricket auction game)";
const EXT = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif" };

const norm = s => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[.'’]/g, "").replace(/-/g, " ").trim();
const slug = n => norm(n).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const wait = ms => new Promise(r => setTimeout(r, ms));

async function get(url, fetchFn, tries = 4) {          // polite: sends a User-Agent, backs off on 429/5xx
  for (let i = 0; i < tries; i++) {
    const r = await fetchFn(url, { headers: { "User-Agent": UA, "Api-User-Agent": UA } });
    if (r.ok) return r;
    if (r.status === 429 || r.status >= 500) { await wait(1000 * (i + 1) * (i + 1)); continue; }
    throw new Error("HTTP " + r.status);
  }
  throw new Error("too many retries");
}

// find the Wikipedia lead image of "<name> cricketer"; the page must be about a cricketer with the surname in its title
async function lookup(name, fetchFn = fetch) {
  const last = norm(name).split(" ").pop();
  for (const q of [`${name} cricketer`, name]) {
    const u = "https://en.wikipedia.org/w/api.php?action=query&format=json&generator=search&gsrlimit=5&prop=pageimages|description&piprop=thumbnail&pithumbsize=500&gsrsearch=" + encodeURIComponent(q);
    const j = await (await get(u, fetchFn)).json();
    const pages = Object.values((j.query && j.query.pages) || {}).sort((a, b) => a.index - b.index);
    const hit = pages.find(p => p.thumbnail && /cricket/i.test(p.description || "") && norm(p.title).includes(last));
    if (hit) return { url: hit.thumbnail.source, title: hit.title };
  }
  return null;
}

const existing = (dir, s) => ["jpg", "png", "webp", "gif", "jpeg"].map(e => `${s}.${e}`).find(f => fs.existsSync(path.join(dir, f)));

async function run({ players, outDir = path.join(ROOT, "public", "photos"), mapFile = path.join(ROOT, "data", "photos.json"), fetchFn = fetch, delay = 120, log = console.log }) {
  fs.mkdirSync(outDir, { recursive: true });
  let map = {}; try { map = JSON.parse(fs.readFileSync(mapFile, "utf8")); } catch {}
  const missing = [], failed = []; let got = 0, kept = 0;
  for (const p of players) {
    const s = slug(p.name), have = existing(outDir, s);
    if (have) { map[p.name] = "/photos/" + have; kept++; continue; }
    try {
      const hit = await lookup(p.name, fetchFn);
      if (!hit) { missing.push(p.name); continue; }
      const r = await get(hit.url, fetchFn), ext = EXT[(r.headers.get("content-type") || "").split(";")[0]] || "jpg";
      fs.writeFileSync(path.join(outDir, `${s}.${ext}`), Buffer.from(await r.arrayBuffer()));
      map[p.name] = `/photos/${s}.${ext}`; got++;
      log(`photo: ${p.name}  (${hit.title})`);
    } catch (e) { failed.push(`${p.name} (${e.message})`); }
    await wait(delay);
  }
  fs.mkdirSync(path.dirname(mapFile), { recursive: true });
  fs.writeFileSync(mapFile, JSON.stringify(map, null, 1));
  return { got, kept, missing, failed, total: players.length };
}

async function main() {
  const players = require("../src/data").loadPlayers(path.join(ROOT, "data", "players.csv"));
  console.log(`Looking up ${players.length} players on Wikipedia (about 2-4 minutes)...`);
  const r = await run({ players });
  console.log(`\nDone. ${r.got} downloaded, ${r.kept} already had a photo, ${r.missing.length} not found, ${r.failed.length} failed (of ${r.total}).`);
  if (r.missing.length) console.log("\nNo Wikipedia photo (initials will show). Drop your own file in public/photos/<slug>.jpg:\n  " + r.missing.map(n => `${n} -> ${slug(n)}.jpg`).join("\n  "));
  if (r.failed.length) console.log("\nFailed (check internet, run again):\n  " + r.failed.join("\n  "));
  if (r.failed.length === r.total) { console.error("\nNothing could be downloaded: are you online?"); process.exit(1); }
}
if (require.main === module) main().catch(e => { console.error(e); process.exit(1); });
module.exports = { slug, lookup, run };
