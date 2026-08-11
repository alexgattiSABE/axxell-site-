# Website Creation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Costruire `axxell.ai/website-creation/`, una pagina vetrina autonoma che dimostra dal vivo le capacità di web design di Axxell, senza modificare il sito esistente oltre a due link.

**Architecture:** Documento HTML statico separato dentro `axxell-site/website-creation/`, con CSS e JS suoi divisi per responsabilità. Nessun build step: tutte le librerie arrivano da CDN. Il sito madre (`index.html`) riceve solo due aggiunte di link e nient'altro.

**Tech Stack:** HTML/CSS/JS vanilla · GSAP 3.13 + ScrollTrigger · Lenis 1.x · three.js r128 · lottie-web light 5.12 · EmailJS 4 — tutto da CDN.

## Global Constraints

- **`index.html` non si modifica** salvo le due aggiunte di link del Task 12. Nessuna riga esistente cambiata o rimossa. Verificato con `git diff`.
- **Nessun build step.** Niente npm, niente bundler, niente `package.json` in `axxell-site`.
- **three.js pinned a r128** (`https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js`) — stessa versione già usata da `index.html`. API non-module, `THREE` globale.
- **lottie-web build `lottie_light`**, mai il player pieno.
- **Niente plugin GSAP a pagamento.** SplitText non si usa: lo split del testo è scritto a mano (Task 4).
- **Ogni `<script>` da CDN porta `integrity="sha384-…"` e `crossorigin="anonymous"`.** Hash calcolati nel Task 1 Step 1b.
- **Niente asset in base64 inline.** È l'errore che ha portato `index.html` a 1.8MB.
- **Nessuna immagine generata da AI, nessun lavoro cliente** — asset procedurali (canvas/CSS/SVG) e Lottie soltanto.
- **Budget:** `website-creation/` sotto **500KB** esclusi i JSON Lottie.
- **`prefers-reduced-motion: reduce`** deve spegnere 3D, warp e shader e fermare i Lottie sul primo fotogramma, lasciando la pagina leggibile e navigabile.
- **Token di design** identici a `index.html`: `--bg:#060609` `--bg2:#0b0b12` `--bg3:#101019` `--white:#f0f0f6` `--muted:rgba(240,240,246,.72)` `--dim:rgba(240,240,246,.38)` `--cyan:#00d4ff` `--green:#00e8a2` `--border:rgba(255,255,255,.07)` `--border2:rgba(255,255,255,.13)`, font `'Space Grotesk',sans-serif` e `'DM Mono',monospace`.
- **Testi in italiano.** Nessun prezzo, nessun nome di cliente.
- **`:focus-visible` visibile su ogni elemento interattivo** — nav, CTA, card, campi form, stage interattivi. Invariante atelier, non negoziabile.
- **Target tattili ≥ 44px.**
- **Hover: un solo segnale per elemento** (atelier D20). Colore/opacità *oppure* `translateY` ≤ 2px, mai entrambi. Mai `scale` su elementi che spostano il layout.
- **Lenis solo su desktop** (atelier D2). Su mobile lo scroll di sistema resta nativo.
- **OG image 1200×630**, non il favicon.
- **Si animano solo `transform`, `opacity`, `filter`.**
- **Deroghe consapevoli registrate in `design.md`:** due sezioni pinnate invece di una (D4) e sei animazioni Lottie (D15). Decise dall'utente, motivate nel file. Non sono sviste: non "correggerle".
- **Branch:** `feature/website-creation`. Un commit per task.

### Ciclo di verifica (sostituisce il TDD)

`axxell-site` non ha test runner e non ne avrà uno: è un sito statico senza npm. Il ciclo per ogni task è:

1. Avviare il server locale (una volta per sessione):
   ```bash
   cd /c/Users/gatti/Desktop/axxell-site && python -m http.server 8899
   ```
   URL della pagina: `http://localhost:8899/website-creation/`
2. Verificare col **Playwright MCP**: `browser_navigate` → `browser_console_messages` (zero errori) → `browser_snapshot` → `browser_take_screenshot`.
3. Dove il task lo indica, controllo peso con `du`/`wc`.

Un task è finito quando la console è pulita, lo screenshot mostra il comportamento atteso, e il commit è fatto.

---

## Struttura dei file

```
axxell-site/
  index.html                    ← MODIFICATO solo nel Task 12 (2 aggiunte)
  sitemap.xml                   ← MODIFICATO solo nel Task 12 (1 <url>)
  website-creation/
    index.html                  ← markup dei 9 capitoli, nav, footer
    css/
      base.css                  ← token, reset, nav, footer, cursore, grana, tipografia
      sections.css              ← stili dei 9 capitoli
    js/
      core.js                   ← Lenis, GSAP, motion routing
      cursor.js                 ← cursore a stati, uno per capitolo
      warp.js                   ← cap. 01 — canvas warp
      manifesto.js              ← cap. 02 — scrub parola per parola
      scene3d.js                ← cap. 03 — three.js pinnato
      carousel.js               ← cap. 04 — marquee drag+inerzia
      bento.js                  ← cap. 05 — tilt magnetico + spotlight
      shader.js                 ← cap. 06 — distorsione WebGL
      horizontal.js             ← cap. 07 — scroll orizzontale pinnato
      form.js                   ← cap. 08 — EmailJS
    assets/
      logo-reveal.json          ← Lottie loader
      icon-*.json               ← Lottie icone bento
      success.json              ← Lottie conferma form
```

Ogni file JS espone **una sola funzione di init** e non tocca niente fuori dalla propria sezione. `core.js` le chiama tutte e passa loro il contesto motion.

---

### Task 1: Scaffolding, token, shell della pagina

**Files:**
- Create: `website-creation/index.html`
- Create: `website-creation/css/base.css`
- Test: verifica browser via Playwright MCP

**Interfaces:**
- Consumes: niente (primo task)
- Produces: la shell HTML con `<nav>`, `<main>` vuoto, `<footer>`, gli elementi `#cur` e `#curR` del cursore, e i token CSS in `:root`. Tutti i task successivi aggiungono `<section>` dentro `<main id="wc-main">`.

- [ ] **Step 1: Verificare che tutti gli URL CDN rispondano**

Questo va fatto **prima** di scrivere codice: un CDN sbagliato fa fallire task lontani in modo confuso.

```bash
for u in \
  "https://cdn.jsdelivr.net/npm/gsap@3.13.0/dist/gsap.min.js" \
  "https://cdn.jsdelivr.net/npm/gsap@3.13.0/dist/ScrollTrigger.min.js" \
  "https://cdn.jsdelivr.net/npm/lenis@1.1.20/dist/lenis.min.js" \
  "https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js" \
  "https://cdnjs.cloudflare.com/ajax/libs/lottie-web/5.12.2/lottie_light.min.js" \
  "https://cdn.jsdelivr.net/npm/@emailjs/browser@4/dist/email.min.js" ; do
  printf "%s -> " "$u"; curl -s -o /dev/null -w "%{http_code}\n" "$u"
done
```

Atteso: `200` su tutte e sei. Se una fallisce, correggere la versione **nel piano e in tutti i task** prima di proseguire.

- [ ] **Step 1b: Calcolare gli hash SRI**

Senza Subresource Integrity, una CDN compromessa esegue codice arbitrario sul dominio
`axxell.ai`. `index.html` oggi carica three.js e EmailJS senza SRI: quel debito non lo
sistemiamo qui (toccherebbe il sito madre), ma la pagina nuova nasce protetta.

```bash
for u in \
  "https://cdn.jsdelivr.net/npm/gsap@3.13.0/dist/gsap.min.js" \
  "https://cdn.jsdelivr.net/npm/gsap@3.13.0/dist/ScrollTrigger.min.js" \
  "https://cdn.jsdelivr.net/npm/lenis@1.1.20/dist/lenis.min.js" \
  "https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js" \
  "https://cdnjs.cloudflare.com/ajax/libs/lottie-web/5.12.2/lottie_light.min.js" \
  "https://cdn.jsdelivr.net/npm/@emailjs/browser@4/dist/email.min.js" ; do
  h=$(curl -sL "$u" | openssl dgst -sha384 -binary | openssl base64 -A)
  echo "$u"
  echo "  integrity=\"sha384-$h\" crossorigin=\"anonymous\""
done
```

Ogni `<script src="https://...">` di questa pagina — in questo task e in tutti i
successivi — porta gli attributi `integrity` e `crossorigin` così ottenuti. Gli script
locali (`js/*.js`) non ne hanno bisogno: sono serviti dallo stesso dominio.

Se un hash non combacia al caricamento, il browser blocca lo script e la console mostra
`Failed to find a valid digest`. In quel caso ricalcolare: la CDN ha cambiato il file.

- [ ] **Step 2: Creare `website-creation/css/base.css`**

```css
:root{
  --bg:#060609;--bg2:#0b0b12;--bg3:#101019;
  --border:rgba(255,255,255,.07);--border2:rgba(255,255,255,.13);
  --white:#f0f0f6;--muted:rgba(240,240,246,.72);--dim:rgba(240,240,246,.38);
  --cyan:#00d4ff;--green:#00e8a2;
  --font:'Space Grotesk',sans-serif;--mono:'DM Mono',monospace;
  --nav-h:72px;
}
*{margin:0;padding:0;box-sizing:border-box;}
html{-webkit-font-smoothing:antialiased;}
body{background:var(--bg);color:var(--white);font-family:var(--font);
  font-size:15px;line-height:1.6;overflow-x:hidden;}

/* GRANA — identica al sito madre */
body::after{content:'';position:fixed;inset:0;z-index:1;pointer-events:none;
  background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='300' height='300'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.75' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='300' height='300' filter='url(%23n)' opacity='0.028'/%3E%3C/svg%3E");}

/* CURSORE — identico al sito madre */
.cursor{position:fixed;width:8px;height:8px;background:var(--cyan);border-radius:50%;
  pointer-events:none;z-index:9999;transform:translate(-50%,-50%);
  transition:width .2s,height .2s;mix-blend-mode:screen;}
.cursor-ring{position:fixed;width:32px;height:32px;border:1px solid rgba(0,212,255,.4);
  border-radius:50%;pointer-events:none;z-index:9998;transform:translate(-50%,-50%);
  transition:width .3s,height .3s,border-color .3s;mix-blend-mode:screen;}
@media (pointer:coarse){.cursor,.cursor-ring{display:none;}}

/* NAV */
nav{position:fixed;top:0;left:0;right:0;z-index:200;height:var(--nav-h);
  display:flex;align-items:center;justify-content:space-between;padding:0 3rem;
  background:rgba(6,6,9,.9);backdrop-filter:blur(20px);
  border-bottom:1px solid var(--border);}
.nav-logo{font-weight:700;font-size:.95rem;letter-spacing:.06em;text-transform:uppercase;
  color:var(--white);text-decoration:none;}
.nav-logo span{color:var(--cyan);}
.nav-links{display:flex;list-style:none;gap:1.4rem;}
.nav-links a{color:var(--muted);text-decoration:none;font-size:.88rem;font-weight:500;}
.nav-links a:hover,.nav-links a.active{color:var(--cyan);}

/* TIPOGRAFIA */
.eyebrow{font-family:var(--mono);font-size:.7rem;letter-spacing:.18em;
  text-transform:uppercase;color:var(--cyan);}
h1,h2{font-weight:600;line-height:1.05;letter-spacing:-.02em;}
h1{font-size:clamp(2.6rem,7vw,5.5rem);}
h2{font-size:clamp(1.8rem,4vw,3rem);}
.lead{color:var(--muted);font-size:clamp(1rem,1.6vw,1.15rem);max-width:56ch;}

section{position:relative;z-index:2;padding:clamp(5rem,12vh,9rem) clamp(1.5rem,5vw,4rem);}

/* FOOTER */
footer{position:relative;z-index:2;border-top:1px solid var(--border);
  padding:2.5rem clamp(1.5rem,5vw,4rem);
  display:flex;flex-wrap:wrap;gap:1rem;justify-content:space-between;
  font-size:.82rem;color:var(--dim);}
footer a{color:var(--muted);text-decoration:none;}
footer a:hover{color:var(--cyan);}
```

- [ ] **Step 3: Creare `website-creation/index.html`**

I tag `<script>` delle sezioni non ancora costruite restano **fuori** finché il task che le crea non li aggiunge — un 404 su uno script rompe la verifica console dei task successivi.

