// ORS Ritual Coach — a selfie-camera guide that shows you where and how to
// apply your products, step by step, using on-device face tracking.
import { FaceLandmarker, FilesetResolver } from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/vision_bundle.mjs";
import { sfx, unlock } from "./sfx.js";
import { matchRoutine } from "./products.js";

const WASM_URL = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm";
const MODEL_URL = "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task";

// Face-mesh landmark indices.
const TOP_OF_FACE = [162, 21, 54, 103, 67, 109, 10, 338, 297, 332, 284, 251, 389]; // ear to ear over the forehead
const FOREHEAD = 10, CHIN = 152;
const TEMPLES = [[21, 162], [251, 389]];
const CHEEKS = [234, 454];

const $ = (id) => document.getElementById(id);
const video = $("video");
const canvas = $("canvas");
const ctx = canvas.getContext("2d");

// ---------- The plan ----------

function loadAnswers() {
  const q = new URLSearchParams(location.search);
  if (q.get("type") && q.get("concern") && q.get("style")) {
    return { type: q.get("type"), concern: q.get("concern"), style: q.get("style") };
  }
  try {
    const saved = JSON.parse(localStorage.getItem("ors-ar-routine"));
    if (saved && saved.answers) return saved.answers;
  } catch { /* ignore */ }
  return null;
}

const answers = loadAnswers();
const routine = matchRoutine(answers || { type: "coily", concern: "dryness", style: "washngo" });
const byStep = Object.fromEntries(routine.steps.map((s) => [s.id, s.product]));
const moist = byStep.moisturise;
const edge = byStep.edges;

function buildSteps() {
  const c = answers ? answers.concern : "dryness";
  const steps = [
    { zone: "palms", title: "Warm it up", secs: 10,
      text: `Rub a small amount of ORS ${moist.name} between your palms.` },
    { zone: "hairline", title: "Along your hairline", secs: 25,
      text: "Work it in along your hairline, section by section. Follow the glowing line." },
    { zone: "temples", title: "Temple massage", secs: c === "scalp" ? 40 : 25,
      text: c === "scalp"
        ? "Massage your scalp at the temples in slow circles with your fingertips. Keep it gentle."
        : "Massage your temples in small, slow circles with your fingertips." },
  ];
  if (edge) {
    steps.push({ zone: "edges", title: "Lay your edges", secs: 20,
      text: `Add a little ORS ${edge.name} and smooth your edges with a soft brush, following the arrows.` });
  }
  steps.push({ zone: "crown", title: "Crown to ends", secs: 25,
    text: c === "breakage"
      ? "Move back to your crown, then work down to your ends. Detangle gently from the ends up."
      : "Move back to your crown, then smooth it down through to your ends." });
  return steps;
}
const STEPS = buildSteps();

// ---------- Intro ----------

$("introFor").textContent = answers
  ? "Your personal ritual, matched by Hair Match:"
  : "A general moisture ritual. Take Hair Match on the scan page for one made for you:";
for (const s of routine.steps.filter((x) => x.id === "moisturise" || x.id === "edges")) {
  const li = document.createElement("li");
  const b = document.createElement("b");
  b.textContent = s.title;
  li.append(b, `ORS ${s.product.name}`);
  $("introProducts").append(li);
}

// ---------- Camera + face tracking ----------

let landmarker = null;
let face = null;        // latest landmarks
let faceSeenAt = 0;
let lastVideoTime = -1;
let dpr = 1;

async function startCamera() {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: false, video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } },
  });
  video.srcObject = stream;
  await video.play();
}

async function loadLandmarker() {
  const files = await FilesetResolver.forVisionTasks(WASM_URL);
  const opts = (delegate) => ({ baseOptions: { modelAssetPath: MODEL_URL, delegate }, runningMode: "VIDEO", numFaces: 1 });
  try { landmarker = await FaceLandmarker.createFromOptions(files, opts("GPU")); }
  catch { landmarker = await FaceLandmarker.createFromOptions(files, opts("CPU")); }
}

function resize() {
  dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.round(canvas.clientWidth * dpr);
  canvas.height = Math.round(canvas.clientHeight * dpr);
}
window.addEventListener("resize", resize);

function videoRect() {
  const vw = video.videoWidth || 1, vh = video.videoHeight || 1;
  const s = Math.max(canvas.width / vw, canvas.height / vh);
  const w = vw * s, h = vh * s;
  return { x: (canvas.width - w) / 2, y: (canvas.height - h) / 2, w, h };
}

