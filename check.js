// "Is my ORS real?" — front-label check for the South Africa market (orscheck/).
//
// Reads the colour layout of the label inside the on-screen frame, ~10 times a
// second, on the phone (nothing is uploaded). The genuine South African label is
// lime green on top with a burgundy band at the bottom; the known fake has a pink
// ORS badge and a dark-green band; the old layout (most copied by fakes) has a red
// ORS band in the middle. Colour checks the DESIGN only: an exact copy of the
// genuine label will still pass, so a genuine result asks for a detail check too.

import { sfx, unlock } from "./sfx.js";

// What each result says. Colours of the genuine South African label:
// lime-green top, red ORS pill, burgundy band at the bottom.
const RESULTS = {
  genuine: {
    product: "ORS Olive Oil \u00B7 green & burgundy label",
    checks: [
      "Red ORS logo at the top, \u201COLIVE OIL\u201D in olive green (not black)",
      "\u201COriginal Formula\u201D in italic script",
      "Burgundy band: \u201CTHE TRIED. THE TRUE. THE CLASSIC.\u201D",
      "Size matches the pack (Sheen Spray: 275 ml)",
      "Sharp printing, no spelling mistakes",
    ],
  },
  fake: {
    title: "Known counterfeit design",
    sub: "Pink ORS badge on a dark-green label: a fake design seen in South Africa.",
    checks: [
      "Pink ORS badge, often with a yellow \u201CNEW\u201D tab",
      "Dark-green bottom band (coconut design), no burgundy",
      "Sizes that don\u2019t add up, e.g. \u201C420ml 260g (11.7 oz)\u201D",
    ],
  },
  notza: {
    title: "Not the genuine SA label",
    sub: "Genuine ORS in South Africa has a burgundy band at the bottom. This one is dark green.",
    checks: [
      "No burgundy band or \u201COriginal Formula\u201D",
      "Check the size and spelling carefully",
      "If you bought it in South Africa, please report it",
    ],
  },
  old: {
    title: "Old-style label: check carefully",
    sub: "Red ORS band in the middle is the old design, which fakes copy most.",
    checks: [
      "\u201COLIVE OIL\u201D printed in black instead of olive green",
      "Product name in bold block letters",
      "Spelling mistakes (e.g. \u201CHoid\u201D, \u201CRFORMERLY\u201D)",
      "A different brand name in the red band (e.g. \u201CMOMOLEMO\u201D)",
    ],
  },
};

// Where reports go. Replace with the South Africa consumer-care contact before launch.
const REPORT = {
  email: "customerservice@namastelabs.com",
  subject: "Suspected fake ORS product (South Africa)",
};

const STEADY = 7;          // same reading this many times in a row (~0.7 s) before deciding
const GIVE_UP_MS = 15000;  // then show "couldn't read"

const $ = (id) => document.getElementById(id);
let video = null;
let scanning = false;
let giveUpTimer = 0;
let loopTimer = 0;
let lastResult = null;
let streak = { kind: null, n: 0 };

$("startBtn").onclick = start;
$("guideBtn").onclick = $("resultGuideBtn").onclick = () => { $("guide").hidden = false; };
$("guideClose").onclick = () => { $("guide").hidden = true; };
$("againBtn").onclick = () => { $("result").hidden = true; scan(); };
$("reportBtn").onclick = report;

async function start() {
  unlock();
  $("startBtn").hidden = true;
  $("setupError").hidden = true;
  $("progress").hidden = false;
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: { facingMode: "environment", width: { ideal: 1280 }, height: { ideal: 720 } },
    });
    video = document.createElement("video");
    video.playsInline = true;
    video.muted = true;
    video.srcObject = stream;
    $("ar").append(video);
    await video.play();
  } catch (err) {
    console.error(err);
    return showError(window.isSecureContext
      ? "Camera unavailable. Allow camera access and try again."
      : "Camera needs HTTPS. Open this page over https://.");
  }
  $("setup").hidden = true;
  if (new URLSearchParams(location.search).has("debug")) window.check = { read: () => analyse(readFrame()), rows: () => rowCodes(readFrame()) };
  scan();
}

// ---- label reading ----

const SW = 40, SH = 96; // the frame is sampled into this many pixels
const sampler = document.createElement("canvas");
sampler.width = SW; sampler.height = SH;
const sctx = sampler.getContext("2d", { willReadFrequently: true });