**I blocchi di codice di questo piano mostrano i `<script>` CDN senza `integrity` per
leggibilità.** Non copiarli così: ogni `<script src="https://…">` di questa pagina, in
questo task e in tutti i successivi, va scritto con gli attributi calcolati allo Step 1b:

```html
<script src="https://…" integrity="sha384-<hash calcolato>" crossorigin="anonymous"></script>
```

Vale per GSAP, ScrollTrigger, Lenis, three.js, lottie\_light ed EmailJS. Gli script
locali `js/*.js` non ne hanno bisogno.

```html
<!DOCTYPE html>
<html lang="it">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Website Creation | Axxell</title>
<meta name="description" content="Siti web su misura progettati e costruiti da Axxell. Questa pagina è il portfolio: ogni sezione dimostra una capacità diversa.">
<meta name="robots" content="index, follow">
<link rel="icon" type="image/png" href="/favicon.png">
<meta property="og:title" content="Website Creation | Axxell">
<meta property="og:description" content="Siti web su misura. Questa pagina è il portfolio.">
<meta property="og:url" content="https://axxell.ai/website-creation/">
<meta property="og:type" content="website">
<meta property="og:image" content="https://axxell.ai/favicon.png">
<link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@300;400;500;600;700&family=DM+Mono:wght@400;500&display=swap" rel="stylesheet">
<link rel="stylesheet" href="css/base.css">
<link rel="stylesheet" href="css/sections.css">
</head>
<body>

<div class="cursor" id="cur"></div>
<div class="cursor-ring" id="curR"></div>

<nav>
  <a href="/" class="nav-logo">AXX<span>ELL</span></a>
  <ul class="nav-links">
    <li><a href="/">Home</a></li>
    <li><a href="/website-creation/" class="active">Website Creation</a></li>
  </ul>
</nav>

<main id="wc-main">
  <!-- i capitoli vengono aggiunti dai Task 3-11 -->
</main>

<footer>
  <span>© 2026 Axxell AI</span>
  <span>Reggio Emilia, Italia</span>
  <a href="mailto:info@axxell.ai">info@axxell.ai</a>
</footer>

<script src="https://cdn.jsdelivr.net/npm/gsap@3.13.0/dist/gsap.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/gsap@3.13.0/dist/ScrollTrigger.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/lenis@1.1.20/dist/lenis.min.js"></script>
<script src="js/core.js"></script>
</body>
</html>
```

- [ ] **Step 4: Creare `website-creation/css/sections.css` vuoto con intestazione**

```css
/* Stili dei 9 capitoli. Ogni task aggiunge il proprio blocco in fondo. */
```

- [ ] **Step 5: Creare `website-creation/js/core.js` minimo — solo il cursore**

Il resto di `core.js` arriva nel Task 2. Qui serve solo che la pagina non dia errori.

```js
(function(){
  'use strict';
  var cur = document.getElementById('cur'), curR = document.getElementById('curR');
  var mx = 0, my = 0, rx = 0, ry = 0;
  if (!cur || !curR) return;
  document.addEventListener('mousemove', function(e){
    mx = e.clientX; my = e.clientY;
    cur.style.left = mx + 'px'; cur.style.top = my + 'px';
  });
  (function ring(){
    rx += (mx - rx) * .12; ry += (my - ry) * .12;
    curR.style.left = rx + 'px'; curR.style.top = ry + 'px';
    requestAnimationFrame(ring);
  })();
})();
```

- [ ] **Step 6: Avviare il server e verificare**

```bash
cd /c/Users/gatti/Desktop/axxell-site && python -m http.server 8899
```

Con Playwright MCP:
- `browser_navigate` → `http://localhost:8899/website-creation/`
- `browser_console_messages` → atteso: **zero errori**
- `browser_take_screenshot`

Atteso nello screenshot: fondo `#060609`, nav in alto con logo AXXELL (ELL in ciano) e due voci, footer in basso, grana visibile. Il cursore ciano segue il mouse col ring in ritardo.

- [ ] **Step 7: Commit**

```bash
git add website-creation/
git commit -m "feat(wc): scaffolding pagina Website Creation

Shell HTML, token di design copiati da index.html, cursore custom e grana.
Nessuna sezione ancora: i capitoli arrivano uno per task."
```

---

### Task 2: Motore motion — Lenis, ScrollTrigger, routing reduced-motion

**Files:**
- Modify: `website-creation/js/core.js`

**Interfaces:**
- Consumes: la shell del Task 1.
- Produces: l'oggetto globale `window.WC` con:
  - `WC.lenis` — istanza Lenis
  - `WC.register(name, initFn)` — registra l'init di una sezione. `initFn(ctx)` riceve `ctx = { motionOk: bool, desktop: bool }` e può restituire una funzione di cleanup.
  - `WC.motionOk` / `WC.desktop` — letti dopo l'avvio
  Tutti i task 3-11 usano **esclusivamente** `WC.register('nome', function(ctx){...})`.

- [ ] **Step 1: Riscrivere `website-creation/js/core.js`**

```js
window.WC = (function(){
  'use strict';

  var registry = [];
  var api = {
    lenis: null,
    motionOk: true,
    desktop: true,
    loaded: false,   // messo a true dal loader (Task 3) a sipario aperto
    register: function(name, initFn){ registry.push({ name: name, init: initFn }); }
  };

  // ---- CURSORE ----
  function initCursor(){
    var cur = document.getElementById('cur'), curR = document.getElementById('curR');
    if (!cur || !curR) return;
    var mx = 0, my = 0, rx = 0, ry = 0;
    document.addEventListener('mousemove', function(e){
      mx = e.clientX; my = e.clientY;
      cur.style.left = mx + 'px'; cur.style.top = my + 'px';
    });
    (function ring(){
      rx += (mx - rx) * .12; ry += (my - ry) * .12;
      curR.style.left = rx + 'px'; curR.style.top = ry + 'px';
      requestAnimationFrame(ring);
    })();
    document.addEventListener('mouseover', function(e){
      if (e.target.closest('a,button,.wc-hover')) {
        cur.style.width = '14px'; cur.style.height = '14px';
        curR.style.width = '44px'; curR.style.height = '44px';
        curR.style.borderColor = 'rgba(0,212,255,.7)';
      }
    });
    document.addEventListener('mouseout', function(e){
      if (e.target.closest('a,button,.wc-hover')) {
        cur.style.width = '8px'; cur.style.height = '8px';
        curR.style.width = '32px'; curR.style.height = '32px';
        curR.style.borderColor = 'rgba(0,212,255,.4)';
      }
    });
  }

  // ---- SMOOTH SCROLL ----
  // Lenis si avvia solo se il motion è consentito. Con reduced-motion
  // resta lo scroll nativo del browser.
  var lenisTick = null;

  function initLenis(){
    api.lenis = new Lenis({
      duration: 1.1,
      easing: function(t){ return Math.min(1, 1.001 - Math.pow(2, -10 * t)); }
    });
    api.lenis.on('scroll', ScrollTrigger.update);
    // Il riferimento alla callback va tenuto. Senza, il cleanup non ha modo
    // di staccarla dal ticker: chi attiva "riduci animazioni" a pagina aperta
    // vedrebbe Lenis distrutto e api.lenis a null, ma la callback continuerebbe
    // a girare e a chiamare raf() su null a ogni frame.
    lenisTick = function(time){ api.lenis.raf(time * 1000); };
    gsap.ticker.add(lenisTick);
    gsap.ticker.lagSmoothing(0);
  }

  function destroyLenis(){
    if (lenisTick) { gsap.ticker.remove(lenisTick); lenisTick = null; }
    if (api.lenis) { api.lenis.destroy(); api.lenis = null; }
  }

  function boot(){
    gsap.registerPlugin(ScrollTrigger);
    initCursor();

    var mm = gsap.matchMedia();
    mm.add({
      motionOk: '(prefers-reduced-motion: no-preference)',
      desktop:  '(min-width: 900px)'
    }, function(ctx){
      var c = { motionOk: !!ctx.conditions.motionOk, desktop: !!ctx.conditions.desktop };
      api.motionOk = c.motionOk;
      api.desktop  = c.desktop;

      // Lenis solo su desktop: su mobile lo scroll inerziale di sistema è già
      // buono e il momentum sintetico lo peggiora (atelier D2).
      if (c.motionOk && c.desktop) initLenis();

      var cleanups = [];
      registry.forEach(function(entry){
        try {
          var teardown = entry.init(c);
          if (typeof teardown === 'function') cleanups.push(teardown);
        } catch (err) {
          console.error('[WC] init fallita per sezione "' + entry.name + '"', err);
        }
      });

      return function(){
        // Il teardown è protetto come gli init: il cleanup di una sezione che
        // lancia non deve impedire quelli successivi né la distruzione di Lenis.
        cleanups.forEach(function(fn){
          try { fn(); } catch (err) { console.error('[WC] cleanup fallito', err); }
        });
        destroyLenis();
      };
    });
  }

  // Le sezioni si registrano con script caricati dopo core.js.
  // L'avvio va rimandato a dopo il parsing di tutti gli script.
  document.addEventListener('DOMContentLoaded', boot);

  return api;
})();
```

- [ ] **Step 2: Verificare che il motore parta senza sezioni registrate**

Playwright MCP:
- `browser_navigate` → `http://localhost:8899/website-creation/`
- `browser_console_messages` → atteso: zero errori
- `browser_evaluate` con:
  ```js
  () => ({ hasWC: !!window.WC, lenis: !!window.WC.lenis, motionOk: window.WC.motionOk })
  ```
  Atteso: `{ hasWC: true, lenis: true, motionOk: true }`

- [ ] **Step 3: Verificare il ramo reduced-motion**

Playwright MCP: `browser_run_code_unsafe` per emulare la media query, oppure navigare con il contesto emulato:

```js
await page.emulateMedia({ reducedMotion: 'reduce' });
await page.reload();
```

Poi `browser_evaluate`:
```js
() => ({ lenis: !!window.WC.lenis, motionOk: window.WC.motionOk })
```
Atteso: `{ lenis: false, motionOk: false }` — con reduced-motion Lenis non si avvia e lo scroll resta nativo.

Ripristinare con `await page.emulateMedia({ reducedMotion: 'no-preference' })`.

- [ ] **Step 4: Commit**

```bash
git add website-creation/js/core.js
git commit -m "feat(wc): motore motion con routing reduced-motion

WC.register() è l'unico punto d'ingresso per le sezioni. Lenis parte solo
con motion consentito; sotto prefers-reduced-motion resta lo scroll nativo."
```

---

### Task 2b: Cursore a stati

**Files:**
- Modify: `website-creation/index.html` (markup del cursore)
- Modify: `website-creation/css/base.css` (i 9 stati)
- Modify: `website-creation/js/core.js` (togliere `initCursor`)
- Create: `website-creation/js/cursor.js`

**Interfaces:**
- Consumes: `WC.register` (Task 2).
- Produces: il contratto che tutti i capitoli usano. Ogni `<section>` dichiara:
  - `data-cursor="<stato>"` — uno tra `default` `read` `orbit` `grab` `cross` `invert` `arrow` `caret`
  - `data-cursor-label="TESTO"` — facoltativo, testo dentro il ring
  Il cursore reagisce da solo. Nessun capitolo importa o chiama niente.

**Perché gli stati stanno nel CSS.** Le `transition` CSS fanno il morphing tra uno stato
e l'altro senza una riga di JS, e sotto `prefers-reduced-motion` si spengono tutte con
una regola sola. GSAP qui non serve: il JS cambia una classe su `<body>` e basta.

- [ ] **Step 1: Sostituire il markup del cursore in `index.html`**

Al posto dei due `<div class="cursor">` del Task 1:

```html
<div class="cursor" id="cur"></div>
<div class="cursor-ring" id="curR"><span class="cursor-label" id="curLabel"></span></div>
<div class="cursor-trail" data-i="0"></div>
<div class="cursor-trail" data-i="1"></div>
<div class="cursor-trail" data-i="2"></div>
```

E dopo `core.js`: `<script src="js/cursor.js"></script>`

- [ ] **Step 2: Sostituire il blocco CURSORE in `css/base.css`**

