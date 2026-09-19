# Robot cap. 05 — aspetto identico allo Spline — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** il robot del cap. 05 appare identico alla scena Spline originale (materiali, occhi a LED, luce, inquadratura), con la «A» di Axxell bianca lucida sul petto, il cervello visibile solo col cursore sulla testa e nessun movimento del corpo oltre alla testa che segue il cursore.

**Architecture:** la scena resta three.js r128 nostra (GLB già estratto). Uno strumento di sviluppo **fuori dal repo** legge dalla scena Spline viva parametri, texture, video, camera e luce e scrive nel repo un file dati JS + le texture. Un nuovo modulo materiali riscrive in GLSL nostro gli strati Spline (colore, planare/triplanare, bump, matcap, rainbow, Blinn-Phong / GGX con una point light) e li assegna alle 80 mesh per indice. Harness Playwright fuori dal repo confronta a coppie Spline vs nostro.

**Tech Stack:** three.js r128 UMD (globale, da cdnjs), GLSL ES (WebGL2, fallback WebGL1 con estensioni), Playwright + pngjs (solo strumenti), ffmpeg (solo strumenti).

**Spec:** `docs/superpowers/specs/2026-09-19-robot-aspetto-spline-design.md` (rev. 2) — leggerla prima di ogni task.

## Global Constraints

- Ramo locale `robot-look-spline` in `~/Progetti/axxell-site-robot`. **Mai `git push`.** Commit locali soltanto.
- A runtime la pagina **non** fa richieste a `spline.design` né a `unpkg` (three r128 resta da cdnjs, `index.html:560`).
- Strumenti di estrazione/verifica e GLSL di riferimento Spline vivono in `~/Progetti/file-sciolti/robot-spline-tools/` — **mai** nel repo (repo pubblico, servito così com'è).
- Nel repo entrano solo: `website-creation/assets/robot-spline/**` (dati JS generato, texture, `eyes.mp4`, `eyes-poster.png`, `logo-axxell-icon.svg`) e il codice del sito.
- Pipeline colore come Spline: valori uniform **grezzi**, texture senza decodifica (`LinearEncoding`), shader **senza** `encodings_fragment`, nessun tone mapping.
- Niente levitazione, niente drag. Unica interazione del corpo: testa che segue il cursore.
- Cervello: nessun punto disegnato a riposo (`points.visible = hoverHead > 0.01`).
- Fibre braccia: **spente a riposo**, accese solo col cursore sul braccio.
- Mobile fuori scope. Nessuna ombra portata (verifica sulle coppie).
- Viewport di riferimento **1440×900, DPR 1**. Verifica aggiuntiva 1280×720.
- Le cartelle `~/Progetti/file-sciolti/robot-confronto/` ricevono gli screenshot per Nike.
- Scena Spline: `https://prod.spline.design/kZDDjO5HuC9GJUM2/scene.splinecode`, viewer `@splinetool/viewer@1.9.82`.

## Mappa dei file

| File | Stato | Responsabilità |
|---|---|---|
| `~/Progetti/file-sciolti/robot-spline-tools/package.json` | nuovo (fuori repo) | dipendenze strumenti |
| `…/robot-spline-tools/ref/index.html` | nuovo | pagina di riferimento Spline «solo» |
| `…/robot-spline-tools/lib.mjs` | nuovo | server statico, avvio browser, costanti, ritagli |
| `…/robot-spline-tools/shot.mjs` | nuovo | screenshot di `ref` o `site` in una posa |
| `…/robot-spline-tools/confronta.mjs` | nuovo | IoU silhouette, cima testa, differenza media, immagine affiancata |
| `…/robot-spline-tools/estrai.mjs` | nuovo | estrazione dati/texture/video dalla scena Spline → repo |
| `…/robot-spline-tools/verifica-dati.mjs` | nuovo | asserzioni sul file dati estratto |
| `…/robot-spline-tools/prova.mjs` | nuovo | controlli comportamentali sulla pagina del sito |
| `website-creation/assets/robot-spline/*` | nuovo (generato) | dati, texture, video, logo |
| `website-creation/js/robot-spline-glsl.js` | nuovo | sorgenti vertex/fragment degli strati Spline |
| `website-creation/js/robot-spline-materials.js` | nuovo | costruisce materiali, texture, video, logo; assegna per indice |
| `website-creation/js/robot.js` | modifica | camera/luce da dati, niente ricentratura/levitazione/drag, reveal, logo light, teardown |
| `website-creation/js/robot-parts.js` | modifica | soglia braccia relativa al centro X del bbox |
| `website-creation/js/robot-fibers.js` | modifica | spente a riposo |
| `website-creation/js/robot-materials.js` | **eliminato** (Task 5) | sostituito |
| `website-creation/index.html` | modifica | via titolo/copy, nuovi script, cache-bust |
| `website-creation/css/sections.css` | modifica | stage senza filtro/blend/velo, `inset:0` |

---

### Task 1: Strumenti di confronto (fuori dal repo)

**Files:**
- Create: `~/Progetti/file-sciolti/robot-spline-tools/package.json`
- Create: `~/Progetti/file-sciolti/robot-spline-tools/ref/index.html`
- Create: `~/Progetti/file-sciolti/robot-spline-tools/lib.mjs`
- Create: `~/Progetti/file-sciolti/robot-spline-tools/shot.mjs`
- Create: `~/Progetti/file-sciolti/robot-spline-tools/confronta.mjs`

**Interfaces:**
- Produces: `node shot.mjs <ref|site> <out.png> [--w 1440] [--h 900] [--pose rest|hover-head|cursor:X,Y] [--solo] [--logo-off] [--wait ms]` → PNG + riga JSON `{errors:[], blocked:[], ...}` su stdout. `--solo` = solo il canvas del robot su sfondo trasparente.
- Produces: `node confronta.mjs <a.png> <b.png> <out.png> [--crop x,y,w,h]` → PNG affiancato (A | B | differenza×4) + JSON `{iou, headTopA, headTopB, meanDiff, pxA, pxB}` su stdout.
- Produces: `lib.mjs` esporta `REPO`, `TOOLS`, `OUT`, `CROPS`, `serve(root)`, `launch()`.

- [ ] **Step 1: Crea la cartella e le dipendenze**

```bash
mkdir -p ~/Progetti/file-sciolti/robot-spline-tools/ref ~/Progetti/file-sciolti/robot-spline-tools/out
cd ~/Progetti/file-sciolti/robot-spline-tools
cat > package.json <<'EOF'
{ "name": "robot-spline-tools", "private": true, "type": "module",
  "dependencies": { "playwright": "^1.55.0", "pngjs": "^7.0.0" } }
EOF
npm i --no-audit --no-fund && npx playwright install chromium
```
Expected: `added N packages`; chromium già in cache o scaricato.

- [ ] **Step 2: Pagina di riferimento Spline**

`ref/index.html`:
```html
<!doctype html><meta charset="utf-8"><title>ref spline</title>
<style>html,body{margin:0;height:100%;background:#050608}spline-viewer{width:100vw;height:100vh;display:block}</style>
<script type="module" src="https://unpkg.com/@splinetool/viewer@1.9.82/build/spline-viewer.js"></script>
<spline-viewer url="https://prod.spline.design/kZDDjO5HuC9GJUM2/scene.splinecode"></spline-viewer>
```

- [ ] **Step 3: `lib.mjs`**

```js
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

export const TOOLS = path.dirname(new URL(import.meta.url).pathname);
export const REPO = process.env.ROBOT_REPO || path.join(process.env.HOME, 'Progetti/axxell-site-robot');
export const OUT = path.join(process.env.HOME, 'Progetti/file-sciolti/robot-confronto');
// Ritagli a 1440×900 (sezione allineata in cima alla finestra), dal riferimento Spline.
export const CROPS = {
  testa: [630, 110, 180, 200],
  petto: [580, 315, 280, 330],
  braccio: [320, 320, 280, 450],
  gambe: [560, 640, 320, 260]
};
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml', '.mp4': 'video/mp4', '.glb': 'model/gltf-binary', '.bin': 'application/octet-stream',
  '.wasm': 'application/wasm', '.woff2': 'font/woff2', '.txt': 'text/plain' };

export function serve(root) {
  return new Promise((ok) => {
    const s = http.createServer((req, res) => {
      let f = path.join(root, decodeURIComponent(new URL(req.url, 'http://x').pathname));
      if (!f.startsWith(root)) { res.writeHead(403); return res.end(); }
      if (fs.existsSync(f) && fs.statSync(f).isDirectory()) f = path.join(f, 'index.html');
      if (!fs.existsSync(f)) { res.writeHead(404); return res.end(); }
      res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' });
      fs.createReadStream(f).pipe(res);
    });
    s.listen(0, () => ok({ url: `http://localhost:${s.address().port}`, close: () => s.close() }));
  });
}

export function launch() {
  return chromium.launch({ args: ['--use-angle=metal', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
}

export function arg(name, def) {
  const i = process.argv.indexOf('--' + name);
  if (i < 0) return def;
  const v = process.argv[i + 1];
  return v === undefined || v.startsWith('--') ? true : v;
}
```

- [ ] **Step 4: `shot.mjs`**

```js
import { serve, launch, arg, REPO, TOOLS } from './lib.mjs';

const [what, out] = process.argv.slice(2);
if (!['ref', 'site'].includes(what) || !out) { console.error('uso: node shot.mjs <ref|site> <out.png> [--w --h --pose --solo --wait]'); process.exit(2); }
const W = +arg('w', 1440), H = +arg('h', 900), pose = arg('pose', 'rest'), solo = !!arg('solo', false);
const wait = +arg('wait', what === 'ref' ? 14000 : 3000);

const srv = await serve(what === 'ref' ? TOOLS + '/ref' : REPO);
const b = await launch();
const p = await b.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
const errors = [], blocked = [];
p.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 240)); });
p.on('pageerror', (e) => errors.push('pageerror: ' + e.message.slice(0, 240)));
p.on('request', (r) => { if (what === 'site' && /spline\.design|unpkg\.com/.test(r.url())) blocked.push(r.url()); });

if (what === 'ref') {
  await p.goto(srv.url + '/index.html', { waitUntil: 'load' });
} else {
  await p.goto(srv.url + '/website-creation/index.html#cap05', { waitUntil: 'load' });
  await p.addStyleTag({ content: 'html{scroll-behavior:auto!important}' });
  await p.evaluate(() => document.getElementById('cap05').scrollIntoView({ block: 'start' }));
  await p.waitForFunction(() => window.__robot && window.__robot.parts, null, { timeout: 30000 });
  await p.evaluate(() => document.getElementById('cap05').scrollIntoView({ block: 'start' }));
}
await p.waitForTimeout(wait);

if (pose === 'hover-head' && what === 'site') {
  const pt = await p.evaluate(() => {
    const r = window.__robot, v = new THREE.Vector3();
    new THREE.Box3().setFromObject(r.parts.visor || r.headGroup).getCenter(v);
    v.project(r.camera);
    const rc = r.renderer.domElement.getBoundingClientRect();
    return { x: rc.left + (v.x + 1) / 2 * rc.width, y: rc.top + (1 - v.y) / 2 * rc.height };
  });
  await p.mouse.move(pt.x, pt.y, { steps: 8 });
  await p.waitForTimeout(1500);
} else if (typeof pose === 'string' && pose.startsWith('cursor:')) {
  const [x, y] = pose.slice(7).split(',').map(Number);
  await p.mouse.move(x, y, { steps: 8 });
  await p.waitForTimeout(1500);
}

if (arg('logo-off', false) && what === 'site') await p.evaluate(() => window.__robot.spline && window.__robot.spline.logo && window.__robot.spline.logo.setOn(false));
if (solo) {
  if (what === 'site') {
    await p.addStyleTag({ content: `html,body,.wc-robot-card,#cap05{background:transparent!important}
      body *{visibility:hidden!important} #wcRobotStage,#wcRobotStage canvas{visibility:visible!important}` });
  } else {
    await p.addStyleTag({ content: 'html,body{background:transparent!important}' });
    await p.evaluate(() => { const v = document.querySelector('spline-viewer'); const l = v && v.shadowRoot && v.shadowRoot.querySelector('#logo'); if (l) l.style.display = 'none'; });
  }
  await p.waitForTimeout(300);
}
await p.screenshot({ path: out, omitBackground: solo, clip: { x: 0, y: 0, width: W, height: H } });
console.log(JSON.stringify({ out, errors, blocked }));
await b.close(); srv.close();
process.exit(errors.length || blocked.length ? 1 : 0);
```

- [ ] **Step 5: `confronta.mjs`**

```js
import fs from 'node:fs';
import { PNG } from 'pngjs';
import { arg } from './lib.mjs';

const [fa, fb, out] = process.argv.slice(2).filter((s) => !s.startsWith('--') && !/^\d+,/.test(s));
const A = PNG.sync.read(fs.readFileSync(fa)), B = PNG.sync.read(fs.readFileSync(fb));
if (A.width !== B.width || A.height !== B.height) { console.error('dimensioni diverse'); process.exit(2); }
const crop = arg('crop', null);
const [cx, cy, cw, ch] = crop ? crop.split(',').map(Number) : [0, 0, A.width, A.height];

const px = (img, x, y) => { const i = (y * img.width + x) * 4; const a = img.data[i + 3] / 255;
  return [img.data[i] * a, img.data[i + 1] * a, img.data[i + 2] * a, img.data[i + 3]]; };
