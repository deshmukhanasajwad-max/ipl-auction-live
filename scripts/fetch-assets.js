#!/usr/bin/env node
// Downloads photos / logos / theme songs YOU list in data/asset-sources.json (only use files you have the right to use).
//   { "photos": { "MS Dhoni": "https://.../dhoni.jpg" }, "logos": { "CSK": "https://.../csk.png" }, "themes": { "CSK": "https://.../csk.mp3" } }
// Photos land in public/photos/<slug>-ipl.<ext> (preferred over Wikipedia photos), logos in public/logos/<TEAM>.<ext>,
// themes in public/audio/themes/<TEAM>.<ext>. Existing files are kept. Or just drop files in those folders yourself.
const fs = require("fs"), path = require("path");
const ROOT = path.join(__dirname, "..");
const UA = "IPLAuctionLive/5.0 (hobby project)";
const EXT = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif", "image/svg+xml": "svg", "audio/mpeg": "mp3", "audio/ogg": "ogg", "audio/mp4": "m4a", "audio/x-m4a": "m4a", "audio/wav": "wav", "audio/x-wav": "wav" };
const slug = n => require("../src/data").slug(n);

async function run({ file = path.join(ROOT, "data", "asset-sources.json"), pub = path.join(ROOT, "public"), fetchFn = fetch, log = console.log } = {}) {
  let src; try { src = JSON.parse(fs.readFileSync(file, "utf8")); } catch { return { got: 0, kept: 0, failed: [], skipped: true }; }
  const jobs = [];
  for (const [n, u] of Object.entries(src.photos || {})) jobs.push({ dir: "photos", base: slug(n) + "-ipl", url: u, kind: "image" });
  for (const [t, u] of Object.entries(src.logos || {})) jobs.push({ dir: "logos", base: t.toUpperCase(), url: u, kind: "image" });
  for (const [t, u] of Object.entries(src.themes || {})) jobs.push({ dir: path.join("audio", "themes"), base: t.toUpperCase(), url: u, kind: "audio" });
  let got = 0, kept = 0; const failed = [];
  for (const j of jobs) {
    const dir = path.join(pub, j.dir); fs.mkdirSync(dir, { recursive: true });
    const have = fs.readdirSync(dir).find(f => path.parse(f).name === j.base);
    if (have) { kept++; continue; }
    try {
      if (!/^https:\/\//i.test(j.url)) throw new Error("only https URLs");
      const r = await fetchFn(j.url, { headers: { "User-Agent": UA } });
      if (!r.ok) throw new Error("HTTP " + r.status);
      const type = (r.headers.get("content-type") || "").split(";")[0].trim();
      const ext = EXT[type] || path.extname(new URL(j.url).pathname).slice(1).toLowerCase();
      if (!ext || !(type.startsWith(j.kind) || EXT[type])) throw new Error("not an " + j.kind + " file (" + type + ")");
      fs.writeFileSync(path.join(dir, `${j.base}.${ext}`), Buffer.from(await r.arrayBuffer()));
      got++; log(`asset: ${j.dir}/${j.base}.${ext}`);
    } catch (e) { failed.push(`${j.base} (${e.message})`); }
  }
  return { got, kept, failed, total: jobs.length };
}
if (require.main === module) run().then(r => {
  if (r.skipped) return console.log("No data/asset-sources.json: skipping extra assets (that file is optional).");
  console.log(`Assets: ${r.got} downloaded, ${r.kept} already present, ${r.failed.length} failed.`);
  if (r.failed.length) console.log("Failed:\n  " + r.failed.join("\n  "));
}).catch(e => { console.error(e); process.exit(0); });
module.exports = { run };
