#!/usr/bin/env node
// Builds data/stats.json: T20 career + each of the last 3 calendar years, per player, from Cricsheet ball-by-ball data (cricsheet.org, open data).
//   npm run stats                    downloads the zips (needs internet), then calculates
// You can also drop any Cricsheet *_json.zip (or extracted .json match files) into data/cricsheet/ yourself.
// Nothing is invented: a player that cannot be matched simply shows "stats not loaded" in the app.
const fs = require("fs"), path = require("path");
const DATA = path.join(__dirname, "..", "data"), DIR = path.join(DATA, "cricsheet");
const NOW = new Date().getFullYear(), YEARS = [NOW - 2, NOW - 1, NOW];
// Men's T20 zips listed on cricsheet.org/downloads (internationals + every men's T20 league/tournament it covers).
// NOTE: Cricsheet withholds Afghanistan matches and the Afghanistan Premier League, so Afghan players' numbers are incomplete.
const SOURCES = ["t20s_male", "it20s_male", "ipl_male", "bbl_male", "psl_male", "cpl_male", "sat_male", "ilt_male", "mlc_male", "lpl_male", "bpl_male", "ntb_male", "hnd_male", "sma_male", "ssm_male", "ctc_male", "msl_male", "npl_male", "etpl_male", "mct_male"];   // a name that fails to download is skipped
const NOT_BOWLER_WICKET = ["run out", "retired hurt", "retired out", "obstructing the field", "retired not out"];
const NOT_OUT_KINDS = ["retired hurt", "retired not out"];

const blank = () => ({ m: 0, runs: 0, balls: 0, outs: 0, inn: 0, f: 0, h: 0, fours: 0, sixes: 0, bb: 0, br: 0, w: 0 });

// ---- one match -> accumulator (Map id -> { names:Set, y:{year:stats} }) ----
function processMatch(m, acc) {
  const info = m.info || {};
  if (info.gender !== "male" || !["T20", "IT20"].includes(info.match_type)) return false;
  const year = +String((info.dates || [])[0] || "").slice(0, 4);
  const reg = (info.registry && info.registry.people) || {};
  if (!year) return false;
  const comp = info.match_type === "IT20" ? "T20 Internationals" : ((info.event && info.event.name) || "Other T20").replace(/\s+\d{4}(\/\d{2})?$/, "");
  const key = year + "|" + comp;
  const rec = (name) => {
    const id = reg[name]; if (!id) return null;
    let a = acc.get(id); if (!a) { a = { names: new Set(), k: {} }; acc.set(id, a); }
    a.names.add(name);
    return a.k[key] || (a.k[key] = blank());          // one record per player per year per competition
  };
  for (const list of Object.values(info.players || {})) for (const n of list) { const r = rec(n); if (r) r.m++; }
  for (const inn of m.innings || []) {
    const runsIn = {}, seen = new Set();
    for (const ov of inn.overs || []) for (const d of ov.deliveries || []) {
      const ex = d.extras || {}, rb = (d.runs && d.runs.batter) || 0, total = (d.runs && d.runs.total) || 0;
      const b = rec(d.batter);
      if (b) {
        if (!ex.wides) b.balls++;
        b.runs += rb;
        if (rb === 4 && !(d.runs && d.runs.non_boundary)) b.fours++;
        if (rb === 6) b.sixes++;
        runsIn[d.batter] = (runsIn[d.batter] || 0) + rb; seen.add(d.batter);
      }
      const bw = rec(d.bowler);
      if (bw) { if (!ex.wides && !ex.noballs) bw.bb++; bw.br += total - (ex.byes || 0) - (ex.legbyes || 0); }
      for (const w of d.wickets || []) {
        if (!NOT_OUT_KINDS.includes(w.kind)) { const o = rec(w.player_out); if (o) { o.outs++; seen.add(w.player_out); } }
        if (bw && !NOT_BOWLER_WICKET.includes(w.kind)) bw.w++;
      }
    }
    for (const n of seen) { const r = rec(n); if (r) { r.inn++; if ((runsIn[n] || 0) >= 100) r.h++; else if ((runsIn[n] || 0) >= 50) r.f++; } }
  }
  return true;
}

const yearRec = (a, y) => sum(Object.entries(a.k).filter(([k]) => k.startsWith(y + "|")).map(([, r]) => r));
const sum = (list) => list.reduce((t, r) => { for (const k in r) t[k] = (t[k] || 0) + r[k]; return t; }, blank());
const round1 = x => Math.round(x * 10) / 10;
function summarize(r, career) {
  const o = { m: r.m, runs: r.runs, sr: r.balls ? round1(r.runs / r.balls * 100) : null, avg: r.outs ? round1(r.runs / r.outs) : null, wkts: r.w, econ: r.bb ? round1(r.br / (r.bb / 6)) : null };
  if (career) { o.fifties = r.f; o.hundreds = r.h; o.fours = r.fours; o.sixes = r.sixes; }
  return o;
}

