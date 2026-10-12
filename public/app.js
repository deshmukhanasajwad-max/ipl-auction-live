// IPL Auction Live: client. The server is the single source of truth; this only renders state and sends intents.
const $app = document.getElementById("app");
const socket = io();
// getRandomValues also works on plain http:// (LAN) pages, unlike crypto.randomUUID
const uid = localStorage.getItem("uid") || (() => { const v = Array.from(crypto.getRandomValues(new Uint8Array(16)), x => x.toString(16).padStart(2, "0")).join(""); localStorage.setItem("uid", v); return v; })();
let myName = localStorage.getItem("name") || "";
let S = null, offset = 0, openTeam = null, joining = null, lastKey = "", view = "main";
const pathCode = (location.pathname.match(/^\/room\/(\w+)/) || [])[1];

// ---------- helpers ----------
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const fmt = l => l >= 100 ? "₹" + (+(l / 100).toFixed(2)) + " Cr" : "₹" + l + " L";   // values are in lakh
const teamBy = id => S.teams.find(t => t.id === id);
const toast = (msg, err) => { const d = document.createElement("div"); if (err) d.className = "err"; d.textContent = msg; document.getElementById("toast").appendChild(d); setTimeout(() => d.remove(), 3500); };
const copy = t => {   // clipboard API needs https; fall back to a hidden textarea on http:// LAN pages
  const ok = () => toast("Copied"), legacy = () => { const x = document.createElement("textarea"); x.value = t; x.style.position = "fixed"; x.style.opacity = "0"; document.body.appendChild(x); x.select(); let done = false; try { done = document.execCommand("copy"); } catch (e) {} x.remove(); done ? ok() : toast(t); };
  if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(t).then(ok, legacy); else legacy();
};
const send = (ev, data) => socket.emit(ev, data);
const roleOrder = ["Batter", "Wicketkeeper", "All-rounder", "Bowler"];
const av = (name, photo) => { const u = photo || photoCache[name] || ""; return `<span class="av">${u ? `<img src="${esc(u)}" alt="" loading="lazy" onerror="this.remove()">` : ""}<i>${esc(initials(name))}</i></span>`; };
const initials = n => n.split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]).join("").toUpperCase();

// ---- player photos: from data/players.csv "photo" column, otherwise looked up on Wikipedia (cached in this browser) ----
const photoCache = (() => { try { return JSON.parse(localStorage.getItem("photos") || "{}"); } catch { return {}; } })();
async function fetchPhoto(name) {
  if (name in photoCache) return photoCache[name];
  try {
    const u = "https://en.wikipedia.org/w/api.php?action=query&format=json&origin=*&generator=search&gsrlimit=3&prop=pageimages|description&piprop=thumbnail&pithumbsize=400&gsrsearch=" + encodeURIComponent(name + " cricketer");
    const j = await (await fetch(u)).json();
    const pages = Object.values((j.query && j.query.pages) || {}).sort((a, b) => a.index - b.index);
    const hit = pages.find(p => p.thumbnail && /cricket/i.test(p.description || ""));
    photoCache[name] = hit ? hit.thumbnail.source : "";
    localStorage.setItem("photos", JSON.stringify(photoCache));
    return photoCache[name];
  } catch (e) { return ""; }            // offline: show initials, try again next time
}
async function showPhoto(name, direct, retried) {
  const url = direct || await fetchPhoto(name), el = document.getElementById("photo");
  if (!url || !el || !S || !S.current || S.current.name !== name) return;
  if (el.dataset.src === url) return;                   // already showing it (state refreshes on every bid)
  el.dataset.src = url;
  const keep = el.textContent;
  el.innerHTML = `<img alt="${esc(name)}" src="${esc(url)}">`;
  el.firstChild.onerror = () => { el.textContent = keep || initials(name); delete el.dataset.src; if (direct && !retried) showPhoto(name, "", true); };   // local file missing: try Wikipedia
}
const prefetch = () => S && S.upcoming && S.upcoming.forEach(p => { if (!p.photo) fetchPhoto(p.name); });

