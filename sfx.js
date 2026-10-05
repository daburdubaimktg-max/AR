// Tiny synthesized sound effects (Web Audio) — no audio files needed.
let ctx = null;
let master = null;
let muted = false;

try { muted = localStorage.getItem("ors-ar-muted") === "1"; } catch { /* storage unavailable */ }

// Must be called from a user gesture (iOS only allows audio after one).
export function unlock() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = muted ? 0 : 0.5;
    master.connect(ctx.destination);
  }
  if (ctx.state === "suspended") ctx.resume();
}

export function isMuted() { return muted; }

export function setMuted(m) {
  muted = m;
  if (master) master.gain.value = m ? 0 : 0.5;
  try { localStorage.setItem("ors-ar-muted", m ? "1" : "0"); } catch { /* ignore */ }
}

function ready() { return ctx && !muted && ctx.state === "running"; }

function tone({ freq, to = freq, dur = 0.15, type = "sine", gain = 0.5, delay = 0, attack = 0.005 }) {
  const t = ctx.currentTime + delay;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (to !== freq) o.frequency.exponentialRampToValueAtTime(to, t + dur);
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(gain, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(master);
  o.start(t);
  o.stop(t + dur + 0.02);
}

function noise({ dur = 0.3, from = 400, to = 4000, gain = 0.3, delay = 0 }) {
  const t = ctx.currentTime + delay;
  const buf = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * dur), ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const f = ctx.createBiquadFilter();
  f.type = "bandpass";
  f.Q.value = 1.2;
  f.frequency.setValueAtTime(from, t);
  f.frequency.exponentialRampToValueAtTime(to, t + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(gain, t + dur * 0.4);
  g.gain.linearRampToValueAtTime(0, t + dur);
  src.connect(f).connect(g).connect(master);
  src.start(t);
}

// C major pentatonic, two octaves — every combination sounds nice.
const SCALE = [523.25, 587.33, 659.25, 783.99, 880, 1046.5, 1174.66, 1318.51, 1567.98, 1760];
const note = (i) => SCALE[((i % SCALE.length) + SCALE.length) % SCALE.length];

export const sfx = {
  whoosh() { if (ready()) noise({ dur: 0.6, from: 300, to: 3000, gain: 0.25 }); },
  pop(i = 0) { if (ready()) tone({ freq: note(i) * 0.5, to: note(i), dur: 0.12, type: "triangle", gain: 0.35 }); },
  bloop(i = 0) { if (ready()) tone({ freq: 220 + i * 60, to: 660 + i * 90, dur: 0.18, gain: 0.4 }); },
  chime() {
    if (!ready()) return;
    [0, 2, 4, 5].forEach((n, i) => {
      tone({ freq: note(n + 2), dur: 0.9, gain: 0.22, delay: i * 0.07 });
      tone({ freq: note(n + 2) * 2, dur: 0.5, gain: 0.06, delay: i * 0.07 });
    });
  },
  drip() {
    if (!ready()) return;
    tone({ freq: 1400, to: 380, dur: 0.14, gain: 0.35 });
    tone({ freq: 700, to: 1100, dur: 0.08, gain: 0.15, delay: 0.12 });
  },
  letter(i) {
    if (!ready()) return;
    tone({ freq: note(i), dur: 0.45, type: "triangle", gain: 0.35 });
    tone({ freq: note(i) * 2, dur: 0.25, gain: 0.08 });
  },
  boing(i = 0) { if (ready()) tone({ freq: 160 + i * 25, to: 420 + i * 40, dur: 0.22, type: "sine", gain: 0.4 }); },
  giggle() {
    if (!ready()) return;
    [0, 1, 0, 2, 1].forEach((n, i) => tone({ freq: 900 + n * 180, to: 1100 + n * 180, dur: 0.07, type: "square", gain: 0.07, delay: i * 0.075 }));
  },
  catch(combo = 0) {
    if (!ready()) return;
    tone({ freq: note(combo), to: note(combo) * 1.5, dur: 0.12, type: "triangle", gain: 0.35 });
    tone({ freq: note(combo + 2), dur: 0.18, gain: 0.15, delay: 0.05 });
  },
  bonus() {
    if (!ready()) return;
    [0, 2, 4, 7].forEach((n, i) => tone({ freq: note(n + 3), dur: 0.2, type: "triangle", gain: 0.28, delay: i * 0.05 }));
  },
  splat() { if (ready()) noise({ dur: 0.15, from: 900, to: 200, gain: 0.18 }); },
  tick() { if (ready()) tone({ freq: 1800, dur: 0.04, type: "square", gain: 0.05 }); },
  fanfare() {
    if (!ready()) return;
    [0, 2, 4, 5, 7].forEach((n, i) => tone({ freq: note(n), dur: i === 4 ? 0.9 : 0.18, type: "triangle", gain: 0.3, delay: i * 0.12 }));
    noise({ dur: 1, from: 2000, to: 8000, gain: 0.08, delay: 0.5 });
  },
  shutter() {
    if (!ready()) return;
    noise({ dur: 0.08, from: 3000, to: 1500, gain: 0.3 });
    noise({ dur: 0.06, from: 2000, to: 1200, gain: 0.25, delay: 0.09 });
  },
};
