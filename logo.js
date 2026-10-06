// ORS Olive Oil — point the camera at the logo and it comes to life in 3D.
// Image tracking: MindAR (https://github.com/hiukim/mind-ar-js), rendering: three.js.
//
// The 3D logo is built from the real artwork: targets/logo-shapes.json holds
// the traced letter / pill outlines (tools/vectorize_logo.py), which are
// extruded here; the olive sprig is modelled to sit over the printed one.
import * as THREE from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { sfx, unlock, isMuted, setMuted } from "./sfx.js";
import { QUESTIONS, matchRoutine } from "./products.js";

const MINDAR_THREE = "https://cdn.jsdelivr.net/npm/mind-ar@1.2.5/dist/mindar-image-three.prod.js";

// ---------- Brand config: edit these ----------
const BRAND = {
  name: "ORS Olive Oil",
  tagline: "Nourished by Olive Oil",
  targetSrc: "targets/logo.mind",
  shapesSrc: "targets/logo-shapes.json",
  colors: {
    green: 0x1e5631, red: 0xa51f36, white: 0xffffff, olive: 0x9cb83a,
    leaf: 0x3d6b2a, stem: 0x7d8a3c, gold: 0xf0b323,
  },
};

// Catch-the-oil game.
const GAME = {
  seconds: 25,
  titles: [ // [min score, title]
    [25, "Olive oil master!"],
    [15, "Well oiled!"],
    [8, "Smooth moves!"],
    [0, "Nice start!"],
  ],
};

// logo.png is 708 x 570 px. Logo units: width 1, origin at the centre, y up.
const LOGO_W = 708, LOGO_H = 570;
const ASPECT = LOGO_H / LOGO_W;
const U = 1 / LOGO_W;
const px = (x, y) => new THREE.Vector2(x * U - 0.5, (LOGO_H / 2 - y) * U);

// Olive sprig, measured off the artwork (logo px).
const SPRIG = {
  olives: [ // centre, radii, tilt (deg), z offset
    { c: [484, 380], r: [36, 43], tilt: -12, z: 0 },
    { c: [542, 415], r: [37, 43], tilt: 4, z: 0.014 },
    { c: [538, 498], r: [36, 44], tilt: -4, z: 0.006 },
  ],
  leaves: [ // base -> tip, width, z
    { from: [522, 322], to: [607, 342], w: 21, z: 0.02 },
    { from: [527, 326], to: [582, 398], w: 23, z: 0.008 },
    { from: [511, 428], to: [485, 533], w: 23, z: 0.05 },
  ],
  stems: [
    [[540, 277], [533, 296], [520, 318]],
    [[520, 318], [505, 330], [494, 340]],
    [[520, 318], [527, 345], [533, 375]],
    [[520, 318], [512, 372], [513, 425], [524, 457]],
  ],
};
const DROP_AT = [262, 96]; // tip of the oil drop inside the ORS "O"
const LAND_Y = 560;        // the drop falls past the logo to just below it

const $ = (id) => document.getElementById(id);

// ---------- Setup ----------

function init() {
  $("brandTitle").textContent = BRAND.name;
  $("tagline").textContent = BRAND.tagline;
  $("startBtn").onclick = start;
  const syncMute = () => { $("muteBtn").textContent = isMuted() ? "🔇" : "🔊"; };
  syncMute();
  $("muteBtn").onclick = () => { setMuted(!isMuted()); syncMute(); };
}

function showError(msg) {
  $("progress").hidden = true;
  $("startBtn").hidden = false;
  const el = $("setupError");
  el.textContent = msg;
  el.hidden = false;
}

async function start() {
  unlock(); // audio needs a user gesture on iOS
  $("startBtn").hidden = true;
  $("setupError").hidden = true;
  $("progress").hidden = false;

  let MindARThree, shapes;
  try {
    [{ MindARThree }, shapes] = await Promise.all([
      import(MINDAR_THREE),
      fetch(BRAND.shapesSrc).then((r) => r.json()),
    ]);
  } catch (err) {
    console.error(err);
    showError("Couldn't load the AR experience. Check your connection and try again.");
    return;
  }

  const mindar = new MindARThree({
    container: $("ar"),
    imageTargetSrc: BRAND.targetSrc,
    uiScanning: "no",
    uiLoading: "no",
    filterMinCF: 0.0001,
    filterBeta: 0.001,
  });
  const { renderer, scene, camera } = mindar;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  // Studio reflections make the glossy letters read as real objects.
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.add(new THREE.HemisphereLight(0xffffff, 0x445533, 0.35));
  const key = new THREE.DirectionalLight(0xfff4e0, 1.1);
  key.position.set(-0.6, 1, 1.5);
  scene.add(key);

  let ctaArmed = false;
  let tipShown = false;
  const showMenu = () => {
    $("cta").hidden = false;
    if (!tipShown) {
      tipShown = true;
      setTimeout(() => toast("Tip: tap the letters and olives 🫒"), 1200);
    }
  };

  const anchor = mindar.addAnchor(0);
  const show = new LogoReveal(shapes, camera);
  const game = new DropGame(show);
  const match = new HairMatch(show);
  anchor.group.add(show.root);
  if (new URLSearchParams(location.search).has("debug")) Object.assign(window, { reveal: show, game, match });

  anchor.onTargetFound = () => {
    show.found();
    $("hint").hidden = true;
    ctaArmed = true; // the menu slides up once the reveal finishes
    if (navigator.vibrate) navigator.vibrate(25);
  };
  anchor.onTargetLost = () => {
    show.lost();
    $("hint").hidden = false;
  };

  $("ar").addEventListener("pointerdown", (e) => {
    const rect = $("ar").getBoundingClientRect();
    const p = { x: e.clientX - rect.left, y: e.clientY - rect.top, w: rect.width, h: rect.height };
    if (game.running) game.tap(p);
    else show.tap(p);
  });

  $("playBtn").onclick = () => { unlock(); game.start(); };
  $("matchBtn").onclick = () => { unlock(); match.start(); };
  $("againBtn").onclick = () => { $("result").hidden = true; game.start(); };
  $("resultCloseBtn").onclick = () => { $("result").hidden = true; $("cta").hidden = false; };
  const snap = () => snapPhoto(mindar);
  $("snapBtn").onclick = snap;
  $("resultSnapBtn").onclick = () => { $("result").hidden = true; $("cta").hidden = false; setTimeout(snap, 150); };
  $("photoCloseBtn").onclick = () => { $("photo").hidden = true; };
  $("photoSaveBtn").onclick = savePhoto;

  try {
    await mindar.start();
  } catch (err) {
    console.error(err);
    showError(window.isSecureContext
      ? "Camera unavailable. Allow camera access and try again."
      : "Camera needs HTTPS. Open this page over https://.");
    return;
  }
  $("setup").hidden = true;
  $("hint").hidden = false;
  $("topbar").hidden = false;

  const clock = new THREE.Clock();
  renderer.setAnimationLoop(() => {
    const dt = Math.min(clock.getDelta(), 0.05);
    game.update(dt);
    show.update(dt, clock.elapsedTime);
    if (ctaArmed && show.ready) {
      ctaArmed = false;
      const busy = game.running || !$("quiz").hidden || !$("routine").hidden || !$("result").hidden;
      if (!busy) showMenu();
    }
    renderer.render(scene, camera);
  });
}

// A small message that floats in and fades away.
function toast(text) {
  const el = $("toast");
  el.textContent = text;
  el.hidden = false;
  el.style.animation = "none";
  void el.offsetWidth;
  el.style.animation = "";
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => { el.hidden = true; }, 3200);
}

// ---------- Photo ----------

let photoBlob = null;