// ---- T20 record + last 3 years ----
const nv = v => v === null || v === undefined ? "-" : v;
function statsHtml(st) {
  if (!st || !st.t20) return `<div class="mute" style="margin-top:12px;font-size:13px">T20 stats not loaded for this player. Run <code>npm run stats</code> (see README).</div>`;
  const t = st.t20, yrs = Object.keys(st.years || {}).sort();
  return `<div class="sec">T20 record (all leagues + internationals)</div>
    <div class="facts"><div class="fact"><b>Matches</b>${nv(t.m)}</div><div class="fact"><b>Runs</b>${nv(t.runs)}</div><div class="fact"><b>Strike rate</b>${nv(t.sr)}</div><div class="fact"><b>Average</b>${nv(t.avg)}</div>
    <div class="fact"><b>50s / 100s</b>${nv(t.fifties)} / ${nv(t.hundreds)}</div><div class="fact"><b>Wickets</b>${nv(t.wkts)}</div><div class="fact"><b>Economy</b>${nv(t.econ)}</div></div>
    <div class="sec">Year by year</div>
    <table class="stats"><tr><th>Year</th><th>M</th><th>Runs</th><th>SR</th><th>Avg</th><th>Wkts</th><th>Econ</th></tr>
    ${yrs.map(y => { const r = st.years[y]; return `<tr><td>${y}</td><td>${nv(r.m)}</td><td>${nv(r.runs)}</td><td>${nv(r.sr)}</td><td>${nv(r.avg)}</td><td>${nv(r.wkts)}</td><td>${nv(r.econ)}</td></tr>`; }).join("")}</table>
    ${st.leagues && st.leagues.length ? `<div class="sec">By league / competition</div><table class="stats"><tr><th style="text-align:left">Competition</th><th>M</th><th>Runs</th><th>SR</th><th>Avg</th><th>Wkts</th><th>Econ</th></tr>
    ${st.leagues.map(r => `<tr><td style="text-align:left">${esc(r.name)}</td><td>${nv(r.m)}</td><td>${nv(r.runs)}</td><td>${nv(r.sr)}</td><td>${nv(r.avg)}</td><td>${nv(r.wkts)}</td><td>${nv(r.econ)}</td></tr>`).join("")}</table>` : ""}
    <div class="mute" style="font-size:11px;margin-top:6px">Source: cricsheet.org (ODC-BY). Afghanistan matches are withheld there, so Afghan players' numbers are incomplete.</div>`;
}

function join(code) {
  if (!myName) return;
  joining = code.toUpperCase();
  socket.emit("join_room", { code: joining, userId: uid, name: myName });
}

// ---------- socket events ----------
socket.on("connect", () => { if (S) join(S.code); else if (pathCode && myName) join(pathCode); });
socket.on("state", s => { S = s; offset = s.serverTime - Date.now(); if (location.pathname !== "/room/" + s.code) history.replaceState({}, "", "/room/" + s.code); render(); });
socket.on("error_msg", m => { toast(m, true); if (!S) render(); });
socket.on("player_up", p => Announcer.playerUp(p));
socket.on("bid", b => Announcer.bid(S && teamBy(b.teamId) ? teamBy(b.teamId).name : b.teamId, b.amount));
socket.on("rtm_prompt", b => Announcer.rtm(S && teamBy(b.teamId) ? teamBy(b.teamId).name : b.teamId));
socket.on("player_sold", r => { toast(`SOLD: ${r.name} to ${r.teamId} for ${fmt(r.amount)}${r.rtm ? " (RTM)" : ""}`); Announcer.sold(r, S && teamBy(r.teamId) ? teamBy(r.teamId).name : r.teamId); });
socket.on("player_unsold", r => { toast(`UNSOLD: ${r.name}`); Announcer.unsold(r); });
socket.on("accelerated_round", r => toast(`Accelerated round: ${r.count} unsold players are back`));
socket.on("auction_ended", () => toast("Auction completed!"));

