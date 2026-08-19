/* IL SIPARIO — il marchio si CONDENSA dal vapore.
 *
 * Un'onda attraversa lo schermo da sinistra a destra. Davanti a lei non c'è
 * niente; sotto di lei una nebbia di particelle; dietro di lei il marchio, fermo
 * e pieno. Non è il logo che evapora: è il vapore che diventa logo.
 *
 * ── È IL ROVESCIO DELL'EFFETTO SORGENTE ────────────────────────────────────
 * L'originale (vapour text effect, React) fa il contrario: parte dal testo
 * pieno e lo disperde. Il meccanismo però è lo stesso, e sta tutto nel segno di
 * un'interpolazione — si campiona una volta la forma finale, e ogni particella
 * viaggia fra "dispersa" e "al suo posto". Disperdere vuol dire andare da 1 a
 * 0; condensare vuol dire andare da 0 a 1. Qui si va da 0 a 1.
 *
 * ── PERCHÉ NON C'È PIÙ IL LOTTIE ───────────────────────────────────────────
 * Il loader mostrava un logo animato in Lottie e un contatore 00→100. Il logo
 * era un disegno che SOMIGLIAVA al marchio; adesso c'è il marchio, gli stessi
 * dieci tracciati che stanno in nav e nel footer (`#wcAxxellMark`, in cima al
 * <body>). Il contatore è sparito con lui: la richiesta era "solo il logo".
 * Un JSON in meno da scaricare, e su questa pagina Lottie non serve più
 * affatto — resta solo su parliamone.html, per la spunta di conferma.
 *
 * ── PERCHÉ SI PASSA PER UN'IMMAGINE E NON SI DISEGNANO I TRACCIATI ─────────
 * Servono i PIXEL, non le curve: ogni particella nasce da un pixel d'inchiostro
 * del marchio, e per sapere dove sta l'inchiostro bisogna prima rasterizzarlo.
 * I tracciati vengono serializzati in un SVG con data-URL e disegnati una volta
 * sola su un canvas di servizio; da lì `getImageData` dà la mappa. Il data-URL
 * è same-origin, quindi il canvas non si sporca e la lettura è lecita.
 *
 * ── PERCHÉ ImageData E NON fillRect ────────────────────────────────────────
 * Sono ~15.000 particelle a fotogramma. Con `fillRect` bisognerebbe cambiare
 * `fillStyle` per ognuna — quindicimila cambi di stato del contesto per frame,
 * ed è lì che il costo esplode. Qui si scrive direttamente nel buffer a 32 bit
 * e si fa UN solo `putImageData`: nessun cambio di stato, e la fusione fra
 * particelle sovrapposte la si somma a mano, che è quello che serve alla
 * nebbia.
 */