// Pixels of the video under the on-screen frame (video is shown with object-fit: cover).
function frameRect() {
  const box = document.querySelector(".label-frame").getBoundingClientRect();
  const W = innerWidth, H = innerHeight, vw = video.videoWidth, vh = video.videoHeight;
  const s = Math.max(W / vw, H / vh);
  const ox = (W - vw * s) / 2, oy = (H - vh * s) / 2;
  return { x: (box.left - ox) / s, y: (box.top - oy) / s, w: box.width / s, h: box.height / s };
}

function readFrame() {
  if (!video || !video.videoWidth) return null;
  const r = frameRect();
  sctx.drawImage(video, r.x, r.y, r.w, r.h, 0, 0, SW, SH);
  return sctx.getImageData(0, 0, SW, SH).data;
}

// Colour classes. Brightness is judged against the label's own lime green, so
// dim light or a warm/cool phone camera doesn't change the answer.
const LIME = 1, DARK = 2, MAROON = 3, PINK = 4;

function hsv(r, g, b) {
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  let h = 0;
  if (d) h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [(h * 60 + 360) % 360, max ? d / max : 0, max / 255];
}
const isGreen = (h, s) => h >= 60 && h <= 175 && s >= 0.25;

// Row-by-row colour of the can, top to bottom, e.g. "DDLLLLLLLLMMMMMMMM".
// L lime label · D dark green · M burgundy/red · P pink · . other
function rowCodes(px) {
  const x0 = Math.floor(SW * 0.3), x1 = Math.ceil(SW * 0.7), w = x1 - x0;
  const cells = [];
  const greens = [];
  for (let y = 0; y < SH; y++) for (let x = x0; x < x1; x++) {
    const i = (y * SW + x) * 4;
    const c = hsv(px[i], px[i + 1], px[i + 2]);
    cells.push(c);
    if (isGreen(c[0], c[1])) greens.push(c[2]);
  }
  if (greens.length < cells.length * 0.15) return ".".repeat(SH);
  greens.sort((a, b) => a - b);
  const limeV = greens[Math.floor(greens.length * 0.8)];
  const kind = ([h, s, v]) => {
    if (s < 0.2 || v < limeV * 0.2) return 0;
    if (isGreen(h, s)) return v >= limeV * 0.75 ? LIME : v <= limeV * 0.7 && h >= 100 ? DARK : 0;
    if ((h >= 285 || h <= 20) && s >= 0.25) return v >= limeV * 0.8 && h >= 285 && h <= 345 ? PINK : MAROON;
    return 0;
  };
  let out = "";
  for (let y = 0; y < SH; y++) {
    const n = [0, 0, 0, 0, 0];
    for (let x = 0; x < w; x++) n[kind(cells[y * w + x])]++;
    const best = [LIME, MAROON, DARK, PINK].reduce((a, c) => (n[c] > n[a] ? c : a), LIME);
    out += n[best] >= w * 0.35 ? ".LDMP"[best] : ".";
  }
  // close one-row gaps (text, glare) inside a colour band
  for (let k = 0; k < 2; k++) out = out.replace(/([LDMP])[.LDMP](?=\1)/g, "$1$1");
  return out;
}

// Returns "genuine" | "fake" | "notza" | "old" | null (no ORS-style label in the frame).
function analyse(px) {
  if (!px) return null;
  const rows = rowCodes(px);
  const count = (str, c) => str.split(c).length - 1;
  const lime = rows.search(new RegExp(`L{${Math.round(SH * 0.08)},}`)); // top of the label, below the cap
  if (lime < 0 || count(rows, "L") < SH * 0.25) return null; // needs a big lime-green label
  const below = rows.slice(lime); // ignore the cap above the label
  const band = (c) => below.search(new RegExp(`${c}{${Math.round(SH * 0.07)},}`));
  const m = band("M"), d = band("D");
  if (m >= 0 && (d < 0 || m < d)) {
    const after = below.slice(m).replace(/^[M.]+/, "");
    return count(after, "L") >= SH * 0.1 ? "old" : "genuine";
  }
  if (d >= 0) return /P{2,}/.test(rows.slice(0, lime + (d * 0.6))) ? "fake" : "notza";
  return null;
}

function tick() {
  if (!scanning) return;
  const kind = analyse(readFrame());
  streak = kind === streak.kind ? { kind, n: streak.n + 1 } : { kind, n: 1 };
  $("hintText").textContent = kind ? "Hold still\u2026" : "Fit the whole can in the frame";
  if (kind && streak.n >= STEADY) return decide(kind);
  loopTimer = setTimeout(tick, 100);
}

function scan() {
  scanning = true;
  lastResult = null;
  streak = { kind: null, n: 0 };
  $("hint").hidden = false;
  $("hintText").textContent = "Fit the whole can in the frame";
  clearTimeout(giveUpTimer);
  clearTimeout(loopTimer);
  giveUpTimer = setTimeout(() => decide("unknown"), GIVE_UP_MS);
  tick();
}

