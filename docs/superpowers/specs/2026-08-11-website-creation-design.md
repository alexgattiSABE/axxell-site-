# Website Creation — pagina vetrina axxell.ai

Data: 2026-08-11
Stato: design approvato, da implementare

## Problema

`Website Creation` è già un servizio Axxell, ma sul sito vive in due righe: la scheda
`// 02` dei "Servizi complementari" in `p-servizi`. Chi vuole un sito non ha modo di
capire di cosa siamo capaci, e non esiste nessuna pagina indicizzabile che venda quel
servizio — il `sitemap.xml` contiene un solo URL, la home.

La pagina nuova deve **dimostrare** invece di raccontare: la pagina stessa è il
portfolio. Nessun cliente nominato, nessuno screenshot di lavori altrui — solo
capacità mostrate dal vivo.

## Vincolo primario

**Il sito esistente non si tocca.** Le uniche modifiche ammesse a `index.html` sono
due aggiunte di link, sotto. Nessuna riga esistente viene modificata o rimossa.

## Architettura

Documento HTML autonomo:

```
axxell-site/
  index.html                  ← sito attuale, 2 sole aggiunte
  website-creation/
    index.html                ← nuovo, autosufficiente
    assets/                   ← Lottie JSON
```

URL pubblico: `https://axxell.ai/website-creation/`

### Perché un file separato e non una sesta `.page`

`index.html` è un SPA statico con router fatto a mano (`go(name)` scambia i `div.page`).
Tre ragioni per stare fuori:

1. **Smooth scroll e scroll pinning sono globali.** Lenis e ScrollTrigger si installano
   sul documento. Dentro l'SPA altererebbero lo scroll di home, SABE, ATLAS e Visione.
   Il teardown al cambio pagina è possibile ma fragile su un router non progettato per
   il ciclo di vita — esattamente il tipo di codice che rompe il resto del sito.
2. **Peso.** `index.html` è già 1.8MB (immagini in base64 inline) e 3486 righe. Le
   librerie di questa pagina le paga solo chi la visita.
3. **SEO.** Un URL proprio, indicizzabile, per una pagina che vende un servizio.

Costo accettato: si perde la transizione istantanea dell'SPA. Il loader cinematografico
(cap. 00) copre il caricamento e diventa il primo effetto della pagina.

### Innesti in `index.html` — 2 aggiunte, 0 modifiche

1. **Nav**: un `<li><a href="/website-creation/">Website Creation</a></li>` nella lista
   desktop `.nav-links`, e la voce corrispondente in `#mobileDropdown`. Sono link
   `href` veri, non chiamate a `go()`.
2. **Scheda `// 02`**: un link `Scopri →` nella card "Website Creation" della sezione
   "Servizi complementari". Senza questo, chi arriva da Servizi non trova mai la pagina.

## Sistema di design

Token copiati da `index.html` — stesso marchio, casa diversa:

| Token | Valore |
|---|---|
| Fondo | `#060609` / `#0b0b12` / `#101019` |
| Testo | `#f0f0f6`, muted `rgba(240,240,246,.72)`, dim `.38` |
| Accento | ciano `#00d4ff` |
| Secondario | verde `#00e8a2` |
| Font | Space Grotesk (display/body), DM Mono (etichette, numeri) |
| Texture | grana SVG `feTurbulence` in overlay fisso, opacità .028 |
| Cursore | punto ciano 8px + ring 32px con lerp .12, `mix-blend-mode:screen` |

CSS e JS sono **duplicati**, non condivisi. La duplicazione (~150 righe di token, nav e
footer) è il prezzo dell'isolamento fisico ed è accettata consapevolmente.

## Stack

Tutto da CDN, nessun build step, coerente con il resto del repo.

| Libreria | Uso | Nota |
|---|---|---|
| GSAP + ScrollTrigger | sequenze, scroll-driven, pinning | `gsap.matchMedia()` per reduced-motion e breakpoint |
| Lenis | smooth scroll | confinato a questo documento |
| three.js **r128** | 3D pinnato, warp, shader | stessa versione già usata da `index.html`, non-module, stile di codice coerente |
| lottie-web **light** | animazioni Lottie | build `lottie_light` (~150KB, senza expressions): metà del player pieno |
| EmailJS | form finale | riuso `service_ma1qdph` / `template_btru4ua`, chiavi pubbliche per design |