```css
/* ---- CURSORE A STATI ---- */
.cursor,.cursor-ring,.cursor-trail{
  position:fixed;pointer-events:none;transform:translate(-50%,-50%);
  mix-blend-mode:screen;
  transition:width .35s cubic-bezier(.22,1,.36,1),
             height .35s cubic-bezier(.22,1,.36,1),
             border-radius .35s cubic-bezier(.22,1,.36,1),
             background-color .35s ease, border-color .35s ease,
             opacity .3s ease, rotate .5s cubic-bezier(.22,1,.36,1);
}
.cursor{width:8px;height:8px;background:var(--cyan);border-radius:50%;z-index:9999;}
.cursor-ring{width:32px;height:32px;border:1px solid rgba(0,212,255,.4);
  border-radius:50%;z-index:9998;display:flex;align-items:center;justify-content:center;}
.cursor-trail{width:22px;height:22px;border:1px solid rgba(0,212,255,.18);
  border-radius:50%;z-index:9997;opacity:0;}
.cursor-label{font-family:var(--mono);font-size:.52rem;letter-spacing:.14em;
  color:var(--cyan);white-space:nowrap;opacity:0;transition:opacity .3s ease;}

/* --- 00 hidden: sotto il sipario --- */
body.cur-hidden .cursor,body.cur-hidden .cursor-ring{opacity:0;}

/* --- 01 default: punto + ring, la scia accesa --- */
body.cur-default .cursor-trail{opacity:1;}

/* --- 02 read: barra verticale spenta, un accento di lettura --- */
body.cur-read .cursor{width:2px;height:26px;border-radius:1px;
  background:rgba(240,240,246,.55);}
body.cur-read .cursor-ring{opacity:0;}

/* --- 03 orbit: quadrato verde in rotazione --- */
body.cur-orbit .cursor{opacity:0;}
body.cur-orbit .cursor-ring{width:42px;height:42px;border-radius:2px;
  border-color:var(--green);rotate:45deg;}

/* --- 04 grab: disco pieno con etichetta --- */
body.cur-grab .cursor{opacity:0;}
body.cur-grab .cursor-ring{width:84px;height:84px;
  background:rgba(0,212,255,.12);border-color:rgba(0,212,255,.75);}
body.cur-grab .cursor-label{opacity:1;}

/* --- 05 cross: mirino --- */
body.cur-cross .cursor{width:1px;height:22px;border-radius:0;}
body.cur-cross .cursor-ring{width:22px;height:1px;border-radius:0;
  border:0;background:var(--cyan);}

/* --- 06 invert: ring largo che inverte la superficie sotto --- */
body.cur-invert .cursor{opacity:0;}
body.cur-invert .cursor-ring{width:110px;height:110px;
  background:#fff;border-color:transparent;mix-blend-mode:difference;}
body.cur-invert .cursor-label{opacity:1;color:#060609;}

/* --- 07 arrow: freccia orizzontale --- */
body.cur-arrow .cursor{opacity:0;}
body.cur-arrow .cursor-ring{width:54px;height:1px;border:0;
  border-radius:0;background:var(--cyan);}
body.cur-arrow .cursor-ring::after{content:'';position:absolute;right:-1px;
  width:9px;height:9px;border-top:1px solid var(--cyan);
  border-right:1px solid var(--cyan);rotate:45deg;}

/* --- 08 caret: I-beam sottile --- */
body.cur-caret .cursor{width:1px;height:20px;border-radius:0;background:var(--white);}
body.cur-caret .cursor-ring{opacity:0;}

/* Reduced-motion: gli stati restano, il morphing no. */
@media (prefers-reduced-motion:reduce){
  .cursor,.cursor-ring,.cursor-trail,.cursor-label{transition:none;}
  .cursor-trail{display:none;}
}
@media (pointer:coarse){.cursor,.cursor-ring,.cursor-trail{display:none;}}
```

- [ ] **Step 3: Togliere `initCursor` da `core.js`**

In `core.js`, cancellare l'intera funzione `initCursor` e la sua chiamata dentro `boot()`.
Il cursore ora è una sezione registrata come le altre. `core.js` resta responsabile solo
di Lenis, matchMedia e registry.

- [ ] **Step 4: Creare `website-creation/js/cursor.js`**

```js
WC.register('cursor', function(ctx){
  var dot   = document.getElementById('cur');
  var ring  = document.getElementById('curR');
  var label = document.getElementById('curLabel');
  var trail = Array.prototype.slice.call(document.querySelectorAll('.cursor-trail'));
  if (!dot || !ring) return;

  var mx = 0, my = 0, rx = 0, ry = 0;
  var tp = trail.map(function(){ return { x: 0, y: 0 }; });

  var onMove = function(e){
    mx = e.clientX; my = e.clientY;
    dot.style.left = mx + 'px'; dot.style.top = my + 'px';
  };
  document.addEventListener('mousemove', onMove);

  var raf;
  (function loop(){
    rx += (mx - rx) * .12; ry += (my - ry) * .12;
    ring.style.left = rx + 'px'; ring.style.top = ry + 'px';
    // ogni elemento della scia insegue il precedente più lentamente
    for (var i = 0; i < trail.length; i++) {
      var prev = i === 0 ? { x: rx, y: ry } : tp[i - 1];
      var k = .16 - i * .035;
      tp[i].x += (prev.x - tp[i].x) * k;
      tp[i].y += (prev.y - tp[i].y) * k;
      trail[i].style.left = tp[i].x + 'px';
      trail[i].style.top  = tp[i].y + 'px';
    }
    raf = requestAnimationFrame(loop);
  })();

  // --- macchina a stati ---
  var STATES = ['hidden','default','read','orbit','grab','cross','invert','arrow','caret'];
  var current = '';

  function setState(name, text){
    if (!name || name === current) return;
    STATES.forEach(function(s){ document.body.classList.remove('cur-' + s); });
    document.body.classList.add('cur-' + name);
    label.textContent = text || '';
    current = name;
  }
  WC.setCursor = setState;   // il loader (Task 3) lo usa per 'hidden'

  setState('default');

  // Ogni sezione dichiara il proprio stato: il cursore non sa nulla dei capitoli.
  var triggers = [];
  document.querySelectorAll('[data-cursor]').forEach(function(sec){
    triggers.push(ScrollTrigger.create({
      trigger: sec, start: 'top 50%', end: 'bottom 50%',
      onEnter:     function(){ setState(sec.dataset.cursor, sec.dataset.cursorLabel); },
      onEnterBack: function(){ setState(sec.dataset.cursor, sec.dataset.cursorLabel); }
    }));
  });

  return function(){
    cancelAnimationFrame(raf);
    document.removeEventListener('mousemove', onMove);
    triggers.forEach(function(t){ t.kill(); });
    STATES.forEach(function(s){ document.body.classList.remove('cur-' + s); });
  };
});
```

- [ ] **Step 5: Verificare**

Playwright MCP, con una sezione finta per provare gli stati prima che i capitoli
esistano — aggiungere temporaneamente in `<main>`:

```html
<section data-cursor="grab" data-cursor-label="TRASCINA" style="height:120svh"></section>
<section data-cursor="invert" style="height:120svh"></section>
```

- `browser_evaluate` → `() => document.body.className` all'apertura: atteso `"cur-default"`
- scrollare nella prima sezione finta, `browser_evaluate` → atteso `"cur-grab"`
- `browser_take_screenshot` con `browser_hover` al centro → ring grande con scritta TRASCINA
- scrollare nella seconda → `"cur-invert"`, ring bianco in `difference`
- risalire indietro → lo stato deve tornare `cur-grab` (verifica di `onEnterBack`)
- `browser_resize` a 500×900 → `browser_evaluate`:
  ```js
  () => getComputedStyle(document.getElementById('cur')).display
  ```
  Atteso: `"none"` — su puntatore grosso il cursore non esiste
- **Rimuovere le due sezioni finte prima del commit.**

- [ ] **Step 6: Commit**

```bash
git add website-creation/
git commit -m "feat(wc): cursore a stati guidato dalle sezioni

Nove stati definiti in CSS, il JS cambia solo una classe su body. Le sezioni
li dichiarano con data-cursor: il cursore non conosce i capitoli.
Sotto reduced-motion gli stati restano, il morphing e la scia no."
```

---

### Task 3: Capitolo 00 — loader cinematografico con Lottie

**Files:**
- Modify: `website-creation/index.html` (blocco loader + script lottie)
- Modify: `website-creation/css/sections.css`
- Create: `website-creation/js/loader.js`
- Create: `website-creation/assets/logo-reveal.json`

**Interfaces:**
- Consumes: `WC.register` (Task 2).
- Produces: due cose che il Task 4 (hero) consuma:
  - l'evento custom `wc:loaded` su `document`, emesso quando il sipario è aperto;
  - il flag booleano **`WC.loaded`**, messo a `true` nello stesso istante.
  Servono entrambi: con `prefers-reduced-motion` il loader finisce *durante* la propria
  init, quindi l'evento parte prima che l'hero riesca ad ascoltarlo. Il flag copre quel
  caso. Chi consuma deve controllare il flag **e** ascoltare l'evento.

- [ ] **Step 1: Creare il Lottie del logo**

Usare la skill `text-to-lottie` per generare `website-creation/assets/logo-reveal.json`: la parola **AXXELL** che si scrive, con "ELL" in ciano `#00d4ff`, durata 1.6s, 60fps, **senza expressions** (il player è `lottie_light` e le ignora). Sfondo trasparente.

Vincoli da passare alla skill: dimensione canvas 600×160, nessuna immagine embeddata, solo shape layer.

- [ ] **Step 2: Aggiungere il markup del loader in `index.html`**

Subito dopo `<body>`, prima di `.cursor`:

```html
<div class="wc-loader" id="wcLoader">
  <div class="wc-loader-inner">
    <div class="wc-loader-lottie" id="wcLoaderLottie"></div>
    <div class="wc-loader-count" id="wcLoaderCount">00</div>
  </div>
  <div class="wc-curtain wc-curtain-t"></div>
  <div class="wc-curtain wc-curtain-b"></div>
</div>
```

E prima di `js/core.js`:

```html
<script src="https://cdnjs.cloudflare.com/ajax/libs/lottie-web/5.12.2/lottie_light.min.js"></script>
```

E **dopo `js/cursor.js`** — l'ordine conta: il loader chiama `WC.setCursor`, che esiste
solo se `cursor.js` si è già registrato:

```html
<script src="js/loader.js"></script>
```

- [ ] **Step 3: Aggiungere gli stili in `css/sections.css`**

```css
/* ---- CAP 00 — LOADER ---- */
.wc-loader{position:fixed;inset:0;z-index:10000;background:var(--bg);
  display:flex;align-items:center;justify-content:center;}
.wc-loader.done{pointer-events:none;}
/* position + z-index servono: senza, i pannelli del sipario (position:absolute)
   dipingono sopra contatore e logo e il loader resta uno schermo nero vuoto. */
.wc-loader-inner{display:flex;flex-direction:column;align-items:center;gap:1.2rem;
  position:relative;z-index:1;}
.wc-loader-lottie{width:min(60vw,320px);}
.wc-loader-count{font-family:var(--mono);font-size:.8rem;letter-spacing:.2em;
  color:var(--dim);}
.wc-curtain{position:absolute;left:0;right:0;height:50%;background:var(--bg);}
.wc-curtain-t{top:0;}
.wc-curtain-b{bottom:0;}
/* la pagina non scrolla finché il loader è aperto */
body.wc-locked{overflow:hidden;}
```

- [ ] **Step 4: Creare `website-creation/js/loader.js`**

```js
WC.register('loader', function(ctx){
  var root  = document.getElementById('wcLoader');
  var count = document.getElementById('wcLoaderCount');
  var box   = document.getElementById('wcLoaderLottie');
  if (!root) return;

  function finish(){
    root.classList.add('done');
    root.style.display = 'none';
    document.body.classList.remove('wc-locked');
    if (WC.lenis) WC.lenis.start();
    if (WC.setCursor) WC.setCursor('default');
    WC.loaded = true;                                   // per chi si registra dopo
    document.dispatchEvent(new CustomEvent('wc:loaded'));
  }

  // Reduced-motion: nessun teatro, la pagina è subito lì.
  if (!ctx.motionOk) { finish(); return; }

  document.body.classList.add('wc-locked');
  if (WC.setCursor) WC.setCursor('hidden');
  // Lenis va fermato: overflow:hidden sul body non lo blocca, continuerebbe
  // a scorrere dietro al sipario.
  if (WC.lenis) WC.lenis.stop();

  var anim = lottie.loadAnimation({
    container: box, renderer: 'svg', loop: false, autoplay: true,
    path: 'assets/logo-reveal.json'
  });

  var counter = { v: 0 };
  var tl = gsap.timeline({ onComplete: finish });

  tl.to(counter, {
    v: 100, duration: 1.6, ease: 'power2.inOut',
    onUpdate: function(){
      count.textContent = String(Math.round(counter.v)).padStart(2, '0');
    }
  })
  .to('.wc-loader-inner', { opacity: 0, duration: .35, ease: 'power2.in' }, '+=0.15')
  .to('.wc-curtain-t', { yPercent: -100, duration: .9, ease: 'expo.inOut' }, '<')
  .to('.wc-curtain-b', { yPercent:  100, duration: .9, ease: 'expo.inOut' }, '<');

  return function(){
    tl.kill(); anim.destroy();
    document.body.classList.remove('wc-locked');
    if (WC.lenis) WC.lenis.start();
  };
});
```

