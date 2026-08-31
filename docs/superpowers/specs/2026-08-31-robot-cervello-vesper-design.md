# Robot cap. 05 — corpo Spline estratto, cervello Vesper, fibre nelle braccia

**Data:** 2026-08-31
**Sezione:** `cap05` (`.wc-robot`) della home nuova (`website-creation/`)
**Branch:** `feature/website-creation`
**Stato precedente:** la sezione carica una demo pubblica di Spline via `@splinetool/viewer` (runtime + scena `.splinecode` da CDN di terze parti, ~3,5 MB, asset non nostro). `js/robot.js` mostra "Scena in arrivo…".

## Obiettivo

Sostituire la dipendenza Spline con una **scena three.js nostra** costruita sulla
**forma estratta** del robot Spline, arricchita da effetti nostri che la copy già
promette e che oggi non esistono: un **cervello di punti dentro la testa di vetro**
e **fibre luminose nelle braccia**. In produzione Spline sparisce del tutto.

La copy della sezione resta e finalmente diventa vera:
> «una scena 3D vera che gira nel browser: reagisce al mouse fotogramma per
> fotogramma, mentre scorri e mentre lo trascini. Dietro, il rame si accende dove passi.»

## Come nasce l'asset (già fatto nello spike)

- La geometria del robot Spline è stata **estratta** caricando la scena col runtime
  del `@splinetool/viewer` in un browser headless (Playwright), lasciandola
  **assemblare** (~9 s), raggiungendo la scena three.js interna (`_spline._scene`) ed
  esportandola con `GLTFExporter` (baking delle world matrix).
- Risultato: `website-creation/assets/robot-raw.glb` — **80 mesh, ~109k vertici,
  2,58 MB**, robot umanoide **completo e assemblato, con la testa**. Solo geometria:
  i materiali Spline (shader `NodeMaterial`) non sono esportabili e vengono
  ricostruiti da noi.
- **Caveat accettati dall'utente:** i materiali NON escono identici a Spline (si
  iterano per avvicinarsi); ed è comunque la forma dell'asset Spline (community demo).

## Vincolo architetturale portante

**Un solo contesto WebGL.** Il motivo per cui abbandoniamo Spline è proprio poter
avere cervello, testa di vetro e fibre **nella stessa scena**: due contesti WebGL non
condividono depth buffer, quindi il cervello non potrebbe stare "dentro" il vetro né
le fibre essere occluse dal braccio. Tutto vive in un'unica scena three.js.

## Fondazione tecnica

- **three.js r128 globale** (`window.THREE`), già caricato dalla home da cdnjs. La
  stessa revisione su cui gira Vesper → il cervello si riusa senza porting di versione.
- **Caricamento GLB:** GLTFLoader r128 + DRACOLoader r128, con decoder Draco
  **vendorizzato in locale** (`website-creation/vendor/draco/`). Il `robot-raw.glb`
  viene **compresso in Draco** → `robot.glb` (~300-500 KB atteso).
- **Canvas:** il `#wcRobotStage` già presente in `cap05`; niente nuovi nodi DOM.
- **Lazy-mount:** si riusa l'IntersectionObserver di `robot.js` (margine di una
  schermata) — il 3D si costruisce solo all'avvicinarsi della sezione.
- **Reduced-motion / no-WebGL:** resta la card statica con la copy, come già oggi.
- **Cleanup:** dispose di geometrie/materiali/renderer e rimozione listener al
  dismontaggio (pattern già presente in `robot.js`/altri capitoli).
- **Rimozione Spline:** via `VIEWER`, `VIEWER_SRI`, `SCENE`, il mount del custom
  element e i relativi commenti in `js/robot.js`.

## Componenti

### 1. Modello e sotto-parti
- Caricato il GLB, si **isola il gruppo "testa"** dalle altre mesh. Metodo: prima per
  **nome** (le mesh esportate conservano i nomi Spline); in mancanza, per **posizione**
  (le mesh il cui centro sta sopra la soglia del collo, dedotta dal bounding box).
- Le mesh vengono raggruppate in due insiemi logici: `head` (testa di vetro) e `body`
  (tutto il resto). Le braccia si isolano allo stesso modo per ancorare le fibre.

### 2. Materiali (la ri-verniciatura)
- **Corpo/arti:** `MeshStandardMaterial` quasi-nero, roughness bassa, con normal map a
  trama esagonale (tiling) per richiamare il carbonio Spline. Un `envMap` leggero
  (equirect piccola, inline o generata) per i riflessi.
- **Testa — visore scuro Spline con lente Lithos (CORREZIONE utente 2026-08-31):**
  a riposo la testa è un **visore scuro, opaco e riflettente** come lo Spline —
  NON traslucida, niente interni visibili. Serve un **envMap** (piccola equirect
  gradiente/studio) perché il nero legga come vetro lucido e non come nero piatto:
  è il riflesso, non lo schiarimento, a far vedere che è vetro su fondo nero.
  Il reveal del cervello **non** è più un'apertura globale (`uOpen`): è una
  **lente locale alla Lithos** — dove il cursore passa **sulla testa**, una
  finestra morbida rende il vetro trasparente **solo lì** e fa vedere il cervello
  sotto; la finestra **segue il cursore** e si chiude appena esci dalla testa.
  Implementazione: raycast del cursore sulle mesh testa → punto colpito passato
  come uniform allo shader del vetro; il fragment calcola la distanza dal punto e
  apre con un falloff (raggio + morbidezza). Fuori dalla testa: opaco ovunque.
  Il corpo/arti restano il carbonio scuro già fatto (già Spline-like).

