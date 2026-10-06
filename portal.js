// The olive-grove portal: the logo on the stall wall opens into a window onto a
// sunlit olive grove, with a giant ORS jar pouring a river of liquid gold that
// spills out of the frame into the real world. Units: logo widths, logo centre
// at the origin, +z towards the viewer. The grove lives behind the wall (z < 0)
// and is only visible through the window, thanks to an invisible "occluder".
import * as THREE from "three";

const clamp01 = (t) => Math.max(0, Math.min(1, t));
const smooth = (t) => { t = clamp01(t); return t * t * (3 - 2 * t); };
const easeOutBack = (t) => { t = clamp01(t); return 1 + 2.4 * Math.pow(t - 1, 3) + 1.4 * Math.pow(t - 1, 2); };
const rand = (a, b) => a + Math.random() * (b - a);

// Deterministic pseudo-random so the grove looks the same every time.
function seeded(seed) {
  let s = seed;
  return () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; };
}

function roundRect(path, w, h, r) {
  const x = -w / 2, y = -h / 2;
  r = Math.min(r, w / 2, h / 2);
  path.moveTo(x + r, y);
  path.lineTo(x + w - r, y);
  path.quadraticCurveTo(x + w, y, x + w, y + r);
  path.lineTo(x + w, y + h - r);
  path.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  path.lineTo(x + r, y + h);
  path.quadraticCurveTo(x, y + h, x, y + h - r);
  path.lineTo(x, y + r);
  path.quadraticCurveTo(x, y, x + r, y);
  return path;
}

