/* SNEAKER — sfondo video in loop, caricato solo quando serve.
 *
 * Il sorgente è il master di GetLayers: 2892×2160, 30 fps, 14,1 s, 42,35 MB a
 * 24 Mbps, con una traccia audio. Ricompresso a 1080p in due formati — vedi
 * `scripts/pack-sneaker.md` — per 1,6 MB, cioè il 96% in meno.
 *
 * ── PERCHÉ NON C'È L'AUDIO ─────────────────────────────────────────────────
 * Tolto a monte, non silenziato qui. Uno sfondo in loop non ha niente da far
 * sentire, e un video con traccia audio i browser non lo riproducono da soli:
 * l'autoplay senza gesto dell'utente è permesso solo se il video è muto. Un
 * `muted` sull'elemento sarebbe bastato a farlo partire, ma quei chilobyte
 * sarebbero comunque scesi lungo la rete di chi guarda.
 *
 * ── PERCHÉ NON PARTE DA SUBITO ─────────────────────────────────────────────
 * `preload="none"`: finché non ci si avvicina, di questa sezione non scende
 * nemmeno un byte. Sono 1,6 MB in fondo a una pagina che ha già quattro scene
 * WebGL e due modelli 3D — pagarli all'apertura vorrebbe dire rubare banda a
 * tutto quello che sta prima. Al loro posto c'è il poster, 83 KB.
 *
 * ── E PERCHÉ SI FERMA ──────────────────────────────────────────────────────
 * Un video che continua a girare fuori dallo schermo tiene sveglio il decoder
 * hardware per niente: su un portatile è batteria, su un telefono è anche
 * calore. Esce dal viewport o cambi scheda, si mette in pausa.
 */
WC.register('sneaker', function(ctx){
  var section = document.getElementById('capSneaker');
  var video   = document.getElementById('wcSneakerVideo');
  if (!section || !video) return;

  var loaded = false;

  // Con reduced-motion resta il poster e basta. Un loop di 14 secondi a tutto
  // schermo è esattamente il tipo di movimento continuo che quell'impostazione
  // chiede di non avere.
  if (!ctx.motionOk) {
    section.classList.add('-static');
    return;
  }

  function load(){
    if (loaded) return;
    loaded = true;
    // I <source> nascono come data-src: senza, il browser comincerebbe a
    // scaricare appena incontra il tag, e `preload="none"` non lo fermerebbe
    // — quell'attributo governa il buffering, non la scelta della sorgente.
    var srcs = video.querySelectorAll('source[data-src]');
    for (var i = 0; i < srcs.length; i++) {
      srcs[i].src = srcs[i].getAttribute('data-src');
      srcs[i].removeAttribute('data-src');
    }
    video.load();
  }

  function play(){
    load();
    // `play()` torna una promise che viene rifiutata se il browser decide di
    // non far partire l'autoplay. Senza il catch è un errore non gestito in
    // console a ogni visita su un browser restrittivo.
    var p = video.play();
    if (p && p.catch) p.catch(function(){});
  }
  function pause(){ if (!video.paused) video.pause(); }

  // Un margine di mezza schermata: il video ha il tempo di aprire il buffer
  // prima di entrare in scena, invece di partire nero e riempirsi dopo.
  var stPre = ScrollTrigger.create({
    trigger: section, start: 'top bottom+=50%', end: 'bottom top-=50%',
    onEnter: load, onEnterBack: load
  });
  var stPlay = ScrollTrigger.create({
    trigger: section, start: 'top bottom', end: 'bottom top',
    onToggle: function(self){ self.isActive ? play() : pause(); }
  });

  var onVis = function(){ if (document.hidden) pause(); else if (stPlay.isActive) play(); };
  document.addEventListener('visibilitychange', onVis);

  section.classList.add('-live');

  return function(){
    pause();
    stPre.kill(); stPlay.kill();
    document.removeEventListener('visibilitychange', onVis);
    section.classList.remove('-live');
  };
});

