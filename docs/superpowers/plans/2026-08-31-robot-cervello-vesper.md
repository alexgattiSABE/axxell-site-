# Robot cap.05 — cervello Vesper + fibre — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sostituire la demo Spline in `cap05` con una scena three.js nostra costruita sulla forma estratta del robot Spline, con testa di vetro Fresnel che segue il cursore, cervello di punti Vesper sincrono dentro la testa, e fibre luminose nelle braccia.

**Architecture:** Un solo contesto WebGL (three.js r128 globale). Il GLB estratto (`robot-raw.glb`) viene compresso in Draco e caricato con GLTFLoader/DRACOLoader vendorizzati; le mesh si dividono in `head`/`body`/`arm*`; si applicano materiali nostri (carbonio + vetro Fresnel), si aggancia il cervello Vesper (Points) al gruppo-testa, e fibre emissive alle braccia. Tutta l'interazione (drag-rotate, testa-segue-cursore, reveal cervello, flusso fibre) gira in un unico loop rAF, dentro il lazy-mount già esistente in `robot.js`.

**Tech Stack:** three.js r128 (UMD globale), GLTFLoader+DRACOLoader r128 (vendor locale), gltf-pipeline o gltfpack per la compressione Draco, Playwright (chromium swiftshader, da `~/axxell-chatbot/node_modules`) per la verifica headless.

**Spec:** `docs/superpowers/specs/2026-08-31-robot-cervello-vesper-design.md`

## Global Constraints

- three.js = **r128 globale** (`window.THREE`); nessun modulo ESM, nessun bump di versione (Vesper gira su r128).
- **Un solo contesto WebGL** nella sezione. Mai due canvas 3D vivi.
- **Zero dipendenza Spline a runtime**: nessuna richiesta a `spline.design` o `unpkg`; via `@splinetool/*` da `robot.js`.
- **Lazy-mount** invariato: il 3D si costruisce solo quando `cap05` entra (IntersectionObserver, margine 1 schermata).
- **Reduced-motion / no-WebGL** → resta la card statica con la copy (comportamento attuale di `robot.js`).
- **Cleanup** completo al dismontaggio (dispose geometrie/materiali/renderer, rimozione listener).
- **Verifica** = Playwright headless + screenshot ispezionati + **console pulita**. Ciò che l'headless non può mostrare (H.264, GPU vera) va **dichiarato non verificato**, mai dato per buono.
- Copy della sezione **invariata**.

---

## File Structure

- `website-creation/assets/robot.glb` — GLB Draco compresso (da `robot-raw.glb`). **Create** (build step).
- `website-creation/vendor/three-r128/GLTFLoader.js`, `DRACOLoader.js` — loader UMD r128. **Create** (vendor).
- `website-creation/vendor/draco/` — decoder Draco (draco_decoder.wasm/js). **Create** (vendor).
- `website-creation/js/robot.js` — **riscritto**: da mount Spline a scena three.js nostra. Orchestratore della sezione.
- `website-creation/js/robot-parts.js` — **Create**: isolamento sotto-parti (head/body/arms) dal GLB.
- `website-creation/js/robot-materials.js` — **Create**: materiali carbonio + vetro Fresnel della testa.
- `website-creation/js/pointbrain.js` — **Create**: helper condiviso del cervello di punti (campionamento mesh + shader), estratto da `vesper.js`.
- `website-creation/js/robot-fibers.js` — **Create**: fibre emissive lungo le braccia.
- `website-creation/index.html` — **Modify**: aggiungere i tag script dei nuovi js + loader vendorizzati.
- `scripts/robot-shot.mjs` — **Create**: harness Playwright di verifica (serve la home, entra in cap05, screenshot + dump richieste rete + console).

---

## Task 1: Asset pipeline + GLB nostro a schermo (Spline via)

