/* ═══════════════════════════════════════════════════════════════════════════
   IL DISCO DEGLI EFFETTI — dati, cluster e il percorso sull'elica.
   (atelier/effetti — Task 3 della sotto-costellazione)

   Questo file NON ridisegna il mazzo di vetro ereditato da index.html: quel
   blocco (mesh, materiale-vetro, deckYaw/deckScale/deckFade, aggiornaFocus,
   resize) resta INLINE in effetti.html, dietro a DECK_ON. Qui si espongono
   soltanto tre globali, sincroni, PRIMA che quello script parta:

     · window.EFFETTI   — i 7 record (uno per effetto), non i 9 mondi;
     · window.CLUSTERS  — i 5 gruppi contigui, col colore;
     · window.helixPlace(u, out) — la posizione della card lungo l'elica,
                                    al posto della vecchia deckPlace ad anello.

   Il mazzo inline legge `window.EFFETTI` al posto di `WORLDS` e chiama
   `window.helixPlace` al posto di `deckPlace`; tiene invariati deckYaw (la
   card guarda la camera al fuoco), deckScale e deckFade.

   Il guscio `WC.register('effetti', …)` è qui per i task successivi (il
   controller sveglia/congela degli effetti): oggi non fa nulla di critico —
   i tre globali servono già durante il parse dell'inline, quindi vivono a
   livello di modulo, non dentro l'init differita.
   ═══════════════════════════════════════════════════════════════════════════ */
