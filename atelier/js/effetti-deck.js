/* ═══════════════════════════════════════════════════════════════════════════
   IL DISCO DEGLI EFFETTI — dati, cluster e il percorso sull'elica.
   (atelier/capitoli — Task 3 della sotto-costellazione)

   Questo file NON ridisegna il mazzo di vetro ereditato da index.html: quel
   blocco (mesh, materiale-vetro, deckYaw/deckScale/deckFade, aggiornaFocus,
   resize) resta INLINE in capitoli.html, dietro a DECK_ON. Qui si espongono
   soltanto tre globali, sincroni, PRIMA che quello script parta:

     · window.EFFETTI   — i 7 record (uno per effetto), non i 9 mondi;
     · window.CLUSTERS  — i 5 gruppi contigui per tipo;
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
     `col` è il colore della CARD (Nike, 2026-09-24: «quando cambia la card
     davanti, la pagina prende il suo colore») — ognuna il suo, non piu'
     quello del cluster: lo prendono il bordo del vetro, i fermi, il
     contatore, l'accento della copy, la riga dell'elenco, la nebbia di fondo
     e l'elica (WC.helix.setTint). `dna` (facoltativo) e' la tavolozza con cui
     si tinge l'elica quando un colore solo non basta (Nebulosa, Genesi): `col`
     ne e' allora la prima voce, e vale per tutto il resto. `poster` è il fotogramma congelato dentro al vetro finché
     l'effetto non si sveglia. `scrimForte` (facoltativo) scurisce di piu' la
     sfumatura sotto la copy: serve dove l'effetto accende il centro-sinistra
     (la galassia di Nebulosa), e la scritta altrimenti non terrebbe il 4.5:1.
     `en` e' la stessa card in inglese (Nike: «traduci tutte le scritte
     possibili»): `nome`, `tipo` e `lp` con la stessa forma di quelli italiani
     qui accanto. Non e' una traduzione parola per parola ma una copy scritta
     per chi legge in inglese, con lo stesso senso e lo stesso passo — il
     titolo resta di due righe. Chi la mostra (capitoli.html, vedi `inLingua`)
     sceglie fra le due con `window.atelierLinguaOra`; i campi italiani restano
     quelli di sempre, cosi' chi li leggeva direttamente non cambia. */
  var EFFETTI = [
    { id:'altitude', nome:'Vapore',   tipo:'Fluidi', cluster:0, modulo:'altitude', render:'webgl', poster:'assets/effetti/altitude.webp', col:[0.36,0.80,1.00],
      lp:{ kicker:'Fluidi', h:['Il cielo si piega','dove passi.'], sub:'Una simulazione di fluido che segue il cursore, in tempo reale.', cta:'Muovi il mouse' },
      en:{ nome:'Vapour', tipo:'Fluids', lp:{ kicker:'Fluids', h:['The sky bends','wherever you go.'], sub:'A fluid simulation that follows your cursor, in real time.', cta:'Move the mouse' } } },
    { id:'sneaker',  nome:'Gravità',  tipo:'Immagini animate', cluster:1, modulo:'sneaker',  render:'dom',   poster:'assets/effetti/sneaker.webp',  col:[1.00,0.42,0.12],
      lp:{ kicker:'Immagini animate', h:['Ogni passo,','sospeso.'], sub:'Il prodotto che fluttua e gira da solo, come in uno spot.', cta:'Guarda' },
      en:{ nome:'Gravity', tipo:'Animated images', lp:{ kicker:'Animated images', h:['Every step,','suspended.'], sub:'Your product floats and turns on its own, like a TV spot.', cta:'Watch' } } },
    { id:'orologio', nome:'Anatomia', tipo:'Immagini animate', cluster:1, modulo:'orologio', render:'webgl', poster:'assets/effetti/orologio.webp', col:[0.95,0.95,0.97], chiaro:true,
      lp:{ kicker:'Immagini animate', h:['Dentro ogni','dettaglio.'], sub:"L'orologio si apre pezzo per pezzo, senza un fotogramma fuori posto.", cta:'Esplora' },
      en:{ nome:'Anatomy', tipo:'Animated images', lp:{ kicker:'Animated images', h:['Inside','every detail.'], sub:'The watch opens up piece by piece, with not a frame out of place.', cta:'Explore' } } },
    { id:'vesper',   nome:'Nebulosa', tipo:'Modelli interattivi', cluster:2, modulo:'vesper', render:'webgl', poster:'assets/effetti/vesper.webp', col:[0.62,0.45,1.00],
      dna:[[0.62,0.45,1.00],[0.35,1.00,0.70],[1.00,0.50,0.85]], scrimForte:true,
      lp:{ kicker:'Modelli interattivi', h:['Da una sfera, una galassia.',"Da una galassia, un'idea."], sub:'Ventimila punti che cambiano forma e rispondono al tuo gesto.', cta:'Avvicinati' },
      en:{ nome:'Nebula', tipo:'Interactive models', lp:{ kicker:'Interactive models', h:['From a sphere, a galaxy.','From a galaxy, an idea.'], sub:'Twenty thousand points that change shape and answer your every move.', cta:'Come closer' } } },
    { id:'saucer',   nome:'Contatto', tipo:'Modelli interattivi', cluster:2, modulo:'saucer', render:'webgl', poster:'assets/effetti/saucer.webp', col:[0.35,1.00,0.45], scramble:true,
      lp:{ kicker:'Modelli interattivi', h:["Quarantamila fili d'erba.",'Uno solo è stato scelto.'], sub:'Una scena 3D che risponde a chi la guarda.', cta:'Scopri' },
      en:{ nome:'Contact', tipo:'Interactive models', lp:{ kicker:'Interactive models', h:['Forty thousand blades of grass.','Only one was chosen.'], sub:'A 3D scene that responds to whoever is watching.', cta:'Discover' } } },
    { id:'warp',     nome:'Genesi',   tipo:'Testo', cluster:3, modulo:'warp', render:'dom', poster:'assets/effetti/warp.webp', col:[0.72,0.45,1.00],
      dna:[[0.72,0.45,1.00],[0.95,0.40,0.85],[0.40,0.55,1.00]],
      lp:{ kicker:'Testo', h:["Tutto comincia","da un'elica."], sub:'Particelle che si ricompongono in forme sempre nuove.', cta:'Osserva' },
      en:{ nome:'Genesis', tipo:'Text', lp:{ kicker:'Text', h:['It all begins','with a helix.'], sub:'Particles that keep reassembling into brand-new shapes.', cta:'Look closer' } } },
    { id:'lithos',   nome:'Rivela',   tipo:'Prima / dopo', cluster:4, modulo:'lithos', render:'canvas2d', poster:'assets/effetti/lithos.webp', col:[1.00,0.62,0.25],
      lp:{ kicker:'Prima / dopo', h:['La luce racconta','il prima e il dopo.'], sub:"Passa sopra l'immagine e scopri com'era.", cta:'Illumina' },
      en:{ nome:'Reveal', tipo:'Before / after', lp:{ kicker:'Before / after', h:['Light tells','the before and after.'], sub:'Move over the image and see how it used to be.', cta:'Light it up' } } }
  ];

  /* ── I 5 CLUSTER ───────────────────────────────────────────────────────────
     Gruppi contigui per TIPO (gli effetti sono già ordinati per cluster
     nell'array). Non portano piu' un colore: dal 2026-09-24 il colore e' della
     card (`col` sul record), non del gruppo. */
  var CLUSTERS = [
    { tipo:'Fluidi' },
    { tipo:'Immagini animate' },
    { tipo:'Modelli interattivi' },
    { tipo:'Testo' },
    { tipo:'Prima / dopo' }
  ];

  /* Il mazzo inline (ereditato da index.html) nomina il settore del mondo come
     `w.sett` — nei trattini in basso, nell'elenco rifratto e nella
     focus-caption. Qui il "settore" è il TIPO dell'effetto: si espone come
     alias, senza toccare il record letterale qui sopra. */
  for (var i = 0; i < EFFETTI.length; i++){
    EFFETTI[i].sett = EFFETTI[i].tipo;
    if (EFFETTI[i].en) EFFETTI[i].en.sett = EFFETTI[i].en.tipo;   // lo stesso alias per l'inglese
  }

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
     capitoli.html, che stringe A/climb/yTop come fa resize() nella home.
     2026-09-24 («nessuna card ne tocca un'altra», richiesta di Nike): climb
     0.85 → 2.2 (piu' salita fra un posto e il successivo, altrimenti la
     vicina dietro finiva DENTRO il rettangolo della card a fuoco) e yTop
     0.95 → 1.25 (la fila si alza quel tanto che serve perche' la vicina
     davanti-in-alto non tocchi la barra di navigazione E la vicina
     davanti-in-basso non tocchi la didascalia — sono in tensione fra loro,
     1.25 e' il punto che libera entrambe). Le vicine rimpiccioliscono al 25%
     (SCALE_SIDE in capitoli.html, vedi deckScale — sceso dal 55% di partenza:
     a quella taglia la vicina restava troppo alta per liberare insieme barra
     e didascalia) e deckFade si stringe da
     cos(u)∈[-0.1,0.35] a [0.28,0.55] perche' la vicina successiva (|u|≈1.5,
     di passaggio durante il giro) sia spenta PRIMA di toccare didascalia o
     barra, invece di restare a meta' opacita' e continuare a toccarle.
     Verificato con scripts/verify-capitoli.cjs overlap (desktop e mobile):
     zero overlap card-card/card-UI a riposo, a meta' giro e dopo resize;
     restano solo gli overlap con l'indice, accettati fino al Task 3 che lo
     sposta. */
  var TUNE = { A: 1.3, R: 4.5, turns: 0.38, climb: 2.2, yTop: 1.25 };

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
  /* La taratura viva, così capitoli.html può stringere il passo su ritratto
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

     Solo gli effetti presenti in `effects` si svegliano; per gli altri il
     controller è un no-op e resta il poster. Ogni handle si registra da sé, nel
     proprio js/<modulo>.js (`WC.effects.<modulo> = {start,stop,resize}`), non
     qui: `effects` è `WC.effects` per riferimento (vedi la creazione del
     controller in capitoli.html), quindi un modulo caricato prima dell'inline
     compare già pronto. Task 5 ha aggiunto `saucer`; Task 6 `vesper`,
     `orologio`, `altitude` — questo file non cambia per registrarli, cambia
     solo l'elenco degli script caricati in capitoli.html. */
  function createController(deps){
    var THREE = deps.THREE, camera = deps.camera, renderer = deps.renderer;
    var stageLive = deps.stageLive, effects = deps.effects || {};
    var hw = (deps.cardW || 2.95) / 2, hh = (deps.cardH || 1.84) / 2;
    var v = new THREE.Vector3();
    var corners = [[-hw,-hh],[hw,-hh],[hw,hh],[-hw,hh]];
    var awakeId = null;               // modulo dell'effetto sveglio, o null
    var lastW = 0, lastH = 0;

    function helix(){ return root.WC && root.WC.helix; }

    /* Il moto non è gradito? La domanda si fa al SISTEMA, non solo a
       `WC.motionOk`: quel flag nasce `true` in js/core.js e diventa `false`
       dentro boot(), un gradino più tardi del primo fotogramma utile — e un
       effetto che si sveglia in quella finestra si porta dietro il suo video
       (la richiesta parte e viene poi abortita: `ERR_ABORTED` in console).
       La media query è giusta dal fotogramma zero; `WC.motionOk === false`
       resta come conferma quando boot() ha già deciso. */
    var mqRidotto = root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)');
    function ridotto(){
      if (root.WC && root.WC.motionOk === false) return true;
      return !!(mqRidotto && mqRidotto.matches);
    }

    /* IL RETTANGOLO DELLA CARD A SCHERMO. Estratto da `place()` perché serve
       anche a chi non sveglia niente: il buco nella maschera dell'elica (vedi
       `deckCtl.rect` in capitoli.html) lo usa per non far entrare i punti del
       DNA dentro all'anteprima. */
    function misura(mesh){
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
      return { x: minx, y: miny, w: Math.max(1, maxx - minx), h: Math.max(1, maxy - miny) };
    }

    function place(mesh){
      var r = misura(mesh);
      var minx = r.x, miny = r.y, w = r.w, h = r.h;
      stageLive.style.left = minx + 'px';
      stageLive.style.top = miny + 'px';
      stageLive.style.width = w + 'px';
      stageLive.style.height = h + 'px';
      /* Gli angoli della lastra: la stessa frazione della larghezza che usa lo
         shader del vetro, così la tela viva non è un rettangolo appiccicato
         sopra a un vetro smussato. */
      stageLive.style.setProperty('--raggio', Math.round(w * 0.035) + 'px');
      // Ridimensiona la tela dell'effetto solo quando il riquadro cambia misura
      // (a ogni frame è sprecato): al primo posizionamento e a ogni resize.
      if (Math.abs(w - lastW) > 1 || Math.abs(h - lastH) > 1){
        lastW = w; lastH = h;
        var api = effects[awakeId];
        if (api && api.resize) api.resize();
      }
    }

    /* UNA CARD, IL SUO EFFETTO — E NIENT'ALTRO.
       Ogni modulo tiene in vita il proprio host dentro `#stage-live` anche da
       fermo (è quello che gli permette di ripartire senza rimontare: vedi la
       nota in js/saucer.js) e lo rimette in coda ai figli quando riparte. Ma i
       fratelli restavano lì, visibili: bastava che l'effetto sveglio avesse
       una tela trasparente — lithos con la maschera, warp che è DOM — per
       vedere sotto l'effetto di un'altra card. Qui si spegne tutto quello che
       non è l'host appena montato: `display:none` e non `remove()`, perché il
       modulo quell'host se lo ritrova e lo rianima al prossimo giro. */
    function soloQuestoSiVede(){
      var kids = stageLive.children;
      for (var i = 0; i < kids.length; i++){
        kids[i].style.display = (i === kids.length - 1) ? '' : 'none';
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
      soloQuestoSiVede();
      /* La dissolvenza parte al fotogramma dopo: messa nello stesso, il
         browser non ha uno stato "prima" da cui interpolare e la transizione
         non si vede proprio. */
      if (root.requestAnimationFrame) root.requestAnimationFrame(function(){
        if (awakeId) stageLive.classList.add('-viva');
      });
      else stageLive.classList.add('-viva');
      var hx = helix(); if (hx && hx.throttle) hx.throttle(true);
    }

    function freeze(){
      if (!awakeId) return;
      var api = effects[awakeId];
      /* `-viva` si toglie PRIMA di fermare l'effetto: è lei a dare il
         puntatore all'anteprima (vedi #stage-live nel CSS di capitoli.html),
         e un'anteprima che si sta spegnendo deve ridarlo subito al mazzo.
         Si spegne anche in uscita, non solo in entrata: `hidden` toglierebbe
         la tela in un fotogramma, e il ritorno al poster sarebbe lo stesso
         scatto visto al contrario. `hidden` arriva a dissolvenza finita — e
         solo se nel frattempo non si è svegliato qualcun altro. */
      stageLive.classList.remove('-viva');
      if (api && api.stop) api.stop();
      awakeId = null;
      setTimeout(function(){ if (!awakeId) stageLive.hidden = true; }, 280);
      var hx = helix(); if (hx && hx.throttle) hx.throttle(false);
    }

    return {
      awake: function(){ return awakeId; },
      rect: misura,
      freeze: freeze,
      tick: function(now, focusMesh, focusRecord, atFullFocus){
        /* REDUCED-MOTION: NESSUN EFFETTO SI SVEGLIA (Task 9).
           Ogni modulo esce già da sé su `!ctx.motionOk` — ma `WC.motionOk`
           nasce `true` in js/core.js e diventa `false` solo dentro boot(),
           mentre il fuoco (e quindi il primo `wake`) può cadere prima: chi si
           è montato in quella finestra resta montato, e due moduli lo danno a
           vedere (altitude tiene il video in riproduzione; lithos, con
           `auto`, muove il faro da solo). Il gate va qui, dove la decisione si
           prende ogni fotogramma e non una volta sola: se il moto non è
           gradito si congela e si resta sul poster — la costellazione ferma
           che chiede la spec, navigabile a passi con frecce/fermi/elenco. */
        if (ridotto()){ freeze(); return; }
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
