// IPL Auction Live: client. The server is the single source of truth; this only renders state and sends intents.
const $app = document.getElementById("app");
const socket = io();
// getRandomValues also works on plain http:// (LAN) pages, unlike crypto.randomUUID
const uid = localStorage.getItem("uid") || (() => { const v = Array.from(crypto.getRandomValues(new Uint8Array(16)), x => x.toString(16).padStart(2, "0")).join(""); localStorage.setItem("uid", v); return v; })();
let myName = localStorage.getItem("name") || "";
let S = null, offset = 0, openTeam = null, view = "main", sortBy = "overall", modal = null, stamp = null, lastAmount = null, lastCur = null;
let pathCode = (location.pathname.match(/^\/room\/(\w+)/) || [])[1];
const lastRoom = () => localStorage.getItem("lastRoom") || "";
const reduceMotion = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;

// The ten franchises (used where the room has not claimed them, e.g. "previous team" and the sound test)
const TEAMS = [["CSK", "Chennai Super Kings", "#f5c518"], ["DC", "Delhi Capitals", "#3b82c4"], ["GT", "Gujarat Titans", "#6c8cff"], ["KKR", "Kolkata Knight Riders", "#9b59d0"], ["LSG", "Lucknow Super Giants", "#2bc4d6"],
  ["MI", "Mumbai Indians", "#2d7be5"], ["PBKS", "Punjab Kings", "#e8434a"], ["RR", "Rajasthan Royals", "#ee4fa0"], ["RCB", "Royal Challengers Bengaluru", "#d9232d"], ["SRH", "Sunrisers Hyderabad", "#ff7a00"]].map(([id, name, color]) => ({ id, name, color }));
const tinfo = id => (S && S.teams.find(t => t.id === id)) || TEAMS.find(t => t.id === id) || { id, name: id, color: "#667" };

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
const initials = n => n.split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]).join("").toUpperCase();
const nv = v => v === null || v === undefined ? "-" : v;

// ---- franchise crest: your logo file (public/logos/<TEAM>.png|svg) if present, else a coloured monogram badge ----
function crest(id, size = 40) {
  const t = tinfo(id), logo = S && S.assets && S.assets.logos && S.assets.logos[id];
  return `<span class="crest" style="--c:${t.color};--s:${size}px" title="${esc(t.name)}">${logo ? `<img src="${esc(logo)}" alt="${esc(id)}" onerror="this.remove()">` : ""}${logo ? "" : esc(id)}</span>`;
}

// ---- player photos: server photo (your -ipl file, else Wikipedia download), then a live Wikipedia lookup in this browser ----
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
  } catch (e) { return ""; }
}
const av = (name, photo, cls = "") => { const u = photo || photoCache[name] || ""; return `<span class="av ${cls}" data-pn="${esc(name)}">${esc(initials(name))}${u ? `<img src="${esc(u)}" alt="" loading="lazy" onerror="this.remove()">` : ""}</span>`; };
async function fillPhotos() {            // players with no photo from the server: try Wikipedia once, in the background
  for (const el of document.querySelectorAll(".av[data-pn], #photo[data-pn]")) {
    if (el.querySelector("img") || el.dataset.tried) continue;
    el.dataset.tried = "1";
    const url = await fetchPhoto(el.dataset.pn);
    if (url && el.isConnected && !el.querySelector("img")) { const i = new Image(); i.alt = ""; i.src = url; i.onload = () => el.isConnected && el.appendChild(i); }
  }
}

