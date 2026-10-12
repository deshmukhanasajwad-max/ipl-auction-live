// In-memory room registry with JSON-file persistence (survives restarts; live auctions come back paused).
const fs = require("fs"), path = require("path");
const crypto = require("crypto");
const { Auction } = require("./auction");

const FILE = process.env.ROOMS_FILE || path.join(__dirname, "..", "data", "rooms.json");
const TTL = 24 * 60 * 60 * 1000;
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no O/0/I/1
const rooms = new Map();
let saveTimer = null;

function makeCode() {
  let c;
  do { c = Array.from(crypto.randomBytes(6), b => ALPHABET[b % ALPHABET.length]).join(""); } while (rooms.has(c));
  return c;
}

function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      fs.mkdirSync(path.dirname(FILE), { recursive: true });
      const tmp = FILE + ".tmp";
      fs.writeFileSync(tmp, JSON.stringify([...rooms.values()]));
      fs.renameSync(tmp, FILE);
    } catch (e) { console.warn("save failed:", e.message); }
  }, 500);
}

function load(hooksFor) {
  try {
    if (!fs.existsSync(FILE)) return;
    for (const obj of JSON.parse(fs.readFileSync(FILE, "utf8"))) {
      if (Date.now() - (obj.createdAt || 0) > TTL) continue;
      rooms.set(obj.code, Auction.fromJSON(obj, hooksFor(obj.code)));
    }
    console.log(`Restored ${rooms.size} room(s)`);
  } catch (e) { console.warn("load failed:", e.message); }
}

function create({ hostId, hostName, config }, hooksFor) {
  const code = makeCode();
  const a = new Auction({ code, hostId, hostName, config }, hooksFor(code));
  rooms.set(code, a);
  save();
  return a;
}

function cleanup() {
  for (const [code, a] of rooms) {
    if (Date.now() - a.updatedAt > TTL) { a.destroy(); rooms.delete(code); }
  }
}
setInterval(cleanup, 60 * 60 * 1000).unref();

module.exports = { rooms, create, load, save };
