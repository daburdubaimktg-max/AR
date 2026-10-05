"""Trace the flat parts of the ORS Olive Oil logo into polygons for 3D extrusion.

Reads targets/logo-source.png (transparent PNG of the logo) and writes
targets/logo-shapes.json with outlines (in logo.png pixel coordinates) for:
  letters  - each letter of OLIVE / OIL (green), left to right, top row first
  tm       - the green (TM) after OLIVE
  pill     - the red rounded pill, with ORS cut out as holes
  ors      - the white ORS letters (incl. the oil drop) inside the pill

Usage: pip install opencv-python-headless pillow numpy && python3 tools/vectorize_logo.py
"""
import json
from pathlib import Path

import cv2
import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
CROP = (207, 162, 915, 732)  # matches targets/logo.png
UP = 4                       # trace at 4x for smooth curves
EPS = 1.2                    # polygon simplification, in upscaled px

im = Image.open(ROOT / "targets/logo-source.png").convert("RGBA").crop(CROP)
a = np.asarray(im).astype(int)
r, g, b, al = (a[..., i] for i in range(4))
vis = al > 128

green = vis & (abs(r - 30) < 40) & (abs(g - 86) < 40) & (abs(b - 49) < 40)
red = vis & (r > 120) & (r - g > 60)


def trace(mask):
    """Mask -> list of {outer, holes} polygons in logo px."""
    m = cv2.GaussianBlur(mask.astype(np.float32), (3, 3), 0)
    m = cv2.resize(m, None, fx=UP, fy=UP, interpolation=cv2.INTER_CUBIC)
    m = (m > 0.5).astype(np.uint8)
    contours, hier = cv2.findContours(m, cv2.RETR_CCOMP, cv2.CHAIN_APPROX_NONE)
    shapes = []
    if hier is None:
        return shapes
    pts = lambda c: [[round(float(x) / UP, 2), round(float(y) / UP, 2)]
                     for x, y in cv2.approxPolyDP(c, EPS, True)[:, 0, :]]
    for i, c in enumerate(contours):
        if hier[0][i][3] != -1 or cv2.contourArea(c) < 8 * UP * UP:
            continue
        holes = []
        j = hier[0][i][2]
        while j != -1:
            if cv2.contourArea(contours[j]) > 4 * UP * UP:
                holes.append(pts(contours[j]))
            j = hier[0][j][0]
        shapes.append({"outer": pts(c), "holes": holes})
    return shapes


n, lab, st, _ = cv2.connectedComponentsWithStats(green.astype(np.uint8), 8)
letters, tm = [], np.zeros_like(green)
for i in range(1, n):
    x, y, w, h, area = st[i]
    if area > 4000:                       # big glyphs: O L I V E O I L
        letters.append((y > 300, x, i))
    elif 640 < x and 290 < y < 330:       # the TM after OLIVE
        tm |= lab == i
letters.sort()
out = {
    "size": [im.width, im.height],
    "letters": [trace(lab == i) for _, _, i in letters],
    "tm": trace(tm),
}

pill_filled = cv2.morphologyEx(red.astype(np.uint8), cv2.MORPH_CLOSE, np.ones((5, 5), np.uint8))
cnts, _ = cv2.findContours(pill_filled, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
solid = np.zeros_like(pill_filled)
cv2.drawContours(solid, [max(cnts, key=cv2.contourArea)], -1, 1, -1)
out["pill"] = trace(solid.astype(bool))
inner = solid.astype(bool) & ~red
inner = cv2.morphologyEx(inner.astype(np.uint8), cv2.MORPH_OPEN, np.ones((2, 2), np.uint8)).astype(bool)
out["ors"] = trace(inner)


(ROOT / "targets/logo-shapes.json").write_text(json.dumps(out, separators=(",", ":")))
print("letters", len(out["letters"]), "tm", len(out["tm"]), "pill", len(out["pill"]), "ors", len(out["ors"]),
      "points", sum(len(s["outer"]) + sum(map(len, s["holes"])) for k in ("letters",) for l in out[k] for s in l))
