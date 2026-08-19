# design.md — axxell.ai

Scritto secondo atelier D17. Una pagina futura di questo stesso sito legge
questo file prima di costruire, per restare coerente.

## Ambito

Sito madre `index.html`: SPA statico a file singolo, preesistente, **non
ridisegnato**. Questo documento descrive le scelte della pagina `atelier/` e i
token che eredita dal sito madre.

> **La cartella si chiamava `website-creation/`** e l'indirizzo era
> `/website-creation`. Dal 2026-08-19 sono `atelier/` e `/atelier`, con un 301
> in `vercel.json` per la pagina e per tutto quello che le sta sotto (gli asset
> sono linkati per percorso assoluto dal `<base>`, quindi serve anche la regola
> con `:path*`). Il vecchio nome sopravvive solo in questo riquadro.

La pagina non e' piu' sola: il modulo di contatto vive in `atelier/
parliamone.html`, pagina propria, con il proprio `<title>` e le proprie OG.

## Genere

Vetrina di capacità tecnica. La pagina non descrive cosa sappiamo fare: lo
fa mentre la si scorre. **Dodici sezioni**, ognuna dimostra una capacità
diversa e ha uno spazio tutto suo — l'ampiezza dell'inventario senza la
sovrapposizione da demo reel.

Nell'ordine: hero col tunnel (`cap01`), warp (`capWarp`), manifesto con la
doppia elica (`cap02`), Vesper (`capVesper`), fluido (`cap03`), altitudine
(`capAltitude`), disco volante (`capSaucer`), modello Spline (`cap05`), Lithos
(`capLithos`), sneaker (`capSneaker`), processo orizzontale (`cap07`), offerta
(`capOffer`).

> Erano nove. Il conto e' salito per aggiunte successive, e gli `id` non sono
> mai stati rinumerati: chi legge `cap05` non deve dedurne la posizione. `cap04`
> e `cap06` non esistono piu', `cap08` e' uscito dalla pagina (vedi Ambito).

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
- **Sezioni intermedie:** motion legato allo scroll, uno per sezione, mai un
  fade-up universale. Diverse non hanno moto proprio affatto: fermo il dito,
  si ferma tutto (il cap. 02 lo dichiara esplicitamente nel suo CONFIG)
- **Parliamone:** pagina a sé, solo micro-interazioni sui campi. Niente WebGL,
  niente capitoli — carica solo le librerie che il modulo usa davvero
- **Ambient:** solo nell'hero. Nessun livello di movimento a pagina intera

Librerie: GSAP 3.13.0 + ScrollTrigger (scroll storytelling reale, D1),
Lenis 1.1.20, three.js r128, lottie-web light 5.12.2. Tutte pinnate, tutte
con SRI.

## Deroghe consapevoli

Due, entrambe decise dall'utente dopo che gli è stato presentato il verdetto
contrario.

### D4 — quattro sezioni pinnate invece di una

> Aggiornata tre volte. Erano due (cap. 03 e 07), poi quattro, poi otto,
> **ora sono sette**: tunnel (`cap01`), warp (`capWarp`), elica (`cap02`),
> Vesper (`capVesper`), fluido (`cap03`), disco volante (`capSaucer`),
> processo orizzontale (`cap07`). La motivazione non e'
> cambiata, il conteggio si', e va detto invece che lasciato indovinare.

D4 ne ammette una sola per pagina.

Cinque di questi sette usano `pinSpacing: false` e si ricavano la corsa
dall'altezza della sezione: con lo spaziatore, ognuno aggiungerebbe sotto di se'
altrettante schermate di scroll morto a movimento finito.

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

> Aggiornata il 2026-08-19: **ne resta UNO**. Il logo che si scriveva nel
> loader era un disegno che SOMIGLIAVA al marchio; adesso il sipario mostra il
> marchio vero, condensato dal vapore con un canvas 2D (vedi più sotto), e
> `assets/logo-reveal.json` è stato cancellato. Con lui lottie-web è uscito da
> `atelier/index.html`: la libreria resta solo su `parliamone.html`.

Resta la **spunta che si disegna alla conferma dell'invio**, che fa una cosa
che CSS e SVG da soli non fanno bene, e vive dove serve. Di deroga non c'è più
niente: il costo è ~150KB di libreria e un JSON piccolo, su una pagina sola.

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

