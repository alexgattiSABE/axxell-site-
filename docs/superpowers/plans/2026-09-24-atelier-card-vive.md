# Atelier: live cards, no overlaps — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn `atelier/capitoli.html` into a usable showcase where nothing overlaps, the DNA stays visible, and each of the 7 cards runs its effect on its own with landing-page copy on top.

**Architecture:** A static page with no build step. An inline three.js r128 script draws the glass deck. `js/dna.js` draws the helix on its own canvas (`#helixStage`). `js/effetti-deck.js` holds the card records, the helix path and the wake/freeze controller, which mounts one live effect module into `#stage-live` over the front card. Changes stay inside those files and inside each module's `external` branch. Verification is a Playwright script that reads a small debug API exposed by the page.

**Tech Stack:** Vanilla JS, three.js r128 UMD global, GSAP + ScrollTrigger + Lenis, GSAP ScrambleTextPlugin (already in `vendor/`), the `window.WC` registry (`js/core.js`). Playwright + sharp from `~/Progetti/axxell-chatbot/node_modules` for verification only.

**Spec:** `docs/superpowers/specs/2026-09-24-atelier-card-vive-design.md` (read it before any task).

## Global Constraints

- No external hosts except Google Fonts. Three r128 UMD global. No new dependencies in the site.
- Every module change goes in the module's `external` branch (`WC.effects.<id>` handle) or behind a flag that branch sets. `capitoli-legacy.html` must behave exactly as before.
- Do not touch `atelier/index.html`, `capitoli-legacy.html`, the chapter folders (`il-viaggio/`, `la-macchina/`, `il-dettaglio/`, `prima-e-dopo/`, `la-notte/`, `lo-studio/`, `il-prodotto/`), or `assets/` outside `assets/effetti/`. Another session owns those files (worktree `~/Progetti/axxell-site-atelier-home`).
- Scene tints go through CONFIG, never shader edits.
- Functional text is 11px or more, and caption text has at least .72 alpha.
- No coloured glow shadows (zero-offset chromatic `box-shadow`/`text-shadow`) in new CSS.
- Reduced motion: no effect wakes. The landing copy still shows on the poster.
- Titles and copy are the exact Italian strings in spec section C.
- Code comments are in Italian, matching the file's existing voice. Commit messages are in English.
- Never push. Never merge to `main`.
- Every task that edits a `js/*.js` file bumps that file's `?v=` query in `capitoli.html` to `?v=20260924a`, so browsers do not serve a stale cached module.

## Review Focus

1. **Resize mid-session (desktop ↔ portrait, window drag):** the helix clip, the `#lp` copy layer, the index position and the no-overlap layout all follow the new size, with no stale hole left in the helix. Tested in Task 2 (`overlap` at both viewports after a live `setViewportSize`).
2. **Fast wheel spins through several cards:** effects never wake mid-spin, the copy fades out, and the helix never goes blank. Tested in Task 1 (`helix` during a 3-card wheel burst).
3. **Clicking and dragging on the live preview:** the deck does not spin, the URL never changes, and the effect keeps running. Tested in Task 4 (`interact`).
4. **Reduced motion:** no effect wakes, the copy is visible on the poster, and the arrows and dots still change card. Tested in Task 5 (`copy --reduce`).
5. **Coming back to a card:** each module resumes (sneaker video plays again, the vesper driver resumes, the warp driver never replays the tunnel). Tested in Task 12 (`alive` twice per card, with another card in between).
6. **Touch swipe on the preview (real finger, `pointerType:'touch'`), and Safari smoothness:** the harness only emulates a mouse in Chromium. `touch-action`, the swipe path and the per-frame clip-path cost in Safari are checked by hand and reported in Task 12, never claimed as automated.

---

## Shared test harness (read once; Task 1 creates it)

The server runs from the repo root: `cd ~/Progetti/axxell-site-atelier && python3 -m http.server 8803` (port 8802 is taken by another session). Start it once in the background if it is not already running: `lsof -iTCP:8803 -sTCP:LISTEN || (python3 -m http.server 8803 >/dev/null 2>&1 &)`.

All checks run with: `node scripts/verify-capitoli.cjs <check> [--mobile] [--reduce] [args]`. Each check prints `PASS <check>` or `FAIL <check>: <reason>` and exits 0 or 1. Screenshots go to `/tmp/capitoli-verify/`.

---

### Task 1: Debug API, verify harness, helix cut-out with clip-path

**Files:**
- Create: `scripts/verify-capitoli.cjs`
- Modify: `atelier/capitoli.html` (CSS `#helixStage.-buco` ~line 52-68; `bucoElica` block after `var HELIX_EL` ~line 1676; end of the inline IIFE for the debug API)

**Interfaces:**
- Produces: `window.__capitoli = { cards(), goTo(i), spin(), front(), awake(), index(), caption(), nav() }`
  - `cards()` → `[{ idx, id, u, reveal, quad: [[x,y],[x,y],[x,y],[x,y]] }]`, where `quad` holds the card corners in CSS px (TL, TR, BR, BL), projected with the scene camera.
  - `index()` → `{ quad }` for the index plane, projected the same way.
  - `caption()` / `nav()` → DOMRect-like `{x,y,w,h}` of `#focus`+`#hint` (union) and of `#nav`.
  - `goTo(i)` calls `portaDavanti(i)`. `spin()` returns `spin`. `front()` returns `frontIdx()`. `awake()` returns `deckCtl.awake()`.
- Produces: `bucoElica(spegni)` (same name as today), now writing `clip-path`.
- Produces: `scripts/verify-capitoli.cjs` with the checks `helix`, `overlap`, `alive`, `interact` and `copy`. Task 1 implements `helix`, plus `overlap` in its final form so Task 2 can use it. The other checks are added by the tasks that need them, as stubs that print `SKIP`.

- [ ] **Step 1: Write the harness with the `helix` and `overlap` checks**

```js
// scripts/verify-capitoli.cjs — verifica a schermo di atelier/capitoli.html
const NM = '/Users/nico/Progetti/axxell-chatbot/node_modules/';
const { chromium } = require(NM + 'playwright');
const sharp = require(NM + 'sharp');
const fs = require('fs');
const OUT = '/tmp/capitoli-verify'; fs.mkdirSync(OUT, { recursive: true });
const EXE = '/Users/nico/Library/Caches/ms-playwright/chromium-1243/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';
const URL = 'http://localhost:8803/atelier/capitoli.html';
const argv = process.argv.slice(2);
const check = argv[0], mobile = argv.includes('--mobile'), reduce = argv.includes('--reduce');
const arg = argv.filter(a => !a.startsWith('--'))[1];
const VP = mobile ? { width: 390, height: 844 } : { width: 1440, height: 900 };

function fail(msg){ console.log('FAIL ' + check + ': ' + msg); process.exitCode = 1; }
function pass(){ if (!process.exitCode) console.log('PASS ' + check + (mobile ? ' (mobile)' : '')); }

async function open(){
  const b = await chromium.launch({ executablePath: EXE, args: ['--use-gl=angle', '--ignore-gpu-blocklist'] });
  const p = await b.newPage({ viewport: VP, reducedMotion: reduce ? 'reduce' : 'no-preference', hasTouch: mobile, isMobile: mobile,
                              deviceScaleFactor: check === 'poster' ? 2 : 1 });
  const errs = [];
  p.on('pageerror', e => errs.push(e.message));
  p.on('console', m => { if (m.type() === 'error' && !/404|ReadPixels/.test(m.text())) errs.push(m.text()); });
  await p.goto(URL);
  await p.waitForFunction(() => window.__capitoli && window.__capitoli.cards().length === 7, null, { timeout: 15000 });
  await p.waitForTimeout(4500);                     // arrivo + composizione del mazzo
  return { b, p, errs };
}
async function settle(p, i){
  await p.evaluate(i => window.__capitoli.goTo(i), i);
  await p.waitForTimeout(1600);
}
// Separating-axis test fra due poligoni convessi (quad proiettati).
function overlaps(A, B){
  for (const P of [A, B]) for (let i = 0; i < P.length; i++){
    const [x1, y1] = P[i], [x2, y2] = P[(i + 1) % P.length];
    const nx = y2 - y1, ny = x1 - x2;
    let a0 = Infinity, a1 = -Infinity, b0 = Infinity, b1 = -Infinity;
    for (const [x, y] of A){ const d = x * nx + y * ny; a0 = Math.min(a0, d); a1 = Math.max(a1, d); }
    for (const [x, y] of B){ const d = x * nx + y * ny; b0 = Math.min(b0, d); b1 = Math.max(b1, d); }
    if (a1 <= b0 + 0.5 || b1 <= a0 + 0.5) return false;
  }
  return true;
}
const rectQuad = r => [[r.x, r.y], [r.x + r.w, r.y], [r.x + r.w, r.y + r.h], [r.x, r.y + r.h]];

async function checkOverlap(p, label){
  const s = await p.evaluate(() => ({ c: window.__capitoli.cards(), i: window.__capitoli.index(),
                                      cap: window.__capitoli.caption(), nav: window.__capitoli.nav() }));
  const vis = s.c.filter(c => c.reveal > 0.05);
  const obst = [{ n: 'caption', q: rectQuad(s.cap) }, { n: 'nav', q: rectQuad(s.nav) }];
  if (s.i.opacity > 0.1) obst.push({ n: 'index', q: s.i.quad });
  for (let a = 0; a < vis.length; a++){
    for (let b = a + 1; b < vis.length; b++)
      if (overlaps(vis[a].quad, vis[b].quad)) fail(`${label}: card ${vis[a].id} overlaps card ${vis[b].id}`);
    for (const o of obst) if (overlaps(vis[a].quad, o.q)) fail(`${label}: card ${vis[a].id} overlaps ${o.n}`);
  }
  if (s.i.opacity > 0.1 && overlaps(s.i.quad, rectQuad(s.cap))) fail(`${label}: index overlaps caption`);
}

function inQuad(q, x, y){                       // punto dentro un quad convesso
  let s = 0;
  for (let i = 0; i < 4; i++){
    const [x1, y1] = q[i], [x2, y2] = q[(i + 1) % 4];
    const c = (x2 - x1) * (y - y1) - (y2 - y1) * (x - x1);
    if (c !== 0){ if (s === 0) s = Math.sign(c); else if (Math.sign(c) !== s) return false; }
  }
  return true;
}
// Pixel ciano dell'elica nella colonna centrale: `out` = fuori da ogni card
// visibile (l'elica c'e'), `inFront` = dentro la card davanti (deve essere ~0:
// il buco taglia davvero). Le card si leggono PRIMA della cattura.
async function helixPixels(p, file){
  const cards = await p.evaluate(() => window.__capitoli.cards());
  const front = await p.evaluate(() => window.__capitoli.front());
  const buf = await p.screenshot({ path: OUT + '/' + file });
  const { data, info } = await sharp(buf).raw().toBuffer({ resolveWithObject: true });
  const vis = cards.filter(c => c.reveal > 0.05).map(c => c.quad);
  const fq = cards[front].quad;
  const x0 = Math.round(info.width * 0.40), x1 = Math.round(info.width * 0.60);
  let out = 0, inFront = 0;
  for (let y = 0; y < info.height; y += 2) for (let x = x0; x < x1; x += 2){
    const o = (y * info.width + x) * info.channels, r = data[o], g = data[o + 1], bl = data[o + 2];
    if (!(bl > 150 && g > 120 && r < 120)) continue;   // il ciano dei punti del DNA
    if (inQuad(fq, x, y)) inFront++;
    else if (!vis.some(q => inQuad(q, x, y))) out++;
  }
  return { out, inFront };
}

(async () => {
  const { b, p, errs } = await open();
  try {
    if (check === 'helix'){
      await settle(p, 0);
      const r0 = await helixPixels(p, 'helix-rest.png'), rest = r0.out;
      // la card davanti copre davvero l'elica (il buco taglia): quasi zero punti dentro
      if (r0.inFront > 25) fail('helix drawn over the front card: ' + r0.inFront + ' px');
      // raffica di rotellina: tre card, catture durante il moto
      let min = Infinity;
      await p.mouse.move(VP.width * 0.9, VP.height * 0.5);
      for (let k = 0; k < 6; k++){
        await p.mouse.wheel(0, 600);
        await p.waitForTimeout(90);
        min = Math.min(min, (await helixPixels(p, `helix-move-${k}.png`)).out);
      }
      const cp = await p.evaluate(() => getComputedStyle(document.getElementById('helixStage')).clipPath);
      if (!/^path\(/.test(cp) && cp !== 'none') fail('clip-path is not a path(): ' + cp);
      const mask = await p.evaluate(() => getComputedStyle(document.getElementById('helixStage')).maskImage || '');
      if (/data:image/.test(mask)) fail('mask-image data URI still in use');
      if (rest < 150) fail('helix barely visible at rest: ' + rest);
      if (min < rest * 0.35) fail(`helix vanishes while moving: rest=${rest} min=${min}`);
    } else if (check === 'overlap'){
      for (let i = 0; i < 7; i++){ await settle(p, i); await checkOverlap(p, 'rest ' + i); }
      // a meta' transizione: spin frazionario ±0.5, fermo
      await p.evaluate(() => window.__capitoli.setSpin(3.5));
      await p.waitForTimeout(400); await checkOverlap(p, 'mid 3.5');
      await p.evaluate(() => window.__capitoli.setSpin(2.5));
      await p.waitForTimeout(400); await checkOverlap(p, 'mid 2.5');
      // resize dal vivo: desktop -> ritratto (o viceversa) e ricontrollo
      await p.setViewportSize(mobile ? { width: 1440, height: 900 } : { width: 390, height: 844 });
      await p.waitForTimeout(800); await settle(p, 0); await checkOverlap(p, 'after resize');
      await p.screenshot({ path: OUT + '/overlap-after-resize.png' });
    } else {
      console.log('SKIP ' + check + ' (not implemented yet)');
    }
    if (errs.length) fail('console errors: ' + errs.join(' | '));
    pass();
  } finally { await b.close(); }
})();
```

