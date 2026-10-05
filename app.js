// AR Stickers — camera + face-tracked stickers, runs fully in the browser.
import { FaceLandmarker, FilesetResolver } from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/vision_bundle.mjs";

const WASM_URL = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm";
const MODEL_URL = "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task";

// Face landmark indices (MediaPipe 468-point mesh).
const LM_BRIDGE = 168;     // between the eyes
const LM_EYE_A = 33;       // outer corner, one eye
const LM_EYE_B = 263;      // outer corner, other eye

// Built-in stickers. `at` is a face-local placement: x/y in units of eye
// distance from the nose bridge (y down), s = size in eye distances.
const PRESETS = [
  { emoji: "👑", at: { x: 0, y: -1.45, s: 1.3 } },
  { emoji: "🕶️", at: { x: 0, y: 0.05, s: 1.35 } },
  { emoji: "🐶", at: { x: 0, y: 0.75, s: 0.6 } },
  { emoji: "🔴", at: { x: 0, y: 0.62, s: 0.3 } },
  { emoji: "💖", at: { x: 0.62, y: 0.75, s: 0.3 } },
  { emoji: "✨", at: { x: -0.65, y: -0.7, s: 0.35 } },
  { emoji: "🌸", at: { x: 0.6, y: -1.15, s: 0.5 } },
  { emoji: "🦋", at: { x: -0.6, y: -1.15, s: 0.5 } },
  { emoji: "🔥", at: { x: 0, y: -1.3, s: 0.8 } },
  { emoji: "😺", at: { x: 0, y: -1.2, s: 0.8 } },
  { emoji: "⭐", at: { x: 0.7, y: 0.6, s: 0.3 } },
  { emoji: "🎉", at: { x: 0, y: -1.3, s: 0.9 } },
  { emoji: "🌈", at: { x: 0, y: -1.5, s: 1.2 } },
  { emoji: "💬", at: { x: 1.3, y: -0.9, s: 0.9 } },
  { emoji: "🍕", at: { x: 0, y: 1.6, s: 0.6 } },
  { emoji: "🐻", at: { x: 0, y: -1.3, s: 1.0 } },
];

const $ = (id) => document.getElementById(id);
const video = $("video");
const canvas = $("canvas");
const ctx = canvas.getContext("2d");

const state = {
  stream: null,
  facingMode: "user",
  landmarker: null,
  face: null,            // smoothed face frame {ox, oy, angle, unit} in canvas px
  faceSeenAt: 0,
  faceLock: true,
  stickers: [],          // {img, x, y, size, rot, anchor|null}
  selected: null,
  pointers: new Map(),
  gesture: null,
  lastVideoTime: -1,
  dpr: 1,
};

// ---------- Sticker images ----------

function emojiImage(emoji) {
  const c = document.createElement("canvas");
  c.width = c.height = 256;
  const g = c.getContext("2d");
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.font = '210px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';
  g.fillText(emoji, 128, 140);
  return c;
}

function buildTray() {
  const tray = $("tray");
  for (const p of PRESETS) {
    const b = document.createElement("button");
    b.className = "sticker-btn";
    b.textContent = p.emoji;
    b.setAttribute("aria-label", `Add ${p.emoji} sticker`);
    const img = emojiImage(p.emoji);
    b.addEventListener("click", () => addSticker(img, p.at));
    tray.appendChild(b);
  }
}

function addTrayImage(img) {
  const b = document.createElement("button");
  b.className = "sticker-btn";
  const thumb = new Image();
  thumb.src = img.src;
  b.appendChild(thumb);
  b.addEventListener("click", () => addSticker(img, { x: 0, y: -1.2, s: 0.9 }));
  $("tray").prepend(b);
}

// ---------- Camera ----------

async function startCamera() {
  if (state.stream) state.stream.getTracks().forEach((t) => t.stop());
  state.stream = await navigator.mediaDevices.getUserMedia({
    audio: false,
    video: { facingMode: state.facingMode, width: { ideal: 1280 }, height: { ideal: 720 } },
  });
  video.srcObject = state.stream;
  await video.play();
  state.face = null;
}

function mirrored() {
  return state.facingMode === "user";
}

function resize() {
  state.dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.round(canvas.clientWidth * state.dpr);
  canvas.height = Math.round(canvas.clientHeight * state.dpr);
}

