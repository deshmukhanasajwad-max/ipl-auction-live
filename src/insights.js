// Smart coach: rule-based (not an LLM) live advice for one franchise.
// Looks at the squad, purse and what is still left in the auction, and says which player types to buy.
const SET_LABEL = { Batter: "Batter", Bowler: "Bowler", "All-rounder": "Allrounder", Wicketkeeper: "Wicket Keeper" };
const TARGET = { Batter: 5, Wicketkeeper: 2, "All-rounder": 5, Bowler: 8 };   // a balanced 20-man squad (18-25 allowed)
const MIN = { Batter: 4, Wicketkeeper: 2, "All-rounder": 3, Bowler: 6 };       // below this it is a real gap
const ROLE_PLURAL = { Batter: "batters", Wicketkeeper: "wicketkeepers", "All-rounder": "all-rounders", Bowler: "bowlers" };
const cr = l => (l >= 100 ? `₹${Math.round(l) / 100} Cr` : `₹${Math.round(l)} L`);

function coach(team, { upcoming = [], current = null, cfg, bid = {}, nextAmount = null, teams = [] }) {
  const squad = team.squad, size = squad.length;
  const overseas = squad.filter(p => p.overseas).length;
  const count = r => squad.filter(p => p.role === r).length;
  const osLeft = Math.max(0, cfg.maxOverseas - overseas);
  const slotsMin = Math.max(0, cfg.minSquad - size), slotsMax = Math.max(0, cfg.maxSquad - size);
  const reserve = slotsMin * cfg.minBase;                      // must stay in the purse to reach 18 players
  const spendable = Math.max(0, team.purse - reserve);
  const perSlot = slotsMin ? Math.round(team.purse / slotsMin) : slotsMax ? Math.round(team.purse / slotsMax) : 0;

  // ---- needs by role ----
  const needs = [];
  for (const role of Object.keys(TARGET)) {
    const have = count(role), gap = TARGET[role] - have;
    if (gap <= 0) continue;
    const pool = upcoming.filter(p => p.role === role);
    const indianPool = pool.filter(p => !p.overseas), osPool = pool.filter(p => p.overseas);
    const preferIndian = osLeft <= 1 || osPool.length === 0;
    const urgent = have < MIN[role];
    const options = [];
    const cappedFirst = purseRich(team, cfg) && have < MIN[role];
    for (const origin of preferIndian ? ["Indian"] : ["Indian", "Overseas"]) {
      if (origin === "Overseas" && osLeft < 1) continue;
      const tier = cappedFirst || have === 0 ? ["Capped", "Uncapped"] : ["Uncapped", "Capped"];
      for (const cap of tier) {
        const name = `${cap} ${origin} ${SET_LABEL[role]}`;
        const left = pool.filter(p => (p.capped ? "Capped" : "Uncapped") === cap && (p.overseas ? "Overseas" : "Indian") === origin).length;
        if (left) options.push({ name, left });
      }
    }
    needs.push({
      role, have, target: TARGET[role], gap, urgent, left: pool.length,
      priority: urgent ? "high" : gap >= 2 ? "medium" : "low",
      categories: options.slice(0, 3),
      text: have === 0 ? `You have no ${ROLE_PLURAL[role]} yet` : urgent ? `Only ${have} ${ROLE_PLURAL[role]}: you need at least ${MIN[role]}` : `Add ${gap} more ${ROLE_PLURAL[role]} for balance`,
      scarce: pool.length > 0 && pool.length <= gap + 1,
    });
  }
  const rank = { high: 0, medium: 1, low: 2 };
  needs.sort((a, b) => rank[a.priority] - rank[b.priority] || b.gap - a.gap);

  // ---- headline ----
  let headline;
  if (size >= cfg.maxSquad) headline = "Squad is full. Nothing more to buy.";
  else if (!size) headline = "Fresh squad. Build around a keeper and your best 4 overseas players.";
  else if (needs[0] && needs[0].priority === "high") headline = `Priority: ${needs[0].categories[0] ? needs[0].categories[0].name : ROLE_PLURAL[needs[0].role]}. ${needs[0].text}.`;
  else if (needs[0]) headline = `Next best buy: ${needs[0].categories[0] ? needs[0].categories[0].name : ROLE_PLURAL[needs[0].role]}.`;
  else if (slotsMin) headline = `Roles are balanced. Fill ${slotsMin} more slot(s) with value picks.`;
  else headline = "Core squad complete. Only chase real upgrades.";

  // ---- tips ----
  const tips = [];
  if (slotsMin > 0) tips.push(`Keep ${cr(reserve)} aside: you still need ${slotsMin} player(s) to reach ${cfg.minSquad}.`);
  if (spendable > 0 && slotsMax > 0) tips.push(`Free spending power: ${cr(spendable)}. That is about ${cr(perSlot)} per remaining slot.`);
  if (osLeft <= 2 && osLeft >= 0 && overseas > 0) tips.push(osLeft === 0 ? "Overseas quota full (8). Only Indian players from here." : `Only ${osLeft} overseas slot(s) left. Spend them on game-changers.`);
  if (overseas < 4 && size >= 10) tips.push(`You have ${overseas} overseas players. Your XI can use 4.`);
  const rivals = teams.filter(t => t.id !== team.id && t.purse > team.purse * 1.3);
  if (rivals.length >= 2) tips.push(`${rivals.length} rivals have much deeper purses. Pick your fights.`);
  const rich = teams.length ? [...teams].sort((a, b) => b.purse - a.purse)[0] : null;
  if (rich && rich.id === team.id && teams.length > 2 && team.purse > 2000) tips.push("You hold the biggest purse. Rivals will fear your paddle.");
  needs.filter(n => n.scarce).slice(0, 2).forEach(n => tips.push(`Only ${n.left} ${ROLE_PLURAL[n.role]} left in the auction. Do not wait.`));

  // ---- the player on the block ----
  let live = null;
  if (current) {
    const n = needs.find(x => x.role === current.role);
    const blockedBy = teamCan(team, current, nextAmount, cfg);
    let fit, text;
    if (blockedBy) { fit = "blocked"; text = blockedBy; }
    else if (n && n.priority === "high") { fit = "must"; text = `Fills a gap: ${n.text.toLowerCase()}.`; }
    else if (n) { fit = "good"; text = `Useful: you want ${n.gap} more ${ROLE_PLURAL[n.role]}.`; }
    else { fit = "luxury"; text = `You already have enough ${ROLE_PLURAL[current.role]}. Bid only for a bargain.`; }
    if (!blockedBy && current.overseas && osLeft <= 1) text += " It would use your last overseas slot.";
    // ceiling suggestion = a share of spendable money, higher when the need is high
    const share = fit === "must" ? 0.35 : fit === "good" ? 0.22 : 0.1;
    const ceiling = Math.max(current.basePrice, Math.min(spendable, Math.round(spendable * share / 5) * 5));
    live = { name: current.name, fit, text, ceiling: fit === "blocked" ? null : ceiling };
  }

  return { headline, needs: needs.slice(0, 4), tips: tips.slice(0, 4), live, budget: { purse: team.purse, reserve, spendable, perSlot, slotsMin, slotsMax, overseasLeft: osLeft }, counts: Object.fromEntries(Object.keys(TARGET).map(r => [r, count(r)])) };
}

function purseRich(team, cfg) { return team.purse > cfg.purse * 0.5; }
function teamCan(team, p, amount, cfg) {
  if (amount == null) return null;
  const size = team.squad.length, os = team.squad.filter(x => x.overseas).length;
  if (size >= cfg.maxSquad) return `Squad is full (${cfg.maxSquad}).`;
  if (p.overseas && os >= cfg.maxOverseas) return `Overseas limit reached (${cfg.maxOverseas}).`;
  if (amount > team.purse) return "Not enough purse.";
  if (team.purse - amount < Math.max(0, cfg.minSquad - size - 1) * cfg.minBase) return "You must keep money to complete 18 players.";
  return null;
}

module.exports = { coach, TARGET, MIN };
