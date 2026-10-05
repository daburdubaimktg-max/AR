// Logo AR — point the camera at the brand logo and it comes to life.
// Image tracking: MindAR (https://github.com/hiukim/mind-ar-js), rendering: three.js.
import * as THREE from "three";

const MINDAR_THREE = "https://cdn.jsdelivr.net/npm/mind-ar@1.2.5/dist/mindar-image-three.prod.js";
const MINDAR_IMAGE = "https://cdn.jsdelivr.net/npm/mind-ar@1.2.5/dist/mindar-image.prod.js";

// ---------- Brand config: edit these ----------
const BRAND = {
  name: "ORS Olive Oil",
  tagline: "Nourished by Olive Oil",
  ctaText: "Shop now",
  ctaUrl: "https://www.google.com/search?q=ORS+Olive+Oil",
  // Pre-built tracking target. If this file exists the app skips the
  // "choose logo image" step. Its width/height ratio goes in logoAspect.
  targetSrc: "targets/logo.mind",
  logoAspect: 570 / 708,
  colors: {
    gold: 0xe8b923, red: "#a51f36", leaf: 0x3f7a2c, leafDark: 0x1e5631, stem: 0x5d4a2a, olive: 0x9cb83a,
  },
  // Spots on the logo, in logo units (width 1, origin at centre, y up).
  dropSpot: { x: 258 / 708 - 0.5, y: (0.5 - 60 / 570) * (570 / 708) },   // the drop in the ORS "O"
  oliveSpot: { x: 527 / 708 - 0.5, y: (0.5 - 410 / 570) * (570 / 708) }, // the olive sprig
};

const SAVED_KEY = "ors-ar-target-v1";
const $ = (id) => document.getElementById(id);

// ---------- Setup: find or build a tracking target ----------

function bufToB64(buf) {
  const bytes = new Uint8Array(buf);
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}
function b64ToBuf(b64) {
  const s = atob(b64);
  const bytes = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) bytes[i] = s.charCodeAt(i);
  return bytes.buffer;
}
function loadSaved() {
  try { return JSON.parse(localStorage.getItem(SAVED_KEY)); } catch { return null; }
}
function save(buf, aspect) {
  try { localStorage.setItem(SAVED_KEY, JSON.stringify({ data: bufToB64(buf), aspect })); } catch { /* quota/private mode */ }
}

function showError(msg) {
  const el = $("setupError");
  el.textContent = msg;
  el.hidden = false;
}

async function init() {
  $("brandTitle").textContent = BRAND.name;
  $("shopBtn").textContent = BRAND.ctaText;
  $("shopBtn").href = BRAND.ctaUrl;

  let prebuilt = false;
  try { prebuilt = (await fetch(BRAND.targetSrc, { method: "HEAD" })).ok; } catch { /* offline */ }

  if (prebuilt) {
    $("startBtn").hidden = false;
    $("startBtn").onclick = () => start(BRAND.targetSrc, BRAND.logoAspect);
    return;
  }

  $("trainBox").hidden = false;
  const saved = loadSaved();
  if (saved) {
    $("useSavedBtn").hidden = false;
    $("useSavedBtn").onclick = () => {
      const url = URL.createObjectURL(new Blob([b64ToBuf(saved.data)]));
      start(url, saved.aspect);
    };
  }
  $("logoFile").addEventListener("change", (e) => {
    const file = e.target.files && e.target.files[0];
    if (file) trainFromFile(file);
    e.target.value = "";
  });
}

