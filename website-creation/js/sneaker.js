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