// ---------- views ----------
function home() {
  const err = pathCode && !S ? `<p class="mute">Joining room <b>${esc(pathCode)}</b>. Enter your name to continue.</p>` : "";
  $app.innerHTML = `<div class="home card">
    <div class="logo">IPL <span>Auction</span> Live</div>
    <p class="mute">Real-time mega auction: rooms, live bidding, IPL rules.</p>${err}
    <label>Your name</label><input id="name" maxlength="24" placeholder="e.g. Aman" value="${esc(myName)}">
    ${pathCode ? `<button class="bigbtn" data-a="joinurl">Join room ${esc(pathCode)}</button>` : `
    <label>Have a room code?</label>
    <div class="row"><input id="code" maxlength="6" placeholder="ROOM CODE" style="text-transform:uppercase;flex:1"><button data-a="joincode">Join</button></div>
    <h3 style="margin-top:22px">Create a new room</h3>
    <div class="row"><div class="grow"><label>Purse per team (Cr)</label><input id="purse" type="number" value="120" min="50" max="300"></div>
    <div class="grow"><label>Bid timer (sec)</label><input id="secs" type="number" value="15" min="5" max="60"></div>
    <div class="grow"><label>RTM cards / team</label><input id="rtm" type="number" value="0" min="0" max="6"></div></div>
    <label>Unsold players</label><select id="accel"><option value="false">Each player is auctioned only once</option><option value="true">Re-offer unsold players at the end (accelerated round)</option></select>
    <button class="bigbtn" data-a="create">Create room</button>`}
  </div>`;
}

const squadHtml = t => {
  if (!t.squad.length) return `<div class="mute" style="font-size:12px;margin-top:6px">No players yet</div>`;
  return roleOrder.map(r => { const l = t.squad.filter(p => p.role === r); return l.length ? `<div class="sec">${r}s (${l.length})</div>` + l.map(p => `<div class="pl"><span class="who">${av(p.name, p.photo)}${esc(p.name)} ${p.overseas ? '<span class="badge os">OS</span>' : ""}${p.rtm ? ' <span class="badge">RTM</span>' : ""}</span><span class="money">${fmt(p.price)}</span></div>`).join("") : ""; }).join("");
};

function teamCard(t, extra = "") {
  const me = S.you.teamId === t.id, lead = S.bid.teamId === t.id && S.phase === "BIDDING";
  const cfg = S.config;
  return `<div class="team ${me ? "me" : ""} ${lead ? "lead" : ""}" style="--c:${t.color}">
    <div class="row"><span class="n grow">${esc(t.name)}</span>${t.claimed ? `<span class="badge ${t.online ? "live" : ""}">${t.online ? "online" : "offline"}</span>` : ""}</div>
    <div class="s">${t.claimed ? esc(t.ownerName) : "Free"}${me ? " (you)" : ""}</div>
    ${S.status === "LOBBY" ? "" : `<div class="s">Purse <b class="money">${fmt(t.purse)}</b> · Squad ${t.squad.length}/${cfg.maxSquad} · OS ${t.overseas}/${cfg.maxOverseas}${cfg.rtmCards ? " · RTM " + t.rtmCards : ""}</div>`}
    ${extra}</div>`;
}

