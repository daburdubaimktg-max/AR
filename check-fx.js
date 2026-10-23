// "Comes to life" moment for a genuine scan: sparkles spiral up the can, the 3D ORS
// logo (targets/ors-logo-3d.glb) springs out of it with a spin, olives and gold
// confetti burst, then the logo floats gently. Drawn on a transparent canvas over
// the camera, placed using the on-screen scan frame (the can is inside it).

import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";

const HERO = "targets/ors-logo-3d.glb";
const CAM_Z = 5, FOV = 40;
const RISE = 1.1;    // seconds for the logo to spring out
const BURST_AT = 0.55;

const easeOutBack = (t) => 1 + 2.4 * (t - 1) ** 3 + 1.4 * (t - 1) ** 2;
const clamp01 = (t) => Math.min(1, Math.max(0, t));

function sparkleTexture() {
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const g = c.getContext("2d");
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, "rgba(255,255,240,1)");
  grd.addColorStop(0.25, "rgba(255,220,120,.9)");
  grd.addColorStop(1, "rgba(255,200,80,0)");
  g.fillStyle = grd;
  g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

export class ComeAlive {
  constructor() {
    const r = (this.renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true }));
    r.setPixelRatio(Math.min(devicePixelRatio, 2));
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.setClearColor(0x000000, 0);
    Object.assign(r.domElement.style, { position: "fixed", inset: "0", zIndex: "8", pointerEvents: "none" });
    r.domElement.hidden = true;
    document.body.append(r.domElement);

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(FOV, 1, 0.1, 50);
    this.camera.position.z = CAM_Z;
    const pm = new THREE.PMREMGenerator(r);
    this.scene.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x445533, 0.5));
    const key = new THREE.DirectionalLight(0xfff4e0, 1.2);
    key.position.set(-1, 2, 3);
    this.scene.add(key);

    this.hero = new THREE.Group();
    this.scene.add(this.hero);
    this.ready = new GLTFLoader().loadAsync(HERO).then(({ scene }) => {
      const extras = [];
      scene.traverse((o) => { if (o.isCamera || o.isLight) extras.push(o); });
      extras.forEach((o) => o.removeFromParent());
      // Model space (X right, -Z up, +Y towards the viewer) -> upright logo, centred, 1 unit wide.
      scene.applyMatrix4(new THREE.Matrix4().makeRotationX(Math.PI / 2));
      const box = new THREE.Box3().setFromObject(scene);
      const size = box.getSize(new THREE.Vector3()), c = box.getCenter(new THREE.Vector3());
      const holder = new THREE.Group();
      scene.position.sub(c);
      holder.add(scene);
      holder.scale.setScalar(1 / size.x);
      this.hero.add(holder);
    }).catch((err) => console.warn("3D logo not loaded", err));

    // Confetti: little olives, gold and red flakes.
    const oliveGeo = new THREE.SphereGeometry(0.035, 14, 10).scale(1, 1.25, 1);
    const flakeGeo = new THREE.PlaneGeometry(0.06, 0.035);
    const mats = [
      new THREE.MeshPhysicalMaterial({ color: 0x9cb83a, roughness: 0.35, clearcoat: 0.8 }),
      new THREE.MeshStandardMaterial({ color: 0xe8b923, metalness: 0.6, roughness: 0.3, side: THREE.DoubleSide }),
      new THREE.MeshStandardMaterial({ color: 0xa51f36, roughness: 0.4, side: THREE.DoubleSide }),
    ];
    this.bits = Array.from({ length: 60 }, (_, i) => {
      const m = new THREE.Mesh(i % 3 === 0 ? oliveGeo : flakeGeo, mats[i % 3]);
      m.visible = false;
      this.scene.add(m);
      return { m, v: new THREE.Vector3(), spin: new THREE.Vector3() };
    });

    // Sparkles that spiral up around the can.
    this.N = 90;
    this.sparkGeo = new THREE.BufferGeometry();
    this.sparkGeo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(this.N * 3), 3));
    this.sparks = new THREE.Points(this.sparkGeo, new THREE.PointsMaterial({
      map: sparkleTexture(), size: 0.12, transparent: true, depthWrite: false,
      blending: THREE.AdditiveBlending, toneMapped: false,
    }));
    this.scene.add(this.sparks);

    this.active = false;
    addEventListener("resize", () => this.resize());
    this.resize();
  }

  resize() {
    this.renderer.setSize(innerWidth, innerHeight);
    this.camera.aspect = innerWidth / innerHeight;
    this.camera.updateProjectionMatrix();
    this.wpp = (2 * CAM_Z * Math.tan(THREE.MathUtils.degToRad(FOV / 2))) / innerHeight; // world units per CSS px
  }

  world(x, y) {
    return new THREE.Vector3((x - innerWidth / 2) * this.wpp, (innerHeight / 2 - y) * this.wpp, 0);
  }

  // rect: the scan frame on screen (the can is inside it).
  play(rect) {
    this.resize();
    this.can = {
      top: this.world(rect.left + rect.width / 2, rect.top),
      mid: this.world(rect.left + rect.width / 2, rect.top + rect.height * 0.55),
      bottom: this.world(rect.left + rect.width / 2, rect.bottom),
      r: (rect.width / 2) * this.wpp,
    };
    const w = Math.min(rect.width * 1.35, innerWidth * 0.7) * this.wpp;
    this.size = w;
    this.home = this.world(innerWidth / 2, Math.max(rect.top + rect.height * 0.25, innerHeight * 0.27));
    this.t = 0;
    this.burst = false;
    this.bits.forEach((b) => { b.m.visible = false; });
    this.hero.visible = true;
    this.renderer.domElement.hidden = false;
    if (!this.active) {
      this.active = true;
      let last = performance.now();
      const loop = (now) => {
        if (!this.active) return;
        this.update(Math.min((now - last) / 1000, 0.05));
        last = now;
        requestAnimationFrame(loop);
      };
      requestAnimationFrame(loop);
    }
  }

  stop() {
    this.active = false;
    this.renderer.domElement.hidden = true;
  }

  update(dt) {
    const t = (this.t += dt);
    const { can } = this;

    // Logo: out of the can, spinning, overshoot, then a gentle float.
    const k = clamp01(t / RISE);
    const e = easeOutBack(k);
    this.hero.position.lerpVectors(can.mid, this.home, Math.min(e, 1.08));
    if (t > RISE) this.hero.position.y += Math.sin((t - RISE) * 2.2) * 0.03;
    this.hero.scale.setScalar(this.size * Math.max(0.05, e));
    this.hero.rotation.y = t < RISE ? (1 - k) ** 2 * Math.PI * 2 : Math.sin((t - RISE) * 1.3) * 0.25;
    this.hero.rotation.x = t > RISE ? Math.sin((t - RISE) * 1.7) * 0.06 : 0;

    // Sparkles spiral up the can for the first second, then drift around the logo.
    const pos = this.sparkGeo.attributes.position.array;
    for (let i = 0; i < this.N; i++) {
      const f = i / this.N;
      const p = clamp01(t * 1.3 - f * 0.5);
      const a = f * Math.PI * 10 + t * 4;
      let x, y, z;
      if (p < 1) {
        x = can.bottom.x + Math.cos(a) * can.r * 1.05;
        y = can.bottom.y + (can.top.y - can.bottom.y) * p;
        z = Math.sin(a) * can.r * 0.5;
      } else {
        const rr = this.size * (0.55 + 0.15 * Math.sin(f * 20 + t));
        x = this.hero.position.x + Math.cos(a * 0.3) * rr;
        y = this.hero.position.y + Math.sin(a * 0.3) * rr * 0.6;
        z = Math.sin(a) * 0.2;
      }
      pos[i * 3] = x; pos[i * 3 + 1] = y; pos[i * 3 + 2] = z;
    }
    this.sparkGeo.attributes.position.needsUpdate = true;
    this.sparks.material.opacity = t < 2 ? 1 : Math.max(0.35, 1 - (t - 2) * 0.4);

    // Confetti burst as the logo pops out.
    if (!this.burst && t >= BURST_AT) {
      this.burst = true;
      for (const b of this.bits) {
        b.m.visible = true;
        b.m.position.copy(this.hero.position);
        const a = Math.random() * Math.PI * 2, sp = 1.2 + Math.random() * 1.6;
        b.v.set(Math.cos(a) * sp, Math.abs(Math.sin(a)) * sp + 1, (Math.random() - 0.3) * 1.5);
        b.spin.set(Math.random() * 8, Math.random() * 8, Math.random() * 8);
      }
    }
    for (const b of this.bits) {
      if (!b.m.visible) continue;
      b.v.y -= 3.2 * dt;
      b.v.multiplyScalar(1 - 0.6 * dt);
      b.m.position.addScaledVector(b.v, dt);
      b.m.rotation.x += b.spin.x * dt; b.m.rotation.y += b.spin.y * dt; b.m.rotation.z += b.spin.z * dt;
      if (b.m.position.y < -3) b.m.visible = false;
    }

    this.renderer.render(this.scene, this.camera);
  }
}
