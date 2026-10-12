// "Compare": rates every finished squad out of 10 (strength, weakness, opportunity, threat, balance) and picks each team's best XI.
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const to10 = x => clamp(((x - 50) / 38) * 10, 0, 10);          // rating 50 -> 0, 88 -> 10
const avg = (a, pad = 45, n = a.length) => { const l = [...a]; while (l.length < n) l.push(pad); return l.reduce((s, x) => s + x, 0) / (l.length || 1); };
const r1 = x => Math.round(x * 10) / 10;
const BAT = ["Batter", "Wicketkeeper", "All-rounder"], BOWL = ["Bowler", "All-rounder"];
const names = l => l.map(p => p.name).join(", ");

// Player strength 0-100: tier rating, refined by T20 stats when scripts/build-stats.js has produced them
function playerScore(p, st) {
  let s = p.rating || 60;
  const t = st && st.t20;
  if (t && t.m >= 20) {
    const bat = t.runs >= 300 && t.sr && t.avg ? clamp((t.sr - 135) / 6, -4, 4) + clamp((t.avg - 28) / 5, -3, 3) : 0;
    const bowl = t.wkts >= 10 && t.econ ? clamp((8.6 - t.econ) * 2.5, -4, 4) + clamp((t.wkts / t.m - 1) * 4, -3, 3) : 0;
    s += p.role === "Bowler" ? bowl : p.role === "All-rounder" ? (bat + bowl) / 2 : bat;
  }
  return clamp(s, 0, 100);
}

// Best XI: max 4 overseas, a wicketkeeper, at least 5 bowling options and 6 batting options
function pickXI(list, maxOs = 4) {
  const sorted = [...list].sort((a, b) => b.score - a.score), xi = [];
  const os = () => xi.filter(p => p.overseas).length;
  const wk = sorted.find(p => p.role === "Wicketkeeper");
  if (wk) xi.push(wk);
  for (const p of sorted) { if (xi.length >= 11) break; if (!xi.includes(p) && !(p.overseas && os() >= maxOs)) xi.push(p); }
  const fix = (fn, min) => {
    for (let g = 0; g < 8 && xi.filter(fn).length < min; g++) {
      const drops = [...xi].sort((a, b) => a.score - b.score).filter(p => !fn(p) && p !== wk);
      let done = false;
      for (const c of sorted.filter(p => !xi.includes(p) && fn(p))) {
        const d = drops.find(x => !(c.overseas && !x.overseas && os() >= maxOs));
        if (d) { xi.splice(xi.indexOf(d), 1, c); done = true; break; }
      }
      if (!done) break;
    }
  };
  fix(p => BOWL.includes(p.role), 5);
  fix(p => BAT.includes(p.role), 6);
  const ORDER = ["Batter", "Wicketkeeper", "All-rounder", "Bowler"];
  return xi.sort((a, b) => ORDER.indexOf(a.role) - ORDER.indexOf(b.role) || b.score - a.score);
}

