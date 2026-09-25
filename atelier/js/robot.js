/* CAP 05 — modello 3D interattivo (Spline), a tutta sezione.
 *
 * ATTENZIONE, questa sezione rompe due vincoli del piano, di proposito e su
 * richiesta esplicita:
 *
 *  - il runtime `@splinetool/viewer` 1.9.82 (~2.2 MB) e la scena
 *    `.splinecode` (~1.3 MB) sono serviti da noi: vendor/spline-viewer-1.9.82/
 *    e assets/robot/. Nessuna richiesta a CDN di terze parti (parità privacy
 *    con il sito madre, commit 2717d54). Il runtime ha il suo `integrity`,
 *    ricalcolato sul file in casa (vedi il README di quella cartella: le URL
 *    di wasm, DRACO e logo puntano ai file locali).
 *  - la scena non è nostra: è la demo pubblica di Spline.
 *
 * Per tenerne il costo dove non fa danno, niente di tutto questo viene
 * toccato finché la sezione non si avvicina davvero al viewport: sopra la
 * piega la pagina non paga un byte.
 */
WC.register('robot', function(ctx){
  var section = document.getElementById('cap05');
  var card    = document.getElementById('wcRobotCard');
  var stage   = document.getElementById('wcRobotStage');
  var hint    = document.getElementById('wcRobotHint');
  if (!section || !card || !stage) return;

  var VIEWER = '/atelier/vendor/spline-viewer-1.9.82/spline-viewer.js';
  var VIEWER_SRI = 'sha384-V/W2IW7d84zv43iNLXNMlC6SpG/hDcr1EjdVi83snTMZyoUD1k4eq3kxqOL/FFqQ';
  var SCENE = '/atelier/assets/robot/scene.splinecode';

  var cleanups = [];

  // Qui c'era un faro CSS che seguiva il cursore sulla card. Da quando la
  // scena occupa tutta la sezione gli sta sopra un canvas opaco: il faro non
  // si vedeva più. Tolto, insieme al suo listener di mousemove.

  // --------------------------------------------------------------- caricam.
  var mounted = false;

  function fail(msg){
    if (hint) hint.textContent = msg;
    stage.classList.add('-failed');
  }

  function mount(){
    if (mounted) return;
    mounted = true;

    // Reduced-motion: una scena 3D che gira di continuo è esattamente ciò che
    // l'impostazione chiede di non avere. Resta la card, senza il modello.
    if (!ctx.motionOk) { fail('Modello 3D disattivato: hai chiesto meno animazioni'); return; }

    var existing = document.querySelector('script[data-spline]');
    var ready = existing
      ? Promise.resolve()
      : new Promise(function(resolve, reject){
          var s = document.createElement('script');
          s.type = 'module';
          s.src = VIEWER;
          s.integrity = VIEWER_SRI;
          s.crossOrigin = 'anonymous';
          s.dataset.spline = '1';
          s.onload = resolve;
          s.onerror = function(){ reject(new Error('viewer')); };
          document.head.appendChild(s);
        });

    ready.then(function(){
      // `spline-viewer` è un custom element: prima che sia definito il tag
      // esiste ma non disegna nulla, e senza questa attesa il messaggio di
      // caricamento sparirebbe su una scatola vuota.
      return customElements.whenDefined('spline-viewer');
    }).then(function(){
      var viewer = document.createElement('spline-viewer');
      viewer.setAttribute('url', SCENE);
      viewer.setAttribute('loading-anim-type', 'none');
      stage.appendChild(viewer);

      // Il viewer non emette un evento di fine caricamento su cui si possa
      // contare, quindi il segnale vero è il canvas che compare nel suo
      // shadow root: prima di quello non c'è niente da guardare. Si controlla
      // a intervalli e ci si ferma comunque dopo 20 s — la scena pesa più di
      // un megabyte, e se la rete la perde per strada il pannello non deve
      // restare su "in arrivo" per sempre.
      var waited = 0;
      var poll = setInterval(function(){
        waited += 250;
        var drawn = viewer.shadowRoot && viewer.shadowRoot.querySelector('canvas');
        if (drawn) { clearInterval(poll); if (hint) hint.remove(); return; }
        if (waited >= 20000) { clearInterval(poll); fail('Scena non raggiungibile'); }
      }, 250);

      cleanups.push(function(){ clearInterval(poll); viewer.remove(); });
    }).catch(function(){
      fail('Scena non caricata');
    });
  }

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
