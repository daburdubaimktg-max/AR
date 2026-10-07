// "ORS hair-care corner": a chunky, clay-style miniature world that builds itself
// under the wall logo, like a little shelf sticking out of the stall wall.
// Units: logo widths. The group's origin is the back-centre of the floor, against
// the wall; +y is up, +z comes out of the wall towards the visitor.
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { sfx } from "./sfx.js";

const clamp01 = (t) => Math.max(0, Math.min(1, t));
const smooth = (t) => { t = clamp01(t); return t * t * (3 - 2 * t); };
const easeOutBack = (t) => { t = clamp01(t); return 1 + 2.6 * Math.pow(t - 1, 3) + 1.6 * Math.pow(t - 1, 2); };
const easeOutBounce = (t) => {
  t = clamp01(t);
  const n = 7.5625, d = 2.75;
  if (t < 1 / d) return n * t * t;
  if (t < 2 / d) return n * (t -= 1.5 / d) * t + 0.75;
  if (t < 2.5 / d) return n * (t -= 2.25 / d) * t + 0.9375;
  return n * (t -= 2.625 / d) * t + 0.984375;
};
const rand = (a, b) => a + Math.random() * (b - a);

const FLOOR = 0.055;  // top of the tiles
const TILT = 0.42;    // lean the floor towards the visitor so you can see into the scene
const SCALE = 0.8;    // overall size of the corner relative to the logo

// Soft clay-like materials.
const clay = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.62, metalness: 0, ...extra });
const satin = (color) => new THREE.MeshPhysicalMaterial({
  color, roughness: 0.3, clearcoat: 0.7, clearcoatRoughness: 0.3, sheen: 1, sheenColor: 0xffc2cb,
});
const lathe = (pts, mat, seg = 40) => new THREE.Mesh(new THREE.LatheGeometry(pts.map(([x, y]) => new THREE.Vector2(x, y)), seg), mat);

function canvasTex(w, h, draw) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  draw(c.getContext("2d"), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const blobTex = canvasTex(64, 64, (g) => {
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, "rgba(40,30,20,.55)");
  grad.addColorStop(1, "rgba(40,30,20,0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
});

// A soft contact shadow under a prop.
function blob(w, d) {
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(w, d),
    new THREE.MeshBasicMaterial({ map: blobTex, transparent: true, depthWrite: false }),
  );
  m.rotation.x = -Math.PI / 2;
  m.position.y = 0.002;
  return m;
}

export class Diorama {
  // floorY: where the floor meets the wall (logo units); hooks.land(prop) / hooks.burst(obj)
  // let the reveal add dust; makeFace() builds the olive buddy's awake face.
  constructor({ floorY, logoSrc, makeFace, hooks }) {
    this.hooks = hooks;
    this.root = new THREE.Group();
    this.root.position.y = floorY;
    this.stage = new THREE.Group();
    this.stage.rotation.x = TILT;
    this.stage.scale.setScalar(SCALE);
    this.root.add(this.stage);
    this.root.visible = false;

    this.buildPlatform();
    this.props = [];
    this.addProp("jar", this.buildJar(logoSrc), -0.36, 0.3, 0.0, 0.4);
    this.addProp("tree", this.buildTree(), 0.42, 0.22, 0.1, 0.3);
    this.addProp("spray", this.buildSpray(), -0.08, 0.2, 0.2, 0.16);
    this.addProp("bowl", this.buildBowl(), 0.24, 0.46, 0.3, 0.2);
    this.addProp("cushion", this.buildCushion(makeFace), -0.02, 0.56, 0.4, 0.28);
    this.addProp("bonnet", this.buildBonnet(), 0.4, 0.64, 0.5, 0.22);
    this.addProp("comb", this.buildComb(), -0.36, 0.68, 0.6, 0.26);

    this.buildZzz();
    this.bits = [];   // olives / drops flying about after a tap
    this.mists = [];
    this.awake = 0;   // seconds left awake
    this.lidPop = 0;
  }

  // ---------- Building ----------

