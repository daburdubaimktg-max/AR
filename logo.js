// ORS Olive Oil — point the camera at the logo and it comes to life in 3D.
// Image tracking: MindAR (https://github.com/hiukim/mind-ar-js), rendering: three.js.
//
// The 3D logo is built from the real artwork: targets/logo-shapes.json holds
// the traced letter / pill outlines (tools/vectorize_logo.py), which are
// extruded here; the olive sprig is modelled to sit over the printed one.
import * as THREE from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";

const MINDAR_THREE = "https://cdn.jsdelivr.net/npm/mind-ar@1.2.5/dist/mindar-image-three.prod.js";

// ---------- Brand config: edit these ----------
const BRAND = {
  name: "ORS Olive Oil",
  tagline: "Nourished by Olive Oil",
  ctaText: "Shop now",
  ctaUrl: "https://www.google.com/search?q=ORS+Olive+Oil",
  targetSrc: "targets/logo.mind",
  shapesSrc: "targets/logo-shapes.json",
  colors: {
    green: 0x1e5631, red: 0xa51f36, white: 0xffffff, olive: 0x9cb83a,
    leaf: 0x3d6b2a, stem: 0x7d8a3c, gold: 0xf0b323,
  },
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
  $("shopBtn").textContent = BRAND.ctaText;
  $("shopBtn").href = BRAND.ctaUrl;
  $("startBtn").onclick = start;
}

function showError(msg) {
  $("progress").hidden = true;
  $("startBtn").hidden = false;
  const el = $("setupError");
  el.textContent = msg;
  el.hidden = false;
}

async function start() {
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

  const anchor = mindar.addAnchor(0);
  const show = new LogoReveal(shapes);
  anchor.group.add(show.root);
  if (new URLSearchParams(location.search).has("debug")) window.reveal = show;

  anchor.onTargetFound = () => {
    show.found();
    $("hint").hidden = true;
    $("cta").hidden = false;
    if (navigator.vibrate) navigator.vibrate(25);
  };
  anchor.onTargetLost = () => {
    show.lost();
    $("hint").hidden = false;
  };
  $("ar").addEventListener("pointerdown", () => show.tap());

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

  const clock = new THREE.Clock();
  renderer.setAnimationLoop(() => {
    show.update(Math.min(clock.getDelta(), 0.05), clock.elapsedTime);
    renderer.render(scene, camera);
  });
}

// ---------- Helpers ----------

const clamp01 = (t) => Math.max(0, Math.min(1, t));
const smooth = (t) => { t = clamp01(t); return t * t * (3 - 2 * t); };
const easeOutBack = (t) => { t = clamp01(t); return 1 + 2.4 * Math.pow(t - 1, 3) + 1.4 * Math.pow(t - 1, 2); };
const easeInOut = (t) => { t = clamp01(t); return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; };

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
  const mesh = new THREE.Mesh(geo, material);
  mesh.position.set(centre.x, centre.y, 0);
  mesh.userData.depth = depth + bevel * 2;
  return mesh;
}