**Files:**
- Create: `website-creation/assets/robot.glb` (build), `website-creation/vendor/three-r128/GLTFLoader.js`, `website-creation/vendor/three-r128/DRACOLoader.js`, `website-creation/vendor/draco/*`
- Create: `scripts/robot-shot.mjs`
- Modify: `website-creation/index.html` (script tags), `website-creation/js/robot.js` (riscrittura del mount)

**Interfaces:**
- Produces: `robot.js` espone (interno) `mountRobot(stage, ctx)` che costruisce renderer+scene+camera e carica `assets/robot.glb`, ritornando `{ renderer, scene, camera, model, dispose }`. `window.__robot` esposto in dev per la verifica (model + flags).

- [ ] **Step 1: Comprimere il GLB in Draco**

Da `website-creation/`:
```bash
npx --yes @gltf-transform/cli@4 optimize assets/robot-raw.glb assets/robot.glb \
  --compress draco --texture-compress false
# verifica dimensione attesa < 700KB
ls -la assets/robot.glb
```
Se `@gltf-transform` non comprime a sufficienza, fallback `gltfpack -i assets/robot-raw.glb -o assets/robot.glb -cc`.

- [ ] **Step 2: Vendorizzare i loader r128 + decoder Draco**

```bash
mkdir -p vendor/three-r128 vendor/draco
curl -sL https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js -o /dev/null # conferma r128 raggiungibile
# GLTFLoader/DRACOLoader UMD r128 dal repo three examples/js/loaders:
curl -sL https://unpkg.com/three@0.128.0/examples/js/loaders/GLTFLoader.js -o vendor/three-r128/GLTFLoader.js
curl -sL https://unpkg.com/three@0.128.0/examples/js/loaders/DRACOLoader.js -o vendor/three-r128/DRACOLoader.js
# decoder Draco (js+wasm) versione compatibile:
curl -sL https://unpkg.com/three@0.128.0/examples/js/libs/draco/draco_decoder.js -o vendor/draco/draco_decoder.js
curl -sL https://unpkg.com/three@0.128.0/examples/js/libs/draco/draco_decoder.wasm -o vendor/draco/draco_decoder.wasm
curl -sL https://unpkg.com/three@0.128.0/examples/js/libs/draco/draco_wasm_wrapper.js -o vendor/draco/draco_wasm_wrapper.js
ls -la vendor/three-r128 vendor/draco
```

- [ ] **Step 3: Aggiungere gli script in index.html**

In `index.html`, DOPO il tag `three.min.js` (r128) e PRIMA di `js/robot.js`, aggiungere:
```html
<script src="vendor/three-r128/GLTFLoader.js"></script>
<script src="vendor/three-r128/DRACOLoader.js"></script>
<script src="js/robot-parts.js"></script>
<script src="js/robot-materials.js"></script>
<script src="js/pointbrain.js"></script>
<script src="js/robot-fibers.js"></script>
```
(`js/robot.js` resta dov'è nell'ordine di caricamento, dopo questi.)

- [ ] **Step 4: Riscrivere robot.js — mount della scena nostra**

