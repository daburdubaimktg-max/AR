// Meet Ollie: a 3D pixel (voxel) olive who builds himself up out of the ORS logo,
// cube by cube, then waves, blinks, bobs and chats. Tap him to make him jump.
import * as THREE from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { sfx, unlock } from "./sfx.js";

const MINDAR_THREE = "https://cdn.jsdelivr.net/npm/mind-ar@1.2.5/dist/mindar-image-three.prod.js";
const TARGET = "targets/logo.mind";
const ASPECT = 570 / 708;          // logo.png height / width (logo units: width 1)
const V = 0.04;                     // size of one voxel, in logo widths
const LINES = [
  "Hi! I'm Ollie 🫒",
  "I'm made of pixels... and olive oil!",
  "Wheee! Tap me again!",
  "Ready for your hair ritual?",
  "Nourished by Olive Oil ✨",
];

const $ = (id) => document.getElementById(id);

// ---------- The voxel model ----------
// Grid coordinates: x right, y up (0 = feet), z towards the viewer. Colours as hex.

const C = {
  olive: [0x8db33a, 0x86ad35, 0x93b940], light: [0xa9cc4f, 0xb4d65a], dark: [0x6f9128, 0x678824],
  eye: 0x161616, white: 0xffffff, cheek: 0xff8fa3, mouth: 0x5a1a1a,
  stem: 0x6b4f2a, leaf: 0x3d7a2a, leafLight: 0x5a9a38, foot: 0x4f6d1f,
};

function buildOllie() {
  const vox = new Map(); // "x,y,z" -> colour
  const key = (x, y, z) => `${x},${y},${z}`;
  const pick = (arr, x, y, z) => arr[Math.abs(x * 7 + y * 13 + z * 3) % arr.length];
  // Body: an olive-shaped ellipsoid.
  const RX = 5.3, RY = 6.9, RZ = 4.6, CY = 7;
  const inside = (x, y, z) => (x / RX) ** 2 + ((y - CY) / RY) ** 2 + (z / RZ) ** 2 <= 1;
  for (let x = -6; x <= 6; x++) {
    for (let y = 0; y <= 14; y++) {
      for (let z = -5; z <= 5; z++) {
        if (!inside(x, y, z)) continue;
        // Only keep surface voxels.
        const surface = !inside(x + 1, y, z) || !inside(x - 1, y, z) || !inside(x, y + 1, z) ||
          !inside(x, y - 1, z) || !inside(x, y, z + 1) || !inside(x, y, z - 1);
        if (!surface) continue;
        let col = pick(C.olive, x, y, z);
        if (y >= 10 && x <= 0) col = pick(C.light, x, y, z);   // light from the top-left
        if (y <= 3 || x >= 4) col = pick(C.dark, x, y, z);     // shade underneath / right
        vox.set(key(x, y, z), col);
      }
    }
  }
  // The face sits on the front-most voxel of each (x, y) column.
  const front = (x, y) => {
    for (let z = 6; z >= -6; z--) if (vox.has(key(x, y, z))) return z;
    return null;
  };
  const paint = (x, y, col, tag) => {
    const z = front(x, y);
    if (z === null) return;
    vox.set(key(x, y, z), col);
    if (tag) tagged.push({ k: key(x, y, z), tag });
  };
  const tagged = [];
  for (const [ex, hx] of [[-3, -3], [2, 2]]) {             // eyes: 2x2 with a highlight
    for (const dx of [0, 1]) for (const dy of [7, 8]) paint(ex + dx, dy, C.eye, "eye");
    paint(hx, 8, C.white, "eye");
  }
  for (const x of [-5, -4, 4, 5]) paint(x, 6, C.cheek);     // cheeks
  for (const x of [-1, 0, 1]) paint(x, 4, C.mouth, "mouth"); // smile
  paint(-2, 5, C.mouth, "mouth");
  paint(2, 5, C.mouth, "mouth");
  // Stem and leaf on top.
  for (const y of [14, 15]) vox.set(key(0, y, 0), C.stem);
  [[1, 16], [2, 16], [3, 16], [2, 17], [3, 17], [4, 17], [1, 15]].forEach(([x, y], i) =>
    vox.set(key(x, y, 0), i % 3 ? C.leaf : C.leafLight));
  // Little feet.
  for (const [x, z] of [[-2, 1], [-3, 1], [2, 1], [3, 1], [-2, 2], [2, 2]]) vox.set(key(x, -1, z), C.foot);

  const list = [...vox.entries()].map(([k, col]) => {
    const [x, y, z] = k.split(",").map(Number);
    return { x, y, z, col, tag: tagged.find((t) => t.k === k)?.tag };
  });
  // Arms: separate so they can wave. Pivot at the shoulder.
  const arm = (side) => [[side * 6, 6, 0], [side * 7, 6, 0], [side * 7, 7, 0], [side * 8, 7, 0]]
    .map(([x, y, z]) => ({ x, y, z, col: C.dark[0] }));
  return { body: list, armL: arm(-1), armR: arm(1) };
}

