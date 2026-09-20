/* CAP 05 — robot 3D nostro con l'aspetto della scena Spline originale.
 *
 * Era la demo pubblica di Spline (`@splinetool/viewer` + una `.splinecode`
 * ospitata da terzi). Ora è un GLB estratto e compresso in Draco, caricato
 * con three.js r128 (globale, stesso <script> già in pagina per gli altri
 * capitoli) via GLTFLoader/DRACOLoader vendorizzati in locale, nelle
 * coordinate della scena Spline — niente ricentratura. Camera, posa (per
 * ogni mesh, per indice di nodo glTF — l'ordine di `model.traverse()` NON è
 * stabile con Draco), luce, materiali e video degli occhi arrivano da
 * `WC.robotSplineData` (generato fuori repo da robot-spline-tools/estrai.mjs).
 *
 * I materiali sono il nostro GLSL a strati (robot-spline-glsl.js /
 * robot-spline-materials.js) che riscrive le formule Spline: visore-specchio
 * con occhi a LED via video, corpo/braccia con matcap+rainbow, «A» bianca
 * lucida sul petto col riflesso che insegue il mouse. La point light Spline
 * proietta ombre (shadow map a cubo three, filtro `sp_shadow` in
 * robot-spline-glsl.js) sulle stesse mesh che le proiettano/ricevono nella
 * scena Spline (`shadowLight` qui sotto, intensità 0: serve solo alla shadow
 * map, l'illuminazione la calcolano i nostri shader).
 *
 * Interazione: SOLO la testa che segue il cursore, sempre (anche a riposo).
 * Cursore su una qualunque mesh della testa → reveal: visore quasi
 * trasparente, occhi spenti, interni che sfumano, si vede il cervello a
 * punti (point-brain, pointbrain.js) con la palette della sezione ATLAS.
 * Cursore su un braccio → le fibre luminose di quel braccio si accendono.
 *
 * Nessuna richiesta a Spline o a un CDN a runtime. Spec:
 * docs/superpowers/specs/2026-09-19-*.
 */
