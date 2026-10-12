// Player pool = every player in the 10 IPL 2026 squads (as announced after the Dec 2025 mini auction,
// source: Wisden squad list). In a simulated mega auction each player's "previous team" is his IPL 2026 franchise.
// Role codes: B batter, W wicketkeeper, A all-rounder, O bowler.  "|CODE" after the role = overseas country.
// Base prices are ESTIMATES (tiered) because a mega-auction pool is not official; edit data/players.csv freely.
const TEAMS = [
  { id: "CSK", name: "Chennai Super Kings", color: "#f5c518" },
  { id: "DC", name: "Delhi Capitals", color: "#3b82c4" },
  { id: "GT", name: "Gujarat Titans", color: "#6c8cff" },
  { id: "KKR", name: "Kolkata Knight Riders", color: "#9b59d0" },
  { id: "LSG", name: "Lucknow Super Giants", color: "#2bc4d6" },
  { id: "MI", name: "Mumbai Indians", color: "#2d7be5" },
  { id: "PBKS", name: "Punjab Kings", color: "#e8434a" },
  { id: "RR", name: "Rajasthan Royals", color: "#ee4fa0" },
  { id: "RCB", name: "Royal Challengers Bengaluru", color: "#d9232d" },
  { id: "SRH", name: "Sunrisers Hyderabad", color: "#ff7a00" },
];

const COUNTRY = { AUS: "Australia", ENG: "England", SA: "South Africa", NZ: "New Zealand", WI: "West Indies", AFG: "Afghanistan", SL: "Sri Lanka", BAN: "Bangladesh" };