// Where the video is drawn on the canvas ("object-fit: cover").
function videoRect() {
  const vw = video.videoWidth || 1, vh = video.videoHeight || 1;
  const scale = Math.max(canvas.width / vw, canvas.height / vh);
  const w = vw * scale, h = vh * scale;
  return { x: (canvas.width - w) / 2, y: (canvas.height - h) / 2, w, h };
}

function toCanvas(lm, r) {
  const nx = mirrored() ? 1 - lm.x : lm.x;
  return { x: r.x + nx * r.w, y: r.y + lm.y * r.h };
}

// ---------- Face tracking ----------

async function loadLandmarker() {
  try {
    const files = await FilesetResolver.forVisionTasks(WASM_URL);
    const opts = (delegate) => ({
      baseOptions: { modelAssetPath: MODEL_URL, delegate },
      runningMode: "VIDEO",
      numFaces: 1,
    });
    try {
      state.landmarker = await FaceLandmarker.createFromOptions(files, opts("GPU"));
    } catch {
      state.landmarker = await FaceLandmarker.createFromOptions(files, opts("CPU"));
    }
    setStatus("Looking for a face…");
  } catch (err) {
    console.error(err);
    setStatus("Face tracking unavailable — free placement only");
  }
}

function trackFace(now) {
  if (!state.landmarker || video.readyState < 2) return;
  if (video.currentTime === state.lastVideoTime) return;
  state.lastVideoTime = video.currentTime;

  const res = state.landmarker.detectForVideo(video, now);
  const lms = res.faceLandmarks && res.faceLandmarks[0];
  if (!lms) {
    if (state.face && now - state.faceSeenAt > 400) {
      state.face = null;
      setStatus("Looking for a face…");
    }
    return;
  }

  const r = videoRect();
  const o = toCanvas(lms[LM_BRIDGE], r);
  let a = toCanvas(lms[LM_EYE_A], r), b = toCanvas(lms[LM_EYE_B], r);
  if (a.x > b.x) [a, b] = [b, a]; // always screen-left → screen-right
  const target = {
    ox: o.x, oy: o.y,
    angle: Math.atan2(b.y - a.y, b.x - a.x),
    unit: Math.hypot(b.x - a.x, b.y - a.y),
  };

  if (!state.face) {
    state.face = target;
    setStatus("Face found — tap a sticker");
  } else {
    // Light smoothing to kill jitter while staying responsive.
    const k = 0.55, f = state.face;
    f.ox += (target.ox - f.ox) * k;
    f.oy += (target.oy - f.oy) * k;
    f.unit += (target.unit - f.unit) * k;
    let da = target.angle - f.angle;
    da = Math.atan2(Math.sin(da), Math.cos(da));
    f.angle += da * k;
  }
  state.faceSeenAt = now;
}

// Convert between screen pose and face-local anchor.
function screenToAnchor(s, f) {
  const dx = s.x - f.ox, dy = s.y - f.oy;
  const c = Math.cos(-f.angle), n = Math.sin(-f.angle);
  return {
    x: (dx * c - dy * n) / f.unit,
    y: (dx * n + dy * c) / f.unit,
    s: s.size / f.unit,
    r: s.rot - f.angle,
  };
}

function applyAnchor(s, f) {
  const a = s.anchor;
  const c = Math.cos(f.angle), n = Math.sin(f.angle);
  s.x = f.ox + (a.x * c - a.y * n) * f.unit;
  s.y = f.oy + (a.x * n + a.y * c) * f.unit;
  s.size = a.s * f.unit;
  s.rot = a.r + f.angle;
}

// ---------- Stickers ----------

function addSticker(img, at) {
  const f = state.face;
  const s = { img, x: 0, y: 0, size: 0, rot: 0, anchor: null };
  if (f && state.faceLock) {
    s.anchor = { x: at.x, y: at.y, s: at.s, r: 0 };
    applyAnchor(s, f);
  } else {
    // Free placement: drop near the centre with a little scatter.
    const m = Math.min(canvas.width, canvas.height);
    s.x = canvas.width / 2 + (Math.random() - 0.5) * m * 0.3;
    s.y = canvas.height / 2 + (Math.random() - 0.5) * m * 0.3;
    s.size = m * 0.28;
  }
  state.stickers.push(s);
  select(s);
}

function select(s) {
  state.selected = s;
  $("selectionBar").hidden = !s;
  if (s) $("anchorBtn").textContent = s.anchor ? "Unlock from face" : "Lock to face";
}