async function snapPhoto({ renderer, scene, camera }) {
  const container = $("ar");
  const W = container.clientWidth, H = container.clientHeight;
  const dpr = renderer.getPixelRatio();
  const out = document.createElement("canvas");
  out.width = Math.round(W * dpr);
  out.height = Math.round(H * dpr);
  const g = out.getContext("2d");

  // Camera image, positioned exactly as MindAR shows it.
  const video = container.querySelector("video");
  if (video && video.videoWidth) {
    let x = parseFloat(video.style.left), y = parseFloat(video.style.top);
    let w = parseFloat(video.style.width), h = parseFloat(video.style.height);
    if (!(w > 0 && h > 0)) { // fall back to "cover"
      const s = Math.max(W / video.videoWidth, H / video.videoHeight);
      w = video.videoWidth * s; h = video.videoHeight * s; x = (W - w) / 2; y = (H - h) / 2;
    }
    g.drawImage(video, (x || 0) * dpr, (y || 0) * dpr, w * dpr, h * dpr);
  }
  renderer.render(scene, camera); // render now so the WebGL buffer is fresh
  g.drawImage(renderer.domElement, 0, 0, out.width, out.height);

  // Small branded badge.
  try {
    const logo = await new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = "targets/logo.png";
    });
    const bw = out.width * 0.22, bh = (bw * logo.height) / logo.width, pad = out.width * 0.03;
    g.fillStyle = "rgba(255,255,255,.92)";
    g.beginPath();
    g.roundRect(pad, out.height - bh - pad * 2.4, bw + pad, bh + pad, pad * 0.6);
    g.fill();
    g.drawImage(logo, pad * 1.5, out.height - bh - pad * 1.9, bw, bh);
  } catch { /* badge is optional */ }

  sfx.shutter();
  const flash = $("flash");
  flash.hidden = false;
  flash.style.animation = "none";
  void flash.offsetWidth;
  flash.style.animation = "";
  setTimeout(() => { flash.hidden = true; }, 400);

  out.toBlob((blob) => {
    photoBlob = blob;
    $("photoImg").src = URL.createObjectURL(blob);
    $("photo").hidden = false;
  }, "image/jpeg", 0.92);
}

function savePhoto() {
  if (photoBlob) shareFile(photoBlob, `ors-olive-oil-ar-${Date.now()}.jpg`);
}

async function shareFile(blob, filename) {
  const file = new File([blob], filename, { type: blob.type });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try { await navigator.share({ files: [file], title: BRAND.name }); return; } catch (err) {
      if (err.name === "AbortError") return;
    }
  }
  const a = document.createElement("a");
  a.href = URL.createObjectURL(file);
  a.download = file.name;
  a.click();
}

// ---------- Helpers ----------

const clamp01 = (t) => Math.max(0, Math.min(1, t));
const smooth = (t) => { t = clamp01(t); return t * t * (3 - 2 * t); };
const easeOutBack = (t) => { t = clamp01(t); return 1 + 2.4 * Math.pow(t - 1, 3) + 1.4 * Math.pow(t - 1, 2); };
const easeInOut = (t) => { t = clamp01(t); return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; };
const rand = (a, b) => a + Math.random() * (b - a);

// Traced polygons (logo px) -> THREE.Shapes relative to `centre` (logo units).
function toShapes(polys, centre) {
  const v = ([x, y]) => px(x, y).sub(centre);
  return polys.map(({ outer, holes }) => {
    const s = new THREE.Shape(outer.map(v));
    s.holes = holes.map((h) => new THREE.Path(h.map(v)));
    return s;
  });
}

function bboxCentre(polys) {
  const b = new THREE.Box2();
  polys.forEach((p) => p.outer.forEach(([x, y]) => b.expandByPoint(px(x, y))));
  return b.getCenter(new THREE.Vector2());
}

// Extruded mesh whose back face sits at z=0 and whose pivot is its centre.
function extrude(polys, material, depth, bevel) {
  const centre = bboxCentre(polys);
  const geo = new THREE.ExtrudeGeometry(toShapes(polys, centre), {
    depth, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel * 0.8,
    bevelOffset: -bevel * 0.8, bevelSegments: 4, curveSegments: 6,
  });
  geo.translate(0, 0, bevel);
  geo.computeBoundingBox();
  const mesh = new THREE.Mesh(geo, material);
  mesh.position.set(centre.x, centre.y, 0);
  mesh.userData.depth = depth + bevel * 2;
  mesh.userData.baseX = centre.x;
  mesh.userData.baseY = centre.y;
  mesh.userData.halfH = geo.boundingBox.max.y;
  return mesh;
}

function glossy(color, extra = {}) {
  return new THREE.MeshPhysicalMaterial({
    color, roughness: 0.45, metalness: 0, clearcoat: 0.55, clearcoatRoughness: 0.18, envMapIntensity: 0.35, ...extra,
  });
}

function canvasTexture(w, h, draw) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  draw(c.getContext("2d"), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// Soft drop shadow drawn from the logo's own silhouette (64px margin each side).
function shadowTexture(shapes) {
  const W = 512, H = Math.round(512 * ASPECT), k = W / LOGO_W, off = 4000;
  return canvasTexture(W + 128, H + 128, (g) => {
    g.translate(64 - off, 64);
    g.shadowColor = "rgba(0,0,0,0.9)";
    g.shadowBlur = 34;
    g.shadowOffsetX = off; // draw the shape off-canvas so only its blurred shadow lands
    g.fillStyle = "#000";
    for (const { outer } of [...shapes.letters.flat(), ...shapes.pill]) {
      g.beginPath();
      outer.forEach(([x, y], i) => (i ? g.lineTo(x * k, y * k) : g.moveTo(x * k, y * k)));
      g.fill();
    }
    for (const o of SPRIG.olives) {
      g.beginPath();
      g.ellipse(o.c[0] * k, o.c[1] * k, o.r[0] * k, o.r[1] * k, 0, 0, Math.PI * 2);
      g.fill();
    }
  });
}

function sparkleTexture() {
  return canvasTexture(64, 64, (g) => {
    const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, "rgba(255,250,225,1)");
    grad.addColorStop(0.2, "rgba(255,215,110,.85)");
    grad.addColorStop(1, "rgba(255,190,50,0)");
    g.fillStyle = grad;
    g.fillRect(0, 0, 64, 64);
    g.fillStyle = "rgba(255,255,240,.9)";
    g.fillRect(31, 6, 2, 52);
    g.fillRect(6, 31, 52, 2);
  });
}

function leafGeometry(len, width) {
  const s = new THREE.Shape();
  s.moveTo(0, 0);
  s.bezierCurveTo(len * 0.3, width * 0.62, len * 0.75, width * 0.5, len, 0);
  s.bezierCurveTo(len * 0.75, -width * 0.5, len * 0.3, -width * 0.62, 0, 0);
  const geo = new THREE.ShapeGeometry(s, 16);
  // Fold along the midrib and arch the leaf so it reads as 3D.
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i);
    p.setZ(i, Math.abs(y) * -0.45 + Math.sin((x / len) * Math.PI) * width * 0.35);
  }
  geo.computeVertexNormals();
  return geo;
}

function tube(points, radius, material) {
  const curve = new THREE.CatmullRomCurve3(points.map(([x, y]) => {
    const v = px(x, y);
    return new THREE.Vector3(v.x, v.y, 0.03);
  }));
  const mesh = new THREE.Mesh(new THREE.TubeGeometry(curve, 24, radius, 8, false), material);
  mesh.userData.count = mesh.geometry.index.count;
  return mesh;
}

// A cartoon face for an olive (unit-sphere space, facing +z).
function makeFace() {
  const face = new THREE.Group();
  const white = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.3 });
  const black = new THREE.MeshStandardMaterial({ color: 0x141414, roughness: 0.15 });
  const pink = new THREE.MeshBasicMaterial({ color: 0xff8fa3, transparent: true, opacity: 0.55 });
  const eyes = [];
  const pupils = [];
  for (const side of [-1, 1]) {
    const eye = new THREE.Group();
    eye.position.set(side * 0.3, 0.2, 0.9);
    const ball = new THREE.Mesh(new THREE.SphereGeometry(0.21, 20, 14), white);
    const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.12, 16, 12), black);
    pupil.position.z = 0.13;
    const glint = new THREE.Mesh(new THREE.SphereGeometry(0.04, 8, 6), white);
    glint.position.set(0.04, 0.05, 0.11);
    pupil.add(glint);
    eye.add(ball, pupil);
    face.add(eye);
    eyes.push(eye);
    pupils.push(pupil);
    const cheek = new THREE.Mesh(new THREE.CircleGeometry(0.11, 16), pink);
    cheek.position.set(side * 0.52, -0.12, 0.86);
    cheek.rotation.y = side * 0.55;
    face.add(cheek);
  }
  const mouth = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.04, 8, 20, Math.PI), black);
  mouth.rotation.z = Math.PI; // lower half of the ring = a smile
  mouth.position.set(0, -0.1, 0.97);
  face.add(mouth);
  face.userData = { eyes, pupils, mouth };
  face.scale.setScalar(0.001);
  return face;
}