`setSpin(v)` freezes the deck at a fractional spin for the overlap check. Add it to the debug API: it sets `spin = spinT = v`, `lastInput = performance.now() + 1e7` (no snap), and `dragging = false`.

- [ ] **Step 2: Add the debug API at the end of the inline IIFE (just before `})();` that closes it, after the `initial` block)**

```js
  /* LA SONDA DELLA VERIFICA (scripts/verify-capitoli.cjs). Solo letture e due
     comandi (portare davanti una card, fermare il mazzo a meta' giro): niente
     che la pagina usi da se'. */
  var sondaV = new THREE.Vector3();
  function sondaQuad(mesh, w2, h2){
    var el = renderer.domElement, W = el.clientWidth, H = el.clientHeight;
    mesh.updateWorldMatrix(true, false); camera.updateMatrixWorld();
    return [[-w2, h2], [w2, h2], [w2, -h2], [-w2, -h2]].map(function(p){
      sondaV.set(p[0], p[1], 0).applyMatrix4(mesh.matrixWorld).project(camera);
      return [(sondaV.x * 0.5 + 0.5) * W, (1 - (sondaV.y * 0.5 + 0.5)) * H];
    });
  }
  function sondaRect(els){
    var x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    els.forEach(function(e){
      if (!e) return;
      var r = e.getBoundingClientRect();
      if (r.width < 1 || getComputedStyle(e).opacity === '0') return;
      x0 = Math.min(x0, r.left); y0 = Math.min(y0, r.top);
      x1 = Math.max(x1, r.right); y1 = Math.max(y1, r.bottom);
    });
    return x0 === Infinity ? { x: -10, y: -10, w: 1, h: 1 } : { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
  }
  window.__capitoli = {
    cards: function(){
      return WORLDS.map(function(w){
        return { idx: w.idx, id: w.id, u: w.u, reveal: w.uni.uReveal.value, quad: sondaQuad(w.mesh, CW/2, CH/2) };
      });
    },
    index: function(){ return { quad: sondaQuad(idxMesh, 1.20, 0.72), opacity: idxMat.opacity }; },
    caption: function(){ return sondaRect([document.getElementById('focus'), document.getElementById('hint')]); },
    nav: function(){ return sondaRect([document.getElementById('nav')]); },
    goTo: function(i){ portaDavanti(i); },
    setSpin: function(v){ spin = spinT = v; lastInput = performance.now() + 1e7; dragging = false; },
    spin: function(){ return spin; },
    front: function(){ return frontIdx(); },
    awake: function(){ return deckCtl ? deckCtl.awake() : null; }
  };
```

`index()` uses the current plane half-size (2.40×1.44 → 1.20, 0.72). Task 3 changes the plane size and must update these two numbers in the same commit.

- [ ] **Step 3: Run `helix` and see it fail**

Run: `node scripts/verify-capitoli.cjs helix`
Expected: `FAIL helix: mask-image data URI still in use`, and/or `helix vanishes while moving`.

- [ ] **Step 4: Replace the mask with a clip-path**

CSS: replace the whole `#helixStage.-buco{...}` rule with the following, and keep the comment above it but rewrite its last sentence to say "clip-path path() scritto a ogni fotogramma":

```css
  #helixStage.-buco{-webkit-clip-path:var(--buco);clip-path:var(--buco)}
```

JS: in `bucoElica`, keep `BUCO_PTS`, the front-of-axis rule, the reveal rule and the projection. Replace the path building and the SVG branch with the following:

```js
  function bucoElica(spegni){
    if (!HELIX_EL) return;
    var el = renderer.domElement;
    var W = el.clientWidth || window.innerWidth, H = el.clientHeight || window.innerHeight;
    var paths = [];
    if (!spegni){
      var asseZ = -((window.__HELIX_TUNE && window.__HELIX_TUNE.R) || 4.5);
      /* Durante l'ingresso (`body.-entra`) l'asse scivola di 42px: il buco va
         spostato di quanto e' spostato lui, se no resta sfasato sulla card. */
      var dy = document.body.classList.contains('-entra') ? HELIX_EL.getBoundingClientRect().top : 0;
      camera.updateMatrixWorld();
      WORLDS.forEach(function(w){
        if (!w.mesh || w.uni.uReveal.value < 0.3) return;
        if (w.mesh.position.z <= asseZ) return;
        w.mesh.updateWorldMatrix(true, false);
        var d = '';
        /* SENSO OPPOSTO AL RETTANGOLO: BUCO_PTS, proiettato sullo schermo (y in
           giu'), gira al contrario del rettangolo `M0 0 H W V H H0 Z`, quindi
           con `nonzero` dentro la sagoma il conto fa zero e l'elica si taglia.
           Due sagome sovrapposte li' ridipingerebbero (−1): non succede perche'
           le card non si toccano piu' (vedi deckScale). */
        for (var i = 0; i < BUCO_PTS.length; i++){
          bucoV.set(BUCO_PTS[i][0], BUCO_PTS[i][1], 0).applyMatrix4(w.mesh.matrixWorld).project(camera);
          d += (d ? 'L' : 'M') + Math.round((bucoV.x*0.5+0.5)*W) + ' ' +
               Math.round((1-(bucoV.y*0.5+0.5))*H - dy);
        }
        paths.push(d + 'Z');
      });
    }
    var key = paths.length ? W + 'x' + H + paths.join('') : '';
    if (key === bucoKey) return;
    bucoKey = key;
    if (!key){
      HELIX_EL.classList.remove('-buco');
      HELIX_EL.style.removeProperty('--buco');
      return;
    }
    HELIX_EL.style.setProperty('--buco',
      'path(nonzero, "M0 0H' + W + 'V' + H + 'H0Z' + paths.join('') + '")');
    HELIX_EL.classList.add('-buco');
  }
```

Winding (checked by the plan review with the shoelace formula): `BUCO_PTS` walked FORWARD already has the opposite signed area to the screen rectangle `M0 0 H W V H H0 Z` once projected to y-down pixels, so the forward loop cuts the hole. Walking it backwards would give winding 2 and no hole. The `helix` check asserts `inFront ≈ 0`, which catches a wrong winding.
Overlapping holes would repaint (winding −1). That cannot happen after Task 2, which guarantees cards never overlap, but it can happen during Task 1 while neighbours still overlap. Judge Task 1's visuals on the front card only.
Read `HELIX_EL.getBoundingClientRect().top` only while `document.body.classList.contains('-entra')` (else `dy = 0`), so it does not force a layout every frame.

- [ ] **Step 5: Run `helix` on both viewports**

Run: `node scripts/verify-capitoli.cjs helix && node scripts/verify-capitoli.cjs helix --mobile`
Expected: `PASS helix` twice. Open `/tmp/capitoli-verify/helix-move-2.png` with Read: the DNA must be visible above and below the card while it moves, and it must never cross the front card.

- [ ] **Step 6: Commit**

```bash
git add scripts/verify-capitoli.cjs atelier/capitoli.html
git commit -m "fix(atelier): cut the helix with a per-frame clip-path instead of a mask image

The SVG mask-image was swapped every frame while cards moved; browsers decode it
asynchronously and treat an unready mask as transparent, so the DNA vanished
while scrolling. clip-path path() applies synchronously. Adds a debug probe
(window.__capitoli) and a Playwright verify script."
```