function hitTest(px, py) {
  for (let i = state.stickers.length - 1; i >= 0; i--) {
    const s = state.stickers[i];
    if (s.anchor && !state.face) continue;
    const dx = px - s.x, dy = py - s.y;
    const c = Math.cos(-s.rot), n = Math.sin(-s.rot);
    const lx = dx * c - dy * n, ly = dx * n + dy * c;
    const half = s.size / 2 + 12 * state.dpr;
    if (Math.abs(lx) <= half && Math.abs(ly) <= half) return s;
  }
  return null;
}

function drawSticker(s, g = ctx) {
  const iw = s.img.naturalWidth || s.img.width;
  const ih = s.img.naturalHeight || s.img.height;
  const k = s.size / Math.max(iw, ih);
  g.save();
  g.translate(s.x, s.y);
  g.rotate(s.rot);
  g.drawImage(s.img, (-iw * k) / 2, (-ih * k) / 2, iw * k, ih * k);
  g.restore();
}

// ---------- Gestures: drag, pinch-zoom, twist ----------

function canvasPoint(e) {
  const rect = canvas.getBoundingClientRect();
  return { x: (e.clientX - rect.left) * state.dpr, y: (e.clientY - rect.top) * state.dpr };
}

function beginGesture() {
  const s = state.selected;
  const pts = [...state.pointers.values()];
  if (!s || pts.length === 0) { state.gesture = null; return; }
  if (pts.length === 1) {
    state.gesture = { type: "drag", start: pts[0], x: s.x, y: s.y };
  } else {
    const [p, q] = pts;
    state.gesture = {
      type: "pinch",
      dist: Math.hypot(q.x - p.x, q.y - p.y),
      ang: Math.atan2(q.y - p.y, q.x - p.x),
      mid: { x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 },
      x: s.x, y: s.y, size: s.size, rot: s.rot,
    };
  }
}

function updateGesture() {
  const g = state.gesture, s = state.selected;
  if (!g || !s) return;
  const pts = [...state.pointers.values()];
  if (g.type === "drag" && pts.length >= 1) {
    s.x = g.x + pts[0].x - g.start.x;
    s.y = g.y + pts[0].y - g.start.y;
  } else if (g.type === "pinch" && pts.length >= 2) {
    const [p, q] = pts;
    const mid = { x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 };
    s.size = Math.max(20, g.size * (Math.hypot(q.x - p.x, q.y - p.y) / g.dist));
    s.rot = g.rot + Math.atan2(q.y - p.y, q.x - p.x) - g.ang;
    s.x = g.x + mid.x - g.mid.x;
    s.y = g.y + mid.y - g.mid.y;
  }
  if (s.anchor && state.face) s.anchor = screenToAnchor(s, state.face);
}

canvas.addEventListener("pointerdown", (e) => {
  canvas.setPointerCapture(e.pointerId);
  const p = canvasPoint(e);
  state.pointers.set(e.pointerId, p);
  if (state.pointers.size === 1) {
    const hit = hitTest(p.x, p.y);
    select(hit);
    if (hit) { // bring to front while interacting
      state.stickers.splice(state.stickers.indexOf(hit), 1);
      state.stickers.push(hit);
    }
  }
  beginGesture();
});
canvas.addEventListener("pointermove", (e) => {
  if (!state.pointers.has(e.pointerId)) return;
  state.pointers.set(e.pointerId, canvasPoint(e));
  updateGesture();
});
const endPointer = (e) => {
  state.pointers.delete(e.pointerId);
  beginGesture();
};
canvas.addEventListener("pointerup", endPointer);
canvas.addEventListener("pointercancel", endPointer);

// Desktop: wheel to resize, shift+wheel to rotate.
canvas.addEventListener("wheel", (e) => {
  const s = state.selected;
  if (!s) return;
  e.preventDefault();
  if (e.shiftKey) s.rot += e.deltaY * 0.005;
  else s.size = Math.max(20, s.size * Math.exp(-e.deltaY * 0.0015));
  if (s.anchor && state.face) s.anchor = screenToAnchor(s, state.face);
}, { passive: false });

// ---------- Render loop ----------

