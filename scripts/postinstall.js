#!/usr/bin/env node
// Runs after `npm install`. On Render (or when SETUP_DATA=1) it downloads player photos, extra assets and T20 stats
// so the live site has them without any manual step. It never fails the build: if a download breaks, the app still starts.
const { spawnSync } = require("child_process"), path = require("path");
if (!(process.env.RENDER || process.env.SETUP_DATA === "1") || process.env.SKIP_SETUP === "1") process.exit(0);
const run = name => {
  console.log(`\n=== postinstall: ${name} ===`);
  const r = spawnSync(process.execPath, [path.join(__dirname, name)], { stdio: "inherit", timeout: 12 * 60 * 1000 });
  if (r.status !== 0) console.log(`(${name} did not finish cleanly, continuing)`);
};
["build-photos.js", "fetch-assets.js", "build-stats.js"].forEach(run);
