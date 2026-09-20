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
  var ZONE = [
    { id: 'testa',     lato: 'destra',   testo: 'cervello',         sotto: 'Atlas',   href: '../atlas.html',  attiva: true },
    { id: 'pancia',    lato: 'destra',   testo: 'anima',            sotto: 'sabe',    href: '../sabe.html',   attiva: true },
    { id: 'braccioSx', lato: 'sinistra', testo: 'website creation', sotto: 'atelier', href: 'CORRENTE#cap01', attiva: true },
    { id: 'braccioDx', lato: 'destra',   testo: '',                 sotto: '',        href: '',               attiva: false }
  ];
  // Misure in frazione della LARGHEZZA del riquadro (così valgono a ogni
  // dimensione), tranne `margineBordo` (px) e `staccoTesto` (altezze di riga).
  // `obliquoFrazione` non è nella specifica: la specifica dà l'ANGOLO del
  // tratto obliquo ma non la sua lunghezza, e una lunghezza serve. Legarla
  // alla corsa orizzontale tiene la FORMA dell'etichetta identica a ogni
  // dimensione e su ogni zona — un valore in pixel, invece, farebbe un gomito
  // grande su una linea corta e un gomito minuscolo su una lunga.
  var LINEA = { orizzontaleObiettivo: 0.27, orizzontaleMinimo: 0.12, obliquoGradi: 38,
    staccoTesto: 0.5, margineBordo: 24, obliquoFrazione: 0.42 };
  // Senza scena 3D (reduced-motion: robot.js non monta niente) le etichette
  // stanno in punti fissi del riquadro — frazioni prese dove cadono le zone
  // vere a 1440×900, così il montaggio fermo assomiglia a quello vivo.
  // (misurati leggendo window.__robot.anatomia.anchors a 1440×900 e divisi per
  // il riquadro: testa 783,6/262,4 · pancia 837,9/340,6 · braccio 384,7/548,9)
  var FISSI = { testa: [0.544, 0.292], pancia: [0.582, 0.378], braccioSx: [0.267, 0.610] };
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

      var a = document.createElement('a');
      a.className = 'wc-anat' + (z.lato === 'sinistra' ? ' -sinistra' : ' -destra');
      a.setAttribute('data-zona', z.id);
      a.href = hrefVero(z);
      a.setAttribute('aria-label', z.testo + ' — ' + z.sotto);
      var voce = document.createElement('span');
      voce.className = 'wc-anat-voce';
      voce.textContent = z.testo;
      var sotto = document.createElement('span');
      sotto.className = 'wc-anat-sotto';
      sotto.textContent = z.sotto;
      a.appendChild(voce);
      a.appendChild(sotto);

      wrap.appendChild(svg);
      wrap.appendChild(a);
      layer.appendChild(wrap);
      el[z.id] = { z: z, wrap: wrap, svg: svg, linea: linea, a: a, voce: voce,
        box: null, m: { w: 0, hVoce: 0, hTot: 0, riga: 0 }, scritto: '' };
    });
    host.appendChild(layer);

    var ancore = {};          // id → {x, y} in px del riquadro
    var attivo = null;        // ultima zona passata da update()
    var ultimo = null;        // l'ultima che è stata accesa, e quando si è spenta
    var spentoA = 0;
    var sopra = null;         // zona il cui rettangolo-etichetta ha il puntatore
    var fuoco = null;         // zona il cui link ha il fuoco
    var lar = 0, alt = 0;
    function ora() { return (window.performance && performance.now) ? performance.now() : Date.now(); }

    // ------------------------------------------------------------- misure
    // Larghezza e altezze del testo: si leggono UNA VOLTA (e dopo il carico
    // dei font), non a ogni fotogramma — offsetWidth dentro il loop di
    // rendering forzerebbe un reflow per etichetta per frame.
    function misura() {
      Object.keys(el).forEach(function (id) {
        var e = el[id];
        e.m.w = e.a.offsetWidth;
        e.m.hVoce = e.voce.offsetHeight;
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
      var w = host.clientWidth, h = host.clientHeight;
      if (!w || !h) return;
      var misuraCambiata = (w !== lar || h !== alt);
      if (misuraCambiata) { forza = true; lar = w; alt = h; }
      Object.keys(el).forEach(function (id) {
        var e = el[id];
        // Il viewBox segue il riquadro, quindi cambia solo quando cambia lui:
        // riscriverlo a ogni fotogramma sarebbe un attributo SVG toccato per
        // niente sessanta volte al secondo.
        if (misuraCambiata) e.svg.setAttribute('viewBox', '0 0 ' + w + ' ' + h);
        var g = geometria(e);
        if (!g) { if (e.box) { e.box = null; e.linea.setAttribute('points', ''); } return; }
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
      if (stage) stage.classList.toggle('-zona', !!attivo);
    }

    // ------------------------------------------------------------ interfaccia
    var api = {
      // robot.js, ogni fotogramma: la zona colpita dal raycast e i punti
      // d'aggancio già proiettati.
      update: function (activeId, punti) {
        if (punti) ancore = punti;
        if (activeId !== attivo) accendi(activeId);
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
      // c'è UNA sola strada e le due non possono divergere.
      vai: function (id) { var e = el[id]; if (e) e.a.click(); },
      attiva: function (id) { var z = perId(id); return !!(z && z.attiva); },
      layer: layer,
      dispose: function () {
        host.removeEventListener('pointermove', onMove);
        host.removeEventListener('pointerleave', onLeave);
        layer.removeEventListener('focusin', onFocusIn);
        layer.removeEventListener('focusout', onFocusOut);
        layer.removeEventListener('click', onClick);
        if (statico) window.removeEventListener('resize', suResize);
        if (stage) stage.classList.remove('-zona');
        if (layer.parentNode) layer.parentNode.removeChild(layer);
      }
    };

    function ancoreFisse() {
      Object.keys(FISSI).forEach(function (id) {
        if (!el[id]) return;
        ancore[id] = { x: FISSI[id][0] * host.clientWidth, y: FISSI[id][1] * host.clientHeight };
      });
    }
    function suResize() { ancoreFisse(); rifai(true); }
    if (statico) {
      // Nessuno chiama update(): gli agganci sono fissi e il layer si rifà
      // solo quando cambia la misura del riquadro.
      ancoreFisse();
      window.addEventListener('resize', suResize);
    }

    misura();
    if (document.fonts && document.fonts.ready && document.fonts.ready.then) {
      document.fonts.ready.then(function () { if (layer.parentNode) misura(); });
    }
    return api;
  }

  return { mount: mount, ZONE: ZONE, LINEA: LINEA };
})();