  buildPlatform() {
    const base = new THREE.Mesh(new RoundedBoxGeometry(1.3, 0.07, 0.9, 4, 0.03), clay(0x2f5a2f));
    base.position.set(0, -0.005, 0.43);
    this.base = base;
    this.stage.add(base);
    this.tiles = [];
    const geo = new RoundedBoxGeometry(0.19, 0.05, 0.19, 3, 0.02);
    const colors = [0xe6cf9c, 0xb9c97c, 0xdcc28a, 0xaabb6c];
    for (let r = 0; r < 4; r++) {
      for (let c = 0; c < 6; c++) {
        const m = new THREE.Mesh(geo, clay(colors[(r + c) % 2 + (Math.random() < 0.3 ? 2 : 0)]));
        m.position.set(-0.5 + c * 0.2, 0.025, 0.12 + r * 0.205);
        m.userData.delay = r * 0.07 + Math.abs(c - 2.5) * 0.03;
        this.tiles.push(m);
        this.stage.add(m);
      }
    }
  }

  addProp(name, group, x, z, delay, shadow) {
    const holder = new THREE.Group();
    holder.position.set(x, FLOOR, z);
    holder.add(blob(shadow, shadow * 0.8));
    holder.add(group);
    this.stage.add(holder);
    this.props.push({ name, holder, group, delay, landed: false });
    this[name] = group;
  }

  buildJar(logoSrc) {
    const g = new THREE.Group();
    const white = clay(0xf8f6ef, { roughness: 0.4 });
    const red = clay(0xa51f36, { roughness: 0.45 });
    g.add(lathe([[0, 0], [0.13, 0], [0.15, 0.015], [0.155, 0.04], [0.155, 0.2], [0.145, 0.225], [0.11, 0.235], [0.11, 0.25]], white));
    // Label with the real logo, at its true aspect ratio.
    const tex = new THREE.TextureLoader().load(logoSrc);
    tex.colorSpace = THREE.SRGBColorSpace;
    const lh = 0.15, theta = (lh * (708 / 570)) / 0.157;
    const label = new THREE.Mesh(
      new THREE.CylinderGeometry(0.157, 0.157, lh, 48, 1, true, -theta / 2, theta),
      new THREE.MeshStandardMaterial({ map: tex, roughness: 0.5 }),
    );
    label.position.y = 0.12;
    g.add(label);
    const lid = new THREE.Group();
    lid.position.y = 0.245;
    lid.add(lathe([[0, 0], [0.135, 0], [0.142, 0.02], [0.142, 0.05], [0.13, 0.065], [0, 0.068]], red));
    g.add(lid);
    this.jarLid = lid;
    const oil = new THREE.Mesh(new THREE.CircleGeometry(0.105, 32), new THREE.MeshPhysicalMaterial({
      color: 0xf0b323, roughness: 0.1, metalness: 0.4, clearcoat: 1, emissive: 0x6a4000, emissiveIntensity: 0.5,
    }));
    oil.rotation.x = -Math.PI / 2;
    oil.position.y = 0.24;
    g.add(oil);
    this.goldMat = oil.material;
    return g;
  }