## Struttura — 9 capitoli

L'inventario di effetti è completo per scelta, ma **ogni effetto ha una sezione sua e
un compito suo**. Nessuna sezione ne impila due che competono per l'attenzione. È così
che si ottiene l'ampiezza senza il rumore da demo reel.

| # | Sezione | Capacità dimostrata |
|---|---|---|
| 00 | Loader cinematografico | Contatore 0→100, logo rivelato in mask (**Lottie**), sipario in apertura |
| 01 | Hero — warp | Canvas hyperspace reattivo al mouse, titolo split-text cinetico, cursore magnetico |
| 02 | Manifesto | Testo rivelato parola per parola in scroll-scrub. Nessuna decorazione, solo ritmo |
| 03 | Oggetto 3D pinnato | Sezione bloccata, mesh three.js che ruota e si deforma sul progresso di scroll |
| 04 | Carosello infinito | Marquee trascinabile con inerzia, velocità legata a quella dello scroll, inversione di direzione |
| 05 | Griglia bento | Card con tilt magnetico 3D, hover rivelatore, bordo illuminato dal cursore, icone **Lottie** |
| 06 | Playground shader | Distorsione WebGL al passaggio del mouse, ripple al click. La sezione in cui l'utente gioca |
| 07 | Processo orizzontale | Scroll verticale convertito in movimento orizzontale, pinnato, con progress indicator |
| 08 | CTA + form | Micro-interazioni sui campi, stato di invio, conferma **Lottie**, EmailJS |

Testi in italiano. Contenuto: capacità e metodo. Nessun cliente nominato, nessun prezzo.

### Lottie — dove e perché

Tre usi, tutti funzionali e non decorativi:

- **00** rivelazione del logo nel loader
- **05** icone animate delle capacità nella griglia bento
- **08** conferma di invio del form

I JSON si scrivono con la skill `text-to-lottie` e si riproducono con `lottie_light`.
Ogni Lottie deve degradare a uno stato statico sotto `prefers-reduced-motion`.

## Asset

**Procedurali.** Canvas, CSS e SVG generati dal codice: gradienti animati, mesh di
particelle, pattern geometrici. Più i Lottie.

Niente immagini generate con AI — i crediti Higgsfield sono esauriti, e la scelta
procedurale evita anche l'obbligo di trasparenza dell'AI Act art. 50 (applicabile dal
2026-08-02). Niente screenshot di lavori clienti.

## Motion routing, accessibilità, budget

- **`prefers-reduced-motion`** via `gsap.matchMedia()`: 3D, warp e shader si spengono;
  restano fade e traduzioni brevi. I Lottie si fermano sul primo fotogramma. Requisito,
  non opzione.
- **Mobile**: warp e shader disattivati (costo GPU); il 3D del cap. 03 degrada a un
  singolo frame renderizzato una volta e poi fermo — niente sequenze di immagini, che
  violerebbero la scelta procedurale e il budget. Carosello, bento e processo restano.
- **Budget**: pagina sotto **500KB** esclusi i Lottie. Nessun asset in base64 inline —
  è l'errore che ha portato `index.html` a 1.8MB. Gli asset restano file esterni.
- **Continuità**: cursore custom e grana identici al sito madre.

## Criteri di riuscita

1. `axxell.ai/website-creation/` si apre e i 9 capitoli funzionano su Chrome, Safari,
   Firefox desktop e su iOS Safari.
2. `index.html` differisce dalla versione attuale per **sole aggiunte**: due link.
   Verificabile con `git diff`.
3. Con `prefers-reduced-motion: reduce` la pagina resta leggibile e navigabile, senza
   3D, warp né shader.
4. Peso della pagina sotto 500KB esclusi i Lottie.
5. Il form recapita a `info@axxell.ai` via EmailJS.
6. `sitemap.xml` include il nuovo URL.

## Fuori perimetro

- Prezzi, listini, pacchetti
- Lavori di clienti reali (Saka, Fabrizio) — né nominati né mostrati
- Modifiche a qualsiasi sezione esistente di `index.html`
- Migrazione del sito a un framework