// ---- matching "Virat Kohli" to Cricsheet's "V Kohli" ----
const norm = s => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[.'’]/g, "").replace(/-/g, " ").trim();
function matchLevel(mine, theirs) {
  const a = norm(mine).split(/\s+/), b = norm(theirs).split(/\s+/);
  if (norm(mine) === norm(theirs)) return 3;
  if (a[a.length - 1] !== b[b.length - 1] || b.length < 2) return 0;
  const given = b.slice(0, -1);
  if (given.includes(a[0])) return 2;                                   // "Tilak Varma" vs "N Tilak Varma"
  if (given[0].length <= 3 && given[0][0] === a[0][0]) return 1;        // initials: "RG" vs "Rohit"
  return 0;
}
function buildStats(acc, players, aliases = {}) {
  const out = {}, report = { ambiguous: [], unmatched: [] };
  const recent = a => YEARS.reduce((t, y) => t + yearRec(a, y).m, 0);
  const entries = [...acc.entries()];
  for (const p of players) {
    let cands = [];
    for (const [id, a] of entries) {
      let lvl = 0;
      for (const n of a.names) lvl = Math.max(lvl, aliases[p.name] === n ? 4 : matchLevel(p.name, n));
      if (lvl) cands.push({ id, a, lvl, recent: recent(a) });
    }
    cands.sort((x, y) => y.lvl - x.lvl || y.recent - x.recent);
    if (!cands.length) { report.unmatched.push(p.name); continue; }
    const best = cands[0], tie = cands.filter(c => c !== best && c.lvl === best.lvl && c.recent > 0);
    if (tie.length && best.lvl < 3) report.ambiguous.push(`${p.name} -> ${[...best.a.names][0]} (also: ${tie.slice(0, 3).map(c => [...c.a.names][0]).join(", ")})`);
    const all = sum(Object.values(best.a.k));
    const byComp = {};
    for (const [k, r] of Object.entries(best.a.k)) { const c = k.slice(k.indexOf("|") + 1); (byComp[c] = byComp[c] || []).push(r); }
    const leagues = Object.entries(byComp).map(([name, l]) => [name, sum(l)]).filter(([, r]) => r.m > 0).sort((x, y) => y[1].m - x[1].m).slice(0, 10).map(([name, r]) => ({ name, ...summarize(r) }));
    out[p.name] = { matchedAs: [...best.a.names][0], t20: summarize(all, true), years: Object.fromEntries(YEARS.map(y => [y, summarize(yearRec(best.a, y))])), leagues };
  }
  return { out, report };
}

// ---- main: download, read, calculate ----
async function main() {
  const AdmZip = require("adm-zip");
  fs.mkdirSync(DIR, { recursive: true });
  for (const n of SOURCES) {
    const f = path.join(DIR, `${n}_json.zip`);
    if (fs.existsSync(f)) continue;
    try {
      const r = await fetch(`https://cricsheet.org/downloads/${n}_json.zip`);
      if (!r.ok) { console.log(`skip ${n} (HTTP ${r.status})`); continue; }
      fs.writeFileSync(f, Buffer.from(await r.arrayBuffer())); console.log("downloaded", n);
    } catch (e) { console.log(`skip ${n} (${e.message})`); }
  }
  const acc = new Map(); let matches = 0;
  for (const f of fs.readdirSync(DIR)) {
    const fp = path.join(DIR, f);
    if (f.endsWith(".zip")) { for (const e of new AdmZip(fp).getEntries()) if (e.entryName.endsWith(".json")) { try { if (processMatch(JSON.parse(e.getData().toString("utf8")), acc)) matches++; } catch {} } }
    else if (f.endsWith(".json")) { try { if (processMatch(JSON.parse(fs.readFileSync(fp, "utf8")), acc)) matches++; } catch {} }
  }
  if (!matches) { console.error("No T20 matches found. Put Cricsheet *_json.zip files into data/cricsheet/ and run again."); process.exit(1); }
  const csv = require("../src/data").loadPlayers(path.join(DATA, "players.csv"));
  let aliases = {}; try { aliases = JSON.parse(fs.readFileSync(path.join(DATA, "name-aliases.json"), "utf8")); } catch {}
  const { out, report } = buildStats(acc, csv, aliases);
  out._meta = { generatedAt: new Date().toISOString(), years: YEARS, matches, source: "Cricsheet (cricsheet.org)", matched: Object.keys(out).length, total: csv.length };
  fs.writeFileSync(path.join(DATA, "stats.json"), JSON.stringify(out));
  console.log(`\nMatched ${out._meta.matched - 1}/${csv.length} players from ${matches} T20 matches (${YEARS.join(", ")}).`);
  if (report.ambiguous.length) console.log("\nCheck these (several people share the name; best guess used):\n  " + report.ambiguous.join("\n  "));
  if (report.unmatched.length) console.log("\nNot found (add to data/name-aliases.json as {\"Your Name\": \"Cricsheet Name\"}):\n  " + report.unmatched.join(", "));
}
if (require.main === module) main().catch(e => { console.error(e); process.exit(1); });
module.exports = { processMatch, buildStats, matchLevel, blank, summarize, yearRec, YEARS };
