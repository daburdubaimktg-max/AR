// Ollie, the ORS Olive Oil mascot: a cute 3D pixel (voxel) olive with an ORS-red bow.
// He builds himself up cube by cube, then waves, blinks, bobs, hops and dances.
// Shared by the main AR experience (orsoliveoilarsticker/) and the Meet Ollie page (ollie/).
import * as THREE from "three";
import { sfx } from "./sfx.js";

const ASPECT = 570 / 708;           // logo.png height / width (logo units: width 1)
export const V = 0.044;             // size of one voxel, in logo widths

// ---------- The voxel model ----------
// Grid coordinates: x right, y up (0 = feet), z towards the viewer. Colours as hex.

const C = {
  olive: [0x8db33a, 0x86ad35, 0x93b940], light: [0xa9cc4f, 0xb4d65a], dark: [0x6f9128, 0x678824],
  eye: 0x161616, white: 0xffffff, cheek: 0xff8fa3, mouth: 0x5a1a1a,
  stem: 0x6b4f2a, leaf: 0x3d7a2a, leafLight: 0x5a9a38, foot: 0x4f6d1f,
  bow: 0xc8243f, bowDark: 0x8e1428, bowLight: 0xe8566e, shine: 0xdff2a8,
};

function buildOllie() {
  const vox = new Map(); // "x,y,z" -> colour
  const key = (x, y, z) => `${x},${y},${z}`;
  const pick = (arr, x, y, z) => arr[Math.abs(x * 7 + y * 13 + z * 3) % arr.length];
  // Body: an olive-shaped ellipsoid.
  const RX = 5.8, RY = 6.6, RZ = 4.9, CY = 7; // round and chubby
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
  // Big sparkly eyes: 2 wide x 3 tall, a white glint top-left and a soft one bottom-right.
  for (const ex of [-3, 2]) {
    for (const dx of [0, 1]) for (const dy of [5, 6, 7]) paint(ex + dx, dy, C.eye, "eye");
    paint(ex, 7, C.white, "eye");
    paint(ex + 1, 5, 0x6e6e6e, "eye");
  }
  for (const x of [-5, -4, 4, 5]) paint(x, 4, C.cheek);     // rosy cheeks
  paint(0, 3, C.mouth, "mouth");                              // a tiny, sweet "u" smile
  paint(-1, 4, C.mouth, "mouth");
  paint(1, 4, C.mouth, "mouth");
  for (const [x, y] of [[-3, 11], [-2, 12], [-4, 10]]) paint(x, y, C.shine); // glossy shine on the skin
  // A big satin bow (ORS red) on top of the head, to the right of the stem.
  const BX = 3, BY = 14;
  const bowRows = { 2: [-3, -2, 2, 3], 1: [-3, -2, -1, 1, 2, 3], 0: [-3, -2, -1, 0, 1, 2, 3], [-1]: [-3, -2, -1, 1, 2, 3], [-2]: [-3, -2, 2, 3] };
  for (const z of [-1, 0, 1]) {
    for (const [dy, xs] of Object.entries(bowRows)) {
      for (const dx of xs) {
        const col = dx === 0 ? C.bowDark : (Number(dy) === 1 && Math.abs(dx) === 2 && z === 1 ? C.bowLight : C.bow);
        vox.set(key(BX + dx, BY + Number(dy), z), col);
      }
    }
  }
  vox.set(key(BX - 1, BY - 3, 1), C.bow); // little ribbon tails
  vox.set(key(BX + 1, BY - 3, 1), C.bow);
  // Stem and leaf on top.
  for (const y of [13, 14]) vox.set(key(-2, y, 0), C.stem);
  [[-3, 15], [-4, 15], [-5, 15], [-4, 16], [-5, 16], [-6, 16], [-3, 14]].forEach(([x, y], i) =>
    vox.set(key(x, y, 0), i % 3 ? C.leaf : C.leafLight));
  // Little feet.
  for (const [x, z] of [[-2, 1], [-3, 1], [2, 1], [3, 1], [-2, 2], [2, 2]]) vox.set(key(x, -1, z), C.foot);

  const list = [...vox.entries()].map(([k, col]) => {
    const [x, y, z] = k.split(",").map(Number);
    return { x, y, z, col, tag: tagged.find((t) => t.k === k)?.tag };
  });
  // Arms: separate so they can wave. Pivot at the shoulder.
  const arm = (side) => [[side * 6, 5, 0], [side * 7, 5, 0], [side * 7, 6, 0], [side * 6, 5, 1]]
    .map(([x, y, z]) => ({ x, y, z, col: C.olive[0] }));
  return { body: list, armL: arm(-1), armR: arm(1) };
}

// ---------- Ollie in the scene ----------

export class Ollie {
  // position / rotationY: where he stands relative to the logo (logo units).
  constructor({ position = [-0.27, -ASPECT / 2 - 0.03, 0.2], rotationY = 0.25 } = {}) {
    const model = buildOllie();
    this.root = new THREE.Group();
    this.root.position.set(...position);
    this.root.rotation.y = rotationY; // turned a little towards the logo
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
      pivot.position.set(side * 5.5 * V, 6 * V, 0);
      for (const v of list) {
        const m = new THREE.Mesh(box, new THREE.MeshStandardMaterial({ color: v.col, roughness: 0.55 }));
        m.position.set((v.x - side * 5.5) * V, (v.y - 5) * V, v.z * V);
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
    this.head.position.set(0, 18 * V, 0);
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

  // Small happy hop (quiz answers) and a spinning dance (results).
  hop() {
    this.jump = { t: 0, dur: 0.45, h: 0.12, spin: 0 };
    this.burst(6, new THREE.Vector3(0, 0.5, 0.05));
  }

  dance() {
    this.jump = { t: 0, dur: 1.4, h: 0.22, spin: 2, hops: 3 };
    this.burst(24, new THREE.Vector3(0, 0.5, 0.05));
  }

  tap() {
    if (!this.built || this.jump) return;
    this.jump = { t: 0, dur: 0.8, h: 0.25, spin: 1 };
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
      const J = this.jump;
      J.t += dt / J.dur;
      const j = Math.min(1, J.t);
      const hops = J.hops || 1;
      jumpY = Math.abs(Math.sin(Math.PI * j * hops)) * J.h;
      spin = j * Math.PI * 2 * J.spin;
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

