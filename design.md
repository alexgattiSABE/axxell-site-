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

### D15 — CHIUSA: i Lottie sono due, non sei

> Chiusa il 2026-08-12. Non serviva più derogare: il conto è sceso da solo.

La deroga esisteva per sei Lottie — logo del loader, quattro icone della
griglia bento, spunta di conferma. La griglia bento non esiste più: il
cap. 05 è diventato il modello Spline, e con lei sono spariti i quattro
Lottie che portava.

Ne restano **due**, ed entrambi fanno una cosa che CSS e SVG da soli non
fanno bene: il logo che si scrive nel loader, e la spunta che si disegna
alla conferma dell'invio. D15 tollera i Lottie dove servono davvero; a
questo numero non c'è più niente da derogare. Il costo scende da ~150KB
+ sei JSON a ~150KB + due JSON piccoli.

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
cinque: il tunnel (cap. 01), la colonna di vetro (cap. 03), il fluido del
cursore (sempre nel cap. 03, contesto suo), la scena Spline (cap. 05) e la
sfera→galassia (cap. 06).

> Aggiornata il 2026-08-13: la doppia elica del cap. 03 è stata sostituita
> dalla colonna di vetro con le sei lastre in orbita, e nello stesso capitolo
> è entrato il quinto contesto, il fluido. Non c'è mai più di un capitolo
> acceso alla volta, ma i due del cap. 03 girano insieme: è l'unico punto
> della pagina che paga due simulazioni contemporanee.

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

Vale per il cap. 01 e il cap. 06. **Il cap. 03 è l'eccezione, ed è voluta:** lì
il fondo (nero + bagliore viola dal basso) è un piano dentro la scena, non un
gradiente CSS. Il motivo è la rifrazione — la spina di vetro campiona quello
che ha dietro, e quello che sta fuori dal WebGL non è campionabile: con il
fondo in CSS l'interno della colonna usciva nero. Il fluido del cursore
continua a passare sopra in `mix-blend-mode: screen`, perché è un canvas DOM
a parte, sopra a questo.

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

### La spina del cap. 03 è un'immagine (sessione 2026-08-13)

Il piano dice «asset procedurali soltanto». La spina non lo è più: è
`assets/spine.webp` (100 KB), il render fornito dall'utente come riferimento
visivo vincolante — «do not interpret the reference creatively». La versione
procedurale a 24 vertebre esisteva ed è stata scartata da lui.

**Contenimento, e sono vincoli per chi tocca la sezione:**

1. **Non è un `<img>` sopra la pagina.** È una texture su un piano dentro la
   scena three.js, quindi le lastre e le bolle le passano davanti e dietro
   davvero. Il piano scrive profondità e il fragment scarta i pixel ad alpha
   quasi zero: è quello che rende possibile l'occlusione senza rettangoli.
2. **L'alone dell'immagine sorgente è stato tolto in fase di asset**, non a
   runtime: si stima lo sfondo con un blur grosso, lo si sottrae, si chiude
   la maschera con due passate morfologiche (i corpi vertebrali scuri
   facevano buchi) e si ritaglia sul bbox. Se un giorno si rifà l'asset,
   questa è la ricetta — non ritagliare a mano.
3. **La spina è ferma e centrata.** Rotazione zero sui tre assi, nessuna
   traslazione, nessuna scala mentre si scende, nessun galleggiamento. A
   muoversi sono l'anello delle card, le bolle e una camera che fa pochissimo.
   È il concetto del brief — «fake descent»: sembra di scendere dentro una
   struttura enorme, ma il centro non si sposta di un pixel.
4. **È più lunga della sezione.** Il piano è alto 1.42 volte l'inquadratura
   (1.18 su viewport strette): cima e fondo restano fuori dal viewport a
   qualunque altezza di finestra, così la colonna sembra continuare oltre la
   pagina. Non è un ritaglio: l'altezza si ricava dal campo visivo, quindi non
   va toccata a mano quando si cambia la fov o la distanza della camera.
