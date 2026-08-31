# Sotto-costellazione degli effetti speciali — design

_2026-08-31 · ramo `atelier-costellazione` · repo `axxell-site-3`_

## Contesto

La home dell'atelier (`atelier/index.html`) è la rotonda di Mirror Hall: otto mondi-settore su
un anello attorno al vuoto. L'ottava lastra, **«Effetti speciali»** (ciano `#3ad`), oggi porta a
`/atelier/capitoli` — i dodici capitoli del vecchio atelier, un lungo scroll pinnato che
_dimostra tecniche_ (disco volante, robot, fluido, elica, lithos, vetro, warp del testo…).

Questo blocco trasforma quella destinazione: al posto dello scroll lineare, una **seconda
costellazione** — gli effetti che orbitano attorno a una **DNA helix**, con **scroll infinito**,
raggruppati per tipo. È la sotto-costellazione concordata il 27/08.

## Decisioni ferme (approvate da Alex)

1. **Le card sono l'effetto vivo**, non un poster. La card che guardi _è_ l'effetto, che gira
   davvero. (Con il vincolo del contesto WebGL, sotto: vive quella a fuoco.)
2. **La sotto-costellazione diventa la porta**: _è_ `/atelier/capitoli`. I singoli effetti
   restano come pagine/sezioni di dettaglio in cui si entra cliccando la card a fuoco.
3. **Raggruppamento a cluster lungo l'elica**: ogni tipo è un tratto contiguo dell'elica; lo
   scroll passa da un gruppo al successivo.
4. **Asse = la DNA helix di GetLayers**, che **è già in casa**: `atelier/js/dna.js` è quella
   scena portata sullo stack dell'atelier (three r128 UMD, punti additivi su nero trasparente,
   pilotata dallo scroll). Confermata come colpo d'occhio giusto (anteprima
   `getlayers.ai/?layer=dna-helix`).
5. **Si parte dai 7 effetti già presenti** in `capitoli.html`. Gli effetti non ancora costruiti
   (spine-fluid, robot, flowstate) sono fuori scope di questo blocco: si aggiungono dopo come
   pioli extra (l'architettura è a lista).

## Lo stack, così com'è

- `atelier/js/core.js` espone `window.WC`: registry `WC.register(name, initFn)`, `WC.lenis`,
  `WC.motionOk`, `WC.desktop`, `WC.ease`. `boot()` avvia Lenis + ScrollTrigger e chiama gli init.
- Un effetto = un modulo `js/<nome>.js` che legge la propria sezione DOM + canvas e si registra.
  `capitoli.html` li carica tutti ma ne tiene **uno attivo per volta** (rAF pilotato da
  ScrollTrigger sulla visibilità della sezione) — è già la disciplina "un contesto vivo".
- Moduli-effetto esistenti e riusabili: `dna` (l'elica), `saucer` (disco), `vesper` (modello),
  `robot`, `fluid`/`spine` (splash), `lithos` (prima/dopo, canvas 2D), `orologio` (vetro),
  `sneaker` (immagine animata + video), `altitude` (la piega, video+canvas), `warp` (testo, DOM).
- `js/dna.js` risolve già il problema "DOM dietro il canvas": le parole in orbita esistono in
  **doppia copia** (una sotto, una sopra il canvas) che si scambiano opacità lungo il giro —
  perché il DOM non si interlaccia con un canvas. Stesso trucco servirà per le card sull'elica.

## Architettura della pagina

Una pagina nuova che **sostituisce** l'attuale `capitoli.html` come `/atelier/capitoli` (il
vecchio file si conserva, es. `capitoli-legacy.html`, per non perdere le dodici sezioni di
dettaglio in cui si entra).

Tre strati, dal fondo alla superficie:

1. **L'asse — la DNA helix** (`js/dna.js`, ritarata per stare al centro-scena invece che a
   destra del manifesto). È il palco: sempre acceso, scende e ruota con lo scroll. Tinta in
   ciano-atelier via il suo CONFIG (mai shader).