// Landmark -> canvas px (mirrored selfie view).
function P(i) {
  const r = videoRect();
  const l = face[i];
  return { x: r.x + (1 - l.x) * r.w, y: r.y + l.y * r.h };
}

function track(now) {
  if (!landmarker || video.readyState < 2 || video.currentTime === lastVideoTime) return;
  lastVideoTime = video.currentTime;
  const res = landmarker.detectForVideo(video, now);
  const lms = res.faceLandmarks && res.faceLandmarks[0];
  if (lms) { face = lms; faceSeenAt = now; } else if (now - faceSeenAt > 500) face = null;
}

// ---------- Guide drawing ----------

function geom() {
  const top = P(FOREHEAD), chin = P(CHIN);
  const fh = Math.hypot(top.x - chin.x, top.y - chin.y);
  const up = { x: (top.x - chin.x) / fh, y: (top.y - chin.y) / fh };
  return { fh, up, top, chin };
}

// The hairline: the top of the face outline pushed up/out a little.
function hairline(g, lift = 0.1) {
  const cx = (g.top.x + g.chin.x) / 2, cy = (g.top.y + g.chin.y) / 2;
  return TOP_OF_FACE.map((i) => {
    const p = P(i);
    const ox = p.x - cx, oy = p.y - cy;
    const len = Math.hypot(ox, oy) || 1;
    return { x: p.x + (ox / len) * g.fh * lift * 0.5 + g.up.x * g.fh * lift, y: p.y + (oy / len) * g.fh * lift * 0.5 + g.up.y * g.fh * lift };
  });
}

function smoothPath(pts) {
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length - 1; i++) {
    const mx = (pts[i].x + pts[i + 1].x) / 2, my = (pts[i].y + pts[i + 1].y) / 2;
    ctx.quadraticCurveTo(pts[i].x, pts[i].y, mx, my);
  }
  const last = pts[pts.length - 1];
  ctx.lineTo(last.x, last.y);
}

function glow(color = "#ffd75e", width = 6) {
  ctx.strokeStyle = color;
  ctx.lineWidth = width * dpr;
  ctx.lineCap = "round";
  ctx.shadowColor = color;
  ctx.shadowBlur = 18 * dpr;
}

function arrowHead(x, y, angle, size) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.beginPath();
  ctx.moveTo(size, 0);
  ctx.lineTo(-size * 0.6, size * 0.6);
  ctx.lineTo(-size * 0.6, -size * 0.6);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

