/* CAP 05 — modello 3D interattivo (Spline) con faro che segue il cursore.
 *
 * ATTENZIONE, questa sezione rompe due vincoli del piano, di proposito e su
 * richiesta esplicita:
 *
 *  - il runtime `@splinetool/viewer` (~2.2 MB) e la scena `.splinecode`
 *    (~1.3 MB) arrivano da CDN di terze parti. Il runtime è pinnato e ha il
 *    suo `integrity`; la scena no, perché non è uno <script> ma un binario
 *    che il runtime va a prendere da sé.
 *  - la scena non è nostra: è la demo pubblica di Spline.
 *
 * Per tenerne il costo dove non fa danno, niente di tutto questo viene
 * toccato finché la sezione non si avvicina davvero al viewport: sopra la
 * piega la pagina non paga un byte. Se un giorno si vuole chiudere il
 * cerchio, le due strade sono ospitare la scena in proprio o rifarla.
 */
WC.register('robot', function(ctx){
  var section = document.getElementById('cap05');
  var card    = document.getElementById('wcRobotCard');
  var stage   = document.getElementById('wcRobotStage');
  var hint    = document.getElementById('wcRobotHint');
  var spot    = document.getElementById('wcRobotSpot');
  if (!section || !card || !stage) return;

  var VIEWER = 'https://unpkg.com/@splinetool/viewer@1.9.82/build/spline-viewer.js';
  var VIEWER_SRI = 'sha384-MncMO4oYWD5D17Cg+k0Ag2UcKtc6zPR7kUHgGev9M9n5I9N4ekk0XB29G0dDwgOo';
  var SCENE = 'https://prod.spline.design/kZDDjO5HuC9GJUM2/scene.splinecode';

  var cleanups = [];

  // ------------------------------------------------------------------ faro
  // Solo due variabili CSS: si muove un gradiente, non cambia il layout.
  if (ctx.desktop) {
    var onMove = function(e){
      var r = card.getBoundingClientRect();
      card.style.setProperty('--mx', (e.clientX - r.left) + 'px');
      card.style.setProperty('--my', (e.clientY - r.top) + 'px');
    };
    card.addEventListener('mousemove', onMove);
    cleanups.push(function(){ card.removeEventListener('mousemove', onMove); });
  } else if (spot) {
    spot.remove();
  }

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