Sostituire l'intero corpo Spline (`VIEWER`/`VIEWER_SRI`/`SCENE`/`mount()` custom element) mantenendo: il guscio `WC.register('robot', ...)`, il grab di `section/card/stage/hint`, il gate `ctx.motionOk`, l'IntersectionObserver con `rootMargin:'100% 0px'`, il `fail()` sull'hint, e il ritorno di cleanup. Dentro `mount()`:
```js
function mount(){
  if (mounted) return; mounted = true;
  if (!ctx.motionOk || typeof THREE === 'undefined') { fail('Modello 3D disattivato'); return; }

  var renderer = new THREE.WebGLRenderer({ antialias:true, alpha:true });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio||1));
  var scene = new THREE.Scene();
  var cam = new THREE.PerspectiveCamera(32, 1, 0.1, 100);
  scene.add(new THREE.HemisphereLight(0xbfd6ff, 0x0a0410, 0.9));
  var key = new THREE.DirectionalLight(0xffffff, 1.6); key.position.set(2,4,3); scene.add(key);

  var draco = new THREE.DRACOLoader(); draco.setDecoderPath('vendor/draco/');
  var gltf = new THREE.GLTFLoader(); gltf.setDRACOLoader(draco);

  function fit(){ /* size renderer/cam to stage box */
    var w = stage.clientWidth, h = stage.clientHeight;
    renderer.setSize(w, h, false); cam.aspect = w/Math.max(1,h); cam.updateProjectionMatrix();
  }
  stage.appendChild(renderer.domElement);

  gltf.load('assets/robot.glb', function(g){
    var model = g.scene;
    // centra e scala il modello nell'inquadratura
    var box = new THREE.Box3().setFromObject(model);
    var c = box.getCenter(new THREE.Vector3()), s = box.getSize(new THREE.Vector3());
    model.position.sub(c);
    var wrap = new THREE.Group(); wrap.add(model); scene.add(wrap);
    var maxDim = Math.max(s.x, s.y, s.z);
    cam.position.set(0, 0, maxDim*1.6); cam.lookAt(0,0,0);
    fit();
    if (hint) hint.remove();
    window.__robot = { model: model, wrap: wrap, scene: scene, box: box };
    // loop
    var raf; (function tick(){ raf = requestAnimationFrame(tick); renderer.render(scene, cam); })();
    cleanups.push(function(){ cancelAnimationFrame(raf); });
  }, undefined, function(){ fail('Modello non caricato'); });

  window.addEventListener('resize', fit); cleanups.push(function(){ window.removeEventListener('resize', fit); });
  cleanups.push(function(){ renderer.dispose(); if (renderer.domElement.parentNode) renderer.domElement.parentNode.removeChild(renderer.domElement); });
}
```

- [ ] **Step 5: Scrivere l'harness di verifica Playwright**

`scripts/robot-shot.mjs`: serve `website-creation/` su una porta effimera, apre la home in chromium swiftshader, forza il mount di cap05 (scroll fino alla sezione o `document.getElementById('cap05').scrollIntoView()` + attesa), **registra tutte le richieste di rete** e i messaggi di console, poi screenshotta lo stage. Deve **fallire** (exit 1) se compare una richiesta a `spline.design`/`unpkg`, o se la console ha errori.
```js
// usa require('playwright') da /Users/alexgatti/axxell-chatbot/node_modules (createRequire), come nello spike.
// stampa: lista host contattati, errori console, path screenshot.
```

- [ ] **Step 6: Verificare — GLB a schermo, Spline assente**

```bash
cd ~/axxell-chatbot && node ~/axxell-site-/scripts/robot-shot.mjs
```
Expected: screenshot mostra il robot; nell'elenco host **nessun** `spline.design`/`unpkg`; **console pulita**. Ispezionare lo screenshot: robot centrato e inquadrato.

- [ ] **Step 7: (nessun commit automatico)** — lasciare le modifiche nel working tree; commit solo su richiesta dell'utente.

---

## Task 2: Isolamento sotto-parti (head / body / arms)

**Files:**
- Create: `website-creation/js/robot-parts.js`
- Modify: `website-creation/js/robot.js` (usare lo split dopo il load)

**Interfaces:**
- Produces: `WC.robotParts.split(model) -> { head:THREE.Object3D[], body:THREE.Object3D[], armL:THREE.Object3D[], armR:THREE.Object3D[], joints:{shoulderL,elbowL,wristL,shoulderR,elbowR,wristR:THREE.Vector3} }`. I `joints` sono in coordinate locali del modello (post-centratura).

- [ ] **Step 1: Diagnostica dei nomi mesh nel GLB**

