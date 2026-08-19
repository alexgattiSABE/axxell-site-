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
 */
WC.register('lithos', function(ctx){
  var section = document.getElementById('capLithos');
  var reveal  = document.getElementById('wcLithosReveal');
  if (!section || !reveal) return;

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
      var r = section.getBoundingClientRect();
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
    var r = section.getBoundingClientRect();
    tx = e.clientX - r.left;
    ty = e.clientY - r.top;
    if (!has) {                 // primo movimento: niente scivolata dall'angolo
      sx = tx; sy = ty; has = true;
    }
  };

  // Il faro parte dal centro, se no la prima cosa che si vede è la seconda
  // immagine incollata nell'angolo in alto a sinistra.
  (function(){
    var r = section.getBoundingClientRect();
    sx = tx = r.width / 2; sy = ty = r.height / 2;
    place(sx, sy);
  })();

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
});
