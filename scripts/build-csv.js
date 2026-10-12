// Writes data/players.csv from the built-in IPL 2026 squad data. Edit the CSV, then restart the server.
const fs = require("fs"), path = require("path");
const { builtInPlayers } = require("../src/data");
const rows = builtInPlayers().map(p => [p.name, p.role, p.country, p.overseas, p.capped, p.basePrice, p.rating, p.prevTeam, ""].join(","));
const out = path.join(__dirname, "..", "data", "players.csv");
fs.writeFileSync(out, ["name,role,country,overseas,capped,basePrice,rating,prevTeam,photo", ...rows].join("\n") + "\n");
console.log("wrote", out, rows.length, "players");