- [ ] **Step 5: Verificare**

Playwright MCP:
- `browser_navigate` → ricarica la pagina
- `browser_take_screenshot` **immediato** — atteso: schermo scuro col logo Lottie e il contatore
- `browser_wait_for` con `text: ""` o attesa di ~3s, poi `browser_evaluate`:
  ```js
  () => document.getElementById('wcLoader').style.display
  ```
  Atteso: `"none"`
- `browser_console_messages` → zero errori (in particolare nessun 404 su `assets/logo-reveal.json`)
- Con `reducedMotion: 'reduce'`: il loader deve sparire entro il primo frame — `browser_evaluate` subito dopo il load deve già dare `"none"`.

- [ ] **Step 6: Commit**

```bash
git add website-creation/
git commit -m "feat(wc): cap. 00 loader cinematografico

Contatore 0-100, logo Lottie, sipario in apertura. Emette wc:loaded.
Con reduced-motion il loader viene saltato del tutto."
```

---

### Task 3b: Invarianti atelier — focus, OG image, Lenis desktop

**Files:**
- Modify: `website-creation/css/base.css`
- Modify: `website-creation/js/core.js`
- Modify: `website-creation/index.html`
- Create: `website-creation/assets/og.png`

**Interfaces:**
- Consumes: tutto il costruito nei Task 1, 2, 2b, 3.
- Produces: niente di nuovo per i task successivi — chiude tre lacune trovate
  passando il piano contro le invarianti di atelier. Va fatto **adesso** e non
  alla fine: ogni capitolo costruito dopo eredita gratis le regole di focus.

- [ ] **Step 1: Anello di focus su ogni elemento interattivo**

Oggi non esiste da nessuna parte: chi naviga da tastiera non vede dove si trova.
In fondo al blocco tipografia di `css/base.css`:

```css
/* ---- FOCUS ---- */
/* La nav è fissa e alta 72px. Senza questo, il Tab porta l'elemento a filo del
   bordo alto della finestra, cioè sotto la nav, e l'anello di focus resta
   coperto. Vale anche per i salti ad ancora tipo href="#cap08". */
html{scroll-padding-top:calc(var(--nav-h) + 1rem);}

/* Una regola sola per tutta la pagina. L'anello è staccato dall'elemento così
   resta leggibile anche sui bordi già ciano. */
:where(a, button, input, textarea, select, [tabindex]):focus-visible{
  scroll-margin-top:calc(var(--nav-h) + 1rem);
  outline:2px solid var(--cyan);
  outline-offset:3px;
  border-radius:2px;
}
/* Il cursore custom non deve coprire l'anello di chi usa la tastiera. */
body:has(:focus-visible) .cursor,
body:has(:focus-visible) .cursor-ring,
body:has(:focus-visible) .cursor-trail{opacity:0;}
```

- [ ] **Step 2: Target tattili ≥ 44px**

Verificare i link di nav e il footer. Dove l'altezza calcolata è sotto 44px,
aggiungere padding verticale — **non** `height`, che romperebbe l'allineamento
della nav:

```css
.nav-links a{padding:1rem .5rem;}
footer a{padding:.875rem 0;display:inline-block;}
```

Misurare prima di modificare: `getBoundingClientRect().height` su ciascuno.
Se un elemento è già ≥ 44px, lasciarlo stare. Se i valori qui sopra non
bastano a superare 44, alzarli — conta la misura, non il numero scritto.

- [ ] **Step 3: Lenis solo su desktop**

In `js/core.js`, dentro il callback di `matchMedia`:

```js
      // Lenis solo su desktop: su mobile lo scroll inerziale di sistema è già
      // buono e il momentum sintetico lo peggiora (atelier D2).
      if (c.motionOk && c.desktop) initLenis();
```

Una riga. Il teardown esiste già e non cambia.

- [ ] **Step 4: OG image 1200×630**

Oggi `index.html` punta a `favicon.png`: un link condiviso mostra un quadratino.

Generare `website-creation/assets/og.png` a 1200×630, procedurale, coerente col
brand — fondo `#060609`, griglia sottile ciano al 12%, la parola **AXXELL** in
Space Grotesk bianca con "ELL" in `#00d4ff`, e sotto in DM Mono maiuscoletto
`WEBSITE CREATION`. Nessuna immagine presa da altrove.

Il modo più diretto senza aggiungere dipendenze: disegnarla in un canvas nel
browser via Playwright e salvarne il PNG. Va bene qualsiasi metodo che non
introduca librerie o build step.

Poi in `index.html`:

```html
<meta property="og:image" content="https://axxell.ai/website-creation/assets/og.png">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:image" content="https://axxell.ai/website-creation/assets/og.png">
```

- [ ] **Step 5: Verificare**

Playwright MCP:
- `browser_press_key` con `Tab` ripetuto dall'apertura: **ogni** elemento
  raggiungibile deve mostrare l'anello ciano. Screenshot di almeno tre tappe
  diverse (logo, link di nav, link del footer).
- Con un elemento a fuoco, verificare che il cursore custom sia sparito:
  `browser_evaluate` → `() => getComputedStyle(document.getElementById('cur')).opacity`
  atteso `"0"`.
- `browser_evaluate` sulle altezze:
  ```js
  () => [...document.querySelectorAll('.nav-links a, footer a')]
          .map(el => Math.round(el.getBoundingClientRect().height))
  ```
  Atteso: ogni valore ≥ 44.
- `browser_resize` a 500×900, ricaricare, `browser_evaluate` →
  `() => !!window.WC.lenis` atteso `false`. Tornare a desktop: atteso `true`.
- Aprire `assets/og.png` e confermare 1200×630 e leggibilità.
- `browser_console_messages` → zero errori.

- [ ] **Step 6: Commit**

```bash
git add website-creation/ design.md
git commit -m "feat(wc): invarianti atelier — focus, target, OG image, Lenis desktop

Anello di focus-visible su tutta la pagina: prima non esisteva da nessuna
parte. Target tattili portati a 44px. OG image 1200x630 procedurale al posto
del favicon. Lenis solo su desktop (D2).

design.md registra genere, tema, font, seed colore, motion budget e le due
deroghe consapevoli (D4 due pin, D15 sei Lottie)."
```

---

### Task 4: Capitolo 01 — hero con warp, split-text e cursore magnetico

**Files:**
- Modify: `website-creation/index.html`
- Modify: `website-creation/css/sections.css`
- Create: `website-creation/js/warp.js`

**Interfaces:**
- Consumes: `WC.register`, evento `wc:loaded` (Task 3).
- Produces: la funzione globale `WC.splitWords(el)` — divide il testo di `el` in `<span class="wi">` per parola e restituisce la NodeList degli `.wi`. Usata anche dal Task 5. Va definita qui, dentro `warp.js`, e assegnata su `WC`.

- [ ] **Step 1: Aggiungere il markup dell'hero dentro `<main id="wc-main">`**

```html
<section class="wc-hero" id="cap01" data-cursor="default">
  <canvas class="wc-warp" id="wcWarp"></canvas>
  <div class="wc-hero-content">
    <p class="eyebrow">// 01 — Website Creation</p>
    <h1 class="wc-hero-title">Il sito non si racconta. Si attraversa.</h1>
    <p class="lead">Questa pagina è il portfolio. Ogni sezione che scorri è una cosa che sappiamo fare, mostrata mentre la fa.</p>
    <a href="#cap08" class="wc-magnet wc-hover" id="wcHeroCta">Parliamone →</a>
  </div>
  <div class="wc-scroll-cue"><span></span></div>
</section>
```

E prima di `</body>`, dopo `core.js`:

```html
<script src="js/warp.js"></script>
```

- [ ] **Step 2: Aggiungere gli stili in `css/sections.css`**

```css
/* ---- CAP 01 — HERO WARP ---- */
.wc-hero{min-height:100svh;display:flex;align-items:center;overflow:hidden;}
.wc-warp{position:absolute;inset:0;width:100%;height:100%;z-index:-1;}
.wc-hero-content{max-width:64ch;display:flex;flex-direction:column;gap:1.6rem;}
.wc-hero-title .w{display:inline-block;overflow:hidden;vertical-align:bottom;}
.wc-hero-title .wi{display:inline-block;will-change:transform;}
.wc-magnet{align-self:flex-start;display:inline-flex;align-items:center;
  padding:.9rem 1.6rem;border:1px solid var(--cyan);border-radius:2px;
  color:var(--cyan);text-decoration:none;font-size:.9rem;font-weight:500;
  will-change:transform;}
.wc-scroll-cue{position:absolute;bottom:2.5rem;left:50%;transform:translateX(-50%);
  width:1px;height:56px;background:var(--border2);overflow:hidden;}
.wc-scroll-cue span{position:absolute;top:0;left:0;width:100%;height:40%;
  background:var(--cyan);}
```

- [ ] **Step 3: Creare `website-creation/js/warp.js`**

```js
// Split a mano: SplitText è un plugin a pagamento e non si usa.
WC.splitWords = function(el){
  var words = el.textContent.trim().split(/\s+/);
  el.innerHTML = words.map(function(w){
    return '<span class="w"><span class="wi">' + w + '</span></span>';
  }).join(' ');
  return el.querySelectorAll('.wi');
};

WC.register('hero', function(ctx){
  var canvas = document.getElementById('wcWarp');
  var title  = document.querySelector('.wc-hero-title');
  var cta    = document.getElementById('wcHeroCta');
  if (!title) return;

  var items = WC.splitWords(title);

  // --- ingresso del titolo ---
  gsap.set(items, { yPercent: 110 });
  function enter(){
    if (!ctx.motionOk) { gsap.set(items, { yPercent: 0 }); return; }
    gsap.to(items, { yPercent: 0, duration: 1, ease: 'expo.out', stagger: .05 });
    gsap.fromTo('.wc-hero-content .lead, .wc-magnet',
      { opacity: 0, y: 20 },
      { opacity: 1, y: 0, duration: .8, ease: 'power2.out', stagger: .1, delay: .35 });
    gsap.fromTo('.wc-scroll-cue span', { yPercent: -100 },
      { yPercent: 250, duration: 1.8, ease: 'power1.inOut', repeat: -1 });
  }
  // Il loader può aver già finito prima che questo script si registri —
  // succede sempre con reduced-motion, dove finish() è sincrono. Senza questo
  // controllo il titolo resterebbe a yPercent:110, cioè invisibile.
  if (WC.loaded) enter();
  else document.addEventListener('wc:loaded', enter, { once: true });

  var cleanups = [];

  // --- CTA magnetica ---
  if (ctx.motionOk && ctx.desktop && cta) {
    var onMove = function(e){
      var r = cta.getBoundingClientRect();
      var dx = e.clientX - (r.left + r.width / 2);
      var dy = e.clientY - (r.top + r.height / 2);
      var dist = Math.hypot(dx, dy);
      var pull = dist < 140 ? 1 - dist / 140 : 0;
      gsap.to(cta, { x: dx * .35 * pull, y: dy * .35 * pull,
                     duration: .5, ease: 'power3.out' });
    };
    window.addEventListener('mousemove', onMove);
    cleanups.push(function(){ window.removeEventListener('mousemove', onMove); });
  }

  // --- WARP: campo di stelle proiettato, niente librerie ---
  if (ctx.motionOk && canvas) {
    var g = canvas.getContext('2d');
    var stars = [], N = ctx.desktop ? 520 : 200;
    var w, h, cx, cy, mouseX = 0, mouseY = 0, raf;

    function resize(){
      w = canvas.width  = canvas.offsetWidth  * Math.min(devicePixelRatio, 2);
      h = canvas.height = canvas.offsetHeight * Math.min(devicePixelRatio, 2);
      cx = w / 2; cy = h / 2;
    }
    function seed(){
      stars.length = 0;
      for (var i = 0; i < N; i++) {
        stars.push({ x: (Math.random() - .5) * w, y: (Math.random() - .5) * h,
                     z: Math.random() * w, pz: 0 });
      }
    }
    function frame(){
      g.fillStyle = 'rgba(6,6,9,.35)';
      g.fillRect(0, 0, w, h);
      var ox = mouseX * 70, oy = mouseY * 70;
      for (var i = 0; i < stars.length; i++) {
        var s = stars[i];
        s.pz = s.z; s.z -= 5.5;
        if (s.z < 1) { s.z = w; s.x = (Math.random() - .5) * w;
                       s.y = (Math.random() - .5) * h; s.pz = s.z; }
        var sx = (s.x / s.z) * w * .5 + cx + ox;
        var sy = (s.y / s.z) * w * .5 + cy + oy;
        var px = (s.x / s.pz) * w * .5 + cx + ox;
        var py = (s.y / s.pz) * w * .5 + cy + oy;
        var a  = Math.min(1, (1 - s.z / w) * 1.4);
        g.strokeStyle = 'rgba(0,212,255,' + (a * .55).toFixed(3) + ')';
        g.lineWidth = a * 1.6;
        g.beginPath(); g.moveTo(px, py); g.lineTo(sx, sy); g.stroke();
      }
      raf = requestAnimationFrame(frame);
    }
    var onResize = function(){ resize(); seed(); };
    var onMouse  = function(e){
      mouseX = (e.clientX / innerWidth)  - .5;
      mouseY = (e.clientY / innerHeight) - .5;
    };
    resize(); seed(); frame();
    window.addEventListener('resize', onResize);
    window.addEventListener('mousemove', onMouse);
    cleanups.push(function(){
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', onResize);
      window.removeEventListener('mousemove', onMouse);
    });
  }

  return function(){ cleanups.forEach(function(f){ f(); }); };
});
```

