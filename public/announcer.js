// Voice announcer (browser speech synthesis) + team win sounds. Browsers need one click before audio works.
const Announcer = (() => {
  let enabled = localStorage.getItem("sound") === "1";
  let voiceName = localStorage.getItem("voice") || "";
  let currentTheme = null;
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

  function say(text, { interrupt = false } = {}) {
    if (!enabled || !synth) return;
    if (interrupt) synth.cancel();
    const u = new SpeechSynthesisUtterance(text);
    const v = pick(); if (v) { u.voice = v; u.lang = v.lang; } else u.lang = "en-IN";
    u.rate = 1.05; u.pitch = 1;
    synth.speak(u);
  }

  // ---- team win sound: licensed file if present, otherwise an original WebAudio jingle ----
  let ctx = null;
  function jingle(teamId) {
    ctx = ctx || new (window.AudioContext || window.webkitAudioContext)();
    const seed = [...teamId].reduce((a, c) => a + c.charCodeAt(0), 0);
    const root = 196 * Math.pow(2, (seed % 7) / 12);           // team-specific key
    const pattern = [0, 4, 7, 12, 7, 12, 16, 19];                // major arpeggio fanfare
    const t0 = ctx.currentTime + 0.05;
    pattern.forEach((st, i) => {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = i % 2 ? "triangle" : "square"; o.frequency.value = root * Math.pow(2, st / 12);
      const s = t0 + i * 0.22;
      g.gain.setValueAtTime(0.0001, s); g.gain.exponentialRampToValueAtTime(0.18, s + 0.03); g.gain.exponentialRampToValueAtTime(0.0001, s + 0.3);
      o.connect(g).connect(ctx.destination); o.start(s); o.stop(s + 0.32);
    });
  }
  function theme(teamId) {
    if (!enabled) return;
    stopTheme();
    const a = new Audio(`/audio/themes/${encodeURIComponent(teamId)}.mp3`);
    a.volume = 0.8; currentTheme = a;
    a.addEventListener("error", () => { if (currentTheme === a) { currentTheme = null; try { jingle(teamId); } catch (e) {} } });
    a.play().catch(() => {});
    setTimeout(() => { if (currentTheme === a) fadeOut(a); }, 8000);
  }
  function fadeOut(a) { const f = setInterval(() => { a.volume = Math.max(0, a.volume - 0.1); if (a.volume <= 0) { clearInterval(f); a.pause(); } }, 100); }
  function stopTheme() { if (currentTheme) { currentTheme.pause(); currentTheme = null; } }

  return {
    get enabled() { return enabled; },
    voices: () => voices().filter(v => /^en/i.test(v.lang)),
    get voiceName() { return voiceName; },
    setVoice(n) { voiceName = n; localStorage.setItem("voice", n); },
    toggle() {                       // must be called from a click
      enabled = !enabled; localStorage.setItem("sound", enabled ? "1" : "0");
      if (!enabled) { synth && synth.cancel(); stopTheme(); }
      else { try { ctx = ctx || new (window.AudioContext || window.webkitAudioContext)(); ctx.resume(); } catch (e) {} say("Sound on. Welcome to the auction.", { interrupt: true }); }
      return enabled;
    },
    playerUp: p => say(`Next up, ${p.name}. ${p.role}${p.overseas ? ", overseas, " + p.country : ""}. Base price ${words(p.basePrice)}.`, { interrupt: true }),
    bid: (team, amount) => say(`${words(amount)}, ${team}`, { interrupt: true }),
    sold: (p, team) => { say(`Sold! ${p.name} to ${team}, for ${words(p.amount)}${p.rtm ? ", using the right to match" : ""}.`, { interrupt: true }); theme(p.teamId); },
    unsold: p => say(`Unsold. ${p.name} goes unsold.`, { interrupt: true }),
    rtm: team => say(`Right to match. ${team} can match the bid.`, { interrupt: true }),
    text: t => say(t),
  };
})();
if (window.speechSynthesis) window.speechSynthesis.onvoiceschanged = () => {};