const SQUADS = `
CSK: MS Dhoni W; Sanju Samson W; Ruturaj Gaikwad B; Ayush Mhatre B; Dewald Brevis B|SA; Urvil Patel W; Kartik Sharma W; Matthew Short B|AUS; Sarfaraz Khan B; Anshul Kamboj O; Gurjapneet Singh O; Mukesh Choudhary O; Nathan Ellis O|AUS; Noor Ahmad O|AFG; Khaleel Ahmed O; Matt Henry O|NZ; Rahul Chahar O; Zak Foulkes O|NZ; Jamie Overton A|ENG; Ramakrishna Ghosh A; Shivam Dube A; Shreyas Gopal A; Akeal Hosein A|WI; Prashant Veer A; Aman Khan A
DC: Abishek Porel W; Ashutosh Sharma B; Karun Nair B; KL Rahul W; Nitish Rana B; Sameer Rizvi B; Tristan Stubbs B|SA; David Miller B|SA; Ben Duckett B|ENG; Pathum Nissanka B|SL; Sahil Parakh B; Prithvi Shaw B; Dushmantha Chameera O|SL; Kuldeep Yadav O; Mitchell Starc O|AUS; Mukesh Kumar O; T Natarajan O; Tripurana Vijay O; Auqib Nabi O; Kyle Jamieson O|NZ; Ajay Mandal A; Axar Patel A; Madhav Tiwari A; Vipraj Nigam A
GT: Anuj Rawat W; Jos Buttler W|ENG; Kumar Kushagra W; Sai Sudharsan B; Shubman Gill B; Tom Banton B|ENG; Gurnoor Brar O; Ishant Sharma O; Kagiso Rabada O|SA; Mohammed Siraj O; Arshad Khan O; Prasidh Krishna O; Sai Kishore O; Rashid Khan O|AFG; Ashok Sharma O; Prithvi Raj Yarra O; Luke Wood O|ENG; Glenn Phillips A|NZ; Jayant Yadav A; Manav Suthar A; Nishant Sindhu A; Rahul Tewatia A; Shahrukh Khan A; Washington Sundar A; Jason Holder A|WI
KKR: Ajinkya Rahane B; Angkrish Raghuvanshi B; Manish Pandey B; Rinku Singh B; Rovman Powell B|WI; Finn Allen B|NZ; Tejasvi Singh B; Rahul Tripathi B; Tim Seifert W|NZ; Harshit Rana O; Umran Malik O; Vaibhav Arora O; Varun Chakaravarthy O; Matheesha Pathirana O|SL; Kartik Tyagi O; Prashant Solanki O; Mustafizur Rahman O|BAN; Akash Deep O; Anukul Roy A; Ramandeep Singh A; Sunil Narine A|WI; Cameron Green A|AUS; Sarthak Ranjan A; Daksh Kamra A; Rachin Ravindra A|NZ
LSG: Abdul Samad B; Himmat Singh B; Matthew Breetzke B|SA; Nicholas Pooran W|WI; Rishabh Pant W; Mukul Choudhary W; Akshat Raghuwanshi B; Josh Inglis W|AUS; Akash Singh O; Arjun Tendulkar O; Avesh Khan O; Digvesh Rathi O; Mamimaran Siddharth O; Mayank Yadav O; Mohammed Shami O; Mohsin Khan O; Prince Yadav O; Anrich Nortje O|SA; Naman Tiwari O; Aiden Markram A|SA; Arshin Kulkarni A; Ayush Badoni A; Mitchell Marsh A|AUS; Shahbaz Ahmed A; Wanindu Hasaranga A|SL
MI: Robin Minz W; Rohit Sharma B; Ryan Rickelton W|SA; Sherfane Rutherford B|WI; Suryakumar Yadav B; Tilak Varma B; Quinton de Kock W|SA; Danish Malewar B; Allah Ghazanfar O|AFG; Ashwani Kumar O; Deepak Chahar O; Jasprit Bumrah O; Mayank Markande O; Raghu Sharma O; Shardul Thakur O; Trent Boult O|NZ; Mohammad Izhar O; Corbin Bosch A|SA; Hardik Pandya A; Mitchell Santner A|NZ; Naman Dhir A; Raj Angad Bawa A; Will Jacks A|ENG; Atharva Ankolekar A; Mayank Rawat A
PBKS: Harnoor Singh Pannu B; Nehal Wadhera B; Prabhsimran Singh W; Priyansh Arya B; Pyla Avinash B; Shashank Singh B; Shreyas Iyer B; Vishnu Vinod W; Arshdeep Singh O; Lockie Ferguson O|NZ; Vyshak Vijaykumar O; Xavier Bartlett O|AUS; Yash Thakur O; Yuzvendra Chahal O; Ben Dwarshuis O|AUS; Azmatullah Omarzai A|AFG; Harpreet Brar A; Marco Jansen A|SA; Marcus Stoinis A|AUS; Mitchell Owen A|AUS; Musheer Khan A; Suryansh Shedge A; Cooper Connolly A|AUS; Pravin Dubey A; Vishal Nishad A
RR: Dhruv Jurel W; Lhuan-dre Pretorius W|SA; Shimron Hetmyer B|WI; Shubham Dubey B; Vaibhav Suryavanshi B; Yashasvi Jaiswal B; Ravi Singh W; Aman Rao B; Jofra Archer O|ENG; Kwena Maphaka O|SA; Nandre Burger O|SA; Sandeep Sharma O; Tushar Deshpande O; Yudhvir Singh Charak O; Ravi Bishnoi O; Sushant Mishra O; Yash Raj Punja O; Vignesh Puthur O; Brijesh Sharma O; Adam Milne O|NZ; Kuldeep Sen O; Donovan Ferreira A|SA; Ravindra Jadeja A; Riyan Parag A; Sam Curran A|ENG
RCB: Devdutt Padikkal B; Jitesh Sharma W; Phil Salt W|ENG; Rajat Patidar B; Tim David B|AUS; Virat Kohli B; Jordan Cox W|ENG; Vihaan Malhotra B; Abhinandan Singh O; Bhuvneshwar Kumar O; Josh Hazlewood O|AUS; Nuwan Thushara O|SL; Rasikh Dar O; Suyash Sharma O; Yash Dayal O; Jacob Duffy O|NZ; Vicky Ostwal O; Jacob Bethell A|ENG; Krunal Pandya A; Romario Shepherd A|WI; Swapnil Singh A; Venkatesh Iyer A; Satvik Deswal A; Mangesh Yadav A; Kanishk Chouhan A
SRH: Aniket Verma B; Heinrich Klaasen W|SA; Ishan Kishan W; Smaran Ravichandran B; Travis Head B|AUS; Salil Arora W; Brydon Carse O|ENG; Eshan Malinga O|SL; Harshal Patel O; Jaydev Unadkat O; Pat Cummins O|AUS; Zeeshan Ansari O; Sakib Hassan O; Onkar Tarmale O; Amit Kumar O; Praful Hinge O; Abhishek Sharma A; Harsh Dubey A; Kamindu Mendis A|SL; Nitish Kumar Reddy A; Shivang Kumar A; Krains Fuletra A; Liam Livingstone A|ENG; Shivam Mavi A; Jack Edwards A|AUS
`;

