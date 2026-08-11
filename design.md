# design.md — axxell.ai

Scritto secondo atelier D17. Una pagina futura di questo stesso sito legge
questo file prima di costruire, per restare coerente.

## Ambito

Sito madre `index.html`: SPA statico a file singolo, preesistente, **non
ridisegnato**. Questo documento descrive le scelte della pagina
`website-creation/` e i token che eredita dal sito madre.

## Genere

Vetrina di capacità tecnica. La pagina non descrive cosa sappiamo fare: lo
fa mentre la si scorre. Nove capitoli, ognuno dimostra una capacità diversa
e ha una sezione tutta sua — l'ampiezza dell'inventario senza la
sovrapposizione da demo reel.

## Tema

Dark premium, ramo opt-in di D14. Il brief lo chiede esplicitamente
(«originale, esclusivo, premium, creativo») e il sito madre è già scuro.

## Coppia font

- Display e body: **Space Grotesk** (300–700)
- Mono, etichette e numeri: **DM Mono** (400–500)

Ereditati dal sito madre, non scelti da zero: la coerenza con `index.html`
vale più del catalogo display di D7. Nessuno dei due è nella ban-list.

## Seed colore

Valori HEX fissi ereditati dal sito madre — è il caso previsto da D8 per un
brand con valori già definiti.

| Ruolo | Valore |
|---|---|
| Fondo | `#060609` · `#0b0b12` · `#101019` |
| Testo | `#f0f0f6` · muted `rgba(240,240,246,.72)` · dim `.38` |
| Accento | ciano `#00d4ff` |
| Secondario | verde `#00e8a2` |
| Bordi | `rgba(255,255,255,.07)` · `.13` |

Nessun `#000` né `#fff` puri (D8). Unica eccezione: `#fff` come base del
cursore in stato `invert`, dove serve un bianco pieno perché
`mix-blend-mode:difference` produca l'inversione — un valore funzionale, non
un colore di superficie.

## Motion budget

Condizionato per tipo di sezione (D5):

- **Hero (cap 01):** una entrata orchestrata + warp ambientale continuo
- **Capitoli 02–07:** motion legato allo scroll, uno per capitolo, mai un
  fade-up universale
- **Cap 08:** solo micro-interazioni sui campi
- **Ambient:** solo nell'hero. Nessun livello di movimento a pagina intera

Librerie: GSAP 3.13.0 + ScrollTrigger (scroll storytelling reale, D1),
Lenis 1.1.20, three.js r128, lottie-web light 5.12.2. Tutte pinnate, tutte
con SRI.

## Deroghe consapevoli

Due, entrambe decise dall'utente dopo che gli è stato presentato il verdetto
contrario.

### D4 — quattro sezioni pinnate invece di una

> Aggiornata dopo la sessione degli effetti: erano due (cap. 03 e 07), ora
> sono quattro. Il tunnel dell'hero e la sfera→galassia sono arrivati dopo.

Il piano pinna l'hero (cap. 01), l'oggetto 3D (cap. 03), la sfera che si
sfalda in galassia (cap. 06) e il processo orizzontale (cap. 07). D4 ne
ammette una sola per pagina.

**Perché si deroga:** su questa pagina il pin non è un vezzo, è una delle
capacità in vetrina, e sono quattro pin che fanno quattro cose diverse —
attraversare, ruotare guidati dal progresso, trasformare una forma in
un'altra, convertire il verticale in orizzontale. Il costo (quattro punti in
cui lo scroll si aggancia) è accettato. Il testo storico della deroga a due
resta qui sotto perché la motivazione non è cambiata, solo il conteggio.

### D4 (testo originale) — due sezioni pinnate invece di una

Il piano pinna sia l'oggetto 3D (cap 03) sia il processo orizzontale
(cap 07). D4 ne ammette una sola per pagina.

**Perché si deroga:** su questa pagina il pin non è un vezzo, è una delle
capacità in vetrina. Mostrarlo due volte in due modi diversi — verticale
guidato dal progresso, e conversione da verticale a orizzontale — dimostra
più che mostrarlo una volta. Il costo (due punti in cui lo scroll si
aggancia) è accettato.

### D15 — sei animazioni Lottie