// ---------- The reveal ----------
// A cartoon "coming to life" (seconds after the logo is found):
// (about 4 seconds; scale with REVEAL_SPEED)
//   0.0  the print trembles and rumbles
//   0.35 the red pill pops up; O, R, S jump out of it; the "O" squirts golden oil
//   0.6  each letter crouches and leaps out of the paper with its own trick
//        (O rolls, L backflips, I pogos, V cartwheels, E spins) and lands with a squash
//   1.5  the olives pop off the page like popcorn, land, open their eyes and wink
//   2.2  an olive-branch wreath grows up around the logo
//   2.5  finale: the whole logo zooms up off the page, swings round and grows to ~1.4x the
//        print; the letters do a musical stadium wave; confetti
//   4.0+ menu slides up; idle: drops + glint, olive hops across the letters, waves
// Tap a letter to play it, an olive to make it flip, the pill to squirt oil,
// anywhere else to spin the logo.

// One side of the olive-branch wreath that grows up around the logo.
class WreathBranch {
  constructor(side) {
    this.group = new THREE.Group();
    this.group.position.set(side * 0.53, -ASPECT * 0.42, 0.04);
    this.group.scale.x = side;

    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(0.1, 0.18, 0.08),
      new THREE.Vector3(0.13, 0.46, 0.12),
      new THREE.Vector3(0.05, 0.76, 0.1),
    ]);
    this.stem = new THREE.Mesh(
      new THREE.TubeGeometry(curve, 48, 0.008, 6, false),
      new THREE.MeshStandardMaterial({ color: BRAND.colors.stem, roughness: 0.7 }),
    );
    this.stemLen = this.stem.geometry.index.count;
    this.stem.geometry.setDrawRange(0, 0);
    this.group.add(this.stem);

    const leafGeo = leafGeometry(0.16, 0.06);
    const leafMats = [
      new THREE.MeshPhysicalMaterial({ color: BRAND.colors.leaf, side: THREE.DoubleSide, roughness: 0.55, clearcoat: 0.15, envMapIntensity: 0.4 }),
      new THREE.MeshPhysicalMaterial({ color: BRAND.colors.green, side: THREE.DoubleSide, roughness: 0.55, clearcoat: 0.15, envMapIntensity: 0.4 }),
    ];
    this.leaves = [];
    const n = 10;
    for (let i = 0; i < n; i++) {
      const t = 0.1 + (i / (n - 1)) * 0.86;
      const pivot = new THREE.Group();
      pivot.position.copy(curve.getPoint(t));
      const tan = curve.getTangent(t);
      const out = i % 2 ? 1 : -1;
      pivot.rotation.z = Math.atan2(tan.y, tan.x) + out * 0.85;
      pivot.rotation.x = 0.35 * out;
      pivot.add(new THREE.Mesh(leafGeo, leafMats[i % 2]));
      pivot.scale.setScalar(0.001);
      this.group.add(pivot);
      this.leaves.push({ pivot, t, size: 0.8 + Math.random() * 0.4 });
    }
    const tip = new THREE.Group();
    tip.position.copy(curve.getPoint(1));
    const tt = curve.getTangent(1);
    tip.rotation.z = Math.atan2(tt.y, tt.x);
    tip.add(new THREE.Mesh(leafGeo, leafMats[0]));
    tip.scale.setScalar(0.001);
    this.group.add(tip);
    this.leaves.push({ pivot: tip, t: 1, size: 1 });

    const oliveGeo = new THREE.SphereGeometry(0.026, 18, 12);
    oliveGeo.scale(1, 1.28, 1);
    const oliveMat = glossy(BRAND.colors.olive, { roughness: 0.4 });
    this.olives = [0.3, 0.55, 0.8].map((t, i) => {
      const m = new THREE.Mesh(oliveGeo, oliveMat);
      const p = curve.getPoint(t);
      m.position.set(p.x + (i % 2 ? 0.03 : -0.03), p.y - 0.035, p.z + 0.02);
      m.scale.setScalar(0.001);
      this.group.add(m);
      return { mesh: m, t };
    });
  }

  // grow: 0..1 how far the branch has grown.
  update(grow, time) {
    const g = clamp01(grow);
    this.stem.geometry.setDrawRange(0, Math.floor((this.stemLen * g) / 3) * 3);
    for (const l of this.leaves) {
      const k = easeOutBack(clamp01((g - l.t * 0.85) / 0.2)) * l.size;
      l.pivot.scale.setScalar(Math.max(0.001, k));
    }
    for (const o of this.olives) {
      const k = easeOutBack(clamp01((g - 0.85 - o.t * 0.1) / 0.15));
      o.mesh.scale.setScalar(Math.max(0.001, k));
    }
    this.group.rotation.z = Math.sin(time * 1.3) * 0.04 * g;
    this.group.rotation.y = Math.sin(time * 0.9 + 1) * 0.06 * g;
  }
}

const LETTER_MOVES = ["roll", "flip", "pogo", "cartwheel", "spin", "roll", "pogo", "flip"]; // O L I V E O I L
const T_PILL = 0.35;
const T_LETTERS = 0.6, LETTER_GAP = 0.13, CROUCH = 0.1, FLY = 0.6;
const T_OLIVES = 1.5, OLIVE_GAP = 0.17, OLIVE_FLY = 0.5;
const T_FINALE = 2.5;   // the whole logo zooms up off the page
const ZOOM_TIME = 1.1;
const ZOOM_SCALE = 1.4; // how much bigger than the print it ends up
const ZOOM_LIFT = 0.28; // how far off the page it floats (logo widths)
const READY_AT = 4.0;
const REVEAL_SPEED = 1; // < 1 slows the coming-to-life down; idle play is always real-time
const PRINT_FADE = 0.5;  // how much the printed logo is veiled once the 3D one is up