function decide(kind) {
  if (!scanning) return;
  scanning = false;
  clearTimeout(giveUpTimer);
  clearTimeout(loopTimer);
  $("hint").hidden = true;
  const res = RESULTS[kind];
  lastResult = { kind, photo: null };
  const good = kind === "genuine";
  if (navigator.vibrate) navigator.vibrate(good ? 30 : [60, 60, 60]);
  if (good) sfx.chime(); else sfx.splat();

  const tone = good ? "genuine" : kind === "unknown" || kind === "old" ? "unknown" : "fake";
  $("verdict").className = `verdict ${tone}`;
  $("verdictIcon").textContent = good ? "\u2713" : kind === "unknown" ? "?" : "!";
  if (good) {
    $("verdictTitle").textContent = "Matches the genuine SA label";
    $("verdictSub").textContent = res.product;
    $("checksTitle").textContent = "Now check these details on your pack:";
    $("note").textContent = "This checks the label design only. Copies can look identical, so if any detail is off, report it.";
  } else if (res) {
    $("verdictTitle").textContent = res.title;
    $("verdictSub").textContent = res.sub;
    $("checksTitle").textContent = kind === "old" ? "Signs of a fake:" : "Why it\u2019s flagged:";
    $("note").textContent = kind === "old"
      ? "Spot any of these? Don\u2019t use it, and report where you bought it."
      : "Please don\u2019t use it. Report where you bought it so we can act.";
  } else {
    $("verdictTitle").textContent = "Couldn\u2019t read this label";
    $("verdictSub").textContent = "We couldn\u2019t see a clear ORS Olive Oil front label.";
    $("checksTitle").textContent = "Try again:";
    $("note").textContent = "Still no luck? Use the guide to check by eye, or report it.";
  }

  const items = res ? res.checks : [
    "Use good light and avoid glare on the can",
    "Fit the whole can in the frame, front label facing you",
    "Hold the phone straight, about 15 cm away",
  ];
  const ul = $("checks");
  ul.replaceChildren(...items.map((t) => {
    const li = document.createElement("li");
    if (good) {
      const box = document.createElement("label");
      box.innerHTML = `<input type="checkbox" /> <span></span>`;
      box.querySelector("span").textContent = t;
      li.append(box);
    } else li.textContent = t;
    return li;
  }));
  $("reportBtn").className = good ? "ghost" : "primary";
  $("reportBtn").textContent = good ? "\uD83D\uDEA9 Something looks off? Report" : "\uD83D\uDEA9 Report this product";

  capture().then((blob) => {
    if (!blob || lastResult?.kind !== kind) return;
    lastResult.photo = blob;
    $("evidence").src = URL.createObjectURL(blob);
    $("evidence").hidden = false;
  });
  $("evidence").hidden = true;
  $("result").hidden = false;
}

// Snapshot of the camera image (what the shopper sees), for the report.
function capture() {
  if (!video || !video.videoWidth) return Promise.resolve(null);
  const W = 720, H = Math.round(W * video.videoHeight / video.videoWidth);
  const c = document.createElement("canvas");
  c.width = W; c.height = H;
  c.getContext("2d").drawImage(video, 0, 0, W, H);
  return new Promise((r) => c.toBlob(r, "image/jpeg", 0.85));
}

async function report() {
  const r = lastResult || { kind: "unknown" };
  const what = "ORS Olive Oil product";
  const result = { genuine: "matched the genuine SA label, but something looked off",
    fake: "known counterfeit design (pink badge, dark-green label)", notza: "not the genuine SA label (no burgundy band)",
    old: "old-style label", unknown: "label couldn't be read" }[r.kind];
  const body = `Product: ${what}\nScan result: ${result}\n\nWhere I bought it (store, town):\nPrice paid:\nDate:\n\nPlease attach a photo of the front and back of the pack.`;
  const file = r.photo && new File([r.photo], "ors-label.jpg", { type: "image/jpeg" });
  if (file && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: REPORT.subject, text: `${REPORT.subject}\nSend to: ${REPORT.email}\n\n${body}` });
      return;
    } catch (err) {
      if (err.name === "AbortError") return;
    }
  }
  location.href = `mailto:${REPORT.email}?subject=${encodeURIComponent(REPORT.subject)}&body=${encodeURIComponent(body)}`;
}

function showError(msg) {
  $("progress").hidden = true;
  $("startBtn").hidden = false;
  const el = $("setupError");
  el.textContent = msg;
  el.hidden = false;
}
