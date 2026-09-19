# Robot — anima nella pancia e anatomia cliccabile — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** la sfera di SABE dentro la pancia dietro la «A», e tre etichette anatomiche con linea spezzata che compaiono al passaggio e portano alle sezioni del sito con un clic.

**Architecture:** la sfera diventa un modulo di punti (`pointorb.js`) come il cervello, dentro la stessa scena WebGL. Il torso si apre come il casco (stesso meccanismo di reveal), col logo che resta pieno. Le etichette sono un overlay DOM (`anatomia.js`) che ogni frame proietta un punto d'aggancio 3D; il clic sulla zona 3D naviga, e l'etichetta è anche un `<a>`.

**Tech Stack:** three.js r128 UMD globale, GLSL ES, DOM/SVG overlay, Playwright per le prove.

**Spec:** `docs/superpowers/specs/2026-09-20-robot-anatomia-design.md` — leggerla prima di ogni task.

## Global Constraints

- Ramo locale `robot-look-spline` in `~/Progetti/axxell-site-robot`. **Mai `git push`.**
- A runtime nessuna richiesta a `spline.design`/`unpkg`; three r128 resta da cdnjs.
- Strumenti e riferimenti fuori dal repo: `~/Progetti/file-sciolti/robot-spline-tools/`.
- Pipeline colore invariata: uniform grezze, texture `LinearEncoding`, niente `encodings_fragment`, niente tone mapping. I colori esadecimali del sito passano per `hexToLinear` come il cervello ATLAS.
- Identità delle mesh: `mesh.userData.splineIndex` (indice del nodo glTF). **L'ordine di `model.traverse` non è stabile.**
- A riposo la scena deve restare **identica pixel per pixel** a quella approvata nel piano precedente.
- Una sola zona accesa per volta; niente punti di cervello o sfera disegnati a riposo.
- Testi esattamente come li ha scritti Nike: «cervello»/«Atlas», «anima»/«sabe», «website creation»/«atelier».
- Cache-bust: se tocchi un file elencato in `index.html`, alza `?v=` di una lettera su **tutti** i tag del robot **e su `css/sections.css`** se lo modifichi (il suo tag ha una versione sua).
- Viewport di riferimento 1440×900 DPR 1; verifica anche a 1280×720.

## Mappa dei file

| File | Stato | Responsabilità |
|---|---|---|
| `website-creation/js/pointorb.js` | nuovo | la sfera di SABE come `THREE.Points` dentro la scena del robot |
| `website-creation/js/anatomia.js` | nuovo | overlay DOM: linee spezzate, etichette-link, CONFIG delle zone (da caricare **prima** di `robot.js`, come `robot-parts.js`) |
| `website-creation/js/robot.js` | modifica | hover del torso, sfera nella pancia, segnali alle etichette, clic che naviga |
| `website-creation/js/robot-spline-materials.js` | modifica | reveal del torso col logo che resta pieno |
| `website-creation/js/robot-spline-glsl.js` | modifica | alpha del petto = max(uOpacity, maschera logo) |
| `website-creation/css/sections.css` | modifica | stile di linee ed etichette |
| `website-creation/index.html` | modifica | due `<script>` nuovi + cache-bust |
| `~/Progetti/file-sciolti/robot-spline-tools/prova.mjs` | modifica | controlli `pancia-reveal`, `anatomia-*` |

---

### Task A1: `pointorb.js` — la sfera di SABE come modulo di punti

**Files:** Create `website-creation/js/pointorb.js`; Modify `website-creation/index.html` (script + cache-bust).