Aggiungere temporaneamente in `robot.js` dopo il load: `model.traverse(n=>{ if(n.isMesh) console.log('MESH', n.name, n.getWorldPosition(new THREE.Vector3()).toArray().map(v=>+v.toFixed(2))); });` e girare l'harness per **elencare nomi e posizioni**. Serve a decidere se lo split va per nome o per posizione.

- [ ] **Step 2: Implementare lo split**

`robot-parts.js`:
```js
window.WC = window.WC || {}; WC.robotParts = {
  split: function(model){
    var meshes = []; model.traverse(function(n){ if(n.isMesh) meshes.push(n); });
    var box = new THREE.Box3().setFromObject(model);
    var size = box.getSize(new THREE.Vector3()), min = box.min;
    var yTop = min.y + size.y; // già centrato: usare world Y
    function cy(m){ return new THREE.Box3().setFromObject(m).getCenter(new THREE.Vector3()).y; }
    function cx(m){ return new THREE.Box3().setFromObject(m).getCenter(new THREE.Vector3()).x; }
    // soglia collo: le mesh il cui centro sta sopra ~82% dell'altezza = testa
    var neck = min.y + size.y*0.82;
    var head=[], body=[], armL=[], armR=[];
    meshes.forEach(function(m){
      var byName = (m.name||'').toLowerCase();
      var isHead = /head|helmet|visor|face|glass/.test(byName) || cy(m) >= neck;
      if (isHead) { head.push(m); return; }
      // braccia: mesh lontane dall'asse X e in fascia toracica
      var x = cx(m), y = cy(m);
      var armband = y > min.y + size.y*0.45 && y < neck;
      if (armband && Math.abs(x) > size.x*0.16) { (x<0?armL:armR).push(m); }
      body.push(m);
    });
    // giunti stimati dai bounding box dei gruppi braccio (fallback a proporzioni)
    function jointsFor(arr, sign){ /* shoulder=top, wrist=bottom, elbow=mid del bbox unito */ }
    return { head:head, body:body, armL:armL, armR:armR, joints: /* … */ };
  }
};
```
(Se lo Step 1 mostra nomi affidabili, la regressione per posizione resta come fallback.)

- [ ] **Step 3: Verificare lo split colorando i gruppi**

In `robot.js`, dietro un flag `window.__debugParts`, tinteggiare: testa=verde, braccia=ciano, corpo=grigio. Girare l'harness con quel flag e screenshottare **fronte + 3/4**.
Expected: testa correttamente verde (solo il casco/visore), braccia ciano (solo gli arti), resto grigio. Aggiustare la soglia `0.82`/`0.16` finché lo screenshot è corretto.

- [ ] **Step 4: (nessun commit automatico)**

---

## Task 3: Materiali — carbonio + vetro Fresnel della testa

**Files:**
- Create: `website-creation/js/robot-materials.js`
- Modify: `website-creation/js/robot.js` (applicare i materiali dopo lo split)

**Interfaces:**
- Consumes: `WC.robotParts.split()` (Task 2).
- Produces: `WC.robotMaterials.carbon() -> THREE.Material`, `WC.robotMaterials.glassHead(opts) -> THREE.ShaderMaterial` con uniform `uOpen`(0..1, apertura di fronte), `uTime`. `applyTo(parts)` che assegna carbonio al body/arms e il vetro alla testa.

- [ ] **Step 1: Materiale carbonio**

`robot-materials.js`:
```js
WC.robotMaterials = {
  carbon: function(){
    return new THREE.MeshStandardMaterial({ color:0x0b0d10, roughness:0.42, metalness:0.55 });
  },
  // vetro: Fresnel → trasparenza di fronte, riflesso/scuro di taglio.
  glassHead: function(opts){ /* ShaderMaterial, vedi Step 2 */ },
  applyTo: function(parts){
    var carb = this.carbon();
    parts.body.concat(parts.armL, parts.armR).forEach(function(m){ m.material = carb; });
    var glass = this.glassHead({ tint:0x0a0f14 });
    parts.head.forEach(function(m){ m.material = glass; });
    return { glass: glass };
  }
};
```