const MARQUEE = ["Virat Kohli", "Rohit Sharma", "Jasprit Bumrah", "Shubman Gill", "Suryakumar Yadav", "Rishabh Pant", "Shreyas Iyer", "KL Rahul", "Jos Buttler", "Rashid Khan", "Hardik Pandya", "Yashasvi Jaiswal"];

const T200 = new Set([...MARQUEE, "Sanju Samson", "Ravindra Jadeja", "Travis Head", "Pat Cummins", "Heinrich Klaasen", "Mitchell Starc", "Josh Hazlewood", "Kagiso Rabada", "Trent Boult", "Jofra Archer", "Nicholas Pooran", "Phil Salt", "Cameron Green", "Sunil Narine", "Yuzvendra Chahal", "Kuldeep Yadav", "Mohammed Siraj", "Mohammed Shami", "Axar Patel", "Marco Jansen", "Marcus Stoinis", "Liam Livingstone", "Sam Curran", "Mitchell Marsh", "David Miller", "Quinton de Kock", "Wanindu Hasaranga", "Noor Ahmad", "Varun Chakaravarthy", "Ishan Kishan", "Abhishek Sharma", "Bhuvneshwar Kumar", "Arshdeep Singh", "Washington Sundar", "Tilak Varma", "Sai Sudharsan", "Ruturaj Gaikwad"]);
const T150 = new Set(["Devdutt Padikkal", "Shivam Dube", "T Natarajan", "Anrich Nortje", "Ryan Rickelton", "Will Jacks", "Glenn Phillips", "Ben Duckett", "Tim David", "Jacob Bethell", "Romario Shepherd", "Rinku Singh", "Harshit Rana", "Prasidh Krishna", "Khaleel Ahmed", "Deepak Chahar", "Harshal Patel", "Avesh Khan", "Tristan Stubbs", "Dhruv Jurel", "Nitish Kumar Reddy", "Karun Nair", "Rajat Patidar", "Jitesh Sharma", "Venkatesh Iyer", "Krunal Pandya", "Riyan Parag", "Ravi Bishnoi", "Mitchell Santner", "Shimron Hetmyer", "Rovman Powell", "Aiden Markram", "Matthew Breetzke", "Josh Inglis", "Dewald Brevis", "Jason Holder", "Nathan Ellis", "Lockie Ferguson", "Matheesha Pathirana", "Adam Milne", "Matt Henry", "Mustafizur Rahman", "Kyle Jamieson", "Dushmantha Chameera", "Mohsin Khan", "Mayank Yadav", "Sandeep Sharma", "Ishant Sharma", "Rahul Tewatia", "Shahrukh Khan", "Mukesh Kumar", "Umran Malik", "Vaibhav Arora", "Nitish Rana", "Sameer Rizvi", "Ashutosh Sharma", "Priyansh Arya", "Prabhsimran Singh", "Shashank Singh", "Ayush Badoni", "Abdul Samad", "Shardul Thakur", "Ajinkya Rahane", "Matthew Short", "Jamie Overton", "Rachin Ravindra"]);
const U30 = new Set(["Ayush Mhatre", "Urvil Patel", "Kartik Sharma", "Prashant Veer", "Ramakrishna Ghosh", "Aman Khan", "Vaibhav Suryavanshi", "Aniket Verma", "Smaran Ravichandran", "Salil Arora", "Vipraj Nigam", "Ajay Mandal", "Madhav Tiwari", "Tripurana Vijay", "Auqib Nabi", "Sahil Parakh", "Kumar Kushagra", "Nishant Sindhu", "Manav Suthar", "Arshad Khan", "Ashok Sharma", "Prithvi Raj Yarra", "Gurnoor Brar", "Anukul Roy", "Tejasvi Singh", "Sarthak Ranjan", "Daksh Kamra", "Kartik Tyagi", "Prashant Solanki", "Mukul Choudhary", "Akshat Raghuwanshi", "Himmat Singh", "Digvesh Rathi", "Mamimaran Siddharth", "Prince Yadav", "Naman Tiwari", "Akash Singh", "Arjun Tendulkar", "Arshin Kulkarni", "Robin Minz", "Danish Malewar", "Ashwani Kumar", "Raghu Sharma", "Mohammad Izhar", "Raj Angad Bawa", "Atharva Ankolekar", "Mayank Rawat", "Harnoor Singh Pannu", "Pyla Avinash", "Vishnu Vinod", "Vyshak Vijaykumar", "Yash Thakur", "Harpreet Brar", "Musheer Khan", "Suryansh Shedge", "Pravin Dubey", "Vishal Nishad", "Shubham Dubey", "Ravi Singh", "Aman Rao", "Yudhvir Singh Charak", "Sushant Mishra", "Yash Raj Punja", "Vignesh Puthur", "Brijesh Sharma", "Kuldeep Sen", "Vihaan Malhotra", "Abhinandan Singh", "Rasikh Dar", "Suyash Sharma", "Yash Dayal", "Vicky Ostwal", "Swapnil Singh", "Satvik Deswal", "Mangesh Yadav", "Kanishk Chouhan", "Zeeshan Ansari", "Sakib Hassan", "Onkar Tarmale", "Amit Kumar", "Praful Hinge", "Harsh Dubey", "Shivang Kumar", "Krains Fuletra", "Shivam Mavi", "Zak Foulkes", "Cooper Connolly", "Mitchell Owen", "Ben Dwarshuis", "Xavier Bartlett"]);