// ---- records ----
function numsHtml(r, role) {
  if (!r) return "";
  const showBat = role !== "Bowler" || r.runs >= 100, showBowl = role === "Bowler" || role === "All-rounder" || r.wkts > 0;
  const bat = `<div><b>${nv(r.runs)}</b><span>Runs</span></div><div><b>${nv(r.hs)}</b><span>High score</span></div><div><b>${nv(r.avg)}</b><span>Average</span></div><div><b>${nv(r.sr)}</b><span>Strike rate</span></div>
    <div><b>${nv(r.m)}</b><span>Matches</span></div><div><b>${nv(r.fifties)}/${nv(r.hundreds)}</b><span>50s / 100s</span></div><div><b>${nv(r.fours)}</b><span>Fours</span></div><div><b>${nv(r.sixes)}</b><span>Sixes</span></div>`;
  const bowl = `<div><b>${nv(r.wkts)}</b><span>Wickets</span></div><div><b>${nv(r.best)}</b><span>Best</span></div><div><b>${nv(r.econ)}</b><span>Economy</span></div><div><b>${nv(r.m)}</b><span>Matches</span></div>`;
  const first = role === "Bowler" ? [["Bowling", bowl, showBowl], ["Batting", bat, showBat]] : [["Batting", bat, showBat], ["Bowling", bowl, showBowl]];
  return `<div class="nums">${first.filter(x => x[2]).map(([h, html], i) => `${first.filter(x => x[2]).length > 1 ? `<div class="sub">${h}</div>` : ""}${html}`).join("")}</div>`;
}
function recordsHtml(c) {
  const st = c.stats, role = c.role;
  const panel = (title, sub, r, empty) => `<div class="rec"><h4>${title}<small>${sub}</small></h4>${r ? numsHtml(r, role) : `<div class="none">${empty}</div>`}</div>`;
  const loaded = !!(st && st.t20);
  const miss = "Stats are still loading on the server. They appear after the data build finishes.";
  const yrs = loaded ? Object.keys(st.years || {}).sort() : [];
  return `<div class="recs">
    ${panel("IPL record", "Indian Premier League", loaded ? st.ipl : null, loaded ? "No IPL matches yet. A new face for the league." : miss)}
    ${panel("International T20 record", "T20 Internationals", loaded ? st.intl : null, loaded ? "No T20 international matches yet." : miss)}
  </div>
  ${loaded ? `<div class="years"><div class="sec" style="margin-top:12px">Last 3 years (all T20 cricket)</div>
    <table><tr><th>Year</th><th>M</th><th>Runs</th><th>SR</th><th>Avg</th><th>Wkts</th><th>Econ</th></tr>
    ${yrs.map(y => { const r = st.years[y]; return `<tr><td>${y}</td><td>${nv(r.m)}</td><td>${nv(r.runs)}</td><td>${nv(r.sr)}</td><td>${nv(r.avg)}</td><td>${nv(r.wkts)}</td><td>${nv(r.econ)}</td></tr>`; }).join("")}</table>
    <details class="lg"><summary>All T20 career and by league</summary>
      <table><tr><th>Competition</th><th>M</th><th>Runs</th><th>SR</th><th>Avg</th><th>Wkts</th><th>Econ</th></tr>
      <tr><td><b>All T20</b></td><td>${nv(st.t20.m)}</td><td>${nv(st.t20.runs)}</td><td>${nv(st.t20.sr)}</td><td>${nv(st.t20.avg)}</td><td>${nv(st.t20.wkts)}</td><td>${nv(st.t20.econ)}</td></tr>
      ${(st.leagues || []).map(r => `<tr><td>${esc(r.name)}</td><td>${nv(r.m)}</td><td>${nv(r.runs)}</td><td>${nv(r.sr)}</td><td>${nv(r.avg)}</td><td>${nv(r.wkts)}</td><td>${nv(r.econ)}</td></tr>`).join("")}</table>
      <div class="src">Source: cricsheet.org (ODC-BY). Afghanistan matches are withheld there, so Afghan players' numbers are incomplete.</div></details></div>` : ""}`;
}

// ---------- effects ----------
function confetti(color) {
  if (reduceMotion) return;
  const cv = document.getElementById("fx"), ctx = cv.getContext("2d"); cv.width = innerWidth; cv.height = innerHeight;
  const cols = [color, "#f6b928", "#ffffff", "#32d17f"], ps = Array.from({ length: 130 }, () => ({ x: innerWidth / 2 + (Math.random() - .5) * 200, y: innerHeight * .4, vx: (Math.random() - .5) * 14, vy: -Math.random() * 14 - 4, s: 5 + Math.random() * 7, r: Math.random() * 6, vr: (Math.random() - .5) * .4, c: cols[Math.random() * 4 | 0] }));
  const t0 = performance.now();
  (function frame(t) {
    const k = t - t0; ctx.clearRect(0, 0, cv.width, cv.height);
    ps.forEach(p => { p.vy += .35; p.x += p.vx; p.y += p.vy; p.r += p.vr; ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.r); ctx.fillStyle = p.c; ctx.globalAlpha = Math.max(0, 1 - k / 2600); ctx.fillRect(-p.s / 2, -p.s / 3, p.s, p.s * .6); ctx.restore(); });
    if (k < 2600) requestAnimationFrame(frame); else ctx.clearRect(0, 0, cv.width, cv.height);
  })(t0);
}
let stampTimer = null;
function showStamp(s) { stamp = s; clearTimeout(stampTimer); stampTimer = setTimeout(() => { const el = document.querySelector(".stamp"); if (el) el.classList.add("hide"); setTimeout(() => { stamp = null; const e2 = document.querySelector(".stamp"); if (e2) e2.remove(); }, 500); }, 2600); }

function join(code) {
  if (!myName) return;
  socket.emit("join_room", { code: code.toUpperCase(), userId: uid, name: myName });
}

// ---------- socket events ----------
socket.on("connect", () => { if (S) join(S.code); else if (pathCode && myName) join(pathCode); });
socket.on("joined", d => { try { localStorage.setItem("lastRoom", d.code); } catch (e) {} });
socket.on("state", s => {
  S = s; offset = s.serverTime - Date.now(); pathCode = s.code;
  Announcer.setThemes(s.assets && s.assets.themes);
  if (location.pathname !== "/room/" + s.code) history.replaceState({}, "", "/room/" + s.code);
  render();
});
socket.on("error_msg", m => { toast(m, true); if (!S) render(); });
socket.on("player_up", p => { stamp = null; Announcer.playerUp(p); });
socket.on("bid", b => Announcer.bid(S && S.teams.find(t => t.id === b.teamId) ? teamBy(b.teamId).name : b.teamId, b.amount));
socket.on("rtm_prompt", b => Announcer.rtm(S && S.teams.find(t => t.id === b.teamId) ? teamBy(b.teamId).name : b.teamId));
socket.on("player_sold", r => {
  const t = tinfo(r.teamId); showStamp({ kind: "sold", ...r }); confetti(t.color); if (S) render();
  Announcer.sold(r, t.name);
});
socket.on("player_unsold", r => { showStamp({ kind: "unsold", ...r }); if (S) render(); Announcer.unsold(r); });
socket.on("round_ended", r => toast(`Round ended: ${r.set}${r.skipped ? ` (${r.skipped} players left unsold)` : ""}`));
socket.on("accelerated_round", r => toast(`Accelerated round: ${r.count} unsold players are back`));
socket.on("auction_ended", () => toast("Auction over. Compare the squads!"));

