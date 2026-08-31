# Sotto-costellazione degli effetti speciali — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Trasformare `/atelier/capitoli` da scroll lineare a una seconda costellazione: gli effetti orbitano attorno alla DNA helix, raggruppati per tipo, con scroll infinito; la card a fuoco fa girare l'effetto vivo.

**Architecture:** È un **fork di `atelier/index.html`** (che ha già tutta la macchina del fuoco: deck, didascalia, dots, lista laterale, vetro). Nel fork si scambiano tre cose: (1) lo sfondo — la pozza Mirror Hall → la **DNA helix** di `js/dna.js`; (2) il percorso — l'anello → un'**elica con cluster** e scroll infinito; (3) il contenuto della card a fuoco — `playOn(video)` → `wake(modulo-effetto)`, un layer HTML sopra il rettangolo proiettato della card che monta il canvas/DOM dell'effetto e ne attiva il rAF. Si costruisce in un file nuovo (`effetti.html`) e si **scambia in produzione solo alla fine**, così la home e i capitoli restano vivi durante il lavoro.

**Tech Stack:** Vanilla JS, three.js r128 UMD globale, gsap + ScrollTrigger + Lenis, il registry `window.WC` (`js/core.js`). Nessun build step, nessun framework. Nessun test unitario: **la verifica è a schermo** con playwright headless (chromium swiftshader) — console pulita, niente 404, niente host esterni, screenshot al punto di fuoco.

**Spec:** `docs/superpowers/specs/2026-08-31-atelier-effetti-sottocostellazione-design.md`

## Global Constraints

- **three r128 UMD globale** (`window.THREE`) — nessun modulo ES three, nessuna versione diversa. Il fork eredita lo stack di `capitoli.html`/`index.html`.
- **`<base href="/atelier/">`** obbligatorio in ogni pagina servita: gli asset e i sotto-percorsi vivono un livello sotto.
- **Un solo contesto WebGL _heavy_ vivo per volta.** L'elica (medium) è l'unico sempre-vivo; l'effetto a fuoco è il secondo contesto e va **sospeso** (rAF fermo, poster congelato) appena esce dal fuoco. Contratto di gating già in casa: `start()`/`stop()` pilotati come fa `js/saucer.js` (`onToggle: isActive ? start() : stop()` + `visibilitychange`).
- **Tinta delle scene via CONFIG, mai shader.** Ciano-atelier `[0.23,0.85,1.00]`.
- **Niente host esterni** oltre Google Fonts. Nessun hotlink a bucket.
- **`prefers-reduced-motion`**: niente giro continuo, costellazione ferma, navigazione a passi. Deve raggiungere anche i loop canvas (non basta il flag di gsap).
- **Verifica a schermo** ad ogni task con l'harness del repo (vedi "Harness di verifica"), desktop 1440×900 **e** telefono 390×844. Il limite noto: Chromium headless non ha H.264 → i `.mp4` danno `SRC_NOT_SUPPORTED`, non è un guasto della pagina; dove serve, i media hanno anche `<source>` WebM.

---

## Harness di verifica (vale per ogni task)

Serve la radice del repo e apre la pagina in chromium swiftshader, salta il sipario in modo deterministico con `reducedMotion:'reduce'`, cattura console + screenshot. Node modules in `~/axxell-chatbot/node_modules` (playwright già installato lì, come nei blocchi precedenti). Script base in scratchpad:

```js
// scratchpad/shot-effetti.js
const { chromium } = require('/Users/alexgatti/axxell-chatbot/node_modules/playwright');
(async () => {
  const url = process.argv[2] || 'http://localhost:8791/atelier/effetti.html';
  const out = process.argv[3] || '/tmp/effetti.png';
  const reduce = process.argv[4] === 'reduce';
  const b = await chromium.launch({ args: ['--use-gl=swiftshader'] });
  const p = await (await b.newContext({ viewport:{width:1440,height:900}, reducedMotion: reduce?'reduce':'no-preference' })).newPage();
  const errs = [];
  p.on('console', m => { if (m.type()==='error') errs.push(m.text()); });
  p.on('requestfailed', r => errs.push('REQFAIL '+r.url()+' '+(r.failure()&&r.failure().errorText)));
  await p.goto(url, { waitUntil:'networkidle' });
  await p.waitForTimeout(2500);
  await p.screenshot({ path: out });
  console.log('ERRORS:', errs.length ? JSON.stringify(errs, null, 2) : 'none');
  await b.close();
})();
```

