# Robot — anima nella pancia e anatomia cliccabile

**Data:** 2026-09-19 notte (richiesta di Nike delle 23:27–23:33, con delega esplicita: «io vado a dormire quindi sei in autonomia», «vedi tu»)
**Ramo:** `robot-look-spline` (locale, **nessun push**) · **Segue:** `specs/2026-09-19-robot-aspetto-spline-design.md` e il suo piano (Task 1–8, chiusi)

## 1. Cosa ha chiesto Nike

1. Nella **pancia** va la **sfera di Vesper** — la stessa della sezione SABE del sito — **esattamente dietro la «A»**, con lo stesso meccanismo del cervello dentro la testa.
2. **Linee spezzate anatomiche** (prima obliqua, poi orizzontale) che escono dalla zona quando il puntatore ci passa sopra:
   - testa (col cervello) → **«cervello»**, sotto **«Atlas»**
   - pancia (con la sfera) → **«anima»**, sotto **«sabe»**
   - **braccio a sinistra dello schermo** → **«website creation»**, sotto **«atelier»** (l'altro braccio resta pronto ma vuoto)
3. **Dalle animazioni si arriva alle sezioni del sito.** Parole sue: «se il sito è reindirizzabile alle relative sezioni tramite un click direttamente nelle animazioni (quindi cliccando nel cervello ad esempio), oppure se non è possibile, quando si passa sopra uno di quegli elementi la linea dell'anatomia rimane e non scompare e da lì si reindirizza alla sezione. **La prima è meglio** ma voglio un lavoro pulito».
4. **Linee lunghe:** «c'è spazio quindi sfruttalo, non fare linee corte altrimenti sembra tutto troppo denso».

## 2. Decisioni (prese in autonomia, da confermare con Nike)

- **Si fa la prima:** il **click sulla zona 3D naviga**. Il raycast che già pilota reveal e fibre dà anche il click: nessun meccanismo nuovo.
- **L'etichetta è anche un link vero** (`<a href>`): resta finché il puntatore è sulla zona **o sull'etichetta**, si raggiunge col tab, la legge uno screen reader. Le due strade convivono; la seconda è la rete di sicurezza per chi non usa il mouse, non un ripiego.
- **Destinazioni** (pagine che esistono nel repo): «Atlas» → `atlas.html`, «sabe» → `sabe.html`, «atelier» → la pagina corrente, in cima (`#cap01`).
- **Lati:** testa e pancia scrivono **a destra**, il braccio **a sinistra**; l'etichetta esce dal lato della zona rivolto verso l'esterno e nessuna linea attraversa il corpo.
- **Quale braccio:** quello che si vede a **sinistra sullo schermo**. Si stabilisce proiettando il centro dei due gruppi (`parts.armL`/`armR`) con la camera e prendendo quello con X minore — mai per nome della variabile.
- **La «A» resta davanti:** quando la pancia si apre, la sfera si vede **dietro** il logo, che resta bianco lucido e pieno.
- **Una zona per volta.** Vince la mesh **colpita per prima dal raycast** nel frame (la più vicina alla camera); i valori smorzati (hover, surge) pilotano solo il disegno, non la scelta della zona — se no il braccio, che si spegne lento, tiene l'etichetta mentre il puntatore è già sulla pancia.
- **Accessibilità senza scena:** quando il browser chiede meno animazioni (`prefers-reduced-motion`) il robot **non** viene montato. In quel caso l'overlay va montato lo stesso, fermo, con le tre etichette ancorate a punti fissi: altrimenti in quella sezione non esisterebbe **nessun** collegamento ad Atlas/SABE/Atelier (oggi la pagina non ne ha altri).

## 3. Comportamento

| Passo su | Cosa succede | Clic porta a |
|---|---|---|
| **Testa** | casco trasparente, occhi spenti, cervello ATLAS visibile (già fatto) + linea a destra «cervello» / «Atlas» | `atlas.html` |
| **Pancia** (torso) | torso trasparente come il casco, **sfera** visibile dietro la «A» che resta piena, + linea a destra «anima» / «sabe» | `sabe.html` |
| **Braccio a sinistra** | fibre accese (già fatto) + linea a sinistra «website creation» / «atelier» | `#cap01` della pagina |
| **Nessuna zona** | tutto torna a riposo: nessun punto di cervello o sfera disegnato, nessuna linea, visore e torso opachi | — |

Il puntatore diventa «mano» sulle tre zone. Le etichette compaiono e spariscono in dissolvenza (~180 ms), la linea si disegna dal punto d'aggancio verso l'esterno (~220 ms), senza rimbalzi.

## 4. Disegno delle linee (regole, non pixel)

Misure in frazione della **larghezza della sezione**, così valgono a ogni dimensione:
- tratto **obliquo** dal bordo della zona, poi tratto **orizzontale**; il testo sta oltre la fine dell'orizzontale, staccato di mezza altezza di riga;
- la lunghezza **non è un numero fisso**: si calcola dallo spazio che c'è davvero fra il punto d'aggancio e il bordo del riquadro, meno la larghezza del testo e un margine. Obiettivo 0,27 della larghezza, **minimo 0,12**; a destra (testa e pancia) lo spazio c'è, a sinistra il braccio ne ha meno e la linea si accorcia fin dove serve invece di sconfinare. Il salto dall'altro lato resta solo per il caso in cui nemmeno il minimo ci stia — e quel lato è quello **esterno**, mai attraverso il corpo;
- la voce grande («cervello», «anima», «website creation») sopra il filo, la piccola («Atlas», «sabe», «atelier») sotto, allineate a sinistra fra loro (a destra se l'etichetta esce a sinistra);
- spessore linea 1 px logico, stesso colore del testo; nessun'ombra, nessun riquadro;
- sotto i 1100 px di larghezza vale la stessa regola: si parte dall'obiettivo 0,27 e si scende fino al minimo 0,12 prima di considerare l'altro lato;
- se due etichette fossero accese insieme, distanza verticale minima 2,5 volte l'altezza del testo (oggi non capita: una per volta).

## 5. Architettura

Tutto dentro `website-creation/`, una sola scena WebGL, nessuna richiesta di rete a runtime.

- **`js/pointorb.js` (nuovo)** — la sfera di SABE come modulo di punti, sulla falsariga di `pointbrain.js`: `WC.pointOrb.create({ count, radius, pointSize, uniforms })` → `{ points, uniforms, update(dt, reveal, camera) }`. Geometria, shader e palette portati da `axxell-3d.js` (radice: `ORB_CONFIG`, shader dell'orb, `mountOrb`), **senza** renderer/canvas/resize. Tre trappole note, tutte da rispettare: (a) lo shader ragiona su una **sfera di raggio 1** (soglie assolute tipo `uFadeNear 1.7`, `uFadeFar 3.1`): la geometria si costruisce a raggio 1 e si ingrandisce l'oggetto con `scale`, mai passando 60 unità al costruttore; (b) `uAssemble` va fissato a **1** (a 0 la sfera non esiste: è la rampa d'ingresso della pagina di SABE), e il reveal si pilota con **`uAppear`**, l'unica uniform che spegne i punti senza deformarli; (c) `gl_PointSize` non segue né lo zoom né la distanza: la dimensione si calibra come già fatto per il cervello (`camDist` × `fovScale`) e `uPR` prende `renderer.getPixelRatio()`. `uCursor` non va mai lasciata a `(0,0,0)` (uno `normalize` di zero manda in NaN il vertex), `uCamLocal` è la camera in coordinate **locali** della sfera, `depthTest` resta acceso.
- **`js/robot-spline-materials.js`** — il materiale del petto (istanza col logo) diventa `transparent` e impara il reveal: `uOpacity` scende come per il visore, ma il logo resta pieno (`alpha = max(uOpacity, maschera del logo)`). `makeInside` oggi tiene **una sola** lista interna (quella della testa): va trasformato in una funzione che **restituisce un gruppo** con le sue liste, così testa e pancia si sfumano a vicenda senza interferire.
- **`js/robot.js`** — un secondo segnale di hover (`hoverBelly`) dal raycast sul **solo torso** (mesh `Body` indice 40, la stessa già nota come `parts.chest`), gemello di `hoverHead`; la sfera è ancorata al **centro del logo** (non al centro del torso: il logo sta più in alto di ~68 px a schermo) e spinta indietro lungo −Z; `points.visible` solo sopra 0,01. Ordine di disegno esplicito: sfera 0, interni della testa 1, visore 2, torso 3.
- **`js/anatomia.js` (nuovo)** — le etichette. Overlay DOM sopra il canvas (`<svg>` per la linea + `<a>` per il testo), una per zona, nascoste a riposo. Ogni frame proietta il punto d'aggancio della zona con la camera e aggiorna linea e posizione; nessun costo GPU. Espone `WC.anatomia.mount(ctx)` e riceve i segnali di hover da `robot.js`.
- **`css/sections.css`** — stile delle etichette (tipografia del sito, mono per la voce piccola).
- **CONFIG unico** in cima ad `anatomia.js`: per ogni zona `{ id, mesh(es), lato, testo, sottotesto, href, attiva }`. Il braccio di destra c'è con `attiva: false`.

## 6. Verifica

- `prova.mjs` (fuori repo) guadagna: `anatomia-hover` (per ognuna delle tre zone: etichetta visibile col testo giusto, linea ancorata entro pochi px al punto d'aggancio letto da `window.__robot.anatomia.anchors`, tratto orizzontale ≥ 0,12 della larghezza e, dove lo spazio c'è, ≥ 0,25), `anatomia-riposo` (fuori zona: etichette a opacità 0 e senza `pointer-events`, **ma ancora raggiungibili col tab**, cervello e sfera non disegnati), `anatomia-click` (clic sulla zona → l'URL giusto, intercettato senza cambiare pagina davvero), `anatomia-tastiera` (tre Tab portano `document.activeElement` sui tre link e l'etichetta diventa visibile), `pancia-reveal` (torso trasparente, sfera visibile, «A» ancora piena).
- Confronto pixel a riposo: si scatta **prima** di toccare il codice (`09-riposo-prima.png`, con `--video-t` fissato e puntatore fuori) e alla fine deve valere `meanDiff == 0` e `iou == 1` contro quello scatto. Gli scatti vecchi (`06-riposo.png`) non valgono più: il petto ora porta la «A».
- La sfera si giudica a occhio contro la sezione SABE del sito servita in locale (`sabe.html`), non contro Spline: è roba nostra.
- Coppie e schermate finiscono in `~/Progetti/file-sciolti/robot-confronto/` (`09-*.png`).

## 7. Rischi e fuori scope

- **Fuori scope:** zoom al click e pannelli prodotto; braccio di destra; mobile/touch (al passaggio non esiste: sarà un tocco per aprire e un secondo per navigare, si progetta quando si farà il mobile); head tracking e fibre (già in lista per Nike).
- **Rischio a:** il torso è una mesh sola e grande — aprirlo potrebbe scoprire l'interno del modello (facce interne, niente). Mitigazione: sfumano solo le mesh `Parts` **interamente** contenute in una versione ristretta (0,85) del volume del torso — il bbox pieno prenderebbe anche spalle, bacino e anello del collo — e se l'interno legge male si alza il minimo di opacità del torso (come i 0,045 del visore).
- **Rischio d:** il torso è il pezzo che proietta più ombra (sulle gambe). Spegnere la sua ombra a metà reveal, come si fa col visore, si vedrebbe come un lampo sulle gambe: la scelta si prende guardando uno screenshot, e in dubbio il torso continua a proiettare.
- **Rischio e:** la sfera di SABE nel sito gira con un renderer diverso (tone mapping ACES) e col puntatore che la deforma. Da noi il confronto vale su **tinta, gradiente e grana**, non pixel per pixel; la luminosità si tara.
- **Rischio b:** la sfera dietro un logo pieno può risultare poco leggibile. Mitigazione: raggio e posizione in CONFIG, taratura a schermo.
- **Rischio c:** licenza degli asset Spline — invariata, resta la questione aperta prima di andare online.