// ---------- views ----------
function home() {
  const err = pathCode && !S ? `<p class="mute">Joining room <b>${esc(pathCode)}</b>. Enter your name to continue.</p>` : "";
  const rj = lastRoom() && !pathCode ? `<div class="rejoin"><div class="grow"><b>Back to room ${esc(lastRoom())}?</b><div class="mute" style="font-size:13px">Your team is kept while the room is open.</div></div><button data-a="rejoin" data-v="${esc(lastRoom())}">Rejoin</button></div>` : "";
  $app.innerHTML = `<div class="home card">
    <div class="logo">IPL <span>Auction</span> Live</div>
    <p class="mute">Real-time mega auction with rooms, live bidding, IPL rules, player records and a smart coach.</p>${err}${rj}
    <label>Your name</label><input id="name" maxlength="24" placeholder="e.g. Aman" value="${esc(myName)}" autocomplete="nickname">
    ${pathCode ? `<button class="bigbtn" data-a="joinurl">Join room ${esc(pathCode)}</button><button class="ghost bigbtn" data-a="home" style="margin-top:8px">Not this room</button>` : `
    <label>Have a room code?</label>
    <div class="row"><input id="code" maxlength="6" placeholder="ROOM CODE" style="text-transform:uppercase;flex:1"><button data-a="joincode">Join</button></div>
    <h3 style="margin-top:24px">Create a new room</h3>
    <div class="row"><div class="grow"><label>Purse per team (Cr)</label><input id="purse" type="number" value="120" min="50" max="300"></div>
    <div class="grow"><label>Bid timer (sec)</label><input id="secs" type="number" value="15" min="5" max="60"></div>
    <div class="grow"><label>RTM cards / team</label><input id="rtm" type="number" value="0" min="0" max="6"></div></div>
    <label>Unsold players</label><select id="accel"><option value="false">Each player is auctioned only once</option><option value="true">Re-offer unsold players at the end (accelerated round)</option></select>
    <button class="bigbtn" data-a="create">Create room</button>`}
  </div>`;
}

const squadHtml = t => {
  if (!t.squad.length) return `<div class="mute" style="font-size:12px;margin-top:6px">No players yet</div>`;
  return `<div class="squad">` + roleOrder.map(r => { const l = t.squad.filter(p => p.role === r); return l.length ? `<div class="sec">${r}s (${l.length})</div>` + l.map(p => `<div class="pl">${av(p.name, p.photo)}<span class="who"><span class="n">${esc(p.name)}</span>${p.overseas ? '<span class="badge os">OS</span>' : ""}${p.rtm ? '<span class="badge">RTM</span>' : ""}</span><span class="money">${fmt(p.price)}</span></div>`).join("") : ""; }).join("") + `</div>`;
};

function teamCard(t, extra = "") {
  const me = S.you.teamId === t.id, lead = S.bid.teamId === t.id && S.phase === "BIDDING", cfg = S.config;
  return `<div class="tcard ${me ? "me" : ""} ${lead ? "lead" : ""}" style="--c:${t.color}" data-a="toggle" data-v="${t.id}" role="button" tabindex="0">
    <div class="row" style="flex-wrap:nowrap">${crest(t.id, 38)}<div class="grow"><div class="nm">${esc(t.name)}</div>
      <div class="sm">${t.claimed ? esc(t.ownerName) + (me ? " (you)" : "") : "Free"} ${t.claimed ? `<span class="dot ${t.online ? "on" : ""}" title="${t.online ? "online" : "offline"}"></span>` : ""}</div></div>
      <div style="text-align:right"><div class="money">${fmt(t.purse)}</div><div class="sm">${t.squad.length}/${cfg.maxSquad} · OS ${t.overseas}/${cfg.maxOverseas}${cfg.rtmCards ? " · RTM " + t.rtmCards : ""}</div></div></div>
    ${extra}</div>`;
}

function lobby() {
  const url = location.origin + "/room/" + S.code, claimed = S.teams.filter(t => t.claimed).length, mine = S.you.teamId;
  $app.innerHTML = `${header()}
  <div class="card"><h3>Invite your friends</h3>
    <p class="mute" style="margin:0 0 10px">Share the code or the link. Each person picks one franchise.</p>
    <div class="row"><span class="code">${S.code}</span><button class="ghost" data-a="copy" data-v="${S.code}">Copy code</button></div>
    <div class="share" style="margin-top:8px"><input readonly value="${esc(url)}" aria-label="Room link"><button class="ghost" data-a="copy" data-v="${esc(url)}">Copy link</button></div></div>
  <div class="card" style="margin-top:14px"><div class="row"><h3 class="grow" style="margin:0">Pick your franchise</h3>
    <span class="mute">Purse ${fmt(S.config.purse)} · squad ${S.config.minSquad}-${S.config.maxSquad} · max ${S.config.maxOverseas} overseas${S.config.rtmCards ? " · " + S.config.rtmCards + " RTM" : ""}</span></div>
    <div class="pickgrid">${S.teams.map(t => { const own = S.you.teamId === t.id; return `<div class="pick ${own ? "mine" : ""} ${t.claimed ? "taken" : ""}" style="--c:${t.color}">
      ${crest(t.id, 68)}<div class="nm">${esc(t.name)}</div><div class="own">${t.claimed ? esc(t.ownerName) + (own ? " (you)" : "") : "Available"}</div>
      ${!t.claimed && !mine ? `<button data-a="claim" data-v="${t.id}">Claim</button>` : t.claimed && (own || S.you.isHost) ? `<button class="ghost sm" data-a="release" data-v="${t.id}">${own ? "Leave team" : "Remove"}</button>` : (t.claimed ? `<button class="ghost sm" disabled>Taken</button>` : "")}</div>`; }).join("")}</div>
    ${S.you.isHost ? `<button class="bigbtn" data-a="start" ${claimed < 2 ? "disabled" : ""}>${claimed < 2 ? "Waiting for at least 2 teams" : `Start auction (${claimed} teams)`}</button>` : `<p class="mute" style="margin-bottom:0">Waiting for the host (${esc(S.hostName)}) to start…</p>`}
  </div>`;
}