  buildTree() {
    const g = new THREE.Group();
    g.add(lathe([[0, 0], [0.07, 0], [0.085, 0.02], [0.095, 0.11], [0.105, 0.125], [0.1, 0.135], [0, 0.135]], clay(0xc96f4a)));
    const soil = new THREE.Mesh(new THREE.CircleGeometry(0.088, 24), clay(0x5b4130));
    soil.rotation.x = -Math.PI / 2;
    soil.position.y = 0.128;
    g.add(soil);
    const trunk = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, 0.12, 0), new THREE.Vector3(0.02, 0.2, 0), new THREE.Vector3(-0.015, 0.28, 0.01), new THREE.Vector3(0.01, 0.33, 0),
    ]), 16, 0.016, 8, false), clay(0x7a5c43));
    g.add(trunk);
    const canopy = new THREE.Group();
    canopy.position.y = 0.38;
    const greens = [clay(0x5f7d3a), clay(0x77964b), clay(0x4f6c30)];
    const ball = new THREE.SphereGeometry(1, 20, 14);
    [[0, 0.02, 0, 0.1], [-0.08, -0.02, 0.02, 0.075], [0.08, -0.01, 0.01, 0.08], [0.02, 0.07, -0.02, 0.075],
      [-0.04, 0.05, 0.05, 0.065], [0.05, 0.03, 0.06, 0.06], [-0.06, -0.05, -0.04, 0.06]].forEach(([x, y, z, r], i) => {
      const m = new THREE.Mesh(ball, greens[i % 3]);
      m.position.set(x, y, z);
      m.scale.set(r * 1.15, r * 0.9, r);
      canopy.add(m);
    });
    const oliveMat = clay(0x3f5a22, { roughness: 0.35 });
    this.treeOlives = [];
    for (let i = 0; i < 8; i++) {
      const m = new THREE.Mesh(ball, oliveMat);
      const a = (i / 8) * Math.PI * 2;
      m.position.set(Math.cos(a) * 0.1, -0.03 + Math.sin(i * 2.1) * 0.04, 0.05 + Math.sin(a) * 0.04);
      m.scale.set(0.013, 0.017, 0.013);
      canopy.add(m);
      this.treeOlives.push(m);
    }
    g.add(canopy);
    this.canopy = canopy;
    return g;
  }

  buildSpray() {
    const g = new THREE.Group();
    g.add(lathe([[0, 0], [0.045, 0], [0.05, 0.01], [0.05, 0.13], [0.03, 0.155], [0.018, 0.16], [0.018, 0.175]], clay(0xf4f6ee, { roughness: 0.35 })));
    const band = new THREE.Mesh(new THREE.CylinderGeometry(0.0505, 0.0505, 0.05, 32, 1, true), clay(0x1e5631));
    band.position.y = 0.07;
    g.add(band);
    const head = new THREE.Mesh(new RoundedBoxGeometry(0.07, 0.045, 0.045, 3, 0.015), clay(0xa51f36));
    head.position.set(0.012, 0.195, 0);
    g.add(head);
    const trigger = new THREE.Mesh(new RoundedBoxGeometry(0.014, 0.05, 0.03, 2, 0.006), clay(0xa51f36));
    trigger.position.set(0.035, 0.16, 0);
    trigger.rotation.z = -0.3;
    g.add(trigger);
    g.rotation.y = -0.5; // nozzle points towards the middle
    this.sprayHead = head;
    return g;
  }

  buildBowl() {
    const g = new THREE.Group();
    g.add(lathe([[0, 0], [0.045, 0], [0.07, 0.02], [0.085, 0.05], [0.08, 0.052], [0.065, 0.025], [0, 0.02]], clay(0xf3ead6), 32));
    const oil = new THREE.Mesh(new THREE.CircleGeometry(0.07, 24), new THREE.MeshPhysicalMaterial({
      color: 0xf0b323, roughness: 0.1, metalness: 0.4, clearcoat: 1, emissive: 0x6a4000, emissiveIntensity: 0.4,
    }));
    oil.rotation.x = -Math.PI / 2;
    oil.position.y = 0.038;
    g.add(oil);
    const ball = new THREE.SphereGeometry(1, 16, 12);
    const mat = clay(0x9cb83a, { roughness: 0.4 });
    [[0, 0.02], [0.03, -0.015], [-0.03, -0.01], [0.012, 0.035], [-0.02, 0.03]].forEach(([x, z], i) => {
      const m = new THREE.Mesh(ball, mat);
      m.position.set(x, 0.055 + (i === 3 ? 0.012 : 0), z);
      m.scale.set(0.017, 0.021, 0.017);
      m.rotation.z = i;
      g.add(m);
    });
    return g;
  }

  buildCushion(makeFace) {
    const g = new THREE.Group();
    const cushion = new THREE.Mesh(new RoundedBoxGeometry(0.27, 0.055, 0.2, 4, 0.027), satin(0xc23a52));
    cushion.position.y = 0.027;
    g.add(cushion);
    const button = new THREE.Mesh(new THREE.SphereGeometry(0.008, 10, 8), clay(0xf0b323));
    button.position.set(0.07, 0.056, 0.05);
    g.add(button);

    // The olive buddy, asleep on the cushion.
    const buddy = new THREE.Group();
    buddy.position.set(0, 0.125, 0);
    const body = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 24), clay(0x9cb83a, { roughness: 0.4 }));
    body.scale.set(0.08, 0.098, 0.074);
    buddy.add(body);
    // Sleepy face: closed eyes (little arcs) and a tiny "o" mouth.
    const sleepy = new THREE.Group();
    const dark = clay(0x1a1a1a, { roughness: 0.3 });
    for (const side of [-1, 1]) {
      const eye = new THREE.Mesh(new THREE.TorusGeometry(0.13, 0.035, 6, 14, Math.PI), dark);
      eye.rotation.z = Math.PI;
      eye.position.set(side * 0.32, 0.18, 0.93);
      sleepy.add(eye);
      const cheek = new THREE.Mesh(new THREE.CircleGeometry(0.11, 14), new THREE.MeshBasicMaterial({ color: 0xff8fa3, transparent: true, opacity: 0.55 }));
      cheek.position.set(side * 0.5, -0.08, 0.86);
      cheek.rotation.y = side * 0.5;
      sleepy.add(cheek);
    }
    const mouth = new THREE.Mesh(new THREE.TorusGeometry(0.07, 0.03, 6, 14), dark);
    mouth.position.set(0, -0.15, 0.97);
    sleepy.add(mouth);
    body.add(sleepy);
    const awake = makeFace();
    awake.scale.setScalar(1);
    awake.visible = false;
    body.add(awake);
    buddy.rotation.z = 1.25; // lying on its side
    g.add(buddy);
    this.buddy = buddy;
    this.buddyBody = body;
    this.sleepyFace = sleepy;
    this.awakeFace = awake;
    return g;
  }

  buildBonnet() {
    const g = new THREE.Group();
    const dome = new THREE.Mesh(new THREE.SphereGeometry(0.09, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2), satin(0xa51f36));
    dome.scale.y = 0.75;
    g.add(dome);
    const band = new THREE.Mesh(new THREE.TorusGeometry(0.09, 0.014, 10, 40), satin(0x7d1428));
    band.rotation.x = Math.PI / 2;
    band.position.y = 0.006;
    g.add(band);
    g.rotation.z = 0.12;
    return g;
  }

  buildComb() {
    const g = new THREE.Group();
    const mat = clay(0x1e5631, { roughness: 0.45 });
    const spine = new THREE.Mesh(new RoundedBoxGeometry(0.24, 0.022, 0.045, 3, 0.01), mat);
    spine.position.y = 0.011;
    g.add(spine);
    const tooth = new RoundedBoxGeometry(0.013, 0.018, 0.065, 2, 0.006);
    for (let i = 0; i < 9; i++) {
      const t = new THREE.Mesh(tooth, mat);
      t.position.set(-0.1 + i * 0.025, 0.009, 0.05);
      g.add(t);
    }
    g.rotation.y = 0.35;
    return g;
  }

  buildZzz() {
    const tex = canvasTex(64, 64, (g) => {
      g.font = "900 54px system-ui, sans-serif";
      g.textAlign = "center";
      g.textBaseline = "middle";
      g.lineWidth = 8;
      g.strokeStyle = "#1e5631";
      g.strokeText("z", 32, 34);
      g.fillStyle = "#ffffff";
      g.fillText("z", 32, 34);
    });
    this.zzz = [0, 1, 2].map((i) => {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
      s.userData.phase = i / 3;
      this.stage.add(s);
      return s;
    });
  }

  // ---------- Taps ----------

  tappables() {
    return [
      { obj: this.jar, radius: 0.2, tap: () => this.tapJar() },
      { obj: this.canopy, radius: 0.16, tap: () => this.tapTree() },
      { obj: this.buddy, radius: 0.12, tap: () => this.tapBuddy() },
      { obj: this.spray, radius: 0.12, tap: () => this.tapSpray() },
      { obj: this.bonnet, radius: 0.1, tap: () => this.hop("bonnet") },
      { obj: this.comb, radius: 0.13, tap: () => this.hop("comb") },
      { obj: this.bowl, radius: 0.1, tap: () => this.hop("bowl") },
    ];
  }

  hop(name) {
    const p = this.props.find((x) => x.name === name);
    p.hopT = 0;
    sfx.boing(3);
  }

  tapBuddy() {
    if (this.awake > 0) { this.buddyJump = 0; sfx.giggle(); return; }
    this.awake = 4;
    this.buddyJump = 0;
    sfx.giggle();
  }

  tapJar() {
    this.lidPop = 1;
    sfx.squirt();
    const top = new THREE.Vector3(0, 0.26, 0);
    for (let i = 0; i < 14; i++) {
      const m = new THREE.Mesh(new THREE.SphereGeometry(1, 10, 8), this.goldMat);
      m.scale.setScalar(rand(0.008, 0.014));
      m.position.copy(top).add(this.jar.parent.position);
      this.stage.add(m);
      this.bits.push({ m, v: new THREE.Vector3(rand(-0.25, 0.25), rand(0.5, 0.8), rand(-0.15, 0.25)), life: 0, r: m.scale.x });
    }
  }

  tapTree() {
    this.treeShake = 1;
    sfx.bloop(2);
    const origin = this.canopy.getWorldPosition(new THREE.Vector3());
    this.stage.worldToLocal(origin);
    const mat = this.treeOlives[0].material;
    for (let i = 0; i < 4; i++) {
      const m = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 9), mat);
      m.scale.set(0.014, 0.018, 0.014);
      m.position.copy(origin).add(new THREE.Vector3(rand(-0.08, 0.08), -0.03, rand(0, 0.06)));
      this.stage.add(m);
      this.bits.push({ m, v: new THREE.Vector3(rand(-0.25, 0.1), rand(0.05, 0.2), rand(0.05, 0.3)), life: 0, r: 0.018, bounce: true });
    }
  }

  tapSpray() {
    this.sprayPress = 1;
    sfx.whoosh();
    const head = this.sprayHead.getWorldPosition(new THREE.Vector3());
    this.stage.worldToLocal(head);
    const dir = new THREE.Vector3(1, 0.1, 0).applyAxisAngle(new THREE.Vector3(0, 1, 0), -0.5);
    for (let i = 0; i < 16; i++) {
      const m = new THREE.Mesh(new THREE.SphereGeometry(1, 8, 6), new THREE.MeshBasicMaterial({ color: 0xdff3ff, transparent: true, opacity: 0.8 }));
      m.scale.setScalar(rand(0.004, 0.009));
      m.position.copy(head).addScaledVector(dir, 0.04);
      this.stage.add(m);
      this.mists.push({ m, v: dir.clone().multiplyScalar(rand(0.25, 0.45)).add(new THREE.Vector3(rand(-0.06, 0.06), rand(-0.04, 0.08), rand(-0.06, 0.06))), life: 0 });
    }
  }

  // ---------- Animation ----------

  // t: seconds since the diorama started building; time: clock seconds.
  update(t, time, dt) {
    this.root.visible = t > 0;
    if (!this.root.visible) return;

    // Base + tiles pop up in a wave.
    const bk = easeOutBack(t / 0.35);
    this.base.scale.set(Math.max(0.001, bk), 1, Math.max(0.001, bk));
    for (const tile of this.tiles) {
      const u = (t - 0.1 - tile.userData.delay) / 0.3;
      const k = Math.max(0.001, easeOutBack(u));
      tile.scale.set(k, k, k);
      tile.position.y = 0.025 + (1 - smooth(u)) * 0.12;
    }

    // Props drop in and land with a squash.
    for (const p of this.props) {
      const u = (t - 0.5 - p.delay) / 0.45;
      p.holder.visible = u > 0;
      if (u <= 0) continue;
      const fall = easeOutBounce(u);
      p.group.position.y = (1 - fall) * 0.55;
      let sx = 1, sy = 1;
      if (u >= 1) {
        if (!p.landed) {
          p.landed = true;
          sfx.pop(this.props.indexOf(p) + 2);
          this.hooks.land(p.holder);
        }
        const s = t - 0.5 - p.delay - 0.45;
        const w = Math.exp(-s * 8) * Math.cos(s * 22);
        sy = 1 - 0.22 * w;
        sx = 1 + 0.14 * w;
      }
      if (p.hopT !== undefined) {
        p.hopT += dt;
        const h = clamp01(p.hopT / 0.5);
        p.group.position.y += Math.sin(Math.PI * h) * 0.08;
        p.group.rotation.y += dt * 8 * (1 - h);
        if (h >= 1) p.hopT = undefined;
      }
      p.group.scale.set(sx, sy, sx);
      p.holder.children[0].material.opacity = clamp01(u * 2); // shadow fades in
    }

    // Idle life.
    let sway = Math.sin(time * 1.3) * 0.04;
    if (this.treeShake > 0) {
      this.treeShake = Math.max(0, this.treeShake - dt * 1.6);
      sway += Math.sin(time * 38) * 0.12 * this.treeShake;
    }
    this.canopy.rotation.z = sway;

    if (this.lidPop > 0) {
      this.lidPop = Math.max(0, this.lidPop - dt * 1.2);
      const k = Math.sin(Math.PI * (1 - this.lidPop));
      this.jarLid.position.y = 0.245 + k * 0.12;
      this.jarLid.rotation.z = k * 0.6;
    }
    if (this.sprayPress > 0) {
      this.sprayPress = Math.max(0, this.sprayPress - dt * 4);
      this.sprayHead.position.y = 0.195 - Math.sin(Math.PI * (1 - this.sprayPress)) * 0.01;
    }

    // The olive buddy: sleeps and breathes; wakes up when tapped.
    const sleeping = this.awake <= 0;
    if (!sleeping) this.awake -= dt;
    const target = sleeping ? 1.25 : 0;
    this.buddy.rotation.z += (target - this.buddy.rotation.z) * Math.min(1, dt * 6);
    const breathe = 1 + Math.sin(time * 2.2) * 0.04 * (sleeping ? 1 : 0.3);
    this.buddyBody.scale.set(0.08 * breathe, 0.098 / Math.sqrt(breathe), 0.074 * breathe);
    let jumpY = 0;
    if (this.buddyJump !== undefined) {
      this.buddyJump += dt;
      const j = clamp01(this.buddyJump / 0.6);
      jumpY = Math.sin(Math.PI * j) * 0.12;
      this.buddy.rotation.y = j * Math.PI * 2;
      if (j >= 1) { this.buddyJump = undefined; this.buddy.rotation.y = 0; }
    }
    this.buddy.position.y = 0.125 + jumpY + (sleeping ? 0 : Math.abs(Math.sin(time * 6)) * 0.01);
    this.sleepyFace.visible = sleeping;
    this.awakeFace.visible = !sleeping;

    // Zzz float up from the sleeping buddy.
    const head = new THREE.Vector3(-0.02, FLOOR + 0.2, 0.56);
    for (const z of this.zzz) {
      const k = (time * 0.4 + z.userData.phase) % 1;
      z.visible = sleeping && t > 1.4;
      z.position.set(head.x + k * 0.08 + Math.sin(k * 6) * 0.01, head.y + k * 0.22, head.z);
      const s = 0.03 + k * 0.035;
      z.scale.set(s, s, s);
      z.material.opacity = Math.sin(Math.PI * k);
    }

    // Flying bits (oil fountain, falling olives) and spray mist.
    const floorY = FLOOR + 0.01;
    for (let i = this.bits.length - 1; i >= 0; i--) {
      const b = this.bits[i];
      b.life += dt;
      b.v.y -= 1.6 * dt;
      b.m.position.addScaledVector(b.v, dt);
      if (b.m.position.y < floorY && b.v.y < 0 && Math.abs(b.m.position.x) < 0.62 && b.m.position.z < 0.86) {
        b.m.position.y = floorY;
        if (b.bounce) b.v.set(b.v.x * 0.7, -b.v.y * 0.45, b.v.z * 0.7);
        else { b.v.set(0, 0, 0); b.m.scale.y = b.r * 0.4; } // oil splats
      }
      if (b.life > 2.5) {
        this.stage.remove(b.m);
        this.bits.splice(i, 1);
      }
    }
    for (let i = this.mists.length - 1; i >= 0; i--) {
      const m = this.mists[i];
      m.life += dt;
      m.m.position.addScaledVector(m.v, dt);
      m.v.multiplyScalar(1 - dt * 2);
      m.m.material.opacity = 0.8 * (1 - m.life / 0.9);
      m.m.scale.multiplyScalar(1 + dt * 1.5);
      if (m.life > 0.9) {
        this.stage.remove(m.m);
        m.m.material.dispose();
        this.mists.splice(i, 1);
      }
    }
  }
}
