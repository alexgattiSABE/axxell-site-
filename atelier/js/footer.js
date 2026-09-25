/* AXXELL nel footer — la parola che si accende sotto il cursore.
 *
 * Portato da un componente React (motion/react + Tailwind) a vanilla: la
 * costruzione a tre contorni sovrapposti è la sua, cambia tutto il resto.
 * Nessuna libreria: il movimento è una molla scritta a mano su due numeri.
 *
 * ── PERCHÉ LA MASCHERA E NON UN GRADIENTE CHE SEGUE ────────────────────────
 * Il gradiente colorato copre TUTTA la parola, sempre, e non si muove mai. A
 * muoversi è la maschera: un cerchio bianco su nero centrato sul puntatore,
 * che decide quanta di quella parola si vede. È il motivo per cui i colori
 * restano fermi mentre la luce scorre — se a seguire il cursore fosse il
 * gradiente, le tinte scivolerebbero con lui e sembrerebbe una torcia
 * colorata invece di una parola che ne ha uno dentro.
 *
 * ── PERCHÉ TUTTO IN CONTORNO ───────────────────────────────────────────────
 * Nessuno dei tre testi è riempito. Un carattere pieno di 60 px di altezza
 * mangerebbe il gradiente: resterebbe una macchia di colore a forma di
 * lettera. In contorno il colore corre lungo un filo, e quel filo si legge.
 *
 * ── IL DISEGNO, UNA VOLTA SOLA ─────────────────────────────────────────────
 * Il secondo contorno si scrive da sé quando il footer entra in quadro, con
 * `stroke-dashoffset` che va a zero. È l'unica animazione a tempo di questa
 * pagina che non dipende dallo scroll — dura quattro secondi e non si ripete:
 * è una firma, e una firma si scrive una volta.
 */
WC.register('footer', function(ctx){
  var host = document.getElementById('wcFooterWord');
  if (!host) return;
  var svg = host.querySelector('svg');
  var mask = host.querySelector('#wcFootReveal');
  if (!svg || !mask) return;

  // Il disegno del contorno: parte quando il footer entra, e basta.
  var draw = host.querySelector('.-draw');
  var stDraw = ScrollTrigger.create({
    trigger: host, start: 'top 92%', once: true,
    onEnter: function(){ host.classList.add('-drawn'); }
  });
  // Con reduced-motion il contorno è già scritto: niente da animare, e la
  // parola si legge lo stesso.
  if (!ctx.motionOk) { host.classList.add('-drawn', '-still'); return; }

  /* La maschera insegue il puntatore con una molla, non lo insegue e basta.
   * Un inseguimento diretto incolla il cerchio di luce al dito e la parola
   * sembra un ritaglio; con un filo di ritardo la luce arriva DOPO, e si
   * legge come una cosa che si accende invece che come una finestra. */
  // Le unità del viewBox, ritagliato sul disegno del marchio.
  var VX = 28, VY = 104, W = 598, H = 154;
  var tx = VX + W / 2, ty = VY + H / 2;   // dove vuole andare
  var cx = tx, cy = ty;                   // dove sta
  var over = false, raf = 0, running = false;

  function onMove(e){
    var r = svg.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) return;
    // Il viewBox è `meet`: l'SVG sta dentro il riquadro conservando il
    // rapporto, quindi in generale c'è del vuoto su due lati e le coordinate
    // dello schermo NON si mappano linearmente sul riquadro. Si ricava la
    // scala effettiva e si toglie il margine, se no la luce è sfalsata
    // rispetto al dito su qualunque finestra che non sia 3:1.
    var s = Math.min(r.width / W, r.height / H);
    var offX = (r.width  - W * s) / 2;
    var offY = (r.height - H * s) / 2;
    tx = VX + (e.clientX - r.left - offX) / s;
    ty = VY + (e.clientY - r.top  - offY) / s;
  }
  function onEnter(){ over = true; host.classList.add('-hot'); start(); }
  function onLeave(){ over = false; host.classList.remove('-hot'); }

  function loop(){
    raf = requestAnimationFrame(loop);
    cx += (tx - cx) * 0.16;
    cy += (ty - cy) * 0.16;
    mask.setAttribute('cx', cx.toFixed(2));
    mask.setAttribute('cy', cy.toFixed(2));
    // Fermarsi quando non c'è più niente da inseguire: il footer sta in fondo
    // a una pagina che ha cinque scene WebGL, e un rAF acceso per sempre per
    // due numeri è sprecato.
    if (!over && Math.abs(tx - cx) < 0.05 && Math.abs(ty - cy) < 0.05) stop();
  }
  function start(){ if (running) return; running = true; raf = requestAnimationFrame(loop); }
  function stop(){ if (!running) return; running = false; cancelAnimationFrame(raf); }

  host.addEventListener('mousemove', onMove, { passive: true });
  host.addEventListener('mouseenter', onEnter, { passive: true });
  host.addEventListener('mouseleave', onLeave, { passive: true });

  return function(){
    stop(); stDraw.kill();
    host.removeEventListener('mousemove', onMove);
    host.removeEventListener('mouseenter', onEnter);
    host.removeEventListener('mouseleave', onLeave);
  };
});