function header() {
  const st = S.status === "LIVE" ? '<span class="badge live">● LIVE</span>' : S.status === "PAUSED" ? '<span class="badge pause">PAUSED</span>' : `<span class="badge">${S.status === "COMPLETED" ? (S.endedEarly ? "ENDED" : "COMPLETE") : S.status}</span>`;
  const host = S.you.isHost, running = S.status === "LIVE", on = S.status === "LIVE" || S.status === "PAUSED";
  return `<div class="hdr"><div class="left"><button class="ghost backbtn" data-a="back" title="Back to the home screen. Your team stays yours.">← Back</button>
      <span class="logo">IPL <span>Auction</span></span><span class="code">${S.code}</span>${st}${S.round === 2 && S.status !== "LOBBY" ? '<span class="badge">Accelerated round</span>' : ""}</div>
    <div class="right"><button class="ghost sm" data-a="sound">${Announcer.enabled ? "🔊 Sound" : "🔇 Sound off"}</button><button class="ghost sm" data-a="copy" data-v="${esc(location.origin + "/room/" + S.code)}">Copy link</button>
      ${host && on ? (running ? '<button class="ghost sm" data-a="pause">Pause</button>' : '<button class="sm" data-a="resume">Resume</button>') : ""}
      ${host && running ? '<button class="danger sm" data-a="ask-round">End round</button>' : ""}${host && on ? '<button class="danger sm" data-a="ask-auction">End auction</button>' : ""}</div></div>`;
}

function ribbon() {
  const p = S.progress; if (!p || !p.sets) return "";
  const idx = p.sets.findIndex(x => x.name === p.set), cur = p.sets[idx];
  return `<div class="ribbon" aria-hidden="true">${p.sets.map(x => `<i class="${x.name === p.set ? "now" : ""}" title="${esc(x.name)} (${x.done}/${x.total})"><b style="--p:${Math.round(x.done / x.total * 100)}%"></b></i>`).join("")}</div>
    <div class="ribinfo"><span>${cur ? `Set <b>${idx + 1} of ${p.sets.length}</b> · <b>${esc(cur.name)}</b> · ${cur.total - cur.done} left in this set` : "Final stretch"}</span><span><b>${p.done}</b> of ${p.total} players done${S.status === "LIVE" ? "" : ""}</span></div>`;
}

function coachHtml() {
  const k = S.insights; if (!k || !S.you.teamId) return "";
  const live = k.live && S.phase === "BIDDING" ? `<div class="verdict ${k.live.fit}"><span class="tag">${{ must: "Must have", good: "Good fit", luxury: "Luxury", blocked: "Can't bid" }[k.live.fit]}</span><b>${esc(k.live.name)}</b>
      <div style="margin-top:4px;font-size:14px">${esc(k.live.text)}</div>${k.live.ceiling ? `<div class="mute" style="font-size:13px;margin-top:2px">Suggested limit: <span class="money">${fmt(k.live.ceiling)}</span></div>` : ""}</div>` : "";
  const b = k.budget, tot = Math.max(1, b.purse), resPct = Math.min(100, b.reserve / tot * 100), freePct = 100 - resPct;
  return `<div class="card coach"><div class="head"><span class="spark">AI</span><div><div class="mute" style="font-size:12px;font-weight:600;letter-spacing:.05em;text-transform:uppercase">Smart coach · ${esc(tinfo(S.you.teamId).name)}</div><div class="hl">${esc(k.headline)}</div></div></div>
    ${live}
    ${k.needs.length ? `<div class="sec">Players you need</div>${k.needs.map(n => `<div class="need"><span class="p ${n.priority}" title="${n.priority} priority"></span><div><b>${esc(n.role)}s</b> <span class="mute">${n.have} of ${n.target}</span>${n.scarce ? ' <span class="badge pause">few left</span>' : ""}<div class="mute" style="font-size:13px">${esc(n.text)}</div></div>
      ${n.categories.length ? `<div class="chips">${n.categories.map(c => `<span class="chip">${esc(c.name)} <i>· ${c.left} left</i></span>`).join("")}</div>` : ""}</div>`).join("")}` : ""}
    <div class="sec">Budget</div><div class="budget"><i class="free" style="width:${freePct}%"></i><i class="res" style="width:${resPct}%"></i></div>
    <div class="mute" style="font-size:12.5px"><span style="color:var(--good)">●</span> Free ${fmt(b.spendable)} &nbsp; <span style="color:var(--gold)">●</span> Reserved ${fmt(b.reserve)} for ${b.slotsMin} more player(s)</div>
    ${k.tips.length ? `<div style="margin-top:8px">${k.tips.map(t => `<div class="tip">${esc(t)}</div>`).join("")}</div>` : ""}</div>`;
}