WC.register('loader', function(ctx){
  var root   = document.getElementById('wcLoader');
  var canvas = document.getElementById('wcLoaderVapour');
  if (!root) return;

  function finish(){
    root.classList.add('done');
    root.style.display = 'none';
    document.body.classList.remove('wc-locked');
    if (WC.lenis) WC.lenis.start();
    /* Il sipario si alza sul primo capitolo, quindi il cursore torna a essere
     * QUELLO CHE IL PRIMO CAPITOLO DICHIARA — non un 'default' scritto qui. */
    var first = document.querySelector('[data-cursor]');
    if (WC.setCursor) WC.setCursor((first && first.dataset.cursor) || 'hidden');
    WC.loaded = true;
    document.dispatchEvent(new CustomEvent('wc:loaded'));
  }

  // Reduced-motion: nessun teatro, la pagina è subito lì.
  if (!ctx.motionOk || !canvas) { finish(); return; }

  var mark = document.getElementById('wcAxxellMark');
  if (!mark) { finish(); return; }

  document.body.classList.add('wc-locked');
  if (WC.setCursor) WC.setCursor('hidden');
  // Lenis va fermato: overflow:hidden sul body non lo blocca, continuerebbe
  // a scorrere dietro al sipario.
  if (WC.lenis) WC.lenis.stop();

  var tl = null, raf = 0, dead = false;

  // ---------------------------------------------------------------- misure
  // Il viewBox del marchio, lo stesso di nav e footer.
  var VB = { x: 28, y: 104, w: 598, h: 154 };
  var cssW = Math.min(window.innerWidth * 0.7, 620);
  var cssH = cssW * VB.h / VB.w;
  // Oltre 2 non si guadagna niente di visibile e si quadruplica il conto delle
  // particelle: questo è un sipario, dura due secondi e deve partire subito.
  var dpr  = Math.min(window.devicePixelRatio || 1, 2);
  var W    = Math.round(cssW * dpr), H = Math.round(cssH * dpr);

  canvas.style.width  = cssW + 'px';
  canvas.style.height = cssH + 'px';
  canvas.width = W; canvas.height = H;
  var ctx2d = canvas.getContext('2d');
  if (!ctx2d) { finish(); return; }

  // ------------------------------------------------------ il marchio in pixel
  var svgText =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="' +
    VB.x + ' ' + VB.y + ' ' + VB.w + ' ' + VB.h + '" width="' + W + '" height="' + H + '">' +
    '<g fill="#f0f0f6">' + mark.innerHTML + '</g></svg>';

  var img = new Image();

  /* Se la rasterizzazione non riesce — SVG malformato, immagine che non carica,
   * canvas sporcato da una policy — NON si resta chiusi dietro al sipario: si
   * alza comunque. Un loader che non finisce è una pagina che non esiste. */
  img.onerror = function(){ if (!dead) finish(); };

  img.onload = function(){
    if (dead) return;
    var ink;
    try {
      ctx2d.drawImage(img, 0, 0, W, H);
      ink = ctx2d.getImageData(0, 0, W, H).data;
    } catch (err) { finish(); return; }
    ctx2d.clearRect(0, 0, W, H);
    build(ink);
  };
  img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svgText);

  // ------------------------------------------------------------- particelle
  var N = 0, ox, oy, sx, sy, oa, ph;
  var frame = null, buf32 = null;

  /* Quanto è larga la fascia in cui una particella vive, in frazioni della
   * larghezza del marchio. Troppo stretta e il fronte è una riga che spazza;
   * troppo larga e non si legge più un'onda ma una dissolvenza generale. */
  var SPREAD = 0.34;

  function build(ink){
    // Un pixel sì e uno no: a dpr 2 la densità resta quella di uno schermo
    // normale, e il conto delle particelle si divide per quattro.
    var STEP = 2;
    var idx = [];
    for (var y = 0; y < H; y += STEP) {
      for (var x = 0; x < W; x += STEP) {
        var a = ink[(y * W + x) * 4 + 3];
        if (a > 24) idx.push(x, y, a);
      }
    }
    N  = idx.length / 3;
    if (!N) { finish(); return; }

    ox = new Float32Array(N); oy = new Float32Array(N);
    sx = new Float32Array(N); sy = new Float32Array(N);
    oa = new Float32Array(N); ph = new Float32Array(N);

    // Quanto lontano nasce una particella dal proprio posto.
    var SC = Math.max(18, H * 0.55);

    for (var i = 0; i < N; i++) {
      var X = idx[i*3], Y = idx[i*3+1];
      ox[i] = X; oy[i] = Y; oa[i] = idx[i*3+2] / 255;
      /* Il vapore nasce IN ALTO e un po' indietro, e scende al suo posto: è
       * quello che si legge come condensa. Se nascesse in tutte le direzioni
       * sarebbe un'esplosione al contrario, che è un'altra cosa. */
      var r = Math.random();
      sx[i] = X - r * SC * 0.85 + (Math.random() - 0.5) * SC * 0.5;
      sy[i] = Y - Math.random() * SC * 1.15;
      ph[i] = Math.random() * 6.28318;          // sfasamento del tremolio
    }

    frame = ctx2d.createImageData(W, H);
    buf32 = new Uint32Array(frame.data.buffer);

    var state = { w: 0 };
    tl = gsap.timeline({ onComplete: finish });
    /* L'onda parte dal bordo sinistro del marchio e arriva a SPREAD oltre il
     * destro: l'eccedenza serve perché anche l'ultima particella abbia il suo
     * tratto intero per condensarsi, invece di posarsi di scatto sul finale. */
    tl.to(state, { w: 1, duration: 2.2, ease: 'power1.inOut',
                   onUpdate: function(){ wave = state.w * (1 + SPREAD); } })
      .to('.wc-loader-inner', { opacity: 0, duration: .4, ease: 'power2.in' }, '+=0.35')
      .to('.wc-curtain-t', { yPercent: -100, duration: .9, ease: 'expo.inOut' }, '<')
      .to('.wc-curtain-b', { yPercent:  100, duration: .9, ease: 'expo.inOut' }, '<');

    raf = requestAnimationFrame(draw);
  }

  // ------------------------------------------------------------------ resa
  var wave = 0;

  function smooth(a, b, v){
    var t = (v - a) / (b - a);
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    return t * t * (3 - 2 * t);
  }

  function draw(){
    raf = requestAnimationFrame(draw);
    if (!frame) return;
    buf32.fill(0);
    var t = performance.now() * 0.001;

    for (var i = 0; i < N; i++) {
      /* Dove sta questa particella lungo l'onda. 0 = il fronte la sta appena
       * toccando, 1 = il fronte è passato oltre di SPREAD e lei si è posata.
       * ⚠️ IL SEGNO CONTA. Con `(wave - nx + SPREAD)` la particella risultava
       * GIÀ posata nel momento in cui il fronte la raggiungeva: le lettere si
       * formavano davanti all'onda invece che dietro, cioè il contrario di
       * quello che deve leggersi. */
      var u = (wave - ox[i] / W) / SPREAD;
      if (u <= 0) continue;                       // davanti al fronte: niente
      if (u > 1) u = 1;

      // `settle` porta la particella al suo posto e le dà l'opacità piena;
      // `veil` è la nebbia che la precede — c'è solo finché non si è posata.
      var settle = smooth(0.34, 1.0, u);
      var veil   = smooth(0.0, 0.20, u) * (1 - settle);

      var k = settle;
      var px = sx[i] + (ox[i] - sx[i]) * k;
      var py = sy[i] + (oy[i] - sy[i]) * k;

      /* Il tremolio esiste SOLO mentre la particella è ancora vapore: si
       * spegne con `1 - settle`. Se restasse, il marchio finito vibrerebbe, e
       * un marchio che vibra non è un marchio. */
      var wob = (1 - settle) * 6;
      px += Math.sin(t * 2.1 + ph[i]) * wob;
      py += Math.cos(t * 1.7 + ph[i] * 1.3) * wob * 0.7;

      var alpha = oa[i] * (settle + veil * 0.55);
      if (alpha <= 0.004) continue;

      var X = px | 0, Y = py | 0;
      if (X < 0 || Y < 0 || X >= W || Y >= H) continue;

      var o = Y * W + X;
      // Somma sul canale alfa, tinta fissa: le particelle sovrapposte si
      // addensano invece di sostituirsi, ed è così che la nebbia sembra nebbia.
      var prev = (buf32[o] >>> 24) / 255;
      var acc  = prev + alpha;
      if (acc > 1) acc = 1;
      // little-endian: 0xAABBGGRR — #f0f0f6
      buf32[o] = ((acc * 255) << 24) | (246 << 16) | (240 << 8) | 240;
    }

    ctx2d.putImageData(frame, 0, 0);
  }

  return function(){
    dead = true;
    cancelAnimationFrame(raf); raf = 0;
    if (tl) tl.kill();
    img.onload = img.onerror = null;
    document.body.classList.remove('wc-locked');
    if (WC.lenis) WC.lenis.start();
  };
});