// ---------- Ollie in the scene ----------

class Ollie {
  constructor() {
    const model = buildOllie();
    this.root = new THREE.Group();
    this.root.position.set(0, -ASPECT / 2 + 0.02, 0.12); // standing in front of the logo's bottom edge
    this.body = new THREE.Group();
    this.root.add(this.body);

    const box = new THREE.BoxGeometry(V * 0.96, V * 0.96, V * 0.96);
    const mat = new THREE.MeshStandardMaterial({ roughness: 0.55, metalness: 0 });
    this.vox = model.body;
    this.mesh = new THREE.InstancedMesh(box, mat, this.vox.length);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.vox.forEach((v, i) => {
      v.target = new THREE.Vector3(v.x * V, (v.y + 1) * V, v.z * V);
      // Start scattered below, inside the logo, and fly up into place layer by layer.
      v.start = new THREE.Vector3((Math.random() - 0.5) * 0.6, -0.15 - Math.random() * 0.3, -0.05 + Math.random() * 0.1);
      v.delay = (v.y + 1) * 0.055 + Math.random() * 0.12;
      v.color = new THREE.Color(v.col);
      this.mesh.setColorAt(i, v.color);
    });
    this.body.add(this.mesh);
    this.eyeIdx = this.vox.map((v, i) => (v.tag === "eye" ? i : -1)).filter((i) => i >= 0);

    const armMesh = (list, side) => {
      const pivot = new THREE.Group();
      pivot.position.set(side * 5.5 * V, 7 * V, 0);
      for (const v of list) {
        const m = new THREE.Mesh(box, new THREE.MeshStandardMaterial({ color: v.col, roughness: 0.55 }));
        m.position.set((v.x - side * 5.5) * V, (v.y - 6) * V, v.z * V);
        pivot.add(m);
      }
      pivot.scale.setScalar(0.001);
      this.body.add(pivot);
      return pivot;
    };
    this.armL = armMesh(model.armL, -1);
    this.armR = armMesh(model.armR, 1);

    // Soft pixel shadow on the wall/floor below.
    const shadow = new THREE.Mesh(
      new THREE.CircleGeometry(0.2, 8),
      new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.25, depthWrite: false }),
    );
    shadow.rotation.x = -Math.PI / 2;
    shadow.scale.set(1, 0.5, 1);
    this.shadow = shadow;
    this.root.add(shadow);

    // Pixel sparkles.
    this.sparks = [];
    const sparkMat = new THREE.MeshBasicMaterial({ color: 0xffe066 });
    for (let i = 0; i < 24; i++) {
      const s = new THREE.Mesh(box, sparkMat);
      s.visible = false;
      this.root.add(s);
      this.sparks.push({ m: s, life: 1, v: new THREE.Vector3() });
    }

    this.t = 0;
    this.active = false;
    this.lostFor = 99;
    this.jump = null;
    this.nextBlink = 2;
    this.lastLayer = -1;
    this.head = new THREE.Object3D();
    this.head.position.set(0, 19 * V, 0);
    this.body.add(this.head);
    this.tmp = new THREE.Object3D();
  }

  found() {
    if (this.lostFor > 2.5) { this.t = 0; this.lastLayer = -1; }
    this.active = true;
  }

  lost() { this.active = false; this.lostFor = 0; }

  get built() { return this.t > 1.8; }

  burst(n, at) {
    for (const s of this.sparks) {
      if (n <= 0) break;
      if (s.life < 1) continue;
      s.life = 0;
      s.m.visible = true;
      s.m.position.copy(at);
      s.v.set((Math.random() - 0.5) * 0.8, Math.random() * 0.8 + 0.2, (Math.random() - 0.5) * 0.5);
      n--;
    }
  }

  tap() {
    if (!this.built || this.jump) return;
    this.jump = { t: 0 };
    sfx.boing(4);
    setTimeout(() => sfx.giggle(), 250);
    this.burst(10, new THREE.Vector3(0, 0.3, 0.05));
    return true;
  }

  update(dt, time) {
    if (this.active) this.t += dt; else this.lostFor += dt;
    const t = this.t;

    // Build: voxels fly up into place layer by layer, with a rising pop per layer.
    const layer = Math.floor((t - 0.1) / 0.11);
    if (this.active && layer > this.lastLayer && layer <= 18 && layer >= 0) {
      this.lastLayer = layer;
      if (layer % 2 === 0) sfx.pop(layer / 2);
    }
    const building = t < 2.2;
    if (building) {
      this.vox.forEach((v, i) => {
        const u = Math.max(0, Math.min(1, (t - v.delay) / 0.45));
        const k = u <= 0 ? 0 : 1 + 2.4 * Math.pow(u - 1, 3) + 1.4 * Math.pow(u - 1, 2); // ease out back
        this.tmp.position.lerpVectors(v.start, v.target, Math.min(1, k));
        this.tmp.position.y += Math.sin(Math.PI * u) * 0.08;
        this.tmp.rotation.set((1 - u) * 3, (1 - u) * 2, 0);
        this.tmp.scale.setScalar(u <= 0 ? 0.0001 : Math.min(1, 0.2 + k));
        this.tmp.updateMatrix();
        this.mesh.setMatrixAt(i, this.tmp.matrix);
      });
      this.mesh.instanceMatrix.needsUpdate = true;
    }
    if (this.active && t > 1.45 && t - dt <= 1.45) { sfx.chime(); this.burst(24, new THREE.Vector3(0, 0.35, 0.05)); }

    // Arms pop on once the body is built.
    const armK = Math.max(0.001, Math.min(1, (t - 1.3) / 0.25));
    this.armL.scale.setScalar(armK);
    this.armR.scale.setScalar(armK);

    // Alive: bob, sway, wave, blink.
    const alive = Math.max(0, Math.min(1, (t - 1.6) / 0.4));
    let jumpY = 0, spin = 0, squash = 1;
    if (this.jump) {
      this.jump.t += dt / 0.8;
      const j = Math.min(1, this.jump.t);
      jumpY = Math.sin(Math.PI * j) * 0.25;
      spin = j * Math.PI * 2;
      if (j >= 1) this.jump = null;
    }
    const land = t - 1.5;
    if (land > 0 && land < 0.6) squash = 1 - Math.exp(-land * 8) * Math.cos(land * 22) * 0.18;
    this.body.position.y = Math.abs(Math.sin(time * 3)) * 0.02 * alive + jumpY;
    this.body.scale.set(1 / Math.sqrt(squash), squash, 1 / Math.sqrt(squash));
    this.body.rotation.y = Math.sin(time * 0.8) * 0.25 * alive + spin;
    this.armR.rotation.z = alive * (0.6 + Math.sin(time * 9) * 0.5);   // waving
    this.armL.rotation.z = -alive * (0.2 + Math.sin(time * 3) * 0.1);
    this.shadow.scale.set(1 - jumpY, 0.5 * (1 - jumpY), 1);

    if (this.built && time > this.nextBlink) {
      this.eyeIdx.forEach((i) => this.mesh.setColorAt(i, this.vox[i].color.clone().set(C.olive[0])));
      this.mesh.instanceColor.needsUpdate = true;
      setTimeout(() => {
        this.eyeIdx.forEach((i) => this.mesh.setColorAt(i, this.vox[i].color));
        this.mesh.instanceColor.needsUpdate = true;
      }, 130);
      this.nextBlink = time + 2 + Math.random() * 3;
    }

    for (const s of this.sparks) {
      if (s.life >= 1) continue;
      s.life += dt / 0.9;
      s.v.y -= 1.2 * dt;
      s.m.position.addScaledVector(s.v, dt);
      s.m.scale.setScalar(1 - s.life);
      if (s.life >= 1) s.m.visible = false;
    }
  }
}