function feedHtml() {
  const items = [...S.log].reverse().map(l => {
    if (l.kind === "sold") { const t = tinfo(l.teamId); return `<div class="fi sold">${av(l.player, l.photo, "lg")}<div class="tx"><b>${esc(l.player)}</b><br><small>Sold to ${esc(t.name)}</small></div>${crest(l.teamId, 34)}<span class="money">${fmt(l.amount)}</span></div>`; }
    if (l.kind === "unsold") return `<div class="fi unsold">${av(l.player, l.photo, "lg")}<div class="tx"><b>${esc(l.player)}</b><br><small>Unsold</small></div></div>`;
    return `<div class="fi sys">${esc(l.text)}</div>`;
  }).join("");
  return `<div class="card"><div class="sec" style="margin-top:0">Live field</div><div class="feed">${items || '<div class="mute">The first sale will show up here with the player\'s photo.</div>'}</div></div>`;
}

function auction() {
  const c = S.current, me = S.you.teamId, lead = S.bid.teamId && tinfo(S.bid.teamId);
  let banner = "";
  if (S.phase === "RTM" && S.rtm) {
    const mine = S.rtm.teamId === me;
    banner = `<div class="banner rtm"><span class="grow">RTM: ${esc(tinfo(S.rtm.teamId).name)} may match ${fmt(S.rtm.amount)} (winning bid: ${esc(tinfo(S.bid.teamId).name)})</span>${mine ? `<button data-a="rtm" data-v="1">Match ${fmt(S.rtm.amount)}</button><button class="ghost" data-a="rtm" data-v="0">Pass</button>` : ""}</div>`;
  } else if (S.phase === "BREAK" && S.lastResult) banner = S.lastResult.sold
    ? `<div class="banner sold">${crest(S.lastResult.teamId, 36)}<span>SOLD! ${esc(S.lastResult.name)} to ${esc(tinfo(S.lastResult.teamId).name)} for ${fmt(S.lastResult.amount)}${S.lastResult.rtm ? " (RTM)" : ""}</span></div>`
    : `<div class="banner unsold">UNSOLD: ${esc(S.lastResult.name)}</div>`;

  let hero;
  if (c) {
    const prev = tinfo(c.prevTeam), tc = prev.color, inRoom = S.bid.teamId;
    const extra = Object.entries(c.extra || {}).map(([k, v]) => `<div class="fact"><b>${esc(k)}</b>${esc(v)}</div>`).join("");
    const url = c.photo || photoCache[c.name] || "";
    const canBid = me && S.phase === "BIDDING" && S.status === "LIVE", nextTxt = S.nextAmount ? fmt(S.nextAmount) : "";
    const btn = canBid ? `<button data-a="bid" ${S.you.bidError ? "disabled" : ""}>${S.you.bidError ? esc(S.you.bidError) : "BID " + nextTxt}</button><div class="hint">${S.you.bidError ? "" : "Press Space to bid"}</div>` : !me ? '<div class="spect">You are spectating</div>' : "";
    hero = `<div class="card hero" style="--tc:${tc}">
      ${stamp ? stampHtml() : ""}
      <div class="top"><div class="photo" id="photo" data-pn="${esc(c.name)}">${esc(initials(c.name))}${url ? `<img src="${esc(url)}" alt="${esc(c.name)}" onerror="this.remove()">` : ""}</div>
        <div class="meta"><div class="mute" style="font-weight:600">${esc(c.set)} · ${S.remaining} more after this</div>
          <div class="pname">${esc(c.name)}</div>
          <div class="tags"><span class="badge">${esc(c.role)}</span><span class="badge ${c.capped ? "cap" : "unc"}">${c.capped ? "Capped" : "Uncapped"}</span><span class="badge ${c.overseas ? "os" : ""}">${esc(c.country)}${c.overseas ? " · Overseas" : ""}</span></div>
          <div class="facts"><div class="fact"><b>Base price</b><span class="money">${fmt(c.basePrice)}</span></div><div class="fact"><b>Country</b>${esc(c.country)}</div><div class="fact"><b>Category</b>${esc(c.set.replace(/ (Batter|Bowler|Allrounder|Wicket Keeper)$/, ""))} ${esc(c.role)}</div>${extra}</div>
          <div class="prev">${crest(c.prevTeam, 26)}<span>Played for ${esc(prev.name)} in IPL 2026</span></div></div></div>
      ${recordsHtml(c)}
      <div class="bidpanel"><div class="ring" id="ring"><svg viewBox="0 0 112 112"><circle class="bg" cx="56" cy="56" r="46"/><circle class="fg" id="ringfg" cx="56" cy="56" r="46" stroke-dasharray="289" stroke-dashoffset="0"/></svg><div class="t" id="timer">-</div></div>
        <div class="bidinfo"><div class="lab">${inRoom ? "Current bid" : "Opening at base price"}</div><div class="amt" id="amt">${inRoom ? fmt(S.bid.amount) : fmt(c.basePrice)}</div>
          <div class="leader">${lead ? `${crest(lead.id, 34)}<span style="color:${lead.color}">${esc(lead.name)}</span>` : '<span class="mute">No bids yet</span>'}</div></div>
        <div class="bidact">${btn}</div></div>
    </div>`;
  } else hero = `<div class="card hero"><div class="top" style="grid-template-columns:1fr"><div class="pname">${S.status === "PAUSED" ? "Auction paused" : "Next player coming…"}</div></div></div>`;

  const up = S.upcoming.length ? `<div class="card"><div class="sec" style="margin-top:0">Up next</div><div class="upnext">${S.upcoming.map(p => `<div class="u">${av(p.name, p.photo)}<div><b>${esc(p.name)}</b><br><span class="mute">${esc(p.role)} · ${fmt(p.basePrice)}</span></div></div>`).join("")}</div></div>` : "";
  const mbid = me && S.phase === "BIDDING" && S.status === "LIVE" && c ? `<div class="mbid"><div><div class="l">${S.bid.teamId ? "Current bid" : "Base price"}</div><div class="a">${fmt(S.bid.teamId ? S.bid.amount : c.basePrice)}</div></div><button data-a="bid" ${S.you.bidError ? "disabled" : ""}>${S.you.bidError ? esc(S.you.bidError) : "BID " + fmt(S.nextAmount)}</button></div>` : "";
  $app.innerHTML = `${header()}${ribbon()}${banner}<div class="grid"><div class="stack">${hero}${up}</div>
    <div class="stack">${coachHtml()}<div class="card"><div class="sec" style="margin-top:0">Teams</div><div style="display:grid;gap:8px">${S.teams.map(t => teamCard(t, openTeam === t.id ? squadHtml(t) : "")).join("")}</div></div>${feedHtml()}</div></div>${mbid}`;
}