### Otto contesti WebGL su una pagina

Le regole di composizione dicono «una scena sopra la piega, al massimo» e
«più di ~2 scene su una pagina è quasi sempre sbagliato». Qui ce ne sono
**otto**:

| Contesto | Sezione | Tipo |
|---|---|---|
| tunnel | `cap01` | three.js |
| warp | `capWarp` | three.js |
| doppia elica | `cap02` | three.js |
| Vesper | `capVesper` | three.js |
| fluido del cursore | `cap03` | WebGL2 grezzo |
| altitudine | `capAltitude` | WebGL2 grezzo |
| disco volante | `capSaucer` | three.js |
| scena Spline | `cap05` | runtime di terze parti |

> Aggiornata il 2026-08-19: erano cinque. Due dei cinque non ci sono piu' con
> quel nome — la colonna di vetro e la sfera→galassia sono uscite dalla pagina
> — e ne sono entrati altri. `js/spine.js` e `js/particles.js` restano **sul
> disco ma NON vengono caricati**: sono moduli dormienti, si riaccendono
> rimettendo la sezione, il canvas e lo `<script>`. Chi conta i contesti conti
> i tag `<script>`, non i file in `js/`.

Non c'e' mai piu' di una sezione accesa alla volta.

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

### CHIUSA — la spina del cap. 03 è un'immagine (sessione 2026-08-13)

> **Chiusa il 2026-08-19: la colonna di vetro non è più in pagina.** Il
> `cap03` adesso ospita solo il fluido del cursore, e il suo occhiello dice
> «// 04 — Fluido». `js/spine.js` e `assets/spine.webp` restano sul disco,
> dormienti. Tutto quello che segue vale se e solo se qualcuno la rimette, ed
> è tenuto per intero apposta: era la sezione più costosa della pagina e la
> ricetta dell'asset non è ricostruibile a occhio.

Il piano diceva «asset procedurali soltanto». La spina non lo è più: è
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
   che erano quelle della colonna di vetro. La colonna è uscita dalla pagina
   (vedi la deroga chiusa più sopra) e il fluido è rimasto da solo nel `cap03`,
   ma le fasce **non vanno riaperte**: sono il vincolo dell'utente, e adesso
   sono anche l'unica cosa che dà una tinta a questa sezione.
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

## Sessione 2026-08-19

Quattro cose nuove da mettere a verbale, e una che resta aperta.

### Tre video su una pagina — deroga a «asset procedurali soltanto»

| File | Dove | A cosa serve |
|---|---|---|
| `assets/starry.mp4` | `capAltitude` | **non è una scorta**: è la sorgente della texture che il canvas campiona |
| `assets/sneaker.webm` / `.mp4` | `capSneaker` | fondo che gira da solo, in due formati |
| `assets/glass.mp4` | `capOffer` | loop di vetro viola dietro la chiusura |

**Perché si deroga:** uno dei tre capitoli *è* «il video trattato come
materia» — è la capacità in vetrina, e un video procedurale non esiste. Gli
altri due sono fondo.

> Erano quattro: `assets/festina.mp4` è uscito con il capitolo dell'orologio.

**Contenimento, vincolante per chi tocca queste sezioni:**

1. **`<source data-src=` e non `src=`.** Con `src` il browser comincia a
   scaricare appena incontra il tag, e `preload="none"` non lo ferma: quel
   attributo governa il buffering, non la scelta della sorgente. L'indirizzo
   viene scritto quando la sezione si avvicina, non prima.
2. **Ricompressi, con la ricetta sul disco.** `scripts/pack-*.md` tiene il
   comando `ffmpeg` esatto di ognuno. L'offerta è scesa da 17,7 MB a 1,5. Chi
   rifà un asset rilancia la ricetta, non improvvisa i parametri.
3. **Nessuno ha traccia audio.** Qui non si riproduce niente da ascoltare.

### CHIUSA — il capitolo dell'orologio non c'è più

> **Tolto il 2026-08-19, su richiesta.** Con lui sono spariti dal disco il
> filmato, il poster, il modulo, lo script che cercava lo spazio libero sui 241
> fotogrammi e la ricetta di ricompressione: cinque file, niente lasciato
> dormiente. Non è un capitolo che si riaccende togliendo un commento.

