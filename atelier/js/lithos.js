/* LITHOS — il faro che scopre una seconda immagine.
 *
 * Portato dalla specifica `Effetti webiste/Lithos.txt`, che descriveva un hero
 * in React 18 + Vite + Tailwind. Qui non c'è nessuna delle tre: il meccanismo
 * è riscritto in vanilla, e due cose sono cambiate di proposito.
 *
 * ── LA MASCHERA, NON UN CANVAS ─────────────────────────────────────────────
 * La specifica tiene un <canvas> nascosto, e a ogni render ci disegna dentro
 * un gradiente radiale centrato sul cursore per ricavarne la maschera. Fa il
 * suo lavoro, ma è lavoro fatto due volte: il browser sa già comporre un
 * gradiente radiale come maschera, in `mask-image`, e lo fa sulla GPU senza
 * ridisegnare niente per fotogramma. Qui si muovono DUE numeri — il centro del
 * gradiente, in due custom property — e la composizione la fa il compositore.
 * Nessun canvas, nessun `getImageData`, nessun ridisegno.
 *
 * ── LO SMORZAMENTO È QUELLO DELLA SPECIFICA ────────────────────────────────
 * `smooth += (mouse - smooth) * 0.1` a ogni fotogramma: il faro insegue il
 * cursore invece di essere incollato al puntatore. Quel ritardo è il motivo
 * per cui la cosa si legge come una lampada che sposti e non come un ritaglio.
 * L'ho tenuto identico — ma corretto per il tempo trascorso (`G.damp`), se no
 * la velocità dell'inseguimento cambia col frame rate del monitor.
 *
 * ── SENZA CURSORE ──────────────────────────────────────────────────────────
 * Su un telefono non c'è un puntatore da seguire, e un effetto che richiede il
 * mouse lì semplicemente non esiste: il faro andrebbe a fermarsi in un angolo
 * e la seconda immagine non si vedrebbe mai. Quindi quando non c'è un
 * dispositivo di puntamento fine, il faro si muove da solo su una figura di
 * Lissajous — due seni con periodi incommensurabili, che non si richiude mai
 * su sé stessa e non fa un giro riconoscibile.
 *
 * ── DOPPIO USO (Task 7) ─────────────────────────────────────────────────────
 * Il corpo (frame/place/Lissajous/pointer) è invariato: solo capo (`cfg` al
 * posto degli `id` letti da `document`) e coda (`cfg.external` biforca PRIMA
 * del montaggio legacy) sono nuovi — stesso schema di `mountSaucer`/
 * `mountOrologio`/`mountAltitude`/`mountVesper` (Task 5–6). `rectEl` è la
 * sezione in legacy, `#stage-live` nel montaggio esterno: è sia la fonte della
 * misura (Lissajous, centro iniziale) sia il nodo su cui ascoltare il
 * puntatore — nei due rami la stessa variabile, come nel resto dell'atelier. */
function mountLithos(ctx, cfg){
  var external = !!cfg.external;
  var section  = cfg.section || null;   // solo legacy: classList/ScrollTrigger
  var reveal   = cfg.reveal;
  var rectEl   = cfg.rectEl;            // section (legacy) o #stage-live (esterno)
  if (!reveal || !rectEl) return null;

  var G = WC.glsl;

  // Raggio del faro, in pixel CSS. Sotto i ~200 diventa un buco di serratura e
  // della seconda immagine non si capisce cosa sia.
  var R = 260;

  var fine = window.matchMedia && window.matchMedia('(pointer:fine)').matches;
  var auto = !fine || !ctx.motionOk;

  var tx = 0, ty = 0, sx = 0, sy = 0, has = false;
  var raf = 0, running = false, last = performance.now();

  function place(x, y){
    // Le due custom property sono l'unica cosa che cambia: il resto — la
    // maschera, le due immagini — sta fermo nel CSS.
    reveal.style.setProperty('--lx', x.toFixed(1) + 'px');
    reveal.style.setProperty('--ly', y.toFixed(1) + 'px');
  }

  function frame(){
    raf = requestAnimationFrame(frame);
    var now = performance.now();
    var dt = Math.min(0.05, (now - last) / 1000); last = now;

    if (auto) {
      var r = rectEl.getBoundingClientRect();
      var t = now / 1000;
      // Periodi non commensurabili: la figura non si richiude, quindi il
      // percorso non si riconosce come un ciclo.
      tx = r.width  * (0.5 + 0.32 * Math.sin(t * 0.23));
      ty = r.height * (0.5 + 0.26 * Math.sin(t * 0.31 + 1.1));
      has = true;
    }
    if (!has) return;

    // Lo 0.1 della specifica, reso indipendente dal frame rate.
    var k = G.damp(0.10, dt);
    sx += (tx - sx) * k;
    sy += (ty - sy) * k;
    place(sx, sy);
  }

  function start(){ if (running || document.hidden) return; running = true; last = performance.now(); raf = requestAnimationFrame(frame); }
  function stop(){ if (!running) return; running = false; cancelAnimationFrame(raf); }

  var onMove = function(e){
    if (auto) return;
    var r = rectEl.getBoundingClientRect();
    tx = e.clientX - r.left;
    ty = e.clientY - r.top;
    if (!has) {                 // primo movimento: niente scivolata dall'angolo
      sx = tx; sy = ty; has = true;
    }
  };

  // Il faro parte dal centro, se no la prima cosa che si vede è la seconda
  // immagine incollata nell'angolo in alto a sinistra.
  (function(){
    var r = rectEl.getBoundingClientRect();
    sx = tx = r.width / 2; sy = ty = r.height / 2;
    place(sx, sy);
  })();

  /* ── MONTAGGIO ESTERNO (effetti.html) ─────────────────────────────────────
   * Nessuna sezione, nessuno ScrollTrigger: il faro è sveglio/congelato a
   * comando del controller. `--lr` va sul `reveal` stesso (non su un
   * antenato): la `mask-image` che lo legge sta sullo stesso elemento, quindi
   * risolve la custom property anche senza cascata da una sezione. Il
   * puntatore si ascolta SOLO fra uno `start()` e uno `stop()` — "gestisce il
   * puntatore solo quando è a fuoco" del brief — non sempre come in legacy
   * (lì la sezione esiste comunque solo mentre è nel viewport). */
  if (external){
    reveal.style.setProperty('--lr', R + 'px');
    var wantRun = false;
    var onVisE = function(){ if (document.hidden) stop(); else if (wantRun) start(); };
    document.addEventListener('visibilitychange', onVisE);
    return {
      start: function(){
        wantRun = true;
        if (!auto) rectEl.addEventListener('mousemove', onMove);
        start();
      },
      stop: function(){
        wantRun = false;
        if (!auto) rectEl.removeEventListener('mousemove', onMove);
        stop();
      },
      // Nessuna misura in cache da ricalcolare: la rect si legge live a ogni
      // fotogramma (Lissajous) o a ogni evento (puntatore). Esposto per
      // simmetria con gli altri handle — il controller lo chiama solo se c'è.
      resize: function(){},
      dispose: function(){
        stop();
        document.removeEventListener('visibilitychange', onVisE);
        if (!auto) rectEl.removeEventListener('mousemove', onMove);
      }
    };
  }

  /* ── MONTAGGIO LEGACY (capitoli.html) — invariato ─────────────────────────*/
  section.classList.add('-live');
  section.style.setProperty('--lr', R + 'px');

  var st = ScrollTrigger.create({
    trigger: section, start: 'top bottom', end: 'bottom top',
    onToggle: function(self){ self.isActive ? start() : stop(); }
  });

  var onVis = function(){ if (document.hidden) stop(); else if (st.isActive) start(); };
  if (!auto) section.addEventListener('mousemove', onMove);
  document.addEventListener('visibilitychange', onVis);

  return function(){
    stop();
    st.kill();
    section.removeEventListener('mousemove', onMove);
    document.removeEventListener('visibilitychange', onVis);
    section.classList.remove('-live');
  };
}

