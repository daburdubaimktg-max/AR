# AR Stickers

A browser-based AR sticker camera. No install, no build step — just open it on your phone.

- **Face stickers** — tap a sticker while your face is in view and it snaps to a spot (crown on your head, shades on your eyes, nose on your nose…) and follows your face as you move and tilt.
- **Free stickers** — turn *Face lock* off to drop stickers anywhere in the scene.
- **Your own stickers** — "+ Your sticker" adds any image (transparent PNGs work best).
- **Move / resize / rotate** — drag with one finger, pinch and twist with two. On desktop: drag, scroll to resize, Shift+scroll to rotate.
- **Capture** — the shutter button snaps a photo with the stickers baked in; save or share it.
- **Front/back camera** switch.

Face tracking uses [MediaPipe Face Landmarker](https://ai.google.dev/edge/mediapipe/solutions/vision/face_landmarker), running entirely on-device. Nothing is uploaded.

## Logo AR (`logo.html`)

Point the camera at the **ORS Olive Oil** logo and the logo itself comes to life in 3D, like a cartoon:

1. **Wake-up:** the printed logo trembles and rumbles.
2. **Pill pops:** the red pill bursts up, the O, R and S jump out of it (the R twirls), and the drop in the "O" squirts a fountain of golden oil.
3. **Letters leap:** each letter crouches, then leaps out of the paper with its own trick (O rolls like a wheel, L backflips, I pogos, V cartwheels, E spins) and lands with a squash, each with a rising note.
4. **Olive popcorn:** the olives pop off the page one by one, spin, land, open their eyes and wink.
5. **Finale:** the logo lifts off the paper, the letters do a musical stadium wave, the olives cheer and confetti falls.

The timings and moves live in the constants above `class LogoReveal` in `logo.js` (`LETTER_MOVES`, `T_PILL`, `T_LETTERS`, …).

**Play with it**
- **Olive buddies:** after the reveal the three olives open their eyes and smile; they blink and look around. Every so often one hops out and bounces across the tops of O‑L‑I‑V‑E (which squish as it lands), and the letters do a stadium wave.
- **Musical letters:** tap a letter to make it jump and play a note, so O‑L‑I‑V‑E‑O‑I‑L is a little keyboard. Tap an olive and it giggles and flips. Tap the red pill to squirt oil, or tap anywhere else to spin the whole logo.
- **Catch the oil (mini-game):** 25 seconds of golden drops raining from the ORS "O". Tap to catch them; bright bonus drops are worth +3, streaks build a combo, and a bottle fills as you score. It ends with olive-and-leaf confetti, a title and your best score (saved on the device). Tune it in `GAME` in `logo.js`.
- **📸 Snap:** captures the camera view with the 3D logo and an ORS badge, ready to save or share.
- **Sound:** pops, boings, drips and a chime, all synthesised in `sfx.js` (no audio files). Use 🔊 to mute. Image tracking uses [MindAR](https://github.com/hiukim/mind-ar-js); rendering uses three.js.

**How the 3D logo is made.** The letters and pill are traced from the real artwork, so they keep the exact brand letterforms:

- `targets/logo-source.png` is the original transparent logo.
- `tools/vectorize_logo.py` traces it to `targets/logo-shapes.json`, which `logo.js` extrudes into 3D.
- The olive sprig is modelled in `logo.js` (`SPRIG`) to sit over the printed one.
- `targets/logo.png` and `targets/logo.mind` are the tracking image and its compiled MindAR target.

Edit the `BRAND` block in `logo.js` for the tagline, button text, shop link and colours. Add `?debug` to the URL to get `window.reveal` and `window.game` in the console (e.g. `reveal.age = 0` replays the reveal, `reveal.startHop()` sends an olive hopping).

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
| `targets/` | Logo artwork, traced shapes and the MindAR tracking target |
| `tools/vectorize_logo.py` | Traces the logo artwork into `targets/logo-shapes.json` |

Add built-in stickers by editing `PRESETS` in `app.js`. Each has an emoji and a face placement (`x`, `y`, size `s`) measured in eye-widths from the bridge of the nose.
