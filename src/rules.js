// IPL mega auction rules. All money is stored in LAKH (100 lakh = 1 Cr).
// Sources: IPL Governing Council player regulations 2025-27 (purse 120 Cr, 25/18/8 squad rules, RTM, retention slabs).
// Everything here is configurable per room; defaults follow a fresh mega auction.
const CONFIG = {
  purse: 12000,          // 120 Cr = 12000 lakh
  minSquad: 18,
  maxSquad: 25,
  maxOverseas: 8,
  minBase: 30,            // lowest base price (30 lakh), used for the "can still fill squad" reserve
  rtmCards: 0,            // RTM cards per team (0 = off). IPL 2025: retentions + RTMs <= 6
  bidMs: 15000,           // countdown, resets on every valid bid
  rtmMs: 10000,
  breakMs: 4000,
  accelerated: false,     // re-offer unsold players once at the end (off = every name appears only once)
};

// Retention slabs (for reference / future pre-auction retention screen), lakh
const RETENTION_SLABS = { capped: [1800, 1400, 1100, 1800, 1400], uncapped: 400 };

// Bid increments (lakh): up to 1 Cr -> 5L, 1-2 Cr -> 10L, 2-5 Cr -> 20L, above 5 Cr -> 25L
function increment(current) {
  if (current < 100) return 5;
  if (current < 200) return 10;
  if (current < 500) return 20;
  return 25;
}

const nextBid = (current, base) => (current === 0 ? base : current + increment(current));

// null = valid, else a human-readable reason
function canBid(team, player, amount, cfg = CONFIG) {
  const size = team.squad.length;
  const overseas = team.squad.filter(p => p.overseas).length;
  if (size >= cfg.maxSquad) return `Squad is full (${cfg.maxSquad})`;
  if (player.overseas && overseas >= cfg.maxOverseas) return `Overseas limit reached (${cfg.maxOverseas})`;
  if (amount > team.purse) return "Not enough purse";
  const stillNeeded = Math.max(0, cfg.minSquad - size - 1);
  if (team.purse - amount < stillNeeded * cfg.minBase) return `Must keep purse to complete a squad of ${cfg.minSquad}`;
  return null;
}

module.exports = { CONFIG, RETENTION_SLABS, increment, nextBid, canBid };
