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
      var a = ev.target.closest ? ev.target.closest('.wc-anat') : null;
      if (!a) return;
      if (ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.altKey || ev.button > 0) return;  // «apri in una scheda nuova»: non è roba nostra
      var z = perId(a.getAttribute('data-zona'));
      if (!z || z.href.indexOf('CORRENTE') !== 0) return;
      ev.preventDefault();
      scorriA(z.href.slice(z.href.indexOf('#') + 1));
    }
    layer.addEventListener('click', onClick);

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
      attiva: function (id) { var z = perId(id); return !!(z && z.attiva); },
      // Task C3 — «questa zona si accende» e «questa zona porta da qualche
      // parte» sono due domande diverse: la pancia risponde sì alla prima e no
      // alla seconda. robot.js chiede la seconda prima di navigare.
      cliccabile: function (id) { return conDestinazione(perId(id)); },
      layer: layer,
      dispose: function () {
        host.removeEventListener('pointermove', onMove);
        host.removeEventListener('pointerleave', onLeave);
        layer.removeEventListener('focusin', onFocusIn);
        layer.removeEventListener('focusout', onFocusOut);
        layer.removeEventListener('click', onClick);
        if (ro) ro.disconnect(); else window.removeEventListener('resize', suResize);
        if (stage) stage.classList.remove('-zona');
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

  return { mount: mount, ZONE: ZONE, LINEA: LINEA };
})();