class LogoReveal {
  constructor(shapes, camera) {
    this.camera = camera;
    this.root = new THREE.Group();
    this.age = 0;
    this.prevAge = 0;
    this.active = false;
    this.lostFor = 99;
    this.nextDrop = 0;
    this.nextHop = 0;
    this.nextWave = 0;
    this.timers = [];
    this.squirts = [];
    this.spin = null;
    this.shimmerX = null;
    this.dropState = null;
    this.gameMode = false;

    // Soft paper-coloured veil that fades the printed logo under the 3D one.
    this.veil = new THREE.Mesh(
      new THREE.PlaneGeometry(1.06, ASPECT + 0.06),
      new THREE.MeshBasicMaterial({
        color: 0xf7f6f1, transparent: true, opacity: 0, depthWrite: false, toneMapped: false,
        alphaMap: canvasTexture(128, 128, (g) => {
          const grad = g.createRadialGradient(64, 64, 30, 64, 64, 64);
          grad.addColorStop(0, "#fff");
          grad.addColorStop(0.75, "#fff");
          grad.addColorStop(1, "#000");
          g.fillStyle = grad;
          g.fillRect(0, 0, 128, 128);
        }),
      }),
    );
    this.veil.position.z = 0.0005;
    this.root.add(this.veil);

    // Soft shadow on the paper under the floating logo.
    this.shadow = new THREE.Mesh(
      new THREE.PlaneGeometry(1 + 128 / 512, ASPECT + 128 / 512),
      new THREE.MeshBasicMaterial({ map: shadowTexture(shapes), transparent: true, opacity: 0, depthWrite: false }),
    );
    this.shadow.position.z = 0.001;
    this.root.add(this.shadow);

    // The 3D logo, which lifts off the paper.
    this.logo = new THREE.Group();
    this.root.add(this.logo);

    this.pill = extrude(shapes.pill, glossy(BRAND.colors.red), 0.045, 0.01);
    this.logo.add(this.pill);
    const pillFront = this.pill.userData.depth;

    const white = glossy(BRAND.colors.white, { roughness: 0.22 });
    this.ors = shapes.ors.map((p) => {
      const m = extrude([p], white, 0.02, 0.004);
      m.position.z = pillFront - 0.002;
      this.logo.add(m);
      return m;
    });
    // ORS (TM): too fine to extrude, so it's a decal on the pill.
    const tmAt = px(478, 45);
    this.orsTm = new THREE.Mesh(
      new THREE.PlaneGeometry(26 * U, 13 * U),
      new THREE.MeshBasicMaterial({
        map: canvasTexture(104, 52, (g) => {
          g.fillStyle = "#fff"; g.font = "bold 40px Arial, sans-serif"; g.textBaseline = "middle";
          g.fillText("TM", 2, 28);
        }),
        transparent: true, depthWrite: false,
      }),
    );
    this.orsTm.position.set(tmAt.x, tmAt.y, pillFront + 0.001);
    this.logo.add(this.orsTm);

    this.letters = shapes.letters.map((p) => {
      const mat = glossy(BRAND.colors.green, { emissive: BRAND.colors.gold, emissiveIntensity: 0 });
      const m = extrude(p, mat, 0.09, 0.008);
      this.logo.add(m);
      return m;
    });
    this.letterFx = this.letters.map(() => ({ jump: 0, dip: 0 }));
    this.tm = extrude(shapes.tm, glossy(BRAND.colors.green), 0.01, 0.002);
    this.logo.add(this.tm);

    // Olive-branch wreath around the logo (grows in the finale).
    this.wreath = [new WreathBranch(-1), new WreathBranch(1)];
    this.wreath.forEach((b) => this.logo.add(b.group));

    // Olive sprig.
    this.sprig = new THREE.Group();
    this.logo.add(this.sprig);
    const stemMat = new THREE.MeshStandardMaterial({ color: BRAND.colors.stem, roughness: 0.6 });
    this.stems = SPRIG.stems.map((pts) => {
      const t = tube(pts, 2.3 * U, stemMat);
      this.sprig.add(t);
      return t;
    });
    const oliveMat = glossy(BRAND.colors.olive, { roughness: 0.4, clearcoat: 0.8 });
    const sphere = new THREE.SphereGeometry(1, 40, 28);
    this.olives = SPRIG.olives.map((o) => {
      const m = new THREE.Mesh(sphere, oliveMat);
      const c = px(...o.c);
      const depth = Math.min(o.r[0], o.r[1]) * U * 0.95;
      m.position.set(c.x, c.y, depth + o.z + 0.03); // sit forward with the deeper letters
      m.rotation.z = THREE.MathUtils.degToRad(o.tilt);
      m.userData.r = new THREE.Vector3(o.r[0] * U, o.r[1] * U, depth);
      const face = makeFace();
      m.add(face);
      this.sprig.add(m);
      return m;
    });
    this.oliveFx = this.olives.map((m, i) => ({
      home: m.position.clone(), tilt: m.rotation.z, face: m.children[0],
      flip: 0, squash: 0, hop: null, blinkAt: 3 + i, look: 0,
    }));
    const leafMat = new THREE.MeshPhysicalMaterial({
      color: BRAND.colors.leaf, roughness: 0.45, clearcoat: 0.6, side: THREE.DoubleSide,
    });
    this.leafGeo = leafGeometry(1, 0.38);
    this.leafMat = leafMat;
    this.leaves = SPRIG.leaves.map((l) => {
      const a = px(...l.from), b = px(...l.to);
      const pivot = new THREE.Group();
      pivot.position.set(a.x, a.y, l.z);
      pivot.rotation.z = Math.atan2(b.y - a.y, b.x - a.x);
      const leaf = new THREE.Mesh(leafGeometry(a.distanceTo(b), l.w * U), leafMat);
      pivot.add(leaf);
      this.sprig.add(pivot);
      return { pivot, leaf };
    });

    // The golden oil drop (teardrop, tip up, unit height).
    const pts = [];
    for (let i = 0; i <= 20; i++) {
      const t = i / 20;
      pts.push(new THREE.Vector2(Math.sin(t * Math.PI) * (1 - t * 0.72) * 0.5, -Math.cos(t * Math.PI) * 0.5 + 0.5));
    }
    this.dropGeo = new THREE.LatheGeometry(pts, 32);
    this.dropGeo.translate(0, -0.5, 0);
    this.goldMat = glossy(BRAND.colors.gold, {
      metalness: 0.6, roughness: 0.1, emissive: 0x6a4000, emissiveIntensity: 0.8, envMapIntensity: 1.2,
    });
    this.bonusMat = glossy(0xffd84a, {
      metalness: 0.7, roughness: 0.05, emissive: 0xffa800, emissiveIntensity: 1.2, envMapIntensity: 1.5,
    });
    this.drop = new THREE.Mesh(this.dropGeo, this.goldMat);
    this.drop.visible = false;
    this.logo.add(this.drop);

    // Gold dust.
    const N = 220;
    this.dust = Array.from({ length: N }, () => ({ life: 1, max: 1, p: new THREE.Vector3(), v: new THREE.Vector3() }));
    this.dustGeo = new THREE.BufferGeometry();
    this.dustGeo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(N * 3), 3));
    this.dustPoints = new THREE.Points(this.dustGeo, new THREE.PointsMaterial({
      map: sparkleTexture(), size: 0.035, transparent: true, depthWrite: false,
      blending: THREE.AdditiveBlending, toneMapped: false,
    }));
    this.root.add(this.dustPoints);

    // Confetti (olives, leaves, gold and red flakes).
    this.confetti = [];
    this.confettiMats = [
      new THREE.MeshStandardMaterial({ color: BRAND.colors.gold, metalness: 0.6, roughness: 0.3, side: THREE.DoubleSide }),
      new THREE.MeshStandardMaterial({ color: BRAND.colors.red, roughness: 0.4, side: THREE.DoubleSide }),
      new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.4, side: THREE.DoubleSide }),
    ];
    this.flakeGeo = new THREE.PlaneGeometry(0.03, 0.018);
    this.miniOliveGeo = new THREE.SphereGeometry(0.018, 14, 10).scale(1, 1.25, 1);

    this.apply(0, 0);
  }

  found() {
    if (this.lostFor > 2.5) { // replay the reveal after a real absence
      this.age = 0;
      this.prevAge = 0;
      this.timers = [];
      this.nextDrop = READY_AT + 2;
      this.nextHop = READY_AT + 6;
      this.nextWave = READY_AT + 12;
    }
    this.active = true;
  }

  lost() {
    this.active = false;
    this.lostFor = 0;
  }

  get ready() { return this.active && this.age > READY_AT; }

  // Screen position (0..1) and on-screen radius of an object, for forgiving taps.
  screenOf(obj, radius) {
    const c = obj.getWorldPosition(new THREE.Vector3());
    const e = obj.localToWorld(new THREE.Vector3(radius, 0, 0));
    const toPx = (v) => { v.project(this.camera); return { x: (v.x + 1) / 2, y: (1 - v.y) / 2 }; };
    return { c: toPx(c), e: toPx(e) };
  }

  pick(p, candidates) {
    let best = null, bestD = Infinity;
    for (const { obj, radius, data } of candidates) {
      if (!obj.visible) continue;
      const { c, e } = this.screenOf(obj, radius);
      const cx = c.x * p.w, cy = c.y * p.h;
      const r = Math.max(Math.hypot((e.x - c.x) * p.w, (e.y - c.y) * p.h) * 1.15, 30);
      const d = Math.hypot(p.x - cx, p.y - cy);
      if (d < r && d / r < bestD) { best = data; bestD = d / r; }
    }
    return best;
  }

  tap(p) {
    if (!this.ready) return;
    const hit = this.pick(p, [
      ...this.olives.map((obj, i) => ({ obj, radius: 1.1, data: { olive: i } })),
      ...this.letters.map((obj, i) => {
        const b = obj.geometry.boundingBox;
        return { obj, radius: Math.max(b.max.x - b.min.x, b.max.y - b.min.y) * 0.55, data: { letter: i } };
      }),
      { obj: this.pill, radius: 0.33, data: { pill: true } },
    ]);
    if (hit && hit.olive !== undefined) this.pokeOlive(hit.olive);
    else if (hit && hit.letter !== undefined) this.jumpLetter(hit.letter);
    else if (hit && hit.pill) this.squirt();
    else this.spinLogo();
  }

  spinLogo() {
    if (this.spin) return;
    this.spin = { t: 0 };
    sfx.whoosh();
    this.startDrop();
    this.emitDust(30, new THREE.Vector3(0, 0, 0.1), 0.6);
  }

  jumpLetter(i, withSound = true) {
    this.letterFx[i].jump = 1;
    if (withSound) sfx.letter(i);
    this.emitDust(8, this.toRoot(this.letters[i]), 0.08);
  }

  // Stadium wave across the letters (with a little tune when `withSound`).
  wave(withSound) {
    this.letters.forEach((_, i) => this.later(i * 0.07, () => this.jumpLetter(i, withSound)));
    this.later(0.6, () => this.cheer());
  }

  pokeOlive(i) {
    const fx = this.oliveFx[i];
    if (fx.hop) return;
    fx.flip = 1;
    fx.squash = 1;
    sfx.giggle();
    this.emitDust(10, this.toRoot(this.olives[i]), 0.06);
  }

  cheer() {
    this.oliveFx.forEach((fx, i) => { if (!fx.hop) { fx.squash = 1; fx.flip = i === 1 ? 1 : fx.flip; } });
  }

  // An olive bounces across the tops of O-L-I-V-E and back home.
  startHop(i = 0) {
    const fx = this.oliveFx[i];
    if (fx.hop || fx.flip) return;
    const r = this.olives[i].userData.r;
    const stops = [4, 3, 2, 1, 0].map((li) => {
      const L = this.letters[li];
      const top = L.userData.baseY + L.userData.halfH;
      return { pos: new THREE.Vector3(L.userData.baseX, top + r.y * 0.9, L.userData.depth * 0.6), letter: li };
    });
    stops.push({ pos: fx.home.clone(), letter: null });
    fx.hop = { from: this.olives[i].position.clone(), stops, seg: 0, t: 0 };
  }

  startDrop() {
    if (this.dropState) return;
    const at = px(...DROP_AT);
    this.dropState = { phase: "form", t: 0, x: at.x, y: at.y, vy: 0 };
  }

  // A little fountain of golden oil out of the drop in the ORS "O".
  squirt(n = 8) {
    const at = px(...DROP_AT);
    const z = this.pill.userData.depth + 0.03;
    for (let i = 0; i < n; i++) {
      const mesh = new THREE.Mesh(this.dropGeo, this.goldMat);
      const s = rand(0.022, 0.034);
      mesh.scale.set(s, s * 1.2, s);
      mesh.position.set(at.x, at.y + 0.02, z);
      this.logo.add(mesh);
      this.squirts.push({ mesh, v: new THREE.Vector3(rand(-0.22, 0.22), rand(0.45, 0.75), rand(0.05, 0.25)) });
    }
    sfx.squirt();
  }

  // Run `fn` after `delay` seconds of timeline.
  later(delay, fn) {
    this.timers.push({ at: this.age + delay, fn });
  }

  // Position of an object in root space (where dust/confetti live).
  toRoot(obj) {
    return this.root.worldToLocal(obj.getWorldPosition(new THREE.Vector3()));
  }

  emitDust(n, at, spread, speed = 1) {
    for (const d of this.dust) {
      if (n <= 0) break;
      if (d.life < d.max) continue;
      d.life = 0;
      d.max = 0.6 + Math.random() * 0.8;
      d.p.set(at.x + (Math.random() - 0.5) * spread, at.y + (Math.random() - 0.5) * spread * ASPECT, at.z);
      d.v.set((Math.random() - 0.5) * 0.4 * speed, (Math.random() * 0.35 + 0.05) * speed, Math.random() * 0.3 * speed);
      n--;
    }
  }

  celebrate(n = 90) {
    for (let i = 0; i < n; i++) {
      const kind = Math.random();
      let mesh;
      if (kind < 0.22) {
        mesh = new THREE.Mesh(this.miniOliveGeo, this.olives[0].material);
      } else if (kind < 0.42) {
        mesh = new THREE.Mesh(this.leafGeo, this.leafMat);
        mesh.scale.setScalar(0.07);
      } else {
        mesh = new THREE.Mesh(this.flakeGeo, this.confettiMats[Math.floor(Math.random() * 3)]);
      }
      mesh.position.set(rand(-0.7, 0.7), ASPECT / 2 + rand(0.1, 0.9), rand(0.05, 0.35));
      mesh.rotation.set(rand(0, 6), rand(0, 6), rand(0, 6));
      this.root.add(mesh);
      this.confetti.push({
        mesh, life: 0, max: rand(2.5, 4),
        v: new THREE.Vector3(rand(-0.15, 0.15), rand(-0.25, 0), rand(-0.05, 0.1)),
        spin: new THREE.Vector3(rand(-6, 6), rand(-6, 6), rand(-6, 6)),
      });
    }
    this.cheer();
  }

  update(dt, time) {
    if (this.active) this.age += dt * (this.age < READY_AT ? REVEAL_SPEED : 1);
    else this.lostFor += dt;
    this.apply(this.age, time, dt);
    this.prevAge = this.age;
  }

  // Fire `fn` once when the timeline crosses `t`.
  cue(t, fn) {
    if (this.active && this.prevAge < t && this.age >= t) fn();
  }

  // Cartoon entrance of letter i: tremble flat, crouch, leap out with its own
  // trick, land with a squash. Returns offsets from the letter's rest pose.
  letterPose(i, a, time) {
    const p = { x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0, sx: 1, sy: 1, sz: 1 };
    const u = a - (T_LETTERS + i * LETTER_GAP);
    if (u < 0) { // still printed: trembling
      const k = smooth(a / 0.3);
      p.sz = 0.02;
      p.rz = Math.sin(time * 45 + i * 2) * 0.035 * k;
      p.y = Math.sin(time * 38 + i) * 0.004 * k;
      return p;
    }
    if (u < CROUCH) { // grows out of the paper while crouching
      const k = u / CROUCH;
      p.sz = 0.02 + 0.98 * k;
      p.sy = 1 - 0.22 * k;
      p.sx = 1 + 0.12 * k;
      return p;
    }
    const f = (u - CROUCH) / FLY;
    if (f < 1) {
      const arc = Math.sin(Math.PI * f);
      const v = Math.abs(Math.cos(Math.PI * f)); // fast at take-off and landing -> stretch
      p.y = arc * 0.24;
      p.z = arc * 0.38;
      p.sy = 1 + 0.22 * v;
      p.sx = 1 - 0.1 * v;
      const turn = easeInOut(f) * Math.PI * 2;
      switch (LETTER_MOVES[i]) {
        case "roll": p.rz = -turn; break;
        case "flip": p.rx = -turn; break;
        case "spin": p.ry = turn; break;
        case "cartwheel": p.rz = turn; p.x = Math.sin(Math.PI * 2 * f) * 0.06; break;
        case "pogo": {
          const b = Math.abs(Math.sin(Math.PI * 2 * f));
          const vv = Math.abs(Math.cos(Math.PI * 2 * f));
          p.y = b * 0.16;
          p.z = b * 0.22;
          p.sy = 1 + 0.3 * vv;
          p.sx = 1 - 0.12 * vv;
          break;
        }
      }
      return p;
    }
    const s = u - CROUCH - FLY; // landed: springy wobble
    const w = Math.exp(-s * 6) * Math.cos(s * 20);
    p.sy = 1 - 0.28 * w;
    p.sx = 1 + 0.16 * w;
    return p;
  }

  apply(a, time, dt = 0) {
    // Timed events.
    if (this.timers.length) {
      const due = this.timers.filter((t) => a >= t.at);
      if (due.length) {
        this.timers = this.timers.filter((t) => a < t.at);
        due.forEach((t) => t.fn());
      }
    }

    // --- Act 1: the print wakes up -------------------------------------
    this.cue(0.02, () => sfx.rumble());
    this.veil.material.opacity = PRINT_FADE * smooth((a - T_LETTERS) / 0.8);

    // --- Act 2: the pill pops, ORS jumps out, the "O" squirts oil ------
    const pu = a - T_PILL;
    let pillSz = 0.02, pillY = 0, pillSy = 1;
    if (pu < 0) {
      pillY = Math.sin(time * 40) * 0.003 * smooth(a / 0.3);
    } else {
      pillSz = Math.max(0.02, easeOutBack(pu / 0.3));
      pillY = Math.sin(Math.PI * clamp01(pu / 0.4)) * 0.06;
      const s = Math.max(0, pu - 0.4);
      pillSy = 1 - 0.18 * Math.exp(-s * 7) * Math.cos(s * 22) * (pu > 0.4 ? 1 : 0);
    }
    this.pill.scale.set(1 / Math.sqrt(pillSy), pillSy, pillSz);
    this.pill.position.y = this.pill.userData.baseY + pillY;
    this.cue(T_PILL, () => { sfx.bloop(0); this.emitDust(20, new THREE.Vector3(px(345, 78).x, px(345, 78).y, 0.05), 0.5, 0.6); });
    const pillFront = this.pill.userData.depth * pillSz;
    this.ors.forEach((m, j) => {
      const t0 = T_PILL + 0.1 + j * 0.07;
      const u = a - t0;
      const f = clamp01(u / 0.35);
      m.scale.z = u < 0 ? 0.02 : Math.max(0.02, easeOutBack(u / 0.15));
      const land = Math.max(0, u - 0.35);
      const w = u > 0.35 ? Math.exp(-land * 7) * Math.cos(land * 22) : 0;
      m.scale.x = 1 + 0.15 * w;
      m.scale.y = 1 - 0.25 * w;
      m.position.y = m.userData.baseY + pillY + (u > 0 ? Math.sin(Math.PI * f) * 0.08 : 0);
      m.position.z = pillFront - 0.002 + (u > 0 ? Math.sin(Math.PI * f) * 0.06 : 0);
      m.rotation.y = j === 1 && u > 0 ? easeInOut(f) * Math.PI * 2 : 0; // the R twirls
      this.cue(t0, () => sfx.pop(5 + j));
    });
    this.orsTm.visible = a > T_PILL + 0.3;
    this.orsTm.position.z = pillFront + 0.001;
    this.cue(T_PILL + 0.5, () => this.squirt());

    // --- Act 3: the letters leap out one by one ------------------------
    this.letters.forEach((m, i) => {
      const p = this.letterPose(i, a, time);
      const t0 = T_LETTERS + i * LETTER_GAP;
      this.cue(t0 + CROUCH, () => sfx.letter(i));
      this.cue(t0 + CROUCH + FLY, () => {
        sfx.pop(i + 2);
        const at = this.toRoot(m);
        at.y -= m.userData.halfH;
        this.emitDust(10, at, 0.12, 0.5);
      });
      // Tap jump / landing dip on top of the entrance pose.
      const fx = this.letterFx[i];
      let y = 0, sx = 1, sy = 1, rot = 0;
      if (fx.jump > 0) {
        fx.jump = Math.max(0, fx.jump - dt / 0.6);
        const t = 1 - fx.jump;
        y = Math.sin(Math.PI * t) * 0.07;
        rot = Math.sin(Math.PI * 2 * t) * 0.18;
        const s = Math.sin(Math.PI * t) * 0.12;
        sx = 1 - s * 0.5; sy = 1 + s;
      }
      if (fx.dip > 0) {
        fx.dip = Math.max(0, fx.dip - dt / 0.35);
        const s = Math.sin(Math.PI * (1 - fx.dip));
        y -= s * 0.015;
        sy *= 1 - s * 0.15;
        sx *= 1 + s * 0.06;
      }
      sx *= p.sx;
      sy *= p.sy;
      m.scale.set(sx, sy, p.sz);
      // Squash from the feet, not the middle.
      m.position.set(
        m.userData.baseX + p.x,
        m.userData.baseY + p.y + y + (sy - 1) * m.userData.halfH,
        p.z,
      );
      m.rotation.set(p.rx, p.ry, p.rz + rot);
    });
    this.tm.scale.z = Math.max(0.02, easeOutBack((a - (T_LETTERS + 8 * LETTER_GAP)) / 0.25));

    // --- Act 4: the sprig grows and the olives pop like popcorn --------
    this.stems.forEach((s, i) => {
      const k = clamp01((a - 1.3 - i * 0.06) / 0.35);
      s.geometry.setDrawRange(0, Math.floor((s.userData.count * k) / 3) * 3);
    });
    this.olives.forEach((m, i) => this.updateOlive(m, i, a, time, dt));
    this.leaves.forEach((l, i) => {
      const k = easeOutBack((a - 1.6 - i * 0.08) / 0.4);
      l.pivot.scale.setScalar(Math.max(0.001, k));
      l.leaf.rotation.x = Math.sin(time * 1.7 + i * 2) * 0.12 * clamp01(a - READY_AT);
    });

    // --- Act 5: finale — lift off, stadium wave, confetti --------------
    this.cue(T_FINALE, () => {
      sfx.chime();
      this.emitDust(70, new THREE.Vector3(0, 0, 0.08), 1.1);
      this.wave(true);
    });
    this.cue(T_FINALE + 0.6, () => this.celebrate(45));
    const wreathGrow = (a - (T_FINALE - 0.3)) / 1.0;
    this.wreath.forEach((b) => b.update(wreathGrow, time));
    this.cue(T_FINALE - 0.3, () => sfx.whoosh());
    this.cue(T_FINALE + 0.05, () => sfx.whoosh());
    // Zoom: rockets up off the page with a swing, overshoots, settles bigger than the print.
    const zt = (a - T_FINALE) / ZOOM_TIME;
    const lift = smooth(zt);
    const pop = easeOutBack(zt);
    const float = Math.sin(time * 1.4) * 0.01 * lift;
    this.logo.position.z = ZOOM_LIFT * pop + float;
    this.logo.scale.setScalar(1 + (ZOOM_SCALE - 1) * pop);
    const swing = Math.sin(Math.PI * clamp01(zt)) * 0.9 * (1 - clamp01(zt) * 0.3);
    let spinY = 0;
    if (this.spin) {
      this.spin.t += dt / 1.1;
      spinY = easeInOut(this.spin.t) * Math.PI * 2;
      if (this.spin.t >= 1) this.spin = null;
    }
    const sway = this.gameMode ? 0.4 : 1; // calmer during the game
    this.logo.rotation.x = Math.sin(time * 0.7) * 0.12 * lift * sway - swing * 0.25;
    this.logo.rotation.y = Math.sin(time * 0.5) * 0.18 * lift * sway + spinY + swing;
    this.shadow.material.opacity = 0.3 * lift;
    this.shadow.position.set(0.04 * lift, -0.06 * lift, 0.001);
    this.shadow.scale.setScalar(1 + 0.3 * lift + float);

    // --- Idle: drop + glint, olive hops, waves -------------------------
    if (this.active && !this.gameMode && a > READY_AT) {
      if (a > this.nextDrop) {
        this.startDrop();
        this.nextDrop = a + 5.5;
      }
      if (a > this.nextHop) {
        this.startHop(0);
        this.nextHop = a + 13;
      }
      if (a > this.nextWave) {
        this.wave(false);
        this.nextWave = a + 13;
      }
    }
    this.updateDrop(dt);
    this.letters.forEach((m) => {
      const d = this.shimmerX === null ? 1 : m.position.x - this.shimmerX;
      m.material.emissiveIntensity = Math.exp(-(d * d) / 0.004) * 0.4;
    });
    if (this.shimmerX !== null) {
      this.shimmerX += dt * 1.4;
      if (this.shimmerX > 0.8) this.shimmerX = null;
    }

    this.updateParticles(dt);
  }

  updateOlive(m, i, a, time, dt) {
    const fx = this.oliveFx[i];
    const r = m.userData.r;
    const t0 = T_OLIVES + i * OLIVE_GAP;
    const u = a - t0;
    const landAt = 0.1 + OLIVE_FLY;
    const entering = u < landAt + 0.6;

    // Inflate from the flat print.
    const k = u < 0 ? 0.02 : Math.min(1, 0.02 + 0.98 * (u / 0.12));
    const breathe = 1 + Math.sin(time * 2 + i) * 0.015 * clamp01(a - READY_AT);
    let sx = 1, sy = 1;
    if (fx.squash > 0) {
      fx.squash = Math.max(0, fx.squash - dt * 3.5);
      const s = Math.sin(fx.squash * Math.PI) * 0.22;
      sx = 1 + s; sy = 1 - s;
    }
    let rotY = fx.look;

    if (entering) {
      m.position.copy(fx.home);
      m.position.z = THREE.MathUtils.lerp(0.003, fx.home.z, k);
      m.rotation.z = fx.tilt;
      if (u < 0) {
        m.rotation.z = fx.tilt + Math.sin(time * 42 + i * 3) * 0.06 * smooth(a / 0.3); // trembling
      } else if (u > 0.1 && u < landAt) { // popcorn!
        const f = (u - 0.1) / OLIVE_FLY;
        const arc = Math.sin(Math.PI * f);
        m.position.y += arc * 0.13;
        m.position.z += arc * 0.3;
        m.position.x += Math.sin(Math.PI * f) * (i === 0 ? -0.04 : 0.04);
        rotY = easeInOut(f) * Math.PI * 2;
        m.rotation.z = fx.tilt + easeInOut(f) * Math.PI * 2 * (i % 2 ? 1 : -1);
        const v = Math.abs(Math.cos(Math.PI * f));
        sy *= 1 + 0.2 * v; sx *= 1 - 0.1 * v;
      } else if (u >= landAt) {
        const s = u - landAt;
        const w = Math.exp(-s * 7) * Math.cos(s * 22);
        sy *= 1 - 0.3 * w; sx *= 1 + 0.2 * w;
      }
      this.cue(t0 + 0.1, () => sfx.bloop(i + 1));
      this.cue(t0 + landAt, () => {
        sfx.boing(i + 2);
        this.emitDust(8, this.toRoot(m), 0.06, 0.5);
        if (i === this.olives.length - 1) this.later(0.35, () => sfx.giggle());
      });
    } else if (fx.flip > 0) {
      fx.flip = Math.max(0, fx.flip - dt / 0.7);
      rotY = easeInOut(1 - fx.flip) * Math.PI * 2;
    }

    m.scale.set(r.x * breathe * sx, r.y * breathe * sy, Math.max(0.0005, r.z * k));
    m.visible = true;

    // Hopping across the letters (idle).
    if (!entering && fx.hop) {
      const h = fx.hop;
      const stop = h.stops[h.seg];
      const last = h.seg === h.stops.length - 1;
      h.t += dt / (last ? 0.7 : 0.42);
      const t = clamp01(h.t);
      m.position.lerpVectors(h.from, stop.pos, t);
      m.position.y += Math.sin(Math.PI * t) * (last ? 0.16 : 0.08);
      m.position.z += Math.sin(Math.PI * t) * 0.05;
      m.rotation.z = fx.tilt * (1 - t) + Math.sin(Math.PI * t) * (last ? 1.2 : 0.4);
      fx.look = stop.pos.x < h.from.x ? -0.5 : 0.5;
      rotY = fx.look;
      if (h.t >= 1) {
        fx.squash = 1;
        if (stop.letter !== null) {
          this.letterFx[stop.letter].dip = 1;
          sfx.boing(h.seg);
          this.emitDust(5, this.toRoot(m), 0.04, 0.4);
        } else {
          sfx.giggle();
        }
        h.from = stop.pos.clone();
        h.seg++;
        h.t = 0;
        if (h.seg >= h.stops.length) {
          fx.hop = null;
          fx.look = 0;
          m.position.copy(fx.home);
          m.rotation.z = fx.tilt;
        }
      }
    } else if (!entering) {
      m.position.copy(fx.home);
      m.position.z += Math.sin(time * 2.4 + i * 1.7) * 0.004; // idle bob
      fx.look *= 1 - Math.min(1, dt * 3);
    }
    m.rotation.y = rotY;

    // Face: opens its eyes on landing, winks, then blinks and looks around.
    const face = fx.face;
    const faceAt = t0 + landAt + 0.15;
    const fk = easeOutBack((a - faceAt) / 0.35);
    face.scale.setScalar(Math.max(0.001, fk));
    face.visible = fk > 0.01;
    if (time > fx.blinkAt) fx.blinkAt = time + rand(2, 5);
    const blink = fx.blinkAt - time < 0.12 ? 0.12 : 1;
    const wink = a > faceAt + 0.35 && a < faceAt + 0.75;
    face.userData.eyes.forEach((e, j) => { e.scale.y = wink && j === 1 ? 0.12 : blink; });
    const lookX = Math.sin(time * 0.6 + i * 2) * 0.05 + fx.look * 0.08;
    face.userData.pupils.forEach((p) => { p.position.x = lookX; p.position.y = Math.sin(time * 0.45 + i) * 0.03; });
    face.userData.mouth.scale.set(1, fx.hop || fx.flip || wink ? 1.5 : 1, 1); // big grin while playing
  }

  updateDrop(dt) {
    const s = this.dropState;
    if (!s) { this.drop.visible = false; return; }
    const front = this.pill.userData.depth + 0.05;
    s.t += dt;
    this.drop.visible = true;
    if (s.phase === "form") {
      // Swells at the tip of the logo's drop, wobbling like a bead of oil.
      const k = smooth(s.t / 0.9);
      const size = 0.075 * k;
      const wob = 1 + Math.sin(s.t * 18) * 0.06 * (1 - k);
      this.drop.scale.set(size * wob, (size * (1 + 0.25 * k)) / wob, size * wob);
      this.drop.position.set(s.x, s.y - size * 0.4, front);
      if (s.t > 1.05) { s.phase = "fall"; s.t = 0; }
    } else {
      s.vy -= 2.2 * dt;
      this.drop.position.y += s.vy * dt;
      this.drop.position.z = front + 0.03 + s.t * 0.05;
      const stretch = 1 + Math.min(0.6, -s.vy * 0.5);
      this.drop.scale.set(0.075 / Math.sqrt(stretch), 0.09 * stretch, 0.075 / Math.sqrt(stretch));
      if (this.drop.position.y < px(0, LAND_Y).y) {
        sfx.drip();
        this.emitDust(26, this.toRoot(this.drop), 0.08);
        this.shimmerX = -0.65;
        this.dropState = null;
        this.drop.visible = false;
      }
    }
  }

  updateParticles(dt) {
    const pos = this.dustGeo.attributes.position.array;
    this.dust.forEach((d, i) => {
      if (d.life < d.max) {
        d.life += dt;
        d.v.y -= 0.15 * dt;
        d.p.addScaledVector(d.v, dt);
        pos.set([d.p.x, d.p.y, d.p.z], i * 3);
      } else {
        pos.set([0, 0, -10], i * 3);
      }
    });
    this.dustGeo.attributes.position.needsUpdate = true;

    for (let i = this.squirts.length - 1; i >= 0; i--) {
      const q = this.squirts[i];
      q.v.y -= 1.8 * dt;
      q.mesh.position.addScaledVector(q.v, dt);
      q.mesh.rotation.z = Math.atan2(-q.v.x, q.v.y) * 0.6; // point along the flight
      if (q.mesh.position.y < -ASPECT / 2 - 0.05) {
        this.emitDust(3, this.root.worldToLocal(q.mesh.getWorldPosition(new THREE.Vector3())), 0.02, 0.3);
        this.logo.remove(q.mesh);
        this.squirts.splice(i, 1);
      }
    }

    for (let i = this.confetti.length - 1; i >= 0; i--) {
      const c = this.confetti[i];
      c.life += dt;
      c.v.y -= 0.35 * dt;
      c.v.multiplyScalar(1 - dt * 0.6); // air drag: flutter down
      c.mesh.position.addScaledVector(c.v, dt);
      c.mesh.position.x += Math.sin(c.life * 5 + i) * 0.002;
      c.mesh.rotation.x += c.spin.x * dt;
      c.mesh.rotation.y += c.spin.y * dt;
      c.mesh.rotation.z += c.spin.z * dt;
      if (c.life > c.max) {
        this.root.remove(c.mesh);
        this.confetti.splice(i, 1);
      }
    }
  }
}