async function trainFromFile(file) {
  $("setupError").hidden = true;
  $("trainBox").hidden = true;
  $("progress").hidden = false;
  try {
    const img = await loadImage(URL.createObjectURL(file));
    const aspect = img.naturalHeight / img.naturalWidth;
    const { Compiler } = await import(MINDAR_IMAGE);
    const compiler = new Compiler();
    await compiler.compileImageTargets([img], (p) => {
      $("progressFill").style.width = `${Math.min(100, p).toFixed(0)}%`;
    });
    const buf = await compiler.exportData();
    save(buf, aspect);
    start(URL.createObjectURL(new Blob([buf])), aspect);
  } catch (err) {
    console.error(err);
    $("progress").hidden = true;
    $("trainBox").hidden = false;
    showError("Couldn't learn that image. Try a sharper, more detailed photo of the logo.");
  }
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

// ---------- AR session ----------

async function start(targetSrc, aspect) {
  $("progress").hidden = false;
  $("progressText").textContent = "Starting camera…";
  $("progressFill").style.width = "100%";

  let MindARThree;
  try {
    ({ MindARThree } = await import(MINDAR_THREE));
  } catch (err) {
    console.error(err);
    showError("Couldn't load the AR engine. Check your connection and reload.");
    return;
  }

  const mindar = new MindARThree({
    container: $("ar"),
    imageTargetSrc: targetSrc,
    uiScanning: "no",
    uiLoading: "no",
    filterMinCF: 0.0001,
    filterBeta: 0.001,
  });
  const { renderer, scene, camera } = mindar;

  scene.add(new THREE.HemisphereLight(0xfff6dd, 0x334422, 1.6));
  const sun = new THREE.DirectionalLight(0xffffff, 1.4);
  sun.position.set(0.5, 1, 2);
  scene.add(sun);

  const anchor = mindar.addAnchor(0);
  const show = new LogoShow(aspect);
  anchor.group.add(show.root);

  anchor.onTargetFound = () => {
    show.found();
    $("hint").hidden = true;
    $("cta").hidden = false;
    if (navigator.vibrate) navigator.vibrate(30);
  };
  anchor.onTargetLost = () => {
    show.lost();
    $("hint").hidden = false;
  };

  // Tap anywhere: burst of oil drops.
  $("ar").addEventListener("pointerdown", () => show.burst());

  try {
    await mindar.start();
  } catch (err) {
    console.error(err);
    showError(window.isSecureContext
      ? "Camera unavailable. Allow camera access and reload."
      : "Camera needs HTTPS. Open this page over https://.");
    return;
  }
  $("setup").hidden = true;
  $("hint").hidden = false;

  const clock = new THREE.Clock();
  renderer.setAnimationLoop(() => {
    show.update(Math.min(clock.getDelta(), 0.05), clock.elapsedTime);
    renderer.render(scene, camera);
  });
}

// ---------- The animation that plays on the logo ----------
// Anchor space: logo is 1 unit wide, `aspect` tall, centred at the origin,
// +z points out of the logo towards the viewer.

const easeOutBack = (t) => 1 + 2.70158 * Math.pow(t - 1, 3) + 1.70158 * Math.pow(t - 1, 2);
const clamp01 = (t) => Math.max(0, Math.min(1, t));

// A halo: clear in the middle (so the logo stays crisp), glowing around it.
function haloTexture(color, clear) {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const g = c.getContext("2d");
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, clear);
  grad.addColorStop(0.58, clear);
  grad.addColorStop(0.74, color);
  grad.addColorStop(1, clear);
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}

function sparkleTexture() {
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const g = c.getContext("2d");
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, "rgba(255,250,220,1)");
  grad.addColorStop(0.25, "rgba(255,220,120,.8)");
  grad.addColorStop(1, "rgba(255,200,60,0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  g.fillStyle = "rgba(255,255,240,.9)";
  g.fillRect(30, 4, 4, 56);
  g.fillRect(4, 30, 56, 4);
  return new THREE.CanvasTexture(c);
}

