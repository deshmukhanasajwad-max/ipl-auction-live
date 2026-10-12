// Voice announcer (browser speech synthesis) + team theme songs. Browsers need one click before audio works.
// Theme songs: your own file at public/audio/themes/<TEAM>.mp3 (CSK.mp3, MI.mp3 ...). Without a file, an original jingle plays.
const Announcer = (() => {
  let enabled = localStorage.getItem("sound") === "1";
  let voiceName = localStorage.getItem("voice") || "";
  let themes = {};                      // teamId -> url, supplied by the server (files that really exist)
  let currentTheme = null, ctx = null;
  const synth = window.speechSynthesis;

  const words = lakh => {              // 1125 lakh -> "11 crore 25 lakh"
    const cr = Math.floor(lakh / 100), l = Math.round(lakh % 100);
    return [cr ? cr + " crore" : "", l ? l + " lakh" : ""].filter(Boolean).join(" ") || "0";
  };
  const voices = () => (synth ? synth.getVoices() : []);
  const pick = () => {
    const v = voices();
    return v.find(x => x.name === voiceName) || v.find(x => /en[-_]IN/i.test(x.lang)) || v.find(x => /^en/i.test(x.lang)) || null;
  };

  // say() returns a promise that resolves when the speech ends (or after a safety timeout), so a theme can start after the words.
  function say(text, { interrupt = false } = {}) {
    return new Promise(done => {
      if (!enabled || !synth) return done();
      if (interrupt) synth.cancel();
      const u = new SpeechSynthesisUtterance(text);
      const v = pick(); if (v) { u.voice = v; u.lang = v.lang; } else u.lang = "en-IN";
      u.rate = 1.05; u.pitch = 1;
      const t = setTimeout(done, 7000);
      u.onend = u.onerror = () => { clearTimeout(t); done(); };
      synth.speak(u);
    });
  }

  function audioCtx() { ctx = ctx || new (window.AudioContext || window.webkitAudioContext)(); if (ctx.state === "suspended") ctx.resume(); return ctx; }
  // original fallback fanfare, different key and tune per team
  function jingle(teamId) {
    const c = audioCtx(), seed = [...teamId].reduce((a, ch) => a + ch.charCodeAt(0), 0);
    const root = 196 * Math.pow(2, (seed % 7) / 12);
    const pattern = [[0, 4, 7, 12, 7, 12, 16, 19], [0, 7, 12, 7, 16, 12, 19, 24], [0, 3, 7, 10, 12, 10, 7, 12]][seed % 3];
    const t0 = c.currentTime + 0.05;
    pattern.forEach((st, i) => {
      const o = c.createOscillator(), g = c.createGain();
      o.type = i % 2 ? "triangle" : "square"; o.frequency.value = root * Math.pow(2, st / 12);
      const s = t0 + i * 0.22;
      g.gain.setValueAtTime(0.0001, s); g.gain.exponentialRampToValueAtTime(0.16, s + 0.03); g.gain.exponentialRampToValueAtTime(0.0001, s + 0.3);
      o.connect(g).connect(c.destination); o.start(s); o.stop(s + 0.32);
    });
  }
  function stopTheme() { if (currentTheme) { currentTheme.pause(); currentTheme = null; } }
  function fadeOut(a) { const f = setInterval(() => { a.volume = Math.max(0, a.volume - 0.1); if (a.volume <= 0.01) { clearInterval(f); a.pause(); } }, 120); }
  function theme(teamId, force) {
    if (!enabled && !force) return;
    stopTheme();
    const url = themes[teamId];
    if (!url) { try { jingle(teamId); } catch (e) {} return; }
    const a = new Audio(url); a.volume = 0.85; currentTheme = a;
    a.addEventListener("error", () => { if (currentTheme === a) { currentTheme = null; try { jingle(teamId); } catch (e) {} } });
    a.play().catch(() => { try { jingle(teamId); } catch (e) {} });
    setTimeout(() => { if (currentTheme === a) fadeOut(a); }, 4300);   // theme plays about 5 seconds, with a short fade
  }

  return {
    get enabled() { return enabled; },
    voices: () => voices().filter(v => /^en/i.test(v.lang)),
    get voiceName() { return voiceName; },
    setThemes(t) { themes = t || {}; },
    hasFile: id => !!themes[id],
    setVoice(n) { voiceName = n; localStorage.setItem("voice", n); },
    toggle() {                       // must be called from a click
      enabled = !enabled; localStorage.setItem("sound", enabled ? "1" : "0");
      if (!enabled) { synth && synth.cancel(); stopTheme(); }
      else { try { audioCtx(); } catch (e) {} say("Sound on. Welcome to the auction.", { interrupt: true }); }
      return enabled;
    },
    playerUp: p => say(`Next up, ${p.name}. ${p.role}${p.overseas ? ", overseas, " + p.country : ""}. Base price ${words(p.basePrice)}.`, { interrupt: true }),
    bid: (team, amount) => say(`${words(amount)}, ${team}`, { interrupt: true }),
    // announce the sale first, then the winning franchise's own theme song
    sold: (p, team) => say(`Sold! ${p.name} to ${team}, for ${words(p.amount)}${p.rtm ? ", using the right to match" : ""}.`, { interrupt: true }).then(() => theme(p.teamId)),
    unsold: p => say(`Unsold. ${p.name} goes unsold.`, { interrupt: true }),
    rtm: team => say(`Right to match. ${team} can match the bid.`, { interrupt: true }),
    test: teamId => theme(teamId, true),
    stop: stopTheme,
    text: t => say(t),
  };
})();
if (window.speechSynthesis) window.speechSynthesis.onvoiceschanged = () => {};