- [ ] **Step 4: Verificare**

Playwright MCP:
- ricaricare, attendere la fine del loader
- `browser_take_screenshot` — atteso: titolo leggibile e completo, scie ciano radiali dal centro
- `browser_evaluate`:
  ```js
  () => document.querySelectorAll('.wc-hero-title .wi').length
  ```
  Atteso: `7` (le parole del titolo)
- `browser_console_messages` → zero errori
- Con `reducedMotion: 'reduce'`: `browser_take_screenshot` — il titolo deve essere **visibile e fermo**, il canvas warp vuoto. Verificare che nessun `.wi` resti a `yPercent:110` (testo invisibile = bug bloccante).

- [ ] **Step 5: Commit**

```bash
git add website-creation/
git commit -m "feat(wc): cap. 01 hero con warp, split-text e CTA magnetica

Split del titolo scritto a mano, niente plugin GSAP a pagamento.
Warp in canvas 2D puro. Con reduced-motion il titolo è statico e visibile."
```

---

### Task 5: Capitolo 02 — manifesto in scroll-scrub

**Files:**
- Modify: `website-creation/index.html`
- Modify: `website-creation/css/sections.css`
- Create: `website-creation/js/manifesto.js`

**Interfaces:**
- Consumes: `WC.register`, `WC.splitWords` (Task 4).
- Produces: niente per i task successivi.

- [ ] **Step 1: Markup, dopo il cap. 01**

```html
<section class="wc-manifesto" id="cap02" data-cursor="read">
  <p class="eyebrow">// 02 — Metodo</p>
  <p class="wc-manifesto-text" id="wcManifesto">Non partiamo da un template. Partiamo da cosa deve succedere nella testa di chi arriva sul sito: cosa capisce nei primi tre secondi, cosa lo convince, cosa lo fa scrivere. Il design viene dopo quella risposta, mai prima.</p>
</section>
```

Script prima di `</body>`: `<script src="js/manifesto.js"></script>`

- [ ] **Step 2: Stili**

```css
/* ---- CAP 02 — MANIFESTO ---- */
.wc-manifesto{min-height:100svh;display:flex;flex-direction:column;
  justify-content:center;gap:2.5rem;}
.wc-manifesto-text{font-size:clamp(1.5rem,3.4vw,2.8rem);line-height:1.35;
  font-weight:500;letter-spacing:-.015em;max-width:22ch;}
.wc-manifesto-text .wi{color:var(--dim);transition:none;}
```

Nota: `max-width:22ch` è volutamente stretto — il testo lungo su riga corta è quello che dà il ritmo alla sezione.

- [ ] **Step 3: Creare `website-creation/js/manifesto.js`**

```js
WC.register('manifesto', function(ctx){
  var el = document.getElementById('wcManifesto');
  if (!el) return;
  var items = WC.splitWords(el);

  // Reduced-motion: testo pieno, nessuno scrub.
  if (!ctx.motionOk) {
    gsap.set(items, { color: 'var(--white)' });
    return;
  }

  var tl = gsap.timeline({
    scrollTrigger: {
      trigger: el,
      start: 'top 75%',
      end: 'bottom 55%',
      scrub: .6
    }
  });
  tl.to(items, { color: '#f0f0f6', stagger: .35, ease: 'none' });

  return function(){ tl.scrollTrigger && tl.scrollTrigger.kill(); tl.kill(); };
});
```

- [ ] **Step 4: Verificare**

Playwright MCP:
- `browser_evaluate` per scrollare a metà sezione:
  ```js
  () => { const s = document.getElementById('cap02');
          window.scrollTo(0, s.offsetTop + s.offsetHeight * 0.4); }
  ```
- attendere ~1s, `browser_take_screenshot` — atteso: le prime parole bianche, le ultime ancora spente. Il gradiente di lettura deve essere visibile.
- Con `reducedMotion: 'reduce'`: tutte le parole bianche subito.
- `browser_console_messages` → zero errori.

- [ ] **Step 5: Commit**

```bash
git add website-creation/
git commit -m "feat(wc): cap. 02 manifesto rivelato in scroll-scrub"
```

---

### Task 6: Capitolo 03 — oggetto 3D pinnato

**Files:**
- Modify: `website-creation/index.html`
- Modify: `website-creation/css/sections.css`
- Create: `website-creation/js/scene3d.js`

**Interfaces:**
- Consumes: `WC.register`.
- Produces: niente per i task successivi.

- [ ] **Step 1: Markup**

```html
<section class="wc-3d" id="cap03" data-cursor="orbit">
  <div class="wc-3d-pin" id="wc3dPin">
    <canvas id="wc3dCanvas"></canvas>
    <div class="wc-3d-copy">
      <p class="eyebrow">// 03 — Tridimensionale</p>
      <h2>Profondità vera,<br>non un'ombra finta.</h2>
      <p class="lead">Geometria in WebGL guidata dallo scroll. Nessun video, nessuna GIF: il fotogramma lo calcola il browser mentre scendi.</p>
    </div>
  </div>
</section>
```

three.js va caricato **prima** di `scene3d.js`:

```html
<script src="https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js"></script>
<script src="js/scene3d.js"></script>
```

- [ ] **Step 2: Stili**

```css
/* ---- CAP 03 — 3D PINNATO ---- */
.wc-3d{padding:0;height:300svh;}
.wc-3d-pin{height:100svh;position:relative;display:flex;align-items:center;
  padding:0 clamp(1.5rem,5vw,4rem);}
#wc3dCanvas{position:absolute;inset:0;width:100%;height:100%;z-index:0;}
.wc-3d-copy{position:relative;z-index:1;max-width:44ch;
  display:flex;flex-direction:column;gap:1.2rem;}
```

- [ ] **Step 3: Creare `website-creation/js/scene3d.js`**

```js
WC.register('scene3d', function(ctx){
  var canvas = document.getElementById('wc3dCanvas');
  var pin    = document.getElementById('wc3dPin');
  var sec    = document.getElementById('cap03');
  if (!canvas || typeof THREE === 'undefined') return;

  var renderer = new THREE.WebGLRenderer({ canvas: canvas, alpha: true, antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));

  var scene  = new THREE.Scene();
  var camera = new THREE.PerspectiveCamera(45, 1, .1, 100);
  camera.position.z = 4.2;

  var geo = new THREE.IcosahedronGeometry(1.35, ctx.desktop ? 3 : 1);
  var mat = new THREE.MeshBasicMaterial({
    color: 0x00d4ff, wireframe: true, transparent: true, opacity: .55
  });
  var mesh = new THREE.Mesh(geo, mat);
  scene.add(mesh);

  // Copia delle posizioni originali: la deformazione parte sempre da queste,
  // altrimenti il rumore si accumula frame dopo frame e la forma esplode.
  var pos  = geo.attributes.position;
  var base = new Float32Array(pos.array);

  var progress = 0;

  function resize(){
    var w = pin.clientWidth, h = pin.clientHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }

  function deform(t){
    for (var i = 0; i < pos.count; i++) {
      var ix = i * 3;
      var x = base[ix], y = base[ix+1], z = base[ix+2];
      var n = Math.sin(x * 3 + t) * Math.cos(y * 3 + t) * Math.sin(z * 3 + t);
      var k = 1 + n * .18 * progress;
      pos.array[ix]   = x * k;
      pos.array[ix+1] = y * k;
      pos.array[ix+2] = z * k;
    }
    pos.needsUpdate = true;
  }

  var raf, running = false;
  function frame(){
    var t = performance.now() * .0008;
    mesh.rotation.y = progress * Math.PI * 2;
    mesh.rotation.x = progress * Math.PI * .6;
    mesh.scale.setScalar(1 + progress * .35);
    deform(t);
    renderer.render(scene, camera);
    if (running) raf = requestAnimationFrame(frame);
  }

  resize();
  window.addEventListener('resize', resize);

  // Reduced-motion o mobile: un solo frame renderizzato e poi fermo.
  // Niente sequenze di immagini: violerebbero la scelta procedurale e il budget.
  if (!ctx.motionOk || !ctx.desktop) {
    progress = .35;
    frame();
    return function(){ window.removeEventListener('resize', resize); renderer.dispose(); };
  }

  running = true; frame();

  var st = ScrollTrigger.create({
    trigger: sec,
    start: 'top top',
    end: 'bottom bottom',
    pin: pin,
    scrub: true,
    onUpdate: function(self){ progress = self.progress; }
  });

  return function(){
    running = false; cancelAnimationFrame(raf);
    st.kill(); window.removeEventListener('resize', resize);
    geo.dispose(); mat.dispose(); renderer.dispose();
  };
});
```

- [ ] **Step 4: Verificare**

Playwright MCP:
- scrollare a `cap03` inizio → screenshot: icosaedro wireframe ciano, piccolo
- scrollare a metà (`offsetTop + offsetHeight*0.5`) → screenshot: **ruotato e più grande** della posizione precedente, deformato
- verificare che il testo resti fermo mentre lo sfondo cambia (pin attivo)
- `browser_console_messages` → zero errori, in particolare nessun warning WebGL di context perso
- Con `reducedMotion: 'reduce'`: figura ferma, nessun pin, la sezione scorre normalmente

- [ ] **Step 5: Commit**

```bash
git add website-creation/
git commit -m "feat(wc): cap. 03 oggetto 3D pinnato guidato dallo scroll

Deformazione a partire da una copia delle posizioni originali per evitare
accumulo. Su mobile e reduced-motion: singolo frame statico."
```

---

### Task 7: Capitolo 04 — carosello infinito con inerzia

**Files:**
- Modify: `website-creation/index.html`
- Modify: `website-creation/css/sections.css`
- Create: `website-creation/js/carousel.js`

**Interfaces:**
- Consumes: `WC.register`.
- Produces: niente per i task successivi.

- [ ] **Step 1: Markup — 8 tessere, contenuto procedurale (nessuna immagine)**

```html
<section class="wc-carousel" id="cap04" data-cursor="grab" data-cursor-label="TRASCINA">
  <p class="eyebrow">// 04 — Movimento continuo</p>
  <h2>Trascina. Ha una massa.</h2>
  <div class="wc-track-wrap">
    <div class="wc-track" id="wcTrack">
      <div class="wc-tile" data-g="1"><span>Editoriale</span></div>
      <div class="wc-tile" data-g="2"><span>Brutalista</span></div>
      <div class="wc-tile" data-g="3"><span>Minimale</span></div>
      <div class="wc-tile" data-g="4"><span>Cinetico</span></div>
      <div class="wc-tile" data-g="5"><span>Immersivo</span></div>
      <div class="wc-tile" data-g="6"><span>Tipografico</span></div>
      <div class="wc-tile" data-g="7"><span>Materico</span></div>
      <div class="wc-tile" data-g="8"><span>Essenziale</span></div>
    </div>
  </div>
</section>
```