function lobby() {
  const url = location.origin + "/room/" + S.code, free = S.teams.filter(t => !t.claimed).length;
  const mine = S.you.teamId;
  $app.innerHTML = `${header()}
  <div class="card"><h3>Invite teams</h3>
    <p class="mute">Share the code or the link. Each person picks one franchise.</p>
    <div class="row"><span class="code">${S.code}</span><button class="ghost" data-a="copy" data-v="${S.code}">Copy code</button></div>
    <div class="share" style="margin-top:8px"><input readonly value="${esc(url)}"><button class="ghost" data-a="copy" data-v="${esc(url)}">Copy link</button></div></div>
  <div class="card" style="margin-top:12px"><div class="row"><h3 class="grow">Pick your franchise</h3>
    <span class="mute">Purse ${fmt(S.config.purse)} · squad ${S.config.minSquad}-${S.config.maxSquad} · max ${S.config.maxOverseas} overseas${S.config.rtmCards ? " · " + S.config.rtmCards + " RTM" : ""}</span></div>
    <div class="teams" style="margin-top:10px">${S.teams.map(t => teamCard(t, !t.claimed && !mine ? `<button data-a="claim" data-v="${t.id}" style="margin-top:8px">Claim</button>`
      : t.claimed && (S.you.teamId === t.id || S.you.isHost) ? `<button class="ghost" data-a="release" data-v="${t.id}" style="margin-top:8px">${S.you.teamId === t.id ? "Leave team" : "Remove"}</button>` : "")).join("")}</div>
    ${S.you.isHost ? `<button class="bigbtn" data-a="start" ${S.teams.filter(t => t.claimed).length < 2 ? "disabled" : ""}>Start auction (${S.teams.length - free} teams)</button>` : `<p class="mute">Waiting for the host (${esc(S.hostName)}) to start…</p>`}
  </div>`;
}

function header() {
  const st = S.status === "LIVE" ? '<span class="badge live">LIVE</span>' : S.status === "PAUSED" ? '<span class="badge pause">PAUSED</span>' : `<span class="badge">${S.status}</span>`;
  return `<div class="hdr"><div class="row"><span class="logo" style="font-size:20px">IPL <span>Auction</span></span><span class="code" style="font-size:16px">${S.code}</span>${st}
    ${S.round === 2 && S.status !== "LOBBY" ? '<span class="badge">Accelerated round</span>' : ""}</div>
    <div class="row"><button class="ghost" data-a="sound">${Announcer.enabled ? "🔊 Sound on" : "🔇 Enable sound"}</button>${Announcer.enabled && Announcer.voices().length ? `<select id="voice" style="width:auto;max-width:190px">${Announcer.voices().map(v => `<option ${v.name === (Announcer.voiceName || "") ? "selected" : ""}>${esc(v.name)}</option>`).join("")}</select>` : ""}${S.you.isHost && (S.status === "LIVE" || S.status === "PAUSED") ? (S.status === "LIVE" ? '<button class="ghost" data-a="pause">Pause</button>' : '<button data-a="resume">Resume</button>') : ""}
    <button class="ghost" data-a="copy" data-v="${esc(location.origin + "/room/" + S.code)}">Copy link</button></div></div>`;
}