// ---- capped / uncapped classification (best knowledge; VERIFY and edit data/players.csv, column "capped") ----
// Capped = has played senior international cricket for his country. Most overseas stars are capped.
const UNCAPPED_OVERSEAS = new Set(["Zak Foulkes", "Jack Edwards", "Eshan Malinga"]);
const EXTRA_UNCAPPED_IN = ["Sandeep Sharma", "Ashutosh Sharma", "Sameer Rizvi", "Priyansh Arya", "Prabhsimran Singh", "Nehal Wadhera", "Shashank Singh", "Abdul Samad", "Ayush Badoni", "Anuj Rawat", "Rahul Tewatia", "Shahrukh Khan", "Mohsin Khan", "Abishek Porel", "Naman Dhir", "Vaibhav Arora"];
const HAVE_INDIA_CAPS = new Set(["Kuldeep Sen", "Shivam Mavi"]);          // sit in the young-player list but are capped
const UNCAPPED_IN = new Set([...U30, ...EXTRA_UNCAPPED_IN].filter(n => !HAVE_INDIA_CAPS.has(n)));
const isCapped = (name, overseas) => overseas ? !UNCAPPED_OVERSEAS.has(name) : !UNCAPPED_IN.has(name);

const ROLE_NAME = { B: "Batter", W: "Wicketkeeper", A: "All-rounder", O: "Bowler" };
const SET_LABEL = { Batter: "Batter", Bowler: "Bowler", "All-rounder": "Allrounder", Wicketkeeper: "Wicket Keeper" };

// Auction order: ALL capped sets first (Indian then Overseas for each role), then uncapped (Overseas first, then Indian).
const SET_ORDER = (() => {
  const roles = ["Batter", "Bowler", "Allrounder", "Wicket Keeper"], out = [];
  for (const r of roles) out.push(`Capped Indian ${r}`, `Capped Overseas ${r}`);
  for (const r of roles) out.push(`Uncapped Overseas ${r}`, `Uncapped Indian ${r}`);
  return out;
})();
const setFor = p => `${p.capped ? "Capped" : "Uncapped"} ${p.overseas ? "Overseas" : "Indian"} ${SET_LABEL[p.role]}`;

