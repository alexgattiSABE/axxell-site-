/* L'OFFERTA — l'ultima sezione, col fondo di vetro in loop.
 *
 * Il modulo fa una cosa sola e la fa come la sneaker: non scarica niente
 * finché non ci si avvicina, e mette in pausa quando esce di quadro. Sono
 * 1,5 MB in fondo a una pagina che ne ha già scaricati parecchi, e un loop
 * che continua a girare fuori dallo schermo tiene sveglio il decoder per
 * niente — su un portatile è batteria, su un telefono è anche calore.
 *
 * Niente scena, niente cursore, niente scroll: qui il movimento è un fondo, e
 * il capitolo è il testo. È l'ultima cosa che si legge, e l'unica sezione
 * della pagina in cui non c'è nulla da fare se non leggere.
 */
WC.register('offer', function(ctx){
  var section = document.getElementById('capOffer');
  var video   = document.getElementById('wcGlassVideo');
  if (!section || !video) return;

  // Reduced-motion: resta il poster. Un loop a tutto schermo dietro a un testo
  // è esattamente il movimento continuo che quell'impostazione chiede di non
  // avere, e qui non toglie niente — la sezione è la sua copy.
  if (!ctx.motionOk) { section.classList.add('-static'); return; }

  var loaded = false;

  function load(){
    if (loaded) return;
    loaded = true;
    var srcs = video.querySelectorAll('source[data-src]');
    for (var i = 0; i < srcs.length; i++) {
      srcs[i].src = srcs[i].getAttribute('data-src');
      srcs[i].removeAttribute('data-src');
    }
    // `preload="none"` va tolto insieme alla sorgente: con quell'attributo
    // ancora addosso il browser può decidere di non scaricare niente, e
    // `load()` non basta a fargli cambiare idea.
    video.preload = 'auto';
    video.load();
  }

  function play(){
    load();
    var p = video.play();
    if (p && p.catch) p.catch(function(){});
  }
  function pause(){ if (!video.paused) video.pause(); }

  var stPre = ScrollTrigger.create({
    trigger: section, start: 'top bottom+=60%', end: 'bottom top',
    onEnter: load, onEnterBack: load
  });
  var stPlay = ScrollTrigger.create({
    trigger: section, start: 'top bottom', end: 'bottom top',
    onToggle: function(self){ self.isActive ? play() : pause(); }
  });
  var onVis = function(){ if (document.hidden) pause(); else if (stPlay.isActive) play(); };
  document.addEventListener('visibilitychange', onVis);

  return function(){
    pause(); stPre.kill(); stPlay.kill();
    document.removeEventListener('visibilitychange', onVis);
  };
});