function auction() {
  const c = S.current, me = S.you.teamId, lead = S.bid.teamId && teamBy(S.bid.teamId);
  let banner = "";
  if (S.phase === "BREAK" && S.lastResult) banner = S.lastResult.sold
    ? `<div class="banner sold">SOLD! ${esc(S.lastResult.name)} to ${esc(teamBy(S.lastResult.teamId)?.name)} for ${fmt(S.lastResult.amount)}${S.lastResult.rtm ? " (RTM)" : ""}</div>`
    : `<div class="banner unsold">UNSOLD: ${esc(S.lastResult.name)}</div>`;
  const rtmMine = S.phase === "RTM" && S.rtm && S.rtm.teamId === me;
  if (S.phase === "RTM") banner = `<div class="banner rtm">RTM: ${esc(teamBy(S.rtm.teamId)?.name)} may match ${fmt(S.rtm.amount)} (winning bid: ${esc(teamBy(S.bid.teamId)?.name)})
    ${rtmMine ? `<div class="row" style="justify-content:center;margin-top:8px"><button data-a="rtm" data-v="1">Match ${fmt(S.rtm.amount)}</button><button class="ghost" data-a="rtm" data-v="0">Pass</button></div>` : ""}</div>`;
  const extra = c ? Object.entries(c.extra || {}).map(([k, v]) => `<div class="fact"><b>${esc(k)}</b>${esc(v)}</div>`).join("") : "";
  const card = c ? `<div class="card player">
      <div class="mute">${esc(c.set)} · ${S.remaining} more after this</div>
      <div class="photo" id="photo">${esc(initials(c.name))}</div>
      <div class="pname">${esc(c.name)}</div>
      <div class="tags"><span class="badge">${esc(c.role)}</span><span class="badge">${c.capped ? "Capped" : "Uncapped"}</span><span class="badge ${c.overseas ? "os" : ""}">${esc(c.country)}${c.overseas ? " · Overseas" : ""}</span></div>
      <div class="facts"><div class="fact"><b>Base price</b><span class="money">${fmt(c.basePrice)}</span></div><div class="fact"><b>Previous team (IPL 2026)</b>${esc(teamBy(c.prevTeam)?.name || c.prevTeam)}</div>${extra}</div>
      ${statsHtml(c.stats)}
      <div class="bidbox">
        <div class="mute">${S.bid.teamId ? "Current bid" : "Opening at base price"}</div>
        <div class="amt">${S.bid.teamId ? fmt(S.bid.amount) : fmt(c.basePrice)}</div>
        <div class="mute">${lead ? "Highest bidder: <b style='color:" + lead.color + "'>" + esc(lead.name) + "</b>" : "No bids yet"}</div>
        <div class="bar"><i id="bar"></i></div><div class="timer" id="timer">-</div>
        ${me && S.phase === "BIDDING" && S.status === "LIVE" ? `<button class="bigbtn" data-a="bid" ${S.you.bidError ? "disabled" : ""}>${S.you.bidError ? esc(S.you.bidError) : "BID " + fmt(S.nextAmount) + "  (Space)"}</button>` : !me ? '<div class="mute" style="margin-top:8px">You are spectating</div>' : ""}
        ${S.you.isHost && S.phase === "BIDDING" ? `<div class="row" style="justify-content:center;margin-top:10px"><button class="ghost" data-a="host" data-v="sell_now">Sell now</button><button class="ghost" data-a="host" data-v="skip">Skip (unsold)</button></div>` : ""}
      </div></div>`
    : `<div class="card player"><div class="pname">${S.status === "PAUSED" ? "Auction paused" : "Next player coming…"}</div></div>`;
  const up = S.upcoming.length ? `<div class="card" style="margin-top:12px"><div class="sec" style="margin-top:0">Up next</div>${S.upcoming.map(p => `<div class="pl"><span class="who">${av(p.name, p.photo)}${esc(p.name)} <span class="badge">${esc(p.role)}</span></span><span class="money">${fmt(p.basePrice)}</span></div>`).join("")}</div>` : "";
  $app.innerHTML = `${header()}${banner}<div class="grid"><div>${card}${up}</div>
    <div><div class="card"><div class="sec" style="margin-top:0">Teams</div><div style="display:grid;gap:8px">${S.teams.map(t => `<div data-a="toggle" data-v="${t.id}" style="cursor:pointer">${teamCard(t, openTeam === t.id ? squadHtml(t) : "")}</div>`).join("")}</div></div>
    <div class="card" style="margin-top:12px"><div class="sec" style="margin-top:0">Live feed</div><div class="log">${[...S.log].reverse().map(l => `<div>${esc(l.text)}</div>`).join("")}</div></div></div></div>`;
}

