// Auction engine: one instance = one room. Pure logic + timers, no networking.
// hooks = { event(type, payload), changed() } are called when something happens.
const { CONFIG, nextBid, canBid } = require("./rules");
const path = require("path");
const { TEAMS, loadPlayers, loadStats } = require("./data");
const { buildCompare } = require("./compare");

const rid = () => require("crypto").randomBytes(8).toString("hex");
const fail = msg => { throw new Error(msg); };

class Auction {
  constructor(opts, hooks = {}) {
    this.code = opts.code;
    this.hostId = opts.hostId;
    this.hostName = opts.hostName || "Host";
    this.config = { ...CONFIG, ...(opts.config || {}) };
    this.status = opts.status || "LOBBY";   // LOBBY | LIVE | PAUSED | COMPLETED
    this.phase = opts.phase || "IDLE";      // IDLE | BIDDING | RTM | BREAK
    this.round = opts.round || 1;           // 1 = main sets, 2 = accelerated round (unsold players)
    this.teams = opts.teams || TEAMS.map(t => ({ ...t, ownerId: null, ownerName: null, purse: this.config.purse, rtmCards: this.config.rtmCards, squad: [] }));
    this.players = opts.players || loadPlayers(path.join(__dirname, "..", "data", "players.csv"), path.join(__dirname, "..", "data", "photos.json"));
    this.stats = opts.stats || loadStats(path.join(__dirname, "..", "data", "stats.json"));
    this._cmp = null;
    this.queue = opts.queue || [];
    this.current = opts.current || null;
    this.bid = opts.bid || { amount: 0, teamId: null };
    this.rtm = opts.rtm || null;
    this.lastResult = opts.lastResult || null;
    this.log = opts.log || [];
    this.history = opts.history || [];      // every sale/unsold, for the summary
    this.deadline = null;
    this.pausedLeft = opts.pausedLeft || 0;
    this.createdAt = opts.createdAt || Date.now();
    this.updatedAt = Date.now();
    this.hooks = hooks;
    this._t = null;
    this.sockets = new Map();               // runtime only: socketId -> userId
  }

  // ---------- helpers ----------
  _p(id) { return this.players.find(p => p.id === id); }
  _team(id) { return this.teams.find(t => t.id === id); }
  _mine(userId) { return this.teams.find(t => t.ownerId === userId); }
  _isHost(userId) { return userId === this.hostId; }
  _changed() { this.updatedAt = Date.now(); this.hooks.changed && this.hooks.changed(); }
  _event(type, payload) { this.hooks.event && this.hooks.event(type, payload); }
  _log(text) { this.log.push({ t: Date.now(), text }); if (this.log.length > 60) this.log.shift(); }
  _schedule(ms, fn) { clearTimeout(this._t); this.deadline = Date.now() + ms; this._t = setTimeout(fn, ms); }
  _stop() { clearTimeout(this._t); this._t = null; this.deadline = null; }
  destroy() { this._stop(); }

  // ---------- lobby ----------
  claimTeam(userId, name, teamId) {
    if (this.status !== "LOBBY") fail("Auction already started");
    if (this._mine(userId)) fail("You already own a team");
    const t = this._team(teamId) || fail("Unknown team");
    if (t.ownerId) fail("Team already taken");
    t.ownerId = userId; t.ownerName = (name || "Player").slice(0, 24);
    this._log(`${t.ownerName} claimed ${t.name}`);
    this._changed();
  }
  releaseTeam(userId, teamId) {
    if (this.status !== "LOBBY") fail("Auction already started");
    const t = this._team(teamId) || fail("Unknown team");
    if (!t.ownerId) return;
    if (t.ownerId !== userId && !this._isHost(userId)) fail("Not your team");
    this._log(`${t.name} is free again`);
    t.ownerId = null; t.ownerName = null;
    this._changed();
  }
  start(userId) {
    if (!this._isHost(userId)) fail("Only the host can start");
    if (this.status !== "LOBBY") fail("Already started");
    const claimed = this.teams.filter(t => t.ownerId);
    if (claimed.length < 2) fail("At least 2 teams must be claimed");
    this.teams = claimed;                                   // only claimed franchises play
    this.queue = this.players.map(p => p.id);                // already ordered by set
    this.status = "LIVE";
    this._log(`Auction started with ${claimed.length} teams and ${this.players.length} players`);
    this._event("auction_started", {});
    this._next();
  }