// ---------- App ----------

async function start() {
  unlock();
  $("startBtn").hidden = true;
  $("loading").hidden = false;
  let MindARThree;
  try {
    ({ MindARThree } = await import(MINDAR_THREE));
  } catch (err) {
    console.error(err);
    $("error").textContent = "Couldn't load. Check your connection and try again.";
    $("error").hidden = false;
    $("startBtn").hidden = false;
    return;
  }
  const mindar = new MindARThree({
    container: $("ar"), imageTargetSrc: TARGET, uiScanning: "no", uiLoading: "no", filterMinCF: 0.0001, filterBeta: 0.001,
  });
  const { renderer, scene, camera } = mindar;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;
  scene.add(new THREE.HemisphereLight(0xffffff, 0x445533, 0.5));
  const key = new THREE.DirectionalLight(0xfff4e0, 1.3);
  key.position.set(-0.6, 1, 1.5);
  scene.add(key);

  const anchor = mindar.addAnchor(0);
  const ollie = new Ollie();
  anchor.group.add(ollie.root);
  if (new URLSearchParams(location.search).has("debug")) window.ollie = ollie;

  let line = 0;
  const say = (text) => {
    const b = $("bubble");
    b.textContent = "";
    b.hidden = false;
    let i = 0;
    clearInterval(say.timer);
    say.timer = setInterval(() => {   // typewriter
      b.textContent = [...text].slice(0, ++i).join("");
      if (i % 2) sfx.tick();
      if (i >= [...text].length) clearInterval(say.timer);
    }, 45);
  };
  let greeted = false;
  anchor.onTargetFound = () => { ollie.found(); $("hint").hidden = true; };
  anchor.onTargetLost = () => { ollie.lost(); $("hint").hidden = false; $("bubble").hidden = true; $("tapTip").hidden = true; greeted = false; };

  $("ar").addEventListener("pointerdown", () => {
    if (ollie.tap()) {
      line = (line + 1) % LINES.length;
      say(LINES[line]);
      $("tapTip").hidden = true;
    }
  });

  try {
    await mindar.start();
  } catch (err) {
    console.error(err);
    $("error").textContent = window.isSecureContext ? "Camera unavailable. Allow camera access and try again." : "Camera needs HTTPS.";
    $("error").hidden = false;
    $("loading").hidden = true;
    return;
  }
  $("setup").hidden = true;
  $("hint").hidden = false;

  const clock = new THREE.Clock();
  const head = new THREE.Vector3();
  renderer.setAnimationLoop(() => {
    const dt = Math.min(clock.getDelta(), 0.05);
    ollie.update(dt, clock.elapsedTime);
    renderer.render(scene, camera);
    if (ollie.active && ollie.built && !greeted) {
      greeted = true;
      line = 0;
      say(LINES[0]);
      setTimeout(() => { if (ollie.active) $("tapTip").hidden = false; }, 2500);
    }
    // Keep the speech bubble above Ollie's head.
    if (!$("bubble").hidden) {
      ollie.head.getWorldPosition(head).project(camera);
      const r = $("ar").getBoundingClientRect();
      $("bubble").style.left = `${((head.x + 1) / 2) * r.width}px`;
      $("bubble").style.top = `${((1 - head.y) / 2) * r.height - 12}px`;
    }
  });
}

$("startBtn").onclick = start;