function summary() {
  const all = S.teams.flatMap(t => t.squad.map(p => ({ ...p, team: t.id }))).sort((a, b) => b.price - a.price);
  $app.innerHTML = `${header()}<div class="card"><h2>Auction complete</h2><p class="mute">${S.sold} players sold · ${S.unsold.length} unsold</p>
    <div class="row"><button data-a="compare">Compare all squads</button><button class="ghost" data-a="csv">Download all squads (CSV)</button></div>
    <div class="sec">Most expensive buys</div><table><tr><th>#</th><th>Player</th><th>Team</th><th>Price</th></tr>${all.slice(0, 10).map((p, i) => `<tr><td>${i + 1}</td><td>${esc(p.name)}</td><td>${esc(p.team)}</td><td class="money">${fmt(p.price)}</td></tr>`).join("")}</table></div>
    <div class="card" style="margin-top:12px"><div class="sec" style="margin-top:0">Final squads (tap a team)</div><div class="teams">${S.teams.map(t => `<div data-a="toggle" data-v="${t.id}" style="cursor:pointer">${teamCard(t, openTeam === t.id ? squadHtml(t) : "")}</div>`).join("")}</div></div>
    ${S.unsold.length ? `<div class="card" style="margin-top:12px"><div class="sec" style="margin-top:0">Unsold</div><span class="mute">${S.unsold.map(esc).join(", ")}</span></div>` : ""}`;
}

function compareView() {
  const C = S.compare || [], sc = v => `<span class="sc ${v >= 7 ? "hi" : v >= 5 ? "mid" : "lo"}">${v}</span>`;
  const list = (arr, cls) => `<ul class="${cls}">${arr.map(x => `<li>${esc(x)}</li>`).join("")}</ul>`;
  $app.innerHTML = `${header()}
  <div class="card"><div class="row"><h2 class="grow">Squad comparison</h2><button class="ghost" data-a="back">Back to results</button></div>
    <p class="mute">Each squad is scored out of 10 from its best XI (max 4 overseas, a keeper, 5+ bowling options): batting 25%, bowling 30%, all-rounders 15%, bench depth 15%, balance 15%. Player strength = tier rating, refined by T20 stats when loaded.</p>
    <div style="overflow-x:auto"><table><tr><th>#</th><th>Team</th><th>Overall /10</th><th>Batting</th><th>Bowling</th><th>All-round</th><th>Bench</th><th>Balance</th><th>Squad</th></tr>
    ${C.map(t => `<tr><td>${t.rank}</td><td><b style="color:${t.color}">${esc(t.name)}</b><div class="mute" style="font-size:12px">${esc(t.owner || "")}</div></td><td>${sc(t.overall)}</td><td>${t.scores.batting}</td><td>${t.scores.bowling}</td><td>${t.scores.allround}</td><td>${t.scores.depth}</td><td>${t.scores.balance}</td><td>${t.squadSize}</td></tr>`).join("")}</table></div></div>
  ${C.map(t => `<div class="card" style="margin-top:12px;border-left:4px solid ${t.color}">
    <div class="row"><h3 class="grow">#${t.rank} ${esc(t.name)}</h3><span class="bigsc">${t.overall}<small>/10</small></span></div>
    <div class="cmp"><div><div class="sec">Strongest playing XI</div>${t.xi.map((p, i) => `<div class="pl"><span class="who">${i + 1}. ${av(p.name, p.photo)}${esc(p.name)} ${p.overseas ? '<span class="badge os">OS</span>' : ""}</span><span class="mute">${esc(p.role)}</span></div>`).join("")}
      ${t.impact ? `<div class="pl" style="margin-top:6px"><span class="who">Impact: ${av(t.impact.name, t.impact.photo)}${esc(t.impact.name)}</span><span class="mute">${esc(t.impact.role)}</span></div>` : ""}</div>
    <div class="swot"><div class="sec">Strengths</div>${list(t.swot.strengths, "g")}<div class="sec">Weaknesses</div>${list(t.swot.weaknesses, "r")}
      <div class="sec">Opportunities</div>${list(t.swot.opportunities, "b")}<div class="sec">Threats</div>${list(t.swot.threats, "o")}
      <div class="sec">Balance</div><div>${t.scores.balance}/10</div></div></div></div>`).join("")}`;
}