---

### Task 2: No card touches another

**Files:**
- Modify: `atelier/js/effetti-deck.js:111` (`TUNE`)
- Modify: `atelier/capitoli.html` (`deckScale` ~line 519, `deckFade` ~line 523, `helixTune()` ~line 1541, `resize()` `need` ~line 1562)

**Interfaces:**
- Consumes: `window.__capitoli.cards()/index()/caption()/nav()/setSpin()` and the `overlap` check from Task 1.
- Produces: `deckScale(u)` returns 1 at u=0 and falls smoothly to `SCALE_SIDE` for |u|≥1. `window.__HELIX_TUNE` keeps the same keys.

- [ ] **Step 1: Run `overlap` and see it fail**

Run: `node scripts/verify-capitoli.cjs overlap`
Expected: `FAIL overlap: rest 0: card altitude overlaps card sneaker` (or similar).

- [ ] **Step 2: Set the starting values found by the projection brute force**

`js/effetti-deck.js`:

```js
  var TUNE = { A: 1.3, R: 4.5, turns: 0.38, climb: 2.2, yTop: 0.95 };
```

Update the TARATURA comment above it with one dated line: `2026-09-24: climb 0.85 → 2.2 e vicine al 55% (deckScale in capitoli.html): nessuna card ne tocca un'altra (richiesta di Nike), verificato con scripts/verify-capitoli.cjs overlap.`

`capitoli.html`:

```js
  /* LE VICINE RIMPICCIOLISCONO (2026-09-24, richiesta di Nike: «nessuna card
     deve toccarne un'altra»). A grandezza piena le card accanto finivano
     quasi tutte DENTRO al rettangolo di quella davanti; al 55% e piu' in alto
     e in basso lungo l'elica restano staccate anche a meta' giro. Smussato
     (smoothstep su |u|) perche' la card che arriva cresca, non scatti. */
  var SCALE_SIDE = 0.55;
  function deckScale(u){
    var a = Math.min(1, Math.abs(u));
    a = a * a * (3 - 2 * a);
    return 1 - (1 - SCALE_SIDE) * a;
  }
```

- [ ] **Step 3: Run `overlap` at both viewports, then adjust**

Run: `node scripts/verify-capitoli.cjs overlap; node scripts/verify-capitoli.cjs overlap --mobile`

Fix each reported failure with this rule order. Change one number, then re-run:
1. `overlaps caption`: lower `TUNE.yTop` by 0.10 steps (the front card moves up), or lift `#focus` `bottom`. Do not shrink the front card below 0.9.
2. `overlaps nav`: lower `TUNE.climb` by 0.1, but never below the value where card-to-card overlap comes back.
3. A neighbour at |u|≈1 that still collides: tighten `deckFade` so it is fully faded before it would touch. Replace the thresholds `-0.1`/`0.35` with `0.15`/`0.55` and re-test.
4. Portrait only: change the `helixTune()` factors (`A ×0.66`, `climb ×0.82`, `yTop ×0.90`), never the desktop base.
5. `overlaps index`: skip it here. Task 3 moves the index. A remaining `index` failure is acceptable only until Task 3.

Record the final numbers in the TARATURA comment.

- [ ] **Step 4: Verify visually**

Run: `node scripts/verify-capitoli.cjs overlap` (it saves `overlap-after-resize.png`). Take one extra screenshot per viewport through `helix` (`helix-rest.png`). Open both with Read: the front card is centred and whole, the neighbours are smaller and do not touch it, and the DNA runs between them.
Expected: `PASS overlap` and `PASS overlap (mobile)`, except `index` failures.

- [ ] **Step 5: Commit**

```bash
git add atelier/js/effetti-deck.js atelier/capitoli.html
git commit -m "feat(atelier): space the cards along the helix so none touches another"
```

---

### Task 3: Index "ESPLORA IL MONDO", new titles, readable captions

**Files:**
- Modify: `atelier/js/effetti-deck.js:34-42` (records: `nome`, plus a new `lp` object per record)
- Modify: `atelier/capitoli.html` (index canvas ~lines 990-1060; `pickRiga`, `primoDelCluster`; click handler ~line 1515; index placement in `resize()` ~lines 1590-1595; CSS `#hint`, `#focus` ~lines 162-207; hint text ~line 331 and ~line 1329; debug `index()` half-size)

**Interfaces:**
- Produces: each `EFFETTI` record gains `nome` (new title) and `lp: { kicker, h, sub, cta }` (Task 5 reads `lp`). `tipo` stays and is used as the kicker.
- Produces: `pickRiga()` returns a card index 0..6, or -1.

- [ ] **Step 1: Write the check**

Add an `index` branch to the harness:

```js
    } else if (check === 'index'){
      await settle(p, 3);
      const t = await p.evaluate(() => ({
        names: window.EFFETTI.map(e => e.nome),
        fname: document.getElementById('fName').textContent,
        hint: document.getElementById('hint').textContent,
        hintPx: parseFloat(getComputedStyle(document.getElementById('hint')).fontSize),
        hintA: getComputedStyle(document.getElementById('hint')).color,
        subA: getComputedStyle(document.getElementById('fSub')).color
      }));
      const want = ['Vapore','Gravità','Anatomia','Nebulosa','Contatto','Genesi','Rivela'];
      if (JSON.stringify(t.names) !== JSON.stringify(want)) fail('titles: ' + t.names.join(','));
      if (t.fname !== 'Nebulosa') fail('caption title: ' + t.fname);
      if (t.hintPx < 11) fail('hint font ' + t.hintPx);
      const alpha = c => { const m = c.match(/rgba?\(([^)]+)\)/); const v = m[1].split(',').map(Number); return v.length > 3 ? v[3] : 1; };
      if (alpha(t.hintA) < 0.72 || alpha(t.subA) < 0.72) fail('caption alpha ' + t.hintA + ' / ' + t.subA);
      // la riga 5 dell'elenco porta davanti la card 5
      const q = await p.evaluate(() => window.__capitoli.index().quad);
      const pt = await p.evaluate(() => window.__capitoli.indexRowPt(5, 0.25));
      await p.mouse.click(pt[0], pt[1]);
      await p.waitForTimeout(1600);
      if (await p.evaluate(() => window.__capitoli.front()) !== 5) fail('index row click did not bring card 5');
      await p.screenshot({ path: OUT + '/index.png' });
      await checkOverlap(p, 'index');
```

Also add `indexRowPt(k, fx)` to the debug API. It projects the point at fraction `fx` of the width on row `k` of the index plane (the same local x that gets clicked, because the plane is rotated) and returns `[x, y]` in CSS px:

```js
    indexRowPt: function(k, fx){
      var v = 0.72 - 1.44 * ((IROW0 + k * IROWH) / IH);   // da uv a coordinate locali del piano
      var x = -1.20 + 2.40 * fx;
      idxMesh.updateWorldMatrix(true, false); camera.updateMatrixWorld();
      sondaV.set(x, v, 0).applyMatrix4(idxMesh.matrixWorld).project(camera);
      var el = renderer.domElement;
      return [(sondaV.x * 0.5 + 0.5) * el.clientWidth, (1 - (sondaV.y * 0.5 + 0.5)) * el.clientHeight];
    },
```

(Step 3 changes the plane to 2.90×2.00: update `1.20/2.40` to `1.45/2.90` and `0.72/1.44` to `1.00/2.00` here and in `index()`.)

- [ ] **Step 2: Run it and see it fail**

Run: `node scripts/verify-capitoli.cjs index`
Expected: `FAIL index: titles: La piega,La scarpa,...`

- [ ] **Step 3: Implement**

`js/effetti-deck.js`: replace `nome` and add `lp` on each record. Use the exact copy from spec §C:

```js
    { id:'altitude', nome:'Vapore',   tipo:'Fluidi', cluster:0, modulo:'altitude', render:'webgl', poster:'assets/effetti/altitude.webp', col:[0.36,0.80,1.00],
      lp:{ kicker:'Fluidi', h:['Il cielo si piega','dove passi.'], sub:'Una simulazione di fluido che segue il cursore, in tempo reale.', cta:'Muovi il mouse' } },
    { id:'sneaker',  nome:'Gravità',  tipo:'Immagini animate', cluster:1, modulo:'sneaker', render:'dom', poster:'assets/effetti/sneaker.webp', col:[0.60,0.85,1.00],
      lp:{ kicker:'Immagini animate', h:['Ogni passo,','sospeso.'], sub:'Il prodotto che fluttua e gira da solo, come in uno spot.', cta:'Guarda' } },
    { id:'orologio', nome:'Anatomia', tipo:'Immagini animate', cluster:1, modulo:'orologio', render:'canvas2d', poster:'assets/effetti/orologio.webp', col:[0.60,0.85,1.00], chiaro:true,
      lp:{ kicker:'Immagini animate', h:['Dentro ogni','dettaglio.'], sub:"L'orologio si apre pezzo per pezzo, senza un fotogramma fuori posto.", cta:'Esplora' } },
    { id:'vesper',   nome:'Nebulosa', tipo:'Modelli interattivi', cluster:2, modulo:'vesper', render:'webgl', poster:'assets/effetti/vesper.webp', col:[0.23,0.85,1.00],
      lp:{ kicker:'Modelli interattivi', h:['Da una sfera, una galassia.',"Da una galassia, un'idea."], sub:'Ventimila punti che cambiano forma e rispondono al tuo gesto.', cta:'Avvicinati' } },
    { id:'saucer',   nome:'Contatto', tipo:'Modelli interattivi', cluster:2, modulo:'saucer', render:'webgl', poster:'assets/effetti/saucer.webp', col:[0.23,0.85,1.00], scramble:true,
      lp:{ kicker:'Modelli interattivi', h:["Quarantamila fili d'erba.",'Uno solo è stato scelto.'], sub:'Una scena 3D che risponde a chi la guarda.', cta:'Scopri' } },
    { id:'warp',     nome:'Genesi',   tipo:'Testo', cluster:3, modulo:'warp', render:'webgl', poster:'assets/effetti/warp.webp', col:[0.85,0.70,1.00],
      lp:{ kicker:'Testo', h:["Tutto comincia","da un'elica."], sub:'Particelle che si ricompongono in forme sempre nuove.', cta:'Osserva' } },
    { id:'lithos',   nome:'Rivela',   tipo:'Prima / dopo', cluster:4, modulo:'lithos', render:'dom', poster:'assets/effetti/lithos.webp', col:[0.98,0.78,0.52],
      lp:{ kicker:'Prima / dopo', h:['La luce racconta','il prima e il dopo.'], sub:"Passa sopra l'immagine e scopri com'era.", cta:'Illumina' } }
```