// Sparkles travelling along a polyline.
function sparkles(pts, t, n = 6) {
  const segs = [];
  let total = 0;
  for (let i = 1; i < pts.length; i++) {
    const d = Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
    segs.push(d);
    total += d;
  }
  ctx.fillStyle = "#fff8d6";
  for (let k = 0; k < n; k++) {
    let at = (((t * 0.25 + k / n) % 1) * total);
    let i = 0;
    while (i < segs.length - 1 && at > segs[i]) { at -= segs[i]; i++; }
    const f = segs[i] ? at / segs[i] : 0;
    const x = pts[i].x + (pts[i + 1].x - pts[i].x) * f, y = pts[i].y + (pts[i + 1].y - pts[i].y) * f;
    ctx.beginPath();
    ctx.arc(x, y, (3 + Math.sin(t * 6 + k) * 1.5) * dpr, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawGuide(zone, t) {
  if (!face || zone === "palms") return;
  const g = geom();
  ctx.save();
  if (zone === "hairline") {
    const pts = hairline(g, 0.035);
    glow();
    ctx.setLineDash([14 * dpr, 10 * dpr]);
    ctx.lineDashOffset = -t * 40 * dpr;
    smoothPath(pts);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.shadowBlur = 0;
    sparkles(pts, t, 8);
  } else if (zone === "temples") {
    for (const [a, b] of TEMPLES) {
      const pa = P(a), pb = P(b);
      const c = { x: (pa.x + pb.x) / 2, y: (pa.y + pb.y) / 2 };
      const r = g.fh * 0.085 * (1 + Math.sin(t * 4) * 0.06);
      glow();
      ctx.beginPath();
      ctx.arc(c.x, c.y, r, 0, Math.PI * 2);
      ctx.globalAlpha = 0.35;
      ctx.stroke();
      ctx.globalAlpha = 1;
      // A rotating arc with an arrow shows the circular motion.
      const start = t * 3.2;
      ctx.beginPath();
      ctx.arc(c.x, c.y, r, start, start + 4.2);
      ctx.stroke();
      ctx.fillStyle = "#ffd75e";
      const end = start + 4.2;
      arrowHead(c.x + Math.cos(end) * r, c.y + Math.sin(end) * r, end + Math.PI / 2, 9 * dpr);
    }
  } else if (zone === "edges") {
    const pts = hairline(g, 0.0);
    glow("#ffffff", 4);
    for (const side of [pts.slice(0, 5), pts.slice(-5).reverse()]) {
      smoothPath(side);
      ctx.stroke();
      // Little brush strokes sweeping from the forehead towards the temples.
      ctx.fillStyle = "#ffffff";
      for (let k = 0; k < 3; k++) {
        const f = (t * 0.6 + k / 3) % 1;
        const i = Math.min(side.length - 2, Math.floor(f * (side.length - 1)));
        const p = side[i], q = side[i + 1];
        const ang = Math.atan2(q.y - p.y, q.x - p.x);
        ctx.globalAlpha = Math.sin(f * Math.PI);
        arrowHead(p.x + (q.x - p.x) * ((f * (side.length - 1)) % 1), p.y + (q.y - p.y) * ((f * (side.length - 1)) % 1), ang, 10 * dpr);
      }
      ctx.globalAlpha = 1;
    }
  } else if (zone === "crown") {
    // Up and over the top of the head, then down the sides to the ends.
    const top = hairline(g, 0.06)[6];
    const over = { x: top.x + g.up.x * g.fh * 0.35, y: top.y + g.up.y * g.fh * 0.35 };
    glow();
    ctx.setLineDash([10 * dpr, 10 * dpr]);
    ctx.lineDashOffset = -t * 40 * dpr;
    ctx.beginPath();
    ctx.moveTo(top.x, top.y);
    ctx.lineTo(over.x, over.y);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = "#ffd75e";
    arrowHead(over.x, over.y, Math.atan2(g.up.y, g.up.x), 12 * dpr);
    ctx.shadowBlur = 0;
    ctx.font = `700 ${14 * dpr}px system-ui, sans-serif`;
    ctx.textAlign = "center";
    ctx.fillStyle = "#fff";
    ctx.fillText("crown", over.x, over.y - 16 * dpr);
    for (const i of CHEEKS) {
      const c = P(i);
      const s = { x: c.x - g.up.x * g.fh * 0.1, y: c.y - g.up.y * g.fh * 0.1 };
      const e = { x: c.x - g.up.x * g.fh * 0.9, y: c.y - g.up.y * g.fh * 0.9 };
      const outward = i === CHEEKS[0] ? 1 : -1;
      const pts = [s, { x: (s.x + e.x) / 2 + outward * g.fh * 0.12, y: (s.y + e.y) / 2 }, e];
      glow();
      ctx.setLineDash([10 * dpr, 10 * dpr]);
      smoothPath(pts);
      ctx.stroke();
      ctx.setLineDash([]);
      sparkles(pts, t, 3);
    }
  }
  ctx.restore();
}

// ---------- Coach flow ----------

let stepIdx = 0;
let remaining = 0;
let paused = false;
let running = false;
let voiceOn = true;
try { voiceOn = localStorage.getItem("ors-ritual-voice") !== "0"; } catch { /* ignore */ }

function speak(text) {
  if (!voiceOn || !("speechSynthesis" in window)) return;
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.rate = 1;
  u.pitch = 1.05;
  speechSynthesis.speak(u);
}

function syncVoiceBtn() { $("voiceBtn").textContent = voiceOn ? "🔈" : "🔇"; }

function renderDots() {
  const dots = $("dots");
  dots.replaceChildren(...STEPS.map((_, i) => {
    const s = document.createElement("span");
    if (i < stepIdx) s.className = "done";
    if (i === stepIdx) s.className = "now";
    return s;
  }));
}

function beginStep(i) {
  stepIdx = i;
  const s = STEPS[i];
  remaining = s.secs;
  paused = false;
  $("pauseBtn").textContent = "⏸ Pause";
  $("stepTitle").textContent = `Step ${i + 1} · ${s.title}`;
  $("stepText").textContent = s.text;
  const bubble = $("stepText").parentElement;
  bubble.style.animation = "none";
  void bubble.offsetWidth;
  bubble.style.animation = "";
  $("palms").hidden = s.zone !== "palms";
  renderDots();
  speak(s.text);
  sfx.chime();
  if (navigator.vibrate) navigator.vibrate([20, 40, 20]);
}

function nextStep() {
  if (stepIdx + 1 < STEPS.length) beginStep(stepIdx + 1);
  else finish();
}

// 7-day streak, kept on this device.
function recordDay() {
  const today = new Date().toISOString().slice(0, 10);
  let days = [];
  try { days = JSON.parse(localStorage.getItem("ors-ritual-days")) || []; } catch { /* ignore */ }
  if (!days.includes(today)) days.push(today);
  days = days.slice(-60);
  try { localStorage.setItem("ors-ritual-days", JSON.stringify(days)); } catch { /* ignore */ }
  let streak = 0;
  const d = new Date();
  for (;;) {
    const key = d.toISOString().slice(0, 10);
    if (!days.includes(key)) break;
    streak++;
    d.setDate(d.getDate() - 1);
  }
  return streak;
}

function finish() {
  running = false;
  $("coach").hidden = true;
  $("top").hidden = true;
  $("palms").hidden = true;
  $("faceHint").hidden = true;
  const streak = recordDay();
  const filled = ((streak - 1) % 7) + 1;
  $("stamps").replaceChildren(...Array.from({ length: 7 }, (_, i) => {
    const s = document.createElement("span");
    s.textContent = i < filled ? "🫒" : "";
    if (i < filled) { s.className = "on"; s.style.animationDelay = `${i * 0.08}s`; }
    return s;
  }));
  $("doneTitle").textContent = streak === 1 ? "Day 1, great start!" : `${streak}-day streak!`;
  $("doneText").textContent = filled === 7
    ? "A full week of care. Your hair thanks you!"
    : "Come back tomorrow to keep your streak growing.";
  $("done").hidden = false;
  sfx.fanfare();
  speak(streak === 1 ? "Ritual complete. Great start!" : `Ritual complete. ${streak} days in a row!`);
}

function startRitual() {
  $("done").hidden = true;
  $("intro").hidden = true;
  $("top").hidden = false;
  $("coach").hidden = false;
  running = true;
  beginStep(0);
}

$("pauseBtn").onclick = () => {
  paused = !paused;
  $("pauseBtn").textContent = paused ? "▶ Resume" : "⏸ Pause";
  if (paused && "speechSynthesis" in window) speechSynthesis.cancel();
};
$("nextBtn").onclick = nextStep;
$("againBtn").onclick = startRitual;
$("voiceBtn").onclick = () => {
  voiceOn = !voiceOn;
  try { localStorage.setItem("ors-ritual-voice", voiceOn ? "1" : "0"); } catch { /* ignore */ }
  syncVoiceBtn();
  if (!voiceOn && "speechSynthesis" in window) speechSynthesis.cancel();
};
syncVoiceBtn();

$("startBtn").onclick = async () => {
  unlock();
  $("startBtn").disabled = true;
  try {
    await startCamera();
  } catch (err) {
    $("startBtn").disabled = false;
    const el = $("startError");
    el.hidden = false;
    el.textContent = window.isSecureContext ? `Camera unavailable: ${err.message || err.name}` : "Camera needs HTTPS.";
    return;
  }
  resize();
  loadLandmarker().catch((err) => console.error(err));
  startRitual();
  let last = performance.now();
  const loop = (now) => {
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    track(now);
    const t = now / 1000;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (video.readyState >= 2) {
      const r = videoRect();
      ctx.save();
      ctx.translate(canvas.width, 0);
      ctx.scale(-1, 1);
      ctx.drawImage(video, canvas.width - r.x - r.w, r.y, r.w, r.h);
      ctx.restore();
    }
    if (running) {
      const s = STEPS[stepIdx];
      drawGuide(s.zone, t);
      $("faceHint").hidden = !!face || s.zone === "palms" || !landmarker;
      if (!paused) {
        remaining -= dt;
        if (remaining <= 0) nextStep();
      }
      if (running) {
        const s2 = STEPS[stepIdx];
        $("secs").textContent = Math.max(0, Math.ceil(remaining));
        $("ringArc").style.strokeDashoffset = String(119.4 * (1 - Math.max(0, remaining) / s2.secs));
      }
    }
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
};
