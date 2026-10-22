// "Is my ORS real?" — front-label check for the South Africa market (orscheck/).
//
// MindAR recognises the front label against known designs: genuine South African
// labels and known counterfeit designs. A match only says which DESIGN the label
// looks like; an exact copy of the genuine artwork will still match "genuine",
// so the result always asks the shopper to check a few details too.
//
// To add a product: put a flat, straight-on front-label image in targets/labels/,
// add it to tools/compile_labels.mjs, re-run it, then add an entry below in the
// SAME order as the images.

import { sfx, unlock } from "./sfx.js";

const MINDAR_THREE = "https://cdn.jsdelivr.net/npm/mind-ar@1.2.5/dist/mindar-image-three.prod.js";
const TARGETS_SRC = "targets/labels/labels.mind";

const LABELS = [
  {
    verdict: "genuine",
    product: "Olive Oil Nourishing Sheen Spray",
    size: "275 ml",
    checks: [
      "Size reads 275 ml",
      "“Original Formula” in italic script",
      "Burgundy band: “THE TRIED. THE TRUE. THE CLASSIC.”",
      "Round check-mark seal where green meets burgundy",
      "Sharp printing, no spelling mistakes",
    ],
  },
  {
    verdict: "fake",
    product: "Nourishing Sheen Spray “infused with Coconut Oil”",
    size: "420 ml",
    checks: [
      "Pink ORS badge with a yellow “NEW” tab",
      "Coconut halves and an oil drop on a dark-green band",
      "Sizes don’t add up: “420ml 260g (11.7 oz)”",
      "No burgundy band, no “Original Formula”",
    ],
  },
];

// Where reports go. Replace with the South Africa consumer-care contact before launch.
const REPORT = {
  email: "customerservice@namastelabs.com",
  subject: "Suspected fake ORS product (South Africa)",
};

const HOLD_MS = 600;      // label must stay recognised this long before we decide
const GIVE_UP_MS = 15000; // then show "couldn't match"

const $ = (id) => document.getElementById(id);
let mindar = null;
let scanning = false;
let giveUpTimer = 0;
let lastResult = null;

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

  let MindARThree;
  try {
    ({ MindARThree } = await import(MINDAR_THREE));
  } catch (err) {
    console.error(err);
    return showError("Couldn't load the scanner. Check your connection and try again.");
  }

  mindar = new MindARThree({
    container: $("ar"),
    imageTargetSrc: TARGETS_SRC,
    maxTrack: 1,
    uiScanning: "no",
    uiLoading: "no",
  });

  LABELS.forEach((label, i) => {
    const anchor = mindar.addAnchor(i);
    let holdTimer = 0;
    anchor.onTargetFound = () => {
      if (!scanning) return;
      $("hintText").textContent = "Hold still…";
      holdTimer = setTimeout(() => decide(i), HOLD_MS);
    };
    anchor.onTargetLost = () => {
      clearTimeout(holdTimer);
      if (scanning) $("hintText").textContent = "Hold the front label inside the frame";
    };
  });

  try {
    await mindar.start();
  } catch (err) {
    console.error(err);
    return showError(window.isSecureContext
      ? "Camera unavailable. Allow camera access and try again."
      : "Camera needs HTTPS. Open this page over https://.");
  }
  mindar.renderer.setAnimationLoop(() => mindar.renderer.render(mindar.scene, mindar.camera));
  $("setup").hidden = true;
  if (new URLSearchParams(location.search).has("debug")) window.check = { decide, LABELS };
  scan();
}

function scan() {
  scanning = true;
  lastResult = null;
  $("hint").hidden = false;
  $("hintText").textContent = "Hold the front label inside the frame";
  clearTimeout(giveUpTimer);
  giveUpTimer = setTimeout(() => decide(-1), GIVE_UP_MS);
}

function decide(i) {
  if (!scanning) return;
  scanning = false;
  clearTimeout(giveUpTimer);
  $("hint").hidden = true;
  const label = LABELS[i];
  const kind = label ? label.verdict : "unknown";
  lastResult = { kind, label, photo: null };
  if (navigator.vibrate) navigator.vibrate(kind === "genuine" ? 30 : [60, 60, 60]);
  if (kind === "genuine") sfx.chime(); else sfx.splat();

  const v = $("verdict");
  v.className = `verdict ${kind}`;
  const text = {
    genuine: ["✓", "Matches the genuine design", `${label?.product} · ${label?.size}`,
      "Now check these details on your pack:",
      "This checks the label design only. Copies can look identical, so if any detail is off, report it."],
    fake: ["!", "Known counterfeit design", `This label matches a fake ${label?.product} seen in South Africa.`,
      "Why it’s flagged:",
      "Please don’t use it. Report where you bought it so we can act."],
    unknown: ["?", "Couldn’t match this label", "It doesn’t match a genuine ORS front label we know.",
      "Try again:",
      "Still no match? It may not be genuine. Check the guide or report it."],
  }[kind];
  $("verdictIcon").textContent = text[0];
  $("verdictTitle").textContent = text[1];
  $("verdictSub").textContent = text[2];
  $("checksTitle").textContent = text[3];
  $("note").textContent = text[4];

  const items = label ? label.checks : [
    "Use good light and avoid glare on the can",
    "Fill the frame with the front label, held straight",
    "Make sure the ORS logo and “OLIVE OIL” are visible",
  ];
  const ul = $("checks");
  ul.replaceChildren(...items.map((t) => {
    const li = document.createElement("li");
    if (kind === "genuine") {
      const box = document.createElement("label");
      box.innerHTML = `<input type="checkbox" /> <span></span>`;
      box.querySelector("span").textContent = t;
      li.append(box);
    } else li.textContent = t;
    return li;
  }));
  $("reportBtn").className = kind === "genuine" ? "ghost" : "primary";
  $("reportBtn").textContent = kind === "genuine" ? "🚩 Something looks off? Report" : "🚩 Report this product";

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
  const video = $("ar").querySelector("video");
  if (!video || !video.videoWidth) return Promise.resolve(null);
  const W = 720, H = Math.round(W * video.videoHeight / video.videoWidth);
  const c = document.createElement("canvas");
  c.width = W; c.height = H;
  c.getContext("2d").drawImage(video, 0, 0, W, H);
  return new Promise((r) => c.toBlob(r, "image/jpeg", 0.85));
}

async function report() {
  const r = lastResult || { kind: "unknown" };
  const what = r.label ? `${r.label.product} (${r.label.size})` : "ORS product";
  const result = { genuine: "matched the genuine design, but something looked off",
    fake: "matched a known counterfeit design", unknown: "did not match a genuine label" }[r.kind];
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