function stampHtml() {
  const s = stamp;
  return s.kind === "sold" ? `<div class="stamp sold"><div><span class="big">SOLD</span><div class="who">${crest(s.teamId, 74)}<span>${esc(tinfo(s.teamId).name)}</span><span class="money" style="font-size:34px">${fmt(s.amount)}</span></div></div></div>`
    : `<div class="stamp unsold"><div><span class="big">UNSOLD</span></div></div>`;
}

function summary() {
  const all = S.teams.flatMap(t => t.squad.map(p => ({ ...p, team: t.id }))).sort((a, b) => b.price - a.price);
  $app.innerHTML = `${header()}<div class="card"><h2>${S.endedEarly ? "Auction ended by the host" : "Auction complete"}</h2><p class="mute">${S.sold} players sold · ${S.unsold.length} unsold</p>
    <div class="row"><button data-a="compare" style="padding:12px 22px;font-size:17px">Compare all squads</button><button class="ghost" data-a="csv">Download squads (CSV)</button></div>
    <div class="sec">Most expensive buys</div>${all.slice(0, 10).map((p, i) => `<div class="pl"><span class="mute" style="width:22px">${i + 1}</span>${av(p.name, p.photo)}<span class="grow"><b>${esc(p.name)}</b> <span class="mute">${esc(p.role)}</span></span>${crest(p.team, 30)}<span class="money">${fmt(p.price)}</span></div>`).join("") || '<div class="mute">No player was sold.</div>'}</div>
    <div class="card" style="margin-top:14px"><div class="sec" style="margin-top:0">Final squads (tap a team)</div><div class="teams">${S.teams.map(t => teamCard(t, openTeam === t.id ? squadHtml(t) : "")).join("")}</div></div>
    ${S.unsold.length ? `<div class="card" style="margin-top:14px"><div class="sec" style="margin-top:0">Unsold (${S.unsold.length})</div><span class="mute">${S.unsold.map(esc).join(", ")}</span></div>` : ""}`;
}