Script: `<script src="js/carousel.js"></script>`

- [ ] **Step 2: Stili — gradienti procedurali, zero asset**

```css
/* ---- CAP 04 — CAROSELLO ---- */
.wc-carousel{display:flex;flex-direction:column;gap:1.4rem;overflow:hidden;}
.wc-track-wrap{margin-top:2rem;cursor:grab;user-select:none;}
.wc-track-wrap.dragging{cursor:grabbing;}
.wc-track{display:flex;gap:1.2rem;will-change:transform;}
.wc-tile{flex:0 0 clamp(200px,24vw,320px);aspect-ratio:4/5;border-radius:4px;
  border:1px solid var(--border2);position:relative;overflow:hidden;
  display:flex;align-items:flex-end;padding:1.2rem;}
.wc-tile span{font-family:var(--mono);font-size:.72rem;letter-spacing:.12em;
  text-transform:uppercase;color:var(--white);position:relative;z-index:1;}
.wc-tile::before{content:'';position:absolute;inset:0;opacity:.85;}
.wc-tile[data-g="1"]::before{background:radial-gradient(120% 90% at 10% 10%,#00d4ff33,transparent 60%),linear-gradient(160deg,#0b0b12,#101019);}
.wc-tile[data-g="2"]::before{background:repeating-linear-gradient(45deg,#0b0b12 0 12px,#101019 12px 24px);}
.wc-tile[data-g="3"]::before{background:linear-gradient(180deg,#101019,#060609);}
.wc-tile[data-g="4"]::before{background:conic-gradient(from 210deg at 60% 40%,#00d4ff22,#00e8a222,#0b0b12,#00d4ff22);}
.wc-tile[data-g="5"]::before{background:radial-gradient(80% 60% at 50% 110%,#00e8a233,transparent 70%),#0b0b12;}
.wc-tile[data-g="6"]::before{background:linear-gradient(90deg,#0b0b12 0 50%,#101019 50% 100%);}
.wc-tile[data-g="7"]::before{background:radial-gradient(60% 60% at 30% 70%,#00d4ff26,transparent),radial-gradient(50% 50% at 80% 20%,#00e8a21f,transparent),#060609;}
.wc-tile[data-g="8"]::before{background:#0b0b12;}
```

- [ ] **Step 3: Creare `website-creation/js/carousel.js`**

```js
WC.register('carousel', function(ctx){
  var wrap  = document.querySelector('.wc-track-wrap');
  var track = document.getElementById('wcTrack');
  if (!track) return;

  // Il loop infinito richiede il contenuto duplicato: si scorre di una
  // larghezza intera e si riavvolge, quindi serve un secondo giro visibile.
  var original = track.innerHTML;
  track.innerHTML = original + original;

  var half = 0;
  function measure(){ half = track.scrollWidth / 2; }
  measure();
  window.addEventListener('resize', measure);

  var x = 0, auto = ctx.motionOk ? -0.55 : 0, vel = 0;
  var dragging = false, lastX = 0, raf;

  function render(){
    x += auto + vel;
    vel *= .92;                       // inerzia: decade dolcemente
    if (x <= -half) x += half;        // riavvolgimento in entrambe le direzioni
    if (x > 0)      x -= half;
    track.style.transform = 'translate3d(' + x.toFixed(2) + 'px,0,0)';
    raf = requestAnimationFrame(render);
  }
  render();

  function onDown(e){
    dragging = true; wrap.classList.add('dragging');
    lastX = (e.touches ? e.touches[0].clientX : e.clientX);
    vel = 0;
  }
  function onMove(e){
    if (!dragging) return;
    var cx = (e.touches ? e.touches[0].clientX : e.clientX);
    var dx = cx - lastX; lastX = cx;
    x += dx; vel = dx * .35;
  }
  function onUp(){ dragging = false; wrap.classList.remove('dragging'); }

  wrap.addEventListener('mousedown', onDown);
  window.addEventListener('mousemove', onMove);
  window.addEventListener('mouseup', onUp);
  wrap.addEventListener('touchstart', onDown, { passive: true });
  window.addEventListener('touchmove', onMove, { passive: true });
  window.addEventListener('touchend', onUp);

  // La velocità dello scroll verticale spinge il nastro: lo scroll
  // "trascina" il carosello, che è l'effetto da dimostrare.
  var st = null;
  if (ctx.motionOk) {
    st = ScrollTrigger.create({
      trigger: '#cap04', start: 'top bottom', end: 'bottom top',
      onUpdate: function(self){
        vel += gsap.utils.clamp(-12, 12, self.getVelocity() * -0.0016);
      }
    });
  }

  return function(){
    cancelAnimationFrame(raf);
    st && st.kill();
    window.removeEventListener('resize', measure);
    wrap.removeEventListener('mousedown', onDown);
    window.removeEventListener('mousemove', onMove);
    window.removeEventListener('mouseup', onUp);
    track.innerHTML = original;
  };
});
```

- [ ] **Step 4: Verificare**

Playwright MCP:
- scrollare al `cap04`, screenshot → 8 tessere con gradienti diversi, nessuna immagine caricata
- `browser_drag` da una tessera verso sinistra → screenshot: il nastro si è spostato e continua per inerzia
- `browser_evaluate` per confermare che il transform non superi mai il mezzo giro:
  ```js
  () => document.getElementById('wcTrack').style.transform
  ```
  Chiamata due volte a distanza: il valore cambia ma resta nell'intervallo `[-half, 0]`.
- `browser_network_requests` → **nessuna richiesta di immagini** dalla sezione
- Con `reducedMotion: 'reduce'`: nessuno scorrimento automatico, il drag resta possibile

- [ ] **Step 5: Commit**

```bash
git add website-creation/
git commit -m "feat(wc): cap. 04 carosello infinito con inerzia

Tessere a gradiente procedurale, zero asset. La velocità dello scroll
verticale spinge il nastro. Con reduced-motion l'autoscroll è fermo."
```

---

### Task 8: Capitolo 05 — griglia bento con spotlight e icone Lottie

**Files:**
- Modify: `website-creation/index.html`
- Modify: `website-creation/css/sections.css`
- Create: `website-creation/js/bento.js`
- Create: `website-creation/assets/icon-velocita.json`, `icon-responsive.json`, `icon-seo.json`, `icon-accessibile.json`

**Interfaces:**
- Consumes: `WC.register`.
- Produces: niente per i task successivi.

- [ ] **Step 1: Generare 4 Lottie con la skill `text-to-lottie`**

Quattro icone lineari, tratto 2px, colore `#00d4ff`, canvas 120×120, loop, **senza expressions**, solo shape layer:

| File | Soggetto |
|---|---|
| `icon-velocita.json` | fulmine che si disegna e pulsa |
| `icon-responsive.json` | rettangolo che si trasforma da desktop a mobile |
| `icon-seo.json` | lente che scorre su tre righe di testo |
| `icon-accessibile.json` | cerchio con figura stilizzata, anello che ruota |

- [ ] **Step 2: Markup**

```html
<section class="wc-bento" id="cap05" data-cursor="cross">
  <p class="eyebrow">// 05 — Cosa c'è sotto</p>
  <h2>Bello è il minimo.<br>Il resto è ingegneria.</h2>
  <div class="wc-bento-grid">
    <article class="wc-card wc-hover" data-lottie="assets/icon-velocita.json" style="--span:2">
      <div class="wc-card-icon"></div>
      <h3>Velocità</h3>
      <p>Caricamento sotto il secondo. Niente framework di troppo, niente librerie che non servono a chi guarda.</p>
    </article>
    <article class="wc-card wc-hover" data-lottie="assets/icon-responsive.json">
      <div class="wc-card-icon"></div>
      <h3>Responsive</h3>
      <p>Progettato prima per il telefono, dove arriva davvero il traffico.</p>
    </article>
    <article class="wc-card wc-hover" data-lottie="assets/icon-seo.json">
      <div class="wc-card-icon"></div>
      <h3>SEO</h3>
      <p>Struttura semantica, metadati, sitemap. Trovabile, non solo visibile.</p>
    </article>
    <article class="wc-card wc-hover" data-lottie="assets/icon-accessibile.json" style="--span:2">
      <div class="wc-card-icon"></div>
      <h3>Accessibile</h3>
      <p>Contrasti verificati, navigazione da tastiera, rispetto di chi ha disattivato le animazioni. Non è un extra.</p>
    </article>
  </div>
</section>
```

Script: `<script src="js/bento.js"></script>`

- [ ] **Step 3: Stili**

```css
/* ---- CAP 05 — BENTO ---- */
.wc-bento{display:flex;flex-direction:column;gap:1.4rem;}
.wc-bento-grid{margin-top:2rem;display:grid;gap:1.2rem;
  grid-template-columns:repeat(3,1fr);}
.wc-card{grid-column:span var(--span,1);border:1px solid var(--border);
  border-radius:6px;background:var(--bg2);padding:1.8rem;
  display:flex;flex-direction:column;gap:.7rem;position:relative;overflow:hidden;}
.wc-card::before{content:'';position:absolute;inset:0;pointer-events:none;
  opacity:0;transition:opacity .3s;
  background:radial-gradient(220px circle at var(--mx,50%) var(--my,50%),
    rgba(0,212,255,.14),transparent 70%);}
.wc-card:hover::before{opacity:1;}
.wc-card-icon{width:44px;height:44px;}
.wc-card h3{font-size:1.05rem;font-weight:600;}
.wc-card p{color:var(--muted);font-size:.9rem;}
@media (max-width:899px){
  .wc-bento-grid{grid-template-columns:1fr;}
  .wc-card{grid-column:span 1;}
}
```

- [ ] **Step 4: Creare `website-creation/js/bento.js`**

```js
WC.register('bento', function(ctx){
  var cards = document.querySelectorAll('.wc-card');
  if (!cards.length) return;
  var anims = [], cleanups = [];

  cards.forEach(function(card){
    // --- icona Lottie ---
    var box  = card.querySelector('.wc-card-icon');
    var path = card.getAttribute('data-lottie');
    if (box && path && typeof lottie !== 'undefined') {
      var a = lottie.loadAnimation({
        container: box, renderer: 'svg',
        loop: ctx.motionOk, autoplay: ctx.motionOk, path: path
      });
      // Reduced-motion: fermo sul primo fotogramma, non nascosto.
      if (!ctx.motionOk) a.addEventListener('DOMLoaded', function(){ a.goToAndStop(0, true); });
      anims.push(a);
    }

    // --- spotlight che segue il cursore ---
    // Unico segnale di hover della card (atelier D20). Niente tilt 3D,
    // niente bordo illuminato: tre segnali contemporanei sono rumore.
    var onMove = function(e){
      var r = card.getBoundingClientRect();
      card.style.setProperty('--mx', (e.clientX - r.left) + 'px');
      card.style.setProperty('--my', (e.clientY - r.top)  + 'px');
    };
    card.addEventListener('mousemove', onMove);
    cleanups.push(function(){
      card.removeEventListener('mousemove', onMove);
    });
  });

  // --- ingresso in scroll ---
  if (ctx.motionOk) {
    gsap.from(cards, {
      opacity: 0, y: 40, duration: .7, ease: 'power2.out', stagger: .08,
      scrollTrigger: { trigger: '#cap05', start: 'top 70%' }
    });
  }

  return function(){
    cleanups.forEach(function(f){ f(); });
    anims.forEach(function(a){ a.destroy(); });
  };
});
```

- [ ] **Step 5: Verificare**

Playwright MCP:
- scrollare al `cap05`, screenshot → 4 card, layout 2+1+1+2 su desktop, icone Lottie animate
- `browser_hover` su una card, poi screenshot → alone ciano sotto il cursore e card inclinata
- `browser_console_messages` → zero errori, nessun 404 sui 4 JSON
- `browser_resize` a 500×900 → screenshot: una colonna, nessuna card tagliata
- Con `reducedMotion: 'reduce'`: icone **visibili ma ferme**, nessun tilt

- [ ] **Step 6: Commit**

```bash
git add website-creation/
git commit -m "feat(wc): cap. 05 griglia bento con tilt e icone Lottie

Quattro Lottie generati con text-to-lottie, riprodotti da lottie_light.
Con reduced-motion restano sul primo fotogramma, non spariscono."
```

---

### Task 9: Capitolo 06 — playground shader WebGL

**Files:**
- Modify: `website-creation/index.html`
- Modify: `website-creation/css/sections.css`
- Create: `website-creation/js/shader.js`

