# AR Stickers

A browser-based AR sticker camera. No install, no build step — just open it on your phone.

- **Face stickers** — tap a sticker while your face is in view and it snaps to a spot (crown on your head, shades on your eyes, nose on your nose…) and follows your face as you move and tilt.
- **Free stickers** — turn *Face lock* off to drop stickers anywhere in the scene.
- **Your own stickers** — "+ Your sticker" adds any image (transparent PNGs work best).
- **Move / resize / rotate** — drag with one finger, pinch and twist with two. On desktop: drag, scroll to resize, Shift+scroll to rotate.
- **Capture** — the shutter button snaps a photo with the stickers baked in; save or share it.
- **Front/back camera** switch.

Face tracking uses [MediaPipe Face Landmarker](https://ai.google.dev/edge/mediapipe/solutions/vision/face_landmarker), running entirely on-device. Nothing is uploaded.

## Logo AR (`orsoliveoilarsticker/`): scan → hair ritual

The scan is the doorway to something useful, not just an animation:

1. **Brand moment (about 5s), built for a big logo on the stall wall:** the letters leap out of the print, then a golden iris opens the wall into an **olive-grove portal** (`portal.js`): trees pop up, a giant ORS jar pours a river of liquid gold that spills over the frame into the real stall, and leaves and golden butterflies fly out. The 3D logo flies out at you and settles as a sign floating in front of the portal, framed by the olive wreath. Tap the jar for a gush of gold or a tree to shake its olives loose. Timings are the `T_*` constants in `logo.js`; the sign's position is `SIGN`.
2. **✨ Hair Match:** the olive mascot asks 3 questions in the AR view (hair type, main need, how you wear it) and builds a personal **ORS Olive Oil routine**: cleanse → condition → moisturise → style (+ edges), using real ORS Olive Oil products. It can be saved or shared as a branded card image, or opened in the Ritual Coach.
3. **🧴 Ritual Coach (`ritual.html`):** a selfie-camera guide that tracks your face on-device and walks through a practical at-home moisture routine with your matched products: prep (damp hair) → section into 4 (part lines drawn on your head) → moisturise mid-lengths to ends (arrows down the lengths) → fingertip scalp massage (circles on the temples) → edges (brush strokes) → finish & protect (try on a satin bonnet). The wording adapts to hair type, need and style. It has timers, optional voice guidance and haptics. Finishing stamps a **7-day streak** card (kept on the phone), a hook for loyalty and rewards.
4. **Extras:** tap letters and olives to play, the *Catch the oil* mini-game (with a how-to card and 3-2-1 countdown), and 📸 photo snaps.

Why this shape: scanning the pack becomes *personal advice → the right products → using them well → coming back*, which is discovery, cross-sell, usage frequency and retention, rather than a one-off animation.

**Content to review before launch** (all in `products.js`):
- the product catalogue (names from orshaircare.com; links are kept in `products.js` for later but not shown, as there is no shopping in this version),
- the question wording, the step "how to" lines and the focus tips (kept plain: no product claims),
- the mascot name "Ollie" (a placeholder).

Product matching is a simple tag score in `matchRoutine()`, so it's easy to tune or replace with your own regimen rules. The Ritual Coach steps and timings are in `buildSteps()` in `ritual.js`.

**How the 3D logo is made.** The 3D logo is the modelled `targets/ors-logo-3d.glb` (bevelled enamel letters, the red ORS badge, textured olives, veined leaves); `useHero()` in `logo.js` maps it onto the printed logo. If it can't load, the page falls back to shapes traced from the real artwork:

- `targets/logo-source.png` is the original transparent logo.
- `tools/vectorize_logo.py` traces it to `targets/logo-shapes.json`, which `logo.js` extrudes into 3D.
- The olive sprig is modelled in `logo.js` (`SPRIG`) to sit over the printed one.
- `targets/logo.png` and `targets/logo.mind` are the tracking image and its compiled MindAR target.

Add `?debug` to the URL to get `window.reveal`, `window.game` and `window.match` in the console (e.g. `reveal.age = 0` replays the reveal).

## Try it

The camera only works over HTTPS (or `localhost`).

**On your phone (GitHub Pages):** in the repo go to *Settings → Pages → Build and deployment → Source* and pick **GitHub Actions**. The `Deploy to GitHub Pages` workflow then publishes the site on every push; the URL appears in the workflow run.

**Locally:**

```sh
python3 -m http.server 8000
# open http://localhost:8000
```

## Files

| File | What it does |
| --- | --- |
| `index.html` | Page layout and controls |
| `style.css` | Styling |
| `app.js` | Camera, face tracking, sticker placement, gestures, capture |
| `orsoliveoilarsticker/index.html`, `logo.css`, `logo.js` | Logo-scanning 3D AR experience and mini-game |
| `sfx.js` | Synthesised sound effects (Web Audio) |
| `products.js` | ORS Olive Oil catalogue, Hair Match questions and routine matching |
| `portal.js` | The olive-grove portal behind the wall logo |
| `ritual.html`, `ritual.css`, `ritual.js` | Ritual Coach: face-tracked application guide + streak |
| `targets/` | Logo artwork, traced shapes and the MindAR tracking target |
| `tools/vectorize_logo.py` | Traces the logo artwork into `targets/logo-shapes.json` |

Add built-in stickers by editing `PRESETS` in `app.js`. Each has an emoji and a face placement (`x`, `y`, size `s`) measured in eye-widths from the bridge of the nose.