function baseFor(name, overseas, capped) {
  let b;
  if (T200.has(name)) b = 200;
  else if (T150.has(name)) b = 150;
  else if (!capped) b = overseas ? 50 : 30;
  else b = overseas ? 100 : 75;
  return capped ? b : Math.min(b, 100);           // lakh
}
// Quality rating 0-100 used only by the Compare feature (tiered estimate; stats refine it when available)
function ratingFor(name, capped, overseas) {
  if (MARQUEE.includes(name)) return 88;
  if (T200.has(name)) return 84;
  if (T150.has(name)) return 75;
  return !capped ? 56 : overseas ? 66 : 62;
}

function builtInPlayers() {
  const out = [], seen = new Set();
  for (const line of SQUADS.trim().split("\n")) {
    const [team, rest] = line.split(": ");
    for (const raw of rest.split(";")) {
      const m = raw.trim().match(/^(.*) ([BWAO])(?:\|(\w+))?$/);
      if (!m) throw new Error("Bad squad entry: " + raw);
      const [, name, r, cc] = m;
      if (seen.has(name.toLowerCase())) throw new Error("Duplicate player: " + name);
      seen.add(name.toLowerCase());
      const overseas = !!cc, capped = isCapped(name, overseas);
      out.push({ name, role: ROLE_NAME[r], country: overseas ? COUNTRY[cc] : "India", overseas, capped,
        basePrice: baseFor(name, overseas, capped), rating: ratingFor(name, capped, overseas), prevTeam: team, photo: "" });
    }
  }
  return out;
}

// Optional override: data/players.csv (name,role,country,overseas,capped,basePrice,rating,prevTeam,photo + any extra columns)
function loadPhotos(file) {
  try { const fs = require("fs"); return file && fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : {}; }
  catch (e) { console.warn("photos.json ignored:", e.message); return {}; }
}

function loadPlayers(csvPath, photosPath) {
  const photos = loadPhotos(photosPath);
  let list = builtInPlayers();
  try {
    const fs = require("fs");
    if (csvPath && fs.existsSync(csvPath)) {
      const [head, ...rows] = fs.readFileSync(csvPath, "utf8").split(/\r?\n/).filter(Boolean);
      const cols = head.split(",").map(c => c.trim());
      const known = ["name", "role", "country", "overseas", "capped", "basePrice", "rating", "prevTeam", "photo"];
      list = rows.map(r => {
        const v = r.split(","), o = { extra: {} };
        cols.forEach((c, i) => { const val = (v[i] || "").trim(); if (known.includes(c)) o[c] = val; else if (c !== "set" && val) o.extra[c] = val; });
        o.overseas = /^(true|1|yes)$/i.test(o.overseas);
        o.capped = !/^(false|0|no)$/i.test(o.capped || "true");
        o.basePrice = Number(o.basePrice) || 30;
        o.rating = Number(o.rating) || 60;
        return o;
      });
    }
  } catch (e) { console.warn("players.csv ignored:", e.message); }
  const seen = new Set();
  list = list.filter(p => { const k = p.name.toLowerCase(); if (seen.has(k)) { console.warn("Duplicate name skipped:", p.name); return false; } seen.add(k); return true; });  // each player only once
  list.forEach(p => { p.extra = p.extra || {}; p.photo = p.photo || photos[p.name] || ""; p.set = setFor(p); });   // photo: CSV column, else data/photos.json (npm run photos)
  list.sort((a, b) => (SET_ORDER.indexOf(a.set) - SET_ORDER.indexOf(b.set)) || (b.basePrice - a.basePrice) || a.name.localeCompare(b.name));
  return list.map((p, i) => ({ id: i + 1, status: "upcoming", ...p }));
}

// Optional stats built by scripts/build-stats.js: { "Player Name": { t20: {...}, years: { "2024": {...} } } }
function loadStats(file) {
  try { const fs = require("fs"); return file && fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : {}; }
  catch (e) { console.warn("stats.json ignored:", e.message); return {}; }
}

module.exports = { TEAMS, SET_ORDER, loadPlayers, loadStats, loadPhotos, builtInPlayers };