function render(now) {
  trackFace(now);
  const W = canvas.width, H = canvas.height;
  ctx.clearRect(0, 0, W, H);

  if (video.readyState >= 2) {
    const r = videoRect();
    ctx.save();
    if (mirrored()) { ctx.translate(W, 0); ctx.scale(-1, 1); }
    ctx.drawImage(video, mirrored() ? W - r.x - r.w : r.x, r.y, r.w, r.h);
    ctx.restore();
  }

  for (const s of state.stickers) {
    if (s.anchor) {
      if (!state.face) continue; // hide face stickers while the face is lost
      if (!(state.gesture && state.selected === s)) applyAnchor(s, state.face);
    }
    drawSticker(s);
  }

  const s = state.selected;
  if (s && (!s.anchor || state.face)) {
    ctx.save();
    ctx.translate(s.x, s.y);
    ctx.rotate(s.rot);
    ctx.setLineDash([8 * state.dpr, 6 * state.dpr]);
    ctx.lineWidth = 2 * state.dpr;
    ctx.strokeStyle = "rgba(255,255,255,.85)";
    const h = s.size / 2 + 6 * state.dpr;
    ctx.strokeRect(-h, -h, h * 2, h * 2);
    ctx.restore();
  }

  requestAnimationFrame(render);
}

// ---------- Capture ----------

let lastBlob = null;

function capture() {
  const out = document.createElement("canvas");
  out.width = canvas.width;
  out.height = canvas.height;
  const g = out.getContext("2d");
  const r = videoRect();
  g.save();
  if (mirrored()) { g.translate(out.width, 0); g.scale(-1, 1); }
  g.drawImage(video, mirrored() ? out.width - r.x - r.w : r.x, r.y, r.w, r.h);
  g.restore();
  for (const s of state.stickers) {
    if (s.anchor && !state.face) continue;
    drawSticker(s, g);
  }
  out.toBlob((blob) => {
    lastBlob = blob;
    $("previewImg").src = URL.createObjectURL(blob);
    $("preview").hidden = false;
  }, "image/png");
}

async function saveCapture() {
  if (!lastBlob) return;
  const file = new File([lastBlob], `ar-sticker-${Date.now()}.png`, { type: "image/png" });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try { await navigator.share({ files: [file], title: "AR Stickers" }); return; }
    catch (err) { if (err.name === "AbortError") return; }
  }
  const a = document.createElement("a");
  a.href = URL.createObjectURL(file);
  a.download = file.name;
  a.click();
}

// ---------- UI wiring ----------

function setStatus(text) { $("status").textContent = text; }

$("startBtn").addEventListener("click", async () => {
  try {
    await startCamera();
  } catch (err) {
    const msg = $("startError");
    msg.hidden = false;
    msg.textContent = window.isSecureContext
      ? `Camera unavailable: ${err.message || err.name}`
      : "Camera needs HTTPS (or localhost). Open this page over https://.";
    return;
  }
  $("start").hidden = true;
  $("topbar").hidden = false;
  $("bottombar").hidden = false;
  resize();
  requestAnimationFrame(render);
  loadLandmarker();
});

$("flipBtn").addEventListener("click", async () => {
  state.facingMode = state.facingMode === "user" ? "environment" : "user";
  try { await startCamera(); } catch (err) { setStatus(`Camera switch failed: ${err.name}`); }
});

$("faceToggle").addEventListener("click", (e) => {
  state.faceLock = !state.faceLock;
  e.currentTarget.classList.toggle("on", state.faceLock);
  e.currentTarget.textContent = `Face lock: ${state.faceLock ? "on" : "off"}`;
});

$("anchorBtn").addEventListener("click", () => {
  const s = state.selected;
  if (!s) return;
  if (s.anchor) s.anchor = null;
  else if (state.face) s.anchor = screenToAnchor(s, state.face);
  else { setStatus("No face in view to lock to"); return; }
  select(s);
});

$("layerUpBtn").addEventListener("click", () => {
  const s = state.selected;
  if (!s) return;
  state.stickers.splice(state.stickers.indexOf(s), 1);
  state.stickers.push(s);
});

$("deleteBtn").addEventListener("click", () => {
  const s = state.selected;
  if (!s) return;
  state.stickers.splice(state.stickers.indexOf(s), 1);
  select(null);
});

$("clearBtn").addEventListener("click", () => {
  state.stickers = [];
  select(null);
});

$("upload").addEventListener("change", (e) => {
  const file = e.target.files && e.target.files[0];
  if (!file) return;
  const img = new Image();
  img.onload = () => {
    addTrayImage(img);
    addSticker(img, { x: 0, y: -1.2, s: 0.9 });
  };
  img.src = URL.createObjectURL(file);
  e.target.value = "";
});

$("shutter").addEventListener("click", capture);
$("saveBtn").addEventListener("click", saveCapture);
$("closePreview").addEventListener("click", () => { $("preview").hidden = true; });

window.addEventListener("resize", resize);
buildTray();