The headline is split into two lines. That is how the spec's "two fixed lines" rule for the scramble effect is met, and it keeps line breaks stable on every card.

`capitoli.html` index:
- `var IW = 1100, IH = 760, IROW0 = 190, IROWH = 70;`
- The title is `'ESPLORA IL MONDO'` at `'500 40px "DM Mono"'`, at y=80. Rows use `'400 36px "DM Mono"'`. `idxG.letterSpacing = '4px'`.
- The rows loop over `WORLDS` (not `CLUSTERS`), drawing `w.nome.toUpperCase()`. A row is lit when `(hot && hot.idx === i) || i === idxSopra`, using `w.col`. Unlit rows use `rgba(223,228,238,0.78)`, and the title uses `rgba(240,240,246,0.92)`.
- The plane becomes `new THREE.PlaneGeometry(2.90, 2.00)` (the same aspect as 1100×760). Update the debug `index()` half-size to `1.45, 1.00` and `indexRowPt` to `x = -1.45 + 2.90*fx`, `v = 1.00 - 2.00 * (...)`.
- `pickRiga`: `k < WORLDS.length`, and it returns `k` (a card index). Delete `primoDelCluster`. In the click handler, `if (r >= 0) portaDavanti(r);`.
- Update the long comment above the index: it now lists the 7 cards by name ("ESPLORA IL MONDO"), because Nike asked for it on 2026-09-24. Rewrite the sentence about the five types.

Index placement in `resize()`: move it so the `overlap` check passes. Start with desktop `idxMesh.position.set(-3.35, 0.55, -4.35); rotation.y 0.52; scale 0.95` (left, at mid-height, clear of the u=−1 card that now sits higher). For portrait, start with `position.set(0, 2.35, CAM0.z - 2.55); scale 0.62`. Re-run `overlap`/`index` and shift in 0.1 steps until they pass. On portrait, if the index cannot fit without touching a card, lower its scale down to 0.50, then fade it out (`idxT = 0`) in portrait. Report this in the commit message if it happens.

Captions (CSS):

```css
  #hint{position:fixed;left:50%;bottom:24px;transform:translateX(-50%);z-index:6;
    font-size:12px;letter-spacing:.14em;text-transform:uppercase;
    color:rgba(223,228,238,.84);transition:opacity .4s ease;text-align:center;white-space:nowrap}
  #focus .counter i{color:rgba(190,214,246,.72);font-style:normal}
  #focus .counter .tot{color:rgba(190,214,246,.80)}
  #focus .fsub{... font-size:11px; ... color:rgba(223,228,238,.82)}
  #dots button{... background:rgba(176,204,244,.72); ...}
  #dots button:hover{background:rgba(176,204,244,.95)}
```

In the `@media (max-width:600px)` rule, change `#hint{font-size:9px;...}` to `#hint{font-size:12px;letter-spacing:.06em;bottom:18px;white-space:nowrap}`. The hint's inline opacity is `spokeIn*0.9`: change that factor to `1` in `frame()`, so the effective alpha is .84 (above the .72 floor).
Remove the chromatic glows in the same rules: `.counter .num` `text-shadow:0 0 16px rgba(58,216,255,.4)` and `#dots button.-now` `box-shadow:0 0 12px rgba(58,216,255,.55)` both go (global constraint). Keep `.fname`'s dark `text-shadow` (it is a neutral legibility shadow, not a glow).

Hint text: at ~line 331, `scorri per cambiare mondo · usa l'anteprima`. In the `if (mobile)` block, use `scorri fuori · tocca l'anteprima` (it fits one line at 390px and 12px).

- [ ] **Step 4: Run the checks**

Run: `node scripts/verify-capitoli.cjs index && node scripts/verify-capitoli.cjs index --mobile && node scripts/verify-capitoli.cjs overlap && node scripts/verify-capitoli.cjs overlap --mobile`
Expected: four `PASS`. Open `index.png`: "ESPLORA IL MONDO" and seven titles are legible, with no card over them.

- [ ] **Step 5: Commit**

```bash
git add atelier/js/effetti-deck.js atelier/capitoli.html scripts/verify-capitoli.cjs
git commit -m "feat(atelier): evocative card titles, 'Esplora il mondo' index, readable captions"
```

---

### Task 4: No navigation, direct interaction with the preview

**Files:**
- Modify: `atelier/js/effetti-deck.js:63-74` (delete the `page` loop and its comment), `:208-226` (`place()`), `:244-275` (`wake`/`freeze`)
- Modify: `atelier/capitoli.html`: `#stage-live` CSS (~line 78); `#world` HTML/CSS; `spingi`, `pointerdown/move`, `keydown` (Enter), `pick`/`prefetch`/`enter`/`leave`/`popstate`/`wBack`/`wTalk`/`wNext`/Escape (~lines 1408-1501); the click handler (~line 1503); `zoom` uses in `frame()`; the cursor/hover block (~line 1866); parallax (~line 1421); `CAME_FROM` and `initial` (~lines 1373, 1998-2020); `ROOT`/`worldFromPath`

**Interfaces:**
- Consumes: `deckCtl.awake()`.
- Produces: `STAGE_LIVE` receives pointer events while `.-viva` is set. `inPreview(e)` (in capitoli.html) returns true when `e.target` is inside `#stage-live`.

- [ ] **Step 1: Write the check**

```js
    } else if (check === 'interact'){
      await settle(p, 6);                               // Rivela: reagisce al puntatore
      await p.waitForTimeout(900);
      if (!(await p.evaluate(() => window.__capitoli.awake()))) fail('no effect awake on card 6');
      const url0 = p.url(), s0 = await p.evaluate(() => window.__capitoli.spin());
      const q = (await p.evaluate(() => window.__capitoli.cards()))[6].quad;
      const cx = (q[0][0] + q[2][0]) / 2, cy = (q[0][1] + q[2][1]) / 2;
      await p.mouse.click(cx, cy);
      await p.mouse.move(cx - 120, cy); await p.mouse.down();
      await p.mouse.move(cx + 160, cy + 40, { steps: 12 }); await p.mouse.up();
      await p.waitForTimeout(700);
      const s1 = await p.evaluate(() => window.__capitoli.spin());
      if (p.url() !== url0) fail('navigated to ' + p.url());
      if (Math.abs(s1 - s0) > 0.01) fail(`drag on preview spun the deck ${s0} -> ${s1}`);
      if (!(await p.evaluate(() => window.__capitoli.awake()))) fail('effect froze during interaction');
      await p.keyboard.press('Enter'); await p.waitForTimeout(500);
      if (p.url() !== url0) fail('Enter navigated');
      // la rotellina sopra l'anteprima cambia ancora card
      await p.mouse.move(cx, cy); await p.mouse.wheel(0, 1200); await p.waitForTimeout(1800);
      if (await p.evaluate(() => window.__capitoli.front()) === 6) fail('wheel over preview did not change card');
      // un clic su una card di fianco la porta davanti
      await settle(p, 2);
      const side = (await p.evaluate(() => window.__capitoli.cards()))[3].quad;
      await p.mouse.click((side[0][0] + side[2][0]) / 2, (side[0][1] + side[2][1]) / 2);
      await p.waitForTimeout(1600);
      if (await p.evaluate(() => window.__capitoli.front()) !== 3) fail('click on side card did not bring it front');
```

- [ ] **Step 2: Run it and see it fail**

Run: `node scripts/verify-capitoli.cjs interact`
Expected: `FAIL interact: navigated to .../atelier/capitoli/lithos`.

- [ ] **Step 3: Implement**

1. `effetti-deck.js`: delete the `EFFETTI[j].page` loop (lines 63-74) together with its comment block.
2. `effetti-deck.js` `wake()`: after `stageLive.classList.add('-viva')`, nothing else is needed, because CSS keys off `.-viva`. In `freeze()`, `-viva` is removed first, so the pointer is released before the 280 ms hide.
3. CSS:

```css
  /* L'ANTEPRIMA SI USA (2026-09-24, richiesta di Nike: niente pagine di
     dettaglio, il cliente tocca l'effetto dentro la card). Solo da viva:
     congelata e' un poster, e i clic devono arrivare al mazzo. `touch-action`
     perche' un dito che striscia sull'anteprima muova l'effetto, non la pagina. */
  #stage-live.-viva{opacity:1;pointer-events:auto;touch-action:none}
```

(Merge it with the existing `#stage-live.-viva{opacity:1}`.)
4. `capitoli.html`: add next to `spingi`:

```js
  /* Un gesto che nasce DENTRO l'anteprima viva e' dell'effetto, non del mazzo. */
  function inPreview(e){
    return !!(STAGE_LIVE && e && e.target && e.target.nodeType === 1 && STAGE_LIVE.contains(e.target));
  }
```

`STAGE_LIVE` is declared later (~line 1675). Move its `var STAGE_LIVE = document.getElementById('stage-live');` line up next to `HELIX_EL`'s neighbours, before the input handlers, or declare it at the top of the IIFE. Check with `grep -n "STAGE_LIVE" atelier/capitoli.html`.
5. `pointerdown`: `if (e.button || inPreview(e)) return;`. Drop the `openW` guard, because `openW` goes away.
6. `click` handler becomes:

```js
  window.addEventListener('click', function(e){
    if (stage === 'hero'){ entra(); return; }
    if (stage === 'arrivo'){ skip(); return; }
    if (inPreview(e)) return;
    if (dragMoved > 8){ dragMoved = 0; return; }
    var w = pick();
    if (w){ if (w !== hot) portaDavanti(w.idx); return; }
    var r = pickRiga();
    if (r >= 0) portaDavanti(r);
  });
```

7. `keydown`: delete the `Enter` branch. Delete the Escape listener.
8. Delete `prefetch`, `prefetched`, `enter`, `leave`, `popstate`, `wBack`/`wTalk`/`wNext`, `ROOT`, `worldFromPath`, `CAME_FROM` and its block at the end, `initial` and its block, the `#world` HTML and CSS, `playOn` calls, and `zoom`/`zoomT`. For `zoom`, replace `(1-zoom)` with `1` and remove the `if (openW){...}` camera block. Remove every `openW` reference: guards become unconditional. `grep -n "openW\|zoom\|prefetch\|enter(\|leave(\|CAME_FROM\|worldFromPath\|playOn\|#world\|wKick" atelier/capitoli.html` must return nothing, except the unrelated `entra(`.
   - Delete `playOn`, the hidden `video` element, `vtex`, `videoOn` (declared ~line 1073), the `['pointerdown','keydown','touchstart']` play hook, AND the line `if (video.videoWidth && videoOn) videoOn.uni.uVidAsp.value = ...` in `frame()` (~line 1939). Leaving it makes `frame()` throw every frame. Do NOT touch the shader uniform `tVideo`: it carries each card's poster texture.
   - Acceptance: `grep -nE "\bvideo\.|videoOn|vtex|playOn" atelier/capitoli.html` returns nothing.