### 3. Cervello Vesper dentro la testa
- Si porta la nuvola di punti del `brain/` di Vesper (in `js/vesper.js`) come
  `THREE.Points`, fattorizzando la parte di **campionamento della mesh** e lo shader
  dei punti in un helper condiviso, così `vesper.js` e `robot.js` usano lo stesso codice.
- Posizionato **in alto, nel cranio** (non al centro del bbox testa, che col collo
  incluso lo tira all'altezza della mascella): offset verso l'alto della cavità
  cranica, tarato sul bounding box della testa.
- **Imparentato al gruppo-testa** (`headGroup.add(brain)`) → si muove in sincrono col
  movimento della testa. **Requisito esplicito dell'utente.**
- **Reveal alla Lithos (CORREZIONE 2026-08-31):** il cervello è **spento/invisibile**
  di default (la testa è il visore scuro). Compare **solo sotto la lente locale** che
  segue il cursore quando passa sulla testa — stesso segnale che apre il vetro (il
  punto colpito dal raycast + falloff). Fuori dalla testa: cervello spento. «Si vede
  solo dove ci passo sopra col mouse», come Lithos scopre l'immagine sotto.

### 4. Testa che segue il cursore
- Il `headGroup` ruota verso il puntatore con **yaw/pitch clampati** in un range
  stretto e **smorzati** (lerp per-frame). A riposo (nessun movimento) torna piano al
  centro con un leggero "respiro".
- La rotazione della testa che segue il cursore è **indipendente** dal reveal: la
  testa gira dietro al cursore anche da **visore chiuso** (come lo Spline). È solo la
  **lente locale** (raycast sulla testa) ad aprire il vetro e accendere il cervello,
  non il facing globale. La testa segue sempre; il cervello appare solo sotto la lente.

### 5. Fibre nelle braccia (i fasci)
- Per ciascun braccio, una o più **curve** (CatmullRom) che seguono l'arto spalla→mano,
  materializzate come `TubeGeometry` sottile (o linee con spessore) con materiale
  **emissivo animato**: scroll di una UV/gradiente lungo la curva = corrente che scorre,
  con pulsazione.
- **Legate al `circuit`** di `js/cursorfx.js`: la corrente si accende/accelera al
  **passaggio** del cursore sul braccio (non sotto la posizione ferma), coerente col
  comportamento già descritto per la sezione.
- Le curve sono ancorate ai punti-chiave delle braccia ricavati dal modello (spalla,
  gomito, polso) così restano incollate all'arto anche mentre il robot ruota.

### 6. Interazione e moto
- **Robot intero:** levitazione a riposo (bob verticale lento) + **drag-to-rotate**
  (yaw sul trascinamento, con inerzia e ritorno morbido). La copy lo promette.
- **Testa:** segue il cursore (§4), indipendente dalla rotazione da drag.
- **Fibre:** flusso continuo + accensione al passaggio (§5).
- **Cervello:** reveal all'hover (§3).

## Peso e prestazioni
- GLB in Draco (decoder locale), lazy-mount, un solo contesto, `THREE.Points` per il
  cervello (economico), tube sottili per le fibre. Target: la sezione non costa nulla
  finché non ci si avvicina; a regime un solo modello + due sistemi leggeri.

## Fuori scope (YAGNI)
- Nessun rig/animazione scheletrica del robot (niente camminata): il modello è statico,
  vive di rotazione, levitazione, testa-che-segue e degli effetti interni.
- Niente post-processing (bloom): r128 core non lo porta; l'emissione delle fibre e del
  cervello si regge su materiali additivi, come Vesper.
- Nessun cambio alla copy della sezione (già coerente).

## Criteri di riuscita
1. In `cap05` compare il robot **nostro** (GLB), zero richieste a `spline.design`/`unpkg`.
2. La testa **segue il cursore**; il **cervello dentro la testa si muove in sincrono** e
   **si accende all'hover**.
3. Le **fibre** scorrono nelle braccia e reagiscono al passaggio del cursore.
4. **Drag-to-rotate** + levitazione funzionano.
5. Reduced-motion → resta la card statica. Console pulita. Cleanup senza leak.

## Rischi noti
- **Isolamento testa/braccia dal GLB:** se i nomi Spline non bastano, si ripiega sulla
  posizione (bounding box). Verificare presto.
- **Vetro Fresnel su mesh curva:** la taratura delle card (piano) va rifatta; iterazione
  a schermo necessaria.
- **Fedeltà materiali:** dichiaratamente non identici a Spline; si itera.
- **Verifica headless senza GPU/H.264:** come sempre, alcune cose si vedono solo su
  browser vero — da segnalare, non dare per verificato ciò che l'headless non mostra.
