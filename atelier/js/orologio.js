/* OROLOGIO — si smonta se scorri giù, si rimonta se torni su.
 *
 * Fondo bianco pieno, l'oggetto al centro, e due colonne vuote ai lati per le
 * frasi. Lo scroll non "fa partire" niente: è lui il tempo. Fermi il dito e
 * l'orologio resta a metà, con la ghiera sospesa sopra il vetro.
 *
 * ── L'ARCO STA TUTTO NELLA DISCESA ─────────────────────────────────────────
 * Scendendo si vede lo smontaggio E il rimontaggio: a metà corsa l'orologio è
 * completamente aperto, e da lì in poi si richiude. Non serve tornare su per
 * vederlo tornare intero — anche se tornando su succede lo stesso, perché è
 * sempre lo scroll a comandare.
 *
 * I fotogrammi sul disco raccontano solo l'apertura: la chiusura è la stessa
 * sequenza letta all'indietro. Costa zero byte e non c'è modo di distinguerla
 * da una chiusura girata davvero, perché il movimento è reversibile — nessun
 * pezzo cade, nessuno rimbalza, niente ha un verso proprio.
 *
 * ── PERCHÉ UNA SEQUENZA DI FOTOGRAMMI E NON UN <video> ─────────────────────
 * Perché un <video> scrubbato è già stato provato su questa pagina, ed è stato
 * tolto. Cercare dentro un filmato vuol dire chiedere al server un pezzo di
 * file: senza `Accept-Ranges` e risposte 206 il browser si RIFIUTA di cercare,
 * `python3 -m http.server` non le manda, e il capitolo resta fermo sul primo
 * fotogramma senza che niente lo dica. In più il decoder va in affanno quando
 * i salti arrivano a 60 Hz, `seeked` si perde, e la pagina scatta.
 *
 * Qui non c'è niente da cercare. I fotogrammi sono immagini, stanno in memoria,
 * e a ogni posizione di scroll ne corrisponde UNO, calcolato e disegnato. È la
 * tecnica delle pagine prodotto Apple, ed è l'unica che dà davvero un
 * fotogramma per pixel.
 *
 * ── IL COSTO, E COME È CONTENUTO ───────────────────────────────────────────
 * Sono N immagini invece di un file solo. Per questo: WebP, larghezza ridotta
 * al necessario, e soprattutto NIENTE si scarica finché non ci si avvicina —
 * la sezione è in fondo a una pagina che ha già cinque scene WebGL.
 * Il capitolo non si accende finché non è arrivato tutto: mezzo smontaggio con
 * i buchi è peggio di un'attesa.
 */
/* ── DOPPIO USO (Task 6) ─────────────────────────────────────────────────────
 * Stessa disciplina di js/saucer.js (Task 5). (A) `capitoli.html` (legacy): la
 * sequenza vive dentro `#capOrologio`, pinnata e guidata dallo SCROLL via
 * ScrollTrigger — montaggio storico, invariato. (B) `atelier/effetti.html`:
 * niente sezione, niente scroll; il controller monta il canvas dentro
 * `#stage-live` e lo pilota via `WC.effects.orologio.start(container)`/`.stop()`.
 * Senza scroll da leggere, l'apertura/chiusura la guida un tween GSAP proprio
 * (stesso triangolo `tri = 1 - |2t-1|` dell'`onUpdate` originale, letto in loop
 * invece che dal progresso del pin) — l'unica differenza reale fra i due rami.
 *
 * Il corpo è racchiuso in `mountOrologio(ctx, cfg)`: `cfg.canvas` è la tela,
 * `cfg.rectEl` l'elemento da cui si misura, `cfg.section`/`cfg.pin` esistono
 * solo nel montaggio legacy, `cfg.external` distingue i due rami SOLO in coda. */