**Interfaces:**
- Produces: `WC.pointOrb.create({ count, radius, pointSize, uniforms })` → `{ points: THREE.Points, uniforms, update(dt, reveal, camera) }`, stessa forma di `WC.pointBrain.create`. La geometria si costruisce **a raggio 1** e `points.scale.setScalar(radius)` la porta alla misura giusta (lo shader ha soglie assolute: `uFadeNear 1.7`, `uFadeFar 3.1`, `bore 0.36`, offset di spawn 1.3–1.9 — a raggio 60 l'alpha va a zero e non si vede niente). `update` avanza `uTime`, scrive `reveal` in **`uAppear`** e aggiorna `uCamLocal` (camera portata in coordinate locali della sfera).
- Produces: `WC.pointOrb.sabeOrbUniforms()` → le uniform con i colori di SABE, convertiti con `hexToLinear` (stessa funzione già in `pointbrain.js`; esportarla o duplicarla con lo stesso nome e commento).
- Consumes: niente dal resto del robot.

**Sorgente da cui portare (fuori dal repo di runtime, è un file del sito nella radice del worktree):** `axxell-3d.js` — `ORB_CONFIG` (riga ~32), `SNOISE`, `ORB_VERT`/`ORB_FRAG` (righe ~236-455), `buildOrbGeometry` e la parte di `mountOrb` che costruisce geometria, uniform e `THREE.Points` (righe ~461-560). **Non** portare renderer, canvas, resize, scroll, `attachResize`, il puntatore «oleoso» legato al mouse della pagina (le uniform del puntatore restano, ferme al valore di riposo).

- [ ] **Step 1: prova rossa** — in `~/Progetti/file-sciolti/robot-spline-tools` crea `prova-orb.mjs` che apre una pagina di prova locale (scratch, fuori repo) che carica three r128 + `pointorb.js`, monta la sfera da sola su un canvas nero e la screenshotta. Prima dell'implementazione deve fallire con «WC.pointOrb non definito».
- [ ] **Step 2: porta il modulo.** Copia le costanti di `ORB_CONFIG` in un `ORB` interno al modulo; converti i tre colori con `hexToLinear`; porta lo shader verbatim (il GLSL è portabile; il file sorgente però è un modulo ES per three moderno — `outputColorSpace`, `SRGBColorSpace` — quindi non copiare nulla che stia fuori dalle stringhe GLSL) e la geometria di Fibonacci; esponi `create`/`sabeOrbUniforms`. Il modulo **non** deve toccare `window`, il DOM o il renderer.
- [ ] **Step 3: uniform da fissare e da pilotare.** `uAssemble = 1` (a 0 i punti restano al punto di spawn: sfera inesistente), `uOut = 0`, `uCore = 0`, `uOpacity` dal config, `uPR = renderer.getPixelRatio()`, `uCursor` inizializzata a un vettore **non nullo** (es. `(0,0,1)`: uno `normalize(vec3(0))` fa NaN tutto il vertex), `uEnergy = 0` di base. Il reveal passa da **`uAppear`** (l'alpha finale del fragment lo moltiplica, senza deformare). `depthTest` resta `true` (nella pagina di SABE è `false` perché lì la sfera è sola).
- [ ] **Step 3b: dimensione dei punti.** `gl_PointSize = uSize * uPR / (-mv.z)`: con la nostra camera a ~1000 unità e `zoom 2` la formula di SABE (uSize ≈ 21,6 a −mv.z ≈ 3,1) darebbe punti invisibili. Calibra come già fatto per il cervello in `robot.js` (`camDist` e `fovScale`, righe ~400-406) e passa il risultato come `pointSize`. Scrivi nel report la formula usata e il valore ottenuto.
- [ ] **Step 4: prova verde + confronto a occhio.** Rilancia `prova-orb.mjs`: la sfera si vede. Poi servi la radice del worktree e screenshotta la sezione SABE vera (`sabe.html`, canvas `#sabeCanvas`) e la nostra sfera. Il confronto vale su **tinta, gradiente (ciano in basso → verde in alto), bordi blu e grana**, non pixel per pixel: la pagina di SABE usa tone mapping ACES e ha il puntatore che deforma la superficie, noi no. Se la nostra risulta più chiara/satura, tara `brightness` e scrivilo nel report. Salva la coppia in `~/Progetti/file-sciolti/robot-confronto/09-sfera-vs-sabe.png`.
- [ ] **Step 5: commit** `feat(robot): la sfera di SABE come modulo di punti (pointorb.js)`.

---

### Task A2: la pancia si apre e mostra la sfera dietro la «A»

**Files:** Modify `website-creation/js/robot.js`, `js/robot-spline-materials.js`, `js/robot-spline-glsl.js`, `index.html` (cache-bust).

**Interfaces:**
- Consumes: `WC.pointOrb` (A1), `mesh.userData.splineIndex`, il materiale del petto (istanza con `LOGO`), `makeInside`.
- Produces: `window.__robot.orb` (come `__robot.brain`), `window.__robot.parts.bellyInside` (le mesh interne che sfumano — la mesh del torso resta quella già esposta come `parts.chest`, non se ne aggiunge un secondo nome); `spline.setBellyReveal(r)` parallelo a `setReveal(r)`; `makeInside(meshes, capo)` che **restituisce un gruppo** con le proprie liste.

- [ ] **Step 1: controllo rosso.** In `prova.mjs` aggiungi `pancia-reveal`: porta il puntatore al centro del torso; attende; asserisce `__robot.orb.points.visible === true`, opacità del petto ≤ 0,1, almeno una mesh in `parts.bellyInside` con opacità ≤ 0,05, e che il logo resti pieno (leggi il pixel più chiaro dentro il riquadro della «A»: deve restare > 690 come nel controllo `logo`). Poi porta il puntatore fuori e asserisce il contrario (`orb.points.visible === false`, opacità 1, `depthWrite` ripristinati). Deve fallire.
- [ ] **Step 2: alpha del petto nel fragment.** In `robot-spline-glsl.js` l'uscita è **fuori** dai blocchi `#ifdef` (riga ~324, `gl_FragColor = vec4(c, uOpacity);`): dichiara `float outA = uOpacity;` prima dei blocchi, dentro `#ifdef LOGO` (dentro `MAT_BODY`, righe ~297-315) metti `outA = max(uOpacity, lm);` e chiudi con `gl_FragColor = vec4(c, outA);`. Per gli altri materiali nulla cambia.
- [ ] **Step 3: reveal del torso.** In `robot-spline-materials.js`: il materiale del petto diventa `transparent = true` (oggi il clone eredita `false`, quindi `uOpacity` non farebbe nulla) e nasce `setBellyReveal(r)` gemello di `setReveal`: `uOpacity` da 1 a 0,06, `depthWrite` spento sotto 0,99, snap a 0 sotto 0,01 e a 1 sopra 0,995. **`makeInside` va generalizzato**: oggi scrive in due array del modulo letti da `setReveal`; deve invece restituire un gruppo (`{ materials, castMeshes }`) e ogni reveal iterare il proprio — altrimenti aprire la testa sfuma gli interni della pancia e viceversa. Il comportamento della testa non deve cambiare di un pixel.
- [ ] **Step 3b: ombra del torso.** Il torso è il pezzo che proietta più ombra (sulle gambe) e la mappa d'ombra ignora l'alpha: spegnerla a metà reveal come si fa col visore si vedrebbe come un lampo. Scatta le due varianti (ombra spenta a `r > 0.5` / ombra sempre accesa), guardale, tieni quella che non lampeggia e scrivi nel report quale e perché.
- [ ] **Step 4: la sfera nella pancia.** In `robot.js`, dopo il reveal della testa: la sfera si ancora al **centro del logo** (`spline.logo.anchor` / l'equivalente di `uLogoCenter` in coordinate mondo), non al centro del bbox del torso — a 1440×900 il centro del torso sta ~68 px sotto la «A», e Nike ha chiesto «esattamente dietro la A». Spostala **indietro** di 0,18 della profondità del torso, raggio = 0,42 della larghezza del torso, `points.scale` come da A1. Parentala al modello (non al gruppo testa). **Ordine di disegno esplicito e distinto**: sfera 0, interni testa 1, visore 2, **petto 3** (oggi visore e interni usano già 2 e 1: senza rinumerare, il petto trasparente coprirebbe la sfera). `points.visible = hoverBelly > 0.01`; `update(dt, hoverBelly, cam)` nel loop. I numeri stanno in un `BELLY_CONFIG` in cima al file, con commento.
- [ ] **Step 5: hover del torso.** Aggiungi `hoverBelly` come `hoverHead`: raycast dello stesso raggio sulla **sola** mesh del torso, smorzamento 0,18, e chiama `spline.setBellyReveal(hoverBelly)`. Se il raggio colpisce più zone vince la **più vicina alla camera** (ordina per distanza: è la regola dello spec, non «la testa vince sempre»).
- [ ] **Step 5b: quali mesh sfumano dentro il torso.** Non basta `containsPoint` sul bbox del torso (144×186×108): prenderebbe spalle, bacino e anello del collo (|x| ≈ 54). Prendi solo le mesh con `userData.splineMaterial === 'Parts'` **interamente** contenute nel bbox ristretto a 0,85, e stampa la lista dietro `window.__debugParts` come fa la testa.
- [ ] **Step 6: prove.** **Prima** di toccare il codice scatta la base: `node shot.mjs site out/09-riposo-prima.png --solo --video-t 2.5` col puntatore fuori. Alla fine `node prova.mjs` (tutti i controlli, incluso il nuovo) e `node confronta.mjs out/09-riposo-prima.png <nuovo scatto identico> …` deve dare **`meanDiff == 0` e `iou == 1`** (gli scatti `06-riposo.png` non valgono più: il petto ora porta la «A», e il video degli occhi avanza se non fissi `--video-t`). Salva `~/Progetti/file-sciolti/robot-confronto/09-pancia-reveal.png` e guardalo: la sfera si vede dietro la «A» piena, l'interno del torso non legge come un buco.
- [ ] **Step 7: commit** `feat(robot): la pancia si apre e mostra la sfera di SABE dietro la A`.

---

### Task A3: etichette anatomiche con linea spezzata e clic che naviga

**Files:** Create `website-creation/js/anatomia.js`; Modify `website-creation/js/robot.js`, `css/sections.css`, `index.html`.

**Interfaces:**
- Produces: `WC.anatomia.mount({ stage, camera, zones })` → `{ update(activeId, anchors), dispose() }`, dove `zones` è il CONFIG e `anchors` sono i punti 3D d'aggancio già calcolati da `robot.js`.
- Consumes: `hoverHead`, `hoverBelly`, `surgeL/surgeR` (per sapere quale zona è attiva), la camera e il rettangolo dello stage.
- CONFIG in cima ad `anatomia.js`:
```js
  var ZONE = [
    { id: 'testa',   lato: 'destra',   testo: 'cervello',         sotto: 'Atlas',   href: '../atlas.html', attiva: true },
    { id: 'pancia',  lato: 'destra',   testo: 'anima',            sotto: 'sabe',    href: '../sabe.html',  attiva: true },
    { id: 'braccioSx', lato: 'sinistra', testo: 'website creation', sotto: 'atelier', href: 'CORRENTE#cap01', attiva: true },
    { id: 'braccioDx', lato: 'destra',  testo: '',                 sotto: '',        href: '',              attiva: false }
  ];
  var LINEA = { orizzontaleObiettivo: 0.27, orizzontaleMinimo: 0.12, obliquoGradi: 38, staccoTesto: 0.5, margineBordo: 24 };
  // `CORRENTE#cap01`: la pagina ha <base href="/website-creation/">, quindi un href
  // di solo frammento punterebbe a un'altra URL e ricaricherebbe (in produzione
  // vercel.json ha cleanUrls, che aggiunge pure un 308). L'href si scrive a runtime
  // come location.pathname + '#cap01' e il clic fa preventDefault + scroll morbido
  // (usa WC.lenis se c'è: lo scroll nativo gli va contro).
```

- [ ] **Step 1: controlli rossi.** In `prova.mjs` aggiungi `anatomia-hover`, `anatomia-riposo`, `anatomia-click`, `anatomia-tastiera` come descritti nello spec §6. Devono fallire.
- [ ] **Step 2: overlay.** `anatomia.js` crea un contenitore assoluto sopra il canvas (stesso rettangolo dello stage, `pointer-events:none`), e per ogni zona attiva un `<svg>` con una `polyline` e un `<a class="wc-anat">` con due `<span>` (voce grande e piccola). I link hanno `pointer-events:auto`, `tabindex` naturale e `aria-label` «cervello — Atlas» ecc.
- [ ] **Step 3: geometria della linea.** Dato il punto d'aggancio proiettato `(x, y)` e il lato: tratto obliquo da `(x, y)` con l'angolo di `LINEA.obliquoGradi` verso l'esterno; poi tratto orizzontale fino al testo. La lunghezza **si calcola**, non si impone: `corsa = min(obiettivo, spazioDisponibile − larghezzaTesto − margineBordo)` con `spazioDisponibile` misurato dal punto d'aggancio al bordo dello stage sul lato scelto, e mai sotto `orizzontaleMinimo × larghezza`. A 1440×900 il braccio di sinistra ha il bordo esterno a x ≈ 410-430: con l'obiettivo fisso 0,27 (389 px) il testo «website creation» (~140 px) non ci starebbe. Solo se nemmeno il minimo ci sta, l'etichetta passa dall'altro lato — mai attraverso il corpo.
- [ ] **Step 4: aggancio 3D.** In `robot.js`, ogni frame, calcola i punti d'aggancio in mondo: testa = centro del bbox testa spostato sul bordo esterno; pancia = bordo destro del torso a metà altezza; braccio = bordo esterno del gruppo braccio **a sinistra dello schermo** (deciso proiettando il centro dei due gruppi, non per nome). Proiettali con la camera, passali ad `anatomia.update(activeId, anchors)` ed esponili in `window.__robot.anatomia = { activeId, anchors }` (servono ai controlli).
- [ ] **Step 5: attivazione.** `activeId` = la zona **colpita dal raycast in questo frame** (la più vicina), non il segnale smorzato più alto: le fibre decadono a 0,05/frame e terrebbero «website creation» acceso per ~14 frame mentre il puntatore è già sulla pancia. I valori smorzati restano per il disegno. Se il puntatore sta sull'etichetta (o il link ha il fuoco), la zona resta attiva e il suo hover viene **tenuto a 1** finché ci resta, con una piccola tolleranza temporale per attraversare lo spazio vuoto fra modello ed etichetta (la linea SVG è `pointer-events:none`). Dissolvenza 180 ms via classe CSS; la linea si disegna con `stroke-dashoffset` in 220 ms.
- [ ] **Step 6: clic e cursore.** Su `pointerup` nello stage senza trascinamento (< 5 px dal `pointerdown`), se il raycast colpisce la zona attiva → naviga: `atlas.html`/`sabe.html` con `location.href` (in produzione `cleanUrls` fa un 308 verso `/atlas`: va bene, ma scrivilo nel report), mentre per l'Atelier si fa `preventDefault()` e scroll morbido a `#cap01` (con `WC.lenis` se presente). Gli `<a>` fanno lo stesso al clic e con Invio. Sopra una zona attiva lo stage prende `cursor: pointer` (verificato: `.wc-fx` è `pointer-events:none` e `#cap05` ha `data-cursor="hidden"`, che nasconde solo il pallino del cursore finto: nessun conflitto).
- [ ] **Step 7: stile e accessibilità.** In `sections.css`: `.wc-anat` tipografia del sito (voce grande ~0,95 rem, piccola in mono ~0,7 rem, maiuscoletto), colore `var(--fg)`, linea 1 px `currentColor`, nessuna ombra; niente transizioni su larghezza/altezza (solo opacità e `stroke-dashoffset`). A riposo le etichette stanno a `opacity: 0; pointer-events: none` ma **restano raggiungibili col tab** (niente `display:none`/`visibility:hidden`): al `:focus-visible` l'etichetta compare con contorno netto e la sua zona si accende. L'overlay ha `z-index: 2` dentro `.wc-robot-card` (che è `overflow:hidden`).
- [ ] **Step 7b: senza scena.** Se `prefers-reduced-motion` è attivo `robot.js` esce prima di montare qualsiasi cosa: in quel caso **monta lo stesso l'overlay**, fermo, con le tre etichette in posizioni fisse (niente linee animate), così i collegamenti ad Atlas/SABE/Atelier esistono comunque — oggi in quella sezione non ce ne sono altri. Provalo con Playwright (`colorScheme`/`reducedMotion: 'reduce'`).
- [ ] **Step 8: prove verdi.** `node prova.mjs` tutto verde a 1440×900 e i controlli chiave a 1280×720 (compreso il giro con `reducedMotion: 'reduce'`); screenshot delle tre zone in `~/Progetti/file-sciolti/robot-confronto/09-anatomia-{testa,pancia,braccio}.png`; guardali: linee lunghe come chiede Nike, niente che attraversa il robot, testo leggibile.
- [ ] **Step 9: commit** `feat(robot): etichette anatomiche con linea spezzata e clic verso le sezioni`.

---

### Task A4: verifica finale e pacchetto per Nike

**Files:** Modify `website-creation/index.html` (cache-bust finale), `js/robot.js` (commento di testa aggiornato); output in `~/Progetti/file-sciolti/robot-confronto/`.

- [ ] **Step 1: giro completo.** `node prova.mjs` (tutti i controlli) a 1440×900 e a 1280×720; console pulita; nessuna richiesta verso `spline.design`/`unpkg`.
- [ ] **Step 2: non-regressione dell'aspetto.** Confronti vs `ref-frozen` come nel Task 8: braccio/gambe/petto ≈1,7/1,4/0,85, testa ≈1,8 (stesso `--video-t`), petto con `--logo-off` ≈0,86. A riposo, differenza pixel zero rispetto allo stato del piano precedente.
- [ ] **Step 3: pacchetto.** In `robot-confronto/`: `10-riposo.png`, `10-testa.png` (hover testa con etichetta), `10-pancia.png`, `10-braccio.png`, `10-1280.png`. Guardali tutti.
- [ ] **Step 4: commit** `chore(robot): verifica finale anatomia + pacchetto di confronto`.
- [ ] **Step 5 (coordinatore, non sub-agente):** mostrare a Nike, raccogliere i ritocchi (lunghezza linee, tipografia, raggio della sfera), nessun push, nessun merge.