- [ ] **Step 2: Shader del vetro Fresnel (adattato dalle card atelier a mesh curva)**

Vertex passa `vNormalW`, `vViewDir`. Fragment: `fres = pow(1.0 - max(dot(N,V),0.0), uPower)`; il colore = mix fra **trasparente** (alpha basso, mostra il cervello dietro) al centro di faccia e **scuro riflettente** (alpha alto + specular) di taglio, modulato da `uOpen`. `transparent:true`, `depthWrite:false`. Partenza: `uPower=2.4`, tinta `0x0a0f14`. **Da iterare a schermo** (Step 4).

- [ ] **Step 3: Applicare in robot.js**

Dopo lo split: `var parts = WC.robotParts.split(model); var mats = WC.robotMaterials.applyTo(parts); window.__robot.parts = parts; window.__robot.glass = mats.glass;`. Nel loop, aggiornare `mats.glass.uniforms.uTime`.

- [ ] **Step 4: Verificare fronte + taglio, iterare i numeri**

Girare l'harness con due screenshot: cursore al centro testa (`uOpen≈1`, vetro aperto → si deve vedere "dentro") e testa girata di taglio (`uOpen≈0`, vetro scuro/riflettente). Iterare `uPower`, tinta, alpha finché il fronte è trasparente e il taglio è vetro nero. **Dichiarare** che la resa finale va confermata su browser vero.

- [ ] **Step 5: (nessun commit automatico)**

---

## Task 4: Testa che segue il cursore

**Files:**
- Modify: `website-creation/js/robot.js`

**Interfaces:**
- Consumes: `parts.head` (Task 2), `glass` (Task 3).
- Produces: nel `window.__robot`, `headGroup:THREE.Group` (le mesh testa ri-parentate) e `state.faceAmount` (0..1, quanto la testa guarda il cursore) — consumato da Task 5 (reveal) e Task 3 (uOpen).

- [ ] **Step 1: Ri-parentare la testa in un Group con pivot al collo**

Creare `headGroup = new THREE.Group()`, posizionarne l'origine al centro-collo (bordo inferiore del bbox testa), spostarci dentro le mesh `parts.head` conservando la posizione mondiale, e aggiungerlo dove stavano. Esporre `window.__robot.headGroup`.

- [ ] **Step 2: Rotazione clampata e smorzata verso il puntatore**

Traccia `pointer` (NDC) su `mousemove` dello stage. Ogni frame: target `yaw = clamp(pointer.x * 0.5, -0.5, 0.5)`, `pitch = clamp(-pointer.y * 0.35, -0.3, 0.3)`; `headGroup.rotation.y += (yaw - rot.y)*0.12`; idem pitch. A cursore fuori sezione, target → 0 (ritorno al centro). `faceAmount = 1 - min(1, hypot(pointer.x,pointer.y))` quando il cursore è sopra lo stage, altrimenti decade a 0.

- [ ] **Step 3: Collegare uOpen del vetro a faceAmount**

`glass.uniforms.uOpen.value += (state.faceAmount - glass.uniforms.uOpen.value)*0.1;` nel loop.

- [ ] **Step 4: Verificare a tre posizioni del cursore**

Harness: muovere il puntatore a sinistra/centro/destra dello stage (`page.mouse.move`) e screenshottare. Expected: la testa ruota verso il cursore entro il range; al centro il vetro si apre; ai bordi si richiude. Console pulita.

- [ ] **Step 5: (nessun commit automatico)**

---

## Task 5: Cervello Vesper dentro la testa