Resta a verbale una cosa sola, perché vale per **qualunque** video si voglia far
scorrere con lo scroll, non solo per quello: **il server deve servire le
richieste Range.** Cercare dentro un video vuol dire chiedere un pezzo di file;
senza `Accept-Ranges: bytes` e risposte `206`, Chrome si rifiuta di cercare —
`seekable` resta vuoto anche a file interamente scaricato, e a schermo resta
fermo il primo fotogramma. `python3 -m http.server` **non** lo fa, Vercel sì.
Chi prova in locale con quello sta guardando un difetto del server, non della
pagina.

### Il marchio del footer è un SVG ricalcato, e va tenuto tale

La parola che si accende sotto il cursore è il **logo vero** — dieci tracciati,
orbita compresa — non un `<text>`.

**Perché non si può passare a testo vero**, anche se l'effetto funzionerebbe
(contorno, gradiente e maschera non hanno bisogno dei tracciati):

- l'orbita non esiste in nessun font;
- la firma che si scrive da sé usa `stroke-dashoffset`, che su un `<text>`
  tratteggia tutti i contorni delle lettere insieme: si otterrebbe un
  luccichio, non una scrittura.

**Il ricalco era storto e adesso non lo è più.** Diciassette segmenti che
dovevano essere verticali o orizzontali avevano uno scarto, tutti fra 0.27 e
0.31 nello stesso verso — un'inclinazione sistematica di poco meno di un grado
presa in fase di vettorializzazione, non tremolio casuale. Su un contorno
spesso ~2 unità di viewBox è il 15%, e si vedeva. Sedici sono stati agganciati
alla media del proprio gruppo; il diciassettesimo è un vero spigolo diagonale
nella coda dell'orbita ed è escluso apposta.

⚠️ Se un giorno si rimpiazza l'SVG con un export nuovo, si ricontrolli che i
segmenti dritti lo siano: un ricalco automatico li fa storti di default.

### La scala di colore del cap. 02 è scritta due volte

Le quattro fermate dell'elica (blu → verd'acqua → viola → rosso) esistono in
**due copie**: nel vertex shader per la GPU, e in JavaScript (`INK` + `ink()`
in `js/dna.js`) per il DOM, perché le parole in orbita devono prendere la tinta
del tratto d'elica che hanno attorno. Sono le stesse tre miscelazioni con le
stesse soglie sovrapposte.

⚠️ **Chi tocca le soglie di una deve toccare l'altra**, o le parole si
scollano dal colore che dovrebbero avere.

Il testo del manifesto, a sinistra, **è bianco e resta bianco**. Ha avuto due
versioni colorate — a rotazione (che da lontano leggeva come coriandoli) e a
blocchi contigui — e nessuna delle due è sopravvissuta: accanto a un'elica che
È GIÀ una scala di quattro colori, un testo colorato le fa concorrenza invece
di lasciarla parlare. L'unica cosa che fa è comparire, una parola alla volta,
mentre si scorre. Il bianco è la scelta, non un ripiego.

L'elica **sta dritta e sale**. `scrollTilt` è stato tolto (pendeva sempre di
più accanto a una colonna di testo ferma, e si leggeva come storta). La salita
invece **non si può togliere**: l'elica è molto più alta dell'inquadratura, e
la scala di colore sfila davanti alla camera proprio perché il corpo sale.
Fermandola si vedrebbe `g` fra 0.10 e 0.58 — blu e verd'acqua — e il viola
pieno e il rosso non entrerebbero mai in campo.

### Il sipario: il marchio si condensa dal vapore

Un'onda attraversa lo schermo da sinistra a destra. Davanti a lei non c'è
niente, sotto di lei una nebbia di particelle, dietro di lei il marchio fermo e
pieno. **Non è il logo che evapora: è il vapore che diventa logo.**

È il rovescio dell'effetto sorgente (*vapour text effect*, React), che parte dal
testo pieno e lo disperde. Il meccanismo è lo stesso e sta tutto nel segno di
un'interpolazione: si campiona una volta la forma finale e ogni particella
viaggia fra «dispersa» e «al suo posto». Disperdere è andare da 1 a 0;
condensare è andare da 0 a 1.

Vincoli per chi tocca `js/loader.js`:

1. **Il marchio è quello vero.** `#wcAxxellMark`, gli stessi dieci tracciati di
   nav e footer. Non un disegno che gli somiglia.