**Interfaces:**
- Consumes: `WC.register`, `THREE` (già caricato dal Task 6).
- Produces: niente per i task successivi.

La texture è **generata a runtime in un canvas 2D** e passata a `THREE.CanvasTexture`: nessun file immagine, coerente col vincolo procedurale.

- [ ] **Step 1: Markup**

```html
<section class="wc-shader" id="cap06" data-cursor="invert" data-cursor-label="CLICCA">
  <p class="eyebrow">// 06 — Interazione</p>
  <h2>Passaci sopra. Cliccaci.</h2>
  <p class="lead">Questa superficie non è un video. È una griglia di pixel che reagisce al tuo cursore in tempo reale.</p>
  <div class="wc-shader-stage" id="wcShaderStage">
    <canvas id="wcShaderCanvas"></canvas>
  </div>
</section>
```

Script: `<script src="js/shader.js"></script>`

- [ ] **Step 2: Stili**

```css
/* ---- CAP 06 — SHADER ---- */
.wc-shader{display:flex;flex-direction:column;gap:1.2rem;}
.wc-shader-stage{margin-top:2rem;width:100%;aspect-ratio:16/9;
  border:1px solid var(--border2);border-radius:6px;overflow:hidden;
  position:relative;background:var(--bg2);}
#wcShaderCanvas{width:100%;height:100%;display:block;}
.wc-shader-stage.static-fallback{display:flex;align-items:center;
  justify-content:center;color:var(--dim);font-family:var(--mono);font-size:.8rem;}
```

- [ ] **Step 3: Creare `website-creation/js/shader.js`**

```js
WC.register('shader', function(ctx){
  var stage  = document.getElementById('wcShaderStage');
  var canvas = document.getElementById('wcShaderCanvas');
  if (!canvas || typeof THREE === 'undefined') return;

  // Reduced-motion o mobile: si mostra la texture piatta, senza WebGL.
  if (!ctx.motionOk || !ctx.desktop) {
    canvas.remove();
    stage.classList.add('static-fallback');
    stage.textContent = 'AXXELL — superficie interattiva disattivata';
    return;
  }

  // --- texture procedurale: nessun file immagine ---
  function buildTexture(){
    var c = document.createElement('canvas');
    c.width = 1024; c.height = 576;
    var g = c.getContext('2d');
    var grad = g.createLinearGradient(0, 0, 1024, 576);
    grad.addColorStop(0, '#0b0b12');
    grad.addColorStop(.5, '#101019');
    grad.addColorStop(1, '#060609');
    g.fillStyle = grad; g.fillRect(0, 0, 1024, 576);
    g.strokeStyle = 'rgba(0,212,255,.18)'; g.lineWidth = 1;
    for (var x = 0; x <= 1024; x += 32) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, 576); g.stroke(); }
    for (var y = 0; y <= 576;  y += 32) { g.beginPath(); g.moveTo(0, y); g.lineTo(1024, y); g.stroke(); }
    g.fillStyle = '#f0f0f6';
    g.font = '600 108px "Space Grotesk", sans-serif';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('AXXELL', 512, 288);
    return new THREE.CanvasTexture(c);
  }

  var renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  var scene  = new THREE.Scene();
  var camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

  var uniforms = {
    uTex:    { value: buildTexture() },
    uMouse:  { value: new THREE.Vector2(.5, .5) },
    uTime:   { value: 0 },
    uRipple: { value: 0 }
  };

  var mat = new THREE.ShaderMaterial({
    uniforms: uniforms,
    vertexShader: [
      'varying vec2 vUv;',
      'void main(){ vUv = uv; gl_Position = vec4(position, 1.0); }'
    ].join('\n'),
    fragmentShader: [
      'precision mediump float;',
      'varying vec2 vUv;',
      'uniform sampler2D uTex;',
      'uniform vec2 uMouse;',
      'uniform float uTime;',
      'uniform float uRipple;',
      'void main(){',
      '  vec2 uv = vUv;',
      '  float d = distance(uv, uMouse);',
      // rigonfiamento attorno al cursore
      '  float bulge = smoothstep(0.32, 0.0, d) * 0.06;',
      '  uv += normalize(uv - uMouse) * bulge;',
      // onda al click
      '  float ring = sin(d * 34.0 - uTime * 6.0) * uRipple * 0.02;',
      '  uv += normalize(uv - uMouse) * ring;',
      // aberrazione cromatica: separa i canali sulla distorsione
      '  float sep = (bulge + abs(ring)) * 0.5;',
      '  float r = texture2D(uTex, uv + vec2(sep, 0.0)).r;',
      '  float g = texture2D(uTex, uv).g;',
      '  float b = texture2D(uTex, uv - vec2(sep, 0.0)).b;',
      '  gl_FragColor = vec4(r, g, b, 1.0);',
      '}'
    ].join('\n')
  });

  scene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat));

  function resize(){ renderer.setSize(stage.clientWidth, stage.clientHeight, false); }
  resize();
  window.addEventListener('resize', resize);

  var raf;
  function frame(){
    uniforms.uTime.value = performance.now() * .001;
    uniforms.uRipple.value *= .94;   // l'onda si spegne da sola
    renderer.render(scene, camera);
    raf = requestAnimationFrame(frame);
  }
  frame();

  var onMove = function(e){
    var r = stage.getBoundingClientRect();
    uniforms.uMouse.value.set(
      (e.clientX - r.left) / r.width,
      1 - (e.clientY - r.top) / r.height
    );
  };
  var onClick = function(){ uniforms.uRipple.value = 1; };
  stage.addEventListener('mousemove', onMove);
  stage.addEventListener('click', onClick);

  return function(){
    cancelAnimationFrame(raf);
    window.removeEventListener('resize', resize);
    stage.removeEventListener('mousemove', onMove);
    stage.removeEventListener('click', onClick);
    mat.dispose(); uniforms.uTex.value.dispose(); renderer.dispose();
  };
});
```

- [ ] **Step 4: Verificare**

Playwright MCP:
- scrollare al `cap06`, screenshot → griglia con la scritta AXXELL
- `browser_hover` al centro dello stage, screenshot → la scritta è **visibilmente deformata** vicino al cursore, con frangia colorata ai bordi
- `browser_click` sullo stage, screenshot immediato → anello di distorsione
- `browser_console_messages` → zero errori, nessun errore di compilazione shader (`THREE.WebGLProgram`)
- Con `reducedMotion: 'reduce'` o viewport 500px: lo stage mostra il testo di fallback e **nessun canvas** nel DOM

- [ ] **Step 5: Commit**

```bash
git add website-creation/
git commit -m "feat(wc): cap. 06 playground shader con distorsione e ripple

Texture generata in canvas 2D e passata a CanvasTexture: nessun file
immagine. Fallback testuale su mobile e reduced-motion."
```

---

### Task 10: Capitolo 07 — processo in scroll orizzontale

**Files:**
- Modify: `website-creation/index.html`
- Modify: `website-creation/css/sections.css`
- Create: `website-creation/js/horizontal.js`

**Interfaces:**
- Consumes: `WC.register`.
- Produces: niente per i task successivi.

- [ ] **Step 1: Markup**

```html
<section class="wc-process" id="cap07" data-cursor="arrow">
  <div class="wc-process-pin" id="wcProcessPin">
    <div class="wc-process-head">
      <p class="eyebrow">// 07 — Processo</p>
      <h2>Quattro passaggi.</h2>
      <div class="wc-progress"><span id="wcProgressBar"></span></div>
    </div>
    <div class="wc-process-row" id="wcProcessRow">
      <article class="wc-step"><span class="wc-step-n">01</span><h3>Ascolto</h3><p>Capiamo a chi parla il sito e cosa deve ottenere. Prima di qualsiasi pixel.</p></article>
      <article class="wc-step"><span class="wc-step-n">02</span><h3>Direzione</h3><p>Definiamo tono, tipografia, colore e movimento. Una direzione sola, non tre da scegliere.</p></article>
      <article class="wc-step"><span class="wc-step-n">03</span><h3>Costruzione</h3><p>Sviluppo su misura. Nessun tema comprato, nessun page builder.</p></article>
      <article class="wc-step"><span class="wc-step-n">04</span><h3>Vita</h3><p>Messa online, misurazione, correzioni. Un sito è vivo o è un volantino.</p></article>
    </div>
  </div>
</section>
```

Script: `<script src="js/horizontal.js"></script>`

- [ ] **Step 2: Stili**

```css
/* ---- CAP 07 — PROCESSO ORIZZONTALE ---- */
.wc-process{padding:0;height:340svh;}
.wc-process-pin{height:100svh;display:flex;flex-direction:column;
  justify-content:center;gap:2.5rem;overflow:hidden;
  padding:0 clamp(1.5rem,5vw,4rem);}
.wc-process-head{display:flex;flex-direction:column;gap:.8rem;}
.wc-progress{width:min(320px,60vw);height:1px;background:var(--border2);position:relative;}
.wc-progress span{position:absolute;inset:0;width:0%;background:var(--cyan);display:block;}
.wc-process-row{display:flex;gap:2rem;will-change:transform;}
.wc-step{flex:0 0 min(78vw,460px);border-left:1px solid var(--border2);
  padding-left:1.5rem;display:flex;flex-direction:column;gap:.7rem;}
.wc-step-n{font-family:var(--mono);font-size:.72rem;color:var(--cyan);letter-spacing:.14em;}
.wc-step h3{font-size:1.6rem;font-weight:600;}
.wc-step p{color:var(--muted);}
/* Sotto i 900px il pin si disattiva (vedi horizontal.js): la fila
   diventa una colonna leggibile senza scroll orizzontale. */
@media (max-width:899px){
  .wc-process{height:auto;}
  .wc-process-pin{height:auto;padding-top:5rem;padding-bottom:5rem;}
  .wc-process-row{flex-direction:column;transform:none!important;}
  .wc-step{flex:0 0 auto;}
}
```

- [ ] **Step 3: Creare `website-creation/js/horizontal.js`**

```js
WC.register('horizontal', function(ctx){
  var sec = document.getElementById('cap07');
  var pin = document.getElementById('wcProcessPin');
  var row = document.getElementById('wcProcessRow');
  var bar = document.getElementById('wcProgressBar');
  if (!row) return;

  // Mobile o reduced-motion: colonna verticale, nessun pin.
  // Il CSS ha già impostato il layout; qui basta riempire la barra.
  if (!ctx.motionOk || !ctx.desktop) {
    if (bar) bar.style.width = '100%';
    return;
  }

  var distance = 0;
  function measure(){ distance = row.scrollWidth - pin.clientWidth + 64; }
  measure();

  var tween = gsap.to(row, {
    x: function(){ return -distance; },
    ease: 'none',
    scrollTrigger: {
      trigger: sec,
      start: 'top top',
      end: 'bottom bottom',
      pin: pin,
      scrub: .4,
      invalidateOnRefresh: true,
      onRefresh: measure,
      onUpdate: function(self){
        if (bar) bar.style.width = (self.progress * 100).toFixed(1) + '%';
      }
    }
  });

  return function(){
    tween.scrollTrigger && tween.scrollTrigger.kill();
    tween.kill();
    gsap.set(row, { x: 0 });
  };
});
```

- [ ] **Step 4: Verificare**

Playwright MCP:
- scrollare all'inizio del `cap07`, screenshot → si vede il passo 01, barra vuota
- scrollare a `offsetTop + offsetHeight*0.8`, screenshot → si vede il passo 04, barra quasi piena, l'intestazione **non si è mossa**
- `browser_resize` a 500×900 → screenshot: i 4 passi in colonna, nessun taglio orizzontale, nessuna barra di scroll laterale
- `browser_evaluate`:
  ```js
  () => document.documentElement.scrollWidth <= window.innerWidth
  ```
  Atteso: `true` — mai overflow orizzontale del documento
- `browser_console_messages` → zero errori

- [ ] **Step 5: Commit**

```bash
git add website-creation/
git commit -m "feat(wc): cap. 07 processo in scroll orizzontale pinnato

Sotto i 900px il pin si disattiva e i passi diventano una colonna."
```

---

### Task 11: Capitolo 08 — CTA, form EmailJS, conferma Lottie

**Files:**
- Modify: `website-creation/index.html`
- Modify: `website-creation/css/sections.css`
- Create: `website-creation/js/form.js`
- Create: `website-creation/assets/success.json`

**Interfaces:**
- Consumes: `WC.register`.
- Produces: niente — è l'ultimo capitolo.

- [ ] **Step 1: Generare `assets/success.json` con `text-to-lottie`**