  // ---------- flow ----------
  _next() {
    if (this.status !== "LIVE") return;
    this.current = null; this.phase = "IDLE"; this.rtm = null; this._stop();
    if (this.teams.every(t => t.squad.length >= this.config.maxSquad)) return this._complete();
    const id = this.queue.shift();
    if (id === undefined) {
      const unsold = this.players.filter(p => p.status === "unsold");
      if (this.config.accelerated && this.round === 1 && unsold.length) {
        this.round = 2;
        unsold.forEach(p => { p.status = "upcoming"; });
        this.queue = unsold.map(p => p.id);
        this._log(`Accelerated round: ${unsold.length} unsold players are back`);
        this._event("accelerated_round", { count: unsold.length });
        return this._next();
      }
      return this._complete();
    }
    const p = this._p(id);
    this.current = id; this.bid = { amount: 0, teamId: null }; this.phase = "BIDDING";
    this._schedule(this.config.bidMs, () => this._onTimeout());
    this._event("player_up", { name: p.name, set: p.set, role: p.role, basePrice: p.basePrice, overseas: p.overseas, country: p.country });
    this._changed();
  }

  _complete() {
    this._stop(); this.status = "COMPLETED"; this.phase = "IDLE"; this.current = null;
    this._log("Auction completed");
    this._event("auction_ended", {});
    this._changed();
  }

  placeBid(userId) {
    if (this.status !== "LIVE" || this.phase !== "BIDDING") fail("Bidding is not open");
    const team = this._mine(userId) || fail("You do not own a team");
    if (this.bid.teamId === team.id) fail("You are already the highest bidder");
    const p = this._p(this.current);
    const amount = nextBid(this.bid.amount, p.basePrice);
    const err = canBid(team, p, amount, this.config);
    if (err) fail(err);
    this.bid = { amount, teamId: team.id };
    this._schedule(this.config.bidMs, () => this._onTimeout());   // countdown resets on each bid
    this.history.push({ kind: "bid", player: p.name, teamId: team.id, amount, t: Date.now() });
    if (this.history.length > 400) this.history.shift();
    this._event("bid", { teamId: team.id, amount });
    this._changed();
  }

  _rtmCandidate(p) {
    const t = this._team(p.prevTeam);
    if (!t || !t.ownerId || t.id === this.bid.teamId || t.rtmCards < 1) return null;
    return canBid(t, p, this.bid.amount, this.config) ? null : t;
  }

  _onTimeout() {
    if (this.status !== "LIVE" || this.phase !== "BIDDING") return;
    const p = this._p(this.current);
    if (!this.bid.teamId) return this._unsold();
    const rt = this._rtmCandidate(p);
    if (rt) {
      this.phase = "RTM";
      this.rtm = { teamId: rt.id, amount: this.bid.amount, winnerId: this.bid.teamId };
      this._schedule(this.config.rtmMs, () => this._rtmDone(false));
      this._log(`RTM: ${rt.name} can match ${this.bid.amount} lakh for ${p.name}`);
      this._event("rtm_prompt", { teamId: rt.id });
      return this._changed();
    }
    this._sell(this.bid.teamId, this.bid.amount, false);
  }

  rtmDecision(userId, match) {
    if (this.status !== "LIVE" || this.phase !== "RTM") fail("No RTM in progress");
    const t = this._mine(userId);
    if (!t || t.id !== this.rtm.teamId) fail("Not your RTM");
    this._rtmDone(!!match);
  }
  _rtmDone(match) {
    if (this.phase !== "RTM") return;
    const { teamId, amount, winnerId } = this.rtm;
    if (match) { this._team(teamId).rtmCards -= 1; return this._sell(teamId, amount, true); }
    this._sell(winnerId, amount, false);
  }

  _sell(teamId, amount, viaRtm) {
    const p = this._p(this.current), t = this._team(teamId);
    t.purse -= amount;
    t.squad.push({ id: p.id, name: p.name, role: p.role, country: p.country, overseas: p.overseas, capped: p.capped, photo: p.photo || "", price: amount, rtm: viaRtm });
    p.status = "sold"; p.soldTo = teamId; p.soldPrice = amount;
    this.lastResult = { name: p.name, teamId, amount, sold: true, rtm: viaRtm };
    this.history.push({ kind: "sold", player: p.name, teamId, amount, rtm: viaRtm, t: Date.now() });
    this._log(`SOLD ${p.name} to ${t.id} for ${amount} lakh${viaRtm ? " (RTM)" : ""}`);
    this._event("player_sold", this.lastResult);
    this._breakThenNext();
  }
  _unsold() {
    const p = this._p(this.current);
    p.status = "unsold";
    this.lastResult = { name: p.name, sold: false };
    this.history.push({ kind: "unsold", player: p.name, t: Date.now() });
    this._log(`UNSOLD ${p.name}`);
    this._event("player_unsold", this.lastResult);
    this._breakThenNext();
  }
  _breakThenNext() {
    this.phase = "BREAK"; this.rtm = null;
    this._schedule(this.config.breakMs, () => this._next());
    this._changed();
  }