function render() {
  if (!S) return home();
  const key = S.status + S.phase;
  S.status === "LOBBY" ? lobby() : S.status === "COMPLETED" ? (view === "compare" ? compareView() : summary()) : auction();
  lastKey = key; tick(); prefetch();
  if (S.current && document.getElementById("photo")) showPhoto(S.current.name, S.current.photo);
}

// ---------- countdown ----------
function tick() {
  const el = document.getElementById("timer"); if (!el || !S) return;
  const left = S.status === "PAUSED" ? S.pausedLeft : Math.max(0, (S.deadline || 0) - (Date.now() + offset));
  const total = S.phase === "RTM" ? 10000 : S.config.bidMs;
  if (S.phase === "BIDDING" || S.phase === "RTM") {
    el.textContent = Math.ceil(left / 1000) + "s"; el.className = "timer" + (left < 4000 ? " low" : "");
    const b = document.getElementById("bar"); if (b) b.style.width = Math.min(100, left / total * 100) + "%";
  } else el.textContent = "";
}
setInterval(tick, 100);

// ---------- actions ----------
document.addEventListener("click", e => {
  const b = e.target.closest("[data-a]"); if (!b) return;
  const a = b.dataset.a, v = b.dataset.v;
  const nameEl = document.getElementById("name");
  const needName = () => { myName = (nameEl?.value || myName).trim(); if (!myName) { toast("Enter your name", true); return false; } localStorage.setItem("name", myName); return true; };
  if (a === "create") { if (!needName()) return;
    fetch("/api/rooms", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ userId: uid, name: myName,
      options: { purseCr: +document.getElementById("purse").value, bidSeconds: +document.getElementById("secs").value, rtmCards: +document.getElementById("rtm").value, accelerated: document.getElementById("accel").value === "true" } }) })
      .then(r => r.json()).then(d => d.error ? toast(d.error, true) : join(d.code)); }
  else if (a === "joincode") { if (!needName()) return; const c = document.getElementById("code").value.trim(); if (c.length < 4) return toast("Enter the room code", true); join(c); }
  else if (a === "joinurl") { if (needName()) join(pathCode); }
  else if (a === "copy") copy(v);
  else if (a === "claim") send("claim_team", { teamId: v });
  else if (a === "release") send("release_team", { teamId: v });
  else if (a === "start") send("start_auction");
  else if (a === "bid") send("place_bid");
  else if (a === "rtm") send("rtm_decision", { match: v === "1" });
  else if (a === "pause") send("pause");
  else if (a === "resume") send("resume");
  else if (a === "host") send("host_action", { action: v });
  else if (a === "toggle") { openTeam = openTeam === v ? null : v; render(); }
  else if (a === "csv") downloadCsv();
  else if (a === "compare") { view = "compare"; render(); window.scrollTo(0, 0); }
  else if (a === "back") { view = "main"; render(); }
  else if (a === "sound") { Announcer.toggle(); render(); }
});
document.addEventListener("change", e => { if (e.target.id === "voice") { Announcer.setVoice(e.target.value); Announcer.text("Voice changed."); } });
document.addEventListener("keydown", e => {
  if (e.code === "Space" && S && S.status === "LIVE" && S.phase === "BIDDING" && S.you.teamId && !S.you.bidError && !/INPUT|BUTTON/.test(document.activeElement.tagName)) { e.preventDefault(); send("place_bid"); }
});

function downloadCsv() {
  const rows = [["Team", "Owner", "Player", "Role", "Country", "Overseas", "Price (Cr)", "Via RTM"]];
  S.teams.forEach(t => t.squad.forEach(p => rows.push([t.name, t.ownerName, p.name, p.role, p.country, p.overseas, p.price / 100, !!p.rtm])));
  const blob = new Blob([rows.map(r => r.map(x => `"${String(x).replace(/"/g, '""')}"`).join(",")).join("\n")], { type: "text/csv" });
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `ipl-auction-${S.code}.csv`; a.click();
}

if (pathCode && myName) join(pathCode); else render();
