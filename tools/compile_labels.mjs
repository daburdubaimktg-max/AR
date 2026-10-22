import { chromium } from "playwright";
import fs from "fs";
// Compiles targets/labels/*.png into labels.mind (order = LABELS in check.js).
// Run from the repo root with a local server on :8765: python3 -m http.server 8765 & node tools/compile_labels.mjs
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium", args: ["--ignore-certificate-errors","--enable-unsafe-swiftshader"] });
const p = await b.newPage();
p.on("pageerror", e => console.log("PAGEERROR", e.message));
await p.goto("http://localhost:8765/");
const r = await p.evaluate(async () => {
  const { Compiler } = await import("https://cdn.jsdelivr.net/npm/mind-ar@1.2.5/dist/mindar-image.prod.js");
  const imgs = [];
  for (const src of ["targets/labels/sheen-genuine-za.png", "targets/labels/sheen-fake-coconut.png"]) {
    const img = new Image(); img.src = src; await img.decode(); imgs.push(img);
  }
  const c = new Compiler();
  const data = await c.compileImageTargets(imgs, () => {});
  const buf = new Uint8Array(await c.exportData());
  let s=""; for (let i=0;i<buf.length;i+=0x8000) s+=String.fromCharCode(...buf.subarray(i,i+0x8000));
  return [btoa(s), data.map(d => d.matchingData.map(m=>m.maximaPoints.length+m.minimaPoints.length))];
});
fs.writeFileSync("targets/labels/labels.mind", Buffer.from(r[0], "base64"));
console.log("matching pts", JSON.stringify(r[1]));
await b.close();