9. Hover block in `frame()`: keep `overCard`/`pickRiga` for highlighting, but the cursor is `pointer` only for a side card or an index row: `document.body.style.cursor = ((overCard && overCard !== hot) || r >= 0) ? 'pointer' : '';`.
10. Parallax freeze: in the parallax `pointermove` listener, `if (inPreview(e)) return;` before updating `tmx/tmy`. `ptr` must still update for picking, so set `ptr` first and then return.
11. Update the `#hint` comment if it mentions "clicca quello davanti".

- [ ] **Step 4: Run the checks**

Run: `node scripts/verify-capitoli.cjs interact && node scripts/verify-capitoli.cjs interact --mobile && node scripts/verify-capitoli.cjs helix && node scripts/verify-capitoli.cjs overlap`
Expected: four `PASS`. On mobile, `p.mouse` still emulates the pointer, which is acceptable for this check.

- [ ] **Step 5: Commit**

```bash
git add atelier/js/effetti-deck.js atelier/capitoli.html scripts/verify-capitoli.cjs
git commit -m "feat(atelier): cards no longer open detail pages; the live preview takes the pointer"
```

---

### Task 5: Landing copy layer and the scramble headline

**Files:**
- Modify: `atelier/capitoli.html`: new `#lp` markup after `#stage-live`; CSS next to `#stage-live`; `<script src="vendor/ScrambleTextPlugin.min.js">` before `js/core.js`; per-frame positioning in `frame()` next to `bucoElica()`; `aggiornaFocus` hook

**Interfaces:**
- Consumes: `record.lp`, `record.chiaro`, `record.scramble` (Task 3), and `deckCtl.rect(mesh)` → `{x,y,w,h}`.
- Produces: `#lp` fixed layer with `.lp-k`, `.lp-h` (two `<span class="lp-l">`), `.lp-s`, `.lp-b`. `lpMostra(w)` fills and positions it.

- [ ] **Step 1: Write the check**

```js
    } else if (check === 'copy'){
      for (const i of [0, 2, 4]){
        await settle(p, i); await p.waitForTimeout(1600);   // lo scramble dura ~1.3s
        const r = await p.evaluate(i => {
          const lp = document.getElementById('lp'), q = window.__capitoli.cards()[i].quad;
          const b = lp.getBoundingClientRect(), h = lp.querySelector('.lp-h');
          const minx = Math.min(...q.map(v => v[0])), maxx = Math.max(...q.map(v => v[0]));
          const miny = Math.min(...q.map(v => v[1])), maxy = Math.max(...q.map(v => v[1]));
          const kids = [...lp.querySelectorAll('.lp-k,.lp-l,.lp-s,.lp-b')].filter(e => e.offsetParent && getComputedStyle(e).display !== 'none').map(e => e.getBoundingClientRect());
          return { op: getComputedStyle(lp).opacity, text: h.textContent, b: { l: b.left, t: b.top, r: b.right, bt: b.bottom },
                   card: { minx, maxx, miny, maxy }, kids: kids.map(k => ({ l: k.left, t: k.top, r: k.right, b: k.bottom })) };
        }, i);
        const want = await p.evaluate(i => window.EFFETTI[i].lp.h.join(''), i);
        if (parseFloat(r.op) < 0.9) fail(`card ${i}: copy not visible (opacity ${r.op})`);
        if (r.text.replace(/\s/g, '') !== want.replace(/\s/g, '')) fail(`card ${i}: headline "${r.text}" != "${want}"`);
        const pad = (r.card.maxx - r.card.minx) * 0.05;
        // la copy resta nella meta' sinistra (o nella fascia bassa su telefono): il centro e' dell'effetto
        const narrow = (r.card.maxx - r.card.minx) < 420;
        if (!narrow) for (const k of r.kids) if (k.r > r.card.minx + (r.card.maxx - r.card.minx) * 0.52) fail(`card ${i}: copy reaches the centre`);
        if (narrow) for (const k of r.kids) if (k.t < r.card.miny + (r.card.maxy - r.card.miny) * 0.45) fail(`card ${i}: mobile copy above the bottom band`);
        for (const k of r.kids){
          if (k.l < r.card.minx + pad || k.r > r.card.maxx - pad || k.t < r.card.miny + pad || k.b > r.card.maxy - pad)
            fail(`card ${i}: copy touches the card edge`);
        }
        for (let a = 0; a < r.kids.length; a++) for (let c = a + 1; c < r.kids.length; c++){
          const A = r.kids[a], B = r.kids[c];
          if (A.l < B.r && B.l < A.r && A.t < B.b && B.t < A.b) fail(`card ${i}: copy lines overlap`);
        }
        await p.screenshot({ path: OUT + `/copy-${i}${mobile ? '-m' : ''}${reduce ? '-r' : ''}.png` });
      }
```

- [ ] **Step 2: Run it and see it fail**

Run: `node scripts/verify-capitoli.cjs copy`
Expected: `FAIL copy: ... Cannot read properties of null` (no `#lp`), reported as a failure.

- [ ] **Step 3: Implement**

Markup, right after `<div id="stage-live" ...></div>` (find it with `grep -n 'id="stage-live"' atelier/capitoli.html`):

```html
<div id="lp" aria-live="polite">
  <i class="lp-k"></i>
  <h2 class="lp-h"><span class="lp-l"></span><span class="lp-l"></span></h2>
  <p class="lp-s"></p>
  <span class="lp-b" role="presentation"></span>
</div>
```

CSS (the headline face is `'Space Grotesk'`, already loaded for `.fname`; kicker/button in `'DM Mono'`):

```css
  /* LA PAGINA DENTRO LA CARD (2026-09-24, richiesta di Nike: «a tutte aggiungi
     scritte come se fossero landing page»). Livello suo, FUORI da #stage-live:
     quello nasconde i figli che non sono l'effetto sveglio ed e' `hidden`
     quando nessuno e' sveglio — qui la copy deve esserci anche sul poster e
     con moto ridotto. Non prende il puntatore: sotto c'e' l'anteprima da usare. */
  #lp{position:fixed;left:0;top:0;width:0;height:0;z-index:4;pointer-events:none;
    display:flex;flex-direction:column;justify-content:center;gap:.9em;
    box-sizing:border-box;padding:0 6% 0 6%;opacity:0;transition:opacity .35s ease;
    border-radius:var(--raggio,18px);overflow:hidden;
    font-size:var(--lpfs,16px);color:#f0f0f6;
    background:linear-gradient(90deg,rgba(4,5,10,.72) 0%,rgba(4,5,10,.46) 34%,rgba(4,5,10,0) 52%)}
  #lp.-on{opacity:1}
  #lp > *{max-width:40%;margin:0}
  /* Il titolo va a capo DENTRO la colonna (40% della card): due righe
     logiche, ognuna libera di spezzarsi. Niente nowrap — a 1440 la riga piu'
     lunga uscirebbe dalla sfumatura fino al centro dell'effetto. */
  #lp .lp-k{font:500 max(11px,.72em)/1.2 'DM Mono',ui-monospace,monospace;font-style:normal;
    letter-spacing:.2em;text-transform:uppercase;color:var(--lpc)}
  #lp .lp-h{font:600 1.6em/1.1 'Space Grotesk',system-ui,sans-serif;letter-spacing:-.01em}
  #lp .lp-l{display:block}
  #lp .lp-s{font:400 max(12px,.86em)/1.45 'Space Grotesk',system-ui,sans-serif;color:rgba(240,240,246,.86)}
  #lp .lp-b{align-self:flex-start;font:500 max(11px,.74em)/1 'DM Mono',ui-monospace,monospace;
    letter-spacing:.16em;text-transform:uppercase;padding:.9em 1.3em;
    border:1px solid var(--lpc);color:#f0f0f6}
  #lp.-chiaro{color:#10131a;
    background:linear-gradient(90deg,rgba(255,255,255,.0) 0%,rgba(255,255,255,0) 100%)}
  #lp.-chiaro .lp-s{color:rgba(16,19,26,.78)}
  /* Su bianco il colore della card (azzurro chiaro) non si legge (~1.6:1):
     kicker e bottone passano a un blu profondo della stessa famiglia. */
  #lp.-chiaro{--lpc:#1d4a6b} #lp.-chiaro .lp-b{color:#10131a}
  /* Card stretta (telefono): una fascia in basso, solo titolo e bottone. */
  #lp.-stretta{justify-content:flex-end;padding:0 6% 6% 6%;gap:.7em;
    background:linear-gradient(0deg,rgba(4,5,10,.78) 0%,rgba(4,5,10,.40) 40%,rgba(4,5,10,0) 62%)}
  #lp.-stretta > *{max-width:100%}
  #lp.-stretta .lp-k,#lp.-stretta .lp-s{display:none}
  #lp.-stretta .lp-h{font-size:1.25em}
  #lp.-stretta .lp-l{white-space:normal}
```

Scramble plugin: add `<script src="vendor/ScrambleTextPlugin.min.js?v=20260824a"></script>` right before `js/core.js`. Update the loader comment: ScrambleTextPlugin is now loaded, for the "Contatto" headline.

JS, near the other DOM refs after `aggiornaFocus`:

```js
  /* LA COPY DELLA CARD DAVANTI — vedi #lp nel CSS. */
  var lpEl = document.getElementById('lp');
  var lpK = lpEl.querySelector('.lp-k'), lpL = lpEl.querySelectorAll('.lp-l'),
      lpS = lpEl.querySelector('.lp-s'), lpB = lpEl.querySelector('.lp-b');
  var lpDi = null, lpTw = null;
  function lpRiempi(w){
    lpDi = w;
    lpK.textContent = w.lp.kicker;
    lpL[0].textContent = w.lp.h[0]; lpL[1].textContent = w.lp.h[1] || '';
    lpS.textContent = w.lp.sub; lpB.textContent = w.lp.cta;
    lpEl.classList.toggle('-chiaro', !!w.chiaro);
    if (w.chiaro) lpEl.style.removeProperty('--lpc');
    else lpEl.style.setProperty('--lpc', 'rgb(' + w.col.map(function(v){ return Math.round(v*255); }).join(',') + ')');
    if (lpTw){ lpTw.kill(); lpTw = null; }
  }
  /* «Contatto»: il titolo si decifra a ogni arrivo, riga per riga — due righe
     fisse, cosi' i caratteri a caso non rimandano a capo il testo. Stessi
     parametri di js/headings.js. */
  function lpDecifra(){
    if (!lpDi || !lpDi.scramble || !WC.motionOk || !window.ScrambleTextPlugin) return;
    /* Un tween lasciato a meta' (la card e' scivolata via e tornata) avrebbe
       lasciato lettere a caso: '{original}' le prenderebbe per buone. Si
       ferma e si rimette il testo vero PRIMA di ripartire; l'altezza resta
       bloccata mentre decifra, cosi' un a-capo diverso non fa saltare la copy. */
    if (lpTw){ lpTw.kill(); lpTw = null; }
    lpL[0].textContent = lpDi.lp.h[0]; lpL[1].textContent = lpDi.lp.h[1] || '';
    var hEl = lpEl.querySelector('.lp-h');
    hEl.style.minHeight = hEl.offsetHeight + 'px';
    lpTw = gsap.to(lpL, { onComplete: function(){ hEl.style.minHeight = ''; }, duration: 1.3, ease: 'none', stagger: 0.22,
      scrambleText: { text: '{original}', chars: 'upperAndLowerCase', speed: 0.5, revealDelay: 0.15 } });
  }
  var lpFermo = false;
  function lpFrame(){
    var w = hot;
    var ok = DECK_ON && stage === 'mappa' && w && w.mesh && w.lp;
    var frac = Math.abs(spin - Math.round(spin));
    var fermo = ok && frac < 0.15 && !dragging;
    if (ok && lpDi !== w) lpRiempi(w);
    if (fermo){
      var r = deckCtl ? deckCtl.rect(w.mesh) : null;
      if (r){
        lpEl.style.left = r.x + 'px'; lpEl.style.top = r.y + 'px';
        lpEl.style.width = r.w + 'px'; lpEl.style.height = r.h + 'px';
        lpEl.style.setProperty('--raggio', Math.round(r.w * 0.035) + 'px');
        lpEl.style.setProperty('--lpfs', Math.max(12, Math.min(22, r.w / 44)).toFixed(1) + 'px');
        lpEl.classList.toggle('-stretta', r.w < 420);
      }
    }
    lpEl.classList.toggle('-on', !!fermo);
    if (fermo && !lpFermo) lpDecifra();
    lpFermo = !!fermo;
  }
```

Call `lpFrame();` in `frame()` right after the `if (deckCtl){...}` block. `deckCtl` exists only when `DECK_ON && STAGE_LIVE && EffettiController`. If `deckCtl` is null, `lpFrame` hides the layer (r is null, so `-on` depends only on `fermo`). Guard it: add `&& deckCtl` to `ok`.

Orologio's `-chiaro` background is transparent on purpose: the white canvas is the scrim. Task 7 moves the watch to the right half.

Reduced motion: `lpDecifra` returns early, and `lpFrame` still shows the copy because `spin` snaps to integers.

- [ ] **Step 4: Run the checks**

Run: `node scripts/verify-capitoli.cjs copy && node scripts/verify-capitoli.cjs copy --mobile && node scripts/verify-capitoli.cjs copy --reduce && node scripts/verify-capitoli.cjs interact`
Expected: four `PASS`. Open `copy-0.png`, `copy-4.png`, `copy-0-m.png` and `copy-0-r.png`: the text is legible, sits left (a bottom band on mobile), and does not cover the centre of the effect. On `copy-4.png` the headline is fully decoded.

- [ ] **Step 5: Commit**

```bash
git add atelier/capitoli.html scripts/verify-capitoli.cjs
git commit -m "feat(atelier): landing-page copy on the front card, scramble headline on Contatto"
```

---

### Task 6: Gravità (sneaker) plays

**Files:**
- Modify: `atelier/js/sneaker.js` (append a `WC.effects.sneaker` handle after the `WC.register` block, which stays untouched)
- Modify: `atelier/capitoli.html` (add `<script src="js/sneaker.js?v=20260924a"></script>` after `js/warp.js`)

**Interfaces:**
- Produces: `WC.effects.sneaker = { start(container), stop(), resize() }`, following the same pattern as `WC.effects.lithos`.

- [ ] **Step 1: Add the `alive` check to the harness**

```js
    } else if (check === 'alive'){
      const ids = arg !== undefined ? [Number(arg)] : [0, 1, 2, 3, 4, 5, 6];
      for (const i of ids){
        await settle(p, i); await p.waitForTimeout(1200);
        const q = (await p.evaluate(i => window.__capitoli.cards()[i].quad, i));
        const x = Math.max(0, Math.round(Math.min(...q.map(v => v[0])) + 8)), y = Math.max(0, Math.round(Math.min(...q.map(v => v[1])) + 8));
        const w = Math.round(Math.max(...q.map(v => v[0])) - x - 16), h = Math.round(Math.max(...q.map(v => v[1])) - y - 16);
        const clip = { x, y, width: w, height: h };
        const awake = await p.evaluate(() => window.__capitoli.awake());
        const a = await p.screenshot({ clip, path: OUT + `/alive-${i}-a.png` });
        await p.waitForTimeout(Number(process.env.ALIVE_WAIT || 2000));
        const b2 = await p.screenshot({ clip, path: OUT + `/alive-${i}-b.png` });
        const { data: A, info } = await sharp(a).raw().toBuffer({ resolveWithObject: true });
        const B = await sharp(b2).raw().toBuffer();
        const ch = info.channels;                       // i PNG di Playwright arrivano a 3 canali
        let d = 0; for (let k = 0; k < A.length; k += ch) if (Math.abs(A[k] - B[k]) + Math.abs(A[k+1] - B[k+1]) + Math.abs(A[k+2] - B[k+2]) > 30) d++;
        const frac = d / (A.length / ch);
        if (!awake) fail(`card ${i}: no effect awake`);
        if (frac < 0.02) fail(`card ${i}: not moving on its own (changed ${(frac*100).toFixed(2)}%)`);
      }
    } else if (check === 'ritorno'){
      // Review Focus 5: nella STESSA pagina si torna su card gia' svegliate
      for (const i of [1, 3, 1, 5, 3, 5]){
        await settle(p, i); await p.waitForTimeout(1200);
        if (await p.evaluate(() => window.__capitoli.awake()) !== (await p.evaluate(i => window.EFFETTI[i].modulo, i)))
          fail(`card ${i}: not awake on return`);
        const probe = await p.evaluate(() => window.__warpProbe ? window.__warpProbe() : null);
        if (i === 5 && probe && probe.morph < 0.99) fail('warp replayed the tunnel on return');
        const t0 = await p.evaluate(() => { const v = document.querySelector('#stage-live video'); return v ? v.currentTime : null; });
        await p.waitForTimeout(800);
        const t1 = await p.evaluate(() => { const v = document.querySelector('#stage-live video'); return v ? v.currentTime : null; });
        if (i === 1 && !(t1 > t0)) fail('sneaker video not playing on return');
      }
```

- [ ] **Step 2: Run it and see it fail**

Run: `node scripts/verify-capitoli.cjs alive 1`
Expected: `FAIL alive: card 1: no effect awake`.

- [ ] **Step 3: Implement the handle**

```js
/* ── MONTAGGIO ESTERNO (capitoli.html, «Gravità») ──────────────────────────
 * Nella pagina degli effetti la sezione non c'e' e nessuno ScrollTrigger la
 * guarda: senza questo handle la card restava per sempre sul poster. Stesso
 * schema degli altri (vedi js/lithos.js): l'host si crea una volta, a ogni
 * `start()` torna in coda ai figli del contenitore, `stop()` mette solo in
 * pausa. `muted`/`playsInline` PRIMA della sorgente, se no Safari rifiuta
 * l'autoplay; webm per primo perche' Chromium headless non decodifica H.264. */
WC.effects = WC.effects || {};
WC.effects.sneaker = (function(){
  var host = null, vid = null;
  function play(){ var p = vid.play(); if (p && p.catch) p.catch(function(){}); }
  return {
    start: function(container){
      if (!host){
        host = document.createElement('div');
        host.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;overflow:hidden;background:#05060a;';
        vid = document.createElement('video');
        vid.muted = true; vid.loop = true; vid.playsInline = true;
        vid.setAttribute('muted', ''); vid.setAttribute('playsinline', '');
        vid.preload = 'auto'; vid.poster = 'assets/sneaker-poster.webp';
        vid.setAttribute('aria-hidden', 'true');
        vid.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;object-fit:cover;';
        var s1 = document.createElement('source'); s1.type = 'video/webm'; s1.src = 'assets/sneaker.webm';
        var s2 = document.createElement('source'); s2.type = 'video/mp4';  s2.src = 'assets/sneaker.mp4';
        vid.appendChild(s1); vid.appendChild(s2);
        host.appendChild(vid);
      }
      container.appendChild(host);
      if (!WC.motionOk) return;
      play();
    },
    stop:   function(){ if (vid && !vid.paused) vid.pause(); },
    resize: function(){}
  };
})();
```

In `effetti-deck.js`, the sneaker record already says `render:'dom'` (Task 3). Leave the controller alone.

- [ ] **Step 4: Run the checks**

Run: `node scripts/verify-capitoli.cjs alive 1 && node scripts/verify-capitoli.cjs alive 1 --mobile`
Expected: `PASS alive` twice. Open `alive-1-a.png`/`-b.png`: the shoe frames differ.
Also run the legacy guard: `curl -s localhost:8803/atelier/capitoli-legacy.html | grep -c wcSneakerVideo`. Expected: 1, meaning legacy still has its own markup and the handle does not touch it.

- [ ] **Step 5: Commit**

```bash
git add atelier/js/sneaker.js atelier/capitoli.html scripts/verify-capitoli.cjs
git commit -m "fix(atelier): Gravità card plays the sneaker video (external handle was missing)"
```

---

### Task 7: Anatomia (orologio) fills the card

**Files:**
- Modify: `atelier/js/orologio.js`: `draw()` (~line 131) and the external branch (~line 170)

**Interfaces:**
- Produces: in the external branch only, `draw()` paints the frame's own background colour over the whole canvas, then draws the watch contain-fit and centred in the right half.

- [ ] **Step 1: Write the check**

Add a `format` branch:

```js
    } else if (check === 'format'){
      await settle(p, 2); await p.waitForTimeout(1500);
      const q = (await p.evaluate(() => window.__capitoli.cards()[2].quad));
      const x = Math.round(Math.min(...q.map(v => v[0]))) + 10, y = Math.round(Math.min(...q.map(v => v[1]))) + 10;
      const w = Math.round(Math.max(...q.map(v => v[0]))) - x - 10, h = Math.round(Math.max(...q.map(v => v[1]))) - y - 10;
      const buf = await p.screenshot({ clip: { x, y, width: w, height: h }, path: OUT + `/format${mobile ? '-m' : ''}.png` });
      const { data, info } = await sharp(buf).raw().toBuffer({ resolveWithObject: true });
      // le due strisce ai lati (4% della larghezza) devono essere bianche piene
      let bad = 0, n = 0;
      for (const x0 of [2, info.width - 3]) for (let yy = 0; yy < info.height; yy += 3){
        const o = (yy * info.width + x0) * info.channels; n++;
        if (data[o] < 225 || data[o + 1] < 225 || data[o + 2] < 225) bad++;
      }
      if (bad / n > 0.1) fail(`side bands are not the frame background (${bad}/${n} dark samples)`);
```

- [ ] **Step 2: Run it and see it fail**

Run: `node scripts/verify-capitoli.cjs format`
Expected: `FAIL format: side bands are not the frame background`.

- [ ] **Step 3: Implement**

In the module, the external branch sets a flag before returning its handle: `pieno = true;`. Declare `var pieno = false, fondo = null;` near `shown/want`. In `draw()`:

```js
    if (pieno){
      /* NELLA CARD (esterno): niente bande trasparenti ai lati — da li'
         traspariva il poster sfocato. Si riempie tutto col bianco del
         fotogramma stesso (letto una volta dal primo pixel) e l'orologio va
         nella meta' destra: la sinistra e' della copy (#lp in capitoli.html). */
      if (!fondo){
        try {
          var c1 = document.createElement('canvas'); c1.width = c1.height = 1;
          var g1 = c1.getContext('2d'); g1.drawImage(im, 0, 0, 1, 1, 0, 0, 1, 1);
          var px = g1.getImageData(0, 0, 1, 1).data;
          fondo = 'rgb(' + px[0] + ',' + px[1] + ',' + px[2] + ')';
        } catch(e){ fondo = '#ffffff'; }
      }
      ctx2d.fillStyle = fondo; ctx2d.fillRect(0, 0, W, H);
      /* Stretta = la stessa soglia di #lp.-stretta, in pixel CSS (W/H qui sono
         pixel del canvas, moltiplicati per il dpr): la copy va in una fascia
         in basso, quindi l'orologio sale e si rimpicciolisce sopra di lei. */
      var stretta = (canvas.clientWidth || W) < 420;
      var s2, w2, h2, x2, y2;
      if (stretta){
        s2 = Math.min(W * 0.9 / im.naturalWidth, H * 0.62 / im.naturalHeight);
        w2 = im.naturalWidth * s2; h2 = im.naturalHeight * s2;
        x2 = (W - w2) / 2; y2 = H * 0.04;
      } else {
        s2 = Math.min(W * 0.5 / im.naturalWidth, H * 0.94 / im.naturalHeight);
        w2 = im.naturalWidth * s2; h2 = im.naturalHeight * s2;
        x2 = W * 0.5 + (W * 0.5 - w2) / 2; y2 = (H - h2) / 2;
      }
      ctx2d.drawImage(im, x2, y2, w2, h2);
      shown = want;
      return;
    }
```

Place it after `if (!im) return;` and before `clearRect`, so the legacy path below stays byte-for-byte the same. Set `pieno = true;` as the first line inside `if (external){`.

The narrow test uses CSS px (`canvas.clientWidth`), not canvas pixels: on a real phone the dpr is 2 or more, so `W < 420` never triggers. Check that the orologio canvas variable is called `canvas` in `mountOrologio` (`grep -n "canvas" atelier/js/orologio.js | head`); use its real name.

- [ ] **Step 4: Run the checks**

Run: `node scripts/verify-capitoli.cjs format && node scripts/verify-capitoli.cjs format --mobile && node scripts/verify-capitoli.cjs alive 2 && node scripts/verify-capitoli.cjs copy`
Expected: four `PASS`. Open `format.png`: white fills the whole card, the watch sits in the right half, and the dark copy on the left is legible.

- [ ] **Step 5: Commit**

```bash
git add atelier/js/orologio.js scripts/verify-capitoli.cjs
git commit -m "fix(atelier): Anatomia fills the card on the frame's own white, watch on the right"
```

---

### Task 8: Nebulosa (vesper) runs on its own

**Files:**
- Modify: `atelier/js/vesper.js`: `INTRO_MS` usage (~line 237), external branch (~lines 1298-1323), brain load callback (~line 981)

**Interfaces:**
- Produces: inside `mountVesper`, in the external branch only, a looping GSAP driver `extTl` that writes `progressTarget` on the 0..4 clock, plus `introMs` that is 900 in external and `INTRO_MS` in legacy.

- [ ] **Step 1: Check that it fails today**

Run: `node scripts/verify-capitoli.cjs alive 3`
Expected: `FAIL alive: card 3: not moving on its own` (the orb barely changes in 2 s with no mouse). If it happens to pass on spin alone, the visual criterion in step 4 still applies.

- [ ] **Step 2: Implement**

Intro: change `stepIntro` to use `var introMs = INTRO_MS;` (declared next to `INTRO_MS`) and `clamp01((performance.now() - introStart) / introMs)`. In the external branch, set `introMs = 500;` and `INTRO_DOLLY = 3;` before returning. `INTRO_DOLLY` is a plain `var` (vesper.js:166), read at :255 for the initial camera and at :1124 in the frame. Line 255 has already run at mount time, so after changing it in the external branch also re-place the camera. Read :250-260 and repeat that one camera assignment right after `INTRO_DOLLY = 3;`.

Brain gate: declare `var brainPronto = false;` near `brainGeo`. At line ~981, right after `brainGeo = buildBrainGeometry(...)`, set `brainPronto = true;`.

External driver, inside `if (external){` before `return`:

```js
    /* «Nebulosa» — IL GIRO DA SOLO (2026-09-24, richiesta di Nike: «non si
     * vede l'animazione, falla in automatico»). In legacy il clock 0..4 lo
     * dava lo scroll del pin; qui un tween proprio lo porta sfera → galassia
     * → cervello e ritorno (yoyo, niente salto). Finche' il cervello non e'
     * arrivato dalla rete il giro si ferma alla galassia (2.4), se no la fase
     * del cervello sarebbe vuota. */
    var driver = { v: 0 };
    var extTl = gsap.timeline({ repeat: -1, yoyo: true, paused: true });
    /* Il tetto si decide solo quando il giro e' sulla sfera (v≈0): cambiarlo
       a meta' farebbe saltare la scena da galassia a cervello di colpo. */
    var tetto = 2.4;
    extTl.to(driver, { v: 1, duration: 9, ease: 'sine.inOut', onUpdate: function(){
      if (driver.v < 0.02) tetto = brainPronto ? 3.6 : 2.4;
      progressTarget = driver.v * tetto;
    }}, 0);
```

Change the returned `start`/`stop`: `start: function(){ wantRun = true; startIntro(); resize(); start(); extTl.play(); }` and `stop: function(){ wantRun = false; extTl.pause(); stop(); }`. Add `extTl.kill();` to the external `cleanups.push` function.

The 3.6 ceiling stops before the outro and blow-apart phases (clock 4). A full orb → galaxy → brain → galaxy → orb cycle takes 18 s.

Update the header comment of the external branch: `progressTarget` is now driven by a tween, not left at 0.

- [ ] **Step 3: Run the check again**

Run: `node scripts/verify-capitoli.cjs alive 3 && node scripts/verify-capitoli.cjs alive 3 --mobile`
Expected: `PASS alive` twice.

- [ ] **Step 4: Visual check**

Add a one-off capture: `node -e` is not needed. Run `alive 3`, then look at `alive-3-a.png` (orb visible within 1.2 s of settling, not an empty frame). Run once more with a longer wait by temporarily passing `ALIVE_WAIT=9000 node scripts/verify-capitoli.cjs alive 3`. For that, make the harness read `process.env.ALIVE_WAIT || 2000` as the gap between the two shots. `alive-3-b.png` must show the galaxy.

- [ ] **Step 5: Commit**

```bash
git add atelier/js/vesper.js scripts/verify-capitoli.cjs
git commit -m "feat(atelier): Nebulosa cycles orb, galaxy and brain on its own inside the card"
```

---

### Task 9: Genesi (warp) without the tunnel, faster

**Files:**
- Modify: `atelier/js/warp.js`: renderer clear (~line 197), external branch (~lines 655-690)

**Interfaces:**
- Produces: in external only, the driver range is `[CONFIG.phaseMorphOut, 1]`, yoyo, 12 s per way, with `scroll = scrollTarget = CONFIG.phaseMorphOut` on the first start, and an opaque clear colour.

- [ ] **Step 1: Write the check**

Add a `tunnel` branch:

```js
    } else if (check === 'tunnel'){
      await settle(p, 5);
      const samples = [];
      for (let k = 0; k < 8; k++){
        await p.waitForTimeout(1500);
        samples.push(await p.evaluate(() => window.__warpProbe ? window.__warpProbe() : null));
      }
      if (samples.some(s => s === null)) fail('no warp probe');
      else if (samples.some(s => s.morph < 0.99)) fail('tunnel phase visible: ' + samples.map(s => s.morph.toFixed(2)).join(','));
      await p.screenshot({ path: OUT + '/tunnel.png' });
```

In `warp.js`'s external branch, expose a probe: `window.__warpProbe = function(){ return { morph: uMorph.value, scroll: scroll }; };`. It is a read-only debug hook; remove it in the external `dispose`.

- [ ] **Step 2: Run it and see it fail**

Run: `node scripts/verify-capitoli.cjs tunnel`
Expected: `FAIL tunnel: no warp probe`, then after adding the probe, `tunnel phase visible: 0.00,...`.

- [ ] **Step 3: Implement**

External branch:

```js
    /* «Genesi» — NIENTE TUNNEL (2026-09-24, richiesta di Nike). Le scie del
     * volo sono le STESSE particelle che poi diventano l'elica e le forme:
     * spegnerle spegnerebbe tutto. Si parte invece da dove il riordino e'
     * finito (`phaseMorphOut`: sono gia' elica) e si va avanti e indietro fino
     * alla fine, in 12 s invece di 26 — «velocizza». Allo start la corsa
     * salta li' senza smorzamento, se no il primo fotogramma rifarebbe il volo. */
    var lo = CONFIG.phaseMorphOut;
    var driver = { v: lo };
    var extTl = gsap.timeline({ repeat: -1, yoyo: true, paused: true });
    extTl.to(driver, {
      v: 1, duration: 12, ease: 'sine.inOut',
      onUpdate: function(){ scrollTarget = driver.v; }
    }, 0);
    var primoGiro = true;
```