Spunta che si disegna dentro un cerchio, colore `#00e8a2`, canvas 120×120, durata .9s, **non in loop**, senza expressions.

- [ ] **Step 2: Markup**

```html
<section class="wc-cta" id="cap08" data-cursor="caret">
  <p class="eyebrow">// 08 — Parliamone</p>
  <h2>Raccontaci cosa deve fare<br>il tuo sito.</h2>
  <form class="wc-form" id="wcForm" novalidate>
    <div class="wc-field">
      <input type="text" id="wcNome" name="nome" required placeholder=" ">
      <label for="wcNome">Nome</label>
    </div>
    <div class="wc-field">
      <input type="email" id="wcEmail" name="email" required placeholder=" ">
      <label for="wcEmail">Email</label>
    </div>
    <div class="wc-field">
      <textarea id="wcMsg" name="messaggio" rows="4" required placeholder=" "></textarea>
      <label for="wcMsg">Cosa hai in mente</label>
    </div>
    <button type="submit" class="wc-submit wc-hover" id="wcSubmit">
      <span id="wcSubmitLabel">Invia</span>
    </button>
    <p class="wc-form-err" id="wcFormErr" role="alert" hidden></p>
  </form>
  <div class="wc-form-ok" id="wcFormOk" hidden>
    <div class="wc-form-ok-lottie" id="wcFormOkLottie"></div>
    <p>Ricevuto. Ti rispondiamo entro un giorno lavorativo.</p>
  </div>
</section>
```

Script: `<script src="https://cdn.jsdelivr.net/npm/@emailjs/browser@4/dist/email.min.js"></script>` e `<script src="js/form.js"></script>`

- [ ] **Step 3: Stili**

```css
/* ---- CAP 08 — CTA + FORM ---- */
.wc-cta{display:flex;flex-direction:column;gap:1.4rem;min-height:90svh;
  justify-content:center;}
.wc-form{margin-top:2rem;display:flex;flex-direction:column;gap:1.6rem;
  max-width:34rem;width:100%;}
.wc-field{position:relative;}
.wc-field input,.wc-field textarea{width:100%;background:transparent;
  border:0;border-bottom:1px solid var(--border2);color:var(--white);
  font-family:var(--font);font-size:1rem;padding:.9rem 0 .5rem;resize:vertical;}
.wc-field input:focus,.wc-field textarea:focus{outline:none;border-color:var(--cyan);}
.wc-field label{position:absolute;left:0;top:.9rem;color:var(--dim);
  font-size:1rem;pointer-events:none;
  transition:transform .25s ease,font-size .25s ease,color .25s ease;
  transform-origin:left top;}
.wc-field input:focus + label,.wc-field input:not(:placeholder-shown) + label,
.wc-field textarea:focus + label,.wc-field textarea:not(:placeholder-shown) + label{
  transform:translateY(-1.35rem) scale(.75);color:var(--cyan);}
.wc-submit{align-self:flex-start;background:var(--cyan);color:#060609;
  border:0;border-radius:2px;padding:.9rem 2rem;font-family:var(--font);
  font-weight:600;font-size:.92rem;cursor:pointer;}
.wc-submit[disabled]{opacity:.5;cursor:progress;}
.wc-form-err{color:#ff5c5c;font-size:.85rem;}
.wc-form-ok{margin-top:2rem;display:flex;align-items:center;gap:1rem;
  color:var(--green);}
.wc-form-ok-lottie{width:56px;height:56px;}
```

Nota sul `placeholder=" "`: serve a far funzionare `:not(:placeholder-shown)` per l'etichetta flottante. Non rimuoverlo.

- [ ] **Step 4: Creare `website-creation/js/form.js`**

```js
WC.register('form', function(ctx){
  var form   = document.getElementById('wcForm');
  var btn    = document.getElementById('wcSubmit');
  var label  = document.getElementById('wcSubmitLabel');
  var err    = document.getElementById('wcFormErr');
  var ok     = document.getElementById('wcFormOk');
  if (!form || typeof emailjs === 'undefined') return;

  // Chiavi pubbliche, identiche a quelle già in uso su index.html.
  emailjs.init('Jass-MWY1fZy7RTCk');

  function fail(msg){ err.textContent = msg; err.hidden = false; }

  var onSubmit = function(e){
    e.preventDefault();
    err.hidden = true;

    var nome  = document.getElementById('wcNome').value.trim();
    var email = document.getElementById('wcEmail').value.trim();
    var msg   = document.getElementById('wcMsg').value.trim();

    if (!nome || !email || !msg) { fail('Compila tutti i campi.'); return; }
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { fail('Email non valida.'); return; }

    btn.disabled = true;
    label.textContent = 'Invio…';

    emailjs.send('service_ma1qdph', 'template_btru4ua', {
      nome: nome,
      email: email,
      messaggio: msg,
      origine: 'website-creation'
    }).then(function(){
      form.hidden = true;
      ok.hidden = false;
      if (typeof lottie !== 'undefined') {
        var a = lottie.loadAnimation({
          container: document.getElementById('wcFormOkLottie'),
          renderer: 'svg', loop: false, autoplay: ctx.motionOk,
          path: 'assets/success.json'
        });
        if (!ctx.motionOk) a.addEventListener('DOMLoaded', function(){ a.goToAndStop(a.totalFrames - 1, true); });
      }
    }).catch(function(e2){
      console.error('[WC] invio fallito', e2);
      btn.disabled = false;
      label.textContent = 'Invia';
      fail('Invio non riuscito. Scrivi a info@axxell.ai.');
    });
  };

  form.addEventListener('submit', onSubmit);
  return function(){ form.removeEventListener('submit', onSubmit); };
});
```

Nota: con reduced-motion il Lottie di conferma va all'**ultimo** fotogramma (spunta completa), non al primo — un primo fotogramma vuoto non comunicherebbe il successo.

- [ ] **Step 5: Verificare la validazione senza inviare davvero**

Playwright MCP:
- `browser_fill_form` lasciando l'email vuota → `browser_click` su Invia → screenshot: messaggio "Compila tutti i campi."
- email malformata (`pippo@`) → screenshot: "Email non valida."
- `browser_evaluate` per confermare che nessuna chiamata sia partita:
  ```js
  () => document.getElementById('wcFormOk').hidden
  ```
  Atteso: `true`
- verifica etichette flottanti: `browser_click` sul campo Nome → screenshot: l'etichetta è salita ed è ciano

- [ ] **Step 6: Invio reale, una volta sola**

Compilare con dati veri (`nome: Test Axxell`, la tua email, messaggio `test website-creation`) e inviare. Atteso: il form sparisce, compare la spunta verde Lottie. **Controllare che la mail sia arrivata a `info@axxell.ai`** — questo è il criterio 5 della spec e non è verificabile dal browser.

- [ ] **Step 7: Commit**

```bash
git add website-creation/
git commit -m "feat(wc): cap. 08 CTA con form EmailJS e conferma Lottie

Riusa service_ma1qdph/template_btru4ua con campo origine per distinguere
le richieste dalla pagina Website Creation."
```

---

### Task 12: Innesti nel sito madre, sitemap, verifica finale

**Files:**
- Modify: `index.html` (2 sole aggiunte)
- Modify: `sitemap.xml`

**Interfaces:**
- Consumes: la pagina completa dei Task 1-11.
- Produces: il collegamento pubblico. Ultimo task.

- [ ] **Step 1: Aggiungere la voce in nav — desktop**

In `index.html`, dentro `<ul class="nav-links">` (intorno a riga 1448-1451), **dopo** l'`<li>` di Visione:

```html
<li><a href="/website-creation/" id="n-wc">Website Creation</a></li>
```

È un `href` vero, non `onclick="return go(...)"`: la pagina è un documento separato.

- [ ] **Step 2: Aggiungere la voce nel dropdown mobile**

Dentro `<div class="mobile-dropdown" id="mobileDropdown">` (intorno a riga 1441-1444), dopo la voce Visione:

```html
<a href="/website-creation/">Website Creation</a>
```

- [ ] **Step 3: Aggiungere il link nella scheda `// 02`**

Nella sezione "Servizi complementari" di `p-servizi`, nella card "Website Creation", aggiungere in fondo alla card:

```html
<a href="/website-creation/" class="hp-link">Scopri <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="12" height="12"><polyline points="9 18 15 12 9 6"/></svg></a>
```

La classe `hp-link` esiste già nel CSS del sito (usata dalle card della home) — riusarla, non crearne una nuova.

- [ ] **Step 4: Aggiungere l'URL al `sitemap.xml`**

```xml
<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>https://axxell.ai/</loc>
    <priority>1.0</priority>
  </url>
  <url>
    <loc>https://axxell.ai/website-creation/</loc>
    <priority>0.8</priority>
  </url>
</urlset>
```

- [ ] **Step 5: Verificare che `index.html` abbia SOLO aggiunte**

Questo è il vincolo primario della spec. Non è negoziabile.

```bash
git diff main -- index.html
```

Atteso: **solo righe `+`**, esattamente tre (le due voci di nav e il link nella card). **Zero righe `-`.** Se compare una sola riga `-`, va ripristinata prima di procedere.

Conferma numerica:
```bash
git diff main -- index.html | grep -c '^-[^-]'
```
Atteso: `0`

- [ ] **Step 6: Verificare che il sito madre sia intatto**

Playwright MCP su `http://localhost:8899/`:
- `browser_console_messages` → zero errori
- navigare con `go()` su tutte le pagine: home → Sabe → ATLAS → Servizi → Visione. Screenshot di ciascuna.
- verificare che lo scroll sia **quello nativo di prima** (nessun Lenis: è confinato all'altra pagina)
- cliccare la nuova voce di nav → deve caricare `/website-creation/`
- dalla pagina Servizi, cliccare "Scopri" nella card `// 02` → stessa destinazione

- [ ] **Step 7: Verificare il budget**

```bash
du -sh website-creation/
du -ch website-creation/index.html website-creation/css/*.css website-creation/js/*.js | tail -1
```

Atteso: la seconda cifra (HTML+CSS+JS, esclusi i JSON Lottie) **sotto 500KB**. Se sfora, il colpevole più probabile è un Lottie finito nella cartella sbagliata o un asset inline — cercare con:
```bash
grep -c 'base64' website-creation/index.html website-creation/css/*.css
```
Atteso: `0` ovunque tranne l'eventuale grana SVG in `base.css`, che è `svg+xml` e non `base64`.

- [ ] **Step 8: Passata finale sui criteri di riuscita**

Ripercorrere i 6 criteri della spec, uno per uno, e annotare l'esito:

1. La pagina si apre e i 9 capitoli funzionano — Chrome via Playwright; Safari e Firefox a mano se disponibili, altrimenti annotare come non verificato invece di darlo per buono.
2. `index.html` differisce per sole aggiunte — Step 5.
3. Reduced-motion: pagina leggibile e navigabile — rifare un giro completo con `emulateMedia({reducedMotion:'reduce'})`, screenshot di ogni capitolo. Nessun testo invisibile, nessuna sezione vuota.
4. Peso sotto 500KB — Step 7.
5. Il form recapita a `info@axxell.ai` — Task 11 Step 6.
6. `sitemap.xml` include il nuovo URL — Step 4.

- [ ] **Step 9: Commit**

```bash
git add index.html sitemap.xml
git commit -m "feat: collega la pagina Website Creation

Due voci di nav (desktop e mobile), un link nella card // 02 dei servizi,
e il nuovo URL nella sitemap. Nessuna riga esistente modificata."
```

---

## Note per chi implementa

- **Il vincolo che conta più di tutti** è che `index.html` cambi solo per aggiunta. Se un task sembra richiedere una modifica al sito madre, fermarsi e chiedere: quasi certamente c'è un modo che non la richiede.
- **Ogni sezione JS deve restituire la sua funzione di cleanup.** `gsap.matchMedia()` la chiama quando le condizioni cambiano (rotazione del telefono, resize oltre i 900px, cambio della preferenza di sistema). Senza cleanup si accumulano `requestAnimationFrame` e contesti WebGL — e la pagina diventa lenta proprio mentre dimostra di essere veloce.
- **Con `prefers-reduced-motion` niente deve sparire.** Il testo resta leggibile, le icone restano visibili sul primo fotogramma, le sezioni restano piene. Un capitolo vuoto è un bug, non un degrado.
- **Nessun asset in base64.** È l'errore che ha portato `index.html` a 1.8MB.
- Il server locale va riavviato solo se cade: `python -m http.server 8899` dalla radice di `axxell-site`.