/* ── MONTAGGIO ESTERNO (capitoli.html, «Gravità») ──────────────────────────
 * Nella pagina degli effetti la sezione non c'è e nessuno ScrollTrigger la
 * guarda: senza questo handle la card restava per sempre sul poster. Stesso
 * schema degli altri (vedi js/lithos.js): l'host si crea una volta, a ogni
 * `start()` torna in coda ai figli del contenitore, `stop()` mette solo in
 * pausa. `muted`/`playsInline` PRIMA della sorgente, se no Safari rifiuta
 * l'autoplay.
 *
 * SUL TELEFONO (2026-09-24, «una parte del video non si vede»):
 *  · L'INQUADRATURA. Il video e' 4:3 (1446×1080) e la scarpa vola nel quinto
 *    alto del fotogramma, col laccetto a ~5% dal bordo. La card e' piu' larga
 *    (~16:10), e il `cover` centrato tagliava l'8% sopra: il laccetto e la
 *    punta della scarpa uscivano dal quadro. Ora: card piu' larga del video →
 *    `cover` agganciato in ALTO (si perde solo un pezzo di rocce in basso);
 *    card piu' stretta → `contain`, con il fondo dello stesso quasi-nero del
 *    video (#020202) cosi' le bande non si vedono.
 *  · LA SORGENTE. mp4 PRIMA, con il codec dichiarato: Safari su iPhone
 *    decodifica l'H.264 in hardware, mentre il WebM VP9 su iOS c'e' solo
 *    dalle versioni recenti e non ovunque in hardware. Chi l'H.264 non ce
 *    l'ha (Chromium headless della verifica) legge il codec, dice "no" e
 *    passa al WebM.
 *  · L'AUTOPLAY che iOS nega (Risparmio energetico) si riprova al primo
 *    tocco: dentro un gesto `play()` e' sempre permesso. */
WC.effects = WC.effects || {};
WC.effects.sneaker = (function(){
  var host = null, vid = null, vivo = false;
  var VA = 1446 / 1080;               // proporzioni del video, note in anticipo
  function play(){ var p = vid.play(); if (p && p.catch) p.catch(function(){}); }
  function suGesto(){ if (vid && vivo && vid.paused && WC.motionOk) play(); }
  function inquadra(){
    if (!host) return;
    var w = host.clientWidth, h = host.clientHeight;
    if (w < 2 || h < 2) return;
    var ra = vid.videoWidth && vid.videoHeight ? vid.videoWidth / vid.videoHeight : VA;
    if (w / h >= ra){ vid.style.objectFit = 'cover';   vid.style.objectPosition = '50% 0%'; }
    else            { vid.style.objectFit = 'contain'; vid.style.objectPosition = '50% 50%'; }
  }
  return {
    start: function(container){
      vivo = true;
      if (!host){
        host = document.createElement('div');
        host.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;overflow:hidden;background:#020202;';
        vid = document.createElement('video');
        vid.muted = true; vid.loop = true; vid.playsInline = true;
        vid.setAttribute('muted', ''); vid.setAttribute('playsinline', '');
        vid.preload = 'auto'; vid.poster = 'assets/sneaker-poster.webp';
        vid.setAttribute('aria-hidden', 'true');
        vid.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;object-fit:cover;object-position:50% 0%;';
        var s1 = document.createElement('source'); s1.type = 'video/mp4; codecs="avc1.640028"'; s1.src = 'assets/sneaker.mp4';
        var s2 = document.createElement('source'); s2.type = 'video/webm; codecs="vp9"';        s2.src = 'assets/sneaker.webm';
        vid.appendChild(s1); vid.appendChild(s2);
        vid.addEventListener('loadedmetadata', inquadra);
        host.appendChild(vid);
        host.addEventListener('touchend', suGesto, { passive: true });
        host.addEventListener('click', suGesto);
      }
      container.appendChild(host);
      inquadra();
      if (!WC.motionOk) return;
      play();
    },
    stop:   function(){ vivo = false; if (vid && !vid.paused) vid.pause(); },
    resize: function(){ inquadra(); }
  };
})();