// ---------- Mini-game: catch the oil ----------

class DropGame {
  constructor(show) {
    this.show = show;
    this.running = false;
    this.drops = [];
    try { this.best = Number(localStorage.getItem("ors-ar-best")) || 0; } catch { this.best = 0; }
  }

  start() {
    if (this.running) return;
    const s = this.show;
    if (!s.ready) { s.age = Math.max(s.age, READY_AT + 0.1); s.prevAge = s.age; } // skip the reveal if needed
    this.running = true;
    this.score = 0;
    this.combo = 0;
    this.time = GAME.seconds;
    this.elapsed = 0;
    this.spawnIn = 0.6;
    this.lastSecond = GAME.seconds;
    s.gameMode = true;
    $("cta").hidden = true;
    $("hud").hidden = false;
    $("combo").hidden = true;
    this.renderHud();
    sfx.chime();
  }

  renderHud(bump) {
    $("score").textContent = this.score;
    $("timer").textContent = Math.ceil(this.time);
    $("bottleFill").style.height = `${Math.min(100, (this.score / 25) * 100)}%`;
    if (bump) {
      const el = $("score").parentElement;
      el.classList.remove("bump");
      void el.offsetWidth;
      el.classList.add("bump");
    }
  }

  spawn() {
    const s = this.show;
    const bonus = Math.random() < 0.13;
    const mesh = new THREE.Mesh(s.dropGeo, bonus ? s.bonusMat : s.goldMat);
    const size = bonus ? 0.1 : 0.07;
    mesh.scale.set(size, size * 1.25, size);
    mesh.position.set(rand(-0.42, 0.42), ASPECT / 2 + 0.12, rand(0.14, 0.2));
    s.logo.add(mesh);
    this.drops.push({ mesh, bonus, vy: -rand(0.05, 0.12), age: 0, size });
  }