/* ── I DUE PADRONI ───────────────────────────────────────────────────────────
 * Legacy: si registra come sempre; se la sezione non c'è (effetti.html) l'init
 * è un no-op innocuo. Esterno: un handle recuperabile che monta le due
 * fotografie (base + rivelata, mascherata) dentro il `container` che gli passa
 * il controller — niente CSS esterno da caricare, gli stili sono inline
 * perché `effetti.html` non importa `css/sections.css`. */
WC.register('lithos', function(ctx){
  var section = document.getElementById('capLithos');
  var reveal  = document.getElementById('wcLithosReveal');
  if (!section || !reveal) return;
  return mountLithos(ctx, { section: section, reveal: reveal, rectEl: section, external: false });
});

WC.effects = WC.effects || {};
/* Vedi la nota gemella in js/saucer.js (Task 6, §4): `container.appendChild(host)`
 * a OGNI `start()`, anche quando `inst` esiste già, sposta l'host in coda ai
 * figli di `#stage-live` — l'ultimo effetto risvegliato dipinge sempre sopra i
 * fermi-immagine congelati degli altri. */
WC.effects.lithos = (function(){
  var inst = null, host = null, reveal = null;
  return {
    start: function(container){
      if (inst){ container.appendChild(host); inst.start(); return; }
      host = document.createElement('div');
      host.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;overflow:hidden;pointer-events:auto;';
      var base = document.createElement('div');
      base.style.cssText = 'position:absolute;inset:0;background-position:center;background-size:cover;'
        + 'background-repeat:no-repeat;filter:brightness(1.42) contrast(1.04);'
        + 'background-image:url(assets/lithos0.webp);';
      reveal = document.createElement('div');
      reveal.style.cssText = 'position:absolute;inset:0;background-position:center;background-size:cover;'
        + 'background-repeat:no-repeat;filter:brightness(1.42) contrast(1.04);'
        + 'background-image:url(assets/lithos1.webp);--lx:50%;--ly:50%;--lr:260px;'
        + '-webkit-mask-image:radial-gradient(circle var(--lr) at var(--lx) var(--ly),'
        + '#000 0%,#000 42%,rgba(0,0,0,.55) 70%,transparent 100%);'
        + 'mask-image:radial-gradient(circle var(--lr) at var(--lx) var(--ly),'
        + '#000 0%,#000 42%,rgba(0,0,0,.55) 70%,transparent 100%);';
      host.appendChild(base); host.appendChild(reveal);
      container.appendChild(host);
      var ctx = { motionOk: WC.motionOk, desktop: WC.desktop };
      inst = mountLithos(ctx, { section: null, reveal: reveal, rectEl: container, external: true });
      if (!inst){ if (host && host.parentNode) host.parentNode.removeChild(host); host = null; return; }
      inst.start();
    },
    stop:   function(){ if (inst) inst.stop(); },
    resize: function(){ if (inst) inst.resize(); }
  };
})();
