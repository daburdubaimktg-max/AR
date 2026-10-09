// Meet Ollie: a 3D pixel (voxel) olive who builds himself up out of the ORS logo,
// cube by cube, then waves, blinks, bobs and chats. Tap him to make him jump.
import * as THREE from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { sfx, unlock } from "./sfx.js";
import { Ollie } from "./ollie-character.js";
import { QUESTIONS, matchRoutine } from "./products.js";

const MINDAR_THREE = "https://cdn.jsdelivr.net/npm/mind-ar@1.2.5/dist/mindar-image-three.prod.js";
const TARGET = "targets/logo.mind";
const LINES = [
  "Hi! I'm Ollie 🫒",
  "I'm made of pixels... and olive oil!",
  "Wheee! Tap me again!",
  "Ready for your hair ritual?",
  "Nourished by Olive Oil ✨",
];

const $ = (id) => document.getElementById(id);

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
  anchor.onTargetLost = () => {
    ollie.lost();
    $("hint").hidden = false;
    $("tapTip").hidden = true;
    if (!quiz.on) { $("bubble").hidden = true; greeted = false; }
  };

  // ---- Hair Match, hosted by Ollie ----
  const quiz = { on: false, i: 0, answers: {}, labels: {} };
  const showMenu = () => { $("menu").hidden = false; };
  const ask = () => {
    const q = QUESTIONS[quiz.i];
    say(q.olive.replace("Hi! I'm Ollie 🫒 ", ""));
    $("qstep").textContent = `QUESTION ${quiz.i + 1}/${QUESTIONS.length}`;
    const opts = $("opts");
    opts.replaceChildren();
    q.options.forEach((o, k) => {
      const b = document.createElement("button");
      b.className = "opt";
      b.style.animationDelay = `${0.25 + k * 0.08}s`;
      const icon = document.createElement("span");
      icon.textContent = o.emoji;
      b.append(icon, o.label);
      b.onclick = () => answer(q, o, b);
      opts.append(b);
    });
  };
  const answer = (q, o, b) => {
    if (quiz.busy) return;
    quiz.busy = true;
    b.classList.add("picked");
    quiz.answers[q.id] = o.id;
    quiz.labels[q.id] = o.label;
    ollie.hop();
    sfx.pop(quiz.i + 3);
    if (navigator.vibrate) navigator.vibrate(10);
    setTimeout(() => {
      quiz.busy = false;
      quiz.i++;
      if (quiz.i < QUESTIONS.length) ask();
      else finish();
    }, 550);
  };
  const finish = () => {
    $("quiz").hidden = true;
    const r = matchRoutine(quiz.answers);
    ollie.dance();
    sfx.fanfare();
    say("Ta-da! Here's your ritual ✨");
    $("rTitle").textContent = [quiz.labels.type, quiz.labels.concern, quiz.labels.style].join(" · ");
    $("rFocus").textContent = r.focus;
    $("rSteps").replaceChildren(...r.steps.map((st) => {
      const li = document.createElement("li");
      const b = document.createElement("b");
      b.textContent = st.title.toUpperCase();
      const name = document.createElement("span");
      name.textContent = `ORS ${st.product.name}`;
      const how = document.createElement("small");
      how.textContent = st.how;
      li.append(b, name, how);
      return li;
    }));
    $("rCoach").href = `ritual.html?${new URLSearchParams(quiz.answers)}`;
    try { localStorage.setItem("ors-ar-routine", JSON.stringify({ answers: quiz.answers, labels: quiz.labels })); } catch { /* ignore */ }
    setTimeout(() => { $("result").hidden = false; }, 1400);
  };
  const startQuiz = () => {
    Object.assign(quiz, { on: true, i: 0, answers: {}, labels: {}, busy: false });
    $("menu").hidden = true;
    $("result").hidden = true;
    $("tapTip").hidden = true;
    $("quiz").hidden = false;
    ollie.hop();
    ask();
  };
  $("matchBtn").onclick = startQuiz;
  $("rAgain").onclick = startQuiz;

  $("ar").addEventListener("pointerdown", () => {
    if (!ollie.tap()) return;
    $("tapTip").hidden = true;
    if (!quiz.on) {
      line = (line + 1) % LINES.length;
      say(LINES[line]);
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
      setTimeout(() => {
        if (!ollie.active || quiz.on) return;
        say("Want me to find your hair ritual?");
        showMenu();
        $("tapTip").hidden = false;
      }, 2600);
    }
    // Keep the speech bubble above Ollie's head.
    if (!$("bubble").hidden) {
      ollie.head.getWorldPosition(head).project(camera);
      const r = $("ar").getBoundingClientRect();
      const half = $("bubble").offsetWidth / 2 + 8;
      $("bubble").style.left = `${Math.min(r.width - half, Math.max(half, ((head.x + 1) / 2) * r.width))}px`;
      const minTop = $("bubble").offsetHeight + 16; // keep it on screen
      $("bubble").style.top = `${Math.max(minTop, ((1 - head.y) / 2) * r.height - 12)}px`;
    }
  });
}

$("startBtn").onclick = start;
