WC.register('manifesto', function(ctx){
  var el = document.getElementById('wcManifesto');
  if (!el) return;
  var items = WC.splitWords(el);

  // Reduced-motion: testo pieno, nessuno scrub.
  if (!ctx.motionOk) {
    gsap.set(items, { color: '#f0f0f6' });
    return;
  }

  /* Il riferimento è la SEZIONE, non il paragrafo, e comincia quando comincia
   * il pin (`top top`).
   *
   * Prima era `trigger: el` con `top 75%` → `bottom 55%`: misure prese sulla
   * posizione del testo nel flusso. Da quando il capitolo è pinnato (js/dna.js)
   * quella posizione si congela appena il pin scatta, e tutto lo scrub finiva
   * PRIMA che la sezione si fermasse: arrivavi sul capitolo e il testo era già
   * tutto bianco. Visto a schermo.
   *
   * `+=100%` è una schermata di scroll: su 160svh di corsa, il testo finisce di
   * accendersi a circa due terzi, e l'ultimo terzo resta all'elica. */
  var tl = gsap.timeline({
    scrollTrigger: {
      trigger: '#cap02',
      start: 'top top',
      end: '+=100%',
      scrub: .6
    }
  });
  tl.to(items, { color: '#f0f0f6', stagger: .35, ease: 'none' });

  return function(){ tl.scrollTrigger && tl.scrollTrigger.kill(); tl.kill(); };
});