D15 tiene i Lottie fuori dallo scope di default: servono per motion di
personaggi o illustrazione articolata, mai dove CSS o SVG bastano. I nostri
sei (logo del loader, quattro icone bento, spunta di conferma) rientrano
tutti nella seconda categoria.

**Perché si deroga:** richiesta esplicita dell'utente. Costo accettato:
~150KB di player più i sei JSON.

## Applicati invece di derogati

- **D2** — Lenis solo su desktop. Su mobile lo scroll inerziale di sistema è
  già buono e il momentum sintetico lo peggiora.
- **D20** — un solo segnale di hover per elemento. Le card bento tengono
  l'alone che segue il cursore e rinunciano a tilt 3D e bordo illuminato.

## Invarianti verificate

`:focus-visible` visibile su ogni elemento interattivo · target ≥ 44px ·
scala spaziale 4pt · `clamp()` solo su display, scala rem fissa per body e
UI · nessuno scroll orizzontale da 320px a 1920px · `prefers-reduced-motion`
spegne tutto il movimento non funzionale · si animano solo
`transform`/`opacity`/`filter` · OG image 1200×630 · versioni pinnate, mai
`@latest`.

## Deroghe aggiunte con gli effetti (sessione 2026-08-11)

Tutte e tre decise dall'utente, che ha chiesto esplicitamente questi effetti.

### Quattro contesti WebGL su una pagina

Le regole di composizione dicono «una scena sopra la piega, al massimo» e
«più di ~2 scene su una pagina è quasi sempre sbagliato». Qui ce ne sono
quattro: il tunnel (cap. 01), la doppia elica (cap. 03), la scena Spline
(cap. 05) e la sfera→galassia (cap. 06).

**Perché si deroga:** la pagina *è* la vetrina di questa capacità; mostrarla
una volta sola direbbe meno. Il costo è contenuto in tre modi, e sono
vincolanti per chiunque tocchi queste sezioni:

1. ogni scena ha due ScrollTrigger, uno che pinna e uno che monta e smonta il
   loop di rendering. Fuori schermo il canvas non disegna;
2. niente post-processing da nessuna parte. Le scene sorgente montano tre
   `EffectComposer` a testa per un solo oggetto: quattro volte tanto non sta
   in piedi. Fondo e fiamme d'angolo del pass finale sono gradienti CSS;
3. le sfere-reticolo vanno de-indicizzate, e l'opacità riscalata per il
   fattore di duplicazione. `THREE.Points` onora l'indice e ridisegnerebbe
   ogni vertice sei volte esattamente sopra sé stesso.

### Il canvas resta trasparente, il fondo è CSS

Non è solo una scelta di costo. Nel cap. 03 le parole in orbita devono
passare **dietro** all'elica: il DOM non si interlaccia con un canvas, quindi
ogni parola vive in due strati — uno sotto e uno sopra il canvas — che si
scambiano l'opacità sulla silhouette. Con un fondo opaco in WebGL non
funzionerebbe.

### Asset di terze parti nel cap. 05

Il runtime `@splinetool/viewer` (~2.2 MB) e la scena `.splinecode` (~1.3 MB)
arrivano da CDN esterne, e la scena è la demo pubblica di Spline, non nostra.
Rompe due vincoli del piano: «asset procedurali soltanto» e «ogni script da
CDN porta `integrity`» (il runtime ce l'ha, la scena no — non è uno script ma
un binario che il runtime va a prendere da sé).

**Contenimento:** niente viene toccato finché la sezione non si avvicina al
viewport, quindi sopra la piega la pagina non paga un byte.

**Aperto:** il badge «Built with Spline» resta visibile. È l'attribuzione del
piano gratuito e nasconderla via CSS violerebbe i termini di Spline. Le due
strade per toglierlo sono un piano Spline a pagamento, oppure rifare la scena
e ospitarla in proprio.

### Colore: r128 non ha color management

Le scene sorgente di GetLayers girano su `WebGL1Renderer` senza output
encoding e caricano i byte del colore grezzi. three.js r128 — la versione
pinnata dal piano — fa lo stesso. Convertire in lineare qui li slaverebbe:
`WC.glsl.hexToVec3` carica il crudo, di proposito. Se un giorno si sale di
versione, questa è la prima cosa che si rompe.