  tap(p) {
    const hit = this.show.pick(p, this.drops.map((d) => ({ obj: d.mesh, radius: 0.9, data: d })));
    if (hit) this.caught(hit);
    else { this.combo = 0; $("combo").hidden = true; }
  }

  caught(d) {
    const s = this.show;
    this.combo++;
    this.score += d.bonus ? 3 : 1;
    if (d.bonus) sfx.bonus(); else sfx.catch(this.combo);
    if (navigator.vibrate) navigator.vibrate(12);
    s.emitDust(d.bonus ? 30 : 14, s.toRoot(d.mesh), 0.05, d.bonus ? 1.4 : 0.9);
    this.remove(d);
    if (this.combo >= 3) {
      $("combo").textContent = `${this.combo}× combo!`;
      $("combo").hidden = false;
      $("combo").style.animation = "none";
      void $("combo").offsetWidth;
      $("combo").style.animation = "";
    }
    if (this.combo % 5 === 0) s.cheer();
    this.renderHud(true);
  }

  remove(d) {
    this.show.logo.remove(d.mesh);
    this.drops.splice(this.drops.indexOf(d), 1);
  }

  update(dt) {
    if (!this.running || !this.show.active) return; // pause while the logo is out of view
    this.elapsed += dt;
    this.time -= dt;
    const progress = clamp01(this.elapsed / GAME.seconds);

    this.spawnIn -= dt;
    if (this.spawnIn <= 0) {
      this.spawn();
      if (progress > 0.5 && Math.random() < 0.35) this.spawn(); // double drops later on
      this.spawnIn = 0.85 - 0.4 * progress;
    }

    const bottom = -ASPECT / 2 - 0.1;
    for (const d of [...this.drops]) {
      d.age += dt;
      d.vy -= (0.12 + 0.25 * progress) * dt;
      d.mesh.position.y += d.vy * dt;
      d.mesh.rotation.z = Math.sin(d.age * 6) * 0.15;
      if (d.bonus) d.mesh.rotation.y += dt * 4;
      if (d.mesh.position.y < bottom) {
        sfx.splat();
        this.show.emitDust(6, this.show.toRoot(d.mesh), 0.04, 0.3);
        this.combo = 0;
        $("combo").hidden = true;
        this.remove(d);
      }
    }

    const sec = Math.ceil(this.time);
    if (sec !== this.lastSecond) {
      this.lastSecond = sec;
      if (sec <= 5 && sec > 0) sfx.tick();
      this.renderHud();
    }
    if (this.time <= 0) this.end();
  }

