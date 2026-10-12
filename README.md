# IPL Auction Live (v4)

Real-time IPL mega auction: private rooms (room code + URL), live bidding for up to 10 teams, **player photos and T20 stats for every player**, voice announcer, team win sounds, and a **Compare** screen that rates every squad out of 10.

## 1. First-time setup (photos + stats for ALL players)
```bash
npm install
npm run setup-data     # needs internet, takes a few minutes: downloads photos AND T20 stats
npm start              # http://localhost:4000
```
`setup-data` runs two scripts (you can also run them separately):
- `npm run photos`: looks up every player on Wikipedia and saves the photo into `public/photos/` (+ `data/photos.json`). Safe to re-run; it keeps files it already has.
  Players with no Wikipedia photo (many uncapped youngsters) show initials, and the script prints their names. To use your own picture, save it as `public/photos/<slug>.jpg` (the script prints each slug, e.g. `virat-kohli.jpg`) and run `npm run photos` again.
- `npm run stats`: downloads Cricsheet's open ball-by-ball data for **T20 internationals and every men's T20 league it covers** (IPL, BBL, PSL, CPL, SA20, ILT20, MLC, LPL, BPL, T20 Blast, The Hundred, Syed Mushtaq Ali, Super Smash, CSA T20 Challenge, MSL, NPL, ETPL, Major Clubs T20) into `data/cricsheet/`, then calculates for each player: T20 career, **the last 3 calendar years**, and a **league-by-league table**. Result: `data/stats.json`.
  It prints players it could not match or was unsure about; fix them in `data/name-aliases.json` like `{"Rohit Sharma": "RG Sharma"}` and run `npm run stats` again.

If you deploy online, **commit `public/photos/`, `data/photos.json` and `data/stats.json`** to GitHub so the website has them (Render's free disk is wiped on restart).

### Data credits and limits
- Stats: Cricsheet (cricsheet.org), ODC-BY licence, credit is shown on the player card. Cricsheet **withholds Afghanistan matches and the Afghanistan Premier League**, so Afghan players (Rashid Khan, Noor Ahmad, Azmatullah Omarzai, Allah Ghazanfar) have incomplete numbers. Numbers cover only matches Cricsheet has.
- Photos: Wikipedia / Wikimedia Commons images keep their own licences (many need credit). Fine for a private game with friends; if you publish the site widely, credit Wikimedia Commons.
- The photo and stats scripts were tested with simulated responses only (no internet where I built it). If a script prints errors or a wrong match, tell me what it printed.

## 2. Run and play
Open the site, create a room, share the code or `/room/CODE` link. Each person opens it, enters a name and claims a franchise. The host presses Start. Space bar = bid.
More devices: same Wi-Fi -> `http://YOUR-LAPTOP-IP:4000`; anywhere -> deploy (Render/Railway).

## 3. Auction order (16 sets, each name appears once)
All **capped** sets first (Indian, then Overseas, for each role), then **uncapped** (Overseas first, then Indian): Capped Indian/Overseas Batter, Bowler, Allrounder, Wicket Keeper, then Uncapped Overseas/Indian Batter, Bowler, Allrounder, Wicket Keeper. Empty sets are skipped. Unsold players are not re-offered unless the host chooses "accelerated round" when creating the room.
Capped = has played senior international cricket. **Capped/uncapped flags are my best knowledge, please verify** in the `capped` column of `data/players.csv`.

## 4. What the auction screen shows
Big player photo, name, set, role, capped/overseas, base price, previous team (IPL 2026), live bid + countdown, **T20 record**, **last 3 years table**, **league-by-league table**. Small photos appear next to names in Up next, every squad and the Compare screen.

## 5. Compare (end of the auction)
Results screen -> **Compare all squads**: strongest XI (max 4 overseas, a keeper, 5+ bowling options) + Impact Player, a rating out of 10 (batting 25%, bowling 30%, all-rounders 15%, bench 15%, balance 15%) and SWOT (Strengths, Weaknesses, Opportunities, Threats) + Balance score. Player strength = tier rating (`rating` column, my estimate) refined by T20 stats when loaded. A transparent model, not a prediction.

## 6. IPL rules implemented (configurable in `src/rules.js` / room settings)
Purse 120 Cr, squad 18-25, max 8 overseas, bid increments (5L to 1 Cr, 10L to 2 Cr, 20L to 5 Cr, 25L above), timer resets on each bid, a bid is refused if the team could no longer afford a minimum squad, optional Right to Match.
Not implemented: pre-auction retentions, the "raise after RTM" twist, the mini-auction overseas fee cap.

## 7. Voice and sound
Click "Enable sound" once. Browser speech voices (pick an Indian-English one) announce the next player, every bid, sold and unsold. When a team wins a player its theme plays: put licensed files in `public/audio/themes/CSK.mp3`, `MI.mp3`, ... otherwise a short original jingle plays. No celebrity voice and no copyrighted music are included.

## 8. Data files
`data/players.csv` (249 players = IPL 2026 squads after the Dec 2025 auction; base prices are estimates), `data/photos.json`, `data/stats.json`, `data/name-aliases.json` (optional). Tests: `npm test` (37 tests).

## 9. Deploy on GitHub + Render
1. Put the project on GitHub (GitHub Desktop: File -> Add local repository -> Publish repository). `render.yaml` and `.gitignore` must be at the top level of the repo.
2. On render.com: sign in with GitHub -> **New + -> Blueprint** -> pick the repo -> **Apply**. Render reads `render.yaml` (free plan, `npm install`, `npm start`, Node 22, health check `/health`) and gives you an `https://ipl-auction-live.onrender.com` link.
3. Every push to GitHub redeploys automatically.
Free plan: sleeps after 15 minutes idle (open the link a few minutes before the event) and saved rooms are lost on restart.

## Structure
`index.js` · `src/` rules, engine, compare, data, store · `scripts/` build-photos, build-stats, build-csv · `public/` client + photos · `test/`