const pill = v => `<span class="sc-pill ${v >= 7 ? "hi" : v >= 5 ? "mid" : "lo"}">${v}</span>`;
const mbar = (label, v, color) => `<div class="metric"><span>${label}</span><div class="bar"><i style="width:${Math.min(100, v * 10)}%;--c:${color}"></i></div><b>${v}</b></div>`;
function compareView() {
  const C = S.compare || [];
  const keys = { overall: t => t.overall, strength: t => t.strength, balance: t => t.scores.balance, bench: t => t.bench, weakness: t => t.weakest.score };
  const names = { overall: "Overall", strength: "Strength", balance: "Balance", bench: "Bench strength", weakness: "Weakest link" };
  const sorted = [...C].sort((a, b) => keys[sortBy](b) - keys[sortBy](a));
  const best = k => { const t = [...C].sort((a, b) => keys[k](b) - keys[k](a))[0]; return t ? `<span class="chip">${esc(names[k])}: <b>${esc(t.teamId)}</b> ${keys[k](t)}</span>` : ""; };
  const worst = [...C].sort((a, b) => a.weakest.score - b.weakest.score)[0];
  const list = (arr, cls) => `<ul class="${cls}">${arr.map(x => `<li>${esc(x)}</li>`).join("")}</ul>`;
  $app.innerHTML = `${header()}
  <div class="card"><div class="row"><h2 class="grow" style="margin:0">Squad comparison</h2><button class="ghost" data-a="results">← Back to results</button></div>
    <p class="mute" style="margin:6px 0">Every squad is scored out of 10 from its best XI (max 4 overseas, a keeper, 5+ bowling options). <b>Strength</b> = quality of batting, bowling and all-rounders. <b>Balance</b> = right mix of roles. <b>Bench strength</b> = quality of the 7 players behind the XI. <b>Weakest link</b> = the lowest area of the team.</p>
    <div class="row" style="gap:6px">${["overall", "strength", "balance", "bench"].map(best).join("")}${worst ? `<span class="chip">Biggest gap: <b>${esc(worst.teamId)}</b> ${esc(worst.weakest.area)} ${worst.weakest.score}</span>` : ""}</div>
    <div class="tabs">${Object.keys(names).map(k => `<button class="sm ${sortBy === k ? "on" : ""}" data-a="sort" data-v="${k}">${names[k]}</button>`).join("")}</div>
    <div class="lb">${sorted.map((t, i) => `<div class="lbrow" style="border-left:4px solid ${t.color}"><span class="rk">${i + 1}</span>${crest(t.teamId, 42)}<div><b>${esc(t.name)}</b><div class="mute" style="font-size:12px">${esc(t.owner || "")} · ${t.squadSize} players</div></div>
      <div class="metrics">${mbar("Strength", t.strength, t.color)}${mbar("Balance", t.scores.balance, t.color)}${mbar("Bench", t.bench, t.color)}${mbar("Weakest", t.weakest.score, t.color)}</div><span class="sc">${keys[sortBy](t)}</span></div>`).join("")}</div></div>
  <div class="cmpgrid">${C.map(t => `<div class="card" style="border-top:4px solid ${t.color}">
    <div class="row" style="flex-wrap:nowrap">${crest(t.teamId, 48)}<div class="grow"><h3 style="margin:0">#${t.rank} ${esc(t.name)}</h3><div class="mute" style="font-size:13px">${esc(t.owner || "")}</div></div><span class="bigsc">${t.overall}<small>/10</small></span></div>
    <div style="margin-top:8px">${mbar("Batting", t.scores.batting, t.color)}${mbar("Bowling", t.scores.bowling, t.color)}${mbar("All-round", t.scores.allround, t.color)}${mbar("Bench", t.bench, t.color)}${mbar("Balance", t.scores.balance, t.color)}</div>
    <div class="sec">Strongest playing XI</div>${t.xi.map((p, i) => `<div class="pl"><span class="mute" style="width:20px">${i + 1}</span>${av(p.name, p.photo)}<span class="grow">${esc(p.name)} ${p.overseas ? '<span class="badge os">OS</span>' : ""}</span><span class="mute" style="font-size:12px">${esc(p.role)}</span></div>`).join("")}
    ${t.impact ? `<div class="pl" style="margin-top:4px"><span class="badge">Impact</span>${av(t.impact.name, t.impact.photo)}<span class="grow">${esc(t.impact.name)}</span><span class="mute" style="font-size:12px">${esc(t.impact.role)}</span></div>` : ""}
    <div class="swot"><div class="sec">Strengths</div>${list(t.swot.strengths, "g")}<div class="sec">Weaknesses</div>${list(t.swot.weaknesses, "r")}<div class="sec">Opportunities</div>${list(t.swot.opportunities, "b")}<div class="sec">Threats</div>${list(t.swot.threats, "o")}</div></div>`).join("")}</div>`;
}

function modalHtml() {
  if (!modal) return "";
  if (modal === "sound") return `<div class="modal" data-a="closemodal"><div class="box"><h3>Sound and theme songs</h3>
    <div class="row"><button data-a="soundtoggle">${Announcer.enabled ? "Turn sound off" : "Turn sound on"}</button>${Announcer.voices().length ? `<select id="voice" style="flex:1">${Announcer.voices().map(v => `<option ${v.name === Announcer.voiceName ? "selected" : ""}>${esc(v.name)}</option>`).join("")}</select>` : ""}</div>
    <p class="mute" style="font-size:13px">After "Sold!", the winning team's theme song plays. Tap a team to test it. Teams without an audio file play a built-in jingle. To use real songs, add <code>public/audio/themes/CSK.mp3</code> and so on.</p>
    <div class="snd">${TEAMS.map(t => `<div>${crest(t.id, 30)}<span class="grow"><b>${t.id}</b><small>${Announcer.hasFile(t.id) ? "your song file" : "built-in jingle"}</small></span><button class="sm ghost" data-a="testtheme" data-v="${t.id}">▶</button></div>`).join("")}</div>
    <div class="acts"><button class="ghost" data-a="closemodal">Close</button></div></div></div>`;
  const round = modal === "round", cur = S.progress && S.progress.set;
  return `<div class="modal" data-a="closemodal"><div class="box"><h3>${round ? "End this round?" : "End the whole auction?"}</h3>
    <p class="mute">${round ? `The player on the block is settled (sold to the highest bidder, or unsold). The rest of <b>${esc(cur || "this set")}</b> is skipped and counted as unsold, then the next set starts.` : "The player on the block is settled, every other player stays unsold, and everyone can open the squad comparison. This cannot be undone."}</p>
    <div class="acts"><button class="ghost" data-a="closemodal">Keep going</button><button class="danger" data-a="${round ? "do-round" : "do-auction"}" style="padding:9px 16px">${round ? "End round" : "End auction"}</button></div></div></div>`;
}

