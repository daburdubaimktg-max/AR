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

Point the camera at the **ORS Olive Oil** logo and it comes to life: an olive branch wreath grows around it, a golden oil drop falls into the drop in the ORS "O", olives pop out of the logo's olive sprig, sparkles float up, and a tagline banner appears with *Shop now* and *Olive selfie* buttons. Tap the screen for a burst of oil.

Image tracking uses [MindAR](https://github.com/hiukim/mind-ar-js) with three.js.

**The logo** is built in: `targets/logo.png` is the ORS Olive Oil logo and `targets/logo.mind` is its compiled tracking data, so the page goes straight to the camera. To swap in a different image, replace both (compile with the [MindAR compiler](https://hiukim.github.io/mind-ar-js-doc/tools/compile)) and update `logoAspect`, `dropSpot` and `oliveSpot` in `BRAND`. Without a `logo.mind`, the page lets you pick a logo photo and learns it on the phone.

Tracking works best on a detailed, high-contrast image, e.g. the full front label of the jar or bottle, rather than a plain flat logo.

Edit the `BRAND` block in `logo.js` for the tagline, button text, shop link and colours.

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
| `logo.html`, `logo.css`, `logo.js` | Logo-scanning AR experience |
| `targets/` | Pre-built image-tracking targets (`logo.mind`) |

Add built-in stickers by editing `PRESETS` in `app.js`. Each has an emoji and a face placement (`x`, `y`, size `s`) measured in eye-widths from the bridge of the nose.
