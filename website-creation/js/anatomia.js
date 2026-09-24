/* CAP 05 — ETICHETTE ANATOMICHE (Task A3).
 *
 * Passando sopra una zona del robot esce una linea spezzata — prima obliqua,
 * poi orizzontale — con due voci: quella grande sopra il filo («cervello»,
 * «anima», «website creation») e quella piccola sotto («Atlas», «sabe»,
 * «atelier»). Il clic porta alla sezione: la zona 3D è cliccabile (lo fa
 * robot.js, che ha già il raycast) e l'etichetta è anche un LINK vero, così
 * chi non usa il mouse ci arriva col tab e uno screen reader la legge.
 *
 * Tutto DOM sopra il canvas: un <svg> per la linea e un <a> per il testo,
 * nessun costo GPU. robot.js proietta i punti d'aggancio con la camera e li
 * passa a `update(activeId, anchors)` in coordinate del riquadro; qui si
 * decide solo quanto è lunga la linea e dove va il testo.
 *
 * LA LUNGHEZZA NON È UN NUMERO FISSO. «C'è spazio quindi sfruttalo, non fare
 * linee corte altrimenti sembra tutto troppo denso» (Nike): l'obiettivo è
 * 0,27 della larghezza, ma a sinistra il braccio ha il bordo esterno attorno a
 * x 415 su 1440 e con 389 px di corsa il testo «website creation» finirebbe
 * fuori dallo schermo. Quindi la corsa si CALCOLA sullo spazio che c'è
 * davvero da quel lato, meno il testo, lo stacco e il margine, e non scende
 * mai sotto 0,12 della larghezza. Il salto dall'altro lato resta solo per il
 * caso in cui nemmeno il minimo ci stia.
 *
 * Spec: docs/superpowers/specs/2026-09-20-robot-anatomia-design.md §4.
 */
