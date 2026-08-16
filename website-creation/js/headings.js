/* Titoli di sezione — entrano una riga alla volta.
 *
 * Prima di questo modulo gli h2 comparivano già scritti: dodici capitoli con
 * scene 3D allo scroll e la copy ferma in mezzo. Il taglio è per *riga* e non
 * per parola perché è la riga l'unità di lettura di un titolo — e perché dove
 * il browser mandi a capo lo sa solo il browser: cambia con la larghezza della
 * finestra, con il font quando finisce di caricare, con la lingua. È l'unico
 * taglio che a mano non si fa, ed è la ragione per cui qui serve SplitText e
 * altrove basta WC.splitWords.
 *
 * `autoSplit` ritaglia a ogni ricalcolo di riga; `onSplit` ricrea l'animazione
 * sulle righe nuove, che sono nodi diversi dai precedenti.
 *
 * ESCLUSI, di proposito:
 *   - cap. 01: la copy dell'hero non entra, *vola* nel tunnel (tunnel.js), e
 *     scrive lei transform e opacity a ogni frame.
 *   - .wc-warp-copy: le tre copy del cap. 02 hanno l'opacità guidata dal morph
 *     delle particelle (warp.js). Due sistemi sullo stesso nodo si
 *     sovrascrivono a vicenda e vince l'ultimo che ha scritto.
 */
WC.register('headings', function(ctx){
  // Senza il plugin il sito resta come prima: i titoli si leggono comunque.
  if (typeof SplitText === 'undefined') return;

  var heads = Array.prototype.slice.call(document.querySelectorAll('section h2'))
    .filter(function(h){
      return !h.closest('#cap01') && !h.closest('.wc-warp-copy');
    });
  if (!heads.length) return;

  // Reduced-motion: nessuno split. Il titolo non va toccato affatto — spezzarlo
  // e rimetterlo a posto lascia comunque wrapper in mezzo al testo, che i
  // lettori di schermo attraversano.
  if (!ctx.motionOk) return;

  var splits = [];

  heads.forEach(function(h){
    // Una volta che il titolo è entrato resta entrato: al ritaglio successivo
    // (resize, font caricato) le righe nuove vanno messe a posto, non rianimate.
    var shown = false;

    var split = new SplitText(h, {
      type: 'lines',
      mask: 'lines',          // wrapper con overflow:clip — la riga sale da dietro
      // Senza trattino di proposito: SplitText costruisce il nome della classe
      // della maschera con `className.replace(/(\b\w+\b)/g, '$1-mask')`, e il
      // trattino spezza la parola — da "wc-line" esce "wc-mask-line-mask".
      // Da "wcline" esce "wcline-mask", che è il nome usato nel CSS.
      linesClass: 'wcline',
      autoSplit: true,
      onSplit: function(self){
        if (shown) { gsap.set(self.lines, { yPercent: 0 }); return; }
        return gsap.from(self.lines, {
          yPercent: 110,
          duration: 0.9,
          ease: WC.ease,
          stagger: 0.085,
          scrollTrigger: {
            trigger: h,
            start: 'top 85%',
            once: true,
            onEnter: function(){ shown = true; }
          }
        });
      }
    });
    splits.push(split);

    // L'occhiello sopra il titolo entra con lui, appena prima: da solo si
    // legge come un'etichetta staccata, insieme fa gruppo.
    var eyebrow = h.previousElementSibling;
    if (eyebrow && eyebrow.classList.contains('eyebrow')) {
      var tw = gsap.from(eyebrow, {
        opacity: 0,
        y: 12,
        duration: 0.6,
        ease: WC.ease,
        scrollTrigger: { trigger: h, start: 'top 85%', once: true }
      });
      splits.push({ revert: function(){
        tw.scrollTrigger && tw.scrollTrigger.kill();
        tw.kill();
        gsap.set(eyebrow, { clearProps: 'opacity,transform' });
      } });
    }
  });

  return function(){
    // revert() rimette il testo originale e uccide il tween creato in onSplit.
    splits.forEach(function(s){ s.revert(); });
    splits.length = 0;
  };
});
