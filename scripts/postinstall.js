#!/usr/bin/env node
// Runs after `npm install`. On Render (or when SETUP_DATA=1) it downloads player photos, extra assets and T20 stats
// so the live site has them without any manual step. It never fails the build: if a download breaks, the app still starts.
const { spawnSync } = require("child_process"), path = require("path");
if (!(process.env.RENDER || process.env.SETUP_DATA === "1") || process.env.SKIP_SETUP === "1") process.exit(0);
const run = (name, env = {}) => {
  console.log(`\n=== postinstall: ${name} ===`);
  const r = spawnSync(process.execPath, [path.join(__dirname, name)], { stdio: "inherit", timeout: 9 * 60 * 1000, env: { ...process.env, ...env } });
  if (r.status !== 0) console.log(`(${name} did not finish cleanly, continuing)`);
};
run("build-photos.js", { PHOTO_BUDGET_MS: String(5 * 60 * 1000) });   // keep the whole build well under Render's time limit
run("fetch-assets.js");
run("build-stats.js");