window.WC = window.WC || {};
WC.anatomia = (function () {
  'use strict';

  // ------------------------------------------------------------------ CONFIG
  // Una riga per zona: da qui si cambia testo, lato e destinazione senza
  // toccare il resto. Il braccio di destra c'è ma è `attiva: false` — resta
  // pronto e vuoto, come ha chiesto Nike.
  //
  // `CORRENTE#cap01`: la pagina ha <base href="/website-creation/">, quindi un
  // href di solo frammento («#cap01») punterebbe a un'ALTRA url e ricaricherebbe
  // la pagina (in produzione vercel.json ha cleanUrls, che ci aggiunge pure un
  // 308). L'href vero si scrive a runtime come location.pathname + '#cap01', e
  // il clic fa preventDefault + scroll morbido: lo scroll nativo andrebbe
  // contro Lenis, che quella pagina la muove lui.
  // Task D1 — la testa e il COLLO: sul visore il cervello (Atlas), nel collo
  // — fra il mento e il logo — la sfera di SABE. Sono due voci distinte
  // perché sono due prodotti distinti, e adesso anche due gruppi di MESH
  // distinti: a dividerle non è più una quota dentro il visore (Task C2) ma la
  // geometria del GLB, in robot.js.
  // Task C3 — `href: ''` NON vuol dire «zona spenta». La pancia è una zona a
  // tutti gli effetti (il torso si apre, l'etichetta «anima / gestionale»
  // esce) ma non porta da nessuna parte: la pagina del gestionale la sta
  // scrivendo Alex (Nike, 09:21: «alex sta creando la pagina quindi per ora
  // lascialo vuoto»). Finché quella riga è vuota l'etichetta NON è un
  // `<a href>` ma uno `<span>`: non prende il fuoco col tab, il clic non fa
  // niente e il cursore non diventa una mano — non si promette un link morto.
  // Il giorno in cui la pagina c'è, si scrive l'indirizzo QUI e basta: zona
  // cliccabile, etichetta linkabile e tastiera tornano da sole (provato con
  // un indirizzo finto, vedi il report C3).
  // Task D6 — le frasi che correvano SULLA linea orizzontale («il tuo agente
  // telefonico», «il tuo nuovo sito») sono state tolte: Nike, «togli tutte le
  // scritte sopra le linee orizzontali». La linea torna a essere un filo e
  // basta, e quel che resta e' il nome del prodotto col suo sottotitolo.
  //
  // Task D6 — e i due righi si SCAMBIANO: `nome` (il prodotto: ATLAS, SABE,
  // GESTIONALE, ATELIER) sta SOPRA il filo ed e' il rigo grande; `descrizione`
  // (cervello, agente vocale, anima, website creation) sta sotto ed e' il
  // piccolo. Prima era il contrario. Le due colonne qui sono nominate per
  // QUELLO CHE SONO, non per dove finiscono: se un giorno si riscambiano,
  // cambia l'ordine nel DOM e non il significato dei campi.
  var ZONE = [
    { id: 'testa',     lato: 'destra',   nome: 'Atlas',      descrizione: 'cervello',         href: '../atlas.html',  attiva: true },
    { id: 'collo',     lato: 'destra',   nome: 'SABE',       descrizione: 'Agente Vocale',    href: '../sabe.html',   attiva: true },
    { id: 'pancia',    lato: 'destra',   nome: 'gestionale', descrizione: 'anima',            href: '',               attiva: true },
    { id: 'braccioSx', lato: 'sinistra', nome: 'atelier',    descrizione: 'website creation', href: 'CORRENTE#cap01', attiva: true },
    { id: 'braccioDx', lato: 'destra',   nome: '',           descrizione: '',                 href: '',               attiva: false }
  ];
  // Misure in frazione della LARGHEZZA del riquadro (così valgono a ogni
  // dimensione), tranne `margineBordo` (px) e `staccoTesto` (altezze di riga).
  // `obliquoFrazione` non è nella specifica: la specifica dà l'ANGOLO del
  // tratto obliquo ma non la sua lunghezza, e una lunghezza serve. Legarla
  // alla corsa orizzontale tiene la FORMA dell'etichetta identica a ogni
  // dimensione e su ogni zona — un valore in pixel, invece, farebbe un gomito
  // grande su una linea corta e un gomito minuscolo su una lunga.
  // Task C1 — `obliquoFrazione` da 0,42 a 0,22. Non è un ritocco estetico: il
  // robot è più grande (INQUADRATURA in robot.js) e i punti d'aggancio si
  // sono spostati verso i bordi, quindi lo spazio orizzontale per le
  // etichette è calato. Il tratto obliquo COSTA orizzontale: l'intera
  // spezzata occupa corsa · (1 + obliquoFrazione · cos 38°), cioè 1,33 corse
  // a 0,42 e 1,17 a 0,22. Misurato a 1440×900 con la nuova inquadratura: a
  // 0,42 il braccio di sinistra non ha più la corsa minima (0,12 W) dal suo
  // lato e l'etichetta salterebbe a DESTRA, attraversando tutto il corpo; a
  // 0,22 resta dal lato giusto con ~22 px di margine, e la stessa riduzione
  // ridà a «anima» la corsa lunga (≥ 0,25 W) che l'ingrandimento le aveva
  // tolto. Il gomito resta un gomito: a corsa 390 sono 86 px di obliquo che
  // salgono di 53, non un angolo appena accennato.
  // Task D5 — le linee si ACCORCIANO (Nike: «le linee orizzontali vanno
  // accorciate») e il testo cresce (vedi sections.css). Obiettivo da 0,27 a
  // 0,16 della larghezza, minimo da 0,12 a 0,085. Il minimo serve solo da
  // paracadute sui riquadri stretti.
  var LINEA = { orizzontaleObiettivo: 0.16, orizzontaleMinimo: 0.085, obliquoGradi: 38,
    staccoTesto: 0.5, margineBordo: 24, obliquoFrazione: 0.22 };
  // ---- AGGANCI SENZA SCENA ----
  // Con reduced-motion robot.js non monta niente: non c'è camera, non c'è GLB,
  // e gli agganci se li deve dare l'overlay. Non sono però una tabella di
  // pixel tarata su una misura sola — sono la FORMULA della proiezione vera,
  // scritta per esteso.
  //
  // La camera Spline non si muove mai e ha il campo VERTICALE fisso
  // (robot.js: fov e zoom da WC.robotSplineData, `fit()` tocca solo l'aspect).
  // Per una camera così la proiezione di un punto fermo del mondo vale
  //   x_ndc = k / aspect,   y_ndc = costante
  // e il passaggio a pixel è x = W/2 · (1 + x_ndc), y = H/2 · (1 − y_ndc).
  // Sostituendo aspect = W/H, la larghezza si semplifica:
  //   x = W/2 + (k/2)·H        y = H/2 − (y_ndc/2)·H
  // cioè: SEMPRE al centro in orizzontale, e lo scostamento — in tutte e due
  // le direzioni — proporzionale alla sola ALTEZZA del riquadro. I due numeri
  // per zona qui sotto sono quegli scostamenti per unità di altezza, ricavati
  // dagli agganci veri letti a 1440×900. Non è un'approssimazione: rifatto il
  // conto a 1280×720 contro gli agganci veri della scena montata, lo scarto è
  // sotto il decimo di pixel su tutte e tre le zone.
  // (Con delle frazioni della LARGHEZZA — che è la cosa ovvia da scrivere e
  // sbagliata — a 1280×720 il braccio finiva 30 px più a sinistra e spingeva
  // «website creation» contro il bordo.)
  // L'unica cosa che questa formula non riproduce è il `setViewOffset` che
  // `fit()` applica sui riquadri bassi per non far uscire la testa dalla nav:
  // qui non c'è nessuna testa da tenere dentro.
  //
  // Task C1 — la nuova inquadratura (INQUADRATURA in robot.js) è un RITAGLIO
  // della stessa camera: `pixel = m · pixel_senza_ritaglio − offset`, con m
  // costante e l'offset proporzionale all'altezza del riquadro (l'ingrandimento
  // non dipende dalla sua misura, vedi fit()). Sostituendolo nella formula qui
  // sopra la FORMA non cambia — sempre «centro in orizzontale più uno
  // scostamento proporzionale alla sola ALTEZZA» — cambiano solo i sei numeri.
  // Rimisurati sulla scena viva a 1440×900 e ricontrollati a 1280×720: le due
  // letture danno le stesse cinque cifre decimali. La regola `minHeadTopPx`
  // non scatta a nessuna delle due misure (cima della testa a 111 px e a
  // 89 px), quindi non c'è nemmeno più lo scarto che il commento qui sopra
  // segnalava come unico limite.
  // Task C2 — quattro agganci: il cervello nella calotta e la sfera di SABE.
  // Task D1 — la sfera è scesa nel COLLO, quindi il suo aggancio è sceso con
  // lei ed è stato rimisurato sulla scena viva (il bordo esterno del bbox
  // delle mesh del collo, all'altezza del centro della sfera). Gli altri tre
  // non sono cambiati, ma sono stati riletti lo stesso: erano gli stessi fino
  // alla quinta cifra.
  var FISSI = {
    testa:     [ 0.11252, -0.32044 ],
    collo:     [ 0.09509, -0.09856 ],
    pancia:    [ 0.18251,  0.12092 ],
    braccioSx: [-0.39432,  0.16901 ]
  };
  // Quanto si allarga il rettangolo dell'etichetta per decidere «il puntatore
  // è sull'etichetta». La linea SVG è pointer-events:none, quindi il corridoio
  // fra modello ed etichetta non lo copre nessuno: questo lo allarga un po'.
  var ALONE = 14;
  // Per quanto tempo, dopo che una zona si è spenta, il puntatore che arriva
  // sulla SUA etichetta la riaccende. Serve perché fra il modello e il testo
  // ci sono 400÷500 px di vuoto: il puntatore li attraversa senza colpire
  // niente, la zona si spegne a metà strada e — senza questa finestra — il
  // link non sarebbe più raggiungibile col mouse, solo col tab. Misurato: un
  // gesto normale su quella distanza sta sotto il mezzo secondo.
  var RIPRESA = 1200;

  var SVGNS = 'http://www.w3.org/2000/svg';

  // Task D8 — LA SOGLIA DEL TELEFONO, in un posto solo. Sotto questa larghezza
  // le etichette con la linea non ci stanno (a 390 px «GESTIONALE» da solo ne
  // misura 145) e al loro posto comanda la SCALETTA in alto a destra. Chi deve
  // saperlo lo chiede qui: il CSS ha la stessa misura scritta nella sua media
  // query, robot.js la usa per non navigare al tocco sul corpo.
  var STRETTO = 760;
  function stretto() {
    return !!(window.matchMedia && window.matchMedia('(max-width: ' + STRETTO + 'px)').matches);
  }

  function perId(id) {
    for (var i = 0; i < ZONE.length; i++) if (ZONE[i].id === id) return ZONE[i];
    return null;
  }

  // Task C3 — una zona ha una DESTINAZIONE solo se è attiva e ha un indirizzo.
  // È l'unico posto in cui si decide, e da qui dipendono tutte le promesse che
  // l'interfaccia fa: il tipo dell'elemento (<a> o <span>), il fuoco da
  // tastiera, il cursore a mano e il clic sulla zona 3D.
  function conDestinazione(z) { return !!(z && z.attiva && z.href); }

  // L'href di «CORRENTE#frammento» dipende dalla url di adesso: <base> in
  // pagina rende «#cap01» da solo un link a un'altra risorsa.
  function hrefVero(z) {
    if (z.href.indexOf('CORRENTE') !== 0) return z.href;
    return location.pathname + location.search + z.href.slice('CORRENTE'.length);
  }

  function ridotto() {
    return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  }

  // Scroll morbido dentro la stessa pagina. Lenis muove lo scroll del sito
  // (core.js): uno `scrollTo` nativo in contemporanea gli va contro e la
  // pagina rimbalza. Con reduced-motion Lenis non esiste e si salta e basta.
  function scorriA(frammento) {
    var t = document.getElementById(frammento);
    if (!t) return;
    var y = Math.round(window.scrollY + t.getBoundingClientRect().top);
    if (window.WC && WC.lenis) { WC.lenis.scrollTo(y); return; }
    if (ridotto()) { window.scrollTo(0, y); return; }
    window.scrollTo({ top: y, behavior: 'smooth' });
  }

  // ------------------------------------------------------------------ MOUNT
  // `stage` serve solo per il cursore a mano; `host` è il riquadro su cui si
  // appoggia l'overlay (.wc-robot-card: stesso rettangolo dello stage, ma il
  // layer ci sta accanto a z-index 2 invece che dentro, così un clic
  // sull'etichetta non finisce anche nel pointerup dello stage).
  // `camera` è il segnale «c'è una scena»: robot.js proietta gli agganci e
  // chiama update(); quando è null l'overlay si monta FERMO, con gli agganci
  // fissi di FISSI — altrimenti in quella sezione non esisterebbe nessun
  // collegamento ad Atlas/SABE/Atelier.
  function mount(opts) {
    opts = opts || {};
    var stage = opts.stage;
    var host = opts.host || (stage && stage.parentNode);
    var zones = opts.zones || ZONE;
    var statico = !opts.camera;
    if (!host) return null;

    var layer = document.createElement('div');
    layer.className = 'wc-anat-layer' + (statico ? ' -statico' : '');
    layer.id = 'wcAnatLayer';

    var el = {};       // id → { zona, wrap, svg, linea, a, voce, box, misure }
    zones.forEach(function (z) {
      if (!z.attiva) return;
      var wrap = document.createElement('div');
      wrap.className = 'wc-anat-zona';
      wrap.setAttribute('data-zona', z.id);

      var svg = document.createElementNS(SVGNS, 'svg');
      svg.setAttribute('class', 'wc-anat-svg');
      svg.setAttribute('aria-hidden', 'true');
      svg.setAttribute('focusable', 'false');
      var linea = document.createElementNS(SVGNS, 'polyline');
      svg.appendChild(linea);

      // Task C3: `<a>` solo se c'è dove andare. Senza indirizzo è uno `<span>`
      // — niente tab, niente Invio, niente aria-label che annuncerebbe un link
      // che non esiste. Il resto (classe, data-zona, testi, posizionamento) è
      // identico, così tutto il codice che cerca `.wc-anat` continua a
      // trovarlo e il giorno in cui l'indirizzo arriva non cambia nient'altro.
      var link = conDestinazione(z);
      var a = document.createElement(link ? 'a' : 'span');
      a.className = 'wc-anat' + (z.lato === 'sinistra' ? ' -sinistra' : ' -destra');
      a.setAttribute('data-zona', z.id);
      if (link) {
        a.href = hrefVero(z);
        a.setAttribute('aria-label', z.nome + ' — ' + z.descrizione);
      }
      // Task D6 — l'ordine nel DOM E' la posizione rispetto al filo: il primo
      // figlio sta SOPRA la linea, il secondo sotto (la geometria misura
      // l'altezza del primo e ci fa passare il filo). Quindi il NOME del
      // prodotto per primo.
      var nome = document.createElement('span');
      nome.className = 'wc-anat-nome';
      nome.textContent = z.nome;
      var descr = document.createElement('span');
      descr.className = 'wc-anat-descrizione';
      descr.textContent = z.descrizione;
      a.appendChild(nome);
      a.appendChild(descr);

      wrap.appendChild(svg);
      wrap.appendChild(a);
      layer.appendChild(wrap);
      el[z.id] = { z: z, wrap: wrap, svg: svg, linea: linea, a: a, sopraEl: nome,
        box: null, m: { w: 0, hVoce: 0, hTot: 0, riga: 0 }, scritto: '' };
    });
    host.appendChild(layer);

    // ------------------------------------------------------ Task D8: LA SCALETTA
    // Sul telefono le etichette con la linea non ci stanno, e soprattutto non
    // si accendono: escono col passaggio del mouse, che su un touch non
    // esiste — la sezione resterebbe muta, senza un solo nome di prodotto.
    // Al loro posto una scaletta in alto a destra, SEMPRE accesa: gli stessi
    // quattro nomi, la stessa gerarchia (nome sopra, descrizione sotto), gli
    // stessi indirizzi.
    //
    // Si costruisce SEMPRE, su ogni misura, e a decidere quale delle due
    // rappresentazioni si vede e' il CSS (una media query sola, la stessa
    // misura di STRETTO). Cosi' girare il telefono o trascinare la finestra
    // non deve rimontare niente: non c'e' nessuno stato da tenere in sincrono,
    // e quel che il JS scrive — linee, posizioni — su schermo stretto
    // semplicemente non si vede.
    // Un `div` con `role="navigation"`, non un `<nav>`: in base.css il
    // selettore di elemento `nav` e' la BARRA del sito (position:fixed,
    // top:0, altezza --nav-h) e vincerebbe sul posizionamento di questa —
    // beccato dal vivo, la scaletta finiva incollata in cima allo schermo.
    // Per chi usa uno screen reader il ruolo e' lo stesso.
    var scaletta = document.createElement('div');
    scaletta.className = 'wc-anat-scaletta';
    scaletta.setAttribute('role', 'navigation');
    scaletta.setAttribute('aria-label', 'I prodotti Axxell');
    zones.forEach(function (z) {
      if (!z.attiva) return;
      var link = conDestinazione(z);
      var riga = document.createElement(link ? 'a' : 'span');
      riga.className = 'wc-anat-riga';
      riga.setAttribute('data-zona', z.id);
      if (link) riga.href = hrefVero(z);
      var n = document.createElement('span');
      n.className = 'wc-anat-nome';
      n.textContent = z.nome;
      var d = document.createElement('span');
      d.className = 'wc-anat-descrizione';
      d.textContent = z.descrizione;
      riga.appendChild(n);
      riga.appendChild(d);
      scaletta.appendChild(riga);
    });
    // Il clic sulla scaletta segue la stessa strada del clic sull'etichetta:
    // «CORRENTE#...» resta in pagina e scorre (Lenis), il resto lo fa il
    // browser.
    host.appendChild(scaletta);

    // ---------------------------------------- Task D12: IL TRATTO DEL TOCCO
    // Sul telefono la scaletta e' un elenco di nomi e basta: non dice DOVE
    // stanno le cose. Al tocco parte una linea spezzata dalla voce fino al
    // punto del corpo, e quel pezzo di robot si apre — il cervello nella
    // testa, la sfera in pancia, la corrente nel braccio. Nel frattempo la
    // pagina di destinazione si sta gia' caricando (vedi `vaiDopo`), cosi'
    // l'attesa non e' tempo perso: e' il tempo in cui si vede la cosa.
    var tratto = document.createElementNS(SVGNS, 'svg');
    tratto.setAttribute('class', 'wc-anat-tratto');
    tratto.setAttribute('aria-hidden', 'true');
    tratto.setAttribute('focusable', 'false');
    var trattoLinea = document.createElementNS(SVGNS, 'polyline');
    tratto.appendChild(trattoLinea);
    host.appendChild(tratto);
    var forzata = null;        // la zona che il tocco tiene accesa
    var forzataRiga = null;    // la voce toccata (da cui parte la linea)
    var inverso = false;       // la linea parte dal CORPO e va alla voce (tocco sul robot)
    var timerVai = null, timerSpegni = null;
    // Task D14 — il disegno progressivo lo fa il JS, non una transizione CSS.
    // In CSS la corda (`--corda`) e' il punto di partenza dello
    // `stroke-dashoffset`, e qui la corda CAMBIA a ogni fotogramma: l'aggancio
    // si muove col respiro e con la testa che punta. Cambiare il valore di
    // partenza mentre la transizione corre la fa saltare alla fine — ed e'
    // esattamente quello che si vedeva: la linea dell'atelier (aggancio fermo,
    // corda costante) si disegnava, le altre comparivano gia' fatte. Con la
    // frazione calcolata sul tempo il disegno dura sempre `DISEGNO`, che la
    // corda cambi o no.
    var DISEGNO = 520;
    var trattoDa = 0;

    var ancore = {};          // id → {x, y} in px del riquadro
    var attivo = null;        // ultima zona passata da update()
    var ultimo = null;        // l'ultima che è stata accesa, e quando si è spenta
    var spentoA = 0;
    var sopra = null;         // zona il cui rettangolo-etichetta ha il puntatore
    var fuoco = null;         // zona il cui link ha il fuoco
    var mano = false;         // il puntatore è sopra una zona cliccabile ADESSO
    // Misura del riquadro, in cache. `rifai()` gira dentro il loop di
    // rendering: leggere clientWidth/clientHeight lì vorrebbe dire chiedere al
    // browser un layout sessanta volte al secondo per un numero che cambia solo
    // quando la finestra cambia. Chi la aggiorna è il ResizeObserver qui sotto
    // — che, a differenza di `window.resize`, vede anche i cambi di misura del
    // riquadro che la finestra non ha causato.
    var lar = 0, alt = 0, vbScritto = '';
    function ora() { return (window.performance && performance.now) ? performance.now() : Date.now(); }
    function misuraRiquadro() {
      var w = host.clientWidth, h = host.clientHeight;
      if (w === lar && h === alt) return false;
      lar = w; alt = h;
      return true;
    }

    // ------------------------------------------------------------- misure
    // Larghezza e altezze del testo: si leggono UNA VOLTA (e dopo il carico
    // dei font), non a ogni fotogramma — offsetWidth dentro il loop di
    // rendering forzerebbe un reflow per etichetta per frame.
    function misura() {
      Object.keys(el).forEach(function (id) {
        var e = el[id];
        e.m.w = e.a.offsetWidth;
        // `hVoce` = l'altezza del rigo che sta SOPRA il filo, qualunque sia
        // (Task D6: adesso e' il nome del prodotto).
        e.m.hVoce = e.sopraEl.offsetHeight;
        e.m.hTot = e.a.offsetHeight;
        e.m.riga = e.m.hVoce || 18;
      });
      rifai(true);
    }

    // --------------------------------------------------------- geometria
    var RAD = LINEA.obliquoGradi * Math.PI / 180;
    var KX = 1 + LINEA.obliquoFrazione * Math.cos(RAD);   // quanto orizzontale costa l'intera spezzata, in unità di corsa

    // Quanta corsa orizzontale ci sta da un lato. `dir` +1 = verso destra.
    function corsaDa(dir, ax, testoW, stacco) {
      var spazio = dir > 0 ? (lar - ax) : ax;
      var budget = spazio - testoW - stacco - LINEA.margineBordo;
      var ideale = Math.min(LINEA.orizzontaleObiettivo * lar, budget / KX);
      var minimo = LINEA.orizzontaleMinimo * lar;
      // «Ci sta» = il minimo entra nel riquadro, anche mangiandosi il margine.
      var ci_sta = (minimo * KX + testoW + stacco) <= spazio;
      return { corsa: Math.max(ideale, minimo), ci_sta: ci_sta };
    }

    function geometria(e) {
      var an = ancore[e.z.id];
      if (!an || !lar || !alt) return null;
      var stacco = LINEA.staccoTesto * e.m.riga;
      var dir = e.z.lato === 'sinistra' ? -1 : 1;
      var q = corsaDa(dir, an.x, e.m.w, stacco);
      if (!q.ci_sta) {
        // Nemmeno il minimo ci sta: si prova l'altro lato. Se non ci sta
        // nemmeno là si resta dove si era — il lato ESTERNO della zona, mai
        // attraverso il corpo — e il testo si aggrappa al bordo.
        var altroLato = corsaDa(-dir, an.x, e.m.w, stacco);
        if (altroLato.ci_sta) { dir = -dir; q = altroLato; }
      }
      var corsa = q.corsa;
      var obl = corsa * LINEA.obliquoFrazione;
      var gx = an.x + dir * obl * Math.cos(RAD);
      var gy = an.y - obl * Math.sin(RAD);       // la spezzata sale sempre: il testo sta in alto, fuori dal corpo
      var fx = gx + dir * corsa;
      // Il filo passa FRA le due voci: la grande sopra, la piccola sotto.
      // Su un riquadro basso il gomito si abbassa finché il testo ci sta: è
      // l'unico caso in cui l'angolo non è più esattamente `obliquoGradi`.
      var sopraTesto = e.m.hVoce, sottoTesto = e.m.hTot - e.m.hVoce;
      gy = Math.max(LINEA.margineBordo + sopraTesto, Math.min(alt - LINEA.margineBordo - sottoTesto, gy));
      var tx = dir > 0 ? fx + stacco : fx - stacco - e.m.w;
      tx = Math.max(0, Math.min(lar - e.m.w, tx));
      return { dir: dir, corsa: corsa, ax: an.x, ay: an.y, gx: gx, gy: gy, fx: fx,
        tx: tx, ty: gy - sopraTesto };
    }

    function n2(v) { return Math.round(v * 100) / 100; }

    function rifai(forza) {
      if (!lar || !alt) return;
      // Il viewBox segue il riquadro, quindi cambia solo quando cambia lui:
      // riscriverlo a ogni fotogramma sarebbe un attributo SVG toccato per
      // niente sessanta volte al secondo.
      var vb = '0 0 ' + lar + ' ' + alt;
      if (vb !== vbScritto) {
        vbScritto = vb; forza = true;
        Object.keys(el).forEach(function (id) { el[id].svg.setAttribute('viewBox', vb); });
      }
      Object.keys(el).forEach(function (id) {
        var e = el[id];
        var g = geometria(e);
        // Niente aggancio: la linea sparisce e la chiave si azzera, così
        // quando l'aggancio torna — magari identico a prima — il confronto
        // qui sotto non scambia «uguale all'ultima volta» per «già scritto» e
        // lascia la polyline vuota.
        if (!g) { if (e.box || e.scritto) { e.box = null; e.scritto = ''; e.linea.setAttribute('points', ''); } return; }
        var chiave = [g.ax, g.ay, g.gx, g.gy, g.fx, g.tx, g.ty].map(n2).join(' ');
        if (!forza && chiave === e.scritto) return;
        e.scritto = chiave;
        e.linea.setAttribute('points', n2(g.ax) + ',' + n2(g.ay) + ' ' + n2(g.gx) + ',' + n2(g.gy) + ' ' + n2(g.fx) + ',' + n2(g.gy));
        // La corda serve al disegno progressivo (stroke-dashoffset in CSS).
        var lung = Math.hypot(g.gx - g.ax, g.gy - g.ay) + Math.abs(g.fx - g.gx);
        e.linea.style.strokeDasharray = n2(lung);
        e.linea.style.setProperty('--corda', n2(lung));
        e.a.style.left = n2(g.tx) + 'px';
        e.a.style.top = n2(g.ty) + 'px';
        e.box = { x: g.tx, y: g.ty, w: e.m.w, h: e.m.hTot };
      });
      disegnaTratto();
    }

    // La spezzata del tocco: giu' dalla voce, poi in diagonale fino al punto
    // del corpo. Si ridisegna a ogni fotogramma insieme al resto — l'aggancio
    // e' quello vero, proiettato da robot.js, quindi la linea resta attaccata
    // al pezzo anche mentre il torso respira.
    function disegnaTratto() {
      if (!forzata || !forzataRiga || !ancore[forzata]) { trattoLinea.setAttribute('points', ''); return; }
      var r = forzataRiga.getBoundingClientRect(), rh = host.getBoundingClientRect();
      var x0 = r.left - rh.left + r.width / 2, y0 = r.bottom - rh.top + 6;
      var a = ancore[forzata];
      // ---- IL PERCORSO (Task D13, disegnato da Nike) ----
      // Solo angoli retti, mai una diagonale, e mai attraverso il robot:
      //   giu' dalla voce  →  (se serve) di lato fino a una corsia libera  →
      //   giu' fino alla quota del pezzo  →  dentro, in orizzontale.
      // L'ultimo tratto entra DAL LATO DELLA VOCE: una voce a sinistra entra da
      // sinistra. L'aggancio che robot.js proietta sta sempre sul fianco
      // destro (e' quello che serve alle etichette del pc); quando la voce sta
      // dall'altra parte lo si specchia attorno all'asse del corpo, che arriva
      // nella stessa mappa (`__corpo`).
      var corpo = ancore.__corpo || { x: lar / 2, y: lar * 0.25 };
      // `corpo.y` e' la mezza larghezza con le BRACCIA; la colonna centrale —
      // testa, collo, torso — e' piu' stretta, ed e' quella che la linea non
      // deve attraversare. Fra il torso e il braccio c'e' un vuoto, e la
      // corsia ci passa dentro: e' quello che Nike ha disegnato.
      var colonna = corpo.y * 0.42;
      var scarto = a.x - corpo.x;
      var laterale = Math.abs(scarto) > corpo.y * 0.55;   // il braccio: si raggiunge solo dal suo lato
      var lato = laterale ? (scarto < 0 ? -1 : 1) : ((x0 < corpo.x) ? -1 : 1);
      // Dove la linea ENTRA. Le zone centrali hanno un aggancio solo, sul
      // fianco destro (serve alle etichette del pc): quando si entra da
      // sinistra lo si specchia attorno all'asse. Poi si spinge di 14 px
      // DENTRO, se no la linea si ferma a sfiorare il bordo e sembra staccata.
      // Quanto entra nel pezzo. Nelle zone centrali entra un po' (26 px: se si
      // ferma sul bordo sembra staccata); sul braccio si ferma FUORI, perche'
      // dentro ci sono le fibre.
      // Task D14 — e in nessun caso tocca l'animazione del prodotto (Nike).
      // Il cerchio che il cervello o la sfera occupano a schermo arriva da
      // robot.js: se il tratto orizzontale passa alla sua altezza, si ferma
      // dove lo sfiora, piu' `ARIA`.
      var DENTRO = 26, FUORI = 12, ARIA = 12;
      var fineX = laterale ? (a.x + lato * FUORI)
        : (corpo.x + lato * Math.abs(scarto) - lato * DENTRO);
      var cerchio = (ancore.__anim || {})[forzata];
      if (cerchio) {
        var dy = Math.abs(a.y - cerchio.y), R = cerchio.r + ARIA;
        if (dy < R) {
          // Il tratto passa alla quota della nuvola: si ferma sulla sua
          // circonferenza allargata, dalla parte da cui arriva.
          var dx = Math.sqrt(R * R - dy * dy);
          var limite = cerchio.x + lato * dx;
          fineX = (lato < 0) ? Math.min(fineX, limite) : Math.max(fineX, limite);
        }
      }
      // La corsia verticale: quella della voce, se la voce non sta sopra la
      // colonna centrale; se no la prima libera appena fuori dalla colonna,
      // dalla parte giusta. Per il braccio, appena fuori dal braccio.
      var corsia = laterale ? (a.x + lato * 30)
        : ((Math.abs(x0 - corpo.x) > colonna) ? x0 : (corpo.x + lato * (colonna + 26)));
      corsia = Math.max(10, Math.min(lar - 10, corsia));
      var y1 = y0 + 26;                            // il primo tratto verticale, corto
      var pts = [[x0, y0]];
      if (Math.abs(corsia - x0) > 3) { pts.push([x0, y1]); pts.push([corsia, y1]); }
      pts.push([corsia, a.y]);
      pts.push([fineX, a.y]);
      // Tocco sul pezzo del robot: stesso percorso, percorso al contrario —
      // la linea nasce dal cervello (o dalla sfera, o dal braccio) e sale
      // fino alla sua voce nella scaletta.
      if (inverso) pts.reverse();
      var lung = 0;
      for (var k = 1; k < pts.length; k++) lung += Math.hypot(pts[k][0] - pts[k - 1][0], pts[k][1] - pts[k - 1][1]);
      trattoLinea.setAttribute('points', pts.map(function (p) { return n2(p[0]) + ',' + n2(p[1]); }).join(' '));

      var frazione = ridotto() ? 1
        : Math.max(0, Math.min(1, (ora() - trattoDa) / DISEGNO));
      trattoLinea.style.strokeDasharray = n2(lung);
      trattoLinea.style.strokeDashoffset = n2(lung * (1 - frazione));
      tratto.setAttribute('viewBox', '0 0 ' + lar + ' ' + alt);
    }

    // ------------------------------------------------------- puntatore e fuoco
    // L'etichetta si tiene viva col puntatore sopra SENZA dipendere da
    // pointer-events: il rettangolo si confronta a mano sul pointermove del
    // riquadro. Così il corridoio vuoto fra modello ed etichetta non ha
    // bisogno che il link sia cliccabile prima di essere raggiunto. Chi decide
    // se questo «sopra» conta davvero è `puntata()`, più sotto: una zona mai
    // accesa non si accende passando sopra il suo rettangolo.
    function onMove(ev) {
      var r = host.getBoundingClientRect();
      var x = ev.clientX - r.left, y = ev.clientY - r.top, trovato = null;
      Object.keys(el).forEach(function (id) {
        var b = el[id].box;
        if (!b) return;
        if (x >= b.x - ALONE && x <= b.x + b.w + ALONE && y >= b.y - ALONE && y <= b.y + b.h + ALONE) trovato = id;
      });
      sopra = trovato;
    }
    function onLeave() { sopra = null; }
    host.addEventListener('pointermove', onMove);
    host.addEventListener('pointerleave', onLeave);

    function onFocusIn(ev) {
      var a = ev.target.closest ? ev.target.closest('.wc-anat') : null;
      fuoco = a ? a.getAttribute('data-zona') : null;
      if (fuoco && statico) accendi(fuoco);
    }
    function onFocusOut() { fuoco = null; if (statico) accendi(null); }
    layer.addEventListener('focusin', onFocusIn);
    layer.addEventListener('focusout', onFocusOut);

    // Il clic sul link fa la stessa cosa del clic sulla zona 3D. Per
    // Atlas/SABE è una navigazione vera e la lascia fare il browser (in
    // produzione cleanUrls risponde con un 308 verso /atlas: va bene); per
    // l'Atelier si resta in pagina e si scorre.
    function onClick(ev) {
      // Task D8 — `.wc-anat-riga` e' la voce della scaletta: stesso trattamento
      // dell'etichetta, cosi' «CORRENTE#cap01» scorre invece di saltare.
      var a = ev.target.closest ? ev.target.closest('.wc-anat, .wc-anat-riga') : null;
      if (!a) return;
      if (ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.altKey || ev.button > 0) return;  // «apri in una scheda nuova»: non è roba nostra
      var id = a.getAttribute('data-zona');
      var z = perId(id);
      if (!z) return;
      // Task D12 — sul telefono la voce della scaletta non porta via subito:
      // prima fa vedere DOVE sta la cosa. Il secondo tocco sulla stessa voce
      // salta l'attesa. Su desktop niente di tutto questo: il link e' un link.
      if (stretto() && a.classList.contains('wc-anat-riga')) {
        ev.preventDefault();
        if (forzata === id) { vaiDavvero(z); return; }
        tocca(id, a);
        return;
      }
      if (z.href.indexOf('CORRENTE') !== 0) return;
      ev.preventDefault();
      scorriA(z.href.slice(z.href.indexOf('#') + 1));
    }
    layer.addEventListener('click', onClick);
    scaletta.addEventListener('click', onClick);   // Task D8: una strada sola per tutti i clic

    // ------------------------------------------- Task D12: il tocco e il viaggio
    // Nike, sulle due strade possibili: «se possibile il caricamento parte ma
    // nel mentre viene mostrato il cervello, oppure il caricamento parte solo
    // toccando il cervello. Se possibile meglio la prima».
    // La prima, e senza barare: al tocco parte SUBITO un `<link rel=prefetch>`
    // — il browser scarica la pagina mentre la linea corre e il pezzo si apre
    // — e la navigazione vera scatta a fine animazione, quando la pagina e'
    // gia' in memoria. Chi non vuole aspettare tocca una seconda volta (o
    // tocca il pezzo del robot che si e' aperto) e va subito.
    var DURATA = 1150;      // quanto dura lo spettacolo prima di cambiare pagina
    var RESTA = 3200;       // quanto resta acceso un pezzo che non porta da nessuna parte
    var RESTA_CORPO = 6000; // quanto resta aperto un pezzo toccato direttamente sul robot
    var giaPrefetch = {};
    function prefetch(url) {
      if (!url || giaPrefetch[url]) return;
      giaPrefetch[url] = 1;
      var l = document.createElement('link');
      // `prefetch` e non `preload`: il secondo vuole un `as` giusto o il
      // browser lo scarta e avvisa in console; il primo e' esattamente «questa
      // pagina mi servira' fra poco».
      l.rel = 'prefetch';
      l.href = url;
      document.head.appendChild(l);
    }
    function pulisciTimer() {
      if (timerVai) { clearTimeout(timerVai); timerVai = null; }
      if (timerSpegni) { clearTimeout(timerSpegni); timerSpegni = null; }
    }
    function spegniTocco() {
      pulisciTimer();
      forzata = null; forzataRiga = null; inverso = false;
      tratto.classList.remove('-on');
      scaletta.classList.remove('-scelta');
      Array.prototype.forEach.call(scaletta.children, function (c) { c.classList.remove('-attiva'); });
      trattoLinea.setAttribute('points', '');
    }
    // Il tocco su una voce: accende la zona, tira la linea, scarica la pagina.
    function tocca(id, riga, dalCorpo) {
      var z = perId(id);
      if (!z) return;
      pulisciTimer();
      forzata = id; forzataRiga = riga; trattoDa = ora(); inverso = !!dalCorpo;
      Array.prototype.forEach.call(scaletta.children, function (c) {
        c.classList.toggle('-attiva', c === riga);
      });
      tratto.classList.add('-on');
      scaletta.classList.add('-scelta');
      accendi(id);
      rifai(true);
      if (conDestinazione(z) && !dalCorpo) {
        var url = hrefVero(z);
        prefetch(url);
        timerVai = setTimeout(function () { vaiDavvero(z); }, DURATA);
      } else if (dalCorpo) {
        // Tocco sul pezzo del robot (Nike: «non deve partire il caricamento»):
        // si apre, la linea va alla voce, e la' si resta. Per andare si tocca
        // la voce accesa o di nuovo lo stesso pezzo; se no, dopo un po' si
        // richiude da solo.
        if (conDestinazione(z)) prefetch(hrefVero(z));
        timerSpegni = setTimeout(spegniTocco, RESTA_CORPO);
      } else {
        // La pancia non ha ancora una pagina: si vede la sfera e basta.
        timerSpegni = setTimeout(spegniTocco, RESTA);
      }
    }
    function vaiDavvero(z) {
      pulisciTimer();
      if (z.href.indexOf('CORRENTE') === 0) { spegniTocco(); scorriA(z.href.slice(z.href.indexOf('#') + 1)); return; }
      location.href = hrefVero(z);
    }

    function accendi(id) {
      if (attivo && attivo !== id) { ultimo = attivo; spentoA = ora(); }
      attivo = id || null;
      Object.keys(el).forEach(function (k) { el[k].wrap.classList.toggle('-on', k === attivo); });
    }
    // La mano NON segue l'etichetta accesa ma il raggio: l'etichetta resta su
    // per la grazia e per tutto il tempo in cui ha il fuoco, e in quei momenti
    // il puntatore può essere sul vuoto — dove un clic non porta da nessuna
    // parte e quindi il cursore non deve promettere niente.
    // Task C3: e la mano si vede solo dove il clic porta davvero da qualche
    // parte. La pancia è una zona (si apre, l'etichetta esce) ma finché la
    // pagina del gestionale non c'è il cursore non deve promettere niente.
    function segnalaMano(colpita) {
      var ora_mano = !!(colpita && colpita === attivo && conDestinazione(perId(colpita)));
      if (ora_mano === mano) return;
      mano = ora_mano;
      if (stage) stage.classList.toggle('-zona', mano);
    }

    // ------------------------------------------------------------ interfaccia
    var api = {
      // robot.js, ogni fotogramma: la zona colpita dal raycast e i punti
      // d'aggancio già proiettati.
      // `hitId` è la zona che il raggio colpisce in questo fotogramma, senza
      // grazia né fuoco: decide il cursore (e, in robot.js, il clic).
      update: function (activeId, punti, hitId) {
        if (punti) ancore = punti;
        if (activeId !== attivo) accendi(activeId);
        segnalaMano(hitId);
        rifai(false);
      },
      // La zona «tenuta viva» dall'etichetta. Il fuoco da tastiera vale sempre.
      // Il puntatore vale per la zona accesa — e, per RIPRESA millisecondi,
      // anche per quella appena spenta: se no basterebbe un gesto lento fra il
      // modello e il testo per rendere il link irraggiungibile col mouse.
      // Una zona che non è mai stata accesa NON si accende passando sopra il
      // suo rettangolo: a riposo quei rettangoli sono invisibili e non devono
      // comportarsi come pulsanti nascosti.
      puntata: function () {
        if (fuoco) return fuoco;
        if (!sopra) return null;
        if (sopra === attivo) return sopra;
        if (sopra === ultimo && (ora() - spentoA) < RIPRESA) return sopra;
        return null;
      },
      // Il clic sulla zona 3D passa di qui: un `click()` sul link vero, così
      // c'è UNA sola strada e le due non possono divergere. Task C3: senza
      // destinazione l'elemento è uno `<span>` e `click()` non farebbe niente
      // comunque — ma la condizione è esplicita, perché «non succede niente
      // per caso» non è una garanzia.
      vai: function (id) { var e = el[id]; if (e && conDestinazione(e.z)) e.a.click(); },
      // Task D12 — la zona che il tocco sulla scaletta tiene accesa. robot.js
      // la legge come se fosse quella sotto il cursore: apre lo stesso pezzo,
      // con le stesse transizioni.
      forzata: function () { return forzata; },
      // Tocco DIRETTO sul pezzo del robot (telefono): tutto come il tocco
      // sulla voce della scaletta — il pezzo si apre, la pagina si scarica,
      // poi si parte — ma la linea corre dal pezzo alla voce.
      toccaCorpo: function (id) {
        var z = perId(id);
        if (!z || !z.attiva || forzata === id) return;
        var riga = scaletta.querySelector('[data-zona="' + id + '"]');
        if (riga) tocca(id, riga, true);
      },
      // Il tocco sul pezzo del robot che si e' appena aperto salta l'attesa.
      // Vale solo per la zona in corso: toccare un'altra parte non naviga.
      subito: function (id) {
        if (!forzata || id !== forzata) return false;
        var z = perId(id);
        if (!conDestinazione(z)) return false;
        vaiDavvero(z);
        return true;
      },
      attiva: function (id) { var z = perId(id); return !!(z && z.attiva); },
      // Task C3 — «questa zona si accende» e «questa zona porta da qualche
      // parte» sono due domande diverse: la pancia risponde sì alla prima e no
      // alla seconda. robot.js chiede la seconda prima di navigare.
      cliccabile: function (id) { return conDestinazione(perId(id)); },
      layer: layer,
      dispose: function () {
        pulisciTimer();
        if (tratto.parentNode) tratto.parentNode.removeChild(tratto);
        host.removeEventListener('pointermove', onMove);
        host.removeEventListener('pointerleave', onLeave);
        layer.removeEventListener('focusin', onFocusIn);
        layer.removeEventListener('focusout', onFocusOut);
        layer.removeEventListener('click', onClick);
        if (ro) ro.disconnect(); else window.removeEventListener('resize', suResize);
        if (stage) stage.classList.remove('-zona');
        scaletta.removeEventListener('click', onClick);
        if (scaletta.parentNode) scaletta.parentNode.removeChild(scaletta);
        if (layer.parentNode) layer.parentNode.removeChild(layer);
      }
    };

    // Centro del riquadro più lo scostamento, che scala con la sola altezza:
    // vedi FISSI in testa al file per il perché non è la larghezza.
    function ancoreFisse() {
      Object.keys(FISSI).forEach(function (id) {
        if (!el[id]) return;
        ancore[id] = { x: lar / 2 + FISSI[id][0] * alt, y: alt / 2 + FISSI[id][1] * alt };
      });
    }
    // Il riquadro ha cambiato misura: si rileggono gli agganci fissi (quelli
    // veri li riproietta robot.js da sé) e si ridisegna tutto.
    function suResize() {
      if (!misuraRiquadro()) return;
      if (statico) ancoreFisse();
      rifai(true);
    }
    var ro = null;
    if (window.ResizeObserver) { ro = new ResizeObserver(suResize); ro.observe(host); }
    else window.addEventListener('resize', suResize);

    misuraRiquadro();
    if (statico) ancoreFisse();

    misura();
    if (document.fonts && document.fonts.ready && document.fonts.ready.then) {
      document.fonts.ready.then(function () { if (layer.parentNode) misura(); });
    }
    return api;
  }

  return { mount: mount, ZONE: ZONE, LINEA: LINEA, stretto: stretto, STRETTO: STRETTO };
})();