let inter = 0, union = 0, pa = 0, pb = 0, diff = 0, topA = -1, topB = -1;
const o = new PNG({ width: cw * 3, height: ch });
for (let y = 0; y < ch; y++) {
  let rowA = 0, rowB = 0;
  for (let x = 0; x < cw; x++) {
    const a = px(A, cx + x, cy + y), b = px(B, cx + x, cy + y);
    const ma = a[3] > 8, mb = b[3] > 8;
    if (ma) { pa++; rowA++; } if (mb) { pb++; rowB++; }
    if (ma || mb) union++;
    const d = (Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2])) / 3;
    if (ma && mb) { inter++; diff += d; }
    const put = (ox, r, g, bb) => { const j = (y * o.width + ox) * 4; o.data[j] = r; o.data[j + 1] = g; o.data[j + 2] = bb; o.data[j + 3] = 255; };
    put(x, a[0], a[1], a[2]); put(cw + x, b[0], b[1], b[2]); const g = Math.min(255, d * 4); put(2 * cw + x, g, g, g);
  }
  if (topA < 0 && rowA >= 3) topA = cy + y;
  if (topB < 0 && rowB >= 3) topB = cy + y;
}
fs.writeFileSync(out, PNG.sync.write(o));
const r = { iou: union ? +(inter / union).toFixed(4) : 1, headTopA: topA, headTopB: topB, meanDiff: inter ? +(diff / inter).toFixed(2) : 0, pxA: pa, pxB: pb };
console.log(JSON.stringify(r));
```

- [ ] **Step 6: Verifica degli strumenti sul riferimento stesso e baseline**

```bash
cd ~/Progetti/file-sciolti/robot-spline-tools
node shot.mjs ref out/ref-solo.png --solo
node confronta.mjs out/ref-solo.png out/ref-solo.png out/ref-vs-ref.png
```
Expected: JSON con `"iou":1`, `"meanDiff":0`, `headTopA` = `headTopB` ≈ 120–130.

```bash
node shot.mjs site out/site-baseline-solo.png --solo
node confronta.mjs out/ref-solo.png out/site-baseline-solo.png ~/Progetti/file-sciolti/robot-confronto/00-baseline.png
```
Expected: `iou` molto sotto 0.97 (robot attuale ricentrato e inquadrato diversamente). Annota i numeri nel report del task. Niente commit (fuori repo).

---

### Task 2: Estrazione dei dati Spline → repo

**Files:**
- Create: `~/Progetti/file-sciolti/robot-spline-tools/estrai.mjs`
- Create: `~/Progetti/file-sciolti/robot-spline-tools/verifica-dati.mjs`
- Create (generati): `website-creation/assets/robot-spline/robot-spline-data.js`, `…/textures/*.png`, `…/eyes.mp4`, `…/eyes-poster.png`, `…/logo-axxell-icon.svg`

**Interfaces:**
- Produces: `window.WC.robotSplineData` con questa forma (tutti numeri reali, array di numeri, nessun segnaposto):
```js
{ version: 1,
  camera: { fov, zoom, near, far, position: [x,y,z], quaternion: [x,y,z,w] },
  light: { worldPosition: [x,y,z], color: [r,g,b], distance, decay },   // color = valore uniform (già ×π)
  ambient: [r,g,b], probe: [[r,g,b] ×9],
  materials: {
    Head:  { base:{color:[3],alpha}, video:{src,poster,flipY,mat:[9],size:[2],crop,alpha,mode},
             light:{specular:[3],shininess,alpha,mode}, matcap:{tex,flipY,alpha,mode,rotation},
             rainbow:{film,movement,wavelengths:[3],offset:[3],noiseStrength,alpha,mode} },
    Body:  { base, tri:{tex,flipY,wrapS,wrapT,texSize:[2],mat:[9],size:[2],blending,alpha,mode}, bumpScale,
             matcap, light:{specular,shininess,alpha,mode}, rainbow },
    Parts: { base, rainbow, matcap, tri, bumpScale, light:{roughness,metalness,reflectivity,alpha,mode} } },
  meshes: [ { i, name, material: 'Head'|'Body'|'Parts', bboxMin:[3], bboxMax:[3] } ×80 ] }
```
Percorsi texture relativi a `website-creation/` (base della pagina), es. `assets/robot-spline/textures/Body-tri.png`.

- [ ] **Step 1: Installa ffmpeg (strumento di sviluppo)**

Run: `brew install ffmpeg && ffmpeg -version | head -1`
Expected: `ffmpeg version …`

- [ ] **Step 2: Scrivi `estrai.mjs`**

La tabella `MAP` viene dal GLSL compilato di Spline (letto il 2026-09-19): indice `nodeU` → parametro.
```js
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { serve, launch, TOOLS, REPO } from './lib.mjs';

const DEST = path.join(REPO, 'website-creation/assets/robot-spline');
fs.mkdirSync(path.join(DEST, 'textures'), { recursive: true });

const MAP = {
  Head: { 'base.color': 0, 'base.alpha': 1, 'video.tex': 2, 'video.texSize': 3, 'video.crop': 4, 'video.mat': 5,
    'video.size': 6, 'video.isMask': 8, 'video.alpha': 9, 'video.mode': 10, 'light.specular': 11, 'light.shininess': 12,
    'light.alpha': 14, 'light.mode': 15, 'matcap.tex': 16, 'matcap.isMask': 17, 'matcap.alpha': 18, 'matcap.mode': 19, 'matcap.rotation': 20,
    'rainbow.film': 21, 'rainbow.movement': 22, 'rainbow.wavelengths': 23, 'rainbow.noiseStrength': 24,
    'rainbow.offset': 26, 'rainbow.isMask': 27, 'rainbow.alpha': 28, 'rainbow.mode': 29 },
  Body: { 'base.color': 0, 'base.alpha': 1, 'tri.tex': 2, 'tri.texSize': 3, 'tri.mat': 5, 'tri.size': 6,
    'tri.blending': 7, 'tri.isMask': 8, 'tri.alpha': 9, 'tri.mode': 10, 'matcap.tex': 11, 'matcap.isMask': 12, 'matcap.alpha': 13, 'matcap.mode': 14,
    'matcap.rotation': 15, 'light.specular': 16, 'light.shininess': 17, 'light.alpha': 19, 'light.mode': 20,
    'rainbow.film': 21, 'rainbow.movement': 22, 'rainbow.wavelengths': 23, 'rainbow.noiseStrength': 24,
    'rainbow.offset': 26, 'rainbow.isMask': 27, 'rainbow.alpha': 28, 'rainbow.mode': 29, 'bumpScale': 32 },
  Parts: { 'base.color': 0, 'base.alpha': 1, 'rainbow.film': 2, 'rainbow.movement': 3, 'rainbow.wavelengths': 4,
    'rainbow.noiseStrength': 5, 'rainbow.offset': 7, 'rainbow.isMask': 8, 'rainbow.alpha': 9, 'rainbow.mode': 10, 'matcap.tex': 11,
    'matcap.isMask': 12, 'matcap.alpha': 13, 'matcap.mode': 14, 'matcap.rotation': 15, 'tri.tex': 16, 'tri.texSize': 17, 'tri.mat': 19,
    'tri.size': 20, 'tri.blending': 21, 'tri.isMask': 22, 'tri.alpha': 23, 'tri.mode': 24, 'light.roughness': 25,
    'light.metalness': 26, 'light.alpha': 28, 'light.mode': 29, 'light.reflectivity': 31, 'bumpScale': 33 }
};

const srv = await serve(TOOLS + '/ref');
const b = await launch();
const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
await p.goto(srv.url + '/index.html', { waitUntil: 'load' });
await p.waitForTimeout(14000);

const raw = await p.evaluate(() => {
  const app = document.querySelector('spline-viewer')._spline;
  const sc = app._scene, cam = app._camera;
  const b64 = (u8) => { let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return btoa(s); };
  const texOut = {};
  function texToPng(t, key) {
    if (texOut[key]) return key;
    const img = t.image; const c = document.createElement('canvas');
    if (img && img.data && img.width) { c.width = img.width; c.height = img.height;
      const id = new ImageData(new Uint8ClampedArray(img.data.buffer.slice(0)), img.width, img.height); c.getContext('2d').putImageData(id, 0, 0);
    } else { c.width = img.videoWidth || img.naturalWidth || img.width; c.height = img.videoHeight || img.naturalHeight || img.height; c.getContext('2d').drawImage(img, 0, 0); }
    texOut[key] = { png: c.toDataURL('image/png').split(',')[1], w: c.width, h: c.height, flipY: t.flipY, wrapS: t.wrapS, wrapT: t.wrapT, isVideo: !!img.videoWidth };
    return key;
  }
  function ser(v, key) {
    if (v == null) return null;
    if (typeof v === 'number' || typeof v === 'boolean') return v;
    if (v.isTexture) return { tex: texToPng(v, key) };
    if (v.isColor) return [v.r, v.g, v.b];
    if (v.isVector2 || v.isVector3 || v.isVector4) return v.toArray();
    if (v.isMatrix3) return Array.from(v.elements);
    if (Array.isArray(v)) return v.map((x) => (typeof x === 'number' ? x : ser(x)));
    return { unknown: Object.prototype.toString.call(v) };
  }
  const mats = {}; const meshes = []; let i = 0; let video = null;
  sc.traverse((o) => {
    if (!o.isMesh) return;
    const m = o.material; o.geometry.computeBoundingBox();
    const bb = o.geometry.boundingBox;
    meshes.push({ i: i++, name: o.name, material: m.name, bboxMin: bb.min.toArray(), bboxMax: bb.max.toArray() });
    if (mats[m.name]) return;
    const u = {};
    for (let k = 0; k < 40; k++) { const un = m.uniforms['nodeU' + k]; if (un) u[k] = ser(un.value, m.name + '-nodeU' + k); }
    const pl = m.uniforms.pointLights && m.uniforms.pointLights.value[0];
    mats[m.name] = { u,
      pointLight: pl ? { color: ser(pl.color), distance: pl.distance, decay: pl.decay } : null,
      ambient: m.uniforms.ambientLightColor ? ser(m.uniforms.ambientLightColor.value) : null,
      probe: m.uniforms.lightProbe ? m.uniforms.lightProbe.value.map((v) => v.toArray()) : null };
    (m.layers || []).forEach((L) => { const t = L.data && L.data.texture; if (t && t.video && t.video.data) video = b64(new Uint8Array(t.video.data)); });
  });
  cam.updateMatrixWorld(true);
  const wp = cam.position.clone(), wq = cam.quaternion.clone(), ws = cam.scale.clone();
  cam.matrixWorld.decompose(wp, wq, ws);                       // posa MONDO, non locale
  let light = null;
  sc.traverse((o) => { if (o.isPointLight) { const v = o.position.clone(); o.getWorldPosition(v); light = { worldPosition: v.toArray() }; } });
  if (!light) {                                                 // ripiego: posizione view-space dell'uniform → mondo
    const anyMat = Object.values(mats)[0]; const m0 = sc.getObjectByProperty('isMesh', true).material;
    const pl = m0.uniforms.pointLights.value[0]; light = { worldPosition: pl.position.clone().applyMatrix4(cam.matrixWorld).toArray() };
  }
  const cv = app.canvas || document.querySelector('spline-viewer').shadowRoot.querySelector('canvas');
  return { camera: { fov: cam.fov, zoom: cam.zoom, near: cam.near, far: cam.far, position: wp.toArray(), quaternion: wq.toArray(),
      projectionMatrix: Array.from(cam.projectionMatrix.elements), matrixWorld: Array.from(cam.matrixWorld.elements),
      aspect: cv.clientWidth / cv.clientHeight },
    light, mats, meshes, texOut, video };
});
await b.close(); srv.close();

// texture → file
const texFile = {};
for (const [key, t] of Object.entries(raw.texOut)) {
  if (t.isVideo) continue;
  const name = key.replace(/-nodeU\d+$/, '') + '-' + key.match(/nodeU(\d+)$/)[1] + '.png';
  fs.writeFileSync(path.join(DEST, 'textures', name), Buffer.from(t.png, 'base64'));
  texFile[key] = { path: 'assets/robot-spline/textures/' + name, ...t, png: undefined };
}
// video: sorgente fuori repo, versione ridotta nel repo
if (!raw.video) throw new Error('video degli occhi non trovato');
const src = path.join(TOOLS, 'out/eyes-src.mp4');
fs.writeFileSync(src, Buffer.from(raw.video, 'base64'));
execFileSync('ffmpeg', ['-y', '-i', src, '-an', '-vf', 'scale=512:-2', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '18', '-movflags', '+faststart', path.join(DEST, 'eyes.mp4')], { stdio: 'inherit' });
execFileSync('ffmpeg', ['-y', '-ss', '1', '-i', src, '-frames:v', '1', '-vf', 'scale=512:-2', path.join(DEST, 'eyes-poster.png')], { stdio: 'inherit' });
fs.copyFileSync(path.join(process.env.HOME, 'Progetti/file-sciolti/robot-confronto/logo-axxell-icon.svg'), path.join(DEST, 'logo-axxell-icon.svg'));

function pick(matName) {
  const m = raw.mats[matName]; const out = {};
  for (const [k, idx] of Object.entries(MAP[matName])) {
    let v = m.u[idx];
    if (v && v.tex) {
      const tf = texFile[v.tex];
      if (k === 'video.tex') { v = null; } else v = tf.path;
      if (tf) { const grp = k.split('.')[0]; out[grp] = out[grp] || {}; out[grp].flipY = tf.flipY; out[grp].wrapS = tf.wrapS; out[grp].wrapT = tf.wrapT; }
    }
    if (v === null && k === 'video.tex') continue;
    const [g, f] = k.split('.');
    if (f === undefined) out[g] = v; else { out[g] = out[g] || {}; out[g][f] = v; }
  }
  return out;
}
const Head = pick('Head');
const vtex = Object.values(raw.texOut).find((t) => t.isVideo);
Head.video = { ...Head.video, src: 'assets/robot-spline/eyes.mp4', poster: 'assets/robot-spline/eyes-poster.png', flipY: vtex ? vtex.flipY : true };
const any = raw.mats.Head;
const data = { version: 1, camera: raw.camera,
  light: { worldPosition: raw.light.worldPosition, color: any.pointLight.color, distance: any.pointLight.distance, decay: any.pointLight.decay },
  ambient: any.ambient, probe: any.probe,
  materials: { Head, Body: pick('Body'), Parts: pick('Parts') },
  meshes: raw.meshes };
fs.writeFileSync(path.join(DEST, 'robot-spline-data.js'),
  '/* GENERATO da ~/Progetti/file-sciolti/robot-spline-tools/estrai.mjs — non modificare a mano. */\n' +
  'window.WC = window.WC || {};\nWC.robotSplineData = ' + JSON.stringify(data, null, 1) + ';\n');