function textTexture(text) {
  const c = document.createElement("canvas");
  c.width = 1024;
  c.height = 192;
  const g = c.getContext("2d");
  g.fillStyle = BRAND.colors.red;
  const r = 96;
  g.beginPath();
  g.roundRect(8, 8, c.width - 16, c.height - 16, r);
  g.fill();
  g.strokeStyle = "rgba(255,255,255,.9)";
  g.lineWidth = 6;
  g.stroke();
  g.fillStyle = "#ffffff";
  g.font = "bold 72px 'Helvetica Neue', Arial, sans-serif";
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillText(text, c.width / 2, c.height / 2 + 4, c.width - 120);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function leafGeometry() {
  const s = new THREE.Shape();
  s.moveTo(0, 0);
  s.quadraticCurveTo(0.05, 0.06, 0, 0.16);
  s.quadraticCurveTo(-0.05, 0.06, 0, 0);
  const geo = new THREE.ShapeGeometry(s, 8);
  return geo;
}

function dropGeometry() {
  // Teardrop: lathe a profile that's round at the bottom and pointed on top.
  const pts = [];
  for (let i = 0; i <= 16; i++) {
    const t = i / 16;
    const y = -Math.cos(t * Math.PI) * 0.5 + 0.5; // 0..1
    const r = Math.sin(t * Math.PI) * (1 - t * 0.75);
    pts.push(new THREE.Vector2(r * 0.5, y));
  }
  const geo = new THREE.LatheGeometry(pts, 20);
  geo.translate(0, -0.35, 0);
  return geo;
}

class Branch {
  constructor(side, aspect) {
    this.group = new THREE.Group();
    this.group.position.set(side * 0.48, -aspect * 0.3, 0.02);
    this.group.scale.x = side;

    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(0.1, 0.16, 0.08),
      new THREE.Vector3(0.14, 0.4, 0.12),
      new THREE.Vector3(0.06, 0.66, 0.1),
    ]);
    this.curve = curve;
    this.stem = new THREE.Mesh(
      new THREE.TubeGeometry(curve, 40, 0.008, 6, false),
      new THREE.MeshStandardMaterial({ color: BRAND.colors.stem, roughness: 0.8 }),
    );
    this.stemLen = this.stem.geometry.index.count;
    this.stem.geometry.setDrawRange(0, 0);
    this.group.add(this.stem);

    const leafGeo = leafGeometry();
    const leafMats = [
      new THREE.MeshStandardMaterial({ color: BRAND.colors.leaf, side: THREE.DoubleSide, roughness: 0.55 }),
      new THREE.MeshStandardMaterial({ color: BRAND.colors.leafDark, side: THREE.DoubleSide, roughness: 0.55 }),
    ];
    this.leaves = [];
    const n = 9;
    for (let i = 0; i < n; i++) {
      const t = 0.12 + (i / (n - 1)) * 0.85;
      const leaf = new THREE.Mesh(leafGeo, leafMats[i % 2]);
      const pivot = new THREE.Group();
      pivot.position.copy(curve.getPoint(t));
      const tangent = curve.getTangent(t);
      const base = Math.atan2(tangent.y, tangent.x) - Math.PI / 2;
      const out = i % 2 ? 1 : -1;
      pivot.rotation.z = base + out * 0.9;
      pivot.rotation.x = 0.35 * out;
      pivot.add(leaf);
      pivot.scale.setScalar(0);
      this.group.add(pivot);
      this.leaves.push({ pivot, t, size: 0.8 + Math.random() * 0.4 });
    }
    // Leaf at the very tip.
    const tip = new THREE.Group();
    tip.position.copy(curve.getPoint(1));
    const tt = curve.getTangent(1);
    tip.rotation.z = Math.atan2(tt.y, tt.x) - Math.PI / 2;
    tip.add(new THREE.Mesh(leafGeo, leafMats[0]));
    tip.scale.setScalar(0);
    this.group.add(tip);
    this.leaves.push({ pivot: tip, t: 1, size: 1 });

    const oliveGeo = new THREE.SphereGeometry(0.028, 16, 12);
    oliveGeo.scale(1, 1.3, 1);
    const oliveMat = new THREE.MeshStandardMaterial({ color: BRAND.colors.olive, roughness: 0.25, metalness: 0.1 });
    this.olives = [0.35, 0.6, 0.82].map((t, i) => {
      const m = new THREE.Mesh(oliveGeo, oliveMat);
      const p = curve.getPoint(t);
      m.position.set(p.x + (i % 2 ? 0.03 : -0.03), p.y - 0.035, p.z + 0.02);
      m.scale.setScalar(0);
      this.group.add(m);
      return { mesh: m, t };
    });
  }

  update(grow, time) {
    // grow: 0..1 how far the branch has grown.
    const g = clamp01(grow);
    this.stem.geometry.setDrawRange(0, Math.floor(this.stemLen * g / 3) * 3);
    for (const l of this.leaves) {
      const k = easeOutBack(clamp01((g - l.t * 0.85) / 0.2)) * l.size;
      l.pivot.scale.setScalar(Math.max(0, k));
    }
    for (const o of this.olives) {
      const k = easeOutBack(clamp01((g - 0.9 - o.t * 0.1) / 0.15));
      o.mesh.scale.setScalar(Math.max(0, k));
    }
    this.group.rotation.z = Math.sin(time * 1.3) * 0.04 * g;
    this.group.rotation.y = Math.sin(time * 0.9 + 1) * 0.06 * g;
  }
}