(function (root) {
  'use strict';

  /* ── I 7 RECORD ────────────────────────────────────────────────────────────
     `render` ∈ {'webgl','canvas2d','dom'} dice con che motore l'effetto vero
     girerà (Task 5–7); `modulo` è il nome WC dell'effetto (js/<modulo>.js);
     `col` è il colore del CLUSTER a cui l'effetto appartiene — le card di uno
     stesso tipo condividono la tinta, così il percorso dell'elica si legge a
     grappoli. `poster` è il fotogramma congelato dentro al vetro finché
     l'effetto non si sveglia. */
  var EFFETTI = [
    { id:'altitude', nome:'La piega',     tipo:'Fluidi',              cluster:0, modulo:'altitude', render:'webgl',   poster:'assets/effetti/altitude.webp',  col:[0.36,0.80,1.00] },
    { id:'sneaker',  nome:'La scarpa',    tipo:'Immagini animate',    cluster:1, modulo:'sneaker',  render:'webgl',   poster:'assets/effetti/sneaker.webp',   col:[0.60,0.85,1.00] },
    { id:'orologio', nome:'Il vetro',     tipo:'Immagini animate',    cluster:1, modulo:'orologio', render:'webgl',   poster:'assets/effetti/orologio.webp',  col:[0.60,0.85,1.00] },
    { id:'vesper',   nome:'Il modello',   tipo:'Modelli interattivi', cluster:2, modulo:'vesper',   render:'webgl',   poster:'assets/effetti/vesper.webp',    col:[0.23,0.85,1.00] },
    { id:'saucer',   nome:'Il disco',     tipo:'Modelli interattivi', cluster:2, modulo:'saucer',   render:'webgl',   poster:'assets/effetti/saucer.webp',    col:[0.23,0.85,1.00] },
    { id:'warp',     nome:'Il testo',     tipo:'Testo',               cluster:3, modulo:'warp',     render:'dom',     poster:'assets/effetti/warp.webp',      col:[0.85,0.70,1.00] },
    { id:'lithos',   nome:'Prima e dopo', tipo:'Prima / dopo',        cluster:4, modulo:'lithos',   render:'canvas2d',poster:'assets/effetti/lithos.webp',    col:[0.98,0.78,0.52] }
  ];

  /* ── I 5 CLUSTER ───────────────────────────────────────────────────────────
     Gruppi contigui: gli effetti sono già ordinati per cluster nell'array, così
     lo stesso `col` cade su tratti d'elica adiacenti. (Tingere il TRATTO
     d'elica sotto un cluster è un rifinimento di un task futuro; oggi la tinta
     vive solo sulle card, via `col`.) */
  var CLUSTERS = [
    { tipo:'Fluidi',               col:[0.36,0.80,1.00] },
    { tipo:'Immagini animate',     col:[0.60,0.85,1.00] },
    { tipo:'Modelli interattivi',  col:[0.23,0.85,1.00] },
    { tipo:'Testo',                col:[0.85,0.70,1.00] },
    { tipo:'Prima / dopo',         col:[0.98,0.78,0.52] }
  ];

  /* Il mazzo inline (ereditato da index.html) nomina il settore del mondo come
     `w.sett` — nei trattini in basso, nell'elenco rifratto e nella
     focus-caption. Qui il "settore" è il TIPO dell'effetto: si espone come
     alias, senza toccare il record letterale qui sopra. */
  for (var i = 0; i < EFFETTI.length; i++) EFFETTI[i].sett = EFFETTI[i].tipo;

  /* ── IL PERCORSO SULL'ELICA ────────────────────────────────────────────────
     Rimpiazza la vecchia `deckPlace` (che disponeva le lastre su un ANELLO
     attorno alla camera). Qui le card salgono lungo un'ELICA che avvolge lo
     stesso asse centrale del sito — quella di js/dna.js — così le card
     "cavalcano" la spirale invece di girare in tondo.

       phase = u * turns * 2π
       x = A·sin(phase)          → oscilla ai due lati dell'asse
       y = yTop − u·climb        → la fila scende salendo di posto
       z = −R + A·cos(phase)     → la card avanza/arretra sullo stesso raggio

     `u` è la distanza (col segno, giro corto) dal posto a fuoco: u=0 è la card
     davanti. deckYaw/deckScale/deckFade restano quelli dell'inline.

     ══ TARATURA (Task 3, 2026-08-31, verificata a schermo — desktop 1440×900
        e ritratto 390×844) ══
     Punto di partenza del brief: A=1.3, R=3.0, turns=2.5, climb=0.9, yTop=1.4.
       · turns=2.5 (mezzo giro netto per posto) lasciava sin(phase)=0 a ogni u
         intero: le card si impilavano tutte su x=0, nessuno scorcio ai lati
         (criterio b mancato). Sceso a `turns=0.38`: card adiacenti sfalsate di
         ~137° attorno all'asse, si accumulano verso il punto di fuga (a fuoco
         u=0 al centro, u=−1 in alto a sinistra, u=+1 in basso a destra).
       · yTop sceso da 1.4 a 0.95 per centrare la card a fuoco sull'asse ottico
         (la camera guarda verso y≈0.95 a quella profondità — vedi RING.lookY /
         RING.camH ereditati e il conto CAM0.z in resize()).
       · R alzato da 3.0 a 4.5 (con A=1.3 la card a fuoco sta a z=−R+A=−3.2):
         a R=3.0 riempiva TROPPO e copriva del tutto le vicine; a 4.5 la
         davanti riempie ~55% del quadro e le due vicine spuntano ai lati,
         sovrapposte (criterio c: il vetro deve rifrangere qualcosa) ma visibili
         (criterio b). climb 0.85 dà la salita senza spingere le vicine fuori.
     deckFade (ereditato, cos(u·2π/7)) spegne |u|≥2: in quadro restano 3 card
     (u=−1,0,+1), dentro il «3–4» del criterio. L'elica di js/dna.js resta
     visibile davanti/dietro (criterio d): è un canvas separato, z-index 2.
     Su ritratto (aspect<1) il passo si stringe da sé: vedi `helixTune()` in
     effetti.html, che stringe A/climb/yTop come fa resize() nella home. */
  var TUNE = { A: 1.3, R: 4.5, turns: 0.38, climb: 0.85, yTop: 0.95 };

  function helixPlace(u, out) {
    var t = root.__HELIX_TUNE || TUNE;
    var phase = u * t.turns * 2 * Math.PI;
    return out.set(
      t.A * Math.sin(phase),
      t.yTop - u * t.climb,
      -t.R + t.A * Math.cos(phase)
    );
  }

  /* I tre globali, sincroni: l'inline li legge durante il parse. */
  root.EFFETTI = EFFETTI;
  root.CLUSTERS = CLUSTERS;
  root.helixPlace = helixPlace;
  /* La taratura viva, così effetti.html può stringere il passo su ritratto
     senza reimportare i numeri. Parte dai valori tarati qui sopra. */
  root.__HELIX_TUNE = { A: TUNE.A, R: TUNE.R, turns: TUNE.turns, climb: TUNE.climb, yTop: TUNE.yTop };

  /* ══════════════════════════════════════════════════════════════════════════
     IL CONTROLLER SVEGLIA / CONGELA (Task 5)
     ══════════════════════════════════════════════════════════════════════════
     La regola di ferro dell'atelier: un solo effetto (un solo contesto WebGL)
     vivo per volta; l'elica è l'asse sempre acceso. Il meccanismo:

       · `#stage-live` è un contenitore HTML assoluto SOPRA la tela dello stage,
         riposizionato OGNI fotogramma sul rettangolo PROIETTATO della card a
         fuoco. La card a fuoco è portata frontale+centrata (Task 3), quindi il
         suo rettangolo proiettato è un quadro pulito sullo schermo.
       · `wake(record, mesh)` monta la tela dell'effetto dentro `#stage-live` e
         chiama il suo `start(container)`; `freeze()` chiama `stop()`, nasconde
         il layer e lascia visibile sotto il poster congelato della card.
       · Si sveglia SOLO a pieno fuoco (`atFullFocus`): la card ferma da ~250ms e
         centrata (`face≈1`). Mentre si scorre, tutte le card mostrano il poster.

     LA PROIEZIONE È QUELLA DELLA SCENA, non una inventata: si prendono i quattro
     angoli del piano della card (CW×CH in coordinate locali), li si porta in
     mondo con `mesh.matrixWorld` e li si proietta con LA STESSA camera dello
     stage (`v.project(camera)`), gli stessi `matrixWorldInverse`/`projectionMatrix`
     con cui lo stage disegna la card. Il riquadro che ne esce è il bounding box a
     schermo di quei quattro punti — a pieno fuoco la card è frontale, quindi è un
     rettangolo netto.

     Solo gli effetti presenti in `effects` (oggi `saucer`) si svegliano; per gli
     altri il controller è un no-op e resta il poster (Task 6–7 li aggiungono). */
  function createController(deps){
    var THREE = deps.THREE, camera = deps.camera, renderer = deps.renderer;
    var stageLive = deps.stageLive, effects = deps.effects || {};
    var hw = (deps.cardW || 2.95) / 2, hh = (deps.cardH || 1.84) / 2;
    var v = new THREE.Vector3();
    var corners = [[-hw,-hh],[hw,-hh],[hw,hh],[-hw,hh]];
    var awakeId = null;               // modulo dell'effetto sveglio, o null
    var lastW = 0, lastH = 0;

    function helix(){ return root.WC && root.WC.helix; }

    function place(mesh){
      camera.updateMatrixWorld();
      mesh.updateWorldMatrix(true, false);
      var el = renderer.domElement;
      var W = el.clientWidth || window.innerWidth;
      var H = el.clientHeight || window.innerHeight;
      var minx = Infinity, miny = Infinity, maxx = -Infinity, maxy = -Infinity;
      for (var i = 0; i < 4; i++){
        v.set(corners[i][0], corners[i][1], 0).applyMatrix4(mesh.matrixWorld).project(camera);
        var sx = (v.x * 0.5 + 0.5) * W;
        var sy = (1 - (v.y * 0.5 + 0.5)) * H;
        if (sx < minx) minx = sx; if (sx > maxx) maxx = sx;
        if (sy < miny) miny = sy; if (sy > maxy) maxy = sy;
      }
      var w = Math.max(1, maxx - minx), h = Math.max(1, maxy - miny);
      stageLive.style.left = minx + 'px';
      stageLive.style.top = miny + 'px';
      stageLive.style.width = w + 'px';
      stageLive.style.height = h + 'px';
      // Ridimensiona la tela dell'effetto solo quando il riquadro cambia misura
      // (a ogni frame è sprecato): al primo posizionamento e a ogni resize.
      if (Math.abs(w - lastW) > 1 || Math.abs(h - lastH) > 1){
        lastW = w; lastH = h;
        var api = effects[awakeId];
        if (api && api.resize) api.resize();
      }
    }

    function wake(record, mesh){
      var api = effects[record.modulo];
      if (!api) return;
      stageLive.hidden = false;
      lastW = lastH = 0;              // forza un resize al primo place()
      awakeId = record.modulo;
      place(mesh);                    // posiziona PRIMA che l'effetto misuri
      api.start(stageLive);
      var hx = helix(); if (hx && hx.throttle) hx.throttle(true);
    }

    function freeze(){
      if (!awakeId) return;
      var api = effects[awakeId];
      if (api && api.stop) api.stop();
      awakeId = null;
      stageLive.hidden = true;
      var hx = helix(); if (hx && hx.throttle) hx.throttle(false);
    }

    return {
      awake: function(){ return awakeId; },
      freeze: freeze,
      tick: function(now, focusMesh, focusRecord, atFullFocus){
        var wired = focusRecord && effects[focusRecord.modulo];
        if (atFullFocus && wired && focusMesh){
          if (awakeId !== focusRecord.modulo){ freeze(); wake(focusRecord, focusMesh); }
          place(focusMesh);
        } else if (awakeId){
          freeze();
        }
      }
    };
  }
  root.EffettiController = { create: createController };

  /* ── IL GUSCIO WC (per i task successivi) ──────────────────────────────────
     Il controller sveglia/congela degli effetti (Task 5–7) troverà qui la sua
     casa. Oggi non serve un runtime: i dati sono già esposti sopra. Si registra
     solo se WC c'è, e non fa nulla di critico. */
  if (typeof root.WC !== 'undefined' && root.WC && typeof root.WC.register === 'function') {
    try {
      root.WC.register('effetti', function () {
        /* segnaposto: il wake/freeze controller arriva nei task successivi. */
        return { EFFETTI: EFFETTI, CLUSTERS: CLUSTERS, helixPlace: helixPlace };
      });
    } catch (e) { /* WC non pronto: i globali bastano comunque */ }
  }
})(typeof window !== 'undefined' ? window : this);