Serve la radice (una volta): `cd ~/axxell-site-3 && python3 -m http.server 8791` in background.
Esegui: `node scratchpad/shot-effetti.js http://localhost:8791/atelier/effetti.html /tmp/e.png` (aggiungi `reduce` per saltare il sipario). **Criterio "verde" di ogni task**: `ERRORS: none` (salvo l'avviso `ReadPixels` di swiftshader, ambientale) e lo screenshot mostra ciò che il task promette. Aprire lo screenshot con Read.

---

## Struttura dei file

- **Create** `atelier/effetti.html` — il fork di `index.html`. Tutta l'esperienza vive qui finché non si scambia (Task 9).
- **Create** `atelier/js/effetti-deck.js` — i record `EFFETTI`, la parametrizzazione dell'elica (`helixPlace`), lo scroll infinito, il controller di risveglio (`wake`/`freeze`). Estratto in un modulo per tenere `effetti.html` leggibile; registrato come `WC.register('effetti', …)`.
- **Modify** `atelier/js/dna.js` — renderla ri-collocabile al centro-scena via opzioni, senza rompere l'uso attuale nel manifesto (parametri con default = comportamento di oggi).
- **Reuse (read-only)** i moduli effetto: `js/saucer.js`, `js/vesper.js`, `js/orologio.js`, `js/altitude.js`, `js/lithos.js`, `js/warp.js`. Vanno resi attivabili a comando (Task 5) senza dipendere dal loro `ScrollTrigger` di sezione.
- **Create** `atelier/capitoli-legacy.html` — copia dell'attuale `capitoli.html` conservata (Task 8–9), per le pagine di dettaglio.
- **Modify** `vercel.json` — rewrite `/atelier/capitoli/:effetto → /atelier/capitoli` (Task 8).
- **Modify** `atelier/index.html` — nulla, se non eventualmente poster/etichetta della card «Effetti speciali» (fuori scope stretto).

---

## FASE 0 — Il palco: pagina + elica al centro

### Task 1: Fork della pagina e stage vuoto

**Files:**
- Create: `atelier/effetti.html` (fork di `atelier/index.html`)
- Test: `scratchpad/shot-effetti.js`

**Interfaces:**
- Produces: la pagina `effetti.html` che carica lo stack (`core.js`, `nav.js`, `loader.js`, three r128, gsap/ScrollTrigger/lenis), con `<base href="/atelier/">`, un `<canvas>` di stage a tutto schermo e il markup del fuoco (`#focus`, la lista laterale) presi da `index.html`, ma **senza** la pozza Mirror Hall e **senza** l'array WORLDS attivo (deck spento dietro un flag).

- [ ] **Step 1: Copia il file**
  `cp atelier/index.html atelier/effetti.html`
- [ ] **Step 2: Togli la pozza Mirror Hall dal render.** In `effetti.html` individua i tre passaggi di render (riflesso→`reflectRT`, piatto→`rt`, finale con l'acqua) e il codice del `Reflector`/onde. Sostituisci il render a un **solo passaggio** che disegna solo lo sfondo (nero) — il deck e l'elica arrivano dopo. Lascia le funzioni del vetro definite ma non chiamare il deck (guardia `if (DECK_ON)` a `false`).
- [ ] **Step 3: `<title>` e testo.** Titolo «Effetti speciali — Atelier»; la lista laterale «CHE COSA CERCHI?» diventa «CHE COSA TI MOSTRO?» (le voci arrivano al Task 3).
- [ ] **Step 4: Verifica a schermo.** Avvia il server; `node scratchpad/shot-effetti.js http://localhost:8791/atelier/effetti.html /tmp/t1.png reduce`. Atteso: `ERRORS: none`, schermo nero con nav e `#focus` vuoto. Apri `/tmp/t1.png`.
- [ ] **Step 5: Commit**
  `git add atelier/effetti.html && git commit -m "feat(atelier/effetti): fork della pagina, stage vuoto senza la pozza"`

### Task 2: La DNA helix come asse al centro

**Files:**
- Modify: `atelier/js/dna.js` (parametri di collocazione con default retro-compatibili)
- Modify: `atelier/effetti.html` (monta l'elica; carica `js/dna.js`)

**Interfaces:**
- Consumes: il modulo `dna` (`WC.register('dna', …)`), il suo `CONFIG` (`scrollClimb`, `spin`, `scrollSpin`, `parallax`, colori), la camera a `z=8.67` su origine, la size dal rettangolo di un elemento pin.
- Produces: l'elica visibile al **centro** della scena di `effetti.html`, tinta ciano, che sale/gira con lo scroll globale (Lenis), sempre-viva. Espone un `data-role="helix-stage"` come elemento di misura al posto di `#wcManifestoPin`.

- [ ] **Step 1: Rendi `dna.js` ri-collocabile.** Aggiungi al modulo un lettura opzionale dell'elemento di montaggio e dell'offset orizzontale: se esiste `#wcManifestoPin` (manifesto) usa quello e l'offset di destra di oggi; altrimenti cerca `[data-role="helix-stage"]` e centra (offsetX = 0). Default = comportamento attuale. **Non toccare** `CONFIG.scrollClimb/spin/scrollSpin` (la forma è quella).
- [ ] **Step 2: Monta in `effetti.html`.** Aggiungi il `<canvas>` dell'elica + un contenitore `data-role="helix-stage"` a tutto schermo dietro il deck; assicurati che `js/dna.js` sia nella lista `<script>`. Tinta ciano via `CONFIG` (non shader).
- [ ] **Step 3: Lega lo scroll.** L'elica di `dna.js` legge `scrollTarget` dal proprio ScrollTrigger di sezione; qui non c'è sezione pinnata. Collega `scrollTarget` allo scroll globale di Lenis (progress 0..1 su un'altezza di scroll fittizia impostata in `effetti.html`). Verifica che l'elica salga scrollando.
- [ ] **Step 4: Verifica a schermo.** `node scratchpad/shot-effetti.js … /tmp/t2.png` con e senza `reduce`. Atteso: elica ciano di punti additivi al centro, console pulita. Con reduced-motion: ferma ma presente. Apri lo screenshot; confronta che i punti siano centrati, non a destra.
- [ ] **Step 5: Commit**
  `git add atelier/js/dna.js atelier/effetti.html && git commit -m "feat(atelier/effetti): la DNA helix diventa l'asse centrale"`

---

## FASE 1 — Le card sull'elica (poster, ancora senza effetti vivi)

### Task 3: Record degli effetti, cluster, e le card sul percorso dell'elica

**Files:**
- Create: `atelier/js/effetti-deck.js`
- Modify: `atelier/effetti.html` (carica il modulo; accende `DECK_ON`)

**Interfaces:**
- Consumes: le funzioni del vetro e del deck ereditate da `index.html` (`deckYaw`, `deckScale`, `deckFade`, `aggiornaFocus`, `resize`, il materiale-vetro), `WORLDS`→sostituito da `EFFETTI`.
- Produces:
  - `EFFETTI` — array di 7 record: `{ id, nome, tipo, cluster, modulo, poster, col, render }` dove `render ∈ {'webgl','canvas2d','dom'}` e `modulo` è il nome WC (`'saucer'` ecc.).
  - `helixPlace(u, out)` — posizione della card lungo l'elica (rimpiazza `deckPlace`): `out.set(A*sin(phase), yTop - u*climb, -R + A*cos(phase))` con `phase = u*turns*2π`; costante `A` (raggio dell'elica), `climb`, `turns`, `R` da tarare a schermo.
  - `CLUSTERS` — 5 gruppi contigui con range di `u` e colore; ogni effetto sa a quale cluster appartiene.

```js
// atelier/js/effetti-deck.js  (estratto dei dati — i numeri di helixPlace si tarano allo Step 4)
window.EFFETTI = [
  { id:'altitude', nome:'La piega',     tipo:'Fluidi',              cluster:0, modulo:'altitude', render:'webgl',   poster:'assets/effetti/altitude.webp',  col:[0.36,0.80,1.00] },
  { id:'sneaker',  nome:'La scarpa',    tipo:'Immagini animate',    cluster:1, modulo:'sneaker',  render:'webgl',   poster:'assets/effetti/sneaker.webp',   col:[0.60,0.85,1.00] },
  { id:'orologio', nome:'Il vetro',     tipo:'Immagini animate',    cluster:1, modulo:'orologio', render:'webgl',   poster:'assets/effetti/orologio.webp',  col:[0.60,0.85,1.00] },
  { id:'vesper',   nome:'Il modello',   tipo:'Modelli interattivi', cluster:2, modulo:'vesper',   render:'webgl',   poster:'assets/effetti/vesper.webp',    col:[0.23,0.85,1.00] },
  { id:'saucer',   nome:'Il disco',     tipo:'Modelli interattivi', cluster:2, modulo:'saucer',   render:'webgl',   poster:'assets/effetti/saucer.webp',    col:[0.23,0.85,1.00] },
  { id:'warp',     nome:'Il testo',     tipo:'Testo',               cluster:3, modulo:'warp',     render:'dom',     poster:'assets/effetti/warp.webp',      col:[0.85,0.70,1.00] },
  { id:'lithos',   nome:'Prima e dopo', tipo:'Prima / dopo',        cluster:4, modulo:'lithos',   render:'canvas2d',poster:'assets/effetti/lithos.webp',    col:[0.98,0.78,0.52] }
];
window.CLUSTERS = [
  { tipo:'Fluidi',               col:[0.36,0.80,1.00] },
  { tipo:'Immagini animate',     col:[0.60,0.85,1.00] },
  { tipo:'Modelli interattivi',  col:[0.23,0.85,1.00] },
  { tipo:'Testo',                col:[0.85,0.70,1.00] },
  { tipo:'Prima / dopo',         col:[0.98,0.78,0.52] }
];
```

- [ ] **Step 1: Genera i poster.** Con lo script `poster.js` già usato per i mondi (scratchpad), cattura un fotogramma vero di ciascun effetto da `capitoli.html`, salva in `atelier/assets/effetti/<id>.webp` (lato lungo ≤1200, `cwebp -q 80`). 7 file.
- [ ] **Step 2: Scrivi `effetti-deck.js`** con `EFFETTI`, `CLUSTERS`, e `helixPlace` (numeri iniziali: `A=1.3, R=3.0, turns=2.5, climb=0.9, yTop=1.4`). Registra `WC.register('effetti', initFn)`; `initFn` sostituisce l'uso di `WORLDS`/`deckPlace` con `EFFETTI`/`helixPlace`, tenendo `deckYaw` (la card guarda la camera al fuoco), `deckScale`, `deckFade`. Accendi `DECK_ON=true`.
- [ ] **Step 3: Colora i cluster.** Ogni card prende `col` dal suo cluster; il tratto d'elica sotto un cluster non serve tingerlo ora (opzionale, Task futuro).
- [ ] **Step 4: Tara `helixPlace` a schermo.** Criteri, verificati sullo screenshot: (a) la card a fuoco (u=0) è **frontale e centrata**, ingrandita; (b) si vedono almeno **3–4 card** in scorcio ai lati che si accumulano verso il punto di fuga; (c) le card **si sovrappongono** (il vetro ha qualcosa da rifrangere); (d) l'elica resta visibile fra/dietro le card, non coperta. Muovi `A/R/turns/climb` finché tutti e quattro reggono; annota i numeri in un commento (come le tarature storiche dell'atelier).
- [ ] **Step 5: Verifica a schermo** desktop **e** 390×844 (su verticale stringi il passo, come fa `resize()` nella home). `ERRORS: none`, 7 card, fuoco frontale. Apri entrambi gli screenshot.
- [ ] **Step 6: Commit**
  `git add atelier/js/effetti-deck.js atelier/effetti.html atelier/assets/effetti && git commit -m "feat(atelier/effetti): 7 card sui cluster dell'elica, poster congelati"`

### Task 4: Scroll infinito, contatore e lista dei tipi

**Files:**
- Modify: `atelier/js/effetti-deck.js`
- Modify: `atelier/effetti.html` (lista laterale)

**Interfaces:**
- Consumes: `EFFETTI`, `helixPlace`, `aggiornaFocus`, `pickRiga` (dalla home), lo scroll di Lenis.
- Produces: uno scorrimento che avanza la posizione `pos` lungo l'elica **senza fondo** (si riavvolge), il `#focus` con `NN/07` + nome + tipo, la lista dei **5 tipi** che porta al primo effetto del gruppo, e la navigazione a passi su reduced-motion.

- [ ] **Step 1: Scroll infinito.** Introduci un accumulatore `pos` (float) avanzato dallo scroll/gesto; le card usano `u = wrapN(i - pos, EFFETTI.length)` (già presente come `deckU`). La coda si riavvolge dove `deckFade` la spegne (verifica che il salto capo↔coda avvenga **fuori vista**). L'elica (`dna.js`) continua a salire con lo stesso `pos` così elica e card scorrono insieme.
- [ ] **Step 2: Contatore + didascalia.** `aggiornaFocus` mostra `String(idx+1).padStart(2,'0') + '/07'`, il `nome` con blur-rise swap (riusa quello della home) e il `tipo` sotto. I dots a capsula = 7, colore del cluster.
- [ ] **Step 3: Lista dei tipi.** In `effetti.html` la lista laterale elenca i 5 `CLUSTERS[].tipo`; cliccando una voce, `pickRiga`-style, porta a `pos` del **primo effetto** di quel cluster (anima `pos`, non salta).
- [ ] **Step 4: Reduced-motion.** Con `!WC.motionOk`: niente giro continuo dell'elica, `pos` si muove solo a passi (frecce tastiera + clic lista/dots). Verifica che nessun rAF continui a girare l'elica.
- [ ] **Step 5: Verifica a schermo.** Simula scroll (`p.mouse.wheel(0, 1200)` a passi) e controlla che il contatore avanzi, che dopo 7 passi si torni a `01/07` senza scatti visibili, console pulita. Screenshot a due posizioni diverse.
- [ ] **Step 6: Commit**
  `git add atelier/js/effetti-deck.js atelier/effetti.html && git commit -m "feat(atelier/effetti): scroll infinito, contatore NN/07 e lista dei tipi"`

---

## FASE 2 — Il risveglio dell'effetto a fuoco

### Task 5: Il controller wake/freeze, provato su UN effetto WebGL (saucer)

**Files:**
- Modify: `atelier/js/effetti-deck.js` (controller `wake`/`freeze`)
- Modify: `atelier/js/saucer.js` (attivazione a comando, non solo da ScrollTrigger)
- Modify: `atelier/effetti.html` (layer `#stage-live`)

**Interfaces:**
- Consumes: il contratto WC dei moduli effetto — un `start()` che fa `raf=requestAnimationFrame(frame)` e uno `stop()` che lo ferma (come `js/saucer.js` righe ~1078–1100).
- Produces:
  - `#stage-live` — un contenitore HTML assoluto, sopra il canvas dello stage, riposizionato ogni frame sul **rettangolo proiettato** della card a fuoco.
  - `wake(effetto)` — monta/rende visibile il canvas/DOM del `modulo` dell'effetto dentro `#stage-live` e chiama il suo `start()`; `freeze()` chiama `stop()`, nasconde il layer, lascia il poster della card. Un solo effetto sveglio per volta.
  - In `saucer.js`: un modo di essere avviato **senza** il suo ScrollTrigger di sezione (una API `WC.effect('saucer').start(container)` / `.stop()`), senza rompere l'uso in `capitoli-legacy.html`.

- [ ] **Step 1: Esponi start/stop manuali in `saucer.js`.** Rifattorizza il modulo perché `start(container)`/`stop()` siano invocabili da fuori: se gli viene passato un `container`, monta lì il suo canvas e non crea lo ScrollTrigger di sezione; se no, comportamento attuale. Registra un handle recuperabile (`WC.effects = WC.effects||{}; WC.effects.saucer = { start, stop, resize }`).
- [ ] **Step 2: Scrivi il controller** in `effetti-deck.js`: calcola il rettangolo proiettato della card a fuoco (usa la stessa proiezione della didascalia/`aggiornaFocus`), posiziona `#stage-live`, e quando l'indice a fuoco cambia: `freeze()` il precedente, `wake()` il nuovo **solo quando la card è a pieno fuoco** (`face≈1` e ferma da ~250ms — riusa la soglia "toccato && fermo" della home per non svegliare in transito).
- [ ] **Step 3: Collega solo `saucer`** (gli altri al Task 6–7 tornano no-op/poster). Verifica: portando il disco a fuoco, dopo la sosta parte l'animazione dentro la card; scorrendo via, si ferma e torna il poster.
- [ ] **Step 4: Gate di misura.** Con l'elica viva + il disco a fuoco, misura gli fps (inietta un contatore rAF, loggalo). Criterio: **≥50 fps desktop**. Se sotto: strozza il rAF dell'elica a 30fps quando un effetto è a pieno fuoco (aggiungi un `helix.throttle(true/false)` a `dna.js`). Documenta la misura nel commit.
- [ ] **Step 5: Verifica a schermo.** Console pulita, screenshot con il disco a fuoco che mostra il modello (non il poster). Nota il limite H.264 per gli effetti che usano video (non saucer).
- [ ] **Step 6: Commit**
  `git add atelier/js/effetti-deck.js atelier/js/saucer.js atelier/effetti.html && git commit -m "feat(atelier/effetti): controller wake/freeze, un solo effetto vivo a fuoco (saucer)"`

### Task 6: Gli altri effetti WebGL (vesper, orologio, altitude)

**Files:**
- Modify: `atelier/js/vesper.js`, `atelier/js/orologio.js`, `atelier/js/altitude.js`
- Modify: `atelier/js/effetti-deck.js` (registra i tre handle)

**Interfaces:**
- Consumes: `wake`/`freeze` del Task 5, `WC.effects`.
- Produces: `WC.effects.vesper`, `WC.effects.orologio`, `WC.effects.altitude`, ciascuno con `start(container)/stop()/resize()`, stessa API di `saucer`.

- [ ] **Step 1: `vesper`** — stessa rifattorizzazione start/stop del Task 5 Step 1. Attenzione ai media (`.glb`): niente hotlink, restano in `assets/`. Verifica a schermo (modello a fuoco).
- [ ] **Step 2: `orologio`** — idem; usa `assets/orologio/*.webp`, nessun video → sicuro anche headless. Verifica.
- [ ] **Step 3: `altitude`** — idem; usa `assets/starry.mp4` (headless: `SRC_NOT_SUPPORTED`, atteso). Assicura `<source>` WebM se presente; altrimenti la verifica del video è "su browser vero" e headless controlla solo console/mount.
- [ ] **Step 4: Verifica a schermo** dei tre, uno per volta a fuoco, con il gate di misura del Task 5 Step 4 su `vesper` (il più pesante). `ERRORS: none` (salvo H.264).
- [ ] **Step 5: Commit**
  `git add atelier/js/vesper.js atelier/js/orologio.js atelier/js/altitude.js atelier/js/effetti-deck.js && git commit -m "feat(atelier/effetti): risveglio di vesper, orologio, altitude a fuoco"`

### Task 7: Gli effetti non-WebGL (lithos canvas-2D, warp DOM)

**Files:**
- Modify: `atelier/js/lithos.js`, `atelier/js/warp.js`
- Modify: `atelier/js/effetti-deck.js`

**Interfaces:**
- Consumes: `#stage-live`, `wake`/`freeze`.
- Produces: `WC.effects.lithos` (canvas 2D nel rettangolo) e `WC.effects.warp` (overlay DOM allineato), stessa API `start(container)/stop()`.

- [ ] **Step 1: `lithos`** — la pittura del "dopo" è un canvas 2D (due tele, `globalCompositeOperation`). `start(container)` la monta nel rettangolo della card a fuoco, gestisce il puntatore solo quando è a fuoco; `stop()` congela il dipinto come poster. Verifica: si dipinge dentro la card a fuoco, il dipinto resta uscendo (poi congela).
- [ ] **Step 2: `warp`** — è testo DOM. `start(container)` inietta l'overlay DOM allineato al rettangolo (non un canvas); `stop()` lo rimuove e mostra il poster. Verifica l'allineamento a fuoco su desktop e verticale.
- [ ] **Step 3: Verifica a schermo** di entrambi. Console pulita, screenshot.
- [ ] **Step 4: Commit**
  `git add atelier/js/lithos.js atelier/js/warp.js atelier/js/effetti-deck.js && git commit -m "feat(atelier/effetti): risveglio di lithos (2D) e warp (DOM) a fuoco"`

---

## FASE 3 — Ingresso, uscita, e scambio in produzione

### Task 8: Pagine di dettaglio per-effetto e ingresso dalla card

**Files:**
- Create: `atelier/capitoli-legacy.html` (copia dell'attuale `capitoli.html`)
- Modify: `atelier/js/effetti-deck.js` (clic sulla card a fuoco → dettaglio)
- Modify: `vercel.json` (rewrite)

**Interfaces:**
- Consumes: `EFFETTI[].id`, il pattern History-API dei mondi (`location.href` a ~520ms sotto la copertura dello zoom, precaricamento al passaggio).
- Produces: `/atelier/capitoli/<effetto>` che apre la sezione di dettaglio di quell'effetto (dal file legacy, con deep-link all'ancora `#cap<Nome>`), e il ritorno `?da=effetti-speciali`.

- [ ] **Step 1: Conserva il legacy.** `cp atelier/capitoli.html atelier/capitoli-legacy.html`. Nel legacy, il link «Atelier» porta `?da=effetti-speciali`.
- [ ] **Step 2: Clic sulla card a fuoco.** In `effetti-deck.js`: clic su una card **di fianco** = la porta a fuoco (`pos`→quella); clic sulla card **a fuoco** = entra → `location.href = 'capitoli/' + id` (con `<base>`), coperto dallo zoom, precaricato al passaggio (riusa la logica della home: `toccato && fermo da 600ms`).
- [ ] **Step 3: Rewrite.** In `vercel.json` aggiungi `{"source":"/atelier/capitoli/:effetto","destination":"/atelier/capitoli-legacy"}` (o alla pagina di dettaglio scelta), così l'ingresso diretto non dà 404. Verifica il pattern con `vercel dev` o rileggendo la coerenza con i rewrite dei mondi già presenti.
- [ ] **Step 4: Verifica a schermo.** Giro: fuoco su un effetto → clic → dettaglio dell'effetto giusto; «Atelier» → torna con `?da=effetti-speciali`. `ERRORS: none`, nessun 404 (il 404 del prefetch senza estensione è atteso, come nella home).
- [ ] **Step 5: Commit**
  `git add atelier/capitoli-legacy.html atelier/js/effetti-deck.js vercel.json && git commit -m "feat(atelier/effetti): ingresso alle pagine di dettaglio e ritorno alla mappa"`

### Task 9: Sipario, e lo scambio: `effetti.html` diventa `/atelier/capitoli`

**Files:**
- Modify: `atelier/effetti.html` (coreografia d'ingresso)
- Rename/replace: `atelier/capitoli.html` ← contenuto di `effetti.html`
- Modify: `vercel.json` se serve aggiornare il rewrite al nuovo nome

**Interfaces:**
- Consumes: il loader/sipario già in `js/loader.js` (il velo col vapore della home, o il loader dei capitoli).
- Produces: `/atelier/capitoli` che serve la sotto-costellazione; il vecchio scroll lineare resta a `/atelier/capitoli-legacy` (le pagine di dettaglio).

- [ ] **Step 1: Coreografia d'ingresso.** Applica a `effetti.html` il sipario coerente col sito: gate al **via** dell'uscita del velo (contenuto entra _attraverso_), elica che entra dal basso in dissolvenza-a-punti (non un fade dell'intero oggetto). Segui `revealChoreography`.
- [ ] **Step 2: Verifica completa PRIMA dello scambio.** Giro intero su desktop **e** 390×844: sipario → costellazione → scroll infinito fra i 5 cluster → effetto vivo a fuoco per tutti e 7 → clic → dettaglio → ritorno. `ERRORS: none`, niente 404 estranei, niente host esterni oltre Google Fonts. Screenshot di ogni cluster.
- [ ] **Step 3: Lo scambio.** Il legacy esiste già dal Task 8 (`capitoli-legacy.html`), quindi qui basta far diventare il fork la pagina servita: `git mv atelier/effetti.html atelier/capitoli.html`. Aggiorna gli eventuali riferimenti al nome pagina (es. `js/effetti-deck.js` referenzia il proprio file? no; i `src` dei moduli sono relativi, non toccati). Verifica che `/atelier/capitoli` ora sia la costellazione e `/atelier/capitoli-legacy` (+ `#cap<Nome>`) il dettaglio, e che il rewrite del Task 8 punti a `capitoli-legacy`.
- [ ] **Step 4: La card della home.** In `index.html` la card «Effetti speciali» già punta a `/atelier/capitoli` — verifica che il giro home→sotto-costellazione→dettaglio→home regga end-to-end.
- [ ] **Step 5: Verifica finale a schermo** (desktop + telefono), console pulita ovunque, il giro completo dell'atelier (home → effetti → un dettaglio → ritorno) senza errori.
- [ ] **Step 6: Commit**
  `git add atelier/ vercel.json && git commit -m "feat(atelier/effetti): la sotto-costellazione diventa /atelier/capitoli; sipario e scambio"`

---

## Self-review (fatto in fase di scrittura)

- **Copertura spec**: asse elica (T2) · card=effetto vivo a fuoco (T5–7) · cluster lungo l'elica (T3) · scroll infinito (T4) · diventa la porta `/atelier/capitoli` (T9) · dettagli per-effetto (T8) · un contesto vivo + gate di misura (T5 Step 4) · reduced-motion (T4 Step 4) · coreografia (T9 Step 1). Tutte mappate.
- **Fuori scope** (spec): spine/robot/flowstate come pioli futuri — non compaiono in `EFFETTI` (7 record). Corretto.
- **Coerenza nomi**: `helixPlace`, `wake`/`freeze`, `WC.effects.<id>.start(container)/stop()/resize()`, `EFFETTI`, `CLUSTERS`, `DECK_ON` — usati coerenti fra i task.
- **Onestà sul metodo**: nessun test unitario (il codebase non ne ha); ogni task chiude con verifica a schermo playwright + console pulita, che è il metodo reale dell'atelier. I numeri visivi (`helixPlace`, tarature vetro) si trovano a schermo, come tutta la storia del progetto documenta.

Vedi memoria `[[project-atelier-costellazione]]`.