class LogoShow {
  constructor(aspect) {
    this.aspect = aspect;
    this.root = new THREE.Group();
    this.visible = 0;      // 0..1 appear/disappear
    this.target = 0;
    this.age = 0;          // seconds since found
    this.spawnTimer = 0;

    // Golden glow behind the logo.
    this.glow = new THREE.Mesh(
      new THREE.PlaneGeometry(1.9, aspect + 0.9),
      new THREE.MeshBasicMaterial({
        map: haloTexture("rgba(255,205,80,.85)", "rgba(255,190,40,0)"),
        transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      }),
    );
    this.glow.position.z = -0.01;
    this.root.add(this.glow);

    this.branches = [new Branch(-1, aspect), new Branch(1, aspect)];
    this.branches.forEach((b) => this.root.add(b.group));

    // Tagline banner above the logo.
    this.banner = new THREE.Mesh(
      new THREE.PlaneGeometry(1.1, 1.1 * 192 / 1024),
      new THREE.MeshBasicMaterial({ map: textTexture(BRAND.tagline), transparent: true, depthWrite: false }),
    );
    this.bannerY = -aspect / 2 - 0.16; // below the logo, clear of the falling drop
    this.root.add(this.banner);

    // Oil drops + ripples.
    this.dropGeo = dropGeometry();
    this.dropMat = new THREE.MeshStandardMaterial({
      color: BRAND.colors.gold, emissive: 0x6b4a00, metalness: 0.35, roughness: 0.12, transparent: true, opacity: 0.95,
    });
    this.drops = [];
    this.rippleGeo = new THREE.RingGeometry(0.85, 1, 40);
    this.ripples = [];

    this.oliveGeo = new THREE.SphereGeometry(0.045, 20, 14);
    this.oliveGeo.scale(1, 1.25, 1);
    this.oliveMat = new THREE.MeshStandardMaterial({
      color: BRAND.colors.olive, roughness: 0.3, metalness: 0.05, transparent: true,
    });
    this.olives = [];
    this.oliveTimer = 0.5;

    // Floating sparkles.
    const n = 70;
    const pos = new Float32Array(n * 3);
    this.sparkSeeds = [];
    for (let i = 0; i < n; i++) {
      this.sparkSeeds.push({
        x: (Math.random() - 0.5) * 1.6, y: (Math.random() - 0.5) * (aspect + 0.8),
        z: Math.random() * 0.4, speed: 0.05 + Math.random() * 0.12, phase: Math.random() * 6.28,
      });
    }
    this.sparkGeo = new THREE.BufferGeometry();
    this.sparkGeo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    this.sparks = new THREE.Points(this.sparkGeo, new THREE.PointsMaterial({
      map: sparkleTexture(), size: 0.06, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    }));
    this.root.add(this.sparks);

    this.root.scale.setScalar(0.0001);
  }

  found() {
    if (this.target === 0 && this.visible < 0.05) this.age = 0; // replay the grow-in
    this.target = 1;
  }

  lost() { this.target = 0; }

  burst() {
    if (this.target === 0) return;
    for (let i = 0; i < 8; i++) {
      this.spawnDrop((Math.random() - 0.5) * 0.8, (Math.random() - 0.5) * this.aspect * 0.8, Math.random() * 0.4);
    }
    for (let i = 0; i < 3; i++) this.spawnOlive();
  }

  spawnDrop(x, floor, delayY = 0, size = 0.06 + Math.random() * 0.03) {
    const m = new THREE.Mesh(this.dropGeo, this.dropMat);
    m.scale.setScalar(size);
    m.position.set(x, this.aspect / 2 + 0.55 + delayY, 0.04);
    this.root.add(m);
    this.drops.push({ mesh: m, vy: 0, floor });
  }

  // An olive pops out of the logo's olive sprig towards the viewer.
  spawnOlive() {
    const m = new THREE.Mesh(this.oliveGeo, this.oliveMat.clone());
    const o = BRAND.oliveSpot;
    m.position.set(o.x + (Math.random() - 0.5) * 0.08, o.y + (Math.random() - 0.5) * 0.12, 0.02);
    m.rotation.set(Math.random(), Math.random(), Math.random());
    this.root.add(m);
    this.olives.push({
      mesh: m, life: 0,
      v: new THREE.Vector3(0.12 + Math.random() * 0.15, 0.05 + Math.random() * 0.12, 0.35 + Math.random() * 0.2),
      spin: (Math.random() - 0.5) * 4,
    });
  }

