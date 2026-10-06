# AR Stickers

A browser-based AR sticker camera. No install, no build step — just open it on your phone.

- **Face stickers** — tap a sticker while your face is in view and it snaps to a spot (crown on your head, shades on your eyes, nose on your nose…) and follows your face as you move and tilt.
- **Free stickers** — turn *Face lock* off to drop stickers anywhere in the scene.
- **Your own stickers** — "+ Your sticker" adds any image (transparent PNGs work best).
- **Move / resize / rotate** — drag with one finger, pinch and twist with two. On desktop: drag, scroll to resize, Shift+scroll to rotate.
- **Capture** — the shutter button snaps a photo with the stickers baked in; save or share it.
- **Front/back camera** switch.

Face tracking uses [MediaPipe Face Landmarker](https://ai.google.dev/edge/mediapipe/solutions/vision/face_landmarker), running entirely on-device. Nothing is uploaded.

## Logo AR (`logo.html`): scan → hair ritual

The scan is the doorway to something useful, not just an animation:

1. **Brand moment (about 4s):** point the camera at the ORS Olive Oil logo (on the jar, a shelf strip, a print ad) and it comes to life in 3D. The print fades under a soft veil, the pill pops, the letters leap out with tricks, the olives pop like popcorn and wake up, a wreath grows, and the whole logo zooms up off the page and floats, bigger than the print. Timings are the `T_*` constants and `REVEAL_SPEED` in `logo.js`; `PRINT_FADE` sets how much the print is veiled.
2. **✨ Hair Match:** the olive mascot asks 3 questions in the AR view (hair type, main need, how you wear it) and builds a personal **ORS Olive Oil routine**: cleanse → condition → moisturise → style (+ edges), using real ORS Olive Oil products. It can be saved or shared as a branded card image, or opened in the Ritual Coach.
3. **🧴 Ritual Coach (`ritual.html`):** a selfie-camera guide that tracks your face on-device and shows where and how to apply your matched products: a glowing path along the hairline, circular-massage guides on the temples, brush-stroke arrows for edges, a crown-to-ends path. It has timers, optional voice guidance and haptics. Finishing stamps a **7-day streak** card (kept on the phone), a hook for loyalty and rewards.
4. **Extras:** tap letters and olives to play, the *Catch the oil* mini-game, and 📸 photo snaps.

Why this shape: scanning the pack becomes *personal advice → the right products → using them well → coming back*, which is discovery, cross-sell, usage frequency and retention, rather than a one-off animation.

**Content to review before launch** (all in `products.js`):
- the product catalogue (names from orshaircare.com; links are kept in `products.js` for later but not shown, as there is no shopping in this version),
- the question wording, the step "how to" lines and the focus tips (kept plain: no product claims),
- the mascot name "Ollie" (a placeholder).

Product matching is a simple tag score in `matchRoutine()`, so it's easy to tune or replace with your own regimen rules. The Ritual Coach steps and timings are in `buildSteps()` in `ritual.js`.

**How the 3D logo is made.** The letters and pill are traced from the real artwork, so they keep the exact brand letterforms:

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
| `logo.html`, `logo.css`, `logo.js` | Logo-scanning 3D AR experience and mini-game |
| `sfx.js` | Synthesised sound effects (Web Audio) |
| `products.js` | ORS Olive Oil catalogue, Hair Match questions and routine matching |
| `ritual.html`, `ritual.css`, `ritual.js` | Ritual Coach: face-tracked application guide + streak |
| `targets/` | Logo artwork, traced shapes and the MindAR tracking target |
| `tools/vectorize_logo.py` | Traces the logo artwork into `targets/logo-shapes.json` |

Add built-in stickers by editing `PRESETS` in `app.js`. Each has an emoji and a face placement (`x`, `y`, size `s`) measured in eye-widths from the bridge of the nose.