function rateTeam(team, byId, stats, cfg) {
  const squad = team.squad.map(s => { const p = byId[s.id] || s; return { ...s, rating: p.rating, score: playerScore({ ...p, role: s.role }, stats[s.name]) }; });
  const xi = pickXI(squad, 4);   // IPL: max 4 overseas in the XI
  const bench = squad.filter(p => !xi.includes(p)).sort((a, b) => b.score - a.score);
  const bats = xi.filter(p => BAT.includes(p.role)).sort((a, b) => b.score - a.score);
  const bowls = xi.filter(p => BOWL.includes(p.role)).sort((a, b) => b.score - a.score);
  const allr = squad.filter(p => p.role === "All-rounder").sort((a, b) => b.score - a.score);
  const pureB = xi.filter(p => p.role === "Bowler").length, pureBat = xi.filter(p => p.role === "Batter").length;
  const hasWk = xi.some(p => p.role === "Wicketkeeper");

  const batting = to10(avg(bats.slice(0, 6).map(p => p.score), 45, 6));
  const bowling = to10(avg(bowls.slice(0, 5).map(p => p.score), 45, 5));
  const allround = to10(avg(allr.slice(0, 3).map(p => p.score), 45, 3));
  const depth = to10(avg(bench.slice(0, 7).map(p => p.score), 45, 7));
  let balance = 10;
  if (!hasWk) balance -= 3;
  if (bowls.length < 5) balance -= (5 - bowls.length) * 1.2;
  if (bats.length < 6) balance -= (6 - bats.length) * 1;
  if (pureB < 3) balance -= 1.5;
  if (pureBat < 3) balance -= 1;
  if (xi.length < 11) balance -= (11 - xi.length) * 0.8;
  if (squad.length < cfg.minSquad) balance -= 2;
  balance = clamp(balance, 0, 10);
  const overall = r1(0.25 * batting + 0.30 * bowling + 0.15 * allround + 0.15 * depth + 0.15 * balance);

  // ---- SWOT ----
  const S = [], W = [], O = [], T = [];
  const topBat = bats.slice(0, 3), topBowl = bowls.slice(0, 3);
  if (batting >= 7) S.push(`Strong batting: ${names(topBat)} lead the order`);
  if (bowling >= 7) S.push(`Quality bowling attack led by ${names(topBowl)}`);
  if (allround >= 6.5) S.push(`All-round depth with ${names(allr.slice(0, 3))}`);
  if (depth >= 6.5) S.push(`Strong bench: ${names(bench.slice(0, 3))} are ready replacements`);
  if (balance >= 8.5) S.push("Well-balanced XI with the right mix of batters, bowlers and a keeper");
  if (!S.length) { const best = [["batting", batting], ["bowling", bowling], ["all-round options", allround], ["bench", depth]].sort((a, b) => b[1] - a[1])[0]; S.push(`Best area is ${best[0]} (${r1(best[1])}/10)`); }
  if (batting < 5.5) W.push(`Batting lacks quality: top six average ${r1(batting)}/10`);
  if (bowling < 5.5) W.push(`Bowling attack is thin: ${r1(bowling)}/10`);
  if (!hasWk) W.push("No wicketkeeper in the squad");
  if (bowls.length < 5) W.push(`Only ${bowls.length} bowling options in the XI`);
  if (pureB < 3) W.push(`Only ${pureB} specialist bowler(s) in the XI`);
  if (allround < 5) W.push("Few quality all-rounders for balance");
  if (depth < 5) W.push("Weak bench: injuries would hurt");
  if (squad.length < cfg.minSquad) W.push(`Squad has only ${squad.length} players (minimum ${cfg.minSquad})`);
  if (!W.length) W.push(`Weakest area: ${[["batting", batting], ["bowling", bowling], ["all-round", allround], ["bench", depth]].sort((a, b) => a[1] - b[1])[0][0]}`);
  const left = team.purse / 100, slots = cfg.maxSquad - squad.length, unc = squad.filter(p => p.capped === false);
  if (left >= 5) O.push(`₹${r1(left)} Cr unspent: room to fund trades or replacements`);
  if (slots > 0) O.push(`${slots} open squad slot(s) to add depth`);
  if (unc.length >= 3) O.push(`${unc.length} uncapped players: cheap options who can grow into regulars`);
  if (bench.length) O.push(`Impact Player option: ${bench[0].name} (${bench[0].role})`);
  if (!O.length) O.push("Squad is full, so improvement must come from tactics and form");
  const osStrong = squad.filter(p => p.overseas && p.score >= 70).length;
  if (osStrong > 4) T.push(`${osStrong} top overseas players but only 4 can play: some will sit out`);
  const sortedAll = [...squad].sort((a, b) => b.score - a.score);
  if (sortedAll.length > 4 && sortedAll[0].score - sortedAll[4].score >= 14) T.push(`Relies heavily on ${sortedAll[0].name}: an injury would hurt`);
  if (squad.filter(p => p.role === "Bowler").length < 5) T.push(`Only ${squad.filter(p => p.role === "Bowler").length} specialist bowlers in the squad: little cover`);
  if (xi.filter(p => p.overseas).length === 4 && squad.filter(p => p.overseas).length >= 6) T.push("Heavy overseas dependence: availability clashes could break the XI");
  if (!T.length) T.push("Main risk is injuries and form over a long season");

  return {
    teamId: team.id, name: team.name, color: team.color, owner: team.ownerName,
    overall, scores: { batting: r1(batting), bowling: r1(bowling), allround: r1(allround), depth: r1(depth), balance: r1(balance) },
    xi: xi.map(p => ({ name: p.name, role: p.role, overseas: p.overseas, price: p.price, photo: p.photo || "", score: Math.round(p.score) })),
    impact: bench[0] ? { name: bench[0].name, role: bench[0].role, overseas: bench[0].overseas, photo: bench[0].photo || "" } : null,
    swot: { strengths: S, weaknesses: W, opportunities: O, threats: T }, squadSize: squad.length, purseLeft: team.purse,
  };
}

function buildCompare(teams, players, stats = {}, cfg = {}) {
  const byId = Object.fromEntries(players.map(p => [p.id, p]));
  const c = { maxOverseas: 8, minSquad: 18, maxSquad: 25, ...cfg };
  return teams.map(t => rateTeam(t, byId, stats, c)).sort((a, b) => b.overall - a.overall).map((t, i) => ({ rank: i + 1, ...t }));
}

module.exports = { buildCompare, pickXI, playerScore };