  spawnRipple(x, y) {
    const m = new THREE.Mesh(this.rippleGeo, new THREE.MeshBasicMaterial({
      color: BRAND.colors.gold, transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide,
    }));
    m.position.set(x, y, 0.015);
    m.scale.setScalar(0.01);
    this.root.add(m);
    this.ripples.push({ mesh: m, life: 0 });
  }

  update(dt, time) {
    this.visible += (this.target - this.visible) * Math.min(1, dt * 8);
    const s = Math.max(0.0001, easeOutBack(clamp01(this.visible)));
    this.root.scale.setScalar(s);
    if (this.target) this.age += dt;
    const a = this.age;

    this.glow.material.opacity = (0.55 + Math.sin(time * 2.2) * 0.2) * clamp01(a * 2);
    this.glow.scale.setScalar(1 + Math.sin(time * 1.4) * 0.03);

    const grow = clamp01((a - 0.2) / 1.6);
    this.branches.forEach((b) => b.update(grow, time));

    const bt = clamp01((a - 1.0) / 0.6);
    this.banner.material.opacity = bt;
    this.banner.position.set(0, this.bannerY - 0.08 * (1 - bt) + Math.sin(time * 1.6) * 0.012, 0.18);

    // Steady drip once the branches have grown.
    if (this.target && a > 1.4) {
      this.spawnTimer -= dt;
      if (this.spawnTimer <= 0) {
        this.spawnDrop(BRAND.dropSpot.x, BRAND.dropSpot.y, 0, 0.075);
        this.spawnTimer = 1.4 + Math.random() * 0.5;
      }
    }
    if (this.target && a > 2) {
      this.oliveTimer -= dt;
      if (this.oliveTimer <= 0) {
        this.spawnOlive();
        this.oliveTimer = 1.1 + Math.random() * 0.8;
      }
    }
    for (let i = this.olives.length - 1; i >= 0; i--) {
      const o = this.olives[i];
      o.life += dt;
      o.mesh.position.addScaledVector(o.v, dt);
      o.mesh.position.y += Math.sin(o.life * 4) * 0.002;
      o.mesh.rotation.z += o.spin * dt;
      o.mesh.scale.setScalar(easeOutBack(clamp01(o.life / 0.4)));
      o.mesh.material.opacity = clamp01((2.4 - o.life) / 0.6);
      if (o.life > 2.4) {
        this.root.remove(o.mesh);
        o.mesh.material.dispose();
        this.olives.splice(i, 1);
      }
    }

    for (let i = this.drops.length - 1; i >= 0; i--) {
      const d = this.drops[i];
      d.vy -= 1.6 * dt;
      d.mesh.position.y += d.vy * dt;
      d.mesh.scale.y = d.mesh.scale.x * (1 + Math.min(0.5, -d.vy * 0.4)); // stretch while falling
      if (d.mesh.position.y < d.floor) {
        this.spawnRipple(d.mesh.position.x, d.floor);
        this.root.remove(d.mesh);
        this.drops.splice(i, 1);
      }
    }

    for (let i = this.ripples.length - 1; i >= 0; i--) {
      const r = this.ripples[i];
      r.life += dt;
      const k = r.life / 0.8;
      r.mesh.scale.set(0.02 + k * 0.18, (0.02 + k * 0.18) * 0.55, 1);
      r.mesh.material.opacity = 0.9 * (1 - k);
      if (k >= 1) {
        this.root.remove(r.mesh);
        r.mesh.material.dispose();
        this.ripples.splice(i, 1);
      }
    }

    const pos = this.sparkGeo.attributes.position.array;
    const h = this.aspect + 0.8;
    this.sparkSeeds.forEach((p, i) => {
      const y = ((p.y + time * p.speed + h / 2) % h) - h / 2;
      pos[i * 3] = p.x + Math.sin(time + p.phase) * 0.03;
      pos[i * 3 + 1] = y;
      pos[i * 3 + 2] = p.z;
    });
    this.sparkGeo.attributes.position.needsUpdate = true;
    this.sparks.material.opacity = (0.6 + Math.sin(time * 5) * 0.15) * clamp01(a);
  }
}

init();