5. **È vetro vero, non un PNG.** La scena si disegna due volte per frame: la
   prima passata va in un render target a metà risoluzione SENZA la spina e
   senza le card che le stanno davanti; la seconda disegna tutto, e lo shader
   della spina campiona quel render target spostando le UV lungo la normale
   ricavata dal gradiente della silhouette. Da lì vengono rifrazione,
   aberrazione cromatica (i tre canali campionati a offset diversi) e
   trasmissione colorata. I riflessi non sono inventati: sono quelli
   dell'immagine di riferimento, pesati sulla luminanza.
   ⚠️ Il costo è una seconda passata di scena. Se qualcuno aggiunge oggetti
   pesanti a questa sezione, li paga due volte.
6. **Materiali opposti, di proposito.** Spina: trasparente, rifrattiva,
   riflettente. Card: scure, opache, riflettenti — attraverso non si guarda.
   È il contrasto che rende leggibile la composizione, ed è esplicito nel
   brief.
7. **Le bolle sono sfere, non particelle.** Il brief vieta i point sprite: le
   bolle hanno centro trasparente che lascia passare la scena rifratta, bordo
   di Fresnel e un riflesso stretto. Sono poche (34 desktop, 18 mobile) perché
   la composizione deve restare vuota.
8. **Le sei card stanno su UN anello inclinato.** Le quote diverse escono
   dall'inclinazione (`orbitTilt`), non da offset verticali messi a mano: la
   scala a gradini è la proiezione di un cerchio storto, non una spirale.
   Chi rimette gli offset a mano rompe la lettura.
9. **Costo per fragment.** Una versione usava il simplex noise di `WC.glsl`
   per la distorsione: due chiamate per pixel su un piano che copre mezzo
   schermo facevano scendere la sezione da 61 a 38 fps. Sostituito con due
   seni sfasati — a quest'ampiezza è indistinguibile. Se qualcuno rimette il
   noise lì dentro, ricontrolli gli fps.

Se la texture non carica la sezione ricade su `-static`: senza la spina non
avrebbe più un centro.

### Il cursore fluido del cap. 03 (sessione 2026-08-13)

Simulazione di fluido (Navier-Stokes, porting della WebGL Fluid Simulation di
Pavel Dobryakov, MIT) agganciata al puntatore. Chiesta dall'utente, con tre
vincoli suoi: sempre attiva senza premere niente, niente giallo/arancione/
verde, vorticità e raggio bassi.

Cosa comporta, e come è contenuto:

1. **Solo nel cap. 03.** Il canvas sta dentro al pin del capitolo e il loop
   parte e si ferma con la sezione. Sono venti passaggi di pressione per
   frame: tenerli accesi su tutta la pagina non ha senso, e all'uscita la
   simulazione viene anche svuotata, altrimenti al rientro riapparirebbe la
   scia congelata.
2. **Palette chiusa.** `generateColor` del sorgente pesca su tutto il cerchio
   delle tinte. Qui pesca su quattro fasce — ciano, blu, viola, fucsia/rosa —
   che sono quelle della colonna. Il vincolo dell'utente è anche il modo di
   tenere il capitolo coerente.
3. **Niente bloom né sunrays.** Sono ~400 righe e due catene di framebuffer, e
   i sunrays sono proprio il passaggio che tira fuori il giallo.
4. **CURL 2 e SPLAT_RADIUS 0.09** contro i 30 e 0.25 del sorgente, con
   dissipazione alta: una scia che segue il cursore, non uno spruzzo. Il testo
   della copy sta sopra al canvas nel markup, quindi non lo sporca mai.

Con `prefers-reduced-motion` il modulo non parte e il canvas è `display:none`.

### Colore: r128 non ha color management

Le scene sorgente di GetLayers girano su `WebGL1Renderer` senza output
encoding e caricano i byte del colore grezzi. three.js r128 — la versione
pinnata dal piano — fa lo stesso. Convertire in lineare qui li slaverebbe:
`WC.glsl.hexToVec3` carica il crudo, di proposito. Se un giorno si sale di
versione, questa è la prima cosa che si rompe.