**Files:**
- Create: `website-creation/js/pointbrain.js`
- Modify: `website-creation/js/vesper.js` (usare l'helper condiviso, senza cambiarne la resa), `website-creation/js/robot.js`

**Interfaces:**
- Consumes: `headGroup`, `state.faceAmount` (Task 4).
- Produces: `WC.pointBrain.create(opts) -> { points:THREE.Points, update(dt, reveal) }` dove `reveal` 0..1 pilota opacità/emissione. `opts`: `{ count, radius, color }` e opzionale `sampleFrom:THREE.Mesh` per campionare una mesh.

- [ ] **Step 1: Estrarre il cervello di punti da vesper.js in pointbrain.js**

Individuare in `vesper.js` la parte `brain/` (campionamento della mesh cotta + materiale dei punti) e spostarla in `WC.pointBrain.create`, parametrizzando `count/radius/color`. `vesper.js` chiama l'helper al posto del codice inline. **Non cambiare** i valori usati da Vesper (stessa resa): il refactor deve lasciare Vesper identico.

- [ ] **Step 2: Verificare che Vesper sia invariato**

Harness su `capVesper`: screenshot prima/dopo il refactor devono coincidere (o comunque il cervello di Vesper compare come prima). Console pulita.

- [ ] **Step 3: Agganciare il cervello al gruppo-testa**

In `robot.js`: `var brain = WC.pointBrain.create({ count: 4000, radius: headRadius*0.6, color: 0x8bd6ff }); brain.points.position.copy(headCenterLocal); headGroup.add(brain.points);` → si muove in sincrono con la testa (requisito utente). Nel loop: `brain.update(dt, revealValue)`.

- [ ] **Step 4: Reveal all'hover**

`revealValue += (state.faceAmount - revealValue)*0.08;` — a testa neutra il cervello è spento, quando ti guarda si accende. Il vetro aperto (uOpen) lo lascia vedere.

- [ ] **Step 5: Verificare hover vs non-hover**

Harness: screenshot con cursore lontano (cervello spento, testa scura) e cursore centrato sulla testa (vetro aperto + cervello acceso, che si muove con la testa). Ispezionare che il cervello resti DENTRO la testa quando questa ruota (muovere il cursore lateralmente e screenshottare). Console pulita.

- [ ] **Step 6: (nessun commit automatico)**

---

## Task 6: Fibre nelle braccia

**Files:**
- Create: `website-creation/js/robot-fibers.js`
- Modify: `website-creation/js/robot.js`

**Interfaces:**
- Consumes: `parts.joints` (Task 2), `parts.armL/armR`.
- Produces: `WC.robotFibers.create(joints) -> { object:THREE.Object3D, update(dt, surgeL, surgeR) }` dove `surge*` 0..1 = intensità del flusso su ciascun braccio (accesa al passaggio del cursore).

- [ ] **Step 1: Curve lungo le braccia**

Per ogni braccio, `new THREE.CatmullRomCurve3([shoulder, elbow, wrist])` (dai `joints`), materializzata come `THREE.TubeGeometry(curve, 40, radius=headRadius*0.03, 6)`. 2-3 fibre parallele con leggero offset laterale.

- [ ] **Step 2: Materiale emissivo con flusso**

ShaderMaterial additivo: gradiente che scorre lungo la coordinata `u` del tubo (`fract(u - uTime*speed)`), colore rame/menta, intensità = `uSurge`. `blending:AdditiveBlending`, `transparent:true`, `depthWrite:false`.

- [ ] **Step 3: Agganciare al gruppo-braccio**

Le fibre vanno figlie dello stesso nodo delle mesh-braccio così restano incollate quando il robot ruota. Se le braccia non hanno un nodo proprio, crearne uno per lato e ri-parentare `armL/armR`.

- [ ] **Step 4: Legare al circuit del cursore**

Leggere il segnale del `data-cursor-fx="circuit"` (js/cursorfx.js): al passaggio del cursore su un braccio, alzare `surge` di quel lato (decay nel tempo). Se l'aggancio diretto a cursorfx è complicato, ricavare il passaggio da `pointer` vicino alla proiezione schermo del braccio.

- [ ] **Step 5: Verificare flusso e accensione**

Harness: screenshot statico (fibre visibili, flusso in corso a bassa intensità) e con cursore mosso lungo un braccio (surge alto su quel lato). Console pulita. **Dichiarare** che il flusso animato si valuta bene solo su browser vero.

- [ ] **Step 6: (nessun commit automatico)**

---

## Task 7: Interazione, levitazione, reduced-motion, cleanup

**Files:**
- Modify: `website-creation/js/robot.js`

**Interfaces:**
- Consumes: tutto quanto sopra (`wrap`, `headGroup`, `brain`, fibers, glass).

- [ ] **Step 1: Levitazione + drag-to-rotate del robot intero**

Nel loop: `wrap.position.y = Math.sin(t*0.8)*bob;`. Drag: su `pointerdown`+move sullo stage, accumulare `wrap.rotation.y += dx*0.005` con inerzia; a riposo ritorno morbido verso 0. La rotazione della testa (Task 4) resta additiva a questa.

- [ ] **Step 2: Ordine di aggiornamento nel loop**

Un solo `tick(dt)`: aggiorna pointer/faceAmount → headGroup → glass.uOpen → brain.update(reveal) → fibers.update(surge) → wrap (levitazione+drag) → render. `dt` da un clock, clampato.

- [ ] **Step 3: Reduced-motion e no-WebGL**

Confermare che con `ctx.motionOk===false` o `THREE` assente non si monta nulla e resta la card statica (già gestito da `robot.js`). Verificare con harness `reducedMotion:'reduce'`.

- [ ] **Step 4: Cleanup completo**

`dispose()` deve: cancelAnimationFrame, rimuovere tutti i listener (resize, pointer), `renderer.dispose()`, traverse dispose di geometrie/materiali (model, brain, fibers), rimuovere il canvas. Verificare che rientrando/uscendo dalla sezione non si accumulino contesti.

- [ ] **Step 5: Verifica finale end-to-end**

Harness completo: entra in cap05, giro cursore (testa segue, vetro apre, cervello acceso e sincrono), passaggio sulle braccia (fibre), drag (rotazione), uscita/rientro (nessun leak). **Nessun** host `spline.design`/`unpkg`. **Console pulita** (tollerato solo l'avviso di prestazione ReadPixels di swiftshader). Screenshot finale ispezionato.
Limite dichiarato: nessuno l'ha ancora aperto su **browser/telefono vero** — mobile e resa materiali da confermare lì.

- [ ] **Step 6: (nessun commit automatico)** — a fine piano, proporre all'utente il commit e l'aggiornamento di STATO/memoria.

---

## Self-Review

- **Copertura spec:** Fondazione+rimozione Spline → T1; isolamento parti → T2; materiali (carbonio+vetro Fresnel) → T3; testa-segue-cursore → T4; cervello Vesper sincrono + reveall → T5; fibre → T6; interazione+levitazione+drag+reduced-motion+cleanup → T7. Peso/Draco → T1. Fallback → T1+T7. Tutti i criteri di riuscita della spec hanno un task.
- **Placeholder:** i punti "da iterare" (shader vetro, fibre) hanno una **implementazione di partenza concreta** + un passo di verifica che definisce il target; non sono TODO vuoti. Le parentesi `/* … */` in T2 (joints) e T3 (shader body) sono gli unici dettagli lasciati all'implementazione perché **dipendono dai nomi/posizioni mesh reali** che T2/Step1 scopre — è una dipendenza dichiarata, non un placeholder di comodo.
- **Coerenza tipi:** `parts` (T2) consumato da T3/T5/T6; `state.faceAmount` prodotto in T4 e consumato in T3/T5; `headGroup` prodotto in T4 e usato in T5; `joints` prodotto in T2 e usato in T6. Nomi coerenti.