2. **Le card-effetto** — pannelli ancorati a intervalli lungo il percorso proiettato dell'elica.
   Riusano il **meccanismo di fuoco già costruito nella home** (`index.html`: la card più vicina
   al punto di fuoco si porta piatta e frontale, si ingrandisce; le altre restano di scorcio).
   Qui il percorso è l'elica, non l'anello. Fuori fuoco: **poster congelato** (webp, un
   fotogramma dell'effetto). A fuoco: **l'effetto si sveglia** dentro il rettangolo della card.
3. **Le scritte + la lista dei tipi** — come nella home: `#focus` in basso (contatore `NN/07`,
   nome dell'effetto, tipo), e la lista «CHE COSA MOSTRO?» dei cinque tipi a lato.

## Il nodo del contesto WebGL, e come lo sciogliamo

Regola dell'atelier: mai far girare due contesti WebGL _pesanti_ insieme. Qui l'asse (elica,
costo **medium**) è sempre vivo, e l'effetto a fuoco è un secondo contesto. La disciplina:

- **Un solo effetto attivo per volta.** Quando una card arriva a fuoco, il suo modulo attiva il
  rAF; quando esce, si **congela sull'ultimo fotogramma** (poster) e sospende il rAF. È
  esattamente ciò che `capitoli.html` già fa fra le sezioni.
- **L'elica è l'unico contesto sempre-vivo**, ed è leggera (punti additivi, niente
  post-processing — già così in `dna.js`).
- **Gate di misura**: elica _medium_ + un effetto _heavy_ a fuoco (saucer, vesper) va misurato su
  hardware vero. Se cala sotto i 50 fps: si **strozza il rAF dell'elica a 30 fps** (o se ne ferma
  la rotazione) mentre un effetto è in pieno fuoco. Fallback estremo, se ancora non regge:
  fondere elica + card + effetto in **un unico renderer** con l'effetto in un render-target
  (più lavoro, un solo contesto garantito).

## I cinque cluster (dai 7 effetti esistenti)

Tratti contigui dell'elica, ognuno una fascia di colore:

| cluster            | effetti                  | moduli               |
|--------------------|--------------------------|----------------------|
| Fluidi / splash    | altitude (la piega)      | `altitude`           |
| Immagini animate   | sneaker, orologio        | `sneaker`, `orologio`|
| Modelli interattivi| vesper, saucer (disco)   | `vesper`, `saucer`   |
| Testo              | warp                     | `warp`               |
| Prima / dopo       | lithos                   | `lithos`             |

Sette card in tutto. I cluster sono **spaziali**: mezzo giro d'elica per gruppo, colore del
gruppo sui punti di quel tratto. Scrollando si sente il passaggio da un tipo al successivo.

## Il risveglio degli effetti (per tipo di resa)

La card a fuoco è piatta e frontale ⇒ il suo effetto è un rettangolo su schermo, allineabile.

- **WebGL** (saucer, vesper, orologio, altitude): il canvas del modulo si monta nel rettangolo
  della card a fuoco e gira; smontato/congelato fuori fuoco.
- **Canvas 2D** (lithos, la pittura del "dopo"): stesso, un canvas 2D nel rettangolo.
- **DOM** (warp del testo): overlay DOM allineato al rettangolo della card a fuoco.

Il poster congelato per lo stato fuori-fuoco si genera come già fatto per i mondi (script
`poster.js`: un fotogramma vero dell'effetto, non un'immagine generica).

## Scroll infinito

L'elica sale all'infinito: lo scroll non ha un fondo, si riavvolge dove non si vede (stesso
principio della coda del mazzo nella home). I sette effetti si ripetono; il contatore `NN/07`
resta la bussola. Su `prefers-reduced-motion`: niente giro continuo, la costellazione è ferma e
si naviga a passi (frecce / lista dei tipi), coerente con la home.

## Entrata, uscita, URL

- La card «Effetti speciali» della home continua a puntare a `/atelier/capitoli` (nessuna
  modifica a `index.html` oltre, semmai, poster/etichetta). Quella destinazione ora è la
  sotto-costellazione.
- **Clic sulla card a fuoco** = si entra in quell'effetto a piena pagina (la sezione di
  dettaglio, dal file legacy conservato). URL sul path: `/atelier/capitoli/<effetto>` con lo
  stesso pattern History-API già usato dai mondi; rewrite in `vercel.json` per l'ingresso
  diretto.
- **Ritorno** all'home dell'atelier come dagli altri mondi (`?da=effetti-speciali`, giostra già
  ferma lì).

## Coreografia d'ingresso

Sipario coerente con il resto del sito (il velo col vapore della home / il loader dei capitoli),
gate al _via_ dell'uscita del sipario, contenuto che entra _attraverso_ il velo. Non un fade.
L'elica entra con un'entrata vera (sale dal basso in dissolvenza-a-punti), non comparendo intera.

## Rischi e gate di verifica

1. **Perf elica + effetto a fuoco** — il gate di misura sopra. Da misurare su browser/telefono
   VERO (il limite di sempre: Chromium headless non ha H.264 e non ha GPU vera).
2. **Allineamento overlay/canvas al rettangolo della card a fuoco** — la card è portata frontale,
   ma la matematica di proiezione va verificata a schermo (desktop + verticale).
3. **Peso** — sette moduli-effetto + i loro media. Da tenere sotto controllo; posterizzare lo
   stato fuori-fuoco evita di caricare i media pesanti finché non si entra.
4. **Ritaratura di `dna.js`** — oggi è a destra del manifesto; portarla al centro-scena senza
   perderne la taratura (CONFIG, niente shader).

## Fuori scope (blocchi successivi)

- Gli effetti non ancora costruiti (spine-fluid autonomo, robot come card, flowstate): pioli
  extra da aggiungere dopo.
- Rifiniture della copy di ogni card.

Vedi memoria `[[project-atelier-costellazione]]`, `[[project-axxell-site]]`.
