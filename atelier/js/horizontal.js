WC.register('horizontal', function(ctx){
  var sec = document.getElementById('cap07');
  var pin = document.getElementById('wcProcessPin');
  var row = document.getElementById('wcProcessRow');
  var bar = document.getElementById('wcProgressBar');
  if (!sec || !pin || !row) return;

  // Mobile o reduced-motion: colonna verticale, nessun pin.
  //
  // La classe serve: sotto i 900px ci pensa la media query, ma con
  // reduced-motion su viewport larga quella non scatta e la sezione
  // resterebbe alta 340svh senza niente che scorra — due schermate e mezzo
  // di vuoto. È il caso che il piano chiama «un capitolo vuoto è un bug».
  if (!ctx.motionOk || !ctx.desktop) {
    sec.classList.add('-static');
    if (bar) bar.style.width = '100%';
    return;
  }

  var distance = 0;
  function measure(){ distance = Math.max(0, row.scrollWidth - pin.clientWidth + 64); }
  measure();

  var tween = gsap.to(row, {
    x: function(){ return -distance; },
    ease: 'none',
    scrollTrigger: {
      trigger: sec,
      start: 'top top',
      end: 'bottom bottom',
      pin: pin,
      // Il piano lo lasciava al default (true). Sbagliato per questo schema:
      // la sezione è già alta 340svh apposta per fornire lei la corsa, e
      // pinSpacing:true ne aggiungerebbe altrettanta sotto — 240svh di
      // scroll morto dopo che i quattro passi sono finiti. Gli altri tre pin
      // della pagina (cap. 01, 03, 06) usano lo stesso schema.
      pinSpacing: false,
      anticipatePin: 1,
      scrub: .4,
      invalidateOnRefresh: true,
      onRefresh: measure,
      onUpdate: function(self){
        if (bar) bar.style.width = (self.progress * 100).toFixed(1) + '%';
      }
    }
  });

  return function(){
    tween.scrollTrigger && tween.scrollTrigger.kill();
    tween.kill();
    gsap.set(row, { x: 0 });
  };
});