(function(){
function mountOrologio(ctx, cfg){
  var sec      = cfg.section || null;
  var pin      = cfg.pin || null;
  var canvas   = cfg.canvas;
  var external = !!cfg.external;
  var rectEl   = cfg.rectEl || pin;      // da cosa si misura la tela
  if (!canvas || !rectEl) return null;

  var says = sec ? Array.prototype.slice.call(sec.querySelectorAll('.wc-oro-say')) : [];

  /* ⚠️ QUESTI DUE NUMERI LI SCRIVE LO SCRIPT DI PACK, non si toccano a mano:
   * `scripts/pack-orologio.md` dice come si rigenerano. FRAMES deve essere il
   * numero di file davvero presenti in assets/orologio/ — se è più alto, la
   * fine della sezione chiede fotogrammi che non esistono e resta sul nero. */
  var FRAMES = 80;
  var PAD    = 3;              // orologio-001.webp
  var SRC    = function(i){
    var s = String(i + 1);
    while (s.length < PAD) s = '0' + s;
    return 'assets/orologio/orologio-' + s + '.webp';
  };

  var ctx2d = canvas.getContext('2d');
  if (!ctx2d) return null;

  /* Senza movimento non si scarica un fotogramma: resta il primo, statico, e
   * le frasi diventano una lista sotto. Un capitolo che senza movimento non
   * dice più niente sarebbe un capitolo vuoto, e un capitolo vuoto è un bug. */
  if (!ctx.motionOk) { if (sec) sec.classList.add('-static'); return null; }

  // ------------------------------------------------------------ caricamento
  var imgs = new Array(FRAMES), got = 0, ready = false, started = false;
  var cleanups = [];

  function load(){
    if (started) return;
    started = true;
    for (var i = 0; i < FRAMES; i++) (function(i){
      var im = new Image();
      im.decoding = 'async';
      im.onload = function(){
        imgs[i] = im;
        if (++got === FRAMES) { ready = true; if (sec) sec.classList.add('-ready'); draw(); }
      };
      /* Un fotogramma che non arriva non deve bloccare tutto il capitolo: si
       * conta lo stesso, e `pick()` più sotto ripiega sul più vicino che c'è. */
      im.onerror = function(){ if (++got === FRAMES) { ready = true; if (sec) sec.classList.add('-ready'); draw(); } };
      im.src = SRC(i);
    })(i);
  }

  // ------------------------------------------------------------------ resa
  var dpr = 1, W = 1, H = 1;

  function resize(){
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    var r = rectEl.getBoundingClientRect();
    W = Math.max(1, Math.round(r.width  * dpr));
    H = Math.max(1, Math.round(r.height * dpr));
    canvas.width = W; canvas.height = H;
    canvas.style.width  = r.width  + 'px';
    canvas.style.height = r.height + 'px';
    draw();
  }

  /* Il fotogramma più vicino a `i` che sia davvero arrivato. Serve solo se una
   * richiesta è fallita: a regime restituisce `i` alla prima iterazione. */
  function pick(i){
    if (imgs[i]) return imgs[i];
    for (var d = 1; d < FRAMES; d++) {
      if (imgs[i - d]) return imgs[i - d];
      if (imgs[i + d]) return imgs[i + d];
    }
    return null;
  }

  var shown = -1, want = 0;

  function draw(){
    if (!ready) return;
    var im = pick(want);
    if (!im) return;
    ctx2d.clearRect(0, 0, W, H);
    /* `contain` e non `cover`: qui il ritaglio non è un'opzione. Le colonne
     * vuote ai lati SONO la composizione — è lì che vanno le frasi — e un
     * `cover` su una finestra stretta se le mangerebbe insieme ai bordi
     * dell'orologio. Meglio del bianco in più sopra e sotto, che su fondo
     * bianco non si vede nemmeno. */
    var s = Math.min(W / im.naturalWidth, H / im.naturalHeight);
    var w = im.naturalWidth * s, h = im.naturalHeight * s;
    ctx2d.drawImage(im, (W - w) / 2, (H - h) / 2, w, h);
    shown = want;
  }

  // -------------------------------------------------------------- timeline
  var state = { t: 0 };

  /* Il triangolo, condiviso dai due rami: `t=0` orologio intero, `t=0.5`
   * completamente aperto, `t=1` di nuovo intero — stesso conto dell'`onUpdate`
   * originale, estratto perché il montaggio esterno lo pilota da un tween
   * proprio invece che dal progresso dello ScrollTrigger. */
  function applyT(){
    var tri = 1 - Math.abs(state.t * 2 - 1);
    var i = Math.round(tri * (FRAMES - 1));
    if (i < 0) i = 0; else if (i > FRAMES - 1) i = FRAMES - 1;
    if (i === want) return;
    want = i;
    if (want !== shown) draw();
  }

  var onResize = function(){ resize(); };
  window.addEventListener('resize', onResize);
  cleanups.push(function(){ window.removeEventListener('resize', onResize); });
  resize();

  /* ── MONTAGGIO ESTERNO (effetti.html) ─────────────────────────────────────
   * Nessuna sezione, nessuno ScrollTrigger: qui il tempo lo fa un tween GSAP
   * proprio invece dello scroll. `load()` parte subito (il risveglio È già il
   * «sei arrivato», come per `saucer`/Task 5); il tween resta creato ma in
   * pausa finché il controller non chiama `start()`, e VIVE fra un fuoco e
   * l'altro — `stop()` lo mette in pausa, non lo distrugge, così l'orologio
   * riprende da dove si era fermato invece di ripartire da capo. */
  if (external){
    load();
    var extTl = gsap.timeline({ repeat: -1, paused: true });
    extTl.to(state, { t: 1, duration: 7, ease: 'none', onUpdate: applyT }, 0);
    return {
      start: function(){ resize(); extTl.play(); },
      stop:  function(){ extTl.pause(); },
      resize: resize,
      dispose: function(){
        extTl.pause(); extTl.kill();
        cleanups.forEach(function(f){ f(); });
      }
    };
  }

  /* ── MONTAGGIO LEGACY (capitoli.html) — invariato ─────────────────────────*/
  var tl = gsap.timeline({
    scrollTrigger: {
      trigger: sec,
      start: 'top top',
      end: 'bottom bottom',
      pin: pin,
      /* La sezione fornisce lei la corsa con la propria altezza: con
       * pinSpacing:true se ne aggiungerebbe altrettanta sotto, cioè schermate
       * di scroll morto a smontaggio finito. Stesso schema degli altri pin. */
      pinSpacing: false,
      anticipatePin: 1,
      /* Un filo di ritardo. Senza, la posizione salta con lo scroll invece di
       * inseguirlo, e una sequenza di fotogrammi discreti a scatti secchi
       * sembra persa anche quando è esatta. */
      scrub: .35,
      invalidateOnRefresh: true,
      onRefresh: resize,
      onEnter: load, onEnterBack: load
    }
  });

  tl.to(state, { t: 1, duration: 1, ease: 'none', onUpdate: applyT }, 0);

  /* LE FRASI. Ognuna ha la sua finestra lungo la corsa, e le dissolvenze
   * stanno DENTRO la finestra: una frase che sfuma fuori tempo sfumerebbe
   * mentre un pezzo d'orologio le passa accanto.
   * Le finestre le legge dal markup (`data-in` / `data-out`, in frazioni della
   * corsa), così spostare una frase non vuol dire toccare questo file. */
  says.forEach(function(el){
    var a = parseFloat(el.getAttribute('data-in'));
    var b = parseFloat(el.getAttribute('data-out'));
    if (!isFinite(a) || !isFinite(b) || b <= a) return;
    var fade = Math.min((b - a) * .28, .05);
    tl.fromTo(el, { opacity: 0, y: 14 },
                  { opacity: 1, y: 0, duration: fade, ease: 'none' }, a);
    tl.to(el, { opacity: 0, y: -10, duration: fade, ease: 'none' }, b - fade);
  });

  /* I fotogrammi servono GIÀ PRONTI, non "in arrivo". Una schermata e mezzo di
   * margine dà al pacchetto il tempo di scendere anche a scroll veloce, e non
   * costa niente a chi non ci arriva: il trigger sta dentro la pagina, non al
   * caricamento. */
  var stPre = ScrollTrigger.create({
    trigger: sec, start: 'top bottom+=150%', end: 'bottom top-=50%',
    onEnter: load, onEnterBack: load
  });

  sec.classList.add('-live');

  return function(){
    tl.scrollTrigger && tl.scrollTrigger.kill();
    tl.kill();
    stPre.kill();
    cleanups.forEach(function(f){ f(); });
    gsap.set(says, { clearProps: 'opacity,transform' });
    sec.classList.remove('-live', '-ready');
  };
}

/* ── I DUE PADRONI ───────────────────────────────────────────────────────────
 * Legacy: si registra come sempre; se la sezione non c'è (effetti.html) l'init
 * è un no-op innocuo. Esterno: un handle recuperabile che monta la sequenza su
 * una tela creata dentro il `container` che gli passa il controller. */
WC.register('orologio', function(ctx){
  var sec    = document.getElementById('capOrologio');
  var pin    = document.getElementById('wcOroPin');
  var canvas = document.getElementById('wcOroCanvas');
  if (!sec || !pin || !canvas) return;
  return mountOrologio(ctx, { section: sec, pin: pin, canvas: canvas, external: false });
});

WC.effects = WC.effects || {};
WC.effects.orologio = (function(){
  var inst = null, host = null;
  return {
    start: function(container){
      // `#stage-live` è condiviso da più effetti pilotabili (Task 6): spostare
      // sempre l'host in coda ai figli — anche quando `inst` esiste già — lo
      // fa dipingere sopra i canvas congelati degli altri (vedi la nota
      // gemella in js/saucer.js).
      if (inst){ container.appendChild(host); inst.start(); return; }
      host = document.createElement('canvas');
      host.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block;';
      container.appendChild(host);
      var ctx = { motionOk: WC.motionOk, desktop: WC.desktop };
      inst = mountOrologio(ctx, { section: null, pin: null, canvas: host,
                                  rectEl: container, external: true });
      if (!inst){ if (host && host.parentNode) host.parentNode.removeChild(host); host = null; return; }
      inst.start();
    },
    stop:   function(){ if (inst) inst.stop(); },
    resize: function(){ if (inst) inst.resize(); }
  };
})();
})();