2. **Si passa per un'immagine, e non è pigrizia.** Servono i PIXEL, non le
   curve: ogni particella nasce da un pixel d'inchiostro. I tracciati vengono
   serializzati in un SVG con data-URL, disegnati una volta su un canvas di
   servizio, e `getImageData` dà la mappa. Il data-URL è same-origin, quindi il
   canvas non si sporca.
3. **`ImageData`, non `fillRect`.** Sono ~15.000 particelle a fotogramma: con
   `fillRect` sarebbero altrettanti cambi di `fillStyle`, ed è lì che il costo
   esplode. Si scrive nel buffer a 32 bit e si fa un solo `putImageData`. La
   somma sull'alfa è a mano — è quella che fa sembrare nebbia la nebbia.
4. **Il vapore nasce in alto e scende.** Se nascesse in tutte le direzioni
   sarebbe un'esplosione al contrario, che è un'altra cosa. Il tremolio si
   spegne con `1 - settle`: un marchio finito che vibra non è un marchio.
5. **Se la rasterizzazione fallisce, il sipario si alza lo stesso.** Un loader
   che non finisce è una pagina che non esiste.

⚠️ **Il segno dell'onda.** La prima stesura usava `(wave - nx + SPREAD)`: la
particella risultava già posata nell'istante in cui il fronte la raggiungeva,
cioè le lettere si formavano *davanti* all'onda invece che dietro. È
`(wave - nx)`.

### Il marchio sta in tre posti, con tre trattamenti

Gli stessi tracciati, una copia sola in cima al `<body>`, tre usi diversi:

| Dove | Come |
|---|---|
| nav, 22 px | **pieno** (`fill: currentColor`) |
| loader | **rasterizzato in particelle** |
| footer, dieci volte più grande | **in contorno**, con un gradiente che scorre dentro |

⚠️ Per questo **`fill` non sta sul gruppo condiviso**, ma su chi fa `<use>`. Ci
stava (`fill="none"`, ereditato dal file sorgente) ed era ridondante — lo dice
già `.wc-foot-t{fill:none}` — ma impediva a chiunque altro di riempirlo. Chi lo
rimette sul gruppo fa sparire il logo in nav.

### L'elica deve essere la stessa a qualunque quota la si guardi

Verso la fine dello scroll diventava più grossa e i pioli sparivano. Due cause
distinte, entrambe rese visibili da `scrollClimb`, che la fa sfilare davanti
alla camera. Sono **vincoli**, non aneddoti: chi tocca la scena li ricontrolli.

1. **La quota si prende dall'ANGOLO, non da `position.y`.** Gli anelli di una
   sfera UV sono equispaziati in angolo, non in altezza (`y = R·cos φ`):
   passando dall'altezza si eredita quel coseno e la densità lungo l'elica va
   come `1/sin φ`, cioè i punti si ammassano ai capi. In cifre: `sin φ` = 0.981
   all'inizio dello scroll e 0.71 alla fine — **40% di punti in più per unità
   di quota**, che con la fusione additiva legge come «più spessa», e i pioli
   (20% dei punti) annegano nei filamenti.
   ↳ Contropartita: gli anelli sono scesi di `1/1.54 = 0.649`, o l'elica
   sarebbe risultata una volta e mezzo più fitta di com'era. **La manopola
   della densità è quel numero** (`seg[1]`), non `pointSize`, che cambierebbe
   anche lo spessore del singolo punto.
2. **`vDepth` si misura dall'ASSE, non dalla camera.** Era una finestra fissa
   tarata sul primo fotogramma; ma l'elica in Z non sta ferma — il
   serpeggiamento la sposta in funzione della quota — e la finestra scivolava
   sotto ai punti: verso la fine saturava, davanti e dietro smettevano di
   separarsi, e l'elica leggeva come una macchia piatta. Ora misura quanto il
   punto sta davanti o dietro all'asse **alla sua quota**, e l'asse porta con sé
   lo stesso serpeggiamento: la misura è immune a dove l'elica si trovi. La
   fetta si ricava da `dnaRadius + strandThickness`, non è scritta a mano.

L'intervallo di `t` non è cambiato (21.4 in cima, −37.4 in fondo): la scala di
colore dello shader e il calcolo in JS che tinge le parole in orbita leggono le
stesse quote di prima.