function canvasTex(w, h, draw) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  draw(c.getContext("2d"), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class OliveGrovePortal {
  // win: { w, h } window size (logo units); leafGeometry(len, width) from the reveal;
  // dropGeo / goldMat: the reveal's oil drop.
  constructor({ win, leafGeometry, dropGeo, goldMat, logoSrc }) {
    this.win = win;
    this.dropGeo = dropGeo;
    this.goldMat = goldMat;
    this.root = new THREE.Group();
    this.root.visible = false;
    this.floorY = -win.h / 2;
    this.open = 0;

    // --- The occluder: an invisible wall with a window cut out of it. It writes
    // depth but no colour, so the camera image shows through while anything
    // behind the wall (the grove) is hidden outside the window.
    this.occluderMat = new THREE.MeshBasicMaterial({ colorWrite: false });
    this.occluder = new THREE.Mesh(new THREE.BufferGeometry(), this.occluderMat);
    this.occluder.position.z = -0.002;
    this.occluder.renderOrder = -10;
    this.root.add(this.occluder);
    this.setHole(0.001);

    // --- Golden frame around the window.
    const rimPts = roundRect(new THREE.Path(), win.w, win.h, 0.06).getSpacedPoints(120)
      .map((p) => new THREE.Vector3(p.x, p.y, 0));
    this.rim = new THREE.Mesh(
      new THREE.TubeGeometry(new THREE.CatmullRomCurve3(rimPts, true), 160, 0.014, 10, true),
      new THREE.MeshPhysicalMaterial({
        color: 0xf0b323, metalness: 0.9, roughness: 0.18, clearcoat: 1, emissive: 0x6a4000, emissiveIntensity: 0.6,
      }),
    );
    this.rim.position.z = 0.012;
    this.root.add(this.rim);

    // --- The grove (all behind the wall).
    this.grove = new THREE.Group();
    this.root.add(this.grove);
    this.buildSky();
    this.buildGround();
    this.buildHills();
    this.buildTrees();
    this.buildJar(logoSrc);
    this.buildRiver();

    // --- Things that come out of the portal.
    this.leafGeo = leafGeometry(0.07, 0.026);
    this.leafMat = new THREE.MeshStandardMaterial({ color: 0x6f8f3a, side: THREE.DoubleSide, roughness: 0.6 });
    this.flyers = [];
    this.falls = [];
    this.oliveBits = [];
    this.miniOlive = new THREE.SphereGeometry(0.018, 12, 9).scale(1, 1.25, 1);
    this.miniOliveMat = new THREE.MeshPhysicalMaterial({ color: 0x9cb83a, roughness: 0.35, clearcoat: 0.6 });
    this.butterflies = Array.from({ length: 5 }, (_, i) => this.makeButterfly(i));
    this.leafTimer = 0;
    this.fallTimer = 0;
    this.gushTime = 0;
  }

  setHole(s) {
    const shape = roundRect(new THREE.Shape(), 40, 40, 0);
    shape.holes = [roundRect(new THREE.Path(), this.win.w * s, this.win.h * s, 0.06 * s)];
    this.occluder.geometry.dispose();
    this.occluder.geometry = new THREE.ShapeGeometry(shape, 8);
  }

  buildSky() {
    const sky = new THREE.Mesh(
      new THREE.PlaneGeometry(16, 8),
      new THREE.MeshBasicMaterial({
        toneMapped: false,
        map: canvasTex(64, 512, (g, w, h) => {
          const grad = g.createLinearGradient(0, 0, 0, h);
          grad.addColorStop(0, "#5f9fd6");
          grad.addColorStop(0.55, "#a9d1ea");
          grad.addColorStop(0.72, "#fbe3a6");
          grad.addColorStop(1, "#f6c96b");
          g.fillStyle = grad;
          g.fillRect(0, 0, w, h);
        }),
      }),
    );
    sky.position.set(0, this.floorY + 3.2, -5);
    this.grove.add(sky);

    // Warm sun with a soft glow.
    const sun = new THREE.Mesh(
      new THREE.PlaneGeometry(1.6, 1.6),
      new THREE.MeshBasicMaterial({
        transparent: true, depthWrite: false, toneMapped: false, blending: THREE.AdditiveBlending,
        map: canvasTex(128, 128, (g) => {
          const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
          grad.addColorStop(0, "rgba(255,250,220,1)");
          grad.addColorStop(0.18, "rgba(255,236,170,1)");
          grad.addColorStop(0.35, "rgba(255,210,120,.45)");
          grad.addColorStop(1, "rgba(255,200,100,0)");
          g.fillStyle = grad;
          g.fillRect(0, 0, 128, 128);
        }),
      }),
    );
    sun.position.set(0.55, this.floorY + 1.2, -4.9);
    this.sun = sun;
    this.grove.add(sun);
  }

  buildGround() {
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(16, 5),
      new THREE.MeshStandardMaterial({ color: 0xa7ad62, roughness: 0.95 }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(0, this.floorY, -2.5);
    this.grove.add(ground);
  }

  buildHills() {
    const layers = [
      { z: -4.4, color: 0x9fb48a, base: 0.55, amp: 0.35, seed: 3 },
      { z: -3.6, color: 0x7f9a5c, base: 0.32, amp: 0.25, seed: 7 },
      { z: -2.8, color: 0x6d8b4a, base: 0.16, amp: 0.16, seed: 11 },
    ];
    for (const l of layers) {
      const r = seeded(l.seed);
      const s = new THREE.Shape();
      s.moveTo(-8, 0);
      const phase = r() * 6;
      for (let i = 0; i <= 40; i++) {
        const x = -8 + (16 * i) / 40;
        s.lineTo(x, l.base + Math.sin(x * 1.3 + phase) * l.amp * 0.6 + Math.sin(x * 3.1 + phase * 2) * l.amp * 0.25);
      }
      s.lineTo(8, 0);
      const m = new THREE.Mesh(new THREE.ShapeGeometry(s, 4), new THREE.MeshStandardMaterial({ color: l.color, roughness: 1 }));
      m.position.set(0, this.floorY, l.z);
      this.grove.add(m);
    }
  }

  buildTrees() {
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x6b5a45, roughness: 0.9 });
    const leafMats = [
      new THREE.MeshStandardMaterial({ color: 0x7d9455, roughness: 0.8, flatShading: true }),
      new THREE.MeshStandardMaterial({ color: 0x95a96d, roughness: 0.8, flatShading: true }),
      new THREE.MeshStandardMaterial({ color: 0x627c3f, roughness: 0.8, flatShading: true }),
    ];
    const oliveMat = new THREE.MeshStandardMaterial({ color: 0x3f5a22, roughness: 0.4 });
    const blob = new THREE.IcosahedronGeometry(1, 1);
    const berry = new THREE.SphereGeometry(1, 8, 6);
    const r = seeded(42);
    this.trees = [];
    const rows = [-0.75, -1.3, -1.9, -2.5, -3.1];
    rows.forEach((z, ri) => {
      for (let k = 0; k < 7; k++) {
        const x = -1.7 + k * 0.57 + (r() - 0.5) * 0.25 + (ri % 2) * 0.28;
        if (Math.abs(x) < 0.32 && z > -2.2) continue; // keep the jar + river corridor clear
        if (r() < 0.15) continue;
        const h = 0.75 + r() * 0.35;
        const tree = new THREE.Group();
        tree.position.set(x, this.floorY, z);
        // Gnarled trunk: two leaning segments.
        const lean = (r() - 0.5) * 0.4;
        const t1 = new THREE.Mesh(new THREE.CylinderGeometry(0.02 * h, 0.035 * h, 0.22 * h, 7), trunkMat);
        t1.position.y = 0.11 * h;
        t1.rotation.z = lean;
        const t2 = new THREE.Mesh(new THREE.CylinderGeometry(0.014 * h, 0.02 * h, 0.16 * h, 7), trunkMat);
        t2.position.set(-Math.sin(lean) * 0.2 * h, 0.28 * h, 0);
        t2.rotation.z = -lean * 0.8;
        tree.add(t1, t2);
        // Silvery canopy of blobs.
        const canopy = new THREE.Group();
        canopy.position.set(-Math.sin(lean) * 0.22 * h, 0.38 * h, 0);
        for (let b = 0; b < 7; b++) {
          const m = new THREE.Mesh(blob, leafMats[Math.floor(r() * 3)]);
          const s = (0.07 + r() * 0.05) * h;
          m.scale.set(s * 1.35, s * 0.8, s * 1.1);
          m.position.set((r() - 0.5) * 0.26 * h, (r() - 0.3) * 0.12 * h, (r() - 0.5) * 0.16 * h);
          canopy.add(m);
        }
        for (let o = 0; o < 6; o++) {
          const m = new THREE.Mesh(berry, oliveMat);
          m.scale.set(0.009 * h, 0.012 * h, 0.009 * h);
          m.position.set((r() - 0.5) * 0.28 * h, (r() - 0.6) * 0.1 * h, 0.07 * h);
          canopy.add(m);
        }
        tree.add(canopy);
        tree.scale.setScalar(0.001);
        this.grove.add(tree);
        this.trees.push({ tree, canopy, h, delay: (3.1 + z) * 0.08 + r() * 0.1, shake: 0, phase: r() * 6 });
      }
    });
  }

  buildJar(logoSrc) {
    const jar = new THREE.Group();
    const white = new THREE.MeshPhysicalMaterial({ color: 0xf7f6f0, roughness: 0.25, clearcoat: 1 });
    const red = new THREE.MeshPhysicalMaterial({ color: 0xa51f36, roughness: 0.3, clearcoat: 1 });
    const prof = [[0, 0], [0.15, 0], [0.175, 0.02], [0.18, 0.06], [0.18, 0.3], [0.165, 0.33], [0.13, 0.345], [0.13, 0.36]]
      .map(([x, y]) => new THREE.Vector2(x, y));
    jar.add(new THREE.Mesh(new THREE.LatheGeometry(prof, 48), white));
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.07, 48), red);
    cap.position.set(0.16, 0.36, 0.05); // the lid lies open beside the jar
    cap.rotation.z = -1.2;
    jar.add(cap);
    // Label with the real logo.
    const tex = new THREE.TextureLoader().load(logoSrc);
    tex.colorSpace = THREE.SRGBColorSpace;
    const label = new THREE.Mesh(
      new THREE.CylinderGeometry(0.182, 0.182, 0.2, 48, 1, true, -Math.PI * 0.42, Math.PI * 0.84),
      new THREE.MeshPhysicalMaterial({ map: tex, roughness: 0.4, clearcoat: 0.6 }),
    );
    label.position.y = 0.17;
    jar.add(label);
    // A golden surface of oil just inside the rim.
    const oil = new THREE.Mesh(new THREE.CircleGeometry(0.128, 32), this.goldMat);
    oil.rotation.x = -Math.PI / 2;
    oil.position.y = 0.35;
    jar.add(oil);

    jar.position.set(0, this.floorY, -1.35);
    jar.rotation.x = 0.55; // tipped towards you, pouring
    jar.scale.setScalar(0.001);
    this.jar = jar;
    this.grove.add(jar);
    this.jarScale = 1.25;

    // The pour from the rim down to the river.
    const rim = new THREE.Vector3(0, 0.36 * this.jarScale, 0).applyAxisAngle(new THREE.Vector3(1, 0, 0), 0.55)
      .add(jar.position);
    const land = new THREE.Vector3(0, this.floorY + 0.005, -0.95);
    const pour = new THREE.CatmullRomCurve3([rim, new THREE.Vector3(0, rim.y + 0.02, rim.z + 0.12), new THREE.Vector3(0, (rim.y + land.y) / 2, land.z - 0.08), land]);
    this.pourTex = this.flowTexture();
    this.pour = new THREE.Mesh(
      new THREE.TubeGeometry(pour, 32, 0.035, 12, false),
      new THREE.MeshPhysicalMaterial({
        color: 0xf2b72a, map: this.pourTex, metalness: 0.5, roughness: 0.1, clearcoat: 1,
        emissive: 0x8a5a00, emissiveIntensity: 0.7, transparent: true, opacity: 0.95,
      }),
    );
    this.pour.geometry.setDrawRange(0, 0);
    this.pourCount = this.pour.geometry.index.count;
    this.grove.add(this.pour);
  }

  flowTexture() {
    const t = canvasTex(64, 256, (g, w, h) => {
      g.fillStyle = "#f0b323";
      g.fillRect(0, 0, w, h);
      for (let i = 0; i < 40; i++) {
        g.fillStyle = `rgba(255,${230 + Math.random() * 25},${150 + Math.random() * 80},${0.25 + Math.random() * 0.4})`;
        const y = Math.random() * h, x = Math.random() * w;
        g.beginPath();
        g.ellipse(x, y, 2 + Math.random() * 6, 6 + Math.random() * 18, 0, 0, Math.PI * 2);
        g.fill();
      }
    });
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    return t;
  }

  buildRiver() {
    // A winding ribbon of gold from the jar to the window sill.
    const N = 60, start = -0.95, end = 0.0;
    const pos = [], uv = [], idx = [];
    for (let i = 0; i <= N; i++) {
      const t = i / N;
      const z = start + (end - start) * t;
      const x = Math.sin(t * Math.PI * 1.6) * 0.1 * (1 - t * 0.6);
      const w = 0.07 + t * 0.09;
      pos.push(x - w, this.floorY + 0.004, z, x + w, this.floorY + 0.004, z);
      uv.push(0, t * 4, 1, t * 4);
      if (i < N) {
        const a = i * 2;
        idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    this.riverTex = this.flowTexture();
    this.river = new THREE.Mesh(geo, new THREE.MeshPhysicalMaterial({
      color: 0xf2b72a, map: this.riverTex, metalness: 0.5, roughness: 0.12, clearcoat: 1,
      emissive: 0x8a5a00, emissiveIntensity: 0.6, side: THREE.DoubleSide,
    }));
    this.riverIdx = idx.length;
    geo.setDrawRange(0, 0);
    this.grove.add(this.river);
    this.riverMouth = { x: 0, halfW: 0.16 }; // where it spills over the sill
  }

  makeButterfly(i) {
    const wingTex = canvasTex(64, 64, (g) => {
      g.fillStyle = i % 2 ? "#f6c64a" : "#ffffff";
      g.beginPath();
      g.ellipse(36, 24, 24, 18, -0.4, 0, Math.PI * 2);
      g.fill();
      g.beginPath();
      g.ellipse(30, 46, 16, 12, 0.4, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = i % 2 ? "rgba(165,31,54,.8)" : "rgba(240,179,35,.9)";
      g.beginPath();
      g.arc(40, 22, 6, 0, Math.PI * 2);
      g.fill();
    });
    const mat = new THREE.MeshBasicMaterial({ map: wingTex, transparent: true, side: THREE.DoubleSide, depthWrite: false });
    const b = new THREE.Group();
    const wings = [-1, 1].map((side) => {
      const pivot = new THREE.Group();
      const w = new THREE.Mesh(new THREE.PlaneGeometry(0.05, 0.05), mat);
      w.position.x = 0.025;
      pivot.add(w);
      pivot.scale.x = side;
      b.add(pivot);
      return pivot;
    });
    b.visible = false;
    this.root.add(b);
    return { b, wings, t: -1 - i * 0.5, seed: i * 1.7 };
  }

  // A burst of golden oil out of the jar (tap the jar).
  gush() {
    this.gushTime = 1.2;
    for (let i = 0; i < 18; i++) this.spawnFall(true);
  }

  // Shake a tree (tap a tree): olives drop and roll out of the portal.
  shakeTree(i) {
    const t = this.trees[i];
    t.shake = 1;
    for (let k = 0; k < 4; k++) {
      const m = new THREE.Mesh(this.miniOlive, this.miniOliveMat);
      const p = t.canopy.getWorldPosition(new THREE.Vector3());
      this.root.worldToLocal(p);
      m.position.set(p.x + rand(-0.08, 0.08), p.y, p.z + 0.05);
      this.root.add(m);
      this.oliveBits.push({ m, v: new THREE.Vector3(rand(-0.1, 0.1), rand(0.1, 0.3), rand(0.4, 0.7)), life: 0 });
    }
  }

  spawnFall(big = false) {
    const m = new THREE.Mesh(this.dropGeo, this.goldMat);
    const s = big ? rand(0.025, 0.04) : rand(0.015, 0.025);
    m.scale.set(s, s * 1.3, s);
    const mx = this.riverMouth.x + rand(-1, 1) * this.riverMouth.halfW;
    m.position.set(mx, this.floorY + 0.01, big ? -0.6 : 0.005);
    this.root.add(m);
    this.falls.push({
      m, v: new THREE.Vector3(rand(-0.05, 0.05), big ? rand(0.3, 0.6) : 0, big ? rand(0.6, 0.9) : rand(0.08, 0.16)), life: 0,
    });
  }

  spawnLeaf() {
    const m = new THREE.Mesh(this.leafGeo, this.leafMat);
    m.position.set(rand(-0.4, 0.4), rand(-0.2, 0.3), rand(-1.2, -0.4));
    m.rotation.set(rand(0, 6), rand(0, 6), rand(0, 6));
    this.root.add(m);
    this.flyers.push({ m, v: new THREE.Vector3(rand(-0.15, 0.15), rand(-0.02, 0.08), rand(0.35, 0.6)), spin: rand(-4, 4), life: 0 });
  }

  // open: 0..1 opening progress (can exceed 1 afterwards); time: clock seconds.
  update(open, time, dt) {
    const o = clamp01(open);
    this.root.visible = open > 0;
    if (!this.root.visible) return;

    // Iris the window open.
    const s = Math.max(0.001, easeOutBack(o));
    if (Math.abs(s - this.open) > 1e-4) {
      this.setHole(Math.min(s, 1.04));
      this.open = s;
    }
    this.rim.scale.setScalar(s);
    this.rim.material.emissiveIntensity = 0.6 + Math.sin(time * 3) * 0.25;

    // Grove grows in: trees pop up from the ground back to front, the jar rises and pours.
    for (const t of this.trees) {
      const k = easeOutBack((open - 0.25 - t.delay) / 0.45);
      t.tree.scale.setScalar(Math.max(0.001, k));
      let sway = Math.sin(time * 1.2 + t.phase) * 0.03;
      if (t.shake > 0) {
        t.shake = Math.max(0, t.shake - dt * 1.5);
        sway += Math.sin(time * 40) * 0.12 * t.shake;
      }
      t.canopy.rotation.z = sway;
    }
    const jk = easeOutBack((open - 0.45) / 0.5);
    this.jar.scale.setScalar(Math.max(0.001, jk * this.jarScale));
    const pourK = clamp01((open - 0.8) / 0.35);
    this.pour.geometry.setDrawRange(0, Math.floor((this.pourCount * pourK) / 3) * 3);
    const riverK = clamp01((open - 1.0) / 0.6);
    this.river.geometry.setDrawRange(0, Math.floor((this.riverIdx * riverK) / 3) * 3);
    this.pourTex.offset.y -= dt * (1.2 + this.gushTime);
    this.riverTex.offset.y -= dt * (0.8 + this.gushTime);
    this.gushTime = Math.max(0, this.gushTime - dt);
    this.sun.material.opacity = 0.85 + Math.sin(time * 0.8) * 0.15;

    // Waterfall over the sill, out into the real world.
    if (riverK >= 1) {
      this.fallTimer -= dt;
      if (this.fallTimer <= 0) {
        this.spawnFall();
        this.fallTimer = 0.08;
      }
    }
    for (let i = this.falls.length - 1; i >= 0; i--) {
      const f = this.falls[i];
      f.life += dt;
      f.v.y -= 1.4 * dt;
      f.m.position.addScaledVector(f.v, dt);
      if (f.m.position.y < this.floorY - 0.6 || f.life > 3) {
        this.root.remove(f.m);
        this.falls.splice(i, 1);
      }
    }

    // Leaves drift out of the portal towards you.
    if (open > 1) {
      this.leafTimer -= dt;
      if (this.leafTimer <= 0) {
        this.spawnLeaf();
        this.leafTimer = rand(0.25, 0.6);
      }
    }
    for (let i = this.flyers.length - 1; i >= 0; i--) {
      const f = this.flyers[i];
      f.life += dt;
      f.m.position.addScaledVector(f.v, dt);
      f.m.position.x += Math.sin(f.life * 3 + i) * 0.003;
      f.m.rotation.x += f.spin * dt;
      f.m.rotation.z += f.spin * 0.5 * dt;
      if (f.life > 4) {
        this.root.remove(f.m);
        this.flyers.splice(i, 1);
      }
    }

    // Olives shaken from trees bounce on the sill and roll out.
    for (let i = this.oliveBits.length - 1; i >= 0; i--) {
      const b = this.oliveBits[i];
      b.life += dt;
      b.v.y -= 1.6 * dt;
      b.m.position.addScaledVector(b.v, dt);
      if (b.m.position.y < this.floorY + 0.018 && b.m.position.z < 0 && b.v.y < 0) {
        b.m.position.y = this.floorY + 0.018;
        b.v.y *= -0.45;
      }
      if (b.life > 3) {
        this.root.remove(b.m);
        this.oliveBits.splice(i, 1);
      }
    }

    // Butterflies fly out and loop around the stall.
    for (const bf of this.butterflies) {
      if (open < 1.1) continue;
      bf.t += dt;
      if (bf.t < 0) continue;
      const T = bf.t;
      if (T > 9) { bf.t = -rand(1, 4); bf.b.visible = false; continue; }
      bf.b.visible = true;
      const out = smooth(T / 2.5);
      const ang = T * 0.9 + bf.seed;
      bf.b.position.set(
        Math.sin(ang) * 0.55 * out + Math.sin(bf.seed) * 0.1 * (1 - out),
        0.05 + Math.sin(T * 1.3 + bf.seed) * 0.18,
        -0.8 + (0.8 + 0.25 + Math.cos(ang) * 0.15) * out,
      );
      bf.b.rotation.y = -ang;
      const flap = Math.sin(T * 22 + bf.seed) * 1.1;
      bf.wings[0].rotation.y = flap;
      bf.wings[1].rotation.y = flap;
    }
  }
}