function render() {
  if (!S) return home();
  const cur = S.current ? S.current.id : null;
  if (cur !== lastCur) { lastCur = cur; lastAmount = null; }
  S.status === "LOBBY" ? lobby() : S.status === "COMPLETED" ? (view === "compare" ? compareView() : summary()) : auction();
  if (modal) $app.insertAdjacentHTML("beforeend", modalHtml());
  const a = document.getElementById("amt");
  if (a && S.bid) { if (lastAmount !== null && lastAmount !== S.bid.amount) { a.classList.add("pop"); } lastAmount = S.bid.amount; }
  tick(); fillPhotos();
}

// ---------- countdown ----------
function tick() {
  const el = document.getElementById("timer"); if (!el || !S) return;
  const left = S.status === "PAUSED" ? S.pausedLeft : Math.max(0, (S.deadline || 0) - (Date.now() + offset));
  const total = S.phase === "RTM" ? 10000 : S.config.bidMs, fg = document.getElementById("ringfg"), ring = document.getElementById("ring");
  if (S.phase === "BIDDING" || S.phase === "RTM") {
    el.textContent = Math.ceil(left / 1000);
    if (fg) fg.style.strokeDashoffset = 289 * (1 - Math.min(1, left / total));
    if (ring) ring.classList.toggle("low", left < 4000);
  } else { el.textContent = S.phase === "BREAK" ? "✓" : ""; if (fg) fg.style.strokeDashoffset = 0; if (ring) ring.classList.remove("low"); }
}
setInterval(tick, 100);

// ---------- actions ----------
document.addEventListener("click", e => {
  const b = e.target.closest("[data-a]"); if (!b) return;
  if (b.classList.contains("modal") && e.target !== b) return;
  const a = b.dataset.a, v = b.dataset.v;
  const nameEl = document.getElementById("name");
  const needName = () => { myName = (nameEl?.value || myName).trim(); if (!myName) { toast("Enter your name", true); return false; } localStorage.setItem("name", myName); return true; };
  if (a === "create") { if (!needName()) return;
    fetch("/api/rooms", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ userId: uid, name: myName,
      options: { purseCr: +document.getElementById("purse").value, bidSeconds: +document.getElementById("secs").value, rtmCards: +document.getElementById("rtm").value, accelerated: document.getElementById("accel").value === "true" } }) })
      .then(r => r.json()).then(d => d.error ? toast(d.error, true) : join(d.code)); }
  else if (a === "joincode") { if (!needName()) return; const c = document.getElementById("code").value.trim(); if (c.length < 4) return toast("Enter the room code", true); join(c); }
  else if (a === "joinurl") { if (needName()) join(pathCode); }
  else if (a === "rejoin") { if (needName()) join(v); }
  else if (a === "home") { pathCode = null; history.replaceState({}, "", "/"); render(); }
  else if (a === "back") { send("leave_room"); Announcer.stop(); S = null; pathCode = null; view = "main"; modal = null; history.replaceState({}, "", "/"); render(); }
  else if (a === "copy") copy(v);
  else if (a === "claim") send("claim_team", { teamId: v });
  else if (a === "release") send("release_team", { teamId: v });
  else if (a === "start") send("start_auction");
  else if (a === "bid") send("place_bid");
  else if (a === "rtm") send("rtm_decision", { match: v === "1" });
  else if (a === "pause") send("pause");
  else if (a === "resume") send("resume");
  else if (a === "ask-round") { modal = "round"; render(); }
  else if (a === "ask-auction") { modal = "auction"; render(); }
  else if (a === "do-round") { modal = null; send("end_round"); render(); }
  else if (a === "do-auction") { modal = null; send("end_auction"); render(); }
  else if (a === "closemodal") { modal = null; render(); }
  else if (a === "sound") { modal = "sound"; render(); }
  else if (a === "soundtoggle") { Announcer.toggle(); render(); }
  else if (a === "testtheme") Announcer.test(v);
  else if (a === "toggle") { openTeam = openTeam === v ? null : v; render(); }
  else if (a === "csv") downloadCsv();
  else if (a === "compare") { view = "compare"; render(); window.scrollTo(0, 0); }
  else if (a === "results") { view = "main"; render(); window.scrollTo(0, 0); }
  else if (a === "sort") { sortBy = v; render(); }
});
document.addEventListener("change", e => { if (e.target.id === "voice") { Announcer.setVoice(e.target.value); Announcer.text("Voice changed."); } });
document.addEventListener("keydown", e => {
  if (e.key === "Escape" && modal) { modal = null; render(); return; }
  if ((e.key === "Enter") && e.target.dataset && e.target.dataset.a === "toggle") { openTeam = openTeam === e.target.dataset.v ? null : e.target.dataset.v; render(); return; }
  if (e.code === "Space" && S && S.status === "LIVE" && S.phase === "BIDDING" && S.you.teamId && !S.you.bidError && !modal && !/INPUT|BUTTON|SELECT/.test(document.activeElement.tagName)) { e.preventDefault(); send("place_bid"); }
});

function downloadCsv() {
  const rows = [["Team", "Owner", "Player", "Role", "Country", "Overseas", "Price (Cr)", "Via RTM"]];
  S.teams.forEach(t => t.squad.forEach(p => rows.push([t.name, t.ownerName, p.name, p.role, p.country, p.overseas, p.price / 100, !!p.rtm])));
  const blob = new Blob([rows.map(r => r.map(x => `"${String(x).replace(/"/g, '""')}"`).join(",")).join("\n")], { type: "text/csv" });
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `ipl-auction-${S.code}.csv`; a.click();
}

if (pathCode && myName) join(pathCode); else render();