function glossy(color, extra = {}) {
  return new THREE.MeshPhysicalMaterial({
    color, roughness: 0.38, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.08, envMapIntensity: 0.55, ...extra,
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

// ---------- The reveal ----------
// Timeline (seconds after the logo is found):
//   0.0  gold light sweeps across the printed logo
//   0.35 red pill extrudes out of the paper, white ORS presses out of it
//   0.55 O-L-I-V-E-O-I-L rise one by one with a hop
//   1.1  stems grow, olives inflate from the print, leaves unfurl
//   1.7  the whole logo lifts off the paper and floats, gold dust bursts
//   3.2+ a gold oil drop forms in the ORS "O", falls past the logo, and a gold glint sweeps the letters

class LogoReveal {
  constructor(shapes) {
    this.root = new THREE.Group();
    this.age = 0;
    this.active = false;
    this.lostFor = 99;
    this.nextDrop = 0;
    this.spin = null;
    this.shimmerX = null;
    this.dropState = null;

    // Paper-coloured cover that hides the flat print once the 3D one rises.
    this.cover = new THREE.Mesh(
      new THREE.PlaneGeometry(1.04, ASPECT + 0.04),
      new THREE.MeshBasicMaterial({
        color: 0xf7f7f4, transparent: true, opacity: 0, depthWrite: false, toneMapped: false,
        alphaMap: canvasTexture(128, 128, (g) => {
          g.fillStyle = "#000"; g.fillRect(0, 0, 128, 128);
          g.filter = "blur(4px)"; g.fillStyle = "#fff"; g.fillRect(8, 8, 112, 112);
        }),
      }),
    );
    this.cover.position.z = 0.0005;
    this.root.add(this.cover);

    // Gold light sweep across the print at the start.
    this.sweep = new THREE.Mesh(
      new THREE.PlaneGeometry(0.22, ASPECT + 0.06),
      new THREE.MeshBasicMaterial({
        map: canvasTexture(64, 4, (g, w) => {
          const grad = g.createLinearGradient(0, 0, w, 0);
          grad.addColorStop(0, "rgba(255,200,80,0)");
          grad.addColorStop(0.5, "rgba(255,230,150,.9)");
          grad.addColorStop(1, "rgba(255,200,80,0)");
          g.fillStyle = grad; g.fillRect(0, 0, w, 4);
        }),
        transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
      }),
    );
    this.sweep.position.z = 0.002;
    this.root.add(this.sweep);

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

    this.pill = extrude(shapes.pill, glossy(BRAND.colors.red), 0.028, 0.009);
    this.logo.add(this.pill);
    const pillFront = this.pill.userData.depth;

    const white = glossy(BRAND.colors.white, { roughness: 0.22 });
    this.ors = shapes.ors.map((p) => {
      const m = extrude([p], white, 0.012, 0.003);
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
      const m = extrude(p, mat, 0.05, 0.007);
      this.logo.add(m);
      return m;
    });
    this.tm = extrude(shapes.tm, glossy(BRAND.colors.green), 0.006, 0.002);
    this.logo.add(this.tm);

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
      m.position.set(c.x, c.y, depth + o.z);
      m.rotation.z = THREE.MathUtils.degToRad(o.tilt);
      m.userData.r = new THREE.Vector3(o.r[0] * U, o.r[1] * U, depth);
      this.sprig.add(m);
      return m;
    });
    const leafMat = new THREE.MeshPhysicalMaterial({
      color: BRAND.colors.leaf, roughness: 0.45, clearcoat: 0.6, side: THREE.DoubleSide,
    });
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
    const dropGeo = new THREE.LatheGeometry(pts, 32);
    dropGeo.translate(0, -0.5, 0);
    this.drop = new THREE.Mesh(dropGeo, glossy(BRAND.colors.gold, {
      metalness: 0.6, roughness: 0.1, emissive: 0x6a4000, emissiveIntensity: 0.8, envMapIntensity: 1.2,
    }));
    this.drop.visible = false;
    this.logo.add(this.drop);

    // Gold dust.
    const N = 140;
    this.dust = Array.from({ length: N }, () => ({ life: 1, max: 1, p: new THREE.Vector3(), v: new THREE.Vector3() }));
    this.dustGeo = new THREE.BufferGeometry();
    this.dustGeo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(N * 3), 3));
    this.dustPoints = new THREE.Points(this.dustGeo, new THREE.PointsMaterial({
      map: sparkleTexture(), size: 0.035, transparent: true, depthWrite: false,
      blending: THREE.AdditiveBlending, toneMapped: false,
    }));
    this.root.add(this.dustPoints);

    this.apply(0, 0);
  }

  found() {
    if (this.lostFor > 2.5) { // replay the reveal after a real absence
      this.age = 0;
      this.nextDrop = 3.2;
    }
    this.active = true;
  }

  lost() {
    this.active = false;
    this.lostFor = 0;
  }

  tap() {
    if (!this.active || this.age < 2.4) return;
    if (!this.spin) this.spin = { t: 0 };
    this.startDrop();
    this.emitDust(30, new THREE.Vector3(0, 0, 0.1), 0.6);
  }

  startDrop() {
    if (this.dropState) return;
    const at = px(...DROP_AT);
    this.dropState = { phase: "form", t: 0, x: at.x, y: at.y, vy: 0 };
  }

  emitDust(n, at, spread) {
    for (const d of this.dust) {
      if (n <= 0) break;
      if (d.life < d.max) continue;
      d.life = 0;
      d.max = 0.8 + Math.random() * 0.8;
      d.p.set(at.x + (Math.random() - 0.5) * spread, at.y + (Math.random() - 0.5) * spread * ASPECT, at.z);
      d.v.set((Math.random() - 0.5) * 0.4, Math.random() * 0.35 + 0.05, Math.random() * 0.3);
      n--;
    }
  }

  update(dt, time) {
    if (this.active) this.age += dt;
    else this.lostFor += dt;
    this.apply(this.age, time, dt);
  }

  apply(a, time, dt = 0) {
    // 1. Light sweep over the printed logo.
    const sw = clamp01(a / 0.7);
    this.sweep.position.x = -0.6 + 1.2 * sw;
    this.sweep.material.opacity = sw > 0 && sw < 1 ? Math.sin(sw * Math.PI) : 0;

    // 2. Hide the print as the 3D logo grows out of it.
    this.cover.material.opacity = 0.96 * smooth((a - 0.35) / 0.6);

    // 3. Pill, then ORS, then letters extrude up out of the paper.
    const grow = (m, start, dur) => {
      const k = easeOutBack((a - start) / dur);
      m.scale.z = Math.max(0.001, k);
      m.visible = a > start;
      return k;
    };
    grow(this.pill, 0.35, 0.5);
    this.ors.forEach((m, i) => {
      const k = grow(m, 0.75 + i * 0.05, 0.4);
      m.scale.x = m.scale.y = 1 + 0.12 * Math.sin(Math.PI * clamp01(k));
    });
    this.orsTm.visible = a > 0.9;
    this.letters.forEach((m, i) => {
      const start = 0.55 + i * 0.09;
      grow(m, start, 0.45);
      m.position.z = 0.05 * Math.sin(Math.PI * clamp01((a - start) / 0.55)); // a little hop
    });
    grow(this.tm, 1.3, 0.3);

    // 4. Sprig: stems grow, olives inflate, leaves unfurl.
    this.stems.forEach((s, i) => {
      const k = clamp01((a - 1.1 - i * 0.08) / 0.4);
      s.geometry.setDrawRange(0, Math.floor((s.userData.count * k) / 3) * 3);
    });
    this.olives.forEach((m, i) => {
      const k = easeOutBack((a - 1.25 - i * 0.12) / 0.55);
      const r = m.userData.r;
      const breathe = 1 + Math.sin(time * 2 + i) * 0.012 * clamp01(a - 2);
      m.scale.set(r.x * breathe, r.y * breathe, Math.max(0.0005, r.z * k));
      m.visible = a > 1.25 + i * 0.12;
    });
    this.leaves.forEach((l, i) => {
      const k = easeOutBack((a - 1.5 - i * 0.1) / 0.5);
      l.pivot.scale.setScalar(Math.max(0.001, k));
      l.leaf.rotation.x = Math.sin(time * 1.7 + i * 2) * 0.12 * clamp01(a - 2);
    });

    // 5. Lift off the paper and float.
    const lift = smooth((a - 1.7) / 0.8);
    const float = Math.sin(time * 1.4) * 0.008 * lift;
    this.logo.position.z = 0.07 * lift + float;
    let spinY = 0;
    if (this.spin) {
      this.spin.t += dt / 1.1;
      spinY = easeInOut(this.spin.t) * Math.PI * 2;
      if (this.spin.t >= 1) this.spin = null;
    }
    this.logo.rotation.x = Math.sin(time * 0.7) * 0.07 * lift;
    this.logo.rotation.y = Math.sin(time * 0.5) * 0.1 * lift + spinY;
    this.shadow.material.opacity = 0.28 * lift;
    this.shadow.position.set(0.012 * lift, -0.02 * lift, 0.001);
    this.shadow.scale.setScalar(1 + 0.04 * lift + float);
    if (a > 1.7 && a - dt <= 1.7) this.emitDust(70, new THREE.Vector3(0, 0, 0.08), 1.1);

    // 6. The oil drop loop + gold shimmer across the letters.
    if (this.active && a > this.nextDrop) {
      this.startDrop();
      this.nextDrop = a + 4.5;
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

    // Gold dust.
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
        this.emitDust(26, this.drop.position.clone(), 0.08);
        this.shimmerX = -0.65;
        this.dropState = null;
        this.drop.visible = false;
      }
    }
  }
}

init();