  // ---------- host controls ----------
  pause(userId) {
    if (!this._isHost(userId)) fail("Host only");
    if (this.status !== "LIVE") fail("Not running");
    this.pausedLeft = Math.max(0, (this.deadline || Date.now()) - Date.now());
    this._stop(); this.status = "PAUSED"; this._log("Auction paused");
    this._event("paused", {}); this._changed();
  }
  resume(userId) {
    if (!this._isHost(userId)) fail("Host only");
    if (this.status !== "PAUSED") fail("Not paused");
    this.status = "LIVE"; this._log("Auction resumed");
    const ms = Math.max(500, this.pausedLeft || this.config.bidMs);
    if (this.phase === "BIDDING") this._schedule(ms, () => this._onTimeout());
    else if (this.phase === "RTM") this._schedule(ms, () => this._rtmDone(false));
    else this._schedule(this.config.breakMs, () => this._next());
    this._event("resumed", {}); this._changed();
  }
  hostAction(userId, action) {
    if (!this._isHost(userId)) fail("Host only");
    if (this.status !== "LIVE" || this.phase !== "BIDDING") fail("No player is being auctioned");
    if (action === "sell_now") return this._onTimeout();
    if (action === "skip") return this._unsold();
    fail("Unknown action");
  }

  // ---------- views ----------
  bidError(userId) {
    if (this.status !== "LIVE" || this.phase !== "BIDDING") return "Bidding is not open";
    const t = this._mine(userId);
    if (!t) return "You do not own a team";
    if (this.bid.teamId === t.id) return "You are the highest bidder";
    const p = this._p(this.current);
    return canBid(t, p, nextBid(this.bid.amount, p.basePrice), this.config);
  }

  publicState(userId, online = new Set()) {
    const cur = this.current ? this._p(this.current) : null;
    const me = this._mine(userId);
    return {
      serverTime: Date.now(),
      code: this.code, status: this.status, phase: this.phase, round: this.round, hostName: this.hostName,
      config: { purse: this.config.purse, minSquad: this.config.minSquad, maxSquad: this.config.maxSquad, maxOverseas: this.config.maxOverseas, rtmCards: this.config.rtmCards, bidMs: this.config.bidMs },
      teams: this.teams.map(t => ({
        id: t.id, name: t.name, color: t.color, ownerName: t.ownerName, claimed: !!t.ownerId,
        online: !!t.ownerId && online.has(t.ownerId), purse: t.purse, rtmCards: t.rtmCards,
        overseas: t.squad.filter(p => p.overseas).length, squad: t.squad,
      })),
      current: cur && { id: cur.id, name: cur.name, role: cur.role, country: cur.country, overseas: cur.overseas, capped: cur.capped, basePrice: cur.basePrice, set: cur.set, prevTeam: cur.prevTeam, photo: cur.photo || "", extra: cur.extra, stats: this.stats[cur.name] || null },
      compare: this.status === "COMPLETED" ? this.getCompare() : null,
      bid: this.bid,
      nextAmount: cur && this.phase === "BIDDING" ? nextBid(this.bid.amount, cur.basePrice) : null,
      rtm: this.rtm && { teamId: this.rtm.teamId, amount: this.rtm.amount },
      deadline: this.deadline, pausedLeft: this.pausedLeft,
      remaining: this.queue.length,
      upcoming: this.queue.slice(0, 5).map(id => { const p = this._p(id); return { name: p.name, role: p.role, set: p.set, basePrice: p.basePrice, photo: p.photo || "" }; }),
      sold: this.players.filter(p => p.status === "sold").length,
      unsold: this.players.filter(p => p.status === "unsold").map(p => p.name),
      lastResult: this.lastResult, log: this.log.slice(-25),
      you: { teamId: me ? me.id : null, isHost: this._isHost(userId), bidError: userId ? this.bidError(userId) : null },
    };
  }

  getCompare() {
    if (!this._cmp) this._cmp = buildCompare(this.teams, this.players, this.stats, this.config);
    return this._cmp;
  }

  // ---------- persistence ----------
  toJSON() {
    const { code, hostId, hostName, config, status, phase, round, teams, players, queue, current, bid, rtm, lastResult, log, history, createdAt } = this;
    return { code, hostId, hostName, config, status, phase, round, teams, players, queue, current, bid, rtm, lastResult, log, history, createdAt,
      pausedLeft: this.deadline ? Math.max(0, this.deadline - Date.now()) : this.pausedLeft };
  }
  static fromJSON(obj, hooks) {
    const a = new Auction(obj, hooks);
    if (a.status === "LIVE") { a.status = "PAUSED"; a._log("Server restarted: auction paused, host can resume"); }
    return a;
  }
}

module.exports = { Auction };