and in `start`: `start: function(){ wantRun = true; if (primoGiro){ scroll = scrollTarget = lo; primoGiro = false; } resize(); extTl.play(); start(); }`.

Replace the existing 26 s `repeat:-1` timeline with this block, and delete the old comment about "senza yoyo".

Opaque background: find `renderer.setClearColor(` in `warp.js` (~line 197, alpha 0). Make the alpha conditional: `renderer.setClearColor(0x05040c, external ? 1 : 0);`. It must run after `external` is known. If `setClearColor` runs before `var external`, move the call or re-issue it inside the external branch: `renderer.setClearColor(0x05040c, 1);`. The colour matches the violet-black legacy background gradient base (`css/sections.css:106-114`). Read that gradient and take its darkest stop.

`uFade`: the fade-in starts at 0 at every mount, and that stays.

- [ ] **Step 4: Run the checks**

Run: `node scripts/verify-capitoli.cjs tunnel && node scripts/verify-capitoli.cjs alive 5 && node scripts/verify-capitoli.cjs alive 5 --mobile`
Expected: three `PASS`. Open `tunnel.png`: a helix or particle form on an opaque dark background, with no streak ring.

- [ ] **Step 5: Commit**

```bash
git add atelier/js/warp.js scripts/verify-capitoli.cjs
git commit -m "fix(atelier): Genesi skips the tunnel flight and loops helix-to-forms in 12s"
```

---

### Task 10: Vapore (altitude) stirs on its own

**Files:**
- Modify: `atelier/js/altitude.js`: pointer block (~lines 548-582) and the loop where `pointer.moved` is consumed (~line 786), external branch (~line 907)

**Interfaces:**
- Produces: `fantasma` (external only). When the real pointer has not moved for 1500 ms, a phantom pointer on a Lissajous path calls `movePointer` in canvas-relative coordinates every frame.

- [ ] **Step 1: Check the current behaviour**

The starry video is composited inside the fluid's WebGL canvas, so a pixel diff cannot tell the fluid apart from the video. Test the phantom directly instead. Add a `vapore` branch to the harness:

```js
    } else if (check === 'vapore'){
      await settle(p, 0); await p.waitForTimeout(3500);   // mouse fermo > 1,5 s
      const a = await p.evaluate(() => window.__altProbe ? window.__altProbe() : null);
      await p.waitForTimeout(1500);
      const b = await p.evaluate(() => window.__altProbe ? window.__altProbe() : null);
      if (!a) fail('no altitude probe');
      else if (!(b.fantasma > a.fantasma)) fail('phantom pointer is not stirring: ' + a.fantasma + ' -> ' + b.fantasma);
```

Run: `node scripts/verify-capitoli.cjs vapore`
Expected: `FAIL vapore: no altitude probe`.

- [ ] **Step 2: Implement**

Near `movePointer`, add `var lastRealMove = 0, fantasma = false;` and in `onMouseMove`/`onTouchMove` set `lastRealMove = performance.now();` before calling `movePointer`.

Add a phantom step, called once per frame at the start of the update where `pointer.moved` is read (~line 786, inside the function that contains `if (pointer.moved) { lastMoveAt = now; ...`). Check the surrounding function name with `sed -n 770,800p atelier/js/altitude.js`, then insert at its top:

```js
    /* IL PUNTATORE FANTASMA (solo nella card, 2026-09-24): se la mano e' ferma
     * da 1,5 s una traccia invisibile gira su una Lissajous lenta e continua a
     * mescolare il fumo — «Vapore» non resta mai immobile ad aspettare il mouse.
     * Appena il mouse vero si muove, il fantasma tace. */
    if (fantasma && performance.now() - lastRealMove > 1500){
      var r0 = canvas.getBoundingClientRect(), tt = performance.now() / 1000;
      movePointer(r0.left + r0.width  * (0.5 + 0.30 * Math.sin(tt * 0.61)),
                  r0.top  + r0.height * (0.5 + 0.24 * Math.sin(tt * 0.83 + 1.3)));
    }
```

Count the phantom's moves: `var passiFantasma = 0;`, and `passiFantasma++` inside the `if`. In the external branch, set `fantasma = WC.motionOk !== false;` and `window.__altProbe = function(){ return { fantasma: passiFantasma }; };` before returning, and delete `window.__altProbe` in the external `dispose`. Legacy never sets either.

- [ ] **Step 3: Run the checks**

Run: `node scripts/verify-capitoli.cjs vapore && node scripts/verify-capitoli.cjs alive 0 && node scripts/verify-capitoli.cjs interact`
Expected: three `PASS`. Open `alive-0-b.png`: coloured smoke trails without any mouse input.

- [ ] **Step 4: Commit**

```bash
git add atelier/js/altitude.js scripts/verify-capitoli.cjs
git commit -m "feat(atelier): Vapore stirs itself with a phantom pointer when the mouse rests"
```

---

### Task 11: Rivela (lithos): automatic light, the mouse takes over

**Files:**
- Modify: `atelier/js/lithos.js`: `frame()` (~line 63), `onMove` (~line 93), external `start`/`stop`/`dispose` (~lines 120-140)

**Interfaces:**
- Produces: `ibrido` (external only). The frame loop follows the pointer target while `now - lastMove < 1500`, and otherwise the Lissajous target. The damped `sx/sy` makes the switch smooth.

- [ ] **Step 1: Write the check**

`alive 6` with no mouse movement must pass. Today on desktop (fine pointer, `auto=false`) the light stays still, so it fails.
Run: `node scripts/verify-capitoli.cjs alive 6`
Expected: `FAIL alive: card 6: not moving on its own`.

- [ ] **Step 2: Implement**

Declare `var ibrido = false, lastMove = -1e9;`. In `onMove`, change the first line to `if (auto && !ibrido) return;` and set `lastMove = performance.now();` at the end.

In `frame()`, replace `if (auto) {` with `if (auto || (ibrido && now - lastMove > 1500)) {`. Everything else is unchanged: the Lissajous code computes `tx/ty`, and the damping blends them.

External branch: set `ibrido = true;` first. In `start`, always `rectEl.addEventListener('mousemove', onMove);` (drop the `if (!auto)`). Mirror that in `stop` and `dispose`. Legacy is untouched.

- [ ] **Step 3: Run the checks**

Run: `node scripts/verify-capitoli.cjs alive 6 && node scripts/verify-capitoli.cjs interact`
Expected: two `PASS`.

- [ ] **Step 4: Commit**

```bash
git add atelier/js/lithos.js
git commit -m "feat(atelier): Rivela moves its light on its own until the mouse takes over"
```

---

### Task 12: Posters, full verification, handoff

**Files:**
- Modify: `atelier/assets/effetti/{sneaker,orologio,vesper,warp}.webp`
- Modify: `HANDOFF.md` (the "Effetti atelier" section)
- Modify: `scripts/verify-capitoli.cjs` (`poster` branch)

- [ ] **Step 1: Add a `poster` capture**

```js
    } else if (check === 'poster'){
      for (const i of [1, 2, 3, 5]){
        await settle(p, i); await p.waitForTimeout(2500);
        const id = await p.evaluate(i => window.EFFETTI[i].id, i);
        const r = await p.evaluate(() => { const e = document.getElementById('stage-live'); const b = e.getBoundingClientRect(); return { x: b.left, y: b.top, w: b.width, h: b.height }; });
        await p.evaluate(() => document.getElementById('lp').style.visibility = 'hidden');
        const buf = await p.screenshot({ clip: { x: r.x, y: r.y, width: r.w, height: r.h } });
        await p.evaluate(() => document.getElementById('lp').style.visibility = '');
        await sharp(buf).resize({ width: 1200, withoutEnlargement: true }).webp({ quality: 80 })
          .toFile(`atelier/assets/effetti/${id}.webp`);
        console.log('poster', id);
      }
```

Run from the repo root: `node scripts/verify-capitoli.cjs poster`. Then open each of the four webp files with Read. Each must show the live effect's first look (a shoe, a watch on white on the right, an orb, a helix on dark), with no copy and no DNA.

- [ ] **Step 2: Full run, both viewports**

```bash
for c in helix overlap index interact copy alive format tunnel vapore; do
  node scripts/verify-capitoli.cjs $c || echo "^^ $c desktop"
  node scripts/verify-capitoli.cjs $c --mobile || echo "^^ $c mobile"
done
node scripts/verify-capitoli.cjs copy --reduce
node scripts/verify-capitoli.cjs ritorno
```

Expected: every line `PASS`. Paste the output into the task report.

- [ ] **Step 3: Legacy page guard**

Run a quick capture of `http://localhost:8803/atelier/capitoli-legacy.html` scrolled to `#capWarp`, `#capVesper` and `#capOrologio` (use `page.evaluate(() => document.getElementById('capWarp').scrollIntoView())` then screenshot). Expected: the same look as before this branch. Compare with the same captures taken from commit `f869d0a` using `git worktree add /tmp/capitoli-base f869d0a`, served on port 8804, then `git worktree remove /tmp/capitoli-base`. The tunnel is present in legacy warp, the orologio has white columns, and there is no console error.

- [ ] **Step 3b: Manual checks that the harness cannot do**

Tell the controller (and through it Nike) that two checks need a real browser: a finger swipe on the preview on a phone (it must move the effect, not the deck), and scrolling smoothness in Safari with the helix cut. Do not claim either as verified.

- [ ] **Step 4: Update HANDOFF.md**

Under the "Effetti atelier" heading, add a dated block (2026-09-24). It states:
- what changed: no overlaps, the helix clip-path, the new titles, the landing copy, the automatic effects, no detail navigation;
- the branch `atelier-card-vive`, local and not pushed;
- the verify command `node scripts/verify-capitoli.cjs <check>`;
- that the merge to `main` still needs Nike's explicit OK, with the account and repo named.

Write it in Italian, matching the file.

- [ ] **Step 5: Commit**

```bash
git add atelier/assets/effetti/sneaker.webp atelier/assets/effetti/orologio.webp atelier/assets/effetti/vesper.webp atelier/assets/effetti/warp.webp HANDOFF.md scripts/verify-capitoli.cjs
git commit -m "chore(atelier): posters match the live effects; handoff for the live cards"
```