WC.register('robot', function(ctx){
  // Tarature del comportamento (non dell'aspetto: quello arriva da Spline).
  //
  // Task B1 — la testa PUNTA il cursore. Prima c'erano due guadagni
  // (`yawGain`/`pitchGain`) applicati al puntatore misurato sul RETTANGOLO
  // dello stage: una regola approssimata che non sapeva dove fosse la testa
  // dentro quel rettangolo. In verticale non era nemmeno approssimata, era
  // ROVESCIATA — misurato con l'override `robot.hold`: `rotation.x = -0.3`
  // porta il «davanti» della testa a (0, +0.296, 0.955), cioè guarda in ALTO,
  // e la formula vecchia (`-pointer.y * pitchGain`) dava proprio -0.3 col
  // cursore in BASSO. I due guadagni sono spariti: non c'è più niente da
  // guadagnare, il bersaglio è un punto vero del mondo.
  //
  // aimDepth: dove sta il piano su cui si posa il puntatore, in frazione della
  // distanza camera→testa. 0 = piano sulla camera (la testa non seguirebbe
  // più niente); 1 = piano ALLA profondità della testa — degenere, perché lì
  // il bersaglio cade DI FIANCO all'occhio e mai davanti: misurato, chiede
  // |yaw| ≈ 90° per QUALUNQUE posizione del puntatore, compreso il centro
  // della testa. A 0.5 il piano sta a metà strada e la mira resta dentro i
  // limiti su tutto il riquadro (misurato: 1440×900 |yaw| ≤ 0.326 rad e
  // pitch ≤ 0.353; 1280×720 ≤ 0.358 e ≤ 0.349), quindi il clamp non taglia
  // mai e la testa punta davvero dove sta il cursore.
  //
  // pitchMax sale da 0.30 a 0.38: la testa sta IN ALTO nella sezione, per
  // guardare il fondo del riquadro deve abbassarsi di 0.353 rad e a 0.30 il
  // clamp la fermava prima — proprio nei «movimenti verticali» che Nike
  // segnalava. 0.38 è il tetto indicato dal piano (oltre, il collo comincia a
  // compenetrare) e resta come guardia, non come taratura attiva.
  var CONFIG = { aimDepth: 0.5, yawMax: 0.5, pitchMax: 0.38, minHeadTopPx: 80 };
  // Task C1 — «robot più grande, niente gambe» (Nike): l'inquadratura si
  // stringe su testa, busto e braccia, tagliata poco sotto il bacino. Le
  // gambe RESTANO nella scena (nessuna mesh nascosta, nessun GLB toccato):
  // semplicemente cadono fuori dal ritaglio.
  //
  // COME, e perché così. La camera Spline non si tocca: stessa posizione,
  // stesso orientamento, stesso fov 45 e stesso zoom 2. L'inquadratura la fa
  // `camera.setViewOffset`, che è un RITAGLIO: dice alla camera «di
  // quest'immagine larga W·m e alta H·m disegnami solo il rettangolo W×H che
  // parte da (offX, offY)». Le altre due strade sono peggiori, e non di poco:
  //   - avvicinare `camera.position` cambia la PROSPETTIVA (il robot si
  //     deforma, le braccia si allargano) e sposta la luce in coordinate di
  //     vista — cioè cambia l'aspetto dei materiali, che è l'unica cosa che
  //     NON deve cambiare (matcap e rainbow leggono la normale in vista);
  //   - spostare il modello fa la stessa cosa al contrario, e in più sposta
  //     le ombre, che sono cotte sulla posizione mondo della point light.
  // Col ritaglio invece ogni punto del mondo sta dove stava in coordinate di
  // vista: gli shader ricevono gli stessi numeri di prima e l'unica cosa che
  // cambia è quanti pixel occupa il risultato. L'unica conseguenza da
  // rincorrere è la dimensione dei PUNTI (gl_PointSize non passa per la
  // matrice di proiezione): cervello e sfera si moltiplicano per
  // `ingrandimento`, vedi più sotto.
  //
  // I tre numeri sono FRAZIONI DELL'ALTEZZA DEL ROBOT (bbox del modello,
  // 547,7 unità mondo), non pixel: reggono a qualunque dimensione del
  // riquadro e a un GLB riesportato con un'altra scala.
  //  - aria: quanto vuoto resta SOPRA la cima della testa. Non è estetica e
  //    basta: `minHeadTopPx` (80 px) vieta alla testa di finire sotto la
  //    barra di navigazione, e la cima della testa cade sempre alla stessa
  //    FRAZIONE dell'altezza del riquadro — aria/(aria+taglio) = 14,5%.
  //    A 900 px sono 105 px, a 720 px 84: la regola non scatta mai, e
  //    questo tiene ESATTA la formula degli agganci fermi in anatomia.js
  //    (FISSI), che il `setViewOffset` di emergenza non saprebbe riprodurre.
  //    Il minimo utile è aria = 0,125 · taglio (è lì che a 720 px la cima
  //    della testa cade esattamente a 80 px): sotto, la guardia scatta.
  //  - taglio: dove cade il bordo BASSO, contato dalla cima della testa.
  //    Due vincoli, non uno. «Poco sotto il bacino» lo mette sotto le sfere
  //    dell'anca (quota mondo y 9÷31); «braccia INTERE» (parole di Nike:
  //    testa, busto e braccia interi) lo mette sotto le dita, che scendono
  //    fino a y ≈ −1. 0,566 · 547,7 = 310 sotto la cima, cioè y ≈ −6,4:
  //    appena sotto tutti e due, con ~14 px di respiro sotto le mani a
  //    1440×900. Provato prima a 0,54 (y ≈ 7,8): il taglio cadeva bene
  //    rispetto al bacino ma tranciava le dita — vedi il report C1.
  //  - scartoX: spostamento orizzontale del robot (positivo = verso destra).
  //    Serve perché le etichette NON sono simmetriche: a sinistra esce
  //    «website creation» dal bordo del braccio (che sporge molto), a destra
  //    «cervello» e «anima» dal bordo del busto (che sporge poco). Misurato a
  //    1440×900 dopo l'ingrandimento, senza scarto il margine dal lato del
  //    braccio scende sotto i 10 px; 0,0154 · 547,7 ≈ 8,4 unità mondo (21 px
  //    a 900 di altezza) lo riporta a ~27 px senza togliere la corsa lunga
  //    (≥ 0,25 W) alle due etichette di destra.
  // L'ingrandimento che ne esce (m ≈ 1,14) non è un quarto numero: si ricava
  // da aria+taglio ed è COSTANTE, perché il campo verticale della camera è
  // fisso e la scala in pixel di un punto fermo è proporzionale alla sola
  // altezza del riquadro. Più su non si va: oltre m ≈ 1,2 il bordo del
  // braccio si avvicina troppo al bordo sinistro e «website creation» non ha
  // più la corsa minima (0,12 W) da quel lato — misurato, vedi il report C1.
  var INQUADRATURA = { aria: 0.075, taglio: 0.566, scartoX: 0.0154 };
  // Task C2 — il cervello a punti dentro la calotta. Nike: «cervello più
  // piccolo». Frazioni del RAGGIO e dell'ALTEZZA della testa (bbox delle 18
  // mesh della testa in coordinate di headGroup, collo compreso).
  //  - raggio: 0,46 (era 0,66, che riempiva quasi tutto il volume interno).
  //    A 0,46 il cervello sta nella CALOTTA invece di attraversare tutta la
  //    testa. Misurato a 1440×900 con la maschera alpha (cervello da solo
  //    contro testa da sola, come già per la sfera e per la fibra): vedi il
  //    report C2. I due numeri restano quelli del Task C2 anche ora che la
  //    testa è tornata a ospitare una zona sola (Task D1: la sfera è scesa nel
  //    collo): «cervello più piccolo» è una scelta di Nike, non una
  //    conseguenza della convivenza con la sfera.
  //  - alzata: di quanto il centro del cervello sta SOPRA il centro del bbox
  //    della testa, in frazioni dell'altezza della testa. Il bbox è tirato in
  //    basso dal collo: 0,26 lo centra nella calotta.
  //  - raggioTarato: il raggio a cui è stata tarata la DIMENSIONE DEI PUNTI
  //    (RITOCCO 2). Il punto scala col cervello — uSize · raggio/raggioTarato
  //    — perché a scalare deve essere l'oggetto, non la sua grana: coi punti
  //    della stessa misura dentro una forma più piccola i 24000 punti si
  //    sovrappongono e il cervello diventa una macchia piena, senza più
  //    emisferi né solchi (provato: vedi il report C2). È la stessa regola
  //    che tuneOrb applica alla sfera, dove uSize è proporzionale al raggio.
  //  - sfumatura: dove comincia e dove finisce il gradiente verticale del
  //    cervello (verde in alto, azzurro in basso), in frazioni del RAGGIO del
  //    cervello, simmetrico attorno al suo centro. Nike: «sfuma il cervello
  //    perché lo stacco dal verde all'azzurro è troppo evidente» — e non era
  //    una questione di gusto ma un bug di scala: le quote nello shader
  //    (−0,7 … 0,9) sono in unità della geometria, che è già moltiplicata per
  //    il raggio, quindi su un cervello di raggio ~30 la rampa era alta 1,6
  //    unità dentro una forma alta 47 e i due colori si toccavano su una riga.
  //    Il valore qui sotto è misurato a schermo (vedi il report D1c e
  //    `12-cervello-sfumato.png`): la forma va da −0,87 a +0,72 raggi, e una
  //    rampa più stretta della forma tiene le due tinte PIENE alle estremità —
  //    se no il verde di ATLAS non si vede quasi più — lasciando la
  //    transizione lunga abbastanza da non leggersi come un confine.
  var CERVELLO_CONFIG = { raggio: 0.46, alzata: 0.26, raggioTarato: 0.66, sfumatura: 0.55 };
  // Task D1 — la sfera di SABE scende nel COLLO (Nike: «la sfera di sabe va
  // fatta nella zona collo, tra il mento e il logo»). Era nella pancia (Task
  // A2), poi all'altezza della bocca dentro il visore (Task C2); adesso sta
  // nello spazio fra il fondo del visore e la cima del logo sul petto.
  //
  // DOVE, esattamente: il centro non è un numero ma il PUNTO MEDIO fra i due
  // riferimenti misurati in mondo — `visorBox.min.y` (il mento) e
  // `spline.logo.anchor.y + worldWidth/2` (il bordo alto della «A») — con X e
  // Z presi dal centro del bbox delle mesh del collo (che è l'asse di
  // simmetria: le mesh del collo sono simmetriche, misurato x = −2,75 contro
  // l'asse −2,75 dello split). Nessuna taratura: se un giorno il GLB cambia,
  // il centro si sposta da sé.
  //
  //  - raggio: in frazioni del raggio della testa, la stessa unità del
  //    cervello, così i due si confrontano a colpo d'occhio. Il vincolo del
  //    brief è LATERALE: la nuvola non deve sbordare oltre gli anelli del collo.
  //    A sbordare non è il raggio geometrico ma la corona di punti che il
  //    rumore gonfia e la sprite allarga, quindi si misura con la maschera
  //    alpha (sfera da sola contro collo da solo) e non con la geometria.
  //    Partita da 0,30 come indicava il brief: a 0,30 la nuvola sta dentro la
  //    LARGHEZZA del collo (10 px di margine per lato, misurati) ma esce dal
  //    BORDO ALTO, nel buio fra il mento e il colletto — 96 pixel verdi
  //    sospesi sul niente. Il vincolo vero però non è UNA posa: la nuvola GIRA
  //    (`spin`/`tilt`) e non è una palla liscia — ha una corona irregolare e
  //    un foro — quindi la sua sagoma cambia con la fase, e la testa punta il
  //    cursore, quindi il collo che la contiene cambia sagoma con la mira.
  //    Misurato il PEGGIO su 30 combinazioni (5 pose della testa × 6 fasi di
  //    rotazione): 0,27 → fino a 37 px fuori; 0,25 → 0 px fuori, margine
  //    minimo 2 px, 18 px di franco laterale dagli anelli. Sotto non conviene
  //    scendere: a 0,23 la nuvola si legge appena. Quindi 0,25.
  //  - presa: il raggio del COLLISORE invisibile attorno alla sfera, in raggi
  //    della sfera. Nike: «si fa fatica a farla comparire». Misurato a
  //    1440×900, chiedendo al raggio pixel per pixel chi vince: la lamiera del
  //    collo da sola dà 4284 px di area di presa (un riquadro di 124×60 px, e
  //    dentro quel riquadro solo il metallo), cioè tre millesimi dello
  //    schermo. Il collisore è una sfera `visible = false` — non si disegna,
  //    non fa ombra, non entra in nessuna maschera, ma il raggio la colpisce.
  //    Misurate quattro misure: 1,8 → 5940 px (+39%); 2,5 → 13236 px (×3,1,
  //    riquadro 200×94); 3,5 → 36844 (×8,6, 280×178); 4,5 → 80740 (×19,
  //    360×290, cioè grande come la testa). **2,5**: basta puntare la GOLA e
  //    un po' d'aria attorno, e non si accende il collo stando sul mento.
  //    Non ruba niente alle zone vicine, ed è geometria e non taratura: dove
  //    c'è il visore (z 55 contro 3) o il petto, quelli stanno davanti e
  //    vincono sulla distanza; il collisore vince solo dove davanti non c'è
  //    nient'altro, cioè nella fessura del collo, nei vuoti fra le lamelle e
  //    nel buio subito attorno alla gola.
  //  - margineSfumatura (Task D3): di quanto si ALLARGA la sfera quando serve
  //    a decidere che cosa sfuma. Nike: «la sfera va bene ma voglio che rendi
  //    invisibili anche le zone subito circostanti ad essa». La regola è
  //    geometrica: sfuma ogni mesh il cui bbox in mondo tocca una sfera di
  //    raggio (raggio della nuvola) × (1 + margineSfumatura) attorno al suo
  //    centro. **Misurato: su questo GLB il margine non decide niente.** Le
  //    mesh restano le stesse da margine 0 fino a margine 1,0 — le 16 del
  //    collo, che sfumavano già, più tre sole: il petto (che il brief tiene
  //    fuori per non confondere la zona «collo» con la zona «anima»), il
  //    visore (che per richiesta esplicita del Task D1 NON si apre per la
  //    sfera) e il pezzo sotto il mento, indice Spline 5. Dopo, il salto: la
  //    mesh successiva è una piastra del braccio a 2,27 raggi, cioè fuori
  //    anche con margine 1,0. Resta 0,35 perché sta comodamente dentro quel
  //    salto, non perché sia una taratura fine: è un valore che può muoversi
  //    del triplo senza cambiare una sola mesh.
  //  - foro (Task D3): il buco che la nuvola ha in mezzo, in raggi della
  //    sfera (`uBore` in pointorb.js, default 0,36). È la FASCIA SCURA che
  //    attraversava la nuvola, e non era una lamiera rimasta opaca: misurato,
  //    nascondendo TUTTE e 18 le mesh del collo e il petto la fascia resta
  //    identica (al più 5 pixel di scarto per riga, cioè il rumore fra due
  //    caricamenti). Il buco lo fa lo shader, ed è agganciato alla LINEA DI
  //    VISTA — quindi non ruota via col `spin`, sta fermo in mezzo. A 0,36 è
  //    tarato sulla pagina di SABE, dove la sfera è grande mezzo schermo e il
  //    buco le dà il volume di una ciambella; qui la nuvola è larga 88 px e
  //    quel buco se ne mangia 32 nel mezzo. A 0,10 resta il filo di vuoto che
  //    la fa leggere cava senza spaccarla in due.
  //  - count / pointSizeK / fovRef / spin / tilt: invariati dalla pancia e
  //    dalla bocca — sono la grana e la posa della pagina di SABE. pointSize =
  //    0.03 · altezza canvas · raggio mondo · tan(22.5°)/(tan(fov/2)/zoom),
  //    rifatto a ogni fit() (tuneOrb).
  //
  // Spariti con la bocca: `altezza` (la quota dentro il visore), `arretra`
  // (l'arretramento dal vetro) e `isteresi` (la banda morta fra le due zone
  // della testa). La testa torna ad avere UNA zona sola — il cervello su tutto
  // il visore — e il confine col collo non è più una quota dentro una mesh ma
  // il passaggio da una mesh all'altra: due insiemi disgiunti non hanno un
  // confine da far tremare.
  var SFERA_CONFIG = { raggio: 0.25, presa: 2.5, margineSfumatura: 0.35, foro: 0,
    count: 26000, pointSizeK: 0.03, fovRef: 22.5, spin: 0.21, tilt: 0.46 };
  // Task A2/C3 — la pancia: «anima», cioè il gestionale. Della sfera non resta
  // niente (Task C2: è salita nella testa) e dentro, per ora, non c'è NULLA —
  // Nike: «per ora niente animazione, poi la sceglierò». Il torso si apre lo
  // stesso e l'etichetta esce lo stesso: la zona è viva, è il suo contenuto
  // che manca.
  //  - insideShrink: quanto si stringe il bbox del torso per decidere quali
  //    mesh gli stanno DENTRO e quindi sfumano col reveal (vedi più sotto).
  //  - contenuto: IL PUNTO D'INNESTO, e si accende con una riga sola. È una
  //    fabbrica: riceve il contesto della scena e restituisce
  //    `{ object, update(dt, reveal, camera) }` — un Object3D qualunque
  //    (Points, Mesh, Group) più la sua animazione. Ci pensa poi robot.js a
  //    metterlo dentro il modello, a spegnergli le ombre, a disegnarlo solo
  //    col reveal della pancia e a smaltirlo al teardown, esattamente come
  //    faceva con la sfera. Esempio, da scrivere QUI quando Nike avrà scelto:
  //      contenuto: function (ctx) {
  //        var o = WC.pointOrb.create({ count: 26000, radius: ctx.size.x * 0.32 });
  //        o.points.position.copy(ctx.centro);
  //        return { object: o.points, update: function (dt, r, cam) { o.update(dt, r, cam); } };
  //      }
  var BELLY_CONFIG = { insideShrink: 0.85, contenuto: null };
  // Task C4 — il RESPIRO. Nike: «se riesci fai in modo che si muovano
  // leggermente anche le braccia e il tronco». Piccolo e lento: non è una
  // levitazione — il robot non TRASLA, né in verticale né altrove, e quello
  // resta vietato — è un tronco che oscilla sul bacino e due braccia che si
  // aprono e si chiudono di un grado e mezzo.
  //
  // IL RIG, e perché non è una rotazione sola. Un gruppo BUSTO incernierato
  // alla vita che porta con sé torso, testa e braccia: se il torso ruotasse da
  // solo, il collo e le spalle — che gli stanno infilate dentro — si
  // staccherebbero di qualche pixel a ogni respiro. E due gruppi BRACCIO
  // incernierati alla spalla, figli del busto, che portano con sé anche le
  // FIBRE. Le fibre dentro il gruppo non sono un dettaglio: sono il vincolo
  // («il movimento non deve far uscire le fibre dalla sagoma del braccio»), e
  // messe lì dentro la sagoma non può uscirne PER COSTRUZIONE, non per
  // taratura.
  //
  //  - gradi: le ampiezze (±). Tronco entro 0,8° su due assi, braccia entro
  //    1,5°, come da brief.
  //  - periodi: in secondi, e non multipli fra loro (7,3 / 5,1 / 4,3 / 6,7).
  //    Il minimo comune multiplo è dell'ordine delle migliaia di secondi:
  //    non c'è un istante in cui «riparte tutto insieme», quindi il ciclo non
  //    si sente. Tutte le sinusoidi partono da zero, così il primo fotogramma
  //    è ESATTAMENTE la posa di prima di questo task.
  //  - attivo: l'interruttore. A false le rotazioni vanno a zero ESATTO (non
  //    smorzate): serve alla verifica, che confronta il fotogramma a respiro
  //    spento con quello di fine C1 e lo vuole identico al pixel.
  //  - epsOmbra: quanta rotazione vale un ridisegno della shadow map. La testa
  //    usa 0,0005 rad perché si muove a scatti e poi si FERMA; il respiro non
  //    si ferma mai, e con quella soglia la mappa si rifarebbe a ogni
  //    fotogramma (97 draw call in più, misurate al Task 4b). 0,0026 rad =
  //    0,15° la rifà ~3 volte al secondo e tiene l'errore dell'ombra sotto il
  //    pixel (0,15° sul braccio più lungo = 0,58 unità mondo = 1,5 px... vedi
  //    il report C4 per la misura vera).
  var RESPIRO = {
    attivo: true,
    gradi:   { bustoX: 0.8, bustoZ: 0.8, braccioZ: 1.5, braccioX: 0.6 },
    periodi: { bustoX: 7.3, bustoZ: 5.1, braccioZ: 4.3, braccioX: 6.7 },
    epsOmbra: 0.0026
  };
  var D = WC.robotSplineData;
  var section = document.getElementById('cap05');
  var card    = document.getElementById('wcRobotCard');
  var stage   = document.getElementById('wcRobotStage');
  var hint    = document.getElementById('wcRobotHint');
  if (!section || !card || !stage) return;

  var cleanups = [];

  // Task A3 — le etichette anatomiche (js/anatomia.js). `anat` è l'overlay dei
  // tre link: lo monta la scena passandogli la camera, oppure — se la scena
  // non parte affatto (reduced-motion, three assente, GLB che non arriva) —
  // lo monta fail() nella sua versione FERMA, con gli agganci in punti fissi.
  // Non è un ripiego cosmetico: in questa sezione non c'è nessun altro
  // collegamento ad Atlas, SABE e Atelier, e senza overlay non ne resterebbe
  // nessuno per chi naviga da tastiera o con uno screen reader.
  var anat = null;
  function montaAnatomia(camera) {
    if (anat || !WC.anatomia) return;
    anat = WC.anatomia.mount({ stage: stage, host: card, camera: camera || null });
    if (anat) cleanups.push(function () { if (anat) { anat.dispose(); anat = null; } });
  }
  // Le condizioni per cui la scena non partirà MAI (si sanno già qui, non
  // serve aspettare che la sezione entri in vista): reduced-motion, three o i
  // suoi loader assenti, dati Spline mancanti.
  function scenaImpossibile() {
    return !ctx.motionOk || typeof THREE === 'undefined'
      || typeof THREE.GLTFLoader === 'undefined' || !D;
  }

  // Qui c'era un faro CSS che seguiva il cursore sulla card. Da quando la
  // scena prende tutta la sezione il faro ci finiva sotto e non si vedeva
  // più. Tolto, insieme al suo listener di mousemove. Il capitolo il suo
  // effetto di cursore ce l'ha lo stesso, ed è il circuito (data-cursor-fx
  // su #wcRobotCard, FX.circuit in js/cursorfx.js): sta DIETRO lo stage e si
  // vede attraverso i pixel vuoti del canvas.

  // --------------------------------------------------------------- caricam.
  var mounted = false;

  function fail(msg){
    // `hint` può NON essere più in pagina: dopo un caricamento riuscito lo si
    // toglie (hint.remove(), dentro la callback di gltf.load), e da lì in poi
    // un errore — un assert sui dati che scatta, per dire — scriverebbe il
    // messaggio dentro un nodo staccato. Al visitatore resterebbe un
    // rettangolo nero alto una schermata e nient'altro. Quindi si riattacca
    // prima di scrivere, e la classe `-failed` ha il suo stile in
    // css/sections.css (nasconde il canvas e mostra il messaggio).
    if (hint) {
      hint.textContent = msg;
      if (!hint.parentNode) stage.appendChild(hint);
    }
    stage.classList.add('-failed');
    // Task A3: niente scena → l'overlay si monta lo stesso, fermo.
    montaAnatomia(null);
  }

  // Task 7: cleanup unificato. Un solo helper che attraversa un Object3D e
  // smaltisce geometrie e materiali (array di materiali incluso) — lo
  // riusa il teardown finale (sotto) per il MODELLO (le 80 mesh coi materiali
  // Spline Head/Body/Parts di robot-spline-materials.js; headGroup è figlio
  // di `model`, quindi le mesh della testa ci rientrano), per il BRAIN e per
  // le FIBRE. Le texture dentro le uniform NON le tocca: quelle e il video
  // degli occhi li smaltisce spline.dispose(). `.dispose()` su una
  // risorsa già smaltita è un no-op sicuro in three.js (spara solo
  // l'evento 'dispose'), quindi se due chiamate si sovrappongono — es. il
  // brain e le fibre sono ENTRAMBI già discendenti di `model` nella
  // gerarchia attuale, quindi disposeObject3D(model) da solo li
  // coprirebbe già — non è un problema. Le chiamate restano comunque
  // esplicite e separate: non fanno affidamento su quella gerarchia, così
  // restano corrette anche se un task futuro riparenta brain/fibre altrove.
  function disposeObject3D(root){
    if (!root) return;
    root.traverse(function (obj) {
      if (obj.geometry) obj.geometry.dispose();
      if (obj.material) {
        if (Array.isArray(obj.material)) obj.material.forEach(function (m) { m.dispose(); });
        else obj.material.dispose();
      }
    });
  }

  function mount(){
    if (mounted) return;
    mounted = true;
    var torn = false;
    // Handle del loop di rendering. Sta QUI e non dentro la callback di
    // gltf.load (dov'è il loop) perché il suo cleanup va registrato PRIMA di
    // quello che smaltisce geometrie, materiali e renderer: i cleanup si
    // eseguono nell'ordine in cui sono stati messi in coda, e la callback di
    // load arriva molto dopo — il rAF finiva quindi in fondo, cioè il loop
    // faceva ancora almeno un render su risorse già smaltite.
    var raf = 0;

    // Reduced-motion: una scena 3D che gira di continuo è esattamente ciò che
    // l'impostazione chiede di non avere. Resta la card, senza il modello.
    // Stesso esito se three.js (o i loader vendorizzati) non sono disponibili.
    if (scenaImpossibile()) {
      fail('Modello 3D disattivato');
      return;
    }

    // Task 4: la testa segue il cursore. Il puntatore si traccia in NDC
    // rispetto allo stage (indipendente dal caricamento del modello, come
    // fit()/resize) — tick() (dentro la callback di gltf.load) lo legge
    // per closure. mouseleave (o cursore mai entrato) → active:false →
    // i target di rotazione/faceAmount tornano a 0/riposo nel loop.
    var pointer = { x: 0, y: 0, active: false };
    function onPointerMove(e) {
      var r = stage.getBoundingClientRect();
      if (!r.width || !r.height) return;
      pointer.x = ((e.clientX - r.left) / r.width) * 2 - 1;
      pointer.y = ((e.clientY - r.top) / r.height) * 2 - 1;
      pointer.active = true;
    }
    // Task D1d — uscendo dallo stage la grazia di 320 ms NON sopravvive.
    // Quella finestra serve ad attraversare il corridoio DENTRO il riquadro
    // per arrivare all'etichetta; se il puntatore se n'è andato del tutto non
    // c'è nessun corridoio da attraversare e il robot deve tornare quello di
    // prima subito. `svuotaGrazia` lo assegna tick() (closure), e resta null
    // finché il loop non parte.
    var svuotaGrazia = null;
    function onPointerLeave() { pointer.active = false; if (svuotaGrazia) svuotaGrazia(); }
    stage.addEventListener('mousemove', onPointerMove);
    stage.addEventListener('mouseleave', onPointerLeave);

    // Task A3 — il clic DENTRO l'animazione porta alla sezione («la prima è
    // meglio», Nike). Non un `click` ma pointerdown/pointerup con la soglia
    // dei 5 px: sullo stage si trascina (il robot non ruota, ma il gesto
    // esiste) e un trascinamento non deve navigare. La destinazione non si
    // ricalcola qui: si chiede all'overlay di premere il SUO link, così la
    // strada del mouse e quella della tastiera non possono divergere.
    //
    // NAVIGA SOLO SE IL RAGGIO STA COLPENDO DAVVERO LA ZONA, adesso. Non basta
    // `activeId`: quello sopravvive alla grazia di 320 ms e resta acceso a
    // tempo indeterminato finché un'etichetta ha il fuoco. Col solo `activeId`
    // bastava passare sulla testa, saltare in un angolo vuoto della scena e
    // cliccare lì per ritrovarsi su /atlas.html — un clic sul nulla che
    // portava da un'altra parte. `hitId` è la zona colpita in QUESTO
    // fotogramma: se le due non coincidono, il puntatore non è sulla zona e il
    // clic non è un clic sulla zona.
    var giu = null;
    function onDown(e) { giu = (e.button === 0) ? { x: e.clientX, y: e.clientY } : null; }
    function onUpStage(e) {
      var g = giu; giu = null;
      if (!g || !anat || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      if (Math.hypot(e.clientX - g.x, e.clientY - g.y) >= 5) return;
      var st = window.__robot && window.__robot.anatomia;
      if (!st || !st.activeId || st.hitId !== st.activeId) return;
      // Task C3: `cliccabile` e non `attiva`. La pancia è una zona attiva (si
      // apre, l'etichetta esce) ma non ha ancora una pagina dove andare: il
      // clic non deve fare niente, come non lo fa sull'etichetta.
      if (anat.cliccabile(st.activeId)) anat.vai(st.activeId);
    }
    function onCancel() { giu = null; }
    stage.addEventListener('pointerdown', onDown);
    stage.addEventListener('pointerup', onUpStage);
    stage.addEventListener('pointercancel', onCancel);

    cleanups.push(function () {
      stage.removeEventListener('mousemove', onPointerMove);
      stage.removeEventListener('mouseleave', onPointerLeave);
      stage.removeEventListener('pointerdown', onDown);
      stage.removeEventListener('pointerup', onUpStage);
      stage.removeEventListener('pointercancel', onCancel);
    });

    var renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    // Nessuna codifica in uscita e nessun tone mapping: r128 lascia
    // `outputEncoding` su LinearEncoding e va bene così. Tutti i materiali di
    // questa scena sono ShaderMaterial scritti a mano (robot-spline-glsl.js,
    // pointbrain.js, robot-fibers.js) e NESSUNO include `<encodings_fragment>`:
    // scrivono nel framebuffer il valore che calcolano, esattamente come fa la
    // scena Spline.
    // Qui c'era `renderer.outputEncoding = THREE.sRGBEncoding`, con la
    // motivazione "senza, il modello renderizza quasi nero". Era vera quando le
    // mesh avevano ancora il materiale bianco di default di three ("geometria
    // soltanto"); da quando i materiali sono i nostri quella riga non faceva
    // più niente. Verificato: forzando la ricompilazione di tutti i materiali,
    // il frame a sRGBEncoding e quello a LinearEncoding sono identici pixel per
    // pixel (somma dei canali su 1440×900: 18461001 in entrambi i casi).
    var scene = new THREE.Scene();
    // Ombre come Spline (Task 4b): la point light della scena Spline proietta
    // ombre (shadow map a cubo, PCF). Questa PointLight esiste SOLO per la
    // shadow map: intensità 0, perché l'illuminazione la calcolano i nostri
    // shader dalle loro uniform (robot-spline-materials.js) e la luce three
    // non deve aggiungerne. Stessa posizione mondo e stessi parametri d'ombra
    // letti da Spline (WC.robotSplineData.light.shadow), TRANNE mapSize e
    // radius: vedi SHADOW_MAP_LEGGERA.
    var shadowLight = null;
    if (D.light.shadow && D.light.shadow.enabled) {
      var S = D.light.shadow;
      // Shadow map più leggera di quella Spline, stessa ombra a schermo.
      // Spline: 2048 per faccia → atlante del cubo 8192×4096, ≈192–256 MiB di
      // memoria video (RGBA8 + depth) — troppo per una pagina pubblica su un
      // portatile normale. 1024 per faccia → 4096×2048, ≈48–64 MiB.
      // Il filtro (sp_shadow in robot-spline-glsl.js) sposta i prelievi di
      // (radius + 5) texel, e un texel vale 1/mapSize: per tenere la stessa
      // penombra in unità mondo il raggio scala con mapSize,
      //   r' = (r + 5) · 1024 / 2048 − 5 = (98.884 + 5) / 2 − 5 = 46.942.
      // Misurato vs Spline con la stessa posa (braccio/gambe/petto): 2048 →
      // 1.73/1.40/0.85, 1024 → 1.73/1.40/0.85 (512 → 1.73/1.41/0.85, non adottato).
      // Il tetto è 1024 (misurato sopra), ma non oltre la mappa estratta da
      // Spline: se un giorno arrivasse già più piccola di 1024, prenderla per
      // "leggera" la ingrandirebbe (upscale) invece di alleggerirla.
      var mapSizeLeggera = Math.min(1024, S.mapSize[0]);
      var SHADOW_MAP_LEGGERA = { mapSize: mapSizeLeggera, radius: (S.radius + 5) * mapSizeLeggera / S.mapSize[0] - 5 };
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = S.type;
      // La shadow map NON si rifà a ogni fotogramma. È una point light: sei
      // facce di cubo, e ogni faccia ridisegna tutte le mesh che proiettano —
      // 97 draw call in più per frame (misurate: 165 contro 68). Ma nella
      // scena si muove SOLO la testa, e quasi sempre nemmeno quella: a riposo
      // il fotogramma ricalcolava un'ombra identica a quella del fotogramma
      // prima. Da qui in poi la mappa si rifà solo quando c'è un motivo, e i
      // motivi sono quattro — ognuno rimette `needsUpdate` a true dove
      // succede: questa riga (la primissima ombra), fit() (poco sotto), la
      // testa che ha girato di almeno SHADOW_EPS dall'ultimo disegno e il
      // reveal che attraversa la soglia in cui visore e interni
      // smettono/riprendono a proiettare (r > 0.5, vedi setReveal in
      // robot-spline-materials.js). Gli ultimi due stanno in tick().
      // Nota su three r128: NON basta `shadowLight.shadow.needsUpdate`.
      // WebGLShadowMap.render esce subito se `autoUpdate === false &&
      // needsUpdate === false` SULLA MAPPA, prima ancora di guardare i flag
      // della singola luce — quindi la bandierina che conta è questa.
      renderer.shadowMap.autoUpdate = false;
      renderer.shadowMap.needsUpdate = true;   // la prima ombra va disegnata
      shadowLight = new THREE.PointLight(0xffffff, 0);
      shadowLight.position.fromArray(D.light.worldPosition);
      shadowLight.castShadow = true;
      shadowLight.shadow.mapSize.set(SHADOW_MAP_LEGGERA.mapSize, SHADOW_MAP_LEGGERA.mapSize);
      shadowLight.shadow.bias = S.bias;
      shadowLight.shadow.normalBias = S.normalBias;
      shadowLight.shadow.radius = SHADOW_MAP_LEGGERA.radius;
      // distance 0 → PointLightShadow usa camera.far così com'è (altrimenti la sostituirebbe con distance).
      shadowLight.shadow.camera.near = S.near;
      shadowLight.shadow.camera.far = S.far;
      shadowLight.shadow.camera.updateProjectionMatrix();
      scene.add(shadowLight);
    }
    // Camera della scena Spline: stessi fov/zoom/posizione/orientamento.
    var cam = new THREE.PerspectiveCamera(D.camera.fov, 1, D.camera.near, D.camera.far);
    cam.zoom = D.camera.zoom;
    cam.position.fromArray(D.camera.position);
    cam.quaternion.fromArray(D.camera.quaternion);
    var headTopWorld = null;
    // Task B1 — la mira della testa. `aimEyeLocal`: il centro del bbox della
    // testa in coordinate di headGroup, cioè l'occhio da cui parte lo sguardo
    // (locale e non mondo perché headGroup GIRA: un punto in mondo varrebbe
    // solo per la posa a riposo). `aimPlane`: il piano parallelo allo schermo
    // su cui si posa il puntatore. Restano nulli finché la testa non è stata
    // riparentata al collo — prima non c'è niente da mirare.
    var aimEyeLocal = null, aimPlane = null;
    // Raggio della sfera (Task D1: nel COLLO, fra il mento e il logo) in
    // unità MONDO: serve alla dimensione dei punti (tuneOrb), che si ricalcola
    // a ogni fit(). 0 = sfera non ancora costruita.
    var orbWorldRadius = 0;
    // Task C1 — i tre punti MONDO che definiscono il ritaglio (li riempie il
    // callback di gltf.load, quando il bbox del modello è noto) e
    // l'ingrandimento che ne esce. `ingrandimento` è 1 finché non c'è un
    // modello da inquadrare, così tutto quello che lo moltiplica resta com'era.
    var quadro = null, ingrandimento = 1;
    // `uSize` e `uPR` della sfera sono fissati alla costruzione (pointorb.js)
    // ma dipendono dall'altezza in CSS della canvas e dal pixel ratio: qui si
    // rifanno, come già si fa con uSize del cervello.
    // Task C1: `ingrandimento` in più. gl_PointSize non passa per la matrice
    // di proiezione, quindi il ritaglio dell'inquadratura ingrandisce la
    // GEOMETRIA ma lascia i punti della stessa misura in pixel: senza questo
    // fattore la sfera diventerebbe più rada del 16% rispetto a prima.
    function tuneOrb() {
      var h = stage.clientHeight;
      if (!h) return;
      var orb = window.__robot && window.__robot.orb;
      var fovScale = Math.tan(THREE.MathUtils.degToRad(SFERA_CONFIG.fovRef)) / (Math.tan(THREE.MathUtils.degToRad(cam.fov / 2)) / cam.zoom);
      if (orb && orbWorldRadius) {
        orb.uniforms.uSize.value = SFERA_CONFIG.pointSizeK * h * orbWorldRadius * fovScale * ingrandimento;
        orb.uniforms.uPR.value = renderer.getPixelRatio();
      }
      // Task D2: le fibre sono diventate una nuvola di punti e hanno la
      // stessa fame di questa taratura — stessa formula, stesso motivo
      // (gl_PointSize non passa per la matrice di proiezione, quindi né lo
      // zoom né il ritaglio dell'inquadratura la toccano).
      var fib = window.__robot && window.__robot.fibers;
      if (fib && fib.tune) fib.tune(h, fovScale, ingrandimento, renderer.getPixelRatio());
    }

    // Gli occhi a LED del visore sono un video (Task 5): scorre solo mentre la
    // sezione è davvero in vista. Noto PRIMA di gltf.load, così il materiale
    // nasce già nello stato giusto.
    var sectionVisible = !('IntersectionObserver' in window);
    var visIO = ('IntersectionObserver' in window) ? new IntersectionObserver(function (es) {
      sectionVisible = es.some(function (e) { return e.isIntersecting; });
      if (window.__robot && window.__robot.spline) window.__robot.spline.setPlaying(sectionVisible);
    }) : null;
    if (visIO) { visIO.observe(section); cleanups.push(function () { visIO.disconnect(); }); }

    var draco = new THREE.DRACOLoader();
    draco.setDecoderPath('vendor/draco/');
    var gltf = new THREE.GLTFLoader();
    gltf.setDRACOLoader(draco);

    // Misura in CSS px dello stage, letta in fit() e riusata da aSchermo():
    // proiettare tre agganci per fotogramma leggendo clientWidth/clientHeight
    // ogni volta costringerebbe il browser a rifare il layout dentro il loop
    // di rendering.
    var pxW = 0, pxH = 0;

    function fit(){
      var w = stage.clientWidth, h = stage.clientHeight;
      if (!w || !h) return;
      pxW = w; pxH = h;
      renderer.setSize(w, h, false);
      cam.aspect = w / Math.max(1, h);
      cam.clearViewOffset();
      cam.updateProjectionMatrix();
      // Task C1 — l'inquadratura. Si proiettano i tre punti del quadro con la
      // camera SENZA ritaglio (appena azzerato qui sopra), e da lì si ricava
      // il ritaglio che porta `quadro.alto` sul bordo superiore e
      // `quadro.basso` su quello inferiore. Con un ritaglio
      // (fullW, fullH, offX, offY, w, h) di ingrandimento m = fullW/w vale
      //   pixel = m · pixel_senza_ritaglio − off
      // in tutte e due le direzioni: da qui le tre righe qui sotto.
      // L'ingrandimento NON dipende da w/h — il campo verticale è fisso,
      // quindi la distanza in pixel fra due punti fermi del mondo è
      // proporzionale alla sola altezza del riquadro e il rapporto si
      // semplifica — ma si ricalcola lo stesso a ogni fit(): costa tre
      // proiezioni su un evento raro, e non lascia in giro un numero che
      // «vale solo per la prima misura».
      if (quadro) {
        var ya = aSchermo(quadro.alto).y, yb = aSchermo(quadro.basso).y;
        ingrandimento = h / Math.max(1, yb - ya);
        var offX = ingrandimento * aSchermo(quadro.centro).x - w / 2;
        var offY = ingrandimento * ya;
        // La regola della nav sopravvive al ritaglio, e col ritaglio è ancora
        // più facile da applicare: l'immagine si abbassa dei pixel che
        // mancano (l'offset è già in pixel del riquadro finale). Con
        // INQUADRATURA.aria attuale non scatta né a 900 né a 720 px di
        // altezza — resta una guardia, non una taratura.
        if (headTopWorld) {
          var need = CONFIG.minHeadTopPx - (ingrandimento * aSchermo(headTopWorld).y - offY);
          if (need > 0) offY -= need;
        }
        cam.setViewOffset(w * ingrandimento, h * ingrandimento, offX, offY, w, h);
        cam.updateProjectionMatrix();
        // Esposto per la verifica headless: l'ingrandimento è il numero da cui
        // dipendono la dimensione dei punti e la formula di FISSI.
        if (window.__robot) window.__robot.ingrandimento = ingrandimento;
      } else if (headTopWorld) {
        // Nessun quadro (non dovrebbe capitare: lo si costruisce insieme al
        // bbox del modello): resta la vecchia regola, FOV verticale fisso e
        // testa tenuta sotto la nav.
        var y = aSchermo(headTopWorld).y;
        var need0 = CONFIG.minHeadTopPx - y;
        if (need0 > 0) { cam.setViewOffset(w, h, 0, -need0, w, h); cam.updateProjectionMatrix(); }
      }
      if (window.__robot && window.__robot.spline) window.__robot.spline.setCamera(cam);
      // La mappa d'ombra di una point light non dipende dalla camera di vista,
      // quindi in teoria un fit() non la invalida. La rifacciamo lo stesso: i
      // fit sono rari (montaggio e resize della finestra) e costano un frame,
      // e così l'ombra non può restare indietro per un motivo che qui non
      // abbiamo previsto.
      renderer.shadowMap.needsUpdate = true;
      tuneOrb();
    }
    // Task A3: da punto MONDO a pixel del riquadro (lo stesso rettangolo su cui
    // sta l'overlay delle etichette). Un solo Vector3 riusato: gira nel loop.
    var vProj = new THREE.Vector3();
    function aSchermo(p) {
      vProj.copy(p).project(cam);
      return { x: (vProj.x + 1) / 2 * pxW, y: (1 - vProj.y) / 2 * pxH };
    }
    stage.appendChild(renderer.domElement);

    // Il GLB e il file dei dati sono UNA SOLA estrazione: gli assert qui sotto
    // appaiano mesh per mesh l'uno all'altro (nome, indice di nodo, bbox). Un
    // visitatore con il GLB vecchio in cache e i dati nuovi li fa saltare, e la
    // sezione muore. Il file dei dati un `?v=` ce l'ha (index.html), il GLB no:
    // qui lo prende, e non da una copia scritta a mano — lo legge dal tag
    // <script> che ha caricato i dati, così i due non possono divergere. Se
    // quel tag non c'è (pagina montata diversamente) si carica senza token:
    // com'era prima, non peggio.
    var dataTag = document.querySelector('script[src*="robot-spline-data.js"]');
    var dataVer = dataTag && /[?&]v=([^&]*)/.exec(dataTag.getAttribute('src') || '');
    var GLB_URL = 'assets/robot.glb' + (dataVer && dataVer[1] ? '?v=' + dataVer[1] : '');

    gltf.load(GLB_URL, function(g){
      if (torn) return;
      // Task 8 (pulizia): tutto il corpo di questa callback è avvolto in
      // try/catch. GLTFLoader r128 richiama onLoad da dentro una catena di
      // Promise (parser.parse().then(onLoad)) senza un .catch() proprio: se
      // onLoad lancia (i vari `throw new Error(...)` di controllo qui sotto —
      // indice mancante, nome disallineato, gerarchia non piatta...) three
      // NON la instrada al terzo argomento di gltf.load (quello sotto,
      // `function(e){...}`, pensato per errori di rete/Draco/GLB) ma la
      // lascia diventare un unhandled promise rejection: in pagina, e
      // nell'harness (prova.mjs ascolta 'pageerror' e i console 'error'),
      // l'assert falliva silenzioso invece di far scattare fail() e il log
      // di errore. Stesso trattamento del ramo di rete qui sotto.
      try {
      var model = g.scene;
      // Il GLB è nelle coordinate della scena Spline: niente ricentratura,
      // la camera Spline lo inquadra così com'è.
      scene.add(model);
      model.updateMatrixWorld(true);
      // Posa della scena Spline: il GLB di agosto ha le braccia in una posa
      // diversa (più chiuse). Applichiamo la matrixWorld letta da Spline per
      // ogni mesh, appaiata per INDICE DI NODO GLTF — non per ordine di
      // model.traverse(), che NON è stabile (i nodi entrano nella scena man
      // mano che Draco li decodifica, verificato: 3 caricamenti della stessa
      // pagina hanno dato 3 ordini diversi). GLTFLoader registra però
      // l'indice di nodo originale per ogni oggetto (vendor/three-r128/
      // GLTFLoader.js:3254, `parser.associations`) — quello sì stabile, ed è
      // lo stesso ordine della scena Spline (verificato: verifica-dati.mjs
      // asserisce già i nomi per indice fra GLB grezzo e Spline).
      model.traverse(function (o) {
        if (!o.isMesh) return;
        var a = g.parser.associations.get(o);
        if (!a || a.type !== 'nodes') throw new Error('[robot] mesh senza indice di nodo glTF: ' + o.name);
        o.userData.splineIndex = a.index;
      });
      // Controllo di sicurezza: se un nome esiste su entrambi i lati deve
      // combaciare (stessa normalizzazione di verifica-dati.mjs) — non deve
      // mai scattare, se scatta l'indice non è più affidabile.
      function base(n) { return String(n || '').replace(/[\s.\[\]:\/]/g, '_').replace(/(_\d+)+$/, '').toLowerCase(); }
      var inv = new THREE.Matrix4().copy(model.matrixWorld).invert();
      model.traverse(function (mesh) {
        if (!mesh.isMesh) return;
        // Gerarchia FLAT: questo blocco decompone `inv · matrixWorld-Spline`
        // (locale a `model`) direttamente in mesh.position/quaternion/scale,
        // il che è corretto SOLO se mesh è figlia DIRETTA di `model` (vedi
        // robot-parts.js, che assume la stessa cosa). Verificato vero per il
        // GLB attuale (80/80), ma un GLB futuro con gruppi intermedi
        // romperebbe questa math silenziosamente — l'assert lo rende un
        // errore rumoroso invece di una posa storta.
        if (mesh.parent !== model) throw new Error('[robot] gerarchia non piatta: "' + mesh.name + '" non è figlia diretta di model');
        var dm = D.meshes[mesh.userData.splineIndex];
        if (!dm || !dm.matrixWorld) return;
        if (dm.name && base(dm.name) !== base(mesh.name)) {
          throw new Error('[robot] indice ' + mesh.userData.splineIndex + ': GLB "' + mesh.name + '" ≠ Spline "' + dm.name + '"');
        }
        var mw = new THREE.Matrix4().fromArray(dm.matrixWorld);
        var local = new THREE.Matrix4().multiplyMatrices(inv, mw);
        local.decompose(mesh.position, mesh.quaternion, mesh.scale);
        // Ombre: chi proietta e chi riceve, come nella scena Spline (per indice).
        mesh.castShadow = dm.castShadow === true;
        mesh.receiveShadow = dm.receiveShadow === true;
      });
      model.updateMatrixWorld(true);
      var box = new THREE.Box3().setFromObject(model);
      // Task C1 — il quadro dell'inquadratura, in punti MONDO ricavati dal
      // bbox del modello e dalle frazioni di INQUADRATURA. Tutti e tre alla
      // stessa profondità (la z del centro del modello): la proiezione
      // prospettica dipende anche da z, e prendere i due estremi verticali a
      // due profondità diverse vorrebbe dire misurare l'altezza del quadro
      // con due righelli differenti. `centro` porta lo scarto orizzontale.
      var altezzaRobot = box.max.y - box.min.y;
      var cBox = box.getCenter(new THREE.Vector3());
      quadro = {
        alto:   new THREE.Vector3(cBox.x, box.max.y + INQUADRATURA.aria * altezzaRobot, cBox.z),
        basso:  new THREE.Vector3(cBox.x, box.max.y - INQUADRATURA.taglio * altezzaRobot, cBox.z),
        centro: new THREE.Vector3(cBox.x - INQUADRATURA.scartoX * altezzaRobot, cBox.y, cBox.z)
      };
      if (hint) hint.remove();

      // Handle esposti per i task successivi (materiali/testa di vetro/
      // point-brain/fibre) e per la verifica headless: window.__robot
      // segnala che il modello è a schermo.
      window.__robot = { model: model, scene: scene, camera: cam, renderer: renderer, box: box, state: { faceAmount: 0 }, pointer: pointer, shadowLight: shadowLight };

      // Split in sotto-parti (testa/corpo/braccia) per i task successivi
      // (materiali per parte, testa che segue il cursore, fibre delle
      // braccia). WC.robotParts.split è definito in robot-parts.js,
      // caricato PRIMA di questo file in index.html.
      if (WC.robotParts) {
        var parts = WC.robotParts.split(model);
        window.__robot.parts = parts;

        // Materiali Spline (Head/Body/Parts) su tutte le 80 mesh, per indice
        // di nodo: il visore (unica mesh 'Head') con gli occhi a LED video.
        // Il reveal (hoverHead, da tick() più sotto) rende il visore
        // trasparente, spegne gli occhi e sfuma gli interni.
        if (WC.robotSplineMaterials) {
          var sm = WC.robotSplineMaterials.create(D);
          // Subito in window.__robot: se assign() lancia (errore in console),
          // il teardown smaltisce comunque video e materiali (spline.dispose()).
          window.__robot.spline = sm;
          var asg = WC.robotSplineMaterials.assign(model, D, sm);
          window.__robot.parts.visor = asg.visor;
          window.__robot.parts.chest = asg.chest;
          // Mesh Parts DENTRO il volume del visore (il Cylinder, y 208–261,
          // dentro il visore y 222–304): al reveal sfumano col vetro, così non
          // coprono il cervello. Quelle del collo, col centro sotto il visore,
          // restano opache.
          //
          // ORDINE DI DISEGNO, esplicito e distinto per tutta la coda
          // trasparente (Task A2, esteso dal Task B2): sfera della pancia,
          // cervello e guscio delle braccia 0 → interni (testa e pancia) 1 →
          // visore e fibre delle braccia 2 → petto 3. Il petto è trasparente
          // (porta il reveal della pancia): senza un renderOrder più ALTO
          // della sfera finirebbe per coprirla.
          var vb = new THREE.Box3().setFromObject(asg.visor);
          var inside = parts.head.filter(function (m) {
            if (m === asg.visor || m.userData.splineMaterial !== 'Parts') return false;
            return vb.containsPoint(new THREE.Box3().setFromObject(m).getCenter(new THREE.Vector3()));
          });
          sm.makeInside(inside, asg.visor, 'head');
          asg.visor.renderOrder = 2;
          // Task 7: il logo «A» bianco lucido, stampato SOLO sulla mesh del
          // petto (istanza del materiale Body col define LOGO).
          if (asg.chest) { sm.makeChest(asg.chest); asg.chest.renderOrder = 3; }
          // Task B2: il braccio si apre come la testa, ma tenendo il contorno.
          // Ogni mesh-braccio riceve un'ISTANZA del materiale che già aveva
          // (Parts o Body: sul GLB sono 11 e 2 per lato) col define ARM_REVEAL
          // in più, così si apre solo il braccio sotto il cursore e non le
          // altre decine di mesh che condividono quegli stessi materiali.
          // A riposo uArmReveal è 0: alpha 1, depth scritta — il braccio di
          // prima, pixel per pixel (verificato, meanDiff 0).
          sm.makeApribile(parts.armL, 'armL');
          sm.makeApribile(parts.armR, 'armR');
          // ------------------------------------------------- Task D1: IL COLLO
          // Le mesh del collo, trovate per GEOMETRIA e non per nome (dei 80
          // nomi del GLB solo tre sono affidabili — vedi robot-parts.js — e
          // qui si parla di `Cube`, `mesh_11`, `Cylinder_3`...).
          //
          // Il riquadro è quello del brief: in Y va dal bordo alto del LOGO
          // sul petto (`logo.anchor.y + worldWidth/2`) al fondo del VISORE (il
          // mento), cioè esattamente lo spazio che Nike chiama «collo»; in X e
          // Z prende la misura del visore, perché il collo è più stretto della
          // testa — e questo, senza nessuna soglia inventata, tiene fuori le
          // braccia, che a quell'altezza stanno oltre |x| 32.
          // Dentro ci finisce una mesh se ci sta il suo CENTRO: è la stessa
          // regola già usata qui sopra per gli interni del visore, ed è quella
          // giusta perché i pezzi del collo SPORGONO dal riquadro (i montanti
          // salgono fino a y 239, dietro il casco) pur essendo collo.
          //
          // Si sceglie dentro `parts.head` e non su tutto il modello, e non è
          // un dettaglio: lo split mette il cluster testa+collo insieme
          // (robot-parts.js taglia su un GAP reale in Y), e le due zone —
          // cervello e collo — devono essere DISGIUNTE, altrimenti lo stesso
          // raggio accenderebbe tutte e due. Quel che resta fuori dal collo è
          // la zona del cervello: `parts.testaSola`.
          var collo = [], colloBox = null;
          if (sm.logo) {
            var yMento = vb.min.y;
            var yLogo = sm.logo.anchor.y + sm.logo.worldWidth / 2;
            var riquadroCollo = new THREE.Box3(
              new THREE.Vector3(vb.min.x, yLogo, vb.min.z),
              new THREE.Vector3(vb.max.x, yMento, vb.max.z));
            var cColl = new THREE.Vector3();
            collo = parts.head.filter(function (m) {
              if (m === asg.visor || inside.indexOf(m) >= 0) return false;
              return riquadroCollo.containsPoint(new THREE.Box3().setFromObject(m).getCenter(cColl));
            });
            if (!collo.length) throw new Error('[robot] nessuna mesh del collo fra il logo (y ' + yLogo.toFixed(1) + ') e il mento (y ' + yMento.toFixed(1) + ')');
            colloBox = new THREE.Box3();
            collo.forEach(function (m) { colloBox.union(new THREE.Box3().setFromObject(m)); });
            // Il collo si apre come il braccio: alpha bassa al centro, bordo
            // ancora leggibile, niente depth scritta — così la sfera che ci
            // sta dentro si vede. Un gruppo a parte ('collo'), così il collo
            // si apre senza aprire le braccia e viceversa.
            sm.makeApribile(collo, 'collo');
            window.__robot.collo = { yMento: yMento, yLogo: yLogo, box: colloBox.clone() };
          }
          window.__robot.parts.collo = collo;
          // Con cosa si interroga il raggio. Di default le mesh del collo e
          // basta; se la sfera esiste, ci si aggiunge il suo collisore
          // invisibile (vedi più avanti, `colloPresa`).
          window.__robot.parts.colloPresa = collo;
          window.__robot.parts.testaSola = parts.head.filter(function (m) { return collo.indexOf(m) < 0; });
          sm.setCamera(cam);   // dopo makeInside/makeChest/makeApribile: anche i cloni ricevono la luce
          window.__robot.parts.inside = inside;
          if (window.__debugParts) console.log('[robot] interni testa:', inside.map(function (m) { return m.name; }));
          if (window.__debugParts) console.log('[robot] collo:', collo.map(function (m) { return m.name; }));
          sm.setPlaying(sectionVisible);
        }

        // Task 6 (rework) + Task B2: le fibre luminose DENTRO le braccia
        // ("i fasci"). robot-fibers.js ricava tutto dalle mesh-braccio vere
        // (`parts.armL`/`parts.armR`): asse, fette, raggio locale, percorso.
        // Task B2 — `parts.joints` non serve più e non viene più passato: era
        // in coordinate MONDO mentre i vertici si campionano in model-locale,
        // e mescolare i due frame è stata la causa radice di tre derive di
        // fila. Ora l'asse esce dagli stessi vertici del percorso, quindi un
        // secondo frame da cui sbagliare non esiste più. (`split` continua a
        // calcolare i giunti: nessuno li consuma oggi.)
        // Figlie DIRETTE di `model` (aggiunto sotto): restano incollate alle
        // braccia — gerarchia FLAT confermata (`mesh.parent === model`).
        // Il surge per lato (0..1, "la corrente si accende dove passi") è
        // pilotato dal raycast del cursore sulle mesh-braccio in tick(), più
        // sotto, e pilota a sua volta l'apertura del braccio.
        if (WC.robotFibers && (parts.armL.length || parts.armR.length)) {
          var fibers = WC.robotFibers.create({ armL: parts.armL, armR: parts.armR, model: model });
          if (window.__debugParts) console.log('[robot] fibre:', JSON.stringify(fibers.info));
          // Le fibre sono luce, non materia: niente ombra nella shadow map (Task 4b).
          fibers.object.traverse(function (o) { o.castShadow = false; o.receiveShadow = false; });
          model.add(fibers.object);
          window.__robot.fibers = fibers;
        }

        // Task 4: la testa (parts.head, incluso il collo — vedi
        // robot-parts.js) passa da figlia diretta di `model` a figlia di un
        // headGroup pivotato al collo (bottom-center del bbox unito della
        // testa), così ruotare headGroup.rotation gira la testa attorno al
        // collo invece che attorno al centro dell'intero robot. Task 5
        // parenta il point-brain allo STESSO headGroup.
        //
        // updateMatrixWorld(true) di sicurezza prima di leggere/scrivere
        // posizioni mondo per il pivot della testa: già chiamato una volta
        // subito dopo scene.add(model) (sopra) e non più invalidato nel
        // frattempo — il modello non viene più ricentrato e split() non
        // sposta nulla. Resta qui perché costa nulla e protegge il pivot e
        // il re-parenting "preserva mondo" (sotto) se in futuro qualcosa a
        // monte tornasse a muovere il modello prima di questo punto.
        if (parts.head.length) {
          scene.updateMatrixWorld(true);
          var headParent = parts.head[0].parent; // `model`: gerarchia piatta (vedi robot-parts.js)
          var headBox = new THREE.Box3();
          parts.head.forEach(function (m) { headBox.union(new THREE.Box3().setFromObject(m)); });
          var hc = headBox.getCenter(new THREE.Vector3());
          var pivotWorld = new THREE.Vector3(hc.x, headBox.min.y, hc.z); // bottom-center = collo

          var headGroup = new THREE.Group();
          headGroup.name = 'headGroup';
          // Task B1 — ordine degli angoli YXZ (prima l'implicito XYZ di three).
          // Con YXZ la matrice è Ry·Rx e il «davanti» vale esattamente
          // (sin yaw·cos pitch, −sin pitch, cos yaw·cos pitch): le due formule
          // della mira (atan2) sono allora ESATTE. Con XYZ (Rx·Ry) il davanti
          // è (sin yaw, −sin pitch·cos yaw, cos pitch·cos yaw) e le stesse
          // formule sbagliano di poco ma non di niente — misurato col
          // controllo `testa-punta`: 26 px fuori bersaglio negli angoli in
          // basso, contro 1–2 px in alto dove gli angoli sono piccoli.
          // A riposo (0,0,0) i due ordini danno la stessa identica matrice,
          // quindi la scena ferma non cambia di un pixel.
          headGroup.rotation.order = 'YXZ';
          headParent.add(headGroup);
          headParent.updateWorldMatrix(true, false);
          headGroup.position.copy(headParent.worldToLocal(pivotWorld.clone()));
          headGroup.updateMatrixWorld(true);

          // Re-parenting "preserva mondo": per ogni mesh calcolo la
          // trasformazione locale rispetto a headGroup che riproduce
          // esattamente la matrixWorld attuale (mesh invariata a schermo),
          // poi la sposto sotto headGroup e scompongo la matrice in
          // position/quaternion/scale locali.
          parts.head.forEach(function (m) {
            m.updateWorldMatrix(true, false);
            var localMat = new THREE.Matrix4().copy(headGroup.matrixWorld).invert().multiply(m.matrixWorld);
            headGroup.add(m);
            localMat.decompose(m.position, m.quaternion, m.scale);
          });

          window.__robot.headGroup = headGroup;

          var hb = new THREE.Box3(); parts.head.forEach(function (m) { hb.union(new THREE.Box3().setFromObject(m)); });
          headTopWorld = new THREE.Vector3((hb.min.x + hb.max.x) / 2, hb.max.y, (hb.min.z + hb.max.z) / 2);
          fit();

          // Centro e raggio della testa in coordinate LOCALI di headGroup, non
          // mondo: headGroup ha solo posizione, ma `model` può portare una
          // scala propria dal GLB — lavorare in locale slega queste misure da
          // quella scala (e il centro resta valido anche a testa girata, che è
          // ciò che serve alla mira del Task B1). Le usano la mira qui sotto e
          // il point-brain più avanti (il raggio va nelle stesse unità delle
          // mesh figlie).
          headGroup.updateMatrixWorld(true);
          var invHead = new THREE.Matrix4().copy(headGroup.matrixWorld).invert();
          var localHeadBox = new THREE.Box3();
          parts.head.forEach(function (m) {
            m.updateWorldMatrix(true, false);
            localHeadBox.union(new THREE.Box3().setFromObject(m).applyMatrix4(invHead));
          });
          var headCenterLocal = localHeadBox.getCenter(new THREE.Vector3());
          var headSizeLocal = localHeadBox.getSize(new THREE.Vector3());
          var headRadius = Math.max(headSizeLocal.x, headSizeLocal.y, headSizeLocal.z) * 0.5;

          // Task D1 — il CENTRO DELLA SFERA nel collo, in coordinate di
          // headGroup. Il punto è quello del brief, in mondo: punto medio fra
          // il mento (`visorBox.min.y`) e il bordo alto del logo, con X e Z
          // dal centro del bbox delle mesh del collo. Qui si porta solo in
          // locale, perché i figli di headGroup vivono lì (e `model` può
          // portare una scala propria dal GLB).
          //
          // PERCHÉ LOCALE A headGroup E NON AL MODELLO. Il brief chiedeva di
          // parentare la sfera al modello, per il timore che seguendo la testa
          // «scivolerebbe fuori dal collo appena la testa punta il cursore».
          // Su QUESTO GLB è vero il contrario, ed è misurato: le mesh del collo
          // stanno nel cluster testa dello split (robot-parts.js taglia su un
          // gap reale in Y, e il collo è sopra quel gap), quindi sono figlie di
          // headGroup e GIRANO con la mira — la maschera del collo a schermo si
          // sposta fino a 49 px in orizzontale e 19 in verticale fra le quattro
          // pose estreme. Una sfera ferma nel mondo uscirebbe dal collo di
          // mezza larghezza di collo; parentata a headGroup ci resta dentro per
          // costruzione, che è quello che il brief chiede di ottenere. Vedi il
          // report D1 per le misure nelle quattro pose.
          var colloCentroLocal = null;
          if (window.__robot.collo) {
            var cB = window.__robot.collo.box.getCenter(new THREE.Vector3());
            colloCentroLocal = new THREE.Vector3(cB.x,
              (window.__robot.collo.yMento + window.__robot.collo.yLogo) / 2, cB.z)
              .applyMatrix4(invHead);
          }

          // Task B1 — il piano di mira. È parallelo allo schermo (normale =
          // asse Z della camera) e sta FRA la camera e la testa, a
          // CONFIG.aimDepth della distanza camera→testa. NON alla profondità
          // della testa: lì l'occhio starebbe SUL piano, il bersaglio gli
          // cadrebbe sempre di fianco e mai davanti, e la testa dovrebbe
          // girarsi di 90° per guardarlo (misurato: ±89,9° per ogni posizione
          // del puntatore, centro della testa compreso). La camera non si
          // muove mai — niente orbit, niente drag — quindi il piano si calcola
          // una volta sola qui.
          aimEyeLocal = headCenterLocal.clone();
          var camDir = new THREE.Vector3(0, 0, -1).transformDirection(cam.matrixWorld);
          var eyeWorld0 = headGroup.localToWorld(aimEyeLocal.clone());
          var aimDist = eyeWorld0.sub(cam.position).dot(camDir) * CONFIG.aimDepth;
          aimPlane = new THREE.Plane().setFromNormalAndCoplanarPoint(
            camDir, cam.position.clone().addScaledVector(camDir, aimDist));
          // Esposti per la verifica headless (controllo `testa-punta`): con
          // occhio e piano si ricostruisce da fuori DOVE sta guardando la
          // testa, senza rifare i conti di qui dentro.
          window.__robot.aim = { eyeLocal: aimEyeLocal, plane: aimPlane };

          // Task 5: il point-brain DENTRO la testa. Stesso helper del cervello
          // di Vesper (WC.pointBrain, js/pointbrain.js). Parentato a headGroup,
          // si muove in sincrono con la testa; si accende col reveal a tutta
          // testa quando il cursore ci passa sopra (RITOCCO 2 — vedi tick()).
          if (WC.pointBrain) {
            // Task C2 (Nike: «cervello più piccolo»): il cervello sta nella
            // CALOTTA. Prima riempiva quasi tutto il volume interno (0.66 del
            // raggio-testa, RITOCCO 2). I due numeri stanno in
            // CERVELLO_CONFIG, in cima al file, e restano quelli anche dopo il
            // Task D1, che ha ridato al visore una zona sola.
            var brainRadius = headRadius * CERVELLO_CONFIG.raggio;
            var brainPos = headCenterLocal.clone().add(new THREE.Vector3(0, headSizeLocal.y * CERVELLO_CONFIG.alzata, 0));
            // Taratura della dimensione dei punti. Nello shader del brain
            // gl_PointSize ≈ uSize * 200 / (-mv.z), con -mv.z ≈ distanza
            // camera→testa in unità MONDO. Il modello non è in unità
            // "piccole" (la camera Spline sta a ~1000 unità, vedi D.camera
            // sopra), quindi la uSize di Vesper (0.067: camera vicina,
            // raggio ~1) renderebbe punti invisibili. La lego alla distanza
            // reale così legge a qualunque scala del GLB.
            var headCenterWorld = headGroup.localToWorld(headCenterLocal.clone());
            var camDist = cam.position.distanceTo(headCenterWorld);
            // gl_PointSize non segue lo zoom né il fov, la geometria sì.
            // Prima: fov 32°. Ora fov 45° con zoom 2 (fov effettivo ≈ 23,4°).
            // fovScale mantiene lo stesso rapporto punti/cervello di prima.
            // Task C1: `ingrandimento` in più, per lo stesso motivo di
            // tuneOrb — il ritaglio dell'inquadratura ingrandisce la geometria
            // ma non gl_PointSize, e senza questo fattore il cervello
            // risulterebbe più rado del 16% dentro una testa più grande.
            // `ingrandimento` è una costante della scena (non dipende dalla
            // misura del riquadro, vedi fit()) e qui è già stato calcolato:
            // fit() gira qualche riga più su, appena headTopWorld è noto.
            // Task C2: e il fattore raggio/raggioTarato, perché il cervello si
            // è rimpicciolito e la GRANA deve restare quella (vedi
            // CERVELLO_CONFIG in cima al file).
            var fovScale = Math.tan(THREE.MathUtils.degToRad(16)) / (Math.tan(THREE.MathUtils.degToRad(cam.fov / 2)) / cam.zoom);
            var brainUSize = 4 * camDist / 200 * fovScale * ingrandimento
              * (CERVELLO_CONFIG.raggio / CERVELLO_CONFIG.raggioTarato);

            // Il brain (THREE.Points, additivo, transparent+depthWrite:false)
            // sta dentro la testa: a riposo non si disegna affatto (tick()),
            // col reveal si vede attraverso il visore trasparente. renderOrder
            // 0: si disegna prima degli interni (1) e del visore (2).
            function placeBrain(brain) {
              brain.points.castShadow = false;   // Task 4b: il cervello non proietta ombre
              brain.points.receiveShadow = false;
              brain.points.position.copy(brainPos);
              brain.uniforms.uSize.value = brainUSize;
              // Task D1c (Nike: «sfuma il cervello perché lo stacco dal verde
              // all'azzurro è troppo evidente»). Il gradiente verticale dello
              // shader va da uGradRange.x a uGradRange.y in unità della
              // GEOMETRIA, e le posizioni sono già moltiplicate per il raggio:
              // il default (−0,7 … 0,9) vale per un cervello di raggio 1
              // (Vesper, ATLAS) e lì copre tutta la forma; su questo, che di
              // raggio ne ha ~30, era una rampa alta 1,6 unità in mezzo a una
              // forma alta 47 — il taglio netto che Nike ha visto. Qui la
              // rampa si scrive sulle quote VERE di questo cervello, in
              // frazione della sua mezza altezza (CERVELLO_CONFIG.sfumatura).
              // I due colori NON si toccano: sono la palette di ATLAS.
              if (brain.uniforms.uGradRange) {
                var gy = brainRadius * CERVELLO_CONFIG.sfumatura;
                brain.uniforms.uGradRange.value.set(-gy, gy);
              }
              headGroup.add(brain.points);
              window.__robot.brain = brain;
            }

            // ref1 (correzione utente): il cervello del robot campiona LA
            // STESSA mesh cotta di Vesper (assets/brain-mesh.bin) — non più
            // una nuvola procedurale generica — quindi la FORMA legge
            // identica a quella di Vesper e di ATLAS (stessa mesh per
            // entrambi). Task 7b (correzione utente, 2026-09-19 — "il
            // cervello fallo di colore uguale al cervello nella sezione
            // atlas"): la PALETTE però è ora quella di ATLAS, non più quella
            // di Vesper — WC.pointBrain.atlasBrainUniforms() al posto del
            // precedente vesperBrainUniforms().
            // Il fetch è asincrono ma dentro il flusso torn-guarded del mount:
            // se il teardown è già scattato (torn) o la mesh non arriva, si
            // ripiega sulla nuvola procedurale (comportamento precedente),
            // senza mai crashare. Il brain, appena creato, è aggiunto a
            // headGroup (figlio di model) e smaltito dal teardown unificato.
            fetch('assets/brain-mesh.bin').then(function (res) {
              if (!res.ok) throw new Error('brain mesh: ' + res.status + ' ' + res.statusText);
              return res.arrayBuffer();
            }).then(function (buf) {
              if (torn || !window.__robot) return;
              var decoded = WC.pointBrain.decodeBrainMesh(buf);
              var srcGeo = new THREE.BufferGeometry();
              srcGeo.setAttribute('position', new THREE.BufferAttribute(decoded.positions, 3));
              srcGeo.setIndex(new THREE.BufferAttribute(decoded.indices, 1));
              var brain = WC.pointBrain.create({
                // ~stessa DENSITÀ di Vesper (baseline tier: 26000 punti sulla
                // stessa mesh) così la forma reale del cervello legge fitta
                // come là, non rada come i 4000 procedurali di prima.
                count: 24000,
                radius: brainRadius,
                sampleFrom: new THREE.Mesh(srcGeo),
                uniforms: WC.pointBrain.atlasBrainUniforms()
              });
              srcGeo.dispose();
              placeBrain(brain);
            }).catch(function (err) {
              if (torn || !window.__robot) return;
              // Fallback: nuvola procedurale — la sezione resta in piedi anche
              // se la mesh cotta non carica. Task 8 (pulizia): usava ancora
              // l'azzurro di Vesper (0x8bd6ff) da prima del Task 7b — con la
              // palette ATLAS sul percorso principale, quel ripiego avrebbe
              // cambiato colore proprio quando la rete fallisce. Stessa
              // palette ATLAS (atlasBrainUniforms) di sopra, non un color
              // singolo: la nuvola procedurale legge identica nella tinta,
              // solo più rada (4000 punti contro i 24000 campionati sulla mesh).
              // console.warn (non error) così l'harness resta "console-clean".
              console.warn('[robot] mesh del cervello non caricata, uso la nuvola procedurale:', err);
              placeBrain(WC.pointBrain.create({ count: 4000, radius: brainRadius, uniforms: WC.pointBrain.atlasBrainUniforms() }));
            });
          }

          // Task D1 — la sfera di SABE nel COLLO. Era nella pancia (Task A2,
          // dietro la «A»), poi dentro il visore all'altezza della bocca (Task
          // C2); Nike l'ha spostata qui: «tra il mento e il logo».
          // Parentata a headGroup come il cervello, e per lo stesso motivo
          // delle mesh che le stanno attorno: il collo è figlio di headGroup e
          // gira con la mira, quindi solo lì dentro la sfera resta ferma NEL
          // COLLO (vedi il commento di `colloCentroLocal`, più sopra).
          if (WC.pointOrb && colloCentroLocal) {
            var orbRadius = headRadius * SFERA_CONFIG.raggio;
            var orb = WC.pointOrb.create({ count: SFERA_CONFIG.count, radius: orbRadius });
            // Task D3 — il foro della nuvola, che è fermo sulla linea di vista
            // e su una sfera di 88 px la attraversa come una fascia scura.
            // Il default resta quello di SABE: si scrive solo qui.
            orb.uniforms.uBore.value = SFERA_CONFIG.foro;
            orb.points.castShadow = false;      // è luce, non materia
            orb.points.receiveShadow = false;
            orb.points.position.copy(colloCentroLocal);
            // renderOrder 4: ULTIMA di tutta la coda trasparente, dopo il
            // petto (3). È la correzione di Nike — «la sfera non la riesco a
            // vedere completamente perché risulta coperta dal busto e dal
            // collo». Misurato a renderOrder 2: dei 1558 px della nuvola, 999
            // (il 64%) finivano sotto il PETTO, che si disegna dopo e li
            // ripassa con alpha 1; il visore invece non ne copriva nessuno.
            // Disegnandola per ultima la nuvola si SOMMA sopra la lamiera
            // invece di esserne cancellata — è la stessa regola che le fibre
            // usano dentro la manica del braccio (renderOrder 2 contro lo 0
            // del guscio). E non sporca niente attorno: la sua maschera sta
            // tutta DENTRO la sagoma del collo (0 px fuori, misurato), quindi
            // quello che si accende è la gola e nient'altro.
            //
            // Quello che si vede DAVVERO è però più largo della maschera
            // alpha: la corona di punti più deboli sta sotto la soglia di 8/255
            // con cui si misura, e sul carbonio scuro del petto si vede lo
            // stesso. Nel fotogramma vero l'alone scende una trentina di pixel
            // sotto il colletto. È il prezzo di vedere la sfera INTERA: metà
            // della nuvola sta dentro il volume del torso (il petto arriva a
            // y 213, il centro della sfera è a 205), quindi o la si taglia o
            // la si lascia brillare sopra la lamiera. Nike ha chiesto di
            // vederla tutta.
            orb.points.renderOrder = 4;
            orb.points.visible = false;         // a riposo non si disegna affatto
            headGroup.add(orb.points);
            window.__robot.orb = orb;
            orbWorldRadius = orbRadius * Math.abs(model.getWorldScale(new THREE.Vector3()).x);
            // L'AREA DI PRESA della zona (Nike: «si fa fatica a farla
            // comparire»). Una sfera invisibile attorno alla nuvola: non si
            // disegna e non entra in nessuna maschera, ma il raycast la
            // colpisce. Sta in `parts.colloPresa` — la lista con cui si
            // interroga il raggio — e NON in `parts.collo`, che è la lista
            // delle mesh vere: quella serve ad aprire il collo e a misurarne
            // la sagoma, e un collisore lì dentro le falserebbe tutte e due.
            var presa = new THREE.Mesh(
              new THREE.SphereGeometry(orbRadius * SFERA_CONFIG.presa, 12, 8),
              new THREE.MeshBasicMaterial());
            presa.name = 'colloPresa';
            presa.visible = false;              // non si disegna MAI
            presa.castShadow = false; presa.receiveShadow = false;
            presa.position.copy(colloCentroLocal);
            headGroup.add(presa);
            window.__robot.parts.colliderCollo = presa;
            window.__robot.parts.colloPresa = window.__robot.parts.collo.concat([presa]);

            // -------------------------------- Task D3: LA SFUMATURA ATTORNO
            // Nike: «la sfera va bene ma voglio che rendi invisibili anche le
            // zone subito circostanti ad essa». La selezione del collo
            // (riquadro mento→logo) prende i pezzi del COLLO; quello che sta
            // appiccicato alla sfera e non è collo restava opaco.
            //
            // La regola è geometrica e si scrive qui, e non su nel blocco del
            // riquadro, per un motivo solo: qui il centro e il raggio della
            // sfera esistono DAVVERO — sono quelli della nuvola appena
            // costruita, letti dal suo oggetto — invece di essere ricalcolati
            // una seconda volta e sperare che coincidano. Le mesh a questo
            // punto sono già sotto headGroup, ma il riparentamento preserva il
            // mondo: i bbox in mondo sono ancora quelli della posa Spline.
            var cSfera = orb.points.getWorldPosition(new THREE.Vector3());
            var rSel = orbWorldRadius * (1 + SFERA_CONFIG.margineSfumatura);
            // Distanza punto→bbox: zero se il centro ci sta dentro. È la
            // «sagoma che interseca la sfera» del brief, presa sul bbox in
            // mondo e non sui triangoli — dieci volte più veloce e, con
            // mesh grandi come queste, più prudente (il bbox è più grosso
            // della mesh, quindi al più prende una mesh in più, mai una in
            // meno).
            var distBox = function (bb, c) {
              return new THREE.Vector3(
                Math.max(bb.min.x, Math.min(c.x, bb.max.x)),
                Math.max(bb.min.y, Math.min(c.y, bb.max.y)),
                Math.max(bb.min.z, Math.min(c.z, bb.max.z))).distanceTo(c);
            };
            // CHI RESTA FUORI, e perché — per identità, mai per raggio:
            //  - il PETTO: aprirlo vorrebbe dire aprire tutto il torso, cioè
            //    rendere la zona «collo» identica alla zona «anima» (è la
            //    deviazione 3 del Task D1b, e resta valida). Il suo bbox
            //    contiene il centro della sfera, quindi qualunque margine lo
            //    pescherebbe: va escluso a mano o non si esclude mai.
            //  - il VISORE: il Task D1 chiede esplicitamente che col cursore
            //    sul collo il visore NON si apra e gli occhi restino accesi.
            //    Il suo bbox arriva al mento, a 0,99 raggi dal centro: entra
            //    anche con margine ZERO.
            //  - le mesh del collo: ci sono già.
            var fuoriPerIdentita = [window.__robot.parts.chest, window.__robot.parts.visor];
            var giaCollo = window.__robot.parts.collo;
            var attorno = [];
            model.traverse(function (m) {
              if (!m.isMesh || m.userData.splineIndex === undefined) return;
              if (giaCollo.indexOf(m) >= 0 || fuoriPerIdentita.indexOf(m) >= 0) return;
              if (distBox(new THREE.Box3().setFromObject(m), cSfera) <= rSel) attorno.push(m);
            });
            // Le mesh che stanno DENTRO il visore hanno già un'istanza loro
            // (makeInside, che le fa sfumare col cervello): a quelle si
            // AGGIUNGE lo strato dell'apertura invece di clonarne una seconda
            // — vedi `ancheApribile`. Le altre seguono la strada normale.
            var giaInside = window.__robot.parts.inside || [];
            var doppie = attorno.filter(function (m) { return giaInside.indexOf(m) >= 0; });
            var nuove = attorno.filter(function (m) { return giaInside.indexOf(m) < 0; });
            if (doppie.length) sm.ancheApribile(doppie, 'collo');
            if (nuove.length) sm.makeApribile(nuove, 'collo');
            if (attorno.length) sm.setCamera(cam);   // le nuove istanze vogliono la luce
            // `parts.collo` NON cambia, ed è voluto: quella lista è l'IDENTITÀ
            // della zona — con lei si interroga il raggio, si misura la sagoma
            // del collo e si aggancia l'etichetta. Qui si sta decidendo solo
            // che cosa SFUMA. Tenere le due cose separate vuol dire che il
            // pezzo sotto il mento continua a rispondere al cervello quando ci
            // passi sopra (sta dentro il visore: è lì che deve mandarti) e
            // sfuma lo stesso quando ad accendersi è il collo.
            window.__robot.parts.colloSfumate = giaCollo.concat(attorno);
            if (window.__debugParts) console.log('[robot] attorno alla sfera:', attorno.map(function (m) { return m.name + '#' + m.userData.splineIndex; }));
          }
        }

        // Task A2 — l'anima nella pancia. Stesso meccanismo del cervello dentro
        // la testa, una zona più in basso: il torso diventa quasi trasparente e
        // dietro la «A» — che resta piena — si vede la sfera di SABE
        // (WC.pointOrb, js/pointorb.js). Due pezzi:
        //   1. quali mesh sfumano DENTRO il torso, come `inside` per la testa;
        //   2. la sfera, ancorata al centro del LOGO e spinta indietro.
        // Parentata a `model` e NON a headGroup: il torso non gira col collo.
        var spline = window.__robot.spline;
        var chest = window.__robot.parts.chest;
        if (spline && chest) {
          model.updateMatrixWorld(true);
          var chestBox = new THREE.Box3().setFromObject(chest);
          var chestSize = chestBox.getSize(new THREE.Vector3());
          // Cosa sta DENTRO il torso. Non basta il centro dentro il bbox pieno:
          // prenderebbe spalle, anello del collo e bacino, che stanno FUORI dal
          // corpo. Si stringe il bbox a 0.85 e si chiede la contenenza INTERA,
          // limitando alle mesh 'Parts' (Head è il solo visore, Body è la
          // scocca). Sul GLB attuale non ne passa nessuna: il torso è una
          // scocca chiusa e vuota — vedi il report del Task A2. La regola resta
          // perché un GLB con dei pezzi dentro li sfumerebbe da sé.
          var shrunk = new THREE.Box3().setFromCenterAndSize(
            chestBox.getCenter(new THREE.Vector3()),
            chestSize.clone().multiplyScalar(BELLY_CONFIG.insideShrink));
          var bellyInside = [];
          model.traverse(function (m) {
            if (!m.isMesh || m === chest || m.userData.splineMaterial !== 'Parts') return;
            if (shrunk.containsBox(new THREE.Box3().setFromObject(m))) bellyInside.push(m);
          });
          // `capo` a null: il TORSO CONTINUA A PROIETTARE OMBRA anche a pancia
          // aperta, al contrario del visore. Misurato sullo stesso fotogramma a
          // riposo, una volta con chest.castShadow e una senza: la sua ombra
          // non cade quasi per niente sulle gambe (0,12% dei pixel cambia di
          // più di 8/255) ma copre quasi tutto il BRACCIO di destra (5,5% dei
          // pixel, punte di 224/255). Spegnerla a metà reveal accenderebbe
          // quel braccio di colpo — il lampo che lo spec temeva, solo su un
          // altro pezzo. Gli interni della pancia, se un giorno ce ne saranno,
          // seguono invece il reveal come quelli della testa.
          spline.makeInside(bellyInside, null, 'belly');
          window.__robot.parts.bellyInside = bellyInside;
          if (window.__debugParts) console.log('[robot] interni pancia:', bellyInside.map(function (m) { return m.name; }));

          // Task C2: qui c'era la sfera di SABE, dietro la «A» del petto. È
          // salita nella testa (Task C2) e poi scesa nel COLLO (Task D1, vedi
          // più sopra nel blocco di headGroup). Con lei decade la regola «il logo sparisce
          // quando compare la sfera»: la «A» resta piena, a riposo e a pancia
          // aperta, perché non ha più niente da lasciar vedere dietro di sé.
          //
          // Task C3 — al suo posto il PUNTO D'INNESTO di ciò che Nike
          // sceglierà di mettere nella pancia. Oggi BELLY_CONFIG.contenuto è
          // null e questo blocco non fa niente: il torso si apre e dentro non
          // c'è nulla. Domani basta la fabbrica in BELLY_CONFIG (in cima al
          // file) e tutto il resto — ombre spente, ordine di disegno, accendi
          // e spegni col reveal, smaltimento — è già scritto qui.
          if (BELLY_CONFIG.contenuto) {
            var invModel = new THREE.Matrix4().copy(model.matrixWorld).invert();
            var chestLocal = chestBox.clone().applyMatrix4(invModel);
            var dentro = BELLY_CONFIG.contenuto({
              chest: chest, model: model, camera: cam, logo: spline.logo,
              centro: chestLocal.getCenter(new THREE.Vector3()),
              size: chestLocal.getSize(new THREE.Vector3())
            });
            if (dentro && dentro.object) {
              dentro.object.traverse(function (o) { o.castShadow = false; o.receiveShadow = false; });
              dentro.object.renderOrder = 0;   // prima di interni (1), visore (2), petto (3)
              dentro.object.visible = false;   // a riposo non si disegna affatto
              model.add(dentro.object);
              window.__robot.bellyContent = dentro;
            }
          }
          // I cloni trasparenti degli interni della pancia nascono DOPO il
          // setCamera di qui sopra: senza questo secondo giro resterebbero con
          // uLightPos a zero, cioè illuminati da un punto che non c'è.
          spline.setCamera(cam);
        }
        fit();

        // ---------------------------------------------- Task A3: gli agganci
        // Dove nasce la linea spezzata di ogni zona. Il punto sta sul BORDO
        // ESTERNO della zona — quello rivolto via dal corpo — così la linea
        // esce verso il vuoto e non attraversa il robot.
        //
        // «Esterno» NON si decide per nome della variabile: `parts.armL` e
        // `parts.armR` sono nomi di comodo dello split (robot-parts.js), e
        // l'ordine di model.traverse() non è stabile. Si proiettano ENTRAMBI
        // gli estremi in X con la camera e si prende quello che a schermo
        // cade più in là dalla parte giusta — stesso metodo con cui si decide
        // quale dei due gruppi-braccio è quello a SINISTRA DELLO SCHERMO.
        function unione(arr) {
          var b = new THREE.Box3();
          arr.forEach(function (m) { b.union(new THREE.Box3().setFromObject(m)); });
          return b;
        }
        // `dallAlto`, se c'è, è l'altezza dell'aggancio in frazione del bbox
        // della zona contata DALL'ALTO (Y del mondo cresce verso l'alto, la Y
        // dello schermo verso il basso); se manca si prende la metà.
        function bordoEsterno(box, verso, dallAlto) {
          var c = box.getCenter(new THREE.Vector3());
          var y = (dallAlto === undefined) ? c.y : box.max.y - (box.max.y - box.min.y) * dallAlto;
          var a = new THREE.Vector3(box.min.x, y, c.z), b = new THREE.Vector3(box.max.x, y, c.z);
          var pa = aSchermo(a), pb = aSchermo(b);
          return (verso > 0 ? (pa.x > pb.x) : (pa.x < pb.x)) ? a : b;
        }
        // Agganci: la testa in coordinate LOCALI di headGroup (gira col collo,
        // e l'etichetta le resta attaccata), pancia e braccio in mondo — non
        // si muovono mai.
        //
        // Task C4 — e continuano a non muoversi col respiro, che è il vincolo
        // del brief («non deve far ballare gli agganci delle etichette»).
        // Pancia e braccio sono punti MONDO letti adesso, a respiro fermo: il
        // respiro è una sinusoide simmetrica attorno allo zero, quindi questa
        // è esattamente la POSA MEDIA. La testa, che il suo aggancio ce l'ha
        // in locale, si riporta in mondo con una matrice del busto senza
        // respiro (vedi `mBustoFermo`, più sotto): segue la mira del cursore,
        // non l'oscillazione.
        var ancoraTestaLoc = null, ancoraColloLoc = null, ancoraPancia = null, ancoraBraccio = null;
        var braccioSx = null, braccioDx = null;
        if (parts.armL.length && parts.armR.length) {
          var boxL = unione(parts.armL), boxR = unione(parts.armR);
          var sinistraEL = aSchermo(boxL.getCenter(new THREE.Vector3())).x <= aSchermo(boxR.getCenter(new THREE.Vector3())).x;
          braccioSx = sinistraEL ? parts.armL : parts.armR;
          braccioDx = sinistraEL ? parts.armR : parts.armL;
          ancoraBraccio = bordoEsterno(sinistraEL ? boxL : boxR, -1);
        }
        if (window.__robot.parts.chest) {
          // La pancia NON si aggancia a metà altezza del torso, e non è una
          // licenza estetica: le braccia pendono a fianco del busto e a
          // schermo lo chiudono da entrambi i lati per tutta la sua altezza —
          // misurato a 1440×900, il braccio di destra occupa x 850÷1000 fra
          // y 330 e y 800, cioè esattamente la fascia che una linea uscita a
          // metà torso (y ≈ 485) dovrebbe attraversare per andarsene.
          // Provato: la linea passava sopra il bicipite per ~125 px e
          // l'aggancio finiva nascosto dietro il braccio, come se la linea
          // nascesse dal nulla. A 0,06 dall'alto (y ≈ 331 a schermo) esce
          // dalla spalla e va via sul vuoto: è la prima altezza che libera il
          // braccio con un margine che regge anche a 1280×720.
          ancoraPancia = bordoEsterno(new THREE.Box3().setFromObject(window.__robot.parts.chest), 1, 0.06);
        }
        if (window.__robot.headGroup && parts.head.length) {
          var hg = window.__robot.headGroup;
          hg.updateMatrixWorld(true);
          // Task C2 — la testa ha DUE agganci, e nessuno dei due è più a metà
          // del bbox. Quel punto (la vecchia regola) cadeva a y 239, cioè
          // SOTTO la linea della bocca (246): l'etichetta «cervello» avrebbe
          // indicato la bocca, e quella di «sabe» le sarebbe finita addosso.
          // «cervello» esce dal bordo esterno del VISORE a 0,25 dall'alto, in
          // mezzo alla calotta dov'è il cervello.
          // Task D1 — il secondo aggancio è sceso con la sfera: esce dal bordo
          // esterno del bbox delle MESH DEL COLLO, all'altezza del centro
          // della sfera (cioè lo stesso punto medio mento-logo, non una
          // seconda taratura che può scollarsi). Tutti e due restano in
          // coordinate di headGroup, perché collo e visore girano insieme.
          var visorBoxW = window.__robot.parts.visor
            ? new THREE.Box3().setFromObject(window.__robot.parts.visor) : unione(parts.head);
          ancoraTestaLoc = hg.worldToLocal(bordoEsterno(visorBoxW, 1, 0.25));
          if (window.__robot.collo) {
            var cbx = window.__robot.collo.box;
            var yCollo = (window.__robot.collo.yMento + window.__robot.collo.yLogo) / 2;
            ancoraColloLoc = hg.worldToLocal(bordoEsterno(cbx, 1,
              (cbx.max.y - yCollo) / Math.max(1e-6, cbx.max.y - cbx.min.y)));
          }
        }

        // ------------------------------------------------ Task C4: il respiro
        // Si monta DOPO gli agganci, e non è indifferente: gli agganci sono
        // punti mondo letti dalla posa a riposo, e il riparentamento qui sotto
        // preserva il mondo — quindi leggerli prima o dopo dà lo stesso
        // risultato, ma prima è più facile da credere.
        var busto = null, braccia = [], mBustoFermo = null, pivotTestaFermo = null, scalaModello = null;
        // Riparentamento «preserva mondo»: per ogni figlio si calcola la
        // trasformazione locale rispetto al nuovo genitore che riproduce
        // esattamente la sua matrixWorld attuale. È lo stesso passo già usato
        // per headGroup, e vale la stessa nota: `decompose` scrive nel
        // quaternion, e three tiene in sincrono `rotation` rispettando il suo
        // `order` (headGroup è YXZ e lo resta).
        function riparenta(nuovo, figli) {
          figli.forEach(function (o) {
            if (!o) return;
            o.updateWorldMatrix(true, false);
            var local = new THREE.Matrix4().copy(nuovo.matrixWorld).invert().multiply(o.matrixWorld);
            nuovo.add(o);
            local.decompose(o.position, o.quaternion, o.scale);
          });
        }
        function gruppoPivot(nome, pivotWorld, genitore) {
          var g = new THREE.Group();
          g.name = nome;
          genitore.add(g);
          genitore.updateWorldMatrix(true, false);
          g.position.copy(genitore.worldToLocal(pivotWorld.clone()));
          g.updateMatrixWorld(true);
          return g;
        }
        if (window.__robot.parts.chest) {
          model.updateMatrixWorld(true);
          var torsoBox = new THREE.Box3().setFromObject(window.__robot.parts.chest);
          var torsoC = torsoBox.getCenter(new THREE.Vector3());
          // Cerniera del busto: bottom-center del torso, cioè la VITA. Sopra
          // ci sta tutto quello che respira, sotto il bacino che resta fermo.
          busto = gruppoPivot('respiroBusto', new THREE.Vector3(torsoC.x, torsoBox.min.y, torsoC.z), model);
          riparenta(busto, [window.__robot.parts.chest, window.__robot.headGroup]);
          var fibre = window.__robot.fibers ? window.__robot.fibers.groups : null;
          [[parts.armL, fibre && fibre.armL], [parts.armR, fibre && fibre.armR]].forEach(function (coppia) {
            if (!coppia[0].length) return;
            var bb = unione(coppia[0]);
            var cc = bb.getCenter(new THREE.Vector3());
            // Cerniera del braccio: top-center del suo bbox, cioè la SPALLA.
            var g = gruppoPivot('respiroBraccio', new THREE.Vector3(cc.x, bb.max.y, cc.z), busto);
            riparenta(g, coppia[0].concat(coppia[1] ? [coppia[1]] : []));
            // `verso`: il braccio dalla parte delle x minori gira
            // all'incontrario, così le due braccia si aprono e si chiudono
            // INSIEME invece di sbandare tutte e due dalla stessa parte (che
            // sarebbe un'anca che oscilla, non un respiro). Il lato si decide
            // dalla geometria — la x del suo centro rispetto a quella del
            // torso — e non dal nome `armL`/`armR`, che è un nome di comodo
            // dello split.
            braccia.push({ gruppo: g, verso: (cc.x < torsoC.x) ? -1 : 1 });
          });
          // La matrice del busto SENZA respiro: solo la sua posizione. Serve
          // agli agganci della testa (vedi tick()) e si calcola una volta
          // sola, perché né `model` né il pivot si muovono più.
          mBustoFermo = new THREE.Matrix4().copy(model.matrixWorld)
            .multiply(new THREE.Matrix4().makeTranslation(busto.position.x, busto.position.y, busto.position.z));
          // Dove sta il pivot del collo quando il busto non respira. È fisso
          // (né `model` né i due pivot si muovono più) e lo usano gli agganci
          // delle etichette della testa, vedi tick().
          if (window.__robot.headGroup) {
            pivotTestaFermo = window.__robot.headGroup.position.clone().applyMatrix4(mBustoFermo);
          }
          scalaModello = model.getWorldScale(new THREE.Vector3());
          // Esposto per la verifica headless (`niente-movimento`): da fuori si
          // leggono ampiezze, posizioni (che NON devono cambiare) e
          // l'interruttore.
          window.__robot.respiro = { config: RESPIRO, busto: busto, braccia: braccia };
        }
        montaAnatomia(cam);

        // Verifica visiva dello split (Task 2, dietro flag): tinteggia
        // testa/braccia/corpo con colori piatti (MeshBasicMaterial, non
        // sensibile alla luce) così lo screenshot dell'harness mostra
        // chiaramente quali mesh sono finite in quale gruppo.
        if (window.__debugParts) {
          var dbgHead = new THREE.MeshBasicMaterial({ color: 0x22cc55 });
          var dbgArm = new THREE.MeshBasicMaterial({ color: 0x22d8ff });
          var dbgBody = new THREE.MeshBasicMaterial({ color: 0x888888 });
          parts.head.forEach(function (m) { m.material = dbgHead; });
          parts.armL.forEach(function (m) { m.material = dbgArm; });
          parts.armR.forEach(function (m) { m.material = dbgArm; });
          parts.body.forEach(function (m) { m.material = dbgBody; });
        }
      }

      // Task 7 — luce del logo: una luce virtuale (accesa SOLO per la «A»,
      // nessun effetto sul resto del corpo) messa davanti al logo e spostata
      // dove punta il mouse, così il riflesso bianco gli scorre sopra. A riposo
      // torna alla posizione di LOGO_CONFIG.lightRest (in alto a sinistra).
      // Smorzata come la rotazione della testa: il riflesso insegue, non scatta.
      var logoRest = (window.__robot.spline && window.__robot.spline.logo)
        ? window.__robot.spline.logo.lightRest : { x: 0, y: 0 };
      var logoTarget = new THREE.Vector2(logoRest.x, logoRest.y), logoNow = logoTarget.clone();
      // Ancora della luce in coordinate di VISTA: la camera non si muove mai
      // (niente orbit/drag), quindi si calcola una volta sola.
      var logoView = new THREE.Vector3();
      if (window.__robot.spline && window.__robot.spline.logo) {
        logoView.copy(window.__robot.spline.logo.anchor).applyMatrix4(cam.matrixWorldInverse);
      }
      var logoLight = new THREE.Vector3();

      // `raf` è dichiarato in mount() (vedi lì il perché): qui si assegna soltanto.
      var lastTick = (window.performance && performance.now) ? performance.now() : Date.now();
      // RITOCCO 2: reveal a TUTTA testa. Un solo Raycaster riusato ogni frame
      // (niente allocazioni); se il cursore colpisce una qualunque mesh della
      // testa, un fattore smorzato `hoverHead` (0..1, esponenziale come
      // rotazione/faceAmount) sale a 1 — il visore (spline.setReveal: vetro
      // trasparente, occhi spenti, interni sfumati) e il brain
      // (update(dt, reveal)) seguono questo stesso segnale.
      var raycaster = new THREE.Raycaster();
      var lensNdc = new THREE.Vector2();
      // Task B1: i tre appoggi della mira, allocati una volta sola (girano nel
      // loop) — bersaglio sul piano, occhio corrente, inversa del parent di
      // headGroup.
      var vAim = new THREE.Vector3(), vEye = new THREE.Vector3(), mAim = new THREE.Matrix4();
      var hoverHead = 0;
      // Task D1 — il COLLO è una zona a sé, e il suo segnale è UNO SOLO: apre
      // il collo (`setApertura`) e accende la sfera, come il surge del braccio
      // apre la manica e accende la fibra. Qui c'erano `hoverCervello` e
      // `hoverSfera`, le due zone in cui il Task C2 aveva diviso la testa per
      // altezza: la divisione non c'è più — sopra c'è il visore (una zona
      // sola, il cervello), sotto il collo — e con lei sono spariti la linea
      // della bocca, la sua isteresi e lo stato `zonaTesta` che serviva a
      // ricordare da che parte si veniva. Due insiemi di MESH disgiunti non
      // hanno un confine da far tremare.
      var hoverCollo = 0;
      // Task A2: il gemello per la pancia (raycast sul SOLO torso) e
      // l'orologio della posa della sfera.
      var hoverBelly = 0, orbTime = 0;
      // Task 6: surge delle fibre per braccio (0..1, smorzato) — stesso
      // Raycaster riusato (Task 7: stesso raggio del reveal testa sotto,
      // niente secondo setFromCamera — il puntatore è lo stesso NDC per i
      // due test, cambiano solo gli oggetti intersecati), un'intersezione
      // per frame contro parts.armL/armR separatamente. Persistono fuori da
      // tick() (come hoverHead) per lo smoothing esponenziale frame-su-frame.
      var surgeL = 0, surgeR = 0;
      // Task A3: la zona con l'etichetta accesa, e per quanto resta accesa
      // dopo che il raggio non colpisce più niente. 320 ms coprono il primo
      // tratto del corridoio vuoto fra modello e testo (~400 px) e non fanno
      // strascico quando si esce dal robot e basta; il resto del tragitto lo
      // copre `RIPRESA` in anatomia.js, che riaccende la zona quando il
      // puntatore arriva davvero sull'etichetta.
      var GRAZIA = 320;
      // Task D1d — APRIRE e CHIUDERE non hanno la stessa fretta.
      //  - APERTURA 0,18 a fotogramma: è la salita di sempre (~12 fotogrammi,
      //    200 ms), abbastanza morbida da non sembrare un interruttore.
      //  - CHIUSURA 0,35: ~8 fotogrammi, 130 ms. Serve perché il difetto che
      //    Nike ha fotografato è proprio una chiusura lenta — col vecchio 0,18
      //    (e 0,05 sulle braccia) il pezzo che si stava spegnendo restava
      //    visibile mentre quello nuovo si accendeva, e per mezzo secondo si
      //    vedevano DUE cose aperte. Non è uno scatto: 130 ms si vedono.
      //  - SOGLIA_SPENTO: sotto questa, zero ESATTO. Lo smorzamento
      //    esponenziale non ci arriva mai da solo, e «quasi zero» vuol dire
      //    un cervello ancora disegnato (points.visible legge la stessa soglia)
      //    e un vetro ancora un filo trasparente.
      var APERTURA = 0.18, CHIUSURA = 0.35, SOGLIA_SPENTO = 0.004;
      function verso(v, acceso) {
        v += ((acceso ? 1 : 0) - v) * (acceso ? APERTURA : CHIUSURA);
        if (!acceso && v < SOGLIA_SPENTO) v = 0;
        return v;
      }
      var zonaAttiva = null, zonaUltima = null, zonaScadenza = 0;
      svuotaGrazia = function () { zonaUltima = null; zonaScadenza = 0; };
      var vAnc = new THREE.Vector3();
      // Stato dell'ombra: la rotazione della testa e la soglia di proiezione
      // del visore al momento in cui la shadow map è stata disegnata l'ultima
      // volta (vedi shadowMap.autoUpdate = false più sopra). NaN/null = "mai
      // disegnata", così il primo giro di tick() la marca comunque.
      // SHADOW_EPS è il minimo di rotazione che vale un ridisegno. Il confronto
      // è contro l'ULTIMO DISEGNO, non contro il fotogramma precedente: lo
      // smorzamento (0.12/frame) fa passi sempre più piccoli avvicinandosi al
      // bersaglio, e misurando frame su frame l'ombra resterebbe ferma mentre
      // la testa continua a scivolare. Così invece l'errore accumulato non
      // supera mai SHADOW_EPS.
      // 0.0005 rad = 0.03°. Misurato confrontando ogni fotogramma con lo
      // stesso fotogramma a ombra rifatta: mentre la testa gira la differenza è
      // ZERO (l'ombra si rifà a ogni passo, com'è giusto), e quando si assesta
      // resta al massimo 8/255 su qualche decina di pixel del bordo di
      // penombra — su 1,3 milioni. A 0.0015 arrivava a 12/255 su ~116: sarebbe
      // stato invisibile lo stesso, ma scendere non costa niente (il
      // decadimento smorzato passa sotto la soglia in qualche fotogramma in
      // più e poi si ferma comunque).
      var SHADOW_EPS = 0.0005;
      var shadowYaw = NaN, shadowPitch = NaN, shadowCast = null, shadowCastBelly = null;
      // Task C4: orologio del respiro, angoli dell'ultima ombra disegnata
      // (NaN = mai) e la matrice della testa senza respiro, allocata una volta.
      var respiroT = 0, ombraRespiro = [NaN, NaN, NaN, NaN];
      var mTestaFerma = new THREE.Matrix4();
      var vFwdTesta = new THREE.Vector3(), eTestaFerma = new THREE.Euler(0, 0, 0, 'YXZ');
      (function tick(){
        raf = requestAnimationFrame(tick);
        var robot = window.__robot;
        var now = (window.performance && performance.now) ? performance.now() : Date.now();
        var dt = Math.min(0.05, (now - lastTick) / 1000); lastTick = now;
        // Task C4 — il respiro, PRIMA di tutto il resto: la mira della testa
        // legge la matrice del suo genitore (che adesso è il busto) e il
        // raycast lavora sulle mesh che il busto porta con sé.
        // `ctx.motionOk` è la seconda serratura di prefers-reduced-motion: con
        // quell'impostazione la scena non parte nemmeno (scenaImpossibile), ma
        // se un giorno partisse, il respiro resterebbe fermo lo stesso.
        if (busto) {
          var acceso = RESPIRO.attivo && ctx.motionOk;
          respiroT += dt;
          var G = RESPIRO.gradi, T = RESPIRO.periodi;
          var onda = function (periodo) { return Math.sin(respiroT * 2 * Math.PI / periodo); };
          var ampiezza = function (gradi, periodo) {
            return acceso ? THREE.MathUtils.degToRad(gradi) * onda(periodo) : 0;
          };
          busto.rotation.x = ampiezza(G.bustoX, T.bustoX);
          busto.rotation.z = ampiezza(G.bustoZ, T.bustoZ);
          var braccioZ = ampiezza(G.braccioZ, T.braccioZ), braccioX = ampiezza(G.braccioX, T.braccioX);
          braccia.forEach(function (b) {
            b.gruppo.rotation.z = b.verso * braccioZ;
            b.gruppo.rotation.x = braccioX;
          });
          // Terzo motivo per rifare la shadow map: il respiro ha spostato il
          // corpo abbastanza. Soglia più larga di quella della testa — vedi
          // RESPIRO.epsOmbra — perché questo movimento non si ferma mai.
          var ora4 = [busto.rotation.x, busto.rotation.z, braccioZ, braccioX];
          for (var q = 0; q < 4; q++) {
            if (!(Math.abs(ora4[q] - ombraRespiro[q]) < RESPIRO.epsOmbra)) {
              ombraRespiro = ora4;
              renderer.shadowMap.needsUpdate = true;
              break;
            }
          }
        }
        // Task 7 (nit) + Task B1: UN SOLO setFromCamera per fotogramma quando
        // il puntatore è attivo. Lo stesso raggio serve a tre cose — la mira
        // della testa (subito sotto), il reveal testa/pancia e il surge delle
        // fibre (più avanti): stesso NDC (pointer.x/y rispetto allo stage, con
        // il flip di segno su y della convenzione NDC di three), stessa camera
        // che renderizza lo stage. Sta QUI e non più in mezzo al loop perché
        // ora anche la testa ne ha bisogno, e la testa si muove per prima.
        if (pointer.active) {
          lensNdc.set(pointer.x, -pointer.y);
          raycaster.setFromCamera(lensNdc, cam);
        }
        // Task 4: la testa segue il cursore (clampata, smorzata). Task 5b
        // (correzione utente): questo resta INDIPENDENTE dal reveal — la
        // testa gira dietro al cursore anche da visore chiuso. faceAmount
        // resta calcolato (diagnostica dell'harness) ma non pilota più
        // nulla del vetro/brain.
        //
        // Task B1: non più due guadagni sul rettangolo dello stage, ma una
        // mira vera. Il puntatore diventa un punto del mondo (il raggio della
        // camera posato su `aimPlane`) e la testa gira per guardarlo.
        if (robot && robot.headGroup && robot.state) {
          var targetYaw = 0, targetPitch = 0;
          if (pointer.active) {
            if (aimPlane && raycaster.ray.intersectPlane(aimPlane, vAim)) {
              // L'occhio NON sta fermo: la testa gira attorno al COLLO, quindi
              // il centro della testa si sposta con la rotazione. Si parte
              // dall'occhio di ADESSO (la posa del fotogramma precedente): è
              // un punto fisso che converge, e a regime lo sguardo passa
              // esattamente per il bersaglio. Partendo sempre dall'occhio a
              // riposo la mira sbaglierebbe di una ventina di pixel proprio
              // dove la testa è più girata.
              robot.headGroup.updateWorldMatrix(true, false);
              vEye.copy(aimEyeLocal).applyMatrix4(robot.headGroup.matrixWorld);
              // Direzione occhio→bersaglio nel frame del PARENT di headGroup:
              // è il frame in cui vivono headGroup.rotation.x/.y. A riposo la
              // testa guarda lungo il +Z di quel frame — verificato sulla
              // scena viva: il «davanti» del visore è (0,0,1) in mondo e il
              // parent è `model`, che non porta rotazione. Da lì le due
              // formule: yaw è la rotazione attorno a Y che porta +Z sul
              // bersaglio, pitch quella attorno a X (positivo = sguardo in
              // GIÙ, perché il +Z ruotato vale (sin y, −sin x·cos y, cos x·cos y)).
              mAim.copy(robot.headGroup.parent.matrixWorld).invert();
              vAim.sub(vEye).transformDirection(mAim);
              targetYaw = Math.atan2(vAim.x, vAim.z);
              targetPitch = Math.atan2(-vAim.y, Math.hypot(vAim.x, vAim.z));
              targetYaw = Math.max(-CONFIG.yawMax, Math.min(CONFIG.yawMax, targetYaw));
              targetPitch = Math.max(-CONFIG.pitchMax, Math.min(CONFIG.pitchMax, targetPitch));
            }
            robot.state.faceAmount = 1 - Math.min(1, Math.hypot(pointer.x, pointer.y));
          } else if (robot.hold) {
            // Override deterministico per l'harness (window.__robot.hold): posa
            // la testa (yaw/pitch) senza dover simulare un vero mousemove
            // sul canvas.
            targetYaw = robot.hold.yaw || 0;
            targetPitch = robot.hold.pitch || 0;
          }
          if (!pointer.active) {
            // hold e "nessun input" decadono faceAmount a 0 allo stesso modo
            // (diagnostica dell'harness: non pilota più vetro/brain).
            robot.state.faceAmount += (0 - robot.state.faceAmount) * 0.08;
          }
          robot.headGroup.rotation.y += (targetYaw - robot.headGroup.rotation.y) * 0.12;
          robot.headGroup.rotation.x += (targetPitch - robot.headGroup.rotation.x) * 0.12;
          // Primo motivo per rifare la shadow map: la testa ha girato
          // abbastanza dall'ultimo disegno. Scritto con una negazione così il
          // primo giro (shadowYaw = NaN, ogni confronto falso) la marca.
          if (!(Math.abs(robot.headGroup.rotation.y - shadowYaw) < SHADOW_EPS &&
                Math.abs(robot.headGroup.rotation.x - shadowPitch) < SHADOW_EPS)) {
            shadowYaw = robot.headGroup.rotation.y;
            shadowPitch = robot.headGroup.rotation.x;
            renderer.shadowMap.needsUpdate = true;
          }
        }
        // Il raggio del puntatore è già stato costruito una volta sola, prima
        // della mira della testa (vedi sopra): reveal e fibre lo riusano.
        // RITOCCO 2: raycast del cursore sulle mesh testa. Un hit su una
        // QUALSIASI mesh della testa alza il target a 1 (reveal a tutta
        // testa: visore trasparente, occhi a LED spenti, cervello in vista).
        // Nessun hit (cursore fuori dalla testa, o fuori dallo stage) →
        // target 0: il visore torna quello Spline e gli occhi si riaccendono.
        // Task A2: stesso raggio, anche sul SOLO torso, per il reveal della
        // pancia. UNA ZONA PER VOLTA, e vince la più VICINA alla camera — non
        // «la testa sempre»: all'altezza del collo il raggio può colpire sia un
        // pezzo della testa sia il petto, e va aperto quello che sta davanti.
        // intersectObjects/intersectObject tornano già ordinati per distanza.
        //
        // Task A3: le quattro distanze si misurano QUI, una volta sola, e le
        // riusano reveal, fibre ed etichette. La zona con l'etichetta accesa è
        // quella COLPITA IN QUESTO FOTOGRAMMA, non quella col segnale smorzato
        // più alto: le fibre decadono di 0,05 a fotogramma e terrebbero
        // «website creation» acceso per una quindicina di fotogrammi mentre il
        // puntatore è già sulla pancia. I valori smorzati restano, ma pilotano
        // solo il DISEGNO.
        //
        // Task D1 — la testa e il collo sono due insiemi di MESH disgiunti
        // (`parts.testaSola` e `parts.collo`, divisi per geometria al
        // montaggio), quindi ogni zona ha il suo raycast e non c'è nessuna
        // quota da confrontare: dove finisce il visore comincia il collo,
        // esattamente dove lo dice il GLB. Prima (Task C2) era una mesh sola
        // divisa per altezza, con l'isteresi a tenere fermo il confine.
        var dTesta = Infinity, dCollo = Infinity, dPancia = Infinity, dBrSx = Infinity, dBrDx = Infinity;
        if (pointer.active && robot && robot.parts) {
          if (robot.parts.testaSola && robot.parts.testaSola.length) {
            var hitHead = raycaster.intersectObjects(robot.parts.testaSola, false);
            if (hitHead.length) dTesta = hitHead[0].distance;
          }
          // `colloPresa` e non `collo`: la lamiera del collo PIÙ il collisore
          // invisibile attorno alla sfera (vedi SFERA_CONFIG.presa). Il
          // raycast di three colpisce anche le mesh con `visible = false`.
          if (robot.parts.colloPresa && robot.parts.colloPresa.length) {
            var hitCollo = raycaster.intersectObjects(robot.parts.colloPresa, false);
            if (hitCollo.length) dCollo = hitCollo[0].distance;
          }
          if (robot.parts.chest) {
            var hitBelly = raycaster.intersectObject(robot.parts.chest, false);
            if (hitBelly.length) dPancia = hitBelly[0].distance;
          }
          if (braccioSx && braccioSx.length) {
            var hitSx = raycaster.intersectObjects(braccioSx, false);
            if (hitSx.length) dBrSx = hitSx[0].distance;
          }
          if (braccioDx && braccioDx.length) {
            var hitDx = raycaster.intersectObjects(braccioDx, false);
            if (hitDx.length) dBrDx = hitDx[0].distance;
          }
        }
        // Task D1: testa e collo insieme sono il vecchio «cluster testa», e la
        // loro distanza minima è quella che gareggia con la pancia.
        var dHead = Math.min(dTesta, dCollo);
        var vicina = null, dVicina = Infinity;
        if (dTesta < dVicina) { dVicina = dTesta; vicina = 'testa'; }
        if (dCollo < dVicina) { dVicina = dCollo; vicina = 'collo'; }
        if (dPancia < dVicina) { dVicina = dPancia; vicina = 'pancia'; }
        if (dBrSx < dVicina) { dVicina = dBrSx; vicina = 'braccioSx'; }
        if (dBrDx < dVicina) { dVicina = dBrDx; vicina = 'braccioDx'; }
        // Il puntatore SULL'ETICHETTA (o il fuoco da tastiera sul suo link)
        // tiene viva la zona. Il braccio senza etichetta (`attiva: false`)
        // invece spegne tutto all'istante: è comunque «un'altra zona».
        var puntata = anat ? anat.puntata() : null;
        if (puntata) { zonaUltima = puntata; zonaScadenza = now + GRAZIA; zonaAttiva = puntata; }
        else if (vicina && anat && anat.attiva(vicina)) { zonaUltima = vicina; zonaScadenza = now + GRAZIA; zonaAttiva = vicina; }
        else if (vicina) { zonaUltima = null; zonaScadenza = 0; zonaAttiva = null; }
        else zonaAttiva = (zonaUltima && now < zonaScadenza) ? zonaUltima : null;

        // Task D1d — LA ZONA APERTA, che non è la zona con l'ETICHETTA accesa.
        // Nike, guardando la pagina: «quando esco dall'immagine di un prodotto
        // deve ripristinarsi la vista robot, non mostrare due cose insieme, il
        // puntatore scopre solo quando passa effettivamente sopra e nasconde
        // quando esce».
        //
        // Sono due domande diverse e prima avevano una risposta sola:
        //  - CHE ETICHETTA SI VEDE: `zonaAttiva`, con la grazia di 320 ms che
        //    serve al puntatore per attraversare il corridoio vuoto e arrivare
        //    sul testo. Quella resta com'era.
        //  - CHE COSA SI APRE SUL ROBOT: `zonaViva`, senza nessuna grazia. È
        //    la zona colpita ADESSO, o quella la cui etichetta ha il puntatore
        //    o il fuoco. Esci dalla zona e il vetro si richiude, anche se
        //    l'etichetta resta su ancora un momento per farsi raggiungere.
        // Ed è UNA SOLA per costruzione: prima i cinque segnali si alzavano
        // ognuno per conto suo leggendo le distanze, e nel passaggio da una
        // zona all'altra restavano accesi in due — il cervello e la sfera
        // insieme, che è proprio lo screenshot di Nike.
        var zonaViva = puntata || vicina;

        if (robot && robot.spline && robot.parts && robot.parts.head && robot.parts.head.length) {
          // Task D1d — i tre segnali del corpo escono tutti da `zonaViva`:
          // una zona sola può valere 1, le altre hanno per forza bersaglio 0.
          // La gara fra le distanze (quale zona il raggio colpisce per prima)
          // l'ha già fatta `vicina`, più sopra.
          hoverHead = verso(hoverHead, zonaViva === 'testa');
          hoverCollo = verso(hoverCollo, zonaViva === 'collo');
          hoverBelly = verso(hoverBelly, zonaViva === 'pancia');
          robot.spline.setReveal(hoverHead);
          robot.spline.setBellyReveal(hoverBelly);
          robot.spline.setApertura('collo', hoverCollo);
          // Task D1b — col collo acceso il petto smette di scrivere depth, se
          // no respinge la metà bassa della nuvola che gli sta dietro (vedi
          // setPettoScriveDepth). Va DOPO setBellyReveal, che la depth la
          // riscrive per conto suo. A collo spento torna alla regola della
          // pancia — depth scritta se il torso è chiuso — e il fotogramma a
          // riposo resta identico.
          // Le due soglie sono 0,01 e non «=== 0» per una ragione misurata:
          // hoverBelly è uno smorzamento esponenziale e a ZERO ESATTO non ci
          // arriva mai — `setBellyReveal` infatti lo aggancia a 0 sotto 0,01,
          // ma aggancia la SUA copia, non questa. Con «=== 0» il petto non
          // tornava più a scrivere depth nemmeno a riposo (beccato da
          // `pancia-reveal`, che controlla proprio quello stato).
          if (robot.spline.setPettoScriveDepth) {
            robot.spline.setPettoScriveDepth(hoverBelly < 0.01 && hoverCollo < 0.01);
          }
          // Secondo motivo: un reveal ha attraversato la soglia in cui i pezzi
          // che la zona copre smettono (o riprendono) a proiettare ombra.
          // Stessa condizione di fadeInside in robot-spline-materials.js — lo
          // snap agli estremi che fa lì (sotto 0.01 → 0, sopra 0.995 → 1) non
          // tocca il confronto con 0.5. Senza questo, l'ombra del visore
          // resterebbe stampata a terra a testa trasparente. Le due zone hanno
          // una bandierina ciascuna: passando dalla testa alla pancia possono
          // stare ENTRAMBE sopra 0.5 per qualche fotogramma, e una sola
          // bandierina si perderebbe il secondo cambio.
          var castNow = hoverHead <= 0.5, castBelly = hoverBelly <= 0.5;
          if (castNow !== shadowCast || castBelly !== shadowCastBelly) {
            shadowCast = castNow; shadowCastBelly = castBelly;
            renderer.shadowMap.needsUpdate = true;
          }
        }
        // RITOCCO 2: il brain si accende col reveal della testa. Task D1: e
        // torna a essere TUTTO il reveal della testa — il visore è di nuovo
        // una zona sola, e la sfera se n'è andata nel collo.
        // update() fa respirare i punti e pilota opacità/emissione con reveal
        // (0 = spento/invisibile — visore scuro, niente cervello in vista).
        if (robot && robot.brain) {
          robot.brain.update(dt, hoverHead);
          // Lo smorzamento esponenziale non arriva mai a 0 esatto: sotto la
          // soglia il cervello non viene proprio disegnato (decisione 5).
          robot.brain.points.visible = hoverHead > 0.01;
        }
        // Task D1: la sfera si accende col COLLO (era la zona bassa della
        // testa, Task C2; prima ancora la pancia, Task A2) — update scrive il
        // reveal in uAppear e riporta la camera in coordinate locali. La POSA
        // — giro lento e oscillazione — è quella della pagina di SABE
        // (SFERA_CONFIG.spin/tilt). Sotto la soglia non si disegna.
        if (robot && robot.orb) {
          orbTime += dt;
          // La posa PRIMA di update(): update legge la matrice mondo della
          // sfera per portarci dentro la camera (uCamLocal, da cui lo shader
          // ricava il foro sull'asse della camera). Al contrario userebbe la
          // posa del fotogramma prima.
          robot.orb.points.rotation.y = orbTime * SFERA_CONFIG.spin;
          robot.orb.points.rotation.x = Math.sin(orbTime * 0.1) * SFERA_CONFIG.tilt;
          robot.orb.update(dt, hoverCollo, cam);
          robot.orb.points.visible = hoverCollo > 0.01;
        }
        // Task C3 — il contenuto della pancia, quando ci sarà: si accende col
        // reveal del torso come il cervello col suo. Oggi non c'è (vedi
        // BELLY_CONFIG.contenuto) e questo blocco non gira.
        if (robot && robot.bellyContent) {
          if (robot.bellyContent.update) robot.bellyContent.update(dt, hoverBelly, cam);
          robot.bellyContent.object.visible = hoverBelly > 0.01;
        }
        // Task 6: raycast del cursore sulle mesh-braccio, un lato alla
        // volta — a differenza del reveal testa (una sola zona, la testa)
        // qui servono DUE segnali indipendenti, uno per braccio, così il
        // fascio che si accende è solo quello sotto il cursore. Salita
        // rapida (0.15/frame) quando il cursore è sopra, decadimento lento
        // (0.05/frame) quando se ne va — "la corrente si accende dove
        // passi" (copy §5) e si spegne morbida, non di scatto.
        if (robot && robot.fibers && robot.parts) {
          // Task A3: i due hit vengono dalle distanze già misurate sopra
          // (stesso raggio, stessi oggetti: `braccioSx`/`braccioDx` sono
          // `parts.armL`/`armR` riordinati per posizione A SCHERMO). Il
          // rimappaggio serve perché surgeL/surgeR appartengono ai gruppi,
          // non ai lati dello schermo.
          var sxEArmL = braccioSx === robot.parts.armL;
          // Task D1d: anche le braccia leggono `zonaViva` e non le distanze.
          // Prima salivano a 0,15 e scendevano a 0,05 per fotogramma — un
          // decadimento lento e voluto («si spegne morbida»), che però teneva
          // acceso un braccio mentre si apriva un'altra zona: due cose insieme.
          // Adesso chiudono alla stessa velocità di tutti (vedi `verso`), che
          // resta una discesa vista — 8 fotogrammi — non uno scatto.
          var vivaSx = zonaViva === 'braccioSx', vivaDx = zonaViva === 'braccioDx';
          surgeL = verso(surgeL, sxEArmL ? vivaSx : vivaDx);
          surgeR = verso(surgeR, sxEArmL ? vivaDx : vivaSx);
          robot.fibers.update(dt, surgeL, surgeR);
          // Task B2: lo STESSO segnale apre il braccio. Una manopola sola per
          // apertura, intensità e velocità della corrente — il braccio si apre
          // dove passi, come la testa, e dentro si vede scorrere la fibra.
          if (robot.spline && robot.spline.setApertura) {
            robot.spline.setApertura('armL', surgeL);
            robot.spline.setApertura('armR', surgeR);
          }
        }
        // Task 7: la luce che fa brillare la «A» insegue il puntatore. Gli
        // scostamenti sono già in unità mondo, proporzionati alla larghezza
        // della «A» (LOGO_CONFIG.lightSwing/lightDist): il riflesso resta
        // DENTRO il logo invece di scappare fuori dal petto. y invertita:
        // pointer.y cresce verso il basso, la y di vista verso l'alto.
        if (robot && robot.spline && robot.spline.logo) {
          var lg = robot.spline.logo;
          if (pointer.active) logoTarget.set(pointer.x, pointer.y); else logoTarget.set(lg.lightRest.x, lg.lightRest.y);
          logoNow.lerp(logoTarget, 0.12);
          logoLight.set(logoView.x + logoNow.x * lg.lightSwing, logoView.y - logoNow.y * lg.lightSwing, logoView.z + lg.lightDist);
          robot.spline.setLogoLight(logoLight);
        }
        // Task A3: gli agganci si proiettano con la camera e vanno all'overlay
        // insieme alla zona attiva. La testa è l'unica che si muove (gira col
        // collo): il suo aggancio vive in coordinate di headGroup e torna in
        // mondo qui, così l'etichetta le resta attaccata mentre segue il
        // cursore. `updateWorldMatrix(true, false)` e non `updateMatrixWorld`:
        // serve la matrice di headGroup, non quella delle sue 18 mesh figlie.
        if (anat) {
          var anc = {};
          if (robot && robot.headGroup && (ancoraTestaLoc || ancoraColloLoc)) {
            robot.headGroup.updateWorldMatrix(true, false);
            // Task C4 — POSA MEDIA, non posa istantanea, altrimenti le due
            // etichette della testa ballano da sole mentre il robot respira.
            // La matrice mondo della testa porta dentro il respiro in DUE
            // modi, e la prima versione di questo blocco ne toglieva uno solo
            // (misurato: restavano 2,6 px di oscillazione):
            //  - la POSIZIONE: il pivot del collo sta ~180 unità sopra la
            //    vita, e 0,8° di busto lo spostano di 2,5;
            //  - il ROLLIO: il busto si inclina di lato e la testa con lui,
            //    perché la mira corregge imbardata e beccheggio ma non il
            //    rollio (headGroup.rotation.z resta 0).
            // Il PUNTAMENTO invece il respiro non ce l'ha: la mira gira la
            // testa nel frame del busto proprio per cancellarlo — il «davanti»
            // della testa punta il cursore comunque. Quindi si ricompone: si
            // prende il davanti in mondo, se ne tengono solo imbardata e
            // beccheggio (rollio a zero) e si rimette la posizione a riposo.
            var mTesta = robot.headGroup.matrixWorld;
            if (mBustoFermo && pivotTestaFermo) {
              vFwdTesta.set(0, 0, 1).transformDirection(robot.headGroup.matrixWorld);
              eTestaFerma.set(Math.atan2(-vFwdTesta.y, Math.hypot(vFwdTesta.x, vFwdTesta.z)),
                Math.atan2(vFwdTesta.x, vFwdTesta.z), 0, 'YXZ');
              mTestaFerma.makeRotationFromEuler(eTestaFerma);
              if (scalaModello) mTestaFerma.scale(scalaModello);
              mTestaFerma.setPosition(pivotTestaFermo);
              mTesta = mTestaFerma;
            }
            if (ancoraTestaLoc) anc.testa = aSchermo(vAnc.copy(ancoraTestaLoc).applyMatrix4(mTesta));
            // Task D1: il collo è la seconda zona che gira con la testa — le
            // sue mesh sono figlie di headGroup come il visore — quindi il suo
            // aggancio passa per la stessa matrice «senza respiro».
            if (ancoraColloLoc) anc.collo = aSchermo(vAnc.copy(ancoraColloLoc).applyMatrix4(mTesta));
          }
          if (ancoraPancia) anc.pancia = aSchermo(ancoraPancia);
          if (ancoraBraccio) anc.braccioSx = aSchermo(ancoraBraccio);
          // `hitId` accanto ad `activeId`: la zona colpita GREZZA, senza
          // grazia e senza il tenere-in-vita dell'etichetta. La usano il clic
          // (vedi onUpStage) e il cursore a mano, che devono parlare della
          // posizione di adesso, non di quella di mezzo secondo fa.
          anat.update(zonaAttiva, anc, vicina);
          if (robot) robot.anatomia = { activeId: zonaAttiva, hitId: vicina, anchors: anc };
        }
        // Esposto per la verifica headless (`zone-esclusive`): i cinque
        // segnali di apertura, quelli veri, non quello che si intuisce dai
        // pixel. Il controllo chiede che UNO solo sia acceso e gli altri
        // ZERO ESATTO.
        if (robot) {
          robot.hover = { testa: hoverHead, collo: hoverCollo, pancia: hoverBelly, armL: surgeL, armR: surgeR };
        }
        renderer.render(scene, cam);
      })();
      } catch (e) {
        console.error(e);
        fail('Modello non caricato');
      }
    }, undefined, function(e){
      if (torn) return;
      // Rete, Draco o GLB rotto: senza log il perché resterebbe invisibile.
      console.error(e);
      fail('Modello non caricato');
    });

    window.addEventListener('resize', fit);
    cleanups.push(function(){ window.removeEventListener('resize', fit); });
    // PRIMA dello smaltimento qui sotto: si ferma il loop, poi si butta via
    // ciò su cui girava. All'incontrario il loop arrivava a fare un render in
    // più su geometrie e materiali già smaltiti.
    cleanups.push(function(){ cancelAnimationFrame(raf); });
    cleanups.push(function(){
      torn = true;
      draco.dispose();
      // Task 7: smaltimento GPU unificato. Se il GLB non è mai arrivato a
      // caricare (fail() nel ramo di errore di gltf.load, o teardown prima
      // che load() risolva) window.__robot resta undefined: non c'è nulla
      // da attraversare, solo renderer/canvas da smaltire sotto.
      var robot = window.__robot;
      if (robot) {
        disposeObject3D(robot.model);
        if (robot.brain && robot.brain.points) disposeObject3D(robot.brain.points);
        if (robot.orb && robot.orb.points) disposeObject3D(robot.orb.points);
        if (robot.bellyContent && robot.bellyContent.object) disposeObject3D(robot.bellyContent.object);
        // Task C4: i due gruppi delle fibre NON stanno più dentro
        // `fibers.object` (robot.js li appende ai gruppi-braccio del respiro),
        // quindi smaltire `object` non li toccherebbe. `disposeObject3D(model)`
        // qui sopra li coprirebbe comunque — sono suoi discendenti — ma la
        // regola di questo blocco è non fare affidamento sulla gerarchia.
        if (robot.fibers) {
          disposeObject3D(robot.fibers.object);
          if (robot.fibers.groups) {
            disposeObject3D(robot.fibers.groups.armL);
            disposeObject3D(robot.fibers.groups.armR);
          }
        }
      }
      // Materiali Spline: le texture nelle uniform (disposeObject3D non le
      // tocca) e il <video> degli occhi le smaltisce spline.dispose().
      if (robot && robot.spline) robot.spline.dispose();
      // La shadow map della point light è un render target a cubo srotolato
      // (4×2 facce da mapSize: 4096×2048 a 1024) che renderer.dispose() non libera.
      if (shadowLight) shadowLight.shadow.dispose();
      renderer.dispose();
      if (renderer.domElement.parentNode) renderer.domElement.parentNode.removeChild(renderer.domElement);
      if (window.__robot && window.__robot.renderer === renderer) window.__robot = undefined;
    });
  }

  // Task A3: se la scena non partirà mai, i tre link vanno montati SUBITO e
  // non quando la sezione si avvicina. Chi naviga col tab dall'inizio della
  // pagina passa dal capitolo prima che un IntersectionObserver abbia avuto
  // motivo di scattare: aspettarlo vorrebbe dire far comparire i link DIETRO
  // il punto in cui il fuoco è già arrivato.
  if (scenaImpossibile()) montaAnatomia(null);

  // Monta con un margine di una schermata: il modello è già in piedi quando
  // la sezione entra, invece di comparire sotto gli occhi di chi guarda.
  if ('IntersectionObserver' in window) {
    var io = new IntersectionObserver(function(entries){
      if (entries.some(function(e){ return e.isIntersecting; })) { mount(); io.disconnect(); }
    }, { rootMargin: '100% 0px' });
    io.observe(section);
    cleanups.push(function(){ io.disconnect(); });
  } else {
    mount();
  }

  return function(){ cleanups.forEach(function(f){ f(); }); };
});