fs.writeFileSync(path.join(TOOLS, 'out/raw.json'), JSON.stringify({ ...raw, texOut: undefined, video: undefined }, null, 1));
console.log('ok', Object.keys(texFile).length, 'texture,', raw.meshes.length, 'mesh');
```

- [ ] **Step 3: Scrivi `verifica-dati.mjs` (il test dei dati)**

```js
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { REPO } from './lib.mjs';

const dir = path.join(REPO, 'website-creation/assets/robot-spline');
const ctx = { window: {} }; ctx.WC = undefined; vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(dir, 'robot-spline-data.js'), 'utf8').replace('window.WC = window.WC || {};', 'var WC = window.WC = {};'), ctx);
const D = ctx.window.WC.robotSplineData;
const errs = [];
const num = (v, k) => { if (typeof v !== 'number' || !isFinite(v)) errs.push(k + ' non è un numero: ' + JSON.stringify(v)); };
const arr = (v, n, k) => { if (!Array.isArray(v) || v.length !== n || v.some((x) => typeof x !== 'number')) errs.push(k + ` non è un array di ${n} numeri: ` + JSON.stringify(v)); };
const walk = (o, k) => { for (const [kk, v] of Object.entries(o)) { const key = k + '.' + kk;
  if (v && typeof v === 'object' && !Array.isArray(v)) { if ('unknown' in v) errs.push(key + ' segnaposto ' + v.unknown); walk(v, key); }
  else if (typeof v === 'string' && /array\[|object/.test(v)) errs.push(key + ' segnaposto ' + v); } };
walk(D, 'D');
['fov', 'zoom', 'near', 'far'].forEach((k) => num(D.camera[k], 'camera.' + k));
arr(D.camera.position, 3, 'camera.position'); arr(D.camera.quaternion, 4, 'camera.quaternion');
arr(D.light.worldPosition, 3, 'light.worldPosition'); arr(D.light.color, 3, 'light.color');
num(D.light.distance, 'light.distance'); num(D.light.decay, 'light.decay');
arr(D.ambient, 3, 'ambient'); if (!Array.isArray(D.probe) || D.probe.length !== 9) errs.push('probe non ha 9 coefficienti');
for (const [n, m] of Object.entries(D.materials)) {
  if (m.base.alpha !== 1) errs.push(n + '.base.alpha != 1 (le formule assumono accumAlpha=1 dopo la base)');
  if (m.rainbow.noiseStrength !== 0) errs.push(n + '.rainbow.noiseStrength != 0 (rumore non implementato)');
  if (m.tri) { arr(m.tri.mat, 9, n + '.tri.mat'); if (m.tri.alpha !== 0) errs.push(n + '.tri.alpha != 0 (strato colore triplanare non implementato)');
    if (!fs.existsSync(path.join(REPO, 'website-creation', m.tri.tex))) errs.push(n + '.tri.tex mancante'); }
  if (m.matcap && !fs.existsSync(path.join(REPO, 'website-creation', m.matcap.tex))) errs.push(n + '.matcap.tex mancante');
}
arr(D.materials.Head.video.mat, 9, 'Head.video.mat');
const c = { Head: 0, Body: 0, Parts: 0 }; D.meshes.forEach((m) => c[m.material]++);
if (D.meshes.length !== 80 || c.Head !== 1 || c.Body !== 10 || c.Parts !== 69) errs.push('mesh/materiali attesi 80 = 1/10/69, trovati ' + JSON.stringify(c));
['eyes.mp4', 'eyes-poster.png', 'logo-axxell-icon.svg'].forEach((f) => { if (!fs.existsSync(path.join(dir, f))) errs.push(f + ' mancante'); });
if (fs.existsSync(path.join(dir, 'eyes.mp4')) && fs.statSync(path.join(dir, 'eyes.mp4')).size > 400000) errs.push('eyes.mp4 troppo grande');
// isMask: le formule assumono strati che NON fanno da maschera
for (const [n, m] of Object.entries(D.materials)) for (const [g, o] of Object.entries(m))
  if (o && typeof o === 'object' && 'isMask' in o && o.isMask !== false) errs.push(`${n}.${g}.isMask non è false`);
// La camera Spline è una prospettiva three «normale»? PerspectiveCamera(fov, aspect, near, far) con .zoom
// deve riprodurre la projectionMatrix estratta (x = e[0], y = e[5]).
{ const C = D.camera, top = C.near * Math.tan(C.fov * Math.PI / 360) / C.zoom, h = 2 * top, w = C.aspect * h;
  const ex = 2 * C.near / w, ey = 2 * C.near / h, pm = C.projectionMatrix;
  if (!pm || Math.abs(pm[0] - ex) / ex > 1e-3 || Math.abs(pm[5] - ey) / ey > 1e-3 || Math.abs(pm[8]) > 1e-4 || Math.abs(pm[9]) > 1e-4)
    errs.push('la projectionMatrix Spline NON è riproducibile con PerspectiveCamera(fov, zoom): ' + JSON.stringify({ pm0: pm && pm[0], ex, pm5: pm && pm[5], ey, pm8: pm && pm[8], pm9: pm && pm[9] })); }
// Nomi del GLB per indice (stessa normalizzazione di robot-spline-materials.js)
{ const glb = fs.readFileSync(path.join(REPO, 'website-creation/assets/robot.glb'));
  const js = JSON.parse(glb.subarray(20, 20 + glb.readUInt32LE(12)).toString());
  const base = (n) => String(n || '').replace(/[\s.\[\]:\/]/g, '_').replace(/(_\d+)+$/, '').toLowerCase();
  if (js.nodes.length !== D.meshes.length) errs.push('GLB con ' + js.nodes.length + ' nodi, Spline ' + D.meshes.length + ' mesh');
  D.meshes.forEach((m, i) => { if (m.name && js.nodes[i] && base(m.name) !== base(js.nodes[i].name)) errs.push(`indice ${i}: GLB "${js.nodes[i].name}" ≠ Spline "${m.name}"`); }); }
console.log(errs.length ? 'FALLITO\n' + errs.join('\n') : 'ok: dati completi');
process.exit(errs.length ? 1 : 0);
```

- [ ] **Step 3b: Riferimento GLSL Spline fuori dal repo**

Il GLSL compilato e il dump letti il 2026-09-19 sono già copiati in `~/Progetti/file-sciolti/robot-spline-tools/spline-ref/`
(`Head|Body|Parts.frag/.vert`, `scene.json`, `eyes-src-originale.mp4`). Verifica: `ls ~/Progetti/file-sciolti/robot-spline-tools/spline-ref` → 8 file.
Serve solo a controllare le formule. **Non** entra nel repo.

- [ ] **Step 4: Esegui la verifica PRIMA dell'estrazione (deve fallire)**

Run: `cd ~/Progetti/file-sciolti/robot-spline-tools && node verifica-dati.mjs`
Expected: errore `ENOENT … robot-spline-data.js`.

- [ ] **Step 5: Esegui l'estrazione e poi la verifica**

Run: `node estrai.mjs && node verifica-dati.mjs`
Expected: `ok N texture, 80 mesh` con N ≥ 4 (il video non conta: servono almeno la matcap di Head, quella condivisa Body/Parts e le tri di Body e Parts) e poi `ok: dati completi`. Se fallisce il controllo sulla `projectionMatrix`: **fermarsi e riportare BLOCKED** (la camera Spline non è una prospettiva semplice e l'inquadratura va ripensata).
Se `verifica-dati` segnala un segnaposto o un indice sbagliato: aprire `out/raw.json`, trovare il valore giusto (tipo atteso: `mat` = 9 numeri, `tex` = texture, `mode` = intero 0–3), correggere `MAP` e rilanciare. **Non** correggere il file generato a mano.

- [ ] **Step 6: Commit (solo l'output)**

```bash
cd ~/Progetti/axxell-site-robot
git add website-creation/assets/robot-spline
git commit -m "feat(robot): dati, texture, video occhi e logo estratti dalla scena Spline

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Uq4gj26CZnLLaGs9oHjgm8"
```

---

### Task 3: Scena e inquadratura (camera/luce Spline, niente ricentratura, niente levitazione/drag, stage pulito)

**Files:**
- Modify: `website-creation/index.html:303-315` (via titolo e copy), `:581-584` (script)
- Modify: `website-creation/css/sections.css:469-470` (stage), `:537-544` (velo), regole `.wc-robot-copy*`, `.wc-robot-title*`, `.wc-robot-note`
- Modify: `website-creation/js/robot.js`
- Modify: `website-creation/js/robot-parts.js:74-92`
- Modify: `website-creation/js/robot-fibers.js:171`, `:535-541`
- Create: `~/Progetti/file-sciolti/robot-spline-tools/prova.mjs`

**Interfaces:**
- Consumes: `WC.robotSplineData` (Task 2).
- Produces: `window.__robot = { model, scene, camera, renderer, box, state, parts, headGroup, brain, fibers, pointer }` (niente più `wrap`); `window.__robot.parts` come prima (head/body/armL/armR/joints). `CONFIG` in cima a `robot.js`: `{ yawGain: 0.2273, pitchGain: 0.35, yawMax: 0.5, pitchMax: 0.3, minHeadTopPx: 80 }`.
- Produces: `node prova.mjs [--check nome,…]` → controlli comportamentali, exit 1 se uno fallisce.

- [ ] **Step 1: Scrivi `prova.mjs` con i controlli di questo task**

```js
import { serve, launch, arg, REPO } from './lib.mjs';

const W = +arg('w', 1440), H = +arg('h', 900);
const only = arg('check', null);
const srv = await serve(REPO);
const b = await launch();
const p = await b.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
const errors = [], blocked = [];
p.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
p.on('pageerror', (e) => errors.push(e.message));
p.on('request', (r) => { if (/spline\.design|unpkg\.com/.test(r.url())) blocked.push(r.url()); });
await p.goto(srv.url + '/website-creation/index.html#cap05', { waitUntil: 'load' });
await p.addStyleTag({ content: 'html{scroll-behavior:auto!important}' });
await p.evaluate(() => document.getElementById('cap05').scrollIntoView({ block: 'start' }));
await p.waitForFunction(() => window.__robot && window.__robot.parts, null, { timeout: 30000 });
await p.waitForTimeout(3000);

const checks = {
  async 'conteggi-parti'() {
    const c = await p.evaluate(() => { const q = window.__robot.parts; return [q.head.length, q.armL.length, q.armR.length, q.body.length]; });
    return c.join('/') === '18/13/13/36' || 'conteggi ' + c.join('/') + ' invece di 18/13/13/36';
  },
  async 'niente-movimento'() {
    const s = () => p.evaluate(() => JSON.stringify(window.__robot.model.matrixWorld.elements.map((x) => +x.toFixed(4))));
    const a = await s(); await p.waitForTimeout(5000); const z = await s();
    return a === z || 'il modello si è mosso in 5 s senza input';
  },
  async 'niente-drag'() {
    const s = () => p.evaluate(() => JSON.stringify(window.__robot.model.matrixWorld.elements.map((x) => +x.toFixed(4))));
    const a = await s();
    await p.mouse.move(300, 450); await p.mouse.down(); await p.mouse.move(1100, 450, { steps: 12 }); await p.mouse.up();
    await p.waitForTimeout(1500); const z = await s();
    await p.mouse.move(W - 2, H - 2); await p.waitForTimeout(800);
    return a === z || 'un trascinamento ha ruotato/spostato il robot';
  },
  async 'fibre-a-riposo'() {
    await p.mouse.move(W - 2, 2); await p.waitForTimeout(2500);
    const v = await p.evaluate(() => window.__robot.fibers ? window.__robot.fibers.object.visible : false);
    return v === false || 'fibre visibili a riposo';
  },
  async 'cervello-a-riposo'() {
    await p.waitForFunction(() => window.__robot.brain, null, { timeout: 15000 });
    await p.mouse.move(W - 2, 2); await p.waitForTimeout(2500);
    const v = await p.evaluate(() => window.__robot.brain.points.visible);
    return v === false || 'cervello disegnato a riposo';
  },
  async 'fibre-al-passaggio'() {
    const pt = await p.evaluate(() => { const r = window.__robot, v = new THREE.Vector3();
      new THREE.Box3().setFromObject(r.parts.armL[Math.floor(r.parts.armL.length / 2)]).getCenter(v); v.project(r.camera);
      const rc = r.renderer.domElement.getBoundingClientRect(); return { x: rc.left + (v.x + 1) / 2 * rc.width, y: rc.top + (1 - v.y) / 2 * rc.height }; });
    await p.mouse.move(pt.x, pt.y, { steps: 8 }); await p.waitForTimeout(1500);
    const s = await p.evaluate(() => { const f = window.__robot.fibers, v = []; f.object.traverse((o) => { if (o.material && o.material.uniforms && o.material.uniforms.uSurge) v.push(+o.material.uniforms.uSurge.value.toFixed(2)); });
      return { visible: f.object.visible, surges: [...new Set(v)] }; });
    await p.mouse.move(W - 2, 2); await p.waitForTimeout(2500);
    return (s.visible && Math.max(...s.surges) > 0.5 && Math.min(...s.surges) < 0.1) || JSON.stringify(s);
  },
  async 'rete-e-console'() {
    return (!errors.length && !blocked.length) || JSON.stringify({ errors, blocked });
  }
};
let fail = 0;
for (const [name, fn] of Object.entries(checks)) {
  if (only && !only.split(',').includes(name)) continue;
  let r; try { r = await fn(); } catch (e) { r = 'eccezione: ' + e.message; }
  console.log((r === true ? 'PASS ' : 'FAIL ') + name + (r === true ? '' : ' — ' + r));
  if (r !== true) fail++;
}
await b.close(); srv.close();
process.exit(fail ? 1 : 0);
```

- [ ] **Step 2: Esegui i controlli sul codice attuale (devono fallire)**

Run: `cd ~/Progetti/file-sciolti/robot-spline-tools && node prova.mjs`
Expected: FAIL su `niente-movimento` (levitazione), `niente-drag`, `fibre-a-riposo`, `cervello-a-riposo`; `fibre-al-passaggio` può già passare.

- [ ] **Step 3: HTML — via titolo e copy, script dati**

In `website-creation/index.html` elimina le righe 303–315 (il commento «Titolo sopra al robot…», `<p class="wc-robot-title">…</p>` e tutto `<div class="wc-robot-copy">…</div>`). La card resta:
```html
    <div class="wc-robot-card" id="wcRobotCard" data-cursor-fx="circuit">
      <div class="wc-robot-stage" id="wcRobotStage">
        <p class="wc-robot-hint" id="wcRobotHint">Scena in arrivo…</p>
      </div>
    </div>
```
Sostituisci le righe 581–584 con:
```html
<script src="assets/robot-spline/robot-spline-data.js?v=20260919a"></script>
<script src="js/robot-parts.js?v=20260919a"></script>
<script src="js/robot-materials.js?v=20260831a"></script>
<script src="js/robot-fibers.js?v=20260919a"></script>
<script src="js/robot.js?v=20260919a"></script>
```

- [ ] **Step 4: CSS — stage pulito**

In `website-creation/css/sections.css` sostituisci la regola `.wc-robot-stage` (righe 469–470) con:
```css
.wc-robot-stage{position:absolute;inset:0;z-index:1;}
```
**Non** toccare la maschera ellittica `.wc-robot-card > .wc-fx` (righe ~490–500, il «buco» del circuito attorno al robot): lo spec lascia il circuito com'è (§3); a riposo attorno al robot resta scuro come nello Spline. Elimina la regola `.wc-robot-card::after{…}` (righe 542–544) e i commenti del velo sopra (537–541); elimina le regole `.wc-robot-copy…`, `.wc-robot-title`, `.wc-robot-title-accent`, `.wc-robot-note` (rimaste senza elementi). Aggiorna il commento sopra `.wc-robot-stage` in una riga: `/* Canvas trasparente: il circuito (z 0) si vede attorno al robot per trasparenza reale, niente blend né filtri — il robot deve essere identico allo Spline. */`

- [ ] **Step 5: `robot-parts.js` — soglia braccia relativa al centro X**

Sostituisci le righe 74–92 con:
```js
    var neck = min.y + size.y * 0.79;
    var armBandLow = min.y + size.y * 0.45;
    var armXThreshold = size.x * 0.16;
    // Il modello NON è più ricentrato (sta nelle coordinate della scena
    // Spline): il centro X del bbox è ~−2.9, non 0. Le soglie laterali si
    // misurano da lì, altrimenti una mesh del corpo finisce in un braccio.
    var cx = (box.min.x + box.max.x) / 2;

    var head = [], body = [], armL = [], armR = [];
    meshes.forEach(function (m) {
      var byName = (m.name || '').toLowerCase();
      var c = centerOf(m);
      var isHead = /head|helmet|visor|face|glass/.test(byName) || c.y >= neck;
      if (isHead) { head.push(m); return; }
      var inArmBand = c.y > armBandLow && c.y < neck;
      if (inArmBand && Math.abs(c.x - cx) > armXThreshold) {
        (c.x < cx ? armL : armR).push(m);
        return;
      }
      body.push(m);
    });
```

- [ ] **Step 6: `robot-fibers.js` — spente a riposo**

Riga 171, sostituisci con:
```js
    '  float intensity = (uBaseline + band * (0.14 + uSurge * 1.35) + fres * (0.06 + uSurge * 0.3)) * smoothstep(0.0, 0.08, uSurge);',
```
In `update` (righe 535–541) dopo aver scritto `uSurge` di `matL`/`matR` aggiungi:
```js
        object.visible = (surgeL || 0) > 0.003 || (surgeR || 0) > 0.003;
```

- [ ] **Step 7: `robot.js` — CONFIG, camera e luce Spline, niente ricentratura/levitazione/drag**

1. Subito dopo `WC.register('robot', function(ctx){` aggiungi:
```js
  // Tarature del comportamento (non dell'aspetto: quello arriva da Spline).
  // yawGain: prima il puntatore si misurava su uno stage largo 2,2× la
  // sezione, quindi lo stesso gesto girava la testa di 0.5/2.2 per unità:
  // stesso gesto, stessa rotazione di prima.
  var CONFIG = { yawGain: 0.2273, pitchGain: 0.35, yawMax: 0.5, pitchMax: 0.3, minHeadTopPx: 80 };
  var D = WC.robotSplineData;
```
2. Nella condizione di `fail('Modello 3D disattivato')` aggiungi `|| !D`.
3. Elimina l'intero blocco drag (righe 95–133: commento «Task 7: drag-to-rotate…», `drag`, `dragVel`, `onDragStart/Move/End`, listener e loro cleanup).
4. Sostituisci le righe 142–147 (scene, camera, luci) con:
```js
    var scene = new THREE.Scene();
    // Camera della scena Spline: stessi fov/zoom/posizione/orientamento.
    var cam = new THREE.PerspectiveCamera(D.camera.fov, 1, D.camera.near, D.camera.far);
    cam.zoom = D.camera.zoom;
    cam.position.fromArray(D.camera.position);
    cam.quaternion.fromArray(D.camera.quaternion);
    var headTopWorld = null;
```
5. Sostituisci `fit()` con:
```js
    function fit(){
      var w = stage.clientWidth, h = stage.clientHeight;
      if (!w || !h) return;
      renderer.setSize(w, h, false);
      cam.aspect = w / Math.max(1, h);
      cam.clearViewOffset();
      cam.updateProjectionMatrix();
      // FOV verticale fisso: il robot occupa sempre la stessa frazione di
      // altezza, la testa resta intera. Se su schermi bassi la cima della
      // testa finisse sotto la nav, si abbassa l'immagine del minimo.
      if (headTopWorld) {
        var pt = headTopWorld.clone().project(cam);
        var y = (1 - pt.y) / 2 * h;
        var need = CONFIG.minHeadTopPx - y;
        if (need > 0) { cam.setViewOffset(w, h, 0, -need, w, h); cam.updateProjectionMatrix(); }
      }
    }
```
6. Nella callback di `gltf.load` sostituisci le righe 166–188 (da `// centra e scala` fino a `fit();`) con:
```js
      var model = g.scene;
      // Il GLB è nelle coordinate della scena Spline: niente ricentratura,
      // la camera Spline lo inquadra così com'è.
      scene.add(model);
      model.updateMatrixWorld(true);
      var box = new THREE.Box3().setFromObject(model);
```
   e sostituisci `window.__robot = { model: model, wrap: wrap, … }` con:
```js
      window.__robot = { model: model, scene: scene, camera: cam, renderer: renderer, box: box, state: { faceAmount: 0 }, pointer: pointer };
```
7. Dopo `window.__robot.headGroup = headGroup;` aggiungi:
```js
          var hb = new THREE.Box3(); parts.head.forEach(function (m) { hb.union(new THREE.Box3().setFromObject(m)); });
          headTopWorld = new THREE.Vector3((hb.min.x + hb.max.x) / 2, hb.max.y, (hb.min.z + hb.max.z) / 2);
          fit();
```
   e subito dopo il blocco `if (parts.head.length) {…}` aggiungi `fit();` (per il caso senza testa).
8. Punti del cervello: `gl_PointSize` non segue lo zoom né il fov, la geometria sì. Prima: fov 32°. Ora fov 45° con zoom 2 (fov effettivo ≈ 23,4°). Per tenere lo stesso rapporto punti/cervello di prima sostituisci `var brainUSize = 4 * camDist / 200;` con:
```js
            var fovScale = Math.tan(THREE.MathUtils.degToRad(16)) / (Math.tan(THREE.MathUtils.degToRad(cam.fov / 2)) / cam.zoom);
            var brainUSize = 4 * camDist / 200 * fovScale;
```
9. Nel `tick()` sostituisci il calcolo di `targetYaw`/`targetPitch` con:
```js
            targetYaw = Math.max(-CONFIG.yawMax, Math.min(CONFIG.yawMax, pointer.x * CONFIG.yawGain));
            targetPitch = Math.max(-CONFIG.pitchMax, Math.min(CONFIG.pitchMax, -pointer.y * CONFIG.pitchGain));
```
10. Nel `tick()` dopo `robot.brain.update(dt, hoverHead);` aggiungi:
```js
          // Lo smorzamento esponenziale non arriva mai a 0 esatto: sotto la
          // soglia il cervello non viene proprio disegnato (decisione 5).
          robot.brain.points.visible = hoverHead > 0.01;
```
11. Elimina dal `tick()` l'intero blocco «Task 7: levitazione + drag-to-rotate…» (righe 507–529) e la variabile `bobAmount`.
12. Nel teardown `disposeObject3D(robot.model)` resta; nessun riferimento a `wrap`/drag/levitazione nel codice: `grep -nE "wrap\.|dragVel|onDrag|bobAmount" website-creation/js/robot.js` → nessun risultato. Aggiorna anche il commento di robot.js che cita «rotazione futura di `wrap` (drag, Task 7)»: diventa «resta incollato alle braccia».

- [ ] **Step 8: Esegui i controlli**

Run: `cd ~/Progetti/file-sciolti/robot-spline-tools && node prova.mjs`
Expected: `PASS` su tutti e 7 i controlli.

- [ ] **Step 9: Verifica l'inquadratura contro Spline**

```bash
node shot.mjs site out/t3-solo.png --solo
node confronta.mjs out/ref-solo.png out/t3-solo.png ~/Progetti/file-sciolti/robot-confronto/03-inquadratura.png
```
Expected: `iou` ≥ 0.97 e `|headTopA − headTopB|` ≤ 4. (L'aspetto è ancora quello vecchio: qui conta solo la silhouette.) Se `iou` < 0.97: confrontare `D.meshes[i].bboxMin/Max` con `mesh.geometry.boundingBox` in pagina e le posizioni mondo; il GLB deve essere nelle coordinate Spline (review: verificato, 68 nomi per indice).

```bash
node shot.mjs site out/t3-1280.png --w 1280 --h 720; node prova.mjs --w 1280 --h 720 --check conteggi-parti,rete-e-console
```
Expected: exit 0; nello screenshot la testa è intera sotto la barra di navigazione.

- [ ] **Step 10: Commit**

```bash
cd ~/Progetti/axxell-site-robot
git add website-creation/index.html website-creation/css/sections.css website-creation/js/robot.js website-creation/js/robot-parts.js website-creation/js/robot-fibers.js
git commit -m "feat(robot): camera e luce Spline, niente ricentratura/levitazione/drag, stage senza filtri, fibre spente a riposo

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Uq4gj26CZnLLaGs9oHjgm8"
```

---

### Task 4: Shader degli strati + materiali `Parts` e `Body`

**Files:**
- Create: `website-creation/js/robot-spline-glsl.js`
- Create: `website-creation/js/robot-spline-materials.js`
- Modify: `website-creation/js/robot.js` (applicazione materiali, luce in view space)
- Modify: `website-creation/index.html` (due script prima di `robot.js`)
- Modify: `~/Progetti/file-sciolti/robot-spline-tools/prova.mjs` (controllo `materiali`)

**Interfaces:**
- Consumes: `WC.robotSplineData`; `window.__robot.model`, `camera`.
- Produces: `WC.robotSplineGLSL = { vert: string, frag: string }`; il fragment usa i define `MAT_HEAD` | `MAT_BODY` | `MAT_PARTS` (+ `LOGO` in Task 7).
- Produces: `WC.robotSplineMaterials.create(D) → { byName: {Head, Body, Parts}, textures: THREE.Texture[], setCamera(cam), dispose() }` e `WC.robotSplineMaterials.assign(model, D, mats, opts) → { visor: THREE.Mesh, chest: THREE.Mesh, byMaterial: {Head:[],Body:[],Parts:[]} }` con `opts.skip = Set<Mesh>`; ogni mesh assegnata riceve `mesh.userData.splineMaterial = 'Head'|'Body'|'Parts'`.

- [ ] **Step 1: Aggiungi il controllo `materiali` a `prova.mjs` (deve fallire)**

Dentro `checks` aggiungi:
```js
  async 'materiali'() {
    const r = await p.evaluate(() => { const c = { Head: 0, Body: 0, Parts: 0, altro: 0 };
      const skip = new Set(); if (window.__robot.fibers) window.__robot.fibers.object.traverse((x) => skip.add(x));
      window.__robot.model.traverse((o) => { if (o.isMesh && !skip.has(o)) c[o.userData.splineMaterial || 'altro']++; }); return c; });
    const got = [r.Head, r.Body, r.Parts].join('/');
    return (got === '1/10/69' || got === '0/10/69') && (r.altro === 0 || (got === '0/10/69' && r.altro === 1)) || 'materiali ' + JSON.stringify(r);
  },
```
Run: `node prova.mjs --check materiali` → Expected: `FAIL materiali — {"Head":0,"Body":0,"Parts":0,"altro":80}` (le 4 mesh delle fibre sono escluse).

- [ ] **Step 2: `robot-spline-glsl.js`**

```js
/* CAP 05 — gli strati dei materiali Spline, riscritti in GLSL nostro.
 * Formule: blend normale/multiply/screen/overlay, matcap da normale di vista,
 * proiezione planare/triplanare in coordinate OGGETTO (vPosition), bump da
 * derivate, «rainbow» a coseno, Blinn-Phong e GGX con UNA point light
 * (luce non fisica: il colore uniform include già ×π) + ambient + light probe.
 * Nessun encodings_fragment: output grezzo come la scena Spline (lineare→lineare).
 * Riferimento (NON copiato): GLSL compilato di Spline in
 * ~/Progetti/file-sciolti/robot-spline-tools/spline-ref/. */
window.WC = window.WC || {};
WC.robotSplineGLSL = {
  vert: [
    'varying vec3 vViewPosition;',
    'varying vec3 vNormal;',
    'varying vec3 vPosition;',
    'varying vec3 vObjectNormal;',
    'varying vec3 vWNormal;',
    'varying vec3 vWorldViewDir;',
    'void main() {',
    '  vec3 tn = normalMatrix * normal;',
    '  vNormal = tn;',
    '  vec4 mv = modelViewMatrix * vec4(position, 1.0);',
    '  gl_Position = projectionMatrix * mv;',
    '  vViewPosition = -mv.xyz;',
    '  vPosition = position;',
    '  vObjectNormal = normal;',
    '  vWNormal = normalize((vec4(tn, 0.0) * viewMatrix).xyz);',
    '  vWorldViewDir = (modelMatrix * vec4(position, 1.0)).xyz - cameraPosition;',
    '}'
  ].join('\n'),

  frag: [
    '#define SP_RPI 0.3183098861837907',
    '#define SP_EPS 1e-6',
    'varying vec3 vViewPosition;',
    'varying vec3 vNormal;',
    'varying vec3 vPosition;',
    'varying vec3 vObjectNormal;',
    'varying vec3 vWNormal;',
    'varying vec3 vWorldViewDir;',
    'uniform vec3 uBaseColor;',
    'uniform vec3 uLightPos;',        // view space
    'uniform vec3 uLightColor;',
    'uniform float uLightDistance;',
    'uniform float uLightDecay;',
    'uniform vec3 uAmbient;',
    'uniform vec3 uProbe[9];',
    'uniform float uLightAlpha;',
    'uniform int uLightMode;',
    'uniform sampler2D uMatcap;',
    'uniform float uMatcapAlpha;',
    'uniform int uMatcapMode;',
    'uniform float uMatcapRot;',
    'uniform float uRbFilm;',
    'uniform float uRbMove;',
    'uniform vec3 uRbWaves;',
    'uniform vec3 uRbOffset;',
    'uniform float uRbAlpha;',
    'uniform int uRbMode;',
    'uniform float uOpacity;',
    '#if defined(MAT_BODY) || defined(MAT_PARTS)',
    'uniform sampler2D uTri;',
    'uniform mat3 uTriMat;',
    'uniform vec2 uTriSize;',
    'uniform float uTriBlend;',
    'uniform float uBumpScale;',
    '#endif',
    '#if defined(MAT_HEAD) || defined(MAT_BODY)',
    'uniform vec3 uSpecular;',
    'uniform float uShininess;',
    '#endif',
    '#ifdef MAT_PARTS',
    'uniform float uRoughness;',
    'uniform float uMetalness;',
    'uniform float uReflectivity;',
    'uniform float uF90;',            // Spline non assegna specularF90 per Parts: ANGLE lo azzera → 0.0
    '#endif',
    '#ifdef MAT_HEAD',
    'uniform sampler2D uVideo;',
    'uniform mat3 uVideoMat;',
    'uniform vec2 uVideoSize;',
    'uniform float uVideoCrop;',
    'uniform float uVideoAlpha;',
    'uniform int uVideoMode;',
    'uniform float uEyes;',           // 1 = occhi accesi, 0 = spenti (reveal)
    '#endif',

    'vec3 sp_blend(vec3 a, vec3 b, float alpha, int mode) {',
    '  if (mode == 1) return mix(a, a * b, alpha);',
    '  if (mode == 2) return mix(a, 1.0 - (1.0 - a) * (1.0 - b), alpha);',
    '  if (mode == 3) { vec3 t = mix(1.0 - 2.0 * (1.0 - a) * (1.0 - b), 2.0 * a * b, step(a, vec3(0.5))); return clamp(mix(a, t, alpha), 0.0, 1.0); }',
    '  return mix(a, b, alpha);',
    '}',
    'float sp_lum(vec3 c) { return dot(vec3(0.2126729, 0.7151522, 0.0721750), c); }',
    'vec3 sp_matcap(vec3 n) {',
    '  vec3 v = normalize(vViewPosition);',
    '  vec3 x = normalize(vec3(v.z, 0.0, -v.x));',
    '  vec3 y = cross(v, x);',
    '  vec2 uv = vec2(dot(x, n), dot(y, n));',
    '  uv = mat2(cos(uMatcapRot), sin(uMatcapRot), -sin(uMatcapRot), cos(uMatcapRot)) * uv;',
    '  return texture2D(uMatcap, uv * 0.495 + 0.5).rgb;',
    '}',
    'vec3 sp_rainbow() {',
    '  vec3 waves = uRbWaves * vec3(1.0, 0.8, 0.6) + 1.0;',
    '  float ang = dot(normalize(vWorldViewDir + uRbOffset * -0.001), normalize(vWNormal));',
    '  return clamp(0.5 + 0.5 * cos((uRbFilm / waves) * ang + uRbMove), 0.0, 2.0);',
    '}',
    'vec3 sp_applyRainbow(vec3 c) {',
    '  vec3 rb = sp_rainbow();',
    '  return sp_blend(c, rb, uRbAlpha * clamp(rb.r + rb.g + rb.b, 0.0, 1.0), uRbMode);',
    '}',
    'vec3 sp_light(out vec3 color) {',
    '  vec3 d = uLightPos + vViewPosition;',   // luce − posizione (posizione = −vViewPosition)
    '  float dist = length(d);',
    '  float att = 1.0;',
    '  if (uLightDistance > 0.0 && uLightDecay > 0.0) att = pow(clamp(-dist / uLightDistance + 1.0, 0.0, 1.0), uLightDecay);',
    '  color = uLightColor * att;',
    '  return normalize(d);',
    '}',
    'vec3 sp_F(vec3 f0, float f90, float vh) { float f = exp2((-5.55473 * vh - 6.98316) * vh); return f0 * (1.0 - f) + f90 * f; }',
    'vec3 sp_indirect(vec3 n) {',
    '  vec3 w = normalize((vec4(n, 0.0) * viewMatrix).xyz);',
    '  vec3 r = uProbe[0] * 0.886227 + uProbe[1] * 2.0 * 0.511664 * w.y + uProbe[2] * 2.0 * 0.511664 * w.z + uProbe[3] * 2.0 * 0.511664 * w.x',
    '    + uProbe[4] * 2.0 * 0.429043 * w.x * w.y + uProbe[5] * 2.0 * 0.429043 * w.y * w.z + uProbe[6] * (0.743125 * w.z * w.z - 0.247708)',
    '    + uProbe[7] * 2.0 * 0.429043 * w.x * w.z + uProbe[8] * 0.429043 * (w.x * w.x - w.y * w.y);',
    '  return uAmbient + r;',
    '}',
    '#if defined(MAT_HEAD) || defined(MAT_BODY)',
    'vec3 sp_blinnPhong(vec3 diffuse, vec3 n) {',
    '  vec3 lc; vec3 L = sp_light(lc); vec3 V = normalize(vViewPosition);',
    '  vec3 irr = clamp(dot(n, L), 0.0, 1.0) * lc;',
    '  vec3 H = normalize(L + V);',
    '  float nh = clamp(dot(n, H), 0.0, 1.0), vh = clamp(dot(V, H), 0.0, 1.0);',
    '  float sh = max(0.0001, uShininess);',
    '  vec3 spec = sp_F(uSpecular, 1.0, vh) * (0.25 * SP_RPI * (sh * 0.5 + 1.0) * pow(nh, sh));',
    '  return irr * SP_RPI * diffuse + sp_indirect(n) * SP_RPI * diffuse + irr * spec;',
    '}',
    '#endif',
    '#ifdef MAT_PARTS',
    'vec3 sp_physical(vec3 diffuse, vec3 n, float rough) {',
    '  vec3 lc; vec3 L = sp_light(lc); vec3 V = normalize(vViewPosition);',
    '  float nl = clamp(dot(n, L), 0.0, 1.0); vec3 irr = nl * lc;',
    '  vec3 dcol = diffuse * (1.0 - uMetalness);',
    '  vec3 f0 = mix(vec3(0.16 * uReflectivity * uReflectivity), diffuse, uMetalness);',
    '  float a = rough * rough, a2 = a * a;',
    '  vec3 H = normalize(L + V);',
    '  float nv = clamp(dot(n, V), 0.0, 1.0), nh = clamp(dot(n, H), 0.0, 1.0), vh = clamp(dot(V, H), 0.0, 1.0);',
    '  float gv = nl * sqrt(a2 + (1.0 - a2) * nv * nv), gl = nv * sqrt(a2 + (1.0 - a2) * nl * nl);',
    '  float vis = 0.5 / max(gv + gl, SP_EPS);',
    '  float den = nh * nh * (a2 - 1.0) + 1.0;',
    '  float D = SP_RPI * a2 / (den * den);',
    '  return irr * sp_F(f0, uF90, vh) * (vis * D) + irr * SP_RPI * dcol + sp_indirect(n) * SP_RPI * dcol;',
    '}',
    '#endif',
    '#if defined(MAT_BODY) || defined(MAT_PARTS)',
    'vec2 sp_triUv(vec2 p) { return (uTriMat * vec3(p / (uTriSize * 0.5), 1.0) / 2.0 + 0.5).xy; }',
    'vec2 sp_dHdxy(vec2 uv) {',
    '  vec2 dx = dFdx(uv), dy = dFdy(uv);',
    '  float h = uBumpScale * sp_lum(texture2D(uTri, uv).rgb);',
    '  return vec2(uBumpScale * sp_lum(texture2D(uTri, uv + dx).rgb) - h, uBumpScale * sp_lum(texture2D(uTri, uv + dy).rgb) - h);',
    '}',
    'vec3 sp_perturb(vec3 n, vec2 dh, float face) {',
    '  vec3 sx = dFdx(-vViewPosition), sy = dFdy(-vViewPosition);',
    '  vec3 r1 = normalize(cross(sy, n)), r2 = normalize(cross(n, sx));',
    '  float det = dot(sx, r1) * face;',
    '  return normalize(abs(det) * n - sign(det) * (dh.x * r1 + dh.y * r2));',
    '}',
    '#endif',

    'void main() {',
    '  float face = gl_FrontFacing ? 1.0 : -1.0;',
    '  vec3 n = normalize(vNormal);',
    '  vec3 fn = normalize(cross(dFdx(vViewPosition), dFdy(vViewPosition)));',
    '  if (dot(n, fn) < 0.0) n *= -1.0;',
    '  vec3 c = uBaseColor;',
    '#if defined(MAT_BODY) || defined(MAT_PARTS)',
    '  vec2 uv0 = sp_triUv(vPosition.xy), uv1 = sp_triUv(vPosition.zy), uv2 = sp_triUv(vPosition.xz);',
    '  vec3 tw = pow(abs(normalize(vObjectNormal)), vec3((1.0 - uTriBlend) * 125.0 + 3.0));',
    '  tw /= dot(tw, vec3(1.0));',
    '  vec3 nb = normalize(sp_perturb(n, sp_dHdxy(uv0), face) * tw.z + sp_perturb(n, sp_dHdxy(uv1), face) * tw.x + sp_perturb(n, sp_dHdxy(uv2), face) * tw.y);',
    '#endif',

    '#ifdef MAT_HEAD',
    '  vec2 vuv = (uVideoMat * vec3(vPosition.xy / (uVideoSize * 0.5), 1.0) / 2.0 + 0.5).xy;',
    '  vec4 vt = texture2D(uVideo, vuv);',
    '  float va = uVideoAlpha * vt.a * step(0.0, dot(vObjectNormal, vec3(0.0, 0.0, 1.0))) * uEyes;',
    '  if (uVideoCrop > 0.5 && (vuv.x < 0.0 || vuv.x > 1.0 || vuv.y < 0.0 || vuv.y > 1.0)) va = 0.0;',
    '  c = sp_blend(c, vt.rgb, va, uVideoMode);',
    '  c = sp_blend(c, sp_blinnPhong(c, n), uLightAlpha, uLightMode);',
    '  c = sp_blend(c, sp_matcap(n), uMatcapAlpha, uMatcapMode);',
    '  c = sp_applyRainbow(c);',
    '#endif',

    '#ifdef MAT_BODY',
    '  c = sp_blend(c, sp_matcap(nb), uMatcapAlpha, uMatcapMode);',
    '  c = sp_blend(c, sp_blinnPhong(c, nb), uLightAlpha, uLightMode);',
    '  c = sp_applyRainbow(c);',
    '#endif',

    '#ifdef MAT_PARTS',
    '  c = sp_applyRainbow(c);',
    '  c = sp_blend(c, sp_matcap(nb), uMatcapAlpha, uMatcapMode);',
    '  float rough = clamp((sp_lum(texture2D(uTri, uv0).rgb) * tw.z + sp_lum(texture2D(uTri, uv1).rgb) * tw.x + sp_lum(texture2D(uTri, uv2).rgb) * tw.y) * uRoughness, 0.04, 1.0);',
    '  c = sp_blend(c, sp_physical(c, nb, rough), uLightAlpha, uLightMode);',
    '#endif',

    '  gl_FragColor = vec4(c, uOpacity);',
    '}'
  ].join('\n')
};
```

- [ ] **Step 3: `robot-spline-materials.js`**

```js
/* CAP 05 — materiali Spline (Head/Body/Parts) costruiti dai dati estratti
 * (WC.robotSplineData) sullo shader di robot-spline-glsl.js. Assegnazione per
 * INDICE di mesh (stesso ordine della scena Spline) con controllo del nome. */
window.WC = window.WC || {};
WC.robotSplineMaterials = (function () {
  function v3(a) { return new THREE.Vector3(a[0], a[1], a[2]); }
  function m3(a) { var m = new THREE.Matrix3(); m.fromArray(a); return m; }
  function tex(path, g, list) {
    var t = new THREE.TextureLoader().load(path);
    t.encoding = THREE.LinearEncoding;
    t.flipY = g.flipY !== false;
    if (g.wrapS) t.wrapS = g.wrapS;
    if (g.wrapT) t.wrapT = g.wrapT;
    list.push(t);
    return t;
  }
  function common(D, m, list) {
    return {
      uBaseColor: { value: v3(m.base.color) },
      uLightPos: { value: new THREE.Vector3() },
      uLightColor: { value: v3(D.light.color) },
      uLightDistance: { value: D.light.distance },
      uLightDecay: { value: D.light.decay },
      uAmbient: { value: v3(D.ambient) },
      uProbe: { value: D.probe.map(v3) },
      uLightAlpha: { value: m.light.alpha },
      uLightMode: { value: m.light.mode },
      uMatcap: { value: tex(m.matcap.tex, m.matcap, list) },
      uMatcapAlpha: { value: m.matcap.alpha },
      uMatcapMode: { value: m.matcap.mode },
      uMatcapRot: { value: m.matcap.rotation || 0 },
      uRbFilm: { value: m.rainbow.film },
      uRbMove: { value: m.rainbow.movement },
      uRbWaves: { value: v3(m.rainbow.wavelengths) },
      uRbOffset: { value: v3(m.rainbow.offset) },
      uRbAlpha: { value: m.rainbow.alpha },
      uRbMode: { value: m.rainbow.mode },
      uOpacity: { value: 1 }
    };
  }
  function tri(m, u, list) {
    u.uTri = { value: tex(m.tri.tex, m.tri, list) };
    u.uTriMat = { value: m3(m.tri.mat) };
    u.uTriSize = { value: new THREE.Vector2(m.tri.size[0], m.tri.size[1]) };
    u.uTriBlend = { value: m.tri.blending };
    u.uBumpScale = { value: m.bumpScale };
  }
  function shader(define, uniforms) {
    var d = {}; d[define] = '';
    var mat = new THREE.ShaderMaterial({
      defines: d, uniforms: uniforms,
      vertexShader: WC.robotSplineGLSL.vert, fragmentShader: WC.robotSplineGLSL.frag,
      extensions: { derivatives: true, shaderTextureLOD: true }
    });
    return mat;
  }

  function create(D) {
    var list = [];
    var P = D.materials.Parts, B = D.materials.Body;
    var pu = common(D, P, list); tri(P, pu, list);
    pu.uRoughness = { value: P.light.roughness };
    pu.uMetalness = { value: P.light.metalness };
    pu.uReflectivity = { value: P.light.reflectivity };
    pu.uF90 = { value: 0.0 };   // A/B sulle coppie: 0.0 (come Spline compilato su ANGLE) vs 1.0
    var bu = common(D, B, list); tri(B, bu, list);
    bu.uSpecular = { value: v3(B.light.specular) };
    bu.uShininess = { value: B.light.shininess };
    var byName = { Parts: shader('MAT_PARTS', pu), Body: shader('MAT_BODY', bu), Head: null };
    var all = [byName.Parts, byName.Body];
    var lightWorld = v3(D.light.worldPosition);
    return {
      byName: byName, textures: list, all: all,
      setCamera: function (cam) {
        cam.updateMatrixWorld(true);
        var lv = lightWorld.clone().applyMatrix4(cam.matrixWorldInverse);
        all.forEach(function (m) { if (m && m.uniforms.uLightPos) m.uniforms.uLightPos.value.copy(lv); });
      },
      dispose: function () { all.forEach(function (m) { if (m) m.dispose(); }); list.forEach(function (t) { t.dispose(); }); }
    };
  }

  // GLTFLoader r128 ripulisce i nomi (spazi→_, e deduplica con _1, _2…):
  // si confrontano le basi senza i suffissi numerici.
  function base(n) { return String(n || '').replace(/[\s.\[\]:\/]/g, '_').replace(/(_\d+)+$/, '').toLowerCase(); }

  function assign(model, D, mats, opts) {
    var skip = (opts && opts.skip) || null;
    var list = []; model.traverse(function (o) { if (o.isMesh) list.push(o); });
    if (list.length !== D.meshes.length) throw new Error('[robot] mesh ' + list.length + ' ≠ ' + D.meshes.length);
    var out = { visor: null, chest: null, byMaterial: { Head: [], Body: [], Parts: [] } };
    list.forEach(function (mesh, i) {
      var d = D.meshes[i];
      if (d.name && base(d.name) !== base(mesh.name)) throw new Error('[robot] mesh ' + i + ': "' + mesh.name + '" ≠ Spline "' + d.name + '"');
      mesh.geometry.computeBoundingBox();
      var bb = mesh.geometry.boundingBox;
      if (bb.min.distanceTo(v3(d.bboxMin)) > 1.5 || bb.max.distanceTo(v3(d.bboxMax)) > 1.5) throw new Error('[robot] mesh ' + i + ' con bbox diverso da Spline');
      out.byMaterial[d.material].push(mesh);
      if (d.material === 'Head') out.visor = mesh;
      if (d.material === 'Body' && /^body$/i.test(base(d.name))) out.chest = mesh;
      if (skip && skip.has(mesh)) return;
      var m = mats.byName[d.material];
      if (!m) return;
      mesh.material = m;
      mesh.userData.splineMaterial = d.material;
    });
    return out;
  }

  return { create: create, assign: assign };
})();
```

- [ ] **Step 4: `index.html` — script prima di `robot.js`**

Dopo `robot-fibers.js` e prima di `robot.js`:
```html
<script src="js/robot-spline-glsl.js?v=20260919a"></script>
<script src="js/robot-spline-materials.js?v=20260919a"></script>
```

- [ ] **Step 5: `robot.js` — applica i materiali Spline (visore escluso fino al Task 5)**

`assign()` va chiamato **prima** che fibre (`model.add(fibers.object)`) e `headGroup` entrino nel modello: la posizione indicata qui sotto (subito dopo i materiali, prima delle fibre) lo garantisce; `assign` lancia un errore se trova più di 80 mesh.
Subito dopo il blocco `if (WC.robotMaterials) { … }` (i vecchi materiali restano applicati al solo visore) aggiungi:
```js
        if (WC.robotSplineMaterials) {
          var sm = WC.robotSplineMaterials.create(D);
          sm.setCamera(cam);
          // Prima passata: individua il visore (unica mesh 'Head'), poi
          // assegna Parts/Body a tutto il resto. Il visore tiene per ora il
          // vetro vecchio (Task 5 lo sostituisce).
          var probe = WC.robotSplineMaterials.assign(model, D, { byName: {} });
          var asg = WC.robotSplineMaterials.assign(model, D, sm, { skip: new Set([probe.visor]) });
          window.__robot.spline = sm;
          window.__robot.parts.visor = asg.visor;
          window.__robot.parts.chest = asg.chest;
        }
```
Nel `fit()` in fondo aggiungi `if (window.__robot && window.__robot.spline) window.__robot.spline.setCamera(cam);` (il view offset cambia la proiezione, non la vista, ma la luce va ricalcolata se cambia la camera). Nel teardown, prima di `renderer.dispose()`: `if (robot && robot.spline) robot.spline.dispose();`.

- [ ] **Step 6: Esegui controlli e confronto**

```bash
cd ~/Progetti/file-sciolti/robot-spline-tools
node prova.mjs --check materiali,rete-e-console,niente-movimento
node shot.mjs site out/t4-solo.png --solo
for k in braccio gambe petto; do node confronta.mjs out/ref-solo.png out/t4-solo.png ~/Progetti/file-sciolti/robot-confronto/04-$k.png --crop $(node -e "import('./lib.mjs').then(m=>console.log(m.CROPS['$k'].join(',')))"); done
```
Expected: `PASS materiali` con `0/10/69` + 1 `altro` (il visore); `meanDiff` per braccio/gambe/petto riportati. Obiettivo guida: `meanDiff` ≤ 6 (0–255) su braccio e gambe, ≤ 8 sul petto. Se sopra: ispezionare le coppie `04-*.png`; controllare nell'ordine (1) texture `flipY` e `wrap` (trama del carbonio storta/stirata), (2) `uLightPos` in view space (riflessi dal lato sbagliato), (3) segno di `sp_perturb` (bump invertito), (4) indici `MAP` in `estrai.mjs` (un alpha/mode scambiato cambia tutto). Riportare i numeri nel report.

- [ ] **Step 7: Commit**

```bash
cd ~/Progetti/axxell-site-robot
git add website-creation/js/robot-spline-glsl.js website-creation/js/robot-spline-materials.js website-creation/js/robot.js website-creation/index.html
git commit -m "feat(robot): strati Spline in GLSL nostro, materiali Parts e Body assegnati per indice

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Uq4gj26CZnLLaGs9oHjgm8"
```

---

### Task 5: Materiale `Head` — visore e occhi a LED (video)

**Files:**
- Modify: `website-creation/js/robot-spline-materials.js` (materiale Head, video, poster, play/pausa)
- Modify: `website-creation/js/robot.js` (visore con materiale Spline, via `robot-materials`, play/pausa in vista)
- Modify: `website-creation/index.html` (via `robot-materials.js`)
- Delete: `website-creation/js/robot-materials.js`

**Interfaces:**
- Consumes: `create/assign` del Task 4.
- Produces: `create(D)` ora ritorna anche `byName.Head` (define `MAT_HEAD`, uniform `uEyes`, `uVideo`, `uOpacity`), `video: HTMLVideoElement`, `setPlaying(bool)`, `setReveal(r)` (0..1: `uEyes = 1−r`; l'alpha arriva nel Task 6).

- [ ] **Step 1: Aggiungi a `prova.mjs` il controllo `occhi` (deve fallire)**

```js
  async 'occhi'() {
    const r = await p.evaluate(async () => { const s = window.__robot.spline; if (!s || !s.video) return 'niente video';
      const t0 = s.video.currentTime; await new Promise((ok) => setTimeout(ok, 1200));
      return { playing: !s.video.paused, avanzato: s.video.currentTime !== t0, visore: window.__robot.parts.visor.userData.splineMaterial }; });
    return (r.playing && r.avanzato && r.visore === 'Head') || JSON.stringify(r);
  },
```
Sostituisci il controllo `materiali` (ora il visore è Spline):
```js
  async 'materiali'() {
    const r = await p.evaluate(() => { const c = { Head: 0, Body: 0, Parts: 0, altro: 0 };
      const skip = new Set(); if (window.__robot.fibers) window.__robot.fibers.object.traverse((x) => skip.add(x));
      window.__robot.model.traverse((o) => { if (o.isMesh && !skip.has(o)) c[o.userData.splineMaterial || 'altro']++; }); return c; });
    return ([r.Head, r.Body, r.Parts].join('/') === '1/10/69' && r.altro === 0) || 'materiali ' + JSON.stringify(r);
  },
```
Run: `node prova.mjs --check occhi` → Expected: `FAIL occhi — "niente video"`.

- [ ] **Step 2: Materiale Head e video in `robot-spline-materials.js`**

In `create(D)`, prima di `var byName = …`:
```js
    var Hd = D.materials.Head;
    var video = document.createElement('video');
    video.src = Hd.video.src; video.muted = true; video.defaultMuted = true; video.loop = true;
    video.playsInline = true; video.setAttribute('playsinline', ''); video.preload = 'auto'; video.crossOrigin = 'anonymous';
    var vtex = new THREE.VideoTexture(video);
    vtex.encoding = THREE.LinearEncoding; vtex.flipY = Hd.video.flipY !== false;
    // Mipmap come Spline (minFilter 1008): senza, i puntini dei LED sfarfallano rimpiccioliti.
    vtex.generateMipmaps = true; vtex.minFilter = THREE.LinearMipmapLinearFilter; vtex.magFilter = THREE.LinearFilter;
    var poster = tex(Hd.video.poster, { flipY: Hd.video.flipY }, list);
    list.push(vtex);
    var hu = common(D, Hd, list);
    hu.uSpecular = { value: v3(Hd.light.specular) };
    hu.uShininess = { value: Hd.light.shininess };
    hu.uVideo = { value: poster };         // poster finché il video non scorre davvero
    hu.uVideoMat = { value: m3(Hd.video.mat) };
    hu.uVideoSize = { value: new THREE.Vector2(Hd.video.size[0], Hd.video.size[1]) };
    hu.uVideoCrop = { value: Hd.video.crop ? 1 : 0 };
    hu.uVideoAlpha = { value: Hd.video.alpha };
    hu.uVideoMode = { value: Hd.video.mode };
    hu.uEyes = { value: 1 };
    video.addEventListener('playing', function () { hu.uVideo.value = vtex; });
```
Sostituisci `var byName = …` e `var all = …` con:
```js
    var head = shader('MAT_HEAD', hu);
    var byName = { Parts: shader('MAT_PARTS', pu), Body: shader('MAT_BODY', bu), Head: head };
    var all = [byName.Parts, byName.Body, head];
```
Nel return aggiungi:
```js
      video: video,
      setPlaying: function (on) {
        if (on) { var pr = video.play(); if (pr && pr.catch) pr.catch(function () { hu.uVideo.value = poster; }); }
        else video.pause();
      },
      setReveal: function (r) { hu.uEyes.value = 1 - r; },
```
e nel `dispose` aggiungi `video.pause(); video.removeAttribute('src'); video.load();`.

- [ ] **Step 3: `robot.js` — visore Spline, via i materiali vecchi**

1. Elimina il blocco `if (WC.robotMaterials) { … }` (e le righe che scrivono `window.__robot.glass` / `.carbon`).
2. Il blocco del Task 4 diventa:
```js
        if (WC.robotSplineMaterials) {
          var sm = WC.robotSplineMaterials.create(D);
          sm.setCamera(cam);
          var asg = WC.robotSplineMaterials.assign(model, D, sm);
          window.__robot.spline = sm;
          window.__robot.parts.visor = asg.visor;
          window.__robot.parts.chest = asg.chest;
          sm.setPlaying(sectionVisible);
        }
```
3. Nel `tick()` elimina l'aggiornamento di `robot.glass.uniforms.uTime` e sostituisci `robot.glass.uniforms.uReveal.value = hoverHead;` con `robot.spline.setReveal(hoverHead);` e la condizione `robot && robot.glass && …` con `robot && robot.spline && …`.
4. Nel teardown elimina le righe su `robot.glass.userData.envMap` e `robot.carbon.userData.*` (le texture ora le smaltisce `spline.dispose()`).
5. Play/pausa con la visibilità della sezione: dentro `mount()` dopo la creazione del renderer (prima di `gltf.load`, così `sectionVisible` è già noto quando il materiale nasce):
```js
    var sectionVisible = !('IntersectionObserver' in window);
    var visIO = ('IntersectionObserver' in window) ? new IntersectionObserver(function (es) {
      sectionVisible = es.some(function (e) { return e.isIntersecting; });
      if (window.__robot && window.__robot.spline) window.__robot.spline.setPlaying(sectionVisible);
    }) : null;
    if (visIO) { visIO.observe(section); cleanups.push(function () { visIO.disconnect(); }); }
```

- [ ] **Step 4: `index.html` e file eliminato**

Elimina `<script src="js/robot-materials.js?v=20260831a"></script>` e il file: `git rm website-creation/js/robot-materials.js`.
Run: `grep -rn "robotMaterials\|robot-materials" website-creation/js website-creation/index.html` → Expected: nessun risultato.

- [ ] **Step 5: Esegui controlli e confronto della testa**

```bash
cd ~/Progetti/file-sciolti/robot-spline-tools
node prova.mjs
node shot.mjs site out/t5-solo.png --solo
node confronta.mjs out/ref-solo.png out/t5-solo.png ~/Progetti/file-sciolti/robot-confronto/05-testa.png --crop 630,110,180,200
node shot.mjs site out/t5-left.png --solo --pose cursor:200,300
node shot.mjs site out/t5-right.png --solo --pose cursor:1240,300
```
Expected: tutti i controlli `PASS` (incl. `occhi`, `materiali` `1/10/69`); `meanDiff` testa ≤ 8 (guida); in `t5-left/right` gli occhi restano sul visore mentre la testa gira e i puntini non sfarfallano (guardare a occhio i PNG e riportare).

- [ ] **Step 6: Commit**

```bash
cd ~/Progetti/axxell-site-robot
git add -A website-creation/js website-creation/index.html
git commit -m "feat(robot): visore Spline con occhi a LED video, via i materiali procedurali di agosto

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Uq4gj26CZnLLaGs9oHjgm8"
```

---

### Task 6: Reveal della testa — visore trasparente, occhi spenti, interni che sfumano, cervello

**Files:**
- Modify: `website-creation/js/robot-spline-materials.js` (`setReveal` completo, materiale `Parts` per gli interni)
- Modify: `website-creation/js/robot.js` (interni della testa, draw order)
- Modify: `~/Progetti/file-sciolti/robot-spline-tools/prova.mjs` (controllo `reveal`)

**Interfaces:**
- Consumes: `spline.byName.Head`, `spline.setReveal`, `parts.head`, `parts.visor`.
- Produces: `spline.setReveal(r)` → `Head.uOpacity = mix(1, 0.045, r)`, `Head.uEyes = 1 − r`, `PartsInside.uOpacity = 1 − r`, `depthWrite` degli interni `= r < 0.01`; `spline.makeInside(meshes)` assegna agli interni un clone trasparente di `Parts`. `window.__robot.parts.inside: Mesh[]`.

- [ ] **Step 1: Controllo `reveal` in `prova.mjs` (deve fallire)**

```js
  async 'reveal'() {
    const pt = await p.evaluate(() => { const r = window.__robot, v = new THREE.Vector3();
      new THREE.Box3().setFromObject(r.parts.visor).getCenter(v); v.project(r.camera);
      const rc = r.renderer.domElement.getBoundingClientRect(); return { x: rc.left + (v.x + 1) / 2 * rc.width, y: rc.top + (1 - v.y) / 2 * rc.height }; });
    await p.mouse.move(pt.x, pt.y, { steps: 8 }); await p.waitForTimeout(1500);
    const on = await p.evaluate(() => { const r = window.__robot, H = r.spline.byName.Head.uniforms;
      return { brain: r.brain.points.visible, eyes: +H.uEyes.value.toFixed(2), op: +H.uOpacity.value.toFixed(2),
        inside: r.parts.inside.map((m) => +m.material.uniforms.uOpacity.value.toFixed(2)) }; });
    await p.mouse.move(W - 2, 2, { steps: 8 }); await p.waitForTimeout(2500);
    const off = await p.evaluate(() => { const r = window.__robot, H = r.spline.byName.Head.uniforms;
      return { brain: r.brain.points.visible, eyes: +H.uEyes.value.toFixed(2), op: +H.uOpacity.value.toFixed(2),
        inside: r.parts.inside.map((m) => m.material.depthWrite) }; });
    const ok = on.brain && on.eyes <= 0.05 && on.op <= 0.1 && on.inside.length > 0 && on.inside.every((x) => x <= 0.05)
      && !off.brain && off.eyes >= 0.99 && off.op >= 0.99 && off.inside.every((x) => x === true);
    return ok || JSON.stringify({ on, off });
  },
```
Run: `node prova.mjs --check reveal` → Expected: FAIL (`inside` indefinito).

- [ ] **Step 2: `robot-spline-materials.js` — reveal completo e interni**

In `create(D)`, **subito dopo** `var head = shader('MAT_HEAD', hu);`:
```js
    var inside = [];
    var REVEAL_MIN_ALPHA = 0.045;   // stesso valore del vetro di agosto (uMinAlpha)
    head.transparent = true;        // in coda trasparenti (ordine col cervello); a riposo scrive depth come un opaco
```
Sostituisci `setReveal` con:
```js
      setReveal: function (r) {
        hu.uEyes.value = 1 - r;
        hu.uOpacity.value = 1 + (REVEAL_MIN_ALPHA - 1) * r;
        head.depthWrite = r < 0.01;
        inside.forEach(function (m) { m.uniforms.uOpacity.value = 1 - r; m.depthWrite = r < 0.01; });
      },
      makeInside: function (meshes) {
        meshes.forEach(function (mesh) {
          var m = byName.Parts.clone();          // stessi uniform per valore, texture condivise
          m.uniforms.uMatcap.value = byName.Parts.uniforms.uMatcap.value;
          m.uniforms.uTri.value = byName.Parts.uniforms.uTri.value;
          m.transparent = true;
          inside.push(m); all.push(m);
          mesh.material = m; mesh.renderOrder = 1;
        });
      },
```
(`setCamera` itera `all`, quindi anche i cloni ricevono la luce.)

- [ ] **Step 3: `robot.js` — interni della testa e draw order**

Dopo `window.__robot.parts.chest = asg.chest;` aggiungi:
```js
          // Mesh Parts DENTRO il volume del visore (es. il Cylinder y 209–260
          // dentro il visore y 222–304): al reveal sfumano col vetro, così non
          // coprono il cervello. Quelle del collo fuori dal visore restano opache.
          var vb = new THREE.Box3().setFromObject(asg.visor);
          var inside = parts.head.filter(function (m) {
            if (m === asg.visor || m.userData.splineMaterial !== 'Parts') return false;
            return vb.containsPoint(new THREE.Box3().setFromObject(m).getCenter(new THREE.Vector3()));
          });
          sm.makeInside(inside);
          sm.setCamera(cam);
          window.__robot.parts.inside = inside;
          if (window.__debugParts) console.log('[robot] interni testa:', inside.map(function (m) { return m.name; }));
          asg.visor.renderOrder = 2;
```
(Il cervello resta a `renderOrder` 0: cervello → interni → visore.)

- [ ] **Step 4: Esegui controlli e immagini del reveal**

```bash
cd ~/Progetti/file-sciolti/robot-spline-tools
node prova.mjs
node shot.mjs site ~/Progetti/file-sciolti/robot-confronto/06-reveal.png --pose hover-head
node shot.mjs site ~/Progetti/file-sciolti/robot-confronto/06-riposo.png
```
Expected: tutti `PASS`; in `06-reveal.png` visore trasparente, occhi spenti, cervello intero e nessun cilindro davanti; in `06-riposo.png` nessun punto del cervello.

- [ ] **Step 5: Commit**

```bash
cd ~/Progetti/axxell-site-robot
git add website-creation/js/robot-spline-materials.js website-creation/js/robot.js
git commit -m "feat(robot): reveal della testa — visore trasparente, occhi spenti, interni che sfumano

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Uq4gj26CZnLLaGs9oHjgm8"
```

---

### Task 7: Logo «A» bianco lucido sul petto, riflesso che segue il mouse

**Files:**
- Modify: `website-creation/js/robot-spline-glsl.js` (strato `LOGO`)
- Modify: `website-creation/js/robot-spline-materials.js` (istanza petto, maschera SVG, luce del logo)
- Modify: `website-creation/js/robot.js` (luce del logo dal puntatore)
- Modify: `~/Progetti/file-sciolti/robot-spline-tools/prova.mjs` (controllo `logo`)

**Interfaces:**
- Consumes: `asg.chest`, `spline.byName.Body`, `pointer` (NDC sulla sezione, `active`).
- Produces: `spline.makeChest(mesh)` (istanza `Body` + define `LOGO`, solo sul petto); `spline.setLogoLight(viewPos: THREE.Vector3)`; `spline.logo = { material, worldWidth, setOn(bool) }`. `LOGO_CONFIG` in cima a `robot-spline-materials.js`: `{ u: 0.5, v: 0.70, width: 0.36, base: 0.82, spec: 1.2, shininess: 60 }` (frazioni del bbox del petto; si tarano con Nike).

- [ ] **Step 1: Controllo `logo` in `prova.mjs` (deve fallire)**

```js
  async 'logo'() {
    const shot = async (x, y) => { await p.mouse.move(x, y, { steps: 6 }); await p.waitForTimeout(1200);
      return p.evaluate(() => { const r = window.__robot, g = r.renderer.getContext();
        const grab = (on) => { r.spline.logo.setOn(on); r.renderer.render(r.scene, r.camera);
        const v = new THREE.Box3().setFromObject(r.parts.chest); const a = v.min.clone().project(r.camera), b = v.max.clone().project(r.camera);
        const W = g.drawingBufferWidth, H = g.drawingBufferHeight;
        const x0 = Math.floor((Math.min(a.x, b.x) + 1) / 2 * W), x1 = Math.ceil((Math.max(a.x, b.x) + 1) / 2 * W);
        const y0 = Math.floor((Math.min(a.y, b.y) + 1) / 2 * H), y1 = Math.ceil((Math.max(a.y, b.y) + 1) / 2 * H);
        const px = new Uint8Array((x1 - x0) * (y1 - y0) * 4); g.readPixels(x0, y0, x1 - x0, y1 - y0, g.RGBA, g.UNSIGNED_BYTE, px); return { px, w: x1 - x0 }; };
        const OFF = grab(false), ON = grab(true), off = OFF.px, on = ON.px, rowW = ON.w;
        // maschera del logo = pixel che cambiano accendendolo; il punto più chiaro deve stare DENTRO
        let best = -1, bx = 0, inMask = false, white = 0;
        for (let i = 0; i < on.length; i += 4) { const changed = Math.abs(on[i] - off[i]) + Math.abs(on[i + 1] - off[i + 1]) + Math.abs(on[i + 2] - off[i + 2]) > 30;
          const l = on[i] + on[i + 1] + on[i + 2]; if (changed && l > 600) white++;
          if (l > best) { best = l; bx = (i / 4) % rowW; inMask = changed; } }
        return { white, bx, inMask, best }; }); };
    const has = await p.evaluate(() => !!(window.__robot.spline && window.__robot.spline.logo));
    if (!has) return 'nessun logo';
    const L = await shot(300, 400), R = await shot(1140, 400);
    const stamped = await p.evaluate(() => { let n = 0; window.__robot.model.traverse((o) => { if (o.isMesh && o.material.defines && 'LOGO' in o.material.defines) n++; }); return n; });
    return (L.white > 200 && R.white > 200 && L.inMask && R.inMask && L.best > 690 && R.bx - L.bx > 5 && stamped === 1) || JSON.stringify({ L, R, stamped });
  },
```
Nota: `readPixels` dopo un `render()` esplicito nello stesso task legge il buffer appena disegnato (niente `preserveDrawingBuffer`).
Run: `node prova.mjs --check logo` → Expected: `FAIL logo — nessun logo`.

- [ ] **Step 2: Strato `LOGO` nel fragment (`robot-spline-glsl.js`)**

Tra le dichiarazioni uniform aggiungi:
```js
    '#ifdef LOGO',
    'uniform sampler2D uLogo;',
    'uniform vec2 uLogoCenter;',
    'uniform float uLogoWidth;',
    'uniform vec3 uLogoLight;',       // view space, segue il puntatore
    'uniform float uLogoBase;',
    'uniform float uLogoSpec;',
    'uniform float uLogoShin;',
    'uniform float uLogoOn;',         // 0 = petto senza logo (confronto con Spline)
    '#endif',
```
Nel `main()`, dentro `#ifdef MAT_BODY` **dopo** `c = sp_applyRainbow(c);` (ultimo strato: il bianco non viene tinto):
```js
    '#ifdef LOGO',
    '  vec2 luv = (vPosition.xy - uLogoCenter) / uLogoWidth + 0.5;',
    '  float inside = step(0.0, luv.x) * step(luv.x, 1.0) * step(0.0, luv.y) * step(luv.y, 1.0) * step(0.0, vObjectNormal.z);',
    '  float lm = texture2D(uLogo, luv).a * inside * uLogoOn;',
    '  vec3 LV = normalize(uLogoLight + vViewPosition);',
    '  vec3 HV = normalize(LV + normalize(vViewPosition));',
    '  float lsp = pow(clamp(dot(n, HV), 0.0, 1.0), uLogoShin);',
    '  c = mix(c, vec3(uLogoBase) + vec3(lsp * uLogoSpec), lm);',
    '#endif',
```
(Il logo usa la normale geometrica `n`, non quella col bump: la «A» è liscia.)

- [ ] **Step 3: Istanza del petto e maschera SVG (`robot-spline-materials.js`)**

In testa al modulo:
```js
  var LOGO_CONFIG = { u: 0.5, v: 0.70, width: 0.36, base: 0.82, spec: 1.2, shininess: 60 };
  var LOGO_SVG = 'assets/robot-spline/logo-axxell-icon.svg';
```
In `create(D)` aggiungi al return:
```js
      logo: null,
      makeChest: function (mesh) {
        var m = byName.Body.clone();
        m.uniforms.uMatcap.value = byName.Body.uniforms.uMatcap.value;
        m.uniforms.uTri.value = byName.Body.uniforms.uTri.value;
        m.defines = { MAT_BODY: '', LOGO: '' };
        mesh.geometry.computeBoundingBox();
        var bb = mesh.geometry.boundingBox, sz = bb.getSize(new THREE.Vector3());
        var canvas = document.createElement('canvas'); canvas.width = canvas.height = 2048;
        var ltex = new THREE.CanvasTexture(canvas); ltex.encoding = THREE.LinearEncoding; list.push(ltex);
        var img = new Image();
        img.onload = function () { canvas.getContext('2d').drawImage(img, 0, 0, 2048, 2048); ltex.needsUpdate = true; };
        img.src = LOGO_SVG;
        m.uniforms.uLogo = { value: ltex };
        m.uniforms.uLogoCenter = { value: new THREE.Vector2(bb.min.x + sz.x * LOGO_CONFIG.u, bb.min.y + sz.y * LOGO_CONFIG.v) };
        m.uniforms.uLogoWidth = { value: sz.x * LOGO_CONFIG.width };
        m.uniforms.uLogoLight = { value: new THREE.Vector3(0, 0, 0) };
        m.uniforms.uLogoBase = { value: LOGO_CONFIG.base };
        m.uniforms.uLogoSpec = { value: LOGO_CONFIG.spec };
        m.uniforms.uLogoShin = { value: LOGO_CONFIG.shininess };
        m.uniforms.uLogoOn = { value: 1 };
        m.needsUpdate = true;
        mesh.material = m; all.push(m);
        var ws = mesh.getWorldScale(new THREE.Vector3());
        this.logo = { material: m, worldWidth: sz.x * LOGO_CONFIG.width * Math.abs(ws.x),
          setOn: function (on) { m.uniforms.uLogoOn.value = on ? 1 : 0; } };
        return m;
      },
      setLogoLight: function (v) { if (this.logo) this.logo.material.uniforms.uLogoLight.value.copy(v); },
```

- [ ] **Step 4: `robot.js` — petto e luce del logo**

Dopo `sm.makeInside(inside);` aggiungi `if (asg.chest) sm.makeChest(asg.chest); sm.setCamera(cam);`.
Prima di `var raf;` aggiungi:
```js
      // Luce del logo: davanti al petto, spostata dove punta il mouse
      // (riposo: in alto a sinistra), smorzata come la testa.
      var logoTarget = new THREE.Vector2(-0.35, -0.35), logoNow = logoTarget.clone();
      var chestView = new THREE.Vector3();
      if (window.__robot.parts.chest) new THREE.Box3().setFromObject(window.__robot.parts.chest).getCenter(chestView).applyMatrix4(cam.matrixWorldInverse);
      var logoLight = new THREE.Vector3();
```
Nel `tick()` prima di `renderer.render(scene, cam);`:
```js
        if (robot && robot.spline && robot.spline.logo) {
          if (pointer.active) logoTarget.set(pointer.x, pointer.y); else logoTarget.set(-0.35, -0.35);
          logoNow.lerp(logoTarget, 0.12);
          // Offset proporzionale alla «A» (~41 unità): il riflesso resta DENTRO il logo.
          var LW = robot.spline.logo.worldWidth;
          logoLight.set(chestView.x + logoNow.x * LW * 0.6, chestView.y - logoNow.y * LW * 0.6, chestView.z + LW * 1.5);
          robot.spline.setLogoLight(logoLight);
        }
```

- [ ] **Step 5: Esegui controlli e immagini**

```bash
cd ~/Progetti/file-sciolti/robot-spline-tools
node prova.mjs
for pos in 300,400 720,450 1140,400; do node shot.mjs site ~/Progetti/file-sciolti/robot-confronto/07-logo-$pos.png --pose cursor:$pos; done
```
Expected: tutti `PASS` (incl. `logo`: una sola mesh col logo, riflesso che si sposta a destra col mouse a destra); nei tre PNG la «A» bianca lucida sul petto con il riflesso in posizioni diverse.

- [ ] **Step 6: Commit**

```bash
cd ~/Progetti/axxell-site-robot
git add website-creation/js/robot-spline-glsl.js website-creation/js/robot-spline-materials.js website-creation/js/robot.js
git commit -m "feat(robot): logo A bianco lucido sul petto con riflesso che segue il mouse

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Uq4gj26CZnLLaGs9oHjgm8"
```

---

### Task 8: Pulizia finale e pacchetto di confronto per Nike

**Files:**
- Modify: `website-creation/js/robot.js` (commento di testa aggiornato, teardown verificato)
- Modify: `website-creation/index.html` (cache-bust uniforme `?v=20260919b` sui file robot toccati dopo il Task 3)
- Output: `~/Progetti/file-sciolti/robot-confronto/08-*.png`

- [ ] **Step 1: Teardown — controllo di smontaggio senza perdite**

Aggiungi a `prova.mjs`:
```js
  async 'smontaggio'() {
    const r = await p.evaluate(async () => { const before = window.__robot.renderer.info.memory;
      const tex = before.textures, geo = before.geometries;
      if (!window.WC || !WC.__unmount) return 'WC.__unmount assente';
      WC.__unmount('robot'); await new Promise((ok) => setTimeout(ok, 300));
      return { tex, geo, robot: typeof window.__robot, video: document.querySelectorAll('video[src*="eyes"]').length }; });
    return (r && r.robot === 'undefined' && r.video === 0) || JSON.stringify(r);
  },
```
Se `WC.__unmount` non esiste in `core.js`, **non** aggiungerlo: sostituisci il controllo con la verifica statica
`grep -n "spline.dispose\|video.pause" website-creation/js/robot.js website-creation/js/robot-spline-materials.js` (entrambi presenti) e annota nel report che lo smontaggio non è esercitabile da harness.

- [ ] **Step 2: Commento di testa di `robot.js`**

Sostituisci le righe 1–16 con:
```js
/* CAP 05 — robot 3D nostro con l'aspetto della scena Spline originale.
 *
 * GLB estratto (Draco, three r128 vendorizzato) nelle coordinate della scena
 * Spline; camera, luce, materiali, texture e video degli occhi arrivano da
 * WC.robotSplineData (generato fuori repo da robot-spline-tools/estrai.mjs)
 * e dallo shader a strati di robot-spline-glsl.js. Interazione: SOLO la testa
 * che segue il cursore; cursore sulla testa → visore trasparente, occhi
 * spenti, cervello visibile; cursore su un braccio → fibre accese. Nessuna
 * richiesta a Spline a runtime. Spec: docs/superpowers/specs/2026-09-19-*.
 */
```

- [ ] **Step 3: Cache-bust**

In `index.html` porta a `?v=20260919b` i `<script>` di `robot-spline-data.js`, `robot-parts.js`, `robot-fibers.js`, `robot-spline-glsl.js`, `robot-spline-materials.js`, `robot.js`.

- [ ] **Step 4: Giro completo di verifica**

```bash
cd ~/Progetti/file-sciolti/robot-spline-tools
node prova.mjs
node prova.mjs --w 1280 --h 720 --check conteggi-parti,materiali,rete-e-console
node shot.mjs site out/f-solo.png --solo
node confronta.mjs out/ref-solo.png out/f-solo.png ~/Progetti/file-sciolti/robot-confronto/08-intero.png
node shot.mjs site out/f-solo-nologo.png --solo --logo-off
node confronta.mjs out/ref-solo.png out/f-solo-nologo.png ~/Progetti/file-sciolti/robot-confronto/08-petto-senza-logo.png --crop 580,315,280,330
for k in testa petto braccio gambe; do node confronta.mjs out/ref-solo.png out/f-solo.png ~/Progetti/file-sciolti/robot-confronto/08-$k.png --crop $(node -e "import('./lib.mjs').then(m=>console.log(m.CROPS['$k'].join(',')))"); done
node shot.mjs ref ~/Progetti/file-sciolti/robot-confronto/08-spline-pagina.png
node shot.mjs site ~/Progetti/file-sciolti/robot-confronto/08-sito-pagina.png
node shot.mjs site ~/Progetti/file-sciolti/robot-confronto/08-sito-1280.png --w 1280 --h 720
node shot.mjs site ~/Progetti/file-sciolti/robot-confronto/08-reveal.png --pose hover-head
```
Expected: tutti i controlli `PASS`; `iou` ≥ 0.97; numeri `meanDiff` per zona nel report; il petto si giudica su `08-petto-senza-logo.png` (con logo differisce per scelta).

- [ ] **Step 5: Commit**

```bash
cd ~/Progetti/axxell-site-robot
git add website-creation/js/robot.js website-creation/index.html
git commit -m "chore(robot): commento di testa, cache-bust, verifica finale

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Uq4gj26CZnLLaGs9oHjgm8"
```

- [ ] **Step 6: Consegna a Nike (a cura del coordinatore, non del sub-agente)**

Aprire le coppie `08-*.png` a Nike (`open`), avviare l'anteprima del ramo (`python3 -m http.server 8801` nella radice del worktree → `http://localhost:8801/website-creation/index.html#cap05`) e raccogliere i ritocchi. **Criterio di chiusura: Nike non vede differenze.** Nessun push, nessun merge.