  end() {
    this.running = false;
    for (const d of [...this.drops]) this.remove(d);
    const s = this.show;
    s.gameMode = false;
    s.nextDrop = s.age + 4;
    $("hud").hidden = true;

    const newBest = this.score > this.best;
    if (newBest) {
      this.best = this.score;
      try { localStorage.setItem("ors-ar-best", String(this.best)); } catch { /* ignore */ }
    }
    $("resultScore").textContent = this.score;
    $("resultTitle").textContent = GAME.titles.find(([min]) => this.score >= min)[1];
    $("resultBest").textContent = newBest && this.score > 0 ? "New personal best!" : `Your best: ${this.best}`;
    $("result").hidden = false;

    s.celebrate(this.score >= 15 ? 140 : 80);
    s.spinLogo();
    sfx.fanfare();
  }
}

// ---------- Hair Match: 3 questions -> a personal ORS Olive Oil ritual ----------

function loadImg(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

// Draw `text` wrapped to `maxW`; returns the y after the last line.
function wrapText(g, text, x, y, maxW, lineH) {
  let line = "";
  for (const word of text.split(" ")) {
    const test = line ? `${line} ${word}` : word;
    if (g.measureText(test).width > maxW && line) {
      g.fillText(line, x, y);
      line = word;
      y += lineH;
    } else {
      line = test;
    }
  }
  if (line) g.fillText(line, x, y);
  return y + lineH;
}

class HairMatch {
  constructor(show) {
    this.show = show;
    this.routine = null;
    $("quizClose").onclick = () => { $("quiz").hidden = true; $("cta").hidden = false; };
    $("routineClose").onclick = () => { $("routine").hidden = true; $("cta").hidden = false; };
    $("routineSave").onclick = () => this.save();
  }

  start() {
    this.answers = {};
    this.labels = {};
    this.i = 0;
    $("cta").hidden = true;
    $("quiz").hidden = false;
    this.show.cheer();
    sfx.bloop(1);
    this.render();
  }

  render() {
    const q = QUESTIONS[this.i];
    const bubble = $("quizQ");
    bubble.textContent = q.olive;
    bubble.style.animation = "none";
    void bubble.offsetWidth;
    bubble.style.animation = "";
    $("quizStep").textContent = `Question ${this.i + 1} of ${QUESTIONS.length}`;
    const opts = $("quizOpts");
    opts.replaceChildren();
    q.options.forEach((o, k) => {
      const b = document.createElement("button");
      b.className = "opt";
      b.style.animationDelay = `${k * 0.05}s`;
      const icon = document.createElement("span");
      icon.textContent = o.emoji;
      b.append(icon, o.label);
      b.onclick = () => this.pick(q, o, b);
      opts.append(b);
    });
  }

  pick(q, o, button) {
    if (this.busy) return;
    this.busy = true;
    button.classList.add("picked");
    this.answers[q.id] = o.id;
    this.labels[q.id] = o.label;
    sfx.pop(this.i + 3);
    this.show.cheer();
    if (navigator.vibrate) navigator.vibrate(10);
    setTimeout(() => {
      this.busy = false;
      this.i++;
      if (this.i < QUESTIONS.length) this.render();
      else this.finish();
    }, 280);
  }

  finish() {
    $("quiz").hidden = true;
    const r = matchRoutine(this.answers);
    this.routine = r;
    const title = [this.labels.type, this.labels.concern, this.labels.style].join(" · ");
    $("routineTitle").textContent = title;
    $("routineFocus").textContent = r.focus;
    const list = $("routineSteps");
    list.replaceChildren();
    for (const step of r.steps) {
      const li = document.createElement("li");
      const b = document.createElement("b");
      b.textContent = step.title;
      const a = document.createElement("span");
      a.className = "prod";
      a.textContent = `ORS ${step.product.name}`;
      const how = document.createElement("small");
      how.textContent = step.how;
      li.append(b, a, how);
      list.append(li);
    }
    const params = new URLSearchParams(this.answers).toString();
    $("routineCoach").href = `ritual.html?${params}`;
    try { localStorage.setItem("ors-ar-routine", JSON.stringify({ answers: this.answers, labels: this.labels })); } catch { /* ignore */ }
    $("routine").hidden = false;
    this.show.celebrate(50);
    sfx.fanfare();
  }

  // A shareable "my ritual" card image.
  async save() {
    const r = this.routine;
    if (!r) return;
    const W = 1080, H = 1500;
    const c = document.createElement("canvas");
    c.width = W;
    c.height = H;
    const g = c.getContext("2d");
    const bg = g.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, "#2f6b3c");
    bg.addColorStop(1, "#123a20");
    g.fillStyle = bg;
    g.fillRect(0, 0, W, H);

    g.fillStyle = "#fffdf5";
    g.beginPath();
    g.roundRect(60, 60, W - 120, H - 120, 48);
    g.fill();
    try {
      const logo = await loadImg("targets/logo.png");
      const lw = 300, lh = (lw * logo.height) / logo.width;
      g.drawImage(logo, (W - lw) / 2, 100, lw, lh);
    } catch { /* optional */ }

    g.textAlign = "center";
    g.fillStyle = "#a51f36";
    g.font = "800 58px system-ui, -apple-system, Segoe UI, Roboto, sans-serif";
    g.fillText("My hair ritual", W / 2, 420);
    g.fillStyle = "#4a5a3e";
    g.font = "500 32px system-ui, -apple-system, Segoe UI, Roboto, sans-serif";
    g.fillText([this.labels.type, this.labels.concern, this.labels.style].join("  ·  "), W / 2, 475);

    g.textAlign = "left";
    g.fillStyle = "#eef4e4";
    g.beginPath();
    g.roundRect(120, 515, W - 240, 130, 24);
    g.fill();
    g.fillStyle = "#2c4a1c";
    g.font = "500 28px system-ui, -apple-system, Segoe UI, Roboto, sans-serif";
    wrapText(g, r.focus, 150, 565, W - 300, 38);

    let y = 720;
    r.steps.forEach((step, i) => {
      g.fillStyle = "#1e5631";
      g.beginPath();
      g.arc(150, y - 12, 30, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = "#fff";
      g.textAlign = "center";
      g.font = "800 30px system-ui, sans-serif";
      g.fillText(String(i + 1), 150, y - 1);
      g.textAlign = "left";
      g.fillStyle = "#a51f36";
      g.font = "800 24px system-ui, sans-serif";
      g.fillText(step.title.toUpperCase(), 205, y - 22);
      g.fillStyle = "#1e2a16";
      g.font = "700 32px system-ui, sans-serif";
      const next = wrapText(g, `ORS ${step.product.name}`, 205, y + 16, W - 330, 38);
      g.fillStyle = "#6b7b5e";
      g.font = "400 26px system-ui, sans-serif";
      y = wrapText(g, step.how, 205, next - 4, W - 330, 32) + 34;
    });

    g.textAlign = "center";
    g.fillStyle = "#1e5631";
    g.font = "600 28px system-ui, sans-serif";
    g.fillText("Scan the ORS Olive Oil logo to start your ritual", W / 2, H - 110);

    c.toBlob((blob) => shareFile(blob, "my-ors-olive-oil-ritual.png"), "image/png");
  }
}

init();
